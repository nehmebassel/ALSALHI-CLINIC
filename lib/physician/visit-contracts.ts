import type { Prisma } from "@/app/generated/prisma/client";

export const PHYSICIAN_VISIT_DRAFT_SCHEMA_VERSION = "FPV_DRAFT_V1";

export const PHYSICIAN_VISIT_DRAFT_SECTIONS = [
  "EXAMINATION",
  "MEASUREMENTS",
  "PATTERN",
  "ANATOMICAL_MAP",
  "TRICHOSCOPY",
  "DIAGNOSIS",
  "TREATMENT_PROCEDURES",
  "TESTS_MEDIA",
  "PLAN",
] as const;

export type PhysicianVisitDraftSection =
  (typeof PHYSICIAN_VISIT_DRAFT_SECTIONS)[number];

export interface PhysicianVisitDraftDocument {
  schemaVersion: typeof PHYSICIAN_VISIT_DRAFT_SCHEMA_VERSION;
  sections: Partial<Record<PhysicianVisitDraftSection, Prisma.JsonValue>>;
}

export interface UpdatePhysicianVisitDraftCommand {
  expectedDraftVersion: number;
  section: string;
  value: unknown;
}

export type PhysicianVisitDraftErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_DRAFT_DATA"
  | "PATIENT_PROVENANCE_BOUNDARY_VIOLATION"
  | "VISIT_NOT_FOUND"
  | "VISIT_CANCELLED"
  | "VISIT_NOT_ELIGIBLE"
  | "CLINIC_SCOPE_UNRESOLVED"
  | "EPISODE_MISMATCH"
  | "DRAFT_NOT_FOUND"
  | "DRAFT_CONFLICT"
  | "PHYSICIAN_VISIT_ALREADY_FINALIZED"
  | "RETRYABLE_CONFLICT";

const ERROR_MESSAGES: Record<PhysicianVisitDraftErrorCode, string> = {
  INVALID_REQUEST: "The physician visit draft request is invalid.",
  INVALID_DRAFT_DATA: "The physician visit draft data is invalid.",
  PATIENT_PROVENANCE_BOUNDARY_VIOLATION:
    "Patient response provenance cannot be imported into physician draft data.",
  VISIT_NOT_FOUND: "The visit was not found.",
  VISIT_CANCELLED: "A cancelled visit cannot have a physician draft.",
  VISIT_NOT_ELIGIBLE: "The visit is not eligible for physician draft work.",
  CLINIC_SCOPE_UNRESOLVED:
    "The visit tenant scope is unresolved and must be reconciled.",
  EPISODE_MISMATCH:
    "The visit and clinical episode ownership do not match.",
  DRAFT_NOT_FOUND: "The physician visit draft was not found.",
  DRAFT_CONFLICT:
    "The physician visit draft changed after the supplied version.",
  PHYSICIAN_VISIT_ALREADY_FINALIZED:
    "A finalized physician visit cannot be changed as a Draft.",
  RETRYABLE_CONFLICT:
    "The physician visit draft encountered a retryable concurrency conflict.",
};

export class PhysicianVisitDraftError extends Error {
  constructor(readonly code: PhysicianVisitDraftErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "PhysicianVisitDraftError";
  }
}

export function parseUpdatePhysicianVisitDraftRequestBody(
  value: unknown,
): UpdatePhysicianVisitDraftCommand {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PhysicianVisitDraftError("INVALID_REQUEST");
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !["expectedDraftVersion", "section", "value"].includes(key),
    ) ||
    !Number.isInteger(body.expectedDraftVersion) ||
    (body.expectedDraftVersion as number) < 1 ||
    typeof body.section !== "string"
  ) {
    throw new PhysicianVisitDraftError("INVALID_REQUEST");
  }
  return {
    expectedDraftVersion: body.expectedDraftVersion as number,
    section: body.section as string,
    value: body.value,
  };
}
