import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import {
  loginSchema,
  oauthLoginSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/schemas.js';

const router = Router();

router.post('/register', validateBody(registerSchema), asyncHandler(authController.register));
router.post('/login', validateBody(loginSchema), asyncHandler(authController.login));
router.get('/google', authController.googleAuthStart);
router.get('/google/callback', asyncHandler(authController.googleAuthCallback));
router.post('/refresh', asyncHandler(authController.refresh));
router.get('/me', authenticate, asyncHandler(authController.getMe));
router.put('/profile', authenticate, validateBody(updateProfileSchema), asyncHandler(authController.updateMyProfile));
router.post('/logout', asyncHandler(authController.logout));

export default router;
