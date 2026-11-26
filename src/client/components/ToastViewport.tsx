import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastItem } from '../types/registration';

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-[360px] flex-col gap-2.5"
    >
      {toasts.map((toast) => {
        const icon =
          toast.variant === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
          ) : toast.variant === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" aria-hidden="true" />
          ) : (
            <Info className="h-4 w-4 shrink-0 text-slate-600 mt-0.5" aria-hidden="true" />
          );

        return (
          <div
            key={toast.id}
            role="status"
            className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-neutral-900 shadow-[0_8px_24px_rgb(15,23,42,0.08)]"
          >
            {icon}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-neutral-900">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
