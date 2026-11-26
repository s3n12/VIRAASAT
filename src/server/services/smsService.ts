import type { AppEnvConfig } from '../config/env.ts';
import type { NormalizedIndianMobile } from '../utils/crypto.ts';

export interface SendSmsOtpDispatchParams {
  mobile: NormalizedIndianMobile;
  otp: string;
  expiresInMinutes: number;
  cfg: AppEnvConfig;
}

export type SmsDispatchResult =
  | { ok: true; provider: 'msg91' | 'demo'; requestId: string }
  | { ok: false; statusCode: number; code: string; error: string };

/**
 * Integrates MSG91 OTP API v5:
 *   POST https://control.msg91.com/api/v5/otp
 * Uses server-side MSG91_AUTH_KEY and MSG91_TEMPLATE_ID.
 * Sends normalized Indian mobile numbers in 91XXXXXXXXXX format.
 */
export async function dispatchSmsOtp(params: SendSmsOtpDispatchParams): Promise<SmsDispatchResult> {
  const { mobile, otp, expiresInMinutes, cfg } = params;

  if (cfg.demoMode) {
    // Server console log ONLY — never returned to the browser
    console.info(
      `[DEMO_MODE][SMS OTP] To: ${mobile.e164} | Generated OTP: ${otp} (Demo shortcut also accepted: ${cfg.demoOtpCode}) | Expires in ${expiresInMinutes}m`
    );
    return {
      ok: true,
      provider: 'demo',
      requestId: `demo_sms_${Date.now()}`,
    };
  }

  if (!cfg.msg91AuthKey || !cfg.msg91TemplateId) {
    return {
      ok: false,
      statusCode: 503,
      code: 'SMS_PROVIDER_NOT_CONFIGURED',
      error:
        'SMS delivery is not configured. Set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID on the server, or enable DEMO_MODE=true for development.',
    };
  }

  const fetcher = cfg.fetchImpl ?? fetch;

  try {
    const endpoint = new URL('https://control.msg91.com/api/v5/otp');
    endpoint.searchParams.set('template_id', cfg.msg91TemplateId);
    endpoint.searchParams.set('mobile', mobile.msg91Mobile);
    endpoint.searchParams.set('otp', otp);
    endpoint.searchParams.set('otp_expiry', String(expiresInMinutes));

    const response = await fetcher(endpoint.toString(), {
      method: 'POST',
      headers: {
        authkey: cfg.msg91AuthKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        template_id: cfg.msg91TemplateId,
        mobile: mobile.msg91Mobile,
        otp,
        otp_expiry: expiresInMinutes,
        OTP: otp,
      }),
    });

    const rawText = await response.text();
    let parsed: { type?: string; message?: string; request_id?: string } = {};
    try {
      parsed = JSON.parse(rawText) as { type?: string; message?: string; request_id?: string };
    } catch {
      parsed = {};
    }

    if (!response.ok || parsed.type === 'error') {
      return {
        ok: false,
        statusCode: response.status >= 500 ? 502 : 400,
        code: 'SMS_DELIVERY_FAILED',
        error: parsed.message
          ? `SMS delivery failed: ${parsed.message}`
          : 'Unable to send verification SMS at this time. Please try again.',
      };
    }

    return {
      ok: true,
      provider: 'msg91',
      requestId: parsed.request_id || parsed.message || 'accepted',
    };
  } catch {
    return {
      ok: false,
      statusCode: 502,
      code: 'SMS_PROVIDER_UNREACHABLE',
      error: 'Unable to connect to the SMS delivery gateway. Please try again shortly.',
    };
  }
}
