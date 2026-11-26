import { Check } from 'lucide-react';

interface ProgressStepperProps {
  emailVerified: boolean;
  mobileVerified: boolean;
  accountCompleted: boolean;
}

const STEPS = [
  { id: 1, label: 'Email Verification' },
  { id: 2, label: 'Mobile Verification' },
  { id: 3, label: 'Account Completion' },
] as const;

export function ProgressStepper({
  emailVerified,
  mobileVerified,
  accountCompleted,
}: ProgressStepperProps) {
  const getStepState = (stepId: 1 | 2 | 3): 'complete' | 'current' | 'upcoming' => {
    if (accountCompleted) return 'complete';
    if (stepId === 1) return emailVerified ? 'complete' : 'current';
    if (stepId === 2) {
      if (mobileVerified) return 'complete';
      return emailVerified ? 'current' : 'upcoming';
    }
    return emailVerified && mobileVerified ? 'current' : 'upcoming';
  };

  return (
    <nav aria-label="Registration progress" className="w-full">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((step, index) => {
          const state = getStepState(step.id);
          const isComplete = state === 'complete';
          const isCurrent = state === 'current';

          return (
            <li key={step.id} className="relative flex flex-col items-center text-center">
              {index < STEPS.length - 1 ? (
                <div
                  aria-hidden="true"
                  className={`absolute top-3.5 left-[calc(50%+16px)] right-[calc(-50%+16px)] h-px transition-colors duration-200 ${
                    isComplete ? 'bg-emerald-600' : 'bg-neutral-200'
                  }`}
                />
              ) : null}

              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors duration-200 ${
                  isComplete
                    ? 'bg-emerald-600 text-white'
                    : isCurrent
                      ? 'bg-neutral-900 text-white ring-4 ring-neutral-900/10'
                      : 'border border-neutral-300 bg-white text-neutral-500'
                }`}
              >
                {isComplete ? <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden="true" /> : step.id}
              </span>

              <span
                className={`mt-2 text-[11px] leading-tight transition-colors duration-200 ${
                  isComplete
                    ? 'font-medium text-emerald-700'
                    : isCurrent
                      ? 'font-semibold text-neutral-900'
                      : 'font-normal text-neutral-500'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
