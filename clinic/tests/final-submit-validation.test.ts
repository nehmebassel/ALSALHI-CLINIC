import assert from "node:assert/strict";
import test from "node:test";

import {
  FinalSubmitValidationError,
  validateFinalSubmitVisitInput,
  type FinalSubmitReferenceData,
  type FinalSubmitVisitInput,
} from "../lib/patient-access/service";

const referenceData: FinalSubmitReferenceData = {
  validReasonCodes: new Set([
    "RV_HAIR_LOSS",
    "RV_SCALP_SYMPTOMS",
    "RV_HAIR_QUALITY",
    "RV_DERMATOLOGY",
    "RV_LASER",
    "RV_AESTHETIC_PROCEDURES",
  ]),

  validAestheticProcedureCodes: new Set([
    "AP_BOTOX",
    "AP_FILLER",
    "AP_SKIN_BOOSTER",
    "AP_COLLAGEN_STIMULATORS",
    "AP_FAT_DISSOLVING",
    "AP_SWEATING_INJECTION",
    "AP_BODY_CONTOURING",
    "AP_OTHER",
  ]),

  validLaserServiceCodes: new Set([
    "LASER_UNWANTED_HAIR",
    "LASER_PIGMENTATION",
    "LASER_MELASMA",
    "LASER_REDNESS_VESSELS",
    "LASER_ACNE_SCARS",
    "LASER_OTHER_SCARS",
    "LASER_RESURFACING",
    "LASER_TATTOO_PMU",
    "LASER_OTHER",
    "LASER_UNSURE",
  ]),
};

function validInput(
  overrides: Partial<FinalSubmitVisitInput> = {},
): FinalSubmitVisitInput {
  return {
    primaryReasonForVisitCodes: ["RV_HAIR_LOSS"],
    additionalRequestCodes: [],
    selectedProcedureCodes: [],
    selectedLaserServiceCodes: [],
    ...overrides,
  };
}

async function expectValidationError(
  input: FinalSubmitVisitInput,
  code: FinalSubmitValidationError["code"],
) {
  await assert.rejects(
    async () => {
      validateFinalSubmitVisitInput(
        input,
        referenceData,
      );
    },
    (error: unknown) =>
      error instanceof FinalSubmitValidationError &&
      error.code === code,
  );
}

// -----------------------------------------------------------------------------
// Valid combinations
// -----------------------------------------------------------------------------

test("accepts Hair Loss as a primary reason", () => {
  assert.doesNotThrow(() => {
    validateFinalSubmitVisitInput(
      validInput(),
      referenceData,
    );
  });
});

test("TEST-VIS-011 rejects Hair Loss and Scalp as co-primary reasons", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_HAIR_LOSS",
        "RV_SCALP_SYMPTOMS",
      ],
    }),
    "MULTIPLE_PRIMARY_REASONS",
  );
});

test("TEST-VIS-012 rejects Laser and Aesthetic as co-primary reasons", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_LASER",
        "RV_AESTHETIC_PROCEDURES",
      ],
      selectedProcedureCodes: ["AP_BOTOX"],
      selectedLaserServiceCodes: ["LASER_UNWANTED_HAIR"],
    }),
    "MULTIPLE_PRIMARY_REASONS",
  );
});

test("accepts Hair Loss with additional Laser request", () => {
  assert.doesNotThrow(() => {
    validateFinalSubmitVisitInput(
      validInput({
        additionalRequestCodes: [
          "RV_LASER",
        ],

        selectedLaserServiceCodes: [
          "LASER_UNWANTED_HAIR",
        ],
      }),
      referenceData,
    );
  });
});

test("accepts Hair Loss with additional Aesthetic request", () => {
  assert.doesNotThrow(() => {
    validateFinalSubmitVisitInput(
      validInput({
        additionalRequestCodes: [
          "RV_AESTHETIC_PROCEDURES",
        ],

        selectedProcedureCodes: [
          "AP_BOTOX",
        ],
      }),
      referenceData,
    );
  });
});

// -----------------------------------------------------------------------------
// Hair Quality exclusivity
// -----------------------------------------------------------------------------

test("TEST-VIS-013 rejects Hair Quality and Hair Loss as co-primary reasons", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_HAIR_QUALITY",
        "RV_HAIR_LOSS",
      ],
    }),
    "MULTIPLE_PRIMARY_REASONS",
  );
});

test("TEST-VIS-014 rejects Hair Quality and Scalp as co-primary reasons", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_HAIR_QUALITY",
        "RV_SCALP_SYMPTOMS",
      ],
    }),
    "MULTIPLE_PRIMARY_REASONS",
  );
});

// -----------------------------------------------------------------------------
// OTHER notes
// -----------------------------------------------------------------------------

test("rejects AP_OTHER without notes", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_AESTHETIC_PROCEDURES",
      ],

      selectedProcedureCodes: [
        "AP_OTHER",
      ],
    }),
    "AP_OTHER_NOTES_REQUIRED",
  );
});

test("accepts AP_OTHER with notes", () => {
  assert.doesNotThrow(() => {
    validateFinalSubmitVisitInput(
      validInput({
        primaryReasonForVisitCodes: [
          "RV_AESTHETIC_PROCEDURES",
        ],

        selectedProcedureCodes: [
          "AP_OTHER",
        ],

        aestheticOtherNotes:
          "إجراء تجميلي آخر",
      }),
      referenceData,
    );
  });
});

test("rejects LASER_OTHER without notes", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_LASER",
      ],

      selectedLaserServiceCodes: [
        "LASER_OTHER",
      ],
    }),
    "LASER_OTHER_NOTES_REQUIRED",
  );
});

test("accepts LASER_OTHER with notes", () => {
  assert.doesNotThrow(() => {
    validateFinalSubmitVisitInput(
      validInput({
        primaryReasonForVisitCodes: [
          "RV_LASER",
        ],

        selectedLaserServiceCodes: [
          "LASER_OTHER",
        ],

        laserOtherNotes:
          "خدمة ليزر أخرى",
      }),
      referenceData,
    );
  });
});

// -----------------------------------------------------------------------------
// ContentVersion / catalogue protection
// -----------------------------------------------------------------------------

test("rejects an aesthetic procedure not present in the pinned ContentVersion", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_AESTHETIC_PROCEDURES",
      ],

      selectedProcedureCodes: [
        "AP_FROM_FUTURE_VERSION",
      ],
    }),
    "UNKNOWN_AESTHETIC_PROCEDURE",
  );
});

test("rejects a laser service not present in the pinned ContentVersion", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_LASER",
      ],

      selectedLaserServiceCodes: [
        "LASER_FROM_FUTURE_VERSION",
      ],
    }),
    "UNKNOWN_LASER_SERVICE",
  );
});

test("rejects a reason not present in the pinned ContentVersion", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_UNKNOWN",
      ],
    }),
    "UNKNOWN_REASON",
  );
});

// -----------------------------------------------------------------------------
// Duplicate payload selections
// -----------------------------------------------------------------------------

test("rejects duplicate primary reasons", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_HAIR_LOSS",
        "RV_HAIR_LOSS",
      ],
    }),
    "DUPLICATE_REASON",
  );
});

test("rejects the same reason as both PRIMARY and ADDITIONAL", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_LASER",
      ],

      additionalRequestCodes: [
        "RV_LASER",
      ],
    }),
    "DUPLICATE_REASON",
  );
});

test("rejects duplicate aesthetic procedures", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_AESTHETIC_PROCEDURES",
      ],

      selectedProcedureCodes: [
        "AP_BOTOX",
        "AP_BOTOX",
      ],
    }),
    "DUPLICATE_AESTHETIC_PROCEDURE",
  );
});

test("rejects duplicate laser services", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [
        "RV_LASER",
      ],

      selectedLaserServiceCodes: [
        "LASER_UNWANTED_HAIR",
        "LASER_UNWANTED_HAIR",
      ],
    }),
    "DUPLICATE_LASER_SERVICE",
  );
});

// -----------------------------------------------------------------------------
// Reason / selection consistency
// -----------------------------------------------------------------------------

test("rejects aesthetic selection without Aesthetic reason", async () => {
  await expectValidationError(
    validInput({
      selectedProcedureCodes: [
        "AP_BOTOX",
      ],
    }),
    "AESTHETIC_SELECTION_WITHOUT_REASON",
  );
});

test("rejects laser selection without Laser reason", async () => {
  await expectValidationError(
    validInput({
      selectedLaserServiceCodes: [
        "LASER_UNWANTED_HAIR",
      ],
    }),
    "LASER_SELECTION_WITHOUT_REASON",
  );
});

test("rejects an unsupported additional request category", async () => {
  await expectValidationError(
    validInput({
      additionalRequestCodes: [
        "RV_DERMATOLOGY",
      ],
    }),
    "INVALID_ADDITIONAL_REQUEST",
  );
});

// -----------------------------------------------------------------------------
// Minimum payload validity
// -----------------------------------------------------------------------------

test("rejects submission without a primary reason", async () => {
  await expectValidationError(
    validInput({
      primaryReasonForVisitCodes: [],
    }),
    "NO_PRIMARY_REASON",
  );
});

// -----------------------------------------------------------------------------
// Complete Pilot 0 combination matrix
// -----------------------------------------------------------------------------

for (const primary of [
  "RV_HAIR_LOSS",
  "RV_SCALP_SYMPTOMS",
  "RV_HAIR_QUALITY",
  "RV_DERMATOLOGY",
] as const) {
  test(`${primary} accepts Laser and Aesthetic together as ADDITIONAL`, () => {
    assert.doesNotThrow(() => {
      validateFinalSubmitVisitInput(
        validInput({
          primaryReasonForVisitCodes: [primary],
          additionalRequestCodes: ["RV_LASER", "RV_AESTHETIC_PROCEDURES"],
          selectedLaserServiceCodes: ["LASER_UNWANTED_HAIR"],
          selectedProcedureCodes: ["AP_BOTOX"],
        }),
        referenceData,
      );
    });
  });
}

test("Laser PRIMARY accepts Aesthetic as the only ADDITIONAL service", () => {
  assert.doesNotThrow(() => {
    validateFinalSubmitVisitInput(
      validInput({
        primaryReasonForVisitCodes: ["RV_LASER"],
        additionalRequestCodes: ["RV_AESTHETIC_PROCEDURES"],
        selectedLaserServiceCodes: ["LASER_MELASMA"],
        selectedProcedureCodes: ["AP_FILLER"],
      }),
      referenceData,
    );
  });
});

test("Aesthetic PRIMARY accepts Laser as the only ADDITIONAL service", () => {
  assert.doesNotThrow(() => {
    validateFinalSubmitVisitInput(
      validInput({
        primaryReasonForVisitCodes: ["RV_AESTHETIC_PROCEDURES"],
        additionalRequestCodes: ["RV_LASER"],
        selectedProcedureCodes: ["AP_SKIN_BOOSTER"],
        selectedLaserServiceCodes: ["LASER_PIGMENTATION"],
      }),
      referenceData,
    );
  });
});
