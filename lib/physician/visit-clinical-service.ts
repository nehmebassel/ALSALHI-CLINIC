import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";
import {
  assertCanCorrectFinalizedPhysicianVisit,
  assertCanReadCanonicalPhysicianVisit,
  type AuthenticatedActor,
} from "@/lib/auth/authorization";
import {
  deriveMcuFvDisplayCode,
  parseAnatomicalMapRegions,
  normalizeTrichoscopyFindingCodes,
  PHYSICIAN_ANATOMICAL_MAP_TEMPLATE_VERSION,
  PHYSICIAN_MEASUREMENT_CODES,
  PHYSICIAN_TRICHOSCOPY_FINDINGS,
  PhysicianVisitClinicalContractError,
  type GovernedPhysicianVisitClinicalDraft,
  type GovernedAnatomicalMapRegion,
  type HairLinePosition,
  type PhysicianClinicalCorrectionCommand,
} from "./visit-clinical-contracts";
import { PhysicianVisitLifecycleError } from "./visit-lifecycle-contracts";
import { PhysicianVisitLongitudinalService } from "./visit-longitudinal-service";
import { PatientContextService } from "@/lib/patient-context/service";
import { activeDatabaseSchema } from "@/lib/local-clinician-demo";

interface PhysicianVisitClinicalServiceDependencies {
  now?: () => Date;
  databaseSchema?: string;
  beforeCorrectionMutation?: () => void | Promise<void>;
  beforeCorrectionAudit?: () => void | Promise<void>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1_000;

function correctionDeadline(visitOccurredAt: Date): Date {
  return new Date(visitOccurredAt.getTime() + CORRECTION_WINDOW_MS);
}

function correctionWindowOpen(visitOccurredAt: Date, serverNow: Date): boolean {
  return serverNow.getTime() < correctionDeadline(visitOccurredAt).getTime();
}

function decimalFromNumber(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

function recordedAuditValue(value: unknown): Prisma.InputJsonObject {
  return value === undefined
    ? { recorded: false }
    : { recorded: true, value: value as Prisma.InputJsonValue };
}

function isRetryablePrismaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "P2002" ||
      (error as { code?: unknown }).code === "P2034") ||
    errorText(error).includes("40001") ||
    errorText(error).includes("could not serialize access")
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.message} ${error.cause ?? ""}` : String(error);
}

function hasPatternValue(value: {
  sinclair: number | null;
  mcuFvBasic: string | null;
  hairLineMidlineCm: Prisma.Decimal | null;
  hairLineRightSideCm: Prisma.Decimal | null;
  hairLineLeftSideCm: Prisma.Decimal | null;
}): boolean {
  return (
    value.sinclair !== null ||
    value.mcuFvBasic !== null ||
    value.hairLineMidlineCm !== null ||
    value.hairLineRightSideCm !== null ||
    value.hairLineLeftSideCm !== null
  );
}

function anatomicalMapSnapshot(
  map:
    | {
        templateVersion: number;
        regions: Array<{
          id: string;
          view: string;
          geometry: Prisma.JsonValue;
          noteText: string | null;
          displayColorHex: string | null;
          displayOrder: number;
          anatomicalRegionCode: string | null;
        }>;
      }
    | null,
): Prisma.InputJsonObject | undefined {
  if (!map) return undefined;
  return {
    templateVersion: map.templateVersion,
    regions: [...map.regions]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((region) => ({
        id: region.id,
        view: region.view,
        ...(region.anatomicalRegionCode !== null
          ? { anatomicalRegionCode: region.anatomicalRegionCode }
          : {}),
        geometry: region.geometry as Prisma.InputJsonValue,
        ...(region.noteText !== null ? { noteText: region.noteText } : {}),
        ...(region.displayColorHex !== null
          ? { displayColorHex: region.displayColorHex }
          : {}),
      })),
  };
}

function anatomicalRegionCreateData(regions: GovernedAnatomicalMapRegion[]) {
  return regions.map((region, displayOrder) => ({
    view: region.view,
    anatomicalRegionCode: region.anatomicalRegionCode,
    geometry: region.geometry as unknown as Prisma.InputJsonValue,
    noteText: region.noteText,
    displayColorHex: region.displayColorHex,
    displayOrder,
  }));
}

export async function materializeGovernedPhysicianClinicalDraft(
  tx: Prisma.TransactionClient,
  physicianVisitRecordId: string,
  clinical: GovernedPhysicianVisitClinicalDraft,
): Promise<{
  examinationRows: number;
  measurementRows: number;
  patternRows: number;
  trichoscopyRows: number;
  trichoscopyFindingRows: number;
  anatomicalMapRows: number;
  anatomicalRegionRows: number;
}> {
  const examination = clinical.examination;
  const hairParting = examination?.hairParting ?? [];
  let examinationRows = 0;
  if (examination?.hairPull !== undefined || hairParting.length > 0) {
    await tx.physicianClinicalExamination.create({
      data: {
        physicianVisitRecordId,
        hairPull: examination?.hairPull,
        hairParting,
      },
    });
    examinationRows = 1;
  }

  let measurementRows = 0;
  for (const code of PHYSICIAN_MEASUREMENT_CODES) {
    const value = clinical.measurements?.[code];
    if (value === undefined) continue;
    await tx.physicianVisitMeasurement.create({
      data: { physicianVisitRecordId, code, value },
    });
    measurementRows += 1;
  }

  const pattern = clinical.pattern;
  const hairLine = pattern?.hairLineDistanceCm;
  const hasPattern =
    pattern?.sinclair !== undefined ||
    pattern?.mcuFv !== undefined ||
    hairLine?.midline !== undefined ||
    hairLine?.rightSide !== undefined ||
    hairLine?.leftSide !== undefined;
  let patternRows = 0;
  if (hasPattern) {
    await tx.physicianPatternAssessment.create({
      data: {
        physicianVisitRecordId,
        sinclair: pattern?.sinclair,
        mcuFvBasic: pattern?.mcuFv?.basic,
        mcuFvFrontal: pattern?.mcuFv?.frontal,
        mcuFvVertex: pattern?.mcuFv?.vertex,
        hairLineMidlineCm:
          hairLine?.midline === undefined
            ? undefined
            : decimalFromNumber(hairLine.midline),
        hairLineRightSideCm:
          hairLine?.rightSide === undefined
            ? undefined
            : decimalFromNumber(hairLine.rightSide),
        hairLineLeftSideCm:
          hairLine?.leftSide === undefined
            ? undefined
            : decimalFromNumber(hairLine.leftSide),
      },
    });
    patternRows = 1;
  }

  const trichoscopy = clinical.trichoscopy;
  const selectedFindingCodes = trichoscopy?.selectedFindingCodes ?? [];
  let trichoscopyRows = 0;
  let trichoscopyFindingRows = 0;
  if (selectedFindingCodes.length > 0 || trichoscopy?.otherFindingText !== undefined) {
    await tx.physicianVisitTrichoscopy.create({
      data: {
        physicianVisitRecordId,
        otherFindingText: trichoscopy?.otherFindingText,
        findings: {
          create: selectedFindingCodes.map((code) => ({ code })),
        },
      },
    });
    trichoscopyRows = 1;
    trichoscopyFindingRows = selectedFindingCodes.length;
  }

  const anatomicalRegions = clinical.anatomicalMap?.regions ?? [];
  let anatomicalMapRows = 0;
  let anatomicalRegionRows = 0;
  if (anatomicalRegions.length > 0) {
    await tx.physicianVisitAnatomicalMap.create({
      data: {
        physicianVisitRecordId,
        templateVersion: PHYSICIAN_ANATOMICAL_MAP_TEMPLATE_VERSION,
        regions: { create: anatomicalRegionCreateData(anatomicalRegions) },
      },
    });
    anatomicalMapRows = 1;
    anatomicalRegionRows = anatomicalRegions.length;
  }

  return {
    examinationRows,
    measurementRows,
    patternRows,
    trichoscopyRows,
    trichoscopyFindingRows,
    anatomicalMapRows,
    anatomicalRegionRows,
  };
}

export class PhysicianVisitClinicalService {
  private readonly now: () => Date;
  private readonly databaseSchema: string;
  private readonly beforeCorrectionMutation: () => void | Promise<void>;
  private readonly beforeCorrectionAudit: () => void | Promise<void>;

  constructor(
    private readonly prisma: PrismaClient,
    dependencies: PhysicianVisitClinicalServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.databaseSchema = dependencies.databaseSchema ?? activeDatabaseSchema();
    this.beforeCorrectionMutation =
      dependencies.beforeCorrectionMutation ?? (() => undefined);
    this.beforeCorrectionAudit =
      dependencies.beforeCorrectionAudit ?? (() => undefined);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(this.databaseSchema)) {
      throw new PhysicianVisitLifecycleError("INVALID_REQUEST");
    }
  }

  async read(actor: AuthenticatedActor, visitId: string) {
    assertCanReadCanonicalPhysicianVisit(actor);
    this.assertVisitId(visitId);
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, clinicScopeId: actor.clinicScopeId },
      select: {
        id: true,
        patientId: true,
        clinicScopeId: true,
        clinicalEpisodeId: true,
        visitOccurredAt: true,
        clinicalEpisode: {
          select: { id: true, patientId: true, clinicScopeId: true },
        },
        physicianVisitRecord: {
          select: {
            id: true,
            status: true,
            finalizedAt: true,
            clinicalExamination: true,
            clinicalMeasurements: true,
            patternAssessment: true,
            trichoscopy: { include: { findings: true } },
            anatomicalMap: {
              include: { regions: { orderBy: { displayOrder: "asc" } } },
            },
          },
        },
      },
    });
    if (!visit) throw new PhysicianVisitLifecycleError("VISIT_NOT_FOUND");
    this.assertVisitScopeIntegrity(visit, actor);
    const record = visit.physicianVisitRecord;
    if (!record) throw new PhysicianVisitLifecycleError("DRAFT_NOT_FOUND");
    const longitudinal = await new PhysicianVisitLongitudinalService(
      this.prisma,
    ).readForVisit(actor, visitId);
    const patientContext = await new PatientContextService(
      this.prisma,
      this.now,
    ).readCurrent(actor, visit.patientId);
    if (record.status !== "FINALIZED") {
      return {
        visitId: visit.id,
        clinicalEpisodeId: visit.clinicalEpisodeId,
        physicianVisitRecordId: record.id,
        status: "DRAFT" as const,
        visitOccurredAt: visit.visitOccurredAt,
        finalizedAt: null,
        canonicalClinicalData: null,
        ...longitudinal,
        patientContext,
        correction: null,
      };
    }
    if (!visit.visitOccurredAt || !record.finalizedAt) {
      throw new PhysicianVisitLifecycleError("INVALID_VISIT_OCCURRED_AT");
    }

    const examination = record.clinicalExamination;
    const measurements: Partial<Record<(typeof PHYSICIAN_MEASUREMENT_CODES)[number], number>> = {};
    for (const code of PHYSICIAN_MEASUREMENT_CODES) {
      const row = record.clinicalMeasurements.find((item) => item.code === code);
      if (row) measurements[code] = row.value;
    }
    const pattern = record.patternAssessment;
    const trichoscopy = record.trichoscopy;
    const anatomicalMap = record.anatomicalMap;
    const mcuFv = pattern?.mcuFvBasic
      ? {
          basic: pattern.mcuFvBasic,
          ...(pattern.mcuFvFrontal ? { frontal: pattern.mcuFvFrontal } : {}),
          ...(pattern.mcuFvVertex ? { vertex: pattern.mcuFvVertex } : {}),
        }
      : undefined;
    const serverNow = this.now();
    const deadline = correctionDeadline(visit.visitOccurredAt);

    return {
      visitId: visit.id,
      clinicalEpisodeId: visit.clinicalEpisodeId,
      physicianVisitRecordId: record.id,
      status: "FINALIZED" as const,
      visitOccurredAt: visit.visitOccurredAt,
      finalizedAt: record.finalizedAt,
      canonicalClinicalData: {
        clinicalExamination: {
          ...(examination?.hairPull ? { hairPull: examination.hairPull } : {}),
          hairParting: examination?.hairParting ?? [],
        },
        physicianMeasurements: measurements,
        patternMeasurements: {
          ...(pattern?.sinclair !== null && pattern?.sinclair !== undefined
            ? { sinclair: pattern.sinclair }
            : {}),
          ...(mcuFv
            ? { mcuFv: { ...mcuFv, displayCode: deriveMcuFvDisplayCode(mcuFv) } }
            : {}),
          hairLineDistance: {
            unit: "cm" as const,
            ...(pattern?.hairLineMidlineCm
              ? { midline: pattern.hairLineMidlineCm.toString() }
              : {}),
            ...(pattern?.hairLineRightSideCm
              ? { rightSide: pattern.hairLineRightSideCm.toString() }
              : {}),
            ...(pattern?.hairLineLeftSideCm
              ? { leftSide: pattern.hairLineLeftSideCm.toString() }
              : {}),
          },
        },
        ...(trichoscopy
          ? {
              trichoscopy: {
                selectedFindings: PHYSICIAN_TRICHOSCOPY_FINDINGS.filter(
                  (finding) =>
                    trichoscopy.findings.some((row) => row.code === finding.code),
                ).map(({ code, label }) => ({ code, label })),
                ...(trichoscopy.otherFindingText !== null
                  ? { otherFindingText: trichoscopy.otherFindingText }
                  : {}),
              },
            }
          : {}),
        ...(anatomicalMap
          ? {
              anatomicalMap: {
                templateVersion: anatomicalMap.templateVersion,
                regions: anatomicalMap.regions.map((region) => ({
                  id: region.id,
                  view: region.view,
                  ...(region.anatomicalRegionCode !== null
                    ? { anatomicalRegionCode: region.anatomicalRegionCode }
                    : {}),
                  geometry: region.geometry,
                  ...(region.noteText !== null
                    ? { noteText: region.noteText }
                    : {}),
                  ...(region.displayColorHex !== null
                    ? { displayColorHex: region.displayColorHex }
                    : {}),
                })),
              },
            }
          : {}),
      },
      ...longitudinal,
      patientContext,
      correction: {
        evaluatedAt: serverNow,
        deadline,
        eligible: correctionWindowOpen(
          visit.visitOccurredAt,
          serverNow,
        ),
      },
    };
  }

  async correct(
    actor: AuthenticatedActor,
    visitId: string,
    command: PhysicianClinicalCorrectionCommand,
  ) {
    assertCanCorrectFinalizedPhysicianVisit(actor);
    this.assertVisitId(visitId);

    return this.withRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const visit = await this.lockAndLoadVisit(tx, actor, visitId);
          const record = visit.physicianVisitRecord;
          if (!record || record.status !== "FINALIZED") {
            throw new PhysicianVisitLifecycleError("PHYSICIAN_VISIT_NOT_FINALIZED");
          }
          if (!visit.visitOccurredAt) {
            throw new PhysicianVisitLifecycleError("INVALID_VISIT_OCCURRED_AT");
          }
          await this.lockCanonicalRows(tx, record.id);
          const reloaded = await tx.physicianVisitRecord.findUniqueOrThrow({
            where: { id: record.id },
          });
          if (reloaded.status !== "FINALIZED") {
            throw new PhysicianVisitLifecycleError("PHYSICIAN_VISIT_NOT_FINALIZED");
          }

          const serverNow = this.now();
          if (
            !correctionWindowOpen(
              visit.visitOccurredAt,
              serverNow,
            )
          ) {
            throw new PhysicianVisitLifecycleError(
              "VISIT_CORRECTION_WINDOW_CLOSED",
            );
          }

          await this.beforeCorrectionMutation();
          const mutation = await this.applyCorrection(
            tx,
            record.id,
            command,
          );
          await this.beforeCorrectionAudit();
          const audit = await tx.auditLog.create({
            data: {
              patientId: visit.patientId,
              entityType: "PhysicianVisitClinicalCorrection",
              entityId: record.id,
              fieldName: mutation.fieldName,
              action: "PHYSICIAN_CLINICAL_CORRECTION",
              oldValueJson: recordedAuditValue(mutation.oldValue),
              newValueJson: recordedAuditValue(mutation.newValue),
              changedByUserId: actor.userId,
              changedAt: serverNow,
              reason: "Governed direct physician clinical correction",
            },
          });
          return {
            visitId: visit.id,
            physicianVisitRecordId: record.id,
            clinicalDomain: mutation.domain,
            canonicalTarget: mutation.target,
            oldValue: mutation.oldValue,
            newValue: mutation.newValue,
            correctedByUserId: actor.userId,
            correctedAt: audit.changedAt,
            auditLogId: audit.id,
          };
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  private async applyCorrection(
    tx: Prisma.TransactionClient,
    physicianVisitRecordId: string,
    command: PhysicianClinicalCorrectionCommand,
  ): Promise<{
    domain: "CLINICAL_EXAMINATION" | "PHYSICIAN_MEASUREMENTS" | "PATTERN_MEASUREMENTS" | "TRICHOSCOPY" | "ANATOMICAL_MAP";
    target: string;
    fieldName: string;
    oldValue: unknown;
    newValue: unknown;
  }> {
    if (command.target === "ANATOMICAL_MAP_REGIONS") {
      const row = await tx.physicianVisitAnatomicalMap.findUnique({
        where: { physicianVisitRecordId },
        include: { regions: { orderBy: { displayOrder: "asc" } } },
      });
      const oldValue = anatomicalMapSnapshot(row);
      const nextRegions =
        command.operation === "SET"
          ? parseAnatomicalMapRegions(command.value)
          : [];

      if (row) {
        await tx.physicianVisitAnatomicalRegion.deleteMany({
          where: { physicianVisitAnatomicalMapId: row.id },
        });
        await tx.physicianVisitAnatomicalMap.delete({ where: { id: row.id } });
      }
      const created =
        nextRegions.length > 0
          ? await tx.physicianVisitAnatomicalMap.create({
              data: {
                physicianVisitRecordId,
                templateVersion: PHYSICIAN_ANATOMICAL_MAP_TEMPLATE_VERSION,
                regions: { create: anatomicalRegionCreateData(nextRegions) },
              },
              include: {
                regions: { orderBy: { displayOrder: "asc" } },
              },
            })
          : null;

      return {
        domain: "ANATOMICAL_MAP",
        target: "REGIONS",
        fieldName: "anatomicalMap.regions",
        oldValue,
        newValue: anatomicalMapSnapshot(created),
      };
    }

    if (
      command.target === "TRICHOSCOPY_SELECTED_FINDINGS" ||
      command.target === "TRICHOSCOPY_OTHER_FINDING_TEXT"
    ) {
      const row = await tx.physicianVisitTrichoscopy.findUnique({
        where: { physicianVisitRecordId },
        include: { findings: true },
      });
      const oldCodes = PHYSICIAN_TRICHOSCOPY_FINDINGS.filter((finding) =>
        row?.findings.some((item) => item.code === finding.code),
      ).map((finding) => finding.code);
      const nextCodes =
        command.target === "TRICHOSCOPY_SELECTED_FINDINGS"
          ? command.operation === "SET"
            ? normalizeTrichoscopyFindingCodes(command.value)
            : []
          : oldCodes;
      const oldText = row?.otherFindingText ?? undefined;
      const nextText =
        command.target === "TRICHOSCOPY_OTHER_FINDING_TEXT"
          ? command.operation === "SET"
            ? command.value
            : undefined
          : oldText;

      if (nextCodes.length === 0 && nextText === undefined) {
        if (row) {
          await tx.physicianVisitTrichoscopyFinding.deleteMany({
            where: { physicianVisitTrichoscopyId: row.id },
          });
          await tx.physicianVisitTrichoscopy.delete({ where: { id: row.id } });
        }
      } else if (row) {
        if (command.target === "TRICHOSCOPY_SELECTED_FINDINGS") {
          await tx.physicianVisitTrichoscopyFinding.deleteMany({
            where: { physicianVisitTrichoscopyId: row.id },
          });
          if (nextCodes.length > 0) {
            await tx.physicianVisitTrichoscopyFinding.createMany({
              data: nextCodes.map((code) => ({
                physicianVisitTrichoscopyId: row.id,
                code,
              })),
            });
          }
        }
        if (command.target === "TRICHOSCOPY_OTHER_FINDING_TEXT") {
          await tx.physicianVisitTrichoscopy.update({
            where: { id: row.id },
            data: { otherFindingText: nextText ?? null },
          });
        }
      } else {
        await tx.physicianVisitTrichoscopy.create({
          data: {
            physicianVisitRecordId,
            otherFindingText: nextText,
            findings: { create: nextCodes.map((code) => ({ code })) },
          },
        });
      }

      const selectedTarget = command.target === "TRICHOSCOPY_SELECTED_FINDINGS";
      return {
        domain: "TRICHOSCOPY",
        target: command.target,
        fieldName: selectedTarget
          ? "trichoscopy.selectedFindings"
          : "trichoscopy.otherFindingText",
        oldValue: selectedTarget ? oldCodes : oldText,
        newValue: selectedTarget ? nextCodes : nextText,
      };
    }

    if (command.target === "HAIR_PULL" || command.target === "HAIR_PARTING") {
      const row = await tx.physicianClinicalExamination.findUnique({
        where: { physicianVisitRecordId },
      });
      const oldValue =
        command.target === "HAIR_PULL"
          ? row?.hairPull ?? undefined
          : row?.hairParting ?? [];
      const nextHairPull =
        command.target === "HAIR_PULL"
          ? command.operation === "SET"
            ? command.value
            : null
          : row?.hairPull ?? null;
      const nextHairParting =
        command.target === "HAIR_PARTING"
          ? command.operation === "SET"
            ? command.value
            : []
          : row?.hairParting ?? [];
      if (nextHairPull === null && nextHairParting.length === 0) {
        if (row) {
          await tx.physicianClinicalExamination.delete({ where: { id: row.id } });
        }
      } else if (row) {
        await tx.physicianClinicalExamination.update({
          where: { id: row.id },
          data: { hairPull: nextHairPull, hairParting: nextHairParting },
        });
      } else {
        await tx.physicianClinicalExamination.create({
          data: {
            physicianVisitRecordId,
            hairPull: nextHairPull,
            hairParting: nextHairParting,
          },
        });
      }
      const newValue =
        command.target === "HAIR_PULL"
          ? nextHairPull ?? undefined
          : nextHairParting;
      return {
        domain: "CLINICAL_EXAMINATION",
        target: command.target,
        fieldName:
          command.target === "HAIR_PULL"
            ? "clinicalExamination.hairPull"
            : "clinicalExamination.hairParting",
        oldValue,
        newValue,
      };
    }

    if (command.target === "PHYSICIAN_MEASUREMENT") {
      const row = await tx.physicianVisitMeasurement.findUnique({
        where: {
          physicianVisitRecordId_code: {
            physicianVisitRecordId,
            code: command.metric,
          },
        },
      });
      const oldValue = row?.value;
      const newValue = command.operation === "SET" ? command.value : undefined;
      if (command.operation === "SET") {
        await tx.physicianVisitMeasurement.upsert({
          where: {
            physicianVisitRecordId_code: {
              physicianVisitRecordId,
              code: command.metric,
            },
          },
          create: { physicianVisitRecordId, code: command.metric, value: command.value },
          update: { value: command.value },
        });
      } else if (row) {
        await tx.physicianVisitMeasurement.delete({ where: { id: row.id } });
      }
      return {
        domain: "PHYSICIAN_MEASUREMENTS",
        target: command.metric,
        fieldName: `physicianMeasurements.${command.metric}`,
        oldValue,
        newValue,
      };
    }

    const row = await tx.physicianPatternAssessment.findUnique({
      where: { physicianVisitRecordId },
    });
    const next = {
      sinclair: row?.sinclair ?? null,
      mcuFvBasic: row?.mcuFvBasic ?? null,
      mcuFvFrontal: row?.mcuFvFrontal ?? null,
      mcuFvVertex: row?.mcuFvVertex ?? null,
      hairLineMidlineCm: row?.hairLineMidlineCm ?? null,
      hairLineRightSideCm: row?.hairLineRightSideCm ?? null,
      hairLineLeftSideCm: row?.hairLineLeftSideCm ?? null,
    };
    let oldValue: unknown;
    let newValue: unknown;
    let target: string;
    let fieldName: string;

    if (command.target === "SINCLAIR") {
      oldValue = next.sinclair ?? undefined;
      next.sinclair = command.operation === "SET" ? command.value : null;
      newValue = next.sinclair ?? undefined;
      target = "SINCLAIR";
      fieldName = "patternMeasurements.sinclair";
    } else if (command.target === "MCU_FV") {
      oldValue = next.mcuFvBasic
        ? {
            basic: next.mcuFvBasic,
            ...(next.mcuFvFrontal ? { frontal: next.mcuFvFrontal } : {}),
            ...(next.mcuFvVertex ? { vertex: next.mcuFvVertex } : {}),
          }
        : undefined;
      if (command.operation === "SET") {
        next.mcuFvBasic = command.value.basic;
        next.mcuFvFrontal = command.value.frontal ?? null;
        next.mcuFvVertex = command.value.vertex ?? null;
        newValue = command.value;
      } else {
        next.mcuFvBasic = null;
        next.mcuFvFrontal = null;
        next.mcuFvVertex = null;
        newValue = undefined;
      }
      target = "MCU_FV";
      fieldName = "patternMeasurements.mcuFv";
    } else {
      const column = this.hairLineColumn(command.position);
      oldValue = next[column]?.toString();
      next[column] =
        command.operation === "SET" ? decimalFromNumber(command.value) : null;
      newValue = next[column]?.toString();
      target = `HAIR_LINE_DISTANCE.${command.position}`;
      fieldName = `patternMeasurements.hairLineDistance.${command.position}`;
    }

    if (!hasPatternValue(next)) {
      if (row) await tx.physicianPatternAssessment.delete({ where: { id: row.id } });
    } else if (row) {
      await tx.physicianPatternAssessment.update({
        where: { id: row.id },
        data: next,
      });
    } else {
      await tx.physicianPatternAssessment.create({
        data: { physicianVisitRecordId, ...next },
      });
    }
    return {
      domain: "PATTERN_MEASUREMENTS",
      target,
      fieldName,
      oldValue,
      newValue,
    };
  }

  private hairLineColumn(position: HairLinePosition) {
    return position === "MIDLINE"
      ? ("hairLineMidlineCm" as const)
      : position === "RIGHT_SIDE"
        ? ("hairLineRightSideCm" as const)
        : ("hairLineLeftSideCm" as const);
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
    const visit = await tx.visit.findUniqueOrThrow({
      where: { id: visitId },
      include: { physicianVisitRecord: true, clinicalEpisode: true },
    });
    this.assertVisitScopeIntegrity(visit, actor);
    return visit;
  }

  private async lockCanonicalRows(
    tx: Prisma.TransactionClient,
    physicianVisitRecordId: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT "id" FROM ${Prisma.raw(`"${this.databaseSchema}"."PhysicianClinicalExamination"`)}
      WHERE "physicianVisitRecordId" = ${physicianVisitRecordId}::uuid FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT "id" FROM ${Prisma.raw(`"${this.databaseSchema}"."PhysicianVisitMeasurement"`)}
      WHERE "physicianVisitRecordId" = ${physicianVisitRecordId}::uuid FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT "id" FROM ${Prisma.raw(`"${this.databaseSchema}"."PhysicianPatternAssessment"`)}
      WHERE "physicianVisitRecordId" = ${physicianVisitRecordId}::uuid FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT "id" FROM ${Prisma.raw(`"${this.databaseSchema}"."PhysicianVisitTrichoscopy"`)}
      WHERE "physicianVisitRecordId" = ${physicianVisitRecordId}::uuid FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT finding."id"
      FROM ${Prisma.raw(`"${this.databaseSchema}"."PhysicianVisitTrichoscopyFinding"`)} AS finding
      INNER JOIN ${Prisma.raw(`"${this.databaseSchema}"."PhysicianVisitTrichoscopy"`)} AS trichoscopy
        ON trichoscopy."id" = finding."physicianVisitTrichoscopyId"
      WHERE trichoscopy."physicianVisitRecordId" = ${physicianVisitRecordId}::uuid
      FOR UPDATE OF finding
    `;
    await tx.$queryRaw`
      SELECT "id" FROM ${Prisma.raw(`"${this.databaseSchema}"."PhysicianVisitAnatomicalMap"`)}
      WHERE "physicianVisitRecordId" = ${physicianVisitRecordId}::uuid FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT region."id"
      FROM ${Prisma.raw(`"${this.databaseSchema}"."PhysicianVisitAnatomicalRegion"`)} AS region
      INNER JOIN ${Prisma.raw(`"${this.databaseSchema}"."PhysicianVisitAnatomicalMap"`)} AS anatomical_map
        ON anatomical_map."id" = region."physicianVisitAnatomicalMapId"
      WHERE anatomical_map."physicianVisitRecordId" = ${physicianVisitRecordId}::uuid
      FOR UPDATE OF region
    `;
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (errorText(error).includes("FPV-3 hard lock: canonical clinical correction window is closed")) {
          throw new PhysicianVisitLifecycleError(
            "VISIT_CORRECTION_WINDOW_CLOSED",
          );
        }
        if (errorText(error).includes("FPV-3.5A hard lock: canonical trichoscopy correction window is closed")) {
          throw new PhysicianVisitLifecycleError(
            "VISIT_CORRECTION_WINDOW_CLOSED",
          );
        }
        if (errorText(error).includes("FPV-3.5B hard lock: canonical anatomical map correction window is closed")) {
          throw new PhysicianVisitLifecycleError(
            "VISIT_CORRECTION_WINDOW_CLOSED",
          );
        }
        if (error instanceof PhysicianVisitClinicalContractError) {
          throw new PhysicianVisitLifecycleError("INVALID_CLINICAL_DATA");
        }
        if (!isRetryablePrismaError(error)) throw error;
      }
    }
    throw new PhysicianVisitLifecycleError("RETRYABLE_CONFLICT");
  }

  private assertVisitId(visitId: string): void {
    if (!UUID_PATTERN.test(visitId)) {
      throw new PhysicianVisitLifecycleError("INVALID_REQUEST");
    }
  }

  private assertVisitScopeIntegrity(
    visit: {
      patientId: string;
      clinicScopeId: string | null;
      clinicalEpisodeId: string | null;
      clinicalEpisode: {
        id: string;
        patientId: string;
        clinicScopeId: string | null;
      } | null;
    },
    actor: AuthenticatedActor,
  ): void {
    if (visit.clinicScopeId !== actor.clinicScopeId) {
      throw new PhysicianVisitLifecycleError("VISIT_NOT_FOUND");
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
}
