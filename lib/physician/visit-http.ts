import { noStoreJson } from "@/lib/http/no-store-json";
import { PhysicianVisitDraftError } from "./visit-contracts";

const ERROR_STATUS: Record<PhysicianVisitDraftError["code"], number> = {
  INVALID_REQUEST: 400,
  INVALID_DRAFT_DATA: 400,
  PATIENT_PROVENANCE_BOUNDARY_VIOLATION: 400,
  VISIT_NOT_FOUND: 404,
  VISIT_CANCELLED: 409,
  VISIT_NOT_ELIGIBLE: 409,
  CLINIC_SCOPE_UNRESOLVED: 409,
  EPISODE_MISMATCH: 409,
  DRAFT_NOT_FOUND: 404,
  DRAFT_CONFLICT: 409,
  PHYSICIAN_VISIT_ALREADY_FINALIZED: 409,
  RETRYABLE_CONFLICT: 409,
};

export function physicianVisitDraftErrorResponse(
  error: PhysicianVisitDraftError,
): Response {
  return noStoreJson(
    { error: { code: error.code, message: error.message } },
    { status: ERROR_STATUS[error.code] },
  );
}
