import { Router } from 'express';
import type { AppEnvConfig } from '../config/env.ts';
import type { OtpController } from '../controllers/otpController.ts';
import type { RegistrationDatabase } from '../database/db.ts';
import { createIpRateLimitMiddleware } from '../middleware/rateLimiter.ts';

export function createOtpRouter(params: {
  controller: OtpController;
  db: RegistrationDatabase;
  cfg: AppEnvConfig;
}): Router {
  const router = Router();

  const sendBurstGuard = createIpRateLimitMiddleware({
    db: params.db,
    cfg: params.cfg,
    scope: 'otp-send',
    maxRequests: 25,
    windowMs: 15 * 60 * 1000,
  });

  const verifyBurstGuard = createIpRateLimitMiddleware({
    db: params.db,
    cfg: params.cfg,
    scope: 'otp-verify',
    maxRequests: 40,
    windowMs: 15 * 60 * 1000,
  });

  router.post('/send-email', sendBurstGuard, params.controller.sendEmail);
  router.post('/send-sms', sendBurstGuard, params.controller.sendSms);
  router.post('/verify', verifyBurstGuard, params.controller.verify);

  return router;
}
