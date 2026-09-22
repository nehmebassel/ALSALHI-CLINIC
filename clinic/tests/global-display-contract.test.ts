import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildClinicalStory, buildClinicalStorySummary } from "../lib/physician/clinical-story";
import { diagnosisFrom } from "../lib/physician/read-model";
import { isRawDisplayToken, presentPatientReviewAnswer } from "../lib/presentation/display-contract";
import type { PhysicianInterviewQuestion } from "../lib/physician/types";

const patientJourney = fs.readFileSync(new URL("../app/patient/patient-journey.tsx", import.meta.url), "utf8");
const physicianWorkspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
const physicianDashboard = fs.readFileSync(new URL("../app/physician/physician-dashboard.tsx", import.meta.url), "utf8");

function question(overrides: Partial<PhysicianInterviewQuestion>): PhysicianInterviewQuestion {
  return {
    id: "official-response-1",
    responseId: "response-1",
    code: "Q_HAIR_CONCERN",
    text: { ar: "الشكوى", en: "Concern" },
    library: { ar: "الشعر", en: "Hair" },
    group: { ar: "الشكوى الحالية", en: "Current concern" },
    responseType: "SINGLE_SELECT",
    responseScopeType: "VISIT",
    responseScopeKey: "VISIT",
    currentSource: "PATIENT",
    value: "BOTH",
    repeatableItems: [],
    options: [{ code: "BOTH", ar: "تساقط وترقق / نقص كثافة", en: "Shedding and thinning / reduced density" }],
    editableByPhysician: true,
    ...overrides,
  };
}

test("manual runtime-style patient review maps demographics, reason, and concern without raw codes", () => {
  const fixture = [
    { code: "Q_IDENTITY_SEX", responseType: "SINGLE_SELECT", value: "FEMALE", options: [{ code: "FEMALE", label: "أنثى" }] },
    { code: "Q_IDENTITY_MARITAL", responseType: "SINGLE_SELECT", value: "NOT_MARRIED", options: [{ code: "NOT_MARRIED", label: "غير متزوجة" }] },
    { code: "Q_VISIT_PRIMARY_REASON", responseType: "SINGLE_SELECT", value: "RV_HAIR_LOSS", options: [{ code: "RV_HAIR_LOSS", label: "تساقط الشعر" }] },
    { code: "Q_HAIR_CONCERN", responseType: "SINGLE_SELECT", value: "BOTH", options: [{ code: "BOTH", label: "تساقط وترقق / نقص كثافة" }] },
  ];
  const rendered = fixture.map((item) => presentPatientReviewAnswer(item, "ar"));
  assert.deepEqual(rendered, ["أنثى", "غير متزوجة", "تساقط الشعر", "تساقط وترقق / نقص كثافة"]);
  for (const raw of ["FEMALE", "NOT_MARRIED", "RV_HAIR_LOSS", "BOTH"]) {
    assert.equal(rendered.some((value) => value === raw), false);
    assert.equal(isRawDisplayToken(raw), true);
  }
});

test("patient review preserves authored free text but fails closed for unmapped structured values", () => {
  assert.equal(presentPatientReviewAnswer({ code: "Q_FREE", responseType: "TEXT", value: "Lower abdomen", options: [] }, "ar"), "Lower abdomen");
  assert.equal(presentPatientReviewAnswer({ code: "Q_STRUCTURED", responseType: "SINGLE_SELECT", value: "UNMAPPED_ENUM_VALUE", options: [] }, "ar"), "قيمة منظمة غير متاحة للعرض");
});

test("normal patient submit success contains no identifiers or internal statuses", () => {
  const successBlock = patientJourney.slice(patientJourney.indexOf("if (submitted)"), patientJourney.indexOf("if (!payload || !evaluation)"));
  for (const forbidden of ["submitted.visitId", "submitted.clinicalInterviewId", "Visit ID", "Interview ID", "UNDER_REVIEW", "READ ONLY", "READ_ONLY"]) {
    assert.equal(successBlock.includes(forbidden), false, forbidden);
  }
  assert.equal(successBlock.includes("The interview is ready for physician review."), true);
  assert.equal(successBlock.includes("يمكن إغلاق الصفحة أو انتظار تعليمات الفريق."), true);
});

test("Clinical Story renders only supplied official items and clinically phrases meaningful negatives", () => {
  const recorded = [
    question({}),
    question({ id: "health-response", responseId: "response-health", code: "Q_HEALTH_SNAPSHOT", value: ["NONE"], options: [{ code: "NONE", ar: "لا يوجد شيء مما سبق", en: "None of the above" }] }),
    question({ id: "trigger-response", responseId: "response-trigger", code: "Q_TRIGGER_EVENTS", value: ["NONE"], options: [{ code: "NONE", ar: "لا يوجد شيء مما سبق", en: "None of the above" }] }),
    question({
      id: "aesthetic-response",
      responseId: "response-aesthetic",
      code: "Q_AESTHETIC_DETAILS",
      responseType: "LONG_TEXT",
      value: { procedure: "AP_BODY_CONTOURING", areaText: "Lower abdomen", goal: "SLIM", prior: "NO", desiredResult: "Improve contour exactly as entered." },
      repeatableItems: [],
      options: [],
    }),
  ];
  const sections = buildClinicalStory({
    initialQuestions: recorded,
    currentQuestions: [],
    effectiveQuestions: recorded,
  });
  const rendered = JSON.stringify(sections);
  assert.match(rendered, /لا توجد حالات صحية من القائمة مسجلة/);
  assert.match(rendered, /لا توجد أحداث محفزة من القائمة مسجلة/);
  assert.match(rendered, /لا يوجد إجراء سابق مسجل لهذا الطلب/);
  assert.match(rendered, /Improve contour exactly as entered\./);
  assert.doesNotMatch(rendered, /إجراء سابق: لا|Prior treatment: No/);
  assert.doesNotMatch(rendered, /لا يوجد شيء مما سبق|None of the above/);
  const questionItems = sections.flatMap((section) => section.groups.flatMap((group) => group.items)).filter((item) => !item.id.startsWith("visit:") && !item.id.startsWith("follow-up:"));
  assert.ok(questionItems.every((item) => item.sourceRefs.every((source) => source.questionIds.length > 0)));
});

test("Clinical Story top summary is concise case-level history and contains only supplied recorded facts", () => {
  const sections = buildClinicalStory({
    initialQuestions: [question({ value: "BOTH" })],
    currentQuestions: [],
    effectiveQuestions: [question({ value: "BOTH" })],
  });
  const summary = buildClinicalStorySummary({
    patientContext: { ar: "مراجعة، ٣٢ سنة", en: "Female patient, 32 years" },
    visitReason: { ar: "تساقط الشعر", en: "Hair loss" },
    sections,
  });
  assert.match(summary.map((line) => line.ar).join("\n"), /مراجعة، ٣٢ سنة يراجع بسبب تساقط الشعر/);
  assert.match(summary.map((line) => line.en).join("\n"), /Female patient, 32 years presents for Hair loss/);
  assert.doesNotMatch(JSON.stringify(summary), /patient reported|For current hair state|ذكر المراجع|وبحسب/);
  assert.doesNotMatch(JSON.stringify(summary), /diagnos/i);
});

test("Clinical Story statements disappear with their source and change only when the source changes", () => {
  const original = question({ id: "source-one", value: "BOTH" });
  const changed = question({ id: "source-one", value: "SHEDDING", options: [{ code: "SHEDDING", ar: "تساقط", en: "Shedding" }] });
  const originalStory = buildClinicalStory({ initialQuestions: [original], currentQuestions: [], effectiveQuestions: [original] });
  const changedStory = buildClinicalStory({ initialQuestions: [changed], currentQuestions: [], effectiveQuestions: [changed] });
  const removedStory = buildClinicalStory({ initialQuestions: [], currentQuestions: [], effectiveQuestions: [] });
  const originalItem = originalStory.flatMap((section) => section.groups.flatMap((group) => group.items))[0];
  const changedItem = changedStory.flatMap((section) => section.groups.flatMap((group) => group.items))[0];
  assert.ok(originalItem?.sourceRefs[0]?.questionIds.includes("source-one"));
  assert.notDeepEqual(originalItem?.entries, changedItem?.entries);
  assert.deepEqual(removedStory, []);
  assert.ok(originalStory.flatMap((section) => section.groups.flatMap((group) => group.items)).every((item) => item.sourceRefs.length > 0 && item.entries.length > 0));
});

test("diagnosis presentation accepts recorded diagnoses and rejects consultation/service context", () => {
  assert.deepEqual(diagnosisFrom({ diagnosisAr: "الثعلبة البقعية", diagnosisEn: "Alopecia areata" }), { ar: "الثعلبة البقعية", en: "Alopecia areata" });
  assert.equal(diagnosisFrom({ diagnosisAr: "استشارة تنسيق قوام مع ليزر إضافي", diagnosisEn: "Body-contouring consultation with laser review" }), undefined);
  assert.equal(diagnosisFrom({}), undefined);
});

test("physician summary and visit cards hide absent diagnosis rows instead of dash placeholders", () => {
  assert.equal(physicianWorkspace.includes('visit.diagnosis ? pickLocalized(visit.diagnosis, locale) : "—"'), false);
  assert.equal(physicianWorkspace.includes('data.caseSummary.latestDiagnosis ? pickLocalized(data.caseSummary.latestDiagnosis, locale) :'), false);
  assert.equal(physicianDashboard.includes('item.latestDiagnosis ? pickLocalized(item.latestDiagnosis, locale) :'), false);
  assert.equal(physicianWorkspace.includes("clinicalStorySummary.map"), true);
});
