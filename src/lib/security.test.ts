import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  SlidingWindowRateLimiter,
  checkResendCooldown,
  createOtpChallenge,
  normalizeIdentifier,
  normalizeIndianPhone,
  signRazorpayPayment,
  signRazorpayWebhookPayload,
  signSessionToken,
  signStandardWebhookPayload,
  verifyOtpChallenge,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  verifySessionToken,
  verifyStandardWebhookSignature,
} from './security';

const TEST_SECRET = 'unit_test_hmac_secret_value_for_tests_only';

test('normalizeIndianPhone validates Indian +91 mobile numbers strictly', () => {
  assert.deepEqual(normalizeIndianPhone('+91 98765 43210'), {
    e164: '+919876543210',
    msg91Mobile: '919876543210',
    national10: '9876543210',
  });
  assert.deepEqual(normalizeIndianPhone('9876543210'), {
    e164: '+919876543210',
    msg91Mobile: '919876543210',
    national10: '9876543210',
  });
  assert.equal(normalizeIndianPhone('+14155550199'), null);
  assert.equal(normalizeIndianPhone('+911234567890'), null); // must start with 6-9
  assert.equal(normalizeIndianPhone('98765'), null);
});

test('Standard Webhooks HMAC-SHA256 verification validates Supabase Send SMS Hook and blocks tampering/replay', () => {
  const hookSecret = `v1,whsec_${Buffer.from('super_secret_supabase_sms_hook_key_32b').toString('base64')}`;
  const rawBody = JSON.stringify({
    user: { id: 'uid_1', phone: '+919876543210' },
    sms: { otp: '654321' },
  });
  const nowSec = 1_750_000_000;
  const webhookId = 'msg_test_001';
  const webhookTimestamp = String(nowSec);

  const validSig = signStandardWebhookPayload({
    webhookId,
    webhookTimestamp,
    rawBody,
    hookSecret,
  });

  assert.deepEqual(
    verifyStandardWebhookSignature({
      webhookId,
      webhookTimestamp,
      webhookSignatureHeader: validSig,
      rawBody,
      hookSecret,
      nowSec: nowSec + 10,
    }),
    { ok: true }
  );

  // Tampered body rejected
  const tampered = verifyStandardWebhookSignature({
    webhookId,
    webhookTimestamp,
    webhookSignatureHeader: validSig,
    rawBody: rawBody.replace('654321', '999999'),
    hookSecret,
    nowSec: nowSec + 10,
  });
  assert.equal(tampered.ok, false);

  // Expired timestamp outside 5-minute window rejected
  const stale = verifyStandardWebhookSignature({
    webhookId,
    webhookTimestamp,
    webhookSignatureHeader: validSig,
    rawBody,
    hookSecret,
    nowSec: nowSec + 400,
  });
  assert.equal(stale.ok, false);
});

test('OTP challenge enforces 5-min expiry, 60s resend cooldown, attempt limits, and replay protection', () => {
  const now = 1_700_000_000_000;
  assert.equal(OTP_TTL_MS, 5 * 60 * 1000);
  assert.equal(OTP_RESEND_COOLDOWN_MS, 60 * 1000);

  const { record, code } = createOtpChallenge('9876543210', 'phone', TEST_SECRET, now);
  assert.equal(normalizeIdentifier('9876543210', 'phone'), '+919876543210');

  const cooldownBlocked = checkResendCooldown(record, now + 30_000);
  assert.equal(cooldownBlocked.allowed, false);
  assert.ok(cooldownBlocked.retryAfterSec >= 29);

  const cooldownPassed = checkResendCooldown(record, now + OTP_RESEND_COOLDOWN_MS + 100);
  assert.equal(cooldownPassed.allowed, true);

  for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
    const attempt = verifyOtpChallenge(record, '000000', TEST_SECRET, now + 1_000 + i);
    assert.equal(attempt.ok, false);
    if (!attempt.ok) {
      assert.equal(attempt.code, i === OTP_MAX_ATTEMPTS - 1 ? 'MAX_ATTEMPTS' : 'INVALID_CODE');
    }
  }

  const afterLock = verifyOtpChallenge(record, code, TEST_SECRET, now + 10_000);
  assert.equal(afterLock.ok, false);
  if (!afterLock.ok) assert.equal(afterLock.code, 'MAX_ATTEMPTS');

  const fresh = createOtpChallenge('a@b.com', 'email', TEST_SECRET, now);
  const expired = verifyOtpChallenge(fresh.record, fresh.code, TEST_SECRET, now + OTP_TTL_MS + 1);
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.code, 'EXPIRED');
});

test('SlidingWindowRateLimiter throttles bursts and resets after window', () => {
  const limiter = new SlidingWindowRateLimiter(3, 60_000);
  const start = 1_700_000_000_000;

  assert.equal(limiter.consume('ip:1', start).allowed, true);
  assert.equal(limiter.consume('ip:1', start + 1_000).allowed, true);
  assert.equal(limiter.consume('ip:1', start + 2_000).allowed, true);

  const blocked = limiter.consume('ip:1', start + 3_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 57);

  const reset = limiter.consume('ip:1', start + 61_000);
  assert.equal(reset.allowed, true);
});

test('Signed session tokens validate signature and expiry', () => {
  const now = 1_700_000_000_000;
  const token = signSessionToken(
    { sub: 'usr_1', email: 'patron@viraasat.in', role: 'customer' },
    TEST_SECRET,
    now
  );

  const valid = verifySessionToken(token, TEST_SECRET, now + 1_000);
  assert.equal(valid?.sub, 'usr_1');
  assert.equal(valid?.role, 'customer');

  assert.equal(verifySessionToken(`${token}tampered`, TEST_SECRET, now + 1_000), null);
  assert.equal(verifySessionToken(token, 'wrong_secret', now + 1_000), null);
  assert.equal(verifySessionToken(token, TEST_SECRET, now + 13 * 60 * 60 * 1000), null);
});

test('Razorpay payment and webhook HMAC-SHA256 verification rejects tampered payloads', () => {
  const orderId = 'order_Viraasat001';
  const paymentId = 'pay_Viraasat999';
  const sig = signRazorpayPayment(orderId, paymentId, TEST_SECRET);

  assert.equal(verifyRazorpayPaymentSignature(orderId, paymentId, sig, TEST_SECRET), true);
  assert.equal(verifyRazorpayPaymentSignature(orderId, 'pay_Tampered', sig, TEST_SECRET), false);
  assert.equal(verifyRazorpayPaymentSignature(orderId, paymentId, sig, 'wrong_secret'), false);

  const webhookBody = JSON.stringify({ event: 'payment.captured', payload: { order_id: orderId } });
  const webhookSig = signRazorpayWebhookPayload(webhookBody, TEST_SECRET);

  assert.equal(verifyRazorpayWebhookSignature(webhookBody, webhookSig, TEST_SECRET), true);
  assert.equal(
    verifyRazorpayWebhookSignature(webhookBody.replace('captured', 'refunded'), webhookSig, TEST_SECRET),
    false
  );
});
