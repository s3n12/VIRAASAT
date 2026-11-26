import { useEffect, useState } from 'react';

/**
 * Computes drift-free remaining seconds until `targetTimestampMs`.
 * Automatically ticks once per second while active and stops at 0.
 */
export function useCountdown(targetTimestampMs: number | null): number {
  const computeRemaining = (target: number | null): number => {
    if (!target) return 0;
    return Math.max(0, Math.ceil((target - Date.now()) / 1000));
  };

  const [secondsLeft, setSecondsLeft] = useState<number>(() => computeRemaining(targetTimestampMs));

  useEffect(() => {
    const initial = computeRemaining(targetTimestampMs);
    setSecondsLeft(initial);

    if (!targetTimestampMs || initial <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      const next = computeRemaining(targetTimestampMs);
      setSecondsLeft(next);
      if (next <= 0) {
        window.clearInterval(timer);
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [targetTimestampMs]);

  return secondsLeft;
}
