import type { ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Building2, ClipboardCheck, ScrollText, SlidersHorizontal, UserRound, Users } from 'lucide-react';
import { can } from '@shared/domain/permissions.ts';
import type { Role } from '@shared/types.ts';
import { useAuth } from '@/app/auth-context';
import { PageHeader } from '@/components/ui/Layout';
import { cn } from '@/lib/format';

interface SettingsTab {
  to: string;
  label: string;
  icon: ReactNode;
}

const I = 'size-4';

export function settingsTabsFor(role: Role): SettingsTab[] {
  const tabs: SettingsTab[] = [{ to: '/settings/profile', label: 'Profile', icon: <UserRound className={I} aria-hidden /> }];
  if (can(role, 'team.manage')) {
    tabs.push({ to: '/settings/team', label: 'Team', icon: <Users className={I} aria-hidden /> });
    tabs.push({
      to: '/settings/pharmacies',
      label: role === 'pharmacy_admin' ? 'Practices' : 'Pharmacies',
      icon: <Building2 className={I} aria-hidden />,
    });
  }
  if (can(role, 'policies.edit')) tabs.push({ to: '/settings/policies', label: 'Policies', icon: <SlidersHorizontal className={I} aria-hidden /> });
  if (can(role, 'audit.view')) tabs.push({ to: '/settings/audit', label: 'Audit log', icon: <ScrollText className={I} aria-hidden /> });
  return tabs;
}

export default function SettingsLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (pathname.replace(/\/+$/, '') === '/settings') return <Navigate to="/settings/profile" replace />;
  if (!user) return null;
  const tabs = settingsTabsFor(user.role);

  return (
    <div>
      <PageHeader
        eyebrow={user.orgName}
        title={
          <>
            <span className="font-bold">Settings</span>
          </>
        }
        description="Your account, your organisation and how RefillBridge behaves for your team."
      />
      <nav aria-label="Settings" className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center gap-2 whitespace-nowrap rounded-t-md px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'text-brand-800' : 'text-ink-500 hover:text-ink-900',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {t.icon}
                    {t.label}
                    {isActive && <motion.span layoutId="settings-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" aria-hidden />}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
      {can(user.role, 'audit.view') && (
        <p className="mt-10 flex items-center gap-1.5 text-[12px] text-ink-400">
        <ClipboardCheck className="size-3.5" aria-hidden /> Changes to team, links and policies are recorded in the audit log.
        </p>
      )}
    </div>
  );
}
