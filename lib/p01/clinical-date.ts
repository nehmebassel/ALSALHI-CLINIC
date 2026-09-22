import type { JsonValue } from "@/lib/patient-access/service";
import { localeForCalendar, localeNumber } from "@/lib/p01/locale";

export type ClinicalCalendar = "GREGORIAN" | "HIJRI";
export type ClinicalDatePrecision = "MONTH_YEAR" | "YEAR" | "UNKNOWN";

export interface ClinicalApproxDateValue {
  calendar: ClinicalCalendar;
  precision: ClinicalDatePrecision;
  year?: number;
  month?: number;
  normalizedGregorian?: {
    year: number;
    month?: number;
  };
}

export function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hijriParts(date: Date): { year: number; month: number; day: number } | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura-nu-latn", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: "UTC",
    });
    const parts = formatter.formatToParts(date);
    const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
    const year = read("year");
    const month = read("month");
    const day = read("day");
    return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? { year, month, day }
      : null;
  } catch {
    return null;
  }
}

export function currentClinicalYear(calendar: ClinicalCalendar, now: Date = new Date()): number {
  if (calendar === "GREGORIAN") return now.getUTCFullYear();
  return hijriParts(now)?.year ?? now.getUTCFullYear() - 579;
}

export function clinicalYearBounds(calendar: ClinicalCalendar, now: Date = new Date()): { min: number; max: number } {
  return calendar === "HIJRI"
    ? { min: 1300, max: currentClinicalYear("HIJRI", now) }
    : { min: 1900, max: currentClinicalYear("GREGORIAN", now) };
}

export function isClinicalApproxDateValue(value: JsonValue | undefined): value is ClinicalApproxDateValue & JsonValue {
  if (!isRecord(value)) return false;
  if (value.calendar !== "GREGORIAN" && value.calendar !== "HIJRI") return false;
  if (!["MONTH_YEAR", "YEAR", "UNKNOWN"].includes(String(value.precision))) return false;
  if (value.precision === "UNKNOWN") return true;
  if (typeof value.year !== "number" || !Number.isInteger(value.year)) return false;
  const yearOk = value.calendar === "HIJRI"
    ? value.year >= 1300 && value.year <= 1700
    : value.year >= 1900 && value.year <= 2200;
  if (!yearOk) return false;
  if (value.precision === "YEAR") return true;
  return typeof value.month === "number" && Number.isInteger(value.month) && value.month >= 1 && value.month <= 12;
}

export function isValidApproxDateValue(value: JsonValue | undefined): boolean {
  if (typeof value === "string") return coerceClinicalApproxDate(value) !== null;
  return isClinicalApproxDateValue(value);
}

/**
 * Historical clinical dates are precision-aware. A year-only answer is valid
 * through the current year, while a month/year answer must not be later than
 * the server-owned reference month in the calendar the patient selected.
 */
export function isHistoricalApproxDateOnOrBefore(
  value: JsonValue | undefined,
  referenceDate: Date,
): boolean {
  if (Number.isNaN(referenceDate.getTime())) return false;
  const parsed = coerceClinicalApproxDate(value);
  if (!parsed || !isClinicalApproxDateValue(parsed as unknown as JsonValue)) return false;
  if (parsed.precision === "UNKNOWN") return true;

  const reference = parsed.calendar === "HIJRI"
    ? hijriParts(referenceDate)
    : {
        year: referenceDate.getUTCFullYear(),
        month: referenceDate.getUTCMonth() + 1,
        day: referenceDate.getUTCDate(),
      };
  if (!reference) return false;
  if (parsed.year! !== reference.year) return parsed.year! < reference.year;
  return parsed.precision === "YEAR" || parsed.month! <= reference.month;
}

/** Returns JSON paths for complete structured approximate dates after the boundary. */
export function futureClinicalApproxDatePaths(
  value: JsonValue | undefined,
  referenceDate: Date,
  path = "$",
): string[] {
  if (value === undefined || value === null) return [];
  if (isRecord(value) && (value.calendar === "GREGORIAN" || value.calendar === "HIJRI")) {
    return isHistoricalApproxDateOnOrBefore(value, referenceDate) ? [] : [path];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => futureClinicalApproxDatePaths(item, referenceDate, `${path}[${index}]`));
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) => futureClinicalApproxDatePaths(item, referenceDate, `${path}.${key}`));
  }
  return [];
}

function asciiDigits(value: string): string {
  const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
  const easternArabic = "۰۱۲۳۴۵۶۷۸۹";
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = arabicIndic.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);
    return String(easternArabic.indexOf(digit));
  });
}

function legacyGregorianDate(value: string): ClinicalApproxDateValue | null {
  const cleaned = asciiDigits(value.trim()).replace(/\s+/g, "");
  if (cleaned === "UNKNOWN") return { calendar: "GREGORIAN", precision: "UNKNOWN" };
  if (/^\d{4}$/.test(cleaned)) {
    const year = Number(cleaned);
    return year >= 1900 && year <= 2200
      ? makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "YEAR", year })
      : null;
  }

  const yearMonth = /^(\d{4})[-\/](\d{1,2})$/.exec(cleaned);
  const monthYear = /^(\d{1,2})[-\/](\d{4})$/.exec(cleaned);
  const compactMonthYear = /^(\d{2})(\d{4})$/.exec(cleaned);
  const match = yearMonth
    ? { year: Number(yearMonth[1]), month: Number(yearMonth[2]) }
    : monthYear
      ? { year: Number(monthYear[2]), month: Number(monthYear[1]) }
      : compactMonthYear
        ? { year: Number(compactMonthYear[2]), month: Number(compactMonthYear[1]) }
        : null;
  if (!match || match.year < 1900 || match.year > 2200 || match.month < 1 || match.month > 12) return null;
  return makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: match.year, month: match.month });
}

function findGregorianForHijri(year: number, month?: number): Date | null {
  // Umm al-Qura years are roughly Gregorian +579. Search a deterministic UTC
  // window so device timezone/calendar preferences cannot shift the result.
  const start = Date.UTC(year + 578, 0, 1);
  const targetMonth = month ?? 7;
  let firstMatch: Date | null = null;
  for (let offset = 0; offset < 1100; offset += 1) {
    const date = new Date(start + offset * 86_400_000);
    const hijri = hijriParts(date);
    if (!hijri || hijri.year !== year || hijri.month !== targetMonth) continue;
    if (!firstMatch) firstMatch = date;
    // Mid-month is a safer representative for approximate month/year than day 1,
    // which often lies on a Gregorian month boundary.
    if (hijri.day === 15) return date;
  }
  return firstMatch;
}

/**
 * Timeline normalization peer. The patient-entered Hijri value remains the
 * source of truth; this approximate Gregorian peer is only for ordering/search.
 */
export function normalizeHijriToGregorian(year: number, month?: number): { year: number; month?: number } | undefined {
  const date = findGregorianForHijri(year, month);
  if (!date) return undefined;
  return month === undefined
    ? { year: date.getUTCFullYear() }
    : { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function normalizeGregorianToHijri(year: number, month?: number): { year: number; month?: number } | undefined {
  const representative = month === undefined
    ? new Date(Date.UTC(year, 6, 1))
    : new Date(Date.UTC(year, month - 1, 15));
  const hijri = hijriParts(representative);
  if (!hijri) return undefined;
  return month === undefined
    ? { year: hijri.year }
    : { year: hijri.year, month: hijri.month };
}

export function makeClinicalApproxDate(input: {
  calendar: ClinicalCalendar;
  precision: ClinicalDatePrecision;
  year?: number;
  month?: number;
}): ClinicalApproxDateValue {
  if (input.precision === "UNKNOWN") {
    return { calendar: input.calendar, precision: "UNKNOWN" };
  }
  const normalizedGregorian = input.calendar === "GREGORIAN"
    ? { year: input.year!, ...(input.precision === "MONTH_YEAR" ? { month: input.month! } : {}) }
    : normalizeHijriToGregorian(input.year!, input.precision === "MONTH_YEAR" ? input.month : undefined);
  return {
    calendar: input.calendar,
    precision: input.precision,
    year: input.year,
    ...(input.precision === "MONTH_YEAR" ? { month: input.month } : {}),
    ...(normalizedGregorian ? { normalizedGregorian } : {}),
  };
}

/**
 * Converts a complete approximate value between calendars without dropping its
 * precision. Conversion is approximate by design for month/year and year-only.
 */
export function convertClinicalApproxDate(
  value: JsonValue | ClinicalApproxDateValue | undefined,
  targetCalendar: ClinicalCalendar,
): ClinicalApproxDateValue | null {
  const parsed = coerceClinicalApproxDate(value as JsonValue | undefined);
  if (!parsed || !isClinicalApproxDateValue(parsed as unknown as JsonValue)) return null;
  if (parsed.calendar === targetCalendar) return parsed;
  if (parsed.precision === "UNKNOWN") return { calendar: targetCalendar, precision: "UNKNOWN" };

  if (parsed.calendar === "GREGORIAN" && targetCalendar === "HIJRI") {
    const peer = normalizeGregorianToHijri(parsed.year!, parsed.precision === "MONTH_YEAR" ? parsed.month : undefined);
    if (!peer) return null;
    return makeClinicalApproxDate({
      calendar: "HIJRI",
      precision: parsed.precision,
      year: peer.year,
      ...(parsed.precision === "MONTH_YEAR" ? { month: peer.month } : {}),
    });
  }

  const peer = normalizeHijriToGregorian(parsed.year!, parsed.precision === "MONTH_YEAR" ? parsed.month : undefined);
  if (!peer) return null;
  return makeClinicalApproxDate({
    calendar: "GREGORIAN",
    precision: parsed.precision,
    year: peer.year,
    ...(parsed.precision === "MONTH_YEAR" ? { month: peer.month } : {}),
  });
}

export function coerceClinicalApproxDate(value: JsonValue | undefined): ClinicalApproxDateValue | null {
  if (isClinicalApproxDateValue(value)) return value;
  if (isRecord(value) && (value.calendar === "GREGORIAN" || value.calendar === "HIJRI") && ["MONTH_YEAR", "YEAR", "UNKNOWN"].includes(String(value.precision))) {
    return {
      calendar: value.calendar,
      precision: value.precision as ClinicalDatePrecision,
      ...(typeof value.year === "number" ? { year: value.year } : {}),
      ...(typeof value.month === "number" ? { month: value.month } : {}),
      ...(isRecord(value.normalizedGregorian) && typeof value.normalizedGregorian.year === "number"
        ? { normalizedGregorian: { year: value.normalizedGregorian.year, ...(typeof value.normalizedGregorian.month === "number" ? { month: value.normalizedGregorian.month } : {}) } }
        : {}),
    };
  }
  if (typeof value !== "string") return null;
  return legacyGregorianDate(value);
}

export function formatClinicalApproxDate(value: JsonValue | undefined, locale: "ar" | "en"): string {
  const date = coerceClinicalApproxDate(value);
  if (!date) return locale === "ar" ? "غير محدد" : "Not specified";
  if (date.precision === "UNKNOWN") return locale === "ar" ? "لا أتذكر" : "I don't remember";
  const calendarLabel = date.calendar === "HIJRI"
    ? (locale === "ar" ? "هـ" : "AH")
    : (locale === "ar" ? "م" : "CE");
  if (date.precision === "YEAR") return `${localeNumber(date.year!, locale)} ${calendarLabel}`;

  if (date.calendar === "HIJRI") {
    const monthsAr = ["محرم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
    const monthsEn = ["Muharram","Safar","Rabi I","Rabi II","Jumada I","Jumada II","Rajab","Sha'ban","Ramadan","Shawwal","Dhu al-Qi'dah","Dhu al-Hijjah"];
    const monthName = (locale === "ar" ? monthsAr : monthsEn)[(date.month ?? 1) - 1];
    return `${monthName} ${localeNumber(date.year!, locale)} ${calendarLabel}`;
  }

  const formatter = new Intl.DateTimeFormat(localeForCalendar(locale, "GREGORIAN"), {
    calendar: "gregory",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return formatter.format(new Date(Date.UTC(date.year!, (date.month ?? 1) - 1, 1)));
}
