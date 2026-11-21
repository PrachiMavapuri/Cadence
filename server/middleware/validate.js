import { AppError } from '../utils/AppError.js';

function formatZodErrors(err) {
  const fieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || 'form';
    if (!fieldErrors[key]) fieldErrors[key] = [];
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}

export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        new AppError(
          result.error.issues[0]?.message || 'Validation failed',
          400,
          'VALIDATION_ERROR',
          formatZodErrors(result.error)
        )
      );
    }
    req.body = result.data;
    next();
  };
}

export function validateParams(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return next(
        new AppError(
          result.error.issues[0]?.message || 'Invalid URL parameters',
          400,
          'VALIDATION_ERROR',
          formatZodErrors(result.error)
        )
      );
    }
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(
        new AppError(
          result.error.issues[0]?.message || 'Invalid query parameters',
          400,
          'VALIDATION_ERROR',
          formatZodErrors(result.error)
        )
      );
    }
    res.locals.validatedQuery = result.data;
    next();
  };
}
