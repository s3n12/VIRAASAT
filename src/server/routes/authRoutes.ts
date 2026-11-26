import { Router } from 'express';
import type { AppEnvConfig } from '../config/env.ts';
import type { AuthController } from '../controllers/authController.ts';
import type { RegistrationDatabase } from '../database/db.ts';
import { createIpRateLimitMiddleware } from '../middleware/rateLimiter.ts';

export function createAuthRouter(params: {
  controller: AuthController;
  db: RegistrationDatabase;
  cfg: AppEnvConfig;
}): Router {
  const router = Router();

  const registerBurstGuard = createIpRateLimitMiddleware({
    db: params.db,
    cfg: params.cfg,
    scope: 'auth-register',
    maxRequests: 15,
    windowMs: 15 * 60 * 1000,
  });

  router.get('/session', params.controller.getSession);
  router.post('/session/reset', params.controller.resetSession);
  router.post('/register', registerBurstGuard, params.controller.register);

  return router;
}
