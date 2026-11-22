# VIRAASAT — Luxury Indian Lifestyle & Artisan Marketplace

VIRAASAT is a full-stack Indian heritage lifestyle and artisan marketplace connecting patrons directly with GI-certified master ateliers across Varanasi, Jaipur, Srinagar, Moradabad, Kannauj, and Kutch.

## Architecture Overview

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Motion animations, dynamic SEO & Schema.org JSON-LD (`Organization`, `Product`, `BreadcrumbList`).
- **Backend**: Express + TypeScript API server (`server.ts`) with Zod request validation, HMAC-SHA256 signed sessions, sliding-window rate limiting, CSRF header protection (`X-Requested-With`), CSP & security headers, idempotent checkout order creation, and raw-body Razorpay webhook signature verification.
- **Database & Security Rules**:
  - Provisioned **Firebase Firestore & Authentication** with ESLint-validated, deployed `firestore.rules` and `firebase-blueprint.json`.
  - Complete 29-table normalized **PostgreSQL / Supabase SQL Migration & RLS policies** included in `supabase/migrations/001_initial_schema.sql`.
- **Roles & Portals**:
  - **Patron (Customer) Dashboard**: Profile editing, dual email & phone OTP status, saved addresses, order tracking, payment history, return & refund requests, wishlist, notification preferences.
  - **Artisan Atelier (Seller) Studio**: Seller KYC onboarding & approval gate, product publishing/editing/archiving, vault inventory management, order fulfillment with tracking numbers, commission & payout analytics.
  - **Super Admin Console**: Live GMV & KPI analytics, pending seller KYC approvals, account suspension & RBAC, product moderation, refunds & return handling, coupon management, Razorpay webhook signature verifier, CMS & banner management, platform settings (commission %, COD toggle), contact/newsletter inbox, and immutable security audit logs.

## Local Development

```bash
npm install
npm run dev
```

The full-stack server runs on `http://localhost:3000`.

## Automated Testing & Quality Checks

```bash
npm test                     # Unit & API security/commerce/RLS tests
npm run lint                 # TypeScript strict type-checking (tsc --noEmit)
npx eslint firestore.rules   # Firebase security rules static audit
npm run build                # Production Vite bundle verification
```

## External Integrations & Production Readiness Checklist

This application implements the real backend verification paths, cryptographic HMAC checks, and provider hooks. **Before deploying to live production**, configure all external credentials in your hosting environment (see `.env.example`):

1. **Cryptographic Secrets**: Set strong random 32-byte hex strings for `SESSION_SECRET` and `OTP_HMAC_SECRET`.
2. **Email OTP (Resend / SMTP)**: Configure `RESEND_API_KEY` (or `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) and wire your production email transport so preview OTP dispatch is disabled when `NODE_ENV=production`.
3. **Phone SMS OTP (MSG91 / Twilio)**: Configure `MSG91_AUTH_KEY` + `MSG91_TEMPLATE_ID` or `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER`.
4. **Razorpay Live Payments & Webhooks**: Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`, then point Razorpay webhook events (`payment.captured`, `payment.refunded`) to `https://<your-domain>/api/webhooks/razorpay`.
5. **Managed Database**:
   - **Firebase**: Review and harden `firestore.rules` for your production traffic and deploy via Firebase CLI (`firebase deploy --only firestore:rules`).
   - **Supabase / PostgreSQL**: Run `supabase/migrations/001_initial_schema.sql` against your Supabase project and connect server repositories with `SUPABASE_SERVICE_ROLE_KEY` strictly on the server.
