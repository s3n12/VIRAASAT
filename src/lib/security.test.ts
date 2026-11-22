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
  signRazorpayPayment,
  signRazorpayWebhookPayload,
  signSessionToken,
  verifyOtpChallenge,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  verifySessionToken,
} from './security';

const TEST_SECRET = 'unit_test_hmac_secret_value_for_tests_only';

test('OTP challenge verifies valid code once and blocks replay', () => {
  const now = 1_700_000_000_000;
  const { record, code } = createOtpChallenge('Patron@Viraasat.IN ', 'email', TEST_SECRET, now);

  assert.equal(record.identifier, 'patron@viraasat.in');
  assert.equal(code.length, 6);
  assert.notEqual(record.codeHash, code);

  const first = verifyOtpChallenge(record, code, TEST_SECRET, now + 5_000);
  assert.deepEqual(first, { ok: true });

  const replay = verifyOtpChallenge(record, code, TEST_SECRET, now + 6_000);
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.code, 'CONSUMED');
});

test('OTP challenge enforces expiry, attempt limits, and resend cooldown', () => {
  const now = 1_700_000_000_000;
  const { record, code } = createOtpChallenge('9876543210', 'phone', TEST_SECRET, now);
  assert.equal(normalizeIdentifier('9876543210', 'phone'), '+919876543210');

  const cooldownBlocked = checkResendCooldown(record, now + 10_000);
  assert.equal(cooldownBlocked.allowed, false);
  assert.ok(cooldownBlocked.retryAfterSec > 0);

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
