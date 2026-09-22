import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";
import { assertCanModifyClinicalData, type AuthenticatedActor } from "@/lib/auth/authorization";
import { P01_PATHWAY_CODES } from "@/lib/p01/contracts";
import type { PhysicianHairHistoryItem, PhysicianHairHistoryLayer } from "@/lib/physician/types";

const LAYERS = new Set<PhysicianHairHistoryLayer>([
  "MEASURES", "SYMPTOMS", "TREATMENTS", "PROCEDURES", "TRIGGERS", "DIAGNOSES", "TESTS_LABS", "PHOTOS",
]);
const PRECISIONS = new Set(["DAY", "MONTH", "YEAR", "UNKNOWN"] as const);
const METRIC_CODES = new Set(["SHEDDING", "DENSITY", "ITCH", "BURNING", "SCALP_PAIN"]);

export type HairHistoryWriteErrorCode =
  | "INVALID_REQUEST"
  | "PATIENT_NOT_FOUND"
  | "SOURCE_VISIT_NOT_FOUND"
  | "REVIEW_VISIT_NOT_FOUND"
  | "HAIR_HISTORY_NOT_ELIGIBLE"
  | "VISIT_EPISODE_MISMATCH"
  | "INVALID_PROVENANCE"
  | "DRAFT_NOT_FOUND"
  | "ALREADY_APPROVED"
  | "REVISION_CONFLICT";

export class HairHistoryWriteError extends Error {
  constructor(readonly code: HairHistoryWriteErrorCode, message: string = code) {
    super(message);
    this.name = "HairHistoryWriteError";
  }
}

export type HairHistoryDraftInput = Omit<PhysicianHairHistoryItem, "editable">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateItems(items: unknown): HairHistoryDraftInput[] {
  if (!Array.isArray(items) || items.length > 250) throw new HairHistoryWriteError("INVALID_REQUEST", "Invalid hair-history items.");
  return items.map((raw, index) => {
    if (!isRecord(raw)) throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid item ${index}.`);
    if (typeof raw.id !== "string" || raw.id.length > 160) throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid item id ${index}.`);
    if (typeof raw.layer !== "string" || !LAYERS.has(raw.layer as PhysicianHairHistoryLayer)) throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid layer ${index}.`);
    if (typeof raw.itemType !== "string" || !raw.itemType.trim() || raw.itemType.length > 120) throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid item type ${index}.`);
    if (!isRecord(raw.label) || typeof raw.label.ar !== "string" || typeof raw.label.en !== "string") throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid label ${index}.`);
    if (raw.label.ar.length > 260 || raw.label.en.length > 260) throw new HairHistoryWriteError("INVALID_REQUEST", `Label too long ${index}.`);
    if (typeof raw.datePrecision !== "string" || !PRECISIONS.has(raw.datePrecision as "DAY" | "MONTH" | "YEAR" | "UNKNOWN")) throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid precision ${index}.`);
    if (raw.source !== "PATIENT" && raw.source !== "PHYSICIAN") throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid source ${index}.`);
    if (typeof raw.included !== "boolean") throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid inclusion state ${index}.`);
    if (!isRecord(raw.value)) throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid structured value ${index}.`);
    if (raw.layer === "MEASURES") {
      const metricCode = typeof raw.value.metricCode === "string" ? raw.value.metricCode : "";
      const metricValue = typeof raw.value.value === "number" ? raw.value.value : Number(raw.value.value);
      if (!METRIC_CODES.has(metricCode) || !Number.isInteger(metricValue) || metricValue < 0 || metricValue > 5) {
        throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid 0-5 measurement ${index}.`);
      }
    }
    if (JSON.stringify(raw.value).length > 12_000) throw new HairHistoryWriteError("INVALID_REQUEST", `Value too large ${index}.`);
    if (raw.date !== undefined && (typeof raw.date !== "string" || Number.isNaN(Date.parse(raw.date)))) throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid date ${index}.`);
    if (raw.datePrecision === "UNKNOWN" && raw.date !== undefined) throw new HairHistoryWriteError("INVALID_REQUEST", `Unknown date precision cannot carry a date ${index}.`);
    if (raw.datePrecision !== "UNKNOWN" && raw.date === undefined) throw new HairHistoryWriteError("INVALID_REQUEST", `Known date precision requires a date ${index}.`);
    if (raw.sourceResponseId !== undefined && (typeof raw.sourceResponseId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.sourceResponseId))) throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid source response ${index}.`);
    if (raw.sourceQuestionCode !== undefined && (typeof raw.sourceQuestionCode !== "string" || !raw.sourceQuestionCode.trim() || raw.sourceQuestionCode.length > 160)) throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid source question ${index}.`);
    if (raw.sourceScopeKey !== undefined && (typeof raw.sourceScopeKey !== "string" || !raw.sourceScopeKey.trim() || raw.sourceScopeKey.length > 200)) throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid source scope ${index}.`);
    if (raw.sourceItemIndex !== undefined && (typeof raw.sourceItemIndex !== "number" || !Number.isInteger(raw.sourceItemIndex) || raw.sourceItemIndex < 0 || raw.sourceItemIndex > 500)) throw new HairHistoryWriteError("INVALID_REQUEST", `Invalid source item index ${index}.`);
    return raw as unknown as HairHistoryDraftInput;
  });
}

function historicalTimestampOnOrBefore(
  value: string,
  precision: HairHistoryDraftInput["datePrecision"],
  referenceDate: Date,
): boolean {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || Number.isNaN(referenceDate.getTime())) return false;
  if (precision === "UNKNOWN") return true;
  if (parsed.getUTCFullYear() !== referenceDate.getUTCFullYear()) {
    return parsed.getUTCFullYear() < referenceDate.getUTCFullYear();
  }
  if (precision === "YEAR") return true;
  if (parsed.getUTCMonth() !== referenceDate.getUTCMonth()) {
    return parsed.getUTCMonth() < referenceDate.getUTCMonth();
  }
  return precision === "MONTH" || parsed.getUTCDate() <= referenceDate.getUTCDate();
}

export function assertHistoricalHairHistoryDates(items: HairHistoryDraftInput[], referenceDate: Date): void {
  items.forEach((item, index) => {
    if (item.datePrecision === "UNKNOWN" && item.date) {
      throw new HairHistoryWriteError("INVALID_REQUEST", `Hair History item ${index} has a fabricated date for UNKNOWN precision.`);
    }
    if (item.datePrecision !== "UNKNOWN" && !item.date) {
      throw new HairHistoryWriteError("INVALID_REQUEST", `Hair History item ${index} is missing its known historical date.`);
    }
    if (item.date && !historicalTimestampOnOrBefore(item.date, item.datePrecision, referenceDate)) {
      throw new HairHistoryWriteError("INVALID_REQUEST", `Hair History item ${index} is after authoritative server time.`);
    }
    if (item.layer !== "TREATMENTS" || !isRecord(item.value) || typeof item.value.stopDate !== "string") return;
    const stopPrecision = typeof item.value.stopPrecision === "string" && PRECISIONS.has(item.value.stopPrecision as HairHistoryDraftInput["datePrecision"])
      ? item.value.stopPrecision as HairHistoryDraftInput["datePrecision"]
      : item.datePrecision;
    if (stopPrecision === "UNKNOWN") {
      throw new HairHistoryWriteError("INVALID_REQUEST", `Hair History treatment ${index} has a fabricated stop date for UNKNOWN precision.`);
    }
    if (!historicalTimestampOnOrBefore(item.value.stopDate, stopPrecision, referenceDate)) {
      throw new HairHistoryWriteError("INVALID_REQUEST", `Hair History treatment ${index} ends after authoritative server time.`);
    }
    if (item.date && new Date(item.value.stopDate).getTime() < new Date(item.date).getTime()) {
      throw new HairHistoryWriteError("INVALID_REQUEST", `Hair History treatment ${index} has an inverted interval.`);
    }
  });
}

async function assertPatientScope(prisma: PrismaClient, actor: AuthenticatedActor, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, externalIdentifiers: { some: { clinicScopeId: actor.clinicScopeId } } },
    select: { id: true },
  });
  if (!patient) throw new HairHistoryWriteError("PATIENT_NOT_FOUND");
}

type DbClient = PrismaClient | Prisma.TransactionClient;

async function assertEligibleVisit(
  prisma: DbClient,
  patientId: string,
  visitId: string,
  code: "SOURCE_VISIT_NOT_FOUND" | "REVIEW_VISIT_NOT_FOUND",
): Promise<{ id: string; episodeId: string; createdAt: Date }> {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, patientId },
    select: { id: true, clinicalEpisodeId: true, createdAt: true },
  });
  if (!visit) throw new HairHistoryWriteError(code);
  if (!visit.clinicalEpisodeId) throw new HairHistoryWriteError("HAIR_HISTORY_NOT_ELIGIBLE");
  const eligiblePathway = await prisma.activePathway.findFirst({
    where: {
      pathwayDefinition: { code: P01_PATHWAY_CODES.hairScalp },
      clinicalInterview: { visit: { patientId, clinicalEpisodeId: visit.clinicalEpisodeId } },
    },
    select: { id: true },
  });
  if (!eligiblePathway) throw new HairHistoryWriteError("HAIR_HISTORY_NOT_ELIGIBLE");
  return { id: visit.id, episodeId: visit.clinicalEpisodeId, createdAt: visit.createdAt };
}

function assertSameEpisode(left: string, right: string): void {
  if (left !== right) throw new HairHistoryWriteError("VISIT_EPISODE_MISMATCH");
}

function responseItemIndexExists(value: unknown, sourceItemIndex: number | undefined): boolean {
  if (sourceItemIndex === undefined) return true;
  if (Array.isArray(value)) return sourceItemIndex < value.length;
  return isRecord(value) && sourceItemIndex === 0;
}

async function assertItemProvenance(
  prisma: DbClient,
  input: {
    patientId: string;
    episodeId: string;
    items: HairHistoryDraftInput[];
    legacyPersistedItemIds?: Set<string>;
  },
): Promise<void> {
  const responseIds = [...new Set(input.items.flatMap((item) => item.sourceResponseId ? [item.sourceResponseId] : []))];
  const responses = responseIds.length > 0 ? await prisma.response.findMany({
    where: { id: { in: responseIds } },
    select: {
      id: true,
      valueJson: true,
      questionInstance: {
        select: {
          responseScopeKey: true,
          questionDefinition: { select: { code: true } },
          clinicalInterview: { select: { visit: { select: { patientId: true, clinicalEpisodeId: true } } } },
        },
      },
    },
  }) : [];
  const responseById = new Map(responses.map((response) => [response.id, response]));

  for (const item of input.items) {
    const hasAnyReference = Boolean(item.sourceResponseId || item.sourceQuestionCode || item.sourceScopeKey || item.sourceItemIndex !== undefined);
    const grandfatheredLegacy = item.source === "PATIENT"
      && !hasAnyReference
      && input.legacyPersistedItemIds?.has(item.id);
    if (item.source === "PATIENT" && !hasAnyReference && !grandfatheredLegacy) {
      throw new HairHistoryWriteError("INVALID_PROVENANCE", "Patient-sourced Hair History items require official response provenance.");
    }
    if (!hasAnyReference) continue;
    if (!item.sourceResponseId || !item.sourceQuestionCode || !item.sourceScopeKey) {
      throw new HairHistoryWriteError("INVALID_PROVENANCE", "Incomplete Hair History response provenance.");
    }
    const response = responseById.get(item.sourceResponseId);
    const question = response?.questionInstance;
    const visit = question?.clinicalInterview.visit;
    if (
      !response || !question || !visit
      || visit.patientId !== input.patientId
      || visit.clinicalEpisodeId !== input.episodeId
      || question.questionDefinition.code !== item.sourceQuestionCode
      || question.responseScopeKey !== item.sourceScopeKey
      || !responseItemIndexExists(response.valueJson, item.sourceItemIndex)
    ) {
      throw new HairHistoryWriteError("INVALID_PROVENANCE", "Hair History provenance does not resolve to this patient and episode.");
    }
  }
}

async function amendmentSessionReason(
  prisma: DbClient,
  input: { patientId: string; approvedHairHistoryId: string; amendmentDraftId: string },
): Promise<string | undefined> {
  const candidates = await prisma.auditLog.findMany({
    where: {
      patientId: input.patientId,
      entityType: "APPROVED_HAIR_HISTORY",
      entityId: input.approvedHairHistoryId,
      action: "UPDATE",
    },
    orderBy: { changedAt: "desc" },
    take: 20,
    select: { reason: true, newValueJson: true },
  });
  for (const candidate of candidates) {
    const value = isRecord(candidate.newValueJson) ? candidate.newValueJson : {};
    if (value.amendmentDraftId === input.amendmentDraftId && candidate.reason && candidate.reason.trim().length >= 5) {
      return candidate.reason.trim();
    }
  }
  return undefined;
}

function draftSnapshot(draft: {
  id: string;
  status: string;
  baseRevision: number;
  items: Array<{ id: string; layer: string; itemType: string; labelAr: string; labelEn: string; valueJson: unknown; approximateDate: Date | null; datePrecision: string; source: string; sourceQuestionCode?: string | null; sourceScopeKey?: string | null; sourceResponseId?: string | null; sourceItemIndex?: number | null; isIncluded: boolean }>;
}): Prisma.InputJsonValue {
  return {
    id: draft.id,
    status: draft.status,
    baseRevision: draft.baseRevision,
    items: draft.items.map((item) => ({
      id: item.id,
      layer: item.layer,
      itemType: item.itemType,
      labelAr: item.labelAr,
      labelEn: item.labelEn,
      value: item.valueJson as Prisma.InputJsonValue,
      date: item.approximateDate?.toISOString() ?? "",
      datePrecision: item.datePrecision,
      source: item.source,
      sourceQuestionCode: item.sourceQuestionCode ?? "",
      sourceScopeKey: item.sourceScopeKey ?? "",
      sourceResponseId: item.sourceResponseId ?? "",
      sourceItemIndex: item.sourceItemIndex ?? -1,
      included: item.isIncluded,
    })),
  };
}

function itemCreate(item: HairHistoryDraftInput, sortOrder: number) {
  return {
    layer: item.layer,
    itemType: item.itemType.trim(),
    labelAr: item.label.ar.trim(),
    labelEn: item.label.en.trim(),
    valueJson: item.value as Prisma.InputJsonValue,
    ...(item.date ? { approximateDate: new Date(item.date) } : {}),
    datePrecision: item.datePrecision,
    source: item.source,
    ...(item.sourceQuestionCode ? { sourceQuestionCode: item.sourceQuestionCode.slice(0, 160) } : {}),
    ...(item.sourceScopeKey ? { sourceScopeKey: item.sourceScopeKey.slice(0, 200) } : {}),
    ...(item.sourceResponseId ? { sourceResponseId: item.sourceResponseId } : {}),
    ...(item.sourceItemIndex !== undefined ? { sourceItemIndex: item.sourceItemIndex } : {}),
    isIncluded: item.included,
    sortOrder,
  };
}

export class PhysicianHairHistoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async saveDraft(actor: AuthenticatedActor, input: { patientId: string; sourceVisitId: string; items: unknown; baseRevision?: number; reason?: string }) {
    assertCanModifyClinicalData(actor);
    const items = validateItems(input.items);
    const reason = input.reason?.trim() ?? "";
    if (reason.length > 500) {
      throw new HairHistoryWriteError("INVALID_REQUEST", "Hair History change reason is too long.");
    }
    await assertPatientScope(this.prisma, actor, input.patientId);

    return this.prisma.$transaction(async (tx) => {
      const sourceVisit = await assertEligibleVisit(tx, input.patientId, input.sourceVisitId, "SOURCE_VISIT_NOT_FOUND");
      assertHistoricalHairHistoryDates(items, new Date());
      const existingApproved = await tx.approvedHairHistory.findUnique({ where: { patientId: input.patientId }, select: { id: true, revision: true } });
      const requestedBase = input.baseRevision ?? existingApproved?.revision ?? 0;
      if (existingApproved && requestedBase !== existingApproved.revision) throw new HairHistoryWriteError("REVISION_CONFLICT");

      const prior = await tx.hairHistoryDraft.findUnique({
        where: { patientId: input.patientId },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
      if (prior) {
        const priorSourceVisit = await assertEligibleVisit(tx, input.patientId, prior.sourceVisitId, "SOURCE_VISIT_NOT_FOUND");
        assertSameEpisode(sourceVisit.episodeId, priorSourceVisit.episodeId);
      }
      if (existingApproved && (!prior || prior.status !== "AMENDMENT_DRAFT")) {
        throw new HairHistoryWriteError("INVALID_REQUEST", "Approved Hair History must be reopened with a reason before amendment edits.");
      }
      const amendmentReason = existingApproved && prior
        ? await amendmentSessionReason(tx, { patientId: input.patientId, approvedHairHistoryId: existingApproved.id, amendmentDraftId: prior.id })
        : undefined;
      if (existingApproved && !amendmentReason) {
        throw new HairHistoryWriteError("INVALID_REQUEST", "Approved Hair History amendment session is missing its reasoned Reopen audit.");
      }
      await assertItemProvenance(tx, {
        patientId: input.patientId,
        episodeId: sourceVisit.episodeId,
        items,
        legacyPersistedItemIds: new Set(
          (prior?.items ?? [])
            .filter((item) => item.source === "PATIENT" && !item.sourceResponseId)
            .map((item) => item.id),
        ),
      });
      const status = existingApproved ? "AMENDMENT_DRAFT" : "REVIEWED_DRAFT";
      const draft = await tx.hairHistoryDraft.upsert({
        where: { patientId: input.patientId },
        create: {
          patientId: input.patientId,
          sourceVisitId: input.sourceVisitId,
          status,
          baseRevision: existingApproved?.revision ?? 0,
          lastEditedByUserId: actor.userId,
          lastEditedAt: new Date(),
          items: { create: items.map(itemCreate) },
        },
        update: {
          sourceVisitId: input.sourceVisitId,
          status,
          baseRevision: existingApproved?.revision ?? 0,
          lastEditedByUserId: actor.userId,
          lastEditedAt: new Date(),
          items: { deleteMany: {}, create: items.map(itemCreate) },
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });

      await tx.auditLog.create({
        data: {
          patientId: input.patientId,
          entityType: "HAIR_HISTORY_DRAFT",
          entityId: draft.id,
          action: prior ? "UPDATE" : "CREATE",
          ...(prior ? { oldValueJson: draftSnapshot(prior) } : {}),
          newValueJson: draftSnapshot(draft),
          changedByUserId: actor.userId,
          reason: existingApproved ? amendmentReason! : reason || "Physician hair-history review edit before approval",
        },
      });
      return { draftId: draft.id, status: draft.status, itemCount: draft.items.length, baseRevision: draft.baseRevision };
    });
  }

  async approve(actor: AuthenticatedActor, input: { patientId: string; approvingVisitId: string }) {
    assertCanModifyClinicalData(actor);
    await assertPatientScope(this.prisma, actor, input.patientId);

    return this.prisma.$transaction(async (tx) => {
      const approvingVisit = await assertEligibleVisit(tx, input.patientId, input.approvingVisitId, "REVIEW_VISIT_NOT_FOUND");
      const draft = await tx.hairHistoryDraft.findUnique({ where: { patientId: input.patientId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
      if (!draft) throw new HairHistoryWriteError("DRAFT_NOT_FOUND");
      const draftSourceVisit = await assertEligibleVisit(tx, input.patientId, draft.sourceVisitId, "SOURCE_VISIT_NOT_FOUND");
      assertSameEpisode(approvingVisit.episodeId, draftSourceVisit.episodeId);
      assertHistoricalHairHistoryDates(draft.items.map((item) => ({
        id: item.id,
        layer: item.layer,
        itemType: item.itemType,
        label: { ar: item.labelAr, en: item.labelEn },
        value: item.valueJson,
        ...(item.approximateDate ? { date: item.approximateDate.toISOString() } : {}),
        datePrecision: item.datePrecision,
        source: item.source,
        included: item.isIncluded,
      })), new Date());
      await assertItemProvenance(tx, {
        patientId: input.patientId,
        episodeId: draftSourceVisit.episodeId,
        items: draft.items.map((item) => ({
          id: item.id,
          layer: item.layer,
          itemType: item.itemType,
          label: { ar: item.labelAr, en: item.labelEn },
          value: item.valueJson,
          ...(item.approximateDate ? { date: item.approximateDate.toISOString() } : {}),
          datePrecision: item.datePrecision,
          source: item.source,
          included: item.isIncluded,
          ...(item.sourceQuestionCode ? { sourceQuestionCode: item.sourceQuestionCode } : {}),
          ...(item.sourceScopeKey ? { sourceScopeKey: item.sourceScopeKey } : {}),
          ...(item.sourceResponseId ? { sourceResponseId: item.sourceResponseId } : {}),
          ...(item.sourceItemIndex !== null ? { sourceItemIndex: item.sourceItemIndex } : {}),
        })),
        legacyPersistedItemIds: new Set(
          draft.items.filter((item) => item.source === "PATIENT" && !item.sourceResponseId).map((item) => item.id),
        ),
      });
      const existing = await tx.approvedHairHistory.findUnique({ where: { patientId: input.patientId }, include: { items: true } });
      if (existing && draft.baseRevision !== existing.revision) throw new HairHistoryWriteError("REVISION_CONFLICT");
      const amendmentReason = existing
        ? await amendmentSessionReason(tx, { patientId: input.patientId, approvedHairHistoryId: existing.id, amendmentDraftId: draft.id })
        : undefined;
      if (existing && !amendmentReason) {
        throw new HairHistoryWriteError("INVALID_REQUEST", "Approved Hair History amendment approval is missing its reasoned Reopen audit.");
      }

      const oldSnapshot: Prisma.InputJsonValue | undefined = existing ? {
        revision: existing.revision,
        approvedAt: existing.approvedAt.toISOString(),
        items: existing.items.map((item) => ({ itemType: item.itemType, value: item.valueJson as Prisma.InputJsonValue, date: item.approximateDate?.toISOString() ?? "", datePrecision: item.datePrecision, source: item.source ?? "" })),
      } : undefined;
      const nextRevision = existing ? existing.revision + 1 : 1;
      const included = draft.items.filter((item) => item.isIncluded);
      const approved = await tx.approvedHairHistory.upsert({
        where: { patientId: input.patientId },
        create: {
          patientId: input.patientId,
          approvedByUserId: actor.userId,
          approvedVisitId: input.approvingVisitId,
          approvedAt: new Date(),
          revision: nextRevision,
          items: { create: included.map((item) => ({
            itemType: item.itemType,
            valueJson: { layer: item.layer, labelAr: item.labelAr, labelEn: item.labelEn, value: item.valueJson as Prisma.InputJsonValue, provenance: { questionCode: item.sourceQuestionCode ?? "", scopeKey: item.sourceScopeKey ?? "", responseId: item.sourceResponseId ?? "", itemIndex: item.sourceItemIndex ?? -1 } } as Prisma.InputJsonValue,
            approximateDate: item.approximateDate,
            datePrecision: item.datePrecision,
            source: item.source,
          })) },
        },
        update: {
          approvedByUserId: actor.userId,
          approvedVisitId: input.approvingVisitId,
          approvedAt: new Date(),
          revision: nextRevision,
          items: { deleteMany: {}, create: included.map((item) => ({
            itemType: item.itemType,
            valueJson: { layer: item.layer, labelAr: item.labelAr, labelEn: item.labelEn, value: item.valueJson as Prisma.InputJsonValue, provenance: { questionCode: item.sourceQuestionCode ?? "", scopeKey: item.sourceScopeKey ?? "", responseId: item.sourceResponseId ?? "", itemIndex: item.sourceItemIndex ?? -1 } } as Prisma.InputJsonValue,
            approximateDate: item.approximateDate,
            datePrecision: item.datePrecision,
            source: item.source,
          })) },
        },
        include: { items: true },
      });

      await tx.auditLog.create({
        data: {
          patientId: input.patientId,
          entityType: "APPROVED_HAIR_HISTORY",
          entityId: approved.id,
          action: "APPROVE",
          ...(oldSnapshot ? { oldValueJson: oldSnapshot } : {}),
          newValueJson: {
            revision: approved.revision,
            approvedAt: approved.approvedAt.toISOString(),
            itemCount: approved.items.length,
          },
          changedByUserId: actor.userId,
          reason: existing ? amendmentReason! : "Approved patient-reported hair history",
        },
      });
      await tx.hairHistoryDraft.delete({ where: { id: draft.id } });
      return { approvedHairHistoryId: approved.id, revision: approved.revision, approvedAt: approved.approvedAt.toISOString(), itemCount: approved.items.length };
    });
  }

  async reopen(actor: AuthenticatedActor, input: { patientId: string; sourceVisitId: string; reason: string }) {
    assertCanModifyClinicalData(actor);
    const reason = input.reason.trim();
    if (reason.length < 5 || reason.length > 500) throw new HairHistoryWriteError("INVALID_REQUEST", "A reason is required to amend approved history.");
    await assertPatientScope(this.prisma, actor, input.patientId);

    return this.prisma.$transaction(async (tx) => {
      const sourceVisit = await assertEligibleVisit(tx, input.patientId, input.sourceVisitId, "SOURCE_VISIT_NOT_FOUND");
      const approved = await tx.approvedHairHistory.findUnique({ where: { patientId: input.patientId }, include: { items: { orderBy: [{ approximateDate: "asc" }, { createdAt: "asc" }] } } });
      if (!approved) throw new HairHistoryWriteError("DRAFT_NOT_FOUND");
      const approvedVisit = await assertEligibleVisit(tx, input.patientId, approved.approvedVisitId, "REVIEW_VISIT_NOT_FOUND");
      assertSameEpisode(sourceVisit.episodeId, approvedVisit.episodeId);
      const existingDraft = await tx.hairHistoryDraft.findUnique({ where: { patientId: input.patientId } });
      if (existingDraft) return { draftId: existingDraft.id, status: existingDraft.status, baseRevision: existingDraft.baseRevision };

      const draft = await tx.hairHistoryDraft.create({
        data: {
          patientId: input.patientId,
          sourceVisitId: input.sourceVisitId,
          status: "AMENDMENT_DRAFT",
          baseRevision: approved.revision,
          lastEditedByUserId: actor.userId,
          lastEditedAt: new Date(),
          items: { create: approved.items.map((item, sortOrder) => {
            const payload = isRecord(item.valueJson) ? item.valueJson : {};
            const provenance = isRecord(payload.provenance) ? payload.provenance : {};
            const layer = typeof payload.layer === "string" && LAYERS.has(payload.layer as PhysicianHairHistoryLayer) ? payload.layer as PhysicianHairHistoryLayer : "SYMPTOMS";
            return {
              layer,
              itemType: item.itemType,
              labelAr: typeof payload.labelAr === "string" ? payload.labelAr : item.itemType,
              labelEn: typeof payload.labelEn === "string" ? payload.labelEn : item.itemType,
              valueJson: (isRecord(payload.value) ? payload.value : {}) as Prisma.InputJsonValue,
              approximateDate: item.approximateDate,
              datePrecision: item.datePrecision,
              source: item.source === "PHYSICIAN" ? "PHYSICIAN" : "PATIENT",
              ...(typeof provenance.questionCode === "string" && provenance.questionCode ? { sourceQuestionCode: provenance.questionCode } : {}),
              ...(typeof provenance.scopeKey === "string" && provenance.scopeKey ? { sourceScopeKey: provenance.scopeKey } : {}),
              ...(typeof provenance.responseId === "string" && provenance.responseId ? { sourceResponseId: provenance.responseId } : {}),
              ...(typeof provenance.itemIndex === "number" && provenance.itemIndex >= 0 ? { sourceItemIndex: provenance.itemIndex } : {}),
              isIncluded: true,
              sortOrder,
            };
          }) },
        },
      });
      await tx.auditLog.create({ data: { patientId: input.patientId, entityType: "APPROVED_HAIR_HISTORY", entityId: approved.id, action: "UPDATE", changedByUserId: actor.userId, reason, oldValueJson: { revision: approved.revision }, newValueJson: { amendmentDraftId: draft.id, baseRevision: approved.revision } } });
      return { draftId: draft.id, status: draft.status, baseRevision: draft.baseRevision };
    });
  }
}
