import type {
  ApiErrorPayload,
  OtpChannel,
  PublicAppConfig,
  RegisterAccountResponse,
  SendOtpResponse,
  ServerSessionState,
  VerifyOtpResponse,
} from '../types/registration';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly retryAfterSec?: number;
  public readonly remainingAttempts?: number;

  constructor(params: {
    message: string;
    status: number;
    code?: string;
    retryAfterSec?: number;
    remainingAttempts?: number;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.status = params.status;
    this.code = params.code || 'REQUEST_FAILED';
    this.retryAfterSec = params.retryAfterSec;
    this.remainingAttempts = params.remainingAttempts;
  }
}

async function requestJson<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
    registrationSessionId?: string | null;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'DualOTP-Client',
  };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.registrationSessionId) {
    headers['X-Registration-Session'] = options.registrationSessionId;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiClientError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the server. Check your connection and try again.',
    });
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errPayload = (data || {}) as Partial<ApiErrorPayload>;
    throw new ApiClientError({
      status: response.status,
      code: errPayload.code || `HTTP_${response.status}`,
      message:
        errPayload.error ||
        (response.status === 429
          ? 'Too many requests. Please wait a moment and try again.'
          : 'Request could not be completed. Please try again.'),
      retryAfterSec: errPayload.retryAfterSec,
      remainingAttempts: errPayload.remainingAttempts,
    });
  }

  return data as T;
}

export const registrationApi = {
  getConfig(): Promise<PublicAppConfig> {
    return requestJson<PublicAppConfig>('/api/config');
  },

  getSession(): Promise<{ ok: true; session: ServerSessionState }> {
    return requestJson<{ ok: true; session: ServerSessionState }>('/api/auth/session');
  },

  resetSession(registrationSessionId?: string | null): Promise<{
    ok: true;
    message: string;
    session: ServerSessionState;
  }> {
    return requestJson('/api/auth/session/reset', {
      method: 'POST',
      registrationSessionId,
    });
  },

  sendEmailOtp(params: {
    fullName: string;
    email: string;
    registrationSessionId?: string | null;
  }): Promise<SendOtpResponse> {
    return requestJson<SendOtpResponse>('/api/otp/send-email', {
      method: 'POST',
      registrationSessionId: params.registrationSessionId,
      body: {
        fullName: params.fullName,
        email: params.email,
        ...(params.registrationSessionId
          ? { registrationSessionId: params.registrationSessionId }
          : {}),
      },
    });
  },

  sendSmsOtp(params: {
    mobile: string;
    registrationSessionId?: string | null;
  }): Promise<SendOtpResponse> {
    return requestJson<SendOtpResponse>('/api/otp/send-sms', {
      method: 'POST',
      registrationSessionId: params.registrationSessionId,
      body: {
        mobile: params.mobile,
        ...(params.registrationSessionId
          ? { registrationSessionId: params.registrationSessionId }
          : {}),
      },
    });
  },

  verifyOtp(params: {
    channel: OtpChannel;
    identifier: string;
    otp: string;
    registrationSessionId?: string | null;
  }): Promise<VerifyOtpResponse> {
    return requestJson<VerifyOtpResponse>('/api/otp/verify', {
      method: 'POST',
      registrationSessionId: params.registrationSessionId,
      body: {
        channel: params.channel,
        identifier: params.identifier,
        otp: params.otp,
        ...(params.registrationSessionId
          ? { registrationSessionId: params.registrationSessionId }
          : {}),
      },
    });
  },

  completeRegistration(params: {
    fullName: string;
    emailVerificationToken: string;
    mobileVerificationToken: string;
    registrationSessionId?: string | null;
  }): Promise<RegisterAccountResponse> {
    return requestJson<RegisterAccountResponse>('/api/auth/register', {
      method: 'POST',
      registrationSessionId: params.registrationSessionId,
      body: {
        fullName: params.fullName,
        emailVerificationToken: params.emailVerificationToken,
        mobileVerificationToken: params.mobileVerificationToken,
      },
    });
  },
};
