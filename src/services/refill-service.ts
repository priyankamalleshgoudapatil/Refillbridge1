// The front-end service contract (master prompt §8). Mock (Phase 4) and real (Phase 5) implement it.
import type {
  AiNextAction,
  AiOutcome,
  AiPatientMessage,
  AiSummary,
  AnalyticsSummary,
  Attachment,
  AuditLogEntry,
  CaseDetail,
  CaseDiagnosis,
  CaseEvent,
  CaseNote,
  CaseSummary,
  DateRange,
  InfoRequest,
  IntakeExtraction,
  Invite,
  ListCasesParams,
  Member,
  Organization,
  PageParams,
  Paginated,
  PatientMatch,
  PatientNotification,
  PatientStatusView,
  PharmacyLink,
  PracticePolicies,
  SessionUser,
  SimulatorState,
  TransitionInput,
} from '@shared/dto.ts';
import type { CreateCaseInput, ExtractIntakeInput, InfoRequestInput, InviteInput, PatientMessageInput, PoliciesFormInput, SignUpInput } from '@shared/schemas/index.ts';
import type { Role } from '@shared/types.ts';

export interface RefillService {
  listCases(params: ListCasesParams): Promise<Paginated<CaseSummary>>;
  getCase(caseId: string): Promise<CaseDetail>;
  createCase(input: CreateCaseInput, idempotencyKey: string): Promise<CaseDetail>;
  transitionCase(caseId: string, input: TransitionInput, idempotencyKey: string): Promise<CaseDetail>;
  getCaseEvents(caseId: string, page: PageParams): Promise<Paginated<CaseEvent>>;
  getCaseDiagnosis(caseId: string): Promise<CaseDiagnosis>;
  claimCase(caseId: string): Promise<CaseDetail>;
  assignCase(caseId: string, userId: string): Promise<CaseDetail>;
  searchPatients(query: string): Promise<PatientMatch[]>;
  confirmPatientMatch(caseId: string, patientId: string, version: number): Promise<CaseDetail>;
  createInfoRequest(caseId: string, input: InfoRequestInput): Promise<InfoRequest>;
  answerInfoRequest(infoRequestId: string, answers: Record<string, string>): Promise<InfoRequest>;
  addCaseNote(caseId: string, body: string): Promise<CaseNote>;
  sendPatientMessage(caseId: string, input: PatientMessageInput): Promise<PatientNotification>;
  completeTask(caseId: string, taskId: string): Promise<void>;
  retryDispatch(caseId: string): Promise<CaseDetail>;
  uploadAttachment(file: File): Promise<Attachment>;
  extractIntake(input: ExtractIntakeInput): Promise<IntakeExtraction>;
  getCaseSummary(caseId: string): Promise<AiSummary>;
  suggestNextAction(caseId: string): Promise<AiNextAction>;
  draftPatientMessage(caseId: string): Promise<AiPatientMessage>;
  recordAiOutcome(suggestionId: string, outcome: AiOutcome): Promise<void>;
  verifyPatientStatus(token: string, dob: string): Promise<PatientStatusView>;
  getAnalyticsSummary(range: DateRange): Promise<AnalyticsSummary>;
  listMembers(): Promise<Member[]>;
  inviteMember(input: InviteInput): Promise<Invite>;
  updateMemberRole(memberId: string, role: Role): Promise<Member>;
  removeMember(memberId: string): Promise<void>;
  getPolicies(): Promise<PracticePolicies>;
  updatePolicies(input: PoliciesFormInput): Promise<PracticePolicies>;
  listLinkedOrgs(): Promise<Organization[]>;
  listPharmacyLinks(): Promise<PharmacyLink[]>;
  invitePharmacy(name: string, email: string): Promise<PharmacyLink>;
  updatePharmacyLink(linkId: string, status: PharmacyLink['status']): Promise<PharmacyLink>;
  listAssignableUsers(): Promise<{ id: string; name: string; role: Role }[]>;
  listAuditLogs(page: PageParams): Promise<Paginated<AuditLogEntry>>;
  getHealth(): Promise<{ status: 'ok' | 'degraded'; workers: Record<string, string>; version: string }>;
  // Demo simulator (non-production only)
  getSimulator(): Promise<SimulatorState & { quietHours: boolean; smsDown: boolean }>;
  simulate(action: SimulatorAction): Promise<void>;
  getDemoStatusLink(caseId: string): Promise<string | null>;
}

export type SimulatorAction =
  | { type: 'pharmacy_down'; minutes: number }
  | { type: 'pharmacy_up' }
  | { type: 'sms_down'; down: boolean }
  | { type: 'quiet_hours'; enabled: boolean }
  | { type: 'skip_time'; minutes: number }
  | { type: 'pharmacy_ack'; caseId: string }
  | { type: 'reset' };

export type SignInResult = { status: 'signed_in' } | { status: 'mfa_required' } | { status: 'mfa_enroll' };

export interface AuthService {
  signIn(email: string, password: string): Promise<SignInResult>;
  verifyMfa(code: string): Promise<void>;
  startMfaEnrollment(): Promise<{ secret: string; otpauthUri: string }>;
  confirmMfaEnrollment(code: string): Promise<void>;
  signUp(input: SignUpInput): Promise<{ message: string; demoVerifyEmail?: string }>;
  verifyEmail(email: string): Promise<void>;
  forgotPassword(email: string): Promise<{ message: string; demoResetToken?: string }>;
  resetPassword(token: string, password: string): Promise<void>;
  getInvite(token: string): Promise<{ email: string; role: Role; orgName: string }>;
  acceptInvite(token: string, name: string, password: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  signOut(): Promise<void>;
  currentUser(): SessionUser | null;
  devSwitchUser(userKey: string, aal: 'aal1' | 'aal2'): void;
}
