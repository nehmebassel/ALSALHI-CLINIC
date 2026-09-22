import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  BoundedJsonBodyError,
  parseBoundedJsonBody,
} from "../lib/http/bounded-json";
import {
  parseAddPhysicianVisitAddendumRequestBody,
  parseFinalizePhysicianVisitRequestBody,
  PhysicianVisitLifecycleError,
} from "../lib/physician/visit-lifecycle-contracts";
import {
  canonicalizePhysicianVisitDraft,
  fingerprintPhysicianVisitDraft,
  isPhysicianVisitCorrectionWindowOpen,
  physicianVisitCorrectionDeadline,
} from "../lib/physician/visit-lifecycle-service";

test("FPV-2.1 canonical Draft bytes and fingerprint ignore object key order", () => {
  const left = {
    schemaVersion: "FPV_DRAFT_V1",
    sections: { EXAMINATION: { beta: 2, alpha: 1 } },
  };
  const right = {
    sections: { EXAMINATION: { alpha: 1, beta: 2 } },
    schemaVersion: "FPV_DRAFT_V1",
  };
  assert.equal(
    canonicalizePhysicianVisitDraft(left),
    canonicalizePhysicianVisitDraft(right),
  );
  assert.equal(fingerprintPhysicianVisitDraft(left), fingerprintPhysicianVisitDraft(right));
  assert.notEqual(
    fingerprintPhysicianVisitDraft(left),
    fingerprintPhysicianVisitDraft({
      schemaVersion: "FPV_DRAFT_V1",
      sections: { EXAMINATION: { alpha: 1, beta: 3 } },
    }),
  );
});

test("FPV-2.1 canonical Draft hashing is nested, locale-independent, and array-order-sensitive", () => {
  const nestedLeft = {
    z: { "أ": null, "Ω": true, "ä": 1.5, a: "stable" },
    a: { second: 2, first: 1 },
  };
  const nestedRight = {
    a: { first: 1, second: 2 },
    z: { a: "stable", "ä": 1.5, "Ω": true, "أ": null },
  };

  assert.equal(
    canonicalizePhysicianVisitDraft(nestedLeft),
    '{"a":{"first":1,"second":2},"z":{"a":"stable","ä":1.5,"Ω":true,"أ":null}}',
  );
  assert.equal(
    fingerprintPhysicianVisitDraft(nestedLeft),
    fingerprintPhysicianVisitDraft(nestedRight),
  );
  assert.notEqual(
    fingerprintPhysicianVisitDraft({ values: [1, "two", false, null] }),
    fingerprintPhysicianVisitDraft({ values: [null, false, "two", 1] }),
  );
  assert.equal(
    canonicalizePhysicianVisitDraft({
      string: "value",
      number: 2.5,
      boolean: false,
      nullable: null,
    }),
    '{"boolean":false,"nullable":null,"number":2.5,"string":"value"}',
  );
});

test("FPV-2 correction boundary is strictly before visitOccurredAt + 24h", () => {
  const occurredAt = new Date("2026-08-28T08:00:00.000Z");
  const deadline = physicianVisitCorrectionDeadline(occurredAt);
  assert.equal(deadline.toISOString(), "2026-08-29T08:00:00.000Z");
  assert.equal(
    isPhysicianVisitCorrectionWindowOpen(
      occurredAt,
      new Date(deadline.getTime() - 1),
    ),
    true,
  );
  assert.equal(isPhysicianVisitCorrectionWindowOpen(occurredAt, deadline), false);
  assert.equal(
    isPhysicianVisitCorrectionWindowOpen(
      occurredAt,
      new Date(deadline.getTime() + 1),
    ),
    false,
  );
});

test("FPV-2 lifecycle request contracts reject client-owned fields", () => {
  assert.deepEqual(parseFinalizePhysicianVisitRequestBody({ expectedDraftVersion: 3 }), {
    expectedDraftVersion: 3,
  });
  for (const value of [
    null,
    { expectedDraftVersion: 3, visitOccurredAt: "2020-01-01" },
    { expectedDraftVersion: 3, finalizedAt: "2020-01-01" },
    { expectedDraftVersion: 0 },
  ]) {
    assert.throws(
      () => parseFinalizePhysicianVisitRequestBody(value),
      (error: unknown) =>
        error instanceof PhysicianVisitLifecycleError &&
        error.code === "INVALID_REQUEST",
    );
  }

  assert.deepEqual(
    parseAddPhysicianVisitAddendumRequestBody({
      type: "CLARIFICATION",
      content: "Physician-authored clarification.",
    }),
    {
      type: "CLARIFICATION",
      content: "Physician-authored clarification.",
    },
  );
  assert.throws(
    () =>
      parseAddPhysicianVisitAddendumRequestBody({
        type: "CLARIFICATION",
        content: "No backdating.",
        createdAt: "2020-01-01",
      }),
    (error: unknown) =>
      error instanceof PhysicianVisitLifecycleError &&
      error.code === "INVALID_REQUEST",
  );
});

test("FPV physician JSON ingress rejects declared and streamed oversized bodies", async () => {
  const declared = new Request("http://localhost/api/physician", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "content-length": "2000",
    },
    body: "{}",
  });
  await assert.rejects(
    parseBoundedJsonBody(declared, 1024),
    (error: unknown) =>
      error instanceof BoundedJsonBodyError &&
      error.code === "REQUEST_BODY_TOO_LARGE",
  );

  const streamed = new Request("http://localhost/api/physician", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`{"value":"${"x".repeat(2048)}"}`));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  await assert.rejects(
    parseBoundedJsonBody(streamed, 1024),
    (error: unknown) =>
      error instanceof BoundedJsonBodyError &&
      error.code === "REQUEST_BODY_TOO_LARGE",
  );
});

test("FPV-2 exposes no generic clinical correction mutation route", () => {
  const root = process.cwd();
  assert.equal(
    existsSync(`${root}/app/api/physician/visits/[visitId]/correction/route.ts`),
    false,
  );
  assert.equal(
    existsSync(
      `${root}/app/api/physician/visits/[visitId]/correction-eligibility/route.ts`,
    ),
    true,
  );
  const service = readFileSync(
    `${root}/lib/physician/visit-lifecycle-service.ts`,
    "utf8",
  );
  for (const forbiddenWriter of [
    "measurement.create",
    "timelineEvent.create",
    "clinicianAssessment.create",
    "physicianHairJourney.create",
  ]) {
    assert.equal(service.includes(forbiddenWriter), false);
  }
});

test("FPV-2 migration enforces write-once encounter time and append-only evidence", () => {
  const migration = readFileSync(
    `${process.cwd()}/prisma/migrations/20260828143000_fpv2_lifecycle/migration.sql`,
    "utf8",
  );
  assert.match(migration, /Visit_visitOccurredAt_immutable/);
  assert.match(migration, /PhysicianVisitRecord_finalized_immutable/);
  assert.match(migration, /PhysicianVisitAddendum_append_only/);
  assert.doesNotMatch(migration, /INSERT INTO "PhysicianVisitRecord"/);
});

test("FPV-2.1 migration enforces append-only audit and full-row lifecycle locks", () => {
  const migration = readFileSync(
    `${process.cwd()}/prisma/migrations/20260828233000_fpv2_1_integrity_hardening/migration.sql`,
    "utf8",
  );
  assert.match(migration, /AuditLog_append_only/);
  assert.match(migration, /AuditLog cannot be updated or deleted/);
  assert.match(migration, /IF visit_is_finalized THEN/);
  assert.match(migration, /IF OLD\."status"::text = 'FINALIZED' THEN/);
  assert.doesNotMatch(migration, /INSERT INTO "PhysicianVisitRecord"/);
  assert.doesNotMatch(migration, /UPDATE "PhysicianVisitRecord"/);
  assert.doesNotMatch(migration, /UPDATE "Visit"/);
});
