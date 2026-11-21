import { Router } from 'express';
import * as projectController from '../controllers/projectController.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  createProjectSchema,
  idParamSchema,
  paginationQuerySchema,
  projectMemberParamSchema,
  projectMemberSchema,
  updateProjectSchema,
} from '../validators/schemas.js';

const router = Router();

router.use(authenticate);

router.get('/', validateQuery(paginationQuerySchema), asyncHandler(projectController.listProjects));
router.post('/', validateBody(createProjectSchema), asyncHandler(projectController.createProject));
router.get('/:id', validateParams(idParamSchema), asyncHandler(projectController.getProject));
router.put(
  '/:id',
  validateParams(idParamSchema),
  validateBody(updateProjectSchema),
  asyncHandler(projectController.updateProject)
);
router.delete('/:id', validateParams(idParamSchema), asyncHandler(projectController.deleteProject));

router.post(
  '/:id/members',
  authorizeRoles('Admin', 'Manager'),
  validateParams(idParamSchema),
  validateBody(projectMemberSchema),
  asyncHandler(projectController.addMember)
);
router.delete(
  '/:id/members/:userId',
  authorizeRoles('Admin', 'Manager'),
  validateParams(projectMemberParamSchema),
  asyncHandler(projectController.removeMember)
);

export default router;
