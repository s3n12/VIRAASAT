import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { AppEnvConfig } from '../config/env.ts';
import { signSessionCookie, verifySessionCookie } from '../utils/jwt.ts';

export const SESSION_COOKIE_NAME = 'dual_otp_reg_sid';

export function buildHelmetMiddleware() {
  return helmet({
    // Disable CSP and X-Frame-Options so the Vite preview renders cleanly inside AI Studio's iframe
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: false,
  });
}

export function buildCorsMiddleware(cfg: AppEnvConfig) {
  return cors({
    origin: (origin, callback) => {
      // Allow same-origin requests and server-to-server / test requests without an Origin header
      if (!origin) {
        callback(null, true);
        return;
      }

      if (cfg.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // Allow Google AI Studio preview origins (*.run.app) so preview iframe API requests succeed
      try {
        const parsed = new URL(origin);
        if (
          parsed.protocol === 'https:' &&
          (parsed.hostname.endsWith('.run.app') || parsed.hostname.endsWith('.aistudio.google.com'))
        ) {
          callback(null, true);
          return;
        }
      } catch {
        // Fall through to rejection
      }

      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'X-Registration-Session'],
    maxAge: 600,
  });
}

export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function readRegistrationSessionFromRequest(
  req: Request,
  cfg: AppEnvConfig
): string | undefined {
  // 1. Prefer server-signed HttpOnly session cookie (used by browser across refreshes)
  const cookies = parseCookieHeader(req.headers.cookie);
  const fromCookie = verifySessionCookie(cookies[SESSION_COOKIE_NAME], cfg.jwtSecret);
  if (fromCookie) return fromCookie;

  // 2. Fallback to explicit header or body for stateless REST clients / tests
  const fromHeader = req.headers['x-registration-session'];
  if (typeof fromHeader === 'string' && /^reg_[A-Za-z0-9_-]{12,64}$/.test(fromHeader.trim())) {
    return fromHeader.trim();
  }

  const fromBody =
    req.body && typeof req.body === 'object' && typeof req.body.registrationSessionId === 'string'
      ? req.body.registrationSessionId.trim()
      : '';
  if (/^reg_[A-Za-z0-9_-]{12,64}$/.test(fromBody)) {
    return fromBody;
  }

  return undefined;
}

export function writeRegistrationSessionCookie(
  req: Request,
  res: Response,
  registrationSessionId: string,
  cfg: AppEnvConfig
): void {
  const signed = signSessionCookie(registrationSessionId, cfg.jwtSecret);
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '')
      .toLowerCase()
      .includes('https');

  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(signed)}`,
    'Path=/',
    'HttpOnly',
    'Max-Age=3600',
  ];

  if (isHttps) {
    // Required for third-party preview iframes (Chrome CHIPS)
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearRegistrationSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '')
      .toLowerCase()
      .includes('https');

  const parts = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * Protects cookie-authenticated state-changing endpoints against CSRF by checking
 * either a matching Origin/Host or the custom X-Requested-With header.
 */
export function requireCsrfCheck(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  const hasSessionCookie = Boolean(cookies[SESSION_COOKIE_NAME]);
  if (!hasSessionCookie) {
    next();
    return;
  }

  const xRequestedWith = String(req.headers['x-requested-with'] || '');
  if (xRequestedWith === 'DualOTP-Client') {
    next();
    return;
  }

  const origin = req.headers.origin;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) {
        next();
        return;
      }
    } catch {
      // invalid origin
    }
  }

  res.status(403).json({
    ok: false,
    code: 'CSRF_CHECK_FAILED',
    error: 'Cross-site request rejected.',
  });
}

export function apiErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({
      ok: false,
      code: 'INVALID_JSON',
      error: 'Request body must be valid JSON.',
    });
    return;
  }

  if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      ok: false,
      code: 'PAYLOAD_TOO_LARGE',
      error: 'Request payload exceeds the maximum allowed size.',
    });
    return;
  }

  res.status(500).json({
    ok: false,
    code: 'INTERNAL_SERVER_ERROR',
    error: 'An unexpected server error occurred. Please try again.',
  });
}
