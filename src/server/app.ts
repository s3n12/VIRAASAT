import express, { type Express } from 'express';
import { loadEnvConfig, type AppEnvConfig, type AppEnvOverrides } from './config/env.ts';
import { AuthController } from './controllers/authController.ts';
import { OtpController } from './controllers/otpController.ts';
import { RegistrationDatabase } from './database/db.ts';
import {
  apiErrorHandler,
  buildCorsMiddleware,
  buildHelmetMiddleware,
  requireCsrfCheck,
} from './middleware/security.ts';
import { createAuthRouter } from './routes/authRoutes.ts';
import { createOtpRouter } from './routes/otpRoutes.ts';
import { OtpService } from './services/otpService.ts';
import { RegistrationService } from './services/registrationService.ts';

export interface AppInstance {
  app: Express;
  db: RegistrationDatabase;
  cfg: AppEnvConfig;
  close: () => void;
}

export function createApp(overrides: AppEnvOverrides = {}): AppInstance {
  const cfg = loadEnvConfig(overrides);
  const db = new RegistrationDatabase(cfg.sqlitePath);
  if (cfg.nodeEnv !== 'test') {
    db.startCleanupSchedule();
  }

  const otpService = new OtpService(db, cfg);
  const registrationService = new RegistrationService(db, cfg);

  const otpController = new OtpController(otpService, cfg);
  const authController = new AuthController(otpService, registrationService, cfg);

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(buildHelmetMiddleware());
  app.use(buildCorsMiddleware(cfg));
  app.use(express.json({ limit: '16kb' }));

  // Prevent browser caching of sensitive auth/OTP responses
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use('/api', requireCsrfCheck);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'dual-otp-registration',
      demoMode: cfg.demoMode,
      registeredUsersCount: db.countUsers(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/config', authController.getPublicConfig);
  app.use('/api/otp', createOtpRouter({ controller: otpController, db, cfg }));
  app.use('/api/auth', createAuthRouter({ controller: authController, db, cfg }));

  app.use('/api', (_req, res) => {
    res.status(404).json({
      ok: false,
      code: 'NOT_FOUND',
      error: 'API route not found.',
    });
  });

  app.use(apiErrorHandler);

  return {
    app,
    db,
    cfg,
    close: () => db.close(),
  };
}
