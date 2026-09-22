import { formatClinicalApproxDate, isClinicalApproxDateValue } from "@/lib/p01/clinical-date";
import { localeNumber, localizeDigits } from "@/lib/p01/locale";
import { formatClinicDate } from "@/lib/platform/date-time";
import type { JsonValue } from "@/lib/patient-access/service";
import {
  PHYSICIAN_ANATOMICAL_REGION_CODES,
  PHYSICIAN_TRICHOSCOPY_FINDINGS,
  type PhysicianAnatomicalRegionCode,
} from "@/lib/physician/visit-clinical-contracts";

export type WorkspaceLocale = "ar" | "en";

export type WorkspaceDraftSections = Record<string, unknown>;

export function freshWorkspaceSections(value: unknown): WorkspaceDraftSections {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const envelope = value as Record<string, unknown>;
  if (
    envelope.schemaVersion !== "FPV_DRAFT_V1" ||
    typeof envelope.sections !== "object" ||
    envelope.sections === null ||
    Array.isArray(envelope.sections)
  ) return {};
  return structuredClone(envelope.sections as WorkspaceDraftSections);
}

export function deriveMcuFvWorkspaceCode(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "—";
  const item = value as Record<string, unknown>;
  if (typeof item.basic !== "string") return "—";
  return `${item.basic}${typeof item.frontal === "string" ? item.frontal : ""}${typeof item.vertex === "string" ? item.vertex : ""}`;
}

export function workspaceErrorMessage(code: string | undefined, locale: WorkspaceLocale): string {
  const messages: Record<string, { ar: string; en: string }> = {
    DRAFT_CONFLICT: {
      ar: "حُفظت نسخة أحدث من المسودة. احتفظنا بتعديلاتك هنا؛ راجع التغييرات قبل المتابعة.",
      en: "A newer Draft was saved. Your edits remain here; review the changes before continuing.",
    },
    PATIENT_CONTEXT_VERSION_CONFLICT: {
      ar: "تغيّر سياق المراجع منذ فتح الصفحة. أعدنا تحميل النسخة الحالية قبل تسجيل الدليل.",
      en: "Patient Context changed after this page opened. The current version has been reloaded before evidence is recorded.",
    },
    AUTHENTICATION_REQUIRED: { ar: "انتهت جلسة الدخول.", en: "Your sign-in session has ended." },
    ACTION_NOT_ALLOWED: { ar: "هذا الإجراء غير متاح لصلاحيتك.", en: "This action is not available for your role." },
    PHYSICIAN_FINALIZATION_REQUIRED: { ar: "اعتماد الزيارة متاح للطبيب فقط.", en: "Only a physician can Finalize the Visit." },
    PHYSICIAN_VISIT_ALREADY_FINALIZED: { ar: "هذه الزيارة معتمدة ولا تقبل تعديل المسودة.", en: "This Visit is finalized and its Draft cannot be edited." },
    VISIT_CORRECTION_WINDOW_CLOSED: { ar: "انتهت نافذة التصحيح المباشر لهذه الزيارة.", en: "The direct-correction window for this Visit has closed." },
    INVALID_LONGITUDINAL_TARGET: { ar: "لم يعد هدف القرار الطولي صالحًا في موضع هذه الزيارة.", en: "The longitudinal decision target is no longer valid at this Visit position." },
    LONGITUDINAL_DECISION_CONFLICT: { ar: "يتعارض القرار مع الحالة الطبية الفعالة الحالية.", en: "The decision conflicts with the current Effective Physician State." },
    ENCOUNTER_NOT_BEGUN: { ar: "ابدأ المقابلة السريرية قبل اعتماد الزيارة.", en: "Begin the Encounter before Finalizing the Visit." },
    INVALID_CLINICAL_DATA: { ar: "توجد قيمة سريرية غير صالحة. راجع الحقول المحددة.", en: "A clinical value is invalid. Review the selected fields." },
  };
  return (code && messages[code] ? messages[code] : {
    ar: "تعذر إكمال الإجراء. أعد المحاولة أو حدّث الصفحة.",
    en: "The action could not be completed. Try again or refresh the page.",
  })[locale];
}

const CONTEXT_HIDDEN_KEYS = new Set([
  "id",
  "questionCode",
  "subtype",
  "sourceQuestionCode",
  "sourceResponseId",
  "sourceScopeKey",
  "sourceItemIndex",
]);

type LocalizedLabel = { ar: string; en: string };

const CONTEXT_QUESTION_LABELS: Record<string, LocalizedLabel> = {
  Q_WOMEN_CONTRACEPTION_STATUS: { ar: "حالة الاستخدام", en: "Use status" },
  Q_WOMEN_CONTRACEPTION_TYPE: { ar: "نوع الوسيلة", en: "Method type" },
  Q_WOMEN_CONTRACEPTION_NAME: { ar: "اسم الوسيلة أو الدواء", en: "Method or medication name" },
  Q_PREGNANCY_BREASTFEEDING_STATUS: { ar: "حالة الحمل أو الرضاعة", en: "Pregnancy or breastfeeding status" },
  Q_PREGNANCY_MONTH: { ar: "شهر الحمل", en: "Pregnancy month" },
  Q_BREASTFEEDING_ONSET: { ar: "بداية الرضاعة", en: "Breastfeeding began" },
  Q_HEALTH_CHRONIC_ITEMS: { ar: "مرض مزمن", en: "Chronic condition" },
  Q_HEALTH_TUMOR_ITEMS: { ar: "ورم سابق أو حالي", en: "Past or current tumor" },
  Q_PRIOR_DIAGNOSES: { ar: "تشخيص سابق للشعر أو فروة الرأس", en: "Prior hair or scalp diagnosis" },
  Q_PRIOR_DIAGNOSIS_DETAILS: { ar: "تفاصيل التشخيص السابق", en: "Prior diagnosis details" },
  Q_PRIOR_DIAGNOSIS_OTHER: { ar: "تشخيص سابق آخر", en: "Other prior diagnosis" },
  Q_HEALTH_MEDICATION_ITEMS: { ar: "دواء حالي", en: "Current medication" },
  Q_HEALTH_ALLERGY_ITEMS: { ar: "حساسية معروفة", en: "Known allergy" },
  Q_HAIR_TREATMENT_ITEMS: { ar: "علاج أو دواء للشعر", en: "Hair treatment or medication" },
  Q_HAIR_PROCEDURES: { ar: "إجراء سابق للشعر", en: "Prior hair procedure" },
  Q_HAIR_PROCEDURE_DETAILS: { ar: "تفاصيل الإجراء السابق", en: "Prior procedure details" },
};

const CONTEXT_FIELD_LABELS: Record<string, LocalizedLabel> = {
  value: { ar: "القيمة", en: "Value" },
  name: { ar: "الاسم", en: "Name" },
  dose: { ar: "الجرعة", en: "Dose" },
  frequency: { ar: "التكرار", en: "Frequency" },
  details: { ar: "التفاصيل", en: "Details" },
  date: { ar: "التاريخ التقريبي", en: "Approximate date" },
  start: { ar: "تاريخ البداية التقريبي", en: "Approximate start date" },
  stop: { ar: "تاريخ التوقف التقريبي", en: "Approximate stop date" },
  stillUsing: { ar: "الاستخدام الحالي", en: "Current use" },
  diagnosis: { ar: "التشخيص", en: "Diagnosis" },
  procedure: { ar: "الإجراء", en: "Procedure" },
  count: { ar: "العدد التقريبي", en: "Approximate count" },
  lastDate: { ar: "تاريخ آخر إجراء", en: "Most recent procedure date" },
  type: { ar: "النوع", en: "Type" },
  typeText: { ar: "تفاصيل النوع", en: "Type details" },
  status: { ar: "الحالة", en: "Status" },
  notes: { ar: "ملاحظات", en: "Notes" },
  otherText: { ar: "تفاصيل أخرى", en: "Other details" },
};

const CONTEXT_VALUE_LABELS: Record<string, LocalizedLabel> = {
  YES: { ar: "نعم", en: "Yes" },
  NO: { ar: "لا", en: "No" },
  UNSURE: { ar: "غير متأكد/ة", en: "Unsure" },
  UNKNOWN: { ar: "غير معروف", en: "Unknown" },
  DONT_REMEMBER: { ar: "لا أتذكر", en: "I do not remember" },
  MARRIED: { ar: "متزوج/ة", en: "Married" },
  NOT_MARRIED: { ar: "غير متزوج/ة", en: "Not married" },
  CURRENT: { ar: "يُستخدم حاليًا", en: "Currently using" },
  STOPPED: { ar: "أُوقف مؤخرًا", en: "Stopped recently" },
  CHANGED: { ar: "تغيّر مؤخرًا", en: "Changed recently" },
  PREGNANT: { ar: "حامل حاليًا", en: "Pregnant" },
  BREASTFEEDING: { ar: "ترضع حاليًا", en: "Breastfeeding" },
  BOTH: { ar: "حامل وترضع", en: "Pregnant and breastfeeding" },
  PILLS: { ar: "حبوب منع الحمل", en: "Contraceptive pills" },
  HORMONAL_IUD: { ar: "لولب هرموني", en: "Hormonal IUD" },
  COPPER_IUD: { ar: "لولب نحاسي", en: "Copper IUD" },
  IMPLANT: { ar: "شريحة", en: "Implant" },
  INJECTION: { ar: "حقنة", en: "Injection" },
  PATCH_RING: { ar: "لاصقة أو حلقة مهبلية", en: "Patch or vaginal ring" },
  // Exact governed Q_PRIOR_DIAGNOSES option labels from lib/p01/contracts.ts.
  PATTERN_HAIR_LOSS: { ar: "تساقط الشعر النمطي (الوراثي)", en: "Pattern Hair Loss (Androgenetic Alopecia)" },
  TRICHOTILLOMANIA: { ar: "نتف الشعر", en: "Trichotillomania" },
  TRACTION_ALOPECIA: { ar: "ثعلبة الشد / تساقط الشعر بسبب الشد", en: "Traction alopecia" },
  POSTPARTUM_SHEDDING: { ar: "تساقط الشعر بعد الولادة أو أثناء الرضاعة", en: "Postpartum or breastfeeding-related hair shedding" },
  TINEA_CAPITIS: { ar: "فطريات فروة الرأس", en: "Tinea capitis / scalp fungal infection" },
  LUPUS: { ar: "الذئبة", en: "Lupus" },
  ALOPECIA_AREATA: { ar: "الثعلبة المناعية", en: "Alopecia areata" },
  TELOGEN_EFFLUVIUM: { ar: "التساقط الكربي", en: "Telogen effluvium" },
  SCARRING_ALOPECIA: { ar: "تساقط الشعر الندبي", en: "Scarring alopecia" },
  SEBORRHEIC_DERMATITIS: { ar: "القشرة أو التهاب الجلد الدهني", en: "Seborrheic dermatitis / dandruff" },
  SCALP_PSORIASIS: { ar: "صدفية فروة الرأس", en: "Scalp psoriasis" },
  SCALP_ROSACEA: { ar: "وردية فروة الرأس", en: "Scalp rosacea" },
  SCALP_ALLERGY: { ar: "حساسية فروة الرأس", en: "Sensitive scalp" },
  HAIR_FRAGILITY: { ar: "هشاشة الشعر أو تكسره", en: "Hair fragility or breakage" },
  DO_NOT_REMEMBER: { ar: "لا أتذكر التشخيص", en: "I do not remember the diagnosis" },
  PRP: { ar: "البلازما الغنية بالصفائح الدموية", en: "PRP / Platelet-Rich Plasma" },
  MICRONEEDLING: { ar: "المايكرونيدلينغ", en: "Microneedling" },
  HAIR_LASER: { ar: "ليزر تحفيز الشعر", en: "Hair Stimulation Laser" },
  RED_LIGHT: { ar: "العلاج بالضوء الأحمر", en: "Red Light Therapy" },
  MINOXIDIL_INJ: { ar: "حقن المينوكسيديل", en: "Minoxidil Injections" },
  DUTASTERIDE_INJ: { ar: "حقن الدوتاستيرايد", en: "Dutasteride Injections" },
  EXOSOME: { ar: "علاج الإكسوزوم", en: "Exosome Therapy" },
  CORTISONE_INJ: { ar: "حقن الكورتيزون", en: "Corticosteroid Injections" },
  REGENERA: { ar: "ريجينيرا / ريجينيرا أكتيفا", en: "Regenera / Regenera Activa" },
  ACELL: { ar: "إي سيل", en: "ACell" },
  HAIR_TRANSPLANT: { ar: "زراعة الشعر", en: "Hair Transplantation" },
  OTHER: { ar: "أخرى", en: "Other" },
  POSITIVE: { ar: "إيجابي", en: "Positive" },
  NEGATIVE: { ar: "سلبي", en: "Negative" },
  NOT_RECORDED: { ar: "غير مسجل", en: "Not recorded" },
  UNIVERSAL: { ar: "عام", en: "Universal" },
  FRONTAL_THINNER: { ar: "أرق أماميًا", en: "Frontal thinner" },
  CROWN_THINNER: { ar: "أرق عند التاج", en: "Crown thinner" },
  VERTEX_THINNER: { ar: "أرق عند القمة", en: "Vertex thinner" },
};

function contextScalar(value: unknown, locale: WorkspaceLocale): string {
  if (value === null || value === undefined || value === "") return locale === "ar" ? "غير مسجل" : "Not recorded";
  if (typeof value === "boolean") return value ? (locale === "ar" ? "نعم" : "Yes") : (locale === "ar" ? "لا" : "No");
  if (typeof value === "number") return localeNumber(value, locale);
  const raw = String(value);
  const presented = CONTEXT_VALUE_LABELS[raw]?.[locale] ?? raw;
  return locale === "ar" ? localizeDigits(presented, "ar") : presented;
}

export type PresentedPatientContextField = { label: string | null; values: string[] };
export type PresentedPatientContextItem = { title: string | null; fields: PresentedPatientContextField[] };

function localizedLabel(value: LocalizedLabel | undefined, locale: WorkspaceLocale): string | null {
  return value?.[locale] ?? null;
}

function contextLeafValues(value: unknown, locale: WorkspaceLocale): string[] {
  if (isClinicalApproxDateValue(value as JsonValue)) {
    return [formatClinicalApproxDate(value as JsonValue, locale)];
  }
  if (Array.isArray(value)) return value.flatMap((item) => contextLeafValues(item, locale));
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !CONTEXT_HIDDEN_KEYS.has(key) && !key.startsWith("__"))
      .flatMap(([, item]) => contextLeafValues(item, locale));
  }
  return [contextScalar(value, locale)];
}

function contextFields(value: unknown, locale: WorkspaceLocale, outerLabel?: string | null): PresentedPatientContextField[] {
  if (typeof value === "object" && value !== null && !Array.isArray(value) && !isClinicalApproxDateValue(value as JsonValue)) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !CONTEXT_HIDDEN_KEYS.has(key) && !key.startsWith("__"));
    if (entries.length) {
      return entries.map(([key, item]) => ({
        label: localizedLabel(CONTEXT_FIELD_LABELS[key], locale) ?? outerLabel ?? (locale === "ar" ? "تفصيل" : "Detail"),
        values: contextLeafValues(item, locale),
      }));
    }
  }
  return [{ label: outerLabel ?? null, values: contextLeafValues(value, locale) }];
}

function sourcePresentation(source: unknown, locale: WorkspaceLocale): PresentedPatientContextItem[] {
  const record = typeof source === "object" && source !== null && !Array.isArray(source)
    ? source as Record<string, unknown>
    : null;
  const questionLabel = record && typeof record.questionCode === "string"
    ? localizedLabel(CONTEXT_QUESTION_LABELS[record.questionCode], locale)
    : null;
  const raw = record && "value" in record ? record.value : source;
  if (Array.isArray(raw)) {
    return raw.map((item) => ({ title: questionLabel, fields: contextFields(item, locale) }));
  }
  return [{ title: questionLabel, fields: contextFields(raw, locale, questionLabel) }];
}

/**
 * Presentation-only view of the canonical Patient Context payload. List items
 * remain separate, repeated values remain repeated, and governed source/field
 * labels replace internal question codes.
 */
export function presentPatientContextValue(value: unknown, locale: WorkspaceLocale): PresentedPatientContextItem[] {
  const record = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (record && Array.isArray(record.items)) return record.items.flatMap((item) => sourcePresentation(item, locale));
  if (record && Array.isArray(record.fields)) {
    const fields = record.fields.map((item) => {
      const source = typeof item === "object" && item !== null && !Array.isArray(item) ? item as Record<string, unknown> : {};
      const label = typeof source.questionCode === "string"
        ? localizedLabel(CONTEXT_QUESTION_LABELS[source.questionCode], locale)
        : null;
      return { label, values: contextLeafValues(source.value, locale) };
    });
    return [{ title: null, fields }];
  }
  if (record && "value" in record) return sourcePresentation(record.value, locale);
  return sourcePresentation(value, locale);
}

export type WorkspaceEffectiveState = {
  diagnoses: Array<{ diagnosisId: string; text: string }>;
  treatmentCourses: Array<{ treatmentCourseId: string; name: string; regimenText?: string | null }>;
  procedurePlans: Array<{ procedurePlanId: string; procedureCode: string; otherProcedureText?: string | null }>;
};

export function longitudinalActionLabel(action: unknown, locale: WorkspaceLocale): string {
  const labels: Record<string, LocalizedLabel> = {
    ADD: { ar: "تشخيص جديد", en: "New diagnosis" },
    REVISE: { ar: "تحديث تشخيص", en: "Diagnosis updated" },
    RESOLVE: { ar: "تشخيص زال", en: "Diagnosis resolved" },
    START: { ar: "بدء العلاج", en: "Treatment started" },
    CONTINUE_EXISTING: { ar: "استمرار العلاج", en: "Treatment continued" },
    MODIFY: { ar: "تعديل العلاج", en: "Treatment modified" },
    STOP: { ar: "إيقاف العلاج", en: "Treatment stopped" },
    PLAN: { ar: "إجراء مخطط", en: "Procedure planned" },
    PERFORM: { ar: "إجراء منفذ", en: "Procedure performed" },
    CANCEL_OR_DEFER: { ar: "إجراء ملغى أو مؤجل", en: "Procedure cancelled or deferred" },
  };
  return typeof action === "string" ? labels[action]?.[locale] ?? "—" : "—";
}

const PROCEDURE_LABELS: Record<string, LocalizedLabel> = {
  PRP: { ar: "البلازما الغنية بالصفائح الدموية", en: "PRP / Platelet-Rich Plasma" },
  MICRONEEDLING: { ar: "المايكرونيدلينغ", en: "Microneedling" },
  HAIR_LASER: { ar: "ليزر تحفيز الشعر", en: "Hair Stimulation Laser" },
  RED_LIGHT: { ar: "العلاج بالضوء الأحمر", en: "Red Light Therapy" },
  MINOXIDIL_INJ: { ar: "حقن المينوكسيديل", en: "Minoxidil Injections" },
  DUTASTERIDE_INJ: { ar: "حقن الدوتاستيرايد", en: "Dutasteride Injections" },
  EXOSOME: { ar: "علاج الإكسوزوم", en: "Exosome Therapy" },
  CORTISONE_INJ: { ar: "حقن الكورتيزون", en: "Corticosteroid Injections" },
  REGENERA: { ar: "ريجينيرا / ريجينيرا أكتيفا", en: "Regenera / Regenera Activa" },
  ACELL: { ar: "إي سيل", en: "ACell" },
  HAIR_TRANSPLANT: { ar: "زراعة الشعر", en: "Hair Transplantation" },
  OTHER: { ar: "إجراء آخر", en: "Other procedure" },
};

function procedureName(value: Record<string, unknown> | undefined, locale: WorkspaceLocale): string {
  if (!value) return locale === "ar" ? "هدف الإجراء غير متاح" : "Procedure target unavailable";
  if (value.procedureCode === "OTHER" && typeof value.otherProcedureText === "string" && value.otherProcedureText.trim()) {
    return value.otherProcedureText.trim();
  }
  return localizedLabel(PROCEDURE_LABELS[String(value.procedureCode)], locale)
    ?? (locale === "ar" ? "إجراء مسجل" : "Recorded procedure");
}

export function presentProcedurePlanTarget(
  plan: { procedureCode: string; otherProcedureText?: string | null },
  locale: WorkspaceLocale,
): string {
  return procedureName(plan as unknown as Record<string, unknown>, locale);
}

export function presentTreatmentTarget(
  treatment: { name: string; regimenText?: string | null },
): string {
  const name = treatment.name.trim();
  const regimen = typeof treatment.regimenText === "string" ? treatment.regimenText.trim() : "";
  return regimen ? `${name} — ${regimen}` : name;
}

export function presentLongitudinalDecision(
  decision: Record<string, unknown>,
  state: WorkspaceEffectiveState,
  locale: WorkspaceLocale,
): string {
  const action = String(decision.action ?? "");
  const diagnosis = state.diagnoses.find((item) => item.diagnosisId === decision.diagnosisId);
  const treatment = state.treatmentCourses.find((item) => item.treatmentCourseId === decision.treatmentCourseId);
  const plan = state.procedurePlans.find((item) => item.procedurePlanId === decision.procedurePlanId);
  const unavailable = locale === "ar" ? "العنصر السابق غير متاح. حدّث الزيارة وراجع اختيارك." : "The previous item is unavailable. Refresh the Visit and review your selection.";
  if (action === "ADD") return String(decision.text ?? unavailable);
  if (action === "REVISE") {
    const target = diagnosis?.text ?? unavailable;
    const revised = typeof decision.text === "string" ? decision.text : "";
    return revised && revised !== target
      ? (locale === "ar" ? `${target} ← الصياغة المعدلة: ${revised}` : `${target} → Revised: ${revised}`)
      : target;
  }
  if (action === "RESOLVE") return diagnosis?.text ?? unavailable;
  if (action === "START") return String(decision.name ?? unavailable);
  if (["STOP", "CONTINUE_EXISTING"].includes(action)) return treatment ? presentTreatmentTarget(treatment) : unavailable;
  if (action === "MODIFY") {
    const target = treatment ? presentTreatmentTarget(treatment) : unavailable;
    const changes = [
      typeof decision.name === "string" ? (locale === "ar" ? `الاسم: ${decision.name}` : `Name: ${decision.name}`) : "",
      typeof decision.regimenText === "string" ? (locale === "ar" ? `النظام: ${decision.regimenText}` : `Regimen: ${decision.regimenText}`) : "",
      decision.regimenText === null ? (locale === "ar" ? "حذف النظام" : "Regimen cleared") : "",
    ].filter(Boolean);
    return changes.length ? `${target} · ${changes.join(" · ")}` : target;
  }
  if (["CANCEL_OR_DEFER", "PERFORM"].includes(action) && decision.procedurePlanId) return procedureName(plan as unknown as Record<string, unknown>, locale);
  if (["PLAN", "PERFORM"].includes(action)) return procedureName(decision, locale);
  return unavailable;
}

export function canAddDiagnosisDecision(input: { action: string; targetId: string; text: string }): boolean {
  if (input.action === "ADD") return input.text.trim().length > 0;
  if (!input.targetId) return false;
  return input.action === "RESOLVE" || (input.action === "REVISE" && input.text.trim().length > 0);
}

/** Clinical details shared by pre-Finalize review and the finalized read view. */
export function presentDecisionDetails(decision: Record<string, unknown>, locale: WorkspaceLocale): string[] {
  const details: string[] = [];
  if (decision.action === "START" && typeof decision.regimenText === "string" && decision.regimenText.trim()) {
    details.push(`${locale === "ar" ? "النظام" : "Regimen"}: ${decision.regimenText}`);
  }
  if (typeof decision.noteText === "string" && decision.noteText.trim()) {
    details.push(`${locale === "ar" ? "ملاحظة الطبيب" : "Physician note"}: ${decision.noteText}`);
  }
  for (const [key, ar, en] of [["plannedDate", "التاريخ المخطط", "Planned date"], ["performedDate", "تاريخ التنفيذ", "Performed date"]] as const) {
    if (typeof decision[key] === "string" && decision[key]) details.push(`${locale === "ar" ? ar : en}: ${formatClinicDate(decision[key], locale)}`);
  }
  return details;
}

export function canAddTreatmentDecision(input: {
  action: string;
  targetId: string;
  name: string;
  regimenText: string;
  noteText?: string;
  currentName?: string;
  currentRegimenText?: string | null;
  currentNoteText?: string | null;
}): boolean {
  if (input.action === "START") return input.name.trim().length > 0;
  if (!input.targetId) return false;
  if (input.action === "MODIFY") {
    const nextName = input.name.trim();
    const nextRegimen = input.regimenText.trim();
    const nextNote = input.noteText?.trim() ?? "";
    return (nextName.length > 0 && nextName !== (input.currentName ?? "").trim())
      || (nextRegimen.length > 0 && nextRegimen !== (input.currentRegimenText ?? "").trim())
      || (nextNote.length > 0 && nextNote !== (input.currentNoteText ?? "").trim());
  }
  return input.action === "STOP" || input.action === "CONTINUE_EXISTING";
}

export type HairLinePresentation = { position: "midline" | "rightSide" | "leftSide"; label: string; value: string };

export function presentHairLineDistance(value: unknown, locale: WorkspaceLocale): HairLinePresentation[] {
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const labels: Record<HairLinePresentation["position"], LocalizedLabel> = {
    midline: { ar: "المنتصف", en: "Midline" },
    rightSide: { ar: "الجانب الأيمن", en: "Right side" },
    leftSide: { ar: "الجانب الأيسر", en: "Left side" },
  };
  return (["midline", "rightSide", "leftSide"] as const)
    .filter((position) => typeof record[position] === "string" || typeof record[position] === "number")
    .map((position) => ({
      position,
      label: labels[position][locale],
      value: `${locale === "ar" ? localeNumber(Number(record[position]), locale) : String(record[position])} ${locale === "ar" ? "سم" : "cm"}`,
    }));
}

export type ReadOnlyAnatomicalRegion = {
  view: "FRONT" | "TOP" | "RIGHT_SIDE" | "LEFT_SIDE";
  anatomicalRegionCode?: PhysicianAnatomicalRegionCode;
  geometry: unknown;
  displayColorHex?: string;
  noteText?: string;
};

function anatomicalRegionCentroid(geometry: unknown): { x: number; y: number } | null {
  if (typeof geometry !== "object" || geometry === null || Array.isArray(geometry)) return null;
  const strokes = (geometry as Record<string, unknown>).strokes;
  if (!Array.isArray(strokes)) return null;
  const points: Array<{ x: number; y: number }> = [];
  for (const strokeCandidate of strokes) {
    if (typeof strokeCandidate !== "object" || strokeCandidate === null || Array.isArray(strokeCandidate)) continue;
    const strokePoints = (strokeCandidate as Record<string, unknown>).points;
    if (!Array.isArray(strokePoints)) continue;
    for (const pointCandidate of strokePoints) {
      if (typeof pointCandidate !== "object" || pointCandidate === null || Array.isArray(pointCandidate)) continue;
      const point = pointCandidate as Record<string, unknown>;
      if (typeof point.x === "number" && typeof point.y === "number") points.push({ x: point.x, y: point.y });
    }
  }
  if (!points.length) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

export const PHYSICIAN_ANATOMICAL_REGION_LABELS: Record<PhysicianAnatomicalRegionCode, LocalizedLabel> = {
  FRONTAL_SCALP: { ar: "مقدمة فروة الرأس", en: "Frontal scalp" },
  MID_SCALP: { ar: "منتصف فروة الرأس", en: "Mid-scalp" },
  VERTEX_CROWN: { ar: "التاج", en: "Vertex / crown" },
  RIGHT_TEMPORAL: { ar: "الصدغ الأيمن", en: "Right temporal" },
  LEFT_TEMPORAL: { ar: "الصدغ الأيسر", en: "Left temporal" },
  RIGHT_PARIETAL: { ar: "الجداري الأيمن", en: "Right parietal" },
  LEFT_PARIETAL: { ar: "الجداري الأيسر", en: "Left parietal" },
  RIGHT_OCCIPITAL: { ar: "القذالي الأيمن", en: "Right occipital" },
  LEFT_OCCIPITAL: { ar: "القذالي الأيسر", en: "Left occipital" },
};

export function suggestAnatomicalRegionCode(
  region: Pick<ReadOnlyAnatomicalRegion, "view" | "geometry">,
): PhysicianAnatomicalRegionCode {
  const centroid = anatomicalRegionCentroid(region.geometry);
  if (region.view === "FRONT") return "FRONTAL_SCALP";
  if (region.view === "TOP") {
    if (!centroid || centroid.y < 0.34) return "FRONTAL_SCALP";
    return centroid.y < 0.67 ? "MID_SCALP" : "VERTEX_CROWN";
  }
  if (region.view === "RIGHT_SIDE") {
    if (!centroid || centroid.x < 0.40) return "RIGHT_OCCIPITAL";
    return centroid.x < 0.68 ? "RIGHT_PARIETAL" : "RIGHT_TEMPORAL";
  }
  if (!centroid || centroid.x < 0.32) return "LEFT_TEMPORAL";
  return centroid.x < 0.60 ? "LEFT_PARIETAL" : "LEFT_OCCIPITAL";
}

/**
 * Gives each persisted drawing a clinically readable location without adding a
 * second source of truth or a schema field. The label is derived from the
 * saved view + normalized geometry, so finalized reports can identify the
 * drawn area instead of showing only a region count.
 */
export function presentAnatomicalRegionLabel(
  region: Pick<ReadOnlyAnatomicalRegion, "view" | "geometry" | "anatomicalRegionCode">,
  locale: WorkspaceLocale,
): string {
  if (region.anatomicalRegionCode && PHYSICIAN_ANATOMICAL_REGION_CODES.includes(region.anatomicalRegionCode)) {
    return PHYSICIAN_ANATOMICAL_REGION_LABELS[region.anatomicalRegionCode][locale];
  }
  const centroid = anatomicalRegionCentroid(region.geometry);
  const labels = {
    FRONT_RIGHT: { ar: "المنطقة الجبهية اليمنى", en: "Right frontal scalp" },
    FRONT_CENTER: { ar: "مقدمة فروة الرأس", en: "Central frontal scalp" },
    FRONT_LEFT: { ar: "المنطقة الجبهية اليسرى", en: "Left frontal scalp" },
    TOP_FRONT: { ar: "مقدمة فروة الرأس", en: "Frontal scalp" },
    TOP_MID: { ar: "منتصف فروة الرأس", en: "Mid-scalp" },
    TOP_VERTEX: { ar: "التاج / القمة", en: "Vertex / crown" },
    RIGHT_POSTERIOR: { ar: "المنطقة القذالية اليمنى", en: "Right occipital scalp" },
    RIGHT_MID: { ar: "المنطقة الجدارية اليمنى", en: "Right parietal scalp" },
    RIGHT_ANTERIOR: { ar: "المنطقة الصدغية اليمنى", en: "Right temporal scalp" },
    LEFT_ANTERIOR: { ar: "المنطقة الصدغية اليسرى", en: "Left temporal scalp" },
    LEFT_MID: { ar: "المنطقة الجدارية اليسرى", en: "Left parietal scalp" },
    LEFT_POSTERIOR: { ar: "المنطقة القذالية اليسرى", en: "Left occipital scalp" },
  } as const;
  if (region.view === "FRONT") {
    if (!centroid) return labels.FRONT_CENTER[locale];
    if (centroid.x < 0.34) return labels.FRONT_RIGHT[locale];
    if (centroid.x > 0.66) return labels.FRONT_LEFT[locale];
    return labels.FRONT_CENTER[locale];
  }
  if (!centroid) {
    const fallback = {
      TOP: { ar: "فروة الرأس العلوية", en: "Superior scalp" },
      RIGHT_SIDE: { ar: "الجانب الأيمن من فروة الرأس", en: "Right scalp" },
      LEFT_SIDE: { ar: "الجانب الأيسر من فروة الرأس", en: "Left scalp" },
    } as const;
    return fallback[region.view][locale];
  }
  if (region.view === "TOP") {
    if (centroid.y < 0.34) return labels.TOP_FRONT[locale];
    if (centroid.y < 0.67) return labels.TOP_MID[locale];
    return labels.TOP_VERTEX[locale];
  }
  if (region.view === "RIGHT_SIDE") {
    if (centroid.x < 0.40) return labels.RIGHT_POSTERIOR[locale];
    if (centroid.x < 0.68) return labels.RIGHT_MID[locale];
    return labels.RIGHT_ANTERIOR[locale];
  }
  if (centroid.x < 0.32) return labels.LEFT_ANTERIOR[locale];
  if (centroid.x < 0.60) return labels.LEFT_MID[locale];
  return labels.LEFT_POSTERIOR[locale];
}

export function hasIncompleteAnatomicalRegion(sections: WorkspaceDraftSections): boolean {
  const map = typeof sections.ANATOMICAL_MAP === "object" && sections.ANATOMICAL_MAP !== null
    ? sections.ANATOMICAL_MAP as Record<string, unknown>
    : {};
  return Array.isArray(map.regions) && map.regions.some((candidate) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return true;
    const code = (candidate as Record<string, unknown>).anatomicalRegionCode;
    return typeof code !== "string" || !PHYSICIAN_ANATOMICAL_REGION_CODES.includes(code as PhysicianAnatomicalRegionCode);
  });
}

export function readOnlyAnatomicalMapViews(value: unknown): Array<{
  view: ReadOnlyAnatomicalRegion["view"];
  editable: false;
  regions: ReadOnlyAnatomicalRegion[];
}> {
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const regions = Array.isArray(record.regions)
    ? record.regions.filter((item): item is ReadOnlyAnatomicalRegion => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
        return ["FRONT", "TOP", "RIGHT_SIDE", "LEFT_SIDE"].includes(String((item as Record<string, unknown>).view));
      })
    : [];
  return (["FRONT", "TOP", "RIGHT_SIDE", "LEFT_SIDE"] as const).map((view) => ({
    view,
    editable: false,
    regions: regions.filter((region) => region.view === view),
  }));
}

export type PreFinalizeReviewGroup = { key: string; label: string; items: string[] };

export function buildPreFinalizeReview(
  sections: WorkspaceDraftSections,
  state: WorkspaceEffectiveState,
  locale: WorkspaceLocale,
  trichoscopyLabelsAr: Record<string, string> = {},
): PreFinalizeReviewGroup[] {
  const record = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const records = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value.filter((item) => typeof item === "object" && item !== null && !Array.isArray(item)) as Array<Record<string, unknown>> : [];
  const labels: Record<string, LocalizedLabel> = {
    EXAMINATION: { ar: "الفحص السريري", en: "Clinical Examination" },
    MEASUREMENTS: { ar: "قياسات الطبيب", en: "Physician Measurements" },
    PATTERN: { ar: "تقييم النمط", en: "Pattern Assessment" },
    DIAGNOSIS: { ar: "قرارات التشخيص", en: "Diagnosis decisions" },
    TREATMENT: { ar: "قرارات العلاج", en: "Treatment decisions" },
    PROCEDURE: { ar: "قرارات الإجراءات", en: "Procedure decisions" },
    TRICHOSCOPY: { ar: "منظار الشعر", en: "Trichoscopy" },
    ANATOMICAL_MAP: { ar: "الخريطة التشريحية", en: "Anatomical Map" },
  };
  const groups: PreFinalizeReviewGroup[] = [];
  const examination = record(sections.EXAMINATION);
  const examItems = [
    examination.hairPull ? `${locale === "ar" ? "شد الشعر" : "Hair Pull"}: ${contextScalar(examination.hairPull, locale)}` : "",
    Array.isArray(examination.hairParting) && examination.hairParting.length
      ? `${locale === "ar" ? "تفرقة الشعر" : "Hair Parting"}: ${examination.hairParting.map((item) => contextScalar(item, locale)).join(" · ")}`
      : "",
  ].filter(Boolean);
  if (examItems.length) groups.push({ key: "EXAMINATION", label: labels.EXAMINATION[locale], items: examItems });
  const measurements = record(sections.MEASUREMENTS);
  const measurementLabels: Record<string, LocalizedLabel> = {
    SHEDDING: { ar: "التساقط", en: "Shedding" }, DENSITY_LOSS: { ar: "فقدان الكثافة", en: "Density Loss" },
    ITCH: { ar: "الحكة", en: "Itch" }, BURNING: { ar: "الحرقة", en: "Burning" }, SCALP_PAIN: { ar: "ألم فروة الرأس", en: "Scalp Pain" },
  };
  const measurementItems = Object.entries(measurements).map(([key, item]) => `${measurementLabels[key]?.[locale] ?? key}: ${localeNumber(Number(item), locale)}/${localeNumber(5, locale)}`);
  if (measurementItems.length) groups.push({ key: "MEASUREMENTS", label: labels.MEASUREMENTS[locale], items: measurementItems });
  const pattern = record(sections.PATTERN);
  const patternItems = [
    typeof pattern.sinclair === "number" ? `${locale === "ar" ? "درجة سنكلير" : "Sinclair grade"}: ${localeNumber(pattern.sinclair, locale)}` : "",
    record(pattern.mcuFv).basic ? `MCU/FV: ${deriveMcuFvWorkspaceCode(pattern.mcuFv)}` : "",
    ...presentHairLineDistance(pattern.hairLineDistanceCm, locale).map((item) => `${item.label}: ${item.value}`),
  ].filter(Boolean);
  if (patternItems.length) groups.push({ key: "PATTERN", label: labels.PATTERN[locale], items: patternItems });
  const diagnosisItems = records(record(sections.DIAGNOSIS).decisions).map((item) => `${longitudinalActionLabel(item.action, locale)} · ${[presentLongitudinalDecision(item, state, locale), ...presentDecisionDetails(item, locale)].join(" · ")}`);
  if (diagnosisItems.length) groups.push({ key: "DIAGNOSIS", label: labels.DIAGNOSIS[locale], items: diagnosisItems });
  const tp = record(sections.TREATMENT_PROCEDURES);
  const treatmentItems = records(tp.treatments).map((item) => `${longitudinalActionLabel(item.action, locale)} · ${[presentLongitudinalDecision(item, state, locale), ...presentDecisionDetails(item, locale)].join(" · ")}`);
  if (treatmentItems.length) groups.push({ key: "TREATMENT", label: labels.TREATMENT[locale], items: treatmentItems });
  const procedureItems = records(tp.procedures).map((item) => `${longitudinalActionLabel(item.action, locale)} · ${[presentLongitudinalDecision(item, state, locale), ...presentDecisionDetails(item, locale)].join(" · ")}`);
  if (procedureItems.length) groups.push({ key: "PROCEDURE", label: labels.PROCEDURE[locale], items: procedureItems });
  const trichoscopy = record(sections.TRICHOSCOPY);
  const selectedFindingCodes = Array.isArray(trichoscopy.selectedFindingCodes) ? trichoscopy.selectedFindingCodes.filter((code): code is string => typeof code === "string") : [];
  const trichoscopyItems = selectedFindingCodes.map((code) => {
    const finding = PHYSICIAN_TRICHOSCOPY_FINDINGS.find((candidate) => candidate.code === code);
    return locale === "ar" ? trichoscopyLabelsAr[code] ?? finding?.label ?? code : finding?.label ?? code;
  });
  if (typeof trichoscopy.otherFindingText === "string" && trichoscopy.otherFindingText.trim()) {
    trichoscopyItems.push(`${locale === "ar" ? "ملاحظة الطبيب" : "Physician observation"}: ${trichoscopy.otherFindingText.trim()}`);
  }
  if (trichoscopyItems.length) {
    groups.push({ key: "TRICHOSCOPY", label: labels.TRICHOSCOPY[locale], items: trichoscopyItems });
  }
  const map = record(sections.ANATOMICAL_MAP);
  const mapRegions = records(map.regions).flatMap((region) => {
    const view = region.view;
    if (!["FRONT", "TOP", "RIGHT_SIDE", "LEFT_SIDE"].includes(String(view))) return [];
    return [{
      view: view as ReadOnlyAnatomicalRegion["view"],
      ...(typeof region.anatomicalRegionCode === "string" ? { anatomicalRegionCode: region.anatomicalRegionCode as PhysicianAnatomicalRegionCode } : {}),
      geometry: region.geometry,
      ...(typeof region.noteText === "string" ? { noteText: region.noteText } : {}),
    }];
  });
  if (mapRegions.length) groups.push({
    key: "ANATOMICAL_MAP",
    label: labels.ANATOMICAL_MAP[locale],
    items: mapRegions.map((region) => {
      const location = region.anatomicalRegionCode ? presentAnatomicalRegionLabel(region, locale) : (locale === "ar" ? "الهوية التشريحية غير مؤكدة" : "Anatomical identity not confirmed");
      return region.noteText?.trim() ? `${location} — ${region.noteText.trim()}` : location;
    }),
  });
  return groups;
}

export function visitDraftHasPatientPromotion(sections: WorkspaceDraftSections): boolean {
  const serialized = JSON.stringify(sections).toLowerCase();
  return ["patientresponseid", "sourceresponseid", "questioninstanceid", "patienthairhistoryid"]
    .some((key) => serialized.includes(key));
}
