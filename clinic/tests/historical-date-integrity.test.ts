import assert from "node:assert/strict";
import test from "node:test";

import { historicalClinicalDateIssues } from "../lib/p01/historical-date-integrity";
import { convertClinicalApproxDate, makeClinicalApproxDate } from "../lib/p01/clinical-date";
import type { JsonValue, PatientInputJson } from "../lib/patient-access/service";

const boundary = new Date("2026-08-24T10:30:00.000Z");

test("autosave date guard accepts today, past dates, and unknown precision", () => {
  const input = {
    answers: {
      Q_PROFILE_DOB: "1990-08-24",
      Q_HAIR_SHEDDING_ONSET: makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 8 }),
      Q_HAIR_THINNING_ONSET: makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "UNKNOWN" }),
    },
  } as unknown as PatientInputJson;
  assert.deepEqual(historicalClinicalDateIssues(input, boundary), []);
});

test("autosave date guard rejects exact and nested approximate future dates", () => {
  const input = {
    answers: {
      Q_PROFILE_DOB: "2026-08-25",
      Q_HEALTH_CHRONIC_ITEMS: [{
        id: "one",
        date: makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 9 }),
      }],
    },
  } as unknown as PatientInputJson;
  assert.deepEqual(historicalClinicalDateIssues(input, boundary), [
    { path: "$.answers.Q_HEALTH_CHRONIC_ITEMS[0].date", kind: "FUTURE_APPROXIMATE_DATE" },
    { path: "$.answers.Q_PROFILE_DOB", kind: "INVALID_OR_FUTURE_EXACT_DATE" },
  ]);
});

test("autosave date guard rejects incomplete clinical-date objects instead of treating them as unknown", () => {
  const input = {
    answers: {
      Q_HAIR_SHEDDING_ONSET: { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026 } as JsonValue,
    },
  } as PatientInputJson;
  assert.deepEqual(historicalClinicalDateIssues(input, boundary), [
    { path: "$.answers.Q_HAIR_SHEDDING_ONSET", kind: "FUTURE_APPROXIMATE_DATE" },
  ]);
});

test("Gregorian and Hijri historical boundaries agree at the current server month", () => {
  const gregorianCurrent = makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 8 });
  const hijriCurrent = convertClinicalApproxDate(gregorianCurrent, "HIJRI");
  assert.ok(hijriCurrent);
  const currentInput = { answers: { GREGORIAN: gregorianCurrent, HIJRI: hijriCurrent } } as unknown as PatientInputJson;
  assert.deepEqual(historicalClinicalDateIssues(currentInput, boundary), []);

  const gregorianFuture = makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 9 });
  const hijriFuture = convertClinicalApproxDate(gregorianFuture, "HIJRI");
  assert.ok(hijriFuture);
  const futureInput = { answers: { GREGORIAN: gregorianFuture, HIJRI: hijriFuture } } as unknown as PatientInputJson;
  assert.deepEqual(historicalClinicalDateIssues(futureInput, boundary).map((issue) => issue.path), [
    "$.answers.GREGORIAN",
    "$.answers.HIJRI",
  ]);
});
