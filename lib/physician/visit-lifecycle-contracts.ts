import type { PhysicianVisitAddendumType } from "@/app/generated/prisma/client";

export const PHYSICIAN_VISIT_FINALIZATION_EVIDENCE_SCHEMA_VERSION =
  "FPV_FINALIZATION_EVIDENCE_V1";

export const PHYSICIAN_VISIT_ADDENDUM_TYPES = [
  "CORRECTION",
  "CLARIFICATION",
  "ADDITIONAL_DOCUMENTATION",
] as const satisfies readonly PhysicianVisitAddendumType[];

export const IMMUTABLE_PHYSICIAN_VISIT_CORRECTION_TARGETS = new Set([
  "patientId",
  "visitId",
  "clinicalEpisodeId",
  "clinicScopeId",
  "visitOccurredAt",
  "finalizedAt",
  "finalizedByUserId",
  "originalFinalizationEvidenceJson",
  "finalizedDraftVersion",
  "finalizedDraftSha256",
]);

export interface FinalizePhysicianVisitCommand {
  expectedDraftVersion: number;
}

export interface AddPhysicianVisitAddendumCommand {
  type: PhysicianVisitAddendumType;
  content: string;
}

export type PhysicianVisitLifecycleErrorCode =
  | "INVALID_REQUEST"
  | "REQUEST_BODY_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "VISIT_NOT_FOUND"
  | "VISIT_CANCELLED"
  | "VISIT_NOT_ELIGIBLE"
  | "EPISODE_MISMATCH"
  | "DRAFT_NOT_FOUND"
  | "DRAFT_CONFLICT"
  | "ENCOUNTER_NOT_BEGUN"
  | "INVALID_VISIT_OCCURRED_AT"
  | "PHYSICIAN_VISIT_ALREADY_FINALIZED"
  | "PHYSICIAN_VISIT_NOT_FINALIZED"
  | "UNAPPROVED_FINALIZATION_CONTENT"
  | "INVALID_CLINICAL_DATA"
  | "VISIT_CORRECTION_WINDOW_CLOSED"
  | "IMMUTABLE_VISIT_FIELD"
  | "UNAPPROVED_CORRECTION_TARGET"
  | "INVALID_LONGITUDINAL_TARGET"
  | "LONGITUDINAL_DECISION_CONFLICT"
  | "DEPENDENT_LONGITUDINAL_DECISIONS"
  | "PATIENT_CONTEXT_VERSION_CONFLICT"
  | "ADDENDUM_BEFORE_HARD_LOCK"
  | "INVALID_ADDENDUM"
  | "RETRYABLE_CONFLICT";

const ERROR_MESSAGES: Record<PhysicianVisitLifecycleErrorCode, string> = {
  INVALID_REQUEST: "The physician visit lifecycle request is invalid.",
  REQUEST_BODY_TOO_LARGE: "The physician visit request body is too large.",
  UNSUPPORTED_MEDIA_TYPE: "The physician visit request must use application/json.",
  VISIT_NOT_FOUND: "The visit was not found.",
  VISIT_CANCELLED: "A cancelled visit cannot enter the physician lifecycle.",
  VISIT_NOT_ELIGIBLE: "The visit is not eligible for this lifecycle transition.",
  EPISODE_MISMATCH: "The visit and clinical episode ownership do not match.",
  DRAFT_NOT_FOUND: "The physician visit Draft was not found.",
  DRAFT_CONFLICT: "The physician visit Draft changed before finalization.",
  ENCOUNTER_NOT_BEGUN: "The physician encounter has not begun.",
  INVALID_VISIT_OCCURRED_AT: "The authoritative visit occurrence time is invalid.",
  PHYSICIAN_VISIT_ALREADY_FINALIZED: "The physician visit is already finalized.",
  PHYSICIAN_VISIT_NOT_FINALIZED: "The physician visit is not finalized.",
  UNAPPROVED_FINALIZATION_CONTENT:
    "This Draft contains clinical content without an approved finalization schema.",
  INVALID_CLINICAL_DATA:
    "The governed physician clinical data is invalid.",
  VISIT_CORRECTION_WINDOW_CLOSED:
    "The physician visit direct-correction window is closed.",
  IMMUTABLE_VISIT_FIELD: "This physician visit lifecycle field is immutable.",
  UNAPPROVED_CORRECTION_TARGET:
    "No governed clinical correction target exists for this field yet.",
  INVALID_LONGITUDINAL_TARGET:
    "The longitudinal decision target is not valid at this Visit position.",
  LONGITUDINAL_DECISION_CONFLICT:
    "The longitudinal decisions conflict or cannot be replayed deterministically.",
  DEPENDENT_LONGITUDINAL_DECISIONS:
    "Later finalized longitudinal decisions depend on this decision.",
  PATIENT_CONTEXT_VERSION_CONFLICT:
    "The Patient Context version changed before physician evidence was recorded.",
  ADDENDUM_BEFORE_HARD_LOCK:
    "An Addendum is available only after the direct-correction window closes.",
  INVALID_ADDENDUM: "The physician visit Addendum is invalid.",
  RETRYABLE_CONFLICT: "The physician visit lifecycle encountered a retryable conflict.",
};

export class PhysicianVisitLifecycleError extends Error {
  constructor(readonly code: PhysicianVisitLifecycleErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "PhysicianVisitLifecycleError";
  }
}

function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PhysicianVisitLifecycleError("INVALID_REQUEST");
  }
  return value as Record<string, unknown>;
}

export function parseFinalizePhysicianVisitRequestBody(
  value: unknown,
): FinalizePhysicianVisitCommand {
  const body = requireObject(value);
  if (Object.keys(body).some((key) => key !== "expectedDraftVersion")) {
    throw new PhysicianVisitLifecycleError("INVALID_REQUEST");
  }
  if (
    !Number.isInteger(body.expectedDraftVersion) ||
    (body.expectedDraftVersion as number) < 1
  ) {
    throw new PhysicianVisitLifecycleError("INVALID_REQUEST");
  }
  return { expectedDraftVersion: body.expectedDraftVersion as number };
}

export function parseAddPhysicianVisitAddendumRequestBody(
  value: unknown,
): AddPhysicianVisitAddendumCommand {
  const body = requireObject(value);
  if (Object.keys(body).some((key) => key !== "type" && key !== "content")) {
    throw new PhysicianVisitLifecycleError("INVALID_REQUEST");
  }
  if (
    typeof body.type !== "string" ||
    !PHYSICIAN_VISIT_ADDENDUM_TYPES.includes(
      body.type as PhysicianVisitAddendumType,
    ) ||
    typeof body.content !== "string" ||
    body.content.trim().length === 0 ||
    body.content.length > 16_000
  ) {
    throw new PhysicianVisitLifecycleError("INVALID_ADDENDUM");
  }
  return {
    type: body.type as PhysicianVisitAddendumType,
    content: body.content,
  };
}
