import type { NextFunction, Request, Response } from 'express';
import type { AppEnvConfig } from '../config/env.ts';
import type { RegistrationDatabase } from '../database/db.ts';
import { extractClientIp } from './security.ts';

export function createIpRateLimitMiddleware(params: {
  db: RegistrationDatabase;
  cfg: AppEnvConfig;
  scope: string;
  maxRequests: number;
  windowMs: number;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = extractClientIp(req);
    const nowMs = params.cfg.now ? params.cfg.now() : Date.now();
    const verdict = params.db.consumeRateLimit(
      `mw:${params.scope}:${ip}`,
      params.maxRequests,
      params.windowMs,
      nowMs
    );

    if (!verdict.allowed) {
      res.setHeader('Retry-After', String(verdict.retryAfterSec));
      res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        error: `Too many requests from this IP address. Please retry in ${verdict.retryAfterSec}s.`,
        retryAfterSec: verdict.retryAfterSec,
      });
      return;
    }

    next();
  };
}
