import { formatMmSs } from '../utils/validation';

interface CountdownTimerProps {
  expirySecondsLeft: number;
  resendSecondsLeft: number;
  isSending: boolean;
  onResend: () => void;
}

export function CountdownTimer({
  expirySecondsLeft,
  resendSecondsLeft,
  isSending,
  onResend,
}: CountdownTimerProps) {
  const isExpired = expirySecondsLeft <= 0;
  const resendLocked = resendSecondsLeft > 0 || isSending;

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        {isExpired ? (
          <span className="font-medium text-red-600">Code expired</span>
        ) : (
          <span className="text-neutral-600">
            Expires in{' '}
            <span className="font-mono font-semibold tabular-nums text-neutral-900">
              {formatMmSs(expirySecondsLeft)}
            </span>
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onResend}
        disabled={resendLocked}
        className={`font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 rounded ${
          resendLocked
            ? 'cursor-not-allowed text-neutral-400'
            : 'text-neutral-900 underline underline-offset-4 hover:text-neutral-600'
        }`}
      >
        {isSending
          ? 'Sending...'
          : resendSecondsLeft > 0
            ? `Resend in ${resendSecondsLeft}s`
            : 'Resend OTP'}
      </button>
    </div>
  );
}
