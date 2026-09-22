import { createHash, randomBytes } from "node:crypto";

import {
  assertCanCancelPatientSession,
  assertCanReactivatePatientSession,
  assertCanStartPatientSession,
  type AuthenticatedActor,
} from "@/lib/auth/authorization";
import {
  getPatientSessionDeadlines,
  getTerminalDraftPurgeAfter,
} from "@/lib/patient-access/config";
import { normalizeClinicMrn } from "@/lib/identity/mrn";
import { historicalClinicalDateIssues } from "@/lib/p01/historical-date-integrity";

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type PatientInputJson = { [key: string]: JsonValue };

export type DraftStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "CANCELLED"
  | "EXPIRED";

export type PatientSessionStatus =
  | "ACTIVE"
  | "LOCKED"
  | "EXPIRED"
  | "CLOSED";

export type PatientAccessErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_SESSION"
  | "PRIVACY_CONSENT_REQUIRED"
  | "PRIVACY_CONSENT_RECORD_INVALID"
  | "SESSION_LOCKED"
  | "SESSION_EXPIRED"
  | "SESSION_CLOSED";

const ERROR_MESSAGES: Record<PatientAccessErrorCode, string> = {
  INVALID_REQUEST: "The patient access request is invalid.",
  INVALID_SESSION: "The patient access session is invalid.",
  PRIVACY_CONSENT_REQUIRED:
    "Explicit privacy consent is required before clinical autosave.",
  PRIVACY_CONSENT_RECORD_INVALID:
    "The privacy consent record is incomplete or invalid.",
  SESSION_LOCKED: "The patient access session is locked.",
  SESSION_EXPIRED: "The patient access session has expired.",
  SESSION_CLOSED: "The patient access session is closed.",
};

export class PatientAccessError extends Error {
  constructor(readonly code: PatientAccessErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "PatientAccessError";
  }
}

export interface PatientAccessSnapshot {
  session: {
    id: string;
    status: PatientSessionStatus;
    closeReason: "CANCELLED" | "SUBMITTED" | null;
    lastActivityAt: Date;
    expiresAt: Date;
    lockedAt: Date | null;
    expiredAt: Date | null;
    closedAt: Date | null;
  };
  invitation: {
    clinicScopeId: string;
    patientId: string | null;
    temporaryMrnDisplayValue: string | null;
    temporaryMrnNormalizedValue: string | null;
    expiresAt: Date | null;
    cancelledAt: Date | null;
  };
  draft: {
  id: string;
  contentVersionId: string;
  status: DraftStatus;
  expiresAt: Date;
  patientInputJson: PatientInputJson;
  updatedAt: Date;
};
}

export interface CreateAccessFlowRecord {
  invitationId: string;
  sessionId: string;
  draftId: string;
  status: DraftStatus;
  matchedExistingPatient: boolean;
}

export interface PatientAccessStore {
  createAccessFlow(input: {
    createdByUserId: string;
    clinicScopeId: string;
    temporaryMrnDisplayValue: string;
    temporaryMrnNormalizedValue: string;
    now: Date;
    expiresAt: Date;
    sessionTokenHash: string;
    patientInputJson: PatientInputJson;
  }): Promise<CreateAccessFlowRecord>;

  findAccessByTokenHash(
    sessionTokenHash: string,
  ): Promise<PatientAccessSnapshot | null>;

  findAccessBySessionId(
    sessionId: string,
  ): Promise<PatientAccessSnapshot | null>;

  lockAccess(input: {
    sessionId: string;
    now: Date;
  }): Promise<void>;

  expireAccess(input: {
    sessionId: string;
    draftId: string;
    now: Date;
    purgeAfter: Date;
  }): Promise<void>;

  reactivateAccess(input: {
    sessionId: string;
    now: Date;
    expiresAt: Date;
  }): Promise<PatientAccessSnapshot | null>;

  cancelAccess(input: {
    sessionId: string;
    now: Date;
    purgeAfter: Date;
  }): Promise<boolean>;

  autosaveDraft(input: {
    draftId: string;
    sessionTokenHash: string;
    patientInputJson: PatientInputJson;
    now: Date;
    expiresAt: Date;
  }): Promise<
    PatientAccessSnapshot["draft"] | null
  >;

  loadFinalSubmitReferenceData(
    contentVersionId: string,
  ): Promise<FinalSubmitReferenceData>;
}
export interface CreatePatientAccessFlowInput {
  clinicMrn: string;
  patientInputJson?: PatientInputJson;
}

export interface CreatedPatientAccessFlow {
  invitationId: string;
  sessionId: string;
  draftId: string;
  sessionToken: string;
  expiresAt: Date;
  warningAt: Date;
  lockAt: Date;
  status: DraftStatus;
  matchedExistingPatient: boolean;
}

export interface AutosavedPatientDraft {
  draftId: string;
  contentVersionId: string;
  patientInputJson: PatientInputJson;
  status: DraftStatus;
  expiresAt: Date;
  updatedAt: Date;
  sessionStatus: PatientSessionStatus;
  warningAt: Date;
  lockAt: Date;
}

export interface PatientAccessServiceDependencies {
  now?: () => Date;
  generateToken?: () => string;
}

export function hashPatientAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generatePatientAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export class PatientAccessService {
  private readonly now: () => Date;
  private readonly generateToken: () => string;

  constructor(
    private readonly store: PatientAccessStore,
    dependencies: PatientAccessServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.generateToken =
      dependencies.generateToken ?? generatePatientAccessToken;
  }

  async createFlow(
    actor: AuthenticatedActor,
    input: CreatePatientAccessFlowInput,
  ): Promise<CreatedPatientAccessFlow> {
    assertCanStartPatientSession(actor);

    const now = this.now();
    const normalizedMrn = normalizeClinicMrn(input.clinicMrn);
    const deadlines = getPatientSessionDeadlines(now);

    const sessionToken = this.generateToken();
    const sessionTokenHash = hashPatientAccessToken(sessionToken);

    const record = await this.store.createAccessFlow({
      createdByUserId: actor.userId,
      clinicScopeId: actor.clinicScopeId,
      temporaryMrnDisplayValue: input.clinicMrn.trim(),
      temporaryMrnNormalizedValue: normalizedMrn,
      now,
      expiresAt: deadlines.expiresAt,
      sessionTokenHash,
      patientInputJson: input.patientInputJson ?? {},
    });

    return {
      ...record,
      sessionToken,
      ...deadlines,
    };
  }

  async reactivate(
    actor: AuthenticatedActor,
    sessionId: string,
  ): Promise<PatientAccessSnapshot> {
    assertCanReactivatePatientSession(actor);

    const now = this.now();
    const current = await this.store.findAccessBySessionId(sessionId);

    if (!current) {
      throw new PatientAccessError("INVALID_SESSION");
    }

    if (current.invitation.clinicScopeId !== actor.clinicScopeId) {
      throw new PatientAccessError("INVALID_SESSION");
    }

    await this.assertNotExpired(current, now);

    if (current.session.status !== "LOCKED") {
      throw new PatientAccessError(
        current.session.status === "ACTIVE"
          ? "INVALID_REQUEST"
          : "SESSION_CLOSED",
      );
    }

    const { expiresAt } = getPatientSessionDeadlines(now);
    const reactivated = await this.store.reactivateAccess({
      sessionId,
      now,
      expiresAt,
    });

    if (!reactivated) {
      throw new PatientAccessError("SESSION_CLOSED");
    }

    return reactivated;
  }

  async cancel(
    actor: AuthenticatedActor,
    sessionId: string,
  ): Promise<void> {
    assertCanCancelPatientSession(actor);
    const now = this.now();
    const current = await this.store.findAccessBySessionId(sessionId);

    if (!current || current.invitation.clinicScopeId !== actor.clinicScopeId) {
      throw new PatientAccessError("INVALID_SESSION");
    }

    await this.assertNotExpired(current, now);

    const cancelled = await this.store.cancelAccess({
      sessionId,
      now,
      purgeAfter: getTerminalDraftPurgeAfter(now),
    });

    if (!cancelled) {
      throw new PatientAccessError("SESSION_CLOSED");
    }
  }

  async autosave(
    sessionToken: string,
    patientInputJson: PatientInputJson,
  ): Promise<AutosavedPatientDraft> {
    if (!sessionToken) {
      throw new PatientAccessError("INVALID_SESSION");
    }

    const sessionTokenHash = hashPatientAccessToken(sessionToken);
    const now = this.now();

    if (historicalClinicalDateIssues(patientInputJson, now).length > 0) {
      throw new PatientAccessError("INVALID_REQUEST");
    }

    const access = await this.assertAccessIsActive(
      await this.store.findAccessByTokenHash(sessionTokenHash),
      now,
    );

    const draft = await this.store.autosaveDraft({
      draftId: access.draft.id,
      sessionTokenHash,
      patientInputJson,
      now,
      expiresAt: getPatientSessionDeadlines(now).expiresAt,
    });

    if (!draft) {
      await this.assertAccessIsActive(
        await this.store.findAccessByTokenHash(sessionTokenHash),
        now,
      );

      throw new Error(
        "The active patient draft could not be autosaved.",
      );
    }

    const deadlines = getPatientSessionDeadlines(now);

    return {
      draftId: draft.id,
      contentVersionId: draft.contentVersionId,
      patientInputJson: draft.patientInputJson,
      status: draft.status,
      expiresAt: deadlines.expiresAt,
      updatedAt: draft.updatedAt,
      sessionStatus: "ACTIVE",
      warningAt: deadlines.warningAt,
      lockAt: deadlines.lockAt,
    };
  }

  async load(sessionToken: string): Promise<{
    draftId: string;
    contentVersionId: string;
    patientInputJson: PatientInputJson;
    status: DraftStatus;
    updatedAt: Date;
    sessionStatus: PatientSessionStatus;
    warningAt: Date;
    lockAt: Date;
    expiresAt: Date;
  }> {
    if (!sessionToken) {
      throw new PatientAccessError("INVALID_SESSION");
    }

    const now = this.now();
    const access = await this.assertAccessIsActive(
      await this.store.findAccessByTokenHash(
        hashPatientAccessToken(sessionToken),
      ),
      now,
    );
    const deadlines = getPatientSessionDeadlines(
      access.session.lastActivityAt,
    );

    return {
      draftId: access.draft.id,
      contentVersionId: access.draft.contentVersionId,
      patientInputJson: access.draft.patientInputJson,
      status: access.draft.status,
      updatedAt: access.draft.updatedAt,
      sessionStatus: access.session.status,
      warningAt: deadlines.warningAt,
      lockAt: deadlines.lockAt,
      expiresAt: deadlines.expiresAt,
    };
  }

  private async assertAccessIsActive(
    access: PatientAccessSnapshot | null,
    now: Date,
  ): Promise<PatientAccessSnapshot> {
    if (!access) {
      throw new PatientAccessError("INVALID_SESSION");
    }

    if (
      access.session.status === "CLOSED" ||
      access.session.closedAt ||
      access.invitation.cancelledAt ||
      access.draft.status === "SUBMITTED" ||
      access.draft.status === "CANCELLED"
    ) {
      throw new PatientAccessError("SESSION_CLOSED");
    }

    await this.assertNotExpired(access, now);

    if (access.session.status === "LOCKED") {
      throw new PatientAccessError("SESSION_LOCKED");
    }

    const { lockAt } = getPatientSessionDeadlines(
      access.session.lastActivityAt,
    );

    if (lockAt.getTime() <= now.getTime()) {
      await this.store.lockAccess({
        sessionId: access.session.id,
        now,
      });

      throw new PatientAccessError("SESSION_LOCKED");
    }

    return access;
  }

  private async assertNotExpired(
    access: PatientAccessSnapshot,
    now: Date,
  ): Promise<void> {
    const { expiresAt } = getPatientSessionDeadlines(
      access.session.lastActivityAt,
    );

    const isExpired =
      access.session.status === "EXPIRED" ||
      access.draft.status === "EXPIRED" ||
      expiresAt.getTime() <= now.getTime();

    if (!isExpired) {
      return;
    }

    await this.store.expireAccess({
      sessionId: access.session.id,
      draftId: access.draft.id,
      now,
      purgeAfter: getTerminalDraftPurgeAfter(now),
    });

    throw new PatientAccessError("SESSION_EXPIRED");
  }
}

// ============================================================================
// Final Submit Validation
// ============================================================================

export type VisitReasonCode =
  | "RV_HAIR_LOSS"
  | "RV_SCALP_SYMPTOMS"
  | "RV_HAIR_QUALITY"
  | "RV_DERMATOLOGY"
  | "RV_LASER"
  | "RV_AESTHETIC_PROCEDURES";

export interface FinalSubmitVisitInput {
  primaryReasonForVisitCodes: string[];
  additionalRequestCodes: string[];
  selectedProcedureCodes: string[];
  selectedLaserServiceCodes: string[];

  /**
   * Required only when AP_OTHER is selected.
   */
  aestheticOtherNotes?: string | null;

  /**
   * Required only when LASER_OTHER is selected.
   */
  laserOtherNotes?: string | null;
}

/**
 * Reference data resolved by the server from the Draft's pinned
 * ContentVersion.
 *
 * The client must never supply these values.
 */
export interface FinalSubmitReferenceData {
  validReasonCodes: ReadonlySet<string>;
  validAestheticProcedureCodes: ReadonlySet<string>;
  validLaserServiceCodes: ReadonlySet<string>;
}

export type FinalSubmitValidationErrorCode =
  | "NO_PRIMARY_REASON"
  | "MULTIPLE_PRIMARY_REASONS"
  | "DUPLICATE_REASON"
  | "DUPLICATE_AESTHETIC_PROCEDURE"
  | "DUPLICATE_LASER_SERVICE"
  | "UNKNOWN_REASON"
  | "UNKNOWN_AESTHETIC_PROCEDURE"
  | "UNKNOWN_LASER_SERVICE"
  | "INVALID_ADDITIONAL_REQUEST"
  | "HAIR_QUALITY_CONFLICT"
  | "AESTHETIC_SELECTION_WITHOUT_REASON"
  | "LASER_SELECTION_WITHOUT_REASON"
  | "AP_OTHER_NOTES_REQUIRED"
  | "LASER_OTHER_NOTES_REQUIRED";

const FINAL_SUBMIT_ERROR_MESSAGES: Record<
  FinalSubmitValidationErrorCode,
  string
> = {
  NO_PRIMARY_REASON:
    "Exactly one primary reason for visit is required.",

  MULTIPLE_PRIMARY_REASONS:
    "Exactly one primary reason for visit is allowed.",

  DUPLICATE_REASON:
    "The same reason for visit cannot be selected more than once.",

  DUPLICATE_AESTHETIC_PROCEDURE:
    "The same aesthetic procedure cannot be selected more than once.",

  DUPLICATE_LASER_SERVICE:
    "The same laser service cannot be selected more than once.",

  UNKNOWN_REASON:
    "One or more reasons for visit are not valid for the pinned content version.",

  UNKNOWN_AESTHETIC_PROCEDURE:
    "One or more aesthetic procedures are not valid for the pinned content version.",

  UNKNOWN_LASER_SERVICE:
    "One or more laser services are not valid for the pinned content version.",

  INVALID_ADDITIONAL_REQUEST:
    "Only approved additional request categories may be submitted as additional requests.",

  HAIR_QUALITY_CONFLICT:
    "Hair Quality cannot be combined with Hair Loss or Scalp Symptoms in Pilot 0.",

  AESTHETIC_SELECTION_WITHOUT_REASON:
    "Aesthetic procedures require an active Aesthetic Procedures reason or additional request.",

  LASER_SELECTION_WITHOUT_REASON:
    "Laser services require an active Laser reason or additional request.",

  AP_OTHER_NOTES_REQUIRED:
    "Notes are required when AP_OTHER is selected.",

  LASER_OTHER_NOTES_REQUIRED:
    "Notes are required when LASER_OTHER is selected.",
};

export class FinalSubmitValidationError extends Error {
  constructor(
    readonly code: FinalSubmitValidationErrorCode,
  ) {
    super(FINAL_SUBMIT_ERROR_MESSAGES[code]);
    this.name = "FinalSubmitValidationError";
  }
}

const ALLOWED_ADDITIONAL_REQUEST_CODES =
  new Set<VisitReasonCode>([
    "RV_LASER",
    "RV_AESTHETIC_PROCEDURES",
  ]);

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function hasNonBlankText(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function assertCodesExist(
  codes: readonly string[],
  validCodes: ReadonlySet<string>,
  errorCode:
    | "UNKNOWN_REASON"
    | "UNKNOWN_AESTHETIC_PROCEDURE"
    | "UNKNOWN_LASER_SERVICE",
): void {
  for (const code of codes) {
    if (!validCodes.has(code)) {
      throw new FinalSubmitValidationError(errorCode);
    }
  }
}

/**
 * Validates visit intent and service selections before Final Submit.
 *
 * IMPORTANT:
 * The reference data passed here must be loaded server-side using the
 * Draft's pinned contentVersionId.
 *
 * This validator does not trust client-provided catalogue definitions.
 */
export function validateFinalSubmitVisitInput(
  input: FinalSubmitVisitInput,
  referenceData: FinalSubmitReferenceData,
): void {
  const primaryReasons =
    input.primaryReasonForVisitCodes;

  const additionalRequests =
    input.additionalRequestCodes;

  const aestheticProcedures =
    input.selectedProcedureCodes;

  const laserServices =
    input.selectedLaserServiceCodes;

  // --------------------------------------------------------------------------
  // At least one primary reason is required.
  // --------------------------------------------------------------------------

  if (primaryReasons.length === 0) {
    throw new FinalSubmitValidationError(
      "NO_PRIMARY_REASON",
    );
  }

  // --------------------------------------------------------------------------
  // Duplicate protection at application level.
  //
  // The DB also protects persisted selections, but we reject malformed
  // payloads before attempting persistence.
  // --------------------------------------------------------------------------

  if (hasDuplicates(primaryReasons)) {
    throw new FinalSubmitValidationError(
      "DUPLICATE_REASON",
    );
  }

  if (primaryReasons.length > 1) {
    throw new FinalSubmitValidationError(
      "MULTIPLE_PRIMARY_REASONS",
    );
  }

  if (hasDuplicates(additionalRequests)) {
    throw new FinalSubmitValidationError(
      "DUPLICATE_REASON",
    );
  }

  if (hasDuplicates(aestheticProcedures)) {
    throw new FinalSubmitValidationError(
      "DUPLICATE_AESTHETIC_PROCEDURE",
    );
  }

  if (hasDuplicates(laserServices)) {
    throw new FinalSubmitValidationError(
      "DUPLICATE_LASER_SERVICE",
    );
  }

  // --------------------------------------------------------------------------
  // The same ReasonForVisit cannot be both PRIMARY and ADDITIONAL.
  // --------------------------------------------------------------------------

  const primaryReasonSet = new Set(primaryReasons);

  for (const code of additionalRequests) {
    if (primaryReasonSet.has(code)) {
      throw new FinalSubmitValidationError(
        "DUPLICATE_REASON",
      );
    }
  }

  // --------------------------------------------------------------------------
  // Validate all codes against server-resolved reference data.
  //
  // This is where a code from the wrong ContentVersion is rejected:
  // it will not exist in the catalogue loaded from the Draft's pinned release.
  // --------------------------------------------------------------------------

  assertCodesExist(
    primaryReasons,
    referenceData.validReasonCodes,
    "UNKNOWN_REASON",
  );

  assertCodesExist(
    additionalRequests,
    referenceData.validReasonCodes,
    "UNKNOWN_REASON",
  );

  assertCodesExist(
    aestheticProcedures,
    referenceData.validAestheticProcedureCodes,
    "UNKNOWN_AESTHETIC_PROCEDURE",
  );

  assertCodesExist(
    laserServices,
    referenceData.validLaserServiceCodes,
    "UNKNOWN_LASER_SERVICE",
  );

  // --------------------------------------------------------------------------
  // Pilot 0 additional requests.
  //
  // Only Laser and Aesthetic Procedures are approved here.
  // --------------------------------------------------------------------------

  for (const code of additionalRequests) {
    if (
      !ALLOWED_ADDITIONAL_REQUEST_CODES.has(
        code as VisitReasonCode,
      )
    ) {
      throw new FinalSubmitValidationError(
        "INVALID_ADDITIONAL_REQUEST",
      );
    }
  }

  // --------------------------------------------------------------------------
  // Hair Quality exclusivity.
  //
  // Hair Loss and Scalp Symptoms are never co-primary; their secondary
  // cross-activation is module-level and does not create another VisitReason.
  // Hair Quality also remains independent from the Hair/Scalp pathway.
  // --------------------------------------------------------------------------

  const allReasons = new Set([
    ...primaryReasons,
    ...additionalRequests,
  ]);

  const hasHairQuality =
    allReasons.has("RV_HAIR_QUALITY");

  const hasHairLoss =
    allReasons.has("RV_HAIR_LOSS");

  const hasScalpSymptoms =
    allReasons.has("RV_SCALP_SYMPTOMS");

  if (
    hasHairQuality &&
    (hasHairLoss || hasScalpSymptoms)
  ) {
    throw new FinalSubmitValidationError(
      "HAIR_QUALITY_CONFLICT",
    );
  }

  // --------------------------------------------------------------------------
  // Aesthetic selections require Aesthetic Procedures context.
  // --------------------------------------------------------------------------

  const hasAestheticContext =
    allReasons.has("RV_AESTHETIC_PROCEDURES");

  if (
    aestheticProcedures.length > 0 &&
    !hasAestheticContext
  ) {
    throw new FinalSubmitValidationError(
      "AESTHETIC_SELECTION_WITHOUT_REASON",
    );
  }

  // --------------------------------------------------------------------------
  // Laser selections require Laser context.
  // --------------------------------------------------------------------------

  const hasLaserContext =
    allReasons.has("RV_LASER");

  if (
    laserServices.length > 0 &&
    !hasLaserContext
  ) {
    throw new FinalSubmitValidationError(
      "LASER_SELECTION_WITHOUT_REASON",
    );
  }

  // --------------------------------------------------------------------------
  // OTHER notes.
  // --------------------------------------------------------------------------

  if (
    aestheticProcedures.includes("AP_OTHER") &&
    !hasNonBlankText(input.aestheticOtherNotes)
  ) {
    throw new FinalSubmitValidationError(
      "AP_OTHER_NOTES_REQUIRED",
    );
  }

  if (
    laserServices.includes("LASER_OTHER") &&
    !hasNonBlankText(input.laserOtherNotes)
  ) {
    throw new FinalSubmitValidationError(
      "LASER_OTHER_NOTES_REQUIRED",
    );
  }
}
