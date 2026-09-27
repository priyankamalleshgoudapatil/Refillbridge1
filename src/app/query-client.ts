import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/services/errors';

let onUnauthenticated: ((e: ApiError) => void) | null = null;
export function setUnauthenticatedHandler(fn: ((e: ApiError) => void) | null) {
  onUnauthenticated = fn;
}

function handle(err: unknown) {
  if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') onUnauthenticated?.(err);
}

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handle }),
    mutationCache: new MutationCache({ onError: handle }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        // GETs retry twice with backoff — but never on 4xx (auth, permission, validation, not found).
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
      mutations: { retry: false }, // never auto-retry mutations
    },
  });
}
