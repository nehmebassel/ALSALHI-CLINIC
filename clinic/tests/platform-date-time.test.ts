import assert from "node:assert/strict";
import test from "node:test";

import { formatClinicDate, formatClinicDateTime, formatClinicMonthYear } from "../lib/platform/date-time";

test("formats physician timestamps deterministically in Riyadh Arabic", () => {
  assert.equal(
    formatClinicDateTime("2026-08-17T12:24:00.000Z", "ar"),
    "١٧ أغسطس ٢٠٢٦، ٠٣:٢٤ م",
  );
});

test("formats physician timestamps deterministically in Riyadh English", () => {
  assert.equal(
    formatClinicDateTime("2026-08-17T12:24:00.000Z", "en"),
    "17 Aug 2026, 03:24 PM",
  );
});


test("formats physician date-only labels deterministically", () => {
  assert.equal(formatClinicDate("2026-08-17T21:30:00.000Z", "ar"), "١٨ أغسطس ٢٠٢٦");
  assert.equal(formatClinicDate("2026-08-17T21:30:00.000Z", "en"), "18 Aug 2026");
  assert.equal(formatClinicMonthYear("2026-08-17T21:30:00.000Z", "ar"), "أغسطس ٢٠٢٦");
  assert.equal(formatClinicMonthYear("2026-08-17T21:30:00.000Z", "en"), "Aug 2026");
});
