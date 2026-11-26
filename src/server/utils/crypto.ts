import crypto from 'node:crypto';

export type OtpChannel = 'email' | 'mobile';

export interface NormalizedIndianMobile {
  e164: string; // +919876543210
  msg91Mobile: string; // 919876543210
  national10: string; // 9876543210
  masked: string; // +91 ••••••3210
}

/**
 * Generates a cryptographically secure, uniformly distributed 6-digit OTP
 * in the inclusive range [100000, 999999] with zero modulo bias.
 */
export function generateSecureSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Computes an HMAC-SHA-256 hash of the OTP bound to session, channel, and normalized identifier
 * using the server-side pepper secret. Plaintext OTPs are never stored.
 */
export function hashOtpValue(params: {
  registrationSessionId: string;
  channel: OtpChannel;
  identifier: string;
  otp: string;
  secret: string;
}): string {
  return crypto
    .createHmac('sha256', params.secret)
    .update(`${params.registrationSessionId}|${params.channel}|${params.identifier}|${params.otp}`)
    .digest('hex');
}

/**
 * Constant-time hex string comparison to prevent timing side-channel leaks.
 */
export function safeTimingEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Normalizes an email address consistently: trimmed and lowercased.
 */
export function normalizeEmailAddress(raw: string): string {
  return raw.trim().toLowerCase();
}

const STRICT_EMAIL_REGEX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isValidEmailAddress(raw: string): boolean {
  const normalized = normalizeEmailAddress(raw);
  if (normalized.length < 5 || normalized.length > 254) return false;
  return STRICT_EMAIL_REGEX.test(normalized);
}

/**
 * Strictly validates and normalizes Indian mobile numbers.
 * Accepts:
 *   - 10-digit numbers starting with 6, 7, 8, or 9 (e.g. "9876543210")
 *   - +91-prefixed numbers (e.g. "+91 9876543210", "+91-98765-43210")
 * Rejects invalid country codes (e.g. +1, +44) and malformed lengths or leading digits 0-5.
 */
export function normalizeIndianMobile(raw: string): NormalizedIndianMobile | null {
  const compact = raw.trim().replace(/[\s\-()]/g, '');

  // Reject any non-Indian explicit international prefix immediately
  if (compact.startsWith('+') && !compact.startsWith('+91')) {
    return null;
  }

  let national10 = '';
  if (/^\+91[6-9]\d{9}$/.test(compact)) {
    national10 = compact.slice(3);
  } else if (/^[6-9]\d{9}$/.test(compact)) {
    national10 = compact;
  } else {
    return null;
  }

  const e164 = `+91${national10}`;
  return {
    e164,
    msg91Mobile: `91${national10}`,
    national10,
    masked: maskIndianMobile(e164),
  };
}

export function maskIndianMobile(e164: string): string {
  const match = e164.match(/^\+91(\d{6})(\d{4})$/);
  if (!match) return '+91 ••••••';
  return `+91 ••••••${match[2]}`;
}

export function sanitizeFullName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function createRegistrationSessionId(): string {
  return `reg_${crypto.randomBytes(18).toString('base64url')}`;
}
