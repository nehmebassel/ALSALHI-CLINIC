const CLINICIAN_DEMO_MODE_VARIABLE = "ALSALHI_CLINICIAN_DEMO";

export const CLINICIAN_DEMO_SCHEMA = "alsalhi_clinician_demo_20260907";
export const CLINICIAN_DEMO_DATABASE = "alsalhi_clinical_platform";

const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function clinicianDemoPrismaSchema(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const mode = environment[CLINICIAN_DEMO_MODE_VARIABLE]?.trim();
  if (!mode) return undefined;

  if (mode !== "true") {
    throw new Error(`${CLINICIAN_DEMO_MODE_VARIABLE} must be exactly \"true\" when present.`);
  }
  if (environment.NODE_ENV === "production") {
    throw new Error("Clinician demo mode is local-development-only and cannot run in production.");
  }

  const connectionString = environment.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for clinician demo mode.");
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL for clinician demo mode.");
  }

  if (!LOCAL_DATABASE_HOSTS.has(url.hostname)) {
    throw new Error("Clinician demo mode refuses non-local PostgreSQL hosts.");
  }
  if (url.pathname.replace(/^\//, "") !== CLINICIAN_DEMO_DATABASE) {
    throw new Error(`Clinician demo mode requires the local ${CLINICIAN_DEMO_DATABASE} database.`);
  }

  const urlSchema = url.searchParams.get("schema");
  if (urlSchema && urlSchema !== "public" && urlSchema !== CLINICIAN_DEMO_SCHEMA) {
    throw new Error("Clinician demo mode refuses an unexpected DATABASE_URL schema target.");
  }

  return CLINICIAN_DEMO_SCHEMA;
}

export function activeDatabaseSchema(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return clinicianDemoPrismaSchema(environment) ?? "public";
}
