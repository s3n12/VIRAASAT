import { createClient, type SupabaseClient, type User as SupabaseUser } from '@supabase/supabase-js';
import { normalizeIndianPhone } from '../lib/security.ts';
import type { AccountStatus, UserProfile, UserRole } from '../types/marketplace.ts';

export interface SupabaseAuthEnvConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  smsHookSecret: string;
  msg91AuthKey: string;
  msg91TemplateId: string;
  msg91SenderId: string;
  msg91OtpVarName: string;
  turnstileSecretKey: string;
  turnstileSiteKey: string;
  fetchImpl?: typeof fetch;
}

export interface AuthProviderStatus {
  supabaseAuthConfigured: boolean;
  smsHookConfigured: boolean;
  msg91Configured: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
  missingVariables: string[];
}

function sanitizeEnvValue(raw: string | undefined): string {
  const val = (raw ?? '').trim();
  if (!val) return '';
  if (/^(MY_|YOUR_|<|REPLACE_|PLACEHOLDER)/i.test(val)) return '';
  return val;
}

function isValidHttpUrl(val: string): boolean {
  try {
    const parsed = new URL(val);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function readSupabaseAuthEnv(
  overrides: Partial<SupabaseAuthEnvConfig> = {}
): SupabaseAuthEnvConfig {
  const rawUrl = sanitizeEnvValue(
    overrides.supabaseUrl ??
      process.env.SUPABASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.VITE_SUPABASE_URL
  );
  return {
    supabaseUrl: isValidHttpUrl(rawUrl) ? rawUrl : '',
    supabaseAnonKey: sanitizeEnvValue(
      overrides.supabaseAnonKey ??
        process.env.SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.VITE_SUPABASE_ANON_KEY
    ),
    supabaseServiceRoleKey: sanitizeEnvValue(
      overrides.supabaseServiceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    smsHookSecret: sanitizeEnvValue(
      overrides.smsHookSecret ?? process.env.SUPABASE_SMS_HOOK_SECRET
    ),
    msg91AuthKey: sanitizeEnvValue(
      overrides.msg91AuthKey ?? process.env.MSG91_AUTH_KEY
    ),
    msg91TemplateId: sanitizeEnvValue(
      overrides.msg91TemplateId ?? process.env.MSG91_TEMPLATE_ID
    ),
    msg91SenderId:
      sanitizeEnvValue(overrides.msg91SenderId ?? process.env.MSG91_SENDER_ID) || 'VRSATP',
    msg91OtpVarName:
      sanitizeEnvValue(overrides.msg91OtpVarName ?? process.env.MSG91_OTP_VAR_NAME) || 'otp',
    turnstileSecretKey: sanitizeEnvValue(
      overrides.turnstileSecretKey ?? process.env.TURNSTILE_SECRET_KEY
    ),
    turnstileSiteKey: sanitizeEnvValue(
      overrides.turnstileSiteKey ??
        process.env.VITE_TURNSTILE_SITE_KEY ??
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    ),
    fetchImpl: overrides.fetchImpl,
  };
}

export function getAuthProviderStatus(cfg: SupabaseAuthEnvConfig): AuthProviderStatus {
  const missing: string[] = [];
  if (!cfg.supabaseUrl || !isValidHttpUrl(cfg.supabaseUrl)) missing.push('SUPABASE_URL');
  if (!cfg.supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  if (!cfg.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!cfg.smsHookSecret) missing.push('SUPABASE_SMS_HOOK_SECRET');
  if (!cfg.msg91AuthKey) missing.push('MSG91_AUTH_KEY');
  if (!cfg.msg91TemplateId) missing.push('MSG91_TEMPLATE_ID');

  const supabaseAuthConfigured = Boolean(
    cfg.supabaseUrl &&
      isValidHttpUrl(cfg.supabaseUrl) &&
      cfg.supabaseAnonKey
  );
  const msg91Configured = Boolean(cfg.msg91AuthKey && cfg.msg91TemplateId);
  const smsHookConfigured = Boolean(cfg.smsHookSecret && msg91Configured);
  const turnstileEnabled = Boolean(cfg.turnstileSecretKey && cfg.turnstileSiteKey);

  return {
    supabaseAuthConfigured,
    smsHookConfigured,
    msg91Configured,
    turnstileEnabled,
    turnstileSiteKey: turnstileEnabled ? cfg.turnstileSiteKey : null,
    missingVariables: missing,
  };
}

export function createSupabaseAnonClient(
  cfg: SupabaseAuthEnvConfig,
  accessToken?: string
): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: cfg.fetchImpl ?? fetch,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    },
  });
}

export function createSupabaseAdminClient(cfg: SupabaseAuthEnvConfig): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: cfg.fetchImpl ?? fetch,
    },
  });
}

/**
 * Triggers Supabase Auth phone_change OTP for an already email-verified user
 * using their stateless Supabase JWT (`PUT /auth/v1/user`), which invokes the
 * configured Custom Send SMS Hook -> MSG91.
 */
export async function requestSupabasePhoneChangeOtp(params: {
  accessToken: string;
  phoneE164: string;
  cfg: SupabaseAuthEnvConfig;
}): Promise<{ error: { message: string } | null }> {
  const fetcher = params.cfg.fetchImpl ?? fetch;
  const baseUrl = params.cfg.supabaseUrl.replace(/\/+$/, '');
  const resp = await fetcher(`${baseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: params.cfg.supabaseAnonKey,
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone: params.phoneE164 }),
  });

  if (resp.ok) {
    return { error: null };
  }

  let message = `Supabase phone OTP request failed (HTTP ${resp.status})`;
  try {
    const data = (await resp.json()) as { msg?: string; message?: string; error_description?: string };
    message = data.msg || data.message || data.error_description || message;
  } catch {
    // keep status fallback
  }
  return { error: { message } };
}

/**
 * Verifies Cloudflare Turnstile CAPTCHA token server-side when configured.
 */
export async function verifyTurnstileToken(params: {
  token?: string;
  ipAddress: string;
  cfg: SupabaseAuthEnvConfig;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!params.cfg.turnstileSecretKey) {
    return { ok: true };
  }
  if (!params.token || params.token.trim().length < 10) {
    return { ok: false, error: 'Please complete the bot verification challenge before requesting an OTP.' };
  }

  const fetcher = params.cfg.fetchImpl ?? fetch;
  try {
    const form = new URLSearchParams();
    form.set('secret', params.cfg.turnstileSecretKey);
    form.set('response', params.token.trim());
    if (params.ipAddress) {
      form.set('remoteip', params.ipAddress);
    }

    const resp = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = (await resp.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (!resp.ok || !data.success) {
      return {
        ok: false,
        error: 'Bot protection verification failed or expired. Please retry the CAPTCHA.',
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'Unable to verify bot protection challenge right now. Please try again.',
    };
  }
}

/**
 * Forwards the exact OTP generated by Supabase Auth to MSG91 Flow v5 API.
 * Strictly validates Indian +91 mobile numbers and checks MSG91 response body.
 */
export async function sendOtpViaMsg91(params: {
  phone: string;
  otp: string;
  cfg: SupabaseAuthEnvConfig;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: string; statusCode: number }> {
  const { cfg } = params;
  if (!cfg.msg91AuthKey || !cfg.msg91TemplateId) {
    return {
      ok: false,
      statusCode: 503,
      error: 'MSG91 credentials (MSG91_AUTH_KEY, MSG91_TEMPLATE_ID) are not configured on the server.',
    };
  }

  const normalized = normalizeIndianPhone(params.phone);
  if (!normalized) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Only valid Indian mobile numbers with +91 country code are supported.',
    };
  }

  if (!/^\d{6}$/.test(params.otp.trim())) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Invalid 6-digit OTP payload received from Supabase Auth.',
    };
  }

  const recipient: Record<string, string> = {
    mobiles: normalized.msg91Mobile,
    otp: params.otp.trim(),
    var1: params.otp.trim(),
  };
  if (cfg.msg91OtpVarName && cfg.msg91OtpVarName !== 'otp' && cfg.msg91OtpVarName !== 'var1') {
    recipient[cfg.msg91OtpVarName] = params.otp.trim();
  }

  const fetcher = cfg.fetchImpl ?? fetch;
  try {
    const resp = await fetcher('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: {
        authkey: cfg.msg91AuthKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        template_id: cfg.msg91TemplateId,
        short_url: '0',
        recipients: [recipient],
      }),
    });

    const rawText = await resp.text();
    let parsed: { type?: string; message?: string; request_id?: string } = {};
    try {
      parsed = JSON.parse(rawText) as { type?: string; message?: string; request_id?: string };
    } catch {
      parsed = { message: rawText };
    }

    if (!resp.ok || parsed.type === 'error') {
      return {
        ok: false,
        statusCode: 502,
        error: `MSG91 SMS delivery rejected: ${parsed.message || `HTTP ${resp.status}`}`,
      };
    }

    return {
      ok: true,
      requestId: parsed.request_id || parsed.message || 'accepted',
    };
  } catch (err) {
    return {
      ok: false,
      statusCode: 502,
      error: `Failed to reach MSG91 SMS gateway: ${err instanceof Error ? err.message : 'network error'}`,
    };
  }
}

export interface SupabaseProfileRow {
  id: string;
  email: string;
  phone: string | null;
  display_name: string;
  email_verified: boolean;
  phone_verified: boolean;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  account_status: AccountStatus;
  user_role: UserRole;
  suspended: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Derives authoritative verification status directly from Supabase Auth user
 * (`email_confirmed_at` and `phone_confirmed_at`) and synchronizes `public.profiles`.
 * Never marks email_verified or phone_verified unless Supabase Auth confirmed it.
 */
export async function syncProfileFromSupabaseUser(params: {
  sbUser: SupabaseUser;
  displayNameOverride?: string;
  cfg: SupabaseAuthEnvConfig;
  existingLocal?: UserProfile;
}): Promise<UserProfile> {
  const { sbUser, displayNameOverride, cfg, existingLocal } = params;
  const now = new Date().toISOString();

  const email = (sbUser.email || existingLocal?.email || '').toLowerCase();
  const phone = sbUser.phone
    ? sbUser.phone.startsWith('+')
      ? sbUser.phone
      : `+${sbUser.phone}`
    : existingLocal?.phone || '';

  // Single source of truth: ONLY trust Supabase Auth confirmation timestamps
  const emailVerifiedAt = sbUser.email_confirmed_at || null;
  const phoneVerifiedAt = sbUser.phone_confirmed_at || null;
  const emailVerified = Boolean(emailVerifiedAt);
  const phoneVerified = Boolean(phoneVerifiedAt);

  const metaName =
    typeof sbUser.user_metadata?.display_name === 'string'
      ? sbUser.user_metadata.display_name.trim()
      : '';
  const fallbackName = email
    ? email
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : 'VIRAASAT Patron';
  const displayName =
    displayNameOverride?.trim() || existingLocal?.displayName || metaName || fallbackName;

  const isBootstrappedAdmin = email === 'shaninishad813@gmail.com' && emailVerified;
  let role: UserRole = existingLocal?.role || (isBootstrappedAdmin ? 'admin' : 'customer');
  let suspended = Boolean(existingLocal?.suspended);
  let accountStatus: AccountStatus = suspended
    ? 'suspended'
    : emailVerified && phoneVerified
      ? 'active'
      : 'pending_verification';

  // Persist authoritative state into Supabase PostgreSQL `public.profiles` when service role is set
  // (Otherwise the Postgres `on_auth_user_created_or_verified` trigger handles it automatically.)
  if (cfg.supabaseServiceRoleKey) {
    try {
      const adminClient = createSupabaseAdminClient(cfg);
      const { data: existingRow } = await adminClient
        .from('profiles')
        .select('user_role, suspended, display_name')
        .eq('id', sbUser.id)
        .maybeSingle();

      if (existingRow) {
        if (
          existingRow.user_role === 'admin' ||
          existingRow.user_role === 'seller' ||
          existingRow.user_role === 'customer'
        ) {
          role = existingRow.user_role;
        }
        if (typeof existingRow.suspended === 'boolean') {
          suspended = existingRow.suspended;
        }
      }

      accountStatus = suspended
        ? 'suspended'
        : emailVerified && phoneVerified
          ? 'active'
          : 'pending_verification';

      await adminClient.from('profiles').upsert(
        {
          id: sbUser.id,
          email,
          phone: phone || null,
          display_name: displayName,
          email_verified: emailVerified,
          phone_verified: phoneVerified,
          email_verified_at: emailVerifiedAt,
          phone_verified_at: phoneVerifiedAt,
          account_status: accountStatus,
          user_role: role,
          suspended,
          updated_at: now,
        },
        { onConflict: 'id' }
      );
    } catch {
      // If the profiles migration hasn't been applied to the remote Supabase DB yet,
      // still derive the exact state from Supabase Auth without faking verification.
    }
  }

  return {
    id: sbUser.id,
    email,
    phone,
    displayName,
    role,
    atelierName: existingLocal?.atelierName,
    craftRegion: existingLocal?.craftRegion,
    sellerVerified: role === 'admin' || Boolean(existingLocal?.sellerVerified),
    suspended,
    emailVerified,
    phoneVerified,
    emailVerifiedAt,
    phoneVerifiedAt,
    accountStatus,
    shippingAddress: existingLocal?.shippingAddress,
    savedAddresses: existingLocal?.savedAddresses || [],
    notificationPreferences: existingLocal?.notificationPreferences || {
      orderEmail: true,
      orderSms: true,
      securityAlerts: true,
      editorialNewsletter: true,
    },
    createdAt: sbUser.created_at || existingLocal?.createdAt || now,
    updatedAt: now,
  };
}

export function mapSupabaseAuthError(message: string): { status: number; error: string } {
  const lower = message.toLowerCase();
  if (lower.includes('expired')) {
    return {
      status: 400,
      error: 'This 6-digit OTP has expired (OTPs are valid for 5 minutes). Please request a new code.',
    };
  }
  if (lower.includes('invalid') || lower.includes('token') || lower.includes('otp')) {
    return {
      status: 400,
      error: 'Incorrect or expired 6-digit OTP code. Please verify the code and try again.',
    };
  }
  if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('security purposes')) {
    return {
      status: 429,
      error: 'Too many OTP requests. Please wait 60 seconds before requesting another code.',
    };
  }
  if (lower.includes('signups not allowed') || lower.includes('user not found')) {
    return {
      status: 404,
      error: 'No registered VIRAASAT account matches those details. Please register a new account first.',
    };
  }
  if (lower.includes('hook') || lower.includes('sms') || lower.includes('msg91')) {
    return {
      status: 502,
      error: `SMS delivery failed via MSG91 hook: ${message}`,
    };
  }
  if (lower.includes('smtp') || lower.includes('email')) {
    return {
      status: 502,
      error: `Email delivery failed via Resend SMTP: ${message}`,
    };
  }
  return { status: 400, error: message };
}
