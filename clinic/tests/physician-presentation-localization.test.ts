import assert from "node:assert/strict";
import test from "node:test";
import { presentClinicalValue } from "../lib/physician/presentation";
import type { PhysicianInterviewQuestion } from "../lib/physician/types";

function question(value: unknown): PhysicianInterviewQuestion {
  return {
    id: "q1",
    code: "Q_AESTHETIC_DETAILS",
    text: { ar: "تفاصيل الإجراءات", en: "Procedure details" },
    library: { ar: "الإجراءات التجميلية", en: "Aesthetic Procedures" },
    group: { ar: "الإجراءات التجميلية", en: "Aesthetic Procedures" },
    responseType: "LONG_TEXT",
    responseScopeType: "PROCEDURE_SELECTION",
    responseScopeKey: "AP_BOTOX",
    options: [],
    value: value as never,
    repeatableItems: [value as never],
    currentSource: "PATIENT",
    editableByPhysician: true,
  };
}

test("physician Arabic presentation localizes nested aesthetic structured codes", () => {
  const result = presentClinicalValue(question({ procedure: "AP_BOTOX", area: "FACE_NECK", prior: "YES", complications: "DONT_REMEMBER" }), "ar");
  const text = result.lines.join(" | ");
  assert.match(text, /بوتوكس/);
  assert.match(text, /الوجه والرقبة/);
  assert.match(text, /نعم/);
  assert.match(text, /لا أتذكر/);
  assert.doesNotMatch(text, /AP_BOTOX|FACE_NECK|DONT_REMEMBER/);
});

test("physician English presentation localizes the same nested structured codes in English", () => {
  const result = presentClinicalValue(question({ procedure: "AP_BODY_CONTOURING", goal: "SLIM", prior: "NO" }), "en");
  const text = result.lines.join(" | ");
  assert.match(text, /Body contouring or body-improvement procedures/);
  assert.match(text, /Slim body areas/);
  assert.match(text, /No/);
  assert.doesNotMatch(text, /AP_BODY_CONTOURING|SLIM/);
});

test("nested symptom, frequency, and post-wash enums have exhaustive bilingual presentation mappings", () => {
  const structuredCases = [
    ["pattern", "INTERMITTENT", "يأتي ويذهب", "Comes and goes"],
    ["pattern", "PERSISTENT", "مستمر", "Persistent"],
    ["frequency", "WEEKLY", "أسبوعيًا", "Weekly"],
    ["step", "CONDITIONING", "التكييف (بلسم أو ماسك)", "Conditioning (conditioner or mask)"],
  ] as const;

  for (const [field, token, arLabel, enLabel] of structuredCases) {
    const ar = presentClinicalValue(question({ [field]: token }), "ar");
    const en = presentClinicalValue(question({ [field]: token }), "en");
    assert.match(ar.lines.join(" | "), new RegExp(arLabel.replace(/[()]/g, "\\$&")));
    assert.match(en.lines.join(" | "), new RegExp(enLabel.replace(/[()]/g, "\\$&")));
    assert.doesNotMatch(ar.lines.join(" | "), new RegExp(`\\b${token}\\b`));
    assert.doesNotMatch(en.lines.join(" | "), new RegExp(`\\b${token}\\b`));
    assert.deepEqual(ar.auditSignals, []);
    assert.deepEqual(en.auditSignals, []);
  }
});

test("unknown nested structured enums render a localized safe state and PHI-free audit signal", () => {
  const ar = presentClinicalValue(question({ pattern: "UNMAPPED_PATTERN_TOKEN" }), "ar");
  const en = presentClinicalValue(question({ pattern: "UNMAPPED_PATTERN_TOKEN" }), "en");
  assert.deepEqual(ar.lines, ["النمط: قيمة منظمة غير متاحة للعرض"]);
  assert.deepEqual(en.lines, ["Pattern: Structured value unavailable for display"]);
  assert.deepEqual(en.auditSignals, [{
    code: "MISSING_STRUCTURED_LABEL",
    questionCode: "Q_AESTHETIC_DETAILS",
    fieldPath: "[0].pattern",
  }]);
  assert.equal(JSON.stringify(en.auditSignals).includes("UNMAPPED_PATTERN_TOKEN"), false);
});

test("question-aware field semantics preserve Laser goal prose while Aesthetic goal remains structured", () => {
  const laserQuestion = question({ goal: "PATIENT_ENTERED_LASER_GOAL" });
  laserQuestion.code = "Q_LASER_CONCERN_DETAILS";
  const laser = presentClinicalValue(laserQuestion, "en");
  assert.match(laser.lines.join(" | "), /PATIENT_ENTERED_LASER_GOAL/);
  assert.deepEqual(laser.auditSignals, []);

  const aesthetic = presentClinicalValue(question({ goal: "UNMAPPED_AESTHETIC_GOAL" }), "en");
  assert.doesNotMatch(aesthetic.lines.join(" | "), /UNMAPPED_AESTHETIC_GOAL/);
  assert.equal(aesthetic.auditSignals[0]?.fieldPath, "[0].goal");
});
