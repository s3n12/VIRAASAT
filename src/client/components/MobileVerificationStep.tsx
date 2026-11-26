import React, { useState } from 'react';
import { AlertCircle, Check, Loader2, Lock } from 'lucide-react';
import { useCountdown } from '../hooks/useCountdown';
import type { SessionChannelState } from '../types/registration';
import { normalizeIndianMobileClient, validateIndianMobile, validateOtpCode } from '../utils/validation';
import { CountdownTimer } from './CountdownTimer';
import { OtpInput } from './OtpInput';

interface MobileVerificationStepProps {
  emailVerified: boolean;
  mobile: string;
  channelState: SessionChannelState;
  isSending: boolean;
  isVerifying: boolean;
  serverError: string | null;
  demoMode: boolean;
  onMobileChange: (value: string) => void;
  onSendOtp: () => Promise<void>;
  onVerifyOtp: (code: string) => Promise<void>;
}

export function MobileVerificationStep({
  emailVerified,
  mobile,
  channelState,
  isSending,
  isVerifying,
  serverError,
  demoMode,
  onMobileChange,
  onSendOtp,
  onVerifyOtp,
}: MobileVerificationStepProps) {
  const [otpCode, setOtpCode] = useState('');
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  const isVerified = channelState.status === 'verified';
  const isOtpVisible = channelState.status === 'otp_sent' || channelState.status === 'expired';
  const isLockedDependency = !emailVerified && !isVerified;

  const expirySecondsLeft = useCountdown(isOtpVisible ? channelState.expiresAtMs : null);
  const resendSecondsLeft = useCountdown(isOtpVisible ? channelState.resendAvailableAtMs : null);
  const isExpired = isOtpVisible && expirySecondsLeft <= 0;

  const normalizedPreview = normalizeIndianMobileClient(mobile);

  const handleSendSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLockedDependency) return;

    const mErr = validateIndianMobile(mobile);
    setMobileError(mErr);
    setOtpError(null);
    if (mErr) return;

    setOtpCode('');
    await onSendOtp();
  };

  const handleVerifySubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isExpired) {
      setOtpError('This SMS OTP has expired. Request a fresh 6-digit code.');
      return;
    }
    const err = validateOtpCode(otpCode);
    setOtpError(err);
    if (err) return;

    await onVerifyOtp(otpCode);
  };

  const displayError = otpError || serverError;

  return (
    <section
      aria-labelledby="step-mobile-heading"
      aria-disabled={isLockedDependency}
      className={`space-y-4 transition-opacity duration-200 ${isLockedDependency ? 'opacity-60' : 'opacity-100'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-500 tabular-nums">02.</span>
          <h2 id="step-mobile-heading" className="text-sm font-semibold text-neutral-900">
            Mobile Verification
          </h2>
        </div>

        {isVerified ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0">
            <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden="true" />
            ✓ +91 Mobile Verified
          </span>
        ) : isLockedDependency ? (
          <span className="text-xs text-neutral-500 whitespace-nowrap shrink-0">Verify email first</span>
        ) : null}
      </div>

      <form onSubmit={handleSendSubmit} noValidate className="space-y-3.5">
        <div>
          <label htmlFor="mobile-input" className="block text-xs font-medium text-neutral-700 mb-1.5">
            Indian Mobile Number
          </label>
          <div className="relative">
            <input
              id="mobile-input"
              name="mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+91 9876543210"
              value={mobile}
              disabled={isLockedDependency || isVerified || isSending}
              aria-invalid={Boolean(mobileError)}
              aria-describedby={mobileError ? 'mobile-error' : 'mobile-helper'}
              onChange={(e) => {
                onMobileChange(e.target.value);
                if (mobileError) setMobileError(validateIndianMobile(e.target.value));
              }}
              className={`w-full rounded-xl border px-3.5 py-2.5 font-mono text-sm tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                isVerified
                  ? 'cursor-not-allowed border-emerald-200 bg-neutral-50 text-neutral-700 pr-9'
                  : isLockedDependency
                    ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400'
                    : mobileError
                      ? 'border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 hover:border-neutral-400 focus:border-neutral-900 focus:ring-neutral-900/15'
              }`}
            />
            {isVerified || isLockedDependency ? (
              <Lock
                className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
                aria-hidden="true"
              />
            ) : null}
          </div>

          {mobileError ? (
            <p id="mobile-error" role="alert" className="mt-1.5 text-xs text-red-600">
              {mobileError}
            </p>
          ) : (
            <p id="mobile-helper" className="mt-1.5 text-[11px] text-neutral-500">
              {isLockedDependency
                ? 'Unlocks automatically after your email is verified.'
                : normalizedPreview
                  ? `Normalized to ${normalizedPreview.e164}`
                  : '10-digit Indian mobile starting with 6, 7, 8, or 9 (+91).'}
            </p>
          )}
        </div>

        {!isVerified && !isOtpVisible ? (
          <button
            type="submit"
            disabled={isLockedDependency || isSending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Sending SMS OTP...
              </>
            ) : (
              'Send SMS OTP'
            )}
          </button>
        ) : null}
      </form>

      {!isVerified && isOtpVisible ? (
        <form onSubmit={handleVerifySubmit} noValidate className="space-y-3.5 pt-1">
          <div className="space-y-1">
            <p className="text-xs text-neutral-600">
              Enter the 6-digit SMS code sent to{' '}
              <span className="font-mono font-medium tabular-nums text-neutral-900">
                {channelState.identifier || normalizedPreview?.e164 || mobile}
              </span>
            </p>
            {demoMode ? (
              <p className="text-[11px] text-amber-800">
                Demo shortcut: enter <span className="font-mono font-semibold">123456</span> or the OTP logged in the server console.
              </p>
            ) : null}
          </div>

          <OtpInput
            idPrefix="mobile-otp"
            label="Mobile SMS verification code"
            value={otpCode}
            onChange={(val) => {
              setOtpCode(val);
              if (otpError) setOtpError(null);
            }}
            disabled={isVerifying || isExpired}
            hasError={Boolean(displayError)}
            autoFocus
          />

          <CountdownTimer
            expirySecondsLeft={expirySecondsLeft}
            resendSecondsLeft={resendSecondsLeft}
            isSending={isSending}
            onResend={() => void handleSendSubmit()}
          />

          {displayError ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{displayError}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isVerifying || isExpired || otpCode.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            {isVerifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Verifying Mobile...
              </>
            ) : (
              'Verify SMS OTP'
            )}
          </button>
        </form>
      ) : null}

      {!isVerified && !isOtpVisible && serverError ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      ) : null}
    </section>
  );
}
