import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createViraasatApiApp } from '../../server.ts';
import { signRazorpayWebhookPayload } from '../lib/security.ts';

async function startTestServer() {
  const { app, store, secrets } = createViraasatApiApp({
    sessionSecret: 'test_session_secret_32_chars_minimum_ok',
    otpHmacSecret: 'test_otp_hmac_secret_32_chars_minimum_ok',
    razorpayKeySecret: 'test_rzp_key_secret_32_chars_minimum_ok',
    razorpayWebhookSecret: 'test_rzp_webhook_secret_32_chars_min',
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

  async function verifyDualUser(email: string, phone: string, displayName?: string) {
    const emailReq = await apiJson<{ previewCode: string }>('/api/auth/otp/request', {
      method: 'POST',
      body: { channel: 'email', identifier: email },
    });
    assert.equal(emailReq.status, 200);
    assert.match(emailReq.data.previewCode, /^\d{6}$/);

    const emailVer = await apiJson<{ token: string; dualVerified: boolean; user: { id: string; role: string } }>(
      '/api/auth/otp/verify',
      {
        method: 'POST',
        body: {
          channel: 'email',
          identifier: email,
          code: emailReq.data.previewCode,
          displayName,
        },
      }
    );
    assert.equal(emailVer.status, 200);

    const phoneReq = await apiJson<{ previewCode: string }>('/api/auth/otp/request', {
      method: 'POST',
      body: { channel: 'phone', identifier: phone },
    });
    assert.equal(phoneReq.status, 200);

    const phoneVer = await apiJson<{ token: string; dualVerified: boolean; user: { id: string; role: string } }>(
      '/api/auth/otp/verify',
      {
        method: 'POST',
        token: emailVer.data.token,
        body: {
          channel: 'phone',
          identifier: phone,
          code: phoneReq.data.previewCode,
        },
      }
    );
    assert.equal(phoneVer.status, 200);
    assert.equal(phoneVer.data.dualVerified, true);
    return phoneVer.data;
  }

  return { server, baseUrl, store, secrets, apiJson, verifyDualUser };
}

test('Dual OTP enforces cooldown, invalid attempt tracking, and blocks checkout until both email & phone are verified', async () => {
  const ctx = await startTestServer();
  try {
    const email = 'new.collector@example.com';

    // Request email OTP
    const req1 = await ctx.apiJson<{ previewCode: string; resendCooldownSec: number }>('/api/auth/otp/request', {
      method: 'POST',
      body: { channel: 'email', identifier: email },
    });
    assert.equal(req1.status, 200);
    assert.ok(req1.data.resendCooldownSec >= 30);

    // Immediate resend hits cooldown (429)
    const req2 = await ctx.apiJson<{ retryAfterSec: number }>('/api/auth/otp/request', {
      method: 'POST',
      body: { channel: 'email', identifier: email },
    });
    assert.equal(req2.status, 429);
    assert.ok(req2.data.retryAfterSec > 0);

    // Wrong OTP decrements remaining attempts
    const badCode = req1.data.previewCode === '000000' ? '111111' : '000000';
    const badVer = await ctx.apiJson<{ code: string; remainingAttempts: number }>('/api/auth/otp/verify', {
      method: 'POST',
      body: { channel: 'email', identifier: email, code: badCode },
    });
    assert.equal(badVer.status, 400);
    assert.equal(badVer.data.code, 'INVALID_CODE');
    assert.equal(badVer.data.remainingAttempts, 4);

    // Valid email OTP creates single-verified session
    const emailOk = await ctx.apiJson<{ token: string; dualVerified: boolean }>('/api/auth/otp/verify', {
      method: 'POST',
      body: {
        channel: 'email',
        identifier: email,
        code: req1.data.previewCode,
        displayName: 'Ananya Sen',
      },
    });
    assert.equal(emailOk.status, 200);
    assert.equal(emailOk.data.dualVerified, false);

    // Attempt checkout while phone is still unverified -> 403 DUAL_VERIFICATION_REQUIRED
    const blockedCheckout = await ctx.apiJson<{ code: string }>('/api/payments/razorpay/create-order', {
      method: 'POST',
      token: emailOk.data.token,
      body: {
        shippingAddress: {
          fullName: 'Ananya Sen',
          addressLine: '14 Park Street',
          city: 'Kolkata',
          state: 'West Bengal',
          postalCode: '700016',
          phone: '+919876540001',
        },
        shippingMethod: 'standard',
        paymentMethod: 'upi',
        items: [{ productId: 'prod_banarasi_01', variantLabel: 'Royal Sindoor Red · Standard 5.5m', quantity: 1 }],
      },
    });
    assert.equal(blockedCheckout.status, 403);
    assert.equal(blockedCheckout.data.code, 'DUAL_VERIFICATION_REQUIRED');
  } finally {
    ctx.server.close();
  }
});

test('End-to-end checkout supports coupon discounts, Idempotency-Key deduplication, HMAC-SHA256 verification, COD, returns & admin refunds', async () => {
  const ctx = await startTestServer();
  try {
    const customer = await ctx.verifyDualUser('meera.patel@example.com', '+919876543210');
    const admin = await ctx.verifyDualUser('shaninishad813@gmail.com', '+919811110000');

    // Validate seeded coupon VIRAASAT10
    const couponCheck = await ctx.apiJson<{ ok: boolean; discountInr: number }>('/api/coupons/validate', {
      method: 'POST',
      body: { code: 'VIRAASAT10', subtotalInr: 48500 },
    });
    assert.equal(couponCheck.status, 200);
    assert.equal(couponCheck.data.discountInr, 4850);

    // Create Razorpay order with Idempotency-Key
    const checkoutPayload = {
      shippingAddress: {
        fullName: 'Meera Patel',
        addressLine: '42 Malabar Hill',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400006',
        phone: '+919876543210',
      },
      shippingMethod: 'standard',
      paymentMethod: 'upi',
      couponCode: 'VIRAASAT10',
      items: [
        {
          productId: 'prod_banarasi_01',
          variantLabel: 'Royal Sindoor Red · Standard 5.5m',
          quantity: 1,
        },
      ],
    };

    const create1 = await ctx.apiJson<{ order: { id: string; discountInr: number; totalInr: number }; razorpay: { orderId: string } }>(
      '/api/payments/razorpay/create-order',
      {
        method: 'POST',
        token: customer.token,
        headers: { 'Idempotency-Key': 'idem_order_test_001' },
        body: checkoutPayload,
      }
    );
    assert.equal(create1.status, 201);
    assert.equal(create1.data.order.discountInr, 6850);

    // Replaying same Idempotency-Key returns existing order without creating a duplicate
    const create2 = await ctx.apiJson<{ order: { id: string }; idempotentReplay: boolean }>(
      '/api/payments/razorpay/create-order',
      {
        method: 'POST',
        token: customer.token,
        headers: { 'Idempotency-Key': 'idem_order_test_001' },
        body: checkoutPayload,
      }
    );
    assert.equal(create2.status, 200);
    assert.equal(create2.data.idempotentReplay, true);
    assert.equal(create2.data.order.id, create1.data.order.id);

    // Tampered Razorpay signature is rejected
    const badVerify = await ctx.apiJson('/api/payments/razorpay/verify', {
      method: 'POST',
      token: customer.token,
      body: {
        orderId: create1.data.order.id,
        razorpayOrderId: create1.data.razorpay.orderId,
        razorpayPaymentId: 'pay_tampered_123',
        razorpaySignature: '0'.repeat(64),
      },
    });
    assert.equal(badVerify.status, 400);

    // Legitimate sandbox authorization + HMAC verification captures payment & deducts stock
    const initialStock = ctx.store.products.get('prod_banarasi_01')!.stock;
    const authRes = await ctx.apiJson<{
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }>('/api/payments/razorpay/authorize-sandbox', {
      method: 'POST',
      token: customer.token,
      body: { orderId: create1.data.order.id, paymentMethod: 'upi' },
    });
    assert.equal(authRes.status, 200);

    const verifyOk = await ctx.apiJson<{ ok: boolean; order: { status: string; paymentStatus: string } }>(
      '/api/payments/razorpay/verify',
      {
        method: 'POST',
        token: customer.token,
        body: {
          orderId: create1.data.order.id,
          ...authRes.data,
        },
      }
    );
    assert.equal(verifyOk.status, 200);
    assert.equal(verifyOk.data.order.status, 'confirmed');
    assert.equal(verifyOk.data.order.paymentStatus, 'captured');
    assert.equal(ctx.store.products.get('prod_banarasi_01')!.stock, initialStock - 1);

    // Customer submits return request -> Admin refunds order
    const retReq = await ctx.apiJson<{ order: { returnRequest?: { status: string } } }>(
      `/api/orders/${create1.data.order.id}/return-request`,
      {
        method: 'POST',
        token: customer.token,
        body: { reason: 'Received with slight weave pull along border edge.' },
      }
    );
    assert.equal(retReq.status, 201);
    assert.equal(retReq.data.order.returnRequest?.status, 'requested');

    const refundRes = await ctx.apiJson<{ order: { status: string; paymentStatus: string } }>(
      `/api/admin/orders/${create1.data.order.id}/refund`,
      {
        method: 'POST',
        token: admin.token,
        body: { note: 'Approved full refund upon atelier inspection.' },
      }
    );
    assert.equal(refundRes.status, 200);
    assert.equal(refundRes.data.order.status, 'refunded');
    assert.equal(refundRes.data.order.paymentStatus, 'refunded');

    // COD order works under cap (Jaipur Blue Pottery ₹14,900)
    const codRes = await ctx.apiJson<{ codConfirmed: boolean; order: { status: string; paymentMethod: string } }>(
      '/api/payments/razorpay/create-order',
      {
        method: 'POST',
        token: customer.token,
        body: {
          shippingAddress: checkoutPayload.shippingAddress,
          shippingMethod: 'standard',
          paymentMethod: 'cod',
          items: [{ productId: 'prod_pottery_07', variantLabel: '28cm Console Urn', quantity: 1 }],
        },
      }
    );
    assert.equal(codRes.status, 201);
    assert.equal(codRes.data.codConfirmed, true);
    assert.equal(codRes.data.order.status, 'confirmed');
    assert.equal(codRes.data.order.paymentMethod, 'cod');
  } finally {
    ctx.server.close();
  }
});

test('RBAC, Seller KYC onboarding approval, Razorpay raw-body webhooks, and SEO endpoints work strictly', async () => {
  const ctx = await startTestServer();
  try {
    const customer = await ctx.verifyDualUser('meera.patel@example.com', '+919876543210');
    const admin = await ctx.verifyDualUser('shaninishad813@gmail.com', '+919811110000');

    // Customer denied admin endpoint
    const deniedAdmin = await ctx.apiJson('/api/admin/users', { token: customer.token });
    assert.equal(deniedAdmin.status, 403);

    // Public Seller KYC application -> Admin approves -> New verified seller created
    const applyRes = await ctx.apiJson<{ ok: boolean; application: { id: string; status: string } }>(
      '/api/sellers/apply',
      {
        method: 'POST',
        body: {
          fullName: 'Devika Chhipa',
          email: 'devika@bagruprint.in',
          phone: '+919829004455',
          businessName: 'Bagru Natural Dyers',
          businessAddress: 'Chhipa Mohalla, Bagru, Jaipur, Rajasthan 303007',
          craftRegion: 'Jaipur',
          primaryCategory: 'Fashion & Ethnic Wear',
          gstin: '08AABCB5678L1Z2',
          panNumber: 'AABCB5678L',
          bankAccountNumber: '334455667788',
          ifscCode: 'SBIN0004321',
          identityDocType: 'GI Craft Certificate',
          identityDocRef: 'GI-BAGRU-2024-88',
          portfolioSummary: 'Fourth-generation Bagru Dabu mud-resist handblock textile workshop using pomegranate rind and indigo vats.',
        },
      }
    );
    assert.equal(applyRes.status, 201);
    assert.equal(applyRes.data.application.status, 'pending');

    const approveRes = await ctx.apiJson<{ application: { status: string } }>(
      `/api/admin/seller-applications/${applyRes.data.application.id}`,
      {
        method: 'PATCH',
        token: admin.token,
        body: { status: 'approved', reviewNote: 'Verified GI credentials.' },
      }
    );
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.data.application.status, 'approved');

    // Signed Razorpay webhook accepted; tampered webhook rejected
    const webhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_wh_01', order_id: 'order_vrs_seed1001' } } },
    });
    const validSig = signRazorpayWebhookPayload(webhookBody, ctx.secrets.RAZORPAY_WEBHOOK_SECRET);

    const whBad = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'deadbeef'.repeat(8),
      },
      body: webhookBody,
    });
    assert.equal(whBad.status, 400);

    const whOk = await fetch(`${ctx.baseUrl}/api/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': validSig,
        'x-razorpay-event-id': 'evt_unique_100',
      },
      body: webhookBody,
    });
    assert.equal(whOk.status, 200);

    // Newsletter & Contact forms
    const nl = await ctx.apiJson<{ ok: boolean }>('/api/newsletter', {
      method: 'POST',
      body: { email: 'patron.heritage@example.com' },
    });
    assert.equal(nl.status, 201);

    const contact = await ctx.apiJson<{ ok: boolean }>('/api/contact', {
      method: 'POST',
      body: {
        name: 'Kabir Malhotra',
        email: 'kabir@example.com',
        subject: 'Bridal Trousseau Commission',
        message: 'Looking to commission a bespoke Banarasi Katan drape for November.',
      },
    });
    assert.equal(contact.status, 201);

    // SEO robots.txt & sitemap.xml
    const robots = await fetch(`${ctx.baseUrl}/robots.txt`);
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /Sitemap:/);

    const sitemap = await fetch(`${ctx.baseUrl}/sitemap.xml`);
    assert.equal(sitemap.status, 200);
    const xml = await sitemap.text();
    assert.match(xml, /<urlset/);
    assert.match(xml, /\/product\/sindoori-kadwa-banarasi-katan-saree/);
  } finally {
    ctx.server.close();
  }
});
