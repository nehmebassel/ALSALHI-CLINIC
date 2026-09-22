import assert from "node:assert/strict";
import test from "node:test";

import { followUpDeltaCompletionIssues, sanitizeFollowUpDelta } from "../lib/follow-up/delta";

test("follow-up delta autosave keeps partial detail rows instead of deleting them", () => {
  const delta = sanitizeFollowUpDelta({
    hairTreatments: {
      started: [{ id: "T1", name: "Minoxidil", stillUsing: "YES" }],
      affectedExisting: [],
    },
    hairProcedures: {
      items: [{ id: "PRP", procedure: "PRP", count: "" }],
    },
  });

  assert.equal(delta.hairTreatments?.started.length, 1);
  assert.equal(delta.hairTreatments?.started[0].name, "Minoxidil");
  assert.equal(delta.hairProcedures?.items.length, 1);
  assert.equal(delta.hairProcedures?.items[0].procedure, "PRP");
});

test("follow-up changed domain requires its details before review can complete", () => {
  const issues = followUpDeltaCompletionIssues(
    { hairProcedures: "YES" },
    { hairProcedures: { items: [{ id: "PRP", procedure: "PRP", count: "2" }] } },
    "RV_HAIR_LOSS",
  );
  assert.equal(issues.includes("hairProcedures"), true);
});

test("hair/scalp follow-up current state is five independent 0-5 measurements", () => {
  const incomplete = followUpDeltaCompletionIssues(
    {},
    { currentMetrics: { SHEDDING: 2, DENSITY: 3, ITCH: 0, BURNING: 0 } },
    "RV_HAIR_LOSS",
  );
  assert.equal(incomplete.includes("metric:SCALP_PAIN"), true);

  const complete = followUpDeltaCompletionIssues(
    {},
    { currentMetrics: { SHEDDING: 2, DENSITY: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 1 } },
    "RV_HAIR_LOSS",
  );
  assert.equal(complete.some((issue) => issue.startsWith("metric:")), false);
});

test("medication follow-up supports simultaneous started and stopped changes and requires details for both", () => {
  const incomplete = followUpDeltaCompletionIssues(
    { medicationsSupplements: ["STARTED", "STOPPED"] },
    {
      medicationsSupplements: {
        startedMedications: [{ id: "M1", name: "Synthetic medication" }],
        startedSupplements: [],
        affectedExisting: [],
      },
    },
    "RV_HAIR_LOSS",
  );
  assert.equal(incomplete.includes("medicationsSupplements"), true);

  const complete = followUpDeltaCompletionIssues(
    { medicationsSupplements: ["STARTED", "STOPPED"] },
    {
      medicationsSupplements: {
        startedMedications: [{ id: "M1", name: "Synthetic medication" }],
        startedSupplements: [],
        affectedExisting: [{
          sourceResponseId: "R1", sourceQuestionCode: "Q_HEALTH_MEDICATION_ITEMS", sourceScopeKey: "MED:1",
          sourceItemIndex: 1, itemLabel: "Prior medicine", action: "STOPPED", date: "2026-08",
        }],
      },
    },
    "RV_HAIR_LOSS",
  );
  assert.equal(complete.includes("medicationsSupplements"), false);
});

test("delta sanitizer preserves repeatable source indexes and prior-procedure provenance", () => {
  const delta = sanitizeFollowUpDelta({
    medicationsSupplements: {
      startedMedications: [], startedSupplements: [],
      affectedExisting: [
        { sourceResponseId: "R1", sourceQuestionCode: "Q_HEALTH_MEDICATION_ITEMS", sourceScopeKey: "MED", sourceItemIndex: 0, itemLabel: "A", action: "STOPPED", date: "2026-08" },
        { sourceResponseId: "R1", sourceQuestionCode: "Q_HEALTH_MEDICATION_ITEMS", sourceScopeKey: "MED", sourceItemIndex: 1, itemLabel: "B", action: "USAGE_CHANGED", details: "Changed" },
      ],
    },
    hairProcedures: {
      items: [{
        id: "P1", procedure: "PRP", count: "2", lastDate: "2026-08",
        sourceResponseId: "RP1", sourceQuestionCode: "Q_HAIR_PROCEDURE_DETAILS", sourceScopeKey: "PROC:PRP", sourceItemIndex: 0,
      }],
    },
  });

  assert.deepEqual(delta.medicationsSupplements?.affectedExisting.map((item) => item.sourceItemIndex), [0, 1]);
  assert.equal(delta.hairProcedures?.items[0].sourceResponseId, "RP1");
  assert.equal(delta.hairProcedures?.items[0].sourceQuestionCode, "Q_HAIR_PROCEDURE_DETAILS");
  assert.equal(delta.hairProcedures?.items[0].sourceItemIndex, 0);
});

test("Women's Health follow-up exposes current irregular-cycle details but not historical onset/evaluation fields", async () => {
  const { visibleFollowUpSexSpecificContracts } = await import("../lib/follow-up/sex-specific");
  const visible = visibleFollowUpSexSpecificContracts({
    sex: "FEMALE",
    affectedCodes: ["IRREGULAR_CYCLES"],
    responses: {},
    physicianRoutedQuestionCodes: ["Q_WOMEN_IRREGULAR_ONSET", "Q_WOMEN_GYN_EVALUATED"],
  }).map((contract) => contract.code);

  assert.equal(visible.includes("Q_WOMEN_IRREGULAR_INTERVAL"), true);
  assert.equal(visible.includes("Q_WOMEN_IRREGULAR_DURATION"), true);
  assert.equal(visible.includes("Q_WOMEN_PREMENSTRUAL_SYMPTOMS"), true);
  assert.equal(visible.includes("Q_WOMEN_IRREGULAR_ONSET"), false);
  assert.equal(visible.includes("Q_WOMEN_GYN_EVALUATED"), false);
});

test("trigger-event delta rejects non-governed codes and requires an event description for OTHER", () => {
  const sanitized = sanitizeFollowUpDelta({
    triggerEvents: {
      items: [
        { id: "T1", event: "SEVERE_STRESS", date: "2026-08" },
        { id: "T2", event: "FORGED_EVENT", date: "2026-08" },
        { id: "T3", event: "OTHER", date: "2026-08", details: "Synthetic governed other event detail" },
      ],
    },
  });
  assert.deepEqual(sanitized.triggerEvents?.items.map((item) => item.event), ["SEVERE_STRESS", "OTHER"]);

  const incomplete = followUpDeltaCompletionIssues(
    { triggerEvents: "YES" },
    { triggerEvents: { items: [{ id: "T4", event: "OTHER", date: "2026-08" }] } },
    "RV_HAIR_LOSS",
  );
  assert.equal(incomplete.includes("triggerEvents"), true);
});


test("new hair treatment that was also stopped requires a stop date", () => {
  const incomplete = followUpDeltaCompletionIssues(
    { hairTreatments: ["STARTED"] },
    { hairTreatments: { started: [{ id: "T1", name: "Synthetic treatment", start: "2026-01", stillUsing: "NO" }], affectedExisting: [] } },
    "RV_HAIR_LOSS",
  );
  assert.equal(incomplete.includes("hairTreatments"), true);

  const complete = followUpDeltaCompletionIssues(
    { hairTreatments: ["STARTED"] },
    { hairTreatments: { started: [{ id: "T1", name: "Synthetic treatment", start: "2026-01", stillUsing: "NO", stop: "2026-07" }], affectedExisting: [] } },
    "RV_HAIR_LOSS",
  );
  assert.equal(complete.includes("hairTreatments"), false);
});

test("new procedure count must be a positive whole number", () => {
  for (const count of ["", "0", "-1", "1.5"]) {
    const issues = followUpDeltaCompletionIssues(
      { hairProcedures: "YES" },
      { hairProcedures: { items: [{ id: "P1", procedure: "PRP", count, lastDate: "2026-08" }] } },
      "RV_HAIR_LOSS",
    );
    assert.equal(issues.includes("hairProcedures"), true, `expected ${count || "blank"} to be invalid`);
  }

  const valid = followUpDeltaCompletionIssues(
    { hairProcedures: "YES" },
    { hairProcedures: { items: [{ id: "P1", procedure: "PRP", count: "2", lastDate: "2026-08" }] } },
    "RV_HAIR_LOSS",
  );
  assert.equal(valid.includes("hairProcedures"), false);
});
