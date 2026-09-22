import assert from "node:assert/strict";
import test from "node:test";

import {
  ClinicMrnValidationError,
  normalizeClinicMrn,
} from "../lib/identity/mrn";

test("TEST-ID-001 normalizes display variants to one Clinic MRN key", () => {
  assert.equal(normalizeClinicMrn(" ab-١٢ 3 "), "AB123");
  assert.equal(normalizeClinicMrn("AB_123"), "AB123");
  assert.equal(normalizeClinicMrn("ＡＢ１２３"), "AB123");
});

test("TEST-ID-003 rejects empty or unsupported Clinic MRN characters", () => {
  for (const value of ["", "---", "MRN#123", "رقم١٢٣"]) {
    assert.throws(() => normalizeClinicMrn(value), ClinicMrnValidationError);
  }
});
