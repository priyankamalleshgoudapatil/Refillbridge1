import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { homeRouteFor } from '@shared/domain/permissions.ts';
import { MFA_REQUIRED_ROLES, type Role } from '@shared/types.ts';
import { sessionStore } from '@/services/session';
import { Button } from '@/components/ui/Button';
import { useAuth } from './auth-context';

/** UX-only guard (the server enforces everything): redirect to sign-in with ?next=. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  // H3: roles that require MFA must finish it before using the app (dev switcher can bypass to demo step-up).
  const s = sessionStore.get();
  if (MFA_REQUIRED_ROLES.includes(user.role) && user.aal !== 'aal2' && !s?.devBypassMfaGate) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/mfa?next=${next}`} replace />;
  }
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) return <AccessDenied />;
  return <>{children}</>;
}

export function AccessDenied() {
  const { user } = useAuth();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-warn-50 text-warn-600">
        <ShieldOff className="size-7" aria-hidden />
      </div>
      <h1 className="text-2xl font-light text-brand-900">You don't have access</h1>
      <p className="mt-2 text-sm text-ink-500">This page isn't available for your role. If you think that's wrong, ask your organisation's admin.</p>
      <Link to={user ? homeRouteFor(user.role) : '/'} className="mt-6">
        <Button>Go to my home</Button>
      </Link>
    </div>
  );
}
