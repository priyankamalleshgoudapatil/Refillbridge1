import { useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Lock, ScrollText, Search, X } from 'lucide-react';
import type { PageParams } from '@shared/dto.ts';
import { useAuth } from '@/app/auth-context';
import { ApiError, refillService } from '@/services';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Layout';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { cn, formatDateTime, timeAgo } from '@/lib/format';
import { Callout, fadeUp, SectionHeader } from './components';

const LIMIT = 25;

export default function AuditLogPage() {
  const { runWithStepUp } = useAuth();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  // After the user dismisses the step-up prompt, background refetches must not re-open it; "Try again" re-enables it.
  const allowPrompt = useRef(true);

  const audit = useQuery({
    queryKey: ['audit', page],
    queryFn: async () => {
      const params: PageParams = { page, limit: LIMIT };
      const fetcher = () => refillService.listAuditLogs(params);
      try {
        return await (allowPrompt.current ? runWithStepUp(fetcher) : fetcher());
      } catch (err) {
        if (err instanceof ApiError && err.code === 'MFA_REQUIRED') allowPrompt.current = false;
        throw err;
      }
    },
    placeholderData: keepPreviousData,
  });

  const retry = () => {
    allowPrompt.current = true;
    void audit.refetch();
  };

  const rows = audit.data?.data ?? [];
  const needle = filter.trim().toLowerCase();
  const visible = needle ? rows.filter((r) => r.action.toLowerCase().includes(needle)) : rows;
  const total = audit.data?.meta.total ?? 0;
  const mfaNeeded = audit.error instanceof ApiError && audit.error.code === 'MFA_REQUIRED';

  return (
    <div>
      <SectionHeader title="Audit log" description="Who did what, and when — across your organisation." />
      <motion.div {...fadeUp(1)}>
        <Callout icon={<Lock className="size-4" />} tone="brand" className="mb-5">
          Append-only. Every view of patient data is recorded.
        </Callout>
      </motion.div>

      {audit.isPending ? (
        <SkeletonRows rows={6} />
      ) : audit.isError ? (
        <ErrorState title={mfaNeeded ? 'Verification needed' : "Couldn't load the audit log"} error={audit.error} onRetry={retry} />
      ) : total === 0 ? (
        <EmptyState icon={<ScrollText className="size-6" aria-hidden />} title="No audit entries yet" description="Sign-ins, case views and admin changes will appear here as they happen." />
      ) : (
        <motion.div {...fadeUp(2)} className={cn('transition-opacity', audit.isFetching && audit.isPlaceholderData && 'opacity-60')}>
          <div className="mb-4 max-w-sm">
            <Input
              label="Filter by action"
              placeholder="e.g. case.view"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              leading={<Search className="size-4" aria-hidden />}
              hint="Filters the entries on this page."
              type="search"
            />
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={<Search className="size-6" aria-hidden />}
              title="No matching entries on this page"
              description={`Nothing on page ${page} has an action containing “${filter.trim()}”.`}
              action={
                <Button variant="secondary" icon={<X className="size-4" aria-hidden />} onClick={() => setFilter('')}>
                  Clear filter
                </Button>
              }
            />
          ) : (
            <>
              <div className="surface hidden overflow-hidden md:block">
                <table className="w-full table-fixed text-sm">
                  <caption className="sr-only">Audit log entries, page {page}</caption>
                  <thead>
                    <tr className="border-b border-line bg-ice-50 text-left text-[12px] uppercase tracking-wide text-ink-400">
                      <th scope="col" className="w-[17%] px-4 py-2.5 font-medium">Time</th>
                      <th scope="col" className="w-[19%] px-4 py-2.5 font-medium">Actor</th>
                      <th scope="col" className="w-[25%] px-4 py-2.5 font-medium">Action</th>
                      <th scope="col" className="w-[25%] px-4 py-2.5 font-medium">Entity</th>
                      <th scope="col" className="w-[14%] px-4 py-2.5 font-medium">Request ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id} className="border-b border-line align-top transition-colors last:border-0 hover:bg-ice-50">
                        <td className="px-4 py-2.5 text-ink-700">
                          <time dateTime={r.createdAt} title={timeAgo(r.createdAt)}>
                            {formatDateTime(r.createdAt)}
                          </time>
                        </td>
                        <td className="truncate px-4 py-2.5 text-ink-900" title={r.actorName}>
                          {r.actorName}
                        </td>
                        <td className="px-4 py-2.5">
                          <code className="break-all rounded bg-ice-100 px-1.5 py-0.5 font-mono text-[12px] text-brand-900">{r.action}</code>
                        </td>
                        <td className="px-4 py-2.5 text-ink-700">
                          <span className="break-words">{r.entity}</span>
                          {r.entityId && <span className="block truncate font-mono text-[11.5px] text-ink-400" title={r.entityId}>{r.entityId}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <code className="font-mono text-[12px] text-ink-600" title={r.requestId}>
                            {r.requestId.slice(0, 8)}
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="space-y-2.5 md:hidden" aria-label={`Audit log entries, page ${page}`}>
                {visible.map((r) => (
                  <li key={r.id} className="surface p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <code className="min-w-0 break-all rounded bg-ice-100 px-1.5 py-0.5 font-mono text-[12px] text-brand-900">{r.action}</code>
                      <time dateTime={r.createdAt} className="shrink-0 text-[12px] text-ink-500">
                        {formatDateTime(r.createdAt)}
                      </time>
                    </div>
                    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                      <dt className="text-ink-500">Actor</dt>
                      <dd className="truncate text-ink-900">{r.actorName}</dd>
                      <dt className="text-ink-500">Entity</dt>
                      <dd className="truncate text-ink-700">
                        {r.entity}
                        {r.entityId && <span className="ml-1 font-mono text-[11.5px] text-ink-400">{r.entityId}</span>}
                      </dd>
                      <dt className="text-ink-500">Request</dt>
                      <dd className="font-mono text-[12px] text-ink-600">{r.requestId.slice(0, 8)}</dd>
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}

          <Pagination
            page={page}
            limit={LIMIT}
            total={total}
            onPage={(p) => {
              setPage(p);
              window.scrollTo?.({ top: 0, behavior: 'smooth' });
            }}
          />
        </motion.div>
      )}
    </div>
  );
}
