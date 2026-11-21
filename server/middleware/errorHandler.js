import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundApiHandler(req, _res, next) {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, 'ROUTE_NOT_FOUND'));
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    const fieldErrors = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    res.status(400).json({
      success: false,
      message: 'Validation failed. Please review the highlighted fields.',
      code: 'VALIDATION_ERROR',
      errors: fieldErrors,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      ...(err.errors ? { errors: err.errors } : {}),
    });
    return;
  }

  if (err && typeof err === 'object' && (err.code === 'ER_DUP_ENTRY' || err.code === 11000)) {
    res.status(409).json({
      success: false,
      message: 'A record with the same unique value already exists.',
      code: 'CONFLICT_ERROR',
    });
    return;
  }

  console.error('Unhandled server error:', err instanceof Error ? err.message : err);
  res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred. Please try again.',
    code: 'INTERNAL_SERVER_ERROR',
  });
}
