import crypto from 'node:crypto';
import { getDb, runInTransaction, idList, likeTerm } from '../db/database.js';
import { AppError } from '../utils/AppError.js';
import { assertProjectAccess } from './projectService.js';
import { emitRealtimeEvent } from './realtime.js';

const TASK_SORT_FIELDS = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title', 'orderIndex'];
const TASK_COLUMNS =
  't.id, t.title, t.description, t.projectId, t.assignedTo, t.createdBy, t.priority, t.status, t.dueDate, t.labels, t.orderIndex, t.createdAt, t.updatedAt';

// Labels are stored as a JSON string in a TEXT column.
function parseLabels(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatTask(row) {
  if (!row) return null;
  return { ...row, labels: parseLabels(row.labels) };
}

async function decorateTasks(rows) {
  if (rows.length === 0) return [];
  const db = getDb();
  const projectIds = Array.from(new Set(rows.map((task) => task.projectId)));
  const userIds = Array.from(
    new Set(rows.flatMap((task) => [task.assignedTo, task.createdBy].filter(Boolean)))
  );
  const taskIds = rows.map((task) => task.id);

  const [projects, users, commentCounts] = await Promise.all([
    db.all('SELECT id, name FROM projects WHERE id IN (?)', [idList(projectIds)]),
    db.all('SELECT id, name, email, avatarUrl FROM users WHERE id IN (?)', [idList(userIds)]),
    db.all('SELECT taskId, COUNT(*) AS count FROM comments WHERE taskId IN (?) GROUP BY taskId', [idList(taskIds)]),
  ]);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const commentsByTaskId = new Map(commentCounts.map((comment) => [comment.taskId, comment.count]));

  return rows.map((task) => {
    const assignee = usersById.get(task.assignedTo);
    const creator = usersById.get(task.createdBy);
    return formatTask({
      ...task,
      projectName: projectsById.get(task.projectId)?.name,
      assigneeName: assignee?.name,
      assigneeEmail: assignee?.email,
      assigneeAvatar: assignee?.avatarUrl,
      creatorName: creator?.name,
      commentCount: commentsByTaskId.get(task.id) || 0,
    });
  });
}

async function recordActivity(conn, params) {
  await getDb().insert(
    'activity_logs',
    {
      id: `act_${crypto.randomUUID().slice(0, 10)}`,
      taskId: params.taskId,
      projectId: params.projectId,
      actorId: params.actorId,
      action: params.action,
      details: params.details,
      createdAt: new Date().toISOString(),
    },
    conn
  );
}

async function assertAssigneeIsProjectMember(projectId, assigneeId, conn = undefined) {
  if (!assigneeId) return null;
  const user = await getDb().get(
    `SELECT u.id, u.name FROM project_members pm
     JOIN users u ON u.id = pm.userId
     WHERE pm.projectId = ? AND pm.userId = ? AND u.isActive = 1`,
    [projectId, assigneeId],
    conn
  );

  if (!user) {
    throw new AppError(
      'Tasks can only be assigned to active members of the selected project.',
      400,
      'ASSIGNEE_NOT_PROJECT_MEMBER',
      { assignedTo: ['Assignee must be a member of the project'] }
    );
  }
  return user.name;
}

function validateCompletionBusinessRules(taskState) {
  if (taskState.status !== 'Completed') return;

  if (taskState.previousStatus === 'Cancelled') {
    throw new AppError(
      'Cancelled tasks cannot be marked Completed directly. Reopen to Todo or In Progress first.',
      422,
      'INVALID_STATUS_TRANSITION',
      { status: ['Reopen cancelled task before completing'] }
    );
  }

  const errors = {};
  if (!taskState.description || taskState.description.trim().length < 10) {
    errors.description = ['A detailed description (at least 10 characters) is required before completing a task'];
  }
  if (!taskState.assignedTo) {
    errors.assignedTo = ['An assignee is required before a task can be marked Completed'];
  }

  if (Object.keys(errors).length > 0) {
    throw new AppError(
      'Task cannot be marked Completed until it has an assignee and a description of at least 10 characters.',
      422,
      'COMPLETION_RULE_FAILED',
      errors
    );
  }
}

async function getVisibleProjectIds(user) {
  if (user.role === 'Admin') return null;
  const rows = await getDb().all(
    `SELECT projectId AS id FROM project_members WHERE userId = ?
     UNION
     SELECT id FROM projects WHERE ownerId = ?`,
    [user.id, user.id]
  );
  return rows.map((row) => row.id);
}

export async function listTasks(user, query) {
  const db = getDb();
  const where = ['1 = 1'];
  const params = [];

  if (query.projectId) {
    await assertProjectAccess(query.projectId, user);
    where.push('t.projectId = ?');
    params.push(query.projectId);
  } else if (user.role !== 'Admin') {
    where.push('t.projectId IN (?)');
    params.push(idList(await getVisibleProjectIds(user)));
  }

  if (query.assignedTo === 'me') {
    where.push('t.assignedTo = ?');
    params.push(user.id);
  } else if (query.assignedTo === 'unassigned') {
    where.push('t.assignedTo IS NULL');
  } else if (query.assignedTo) {
    where.push('t.assignedTo = ?');
    params.push(query.assignedTo);
  }
  if (query.status) {
    where.push('t.status = ?');
    params.push(query.status);
  }
  if (query.priority) {
    where.push('t.priority = ?');
    params.push(query.priority);
  }

  if (query.overdue === 'true') {
    where.push("t.dueDate IS NOT NULL AND t.dueDate < ? AND t.status NOT IN ('Completed', 'Cancelled')");
    params.push(new Date().toISOString().slice(0, 10));
  }
  if (query.q) {
    const term = likeTerm(query.q);
    where.push('(t.title LIKE ? OR t.description LIKE ? OR t.labels LIKE ?)');
    params.push(term, term, term);
  }
  const clause = `WHERE ${where.join(' AND ')}`;

  const { total } = await db.get(`SELECT COUNT(*) AS total FROM tasks t ${clause}`, params);
  const sortBy = TASK_SORT_FIELDS.includes(query.sortBy) ? query.sortBy : 'createdAt';
  const direction = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const sortExpression =
    sortBy === 'dueDate'
      ? "COALESCE(t.dueDate, '9999-12-31')"
      : sortBy === 'priority'
        ? "CASE t.priority WHEN 'Critical' THEN 4 WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 ELSE 1 END"
        : `t.\`${sortBy}\``;
  const orderBy =
    sortBy === 'createdAt'
      ? `${sortExpression} ${direction}, t.seq ${direction}`
      : `${sortExpression} ${direction}, t.createdAt DESC, t.seq DESC`;

  const rows = await db.all(
    `SELECT ${TASK_COLUMNS} FROM tasks t ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, query.limit, (query.page - 1) * query.limit]
  );

  return {
    items: await decorateTasks(rows),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getTaskById(taskId, user) {
  const db = getDb();
  const row = await db.get(`SELECT ${TASK_COLUMNS} FROM tasks t WHERE t.id = ?`, [taskId]);
  if (!row) {
    throw new AppError('Task not found.', 404, 'TASK_NOT_FOUND');
  }

  await assertProjectAccess(row.projectId, user);
  const [task] = await decorateTasks([row]);
  const project = await db.get('SELECT ownerId FROM projects WHERE id = ?', [row.projectId]);
  return { ...task, projectOwnerId: project?.ownerId };
}

export async function createTask(user, input) {
  await assertProjectAccess(input.projectId, user);

  if (user.role === 'Member' && input.assignedTo && input.assignedTo !== user.id) {
    throw new AppError(
      'Members can only assign tasks to themselves. Managers or Admins can assign to teammates.',
      403,
      'FORBIDDEN',
      { assignedTo: ['Members cannot assign tasks to other teammates'] }
    );
  }

  const assigneeName = await assertAssigneeIsProjectMember(input.projectId, input.assignedTo);
  validateCompletionBusinessRules({
    status: input.status,
    description: input.description,
    assignedTo: input.assignedTo,
  });

  const db = getDb();
  const lastTask = await db.get(
    'SELECT orderIndex FROM tasks WHERE projectId = ? AND status = ? ORDER BY orderIndex DESC LIMIT 1',
    [input.projectId, input.status]
  );
  const taskId = `tsk_${crypto.randomUUID().slice(0, 10)}`;
  const now = new Date().toISOString();
  const task = {
    id: taskId,
    title: input.title,
    description: input.description,
    projectId: input.projectId,
    assignedTo: input.assignedTo,
    createdBy: user.id,
    priority: input.priority,
    status: input.status,
    dueDate: input.dueDate || null,
    labels: JSON.stringify(input.labels || []),
    orderIndex: (lastTask?.orderIndex ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  };

  await runInTransaction(async (conn) => {
    await db.insert('tasks', task, conn);
    await recordActivity(conn, {
      taskId,
      projectId: input.projectId,
      actorId: user.id,
      action: 'TASK_CREATED',
      details: `Created task "${input.title}" (${input.priority} priority)`,
    });
    if (input.assignedTo && assigneeName) {
      await recordActivity(conn, {
        taskId,
        projectId: input.projectId,
        actorId: user.id,
        action: 'TASK_ASSIGNED',
        details: `Assigned task to ${assigneeName}`,
      });
    }
  });

  const created = await getTaskById(taskId, user);
  emitRealtimeEvent('task:created', created);
  return created;
}

function assertMemberCanMutateTask(task, user) {
  if (user.role === 'Admin' || user.role === 'Manager') return;
  if (task.assignedTo !== user.id && task.createdBy !== user.id) {
    throw new AppError('You can only modify tasks assigned to you or created by you.', 403, 'FORBIDDEN');
  }
}

export async function updateTask(taskId, user, input) {
  const existing = await getTaskById(taskId, user);
  assertMemberCanMutateTask(existing, user);

  if (input.assignedTo !== undefined && input.assignedTo !== existing.assignedTo && user.role === 'Member') {
    throw new AppError(
      'Only Managers or Admins can reassign tasks.',
      403,
      'FORBIDDEN',
      { assignedTo: ['Only Managers or Admins can reassign tasks'] }
    );
  }

  const nextAssignedTo = input.assignedTo !== undefined ? input.assignedTo : existing.assignedTo;
  const nextDescription = input.description !== undefined ? input.description : existing.description;
  const nextStatus = input.status ?? existing.status;
  const nextPriority = input.priority ?? existing.priority;

  let nextAssigneeName = null;
  if (input.assignedTo !== undefined && input.assignedTo !== existing.assignedTo) {
    nextAssigneeName = await assertAssigneeIsProjectMember(existing.projectId, nextAssignedTo);
  }

  validateCompletionBusinessRules({
    status: nextStatus,
    previousStatus: existing.status,
    description: nextDescription,
    assignedTo: nextAssignedTo,
  });

  const db = getDb();
  const now = new Date().toISOString();
  await runInTransaction(async (conn) => {
    await db.run(
      `UPDATE tasks SET title = ?, description = ?, assignedTo = ?, priority = ?, status = ?,
         dueDate = ?, labels = ?, orderIndex = ?, updatedAt = ?
       WHERE id = ?`,
      [
        input.title ?? existing.title,
        nextDescription,
        nextAssignedTo ?? null,
        nextPriority,
        nextStatus,
        input.dueDate !== undefined ? input.dueDate : existing.dueDate,
        JSON.stringify(input.labels !== undefined ? input.labels : existing.labels),
        input.orderIndex !== undefined ? input.orderIndex : existing.orderIndex,
        now,
        taskId,
      ],
      conn
    );

    if (input.status && input.status !== existing.status) {
      await recordActivity(conn, {
        taskId,
        projectId: existing.projectId,
        actorId: user.id,
        action: 'STATUS_CHANGED',
        details: `Changed status from ${existing.status} to ${input.status}`,
      });
    }

    if (input.priority && input.priority !== existing.priority) {
      await recordActivity(conn, {
        taskId,
        projectId: existing.projectId,
        actorId: user.id,
        action: 'PRIORITY_CHANGED',
        details: `Changed priority from ${existing.priority} to ${input.priority}`,
      });
    }

    if (input.assignedTo !== undefined && input.assignedTo !== existing.assignedTo) {
      await recordActivity(conn, {
        taskId,
        projectId: existing.projectId,
        actorId: user.id,
        action: 'TASK_ASSIGNED',
        details: nextAssigneeName ? `Reassigned task to ${nextAssigneeName}` : 'Unassigned task',
      });
    }

    if (
      (input.title && input.title !== existing.title) ||
      (input.description !== undefined && input.description !== existing.description) ||
      (input.dueDate !== undefined && input.dueDate !== existing.dueDate)
    ) {
      await recordActivity(conn, {
        taskId,
        projectId: existing.projectId,
        actorId: user.id,
        action: 'TASK_UPDATED',
        details: 'Updated task details',
      });
    }
  });

  const updated = await getTaskById(taskId, user);
  emitRealtimeEvent('task:updated', updated);
  return updated;
}

export async function updateTaskStatus(taskId, user, input) {
  return updateTask(taskId, user, {
    status: input.status,
    orderIndex: input.orderIndex,
  });
}

export async function deleteTask(taskId, user) {
  const existing = await getTaskById(taskId, user);
  if (user.role === 'Member' && existing.createdBy !== user.id) {
    throw new AppError('Only Managers, Admins, or the task creator can delete this task.', 403, 'FORBIDDEN');
  }

  const db = getDb();
  await runInTransaction(async (conn) => {
    await db.run('DELETE FROM activity_logs WHERE taskId = ?', [taskId], conn);
    await db.run('DELETE FROM comments WHERE taskId = ?', [taskId], conn);
    await db.run('DELETE FROM tasks WHERE id = ?', [taskId], conn);
  });

  emitRealtimeEvent('task:deleted', { id: taskId, projectId: existing.projectId });
}
