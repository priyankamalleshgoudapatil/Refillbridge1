// Test-only helpers: render a page inside a memory data router with the same providers the app uses.
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/app/auth-context';
import { ToastProvider } from '@/components/ui/Toast';
import { setEngine } from '@/services/mock/backend';
import { buildSeededEngine } from '@/services/mock/seed';
import { sessionStore } from '@/services/session';

// jsdom replaces AbortSignal but Node's native Request (undici) rejects foreign signals, so data-router
// navigations throw "Expected signal to be an instance of AbortSignal". Drop the signal (no loaders here).
// Recommended to move into src/test/setup.ts.
const NativeRequest = globalThis.Request;
if (NativeRequest && !(NativeRequest as { __rbPatched?: boolean }).__rbPatched) {
  class PatchedRequest extends NativeRequest {
    static __rbPatched = true;
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (init?.signal) {
        const rest: RequestInit = { ...init };
        delete rest.signal;
        super(input, rest);
      } else {
        super(input, init);
      }
    }
  }
  globalThis.Request = PatchedRequest;
}

function Providers() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

/** Renders the current pathname + search so tests can assert where navigation landed. */
function LocationProbe({ label }: { label: string }) {
  const loc = useLocation();
  return (
    <div>
      <h1>{label}</h1>
      <p data-testid="location">{loc.pathname + loc.search}</p>
    </div>
  );
}

export interface RenderRouteOptions {
  path: string;
  element: ReactElement;
  initialEntry: string;
  extraRoutes?: { path: string; element: ReactElement }[];
}

export function renderRoute({ path, element, initialEntry, extraRoutes = [] }: RenderRouteOptions) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const targets = ['/', '/queue', '/provider/inbox', '/pharmacy/requests', '/sign-in', '/mfa', '/sign-up', '/forgot-password', '/reset-password', '/verify-email']
    .filter((p) => p !== path && !extraRoutes.some((r) => r.path === p))
    .map((p) => ({ path: p, element: <LocationProbe label={`Route ${p}`} /> }));
  const router = createMemoryRouter([{ element: <Providers />, children: [{ path, element }, ...extraRoutes, ...targets] }], { initialEntries: [initialEntry] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, router };
}

/** Fresh mock DB + no session. */
export function resetMockState() {
  sessionStorage.clear();
  sessionStore.clear();
  setEngine(buildSeededEngine());
}
