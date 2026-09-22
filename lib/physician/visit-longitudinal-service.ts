import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";
import {
  assertCanCorrectFinalizedPhysicianVisit,
  type AuthenticatedActor,
} from "@/lib/auth/authorization";
import {
  PhysicianVisitLifecycleError,
} from "./visit-lifecycle-contracts";
import type {
  DiagnosisDraftDecision,
  GovernedPhysicianLongitudinalDraft,
  LongitudinalCorrectionCommand,
  ProcedureDraftDecision,
  TreatmentDraftDecision,
} from "./visit-longitudinal-contracts";
import {
  compareLongitudinalVisits,
  LongitudinalReplayError,
  projectEffectivePhysicianState,
  type ChronologicalDecisionVisit,
} from "./visit-longitudinal-projection";
import { activeDatabaseSchema } from "@/lib/local-clinician-demo";

type Db = Prisma.TransactionClient | PrismaClient;

type VisitOwnership = {
  id: string;
  patientId: string;
  clinicScopeId: string;
  clinicalEpisodeId: string;
  visitOccurredAt: Date;
};

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isAfterServerDate(value: string, serverNow: Date): boolean {
  return dateOnly(value).getTime() > Date.UTC(
    serverNow.getUTCFullYear(),
    serverNow.getUTCMonth(),
    serverNow.getUTCDate(),
  );
}

function mapReplayError(error: unknown): never {
  if (error instanceof LongitudinalReplayError) {
    throw new PhysicianVisitLifecycleError(
      error.code === "INVALID_LONGITUDINAL_TARGET"
        ? "INVALID_LONGITUDINAL_TARGET"
        : "LONGITUDINAL_DECISION_CONFLICT",
    );
  }
  throw error;
}

function treatmentData(decision: TreatmentDraftDecision) {
  if (decision.action === "START") {
    return {
      name: decision.name,
      regimenText: decision.regimenText,
      noteText: decision.noteText,
      setsName: true,
      setsRegimen: decision.regimenText !== undefined,
      setsNote: decision.noteText !== undefined,
    };
  }
  if (decision.action === "MODIFY") {
    return {
      name: decision.name,
      regimenText: decision.regimenText,
      noteText: decision.noteText,
      setsName: decision.name !== undefined,
      setsRegimen: decision.regimenText !== undefined,
      setsNote: decision.noteText !== undefined,
    };
  }
  if (decision.action === "CONTINUE_EXISTING") {
    return {
      noteText: decision.noteText,
      setsName: false,
      setsRegimen: false,
      setsNote: decision.noteText !== undefined,
    };
  }
  return { setsName: false, setsRegimen: false, setsNote: false };
}

function decisionSnapshot(record: {
  diagnosisDecisions: Array<{
    id: string;
    diagnosisId: string;
    action: string;
    text: string | null;
  }>;
  treatmentDecisions: Array<{
    id: string;
    treatmentCourseId: string;
    action: string;
    name: string | null;
    regimenText: string | null;
    noteText: string | null;
    setsName: boolean;
    setsRegimen: boolean;
    setsNote: boolean;
  }>;
  procedureDecisions: Array<{
    id: string;
    procedurePlanId: string | null;
    action: string;
    procedureCode: string | null;
    otherProcedureText: string | null;
    plannedDate: Date | null;
    performedDate: Date | null;
    noteText: string | null;
  }>;
}) {
  return {
    diagnoses: record.diagnosisDecisions.map((decision) => ({
      decisionId: decision.id,
      diagnosisId: decision.diagnosisId,
      action: decision.action,
      ...(decision.text !== null ? { text: decision.text } : {}),
    })),
    treatments: record.treatmentDecisions.map((decision) => ({
      decisionId: decision.id,
      treatmentCourseId: decision.treatmentCourseId,
      action: decision.action,
      ...(decision.setsName ? { name: decision.name } : {}),
      ...(decision.setsRegimen ? { regimenText: decision.regimenText } : {}),
      ...(decision.setsNote ? { noteText: decision.noteText } : {}),
    })),
    procedures: record.procedureDecisions.map((decision) => ({
      decisionId: decision.id,
      action: decision.action,
      ...(decision.procedurePlanId ? { procedurePlanId: decision.procedurePlanId } : {}),
      ...(decision.procedureCode ? { procedureCode: decision.procedureCode } : {}),
      ...(decision.otherProcedureText !== null
        ? { otherProcedureText: decision.otherProcedureText }
        : {}),
      ...(decision.plannedDate
        ? { plannedDate: decision.plannedDate.toISOString().slice(0, 10) }
        : {}),
      ...(decision.performedDate
        ? { performedDate: decision.performedDate.toISOString().slice(0, 10) }
        : {}),
      ...(decision.noteText !== null ? { noteText: decision.noteText } : {}),
    })),
  };
}

export async function loadLongitudinalDecisionVisits(
  db: Db,
  clinicalEpisodeId: string,
  includeDraftRecordId?: string,
): Promise<ChronologicalDecisionVisit[]> {
  const visits = await db.visit.findMany({
    where: {
      clinicalEpisodeId,
      visitOccurredAt: { not: null },
      physicianVisitRecord: {
        is: includeDraftRecordId
          ? { OR: [{ status: "FINALIZED" }, { id: includeDraftRecordId }] }
          : { status: "FINALIZED" },
      },
    },
    select: {
      id: true,
      visitOccurredAt: true,
      physicianVisitRecord: {
        select: {
          id: true,
          diagnosisDecisions: { orderBy: [{ decisionOrder: "asc" }, { id: "asc" }] },
          treatmentDecisions: { orderBy: [{ decisionOrder: "asc" }, { id: "asc" }] },
          procedureDecisions: { orderBy: [{ decisionOrder: "asc" }, { id: "asc" }] },
        },
      },
    },
  });
  return visits
    .filter(
      (visit): visit is typeof visit & {
        visitOccurredAt: Date;
        physicianVisitRecord: NonNullable<typeof visit.physicianVisitRecord>;
      } => Boolean(visit.visitOccurredAt && visit.physicianVisitRecord),
    )
    .map((visit) => ({
      visitId: visit.id,
      physicianVisitRecordId: visit.physicianVisitRecord.id,
      visitOccurredAt: visit.visitOccurredAt,
      diagnoses: visit.physicianVisitRecord.diagnosisDecisions,
      treatments: visit.physicianVisitRecord.treatmentDecisions,
      procedures: visit.physicianVisitRecord.procedureDecisions,
    }))
    .sort(compareLongitudinalVisits);
}

async function requireDiagnosis(
  tx: Prisma.TransactionClient,
  ownership: VisitOwnership,
  diagnosisId: string,
) {
  const diagnosis = await tx.physicianDiagnosis.findFirst({
    where: {
      id: diagnosisId,
      clinicalEpisodeId: ownership.clinicalEpisodeId,
      patientId: ownership.patientId,
      clinicScopeId: ownership.clinicScopeId,
    },
  });
  if (!diagnosis) {
    throw new PhysicianVisitLifecycleError("INVALID_LONGITUDINAL_TARGET");
  }
  return diagnosis;
}

async function requireTreatment(
  tx: Prisma.TransactionClient,
  ownership: VisitOwnership,
  treatmentCourseId: string,
) {
  const course = await tx.physicianTreatmentCourse.findFirst({
    where: {
      id: treatmentCourseId,
      clinicalEpisodeId: ownership.clinicalEpisodeId,
      patientId: ownership.patientId,
      clinicScopeId: ownership.clinicScopeId,
    },
  });
  if (!course) {
    throw new PhysicianVisitLifecycleError("INVALID_LONGITUDINAL_TARGET");
  }
  return course;
}

async function requireProcedurePlan(
  tx: Prisma.TransactionClient,
  ownership: VisitOwnership,
  procedurePlanId: string,
) {
  const plan = await tx.physicianProcedurePlan.findFirst({
    where: {
      id: procedurePlanId,
      clinicalEpisodeId: ownership.clinicalEpisodeId,
      patientId: ownership.patientId,
      clinicScopeId: ownership.clinicScopeId,
    },
    include: {
      decisions: {
        where: { action: "PLAN" },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
  if (!plan || !plan.decisions[0]?.procedureCode) {
    throw new PhysicianVisitLifecycleError("INVALID_LONGITUDINAL_TARGET");
  }
  return plan;
}

function assertNoDuplicateTargets(draft: GovernedPhysicianLongitudinalDraft) {
  const diagnosisTargets = draft.diagnoses
    ?.filter((decision) => decision.action !== "ADD")
    .map((decision) => decision.diagnosisId) ?? [];
  const treatmentTargets = draft.treatments
    ?.filter((decision) => decision.action !== "START")
    .map((decision) => decision.treatmentCourseId) ?? [];
  const procedureTargets = draft.procedures
    ?.filter(
      (decision): decision is Exclude<ProcedureDraftDecision, { action: "PLAN" }> =>
        decision.action !== "PLAN" && "procedurePlanId" in decision && Boolean(decision.procedurePlanId),
    )
    .map((decision) => decision.procedurePlanId!) ?? [];
  if (
    new Set(diagnosisTargets).size !== diagnosisTargets.length ||
    new Set(treatmentTargets).size !== treatmentTargets.length ||
    new Set(procedureTargets).size !== procedureTargets.length
  ) {
    throw new PhysicianVisitLifecycleError("LONGITUDINAL_DECISION_CONFLICT");
  }
}

export async function materializeGovernedLongitudinalDraft(
  tx: Prisma.TransactionClient,
  physicianVisitRecordId: string,
  ownership: VisitOwnership,
  draft: GovernedPhysicianLongitudinalDraft,
  serverNow: Date,
) {
  assertNoDuplicateTargets(draft);
  let diagnosisRows = 0;
  let treatmentRows = 0;
  let procedureRows = 0;
  let diagnosisIdentityRows = 0;
  let treatmentCourseRows = 0;
  let procedurePlanRows = 0;

  for (const [decisionOrder, decision] of (draft.diagnoses ?? []).entries()) {
    const diagnosis = decision.action === "ADD"
      ? await tx.physicianDiagnosis.create({
          data: {
            clinicalEpisodeId: ownership.clinicalEpisodeId,
            patientId: ownership.patientId,
            clinicScopeId: ownership.clinicScopeId,
          },
        })
      : await requireDiagnosis(tx, ownership, decision.diagnosisId);
    if (decision.action === "ADD") diagnosisIdentityRows += 1;
    await tx.physicianDiagnosisDecision.create({
      data: {
        physicianVisitRecordId,
        visitId: ownership.id,
        diagnosisId: diagnosis.id,
        clinicalEpisodeId: ownership.clinicalEpisodeId,
        patientId: ownership.patientId,
        clinicScopeId: ownership.clinicScopeId,
        action: decision.action,
        text: decision.action === "RESOLVE" ? null : decision.text,
        decisionOrder,
      },
    });
    diagnosisRows += 1;
  }

  for (const [decisionOrder, decision] of (draft.treatments ?? []).entries()) {
    const course = decision.action === "START"
      ? await tx.physicianTreatmentCourse.create({
          data: {
            clinicalEpisodeId: ownership.clinicalEpisodeId,
            patientId: ownership.patientId,
            clinicScopeId: ownership.clinicScopeId,
          },
        })
      : await requireTreatment(tx, ownership, decision.treatmentCourseId);
    if (decision.action === "START") treatmentCourseRows += 1;
    await tx.physicianTreatmentDecision.create({
      data: {
        physicianVisitRecordId,
        visitId: ownership.id,
        treatmentCourseId: course.id,
        clinicalEpisodeId: ownership.clinicalEpisodeId,
        patientId: ownership.patientId,
        clinicScopeId: ownership.clinicScopeId,
        action: decision.action,
        ...treatmentData(decision),
        decisionOrder,
      },
    });
    treatmentRows += 1;
  }

  for (const [decisionOrder, decision] of (draft.procedures ?? []).entries()) {
    let planId: string | undefined;
    let code = "procedureCode" in decision ? decision.procedureCode : undefined;
    let other = "otherProcedureText" in decision
      ? decision.otherProcedureText
      : undefined;
    if (decision.action === "PLAN") {
      const plan = await tx.physicianProcedurePlan.create({
        data: {
          clinicalEpisodeId: ownership.clinicalEpisodeId,
          patientId: ownership.patientId,
          clinicScopeId: ownership.clinicScopeId,
        },
      });
      planId = plan.id;
      procedurePlanRows += 1;
    } else if (decision.procedurePlanId) {
      const plan = await requireProcedurePlan(tx, ownership, decision.procedurePlanId);
      planId = plan.id;
      if (decision.action === "PERFORM") {
        const planned = plan.decisions[0]!;
        if (code !== undefined && code !== planned.procedureCode) {
          throw new PhysicianVisitLifecycleError("INVALID_LONGITUDINAL_TARGET");
        }
        code = planned.procedureCode!;
        other = planned.otherProcedureText ?? undefined;
      }
    }
    if (decision.action === "PERFORM" && isAfterServerDate(decision.performedDate, serverNow)) {
      throw new PhysicianVisitLifecycleError("INVALID_CLINICAL_DATA");
    }
    await tx.physicianProcedureDecision.create({
      data: {
        physicianVisitRecordId,
        visitId: ownership.id,
        procedurePlanId: planId,
        clinicalEpisodeId: ownership.clinicalEpisodeId,
        patientId: ownership.patientId,
        clinicScopeId: ownership.clinicScopeId,
        action: decision.action,
        procedureCode: code,
        otherProcedureText: other,
        plannedDate:
          decision.action === "PLAN" && decision.plannedDate
            ? dateOnly(decision.plannedDate)
            : undefined,
        performedDate:
          decision.action === "PERFORM" ? dateOnly(decision.performedDate) : undefined,
        noteText: decision.noteText,
        decisionOrder,
      },
    });
    procedureRows += 1;
  }

  try {
    projectEffectivePhysicianState(
      await loadLongitudinalDecisionVisits(
        tx,
        ownership.clinicalEpisodeId,
        physicianVisitRecordId,
      ),
    );
  } catch (error) {
    mapReplayError(error);
  }

  return {
    diagnosisIdentityRows,
    diagnosisDecisionRows: diagnosisRows,
    treatmentCourseRows,
    treatmentDecisionRows: treatmentRows,
    procedurePlanRows,
    procedureDecisionRows: procedureRows,
  };
}

export class PhysicianVisitLongitudinalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
    private readonly databaseSchema = activeDatabaseSchema(),
  ) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(databaseSchema)) {
      throw new PhysicianVisitLifecycleError("INVALID_REQUEST");
    }
  }

  async readForVisit(actor: AuthenticatedActor, visitId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, clinicScopeId: actor.clinicScopeId },
      select: {
        id: true,
        clinicalEpisodeId: true,
        visitOccurredAt: true,
        physicianVisitRecord: {
          select: {
            id: true,
            status: true,
            diagnosisDecisions: { orderBy: [{ decisionOrder: "asc" }, { id: "asc" }] },
            treatmentDecisions: { orderBy: [{ decisionOrder: "asc" }, { id: "asc" }] },
            procedureDecisions: { orderBy: [{ decisionOrder: "asc" }, { id: "asc" }] },
          },
        },
      },
    });
    if (!visit) throw new PhysicianVisitLifecycleError("VISIT_NOT_FOUND");
    if (!visit.clinicalEpisodeId || !visit.physicianVisitRecord) {
      throw new PhysicianVisitLifecycleError("EPISODE_MISMATCH");
    }
    let chronological = await loadLongitudinalDecisionVisits(
      this.prisma,
      visit.clinicalEpisodeId,
    );
    if (visit.physicianVisitRecord.status === "DRAFT" && visit.visitOccurredAt) {
      const boundary = {
        visitId: visit.id,
        physicianVisitRecordId: visit.physicianVisitRecord.id,
        visitOccurredAt: visit.visitOccurredAt,
        diagnoses: [],
        treatments: [],
        procedures: [],
      } satisfies ChronologicalDecisionVisit;
      chronological = chronological.filter(
        (candidate) => compareLongitudinalVisits(candidate, boundary) < 0,
      );
    }
    let effectivePhysicianState;
    try {
      effectivePhysicianState = projectEffectivePhysicianState(chronological);
    } catch (error) {
      mapReplayError(error);
    }
    return {
      visitDecisions:
        visit.physicianVisitRecord.status === "FINALIZED"
          ? decisionSnapshot(visit.physicianVisitRecord)
          : { diagnoses: [], treatments: [], procedures: [] },
      effectivePhysicianState,
    };
  }

  async correct(
    actor: AuthenticatedActor,
    visitId: string,
    command: LongitudinalCorrectionCommand,
  ) {
    assertCanCorrectFinalizedPhysicianVisit(actor);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const lockedVisit = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM ${Prisma.raw(`"${this.databaseSchema}"."Visit"`)}
          WHERE "id" = ${visitId}::uuid
            AND "clinicScopeId" = ${actor.clinicScopeId}::uuid
          FOR UPDATE
        `;
        if (lockedVisit.length !== 1) {
          throw new PhysicianVisitLifecycleError("VISIT_NOT_FOUND");
        }
        const visit = await tx.visit.findUniqueOrThrow({
          where: { id: visitId },
          include: { physicianVisitRecord: true, clinicalEpisode: true },
        });
        if (
          !visit.physicianVisitRecord ||
          visit.physicianVisitRecord.status !== "FINALIZED"
        ) {
          throw new PhysicianVisitLifecycleError("PHYSICIAN_VISIT_NOT_FINALIZED");
        }
        if (
          !visit.visitOccurredAt ||
          !visit.clinicalEpisodeId ||
          !visit.clinicScopeId ||
          !visit.clinicalEpisode ||
          visit.clinicalEpisode.patientId !== visit.patientId ||
          visit.clinicalEpisode.clinicScopeId !== visit.clinicScopeId
        ) {
          throw new PhysicianVisitLifecycleError("EPISODE_MISMATCH");
        }
        if (
          this.now().getTime() >=
          visit.visitOccurredAt.getTime() + 24 * 60 * 60 * 1_000
        ) {
          throw new PhysicianVisitLifecycleError("VISIT_CORRECTION_WINDOW_CLOSED");
        }
        await tx.$queryRaw`
          SELECT "id" FROM ${Prisma.raw(`"${this.databaseSchema}"."ClinicalEpisode"`)}
          WHERE "id" = ${visit.clinicalEpisodeId}::uuid FOR UPDATE
        `;
        const ownership: VisitOwnership = {
          id: visit.id,
          patientId: visit.patientId,
          clinicScopeId: visit.clinicScopeId,
          clinicalEpisodeId: visit.clinicalEpisodeId,
          visitOccurredAt: visit.visitOccurredAt,
        };
        const recordId = visit.physicianVisitRecord.id;
        const oldValue = await this.readDecision(tx, recordId, command);
        if (!oldValue) {
          throw new PhysicianVisitLifecycleError("INVALID_LONGITUDINAL_TARGET");
        }
        if (command.operation === "SET_CONTENT") {
          await this.updateDecisionContent(tx, oldValue, command);
        } else {
          await this.omitDecision(tx, oldValue);
          if (command.replacement) {
            await this.createReplacement(
              tx,
              recordId,
              ownership,
              oldValue.decisionOrder,
              command,
            );
          }
        }
        try {
          projectEffectivePhysicianState(
            await loadLongitudinalDecisionVisits(tx, visit.clinicalEpisodeId),
          );
        } catch (error) {
          if (error instanceof LongitudinalReplayError) {
            throw new PhysicianVisitLifecycleError(
              command.operation === "OMIT"
                ? "DEPENDENT_LONGITUDINAL_DECISIONS"
                : error.code,
            );
          }
          throw error;
        }
        const newValue = command.operation === "OMIT"
          ? command.replacement ?? undefined
          : await this.readDecision(tx, recordId, command);
        const changedAt = this.now();
        const audit = await tx.auditLog.create({
          data: {
            patientId: visit.patientId,
            entityType: "PhysicianLongitudinalDecisionCorrection",
            entityId: command.decisionId,
            fieldName: command.target,
            action: "PHYSICIAN_CLINICAL_CORRECTION",
            oldValueJson: oldValue as unknown as Prisma.InputJsonValue,
            newValueJson:
              newValue === undefined
                ? { recorded: false }
                : (newValue as unknown as Prisma.InputJsonValue),
            changedByUserId: actor.userId,
            changedAt,
            reason: "Governed FPV-4 longitudinal decision correction",
          },
        });
        return {
          visitId,
          target: command.target,
          decisionId: command.decisionId,
          operation: command.operation,
          correctedAt: changedAt,
          auditLogId: audit.id,
        };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        (typeof error === "object" && error !== null && "code" in error &&
          (error as { code?: unknown }).code === "P2003") ||
        message.includes("violates foreign key constraint")
      ) {
        throw new PhysicianVisitLifecycleError("DEPENDENT_LONGITUDINAL_DECISIONS");
      }
      if (
        message.includes("FPV-4 hard lock") ||
        message.includes("FPV-3 hard lock: canonical clinical correction window is closed")
      ) {
        throw new PhysicianVisitLifecycleError("VISIT_CORRECTION_WINDOW_CLOSED");
      }
      throw error;
    }
  }

  private async readDecision(
    tx: Prisma.TransactionClient,
    physicianVisitRecordId: string,
    command: LongitudinalCorrectionCommand,
  ): Promise<(Record<string, unknown> & { id: string; action: string; decisionOrder: number }) | null> {
    const where = { id: command.decisionId, physicianVisitRecordId };
    if (command.target === "DIAGNOSIS_DECISION") {
      return tx.physicianDiagnosisDecision.findFirst({ where });
    }
    if (command.target === "TREATMENT_DECISION") {
      return tx.physicianTreatmentDecision.findFirst({ where });
    }
    return tx.physicianProcedureDecision.findFirst({ where });
  }

  private async updateDecisionContent(
    tx: Prisma.TransactionClient,
    existing: Record<string, unknown> & { id: string; action: string },
    command: Extract<LongitudinalCorrectionCommand, { operation: "SET_CONTENT" }>,
  ) {
    if (command.target === "DIAGNOSIS_DECISION") {
      if (existing.action === "RESOLVE") {
        throw new PhysicianVisitLifecycleError("UNAPPROVED_CORRECTION_TARGET");
      }
      await tx.physicianDiagnosisDecision.update({
        where: { id: existing.id },
        data: { text: command.value.text },
      });
      return;
    }
    if (command.target === "TREATMENT_DECISION") {
      const allowed = existing.action === "START"
        ? new Set(["name", "regimenText", "noteText"])
        : existing.action === "MODIFY"
          ? new Set(["name", "regimenText", "noteText"])
          : existing.action === "CONTINUE_EXISTING"
            ? new Set(["noteText"])
            : new Set<string>();
      if (Object.keys(command.value).some((key) => !allowed.has(key))) {
        throw new PhysicianVisitLifecycleError("UNAPPROVED_CORRECTION_TARGET");
      }
      const value = command.value;
      await tx.physicianTreatmentDecision.update({
        where: { id: existing.id },
        data: {
          ...(value.name !== undefined ? { name: value.name, setsName: true } : {}),
          ...(value.regimenText !== undefined
            ? { regimenText: value.regimenText, setsRegimen: true }
            : {}),
          ...(value.noteText !== undefined
            ? { noteText: value.noteText, setsNote: true }
            : {}),
        },
      });
      return;
    }
    const linked = Boolean(existing.procedurePlanId) && existing.action === "PERFORM";
    const allowed = existing.action === "PLAN"
      ? new Set(["procedureCode", "otherProcedureText", "plannedDate", "noteText"])
      : existing.action === "PERFORM"
        ? linked
          ? new Set(["performedDate", "noteText"])
          : new Set(["procedureCode", "otherProcedureText", "performedDate", "noteText"])
        : new Set(["noteText"]);
    if (Object.keys(command.value).some((key) => !allowed.has(key))) {
      throw new PhysicianVisitLifecycleError("UNAPPROVED_CORRECTION_TARGET");
    }
    const value = command.value;
    const nextCode = value.procedureCode ?? existing.procedureCode;
    const nextOther = value.otherProcedureText !== undefined
      ? value.otherProcedureText
      : existing.otherProcedureText;
    if (
      nextCode === "OTHER"
        ? typeof nextOther !== "string" || nextOther.trim().length === 0
        : nextOther !== null && nextOther !== undefined
    ) {
      throw new PhysicianVisitLifecycleError("INVALID_CLINICAL_DATA");
    }
    if (value.performedDate && isAfterServerDate(value.performedDate, this.now())) {
      throw new PhysicianVisitLifecycleError("INVALID_CLINICAL_DATA");
    }
    await tx.physicianProcedureDecision.update({
      where: { id: existing.id },
      data: {
        ...(value.procedureCode !== undefined ? { procedureCode: value.procedureCode } : {}),
        ...(value.otherProcedureText !== undefined
          ? { otherProcedureText: value.otherProcedureText }
          : {}),
        ...(value.plannedDate !== undefined
          ? { plannedDate: value.plannedDate ? dateOnly(value.plannedDate) : null }
          : {}),
        ...(value.performedDate !== undefined
          ? { performedDate: dateOnly(value.performedDate) }
          : {}),
        ...(value.noteText !== undefined ? { noteText: value.noteText } : {}),
      },
    });
  }

  private async omitDecision(
    tx: Prisma.TransactionClient,
    existing: Record<string, unknown> & { id: string; action: string },
  ) {
    if ("diagnosisId" in existing) {
      const identityId = existing.diagnosisId as string;
      await tx.physicianDiagnosisDecision.delete({ where: { id: existing.id } });
      if (existing.action === "ADD") {
        await tx.physicianDiagnosis.delete({ where: { id: identityId } });
      }
    } else if ("treatmentCourseId" in existing) {
      const identityId = existing.treatmentCourseId as string;
      await tx.physicianTreatmentDecision.delete({ where: { id: existing.id } });
      if (existing.action === "START") {
        await tx.physicianTreatmentCourse.delete({ where: { id: identityId } });
      }
    } else {
      const identityId = existing.procedurePlanId as string | null;
      await tx.physicianProcedureDecision.delete({ where: { id: existing.id } });
      if (existing.action === "PLAN" && identityId) {
        await tx.physicianProcedurePlan.delete({ where: { id: identityId } });
      }
    }
  }

  private async createReplacement(
    tx: Prisma.TransactionClient,
    physicianVisitRecordId: string,
    ownership: VisitOwnership,
    decisionOrder: number,
    command: Extract<LongitudinalCorrectionCommand, { operation: "OMIT" }>,
  ) {
    const replacement = command.replacement!;
    if (command.target === "DIAGNOSIS_DECISION") {
      const diagnosisReplacement = replacement as DiagnosisDraftDecision;
      const diagnosis = diagnosisReplacement.action === "ADD"
        ? await tx.physicianDiagnosis.create({ data: {
            clinicalEpisodeId: ownership.clinicalEpisodeId,
            patientId: ownership.patientId,
            clinicScopeId: ownership.clinicScopeId,
          } })
        : await requireDiagnosis(tx, ownership, diagnosisReplacement.diagnosisId);
      await tx.physicianDiagnosisDecision.create({ data: {
        physicianVisitRecordId,
        visitId: ownership.id,
        diagnosisId: diagnosis.id,
        clinicalEpisodeId: ownership.clinicalEpisodeId,
        patientId: ownership.patientId,
        clinicScopeId: ownership.clinicScopeId,
        action: diagnosisReplacement.action,
        text: diagnosisReplacement.action === "RESOLVE" ? null : diagnosisReplacement.text,
        decisionOrder,
      } });
      return;
    }
    if (command.target === "TREATMENT_DECISION") {
      const treatmentReplacement = replacement as TreatmentDraftDecision;
      const course = treatmentReplacement.action === "START"
        ? await tx.physicianTreatmentCourse.create({ data: {
            clinicalEpisodeId: ownership.clinicalEpisodeId,
            patientId: ownership.patientId,
            clinicScopeId: ownership.clinicScopeId,
          } })
        : await requireTreatment(tx, ownership, treatmentReplacement.treatmentCourseId);
      await tx.physicianTreatmentDecision.create({ data: {
        physicianVisitRecordId,
        visitId: ownership.id,
        treatmentCourseId: course.id,
        clinicalEpisodeId: ownership.clinicalEpisodeId,
        patientId: ownership.patientId,
        clinicScopeId: ownership.clinicScopeId,
        action: treatmentReplacement.action,
        ...treatmentData(treatmentReplacement),
        decisionOrder,
      } });
      return;
    }
    const procedureReplacement = replacement as ProcedureDraftDecision;
    let procedurePlanId: string | undefined;
    let code = "procedureCode" in procedureReplacement ? procedureReplacement.procedureCode : undefined;
    let other = "otherProcedureText" in procedureReplacement
      ? procedureReplacement.otherProcedureText
      : undefined;
    if (procedureReplacement.action === "PLAN") {
      const plan = await tx.physicianProcedurePlan.create({ data: {
        clinicalEpisodeId: ownership.clinicalEpisodeId,
        patientId: ownership.patientId,
        clinicScopeId: ownership.clinicScopeId,
      } });
      procedurePlanId = plan.id;
    } else if (procedureReplacement.procedurePlanId) {
      const plan = await requireProcedurePlan(tx, ownership, procedureReplacement.procedurePlanId);
      procedurePlanId = plan.id;
      if (procedureReplacement.action === "PERFORM") {
        code = plan.decisions[0]!.procedureCode!;
        other = plan.decisions[0]!.otherProcedureText ?? undefined;
      }
    }
    if (procedureReplacement.action === "PERFORM" && isAfterServerDate(procedureReplacement.performedDate, this.now())) {
      throw new PhysicianVisitLifecycleError("INVALID_CLINICAL_DATA");
    }
    await tx.physicianProcedureDecision.create({ data: {
      physicianVisitRecordId,
      visitId: ownership.id,
      procedurePlanId,
      clinicalEpisodeId: ownership.clinicalEpisodeId,
      patientId: ownership.patientId,
      clinicScopeId: ownership.clinicScopeId,
      action: procedureReplacement.action,
      procedureCode: code,
      otherProcedureText: other,
      plannedDate: procedureReplacement.action === "PLAN" && procedureReplacement.plannedDate
        ? dateOnly(procedureReplacement.plannedDate)
        : undefined,
      performedDate: procedureReplacement.action === "PERFORM"
        ? dateOnly(procedureReplacement.performedDate)
        : undefined,
      noteText: procedureReplacement.noteText,
      decisionOrder,
    } });
  }
}
