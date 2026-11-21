import { Router } from 'express';
import * as taskController from '../controllers/taskController.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  createCommentSchema,
  createTaskSchema,
  idParamSchema,
  paginationQuerySchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from '../validators/schemas.js';

const router = Router();

router.use(authenticate);

router.get('/', validateQuery(paginationQuerySchema), asyncHandler(taskController.listTasks));
router.post('/', validateBody(createTaskSchema), asyncHandler(taskController.createTask));
router.get('/:id', validateParams(idParamSchema), asyncHandler(taskController.getTask));
router.put(
  '/:id',
  validateParams(idParamSchema),
  validateBody(updateTaskSchema),
  asyncHandler(taskController.updateTask)
);
router.patch(
  '/:id/status',
  validateParams(idParamSchema),
  validateBody(updateTaskStatusSchema),
  asyncHandler(taskController.updateTaskStatus)
);
router.delete('/:id', validateParams(idParamSchema), asyncHandler(taskController.deleteTask));

router.get('/:id/comments', validateParams(idParamSchema), asyncHandler(taskController.listComments));
router.post(
  '/:id/comments',
  validateParams(idParamSchema),
  validateBody(createCommentSchema),
  asyncHandler(taskController.addComment)
);
router.get('/:id/activity', validateParams(idParamSchema), asyncHandler(taskController.listActivity));

export default router;
