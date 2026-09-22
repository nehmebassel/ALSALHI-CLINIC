import { isValidApproxDateValue } from "@/lib/p01/clinical-date";
import { requiredFollowUpSafetyQuestionCodes } from "@/lib/follow-up/lifecycle";
import { allowedFollowUpSexSpecificQuestionCodes } from "@/lib/follow-up/sex-specific";
import { getP01Contract } from "@/lib/p01/contracts";
import type { JsonValue } from "@/lib/patient-access/service";
import type {
  FollowUpChangeState,
  FollowUpDeltaState,
  FollowUpItemChangeSelection,
  FollowUpExistingItemChange,
  FollowUpNamedHistoryItem,
  FollowUpNewHairTreatment,
  FollowUpNewProcedure,
  FollowUpTriggerEvent,
  P01FollowUpContext,
} from "@/lib/follow-up/types";

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function cleanDate(value: unknown): JsonValue | undefined {
  return isValidApproxDateValue(value as JsonValue) ? value as JsonValue : undefined;
}

function cleanId(value: unknown): string | undefined {
  return cleanText(value, 160);
}

function sanitizeNamedItems(value: unknown): FollowUpNamedHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    if (!isRecord(raw)) return [];
    const id = cleanId(raw.id) ?? `item-${index}`;
    const name = typeof raw.name === "string" ? raw.name.slice(0, 240) : "";
    const date = cleanDate(raw.date);
    const details = typeof raw.details === "string" ? raw.details.slice(0, 500) : undefined;
    return [{ id, name, ...(date ? { date } : {}), ...(details ? { details } : {}) }];
  });
}

function sanitizeExistingChanges(value: unknown): FollowUpExistingItemChange[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const sourceResponseId = cleanId(raw.sourceResponseId);
    const sourceQuestionCode = cleanId(raw.sourceQuestionCode);
    const sourceScopeKey = cleanId(raw.sourceScopeKey);
    const itemLabel = cleanText(raw.itemLabel, 240);
    const action = raw.action === "STOPPED" || raw.action === "USAGE_CHANGED" ? raw.action : undefined;
    const sourceItemIndex = typeof raw.sourceItemIndex === "number" && Number.isInteger(raw.sourceItemIndex) && raw.sourceItemIndex >= 0
      ? raw.sourceItemIndex
      : undefined;
    if (!sourceResponseId || !sourceQuestionCode || !sourceScopeKey || !itemLabel || !action) return [];
    const identity = `${sourceResponseId}|${sourceScopeKey}|${sourceItemIndex ?? "single"}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    const date = cleanDate(raw.date);
    const details = cleanText(raw.details, 500);
    return [{ sourceResponseId, sourceQuestionCode, sourceScopeKey, ...(sourceItemIndex !== undefined ? { sourceItemIndex } : {}), itemLabel, action, ...(date ? { date } : {}), ...(details ? { details } : {}) }];
  });
}

function sanitizeHairTreatments(value: unknown): FollowUpNewHairTreatment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    if (!isRecord(raw)) return [];
    const name = typeof raw.name === "string" ? raw.name.slice(0, 240) : "";
    const start = cleanDate(raw.start);
    const stillUsing = raw.stillUsing === "YES" || raw.stillUsing === "NO" ? raw.stillUsing : undefined;
    const stop = cleanDate(raw.stop);
    return [{ id: cleanId(raw.id) ?? `treatment-${index}`, name, ...(start ? { start } : {}), ...(stillUsing ? { stillUsing } : {}), ...(stop ? { stop } : {}) }];
  });
}

function sanitizeProcedures(value: unknown): FollowUpNewProcedure[] {
  if (!Array.isArray(value)) return [];
  const seenSources = new Set<string>();
  return value.flatMap((raw, index) => {
    if (!isRecord(raw)) return [];
    const procedure = cleanText(raw.procedure, 160);
    if (!procedure) return [];
    const count = typeof raw.count === "string" ? raw.count.slice(0, 80) : "";
    const lastDate = cleanDate(raw.lastDate);
    const sourceResponseId = cleanId(raw.sourceResponseId);
    const sourceQuestionCode = cleanId(raw.sourceQuestionCode);
    const sourceScopeKey = cleanId(raw.sourceScopeKey);
    const sourceItemIndex = typeof raw.sourceItemIndex === "number" && Number.isInteger(raw.sourceItemIndex) && raw.sourceItemIndex >= 0
      ? raw.sourceItemIndex
      : undefined;
    if (sourceResponseId || sourceQuestionCode || sourceScopeKey) {
      if (!sourceResponseId || sourceQuestionCode !== "Q_HAIR_PROCEDURE_DETAILS" || !sourceScopeKey) return [];
      const sourceIdentity = `${sourceResponseId}|${sourceScopeKey}|${sourceItemIndex ?? "single"}`;
      if (seenSources.has(sourceIdentity)) return [];
      seenSources.add(sourceIdentity);
    }
    return [{
      id: cleanId(raw.id) ?? procedure ?? `procedure-${index}`,
      procedure,
      count,
      ...(lastDate ? { lastDate } : {}),
      ...(sourceResponseId ? {
        sourceResponseId,
        sourceQuestionCode: "Q_HAIR_PROCEDURE_DETAILS",
        sourceScopeKey: sourceScopeKey!,
        ...(sourceItemIndex !== undefined ? { sourceItemIndex } : {}),
      } : {}),
    }];
  });
}

const APPROVED_TRIGGER_EVENT_CODES = new Set(
  [
    ...(getP01Contract("Q_TRIGGER_EVENTS")?.options ?? []),
    ...(getP01Contract("Q_TRIGGER_EVENTS_FEMALE")?.options ?? []),
    ...(getP01Contract("Q_TRIGGER_EVENTS_MALE")?.options ?? []),
  ]
    .map((option) => option.code)
    .filter((code) => code !== "NONE" && code !== "NONE_OF_THE_ABOVE"),
);

function sanitizeTriggerEvents(value: unknown): FollowUpTriggerEvent[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((raw, index) => {
    if (!isRecord(raw)) return [];
    const event = cleanText(raw.event, 160);
    if (!event || !APPROVED_TRIGGER_EVENT_CODES.has(event) || seen.has(event)) return [];
    seen.add(event);
    const date = cleanDate(raw.date);
    const details = cleanText(raw.details, 500);
    return [{ id: cleanId(raw.id) ?? `${event}-${index}`, event, ...(date ? { date } : {}), ...(details ? { details } : {}) }];
  });
}

const SEX_SPECIFIC_RESPONSE_CODES = allowedFollowUpSexSpecificQuestionCodes();

function sanitizeSexSpecificResponses(value: unknown): Record<string, JsonValue> {
  if (!isRecord(value)) return {};
  const out: Record<string, JsonValue> = {};
  for (const [code, raw] of Object.entries(value)) {
    if (!SEX_SPECIFIC_RESPONSE_CODES.has(code)) continue;
    if (typeof raw === "string") {
      out[code] = raw.slice(0, 500);
      continue;
    }
    if (Array.isArray(raw)) {
      out[code] = raw.filter((item): item is string => typeof item === "string").slice(0, 50);
      continue;
    }
    const date = cleanDate(raw);
    if (date !== undefined) out[code] = date;
  }
  return out;
}

const SAFETY_RESPONSE_CODES = new Set([
  "Q_PREGNANCY_BREASTFEEDING_STATUS",
  "Q_PREGNANCY_MONTH",
  "Q_BREASTFEEDING_ONSET",
  "Q_PREGNANCY_PLANNING",
]);

function sanitizeSafetyResponses(value: unknown): Record<string, JsonValue> {
  if (!isRecord(value)) return {};
  const out: Record<string, JsonValue> = {};
  for (const [code, raw] of Object.entries(value)) {
    if (!SAFETY_RESPONSE_CODES.has(code)) continue;
    if (typeof raw === "string") {
      out[code] = raw.slice(0, 160);
      continue;
    }
    const date = cleanDate(raw);
    if (date !== undefined) out[code] = date;
  }
  return out;
}

export function sanitizeFollowUpDelta(value: unknown): FollowUpDeltaState {
  if (!isRecord(value)) return {};
  const generalHealth = isRecord(value.generalHealth) ? {
    chronicConditions: sanitizeNamedItems(value.generalHealth.chronicConditions),
    tumors: sanitizeNamedItems(value.generalHealth.tumors),
    allergies: sanitizeNamedItems(value.generalHealth.allergies),
    surgeriesHospitalizations: sanitizeNamedItems(value.generalHealth.surgeriesHospitalizations),
  } : undefined;

  const medicationsSupplements = isRecord(value.medicationsSupplements) ? {
    startedMedications: sanitizeNamedItems(value.medicationsSupplements.startedMedications),
    startedSupplements: sanitizeNamedItems(value.medicationsSupplements.startedSupplements),
    affectedExisting: sanitizeExistingChanges(value.medicationsSupplements.affectedExisting),
  } : undefined;

  const hairTreatments = isRecord(value.hairTreatments) ? {
    started: sanitizeHairTreatments(value.hairTreatments.started),
    affectedExisting: sanitizeExistingChanges(value.hairTreatments.affectedExisting),
  } : undefined;

  const hairProcedures = isRecord(value.hairProcedures) ? {
    items: sanitizeProcedures(value.hairProcedures.items),
  } : undefined;

  const triggerEvents = isRecord(value.triggerEvents) ? {
    items: sanitizeTriggerEvents(value.triggerEvents.items),
  } : undefined;

  const sexSpecific = isRecord(value.sexSpecific) ? {
    affectedCodes: Array.isArray(value.sexSpecific.affectedCodes)
      ? [...new Set(value.sexSpecific.affectedCodes.filter((item): item is string => typeof item === "string" && item.trim().length > 0))]
      : [],
    responses: sanitizeSexSpecificResponses(value.sexSpecific.responses),
  } : undefined;

  const hairQualityLifestyle = isRecord(value.hairQualityLifestyle) ? {
    changeText: cleanText(value.hairQualityLifestyle.changeText, 500),
    changeDate: cleanDate(value.hairQualityLifestyle.changeDate),
  } : undefined;

  const safety = isRecord(value.safety) ? {
    responses: sanitizeSafetyResponses(value.safety.responses),
  } : undefined;

  const currentMetricsRecord = isRecord(value.currentMetrics) ? value.currentMetrics : undefined;
  const currentMetrics = currentMetricsRecord
    ? Object.fromEntries(
        ["SHEDDING", "DENSITY", "ITCH", "BURNING", "SCALP_PAIN"].flatMap((code) => {
          const raw = currentMetricsRecord[code];
          const number = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
          return Number.isInteger(number) && number >= 0 && number <= 5 ? [[code, number]] : [];
        }),
      ) as FollowUpDeltaState["currentMetrics"]
    : undefined;

  return {
    ...(generalHealth ? { generalHealth } : {}),
    ...(medicationsSupplements ? { medicationsSupplements } : {}),
    ...(hairTreatments ? { hairTreatments } : {}),
    ...(hairProcedures ? { hairProcedures } : {}),
    ...(triggerEvents ? { triggerEvents } : {}),
    ...(sexSpecific ? { sexSpecific } : {}),
    ...(hairQualityLifestyle ? { hairQualityLifestyle } : {}),
    ...(safety ? { safety } : {}),
    ...(currentMetrics ? { currentMetrics } : {}),
  };
}

function selectionActions(value: FollowUpItemChangeSelection | undefined): Array<"STARTED" | "STOPPED" | "USAGE_CHANGED"> {
  return Array.isArray(value) ? value : [];
}

function validateItemChangeSelection(
  selection: FollowUpItemChangeSelection | undefined,
  state: { affectedExisting: FollowUpExistingItemChange[] } | undefined,
  issueKey: string,
  issues: string[],
  helpers: { startedValid: () => boolean },
): void {
  const actions = selectionActions(selection);
  if (actions.includes("STARTED") && !helpers.startedValid()) issues.push(issueKey);
  if (actions.includes("STOPPED")) {
    const stopped = (state?.affectedExisting ?? []).filter((item) => item.action === "STOPPED");
    if (stopped.length === 0 || stopped.some((item) => !item.date)) issues.push(issueKey);
  }
  if (actions.includes("USAGE_CHANGED")) {
    const changed = (state?.affectedExisting ?? []).filter((item) => item.action === "USAGE_CHANGED");
    if (changed.length === 0 || changed.some((item) => !item.details)) issues.push(issueKey);
  }
}

export function followUpDeltaCompletionIssues(
  changes: FollowUpChangeState | undefined,
  delta: FollowUpDeltaState | undefined,
  primaryReasonCode: string | null,
): string[] {
  const issues: string[] = [];
  const current = delta ?? {};

  if (changes?.generalHealth === "CHANGED") {
    const health = current.generalHealth;
    const items = [...(health?.chronicConditions ?? []), ...(health?.tumors ?? []), ...(health?.allergies ?? []), ...(health?.surgeriesHospitalizations ?? [])];
    if (items.length === 0 || items.some((item) => !item.name.trim())) issues.push("generalHealth");
  }

  validateItemChangeSelection(changes?.medicationsSupplements, current.medicationsSupplements, "medicationsSupplements", issues, {
    startedValid: () => {
      const started = [...(current.medicationsSupplements?.startedMedications ?? []), ...(current.medicationsSupplements?.startedSupplements ?? [])];
      return started.length > 0 && started.every((item) => item.name.trim().length > 0);
    },
  });

  validateItemChangeSelection(changes?.hairTreatments, current.hairTreatments, "hairTreatments", issues, {
    startedValid: () => {
      const started = current.hairTreatments?.started ?? [];
      return started.length > 0 && started.every((item) =>
        item.name.trim().length > 0 &&
        Boolean(item.start) &&
        Boolean(item.stillUsing) &&
        (item.stillUsing !== "NO" || Boolean(item.stop))
      );
    },
  });

  if (changes?.hairProcedures === "YES") {
    const items = current.hairProcedures?.items ?? [];
    if (items.length === 0 || items.some((item) => {
      const count = Number(item.count.trim());
      return !Number.isInteger(count) || count <= 0 || !item.lastDate;
    })) issues.push("hairProcedures");
  }
  if (changes?.triggerEvents === "YES") {
    const items = current.triggerEvents?.items ?? [];
    if (items.length === 0 || items.some((item) => !item.date || (item.event === "OTHER" && !item.details?.trim()))) issues.push("triggerEvents");
  }
  if (changes?.sexSpecific === "CHANGED" && (current.sexSpecific?.affectedCodes.length ?? 0) === 0) issues.push("sexSpecific");
  if (changes?.hairQualityLifestyle === "CHANGED" && (!current.hairQualityLifestyle?.changeText || !current.hairQualityLifestyle?.changeDate)) issues.push("hairQualityLifestyle");

  if (primaryReasonCode === "RV_HAIR_LOSS" || primaryReasonCode === "RV_SCALP_SYMPTOMS") {
    const metrics = current.currentMetrics ?? {};
    for (const code of ["SHEDDING", "DENSITY", "ITCH", "BURNING", "SCALP_PAIN"] as const) {
      if (typeof metrics[code] !== "number") issues.push(`metric:${code}`);
    }
  }

  return [...new Set(issues)];
}

function validContractOption(questionCode: string, value: unknown): boolean {
  if (typeof value !== "string") return false;
  const options = getP01Contract(questionCode)?.options ?? [];
  return options.some((option) => option.code === value);
}

export function followUpSafetyCompletionIssues(
  context: P01FollowUpContext | null | undefined,
  delta: FollowUpDeltaState | undefined,
): string[] {
  if (!context) return [];
  const required = requiredFollowUpSafetyQuestionCodes(context.identity.sex, selectedEpisodeStateForSafety(context));
  if (required.length === 0) return [];

  const responses = delta?.safety?.responses ?? {};
  const issues: string[] = [];
  const statusRequired = required.includes("Q_PREGNANCY_BREASTFEEDING_STATUS");
  const status = responses.Q_PREGNANCY_BREASTFEEDING_STATUS;

  if (statusRequired && !validContractOption("Q_PREGNANCY_BREASTFEEDING_STATUS", status)) {
    issues.push("safety:Q_PREGNANCY_BREASTFEEDING_STATUS");
  }

  if (status === "PREGNANT" || status === "BOTH") {
    if (!validContractOption("Q_PREGNANCY_MONTH", responses.Q_PREGNANCY_MONTH)) {
      issues.push("safety:Q_PREGNANCY_MONTH");
    }
  }

  if (status === "BREASTFEEDING" || status === "BOTH") {
    if (!isValidApproxDateValue(responses.Q_BREASTFEEDING_ONSET)) {
      issues.push("safety:Q_BREASTFEEDING_ONSET");
    }
  }

  if (required.includes("Q_PREGNANCY_PLANNING") && !validContractOption("Q_PREGNANCY_PLANNING", responses.Q_PREGNANCY_PLANNING)) {
    issues.push("safety:Q_PREGNANCY_PLANNING");
  }

  return [...new Set(issues)];
}

function selectedEpisodeStateForSafety(context: P01FollowUpContext) {
  if (!context.selectedEpisodeId) return undefined;
  return context.episodeState.find((episode) => episode.episodeId === context.selectedEpisodeId);
}

