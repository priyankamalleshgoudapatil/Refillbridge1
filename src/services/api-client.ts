// The ONE HTTP client for the real back end (Phase 5): auth header, x-request-id, 10 s timeout,
// error-envelope normalisation. Unused while VITE_USE_MOCKS=true, but ready and tested.
import { ApiError, newRequestId, type ApiErrorCode } from './errors';

export const REQUEST_TIMEOUT_MS = 10_000;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export function createApiClient(opts: { baseUrl: string; getAccessToken: () => string | null; fetchImpl?: typeof fetch }) {
  const doFetch = opts.fetchImpl ?? fetch;
  return async function request<T>(path: string, ro: RequestOptions = {}): Promise<T> {
    const requestId = newRequestId();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers: Record<string, string> = { 'x-request-id': requestId, Accept: 'application/json' };
    const token = opts.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (ro.body !== undefined) headers['Content-Type'] = 'application/json';
    if (ro.idempotencyKey) headers['Idempotency-Key'] = ro.idempotencyKey;
    try {
      const res = await doFetch(`${opts.baseUrl}${path}`, {
        method: ro.method ?? 'GET',
        headers,
        body: ro.body !== undefined ? JSON.stringify(ro.body) : undefined,
        signal: ro.signal ?? controller.signal,
      });
      const json = (await res.json().catch(() => null)) as { data?: T; error?: { code: ApiErrorCode; message: string; requestId?: string } } | null;
      if (!res.ok) {
        const e = json?.error;
        throw new ApiError(e?.code ?? 'INTERNAL_ERROR', e?.message ?? 'Something went wrong.', { requestId: e?.requestId ?? requestId });
      }
      return json?.data as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw new ApiError('TIMEOUT', 'The request timed out.', { requestId });
      throw new ApiError('NETWORK_ERROR', "You're offline. Reconnect and try again.", { requestId });
    } finally {
      clearTimeout(timeout);
    }
  };
}
