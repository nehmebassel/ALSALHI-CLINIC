import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import {
  assertCanEditPhysicianVisitDraft,
  assertCanPreparePhysicianVisitDraft,
  assertCanReadPatientReference,
  type AuthenticatedActor,
} from "@/lib/auth/authorization";
import {
  PHYSICIAN_VISIT_DRAFT_SCHEMA_VERSION,
  PHYSICIAN_VISIT_DRAFT_SECTIONS,
  PhysicianVisitDraftError,
  type PhysicianVisitDraftDocument,
  type PhysicianVisitDraftSection,
  type UpdatePhysicianVisitDraftCommand,
} from "./visit-contracts";
import {
  parseGovernedDraftSection,
  PhysicianVisitClinicalContractError,
} from "./visit-clinical-contracts";
import { PhysicianLongitudinalContractError } from "./visit-longitudinal-contracts";

const MAX_DRAFT_SECTION_BYTES = 128 * 1024;
const MAX_DRAFT_TOTAL_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 16;
const MAX_SECTION_JSON_NODES = 5_000;
const MAX_DRAFT_JSON_NODES = 20_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_DRAFT_SECTIONS = new Set<string>(PHYSICIAN_VISIT_DRAFT_SECTIONS);
const FORBIDDEN_PATIENT_PROVENANCE_KEYS = new Set([
  "patientresponseid",
  "patientresponseids",
  "responseid",
  "responseids",
  "sourceresponseid",
  "sourceresponseids",
  "questioninstanceid",
  "questioninstanceids",
  "sourcequestioncode",
  "sourcescopekey",
  "patienthairhistoryid",
  "patienthairhistoryids",
  "hairhistoryid",
  "hairhistoryids",
  "approvedhairhistoryid",
  "approvedhairhistoryids",
]);

interface PhysicianVisitServiceDependencies {
  now?: () => Date;
}

type VisitForDraft = {
  id: string;
  patientId: string;
  clinicScopeId: string | null;
  clinicalEpisodeId: string | null;
  visitType: "INITIAL" | "FOLLOW_UP";
  status: "CREATED" | "COMPLETED" | "CANCELLED";
  visitOccurredAt: Date | null;
  clinicalEpisode: {
    id: string;
    patientId: string;
    clinicScopeId: string | null;
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRetryablePrismaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "P2002" ||
      (error as { code?: unknown }).code === "P2034")
  );
}

function emptyDraft(): PhysicianVisitDraftDocument {
  return {
    schemaVersion: PHYSICIAN_VISIT_DRAFT_SCHEMA_VERSION,
    sections: {},
  };
}

/**
 * Validates the FPV-1 Draft storage envelope and its provenance boundary.
 * This is deliberately not a finalization schema: a future finalizer must add
 * explicit field-level contracts per section and materialize only those fields.
 */
export function validatePhysicianVisitDraftEnvelope(
  value: Prisma.JsonValue,
): PhysicianVisitDraftDocument {
  if (
    !isRecord(value) ||
    value.schemaVersion !== PHYSICIAN_VISIT_DRAFT_SCHEMA_VERSION ||
    !isRecord(value.sections)
  ) {
    throw new PhysicianVisitDraftError("INVALID_DRAFT_DATA");
  }
  for (const [section, sectionValue] of Object.entries(value.sections)) {
    if (!ALLOWED_DRAFT_SECTIONS.has(section) || !isRecord(sectionValue)) {
      throw new PhysicianVisitDraftError("INVALID_DRAFT_DATA");
    }
    assertJsonValueAndProvenanceBoundary(sectionValue, {
      maxBytes: MAX_DRAFT_SECTION_BYTES,
      maxNodes: MAX_SECTION_JSON_NODES,
    });
    try {
      parseGovernedDraftSection(section, sectionValue);
    } catch (error) {
      if (
        error instanceof PhysicianVisitClinicalContractError ||
        error instanceof PhysicianLongitudinalContractError
      ) {
        throw new PhysicianVisitDraftError("INVALID_DRAFT_DATA");
      }
      throw error;
    }
  }
  assertJsonValueAndProvenanceBoundary(value, {
    maxBytes: MAX_DRAFT_TOTAL_BYTES,
    maxNodes: MAX_DRAFT_JSON_NODES,
  });

  return value as unknown as PhysicianVisitDraftDocument;
}

function isForbiddenPatientProvenanceKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  if (FORBIDDEN_PATIENT_PROVENANCE_KEYS.has(normalizedKey)) return true;
  const responseLike = /(response|answer|questioninstance)/.test(normalizedKey);
  const identifierLike = /(id|identifier|uuid|ref|reference)/.test(normalizedKey);
  const sourceLike = /(patient|source|origin|provenance)/.test(normalizedKey);
  const patientHairHistoryLike = /(?:patient|approved)?hairhistory/.test(
    normalizedKey,
  );
  return (
    (responseLike && identifierLike) ||
    (responseLike && sourceLike) ||
    (patientHairHistoryLike && (identifierLike || sourceLike))
  );
}

function assertJsonValueAndProvenanceBoundary(
  value: unknown,
  limits: { maxBytes: number; maxNodes: number },
): asserts value is Prisma.InputJsonValue {
  let nodes = 0;

  const visit = (candidate: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > limits.maxNodes || depth > MAX_JSON_DEPTH) {
      throw new PhysicianVisitDraftError("INVALID_DRAFT_DATA");
    }
    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "boolean" ||
      (typeof candidate === "number" && Number.isFinite(candidate))
    ) {
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item, depth + 1);
      return;
    }
    if (!isRecord(candidate)) {
      throw new PhysicianVisitDraftError("INVALID_DRAFT_DATA");
    }
    for (const [key, item] of Object.entries(candidate)) {
      if (isForbiddenPatientProvenanceKey(key)) {
        throw new PhysicianVisitDraftError(
          "PATIENT_PROVENANCE_BOUNDARY_VIOLATION",
        );
      }
      visit(item, depth + 1);
    }
  };

  visit(value, 0);
  const serialized = JSON.stringify(value);
  if (!serialized || Buffer.byteLength(serialized, "utf8") > limits.maxBytes) {
    throw new PhysicianVisitDraftError("INVALID_DRAFT_DATA");
  }
}

function assertVisitId(visitId: string): void {
  if (!UUID_PATTERN.test(visitId)) {
    throw new PhysicianVisitDraftError("INVALID_REQUEST");
  }
}

function assertVisitScopeIntegrity(
  visit: VisitForDraft,
  actor: AuthenticatedActor,
): void {
  if (!visit.clinicScopeId) {
    throw new PhysicianVisitDraftError("CLINIC_SCOPE_UNRESOLVED");
  }
  if (visit.clinicScopeId !== actor.clinicScopeId) {
    throw new PhysicianVisitDraftError("VISIT_NOT_FOUND");
  }
  if (
    !visit.clinicalEpisode ||
    !visit.clinicalEpisodeId ||
    visit.clinicalEpisode.id !== visit.clinicalEpisodeId ||
    visit.clinicalEpisode.patientId !== visit.patientId ||
    visit.clinicalEpisode.clinicScopeId !== visit.clinicScopeId
  ) {
    throw new PhysicianVisitDraftError("EPISODE_MISMATCH");
  }
}

function assertVisitReadyForDraft(
  visit: VisitForDraft,
  actor: AuthenticatedActor,
): void {
  assertVisitScopeIntegrity(visit, actor);
  if (visit.status === "CANCELLED") {
    throw new PhysicianVisitDraftError("VISIT_CANCELLED");
  }
  if (visit.status !== "CREATED") {
    throw new PhysicianVisitDraftError("VISIT_NOT_ELIGIBLE");
  }
}

function recordResponse<T extends {
  draftJson: Prisma.JsonValue;
}>(record: T) {
  return {
    ...record,
    draftJson: validatePhysicianVisitDraftEnvelope(record.draftJson),
  };
}

export class PhysicianVisitService {
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PrismaClient,
    dependencies: PhysicianVisitServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async read(actor: AuthenticatedActor, visitId: string) {
    assertCanReadPatientReference(actor);
    assertVisitId(visitId);

    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, clinicScopeId: actor.clinicScopeId },
      select: {
        id: true,
        patientId: true,
        clinicScopeId: true,
        clinicalEpisodeId: true,
        visitType: true,
        status: true,
        visitOccurredAt: true,
        clinicalEpisode: {
          select: { id: true, patientId: true, clinicScopeId: true },
        },
        physicianVisitRecord: true,
      },
    });

    if (!visit) throw new PhysicianVisitDraftError("VISIT_NOT_FOUND");
    assertVisitScopeIntegrity(visit, actor);
    if (visit.status === "CANCELLED") {
      throw new PhysicianVisitDraftError("VISIT_CANCELLED");
    }

    return {
      visit: {
        id: visit.id,
        patientId: visit.patientId,
        clinicScopeId: visit.clinicScopeId,
        clinicalEpisodeId: visit.clinicalEpisodeId,
        visitType: visit.visitType,
        status: visit.status,
        visitOccurredAt: visit.visitOccurredAt,
      },
      physicianVisitRecord: visit.physicianVisitRecord
        ? recordResponse(visit.physicianVisitRecord)
        : null,
    };
  }

  async prepareDraft(actor: AuthenticatedActor, visitId: string) {
    assertCanPreparePhysicianVisitDraft(actor);
    assertVisitId(visitId);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prepareDraftOnce(actor, visitId);
      } catch (error) {
        if (!isRetryablePrismaError(error)) throw error;
      }
    }
    throw new PhysicianVisitDraftError("RETRYABLE_CONFLICT");
  }

  private async prepareDraftOnce(actor: AuthenticatedActor, visitId: string) {
    const now = this.now();
    return this.prisma.$transaction(
      async (tx) => {
        const visit = await tx.visit.findFirst({
          where: { id: visitId, clinicScopeId: actor.clinicScopeId },
          select: {
            id: true,
            patientId: true,
            clinicScopeId: true,
            clinicalEpisodeId: true,
            visitType: true,
            status: true,
            visitOccurredAt: true,
            clinicalEpisode: {
              select: { id: true, patientId: true, clinicScopeId: true },
            },
            physicianVisitRecord: true,
          },
        });
        if (!visit) throw new PhysicianVisitDraftError("VISIT_NOT_FOUND");
        assertVisitScopeIntegrity(visit, actor);
        if (visit.physicianVisitRecord?.status === "FINALIZED") {
          throw new PhysicianVisitDraftError(
            "PHYSICIAN_VISIT_ALREADY_FINALIZED",
          );
        }
        assertVisitReadyForDraft(visit, actor);

        if (visit.physicianVisitRecord) {
          return recordResponse(visit.physicianVisitRecord);
        }

        const created = await tx.physicianVisitRecord.create({
          data: {
            visitId,
            status: "DRAFT",
            draftJson: emptyDraft() as unknown as Prisma.InputJsonValue,
            draftVersion: 1,
            draftStartedByUserId: actor.userId,
            draftStartedAt: now,
            lastDraftEditedByUserId: actor.userId,
            lastDraftEditedAt: now,
          },
        });

        await tx.auditLog.create({
          data: {
            patientId: visit.patientId,
            entityType: "PhysicianVisitRecord",
            entityId: created.id,
            action: "PHYSICIAN_VISIT_DRAFT_STARTED",
            newValueJson: {
              visitId,
              status: "DRAFT",
              draftVersion: 1,
            },
            changedByUserId: actor.userId,
            changedAt: now,
            reason: "Physician Visit Draft prepared",
          },
        });

        return recordResponse(created);
      },
      { isolationLevel: "Serializable" },
    );
  }

  async updateDraft(
    actor: AuthenticatedActor,
    visitId: string,
    command: UpdatePhysicianVisitDraftCommand,
  ) {
    assertCanEditPhysicianVisitDraft(actor);
    assertVisitId(visitId);
    if (
      !Number.isInteger(command.expectedDraftVersion) ||
      command.expectedDraftVersion < 1 ||
      typeof command.section !== "string" ||
      !ALLOWED_DRAFT_SECTIONS.has(command.section)
    ) {
      throw new PhysicianVisitDraftError("INVALID_REQUEST");
    }
    if (!isRecord(command.value)) {
      throw new PhysicianVisitDraftError("INVALID_DRAFT_DATA");
    }
    let normalizedSectionValue: unknown;
    try {
      normalizedSectionValue = parseGovernedDraftSection(
        command.section,
        command.value,
      );
    } catch (error) {
      if (error instanceof PhysicianVisitClinicalContractError) {
        throw new PhysicianVisitDraftError("INVALID_DRAFT_DATA");
      }
      throw error;
    }
    assertJsonValueAndProvenanceBoundary(normalizedSectionValue, {
      maxBytes: MAX_DRAFT_SECTION_BYTES,
      maxNodes: MAX_SECTION_JSON_NODES,
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.updateDraftOnce(actor, visitId, {
          ...command,
          value: normalizedSectionValue,
        });
      } catch (error) {
        if (!isRetryablePrismaError(error)) throw error;
      }
    }
    throw new PhysicianVisitDraftError("RETRYABLE_CONFLICT");
  }

  private async updateDraftOnce(
    actor: AuthenticatedActor,
    visitId: string,
    command: UpdatePhysicianVisitDraftCommand,
  ) {
    const now = this.now();
    return this.prisma.$transaction(
      async (tx) => {
        const scopedVisit = await tx.visit.findFirst({
          where: { id: visitId, clinicScopeId: actor.clinicScopeId },
          select: {
            id: true,
            patientId: true,
            clinicScopeId: true,
            clinicalEpisodeId: true,
            visitType: true,
            status: true,
            visitOccurredAt: true,
            clinicalEpisode: {
              select: { id: true, patientId: true, clinicScopeId: true },
            },
            physicianVisitRecord: { select: { id: true, status: true } },
          },
        });
        if (!scopedVisit) throw new PhysicianVisitDraftError("VISIT_NOT_FOUND");
        if (!scopedVisit.physicianVisitRecord) {
          throw new PhysicianVisitDraftError("DRAFT_NOT_FOUND");
        }
        if (scopedVisit.physicianVisitRecord.status === "FINALIZED") {
          throw new PhysicianVisitDraftError(
            "PHYSICIAN_VISIT_ALREADY_FINALIZED",
          );
        }
        assertVisitReadyForDraft(scopedVisit, actor);

        const record = await tx.physicianVisitRecord.findUniqueOrThrow({
          where: { id: scopedVisit.physicianVisitRecord.id },
          include: {
            visit: {
              include: { clinicalEpisode: true },
            },
          },
        });
        if (record.status === "FINALIZED") {
          throw new PhysicianVisitDraftError(
            "PHYSICIAN_VISIT_ALREADY_FINALIZED",
          );
        }
        assertVisitReadyForDraft(record.visit, actor);
        if (record.draftVersion !== command.expectedDraftVersion) {
          throw new PhysicianVisitDraftError("DRAFT_CONFLICT");
        }

        const currentDraft = validatePhysicianVisitDraftEnvelope(record.draftJson);
        const nextDraft: PhysicianVisitDraftDocument = {
          schemaVersion: PHYSICIAN_VISIT_DRAFT_SCHEMA_VERSION,
          sections: {
            ...currentDraft.sections,
            [command.section]: command.value as Prisma.JsonValue,
          },
        };
        validatePhysicianVisitDraftEnvelope(
          nextDraft as unknown as Prisma.JsonValue,
        );
        const nextVersion = record.draftVersion + 1;
        const updateResult = await tx.physicianVisitRecord.updateMany({
          where: {
            id: record.id,
            status: "DRAFT",
            draftVersion: command.expectedDraftVersion,
          },
          data: {
            draftJson: nextDraft as unknown as Prisma.InputJsonValue,
            draftVersion: nextVersion,
            lastDraftEditedByUserId: actor.userId,
            lastDraftEditedAt: now,
          },
        });
        if (updateResult.count !== 1) {
          throw new PhysicianVisitDraftError("DRAFT_CONFLICT");
        }
        const updated = await tx.physicianVisitRecord.findUniqueOrThrow({
          where: { id: record.id },
        });

        await tx.auditLog.create({
          data: {
            patientId: record.visit.patientId,
            entityType: "PhysicianVisitRecord",
            entityId: record.id,
            fieldName: `draftJson.sections.${command.section}`,
            action: "PHYSICIAN_VISIT_DRAFT_UPDATED",
            oldValueJson: {
              draftVersion: record.draftVersion,
              sectionPresent:
                currentDraft.sections[
                  command.section as PhysicianVisitDraftSection
                ] !== undefined,
            },
            newValueJson: {
              draftVersion: nextVersion,
              section: command.section,
            },
            changedByUserId: actor.userId,
            changedAt: now,
            reason: "Physician Visit draft section updated",
          },
        });

        return recordResponse(updated);
      },
      { isolationLevel: "Serializable" },
    );
  }
}
