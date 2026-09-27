// Zod schemas — one source for client forms and server validation.
import { z } from 'zod';
import { DENY_REASON_CODES, ROLES } from '../types.ts';

// ------------------------------------------------------------------ Auth

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { id: 'upper', label: 'An uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'A lowercase letter', test: (v: string) => /[a-z]/.test(v) },
  { id: 'digit', label: 'A number', test: (v: string) => /\d/.test(v) },
  { id: 'symbol', label: 'A symbol', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

/** Password policy incl. "must not contain your email or name". */
export function passwordIssues(password: string, ctx: { email?: string; name?: string }): string[] {
  const issues: string[] = PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.label);
  const lower = password.toLowerCase();
  const emailLocal = (ctx.email ?? '').split('@')[0]?.toLowerCase() ?? '';
  if (emailLocal.length >= 3 && lower.includes(emailLocal)) issues.push('Must not contain your email');
  const nameParts = (ctx.name ?? '').toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
  if (nameParts.some((p) => lower.includes(p))) issues.push('Must not contain your name');
  return issues;
}

const email = z.string().trim().min(1, 'Enter your email').email('Enter a valid email');

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    orgName: z.string().trim().min(2, 'Enter your organisation name').max(120),
    orgType: z.enum(['practice', 'pharmacy']),
    fullName: z.string().trim().min(2, 'Enter your full name').max(120),
    email,
    password: z.string(),
    website: z.string().max(0).optional(), // honeypot — must stay empty
  })
  .superRefine((v, ctx) => {
    const issues = passwordIssues(v.password, { email: v.email, name: v.fullName });
    if (issues.length) ctx.addIssue({ code: 'custom', path: ['password'], message: issues[0] });
  });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const setPasswordSchema = (ctx: { email?: string; name?: string }) =>
  z
    .object({ password: z.string(), confirm: z.string() })
    .superRefine((v, c) => {
      const issues = passwordIssues(v.password, ctx);
      if (issues.length) c.addIssue({ code: 'custom', path: ['password'], message: issues[0] });
      if (v.password !== v.confirm) c.addIssue({ code: 'custom', path: ['confirm'], message: "Passwords don't match" });
    });

export const forgotPasswordSchema = z.object({ email });
export const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });

// ------------------------------------------------------------------ Intake

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const requestedPayloadSchema = z.object({
  patientFirstName: z.string().trim().min(1, 'Required').max(80),
  patientLastName: z.string().trim().min(1, 'Required').max(80),
  patientDob: isoDate.refine((v) => new Date(v) < new Date(), 'Date of birth must be in the past'),
  patientPhone: z.string().trim().max(30).optional().or(z.literal('')),
  chartNumber: z.string().trim().max(30).optional().or(z.literal('')),
  medicationName: z.string().trim().min(1, 'Required').max(120),
  strength: z.string().trim().min(1, 'Required').max(40),
  quantity: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole number').min(1, 'At least 1').max(1000),
  sig: z.string().trim().max(300).optional().or(z.literal('')),
  pharmacyName: z.string().trim().min(1, 'Required').max(120),
  prescriberName: z.string().trim().max(120).optional().or(z.literal('')),
  reportedRefillsRemaining: z.coerce.number().int().min(0).max(99).optional(),
  reportedDaysSupplyLeft: z.coerce.number().int().min(0).max(365).optional(),
  insuranceFlag: z.enum(['PA_REQUIRED', 'NOT_COVERED', 'INSURANCE_CHANGED']).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});
export type RequestedPayloadInput = z.infer<typeof requestedPayloadSchema>;

export const createCaseSchema = z.object({
  source: z.enum(['portal', 'electronic', 'fax', 'phone']),
  practiceOrgId: z.string().min(1, 'Choose a practice'),
  payload: requestedPayloadSchema,
  attachmentId: z.string().optional(),
  aiSuggestionId: z.string().optional(),
});
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const extractIntakeSchema = z
  .object({ text: z.string().max(8000, 'Maximum 8,000 characters').optional(), attachmentId: z.string().optional() })
  .refine((v) => (v.text && v.text.trim().length > 0) || v.attachmentId, 'Paste fax text or upload a file');
export type ExtractIntakeInput = z.infer<typeof extractIntakeSchema>;

export const ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// ------------------------------------------------------------------ Decisions & transitions

export const decisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'APPROVE_MODIFIED', 'APPROVE_BRIDGE_REQUIRE_VISIT', 'REQUIRE_VISIT', 'DENY']),
    medicationName: z.string().trim().min(1, 'Required'),
    strength: z.string().trim().min(1, 'Required'),
    quantity: z.coerce.number().int().min(1, 'At least 1').max(1000),
    daysSupply: z.coerce.number().int().min(1, 'At least 1').max(365),
    refills: z.coerce.number().int().min(0).max(11),
    bridgeDays: z.coerce.number().int().min(1, 'At least 1 day').optional(),
    reasonCode: z.enum(DENY_REASON_CODES).optional(),
    patientNextStep: z.string().trim().max(300).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'APPROVE_BRIDGE_REQUIRE_VISIT' && !v.bridgeDays)
      ctx.addIssue({ code: 'custom', path: ['bridgeDays'], message: 'Enter the bridge supply in days' });
    if (v.decision === 'DENY') {
      if (!v.reasonCode) ctx.addIssue({ code: 'custom', path: ['reasonCode'], message: 'Choose a reason' });
      if (!v.patientNextStep || v.patientNextStep.length < 5)
        ctx.addIssue({ code: 'custom', path: ['patientNextStep'], message: 'Tell the patient what to do next' });
    }
  });
export type DecisionInput = z.infer<typeof decisionSchema>;

export const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a short reason').max(500) });

export const infoRequestSchema = z.object({
  requestedFrom: z.enum(['pharmacy', 'patient', 'staff']),
  questions: z
    .array(z.object({ text: z.string().trim().min(3, 'Write the question').max(300) }))
    .min(1, 'Add at least one question')
    .max(5),
});
export type InfoRequestInput = z.infer<typeof infoRequestSchema>;

export const noteSchema = z.object({ body: z.string().trim().min(1, 'Write a note').max(2000, 'Maximum 2,000 characters') });

export const patientMessageSchema = z.object({
  template: z.enum([
    'received',
    'under_review',
    'info_needed',
    'visit_needed',
    'approved_sent',
    'delayed_insurance',
    'not_approved',
    'ready_for_pickup',
    'free_text',
  ]),
  text: z.string().trim().max(300, 'SMS maximum is 300 characters').optional(),
  reviewed: z.boolean().optional(),
});
export type PatientMessageInput = z.infer<typeof patientMessageSchema>;

export const dobVerifySchema = z.object({
  dob: isoDate,
  company: z.string().max(0).optional(), // honeypot
});

export const inviteSchema = z.object({
  email,
  role: z.enum(ROLES),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const policiesSchema = z.object({
  maxBridgeDays: z.coerce.number().int().min(1).max(90),
  rxValidityMonths: z.coerce.number().int().min(1).max(24),
  tooEarlyThreshold: z.coerce.number().min(0.5).max(1),
  providerSlaHours: z.coerce.number().int().min(1).max(72),
  providerUrgentSlaHours: z.coerce.number().int().min(1).max(24),
  pharmacyAckHours: z.coerce.number().int().min(1).max(24),
  bloodPressureVisitMonths: z.coerce.number().int().min(1).max(24),
  diabetesA1cMonths: z.coerce.number().int().min(1).max(24),
  diabetesVisitMonths: z.coerce.number().int().min(1).max(24),
  antidepressantVisitMonths: z.coerce.number().int().min(1).max(24),
  adhdVisitMonths: z.coerce.number().int().min(1).max(24),
});
export type PoliciesFormInput = z.infer<typeof policiesSchema>;

export const pilotRequestSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name'),
  email,
  practice: z.string().trim().min(2, 'Enter your practice'),
  providers: z.coerce.number().int().min(1, 'At least 1').max(1000),
  website: z.string().max(0).optional(), // honeypot
});
