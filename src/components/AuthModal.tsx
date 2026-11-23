import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
  Mail,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { UserProfile } from '../types/marketplace';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
  user: UserProfile | null;
  onAuthenticated: (token: string, user: UserProfile, redirectAfterDualVerify?: boolean) => void;
}

interface AuthConfigResponse {
  supabaseAuthConfigured: boolean;
  smsHookConfigured: boolean;
  msg91Configured: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
  missingVariables: string[];
  otpExpirySeconds: number;
  resendCooldownSeconds: number;
  maxAttempts: number;
}

interface OtpSendResponse {
  ok: boolean;
  channel: 'email' | 'phone';
  normalizedIdentifier: string;
  expiresInSec: number;
  resendCooldownSec: number;
  message: string;
}

interface OtpVerifyResponse {
  ok: boolean;
  token: string;
  refreshToken?: string;
  user: UserProfile;
  dualVerified: boolean;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export function AuthModal({
  open,
  onClose,
  token,
  user,
  onAuthenticated,
}: AuthModalProps) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [loginChannel, setLoginChannel] = useState<'email' | 'phone'>('email');

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phoneDigits, setPhoneDigits] = useState(
    user?.phone ? user.phone.replace(/^\+91/, '') : ''
  );

  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [phoneSent, setPhoneSent] = useState(false);

  const [emailCooldown, setEmailCooldown] = useState(0);
  const [phoneCooldown, setPhoneCooldown] = useState(0);

  const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    apiRequest<AuthConfigResponse>('/api/auth/config')
      .then((cfg) => {
        if (active) setAuthConfig(cfg);
      })
      .catch(() => {
        if (active) setAuthConfig(null);
      });
    return () => {
      active = false;
    };
  }, [open]);

  // Load & mount Cloudflare Turnstile CAPTCHA widget when enabled on the server
  useEffect(() => {
    if (!open || !authConfig?.turnstileEnabled || !authConfig.turnstileSiteKey) {
      return;
    }

    const renderWidget = () => {
      if (!turnstileRef.current || !window.turnstile || !authConfig.turnstileSiteKey) return;
      if (turnstileWidgetId.current) {
        try {
          window.turnstile.remove(turnstileWidgetId.current);
        } catch {
          // ignore
        }
      }
      turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
        sitekey: authConfig.turnstileSiteKey,
        theme: 'light',
        callback: (t) => setCaptchaToken(t),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => setCaptchaToken(''),
      });
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-viraasat-turnstile="true"]'
    );
    if (existingScript) {
      existingScript.addEventListener('load', renderWidget);
      return () => existingScript.removeEventListener('load', renderWidget);
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.viraasatTurnstile = 'true';
    script.onload = renderWidget;
    document.head.appendChild(script);
  }, [open, authConfig?.turnstileEnabled, authConfig?.turnstileSiteKey, mode, loginChannel]);

  useEffect(() => {
    if (user) {
      if (user.email) setEmail(user.email);
      if (user.phone) setPhoneDigits(user.phone.replace(/^\+91/, ''));
      if (user.displayName) setDisplayName(user.displayName);
      if (user.emailVerified && !user.phoneVerified) {
        setMode('register');
      }
    } else {
      setEmailSent(false);
      setPhoneSent(false);
      setEmailCooldown(0);
      setPhoneCooldown(0);
      setEmailCode('');
      setPhoneCode('');
    }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      setEmailCooldown((c) => (c > 0 ? c - 1 : 0));
      setPhoneCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  if (!open) return null;

  const emailVerified = Boolean(user?.emailVerified);
  const phoneVerified = Boolean(user?.phoneVerified);
  const fullIndianPhone = `+91${phoneDigits.replace(/\D/g, '').slice(-10)}`;

  const resetCaptcha = () => {
    setCaptchaToken('');
    if (window.turnstile && turnstileWidgetId.current) {
      try {
        window.turnstile.reset(turnstileWidgetId.current);
      } catch {
        // ignore
      }
    }
  };

  const handleSendEmailOtp = async () => {
    if (mode === 'register' && displayName.trim().length < 2) {
      setError('Please enter your full name before requesting an email OTP.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (authConfig?.turnstileEnabled && !captchaToken) {
      setError('Please complete the CAPTCHA verification challenge first.');
      return;
    }

    setError(null);
    setNotice(null);
    setBusy('send-email');
    try {
      const res = await apiRequest<OtpSendResponse>('/api/auth/otp/email/send', {
        method: 'POST',
        body: {
          email: email.trim(),
          intent: mode,
          displayName: mode === 'register' ? displayName.trim() : undefined,
          captchaToken: captchaToken || undefined,
        },
        token,
      });
      setEmailSent(true);
      setEmailCooldown(res.resendCooldownSec || 60);
      setNotice(res.message);
      resetCaptcha();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send Email OTP.');
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!/^\d{6}$/.test(emailCode.trim())) {
      setError('Enter the exact 6-digit code sent to your email address.');
      return;
    }
    setError(null);
    setNotice(null);
    setBusy('verify-email');
    try {
      const res = await apiRequest<OtpVerifyResponse>('/api/auth/otp/email/verify', {
        method: 'POST',
        body: {
          email: email.trim(),
          code: emailCode.trim(),
          displayName: mode === 'register' ? displayName.trim() : undefined,
        },
      });
      setEmailCode('');
      setEmailCooldown(0);
      const shouldRedirect = mode === 'login' && res.dualVerified;
      onAuthenticated(res.token, res.user, shouldRedirect);
      if (shouldRedirect) {
        onClose();
        return;
      }
      setNotice(
        res.dualVerified
          ? 'Email and mobile phone verified. Your account is active.'
          : 'Email verified via Supabase Auth. Complete Step 2 (Indian +91 SMS OTP) to activate your account.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email OTP verification failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleSendPhoneOtp = async () => {
    const clean10 = phoneDigits.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(clean10)) {
      setError('Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }
    if (mode === 'register' && (!token || !emailVerified)) {
      setError('Verify your email address (Step 1) before verifying your mobile number.');
      return;
    }
    if (mode === 'login' && authConfig?.turnstileEnabled && !captchaToken) {
      setError('Please complete the CAPTCHA verification challenge first.');
      return;
    }

    setError(null);
    setNotice(null);
    setBusy('send-phone');
    try {
      const res = await apiRequest<OtpSendResponse>('/api/auth/otp/phone/send', {
        method: 'POST',
        body: {
          phone: `+91${clean10}`,
          intent: mode,
          captchaToken: mode === 'login' ? captchaToken || undefined : undefined,
        },
        token: mode === 'register' ? token : null,
      });
      setPhoneSent(true);
      setPhoneCooldown(res.resendCooldownSec || 60);
      setNotice(res.message);
      resetCaptcha();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send SMS OTP via MSG91.');
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (!/^\d{6}$/.test(phoneCode.trim())) {
      setError('Enter the exact 6-digit SMS OTP received on your mobile phone.');
      return;
    }
    setError(null);
    setNotice(null);
    setBusy('verify-phone');
    try {
      const res = await apiRequest<OtpVerifyResponse>('/api/auth/otp/phone/verify', {
        method: 'POST',
        body: {
          phone: fullIndianPhone,
          code: phoneCode.trim(),
          intent: mode,
        },
        token: mode === 'register' ? token : null,
      });
      setPhoneCode('');
      setPhoneCooldown(0);
      onAuthenticated(res.token, res.user, res.dualVerified);
      if (res.dualVerified) {
        onClose();
        return;
      }
      setNotice(
        'Mobile number verified via Supabase Auth. Verify your email address to activate full marketplace access.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SMS OTP verification failed.');
    } finally {
      setBusy(null);
    }
  };

  const switchMode = (nextMode: 'register' | 'login') => {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setEmailSent(false);
    setPhoneSent(false);
    setEmailCode('');
    setPhoneCode('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#231B17]/60 backdrop-blur-[2px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="VIRAASAT Supabase Auth Dual OTP Verification"
    >
      <div className="w-full max-w-xl bg-[#FAF7F2] border border-[#DFD3C0] shadow-2xl my-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#DFD3C0] flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-[#A67C37] tracking-widest uppercase">
              Supabase Auth · Resend SMTP &amp; MSG91 SMS
            </p>
            <h2 className="font-display text-3xl text-[#231B17] mt-1">
              {mode === 'register' ? 'Create Verified Account' : 'Sign In with Real OTP'}
            </h2>
            <p className="text-xs text-[#6E5F54] mt-1">
              Passwordless 6-digit OTP verification (5-minute expiry · 60s resend cooldown · dual email &amp; +91 mobile verification).
            </p>
          </div>
          <button
            type="button"
            aria-label="Close authentication dialog"
            onClick={onClose}
            className="p-2 text-[#6E5F54] hover:text-[#231B17]"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 border-b border-[#DFD3C0] bg-[#F3ECE1]/60">
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`py-3 text-xs font-medium tracking-wide uppercase transition-colors border-b-2 ${
              mode === 'register'
                ? 'border-[#6B1D2A] text-[#6B1D2A] bg-[#FAF7F2]'
                : 'border-transparent text-[#6E5F54] hover:text-[#231B17]'
            }`}
          >
            Register (Dual OTP)
          </button>
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`py-3 text-xs font-medium tracking-wide uppercase transition-colors border-b-2 ${
              mode === 'login'
                ? 'border-[#6B1D2A] text-[#6B1D2A] bg-[#FAF7F2]'
                : 'border-transparent text-[#6E5F54] hover:text-[#231B17]'
            }`}
          >
            Sign In (Email or +91 Phone)
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Honest Provider Configuration Status Banner when Supabase/MSG91 secrets are missing */}
          {authConfig && !authConfig.supabaseAuthConfigured && (
            <div
              role="status"
              className="p-4 bg-[#6B1D2A]/8 border border-[#6B1D2A]/30 space-y-2 text-xs text-[#231B17]"
            >
              <div className="flex items-center gap-2 font-semibold text-[#6B1D2A]">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Connect Your Existing Supabase Project to Enable Live OTP Delivery</span>
              </div>
              <p className="text-[#6E5F54] leading-relaxed">
                VIRAASAT never issues demo or fake OTP codes. Add the missing server environment
                variables below from your Supabase project, Resend SMTP, and MSG91 dashboards:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {authConfig.missingVariables.map((varName) => (
                  <code
                    key={varName}
                    className="px-2 py-0.5 bg-white border border-[#DFD3C0] font-mono text-[11px] text-[#6B1D2A]"
                  >
                    {varName}
                  </code>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3 text-xs bg-[#6B1D2A]/10 border border-[#6B1D2A]/30 text-[#6B1D2A]"
            >
              {error}
            </div>
          )}

          {notice && (
            <div className="p-3 text-xs bg-[#A67C37]/12 border border-[#A67C37]/35 text-[#231B17]">
              {notice}
            </div>
          )}

          {mode === 'register' ? (
            <div className="space-y-4">
              {/* STEP 1: Name + Email OTP */}
              <div className="p-4 border border-[#DFD3C0] bg-white space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#231B17]">
                    <Mail className="w-4 h-4 text-[#A67C37]" aria-hidden="true" />
                    <span>Step 1 · Verify Email Address (Resend SMTP)</span>
                  </div>
                  <span
                    className={`text-xs font-medium inline-flex items-center gap-1 ${
                      emailVerified ? 'text-[#2D5A3D]' : 'text-[#6E5F54]'
                    }`}
                  >
                    {emailVerified ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Verified</span>
                      </>
                    ) : (
                      'Required'
                    )}
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="reg-display-name"
                    className="block text-xs font-medium text-[#6E5F54] mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="reg-display-name"
                    type="text"
                    disabled={emailVerified}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Ananya Deshmukh"
                    className="w-full px-3 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0] text-[#231B17] disabled:opacity-60"
                  />
                </div>

                <div className="flex gap-2">
                  <label htmlFor="reg-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    disabled={emailVerified}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="flex-1 px-3 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0] text-[#231B17] disabled:opacity-60"
                  />
                  {!emailVerified && (
                    <button
                      type="button"
                      disabled={busy === 'send-email' || emailCooldown > 0}
                      onClick={handleSendEmailOtp}
                      className="px-4 py-2 text-xs font-medium bg-[#231B17] text-[#FAF7F2] hover:bg-[#3A2E28] disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {busy === 'send-email'
                        ? 'Sending...'
                        : emailCooldown > 0
                          ? `Resend (${emailCooldown}s)`
                          : emailSent
                            ? 'Resend OTP'
                            : 'Send Email OTP'}
                    </button>
                  )}
                </div>

                {emailSent && !emailVerified && (
                  <div className="flex gap-2 pt-1">
                    <label htmlFor="reg-email-otp" className="sr-only">
                      6-digit Email OTP
                    </label>
                    <input
                      id="reg-email-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter 6-digit email OTP"
                      className="flex-1 px-3 py-2 text-sm font-mono tracking-[0.25em] bg-[#FAF7F2] border border-[#DFD3C0]"
                    />
                    <button
                      type="button"
                      disabled={busy === 'verify-email'}
                      onClick={handleVerifyEmailOtp}
                      className="px-4 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F] disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {busy === 'verify-email' ? 'Verifying...' : 'Verify Email'}
                    </button>
                  </div>
                )}
              </div>

              {/* STEP 2: Indian +91 Mobile Number OTP via Supabase SMS Hook -> MSG91 */}
              <div
                className={`p-4 border bg-white space-y-3 transition-opacity ${
                  emailVerified ? 'border-[#DFD3C0]' : 'border-[#DFD3C0]/60 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#231B17]">
                    <Smartphone className="w-4 h-4 text-[#A67C37]" aria-hidden="true" />
                    <span>Step 2 · Verify Indian Mobile Number (+91 · MSG91)</span>
                  </div>
                  <span
                    className={`text-xs font-medium inline-flex items-center gap-1 ${
                      phoneVerified ? 'text-[#2D5A3D]' : 'text-[#6E5F54]'
                    }`}
                  >
                    {phoneVerified ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Verified</span>
                      </>
                    ) : emailVerified ? (
                      'Next Step'
                    ) : (
                      <>
                        <Lock className="w-3 h-3" aria-hidden="true" />
                        <span>Complete Step 1 First</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="flex gap-2">
                  <div className="flex flex-1 border border-[#DFD3C0] bg-[#FAF7F2]">
                    <span className="px-3 py-2 text-sm font-mono text-[#6E5F54] border-r border-[#DFD3C0] bg-[#F3ECE1]/60 select-none">
                      +91
                    </span>
                    <label htmlFor="reg-phone" className="sr-only">
                      10-digit Indian mobile number
                    </label>
                    <input
                      id="reg-phone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      disabled={!emailVerified || phoneVerified}
                      value={phoneDigits}
                      onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="9876543210"
                      className="flex-1 px-3 py-2 text-sm font-mono bg-transparent text-[#231B17] focus:outline-none disabled:opacity-50"
                    />
                  </div>
                  {!phoneVerified && (
                    <button
                      type="button"
                      disabled={!emailVerified || busy === 'send-phone' || phoneCooldown > 0}
                      onClick={handleSendPhoneOtp}
                      className="px-4 py-2 text-xs font-medium bg-[#231B17] text-[#FAF7F2] hover:bg-[#3A2E28] disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {busy === 'send-phone'
                        ? 'Sending...'
                        : phoneCooldown > 0
                          ? `Resend (${phoneCooldown}s)`
                          : phoneSent
                            ? 'Resend SMS'
                            : 'Send SMS OTP'}
                    </button>
                  )}
                </div>

                {phoneSent && !phoneVerified && (
                  <div className="flex gap-2 pt-1">
                    <label htmlFor="reg-phone-otp" className="sr-only">
                      6-digit SMS OTP
                    </label>
                    <input
                      id="reg-phone-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter 6-digit SMS OTP"
                      className="flex-1 px-3 py-2 text-sm font-mono tracking-[0.25em] bg-[#FAF7F2] border border-[#DFD3C0]"
                    />
                    <button
                      type="button"
                      disabled={busy === 'verify-phone'}
                      onClick={handleVerifyPhoneOtp}
                      className="px-4 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F] disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {busy === 'verify-phone' ? 'Verifying...' : 'Verify & Activate'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* SIGN IN MODE: Registered Email OR Registered +91 Mobile Number */
            <div className="p-4 border border-[#DFD3C0] bg-white space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLoginChannel('email');
                    setError(null);
                    setNotice(null);
                  }}
                  className={`flex-1 py-2 text-xs font-medium border transition-colors ${
                    loginChannel === 'email'
                      ? 'border-[#6B1D2A] bg-[#6B1D2A]/5 text-[#6B1D2A]'
                      : 'border-[#DFD3C0] text-[#6E5F54]'
                  }`}
                >
                  Registered Email OTP
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginChannel('phone');
                    setError(null);
                    setNotice(null);
                  }}
                  className={`flex-1 py-2 text-xs font-medium border transition-colors ${
                    loginChannel === 'phone'
                      ? 'border-[#6B1D2A] bg-[#6B1D2A]/5 text-[#6B1D2A]'
                      : 'border-[#DFD3C0] text-[#6E5F54]'
                  }`}
                >
                  Registered +91 Phone OTP
                </button>
              </div>

              {loginChannel === 'email' ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <label htmlFor="login-email" className="sr-only">
                      Registered email address
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Registered email address"
                      className="flex-1 px-3 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0] text-[#231B17]"
                    />
                    <button
                      type="button"
                      disabled={busy === 'send-email' || emailCooldown > 0}
                      onClick={handleSendEmailOtp}
                      className="px-4 py-2 text-xs font-medium bg-[#231B17] text-[#FAF7F2] hover:bg-[#3A2E28] disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {busy === 'send-email'
                        ? 'Sending...'
                        : emailCooldown > 0
                          ? `Resend (${emailCooldown}s)`
                          : emailSent
                            ? 'Resend OTP'
                            : 'Send Email OTP'}
                    </button>
                  </div>

                  {emailSent && (
                    <div className="flex gap-2">
                      <label htmlFor="login-email-otp" className="sr-only">
                        6-digit Email OTP
                      </label>
                      <input
                        id="login-email-otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="Enter 6-digit email OTP"
                        className="flex-1 px-3 py-2 text-sm font-mono tracking-[0.25em] bg-[#FAF7F2] border border-[#DFD3C0]"
                      />
                      <button
                        type="button"
                        disabled={busy === 'verify-email'}
                        onClick={handleVerifyEmailOtp}
                        className="px-4 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F] disabled:opacity-50 whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                      >
                        <span>{busy === 'verify-email' ? 'Verifying...' : 'Sign In'}</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex flex-1 border border-[#DFD3C0] bg-[#FAF7F2]">
                      <span className="px-3 py-2 text-sm font-mono text-[#6E5F54] border-r border-[#DFD3C0] bg-[#F3ECE1]/60 select-none">
                        +91
                      </span>
                      <label htmlFor="login-phone" className="sr-only">
                        Registered 10-digit Indian mobile number
                      </label>
                      <input
                        id="login-phone"
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={phoneDigits}
                        onChange={(e) =>
                          setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))
                        }
                        placeholder="9876543210"
                        className="flex-1 px-3 py-2 text-sm font-mono bg-transparent text-[#231B17] focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy === 'send-phone' || phoneCooldown > 0}
                      onClick={handleSendPhoneOtp}
                      className="px-4 py-2 text-xs font-medium bg-[#231B17] text-[#FAF7F2] hover:bg-[#3A2E28] disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {busy === 'send-phone'
                        ? 'Sending...'
                        : phoneCooldown > 0
                          ? `Resend (${phoneCooldown}s)`
                          : phoneSent
                            ? 'Resend SMS'
                            : 'Send SMS OTP'}
                    </button>
                  </div>

                  {phoneSent && (
                    <div className="flex gap-2">
                      <label htmlFor="login-phone-otp" className="sr-only">
                        6-digit SMS OTP
                      </label>
                      <input
                        id="login-phone-otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={phoneCode}
                        onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="Enter 6-digit SMS OTP"
                        className="flex-1 px-3 py-2 text-sm font-mono tracking-[0.25em] bg-[#FAF7F2] border border-[#DFD3C0]"
                      />
                      <button
                        type="button"
                        disabled={busy === 'verify-phone'}
                        onClick={handleVerifyPhoneOtp}
                        className="px-4 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F] disabled:opacity-50 whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                      >
                        <span>{busy === 'verify-phone' ? 'Verifying...' : 'Sign In'}</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cloudflare Turnstile Bot Protection Widget (renders when configured) */}
          {authConfig?.turnstileEnabled && authConfig.turnstileSiteKey && (
            <div className="flex justify-center pt-1">
              <div ref={turnstileRef} />
            </div>
          )}

          {/* Footer Status */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#DFD3C0] text-xs text-[#6E5F54]">
            <div className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#A67C37]" aria-hidden="true" />
              <span>
                Status:{' '}
                <strong className="text-[#231B17]">
                  {emailVerified && phoneVerified
                    ? 'Active (Dual Verified)'
                    : emailVerified
                      ? 'Email Verified · Phone Pending'
                      : 'Pending Verification'}
                </strong>
              </span>
            </div>

            {user && emailVerified && phoneVerified && (
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F]"
              >
                <span>Open Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
