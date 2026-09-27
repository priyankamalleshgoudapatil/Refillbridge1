import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, UserCheck, Users } from 'lucide-react';
import type { PatientMatch, PracticeCaseDetail } from '@shared/dto.ts';
import { refillService } from '@/services';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/States';
import { formatDate, formatDob } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { useTransition } from './hooks';

/** R1 safety: a human picks the patient from candidates showing chart number and last visit. Never auto-merged. */
export function PatientMatchPanel({ detail }: { detail: PracticeCaseDetail }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [chosen, setChosen] = useState<PatientMatch | null>(null);
  const transition = useTransition(detail.case.id);
  const results = useQuery({ queryKey: ['patients', debounced], queryFn: () => refillService.searchPatients(debounced), enabled: debounced.trim().length >= 2 });
  const req = detail.case.requestedPayload;
  const list = debounced.trim().length >= 2 ? (results.data ?? []) : detail.matchCandidates;

  return (
    <section aria-labelledby="match-title" className="rounded-[var(--radius-card)] border border-warn-600/30 bg-warn-50/60 p-5">
      <h2 id="match-title" className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
        <Users className="size-4 text-warn-600" aria-hidden /> Please confirm the patient
      </h2>
      <p className="mt-1 text-sm text-ink-600">
        The pharmacy sent <strong>{req.patientFirstName} {req.patientLastName}</strong>, DOB {req.patientDob ? formatDob(req.patientDob) : '—'}
        {req.patientPhone ? `, phone ${req.patientPhone}` : ', no phone or chart number'}. Rule R1 needs name + DOB + one more identifier for an automatic match.
      </p>
      <div className="mt-4">
        <Input label="Search patients" placeholder="Name, chart number or DOB (YYYY-MM-DD)" value={search} onChange={(e) => setSearch(e.target.value)} leading={<Search className="size-4" />} />
      </div>
      <ul className="mt-3 space-y-2" aria-live="polite">
        {results.isFetching && (
          <li className="flex items-center gap-2 text-sm text-ink-500">
            <Spinner /> Searching…
          </li>
        )}
        {list.length === 0 && !results.isFetching && <li className="rounded-lg bg-white p-3 text-sm text-ink-500">No candidates. Search by name or chart number, or close as "Not our patient".</li>}
        {list.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-3 transition hover:border-brand-300 hover:shadow-[var(--shadow-soft)]">
            <div className="min-w-0">
              <p className="font-medium text-ink-900">{p.name}</p>
              <p className="text-[12.5px] text-ink-500">
                DOB {formatDob(p.dob)} · <span className="font-mono">{p.chartNumber}</span> · phone ••{p.phoneLast4 ?? '—'} · last visit {formatDate(p.lastVisit)}
              </p>
            </div>
            <Button size="sm" variant="secondary" icon={<UserCheck className="size-4" />} onClick={() => setChosen(p)}>
              This is the patient
            </Button>
          </li>
        ))}
      </ul>
      <Modal
        open={Boolean(chosen)}
        onClose={() => setChosen(null)}
        title="Confirm patient match"
        description="This links the request to the patient's chart and runs triage."
        icon={<UserCheck className="size-5" />}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setChosen(null)}>
              Back
            </Button>
            <Button
              loading={transition.isPending}
              onClick={async () => {
                if (!chosen) return;
                await transition.mutateAsync({ input: { action: 'CONFIRM_PATIENT_MATCH', version: detail.case.version, payload: { patientId: chosen.id } } }).catch(() => undefined);
                setChosen(null);
              }}
            >
              Confirm match
            </Button>
          </>
        }
      >
        {chosen && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-ink-400">Requested</dt>
              <dd className="font-medium">
                {req.patientFirstName} {req.patientLastName}
              </dd>
              <dd>{req.patientDob && formatDob(req.patientDob)}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Chart</dt>
              <dd className="font-medium">{chosen.name}</dd>
              <dd>
                {formatDob(chosen.dob)} · <span className="font-mono">{chosen.chartNumber}</span>
              </dd>
            </div>
          </dl>
        )}
      </Modal>
    </section>
  );
}
