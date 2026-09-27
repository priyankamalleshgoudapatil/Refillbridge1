import { clsx, type ClassValue } from 'clsx';
import { formatDuration } from '@shared/domain/sla.ts';

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', opts);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < 45_000) return 'just now';
  return `${formatDuration(diff)} ago`;
}

/** "in 3 h 10 m" / "2 h 5 m overdue" */
export function dueIn(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'No SLA';
  const diff = new Date(iso).getTime() - now;
  return diff >= 0 ? `in ${formatDuration(diff)}` : `${formatDuration(diff)} overdue`;
}

export function formatDob(dob: string): string {
  const [y, m, d] = dob.split('-');
  return `${m}/${d}/${y}`;
}

export function pluralize(n: number, word: string, plural = `${word}s`): string {
  return `${n} ${n === 1 ? word : plural}`;
}
