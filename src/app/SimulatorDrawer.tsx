import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMatch } from 'react-router-dom';
import { Activity, FastForward, MessageSquareOff, Moon, PackageCheck, RotateCcw, ServerCrash, ServerCog } from 'lucide-react';
import type { SimulatorAction } from '@/services/refill-service';
import { friendlyMessage, refillService } from '@/services';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/format';

/** Demo simulator (ENABLE_DEMO_SIMULATOR + practice_admin; disabled in production). */
export function SimulatorDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const caseMatch = useMatch('/cases/:caseId');
  const caseId = caseMatch?.params.caseId;
  const sim = useQuery({ queryKey: ['simulator'], queryFn: () => refillService.getSimulator(), enabled: open });
  const health = useQuery({ queryKey: ['health'], queryFn: () => refillService.getHealth(), enabled: open });
  const run = useMutation({
    mutationFn: (a: SimulatorAction) => refillService.simulate(a),
    onSuccess: (_d, a) => {
      void qc.invalidateQueries();
      const msg: Record<SimulatorAction['type'], string> = {
        pharmacy_down: 'Pharmacy system is now unreachable',
        pharmacy_up: 'Pharmacy system is back online',
        sms_down: 'SMS provider state changed',
        quiet_hours: 'Quiet-hours setting changed',
        skip_time: 'Clock moved forward — workers caught up',
        pharmacy_ack: 'Pharmacy acknowledged via signed webhook',
        reset: 'Demo data reset',
      };
      toast.success(msg[a.type]);
    },
    onError: (e) => toast.error("Couldn't run that", friendlyMessage(e)),
  });
  const s = sim.data;
  const pharmacyDown = s?.pharmacyDownUntil && new Date(s.pharmacyDownUntil) > new Date();

  return (
    <Drawer open={open} onClose={onClose} title="Failure simulator" description="Break dependencies on purpose to show retries, dead letters and escalations. Demo only.">
      <div className="space-y-6">
        <Section icon={<ServerCrash className="size-4" />} title="Pharmacy network (NCPDP adapter)">
          <p className="text-[13px] text-ink-500">
            {pharmacyDown ? `Unreachable until ${formatDateTime(s!.pharmacyDownUntil)}` : 'Online'} · retries at 1 → 5 → 30 → 120 min, dead letter after 5 attempts.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger" loading={run.isPending} onClick={() => run.mutate({ type: 'pharmacy_down', minutes: 240 })}>
              Take pharmacy down (4 h)
            </Button>
            <Button size="sm" variant="secondary" onClick={() => run.mutate({ type: 'pharmacy_up' })}>
              Bring back online
            </Button>
          </div>
          {caseId && (
            <Button size="sm" variant="subtle" icon={<PackageCheck className="size-4" />} onClick={() => run.mutate({ type: 'pharmacy_ack', caseId })}>
              Acknowledge this case as the pharmacy
            </Button>
          )}
        </Section>

        <Section icon={<FastForward className="size-4" />} title="Clock">
          <p className="text-[13px] text-ink-500">Offset: +{Math.round((s?.clockOffsetMinutes ?? 0) / 60)} h. Workers replay every 5 minutes of skipped time.</p>
          <div className="flex flex-wrap gap-2">
            {[
              [30, '+30 min'],
              [120, '+2 h'],
              [240, '+4 h'],
              [1440, '+1 day'],
            ].map(([m, label]) => (
              <Button key={label} size="sm" variant="secondary" onClick={() => run.mutate({ type: 'skip_time', minutes: Number(m) })}>
                {label}
              </Button>
            ))}
          </div>
        </Section>

        <Section icon={<MessageSquareOff className="size-4" />} title="Patient messaging">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>SMS provider down (falls back to email, then a staff call task)</span>
            <input type="checkbox" className="size-4 accent-brand-700" checked={Boolean(s?.smsDown)} onChange={(e) => run.mutate({ type: 'sms_down', down: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-1.5">
              <Moon className="size-4 text-ink-400" /> Enforce quiet hours (9 PM–8 AM patient time)
            </span>
            <input type="checkbox" className="size-4 accent-brand-700" checked={Boolean(s?.quietHours)} onChange={(e) => run.mutate({ type: 'quiet_hours', enabled: e.target.checked })} />
          </label>
        </Section>

        <Section icon={<Activity className="size-4" />} title="Health (/api/v1/health)">
          <div className="rounded-lg bg-ice-100 p-3 font-mono text-[12px] text-ink-700">
            <div>status: {health.data?.status ?? '…'}</div>
            {Object.entries(health.data?.workers ?? {}).map(([k, v]) => (
              <div key={k}>
                {k}: {formatDateTime(v)}
              </div>
            ))}
          </div>
        </Section>

        <div className="border-t border-line pt-4">
          <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => run.mutate({ type: 'reset' })}>
            Reset all demo data
          </Button>
          <p className="mt-1 flex items-center gap-1 text-[12px] text-ink-400">
            <ServerCog className="size-3.5" /> Mock back end · synthetic data only
          </p>
        </div>
      </div>
    </Drawer>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <span className="text-brand-600">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}
