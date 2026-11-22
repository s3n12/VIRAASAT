import { useEffect, useState } from 'react';
import { CheckCircle2, Mail, ShieldCheck, Smartphone, X } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { apiRequest } from '../lib/api';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { UserProfile } from '../types/marketplace';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
  user: UserProfile | null;
  onAuthenticated: (token: string, user: UserProfile) => void;
}

interface OtpRequestResponse {
  ok: boolean;
  channel: 'email' | 'phone';
  normalizedIdentifier: string;
  expiresInSec: number;
  resendCooldownSec: number;
  message: string;
  deliveryMode?: string;
  previewCode?: string;
}

interface OtpVerifyResponse {
  ok: boolean;
  token: string;
  user: UserProfile;
  dualVerified: boolean;
}

export function AuthModal({
  open,
  onClose,
  token,
  user,
  onAuthenticated,
}: AuthModalProps) {
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');

  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');

  const [emailSent, setEmailSent] = useState(false);
  const [phoneSent, setPhoneSent] = useState(false);
  const [emailPreviewOtp, setEmailPreviewOtp] = useState<string | null>(null);
  const [phonePreviewOtp, setPhonePreviewOtp] = useState<string | null>(null);

  const [emailCooldown, setEmailCooldown] = useState(0);
  const [phoneCooldown, setPhoneCooldown] = useState(0);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      if (user.email) setEmail(user.email);
      if (user.phone) setPhone(user.phone);
      if (user.displayName) setDisplayName(user.displayName);
    } else {
      setEmailSent(false);
      setPhoneSent(false);
      setEmailCooldown(0);
      setPhoneCooldown(0);
      setEmailPreviewOtp(null);
      setPhonePreviewOtp(null);
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

  const requestOtp = async (channel: 'email' | 'phone') => {
    const identifier = channel === 'email' ? email : phone;
    if (!identifier.trim()) {
      setError(`Please enter your ${channel === 'email' ? 'email address' : 'mobile number'} first.`);
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(`req-${channel}`);
    try {
      const res = await apiRequest<OtpRequestResponse>('/api/auth/otp/request', {
        method: 'POST',
        body: { channel, identifier },
        token,
      });
      if (channel === 'email') {
        setEmailSent(true);
        setEmailCooldown(res.resendCooldownSec);
        setEmailPreviewOtp(res.previewCode || null);
      } else {
        setPhoneSent(true);
        setPhoneCooldown(res.resendCooldownSec);
        setPhonePreviewOtp(res.previewCode || null);
      }
      setNotice(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send OTP.');
    } finally {
      setBusy(null);
    }
  };

  const verifyOtp = async (channel: 'email' | 'phone') => {
    const identifier = channel === 'email' ? email : phone;
    const code = channel === 'email' ? emailCode : phoneCode;
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit numeric verification code.');
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(`ver-${channel}`);
    try {
      const res = await apiRequest<OtpVerifyResponse>('/api/auth/otp/verify', {
        method: 'POST',
        body: {
          channel,
          identifier,
          code: code.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          displayName: displayName.trim() || undefined,
        },
        token,
      });
      onAuthenticated(res.token, res.user);
      if (channel === 'email') {
        setEmailCode('');
        setEmailPreviewOtp(null);
        setEmailCooldown(0);
      } else {
        setPhoneCode('');
        setPhonePreviewOtp(null);
        setPhoneCooldown(0);
      }
      setNotice(
        res.dualVerified
          ? 'Both email and phone are now verified. Full marketplace access unlocked.'
          : `${channel === 'email' ? 'Email' : 'Phone'} verified. Complete the remaining channel to unlock checkout.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setNotice(null);
    setBusy('google');
    try {
      const credential = await signInWithPopup(auth, googleAuthProvider);
      const fbUser = credential.user;
      if (!fbUser.email) {
        throw new Error('Google account did not return an email address.');
      }
      const res = await apiRequest<OtpVerifyResponse>('/api/auth/firebase-sync', {
        method: 'POST',
        body: {
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName || 'VIRAASAT Patron',
          emailVerified: fbUser.emailVerified,
        },
      });
      onAuthenticated(res.token, res.user);
      setEmail(res.user.email);
      setDisplayName(res.user.displayName);
      setNotice(
        res.dualVerified
          ? 'Signed in with Google and dual-verified.'
          : 'Google email verified. Verify your mobile phone OTP below to enable checkout.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setBusy(null);
    }
  };

  const fillSeedRole = (preset: { name: string; email: string; phone: string }) => {
    setDisplayName(preset.name);
    setEmail(preset.email);
    setPhone(preset.phone);
    setEmailSent(false);
    setPhoneSent(false);
    setEmailCooldown(0);
    setPhoneCooldown(0);
    setEmailCode('');
    setPhoneCode('');
    setEmailPreviewOtp(null);
    setPhonePreviewOtp(null);
    setError(null);
    setNotice('Account details prefilled. Request and verify both OTP codes to sign in.');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#231B17]/55 backdrop-blur-[2px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Dual OTP Verification & Sign In"
    >
      <div className="w-full max-w-xl bg-[#FAF7F2] border border-[#DFD3C0] shadow-2xl my-auto">
        <div className="px-6 py-5 border-b border-[#DFD3C0] flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-[#A67C37] tracking-widest uppercase">
              Cryptographic Dual-Channel Security
            </p>
            <h2 className="font-display text-3xl text-[#231B17] mt-1">
              Sign In & Verify Identity
            </h2>
            <p className="text-xs text-[#6E5F54] mt-1">
              VIRAASAT requires both verified email and verified phone OTP before checkout or atelier actions.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close sign in dialog"
            onClick={onClose}
            className="p-2 text-[#6E5F54] hover:text-[#231B17]"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Quick-fill seeded roles (still requires genuine OTP verification) */}
          <div className="bg-[#F3ECE1] border border-[#DFD3C0] p-3.5">
            <p className="text-xs text-[#6E5F54] mb-2">
              Quick-fill seeded workspace identities (verified via live OTP):
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  fillSeedRole({
                    name: 'Ananya Deshmukh',
                    email: 'patron@viraasat.in',
                    phone: '+919844000004',
                  })
                }
                className="px-3 py-1.5 text-xs font-medium bg-[#FAF7F2] border border-[#DFD3C0] text-[#231B17] hover:border-[#6B1D2A] transition-colors"
              >
                Patron Account
              </button>
              <button
                type="button"
                onClick={() =>
                  fillSeedRole({
                    name: 'Ustad Mehmood Ansari',
                    email: 'artisan@viraasat.in',
                    phone: '+919822000002',
                  })
                }
                className="px-3 py-1.5 text-xs font-medium bg-[#FAF7F2] border border-[#DFD3C0] text-[#231B17] hover:border-[#6B1D2A] transition-colors"
              >
                Artisan Seller
              </button>
              <button
                type="button"
                onClick={() =>
                  fillSeedRole({
                    name: 'Shani Nishad',
                    email: 'shaninishad813@gmail.com',
                    phone: '+919811000001',
                  })
                }
                className="px-3 py-1.5 text-xs font-medium bg-[#FAF7F2] border border-[#DFD3C0] text-[#231B17] hover:border-[#6B1D2A] transition-colors"
              >
                Platform Admin
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 text-xs bg-[#6B1D2A]/10 border border-[#6B1D2A]/30 text-[#6B1D2A]"
            >
              {error}
            </div>
          )}

          {notice && (
            <div className="p-3 text-xs bg-[#A67C37]/10 border border-[#A67C37]/30 text-[#231B17]">
              {notice}
            </div>
          )}

          <div>
            <label htmlFor="auth-display-name" className="block text-xs font-medium text-[#6E5F54] mb-1">
              Full Name (for new patrons)
            </label>
            <input
              id="auth-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Ananya Deshmukh"
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#DFD3C0] text-[#231B17]"
            />
          </div>

          {/* Step 1: Email OTP */}
          <div className="p-4 border border-[#DFD3C0] bg-white space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-[#231B17]">
                <Mail className="w-4 h-4 text-[#A67C37]" aria-hidden="true" />
                <span>1. Email Verification</span>
              </div>
              <span className="text-xs font-medium text-[#6E5F54]">
                {emailVerified ? 'Verified' : 'Required'}
              </span>
            </div>

            <div className="flex gap-2">
              <label htmlFor="auth-email" className="sr-only">
                Email address
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="patron@viraasat.in"
                className="flex-1 px-3 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0] text-[#231B17]"
              />
              <button
                type="button"
                disabled={busy === 'req-email' || emailCooldown > 0}
                onClick={() => requestOtp('email')}
                className="px-4 py-2 text-xs font-medium bg-[#231B17] text-[#FAF7F2] hover:bg-[#3A2E28] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {emailCooldown > 0
                  ? `Resend (${emailCooldown}s)`
                  : emailSent
                    ? 'Resend Email OTP'
                    : 'Send Email OTP'}
              </button>
            </div>

            {emailPreviewOtp && (
              <p className="text-xs text-[#6B1D2A] bg-[#F3ECE1] px-3 py-1.5 font-mono">
                Preview dispatch code (non-production): <strong>{emailPreviewOtp}</strong>
              </p>
            )}

            {emailSent && (
              <div className="flex gap-2">
                <label htmlFor="auth-email-otp" className="sr-only">
                  6-digit Email OTP
                </label>
                <input
                  id="auth-email-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit email OTP"
                  className="flex-1 px-3 py-2 text-sm font-mono tracking-widest bg-[#FAF7F2] border border-[#DFD3C0]"
                />
                <button
                  type="button"
                  disabled={busy === 'ver-email'}
                  onClick={() => verifyOtp('email')}
                  className="px-4 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F] whitespace-nowrap shrink-0"
                >
                  Verify Email OTP
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Phone OTP */}
          <div className="p-4 border border-[#DFD3C0] bg-white space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-[#231B17]">
                <Smartphone className="w-4 h-4 text-[#A67C37]" aria-hidden="true" />
                <span>2. Mobile Phone Verification</span>
              </div>
              <span className="text-xs font-medium text-[#6E5F54]">
                {phoneVerified ? 'Verified' : 'Required'}
              </span>
            </div>

            <div className="flex gap-2">
              <label htmlFor="auth-phone" className="sr-only">
                Mobile phone number
              </label>
              <input
                id="auth-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98440 00004"
                className="flex-1 px-3 py-2 text-sm bg-[#FAF7F2] border border-[#DFD3C0] text-[#231B17]"
              />
              <button
                type="button"
                disabled={busy === 'req-phone' || phoneCooldown > 0}
                onClick={() => requestOtp('phone')}
                className="px-4 py-2 text-xs font-medium bg-[#231B17] text-[#FAF7F2] hover:bg-[#3A2E28] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {phoneCooldown > 0
                  ? `Resend (${phoneCooldown}s)`
                  : phoneSent
                    ? 'Resend Phone OTP'
                    : 'Send Phone OTP'}
              </button>
            </div>

            {phonePreviewOtp && (
              <p className="text-xs text-[#6B1D2A] bg-[#F3ECE1] px-3 py-1.5 font-mono">
                Preview SMS code (non-production): <strong>{phonePreviewOtp}</strong>
              </p>
            )}

            {phoneSent && (
              <div className="flex gap-2">
                <label htmlFor="auth-phone-otp" className="sr-only">
                  6-digit Phone OTP
                </label>
                <input
                  id="auth-phone-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit phone OTP"
                  className="flex-1 px-3 py-2 text-sm font-mono tracking-widest bg-[#FAF7F2] border border-[#DFD3C0]"
                />
                <button
                  type="button"
                  disabled={busy === 'ver-phone'}
                  onClick={() => verifyOtp('phone')}
                  className="px-4 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F] whitespace-nowrap shrink-0"
                >
                  Verify Phone OTP
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-[#DFD3C0]">
            <button
              type="button"
              disabled={busy === 'google'}
              onClick={handleGoogleSignIn}
              className="w-full sm:w-auto px-4 py-2 text-xs font-medium border border-[#DFD3C0] bg-white text-[#231B17] hover:border-[#231B17] transition-colors"
            >
              Continue with Google (Firebase Auth)
            </button>

            {user && (
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2 text-xs font-medium bg-[#6B1D2A] text-[#FAF7F2] hover:bg-[#52141F]"
              >
                {emailVerified && phoneVerified ? (
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                )}
                <span>
                  {emailVerified && phoneVerified ? 'Continue as Verified Member' : 'Close'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
