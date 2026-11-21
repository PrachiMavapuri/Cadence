import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

let pool = null;
let databaseName = null;

// TINYINT(1) columns (isActive) come back as real booleans.
const typeCast = (field, next) =>
  field.type === 'TINY' && field.length === 1 ? field.string() === '1' : next();

export async function initDb({ database = env.MYSQL_DATABASE, seed = true } = {}) {
  if (pool) await closeDb();
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('MYSQL_DATABASE may only contain letters, numbers and underscores.');
  }

  const base = {
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    charset: 'utf8mb4',
  };

  const bootstrap = await mysql.createConnection(base);
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await bootstrap.end();
  }

  pool = mysql.createPool({
    ...base,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    typeCast,
  });
  databaseName = database;

  try {
    await createSchema();
    if (seed) await seedIfEmpty(getDb());
    return getDb();
  } catch (error) {
    await closeDb();
    throw error;
  }
}

async function all(sql, params = [], conn) {
  const [rows] = await (conn || pool).query(sql, params);
  return rows;
}

async function get(sql, params = [], conn) {
  const rows = await all(sql, params, conn);
  return rows[0];
}

async function run(sql, params = [], conn) {
  const [result] = await (conn || pool).query(sql, params);
  return result;
}

async function insertMany(table, rows, conn) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const sql = `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES ?`;
  await run(sql, [rows.map((row) => columns.map((c) => row[c] ?? null))], conn);
}

export function getDb() {
  if (!pool) {
    throw new Error('MySQL is not connected. Call initDb() before accessing the database.');
  }
  return {
    all,
    get,
    run,
    insertMany,
    insert: (table, row, conn) => insertMany(table, [row], conn),
    dropDatabase: () => pool.query(`DROP DATABASE IF EXISTS \`${databaseName}\``),
  };
}

export async function closeDb() {
  if (pool) await pool.end();
  pool = null;
  databaseName = null;
}

// Runs callback(conn) inside one MySQL transaction; commits on success, rolls back on any error.
export async function runInTransaction(callback) {
  if (!pool) throw new Error('MySQL is not connected. Call initDb() before starting a transaction.');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// Helpers for building SQL safely.
export const idList = (ids) => (ids.length > 0 ? ids : [null]); // IN (NULL) matches nothing
export const likeTerm = (value) => `%${String(value).replace(/[\\%_]/g, '\\$&')}%`;

const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    email VARCHAR(255) NOT NULL,
    passwordHash VARCHAR(100) NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'Member',
    authProvider VARCHAR(20) NOT NULL DEFAULT 'local',
    providerId VARCHAR(191) NULL,
    avatarUrl MEDIUMTEXT NULL,
    jobTitle VARCHAR(200) NULL,
    isActive TINYINT(1) NOT NULL DEFAULT 1,
    createdAt VARCHAR(32) NOT NULL,
    updatedAt VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_provider (authProvider, providerId)
  )`,
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id VARCHAR(60) NOT NULL PRIMARY KEY,
    userId VARCHAR(40) NOT NULL,
    tokenHash CHAR(64) NOT NULL,
    expiresAt VARCHAR(32) NOT NULL,
    createdAt VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_refresh_hash (tokenHash),
    KEY idx_refresh_user (userId),
    CONSTRAINT fk_refresh_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    seq BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    ownerId VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    startDate VARCHAR(32) NULL,
    dueDate VARCHAR(32) NULL,
    createdAt VARCHAR(32) NOT NULL,
    updatedAt VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_projects_seq (seq),
    KEY idx_projects_owner (ownerId),
    KEY idx_projects_status (status),
    CONSTRAINT fk_projects_owner FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS project_members (
    projectId VARCHAR(40) NOT NULL,
    userId VARCHAR(40) NOT NULL,
    addedAt VARCHAR(32) NOT NULL,
    PRIMARY KEY (projectId, userId),
    KEY idx_members_user (userId),
    CONSTRAINT fk_members_project FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_members_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    seq BIGINT NOT NULL AUTO_INCREMENT,
    title VARCHAR(500) NOT NULL,
    description TEXT NULL,
    projectId VARCHAR(40) NOT NULL,
    assignedTo VARCHAR(40) NULL,
    createdBy VARCHAR(40) NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
    status VARCHAR(20) NOT NULL DEFAULT 'Todo',
    dueDate VARCHAR(32) NULL,
    labels TEXT NULL,
    orderIndex INT NOT NULL DEFAULT 0,
    createdAt VARCHAR(32) NOT NULL,
    updatedAt VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_tasks_seq (seq),
    KEY idx_tasks_project (projectId),
    KEY idx_tasks_assigned (assignedTo),
    KEY idx_tasks_status (status),
    KEY idx_tasks_due (dueDate),
    CONSTRAINT fk_tasks_project FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignedTo) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_tasks_creator FOREIGN KEY (createdBy) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    seq BIGINT NOT NULL AUTO_INCREMENT,
    taskId VARCHAR(40) NOT NULL,
    authorId VARCHAR(40) NOT NULL,
    content TEXT NOT NULL,
    createdAt VARCHAR(32) NOT NULL,
    updatedAt VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_comments_seq (seq),
    KEY idx_comments_task (taskId),
    CONSTRAINT fk_comments_task FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_author FOREIGN KEY (authorId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS activity_logs (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    seq BIGINT NOT NULL AUTO_INCREMENT,
    taskId VARCHAR(40) NOT NULL,
    projectId VARCHAR(40) NOT NULL,
    actorId VARCHAR(40) NOT NULL,
    action VARCHAR(40) NOT NULL,
    details TEXT NULL,
    createdAt VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_activity_seq (seq),
    KEY idx_activity_task (taskId),
    KEY idx_activity_project (projectId),
    CONSTRAINT fk_activity_task FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_activity_project FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_activity_actor FOREIGN KEY (actorId) REFERENCES users(id)
  )`,
];

async function createSchema() {
  for (const statement of TABLES) await pool.query(statement);
}

function isoOffsetDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function seedIfEmpty(db) {
  const existing = await db.get('SELECT COUNT(*) AS n FROM users');
  if (existing.n > 0) return;

  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync('Password123!', 10);
  const users = [
    {
      id: 'usr_admin_elena',
      name: 'Elena Vance',
      email: 'admin@cadence.dev',
      passwordHash,
      role: 'Admin',
      authProvider: 'local',
      providerId: null,
      avatarUrl: '/src/assets/images/avatar_admin_elena_1795191954571.jpg',
      jobTitle: 'VP of Engineering',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'usr_mgr_marcus',
      name: 'Marcus Thorne',
      email: 'manager@cadence.dev',
      passwordHash,
      role: 'Manager',
      authProvider: 'local',
      providerId: null,
      avatarUrl: '/src/assets/images/avatar_manager_marcus_1795191954338.jpg',
      jobTitle: 'Engineering Manager',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'usr_mem_priya',
      name: 'Priya Nair',
      email: 'member@cadence.dev',
      passwordHash,
      role: 'Member',
      authProvider: 'local',
      providerId: null,
      avatarUrl: '/src/assets/images/avatar_member_priya_1795191953989.jpg',
      jobTitle: 'Senior Full-Stack Engineer',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'usr_mem_liam',
      name: 'Liam O’Connor',
      email: 'liam@cadence.dev',
      passwordHash,
      role: 'Member',
      authProvider: 'local',
      providerId: null,
      avatarUrl: '',
      jobTitle: 'Platform & QA Engineer',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const projects = [
    {
      id: 'prj_core_api',
      name: 'Core Gateway v3 Migration',
      description:
        'Consolidate authentication, rate-limiting, and zero-downtime webhook ingestion across primary European and North American clusters.',
      ownerId: 'usr_mgr_marcus',
      status: 'Active',
      startDate: isoOffsetDays(-14),
      dueDate: isoOffsetDays(21),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prj_billing_portal',
      name: 'Enterprise Billing & Audit Portal',
      description:
        'Self-serve invoice ledger, seat allocation controls, and SOC-2 compliant export workflows for enterprise workspace administrators.',
      ownerId: 'usr_admin_elena',
      status: 'Active',
      startDate: isoOffsetDays(-7),
      dueDate: isoOffsetDays(35),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'prj_design_tokens',
      name: 'Design System Token Alignment',
      description:
        'Standardize typography scales, tabular numeral rules, and high-contrast form primitives across all customer-facing surfaces.',
      ownerId: 'usr_mgr_marcus',
      status: 'Planning',
      startDate: isoOffsetDays(2),
      dueDate: isoOffsetDays(45),
      createdAt: now,
      updatedAt: now,
    },
  ];

  const memberships = [
    ['prj_core_api', 'usr_mgr_marcus'],
    ['prj_core_api', 'usr_mem_priya'],
    ['prj_core_api', 'usr_mem_liam'],
    ['prj_core_api', 'usr_admin_elena'],
    ['prj_billing_portal', 'usr_admin_elena'],
    ['prj_billing_portal', 'usr_mgr_marcus'],
    ['prj_billing_portal', 'usr_mem_priya'],
    ['prj_design_tokens', 'usr_mgr_marcus'],
    ['prj_design_tokens', 'usr_mem_liam'],
  ].map(([projectId, userId]) => ({ projectId, userId, addedAt: now }));

  const tasks = [
    {
      id: 'tsk_jwt_rotation',
      title: 'Implement refresh token rotation with httpOnly cookies',
      description:
        'Rotate refresh tokens on every /api/auth/refresh call and revoke compromised token families immediately upon reuse detection.',
      projectId: 'prj_core_api',
      assignedTo: 'usr_mem_priya',
      createdBy: 'usr_mgr_marcus',
      priority: 'Critical',
      status: 'In Progress',
      dueDate: isoOffsetDays(2),
      labels: ['security', 'auth', 'backend'],
      orderIndex: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tsk_rate_limiter',
      title: 'Configure sliding-window rate limiter on public endpoints',
      description:
        'Enforce strict per-IP and per-tenant quotas on login, register, and OAuth callback routes with standard Retry-After headers.',
      projectId: 'prj_core_api',
      assignedTo: 'usr_mem_liam',
      createdBy: 'usr_mgr_marcus',
      priority: 'High',
      status: 'Todo',
      dueDate: isoOffsetDays(-2),
      labels: ['gateway', 'reliability'],
      orderIndex: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tsk_webhook_retry',
      title: 'Add exponential backoff queue for failed webhook deliveries',
      description:
        'Persist delivery attempt timestamps and surface dead-letter alerts in the operations overview when 5 consecutive retries fail.',
      projectId: 'prj_core_api',
      assignedTo: 'usr_mem_priya',
      createdBy: 'usr_admin_elena',
      priority: 'High',
      status: 'Review',
      dueDate: isoOffsetDays(4),
      labels: ['webhooks', 'infra'],
      orderIndex: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tsk_schema_audit',
      title: 'Verify foreign key cascade rules on project archival',
      description:
        'Run automated integration suite ensuring deleting or archiving a project preserves referential integrity and cleans up orphaned tasks.',
      projectId: 'prj_core_api',
      assignedTo: 'usr_mem_liam',
      createdBy: 'usr_mgr_marcus',
      priority: 'Medium',
      status: 'Completed',
      dueDate: isoOffsetDays(-1),
      labels: ['database', 'testing'],
      orderIndex: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tsk_invoice_pdf',
      title: 'Build tabular PDF statement generator for monthly billing',
      description:
        'Render multi-currency line items using tabular numerals and include VAT registration IDs for EU enterprise tenants.',
      projectId: 'prj_billing_portal',
      assignedTo: 'usr_mem_priya',
      createdBy: 'usr_admin_elena',
      priority: 'High',
      status: 'Todo',
      dueDate: isoOffsetDays(5),
      labels: ['billing', 'pdf'],
      orderIndex: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tsk_seat_proration',
      title: 'Calculate mid-cycle seat proration ledger entries',
      description:
        'Compute exact daily prorated credit or debit whenever an administrator upgrades or removes a workspace member seat.',
      projectId: 'prj_billing_portal',
      assignedTo: 'usr_mgr_marcus',
      createdBy: 'usr_admin_elena',
      priority: 'Medium',
      status: 'In Progress',
      dueDate: isoOffsetDays(7),
      labels: ['billing', 'math'],
      orderIndex: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tsk_soc2_export',
      title: 'Export immutable role-change audit CSV for compliance',
      description:
        'Allow workspace Admins to export timestamped role elevation and deactivation records over any 90-day date range.',
      projectId: 'prj_billing_portal',
      assignedTo: 'usr_admin_elena',
      createdBy: 'usr_admin_elena',
      priority: 'Low',
      status: 'Todo',
      dueDate: isoOffsetDays(12),
      labels: ['compliance', 'audit'],
      orderIndex: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tsk_form_contrast',
      title: 'Audit WCAG AA contrast across validation error states',
      description:
        'Verify all form inputs, focus rings, and inline field error messages meet 4.5:1 minimum contrast ratios on light surfaces.',
      projectId: 'prj_design_tokens',
      assignedTo: 'usr_mem_liam',
      createdBy: 'usr_mgr_marcus',
      priority: 'Medium',
      status: 'Todo',
      dueDate: isoOffsetDays(9),
      labels: ['a11y', 'ui'],
      orderIndex: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const activities = [];
  for (const task of tasks) {
    activities.push({
      id: `act_${crypto.randomUUID().slice(0, 8)}`,
      taskId: task.id,
      projectId: task.projectId,
      actorId: task.createdBy,
      action: 'TASK_CREATED',
      details: `Created task "${task.title}" with ${task.priority} priority`,
      createdAt: now,
    });
    if (task.assignedTo) {
      const assignee = users.find((user) => user.id === task.assignedTo);
      activities.push({
        id: `act_${crypto.randomUUID().slice(0, 8)}`,
        taskId: task.id,
        projectId: task.projectId,
        actorId: task.createdBy,
        action: 'TASK_ASSIGNED',
        details: `Assigned task to ${assignee?.name ?? 'Member'}`,
        createdAt: now,
      });
    }
  }

  const comments = [
    {
      id: 'cmt_seed_1',
      taskId: 'tsk_jwt_rotation',
      authorId: 'usr_mgr_marcus',
      content:
        'Make sure SameSite=None and Secure flags are enforced when running inside the HTTPS preview iframe.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'cmt_seed_2',
      taskId: 'tsk_jwt_rotation',
      authorId: 'usr_mem_priya',
      content: 'Confirmed—cookie flags are configured and refresh token hashes are persisted in MySQL.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  await runInTransaction(async (conn) => {
    await db.insertMany('users', users, conn);
    await db.insertMany('projects', projects, conn);
    await db.insertMany('project_members', memberships, conn);
    await db.insertMany('tasks', tasks.map((task) => ({ ...task, labels: JSON.stringify(task.labels) })), conn);
    await db.insertMany('activity_logs', activities, conn);
    await db.insertMany('comments', comments, conn);
  });
}
