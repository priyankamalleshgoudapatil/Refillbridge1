// Session store. Per H4: sessionStorage only (cleared when the tab closes), 15-min idle, 12-h absolute.
// Holds only an opaque user id + assurance level — never patient data (H7).
import type { Aal } from '@shared/types.ts';

export interface Session {
  userId: string;
  aal: Aal;
  issuedAt: number;
  lastActivity: number;
  devBypassMfaGate?: boolean;
}

export const IDLE_TIMEOUT_MS = 15 * 60_000;
export const IDLE_WARNING_MS = 14 * 60_000;
export const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60_000;

const KEY = 'rb.session';
type Listener = (s: Session | null) => void;
const listeners = new Set<Listener>();

function read(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (Date.now() - s.issuedAt > ABSOLUTE_TIMEOUT_MS) return null;
    return s;
  } catch {
    return null;
  }
}

let current: Session | null = typeof window !== 'undefined' ? read() : null;

function write(s: Session | null) {
  current = s;
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — keep in memory */
  }
  listeners.forEach((l) => l(s));
}

export const sessionStore = {
  get: (): Session | null => {
    if (current && Date.now() - current.issuedAt > ABSOLUTE_TIMEOUT_MS) write(null);
    return current;
  },
  set: (s: Session) => write(s),
  update: (patch: Partial<Session>) => current && write({ ...current, ...patch }),
  clear: () => write(null),
  touch: () => {
    if (current) {
      current = { ...current, lastActivity: Date.now() };
      try {
        sessionStorage.setItem(KEY, JSON.stringify(current));
      } catch {
        /* ignore */
      }
    }
  },
  subscribe: (l: Listener): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
