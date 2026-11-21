import { getDb, idList } from '../db/database.js';

const OPEN_STATUSES = ['Todo', 'In Progress', 'Review'];

async function getVisibleProjectIds(db, user) {
  if (user.role === 'Admin') return null;
  const rows = await db.all(
    `SELECT projectId AS id FROM project_members WHERE userId = ?
     UNION
     SELECT id FROM projects WHERE ownerId = ?`,
    [user.id, user.id]
  );
  return rows.map((row) => row.id);
}

export async function getDashboardSummary(user) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const visibleProjectIds = await getVisibleProjectIds(db, user);

  // Optional "AND column IN (...)" fragments that restrict non-admins to their projects.
  const scope = (column) =>
    visibleProjectIds
      ? { sql: `AND ${column} IN (?)`, params: [idList(visibleProjectIds)] }
      : { sql: '', params: [] };
  const projectScope = scope('id');
  const taskScope = scope('projectId');
  const activityScope = scope('a.projectId');

  const [totalProjects, activeProjects, myOpenTasks, overdueTasks, statusRows, priorityRows] = await Promise.all([
    db.get(`SELECT COUNT(*) AS n FROM projects WHERE 1 = 1 ${projectScope.sql}`, projectScope.params),
    db.get(`SELECT COUNT(*) AS n FROM projects WHERE status = 'Active' ${projectScope.sql}`, projectScope.params),
    db.get("SELECT COUNT(*) AS n FROM tasks WHERE assignedTo = ? AND status IN ('Todo', 'In Progress', 'Review')", [
      user.id,
    ]),
    db.get(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE dueDate IS NOT NULL AND dueDate < ? AND status NOT IN ('Completed', 'Cancelled') ${taskScope.sql}`,
      [today, ...taskScope.params]
    ),
    db.all(`SELECT status AS k, COUNT(*) AS count FROM tasks WHERE 1 = 1 ${taskScope.sql} GROUP BY status`, taskScope.params),
    db.all(`SELECT priority AS k, COUNT(*) AS count FROM tasks WHERE 1 = 1 ${taskScope.sql} GROUP BY priority`, taskScope.params),
  ]);

  const tasksByStatus = {
    Todo: 0,
    'In Progress': 0,
    Review: 0,
    Completed: 0,
    Cancelled: 0,
  };
  for (const row of statusRows) tasksByStatus[row.k] = row.count;

  const tasksByPriority = {
    Low: 0,
    Medium: 0,
    High: 0,
    Critical: 0,
  };
  for (const row of priorityRows) tasksByPriority[row.k] = row.count;

  const upcomingTasks = await db.all(
    `SELECT t.id, t.title, t.status, t.priority, t.dueDate, t.projectId,
            p.name AS projectName, u.name AS assigneeName
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.projectId
     LEFT JOIN users u ON u.id = t.assignedTo
     WHERE t.assignedTo = ? AND t.status IN ('Todo', 'In Progress', 'Review')
     ORDER BY COALESCE(t.dueDate, '9999-12-31') ASC, t.createdAt DESC, t.seq DESC
     LIMIT 6`,
    [user.id]
  );

  const recentActivity = await db.all(
    `SELECT a.id, a.taskId, a.projectId, a.action, a.details, a.createdAt,
            u.name AS actorName, u.avatarUrl AS actorAvatar, t.title AS taskTitle
     FROM activity_logs a
     LEFT JOIN users u ON u.id = a.actorId
     LEFT JOIN tasks t ON t.id = a.taskId
     WHERE 1 = 1 ${activityScope.sql}
     ORDER BY a.createdAt DESC, a.seq DESC
     LIMIT 8`,
    activityScope.params
  );

  let teamSummary = null;
  if (user.role === 'Admin' || user.role === 'Manager') {
    const [activeUsers, assignedTasks] = await Promise.all([
      db.all('SELECT id, name, email, role, jobTitle, avatarUrl FROM users WHERE isActive = 1'),
      db.all('SELECT assignedTo, status, dueDate FROM tasks WHERE assignedTo IS NOT NULL'),
    ]);
    const workloads = new Map();
    for (const task of assignedTasks) {
      const workload = workloads.get(task.assignedTo) || { openTasks: 0, completedTasks: 0, overdueTasks: 0 };
      if (OPEN_STATUSES.includes(task.status)) {
        workload.openTasks += 1;
        if (task.dueDate && task.dueDate < today) workload.overdueTasks += 1;
      } else if (task.status === 'Completed') {
        workload.completedTasks += 1;
      }
      workloads.set(task.assignedTo, workload);
    }

    teamSummary = activeUsers
      .map((member) => ({
        ...member,
        ...(workloads.get(member.id) || { openTasks: 0, completedTasks: 0, overdueTasks: 0 }),
      }))
      .sort((left, right) => right.openTasks - left.openTasks || left.name.localeCompare(right.name));
  }

  return {
    metrics: {
      totalProjects: totalProjects.n,
      activeProjects: activeProjects.n,
      myOpenTasks: myOpenTasks.n,
      overdueTasks: overdueTasks.n,
    },
    tasksByStatus,
    tasksByPriority,
    upcomingTasks,
    recentActivity,
    teamSummary,
  };
}
