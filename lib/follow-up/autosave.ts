import type { JsonValue, PatientInputJson } from "@/lib/patient-access/service";
import { readFollowUpContext, type FollowUpChangeState, type FollowUpDeltaState, type FollowUpExistingItemChange, type FollowUpIntent, type FollowUpItemChangeAction, type FollowUpItemChangeSelection, type FollowUpNewProcedure, type P01FollowUpContext } from "@/lib/follow-up/types";
import { sanitizeFollowUpDelta } from "@/lib/follow-up/delta";
import { getP01Contract } from "@/lib/p01/contracts";

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function allowed(value: JsonValue | undefined, values: readonly string[]): string | undefined {
  return typeof value === "string" && values.includes(value) ? value : undefined;
}

function itemChangeSelection(value: JsonValue | undefined): FollowUpItemChangeSelection | undefined {
  if (value === "NO_CHANGE") return "NO_CHANGE";
  // Legacy v1-v3 drafts stored one action as a string. Preserve it as a one-item selection.
  if (value === "STARTED" || value === "STOPPED" || value === "USAGE_CHANGED") return [value];
  if (!Array.isArray(value)) return undefined;
  const actions = [...new Set(value.filter((item): item is FollowUpItemChangeAction =>
    item === "STARTED" || item === "STOPPED" || item === "USAGE_CHANGED",
  ))];
  return actions.length > 0 ? actions : undefined;
}

function sanitizeChanges(raw: Record<string, JsonValue>): FollowUpChangeState {
  const generalHealth = allowed(raw.generalHealth, ["NO_CHANGE", "CHANGED"]);
  const medicationsSupplements = itemChangeSelection(raw.medicationsSupplements);
  const hairTreatments = itemChangeSelection(raw.hairTreatments);
  const hairProcedures = allowed(raw.hairProcedures, ["NO", "YES"]);
  const triggerEvents = allowed(raw.triggerEvents, ["NO", "YES", "UNSURE"]);
  const sexSpecific = allowed(raw.sexSpecific, ["NO_CHANGE", "CHANGED"]);
  const hairQualityLifestyle = allowed(raw.hairQualityLifestyle, ["NO_CHANGE", "CHANGED"]);
  return {
    ...(generalHealth ? { generalHealth: generalHealth as FollowUpChangeState["generalHealth"] } : {}),
    ...(medicationsSupplements ? { medicationsSupplements } : {}),
    ...(hairTreatments ? { hairTreatments } : {}),
    ...(hairProcedures ? { hairProcedures: hairProcedures as FollowUpChangeState["hairProcedures"] } : {}),
    ...(triggerEvents ? { triggerEvents: triggerEvents as FollowUpChangeState["triggerEvents"] } : {}),
    ...(sexSpecific ? { sexSpecific: sexSpecific as FollowUpChangeState["sexSpecific"] } : {}),
    ...(hairQualityLifestyle ? { hairQualityLifestyle: hairQualityLifestyle as FollowUpChangeState["hairQualityLifestyle"] } : {}),
  };
}

const VALID_INTENTS = new Set<FollowUpIntent>(["EXISTING_CONCERN", "NEW_CONCERN"]);
const PATIENT_WIDE_SOURCE_CODES = new Set(["Q_HEALTH_MEDICATION_ITEMS", "Q_HEALTH_SUPPLEMENT_ITEMS"]);
const APPROVED_PROCEDURE_CODES = new Set((getP01Contract("Q_HAIR_PROCEDURES")?.options ?? []).map((option) => option.code));
const BASE_TRIGGER_CODES = new Set((getP01Contract("Q_TRIGGER_EVENTS")?.options ?? []).map((option) => option.code).filter((code) => code !== "NONE_OF_THE_ABOVE"));
const FEMALE_TRIGGER_CODES = new Set((getP01Contract("Q_TRIGGER_EVENTS_FEMALE")?.options ?? []).map((option) => option.code).filter((code) => code !== "NONE"));
const MALE_TRIGGER_CODES = new Set((getP01Contract("Q_TRIGGER_EVENTS_MALE")?.options ?? []).map((option) => option.code).filter((code) => code !== "NONE"));

function sourceValue(entryValue: JsonValue, itemIndex: number | undefined): JsonValue | undefined {
  if (itemIndex === undefined) return entryValue;
  return Array.isArray(entryValue) ? entryValue[itemIndex] : undefined;
}

function sourceLabel(value: JsonValue | undefined): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of ["name", "treatment", "procedure", "event"]) {
    const label = value[key];
    if (typeof label === "string" && label.trim()) return label.trim();
  }
  return undefined;
}

function canonicalExistingChanges(
  server: P01FollowUpContext,
  selectedEpisodeId: string | undefined,
  values: FollowUpExistingItemChange[],
  allowedQuestionCodes: Set<string>,
): FollowUpExistingItemChange[] {
  return values.flatMap((item) => {
    if (!allowedQuestionCodes.has(item.sourceQuestionCode)) return [];
    const entry = server.snapshot.entries.find((candidate) =>
      candidate.sourceResponseId === item.sourceResponseId &&
      candidate.questionCode === item.sourceQuestionCode &&
      candidate.responseScopeKey === item.sourceScopeKey,
    );
    if (!entry) return [];
    if (!PATIENT_WIDE_SOURCE_CODES.has(entry.questionCode) && selectedEpisodeId && entry.sourceEpisodeId && entry.sourceEpisodeId !== selectedEpisodeId) return [];
    const raw = sourceValue(entry.value, item.sourceItemIndex);
    const label = sourceLabel(raw);
    if (!label) return [];
    return [{ ...item, itemLabel: label }];
  });
}

function canonicalProcedures(
  server: P01FollowUpContext,
  selectedEpisodeId: string | undefined,
  values: FollowUpNewProcedure[],
): FollowUpNewProcedure[] {
  return values.flatMap((item) => {
    if (!APPROVED_PROCEDURE_CODES.has(item.procedure)) return [];
    if (!item.sourceResponseId) {
      const { sourceQuestionCode: _question, sourceScopeKey: _scope, sourceItemIndex: _index, ...newItem } = item;
      void _question; void _scope; void _index;
      return [newItem];
    }
    const entry = server.snapshot.entries.find((candidate) =>
      candidate.sourceResponseId === item.sourceResponseId &&
      candidate.questionCode === "Q_HAIR_PROCEDURE_DETAILS" &&
      candidate.responseScopeKey === item.sourceScopeKey,
    );
    if (!entry || (selectedEpisodeId && entry.sourceEpisodeId && entry.sourceEpisodeId !== selectedEpisodeId)) return [];
    const raw = sourceValue(entry.value, item.sourceItemIndex);
    if (!isRecord(raw) || raw.procedure !== item.procedure) return [];
    return [{
      ...item,
      sourceQuestionCode: "Q_HAIR_PROCEDURE_DETAILS",
      sourceScopeKey: entry.responseScopeKey,
    }];
  });
}

function canonicalTriggerEvents(server: P01FollowUpContext, delta: FollowUpDeltaState): FollowUpDeltaState["triggerEvents"] | undefined {
  if (!delta.triggerEvents) return undefined;
  const allowed = new Set(BASE_TRIGGER_CODES);
  const sexSpecific = server.identity.sex === "FEMALE" ? FEMALE_TRIGGER_CODES : MALE_TRIGGER_CODES;
  for (const code of sexSpecific) allowed.add(code);
  return { items: delta.triggerEvents.items.filter((item) => allowed.has(item.event)) };
}

function canonicalizeDelta(
  server: P01FollowUpContext,
  selectedEpisodeId: string | undefined,
  delta: FollowUpDeltaState,
): FollowUpDeltaState {
  const triggerEvents = canonicalTriggerEvents(server, delta);
  return {
    ...delta,
    ...(delta.medicationsSupplements ? {
      medicationsSupplements: {
        ...delta.medicationsSupplements,
        affectedExisting: canonicalExistingChanges(
          server,
          selectedEpisodeId,
          delta.medicationsSupplements.affectedExisting,
          new Set(["Q_HEALTH_MEDICATION_ITEMS", "Q_HEALTH_SUPPLEMENT_ITEMS"]),
        ),
      },
    } : {}),
    ...(delta.hairTreatments ? {
      hairTreatments: {
        ...delta.hairTreatments,
        affectedExisting: canonicalExistingChanges(
          server,
          selectedEpisodeId,
          delta.hairTreatments.affectedExisting,
          new Set(["Q_HAIR_TREATMENT_ITEMS"]),
        ),
      },
    } : {}),
    ...(delta.hairProcedures ? {
      hairProcedures: {
        items: canonicalProcedures(server, selectedEpisodeId, delta.hairProcedures.items),
      },
    } : {}),
    ...(triggerEvents ? { triggerEvents } : {}),
  };
}

export function mergeServerOwnedFollowUpContext(
  existing: PatientInputJson,
  incoming: PatientInputJson,
): PatientInputJson {
  const server = readFollowUpContext(existing);
  if (!server) return incoming;

  const clientRaw = isRecord(incoming.followUp) ? incoming.followUp : {};
  const intent = typeof clientRaw.intent === "string" && VALID_INTENTS.has(clientRaw.intent as FollowUpIntent)
    ? clientRaw.intent as FollowUpIntent
    : undefined;
  const requestedEpisodeId = typeof clientRaw.selectedEpisodeId === "string" ? clientRaw.selectedEpisodeId : undefined;
  const selectedEpisode = intent === "EXISTING_CONCERN"
    ? server.episodes.find((episode) => episode.id === requestedEpisodeId)
    : undefined;
  const changes = isRecord(clientRaw.changes) ? sanitizeChanges(clientRaw.changes) : undefined;
  const delta = canonicalizeDelta(server, selectedEpisode?.id, sanitizeFollowUpDelta(clientRaw.delta));
  const changesReviewed = clientRaw.changesReviewed === true;

  return {
    ...incoming,
    followUp: {
      ...server,
      ...(intent ? { intent } : {}),
      ...(selectedEpisode ? {
        selectedEpisodeId: selectedEpisode.id,
        selectedPrimaryReasonCode: selectedEpisode.primaryReasonCode,
        sourceVisitId: selectedEpisode.lastVisitId,
      } : {}),
      ...(intent === "NEW_CONCERN" ? {
        selectedEpisodeId: null,
        selectedPrimaryReasonCode: null,
        sourceVisitId: null,
      } : {}),
      ...(changes ? { changes } : {}),
      delta,
      changesReviewed,
    } as unknown as JsonValue,
  };
}
