import crypto from 'node:crypto';
import type { OtpChannel, UserRole } from '../types/marketplace';

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const OTP_RESEND_COOLDOWN_MS = 45 * 1000; // 45 seconds
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface OtpChallengeRecord {
  id: string;
  identifier: string;
  channel: OtpChannel;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAtMs: number;
  resendAvailableAtMs: number;
  consumed: boolean;
  createdAtMs: number;
}

export interface SessionPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export function normalizeIdentifier(identifier: string, channel: OtpChannel): string {
  const trimmed = identifier.trim();
  if (channel === 'email') {
    return trimmed.toLowerCase();
  }
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export function generateNumericOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashOtp(
  identifier: string,
  channel: OtpChannel,
  code: string,
  secret: string
): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${channel}:${identifier}:${code}`)
    .digest('hex');
}

export function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createOtpChallenge(
  identifier: string,
  channel: OtpChannel,
  secret: string,
  nowMs = Date.now()
): { record: OtpChallengeRecord; code: string } {
  const normalized = normalizeIdentifier(identifier, channel);
  const code = generateNumericOtp();
  const codeHash = hashOtp(normalized, channel, code, secret);

  const record: OtpChallengeRecord = {
    id: `otp_${crypto.randomBytes(8).toString('hex')}`,
    identifier: normalized,
    channel,
    codeHash,
    attempts: 0,
    maxAttempts: OTP_MAX_ATTEMPTS,
    expiresAtMs: nowMs + OTP_TTL_MS,
    resendAvailableAtMs: nowMs + OTP_RESEND_COOLDOWN_MS,
    consumed: false,
    createdAtMs: nowMs,
  };

  return { record, code };
}

export function checkResendCooldown(
  existing: OtpChallengeRecord | undefined,
  nowMs = Date.now()
): { allowed: boolean; retryAfterSec: number } {
  if (!existing || existing.consumed) {
    return { allowed: true, retryAfterSec: 0 };
  }
  const remaining = existing.resendAvailableAtMs - nowMs;
  if (remaining > 0) {
    return { allowed: false, retryAfterSec: Math.ceil(remaining / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export type OtpVerificationResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'CONSUMED' | 'EXPIRED' | 'MAX_ATTEMPTS' | 'INVALID_CODE'; remainingAttempts: number };

export function verifyOtpChallenge(
  record: OtpChallengeRecord | undefined,
  submittedCode: string,
  secret: string,
  nowMs = Date.now()
): OtpVerificationResult {
  if (!record) {
    return { ok: false, code: 'NOT_FOUND', remainingAttempts: 0 };
  }
  if (record.consumed) {
    return { ok: false, code: 'CONSUMED', remainingAttempts: 0 };
  }
  if (nowMs > record.expiresAtMs) {
    return { ok: false, code: 'EXPIRED', remainingAttempts: 0 };
  }
  if (record.attempts >= record.maxAttempts) {
    return { ok: false, code: 'MAX_ATTEMPTS', remainingAttempts: 0 };
  }

  const expectedHash = hashOtp(record.identifier, record.channel, submittedCode.trim(), secret);
  if (timingSafeHexEqual(record.codeHash, expectedHash)) {
    record.consumed = true;
    return { ok: true };
  }

  record.attempts += 1;
  const remaining = Math.max(0, record.maxAttempts - record.attempts);
  return {
    ok: false,
    code: remaining === 0 ? 'MAX_ATTEMPTS' : 'INVALID_CODE',
    remainingAttempts: remaining,
  };
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  consume(key: string, nowMs = Date.now()): { allowed: boolean; retryAfterSec: number; remaining: number } {
    const cutoff = nowMs - this.windowMs;
    const timestamps = (this.buckets.get(key) || []).filter((t) => t > cutoff);

    if (timestamps.length >= this.maxRequests) {
      const oldest = timestamps[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - nowMs) / 1000));
      this.buckets.set(key, timestamps);
      return { allowed: false, retryAfterSec, remaining: 0 };
    }

    timestamps.push(nowMs);
    this.buckets.set(key, timestamps);
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, this.maxRequests - timestamps.length),
    };
  }
}

export function signSessionToken(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
  secret: string,
  nowMs = Date.now()
): string {
  const fullPayload: SessionPayload = {
    ...payload,
    iat: nowMs,
    exp: nowMs + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  nowMs = Date.now()
): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!timingSafeHexEqual(sig, expectedSig)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!decoded.sub || !decoded.email || !decoded.role || typeof decoded.exp !== 'number') {
      return null;
    }
    if (nowMs > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function signRazorpayPayment(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  secret: string
): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
}

export function verifyRazorpayPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
  secret: string
): boolean {
  if (!razorpayOrderId || !razorpayPaymentId || !signature || !secret) return false;
  const expected = signRazorpayPayment(razorpayOrderId, razorpayPaymentId, secret);
  return timingSafeHexEqual(expected, signature);
}

export function signRazorpayWebhookPayload(rawBody: string, webhookSecret: string): string {
  return crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
}

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  headerSignature: string,
  webhookSecret: string
): boolean {
  if (!rawBody || !headerSignature || !webhookSecret) return false;
  const expected = signRazorpayWebhookPayload(rawBody, webhookSecret);
  return timingSafeHexEqual(expected, headerSignature);
}

export function sanitizeExternalUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('/src/assets/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed;
    }
  } catch {
    return '';
  }
  return '';
}
