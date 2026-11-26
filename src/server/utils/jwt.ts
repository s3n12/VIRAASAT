import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { OtpChannel } from './crypto.ts';

const JWT_ISSUER = 'dual-otp-registration-api';
const JWT_AUDIENCE_VERIFICATION = 'dual-otp-channel-verification';
const JWT_AUDIENCE_SESSION = 'dual-otp-registration-session';

export interface VerificationTokenClaims {
  jti: string;
  sub: string; // registrationSessionId
  channel: OtpChannel;
  identifier: string; // normalized email or E.164 +91 mobile
  fullName?: string;
  iat: number;
  exp: number;
}

export interface SignedVerificationTokenResult {
  token: string;
  jti: string;
  expiresAtMs: number;
}

export function signVerificationToken(params: {
  registrationSessionId: string;
  channel: OtpChannel;
  identifier: string;
  fullName?: string;
  ttlSec: number;
  secret: string;
  nowMs?: number;
}): SignedVerificationTokenResult {
  const nowSec = Math.floor((params.nowMs ?? Date.now()) / 1000);
  const expSec = nowSec + params.ttlSec;
  const jti = `vt_${crypto.randomUUID().replace(/-/g, '')}`;

  const payload: Omit<VerificationTokenClaims, 'iat' | 'exp'> & { iat: number; exp: number } = {
    jti,
    sub: params.registrationSessionId,
    channel: params.channel,
    identifier: params.identifier,
    ...(params.fullName ? { fullName: params.fullName } : {}),
    iat: nowSec,
    exp: expSec,
  };

  const token = jwt.sign(payload, params.secret, {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE_VERIFICATION,
  });

  return {
    token,
    jti,
    expiresAtMs: expSec * 1000,
  };
}

export function verifyVerificationToken(params: {
  token: string;
  expectedChannel: OtpChannel;
  secret: string;
  nowMs?: number;
}): { ok: true; claims: VerificationTokenClaims } | { ok: false; error: string; code: string } {
  try {
    const decoded = jwt.verify(params.token, params.secret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE_VERIFICATION,
      clockTimestamp: params.nowMs ? Math.floor(params.nowMs / 1000) : undefined,
    }) as Partial<VerificationTokenClaims>;

    if (
      !decoded ||
      typeof decoded !== 'object' ||
      typeof decoded.jti !== 'string' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.identifier !== 'string' ||
      (decoded.channel !== 'email' && decoded.channel !== 'mobile') ||
      typeof decoded.iat !== 'number' ||
      typeof decoded.exp !== 'number'
    ) {
      return {
        ok: false,
        code: 'INVALID_TOKEN_CLAIMS',
        error: 'Verification token payload is malformed.',
      };
    }

    if (decoded.channel !== params.expectedChannel) {
      return {
        ok: false,
        code: 'TOKEN_CHANNEL_MISMATCH',
        error: `Expected a ${params.expectedChannel} verification token.`,
      };
    }

    return {
      ok: true,
      claims: decoded as VerificationTokenClaims,
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return {
        ok: false,
        code: 'TOKEN_EXPIRED',
        error: `Your ${params.expectedChannel} verification has expired. Please verify again.`,
      };
    }
    return {
      ok: false,
      code: 'TOKEN_INVALID',
      error: `Invalid ${params.expectedChannel} verification token signature.`,
    };
  }
}

/**
 * Signs an opaque registration session cookie value so the browser cannot forge
 * or guess another user's registrationSessionId across page refreshes.
 */
export function signSessionCookie(registrationSessionId: string, secret: string): string {
  return jwt.sign({ sub: registrationSessionId }, secret, {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE_SESSION,
    expiresIn: '1h',
  });
}

export function verifySessionCookie(cookieValue: string | undefined, secret: string): string | null {
  if (!cookieValue) return null;
  try {
    const decoded = jwt.verify(cookieValue, secret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE_SESSION,
    }) as { sub?: unknown };
    return typeof decoded.sub === 'string' && decoded.sub.startsWith('reg_') ? decoded.sub : null;
  } catch {
    return null;
  }
}
