import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTrichoscopyFindingCodes,
  parseGovernedPhysicianVisitDraft,
  parsePhysicianClinicalCorrectionRequestBody,
  parsePhysicianTrichoscopy,
  PHYSICIAN_TRICHOSCOPY_FINDING_CODES,
  PHYSICIAN_TRICHOSCOPY_FINDINGS,
  PhysicianVisitClinicalContractError,
  TRICHOSCOPY_OTHER_FINDING_TEXT_MAX_LENGTH,
} from "../lib/physician/visit-clinical-contracts";
import { PhysicianVisitDraftError } from "../lib/physician/visit-contracts";
import { validatePhysicianVisitDraftEnvelope } from "../lib/physician/visit-service";

const EXPECTED_CATALOGUE = [
  ["VELLUS_HAIRS", "Vellus hairs"],
  ["CORKSCREW_HAIRS", "Corkscrew hairs"],
  ["ANISOTRICHOSIS", "Anisotrichosis"],
  ["EXCLAMATION_TAPERING_HAIRS", "Exclamation (tapering) hairs"],
  ["SINGLE_HAIR_FOLLICULAR_UNITS", "Single-hair follicular units"],
  ["COUDABILITY_HAIRS", "Coudability hairs"],
  ["YELLOW_DOTS", "Yellow dots"],
  ["PIGTAIL_CIRCLE_HAIRS", "Pigtail (circle) hairs"],
  ["FOLLICULAR_PLUGS", "Follicular plugs"],
  ["UPRIGHT_REGROWING_HAIRS", "Upright regrowing hairs"],
  ["PUSTULES", "Pustules"],
  ["PERIFOLLICULAR_SCALE", "Perifollicular scale"],
  ["BLACK_DOTS", "Black dots"],
  ["PERIFOLLICULAR_ERYTHEMA", "Perifollicular erythema"],
  ["RED_DOTS", "Red dots"],
  ["INTERFOLLICULAR_SCALES", "Interfollicular scales"],
  ["FOLLICULAR_DROPOUT", "Follicular dropout"],
  ["DYSPIGMENTATION", "Dyspigmentation"],
  ["PERIPILAR_SIGN", "Peripilar sign"],
  ["ARBORIZING_DILATED_BLOOD_VESSELS", "Arborizing dilated blood vessels"],
  ["BROKEN_HAIRS", "Broken hairs"],
  ["GLOMERULAR_BLOOD_VESSELS", "Glomerular blood vessels"],
  ["V_SIGN", "V-sign"],
  ["SERPIGINOUS_BLOOD_VESSELS", "Serpiginous blood vessels"],
  ["HOOK_HAIRS", "Hook hairs"],
  ["PILI_TORTI", "Pili torti"],
  ["COILED_HAIRS", "Coiled hairs"],
  ["WIGGLY_SQUIGGLY_HAIR", "Wiggly Squiggly hair"],
  ["FLAME_HAIRS", "Flame hairs"],
  ["TRICHOPTILOSIS", "Trichoptilosis"],
  ["TULIP_HAIRS", "Tulip hairs"],
  ["POLYTRICHIA", "Polytrichia"],
  ["COMMA_HAIRS", "Comma hairs"],
  ["MILKY_WHITE_STRUCTURELESS_AREAS", "Milky-white structureless areas"],
  ["ZIGZAG_HAIRS", "Zigzag hairs"],
] as const;

function rejectsClinical(operation: () => unknown): void {
  assert.throws(
    operation,
    (error: unknown) => error instanceof PhysicianVisitClinicalContractError,
  );
}

test("FPV-3.5A catalogue contains the exact 35 approved code/label pairs in order", () => {
  assert.equal(PHYSICIAN_TRICHOSCOPY_FINDINGS.length, 35);
  assert.deepEqual(
    PHYSICIAN_TRICHOSCOPY_FINDINGS.map(({ code, label }) => [code, label]),
    EXPECTED_CATALOGUE,
  );
  assert.deepEqual(
    PHYSICIAN_TRICHOSCOPY_FINDING_CODES,
    EXPECTED_CATALOGUE.map(([code]) => code),
  );
});

test("FPV-3.5A selected findings reject unknowns and duplicates and normalize to catalogue order", () => {
  assert.deepEqual(normalizeTrichoscopyFindingCodes([]), []);
  assert.deepEqual(
    normalizeTrichoscopyFindingCodes([
      "ZIGZAG_HAIRS",
      "VELLUS_HAIRS",
      "WIGGLY_SQUIGGLY_HAIR",
    ]),
    ["VELLUS_HAIRS", "WIGGLY_SQUIGGLY_HAIR", "ZIGZAG_HAIRS"],
  );
  rejectsClinical(() => normalizeTrichoscopyFindingCodes(["VELLUS_HAIRS", "VELLUS_HAIRS"]));
  rejectsClinical(() => normalizeTrichoscopyFindingCodes(["UNKNOWN"]));
  rejectsClinical(() => normalizeTrichoscopyFindingCodes("VELLUS_HAIRS"));
});

test("FPV-3.5A free text is optional, bounded, nonblank, and preserved exactly", () => {
  assert.deepEqual(parsePhysicianTrichoscopy({}), {});
  assert.deepEqual(parsePhysicianTrichoscopy({ selectedFindingCodes: [] }), {
    selectedFindingCodes: [],
  });
  const exact = "  perifollicular finding\nsecond line  ";
  assert.deepEqual(parsePhysicianTrichoscopy({ otherFindingText: exact }), {
    otherFindingText: exact,
  });
  assert.equal(
    parsePhysicianTrichoscopy({
      otherFindingText: "x".repeat(TRICHOSCOPY_OTHER_FINDING_TEXT_MAX_LENGTH),
    }).otherFindingText?.length,
    TRICHOSCOPY_OTHER_FINDING_TEXT_MAX_LENGTH,
  );
  for (const invalid of [
    "",
    " \n\t ",
    "x".repeat(TRICHOSCOPY_OTHER_FINDING_TEXT_MAX_LENGTH + 1),
    null,
    3,
  ]) {
    rejectsClinical(() => parsePhysicianTrichoscopy({ otherFindingText: invalid }));
  }
  rejectsClinical(() => parsePhysicianTrichoscopy({ findingCodes: [] }));
  rejectsClinical(() => parsePhysicianTrichoscopy({ selectedFindingCodes: [], extra: true }));
});

test("FPV-3.5A Draft validation governs TRICHOSCOPY without permitting provenance", () => {
  const validated = validatePhysicianVisitDraftEnvelope({
      schemaVersion: "FPV_DRAFT_V1",
      sections: {
        TRICHOSCOPY: {
          selectedFindingCodes: ["BLACK_DOTS", "VELLUS_HAIRS"],
          otherFindingText: " exact ",
        },
      },
    });
  assert.deepEqual(
    parseGovernedPhysicianVisitDraft(validated.sections).trichoscopy,
    {
      selectedFindingCodes: ["VELLUS_HAIRS", "BLACK_DOTS"],
      otherFindingText: " exact ",
    },
  );
  assert.throws(
    () =>
      validatePhysicianVisitDraftEnvelope({
        schemaVersion: "FPV_DRAFT_V1",
        sections: { TRICHOSCOPY: { patientResponseId: "forbidden" } },
      }),
    (error: unknown) =>
      error instanceof PhysicianVisitDraftError &&
      error.code === "PATIENT_PROVENANCE_BOUNDARY_VIOLATION",
  );
});

test("FPV-3.5A correction contract exposes only explicit SET/OMIT targets", () => {
  assert.deepEqual(
    parsePhysicianClinicalCorrectionRequestBody({
      target: "TRICHOSCOPY_SELECTED_FINDINGS",
      operation: "SET",
      value: ["ZIGZAG_HAIRS", "VELLUS_HAIRS"],
    }),
    {
      target: "TRICHOSCOPY_SELECTED_FINDINGS",
      operation: "SET",
      value: ["VELLUS_HAIRS", "ZIGZAG_HAIRS"],
    },
  );
  assert.deepEqual(
    parsePhysicianClinicalCorrectionRequestBody({
      target: "TRICHOSCOPY_OTHER_FINDING_TEXT",
      operation: "OMIT",
    }),
    { target: "TRICHOSCOPY_OTHER_FINDING_TEXT", operation: "OMIT" },
  );
  rejectsClinical(() =>
    parsePhysicianClinicalCorrectionRequestBody({
      target: "TRICHOSCOPY_SELECTED_FINDINGS",
      operation: "SET",
      value: ["OTHER"],
    }),
  );
  rejectsClinical(() =>
    parsePhysicianClinicalCorrectionRequestBody({
      target: "TRICHOSCOPY_OTHER_FINDING_TEXT",
      operation: "SET",
      value: "   ",
    }),
  );
  rejectsClinical(() =>
    parsePhysicianClinicalCorrectionRequestBody({
      target: "TRICHOSCOPY_OTHER_FINDING_TEXT",
      operation: "OMIT",
      value: null,
    }),
  );
});
