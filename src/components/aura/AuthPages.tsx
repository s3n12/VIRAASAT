import React, { useEffect, useState } from 'react';
import { Check, KeyRound, Mail, Phone, ShieldCheck } from 'lucide-react';
import { auraApi, getAuraAuthToken, setAuraAuthToken } from '../../lib/auraApi';
import { AuraLink, updateDocumentSeo, useAuraRouter } from '../../lib/router';
import type { AuraProfile, AuthConfigStatus } from '../../types/aura';

export function AuthPages({
  mode,
  authConfig,
  onAuthenticated,
}: {
  mode: 'sign-in' | 'sign-up';
  authConfig: AuthConfigStatus | null;
  onAuthenticated: (user: AuraProfile, token: string) => void;
}) {
  const { navigate } = useAuraRouter();
  const [authMethod, setAuthMethod] = useState<'dual-otp' | 'password' | 'reset'>(
    mode === 'sign-up' ? 'dual-otp' : 'dual-otp'
  );
  const [signInChannel, setSignInChannel] = useState<'email' | 'phone'>('email');

  // Shared fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailVerifiedUser, setEmailVerifiedUser] = useState<AuraProfile | null>(null);
  const [emailCooldown, setEmailCooldown] = useState(0);

  const [mobile, setMobile] = useState('+91 ');
  const [smsCode, setSmsCode] = useState('');
  const [smsSent, setSmsSent] = useState(false);
  const [smsCooldown, setSmsCooldown] = useState(0);

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    updateDocumentSeo(
      mode === 'sign-up' ? 'Create Verified Account — AURA' : 'Sign In — AURA',
      'Authenticate with Supabase Auth using passwordless Email & Indian +91 Mobile OTP or email password.'
    );
    setError(null);
    setStatusMessage(null);
  }, [mode]);

  useEffect(() => {
    if (emailCooldown <= 0) return;
    const t = setTimeout(() => setEmailCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [emailCooldown]);

  useEffect(() => {
    if (smsCooldown <= 0) return;
    const t = setTimeout(() => setSmsCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [smsCooldown]);

  async function handleSendEmailOtp() {
    setError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      const res = await auraApi.sendEmailOtp({
        email: email.trim(),
        intent: mode === 'sign-up' ? 'register' : 'login',
        displayName: mode === 'sign-up' ? fullName.trim() || undefined : undefined,
      });
      setEmailSent(true);
      setEmailCooldown(res.resendCooldownSec || 60);
      setStatusMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send Email OTP.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyEmailOtp() {
    setError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      const res = await auraApi.verifyEmailOtp({
        email: email.trim(),
        code: emailCode.trim(),
        displayName: fullName.trim() || undefined,
      });
      setAuraAuthToken(res.token);
      setEmailVerifiedUser(res.user);
      if (mode === 'sign-in') {
        onAuthenticated(res.user, res.token);
        navigate('/collections');
      } else {
        setStatusMessage('Step 1 complete · Email verified. Proceed to Step 2 (+91 mobile verification).');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired Email OTP.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendPhoneOtp() {
    setError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      const res = await auraApi.sendPhoneOtp({
        phone: mobile.trim(),
        intent: mode === 'sign-up' ? 'register' : 'login',
      });
      setSmsSent(true);
      setSmsCooldown(res.resendCooldownSec || 60);
      setStatusMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send SMS OTP.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyPhoneOtp() {
    setError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      const res = await auraApi.verifyPhoneOtp({
        phone: mobile.trim(),
        code: smsCode.trim(),
        intent: mode === 'sign-up' ? 'register' : 'login',
      });
      setAuraAuthToken(res.token);
      onAuthenticated(res.user, res.token);
      navigate('/collections');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired SMS OTP.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      if (authMethod === 'reset') {
        const res = await auraApi.resetPassword(email.trim());
        setStatusMessage(res.message);
      } else if (mode === 'sign-up') {
        const res = await auraApi.signUpPassword({
          displayName: fullName.trim(),
          email: email.trim(),
          password,
        });
        if (res.token && res.user) {
          setAuraAuthToken(res.token);
          onAuthenticated(res.user, res.token);
          navigate('/collections');
        } else {
          setStatusMessage(res.message);
        }
      } else {
        const res = await auraApi.signInPassword({
          email: email.trim(),
          password,
        });
        setAuraAuthToken(res.token);
        onAuthenticated(res.user, res.token);
        navigate('/collections');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  const verificationStatusLabel = emailVerifiedUser?.phoneVerified
    ? 'Status: Fully Verified'
    : emailVerifiedUser?.emailVerified
      ? 'Status: Email Verified · Awaiting +91 Mobile Verification'
      : 'Status: Pending Verification';

  return (
    <div className="max-w-xl mx-auto px-6 py-14 space-y-8">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[#7D7368]">Supabase Verified Access</p>
        <h1 className="font-serif text-4xl sm:text-5xl text-[#1C1917]">
          {mode === 'sign-up' ? 'Create Verified Account' : 'Welcome Back to AURA'}
        </h1>
        <p className="text-sm text-[#574F46] leading-relaxed">
          {mode === 'sign-up'
            ? 'Passwordless 6-digit OTP verification (5-minute expiry · 60s resend cooldown · dual email & +91 mobile verification).'
            : 'Sign in using passwordless Email OTP, Indian +91 SMS OTP, or your Supabase email password.'}
        </p>
      </header>

      {/* Honest Supabase Readiness Notice */}
      {authConfig && !authConfig.supabaseAuthConfigured && (
        <div className="p-4 rounded-xl bg-[#F3EFE8] border border-[#DDD5C7] text-xs text-[#574F46] space-y-1.5">
          <p className="font-medium text-[#1C1917]">Supabase Project Configuration Needed</p>
          <p>
            Configure your Supabase project secrets in <strong>Settings → Secrets</strong> before sending real OTPs. Missing:{' '}
            <span className="font-mono">{authConfig.missingVariables.join(', ')}</span>.
          </p>
        </div>
      )}

      {/* Auth Method Switcher */}
      <div className="flex items-center justify-center gap-2 p-1 bg-[#F3EFE8] rounded-xl border border-[#DDD5C7]">
        <button
          type="button"
          onClick={() => {
            setAuthMethod('dual-otp');
            setError(null);
          }}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
            authMethod === 'dual-otp' ? 'bg-[#1C1917] text-[#FAF7F2]' : 'text-[#574F46] hover:text-[#1C1917]'
          }`}
        >
          6-Digit OTP
        </button>
        <button
          type="button"
          onClick={() => {
            setAuthMethod('password');
            setError(null);
          }}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
            authMethod === 'password' ? 'bg-[#1C1917] text-[#FAF7F2]' : 'text-[#574F46] hover:text-[#1C1917]'
          }`}
        >
          Email & Password
        </button>
        {mode === 'sign-in' && (
          <button
            type="button"
            onClick={() => {
              setAuthMethod('reset');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              authMethod === 'reset' ? 'bg-[#1C1917] text-[#FAF7F2]' : 'text-[#574F46] hover:text-[#1C1917]'
            }`}
          >
            Reset Password
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-[#8B2E2E]/8 text-sm text-[#8B2E2E]">
          {error}
        </div>
      )}
      {statusMessage && (
        <div className="p-4 rounded-xl bg-[#2F5D46]/10 text-sm text-[#2F5D46]">{statusMessage}</div>
      )}

      {/* DUAL EMAIL & +91 MOBILE OTP FLOW */}
      {authMethod === 'dual-otp' && mode === 'sign-up' && (
        <div className="p-6 sm:p-8 rounded-2xl bg-white border border-[#DDD5C7] space-y-8">
          {/* Step 1: Email OTP (Resend SMTP) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[#1C1917] flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#8C6A43]" />
                Step 1 · Verify Email Address (Resend SMTP)
              </h2>
              {emailVerifiedUser?.emailVerified && (
                <span className="text-xs text-[#2F5D46] inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Verified
                </span>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="reg-fullName" className="block text-xs font-medium text-[#574F46] mb-1">
                  Full Name
                </label>
                <input
                  id="reg-fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Ananya Deshmukh"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-xs font-medium text-[#574F46] mb-1">
                  Email Address
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                />
              </div>

              <button
                type="button"
                disabled={busy || !email.trim() || emailCooldown > 0}
                onClick={handleSendEmailOtp}
                className="w-full py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] disabled:opacity-50 transition-colors"
              >
                {emailCooldown > 0 ? `Resend Email OTP (${emailCooldown}s)` : emailSent ? 'Resend Email OTP' : 'Send Email OTP'}
              </button>

              {emailSent && !emailVerifiedUser?.emailVerified && (
                <div className="pt-2 flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit Email OTP"
                    className="flex-1 px-3.5 py-2.5 text-sm font-mono tracking-widest bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  />
                  <button
                    type="button"
                    disabled={busy || emailCode.length !== 6}
                    onClick={handleVerifyEmailOtp}
                    className="px-4 py-2.5 text-xs font-medium bg-[#8C6A43] text-[#FAF7F2] rounded-lg hover:bg-[#755736] disabled:opacity-50 whitespace-nowrap"
                  >
                    Verify Email
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Indian Mobile Number (+91 · MSG91) */}
          <div className="pt-6 border-t border-[#EAE4DA] space-y-4">
            <h2 className="text-sm font-semibold text-[#1C1917] flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#8C6A43]" />
              Step 2 · Verify Indian Mobile Number (+91 · MSG91)
            </h2>

            <div className="space-y-3">
              <div>
                <label htmlFor="reg-mobile" className="block text-xs font-medium text-[#574F46] mb-1">
                  Mobile Number
                </label>
                <input
                  id="reg-mobile"
                  type="tel"
                  required
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                />
              </div>

              <button
                type="button"
                disabled={busy || !emailVerifiedUser?.emailVerified || smsCooldown > 0}
                onClick={handleSendPhoneOtp}
                className="w-full py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] disabled:opacity-45 transition-colors"
              >
                {smsCooldown > 0 ? `Resend SMS OTP (${smsCooldown}s)` : smsSent ? 'Resend SMS OTP' : 'Send SMS OTP'}
              </button>

              {smsSent && (
                <div className="pt-2 flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit SMS OTP"
                    className="flex-1 px-3.5 py-2.5 text-sm font-mono tracking-widest bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  />
                  <button
                    type="button"
                    disabled={busy || smsCode.length !== 6}
                    onClick={handleVerifyPhoneOtp}
                    className="px-4 py-2.5 text-xs font-medium bg-[#8C6A43] text-[#FAF7F2] rounded-lg hover:bg-[#755736] disabled:opacity-50 whitespace-nowrap"
                  >
                    Verify Mobile
                  </button>
                </div>
              )}

              {emailVerifiedUser?.emailVerified && (
                <button
                  type="button"
                  onClick={() => {
                    const tok = getAuraAuthToken();
                    if (tok) onAuthenticated(emailVerifiedUser, tok);
                    navigate('/collections');
                  }}
                  className="text-xs text-[#574F46] hover:text-[#1C1917] underline underline-offset-4"
                >
                  Continue with email verified for now
                </button>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-[#EAE4DA] flex items-center justify-between text-xs text-[#7D7368]">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#8C6A43]" />
              {verificationStatusLabel}
            </span>
          </div>
        </div>
      )}

      {/* SIGN IN WITH EMAIL OR +91 PHONE OTP */}
      {authMethod === 'dual-otp' && mode === 'sign-in' && (
        <div className="p-6 sm:p-8 rounded-2xl bg-white border border-[#DDD5C7] space-y-5">
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setSignInChannel('email')}
              className={`px-3 py-1.5 rounded-lg ${
                signInChannel === 'email' ? 'bg-[#EAE4DA] text-[#1C1917] font-medium' : 'text-[#574F46]'
              }`}
            >
              Email OTP
            </button>
            <button
              type="button"
              onClick={() => setSignInChannel('phone')}
              className={`px-3 py-1.5 rounded-lg ${
                signInChannel === 'phone' ? 'bg-[#EAE4DA] text-[#1C1917] font-medium' : 'text-[#574F46]'
              }`}
            >
              +91 Mobile OTP
            </button>
          </div>

          {signInChannel === 'email' ? (
            <div className="space-y-3">
              <label htmlFor="login-email" className="block text-xs font-medium text-[#574F46]">
                Registered Email Address
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
              />
              <button
                type="button"
                disabled={busy || !email.trim() || emailCooldown > 0}
                onClick={handleSendEmailOtp}
                className="w-full py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] disabled:opacity-50"
              >
                {emailCooldown > 0 ? `Resend Email OTP (${emailCooldown}s)` : 'Send Sign-In OTP'}
              </button>
              {emailSent && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit OTP"
                    className="flex-1 px-3.5 py-2.5 text-sm font-mono tracking-widest bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  />
                  <button
                    type="button"
                    disabled={busy || emailCode.length !== 6}
                    onClick={handleVerifyEmailOtp}
                    className="px-4 py-2.5 text-xs font-medium bg-[#8C6A43] text-[#FAF7F2] rounded-lg whitespace-nowrap"
                  >
                    Verify & Sign In
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label htmlFor="login-phone" className="block text-xs font-medium text-[#574F46]">
                Registered Indian Mobile (+91)
              </label>
              <input
                id="login-phone"
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="+91 9876543210"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
              />
              <button
                type="button"
                disabled={busy || smsCooldown > 0}
                onClick={handleSendPhoneOtp}
                className="w-full py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] disabled:opacity-50"
              >
                {smsCooldown > 0 ? `Resend SMS OTP (${smsCooldown}s)` : 'Send SMS OTP'}
              </button>
              {smsSent && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit SMS OTP"
                    className="flex-1 px-3.5 py-2.5 text-sm font-mono tracking-widest bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
                  />
                  <button
                    type="button"
                    disabled={busy || smsCode.length !== 6}
                    onClick={handleVerifyPhoneOtp}
                    className="px-4 py-2.5 text-xs font-medium bg-[#8C6A43] text-[#FAF7F2] rounded-lg whitespace-nowrap"
                  >
                    Verify & Sign In
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* EMAIL + PASSWORD / PASSWORD RESET */}
      {(authMethod === 'password' || authMethod === 'reset') && (
        <form onSubmit={handlePasswordAuth} className="p-6 sm:p-8 rounded-2xl bg-white border border-[#DDD5C7] space-y-4">
          {authMethod === 'password' && mode === 'sign-up' && (
            <div>
              <label htmlFor="pw-name" className="block text-xs font-medium text-[#574F46] mb-1">
                Full Name
              </label>
              <input
                id="pw-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Ananya Deshmukh"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
              />
            </div>
          )}

          <div>
            <label htmlFor="pw-email" className="block text-xs font-medium text-[#574F46] mb-1">
              Email Address
            </label>
            <input
              id="pw-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
            />
          </div>

          {authMethod === 'password' && (
            <div>
              <label htmlFor="pw-pass" className="block text-xs font-medium text-[#574F46] mb-1">
                Password
              </label>
              <input
                id="pw-pass"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F2] border border-[#DDD5C7] rounded-lg"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 text-sm font-medium bg-[#1C1917] text-[#FAF7F2] rounded-lg hover:bg-[#332B24] disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            {busy
              ? 'Processing...'
              : authMethod === 'reset'
                ? 'Send Password Reset Link'
                : mode === 'sign-up'
                  ? 'Create Account'
                  : 'Sign In'}
          </button>
        </form>
      )}

      <p className="text-center text-xs text-[#574F46]">
        {mode === 'sign-up' ? (
          <>
            Already have a verified account?{' '}
            <AuraLink to="/auth/sign-in" className="text-[#1C1917] font-medium underline underline-offset-4">
              Sign in
            </AuraLink>
          </>
        ) : (
          <>
            New to AURA?{' '}
            <AuraLink to="/auth/sign-up" className="text-[#1C1917] font-medium underline underline-offset-4">
              Create verified account
            </AuraLink>
          </>
        )}
      </p>
    </div>
  );
}
