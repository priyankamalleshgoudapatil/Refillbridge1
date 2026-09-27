import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronUp, Clock, FlaskConical, Hourglass, UserRoundCog } from 'lucide-react';
import { homeRouteFor, ROLE_LABELS } from '@shared/domain/permissions.ts';
import { authService } from '@/services';
import { USERS, type UserFixture } from '@/mocks/data/fixtures';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/format';
import { useAuth } from './auth-context';

/** DEV ONLY — instant role switching for testing every flow. Hidden when VITE_APP_ENV=production. */
export function DevRoleSwitcher() {
  const [open, setOpen] = useState(false);
  const [aal1, setAal1] = useState(false);
  const [usersList, setUsersList] = useState<UserFixture[]>(USERS);
  const { user, refresh, simulateIdleWarning, simulateExpiry } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    let active = true;
    supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0 && active) {
          setUsersList(
            data.map((u) => ({
              id: u.id,
              key: u.key,
              name: u.name,
              email: u.email,
              role: u.role,
              orgId: u.org_id,
              title: u.title,
              mfaEnrolled: Boolean(u.mfa_enrolled),
            }))
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const switchTo = (key: string) => {
    const u = usersList.find((x) => x.key === key)!;
    authService.devSwitchUser(key, aal1 ? 'aal1' : 'aal2');
    qc.clear();
    refresh();
    setOpen(false);
    navigate(homeRouteFor(u.role));
  };

  return (
    <div className="fixed bottom-20 left-3 z-[60] lg:bottom-4 lg:left-[272px]">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            className="mb-2 w-[300px] overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-lift)]"
          >
            <div className="border-b border-line bg-gradient-to-r from-brand-50 to-white px-4 py-3">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-900">
                <FlaskConical className="size-4" /> Demo tools (dev only)
              </p>
              <p className="text-[12px] text-ink-500">Switch role instantly. Data resets on page refresh.</p>
            </div>
            <ul className="max-h-[300px] overflow-y-auto p-1.5">
              {usersList.map((u) => (
                <li key={u.key}>
                  <button
                    type="button"
                    onClick={() => switchTo(u.key)}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-brand-50', user?.id === u.id && 'bg-brand-50 ring-1 ring-brand-200')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink-900">{u.name}</span>
                      <span className="block truncate text-[11.5px] text-ink-500">
                        {ROLE_LABELS[u.role]} · {u.orgId === 'org-lfm' ? 'Lakeside' : u.orgId === 'org-citycare' ? 'CityCare' : 'GreenLeaf'}
                      </span>
                    </span>
                    {user?.id === u.id && <span className="text-[11px] font-semibold text-brand-700">current</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="space-y-2 border-t border-line p-3">
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-700">
                <input type="checkbox" checked={aal1} onChange={(e) => setAal1(e.target.checked)} className="accent-brand-700" />
                Switch without MFA (aal1) to test step-up
              </label>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => { setOpen(false); simulateIdleWarning(); }} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-line px-2 py-1.5 text-[12px] text-ink-700 hover:bg-ice-100">
                  <Clock className="size-3.5" /> Idle warning
                </button>
                <button type="button" onClick={() => { setOpen(false); simulateExpiry(); }} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-line px-2 py-1.5 text-[12px] text-ink-700 hover:bg-ice-100">
                  <Hourglass className="size-3.5" /> Expire session
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-brand-200 bg-white/95 py-1.5 pl-2 pr-3 text-[12.5px] font-medium text-brand-800 shadow-[var(--shadow-soft)] backdrop-blur transition hover:shadow-[var(--shadow-glow)]"
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-brand-700 text-white">
          <UserRoundCog className="size-3.5" />
        </span>
        Demo: {user ? ROLE_LABELS[user.role] : 'switch role'}
        <ChevronUp className={cn('size-3.5 transition-transform', !open && 'rotate-180')} />
      </button>
    </div>
  );
}
