import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/format';

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when all 6 digits are filled (typing or paste). */
  onComplete?: (value: string) => void;
  label?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

const LENGTH = 6;

/** Six single-digit boxes with auto-advance, backspace-to-previous, arrow keys and paste support. */
export function CodeInput({ value, onChange, onComplete, label = '6-digit code', error, hint, disabled, autoFocus }: CodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const baseId = useId();
  const describedBy = error ? `${baseId}-error` : hint ? `${baseId}-hint` : undefined;
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '');

  const focus = (i: number) => refs.current[Math.max(0, Math.min(LENGTH - 1, i))]?.focus();

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH);
    onChange(clean);
    if (clean.length === LENGTH) onComplete?.(clean);
  };

  const setDigit = (i: number, d: string) => {
    const arr = [...digits];
    arr[i] = d;
    // Keep digits contiguous: a value can't have holes.
    const joined = arr.join('');
    commit(joined);
  };

  const onInput = (i: number, raw: string) => {
    const only = raw.replace(/\D/g, '');
    if (!only) return;
    if (only.length > 1) {
      // Autofill / fast typing into one box: spread from this position.
      commit((digits.slice(0, i).join('') + only).slice(0, LENGTH));
      focus(i + only.length);
      return;
    }
    setDigit(i, only);
    focus(i + 1);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i]) {
        commit(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        commit(value.slice(0, i - 1) + value.slice(i));
        focus(i - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focus(i + 1);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!text) return;
    e.preventDefault();
    commit(text);
    focus(Math.min(text.length, LENGTH - 1));
  };

  return (
    <fieldset aria-describedby={describedBy}>
      <legend className="mb-2 text-[13px] font-medium text-ink-700">{label}</legend>
      <div className="flex justify-between gap-1.5 sm:gap-2.5">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={LENGTH}
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${i + 1} of ${LENGTH}`}
            aria-invalid={Boolean(error) || undefined}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            value={d}
            // Only the next empty box (or a filled one) is reachable, so the value stays contiguous.
            tabIndex={i === Math.min(value.length, LENGTH - 1) ? 0 : -1}
            onFocus={(e) => {
              if (i > value.length) focus(value.length);
              else e.currentTarget.select();
            }}
            onChange={(e) => onInput(i, e.target.value.replace(d, '') || e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            className={cn(
              'h-12 w-full min-w-0 max-w-[52px] rounded-[var(--radius-input)] border bg-white text-center font-mono text-xl font-semibold text-brand-900 transition-all focus:outline-none focus:ring-4 sm:h-14 sm:text-2xl',
              error ? 'border-bad-600 focus:ring-bad-50' : d ? 'border-brand-400 focus:border-brand-500 focus:ring-brand-100' : 'border-line-strong focus:border-brand-500 focus:ring-brand-100',
            )}
          />
        ))}
      </div>
      {error ? (
        <p id={`${baseId}-error`} role="alert" className="mt-2 flex items-center gap-1 text-[12.5px] text-bad-700">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${baseId}-hint`} className="mt-2 text-[12.5px] text-ink-500">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}
