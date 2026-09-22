import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  parseUpdatePhysicianVisitDraftRequestBody,
  PHYSICIAN_VISIT_DRAFT_SECTIONS,
  PhysicianVisitDraftError,
} from "../lib/physician/visit-contracts";
import { validatePhysicianVisitDraftEnvelope } from "../lib/physician/visit-service";

test("FPV-1.1 Draft API rejects valid JSON that is not an object", () => {
  for (const malformed of [null, [], "draft", 1, true]) {
    assert.throws(
      () => parseUpdatePhysicianVisitDraftRequestBody(malformed),
      (error: unknown) =>
        error instanceof PhysicianVisitDraftError &&
        error.code === "INVALID_REQUEST",
    );
  }
  assert.deepEqual(
    parseUpdatePhysicianVisitDraftRequestBody({
      expectedDraftVersion: 2,
      section: "EXAMINATION",
      value: {},
    }),
    { expectedDraftVersion: 2, section: "EXAMINATION", value: {} },
  );
});

test("FPV-1.1 Draft top-level section registry is explicit and closed", () => {
  assert.deepEqual(PHYSICIAN_VISIT_DRAFT_SECTIONS, [
    "EXAMINATION",
    "MEASUREMENTS",
    "PATTERN",
    "ANATOMICAL_MAP",
    "TRICHOSCOPY",
    "DIAGNOSIS",
    "TREATMENT_PROCEDURES",
    "TESTS_MEDIA",
    "PLAN",
  ]);
  assert.throws(
    () =>
      validatePhysicianVisitDraftEnvelope({
        schemaVersion: "FPV_DRAFT_V1",
        sections: { UNKNOWN: {} },
      }),
    (error: unknown) =>
      error instanceof PhysicianVisitDraftError &&
      error.code === "INVALID_DRAFT_DATA",
  );
});

test("FPV-1.1 uses Draft preparation semantics and exposes no encounter-start route", () => {
  assert.equal(
    existsSync("app/api/physician/visits/[visitId]/start/route.ts"),
    false,
  );
  assert.equal(
    existsSync("app/api/physician/visits/[visitId]/prepare/route.ts"),
    true,
  );
  const prepareRoute = readFileSync(
    "app/api/physician/visits/[visitId]/prepare/route.ts",
    "utf8",
  );
  assert.match(prepareRoute, /prepareDraft/);
  assert.doesNotMatch(prepareRoute, /visitOccurredAt/);
});

test("FPV-1.1 synthetic compatibility writes tenant scope without regenerating physician provenance", () => {
  const source = readFileSync("prisma/seed-synthetic.ts", "utf8");
  assert.match(
    source,
    /clinicalEpisode\.create\(\{ data: \{ patientId: patient\.id, clinicScopeId,/,
  );
  assert.match(
    source,
    /patientId: runtime\.patient\.id,\s+clinicScopeId: externalId\.clinicScopeId,\s+sourceDraftId:/,
  );
  assert.doesNotMatch(source, /physicianVisitRecord\.(?:create|upsert)/);
});
