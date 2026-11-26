import type { Request, Response } from 'express';
import { getProviderReadiness, type AppEnvConfig } from '../config/env.ts';
import {
  clearRegistrationSessionCookie,
  extractClientIp,
  readRegistrationSessionFromRequest,
  writeRegistrationSessionCookie,
} from '../middleware/security.ts';
import type { OtpService } from '../services/otpService.ts';
import type { RegistrationService } from '../services/registrationService.ts';
import { createRegistrationSessionId } from '../utils/crypto.ts';
import { registerAccountSchema } from '../validators/schemas.ts';

export class AuthController {
  constructor(
    private readonly otpService: OtpService,
    private readonly registrationService: RegistrationService,
    private readonly cfg: AppEnvConfig
  ) {}

  public getPublicConfig = (_req: Request, res: Response): void => {
    const readiness = getProviderReadiness(this.cfg);
    res.json({
      ok: true,
      demoMode: this.cfg.demoMode,
      otpExpirySec: Math.floor(this.cfg.otpTtlMs / 1000),
      resendCooldownSec: Math.floor(this.cfg.resendCooldownMs / 1000),
      maxOtpAttempts: this.cfg.maxOtpAttempts,
      emailProviderReady: readiness.emailReady,
      smsProviderReady: readiness.smsReady,
      missingProviders: [
        ...(readiness.emailReady ? [] : readiness.missingEmailEnv),
        ...(readiness.smsReady ? [] : readiness.missingSmsEnv),
      ],
    });
  };

  public getSession = (req: Request, res: Response): void => {
    let sessionId = readRegistrationSessionFromRequest(req, this.cfg);
    if (!sessionId) {
      sessionId = createRegistrationSessionId();
      writeRegistrationSessionCookie(req, res, sessionId, this.cfg);
    }

    const state = this.otpService.getSessionState(sessionId);
    res.json({
      ok: true,
      session: state,
    });
  };

  public resetSession = (req: Request, res: Response): void => {
    const currentSessionId = readRegistrationSessionFromRequest(req, this.cfg);
    const nextSessionId = currentSessionId
      ? this.otpService.resetSession(currentSessionId)
      : createRegistrationSessionId();

    writeRegistrationSessionCookie(req, res, nextSessionId, this.cfg);
    const state = this.otpService.getSessionState(nextSessionId);
    res.json({
      ok: true,
      message: 'Verification session reset. You can now verify a new email and mobile number.',
      session: state,
    });
  };

  public register = (req: Request, res: Response): void => {
    const parsed = registerAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        error:
          parsed.error.issues[0]?.message ||
          'Complete both email and Indian mobile verification before creating your account.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = this.registrationService.completeRegistration({
      fullName: parsed.data.fullName,
      emailVerificationToken: parsed.data.emailVerificationToken,
      mobileVerificationToken: parsed.data.mobileVerificationToken,
      clientIp: extractClientIp(req),
    });

    if (!result.ok) {
      if (result.retryAfterSec) {
        res.setHeader('Retry-After', String(result.retryAfterSec));
      }
      res.status(result.statusCode).json(result);
      return;
    }

    // Clear the completed registration session cookie so refreshes start cleanly
    clearRegistrationSessionCookie(req, res);
    res.status(201).json(result);
  };
}
