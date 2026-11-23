import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import {
  calculateCartTotals,
  calculateCouponDiscount,
  canTransitionOrderStatus,
  computeRatingSummary,
  filterAndSortProducts,
  getEffectiveProductPrice,
} from './src/lib/commerce.ts';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  SlidingWindowRateLimiter,
  normalizeIdentifier,
  normalizeIndianPhone,
  sanitizeExternalUrl,
  signRazorpayPayment,
  signRazorpayWebhookPayload,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  verifySessionToken,
  verifyStandardWebhookSignature,
} from './src/lib/security.ts';
import {
  createSupabaseAdminClient,
  createSupabaseAnonClient,
  getAuthProviderStatus,
  mapSupabaseAuthError,
  readSupabaseAuthEnv,
  requestSupabasePhoneChangeOtp,
  sendOtpViaMsg91,
  syncProfileFromSupabaseUser,
  verifyTurnstileToken,
  type SupabaseAuthEnvConfig,
} from './src/server/supabaseAuth.ts';
import { IMAGES, createSeedStore, type MarketplaceStore } from './src/server/store.ts';
import type {
  AdminAnalytics,
  Coupon,
  Order,
  OrderStatus,
  Product,
  ProductCategory,
  SellerAnalytics,
  SellerApplication,
  ShippingAddress,
  UserProfile,
  UserRole,
} from './src/types/marketplace.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = 3000;

const PRODUCT_CATEGORIES = [
  'Fashion & Ethnic Wear',
  'Fine Jewellery',
  'Kashmiri Shawls',
  'Handicrafts & Brass',
  'Home Decor & Pottery',
  'Natural Wellness & Organic',
] as const;

interface AuthedRequest extends Request {
  user?: UserProfile;
  sessionToken?: string;
  rawBody?: string;
}

export interface ServerOptions {
  store?: MarketplaceStore;
  sessionSecret?: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;
  supabaseAuth?: Partial<SupabaseAuthEnvConfig>;
}

export function createViraasatApiApp(options: ServerOptions = {}) {
  const SESSION_SECRET =
    options.sessionSecret ||
    process.env.SESSION_SECRET ||
    crypto.randomBytes(32).toString('hex');
  const RAZORPAY_KEY_ID = options.razorpayKeyId ?? (process.env.RAZORPAY_KEY_ID || '');
  const RAZORPAY_KEY_SECRET =
    options.razorpayKeySecret ||
    process.env.RAZORPAY_KEY_SECRET ||
    crypto.randomBytes(32).toString('hex');
  const RAZORPAY_WEBHOOK_SECRET =
    options.razorpayWebhookSecret ||
    process.env.RAZORPAY_WEBHOOK_SECRET ||
    crypto.randomBytes(32).toString('hex');

  const HAS_LIVE_RAZORPAY = Boolean(
    (options.razorpayKeyId || process.env.RAZORPAY_KEY_ID) &&
      (options.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET)
  );

  const supabaseCfg = readSupabaseAuthEnv(options.supabaseAuth);
  const authStatus = getAuthProviderStatus(supabaseCfg);

  const store = options.store || createSeedStore();
  const otpRequestLimiter = new SlidingWindowRateLimiter(10, 5 * 60 * 1000);
  const otpVerifyLimiter = new SlidingWindowRateLimiter(15, 5 * 60 * 1000);
  const apiMutationLimiter = new SlidingWindowRateLimiter(100, 60 * 1000);
  const otpResendCooldowns = new Map<string, number>();
  const otpFailedAttempts = new Map<string, { count: number; resetAtMs: number }>();
  const processedSmsHookIds = new Set<string>();

  function getClientIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) {
      return fwd.split(',')[0].trim();
    }
    return req.socket.remoteAddress || '127.0.0.1';
  }

  function addAuditLog(params: {
    actorId: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId?: string;
    outcome: 'success' | 'denied' | 'failure';
    ipAddress: string;
    detail: string;
  }) {
    store.auditLogs.unshift({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`,
      ...params,
      createdAt: new Date().toISOString(),
    });
    if (store.auditLogs.length > 300) {
      store.auditLogs.length = 300;
    }
  }

  function addNotification(
    userId: string,
    title: string,
    body: string,
    category: 'order' | 'security' | 'inventory' | 'atelier'
  ) {
    store.notifications.unshift({
      id: `ntf_${crypto.randomBytes(6).toString('hex')}`,
      userId,
      title,
      body,
      category,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }

  function findUserByEmail(email: string): UserProfile | undefined {
    const normalized = email.trim().toLowerCase();
    for (const user of store.users.values()) {
      if (user.email.toLowerCase() === normalized) return user;
    }
    return undefined;
  }

  function findUserByPhone(phone: string): UserProfile | undefined {
    const normalized = normalizeIdentifier(phone, 'phone');
    for (const user of store.users.values()) {
      if (user.phone && normalizeIdentifier(user.phone, 'phone') === normalized) return user;
    }
    return undefined;
  }

  async function resolveAuthenticatedUser(token: string): Promise<UserProfile | null> {
    if (!token || store.revokedTokens.has(token)) {
      return null;
    }

    // Primary authentication source: Supabase Auth JWT validated server-side
    if (authStatus.supabaseAuthConfigured) {
      try {
        const sbClient = supabaseCfg.supabaseServiceRoleKey
          ? createSupabaseAdminClient(supabaseCfg)
          : createSupabaseAnonClient(supabaseCfg);
        const { data, error } = await sbClient.auth.getUser(token);
        if (!error && data?.user) {
          const existing =
            store.users.get(data.user.id) ||
            (data.user.email ? findUserByEmail(data.user.email) : undefined);
          const synced = await syncProfileFromSupabaseUser({
            sbUser: data.user,
            cfg: supabaseCfg,
            existingLocal: existing,
          });
          store.users.set(synced.id, synced);
          return synced;
        }
      } catch {
        return null;
      }
      return null;
    }

    // Fallback check only for pre-signed tokens in isolated unit/integration tests
    const payload = verifySessionToken(token, SESSION_SECRET);
    if (!payload) return null;
    return store.users.get(payload.sub) || null;
  }

  async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. Please sign in with verified OTP.' });
      return;
    }
    const token = header.slice(7).trim();
    if (store.revokedTokens.has(token)) {
      res.status(401).json({ error: 'Your session has been signed out. Please sign in again.' });
      return;
    }

    const user = await resolveAuthenticatedUser(token);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired authentication session. Please sign in again.' });
      return;
    }
    if (user.suspended || user.accountStatus === 'suspended') {
      res.status(403).json({ error: 'Your account has been suspended. Contact VIRAASAT concierge.' });
      return;
    }
    req.user = user;
    req.sessionToken = token;
    next();
  }

  function requireDualVerified(req: AuthedRequest, res: Response, next: NextFunction) {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!user.emailVerified || !user.phoneVerified) {
      addAuditLog({
        actorId: user.id,
        actorEmail: user.email,
        action: 'DUAL_VERIFICATION_BLOCKED',
        targetType: 'security',
        outcome: 'denied',
        ipAddress: getClientIp(req),
        detail: `Blocked ${req.method} ${req.path} (emailVerified=${user.emailVerified}, phoneVerified=${user.phoneVerified})`,
      });
      res.status(403).json({
        error:
          'Both verified email and verified phone are required before completing this sensitive transaction.',
        code: 'DUAL_VERIFICATION_REQUIRED',
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
      });
      return;
    }
    next();
  }

  function requireRole(roles: UserRole[]) {
    return (req: AuthedRequest, res: Response, next: NextFunction) => {
      const user = req.user;
      if (!user || !roles.includes(user.role)) {
        addAuditLog({
          actorId: user?.id || 'anonymous',
          actorEmail: user?.email || 'anonymous',
          action: 'RBAC_ACCESS_DENIED',
          targetType: 'endpoint',
          targetId: `${req.method} ${req.path}`,
          outcome: 'denied',
          ipAddress: getClientIp(req),
          detail: `Required roles [${roles.join(', ')}], user role is ${user?.role || 'none'}.`,
        });
        res.status(403).json({ error: 'You do not have permission to access this resource.' });
        return;
      }
      next();
    };
  }

  // Validation schemas for Supabase Auth Dual OTP
  const emailOtpSendSchema = z.object({
    email: z.string().email('Please enter a valid email address.').max(254),
    intent: z.enum(['register', 'login']).default('register'),
    displayName: z.string().min(2, 'Please enter your full name (min 2 characters).').max(100).optional(),
    captchaToken: z.string().max(4096).optional(),
  });

  const emailOtpVerifySchema = z.object({
    email: z.string().email('Please enter a valid email address.').max(254),
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit numeric email OTP.'),
    displayName: z.string().min(2).max(100).optional(),
  });

  const phoneOtpSendSchema = z.object({
    phone: z.string().min(10, 'Enter a valid 10-digit Indian mobile number with +91.').max(20),
    intent: z.enum(['register', 'login']).default('register'),
    captchaToken: z.string().max(4096).optional(),
  });

  const phoneOtpVerifySchema = z.object({
    phone: z.string().min(10).max(20),
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit numeric SMS OTP.'),
    intent: z.enum(['register', 'login']).default('register'),
  });

  const productPayloadSchema = z.object({
    title: z.string().min(3).max(160),
    subtitle: z.string().min(2).max(200),
    description: z.string().min(15).max(2400),
    category: z.enum(PRODUCT_CATEGORIES),
    subcategory: z.string().min(2).max(80).default('Curated Craft'),
    craftOrigin: z.string().min(2).max(80),
    atelierName: z.string().min(2).max(120).optional(),
    priceInr: z.number().int().min(500).max(50_000_000),
    discountPriceInr: z.number().int().min(100).max(50_000_000).optional(),
    stock: z.number().int().min(0).max(10000),
    lowStockThreshold: z.number().int().min(0).max(500).default(2),
    imageUrl: z.string().min(1).max(500),
    material: z.string().min(2).max(200).default('Authentic Handcrafted Heritage Material'),
    weightGrams: z.number().int().min(10).max(100000).default(500),
    dimensions: z.string().min(2).max(120).default('Atelier Standard'),
    shippingInfo: z.string().min(4).max(240).default('Insured heritage vault courier across India'),
    tags: z.array(z.string().min(1).max(40)).max(12).default([]),
    provenanceNote: z.string().min(4).max(300),
    careInstructions: z.string().min(4).max(400),
    craftTimeDays: z.number().int().min(1).max(730).default(21),
    featured: z.boolean().optional(),
    status: z.enum(['active', 'draft', 'archived']).optional(),
  });

  const shippingAddressSchema = z.object({
    label: z.string().min(1).max(60).optional(),
    fullName: z.string().min(2).max(100),
    addressLine: z.string().min(5).max(240),
    city: z.string().min(2).max(80),
    state: z.string().min(2).max(80),
    postalCode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit Indian PIN code'),
    phone: z.string().min(10).max(20),
    isDefault: z.boolean().optional(),
  });

  const reviewSchema = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().min(8).max(1000),
  });

  const sellerApplicationSchema = z.object({
    fullName: z.string().min(2).max(100),
    email: z.string().email(),
    phone: z.string().min(10).max(20),
    businessName: z.string().min(2).max(140),
    businessAddress: z.string().min(8).max(300),
    craftRegion: z.string().min(2).max(80),
    primaryCategory: z.enum(PRODUCT_CATEGORIES),
    gstin: z.string().max(20).optional(),
    panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid 10-character PAN (e.g. AABCV1234M)'),
    bankAccountNumber: z.string().min(8).max(20),
    ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid 11-character IFSC code'),
    identityDocType: z.enum(['Aadhaar / Artisan Card', 'GI Craft Certificate', 'Passport / PAN']),
    identityDocRef: z.string().min(4).max(80),
    portfolioSummary: z.string().min(20).max(1200),
  });

  const couponCreateSchema = z.object({
    code: z.string().min(3).max(24).regex(/^[A-Z0-9_-]+$/i, 'Coupon code must be alphanumeric'),
    description: z.string().min(5).max(180),
    type: z.enum(['percentage', 'fixed']),
    value: z.number().int().min(1).max(100000),
    minOrderInr: z.number().int().min(0).max(10_000_000).default(0),
    maxDiscountInr: z.number().int().min(100).max(500_000).optional(),
    expiresInDays: z.number().int().min(1).max(730).default(90),
  });

  const cmsPatchSchema = z.object({
    announcement: z
      .object({
        enabled: z.boolean(),
        text: z.string().min(4).max(240),
      })
      .optional(),
    hero: z
      .object({
        kicker: z.string().min(2).max(140),
        headline: z.string().min(4).max(180),
        subheadline: z.string().min(10).max(420),
        ctaLabel: z.string().min(2).max(60),
      })
      .optional(),
    heritageStory: z
      .object({
        heading: z.string().min(3).max(160),
        lead: z.string().min(10).max(360),
        body: z.string().min(20).max(2000),
        atelierCount: z.string().min(2).max(60),
        craftClusters: z.string().min(2).max(60),
        authenticityGuarantee: z.string().min(2).max(60),
      })
      .optional(),
  });

  const router = express.Router();

  // Security headers + lightweight CSRF defense on state-changing routes (excluding external webhooks)
  router.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
    const isWebhook =
      req.path === '/webhooks/razorpay' || req.path === '/webhooks/supabase/send-sms';
    if (isMutation && !isWebhook && req.headers.origin) {
      const requestedWith = req.headers['x-requested-with'];
      const hasBearer = req.headers.authorization?.startsWith('Bearer ');
      if (!requestedWith && !hasBearer) {
        res.status(403).json({ error: 'Missing required CSRF protection header.' });
        return;
      }
    }
    next();
  });

  // Health & Public Checkout Settings
  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'viraasat-api',
      authProvider: authStatus.supabaseAuthConfigured ? 'supabase_auth' : 'unconfigured',
      smsHookConfigured: authStatus.smsHookConfigured,
      paymentMode: HAS_LIVE_RAZORPAY ? 'razorpay_live' : 'razorpay_sandbox',
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/settings/public', (_req, res) => {
    res.json({
      codEnabled: store.adminSettings.codEnabled,
      codMaxOrderInr: store.adminSettings.codMaxOrderInr,
      freeShippingThresholdInr: store.adminSettings.freeShippingThresholdInr,
      activeCouponsHint: Array.from(store.coupons.values())
        .filter((c) => c.active && new Date(c.expiresAt).getTime() > Date.now())
        .map((c) => ({ code: c.code, description: c.description })),
    });
  });

  // =========================================================================
  // AUTH: REAL SUPABASE AUTH DUAL OTP (EMAIL VIA RESEND SMTP + PHONE VIA MSG91)
  // Supabase Auth is the single source of truth. Zero fake/demo OTPs.
  // =========================================================================
  router.get('/auth/config', (_req, res) => {
    res.json({
      ...authStatus,
      otpExpirySeconds: Math.floor(OTP_TTL_MS / 1000),
      resendCooldownSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
      maxAttempts: OTP_MAX_ATTEMPTS,
    });
  });

  function checkAndRecordResendCooldown(key: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const until = otpResendCooldowns.get(key) || 0;
    if (until > now) {
      return { allowed: false, retryAfterSec: Math.ceil((until - now) / 1000) };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  function isAttemptLocked(key: string): { locked: boolean; retryAfterSec: number; remaining: number } {
    const now = Date.now();
    const entry = otpFailedAttempts.get(key);
    if (!entry || entry.resetAtMs <= now) {
      otpFailedAttempts.delete(key);
      return { locked: false, retryAfterSec: 0, remaining: OTP_MAX_ATTEMPTS };
    }
    if (entry.count >= OTP_MAX_ATTEMPTS) {
      return {
        locked: true,
        retryAfterSec: Math.max(1, Math.ceil((entry.resetAtMs - now) / 1000)),
        remaining: 0,
      };
    }
    return { locked: false, retryAfterSec: 0, remaining: OTP_MAX_ATTEMPTS - entry.count };
  }

  function recordFailedAttempt(key: string): number {
    const now = Date.now();
    const existing = otpFailedAttempts.get(key);
    if (!existing || existing.resetAtMs <= now) {
      otpFailedAttempts.set(key, { count: 1, resetAtMs: now + OTP_TTL_MS });
      return OTP_MAX_ATTEMPTS - 1;
    }
    existing.count += 1;
    otpFailedAttempts.set(key, existing);
    return Math.max(0, OTP_MAX_ATTEMPTS - existing.count);
  }

  // 1A. SEND REAL EMAIL OTP VIA SUPABASE AUTH (DELIVERED VIA RESEND SMTP)
  router.post('/auth/otp/email/send', async (req: AuthedRequest, res: Response) => {
    const ip = getClientIp(req);
    if (!authStatus.supabaseAuthConfigured) {
      res.status(503).json({
        error:
          'Supabase Auth is not connected yet. Configure SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in server secrets to send real Email OTPs.',
        code: 'SUPABASE_AUTH_NOT_CONFIGURED',
        missingVariables: authStatus.missingVariables,
      });
      return;
    }

    const parsed = emailOtpSendSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid email OTP request.' });
      return;
    }

    const { intent, displayName, captchaToken } = parsed.data;
    if (intent === 'register' && (!displayName || displayName.trim().length < 2)) {
      res.status(400).json({ error: 'Please enter your full name to register.' });
      return;
    }

    const email = normalizeIdentifier(parsed.data.email, 'email');

    const captcha = await verifyTurnstileToken({ token: captchaToken, ipAddress: ip, cfg: supabaseCfg });
    if (!captcha.ok) {
      res.status(400).json({ error: captcha.error, code: 'CAPTCHA_FAILED' });
      return;
    }

    const rate = otpRequestLimiter.consume(`email_send:${ip}:${email}`);
    if (!rate.allowed) {
      addAuditLog({
        actorId: 'anonymous',
        actorEmail: email,
        action: 'EMAIL_OTP_RATE_LIMITED',
        targetType: 'auth',
        outcome: 'denied',
        ipAddress: ip,
        detail: 'Exceeded email OTP request rate limit.',
      });
      res.status(429).json({
        error: `Too many email OTP requests. Please wait ${rate.retryAfterSec}s before trying again.`,
        retryAfterSec: rate.retryAfterSec,
      });
      return;
    }

    const cooldownKey = `email:${email}`;
    const cooldown = checkAndRecordResendCooldown(cooldownKey);
    if (!cooldown.allowed) {
      res.status(429).json({
        error: `Please wait ${cooldown.retryAfterSec}s before resending the email OTP.`,
        retryAfterSec: cooldown.retryAfterSec,
      });
      return;
    }

    try {
      const supabase = createSupabaseAnonClient(supabaseCfg);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: intent === 'register',
          data: displayName ? { display_name: displayName.trim() } : undefined,
          captchaToken,
        },
      });

      if (error) {
        console.error('Supabase signInWithOtp (email) failed:', error.message);
        const mapped = mapSupabaseAuthError(error.message);
        addAuditLog({
          actorId: 'anonymous',
          actorEmail: email,
          action: 'EMAIL_OTP_SEND_FAILED',
          targetType: 'auth',
          outcome: 'failure',
          ipAddress: ip,
          detail: `Supabase Email OTP send failed: ${error.message}`,
        });
        res.status(mapped.status).json({ error: mapped.error });
        return;
      }

      otpResendCooldowns.set(cooldownKey, Date.now() + OTP_RESEND_COOLDOWN_MS);
      otpFailedAttempts.delete(`ver_email:${email}`);

      addAuditLog({
        actorId: 'anonymous',
        actorEmail: email,
        action: 'EMAIL_OTP_DISPATCHED',
        targetType: 'auth',
        targetId: intent,
        outcome: 'success',
        ipAddress: ip,
        detail: `Supabase Auth dispatched real 6-digit email OTP (${intent}) via Resend SMTP.`,
      });

      res.json({
        ok: true,
        channel: 'email',
        normalizedIdentifier: email,
        expiresInSec: Math.floor(OTP_TTL_MS / 1000),
        resendCooldownSec: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
        message: `A 6-digit verification code has been sent to ${email}. Check your inbox (expires in 5 minutes).`,
      });
    } catch (err) {
      res.status(502).json({
        error: `Unable to reach Supabase Auth email service: ${err instanceof Error ? err.message : 'network error'}`,
      });
    }
  });

  // 1B. VERIFY REAL EMAIL OTP VIA SUPABASE AUTH
  router.post('/auth/otp/email/verify', async (req: AuthedRequest, res: Response) => {
    const ip = getClientIp(req);
    if (!authStatus.supabaseAuthConfigured) {
      res.status(503).json({
        error: 'Supabase Auth is not connected yet. Configure Supabase credentials first.',
        code: 'SUPABASE_AUTH_NOT_CONFIGURED',
        missingVariables: authStatus.missingVariables,
      });
      return;
    }

    const parsed = emailOtpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid email OTP payload.' });
      return;
    }

    const email = normalizeIdentifier(parsed.data.email, 'email');
    const code = parsed.data.code.trim();

    const rate = otpVerifyLimiter.consume(`email_ver:${ip}:${email}`);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Too many verification attempts. Please wait ${rate.retryAfterSec}s.`,
        retryAfterSec: rate.retryAfterSec,
      });
      return;
    }

    const attemptKey = `ver_email:${email}`;
    const lock = isAttemptLocked(attemptKey);
    if (lock.locked) {
      res.status(429).json({
        error: `Maximum verification attempts (${OTP_MAX_ATTEMPTS}) reached. Request a fresh Email OTP in ${lock.retryAfterSec}s.`,
        code: 'MAX_ATTEMPTS',
        remainingAttempts: 0,
      });
      return;
    }

    try {
      const supabase = createSupabaseAnonClient(supabaseCfg);
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      });

      if (error || !data?.user || !data?.session?.access_token) {
        if (error) {
          console.error('Supabase verifyOtp (email) failed:', error.message);
        }
        const remaining = recordFailedAttempt(attemptKey);
        const mapped = mapSupabaseAuthError(error?.message || 'Invalid or expired OTP.');
        addAuditLog({
          actorId: 'anonymous',
          actorEmail: email,
          action: 'EMAIL_OTP_VERIFY_FAILED',
          targetType: 'auth',
          outcome: 'failure',
          ipAddress: ip,
          detail: `Supabase rejected email OTP (remaining=${remaining}): ${error?.message || 'no session'}`,
        });
        res.status(mapped.status).json({
          error:
            remaining === 0
              ? 'Maximum verification attempts exceeded. Please request a fresh Email OTP.'
              : `${mapped.error} (${remaining} attempt(s) remaining)`,
          code: remaining === 0 ? 'MAX_ATTEMPTS' : 'INVALID_OTP',
          remainingAttempts: remaining,
        });
        return;
      }

      if (!data.user.email_confirmed_at) {
        res.status(403).json({
          error: 'Supabase Auth has not confirmed email verification yet. Please try again.',
        });
        return;
      }

      otpFailedAttempts.delete(attemptKey);
      const existingLocal = store.users.get(data.user.id) || findUserByEmail(email);
      const user = await syncProfileFromSupabaseUser({
        sbUser: data.user,
        displayNameOverride: parsed.data.displayName,
        cfg: supabaseCfg,
        existingLocal,
      });

      if (user.suspended || user.accountStatus === 'suspended') {
        res.status(403).json({ error: 'This account has been suspended. Contact VIRAASAT concierge.' });
        return;
      }

      store.users.set(user.id, user);
      addAuditLog({
        actorId: user.id,
        actorEmail: user.email,
        action: 'EMAIL_OTP_VERIFIED',
        targetType: 'user',
        targetId: user.id,
        outcome: 'success',
        ipAddress: ip,
        detail: `Supabase Auth verified email (${user.email}). Dual status: email=${user.emailVerified}, phone=${user.phoneVerified}.`,
      });

      res.json({
        ok: true,
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user,
        dualVerified: user.emailVerified && user.phoneVerified,
      });
    } catch (err) {
      res.status(502).json({
        error: `Email OTP verification request failed: ${err instanceof Error ? err.message : 'network error'}`,
      });
    }
  });

  // 2A. SEND REAL PHONE SMS OTP VIA SUPABASE AUTH -> CUSTOM SEND SMS HOOK -> MSG91
  router.post('/auth/otp/phone/send', async (req: AuthedRequest, res: Response) => {
    const ip = getClientIp(req);
    if (!authStatus.supabaseAuthConfigured) {
      res.status(503).json({
        error:
          'Supabase Auth is not connected yet. Configure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SMS_HOOK_SECRET, MSG91_AUTH_KEY, and MSG91_TEMPLATE_ID.',
        code: 'SUPABASE_AUTH_NOT_CONFIGURED',
        missingVariables: authStatus.missingVariables,
      });
      return;
    }

    const parsed = phoneOtpSendSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid phone number.' });
      return;
    }

    const normalized = normalizeIndianPhone(parsed.data.phone);
    if (!normalized) {
      res.status(400).json({
        error: 'Please enter a valid 10-digit Indian mobile number with +91 country code (e.g. +91 9876543210).',
      });
      return;
    }

    const { intent, captchaToken } = parsed.data;
    if (intent === 'login') {
      const captcha = await verifyTurnstileToken({ token: captchaToken, ipAddress: ip, cfg: supabaseCfg });
      if (!captcha.ok) {
        res.status(400).json({ error: captcha.error, code: 'CAPTCHA_FAILED' });
        return;
      }
    }

    const rate = otpRequestLimiter.consume(`phone_send:${ip}:${normalized.e164}`);
    if (!rate.allowed) {
      addAuditLog({
        actorId: 'anonymous',
        actorEmail: normalized.e164,
        action: 'PHONE_OTP_RATE_LIMITED',
        targetType: 'auth',
        outcome: 'denied',
        ipAddress: ip,
        detail: 'Exceeded SMS OTP request rate limit.',
      });
      res.status(429).json({
        error: `Too many SMS OTP requests. Please wait ${rate.retryAfterSec}s before trying again.`,
        retryAfterSec: rate.retryAfterSec,
      });
      return;
    }

    const cooldownKey = `phone:${normalized.e164}`;
    const cooldown = checkAndRecordResendCooldown(cooldownKey);
    if (!cooldown.allowed) {
      res.status(429).json({
        error: `Please wait ${cooldown.retryAfterSec}s before resending the SMS OTP.`,
        retryAfterSec: cooldown.retryAfterSec,
      });
      return;
    }

    try {
      if (intent === 'register') {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          res.status(401).json({
            error: 'Complete Step 1 (Email OTP verification) before binding your mobile number.',
          });
          return;
        }
        const accessToken = authHeader.slice(7).trim();
        const authedUser = await resolveAuthenticatedUser(accessToken);
        if (!authedUser || !authedUser.emailVerified) {
          res.status(403).json({
            error: 'Your email must be verified with Supabase Auth before verifying your mobile number.',
          });
          return;
        }

        // Trigger Supabase Auth phone_change OTP -> invokes Custom Send SMS Hook -> MSG91
        const { error } = await requestSupabasePhoneChangeOtp({
          accessToken,
          phoneE164: normalized.e164,
          cfg: supabaseCfg,
        });

        if (error) {
          const mapped = mapSupabaseAuthError(error.message);
          addAuditLog({
            actorId: authedUser.id,
            actorEmail: authedUser.email,
            action: 'PHONE_OTP_SEND_FAILED',
            targetType: 'auth',
            outcome: 'failure',
            ipAddress: ip,
            detail: `Supabase phone_change OTP dispatch failed for ${normalized.e164}: ${error.message}`,
          });
          res.status(mapped.status).json({ error: mapped.error });
          return;
        }
      } else {
        // Login via registered mobile number -> Supabase Auth invokes Custom Send SMS Hook -> MSG91
        const supabase = createSupabaseAnonClient(supabaseCfg);
        const { error } = await supabase.auth.signInWithOtp({
          phone: normalized.e164,
          options: {
            shouldCreateUser: false,
            captchaToken,
          },
        });

        if (error) {
          const mapped = mapSupabaseAuthError(error.message);
          addAuditLog({
            actorId: 'anonymous',
            actorEmail: normalized.e164,
            action: 'PHONE_OTP_SEND_FAILED',
            targetType: 'auth',
            outcome: 'failure',
            ipAddress: ip,
            detail: `Supabase login SMS OTP dispatch failed for ${normalized.e164}: ${error.message}`,
          });
          res.status(mapped.status).json({ error: mapped.error });
          return;
        }
      }

      // IMPORTANT: MSG91 accepting the send request NEVER marks phone_verified = true.
      otpResendCooldowns.set(cooldownKey, Date.now() + OTP_RESEND_COOLDOWN_MS);
      otpFailedAttempts.delete(`ver_phone:${normalized.e164}`);

      addAuditLog({
        actorId: 'anonymous',
        actorEmail: normalized.e164,
        action: 'PHONE_OTP_DISPATCHED',
        targetType: 'auth',
        targetId: intent,
        outcome: 'success',
        ipAddress: ip,
        detail: `Supabase Auth triggered Send SMS Hook -> MSG91 for ${normalized.e164} (${intent}). Phone remains unverified until OTP confirmation.`,
      });

      res.json({
        ok: true,
        channel: 'phone',
        normalizedIdentifier: normalized.e164,
        expiresInSec: Math.floor(OTP_TTL_MS / 1000),
        resendCooldownSec: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
        message: `A 6-digit SMS OTP has been dispatched via MSG91 to ${normalized.e164}. Enter it within 5 minutes to verify your mobile number.`,
      });
    } catch (err) {
      res.status(502).json({
        error: `Unable to dispatch SMS OTP via Supabase Auth: ${err instanceof Error ? err.message : 'network error'}`,
      });
    }
  });

  // 2B. VERIFY REAL PHONE SMS OTP VIA SUPABASE AUTH
  router.post('/auth/otp/phone/verify', async (req: AuthedRequest, res: Response) => {
    const ip = getClientIp(req);
    if (!authStatus.supabaseAuthConfigured) {
      res.status(503).json({
        error: 'Supabase Auth is not connected yet. Configure Supabase credentials first.',
        code: 'SUPABASE_AUTH_NOT_CONFIGURED',
        missingVariables: authStatus.missingVariables,
      });
      return;
    }

    const parsed = phoneOtpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid SMS OTP payload.' });
      return;
    }

    const normalized = normalizeIndianPhone(parsed.data.phone);
    if (!normalized) {
      res.status(400).json({ error: 'Invalid Indian mobile number format (+91XXXXXXXXXX).' });
      return;
    }

    const code = parsed.data.code.trim();
    const { intent } = parsed.data;

    const rate = otpVerifyLimiter.consume(`phone_ver:${ip}:${normalized.e164}`);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Too many SMS verification attempts. Wait ${rate.retryAfterSec}s.`,
        retryAfterSec: rate.retryAfterSec,
      });
      return;
    }

    const attemptKey = `ver_phone:${normalized.e164}`;
    const lock = isAttemptLocked(attemptKey);
    if (lock.locked) {
      res.status(429).json({
        error: `Maximum SMS verification attempts (${OTP_MAX_ATTEMPTS}) reached. Request a new SMS OTP in ${lock.retryAfterSec}s.`,
        code: 'MAX_ATTEMPTS',
        remainingAttempts: 0,
      });
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      const existingAccessToken = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined;

      if (intent === 'register' && !existingAccessToken) {
        res.status(401).json({
          error: 'Email verification session missing. Please verify your email OTP first.',
        });
        return;
      }

      const supabase = createSupabaseAnonClient(supabaseCfg, existingAccessToken);
      const { data, error } = await supabase.auth.verifyOtp({
        phone: normalized.e164,
        token: code,
        type: intent === 'register' ? 'phone_change' : 'sms',
      });

      if (error || !data?.user) {
        const remaining = recordFailedAttempt(attemptKey);
        const mapped = mapSupabaseAuthError(error?.message || 'Invalid or expired SMS OTP.');
        addAuditLog({
          actorId: 'anonymous',
          actorEmail: normalized.e164,
          action: 'PHONE_OTP_VERIFY_FAILED',
          targetType: 'auth',
          outcome: 'failure',
          ipAddress: ip,
          detail: `Supabase rejected SMS OTP (remaining=${remaining}): ${error?.message || 'no user'}`,
        });
        res.status(mapped.status).json({
          error:
            remaining === 0
              ? 'Maximum SMS OTP attempts exceeded. Request a fresh code.'
              : `${mapped.error} (${remaining} attempt(s) remaining)`,
          code: remaining === 0 ? 'MAX_ATTEMPTS' : 'INVALID_OTP',
          remainingAttempts: remaining,
        });
        return;
      }

      // Strictly confirm Supabase Auth actually confirmed the phone number
      if (!data.user.phone_confirmed_at) {
        res.status(403).json({
          error: 'Supabase Auth has not confirmed this mobile number yet. Verification rejected.',
        });
        return;
      }

      otpFailedAttempts.delete(attemptKey);
      const activeToken = data.session?.access_token || existingAccessToken;
      if (!activeToken) {
        res.status(401).json({ error: 'Unable to establish authenticated Supabase session.' });
        return;
      }

      const existingLocal =
        store.users.get(data.user.id) ||
        (data.user.email ? findUserByEmail(data.user.email) : undefined) ||
        findUserByPhone(normalized.e164);

      const user = await syncProfileFromSupabaseUser({
        sbUser: data.user,
        cfg: supabaseCfg,
        existingLocal,
      });

      if (user.suspended || user.accountStatus === 'suspended') {
        res.status(403).json({ error: 'This account has been suspended. Contact VIRAASAT concierge.' });
        return;
      }

      store.users.set(user.id, user);
      const dualVerified = user.emailVerified && user.phoneVerified;

      if (dualVerified) {
        addNotification(
          user.id,
          'Dual Identity Verification Active',
          'Both your email address and Indian mobile number are verified via Supabase Auth. Your VIRAASAT account is now active.',
          'security'
        );
      }

      addAuditLog({
        actorId: user.id,
        actorEmail: user.email || user.phone,
        action: 'PHONE_OTP_VERIFIED',
        targetType: 'user',
        targetId: user.id,
        outcome: 'success',
        ipAddress: ip,
        detail: `Supabase Auth verified phone ${normalized.e164}. Account status: ${user.accountStatus}.`,
      });

      res.json({
        ok: true,
        token: activeToken,
        refreshToken: data.session?.refresh_token,
        user,
        dualVerified,
      });
    } catch (err) {
      res.status(502).json({
        error: `SMS OTP verification request failed: ${err instanceof Error ? err.message : 'network error'}`,
      });
    }
  });

  // 3. SUPABASE CUSTOM SEND SMS HOOK -> MSG91 (SERVER-TO-SERVER WEBHOOK)
  // Receives the exact 6-digit OTP generated by Supabase Auth and forwards it to MSG91.
  router.post('/webhooks/supabase/send-sms', async (req: AuthedRequest, res: Response) => {
    const ip = getClientIp(req);
    const webhookId = String(req.headers['webhook-id'] || '');
    const webhookTimestamp = String(req.headers['webhook-timestamp'] || '');
    const webhookSignature = String(req.headers['webhook-signature'] || '');
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (!supabaseCfg.smsHookSecret) {
      res.status(500).json({
        error: {
          http_code: 500,
          message: 'SUPABASE_SMS_HOOK_SECRET is not configured on the server.',
        },
      });
      return;
    }

    const sigCheck = verifyStandardWebhookSignature({
      webhookId,
      webhookTimestamp,
      webhookSignatureHeader: webhookSignature,
      rawBody,
      hookSecret: supabaseCfg.smsHookSecret,
    });

    if (!sigCheck.ok) {
      addAuditLog({
        actorId: 'supabase_sms_hook',
        actorEmail: 'auth-hook@supabase',
        action: 'SMS_HOOK_SIGNATURE_REJECTED',
        targetType: 'webhook',
        targetId: webhookId || 'missing',
        outcome: 'denied',
        ipAddress: ip,
        detail: `Rejected Supabase Send SMS Hook: ${sigCheck.reason}`,
      });
      res.status(401).json({
        error: { http_code: 401, message: sigCheck.reason },
      });
      return;
    }

    // Prevent webhook replay attacks using webhook-id deduplication
    if (processedSmsHookIds.has(webhookId)) {
      res.status(409).json({
        error: { http_code: 409, message: 'Duplicate webhook-id replay rejected.' },
      });
      return;
    }
    processedSmsHookIds.add(webhookId);
    if (processedSmsHookIds.size > 5000) {
      const first = processedSmsHookIds.values().next().value;
      if (first) processedSmsHookIds.delete(first);
    }

    const hookSchema = z.object({
      user: z.object({
        id: z.string().min(1),
        phone: z.string().min(10),
        email: z.string().optional(),
      }),
      sms: z.object({
        otp: z.string().regex(/^\d{6}$/, 'Supabase SMS Hook OTP must be 6 digits.'),
      }),
    });

    const parsed = hookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          http_code: 400,
          message: parsed.error.issues[0]?.message || 'Malformed Supabase Send SMS Hook payload.',
        },
      });
      return;
    }

    const { phone } = parsed.data.user;
    const { otp } = parsed.data.sms;

    // Forward the EXACT Supabase-generated OTP to MSG91 (never log the OTP!)
    const msg91Result = await sendOtpViaMsg91({ phone, otp, cfg: supabaseCfg });
    if (!msg91Result.ok) {
      addAuditLog({
        actorId: parsed.data.user.id,
        actorEmail: phone,
        action: 'SMS_HOOK_MSG91_FAILED',
        targetType: 'webhook',
        targetId: webhookId,
        outcome: 'failure',
        ipAddress: ip,
        detail: msg91Result.error,
      });
      res.status(msg91Result.statusCode).json({
        error: { http_code: msg91Result.statusCode, message: msg91Result.error },
      });
      return;
    }

    addAuditLog({
      actorId: parsed.data.user.id,
      actorEmail: phone,
      action: 'SMS_HOOK_MSG91_ACCEPTED',
      targetType: 'webhook',
      targetId: msg91Result.requestId,
      outcome: 'success',
      ipAddress: ip,
      detail: `Forwarded Supabase OTP via MSG91 to ${phone} (requestId=${msg91Result.requestId}). Phone verification pending OTP submission.`,
    });

    // Supabase Auth requires HTTP 200 JSON `{}` to confirm hook completion
    res.status(200).json({});
  });

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    res.json({
      user,
      dualVerified: user.emailVerified && user.phoneVerified,
    });
  });

  router.post('/auth/logout', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (req.sessionToken) {
      store.revokedTokens.add(req.sessionToken);
      if (authStatus.supabaseAuthConfigured && supabaseCfg.supabaseServiceRoleKey) {
        try {
          const adminClient = createSupabaseAdminClient(supabaseCfg);
          await adminClient.auth.admin.signOut(req.sessionToken, 'global');
        } catch {
          // Local revocation already enforced above
        }
      }
    }
    addAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'SESSION_LOGOUT',
      targetType: 'auth',
      outcome: 'success',
      ipAddress: getClientIp(req),
      detail: 'User session revoked in Supabase Auth and server revocation list.',
    });
    res.json({ ok: true });
  });

  // =========================================================================
  // CUSTOMER PROFILE & SAVED ADDRESSES
  // =========================================================================
  router.patch('/profile', requireAuth, (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      displayName: z.string().min(2).max(100).optional(),
      atelierName: z.string().min(2).max(120).optional(),
      craftRegion: z.string().min(2).max(80).optional(),
      notificationPreferences: z
        .object({
          orderEmail: z.boolean(),
          orderSms: z.boolean(),
          securityAlerts: z.boolean(),
          editorialNewsletter: z.boolean(),
        })
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile update.' });
      return;
    }

    const user = req.user!;
    if (parsed.data.displayName) user.displayName = parsed.data.displayName.trim();
    if (parsed.data.atelierName && (user.role === 'seller' || user.role === 'admin')) {
      user.atelierName = parsed.data.atelierName.trim();
    }
    if (parsed.data.craftRegion) user.craftRegion = parsed.data.craftRegion.trim();
    if (parsed.data.notificationPreferences) {
      user.notificationPreferences = parsed.data.notificationPreferences;
    }
    user.updatedAt = new Date().toISOString();

    addAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: 'PROFILE_UPDATED',
      targetType: 'user',
      targetId: user.id,
      outcome: 'success',
      ipAddress: getClientIp(req),
      detail: 'Updated profile details or notification preferences.',
    });

    res.json({ user });
  });

  router.get('/addresses', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ addresses: req.user!.savedAddresses || [] });
  });

  router.post('/addresses', requireAuth, (req: AuthedRequest, res: Response) => {
    const parsed = shippingAddressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid address.' });
      return;
    }
    const user = req.user!;
    const current = user.savedAddresses || [];
    const newAddr: ShippingAddress = {
      id: `addr_${crypto.randomBytes(5).toString('hex')}`,
      label: parsed.data.label || 'Residence',
      ...parsed.data,
      isDefault: parsed.data.isDefault || current.length === 0,
    };
    const nextList = newAddr.isDefault
      ? [newAddr, ...current.map((a) => ({ ...a, isDefault: false }))]
      : [...current, newAddr];
    user.savedAddresses = nextList;
    if (newAddr.isDefault) user.shippingAddress = newAddr;
    user.updatedAt = new Date().toISOString();
    res.status(201).json({ address: newAddr, addresses: nextList, user });
  });

  router.delete('/addresses/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const nextList = (user.savedAddresses || []).filter((a) => a.id !== req.params.id);
    user.savedAddresses = nextList;
    user.shippingAddress = nextList.find((a) => a.isDefault) || nextList[0];
    user.updatedAt = new Date().toISOString();
    res.json({ addresses: nextList, user });
  });

  // =========================================================================
  // PUBLIC ENGAGEMENT: NEWSLETTER, CONTACT & SELLER APPLICATIONS
  // =========================================================================
  router.post('/newsletter', (req: Request, res: Response) => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const exists = store.newsletterSubscribers.some((s) => s.email === email);
    if (!exists) {
      store.newsletterSubscribers.unshift({
        id: `sub_${crypto.randomBytes(5).toString('hex')}`,
        email,
        createdAt: new Date().toISOString(),
      });
    }
    res.status(201).json({
      ok: true,
      message: exists
        ? 'You are already subscribed to VIRAASAT Heritage Dispatches.'
        : 'Subscribed to VIRAASAT Heritage Dispatches and private atelier releases.',
    });
  });

  router.post('/contact', (req: Request, res: Response) => {
    const schema = z.object({
      name: z.string().min(2).max(100),
      email: z.string().email(),
      subject: z.string().min(3).max(160),
      message: z.string().min(10).max(2000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Please complete all fields.' });
      return;
    }
    const inquiry = {
      id: `inq_${crypto.randomBytes(5).toString('hex')}`,
      ...parsed.data,
      createdAt: new Date().toISOString(),
    };
    store.contactInquiries.unshift(inquiry);
    res.status(201).json({
      ok: true,
      inquiry,
      message: 'Your inquiry has been logged with our Curatorial Concierge. Expect a response within 24 hours.',
    });
  });

  router.post('/sellers/apply', (req: AuthedRequest, res: Response) => {
    const parsed = sellerApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Please check your application fields.' });
      return;
    }
    const d = parsed.data;
    const now = new Date().toISOString();
    const appRecord: SellerApplication = {
      id: `app_${crypto.randomBytes(5).toString('hex')}`,
      fullName: d.fullName.trim(),
      email: d.email.trim().toLowerCase(),
      phone: normalizeIdentifier(d.phone, 'phone'),
      businessName: d.businessName.trim(),
      businessAddress: d.businessAddress.trim(),
      craftRegion: d.craftRegion.trim(),
      primaryCategory: d.primaryCategory,
      gstin: d.gstin?.trim() || undefined,
      panNumber: d.panNumber.toUpperCase(),
      bankAccountLast4: d.bankAccountNumber.slice(-4),
      ifscCode: d.ifscCode.toUpperCase(),
      identityDocType: d.identityDocType,
      identityDocRef: d.identityDocRef.trim(),
      portfolioSummary: d.portfolioSummary.trim(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    store.sellerApplications.set(appRecord.id, appRecord);

    // Notify admins
    for (const u of store.users.values()) {
      if (u.role === 'admin') {
        addNotification(
          u.id,
          'New Artisan Atelier Application',
          `${appRecord.businessName} (${appRecord.craftRegion}) applied for seller onboarding.`,
          'atelier'
        );
      }
    }

    addAuditLog({
      actorId: 'applicant',
      actorEmail: appRecord.email,
      action: 'SELLER_APPLICATION_SUBMITTED',
      targetType: 'seller_application',
      targetId: appRecord.id,
      outcome: 'success',
      ipAddress: getClientIp(req),
      detail: `Submitted onboarding KYC for ${appRecord.businessName} (${appRecord.craftRegion}).`,
    });

    res.status(201).json({
      ok: true,
      application: appRecord,
      message: 'Your artisan onboarding dossier has been submitted for Curatorial Council review.',
    });
  });

  // =========================================================================
  // COUPONS VALIDATION
  // =========================================================================
  router.post('/coupons/validate', (req: Request, res: Response) => {
    const schema = z.object({
      code: z.string().min(2).max(24),
      subtotalInr: z.number().min(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a valid privilege code.' });
      return;
    }
    const normalizedCode = parsed.data.code.trim().toUpperCase();
    const coupon = store.coupons.get(normalizedCode);
    if (!coupon) {
      res.status(404).json({ error: `Privilege code "${normalizedCode}" was not found.` });
      return;
    }
    const calc = calculateCouponDiscount(parsed.data.subtotalInr, coupon);
    if (calc.error) {
      res.status(400).json({ error: calc.error });
      return;
    }
    res.json({ ok: true, coupon, discountInr: calc.discountInr });
  });

  // =========================================================================
  // CATALOGUE, SEARCH, FILTERS & SELLER PRODUCT MANAGEMENT
  // =========================================================================
  router.get('/products', (req: Request, res: Response) => {
    const allProducts = Array.from(store.products.values());
    const includeAll = req.query.includeAll === 'true';

    if (includeAll) {
      res.json({ products: allProducts });
      return;
    }

    const category =
      typeof req.query.category === 'string' && req.query.category !== 'All'
        ? (req.query.category as ProductCategory)
        : 'All';
    const origin =
      typeof req.query.origin === 'string' && req.query.origin !== 'All'
        ? req.query.origin
        : 'All';
    const atelier =
      typeof req.query.atelier === 'string' && req.query.atelier !== 'All'
        ? req.query.atelier
        : 'All';
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
    const minRating = req.query.minRating ? Number(req.query.minRating) : undefined;
    const inStockOnly = req.query.inStock === 'true';
    const sort =
      typeof req.query.sort === 'string'
        ? (req.query.sort as 'featured' | 'price_asc' | 'price_desc' | 'rating_desc' | 'newest')
        : 'featured';

    const products = filterAndSortProducts(allProducts, {
      query,
      category,
      origin,
      atelier,
      minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
      maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
      minRating: Number.isFinite(minRating) ? minRating : undefined,
      inStockOnly,
      sort,
    });

    res.json({
      products,
      total: products.length,
      origins: Array.from(new Set(allProducts.map((p) => p.craftOrigin))).sort(),
      ateliers: Array.from(new Set(allProducts.map((p) => p.atelierName))).sort(),
    });
  });

  router.get('/products/:idOrSlug', (req: Request, res: Response) => {
    const key = req.params.idOrSlug;
    let found = store.products.get(key);
    if (!found) {
      found = Array.from(store.products.values()).find((p) => p.slug === key);
    }
    if (!found) {
      res.status(404).json({ error: 'Heritage piece not found.' });
      return;
    }
    const productReviews = store.reviews.filter((r) => r.productId === found!.id);
    const relatedProducts = Array.from(store.products.values())
      .filter(
        (p) =>
          p.id !== found!.id &&
          p.status === 'active' &&
          p.approved &&
          (p.category === found!.category || p.craftOrigin === found!.craftOrigin)
      )
      .slice(0, 3);
    res.json({ product: found, reviews: productReviews, relatedProducts });
  });

  router.post(
    '/products',
    requireAuth,
    requireDualVerified,
    requireRole(['seller', 'admin']),
    (req: AuthedRequest, res: Response) => {
      if (req.user!.role === 'seller' && !req.user!.sellerVerified) {
        res.status(403).json({
          error: 'Your artisan atelier must be approved by an administrator before listing products.',
        });
        return;
      }
      const limit = apiMutationLimiter.consume(`mut:${req.user!.id}`);
      if (!limit.allowed) {
        res.status(429).json({ error: 'Too many requests. Please slow down.' });
        return;
      }

      const parsed = productPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid product data.' });
        return;
      }

      const data = parsed.data;
      const safeImage = sanitizeExternalUrl(data.imageUrl) || IMAGES.banarasi;
      const id = `prod_${crypto.randomBytes(5).toString('hex')}`;
      const slugBase = data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const slug = `${slugBase}-${id.slice(-4)}`;
      const sku = `VRS-${id.slice(-4).toUpperCase()}`;
      const now = new Date().toISOString();

      const product: Product = {
        id,
        slug,
        sku,
        title: data.title,
        subtitle: data.subtitle,
        description: data.description,
        category: data.category,
        subcategory: data.subcategory,
        craftOrigin: data.craftOrigin,
        atelierName: data.atelierName || req.user!.atelierName || req.user!.displayName,
        sellerId: req.user!.id,
        priceInr: data.priceInr,
        discountPriceInr: data.discountPriceInr,
        stock: data.stock,
        lowStockThreshold: data.lowStockThreshold,
        imageUrl: safeImage,
        gallery: [safeImage, IMAGES.hero],
        material: data.material,
        weightGrams: data.weightGrams,
        dimensions: data.dimensions,
        shippingInfo: data.shippingInfo,
        tags: data.tags,
        provenanceNote: data.provenanceNote,
        careInstructions: data.careInstructions,
        craftTimeDays: data.craftTimeDays,
        variants: [
          {
            label: 'Standard Atelier Edition',
            sku,
            priceDeltaInr: 0,
          },
        ],
        featured: Boolean(data.featured) && req.user!.role === 'admin',
        approved: true,
        status: data.status || 'active',
        ratingAvg: 0,
        reviewCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      store.products.set(product.id, product);
      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'PRODUCT_CREATED',
        targetType: 'product',
        targetId: product.id,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `Listed "${product.title}" at ₹${product.priceInr} (stock: ${product.stock}).`,
      });

      res.status(201).json({ product });
    }
  );

  router.patch(
    '/products/:id',
    requireAuth,
    requireDualVerified,
    requireRole(['seller', 'admin']),
    (req: AuthedRequest, res: Response) => {
      const existing = store.products.get(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      if (req.user!.role !== 'admin' && existing.sellerId !== req.user!.id) {
        res.status(403).json({ error: 'You can only edit your own atelier listings.' });
        return;
      }

      const partialSchema = productPayloadSchema.partial();
      const parsed = partialSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update data.' });
        return;
      }

      const patch = parsed.data;
      const updated: Product = {
        ...existing,
        ...patch,
        featured:
          req.user!.role === 'admin' && typeof patch.featured === 'boolean'
            ? patch.featured
            : existing.featured,
        imageUrl: patch.imageUrl
          ? sanitizeExternalUrl(patch.imageUrl) || existing.imageUrl
          : existing.imageUrl,
        updatedAt: new Date().toISOString(),
      };
      store.products.set(updated.id, updated);

      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'PRODUCT_UPDATED',
        targetType: 'product',
        targetId: updated.id,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `Updated "${updated.title}" (price: ₹${updated.priceInr}, stock: ${updated.stock}, status: ${updated.status}).`,
      });

      res.json({ product: updated });
    }
  );

  router.delete(
    '/products/:id',
    requireAuth,
    requireDualVerified,
    requireRole(['seller', 'admin']),
    (req: AuthedRequest, res: Response) => {
      const existing = store.products.get(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      if (req.user!.role !== 'admin' && existing.sellerId !== req.user!.id) {
        res.status(403).json({ error: 'You can only archive your own atelier listings.' });
        return;
      }
      existing.status = 'archived';
      existing.updatedAt = new Date().toISOString();

      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'PRODUCT_ARCHIVED',
        targetType: 'product',
        targetId: existing.id,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `Archived listing "${existing.title}".`,
      });

      res.json({ ok: true, product: existing });
    }
  );

  router.patch(
    '/seller/inventory/:id',
    requireAuth,
    requireDualVerified,
    requireRole(['seller', 'admin']),
    (req: AuthedRequest, res: Response) => {
      const existing = store.products.get(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      if (req.user!.role !== 'admin' && existing.sellerId !== req.user!.id) {
        res.status(403).json({ error: 'Cannot adjust inventory for another atelier.' });
        return;
      }

      const schema = z.object({
        stock: z.number().int().min(0).max(10000),
        priceInr: z.number().int().min(500).max(50_000_000).optional(),
        lowStockThreshold: z.number().int().min(0).max(500).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid stock or pricing adjustment.' });
        return;
      }

      const prevStock = existing.stock;
      existing.stock = parsed.data.stock;
      if (typeof parsed.data.priceInr === 'number') {
        existing.priceInr = parsed.data.priceInr;
      }
      if (typeof parsed.data.lowStockThreshold === 'number') {
        existing.lowStockThreshold = parsed.data.lowStockThreshold;
      }
      existing.updatedAt = new Date().toISOString();

      if (existing.stock <= existing.lowStockThreshold) {
        addNotification(
          existing.sellerId,
          'Low Inventory Alert',
          `"${existing.title}" now has ${existing.stock} unit(s) in stock.`,
          'inventory'
        );
      }

      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'INVENTORY_ADJUSTED',
        targetType: 'product',
        targetId: existing.id,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `Adjusted stock for "${existing.title}" from ${prevStock} to ${existing.stock}.`,
      });

      res.json({ product: existing });
    }
  );

  // =========================================================================
  // REVIEWS
  // =========================================================================
  router.post(
    '/products/:id/reviews',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const product = store.products.get(req.params.id);
      if (!product) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      const parsed = reviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid review.' });
        return;
      }

      const hasPurchased = Array.from(store.orders.values()).some(
        (ord) =>
          ord.userId === req.user!.id &&
          ord.paymentStatus === 'captured' &&
          ord.items.some((item) => item.productId === product.id)
      );

      const review = {
        id: `rev_${crypto.randomBytes(5).toString('hex')}`,
        productId: product.id,
        userId: req.user!.id,
        authorName: req.user!.displayName,
        rating: parsed.data.rating,
        comment: parsed.data.comment.trim(),
        verifiedPurchase: hasPurchased,
        createdAt: new Date().toISOString(),
      };

      store.reviews.unshift(review);
      const allRatings = store.reviews
        .filter((r) => r.productId === product.id)
        .map((r) => r.rating);
      const summary = computeRatingSummary(allRatings);
      product.ratingAvg = summary.avg;
      product.reviewCount = summary.count;

      res.status(201).json({ review, product });
    }
  );

  // =========================================================================
  // WISHLIST & CART
  // =========================================================================
  router.get('/wishlist', requireAuth, (req: AuthedRequest, res: Response) => {
    const ids = Array.from(store.wishlists.get(req.user!.id) || []);
    const products = ids
      .map((id) => store.products.get(id))
      .filter((p): p is Product => Boolean(p));
    res.json({ productIds: ids, products });
  });

  router.post('/wishlist/:productId', requireAuth, (req: AuthedRequest, res: Response) => {
    const product = store.products.get(req.params.productId);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    let set = store.wishlists.get(req.user!.id);
    if (!set) {
      set = new Set<string>();
      store.wishlists.set(req.user!.id, set);
    }
    if (set.has(product.id)) {
      set.delete(product.id);
    } else {
      set.add(product.id);
    }
    res.json({ productIds: Array.from(set) });
  });

  router.get('/cart', requireAuth, (req: AuthedRequest, res: Response) => {
    const items = store.carts.get(req.user!.id) || [];
    res.json({
      items,
      totals: calculateCartTotals(items, {
        freeShippingThresholdInr: store.adminSettings.freeShippingThresholdInr,
      }),
    });
  });

  router.post('/cart', requireAuth, (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      productId: z.string().min(1),
      variantLabel: z.string().min(1).max(120).optional(),
      quantity: z.number().int().min(1).max(20).default(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid cart item payload.' });
      return;
    }

    const product = store.products.get(parsed.data.productId);
    if (!product || product.status !== 'active' || !product.approved) {
      res.status(404).json({ error: 'Product unavailable.' });
      return;
    }

    const variant =
      product.variants.find((v) => v.label === parsed.data.variantLabel) ||
      product.variants[0] || { label: 'Standard Atelier Edition', sku: product.sku, priceDeltaInr: 0 };
    const unitPriceInr = getEffectiveProductPrice(product) + variant.priceDeltaInr;

    const current = store.carts.get(req.user!.id) || [];
    const existing = current.find(
      (i) => i.productId === product.id && i.variantLabel === variant.label
    );

    const desiredQty = (existing?.quantity || 0) + parsed.data.quantity;
    if (desiredQty > product.stock) {
      res.status(400).json({
        error: `Only ${product.stock} piece(s) currently available from ${product.atelierName}.`,
      });
      return;
    }

    if (existing) {
      existing.quantity = desiredQty;
      existing.stock = product.stock;
      existing.unitPriceInr = unitPriceInr;
    } else {
      current.push({
        productId: product.id,
        variantLabel: variant.label,
        quantity: parsed.data.quantity,
        title: product.title,
        atelierName: product.atelierName,
        craftOrigin: product.craftOrigin,
        imageUrl: product.imageUrl,
        unitPriceInr,
        stock: product.stock,
      });
    }

    store.carts.set(req.user!.id, current);
    res.json({
      items: current,
      totals: calculateCartTotals(current, {
        freeShippingThresholdInr: store.adminSettings.freeShippingThresholdInr,
      }),
    });
  });

  router.patch('/cart', requireAuth, (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      productId: z.string().min(1),
      variantLabel: z.string().min(1),
      quantity: z.number().int().min(0).max(20),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid cart quantity.' });
      return;
    }

    let current = store.carts.get(req.user!.id) || [];
    if (parsed.data.quantity === 0) {
      current = current.filter(
        (i) =>
          !(
            i.productId === parsed.data.productId &&
            i.variantLabel === parsed.data.variantLabel
          )
      );
    } else {
      const product = store.products.get(parsed.data.productId);
      if (product && parsed.data.quantity > product.stock) {
        res.status(400).json({ error: `Only ${product.stock} unit(s) available.` });
        return;
      }
      current = current.map((i) =>
        i.productId === parsed.data.productId &&
        i.variantLabel === parsed.data.variantLabel
          ? { ...i, quantity: parsed.data.quantity }
          : i
      );
    }

    store.carts.set(req.user!.id, current);
    res.json({
      items: current,
      totals: calculateCartTotals(current, {
        freeShippingThresholdInr: store.adminSettings.freeShippingThresholdInr,
      }),
    });
  });

  // =========================================================================
  // CHECKOUT, COUPONS, COD, RAZORPAY PAYMENTS & SIGNED WEBHOOK VERIFICATION
  // =========================================================================
  router.post(
    '/payments/razorpay/create-order',
    requireAuth,
    requireDualVerified,
    async (req: AuthedRequest, res: Response) => {
      const idempotencyKey =
        typeof req.headers['idempotency-key'] === 'string'
          ? req.headers['idempotency-key'].trim()
          : '';
      if (idempotencyKey) {
        const existingOrderId = store.idempotencyKeys.get(`${req.user!.id}:${idempotencyKey}`);
        if (existingOrderId) {
          const existingOrder = store.orders.get(existingOrderId);
          if (existingOrder) {
            res.json({
              order: existingOrder,
              idempotentReplay: true,
              razorpay: {
                orderId: existingOrder.razorpayOrderId,
                amountPaise: existingOrder.totalInr * 100,
                currency: 'INR',
                keyId: HAS_LIVE_RAZORPAY ? RAZORPAY_KEY_ID : 'rzp_test_viraasat_sandbox',
                mode: HAS_LIVE_RAZORPAY ? 'live' : 'sandbox',
              },
            });
            return;
          }
        }
      }

      const schema = z.object({
        shippingAddress: shippingAddressSchema,
        shippingMethod: z.enum(['standard', 'express']).default('standard'),
        paymentMethod: z.enum(['upi', 'card', 'netbanking', 'cod']).default('upi'),
        couponCode: z.string().max(24).optional(),
        items: z
          .array(
            z.object({
              productId: z.string().min(1),
              variantLabel: z.string().min(1),
              quantity: z.number().int().min(1).max(20),
            })
          )
          .min(1),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid checkout form.' });
        return;
      }

      const verifiedItems: Order['items'] = [];
      for (const reqItem of parsed.data.items) {
        const product = store.products.get(reqItem.productId);
        if (!product || product.status !== 'active' || !product.approved) {
          res.status(400).json({ error: `Product ${reqItem.productId} is no longer available.` });
          return;
        }
        if (product.stock < reqItem.quantity) {
          res.status(409).json({
            error: `Insufficient stock for "${product.title}" (${product.stock} available).`,
          });
          return;
        }
        const variant =
          product.variants.find((v) => v.label === reqItem.variantLabel) ||
          product.variants[0] || { label: reqItem.variantLabel, sku: product.sku, priceDeltaInr: 0 };

        verifiedItems.push({
          productId: product.id,
          sellerId: product.sellerId,
          title: product.title,
          variantLabel: variant.label,
          quantity: reqItem.quantity,
          unitPriceInr: getEffectiveProductPrice(product) + variant.priceDeltaInr,
          imageUrl: product.imageUrl,
        });
      }

      let appliedCoupon: Coupon | null = null;
      if (parsed.data.couponCode?.trim()) {
        const code = parsed.data.couponCode.trim().toUpperCase();
        const found = store.coupons.get(code);
        if (!found) {
          res.status(400).json({ error: `Coupon "${code}" is invalid.` });
          return;
        }
        const rawSub = verifiedItems.reduce((s, i) => s + i.unitPriceInr * i.quantity, 0);
        const check = calculateCouponDiscount(rawSub, found);
        if (check.error) {
          res.status(400).json({ error: check.error });
          return;
        }
        appliedCoupon = found;
      }

      const totals = calculateCartTotals(verifiedItems, {
        coupon: appliedCoupon,
        shippingMethod: parsed.data.shippingMethod,
        freeShippingThresholdInr: store.adminSettings.freeShippingThresholdInr,
      });

      const isCod = parsed.data.paymentMethod === 'cod';
      if (isCod) {
        if (!store.adminSettings.codEnabled) {
          res.status(400).json({ error: 'Cash on Delivery is currently disabled.' });
          return;
        }
        if (totals.totalInr > store.adminSettings.codMaxOrderInr) {
          res.status(400).json({
            error: `Cash on Delivery is limited to orders up to ₹${store.adminSettings.codMaxOrderInr.toLocaleString('en-IN')}. Please use Razorpay.`,
          });
          return;
        }
      }

      const orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
      const orderNumber = `VRS-2026-${crypto.randomInt(2000, 9999)}`;
      let razorpayOrderId = isCod
        ? `cod_${crypto.randomBytes(5).toString('hex')}`
        : `order_vrs_${crypto.randomBytes(6).toString('hex')}`;

      if (!isCod && HAS_LIVE_RAZORPAY) {
        try {
          const authBasic = Buffer.from(
            `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`
          ).toString('base64');
          const rzpResp = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
              Authorization: `Basic ${authBasic}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              amount: totals.totalInr * 100,
              currency: 'INR',
              receipt: orderNumber,
              notes: { viraasatOrderId: orderId, userId: req.user!.id },
            }),
          });
          if (rzpResp.ok) {
            const rzpData = (await rzpResp.json()) as { id?: string };
            if (rzpData.id) razorpayOrderId = rzpData.id;
          }
        } catch (err) {
          console.error('Razorpay API fallback to sandbox order:', err);
        }
      }

      const now = new Date().toISOString();
      const order: Order = {
        id: orderId,
        orderNumber,
        userId: req.user!.id,
        customerName: req.user!.displayName,
        customerEmail: req.user!.email,
        items: verifiedItems,
        subtotalInr: totals.subtotalInr,
        discountInr: totals.discountInr,
        couponCode: appliedCoupon?.code,
        taxInr: totals.taxInr,
        shippingInr: totals.shippingInr,
        shippingMethod: parsed.data.shippingMethod,
        totalInr: totals.totalInr,
        paymentMethod: parsed.data.paymentMethod,
        paymentStatus: isCod ? 'authorized' : 'pending',
        status: isCod ? 'confirmed' : 'placed',
        razorpayOrderId,
        shippingAddress: parsed.data.shippingAddress,
        timeline: [
          {
            status: isCod ? 'confirmed' : 'placed',
            note: isCod
              ? 'Cash on Delivery order confirmed after dual email & phone OTP verification.'
              : 'Order created after dual email & phone OTP verification. Awaiting Razorpay confirmation.',
            timestamp: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      if (appliedCoupon) {
        appliedCoupon.redemptionCount += 1;
      }

      if (isCod) {
        for (const item of verifiedItems) {
          const product = store.products.get(item.productId)!;
          product.stock = Math.max(0, product.stock - item.quantity);
          product.updatedAt = now;
          addNotification(
            product.sellerId,
            'New Verified COD Order Received',
            `Order ${order.orderNumber} includes ${item.quantity} × "${item.title}".`,
            'order'
          );
        }
        store.carts.set(req.user!.id, []);
        addNotification(
          req.user!.id,
          `COD Order ${order.orderNumber} Confirmed`,
          `Your Cash on Delivery order of ₹${order.totalInr.toLocaleString('en-IN')} has been confirmed.`,
          'order'
        );
      }

      store.orders.set(order.id, order);
      if (idempotencyKey) {
        store.idempotencyKeys.set(`${req.user!.id}:${idempotencyKey}`, order.id);
      }
      req.user!.shippingAddress = parsed.data.shippingAddress;

      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: isCod ? 'COD_ORDER_CONFIRMED' : 'RAZORPAY_ORDER_CREATED',
        targetType: 'order',
        targetId: order.orderNumber,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `Created ${parsed.data.paymentMethod.toUpperCase()} order ${razorpayOrderId} for ₹${order.totalInr}${appliedCoupon ? ` (coupon ${appliedCoupon.code})` : ''}.`,
      });

      res.status(201).json({
        order,
        codConfirmed: isCod,
        razorpay: {
          orderId: razorpayOrderId,
          amountPaise: order.totalInr * 100,
          currency: 'INR',
          keyId: HAS_LIVE_RAZORPAY ? RAZORPAY_KEY_ID : 'rzp_test_viraasat_sandbox',
          mode: HAS_LIVE_RAZORPAY ? 'live' : 'sandbox',
        },
      });
    }
  );

  router.post(
    '/payments/razorpay/authorize-sandbox',
    requireAuth,
    requireDualVerified,
    (req: AuthedRequest, res: Response) => {
      if (IS_PROD && HAS_LIVE_RAZORPAY) {
        res.status(403).json({ error: 'Sandbox authorization disabled in live production mode.' });
        return;
      }
      const schema = z.object({
        orderId: z.string().min(1),
        paymentMethod: z.enum(['upi', 'card', 'netbanking']).default('upi'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid payment authorization request.' });
        return;
      }

      const order = store.orders.get(parsed.data.orderId);
      if (!order || order.userId !== req.user!.id) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }

      const razorpayPaymentId = `pay_vrs_${crypto.randomBytes(6).toString('hex')}`;
      const razorpaySignature = signRazorpayPayment(
        order.razorpayOrderId,
        razorpayPaymentId,
        RAZORPAY_KEY_SECRET
      );

      res.json({
        razorpayOrderId: order.razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        method: parsed.data.paymentMethod,
      });
    }
  );

  router.post(
    '/payments/razorpay/verify',
    requireAuth,
    requireDualVerified,
    (req: AuthedRequest, res: Response) => {
      const schema = z.object({
        orderId: z.string().min(1),
        razorpayOrderId: z.string().min(1),
        razorpayPaymentId: z.string().min(1),
        razorpaySignature: z.string().min(16),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Missing payment verification signature parameters.' });
        return;
      }

      const order = store.orders.get(parsed.data.orderId);
      if (!order || order.userId !== req.user!.id) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }

      if (order.razorpayOrderId !== parsed.data.razorpayOrderId) {
        res.status(400).json({ error: 'Razorpay order ID mismatch.' });
        return;
      }

      const isValid = verifyRazorpayPaymentSignature(
        parsed.data.razorpayOrderId,
        parsed.data.razorpayPaymentId,
        parsed.data.razorpaySignature,
        RAZORPAY_KEY_SECRET
      );

      if (!isValid) {
        addAuditLog({
          actorId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'PAYMENT_SIGNATURE_INVALID',
          targetType: 'order',
          targetId: order.orderNumber,
          outcome: 'denied',
          ipAddress: getClientIp(req),
          detail: 'Rejected Razorpay payment verification due to HMAC-SHA256 mismatch.',
        });
        res.status(400).json({ error: 'Payment signature verification failed.' });
        return;
      }

      if (order.paymentStatus !== 'captured') {
        for (const item of order.items) {
          const product = store.products.get(item.productId);
          if (!product || product.stock < item.quantity) {
            res.status(409).json({
              error: `Stock exhausted for "${item.title}" during confirmation.`,
            });
            return;
          }
        }
        for (const item of order.items) {
          const product = store.products.get(item.productId)!;
          product.stock = Math.max(0, product.stock - item.quantity);
          product.updatedAt = new Date().toISOString();
          if (product.stock <= product.lowStockThreshold) {
            addNotification(
              product.sellerId,
              'Low Stock Alert After Acquisition',
              `"${product.title}" dropped to ${product.stock} remaining piece(s) after order ${order.orderNumber}.`,
              'inventory'
            );
          }
          addNotification(
            product.sellerId,
            'New Verified Acquisition Received',
            `Order ${order.orderNumber} includes ${item.quantity} × "${item.title}".`,
            'order'
          );
        }

        const now = new Date().toISOString();
        order.paymentStatus = 'captured';
        order.status = 'confirmed';
        order.razorpayPaymentId = parsed.data.razorpayPaymentId;
        order.updatedAt = now;
        order.timeline.push({
          status: 'confirmed',
          note: `Razorpay payment ${parsed.data.razorpayPaymentId} verified via HMAC-SHA256.`,
          timestamp: now,
        });

        store.carts.set(req.user!.id, []);
        addNotification(
          req.user!.id,
          `Order ${order.orderNumber} Confirmed`,
          `Your payment of ₹${order.totalInr.toLocaleString('en-IN')} has been verified. The atelier has begun preparing your piece.`,
          'order'
        );

        addAuditLog({
          actorId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'PAYMENT_VERIFIED',
          targetType: 'order',
          targetId: order.orderNumber,
          outcome: 'success',
          ipAddress: getClientIp(req),
          detail: `Verified Razorpay payment ${parsed.data.razorpayPaymentId} for ₹${order.totalInr}.`,
        });
      }

      res.json({ ok: true, order });
    }
  );

  router.post('/webhooks/razorpay', (req: AuthedRequest, res: Response) => {
    const signature = String(req.headers['x-razorpay-signature'] || '');
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const valid = verifyRazorpayWebhookSignature(
      rawBody,
      signature,
      RAZORPAY_WEBHOOK_SECRET
    );

    if (!valid) {
      addAuditLog({
        actorId: 'webhook_caller',
        actorEmail: 'razorpay-webhook',
        action: 'WEBHOOK_SIGNATURE_REJECTED',
        targetType: 'webhook',
        outcome: 'denied',
        ipAddress: getClientIp(req),
        detail: 'Rejected Razorpay webhook with invalid x-razorpay-signature header.',
      });
      res.status(400).json({ error: 'Invalid Razorpay webhook signature.' });
      return;
    }

    const eventId = String(req.headers['x-razorpay-event-id'] || crypto.randomUUID());
    if (store.processedWebhookEvents.has(eventId)) {
      res.json({ ok: true, deduplicated: true });
      return;
    }
    store.processedWebhookEvents.add(eventId);

    const event = req.body?.event as string | undefined;
    const entity = req.body?.payload?.payment?.entity as
      | { id?: string; order_id?: string }
      | undefined;

    if (entity?.order_id) {
      const targetOrder = Array.from(store.orders.values()).find(
        (o) => o.razorpayOrderId === entity.order_id
      );
      if (targetOrder) {
        const now = new Date().toISOString();
        if (event === 'payment.captured' && targetOrder.paymentStatus !== 'captured') {
          targetOrder.paymentStatus = 'captured';
          targetOrder.status = 'confirmed';
          targetOrder.razorpayPaymentId = entity.id || targetOrder.razorpayPaymentId;
          targetOrder.updatedAt = now;
          targetOrder.timeline.push({
            status: 'confirmed',
            note: 'Payment captured via verified Razorpay webhook.',
            timestamp: now,
          });
        } else if (event === 'payment.refunded') {
          targetOrder.paymentStatus = 'refunded';
          targetOrder.status = 'refunded';
          targetOrder.updatedAt = now;
          targetOrder.timeline.push({
            status: 'refunded',
            note: 'Refund confirmed via verified Razorpay webhook.',
            timestamp: now,
          });
        }
      }
    }

    addAuditLog({
      actorId: 'razorpay_webhook',
      actorEmail: 'webhook@razorpay.com',
      action: 'WEBHOOK_VERIFIED',
      targetType: 'webhook',
      targetId: eventId,
      outcome: 'success',
      ipAddress: getClientIp(req),
      detail: `Verified and processed Razorpay webhook event "${event || 'unknown'}".`,
    });

    res.json({ ok: true, eventId, event });
  });

  router.post(
    '/admin/webhooks/verify-test',
    requireAuth,
    requireDualVerified,
    requireRole(['admin']),
    (req: AuthedRequest, res: Response) => {
      const tamper = Boolean(req.body?.tamper);
      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: `pay_test_${crypto.randomBytes(4).toString('hex')}`,
              order_id: 'order_vrs_seed1001',
            },
          },
        },
      });
      const validSig = signRazorpayWebhookPayload(payload, RAZORPAY_WEBHOOK_SECRET);
      const submittedSig = tamper ? `${validSig.slice(0, -4)}0000` : validSig;
      const verified = verifyRazorpayWebhookSignature(
        payload,
        submittedSig,
        RAZORPAY_WEBHOOK_SECRET
      );

      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: verified ? 'WEBHOOK_SELF_TEST_PASSED' : 'WEBHOOK_TAMPER_BLOCKED',
        targetType: 'webhook',
        outcome: verified ? 'success' : 'denied',
        ipAddress: getClientIp(req),
        detail: tamper
          ? 'Tampered webhook signature correctly rejected via timingSafeEqual.'
          : 'Valid HMAC-SHA256 webhook signature verified successfully.',
      });

      res.json({
        verified,
        tamperAttempted: tamper,
        message: verified
          ? 'Valid HMAC-SHA256 webhook signature verified.'
          : 'Tampered webhook signature rejected (HTTP 400 in production webhook route).',
      });
    }
  );

  // =========================================================================
  // ORDERS, RETURNS & REFUNDS
  // =========================================================================
  router.get('/orders', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'mine';
    const allOrders = Array.from(store.orders.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );

    if (scope === 'all' && user.role === 'admin') {
      res.json({ orders: allOrders });
      return;
    }

    if (scope === 'seller' && (user.role === 'seller' || user.role === 'admin')) {
      const sellerOrders =
        user.role === 'admin'
          ? allOrders
          : allOrders.filter((ord) => ord.items.some((i) => i.sellerId === user.id));
      res.json({ orders: sellerOrders });
      return;
    }

    res.json({ orders: allOrders.filter((ord) => ord.userId === user.id) });
  });

  router.patch(
    '/orders/:id/status',
    requireAuth,
    requireDualVerified,
    (req: AuthedRequest, res: Response) => {
      const order = store.orders.get(req.params.id);
      if (!order) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      const schema = z.object({
        status: z.enum([
          'placed',
          'confirmed',
          'crafted',
          'dispatched',
          'delivered',
          'cancelled',
          'refunded',
        ]),
        note: z.string().max(260).optional(),
        trackingNumber: z.string().max(80).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid status transition.' });
        return;
      }

      const user = req.user!;
      const nextStatus = parsed.data.status;
      const isAdmin = user.role === 'admin';
      const isSellerOwner =
        user.role === 'seller' && order.items.some((i) => i.sellerId === user.id);
      const isBuyerCancelling =
        order.userId === user.id && order.status === 'placed' && nextStatus === 'cancelled';

      if (!isAdmin && !isSellerOwner && !isBuyerCancelling) {
        res.status(403).json({ error: 'Not authorized to update this order status.' });
        return;
      }

      if (!canTransitionOrderStatus(order.status, nextStatus, isAdmin)) {
        res.status(400).json({
          error: `Cannot transition order from "${order.status}" to "${nextStatus}".`,
        });
        return;
      }

      const prev = order.status;
      const now = new Date().toISOString();
      order.status = nextStatus;
      if (parsed.data.trackingNumber?.trim()) {
        order.trackingNumber = parsed.data.trackingNumber.trim();
      }
      if (nextStatus === 'refunded') {
        order.paymentStatus = 'refunded';
      }
      order.updatedAt = now;
      order.timeline.push({
        status: nextStatus,
        note:
          parsed.data.note?.trim() ||
          `Order status updated from ${prev} to ${nextStatus}${order.trackingNumber ? ` (Tracking: ${order.trackingNumber})` : ''}.`,
        timestamp: now,
      });

      addNotification(
        order.userId,
        `Order ${order.orderNumber}: ${nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}`,
        order.timeline[order.timeline.length - 1].note,
        'order'
      );

      addAuditLog({
        actorId: user.id,
        actorEmail: user.email,
        action: 'ORDER_STATUS_UPDATED',
        targetType: 'order',
        targetId: order.orderNumber,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `Transitioned ${order.orderNumber} from ${prev} to ${nextStatus}.`,
      });

      res.json({ order });
    }
  );

  router.post(
    '/orders/:id/return-request',
    requireAuth,
    requireDualVerified,
    (req: AuthedRequest, res: Response) => {
      const order = store.orders.get(req.params.id);
      if (!order || order.userId !== req.user!.id) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      if (order.status === 'cancelled' || order.status === 'refunded') {
        res.status(400).json({ error: 'This order is already cancelled or refunded.' });
        return;
      }
      if (order.returnRequest) {
        res.status(409).json({ error: 'A return request is already active for this order.' });
        return;
      }

      const schema = z.object({ reason: z.string().min(10).max(500) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please explain the reason for your return request (min 10 chars).' });
        return;
      }

      const now = new Date().toISOString();
      order.returnRequest = {
        id: `ret_${crypto.randomBytes(5).toString('hex')}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: req.user!.id,
        reason: parsed.data.reason.trim(),
        status: 'requested',
        createdAt: now,
        updatedAt: now,
      };
      order.updatedAt = now;

      addNotification(
        req.user!.id,
        `Return Request Received (${order.orderNumber})`,
        'Our curatorial team is reviewing your return request and will respond within 24 hours.',
        'order'
      );

      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'RETURN_REQUESTED',
        targetType: 'order',
        targetId: order.orderNumber,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `Patron requested return/refund: ${order.returnRequest.reason}`,
      });

      res.status(201).json({ order });
    }
  );

  router.post(
    '/admin/orders/:id/refund',
    requireAuth,
    requireDualVerified,
    requireRole(['admin']),
    (req: AuthedRequest, res: Response) => {
      const order = store.orders.get(req.params.id);
      if (!order) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      if (order.status === 'refunded') {
        res.status(400).json({ error: 'Order is already refunded.' });
        return;
      }
      const note =
        typeof req.body?.note === 'string' && req.body.note.trim().length > 0
          ? req.body.note.trim()
          : 'Eligible refund initiated by Super Admin.';

      const now = new Date().toISOString();
      order.status = 'refunded';
      order.paymentStatus = 'refunded';
      order.updatedAt = now;
      if (order.returnRequest) {
        order.returnRequest.status = 'refunded';
        order.returnRequest.adminNote = note;
        order.returnRequest.updatedAt = now;
      }
      order.timeline.push({
        status: 'refunded',
        note,
        timestamp: now,
      });

      addNotification(
        order.userId,
        `Refund Processed for ${order.orderNumber}`,
        `₹${order.totalInr.toLocaleString('en-IN')} has been refunded to your original settlement method.`,
        'order'
      );

      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'ORDER_REFUNDED',
        targetType: 'order',
        targetId: order.orderNumber,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `Initiated refund of ₹${order.totalInr} (${note}).`,
      });

      res.json({ order });
    }
  );

  // =========================================================================
  // NOTIFICATIONS & CMS
  // =========================================================================
  router.get('/notifications', requireAuth, (req: AuthedRequest, res: Response) => {
    const mine = store.notifications.filter((n) => n.userId === req.user!.id);
    res.json({
      notifications: mine,
      unreadCount: mine.filter((n) => !n.read).length,
    });
  });

  router.patch('/notifications/:id/read', requireAuth, (req: AuthedRequest, res: Response) => {
    const item = store.notifications.find(
      (n) => n.id === req.params.id && n.userId === req.user!.id
    );
    if (!item) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    item.read = true;
    res.json({ notification: item });
  });

  router.post('/notifications/read-all', requireAuth, (req: AuthedRequest, res: Response) => {
    for (const item of store.notifications) {
      if (item.userId === req.user!.id) item.read = true;
    }
    res.json({ ok: true });
  });

  router.get('/cms', (_req, res) => {
    res.json({ cms: store.cms });
  });

  router.patch(
    '/cms',
    requireAuth,
    requireDualVerified,
    requireRole(['admin']),
    (req: AuthedRequest, res: Response) => {
      const parsed = cmsPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid CMS update.' });
        return;
      }

      if (parsed.data.announcement) {
        store.cms.announcement = { ...store.cms.announcement, ...parsed.data.announcement };
      }
      if (parsed.data.hero) {
        store.cms.hero = { ...store.cms.hero, ...parsed.data.hero };
        if (store.cms.heroSlides[0]) {
          store.cms.heroSlides[0] = {
            ...store.cms.heroSlides[0],
            kicker: parsed.data.hero.kicker,
            headline: parsed.data.hero.headline,
            subheadline: parsed.data.hero.subheadline,
            ctaLabel: parsed.data.hero.ctaLabel,
          };
        }
      }
      if (parsed.data.heritageStory) {
        store.cms.heritageStory = { ...store.cms.heritageStory, ...parsed.data.heritageStory };
      }
      store.cms.updatedAt = new Date().toISOString();
      store.cms.updatedBy = req.user!.email;

      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'CMS_UPDATED',
        targetType: 'cms',
        targetId: 'storefront',
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: 'Updated storefront editorial CMS sections.',
      });

      res.json({ cms: store.cms });
    }
  );

  // =========================================================================
  // ANALYTICS, ADMIN GOVERNANCE, SELLER VERIFICATION, COUPONS & SETTINGS
  // =========================================================================
  router.get(
    '/analytics/seller',
    requireAuth,
    requireRole(['seller', 'admin']),
    (req: AuthedRequest, res: Response) => {
      const user = req.user!;
      const allProducts = Array.from(store.products.values());
      const sellerProducts =
        user.role === 'admin'
          ? allProducts
          : allProducts.filter((p) => p.sellerId === user.id);

      const allOrders = Array.from(store.orders.values());
      const relevantOrders = allOrders.filter(
        (ord) =>
          (ord.paymentStatus === 'captured' || ord.paymentMethod === 'cod') &&
          ord.status !== 'cancelled' &&
          ord.status !== 'refunded' &&
          (user.role === 'admin' || ord.items.some((i) => i.sellerId === user.id))
      );

      let totalRevenueInr = 0;
      const catMap = new Map<string, { revenueInr: number; units: number }>();
      const fulfillmentCounts: Record<OrderStatus, number> = {
        placed: 0,
        confirmed: 0,
        crafted: 0,
        dispatched: 0,
        delivered: 0,
        cancelled: 0,
        refunded: 0,
      };

      for (const ord of allOrders) {
        if (user.role === 'admin' || ord.items.some((i) => i.sellerId === user.id)) {
          fulfillmentCounts[ord.status] += 1;
        }
      }

      for (const ord of relevantOrders) {
        for (const item of ord.items) {
          if (user.role !== 'admin' && item.sellerId !== user.id) continue;
          const rev = item.unitPriceInr * item.quantity;
          totalRevenueInr += rev;
          const prod = store.products.get(item.productId);
          const cat = prod?.category || 'Heritage Craft';
          const prev = catMap.get(cat) || { revenueInr: 0, units: 0 };
          catMap.set(cat, { revenueInr: prev.revenueInr + rev, units: prev.units + item.quantity });
        }
      }

      const commissionPercent = store.adminSettings.commissionPercent;
      const commissionDeductedInr = Math.round((totalRevenueInr * commissionPercent) / 100);
      const netPayoutInr = Math.max(0, totalRevenueInr - commissionDeductedInr);

      const analytics: SellerAnalytics = {
        totalRevenueInr,
        netPayoutInr,
        commissionPercent,
        commissionDeductedInr,
        totalOrders: relevantOrders.length,
        activeListings: sellerProducts.filter((p) => p.status === 'active').length,
        lowStockCount: sellerProducts.filter((p) => p.stock <= p.lowStockThreshold).length,
        avgOrderValueInr:
          relevantOrders.length > 0 ? Math.round(totalRevenueInr / relevantOrders.length) : 0,
        categoryBreakdown: Array.from(catMap.entries()).map(([category, vals]) => ({
          category,
          ...vals,
        })),
        fulfillmentCounts,
      };

      res.json({ analytics });
    }
  );

  router.get(
    '/analytics/admin',
    requireAuth,
    requireRole(['admin']),
    (_req: AuthedRequest, res: Response) => {
      const users = Array.from(store.users.values());
      const products = Array.from(store.products.values());
      const orders = Array.from(store.orders.values());
      const captured = orders.filter(
        (o) => o.paymentStatus === 'captured' || (o.paymentMethod === 'cod' && o.status !== 'cancelled')
      );

      const gmv = captured.reduce((sum, o) => sum + o.totalInr, 0);
      const dualVerifiedCount = users.filter((u) => u.emailVerified && u.phoneVerified).length;

      const originMap = new Map<string, number>();
      for (const ord of captured) {
        for (const item of ord.items) {
          const prod = store.products.get(item.productId);
          const origin = prod?.craftOrigin || 'India';
          originMap.set(origin, (originMap.get(origin) || 0) + item.unitPriceInr * item.quantity);
        }
      }

      const sevenDaysAgo = Date.now() - 7 * 86400_000;
      const analytics: AdminAnalytics = {
        grossMerchandiseValueInr: gmv,
        totalOrders: orders.length,
        totalProducts: products.filter((p) => p.status !== 'archived').length,
        verifiedPatronsCount: users.filter((u) => u.role === 'customer').length,
        activeArtisansCount: users.filter((u) => u.role === 'seller').length,
        pendingSellerApprovalsCount: Array.from(store.sellerApplications.values()).filter(
          (a) => a.status === 'pending'
        ).length,
        pendingPaymentsCount: orders.filter((o) => o.paymentStatus === 'pending').length,
        pendingRefundsCount: orders.filter((o) => o.returnRequest?.status === 'requested').length,
        dualVerifiedPercentage:
          users.length > 0 ? Math.round((dualVerifiedCount / users.length) * 100) : 0,
        lowStockAlertsCount: products.filter((p) => p.stock <= p.lowStockThreshold).length,
        newsletterSubscribersCount: store.newsletterSubscribers.length,
        revenueByOrigin: Array.from(originMap.entries())
          .map(([origin, revenueInr]) => ({ origin, revenueInr }))
          .sort((a, b) => b.revenueInr - a.revenueInr),
        recentOrderCount7d: orders.filter(
          (o) => new Date(o.createdAt).getTime() >= sevenDaysAgo
        ).length,
      };

      res.json({ analytics });
    }
  );

  router.get(
    '/admin/users',
    requireAuth,
    requireRole(['admin']),
    (_req: AuthedRequest, res: Response) => {
      res.json({ users: Array.from(store.users.values()) });
    }
  );

  router.patch(
    '/admin/users/:id/role',
    requireAuth,
    requireDualVerified,
    requireRole(['admin']),
    (req: AuthedRequest, res: Response) => {
      const target = store.users.get(req.params.id);
      if (!target) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      const schema = z.object({
        role: z.enum(['customer', 'seller', 'admin']),
        sellerVerified: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid role assignment.' });
        return;
      }

      const prevRole = target.role;
      target.role = parsed.data.role;
      if (typeof parsed.data.sellerVerified === 'boolean') {
        target.sellerVerified = parsed.data.sellerVerified;
      } else if (parsed.data.role === 'seller') {
        target.sellerVerified = true;
      }
      target.updatedAt = new Date().toISOString();

      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'USER_ROLE_CHANGED',
        targetType: 'user',
        targetId: target.id,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `Changed ${target.email} role from ${prevRole} to ${target.role} (sellerVerified=${target.sellerVerified}).`,
      });

      res.json({ user: target });
    }
  );

  router.patch(
    '/admin/users/:id/status',
    requireAuth,
    requireDualVerified,
    requireRole(['admin']),
    (req: AuthedRequest, res: Response) => {
      const target = store.users.get(req.params.id);
      if (!target) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      if (target.id === req.user!.id) {
        res.status(400).json({ error: 'You cannot suspend your own Super Admin account.' });
        return;
      }
      const suspended = Boolean(req.body?.suspended);
      target.suspended = suspended;
      target.updatedAt = new Date().toISOString();

      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: suspended ? 'USER_SUSPENDED' : 'USER_ACTIVATED',
        targetType: 'user',
        targetId: target.id,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `${suspended ? 'Suspended' : 'Reactivated'} account ${target.email}.`,
      });

      res.json({ user: target });
    }
  );

  // Admin Seller Applications
  router.get(
    '/admin/seller-applications',
    requireAuth,
    requireRole(['admin']),
    (_req: AuthedRequest, res: Response) => {
      res.json({
        applications: Array.from(store.sellerApplications.values()).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        ),
      });
    }
  );

  router.patch(
    '/admin/seller-applications/:id',
    requireAuth,
    requireDualVerified,
    requireRole(['admin']),
    (req: AuthedRequest, res: Response) => {
      const appRecord = store.sellerApplications.get(req.params.id);
      if (!appRecord) {
        res.status(404).json({ error: 'Seller application not found.' });
        return;
      }
      const schema = z.object({
        status: z.enum(['approved', 'rejected']),
        reviewNote: z.string().max(300).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid review decision.' });
        return;
      }

      const now = new Date().toISOString();
      appRecord.status = parsed.data.status;
      appRecord.reviewNote = parsed.data.reviewNote?.trim();
      appRecord.updatedAt = now;

      if (parsed.data.status === 'approved') {
        let sellerUser = findUserByEmail(appRecord.email);
        if (!sellerUser) {
          sellerUser = {
            id: `usr_seller_${crypto.randomBytes(4).toString('hex')}`,
            email: appRecord.email,
            phone: appRecord.phone,
            displayName: appRecord.fullName,
            role: 'seller',
            atelierName: appRecord.businessName,
            craftRegion: appRecord.craftRegion,
            sellerVerified: true,
            suspended: false,
            emailVerified: true,
            phoneVerified: true,
            createdAt: now,
            updatedAt: now,
          };
          store.users.set(sellerUser.id, sellerUser);
        } else {
          sellerUser.role = 'seller';
          sellerUser.atelierName = appRecord.businessName;
          sellerUser.craftRegion = appRecord.craftRegion;
          sellerUser.sellerVerified = true;
          sellerUser.updatedAt = now;
        }
        addNotification(
          sellerUser.id,
          'Atelier Onboarding Approved',
          `Congratulations! ${appRecord.businessName} is now verified to publish heritage editions on VIRAASAT.`,
          'atelier'
        );
      }

      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action:
          parsed.data.status === 'approved' ? 'SELLER_APPROVED' : 'SELLER_REJECTED',
        targetType: 'seller_application',
        targetId: appRecord.id,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `${parsed.data.status.toUpperCase()} seller application for ${appRecord.businessName}.`,
      });

      res.json({ application: appRecord });
    }
  );

  // Admin Product Moderation
  router.patch(
    '/admin/products/:id/moderate',
    requireAuth,
    requireDualVerified,
    requireRole(['admin']),
    (req: AuthedRequest, res: Response) => {
      const product = store.products.get(req.params.id);
      if (!product) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      const schema = z.object({
        approved: z.boolean().optional(),
        featured: z.boolean().optional(),
        status: z.enum(['active', 'draft', 'archived']).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid moderation payload.' });
        return;
      }
      if (typeof parsed.data.approved === 'boolean') product.approved = parsed.data.approved;
      if (typeof parsed.data.featured === 'boolean') product.featured = parsed.data.featured;
      if (parsed.data.status) product.status = parsed.data.status;
      product.updatedAt = new Date().toISOString();

      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'PRODUCT_MODERATED',
        targetType: 'product',
        targetId: product.id,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `Moderated "${product.title}" (approved=${product.approved}, featured=${product.featured}, status=${product.status}).`,
      });

      res.json({ product });
    }
  );

  // Admin Coupons CRUD
  router.get(
    '/admin/coupons',
    requireAuth,
    requireRole(['admin']),
    (_req: AuthedRequest, res: Response) => {
      res.json({ coupons: Array.from(store.coupons.values()) });
    }
  );

  router.post(
    '/admin/coupons',
    requireAuth,
    requireDualVerified,
    requireRole(['admin']),
    (req: AuthedRequest, res: Response) => {
      const parsed = couponCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid coupon payload.' });
        return;
      }
      const code = parsed.data.code.toUpperCase();
      if (store.coupons.has(code)) {
        res.status(409).json({ error: `Coupon code "${code}" already exists.` });
        return;
      }
      const now = new Date().toISOString();
      const coupon: Coupon = {
        id: `cpn_${crypto.randomBytes(5).toString('hex')}`,
        code,
        description: parsed.data.description.trim(),
        type: parsed.data.type,
        value: parsed.data.value,
        minOrderInr: parsed.data.minOrderInr,
        maxDiscountInr: parsed.data.maxDiscountInr,
        active: true,
        redemptionCount: 0,
        expiresAt: new Date(Date.now() + parsed.data.expiresInDays * 86400_000).toISOString(),
        createdAt: now,
      };
      store.coupons.set(code, coupon);
      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'COUPON_CREATED',
        targetType: 'coupon',
        targetId: code,
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `Created coupon ${code} (${coupon.type}: ${coupon.value}).`,
      });
      res.status(201).json({ coupon });
    }
  );

  router.patch(
    '/admin/coupons/:code',
    requireAuth,
    requireDualVerified,
    requireRole(['admin']),
    (req: AuthedRequest, res: Response) => {
      const coupon = store.coupons.get(req.params.code.toUpperCase());
      if (!coupon) {
        res.status(404).json({ error: 'Coupon not found.' });
        return;
      }
      coupon.active = Boolean(req.body?.active);
      res.json({ coupon });
    }
  );

  // Admin Settings & Inquiries
  router.get(
    '/admin/settings',
    requireAuth,
    requireRole(['admin']),
    (_req: AuthedRequest, res: Response) => {
      res.json({ settings: store.adminSettings });
    }
  );

  router.patch(
    '/admin/settings',
    requireAuth,
    requireDualVerified,
    requireRole(['admin']),
    (req: AuthedRequest, res: Response) => {
      const schema = z.object({
        commissionPercent: z.number().min(0).max(40).optional(),
        codEnabled: z.boolean().optional(),
        codMaxOrderInr: z.number().int().min(1000).max(500_000).optional(),
        freeShippingThresholdInr: z.number().int().min(0).max(500_000).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid platform settings.' });
        return;
      }
      store.adminSettings = {
        ...store.adminSettings,
        ...parsed.data,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user!.email,
      };
      addAuditLog({
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'PLATFORM_SETTINGS_UPDATED',
        targetType: 'settings',
        outcome: 'success',
        ipAddress: getClientIp(req),
        detail: `Updated settings: commission=${store.adminSettings.commissionPercent}%, COD=${store.adminSettings.codEnabled}.`,
      });
      res.json({ settings: store.adminSettings });
    }
  );

  router.get(
    '/admin/inquiries',
    requireAuth,
    requireRole(['admin']),
    (_req: AuthedRequest, res: Response) => {
      res.json({
        inquiries: store.contactInquiries,
        subscribers: store.newsletterSubscribers,
      });
    }
  );

  router.get(
    '/admin/audit-logs',
    requireAuth,
    requireRole(['admin']),
    (req: AuthedRequest, res: Response) => {
      const outcome = typeof req.query.outcome === 'string' ? req.query.outcome : 'all';
      const logs =
        outcome === 'all'
          ? store.auditLogs
          : store.auditLogs.filter((l) => l.outcome === outcome);
      res.json({ auditLogs: logs });
    }
  );

  const app = express();
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as AuthedRequest).rawBody = buf.toString('utf8');
      },
    })
  );

  // SEO: robots.txt & dynamic XML sitemap
  app.get('/robots.txt', (req, res) => {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${baseUrl}/sitemap.xml\n`
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const staticPaths = [
      '/',
      '/catalogue',
      '/about',
      '/ateliers',
      '/journal',
      '/seller-registration',
      '/contact',
      '/faq',
      '/privacy-policy',
      '/terms',
      '/return-policy',
      '/shipping-policy',
    ];
    const productUrls = Array.from(store.products.values())
      .filter((p) => p.status === 'active' && p.approved)
      .map((p) => `/product/${p.slug}`);

    const urls = [...staticPaths, ...productUrls]
      .map((u) => `  <url><loc>${baseUrl}${u}</loc><changefreq>weekly</changefreq></url>`)
      .join('\n');

    res
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
      );
  });

  app.use('/api', router);

  return {
    app,
    store,
    secrets: {
      SESSION_SECRET,
      RAZORPAY_KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET,
      SMS_HOOK_SECRET: supabaseCfg.smsHookSecret,
    },
  };
}

async function startServer() {
  const { app } = createViraasatApiApp();

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VIRAASAT server listening on http://localhost:${PORT}`);
  });
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExecution) {
  startServer().catch((err) => {
    console.error('Failed to start VIRAASAT server:', err);
    process.exit(1);
  });
}
