// Test harness shared by the analytics + settings page tests (not a test file itself).
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, type RouteObject } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/app/auth-context';
import { ToastProvider } from '@/components/ui/Toast';
import { authService } from '@/services';
import { setEngine } from '@/services/mock/backend';
import { buildSeededEngine } from '@/services/mock/seed';

// jsdom's AbortSignal is rejected by Node's undici `Request`, which the data router builds on every
// navigation. No loaders run in these tests, so dropping the signal is harmless.
const NativeRequest = globalThis.Request;
if (!(NativeRequest as unknown as { __rbPatched?: boolean }).__rbPatched) {
  class TestRequest extends NativeRequest {
    static __rbPatched = true;
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (init?.signal) {
        const { signal: _signal, ...rest } = init;
        super(input, rest);
      } else super(input, init);
    }
  }
  globalThis.Request = TestRequest;
}

/** Fresh mock DB + signed-in user. Call in beforeEach. */
export function resetMockAndSignIn(userKey = 'admin', aal: 'aal1' | 'aal2' = 'aal2') {
  setEngine(buildSeededEngine());
  sessionStorage.clear();
  authService.devSwitchUser(userKey, aal);
}

interface RenderOptions {
  path: string;
  initialEntry?: string;
  children?: RouteObject[];
  extraRoutes?: RouteObject[];
}

export function renderRoute(element: ReactElement, { path, initialEntry, children, extraRoutes = [] }: RenderOptions) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        ),
        children: [{ path, element, children }, ...extraRoutes],
      },
    ],
    { initialEntries: [initialEntry ?? path] },
  );
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, router, queryClient };
}
