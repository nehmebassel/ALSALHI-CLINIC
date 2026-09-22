import assert from "node:assert/strict";
import test from "node:test";

import {
  RegistryPublicationError,
  validateQuestionRegistryPublication,
  type QuestionContract,
} from "../lib/content-registry/contracts";

function syntheticQuestion(
  overrides: Partial<QuestionContract> = {},
): QuestionContract {
  return {
    code: "Q_SYNTHETIC_FOUNDATION_ONLY",
    version: "1",
    libraryCode: "FOUNDATION_TEST",
    responseType: "BOOLEAN",
    localized: {
      ar: { label: "سؤال اصطناعي للاختبار" },
      en: { label: "Synthetic foundation test question" },
    },
    scope: "VISIT",
    visibility: { op: "ALWAYS" },
    requiredness: { op: "ALWAYS" },
    order: 10,
    validation: [],
    output: [],
    provenance: {
      baseline: "v1.7.2",
      sourceFile: "FOUNDATION_TEST_ONLY",
      sourceSection: "TEST",
    },
    status: "APPROVED",
    ...overrides,
  };
}

test("B2-AC-001 accepts a complete synthetic Question Contract", () => {
  assert.doesNotThrow(() =>
    validateQuestionRegistryPublication([syntheticQuestion()]),
  );
});

test("B2-AC-001 blocks publication when visibility or requiredness is missing", () => {
  const question = syntheticQuestion({
    visibility: undefined,
    requiredness: null,
  });

  assert.throws(
    () => validateQuestionRegistryPublication([question]),
    (error: unknown) =>
      error instanceof RegistryPublicationError &&
      error.issues.some(({ field }) => field === "visibility") &&
      error.issues.some(({ field }) => field === "requiredness"),
  );
});

test("B2-AC-001 rejects duplicate codes and incomplete option translations", () => {
  const selectQuestion = syntheticQuestion({
    responseType: "SINGLE_SELECT",
    options: [
      {
        code: "YES",
        labelAr: "نعم",
        labelEn: "Yes",
      },
      {
        code: "YES",
        labelAr: "",
        labelEn: "Duplicate",
      },
    ],
  });

  assert.throws(
    () =>
      validateQuestionRegistryPublication([
        selectQuestion,
        syntheticQuestion(),
      ]),
    RegistryPublicationError,
  );
});
