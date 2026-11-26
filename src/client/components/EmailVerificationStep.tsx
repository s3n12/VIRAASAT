import React, { useState } from 'react';
import { AlertCircle, Check, Loader2, Lock } from 'lucide-react';
import { useCountdown } from '../hooks/useCountdown';
import type { SessionChannelState } from '../types/registration';
import { validateEmail, validateFullName, validateOtpCode } from '../utils/validation';
import { CountdownTimer } from './CountdownTimer';
import { OtpInput } from './OtpInput';

interface EmailVerificationStepProps {
  fullName: string;
  email: string;
  channelState: SessionChannelState;
  isSending: boolean;
  isVerifying: boolean;
  serverError: string | null;
  demoMode: boolean;
  onFullNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onSendOtp: () => Promise<void>;
  onVerifyOtp: (code: string) => Promise<void>;
}

export function EmailVerificationStep({
  fullName,
  email,
  channelState,
  isSending,
  isVerifying,
  serverError,
  demoMode,
  onFullNameChange,
  onEmailChange,
  onSendOtp,
  onVerifyOtp,
}: EmailVerificationStepProps) {
  const [otpCode, setOtpCode] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  const isVerified = channelState.status === 'verified';
  const isOtpVisible = channelState.status === 'otp_sent' || channelState.status === 'expired';
  const expirySecondsLeft = useCountdown(isOtpVisible ? channelState.expiresAtMs : null);
  const resendSecondsLeft = useCountdown(isOtpVisible ? channelState.resendAvailableAtMs : null);
  const isExpired = isOtpVisible && expirySecondsLeft <= 0;

  const handleSendSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const nErr = validateFullName(fullName);
    const eErr = validateEmail(email);
    setNameError(nErr);
    setEmailError(eErr);
    setOtpError(null);
    if (nErr || eErr) return;

    setOtpCode('');
    await onSendOtp();
  };

  const handleVerifySubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isExpired) {
      setOtpError('This OTP has expired. Request a fresh 6-digit code.');
      return;
    }
    const err = validateOtpCode(otpCode);
    setOtpError(err);
    if (err) return;

    await onVerifyOtp(otpCode);
  };

  const displayError = otpError || serverError;

  return (
    <section aria-labelledby="step-email-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-500 tabular-nums">01.</span>
          <h2 id="step-email-heading" className="text-sm font-semibold text-neutral-900">
            Email Verification
          </h2>
        </div>

        {isVerified ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0">
            <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden="true" />
            ✓ Email Verified
          </span>
        ) : null}
      </div>

      <form onSubmit={handleSendSubmit} noValidate className="space-y-3.5">
        <div>
          <label htmlFor="full-name-input" className="block text-xs font-medium text-neutral-700 mb-1.5">
            Full Name
          </label>
          <div className="relative">
            <input
              id="full-name-input"
              name="fullName"
              type="text"
              autoComplete="name"
              placeholder="e.g. Ananya Deshmukh"
              value={fullName}
              disabled={isVerified || isSending}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? 'full-name-error' : undefined}
              onChange={(e) => {
                onFullNameChange(e.target.value);
                if (nameError) setNameError(validateFullName(e.target.value));
              }}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                isVerified
                  ? 'cursor-not-allowed border-emerald-200 bg-neutral-50 text-neutral-700 pr-9'
                  : nameError
                    ? 'border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 hover:border-neutral-400 focus:border-neutral-900 focus:ring-neutral-900/15'
              }`}
            />
            {isVerified ? (
              <Lock
                className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
                aria-hidden="true"
              />
            ) : null}
          </div>
          {nameError ? (
            <p id="full-name-error" role="alert" className="mt-1.5 text-xs text-red-600">
              {nameError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="email-input" className="block text-xs font-medium text-neutral-700 mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <input
              id="email-input"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@domain.com"
              value={email}
              disabled={isVerified || isSending}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? 'email-error' : undefined}
              onChange={(e) => {
                onEmailChange(e.target.value);
                if (emailError) setEmailError(validateEmail(e.target.value));
              }}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                isVerified
                  ? 'cursor-not-allowed border-emerald-200 bg-neutral-50 text-neutral-700 pr-9'
                  : emailError
                    ? 'border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 hover:border-neutral-400 focus:border-neutral-900 focus:ring-neutral-900/15'
              }`}
            />
            {isVerified ? (
              <Lock
                className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
                aria-hidden="true"
              />
            ) : null}
          </div>
          {emailError ? (
            <p id="email-error" role="alert" className="mt-1.5 text-xs text-red-600">
              {emailError}
            </p>
          ) : null}
        </div>

        {!isVerified && !isOtpVisible ? (
          <button
            type="submit"
            disabled={isSending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Sending Email OTP...
              </>
            ) : (
              'Send Email OTP'
            )}
          </button>
        ) : null}
      </form>

      {!isVerified && isOtpVisible ? (
        <form onSubmit={handleVerifySubmit} noValidate className="space-y-3.5 pt-1">
          <div className="space-y-1">
            <p className="text-xs text-neutral-600">
              Enter the 6-digit code sent to{' '}
              <span className="font-medium text-neutral-900">
                {channelState.identifier || email.trim().toLowerCase()}
              </span>
            </p>
            {demoMode ? (
              <p className="text-[11px] text-amber-800">
                Demo shortcut: enter <span className="font-mono font-semibold">123456</span> or the OTP logged in the server console.
              </p>
            ) : null}
          </div>

          <OtpInput
            idPrefix="email-otp"
            label="Email verification code"
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
                Verifying Email...
              </>
            ) : (
              'Verify Email OTP'
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
