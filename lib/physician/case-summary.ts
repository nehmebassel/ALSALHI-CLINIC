import type {
  PhysicianCaseSummary,
  PhysicianHairHistory,
  PhysicianInterviewQuestion,
  PhysicianLocalizedText,
  PhysicianMeasurementSeries,
  PhysicianVisitSummary,
} from "./types";
import { presentClinicalValue } from "./presentation";

function firstQuestion(questions: PhysicianInterviewQuestion[], code: string): PhysicianInterviewQuestion | undefined {
  return questions.find((question) => question.code === code);
}

function localizedValues(question: PhysicianInterviewQuestion | undefined): PhysicianLocalizedText[] {
  if (!question) return [];
  const ar = presentClinicalValue(question, "ar").lines;
  const en = presentClinicalValue(question, "en").lines;
  return Array.from({ length: Math.max(ar.length, en.length) }, (_, index) => ({ ar: ar[index] ?? en[index] ?? "—", en: en[index] ?? ar[index] ?? "—" }));
}

function uniqueLocalized(values: PhysicianLocalizedText[]): PhysicianLocalizedText[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.ar}\u0000${value.en}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function knownValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "string") return !["UNKNOWN", "UNSURE", "DONT_REMEMBER"].includes(value);
  if (Array.isArray(value)) return value.some(knownValue);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.precision === "UNKNOWN" || record.calendar === "UNKNOWN") return false;
  }
  return true;
}

function localizedRawValue(question: PhysicianInterviewQuestion, value: unknown): PhysicianLocalizedText[] {
  if (!knownValue(value)) return [];
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const ar = typeof record.ar === "string" ? record.ar.trim() : "";
    const en = typeof record.en === "string" ? record.en.trim() : "";
    if (ar || en) return [{ ar: ar || en, en: en || ar }];
  }
  const copy = { ...question, value, repeatableItems: [] };
  const ar = presentClinicalValue(copy, "ar").lines;
  const en = presentClinicalValue(copy, "en").lines;
  return Array.from({ length: Math.max(ar.length, en.length) }, (_, index) => ({
    ar: ar[index] ?? en[index] ?? "—",
    en: en[index] ?? ar[index] ?? "—",
  }));
}

function selectedValues(question: PhysicianInterviewQuestion | undefined, excluded: readonly string[] = []): PhysicianLocalizedText[] {
  if (!question) return [];
  const raw = Array.isArray(question.value) ? question.value : [question.value];
  return uniqueLocalized(raw
    .filter((value) => typeof value !== "string" || !excluded.includes(value))
    .flatMap((value) => localizedRawValue(question, value)));
}

function namedRepeatableValues(
  questions: PhysicianInterviewQuestion[],
  codes: readonly string[],
  names: readonly string[],
  predicate: (item: Record<string, unknown>) => boolean = () => true,
): PhysicianLocalizedText[] {
  const values: PhysicianLocalizedText[] = [];
  for (const code of codes) {
    const question = firstQuestion(questions, code);
    if (!question) continue;
    const source = question.repeatableItems.length > 0
      ? question.repeatableItems
      : Array.isArray(question.value)
        ? question.value
        : [question.value];
    for (const raw of source) {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
      const item = raw as Record<string, unknown>;
      if (!predicate(item)) continue;
      const candidate = names.map((name) => item[name]).find(knownValue);
      if (candidate !== undefined) values.push(...localizedRawValue(question, candidate));
    }
  }
  return uniqueLocalized(values);
}

function mainConcern(questions: PhysicianInterviewQuestion[], primaryCode?: string): PhysicianLocalizedText[] {
  const codes = primaryCode === "RV_HAIR_QUALITY"
    ? ["Q_HQ_CURRENT_PROBLEMS", "Q_HQ_HAIR_STATE"]
    : primaryCode === "RV_SCALP_SYMPTOMS"
      ? ["Q_SCALP_SYMPTOMS"]
      : primaryCode === "RV_DERMATOLOGY"
        ? ["Q_DERMATOLOGY_CONCERN"]
        : primaryCode === "RV_LASER"
          ? ["Q_LASER_CONCERNS"]
          : primaryCode === "RV_AESTHETIC_PROCEDURES"
            ? ["Q_AESTHETIC_PROCEDURES"]
            : ["Q_HAIR_CONCERN"];
  for (const code of codes) {
    const values = selectedValues(firstQuestion(questions, code), ["NONE", "NONE_OF_THE_ABOVE"]);
    if (values.length > 0) return values;
  }
  return [];
}

function problemOnset(questions: PhysicianInterviewQuestion[], primaryCode?: string): PhysicianLocalizedText[] {
  if (primaryCode === "RV_HAIR_LOSS") {
    const concern = firstQuestion(questions, "Q_HAIR_CONCERN")?.value;
    const branches = concern === "SHEDDING"
      ? [["Q_HAIR_SHEDDING_ONSET", "التساقط", "Shedding"]]
      : concern === "THINNING"
        ? [["Q_HAIR_THINNING_ONSET", "الترقق", "Thinning"]]
        : concern === "BOTH"
          ? [
              ["Q_HAIR_SHEDDING_ONSET", "التساقط", "Shedding"],
              ["Q_HAIR_THINNING_ONSET", "الترقق", "Thinning"],
            ]
          : [];
    return uniqueLocalized(branches.flatMap(([code, arLabel, enLabel]) => {
      const question = firstQuestion(questions, code);
      if (!question) return [];
      return localizedRawValue(question, question.value).map((value) => ({
        ar: `${arLabel}: ${value.ar}`,
        en: `${enLabel}: ${value.en}`,
      }));
    }));
  }
  if (primaryCode === "RV_SCALP_SYMPTOMS") {
    const question = firstQuestion(questions, "Q_SCALP_SYMPTOM_DETAILS");
    if (!question) return [];
    return namedRepeatableValues(questions, [question.code], ["onset"]);
  }
  return [];
}

function importantContext(questions: PhysicianInterviewQuestion[]): PhysicianCaseSummary["importantContext"] {
  const rows: PhysicianCaseSummary["importantContext"] = [];
  const add = (row: PhysicianCaseSummary["importantContext"][number]) => {
    if (row.values.length > 0) rows.push({ ...row, values: uniqueLocalized(row.values) });
  };
  const questionValues = (codes: readonly string[], excluded: readonly string[] = []) => uniqueLocalized(codes.flatMap((code) => selectedValues(firstQuestion(questions, code), excluded)));

  add({ code: "MARITAL_SOCIAL_STATUS", label: { ar: "الحالة الاجتماعية", en: "Marital / social status" }, values: questionValues(["Q_PROFILE_MARITAL_STATUS"]) });
  add({ code: "CONTRACEPTIVE_USE", label: { ar: "موانع الحمل", en: "Contraceptive use" }, values: questionValues(["Q_WOMEN_CONTRACEPTION_STATUS", "Q_WOMEN_CONTRACEPTION_TYPE", "Q_WOMEN_CONTRACEPTION_NAME"]) });
  add({ code: "PREGNANCY_BREASTFEEDING_CONTEXT", label: { ar: "الحمل / الرضاعة", en: "Pregnancy / breastfeeding" }, values: questionValues(["Q_PREGNANCY_BREASTFEEDING_STATUS", "Q_PREGNANCY_MONTH", "Q_BREASTFEEDING_ONSET"]) });
  add({
    code: "PREVIOUSLY_DIAGNOSED_CONDITIONS",
    label: { ar: "الأمراض المشخّصة", en: "Diagnosed conditions" },
    values: uniqueLocalized([
      ...namedRepeatableValues(questions, ["Q_HEALTH_CHRONIC_ITEMS", "Q_HEALTH_TUMOR_ITEMS"], ["name"]),
      ...questionValues(["Q_PRIOR_DIAGNOSES"], ["DO_NOT_REMEMBER", "NONE"]),
      ...questionValues(["Q_PRIOR_DIAGNOSIS_OTHER"]),
    ]),
  });
  add({ code: "CURRENT_MEDICATIONS", label: { ar: "الأدوية الحالية", en: "Current medications" }, values: namedRepeatableValues(questions, ["Q_HEALTH_MEDICATION_ITEMS"], ["name"]) });
  add({ code: "ALLERGIES", label: { ar: "الحساسية", en: "Allergies" }, values: namedRepeatableValues(questions, ["Q_HEALTH_ALLERGY_ITEMS"], ["name"]) });
  add({
    code: "PREVIOUS_HAIR_THERAPIES",
    label: { ar: "علاجات الشعر السابقة", en: "Previous hair therapies" },
    values: uniqueLocalized([
      ...namedRepeatableValues(questions, ["Q_HAIR_TREATMENT_ITEMS"], ["name"], (item) => item.stillUsing !== "YES"),
      ...questionValues(["Q_HAIR_PROCEDURES"], ["NONE"]),
      ...questionValues(["Q_HQ_PREVIOUS_TREATMENTS"], ["NONE"]),
    ]),
  });
  add({
    code: "CURRENT_HAIR_THERAPIES",
    label: { ar: "علاجات الشعر الحالية", en: "Current hair therapies" },
    values: namedRepeatableValues(questions, ["Q_HAIR_TREATMENT_ITEMS"], ["name"], (item) => item.stillUsing === "YES"),
  });
  return rows;
}

function latestMeasurement(series: PhysicianMeasurementSeries) {
  return [...series.points].sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function buildPhysicianCaseSummary(input: {
  questions: PhysicianInterviewQuestion[];
  reviewVisit?: PhysicianVisitSummary;
  measurementSeries: PhysicianMeasurementSeries[];
  historyApproved: boolean;
  hairHistoryApplicable: boolean;
  hairHistoryReviewRequired?: boolean;
  physicianJourneyApplicable: boolean;
  physicianJourneyHasData?: boolean;
  latestDiagnosis?: PhysicianLocalizedText;
  previousVisitAt?: string;
  patientHairHistory?: PhysicianHairHistory;
}): PhysicianCaseSummary {
  const { questions, reviewVisit, measurementSeries } = input;
  const concern = firstQuestion(questions, "Q_HAIR_CONCERN")
    ?? firstQuestion(questions, "Q_HQ_HAIR_STATE")
    ?? firstQuestion(questions, "Q_DERMATOLOGY_CONCERN")
    ?? firstQuestion(questions, "Q_LASER_CONCERNS")
    ?? firstQuestion(questions, "Q_AESTHETIC_PROCEDURES");

  const snapshotConcern = mainConcern(questions, reviewVisit?.primaryCode);
  const currentConcern = snapshotConcern.length > 0 ? snapshotConcern : localizedValues(concern);
  if (currentConcern.length === 0 && reviewVisit) currentConcern.push(reviewVisit.primary);

  const attention: PhysicianLocalizedText[] = [];
  const reviewPending = reviewVisit
    ? (reviewVisit.patientReviewState ? reviewVisit.patientReviewState === "PENDING" : reviewVisit.interviewStatus === "UNDER_REVIEW")
    : false;
  if (reviewPending) {
    attention.push({ ar: "المقابلة الحالية تحتاج مراجعة الطبيب", en: "The current interview requires physician review" });
  }
  const hairHistoryReviewRequired = input.hairHistoryReviewRequired ?? input.hairHistoryApplicable;
  if (hairHistoryReviewRequired && !input.historyApproved) {
    attention.push({ ar: "تاريخ الشعر لم يُعتمد بعد", en: "Hair History has not been approved yet" });
  }
  if (reviewVisit?.visitType === "FOLLOW_UP" && reviewVisit.hasFollowUpDelta) {
    attention.push({ ar: "توجد تغييرات مسجلة منذ الزيارة السابقة", en: "Changes have been recorded since the previous visit" });
  }

  const patientReportedMeasures: PhysicianCaseSummary["patientReportedMeasures"] = [];
  if (input.patientHairHistory) {
    const seen = new Set<string>();
    for (const item of input.patientHairHistory.items) {
      if (!item.included || item.layer !== "MEASURES" || typeof item.value !== "object" || item.value === null || Array.isArray(item.value)) continue;
      const payload = item.value as Record<string, unknown>;
      const metricCode = typeof payload.metricCode === "string" ? payload.metricCode : "";
      const raw = payload.value;
      const numeric = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : undefined;
      if (!metricCode || numeric === undefined || seen.has(metricCode)) continue;
      seen.add(metricCode);
      patientReportedMeasures.push({
        code: metricCode,
        label: item.label,
        value: numeric,
        ...(item.date ? { date: item.date } : {}),
        source: "PATIENT",
        modifiedByPhysician: item.source === "PHYSICIAN",
      });
    }
  } else {
    for (const [code, label] of [
      ["Q_HAIR_SHEDDING_SEVERITY", { ar: "التساقط", en: "Shedding" }],
      ["Q_HAIR_DENSITY_SEVERITY", { ar: "نقص الكثافة", en: "Density loss" }],
    ] as const) {
      const question = firstQuestion(questions, code);
      const raw = question?.value;
      const numeric = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : undefined;
      if (numeric !== undefined) patientReportedMeasures.push({ code, label, value: numeric, source: "PATIENT", modifiedByPhysician: false });
    }
  }

  const physicianMeasures = measurementSeries.flatMap((series) => {
    const point = latestMeasurement(series);
    return point && Number.isFinite(point.value) && point.value >= 0 && point.value <= 5
      ? [{ code: series.code, label: series.label, value: point.value, date: point.date, source: "PHYSICIAN" as const }]
      : [];
  });

  return {
    reviewStatus: reviewPending ? "UNDER_REVIEW" : "COMPLETED",
    visitType: reviewVisit?.visitType,
    visitReason: reviewVisit?.primary,
    additionalReasons: reviewVisit?.additional ?? [],
    currentConcern,
    mainConcern: snapshotConcern,
    problemOnset: problemOnset(questions, reviewVisit?.primaryCode),
    importantContext: importantContext(questions),
    needsAttention: attention,
    latestDiagnosis: input.latestDiagnosis,
    patientReportedMeasures,
    physicianMeasures,
    historyStatus: !input.hairHistoryApplicable ? "NOT_APPLICABLE" : input.historyApproved ? "APPROVED" : "PENDING",
    physicianJourneyStatus: !input.physicianJourneyApplicable ? "NOT_APPLICABLE" : (input.physicianJourneyHasData ?? physicianMeasures.length > 0) ? "STARTED" : "NOT_STARTED",
    lastPhysicianVisit: input.previousVisitAt,
  };
}
