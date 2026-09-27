import { useEffect, useRef, useState } from 'react';
import { newRequestId } from '@/services/errors';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Re-renders every `ms` so countdowns (SLA, "time in state") stay live. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** One idempotency key per user intent: stable across retries, renewed after success. */
export function useIdempotencyKey(): [string, () => void] {
  const ref = useRef(newRequestId());
  const [, force] = useState(0);
  return [
    ref.current,
    () => {
      ref.current = newRequestId();
      force((n) => n + 1);
    },
  ];
}
