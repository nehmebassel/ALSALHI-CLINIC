import "dotenv/config";

import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../app/generated/prisma/client";
import type { AuthenticatedActor } from "../lib/auth/authorization";
import { P01EngineService } from "../lib/p01/engine-service";
import { PatientAccessService, type JsonValue, type PatientInputJson } from "../lib/patient-access/service";
import { PrismaPatientAccessStore } from "../lib/patient-access/prisma-store";
import { PatientContextService } from "../lib/patient-context/service";
import { getPhysicianPatientWorkspace } from "../lib/physician/read-model";
import { PhysicianHairHistoryService } from "../lib/physician/hair-history-service";
import { PhysicianVisitLifecycleService } from "../lib/physician/visit-lifecycle-service";
import { PhysicianVisitService } from "../lib/physician/visit-service";
import { FinalSubmitService } from "../lib/submission/service";
import { P01_PRIVACY_NOTICE_AR, P01_PRIVACY_NOTICE_EN, P01_PRIVACY_NOTICE_VERSION } from "../lib/p01/privacy";
import { buildSyntheticDraft } from "./synthetic-scenarios";
import { seedDatabase } from "./seed";
import {
  CLINICIAN_DEMO_AS_OF,
  CLINICIAN_DEMO_SCENARIOS,
  CLINICIAN_DEMO_SCHEMA,
  syntheticCaseForDemo,
  type ClinicianDemoScenario,
  type DemoDiagnosisDecision,
  type DemoProcedureDecision,
  type DemoTreatmentDecision,
  type DemoVisit,
} from "./clinician-demo-scenarios";

const MINUTE = 60_000;

type RuntimeIdentityMaps = {
  diagnoses: Map<string, string>;
  treatments: Map<string, string>;
  procedures: Map<string, string>;
};

type SubmittedVisit = {
  patientId: string;
  visitId: string;
  clinicalInterviewId: string;
};

function safeTarget(connectionString: string, schema: string) {
  const url = new URL(connectionString);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`Refusing clinician-demo work on non-local host: ${url.hostname}`);
  }
  if (schema !== CLINICIAN_DEMO_SCHEMA || process.env.CLINICIAN_DEMO_SCHEMA !== CLINICIAN_DEMO_SCHEMA) {
    throw new Error(`CLINICIAN_DEMO_SCHEMA must be exactly ${CLINICIAN_DEMO_SCHEMA}.`);
  }
  const urlSchema = url.searchParams.get("schema");
  if (urlSchema !== schema) {
    throw new Error(`DATABASE_URL schema must be exactly ${schema}; received ${urlSchema ?? "none"}.`);
  }
  return {
    host: url.hostname,
    port: url.port || "5432",
    database: url.pathname.replace(/^\//, ""),
    schema,
  };
}

function actor(input: {
  userId: string;
  role: "STAFF" | "PHYSICIAN";
  clinicScopeId: string;
  clinicDeviceId?: string | null;
}): AuthenticatedActor {
  return {
    actorType: "AUTHENTICATED_USER",
    userId: input.userId,
    role: input.role,
    clinicScopeId: input.clinicScopeId,
    clinicDeviceId: input.clinicDeviceId ?? null,
    authenticatedSessionId: randomUUID(),
  };
}

function finalizedAt(occurredAt: string): Date {
  return new Date(new Date(occurredAt).getTime() + 30 * MINUTE);
}

function submittedAt(occurredAt: string): Date {
  return new Date(new Date(occurredAt).getTime() - 5 * MINUTE);
}

function privacy(locale: "ar" | "en", acceptedAt: Date) {
  return {
    noticeVersion: P01_PRIVACY_NOTICE_VERSION,
    noticeTextAr: P01_PRIVACY_NOTICE_AR,
    noticeTextEn: P01_PRIVACY_NOTICE_EN,
    language: locale,
    acceptedAt: acceptedAt.toISOString(),
  };
}

async function submitInitialVisit(input: {
  prisma: PrismaClient;
  engine: P01EngineService;
  staffActor: AuthenticatedActor;
  scenario: ClinicianDemoScenario;
  visit: DemoVisit;
}): Promise<SubmittedVisit> {
  const { prisma, engine, staffActor, scenario, visit } = input;
  const occurredAt = new Date(visit.occurredAt);
  const submitAt = submittedAt(visit.occurredAt);
  const flowAt = new Date(submitAt.getTime() - 5 * MINUTE);
  const draft = buildSyntheticDraft(syntheticCaseForDemo(scenario));
  draft.privacy = privacy(scenario.locale, new Date(occurredAt.getTime() - 35 * MINUTE));

  const access = new PatientAccessService(
    new PrismaPatientAccessStore(prisma),
    {
      now: () => flowAt,
      generateToken: () => `clinician-demo-${scenario.mrn}-${randomUUID()}`,
    },
  );
  const flow = await access.createFlow(staffActor, {
    clinicMrn: scenario.mrn,
    patientInputJson: draft as unknown as PatientInputJson,
  });
  const result = await new FinalSubmitService(prisma, {
    now: () => submitAt,
    evaluateOfficialState: (request) => engine.evaluateOfficialState(request),
  }).submit({ patientSessionToken: flow.sessionToken });

  await Promise.all([
    prisma.visit.update({ where: { id: result.visitId }, data: { createdAt: submitAt, updatedAt: submitAt } }),
    prisma.clinicalInterview.update({ where: { id: result.clinicalInterviewId }, data: { createdAt: submitAt, updatedAt: submitAt } }),
    prisma.draftClinicalInterview.update({ where: { id: result.draftId }, data: { createdAt: flowAt, updatedAt: submitAt, submittedAt: submitAt } }),
  ]);
  await prisma.patientProfile.update({
    where: { patientId: result.patientId },
    data: { occupation: scenario.locale === "ar" ? scenario.occupation.ar : scenario.occupation.en },
  });
  return result;
}

function record(value: JsonValue | undefined): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a server-owned follow-up context.");
  }
  return value as Record<string, JsonValue>;
}

async function submitFollowUpVisit(input: {
  prisma: PrismaClient;
  engine: P01EngineService;
  staffActor: AuthenticatedActor;
  scenario: ClinicianDemoScenario;
  visit: DemoVisit;
}): Promise<SubmittedVisit> {
  const { prisma, engine, staffActor, scenario, visit } = input;
  if (!visit.patientFollowUp) throw new Error(`${scenario.mrn} follow-up lacks a manually authored patient delta.`);
  const occurredAt = new Date(visit.occurredAt);
  const submitAt = submittedAt(visit.occurredAt);
  const flowAt = new Date(submitAt.getTime() - 5 * MINUTE);
  const access = new PatientAccessService(
    new PrismaPatientAccessStore(prisma),
    {
      now: () => flowAt,
      generateToken: () => `clinician-demo-follow-up-${scenario.mrn}-${randomUUID()}`,
    },
  );
  const flow = await access.createFlow(staffActor, { clinicMrn: scenario.mrn });
  const loaded = await access.load(flow.sessionToken);
  const serverFollowUp = record(loaded.patientInputJson.followUp);
  const episodes = Array.isArray(serverFollowUp.episodes) ? serverFollowUp.episodes : [];
  const selectedEpisode = episodes.find((candidate) => {
    const item = record(candidate as JsonValue);
    return item.primaryReasonCode === scenario.primary;
  });
  const selected = record(selectedEpisode as JsonValue);
  if (typeof selected.id !== "string" || typeof selected.lastVisitId !== "string") {
    throw new Error(`${scenario.mrn} follow-up could not resolve its existing ClinicalEpisode.`);
  }
  const followUpDraft: PatientInputJson = {
    locale: scenario.locale,
    answers: { Q_PRIVACY_CONSENT: "YES" },
    privacy: privacy(scenario.locale, new Date(occurredAt.getTime() - 35 * MINUTE)) as unknown as JsonValue,
    followUp: {
      ...serverFollowUp,
      intent: "EXISTING_CONCERN",
      selectedEpisodeId: selected.id,
      selectedPrimaryReasonCode: scenario.primary,
      sourceVisitId: selected.lastVisitId,
      changes: visit.patientFollowUp.changes,
      delta: visit.patientFollowUp.delta,
      changesReviewed: true,
    },
  };
  await access.autosave(flow.sessionToken, followUpDraft);
  const result = await new FinalSubmitService(prisma, {
    now: () => submitAt,
    evaluateOfficialState: (request) => engine.evaluateOfficialState(request),
  }).submit({ patientSessionToken: flow.sessionToken });
  await Promise.all([
    prisma.visit.update({ where: { id: result.visitId }, data: { createdAt: submitAt, updatedAt: submitAt } }),
    prisma.clinicalInterview.update({ where: { id: result.clinicalInterviewId }, data: { createdAt: submitAt, updatedAt: submitAt } }),
    prisma.draftClinicalInterview.update({ where: { id: result.draftId }, data: { createdAt: flowAt, updatedAt: submitAt, submittedAt: submitAt } }),
  ]);
  return result;
}

async function approveHairHistory(input: {
  prisma: PrismaClient;
  physicianActor: AuthenticatedActor;
  scenario: ClinicianDemoScenario;
  submitted: SubmittedVisit;
}) {
  const { prisma, physicianActor, scenario, submitted } = input;
  const workspace = await getPhysicianPatientWorkspace(prisma, physicianActor.clinicScopeId, submitted.patientId);
  if (!workspace || workspace.hairHistory.items.length === 0) {
    throw new Error(`${scenario.mrn} did not derive Patient Hair History from official responses.`);
  }
  const correctedItems = workspace.hairHistory.items.map((workspaceItem) => {
    const { editable, ...item } = workspaceItem;
    void editable;
    if (!scenario.correctHairHistoryOnset) return item;
    const value = item.value && typeof item.value === "object" && !Array.isArray(item.value)
      ? item.value as Record<string, unknown>
      : {};
    const corrected = item.itemType === "SHEDDING_ONSET"
      || (item.layer === "MEASURES" && value.metricCode === "SHEDDING");
    return corrected
      ? { ...item, date: scenario.correctHairHistoryOnset, datePrecision: "MONTH" as const, source: "PHYSICIAN" as const }
      : item;
  });
  const service = new PhysicianHairHistoryService(prisma);
  await service.saveDraft(physicianActor, {
    patientId: submitted.patientId,
    sourceVisitId: submitted.visitId,
    items: correctedItems,
    reason: scenario.correctHairHistoryOnset
      ? "Physician corrected the patient-reported shedding onset during review."
      : "Physician reviewed the synthetic Patient Hair History before approval.",
  });
  await service.approve(physicianActor, {
    patientId: submitted.patientId,
    approvingVisitId: submitted.visitId,
  });
}

function resolveDiagnoses(specs: readonly DemoDiagnosisDecision[], maps: RuntimeIdentityMaps) {
  return specs.map((decision) => {
    if (decision.action === "ADD") return { action: decision.action, text: decision.text };
    const diagnosisId = maps.diagnoses.get(decision.targetKey);
    if (!diagnosisId) throw new Error(`Missing diagnosis target ${decision.targetKey}.`);
    return decision.action === "RESOLVE"
      ? { action: decision.action, diagnosisId }
      : { action: decision.action, diagnosisId, text: decision.text };
  });
}

function resolveTreatments(specs: readonly DemoTreatmentDecision[], maps: RuntimeIdentityMaps) {
  return specs.map((decision) => {
    if (decision.action === "START") {
      return {
        action: decision.action,
        name: decision.name,
        ...(decision.regimenText ? { regimenText: decision.regimenText } : {}),
        ...(decision.noteText ? { noteText: decision.noteText } : {}),
      };
    }
    const treatmentCourseId = maps.treatments.get(decision.targetKey);
    if (!treatmentCourseId) throw new Error(`Missing treatment target ${decision.targetKey}.`);
    if (decision.action === "CONTINUE_EXISTING") {
      return { action: decision.action, treatmentCourseId, ...(decision.noteText ? { noteText: decision.noteText } : {}) };
    }
    if (decision.action === "STOP") return { action: decision.action, treatmentCourseId };
    return {
      action: decision.action,
      treatmentCourseId,
      ...(decision.name !== undefined ? { name: decision.name } : {}),
      ...(decision.regimenText !== undefined ? { regimenText: decision.regimenText } : {}),
      ...(decision.noteText !== undefined ? { noteText: decision.noteText } : {}),
    };
  });
}

function resolveProcedures(specs: readonly DemoProcedureDecision[], maps: RuntimeIdentityMaps) {
  return specs.map((decision) => {
    if (decision.action === "PLAN") {
      return {
        action: decision.action,
        procedureCode: decision.procedureCode,
        ...(decision.otherProcedureText ? { otherProcedureText: decision.otherProcedureText } : {}),
        ...(decision.plannedDate ? { plannedDate: decision.plannedDate } : {}),
        ...(decision.noteText ? { noteText: decision.noteText } : {}),
      };
    }
    if (decision.action === "CANCEL_OR_DEFER") {
      const procedurePlanId = maps.procedures.get(decision.targetKey);
      if (!procedurePlanId) throw new Error(`Missing procedure target ${decision.targetKey}.`);
      return { action: decision.action, procedurePlanId, ...(decision.noteText ? { noteText: decision.noteText } : {}) };
    }
    const procedurePlanId = decision.targetKey ? maps.procedures.get(decision.targetKey) : undefined;
    if (decision.targetKey && !procedurePlanId) throw new Error(`Missing procedure target ${decision.targetKey}.`);
    return {
      action: decision.action,
      ...(procedurePlanId ? { procedurePlanId } : {}),
      ...(!procedurePlanId && decision.procedureCode ? { procedureCode: decision.procedureCode } : {}),
      ...(!procedurePlanId && decision.otherProcedureText ? { otherProcedureText: decision.otherProcedureText } : {}),
      performedDate: decision.performedDate,
      ...(decision.noteText ? { noteText: decision.noteText } : {}),
    };
  });
}

async function savePhysicianDraft(input: {
  prisma: PrismaClient;
  physicianActor: AuthenticatedActor;
  scenario: ClinicianDemoScenario;
  visit: DemoVisit;
  submitted: SubmittedVisit;
  maps: RuntimeIdentityMaps;
}): Promise<number> {
  const { prisma, physicianActor, visit, submitted, maps } = input;
  const service = new PhysicianVisitService(prisma, { now: () => new Date(new Date(visit.occurredAt).getTime() - 2 * MINUTE) });
  let record = await service.prepareDraft(physicianActor, submitted.visitId);
  const sections: Array<{ section: string; value: Record<string, unknown> }> = [];
  if (visit.clinical?.examination) sections.push({ section: "EXAMINATION", value: visit.clinical.examination });
  if (visit.clinical?.measurements) sections.push({ section: "MEASUREMENTS", value: visit.clinical.measurements });
  if (visit.clinical?.pattern) sections.push({ section: "PATTERN", value: visit.clinical.pattern });
  if (visit.clinical?.trichoscopy) sections.push({ section: "TRICHOSCOPY", value: visit.clinical.trichoscopy });
  if (visit.clinical?.anatomicalMap) sections.push({ section: "ANATOMICAL_MAP", value: visit.clinical.anatomicalMap as unknown as Record<string, unknown> });
  sections.push({ section: "DIAGNOSIS", value: { decisions: resolveDiagnoses(visit.diagnoses, maps) } });
  sections.push({
    section: "TREATMENT_PROCEDURES",
    value: {
      treatments: resolveTreatments(visit.treatments, maps),
      procedures: resolveProcedures(visit.procedures, maps),
    },
  });
  for (const section of sections) {
    record = await service.updateDraft(physicianActor, submitted.visitId, {
      expectedDraftVersion: record.draftVersion,
      section: section.section,
      value: section.value,
    });
  }
  return record.draftVersion;
}

async function captureMaterializedKeys(input: {
  prisma: PrismaClient;
  physicianVisitRecordId: string;
  visit: DemoVisit;
  maps: RuntimeIdentityMaps;
}) {
  const { prisma, physicianVisitRecordId, visit, maps } = input;
  const record = await prisma.physicianVisitRecord.findUniqueOrThrow({
    where: { id: physicianVisitRecordId },
    include: {
      diagnosisDecisions: { orderBy: { decisionOrder: "asc" } },
      treatmentDecisions: { orderBy: { decisionOrder: "asc" } },
      procedureDecisions: { orderBy: { decisionOrder: "asc" } },
    },
  });
  visit.diagnoses.forEach((spec, index) => {
    if (spec.action === "ADD") maps.diagnoses.set(spec.key, record.diagnosisDecisions[index].diagnosisId);
  });
  visit.treatments.forEach((spec, index) => {
    if (spec.action === "START") maps.treatments.set(spec.key, record.treatmentDecisions[index].treatmentCourseId);
  });
  visit.procedures.forEach((spec, index) => {
    if (spec.action === "PLAN" && record.procedureDecisions[index].procedurePlanId) {
      maps.procedures.set(spec.key, record.procedureDecisions[index].procedurePlanId!);
    }
  });
}

async function finalizePhysicianVisit(input: {
  prisma: PrismaClient;
  physicianActor: AuthenticatedActor;
  scenario: ClinicianDemoScenario;
  visit: DemoVisit;
  submitted: SubmittedVisit;
  draftVersion: number;
  maps: RuntimeIdentityMaps;
}) {
  const { prisma, physicianActor, scenario, visit, submitted, draftVersion, maps } = input;
  const occurredAt = new Date(visit.occurredAt);
  const lifecycle = new PhysicianVisitLifecycleService(prisma, { now: () => occurredAt, databaseSchema: CLINICIAN_DEMO_SCHEMA });
  await lifecycle.beginEncounter(physicianActor, submitted.visitId);
  const finalized = await new PhysicianVisitLifecycleService(prisma, {
    now: () => finalizedAt(visit.occurredAt),
    databaseSchema: CLINICIAN_DEMO_SCHEMA,
  }).finalize(physicianActor, submitted.visitId, { expectedDraftVersion: draftVersion });
  await captureMaterializedKeys({ prisma, physicianVisitRecordId: finalized.physicianVisitRecord.id, visit, maps });
  await prisma.clinicianAssessment.createMany({
    data: [
      {
        clinicalInterviewId: submitted.clinicalInterviewId,
        assessmentType: "DIAGNOSIS",
        valueJson: {
          diagnosisAr: visit.diagnosisSummary.ar,
          diagnosisEn: visit.diagnosisSummary.en,
          syntheticDemo: true,
        },
        note: scenario.locale === "ar" ? scenario.patientNarrative.ar : scenario.patientNarrative.en,
        createdByUserId: physicianActor.userId,
        createdAt: finalizedAt(visit.occurredAt),
        updatedAt: finalizedAt(visit.occurredAt),
      },
      {
        clinicalInterviewId: submitted.clinicalInterviewId,
        assessmentType: "TREATMENT_PLAN",
        valueJson: {
          summaryAr: visit.treatmentSummary.ar,
          summaryEn: visit.treatmentSummary.en,
          syntheticDemo: true,
        },
        note: scenario.locale === "ar" ? visit.treatmentSummary.ar : visit.treatmentSummary.en,
        createdByUserId: physicianActor.userId,
        createdAt: finalizedAt(visit.occurredAt),
        updatedAt: finalizedAt(visit.occurredAt),
      },
    ],
  });
}

async function reviewSubmittedVisit(input: {
  prisma: PrismaClient;
  physicianActor: AuthenticatedActor;
  scenario: ClinicianDemoScenario;
  visitIndex: number;
  submitted: SubmittedVisit;
}) {
  const { prisma, physicianActor, scenario, visitIndex, submitted } = input;
  if (visitIndex === 0 && scenario.approveHairHistory) {
    await approveHairHistory({ prisma, physicianActor, scenario, submitted });
  } else {
    const reviewedAt = new Date(new Date(scenario.visits[visitIndex].occurredAt).getTime() - 3 * MINUTE);
    await prisma.clinicalInterview.update({
      where: { id: submitted.clinicalInterviewId },
      data: {
        status: "COMPLETED",
        reviewedByUserId: physicianActor.userId,
        reviewedAt,
        completedAt: reviewedAt,
        updatedAt: reviewedAt,
      },
    });
  }
  const context = await new PatientContextService(prisma).readCurrent(physicianActor, submitted.patientId);
  if (context.fingerprint) {
    await new PatientContextService(
      prisma,
      () => new Date(new Date(scenario.visits[visitIndex].occurredAt).getTime() - MINUTE),
    ).review(physicianActor, submitted.visitId, context.fingerprint);
  }
}

export async function verifyClinicianDemoDataset(prisma: PrismaClient) {
  const now = CLINICIAN_DEMO_AS_OF;
  const patients = await prisma.patient.findMany({
    include: {
      profile: true,
      externalIdentifiers: true,
      approvedHairHistory: { include: { items: true } },
      visits: {
        orderBy: [{ visitOccurredAt: "asc" }, { id: "asc" }],
        include: {
          reasons: { include: { reasonDefinition: true } },
          clinicalInterview: true,
          physicianVisitRecord: {
            include: {
              clinicalMeasurements: true,
              anatomicalMap: { include: { regions: true } },
              diagnosisDecisions: true,
              treatmentDecisions: true,
              procedureDecisions: true,
              addenda: true,
            },
          },
        },
      },
    },
  });
  if (patients.length !== CLINICIAN_DEMO_SCENARIOS.length) {
    throw new Error(`Expected ${CLINICIAN_DEMO_SCENARIOS.length} demo patients; found ${patients.length}.`);
  }
  const byMrn = new Map(patients.flatMap((patient) => patient.externalIdentifiers.map((identifier) => [identifier.displayValue, patient] as const)));
  for (const scenario of CLINICIAN_DEMO_SCENARIOS) {
    const patient = byMrn.get(scenario.mrn);
    if (!patient?.profile || patient.profile.fullName !== scenario.name || patient.profile.gender !== scenario.gender) {
      throw new Error(`${scenario.mrn} identity does not match its authored scenario.`);
    }
    if (patient.visits.length !== scenario.visits.length) {
      throw new Error(`${scenario.mrn} expected ${scenario.visits.length} visits; found ${patient.visits.length}.`);
    }
    const primaryReasons = patient.visits.flatMap((visit) => visit.reasons.filter((reason) => reason.role === "PRIMARY").map((reason) => reason.reasonDefinition.code));
    if (scenario.gender === "MALE" && primaryReasons.includes("RV_HAIR_QUALITY")) {
      throw new Error(`${scenario.mrn} violates the female-only Hair Quality boundary.`);
    }
    for (const [index, visit] of patient.visits.entries()) {
      const authored = scenario.visits[index];
      const record = visit.physicianVisitRecord;
      if (visit.visitOccurredAt && visit.visitOccurredAt > now) throw new Error(`${scenario.mrn} has a future Visit.`);
      if (authored.workflowState === "AWAITING_REVIEW") {
        if (record || visit.clinicalInterview?.status !== "UNDER_REVIEW") throw new Error(`${scenario.mrn} awaiting-review state is not preserved.`);
        continue;
      }
      if (!record) throw new Error(`${scenario.mrn} is missing its physician record.`);
      if (authored.workflowState === "DRAFT") {
        if (record.status !== "DRAFT" || record.diagnosisDecisions.length || record.treatmentDecisions.length || record.procedureDecisions.length) {
          throw new Error(`${scenario.mrn} Draft has leaked into canonical physician state.`);
        }
        continue;
      }
      if (record.status !== "FINALIZED" || visit.status !== "COMPLETED" || !visit.visitOccurredAt) {
        throw new Error(`${scenario.mrn} finalized Visit is incomplete.`);
      }
      if (record.diagnosisDecisions.length === 0 || (record.treatmentDecisions.length === 0 && record.procedureDecisions.length === 0)) {
        throw new Error(`${scenario.mrn} finalized Visit lacks a meaningful physician decision.`);
      }
      if (record.anatomicalMap?.regions.some((region) => region.anatomicalRegionCode === null)) {
        throw new Error(`${scenario.mrn} has an unconfirmed finalized anatomical region.`);
      }
    }
    if (scenario.approveHairHistory && !patient.approvedHairHistory) {
      throw new Error(`${scenario.mrn} lacks its approved Patient Hair History.`);
    }
  }

  const longitudinal = CLINICIAN_DEMO_SCENARIOS.filter((scenario) => scenario.visits.filter((visit) => visit.workflowState === "FINALIZED").length > 1);
  if (longitudinal.length < 2) throw new Error("At least two longitudinal finalized demo patients are required.");
  for (const scenario of longitudinal) {
    const patient = byMrn.get(scenario.mrn)!;
    const workspace = await getPhysicianPatientWorkspace(prisma, patient.externalIdentifiers[0].clinicScopeId, patient.id);
    const finalizedCount = workspace?.physicianHairJourney.flatMap((episode) => episode.visits).length ?? 0;
    if (finalizedCount !== scenario.visits.length) throw new Error(`${scenario.mrn} Journey is not derived from all finalized Visits.`);
  }

  const [legacyMeasurements, legacyEvents, legacyJourneys, physicianTreatmentCourses, treatmentStarts, migrationRows] = await Promise.all([
    prisma.measurement.count(),
    prisma.timelineEvent.count(),
    prisma.physicianHairJourney.count(),
    prisma.physicianTreatmentCourse.count(),
    prisma.physicianTreatmentDecision.count({ where: { action: "START" } }),
    prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  ]);
  if (legacyMeasurements || legacyEvents || legacyJourneys) {
    throw new Error("Legacy Journey persistence was populated; canonical finalized Visits must remain the only runtime truth.");
  }
  if (migrationRows[0]?.count !== 20) throw new Error(`Expected exactly 20 applied migrations; found ${migrationRows[0]?.count ?? 0}.`);
  if (physicianTreatmentCourses !== treatmentStarts) {
    throw new Error(`Patient-reported therapy promotion detected: ${physicianTreatmentCourses} physician courses for ${treatmentStarts} physician START decisions.`);
  }

  const correctionPatient = byMrn.get("DEMO-003");
  const corrected = correctionPatient?.approvedHairHistory?.items.some((item) => item.source === "PHYSICIAN" && item.approximateDate?.toISOString().startsWith("2025-11"));
  if (!corrected) throw new Error("DEMO-003 does not preserve the physician-reviewed onset correction.");
  const addenda = patients.flatMap((patient) => patient.visits.flatMap((visit) => visit.physicianVisitRecord?.addenda ?? []));
  if (addenda.length !== 1) throw new Error(`Expected one governed addendum; found ${addenda.length}.`);

  return {
    patients: patients.map((patient) => ({
      patientId: patient.id,
      mrn: patient.externalIdentifiers[0]?.displayValue ?? "—",
      name: patient.profile?.fullName ?? "—",
      visits: patient.visits.map((visit) => ({
        visitId: visit.id,
        state: visit.physicianVisitRecord?.status ?? "AWAITING_REVIEW",
        visitOccurredAt: visit.visitOccurredAt?.toISOString() ?? null,
      })),
    })),
    totals: {
      patients: patients.length,
      visits: patients.reduce((sum, patient) => sum + patient.visits.length, 0),
      finalizedVisits: patients.reduce((sum, patient) => sum + patient.visits.filter((visit) => visit.physicianVisitRecord?.status === "FINALIZED").length, 0),
      draftVisits: patients.reduce((sum, patient) => sum + patient.visits.filter((visit) => visit.physicianVisitRecord?.status === "DRAFT").length, 0),
      awaitingReview: patients.reduce((sum, patient) => sum + patient.visits.filter((visit) => !visit.physicianVisitRecord).length, 0),
      migrations: migrationRows[0].count,
    },
  };
}

export async function seedClinicianDemo(prisma: PrismaClient) {
  const current = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database, current_schema() AS schema`;
  if (current[0]?.schema !== CLINICIAN_DEMO_SCHEMA) {
    throw new Error(`Connected schema is ${current[0]?.schema ?? "unknown"}; expected ${CLINICIAN_DEMO_SCHEMA}.`);
  }
  const existingPatients = await prisma.patient.count();
  if (existingPatients !== 0) {
    throw new Error(`Refusing to seed a non-empty schema (${existingPatients} Patient rows). No rows were changed.`);
  }

  await seedDatabase(prisma);
  const [scope, staff, physician] = await Promise.all([
    prisma.clinicScope.findUniqueOrThrow({ where: { code: "PILOT0" } }),
    prisma.user.findFirstOrThrow({ where: { role: { code: "STAFF" }, isActive: true } }),
    prisma.user.findFirstOrThrow({ where: { role: { code: "PHYSICIAN" }, isActive: true } }),
  ]);
  const staffActor = actor({ userId: staff.id, role: "STAFF", clinicScopeId: scope.id, clinicDeviceId: randomUUID() });
  const physicianActor = actor({ userId: physician.id, role: "PHYSICIAN", clinicScopeId: scope.id });
  const engine = new P01EngineService(prisma);

  for (const scenario of CLINICIAN_DEMO_SCENARIOS) {
    const maps: RuntimeIdentityMaps = { diagnoses: new Map(), treatments: new Map(), procedures: new Map() };
    const submittedVisits: SubmittedVisit[] = [];
    for (const [visitIndex, visit] of scenario.visits.entries()) {
      const submitted = visitIndex === 0
        ? await submitInitialVisit({ prisma, engine, staffActor, scenario, visit })
        : await submitFollowUpVisit({ prisma, engine, staffActor, scenario, visit });
      submittedVisits.push(submitted);
      if (visit.workflowState === "AWAITING_REVIEW") continue;
      await reviewSubmittedVisit({ prisma, physicianActor, scenario, visitIndex, submitted });
      const draftVersion = await savePhysicianDraft({ prisma, physicianActor, scenario, visit, submitted, maps });
      if (visit.workflowState === "DRAFT") continue;
      await finalizePhysicianVisit({ prisma, physicianActor, scenario, visit, submitted, draftVersion, maps });
    }
    if (scenario.addendum) {
      const target = submittedVisits[scenario.addendum.visitIndex];
      if (!target) throw new Error(`${scenario.mrn} addendum target is missing.`);
      await new PhysicianVisitLifecycleService(prisma, {
        now: () => new Date(scenario.addendum!.createdAt),
        databaseSchema: CLINICIAN_DEMO_SCHEMA,
      }).addAddendum(physicianActor, target.visitId, {
        type: scenario.addendum.type,
        content: scenario.addendum.content,
      });
    }
  }
  return verifyClinicianDemoDataset(prisma);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const schema = process.env.CLINICIAN_DEMO_SCHEMA ?? "";
  const target = safeTarget(connectionString, schema);
  console.log(`Verified isolated demo target: ${target.host}:${target.port}/${target.database} schema=${target.schema}`);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
  try {
    const result = process.argv.includes("--verify-only")
      ? await verifyClinicianDemoDataset(prisma)
      : await seedClinicianDemo(prisma);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
