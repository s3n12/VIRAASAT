import { CheckCircle2, RotateCcw } from 'lucide-react';
import type { RegisteredUserSummary } from '../types/registration';

interface RegistrationSuccessProps {
  user: RegisteredUserSummary;
  onStartNewRegistration: () => void;
}

export function RegistrationSuccess({ user, onStartNewRegistration }: RegistrationSuccessProps) {
  return (
    <div className="space-y-6 text-center">
      <div className="space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-neutral-900 text-balance">
          Your Account Has Been Successfully Created!
        </h2>
        <p className="text-sm text-neutral-600 leading-relaxed">
          Welcome, <span className="font-medium text-neutral-900">{user.fullName}</span>. Both your email address and Indian mobile number are verified and bound to your account.
        </p>
      </div>

      <dl className="divide-y divide-neutral-200/80 rounded-xl border border-neutral-200 bg-neutral-50/70 text-left text-sm">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-xs text-neutral-500">Full Name</dt>
          <dd className="font-medium text-neutral-900 truncate">{user.fullName}</dd>
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-xs text-neutral-500">Verified Email</dt>
          <dd className="font-medium text-neutral-900 truncate">{user.email}</dd>
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-xs text-neutral-500">Verified Mobile</dt>
          <dd className="font-mono text-xs font-semibold tabular-nums text-neutral-900">
            {user.maskedMobile}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-xs text-neutral-500">Verification</dt>
          <dd className="text-xs font-semibold text-emerald-700">✓ Email &amp; +91 Mobile Verified</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={onStartNewRegistration}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Create Another Account
      </button>
    </div>
  );
}
