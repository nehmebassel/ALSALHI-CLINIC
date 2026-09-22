import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { buildReturningPatientContextBundle } from "@/lib/follow-up/context";
import { mergeServerOwnedFollowUpContext } from "@/lib/follow-up/autosave";

import type {
  CreateAccessFlowRecord,
  FinalSubmitReferenceData,
  PatientAccessSnapshot,
  PatientAccessStore,
  PatientInputJson,
} from "./service";

export class PrismaPatientAccessStore implements PatientAccessStore {
  constructor(
    private readonly prisma: PrismaClient = getPrismaClient(),
  ) {}

  async createAccessFlow(input: {
    createdByUserId: string;
    clinicScopeId: string;
    temporaryMrnDisplayValue: string;
    temporaryMrnNormalizedValue: string;
    now: Date;
    expiresAt: Date;
    sessionTokenHash: string;
    patientInputJson: PatientInputJson;
  }): Promise<CreateAccessFlowRecord> {
    return this.prisma.$transaction(async (tx) => {
      const activeContentVersions = await tx.contentVersion.findMany({
        where: {
          isActive: true,
          publishedAt: {
            not: null,
          },
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 2,
        select: {
          id: true,
        },
      });

      if (activeContentVersions.length === 0) {
        throw new Error(
          "No active published ContentVersion is available for a new draft.",
        );
      }

      if (activeContentVersions.length > 1) {
        throw new Error(
          "More than one active published ContentVersion exists.",
        );
      }

      const existingIdentifier =
        await tx.externalPatientIdentifier.findUnique({
          where: {
            clinicScopeId_identifierType_normalizedValue: {
              clinicScopeId: input.clinicScopeId,
              identifierType: "CLINIC_MRN",
              normalizedValue: input.temporaryMrnNormalizedValue,
            },
          },
          select: {
            patientId: true,
          },
        });

      const returningBundle = existingIdentifier
        ? await buildReturningPatientContextBundle({
            db: tx,
            patientId: existingIdentifier.patientId,
            clinicScopeId: input.clinicScopeId,
            mrnDisplayValue: input.temporaryMrnDisplayValue,
            contentVersionId: activeContentVersions[0].id,
            now: input.now,
            baseInput: input.patientInputJson,
          })
        : null;
      const patientInputJson = returningBundle?.patientInputJson ?? input.patientInputJson;

      const invitation = await tx.interviewInvitation.create({
        data: {
          createdByUserId: input.createdByUserId,
          clinicScopeId: input.clinicScopeId,
          patientId: existingIdentifier?.patientId ?? null,
          temporaryMrnDisplayValue: input.temporaryMrnDisplayValue,
          temporaryMrnNormalizedValue: input.temporaryMrnNormalizedValue,
          expiresAt: input.expiresAt,
          session: {
            create: {
              sessionTokenHash: input.sessionTokenHash,
              status: "ACTIVE",
              lastActivityAt: input.now,
              expiresAt: input.expiresAt,
              draft: {
                create: {
                  contentVersionId: activeContentVersions[0].id,
                  patientInputJson,
                  expiresAt: input.expiresAt,
                },
              },
              ...(existingIdentifier && returningBundle ? {
                followUpServerContext: {
                  create: {
                    patientId: existingIdentifier.patientId,
                    contextVersion: returningBundle.serverContext.version,
                    contextJson: returningBundle.serverContext as unknown as Prisma.InputJsonValue,
                    generatedAt: input.now,
                  },
                },
              } : {}),
            },
          },
        },
        select: {
          id: true,
          session: {
            select: {
              id: true,
              draft: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      if (!invitation.session?.draft) {
        throw new Error(
          "Patient access flow was created without a draft.",
        );
      }

      return {
        invitationId: invitation.id,
        sessionId: invitation.session.id,
        draftId: invitation.session.draft.id,
        status: invitation.session.draft.status,
        matchedExistingPatient: Boolean(existingIdentifier),
      };
    });
  }

  async findAccessByTokenHash(
    sessionTokenHash: string,
  ): Promise<PatientAccessSnapshot | null> {
    return this.findAccess({ sessionTokenHash });
  }

  async findAccessBySessionId(
    sessionId: string,
  ): Promise<PatientAccessSnapshot | null> {
    return this.findAccess({ id: sessionId });
  }

  private async findAccess(where: {
    id?: string;
    sessionTokenHash?: string;
  }): Promise<PatientAccessSnapshot | null> {
    const session = await this.prisma.patientAccessSession.findFirst({
      where,
      select: {
        id: true,
        status: true,
        closeReason: true,
        lastActivityAt: true,
        expiresAt: true,
        lockedAt: true,
        expiredAt: true,
        closedAt: true,
        invitation: {
          select: {
            clinicScopeId: true,
            patientId: true,
            temporaryMrnDisplayValue: true,
            temporaryMrnNormalizedValue: true,
            expiresAt: true,
            cancelledAt: true,
          },
        },
        draft: {
          select: {
            id: true,
            contentVersionId: true,
            status: true,
            expiresAt: true,
            patientInputJson: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!session?.draft) {
      return null;
    }

    return {
      session: {
        id: session.id,
        status: session.status,
        closeReason: session.closeReason,
        lastActivityAt: session.lastActivityAt,
        expiresAt: session.expiresAt,
        lockedAt: session.lockedAt,
        expiredAt: session.expiredAt,
        closedAt: session.closedAt,
      },
      invitation: session.invitation,
      draft: {
        ...session.draft,
        patientInputJson:
          session.draft.patientInputJson as PatientInputJson,
      },
    };
  }

  async lockAccess(input: {
    sessionId: string;
    now: Date;
  }): Promise<void> {
    await this.prisma.patientAccessSession.updateMany({
      where: {
        id: input.sessionId,
        status: "ACTIVE",
        closedAt: null,
      },
      data: {
        status: "LOCKED",
        lockedAt: input.now,
      },
    });
  }

  async expireAccess(input: {
    sessionId: string;
    draftId: string;
    now: Date;
    purgeAfter: Date;
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.patientAccessSession.updateMany({
        where: {
          id: input.sessionId,
          status: {
            in: ["ACTIVE", "LOCKED"],
          },
        },
        data: {
          status: "EXPIRED",
          expiredAt: input.now,
        },
      }),
      this.prisma.draftClinicalInterview.updateMany({
        where: {
          id: input.draftId,
          status: "DRAFT",
        },
        data: {
          status: "EXPIRED",
          purgeAfter: input.purgeAfter,
        },
      }),
    ]);
  }

  async reactivateAccess(input: {
    sessionId: string;
    now: Date;
    expiresAt: Date;
  }): Promise<PatientAccessSnapshot | null> {
    const updated = await this.prisma.patientAccessSession.updateMany({
      where: {
        id: input.sessionId,
        status: "LOCKED",
        expiresAt: {
          gt: input.now,
        },
        draft: {
          is: {
            status: "DRAFT",
          },
        },
      },
      data: {
        status: "ACTIVE",
        lastActivityAt: input.now,
        expiresAt: input.expiresAt,
        lockedAt: null,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findAccessBySessionId(input.sessionId);
  }

  async cancelAccess(input: {
    sessionId: string;
    now: Date;
    purgeAfter: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const sessions = await tx.patientAccessSession.updateManyAndReturn({
        where: {
          id: input.sessionId,
          status: {
            in: ["ACTIVE", "LOCKED"],
          },
          draft: {
            is: {
              status: "DRAFT",
            },
          },
        },
        data: {
          status: "CLOSED",
          closeReason: "CANCELLED",
          closedAt: input.now,
        },
        select: {
          invitationId: true,
        },
      });

      if (sessions.length !== 1) {
        return false;
      }

      await tx.interviewInvitation.update({
        where: {
          id: sessions[0].invitationId,
        },
        data: {
          cancelledAt: input.now,
        },
      });
      await tx.draftClinicalInterview.update({
        where: {
          sessionId: input.sessionId,
        },
        data: {
          status: "CANCELLED",
          cancelledAt: input.now,
          purgeAfter: input.purgeAfter,
        },
      });

      return true;
    });
  }

  async autosaveDraft(input: {
    draftId: string;
    sessionTokenHash: string;
    patientInputJson: PatientInputJson;
    now: Date;
    expiresAt: Date;
  }): Promise<PatientAccessSnapshot["draft"] | null> {
    return this.prisma.$transaction(async (tx) => {
      const sessions = await tx.patientAccessSession.updateManyAndReturn({
        where: {
          sessionTokenHash: input.sessionTokenHash,
          status: "ACTIVE",
          closedAt: null,
          expiresAt: {
            gt: input.now,
          },
          draft: {
            is: {
              id: input.draftId,
              status: "DRAFT",
            },
          },
        },
        data: {
          lastActivityAt: input.now,
          expiresAt: input.expiresAt,
        },
        select: {
          invitationId: true,
        },
      });

      if (sessions.length !== 1) {
        return null;
      }

      await tx.interviewInvitation.update({
        where: {
          id: sessions[0].invitationId,
        },
        data: {
          expiresAt: input.expiresAt,
        },
      });

      const currentDraft = await tx.draftClinicalInterview.findUniqueOrThrow({
        where: { id: input.draftId },
        select: { patientInputJson: true },
      });
      const patientInputJson = mergeServerOwnedFollowUpContext(
        currentDraft.patientInputJson as PatientInputJson,
        input.patientInputJson,
      );

      const draft = await tx.draftClinicalInterview.update({
        where: {
          id: input.draftId,
        },
        data: {
          patientInputJson,
          expiresAt: input.expiresAt,
        },
        select: {
          id: true,
          contentVersionId: true,
          status: true,
          expiresAt: true,
          patientInputJson: true,
          updatedAt: true,
        },
      });

      return {
        ...draft,
        patientInputJson: draft.patientInputJson as PatientInputJson,
      };
    });
  }

  async loadFinalSubmitReferenceData(
    contentVersionId: string,
  ): Promise<FinalSubmitReferenceData> {
    const [reasonDefinitions, aestheticDefinitions, laserDefinitions] =
      await Promise.all([
        this.prisma.reasonForVisitDefinition.findMany({
          where: {
            contentVersionId,
            isActive: true,
          },
          select: {
            code: true,
          },
        }),
        this.prisma.aestheticProcedureDefinition.findMany({
          where: {
            contentVersionId,
            isActive: true,
          },
          select: {
            code: true,
          },
        }),
        this.prisma.laserServiceDefinition.findMany({
          where: {
            contentVersionId,
            isActive: true,
          },
          select: {
            code: true,
          },
        }),
      ]);

    return {
      validReasonCodes: new Set(
        reasonDefinitions.map((definition) => definition.code),
      ),
      validAestheticProcedureCodes: new Set(
        aestheticDefinitions.map((definition) => definition.code),
      ),
      validLaserServiceCodes: new Set(
        laserDefinitions.map((definition) => definition.code),
      ),
    };
  }
}
