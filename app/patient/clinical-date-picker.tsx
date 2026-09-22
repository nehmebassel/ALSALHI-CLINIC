"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  clinicalYearBounds,
  coerceClinicalApproxDate,
  convertClinicalApproxDate,
  formatClinicalApproxDate,
  isHistoricalApproxDateOnOrBefore,
  makeClinicalApproxDate,
  type ClinicalCalendar,
  type ClinicalDatePrecision,
} from "@/lib/p01/clinical-date";
import type { P01Locale } from "@/lib/p01/engine";
import type { JsonValue } from "@/lib/patient-access/service";
import { localizeDigits, localeForCalendar, toAsciiDigits } from "@/lib/p01/locale";

const HIJRI_MONTHS_AR = [
  "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
  "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];
const HIJRI_MONTHS_EN = [
  "Muharram", "Safar", "Rabi I", "Rabi II", "Jumada I", "Jumada II",
  "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah",
];

const ClinicalDateReferenceContext = createContext<string | undefined>(undefined);

export function ClinicalDateReferenceProvider({ value, children }: { value: string; children: ReactNode }) {
  return <ClinicalDateReferenceContext.Provider value={value}>{children}</ClinicalDateReferenceContext.Provider>;
}

export function useClinicalDateReference(): Date {
  const value = useContext(ClinicalDateReferenceContext);
  const parsed = value ? new Date(value) : new Date(Number.NaN);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function gregorianMonths(locale: P01Locale): string[] {
  const formatter = new Intl.DateTimeFormat(localeForCalendar(locale, "GREGORIAN"), {
    calendar: "gregory",
    month: "long",
    timeZone: "UTC",
  });
  return Array.from({ length: 12 }, (_, index) => formatter.format(new Date(Date.UTC(2024, index, 1))));
}

export function ClinicalDatePicker({
  value,
  locale,
  onChange,
  allowUnknown = true,
}: {
  value: JsonValue | undefined;
  locale: P01Locale;
  onChange: (value: JsonValue) => void;
  allowUnknown?: boolean;
}) {
  const parsed = coerceClinicalApproxDate(value);
  const calendar: ClinicalCalendar = parsed?.calendar ?? "GREGORIAN";
  const precision: ClinicalDatePrecision = parsed?.precision ?? "MONTH_YEAR";
  const year = parsed?.year;
  const month = parsed?.month;
  const referenceDate = useClinicalDateReference();
  const gMonths = useMemo(() => gregorianMonths(locale), [locale]);
  const monthNames = calendar === "HIJRI"
    ? (locale === "ar" ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN)
    : gMonths;
  const bounds = clinicalYearBounds(calendar, referenceDate);
  const complete = Boolean(
    precision === "UNKNOWN" ||
    (year && precision === "YEAR") ||
    (year && month && precision === "MONTH_YEAR"),
  );
  const alternate = complete && precision !== "UNKNOWN"
    ? convertClinicalApproxDate(value, calendar === "GREGORIAN" ? "HIJRI" : "GREGORIAN")
    : null;

  function emit(next: {
    calendar?: ClinicalCalendar;
    precision?: ClinicalDatePrecision;
    year?: number;
    month?: number;
    clearYear?: boolean;
    clearMonth?: boolean;
  }) {
    const nextCalendar = next.calendar ?? calendar;
    const nextPrecision = next.precision ?? precision;
    if (nextPrecision === "UNKNOWN") {
      onChange(makeClinicalApproxDate({ calendar: nextCalendar, precision: "UNKNOWN" }) as unknown as JsonValue);
      return;
    }

    const nextYear = next.clearYear ? undefined : (next.year ?? year);
    const nextMonth = next.clearMonth ? undefined : (next.month ?? month);
    const nextBounds = clinicalYearBounds(nextCalendar, referenceDate);
    const yearIsValid = typeof nextYear === "number" && Number.isInteger(nextYear) && nextYear >= nextBounds.min && nextYear <= nextBounds.max;
    const monthIsValid = typeof nextMonth === "number" && Number.isInteger(nextMonth) && nextMonth >= 1 && nextMonth <= 12;

    if (!yearIsValid || (nextPrecision === "MONTH_YEAR" && !monthIsValid)) {
      onChange({
        calendar: nextCalendar,
        precision: nextPrecision,
        ...(typeof nextYear === "number" ? { year: nextYear } : {}),
        ...(nextPrecision === "MONTH_YEAR" && typeof nextMonth === "number" ? { month: nextMonth } : {}),
      });
      return;
    }

    const candidate = makeClinicalApproxDate({
      calendar: nextCalendar,
      precision: nextPrecision,
      year: nextYear,
      ...(nextPrecision === "MONTH_YEAR" ? { month: nextMonth } : {}),
    });
    if (!isHistoricalApproxDateOnOrBefore(candidate as unknown as JsonValue, referenceDate)) {
      onChange({ calendar: nextCalendar, precision: nextPrecision, year: nextYear });
      return;
    }
    onChange(candidate as unknown as JsonValue);
  }

  function switchCalendar(nextCalendar: ClinicalCalendar) {
    if (nextCalendar === calendar) return;
    const converted = convertClinicalApproxDate(value, nextCalendar);
    if (converted) {
      onChange(converted as unknown as JsonValue);
      return;
    }
    // For an incomplete draft, retain the precision choice only. Carrying the
    // same numeric year/month into another calendar would silently change meaning.
    onChange({ calendar: nextCalendar, precision });
  }

  function changeYear(raw: string) {
    const ascii = toAsciiDigits(raw).replace(/[^0-9]/g, "").slice(0, 4);
    if (!ascii) {
      emit({ clearYear: true });
      return;
    }
    emit({ year: Number(ascii) });
  }

  return (
    <div className="clinical-date-picker">
      <div className="calendar-toggle" role="group" aria-label={locale === "ar" ? "نوع التقويم" : "Calendar type"}>
        <button
          type="button"
          aria-pressed={calendar === "GREGORIAN"}
          className={calendar === "GREGORIAN" ? "active" : ""}
          onClick={() => switchCalendar("GREGORIAN")}
        >
          {locale === "ar" ? "ميلادي" : "Gregorian"}
        </button>
        <button
          type="button"
          aria-pressed={calendar === "HIJRI"}
          className={calendar === "HIJRI" ? "active" : ""}
          onClick={() => switchCalendar("HIJRI")}
        >
          {locale === "ar" ? "هجري" : "Hijri"}
        </button>
      </div>

      <div className="date-precision-row" role="radiogroup" aria-label={locale === "ar" ? "دقة التاريخ" : "Date precision"}>
        <label className={precision === "MONTH_YEAR" ? "precision-chip selected" : "precision-chip"}>
          <input type="radio" checked={precision === "MONTH_YEAR"} onChange={() => emit({ precision: "MONTH_YEAR" })} />
          <span>{locale === "ar" ? "الشهر والسنة" : "Month & year"}</span>
        </label>
        <label className={precision === "YEAR" ? "precision-chip selected" : "precision-chip"}>
          <input type="radio" checked={precision === "YEAR"} onChange={() => emit({ precision: "YEAR", clearMonth: true })} />
          <span>{locale === "ar" ? "السنة فقط" : "Year only"}</span>
        </label>
        {allowUnknown && (
          <label className={precision === "UNKNOWN" ? "precision-chip selected" : "precision-chip"}>
            <input type="radio" checked={precision === "UNKNOWN"} onChange={() => emit({ precision: "UNKNOWN" })} />
            <span>{locale === "ar" ? "لا أتذكر" : "I don't remember"}</span>
          </label>
        )}
      </div>

      {precision !== "UNKNOWN" && (
        <div className="date-select-grid">
          {precision === "MONTH_YEAR" && (
            <label>
              <span>{locale === "ar" ? "الشهر" : "Month"}</span>
              <select value={month ?? ""} onChange={(event) => emit({ month: Number(event.target.value) || undefined, clearMonth: !event.target.value })}>
                <option value="">{locale === "ar" ? "اختر الشهر" : "Select month"}</option>
                {monthNames.map((name, index) => {
                  const candidate = typeof year === "number"
                    ? makeClinicalApproxDate({ calendar, precision: "MONTH_YEAR", year, month: index + 1 })
                    : undefined;
                  const future = candidate
                    ? !isHistoricalApproxDateOnOrBefore(candidate as unknown as JsonValue, referenceDate)
                    : false;
                  return <option disabled={future} key={`${calendar}:${index}`} value={index + 1}>{name}</option>;
                })}
              </select>
            </label>
          )}
          <label>
            <span>{locale === "ar" ? "السنة" : "Year"}</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              value={year ? localizeDigits(year, locale) : ""}
              placeholder={`${localizeDigits(bounds.min, locale)}–${localizeDigits(bounds.max, locale)}`}
              onChange={(event) => changeYear(event.target.value)}
              aria-invalid={Boolean(year && (year < bounds.min || year > bounds.max))}
            />
          </label>
        </div>
      )}

      {complete && (
        <div className="date-preview" aria-live="polite">
          <span>
            {locale === "ar" ? "التاريخ المختار" : "Selected date"}
            <strong>{formatClinicalApproxDate(value, locale)}</strong>
          </span>
          {alternate && (
            <span>
              {locale === "ar" ? "المقابل التقريبي" : "Approximate equivalent"}
              <strong>{formatClinicalApproxDate(alternate as unknown as JsonValue, locale)}</strong>
            </span>
          )}
        </div>
      )}

      {!complete && precision !== "UNKNOWN" && (
        <small className="date-guidance">
          {locale === "ar"
            ? `أدخل سنة بين ${localizeDigits(bounds.min, locale)} و${localizeDigits(bounds.max, locale)}${precision === "MONTH_YEAR" ? " واختر الشهر" : ""}.`
            : `Enter a year between ${bounds.min} and ${bounds.max}${precision === "MONTH_YEAR" ? " and choose the month" : ""}.`}
        </small>
      )}
    </div>
  );
}
