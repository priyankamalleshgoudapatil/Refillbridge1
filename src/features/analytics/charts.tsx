// Hand-rolled, dependency-free charts. Palette: one hue (brand teal) — brand-400 / brand-800 for the
// two-series weekly chart (validated ordinal pair: monotone lightness, light end 2.45:1 on white),
// brand-600 for single-series bars. Text always wears ink tokens, never the series colour.
// Every chart ships: a title (figcaption), a legend for 2+ series, hover + keyboard-focus tooltips,
// and an sr-only table so no value is gated behind hover.
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';

export const fadeUp = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay: 0.05 * i, ease: 'easeOut' as const },
});

/** Clean integer ticks (0, 5, 10 …) for small counts. */
export function niceScale(maxValue: number, count = 4): { max: number; ticks: number[] } {
  const raw = Math.max(maxValue, 1) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  const max = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(Math.round(t));
  return { max, ticks };
}

function ChartFigure({ title, description, children, footnote }: { title: string; description?: ReactNode; children: (ids: { titleId: string }) => ReactNode; footnote?: ReactNode }) {
  const titleId = useId();
  return (
    <figure aria-labelledby={titleId} className="flex h-full flex-col">
      <figcaption className="border-b border-line px-5 py-3.5">
        <h3 id={titleId} className="text-[15px] font-semibold text-ink-900">
          {title}
        </h3>
        {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
      </figcaption>
      <div className="flex-1 px-5 py-4">{children({ titleId })}</div>
      {footnote && <p className="border-t border-line px-5 py-2.5 text-[12px] text-ink-500">{footnote}</p>}
    </figure>
  );
}

// ------------------------------------------------------------------ Weekly grouped columns

export interface WeeklyPoint {
  week: string;
  resolved: number;
  within48h: number;
}

const SERIES = [
  { key: 'resolved' as const, label: 'Resolved', swatch: 'bg-brand-400', line: 'bg-brand-400' },
  { key: 'within48h' as const, label: 'Resolved within 48 h', swatch: 'bg-brand-800', line: 'bg-brand-800' },
];

export function WeeklyColumnChart({ data, title, description, footnote }: { data: WeeklyPoint[]; title: string; description?: ReactNode; footnote?: ReactNode }) {
  const [active, setActive] = useState<number | null>(null);
  const { max, ticks } = niceScale(Math.max(0, ...data.map((d) => Math.max(d.resolved, d.within48h))));
  const pct = (v: number) => (v / max) * 100;
  const last = data.length - 1;

  return (
    <ChartFigure title={title} description={description} footnote={footnote}>
      {({ titleId }) => (
        <>
          <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-600" aria-label="Legend">
            {SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className={cn('size-2.5 rounded-[3px]', s.swatch)} aria-hidden />
                {s.label}
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            {/* y-axis */}
            <div className="relative h-48 w-7 shrink-0 text-right text-[11px] tabular-nums text-ink-400" aria-hidden>
              {ticks.map((t) => (
                <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${pct(t)}%` }}>
                  {t}
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="relative h-48" onMouseLeave={() => setActive(null)}>
                {/* recessive hairline grid */}
                {ticks.map((t) => (
                  <div key={t} className={cn('absolute inset-x-0 h-px', t === 0 ? 'bg-line-strong' : 'bg-ice-200')} style={{ bottom: `${pct(t)}%` }} aria-hidden />
                ))}
                <div className="relative flex h-full items-stretch">
                  {data.map((d, i) => {
                    const isActive = active === i;
                    const dim = active !== null && !isActive;
                    const top = Math.max(pct(d.resolved), pct(d.within48h));
                    return (
                      <div
                        key={d.week}
                        role="img"
                        tabIndex={0}
                        aria-label={`${d.week}: ${d.resolved} resolved, ${d.within48h} within 48 hours`}
                        onMouseEnter={() => setActive(i)}
                        onFocus={() => setActive(i)}
                        onBlur={() => setActive((a) => (a === i ? null : a))}
                        className={cn('relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center gap-[2px] rounded-md px-[6%] outline-offset-0 transition-colors', isActive && 'bg-brand-50/70')}
                      >
                        {SERIES.map((s) => (
                          <div
                            key={s.key}
                            className={cn('w-full max-w-6 rounded-t-[4px] transition-[opacity,height] duration-500 ease-out', s.swatch, dim && 'opacity-40')}
                            style={{ height: `${pct(d[s.key])}%` }}
                          />
                        ))}
                        {i === last && !isActive && (
                          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium tabular-nums text-ink-700" style={{ bottom: `calc(${top}% + 4px)` }} aria-hidden>
                            {d.within48h}/{d.resolved}
                          </span>
                        )}
                        {isActive && (
                          <div
                            role="tooltip"
                            className={cn(
                              'pointer-events-none absolute z-10 w-max min-w-36 rounded-lg border border-line bg-white px-3 py-2 text-left shadow-[var(--shadow-lift)]',
                              i === 0 ? 'left-0' : i === last ? 'right-0' : 'left-1/2 -translate-x-1/2',
                            )}
                            style={{ bottom: `calc(${Math.min(top, 70)}% + 10px)` }}
                          >
                            <p className="mb-1 text-[11.5px] font-medium text-ink-500">{d.week === 'This week' ? 'This week (live)' : `Week of ${d.week}`}</p>
                            {SERIES.map((s) => (
                              <p key={s.key} className="flex items-center gap-2 text-[12.5px]">
                                <span className={cn('h-0.5 w-3 rounded-full', s.line)} aria-hidden />
                                <span className="font-semibold tabular-nums text-ink-900">{d[s.key]}</span>
                                <span className="text-ink-500">{s.label.toLowerCase()}</span>
                              </p>
                            ))}
                            <p className="mt-1 border-t border-line pt-1 text-[11.5px] text-ink-500">{d.resolved ? `${Math.round((d.within48h / d.resolved) * 100)}% within 48 h` : 'No resolved cases'}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* x-axis */}
              <div className="mt-1.5 flex" aria-hidden>
                {data.map((d) => (
                  <span key={d.week} className="min-w-0 flex-1 px-0.5 text-center text-[10.5px] leading-tight text-ink-500 sm:text-[11px]">
                    {d.week}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <table className="sr-only" aria-labelledby={titleId}>
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Resolved</th>
                <th scope="col">Resolved within 48 hours</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.week}>
                  <th scope="row">{d.week}</th>
                  <td>{d.resolved}</td>
                  <td>{d.within48h}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ChartFigure>
  );
}

// ------------------------------------------------------------------ Horizontal bars (single series)

export interface HBarRow {
  key: string;
  /** Visual label (may be a badge). */
  label: ReactNode;
  /** Plain-text label for tooltips / screen readers. */
  text: string;
  value: number;
}

export function HBarChart({ rows, title, description, unit = 'cases', footnote }: { rows: HBarRow[]; title: string; description?: ReactNode; unit?: string; footnote?: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;

  return (
    <ChartFigure title={title} description={description} footnote={footnote}>
      {() => (
        <ul className="space-y-1" onMouseLeave={() => setActive(null)}>
          {rows.map((r) => {
            const isActive = active === r.key;
            const dim = active !== null && !isActive;
            const share = Math.round((r.value / total) * 100);
            return (
              <li
                key={r.key}
                tabIndex={0}
                onMouseEnter={() => setActive(r.key)}
                onFocus={() => setActive(r.key)}
                onBlur={() => setActive((a) => (a === r.key ? null : a))}
                className={cn('relative grid grid-cols-1 gap-1 rounded-lg px-2 py-1.5 transition-colors sm:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)] sm:items-center sm:gap-3', isActive && 'bg-brand-50/70')}
              >
                <span className="min-w-0 truncate text-[13px] text-ink-700">{r.label}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn('h-2.5 flex-none rounded-r-[4px] bg-brand-600 transition-[opacity,width] duration-500 ease-out', dim && 'opacity-40')}
                    style={{ width: `max(2px, calc((100% - 3.5rem) * ${r.value / max}))` }}
                    aria-hidden
                  />
                  <span className="text-[12.5px] font-medium tabular-nums text-ink-900">
                    {r.value}
                    <span className="sr-only">
                      {' '}
                      {unit}, {share}% of total
                    </span>
                  </span>
                </span>
                {isActive && (
                  <span className="pointer-events-none absolute -top-7 right-2 z-10 whitespace-nowrap rounded-md border border-line bg-white px-2 py-1 text-[11.5px] text-ink-600 shadow-[var(--shadow-soft)]" aria-hidden>
                    <span className="font-semibold text-ink-900">{r.value}</span> {unit} · {share}% of total
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ChartFigure>
  );
}
