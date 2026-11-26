import type { AppEnvConfig } from '../config/env.ts';

export interface SendEmailOtpDispatchParams {
  toEmail: string;
  fullName: string;
  otp: string;
  expiresInMinutes: number;
  cfg: AppEnvConfig;
}

export type EmailDispatchResult =
  | { ok: true; provider: 'resend' | 'demo'; messageId: string }
  | { ok: false; statusCode: number; code: string; error: string };

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml(fullName: string, otp: string, expiresInMinutes: number): string {
  const safeName = escapeHtml(fullName);
  const safeOtp = escapeHtml(otp);
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#0f172a;">Verify your email address</h1>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">
            Hello ${safeName}, enter the 6-digit verification code below to confirm your email address.
          </p>
          <div style="margin:24px 0;padding:18px;text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:#0f172a;">
            ${safeOtp}
          </div>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748b;">
            This code expires in ${expiresInMinutes} minutes and can only be used once.
          </p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
            If you did not request this verification code, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function dispatchEmailOtp(params: SendEmailOtpDispatchParams): Promise<EmailDispatchResult> {
  const { toEmail, fullName, otp, expiresInMinutes, cfg } = params;

  if (cfg.demoMode) {
    // Server console log ONLY — never returned to the browser
    console.info(
      `[DEMO_MODE][EMAIL OTP] To: ${toEmail} | Name: ${fullName} | Generated OTP: ${otp} (Demo shortcut also accepted: ${cfg.demoOtpCode}) | Expires in ${expiresInMinutes}m`
    );
    return {
      ok: true,
      provider: 'demo',
      messageId: `demo_email_${Date.now()}`,
    };
  }

  if (!cfg.resendApiKey || !cfg.resendFromEmail) {
    return {
      ok: false,
      statusCode: 503,
      code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      error:
        'Email delivery is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL on the server, or enable DEMO_MODE=true for development.',
    };
  }

  const fetcher = cfg.fetchImpl ?? fetch;

  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.resendApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        from: cfg.resendFromEmail,
        to: [toEmail],
        subject: 'Your 6-digit verification code',
        html: buildEmailHtml(fullName, otp, expiresInMinutes),
        text: `Hello ${fullName},\n\nYour 6-digit verification code is: ${otp}\n\nThis code expires in ${expiresInMinutes} minutes and can only be used once.`,
      }),
    });

    const rawText = await response.text();
    let parsed: { id?: string; message?: string; name?: string } = {};
    try {
      parsed = JSON.parse(rawText) as { id?: string; message?: string; name?: string };
    } catch {
      parsed = {};
    }

    if (!response.ok || !parsed.id) {
      return {
        ok: false,
        statusCode: response.status >= 500 ? 502 : 400,
        code: 'EMAIL_DELIVERY_FAILED',
        error: parsed.message
          ? `Email delivery failed: ${parsed.message}`
          : 'Unable to send verification email at this time. Please try again.',
      };
    }

    return {
      ok: true,
      provider: 'resend',
      messageId: parsed.id,
    };
  } catch {
    return {
      ok: false,
      statusCode: 502,
      code: 'EMAIL_PROVIDER_UNREACHABLE',
      error: 'Unable to connect to the email delivery service. Please try again shortly.',
    };
  }
}
