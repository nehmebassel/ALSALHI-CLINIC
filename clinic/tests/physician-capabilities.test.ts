import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { P01_PATHWAY_CODES } from "../lib/p01/contracts";
import { buildPhysicianCaseSummary } from "../lib/physician/case-summary";
import { effectivePathwayCodesForEpisode, isPhysicianQueueReviewPending, resolvePhysicianCapabilities, resolvePhysicianHairWorkflow } from "../lib/physician/capabilities";
import type { PhysicianVisitSummary } from "../lib/physician/types";

function visit(input: { episodeId: string; pathways?: string[] }) {
  return {
    clinicalEpisodeId: input.episodeId,
    clinicalInterview: {
      activePathways: (input.pathways ?? []).map((code) => ({ pathwayDefinition: { code } })),
    },
  };
}

function reviewVisit(primaryEn: string): PhysicianVisitSummary {
  return {
    id: "visit-review",
    createdAt: "2026-08-19T09:00:00.000Z",
    completedAt: "2026-08-19T10:00:00.000Z",
    visitType: "INITIAL",
    visitStatus: "COMPLETED",
    interviewId: "interview-review",
    interviewStatus: "COMPLETED",
    primary: { ar: primaryEn, en: primaryEn },
    additional: [],
    episodeId: "episode-current",
    hasFollowUpDelta: false,
  };
}

test("effective episode pathways retain Hair/Scalp across a delta follow-up that does not repeat active pathways", () => {
  const effective = effectivePathwayCodesForEpisode([
    visit({ episodeId: "episode-hair", pathways: [P01_PATHWAY_CODES.hairScalp] }),
    visit({ episodeId: "episode-hair", pathways: [] }),
  ], "episode-hair");

  assert.deepEqual(effective, [P01_PATHWAY_CODES.hairScalp]);
  assert.deepEqual(resolvePhysicianCapabilities(effective), {
    hairHistory: true,
    physicianHairJourney: true,
  });
});

test("effective pathways are scoped to the current Clinical Episode, not an older Hair/Scalp episode", () => {
  const visits = [
    visit({ episodeId: "episode-old-hair", pathways: [P01_PATHWAY_CODES.hairScalp] }),
    visit({ episodeId: "episode-current-derm", pathways: [P01_PATHWAY_CODES.dermatology] }),
  ];

  const effective = effectivePathwayCodesForEpisode(visits, "episode-current-derm");
  assert.deepEqual(effective, [P01_PATHWAY_CODES.dermatology]);
  assert.deepEqual(resolvePhysicianCapabilities(effective), {
    hairHistory: false,
    physicianHairJourney: false,
  });
});

test("Physician Hair History/Journey capabilities are pathway-aware", () => {
  for (const code of [
    P01_PATHWAY_CODES.dermatology,
    P01_PATHWAY_CODES.laser,
    P01_PATHWAY_CODES.aesthetic,
    P01_PATHWAY_CODES.hairQuality,
  ]) {
    assert.deepEqual(resolvePhysicianCapabilities([code]), {
      hairHistory: false,
      physicianHairJourney: false,
    }, `${code} must not imply Hair History`);
  }

  assert.deepEqual(resolvePhysicianCapabilities([P01_PATHWAY_CODES.hairScalp]), {
    hairHistory: true,
    physicianHairJourney: true,
  });

  assert.deepEqual(resolvePhysicianCapabilities([
    P01_PATHWAY_CODES.hairScalp,
    P01_PATHWAY_CODES.laser,
  ]), {
    hairHistory: true,
    physicianHairJourney: true,
  });
});

test("pathway-aware completion never asks a pure Dermatology case to approve Hair History", () => {
  const summary = buildPhysicianCaseSummary({
    questions: [],
    reviewVisit: reviewVisit("Dermatology"),
    measurementSeries: [],
    historyApproved: false,
    hairHistoryApplicable: false,
    physicianJourneyApplicable: false,
  });

  assert.equal(summary.historyStatus, "NOT_APPLICABLE");
  assert.equal(summary.physicianJourneyStatus, "NOT_APPLICABLE");
  assert.equal(summary.needsAttention.some((item) => item.en.includes("Hair History")), false);
});

test("pathway-aware completion keeps Hair History pending for an applicable Hair/Scalp case", () => {
  const summary = buildPhysicianCaseSummary({
    questions: [],
    reviewVisit: reviewVisit("Hair Loss"),
    measurementSeries: [],
    historyApproved: false,
    hairHistoryApplicable: true,
    physicianJourneyApplicable: true,
  });

  assert.equal(summary.historyStatus, "PENDING");
  assert.equal(summary.needsAttention.some((item) => item.en === "Hair History has not been approved yet"), true);
});

test("Physician workspace gates Hair History and Physician Journey from central capabilities", () => {
  const workspace = fs.readFileSync(
    new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(workspace.includes("data.capabilities.hairHistory"), true);
  assert.equal(workspace.includes("data.capabilities.physicianHairJourney"), true);
});


test("Initial Hair History opens HISTORY for review and withholds JOURNEY until physician Finalize", () => {
  const initialPending = resolvePhysicianHairWorkflow({
    visitType: "INITIAL",
    hairHistoryAvailable: true,
    physicianHairJourneyAvailable: true,
    hairHistoryStatus: "PATIENT_REPORTED_PREVIEW",
    hasApprovedRevision: false,
  });
  assert.deepEqual(initialPending, {
    defaultTab: "HISTORY",
    hairHistoryReviewRequired: true,
    hairHistoryReferenceOnly: false,
    physicianHairJourneyActive: false,
  });

  const initialApproved = resolvePhysicianHairWorkflow({
    visitType: "INITIAL",
    hairHistoryAvailable: true,
    physicianHairJourneyAvailable: true,
    hairHistoryStatus: "APPROVED_READ_ONLY",
    hasApprovedRevision: true,
  });
  assert.equal(initialApproved.defaultTab, "SUMMARY");
  assert.equal(initialApproved.physicianHairJourneyActive, false);
  assert.equal(initialApproved.hairHistoryReviewRequired, false);

  const initialFinalized = resolvePhysicianHairWorkflow({
    visitType: "INITIAL",
    hairHistoryAvailable: true,
    physicianHairJourneyAvailable: true,
    physicianHairJourneyHasFinalizedData: true,
    hairHistoryStatus: "APPROVED_READ_ONLY",
    hasApprovedRevision: true,
  });
  assert.equal(initialFinalized.physicianHairJourneyActive, true);
});

test("Follow-up Hair workflow defaults to JOURNEY and never re-requires old Patient Hair History", () => {
  const followUp = resolvePhysicianHairWorkflow({
    visitType: "FOLLOW_UP",
    hairHistoryAvailable: true,
    physicianHairJourneyAvailable: true,
    physicianHairJourneyHasFinalizedData: true,
    hairHistoryStatus: "APPROVED_READ_ONLY",
    hasApprovedRevision: true,
  });
  assert.deepEqual(followUp, {
    defaultTab: "JOURNEY",
    hairHistoryReviewRequired: false,
    hairHistoryReferenceOnly: true,
    physicianHairJourneyActive: true,
  });

  const summary = buildPhysicianCaseSummary({
    questions: [],
    reviewVisit: { ...reviewVisit("Hair Loss"), visitType: "FOLLOW_UP", hasFollowUpDelta: true },
    measurementSeries: [],
    historyApproved: false,
    hairHistoryApplicable: true,
    hairHistoryReviewRequired: false,
    physicianJourneyApplicable: true,
  });
  assert.equal(summary.historyStatus, "PENDING");
  assert.equal(summary.needsAttention.some((item) => item.en === "Hair History has not been approved yet"), false);
});


test("physician queue no longer counts an approved Initial Hair History as awaiting review, while Follow-up remains reviewable", () => {
  assert.equal(isPhysicianQueueReviewPending({
    interviewStatus: "UNDER_REVIEW",
    visitType: "INITIAL",
    visitId: "visit-initial",
  }), true);
  assert.equal(isPhysicianQueueReviewPending({
    interviewStatus: "UNDER_REVIEW",
    visitType: "INITIAL",
    visitId: "visit-initial",
    approvedHairHistoryVisitId: "visit-initial",
    approvedHairHistoryRevision: 1,
  }), false);
  assert.equal(isPhysicianQueueReviewPending({
    interviewStatus: "UNDER_REVIEW",
    visitType: "FOLLOW_UP",
    visitId: "visit-follow-up",
    approvedHairHistoryVisitId: "visit-follow-up",
    approvedHairHistoryRevision: 2,
  }), true);
  assert.equal(isPhysicianQueueReviewPending({
    interviewStatus: "COMPLETED",
    visitType: "INITIAL",
    visitId: "visit-completed",
  }), false);
});
