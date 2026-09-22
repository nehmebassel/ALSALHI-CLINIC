import { futureClinicalApproxDatePaths, isRecord } from "@/lib/p01/clinical-date";
import type { PatientInputJson } from "@/lib/patient-access/service";

export type HistoricalClinicalDateIssue = {
  path: string;
  kind: "FUTURE_APPROXIMATE_DATE" | "INVALID_OR_FUTURE_EXACT_DATE";
};

function exactDateIsOnOrBefore(value: unknown, referenceDate: Date): boolean {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return false;
  const boundary = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate());
  return parsed.getTime() <= boundary;
}

/**
 * Applies the governed historical-date boundary before clinical autosave. The
 * returned paths are for tests/server diagnostics only and must not be exposed
 * in patient-facing error responses.
 */
export function historicalClinicalDateIssues(
  input: PatientInputJson,
  referenceDate: Date,
): HistoricalClinicalDateIssue[] {
  const issues: HistoricalClinicalDateIssue[] = futureClinicalApproxDatePaths(input, referenceDate).map((path) => ({
    path,
    kind: "FUTURE_APPROXIMATE_DATE" as const,
  }));
  const answers = isRecord(input.answers) ? input.answers : undefined;
  const dob = answers?.Q_PROFILE_DOB;
  if (dob !== undefined && !exactDateIsOnOrBefore(dob, referenceDate)) {
    issues.push({ path: "$.answers.Q_PROFILE_DOB", kind: "INVALID_OR_FUTURE_EXACT_DATE" });
  }
  return issues;
}
