import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app.ts';
import type { AppEnvOverrides } from './config/env.ts';
import { normalizeIndianMobile } from './utils/crypto.ts';

async function startTestServer(overrides: AppEnvOverrides = {}) {
  const instance = createApp({
    nodeEnv: 'test',
    sqlitePath: ':memory:',
    jwtSecret: 'test_jwt_secret_key_for_dual_otp_acceptance_32bytes',
    otpHashSecret: 'test_otp_pepper_secret_for_dual_otp_acceptance_32b',
    ...overrides,
  });

  const server = http.createServer(instance.app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert(addr && typeof addr !== 'string');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    db: instance.db,
    cfg: instance.cfg,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      instance.close();
    },
  };
}

async function postJson(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {}
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'DualOTP-Client',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as Record<string, unknown>;
  return { status: response.status, json, headers: response.headers };
}

test('Acceptance #1 & #2: Rejects empty name/invalid email; sends OTP for valid email without leaking OTP', async () => {
  const srv = await startTestServer({ demoMode: true });
  try {
    const emptyName = await postJson(srv.baseUrl, '/api/otp/send-email', {
      fullName: '   ',
      email: 'ananya@example.com',
    });
    assert.equal(emptyName.status, 400);

    const invalidEmail = await postJson(srv.baseUrl, '/api/otp/send-email', {
      fullName: 'Ananya Deshmukh',
      email: 'not-an-email',
    });
    assert.equal(invalidEmail.status, 400);

    const validEmail = await postJson(srv.baseUrl, '/api/otp/send-email', {
      fullName: 'Ananya Deshmukh',
      email: '  Ananya.Deshmukh@Example.COM ',
    });
    assert.equal(validEmail.status, 200);
    assert.equal(validEmail.json.ok, true);
    assert.equal(validEmail.json.normalizedIdentifier, 'ananya.deshmukh@example.com');
    assert.equal(validEmail.json.otp, undefined);
    assert.equal(validEmail.json.expiresInSec, 300);
    assert.equal(validEmail.json.resendCooldownSec, 60);
  } finally {
    await srv.close();
  }
});

test('Acceptance #3 & #4: Rejects invalid mobile numbers & normalizes valid Indian numbers to +91 E.164', async () => {
  assert.equal(normalizeIndianMobile('+1 9876543210'), null);
  assert.equal(normalizeIndianMobile('+44 7911123456'), null);
  assert.equal(normalizeIndianMobile('5876543210'), null); // starts with 5
  assert.equal(normalizeIndianMobile('987654321'), null); // 9 digits
  assert.equal(normalizeIndianMobile('9876543210')?.e164, '+919876543210');
  assert.equal(normalizeIndianMobile('+91 98765-43210')?.e164, '+919876543210');

  const srv = await startTestServer({ demoMode: true });
  try {
    const badCountry = await postJson(srv.baseUrl, '/api/otp/send-sms', {
      mobile: '+1 9876543210',
    });
    assert.equal(badCountry.status, 400);

    const badPrefix = await postJson(srv.baseUrl, '/api/otp/send-sms', {
      mobile: '4123456789',
    });
    assert.equal(badPrefix.status, 400);

    const goodTenDigit = await postJson(srv.baseUrl, '/api/otp/send-sms', {
      mobile: '98765 43210',
    });
    assert.equal(goodTenDigit.status, 200);
    assert.equal(goodTenDigit.json.normalizedIdentifier, '+919876543210');
  } finally {
    await srv.close();
  }
});

test('Acceptance #5 & #8: Rejects incorrect OTPs and blocks after 5 incorrect attempts', async () => {
  const srv = await startTestServer({ demoMode: true });
  try {
    const sent = await postJson(srv.baseUrl, '/api/otp/send-email', {
      fullName: 'Ananya Deshmukh',
      email: 'attempts@example.com',
    });
    assert.equal(sent.status, 200);
    const sid = String(sent.json.registrationSessionId);

    for (let i = 1; i <= 4; i += 1) {
      const bad = await postJson(srv.baseUrl, '/api/otp/verify', {
        channel: 'email',
        identifier: 'attempts@example.com',
        otp: '000000',
        registrationSessionId: sid,
      });
      assert.equal(bad.status, 400);
      assert.equal(bad.json.code, 'INVALID_OTP');
      assert.equal(bad.json.remainingAttempts, 5 - i);
    }

    // 5th wrong attempt locks the challenge
    const fifth = await postJson(srv.baseUrl, '/api/otp/verify', {
      channel: 'email',
      identifier: 'attempts@example.com',
      otp: '000000',
      registrationSessionId: sid,
    });
    assert.equal(fifth.status, 429);
    assert.equal(fifth.json.code, 'MAX_ATTEMPTS_EXCEEDED');

    // Even the correct demo OTP is now rejected because challenge is locked
    const afterLock = await postJson(srv.baseUrl, '/api/otp/verify', {
      channel: 'email',
      identifier: 'attempts@example.com',
      otp: '123456',
      registrationSessionId: sid,
    });
    assert.equal(afterLock.status, 429);
    assert.equal(afterLock.json.code, 'MAX_ATTEMPTS_EXCEEDED');
  } finally {
    await srv.close();
  }
});

test('Acceptance #6 & #7: Enforces 60-second resend cooldown and 5-minute OTP expiration', async () => {
  let virtualNow = 1_700_000_000_000;
  const srv = await startTestServer({
    demoMode: true,
    now: () => virtualNow,
  });

  try {
    const first = await postJson(srv.baseUrl, '/api/otp/send-email', {
      fullName: 'Ananya Deshmukh',
      email: 'clock@example.com',
    });
    assert.equal(first.status, 200);
    const sid = String(first.json.registrationSessionId);

    // Resend after 30 seconds -> blocked by 60s cooldown
    virtualNow += 30_000;
    const tooEarly = await postJson(srv.baseUrl, '/api/otp/send-email', {
      fullName: 'Ananya Deshmukh',
      email: 'clock@example.com',
      registrationSessionId: sid,
    });
    assert.equal(tooEarly.status, 429);
    assert.equal(tooEarly.json.code, 'RESEND_COOLDOWN');
    assert.equal(tooEarly.json.retryAfterSec, 30);

    // Advance past 5 minutes from first OTP -> expired
    virtualNow += 275_000; // total 305s > 300s
    const expiredVerify = await postJson(srv.baseUrl, '/api/otp/verify', {
      channel: 'email',
      identifier: 'clock@example.com',
      otp: '123456',
      registrationSessionId: sid,
    });
    assert.equal(expiredVerify.status, 400);
    assert.equal(expiredVerify.json.code, 'OTP_EXPIRED');

    // Now resend succeeds because >60s elapsed
    const resent = await postJson(srv.baseUrl, '/api/otp/send-email', {
      fullName: 'Ananya Deshmukh',
      email: 'clock@example.com',
      registrationSessionId: sid,
    });
    assert.equal(resent.status, 200);
  } finally {
    await srv.close();
  }
});

test('Acceptance #9, #10, #11, #12, #13, #14 & #15: Full DEMO_MODE dual-OTP flow, channel locking, token security, replay & duplicate rejection', async () => {
  let virtualNow = 1_700_100_000_000;
  const srv = await startTestServer({
    demoMode: true,
    now: () => virtualNow,
  });

  try {
    // Step 1: Send & verify Email OTP
    const sendEmail = await postJson(srv.baseUrl, '/api/otp/send-email', {
      fullName: 'Ananya Deshmukh',
      email: 'ananya@example.com',
    });
    assert.equal(sendEmail.status, 200);
    const sid = String(sendEmail.json.registrationSessionId);

    const verifyEmail = await postJson(srv.baseUrl, '/api/otp/verify', {
      channel: 'email',
      identifier: 'ananya@example.com',
      otp: '123456',
      registrationSessionId: sid,
    });
    assert.equal(verifyEmail.status, 200);
    const emailToken = String(verifyEmail.json.verificationToken);
    assert.ok(emailToken.split('.').length === 3);

    // Acceptance #9: Verified email cannot be changed without restarting verification
    const changeEmail = await postJson(srv.baseUrl, '/api/otp/send-email', {
      fullName: 'Ananya Deshmukh',
      email: 'other@example.com',
      registrationSessionId: sid,
    });
    assert.equal(changeEmail.status, 409);
    assert.equal(changeEmail.json.code, 'EMAIL_ALREADY_VERIFIED');

    // Acceptance #11: Account creation impossible with only one verified channel (even reusing emailToken in both slots)
    const oneChannel = await postJson(srv.baseUrl, '/api/auth/register', {
      fullName: 'Ananya Deshmukh',
      emailVerificationToken: emailToken,
      mobileVerificationToken: emailToken,
    });
    assert.equal(oneChannel.status, 401);
    assert.equal(oneChannel.json.code, 'TOKEN_CHANNEL_MISMATCH');

    // Step 2: Send & verify Indian Mobile OTP in same session
    const sendSms = await postJson(srv.baseUrl, '/api/otp/send-sms', {
      mobile: '9876543210',
      registrationSessionId: sid,
    });
    assert.equal(sendSms.status, 200);

    const verifySms = await postJson(srv.baseUrl, '/api/otp/verify', {
      channel: 'mobile',
      identifier: '+919876543210',
      otp: '123456',
      registrationSessionId: sid,
    });
    assert.equal(verifySms.status, 200);
    const mobileToken = String(verifySms.json.verificationToken);

    // Acceptance #10: Verified mobile cannot be changed without restarting verification
    const changeMobile = await postJson(srv.baseUrl, '/api/otp/send-sms', {
      mobile: '9876543211',
      registrationSessionId: sid,
    });
    assert.equal(changeMobile.status, 409);
    assert.equal(changeMobile.json.code, 'MOBILE_ALREADY_VERIFIED');

    // Acceptance #13 (mismatched session token): Verify another session's mobile token is rejected
    const otherSms = await postJson(srv.baseUrl, '/api/otp/send-sms', {
      mobile: '9876500001',
    });
    const otherVerify = await postJson(srv.baseUrl, '/api/otp/verify', {
      channel: 'mobile',
      identifier: '+919876500001',
      otp: '123456',
      registrationSessionId: String(otherSms.json.registrationSessionId),
    });
    const mismatched = await postJson(srv.baseUrl, '/api/auth/register', {
      fullName: 'Ananya Deshmukh',
      emailVerificationToken: emailToken,
      mobileVerificationToken: String(otherVerify.json.verificationToken),
    });
    assert.equal(mismatched.status, 403);
    assert.equal(mismatched.json.code, 'SESSION_MISMATCH');

    // Verify server-validated session restoration endpoint reflects both verified channels
    const sessionRes = await fetch(`${srv.baseUrl}/api/auth/session`, {
      headers: { 'X-Registration-Session': sid },
    });
    const sessionJson = (await sessionRes.json()) as {
      session: { bothVerified: boolean; email: { status: string }; mobile: { status: string } };
    };
    assert.equal(sessionJson.session.bothVerified, true);
    assert.equal(sessionJson.session.email.status, 'verified');
    assert.equal(sessionJson.session.mobile.status, 'verified');

    // Acceptance #12: Account creation succeeds when both verified tokens match session
    const created = await postJson(srv.baseUrl, '/api/auth/register', {
      fullName: 'Ananya Deshmukh',
      emailVerificationToken: emailToken,
      mobileVerificationToken: mobileToken,
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.ok, true);
    assert.equal(created.json.message, 'Your Account Has Been Successfully Created!');
    const user = created.json.user as Record<string, unknown>;
    assert.equal(user.email, 'ananya@example.com');
    assert.equal(user.maskedMobile, '+91 ••••••3210');
    assert.equal(user.emailVerified, true);
    assert.equal(user.mobileVerified, true);

    // Acceptance #13 (reused token): Replaying consumed tokens is rejected
    const replay = await postJson(srv.baseUrl, '/api/auth/register', {
      fullName: 'Ananya Deshmukh',
      emailVerificationToken: emailToken,
      mobileVerificationToken: mobileToken,
    });
    assert.equal(replay.status, 409);
    assert.equal(replay.json.code, 'TOKEN_ALREADY_CONSUMED');

    // Acceptance #14: Duplicate email and duplicate mobile registrations are rejected
    const dupEmail = await postJson(srv.baseUrl, '/api/otp/send-email', {
      fullName: 'Another User',
      email: 'ANANYA@example.com',
    });
    assert.equal(dupEmail.status, 409);
    assert.equal(dupEmail.json.code, 'EMAIL_ALREADY_REGISTERED');

    const dupMobile = await postJson(srv.baseUrl, '/api/otp/send-sms', {
      mobile: '+91 98765 43210',
    });
    assert.equal(dupMobile.status, 409);
    assert.equal(dupMobile.json.code, 'MOBILE_ALREADY_REGISTERED');
  } finally {
    await srv.close();
  }
});

test('Acceptance #13 (expired tokens) & #16: Production mode (DEMO_MODE=false) requires real provider credentials, invokes Resend & MSG91, and rejects 123456 shortcut', async () => {
  // Part A: Missing credentials in production mode fails cleanly with 503
  const missingCredsSrv = await startTestServer({
    nodeEnv: 'production',
    demoMode: false,
    resendApiKey: '',
    resendFromEmail: '',
    msg91AuthKey: '',
    msg91TemplateId: '',
  });
  try {
    const email503 = await postJson(missingCredsSrv.baseUrl, '/api/otp/send-email', {
      fullName: 'Ananya Deshmukh',
      email: 'prod@example.com',
    });
    assert.equal(email503.status, 503);
    assert.equal(email503.json.code, 'EMAIL_PROVIDER_NOT_CONFIGURED');

    const sms503 = await postJson(missingCredsSrv.baseUrl, '/api/otp/send-sms', {
      mobile: '+91 9876543210',
    });
    assert.equal(sms503.status, 503);
    assert.equal(sms503.json.code, 'SMS_PROVIDER_NOT_CONFIGURED');
  } finally {
    await missingCredsSrv.close();
  }

  // Part B: With real provider credentials configured, Resend & MSG91 v5 are called, 123456 is rejected, real OTP works, and expired JWT is rejected
  let virtualNow = 1_700_200_000_000;
  let capturedEmailOtp = '';
  let capturedSmsOtp = '';
  const providerCalls: string[] = [];

  const mockFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

    if (url === 'https://api.resend.com/emails') {
      providerCalls.push('resend');
      const match = String(body.text || '').match(/\b(\d{6})\b/);
      capturedEmailOtp = match ? match[1] : '';
      return new Response(JSON.stringify({ id: 're_mock_001' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.startsWith('https://control.msg91.com/api/v5/otp')) {
      providerCalls.push('msg91');
      capturedSmsOtp = String(body.otp || '');
      return new Response(JSON.stringify({ type: 'success', request_id: 'msg91_req_001' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'unexpected url' }), { status: 404 });
  };

  const prodSrv = await startTestServer({
    nodeEnv: 'production',
    demoMode: false,
    resendApiKey: 're_test_live_key',
    resendFromEmail: 'Auth <verify@example.com>',
    msg91AuthKey: 'msg91_live_key',
    msg91TemplateId: 'tpl_live_001',
    fetchImpl: mockFetch,
    now: () => virtualNow,
  });

  try {
    const emailSent = await postJson(prodSrv.baseUrl, '/api/otp/send-email', {
      fullName: 'Rohan Kulkarni',
      email: 'rohan@example.com',
    });
    assert.equal(emailSent.status, 200);
    assert.ok(providerCalls.includes('resend'));
    assert.match(capturedEmailOtp, /^\d{6}$/);

    // Demo shortcut 123456 MUST be rejected when DEMO_MODE=false (unless random happened to be 123456)
    if (capturedEmailOtp !== '123456') {
      const demoShortcutRejected = await postJson(prodSrv.baseUrl, '/api/otp/verify', {
        channel: 'email',
        identifier: 'rohan@example.com',
        otp: '123456',
        registrationSessionId: String(emailSent.json.registrationSessionId),
      });
      assert.equal(demoShortcutRejected.status, 400);
      assert.equal(demoShortcutRejected.json.code, 'INVALID_OTP');
    }

    const emailVerified = await postJson(prodSrv.baseUrl, '/api/otp/verify', {
      channel: 'email',
      identifier: 'rohan@example.com',
      otp: capturedEmailOtp,
      registrationSessionId: String(emailSent.json.registrationSessionId),
    });
    assert.equal(emailVerified.status, 200);

    const smsSent = await postJson(prodSrv.baseUrl, '/api/otp/send-sms', {
      mobile: '9820012345',
      registrationSessionId: String(emailSent.json.registrationSessionId),
    });
    assert.equal(smsSent.status, 200);
    assert.ok(providerCalls.includes('msg91'));
    assert.match(capturedSmsOtp, /^\d{6}$/);

    const smsVerified = await postJson(prodSrv.baseUrl, '/api/otp/verify', {
      channel: 'mobile',
      identifier: '+919820012345',
      otp: capturedSmsOtp,
      registrationSessionId: String(emailSent.json.registrationSessionId),
    });
    assert.equal(smsVerified.status, 200);

    // Advance virtual clock beyond 15-minute verification JWT TTL -> expired tokens rejected
    virtualNow += 16 * 60 * 1000;
    const expiredTokens = await postJson(prodSrv.baseUrl, '/api/auth/register', {
      fullName: 'Rohan Kulkarni',
      emailVerificationToken: String(emailVerified.json.verificationToken),
      mobileVerificationToken: String(smsVerified.json.verificationToken),
    });
    assert.equal(expiredTokens.status, 401);
    assert.equal(expiredTokens.json.code, 'TOKEN_EXPIRED');
  } finally {
    await prodSrv.close();
  }
});
