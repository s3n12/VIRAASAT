import { CheckCircle2, Clock, ShieldCheck } from 'lucide-react';

interface StatusBannerProps {
  emailVerified: boolean;
  mobileVerified: boolean;
}

export function StatusBanner({ emailVerified, mobileVerified }: StatusBannerProps) {
  const bothVerified = emailVerified && mobileVerified;

  const statusText = bothVerified
    ? 'Status: Both Channels Verified!'
    : emailVerified
      ? 'Status: Email Verified — Mobile Verification Pending'
      : 'Status: Pending Verification';

  const containerStyle = bothVerified
    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
    : emailVerified
      ? 'border-amber-200 bg-amber-50/70 text-amber-950'
      : 'border-neutral-200 bg-neutral-50 text-neutral-700';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium transition-colors duration-200 ${containerStyle}`}
    >
      {bothVerified ? (
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
      ) : emailVerified ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      ) : (
        <Clock className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
      )}
      <span className="leading-snug">{statusText}</span>
    </div>
  );
}
