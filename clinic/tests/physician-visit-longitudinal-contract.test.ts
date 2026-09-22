import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDiagnosisSection,
  parseLongitudinalCorrectionCommand,
  parsePatientContextReconciliationCommand,
  parsePatientContextReviewCommand,
  parseTreatmentProceduresSection,
  PhysicianLongitudinalContractError,
  PHYSICIAN_PROCEDURE_CODES,
} from "../lib/physician/visit-longitudinal-contracts";
import { patientContextRegistry } from "../lib/patient-context/service";

function rejects(operation: () => unknown) {
  assert.throws(
    operation,
    (error: unknown) => error instanceof PhysicianLongitudinalContractError,
  );
}

test("FPV-4 Diagnosis contract preserves exact free text and stable target IDs", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(
    parseDiagnosisSection({
      decisions: [
        { action: "ADD", text: "  exact diagnosis\n" },
        { action: "REVISE", diagnosisId: id, text: "revised" },
        { action: "RESOLVE", diagnosisId: id },
      ],
    }),
    [
      { action: "ADD", text: "  exact diagnosis\n" },
      { action: "REVISE", diagnosisId: id, text: "revised" },
      { action: "RESOLVE", diagnosisId: id },
    ],
  );
  rejects(() => parseDiagnosisSection({ decisions: [{ action: "ADD", text: " \t" }] }));
  rejects(() => parseDiagnosisSection({ decisions: [{ action: "ADD", text: "x", severity: 2 }] }));
  rejects(() => parseDiagnosisSection({ decisions: [{ action: "REVISE", diagnosisId: "client-id", text: "x" }] }));
});

test("FPV-4 Treatment and Procedure contracts are strict and catalogue-bound", () => {
  const id = "00000000-0000-4000-8000-000000000002";
  const parsed = parseTreatmentProceduresSection({
    treatments: [
      { action: "START", name: "Minoxidil", regimenText: "once daily" },
      { action: "CONTINUE_EXISTING", treatmentCourseId: id },
      { action: "MODIFY", treatmentCourseId: id, regimenText: null },
      { action: "STOP", treatmentCourseId: id },
    ],
    procedures: [
      { action: "PLAN", procedureCode: "PRP", plannedDate: "2027-01-01" },
      { action: "PERFORM", procedureCode: "PRP", performedDate: "2026-09-02" },
      { action: "PERFORM", procedurePlanId: id, performedDate: "2026-09-02" },
      { action: "CANCEL_OR_DEFER", procedurePlanId: id },
      { action: "PLAN", procedureCode: "OTHER", otherProcedureText: "  exact other  " },
    ],
  });
  assert.equal(parsed.treatments.length, 4);
  assert.equal(parsed.procedures.length, 5);
  assert.deepEqual(PHYSICIAN_PROCEDURE_CODES, [
    "PRP", "MICRONEEDLING", "HAIR_LASER", "RED_LIGHT", "MINOXIDIL_INJ",
    "DUTASTERIDE_INJ", "EXOSOME", "CORTISONE_INJ", "REGENERA", "ACELL",
    "HAIR_TRANSPLANT", "OTHER",
  ]);
  rejects(() => parseTreatmentProceduresSection({ treatments: [{ action: "MODIFY", treatmentCourseId: id }] }));
  rejects(() => parseTreatmentProceduresSection({ procedures: [{ action: "PLAN", procedureCode: "UNKNOWN" }] }));
  rejects(() => parseTreatmentProceduresSection({ procedures: [{ action: "PLAN", procedureCode: "OTHER" }] }));
  rejects(() => parseTreatmentProceduresSection({ procedures: [{ action: "PERFORM", procedureCode: "PRP", performedDate: "2026-02-30" }] }));
});

test("FPV-4 correction contract separates content correction from whole-decision omission", () => {
  const decisionId = "00000000-0000-4000-8000-000000000003";
  assert.deepEqual(
    parseLongitudinalCorrectionCommand({
      target: "DIAGNOSIS_DECISION",
      decisionId,
      operation: "SET_CONTENT",
      value: { text: " corrected " },
    }),
    {
      target: "DIAGNOSIS_DECISION",
      decisionId,
      operation: "SET_CONTENT",
      value: { text: " corrected " },
    },
  );
  assert.deepEqual(
    parseLongitudinalCorrectionCommand({
      target: "TREATMENT_DECISION",
      decisionId,
      operation: "OMIT",
      replacement: { action: "START", name: "replacement" },
    }).operation,
    "OMIT",
  );
  rejects(() => parseLongitudinalCorrectionCommand({
    target: "DIAGNOSIS_DECISION",
    decisionId,
    operation: "SET_CONTENT",
    value: { action: "RESOLVE", text: "x" },
  }));
});

test("FPV-4 Patient Context registry is exactly the eight Owner-approved definitions", () => {
  assert.deepEqual(
    patientContextRegistry().map(({ code }) => code),
    [
      "MARITAL_SOCIAL_STATUS",
      "CONTRACEPTIVE_USE",
      "PREGNANCY_BREASTFEEDING_CONTEXT",
      "PREVIOUSLY_DIAGNOSED_CONDITIONS",
      "CURRENT_MEDICATIONS",
      "ALLERGIES",
      "PREVIOUS_HAIR_THERAPIES",
      "CURRENT_HAIR_THERAPIES",
    ],
  );
  const fingerprint = "a".repeat(64);
  assert.deepEqual(parsePatientContextReviewCommand({ contextFingerprint: fingerprint }), { contextFingerprint: fingerprint });
  assert.equal(
    parsePatientContextReconciliationCommand({
      contextFingerprint: fingerprint,
      contextItemId: "00000000-0000-4000-8000-000000000004",
    }).contextItemId,
    "00000000-0000-4000-8000-000000000004",
  );
  rejects(() => parsePatientContextReconciliationCommand({
    contextFingerprint: fingerprint,
    contextItemId: "00000000-0000-4000-8000-000000000004",
    noteText: "not part of the reconciliation contract",
  }));
});
