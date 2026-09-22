import type { JsonValue } from "@/lib/patient-access/service";
import type {
  FollowUpDeltaHistoryEntry,
  FollowUpExistingItemChange,
  FollowUpSnapshotEntry,
} from "@/lib/follow-up/types";

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sourceValue(entry: FollowUpSnapshotEntry, itemIndex?: number): JsonValue | undefined {
  return itemIndex === undefined
    ? entry.value
    : Array.isArray(entry.value)
      ? entry.value[itemIndex]
      : undefined;
}

function takeReferencedValue(
  entries: FollowUpSnapshotEntry[],
  reference: Pick<FollowUpExistingItemChange, "sourceResponseId" | "sourceQuestionCode" | "sourceScopeKey" | "sourceItemIndex">,
): { entry: FollowUpSnapshotEntry; value: JsonValue } | null {
  const index = entries.findIndex((entry) =>
    entry.sourceResponseId === reference.sourceResponseId
    && entry.questionCode === reference.sourceQuestionCode
    && entry.responseScopeKey === reference.sourceScopeKey,
  );
  if (index < 0) return null;
  const entry = entries[index];
  const value = sourceValue(entry, reference.sourceItemIndex);
  if (value === undefined) return null;

  if (reference.sourceItemIndex === undefined) {
    entries.splice(index, 1);
  } else if (Array.isArray(entry.value)) {
    const remaining = entry.value.filter((_, itemIndex) => itemIndex !== reference.sourceItemIndex);
    if (remaining.length === 0) entries.splice(index, 1);
    else entries[index] = { ...entry, value: remaining };
  }
  return { entry, value };
}

function deltaEntry(input: {
  history: FollowUpDeltaHistoryEntry;
  path: string;
  questionCode: string;
  labelAr: string;
  labelEn: string;
  value: JsonValue;
  responseScopeType: string;
}): FollowUpSnapshotEntry {
  return {
    questionCode: input.questionCode,
    labelAr: input.labelAr,
    labelEn: input.labelEn,
    value: input.value,
    responseScopeType: input.responseScopeType,
    responseScopeKey: `FOLLOW_UP:${input.history.contextId}:${input.path}`,
    // This legacy field is the stable server-owned source identifier used by
    // delta references. sourceType/sourceDeltaId disambiguate its provenance.
    sourceResponseId: input.history.contextId,
    sourceVisitId: input.history.visitId,
    sourceEpisodeId: input.history.episodeId,
    sourceVisitAt: input.history.visitAt,
    effectiveSource: "PATIENT",
    sourceType: "FOLLOW_UP_DELTA",
    sourceDeltaId: input.history.contextId,
    sourceDeltaPath: input.path,
  };
}

function addNamedItems(
  entries: FollowUpSnapshotEntry[],
  history: FollowUpDeltaHistoryEntry,
  items: unknown,
  questionCode: string,
  path: string,
  labelAr: string,
  labelEn: string,
) {
  if (!Array.isArray(items)) return;
  items.forEach((item, index) => {
    if (!isRecord(item) || typeof item.name !== "string" || !item.name.trim()) return;
    entries.push(deltaEntry({
      history,
      path: `${path}:${typeof item.id === "string" ? item.id : index}`,
      questionCode,
      labelAr,
      labelEn,
      value: item,
      responseScopeType: questionCode === "Q_HAIR_TREATMENT_ITEMS" ? "PATHWAY" : "VISIT",
    }));
  });
}

function applyExistingChanges(
  entries: FollowUpSnapshotEntry[],
  history: FollowUpDeltaHistoryEntry,
  changes: unknown,
  path: string,
) {
  if (!Array.isArray(changes)) return;
  changes.forEach((raw, index) => {
    if (!isRecord(raw)
      || typeof raw.sourceResponseId !== "string"
      || typeof raw.sourceQuestionCode !== "string"
      || typeof raw.sourceScopeKey !== "string") return;
    const reference = raw as unknown as FollowUpExistingItemChange;
    const prior = takeReferencedValue(entries, reference);
    if (!prior || raw.action !== "USAGE_CHANGED") return;
    entries.push(deltaEntry({
      history,
      path: `${path}:${index}`,
      questionCode: prior.entry.questionCode,
      labelAr: prior.entry.labelAr,
      labelEn: prior.entry.labelEn,
      value: prior.value,
      responseScopeType: prior.entry.responseScopeType,
    }));
  });
}

function integerCount(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/**
 * Deterministically folds immutable visit deltas over the persisted official
 * response baseline. The history remains unchanged; only this effective view is
 * used as the server-authored baseline for a later follow-up.
 */
export function projectCumulativeFollowUpSnapshot(
  baseline: FollowUpSnapshotEntry[],
  history: FollowUpDeltaHistoryEntry[],
): FollowUpSnapshotEntry[] {
  const entries = structuredClone(baseline);

  for (const record of [...history].sort((a, b) =>
    a.visitAt.localeCompare(b.visitAt) || a.visitId.localeCompare(b.visitId),
  )) {
    const delta = isRecord(record.delta) ? record.delta : {};
    const meds = isRecord(delta.medicationsSupplements) ? delta.medicationsSupplements : {};
    applyExistingChanges(entries, record, meds.affectedExisting, "medications:changed");
    addNamedItems(entries, record, meds.startedMedications, "Q_HEALTH_MEDICATION_ITEMS", "medications:started", "الأدوية الحالية", "Current medications");
    addNamedItems(entries, record, meds.startedSupplements, "Q_HEALTH_SUPPLEMENT_ITEMS", "supplements:started", "المكملات الحالية", "Current supplements");

    const treatments = isRecord(delta.hairTreatments) ? delta.hairTreatments : {};
    applyExistingChanges(entries, record, treatments.affectedExisting, "hair-treatments:changed");
    if (Array.isArray(treatments.started)) {
      treatments.started.forEach((item, index) => {
        if (!isRecord(item) || typeof item.name !== "string" || !item.name.trim() || item.stillUsing === "NO") return;
        entries.push(deltaEntry({
          history: record,
          path: `hair-treatments:started:${typeof item.id === "string" ? item.id : index}`,
          questionCode: "Q_HAIR_TREATMENT_ITEMS",
          labelAr: "علاجات الشعر وفروة الرأس الحالية",
          labelEn: "Current hair/scalp treatments",
          value: item,
          responseScopeType: "PATHWAY",
        }));
      });
    }

    const procedures = isRecord(delta.hairProcedures) && Array.isArray(delta.hairProcedures.items)
      ? delta.hairProcedures.items
      : [];
    procedures.forEach((item, index) => {
      if (!isRecord(item) || typeof item.procedure !== "string") return;
      let value: JsonValue = item;
      if (typeof item.sourceResponseId === "string" && typeof item.sourceScopeKey === "string") {
        const prior = takeReferencedValue(entries, {
          sourceResponseId: item.sourceResponseId,
          sourceQuestionCode: "Q_HAIR_PROCEDURE_DETAILS",
          sourceScopeKey: item.sourceScopeKey,
          sourceItemIndex: typeof item.sourceItemIndex === "number" ? item.sourceItemIndex : undefined,
        });
        if (prior && isRecord(prior.value)) {
          const priorCount = integerCount(prior.value.count);
          const addedCount = integerCount(item.count);
          value = {
            ...item,
            ...(priorCount !== null && addedCount !== null ? { count: String(priorCount + addedCount) } : {}),
          };
        }
      }
      entries.push(deltaEntry({
        history: record,
        path: `hair-procedures:${typeof item.id === "string" ? item.id : index}`,
        questionCode: "Q_HAIR_PROCEDURE_DETAILS",
        labelAr: "إجراءات الشعر السابقة",
        labelEn: "Prior hair procedures",
        value,
        responseScopeType: "PROCEDURE_SELECTION",
      }));
    });
  }

  return entries;
}
