import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

let cachedClient: SupabaseClient | null = null;

/**
 * Browser-safe Supabase client using ONLY public anon credentials
 * (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).
 * Never pass SUPABASE_SERVICE_ROLE_KEY or MSG91/Resend secrets here.
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

export function isBrowserSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Shared browser Supabase client initialized strictly from Vite env vars
 * (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).
 */
export const supabase = getBrowserSupabaseClient();

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
  const supabase = getBrowserSupabaseClient();
  if (!supabase) {
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
  const { data, error } = await supabase.auth.signInWithOtp({
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
  const supabase = getBrowserSupabaseClient();
  if (!supabase) {
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
  const { data, error } = await supabase.auth.verifyOtp({
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

