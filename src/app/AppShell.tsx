import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  ClipboardList,
  FlaskRound,
  Inbox,
  LogOut,
  Menu,
  PhoneIncoming,
  PlusCircle,
  Settings,
  ShieldCheck,
  Stethoscope,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';
import { can, ROLE_LABELS } from '@shared/domain/permissions.ts';
import type { Role } from '@shared/types.ts';
import { refillService } from '@/services';
import { Logo } from '@/components/ui/Layout';
import { Drawer } from '@/components/ui/Modal';
import { cn } from '@/lib/format';
import { useOnline } from '@/lib/hooks';
import { useAuth } from './auth-context';
import { DevRoleSwitcher } from './DevRoleSwitcher';
import { SimulatorDrawer } from './SimulatorDrawer';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: readonly Role[];
  end?: boolean;
}

const I = 'size-[18px]';
const NAV: NavItem[] = [
  { to: '/provider/inbox', label: 'Provider inbox', icon: <Stethoscope className={I} />, roles: ['provider'] },
  { to: '/queue', label: 'Refill queue', icon: <ClipboardList className={I} />, roles: ['practice_admin', 'practice_staff', 'provider'] },
  { to: '/cases/new', label: 'Phone request', icon: <PhoneIncoming className={I} />, roles: ['practice_admin', 'practice_staff'] },
  { to: '/pharmacy/requests', label: 'Requests', icon: <Inbox className={I} />, roles: ['pharmacy_admin', 'pharmacy_staff'], end: true },
  { to: '/pharmacy/requests/new', label: 'New request', icon: <PlusCircle className={I} />, roles: ['pharmacy_admin', 'pharmacy_staff'] },
  { to: '/analytics', label: 'Analytics', icon: <BarChart3 className={I} />, roles: ['practice_admin', 'provider', 'pharmacy_admin'] },
  { to: '/settings/profile', label: 'Settings', icon: <Settings className={I} />, roles: ['practice_admin', 'provider', 'practice_staff', 'pharmacy_admin', 'pharmacy_staff'] },
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const online = useOnline();
  const [menuOpen, setMenuOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const location = useLocation();
  const health = useQuery({ queryKey: ['health'], queryFn: () => refillService.getHealth(), refetchInterval: 60_000 });

  useEffect(() => setMenuOpen(false), [location.pathname]);
  if (!user) return null;
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const mobileTabs = items.slice(0, 3);

  return (
    <div className="app-backdrop min-h-screen">
      <a href="#main" className="sr-only z-[90] rounded bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-white/80 backdrop-blur-xl lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <div className="mx-4 mb-3 rounded-xl border border-line bg-gradient-to-br from-brand-50 to-white px-3 py-2.5">
          <p className="truncate text-[13px] font-semibold text-brand-900">{user.orgName}</p>
          <p className="text-[12px] text-ink-500">{user.orgType === 'practice' ? 'Physician practice' : 'Pharmacy'}</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
          {items.map((item, i) => (
            <motion.div key={item.to} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
              <SideLink item={item} />
            </motion.div>
          ))}
        </nav>
        {can(user.role, 'simulator.use') && import.meta.env.VITE_APP_ENV !== 'production' && (
          <button type="button" onClick={() => setSimOpen(true)} className="mx-3 mb-2 flex items-center gap-2.5 rounded-lg border border-dashed border-brand-300 px-3 py-2 text-[13px] font-medium text-brand-700 transition hover:bg-brand-50">
            <FlaskRound className="size-4" /> Failure simulator
          </button>
        )}
        <UserCard onSignOut={() => void signOut('manual')} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-white/85 px-4 backdrop-blur-xl lg:hidden">
        <Logo />
        <button type="button" onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-ink-700 hover:bg-brand-50" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </header>

      <div className="lg:pl-64">
        <AnimatePresence>
          {!online && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-warn-600 text-white">
              <p role="status" className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium">
                <WifiOff className="size-4" /> You're offline. Changes are paused until you reconnect.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {health.data?.status === 'degraded' && (
          <p role="status" className="flex items-center justify-center gap-2 bg-warn-50 px-4 py-2 text-sm text-warn-700">
            <AlertTriangle className="size-4" /> Background jobs delayed — reminders and escalations may be late.
          </p>
        )}
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tabs (max 4: 3 destinations + menu) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Main">
        {mobileTabs.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-ink-500')}>
            {item.icon}
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
        <button type="button" onClick={() => setMenuOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-ink-500">
          <Menu className={I} />
          More
        </button>
      </nav>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={user.orgName} description={`${user.name} · ${ROLE_LABELS[user.role]}`}>
        <nav className="space-y-1" aria-label="Mobile">
          {items.map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
        </nav>
        {can(user.role, 'simulator.use') && (
          <button type="button" onClick={() => setSimOpen(true)} className="mt-4 flex w-full items-center gap-2.5 rounded-lg border border-dashed border-brand-300 px-3 py-2.5 text-sm font-medium text-brand-700">
            <FlaskRound className="size-4" /> Failure simulator
          </button>
        )}
        <button type="button" onClick={() => void signOut('manual')} className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ice-100">
          <LogOut className="size-4" /> Sign out
        </button>
      </Drawer>
      <SimulatorDrawer open={simOpen} onClose={() => setSimOpen(false)} />
      {import.meta.env.VITE_APP_ENV !== 'production' && <DevRoleSwitcher />}
    </div>
  );
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
          isActive ? 'bg-brand-700 text-white shadow-[0_8px_20px_-10px_rgb(27_77_91/0.8)]' : 'text-ink-600 hover:bg-brand-50 hover:text-brand-800',
        )
      }
    >
      <span className="transition-transform duration-200 group-hover:scale-110">{item.icon}</span>
      {item.label}
    </NavLink>
  );
}

function UserCard({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  const initials = user.name.replace(/^Dr\.\s*/, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('');
  return (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-3 rounded-xl p-2">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-[13px] font-semibold text-white">{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">{user.name}</p>
          <p className="flex items-center gap-1 text-[12px] text-ink-500">
            {ROLE_LABELS[user.role]}
            {user.aal === 'aal2' && (
              <span className="inline-flex items-center gap-0.5 text-ok-700" title="MFA verified this session">
                <ShieldCheck className="size-3" /> MFA
              </span>
            )}
          </p>
        </div>
        <button type="button" onClick={onSignOut} className="rounded-md p-2 text-ink-500 transition hover:bg-bad-50 hover:text-bad-600" aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

export default AppShell;
