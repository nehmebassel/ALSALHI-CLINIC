import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildPhysicianCaseSummary } from "../lib/physician/case-summary";
import { buildClinicalStory, buildClinicalStorySummary } from "../lib/physician/clinical-story";
import { buildPhysicianFollowUpSections, mergeInterviewQuestions } from "../lib/physician/follow-up-presentation";
import { ageAt, buildStructuredLabelCatalog, presentClinicalValue } from "../lib/physician/presentation";
import type { PhysicianInterviewQuestion, PhysicianVisitSummary } from "../lib/physician/types";

const dashboard = fs.readFileSync(new URL("../app/physician/physician-dashboard.tsx", import.meta.url), "utf8");
const patientPage = fs.readFileSync(new URL("../app/physician/patients/[patientId]/page.tsx", import.meta.url), "utf8");
const workspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
const readModel = fs.readFileSync(new URL("../lib/physician/read-model.ts", import.meta.url), "utf8");

function question(overrides: Partial<PhysicianInterviewQuestion> = {}): PhysicianInterviewQuestion {
  return {
    id: "q1",
    code: "Q_TEST",
    text: { ar: "اختبار", en: "Test" },
    library: { ar: "مكتبة", en: "Library" },
    group: { ar: "مجموعة", en: "Group" },
    responseType: "SINGLE_SELECT",
    responseScopeType: "VISIT",
    responseScopeKey: "VISIT",
    currentSource: "PATIENT",
    value: "PATTERN",
    repeatableItems: [],
    options: [{ code: "PATTERN", ar: "تساقط الشعر النمطي (الوراثي)", en: "Pattern Hair Loss (Androgenetic Alopecia)" }],
    editableByPhysician: true,
    ...overrides,
  };
}

function initialStory(questions: PhysicianInterviewQuestion[]) {
  return buildClinicalStory({
    initialQuestions: questions,
    currentQuestions: questions,
    effectiveQuestions: questions,
  });
}

function storyItems(sections: ReturnType<typeof buildClinicalStory>) {
  return sections.flatMap((section) => section.groups.flatMap((group) => group.items));
}

function storyValues(sections: ReturnType<typeof buildClinicalStory>) {
  return storyItems(sections).flatMap((item) => item.entries.flatMap((entry) => entry.values));
}

function summaryVisit(primaryCode: string, primary: { ar: string; en: string }): PhysicianVisitSummary {
  return {
    id: "visit-summary",
    createdAt: "2026-09-07T09:00:00.000Z",
    visitType: "INITIAL",
    visitStatus: "CREATED",
    interviewId: "interview-summary",
    interviewStatus: "UNDER_REVIEW",
    patientReviewState: "PENDING",
    primaryCode,
    primary,
    additional: [],
    hasFollowUpDelta: false,
  };
}

function clinicalSnapshot(questions: PhysicianInterviewQuestion[], visit: PhysicianVisitSummary) {
  return buildPhysicianCaseSummary({
    questions,
    reviewVisit: visit,
    measurementSeries: [],
    historyApproved: false,
    hairHistoryApplicable: visit.primaryCode === "RV_HAIR_LOSS",
    physicianJourneyApplicable: visit.primaryCode === "RV_HAIR_LOSS",
  });
}

test("physician structured values render in the physician-selected language without translation API", () => {
  assert.deepEqual(presentClinicalValue(question(), "en"), {
    lines: ["Pattern Hair Loss (Androgenetic Alopecia)"],
    hasUntranslatedFreeText: false,
    auditSignals: [],
  });
  assert.deepEqual(presentClinicalValue(question(), "ar"), {
    lines: ["تساقط الشعر النمطي (الوراثي)"],
    hasUntranslatedFreeText: false,
    auditSignals: [],
  });
});

test("physician presentation never falls back to raw internal structured codes", () => {
  assert.deepEqual(presentClinicalValue(question({ value: "AP_BOTOX", options: [] }), "ar").lines, ["بوتوكس"]);
  assert.deepEqual(presentClinicalValue(question({ value: "FACE_NECK", options: [] }), "en").lines, ["Face and neck"]);
  const missing = presentClinicalValue(question({ value: "RV_UNMAPPED_INTERNAL", options: [] }), "en");
  assert.deepEqual(missing.lines, ["Structured value unavailable for display"]);
  assert.deepEqual(missing.auditSignals, [{
    code: "MISSING_STRUCTURED_LABEL",
    questionCode: "Q_TEST",
    fieldPath: "$value",
  }]);
  assert.equal(JSON.stringify(missing.auditSignals).includes("RV_UNMAPPED_INTERNAL"), false);
});

test("nested repeatable values use the published option label catalog instead of raw codes", () => {
  const trigger = question({
    id: "trigger-parent",
    code: "Q_TRIGGER_EVENTS",
    value: ["SEVERE_STRESS"],
    options: [{ code: "SEVERE_STRESS", ar: "ضغط نفسي شديد", en: "Severe psychological stress" }],
  });
  const detail = question({
    id: "trigger-detail",
    code: "Q_TRIGGER_EVENT_DETAILS",
    value: [],
    repeatableItems: [{ event: "SEVERE_STRESS", date: { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2021, month: 4, normalizedGregorian: { year: 2021, month: 4 } } }],
    options: [],
  });
  const catalog = buildStructuredLabelCatalog([trigger, detail]);
  const ar = presentClinicalValue(detail, "ar", catalog).lines.join(" | ");
  const en = presentClinicalValue(detail, "en", catalog).lines.join(" | ");
  assert.equal(ar.includes("SEVERE_STRESS"), false);
  assert.equal(ar.includes("ضغط نفسي شديد"), true);
  assert.equal(en.includes("SEVERE_STRESS"), false);
  assert.equal(en.includes("Severe psychological stress"), true);
});

test("physician Arabic structured presentation never exposes unknown implementation keys and localizes numbers", () => {
  const result = presentClinicalValue(question({
    value: { unknownInternalField: "قيمة سريرية", severity: 4 },
    options: [],
  }), "ar");
  const text = result.lines.join(" | ");
  assert.equal(text.includes("unknownInternalField"), false);
  assert.equal(text.includes("unknown Internal Field"), false);
  assert.equal(text.includes("قيمة سريرية"), true);
  assert.equal(text.includes("الشدة: ٤"), true);
});

test("physician English view preserves Arabic free text and marks it as untranslated", () => {
  const result = presentClinicalValue(question({ responseType: "TEXT", value: "بدأ التساقط بعد تغيير العمل", options: [] }), "en");
  assert.deepEqual(result.lines, ["بدأ التساقط بعد تغيير العمل"]);
  assert.equal(result.hasUntranslatedFreeText, true);
  assert.deepEqual(result.auditSignals, []);
});

test("patient-entered free text remains exact even when it resembles an enum token", () => {
  const topLevel = presentClinicalValue(question({
    responseType: "TEXT",
    value: "PATIENT_FREE_TEXT",
    options: [],
  }), "en");
  assert.deepEqual(topLevel.lines, ["PATIENT_FREE_TEXT"]);
  assert.deepEqual(topLevel.auditSignals, []);

  const nested = presentClinicalValue(question({
    responseType: "LONG_TEXT",
    value: [],
    repeatableItems: [{ details: "PATIENT_ENTERED_DETAIL" }],
    options: [],
  }), "en");
  assert.deepEqual(nested.lines, ["Details: PATIENT_ENTERED_DETAIL"]);
  assert.deepEqual(nested.auditSignals, []);
});

test("unknown follow-up enums use a localized safe value and emit only PHI-free audit context", () => {
  const signals: Array<{ code: string; questionCode: string; fieldPath: string }> = [];
  const sections = buildPhysicianFollowUpSections({
    laser: {
      response: "UNMAPPED_RESPONSE_TOKEN",
    },
  }, (signal) => signals.push(signal));
  const response = sections.flatMap((section) => section.facts).find((fact) => fact.id === "follow-up:laser:response");
  assert.deepEqual(response?.values, [{
    ar: "قيمة منظمة غير متاحة للعرض",
    en: "Structured value unavailable for display",
  }]);
  assert.deepEqual(signals, [{
    code: "MISSING_STRUCTURED_LABEL",
    questionCode: "FOLLOW_UP_DELTA",
    fieldPath: "laser.response",
  }]);
  assert.equal(JSON.stringify(signals).includes("UNMAPPED_RESPONSE_TOKEN"), false);
});


test("physician presentation strips internal fixture ids and raw synthetic metadata", () => {
  const result = presentClinicalValue(question({
    value: { id: "SYN-Q-123", synthetic: true, notes: "Synthetic detail for Q_TEST", clinical: "قيمة سريرية" },
    options: [],
  }), "ar");
  assert.equal(result.lines.some((line) => line.includes("SYN-Q")), false);
  assert.equal(result.lines.some((line) => line.includes("synthetic")), false);
  assert.equal(result.lines.some((line) => line.includes("قيمة سريرية")), true);
});

test("age is derived from DOB at the clinical reference date", () => {
  assert.equal(ageAt("1987-03-12T00:00:00.000Z", "2026-03-11T12:00:00.000Z"), 38);
  assert.equal(ageAt("1987-03-12T00:00:00.000Z", "2026-03-12T12:00:00.000Z"), 39);
});

test("physician dashboard opens a scoped patient record instead of a disabled placeholder", () => {
  assert.equal(dashboard.includes("/physician/patients/${item.patientId}"), true);
  assert.equal(dashboard.includes("disabled title"), false);
  assert.equal(dashboard.includes("Search name, MRN, or diagnosis"), true);
});

test("physician dashboard filters by visit type and reflects approved Initial Hair History without a stale review badge", () => {
  assert.equal(dashboard.includes('type QueueFilter = "INITIAL" | "FOLLOW_UP" | "ALL"'), true);
  assert.equal(dashboard.includes('useState<QueueFilter>("INITIAL")'), true);
  assert.equal(dashboard.includes('["INITIAL", isAr ? "زيارة أولية" : "Initial visit"]'), true);
  assert.equal(dashboard.includes('["FOLLOW_UP", isAr ? "متابعة" : "Follow-up"]'), true);
  assert.equal(dashboard.includes('["REVIEW"'), false);
  assert.equal(dashboard.includes('item.latestHairHistoryApproved'), true);
  assert.equal(dashboard.includes('"تاريخ المراجع معتمد"'), true);
  assert.equal(readModel.includes('isPhysicianQueueReviewPending'), true);
  assert.equal(readModel.includes('approvedHairHistory: { select: { approvedVisitId: true, revision: true } }'), true);
});

test("physician Summary omits the redundant patient and physician measure layer", () => {
  assert.equal(workspace.includes("physician-measures-summary"), false);
  assert.equal(workspace.includes("Available measures"), false);
  assert.equal(workspace.includes("No numeric measures are available"), false);
  assert.equal(workspace.includes('<span>/5</span>'), false);
});

test("Clinical Snapshot derives Hair Quality concern from the patient's current problems and omits an unavailable onset", () => {
  const summary = clinicalSnapshot([
    question({ code: "Q_HQ_CURRENT_PROBLEMS", value: ["DRYNESS", "BREAKAGE"], responseType: "MULTI_SELECT", options: [
      { code: "DRYNESS", ar: "جفاف", en: "Dryness" },
      { code: "BREAKAGE", ar: "تكسر", en: "Breakage" },
    ] }),
    question({ code: "Q_HQ_HAIR_STATE", value: "VIRGIN", options: [{ code: "VIRGIN", ar: "شعر بكر", en: "Virgin hair" }] }),
    question({ code: "Q_PROFILE_MARITAL_STATUS", value: "NOT_MARRIED", options: [{ code: "NOT_MARRIED", ar: "غير متزوج/ة", en: "Not married" }] }),
    question({ code: "Q_PREGNANCY_BREASTFEEDING_STATUS", value: "NO", options: [{ code: "NO", ar: "لا", en: "No" }] }),
  ], summaryVisit("RV_HAIR_QUALITY", { ar: "جودة الشعر", en: "Hair Quality" }));

  assert.deepEqual(summary.mainConcern, [{ ar: "جفاف", en: "Dryness" }, { ar: "تكسر", en: "Breakage" }]);
  assert.equal(summary.mainConcern.some((value) => value.en === "Virgin hair"), false);
  assert.deepEqual(summary.problemOnset, []);
  assert.deepEqual(summary.importantContext.map((item) => item.code), ["MARITAL_SOCIAL_STATUS", "PREGNANCY_BREASTFEEDING_CONTEXT"]);
});

test("Clinical Snapshot uses only recorded Hair Loss onset and separates current from previous therapies", () => {
  const date = (year: number, month: number) => ({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year, month, normalizedGregorian: { year, month } });
  const summary = clinicalSnapshot([
    question({ code: "Q_HAIR_CONCERN", value: "BOTH", options: [{ code: "BOTH", ar: "كلاهما بنفس الدرجة", en: "Both to the same degree" }] }),
    question({ code: "Q_HAIR_SHEDDING_ONSET", value: date(2025, 1), responseType: "MONTH_YEAR", options: [] }),
    question({ code: "Q_HAIR_THINNING_ONSET", value: date(2025, 3), responseType: "MONTH_YEAR", options: [] }),
    question({ code: "Q_HEALTH_MEDICATION_ITEMS", value: [], responseType: "LONG_TEXT", repeatableItems: [{ name: "Metformin" }] }),
    question({ code: "Q_HEALTH_ALLERGY_ITEMS", value: [], responseType: "LONG_TEXT", repeatableItems: [{ name: "Penicillin" }] }),
    question({ code: "Q_HAIR_TREATMENT_ITEMS", value: [], responseType: "LONG_TEXT", repeatableItems: [
      { name: "Topical minoxidil", stillUsing: "YES" },
      { name: "Prior supplement", stillUsing: "NO" },
    ] }),
  ], summaryVisit("RV_HAIR_LOSS", { ar: "تساقط الشعر", en: "Hair Loss" }));

  assert.deepEqual(summary.mainConcern, [{ ar: "كلاهما بنفس الدرجة", en: "Both to the same degree" }]);
  assert.equal(summary.problemOnset.length, 2);
  assert.match(summary.problemOnset[0].en, /^Shedding: .*2025/);
  assert.match(summary.problemOnset[1].en, /^Thinning: .*2025/);
  assert.deepEqual(summary.importantContext.find((item) => item.code === "CURRENT_MEDICATIONS")?.values, [{ ar: "Metformin", en: "Metformin" }]);
  assert.deepEqual(summary.importantContext.find((item) => item.code === "ALLERGIES")?.values, [{ ar: "Penicillin", en: "Penicillin" }]);
  assert.deepEqual(summary.importantContext.find((item) => item.code === "CURRENT_HAIR_THERAPIES")?.values, [{ ar: "Topical minoxidil", en: "Topical minoxidil" }]);
  assert.deepEqual(summary.importantContext.find((item) => item.code === "PREVIOUS_HAIR_THERAPIES")?.values, [{ ar: "Prior supplement", en: "Prior supplement" }]);
});

test("Clinical Snapshot never substitutes the Visit reason for an absent patient concern", () => {
  const summary = clinicalSnapshot([], summaryVisit("RV_HAIR_LOSS", { ar: "تساقط الشعر", en: "Hair Loss" }));
  assert.deepEqual(summary.mainConcern, []);
  assert.deepEqual(summary.currentConcern, [{ ar: "تساقط الشعر", en: "Hair Loss" }]);
});

test("Clinical Snapshot is compact, hides count sidebars, and offers only Clinical Story before review", () => {
  const start = workspace.indexOf('{activeTab === "SUMMARY" && (');
  const end = workspace.indexOf('{activeTab === "STORY" && (');
  const summaryBlock = workspace.slice(start, end);
  for (const label of ["Visit reason", "Main concern", "Problem onset", "Important patient context", "Open Clinical Story", "Review Clinical Story"]) assert.ok(summaryBlock.includes(label), label);
  for (const forbidden of ["Start Physician Visit", "Patient reported", "Available measures", "Items to review"]) assert.equal(summaryBlock.includes(forbidden), false, forbidden);
  assert.ok(workspace.includes('activeTab !== "HISTORY" && activeTab !== "SUMMARY"'));
});

test("physician patient route enforces physician authentication and clinic-scoped read model", () => {
  assert.equal(patientPage.includes('requirePageActor("PHYSICIAN")'), true);
  assert.equal(patientPage.includes("actor.clinicScopeId"), true);
  assert.equal(readModel.includes("externalIdentifiers: { some: { clinicScopeId } }"), true);
});

test("physician workspace keeps Full Interview as a secondary Clinical Story reference, not a primary tab", () => {
  assert.equal(workspace.includes('type WorkspaceTab = "SUMMARY" | "STORY" | "HISTORY" | "JOURNEY" | "VISITS"'), true);
  assert.equal(workspace.includes('{ value: "SUMMARY", label: isAr ? "الملخص" : "Summary" }'), true);
  assert.equal(workspace.includes('{ value: "STORY", label: isAr ? "القصة السريرية" : "Clinical Story" }'), true);
  assert.equal(workspace.includes('{ value: "HISTORY", label: isAr ? "تاريخ المراجع" : "Patient Hair History"'), true);
  assert.equal(workspace.includes('{ value: "JOURNEY", label: isAr ? "مسار الشعر الطبي" : "Physician Hair Journey"'), true);
  assert.equal(workspace.includes('{ value: "VISITS", label: isAr ? "الزيارات" : "Visits" }'), true);
  assert.equal(workspace.includes('return items.filter((item) => !item.hidden)'), true);
  assert.equal(workspace.includes("aria-disabled={disabled}"), false);
  assert.equal(workspace.includes('["INTERVIEW"'), false);
  assert.equal(workspace.includes('tab === "INTERVIEW"'), false);
  assert.equal(workspace.includes('isAr ? "عرض المقابلة الكاملة" : "View full interview"'), true);
  assert.equal(workspace.includes('fullInterviewOpen && ('), true);
  assert.equal(workspace.includes('isAr ? "المقابلة الكاملة كما أدخلها المراجع" : "Full interview as entered by the patient"'), true);
  assert.equal(workspace.includes('<InterviewQuestionGroups groups={currentQuestionGroups} locale={locale} />'), true);
  assert.equal(workspace.includes('<InterviewQuestionGroups groups={initialQuestionGroups} locale={locale} />'), true);
  assert.equal(workspace.includes('data.followUpSections.map((section) => ('), true);
  assert.equal(workspace.includes('{question.code}'), false);
  assert.equal(workspace.includes('SYN-Q'), false);
  assert.equal(workspace.includes("The case in one clinical scan"), true);
  assert.equal(workspace.includes("Source: patient"), false);
  assert.equal(workspace.includes("source record"), false);
  assert.equal(workspace.includes("مفهوم واحد"), false);
  assert.equal(workspace.includes("سجل مصدر واحد"), false);
  assert.equal(workspace.includes('isAr ? "عرض المصدر" : "View source"'), true);
  assert.equal(workspace.includes("A structured case view — not a replay of the questionnaire"), false);
});



test("Clinical Story source opens only the contributing interview section instead of jumping to Full Interview", () => {
  assert.equal(workspace.includes('const [openStorySourceCode, setOpenStorySourceCode]'), true);
  assert.equal(workspace.includes('buildStorySectionSourceBundles(section, sourceQuestionById)'), true);
  assert.equal(workspace.includes('.map((questionId) => questionById.get(questionId))'), true);
  assert.equal(workspace.includes('Section source — ${pickLocalized(section.title, locale)}'), true);
  assert.equal(workspace.includes('مصدر هذا القسم — ${pickLocalized(section.title, locale)}'), true);
  assert.equal(workspace.includes('<InterviewQuestionGroups groups={groupInterviewQuestions(bundle.questions, locale)} locale={locale} embedded />'), true);
  assert.equal(workspace.includes('onClick={() => setFullInterviewOpen(true)}'), false);
  assert.equal(workspace.includes('physician-story-provenance'), false);
});

test("physician-facing interview does not expose internal question codes or synthetic fixture identifiers", () => {
  assert.equal(workspace.includes("{question.code}"), false);
  assert.equal(workspace.includes("SYN-Q"), false);
});

test("physician UI does not surface implementation/debug instructions as product copy", () => {
  for (const forbidden of [
    "deterministically derived",
    "deterministic summary",
    "ملخص حتمي",
    "replay of the questionnaire",
    "unexpected data state",
    "record should be inspected",
    "Patient Hair History points are not imported",
    "proof of extraction",
    "قبل أول خط أساس للطبيب",
    "سجل مستقل يبدأ من الطبيب",
    "القياسات والأحداث المسجلة من خط أساس الطبيب فصاعدًا",
    "المقاييس تبقى ظاهرة",
    "Only numeric measures use the 0–5 axis",
    "Numeric points can be dragged vertically only",
  ]) {
    assert.equal(workspace.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

test("Clinical Story preserves approved section structure and exact provenance", () => {
  const questions = [
    question({ id: "hair", code: "Q_HAIR_CONCERN", value: "PATTERN" }),
    question({ id: "health", code: "Q_HEALTH_SNAPSHOT", value: ["NONE"], options: [{ code: "NONE", ar: "لا شيء", en: "None" }] }),
    question({ id: "privacy", code: "Q_PRIVACY_CONSENT", value: "YES" }),
  ];
  const sections = initialStory(questions);
  assert.deepEqual(sections.map((section) => section.code), ["HEALTH_SNAPSHOT", "HAIR_LOSS"]);
  assert.deepEqual(sections.map((section) => section.title.en), ["General Health", "Hair Loss"]);
  const ids = storyItems(sections).flatMap((item) => item.sourceRefs.flatMap((source) => source.questionIds));
  assert.deepEqual(ids.sort(), ["hair", "health"]);
  assert.equal(ids.includes("privacy"), false);
  assert.equal(JSON.stringify(sections).includes("No listed health conditions are recorded"), true);
});

test("Clinical Story groups repeated labels without answer loss and renders each source exactly once", () => {
  const sections = initialStory([
    question({ id: "evidence-1", code: "Q_HAIR_EVIDENCE", value: ["ONE"], options: [{ code: "ONE", ar: "ملاحظة أولى", en: "First observation" }] }),
    question({ id: "evidence-2", code: "Q_HAIR_EVIDENCE", value: ["TWO"], options: [{ code: "TWO", ar: "ملاحظة ثانية", en: "Second observation" }] }),
  ]);
  const items = storyItems(sections);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].entries.flatMap((entry) => entry.values.map((value) => value.en)), ["First observation", "Second observation"]);
  assert.deepEqual(items[0].sourceRefs, [{ actor: "PATIENT", questionIds: ["evidence-1", "evidence-2"] }]);
});

test("Clinical Story merges parent/detail sources while retaining every distinct clinical value", () => {
  const sections = initialStory([
    question({ id: "trigger-parent", code: "Q_TRIGGER_EVENTS", value: ["SEVERE_STRESS"], options: [{ code: "SEVERE_STRESS", ar: "ضغط نفسي شديد", en: "Severe psychological stress" }] }),
    question({ id: "trigger-detail", code: "Q_TRIGGER_EVENT_DETAILS", value: [], repeatableItems: [{ event: "SEVERE_STRESS", details: "بعد الانتقال", date: { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2021, month: 4, normalizedGregorian: { year: 2021, month: 4 } } }], options: [] }),
  ]);
  const items = storyItems(sections);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].sourceRefs[0].questionIds, ["trigger-parent", "trigger-detail"]);
  const rendered = JSON.stringify(items[0]);
  assert.equal(rendered.includes("SEVERE_STRESS"), false);
  assert.equal(rendered.includes("Severe psychological stress"), true);
  assert.equal(rendered.includes("بعد الانتقال"), true);
});

test("Clinical Story keeps all dense values visible and measures structured", () => {
  const options = Array.from({ length: 7 }, (_, index) => ({ code: `AREA_${index}`, ar: `موضع ${index + 1}`, en: `Area ${index + 1}` }));
  const sections = initialStory([
    question({ id: "distribution", code: "Q_HAIR_THINNING_AREAS", value: options.map((option) => option.code), options }),
    question({ id: "severity", code: "Q_HAIR_DENSITY_SEVERITY", responseType: "SCALE", value: 4, options: [] }),
  ]);
  assert.deepEqual(storyValues(sections).filter((value) => value.en.startsWith("Area ")).map((value) => value.en), options.map((option) => option.en));
  const measure = storyItems(sections).flatMap((item) => item.entries).find((entry) => entry.valueType === "MEASURE");
  assert.deepEqual(measure?.values, [{ ar: "٤ من ٥", en: "4 of 5" }]);
});

test("Clinical Story Women's Health organizes every recorded answer under clinical subgroups", () => {
  const sections = initialStory([
    question({ id: "women", code: "Q_WOMENS_HEALTH", value: ["IRREGULAR", "ACNE"], options: [{ code: "IRREGULAR", ar: "عدم انتظام الدورة", en: "Menstrual irregularity" }, { code: "ACNE", ar: "حب الشباب", en: "Acne" }] }),
    question({ id: "interval", code: "Q_WOMEN_IRREGULAR_INTERVAL", responseType: "TEXT", value: "Every 45–60 days", options: [] }),
    question({ id: "acne", code: "Q_WOMEN_ACNE_PATTERN", value: "CYCLICAL", options: [{ code: "CYCLICAL", ar: "دوري", en: "Cyclical" }] }),
    question({ id: "fertility", code: "Q_WOMEN_FERTILITY_STATUS", value: "DIFFICULT", options: [{ code: "DIFFICULT", ar: "توجد صعوبة", en: "Difficulty conceiving" }] }),
  ]);
  const women = sections.find((section) => section.code === "WOMENS_HEALTH");
  assert.deepEqual(women?.groups.map((group) => group.id), ["menstrual", "androgen", "fertility"]);
  for (const value of ["Menstrual irregularity", "Acne", "Every 45–60 days", "Cyclical", "Difficulty conceiving"]) assert.equal(JSON.stringify(women).includes(value), true, value);
});

test("Clinical Story preserves patient-entered free text exactly in both locales", () => {
  const entered = "بدأت البقعة بعد السفر — كما وصفها المراجع";
  const sections = initialStory([question({ id: "free-text", code: "Q_DERMATOLOGY_CONCERN", responseType: "TEXT", value: entered, options: [] })]);
  const entry = storyItems(sections)[0].entries[0];
  assert.deepEqual(entry.values, [{ ar: entered, en: entered }]);
  assert.equal(entry.patientAuthored, true);
  assert.equal(entry.valueType, "FREE_TEXT");
});

test("Clinical Story source removal removes only its derived statement", () => {
  const first = question({ id: "first", code: "Q_HAIR_CONCERN", value: "PATTERN" });
  const second = question({ id: "second", code: "Q_HAIR_EVIDENCE", value: ["PATTERN"] });
  const both = initialStory([first, second]);
  const removed = initialStory([first]);
  assert.equal(storyItems(both).length, 2);
  assert.equal(storyItems(removed).length, 1);
  assert.deepEqual(storyItems(removed)[0].sourceRefs[0].questionIds, ["first"]);
});

test("Clinical Story intro stays secondary and limited to one natural sentence", () => {
  const sections = initialStory([question({ id: "complaint", code: "Q_HAIR_CONCERN" })]);
  const paragraphs = buildClinicalStorySummary({ patientContext: { ar: "مراجع، ٤٢ سنة", en: "Male patient, 42 years" }, visitReason: { ar: "تساقط الشعر", en: "Hair loss" }, sections });
  assert.deepEqual(paragraphs, [{ ar: "مراجع، ٤٢ سنة يراجع بسبب تساقط الشعر.", en: "Male patient, 42 years presents for Hair loss." }]);
  assert.equal(JSON.stringify(paragraphs).includes("Pattern Hair Loss"), false);
});

test("Clinical Story distinguishes the initial baseline, prior follow-up, and current follow-up without copying them together", () => {
  const followUpVisit = {
    id: "follow-up-visit",
    createdAt: "2026-08-19T09:00:00.000Z",
    visitType: "FOLLOW_UP" as const,
    visitStatus: "COMPLETED" as const,
    interviewId: "follow-up-interview",
    interviewStatus: "COMPLETED" as const,
    primary: { ar: "جلدية", en: "Dermatology" },
    additional: [],
    episodeId: "episode-derm",
    hasFollowUpDelta: true,
  };
  const initial = question({
    id: "initial-derm",
    code: "Q_DERMATOLOGY_CONCERN",
    responseType: "TEXT",
    value: "Initial concern",
    options: [],
  });
  const initialVisit = {
    ...followUpVisit,
    id: "initial-visit",
    createdAt: "2026-06-19T09:00:00.000Z",
    visitType: "INITIAL" as const,
    interviewId: "initial-interview",
    hasFollowUpDelta: false,
  };
  const sections = buildClinicalStory({
    initialQuestions: [initial],
    currentQuestions: [],
    effectiveQuestions: [initial],
    reviewVisit: followUpVisit,
    initialVisit,
    followUpSections: [{
      code: "DERMATOLOGY",
      title: { ar: "تحديث المشكلة الجلدية", en: "Dermatology update" },
      facts: [
        {
          id: "prior-delta-change",
          label: { ar: "التغيير", en: "Change" },
          values: [{ ar: "بدأ التغيير سابقًا", en: "Change recorded previously" }],
          sourceVisitId: "follow-up-visit-1",
          sourceVisitAt: "2026-07-19T09:00:00.000Z",
        },
        {
          id: "current-delta-change",
          label: { ar: "التغيير", en: "Change" },
          values: [{ ar: "أصبحت الأعراض أقل تكرارًا", en: "Symptoms became less frequent" }],
          sourceVisitId: "follow-up-visit",
          sourceVisitAt: "2026-08-19T09:00:00.000Z",
        },
      ],
    }],
  });

  const currentConcern = sections.find((section) => section.code === "DERMATOLOGY");
  const followUpChange = sections.find((section) => section.code === "FOLLOW_UP_CHANGE");
  assert.ok(currentConcern);
  assert.ok(followUpChange);
  const baseline = currentConcern.groups.flatMap((group) => group.items).find((item) => item.timeframe === "BASELINE");
  const followUps = followUpChange.groups.flatMap((group) => group.items);
  const prior = followUps.find((item) => item.timeframe === "PRIOR_FOLLOW_UP");
  const current = followUps.find((item) => item.timeframe === "CURRENT_FOLLOW_UP");
  assert.deepEqual(baseline?.entries.flatMap((entry) => entry.values.map((value) => value.en)), ["Initial concern"]);
  assert.deepEqual(prior?.entries.flatMap((entry) => entry.values.map((value) => value.en)), ["Change: Change recorded previously"]);
  assert.deepEqual(current?.entries.flatMap((entry) => entry.values.map((value) => value.en)), ["Change: Symptoms became less frequent"]);
  assert.deepEqual(baseline?.sourceRefs, [{
    actor: "PATIENT",
    questionIds: ["initial-derm"],
    visitId: "initial-visit",
    recordedAt: "2026-06-19T09:00:00.000Z",
  }]);
});

test("physician hair journey draws a line only from recorded points and does not expose implementation rules as physician copy", () => {
  const chart = fs.readFileSync(new URL("../app/physician/components/physician-metric-chart.tsx", import.meta.url), "utf8");
  assert.equal(chart.includes("points.length > 1"), true);
  assert.equal(chart.includes('points.map((point, index) =>'), true);
  assert.equal(chart.includes("Connecting lines do not imply measurements between visits."), false);
  assert.equal(chart.includes("لا يمثل قياسات مفترضة"), false);
});


test("follow-up physician view keeps the initial interview and cumulative visit deltas as separate sources", () => {
  assert.equal(readModel.includes("initialQuestions"), true);
  assert.equal(readModel.includes("followUpSections"), true);
  assert.equal(workspace.includes("Original initial interview"), true);
  assert.equal(workspace.includes("Recorded changes across follow-up visits"), true);
  assert.equal(workspace.includes("No detailed answers for this visit"), false);
});

test("effective physician questions retain baseline answers while current scoped answers override matching baseline values", () => {
  const baseline = question({ id: "base", value: "PATTERN" });
  const current = question({ id: "current", value: "UPDATED" });
  const other = question({ id: "other", code: "Q_OTHER", responseScopeKey: "OTHER", value: "X" });
  const merged = mergeInterviewQuestions([baseline, other], [current]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((item) => item.code === "Q_TEST")?.id, "current");
  assert.equal(merged.find((item) => item.code === "Q_OTHER")?.id, "other");
});

test("follow-up presentation exposes meaningful patient deltas without leaking synthetic fixture metadata", () => {
  const sections = buildPhysicianFollowUpSections({
    synthetic: true,
    scenarioId: "SYNTHETIC_CASE_36",
    followUp: 2,
    aesthetic: { newProcedureOrReview: true, result: "SATISFIED", complication: "NONE" },
  });
  const text = JSON.stringify(sections);
  assert.equal(text.includes("SYNTHETIC_CASE"), false);
  assert.equal(text.includes('"synthetic"'), false);
  assert.equal(text.includes("متابعة الإجراءات التجميلية"), true);
  assert.equal(text.includes("راضٍ عن النتيجة"), true);
});

test("Initial approved Patient Hair History replaces the misleading pending-review header badge without completing the interview lifecycle", () => {
  assert.equal(workspace.includes('const initialHairHistoryApproved = Boolean('), true);
  assert.equal(workspace.includes('data.reviewVisit?.visitType === "INITIAL"'), true);
  assert.equal(workspace.includes('&& data.capabilities.hairHistory'), true);
  assert.equal(workspace.includes('&& hasApprovedHairHistory'), true);
  assert.equal(workspace.includes('reviewBadgeKind === "HAIR_HISTORY_APPROVED"'), true);
  assert.equal(workspace.includes('isAr ? "تاريخ المراجع معتمد" : "Patient Hair History approved"'), true);
  assert.equal(workspace.includes('reviewBadgeKind === "COMPLETED"'), true);
  assert.equal(workspace.includes('isAr ? "المراجعة مكتملة" : "Review completed"'), true);
  assert.equal(workspace.includes('data.reviewVisit?.interviewStatus === "UNDER_REVIEW"'), true);
});
