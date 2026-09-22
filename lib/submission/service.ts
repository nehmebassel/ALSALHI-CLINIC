import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";
import type { JsonValue } from "@/lib/patient-access/service";
import { getQuestionInstanceIdentity } from "@/lib/clinical-engine/response-scope";
import { selectFollowUpServerSnapshot } from "@/lib/follow-up/server-snapshot";
import { getP01ProfileAndVisit } from "@/lib/p01/engine";
import { hashPatientAccessToken } from "@/lib/patient-access/service";
import {
  validateFinalSubmitVisitInput,
  type FinalSubmitReferenceData,
  type PatientInputJson,
} from "@/lib/patient-access/service";
import { getPrismaClient } from "@/lib/prisma";
import { officialStateRelationsCreate } from "@/lib/submission/official-state-persistence";
import { persistPatientContextFromOfficialState } from "@/lib/patient-context/service";
import { activeDatabaseSchema } from "@/lib/local-clinician-demo";

type Gender = "MALE" | "FEMALE";
type MaritalStatus = "MARRIED" | "NOT_MARRIED";
type ResponseScopeType =
  | "VISIT"
  | "PATHWAY"
  | "MODULE"
  | "PROCEDURE_SELECTION"
  | "LASER_SERVICE_SELECTION"
  | "MEDICATION_ITEM"
  | "CONDITION_ITEM"
  | "SYMPTOM_ITEM"
  | "EVENT_ITEM"
  | "BODY_AREA"
  | "VISUAL_CLASSIFICATION";
type ActivationSourceType =
  | "SYSTEM"
  | "PATHWAY"
  | "RULE"
  | "ASSESSMENT"
  | "VISIT_REASON"
  | "PROCEDURE_SELECTION"
  | "LASER_SERVICE_SELECTION"
  | "PHYSICIAN_REVIEW_REQUIREMENT";
type RuleEvaluationState =
  | "TRUE"
  | "FALSE"
  | "UNKNOWN"
  | "PENDING"
  | "CONFIGURATION_ERROR";

export interface FinalSubmitProfile {
  fullName: string;
  dateOfBirth: Date;
  gender: Gender;
  maritalStatus: MaritalStatus;
}

export interface EvaluatedQuestionResponse {
  questionDefinitionId: string;
  responseScopeType: ResponseScopeType;
  responseScopeKey: string;
  valueJson: Prisma.InputJsonValue;
  activationSources: Array<{
    sourceType: ActivationSourceType;
    sourceKey: string;
    isRequired: boolean;
  }>;
}

export interface EvaluatedOfficialState {
  state: "READY" | "UNKNOWN" | "PENDING" | "CONFIGURATION_ERROR";
  activePathwayDefinitionIds: string[];
  activeLibraryIds: string[];
  questionResponses: EvaluatedQuestionResponse[];
  routingEvaluations: Array<{
    ruleVersionId: string;
    resultState: RuleEvaluationState;
    resultJson?: Prisma.InputJsonValue;
  }>;
}

export interface FinalSubmitCommand {
  patientSessionToken: string;
  /** @deprecated Final Submit derives these from the locked draft. */
  profile?: FinalSubmitProfile;
  /** @deprecated Final Submit derives these from the locked draft. */
  visit?: LockedDraftSubmitArtifacts["visit"];
}

export interface LockedDraftSubmitArtifacts {
  profile: FinalSubmitProfile;
  visit: {
    primaryReasonCode: string;
    additionalReasonCodes: string[];
    selectedProcedureCodes: string[];
    selectedLaserServiceCodes: string[];
    visitType?: "INITIAL" | "FOLLOW_UP";
    clinicalEpisodeId?: string;
    sourceVisitId?: string;
    followUpIntent?: "EXISTING_CONCERN" | "NEW_CONCERN";
    followUpSnapshot?: JsonValue;
    followUpConfirmations?: JsonValue;
    followUpDelta?: JsonValue;
    aestheticOtherNotes?: string | null;
    laserOtherNotes?: string | null;
  };
}

export interface FinalSubmitResult {
  patientId: string;
  visitId: string;
  clinicalInterviewId: string;
  draftId: string;
  status: "UNDER_REVIEW";
  idempotentReplay: boolean;
}

export type FinalSubmitErrorCode =
  | "INVALID_SESSION"
  | "SESSION_NOT_ACTIVE"
  | "DRAFT_NOT_SUBMITTABLE"
  | "OFFICIAL_STATE_NOT_READY"
  | "INVALID_PROFILE"
  | "CONFIGURATION_ERROR"
  | "RETRYABLE_CONFLICT";

export class FinalSubmitError extends Error {
  constructor(readonly code: FinalSubmitErrorCode) {
    super(code);
    this.name = "FinalSubmitError";
  }
}

export interface FinalSubmitServiceDependencies {
  now?: () => Date;
  beforeTransaction?: () => Promise<void>;
  beforeCommit?: () => Promise<void>;
  evaluateOfficialState?: (input: {
    draftId: string;
    contentVersionId: string;
    patientInputJson: PatientInputJson;
  }) => Promise<EvaluatedOfficialState>;
  deriveLockedDraftArtifacts?: (input: {
    contentVersionId: string;
    patientInputJson: PatientInputJson;
  }) => LockedDraftSubmitArtifacts;
  databaseSchema?: string;
}

function isRetryablePrismaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "P2002" ||
      (error as { code?: unknown }).code === "P2034")
  );
}

function assertProfile(profile: FinalSubmitProfile, now: Date): void {
  if (
    profile.fullName.trim().length === 0 ||
    Number.isNaN(profile.dateOfBirth.getTime()) ||
    profile.dateOfBirth.getTime() > now.getTime()
  ) {
    throw new FinalSubmitError("INVALID_PROFILE");
  }
}

function assertOfficialState(state: EvaluatedOfficialState): void {
  if (state.state !== "READY") {
    throw new FinalSubmitError("OFFICIAL_STATE_NOT_READY");
  }

  if (
    state.routingEvaluations.some(
      (evaluation) =>
        evaluation.resultState === "UNKNOWN" ||
        evaluation.resultState === "PENDING" ||
        evaluation.resultState === "CONFIGURATION_ERROR",
    )
  ) {
    throw new FinalSubmitError("OFFICIAL_STATE_NOT_READY");
  }
}

export class FinalSubmitService {
  private readonly now: () => Date;
  private readonly beforeTransaction: () => Promise<void>;
  private readonly beforeCommit: () => Promise<void>;
  private readonly evaluateOfficialState: NonNullable<
    FinalSubmitServiceDependencies["evaluateOfficialState"]
  >;
  private readonly deriveLockedDraftArtifacts: NonNullable<
    FinalSubmitServiceDependencies["deriveLockedDraftArtifacts"]
  >;
  private readonly databaseSchema: string;

  constructor(
    private readonly prisma: PrismaClient = getPrismaClient(),
    dependencies: FinalSubmitServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.beforeTransaction = dependencies.beforeTransaction ?? (async () => {});
    this.beforeCommit = dependencies.beforeCommit ?? (async () => {});
    this.evaluateOfficialState =
      dependencies.evaluateOfficialState ??
      (async () => {
        throw new FinalSubmitError("CONFIGURATION_ERROR");
      });
    this.deriveLockedDraftArtifacts = dependencies.deriveLockedDraftArtifacts
      ?? ((input) => getP01ProfileAndVisit(input.patientInputJson));
    this.databaseSchema = dependencies.databaseSchema ?? activeDatabaseSchema();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(this.databaseSchema)) {
      throw new FinalSubmitError("CONFIGURATION_ERROR");
    }
  }

  async submit(command: FinalSubmitCommand): Promise<FinalSubmitResult> {
    const now = this.now();

    if (!command.patientSessionToken) {
      throw new FinalSubmitError("INVALID_SESSION");
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.submitOnce(command, now);
      } catch (error) {
        if (!isRetryablePrismaError(error) || attempt === 1) {
          if (isRetryablePrismaError(error)) {
            throw new FinalSubmitError("RETRYABLE_CONFLICT");
          }

          throw error;
        }
      }
    }

    throw new FinalSubmitError("RETRYABLE_CONFLICT");
  }

  private async submitOnce(
    command: FinalSubmitCommand,
    now: Date,
  ): Promise<FinalSubmitResult> {
    const sessionTokenHash = hashPatientAccessToken(
      command.patientSessionToken,
    );
    await this.beforeTransaction();

    return this.prisma.$transaction(
      async (tx) => {
        const access = await tx.patientAccessSession.findUnique({
          where: {
            sessionTokenHash,
          },
          include: {
            invitation: true,
            draft: true,
            followUpServerContext: true,
          },
        });

        if (!access?.draft) {
          throw new FinalSubmitError("INVALID_SESSION");
        }

        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM ${Prisma.raw(`"${this.databaseSchema}"."DraftClinicalInterview"`)}
          WHERE "id" = ${access.draft.id}::uuid
          FOR UPDATE
        `;

        const committed = await this.findCommittedResult(
          tx,
          access.draft.id,
        );

        if (committed) {
          return {
            ...committed,
            idempotentReplay: true,
          };
        }

        const lockedAccess = await tx.patientAccessSession.findUniqueOrThrow({
          where: {
            id: access.id,
          },
          include: {
            invitation: true,
            draft: true,
            followUpServerContext: true,
          },
        });

        if (
          lockedAccess.status !== "ACTIVE" ||
          lockedAccess.expiresAt.getTime() <= now.getTime()
        ) {
          throw new FinalSubmitError("SESSION_NOT_ACTIVE");
        }

        if (lockedAccess.draft?.status !== "DRAFT") {
          throw new FinalSubmitError("DRAFT_NOT_SUBMITTABLE");
        }

        // The row lock is the revision boundary for Final Submit. Derive every
        // committed artifact from this reloaded draft, never from a command that
        // a route or client may have assembled before the transaction began.
        let lockedArtifacts: LockedDraftSubmitArtifacts;
        try {
          lockedArtifacts = this.deriveLockedDraftArtifacts({
            contentVersionId: lockedAccess.draft.contentVersionId,
            patientInputJson: lockedAccess.draft.patientInputJson as PatientInputJson,
          });
        } catch {
          throw new FinalSubmitError("DRAFT_NOT_SUBMITTABLE");
        }
        assertProfile(lockedArtifacts.profile, now);
        const lockedVisit = lockedArtifacts.visit;

        const evaluatedOfficialState = await this.evaluateOfficialState({
          draftId: lockedAccess.draft.id,
          contentVersionId: lockedAccess.draft.contentVersionId,
          patientInputJson:
            lockedAccess.draft.patientInputJson as PatientInputJson,
        });
        assertOfficialState(evaluatedOfficialState);
        await this.assertEvaluatedStateReferences(
          tx,
          lockedAccess.draft.contentVersionId,
          evaluatedOfficialState,
        );

        const referenceData = await this.loadReferenceData(
          tx,
          lockedAccess.draft.contentVersionId,
        );

        validateFinalSubmitVisitInput(
          {
            primaryReasonForVisitCodes: [
              lockedVisit.primaryReasonCode,
            ],
            additionalRequestCodes:
              lockedVisit.additionalReasonCodes,
            selectedProcedureCodes:
              lockedVisit.selectedProcedureCodes,
            selectedLaserServiceCodes:
              lockedVisit.selectedLaserServiceCodes,
            aestheticOtherNotes: lockedVisit.aestheticOtherNotes,
            laserOtherNotes: lockedVisit.laserOtherNotes,
          },
          referenceData,
        );

        const patientId = await this.resolveOfficialPatient(
          tx,
          lockedAccess.invitation,
          lockedArtifacts.profile,
        );

        const reasonCodes = [
          lockedVisit.primaryReasonCode,
          ...lockedVisit.additionalReasonCodes,
        ];
        const reasonDefinitions = await tx.reasonForVisitDefinition.findMany({
          where: {
            contentVersionId: lockedAccess.draft.contentVersionId,
            code: {
              in: reasonCodes,
            },
            isActive: true,
          },
          select: {
            id: true,
            code: true,
          },
        });
        const reasonIds = new Map(
          reasonDefinitions.map((definition) => [
            definition.code,
            definition.id,
          ]),
        );

        const [procedureDefinitions, laserDefinitions] = await Promise.all([
          tx.aestheticProcedureDefinition.findMany({
            where: {
              contentVersionId: lockedAccess.draft.contentVersionId,
              code: {
                in: lockedVisit.selectedProcedureCodes,
              },
            },
            select: {
              id: true,
              code: true,
            },
          }),
          tx.laserServiceDefinition.findMany({
            where: {
              contentVersionId: lockedAccess.draft.contentVersionId,
              code: {
                in: lockedVisit.selectedLaserServiceCodes,
              },
            },
            select: {
              id: true,
              code: true,
            },
          }),
        ]);

        const clinicalEpisodeId = await this.resolveClinicalEpisode(tx, {
          patientId,
          clinicScopeId: lockedAccess.invitation.clinicScopeId,
          visitType: lockedVisit.visitType ?? "INITIAL",
          primaryReasonCode: lockedVisit.primaryReasonCode,
          requestedEpisodeId: lockedVisit.clinicalEpisodeId,
          reuseConcurrentInitialEpisode: lockedAccess.invitation.patientId === null,
          now,
        });

        const visit = await tx.visit.create({
          data: {
            patientId,
            clinicScopeId: lockedAccess.invitation.clinicScopeId,
            sourceDraftId: lockedAccess.draft.id,
            clinicalEpisodeId,
            visitType: lockedVisit.visitType ?? "INITIAL",
            ...(lockedVisit.followUpIntent ? {
              followUpContext: {
                create: {
                  sourceVisitId: lockedVisit.sourceVisitId ?? null,
                  intent: lockedVisit.followUpIntent,
                  snapshotJson: (selectFollowUpServerSnapshot(
                    lockedAccess.followUpServerContext?.contextJson,
                    clinicalEpisodeId,
                  ) ?? lockedVisit.followUpSnapshot ?? {}) as Prisma.InputJsonValue,
                  confirmationsJson: (lockedVisit.followUpConfirmations ?? {}) as Prisma.InputJsonValue,
                  patientDeltaJson: (lockedVisit.followUpDelta ?? {}) as Prisma.InputJsonValue,
                },
              },
            } : {}),
            reasons: {
              create: reasonCodes.map((code) => ({
                reasonDefinitionId: reasonIds.get(code)!,
                role:
                  code === lockedVisit.primaryReasonCode
                    ? "PRIMARY"
                    : "ADDITIONAL",
              })),
            },
            aestheticProcedureSelections: {
              create: procedureDefinitions.map((definition) => ({
                procedureDefinitionId: definition.id,
                notes:
                  definition.code === "AP_OTHER"
                    ? lockedVisit.aestheticOtherNotes
                    : null,
              })),
            },
            laserServiceSelections: {
              create: laserDefinitions.map((definition) => ({
                laserServiceDefinitionId: definition.id,
                notes:
                  definition.code === "LASER_OTHER"
                    ? lockedVisit.laserOtherNotes
                    : null,
              })),
            },
          },
        });

        const clinicalInterview = await tx.clinicalInterview.create({
          data: {
            visitId: visit.id,
            status: "UNDER_REVIEW",
            ...officialStateRelationsCreate(evaluatedOfficialState),
          },
        });

        await persistPatientContextFromOfficialState(tx, {
          patientId,
          clinicScopeId: lockedAccess.invitation.clinicScopeId,
          visitId: visit.id,
          clinicalInterviewId: clinicalInterview.id,
          officialState: evaluatedOfficialState,
          sourceUpdatedAt: now,
        });

        await tx.auditLog.create({
          data: {
            patientId,
            entityType: "DraftClinicalInterview",
            entityId: lockedAccess.draft.id,
            action: "SUBMIT",
            newValueJson: {
              visitId: visit.id,
              clinicalInterviewId: clinicalInterview.id,
              visitType: lockedVisit.visitType ?? "INITIAL",
              clinicalEpisodeId,
            },
            reason: "Atomic Final Submit",
          },
        });

        await this.beforeCommit();

        await tx.draftClinicalInterview.update({
          where: {
            id: lockedAccess.draft.id,
          },
          data: {
            status: "SUBMITTED",
            submittedAt: now,
            purgeAfter: null,
          },
        });

        await tx.patientAccessSession.update({
          where: {
            id: lockedAccess.id,
          },
          data: {
            status: "CLOSED",
            closeReason: "SUBMITTED",
            closedAt: now,
          },
        });

        return {
          patientId,
          visitId: visit.id,
          clinicalInterviewId: clinicalInterview.id,
          draftId: lockedAccess.draft.id,
          status: "UNDER_REVIEW",
          idempotentReplay: false,
        };
      },
      {
        isolationLevel: "Serializable",
      },
    );
  }

  private async findCommittedResult(
    tx: Prisma.TransactionClient,
    draftId: string,
  ): Promise<Omit<FinalSubmitResult, "idempotentReplay"> | null> {
    const visit = await tx.visit.findUnique({
      where: {
        sourceDraftId: draftId,
      },
      include: {
        clinicalInterview: true,
      },
    });

    if (!visit?.clinicalInterview) {
      return null;
    }

    return {
      patientId: visit.patientId,
      visitId: visit.id,
      clinicalInterviewId: visit.clinicalInterview.id,
      draftId,
      status: "UNDER_REVIEW",
    };
  }

  private async resolveOfficialPatient(
    tx: Prisma.TransactionClient,
    invitation: {
      patientId: string | null;
      clinicScopeId: string;
      temporaryMrnDisplayValue: string | null;
      temporaryMrnNormalizedValue: string | null;
    },
    profile: FinalSubmitProfile,
  ): Promise<string> {
    if (
      !invitation.temporaryMrnDisplayValue ||
      !invitation.temporaryMrnNormalizedValue
    ) {
      throw new FinalSubmitError("CONFIGURATION_ERROR");
    }

    let patientId = invitation.patientId;

    if (!patientId) {
      const existingIdentifier =
        await tx.externalPatientIdentifier.findUnique({
          where: {
            clinicScopeId_identifierType_normalizedValue: {
              clinicScopeId: invitation.clinicScopeId,
              identifierType: "CLINIC_MRN",
              normalizedValue: invitation.temporaryMrnNormalizedValue,
            },
          },
          select: {
            patientId: true,
          },
        });

      patientId = existingIdentifier?.patientId ?? null;
    }

    if (!patientId) {
      const patient = await tx.patient.create({
        data: {
          profile: {
            create: {
              fullName: profile.fullName.trim(),
              dateOfBirth: profile.dateOfBirth,
              gender: profile.gender,
              maritalStatus: profile.maritalStatus,
            },
          },
          externalIdentifiers: {
            create: {
              clinicScopeId: invitation.clinicScopeId,
              identifierType: "CLINIC_MRN",
              normalizedValue: invitation.temporaryMrnNormalizedValue,
              displayValue: invitation.temporaryMrnDisplayValue,
            },
          },
        },
        select: {
          id: true,
        },
      });

      return patient.id;
    }

    const existingProfile = await tx.patientProfile.findUnique({
      where: { patientId },
      select: { id: true, maritalStatus: true },
    });
    if (!existingProfile) {
      throw new FinalSubmitError("CONFIGURATION_ERROR");
    }

    // Returning-patient identity is server-owned. Patient follow-up cannot overwrite
    // name, DOB, or sex. Marital status is the only profile field allowed to update
    // through an explicitly recorded follow-up change.
    if (existingProfile.maritalStatus !== profile.maritalStatus) {
      await tx.patientProfile.update({
        where: { patientId },
        data: { maritalStatus: profile.maritalStatus },
      });
    }

    return patientId;
  }

  private async resolveClinicalEpisode(
    tx: Prisma.TransactionClient,
    input: {
      patientId: string;
      clinicScopeId: string;
      visitType: "INITIAL" | "FOLLOW_UP";
      primaryReasonCode: string;
      requestedEpisodeId?: string;
      reuseConcurrentInitialEpisode?: boolean;
      now: Date;
    },
  ): Promise<string> {
    if (input.visitType === "FOLLOW_UP") {
      if (!input.requestedEpisodeId) {
        throw new FinalSubmitError("CONFIGURATION_ERROR");
      }
      const episode = await tx.clinicalEpisode.findFirst({
        where: {
          id: input.requestedEpisodeId,
          patientId: input.patientId,
          clinicScopeId: input.clinicScopeId,
          status: "ACTIVE",
          primaryReasonCode: input.primaryReasonCode,
        },
        select: { id: true },
      });
      if (!episode) {
        throw new FinalSubmitError("CONFIGURATION_ERROR");
      }
      return episode.id;
    }

    const existingActiveEpisode = await tx.clinicalEpisode.findFirst({
      where: {
        patientId: input.patientId,
        clinicScopeId: input.clinicScopeId,
        primaryReasonCode: input.primaryReasonCode,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (existingActiveEpisode) {
      // Two access flows can be created for the same not-yet-existing MRN before
      // either flow commits. Once the first flow creates the Patient/Episode, the
      // second flow must reuse that concurrently-created Episode rather than fail.
      // Returning-patient flows (invitation already linked to a Patient) still
      // cannot create a duplicate active Episode for the same concern.
      if (input.reuseConcurrentInitialEpisode) return existingActiveEpisode.id;
      throw new FinalSubmitError("CONFIGURATION_ERROR");
    }

    const episode = await tx.clinicalEpisode.create({
      data: {
        patientId: input.patientId,
        clinicScopeId: input.clinicScopeId,
        primaryReasonCode: input.primaryReasonCode,
        status: "ACTIVE",
        openedAt: input.now,
      },
      select: { id: true },
    });
    return episode.id;
  }

  private async loadReferenceData(
    tx: Prisma.TransactionClient,
    contentVersionId: string,
  ): Promise<FinalSubmitReferenceData> {
    const [reasons, procedures, lasers] = await Promise.all([
      tx.reasonForVisitDefinition.findMany({
        where: { contentVersionId, isActive: true },
        select: { code: true },
      }),
      tx.aestheticProcedureDefinition.findMany({
        where: { contentVersionId, isActive: true },
        select: { code: true },
      }),
      tx.laserServiceDefinition.findMany({
        where: { contentVersionId, isActive: true },
        select: { code: true },
      }),
    ]);

    return {
      validReasonCodes: new Set(reasons.map(({ code }) => code)),
      validAestheticProcedureCodes: new Set(
        procedures.map(({ code }) => code),
      ),
      validLaserServiceCodes: new Set(lasers.map(({ code }) => code)),
    };
  }

  private async assertEvaluatedStateReferences(
    tx: Prisma.TransactionClient,
    contentVersionId: string,
    state: EvaluatedOfficialState,
  ): Promise<void> {
    const pathwayIds = new Set(state.activePathwayDefinitionIds);
    const libraryIds = new Set(state.activeLibraryIds);
    const questionDefinitionIds = new Set(
      state.questionResponses.map(({ questionDefinitionId }) =>
        questionDefinitionId,
      ),
    );
    const ruleVersionIds = new Set(
      state.routingEvaluations.map(({ ruleVersionId }) => ruleVersionId),
    );
    const questionIdentities = new Set<string>();

    for (const question of state.questionResponses) {
      const identity = getQuestionInstanceIdentity(
        question.questionDefinitionId,
        {
          type: question.responseScopeType,
          key: question.responseScopeKey,
        },
      );

      if (questionIdentities.has(identity)) {
        throw new FinalSubmitError("CONFIGURATION_ERROR");
      }

      questionIdentities.add(identity);
    }

    const [pathwayCount, libraryCount, questionCount, ruleCount] =
      await Promise.all([
        tx.clinicalPathwayDefinition.count({
          where: {
            id: { in: [...pathwayIds] },
            contentVersionId,
            isActive: true,
          },
        }),
        tx.clinicalLibrary.count({
          where: {
            id: { in: [...libraryIds] },
            contentVersionId,
            isActive: true,
          },
        }),
        tx.questionDefinition.count({
          where: {
            id: { in: [...questionDefinitionIds] },
            status: "APPROVED",
            isActive: true,
            clinicalLibrary: {
              is: {
                contentVersionId,
                isActive: true,
              },
            },
          },
        }),
        tx.contentVersionRuleVersion.count({
          where: {
            contentVersionId,
            ruleVersionId: { in: [...ruleVersionIds] },
          },
        }),
      ]);

    if (
      pathwayCount !== pathwayIds.size ||
      libraryCount !== libraryIds.size ||
      questionCount !== questionDefinitionIds.size ||
      ruleCount !== ruleVersionIds.size
    ) {
      throw new FinalSubmitError("CONFIGURATION_ERROR");
    }
  }
}
