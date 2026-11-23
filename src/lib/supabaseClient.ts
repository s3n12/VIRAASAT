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
 * Direct Supabase Auth passwordless Email OTP helper.
 * Note: VIRAASAT's AuthModal routes OTP calls through `/api/auth/otp/email/send`
 * so server-side rate limiting, 60s cooldown, Turnstile verification, and audit logging
 * wrap the exact same `supabase.auth.signInWithOtp({ email })` call.
 */
export async function sendSupabaseEmailOtpDirect(emailAddress: string) {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) {
    return {
      error: new Error(
        'Browser Supabase client is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).'
      ),
    };
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: emailAddress.trim().toLowerCase(),
  });
  if (error) {
    console.error(error.message);
  }
  return { error };
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
    return {
      data: { user: null, session: null },
      error: new Error(
        'Browser Supabase client is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).'
      ),
    };
  }
  const normalizedToken = enteredOtp.trim();
  if (!/^\d{6}$/.test(normalizedToken)) {
    return {
      data: { user: null, session: null },
      error: new Error('Enter a valid 6-digit verification code.'),
    };
  }
  const { data, error } = await supabase.auth.verifyOtp({
    email: emailAddress.trim().toLowerCase(),
    token: normalizedToken,
    type: 'email',
  });
  if (error) {
    console.error(error.message);
  }
  return { data, error };
}

