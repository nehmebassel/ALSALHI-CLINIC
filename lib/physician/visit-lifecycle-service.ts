import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";
import {
  assertCanAddPhysicianVisitAddendum,
  assertCanBeginPhysicianEncounter,
  assertCanCorrectFinalizedPhysicianVisit,
  assertCanFinalizePhysicianVisit,
  type AuthenticatedActor,
} from "@/lib/auth/authorization";
import {
  IMMUTABLE_PHYSICIAN_VISIT_CORRECTION_TARGETS,
  PHYSICIAN_VISIT_FINALIZATION_EVIDENCE_SCHEMA_VERSION,
  PhysicianVisitLifecycleError,
  type AddPhysicianVisitAddendumCommand,
  type FinalizePhysicianVisitCommand,
} from "./visit-lifecycle-contracts";
import {
  hasNonemptyUngovernedClinicalSection,
  parseGovernedPhysicianVisitDraft,
  requireConfirmedAnatomicalMapRegions,
  PhysicianVisitClinicalContractError,
} from "./visit-clinical-contracts";
import { materializeGovernedPhysicianClinicalDraft } from "./visit-clinical-service";
import {
  parseLongitudinalDraftSections,
  PhysicianLongitudinalContractError,
} from "./visit-longitudinal-contracts";
import { materializeGovernedLongitudinalDraft } from "./visit-longitudinal-service";
import { PhysicianVisitDraftError } from "./visit-contracts";
import { validatePhysicianVisitDraftEnvelope } from "./visit-service";
import { activeDatabaseSchema } from "@/lib/local-clinician-demo";

const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1_000;

interface PhysicianVisitLifecycleServiceDependencies {
  now?: () => Date;
  beforeFinalizeCommit?: () => void | Promise<void>;
  databaseSchema?: string;
}

type LifecycleVisit = {
  id: string;
  patientId: string;
  clinicScopeId: string | null;
  clinicalEpisodeId: string | null;
  status: "CREATED" | "COMPLETED" | "CANCELLED";
  visitOccurredAt: Date | null;
  completedAt: Date | null;
  clinicalEpisode: {
    id: string;
    patientId: string;
    clinicScopeId: string | null;
  } | null;
};

function isRetryablePrismaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      ((error as { code?: unknown }).code === "P2002" ||
        (error as { code?: unknown }).code === "P2034")) ||
    message.includes("40001") ||
    message.includes("could not serialize access")
  );
}

function assertVisitScopeIntegrity(
  visit: LifecycleVisit,
  actor: AuthenticatedActor,
): void {
  if (visit.clinicScopeId !== actor.clinicScopeId) {
    throw new PhysicianVisitLifecycleError("VISIT_NOT_FOUND");
  }
  if (visit.status === "CANCELLED") {
    throw new PhysicianVisitLifecycleError("VISIT_CANCELLED");
  }
  if (
    !visit.clinicalEpisode ||
    !visit.clinicalEpisodeId ||
    visit.clinicalEpisode.id !== visit.clinicalEpisodeId ||
    visit.clinicalEpisode.patientId !== visit.patientId ||
    visit.clinicalEpisode.clinicScopeId !== visit.clinicScopeId
  ) {
    throw new PhysicianVisitLifecycleError("EPISODE_MISMATCH");
  }
}

function compareUtf16CodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function canonicalizePhysicianVisitDraft(
  value: Prisma.JsonValue,
): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizePhysicianVisitDraft(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) =>
    compareUtf16CodeUnits(left, right),
  );
  return `{${entries
    .map(([key, item]) => {
      if (item === undefined) {
        throw new PhysicianVisitLifecycleError("INVALID_REQUEST");
      }
      return `${JSON.stringify(key)}:${canonicalizePhysicianVisitDraft(item)}`;
    })
    .join(",")}}`;
}

export function fingerprintPhysicianVisitDraft(
  draft: Prisma.JsonValue,
): string {
  const canonicalUtf8 = Buffer.from(
    canonicalizePhysicianVisitDraft(draft),
    "utf8",
  );
  return createHash("sha256").update(canonicalUtf8).digest("hex");
}

export function physicianVisitCorrectionDeadline(
  visitOccurredAt: Date,
): Date {
  return new Date(visitOccurredAt.getTime() + CORRECTION_WINDOW_MS);
}

export function isPhysicianVisitCorrectionWindowOpen(
  visitOccurredAt: Date,
  serverNow: Date,
): boolean {
  return serverNow.getTime() < physicianVisitCorrectionDeadline(visitOccurredAt).getTime();
}

function validateFinalizationDraft(draft: Prisma.JsonValue) {
  try {
    const validated = validatePhysicianVisitDraftEnvelope(draft);
    const sections = validated.sections as Record<string, unknown>;
    if (hasNonemptyUngovernedClinicalSection(sections)) {
      throw new PhysicianVisitLifecycleError(
        "UNAPPROVED_FINALIZATION_CONTENT",
      );
    }
    const clinical = parseGovernedPhysicianVisitDraft(sections);
    if (clinical.anatomicalMap) requireConfirmedAnatomicalMapRegions(clinical.anatomicalMap.regions);
    return {
      schemaVersion: validated.schemaVersion,
      clinical,
      longitudinal: parseLongitudinalDraftSections(sections),
    };
  } catch (error) {
    if (error instanceof PhysicianVisitLifecycleError) throw error;
    if (
      error instanceof PhysicianVisitDraftError ||
      error instanceof PhysicianVisitClinicalContractError ||
      error instanceof PhysicianLongitudinalContractError
    ) {
      throw new PhysicianVisitLifecycleError("INVALID_CLINICAL_DATA");
    }
    throw error;
  }
}

export class PhysicianVisitLifecycleService {
  private readonly now: () => Date;
  private readonly beforeFinalizeCommit: () => void | Promise<void>;
  private readonly databaseSchema: string;

  constructor(
    private readonly prisma: PrismaClient,
    dependencies: PhysicianVisitLifecycleServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.beforeFinalizeCommit = dependencies.beforeFinalizeCommit ?? (() => undefined);
    this.databaseSchema = dependencies.databaseSchema ?? activeDatabaseSchema();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(this.databaseSchema)) {
      throw new PhysicianVisitLifecycleError("INVALID_REQUEST");
    }
  }

  async beginEncounter(actor: AuthenticatedActor, visitId: string) {
    assertCanBeginPhysicianEncounter(actor);
    this.assertVisitId(visitId);

    return this.withRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const visit = await this.lockAndLoadVisit(tx, actor, visitId);
          assertVisitScopeIntegrity(visit, actor);
          if (!visit.physicianVisitRecord) {
            throw new PhysicianVisitLifecycleError("DRAFT_NOT_FOUND");
          }
          if (visit.visitOccurredAt) {
            return {
              visitId: visit.id,
              visitOccurredAt: visit.visitOccurredAt,
              idempotentReplay: true,
            };
          }
          if (visit.status !== "CREATED") {
            throw new PhysicianVisitLifecycleError("VISIT_NOT_ELIGIBLE");
          }

          const serverNow = this.now();
          const assigned = await tx.visit.updateMany({
            where: { id: visit.id, visitOccurredAt: null },
            data: { visitOccurredAt: serverNow },
          });
          if (assigned.count !== 1) {
            throw new PhysicianVisitLifecycleError("RETRYABLE_CONFLICT");
          }
          await tx.auditLog.create({
            data: {
              patientId: visit.patientId,
              entityType: "Visit",
              entityId: visit.id,
              fieldName: "visitOccurredAt",
              action: "PHYSICIAN_ENCOUNTER_BEGAN",
              oldValueJson: Prisma.JsonNull,
              newValueJson: { visitOccurredAt: serverNow.toISOString() },
              changedByUserId: actor.userId,
              changedAt: serverNow,
              reason: "Physician began the encounter",
            },
          });
          return {
            visitId: visit.id,
            visitOccurredAt: serverNow,
            idempotentReplay: false,
          };
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  async finalize(
    actor: AuthenticatedActor,
    visitId: string,
    command: FinalizePhysicianVisitCommand,
  ) {
    assertCanFinalizePhysicianVisit(actor);
    this.assertVisitId(visitId);
    if (!Number.isInteger(command.expectedDraftVersion) || command.expectedDraftVersion < 1) {
      throw new PhysicianVisitLifecycleError("INVALID_REQUEST");
    }

    return this.withRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const visit = await this.lockAndLoadVisit(tx, actor, visitId);
          assertVisitScopeIntegrity(visit, actor);
          if (!visit.physicianVisitRecord) {
            throw new PhysicianVisitLifecycleError("DRAFT_NOT_FOUND");
          }
          await this.lockPhysicianVisitRecord(tx, visit.physicianVisitRecord.id);
          const record = await tx.physicianVisitRecord.findUniqueOrThrow({
            where: { id: visit.physicianVisitRecord.id },
          });

          if (record.status === "FINALIZED") {
            return { physicianVisitRecord: record, idempotentReplay: true };
          }
          if (visit.status !== "CREATED") {
            throw new PhysicianVisitLifecycleError("VISIT_NOT_ELIGIBLE");
          }
          if (!visit.visitOccurredAt) {
            throw new PhysicianVisitLifecycleError("ENCOUNTER_NOT_BEGUN");
          }

          const serverNow = this.now();
          if (visit.visitOccurredAt.getTime() > serverNow.getTime()) {
            throw new PhysicianVisitLifecycleError("INVALID_VISIT_OCCURRED_AT");
          }
          if (record.draftVersion !== command.expectedDraftVersion) {
            throw new PhysicianVisitLifecycleError("DRAFT_CONFLICT");
          }

          const reviewedDraft = validateFinalizationDraft(record.draftJson);
          const draftSha256 = fingerprintPhysicianVisitDraft(record.draftJson);
          const isLateDocumentation = !isPhysicianVisitCorrectionWindowOpen(
            visit.visitOccurredAt,
            serverNow,
          );
          await this.lockClinicalEpisode(tx, visit.clinicalEpisodeId!);
          const materialization = await materializeGovernedPhysicianClinicalDraft(
            tx,
            record.id,
            reviewedDraft.clinical,
          );
          const longitudinalMaterialization =
            await materializeGovernedLongitudinalDraft(
              tx,
              record.id,
              {
                id: visit.id,
                patientId: visit.patientId,
                clinicScopeId: visit.clinicScopeId!,
                clinicalEpisodeId: visit.clinicalEpisodeId!,
                visitOccurredAt: visit.visitOccurredAt,
              },
              reviewedDraft.longitudinal,
              serverNow,
            );
          const evidence = {
            evidenceSchemaVersion:
              PHYSICIAN_VISIT_FINALIZATION_EVIDENCE_SCHEMA_VERSION,
            visitId: visit.id,
            patientId: visit.patientId,
            clinicalEpisodeId: visit.clinicalEpisodeId,
            clinicScopeId: visit.clinicScopeId,
            visitOccurredAt: visit.visitOccurredAt.toISOString(),
            finalizedByUserId: actor.userId,
            finalizedAt: serverNow.toISOString(),
            reviewedDraftSchemaVersion: reviewedDraft.schemaVersion,
            reviewedDraftVersion: record.draftVersion,
            reviewedDraftSha256: draftSha256,
            clinicalMaterialization: "FPV3_GOVERNED_CLINICAL_OBSERVATIONS",
            clinicalMaterializationRows: materialization,
            longitudinalMaterialization: "FPV4_LONGITUDINAL_PHYSICIAN_STATE",
            longitudinalMaterializationRows: longitudinalMaterialization,
            isLateDocumentation,
          };

          const completed = await tx.visit.updateMany({
            where: { id: visit.id, status: "CREATED" },
            data: { status: "COMPLETED", completedAt: serverNow },
          });
          if (completed.count !== 1) {
            throw new PhysicianVisitLifecycleError("RETRYABLE_CONFLICT");
          }
          const finalized = await tx.physicianVisitRecord.updateMany({
            where: {
              id: record.id,
              status: "DRAFT",
              draftVersion: command.expectedDraftVersion,
            },
            data: {
              status: "FINALIZED",
              finalizedByUserId: actor.userId,
              finalizedAt: serverNow,
              finalizedDraftVersion: record.draftVersion,
              finalizedDraftSha256: draftSha256,
              originalFinalizationEvidenceJson: evidence,
              isLateDocumentation,
            },
          });
          if (finalized.count !== 1) {
            throw new PhysicianVisitLifecycleError("DRAFT_CONFLICT");
          }

          const finalizedRecord = await tx.physicianVisitRecord.findUniqueOrThrow({
            where: { id: record.id },
          });
          await tx.auditLog.create({
            data: {
              patientId: visit.patientId,
              entityType: "PhysicianVisitRecord",
              entityId: record.id,
              action: "PHYSICIAN_VISIT_FINALIZED",
              oldValueJson: {
                status: "DRAFT",
                draftVersion: record.draftVersion,
              },
              newValueJson: evidence,
              changedByUserId: actor.userId,
              changedAt: serverNow,
              reason: "Physician finalized lifecycle evidence",
            },
          });
          if (isLateDocumentation) {
            await tx.auditLog.create({
              data: {
                patientId: visit.patientId,
                entityType: "PhysicianVisitRecord",
                entityId: record.id,
                fieldName: "isLateDocumentation",
                action: "PHYSICIAN_VISIT_LATE_FINALIZED",
                oldValueJson: false,
                newValueJson: true,
                changedByUserId: actor.userId,
                changedAt: serverNow,
                reason: "Finalization occurred after the encounter correction deadline",
              },
            });
          }

          await this.beforeFinalizeCommit();
          return {
            physicianVisitRecord: finalizedRecord,
            idempotentReplay: false,
          };
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  async evaluateCorrectionWindow(
    actor: AuthenticatedActor,
    visitId: string,
  ) {
    assertCanCorrectFinalizedPhysicianVisit(actor);
    this.assertVisitId(visitId);
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, clinicScopeId: actor.clinicScopeId },
      include: { clinicalEpisode: true, physicianVisitRecord: true },
    });
    if (!visit) throw new PhysicianVisitLifecycleError("VISIT_NOT_FOUND");
    assertVisitScopeIntegrity(visit, actor);
    if (visit.physicianVisitRecord?.status !== "FINALIZED") {
      throw new PhysicianVisitLifecycleError("PHYSICIAN_VISIT_NOT_FINALIZED");
    }
    if (!visit.visitOccurredAt) {
      throw new PhysicianVisitLifecycleError("INVALID_VISIT_OCCURRED_AT");
    }
    const serverNow = this.now();
    const deadline = physicianVisitCorrectionDeadline(visit.visitOccurredAt);
    return {
      visitId: visit.id,
      visitOccurredAt: visit.visitOccurredAt,
      correctionDeadline: deadline,
      evaluatedAt: serverNow,
      status: isPhysicianVisitCorrectionWindowOpen(visit.visitOccurredAt, serverNow)
        ? ("OPEN" as const)
        : ("CLOSED" as const),
    };
  }

  async assertCorrectionTarget(
    actor: AuthenticatedActor,
    visitId: string,
    target: string,
  ): Promise<never> {
    const window = await this.evaluateCorrectionWindow(actor, visitId);
    if (window.status === "CLOSED") {
      throw new PhysicianVisitLifecycleError("VISIT_CORRECTION_WINDOW_CLOSED");
    }
    if (IMMUTABLE_PHYSICIAN_VISIT_CORRECTION_TARGETS.has(target)) {
      throw new PhysicianVisitLifecycleError("IMMUTABLE_VISIT_FIELD");
    }
    throw new PhysicianVisitLifecycleError("UNAPPROVED_CORRECTION_TARGET");
  }

  async addAddendum(
    actor: AuthenticatedActor,
    visitId: string,
    command: AddPhysicianVisitAddendumCommand,
  ) {
    assertCanAddPhysicianVisitAddendum(actor);
    this.assertVisitId(visitId);
    if (
      typeof command.content !== "string" ||
      command.content.trim().length === 0 ||
      command.content.length > 16_000 ||
      !["CORRECTION", "CLARIFICATION", "ADDITIONAL_DOCUMENTATION"].includes(
        command.type,
      )
    ) {
      throw new PhysicianVisitLifecycleError("INVALID_ADDENDUM");
    }

    return this.withRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const visit = await this.lockAndLoadVisit(tx, actor, visitId);
          assertVisitScopeIntegrity(visit, actor);
          if (visit.physicianVisitRecord?.status !== "FINALIZED") {
            throw new PhysicianVisitLifecycleError("PHYSICIAN_VISIT_NOT_FINALIZED");
          }
          await this.lockPhysicianVisitRecord(tx, visit.physicianVisitRecord.id);
          if (!visit.visitOccurredAt) {
            throw new PhysicianVisitLifecycleError("INVALID_VISIT_OCCURRED_AT");
          }
          const serverNow = this.now();
          if (isPhysicianVisitCorrectionWindowOpen(visit.visitOccurredAt, serverNow)) {
            throw new PhysicianVisitLifecycleError("ADDENDUM_BEFORE_HARD_LOCK");
          }

          const addendum = await tx.physicianVisitAddendum.create({
            data: {
              physicianVisitRecordId: visit.physicianVisitRecord.id,
              authorUserId: actor.userId,
              type: command.type,
              content: command.content,
              createdAt: serverNow,
            },
          });
          await tx.auditLog.create({
            data: {
              patientId: visit.patientId,
              entityType: "PhysicianVisitAddendum",
              entityId: addendum.id,
              action: "PHYSICIAN_VISIT_ADDENDUM_ADDED",
              newValueJson: {
                physicianVisitRecordId: visit.physicianVisitRecord.id,
                type: addendum.type,
                createdAt: addendum.createdAt.toISOString(),
              },
              changedByUserId: actor.userId,
              changedAt: serverNow,
              reason: "Physician added append-only documentation",
            },
          });
          return addendum;
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isRetryablePrismaError(error)) throw error;
      }
    }
    throw new PhysicianVisitLifecycleError("RETRYABLE_CONFLICT");
  }

  private assertVisitId(visitId: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitId)) {
      throw new PhysicianVisitLifecycleError("INVALID_REQUEST");
    }
  }

  private async lockAndLoadVisit(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedActor,
    visitId: string,
  ) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM ${Prisma.raw(`"${this.databaseSchema}"."Visit"`)}
      WHERE "id" = ${visitId}::uuid
        AND "clinicScopeId" = ${actor.clinicScopeId}::uuid
      FOR UPDATE
    `;
    if (locked.length !== 1) {
      throw new PhysicianVisitLifecycleError("VISIT_NOT_FOUND");
    }
    return tx.visit.findUniqueOrThrow({
      where: { id: visitId },
      include: { clinicalEpisode: true, physicianVisitRecord: true },
    });
  }

  private async lockPhysicianVisitRecord(
    tx: Prisma.TransactionClient,
    physicianVisitRecordId: string,
  ): Promise<void> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM ${Prisma.raw(`"${this.databaseSchema}"."PhysicianVisitRecord"`)}
      WHERE "id" = ${physicianVisitRecordId}::uuid
      FOR UPDATE
    `;
    if (locked.length !== 1) {
      throw new PhysicianVisitLifecycleError("DRAFT_NOT_FOUND");
    }
  }

  private async lockClinicalEpisode(
    tx: Prisma.TransactionClient,
    clinicalEpisodeId: string,
  ): Promise<void> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM ${Prisma.raw(`"${this.databaseSchema}"."ClinicalEpisode"`)}
      WHERE "id" = ${clinicalEpisodeId}::uuid
      FOR UPDATE
    `;
    if (locked.length !== 1) {
      throw new PhysicianVisitLifecycleError("EPISODE_MISMATCH");
    }
  }
}
