# Dual-Channel Passwordless OTP Account Registration

A production-oriented, responsive, passwordless account registration application requiring dual-channel 6-digit OTP verification across **Email (Resend REST API)** and **Indian Mobile `+91` (MSG91 OTP API v5)**, backed by HMAC-SHA-256 hashed OTP challenges, signed HS256 JWT verification tokens, persistent SQL storage, and atomic account creation.

## Architecture & Project Structure

```text
migrations/
  001_initial_schema.sql          # Production PostgreSQL schema, indexes, constraints & cleanup routine
  001_sqlite_schema.sql           # Persistent SQLite schema used in local & AI Studio preview runtime
src/
  client/
    components/                   # ProgressStepper, StatusBanner, OtpInput, CountdownTimer, Email/Mobile steps, Success, ErrorBoundary, Toasts
    hooks/                        # useCountdown, useToast
    pages/                        # RegistrationPage (420px centered card)
    services/                     # Typed REST API layer (fetch + CSRF header)
    types/                        # Shared client TypeScript contracts
    utils/                        # Full name, email & Indian +91 mobile normalization/validation
  server/
    config/env.ts                 # Environment loader (DEMO_MODE defaults to false in production)
    controllers/                  # otpController, authController
    database/db.ts                # Persistent SQLite repository with atomic transactions & cleanup
    middleware/                   # Helmet, strict CORS, signed HttpOnly session cookies, CSRF check, persistent IP rate limiter
    routes/                       # /api/otp/* and /api/auth/*
    services/                     # emailService (Resend), smsService (MSG91 v5), otpService, registrationService
    utils/                        # Cryptographic OTP generator, HMAC-SHA-256 hashing, timingSafeEqual, HS256 JWTs
    validators/                   # Strict Zod schemas
    app.ts                        # Express app factory
    acceptance.test.ts            # Automated test suite covering all 17 acceptance criteria
server.ts                         # Express + Vite middleware (dev) / static dist (prod) entry point
```

## API Endpoints

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check and sanitized runtime status |
| `GET` | `/api/config` | Public configuration (`demoMode`, expiry/cooldown seconds, provider readiness) |
| `GET` | `/api/auth/session` | Restores server-validated verification progress across page refreshes |
| `POST` | `/api/auth/session/reset` | Revokes active verification tokens so a user can restart with a new email/mobile |
| `POST` | `/api/otp/send-email` | Validates name & email, enforces rate limits/cooldown, hashes OTP, dispatches via Resend |
| `POST` | `/api/otp/send-sms` | Validates & normalizes Indian `+91` mobile, hashes OTP, dispatches via MSG91 OTP API v5 |
| `POST` | `/api/otp/verify` | Verifies 6-digit OTP (timing-safe HMAC-SHA-256), enforces 5-attempt lockout, issues HS256 JWT |
| `POST` | `/api/auth/register` | Validates both signed JWTs, verifies shared session & one-time consumption, creates user atomically |

## Installation & Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Generate high-entropy secrets for `JWT_SECRET` and `OTP_HASH_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Keep `DEMO_MODE=true` for local testing without external Resend/MSG91 keys.
3. **Run development server**:
   ```bash
   PORT=3000 npm run dev
   ```
   Open `http://localhost:3000`. In `DEMO_MODE=true`, generated OTPs are logged to the server console and `123456` is accepted as the demo shortcut.
4. **Run automated acceptance tests (all 17 scenarios)**:
   ```bash
   npm test
   ```

## Google AI Studio Preview Instructions

- The Express + Vite server automatically runs on port `3000` in the AI Studio preview environment.
- Because `NODE_ENV` is not `production` in preview, `DEMO_MODE` starts enabled so you can test the full end-to-end flow immediately (enter `123456` for both email and `+91` mobile OTPs).
- Persistent SQL storage runs out-of-the-box via Node's built-in SQLite (`data/dual-otp-auth.sqlite`) with WAL mode, unique indexes, and atomic transactions.
- To test live Resend and MSG91 delivery in preview, set `DEMO_MODE=false`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `JWT_SECRET`, and `OTP_HASH_SECRET` in **Settings → Secrets**.

## Production Deployment Instructions

1. **Provision PostgreSQL** and apply the production schema migration:
   ```bash
   psql "$DATABASE_URL" -f migrations/001_initial_schema.sql
   ```
   > **Note on Multi-Instance Deployments**: The built-in preview runtime persists to local SQLite (`src/server/database/db.ts`) so it works with zero external setup in Google AI Studio. For multi-instance horizontal production deployments, point your database adapter to PostgreSQL using `migrations/001_initial_schema.sql` and a shared store (PostgreSQL/Redis) for rate limits so state is shared across instances.
2. **Configure Production Environment Variables**:
   - `NODE_ENV=production` (`DEMO_MODE` automatically defaults to `false`)
   - `RESEND_API_KEY` & verified `RESEND_FROM_EMAIL`
   - `MSG91_AUTH_KEY` & DLT-approved `MSG91_TEMPLATE_ID`
   - `JWT_SECRET` & `OTP_HASH_SECRET` (32+ random bytes each)
   - `DATABASE_URL` & `CLIENT_ORIGIN`
3. **Build & Start**:
   ```bash
   npm run build
   npm start
   ```
