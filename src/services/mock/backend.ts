// Singleton mock backend + live workers (outbox + SLA) that tick like pg_cron would.
import { MockEngine } from './engine';
import { buildSeededEngine } from './seed';

let engine: MockEngine | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

export function getEngine(): MockEngine {
  if (!engine) engine = buildSeededEngine();
  return engine;
}

export function resetEngine(): MockEngine {
  engine = buildSeededEngine();
  notifyChange();
  return engine;
}

/** Test helper: install a specific engine instance. */
export function setEngine(e: MockEngine) {
  engine = e;
}

export function onBackendChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notifyChange() {
  listeners.forEach((l) => l());
}

/** Workers tick every 4 s in the browser (pg_cron runs every 60 s in production). */
export function startWorkers() {
  if (timer || typeof window === 'undefined') return;
  timer = setInterval(() => {
    const e = getEngine();
    const before = e.db.events.length;
    e.tick();
    if (e.db.events.length !== before) notifyChange();
  }, 4000);
}
