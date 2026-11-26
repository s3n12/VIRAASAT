export type OtpChannel = 'email' | 'mobile';

export type ChannelStatus = 'idle' | 'otp_sent' | 'expired' | 'verified';

export interface PublicAppConfig {
  ok: true;
  demoMode: boolean;
  otpExpirySec: number;
  resendCooldownSec: number;
  maxOtpAttempts: number;
  emailProviderReady: boolean;
  smsProviderReady: boolean;
  missingProviders: string[];
}

export interface SessionChannelState {
  status: ChannelStatus;
  identifier: string | null;
  maskedIdentifier?: string | null;
  expiresAtMs: number | null;
  resendAvailableAtMs: number | null;
  attemptsRemaining: number | null;
  verificationToken: string | null;
}

export interface ServerSessionState {
  registrationSessionId: string;
  fullName: string;
  email: SessionChannelState;
  mobile: SessionChannelState;
  bothVerified: boolean;
  demoMode: boolean;
}

export interface SendOtpResponse {
  ok: true;
  registrationSessionId: string;
  channel: OtpChannel;
  normalizedIdentifier: string;
  expiresAtMs: number;
  resendAvailableAtMs: number;
  expiresInSec: number;
  resendCooldownSec: number;
  demoMode: boolean;
  message: string;
}

export interface VerifyOtpResponse {
  ok: true;
  registrationSessionId: string;
  channel: OtpChannel;
  normalizedIdentifier: string;
  verificationToken: string;
  tokenExpiresAtMs: number;
  message: string;
}

export interface RegisteredUserSummary {
  id: string;
  fullName: string;
  email: string;
  maskedMobile: string;
  emailVerified: true;
  mobileVerified: true;
  createdAt: string;
}

export interface RegisterAccountResponse {
  ok: true;
  message: string;
  user: RegisteredUserSummary;
}

export interface ApiErrorPayload {
  ok: false;
  code?: string;
  error: string;
  retryAfterSec?: number;
  remainingAttempts?: number;
  fieldErrors?: Record<string, string[] | undefined>;
}

export interface ToastItem {
  id: string;
  variant: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}
