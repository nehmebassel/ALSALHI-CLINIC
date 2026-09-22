import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveMcuFvDisplayCode,
  HAIR_PARTING_FINDINGS,
  HAIR_PULL_RESULTS,
  MCU_FV_BASIC_VALUES,
  MCU_FV_FRONTAL_VALUES,
  MCU_FV_VERTEX_VALUES,
  parseClinicalExamination,
  parseMcuFvClassification,
  parsePatternAssessment,
  parsePhysicianClinicalCorrectionRequestBody,
  parsePhysicianMeasurements,
  PHYSICIAN_MEASUREMENT_CODES,
  PhysicianVisitClinicalContractError,
} from "../lib/physician/visit-clinical-contracts";
import { PhysicianVisitDraftError } from "../lib/physician/visit-contracts";
import { validatePhysicianVisitDraftEnvelope } from "../lib/physician/visit-service";

function rejectsClinical(operation: () => unknown): void {
  assert.throws(
    operation,
    (error: unknown) => error instanceof PhysicianVisitClinicalContractError,
  );
}

test("FPV-3 Hair Pull preserves omitted, NOT_RECORDED, NEGATIVE, and POSITIVE", () => {
  assert.deepEqual(parseClinicalExamination({}), {});
  for (const hairPull of HAIR_PULL_RESULTS) {
    assert.deepEqual(parseClinicalExamination({ hairPull }), { hairPull });
  }
  assert.notDeepEqual(
    parseClinicalExamination({ hairPull: "NOT_RECORDED" }),
    parseClinicalExamination({ hairPull: "NEGATIVE" }),
  );
  for (const invalid of [true, false, "UNKNOWN", 1, null, []]) {
    rejectsClinical(() => parseClinicalExamination({ hairPull: invalid }));
  }
});

test("FPV-3 Hair Parting accepts governed selections and normalizes deterministically", () => {
  for (const finding of HAIR_PARTING_FINDINGS) {
    assert.deepEqual(parseClinicalExamination({ hairParting: [finding] }), {
      hairParting: [finding],
    });
  }
  assert.deepEqual(parseClinicalExamination({ hairParting: [] }), {
    hairParting: [],
  });
  assert.deepEqual(
    parseClinicalExamination({
      hairParting: ["VERTEX_THINNER", "UNIVERSAL", "CROWN_THINNER"],
    }),
    {
      hairParting: ["UNIVERSAL", "CROWN_THINNER", "VERTEX_THINNER"],
    },
  );
  rejectsClinical(() =>
    parseClinicalExamination({ hairParting: ["UNIVERSAL", "UNIVERSAL"] }),
  );
  rejectsClinical(() => parseClinicalExamination({ hairParting: ["NORMAL"] }));
  rejectsClinical(() => parseClinicalExamination({ hairParting: "UNIVERSAL" }));
});

test("FPV-3 all five physician measurements accept integer 0 through 5 only", () => {
  for (const code of PHYSICIAN_MEASUREMENT_CODES) {
    for (const value of [0, 1, 2, 3, 4, 5]) {
      assert.deepEqual(parsePhysicianMeasurements({ [code]: value }), {
        [code]: value,
      });
    }
    for (const invalid of [-1, 6, 1.5, "3", Number.NaN, Infinity, -Infinity, null]) {
      rejectsClinical(() => parsePhysicianMeasurements({ [code]: invalid }));
    }
  }
  assert.deepEqual(parsePhysicianMeasurements({}), {});
  rejectsClinical(() => parsePhysicianMeasurements({ DENSITY: 3 }));
  rejectsClinical(() => parsePhysicianMeasurements({ UNKNOWN: 3 }));
});

test("FPV-3 Sinclair accepts optional integer 1 through 5 only", () => {
  assert.deepEqual(parsePatternAssessment({}), {});
  for (const sinclair of [1, 2, 3, 4, 5]) {
    assert.deepEqual(parsePatternAssessment({ sinclair }), { sinclair });
  }
  for (const invalid of [0, 6, 2.5, "2", Number.NaN, Infinity, null]) {
    rejectsClinical(() => parsePatternAssessment({ sinclair: invalid }));
  }
});

test("FPV-3 MCU/FV accepts every Basic and derives Basic + F + V in fixed order", () => {
  for (const basic of MCU_FV_BASIC_VALUES) {
    assert.deepEqual(parseMcuFvClassification({ basic }), { basic });
    assert.equal(deriveMcuFvDisplayCode({ basic }), basic);
  }
  for (const frontal of MCU_FV_FRONTAL_VALUES) {
    assert.deepEqual(parseMcuFvClassification({ basic: "M2", frontal }), {
      basic: "M2",
      frontal,
    });
  }
  for (const vertex of MCU_FV_VERTEX_VALUES) {
    assert.deepEqual(parseMcuFvClassification({ basic: "M2", vertex }), {
      basic: "M2",
      vertex,
    });
  }
  assert.equal(
    deriveMcuFvDisplayCode({ basic: "M2", frontal: "F2", vertex: "V1" }),
    "M2F2V1",
  );
  assert.equal(deriveMcuFvDisplayCode({ basic: "M2", vertex: "V1" }), "M2V1");
});

test("FPV-3 MCU/FV rejects free text, ratios, arrays, unknowns, and client display codes", () => {
  for (const invalid of [
    "M2F2V1",
    1.5,
    { basic: "M4" },
    { basic: "M2", frontal: "F4" },
    { basic: "M2", vertex: "V4" },
    { basic: ["M1", "M2"] },
    { basic: "M2", frontal: ["F1", "F2"] },
    { basic: "M2", vertex: ["V1", "V2"] },
    { basic: "M2", displayCode: "M2" },
  ]) {
    rejectsClinical(() => parseMcuFvClassification(invalid));
  }
});

test("FPV-3 Hair Line accepts independent finite non-negative cm numbers", () => {
  for (const [field, value] of [
    ["midline", 0],
    ["rightSide", 7],
    ["leftSide", 7.125],
    ["midline", 1_000_000.0001],
  ] as const) {
    assert.deepEqual(
      parsePatternAssessment({ hairLineDistanceCm: { [field]: value } }),
      { hairLineDistanceCm: { [field]: value } },
    );
  }
  assert.deepEqual(parsePatternAssessment({ hairLineDistanceCm: {} }), {
    hairLineDistanceCm: {},
  });
  for (const invalid of [-0.1, "7.2", Number.NaN, Infinity, -Infinity, null]) {
    rejectsClinical(() =>
      parsePatternAssessment({ hairLineDistanceCm: { midline: invalid } }),
    );
  }
  rejectsClinical(() =>
    parsePatternAssessment({ hairLineDistanceCm: { unit: "mm", midline: 7 } }),
  );
});

test("FPV-3 governed Draft schemas reject unknown and provenance-like fields recursively", () => {
  for (const sections of [
    { EXAMINATION: { metadata: {} } },
    { EXAMINATION: { hairPull: "POSITIVE", extra: true } },
    { PATTERN: { mcuFv: { basic: "M2", extra: true } } },
    { PATTERN: { hairLineDistanceCm: { midline: 7, extra: true } } },
    { MEASUREMENTS: { SHEDDING: 3, UNKNOWN: 2 } },
  ]) {
    assert.throws(
      () =>
        validatePhysicianVisitDraftEnvelope({
          schemaVersion: "FPV_DRAFT_V1",
          sections,
        }),
      (error: unknown) =>
        error instanceof PhysicianVisitDraftError &&
        error.code === "INVALID_DRAFT_DATA",
    );
  }
  for (const forbidden of [
    { patientResponseId: "x" },
    { questionInstanceId: "x" },
    { patientHairHistoryId: "x" },
    { nested: { sourcePatientHairHistoryIdentifier: "x" } },
  ]) {
    assert.throws(
      () =>
        validatePhysicianVisitDraftEnvelope({
          schemaVersion: "FPV_DRAFT_V1",
          sections: { EXAMINATION: forbidden },
        }),
      (error: unknown) =>
        error instanceof PhysicianVisitDraftError &&
        error.code === "PATIENT_PROVENANCE_BOUNDARY_VIOLATION",
    );
  }
});

test("FPV-3 correction contract is a closed typed SET/OMIT union", () => {
  assert.deepEqual(
    parsePhysicianClinicalCorrectionRequestBody({
      target: "PHYSICIAN_MEASUREMENT",
      metric: "SHEDDING",
      operation: "SET",
      value: 2,
    }),
    {
      target: "PHYSICIAN_MEASUREMENT",
      metric: "SHEDDING",
      operation: "SET",
      value: 2,
    },
  );
  assert.deepEqual(
    parsePhysicianClinicalCorrectionRequestBody({
      target: "MCU_FV",
      operation: "OMIT",
    }),
    { target: "MCU_FV", operation: "OMIT" },
  );
  assert.deepEqual(
    parsePhysicianClinicalCorrectionRequestBody({
      target: "HAIR_LINE_DISTANCE",
      position: "RIGHT_SIDE",
      operation: "SET",
      value: 7.25,
    }),
    {
      target: "HAIR_LINE_DISTANCE",
      position: "RIGHT_SIDE",
      operation: "SET",
      value: 7.25,
    },
  );
  for (const invalid of [
    { target: "UNKNOWN", operation: "SET", value: 1 },
    { target: "PHYSICIAN_MEASUREMENT", metric: "DENSITY", operation: "SET", value: 2 },
    { target: "SINCLAIR", operation: "OMIT", value: null },
    { target: "HAIR_PULL", operation: "SET", value: false },
    { target: "MCU_FV", operation: "SET", value: "M2F1" },
    { target: "HAIR_LINE_DISTANCE", position: "CENTER", operation: "SET", value: 7 },
    { target: "HAIR_LINE_DISTANCE", position: "MIDLINE", operation: "SET", value: "7" },
    { path: "/pattern/sinclair", operation: "replace", value: 2 },
  ]) {
    rejectsClinical(() => parsePhysicianClinicalCorrectionRequestBody(invalid));
  }
});
