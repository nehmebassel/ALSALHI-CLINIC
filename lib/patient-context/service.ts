import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";
import {
  assertCanReadCanonicalPhysicianVisit,
  assertCanCorrectFinalizedPhysicianVisit,
  type AuthenticatedActor,
} from "@/lib/auth/authorization";
import type { EvaluatedOfficialState } from "@/lib/submission/service";
import {
  PATIENT_CONTEXT_DEFINITION_CODES,
  type PatientContextDefinitionCode,
} from "@/lib/physician/visit-longitudinal-contracts";
import { PhysicianVisitLifecycleError } from "@/lib/physician/visit-lifecycle-contracts";

const DEFINITIONS: ReadonlyArray<{
  code: PatientContextDefinitionCode;
  valueKind: "SCALAR" | "STRUCTURED" | "LIST";
  sourceQuestionCodes: readonly string[];
}> = [
  {
    code: "MARITAL_SOCIAL_STATUS",
    valueKind: "SCALAR",
    sourceQuestionCodes: ["Q_PROFILE_MARITAL_STATUS"],
  },
  {
    code: "CONTRACEPTIVE_USE",
    valueKind: "STRUCTURED",
    sourceQuestionCodes: [
      "Q_WOMEN_CONTRACEPTION_STATUS",
      "Q_WOMEN_CONTRACEPTION_TYPE",
      "Q_WOMEN_CONTRACEPTION_NAME",
    ],
  },
  {
    code: "PREGNANCY_BREASTFEEDING_CONTEXT",
    valueKind: "STRUCTURED",
    sourceQuestionCodes: [
      "Q_PREGNANCY_BREASTFEEDING_STATUS",
      "Q_PREGNANCY_MONTH",
      "Q_BREASTFEEDING_ONSET",
    ],
  },
  {
    code: "PREVIOUSLY_DIAGNOSED_CONDITIONS",
    valueKind: "LIST",
    sourceQuestionCodes: [
      "Q_HEALTH_CHRONIC_ITEMS",
      "Q_HEALTH_TUMOR_ITEMS",
      "Q_PRIOR_DIAGNOSES",
      "Q_PRIOR_DIAGNOSIS_DETAILS",
      "Q_PRIOR_DIAGNOSIS_OTHER",
    ],
  },
  {
    code: "CURRENT_MEDICATIONS",
    valueKind: "LIST",
    sourceQuestionCodes: ["Q_HEALTH_MEDICATION_ITEMS"],
  },
  {
    code: "ALLERGIES",
    valueKind: "LIST",
    sourceQuestionCodes: ["Q_HEALTH_ALLERGY_ITEMS"],
  },
  {
    code: "PREVIOUS_HAIR_THERAPIES",
    valueKind: "LIST",
    sourceQuestionCodes: [
      "Q_HAIR_TREATMENT_ITEMS",
      "Q_HAIR_PROCEDURES",
      "Q_HAIR_PROCEDURE_DETAILS",
    ],
  },
  {
    code: "CURRENT_HAIR_THERAPIES",
    valueKind: "LIST",
    sourceQuestionCodes: ["Q_HAIR_TREATMENT_ITEMS"],
  },
];

type ResponseValue = {
  questionCode: string;
  value: Prisma.InputJsonValue;
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function subtype(questionCode: string): string | undefined {
  if (questionCode === "Q_HEALTH_CHRONIC_ITEMS") return "CHRONIC_CONDITION";
  if (questionCode === "Q_HEALTH_TUMOR_ITEMS") return "TUMOR_HISTORY";
  if (questionCode.startsWith("Q_PRIOR_DIAGNOS")) {
    return "HAIR_SCALP_PRIOR_DIAGNOSIS";
  }
  if (questionCode === "Q_HAIR_TREATMENT_ITEMS") {
    return "HAIR_SCALP_MEDICATION_OR_TREATMENT";
  }
  if (
    questionCode === "Q_HAIR_PROCEDURES" ||
    questionCode === "Q_HAIR_PROCEDURE_DETAILS"
  ) {
    return "HAIR_SCALP_PROCEDURE";
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, Prisma.InputJsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hairTreatmentIsCurrent(value: Prisma.InputJsonValue): boolean {
  return isRecord(value) && value.stillUsing === "YES";
}

function buildPayload(
  code: PatientContextDefinitionCode,
  values: ResponseValue[],
): Prisma.InputJsonObject {
  if (code === "MARITAL_SOCIAL_STATUS") {
    return { value: values.at(-1)?.value ?? null };
  }
  if (
    code === "CONTRACEPTIVE_USE" ||
    code === "PREGNANCY_BREASTFEEDING_CONTEXT"
  ) {
    return {
      fields: values
        .sort((left, right) => compareStrings(left.questionCode, right.questionCode))
        .map(({ questionCode, value }) => ({ questionCode, value })),
    };
  }
  let selected = values;
  if (code === "CURRENT_HAIR_THERAPIES") {
    selected = values.filter(
      ({ questionCode, value }) =>
        questionCode === "Q_HAIR_TREATMENT_ITEMS" &&
        hairTreatmentIsCurrent(value),
    );
  } else if (code === "PREVIOUS_HAIR_THERAPIES") {
    selected = values.filter(
      ({ questionCode, value }) =>
        questionCode !== "Q_HAIR_TREATMENT_ITEMS" ||
        !hairTreatmentIsCurrent(value),
    );
  }
  return {
    items: selected.map(({ questionCode, value }) => ({
      questionCode,
      ...(subtype(questionCode) ? { subtype: subtype(questionCode)! } : {}),
      value,
    })),
  };
}

export function patientContextRegistry() {
  return DEFINITIONS.map(({ code, valueKind, sourceQuestionCodes }) => ({
    code,
    valueKind,
    payloadSchemaVersion: "FPV4_PATIENT_CONTEXT_V1",
    sourceQuestionCodes: [...sourceQuestionCodes],
  }));
}

export async function persistPatientContextFromOfficialState(
  tx: Prisma.TransactionClient,
  input: {
    patientId: string;
    clinicScopeId: string;
    visitId: string;
    clinicalInterviewId: string;
    officialState: EvaluatedOfficialState;
    sourceUpdatedAt: Date;
  },
) {
  const questionIds = input.officialState.questionResponses.map(
    ({ questionDefinitionId }) => questionDefinitionId,
  );
  const definitions = await tx.questionDefinition.findMany({
    where: { id: { in: questionIds } },
    select: { id: true, code: true },
  });
  const codeById = new Map(definitions.map(({ id, code }) => [id, code]));
  const responses = input.officialState.questionResponses
    .map((response) => ({
      questionCode: codeById.get(response.questionDefinitionId),
      value: response.valueJson,
    }))
    .filter(
      (response): response is ResponseValue =>
        typeof response.questionCode === "string",
    );

  const [registryRows, previous, sequence, sourceVisit] = await Promise.all([
    tx.patientContextDefinition.findMany({
      where: { code: { in: [...PATIENT_CONTEXT_DEFINITION_CODES] }, isActive: true },
    }),
    tx.patientContextVersion.findFirst({
      where: {
        patientId: input.patientId,
        sourceVisit: {
          patientId: input.patientId,
          clinicScopeId: input.clinicScopeId,
        },
      },
      orderBy: { sequence: "desc" },
      include: {
        items: {
          where: {
            sourceVisit: {
              patientId: input.patientId,
              clinicScopeId: input.clinicScopeId,
            },
          },
          include: { definition: true },
        },
      },
    }),
    tx.patientContextVersion.aggregate({
      where: { patientId: input.patientId },
      _max: { sequence: true },
    }),
    tx.visit.findFirst({
      where: {
        id: input.visitId,
        patientId: input.patientId,
        clinicScopeId: input.clinicScopeId,
        clinicalInterview: { id: input.clinicalInterviewId },
      },
      select: { id: true },
    }),
  ]);
  if (
    registryRows.length !== PATIENT_CONTEXT_DEFINITION_CODES.length ||
    !sourceVisit
  ) {
    throw new PhysicianVisitLifecycleError("INVALID_CLINICAL_DATA");
  }
  const registry = new Map(registryRows.map((row) => [row.code, row]));
  const previousByCode = new Map(
    previous?.items.map((item) => [item.definition.code, item]) ?? [],
  );

  const items: Array<{
    definitionId: string;
    payloadJson: Prisma.InputJsonValue;
    itemFingerprint: string;
    sourceQuestionCodes: string[];
    sourceVisitId: string;
    sourceClinicalInterviewId: string;
    sourceUpdatedAt: Date;
  }> = [];
  for (const definition of DEFINITIONS) {
    const currentValues = responses.filter((response) =>
      definition.sourceQuestionCodes.includes(response.questionCode),
    );
    if (currentValues.length === 0) {
      const carried = previousByCode.get(definition.code);
      if (carried) {
        items.push({
            definitionId: registry.get(definition.code)!.id,
            payloadJson: carried.payloadJson as Prisma.InputJsonValue,
            itemFingerprint: carried.itemFingerprint,
            sourceQuestionCodes: carried.sourceQuestionCodes,
            sourceVisitId: carried.sourceVisitId,
            sourceClinicalInterviewId: carried.sourceClinicalInterviewId,
            sourceUpdatedAt: carried.sourceUpdatedAt,
        });
      }
      continue;
    }
    const payloadJson = buildPayload(definition.code, currentValues);
    items.push({
      definitionId: registry.get(definition.code)!.id,
      payloadJson,
      itemFingerprint: sha256({ code: definition.code, payloadJson }),
      sourceQuestionCodes: [...new Set(currentValues.map(({ questionCode }) => questionCode))].sort(compareStrings),
      sourceVisitId: input.visitId,
      sourceClinicalInterviewId: input.clinicalInterviewId,
      sourceUpdatedAt: input.sourceUpdatedAt,
    });
  }
  const fingerprint = sha256(
    items
      .map((item) => ({
        code: registryRows.find((row) => row.id === item.definitionId)!.code,
        itemFingerprint: item.itemFingerprint,
      }))
      .sort((left, right) => compareStrings(left.code, right.code)),
  );
  if (previous?.fingerprint === fingerprint) return previous;
  return tx.patientContextVersion.create({
    data: {
      patientId: input.patientId,
      sourceVisitId: input.visitId,
      sourceClinicalInterviewId: input.clinicalInterviewId,
      sequence: (sequence._max.sequence ?? 0) + 1,
      fingerprint,
      items: { create: items },
    },
  });
}

export class PatientContextService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async readCurrent(actor: AuthenticatedActor, patientId: string) {
    assertCanReadCanonicalPhysicianVisit(actor);
    const version = await this.prisma.patientContextVersion.findFirst({
      where: {
        patientId,
        sourceVisit: { clinicScopeId: actor.clinicScopeId },
      },
      orderBy: { sequence: "desc" },
      include: {
        items: {
          where: {
            sourceVisit: {
              patientId,
              clinicScopeId: actor.clinicScopeId,
            },
          },
          include: {
            definition: true,
            reconciliations: {
              where: { visit: { clinicScopeId: actor.clinicScopeId } },
              orderBy: { reconciledAt: "desc" },
              take: 1,
            },
          },
        },
        reviews: {
          where: { visit: { clinicScopeId: actor.clinicScopeId } },
          orderBy: { reviewedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!version) {
      return { patientId, contextVersion: null, fingerprint: null, items: [] };
    }
    return {
      patientId,
      contextVersion: version.sequence,
      fingerprint: version.fingerprint,
      createdAt: version.createdAt,
      latestReview: version.reviews[0] ?? null,
      items: version.items
        .sort((left, right) => compareStrings(left.definition.code, right.definition.code))
        .map((item) => ({
          id: item.id,
          code: item.definition.code,
          source: item.sourceType,
          value: item.payloadJson,
          sourceQuestionCodes: item.sourceQuestionCodes,
          sourceVisitId: item.sourceVisitId,
          sourceUpdatedAt: item.sourceUpdatedAt,
          fingerprint: item.itemFingerprint,
          latestReconciliation: item.reconciliations[0] ?? null,
        })),
    };
  }

  async review(
    actor: AuthenticatedActor,
    visitId: string,
    contextFingerprint: string,
  ) {
    assertCanCorrectFinalizedPhysicianVisit(actor);
    return this.recordEvidence(actor, visitId, contextFingerprint, undefined);
  }

  async reconcile(
    actor: AuthenticatedActor,
    visitId: string,
    contextFingerprint: string,
    contextItemId: string,
  ) {
    assertCanCorrectFinalizedPhysicianVisit(actor);
    return this.recordEvidence(actor, visitId, contextFingerprint, contextItemId);
  }

  private async recordEvidence(
    actor: AuthenticatedActor,
    visitId: string,
    contextFingerprint: string,
    contextItemId: string | undefined,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.visit.findFirst({
        where: { id: visitId, clinicScopeId: actor.clinicScopeId },
        select: {
          id: true,
          patientId: true,
          clinicScopeId: true,
          clinicalEpisodeId: true,
        },
      });
      if (!visit) throw new PhysicianVisitLifecycleError("VISIT_NOT_FOUND");
      if (!visit.clinicalEpisodeId) {
        throw new PhysicianVisitLifecycleError("EPISODE_MISMATCH");
      }
      const current = await tx.patientContextVersion.findFirst({
        where: {
          patientId: visit.patientId,
          sourceVisit: {
            patientId: visit.patientId,
            clinicScopeId: visit.clinicScopeId,
          },
        },
        orderBy: { sequence: "desc" },
        include: {
          items: {
            where: {
              sourceVisit: {
                patientId: visit.patientId,
                clinicScopeId: visit.clinicScopeId,
              },
            },
          },
        },
      });
      if (!current || current.fingerprint !== contextFingerprint) {
        throw new PhysicianVisitLifecycleError("PATIENT_CONTEXT_VERSION_CONFLICT");
      }
      const changedAt = this.now();
      if (contextItemId) {
        if (!current.items.some((item) => item.id === contextItemId)) {
          throw new PhysicianVisitLifecycleError("PATIENT_CONTEXT_VERSION_CONFLICT");
        }
        const evidence = await tx.patientContextReconciliation.create({
          data: {
            contextVersionId: current.id,
            contextItemId,
            visitId,
            physicianUserId: actor.userId,
            reconciledAt: changedAt,
          },
        });
        await tx.auditLog.create({
          data: {
            patientId: visit.patientId,
            entityType: "PatientContextReconciliation",
            entityId: evidence.id,
            action: "PATIENT_CONTEXT_RECONCILED",
            newValueJson: {
              contextFingerprint,
              contextItemId,
              visitId,
            },
            changedByUserId: actor.userId,
            changedAt,
            reason: "Physician reconciled an exact Patient Context item version",
          },
        });
        return evidence;
      }
      const evidence = await tx.patientContextReview.create({
        data: {
          contextVersionId: current.id,
          visitId,
          physicianUserId: actor.userId,
          reviewedAt: changedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          patientId: visit.patientId,
          entityType: "PatientContextReview",
          entityId: evidence.id,
          action: "PATIENT_CONTEXT_REVIEWED",
          newValueJson: { contextFingerprint, visitId },
          changedByUserId: actor.userId,
          changedAt,
          reason: "Physician reviewed an exact Patient Context version",
        },
      });
      return evidence;
    }, { isolationLevel: "Serializable" });
  }
}
