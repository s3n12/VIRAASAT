import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function sanitizePublicEnv(raw: string | undefined): string {
  const val = (raw || '').trim();
  if (!val) return '';
  if (/^(MY_|YOUR_|<|REPLACE_|PLACEHOLDER|https:\/\/your-project-ref)/i.test(val)) return '';
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

const rawSupabaseUrl = sanitizePublicEnv(import.meta.env.VITE_SUPABASE_URL);
const supabaseUrl = isValidHttpUrl(rawSupabaseUrl) ? rawSupabaseUrl : '';
const supabaseAnonKey = sanitizePublicEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

const rawTableEnv = (import.meta.env.VITE_SUPABASE_RAW_TABLE || 'VIRAASAT-RAw').trim();
const safeRawTableName = /^[A-Za-z0-9_-]{1,64}$/.test(rawTableEnv) ? rawTableEnv : 'VIRAASAT-RAw';

export const SUPABASE_TABLES = {
  raw: safeRawTableName,
  profiles: 'profiles',
  products: 'products',
  orders: 'orders',
  reviews: 'reviews',
} as const;

let cachedClient: SupabaseClient | null = null;

/**
 * Browser-safe Supabase client using ONLY public anon/publishable credentials
 * (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).
 * Never pass `SUPABASE_SERVICE_ROLE_KEY` or MSG91/Resend secrets here.
 */
export function getBrowserSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Keep tokens in memory rather than localStorage to protect against XSS token theft
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedClient;
}

/**
 * Reusable singleton Supabase client for browser components/services.
 * Resolves to `null` until `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured.
 */
export const supabase: SupabaseClient | null = getBrowserSupabaseClient();

export function isBrowserSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Direct Supabase Auth passwordless Email OTP helper.
 * Note: VIRAASAT's AuthModal routes OTP calls through `/api/auth/otp/email/send`
 * so server-side rate limiting, 60s cooldown, Turnstile verification, and audit logging
 * wrap the exact same `supabase.auth.signInWithOtp({ email })` call.
 */
export async function sendSupabaseEmailOtpDirect(
  emailAddress: string,
  options?: { shouldCreateUser?: boolean }
) {
  const client = getBrowserSupabaseClient();
  if (!client) {
    const configError = new Error(
      'Browser Supabase client is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).'
    );
    console.error('OTP sending failed:', {
      message: configError.message,
      status: 503,
      code: 'SUPABASE_AUTH_NOT_CONFIGURED',
    });
    throw configError;
  }
  const { data, error } = await client.auth.signInWithOtp({
    email: emailAddress.trim().toLowerCase(),
    options: {
      shouldCreateUser: options?.shouldCreateUser ?? true,
    },
  });
  if (error) {
    console.error('OTP sending failed:', {
      message: error.message,
      status: error.status,
      code: error.code,
    });
    throw error;
  }
  console.log('OTP request successful');
  return data;
}

/**
 * Direct Supabase Auth 6-digit Email OTP verification helper.
 * Note: VIRAASAT's AuthModal routes verification through `/api/auth/otp/email/verify`
 * so server-side brute-force attempt lockouts, sliding-window rate limits,
 * `public.profiles` synchronization, and audit logging wrap the exact same
 * `supabase.auth.verifyOtp({ email, token, type: 'email' })` call.
 */
export async function verifySupabaseEmailOtpDirect(emailAddress: string, enteredOtp: string) {
  const client = getBrowserSupabaseClient();
  if (!client) {
    const configError = new Error(
      'Browser Supabase client is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).'
    );
    console.error('OTP verification failed:', {
      message: configError.message,
      status: 503,
      code: 'SUPABASE_AUTH_NOT_CONFIGURED',
    });
    throw configError;
  }
  const normalizedToken = enteredOtp.trim();
  if (!/^\d{6}$/.test(normalizedToken)) {
    const validationError = new Error('Enter a valid 6-digit verification code.');
    console.error('OTP verification failed:', {
      message: validationError.message,
      status: 400,
      code: 'INVALID_OTP_FORMAT',
    });
    throw validationError;
  }
  const { data, error } = await client.auth.verifyOtp({
    email: emailAddress.trim().toLowerCase(),
    token: normalizedToken,
    type: 'email',
  });
  if (error) {
    console.error('OTP verification failed:', {
      message: error.message,
      status: error.status,
      code: error.code,
    });
    throw error;
  }
  console.log('Verified successfully:', data.user);
  return data;
}

/**
 * Reads rows from the connected `VIRAASAT-RAw` Supabase table (subject to PostgreSQL RLS).
 */
export async function fetchViraasatRawRecords(options: { limit?: number; offset?: number } = {}) {
  const client = getBrowserSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).');
  }
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 25)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));

  const { data, error } = await client
    .from(SUPABASE_TABLES.raw)
    .select('*')
    .range(offset, offset + limit - 1);

  if (error) {
    console.error(`Failed to read ${SUPABASE_TABLES.raw}:`, {
      message: error.message,
      code: error.code,
    });
    throw error;
  }
  return data ?? [];
}

/**
 * Inserts a validated form/record payload into the connected `VIRAASAT-RAw` Supabase table
 * (subject to PostgreSQL RLS policies).
 */
export async function saveViraasatRawRecord(payload: Record<string, unknown>) {
  const client = getBrowserSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Record payload must be a JSON object.');
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    sanitized[key] = value;
  }

  const { data, error } = await client
    .from(SUPABASE_TABLES.raw)
    .insert(sanitized)
    .select()
    .single();

  if (error) {
    console.error(`Failed to save record in ${SUPABASE_TABLES.raw}:`, {
      message: error.message,
      code: error.code,
    });
    throw error;
  }
  return data;
}

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Uploads a validated image or PDF asset to Supabase Storage (subject to bucket RLS policies).
 */
export async function uploadViraasatAsset(params: {
  file: File;
  bucket?: string;
  folder?: string;
}) {
  const client = getBrowserSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).');
  }
  const { file, bucket = 'viraasat-assets', folder = 'uploads' } = params;
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
    throw new Error('Only JPEG, PNG, WebP images, and PDF documents are permitted.');
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File size must be between 1 byte and 5 MB.');
  }

  const cleanFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'uploads';
  const safeBaseName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.+/g, '.')
    .slice(0, 80);
  const objectPath = `${cleanFolder}/${Date.now()}-${safeBaseName}`;

  const { data, error } = await client.storage.from(bucket).upload(objectPath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });

  if (error) {
    console.error('Supabase Storage upload failed:', {
      message: error.message,
    });
    throw error;
  }

  const { data: publicData } = client.storage.from(bucket).getPublicUrl(data.path);
  return {
    path: data.path,
    publicUrl: publicData.publicUrl,
  };
}
