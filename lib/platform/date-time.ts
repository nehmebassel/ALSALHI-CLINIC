import { localizeDigits, type SupportedLocale } from "@/lib/p01/locale";

const AR_GREGORIAN_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

const EN_GREGORIAN_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Calendar date used by clinic-facing date inputs.
 *
 * The browser's UTC calendar day can differ from Riyadh near midnight. Accept
 * either an instant or a Date so UI validation can use the same fixed UTC+3
 * convention as the rest of the physician workspace.
 */
export function clinicDateInputValue(value: Date | string = new Date()): string {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  const clinicTime = new Date(instant.getTime() + RIYADH_OFFSET_MS);
  const year = clinicTime.getUTCFullYear();
  const month = String(clinicTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(clinicTime.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Deterministic clinic timestamp formatter for SSR + hydration.
 *
 * Saudi Arabia is UTC+3 year-round with no daylight-saving time. We therefore
 * convert the instant to clinic-local wall-clock parts ourselves instead of
 * relying on runtime-specific Intl punctuation/spacing. This prevents React
 * hydration mismatches between Node and Safari while preserving Arabic/English
 * digit localization.
 */
export function formatClinicDateTime(
  iso: string,
  locale: SupportedLocale,
): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return locale === "ar" ? "تاريخ غير صالح" : "Invalid date";
  }

  const clinicTime = new Date(instant.getTime() + RIYADH_OFFSET_MS);
  const day = clinicTime.getUTCDate();
  const monthIndex = clinicTime.getUTCMonth();
  const year = clinicTime.getUTCFullYear();
  const hour24 = clinicTime.getUTCHours();
  const minute = clinicTime.getUTCMinutes();
  const hour12 = hour24 % 12 || 12;

  if (locale === "ar") {
    const period = hour24 < 12 ? "ص" : "م";
    return `${localizeDigits(day, "ar")} ${AR_GREGORIAN_MONTHS[monthIndex]} ${localizeDigits(year, "ar")}، ${localizeDigits(String(hour12).padStart(2, "0"), "ar")}:${localizeDigits(String(minute).padStart(2, "0"), "ar")} ${period}`;
  }

  const period = hour24 < 12 ? "AM" : "PM";
  return `${day} ${EN_GREGORIAN_MONTHS[monthIndex]} ${year}, ${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
}


export function formatClinicDate(iso: string, locale: SupportedLocale): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return locale === "ar" ? "تاريخ غير صالح" : "Invalid date";
  const clinicTime = new Date(instant.getTime() + RIYADH_OFFSET_MS);
  const day = clinicTime.getUTCDate();
  const monthIndex = clinicTime.getUTCMonth();
  const year = clinicTime.getUTCFullYear();
  if (locale === "ar") return `${localizeDigits(day, "ar")} ${AR_GREGORIAN_MONTHS[monthIndex]} ${localizeDigits(year, "ar")}`;
  return `${day} ${EN_GREGORIAN_MONTHS[monthIndex]} ${year}`;
}

export function formatClinicMonthYear(iso: string, locale: SupportedLocale): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return locale === "ar" ? "تاريخ غير صالح" : "Invalid date";
  const clinicTime = new Date(instant.getTime() + RIYADH_OFFSET_MS);
  const monthIndex = clinicTime.getUTCMonth();
  const year = clinicTime.getUTCFullYear();
  if (locale === "ar") return `${AR_GREGORIAN_MONTHS[monthIndex]} ${localizeDigits(year, "ar")}`;
  return `${EN_GREGORIAN_MONTHS[monthIndex]} ${year}`;
}
