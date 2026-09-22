import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildPhysicianCaseSummary } from "../lib/physician/case-summary";
import { resolvePhysicianHairWorkflow } from "../lib/physician/capabilities";
import { derivePatientHairHistory, effectiveReviewedHairHistoryItems } from "../lib/physician/hair-history";
import { buildPreFinalizeReview, presentAnatomicalRegionLabel } from "../lib/physician/visit-workspace";
import type { PhysicianHairHistory, PhysicianHairHistoryItem, PhysicianInterviewQuestion, PhysicianVisitSummary } from "../lib/physician/types";
import {
  physicianClinicalWorkspaceKind,
  physicianWorkspaceSectionProfile,
  shouldOfferCurrentPhysicianWorkspace,
} from "../lib/physician/workspace-flow";

function question(input: Partial<PhysicianInterviewQuestion> & Pick<PhysicianInterviewQuestion, "code" | "value">): PhysicianInterviewQuestion {
  return {
    id: input.id ?? `question-${input.code}`,
    responseId: input.responseId ?? "00000000-0000-4000-8000-000000000001",
    code: input.code,
    text: input.text ?? { ar: input.code, en: input.code },
    library: { ar: "الشعر", en: "Hair" },
    group: { ar: "التاريخ", en: "History" },
    responseType: input.responseType ?? "TEXT",
    responseScopeType: input.responseScopeType ?? "MODULE",
    responseScopeKey: input.responseScopeKey ?? "HAIR_LOSS",
    currentSource: input.currentSource ?? "PATIENT",
    value: input.value,
    repeatableItems: input.repeatableItems ?? [],
    options: input.options ?? [],
    editableByPhysician: true,
  };
}

function visit(input: Partial<PhysicianVisitSummary> = {}): PhysicianVisitSummary {
  return {
    id: input.id ?? "visit-current",
    createdAt: input.createdAt ?? "2026-09-03T09:00:00.000Z",
    visitType: input.visitType ?? "INITIAL",
    visitStatus: input.visitStatus ?? "CREATED",
    interviewId: input.interviewId ?? "interview-current",
    interviewStatus: input.interviewStatus ?? "UNDER_REVIEW",
    patientReviewState: input.patientReviewState ?? "PENDING",
    physicianRecordStatus: input.physicianRecordStatus,
    primaryCode: input.primaryCode ?? "RV_HAIR_LOSS",
    primary: input.primary ?? { ar: "تساقط الشعر", en: "Hair Loss" },
    additionalCodes: input.additionalCodes ?? [],
    additional: input.additional ?? [],
    episodeId: input.episodeId ?? "episode-current",
    hasFollowUpDelta: input.hasFollowUpDelta ?? false,
    ...(input.visitOccurredAt ? { visitOccurredAt: input.visitOccurredAt } : {}),
  };
}

function historyItem(input: { source: "PATIENT" | "PHYSICIAN"; value: number; date: string }): PhysicianHairHistoryItem {
  return {
    id: `history-${input.source.toLowerCase()}`,
    layer: "MEASURES",
    itemType: "PATIENT_MEASURE",
    label: { ar: "التساقط", en: "Shedding" },
    value: { metricCode: "SHEDDING", value: input.value },
    date: input.date,
    datePrecision: "MONTH",
    source: input.source,
    included: true,
    editable: true,
    sourceQuestionCode: "Q_HAIR_SHEDDING_SEVERITY",
    sourceScopeKey: "HAIR_LOSS",
    sourceResponseId: "00000000-0000-4000-8000-000000000001",
  };
}

test("PR-FUNC-02 patient severity is plotted at symptom onset while submission remains provenance", () => {
  const submittedAt = "2026-09-03T12:30:00.000Z";
  const history = derivePatientHairHistory([
    question({
      code: "Q_HAIR_SHEDDING_ONSET",
      value: { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2024, month: 1, normalizedGregorian: { year: 2024, month: 1 } },
    }),
    question({ code: "Q_HAIR_SHEDDING_SEVERITY", value: 3 }),
  ], "visit-initial", submittedAt);

  const measure = history.items.find((item) => item.itemType === "PATIENT_MEASURE");
  assert.ok(measure);
  assert.equal(measure.date, "2024-01-15T00:00:00.000Z");
  assert.equal(measure.datePrecision, "MONTH");
  assert.deepEqual(measure.value, { metricCode: "SHEDDING", value: 3 });
  assert.equal(history.sourceVisitAt, submittedAt);
  assert.notEqual(measure.date, history.sourceVisitAt);
});

test("PR-FUNC-02 scalp severity uses its own onset and unknown onset never falls back to submission time", () => {
  const submittedAt = "2026-09-03T12:30:00.000Z";
  const history = derivePatientHairHistory([
    question({
      code: "Q_SCALP_SYMPTOM_DETAILS",
      responseScopeKey: "HAIR_SCALP_SYMPTOM:ITCH",
      value: {
        severity: 4,
        onset: { calendar: "GREGORIAN", precision: "YEAR", year: 2023, normalizedGregorian: { year: 2023 } },
      },
    }),
    question({ code: "Q_HAIR_DENSITY_SEVERITY", value: 2 }),
  ], "visit-initial", submittedAt);

  const itch = history.items.find((item) => item.itemType === "PATIENT_MEASURE" && (item.value as { metricCode?: string }).metricCode === "ITCH");
  const density = history.items.find((item) => item.itemType === "PATIENT_MEASURE" && (item.value as { metricCode?: string }).metricCode === "DENSITY");
  assert.equal(itch?.date, "2023-07-01T00:00:00.000Z");
  assert.equal(itch?.datePrecision, "YEAR");
  assert.equal(density?.date, undefined);
  assert.equal(density?.datePrecision, "UNKNOWN");
});

test("PR-UX-04 reviewed history exposes one effective physician-corrected value without erasing the patient original", () => {
  const original = historyItem({ source: "PATIENT", value: 4, date: "2026-03-15T00:00:00.000Z" });
  const corrected = historyItem({ source: "PHYSICIAN", value: 2, date: "2026-01-15T00:00:00.000Z" });
  const persistedAuditSequence = [original, corrected];

  const effective = effectiveReviewedHairHistoryItems(persistedAuditSequence);
  assert.equal(persistedAuditSequence.length, 2, "both persisted provenance values remain available to audit");
  assert.equal(effective.length, 1, "only one value is active in the clinical presentation");
  assert.equal(effective[0], corrected);
  assert.equal(effective[0].source, "PHYSICIAN");
  assert.equal(effective[0].date, "2026-01-15T00:00:00.000Z");
});

test("PR-FUNC-03 summary keeps reviewed patient onset severity separate from current physician assessment", () => {
  const corrected = historyItem({ source: "PHYSICIAN", value: 2, date: "2024-01-15T00:00:00.000Z" });
  const hairHistory: PhysicianHairHistory = {
    status: "APPROVED_READ_ONLY",
    sourceVisitId: "visit-initial",
    sourceVisitAt: "2026-09-03T12:30:00.000Z",
    clinicalReferenceAt: "2026-09-03T12:30:00.000Z",
    baseRevision: 2,
    items: [corrected],
  };
  const summary = buildPhysicianCaseSummary({
    questions: [],
    reviewVisit: visit(),
    measurementSeries: [{
      code: "SHEDDING",
      label: { ar: "التساقط", en: "Shedding" },
      points: [{ visitId: "visit-finalized", date: "2026-09-03T10:00:00.000Z", value: 5 }],
    }],
    historyApproved: true,
    hairHistoryApplicable: true,
    physicianJourneyApplicable: true,
    patientHairHistory: hairHistory,
  });

  assert.deepEqual(summary.patientReportedMeasures[0], {
    code: "SHEDDING",
    label: { ar: "التساقط", en: "Shedding" },
    value: 2,
    date: "2024-01-15T00:00:00.000Z",
    source: "PATIENT",
    modifiedByPhysician: true,
  });
  assert.equal(summary.physicianMeasures[0].value, 5);
  assert.equal(summary.physicianMeasures[0].date, "2026-09-03T10:00:00.000Z");
});

test("PR-FUNC-01 service composition resolves the appropriate physician workspace", () => {
  assert.equal(physicianClinicalWorkspaceKind({ primaryReasonCode: "RV_HAIR_LOSS" }), "HAIR");
  assert.equal(physicianClinicalWorkspaceKind({ primaryReasonCode: "RV_HAIR_LOSS", hasScalpContent: true }), "HAIR_SCALP");
  assert.equal(physicianClinicalWorkspaceKind({ primaryReasonCode: "RV_HAIR_LOSS", additionalReasonCodes: ["RV_SCALP_SYMPTOMS"] }), "HAIR_SCALP");
  assert.equal(physicianClinicalWorkspaceKind({ primaryReasonCode: "RV_SCALP_SYMPTOMS" }), "HAIR_SCALP");
  assert.equal(physicianClinicalWorkspaceKind({ primaryReasonCode: "RV_HAIR_QUALITY" }), "HAIR_QUALITY");
  assert.equal(physicianClinicalWorkspaceKind({ primaryReasonCode: "RV_DERMATOLOGY" }), "DERMATOLOGY");
  assert.equal(physicianClinicalWorkspaceKind({ primaryReasonCode: "RV_LASER" }), "LASER");
  assert.equal(physicianClinicalWorkspaceKind({ primaryReasonCode: "RV_AESTHETIC_PROCEDURES" }), "AESTHETIC");
});

test("PR-FUNC-01 and PR-STATUS-08 expose a current workspace only at a clinically valid transition", () => {
  assert.equal(shouldOfferCurrentPhysicianWorkspace({ visit: visit(), hairHistoryAvailable: true, hasApprovedHairHistory: false }), false);
  assert.equal(shouldOfferCurrentPhysicianWorkspace({ visit: visit({ patientReviewState: "HAIR_HISTORY_APPROVED" }), hairHistoryAvailable: true, hasApprovedHairHistory: true }), true);
  assert.equal(shouldOfferCurrentPhysicianWorkspace({ visit: visit({ primaryCode: "RV_DERMATOLOGY" }), hairHistoryAvailable: false, hasApprovedHairHistory: false }), true);
  assert.equal(shouldOfferCurrentPhysicianWorkspace({ visit: visit({ visitType: "FOLLOW_UP" }), hairHistoryAvailable: true, hasApprovedHairHistory: true }), true);
  assert.equal(shouldOfferCurrentPhysicianWorkspace({ visit: visit({ physicianRecordStatus: "FINALIZED" }), hairHistoryAvailable: true, hasApprovedHairHistory: true }), false);
});

test("PR-UX-07 Hair Journey stays hidden until relevant finalized data and then becomes available read-only", () => {
  const beforeFinalize = resolvePhysicianHairWorkflow({
    visitType: "INITIAL",
    hairHistoryAvailable: true,
    physicianHairJourneyAvailable: true,
    physicianHairJourneyHasFinalizedData: false,
    hairHistoryStatus: "APPROVED_READ_ONLY",
    hasApprovedRevision: true,
  });
  const afterFinalize = resolvePhysicianHairWorkflow({
    visitType: "INITIAL",
    hairHistoryAvailable: true,
    physicianHairJourneyAvailable: true,
    physicianHairJourneyHasFinalizedData: true,
    hairHistoryStatus: "APPROVED_READ_ONLY",
    hasApprovedRevision: true,
  });
  assert.equal(beforeFinalize.physicianHairJourneyActive, false);
  assert.equal(afterFinalize.physicianHairJourneyActive, true);

  const workspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  const journey = fs.readFileSync(new URL("../app/physician/components/physician-hair-journey.tsx", import.meta.url), "utf8");
  assert.equal(workspace.includes("hidden: !currentServiceHasHairJourney || !hairWorkflow.physicianHairJourneyActive"), true);
  assert.equal(workspace.includes('activeTab === "JOURNEY" && currentServiceHasHairJourney && hairWorkflow.physicianHairJourneyActive'), true);
  assert.equal(journey.includes("fetch("), false);
  assert.equal(journey.includes("method:"), false);
});

test("PR-FUNC-05 current clinical work is primary while Visits remains the historical archive", () => {
  const workspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  const visitWorkspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  assert.equal(workspace.includes("currentClinicalWorkspaceVisit ?"), true);
  assert.equal(workspace.includes("<PhysicianVisitWorkspace"), true);
  assert.equal(workspace.includes("autoPrepare"), true);
  assert.equal(workspace.includes('setClinicalWorkspaceVisitId(data.reviewVisit.id)'), true);
  assert.equal(workspace.includes('activeTab === "VISITS"'), true);
  assert.equal(workspace.includes("Open Finalized Visit"), true);
  assert.equal(visitWorkspace.includes("/prepare"), true);
  assert.equal(visitWorkspace.includes("loaded.visit.status === \"CREATED\""), true);
});

test("PR-UX-06 physician surfaces use clinical copy and do not expose implementation guidance", () => {
  const workspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  const journey = fs.readFileSync(new URL("../app/physician/components/physician-hair-journey.tsx", import.meta.url), "utf8");
  const visitWorkspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  const physicianUi = `${workspace}\n${journey}\n${visitWorkspace}`;
  for (const forbidden of [
    "source of truth",
    "does not replace the physician journey",
    "derived from physician data recorded and finalized",
    "materialized only at Finalize",
    "server-authoritative",
    "Editing belongs in the Visit Workspace",
    "Derived from finalized Visits",
  ]) assert.equal(physicianUi.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
});


test("Post-FPV physician decisions live in Today's Visit while longitudinal state is read-only", () => {
  const visitWorkspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  assert.equal(visitWorkspace.includes('useState<WorkspacePanel>("TODAY")'), true);
  assert.equal(visitWorkspace.includes('mode="EDITOR"'), true);
  assert.equal(visitWorkspace.includes('mode="READ_ONLY"'), true);
  assert.equal(visitWorkspace.includes("Add diagnosis"), true);
  assert.equal(visitWorkspace.includes("Add treatment"), true);
  assert.equal(visitWorkspace.includes("Add procedure"), true);
  assert.equal(visitWorkspace.includes("No prior finalized physician history"), true);
  assert.equal(visitWorkspace.includes("Unchanged active treatment remains active without a mandatory continue decision."), false);
});

test("Post-FPV Anatomical Map uses the Owner-provided scalp templates instead of generic ellipse placeholders", () => {
  const visitWorkspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  for (const asset of ["front.png", "top.png", "right.png", "left.png"]) {
    assert.equal(fs.existsSync(new URL(`../public/scalp-map/${asset}`, import.meta.url)), true, asset);
  }
  assert.equal(visitWorkspace.includes("ANATOMICAL_MAP_ASSETS"), true);
  assert.equal(visitWorkspace.includes("<ellipse cx=\"300\" cy=\"150\""), false);
  assert.equal(visitWorkspace.includes("Draw directly over the scalp"), true);
});

test("Post-FPV Patient Context removes implementation/reconciliation jargon from physician copy", () => {
  const visitWorkspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  assert.equal(visitWorkspace.includes("Patient-reported reference"), false);
  assert.equal(visitWorkspace.includes("Not reviewed yet"), false);
  assert.equal(visitWorkspace.includes("presentPatientContextValue(item.value, locale)"), true);
  assert.equal(visitWorkspace.includes('["CURRENT_MEDICATIONS", "CURRENT_HAIR_THERAPIES"].includes(item.code)'), true);
  assert.equal(visitWorkspace.includes("does not turn it into Diagnosis"), false);
  assert.equal(visitWorkspace.includes("Record reconciliation evidence"), false);
  assert.equal(visitWorkspace.includes("This item version is reconciled"), false);
});


test("Post-FPV service workspaces do not leak Hair Loss/Scalp tools into Hair Quality or other services", () => {
  assert.deepEqual(physicianWorkspaceSectionProfile("HAIR"), { hairScalpAssessment: true, hairProcedureDecisions: true, genericDecisions: true });
  assert.deepEqual(physicianWorkspaceSectionProfile("HAIR_SCALP"), { hairScalpAssessment: true, hairProcedureDecisions: true, genericDecisions: true });
  for (const kind of ["HAIR_QUALITY", "DERMATOLOGY", "LASER", "AESTHETIC", "GENERAL"] as const) {
    assert.equal(physicianWorkspaceSectionProfile(kind).hairScalpAssessment, false, kind);
    assert.equal(physicianWorkspaceSectionProfile(kind).hairProcedureDecisions, false, kind);
  }

  const patientWorkspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  const visitWorkspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  assert.equal(patientWorkspace.includes("workspaceKind={currentWorkspaceKind}"), true);
  assert.equal(visitWorkspace.includes("profile.hairScalpAssessment ?"), true);
  // Generic physician-authored procedures are available without leaking the
  // hair-specific catalogue into other service workspaces.
  assert.equal(visitWorkspace.includes("workspaceProfile.genericDecisions &&"), true);
  assert.equal(visitWorkspace.includes('workspaceProfile.hairProcedureDecisions ? PHYSICIAN_PROCEDURE_CODES : ["OTHER"] as const'), true);
});

test("Post-FPV anatomical drawings are separate named regions in review instead of an anonymous count", () => {
  const topVertex = {
    view: "TOP" as const,
    anatomicalRegionCode: "VERTEX_CROWN" as const,
    geometry: { version: 1, strokes: [{ radius: 0.012, points: [{ x: 0.5, y: 0.82 }, { x: 0.55, y: 0.84 }] }] },
  };
  const rightTemporal = {
    view: "RIGHT_SIDE" as const,
    anatomicalRegionCode: "RIGHT_TEMPORAL" as const,
    geometry: { version: 1, strokes: [{ radius: 0.012, points: [{ x: 0.82, y: 0.45 }, { x: 0.8, y: 0.48 }] }] },
    noteText: "نقص كثافة",
  };
  assert.equal(presentAnatomicalRegionLabel(topVertex, "ar"), "التاج");
  assert.equal(presentAnatomicalRegionLabel(rightTemporal, "ar"), "الصدغ الأيمن");

  const review = buildPreFinalizeReview({ ANATOMICAL_MAP: { regions: [topVertex, rightTemporal] } }, { diagnoses: [], treatmentCourses: [], procedurePlans: [] }, "ar");
  const map = review.find((group) => group.key === "ANATOMICAL_MAP");
  assert.deepEqual(map?.items, ["التاج", "الصدغ الأيمن — نقص كثافة"]);

  const visitWorkspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  assert.equal(visitWorkspace.includes("regions: [...regions, nextRegion]"), true);
  assert.equal(visitWorkspace.includes("Draw directly over the scalp, then confirm the anatomical identity of each region."), true);
  assert.equal(visitWorkspace.includes("mapRegionSummary"), true);
});
