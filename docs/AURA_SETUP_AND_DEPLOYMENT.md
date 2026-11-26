# AURA — Setup, Supabase Migration & Deployment Guide

## 1. Environment Variables
Configure the following variables in **Settings → Secrets** (or `.env` locally; never commit real secrets):

| Variable | Scope | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Server only | Google Gemini (`gemini-4-hydrogen`) for AI Aura Assistant & Moodboard palettes |
| `APP_URL` | Server | Canonical URL for SEO & password reset redirects |
| `SUPABASE_URL` | Server | Supabase Project URL (`https://<project-ref>.supabase.co`) |
| `SUPABASE_ANON_KEY` | Server | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Server-side profile sync, storage upload & admin token revocation |
| `VITE_SUPABASE_URL` | Browser-safe | Public Supabase URL for optional direct client calls |
| `VITE_SUPABASE_ANON_KEY` | Browser-safe | Public Supabase anon key only |
| `ADMIN_EMAILS` | Server only | Comma-separated verified emails granted Admin Content Studio privileges |
| `MSG91_AUTH_KEY` | Server only | MSG91 API key for Indian `+91` SMS OTP delivery |
| `MSG91_OTP_TEMPLATE_ID` | Server only | Approved MSG91 DLT OTP template ID |
| `SUPABASE_SMS_HOOK_SECRET` | Server only | Standard Webhooks secret (`v1,whsec_...`) for `/api/webhooks/supabase/send-sms` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Optional | Cloudflare Turnstile bot protection on OTP sends |

## 2. Database & Storage Migration
Run `/supabase/migrations/003_aura_platform_schema.sql` in the **Supabase SQL Editor** (or via `supabase db push`).
It provisions:
- All 13 tables: `profiles`, `categories`, `moods`, `tags`, `stories`, `story_sections`, `story_tags`, `story_moods`, `collections`, `collection_items`, `moodboards`, `moodboard_items`, `user_preferences`.
- Full-text `tsvector` + trigram search indexes on `stories`.
- Strict Row Level Security (RLS) policies: public read for published stories/categories, owner-only write for collections/moodboards/profiles/preferences, and `public.is_aura_admin()` enforcement for editorial CMS writes.
- Three Storage buckets (`story-covers`, `user-avatars`, `moodboard-assets`) with MIME allowlists and file-size caps.

## 3. Authentication Providers (Supabase Auth)
1. **Email OTP (Resend SMTP)**: Configure Resend SMTP in **Supabase Dashboard → Authentication → SMTP Settings** and set your email template to render `{{ .Token }}` (6-digit OTP, 300s expiry).
2. **Indian `+91` SMS OTP (MSG91)**: Enable **Custom Send SMS Hook** in Supabase Auth pointing to `<APP_URL>/api/webhooks/supabase/send-sms` with `SUPABASE_SMS_HOOK_SECRET`.
3. **Email & Password + Password Reset**: Enabled via Supabase Email provider with redirect URL `<APP_URL>/auth/sign-in`.

## 4. Production Build & Deployment
```bash
npm run build
npm run start
```
The Express server serves the compiled Vite SPA bundle, static editorial photography, API routes, and SPA fallback for all AURA routes on port `3000` (or `process.env.PORT`).
