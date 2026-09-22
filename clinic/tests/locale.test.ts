import assert from "node:assert/strict";
import test from "node:test";

import { localizeDigits, localeNumber, toAsciiDigits } from "../lib/p01/locale";

test("Arabic UI digits are Arabic-Indic and English UI digits are Latin", () => {
  assert.equal(localizeDigits("Step 3 of 12", "ar"), "Step ٣ of ١٢");
  assert.equal(localizeDigits("٣–أقل من ٦ أشهر", "en"), "3–أقل من 6 أشهر");
  assert.equal(localeNumber(2026, "ar"), "٢٠٢٦");
  assert.equal(localeNumber(2026, "en"), "2026");
});

test("stored numeric input is normalized to ASCII regardless of typed digit set", () => {
  assert.equal(toAsciiDigits("١٠٢٠٢٣"), "102023");
  assert.equal(toAsciiDigits("۲۰۲۶"), "2026");
});
