import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getDb, runInTransaction } from '../db/database.js';
import { AppError } from '../utils/AppError.js';

function toSafeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    authProvider: row.authProvider,
    avatarUrl: row.avatarUrl,
    jobTitle: row.jobTitle,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, type: 'access' },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
  );
}

async function issueSessionTokens(user, conn = undefined) {
  const db = getDb();
  const accessToken = signAccessToken(user);
  const refreshToken = jwt.sign(
    { sub: user.id, jti: crypto.randomUUID(), type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
  );

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  await db.insert(
    'refresh_tokens',
    {
      id: `rt_${crypto.randomUUID()}`,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
      createdAt: now,
    },
    conn
  );

  return { accessToken, refreshToken };
}

// New accounts join the oldest project so they land in a populated workspace.
async function joinStarterProject(db, userId, now, conn) {
  const starterProject = await db.get('SELECT id FROM projects ORDER BY createdAt ASC, seq ASC LIMIT 1', [], conn);
  if (starterProject) {
    await db.run(
      'INSERT IGNORE INTO project_members (projectId, userId, addedAt) VALUES (?, ?, ?)',
      [starterProject.id, userId, now],
      conn
    );
  }
}

export async function registerUser(input) {
  const db = getDb();
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [input.email]);
  if (existing) {
    throw new AppError('An account with this email already exists.', 409, 'EMAIL_EXISTS', {
      email: ['An account with this email already exists'],
    });
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const now = new Date().toISOString();
  const userId = `usr_${crypto.randomUUID().slice(0, 10)}`;

  try {
    await runInTransaction(async (conn) => {
      await db.insert(
        'users',
        {
          id: userId,
          name: input.name,
          email: input.email,
          passwordHash,
          role: 'Member',
          authProvider: 'local',
          providerId: null,
          avatarUrl: '',
          jobTitle: input.jobTitle || 'Team Member',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        conn
      );
      await joinStarterProject(db, userId, now, conn);
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError('An account with this email already exists.', 409, 'EMAIL_EXISTS', {
        email: ['An account with this email already exists'],
      });
    }
    throw error;
  }

  const row = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  const user = toSafeUser(row);
  const tokens = await issueSessionTokens(user);
  return { user, ...tokens };
}

export async function loginUser(input) {
  const db = getDb();
  const row = await db.get('SELECT * FROM users WHERE email = ?', [input.email]);

  if (!row || !row.passwordHash) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(input.password, row.passwordHash);
  if (!valid) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  if (!row.isActive) {
    throw new AppError('Your account has been deactivated. Contact an administrator.', 403, 'ACCOUNT_DISABLED');
  }

  const user = toSafeUser(row);
  const tokens = await issueSessionTokens(user);
  return { user, ...tokens };
}

async function resolveOAuthProfile(provider, input) {
  if (provider === 'google') {
    throw new AppError('Google sign-in requires a server-verified authorization code.', 400, 'GOOGLE_CODE_REQUIRED');
  }

 

  if (!input.email || !input.name) {
    throw new AppError(`Verified ${provider} email and name are required.`, 400, 'VALIDATION_ERROR');
  }

  return {
    email: input.email.toLowerCase(),
    name: input.name,
    avatarUrl: input.avatarUrl || '',
    providerId: input.providerId || `${provider}_${crypto.createHash('md5').update(input.email).digest('hex').slice(0, 12)}`,
  };
}

async function createSocialSession(provider, profile) {
  const db = getDb();
  const now = new Date().toISOString();

  let row = await db.get('SELECT * FROM users WHERE authProvider = ? AND providerId = ?', [provider, profile.providerId]);
  if (!row) {
    row = await db.get('SELECT * FROM users WHERE email = ?', [profile.email]);
  }

  if (row) {
    if (!row.isActive) {
      throw new AppError('Your account has been deactivated.', 403, 'ACCOUNT_DISABLED');
    }
    if (row.authProvider !== 'local' && row.authProvider !== provider) {
      throw new AppError(
        'This email is already linked to a different sign-in provider.',
        409,
        'OAUTH_ACCOUNT_CONFLICT'
      );
    }
    if (row.authProvider === provider && row.providerId && row.providerId !== profile.providerId) {
      throw new AppError('This email is linked to a different provider account.', 409, 'OAUTH_ACCOUNT_CONFLICT');
    }
    const sets = ['authProvider = ?', 'updatedAt = ?'];
    const params = [provider, now];
    if (!row.providerId) {
      sets.push('providerId = ?');
      params.push(profile.providerId);
    }
    if (!row.avatarUrl) {
      sets.push('avatarUrl = ?');
      params.push(profile.avatarUrl);
    }
    await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, row.id]);
    row = await db.get('SELECT * FROM users WHERE id = ?', [row.id]);
  } else {
    const userId = `usr_${crypto.randomUUID().slice(0, 10)}`;
    await runInTransaction(async (conn) => {
      await db.insert(
        'users',
        {
          id: userId,
          name: profile.name,
          email: profile.email,
          passwordHash: null,
          role: 'Member',
          authProvider: provider,
          providerId: profile.providerId,
          avatarUrl: profile.avatarUrl,
          jobTitle: 'Product Contributor',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        conn
      );
      await joinStarterProject(db, userId, now, conn);
    });
    row = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  }

  const user = toSafeUser(row);
  const tokens = await issueSessionTokens(user);
  return { user, ...tokens };
}

export async function loginWithSocialProvider(provider, input) {
  const profile = await resolveOAuthProfile(provider, input);
  return createSocialSession(provider, profile);
}

export async function loginWithGoogleAuthorizationCode(code, redirectUri, fetchImpl = fetch) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError('Google sign-in is not configured on this server.', 503, 'GOOGLE_NOT_CONFIGURED');
  }

  const tokenResponse = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenResponse.ok) {
    throw new AppError('Google authorization code exchange failed.', 401, 'GOOGLE_AUTH_FAILED');
  }

  const tokens = await tokenResponse.json();
  if (typeof tokens.id_token !== 'string' || !tokens.id_token) {
    throw new AppError('Google did not return an ID token.', 401, 'GOOGLE_AUTH_FAILED');
  }

  const tokenInfoUrl = new URL('https://oauth2.googleapis.com/tokeninfo');
  tokenInfoUrl.searchParams.set('id_token', tokens.id_token);
  const verificationResponse = await fetchImpl(tokenInfoUrl);
  if (!verificationResponse.ok) {
    throw new AppError('Google ID token verification failed.', 401, 'GOOGLE_AUTH_FAILED');
  }

  const claims = await verificationResponse.json();
  if (
    claims.aud !== env.GOOGLE_CLIENT_ID ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
    (claims.email_verified !== true && claims.email_verified !== 'true') ||
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    typeof claims.email !== 'string' ||
    !claims.email
  ) {
    throw new AppError('Google ID token claims are invalid.', 401, 'GOOGLE_AUTH_FAILED');
  }

  const profile = {
    email: claims.email.toLowerCase(),
    name: typeof claims.name === 'string' && claims.name ? claims.name : claims.email.split('@')[0],
    avatarUrl: typeof claims.picture === 'string' ? claims.picture : '',
    providerId: claims.sub,
  };
  return createSocialSession('google', profile);
}

export async function refreshUserSession(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw new AppError('Refresh token is missing.', 401, 'REFRESH_TOKEN_MISSING');
  }

  let decoded;
  try {
    decoded = jwt.verify(rawRefreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Refresh token is invalid or expired.', 401, 'INVALID_REFRESH_TOKEN');
  }

  if (!decoded.sub || decoded.type !== 'refresh') {
    throw new AppError('Invalid refresh token payload.', 401, 'INVALID_REFRESH_TOKEN');
  }

  const db = getDb();
  const tokenHash = hashToken(rawRefreshToken);
  const stored = await db.get('SELECT id, userId, expiresAt FROM refresh_tokens WHERE tokenHash = ?', [tokenHash]);

  if (!stored || new Date(stored.expiresAt) < new Date()) {
    if (stored) {
      await db.run('DELETE FROM refresh_tokens WHERE id = ?', [stored.id]);
    }
    throw new AppError('Refresh session expired. Please sign in again.', 401, 'REFRESH_EXPIRED');
  }

  const row = await db.get('SELECT * FROM users WHERE id = ?', [stored.userId]);
  if (!row || !row.isActive) {
    throw new AppError('User account unavailable.', 401, 'UNAUTHORIZED');
  }

  const user = toSafeUser(row);
  let tokens;
  await runInTransaction(async (conn) => {
    const deleted = await db.run('DELETE FROM refresh_tokens WHERE id = ? AND tokenHash = ?', [stored.id, tokenHash], conn);
    if (!deleted.affectedRows) {
      throw new AppError('Refresh session has already been used.', 401, 'REFRESH_EXPIRED');
    }
    tokens = await issueSessionTokens(user, conn);
  });
  return { user, ...tokens };
}

export async function logoutUser(rawRefreshToken) {
  if (!rawRefreshToken) return;
  await getDb().run('DELETE FROM refresh_tokens WHERE tokenHash = ?', [hashToken(rawRefreshToken)]);
}

export async function updateProfile(userId, input) {
  const db = getDb();
  const row = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!row) {
    throw new AppError('User not found.', 404, 'NOT_FOUND');
  }

  let nextPasswordHash = row.passwordHash;
  if (input.newPassword) {
    if (!row.passwordHash) {
      throw new AppError(
        'OAuth-authenticated accounts cannot set a local password here without an existing password.',
        400,
        'OAUTH_PASSWORD_UNSUPPORTED'
      );
    }
    const matches = await bcrypt.compare(input.currentPassword || '', row.passwordHash);
    if (!matches) {
      throw new AppError('Current password is incorrect.', 400, 'INVALID_CURRENT_PASSWORD', {
        currentPassword: ['Current password is incorrect'],
      });
    }
    nextPasswordHash = await bcrypt.hash(input.newPassword, 10);
  }

  await db.run(
    'UPDATE users SET name = ?, jobTitle = ?, avatarUrl = ?, passwordHash = ?, updatedAt = ? WHERE id = ?',
    [
      input.name ?? row.name,
      input.jobTitle ?? row.jobTitle,
      input.avatarUrl !== undefined ? input.avatarUrl : row.avatarUrl,
      nextPasswordHash,
      new Date().toISOString(),
      userId,
    ]
  );

  const updated = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  return toSafeUser(updated);
}
