import type { JsonValue, PatientInputJson } from "@/lib/patient-access/service";

export const FOLLOW_UP_CONTEXT_VERSION = "P01_FOLLOW_UP_v6" as const;
export const FOLLOW_UP_SERVER_CONTEXT_VERSION = "P01_FOLLOW_UP_SERVER_v1" as const;

export type FollowUpIntent = "EXISTING_CONCERN" | "NEW_CONCERN";

export type FollowUpItemChangeAction = "STARTED" | "STOPPED" | "USAGE_CHANGED";
export type FollowUpItemChangeSelection = "NO_CHANGE" | FollowUpItemChangeAction[];

export type FollowUpChangeState = {
  generalHealth?: "NO_CHANGE" | "CHANGED";
  /** Multiple actions are allowed because a patient can start one item and stop another between visits. */
  medicationsSupplements?: FollowUpItemChangeSelection;
  /** Multiple actions are allowed because different hair/scalp treatments can change independently. */
  hairTreatments?: FollowUpItemChangeSelection;
  hairProcedures?: "NO" | "YES";
  triggerEvents?: "NO" | "YES" | "UNSURE";
  sexSpecific?: "NO_CHANGE" | "CHANGED";
  hairQualityLifestyle?: "NO_CHANGE" | "CHANGED";
};

export function followUpChangeAnswered(value: FollowUpChangeState[keyof FollowUpChangeState] | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0;
}

export function followUpChangeHasAction(
  value: FollowUpItemChangeSelection | undefined,
  action: FollowUpItemChangeAction,
): boolean {
  return Array.isArray(value) && value.includes(action);
}

export function followUpChangeIsNoChange(value: FollowUpItemChangeSelection | undefined): boolean {
  return value === "NO_CHANGE";
}


export interface FollowUpNamedHistoryItem {
  id: string;
  name: string;
  date?: JsonValue;
  details?: string;
}

export interface FollowUpExistingItemChange {
  sourceResponseId: string;
  sourceQuestionCode: string;
  sourceScopeKey: string;
  /** Distinguishes multiple repeatable items stored in one response value. */
  sourceItemIndex?: number;
  itemLabel: string;
  action: "STOPPED" | "USAGE_CHANGED";
  date?: JsonValue;
  details?: string;
}

export interface FollowUpNewHairTreatment {
  id: string;
  name: string;
  start?: JsonValue;
  stillUsing?: "YES" | "NO";
  stop?: JsonValue;
}

export interface FollowUpNewProcedure {
  id: string;
  procedure: string;
  count: string;
  lastDate?: JsonValue;
  /** Present when this visit records additional sessions for a procedure already in the longitudinal record. */
  sourceResponseId?: string;
  sourceQuestionCode?: string;
  sourceScopeKey?: string;
  sourceItemIndex?: number;
}

export interface FollowUpTriggerEvent {
  id: string;
  event: string;
  date?: JsonValue;
  /** Required for the governed OTHER trigger option so the event itself is not lost. */
  details?: string;
}

export interface FollowUpDeltaState {
  generalHealth?: {
    chronicConditions: FollowUpNamedHistoryItem[];
    tumors: FollowUpNamedHistoryItem[];
    allergies: FollowUpNamedHistoryItem[];
    surgeriesHospitalizations: FollowUpNamedHistoryItem[];
  };
  medicationsSupplements?: {
    startedMedications: FollowUpNamedHistoryItem[];
    startedSupplements: FollowUpNamedHistoryItem[];
    affectedExisting: FollowUpExistingItemChange[];
  };
  hairTreatments?: {
    started: FollowUpNewHairTreatment[];
    affectedExisting: FollowUpExistingItemChange[];
  };
  hairProcedures?: {
    items: FollowUpNewProcedure[];
  };
  triggerEvents?: {
    items: FollowUpTriggerEvent[];
  };
  sexSpecific?: {
    affectedCodes: string[];
    /** Governed current/detail questions only; historical-onset questions are never stored here. */
    responses: Record<string, JsonValue>;
  };
  hairQualityLifestyle?: {
    changeText?: string;
    changeDate?: JsonValue;
  };
  safety?: {
    responses: Record<string, JsonValue>;
  };
  currentMetrics?: Partial<Record<"SHEDDING" | "DENSITY" | "ITCH" | "BURNING" | "SCALP_PAIN", number>>;
}

export interface FollowUpEpisodeSummary {
  id: string;
  primaryReasonCode: string;
  labelAr: string;
  labelEn: string;
  lastVisitId: string;
  lastVisitAt: string;
  visitCount: number;
  physicianContextAvailable: boolean;
  physicianFollowUpProfileApprovedAt?: string;
}

export interface FollowUpSnapshotEntry {
  questionCode: string;
  labelAr: string;
  labelEn: string;
  value: JsonValue;
  responseScopeType: string;
  responseScopeKey: string;
  sourceResponseId: string;
  sourceVisitId: string;
  sourceEpisodeId?: string;
  sourceVisitAt: string;
  effectiveSource?: "PATIENT" | "PHYSICIAN";
  sourceType?: "RESPONSE" | "FOLLOW_UP_DELTA";
  sourceDeltaId?: string;
  sourceDeltaPath?: string;
}

export interface FollowUpDeltaHistoryEntry {
  contextId: string;
  visitId: string;
  episodeId: string;
  visitAt: string;
  sourceVisitId?: string;
  intent: FollowUpIntent;
  delta: JsonValue;
}

export interface FollowUpClientEpisodeState {
  episodeId: string;
  primaryReasonCode: string;
  physicianContextAvailable: boolean;
  lastPhysicianRecordAt?: string;
  currentTreatmentCount: number;
  priorProcedureCount: number;
  latestMeasurementCodes: string[];
  importantEventTypes: string[];
  physicianRoutedQuestionCodes: string[];
  physicianChangeDomains: Array<keyof FollowUpChangeState>;
}

export interface P01FollowUpContext {
  version: typeof FOLLOW_UP_CONTEXT_VERSION;
  mode: "RETURNING";
  patientId: string;
  identity: {
    fullName: string;
    dateOfBirth: string;
    sex: "MALE" | "FEMALE";
    maritalStatus: "MARRIED" | "NOT_MARRIED";
    mrn: string;
  };
  episodes: FollowUpEpisodeSummary[];
  episodeState: FollowUpClientEpisodeState[];
  /** Minimal history metadata used to suppress already-recorded initial questions without exposing their values. */
  recordedQuestionCodes: string[];
  /** Immutable patient-authored visit deltas, retained with visit provenance. */
  followUpHistory?: FollowUpDeltaHistoryEntry[];
  snapshot: {
    generatedAt: string;
    entries: FollowUpSnapshotEntry[];
  };
  intent?: FollowUpIntent;
  selectedEpisodeId?: string;
  selectedPrimaryReasonCode?: string;
  sourceVisitId?: string;
  changes?: FollowUpChangeState;
  delta?: FollowUpDeltaState;
  changesReviewed?: boolean;
}

export interface FollowUpServerAssessmentSignal {
  assessmentType: string;
  value: JsonValue | null;
  note: string | null;
  sourceVisitId: string;
  sourceInterviewId: string;
  createdAt: string;
}

export interface FollowUpServerEffectiveResponse {
  questionCode: string;
  responseScopeType: string;
  responseScopeKey: string;
  effectiveValue: JsonValue | null;
  effectiveSource: string | null;
  sourceVisitId: string;
  assessedAt?: string;
}

export interface FollowUpServerMeasurement {
  code: string;
  value: string;
  sourceVisitId: string;
  measurementDate: string;
}

export interface FollowUpServerTimelineEvent {
  type: string;
  title: string | null;
  description: string | null;
  value: JsonValue | null;
  sourceVisitId: string;
  eventDate?: string;
  eventDatePrecision: string;
  createdAt: string;
}

export interface FollowUpServerEpisodeState {
  episodeId: string;
  primaryReasonCode: string;
  lastVisitId: string;
  lastVisitAt: string;
  patientSnapshot: FollowUpSnapshotEntry[];
  followUpHistory: FollowUpDeltaHistoryEntry[];
  physician: {
    assessments: FollowUpServerAssessmentSignal[];
    effectiveResponses: FollowUpServerEffectiveResponse[];
    measurements: FollowUpServerMeasurement[];
    timelineEvents: FollowUpServerTimelineEvent[];
    routingProfile: JsonValue | null;
    patientVisibleSummary: JsonValue | null;
    routingProfileApprovedAt?: string;
  };
}

export interface FollowUpServerContext {
  version: typeof FOLLOW_UP_SERVER_CONTEXT_VERSION;
  patientId: string;
  generatedAt: string;
  episodes: FollowUpServerEpisodeState[];
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(record: Record<string, JsonValue>, key: string): string | undefined {
  return typeof record[key] === "string" ? record[key] as string : undefined;
}

function migrateItemSelection(value: unknown): FollowUpItemChangeSelection | undefined {
  if (value === "NO_CHANGE") return "NO_CHANGE";
  if (value === "STARTED" || value === "STOPPED" || value === "USAGE_CHANGED") return [value];
  if (Array.isArray(value)) {
    const actions = [...new Set(value.filter((item): item is FollowUpItemChangeAction =>
      item === "STARTED" || item === "STOPPED" || item === "USAGE_CHANGED",
    ))];
    return actions.length > 0 ? actions : undefined;
  }
  return undefined;
}

function normalizeChanges(value: unknown): FollowUpChangeState | undefined {
  if (!isRecord(value)) return undefined;
  const medicationsSupplements = migrateItemSelection(value.medicationsSupplements);
  const hairTreatments = migrateItemSelection(value.hairTreatments);
  const out: FollowUpChangeState = {
    ...(value.generalHealth === "NO_CHANGE" || value.generalHealth === "CHANGED" ? { generalHealth: value.generalHealth } : {}),
    ...(medicationsSupplements ? { medicationsSupplements } : {}),
    ...(hairTreatments ? { hairTreatments } : {}),
    ...(value.hairProcedures === "NO" || value.hairProcedures === "YES" ? { hairProcedures: value.hairProcedures } : {}),
    ...(value.triggerEvents === "NO" || value.triggerEvents === "YES" || value.triggerEvents === "UNSURE" ? { triggerEvents: value.triggerEvents } : {}),
    ...(value.sexSpecific === "NO_CHANGE" || value.sexSpecific === "CHANGED" ? { sexSpecific: value.sexSpecific } : {}),
    ...(value.hairQualityLifestyle === "NO_CHANGE" || value.hairQualityLifestyle === "CHANGED" ? { hairQualityLifestyle: value.hairQualityLifestyle } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeDelta(value: unknown): FollowUpDeltaState | undefined {
  if (!isRecord(value)) return undefined;
  const delta = value as unknown as FollowUpDeltaState;
  return {
    ...delta,
    ...(isRecord(value.sexSpecific) ? {
      sexSpecific: {
        affectedCodes: Array.isArray(value.sexSpecific.affectedCodes)
          ? value.sexSpecific.affectedCodes.filter((item): item is string => typeof item === "string")
          : [],
        responses: isRecord(value.sexSpecific.responses) ? value.sexSpecific.responses : {},
      },
    } : {}),
    ...(isRecord(value.safety) ? {
      safety: { responses: isRecord(value.safety.responses) ? value.safety.responses : {} },
    } : {}),
  };
}

function normalizeEpisodeState(raw: Record<string, JsonValue>, episodes: FollowUpEpisodeSummary[]): FollowUpClientEpisodeState[] {
  if (!Array.isArray(raw.episodeState)) {
    return episodes.map((episode) => ({
      episodeId: episode.id,
      primaryReasonCode: episode.primaryReasonCode,
      physicianContextAvailable: Boolean(episode.physicianContextAvailable),
      currentTreatmentCount: 0,
      priorProcedureCount: 0,
      latestMeasurementCodes: [],
      importantEventTypes: [],
      physicianRoutedQuestionCodes: [],
      physicianChangeDomains: [],
    }));
  }
  return raw.episodeState as unknown as FollowUpClientEpisodeState[];
}

function recordedQuestionCodes(raw: Record<string, JsonValue>): string[] {
  if (Array.isArray(raw.recordedQuestionCodes)) {
    return [...new Set(raw.recordedQuestionCodes.filter((item): item is string => typeof item === "string"))];
  }
  if (!isRecord(raw.snapshot) || !Array.isArray(raw.snapshot.entries)) return [];
  return [...new Set(raw.snapshot.entries.flatMap((item) =>
    isRecord(item) && typeof item.questionCode === "string" ? [item.questionCode] : [],
  ))];
}

export function readFollowUpContext(input: PatientInputJson): P01FollowUpContext | null {
  if (!isRecord(input.followUp)) return null;
  const raw = input.followUp;
  const supported = new Set([
    "P01_FOLLOW_UP_v1",
    "P01_FOLLOW_UP_v2",
    "P01_FOLLOW_UP_v3",
    "P01_FOLLOW_UP_v4",
    "P01_FOLLOW_UP_v5",
    FOLLOW_UP_CONTEXT_VERSION,
  ]);
  if (typeof raw.version !== "string" || !supported.has(raw.version) || raw.mode !== "RETURNING") return null;
  if (!isRecord(raw.identity) || !Array.isArray(raw.episodes) || !isRecord(raw.snapshot) || !Array.isArray(raw.snapshot.entries)) return null;

  const identity = raw.identity;
  const fullName = stringValue(identity, "fullName");
  const dateOfBirth = stringValue(identity, "dateOfBirth");
  const sex = stringValue(identity, "sex");
  const maritalStatus = stringValue(identity, "maritalStatus");
  const mrn = stringValue(identity, "mrn");
  const patientId = stringValue(raw, "patientId");
  if (!patientId || !fullName || !dateOfBirth || !mrn || (sex !== "MALE" && sex !== "FEMALE") || (maritalStatus !== "MARRIED" && maritalStatus !== "NOT_MARRIED")) return null;

  const episodes = (raw.episodes as unknown as Array<Omit<FollowUpEpisodeSummary, "physicianContextAvailable"> & { physicianContextAvailable?: boolean }>).map((episode) => ({
    ...episode,
    physicianContextAvailable: Boolean(episode.physicianContextAvailable),
  }));
  const changes = normalizeChanges(raw.changes);
  const delta = normalizeDelta(raw.delta);

  return {
    ...(raw as unknown as Omit<P01FollowUpContext, "version" | "episodes" | "episodeState" | "recordedQuestionCodes" | "changes" | "delta">),
    version: FOLLOW_UP_CONTEXT_VERSION,
    episodes,
    episodeState: normalizeEpisodeState(raw, episodes),
    recordedQuestionCodes: recordedQuestionCodes(raw),
    followUpHistory: Array.isArray(raw.followUpHistory)
      ? raw.followUpHistory as unknown as FollowUpDeltaHistoryEntry[]
      : [],
    ...(changes ? { changes } : {}),
    ...(delta ? { delta } : {}),
  };
}

export function getSnapshotEntries(context: P01FollowUpContext | null | undefined, questionCode: string): FollowUpSnapshotEntry[] {
  return context?.snapshot.entries.filter((entry) => entry.questionCode === questionCode) ?? [];
}

export function getSnapshotEntry(context: P01FollowUpContext | null | undefined, questionCode: string): FollowUpSnapshotEntry | undefined {
  return getSnapshotEntries(context, questionCode)[0];
}

export function hasRecordedQuestion(context: P01FollowUpContext | null | undefined, questionCode: string): boolean {
  return context?.recordedQuestionCodes.includes(questionCode) ?? false;
}

export function hasSnapshotValue(context: P01FollowUpContext | null | undefined, questionCode: string): boolean {
  return Boolean(getSnapshotEntry(context, questionCode));
}

export function selectedEpisodeState(context: P01FollowUpContext | null | undefined): FollowUpClientEpisodeState | undefined {
  if (!context?.selectedEpisodeId) return undefined;
  return context.episodeState.find((episode) => episode.episodeId === context.selectedEpisodeId);
}
