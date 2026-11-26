import React, { useEffect, useRef } from 'react';

interface OtpInputProps {
  idPrefix: string;
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
}

const DIGITS_COUNT = 6;

export function OtpInput({
  idPrefix,
  label,
  value,
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
  autoFocus = false,
}: OtpInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: DIGITS_COUNT }, (_, idx) => value[idx] ?? '');

  useEffect(() => {
    if (autoFocus && !disabled) {
      inputRefs.current[0]?.focus();
    }
  }, [autoFocus, disabled]);

  const focusIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(DIGITS_COUNT - 1, index));
    inputRefs.current[clamped]?.focus();
    inputRefs.current[clamped]?.select();
  };

  const commitDigits = (nextDigits: string[], nextFocusIndex?: number) => {
    const joined = nextDigits.join('').slice(0, DIGITS_COUNT);
    onChange(joined);
    if (typeof nextFocusIndex === 'number') {
      focusIndex(nextFocusIndex);
    }
    if (joined.length === DIGITS_COUNT && /^\d{6}$/.test(joined) && onComplete) {
      onComplete(joined);
    }
  };

  const handleChange = (index: number, raw: string) => {
    if (disabled) return;
    const cleaned = raw.replace(/\D/g, '');

    if (!cleaned) {
      const next = [...digits];
      next[index] = '';
      commitDigits(next);
      return;
    }

    // Handle multi-digit paste or iOS/Android SMS autofill into a single box
    if (cleaned.length > 1) {
      const next = [...digits];
      for (let i = 0; i < cleaned.length && index + i < DIGITS_COUNT; i += 1) {
        next[index + i] = cleaned[i];
      }
      const nextFocus = Math.min(DIGITS_COUNT - 1, index + cleaned.length);
      commitDigits(next, nextFocus);
      return;
    }

    const next = [...digits];
    next[index] = cleaned[0];
    const nextFocus = index < DIGITS_COUNT - 1 ? index + 1 : index;
    commitDigits(next, nextFocus);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = '';
        commitDigits(next, index);
      } else if (index > 0) {
        next[index - 1] = '';
        commitDigits(next, index - 1);
      }
      return;
    }

    if (e.key === 'Delete') {
      e.preventDefault();
      const next = [...digits];
      next[index] = '';
      commitDigits(next, index);
      return;
    }

    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusIndex(index - 1);
      return;
    }

    if (e.key === 'ArrowRight' && index < DIGITS_COUNT - 1) {
      e.preventDefault();
      focusIndex(index + 1);
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      focusIndex(0);
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      focusIndex(DIGITS_COUNT - 1);
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, DIGITS_COUNT);
    if (!pasted) return;

    const next = Array.from({ length: DIGITS_COUNT }, (_, i) => {
      if (pasted.length === DIGITS_COUNT) {
        return pasted[i] ?? '';
      }
      if (i >= index && i - index < pasted.length) {
        return pasted[i - index];
      }
      return digits[i];
    });

    const targetFocus =
      pasted.length === DIGITS_COUNT
        ? DIGITS_COUNT - 1
        : Math.min(DIGITS_COUNT - 1, index + pasted.length);
    commitDigits(next, targetFocus);
  };

  return (
    <div role="group" aria-label={label} className="w-full">
      <div className="grid grid-cols-6 gap-2">
        {digits.map((digit, index) => (
          <input
            key={`${idPrefix}-digit-${index}`}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            id={`${idPrefix}-digit-${index}`}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            pattern="[0-9]*"
            maxLength={6}
            value={digit}
            disabled={disabled}
            aria-label={`${label}, digit ${index + 1} of ${DIGITS_COUNT}`}
            aria-invalid={hasError || undefined}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={(e) => handlePaste(index, e)}
            onFocus={(e) => e.currentTarget.select()}
            className={`h-12 w-full rounded-xl border bg-white text-center font-mono text-lg font-semibold tabular-nums transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              disabled
                ? 'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400'
                : hasError
                  ? 'border-red-400 text-neutral-900 focus:border-red-500 focus:ring-red-500/20'
                  : digit
                    ? 'border-neutral-900 text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900/15'
                    : 'border-neutral-300 text-neutral-900 hover:border-neutral-400 focus:border-neutral-900 focus:ring-neutral-900/15'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
