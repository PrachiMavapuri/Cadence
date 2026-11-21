import crypto from 'node:crypto';
import { getDb, runInTransaction, idList, likeTerm } from '../db/database.js';
import { AppError } from '../utils/AppError.js';
import { emitRealtimeEvent } from './realtime.js';

const PROJECT_SORT_FIELDS = ['createdAt', 'updatedAt', 'dueDate', 'name'];
const PROJECT_COLUMNS =
  'p.id, p.name, p.description, p.ownerId, p.status, p.startDate, p.dueDate, p.createdAt, p.updatedAt';

export async function getProjectMembers(projectId) {
  const members = await getDb().all(
    `SELECT u.id, u.name, u.email, u.role, u.avatarUrl, u.jobTitle, pm.addedAt
     FROM project_members pm
     JOIN users u ON u.id = pm.userId
     WHERE pm.projectId = ?`,
    [projectId]
  );
  return members.sort((left, right) => left.name.localeCompare(right.name));
}

export async function assertProjectAccess(projectId, user) {
  const db = getDb();
  const project = await db.get(`SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = ?`, [projectId]);

  if (!project) {
    throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
  }

  if (user.role === 'Admin' || project.ownerId === user.id) {
    return project;
  }

  const membership = await db.get('SELECT userId FROM project_members WHERE projectId = ? AND userId = ?', [
    projectId,
    user.id,
  ]);
  if (!membership) {
    throw new AppError('You do not have access to this project.', 403, 'FORBIDDEN');
  }

  return project;
}

export async function listProjects(user, query) {
  const db = getDb();
  const where = [];
  const params = [];

  if (user.role !== 'Admin') {
    where.push('(p.ownerId = ? OR p.id IN (SELECT projectId FROM project_members WHERE userId = ?))');
    params.push(user.id, user.id);
  }
  if (query.q) {
    const term = likeTerm(query.q);
    where.push('(p.name LIKE ? OR p.description LIKE ?)');
    params.push(term, term);
  }
  if (query.status) {
    where.push('p.status = ?');
    params.push(query.status);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const { total } = await db.get(`SELECT COUNT(*) AS total FROM projects p ${clause}`, params);
  const sortBy = PROJECT_SORT_FIELDS.includes(query.sortBy) ? query.sortBy : 'createdAt';
  const direction = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const rows = await db.all(
    `SELECT ${PROJECT_COLUMNS} FROM projects p ${clause}
     ORDER BY p.\`${sortBy}\` ${direction}, p.seq ${direction}
     LIMIT ? OFFSET ?`,
    [...params, query.limit, (query.page - 1) * query.limit]
  );

  const items = await Promise.all(
    rows.map(async (project) => {
      const [owner, counts, members] = await Promise.all([
        db.get('SELECT name, email, avatarUrl FROM users WHERE id = ?', [project.ownerId]),
        db.get(
          `SELECT
             (SELECT COUNT(*) FROM tasks WHERE projectId = ?) AS taskCount,
             (SELECT COUNT(*) FROM tasks WHERE projectId = ? AND status = 'Completed') AS completedTaskCount,
             (SELECT COUNT(*) FROM project_members WHERE projectId = ?) AS memberCount`,
          [project.id, project.id, project.id]
        ),
        getProjectMembers(project.id),
      ]);

      return {
        ...project,
        ownerName: owner?.name,
        ownerEmail: owner?.email,
        ownerAvatar: owner?.avatarUrl,
        taskCount: counts.taskCount,
        completedTaskCount: counts.completedTaskCount,
        memberCount: counts.memberCount,
        members,
      };
    })
  );

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getProjectById(projectId, user) {
  const project = await assertProjectAccess(projectId, user);
  const db = getDb();

  const [owner, stats, members] = await Promise.all([
    db.get('SELECT id, name, email, role, avatarUrl, jobTitle FROM users WHERE id = ?', [project.ownerId]),
    db.get(
      `SELECT
         (SELECT COUNT(*) FROM tasks WHERE projectId = ?) AS totalTasks,
         (SELECT COUNT(*) FROM tasks WHERE projectId = ? AND status = 'Completed') AS completedTasks,
         (SELECT COUNT(*) FROM tasks WHERE projectId = ? AND status IN ('Todo', 'In Progress', 'Review')) AS openTasks`,
      [projectId, projectId, projectId]
    ),
    getProjectMembers(projectId),
  ]);

  return {
    ...project,
    owner: owner ?? null,
    members,
    stats: {
      totalTasks: stats.totalTasks,
      completedTasks: stats.completedTasks,
      openTasks: stats.openTasks,
    },
  };
}

async function validateProjectMembers(memberIds, conn) {
  const activeUsers = await getDb().all(
    'SELECT id FROM users WHERE id IN (?) AND isActive = 1',
    [idList(memberIds)],
    conn
  );
  if (activeUsers.length !== memberIds.length) {
    const activeIds = new Set(activeUsers.map((user) => user.id));
    const invalidId = memberIds.find((id) => !activeIds.has(id));
    throw new AppError(
      `Selected team member (${invalidId}) does not exist or is inactive.`,
      400,
      'INVALID_MEMBER'
    );
  }
}

export async function createProject(user, input) {
  const db = getDb();
  const projectId = `prj_${crypto.randomUUID().slice(0, 10)}`;
  const now = new Date().toISOString();
  const uniqueMemberIds = Array.from(new Set([user.id, ...input.memberIds]));

  await validateProjectMembers(uniqueMemberIds);
  await runInTransaction(async (conn) => {
    await db.insert(
      'projects',
      {
        id: projectId,
        name: input.name,
        description: input.description,
        ownerId: user.id,
        status: input.status,
        startDate: input.startDate,
        dueDate: input.dueDate,
        createdAt: now,
        updatedAt: now,
      },
      conn
    );
    await db.insertMany(
      'project_members',
      uniqueMemberIds.map((userId) => ({ projectId, userId, addedAt: now })),
      conn
    );
  });

  const created = await getProjectById(projectId, user);
  emitRealtimeEvent('project:updated', { projectId, action: 'created' });
  return created;
}

export async function updateProject(projectId, user, input) {
  const project = await assertProjectAccess(projectId, user);
  if (user.role === 'Member' && project.ownerId !== user.id) {
    throw new AppError('Only Managers, Admins, or the project owner can edit project settings.', 403, 'FORBIDDEN');
  }

  const nextStart = input.startDate ?? project.startDate;
  const nextDue = input.dueDate ?? project.dueDate;
  if (new Date(nextDue) < new Date(nextStart)) {
    throw new AppError('Due date must be on or after the start date.', 400, 'VALIDATION_ERROR', {
      dueDate: ['Due date must be on or after the start date'],
    });
  }

  const db = getDb();
  const now = new Date().toISOString();
  await runInTransaction(async (conn) => {
    await db.run(
      'UPDATE projects SET name = ?, description = ?, status = ?, startDate = ?, dueDate = ?, updatedAt = ? WHERE id = ?',
      [
        input.name ?? project.name,
        input.description ?? project.description,
        input.status ?? project.status,
        nextStart,
        nextDue,
        now,
        projectId,
      ],
      conn
    );

    if (input.memberIds) {
      if (user.role === 'Member') {
        throw new AppError('Only Managers or Admins can update project membership.', 403, 'FORBIDDEN');
      }
      const nextMembers = Array.from(new Set([project.ownerId, ...input.memberIds]));
      await validateProjectMembers(nextMembers, conn);

      await db.run(
        'UPDATE tasks SET assignedTo = NULL, updatedAt = ? WHERE projectId = ? AND assignedTo IS NOT NULL AND assignedTo NOT IN (?)',
        [now, projectId, idList(nextMembers)],
        conn
      );
      await db.run('DELETE FROM project_members WHERE projectId = ?', [projectId], conn);
      await db.insertMany(
        'project_members',
        nextMembers.map((userId) => ({ projectId, userId, addedAt: now })),
        conn
      );
    }
  });

  const updated = await getProjectById(projectId, user);
  emitRealtimeEvent('project:updated', { projectId, action: 'updated' });
  return updated;
}

export async function addProjectMember(projectId, userIdToAdd, actor) {
  if (actor.role !== 'Admin' && actor.role !== 'Manager') {
    throw new AppError('Only Managers or Admins can add project members.', 403, 'FORBIDDEN');
  }
  await assertProjectAccess(projectId, actor);

  const db = getDb();
  const targetUser = await db.get('SELECT id, isActive FROM users WHERE id = ?', [userIdToAdd]);
  if (!targetUser || !targetUser.isActive) {
    throw new AppError('User not found or inactive.', 404, 'USER_NOT_FOUND');
  }

  const now = new Date().toISOString();
  await runInTransaction(async (conn) => {
    await db.run(
      'INSERT IGNORE INTO project_members (projectId, userId, addedAt) VALUES (?, ?, ?)',
      [projectId, userIdToAdd, now],
      conn
    );
    await db.run('UPDATE projects SET updatedAt = ? WHERE id = ?', [now, projectId], conn);
  });

  emitRealtimeEvent('project:updated', { projectId, action: 'member_added' });
  return getProjectById(projectId, actor);
}

export async function removeProjectMember(projectId, userIdToRemove, actor) {
  if (actor.role !== 'Admin' && actor.role !== 'Manager') {
    throw new AppError('Only Managers or Admins can remove project members.', 403, 'FORBIDDEN');
  }
  const project = await assertProjectAccess(projectId, actor);

  if (userIdToRemove === project.ownerId) {
    throw new AppError('Cannot remove the project owner from the project.', 400, 'CANNOT_REMOVE_OWNER');
  }

  const db = getDb();
  const now = new Date().toISOString();
  await runInTransaction(async (conn) => {
    await db.run('DELETE FROM project_members WHERE projectId = ? AND userId = ?', [projectId, userIdToRemove], conn);
    await db.run(
      'UPDATE tasks SET assignedTo = NULL, updatedAt = ? WHERE projectId = ? AND assignedTo = ?',
      [now, projectId, userIdToRemove],
      conn
    );
    await db.run('UPDATE projects SET updatedAt = ? WHERE id = ?', [now, projectId], conn);
  });

  emitRealtimeEvent('project:updated', { projectId, action: 'member_removed' });
  return getProjectById(projectId, actor);
}

export async function deleteProject(projectId, user) {
  const project = await assertProjectAccess(projectId, user);
  if (user.role === 'Member' && project.ownerId !== user.id) {
    throw new AppError('Only Managers, Admins, or the project owner can delete a project.', 403, 'FORBIDDEN');
  }

  const db = getDb();
  await runInTransaction(async (conn) => {
    const tasks = await db.all('SELECT id FROM tasks WHERE projectId = ?', [projectId], conn);
    const taskIds = tasks.map((task) => task.id);
    await db.run('DELETE FROM activity_logs WHERE projectId = ?', [projectId], conn);
    await db.run('DELETE FROM comments WHERE taskId IN (?)', [idList(taskIds)], conn);
    await db.run('DELETE FROM tasks WHERE projectId = ?', [projectId], conn);
    await db.run('DELETE FROM project_members WHERE projectId = ?', [projectId], conn);
    await db.run('DELETE FROM projects WHERE id = ?', [projectId], conn);
  });

  emitRealtimeEvent('project:deleted', { projectId });
}
