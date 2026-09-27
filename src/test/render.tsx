import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, type RouteObject } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/app/auth-context';
import { ToastProvider } from '@/components/ui/Toast';
import { authService } from '@/services';
import { setEngine } from '@/services/mock/backend';
import { buildSeededEngine } from '@/services/mock/seed';
import type { MockEngine } from '@/services/mock/engine';

/** Fresh seeded mock DB + signed-in user (dev switch). Returns the engine for lookups. */
export function setupDemo(userKey?: string, aal: 'aal1' | 'aal2' = 'aal2'): MockEngine {
  sessionStorage.clear();
  const eng = buildSeededEngine(new Date('2026-09-16T16:00:00Z').getTime());
  eng.clockOffsetMin = (new Date('2026-09-16T16:00:00Z').getTime() - Date.now()) / 60_000;
  eng.sim.quietHours = false;
  setEngine(eng);
  if (userKey) authService.devSwitchUser(userKey, aal);
  return eng;
}

export function renderRoutes(routes: RouteObject[], initialPath: string, extra?: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthProvider>
            <Outlet />
            {extra}
          </AuthProvider>
        ),
        children: [...routes, { path: '*', element: <div>Fallback route</div> }],
      },
    ],
    { initialEntries: [initialPath] },
  );
  const utils = render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, router, qc };
}
