// Deterministic "Demo AI (mock)" — same interface and guardrails as the real AI gateway (§5.5–5.6).
// Real mode (Phase 5, M12) calls Claude server-side; the browser never holds a model key.
import type { FieldExtraction, IntakeExtraction } from '@shared/dto.ts';
import { detectInjection } from './engine';

export const PROMPT_VERSIONS = {
  'AI-1': 'intake-extract@1.2.0',
  'AI-2': 'blocker-assist@1.0.0',
  'AI-3': 'provider-summary@1.1.0',
  'AI-4': 'next-action@1.0.1',
  'AI-5': 'patient-message@1.0.0',
} as const;

export const MOCK_MODEL = 'demo-mock (no API key)';
export const LOW_CONFIDENCE = 0.75;

type Key = keyof IntakeExtraction['fields'];

const PATTERNS: { key: Key; re: RegExp; conf: number; transform?: (m: RegExpMatchArray) => string }[] = [
  { key: 'patientDob', re: /\b(?:DOB|D\.O\.B\.?|Date of birth)\s*[:#]?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i, conf: 0.97, transform: (m) => `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` },
  { key: 'patientPhone', re: /\b(?:Ph|Phone|Tel)\s*[:#.]?\s*(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i, conf: 0.93 },
  { key: 'quantity', re: /\b(?:Qty|Quantity|Disp)\s*[:#.]?\s*(\d{1,4})/i, conf: 0.95 },
  { key: 'sig', re: /\bSig\s*[:.]?\s*([^\n]+)/i, conf: 0.7 },
  { key: 'pharmacyName', re: /\bPharmacy\s*:\s*([^\n]+)/i, conf: 0.92 },
  { key: 'prescriberName', re: /\b(?:Prescriber|Provider|Dr)\s*[:.]\s*([^\n]+)/i, conf: 0.86 },
  { key: 'notes', re: /\bNotes?\s*[:.]\s*([^\n]+(?:\n(?!\w+\s*:)[^\n]+)*)/i, conf: 0.8 },
];

function field(value: string, conf: number, span: string | null): FieldExtraction {
  return { value: value.trim(), confidence: conf, sourceSpan: span };
}

/** AI-1 intake extraction. Every field must carry a source span or it is dropped (guardrail). */
export function mockExtract(text: string): Omit<IntakeExtraction, 'suggestionId' | 'latencyMs'> {
  const fields: IntakeExtraction['fields'] = {};
  const name = text.match(/\b(?:Patient|Pt|Name)\s*[:.]\s*([A-Z][a-zA-Z'-]+)[ ,]+([A-Z][a-zA-Z'-]+)/);
  if (name) {
    fields.patientFirstName = field(name[1], 0.96, name[0]);
    fields.patientLastName = field(name[2], 0.96, name[0]);
  }
  const med = text.match(/\b(?:Medication|Drug|Rx|Med)\s*[:.]\s*([A-Za-z][A-Za-z -]*?)\s+(\d+(?:\.\d+)?\s?(?:mg|mcg|g|units\/mL|mL))/i);
  if (med) {
    fields.medicationName = field(med[1], 0.94, med[0]);
    fields.strength = field(med[2], 0.9, med[0]);
  } else {
    const loose = text.match(/\b(?:Medication|Drug|Rx|Med)\s*[:.]\s*([^\n]+)/i);
    if (loose) fields.medicationName = field(loose[1].replace(/\s{2,}.*/, ''), 0.55, loose[0]);
  }
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) fields[p.key] = field(p.transform ? p.transform(m) : m[1].split(/\s{3,}/)[0], p.conf, m[0].trim());
  }
  // Guardrail: drop anything without a source span.
  for (const k of Object.keys(fields) as Key[]) if (!fields[k]?.sourceSpan) delete fields[k];
  const unreadable = text.trim().length < 20 || Object.keys(fields).length < 2;
  return { mock: true, fields: unreadable ? {} : fields, injectionSuspected: detectInjection(text), unreadable };
}

/** The mock can't OCR images; for an uploaded file it returns a labelled sample with lower confidence. */
export function mockExtractFromFile(fileName: string): Omit<IntakeExtraction, 'suggestionId' | 'latencyMs'> {
  const span = `[page 1 of ${fileName}]`;
  return {
    mock: true,
    injectionSuspected: false,
    unreadable: false,
    fields: {
      patientFirstName: field('Maria', 0.88, span),
      patientLastName: field('Lopez', 0.88, span),
      patientDob: field('1961-04-12', 0.71, span),
      patientPhone: field('(312) 555-0101', 0.8, span),
      medicationName: field('Metformin', 0.9, span),
      strength: field('1000 mg', 0.66, span),
      quantity: field('60', 0.83, span),
      pharmacyName: field('CityCare Pharmacy', 0.92, span),
    },
  };
}

export function hashInput(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a:${(h >>> 0).toString(16)}`;
}
