import assert from "node:assert/strict";
import test from "node:test";

import type { JsonValue } from "../lib/patient-access/service";

import {
  clinicalYearBounds,
  coerceClinicalApproxDate,
  convertClinicalApproxDate,
  formatClinicalApproxDate,
  futureClinicalApproxDatePaths,
  isHistoricalApproxDateOnOrBefore,
  isValidApproxDateValue,
  makeClinicalApproxDate,
} from "../lib/p01/clinical-date";

test("structured Gregorian month/year remains normalized and valid", () => {
  const value = makeClinicalApproxDate({
    calendar: "GREGORIAN",
    precision: "MONTH_YEAR",
    year: 2022,
    month: 10,
  });
  assert.equal(isValidApproxDateValue(value as unknown as JsonValue), true);
  assert.deepEqual(value.normalizedGregorian, { year: 2022, month: 10 });
});

test("year-only and unknown dates preserve patient precision", () => {
  const yearOnly = makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "YEAR", year: 2020 });
  const unknown = makeClinicalApproxDate({ calendar: "HIJRI", precision: "UNKNOWN" });
  assert.equal(isValidApproxDateValue(yearOnly as unknown as JsonValue), true);
  assert.equal(yearOnly.precision, "YEAR");
  assert.equal(isValidApproxDateValue(unknown as unknown as JsonValue), true);
  assert.equal(unknown.precision, "UNKNOWN");
});

test("legacy stored Gregorian strings remain readable during migration", () => {
  assert.equal(isValidApproxDateValue("2025-01"), true);
  assert.equal(isValidApproxDateValue("2025"), true);
  assert.equal(isValidApproxDateValue("١٠-٢٠٢٢"), true);
  assert.equal(coerceClinicalApproxDate("١٠-٢٠٢٢")?.month, 10);
  assert.equal(coerceClinicalApproxDate("١٠٢٠٢٣")?.year, 2023);
  assert.equal(coerceClinicalApproxDate("١٠٢٠٢٣")?.month, 10);
  assert.equal(coerceClinicalApproxDate("2025-01")?.month, 1);
});

test("partial structured picker values are not accepted as completed dates", () => {
  assert.equal(isValidApproxDateValue({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2025 }), false);
  assert.equal(isValidApproxDateValue({ calendar: "HIJRI", precision: "YEAR" }), false);
});

test("display formatting retains Hijri calendar identity", () => {
  const hijri = makeClinicalApproxDate({ calendar: "HIJRI", precision: "MONTH_YEAR", year: 1444, month: 3 });
  assert.match(formatClinicalApproxDate(hijri as unknown as JsonValue, "ar"), /١٤٤٤/);
  assert.match(formatClinicalApproxDate(hijri as unknown as JsonValue, "ar"), /هـ/);
});

test("Arabic Gregorian display is explicitly Gregorian and uses Arabic-Indic digits", () => {
  const gregorian = makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2022, month: 10 });
  const formatted = formatClinicalApproxDate(gregorian as unknown as JsonValue, "ar");
  assert.match(formatted, /أكتوبر/);
  assert.match(formatted, /٢٠٢٢/);
  assert.doesNotMatch(formatted, /محرم|صفر|ربيع|رمضان|شوال/);
});

test("English Gregorian display uses Gregorian month names and Latin digits", () => {
  const gregorian = makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2022, month: 10 });
  const formatted = formatClinicalApproxDate(gregorian as unknown as JsonValue, "en");
  assert.match(formatted, /October/);
  assert.match(formatted, /2022/);
  assert.doesNotMatch(formatted, /[٠-٩]/);
});


test("Gregorian to Hijri conversion preserves month/year precision and remains valid", () => {
  const gregorian = makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 8 });
  const hijri = convertClinicalApproxDate(gregorian as unknown as JsonValue, "HIJRI");
  assert.ok(hijri);
  assert.equal(hijri.calendar, "HIJRI");
  assert.equal(hijri.precision, "MONTH_YEAR");
  assert.equal(isValidApproxDateValue(hijri as unknown as JsonValue), true);
});

test("Hijri to Gregorian conversion preserves year-only precision", () => {
  const hijri = makeClinicalApproxDate({ calendar: "HIJRI", precision: "YEAR", year: 1448 });
  const gregorian = convertClinicalApproxDate(hijri as unknown as JsonValue, "GREGORIAN");
  assert.ok(gregorian);
  assert.equal(gregorian.calendar, "GREGORIAN");
  assert.equal(gregorian.precision, "YEAR");
  assert.equal(gregorian.month, undefined);
  assert.equal(isValidApproxDateValue(gregorian as unknown as JsonValue), true);
});

test("calendar round-trip keeps an approximate month/year in the same neighborhood", () => {
  const source = makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 8 });
  const hijri = convertClinicalApproxDate(source as unknown as JsonValue, "HIJRI");
  const roundTrip = convertClinicalApproxDate(hijri as unknown as JsonValue, "GREGORIAN");
  assert.ok(roundTrip?.year);
  assert.ok(roundTrip?.month);
  const sourceIndex = 2026 * 12 + 8;
  const roundTripIndex = roundTrip.year! * 12 + roundTrip.month!;
  assert.ok(Math.abs(roundTripIndex - sourceIndex) <= 1);
});

test("unknown precision survives calendar switching without inventing a date", () => {
  const unknown = makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "UNKNOWN" });
  const hijri = convertClinicalApproxDate(unknown as unknown as JsonValue, "HIJRI");
  assert.deepEqual(hijri, { calendar: "HIJRI", precision: "UNKNOWN" });
});

test("calendar year bounds are plausible and ordered", () => {
  const gregorian = clinicalYearBounds("GREGORIAN", new Date("2026-08-18T00:00:00Z"));
  const hijri = clinicalYearBounds("HIJRI", new Date("2026-08-18T00:00:00Z"));
  assert.deepEqual(gregorian, { min: 1900, max: 2026 });
  assert.ok(hijri.min >= 1300);
  assert.ok(hijri.max > hijri.min);
  assert.ok(hijri.max >= 1447 && hijri.max <= 1449);
});


test("calendar conversion refuses incomplete drafts instead of inventing a peer date", () => {
  const partial = { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026 } as unknown as JsonValue;
  assert.equal(convertClinicalApproxDate(partial, "HIJRI"), null);
});

test("historical approximate dates use precision-aware Gregorian server boundaries", () => {
  const boundary = new Date("2026-08-24T10:30:00.000Z");
  assert.equal(isHistoricalApproxDateOnOrBefore(makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "YEAR", year: 2026 }) as unknown as JsonValue, boundary), true);
  assert.equal(isHistoricalApproxDateOnOrBefore(makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 8 }) as unknown as JsonValue, boundary), true);
  assert.equal(isHistoricalApproxDateOnOrBefore(makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 9 }) as unknown as JsonValue, boundary), false);
  assert.equal(isHistoricalApproxDateOnOrBefore(makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "UNKNOWN" }) as unknown as JsonValue, boundary), true);
});

test("historical approximate dates compare Hijri input against the same server instant", () => {
  const boundary = new Date("2026-08-24T10:30:00.000Z");
  const currentHijri = convertClinicalApproxDate(
    makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 8 }) as unknown as JsonValue,
    "HIJRI",
  );
  assert.ok(currentHijri?.year && currentHijri.month);
  assert.equal(isHistoricalApproxDateOnOrBefore(currentHijri as unknown as JsonValue, boundary), true);
  assert.equal(isHistoricalApproxDateOnOrBefore(makeClinicalApproxDate({ calendar: "HIJRI", precision: "MONTH_YEAR", year: currentHijri.year, month: currentHijri.month === 12 ? 12 : currentHijri.month + 1 }) as unknown as JsonValue, boundary), false);
});

test("future date scan reports only structured clinical-date paths", () => {
  const boundary = new Date("2026-08-24T10:30:00.000Z");
  const document = {
    answers: {
      valid: makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 8 }),
      nested: [{ start: makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 9 }) }],
      serverTimestamp: "2030-01-01T00:00:00.000Z",
    },
  } as unknown as JsonValue;
  assert.deepEqual(futureClinicalApproxDatePaths(document, boundary), ["$.answers.nested[0].start"]);
});

test("Gregorian/Hijri month-year conversion is stable across a multi-year clinical sample", () => {
  for (let year = 2018; year <= 2026; year += 1) {
    for (const month of [1, 4, 7, 10]) {
      const source = makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year, month });
      const hijri = convertClinicalApproxDate(source as unknown as JsonValue, "HIJRI");
      assert.ok(hijri, `${year}-${month}: Gregorian -> Hijri`);
      assert.equal(isValidApproxDateValue(hijri as unknown as JsonValue), true, `${year}-${month}: valid Hijri`);
      const roundTrip = convertClinicalApproxDate(hijri as unknown as JsonValue, "GREGORIAN");
      assert.ok(roundTrip?.year && roundTrip?.month, `${year}-${month}: Hijri -> Gregorian`);
      const sourceIndex = year * 12 + month;
      const roundTripIndex = roundTrip.year! * 12 + roundTrip.month!;
      assert.ok(Math.abs(roundTripIndex - sourceIndex) <= 1, `${year}-${month}: round-trip drift`);
    }
  }
});
