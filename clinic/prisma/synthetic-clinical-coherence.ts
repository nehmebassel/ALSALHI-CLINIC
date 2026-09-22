import { P01_QUESTION_CONTRACTS } from "../lib/p01/contracts";
import { evaluateP01Draft } from "../lib/p01/engine";
import type { FollowUpChangeState } from "../lib/follow-up/types";
import type { JsonValue, PatientInputJson } from "../lib/patient-access/service";
import {
  buildSyntheticDraft,
  syntheticFollowUpMetrics,
  syntheticInitialMetrics,
  syntheticInitialVisitAt,
  type SyntheticCase,
} from "./synthetic-scenarios";

export const SYNTHETIC_COHERENCE_AUDIT_AS_OF = new Date("2026-08-20T23:59:59.999+03:00");

export type SyntheticCoherenceClassification = "Coherent" | "Needs Correction" | "Major Contradiction";
export type SyntheticFollowUpTrend = "IMPROVING" | "STABLE" | "NEEDS_REVIEW";

export interface SyntheticCoherenceIssue {
  code: string;
  message: string;
  severity: "CORRECTION" | "MAJOR";
}

export interface SyntheticCoherenceAuditResult {
  caseIndex: number;
  classification: SyntheticCoherenceClassification;
  issues: SyntheticCoherenceIssue[];
}

function caseText(caseDef: SyntheticCase, ar: string, en: string): string {
  return caseDef.locale === "ar" ? ar : en;
}

export function syntheticFollowUpVisitAt(caseDef: Pick<SyntheticCase, "index">, followUp: number, hour = 10): Date {
  if (!Number.isInteger(followUp) || followUp < 1) throw new Error(`Invalid synthetic follow-up index: ${followUp}`);
  const date = syntheticInitialVisitAt(caseDef, hour);
  date.setUTCDate(date.getUTCDate() + followUp * 35);
  return date;
}

export function syntheticFollowUpChangesFor(caseDef: SyntheticCase): FollowUpChangeState {
  const changes: FollowUpChangeState = {
    generalHealth: "NO_CHANGE",
    medicationsSupplements: "NO_CHANGE",
  };
  if (caseDef.primary === "RV_HAIR_LOSS") {
    changes.hairTreatments = "NO_CHANGE";
    changes.hairProcedures = "NO";
    changes.triggerEvents = "NO";
    changes.sexSpecific = "NO_CHANGE";
  } else if (caseDef.primary === "RV_SCALP_SYMPTOMS") {
    changes.hairTreatments = "NO_CHANGE";
    changes.hairProcedures = "NO";
    changes.triggerEvents = "NO";
  } else if (caseDef.primary === "RV_HAIR_QUALITY") {
    changes.hairTreatments = "NO_CHANGE";
    changes.hairQualityLifestyle = "NO_CHANGE";
  }
  return changes;
}

export function syntheticFollowUpDeltaFor(caseDef: SyntheticCase, followUp: number): JsonValue {
  switch (caseDef.primary) {
    case "RV_HAIR_LOSS":
    case "RV_SCALP_SYMPTOMS": {
      const currentMetrics = syntheticFollowUpMetrics(caseDef, followUp);
      if (!currentMetrics) throw new Error(`Missing synthetic follow-up metrics for case ${caseDef.index}`);
      return {
        currentMetrics,
        treatmentStatus: "NO_CHANGE",
        procedureStatus: "NO_NEW_PROCEDURE",
        triggerStatus: "NO_NEW_TRIGGER",
      } as JsonValue;
    }
    case "RV_HAIR_QUALITY":
      return {
        hairQuality: {
          routineChanged: false,
          heatUseChanged: false,
          breakageTrend: followUp === 1 ? "STABLE" : "IMPROVING",
        },
      } as JsonValue;
    case "RV_DERMATOLOGY":
      return {
        dermatology: {
          concernChanged: followUp === 1,
          changeSummary: followUp === 1
            ? caseText(caseDef, "أصبحت الأعراض أقل تكرارًا بعد العلاج.", "Symptoms became less frequent after treatment.")
            : caseText(caseDef, "لا يوجد تغير مهم منذ الزيارة السابقة.", "No important change since the prior visit."),
        },
      } as JsonValue;
    case "RV_LASER": {
      const followUpByCase: Partial<Record<number, { newSession: boolean; response: string; complication: string }>> = {
        26: { newSession: true, response: "PARTIAL", complication: "NONE" },
        27: { newSession: false, response: "DEFERRED_SAFETY_REVIEW", complication: "NONE" },
        29: { newSession: true, response: "GOOD", complication: "NONE" },
        30: { newSession: true, response: followUp >= 2 ? "GOOD" : "PARTIAL", complication: "NONE" },
      };
      return { laser: followUpByCase[caseDef.index] ?? { newSession: false, response: "UNCHANGED", complication: "NONE" } } as JsonValue;
    }
    case "RV_AESTHETIC_PROCEDURES": {
      const followUpByCase: Partial<Record<number, { newProcedureOrReview: boolean; result: string; complication: string }>> = {
        32: { newProcedureOrReview: true, result: "SATISFIED", complication: "NONE" },
        33: { newProcedureOrReview: true, result: followUp >= 2 ? "SATISFIED" : "PARTIAL", complication: "NONE" },
        35: { newProcedureOrReview: true, result: "SATISFIED", complication: "NONE" },
        36: { newProcedureOrReview: true, result: "NEEDS_REVIEW", complication: "NONE" },
      };
      return { aesthetic: followUpByCase[caseDef.index] ?? { newProcedureOrReview: true, result: "PARTIAL", complication: "NONE" } } as JsonValue;
    }
  }
}

export function syntheticFollowUpTrendFor(caseDef: SyntheticCase, followUp: number): SyntheticFollowUpTrend {
  if (caseDef.primary === "RV_HAIR_LOSS" || caseDef.primary === "RV_SCALP_SYMPTOMS") return [6, 12].includes(caseDef.index) ? "STABLE" : "IMPROVING";
  if (caseDef.primary === "RV_HAIR_QUALITY") return followUp >= 2 ? "IMPROVING" : "STABLE";
  if (caseDef.primary === "RV_DERMATOLOGY") return followUp === 1 ? "IMPROVING" : "STABLE";
  if (caseDef.primary === "RV_LASER") return caseDef.index === 27 ? "NEEDS_REVIEW" : "IMPROVING";
  if (caseDef.primary === "RV_AESTHETIC_PROCEDURES") return caseDef.index === 36 ? "NEEDS_REVIEW" : "IMPROVING";
  return "STABLE";
}

function approximateDateToDate(value: unknown): Date | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const normalized = record.normalizedGregorian;
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return null;
  const year = Number((normalized as Record<string, unknown>).year);
  const month = Number((normalized as Record<string, unknown>).month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

function walkApproxDates(value: unknown, path: string, out: Array<{ path: string; date: Date }>): void {
  const parsed = approximateDateToDate(value);
  if (parsed) {
    out.push({ path, date: parsed });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkApproxDates(item, `${path}[${index}]`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) walkApproxDates(item, path ? `${path}.${key}` : key, out);
  }
}

function containsArabic(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function containsLatinWord(value: string): boolean {
  return /[A-Za-z]{3,}/.test(value);
}

function isCodeLike(value: string): boolean {
  return /^[A-Z0-9_]+$/.test(value);
}

const textKeys = new Set([
  "details", "name", "typeText", "changeDescription", "goal", "desiredResult", "areaText", "otherText", "areaOther", "complicationText",
]);

function walkLocalizedText(value: unknown, path: string, out: Array<{ path: string; value: string }>): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkLocalizedText(item, `${path}[${index}]`, out));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const next = path ? `${path}.${key}` : key;
    if (typeof item === "string" && textKeys.has(key) && !isCodeLike(item)) out.push({ path: next, value: item });
    else walkLocalizedText(item, next, out);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(asRecord(item))) : [];
}

function monthIndex(value: unknown): number | null {
  const date = approximateDateToDate(value);
  return date ? date.getUTCFullYear() * 12 + date.getUTCMonth() : null;
}

function pushIssue(issues: SyntheticCoherenceIssue[], code: string, message: string, severity: "CORRECTION" | "MAJOR" = "CORRECTION"): void {
  issues.push({ code, message, severity });
}

export function auditSyntheticCase(caseDef: SyntheticCase): SyntheticCoherenceAuditResult {
  const issues: SyntheticCoherenceIssue[] = [];
  const draft = buildSyntheticDraft(caseDef);
  const evaluation = evaluateP01Draft(draft as unknown as PatientInputJson);
  const visitAt = syntheticInitialVisitAt(caseDef);

  if (evaluation.state !== "READY") pushIssue(issues, "NOT_READY", `Executable state is ${evaluation.state}.`, "MAJOR");
  if (visitAt > SYNTHETIC_COHERENCE_AUDIT_AS_OF) pushIssue(issues, "FUTURE_INITIAL_VISIT", `Initial visit ${visitAt.toISOString()} is after the audit date.`, "MAJOR");
  const privacyAt = draft.privacy?.acceptedAt ? new Date(draft.privacy.acceptedAt) : null;
  if (!privacyAt || Number.isNaN(privacyAt.getTime()) || !(privacyAt < visitAt) || visitAt.getTime() - privacyAt.getTime() > 45 * 60_000) {
    pushIssue(issues, "PRIVACY_TIMELINE", "Privacy acceptance must occur within the active intake session before submission.", "MAJOR");
  }

  if (draft.answers.Q_PROFILE_SEX !== caseDef.gender) pushIssue(issues, "SEX_IDENTITY", "Profile sex differs from the case identity.", "MAJOR");
  if (draft.answers.Q_VISIT_PRIMARY_REASON !== caseDef.primary) pushIssue(issues, "PRIMARY_PATHWAY", "Primary pathway differs from the case definition.", "MAJOR");
  if (draft.locale !== caseDef.locale || draft.privacy?.language !== caseDef.locale) pushIssue(issues, "LOCALE", "Draft/privacy locale differs from the case locale.", "MAJOR");

  const sections = new Set(evaluation.questions.map((question) => question.sectionCode));
  if (caseDef.gender === "MALE" && (sections.has("WOMENS_HEALTH") || sections.has("PREGNANCY_CONTEXT"))) pushIssue(issues, "SEX_MODULE_CROSSOVER", "Male case activates women/pregnancy modules.", "MAJOR");
  if (caseDef.gender === "FEMALE" && sections.has("MENS_HEALTH")) pushIssue(issues, "SEX_MODULE_CROSSOVER", "Female case activates men’s health.", "MAJOR");

  const approxDates: Array<{ path: string; date: Date }> = [];
  walkApproxDates(draft.answers, "answers", approxDates);
  const visitMonth = Date.UTC(visitAt.getUTCFullYear(), visitAt.getUTCMonth(), 1);
  for (const item of approxDates) {
    if (item.date.getTime() > visitMonth) pushIssue(issues, "FUTURE_HISTORY", `${item.path} is later than the initial visit month.`, "MAJOR");
  }

  const localized: Array<{ path: string; value: string }> = [];
  walkLocalizedText(draft.answers, "answers", localized);
  const freeTextCodes = new Set(P01_QUESTION_CONTRACTS.filter((contract) => ["TEXT", "LONG_TEXT"].includes(contract.responseType)).map((contract) => contract.code));
  for (const [code, value] of Object.entries(draft.answers)) {
    if (code !== "Q_PROFILE_FULL_NAME" && freeTextCodes.has(code) && typeof value === "string" && !/^\d+$/.test(value) && !isCodeLike(value)) localized.push({ path: `answers.${code}`, value });
  }
  for (const item of localized) {
    if (caseDef.locale === "ar" && containsLatinWord(item.value)) pushIssue(issues, "AR_TEXT_MIX", `${item.path} contains English free text in an Arabic intake.`);
    if (caseDef.locale === "en" && containsArabic(item.value)) pushIssue(issues, "EN_TEXT_MIX", `${item.path} contains Arabic free text in an English intake.`);
  }

  const answerJson = JSON.stringify(draft.answers).toLowerCase();
  for (const forbidden of ["clinical goal", "previous treatment", "generated answer", "scenario testing", "for scenario", "fixture", "هدف سريري", "معالجة سابقة", "للاختبار"]) {
    if (answerJson.includes(forbidden.toLowerCase())) pushIssue(issues, "COVERAGE_PLACEHOLDER", `Synthetic placeholder text found: ${forbidden}.`, "MAJOR");
  }

  const initialMetrics = syntheticInitialMetrics(caseDef);
  if (["RV_HAIR_LOSS", "RV_SCALP_SYMPTOMS"].includes(caseDef.primary)) {
    if (!initialMetrics) pushIssue(issues, "MISSING_INITIAL_METRICS", "Hair/scalp case has no physician baseline metrics.", "MAJOR");
  } else if (initialMetrics) pushIssue(issues, "UNEXPECTED_INITIAL_METRICS", "Non-hair/scalp case has hair metrics.");
  if (initialMetrics) for (const [metric, value] of Object.entries(initialMetrics)) if (!Number.isInteger(value) || value < 0 || value > 5) pushIssue(issues, "METRIC_RANGE", `${metric}=${value} is outside 0–5.`, "MAJOR");

  const symptomDetails = asRecord(draft.answers.Q_SCALP_SYMPTOM_DETAILS);
  if (symptomDetails) {
    for (const code of ["ITCH", "BURNING", "SCALP_PAIN"]) {
      const row = asRecord(symptomDetails[code]);
      if (row && Number(row.severity) <= 0) pushIssue(issues, "ZERO_SELECTED_SYMPTOM", `${code} is selected but severity is not clinically positive.`, "MAJOR");
    }
  }

  for (const row of asRecords(draft.answers.Q_HAIR_TREATMENT_ITEMS)) {
    const start = monthIndex(row.start);
    const stop = monthIndex(row.stop);
    if (start !== null && stop !== null && stop < start) pushIssue(issues, "TREATMENT_ORDER", "Treatment stop date precedes start date.", "MAJOR");
  }

  const sheddingOnset = monthIndex(draft.answers.Q_HAIR_SHEDDING_ONSET);
  const thinningOnset = monthIndex(draft.answers.Q_HAIR_THINNING_ONSET);
  const triggerTargetOnset = sheddingOnset ?? thinningOnset;
  if (triggerTargetOnset !== null) {
    for (const row of asRecords(draft.answers.Q_TRIGGER_EVENT_DETAILS)) {
      const event = monthIndex(row.date);
      if (event !== null && event > triggerTargetOnset) pushIssue(issues, "TRIGGER_AFTER_ONSET", "General trigger event is dated after the hair change it is intended to contextualize.");
    }
  }

  for (let followUp = 1; followUp <= caseDef.followUps; followUp += 1) {
    const followUpAt = syntheticFollowUpVisitAt(caseDef, followUp);
    const previousAt = followUp === 1 ? visitAt : syntheticFollowUpVisitAt(caseDef, followUp - 1);
    if (!(followUpAt > previousAt)) pushIssue(issues, "FOLLOWUP_ORDER", `Follow-up ${followUp} is not after its source visit.`, "MAJOR");
    if (followUpAt > SYNTHETIC_COHERENCE_AUDIT_AS_OF) pushIssue(issues, "FUTURE_FOLLOWUP", `Follow-up ${followUp} is after the audit date.`, "MAJOR");
    const delta = syntheticFollowUpDeltaFor(caseDef, followUp);
    const deltaRecord = asRecord(delta);
    if (!deltaRecord) pushIssue(issues, "FOLLOWUP_DELTA", `Follow-up ${followUp} delta is not an object.`, "MAJOR");
    if (caseDef.primary === "RV_HAIR_LOSS" || caseDef.primary === "RV_SCALP_SYMPTOMS") {
      const currentMetrics = asRecord(deltaRecord?.currentMetrics);
      if (!currentMetrics) pushIssue(issues, "FOLLOWUP_METRICS", `Follow-up ${followUp} lacks current 0–5 metrics.`, "MAJOR");
      else for (const [metric, value] of Object.entries(currentMetrics)) if (typeof value !== "number" || value < 0 || value > 5) pushIssue(issues, "FOLLOWUP_METRIC_RANGE", `${metric}=${String(value)} is outside 0–5.`, "MAJOR");
      if (deltaRecord?.treatmentStatus !== "NO_CHANGE" || deltaRecord?.procedureStatus !== "NO_NEW_PROCEDURE" || deltaRecord?.triggerStatus !== "NO_NEW_TRIGGER") {
        pushIssue(issues, "FOLLOWUP_FLAG_DELTA_MISMATCH", `Follow-up ${followUp} contradicts no-change confirmations.`, "MAJOR");
      }
    }
  }

  // Explicit clinical anchors: these are patient-level review expectations, not registry rules.
  if (caseDef.index === 3 && draft.answers.Q_PREGNANCY_BREASTFEEDING_STATUS !== "BREASTFEEDING") pushIssue(issues, "CASE_03_POSTPARTUM", "Postpartum case must remain breastfeeding at intake.", "MAJOR");
  if ([21, 25].includes(caseDef.index) && draft.answers.Q_PREGNANCY_BREASTFEEDING_STATUS !== "PREGNANT") pushIssue(issues, "PREGNANCY_CONTEXT", "Pregnancy-designated case lost current pregnancy context.", "MAJOR");
  if ([23, 27].includes(caseDef.index) && draft.answers.Q_PREGNANCY_BREASTFEEDING_STATUS !== "BREASTFEEDING") pushIssue(issues, "BREASTFEEDING_CONTEXT", "Breastfeeding-designated case lost breastfeeding context.", "MAJOR");
  if (caseDef.index === 14) {
    const exposure = asRecords(draft.answers.Q_HQ_DRUG_EXPOSURE_DETAILS).find((row) => row.exposure === "ISOTRETINOIN");
    if (!exposure || exposure.status !== "CURRENT") pushIssue(issues, "CASE_14_ISOTRETINOIN", "Isotretinoin exposure must match the current medication list.", "MAJOR");
  }
  if (caseDef.index === 27 && caseDef.followUps > 0) {
    const laser = asRecord(asRecord(syntheticFollowUpDeltaFor(caseDef, 1))?.laser);
    if (laser?.newSession !== false || laser?.response !== "DEFERRED_SAFETY_REVIEW") pushIssue(issues, "CASE_27_SAFETY", "Breastfeeding laser case must not fabricate a completed new laser session.", "MAJOR");
  }

  const classification: SyntheticCoherenceClassification = issues.some((issue) => issue.severity === "MAJOR")
    ? "Major Contradiction"
    : issues.length
      ? "Needs Correction"
      : "Coherent";
  return { caseIndex: caseDef.index, classification, issues };
}
