import crypto from 'node:crypto';
import type { AppEnvConfig } from '../config/env.ts';
import type { RegistrationDatabase } from '../database/db.ts';
import {
  createRegistrationSessionId,
  generateSecureSixDigitOtp,
  hashOtpValue,
  maskIndianMobile,
  normalizeEmailAddress,
  normalizeIndianMobile,
  safeTimingEqualHex,
  sanitizeFullName,
  type OtpChannel,
} from '../utils/crypto.ts';
import { signVerificationToken } from '../utils/jwt.ts';
import { dispatchEmailOtp } from './emailService.ts';
import { dispatchSmsOtp } from './smsService.ts';

export interface ServiceError {
  ok: false;
  statusCode: number;
  code: string;
  error: string;
  retryAfterSec?: number;
  remainingAttempts?: number;
}

export interface SendOtpSuccess {
  ok: true;
  registrationSessionId: string;
  channel: OtpChannel;
  normalizedIdentifier: string;
  expiresAtMs: number;
  resendAvailableAtMs: number;
  expiresInSec: number;
  resendCooldownSec: number;
  demoMode: boolean;
  message: string;
}

export interface VerifyOtpSuccess {
  ok: true;
  registrationSessionId: string;
  channel: OtpChannel;
  normalizedIdentifier: string;
  verificationToken: string;
  tokenExpiresAtMs: number;
  message: string;
}

export interface SessionChannelState {
  status: 'idle' | 'otp_sent' | 'expired' | 'verified';
  identifier: string | null;
  maskedIdentifier?: string | null;
  expiresAtMs: number | null;
  resendAvailableAtMs: number | null;
  attemptsRemaining: number | null;
  verificationToken: string | null;
}

export interface ServerSessionState {
  registrationSessionId: string;
  fullName: string;
  email: SessionChannelState;
  mobile: SessionChannelState;
  bothVerified: boolean;
  demoMode: boolean;
}

function nowOf(cfg: AppEnvConfig): number {
  return cfg.now ? cfg.now() : Date.now();
}

export class OtpService {
  constructor(
    private readonly db: RegistrationDatabase,
    private readonly cfg: AppEnvConfig
  ) {}

  public async sendEmailOtp(params: {
    fullName: string;
    email: string;
    registrationSessionId?: string;
    clientIp: string;
  }): Promise<SendOtpSuccess | ServiceError> {
    const nowMs = nowOf(this.cfg);
    const fullName = sanitizeFullName(params.fullName);
    const normalizedEmail = normalizeEmailAddress(params.email);
    const sessionId = params.registrationSessionId || createRegistrationSessionId();

    // Prevent changing a verified email in-place without restarting verification
    const existingEmailToken = this.db.getActiveVerificationTokenForSession(sessionId, 'email', nowMs);
    if (existingEmailToken) {
      return {
        ok: false,
        statusCode: 409,
        code: 'EMAIL_ALREADY_VERIFIED',
        error:
          'Your email address is already verified for this session. Restart verification to use a different email.',
      };
    }

    // Reject already registered email early before sending OTP
    if (this.db.findUserByEmail(normalizedEmail)) {
      return {
        ok: false,
        statusCode: 409,
        code: 'EMAIL_ALREADY_REGISTERED',
        error: 'An account with this email address already exists.',
      };
    }

    // Rate limit per IP and per email address (15 min rolling window)
    const ipLimit = this.db.consumeRateLimit(`send:email:ip:${params.clientIp}`, 15, 15 * 60 * 1000, nowMs);
    if (!ipLimit.allowed) {
      return {
        ok: false,
        statusCode: 429,
        code: 'RATE_LIMITED',
        error: `Too many email verification requests from this network. Try again in ${ipLimit.retryAfterSec}s.`,
        retryAfterSec: ipLimit.retryAfterSec,
      };
    }

    const emailLimit = this.db.consumeRateLimit(
      `send:email:id:${normalizedEmail}`,
      5,
      15 * 60 * 1000,
      nowMs
    );
    if (!emailLimit.allowed) {
      return {
        ok: false,
        statusCode: 429,
        code: 'RATE_LIMITED',
        error: `Too many OTP requests for this email. Please wait ${emailLimit.retryAfterSec}s.`,
        retryAfterSec: emailLimit.retryAfterSec,
      };
    }

    // Enforce strict 60-second resend cooldown
    const latest = this.db.getLatestChallengeForIdentifier('email', normalizedEmail);
    if (latest && nowMs - latest.lastSentAtMs < this.cfg.resendCooldownMs) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((latest.lastSentAtMs + this.cfg.resendCooldownMs - nowMs) / 1000)
      );
      return {
        ok: false,
        statusCode: 429,
        code: 'RESEND_COOLDOWN',
        error: `Please wait ${retryAfterSec}s before requesting another email OTP.`,
        retryAfterSec,
      };
    }

    const otp = generateSecureSixDigitOtp();
    const expiresAtMs = nowMs + this.cfg.otpTtlMs;
    const resendAvailableAtMs = nowMs + this.cfg.resendCooldownMs;

    const delivery = await dispatchEmailOtp({
      toEmail: normalizedEmail,
      fullName,
      otp,
      expiresInMinutes: Math.max(1, Math.round(this.cfg.otpTtlMs / 60000)),
      cfg: this.cfg,
    });

    if (!delivery.ok) {
      return {
        ok: false,
        statusCode: delivery.statusCode,
        code: delivery.code,
        error: delivery.error,
      };
    }

    const otpHash = hashOtpValue({
      registrationSessionId: sessionId,
      channel: 'email',
      identifier: normalizedEmail,
      otp,
      secret: this.cfg.otpHashSecret,
    });

    this.db.invalidatePendingChallenges(sessionId, 'email', nowMs);
    this.db.insertOtpChallenge({
      id: `ch_${crypto.randomUUID().replace(/-/g, '')}`,
      registrationSessionId: sessionId,
      channel: 'email',
      identifier: normalizedEmail,
      fullName,
      otpHash,
      expiresAtMs,
      lastSentAtMs: nowMs,
      attempts: 0,
      maxAttempts: this.cfg.maxOtpAttempts,
      verifiedAtMs: null,
      consumedAtMs: null,
      createdAtMs: nowMs,
    });

    return {
      ok: true,
      registrationSessionId: sessionId,
      channel: 'email',
      normalizedIdentifier: normalizedEmail,
      expiresAtMs,
      resendAvailableAtMs,
      expiresInSec: Math.floor(this.cfg.otpTtlMs / 1000),
      resendCooldownSec: Math.floor(this.cfg.resendCooldownMs / 1000),
      demoMode: this.cfg.demoMode,
      message: this.cfg.demoMode
        ? `Verification code sent to ${normalizedEmail}. (DEMO MODE: enter 123456 or check the server console.)`
        : `A 6-digit verification code has been sent to ${normalizedEmail}.`,
    };
  }

  public async sendSmsOtp(params: {
    mobile: string;
    registrationSessionId?: string;
    clientIp: string;
  }): Promise<SendOtpSuccess | ServiceError> {
    const nowMs = nowOf(this.cfg);
    const normalized = normalizeIndianMobile(params.mobile);
    if (!normalized) {
      return {
        ok: false,
        statusCode: 400,
        code: 'INVALID_MOBILE',
        error: 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 (e.g. +91 9876543210).',
      };
    }

    const sessionId = params.registrationSessionId || createRegistrationSessionId();

    // Prevent changing a verified mobile in-place without restarting verification
    const existingMobileToken = this.db.getActiveVerificationTokenForSession(sessionId, 'mobile', nowMs);
    if (existingMobileToken) {
      return {
        ok: false,
        statusCode: 409,
        code: 'MOBILE_ALREADY_VERIFIED',
        error:
          'Your mobile number is already verified for this session. Restart verification to use a different mobile number.',
      };
    }

    // Reject already registered mobile early before sending SMS
    if (this.db.findUserByMobile(normalized.e164)) {
      return {
        ok: false,
        statusCode: 409,
        code: 'MOBILE_ALREADY_REGISTERED',
        error: 'An account with this mobile number already exists.',
      };
    }

    // Rate limit per IP and per mobile number (15 min rolling window)
    const ipLimit = this.db.consumeRateLimit(`send:mobile:ip:${params.clientIp}`, 15, 15 * 60 * 1000, nowMs);
    if (!ipLimit.allowed) {
      return {
        ok: false,
        statusCode: 429,
        code: 'RATE_LIMITED',
        error: `Too many SMS verification requests from this network. Try again in ${ipLimit.retryAfterSec}s.`,
        retryAfterSec: ipLimit.retryAfterSec,
      };
    }

    const mobileLimit = this.db.consumeRateLimit(
      `send:mobile:id:${normalized.e164}`,
      5,
      15 * 60 * 1000,
      nowMs
    );
    if (!mobileLimit.allowed) {
      return {
        ok: false,
        statusCode: 429,
        code: 'RATE_LIMITED',
        error: `Too many SMS OTP requests for this number. Please wait ${mobileLimit.retryAfterSec}s.`,
        retryAfterSec: mobileLimit.retryAfterSec,
      };
    }

    // Enforce strict 60-second resend cooldown
    const latest = this.db.getLatestChallengeForIdentifier('mobile', normalized.e164);
    if (latest && nowMs - latest.lastSentAtMs < this.cfg.resendCooldownMs) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((latest.lastSentAtMs + this.cfg.resendCooldownMs - nowMs) / 1000)
      );
      return {
        ok: false,
        statusCode: 429,
        code: 'RESEND_COOLDOWN',
        error: `Please wait ${retryAfterSec}s before requesting another SMS OTP.`,
        retryAfterSec,
      };
    }

    const otp = generateSecureSixDigitOtp();
    const expiresAtMs = nowMs + this.cfg.otpTtlMs;
    const resendAvailableAtMs = nowMs + this.cfg.resendCooldownMs;

    const delivery = await dispatchSmsOtp({
      mobile: normalized,
      otp,
      expiresInMinutes: Math.max(1, Math.round(this.cfg.otpTtlMs / 60000)),
      cfg: this.cfg,
    });

    if (!delivery.ok) {
      return {
        ok: false,
        statusCode: delivery.statusCode,
        code: delivery.code,
        error: delivery.error,
      };
    }

    const otpHash = hashOtpValue({
      registrationSessionId: sessionId,
      channel: 'mobile',
      identifier: normalized.e164,
      otp,
      secret: this.cfg.otpHashSecret,
    });

    this.db.invalidatePendingChallenges(sessionId, 'mobile', nowMs);
    this.db.insertOtpChallenge({
      id: `ch_${crypto.randomUUID().replace(/-/g, '')}`,
      registrationSessionId: sessionId,
      channel: 'mobile',
      identifier: normalized.e164,
      fullName: null,
      otpHash,
      expiresAtMs,
      lastSentAtMs: nowMs,
      attempts: 0,
      maxAttempts: this.cfg.maxOtpAttempts,
      verifiedAtMs: null,
      consumedAtMs: null,
      createdAtMs: nowMs,
    });

    return {
      ok: true,
      registrationSessionId: sessionId,
      channel: 'mobile',
      normalizedIdentifier: normalized.e164,
      expiresAtMs,
      resendAvailableAtMs,
      expiresInSec: Math.floor(this.cfg.otpTtlMs / 1000),
      resendCooldownSec: Math.floor(this.cfg.resendCooldownMs / 1000),
      demoMode: this.cfg.demoMode,
      message: this.cfg.demoMode
        ? `Verification SMS sent to ${normalized.e164}. (DEMO MODE: enter 123456 or check the server console.)`
        : `A 6-digit SMS verification code has been sent to ${normalized.e164}.`,
    };
  }

  public verifyOtp(params: {
    channel: OtpChannel;
    identifier: string;
    otp: string;
    registrationSessionId?: string;
    clientIp: string;
  }): VerifyOtpSuccess | ServiceError {
    const nowMs = nowOf(this.cfg);
    let normalizedIdentifier = '';

    if (params.channel === 'email') {
      normalizedIdentifier = normalizeEmailAddress(params.identifier);
    } else {
      const mobile = normalizeIndianMobile(params.identifier);
      if (!mobile) {
        return {
          ok: false,
          statusCode: 400,
          code: 'INVALID_MOBILE',
          error: 'Enter a valid Indian mobile number (+91).',
        };
      }
      normalizedIdentifier = mobile.e164;
    }

    // Brute-force rate limit on verify endpoint (per IP + per identifier)
    const ipLimit = this.db.consumeRateLimit(`verify:ip:${params.clientIp}`, 30, 15 * 60 * 1000, nowMs);
    if (!ipLimit.allowed) {
      return {
        ok: false,
        statusCode: 429,
        code: 'RATE_LIMITED',
        error: `Too many verification attempts. Please try again in ${ipLimit.retryAfterSec}s.`,
        retryAfterSec: ipLimit.retryAfterSec,
      };
    }

    const challenge = params.registrationSessionId
      ? this.db.getLatestChallengeBySessionAndIdentifier(
          params.registrationSessionId,
          params.channel,
          normalizedIdentifier
        )
      : this.db.getLatestChallengeForIdentifier(params.channel, normalizedIdentifier);

    if (!challenge) {
      return {
        ok: false,
        statusCode: 400,
        code: 'OTP_NOT_FOUND',
        error: `No active verification code found for this ${params.channel}. Request a new OTP first.`,
      };
    }

    if (challenge.verifiedAtMs !== null || challenge.consumedAtMs !== null) {
      return {
        ok: false,
        statusCode: 400,
        code: 'OTP_ALREADY_USED',
        error: 'This verification code has already been used or replaced. Request a new code if needed.',
      };
    }

    if (nowMs > challenge.expiresAtMs) {
      return {
        ok: false,
        statusCode: 400,
        code: 'OTP_EXPIRED',
        error: 'This verification code has expired after 5 minutes. Please request a fresh OTP.',
      };
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      return {
        ok: false,
        statusCode: 429,
        code: 'MAX_ATTEMPTS_EXCEEDED',
        error: `Maximum ${challenge.maxAttempts} incorrect attempts reached. Please request a new OTP.`,
        remainingAttempts: 0,
      };
    }

    const submittedHash = hashOtpValue({
      registrationSessionId: challenge.registrationSessionId,
      channel: challenge.channel,
      identifier: challenge.identifier,
      otp: params.otp.trim(),
      secret: this.cfg.otpHashSecret,
    });

    const matchesStoredHash = safeTimingEqualHex(submittedHash, challenge.otpHash);

    // Demo shortcut (123456) is ONLY permitted when DEMO_MODE=true; never in production mode
    const demoShortcutHash = hashOtpValue({
      registrationSessionId: challenge.registrationSessionId,
      channel: challenge.channel,
      identifier: challenge.identifier,
      otp: this.cfg.demoOtpCode,
      secret: this.cfg.otpHashSecret,
    });
    const matchesDemoShortcut =
      this.cfg.demoMode && safeTimingEqualHex(submittedHash, demoShortcutHash);

    if (!matchesStoredHash && !matchesDemoShortcut) {
      const updatedAttempts = this.db.incrementChallengeAttempts(challenge.id);
      const remaining = Math.max(0, challenge.maxAttempts - updatedAttempts);
      if (remaining === 0) {
        return {
          ok: false,
          statusCode: 429,
          code: 'MAX_ATTEMPTS_EXCEEDED',
          error: `Incorrect OTP. Maximum ${challenge.maxAttempts} attempts reached — please request a new code.`,
          remainingAttempts: 0,
        };
      }
      return {
        ok: false,
        statusCode: 400,
        code: 'INVALID_OTP',
        error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        remainingAttempts: remaining,
      };
    }

    // Atomically mark OTP challenge verified & consumed (prevents replay)
    const marked = this.db.markChallengeVerified(challenge.id, nowMs);
    if (!marked) {
      return {
        ok: false,
        statusCode: 409,
        code: 'OTP_ALREADY_USED',
        error: 'This verification code was already verified.',
      };
    }

    // Issue short-lived signed JWT verification token bound to this registration session & channel
    const signed = signVerificationToken({
      registrationSessionId: challenge.registrationSessionId,
      channel: challenge.channel,
      identifier: challenge.identifier,
      fullName: challenge.fullName ?? undefined,
      ttlSec: this.cfg.verificationTokenTtlSec,
      secret: this.cfg.jwtSecret,
      nowMs,
    });

    this.db.insertVerificationToken({
      jti: signed.jti,
      registrationSessionId: challenge.registrationSessionId,
      channel: challenge.channel,
      identifier: challenge.identifier,
      fullName: challenge.fullName,
      signedJwt: signed.token,
      expiresAtMs: signed.expiresAtMs,
      consumedAtMs: null,
      createdAtMs: nowMs,
    });

    return {
      ok: true,
      registrationSessionId: challenge.registrationSessionId,
      channel: challenge.channel,
      normalizedIdentifier: challenge.identifier,
      verificationToken: signed.token,
      tokenExpiresAtMs: signed.expiresAtMs,
      message:
        challenge.channel === 'email'
          ? 'Email address verified successfully.'
          : 'Indian mobile number (+91) verified successfully.',
    };
  }

  public getSessionState(registrationSessionId: string): ServerSessionState {
    const nowMs = nowOf(this.cfg);
    const emailToken = this.db.getActiveVerificationTokenForSession(registrationSessionId, 'email', nowMs);
    const mobileToken = this.db.getActiveVerificationTokenForSession(registrationSessionId, 'mobile', nowMs);
    const latestEmailChallenge = this.db.getLatestChallengeForSession(registrationSessionId, 'email');
    const latestMobileChallenge = this.db.getLatestChallengeForSession(registrationSessionId, 'mobile');

    const buildChannelState = (
      channel: OtpChannel,
      token: ReturnType<RegistrationDatabase['getActiveVerificationTokenForSession']>,
      challenge: ReturnType<RegistrationDatabase['getLatestChallengeForSession']>
    ): SessionChannelState => {
      if (token) {
        return {
          status: 'verified',
          identifier: token.identifier,
          maskedIdentifier: channel === 'mobile' ? maskIndianMobile(token.identifier) : token.identifier,
          expiresAtMs: token.expiresAtMs,
          resendAvailableAtMs: null,
          attemptsRemaining: null,
          verificationToken: token.signedJwt,
        };
      }

      if (challenge && challenge.consumedAtMs === null && challenge.verifiedAtMs === null) {
        const isExpired = nowMs > challenge.expiresAtMs;
        return {
          status: isExpired ? 'expired' : 'otp_sent',
          identifier: challenge.identifier,
          maskedIdentifier: channel === 'mobile' ? maskIndianMobile(challenge.identifier) : challenge.identifier,
          expiresAtMs: challenge.expiresAtMs,
          resendAvailableAtMs: challenge.lastSentAtMs + this.cfg.resendCooldownMs,
          attemptsRemaining: Math.max(0, challenge.maxAttempts - challenge.attempts),
          verificationToken: null,
        };
      }

      return {
        status: 'idle',
        identifier: null,
        maskedIdentifier: null,
        expiresAtMs: null,
        resendAvailableAtMs: null,
        attemptsRemaining: null,
        verificationToken: null,
      };
    };

    const emailState = buildChannelState('email', emailToken, latestEmailChallenge);
    const mobileState = buildChannelState('mobile', mobileToken, latestMobileChallenge);
    const fullName = emailToken?.fullName || latestEmailChallenge?.fullName || '';

    return {
      registrationSessionId,
      fullName,
      email: emailState,
      mobile: mobileState,
      bothVerified: emailState.status === 'verified' && mobileState.status === 'verified',
      demoMode: this.cfg.demoMode,
    };
  }

  public resetSession(registrationSessionId: string): string {
    const nowMs = nowOf(this.cfg);
    this.db.revokeSessionRecords(registrationSessionId, nowMs);
    return createRegistrationSessionId();
  }
}
