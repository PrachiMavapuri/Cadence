import { getDb } from '../db/database.js';
import { AppError } from '../utils/AppError.js';

const PUBLIC_USER_COLUMNS = 'id, name, email, role, authProvider, avatarUrl, jobTitle, isActive, createdAt';

export async function listUsers(actor) {
  // Members do not receive the sign-in provider column.
  const providerColumn = actor.role === 'Member' ? '' : 'u.authProvider,';
  return getDb().all(
    `SELECT u.id, u.name, u.email, u.role, ${providerColumn} u.avatarUrl, u.jobTitle, u.isActive, u.createdAt,
       (SELECT COUNT(*) FROM project_members pm WHERE pm.userId = u.id) AS projectCount,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignedTo = u.id AND t.status IN ('Todo', 'In Progress', 'Review')) AS openTaskCount,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignedTo = u.id AND t.status = 'Completed') AS completedTaskCount
     FROM users u
     ORDER BY CASE u.role WHEN 'Admin' THEN 1 WHEN 'Manager' THEN 2 ELSE 3 END, u.name`
  );
}

export async function updateUserRole(targetUserId, nextRole, actor) {
  if (actor.role !== 'Admin') {
    throw new AppError('Only Administrators can change user roles.', 403, 'FORBIDDEN');
  }

  const db = getDb();
  const target = await db.get('SELECT id, role FROM users WHERE id = ?', [targetUserId]);
  if (!target) {
    throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
  }

  if (target.role === 'Admin' && nextRole !== 'Admin') {
    const { n: adminCount } = await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'Admin' AND isActive = 1");
    if (adminCount <= 1) {
      throw new AppError(
        'Cannot demote the only active Administrator in the workspace.',
        400,
        'LAST_ADMIN_PROTECTION'
      );
    }
  }

  await db.run('UPDATE users SET role = ?, updatedAt = ? WHERE id = ?', [
    nextRole,
    new Date().toISOString(),
    targetUserId,
  ]);

  return db.get(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`, [targetUserId]);
}

export async function updateUserStatus(targetUserId, isActive, actor) {
  if (actor.role !== 'Admin') {
    throw new AppError('Only Administrators can activate or deactivate user accounts.', 403, 'FORBIDDEN');
  }

  if (targetUserId === actor.id && !isActive) {
    throw new AppError('You cannot deactivate your own Administrator account.', 400, 'SELF_DEACTIVATION_BLOCKED');
  }

  const db = getDb();
  const target = await db.get('SELECT id FROM users WHERE id = ?', [targetUserId]);
  if (!target) {
    throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
  }

  await db.run('UPDATE users SET isActive = ?, updatedAt = ? WHERE id = ?', [
    isActive ? 1 : 0,
    new Date().toISOString(),
    targetUserId,
  ]);

  return db.get(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`, [targetUserId]);
}
