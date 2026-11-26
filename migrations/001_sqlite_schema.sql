-- =============================================================================
-- Dual-Channel Passwordless OTP Registration — Persistent SQLite Schema
-- =============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  full_name         TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  normalized_mobile TEXT NOT NULL UNIQUE,
  email_verified    INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  mobile_verified   INTEGER NOT NULL DEFAULT 0 CHECK (mobile_verified IN (0, 1)),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_normalized_mobile ON users (normalized_mobile);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id                      TEXT PRIMARY KEY,
  registration_session_id TEXT NOT NULL,
  channel                 TEXT NOT NULL CHECK (channel IN ('email', 'mobile')),
  identifier              TEXT NOT NULL,
  full_name               TEXT,
  otp_hash                TEXT NOT NULL,
  expires_at_ms           INTEGER NOT NULL,
  last_sent_at_ms         INTEGER NOT NULL,
  attempts                INTEGER NOT NULL DEFAULT 0,
  max_attempts            INTEGER NOT NULL DEFAULT 5,
  verified_at_ms          INTEGER,
  consumed_at_ms          INTEGER,
  created_at_ms           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_session_channel
  ON otp_challenges (registration_session_id, channel, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_identifier_channel
  ON otp_challenges (channel, identifier, last_sent_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_expires
  ON otp_challenges (expires_at_ms);

CREATE TABLE IF NOT EXISTS verification_tokens (
  jti                     TEXT PRIMARY KEY,
  registration_session_id TEXT NOT NULL,
  channel                 TEXT NOT NULL CHECK (channel IN ('email', 'mobile')),
  identifier              TEXT NOT NULL,
  full_name               TEXT,
  signed_jwt              TEXT NOT NULL,
  expires_at_ms           INTEGER NOT NULL,
  consumed_at_ms          INTEGER,
  created_at_ms           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_session
  ON verification_tokens (registration_session_id, channel, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_expires
  ON verification_tokens (expires_at_ms);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_key    TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket_time
  ON rate_limit_events (bucket_key, created_at_ms DESC);
