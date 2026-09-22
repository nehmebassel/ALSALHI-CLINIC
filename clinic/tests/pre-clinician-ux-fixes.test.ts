import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { evaluateP01Draft, getP01ProfileAndVisit } from "../lib/p01/engine";
import type { PatientInputJson } from "../lib/patient-access/service";
import { longitudinalActionLabel } from "../lib/physician/visit-workspace";

function routingDraft(sex: "MALE" | "FEMALE", primary?: string): PatientInputJson {
  return {
    locale: "en",
    answers: {
      Q_PRIVACY_CONSENT: "YES",
      Q_PROFILE_FULL_NAME: "Synthetic routing patient",
      Q_PROFILE_DOB: "1992-02-02",
      Q_PROFILE_SEX: sex,
      Q_PROFILE_MARITAL_STATUS: "NOT_MARRIED",
      ...(primary ? { Q_VISIT_PRIMARY_REASON: primary } : {}),
    },
  };
}

test("female patients can select Hair Quality while male patients cannot see it", () => {
  const female = evaluateP01Draft(routingDraft("FEMALE"));
  const male = evaluateP01Draft(routingDraft("MALE"));
  const options = (evaluation: typeof female) => evaluation.questions.find((question) => question.code === "Q_VISIT_PRIMARY_REASON")?.options.map((option) => option.code) ?? [];
  assert.ok(options(female).includes("RV_HAIR_QUALITY"));
  assert.ok(!options(male).includes("RV_HAIR_QUALITY"));
});

test("a forged male Hair Quality draft cannot activate or materialize the pathway", () => {
  const draft = routingDraft("MALE", "RV_HAIR_QUALITY");
  const evaluation = evaluateP01Draft(draft);
  assert.equal(evaluation.activeModules.hairQuality, false);
  assert.equal(evaluation.activeQuestionCodes.some((code) => code.startsWith("Q_HQ_")), false);
  assert.ok(evaluation.issues.some((issue) => issue.questionCode === "Q_VISIT_PRIMARY_REASON" && issue.code === "INVALID_COMBINATION"));
  assert.throws(() => getP01ProfileAndVisit(draft), /P01_DRAFT_NOT_READY/);
});

test("Hair Quality help, image containment, and selected-state presentation are explicit", () => {
  const patient = readFileSync(new URL("../app/patient/patient-journey.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/patient/patient-journey.module.css", import.meta.url), "utf8");
  assert.ok(patient.includes('question.code === "Q_HQ_HAIR_STATE"'));
  assert.ok(patient.includes("helpOpen &&"));
  assert.ok(patient.includes('aria-expanded={helpOpen}'));
  assert.ok(css.includes("object-fit:contain"));
  assert.ok(css.includes('.hair-pattern-card.selected)::after'));
  assert.ok(css.includes('.option-shell.selected) > :global(.option-card)'));
  assert.ok(css.includes(':global(button.selected)'));
});

test("physician entry starts with Clinical Story and decisions use collapsed add/edit cards", () => {
  const record = readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  const visit = readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  assert.ok(record.includes('data.reviewVisit?.physicianRecordStatus === "FINALIZED" ? hairWorkflow.defaultTab : "STORY"'));
  assert.ok(record.includes('useState<string | null>(null)'));
  assert.ok(record.includes("After reviewing the patient's answers"));
  for (const label of ["Add diagnosis", "Add treatment", "Add procedure", "Save diagnosis", "Save treatment", "Save procedure", "Edit", "Remove"]) assert.ok(visit.includes(label), label);
  for (const removed of ["Another diagnosis", "Another Treatment decision", "Another Procedure decision", "Record item review", "Not reviewed yet", "Patient-reported reference"]) assert.ok(!visit.includes(removed), removed);
  assert.ok(visit.includes("dirty.diagnosis && !diagnosisDecisionValid"));
  assert.ok(visit.includes("dirty.treatment && !treatmentDecisionValid"));
  assert.ok(visit.includes("dirty.procedure && !procedureDecisionValid"));
  assert.equal(longitudinalActionLabel("REVISE", "ar"), "تحديث تشخيص");
  assert.equal(longitudinalActionLabel("RESOLVE", "ar"), "تشخيص زال");
  assert.equal(longitudinalActionLabel("CONTINUE_EXISTING", "en"), "Treatment continued");
});

test("redundant Summary layers are absent and Patient Context retains only useful freshness", () => {
  const record = readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  const visit = readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  for (const removed of ["30-second summary", "Items to review", "Available measures", "No numeric measures are available"]) assert.ok(!record.includes(removed), removed);
  assert.ok(record.includes("physician-clinical-snapshot"));
  assert.ok(visit.includes('["CURRENT_MEDICATIONS", "CURRENT_HAIR_THERAPIES"].includes(item.code)'));
  assert.ok(!visit.includes("onReconcile"));
  assert.ok(!visit.includes("onReview={() => canonical.patientContext.fingerprint"));
});
