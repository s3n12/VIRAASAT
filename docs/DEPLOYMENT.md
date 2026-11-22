# VIRAASAT — Architecture, Security & Deployment Guide

## Overview
VIRAASAT is a full-stack luxury Indian heritage lifestyle and artisan marketplace featuring:
- **Dual Email + Phone OTP Authentication** (HMAC-SHA256 hashed 6-digit codes, 5-minute TTL, 45-second resend cooldown, 5-attempt lock, sliding-window rate limiting, anti-enumeration uniform responses) + optional **Firebase Google Sign-In**.
- **Strict Server-Side Authorization & Dual Verification Gate**: Checkout, Razorpay order creation, payment verification, seller product/inventory mutations, and admin actions require both `emailVerified === true` and `phoneVerified === true`.
- **Role-Based Access Control (RBAC)**: Distinct Customer, Seller (Artisan Atelier), and Admin roles enforced on both server API middleware and Firestore Security Rules (`firestore.rules`).
- **Razorpay Payments & Webhook Verification**: Server-authoritative cart pricing (12% GST + insured courier waiver above ₹25,000), HMAC-SHA256 payment signature verification (`crypto.timingSafeEqual`), and raw-body `x-razorpay-signature` webhook verification with idempotency.
- **Database Persistence & Reference Migrations**:
  - Live cloud database provisioned on **Firebase Firestore** (`firebase-blueprint.json`, `firestore.rules`, `src/lib/firebase.ts`).
  - Complete **PostgreSQL / Supabase SQL migration & Row-Level Security (RLS) policy script** included in `supabase/migrations/001_initial_schema.sql`.

## Environment Variables
Copy `.env.example` to your server environment secrets panel (never prefix private secrets with `VITE_`):
- `SESSION_SECRET`: 32+ byte random secret for signing Bearer session tokens.
- `OTP_HMAC_SECRET`: 32+ byte random secret for HMAC hashing OTP codes.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`: Razorpay live/test credentials and webhook signing secret.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: Transactional email OTP delivery.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`: SMS OTP delivery.

## Running & Testing Locally
```bash
npm install
npm test          # Runs security, commerce, and Firestore rules unit tests
npm run lint      # TypeScript strict type-checking (tsc --noEmit)
npx eslint firestore.rules
npm run build     # Builds production Vite bundle to dist/
npm start         # Runs Express + static production bundle on port 3000
```

## Production Readiness Checklist
Before enabling live monetary transactions in production:
1. Configure `SESSION_SECRET`, `OTP_HMAC_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in your hosting secret manager.
2. Connect production SMTP (e.g. Resend / SES) and SMS (e.g. Twilio / MSG91) providers so OTP preview delivery is disabled automatically (`NODE_ENV=production`).
3. Configure Razorpay webhook URL to `https://<your-domain>/api/webhooks/razorpay` for `payment.captured` and `payment.refunded` events.
4. Review and harden `firestore.rules` (or apply `supabase/migrations/001_initial_schema.sql` if deploying to Supabase PostgreSQL).
