import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildPhysicianCaseSummary } from "../lib/physician/case-summary";
import { resolvePhysicianPatientReviewState } from "../lib/physician/capabilities";
import type { PhysicianEpisodeDetail, PhysicianVisitSummary } from "../lib/physician/types";
import {
  buildEpisodeVisitNumbers,
  coercePhysicianPrimaryTab,
  comparePhysicianVisitChronology,
  physicianVisitWorkflowStatus,
  selectPhysicianReviewVisit,
} from "../lib/physician/workspace-flow";

function visit(input: Partial<PhysicianVisitSummary> & { id: string; createdAt: string }): PhysicianVisitSummary {
  return {
    id: input.id,
    createdAt: input.createdAt,
    visitType: input.visitType ?? "INITIAL",
    visitStatus: input.visitStatus ?? "CREATED",
    interviewId: input.interviewId ?? `interview-${input.id}`,
    interviewStatus: input.interviewStatus ?? "COMPLETED",
    patientReviewState: input.patientReviewState,
    physicianRecordStatus: input.physicianRecordStatus,
    primary: input.primary ?? { ar: "تساقط الشعر", en: "Hair Loss" },
    additional: input.additional ?? [],
    episodeId: input.episodeId,
    diagnosis: input.diagnosis,
    hasFollowUpDelta: input.hasFollowUpDelta ?? false,
    ...(input.visitOccurredAt ? { visitOccurredAt: input.visitOccurredAt } : {}),
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
  };
}

test("FPV-7 approved Initial Hair History is a distinct patient-reference state, not a pending review", () => {
  assert.equal(resolvePhysicianPatientReviewState({
    interviewStatus: "UNDER_REVIEW",
    visitType: "INITIAL",
    visitId: "visit-1",
    approvedHairHistoryVisitId: "visit-1",
    approvedHairHistoryRevision: 2,
  }), "HAIR_HISTORY_APPROVED");

  assert.equal(resolvePhysicianPatientReviewState({
    interviewStatus: "UNDER_REVIEW",
    visitType: "FOLLOW_UP",
    visitId: "visit-2",
    approvedHairHistoryVisitId: "visit-1",
    approvedHairHistoryRevision: 2,
  }), "PENDING");
});

test("FPV-7 case summary does not resurrect the stale review warning after Initial Hair History approval", () => {
  const summary = buildPhysicianCaseSummary({
    questions: [],
    reviewVisit: visit({
      id: "visit-1",
      createdAt: "2026-09-01T09:00:00.000Z",
      interviewStatus: "UNDER_REVIEW",
      patientReviewState: "HAIR_HISTORY_APPROVED",
    }),
    measurementSeries: [],
    historyApproved: true,
    hairHistoryApplicable: true,
    physicianJourneyApplicable: true,
  });

  assert.equal(summary.reviewStatus, "COMPLETED");
  assert.equal(summary.needsAttention.some((item) => item.en === "The current interview requires physician review"), false);
});

test("FPV-7 disabled primary tabs are coerced to a valid governed tab after server refresh", () => {
  assert.equal(coercePhysicianPrimaryTab({
    current: "JOURNEY",
    preferred: "SUMMARY",
    hairHistoryAvailable: false,
    physicianHairJourneyActive: false,
  }), "SUMMARY");

  assert.equal(coercePhysicianPrimaryTab({
    current: "HISTORY",
    preferred: "JOURNEY",
    hairHistoryAvailable: true,
    physicianHairJourneyActive: true,
  }), "HISTORY");
});

test("FPV-7 Visit cards distinguish not prepared, Draft, active encounter, finalized, and cancelled states", () => {
  assert.equal(physicianVisitWorkflowStatus(visit({ id: "v0", createdAt: "2026-09-01T08:00:00.000Z" })), "NOT_PREPARED");
  assert.equal(physicianVisitWorkflowStatus(visit({ id: "v1", createdAt: "2026-09-01T08:00:00.000Z", physicianRecordStatus: "DRAFT" })), "DRAFT_READY");
  assert.equal(physicianVisitWorkflowStatus(visit({ id: "v2", createdAt: "2026-09-01T08:00:00.000Z", physicianRecordStatus: "DRAFT", visitOccurredAt: "2026-09-01T09:00:00.000Z" })), "ENCOUNTER_IN_PROGRESS");
  assert.equal(physicianVisitWorkflowStatus(visit({ id: "v3", createdAt: "2026-09-01T08:00:00.000Z", physicianRecordStatus: "FINALIZED", visitOccurredAt: "2026-09-01T09:00:00.000Z" })), "FINALIZED");
  assert.equal(physicianVisitWorkflowStatus(visit({ id: "v4", createdAt: "2026-09-01T08:00:00.000Z", visitStatus: "CANCELLED", physicianRecordStatus: "DRAFT" })), "CANCELLED");
});

test("FPV-7 Visit chronology prefers encounter time and keeps a deterministic visitId tie-break", () => {
  const rows = [
    visit({ id: "visit-b", createdAt: "2026-01-01T08:00:00.000Z", visitOccurredAt: "2026-02-01T09:00:00.000Z" }),
    visit({ id: "visit-a", createdAt: "2026-03-01T08:00:00.000Z", visitOccurredAt: "2026-02-01T09:00:00.000Z" }),
    visit({ id: "visit-c", createdAt: "2026-01-15T08:00:00.000Z" }),
  ].sort(comparePhysicianVisitChronology);

  assert.deepEqual(rows.map((item) => item.id), ["visit-c", "visit-a", "visit-b"]);
});

test("FPV-7 Visit numbering resets within each ClinicalEpisode instead of numbering globally per patient", () => {
  const episodes: PhysicianEpisodeDetail[] = [
    {
      id: "episode-a",
      primary: { ar: "تساقط الشعر", en: "Hair Loss" },
      status: "ACTIVE",
      openedAt: "2026-01-01T00:00:00.000Z",
      visits: [
        visit({ id: "a2", createdAt: "2026-02-01T08:00:00.000Z", visitOccurredAt: "2026-02-01T09:00:00.000Z", episodeId: "episode-a" }),
        visit({ id: "a1", createdAt: "2026-01-01T08:00:00.000Z", visitOccurredAt: "2026-01-01T09:00:00.000Z", episodeId: "episode-a" }),
      ],
    },
    {
      id: "episode-b",
      primary: { ar: "جلدية", en: "Dermatology" },
      status: "ACTIVE",
      openedAt: "2026-03-01T00:00:00.000Z",
      visits: [visit({ id: "b1", createdAt: "2026-03-01T08:00:00.000Z", episodeId: "episode-b" })],
    },
  ];

  const numbers = buildEpisodeVisitNumbers(episodes);
  assert.equal(numbers.get("a1"), 1);
  assert.equal(numbers.get("a2"), 2);
  assert.equal(numbers.get("b1"), 1);
});

test("FPV-7 active workspace selects effective pending patient review, not stale raw UNDER_REVIEW history", () => {
  const selected = selectPhysicianReviewVisit([
    visit({ id: "follow-up", createdAt: "2026-09-02T09:00:00.000Z", visitType: "FOLLOW_UP", patientReviewState: "COMPLETED" }),
    visit({ id: "approved-initial", createdAt: "2026-09-01T09:00:00.000Z", interviewStatus: "UNDER_REVIEW", patientReviewState: "HAIR_HISTORY_APPROVED" }),
  ]);
  assert.equal(selected?.id, "follow-up");

  const pending = selectPhysicianReviewVisit([
    visit({ id: "newest-completed", createdAt: "2026-09-03T09:00:00.000Z", patientReviewState: "COMPLETED" }),
    visit({ id: "current-pending", createdAt: "2026-09-02T09:00:00.000Z", visitType: "FOLLOW_UP", interviewStatus: "UNDER_REVIEW", patientReviewState: "PENDING" }),
    visit({ id: "approved-initial", createdAt: "2026-09-01T09:00:00.000Z", interviewStatus: "UNDER_REVIEW", patientReviewState: "HAIR_HISTORY_APPROVED" }),
  ]);
  assert.equal(pending?.id, "current-pending");

  const readModel = fs.readFileSync(new URL("../lib/physician/read-model.ts", import.meta.url), "utf8");
  assert.equal(readModel.includes("selectPhysicianReviewVisit(visits)"), true);
  assert.equal(readModel.includes('patientReviewState,'), true);
  assert.equal(readModel.includes('physicianRecordStatus: visit.physicianVisitRecord.status'), true);
});

test("FPV-7 primary workspace keeps five approved tabs and integrates explicit empty/read-only states", () => {
  const workspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  assert.equal(workspace.includes('type WorkspaceTab = "SUMMARY" | "STORY" | "HISTORY" | "JOURNEY" | "VISITS"'), true);
  assert.equal(workspace.includes('coercePhysicianPrimaryTab'), true);
  assert.equal(workspace.includes('const activeTab = coercePhysicianPrimaryTab'), true);
  assert.equal(workspace.includes('useEffect(() =>'), false);
  assert.equal(workspace.includes('No summary facts available yet'), false);
  assert.equal(workspace.includes('"Clinical Snapshot"'), true);
  assert.equal(workspace.includes('"Important patient context"'), true);
  assert.equal(workspace.includes('No Clinical Story sections recorded'), true);
  assert.equal(workspace.includes('No linked clinical Visits yet'), true);
  assert.equal(workspace.includes('Finalized Visit'), true);
  assert.equal(workspace.includes('Patient reference awaiting review'), true);
  assert.equal(workspace.includes('"Full Interview"'), false);
});

test("FPV-7 patient record has a bounded retry/back error state without exposing exception details", () => {
  const source = fs.readFileSync(new URL("../app/physician/patients/[patientId]/error.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('role="alert"'), true);
  assert.equal(source.includes("onClick={reset}"), true);
  assert.equal(source.includes('href="/physician"'), true);
  assert.equal(source.includes("error.message"), false);
  assert.equal(source.includes("error.digest"), false);
});
