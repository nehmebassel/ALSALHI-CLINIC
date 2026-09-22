import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { FOLLOW_UP_LIFECYCLE_BY_QUESTION } from "@/lib/follow-up/lifecycle";
import type { FollowUpChangeState } from "@/lib/follow-up/types";
import { getPrismaClient } from "@/lib/prisma";

export interface PhysicianFollowUpRoutingProfile {
  /** Existing, already-governed Question Registry codes that should be asked next follow-up. */
  questionCodes: string[];
  /** Compact change domains that the physician wants reconfirmed next follow-up. */
  changeDomains: Array<keyof FollowUpChangeState>;
  /** Opaque non-free-text rule tags for future diagnosis/plan routing. */
  tags?: string[];
}

const CHANGE_DOMAINS = new Set<keyof FollowUpChangeState>([
  "generalHealth",
  "medicationsSupplements",
  "hairTreatments",
  "hairProcedures",
  "triggerEvents",
  "sexSpecific",
  "hairQualityLifestyle",
]);

function normalizeRouting(input: PhysicianFollowUpRoutingProfile): PhysicianFollowUpRoutingProfile {
  const validQuestions = new Set(Object.keys(FOLLOW_UP_LIFECYCLE_BY_QUESTION));
  return {
    questionCodes: [...new Set(input.questionCodes.filter((code) => validQuestions.has(code)))],
    changeDomains: [...new Set(input.changeDomains.filter((domain) => CHANGE_DOMAINS.has(domain)))],
    ...(input.tags ? { tags: [...new Set(input.tags.filter((tag) => /^[A-Z0-9_:-]{1,80}$/.test(tag)))] } : {}),
  };
}

/**
 * Persists the physician-owned projection that controls the NEXT patient follow-up.
 * Raw diagnoses and clinician notes remain in the physician clinical record; this
 * profile contains only rule-safe routing metadata plus an explicitly approved
 * patient-visible summary.
 */
export async function saveClinicalEpisodeFollowUpProfile(input: {
  clinicalEpisodeId: string;
  sourceVisitId: string;
  physicianUserId: string;
  routing: PhysicianFollowUpRoutingProfile;
  patientVisibleSummaryJson: Prisma.InputJsonValue;
  approvedAt?: Date;
}, prisma: PrismaClient = getPrismaClient()): Promise<void> {
  const approvedAt = input.approvedAt ?? new Date();
  const routing = normalizeRouting(input.routing);

  await prisma.$transaction(async (tx) => {
    const [episode, sourceVisit, physician] = await Promise.all([
      tx.clinicalEpisode.findUnique({
        where: { id: input.clinicalEpisodeId },
        select: { id: true, patientId: true },
      }),
      tx.visit.findUnique({
        where: { id: input.sourceVisitId },
        select: { id: true, patientId: true, clinicalEpisodeId: true },
      }),
      tx.user.findUnique({
        where: { id: input.physicianUserId },
        select: { id: true, role: { select: { code: true } } },
      }),
    ]);

    if (!episode || !sourceVisit || sourceVisit.clinicalEpisodeId !== episode.id || sourceVisit.patientId !== episode.patientId) {
      throw new Error("FOLLOW_UP_PROFILE_SOURCE_VISIT_INVALID");
    }
    if (!physician || physician.role.code !== "PHYSICIAN") {
      throw new Error("FOLLOW_UP_PROFILE_PHYSICIAN_REQUIRED");
    }

    await tx.clinicalEpisodeFollowUpProfile.upsert({
      where: { clinicalEpisodeId: episode.id },
      create: {
        clinicalEpisodeId: episode.id,
        sourceVisitId: sourceVisit.id,
        updatedByUserId: physician.id,
        routingJson: routing as unknown as Prisma.InputJsonValue,
        patientVisibleSummaryJson: input.patientVisibleSummaryJson,
        approvedAt,
      },
      update: {
        sourceVisitId: sourceVisit.id,
        updatedByUserId: physician.id,
        routingJson: routing as unknown as Prisma.InputJsonValue,
        patientVisibleSummaryJson: input.patientVisibleSummaryJson,
        approvedAt,
      },
    });

    await tx.auditLog.create({
      data: {
        patientId: episode.patientId,
        changedByUserId: physician.id,
        entityType: "ClinicalEpisodeFollowUpProfile",
        entityId: episode.id,
        action: "APPROVE",
        newValueJson: {
          sourceVisitId: sourceVisit.id,
          approvedAt: approvedAt.toISOString(),
          questionCodeCount: routing.questionCodes.length,
          changeDomains: routing.changeDomains,
          tags: routing.tags ?? [],
        },
        reason: "Physician-approved longitudinal follow-up state",
      },
    });
  });
}
