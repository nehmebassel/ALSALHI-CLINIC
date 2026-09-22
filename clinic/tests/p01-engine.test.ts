import assert from "node:assert/strict";
import test from "node:test";

import { P01_QUESTION_CONTRACTS } from "../lib/p01/contracts";
import {
  assertPrivacyBeforeP01Autosave,
  evaluateP01Draft,
  getP01OfficialQuestionValues,
  type P01Evaluation,
  type P01Locale,
} from "../lib/p01/engine";
import type { JsonValue, PatientInputJson } from "../lib/patient-access/service";
import type { P01FollowUpContext } from "../lib/follow-up/types";
import {
  P01_PRIVACY_NOTICE_AR,
  P01_PRIVACY_NOTICE_EN,
  P01_PRIVACY_NOTICE_VERSION,
} from "../lib/p01/privacy";

function answerFor(code: string, responseType: string): JsonValue {
  const contract = P01_QUESTION_CONTRACTS.find((item) => item.code === code)!;
  const fixed: Record<string, JsonValue> = {
    Q_PRIVACY_CONSENT: "YES",
    Q_PROFILE_FULL_NAME: "SYN P01 Patient",
    Q_PROFILE_DOB: "1994-04-12",
    Q_PROFILE_SEX: "FEMALE",
    Q_PROFILE_MARITAL_STATUS: "NOT_MARRIED",
    Q_HEALTH_SNAPSHOT: ["NONE_OF_THE_ABOVE"],
    Q_HAIR_CONCERN: "BOTH",
    Q_SCALP_SYMPTOMS: ["ITCH", "DANDRUFF"],
    Q_SCALP_SYMPTOM_DETAILS: {
      ITCH: { onset: "2025-01", pattern: "INTERMITTENT", severity: "3" },
      DANDRUFF: { onset: "2025-02", pattern: "CONTINUOUS" },
    },
    Q_PRIOR_DIAGNOSIS_GATE: "NO",
    Q_SCALP_BIOPSY_GATE: "NO",
    Q_HAIR_TREATMENT_GATE: "NO",
    Q_HAIR_PROCEDURE_GATE: "NO",
    Q_TRIGGER_EVENTS: ["NONE_OF_THE_ABOVE"],
    Q_TRIGGER_EVENTS_FEMALE: ["NONE"],
    Q_LIFESTYLE_BARIATRIC_SURGERY: "NO",
    Q_LIFESTYLE_HAIR_CONCEALMENT: ["NONE"],
    Q_WOMENS_HEALTH: ["NONE"],
    Q_WOMEN_CONTRACEPTION_STATUS: "NO",
    Q_PREGNANCY_BREASTFEEDING_STATUS: "NO",
    Q_PREGNANCY_PLANNING: "NO_PLAN",
    Q_HQ_HAIR_STATE: "VIRGIN",
    Q_HQ_PREVIOUS_TREATMENTS: ["NONE"],
    Q_HQ_DRUG_EXPOSURES: ["NONE"],
    Q_HQ_NATURAL_PATTERN: "STRAIGHT",
    Q_HQ_CURRENT_PROBLEMS: ["NONE"],
    Q_HQ_HEAT_TOOLS: ["NONE"],
    Q_HQ_WASH_FREQUENCY: "2",
    Q_HQ_CLEANSERS: ["CO_WASH_LOW_SHAMPOO"],
    Q_HQ_ROUTINE_ITEMS: ["NONE"],
    Q_HQ_ROUTINE_CHANGED: "NO",
    Q_DERMATOLOGY_CONCERN: "Synthetic dermatology concern",
    Q_LASER_CONCERNS: ["LASER_UNWANTED_HAIR"],
    Q_LASER_CONCERN_DETAILS: [{ id: "LASER_UNWANTED_HAIR", concern: "LASER_UNWANTED_HAIR", area: "FACE", prior: "NO" }],
    Q_AESTHETIC_PROCEDURES: ["AP_BOTOX"],
    Q_AESTHETIC_DETAILS: [{ id: "AP_BOTOX", procedure: "AP_BOTOX", area: "FACE_NECK", prior: "NO", desiredResult: "Synthetic desired result" }],
  };
  if (fixed[code] !== undefined) return fixed[code];
  if (contract.repeatable) {
    const item: Record<string, JsonValue> = { id: `SYN-${code}-1` };
    for (const field of contract.repeatable.fields) {
      item[field.code] = field.type === "MONTH_YEAR"
        ? { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2025, month: 1, normalizedGregorian: { year: 2025, month: 1 } }
        : field.type === "SINGLE_SELECT"
          ? (field.options?.[0]?.code ?? "YES")
          : "Synthetic item";
    }
    return [item];
  }
  if (responseType === "MULTI_SELECT") {
    return [contract.options?.[0]?.code ?? "SYN_OPTION"];
  }
  if (["SINGLE_SELECT", "BOOLEAN", "SCALE"].includes(responseType)) {
    return contract.options?.[0]?.code ?? "YES";
  }
  if (responseType === "DATE") return "1994-04-12";
  if (responseType === "MONTH_YEAR") return "2025-01";
  return "Synthetic answer";
}

function completeDraft(input: {
  locale?: P01Locale;
  primary: "RV_HAIR_LOSS" | "RV_SCALP_SYMPTOMS" | "RV_HAIR_QUALITY" | "RV_DERMATOLOGY" | "RV_LASER" | "RV_AESTHETIC_PROCEDURES";
  secondary: boolean;
  sex?: "MALE" | "FEMALE";
  additional?: string[];
}): { draft: PatientInputJson; evaluation: P01Evaluation } {
  const answers: Record<string, JsonValue> = {
    Q_VISIT_PRIMARY_REASON: input.primary,
    Q_PROFILE_SEX: input.sex ?? "FEMALE",
    ...(input.additional?.length ? { Q_VISIT_ADDITIONAL_REQUESTS: input.additional } : {}),
    Q_SECONDARY_SCALP_GATE:
      input.primary === "RV_HAIR_LOSS" ? (input.secondary ? "YES" : "NO") : "NO",
    Q_SECONDARY_HAIR_GATE:
      input.primary === "RV_SCALP_SYMPTOMS" ? (input.secondary ? "YES" : "NO") : "NO",
  };
  const draft: PatientInputJson = {
    locale: input.locale ?? "ar",
    answers,
    privacy: {
      noticeVersion: P01_PRIVACY_NOTICE_VERSION,
      noticeTextAr: P01_PRIVACY_NOTICE_AR,
      noticeTextEn: P01_PRIVACY_NOTICE_EN,
      language: input.locale ?? "ar",
      acceptedAt: "2026-08-14T08:00:00.000Z",
    },
  };

  for (let pass = 0; pass < 8; pass += 1) {
    const evaluation = evaluateP01Draft(draft);
    for (const question of evaluation.questions) {
      if (question.required && answers[question.code] === undefined) {
        answers[question.code] = answerFor(question.code, question.responseType);
      }
    }
    if (evaluateP01Draft(draft).state === "READY") {
      return { draft, evaluation: evaluateP01Draft(draft) };
    }
  }

  const evaluation = evaluateP01Draft(draft);
  assert.fail(`Synthetic fixture did not reach READY: ${JSON.stringify(evaluation.issues)}`);
}

test("Arabic and English produce identical server-authoritative routing", () => {
  const ar = completeDraft({ locale: "ar", primary: "RV_HAIR_LOSS", secondary: true });
  const en = completeDraft({ locale: "en", primary: "RV_HAIR_LOSS", secondary: true });

  assert.deepEqual(en.evaluation.activeModules, ar.evaluation.activeModules);
  assert.deepEqual(en.evaluation.activeQuestionCodes, ar.evaluation.activeQuestionCodes);
  assert.equal(ar.evaluation.direction, "rtl");
  assert.equal(en.evaluation.direction, "ltr");
  assert.notEqual(ar.evaluation.questions[0]?.label, en.evaluation.questions[0]?.label);
});

test("Hair primary can activate Scalp without creating a second visit reason", () => {
  const { draft, evaluation } = completeDraft({ primary: "RV_HAIR_LOSS", secondary: true });
  assert.deepEqual(evaluation.activeModules, {
    hairLoss: true,
    scalp: true,
    hairQuality: false,
    dermatology: false,
    laser: false,
    aesthetic: false,
    lifestyleNutrition: true,
  });
  assert.equal((draft.answers as Record<string, JsonValue>).Q_VISIT_PRIMARY_REASON, "RV_HAIR_LOSS");
  assert.equal(evaluation.questions.filter(({ code }) => code === "Q_VISIT_PRIMARY_REASON").length, 1);
});

test("Scalp primary can activate Hair without creating a second visit reason", () => {
  const { draft, evaluation } = completeDraft({ primary: "RV_SCALP_SYMPTOMS", secondary: true });
  assert.deepEqual(evaluation.activeModules, {
    hairLoss: true,
    scalp: true,
    hairQuality: false,
    dermatology: false,
    laser: false,
    aesthetic: false,
    lifestyleNutrition: true,
  });
  assert.equal((draft.answers as Record<string, JsonValue>).Q_VISIT_PRIMARY_REASON, "RV_SCALP_SYMPTOMS");
  assert.equal(evaluation.questions.filter(({ code }) => code === "Q_VISIT_PRIMARY_REASON").length, 1);
});

test("shared questions are displayed and persisted once with both activation sources", () => {
  const { draft, evaluation } = completeDraft({ primary: "RV_HAIR_LOSS", secondary: true });
  assert.equal(evaluation.questions.filter(({ code }) => code === "Q_PRIOR_DIAGNOSIS_GATE").length, 1);

  const official = getP01OfficialQuestionValues(draft);
  const shared = official.filter(({ questionCode }) => questionCode === "Q_PRIOR_DIAGNOSIS_GATE");
  assert.equal(shared.length, 1);
  assert.deepEqual(
    shared[0]?.activationSources.map(({ sourceKey }) => sourceKey).sort(),
    ["HAIR_LOSS", "SCALP"],
  );

  const details = official.filter(({ questionCode }) => questionCode === "Q_SCALP_SYMPTOM_DETAILS");
  assert.deepEqual(
    details.map(({ responseScopeKey }) => responseScopeKey).sort(),
    ["SCALP:DANDRUFF", "SCALP:ITCH"],
  );
});

test("hidden branch answers never enter official state", () => {
  const { draft, evaluation } = completeDraft({ primary: "RV_SCALP_SYMPTOMS", secondary: false });
  const answers = draft.answers as Record<string, JsonValue>;
  answers.Q_HAIR_CONCERN = "INVALID_HIDDEN_VALUE";
  answers.Q_TRIGGER_EVENTS = ["INVALID_HIDDEN_VALUE"];

  const reevaluated = evaluateP01Draft(draft);
  assert.equal(reevaluated.state, "READY");
  assert.equal(reevaluated.activeModules.hairLoss, false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_HAIR_CONCERN"), false);
  const officialCodes = getP01OfficialQuestionValues(draft).map(({ questionCode }) => questionCode);
  assert.equal(officialCodes.includes("Q_HAIR_CONCERN"), false);
  assert.equal(officialCodes.includes("Q_TRIGGER_EVENTS"), false);
});

test("exactly one primary reason and exclusive answers are enforced", () => {
  const { draft } = completeDraft({ primary: "RV_HAIR_LOSS", secondary: false });
  const answers = draft.answers as Record<string, JsonValue>;
  answers.Q_VISIT_PRIMARY_REASON = ["RV_HAIR_LOSS", "RV_SCALP_SYMPTOMS"];
  answers.Q_HEALTH_SNAPSHOT = ["NONE_OF_THE_ABOVE", "CHRONIC_DISEASE"];

  const evaluation = evaluateP01Draft(draft);
  assert.equal(evaluation.state, "UNKNOWN");
  assert.ok(evaluation.issues.some(({ questionCode }) => questionCode === "Q_VISIT_PRIMARY_REASON"));
  assert.ok(evaluation.issues.some(({ questionCode }) => questionCode === "Q_HEALTH_SNAPSHOT"));
});

test("privacy consent and immutable acceptance evidence are required before autosave", () => {
  const { draft } = completeDraft({ primary: "RV_HAIR_LOSS", secondary: false });
  assert.doesNotThrow(() => assertPrivacyBeforeP01Autosave(draft));

  const withoutEvidence: PatientInputJson = {
    locale: "ar",
    answers: { Q_PRIVACY_CONSENT: "YES" },
  };
  assert.throws(
    () => assertPrivacyBeforeP01Autosave(withoutEvidence),
    /PRIVACY_CONSENT_RECORD_INVALID/,
  );
  assert.throws(
    () => assertPrivacyBeforeP01Autosave({ answers: { Q_PRIVACY_CONSENT: "NO" } }),
    /PRIVACY_CONSENT_REQUIRED/,
  );

  const declined = evaluateP01Draft({ answers: { Q_PRIVACY_CONSENT: "NO" } });
  assert.equal(declined.state, "UNKNOWN");
  assert.ok(declined.issues.some(({ questionCode }) => questionCode === "Q_PRIVACY_CONSENT"));
});

test("governed text length and symptom severity validation fail closed", () => {
  const { draft } = completeDraft({ primary: "RV_HAIR_LOSS", secondary: true });
  const answers = draft.answers as Record<string, JsonValue>;
  answers.Q_PROFILE_FULL_NAME = "S".repeat(161);
  const details = answers.Q_SCALP_SYMPTOM_DETAILS as Record<string, JsonValue>;
  details.ITCH = { onset: "2025-01", pattern: "INTERMITTENT", severity: "" };

  const evaluation = evaluateP01Draft(draft);
  assert.equal(evaluation.state, "UNKNOWN");
  assert.ok(evaluation.issues.some(({ questionCode }) => questionCode === "Q_PROFILE_FULL_NAME"));
  assert.ok(evaluation.issues.some(({ questionCode }) => questionCode === "Q_SCALP_SYMPTOM_DETAILS"));
});

test("Women's Health activates only for FEMALE + active Hair Loss", () => {
  const female = completeDraft({ primary: "RV_HAIR_LOSS", secondary: false });
  assert.equal(female.evaluation.activeQuestionCodes.includes("Q_WOMENS_HEALTH"), true);
  assert.equal(female.evaluation.activeQuestionCodes.includes("Q_MENS_HEALTH"), false);

  const scalpOnly = completeDraft({ primary: "RV_SCALP_SYMPTOMS", secondary: false });
  assert.equal(scalpOnly.evaluation.activeQuestionCodes.includes("Q_WOMENS_HEALTH"), false);
});

test("Men's Health activates for MALE + active Hair Loss", () => {
  const { draft } = completeDraft({ primary: "RV_HAIR_LOSS", secondary: false });
  const answers = draft.answers as Record<string, JsonValue>;
  answers.Q_PROFILE_SEX = "MALE";
  answers.Q_MENS_HEALTH = ["NONE"];
  answers.Q_MEN_HORMONES_STEROIDS = "NEVER";

  const evaluation = evaluateP01Draft(draft);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_MENS_HEALTH"), true);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_WOMENS_HEALTH"), false);
});

test("executable P01 registry contains no Prefer not to answer option", () => {
  for (const question of P01_QUESTION_CONTRACTS) {
    assert.doesNotMatch(question.localized.ar.label, /أفضل عدم الإجابة/);
    assert.doesNotMatch(question.localized.en.label, /Prefer not to answer/i);
    for (const option of question.options ?? []) {
      assert.doesNotMatch(option.labelAr, /أفضل عدم الإجابة/);
      assert.doesNotMatch(option.labelEn, /Prefer not to answer/i);
    }
  }
});

test("sex-specific follow-ups remain hard-gated even when stale opposite-sex answers exist", () => {
  const female = completeDraft({ primary: "RV_HAIR_LOSS", secondary: false });
  const answers = female.draft.answers as Record<string, JsonValue>;
  answers.Q_PROFILE_SEX = "MALE";
  answers.Q_WOMENS_HEALTH = ["IRREGULAR_CYCLES"];
  answers.Q_WOMEN_IRREGULAR_INTERVAL = "28";
  answers.Q_WOMEN_IRREGULAR_DURATION = "5";
  answers.Q_WOMEN_PREMENSTRUAL_SYMPTOMS = "USUALLY";
  answers.Q_WOMEN_GYN_EVALUATED = "NO";
  answers.Q_TRIGGER_EVENTS_FEMALE = ["CHILDBIRTH"];
  answers.Q_TRIGGER_EVENTS_FEMALE_DETAILS = [{ id: "CHILDBIRTH", event: "CHILDBIRTH", date: "2020-01" }];
  answers.Q_MENS_HEALTH = ["NONE"];
  answers.Q_MEN_HORMONES_STEROIDS = "NEVER";
  answers.Q_TRIGGER_EVENTS_MALE = ["NONE"];

  const evaluation = evaluateP01Draft(female.draft);
  assert.equal(evaluation.activeQuestionCodes.some((code) => code.startsWith("Q_WOMEN")), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_TRIGGER_EVENTS_FEMALE"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_TRIGGER_EVENTS_FEMALE_DETAILS"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_MENS_HEALTH"), true);
});

test("owner-approved Men's Health detail branches are executable", () => {
  const codes = new Set(P01_QUESTION_CONTRACTS.map(({ code }) => code));
  for (const code of [
    "Q_MEN_ERECTION_ONSET",
    "Q_MEN_ERECTION_MED_RELATION",
    "Q_MEN_ERECTION_MED_NAME",
    "Q_MEN_BREAST_ONSET",
    "Q_MEN_BREAST_MED_RELATION",
    "Q_MEN_BODY_HAIR_ONSET",
    "Q_MEN_BODY_HAIR_PATTERN",
    "Q_MEN_MUSCLE_ONSET",
    "Q_MEN_MUSCLE_ACTIVITY_RELATION",
    "Q_MEN_HORMONE_NAME",
    "Q_MEN_HORMONE_START",
    "Q_MEN_HORMONE_STOP",
  ]) assert.equal(codes.has(code), true, code);
});

test("pregnancy planning is not duplicated inside Women's Health", () => {
  assert.equal(P01_QUESTION_CONTRACTS.some(({ code }) => code === "Q_WOMEN_PREGNANCY_PLANNING"), false);
});

test("Arabic executable labels localize digits while English labels use Latin digits", () => {
  const ar = completeDraft({ locale: "ar", primary: "RV_HAIR_LOSS", secondary: false }).evaluation;
  const en = completeDraft({ locale: "en", primary: "RV_HAIR_LOSS", secondary: false }).evaluation;
  const arHeavy = ar.questions.find(({ code }) => code === "Q_WOMENS_HEALTH")?.options.find(({ code }) => code === "HEAVY_FLOW");
  assert.ok(arHeavy);
  const arSpeed = ar.questions.find(({ code }) => code === "Q_HAIR_THINNING_SPEED")?.options.find(({ code }) => code === "LT_3M")?.label;
  const enSpeed = en.questions.find(({ code }) => code === "Q_HAIR_THINNING_SPEED")?.options.find(({ code }) => code === "LT_3M")?.label;
  assert.match(arSpeed ?? "", /٣/);
  assert.doesNotMatch(arSpeed ?? "", /3/);
  assert.match(enSpeed ?? "", /3/);
  assert.doesNotMatch(enSpeed ?? "", /٣/);
});


function minimalDraftForPrimary(
  primary: "RV_HAIR_LOSS" | "RV_SCALP_SYMPTOMS" | "RV_HAIR_QUALITY" | "RV_DERMATOLOGY" | "RV_LASER" | "RV_AESTHETIC_PROCEDURES",
  sex: "MALE" | "FEMALE" = "FEMALE",
  additional: string[] = [],
): PatientInputJson {
  return {
    locale: "ar",
    answers: {
      Q_PRIVACY_CONSENT: "YES",
      Q_PROFILE_FULL_NAME: "Synthetic Pilot 0 Patient",
      Q_PROFILE_DOB: "1990-01-01",
      Q_PROFILE_SEX: sex,
      Q_PROFILE_MARITAL_STATUS: "NOT_MARRIED",
      Q_VISIT_PRIMARY_REASON: primary,
      ...(additional.length ? { Q_VISIT_ADDITIONAL_REQUESTS: additional } : {}),
    },
    privacy: {
      noticeVersion: P01_PRIVACY_NOTICE_VERSION,
      noticeTextAr: P01_PRIVACY_NOTICE_AR,
      noticeTextEn: P01_PRIVACY_NOTICE_EN,
      language: "ar",
      acceptedAt: "2026-08-17T00:00:00.000Z",
    },
  };
}

test("Pilot 0 primary visit reason registry contains exactly the six approved services", () => {
  const reason = P01_QUESTION_CONTRACTS.find(({ code }) => code === "Q_VISIT_PRIMARY_REASON");
  assert.ok(reason);
  assert.deepEqual(reason.options?.map(({ code }) => code), [
    "RV_HAIR_LOSS",
    "RV_SCALP_SYMPTOMS",
    "RV_HAIR_QUALITY",
    "RV_DERMATOLOGY",
    "RV_LASER",
    "RV_AESTHETIC_PROCEDURES",
  ]);
});

test("only Laser and Aesthetic Procedures are offered as additional services", () => {
  const additional = P01_QUESTION_CONTRACTS.find(({ code }) => code === "Q_VISIT_ADDITIONAL_REQUESTS");
  assert.ok(additional);
  assert.deepEqual(additional.options?.map(({ code }) => code), ["RV_LASER", "RV_AESTHETIC_PROCEDURES"]);
});

test("Hair Quality activates its own pathway plus Lifestyle/Nutrition and remains independent of Hair/Scalp", () => {
  const evaluation = evaluateP01Draft(minimalDraftForPrimary("RV_HAIR_QUALITY", "FEMALE"));
  assert.deepEqual(evaluation.activeModules, {
    hairLoss: false,
    scalp: false,
    hairQuality: true,
    dermatology: false,
    laser: false,
    aesthetic: false,
    lifestyleNutrition: true,
  });
  assert.equal(evaluation.activeQuestionCodes.includes("Q_HQ_HAIR_STATE"), true);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_LIFESTYLE_WEIGHT_GAIN"), true);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_HAIR_CONCERN"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_SCALP_SYMPTOMS"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_WOMENS_HEALTH"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_PREGNANCY_BREASTFEEDING_STATUS"), true);
});

test("Dermatology remains a single independent free-text concern and female Pregnancy Context stays shared", () => {
  const evaluation = evaluateP01Draft(minimalDraftForPrimary("RV_DERMATOLOGY", "FEMALE"));
  assert.equal(evaluation.activeModules.dermatology, true);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_DERMATOLOGY_CONCERN"), true);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_HQ_HAIR_STATE"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_WOMENS_HEALTH"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_PREGNANCY_BREASTFEEDING_STATUS"), true);
  assert.equal(
    P01_QUESTION_CONTRACTS.filter(({ sectionCode }) => sectionCode === "DERMATOLOGY").length,
    1,
  );
});

test("Laser and Aesthetic can activate as independent additional mini pathways", () => {
  const evaluation = evaluateP01Draft(
    minimalDraftForPrimary("RV_DERMATOLOGY", "MALE", ["RV_LASER", "RV_AESTHETIC_PROCEDURES"]),
  );
  assert.equal(evaluation.activeModules.dermatology, true);
  assert.equal(evaluation.activeModules.laser, true);
  assert.equal(evaluation.activeModules.aesthetic, true);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_LASER_CONCERNS"), true);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_AESTHETIC_PROCEDURES"), true);
});

test("Laser concern catalogue matches the governing concern-centric list", () => {
  const laser = P01_QUESTION_CONTRACTS.find(({ code }) => code === "Q_LASER_CONCERNS");
  assert.deepEqual(laser?.options?.map(({ code }) => code), [
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
  ]);
});

test("Aesthetic procedure catalogue matches the governing procedure-centric list", () => {
  const aesthetic = P01_QUESTION_CONTRACTS.find(({ code }) => code === "Q_AESTHETIC_PROCEDURES");
  assert.deepEqual(aesthetic?.options?.map(({ code }) => code), [
    "AP_BOTOX",
    "AP_FILLER",
    "AP_SKIN_BOOSTER",
    "AP_COLLAGEN_STIMULATORS",
    "AP_FAT_DISSOLVING",
    "AP_SWEATING_INJECTION",
    "AP_BODY_CONTOURING",
    "AP_OTHER",
  ]);
});

test("Pregnancy Context is shared across every female Pilot 0 primary pathway and absent for male patients", () => {
  const primaryReasons = [
    "RV_HAIR_LOSS",
    "RV_SCALP_SYMPTOMS",
    "RV_HAIR_QUALITY",
    "RV_DERMATOLOGY",
    "RV_LASER",
    "RV_AESTHETIC_PROCEDURES",
  ] as const;
  for (const primary of primaryReasons) {
    const female = evaluateP01Draft(minimalDraftForPrimary(primary, "FEMALE"));
    const male = evaluateP01Draft(minimalDraftForPrimary(primary, "MALE"));
    assert.equal(female.activeQuestionCodes.includes("Q_PREGNANCY_BREASTFEEDING_STATUS"), true, primary);
    assert.equal(male.activeQuestionCodes.includes("Q_PREGNANCY_BREASTFEEDING_STATUS"), false, primary);
  }
});

test("complete Pilot 0 registry has unique question codes and no removed Other Information section", () => {
  const codes = P01_QUESTION_CONTRACTS.map(({ code }) => code);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(P01_QUESTION_CONTRACTS.some(({ sectionCode }) => String(sectionCode) === "OTHER_INFORMATION"), false);
  assert.equal(codes.some((code) => /OTHER_INFORMATION/.test(code)), false);
});

test("ADDITIONAL Laser/Aesthetic official records strip stale full-pathway-only fields", () => {
  const laserDraft = minimalDraftForPrimary("RV_DERMATOLOGY", "MALE", ["RV_LASER"]);
  const laserAnswers = laserDraft.answers as Record<string, JsonValue>;
  laserAnswers.Q_HEALTH_SNAPSHOT = ["NONE_OF_THE_ABOVE"];
  laserAnswers.Q_DERMATOLOGY_CONCERN = "Synthetic dermatology concern";
  laserAnswers.Q_LASER_CONCERNS = ["LASER_UNWANTED_HAIR"];
  laserAnswers.Q_LASER_CONCERN_DETAILS = [{
    id: "LASER_UNWANTED_HAIR",
    concern: "LASER_UNWANTED_HAIR",
    prior: "NO",
    area: "FACE",
    areaOther: "stale",
    desiredResult: "stale full-pathway value",
  }];
  assert.equal(evaluateP01Draft(laserDraft).state, "READY");
  const laserOfficial = getP01OfficialQuestionValues(laserDraft).find(({ questionCode }) => questionCode === "Q_LASER_CONCERN_DETAILS");
  assert.ok(laserOfficial && typeof laserOfficial.value === "object" && laserOfficial.value !== null && !Array.isArray(laserOfficial.value));
  const laserValue = laserOfficial.value as Record<string, JsonValue>;
  assert.equal("area" in laserValue, false);
  assert.equal("desiredResult" in laserValue, false);

  const aestheticDraft = minimalDraftForPrimary("RV_DERMATOLOGY", "MALE", ["RV_AESTHETIC_PROCEDURES"]);
  const aestheticAnswers = aestheticDraft.answers as Record<string, JsonValue>;
  aestheticAnswers.Q_HEALTH_SNAPSHOT = ["NONE_OF_THE_ABOVE"];
  aestheticAnswers.Q_DERMATOLOGY_CONCERN = "Synthetic dermatology concern";
  aestheticAnswers.Q_AESTHETIC_PROCEDURES = ["AP_BOTOX"];
  aestheticAnswers.Q_AESTHETIC_DETAILS = [{
    id: "AP_BOTOX",
    procedure: "AP_BOTOX",
    prior: "NO",
    area: "FACE_NECK",
    goal: "stale",
    desiredResult: "stale full-pathway value",
  }];
  assert.equal(evaluateP01Draft(aestheticDraft).state, "READY");
  const aestheticOfficial = getP01OfficialQuestionValues(aestheticDraft).find(({ questionCode }) => questionCode === "Q_AESTHETIC_DETAILS");
  assert.ok(aestheticOfficial && typeof aestheticOfficial.value === "object" && aestheticOfficial.value !== null && !Array.isArray(aestheticOfficial.value));
  const aestheticValue = aestheticOfficial.value as Record<string, JsonValue>;
  assert.equal("area" in aestheticValue, false);
  assert.equal("goal" in aestheticValue, false);
  assert.equal("desiredResult" in aestheticValue, false);
});


test("all current-product primary pathways can reach READY for an eligible patient", () => {
  const reasons = [
    "RV_HAIR_LOSS",
    "RV_SCALP_SYMPTOMS",
    "RV_HAIR_QUALITY",
    "RV_DERMATOLOGY",
    "RV_LASER",
    "RV_AESTHETIC_PROCEDURES",
  ] as const;
  for (const primary of reasons) {
    const result = completeDraft({ primary, secondary: false, sex: primary === "RV_HAIR_QUALITY" ? "FEMALE" : "MALE" });
    assert.equal(result.evaluation.state, "READY", primary);
  }
});

test("female non-hair pathways can reach READY with the shared Pregnancy Context", () => {
  for (const primary of ["RV_HAIR_QUALITY", "RV_DERMATOLOGY", "RV_LASER", "RV_AESTHETIC_PROCEDURES"] as const) {
    const result = completeDraft({ primary, secondary: false, sex: "FEMALE" });
    assert.equal(result.evaluation.state, "READY", primary);
    assert.equal(result.evaluation.activeQuestionCodes.includes("Q_PREGNANCY_BREASTFEEDING_STATUS"), true, primary);
  }
});

test("PRIMARY Laser and Aesthetic official records retain full-pathway fields", () => {
  const laser = completeDraft({ primary: "RV_LASER", secondary: false, sex: "MALE" });
  const laserOfficial = getP01OfficialQuestionValues(laser.draft).find(({ questionCode }) => questionCode === "Q_LASER_CONCERN_DETAILS");
  assert.ok(laserOfficial && typeof laserOfficial.value === "object" && laserOfficial.value !== null && !Array.isArray(laserOfficial.value));
  assert.equal((laserOfficial.value as Record<string, JsonValue>).area, "FACE");

  const aesthetic = completeDraft({ primary: "RV_AESTHETIC_PROCEDURES", secondary: false, sex: "MALE" });
  const aestheticOfficial = getP01OfficialQuestionValues(aesthetic.draft).find(({ questionCode }) => questionCode === "Q_AESTHETIC_DETAILS");
  assert.ok(aestheticOfficial && typeof aestheticOfficial.value === "object" && aestheticOfficial.value !== null && !Array.isArray(aestheticOfficial.value));
  assert.equal((aestheticOfficial.value as Record<string, JsonValue>).area, "FACE_NECK");
  assert.equal((aestheticOfficial.value as Record<string, JsonValue>).desiredResult, "Synthetic desired result");
});

test("follow-up lifecycle covers every executable P01 question exactly once", async () => {
  const { FOLLOW_UP_LIFECYCLE_BY_QUESTION } = await import("../lib/follow-up/lifecycle");
  const codes = P01_QUESTION_CONTRACTS.map((item) => item.code);
  assert.equal(Object.keys(FOLLOW_UP_LIFECYCLE_BY_QUESTION).length, codes.length);
  assert.deepEqual(new Set(Object.keys(FOLLOW_UP_LIFECYCLE_BY_QUESTION)), new Set(codes));
});

test("existing-concern follow-up routes from locked identity and episode without copying prior responses", () => {
  const initial = completeDraft({ primary: "RV_HAIR_LOSS", secondary: false, sex: "FEMALE" });
  const initialAnswers = initial.draft.answers as Record<string, JsonValue>;
  const snapshot = Object.entries(initialAnswers).map(([questionCode, value], index) => {
    const contract = P01_QUESTION_CONTRACTS.find((item) => item.code === questionCode);
    return {
      questionCode,
      labelAr: contract?.localized.ar.label ?? questionCode,
      labelEn: contract?.localized.en.label ?? questionCode,
      value,
      responseScopeType: contract?.scope ?? "PATHWAY",
      responseScopeKey: contract?.scopeKey ?? "P01",
      sourceResponseId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      sourceVisitId: "11111111-1111-4111-8111-111111111111",
      sourceEpisodeId: "22222222-2222-4222-8222-222222222222",
      sourceVisitAt: "2026-08-01T08:00:00.000Z",
    };
  });
  const draft: PatientInputJson = {
    locale: "ar",
    answers: { Q_PRIVACY_CONSENT: "YES" },
    privacy: {
      noticeVersion: P01_PRIVACY_NOTICE_VERSION,
      noticeTextAr: P01_PRIVACY_NOTICE_AR,
      noticeTextEn: P01_PRIVACY_NOTICE_EN,
      language: "ar",
      acceptedAt: "2026-08-17T08:00:00.000Z",
    },
    followUp: {
      version: "P01_FOLLOW_UP_v5",
      mode: "RETURNING",
      patientId: "33333333-3333-4333-8333-333333333333",
      identity: {
        fullName: "SYN Returning Patient",
        dateOfBirth: "1994-04-12",
        sex: "FEMALE",
        maritalStatus: "NOT_MARRIED",
        mrn: "SYN-FOLLOW-UP-001",
      },
      episodes: [{
        id: "22222222-2222-4222-8222-222222222222",
        primaryReasonCode: "RV_HAIR_LOSS",
        labelAr: "تساقط الشعر",
        labelEn: "Hair Loss",
        lastVisitId: "11111111-1111-4111-8111-111111111111",
        lastVisitAt: "2026-08-01T08:00:00.000Z",
        visitCount: 1,
        physicianContextAvailable: false,
      }],
      episodeState: [{
        episodeId: "22222222-2222-4222-8222-222222222222",
        primaryReasonCode: "RV_HAIR_LOSS",
        physicianContextAvailable: false,
        currentTreatmentCount: 0,
        priorProcedureCount: 0,
        latestMeasurementCodes: [],
        importantEventTypes: [],
        physicianRoutedQuestionCodes: [],
        physicianChangeDomains: [],
      }],
      recordedQuestionCodes: [...new Set(snapshot.map((entry) => entry.questionCode))],
      snapshot: { generatedAt: "2026-08-17T08:00:00.000Z", entries: snapshot },
      intent: "EXISTING_CONCERN",
      selectedEpisodeId: "22222222-2222-4222-8222-222222222222",
      selectedPrimaryReasonCode: "RV_HAIR_LOSS",
      sourceVisitId: "11111111-1111-4111-8111-111111111111",
      changes: {
        generalHealth: "NO_CHANGE",
        medicationsSupplements: "NO_CHANGE",
        hairTreatments: "NO_CHANGE",
        hairProcedures: "NO",
        triggerEvents: "NO",
        sexSpecific: "NO_CHANGE",
        hairQualityLifestyle: "NO_CHANGE",
      },
      delta: {
        currentMetrics: { SHEDDING: 2, DENSITY: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
      },
      changesReviewed: true,
    },
  };

  const answers = draft.answers as Record<string, JsonValue>;
  for (let pass = 0; pass < 8; pass += 1) {
    const evaluation = evaluateP01Draft(draft);
    for (const question of evaluation.questions) {
      if (question.required && answers[question.code] === undefined) {
        answers[question.code] = answerFor(question.code, question.responseType);
      }
    }
    if (evaluateP01Draft(draft).state === "READY") break;
  }

  const evaluation = evaluateP01Draft(draft);
  assert.equal(evaluation.state, "READY", JSON.stringify(evaluation.issues));
  assert.equal(evaluation.activeQuestionCodes.includes("Q_PROFILE_FULL_NAME"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_PROFILE_DOB"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_PROFILE_SEX"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_VISIT_PRIMARY_REASON"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_HAIR_CONCERN"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_HEALTH_SNAPSHOT"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_PRIOR_DIAGNOSES"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_HAIR_SHEDDING_SEVERITY"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_SCALP_SYMPTOMS"), false);

  const official = getP01OfficialQuestionValues(draft);
  assert.equal(official.some((item) => item.questionCode === "Q_PROFILE_FULL_NAME"), false);
  assert.equal(official.some((item) => item.questionCode === "Q_HEALTH_SNAPSHOT"), false);
  assert.equal(official.some((item) => item.questionCode === "Q_HAIR_SHEDDING_SEVERITY"), false);

  const context = draft.followUp as unknown as P01FollowUpContext;
  context.episodeState[0].physicianContextAvailable = true;
  context.episodeState[0].physicianRoutedQuestionCodes = ["Q_HAIR_EVIDENCE"];
  const physicianRouted = evaluateP01Draft(draft);
  assert.equal(physicianRouted.activeQuestionCodes.includes("Q_HAIR_EVIDENCE"), false);
});

test("returning patient cannot create a second active episode for the same concern through NEW_CONCERN", () => {
  const draft: PatientInputJson = {
    locale: "en",
    answers: {
      Q_PRIVACY_CONSENT: "YES",
      Q_VISIT_PRIMARY_REASON: "RV_HAIR_LOSS",
    },
    privacy: {
      noticeVersion: P01_PRIVACY_NOTICE_VERSION,
      noticeTextAr: P01_PRIVACY_NOTICE_AR,
      noticeTextEn: P01_PRIVACY_NOTICE_EN,
      language: "en",
      acceptedAt: "2026-08-17T08:00:00.000Z",
    },
    followUp: {
      version: "P01_FOLLOW_UP_v5",
      mode: "RETURNING",
      patientId: "33333333-3333-4333-8333-333333333333",
      identity: {
        fullName: "SYN Returning Patient",
        dateOfBirth: "1994-04-12",
        sex: "FEMALE",
        maritalStatus: "NOT_MARRIED",
        mrn: "SYN-FOLLOW-UP-002",
      },
      episodes: [{
        id: "22222222-2222-4222-8222-222222222222",
        primaryReasonCode: "RV_HAIR_LOSS",
        labelAr: "تساقط الشعر",
        labelEn: "Hair Loss",
        lastVisitId: "11111111-1111-4111-8111-111111111111",
        lastVisitAt: "2026-08-01T08:00:00.000Z",
        visitCount: 2,
        physicianContextAvailable: false,
      }],
      episodeState: [{
        episodeId: "22222222-2222-4222-8222-222222222222",
        primaryReasonCode: "RV_HAIR_LOSS",
        physicianContextAvailable: false,
        currentTreatmentCount: 0,
        priorProcedureCount: 0,
        latestMeasurementCodes: [],
        importantEventTypes: [],
        physicianRoutedQuestionCodes: [],
        physicianChangeDomains: [],
      }],
      recordedQuestionCodes: [],
      snapshot: { generatedAt: "2026-08-17T08:00:00.000Z", entries: [] },
      intent: "NEW_CONCERN",
      changes: {
        generalHealth: "NO_CHANGE",
        medicationsSupplements: "NO_CHANGE",
        hairTreatments: "NO_CHANGE",
        hairProcedures: "NO",
        triggerEvents: "NO",
        sexSpecific: "NO_CHANGE",
        hairQualityLifestyle: "NO_CHANGE",
      },
      changesReviewed: true,
    },
  };

  const evaluation = evaluateP01Draft(draft);
  assert.equal(
    evaluation.issues.some((issue) => issue.questionCode === "Q_VISIT_PRIMARY_REASON" && issue.code === "INVALID_COMBINATION"),
    true,
  );
});


test("returning NEW_CONCERN uses the delta step for shared health and medications instead of reopening those Initial Intake questions", () => {
  const draft: PatientInputJson = {
    locale: "ar",
    answers: {
      Q_PRIVACY_CONSENT: "YES",
      Q_VISIT_PRIMARY_REASON: "RV_DERMATOLOGY",
    },
    privacy: {
      noticeVersion: P01_PRIVACY_NOTICE_VERSION,
      noticeTextAr: P01_PRIVACY_NOTICE_AR,
      noticeTextEn: P01_PRIVACY_NOTICE_EN,
      language: "ar",
      acceptedAt: "2026-08-17T08:00:00.000Z",
    },
    followUp: {
      version: "P01_FOLLOW_UP_v5",
      mode: "RETURNING",
      patientId: "33333333-3333-4333-8333-333333333333",
      identity: {
        fullName: "SYN Returning Patient", dateOfBirth: "1994-04-12", sex: "FEMALE",
        maritalStatus: "NOT_MARRIED", mrn: "SYN-FOLLOW-UP-003",
      },
      episodes: [{
        id: "22222222-2222-4222-8222-222222222222", primaryReasonCode: "RV_HAIR_LOSS",
        labelAr: "تساقط الشعر", labelEn: "Hair Loss", lastVisitId: "11111111-1111-4111-8111-111111111111",
        lastVisitAt: "2026-08-01T08:00:00.000Z", visitCount: 1, physicianContextAvailable: true,
      }],
      episodeState: [{
        episodeId: "22222222-2222-4222-8222-222222222222", primaryReasonCode: "RV_HAIR_LOSS",
        physicianContextAvailable: true, currentTreatmentCount: 1, priorProcedureCount: 1,
        latestMeasurementCodes: [], importantEventTypes: [], physicianRoutedQuestionCodes: [], physicianChangeDomains: [],
      }],
      recordedQuestionCodes: ["Q_HEALTH_SNAPSHOT", "Q_HEALTH_MEDICATION_ITEMS", "Q_HEALTH_SUPPLEMENT_ITEMS"],
      snapshot: { generatedAt: "2026-08-17T08:00:00.000Z", entries: [] },
      intent: "NEW_CONCERN",
      changes: { generalHealth: "CHANGED", medicationsSupplements: ["STARTED"] },
      delta: {
        generalHealth: { chronicConditions: [{ id: "N1", name: "Synthetic condition" }], tumors: [], allergies: [], surgeriesHospitalizations: [] },
        medicationsSupplements: { startedMedications: [{ id: "M1", name: "Synthetic medication" }], startedSupplements: [], affectedExisting: [] },
      },
      changesReviewed: true,
    },
  };
  const evaluation = evaluateP01Draft(draft);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_HEALTH_SNAPSHOT"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_HEALTH_MEDICATION_ITEMS"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_HEALTH_SUPPLEMENT_ITEMS"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_DERMATOLOGY_CONCERN"), true);
});

test("existing-concern follow-up has a hard Initial Intake boundary for every Pilot 0 primary pathway", () => {
  const reasons = [
    "RV_HAIR_LOSS",
    "RV_SCALP_SYMPTOMS",
    "RV_HAIR_QUALITY",
    "RV_DERMATOLOGY",
    "RV_LASER",
    "RV_AESTHETIC_PROCEDURES",
  ] as const;

  for (const primaryReasonCode of reasons) {
    const draft: PatientInputJson = {
      locale: "ar",
      answers: { Q_PRIVACY_CONSENT: "YES" },
      privacy: {
        noticeVersion: P01_PRIVACY_NOTICE_VERSION,
        noticeTextAr: P01_PRIVACY_NOTICE_AR,
        noticeTextEn: P01_PRIVACY_NOTICE_EN,
        language: "ar",
        acceptedAt: "2026-08-17T08:00:00.000Z",
      },
      followUp: {
        version: "P01_FOLLOW_UP_v5",
        mode: "RETURNING",
        patientId: "33333333-3333-4333-8333-333333333333",
        identity: {
          fullName: "SYN Returning Patient",
          dateOfBirth: "1994-04-12",
          sex: "FEMALE",
          maritalStatus: "NOT_MARRIED",
          mrn: "SYN-FOLLOW-UP-HARD-BOUNDARY",
        },
        episodes: [{
          id: "22222222-2222-4222-8222-222222222222",
          primaryReasonCode,
          labelAr: primaryReasonCode,
          labelEn: primaryReasonCode,
          lastVisitId: "11111111-1111-4111-8111-111111111111",
          lastVisitAt: "2026-08-01T08:00:00.000Z",
          visitCount: 1,
          physicianContextAvailable: true,
        }],
        episodeState: [{
          episodeId: "22222222-2222-4222-8222-222222222222",
          primaryReasonCode,
          physicianContextAvailable: true,
          currentTreatmentCount: 1,
          priorProcedureCount: 1,
          latestMeasurementCodes: [],
          importantEventTypes: [],
          // Deliberately route a normal registry question; it still must not reopen Initial Intake.
          physicianRoutedQuestionCodes: ["Q_HAIR_EVIDENCE", "Q_DERMATOLOGY_CONCERN"],
          physicianChangeDomains: [],
        }],
        recordedQuestionCodes: ["Q_HEALTH_SNAPSHOT", "Q_HAIR_EVIDENCE", "Q_DERMATOLOGY_CONCERN"],
        snapshot: { generatedAt: "2026-08-17T08:00:00.000Z", entries: [] },
        intent: "EXISTING_CONCERN",
        selectedEpisodeId: "22222222-2222-4222-8222-222222222222",
        selectedPrimaryReasonCode: primaryReasonCode,
        sourceVisitId: "11111111-1111-4111-8111-111111111111",
        changes: {
          generalHealth: "NO_CHANGE",
          medicationsSupplements: "NO_CHANGE",
          hairTreatments: "NO_CHANGE",
          hairProcedures: "NO",
          triggerEvents: "NO",
          sexSpecific: "NO_CHANGE",
          hairQualityLifestyle: "NO_CHANGE",
        },
        delta: {
          currentMetrics: { SHEDDING: 0, DENSITY: 0, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
        },
        changesReviewed: true,
      },
    };

    const evaluation = evaluateP01Draft(draft);
    assert.deepEqual(evaluation.activeQuestionCodes, ["Q_PRIVACY_CONSENT"], primaryReasonCode);
  }
});


test("male Hair/Scalp intake never exposes women-specific diagnosis options or modules", () => {
  const { draft } = completeDraft({ primary: "RV_HAIR_LOSS", secondary: false, sex: "MALE" });
  const answers = draft.answers as Record<string, JsonValue>;
  answers.Q_PRIOR_DIAGNOSIS_GATE = "YES";
  delete answers.Q_PRIOR_DIAGNOSES;
  const evaluation = evaluateP01Draft(draft);
  const diagnoses = evaluation.questions.find(({ code }) => code === "Q_PRIOR_DIAGNOSES");
  assert.ok(diagnoses);
  assert.equal(diagnoses.options.some(({ code }) => code === "POSTPARTUM_SHEDDING"), false);
  assert.equal(evaluation.activeQuestionCodes.some((code) => code.startsWith("Q_WOMEN_")), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_WOMENS_HEALTH"), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_TRIGGER_EVENTS_FEMALE"), false);
  assert.equal(evaluation.activeQuestionCodes.some((code) => code.startsWith("Q_PREGNANCY_")), false);
  assert.equal(evaluation.activeQuestionCodes.includes("Q_BREASTFEEDING_ONSET"), false);
});

test("server rejects forged postpartum diagnosis for a male patient", () => {
  const { draft } = completeDraft({ primary: "RV_HAIR_LOSS", secondary: false, sex: "MALE" });
  const answers = draft.answers as Record<string, JsonValue>;
  answers.Q_PRIOR_DIAGNOSIS_GATE = "YES";
  answers.Q_PRIOR_DIAGNOSES = ["POSTPARTUM_SHEDDING"];
  answers.Q_PRIOR_DIAGNOSIS_DETAILS = [{
    id: "POSTPARTUM_SHEDDING",
    diagnosis: "POSTPARTUM_SHEDDING",
    date: "2025-01",
  }];
  const evaluation = evaluateP01Draft(draft);
  assert.equal(evaluation.state, "UNKNOWN");
  assert.equal(evaluation.issues.some(({ questionCode }) => questionCode === "Q_PRIOR_DIAGNOSES"), true);
});

test("hair medications and hair procedures have independent gates", () => {
  const { draft } = completeDraft({ primary: "RV_HAIR_LOSS", secondary: false, sex: "MALE" });
  const answers = draft.answers as Record<string, JsonValue>;
  answers.Q_HAIR_TREATMENT_GATE = "YES";
  answers.Q_HAIR_TREATMENT_ITEMS = [{
    id: "MINOXIDIL",
    name: "Minoxidil",
    start: "2025-01",
    stillUsing: "YES",
  }];
  answers.Q_HAIR_PROCEDURE_GATE = "NO";
  delete answers.Q_HAIR_PROCEDURES;
  delete answers.Q_HAIR_PROCEDURE_DETAILS;
  const medicationOnly = evaluateP01Draft(draft);
  assert.equal(medicationOnly.activeQuestionCodes.includes("Q_HAIR_TREATMENT_ITEMS"), true);
  assert.equal(medicationOnly.activeQuestionCodes.includes("Q_HAIR_PROCEDURES"), false);

  answers.Q_HAIR_TREATMENT_GATE = "NO";
  delete answers.Q_HAIR_TREATMENT_ITEMS;
  answers.Q_HAIR_PROCEDURE_GATE = "YES";
  const procedureOnly = evaluateP01Draft(draft);
  assert.equal(procedureOnly.activeQuestionCodes.includes("Q_HAIR_TREATMENT_ITEMS"), false);
  assert.equal(procedureOnly.activeQuestionCodes.includes("Q_HAIR_PROCEDURES"), true);
});

test("pattern hair loss uses the owner-approved updated bilingual label", () => {
  const contract = P01_QUESTION_CONTRACTS.find(({ code }) => code === "Q_PRIOR_DIAGNOSES");
  const option = contract?.options?.find(({ code }) => code === "PATTERN_HAIR_LOSS");
  assert.equal(option?.labelAr, "تساقط الشعر النمطي (الوراثي)");
  assert.equal(option?.labelEn, "Pattern Hair Loss (Androgenetic Alopecia)");
});
