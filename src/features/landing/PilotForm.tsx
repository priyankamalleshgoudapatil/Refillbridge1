import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Building2, CheckCircle2, Mail, UserRound, Users } from 'lucide-react';
import { pilotRequestSchema } from '@shared/schemas/index.ts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

// The honeypot is judged at submit time (bots get the same success screen), so it never blocks validity.
const formSchema = pilotRequestSchema.extend({ website: z.string().optional() });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function PilotForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    mode: 'onBlur',
    defaultValues: { name: '', email: '', practice: '', website: '' },
  });

  const onSubmit = async (values: FormOutput) => {
    await sleep(800);
    if (values.website) {
      setSent(true); // honeypot tripped: pretend success, do nothing
      return;
    }
    // Demo: no network call. A real build would POST the request here.
    setSent(true);
  };

  return (
    <div className="glass relative rounded-2xl p-5 shadow-[var(--shadow-lift)] sm:p-8">
      {sent ? (
        <div key="done" className="flex flex-col items-center py-8 text-center animate-fade-in" role="status">
          <div className="relative mb-4 flex size-14 items-center justify-center rounded-2xl bg-ok-50 text-ok-600">
            <span className="absolute inset-0 animate-pulse-ring rounded-2xl bg-ok-50" aria-hidden />
            <CheckCircle2 className="relative size-7" aria-hidden />
          </div>
          <h3 className="text-xl font-semibold text-ink-900">Thanks — we'll reach out within one business day</h3>
          <p className="mt-2 max-w-sm text-sm text-ink-600">We'll set up a 30-day pilot and measure your baseline in week one.</p>
        </div>
      ) : (
        <form key="form" onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Request a pilot" className="relative grid gap-4 sm:grid-cols-2 animate-fade-in">
          <Input label="Your name" autoComplete="name" leading={<UserRound className="size-4" />} error={errors.name?.message} {...register('name')} />
          <Input label="Work email" type="email" autoComplete="email" inputMode="email" leading={<Mail className="size-4" />} error={errors.email?.message} {...register('email')} />
          <Input label="Practice" autoComplete="organization" leading={<Building2 className="size-4" />} error={errors.practice?.message} {...register('practice')} />
          <Input label="Number of providers" type="number" inputMode="numeric" min={1} leading={<Users className="size-4" />} error={errors.providers?.message} {...register('providers')} />
          <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-px w-px overflow-hidden opacity-0">
            <label>
              Website
              <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
            </label>
          </div>
          <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12.5px] text-ink-500">No spam. We only use this to contact you about a pilot.</p>
            <Button type="submit" size="lg" disabled={!isValid} loading={isSubmitting} iconRight={<ArrowRight className="size-4" aria-hidden />}>
              Request a pilot
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
