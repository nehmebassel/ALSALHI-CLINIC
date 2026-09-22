import { formatClinicalApproxDate, isClinicalApproxDateValue } from "@/lib/p01/clinical-date";
import { localeNumber, localizeDigits } from "@/lib/p01/locale";
import type { JsonValue } from "@/lib/patient-access/service";

export type DisplayLocale = "ar" | "en";
export type LocalizedDisplayText = { ar: string; en: string };

export const SYSTEM_DISPLAY_LABELS: Readonly<Record<string, LocalizedDisplayText>> = {
  MALE: { ar: "ذكر", en: "Male" },
  FEMALE: { ar: "أنثى", en: "Female" },
  MARRIED: { ar: "متزوج/ة", en: "Married" },
  NOT_MARRIED: { ar: "غير متزوج/ة", en: "Not married" },
  RV_HAIR_LOSS: { ar: "تساقط الشعر أو ترققه / نقص كثافته", en: "Hair loss, thinning, or reduced density" },
  RV_SCALP_SYMPTOMS: { ar: "أعراض أو مشكلة في فروة الرأس", en: "Scalp symptoms or concern" },
  RV_HAIR_QUALITY: { ar: "جودة الشعر", en: "Hair quality" },
  RV_DERMATOLOGY: { ar: "الأمراض الجلدية", en: "Dermatology" },
  RV_LASER: { ar: "الليزر", en: "Laser" },
  RV_AESTHETIC_PROCEDURES: { ar: "الإجراءات التجميلية", en: "Aesthetic procedures" },
  BOTH: { ar: "تساقط وترقق / نقص كثافة", en: "Shedding and thinning / reduced density" },
  UNDER_REVIEW: { ar: "قيد مراجعة الطبيب", en: "Under physician review" },
  COMPLETED: { ar: "مكتمل", en: "Completed" },
  READ_ONLY: { ar: "تم الإرسال ولا يمكن التعديل", en: "Submitted and read-only" },
  ACTIVE: { ar: "نشط", en: "Active" },
  CLOSED: { ar: "مغلق", en: "Closed" },
  YES: { ar: "نعم", en: "Yes" },
  NO: { ar: "لا", en: "No" },
  NONE: { ar: "لا شيء مما سبق", en: "None of the above" },
};

export function localizedSystemValue(value: string, locale: DisplayLocale): string | undefined {
  const label = SYSTEM_DISPLAY_LABELS[value];
  return label ? label[locale] : undefined;
}

export function isRawDisplayToken(value: string): boolean {
  return /^(?:RV|AP|LASER|Q|P01|SYN)_[A-Z0-9_]+$/.test(value)
    || /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(value)
    || /^(?:UNDER_REVIEW|READ_ONLY)$/.test(value);
}

type ReviewDisplayQuestion = {
  code?: string;
  responseType: string;
  value: JsonValue | undefined;
  options: Array<{ code: string; label: string }>;
};

/**
 * Patient-review presentation boundary. Structured values must resolve through
 * the evaluated question's localized options (or a global system label).
 * Only governed text controls may pass their authored value through unchanged.
 */
export function presentPatientReviewAnswer(
  question: ReviewDisplayQuestion,
  locale: DisplayLocale,
): string | null {
  const optionLabels = new Map(question.options.map((option) => [option.code, option.label]));
  const freeText = question.responseType === "TEXT" || question.responseType === "LONG_TEXT";

  function scalar(value: string): string | null {
    const option = optionLabels.get(value);
    if (option) return option;
    const system = localizedSystemValue(value, locale);
    if (system) return system;
    if (freeText) return localizeDigits(value, locale);
    if (isRawDisplayToken(value) || /^[A-Z][A-Z0-9_]{3,}$/.test(value)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Missing structured display mapping", { questionCode: question.code ?? "UNKNOWN", fieldPath: "$value" });
      }
      return locale === "ar" ? "قيمة منظمة غير متاحة للعرض" : "Structured value unavailable for display";
    }
    return localizeDigits(value, locale);
  }

  const value = question.value;
  if (value === undefined || value === null || value === "") return null;
  if (isClinicalApproxDateValue(value)) return formatClinicalApproxDate(value, locale);
  if (typeof value === "string") return scalar(value);
  if (typeof value === "number") return localeNumber(value, locale);
  if (typeof value === "boolean") return localizedSystemValue(value ? "YES" : "NO", locale) ?? null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.every((item) => typeof item === "string")) {
      const labels = value.flatMap((item) => {
        const label = scalar(item as string);
        return label ? [label] : [];
      });
      return labels.length > 0 ? labels.join(locale === "ar" ? "، " : ", ") : null;
    }
    return locale === "ar" ? `${localeNumber(value.length, locale)} تفاصيل مسجلة` : `${value.length} recorded details`;
  }
  if (typeof value === "object") {
    const count = Object.values(value).filter((item) => item !== undefined && item !== null && item !== "").length;
    if (count === 0) return null;
    return locale === "ar" ? `${localeNumber(count, locale)} تفاصيل مسجلة` : `${count} recorded details`;
  }
  return null;
}
