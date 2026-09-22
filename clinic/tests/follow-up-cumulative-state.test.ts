import assert from "node:assert/strict";
import test from "node:test";

import { projectCumulativeFollowUpSnapshot } from "../lib/follow-up/cumulative-state";
import type { FollowUpDeltaHistoryEntry, FollowUpSnapshotEntry } from "../lib/follow-up/types";
import { buildPhysicianCumulativeFollowUpSections } from "../lib/physician/follow-up-presentation";

const baseline: FollowUpSnapshotEntry[] = [
  {
    questionCode: "Q_HEALTH_MEDICATION_ITEMS", labelAr: "دواء", labelEn: "Medication",
    value: [{ name: "Baseline medicine" }], responseScopeType: "VISIT", responseScopeKey: "MEDS",
    sourceResponseId: "R-MEDS", sourceVisitId: "V0", sourceVisitAt: "2026-01-01T08:00:00.000Z",
  },
  {
    questionCode: "Q_HAIR_TREATMENT_ITEMS", labelAr: "علاج", labelEn: "Treatment",
    value: [{ name: "Baseline treatment" }], responseScopeType: "PATHWAY", responseScopeKey: "HAIR",
    sourceResponseId: "R-HAIR", sourceVisitId: "V0", sourceEpisodeId: "EP1", sourceVisitAt: "2026-01-01T08:00:00.000Z",
  },
  {
    questionCode: "Q_HAIR_PROCEDURE_DETAILS", labelAr: "إجراء", labelEn: "Procedure",
    value: [{ procedure: "PRP", count: "1" }], responseScopeType: "PROCEDURE_SELECTION", responseScopeKey: "PROC",
    sourceResponseId: "R-PROC", sourceVisitId: "V0", sourceEpisodeId: "EP1", sourceVisitAt: "2026-01-01T08:00:00.000Z",
  },
];

const history: FollowUpDeltaHistoryEntry[] = [
  {
    contextId: "D1", visitId: "V1", episodeId: "EP1", sourceVisitId: "V0",
    visitAt: "2026-02-01T08:00:00.000Z", intent: "EXISTING_CONCERN",
    delta: {
      generalHealth: { chronicConditions: [{ id: "C1", name: "New condition" }], tumors: [], allergies: [], surgeriesHospitalizations: [] },
      medicationsSupplements: {
        startedMedications: [{ id: "M1", name: "Follow-up medicine" }],
        startedSupplements: [{ id: "S1", name: "Follow-up supplement" }], affectedExisting: [],
      },
      hairTreatments: { started: [{ id: "T1", name: "Follow-up treatment", stillUsing: "YES" }], affectedExisting: [] },
      hairProcedures: { items: [{ id: "P1", procedure: "PRP", count: "2", sourceResponseId: "R-PROC", sourceScopeKey: "PROC", sourceItemIndex: 0 }] },
      triggerEvents: { items: [{ id: "E1", event: "SEVERE_STRESS" }] },
      sexSpecific: { affectedCodes: ["Q_WOMENS_HEALTH"], responses: { Q_WOMENS_HEALTH: ["IRREGULAR_CYCLES"] } },
      hairQualityLifestyle: { changeText: "Changed routine" },
      safety: { responses: { Q_PREGNANCY_BREASTFEEDING_STATUS: "NO" } },
      currentMetrics: { SHEDDING: 3, DENSITY: 2, ITCH: 1, BURNING: 0, SCALP_PAIN: 0 },
    },
  },
  {
    contextId: "D2", visitId: "V2", episodeId: "EP1", sourceVisitId: "V1",
    visitAt: "2026-03-01T08:00:00.000Z", intent: "EXISTING_CONCERN",
    delta: {
      medicationsSupplements: {
        startedMedications: [], startedSupplements: [],
        affectedExisting: [
          { sourceResponseId: "R-MEDS", sourceQuestionCode: "Q_HEALTH_MEDICATION_ITEMS", sourceScopeKey: "MEDS", sourceItemIndex: 0, itemLabel: "Baseline medicine", action: "STOPPED" },
          { sourceResponseId: "D1", sourceQuestionCode: "Q_HEALTH_MEDICATION_ITEMS", sourceScopeKey: "FOLLOW_UP:D1:medications:started:M1", itemLabel: "Follow-up medicine", action: "USAGE_CHANGED" },
        ],
      },
      hairTreatments: {
        started: [],
        affectedExisting: [{ sourceResponseId: "D1", sourceQuestionCode: "Q_HAIR_TREATMENT_ITEMS", sourceScopeKey: "FOLLOW_UP:D1:hair-treatments:started:T1", itemLabel: "Follow-up treatment", action: "STOPPED" }],
      },
      hairProcedures: { items: [{ id: "P2", procedure: "PRP", count: "1", sourceResponseId: "D1", sourceScopeKey: "FOLLOW_UP:D1:hair-procedures:P1" }] },
      triggerEvents: { items: [{ id: "E2", event: "ILLNESS_HIGH_FEVER" }] },
      currentMetrics: { SHEDDING: 2, DENSITY: 2, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
    },
  },
];

test("Initial → Follow-up 1 → Follow-up 2 produces a cumulative server baseline without mutating visit deltas", () => {
  const before = structuredClone(history);
  const effective = projectCumulativeFollowUpSnapshot(baseline, history);
  assert.deepEqual(history, before);

  const labels = effective.map((entry) => JSON.stringify(entry.value));
  assert.equal(labels.some((value) => value.includes("Baseline medicine")), false);
  assert.equal(labels.some((value) => value.includes("Follow-up medicine")), true);
  assert.equal(labels.some((value) => value.includes("Follow-up supplement")), true);
  assert.equal(labels.some((value) => value.includes("Follow-up treatment")), false);

  const changedMedicine = effective.find((entry) => JSON.stringify(entry.value).includes("Follow-up medicine"));
  assert.equal(changedMedicine?.sourceVisitId, "V2");
  assert.equal(changedMedicine?.sourceType, "FOLLOW_UP_DELTA");
  assert.equal(changedMedicine?.sourceDeltaId, "D2");

  const procedure = effective.find((entry) => entry.questionCode === "Q_HAIR_PROCEDURE_DETAILS");
  assert.deepEqual(procedure?.value, {
    id: "P2", procedure: "PRP", count: "4", sourceResponseId: "D1",
    sourceScopeKey: "FOLLOW_UP:D1:hair-procedures:P1",
  });
  assert.equal(procedure?.sourceVisitId, "V2");
});

test("physician cumulative follow-up projection retains every visit delta with provenance across domains", () => {
  const sections = buildPhysicianCumulativeFollowUpSections(history.map((record) => ({
    visitId: record.visitId, visitAt: record.visitAt, delta: record.delta,
  })));
  const facts = sections.flatMap((section) => section.facts);
  assert.equal(facts.some((fact) => fact.sourceVisitId === "V1"), true);
  assert.equal(facts.some((fact) => fact.sourceVisitId === "V2"), true);
  assert.equal(new Set(facts.map((fact) => fact.id)).size, facts.length);
  for (const code of ["GENERAL_HEALTH", "MEDICATIONS", "HAIR_TREATMENTS", "PROCEDURES", "TRIGGERS", "SEX_SAFETY", "HAIR_QUALITY", "CURRENT_METRICS"]) {
    assert.equal(sections.some((section) => section.code === code), true, code);
  }
});
