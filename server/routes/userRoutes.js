import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { idParamSchema, updateUserRoleSchema, updateUserStatusSchema } from '../validators/schemas.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(userController.listUsers));
router.patch(
  '/:id/role',
  authorizeRoles('Admin'),
  validateParams(idParamSchema),
  validateBody(updateUserRoleSchema),
  asyncHandler(userController.updateRole)
);
router.patch(
  '/:id/status',
  authorizeRoles('Admin'),
  validateParams(idParamSchema),
  validateBody(updateUserStatusSchema),
  asyncHandler(userController.updateStatus)
);

export default router;
