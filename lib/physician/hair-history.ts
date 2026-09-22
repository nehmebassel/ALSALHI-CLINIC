import { coerceClinicalApproxDate } from "@/lib/p01/clinical-date";
import type {
  PhysicianHairHistory,
  PhysicianHairHistoryItem,
  PhysicianHairHistoryLayer,
  PhysicianInterviewQuestion,
  PhysicianLocalizedText,
} from "@/lib/physician/types";

const LAYER_LABELS: Record<PhysicianHairHistoryLayer, PhysicianLocalizedText> = {
  MEASURES: { ar: "المقاييس", en: "Measures" },
  SYMPTOMS: { ar: "الأعراض", en: "Symptoms" },
  TREATMENTS: { ar: "العلاجات", en: "Treatments" },
  PROCEDURES: { ar: "الإجراءات", en: "Procedures" },
  TRIGGERS: { ar: "الأحداث المحفزة", en: "Trigger events" },
  DIAGNOSES: { ar: "التشخيصات / الفحوصات", en: "Diagnoses / tests" },
  TESTS_LABS: { ar: "التحاليل", en: "Labs" },
  PHOTOS: { ar: "الصور", en: "Photos" },
};

const METRIC_LABELS: Record<string, PhysicianLocalizedText> = {
  SHEDDING: { ar: "تساقط الشعر", en: "Shedding" },
  DENSITY: { ar: "نقص الكثافة", en: "Density loss" },
  ITCH: { ar: "الحكة", en: "Itch" },
  BURNING: { ar: "الحرقان", en: "Burning" },
  SCALP_PAIN: { ar: "ألم فروة الرأس", en: "Scalp pain" },
};

const SCALP_SCOPE_TO_METRIC: Record<string, string> = {
  ITCH: "ITCH",
  BURNING: "BURNING",
  PAIN: "SCALP_PAIN",
  SCALP_PAIN: "SCALP_PAIN",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asItems(question: PhysicianInterviewQuestion): unknown[] {
  if (question.repeatableItems.length > 0) return question.repeatableItems;
  if (Array.isArray(question.value)) return question.value;
  return isRecord(question.value) ? [question.value] : [];
}

function asScale(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0 && parsed <= 5 ? parsed : null;
}

function derivedId(question: PhysicianInterviewQuestion, suffix = "single"): string {
  return `derived:${question.id}:${suffix}`;
}

function normalizeDate(value: unknown): { date?: string; datePrecision: "MONTH" | "YEAR" | "UNKNOWN" } {
  const parsed = coerceClinicalApproxDate(value as never);
  if (!parsed || parsed.precision === "UNKNOWN") return { datePrecision: "UNKNOWN" };
  const peer = parsed.normalizedGregorian;
  if (!peer?.year) return { datePrecision: "UNKNOWN" };
  if (parsed.precision === "YEAR") {
    return { date: new Date(Date.UTC(peer.year, 6, 1)).toISOString(), datePrecision: "YEAR" };
  }
  const month = peer.month ?? 1;
  return { date: new Date(Date.UTC(peer.year, month - 1, 15)).toISOString(), datePrecision: "MONTH" };
}

function optionLabel(questions: PhysicianInterviewQuestion[], code: string): PhysicianLocalizedText | null {
  for (const question of questions) {
    const option = question.options.find((candidate) => candidate.code === code);
    if (option) return { ar: option.ar, en: option.en };
  }
  return null;
}

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned || /^Synthetic\b/i.test(cleaned) || /^SYN[-_]/i.test(cleaned)) return null;
  return cleaned.slice(0, 240);
}

function questionFreeText(questions: PhysicianInterviewQuestion[], code: string): string | null {
  const question = questions.find((candidate) => candidate.code === code);
  return question ? safeText(question.value) : null;
}

function recordDetail(raw: Record<string, unknown>): string | null {
  for (const key of ["details", "otherText", "description", "detailText"]) {
    const detail = safeText(raw[key]);
    if (detail) return detail;
  }
  return null;
}

function resolvedClinicalLabel(input: {
  questions: PhysicianInterviewQuestion[];
  code: string;
  raw?: Record<string, unknown>;
  otherQuestionCode?: string;
}): PhysicianLocalizedText {
  if (input.code === "OTHER") {
    const detail = (input.raw ? recordDetail(input.raw) : null)
      ?? (input.otherQuestionCode ? questionFreeText(input.questions, input.otherQuestionCode) : null);
    if (detail) return { ar: detail, en: detail };
  }
  return optionLabel(input.questions, input.code) ?? { ar: input.code, en: input.code };
}

function makeItem(input: {
  id: string;
  layer: PhysicianHairHistoryLayer;
  itemType: string;
  label: PhysicianLocalizedText;
  value: unknown;
  date?: string;
  datePrecision: "DAY" | "MONTH" | "YEAR" | "UNKNOWN";
  question: PhysicianInterviewQuestion;
  sourceItemIndex?: number;
}): PhysicianHairHistoryItem {
  return {
    id: input.id,
    layer: input.layer,
    itemType: input.itemType,
    label: input.label,
    value: input.value,
    ...(input.date ? { date: input.date } : {}),
    datePrecision: input.datePrecision,
    source: "PATIENT",
    included: true,
    editable: true,
    sourceQuestionCode: input.question.code,
    sourceScopeKey: input.question.responseScopeKey,
    ...(input.question.responseId ? { sourceResponseId: input.question.responseId } : {}),
    ...(input.sourceItemIndex !== undefined ? { sourceItemIndex: input.sourceItemIndex } : {}),
  };
}

function historicalMeasure(
  question: PhysicianInterviewQuestion,
  metricCode: string,
  eventDate: { date?: string; datePrecision: "MONTH" | "YEAR" | "UNKNOWN" },
): PhysicianHairHistoryItem | null {
  const value = asScale(question.value);
  if (value === null) return null;
  const label = METRIC_LABELS[metricCode] ?? question.text;
  return makeItem({
    id: derivedId(question, metricCode),
    layer: "MEASURES",
    itemType: "PATIENT_MEASURE",
    label,
    value: { metricCode, value },
    ...eventDate,
    question,
  });
}

function reviewedValueIdentity(item: PhysicianHairHistoryItem): string {
  if (!item.sourceResponseId || !item.sourceQuestionCode || !item.sourceScopeKey) return `id:${item.id}`;
  return [
    item.sourceResponseId,
    item.sourceQuestionCode,
    item.sourceScopeKey,
    item.sourceItemIndex ?? "single",
    item.itemType,
  ].join("\u0000");
}

/**
 * Keeps one effective clinical presentation per patient-history provenance.
 * A physician-reviewed value replaces the patient value on the primary surface;
 * the original remains in persisted audit provenance rather than appearing as a
 * second active answer.
 */
export function effectiveReviewedHairHistoryItems(
  items: readonly PhysicianHairHistoryItem[],
): PhysicianHairHistoryItem[] {
  const effective = new Map<string, PhysicianHairHistoryItem>();
  const order: string[] = [];
  for (const item of items) {
    const key = reviewedValueIdentity(item);
    const current = effective.get(key);
    if (!current) {
      order.push(key);
      effective.set(key, item);
      continue;
    }
    if (item.source === "PHYSICIAN" || current.source !== "PHYSICIAN") effective.set(key, item);
  }
  return order.map((key) => effective.get(key)!);
}

export function derivePatientHairHistory(
  questions: PhysicianInterviewQuestion[],
  sourceVisitId: string | undefined,
  sourceVisitAt: string | undefined,
): Omit<PhysicianHairHistory, "clinicalReferenceAt"> {
  if (!sourceVisitId || !sourceVisitAt) {
    return { status: "PATIENT_REPORTED_PREVIEW", baseRevision: 0, items: [] };
  }

  const items: PhysicianHairHistoryItem[] = [];
  const byCode = new Map(questions.map((question) => [question.code, question]));

  const sheddingOnset = byCode.get("Q_HAIR_SHEDDING_ONSET");
  if (sheddingOnset) {
    const date = normalizeDate(sheddingOnset.value);
    items.push(makeItem({
      id: derivedId(sheddingOnset), layer: "SYMPTOMS", itemType: "SHEDDING_ONSET",
      label: { ar: "بداية تساقط الشعر", en: "Hair-shedding onset" },
      value: { kind: "ONSET", metricCode: "SHEDDING" }, ...date, question: sheddingOnset,
    }));
  }

  const thinningOnset = byCode.get("Q_HAIR_THINNING_ONSET");
  if (thinningOnset) {
    const date = normalizeDate(thinningOnset.value);
    items.push(makeItem({
      id: derivedId(thinningOnset), layer: "SYMPTOMS", itemType: "DENSITY_ONSET",
      label: { ar: "بداية ترقق الشعر أو نقص الكثافة", en: "Hair-thinning / density-loss onset" },
      value: { kind: "ONSET", metricCode: "DENSITY" }, ...date, question: thinningOnset,
    }));
  }

  const shedding = byCode.get("Q_HAIR_SHEDDING_SEVERITY");
  if (shedding) {
    const item = historicalMeasure(
      shedding,
      "SHEDDING",
      sheddingOnset ? normalizeDate(sheddingOnset.value) : { datePrecision: "UNKNOWN" },
    );
    if (item) items.push(item);
  }
  const density = byCode.get("Q_HAIR_DENSITY_SEVERITY");
  if (density) {
    const item = historicalMeasure(
      density,
      "DENSITY",
      thinningOnset ? normalizeDate(thinningOnset.value) : { datePrecision: "UNKNOWN" },
    );
    if (item) items.push(item);
  }

  for (const question of questions.filter((candidate) => candidate.code === "Q_SCALP_SYMPTOM_DETAILS")) {
    const scopeCode = question.responseScopeKey.split(":").at(-1) ?? "";
    const metricCode = SCALP_SCOPE_TO_METRIC[scopeCode];
    if (!metricCode) continue;
    const detail = isRecord(question.value) ? question.value : null;
    if (!detail) continue;
    const onset = normalizeDate(detail.onset);
    items.push(makeItem({
      id: derivedId(question, `${metricCode}:onset`), layer: "SYMPTOMS", itemType: `${metricCode}_ONSET`,
      label: { ar: `بداية ${METRIC_LABELS[metricCode].ar}`, en: `${METRIC_LABELS[metricCode].en} onset` },
      value: { kind: "ONSET", metricCode }, ...onset, question,
    }));
    const severity = asScale(detail.severity);
    if (severity !== null) {
      items.push(makeItem({
        id: derivedId(question, `${metricCode}:measure`), layer: "MEASURES", itemType: "PATIENT_MEASURE",
        label: METRIC_LABELS[metricCode], value: { metricCode, value: severity },
        ...onset, question,
      }));
    }
  }

  for (const priorDiagnosis of questions.filter((candidate) => candidate.code === "Q_PRIOR_DIAGNOSIS_DETAILS")) {
    asItems(priorDiagnosis).forEach((raw, index) => {
      if (!isRecord(raw)) return;
      const code = safeText(raw.diagnosis);
      if (!code) return;
      const localized = resolvedClinicalLabel({ questions, code, raw, otherQuestionCode: "Q_PRIOR_DIAGNOSIS_OTHER" });
      const date = normalizeDate(raw.date);
      items.push(makeItem({
        id: derivedId(priorDiagnosis, String(index)), layer: "DIAGNOSES", itemType: "PRIOR_DIAGNOSIS",
        label: localized, value: { diagnosis: code }, ...date, question: priorDiagnosis, sourceItemIndex: index,
      }));
    });
  }

  const biopsyDate = byCode.get("Q_SCALP_BIOPSY_DATE");
  if (biopsyDate) {
    const date = normalizeDate(biopsyDate.value);
    const area = safeText(byCode.get("Q_SCALP_BIOPSY_AREA")?.value);
    const result = safeText(byCode.get("Q_SCALP_BIOPSY_RESULT_TEXT")?.value);
    items.push(makeItem({
      id: derivedId(biopsyDate), layer: "DIAGNOSES", itemType: "SCALP_BIOPSY",
      label: { ar: "خزعة فروة الرأس", en: "Scalp biopsy" },
      value: { ...(area ? { area } : {}), ...(result ? { result } : {}) }, ...date, question: biopsyDate,
    }));
  }

  for (const treatments of questions.filter((candidate) => candidate.code === "Q_HAIR_TREATMENT_ITEMS")) {
    asItems(treatments).forEach((raw, index) => {
      if (!isRecord(raw)) return;
      const name = safeText(raw.name);
      if (!name) return;
      const start = normalizeDate(raw.start);
      const stop = normalizeDate(raw.stop);
      items.push(makeItem({
        id: derivedId(treatments, String(index)), layer: "TREATMENTS", itemType: "TREATMENT_INTERVAL",
        label: { ar: name, en: name },
        value: { name, stillUsing: raw.stillUsing === "YES", ...(stop.date ? { stopDate: stop.date, stopPrecision: stop.datePrecision } : {}) },
        ...start, question: treatments, sourceItemIndex: index,
      }));
    });
  }

  for (const procedures of questions.filter((candidate) => candidate.code === "Q_HAIR_PROCEDURE_DETAILS")) {
    asItems(procedures).forEach((raw, index) => {
      if (!isRecord(raw)) return;
      const procedure = safeText(raw.procedure);
      if (!procedure) return;
      const date = normalizeDate(raw.lastDate);
      const count = typeof raw.count === "number" || typeof raw.count === "string" ? String(raw.count).slice(0, 30) : undefined;
      items.push(makeItem({
        id: derivedId(procedures, String(index)), layer: "PROCEDURES", itemType: "PROCEDURE",
        label: resolvedClinicalLabel({ questions, code: procedure, raw }),
        value: { procedure, ...(count ? { count } : {}) }, ...date, question: procedures, sourceItemIndex: index,
      }));
    });
  }

  for (const triggers of questions.filter((candidate) => [
    "Q_TRIGGER_EVENT_DETAILS",
    "Q_TRIGGER_EVENTS_FEMALE_DETAILS",
    "Q_TRIGGER_EVENTS_MALE_DETAILS",
  ].includes(candidate.code))) {
    asItems(triggers).forEach((raw, index) => {
      if (!isRecord(raw)) return;
      const event = safeText(raw.event);
      if (!event) return;
      const date = normalizeDate(raw.date);
      items.push(makeItem({
        id: derivedId(triggers, String(index)), layer: "TRIGGERS", itemType: "TRIGGER_EVENT",
        label: resolvedClinicalLabel({ questions, code: event, raw }), value: { event, ...(recordDetail(raw) ? { details: recordDetail(raw) } : {}) },
        ...date, question: triggers, sourceItemIndex: index,
      }));
    });
  }

  items.sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.layer.localeCompare(b.layer);
  });

  return {
    status: "PATIENT_REPORTED_PREVIEW",
    sourceVisitId,
    sourceVisitAt,
    baseRevision: 0,
    items,
  };
}

export function hairHistoryLayerLabel(layer: PhysicianHairHistoryLayer): PhysicianLocalizedText {
  return LAYER_LABELS[layer];
}
