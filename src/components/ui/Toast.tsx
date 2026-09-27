import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/format';

type Tone = 'success' | 'error' | 'info' | 'warning';
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
  requestId?: string;
}
interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string, requestId?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const MAX = 3;
const DURATION = 5000;

const icons: Record<Tone, ReactNode> = {
  success: <CheckCircle2 className="size-5 text-ok-600" aria-hidden />,
  error: <XCircle className="size-5 text-bad-600" aria-hidden />,
  info: <Info className="size-5 text-info-600" aria-hidden />,
  warning: <AlertTriangle className="size-5 text-warn-600" aria-hidden />,
};

/** Toasts: bottom-right on desktop, top on mobile; 5 s; max 3; errors persist until dismissed; aria-live. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone: Tone, title: string, description?: string, requestId?: string) => {
      const id = next.current++;
      setToasts((t) => [...t, { id, tone, title, description, requestId }].slice(-MAX));
      if (tone !== 'error') setTimeout(() => dismiss(id), DURATION);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push('success', t, d),
      error: (t, d, r) => push('error', t, d, r),
      info: (t, d) => push('info', t, d),
      warning: (t, d) => push('warning', t, d),
    }),
    [push],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:top-auto sm:items-end">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={cn('pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white/95 p-3.5 shadow-[var(--shadow-lift)] backdrop-blur', t.tone === 'error' ? 'border-bad-600/30' : 'border-line')}
            >
              {icons[t.tone]}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">{t.title}</p>
                {t.description && <p className="mt-0.5 text-[13px] text-ink-600">{t.description}</p>}
                {t.requestId && <p className="mt-1 font-mono text-[11px] text-ink-400">Reference: {t.requestId.slice(0, 8)}</p>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-ink-400 hover:text-ink-900" aria-label="Dismiss notification">
                <X className="size-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
