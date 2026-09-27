import { useEffect, useId, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { Calculator, Info } from 'lucide-react';
import { computeRoi, PRICE_PER_PROVIDER, ROI_DEFAULTS, type RoiInputs } from './roi';
import { fadeUp, RevealGroup } from './landing-ui';

const usd = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const num = (v: number) => Math.round(v).toLocaleString('en-US');
const mult = (v: number) => `${v.toFixed(1)}×`;

/** Number that tweens to its new value; the final value is always what's in the DOM for assistive tech. */
function AnimatedNumber({ value, format }: { value: number; format: (v: number) => string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, format);
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.55, ease: 'easeOut' });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

const FIELDS: { key: keyof RoiInputs; label: string; min: number; max: number; step: number; prefix?: string; suffix?: string }[] = [
  { key: 'providers', label: 'Providers', min: 1, max: 200, step: 1 },
  { key: 'refills', label: 'Stuck refills / month', min: 0, max: 3000, step: 10 },
  { key: 'minutesPerRefill', label: 'Staff minutes saved per refill', min: 0, max: 60, step: 1, suffix: 'min' },
  { key: 'hourlyCost', label: 'Loaded hourly staff cost', min: 10, max: 120, step: 1, prefix: '$' },
  { key: 'calls', label: 'Patient calls avoided / month', min: 0, max: 2000, step: 10 },
  { key: 'minutesPerCall', label: 'Minutes per call', min: 1, max: 30, step: 1, suffix: 'min' },
];

function SliderField({ field, value, onChange }: { field: (typeof FIELDS)[number]; value: number; onChange: (v: number) => void }) {
  const id = useId();
  const pct = ((value - field.min) / (field.max - field.min)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[13.5px] font-medium text-ink-700">
          {field.label}
        </label>
        <div className="flex items-center gap-1 rounded-lg border border-line-strong bg-white px-2 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
          {field.prefix && <span className="text-[13px] text-ink-500">{field.prefix}</span>}
          <input
            type="number"
            aria-label={`${field.label} (exact value)`}
            min={field.min}
            max={field.max}
            step={field.step}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange(Math.max(field.min, Math.min(field.max * 10, v)));
            }}
            className="h-8 w-16 bg-transparent text-right font-mono text-[13px] font-semibold text-brand-900 focus:outline-none"
          />
          {field.suffix && <span className="text-[12px] text-ink-500">{field.suffix}</span>}
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={Math.min(value, field.max)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5 h-2 w-full cursor-pointer appearance-none rounded-full accent-brand-700"
        style={{ background: `linear-gradient(90deg, var(--color-brand-600) ${Math.min(100, pct)}%, var(--color-ice-300) ${Math.min(100, pct)}%)` }}
      />
    </div>
  );
}

export function RoiCalculator() {
  const [inputs, setInputs] = useState<RoiInputs>(ROI_DEFAULTS);
  const r = computeRoi(inputs);
  const set = (key: keyof RoiInputs) => (v: number) => setInputs((s) => ({ ...s, [key]: v }));

  const results = [
    { label: 'Staff hours saved / month', value: r.hoursSaved, format: (v: number) => `${num(v)} h` },
    { label: 'Monthly value', value: r.monthlyValue, format: usd },
    { label: 'Annual value', value: r.annualValue, format: usd },
    { label: `RefillBridge cost / month`, value: r.monthlyCost, format: usd, note: `${inputs.providers} × $${PRICE_PER_PROVIDER}` },
  ];

  return (
    <RevealGroup className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      <motion.form variants={fadeUp} onSubmit={(e) => e.preventDefault()} className="surface space-y-6 p-5 sm:p-7" aria-label="ROI calculator inputs">
        <div className="flex items-center gap-2 text-brand-800">
          <Calculator className="size-5" aria-hidden />
          <h3 className="text-[16px] font-semibold">Your practice</h3>
        </div>
        {FIELDS.map((f) => (
          <SliderField key={f.key} field={f} value={inputs[f.key]} onChange={set(f.key)} />
        ))}
      </motion.form>

      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-brand-800 to-brand-950 p-5 text-white shadow-[var(--shadow-lift)] sm:p-7">
        <div className="window-light pointer-events-none absolute inset-0 opacity-15" aria-hidden />
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand-400/30 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-200">Estimated return</p>
          <p className="mt-3 font-display text-[56px] font-bold leading-none tracking-tight sm:text-[64px]">
            <AnimatedNumber value={r.roiMultiple} format={mult} />
          </p>
          <p className="mt-2 text-sm text-brand-100/85">value returned for every dollar spent</p>
          <dl className="mt-7 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            {results.map((x) => (
              <div key={x.label} className="rounded-xl bg-white/[0.07] p-3.5 ring-1 ring-white/10 transition hover:bg-white/10">
                <dt className="text-[12px] text-brand-100/80">{x.label}</dt>
                <dd className="mt-1 font-display text-[22px] font-semibold tracking-tight">
                  <AnimatedNumber value={x.value} format={x.format} />
                </dd>
                {x.note && <dd className="text-[11.5px] text-brand-200/80">{x.note}</dd>}
              </div>
            ))}
          </dl>
          <p className="mt-6 flex items-start gap-2 text-[12px] leading-relaxed text-brand-100/80">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Illustrative estimate only. Value = refills × minutes ÷ 60 × hourly cost + calls × minutes per call ÷ 60 × hourly cost. Your pilot measures your real baseline.
          </p>
        </div>
      </motion.div>
    </RevealGroup>
  );
}
