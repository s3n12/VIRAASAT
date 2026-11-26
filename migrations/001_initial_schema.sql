-- =============================================================================
-- Dual-Channel Passwordless OTP Registration — Production PostgreSQL Schema
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Verified User Accounts
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2 AND char_length(full_name) <= 120),
  email             TEXT NOT NULL UNIQUE,
  normalized_mobile TEXT NOT NULL UNIQUE CHECK (normalized_mobile ~ '^\+91[6-9][0-9]{9}$'),
  email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  mobile_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_both_channels_verified CHECK (email_verified = TRUE AND mobile_verified = TRUE)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_normalized_mobile ON users (normalized_mobile);

-- 2. OTP Challenges (stores ONLY peppered HMAC-SHA-256 OTP hashes, never plaintext)
CREATE TABLE IF NOT EXISTS otp_challenges (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_session_id TEXT NOT NULL,
  channel                 TEXT NOT NULL CHECK (channel IN ('email', 'mobile')),
  identifier              TEXT NOT NULL,
  full_name               TEXT,
  otp_hash                TEXT NOT NULL,
  expires_at              TIMESTAMPTZ NOT NULL,
  last_sent_at            TIMESTAMPTZ NOT NULL,
  attempts                INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts            INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  verified_at             TIMESTAMPTZ,
  consumed_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_lookup
  ON otp_challenges (registration_session_id, channel, identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_identifier_channel
  ON otp_challenges (channel, identifier, last_sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_expires_at
  ON otp_challenges (expires_at);

-- 3. Server-Side Signed Verification Token Ledger (prevents token replay & enforces atomic consumption)
CREATE TABLE IF NOT EXISTS verification_tokens (
  jti                     TEXT PRIMARY KEY,
  registration_session_id TEXT NOT NULL,
  channel                 TEXT NOT NULL CHECK (channel IN ('email', 'mobile')),
  identifier              TEXT NOT NULL,
  full_name               TEXT,
  expires_at              TIMESTAMPTZ NOT NULL,
  consumed_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_session
  ON verification_tokens (registration_session_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_expires_at
  ON verification_tokens (expires_at);

-- 4. Distributed Rate-Limit Events (per IP, email, and mobile)
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id          BIGSERIAL PRIMARY KEY,
  bucket_key  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_bucket_created
  ON rate_limit_events (bucket_key, created_at DESC);

-- 5. Updated-At Trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 6. Periodic Cleanup Routine (schedule via pg_cron or application worker)
CREATE OR REPLACE FUNCTION cleanup_expired_otp_records()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
  step_count INTEGER := 0;
BEGIN
  DELETE FROM otp_challenges
   WHERE expires_at < NOW() - INTERVAL '1 hour'
     AND (consumed_at IS NOT NULL OR verified_at IS NULL);
  GET DIAGNOSTICS step_count = ROW_COUNT;
  deleted_count := deleted_count + step_count;

  DELETE FROM verification_tokens
   WHERE expires_at < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS step_count = ROW_COUNT;
  deleted_count := deleted_count + step_count;

  DELETE FROM rate_limit_events
   WHERE created_at < NOW() - INTERVAL '2 hours';
  GET DIAGNOSTICS step_count = ROW_COUNT;
  deleted_count := deleted_count + step_count;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
