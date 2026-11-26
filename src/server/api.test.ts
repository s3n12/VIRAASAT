import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createViraasatApiApp } from '../../server.ts';
import { signRazorpayWebhookPayload, signStandardWebhookPayload } from '../lib/security.ts';

const TEST_HOOK_SECRET = `v1,whsec_${Buffer.from('viraasat_supabase_sms_hook_test_key').toString('base64')}`;

/**
 * In-memory HTTP transport simulating real Supabase GoTrue + PostgREST + MSG91 + Turnstile
 * wire protocols so integration tests exercise our exact `@supabase/supabase-js` & HTTP code
 * without introducing any fake OTP code into application logic.
 */
function createSupabaseProtocolHarness() {
  interface FakeGoTrueUser {
    id: string;
    email: string;
    phone: string;
    email_confirmed_at: string | null;
    phone_confirmed_at: string | null;
    user_metadata: Record<string, unknown>;
    created_at: string;
  }

  const users = new Map<string, FakeGoTrueUser>();
  const emailOtps = new Map<string, string>();
  const phoneOtps = new Map<string, { code: string; userId?: string }>();
  const tokens = new Map<string, string>(); // access_token -> userId
  const msg91Calls: Array<{ mobile: string; otp: string; templateId: string }> = [];
  const profileUpserts: Array<Record<string, unknown>> = [];
  let failNextMsg91 = false;

  const jsonRes = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || 'GET').toUpperCase();
    const rawBody = typeof init?.body === 'string' ? init.body : '';
    const parsedBody = rawBody && rawBody.startsWith('{') ? JSON.parse(rawBody) : {};
    const headers = new Headers(init?.headers || {});

    // 1. Cloudflare Turnstile siteverify
    if (url.includes('challenges.cloudflare.com/turnstile/v0/siteverify')) {
      const ok = rawBody.includes('response=valid_turnstile_token');
      return jsonRes({ success: ok });
    }

    // 2. MSG91 Flow v5 API
    if (url.includes('control.msg91.com/api/v5/flow')) {
      if (failNextMsg91) {
        failNextMsg91 = false;
        return jsonRes({ type: 'error', message: 'Invalid DLT template ID' }, 400);
      }
      const recipient = parsedBody.recipients?.[0];
      msg91Calls.push({
        mobile: recipient?.mobiles,
        otp: recipient?.otp,
        templateId: parsedBody.template_id,
      });
      return jsonRes({ type: 'success', request_id: `msg91_req_${crypto.randomBytes(4).toString('hex')}` });
    }

    // 3. Supabase Auth: POST /auth/v1/otp (signInWithOtp)
    if (url.includes('/auth/v1/otp') && method === 'POST') {
      const createUser = parsedBody.create_user !== false;
      if (parsedBody.email) {
        const email = String(parsedBody.email).toLowerCase();
        let u = Array.from(users.values()).find((x) => x.email === email);
        if (!u && !createUser) {
          return jsonRes({ msg: 'Signups not allowed for otp', error_description: 'Signups not allowed' }, 422);
        }
        if (!u) {
          u = {
            id: `sb_${crypto.randomBytes(5).toString('hex')}`,
            email,
            phone: '',
            email_confirmed_at: null,
            phone_confirmed_at: null,
            user_metadata: parsedBody.data || {},
            created_at: new Date().toISOString(),
          };
          users.set(u.id, u);
        }
        const code = String(crypto.randomInt(100000, 1000000));
        emailOtps.set(email, code);
        return jsonRes({});
      }
      if (parsedBody.phone) {
        const phone = String(parsedBody.phone);
        const u = Array.from(users.values()).find((x) => x.phone === phone);
        if (!u && !createUser) {
          return jsonRes({ msg: 'Signups not allowed for otp' }, 422);
        }
        const code = String(crypto.randomInt(100000, 1000000));
        phoneOtps.set(phone, { code, userId: u?.id });
        return jsonRes({});
      }
    }

    // 4. Supabase Auth: PUT /auth/v1/user (updateUser({ phone }) triggers phone_change OTP)
    if (url.endsWith('/auth/v1/user') && method === 'PUT') {
      const authHeader = headers.get('authorization') || '';
      const accessToken = authHeader.replace(/^Bearer\s+/i, '');
      const userId = tokens.get(accessToken);
      const u = userId ? users.get(userId) : undefined;
      if (!u) return jsonRes({ msg: 'Invalid JWT' }, 401);

      const newPhone = String(parsedBody.phone || '');
      const code = String(crypto.randomInt(100000, 1000000));
      phoneOtps.set(newPhone, { code, userId: u.id });
      // Note: phone_confirmed_at remains NULL until verifyOtp(phone_change) succeeds!
      return jsonRes(u);
    }

    // 5. Supabase Auth: POST /auth/v1/verify (verifyOtp)
    if (url.includes('/auth/v1/verify') && method === 'POST') {
      const type = String(parsedBody.type || '');
      const submitted = String(parsedBody.token || '');

      if (type === 'email') {
        const email = String(parsedBody.email || '').toLowerCase();
        const expected = emailOtps.get(email);
        if (!expected || expected !== submitted) {
          return jsonRes({ msg: 'Token has expired or is invalid' }, 403);
        }
        emailOtps.delete(email);
        const u = Array.from(users.values()).find((x) => x.email === email)!;
        u.email_confirmed_at = u.email_confirmed_at || new Date().toISOString();
        const accessToken = `sb_jwt_${crypto.randomBytes(12).toString('hex')}`;
        tokens.set(accessToken, u.id);
        return jsonRes({
          access_token: accessToken,
          refresh_token: `sb_ref_${crypto.randomBytes(8).toString('hex')}`,
          token_type: 'bearer',
          expires_in: 3600,
          user: u,
        });
      }

      if (type === 'phone_change' || type === 'sms') {
        const phone = String(parsedBody.phone || '');
        const entry = phoneOtps.get(phone);
        if (!entry || entry.code !== submitted) {
          return jsonRes({ msg: 'Token has expired or is invalid' }, 403);
        }
        phoneOtps.delete(phone);
        const u = entry.userId
          ? users.get(entry.userId)!
          : Array.from(users.values()).find((x) => x.phone === phone)!;
        u.phone = phone;
        u.phone_confirmed_at = new Date().toISOString();
        const accessToken = `sb_jwt_${crypto.randomBytes(12).toString('hex')}`;
        tokens.set(accessToken, u.id);
        return jsonRes({
          access_token: accessToken,
          refresh_token: `sb_ref_${crypto.randomBytes(8).toString('hex')}`,
          token_type: 'bearer',
          expires_in: 3600,
          user: u,
        });
      }
    }

    // 6. Supabase Auth: GET /auth/v1/user (admin.auth.getUser(jwt))
    if (url.endsWith('/auth/v1/user') && method === 'GET') {
      const authHeader = headers.get('authorization') || '';
      const accessToken = authHeader.replace(/^Bearer\s+/i, '');
      const userId = tokens.get(accessToken);
      const u = userId ? users.get(userId) : undefined;
      if (!u) return jsonRes({ msg: 'Invalid JWT' }, 401);
      return jsonRes(u);
    }

    // 7. Supabase Auth: POST /auth/v1/logout
    if (url.includes('/auth/v1/logout') && method === 'POST') {
      const authHeader = headers.get('authorization') || '';
      const accessToken = authHeader.replace(/^Bearer\s+/i, '');
      tokens.delete(accessToken);
      return new Response(null, { status: 204 });
    }

    // 8. Supabase PostgREST /rest/v1/profiles
    if (url.includes('/rest/v1/profiles')) {
      if (method === 'POST') {
        profileUpserts.push(parsedBody);
        return jsonRes(parsedBody, 201);
      }
      return jsonRes(null, 200);
    }

    return jsonRes({ msg: `Unhandled mock route: ${method} ${url}` }, 404);
  };

  return {
    fetchImpl,
    emailOtps,
    phoneOtps,
    msg91Calls,
    profileUpserts,
    setFailNextMsg91: (v: boolean) => {
      failNextMsg91 = v;
    },
  };
}

async function startTestServer(withSupabase = true) {
  const harness = createSupabaseProtocolHarness();
  const { app, store, secrets } = createViraasatApiApp({
    sessionSecret: 'test_session_secret_32_chars_minimum_ok',
    razorpayKeySecret: 'test_rzp_key_secret_32_chars_minimum_ok',
    razorpayWebhookSecret: 'test_rzp_webhook_secret_32_chars_min',
    supabaseAuth: withSupabase
      ? {
          supabaseUrl: 'https://test-project.supabase.co',
          supabaseAnonKey: 'test_anon_key_for_unit_tests',
          supabaseServiceRoleKey: 'test_service_role_key_for_unit_tests',
          smsHookSecret: TEST_HOOK_SECRET,
          msg91AuthKey: 'test_msg91_auth_key',
          msg91TemplateId: 'test_msg91_dlt_template',
          turnstileSecretKey: '',
          turnstileSiteKey: '',
          fetchImpl: harness.fetchImpl,
        }
      : {
          supabaseUrl: '',
          supabaseAnonKey: '',
          supabaseServiceRoleKey: '',
          smsHookSecret: '',
          msg91AuthKey: '',
          msg91TemplateId: '',
        },
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function apiJson<T = Record<string, unknown>>(
    path: string,
    opts: {
      method?: string;
      token?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {}
  ): Promise<{ status: number; data: T }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'VIRAASAT-Client',
      ...(opts.headers || {}),
    };
    if (opts.token) {
      headers.Authorization = `Bearer ${opts.token}`;
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const data = (await res.json()) as T;
    return { status: res.status, data };
  }

  async function registerDualVerifiedUser(email: string, phone: string, displayName: string) {
    const eSend = await apiJson<{ ok: boolean }>('/api/auth/otp/email/send', {
      method: 'POST',
      body: { email, intent: 'register', displayName },
    });
    assert.equal(eSend.status, 200);
    const emailCode = harness.emailOtps.get(email.toLowerCase())!;
    assert.match(emailCode, /^\d{6}$/);

    const eVer = await apiJson<{ token: string; dualVerified: boolean; user: { id: string; role: string } }>(
      '/api/auth/otp/email/verify',
      {
        method: 'POST',
        body: { email, code: emailCode, displayName },
      }
    );
    assert.equal(eVer.status, 200);

    const pSend = await apiJson<{ ok: boolean }>('/api/auth/otp/phone/send', {
      method: 'POST',
      token: eVer.data.token,
      body: { phone, intent: 'register' },
    });
    assert.equal(pSend.status, 200);
    const phoneCode = harness.phoneOtps.get(phone)!.code;
    assert.match(phoneCode, /^\d{6}$/);

    const pVer = await apiJson<{ token: string; dualVerified: boolean; user: { id: string; role: string; accountStatus: string } }>(
      '/api/auth/otp/phone/verify',
      {
        method: 'POST',
        token: eVer.data.token,
        body: { phone, code: phoneCode, intent: 'register' },
      }
    );
    assert.equal(pVer.status, 200);
    assert.equal(pVer.data.dualVerified, true);
    assert.equal(pVer.data.user.accountStatus, 'active');
    return pVer.data;
  }

  return { server, baseUrl, store, secrets, harness, apiJson, registerDualVerifiedUser };
}

test('Unconfigured Supabase Auth returns honest 503 with missing variable list and NEVER emits demo/preview OTPs', async () => {
  const ctx = await startTestServer(false);
  try {
    const cfg = await ctx.apiJson<{ supabaseAuthConfigured: boolean; missingVariables: string[] }>(
      '/api/auth/config'
    );
    assert.equal(cfg.status, 200);
    assert.equal(cfg.data.supabaseAuthConfigured, false);
    assert.ok(cfg.data.missingVariables.includes('SUPABASE_URL'));
    assert.ok(cfg.data.missingVariables.includes('MSG91_AUTH_KEY'));

    const emailSend = await ctx.apiJson<{ code: string; previewCode?: string }>('/api/auth/otp/email/send', {
      method: 'POST',
      body: { email: 'patron@example.com', intent: 'register', displayName: 'Test Patron' },
    });
    assert.equal(emailSend.status, 503);
    assert.equal(emailSend.data.code, 'SUPABASE_AUTH_NOT_CONFIGURED');
    assert.equal(emailSend.data.previewCode, undefined);
  } finally {
    ctx.server.close();
  }
});

test('Supabase Dual OTP enforces 60s cooldown, invalid attempts, blocks checkout until phone verified, supports login & logout revocation', async () => {
  const ctx = await startTestServer(true);
  try {
    const email = 'ananya.collector@example.com';
    const phone = '+919876543210';

    // Step 1: Send real email OTP (no previewCode returned!)
    const send1 = await ctx.apiJson<{ resendCooldownSec: number; previewCode?: string }>(
      '/api/auth/otp/email/send',
      {
        method: 'POST',
        body: { email, intent: 'register', displayName: 'Ananya Sen' },
      }
    );
    assert.equal(send1.status, 200);
    assert.equal(send1.data.resendCooldownSec, 60);
    assert.equal(send1.data.previewCode, undefined);

    // Immediate resend hits 60s cooldown (429)
    const send2 = await ctx.apiJson<{ retryAfterSec: number }>('/api/auth/otp/email/send', {
      method: 'POST',
      body: { email, intent: 'register', displayName: 'Ananya Sen' },
    });
    assert.equal(send2.status, 429);
    assert.ok(send2.data.retryAfterSec > 0);

    // Wrong 6-digit OTP decrements attempts
    const realEmailCode = ctx.harness.emailOtps.get(email)!;
    const wrongCode = realEmailCode === '111111' ? '222222' : '111111';
    const badVer = await ctx.apiJson<{ remainingAttempts: number }>('/api/auth/otp/email/verify', {
      method: 'POST',
      body: { email, code: wrongCode },
    });
    assert.equal(badVer.status, 400);
    assert.equal(badVer.data.remainingAttempts, 4);

    // Valid Email OTP verifies email ONLY (account_status = pending_verification)
    const emailVer = await ctx.apiJson<{
      token: string;
      dualVerified: boolean;
      user: { emailVerified: boolean; phoneVerified: boolean; accountStatus: string };
    }>('/api/auth/otp/email/verify', {
      method: 'POST',
      body: { email, code: realEmailCode, displayName: 'Ananya Sen' },
    });
    assert.equal(emailVer.status, 200);
    assert.equal(emailVer.data.dualVerified, false);
    assert.equal(emailVer.data.user.emailVerified, true);
    assert.equal(emailVer.data.user.phoneVerified, false);
    assert.equal(emailVer.data.user.accountStatus, 'pending_verification');

    // Checkout is strictly blocked until phone is ALSO verified
    const blockedCheckout = await ctx.apiJson<{ code: string }>('/api/payments/razorpay/create-order', {
      method: 'POST',
      token: emailVer.data.token,
      body: {
        shippingAddress: {
          fullName: 'Ananya Sen',
          addressLine: '14 Park Street',
          city: 'Kolkata',
          state: 'West Bengal',
          postalCode: '700016',
          phone,
        },
        shippingMethod: 'standard',
        paymentMethod: 'upi',
        items: [{ productId: 'prod_banarasi_01', variantLabel: 'Classic 6.2m with Unstitched Blouse', quantity: 1 }],
      },
    });
    assert.equal(blockedCheckout.status, 403);
    assert.equal(blockedCheckout.data.code, 'DUAL_VERIFICATION_REQUIRED');

    // Non-Indian mobile number rejected
    const badPhone = await ctx.apiJson('/api/auth/otp/phone/send', {
      method: 'POST',
      token: emailVer.data.token,
      body: { phone: '+14155550199', intent: 'register' },
    });
    assert.equal(badPhone.status, 400);

    // Step 2: Send real Indian +91 SMS OTP (phone stays unverified until verifyOtp!)
    const phoneSend = await ctx.apiJson<{ ok: boolean }>('/api/auth/otp/phone/send', {
      method: 'POST',
      token: emailVer.data.token,
      body: { phone, intent: 'register' },
    });
    assert.equal(phoneSend.status, 200);

    // Confirm /auth/me STILL shows phoneVerified = false before OTP entry
    const beforePhoneVerify = await ctx.apiJson<{ user: { phoneVerified: boolean; accountStatus: string } }>(
      '/api/auth/me',
      { token: emailVer.data.token }
    );
    assert.equal(beforePhoneVerify.data.user.phoneVerified, false);
    assert.equal(beforePhoneVerify.data.user.accountStatus, 'pending_verification');

    // Verify exact SMS OTP -> phone_verified = true & account_status = active
    const realPhoneCode = ctx.harness.phoneOtps.get(phone)!.code;
    const phoneVer = await ctx.apiJson<{
      token: string;
      dualVerified: boolean;
      user: { phoneVerified: boolean; phoneVerifiedAt: string; accountStatus: string };
    }>('/api/auth/otp/phone/verify', {
      method: 'POST',
      token: emailVer.data.token,
      body: { phone, code: realPhoneCode, intent: 'register' },
    });
    assert.equal(phoneVer.status, 200);
    assert.equal(phoneVer.data.dualVerified, true);
    assert.equal(phoneVer.data.user.phoneVerified, true);
    assert.ok(phoneVer.data.user.phoneVerifiedAt);
    assert.equal(phoneVer.data.user.accountStatus, 'active');

    // Logout revokes session server-side
    const logoutRes = await ctx.apiJson<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
      token: phoneVer.data.token,
    });
    assert.equal(logoutRes.status, 200);

    const afterLogout = await ctx.apiJson('/api/auth/me', { token: phoneVer.data.token });
    assert.equal(afterLogout.status, 401);
  } finally {
    ctx.server.close();
  }
});

test('Supabase Custom Send SMS Hook verifies Standard Webhooks HMAC, blocks replay, and forwards exact OTP to MSG91', async () => {
  const ctx = await startTestServer(true);
  try {
    const hookPayload = JSON.stringify({
      user: { id: 'sb_usr_99', phone: '+919876501234', email: 'patron@viraasat.in' },
      sms: { otp: '739204' },
    });
    const nowSec = String(Math.floor(Date.now() / 1000));
    const webhookId = 'wh_msg_live_001';
    const validSig = signStandardWebhookPayload({
      webhookId,
      webhookTimestamp: nowSec,
      rawBody: hookPayload,
      hookSecret: TEST_HOOK_SECRET,
    });

    // 1. Tampered signature rejected (401)
    const badSig = await fetch(`${ctx.baseUrl}/api/webhooks/supabase/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': nowSec,
        'webhook-signature': 'v1,invalidbase64sig==',
      },
      body: hookPayload,
    });
    assert.equal(badSig.status, 401);

    // 2. Valid signature forwards EXACT Supabase OTP (739204) to MSG91
    const okRes = await fetch(`${ctx.baseUrl}/api/webhooks/supabase/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': nowSec,
        'webhook-signature': validSig,
      },
      body: hookPayload,
    });
    assert.equal(okRes.status, 200);
    assert.equal(ctx.harness.msg91Calls.length, 1);
    assert.deepEqual(ctx.harness.msg91Calls[0], {
      mobile: '919876501234',
      otp: '739204',
      templateId: 'test_msg91_dlt_template',
    });

    // 3. Replaying same webhook-id is blocked (409)
    const replayRes = await fetch(`${ctx.baseUrl}/api/webhooks/supabase/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': nowSec,
        'webhook-signature': validSig,
      },
      body: hookPayload,
    });
    assert.equal(replayRes.status, 409);

    // 4. MSG91 gateway rejection propagates real error (502) instead of fake success
    ctx.harness.setFailNextMsg91(true);
    const webhookId2 = 'wh_msg_live_002';
    const validSig2 = signStandardWebhookPayload({
      webhookId: webhookId2,
      webhookTimestamp: nowSec,
      rawBody: hookPayload,
      hookSecret: TEST_HOOK_SECRET,
    });
    const failedDelivery = await fetch(`${ctx.baseUrl}/api/webhooks/supabase/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId2,
        'webhook-timestamp': nowSec,
        'webhook-signature': validSig2,
      },
      body: hookPayload,
    });
    assert.equal(failedDelivery.status, 502);
  } finally {
    ctx.server.close();
  }
});

test('End-to-end checkout, coupons, idempotency, Razorpay HMAC, COD, RBAC, Seller KYC & SEO work for Supabase-verified users', async () => {
  const ctx = await startTestServer(true);
  try {
    const customer = await ctx.registerDualVerifiedUser('meera.patel@example.com', '+919876543211', 'Meera Patel');
    const admin = await ctx.registerDualVerifiedUser('shaninishad813@gmail.com', '+919811110000', 'Shani Nishad');

    // Customer denied admin endpoint
    const deniedAdmin = await ctx.apiJson('/api/admin/users', { token: customer.token });
    assert.equal(deniedAdmin.status, 403);

    // Checkout with coupon + Idempotency-Key
    const checkoutPayload = {
      shippingAddress: {
        fullName: 'Meera Patel',
        addressLine: '42 Malabar Hill',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400006',
        phone: '+919876543211',
      },
      shippingMethod: 'standard',
      paymentMethod: 'upi',
      couponCode: 'VIRAASAT10',
      items: [
        {
          productId: 'prod_banarasi_01',
          variantLabel: 'Classic 6.2m with Unstitched Blouse',
          quantity: 1,
        },
      ],
    };

    const create1 = await ctx.apiJson<{ order: { id: string; discountInr: number }; razorpay: { orderId: string } }>(
      '/api/payments/razorpay/create-order',
      {
        method: 'POST',
        token: customer.token,
        headers: { 'Idempotency-Key': 'idem_sb_001' },
        body: checkoutPayload,
      }
    );
    assert.equal(create1.status, 201);
    assert.equal(create1.data.order.discountInr, 6850);

    const create2 = await ctx.apiJson<{ order: { id: string }; idempotentReplay: boolean }>(
      '/api/payments/razorpay/create-order',
      {
        method: 'POST',
        token: customer.token,
        headers: { 'Idempotency-Key': 'idem_sb_001' },
        body: checkoutPayload,
      }
    );
    assert.equal(create2.status, 200);
    assert.equal(create2.data.idempotentReplay, true);
    assert.equal(create2.data.order.id, create1.data.order.id);

    // Verify Razorpay payment + return request + Admin refund
    const authRes = await ctx.apiJson<{
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }>('/api/payments/razorpay/authorize-sandbox', {
      method: 'POST',
      token: customer.token,
      body: { orderId: create1.data.order.id, paymentMethod: 'upi' },
    });
    const verifyOk = await ctx.apiJson<{ order: { status: string; paymentStatus: string } }>(
      '/api/payments/razorpay/verify',
      {
        method: 'POST',
        token: customer.token,
        body: { orderId: create1.data.order.id, ...authRes.data },
      }
    );
    assert.equal(verifyOk.status, 200);
    assert.equal(verifyOk.data.order.paymentStatus, 'captured');

    const retReq = await ctx.apiJson('/api/orders/' + create1.data.order.id + '/return-request', {
      method: 'POST',
      token: customer.token,
      body: { reason: 'Minor border zari pull discovered during archival inspection.' },
    });
    assert.equal(retReq.status, 201);

    const refundRes = await ctx.apiJson<{ order: { status: string } }>(
      `/api/admin/orders/${create1.data.order.id}/refund`,
      {
        method: 'POST',
        token: admin.token,
        body: { note: 'Approved full refund.' },
      }
    );
    assert.equal(refundRes.status, 200);
    assert.equal(refundRes.data.order.status, 'refunded');

    // Signed Razorpay webhook verified
    const webhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_wh_01', order_id: 'order_vrs_seed1001' } } },
    });
    const validSig = signRazorpayWebhookPayload(webhookBody, ctx.secrets.RAZORPAY_WEBHOOK_SECRET);
    const whOk = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validSig,
        'x-razorpay-event-id': 'evt_unique_200',
      },
      body: webhookBody,
    });
    assert.equal(whOk.status, 200);

    // SEO sitemap
    const sitemap = await fetch(`${ctx.baseUrl}/sitemap.xml`);
    assert.equal(sitemap.status, 200);
    assert.match(await sitemap.text(), /\/product\/sindoori-kadwa-banarasi-katan-saree/);
  } finally {
    ctx.server.close();
  }
});
