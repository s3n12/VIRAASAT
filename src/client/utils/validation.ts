const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateFullName(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Please enter your full name.';
  if (cleaned.length < 2) return 'Full name must be at least 2 characters.';
  if (cleaned.length > 120) return 'Full name must be 120 characters or fewer.';
  return null;
}

export function validateEmail(raw: string): string | null {
  const normalized = normalizeEmail(raw);
  if (!normalized) return 'Please enter your email address.';
  if (normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    return 'Please enter a valid email address (e.g. ananya@domain.com).';
  }
  return null;
}

export interface NormalizedIndianMobileClient {
  e164: string;
  display: string;
  masked: string;
}

/**
 * Validates Indian mobile numbers:
 * - Accepts 10-digit numbers beginning with 6, 7, 8, or 9
 * - Accepts +91-prefixed numbers (with optional spaces or hyphens)
 * - Rejects non-Indian country codes (e.g. +1, +44) and malformed numbers
 */
export function normalizeIndianMobileClient(raw: string): NormalizedIndianMobileClient | null {
  const compact = raw.trim().replace(/[\s\-()]/g, '');
  if (!compact) return null;

  if (compact.startsWith('+') && !compact.startsWith('+91')) {
    return null;
  }

  let national10 = '';
  if (/^\+91[6-9]\d{9}$/.test(compact)) {
    national10 = compact.slice(3);
  } else if (/^[6-9]\d{9}$/.test(compact)) {
    national10 = compact;
  } else {
    return null;
  }

  const e164 = `+91${national10}`;
  return {
    e164,
    display: `+91 ${national10.slice(0, 5)} ${national10.slice(5)}`,
    masked: `+91 ••••••${national10.slice(6)}`,
  };
}

export function validateIndianMobile(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'Please enter your Indian mobile number.';
  const compact = trimmed.replace(/[\s\-()]/g, '');
  if (compact.startsWith('+') && !compact.startsWith('+91')) {
    return 'Only Indian mobile numbers with country code +91 are supported.';
  }
  if (!normalizeIndianMobileClient(trimmed)) {
    return 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.';
  }
  return null;
}

export function validateOtpCode(raw: string): string | null {
  const digits = raw.trim();
  if (!/^\d{6}$/.test(digits)) {
    return 'Enter the complete 6-digit verification code.';
  }
  return null;
}

export function formatMmSs(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
