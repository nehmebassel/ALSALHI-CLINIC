import { P01_PATHWAY_CODES } from "@/lib/p01/contracts";

export type PhysicianCapabilities = {
  hairHistory: boolean;
  physicianHairJourney: boolean;
};

export type PhysicianPatientReviewState = "PENDING" | "HAIR_HISTORY_APPROVED" | "COMPLETED";

export type PhysicianHairWorkflow = {
  defaultTab: "SUMMARY" | "HISTORY" | "JOURNEY";
  hairHistoryReviewRequired: boolean;
  hairHistoryReferenceOnly: boolean;
  physicianHairJourneyActive: boolean;
};

type VisitWithPathways = {
  clinicalEpisodeId: string | null;
  clinicalInterview: {
    activePathways: Array<{ pathwayDefinition: { code: string } }>;
  } | null;
};

/**
 * Follow-up visits are delta-based. A pathway is therefore effective for the
 * current Clinical Episode when it has been persisted on any official
 * interview in that episode. Omission from a later delta visit does not
 * deactivate an earlier pathway; a new concern belongs to a new episode.
 */
export function effectivePathwayCodesForEpisode(
  visits: readonly VisitWithPathways[],
  episodeId: string | undefined,
): string[] {
  if (!episodeId) return [];
  const codes = new Set<string>();
  for (const visit of visits) {
    if (visit.clinicalEpisodeId !== episodeId) continue;
    for (const active of visit.clinicalInterview?.activePathways ?? []) {
      codes.add(active.pathwayDefinition.code);
    }
  }
  return [...codes].sort();
}


export function isPhysicianQueueReviewPending(input: {
  interviewStatus: "UNDER_REVIEW" | "COMPLETED";
  visitType: "INITIAL" | "FOLLOW_UP";
  visitId: string;
  approvedHairHistoryVisitId?: string;
  approvedHairHistoryRevision?: number;
}): boolean {
  return resolvePhysicianPatientReviewState(input) === "PENDING";
}

export function resolvePhysicianPatientReviewState(input: {
  interviewStatus: "UNDER_REVIEW" | "COMPLETED";
  visitType: "INITIAL" | "FOLLOW_UP";
  visitId: string;
  approvedHairHistoryVisitId?: string;
  approvedHairHistoryRevision?: number;
}): PhysicianPatientReviewState {
  if (input.interviewStatus !== "UNDER_REVIEW") return "COMPLETED";
  const initialHairHistoryAlreadyApproved = input.visitType === "INITIAL"
    && (input.approvedHairHistoryRevision ?? 0) > 0
    && input.approvedHairHistoryVisitId === input.visitId;
  return initialHairHistoryAlreadyApproved ? "HAIR_HISTORY_APPROVED" : "PENDING";
}

export function resolvePhysicianCapabilities(effectivePathwayCodes: readonly string[]): PhysicianCapabilities {
  const hasHairScalp = effectivePathwayCodes.includes(P01_PATHWAY_CODES.hairScalp);
  return {
    hairHistory: hasHairScalp,
    physicianHairJourney: hasHairScalp,
  };
}

/**
 * Routing is intentionally separate from pathway capability. Hair/Scalp can
 * expose both workspaces, while the current visit decides which one is active.
 * Reopened amendment drafts remain explicit edits; otherwise follow-up history
 * is reference-only and cannot become a completion gate again.
 */
export function resolvePhysicianHairWorkflow(input: {
  visitType?: "INITIAL" | "FOLLOW_UP";
  hairHistoryAvailable: boolean;
  physicianHairJourneyAvailable: boolean;
  physicianHairJourneyHasFinalizedData?: boolean;
  hairHistoryStatus: "PATIENT_REPORTED_PREVIEW" | "REVIEWED_DRAFT" | "AMENDMENT_DRAFT" | "APPROVED_READ_ONLY";
  hasApprovedRevision: boolean;
}): PhysicianHairWorkflow {
  const isFollowUp = input.visitType === "FOLLOW_UP";
  const isAmendmentDraft = input.hairHistoryStatus === "AMENDMENT_DRAFT";
  const hasApprovedRevision = input.hasApprovedRevision || input.hairHistoryStatus === "APPROVED_READ_ONLY";

  const hairHistoryReviewRequired = input.hairHistoryAvailable && !isFollowUp && !hasApprovedRevision;
  const hairHistoryReferenceOnly = input.hairHistoryAvailable && isFollowUp && !isAmendmentDraft;
  const physicianHairJourneyActive = input.physicianHairJourneyAvailable
    && Boolean(input.physicianHairJourneyHasFinalizedData);

  if (isFollowUp && physicianHairJourneyActive) {
    return { defaultTab: "JOURNEY", hairHistoryReviewRequired, hairHistoryReferenceOnly, physicianHairJourneyActive };
  }
  if (input.visitType === "INITIAL" && input.hairHistoryAvailable && (!hasApprovedRevision || isAmendmentDraft)) {
    return { defaultTab: "HISTORY", hairHistoryReviewRequired: !hasApprovedRevision, hairHistoryReferenceOnly: false, physicianHairJourneyActive };
  }
  if (input.visitType === "INITIAL" && hasApprovedRevision) {
    return { defaultTab: "SUMMARY", hairHistoryReviewRequired: false, hairHistoryReferenceOnly: false, physicianHairJourneyActive };
  }
  return { defaultTab: "SUMMARY", hairHistoryReviewRequired, hairHistoryReferenceOnly, physicianHairJourneyActive };
}
