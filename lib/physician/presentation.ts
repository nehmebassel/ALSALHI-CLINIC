import { formatClinicalApproxDate, isClinicalApproxDateValue } from "@/lib/p01/clinical-date";
import { localeNumber, localizeDigits } from "@/lib/p01/locale";
import type { JsonValue } from "@/lib/patient-access/service";
import { isRawDisplayToken, localizedSystemValue } from "@/lib/presentation/display-contract";

import type { PhysicianInterviewQuestion, PhysicianLocalizedText, PhysicianPresentationAuditSignal } from "./types";

export type { PhysicianPresentationAuditSignal } from "./types";

export type PhysicianLocale = "ar" | "en";
export type PhysicianStructuredLabelCatalog = ReadonlyMap<string, PhysicianLocalizedText>;

const COMMON_CODE_LABELS: Record<string, PhysicianLocalizedText> = {
  YES: { ar: "نعم", en: "Yes" },
  NO: { ar: "لا", en: "No" },
  UNSURE: { ar: "غير متأكد", en: "Unsure" },
  UNKNOWN: { ar: "غير معروف", en: "Unknown" },
  CURRENT: { ar: "حالي", en: "Current" },
  PREVIOUS: { ar: "سابق", en: "Previous" },
  NEVER: { ar: "لم يحدث", en: "Never" },
  MALE: { ar: "ذكر", en: "Male" },
  FEMALE: { ar: "أنثى", en: "Female" },
  MARRIED: { ar: "متزوج/ة", en: "Married" },
  NOT_MARRIED: { ar: "غير متزوج/ة", en: "Not married" },
  ACTIVE: { ar: "نشط", en: "Active" },
  CLOSED: { ar: "مغلق", en: "Closed" },
  STARTED: { ar: "بدأ", en: "Started" },
  STOPPED: { ar: "توقف", en: "Stopped" },
};


const STRUCTURED_CODE_LABELS: Record<string, PhysicianLocalizedText> = {
  DONT_REMEMBER: { ar: "لا أتذكر", en: "I do not remember" },
  FACE: { ar: "الوجه", en: "Face" },
  NECK: { ar: "الرقبة", en: "Neck" },
  SCALP: { ar: "فروة الرأس", en: "Scalp" },
  HANDS: { ar: "اليدان", en: "Hands" },
  BODY: { ar: "الجسم", en: "Body" },
  DOUBLE_CHIN: { ar: "اللغلوغ", en: "Double chin" },
  UNDER_EYE: { ar: "تحت العين", en: "Under-eye area" },
  UNDER_EYES: { ar: "تحت العينين", en: "Under-eye area" },
  OTHER: { ar: "أخرى", en: "Other" },
  FACE_NECK: { ar: "الوجه والرقبة", en: "Face and neck" },
  SCALP_SWEATING: { ar: "تعرّق فروة الرأس", en: "Scalp sweating" },
  SCARS: { ar: "الندبات", en: "Scars" },
  ROSACEA: { ar: "الوردية", en: "Rosacea" },
  RADIANCE: { ar: "النضارة", en: "Radiance" },
  PORES: { ar: "المسام", en: "Pores" },
  SPECIAL_AREAS: { ar: "مناطق خاصة", en: "Special areas" },
  ENLARGE: { ar: "تضخيم مناطق الجسم", en: "Enlarge body areas" },
  SLIM: { ar: "تنحيف مناطق الجسم", en: "Slim body areas" },
  AP_BOTOX: { ar: "بوتوكس", en: "Botox" },
  AP_FILLER: { ar: "فيلر", en: "Filler" },
  AP_SKIN_BOOSTER: { ar: "سكين بوستر", en: "Skin booster" },
  AP_COLLAGEN_STIMULATORS: { ar: "محفزات الكولاجين", en: "Collagen stimulators" },
  AP_FAT_DISSOLVING: { ar: "حقن إذابة الدهون", en: "Fat-dissolving injections" },
  AP_SWEATING_INJECTION: { ar: "علاج التعرق بالحقن", en: "Injected treatment for sweating" },
  AP_BODY_CONTOURING: { ar: "إجراءات نحت أو تحسين القوام", en: "Body contouring or body-improvement procedures" },
  AP_OTHER: { ar: "إجراء تجميلي آخر", en: "Other aesthetic procedure" },
  LASER_UNWANTED_HAIR: { ar: "إزالة الشعر غير المرغوب فيه", en: "Unwanted hair removal" },
  LASER_PIGMENTATION: { ar: "التصبغات والبقع الداكنة", en: "Pigmentation and dark spots" },
  LASER_MELASMA: { ar: "الكلف", en: "Melasma" },
  LASER_REDNESS_VESSELS: { ar: "الاحمرار والوردية والأوعية الدموية السطحية", en: "Redness, rosacea, and superficial blood vessels" },
  LASER_ACNE_SCARS: { ar: "ندبات حب الشباب", en: "Acne scars" },
  LASER_OTHER_SCARS: { ar: "الندبات الأخرى", en: "Other scars" },
  LASER_RESURFACING: { ar: "إعادة تسطيح الجلد", en: "Skin resurfacing" },
  LASER_TATTOO_PMU: { ar: "إزالة الوشم أو المكياج الدائم", en: "Tattoo or permanent-makeup removal" },
  LASER_OTHER: { ar: "مشكلة أخرى قد تحتاج علاجًا بالليزر", en: "Another concern that may need laser treatment" },
  LASER_UNSURE: { ar: "غير متأكد وأرغب بمناقشة الخيارات", en: "Not sure; discuss options with the doctor" },
  PRP: { ar: "البلازما الغنية بالصفائح الدموية", en: "PRP / Platelet-Rich Plasma" },
  MICRONEEDLING: { ar: "المايكرونيدلينغ", en: "Microneedling" },
  HAIR_LASER: { ar: "ليزر تحفيز الشعر", en: "Hair Stimulation Laser" },
  RED_LIGHT: { ar: "الضوء الأحمر", en: "Red Light Therapy" },
  MINOXIDIL_INJ: { ar: "حقن المينوكسيديل", en: "Minoxidil Injections" },
  DUTASTERIDE_INJ: { ar: "حقن الدوتاستيرايد", en: "Dutasteride Injections" },
  EXOSOME: { ar: "الإكسوزوم", en: "Exosome Therapy" },
  CORTISONE_INJ: { ar: "حقن الكورتيزون", en: "Corticosteroid Injections" },
  REGENERA: { ar: "ريجينيرا", en: "Regenera / Regenera Activa" },
  ACELL: { ar: "إي سيل", en: "ACell" },
  HAIR_TRANSPLANT: { ar: "زراعة الشعر", en: "Hair Transplantation" },
};

// Structured values that are defined by nested/repeatable field controls rather
// than QuestionOption rows. These are presentation mappings only; they do not
// alter the governed Question Registry or clinical rules.
const NESTED_STRUCTURED_CODE_LABELS: Record<string, PhysicianLocalizedText> = {
  CONTINUOUS: { ar: "مستمر", en: "Continuous" },
  PERSISTENT: { ar: "مستمر", en: "Persistent" },
  INTERMITTENT: { ar: "يأتي ويذهب", en: "Comes and goes" },
  LT_WEEKLY: { ar: "أقل من مرة أسبوعيًا", en: "Less than once weekly" },
  WEEKLY_1_2: { ar: "١–٢ مرة أسبوعيًا", en: "1–2 times weekly" },
  WEEKLY_3_4: { ar: "٣–٤ مرات أسبوعيًا", en: "3–4 times weekly" },
  WEEKLY_5_PLUS: { ar: "٥ مرات أو أكثر أسبوعيًا", en: "5 or more times weekly" },
  EVERY_WASH: { ar: "مع كل غسلة", en: "With every wash" },
  WEEKLY: { ar: "أسبوعيًا", en: "Weekly" },
  MONTHLY: { ar: "شهريًا", en: "Monthly" },
  CONDITIONING: { ar: "التكييف (بلسم أو ماسك)", en: "Conditioning (conditioner or mask)" },
};

const SAFE_MISSING_MAPPING: PhysicianLocalizedText = {
  ar: "قيمة منظمة غير متاحة للعرض",
  en: "Structured value unavailable for display",
};

export function pickLocalized(text: PhysicianLocalizedText, locale: PhysicianLocale): string {
  return locale === "ar" ? text.ar : text.en;
}

export function ageAt(dateOfBirth: string, referenceIso?: string): number {
  const dob = new Date(dateOfBirth);
  const reference = referenceIso ? new Date(referenceIso) : new Date();
  if (Number.isNaN(dob.getTime()) || Number.isNaN(reference.getTime())) return 0;
  let age = reference.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = reference.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getUTCDate() < dob.getUTCDate())) age -= 1;
  return Math.max(0, age);
}

export function containsArabic(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function humanizeKey(key: string, locale: PhysicianLocale): string | null {
  const labels: Record<string, PhysicianLocalizedText> = {
    name: { ar: "الاسم", en: "Name" },
    dose: { ar: "الجرعة", en: "Dose" },
    frequency: { ar: "التكرار", en: "Frequency" },
    start: { ar: "تاريخ البدء", en: "Start" },
    stop: { ar: "تاريخ التوقف", en: "Stop" },
    stillUsing: { ar: "مستمر", en: "Still using" },
    procedure: { ar: "الإجراء", en: "Procedure" },
    concern: { ar: "المشكلة / الطلب", en: "Concern / request" },
    area: { ar: "المنطقة", en: "Area" },
    areaText: { ar: "المنطقة", en: "Area" },
    areaOther: { ar: "منطقة أخرى", en: "Other area" },
    goal: { ar: "الهدف", en: "Goal" },
    desiredResult: { ar: "النتيجة المطلوبة", en: "Desired result" },
    prior: { ar: "إجراء سابق", en: "Prior treatment" },
    complications: { ar: "المضاعفات", en: "Complications" },
    complicationText: { ar: "تفاصيل المضاعفات", en: "Complication details" },
    otherText: { ar: "تفاصيل أخرى", en: "Other details" },
    details: { ar: "التفاصيل", en: "Details" },
    typeText: { ar: "النوع", en: "Type" },
    when: { ar: "التاريخ التقريبي", en: "Approximate date" },
    count: { ar: "العدد", en: "Count" },
    lastDate: { ar: "آخر تاريخ", en: "Last date" },
    result: { ar: "النتيجة", en: "Result" },
    notes: { ar: "ملاحظات", en: "Notes" },
    event: { ar: "الحدث", en: "Event" },
    date: { ar: "التاريخ", en: "Date" },
    status: { ar: "الحالة", en: "Status" },
    type: { ar: "النوع", en: "Type" },
    treatment: { ar: "العلاج", en: "Treatment" },
    exposure: { ar: "التعرض", en: "Exposure" },
    tool: { ar: "الأداة", en: "Tool" },
    routineItem: { ar: "عنصر العناية", en: "Routine item" },
    step: { ar: "الخطوة", en: "Step" },
    rank: { ar: "الترتيب", en: "Order" },
    stillPresent: { ar: "ما زال موجودًا", en: "Still present" },
    hairChange: { ar: "تغير الشعر", en: "Hair change" },
    changeDescription: { ar: "وصف التغير", en: "Change description" },
    onset: { ar: "البداية", en: "Onset" },
    pattern: { ar: "النمط", en: "Pattern" },
    severity: { ar: "الشدة", en: "Severity" },
    diagnosis: { ar: "التشخيص", en: "Diagnosis" },
  };
  return labels[key] ? pickLocalized(labels[key], locale) : null;
}

function optionLabel(question: PhysicianInterviewQuestion, code: string, locale: PhysicianLocale): string | null {
  const option = question.options.find((item) => item.code === code);
  return option ? localizeDigits(locale === "ar" ? option.ar : option.en, locale) : null;
}

/**
 * Some governed repeatable rows store a stable code that belongs to a parent
 * question (for example a trigger or prior diagnosis code).  The row itself
 * therefore does not necessarily carry the option label.  Build one
 * presentation-only catalog from the published question options already
 * present in the physician read model so nested values can still be rendered
 * as clinical labels rather than implementation codes.
 */
export function buildStructuredLabelCatalog(questions: readonly PhysicianInterviewQuestion[]): Map<string, PhysicianLocalizedText> {
  const catalog = new Map<string, PhysicianLocalizedText>();
  for (const question of questions) {
    for (const option of question.options) {
      if (!catalog.has(option.code)) catalog.set(option.code, { ar: option.ar, en: option.en });
    }
  }
  return catalog;
}

export type PresentedValue = {
  lines: string[];
  hasUntranslatedFreeText: boolean;
  auditSignals: PhysicianPresentationAuditSignal[];
};

const INTERNAL_PRESENTATION_KEYS = new Set([
  "id",
  "synthetic",
  "sourceResponseId",
  "sourceQuestionCode",
  "sourceScopeKey",
  "sourceItemIndex",
]);

// Values in these fields are authored by the patient. They must remain exactly
// as entered even when they happen to resemble an internal code or acronym.
const PATIENT_FREE_TEXT_KEYS = new Set([
  "name",
  "details",
  "notes",
  "otherText",
  "complicationText",
  "areaText",
  "areaOther",
  "typeText",
  "changeDescription",
  "desiredResult",
  "itemLabel",
]);

const STRUCTURED_STRING_KEYS = new Set([
  "stillUsing",
  "procedure",
  "concern",
  "area",
  "goal",
  "prior",
  "complications",
  "event",
  "status",
  "treatment",
  "exposure",
  "tool",
  "routineItem",
  "stillPresent",
  "hairChange",
  "pattern",
  "diagnosis",
  "frequency",
  "step",
  "result",
]);

function safeFreeText(value: string): string | null {
  if (/^SYN[-_]/i.test(value)) return null;
  if (/^Synthetic(?:\s+answer\s+[—-]|\s+detail\s+for|\s+)/i.test(value)) return null;
  return value;
}

function looksLikeEnumToken(value: string): boolean {
  return value.length >= 4 && /^[A-Z][A-Z0-9_]*$/.test(value);
}

export function presentClinicalValue(
  question: PhysicianInterviewQuestion,
  locale: PhysicianLocale,
  catalog?: PhysicianStructuredLabelCatalog,
): PresentedValue {
  let hasUntranslatedFreeText = false;
  const auditSignals: PhysicianPresentationAuditSignal[] = [];
  const recordedSignals = new Set<string>();

  function missingMapping(fieldPath: string): string[] {
    const signal: PhysicianPresentationAuditSignal = {
      code: "MISSING_STRUCTURED_LABEL",
      questionCode: question.code,
      fieldPath: fieldPath || "$value",
    };
    const key = `${signal.questionCode}:${signal.fieldPath}`;
    if (!recordedSignals.has(key)) {
      recordedSignals.add(key);
      auditSignals.push(signal);
    }
    return [pickLocalized(SAFE_MISSING_MAPPING, locale)];
  }

  function render(value: unknown, depth = 0, fieldPath = "", parentKey = ""): string[] {
    if (value === null || value === undefined || value === "") return [locale === "ar" ? "غير مسجل" : "Not recorded"];
    if (typeof value === "boolean") return [value ? (locale === "ar" ? "نعم" : "Yes") : (locale === "ar" ? "لا" : "No")];
    if (typeof value === "number") return [localeNumber(value, locale)];
    if (typeof value === "string") {
      if (["count", "rank", "severity"].includes(parentKey) && /^\d+(?:\.\d+)?$/.test(value.trim())) {
        return [localeNumber(Number(value), locale)];
      }
      const localized = optionLabel(question, value, locale);
      if (localized) return [localized];
      const catalogLabel = catalog?.get(value);
      if (catalogLabel) return [localizeDigits(pickLocalized(catalogLabel, locale), locale)];
      const common = COMMON_CODE_LABELS[value];
      if (common) return [localizeDigits(pickLocalized(common, locale), locale)];
      const structured = STRUCTURED_CODE_LABELS[value];
      if (structured) return [localizeDigits(pickLocalized(structured, locale), locale)];
      const nestedStructured = NESTED_STRUCTURED_CODE_LABELS[value];
      if (nestedStructured) return [localizeDigits(pickLocalized(nestedStructured, locale), locale)];
      const systemDisplay = localizedSystemValue(value, locale);
      if (systemDisplay) return [systemDisplay];
      const topLevelFreeText = depth === 0
        && question.repeatableItems.length === 0
        && (question.responseType === "TEXT" || question.responseType === "LONG_TEXT");
      const patientFreeText = topLevelFreeText
        || PATIENT_FREE_TEXT_KEYS.has(parentKey)
        || (question.code === "Q_LASER_CONCERN_DETAILS" && parentKey === "goal");
      const structuredPosition = STRUCTURED_STRING_KEYS.has(parentKey)
        || (!parentKey
          && ["BOOLEAN", "SINGLE_SELECT", "MULTI_SELECT", "SCALE"].includes(question.responseType)
          && depth <= 1);
      if (!patientFreeText && (structuredPosition || isRawDisplayToken(value) || looksLikeEnumToken(value))) {
        return missingMapping(fieldPath);
      }
      const safeText = patientFreeText ? value : safeFreeText(value);
      if (safeText === null) return [];
      if (locale === "en" && containsArabic(safeText)) hasUntranslatedFreeText = true;
      return [safeText];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item, index) => render(item, depth + 1, `${fieldPath}[${index}]`, parentKey)).filter(Boolean);
    }
    if (typeof value === "object") {
      if (isClinicalApproxDateValue(value as JsonValue)) return [formatClinicalApproxDate(value as JsonValue, locale)];
      return Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !INTERNAL_PRESENTATION_KEYS.has(key) && !key.startsWith("__"))
        .flatMap(([key, nested]) => {
          const nestedPath = fieldPath ? `${fieldPath}.${key}` : key;
          const nestedLines = render(nested, depth + 1, nestedPath, key);
          const label = humanizeKey(key, locale);
          return label ? nestedLines.map((line) => `${label}: ${line}`) : nestedLines;
        });
    }
    return [String(value)];
  }

  const source = question.repeatableItems.length > 0 ? question.repeatableItems : question.value;
  return { lines: render(source), hasUntranslatedFreeText, auditSignals };
}
