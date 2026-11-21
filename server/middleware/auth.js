import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getDb } from '../db/database.js';
import { AppError } from '../utils/AppError.js';

export async function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Please sign in.', 401, 'UNAUTHORIZED'));
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return next(new AppError('Authentication token is missing.', 401, 'UNAUTHORIZED'));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError('Session expired. Refreshing authentication...', 401, 'TOKEN_EXPIRED'));
    }
    return next(new AppError('Invalid authentication token.', 401, 'INVALID_TOKEN'));
  }

  if (!decoded.sub || decoded.type !== 'access') {
    return next(new AppError('Invalid authentication token.', 401, 'INVALID_TOKEN'));
  }

  try {
    const row = await getDb().get(
      'SELECT id, name, email, role, authProvider, avatarUrl, jobTitle, isActive, createdAt, updatedAt FROM users WHERE id = ?',
      [decoded.sub]
    );

    if (!row) {
      return next(new AppError('Account no longer exists.', 401, 'UNAUTHORIZED'));
    }

    if (!row.isActive) {
      return next(new AppError('Your account has been deactivated by an administrator.', 403, 'ACCOUNT_DISABLED'));
    }

    req.user = row;
    next();
  } catch (err) {
    next(err);
  }
}

export function authorizeRoles(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Requires ${allowedRoles.join(' or ')} permissions.`,
          403,
          'FORBIDDEN'
        )
      );
    }
    next();
  };
}
