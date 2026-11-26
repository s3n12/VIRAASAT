import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Info, Loader2, RotateCcw, Shield } from 'lucide-react';
import { EmailVerificationStep } from '../components/EmailVerificationStep';
import { MobileVerificationStep } from '../components/MobileVerificationStep';
import { ProgressStepper } from '../components/ProgressStepper';
import { RegistrationSuccess } from '../components/RegistrationSuccess';
import { StatusBanner } from '../components/StatusBanner';
import { ToastViewport } from '../components/ToastViewport';
import { useToast } from '../hooks/useToast';
import { ApiClientError, registrationApi } from '../services/api';
import type {
  PublicAppConfig,
  RegisteredUserSummary,
  ServerSessionState,
  SessionChannelState,
} from '../types/registration';
import { normalizeEmail, normalizeIndianMobileClient, validateFullName } from '../utils/validation';

const IDLE_CHANNEL: SessionChannelState = {
  status: 'idle',
  identifier: null,
  maskedIdentifier: null,
  expiresAtMs: null,
  resendAvailableAtMs: null,
  attemptsRemaining: null,
  verificationToken: null,
};

export function RegistrationPage() {
  const { toasts, pushToast, dismissToast } = useToast();

  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [config, setConfig] = useState<PublicAppConfig | null>(null);

  const [registrationSessionId, setRegistrationSessionId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');

  const [emailState, setEmailState] = useState<SessionChannelState>(IDLE_CHANNEL);
  const [mobileState, setMobileState] = useState<SessionChannelState>(IDLE_CHANNEL);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);

  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [isSendingMobile, setIsSendingMobile] = useState(false);
  const [isVerifyingMobile, setIsVerifyingMobile] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [completedUser, setCompletedUser] = useState<RegisteredUserSummary | null>(null);

  const hydrateFromServerSession = useCallback((session: ServerSessionState) => {
    setRegistrationSessionId(session.registrationSessionId);
    if (session.fullName) setFullName(session.fullName);
    if (session.email.identifier) setEmail(session.email.identifier);
    if (session.mobile.identifier) setMobile(session.mobile.identifier);
    setEmailState(session.email);
    setMobileState(session.mobile);
  }, []);

  const bootstrap = useCallback(async () => {
    setIsInitializing(true);
    setInitError(null);
    try {
      const [cfgRes, sessionRes] = await Promise.all([
        registrationApi.getConfig(),
        registrationApi.getSession(),
      ]);
      setConfig(cfgRes);
      hydrateFromServerSession(sessionRes.session);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Unable to initialize registration session. Please retry.';
      setInitError(msg);
    } finally {
      setIsInitializing(false);
    }
  }, [hydrateFromServerSession]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const emailVerified =
    emailState.status === 'verified' && Boolean(emailState.verificationToken);
  const mobileVerified =
    mobileState.status === 'verified' && Boolean(mobileState.verificationToken);
  const bothVerified = emailVerified && mobileVerified;

  const handleSendEmailOtp = async () => {
    if (isSendingEmail || emailVerified) return;
    setIsSendingEmail(true);
    setEmailError(null);
    setCompletionError(null);

    try {
      const normalizedEmail = normalizeEmail(email);
      const res = await registrationApi.sendEmailOtp({
        fullName: fullName.trim(),
        email: normalizedEmail,
        registrationSessionId,
      });

      setRegistrationSessionId(res.registrationSessionId);
      setEmail(res.normalizedIdentifier);
      setEmailState({
        status: 'otp_sent',
        identifier: res.normalizedIdentifier,
        maskedIdentifier: res.normalizedIdentifier,
        expiresAtMs: res.expiresAtMs,
        resendAvailableAtMs: res.resendAvailableAtMs,
        attemptsRemaining: config?.maxOtpAttempts ?? 5,
        verificationToken: null,
      });

      pushToast({
        variant: 'info',
        title: 'Email OTP sent',
        description: res.message,
      });
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : 'Unable to send email OTP right now.';
      setEmailError(message);
      pushToast({ variant: 'error', title: 'Email OTP failed', description: message });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleVerifyEmailOtp = async (code: string) => {
    if (isVerifyingEmail || emailVerified) return;
    setIsVerifyingEmail(true);
    setEmailError(null);

    try {
      const identifier = emailState.identifier || normalizeEmail(email);
      const res = await registrationApi.verifyOtp({
        channel: 'email',
        identifier,
        otp: code,
        registrationSessionId,
      });

      setRegistrationSessionId(res.registrationSessionId);
      setEmail(res.normalizedIdentifier);
      setEmailState({
        status: 'verified',
        identifier: res.normalizedIdentifier,
        maskedIdentifier: res.normalizedIdentifier,
        expiresAtMs: res.tokenExpiresAtMs,
        resendAvailableAtMs: null,
        attemptsRemaining: null,
        verificationToken: res.verificationToken,
      });

      pushToast({
        variant: 'success',
        title: 'Email verified',
        description: 'Step 2 (Indian mobile verification) is now unlocked.',
      });
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : 'Unable to verify email code.';
      setEmailError(message);
      if (err instanceof ApiClientError && err.code === 'OTP_EXPIRED') {
        setEmailState((prev) => ({ ...prev, status: 'expired' }));
      }
      pushToast({ variant: 'error', title: 'Verification failed', description: message });
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  const handleSendMobileOtp = async () => {
    if (isSendingMobile || mobileVerified || !emailVerified) return;
    setIsSendingMobile(true);
    setMobileError(null);
    setCompletionError(null);

    try {
      const normalized = normalizeIndianMobileClient(mobile);
      const res = await registrationApi.sendSmsOtp({
        mobile: normalized ? normalized.e164 : mobile,
        registrationSessionId,
      });

      setRegistrationSessionId(res.registrationSessionId);
      setMobile(res.normalizedIdentifier);
      setMobileState({
        status: 'otp_sent',
        identifier: res.normalizedIdentifier,
        maskedIdentifier: normalized?.masked ?? res.normalizedIdentifier,
        expiresAtMs: res.expiresAtMs,
        resendAvailableAtMs: res.resendAvailableAtMs,
        attemptsRemaining: config?.maxOtpAttempts ?? 5,
        verificationToken: null,
      });

      pushToast({
        variant: 'info',
        title: 'SMS OTP sent',
        description: res.message,
      });
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : 'Unable to send SMS OTP right now.';
      setMobileError(message);
      pushToast({ variant: 'error', title: 'SMS OTP failed', description: message });
    } finally {
      setIsSendingMobile(false);
    }
  };

  const handleVerifyMobileOtp = async (code: string) => {
    if (isVerifyingMobile || mobileVerified) return;
    setIsVerifyingMobile(true);
    setMobileError(null);

    try {
      const normalized = normalizeIndianMobileClient(mobile);
      const identifier = mobileState.identifier || normalized?.e164 || mobile;
      const res = await registrationApi.verifyOtp({
        channel: 'mobile',
        identifier,
        otp: code,
        registrationSessionId,
      });

      setRegistrationSessionId(res.registrationSessionId);
      setMobile(res.normalizedIdentifier);
      setMobileState({
        status: 'verified',
        identifier: res.normalizedIdentifier,
        maskedIdentifier: normalized?.masked ?? res.normalizedIdentifier,
        expiresAtMs: res.tokenExpiresAtMs,
        resendAvailableAtMs: null,
        attemptsRemaining: null,
        verificationToken: res.verificationToken,
      });

      pushToast({
        variant: 'success',
        title: '+91 Mobile verified',
        description: 'Both channels are verified. You can now complete account creation.',
      });
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : 'Unable to verify SMS code.';
      setMobileError(message);
      if (err instanceof ApiClientError && err.code === 'OTP_EXPIRED') {
        setMobileState((prev) => ({ ...prev, status: 'expired' }));
      }
      pushToast({ variant: 'error', title: 'Verification failed', description: message });
    } finally {
      setIsVerifyingMobile(false);
    }
  };

  const handleCompleteRegistration = async () => {
    if (isCompleting || !bothVerified) return;
    const nameErr = validateFullName(fullName);
    if (nameErr) {
      setCompletionError(nameErr);
      return;
    }

    if (!emailState.verificationToken || !mobileState.verificationToken) {
      setCompletionError('Both verified channel tokens are required. Please verify again.');
      return;
    }

    setIsCompleting(true);
    setCompletionError(null);

    try {
      const res = await registrationApi.completeRegistration({
        fullName: fullName.trim(),
        emailVerificationToken: emailState.verificationToken,
        mobileVerificationToken: mobileState.verificationToken,
        registrationSessionId,
      });

      setCompletedUser(res.user);
      pushToast({
        variant: 'success',
        title: 'Account created',
        description: 'Your verified account has been saved.',
      });
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : 'Unable to complete account creation. Please try again.';
      setCompletionError(message);
      if (
        err instanceof ApiClientError &&
        (err.code === 'TOKEN_EXPIRED' || err.code === 'TOKEN_ALREADY_CONSUMED')
      ) {
        // Refresh session state directly from the server on token expiration
        try {
          const fresh = await registrationApi.getSession();
          hydrateFromServerSession(fresh.session);
        } catch {
          // keep error banner visible
        }
      }
      pushToast({ variant: 'error', title: 'Registration failed', description: message });
    } finally {
      setIsCompleting(false);
    }
  };

  const handleRestartVerification = async () => {
    if (isResetting) return;
    setIsResetting(true);
    setEmailError(null);
    setMobileError(null);
    setCompletionError(null);

    try {
      const res = await registrationApi.resetSession(registrationSessionId);
      setCompletedUser(null);
      setFullName('');
      setEmail('');
      setMobile('');
      hydrateFromServerSession(res.session);
      pushToast({
        variant: 'info',
        title: 'Verification restarted',
        description: 'Previous verification tokens were cleared.',
      });
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : 'Unable to reset session right now.';
      pushToast({ variant: 'error', title: 'Reset failed', description: message });
    } finally {
      setIsResetting(false);
    }
  };

  const hasProgressToReset =
    emailState.status !== 'idle' || mobileState.status !== 'idle';

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-neutral-900 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
      <main className="w-full max-w-[420px]">
        <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 sm:p-8 shadow-[0_8px_30px_rgb(15,23,42,0.06)]">
          {/* Header */}
          <header className="space-y-2 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-900">
              <Shield className="h-5 w-5" aria-hidden="true" />
            </div>
            <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900 text-balance">
              Create Verified Account
            </h1>
            <p className="text-[13px] leading-relaxed text-neutral-600">
              Passwordless 6-digit OTP verification. Secure your account using email and mobile verification.
            </p>
          </header>

          {/* DEMO MODE or Provider Configuration Notice */}
          {config?.demoMode ? (
            <div
              role="note"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-950"
            >
              <Info className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" aria-hidden="true" />
              <div className="leading-relaxed">
                <span className="font-semibold">DEMO MODE</span> — External email/SMS keys are not required. Enter{' '}
                <span className="font-mono font-semibold">123456</span> or check the server console for the generated OTP.
              </div>
            </div>
          ) : config && config.missingProviders.length > 0 ? (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/80 px-3.5 py-2.5 text-xs text-red-800"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" aria-hidden="true" />
              <div className="leading-relaxed">
                Production mode requires server credentials:{' '}
                <span className="font-mono font-medium">{config.missingProviders.join(', ')}</span>.
              </div>
            </div>
          ) : null}

          {/* Three-stage Progress Indicator */}
          <div className="mt-6">
            <ProgressStepper
              emailVerified={emailVerified}
              mobileVerified={mobileVerified}
              accountCompleted={Boolean(completedUser)}
            />
          </div>

          <hr className="my-6 border-neutral-200/80" />

          {/* Main Card Body */}
          {isInitializing ? (
            <div className="space-y-4 py-2" aria-busy="true" aria-label="Loading verification session">
              <div className="h-10 w-full animate-pulse rounded-xl bg-neutral-100" />
              <div className="space-y-2.5">
                <div className="h-3.5 w-24 animate-pulse rounded bg-neutral-100" />
                <div className="h-10 w-full animate-pulse rounded-xl bg-neutral-100" />
              </div>
              <div className="space-y-2.5">
                <div className="h-3.5 w-28 animate-pulse rounded bg-neutral-100" />
                <div className="h-10 w-full animate-pulse rounded-xl bg-neutral-100" />
              </div>
              <div className="h-10 w-full animate-pulse rounded-xl bg-neutral-200/70" />
            </div>
          ) : initError ? (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-sm text-neutral-700">{initError}</p>
              <button
                type="button"
                onClick={() => void bootstrap()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retry Connection
              </button>
            </div>
          ) : completedUser ? (
            <RegistrationSuccess
              user={completedUser}
              onStartNewRegistration={() => void handleRestartVerification()}
            />
          ) : (
            <div className="space-y-6">
              {/* Persistent Verification Status Banner */}
              <StatusBanner emailVerified={emailVerified} mobileVerified={mobileVerified} />

              {/* Step 1: Email Verification */}
              <EmailVerificationStep
                fullName={fullName}
                email={email}
                channelState={emailState}
                isSending={isSendingEmail}
                isVerifying={isVerifyingEmail}
                serverError={emailError}
                demoMode={Boolean(config?.demoMode)}
                onFullNameChange={setFullName}
                onEmailChange={setEmail}
                onSendOtp={handleSendEmailOtp}
                onVerifyOtp={handleVerifyEmailOtp}
              />

              <hr className="border-neutral-200/80" />

              {/* Step 2: Indian Mobile Verification */}
              <MobileVerificationStep
                emailVerified={emailVerified}
                mobile={mobile}
                channelState={mobileState}
                isSending={isSendingMobile}
                isVerifying={isVerifyingMobile}
                serverError={mobileError}
                demoMode={Boolean(config?.demoMode)}
                onMobileChange={setMobile}
                onSendOtp={handleSendMobileOtp}
                onVerifyOtp={handleVerifyMobileOtp}
              />

              {/* Step 3: Final Account Completion (only revealed after BOTH channels verified) */}
              {bothVerified ? (
                <div className="space-y-3 pt-1">
                  {completionError ? (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{completionError}</span>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handleCompleteRegistration()}
                    disabled={isCompleting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                  >
                    {isCompleting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Creating Verified Account...
                      </>
                    ) : (
                      'Complete Account Creation'
                    )}
                  </button>
                </div>
              ) : null}

              {/* Explicit Restart Action when a channel has started/locked */}
              {hasProgressToReset ? (
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => void handleRestartVerification()}
                    disabled={isResetting}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 rounded"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    {isResetting ? 'Restarting...' : 'Change email or mobile (restart verification)'}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <footer className="mt-5 text-center text-[11px] text-neutral-500">
          6-digit OTPs expire in 5 minutes · Signed server-side verification tokens
        </footer>
      </main>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
