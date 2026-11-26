import crypto from 'node:crypto';
import path from 'node:path';

export interface AppEnvConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  demoMode: boolean;
  demoOtpCode: string;
  resendApiKey: string;
  resendFromEmail: string;
  msg91AuthKey: string;
  msg91TemplateId: string;
  jwtSecret: string;
  otpHashSecret: string;
  databaseUrl: string;
  sqlitePath: string;
  clientOrigin: string;
  allowedOrigins: string[];
  otpTtlMs: number;
  resendCooldownMs: number;
  maxOtpAttempts: number;
  verificationTokenTtlSec: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

export type AppEnvOverrides = Partial<AppEnvConfig>;

// Ephemeral in-memory fallback secrets for dev/demo runs when env secrets are unset.
// Never written to disk and never reused across production deployments.
const ephemeralJwtSecret = crypto.randomBytes(32).toString('hex');
const ephemeralOtpSecret = crypto.randomBytes(32).toString('hex');

export function loadEnvConfig(overrides: AppEnvOverrides = {}): AppEnvConfig {
  const rawNodeEnv = (overrides.nodeEnv ?? process.env.NODE_ENV ?? 'development').toLowerCase();
  const nodeEnv: AppEnvConfig['nodeEnv'] =
    rawNodeEnv === 'production' ? 'production' : rawNodeEnv === 'test' ? 'test' : 'development';

  // DEMO_MODE strictly defaults to false in production.
  // In development/AI Studio preview, DEMO_MODE defaults to true unless explicitly disabled ("false").
  let demoMode: boolean;
  if (typeof overrides.demoMode === 'boolean') {
    demoMode = overrides.demoMode;
  } else if (nodeEnv === 'production') {
    demoMode = process.env.DEMO_MODE === 'true';
  } else {
    demoMode = process.env.DEMO_MODE !== 'false';
  }

  const port = overrides.port ?? (Number(process.env.PORT) || 3000);
  const resendApiKey = (overrides.resendApiKey ?? process.env.RESEND_API_KEY ?? '').trim();
  const resendFromEmail = (overrides.resendFromEmail ?? process.env.RESEND_FROM_EMAIL ?? '').trim();
  const msg91AuthKey = (overrides.msg91AuthKey ?? process.env.MSG91_AUTH_KEY ?? '').trim();
  const msg91TemplateId = (overrides.msg91TemplateId ?? process.env.MSG91_TEMPLATE_ID ?? '').trim();

  const jwtSecret = (overrides.jwtSecret ?? process.env.JWT_SECRET ?? '').trim() || ephemeralJwtSecret;
  const otpHashSecret = (overrides.otpHashSecret ?? process.env.OTP_HASH_SECRET ?? '').trim() || ephemeralOtpSecret;

  if (nodeEnv === 'production' && !demoMode) {
    if (!process.env.JWT_SECRET?.trim() && !overrides.jwtSecret) {
      console.warn(
        '[security] JWT_SECRET is not set in production; using an ephemeral secret. Configure JWT_SECRET in your environment before deploying.'
      );
    }
    if (!process.env.OTP_HASH_SECRET?.trim() && !overrides.otpHashSecret) {
      console.warn(
        '[security] OTP_HASH_SECRET is not set in production; using an ephemeral secret. Configure OTP_HASH_SECRET in your environment before deploying.'
      );
    }
  }

  const databaseUrl = (overrides.databaseUrl ?? process.env.DATABASE_URL ?? '').trim();
  const sqlitePath =
    overrides.sqlitePath ??
    (databaseUrl.startsWith('file:')
      ? databaseUrl.replace(/^file:/, '')
      : path.resolve(process.cwd(), 'data', 'dual-otp-auth.sqlite'));

  const clientOrigin = (overrides.clientOrigin ?? process.env.CLIENT_ORIGIN ?? 'http://localhost:3000').trim();
  const configuredOrigins = clientOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const defaultDevOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ];

  const allowedOrigins = Array.from(
    new Set([...configuredOrigins, ...(nodeEnv !== 'production' ? defaultDevOrigins : [])])
  );

  return {
    nodeEnv,
    port,
    demoMode,
    demoOtpCode: '123456',
    resendApiKey,
    resendFromEmail,
    msg91AuthKey,
    msg91TemplateId,
    jwtSecret,
    otpHashSecret,
    databaseUrl,
    sqlitePath,
    clientOrigin: configuredOrigins[0] || 'http://localhost:3000',
    allowedOrigins,
    otpTtlMs: overrides.otpTtlMs ?? 5 * 60 * 1000, // 5 minutes
    resendCooldownMs: overrides.resendCooldownMs ?? 60 * 1000, // 60 seconds
    maxOtpAttempts: overrides.maxOtpAttempts ?? 5,
    verificationTokenTtlSec: overrides.verificationTokenTtlSec ?? 15 * 60, // 15 minutes
    now: overrides.now,
    fetchImpl: overrides.fetchImpl,
  };
}

export function getProviderReadiness(cfg: AppEnvConfig): {
  emailReady: boolean;
  smsReady: boolean;
  missingEmailEnv: string[];
  missingSmsEnv: string[];
} {
  const missingEmailEnv: string[] = [];
  if (!cfg.resendApiKey) missingEmailEnv.push('RESEND_API_KEY');
  if (!cfg.resendFromEmail) missingEmailEnv.push('RESEND_FROM_EMAIL');

  const missingSmsEnv: string[] = [];
  if (!cfg.msg91AuthKey) missingSmsEnv.push('MSG91_AUTH_KEY');
  if (!cfg.msg91TemplateId) missingSmsEnv.push('MSG91_TEMPLATE_ID');

  return {
    emailReady: cfg.demoMode || missingEmailEnv.length === 0,
    smsReady: cfg.demoMode || missingSmsEnv.length === 0,
    missingEmailEnv,
    missingSmsEnv,
  };
}
