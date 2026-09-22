export type AuthenticatedActorRole = "STAFF" | "PHYSICIAN";

export interface AuthenticatedActor {
  actorType: "AUTHENTICATED_USER";
  userId: string;
  userName?: string;
  userLogin?: string;
  role: AuthenticatedActorRole;
  clinicScopeId: string;
  clinicDeviceId: string | null;
  authenticatedSessionId: string;
}

export type AuthorizationErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "ACCESS_CONTEXT_NOT_ALLOWED"
  | "ACTION_NOT_ALLOWED"
  | "PHYSICIAN_FINALIZATION_REQUIRED";

const AUTHORIZATION_ERROR_MESSAGES: Record<
  AuthorizationErrorCode,
  string
> = {
  AUTHENTICATION_REQUIRED: "Authentication is required.",
  ACCESS_CONTEXT_NOT_ALLOWED:
    "The authenticated access context is not allowed.",
  ACTION_NOT_ALLOWED:
    "The authenticated actor is not allowed to perform this action.",
  PHYSICIAN_FINALIZATION_REQUIRED:
    "A physician is required to finalize a physician visit.",
};

export class AuthorizationError extends Error {
  constructor(readonly code: AuthorizationErrorCode) {
    super(AUTHORIZATION_ERROR_MESSAGES[code]);
    this.name = "AuthorizationError";
  }
}

export function assertCanStartPatientSession(
  actor: AuthenticatedActor,
): void {
  if (actor.role !== "STAFF") {
    throw new AuthorizationError("ACTION_NOT_ALLOWED");
  }

  if (!actor.clinicDeviceId) {
    throw new AuthorizationError("ACCESS_CONTEXT_NOT_ALLOWED");
  }
}

export function assertCanReactivatePatientSession(
  actor: AuthenticatedActor,
): void {
  if (actor.role === "STAFF" && !actor.clinicDeviceId) {
    throw new AuthorizationError("ACCESS_CONTEXT_NOT_ALLOWED");
  }
}

export function assertCanCancelPatientSession(
  actor: AuthenticatedActor,
): void {
  assertCanStartPatientSession(actor);
}

export function assertCanModifyClinicalData(
  actor: AuthenticatedActor,
): void {
  if (actor.role !== "PHYSICIAN") {
    throw new AuthorizationError("ACTION_NOT_ALLOWED");
  }
}

export function assertCanReadPatientReference(
  actor: AuthenticatedActor,
): void {
  assertClinicalWorkspaceRole(actor);
}

export function assertCanPreparePhysicianVisitDraft(
  actor: AuthenticatedActor,
): void {
  assertClinicalWorkspaceRole(actor);
}

export function assertCanEditPhysicianVisitDraft(
  actor: AuthenticatedActor,
): void {
  assertClinicalWorkspaceRole(actor);
}

export function assertCanBeginPhysicianEncounter(
  actor: AuthenticatedActor,
): void {
  assertPhysicianOnly(actor);
}

export function assertCanFinalizePhysicianVisit(
  actor: AuthenticatedActor,
): void {
  if (actor.role !== "PHYSICIAN") {
    throw new AuthorizationError("PHYSICIAN_FINALIZATION_REQUIRED");
  }
}

export function assertCanCorrectFinalizedPhysicianVisit(
  actor: AuthenticatedActor,
): void {
  assertPhysicianOnly(actor);
}

export function assertCanReadCanonicalPhysicianVisit(
  actor: AuthenticatedActor,
): void {
  assertPhysicianOnly(actor);
}

export function assertCanAddPhysicianVisitAddendum(
  actor: AuthenticatedActor,
): void {
  assertPhysicianOnly(actor);
}

export function assertCanViewClinicalAudit(
  actor: AuthenticatedActor,
): void {
  assertPhysicianOnly(actor);
}

function assertClinicalWorkspaceRole(actor: AuthenticatedActor): void {
  if (actor.role !== "STAFF" && actor.role !== "PHYSICIAN") {
    throw new AuthorizationError("ACTION_NOT_ALLOWED");
  }
}

function assertPhysicianOnly(actor: AuthenticatedActor): void {
  if (actor.role !== "PHYSICIAN") {
    throw new AuthorizationError("ACTION_NOT_ALLOWED");
  }
}
