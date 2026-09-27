import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseDetail, ListCasesParams, TransitionInput } from '@shared/dto.ts';
import { ApiError, friendlyMessage, newRequestId, refillService } from '@/services';
import { useAuth } from '@/app/auth-context';
import { useToast } from '@/components/ui/Toast';

export const caseKeys = {
  list: (p: ListCasesParams) => ['cases', p] as const,
  detail: (id: string) => ['case', id] as const,
  events: (id: string) => ['events', id] as const,
  diagnosis: (id: string) => ['diagnosis', id] as const,
};

export function useCases(params: ListCasesParams, opts: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: caseKeys.list(params), queryFn: () => refillService.listCases(params), placeholderData: (prev) => prev, enabled: opts.enabled });
}

export function useCase(id: string | undefined) {
  return useQuery({ queryKey: caseKeys.detail(id ?? ''), queryFn: () => refillService.getCase(id!), enabled: Boolean(id) });
}

export function useCaseEvents(id: string | undefined) {
  return useQuery({ queryKey: caseKeys.events(id ?? ''), queryFn: () => refillService.getCaseEvents(id!, { limit: 100 }), enabled: Boolean(id) });
}

export function useDiagnosis(id: string | undefined) {
  return useQuery({ queryKey: caseKeys.diagnosis(id ?? ''), queryFn: () => refillService.getCaseDiagnosis(id!), enabled: Boolean(id) });
}

export function useInvalidateCase() {
  const qc = useQueryClient();
  return (id: string, detail?: CaseDetail) => {
    if (detail) qc.setQueryData(caseKeys.detail(id), detail);
    void qc.invalidateQueries({ queryKey: caseKeys.events(id) });
    void qc.invalidateQueries({ queryKey: caseKeys.diagnosis(id) });
    void qc.invalidateQueries({ queryKey: ['cases'] });
    if (!detail) void qc.invalidateQueries({ queryKey: caseKeys.detail(id) });
  };
}

/**
 * State transitions: never optimistic (§9 F11). Idempotency key per intent; step-up MFA on 403 MFA_REQUIRED;
 * 409 CONFLICT refreshes the case and explains who changed it.
 */
export function useTransition(caseId: string) {
  const { runWithStepUp } = useAuth();
  const invalidate = useInvalidateCase();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ input, key }: { input: TransitionInput; key?: string }) => {
      const k = key ?? newRequestId();
      return runWithStepUp(() => refillService.transitionCase(caseId, input, k));
    },
    onSuccess: (detail) => invalidate(caseId, detail),
    onError: (err) => {
      if (err instanceof ApiError && (err.code === 'CONFLICT' || err.code === 'INVALID_TRANSITION')) {
        toast.warning('This case changed', err.message);
        invalidate(caseId);
      } else if (!(err instanceof ApiError && (err.code === 'MFA_REQUIRED' || err.code === 'UNAUTHENTICATED' || err.code === 'VALIDATION_ERROR'))) {
        toast.error("Couldn't save", friendlyMessage(err), err instanceof ApiError ? err.requestId : undefined);
      }
    },
  });
}
