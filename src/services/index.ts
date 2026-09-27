// The ONE place that picks mock vs real. Switching to the real back end (Phase 5) changes only this file.
import { mockAuthService } from './mock/mock-auth';
import { mockRefillService } from './mock/mock-service';
import type { AuthService, RefillService } from './refill-service';

export const refillService: RefillService = mockRefillService;
export const authService: AuthService = mockAuthService;
export const USING_MOCKS = true;

export { ApiError, friendlyMessage, newRequestId } from './errors';
export type { RefillService, AuthService } from './refill-service';
