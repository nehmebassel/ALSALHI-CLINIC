import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, normalizeUsername, usernameLoginEmail, verifyPassword } from "../lib/auth/password";

test("password hashing verifies the original secret and rejects a different secret", () => {
  const hash = hashPassword("Independent-Test-Secret-2026!");
  assert.match(hash, /^scrypt-v1\$/);
  assert.equal(verifyPassword("Independent-Test-Secret-2026!", hash), true);
  assert.equal(verifyPassword("wrong-password", hash), false);
});

test("local login username normalization is deterministic", () => {
  assert.equal(normalizeUsername(" Nurse.Test "), "nurse.test");
  assert.equal(usernameLoginEmail("Nurse.Test"), "nurse.test@login.p01.invalid");
});
