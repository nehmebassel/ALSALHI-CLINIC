import nextEnv from "@next/env";
import pg from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEMO_SCHEMA = "alsalhi_clinician_demo_20260907";
const DEMO_DATABASE = "alsalhi_clinical_platform";
const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DEMO_PORT = "3001";
const EXPECTED_DEMO_IDENTIFIERS = Array.from(
  { length: 20 },
  (_, index) => `DEMO-${String(index + 1).padStart(3, "0")}`,
);

nextEnv.loadEnvConfig(process.cwd(), true);

if (process.env.NODE_ENV === "production") {
  throw new Error("Clinician demo mode is local-development-only and cannot run in production.");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for clinician demo mode.");

let databaseUrl;
try {
  databaseUrl = new URL(connectionString);
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL URL for clinician demo mode.");
}

if (!LOCAL_DATABASE_HOSTS.has(databaseUrl.hostname)) {
  throw new Error("Clinician demo mode refuses non-local PostgreSQL hosts.");
}
if (databaseUrl.pathname.replace(/^\//, "") !== DEMO_DATABASE) {
  throw new Error(`Clinician demo mode requires the local ${DEMO_DATABASE} database.`);
}

const urlSchema = databaseUrl.searchParams.get("schema");
if (urlSchema && urlSchema !== "public" && urlSchema !== DEMO_SCHEMA) {
  throw new Error("Clinician demo mode refuses an unexpected DATABASE_URL schema target.");
}

const quotedSchema = `"${DEMO_SCHEMA}"`;
const client = new pg.Client({ connectionString });
try {
  await client.connect();
  const result = await client.query(`
    SELECT
      COUNT(*)::integer AS "patientCount",
      COUNT(*) FILTER (WHERE pi."displayValue" LIKE 'DEMO-%')::integer AS "demoIdentifierCount",
      COUNT(*) FILTER (WHERE pi."displayValue" NOT LIKE 'DEMO-%' OR pi."displayValue" IS NULL)::integer AS "otherIdentifierCount",
      ARRAY_AGG(pi."displayValue" ORDER BY pi."displayValue")
        FILTER (WHERE pi."displayValue" LIKE 'DEMO-%') AS "demoIdentifiers"
    FROM ${quotedSchema}."Patient" p
    LEFT JOIN ${quotedSchema}."ExternalPatientIdentifier" pi
      ON pi."patientId" = p.id
     AND pi."identifierType" = 'CLINIC_MRN'
  `);
  const counts = result.rows[0];
  const hasExpectedIdentifiers =
    Array.isArray(counts?.demoIdentifiers)
    && counts.demoIdentifiers.length === EXPECTED_DEMO_IDENTIFIERS.length
    && counts.demoIdentifiers.every(
      (identifier, index) => identifier === EXPECTED_DEMO_IDENTIFIERS[index],
    );
  if (
    counts?.patientCount !== EXPECTED_DEMO_IDENTIFIERS.length
    || counts.demoIdentifierCount !== EXPECTED_DEMO_IDENTIFIERS.length
    || counts.otherIdentifierCount !== 0
    || !hasExpectedIdentifiers
  ) {
    throw new Error("Clinician demo startup refused: the isolated schema is not the verified 20-patient DEMO-001 through DEMO-020 dataset.");
  }
} finally {
  await client.end();
}

console.log(`Clinician demo verified: ${DEMO_SCHEMA}, 20 DEMO patients, localhost:${DEMO_PORT}.`);

const nextBinary = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const child = spawn(process.execPath, [nextBinary, "dev", "--hostname", "127.0.0.1", "-p", DEMO_PORT], {
  env: {
    ...process.env,
    ALSALHI_CLINICIAN_DEMO: "true",
  },
  stdio: "inherit",
});

let forwardedSignal;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    forwardedSignal = signal;
    if (!child.killed) child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (code !== null) {
    process.exit(code);
  }
  const terminatingSignal = signal ?? forwardedSignal;
  process.exit(terminatingSignal === "SIGINT" ? 130 : 143);
});
