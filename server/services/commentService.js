import crypto from 'node:crypto';
import { getDb, runInTransaction } from '../db/database.js';
import { emitRealtimeEvent } from './realtime.js';
import { getTaskById } from './taskService.js';

export async function listTaskComments(taskId, user) {
  await getTaskById(taskId, user);
  return getDb().all(
    `SELECT c.id, c.taskId, c.authorId, c.content, c.createdAt, c.updatedAt,
            u.name AS authorName, u.email AS authorEmail, u.role AS authorRole, u.avatarUrl AS authorAvatar
     FROM comments c
     LEFT JOIN users u ON u.id = c.authorId
     WHERE c.taskId = ?
     ORDER BY c.createdAt ASC, c.seq ASC`,
    [taskId]
  );
}

export async function addTaskComment(taskId, user, content) {
  const task = await getTaskById(taskId, user);
  const commentId = `cmt_${crypto.randomUUID().slice(0, 10)}`;
  const now = new Date().toISOString();
  const created = {
    id: commentId,
    taskId,
    authorId: user.id,
    content,
    createdAt: now,
    updatedAt: now,
    authorName: user.name,
    authorEmail: user.email,
    authorRole: user.role,
    authorAvatar: user.avatarUrl,
  };

  const db = getDb();
  await runInTransaction(async (conn) => {
    await db.insert(
      'comments',
      { id: commentId, taskId, authorId: user.id, content, createdAt: now, updatedAt: now },
      conn
    );
    await db.insert(
      'activity_logs',
      {
        id: `act_${crypto.randomUUID().slice(0, 10)}`,
        taskId,
        projectId: task.projectId,
        actorId: user.id,
        action: 'COMMENT_ADDED',
        details: 'Posted a comment on the task',
        createdAt: now,
      },
      conn
    );
  });

  emitRealtimeEvent('comment:created', created);
  return created;
}

export async function listTaskActivity(taskId, user) {
  await getTaskById(taskId, user);
  return getDb().all(
    `SELECT a.id, a.taskId, a.projectId, a.actorId, a.action, a.details, a.createdAt,
            u.name AS actorName, u.email AS actorEmail, u.role AS actorRole, u.avatarUrl AS actorAvatar
     FROM activity_logs a
     LEFT JOIN users u ON u.id = a.actorId
     WHERE a.taskId = ?
     ORDER BY a.createdAt DESC, a.seq DESC`,
    [taskId]
  );
}
