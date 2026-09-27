import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { matchPatient } from '@shared/domain/triage-rules.ts';
import type { CaseRow, MockEngine } from '../mock/engine';
import type { ActorType } from '@shared/types.ts';

let realtimeSubscribed = false;

function defaultNextAction(status: string): string {
  switch (status) {
    case 'RECEIVED': return 'Match the patient';
    case 'NEEDS_PATIENT_MATCH': return 'Confirm which patient this is';
    case 'TRIAGE': return 'Review blockers and route';
    case 'WAITING_ON_INFO': return 'Waiting for answers from pharmacy';
    case 'WAITING_ON_PROVIDER': return 'Provider to review and decide';
    case 'WAITING_ON_PATIENT_VISIT': return "Book the patient's visit";
    case 'WAITING_ON_INSURANCE': return 'Resolve the insurance issue';
    case 'APPROVED': return 'Deliver approval to pharmacy';
    case 'DENIED': return 'Notify pharmacy and patient';
    case 'SENT_TO_PHARMACY': return 'CityCare Pharmacy to confirm receipt';
    case 'PHARMACY_CONFIRMED': return 'Pharmacy to start filling';
    case 'FILLING': return 'Pharmacy to mark ready for pickup';
    case 'READY_FOR_PICKUP': return 'Patient to pick up';
    case 'DISPENSED': return 'Complete the case';
    case 'CLOSED': return 'None — case is finished';
    default: return 'Review case';
  }
}

/**
 * Loads all records directly from the live Supabase PostgreSQL database
 * and populates the engine state so that all frontend queries, triage,
 * state machine, and permissions reflect the live Supabase data.
 */
export async function syncFromSupabase(eng: MockEngine): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const [
      orgsRes,
      usersRes,
      patientsRes,
      rxRes,
      encRes,
      obsRes,
      casesRes,
      eventsRes,
      notesRes,
      tasksRes,
      policiesRes,
      linksRes,
    ] = await Promise.all([
      supabase.from('organizations').select('*'),
      supabase.from('users').select('*'),
      supabase.from('patients').select('*'),
      supabase.from('prescriptions').select('*'),
      supabase.from('encounters').select('*'),
      supabase.from('observations').select('*'),
      supabase.from('cases').select('*'),
      supabase.from('case_events').select('*'),
      supabase.from('case_notes').select('*'),
      supabase.from('case_tasks').select('*'),
      supabase.from('practice_policies').select('*'),
      supabase.from('pharmacy_links').select('*'),
    ]);

    if (orgsRes.data && orgsRes.data.length > 0) {
      eng.db.orgs = orgsRes.data.map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        timezone: o.timezone,
        phone: o.phone,
        city: o.city,
      }));
    }

    if (usersRes.data && usersRes.data.length > 0) {
      eng.db.users = usersRes.data.map((u) => ({
        id: u.id,
        key: u.key,
        name: u.name,
        email: u.email,
        role: u.role,
        orgId: u.org_id,
        title: u.title,
        mfaEnrolled: Boolean(u.mfa_enrolled),
        password: u.password_hash,
        status: 'active',
        lastActive: new Date().toISOString(),
      }));
    }

    if (patientsRes.data && patientsRes.data.length > 0) {
      eng.db.patients = patientsRes.data.map((p) => ({
        id: p.id,
        practiceOrgId: p.practice_org_id,
        firstName: p.first_name,
        lastName: p.last_name,
        dob: p.dob,
        phone: p.phone,
        email: p.email,
        chartNumber: p.chart_number,
        smsOptOut: Boolean(p.sms_opt_out),
        preferredChannel: p.preferred_channel ?? (p.sms_opt_out ? 'email' : 'sms'),
      }));
    }

    if (rxRes.data && rxRes.data.length > 0) {
      eng.db.prescriptions = rxRes.data.map((r) => ({
        id: r.id,
        practiceOrgId: r.practice_org_id,
        patientId: r.patient_id,
        prescriberId: r.prescriber_id,
        medicationName: r.medication_name,
        strength: r.strength,
        form: r.form ?? 'tablet',
        sig: r.sig ?? 'Take 1 tablet by mouth daily',
        quantity: r.quantity ?? 30,
        daysSupply: r.days_supply ?? 30,
        refillsAuthorized: r.refills_authorized ?? 5,
        refillsRemaining: r.refills_remaining ?? 0,
        writtenAt: r.written_at ?? new Date().toISOString(),
        lastFillAt: r.last_fill_at ?? new Date().toISOString(),
        drugClass: r.drug_class ?? 'other',
        controlledSchedule: r.controlled_schedule ?? undefined,
        status: r.status ?? 'active',
        discontinuedReason: r.discontinued_reason ?? undefined,
        requireClinicalReview: Boolean(r.require_clinical_review),
      }));
    }

    if (encRes.data && encRes.data.length > 0) {
      eng.db.encounters = encRes.data.map((e) => ({
        id: e.id,
        patientId: e.patient_id,
        providerId: e.provider_id,
        occurredAt: e.occurred_at,
        type: e.type,
      }));
    }

    if (obsRes.data && obsRes.data.length > 0) {
      eng.db.observations = obsRes.data.map((o) => ({
        id: o.id,
        patientId: o.patient_id,
        code: o.code,
        observedAt: o.observed_at,
        value: o.value,
      }));
    }

    if (casesRes.data && casesRes.data.length > 0) {
      eng.db.statusTokens = [];
      const syncedCases = casesRes.data.map((c) => {
        const existing = eng.db.cases.find((x) => x.id === c.id || x.caseNumber === c.case_number);
        if (existing && existing.id !== c.id) {
          for (const key of Object.keys(eng.seedKeys)) {
            if (eng.seedKeys[key] === existing.id) {
              eng.seedKeys[key] = c.id;
            }
          }
        }
        const caseRow: CaseRow = {
          id: c.id,
          caseNumber: c.case_number,
          practiceOrgId: c.practice_org_id,
          pharmacyOrgId: c.pharmacy_org_id,
          patientId: c.patient_id,
          prescriptionId: c.prescription_id,
          source: c.source,
          status: c.status,
          priority: c.priority,
          ownerRole: c.owner_role,
          ownerUserId: c.owner_user_id,
          dueAt: c.due_at,
          statusSince: c.status_since,
          version: c.version,
          requestedPayload: c.requested_payload,
          blockers: (c.blockers && c.blockers.length > 0) ? c.blockers : (existing?.blockers ?? []),
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          resolution: existing?.resolution ?? (c.status === 'CLOSED' ? 'completed' : null),
          escalationLevel: existing?.escalationLevel ?? 0,
          injectionSuspected: existing?.injectionSuspected ?? false,
          linkedCaseId: existing?.linkedCaseId ?? null,
          createdBy: c.owner_user_id ?? existing?.createdBy ?? 'system',
          cancelReason: existing?.cancelReason ?? null,
          conflicts: existing?.conflicts ?? [],
          matchCandidateIds: existing?.matchCandidateIds ?? [],
          suggestedAction: existing?.suggestedAction ?? null,
          nextAction: existing?.nextAction ?? defaultNextAction(c.status),
        };

        if (!caseRow.patientId && caseRow.status === 'NEEDS_PATIENT_MATCH') {
          const orgPatients = eng.db.patients.filter((p) => p.practiceOrgId === caseRow.practiceOrgId);
          const matchRes = matchPatient(caseRow.requestedPayload, orgPatients);
          if (matchRes.kind === 'uncertain') {
            caseRow.matchCandidateIds = matchRes.candidates.map((p) => p.id);
          }
        }
        if (c.patient_token) {
          eng.db.statusTokens.push({
            caseId: c.id,
            token: c.patient_token,
            expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
            failedAttempts: 0,
            lockedAt: null,
          });
        }
        return caseRow;
      });
      const syncedCaseIds = new Set(syncedCases.map((c) => c.id));
      const syncedCaseNumbers = new Set(syncedCases.map((c) => c.caseNumber));
      const localOnlyCases = eng.db.cases.filter((c) => !syncedCaseIds.has(c.id) && !syncedCaseNumbers.has(c.caseNumber));
      eng.db.cases = [...syncedCases, ...localOnlyCases];
    }

    if (eventsRes.data && eventsRes.data.length > 0) {
      const supabaseEvents = eventsRes.data.map((e) => {
        const existing = eng.db.events.find((x) => x.id === e.id);
        const actor = typeof e.actor === 'object' && e.actor ? (e.actor as { kind?: string; role?: string; name?: string }) : {};
        const actorType: ActorType = existing?.actorType ?? (actor.kind === 'ai' ? 'ai' : actor.kind === 'pharmacy_system' ? 'pharmacy_system' : actor.role ? 'user' : 'system');
        
        let eventType = existing?.eventType ?? e.action ?? 'event';
        if (!existing?.eventType || eventType === 'event') {
          if (e.action === 'PHARMACY_ACKNOWLEDGED' || e.action === 'pharmacy.acknowledged' || e.to_status === 'PHARMACY_CONFIRMED') {
            eventType = 'pharmacy.acknowledged';
          } else if (e.action === 'DISPATCH_SUCCEEDED' || e.action === 'dispatch.sent' || e.to_status === 'SENT_TO_PHARMACY') {
            eventType = 'dispatch.sent';
          } else if (e.to_status === 'FILLING') {
            eventType = 'pharmacy.filling';
          } else if (e.to_status === 'READY_FOR_PICKUP') {
            eventType = 'pharmacy.ready';
          } else if (e.to_status === 'DISPENSED') {
            eventType = 'pharmacy.dispensed';
          } else if (e.to_status === 'CLOSED') {
            eventType = 'case.closed';
          } else if (e.to_status === 'APPROVED') {
            eventType = 'decision.approved';
          } else if (e.to_status === 'DENIED') {
            eventType = 'decision.denied';
          } else if (e.to_status === 'WAITING_ON_PATIENT_VISIT') {
            eventType = 'decision.visit_required';
          } else if (e.to_status === 'WAITING_ON_INFO') {
            eventType = 'info.requested_pharmacy';
          } else if (e.to_status === 'CANCELLED') {
            eventType = 'case.cancelled';
          } else if (e.to_status === 'RECEIVED') {
            eventType = 'case.created';
          } else if (e.to_status === 'TRIAGE') {
            eventType = 'case.triage';
          } else if (e.reason?.includes('SLA')) {
            eventType = 'sla.escalated';
          }
        }

        const title = existing?.title ?? (
          eventType === 'pharmacy.acknowledged' ? 'Pharmacy confirmed receipt' :
          eventType === 'dispatch.sent' ? 'Approval delivered to pharmacy' :
          eventType === 'pharmacy.filling' ? 'Medication being filled' :
          eventType === 'pharmacy.ready' ? 'Ready for pickup' :
          eventType === 'pharmacy.dispensed' ? 'Dispensed to patient' :
          e.action ? e.action.replace(/_/g, ' ') : 'Case updated'
        );

        return {
          id: e.id,
          caseId: e.case_id,
          actorType,
          actorName: existing?.actorName ?? actor.name ?? (eventType.startsWith('pharmacy.') ? 'Pharmacy' : 'RefillBridge'),
          eventType,
          title,
          fromStatus: e.from_status ?? existing?.fromStatus ?? null,
          toStatus: e.to_status ?? existing?.toStatus ?? null,
          reason: e.reason ?? existing?.reason ?? null,
          ruleIds: e.rule_ids ?? existing?.ruleIds ?? [],
          aiSuggestionId: existing?.aiSuggestionId ?? null,
          promptVersion: existing?.promptVersion ?? null,
          requestId: existing?.requestId ?? 'req-db',
          public: existing?.public ?? true,
          createdAt: e.created_at ?? existing?.createdAt,
        };
      });
      const dbEventIds = new Set(supabaseEvents.map((e) => e.id));
      const localOnlyEvents = eng.db.events.filter((e) => !dbEventIds.has(e.id) && !eventsRes.data?.some((d) => d.case_id === e.caseId && d.action === e.eventType));
      eng.db.events = [...supabaseEvents, ...localOnlyEvents];
    }

    if (notesRes.data && notesRes.data.length > 0) {
      eng.db.notes = notesRes.data.map((n) => ({
        id: n.id,
        caseId: n.case_id,
        authorName: n.author_name,
        body: n.body,
        createdAt: n.created_at,
      }));
    }

    if (tasksRes.data && tasksRes.data.length > 0) {
      eng.db.tasks = tasksRes.data.map((t) => ({
        id: t.id,
        caseId: t.case_id,
        orgId: t.org_id,
        type: t.type ?? 'review',
        title: t.title,
        assigneeRole: t.assignee_role,
        assigneeName: t.assignee_name,
        status: t.status,
        dueAt: t.due_at ?? new Date().toISOString(),
      }));
    }

    if (linksRes.data && linksRes.data.length > 0) {
      eng.db.links = linksRes.data.map((l) => ({
        id: l.id,
        practiceOrgId: l.practice_org_id,
        pharmacyOrgId: l.pharmacy_org_id,
        practiceName: 'Lakeside Family Medicine',
        pharmacyName: l.pharmacy_name,
        status: l.status,
        city: 'Chicago, IL',
        casesLast30d: l.cases_last_30d ?? 0,
      }));
    }

    if (policiesRes.data && policiesRes.data.length > 0) {
      for (const p of policiesRes.data) {
        if (p.practice_org_id && p.policies) {
          eng.db.policies[p.practice_org_id] = p.policies[p.practice_org_id] ?? p.policies;
        }
      }
    }
  } catch (err) {
    console.warn('[supabase-sync] Failed to sync from Supabase:', err);
  }
}

/**
 * Sets up live Realtime subscription to automatically re-sync when any row in
 * cases, case_notes, case_tasks, patients, or users changes in Supabase.
 */
export function setupRealtimeSync(eng: MockEngine, onChange: () => void): void {
  if (!isSupabaseConfigured || realtimeSubscribed || typeof window === 'undefined') return;
  realtimeSubscribed = true;

  try {
    supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, async () => {
        await syncFromSupabase(eng);
        onChange();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_notes' }, async () => {
        await syncFromSupabase(eng);
        onChange();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_tasks' }, async () => {
        await syncFromSupabase(eng);
        onChange();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, async () => {
        await syncFromSupabase(eng);
        onChange();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, async () => {
        await syncFromSupabase(eng);
        onChange();
      })
      .subscribe();
  } catch (err) {
    console.warn('[supabase-sync] Realtime subscription not enabled or failed:', err);
  }
}

/**
 * Persists a newly created case to Supabase.
 */
export async function persistNewCase(c: CaseRow): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.from('cases').insert({
      id: c.id,
      case_number: c.caseNumber,
      practice_org_id: c.practiceOrgId,
      pharmacy_org_id: c.pharmacyOrgId,
      patient_id: c.patientId,
      prescription_id: c.prescriptionId,
      source: c.source,
      status: c.status,
      priority: c.priority,
      owner_role: c.ownerRole,
      owner_user_id: c.ownerUserId,
      due_at: c.dueAt,
      status_since: c.statusSince,
      version: c.version,
      requested_payload: c.requestedPayload,
      blockers: c.blockers,
      patient_token: (c as { patientToken?: string }).patientToken ?? `tok-${c.id}`,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    });
  } catch (err) {
    console.warn('[supabase-sync] Failed to persist new case:', err);
  }
}

/**
 * Persists a new case note to Supabase.
 */
export async function persistCaseNote(note: {
  id: string;
  caseId: string;
  authorName: string;
  body: string;
  createdAt: string;
}): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.from('case_notes').insert({
      id: note.id,
      case_id: note.caseId,
      author_name: note.authorName,
      body: note.body,
      created_at: note.createdAt,
    });
  } catch (err) {
    console.warn('[supabase-sync] Failed to persist note:', err);
  }
}

/**
 * Persists a task completion to Supabase.
 */
export async function persistTaskCompletion(taskId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.from('case_tasks').update({ status: 'done' }).eq('id', taskId);
  } catch (err) {
    console.warn('[supabase-sync] Failed to persist task completion:', err);
  }
}

/**
 * Persists a case assignment or ownership claim to Supabase.
 */
export async function persistCaseOwner(caseId: string, ownerUserId: string | null): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase
      .from('cases')
      .update({ owner_user_id: ownerUserId, updated_at: new Date().toISOString() })
      .eq('id', caseId);
  } catch (err) {
    console.warn('[supabase-sync] Failed to persist case owner:', err);
  }
}

/**
 * Persists a patient match confirmation to Supabase.
 */
export async function persistPatientMatch(caseId: string, patientId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase
      .from('cases')
      .update({
        patient_id: patientId,
        status: 'TRIAGE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId);
  } catch (err) {
    console.warn('[supabase-sync] Failed to persist patient match:', err);
  }
}

/**
 * Persists a case status transition to Supabase.
 */
export async function persistCaseTransition(
  c: CaseRow,
  action: string,
  actor: { id: string; name: string; role: string },
): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase
      .from('cases')
      .update({
        status: c.status,
        priority: c.priority,
        owner_user_id: c.ownerUserId,
        owner_role: c.ownerRole,
        due_at: c.dueAt,
        status_since: c.statusSince,
        version: c.version,
        blockers: c.blockers,
        updated_at: c.updatedAt,
      })
      .eq('id', c.id);

    await supabase.from('case_events').insert({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      case_id: c.id,
      actor,
      from_status: null,
      to_status: c.status,
      action,
      reason: null,
      rule_ids: [],
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[supabase-sync] Failed to persist case transition:', err);
  }
}
