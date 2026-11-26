import type { Request, Response } from 'express';
import type { AppEnvConfig } from '../config/env.ts';
import {
  extractClientIp,
  readRegistrationSessionFromRequest,
  writeRegistrationSessionCookie,
} from '../middleware/security.ts';
import type { OtpService } from '../services/otpService.ts';
import { sendEmailOtpSchema, sendSmsOtpSchema, verifyOtpSchema } from '../validators/schemas.ts';

export class OtpController {
  constructor(
    private readonly otpService: OtpService,
    private readonly cfg: AppEnvConfig
  ) {}

  public sendEmail = async (req: Request, res: Response): Promise<void> => {
    const parsed = sendEmailOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        error: parsed.error.issues[0]?.message || 'Please enter a valid full name and email address.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const sessionId =
      readRegistrationSessionFromRequest(req, this.cfg) ?? parsed.data.registrationSessionId;

    const result = await this.otpService.sendEmailOtp({
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      registrationSessionId: sessionId,
      clientIp: extractClientIp(req),
    });

    if (!result.ok) {
      if (result.retryAfterSec) {
        res.setHeader('Retry-After', String(result.retryAfterSec));
      }
      res.status(result.statusCode).json(result);
      return;
    }

    writeRegistrationSessionCookie(req, res, result.registrationSessionId, this.cfg);
    res.status(200).json(result);
  };

  public sendSms = async (req: Request, res: Response): Promise<void> => {
    const parsed = sendSmsOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        error:
          parsed.error.issues[0]?.message ||
          'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const sessionId =
      readRegistrationSessionFromRequest(req, this.cfg) ?? parsed.data.registrationSessionId;

    const result = await this.otpService.sendSmsOtp({
      mobile: parsed.data.mobile,
      registrationSessionId: sessionId,
      clientIp: extractClientIp(req),
    });

    if (!result.ok) {
      if (result.retryAfterSec) {
        res.setHeader('Retry-After', String(result.retryAfterSec));
      }
      res.status(result.statusCode).json(result);
      return;
    }

    writeRegistrationSessionCookie(req, res, result.registrationSessionId, this.cfg);
    res.status(200).json(result);
  };

  public verify = (req: Request, res: Response): void => {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        error: parsed.error.issues[0]?.message || 'Enter a valid 6-digit verification code.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const sessionId =
      readRegistrationSessionFromRequest(req, this.cfg) ?? parsed.data.registrationSessionId;

    const result = this.otpService.verifyOtp({
      channel: parsed.data.channel,
      identifier: parsed.data.identifier,
      otp: parsed.data.otp,
      registrationSessionId: sessionId,
      clientIp: extractClientIp(req),
    });

    if (!result.ok) {
      if (result.retryAfterSec) {
        res.setHeader('Retry-After', String(result.retryAfterSec));
      }
      res.status(result.statusCode).json(result);
      return;
    }

    writeRegistrationSessionCookie(req, res, result.registrationSessionId, this.cfg);
    res.status(200).json(result);
  };
}
