-- ============================================================================
-- VIRAASAT — Migration 002: Supabase Auth as Single Source of Truth (Dual OTP)
-- Connects public.profiles directly to auth.users, removes any custom OTP table,
-- tracks email_verified / phone_verified timestamps, account_status, user_role,
-- and enforces strict Row-Level Security (RLS).
-- ============================================================================

-- 1. Account lifecycle status enum
DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM (
    'pending_verification',
    'active',
    'suspended'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Remove legacy custom OTP table (Supabase Auth is the single source of truth)
DROP TABLE IF EXISTS public.user_verifications CASCADE;

-- 3. Ensure public.profiles carries authoritative verification & role columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_status public.account_status NOT NULL DEFAULT 'pending_verification',
  ADD COLUMN IF NOT EXISTS user_role public.user_role NOT NULL DEFAULT 'customer';

-- Link profiles.id to auth.users(id) when applied on Supabase PostgreSQL
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_id_auth_users_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_auth_users_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- Allows schema linting outside Supabase where auth schema may not exist
  NULL;
END $$;

-- Enforce data integrity: active accounts require both email & phone verified
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_active_requires_dual_verification;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_active_requires_dual_verification
  CHECK (
    account_status <> 'active'
    OR (
      email_verified = TRUE
      AND phone_verified = TRUE
      AND email_verified_at IS NOT NULL
      AND phone_verified_at IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles (account_status);
CREATE INDEX IF NOT EXISTS idx_profiles_user_role ON public.profiles (user_role);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles (phone) WHERE phone IS NOT NULL;

-- 4. Sync trigger: automatically create/update public.profiles from auth.users
-- ONLY Supabase Auth's email_confirmed_at and phone_confirmed_at set verified flags.
CREATE OR REPLACE FUNCTION public.sync_profile_from_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_phone TEXT;
  v_display_name TEXT;
  v_email_verified BOOLEAN;
  v_phone_verified BOOLEAN;
  v_status public.account_status;
  v_role public.user_role;
BEGIN
  v_email := LOWER(COALESCE(NEW.email, ''));
  v_phone := CASE
    WHEN NEW.phone IS NULL OR NEW.phone = '' THEN NULL
    WHEN LEFT(NEW.phone, 1) = '+' THEN NEW.phone
    ELSE '+' || NEW.phone
  END;

  v_display_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'display_name', '')), '');
  IF v_display_name IS NULL THEN
    v_display_name := COALESCE(NULLIF(SPLIT_PART(v_email, '@', 1), ''), 'VIRAASAT Patron');
  END IF;

  v_email_verified := (NEW.email_confirmed_at IS NOT NULL);
  v_phone_verified := (NEW.phone_confirmed_at IS NOT NULL);

  v_status := CASE
    WHEN v_email_verified AND v_phone_verified THEN 'active'::public.account_status
    ELSE 'pending_verification'::public.account_status
  END;

  v_role := 'customer'::public.user_role;

  INSERT INTO public.profiles (
    id,
    email,
    phone,
    display_name,
    email_verified,
    phone_verified,
    email_verified_at,
    phone_verified_at,
    account_status,
    user_role,
    suspended,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_email,
    v_phone,
    v_display_name,
    v_email_verified,
    v_phone_verified,
    NEW.email_confirmed_at,
    NEW.phone_confirmed_at,
    v_status,
    v_role,
    FALSE,
    COALESCE(NEW.created_at, NOW()),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(EXCLUDED.email, ''), public.profiles.email),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    email_verified = EXCLUDED.email_verified,
    phone_verified = EXCLUDED.phone_verified,
    email_verified_at = EXCLUDED.email_verified_at,
    phone_verified_at = EXCLUDED.phone_verified_at,
    account_status = CASE
      WHEN public.profiles.suspended = TRUE THEN 'suspended'::public.account_status
      WHEN EXCLUDED.email_verified AND EXCLUDED.phone_verified THEN 'active'::public.account_status
      ELSE 'pending_verification'::public.account_status
    END,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created_or_verified ON auth.users;
  CREATE TRIGGER on_auth_user_created_or_verified
    AFTER INSERT OR UPDATE OF email, phone, email_confirmed_at, phone_confirmed_at, raw_user_meta_data
    ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_from_auth_user();
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

-- 5. Hardened Row-Level Security on public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_admin_select_all ON public.profiles;
CREATE POLICY profiles_admin_select_all
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.user_role = 'admin'
        AND p.account_status = 'active'
    )
  );

-- Users may ONLY update display_name and notification_preferences.
-- Verification flags, timestamps, account_status, suspended, and user_role are immutable to clients.
DROP POLICY IF EXISTS profiles_update_own_safe ON public.profiles;
CREATE POLICY profiles_update_own_safe
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND email_verified = (SELECT email_verified FROM public.profiles WHERE id = auth.uid())
    AND phone_verified = (SELECT phone_verified FROM public.profiles WHERE id = auth.uid())
    AND email_verified_at IS NOT DISTINCT FROM (SELECT email_verified_at FROM public.profiles WHERE id = auth.uid())
    AND phone_verified_at IS NOT DISTINCT FROM (SELECT phone_verified_at FROM public.profiles WHERE id = auth.uid())
    AND account_status = (SELECT account_status FROM public.profiles WHERE id = auth.uid())
    AND user_role = (SELECT user_role FROM public.profiles WHERE id = auth.uid())
    AND suspended = (SELECT suspended FROM public.profiles WHERE id = auth.uid())
  );

-- 6. Helper function for RLS policies across orders / seller listings:
-- Require BOTH email and phone verified AND active account status.
CREATE OR REPLACE FUNCTION public.is_dual_verified_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND email_verified = TRUE
      AND phone_verified = TRUE
      AND email_verified_at IS NOT NULL
      AND phone_verified_at IS NOT NULL
      AND account_status = 'active'
      AND suspended = FALSE
  );
$$;
