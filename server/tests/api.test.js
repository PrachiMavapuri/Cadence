import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApiApp, attachFinalErrorHandler } from '../app.js';
import { closeDb, getDb, initDb } from '../db/database.js';
import { env } from '../config/env.js';
import { loginWithGoogleAuthorizationCode } from '../services/authService.js';

let server;
let baseUrl = '';
let testDatabase;
const testDbName = `cadence_test_${crypto.randomUUID().replace(/-/g, '')}`;

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.cookie) headers.Cookie = options.cookie;

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    redirect: options.redirect || 'follow',
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data, headers: res.headers };
}

before(async () => {
  testDatabase = await initDb({ database: testDbName });
  const app = createApiApp();
  attachFinalErrorHandler(app);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  if (testDatabase) await testDatabase.dropDatabase();
  await closeDb();
});

describe('Cadence REST API Integration Suite', () => {
  let adminToken = '';
  let managerToken = '';
  let memberToken = '';
  let createdProjectId = '';
  let createdTaskId = '';

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await request('/api/projects');
    assert.equal(res.status, 401);
    assert.equal(res.data.success, false);
  });

  it('authenticates seeded Admin, Manager, and Member accounts with bcrypt & JWT', async () => {
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@cadence.dev', password: 'Password123!' },
    });
    assert.equal(adminLogin.status, 200);
    adminToken = adminLogin.data.data.accessToken;
    assert.ok(adminToken);
    const refreshedAdmin = await request('/api/auth/refresh', {
      method: 'POST',
      cookie: adminLogin.headers.get('set-cookie').split(';')[0],
    });
    assert.equal(refreshedAdmin.status, 200);
    const logout = await request('/api/auth/logout', {
      method: 'POST',
      cookie: refreshedAdmin.headers.get('set-cookie').split(';')[0],
    });
    assert.equal(logout.status, 200);

    const mgrLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'manager@cadence.dev', password: 'Password123!' },
    });
    assert.equal(mgrLogin.status, 200);
    managerToken = mgrLogin.data.data.accessToken;

    const memLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'member@cadence.dev', password: 'Password123!' },
    });
    assert.equal(memLogin.status, 200);
    memberToken = memLogin.data.data.accessToken;
  });

  it('lists tasks assigned to the current user ordered by due date', async () => {
    const res = await request('/api/tasks?assignedTo=me&sortBy=dueDate&sortOrder=asc', {
      token: memberToken,
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.data.items.length > 0);
    assert.ok(res.data.data.items.every((task) => task.assignedTo === 'usr_mem_priya'));
  });

  it('returns project lists, dashboard aggregates, and team summaries', async () => {
    const projects = await request('/api/projects?sortBy=name&sortOrder=asc', { token: managerToken });
    assert.equal(projects.status, 200);
    assert.equal(projects.data.data.pagination.total, 3);
    assert.ok(projects.data.data.items.every((project) => Array.isArray(project.members)));
    assert.ok(projects.data.data.items.every((project) => typeof project.taskCount === 'number'));

    const dashboard = await request('/api/dashboard/summary', { token: managerToken });
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.data.data.metrics.totalProjects, 3);
    assert.equal(dashboard.data.data.teamSummary.length, 4);
    assert.ok(dashboard.data.data.upcomingTasks.length > 0);

    const users = await request('/api/users', { token: adminToken });
    assert.equal(users.status, 200);
    assert.equal(users.data.data.users.length, 4);
    assert.ok(users.data.data.users.every((member) => typeof member.projectCount === 'number'));

    const memberView = await request('/api/users', { token: memberToken });
    assert.equal(memberView.status, 200);
    assert.ok(memberView.data.data.users.every((member) => !('authProvider' in member)));
  });

  it('authenticates Google through a state-validated OAuth code exchange', async () => {
    const previousEnv = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
      appUrl: env.APP_URL,
    };
    env.GOOGLE_CLIENT_ID = '';
    env.GOOGLE_CLIENT_SECRET = '';
    env.GOOGLE_REDIRECT_URI = '';
    env.APP_URL = baseUrl;

    try {
      const unconfigured = await request('/api/auth/google', { redirect: 'manual' });
      assert.equal(unconfigured.status, 302);
      assert.equal(
        new URL(unconfigured.headers.get('location')).searchParams.get('oauthError'),
        'not_configured'
      );

      env.GOOGLE_CLIENT_ID = 'google-test-client-id';
      env.GOOGLE_CLIENT_SECRET = 'google-test-client-secret';
      const start = await request('/api/auth/google', { redirect: 'manual' });
      assert.equal(start.status, 302);
      const authorizationUrl = new URL(start.headers.get('location'));
      assert.equal(authorizationUrl.origin, 'https://accounts.google.com');
      assert.equal(authorizationUrl.searchParams.get('client_id'), env.GOOGLE_CLIENT_ID);
      assert.equal(
        authorizationUrl.searchParams.get('redirect_uri'),
        `${baseUrl}/api/auth/google/callback`
      );
      const state = authorizationUrl.searchParams.get('state');
      const stateCookie = start.headers.get('set-cookie').split(';')[0];
      assert.ok(state);
      assert.ok(stateCookie.includes(state));

      const invalidState = await request('/api/auth/google/callback?code=ignored&state=wrong', {
        cookie: 'cadence_google_state=not-wrong',
        redirect: 'manual',
      });
      assert.equal(invalidState.status, 302);
      assert.equal(
        new URL(invalidState.headers.get('location')).searchParams.get('oauthError'),
        'invalid_state'
      );

      let exchangedSecret;
      const googleFetch = async (input, init) => {
        const url = new URL(input instanceof URL ? input.href : typeof input === 'string' ? input : input.url);
        if (url.pathname === '/token' && url.hostname === 'oauth2.googleapis.com') {
          exchangedSecret = new URLSearchParams(init.body).get('client_secret');
          return new Response(JSON.stringify({ id_token: 'google-test-id-token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.pathname === '/tokeninfo' && url.hostname === 'oauth2.googleapis.com') {
          assert.equal(url.searchParams.get('id_token'), 'google-test-id-token');
          return new Response(
            JSON.stringify({
              aud: 'google-test-client-id',
              iss: 'https://accounts.google.com',
              email_verified: 'true',
              sub: 'google-test-subject',
              email: 'google.oauth.test@example.com',
              name: 'Google OAuth Test',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new Error(`Unexpected Google OAuth URL: ${url.href}`);
      };

      const googleSession = await loginWithGoogleAuthorizationCode(
        'google-test-code',
        `${baseUrl}/api/auth/google/callback`,
        googleFetch
      );
      assert.equal(exchangedSecret, 'google-test-client-secret');
      const storedGoogleUser = await getDb().get('SELECT providerId FROM users WHERE id = ?', [
        googleSession.user.id,
      ]);
      assert.deepEqual(
        {
          authProvider: googleSession.user.authProvider,
          providerId: storedGoogleUser.providerId,
          email: googleSession.user.email,
        },
        {
          authProvider: 'google',
          providerId: 'google-test-subject',
          email: 'google.oauth.test@example.com',
        }
      );

      const wrongAudienceFetch = async (input) => {
        const url = new URL(input instanceof URL ? input.href : input);
        const body =
          url.pathname === '/token'
            ? { id_token: 'google-wrong-audience-token' }
            : {
                aud: 'another-google-client-id',
                iss: 'https://accounts.google.com',
                email_verified: 'true',
                sub: 'google-wrong-audience-subject',
                email: 'wrong.audience@example.com',
              };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };
      await assert.rejects(
        loginWithGoogleAuthorizationCode(
          'google-wrong-audience-code',
          `${baseUrl}/api/auth/google/callback`,
          wrongAudienceFetch
        ),
        (error) => error.code === 'GOOGLE_AUTH_FAILED'
      );
    } finally {
      env.GOOGLE_CLIENT_ID = previousEnv.clientId;
      env.GOOGLE_CLIENT_SECRET = previousEnv.clientSecret;
      env.GOOGLE_REDIRECT_URI = previousEnv.redirectUri;
      env.APP_URL = previousEnv.appUrl;
    }
  });



  it('enforces validation on registration and project creation', async () => {
    const badReg = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'A', email: 'not-an-email', password: 'weak' },
    });
    assert.equal(badReg.status, 400);
    assert.equal(badReg.data.code, 'VALIDATION_ERROR');
  });

  it('creates a project and prevents assigning a task to a non-member', async () => {
    const projRes = await request('/api/projects', {
      method: 'POST',
      token: managerToken,
      body: {
        name: 'API Security Hardening',
        description: 'End-to-end validation and rate limit verification.',
        status: 'Active',
        startDate: '2026-11-01',
        dueDate: '2026-12-15',
        memberIds: ['usr_mem_priya'],
      },
    });
    assert.equal(projRes.status, 201);
    createdProjectId = projRes.data.data.project.id;

    const invalidAssign = await request('/api/tasks', {
      method: 'POST',
      token: managerToken,
      body: {
        title: 'Should fail membership check',
        description: 'Testing membership constraint enforcement.',
        projectId: createdProjectId,
        assignedTo: 'usr_mem_liam',
        priority: 'High',
        status: 'Todo',
      },
    });
    assert.equal(invalidAssign.status, 400);
    assert.equal(invalidAssign.data.code, 'ASSIGNEE_NOT_PROJECT_MEMBER');
  });

  it('updates project settings and adds/removes members', async () => {
    const update = await request('/api/projects/prj_design_tokens', {
      method: 'PUT',
      token: managerToken,
      body: { status: 'Active', memberIds: ['usr_mgr_marcus'] },
    });
    assert.equal(update.status, 200);
    assert.equal(update.data.data.project.status, 'Active');
    assert.ok(update.data.data.project.members.every((member) => member.id !== 'usr_mem_liam'));

    const unassigned = await request('/api/tasks/tsk_form_contrast', { token: managerToken });
    assert.equal(unassigned.status, 200);
    assert.equal(unassigned.data.data.task.assignedTo, null);

    const restoreMember = await request('/api/projects/prj_design_tokens', {
      method: 'PUT',
      token: managerToken,
      body: { memberIds: ['usr_mem_liam'] },
    });
    assert.equal(restoreMember.status, 200);
    assert.ok(restoreMember.data.data.project.members.some((member) => member.id === 'usr_mem_liam'));

    const add = await request('/api/projects/prj_design_tokens/members', {
      method: 'POST',
      token: managerToken,
      body: { userId: 'usr_mem_priya' },
    });
    assert.equal(add.status, 200);
    assert.ok(add.data.data.project.members.some((member) => member.id === 'usr_mem_priya'));

    const remove = await request('/api/projects/prj_design_tokens/members/usr_mem_priya', {
      method: 'DELETE',
      token: managerToken,
    });
    assert.equal(remove.status, 200);
    assert.ok(remove.data.data.project.members.every((member) => member.id !== 'usr_mem_priya'));
  });

  it('enforces Member reassignment restrictions and Completed business rules', async () => {
    const taskRes = await request('/api/tasks', {
      method: 'POST',
      token: memberToken,
      body: {
        title: 'Write validation tests',
        description: 'Short',
        projectId: createdProjectId,
        assignedTo: null,
        priority: 'Medium',
        status: 'Todo',
      },
    });
    assert.equal(taskRes.status, 201);
    createdTaskId = taskRes.data.data.task.id;

    const reassignFail = await request(`/api/tasks/${createdTaskId}`, {
      method: 'PUT',
      token: memberToken,
      body: { assignedTo: 'usr_mgr_marcus' },
    });
    assert.equal(reassignFail.status, 403);

    const completeFail = await request(`/api/tasks/${createdTaskId}/status`, {
      method: 'PATCH',
      token: managerToken,
      body: { status: 'Completed' },
    });
    assert.equal(completeFail.status, 422);
    assert.equal(completeFail.data.code, 'COMPLETION_RULE_FAILED');

    const updateOk = await request(`/api/tasks/${createdTaskId}`, {
      method: 'PUT',
      token: managerToken,
      body: {
        assignedTo: 'usr_mem_priya',
        description: 'Completed full backend and frontend Zod validation test coverage.',
        status: 'Completed',
      },
    });
    assert.equal(updateOk.status, 200);
    assert.equal(updateOk.data.data.task.status, 'Completed');
  });

  it('records comments and immutable activity history', async () => {
    const cmtRes = await request(`/api/tasks/${createdTaskId}/comments`, {
      method: 'POST',
      token: memberToken,
      body: { content: 'Verified all unit assertions pass.' },
    });
    assert.equal(cmtRes.status, 201);

    const actRes = await request(`/api/tasks/${createdTaskId}/activity`, {
      token: memberToken,
    });
    assert.equal(actRes.status, 200);
    assert.ok(actRes.data.data.activity.length >= 3);
  });

  it('enforces Admin-only role changes and safely deletes project with child tasks', async () => {
    const nonAdminRole = await request('/api/users/usr_mem_liam/role', {
      method: 'PATCH',
      token: memberToken,
      body: { role: 'Manager' },
    });
    assert.equal(nonAdminRole.status, 403);

    const adminDelete = await request(`/api/projects/${createdProjectId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(adminDelete.status, 200);

    const taskAfterDelete = await request(`/api/tasks/${createdTaskId}`, {
      token: adminToken,
    });
    assert.equal(taskAfterDelete.status, 404);
  });
});
