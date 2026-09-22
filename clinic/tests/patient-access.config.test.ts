import assert from "node:assert/strict";
import test from "node:test";

import {
  getPatientSessionDeadlines,
  getTerminalDraftPurgeAfter,
} from "../lib/patient-access/config";

const NOW = new Date("2026-08-11T09:00:00.000Z");

test("TEST-ACC-005/007/009 fixes warning, lock, and expiry at 5/7/30 minutes", () => {
  const deadlines = getPatientSessionDeadlines(NOW);

  assert.equal(deadlines.warningAt.toISOString(), "2026-08-11T09:05:00.000Z");
  assert.equal(deadlines.lockAt.toISOString(), "2026-08-11T09:07:00.000Z");
  assert.equal(deadlines.expiresAt.toISOString(), "2026-08-11T09:30:00.000Z");
});

test("TEST-ACC-021 schedules terminal Draft purge after 24 hours", () => {
  assert.equal(
    getTerminalDraftPurgeAfter(NOW).toISOString(),
    "2026-08-12T09:00:00.000Z",
  );
});
