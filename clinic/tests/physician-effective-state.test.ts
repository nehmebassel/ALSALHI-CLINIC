import assert from "node:assert/strict";
import test from "node:test";

import {
  LongitudinalReplayError,
  projectEffectivePhysicianState,
  type ChronologicalDecisionVisit,
} from "../lib/physician/visit-longitudinal-projection";

const at = (day: number) => new Date(Date.UTC(2026, 8, day, 10));
const visit = (
  visitId: string,
  day: number,
  overrides: Partial<ChronologicalDecisionVisit> = {},
): ChronologicalDecisionVisit => ({
  visitId,
  physicianVisitRecordId: `${visitId}-record`,
  visitOccurredAt: at(day),
  diagnoses: [],
  treatments: [],
  procedures: [],
  ...overrides,
});

test("FPV-4 projection carries unchanged state and replays Diagnosis/Treatment chronology", () => {
  const d1 = "00000000-0000-4000-8000-000000000011";
  const t1 = "00000000-0000-4000-8000-000000000012";
  const visits: ChronologicalDecisionVisit[] = [
    visit("b", 2, {
      treatments: [{
        id: "t-modify", treatmentCourseId: t1, action: "MODIFY", name: null,
        regimenText: "twice daily", noteText: null, setsName: false,
        setsRegimen: true, setsNote: false, decisionOrder: 0,
      }],
    }),
    visit("a", 1, {
      diagnoses: [{ id: "d-add", diagnosisId: d1, action: "ADD", text: "D1", decisionOrder: 0 }],
      treatments: [{
        id: "t-start", treatmentCourseId: t1, action: "START", name: "T1",
        regimenText: "daily", noteText: null, setsName: true,
        setsRegimen: true, setsNote: false, decisionOrder: 0,
      }],
    }),
    visit("c", 3, {
      diagnoses: [{ id: "d-resolve", diagnosisId: d1, action: "RESOLVE", text: null, decisionOrder: 0 }],
      treatments: [{
        id: "t-stop", treatmentCourseId: t1, action: "STOP", name: null,
        regimenText: null, noteText: null, setsName: false,
        setsRegimen: false, setsNote: false, decisionOrder: 0,
      }],
    }),
  ];
  const state = projectEffectivePhysicianState(visits);
  assert.deepEqual(state.diagnoses.map(({ text, status }) => ({ text, status })), [{ text: "D1", status: "RESOLVED" }]);
  assert.deepEqual(state.treatmentCourses.map(({ name, regimenText, status }) => ({ name, regimenText, status })), [{ name: "T1", regimenText: "twice daily", status: "STOPPED" }]);
});

test("FPV-4 projection orders late Finalize by visitOccurredAt and stable Visit.id", () => {
  const id = "00000000-0000-4000-8000-000000000013";
  const state = projectEffectivePhysicianState([
    visit("z-later-finalized-first", 2, {
      diagnoses: [{ id: "revise", diagnosisId: id, action: "REVISE", text: "revised", decisionOrder: 0 }],
    }),
    visit("a-late-finalize", 1, {
      diagnoses: [{ id: "add", diagnosisId: id, action: "ADD", text: "original", decisionOrder: 0 }],
    }),
  ]);
  assert.equal(state.diagnoses[0]?.text, "revised");
});

test("FPV-4 procedure projection separates open, fulfilled, and performed events", () => {
  const planId = "00000000-0000-4000-8000-000000000014";
  const state = projectEffectivePhysicianState([
    visit("a", 1, { procedures: [{
      id: "plan", procedurePlanId: planId, action: "PLAN", procedureCode: "PRP",
      otherProcedureText: null, plannedDate: at(5), performedDate: null,
      noteText: null, decisionOrder: 0,
    }] }),
    visit("b", 2, { procedures: [{
      id: "perform", procedurePlanId: planId, action: "PERFORM", procedureCode: "PRP",
      otherProcedureText: null, plannedDate: null, performedDate: at(2),
      noteText: null, decisionOrder: 0,
    }] }),
  ]);
  assert.equal(state.procedurePlans[0]?.status, "FULFILLED");
  assert.equal(state.performedProcedures.length, 1);
});

test("FPV-4 replay rejects dependent decisions when their origin is absent", () => {
  assert.throws(
    () => projectEffectivePhysicianState([
      visit("b", 2, { diagnoses: [{
        id: "bad", diagnosisId: "00000000-0000-4000-8000-000000000015",
        action: "RESOLVE", text: null, decisionOrder: 0,
      }] }),
    ]),
    (error: unknown) =>
      error instanceof LongitudinalReplayError &&
      error.code === "INVALID_LONGITUDINAL_TARGET",
  );
});
