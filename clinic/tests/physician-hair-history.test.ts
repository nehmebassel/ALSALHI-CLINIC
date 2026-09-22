import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { derivePatientHairHistory } from "../lib/physician/hair-history";
import type { PhysicianInterviewQuestion } from "../lib/physician/types";

function question(input: Partial<PhysicianInterviewQuestion> & Pick<PhysicianInterviewQuestion, "code" | "value">): PhysicianInterviewQuestion {
  return {
    id: `qi-${input.code}`,
    responseId: `00000000-0000-4000-8000-${String(Math.abs(input.code.length)).padStart(12, "0")}`,
    code: input.code,
    text: input.text ?? { ar: input.code, en: input.code },
    library: { ar: "الشعر", en: "Hair" },
    group: { ar: "التاريخ", en: "History" },
    responseType: input.responseType ?? "TEXT",
    responseScopeType: input.responseScopeType ?? "MODULE",
    responseScopeKey: input.responseScopeKey ?? "HAIR_LOSS",
    currentSource: "PATIENT",
    value: input.value,
    repeatableItems: input.repeatableItems ?? [],
    options: input.options ?? [],
    editableByPhysician: true,
  };
}

test("Patient Hair History keeps patient measures separate from Physician Journey", () => {
  const history = derivePatientHairHistory([
    question({ code: "Q_HAIR_SHEDDING_ONSET", value: { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2023, month: 10, normalizedGregorian: { year: 2023, month: 10 } } }),
    question({ code: "Q_HAIR_SHEDDING_SEVERITY", value: "4" }),
    question({ code: "Q_HAIR_DENSITY_SEVERITY", value: "3" }),
  ], "visit-initial", "2026-08-18T10:00:00.000Z");

  assert.equal(history.status, "PATIENT_REPORTED_PREVIEW");
  assert.equal(history.items.filter((item) => item.layer === "MEASURES").length, 2);
  assert.ok(history.items.every((item) => item.source === "PATIENT"));
  assert.ok(history.items.every((item) => item.editable), "initial patient Hair History items are editable before first approval");
  assert.equal(history.items.find((item) => item.itemType === "SHEDDING_ONSET")?.datePrecision, "MONTH");
});

test("unknown dates remain unplotted instead of receiving a fabricated X date", () => {
  const history = derivePatientHairHistory([
    question({ code: "Q_HAIR_THINNING_ONSET", value: { calendar: "GREGORIAN", precision: "UNKNOWN" } }),
  ], "visit-initial", "2026-08-18T10:00:00.000Z");
  const onset = history.items.find((item) => item.itemType === "DENSITY_ONSET");
  assert.ok(onset);
  assert.equal(onset.date, undefined);
  assert.equal(onset.datePrecision, "UNKNOWN");
});

test("history extraction includes dated treatment/procedure/trigger facts and never creates a Visits layer", () => {
  const history = derivePatientHairHistory([
    question({ code: "Q_HAIR_TREATMENT_ITEMS", value: [], repeatableItems: [{ name: "Minoxidil", start: { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2024, month: 1, normalizedGregorian: { year: 2024, month: 1 } }, stillUsing: "YES" }] }),
    question({ code: "Q_HAIR_PROCEDURE_DETAILS", value: [], repeatableItems: [{ procedure: "PRP", count: "3", lastDate: { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2025, month: 4, normalizedGregorian: { year: 2025, month: 4 } } }] }),
    question({ code: "Q_TRIGGER_EVENT_DETAILS", value: [], repeatableItems: [{ event: "SEVERE_STRESS", date: { calendar: "GREGORIAN", precision: "YEAR", year: 2023, normalizedGregorian: { year: 2023 } } }] }),
  ], "visit-initial", "2026-08-18T10:00:00.000Z");

  assert.ok(history.items.some((item) => item.layer === "TREATMENTS"));
  assert.ok(history.items.some((item) => item.layer === "PROCEDURES"));
  assert.ok(history.items.some((item) => item.layer === "TRIGGERS"));
  assert.ok(history.items.every((item) => item.layer !== ("VISITS" as never)));
});

test("synthetic fixture prose is not surfaced as a patient history fact", () => {
  const history = derivePatientHairHistory([
    question({ code: "Q_HAIR_TREATMENT_ITEMS", value: [], repeatableItems: [{ name: "Synthetic Treatment", start: "2025-01", stillUsing: "YES" }] }),
  ], "visit-initial", "2026-08-18T10:00:00.000Z");
  assert.equal(history.items.length, 0);
});


test("Patient Hair History is a first-class physician workspace tab and stays separate from Physician Journey", () => {
  const workspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  assert.equal(workspace.includes('type WorkspaceTab = "SUMMARY" | "STORY" | "HISTORY" | "JOURNEY" | "VISITS"'), true);
  assert.equal(workspace.includes('| "INTERVIEW"'), false);
  assert.equal(workspace.includes("<PatientHairHistory"), true);
  assert.equal(workspace.includes('activeTab === "HISTORY"'), true);
  assert.equal(workspace.includes('activeTab === "JOURNEY"'), true);
});

test("Hair History writes are physician-only, audited, revision-guarded, and whole-history approved", () => {
  const service = fs.readFileSync(new URL("../lib/physician/hair-history-service.ts", import.meta.url), "utf8");
  assert.equal(service.includes("assertCanModifyClinicalData(actor)"), true);
  assert.equal(service.includes("assertEligibleVisit(tx"), true);
  assert.equal(service.includes("assertItemProvenance(tx"), true);
  assert.equal(service.includes('throw new HairHistoryWriteError("HAIR_HISTORY_NOT_ELIGIBLE")'), true);
  assert.equal(service.includes('throw new HairHistoryWriteError("VISIT_EPISODE_MISMATCH")'), true);
  assert.equal(service.includes('throw new HairHistoryWriteError("INVALID_PROVENANCE"'), true);
  assert.equal(service.includes('throw new HairHistoryWriteError("REVISION_CONFLICT")'), true);
  assert.equal(service.includes('entityType: "HAIR_HISTORY_DRAFT"'), true);
  assert.equal(service.includes('entityType: "APPROVED_HAIR_HISTORY"'), true);
  assert.equal(service.includes('action: "APPROVE"'), true);
  assert.equal(service.includes("items: { deleteMany: {}, create:"), true);
});

test("schema persists review drafts separately from approved Hair History revisions", () => {
  const schema = fs.readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  assert.equal(schema.includes("model HairHistoryDraft {"), true);
  assert.equal(schema.includes("model HairHistoryDraftItem {"), true);
  assert.equal(schema.includes("revision         Int      @default(1)"), true);
  assert.equal(schema.includes("enum HairHistoryLayer"), true);
  assert.equal(schema.includes("VISITS"), false);
});

test("Hair History aggregates scoped repeatable responses created by Final Submit", () => {
  const history = derivePatientHairHistory([
    question({ code: "Q_HAIR_TREATMENT_ITEMS", value: { name: "Minoxidil", start: { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2024, month: 1, normalizedGregorian: { year: 2024, month: 1 } }, stillUsing: "YES" }, responseScopeType: "MEDICATION_ITEM", responseScopeKey: "HAIR_SCALP_TREATMENT:t1" }),
    question({ code: "Q_HAIR_PROCEDURE_DETAILS", value: { procedure: "PRP", count: "3", lastDate: { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2025, month: 4, normalizedGregorian: { year: 2025, month: 4 } } }, responseScopeType: "PROCEDURE_SELECTION", responseScopeKey: "HAIR_SCALP_PROCEDURE:PRP" }),
    question({ code: "Q_TRIGGER_EVENT_DETAILS", value: { event: "SEVERE_STRESS", date: { calendar: "GREGORIAN", precision: "YEAR", year: 2023, normalizedGregorian: { year: 2023 } } }, responseScopeType: "EVENT_ITEM", responseScopeKey: "HAIR_TRIGGER:SEVERE_STRESS" }),
  ], "visit-initial", "2026-08-18T10:00:00.000Z");

  assert.equal(history.items.filter((item) => item.layer === "TREATMENTS").length, 1);
  assert.equal(history.items.filter((item) => item.layer === "PROCEDURES").length, 1);
  assert.equal(history.items.filter((item) => item.layer === "TRIGGERS").length, 1);
});

test("Hair History renders dated event names in the context dashboard and keeps Measures locked visible", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes('const EVENT_LAYERS: PhysicianHairHistoryLayer[] = ["SYMPTOMS", "TREATMENTS", "PROCEDURES", "TRIGGERS", "DIAGNOSES", "TESTS_LABS", "PHOTOS"]'), true);
  assert.equal(component.includes('history-layer-chip--locked'), true);
  assert.equal(component.includes('activeEventLayers.has(layer)'), true);
  assert.equal(component.includes('{pickLocalized(item.label, locale)}'), true);
  assert.equal(component.includes('hair-history-event-card--selected'), true);
  assert.equal(component.includes('hair-history-context-dashboard'), true);
  assert.equal(component.includes('"VISITS"'), false);
});

test("v1.13.1 Hair History physician copy contains clinical labels, not implementation requirements", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes('"تاريخ الشعر من المراجع"'), true);
  assert.equal(component.includes('"المصدر: المراجع"'), true);
  for (const forbidden of [
    "الرسم الأول — قبل أول خط أساس للطبيب",
    "تاريخ الشعر قبل أول خط أساس للطبيب",
    "المقاييس تبقى ظاهرة",
    "القياسات الرقمية فقط تستخدم محور",
    "الأحداث تبقى في طبقاتها ولا تتحول",
    "النقاط الرقمية قابلة للسحب رأسيًا فقط",
    "لن يتغير الاعتماد السابق بصمت",
  ]) {
    assert.equal(component.includes(forbidden), false, forbidden);
  }
});

test("v1.13 uses governed metric marker shapes and only draws lines with at least two points of the same metric", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes('metricCode === "DENSITY"'), true);
  assert.equal(component.includes('metricCode === "ITCH"'), true);
  assert.equal(component.includes('metricCode === "BURNING"'), true);
  assert.equal(component.includes('metricCode === "SCALP_PAIN"'), true);
  assert.equal(component.includes('uniqueSeriesDates > 1 && coords.length > 1'), true);
  assert.equal(component.includes('METRIC_ORDER.map'), true);
});

test("v1.13 review workflow keeps pre-approval edits lightweight and reserves typed reason for Reopen", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes('type PanelMode = "IDLE" | "SELECTED" | "EDITING" | "SAVED" | "ERROR"'), true);
  assert.equal(component.includes('Reason for change'), false);
  assert.equal(component.includes('editDraft.reason'), false);
  assert.equal(component.includes('Reason for reopening'), true);
  assert.equal(component.includes('reopenReason.trim().length < 5'), true);
  assert.equal(component.includes('Allowed range is 0–5.'), true);
  assert.equal(component.includes('parseMetricInput'), true);
  assert.equal(component.includes('Math.max(0, Math.min(5, Number('), false);
});

test("v1.13 Save Review remains separate from whole-history approval", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const approveStart = component.indexOf("async function approveHistory()");
  const approveEnd = component.indexOf("async function reopen()", approveStart);
  const approveBody = component.slice(approveStart, approveEnd);
  assert.ok(approveStart >= 0 && approveEnd > approveStart);
  assert.equal(approveBody.includes('action: "SAVE_DRAFT"'), false);
  assert.equal(approveBody.includes('action: "APPROVE"'), true);
  assert.equal(component.includes('setShowApprovalConfirm(true)'), true);
  assert.equal(component.includes('aria-labelledby="hair-history-approve-title"'), true);
  assert.equal(component.includes('This approval does not approve the first physician visit or complete the case review.'), true);
});

test("v1.13 first physician edit persists a clean reviewed snapshot before the changed snapshot without per-edit reason", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const start = component.indexOf("async function saveSelectedEdit()");
  const end = component.indexOf("async function approveHistory()", start);
  const body = component.slice(start, end);
  const previewGuard = body.indexOf('localStatus === "PATIENT_REPORTED_PREVIEW"');
  const cleanSave = body.indexOf('action: "SAVE_DRAFT"', previewGuard);
  const changedSave = body.indexOf('action: "SAVE_DRAFT"', cleanSave + 1);
  assert.ok(previewGuard >= 0);
  assert.ok(cleanSave > previewGuard);
  assert.ok(changedSave > cleanSave);
  assert.equal(body.includes('reason: editDraft.reason'), false);
});

test("AEP-008 approved Hair History disables chart editing and reopening requires a reasoned amendment", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const workspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  assert.equal(component.includes('const approved = localStatus === "APPROVED_READ_ONLY"'), true);
  assert.equal(component.includes('const readOnly = approved || referenceOnly'), true);
  assert.equal(component.includes('if (readOnly || !item.editable'), true);
  assert.equal(component.includes('openEditor: false, openOverview: true'), true);
  assert.equal(component.includes("readOnly || cluster.items.length > 1"), true);
  assert.equal(component.includes("!readOnly && selectedChartMeasure.editable"), true);
  assert.equal(component.includes('setShowReopenForm(true)'), true);
  assert.equal(component.includes('reopenReason.trim().length < 5'), true);
  assert.equal(component.includes('action: "REOPEN"'), true);
  assert.equal(component.includes('Open amendment draft'), true);
  assert.equal(workspace.includes('data.hairHistory.status === "AMENDMENT_DRAFT"'), true);
  assert.equal(workspace.includes('Hair History amendment open'), true);
});

test("v1.13 unknown dates stay outside the X-axis until corrected", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes('item.date && item.datePrecision !== "UNKNOWN"'), true);
  assert.equal(component.includes('!item.date || item.datePrecision === "UNKNOWN"'), true);
  assert.equal(component.includes('"التاريخ غير معروف"'), true);
  assert.equal(component.includes('"عناصر غير مؤرخة"'), true);
  assert.equal(component.includes('Outside the timeline'), false);
  assert.equal(component.includes('receive no timeline position unless the physician corrects their date'), false);
});

test("v1.13 maps scalp biopsy to Diagnoses/tests while Labs remains a separate presentation lane", () => {
  const history = derivePatientHairHistory([
    question({ code: "Q_SCALP_BIOPSY_DATE", value: { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2025, month: 2, normalizedGregorian: { year: 2025, month: 2 } } }),
    question({ code: "Q_SCALP_BIOPSY_AREA", value: "Vertex" }),
    question({ code: "Q_SCALP_BIOPSY_RESULT_TEXT", value: "Patient-reported biopsy result" }),
  ], "visit-initial", "2026-08-18T10:00:00.000Z");
  const biopsy = history.items.find((item) => item.itemType === "SCALP_BIOPSY");
  assert.ok(biopsy);
  assert.equal(biopsy.layer, "DIAGNOSES");
});


test("v1.13.2 uses a full-width Hair History canvas with the review panel below, never beside it", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const hairHistoryCss = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.module.css", import.meta.url), "utf8");
  assert.equal(hairHistoryCss.includes(".scope :global(.hair-history-main-grid) {display: grid; grid-template-columns: minmax(0, 1fr);"), true);
  assert.equal(hairHistoryCss.includes(".scope :global(.hair-history-editor-card) {position: static;"), true);
  assert.equal(component.indexOf("hair-history-chart-card") < component.indexOf("hair-history-editor-card"), true);
  assert.equal(component.includes("hair-history-add-row"), false);
  assert.equal(component.includes("Add a physician-confirmed historical item"), false);
});

test("v1.13.2 uses the governed color, marker, and line token for every 0-5 metric", () => {
  const hairHistoryCss = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.module.css", import.meta.url), "utf8");
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  for (const token of ["#141F32", "#315F8C", "#6D5A9A", "#A56A14", "#A23A3A"]) assert.equal(hairHistoryCss.includes(token), true, token);
  assert.equal(component.includes('metricCode === "DENSITY"'), true);
  assert.equal(component.includes('metricCode === "ITCH"'), true);
  assert.equal(component.includes('metricCode === "BURNING"'), true);
  assert.equal(component.includes('metricCode === "SCALP_PAIN"'), true);
  assert.equal(hairHistoryCss.includes(".scope :global(.history-metric--itch) :global(.history-metric-line),\n.scope :global(.history-metric--burning) :global(.history-metric-line) {stroke-dasharray:"), true);
});

test("focused Hair History refinement restricts direct manipulation to metric points and treatment duration bars only", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const hairHistoryCss = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.module.css", import.meta.url), "utf8");
  assert.equal(component.includes("function beginMetricDrag"), true);
  assert.equal(component.includes("beginMetricDrag(representative, event)"), true);
  assert.equal(component.includes("function beginTreatmentDrag"), true);
  assert.equal(component.includes('beginTreatmentDrag(item, "BAR", event)'), true);
  assert.equal(component.includes('beginTreatmentDrag(item, "START", event)'), true);
  assert.equal(component.includes('beginTreatmentDrag(item, "END", event)'), true);
  assert.equal(component.includes('kind: "MEASURE" | "EVENT"'), false);
  assert.equal(component.includes('beginDrag(item, "EVENT", event)'), false);
  assert.equal(component.includes("history-event-draggable"), false);
  assert.equal(hairHistoryCss.includes("history-event-draggable"), false);
  assert.equal(component.includes('metricValueFromSvgY(svgY, MEASURE_TOP, measureStep)'), true);
  assert.equal(component.includes('return { ...current, dateInput, valueInput: String(value) };'), true);
  assert.equal(component.includes('onClick={() => selectItem(item, { openEditor: false, openOverview: true })}'), true);
  assert.equal(component.includes("setNewLayer"), false);
  assert.equal(component.includes("setDraft({ layer:"), false);
  assert.equal(component.includes("history-drag-origin-marker"), true);
});

test("v1.13.2 chart drag and bottom-panel edits update the same review draft", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes("setEditDraft((current) =>"), true);
  assert.equal(component.includes("function setDraft(patch: Partial<EditDraft>)"), true);
  assert.equal(component.includes('value={editDraft.dateInput}'), true);
  assert.equal(component.includes('value={editDraft.valueInput}'), true);
  assert.equal(component.includes('disabled={busy || !selectedDirty} onClick={saveSelectedEdit}'), true);
});

test("v1.13 server validates 0-5 measures and requires a reasoned Reopen before approved-history amendment edits", () => {
  const service = fs.readFileSync(new URL("../lib/physician/hair-history-service.ts", import.meta.url), "utf8");
  assert.equal(service.includes('const METRIC_CODES = new Set(["SHEDDING", "DENSITY", "ITCH", "BURNING", "SCALP_PAIN"])'), true);
  assert.equal(service.includes('!Number.isInteger(metricValue) || metricValue < 0 || metricValue > 5'), true);
  assert.equal(service.includes('items.some((item) => item.source === "PHYSICIAN") && reason.length === 0'), false);
  assert.equal(service.includes('existingApproved && (!prior || prior.status !== "AMENDMENT_DRAFT")'), true);
  assert.equal(service.includes('Approved Hair History must be reopened with a reason before amendment edits.'), true);
  assert.equal(service.includes('reason.length < 5 || reason.length > 500'), true);
  assert.equal(service.includes('amendmentSessionReason'), true);
  assert.equal(service.includes('reason: existingApproved ? amendmentReason!'), true);
  assert.equal(service.includes('reason: existing ? amendmentReason!'), true);
});

test("v1.13.3 Hair History uses a desktop-first hierarchical grid while keeping the timeline full width", () => {
  const workspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  const hairHistoryCss = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.module.css", import.meta.url), "utf8");
  const physicianWorkspaceCss = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.module.css", import.meta.url), "utf8");
  assert.equal(workspace.includes('activeTab === "HISTORY" ? "workspace-main physician-record physician-record--history-focus"'), true);
  assert.equal(hairHistoryCss.includes(".scope :global(.hair-history-workspace) {grid-template-columns: repeat(12, minmax(0, 1fr));"), true);
  assert.equal(hairHistoryCss.includes(".scope :global(.hair-history-main-grid),\n.scope :global(.hair-history-undated-card),\n.scope :global(.hair-history-actions),\n.scope :global(.hair-history-message) {grid-column: 1 / -1;"), true);
  assert.equal(physicianWorkspaceCss.includes(".scope :global(.physician-record--history-focus) {width: min(1760px, calc(100% - 48px));"), true);
});

test("v1.13.3 selecting a dated chart item opens a contextual overview without forcing the edit panel open", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes("const [overviewOpen, setOverviewOpen] = useState(false)"), true);
  assert.equal(component.includes("const [editorOpen, setEditorOpen] = useState(false)"), true);
  assert.equal(component.includes('setOverviewOpen(options?.openOverview ?? Boolean(item.date && item.datePrecision !== "UNKNOWN"))'), true);
  assert.equal(component.includes("setEditorOpen(Boolean(options?.openEditor))"), true);
  assert.equal(component.includes("hair-history-overview-popover"), true);
  assert.equal(component.includes("hair-history-overview-actions"), true);
  assert.equal(component.includes("openSelectedEditor"), true);
});

test("Hair History contextual overview presents clinical meaning first and collapses provenance metadata", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const overview = component.slice(component.indexOf("{overviewOpen && selectedChartMeasure"), component.indexOf("<section className=\"hair-history-context-dashboard\""));
  for (const token of ["شدة أبلغ عنها المراجع عند البداية", "تاريخ بداية العرض", "السياق الزمني", "لا يوجد اتجاه زمني بعد", "عرض التفاصيل", "السابق", "التالي"]) assert.equal(overview.includes(token), true, token);
  assert.equal(overview.includes('<dt>{isAr ? "القيمة" : "Value"}</dt>'), true, "metric overview uses the approved Value row label");
  assert.equal(overview.includes("العنصر المحدد"), false);
  assert.equal(overview.includes("موضع العنصر في السجل"), false);
  assert.equal(overview.includes("selectedTimelinePosition"), false);
  assert.equal(overview.indexOf("hair-history-overview-facts") < overview.indexOf("hair-history-overview-details"), true);
  assert.equal(overview.indexOf("hair-history-overview-actions") < overview.indexOf("hair-history-overview-details"), true);
  assert.equal(overview.includes("<details"), true);
  assert.equal(overview.includes("دقة التاريخ"), true, "date precision remains available only inside collapsed details");
  assert.equal(overview.includes("المصدر"), true, "source remains available only inside collapsed details");
  assert.equal(component.includes("sameMetricNeighbors"), true);
  assert.equal(component.includes("nearestTimelineItems"), false);
  assert.equal(component.includes("أقرب عناصر زمنياً"), false);
  assert.equal(component.includes("AI interpretation"), false);
  assert.equal(overview.includes("formatMetricScore(selectedChartMetric.value, locale)"), true);
  assert.equal(overview.includes(" / "), false, "default overview avoids bidi-fragile slash fractions");
});

test("Hair History identical metric/date/value records render as one counted cluster with record selection in Arabic and English", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes("clusterMetricPoints(metricItems.map"), true);
  assert.equal(component.includes("data-history-cluster-size={cluster.items.length}"), true);
  assert.equal(component.includes("history-point-cluster-badge"), true);
  assert.equal(component.includes("cluster.items.length > 1 ? openMetricCluster"), true);
  assert.equal(component.includes("selectedMetricCluster.items.map"), true);
  assert.equal(component.includes("سجلات متعددة في موضع الرسم نفسه"), true);
  assert.equal(component.includes("Multiple records at the same plotted position"), true);
  assert.equal(component.includes("سجلات منفصلة"), true);
  assert.equal(component.includes("openEditor: false, openOverview: true"), true);
});

test("Hair History sparse measurement state is explicit and never invents trend lines", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes("const sparseMetricState"), true);
  assert.equal(component.includes("metricDateClusterCount <= 1"), true);
  assert.equal(component.includes("تتوفر شدة أبلغ عنها المراجع عند تاريخ بداية واحد؛ لا يظهر اتجاه زمني بعد."), true);
  assert.equal(component.includes("Historical points are limited; a complete time trajectory is not available yet."), true);
  assert.equal(component.includes("uniqueSeriesDates > 1 && coords.length > 1"), true);
});

test("AEP-008 a simple click remains selection while editing requires a clear drag threshold", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes("startClientX: event.clientX"), true);
  assert.equal(component.includes("startClientY: event.clientY"), true);
  assert.equal(component.includes("moved: false"), true);
  assert.equal(component.includes("const DRAG_THRESHOLD_PX = 8"), true);
  assert.equal(component.includes("movement < DRAG_THRESHOLD_PX"), true);
  assert.equal(component.includes("if (dragState.moved)"), true);
  assert.equal(component.includes("setEditorOpen(false)"), true);
  assert.equal(component.includes("setEditorOpen(true)"), true);
});

test("AEP-008 Hair History overview uses a viewport coordinate space and recomputes for scroll, resize, zoom, locale, and selection", () => {
  const hairHistoryCss = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.module.css", import.meta.url), "utf8");
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(hairHistoryCss.includes(".scope :global(.hair-history-overview-popover) {position: absolute;"), true);
  assert.equal(component.includes('"hair-history-chart-viewport hair-history-chart-viewport--sparse"'), true);
  assert.equal(component.includes("chartViewportRef"), true);
  assert.equal(component.includes("chooseFloatingPanelPosition"), true);
  assert.equal(component.includes("protectedRadius: 28"), true);
  assert.equal(component.includes('window.addEventListener("scroll", schedulePosition, true)'), true);
  assert.equal(component.includes('window.addEventListener("resize", schedulePosition)'), true);
  assert.equal(component.includes('window.visualViewport?.addEventListener("resize", schedulePosition)'), true);
  assert.equal(component.includes('const displayedEventLayerKey = displayedEventLayers.join(":")'), true);
  assert.equal(component.includes("locale, displayedEventLayerKey"), true);
  assert.equal(component.includes("avoidRects"), true);
  assert.equal(component.includes('overview.dataset.placement = position.placement'), true);
  assert.equal(hairHistoryCss.includes('.scope :global(.hair-history-overview-popover)[data-placement="right"]::before'), true);
  assert.equal(hairHistoryCss.includes("grid-template-columns: minmax(0,1fr) minmax(300px, .34fr)"), true, "legacy rule remains earlier but must be overridden by v1.13.2 full-width rule");
  assert.equal(hairHistoryCss.lastIndexOf(".scope :global(.hair-history-main-grid) {display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px;}") > hairHistoryCss.indexOf("grid-template-columns: minmax(0,1fr) minmax(300px, .34fr)"), true);
});

test("focused Hair History refinement layers events below the five-measure graph and removes empty groups", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes("adaptiveMeasureStep(metricItems.length, activeMetricSeriesCount)"), true);
  assert.equal(component.includes("const metricDomain = paddedTimelineDomain(stableMetricItems, fallbackCenter, [history.clinicalReferenceAt])"), true);
  assert.equal(component.includes("const contextDomain = paddedTimelineDomain(stableDated, fallbackCenter, [...treatmentEndpointDates, history.clinicalReferenceAt])"), true);
  assert.equal(component.includes("const clinicalMax = new Date(history.clinicalReferenceAt).getTime()"), true, "editable historical dates are bounded by server now, not source provenance");
  assert.equal(component.includes("max={history.sourceVisitAt"), false);
  assert.equal(component.includes("treatmentEnd(item, history.sourceVisitAt).date"), true, "treatment end/ongoing endpoints participate in the context timeline domain");
  const interaction = fs.readFileSync(new URL("../lib/physician/hair-history-interaction.ts", import.meta.url), "utf8");
  assert.equal(component.includes("const dateAxis = layoutRecordedDateAxis({"), true, "upper axis uses the collision-safe recorded-date layout helper");
  assert.equal(component.includes("dates: metricItems.filter((item) => item.date).map"), true, "upper-axis ticks are derived from metric dates only");
  assert.equal(interaction.includes("const unique = new Map<string, HairHistoryAxisDateInput>();"), true, "axis helper deduplicates plotted clinical dates");
  assert.equal(interaction.includes("const key = recordedDateKey(item.date, item.precision)"), true, "axis uniqueness follows clinical date precision");
  assert.equal(component.includes("activeEventLayers.has(layer) && dated.some((item) => item.layer === layer)"), true);
  assert.equal(component.includes('aria-label={isAr ? "مخطط المقاييس الخمسة لتاريخ الشعر" : "Five-measure Hair History graph"}'), true);
  assert.equal(component.includes('className="hair-history-context-dashboard"'), true);
  assert.equal(component.includes('isAr ? "السياق السريري" : "Clinical context"'), true);
  assert.equal(component.includes("السياق أسفل المقاييس"), false);
  assert.equal(component.includes("hair-history-treatment-section"), true);
  assert.equal(component.includes("hair-history-event-groups"), true);
  assert.equal(component.includes("eventLaneLayouts"), false);
  assert.equal(component.includes("history-event-lane"), false);
  assert.equal(component.includes("packTimelineLane"), false);
  assert.equal(component.includes("EVENT_EMPTY_LANE_HEIGHT"), false);
  assert.equal(component.includes("const MEASURE_STEP ="), false);
  assert.equal(component.includes("const EVENT_LABEL_X ="), false);
});

test("focused Hair History treatment rows distinguish recorded durations, ongoing state, and point-only starts", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes('typeof item.value.stopDate === "string"'), true);
  assert.equal(component.includes('item.value.stillUsing === true'), true);
  assert.equal(component.includes('const hasDuration = Boolean(end.date && endPosition > startPosition)'), true);
  assert.equal(component.includes('isAr ? "البداية" : "Start"'), true);
  assert.equal(component.includes('isAr ? "النهاية" : "End"'), true);
  assert.equal(component.includes('"مستمر حتى الزيارة الحالية"'), true);
  assert.equal(component.includes("hair-history-treatment-timeline-label"), true);
  assert.equal(component.includes("مدة العلاج المسجلة"), true);
  assert.equal(component.includes("بداية مسجلة فقط — لا توجد مدة مكتملة"), true);
  assert.equal(component.includes("hair-history-treatment-duration--ongoing"), true);
  assert.equal(component.includes("hair-history-treatment-boundary--draggable"), true);
  assert.equal(component.includes("editDraft.reason.trim().length === 0"), false, "pre-approval treatment drag must not require a per-edit typed reason");
  assert.equal(component.includes('action: "REOPEN"'), true, "approved-history amendments still require a reasoned Reopen session");
});

test("focused Hair History event cards are click-to-overview controls and never draggable", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const context = component.slice(component.indexOf("{eventCardLayers.length > 0"), component.indexOf("{(approved || (!readOnly && editorOpen"));
  assert.equal(context.includes("hair-history-event-card"), true);
  assert.equal(context.includes("onPointerDown"), false);
  assert.equal(context.includes("draggable"), false);
  assert.equal(context.includes("openEditor: false, openOverview: true"), true);
});


test("selected-item overview separates metric identity, value, date, trend, action, and collapsed provenance", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const overview = component.slice(component.indexOf("{overviewOpen && selectedChartMeasure"), component.indexOf("<section className=\"hair-history-context-dashboard\""));
  for (const token of ["Patient-reported severity at onset", "Value", "Symptom onset date", "Time context", "No time trend yet", "Edit item", "Show details", "Source and change history", "hair-history-overview-rows", "hair-history-overview-footer"]) {
    assert.equal(overview.includes(token), true, token);
  }
  assert.equal(overview.includes("sourceQuestionCode"), false);
  assert.equal(overview.includes("sourceResponseId"), false);
  assert.equal(overview.includes("sourceScopeKey"), false);
});

test("metric overview uses compact structured rows and Arabic natural score formatting", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.module.css", import.meta.url), "utf8");
  const formatter = component.slice(component.indexOf("function formatMetricScore"), component.indexOf("function treatmentStopPrecision"));
  const overview = component.slice(component.indexOf("{overviewOpen && selectedChartMeasure"), component.indexOf("<section className=\"hair-history-context-dashboard\""));
  assert.equal(formatter.includes("من"), true);
  assert.equal(formatter.includes("localeNumber(5, locale)"), true);
  assert.equal(overview.includes('<dl className="hair-history-overview-rows">'), true);
  assert.equal(overview.includes('className="hair-history-overview-row--context"'), true);
  assert.equal(css.includes(".hair-history-overview-rows"), true);
  assert.equal(css.includes("font-size: .75rem"), true, "metric value stays compact enough to avoid oversized wrapping");
});

test("chart renders unique recorded-date axis rows and visual-only metric collision offsets", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes("layoutRecordedDateAxis"), true);
  assert.equal(component.includes("data-history-axis-row"), true);
  assert.equal(component.includes("layoutMetricCollisionOffsets"), true);
  assert.equal(component.includes("data-history-true-x"), true);
  assert.equal(component.includes("data-history-display-x"), true);
  assert.equal(component.includes('className="history-point-collision-connector"'), true);
  assert.equal(component.includes('points={coords.map((coord) => `${coord.x},${coord.y}`).join(" ")}'), true, "series line keeps true date/value coordinates");
});

test("date editor uses strict canonical parsing with an unambiguous localized preview", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes("isoDateFromInput(value, precision)"), true);
  assert.equal(component.includes('input dir="ltr" type={editDraft.datePrecision === "DAY" ? "date"'), true);
  assert.equal(component.includes("hair-history-date-preview"), true);
  assert.equal(component.includes("تاريخ الحدث:"), true);
  assert.equal(component.includes('editDraft.datePrecision !== "UNKNOWN"'), true);
});

test("selected treatment and event cards open overview first and expose edit only as an explicit action", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const context = component.slice(component.indexOf("<section className=\"hair-history-context-dashboard\""), component.indexOf("{(approved || (!readOnly && editorOpen"));
  assert.equal(context.includes("hair-history-selected-overview"), true);
  assert.equal(context.includes("Recorded treatment"), true);
  assert.equal(context.includes("Start date"), true);
  assert.equal(context.includes("End date"), true);
  assert.equal(context.includes("Duration"), true);
  assert.equal(context.includes("Edit treatment"), true);
  assert.equal(context.includes("Patient-provided detail"), true);
  assert.equal(context.includes("Edit item"), true);
  assert.equal(context.includes("openEditor: false, openOverview: true"), true);
});

test("patient-provided selected-card detail is rendered from the stored value without rewriting it", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const detailHelper = component.slice(component.indexOf("function patientProvidedDetail"), component.indexOf("function treatmentDurationLabel"));
  assert.equal(detailHelper.includes("return value;"), true);
  assert.equal(detailHelper.includes("return value.trim()"), false);
  assert.equal(component.includes("{selectedContextDetail}</p>"), true);
});

test("drag threshold remains the only direct route into the edit panel besides explicit Edit actions", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const metricDrag = component.slice(component.indexOf("function handleChartDrag"), component.indexOf("function timestampFromTreatmentTrack"));
  const treatmentDrag = component.slice(component.indexOf("function beginTreatmentDrag"), component.indexOf("function endTreatmentDrag"));
  assert.equal(metricDrag.includes("movement < DRAG_THRESHOLD_PX"), true);
  assert.equal(treatmentDrag.includes("movement < DRAG_THRESHOLD_PX"), true);
  assert.equal(treatmentDrag.includes('setEditorOpen(false)'), true, "pointer-down does not open the treatment editor");
  assert.equal(metricDrag.includes('setEditorOpen(true)'), true);
  assert.equal(treatmentDrag.includes('setEditorOpen(true)'), true);
});


test("v1.13.4 resolves governed OTHER labels to the patient-provided clinical detail when it exists", () => {
  const history = derivePatientHairHistory([
    question({
      code: "Q_TRIGGER_EVENT_DETAILS",
      value: [],
      repeatableItems: [{
        event: "OTHER",
        details: "تغير مهم في نمط النوم والعمل",
        date: { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2025, month: 3, normalizedGregorian: { year: 2025, month: 3 } },
      }],
      options: [{ code: "OTHER", ar: "أخرى", en: "Other" }],
    }),
    question({ code: "Q_PRIOR_DIAGNOSIS_OTHER", value: "تشخيص سابق موصوف من المراجع" }),
    question({
      code: "Q_PRIOR_DIAGNOSIS_DETAILS",
      value: [],
      repeatableItems: [{
        diagnosis: "OTHER",
        date: { calendar: "GREGORIAN", precision: "YEAR", year: 2024, normalizedGregorian: { year: 2024 } },
      }],
      options: [{ code: "OTHER", ar: "أخرى", en: "Other" }],
    }),
  ], "visit-initial", "2026-08-18T10:00:00.000Z");

  assert.equal(history.items.find((item) => item.itemType === "TRIGGER_EVENT")?.label.ar, "تغير مهم في نمط النوم والعمل");
  assert.equal(history.items.find((item) => item.itemType === "PRIOR_DIAGNOSIS")?.label.ar, "تشخيص سابق موصوف من المراجع");
  assert.equal(history.items.some((item) => item.label.ar === "أخرى"), false);
});

test("v1.13.4 patient trigger OTHER captures a clinical description instead of a generic Other label", () => {
  const patientJourney = fs.readFileSync(new URL("../app/patient/patient-journey.tsx", import.meta.url), "utf8");
  const engine = fs.readFileSync(new URL("../lib/p01/engine.ts", import.meta.url), "utf8");
  const contracts = fs.readFileSync(new URL("../lib/p01/contracts.ts", import.meta.url), "utf8");
  assert.equal(patientJourney.includes('itemCode === "OTHER"'), true);
  assert.equal(patientJourney.includes('"ما الحدث الآخر؟"'), true);
  assert.equal(patientJourney.includes('update({ details: event.target.value })'), true);
  assert.equal(engine.includes('item.id === "OTHER" && item.event === "OTHER"'), true);
  assert.equal(engine.includes('typeof other.details !== "string"'), true);
  assert.equal(contracts.includes('code:"details",labelAr:"وصف الحدث الآخر"'), true);
});

test("layered Hair History wraps long event labels inside bounded context cards", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const hairHistoryCss = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.module.css", import.meta.url), "utf8");
  assert.equal(component.includes("packTimelineLane"), false);
  assert.equal(component.includes("<foreignObject"), false);
  assert.equal(component.includes('className={selectedId === item.id ? "hair-history-event-card'), true);
  assert.equal(component.includes("shortenLabel"), false);
  assert.equal(component.includes("history-event-pill"), false);
  assert.equal(hairHistoryCss.includes(".scope :global(.hair-history-event-card) strong {"), true);
  assert.equal(hairHistoryCss.includes("overflow-wrap: anywhere;"), true);
  assert.equal(hairHistoryCss.includes("grid-template-columns: repeat(3, minmax(0,1fr));"), true);
  assert.equal(hairHistoryCss.includes(".scope :global(.hair-history-event-group)"), true);
});

test("v1.13.4 uses a modern desktop command bar and a single full-width clinical canvas", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  const hairHistoryCss = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.module.css", import.meta.url), "utf8");
  const physicianWorkspaceCss = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.module.css", import.meta.url), "utf8");
  assert.equal(component.includes("hair-history-commandbar"), true);
  assert.equal(component.includes("hair-history-command-source"), true);
  assert.equal(component.includes("hair-history-chart-card--modern"), true);
  assert.equal(component.includes("history-lane-label-band"), false);
  assert.equal(hairHistoryCss.includes(".scope :global(.hair-history-commandbar)"), true);
  assert.equal(physicianWorkspaceCss.includes("width: min(1880px, calc(100% - 44px));"), true);
  assert.equal(hairHistoryCss.includes(".scope :global(.hair-history-commandbar) :global(.history-layer-chip)"), true);
  assert.equal(hairHistoryCss.includes("border-radius: 0;"), true);
});

test("Arabic physician chrome maps queue, clinical record, gender, and physician portal labels through the active locale", () => {
  const workspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  const platformHeader = fs.readFileSync(new URL("../app/components/platform/platform-header.tsx", import.meta.url), "utf8");
  assert.equal(workspace.includes('isAr ? "قائمة المراجعين" : "Patient queue"'), true);
  assert.equal(workspace.includes('isAr ? "السجل السريري" : "Clinical record"'), true);
  assert.equal(workspace.includes('isAr ? "أنثى" : "Female"'), true);
  assert.equal(platformHeader.includes('isAr ? "بوابة الطبيب" : "Physician workspace"'), true);
  assert.equal(workspace.includes("P01 Physician"), false);
  assert.equal(platformHeader.includes("P01 Physician"), false);
});


test("Hair History workflow controls keep first review editable, Reopen approval-only, and approval parent-routed", () => {
  const component = fs.readFileSync(new URL("../app/physician/components/patient-hair-history.tsx", import.meta.url), "utf8");
  assert.equal(component.includes('const readOnly = approved || referenceOnly'), true);
  assert.equal(component.includes('const canReopen = approved && hasApprovedRevision && !referenceOnly'), true);
  assert.equal(component.includes('!readOnly && <section className="surface-card hair-history-actions"'), true);
  assert.equal(component.includes('Save review'), true);
  assert.equal(component.includes('Approve Hair History'), true);
  assert.equal(component.includes('{canReopen && <div className="hair-history-panel-actions"'), true);
  assert.equal(component.includes('if (readOnly || !item.editable || item.datePrecision === "UNKNOWN" || !item.date)'), true);
  assert.equal(component.includes('if (onApproved) onApproved()'), true);
});

test("Physician workspace routes Hair History approval into the current physician workspace and keeps follow-up history reference-only", () => {
  const workspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  assert.equal(workspace.includes('data.reviewVisit?.physicianRecordStatus === "FINALIZED" ? hairWorkflow.defaultTab : "STORY"'), true);
  assert.equal(workspace.includes('const [clinicalWorkspaceVisitId, setClinicalWorkspaceVisitId] = useState<string | null>(null)'), true);
  assert.equal(workspace.includes('setClinicalWorkspaceVisitId(data.reviewVisit.id)'), true);
  assert.equal(workspace.includes('setTab("STORY")'), true);
  assert.equal(workspace.includes('autoPrepare'), true);
  assert.equal(workspace.includes('router.refresh()'), true);
  assert.equal(workspace.includes("const hairHistoryReferenceOnly = hairWorkflow.hairHistoryReferenceOnly"), true);
  assert.equal(workspace.includes('referenceOnly={hairHistoryReferenceOnly}'), true);
  assert.equal(workspace.includes('isAr ? "تاريخ المراجع" : "Patient Hair History"'), true);
  assert.equal(workspace.includes('isAr ? "مسار الشعر الطبي" : "Physician Hair Journey"'), true);
  assert.equal(workspace.includes('Open Patient Hair History'), true);
});
