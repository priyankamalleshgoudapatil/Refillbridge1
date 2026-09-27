import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { createBrowserRouter, Outlet, ScrollRestoration, useRouteError } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PHARMACY_ROLES, PRACTICE_ROLES } from '@shared/types.ts';
import { onBackendChange } from '@/services/mock/backend';
import { Spinner } from '@/components/ui/States';
import { AuthProvider, useAuth } from './auth-context';
import { CrashScreen } from './ErrorBoundary';
import { RequireAuth, RequireRole } from './guards';
import { setUnauthenticatedHandler } from './query-client';

const AppShell = lazy(() => import('./AppShell'));
const LandingPage = lazy(() => import('@/features/landing/LandingPage'));
const SignInPage = lazy(() => import('@/features/auth/SignInPage'));
const SignUpPage = lazy(() => import('@/features/auth/SignUpPage'));
const VerifyEmailPage = lazy(() => import('@/features/auth/VerifyEmailPage'));
const AcceptInvitePage = lazy(() => import('@/features/auth/AcceptInvitePage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'));
const MfaPage = lazy(() => import('@/features/auth/MfaPage'));
const PatientStatusPage = lazy(() => import('@/features/patient-status/PatientStatusPage'));
const CaseDetailPage = lazy(() => import('@/features/cases/CaseDetailPage'));
const QueuePage = lazy(() => import('@/features/queue/QueuePage'));
const ProviderInboxPage = lazy(() => import('@/features/provider-inbox/ProviderInboxPage'));
const PharmacyRequestsPage = lazy(() => import('@/features/pharmacy/PharmacyRequestsPage'));
const NewRequestPage = lazy(() => import('@/features/intake/NewRequestPage'));
const PhoneIntakePage = lazy(() => import('@/features/intake/PhoneIntakePage'));
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage'));
const SettingsLayout = lazy(() => import('@/features/settings/SettingsLayout'));
const ProfilePage = lazy(() => import('@/features/settings/ProfilePage'));
const TeamPage = lazy(() => import('@/features/settings/TeamPage'));
const PharmaciesPage = lazy(() => import('@/features/settings/PharmaciesPage'));
const PoliciesPage = lazy(() => import('@/features/settings/PoliciesPage'));
const AuditLogPage = lazy(() => import('@/features/settings/AuditLogPage'));
const NotFoundPage = lazy(() => import('@/features/errors/NotFoundPage'));

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="size-6" />
    </div>
  );
}

/** Bridges non-React events (401s, worker ticks) into React state. */
function BackendBridge() {
  const qc = useQueryClient();
  const { handleUnauthenticated } = useAuth();
  useEffect(() => {
    setUnauthenticatedHandler(handleUnauthenticated);
    return () => setUnauthenticatedHandler(null);
  }, [handleUnauthenticated]);
  useEffect(
    () =>
      onBackendChange(() => {
        void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'health' && q.queryKey[0] !== 'ai' });
      }),
    [qc],
  );
  return null;
}

function RootLayout() {
  return (
    <AuthProvider>
      <BackendBridge />
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
      <ScrollRestoration />
    </AuthProvider>
  );
}

function RouteError() {
  const err = useRouteError();
  console.error(JSON.stringify({ level: 'error', event: 'route.error', details: { message: err instanceof Error ? err.name : 'unknown' } }));
  return <CrashScreen reference={crypto.randomUUID()} />;
}

const practice = PRACTICE_ROLES;
const pharmacy = PHARMACY_ROLES;
const guard = (roles: readonly (typeof PRACTICE_ROLES)[number][], el: ReactNode) => <RequireRole roles={roles}>{el}</RequireRole>;

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/sign-up', element: <SignUpPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/accept-invite', element: <AcceptInvitePage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/mfa', element: <MfaPage /> },
      { path: '/status/:token', element: <PatientStatusPage /> },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { path: '/queue', element: guard(practice, <QueuePage />) },
          { path: '/cases/new', element: guard(['practice_admin', 'practice_staff', 'provider'], <PhoneIntakePage />) },
          { path: '/cases/:caseId', element: <CaseDetailPage /> },
          { path: '/provider/inbox', element: guard(['provider'], <ProviderInboxPage />) },
          { path: '/provider/inbox/:caseId', element: guard(['provider'], <ProviderInboxPage />) },
          { path: '/pharmacy/requests', element: guard(pharmacy, <PharmacyRequestsPage />) },
          { path: '/pharmacy/requests/new', element: guard(pharmacy, <NewRequestPage />) },
          { path: '/analytics', element: guard(['practice_admin', 'provider', 'pharmacy_admin'], <AnalyticsPage />) },
          {
            path: '/settings',
            element: <SettingsLayout />,
            children: [
              { path: 'profile', element: <ProfilePage /> },
              { path: 'team', element: guard(['practice_admin', 'pharmacy_admin'], <TeamPage />) },
              { path: 'pharmacies', element: guard(['practice_admin', 'pharmacy_admin'], <PharmaciesPage />) },
              { path: 'policies', element: guard(['practice_admin'], <PoliciesPage />) },
              { path: 'audit', element: guard(['practice_admin', 'pharmacy_admin'], <AuditLogPage />) },
            ],
          },
        ],
      },
      { path: '/error', element: <CrashScreen reference="demo-error-page" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
