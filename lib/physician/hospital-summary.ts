import type { PrismaClient } from "@/app/generated/prisma/client";
import {
  assertCanReadCanonicalPhysicianVisit,
  type AuthenticatedActor,
} from "@/lib/auth/authorization";
import { ageAt } from "@/lib/physician/presentation";
import { PhysicianVisitClinicalService } from "@/lib/physician/visit-clinical-service";
import {
  PHYSICIAN_ANATOMICAL_REGION_LABELS,
  presentAnatomicalRegionLabel,
  presentProcedurePlanTarget,
} from "@/lib/physician/visit-workspace";

type CanonicalDecision = Record<string, unknown>;

export type HospitalSummaryCanonicalRead = {
  status: "DRAFT" | "FINALIZED";
  visitOccurredAt: Date | string | null;
  finalizedAt: Date | string | null;
  canonicalClinicalData: null | Record<string, unknown>;
  visitDecisions: {
    diagnoses: CanonicalDecision[];
    treatments: CanonicalDecision[];
    procedures: CanonicalDecision[];
  };
  effectivePhysicianState: {
    diagnoses: Array<{
      diagnosisId: string;
      text: string;
      status: "ACTIVE" | "RESOLVED";
    }>;
    treatmentCourses: Array<{
      treatmentCourseId: string;
      name: string;
      regimenText?: string;
      noteText?: string;
      status: "ACTIVE" | "STOPPED";
    }>;
    procedurePlans: Array<{
      procedurePlanId: string;
      procedureCode: string;
      otherProcedureText?: string;
      plannedDate?: string;
      noteText?: string;
      status: "OPEN" | "FULFILLED" | "CANCELLED_OR_DEFERRED";
    }>;
    performedProcedures: unknown[];
  };
};

export type HospitalSummaryDetail = {
  label: string;
  value: string;
};

export type HospitalSummaryDecision = {
  status: string;
  title: string;
  details: HospitalSummaryDetail[];
};

export type HospitalSummaryClinicalContent = {
  diagnoses: HospitalSummaryDecision[];
  treatments: HospitalSummaryDecision[];
  procedures: HospitalSummaryDecision[];
  clinicalFindings: HospitalSummaryDetail[];
  trichoscopyFindings: string[];
  measurements: HospitalSummaryDetail[];
};

export type HospitalVisitSummary = HospitalSummaryClinicalContent & {
  patient: {
    id: string;
    name: string;
    mrn?: string;
    dateOfBirth: string;
    age: number;
    sex: "Male" | "Female";
  };
  visit: {
    id: string;
    occurredAt: string;
    finalizedAt: string;
    physician?: string;
    service?: string;
  };
};

type HospitalSummaryDependencies = {
  readCanonical?: (
    actor: AuthenticatedActor,
    visitId: string,
  ) => Promise<HospitalSummaryCanonicalRead>;
};

export type HospitalSummaryStableIdentities = {
  treatmentCourses: Array<{
    treatmentCourseId: string;
    name: string;
  }>;
  procedurePlans: Array<{
    procedurePlanId: string;
    procedureCode: string;
    otherProcedureText?: string;
  }>;
};

const EMPTY_STABLE_IDENTITIES: HospitalSummaryStableIdentities = {
  treatmentCourses: [],
  procedurePlans: [],
};

const DIAGNOSIS_ACTIONS: Record<string, string> = {
  ADD: "New diagnosis",
  REVISE: "Diagnosis updated",
  RESOLVE: "Diagnosis resolved",
};

const TREATMENT_ACTIONS: Record<string, string> = {
  START: "Started",
  CONTINUE_EXISTING: "Continued",
  MODIFY: "Modified",
  STOP: "Stopped",
};

const PROCEDURE_ACTIONS: Record<string, string> = {
  PLAN: "Planned",
  PERFORM: "Performed",
  CANCEL_OR_DEFER: "Cancelled or deferred",
};

const HAIR_PULL_LABELS: Record<string, string> = {
  POSITIVE: "Positive",
  NEGATIVE: "Negative",
  NOT_RECORDED: "Not recorded",
};

const HAIR_PARTING_LABELS: Record<string, string> = {
  UNIVERSAL: "Universal",
  FRONTAL_THINNER: "Frontal thinner",
  CROWN_THINNER: "Crown thinner",
  VERTEX_THINNER: "Vertex thinner",
};

const MEASUREMENT_LABELS: Record<string, string> = {
  SHEDDING: "Shedding",
  DENSITY_LOSS: "Density Loss",
  ITCH: "Itch",
  BURNING: "Burning",
  SCALP_PAIN: "Scalp Pain",
};

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function exactText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function iso(value: Date | string | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function buildDiagnosisDecisions(
  canonical: HospitalSummaryCanonicalRead,
): HospitalSummaryDecision[] {
  return canonical.visitDecisions.diagnoses.flatMap((decision) => {
    const action = exactText(decision.action);
    if (!action || !DIAGNOSIS_ACTIONS[action]) return [];
    const title = exactText(decision.text);
    return title
      ? [{ status: DIAGNOSIS_ACTIONS[action], title, details: [] }]
      : [];
  });
}

function buildTreatmentDecisions(
  canonical: HospitalSummaryCanonicalRead,
  stableIdentities: HospitalSummaryStableIdentities,
): HospitalSummaryDecision[] {
  return canonical.visitDecisions.treatments.flatMap((decision) => {
    const action = exactText(decision.action);
    if (!action || !TREATMENT_ACTIONS[action]) return [];
    const treatmentCourseId = exactText(decision.treatmentCourseId);
    const stableIdentity = treatmentCourseId
      ? stableIdentities.treatmentCourses.find(
          (item) => item.treatmentCourseId === treatmentCourseId,
        )
      : undefined;
    const title = exactText(decision.name) ?? stableIdentity?.name;
    if (!title) return [];
    const regimen = exactText(decision.regimenText);
    const physicianNote = exactText(decision.noteText);
    const details: HospitalSummaryDetail[] = [];
    if (regimen) details.push({ label: "Regimen", value: regimen });
    if (physicianNote) {
      details.push({ label: "Physician note", value: physicianNote });
    }
    return [{ status: TREATMENT_ACTIONS[action], title, details }];
  });
}

function procedureTitle(
  decision: CanonicalDecision,
  stableIdentity: HospitalSummaryStableIdentities["procedurePlans"][number] | undefined,
): string | undefined {
  const exactOther = exactText(decision.otherProcedureText)
    ?? stableIdentity?.otherProcedureText;
  const code = exactText(decision.procedureCode) ?? stableIdentity?.procedureCode;
  if (code === "OTHER" && exactOther) return exactOther;
  if (!code) return undefined;
  return presentProcedurePlanTarget(
    { procedureCode: code, ...(exactOther ? { otherProcedureText: exactOther } : {}) },
    "en",
  );
}

function buildProcedureDecisions(
  canonical: HospitalSummaryCanonicalRead,
  stableIdentities: HospitalSummaryStableIdentities,
): HospitalSummaryDecision[] {
  return canonical.visitDecisions.procedures.flatMap((decision) => {
    const action = exactText(decision.action);
    if (!action || !PROCEDURE_ACTIONS[action]) return [];
    const procedurePlanId = exactText(decision.procedurePlanId);
    const stableIdentity = procedurePlanId
      ? stableIdentities.procedurePlans.find(
          (item) => item.procedurePlanId === procedurePlanId,
        )
      : undefined;
    const title = procedureTitle(decision, stableIdentity);
    if (!title) return [];
    const details: HospitalSummaryDetail[] = [];
    const plannedDate = exactText(decision.plannedDate);
    const performedDate = exactText(decision.performedDate);
    const physicianNote = exactText(decision.noteText);
    if (plannedDate) details.push({ label: "Planned date", value: plannedDate });
    if (performedDate) {
      details.push({ label: "Performed date", value: performedDate });
    }
    if (physicianNote) {
      details.push({ label: "Physician note", value: physicianNote });
    }
    return [{ status: PROCEDURE_ACTIONS[action], title, details }];
  });
}

function buildClinicalFindings(data: Record<string, unknown>): HospitalSummaryDetail[] {
  const examination = object(data.clinicalExamination);
  const findings: HospitalSummaryDetail[] = [];
  const hairPull = exactText(examination.hairPull);
  if (hairPull && HAIR_PULL_LABELS[hairPull]) {
    findings.push({ label: "Hair Pull", value: HAIR_PULL_LABELS[hairPull] });
  }
  const hairParting = Array.isArray(examination.hairParting)
    ? examination.hairParting.flatMap((value) => {
        const code = exactText(value);
        return code && HAIR_PARTING_LABELS[code] ? [HAIR_PARTING_LABELS[code]] : [];
      })
    : [];
  if (hairParting.length > 0) {
    findings.push({ label: "Hair Parting", value: hairParting.join("; ") });
  }

  const anatomicalMap = object(data.anatomicalMap);
  for (const region of records(anatomicalMap.regions)) {
    const code = exactText(region.anatomicalRegionCode);
    const location = code && code in PHYSICIAN_ANATOMICAL_REGION_LABELS
      ? PHYSICIAN_ANATOMICAL_REGION_LABELS[
          code as keyof typeof PHYSICIAN_ANATOMICAL_REGION_LABELS
        ].en
      : presentAnatomicalRegionLabel(
          region as unknown as Parameters<typeof presentAnatomicalRegionLabel>[0],
          "en",
        );
    const note = exactText(region.noteText);
    findings.push({
      label: note ? location : "Anatomical location",
      value: note ?? location,
    });
  }
  return findings;
}

function buildTrichoscopyFindings(data: Record<string, unknown>): string[] {
  const trichoscopy = object(data.trichoscopy);
  const selected = records(trichoscopy.selectedFindings).flatMap((finding) => {
    const label = exactText(finding.label);
    return label ? [label] : [];
  });
  const other = exactText(trichoscopy.otherFindingText);
  return other ? [...selected, other] : selected;
}

function buildMeasurements(data: Record<string, unknown>): HospitalSummaryDetail[] {
  const measurements: HospitalSummaryDetail[] = [];
  for (const [code, value] of Object.entries(object(data.physicianMeasurements))) {
    if (typeof value === "number" && Number.isFinite(value) && MEASUREMENT_LABELS[code]) {
      measurements.push({ label: MEASUREMENT_LABELS[code], value: `${value}/5` });
    }
  }
  const pattern = object(data.patternMeasurements);
  if (typeof pattern.sinclair === "number" && Number.isFinite(pattern.sinclair)) {
    measurements.push({ label: "Sinclair grade", value: String(pattern.sinclair) });
  }
  const mcuFv = object(pattern.mcuFv);
  const mcuFvDisplay = exactText(mcuFv.displayCode);
  if (mcuFvDisplay) measurements.push({ label: "MCU/FV", value: mcuFvDisplay });
  const hairLine = object(pattern.hairLineDistance);
  for (const [key, label] of [
    ["midline", "Hair-line distance — Midline"],
    ["rightSide", "Hair-line distance — Right side"],
    ["leftSide", "Hair-line distance — Left side"],
  ] as const) {
    const value = exactText(hairLine[key]);
    if (value) measurements.push({ label, value: `${value} cm` });
  }
  return measurements;
}

export function buildHospitalSummaryClinicalContent(
  canonical: HospitalSummaryCanonicalRead,
  stableIdentities: HospitalSummaryStableIdentities = EMPTY_STABLE_IDENTITIES,
): HospitalSummaryClinicalContent {
  const data = object(canonical.canonicalClinicalData);
  return {
    diagnoses: buildDiagnosisDecisions(canonical),
    treatments: buildTreatmentDecisions(canonical, stableIdentities),
    procedures: buildProcedureDecisions(canonical, stableIdentities),
    clinicalFindings: buildClinicalFindings(data),
    trichoscopyFindings: buildTrichoscopyFindings(data),
    measurements: buildMeasurements(data),
  };
}

export async function loadHospitalVisitSummary(
  prisma: PrismaClient,
  actor: AuthenticatedActor,
  visitId: string,
  dependencies: HospitalSummaryDependencies = {},
): Promise<HospitalVisitSummary | null> {
  assertCanReadCanonicalPhysicianVisit(actor);
  const readCanonical = dependencies.readCanonical
    ?? ((readActor, readVisitId) =>
      new PhysicianVisitClinicalService(prisma).read(readActor, readVisitId));
  const canonical = await readCanonical(actor, visitId);
  const occurredAt = iso(canonical.visitOccurredAt);
  const finalizedAt = iso(canonical.finalizedAt);
  if (
    canonical.status !== "FINALIZED"
    || !canonical.canonicalClinicalData
    || !occurredAt
    || !finalizedAt
  ) {
    return null;
  }

  const visit = await prisma.visit.findFirst({
    where: {
      id: visitId,
      clinicScopeId: actor.clinicScopeId,
      physicianVisitRecord: { is: { status: "FINALIZED" } },
    },
    select: {
      id: true,
      patient: {
        select: {
          id: true,
          profile: {
            select: { fullName: true, dateOfBirth: true, gender: true },
          },
          externalIdentifiers: {
            where: {
              clinicScopeId: actor.clinicScopeId,
              identifierType: "CLINIC_MRN",
            },
            select: { displayValue: true },
            take: 1,
          },
        },
      },
      reasons: {
        where: { role: "PRIMARY" },
        select: {
          reasonDefinition: {
            select: { clinicalService: { select: { nameEn: true } } },
          },
        },
        take: 1,
      },
      physicianVisitRecord: {
        select: {
          finalizedBy: { select: { name: true } },
          treatmentDecisions: {
            select: {
              treatmentCourseId: true,
              treatmentCourse: {
                select: {
                  decisions: {
                    where: { action: "START" },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    take: 1,
                    select: { name: true },
                  },
                },
              },
            },
          },
          procedureDecisions: {
            select: {
              procedurePlanId: true,
              procedurePlan: {
                select: {
                  decisions: {
                    where: { action: "PLAN" },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    take: 1,
                    select: {
                      procedureCode: true,
                      otherProcedureText: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!visit?.patient.profile || !visit.physicianVisitRecord) return null;

  const profile = visit.patient.profile;
  const mrn = exactText(visit.patient.externalIdentifiers[0]?.displayValue);
  const physician = exactText(visit.physicianVisitRecord.finalizedBy?.name);
  const service = exactText(
    visit.reasons[0]?.reasonDefinition.clinicalService.nameEn,
  );
  const dateOfBirth = profile.dateOfBirth.toISOString();
  const stableIdentities: HospitalSummaryStableIdentities = {
    treatmentCourses: visit.physicianVisitRecord.treatmentDecisions.flatMap(
      (decision) => {
        const name = exactText(decision.treatmentCourse.decisions[0]?.name);
        return name
          ? [{ treatmentCourseId: decision.treatmentCourseId, name }]
          : [];
      },
    ),
    procedurePlans: visit.physicianVisitRecord.procedureDecisions.flatMap(
      (decision) => {
        const identity = decision.procedurePlan?.decisions[0];
        const procedureCode = exactText(identity?.procedureCode);
        const otherProcedureText = exactText(identity?.otherProcedureText);
        return decision.procedurePlanId && procedureCode
          ? [{
              procedurePlanId: decision.procedurePlanId,
              procedureCode,
              ...(otherProcedureText ? { otherProcedureText } : {}),
            }]
          : [];
      },
    ),
  };
  return {
    patient: {
      id: visit.patient.id,
      name: profile.fullName,
      ...(mrn ? { mrn } : {}),
      dateOfBirth,
      age: ageAt(dateOfBirth, occurredAt),
      sex: profile.gender === "FEMALE" ? "Female" : "Male",
    },
    visit: {
      id: visit.id,
      occurredAt,
      finalizedAt,
      ...(physician ? { physician } : {}),
      ...(service ? { service } : {}),
    },
    ...buildHospitalSummaryClinicalContent(canonical, stableIdentities),
  };
}
