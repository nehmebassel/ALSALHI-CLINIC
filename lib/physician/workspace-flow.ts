import type { PhysicianEpisodeDetail, PhysicianVisitSummary } from "./types";

export type PhysicianClinicalWorkspaceKind =
  | "HAIR"
  | "HAIR_SCALP"
  | "HAIR_QUALITY"
  | "DERMATOLOGY"
  | "LASER"
  | "AESTHETIC"
  | "GENERAL";

export type PhysicianPrimaryTab = "SUMMARY" | "STORY" | "HISTORY" | "JOURNEY" | "VISITS";

export type PhysicianVisitWorkflowStatus =
  | "CANCELLED"
  | "NOT_PREPARED"
  | "DRAFT_READY"
  | "ENCOUNTER_IN_PROGRESS"
  | "FINALIZED";

export function physicianPrimaryTabAvailable(input: {
  tab: PhysicianPrimaryTab;
  hairHistoryAvailable: boolean;
  physicianHairJourneyActive: boolean;
}): boolean {
  if (input.tab === "HISTORY") return input.hairHistoryAvailable;
  if (input.tab === "JOURNEY") return input.physicianHairJourneyActive;
  return true;
}

export function coercePhysicianPrimaryTab(input: {
  current: PhysicianPrimaryTab;
  preferred: PhysicianPrimaryTab;
  hairHistoryAvailable: boolean;
  physicianHairJourneyActive: boolean;
}): PhysicianPrimaryTab {
  if (physicianPrimaryTabAvailable({
    tab: input.current,
    hairHistoryAvailable: input.hairHistoryAvailable,
    physicianHairJourneyActive: input.physicianHairJourneyActive,
  })) return input.current;

  if (physicianPrimaryTabAvailable({
    tab: input.preferred,
    hairHistoryAvailable: input.hairHistoryAvailable,
    physicianHairJourneyActive: input.physicianHairJourneyActive,
  })) return input.preferred;

  return "SUMMARY";
}

export function physicianVisitWorkflowStatus(visit: Pick<PhysicianVisitSummary, "visitStatus" | "visitOccurredAt" | "physicianRecordStatus">): PhysicianVisitWorkflowStatus {
  if (visit.visitStatus === "CANCELLED") return "CANCELLED";
  if (visit.physicianRecordStatus === "FINALIZED") return "FINALIZED";
  if (visit.physicianRecordStatus === "DRAFT" && visit.visitOccurredAt) return "ENCOUNTER_IN_PROGRESS";
  if (visit.physicianRecordStatus === "DRAFT") return "DRAFT_READY";
  return "NOT_PREPARED";
}

export function comparePhysicianVisitChronology(
  left: Pick<PhysicianVisitSummary, "id" | "createdAt" | "visitOccurredAt">,
  right: Pick<PhysicianVisitSummary, "id" | "createdAt" | "visitOccurredAt">,
): number {
  const leftAt = left.visitOccurredAt ?? left.createdAt;
  const rightAt = right.visitOccurredAt ?? right.createdAt;
  const byTime = leftAt.localeCompare(rightAt);
  if (byTime !== 0) return byTime;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function buildEpisodeVisitNumbers(episodes: readonly PhysicianEpisodeDetail[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const episode of episodes) {
    const chronological = [...episode.visits].sort(comparePhysicianVisitChronology);
    chronological.forEach((visit, index) => result.set(visit.id, index + 1));
  }
  return result;
}

export function physicianClinicalWorkspaceKind(input: {
  primaryReasonCode?: string;
  additionalReasonCodes?: readonly string[];
  hasScalpContent?: boolean;
}): PhysicianClinicalWorkspaceKind {
  const additional = new Set(input.additionalReasonCodes ?? []);
  if (input.primaryReasonCode === "RV_HAIR_LOSS") {
    return input.hasScalpContent || additional.has("RV_SCALP_SYMPTOMS") ? "HAIR_SCALP" : "HAIR";
  }
  if (input.primaryReasonCode === "RV_SCALP_SYMPTOMS") return "HAIR_SCALP";
  if (input.primaryReasonCode === "RV_HAIR_QUALITY") return "HAIR_QUALITY";
  if (input.primaryReasonCode === "RV_DERMATOLOGY") return "DERMATOLOGY";
  if (input.primaryReasonCode === "RV_LASER") return "LASER";
  if (input.primaryReasonCode === "RV_AESTHETIC_PROCEDURES") return "AESTHETIC";
  return "GENERAL";
}

/** A historical scalp-biopsy question alone does not activate a scalp concern. */
export function hasCurrentScalpConcern(questions: readonly { code: string; value: unknown }[]): boolean {
  const gate = questions.filter((question) => question.code === "Q_SECONDARY_SCALP_GATE").at(-1);
  if (gate?.value === "YES") return true;
  if (gate?.value === "NO") return false;
  return questions.some((question) => question.code === "Q_SCALP_SYMPTOMS"
    && Array.isArray(question.value) && question.value.some((value) => typeof value === "string" && !["NONE", "NO"].includes(value)));
}


export type PhysicianWorkspaceSectionProfile = {
  hairScalpAssessment: boolean;
  hairProcedureDecisions: boolean;
  genericDecisions: true;
};

/**
 * Controls physician-facing documentation sections without changing the
 * canonical Visit lifecycle. Hair Quality and non-hair services must not
 * inherit Hair Loss/Scalp examination, pattern, trichoscopy, or scalp-map UI.
 */
export function physicianWorkspaceSectionProfile(
  kind: PhysicianClinicalWorkspaceKind,
): PhysicianWorkspaceSectionProfile {
  return {
    hairScalpAssessment: kind === "HAIR" || kind === "HAIR_SCALP",
    hairProcedureDecisions: kind === "HAIR" || kind === "HAIR_SCALP",
    genericDecisions: true,
  };
}

export function physicianClinicalWorkspaceLabel(
  kind: PhysicianClinicalWorkspaceKind,
  locale: "ar" | "en",
): string {
  const labels: Record<PhysicianClinicalWorkspaceKind, { ar: string; en: string }> = {
    HAIR: { ar: "مساحة عمل طبيب الشعر", en: "Hair Physician Workspace" },
    HAIR_SCALP: { ar: "مساحة عمل طبيب الشعر وفروة الرأس", en: "Hair & Scalp Physician Workspace" },
    HAIR_QUALITY: { ar: "مساحة عمل طبيب جودة الشعر", en: "Hair Quality Physician Workspace" },
    DERMATOLOGY: { ar: "مساحة عمل طبيب الجلدية", en: "Dermatology Physician Workspace" },
    LASER: { ar: "مساحة عمل طبيب الليزر", en: "Laser Physician Workspace" },
    AESTHETIC: { ar: "مساحة عمل طبيب الإجراءات التجميلية", en: "Aesthetic Physician Workspace" },
    GENERAL: { ar: "مساحة عمل الطبيب", en: "Physician Workspace" },
  };
  return labels[kind][locale];
}

export function shouldOfferCurrentPhysicianWorkspace(input: {
  visit?: Pick<PhysicianVisitSummary, "visitStatus" | "visitType" | "patientReviewState" | "physicianRecordStatus">;
  hairHistoryAvailable: boolean;
  hasApprovedHairHistory: boolean;
}): boolean {
  const visit = input.visit;
  if (!visit || visit.visitStatus !== "CREATED" || visit.physicianRecordStatus === "FINALIZED") return false;
  if (visit.visitType === "FOLLOW_UP") return true;
  if (!input.hairHistoryAvailable) return true;
  return input.hasApprovedHairHistory || visit.patientReviewState === "HAIR_HISTORY_APPROVED";
}

export function selectPhysicianReviewVisit(visits: readonly PhysicianVisitSummary[]): PhysicianVisitSummary | undefined {
  return visits.find((visit) => visit.patientReviewState === "PENDING") ?? visits[0];
}
