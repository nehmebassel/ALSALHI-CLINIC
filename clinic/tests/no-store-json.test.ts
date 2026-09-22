import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { noStoreJson } from "../lib/http/no-store-json";

test("clinical JSON responses override intermediary caching while preserving status and headers", async () => {
  const response = noStoreJson(
    { patientScoped: true },
    { status: 201, headers: { "cache-control": "public, max-age=600", "x-audit": "preserved" } },
  );

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-audit"), "preserved");
  assert.deepEqual(await response.json(), { patientScoped: true });
});

test("every patient/session/physician write API routes its JSON through the no-store boundary", async () => {
  const routePaths = [
    "../app/api/interview-invitations/route.ts",
    "../app/api/staff/session-actions/route.ts",
    "../app/api/patient-access/draft/route.ts",
    "../app/api/patient-access/final-submit/route.ts",
    "../app/api/physician/patients/[patientId]/hair-history/route.ts",
    "../app/api/auth/logout/route.ts",
    "../app/api/auth/me/route.ts",
  ];

  for (const path of routePaths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /noStoreJson/);
    assert.doesNotMatch(source, /return Response\.json/);
  }
});
