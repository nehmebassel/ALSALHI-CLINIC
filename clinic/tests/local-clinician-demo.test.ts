import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CLINICIAN_DEMO_SCHEMA,
  activeDatabaseSchema,
  clinicianDemoPrismaSchema,
} from "../lib/local-clinician-demo";

const localDatabaseUrl = "postgresql://local:local@127.0.0.1:5432/alsalhi_clinical_platform?schema=public";

test("normal mode preserves the DATABASE_URL default schema", () => {
  assert.equal(clinicianDemoPrismaSchema({ DATABASE_URL: localDatabaseUrl }), undefined);
  assert.equal(activeDatabaseSchema({ DATABASE_URL: localDatabaseUrl }), "public");
});

test("clinician demo resolves only the fixed isolated schema", () => {
  assert.equal(
    clinicianDemoPrismaSchema({
      ALSALHI_CLINICIAN_DEMO: "true",
      DATABASE_URL: localDatabaseUrl,
      NODE_ENV: "development",
    }),
    CLINICIAN_DEMO_SCHEMA,
  );
  assert.equal(activeDatabaseSchema({
    ALSALHI_CLINICIAN_DEMO: "true",
    DATABASE_URL: localDatabaseUrl,
    NODE_ENV: "development",
  }), CLINICIAN_DEMO_SCHEMA);
});

test("clinician demo fails closed for production, remote hosts, wrong databases, and invalid flags", () => {
  assert.throws(() => clinicianDemoPrismaSchema({
    ALSALHI_CLINICIAN_DEMO: "true",
    DATABASE_URL: localDatabaseUrl,
    NODE_ENV: "production",
  }), /local-development-only/);
  assert.throws(() => clinicianDemoPrismaSchema({
    ALSALHI_CLINICIAN_DEMO: "true",
    DATABASE_URL: "postgresql://user:pass@database.example/alsalhi_clinical_platform?schema=public",
  }), /non-local/);
  assert.throws(() => clinicianDemoPrismaSchema({
    ALSALHI_CLINICIAN_DEMO: "true",
    DATABASE_URL: "postgresql://user:pass@localhost/another_database?schema=public",
  }), /requires the local/);
  assert.throws(() => clinicianDemoPrismaSchema({
    ALSALHI_CLINICIAN_DEMO: "yes",
    DATABASE_URL: localDatabaseUrl,
  }), /exactly/);
});

test("launch commands keep normal startup unchanged and isolate demo build output", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  const launcher = readFileSync(new URL("../scripts/start-clinician-demo.mjs", import.meta.url), "utf8");

  assert.equal(packageJson.scripts.dev, "next dev");
  assert.equal(packageJson.scripts.demo, "node scripts/start-clinician-demo.mjs");
  assert.match(nextConfig, /distDir: "\.next-clinician-demo"/);
  assert.match(launcher, /const DEMO_PORT = "3001"/);
  assert.match(launcher, /"--hostname", "127\.0\.0\.1"/);
  assert.match(launcher, /\{ length: 20 \}/);
  assert.match(launcher, /`DEMO-\$\{String\(index \+ 1\)\.padStart\(3, "0"\)\}`/);
  assert.match(launcher, /patientCount !== EXPECTED_DEMO_IDENTIFIERS\.length/);
  assert.match(launcher, /identifier === EXPECTED_DEMO_IDENTIFIERS\[index\]/);
  assert.doesNotMatch(launcher, /seed-clinician-demo|prisma\/seed/);
});


test("runtime raw SQL locks follow the active schema and never hard-code public", () => {
  const runtimeSqlFiles = [
    "../lib/submission/service.ts",
    "../lib/physician/visit-clinical-service.ts",
    "../lib/physician/visit-lifecycle-service.ts",
    "../lib/physician/visit-longitudinal-service.ts",
  ];

  for (const relativePath of runtimeSqlFiles) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /activeDatabaseSchema/);
    assert.doesNotMatch(source, /public\.\"|\"public\"\.\"/);
    const queryCount = source.match(/\$queryRaw/g)?.length ?? 0;
    const schemaQualifiedRawCount = source.match(/Prisma\.raw\(`"\$\{this\.databaseSchema\}"/g)?.length ?? 0;
    assert.ok(queryCount > 0);
    assert.ok(schemaQualifiedRawCount >= queryCount);
  }
});
