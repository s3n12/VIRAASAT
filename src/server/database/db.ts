import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { OtpChannel } from '../utils/crypto.ts';

export interface UserRecord {
  id: string;
  fullName: string;
  email: string;
  normalizedMobile: string;
  emailVerified: boolean;
  mobileVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OtpChallengeRecord {
  id: string;
  registrationSessionId: string;
  channel: OtpChannel;
  identifier: string;
  fullName: string | null;
  otpHash: string;
  expiresAtMs: number;
  lastSentAtMs: number;
  attempts: number;
  maxAttempts: number;
  verifiedAtMs: number | null;
  consumedAtMs: number | null;
  createdAtMs: number;
}

export interface VerificationTokenRecord {
  jti: string;
  registrationSessionId: string;
  channel: OtpChannel;
  identifier: string;
  fullName: string | null;
  signedJwt: string;
  expiresAtMs: number;
  consumedAtMs: number | null;
  createdAtMs: number;
}

export class RegistrationDatabase {
  private readonly db: DatabaseSync;
  private cleanupTimer: NodeJS.Timeout | null = null;
  public readonly filePath: string;

  constructor(sqlitePath: string) {
    this.filePath = sqlitePath;
    if (sqlitePath !== ':memory:') {
      fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
    }
    this.db = new DatabaseSync(sqlitePath);
    this.runMigrations();
  }

  private runMigrations(): void {
    const schemaPath = path.resolve(process.cwd(), 'migrations', '001_sqlite_schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    this.db.exec(sql);
  }

  public startCleanupSchedule(intervalMs = 15 * 60 * 1000): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanupExpiredRecords(Date.now());
      } catch {
        // Ignore cleanup errors on shutdown
      }
    }, intervalMs);
    this.cleanupTimer.unref();
  }

  public close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.db.close();
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  public findUserByEmail(email: string): UserRecord | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
      .get(email) as Record<string, unknown> | undefined;
    return row ? this.mapUserRow(row) : null;
  }

  public findUserByMobile(normalizedMobile: string): UserRecord | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE normalized_mobile = ? LIMIT 1')
      .get(normalizedMobile) as Record<string, unknown> | undefined;
    return row ? this.mapUserRow(row) : null;
  }

  public countUsers(): number {
    const row = this.db.prepare('SELECT COUNT(*) as total FROM users').get() as { total: number };
    return Number(row?.total ?? 0);
  }

  // ---------------------------------------------------------------------------
  // OTP Challenges
  // ---------------------------------------------------------------------------

  public insertOtpChallenge(record: OtpChallengeRecord): void {
    this.db
      .prepare(
        `INSERT INTO otp_challenges (
          id, registration_session_id, channel, identifier, full_name, otp_hash,
          expires_at_ms, last_sent_at_ms, attempts, max_attempts,
          verified_at_ms, consumed_at_ms, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.registrationSessionId,
        record.channel,
        record.identifier,
        record.fullName,
        record.otpHash,
        record.expiresAtMs,
        record.lastSentAtMs,
        record.attempts,
        record.maxAttempts,
        record.verifiedAtMs,
        record.consumedAtMs,
        record.createdAtMs
      );
  }

  public invalidatePendingChallenges(registrationSessionId: string, channel: OtpChannel, nowMs: number): void {
    this.db
      .prepare(
        `UPDATE otp_challenges
            SET consumed_at_ms = ?
          WHERE registration_session_id = ?
            AND channel = ?
            AND verified_at_ms IS NULL
            AND consumed_at_ms IS NULL`
      )
      .run(nowMs, registrationSessionId, channel);
  }

  public getLatestChallengeForIdentifier(channel: OtpChannel, identifier: string): OtpChallengeRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM otp_challenges
          WHERE channel = ? AND identifier = ?
          ORDER BY created_at_ms DESC
          LIMIT 1`
      )
      .get(channel, identifier) as Record<string, unknown> | undefined;
    return row ? this.mapChallengeRow(row) : null;
  }

  public getLatestChallengeForSession(
    registrationSessionId: string,
    channel: OtpChannel
  ): OtpChallengeRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM otp_challenges
          WHERE registration_session_id = ? AND channel = ?
          ORDER BY created_at_ms DESC
          LIMIT 1`
      )
      .get(registrationSessionId, channel) as Record<string, unknown> | undefined;
    return row ? this.mapChallengeRow(row) : null;
  }

  public getLatestChallengeBySessionAndIdentifier(
    registrationSessionId: string,
    channel: OtpChannel,
    identifier: string
  ): OtpChallengeRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM otp_challenges
          WHERE registration_session_id = ? AND channel = ? AND identifier = ?
          ORDER BY created_at_ms DESC
          LIMIT 1`
      )
      .get(registrationSessionId, channel, identifier) as Record<string, unknown> | undefined;
    return row ? this.mapChallengeRow(row) : null;
  }

  public incrementChallengeAttempts(challengeId: string): number {
    this.db.prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?').run(challengeId);
    const row = this.db.prepare('SELECT attempts FROM otp_challenges WHERE id = ?').get(challengeId) as {
      attempts: number;
    };
    return Number(row?.attempts ?? 0);
  }

  public markChallengeVerified(challengeId: string, nowMs: number): boolean {
    const res = this.db
      .prepare(
        `UPDATE otp_challenges
            SET verified_at_ms = ?, consumed_at_ms = ?
          WHERE id = ? AND verified_at_ms IS NULL AND consumed_at_ms IS NULL`
      )
      .run(nowMs, nowMs, challengeId);
    return Number(res.changes) === 1;
  }

  // ---------------------------------------------------------------------------
  // Verification Tokens
  // ---------------------------------------------------------------------------

  public insertVerificationToken(token: VerificationTokenRecord): void {
    this.db
      .prepare(
        `INSERT INTO verification_tokens (
          jti, registration_session_id, channel, identifier, full_name,
          signed_jwt, expires_at_ms, consumed_at_ms, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        token.jti,
        token.registrationSessionId,
        token.channel,
        token.identifier,
        token.fullName,
        token.signedJwt,
        token.expiresAtMs,
        token.consumedAtMs,
        token.createdAtMs
      );
  }

  public getVerificationTokenByJti(jti: string): VerificationTokenRecord | null {
    const row = this.db
      .prepare('SELECT * FROM verification_tokens WHERE jti = ? LIMIT 1')
      .get(jti) as Record<string, unknown> | undefined;
    return row ? this.mapTokenRow(row) : null;
  }

  public getActiveVerificationTokenForSession(
    registrationSessionId: string,
    channel: OtpChannel,
    nowMs: number
  ): VerificationTokenRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM verification_tokens
          WHERE registration_session_id = ?
            AND channel = ?
            AND consumed_at_ms IS NULL
            AND expires_at_ms > ?
          ORDER BY created_at_ms DESC
          LIMIT 1`
      )
      .get(registrationSessionId, channel, nowMs) as Record<string, unknown> | undefined;
    return row ? this.mapTokenRow(row) : null;
  }

  public revokeSessionRecords(registrationSessionId: string, nowMs: number): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          'UPDATE otp_challenges SET consumed_at_ms = COALESCE(consumed_at_ms, ?) WHERE registration_session_id = ?'
        )
        .run(nowMs, registrationSessionId);
      this.db
        .prepare(
          'UPDATE verification_tokens SET consumed_at_ms = COALESCE(consumed_at_ms, ?) WHERE registration_session_id = ?'
        )
        .run(nowMs, registrationSessionId);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Atomically consumes both verification tokens and inserts the verified user.
   * Prevents race conditions, replay attacks, and duplicate email/mobile accounts.
   */
  public atomicCompleteRegistration(params: {
    userId: string;
    fullName: string;
    email: string;
    normalizedMobile: string;
    emailTokenJti: string;
    mobileTokenJti: string;
    nowMs: number;
  }): { ok: true; user: UserRecord } | { ok: false; code: 'TOKEN_ALREADY_USED' | 'DUPLICATE_EMAIL' | 'DUPLICATE_MOBILE' } {
    const nowIso = new Date(params.nowMs).toISOString();

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existingEmail = this.db
        .prepare('SELECT id FROM users WHERE email = ? LIMIT 1')
        .get(params.email);
      if (existingEmail) {
        this.db.exec('ROLLBACK');
        return { ok: false, code: 'DUPLICATE_EMAIL' };
      }

      const existingMobile = this.db
        .prepare('SELECT id FROM users WHERE normalized_mobile = ? LIMIT 1')
        .get(params.normalizedMobile);
      if (existingMobile) {
        this.db.exec('ROLLBACK');
        return { ok: false, code: 'DUPLICATE_MOBILE' };
      }

      const consumeEmail = this.db
        .prepare(
          `UPDATE verification_tokens
              SET consumed_at_ms = ?
            WHERE jti = ? AND consumed_at_ms IS NULL AND expires_at_ms > ?`
        )
        .run(params.nowMs, params.emailTokenJti, params.nowMs);

      const consumeMobile = this.db
        .prepare(
          `UPDATE verification_tokens
              SET consumed_at_ms = ?
            WHERE jti = ? AND consumed_at_ms IS NULL AND expires_at_ms > ?`
        )
        .run(params.nowMs, params.mobileTokenJti, params.nowMs);

      if (Number(consumeEmail.changes) !== 1 || Number(consumeMobile.changes) !== 1) {
        this.db.exec('ROLLBACK');
        return { ok: false, code: 'TOKEN_ALREADY_USED' };
      }

      this.db
        .prepare(
          `INSERT INTO users (
            id, full_name, email, normalized_mobile, email_verified, mobile_verified, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 1, 1, ?, ?)`
        )
        .run(params.userId, params.fullName, params.email, params.normalizedMobile, nowIso, nowIso);

      this.db.exec('COMMIT');

      return {
        ok: true,
        user: {
          id: params.userId,
          fullName: params.fullName,
          email: params.email,
          normalizedMobile: params.normalizedMobile,
          emailVerified: true,
          mobileVerified: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      };
    } catch (err) {
      this.db.exec('ROLLBACK');
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('users.email')) return { ok: false, code: 'DUPLICATE_EMAIL' };
      if (msg.includes('users.normalized_mobile')) return { ok: false, code: 'DUPLICATE_MOBILE' };
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Persistent Sliding-Window Rate Limiter Storage
  // ---------------------------------------------------------------------------

  public consumeRateLimit(
    bucketKey: string,
    maxRequests: number,
    windowMs: number,
    nowMs: number
  ): { allowed: boolean; retryAfterSec: number; remaining: number } {
    const cutoff = nowMs - windowMs;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('DELETE FROM rate_limit_events WHERE bucket_key = ? AND created_at_ms <= ?')
        .run(bucketKey, cutoff);

      const rows = this.db
        .prepare(
          'SELECT created_at_ms FROM rate_limit_events WHERE bucket_key = ? ORDER BY created_at_ms ASC'
        )
        .all(bucketKey) as Array<{ created_at_ms: number }>;

      if (rows.length >= maxRequests) {
        const oldest = Number(rows[0].created_at_ms);
        const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
        this.db.exec('COMMIT');
        return { allowed: false, retryAfterSec, remaining: 0 };
      }

      this.db
        .prepare('INSERT INTO rate_limit_events (bucket_key, created_at_ms) VALUES (?, ?)')
        .run(bucketKey, nowMs);

      this.db.exec('COMMIT');
      return {
        allowed: true,
        retryAfterSec: 0,
        remaining: Math.max(0, maxRequests - (rows.length + 1)),
      };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  public cleanupExpiredRecords(nowMs: number): number {
    const oneHourAgo = nowMs - 60 * 60 * 1000;
    const twoHoursAgo = nowMs - 2 * 60 * 60 * 1000;
    let deleted = 0;

    const r1 = this.db
      .prepare(
        'DELETE FROM otp_challenges WHERE expires_at_ms < ? AND (consumed_at_ms IS NOT NULL OR verified_at_ms IS NULL)'
      )
      .run(oneHourAgo);
    deleted += Number(r1.changes);

    const r2 = this.db
      .prepare('DELETE FROM verification_tokens WHERE expires_at_ms < ?')
      .run(oneHourAgo);
    deleted += Number(r2.changes);

    const r3 = this.db
      .prepare('DELETE FROM rate_limit_events WHERE created_at_ms < ?')
      .run(twoHoursAgo);
    deleted += Number(r3.changes);

    return deleted;
  }

  // ---------------------------------------------------------------------------
  // Row Mappers
  // ---------------------------------------------------------------------------

  private mapUserRow(row: Record<string, unknown>): UserRecord {
    return {
      id: String(row.id),
      fullName: String(row.full_name),
      email: String(row.email),
      normalizedMobile: String(row.normalized_mobile),
      emailVerified: Number(row.email_verified) === 1,
      mobileVerified: Number(row.mobile_verified) === 1,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapChallengeRow(row: Record<string, unknown>): OtpChallengeRecord {
    return {
      id: String(row.id),
      registrationSessionId: String(row.registration_session_id),
      channel: row.channel as OtpChannel,
      identifier: String(row.identifier),
      fullName: row.full_name ? String(row.full_name) : null,
      otpHash: String(row.otp_hash),
      expiresAtMs: Number(row.expires_at_ms),
      lastSentAtMs: Number(row.last_sent_at_ms),
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
      verifiedAtMs: row.verified_at_ms !== null && row.verified_at_ms !== undefined ? Number(row.verified_at_ms) : null,
      consumedAtMs: row.consumed_at_ms !== null && row.consumed_at_ms !== undefined ? Number(row.consumed_at_ms) : null,
      createdAtMs: Number(row.created_at_ms),
    };
  }

  private mapTokenRow(row: Record<string, unknown>): VerificationTokenRecord {
    return {
      jti: String(row.jti),
      registrationSessionId: String(row.registration_session_id),
      channel: row.channel as OtpChannel,
      identifier: String(row.identifier),
      fullName: row.full_name ? String(row.full_name) : null,
      signedJwt: String(row.signed_jwt),
      expiresAtMs: Number(row.expires_at_ms),
      consumedAtMs: row.consumed_at_ms !== null && row.consumed_at_ms !== undefined ? Number(row.consumed_at_ms) : null,
      createdAtMs: Number(row.created_at_ms),
    };
  }
}
