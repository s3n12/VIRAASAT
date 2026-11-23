# VIRAASAT — Real Supabase Auth Dual OTP Setup Guide (Resend SMTP + MSG91 SMS Hook)

VIRAASAT uses **Supabase Auth** as the single source of truth for passwordless 6-digit Email OTP and Indian (`+91`) Phone SMS OTP. There is **no** custom OTP table, **no** demo OTP bypass, and **no** auto-verification.

---

## 1. Where to Obtain Every Required Credential

### A. Your Existing Supabase Project
1. Sign in to [Supabase Dashboard](https://supabase.com/dashboard) and open your existing project.
2. Navigate to **Project Settings → API**:
   - **Project URL** → set as `SUPABASE_URL` (and `VITE_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`).
   - **`anon` `public` key** → set as `SUPABASE_ANON_KEY` (and `VITE_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
   - **`service_role` `secret` key** → set as `SUPABASE_SERVICE_ROLE_KEY` (**server-only**, NEVER prefix with `VITE_` or `NEXT_PUBLIC_`).

### B. Resend Custom SMTP (Real Email OTP Delivery)
1. Sign in to [Resend Dashboard](https://resend.com).
2. Go to **Domains → Add Domain** and verify your sending domain's DNS records (SPF, DKIM, DMARC).
3. Go to **API Keys → Create API Key** (permission: **Sending access**) → copy `re_...` as `RESEND_API_KEY`.
4. Open your **Supabase Dashboard → Project Settings → Authentication → SMTP Settings**:
   - Enable **Custom SMTP**
   - **Host**: `smtp.resend.com`
   - **Port**: `465` (SSL) or `587` (STARTTLS)
   - **Username**: `resend`
   - **Password**: `<YOUR_RESEND_API_KEY>`
   - **Sender Email**: `auth@<your-verified-domain>`
   - **Sender Name**: `VIRAASAT Concierge`
5. Go to **Supabase Dashboard → Authentication → Providers → Email**:
   - Enable **Email** and **Confirm email**
   - Set **Email OTP Expiration** to `300` seconds (**5 minutes**)
   - Set **Email OTP Length** to `6`
   - Set **Minimum interval per user** to `60` seconds
6. Go to **Supabase Dashboard → Authentication → Email Templates**:
   - Open both **Magic Link** and **Confirm signup** templates.
   - Set Subject: `Your VIRAASAT Verification Code: {{ .Token }}`
   - Paste the HTML from `/supabase/templates/email-otp.html` (which renders `{{ .Token }}` cleanly in VIRAASAT's ivory, burgundy, and antique gold layout).

### C. MSG91 SMS OTP + Supabase Custom Send SMS Hook (Indian `+91` Numbers)
1. Sign in to [MSG91 Dashboard](https://control.msg91.com):
   - Go to **Authkey** → copy your key as `MSG91_AUTH_KEY` (**server-only**).
   - Register your **DLT Entity ID**, **Sender ID** (e.g., `VRSATP`), and an **Approved DLT OTP SMS Template** (for example: `Your VIRAASAT verification code is ##otp##. Valid for 5 minutes. Do not share this OTP with anyone.`).
   - Go to **SMS → Templates / OneAPI Flow** → copy the approved **Template ID** as `MSG91_TEMPLATE_ID`.
   - Ensure the template variable name matches `MSG91_OTP_VAR_NAME` (default `otp`; both `otp` and `var1` are populated automatically).
2. Configure the **Supabase Custom Send SMS Hook**:
   - Go to **Supabase Dashboard → Authentication → Providers → Phone** and enable **Phone** (set SMS OTP expiry to `300` seconds and minimum resend interval to `60` seconds).
   - Go to **Supabase Dashboard → Authentication → Hooks (Beta) → Send SMS Hook** and enable **HTTPS** or **Supabase Edge Function**:
     - **Option 1 (Direct App HTTPS Webhook)**: Point URI to `https://<YOUR_APP_DOMAIN>/api/webhooks/supabase/send-sms`.
     - **Option 2 (Supabase Edge Function)**: Deploy `/supabase/functions/send-sms-hook/index.ts` via:
       ```bash
       supabase functions deploy send-sms-hook --no-verify-jwt
       supabase secrets set SUPABASE_SMS_HOOK_SECRET="v1,whsec_..." MSG91_AUTH_KEY="..." MSG91_TEMPLATE_ID="..."
       ```
       Then select `send-sms-hook` in Supabase Auth Hooks.
   - Click **Generate Secret** in Supabase Auth Hooks → copy the `v1,whsec_...` value and set it as `SUPABASE_SMS_HOOK_SECRET` (**server-only**).

### D. Cloudflare Turnstile Bot Protection (Recommended)
1. Open [Cloudflare Dashboard](https://dash.cloudflare.com) → **Turnstile → Add Widget**.
2. Add your application hostname(s).
3. Copy **Site Key** → set as `VITE_TURNSTILE_SITE_KEY`.
4. Copy **Secret Key** → set as `TURNSTILE_SECRET_KEY` (**server-only**) and also configure it under **Supabase Dashboard → Authentication → Attack Protection → Enable Captcha protection (Cloudflare Turnstile)**.

---

## 2. Apply PostgreSQL Database Migrations to Your Existing Supabase Project

Run both migrations in **Supabase Dashboard → SQL Editor** (or via `supabase db push`):
1. `/supabase/migrations/001_initial_schema.sql` — Full normalized marketplace tables & RLS policies.
2. `/supabase/migrations/002_supabase_auth_dual_otp.sql` — Links `public.profiles` directly to `auth.users(id)`, removes the legacy custom OTP table, adds `email_verified_at`, `phone_verified_at`, `account_status`, and `user_role`, attaches automatic `auth.users` verification sync triggers, and enforces RLS preventing client-side tampering with verification flags or roles.

---

## 3. Configure Secrets in AI Studio / Hosting

Set these environment variables in **Settings → Secrets** (or your Vercel / Cloud Run environment):

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Server | Your existing Supabase project URL |
| `SUPABASE_ANON_KEY` | Server | Supabase anon key for auth flows |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only secret** | Validates JWTs & syncs `public.profiles` |
| `SUPABASE_SMS_HOOK_SECRET` | **Server-only secret** | Verifies Standard Webhooks signature from Supabase |
| `MSG91_AUTH_KEY` | **Server-only secret** | Authenticates server-to-server MSG91 SMS delivery |
| `MSG91_TEMPLATE_ID` | Server | DLT-approved MSG91 OTP Flow Template ID |
| `RESEND_API_KEY` | **Server-only / Supabase SMTP** | Configured inside Supabase Custom SMTP |
| `TURNSTILE_SECRET_KEY` | **Server-only secret** | Cloudflare Turnstile server-side verification |
| `VITE_TURNSTILE_SITE_KEY` | Public client | Renders Turnstile CAPTCHA in AuthModal |
| `VITE_SUPABASE_URL` | Public client | Optional browser Supabase client |
| `VITE_SUPABASE_ANON_KEY` | Public client | Optional browser Supabase client |

---

## 4. Real Delivery Verification Checklist (After Adding Credentials)

1. Confirm `GET /api/auth/config` returns:
   `{ "supabaseAuthConfigured": true, "smsHookConfigured": true, "msg91Configured": true }`.
2. **Real Email OTP Test**:
   - Open **Sign In / Register → Register (Dual OTP)**.
   - Enter your full name and a real email inbox you control.
   - Click **Send Email OTP** → verify the branded VIRAASAT email arrives via Resend SMTP and check **Resend Dashboard → Emails** for `Delivered`.
   - Enter an intentionally wrong 6-digit code first → confirm error message & remaining attempts counter.
   - Enter the real 6-digit code → confirm `email_verified = true`, `email_verified_at` populated in Supabase `public.profiles`, and `account_status = 'pending_verification'`.
3. **Real Indian `+91` Phone SMS OTP Test**:
   - In Step 2, enter a real 10-digit Indian mobile number (`+91`).
   - Click **Send SMS OTP** → verify Supabase Auth calls the Send SMS Hook, MSG91 delivers the exact 6-digit SMS to your handset, and `phone_verified` remains `false` in `public.profiles` until verified.
   - Enter the received 6-digit SMS code → click **Verify & Activate**.
   - Confirm `phone_verified = true`, `phone_verified_at` populated, `account_status = 'active'`, and automatic redirect to the Customer Dashboard.
4. **Real Login & Logout Test**:
   - Click **Sign Out** → confirm session is revoked and `/api/auth/me` returns HTTP `401`.
   - Sign in again via **Sign In → Registered Email OTP** or **Registered +91 Phone OTP** → confirm role-based redirect (`customer` / `seller` / `admin` dashboard).
