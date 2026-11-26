import crypto from 'node:crypto';
import type { AppEnvConfig } from '../config/env.ts';
import type { RegistrationDatabase } from '../database/db.ts';
import { maskIndianMobile, sanitizeFullName } from '../utils/crypto.ts';
import { verifyVerificationToken } from '../utils/jwt.ts';
import type { ServiceError } from './otpService.ts';

export interface CompletedAccountResponse {
  ok: true;
  message: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    maskedMobile: string;
    emailVerified: true;
    mobileVerified: true;
    createdAt: string;
  };
}

function nowOf(cfg: AppEnvConfig): number {
  return cfg.now ? cfg.now() : Date.now();
}

export class RegistrationService {
  constructor(
    private readonly db: RegistrationDatabase,
    private readonly cfg: AppEnvConfig
  ) {}

  public completeRegistration(params: {
    fullName: string;
    emailVerificationToken: string;
    mobileVerificationToken: string;
    clientIp: string;
  }): CompletedAccountResponse | ServiceError {
    const nowMs = nowOf(this.cfg);

    // Rate limit registration submissions per IP
    const ipLimit = this.db.consumeRateLimit(`register:ip:${params.clientIp}`, 10, 15 * 60 * 1000, nowMs);
    if (!ipLimit.allowed) {
      return {
        ok: false,
        statusCode: 429,
        code: 'RATE_LIMITED',
        error: `Too many registration requests. Please wait ${ipLimit.retryAfterSec}s.`,
        retryAfterSec: ipLimit.retryAfterSec,
      };
    }

    const fullName = sanitizeFullName(params.fullName);
    if (fullName.length < 2) {
      return {
        ok: false,
        statusCode: 400,
        code: 'INVALID_FULL_NAME',
        error: 'Please enter your full name.',
      };
    }

    // 1. Verify both signed JWTs cryptographically
    const emailJwt = verifyVerificationToken({
      token: params.emailVerificationToken,
      expectedChannel: 'email',
      secret: this.cfg.jwtSecret,
      nowMs,
    });
    if (!emailJwt.ok) {
      return {
        ok: false,
        statusCode: 401,
        code: emailJwt.code,
        error: emailJwt.error,
      };
    }

    const mobileJwt = verifyVerificationToken({
      token: params.mobileVerificationToken,
      expectedChannel: 'mobile',
      secret: this.cfg.jwtSecret,
      nowMs,
    });
    if (!mobileJwt.ok) {
      return {
        ok: false,
        statusCode: 401,
        code: mobileJwt.code,
        error: mobileJwt.error,
      };
    }

    // 2. Ensure both tokens belong to the exact same registration session
    if (emailJwt.claims.sub !== mobileJwt.claims.sub) {
      return {
        ok: false,
        statusCode: 403,
        code: 'SESSION_MISMATCH',
        error: 'Email and mobile verification tokens do not belong to the same registration session.',
      };
    }

    // 3. Validate server-side token ledger (exists, matches session/channel/identifier, unexpired, unconsumed)
    const emailRecord = this.db.getVerificationTokenByJti(emailJwt.claims.jti);
    const mobileRecord = this.db.getVerificationTokenByJti(mobileJwt.claims.jti);

    if (!emailRecord || !mobileRecord) {
      return {
        ok: false,
        statusCode: 401,
        code: 'TOKEN_UNKNOWN',
        error: 'Verification session could not be found. Please restart verification.',
      };
    }

    if (
      emailRecord.registrationSessionId !== emailJwt.claims.sub ||
      emailRecord.channel !== 'email' ||
      emailRecord.identifier !== emailJwt.claims.identifier ||
      mobileRecord.registrationSessionId !== mobileJwt.claims.sub ||
      mobileRecord.channel !== 'mobile' ||
      mobileRecord.identifier !== mobileJwt.claims.identifier
    ) {
      return {
        ok: false,
        statusCode: 403,
        code: 'TOKEN_BINDING_MISMATCH',
        error: 'Verification token metadata does not match the active registration record.',
      };
    }

    if (emailRecord.consumedAtMs !== null || mobileRecord.consumedAtMs !== null) {
      return {
        ok: false,
        statusCode: 409,
        code: 'TOKEN_ALREADY_CONSUMED',
        error: 'These verification tokens have already been used. Please start a fresh registration.',
      };
    }

    if (nowMs > emailRecord.expiresAtMs || nowMs > mobileRecord.expiresAtMs) {
      return {
        ok: false,
        statusCode: 401,
        code: 'TOKEN_EXPIRED',
        error: 'Your verification session has expired. Please verify your email and mobile again.',
      };
    }

    // 4. Atomically consume both verification tokens and create the verified account
    const userId = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
    const result = this.db.atomicCompleteRegistration({
      userId,
      fullName,
      email: emailRecord.identifier,
      normalizedMobile: mobileRecord.identifier,
      emailTokenJti: emailRecord.jti,
      mobileTokenJti: mobileRecord.jti,
      nowMs,
    });

    if (!result.ok) {
      if (result.code === 'DUPLICATE_EMAIL') {
        return {
          ok: false,
          statusCode: 409,
          code: 'DUPLICATE_EMAIL',
          error: 'An account with this email address is already registered.',
        };
      }
      if (result.code === 'DUPLICATE_MOBILE') {
        return {
          ok: false,
          statusCode: 409,
          code: 'DUPLICATE_MOBILE',
          error: 'An account with this mobile number is already registered.',
        };
      }
      return {
        ok: false,
        statusCode: 409,
        code: 'TOKEN_ALREADY_CONSUMED',
        error: 'Verification tokens were already consumed. Please start a fresh registration.',
      };
    }

    return {
      ok: true,
      message: 'Your Account Has Been Successfully Created!',
      user: {
        id: result.user.id,
        fullName: result.user.fullName,
        email: result.user.email,
        maskedMobile: maskIndianMobile(result.user.normalizedMobile),
        emailVerified: true,
        mobileVerified: true,
        createdAt: result.user.createdAt,
      },
    };
  }
}
