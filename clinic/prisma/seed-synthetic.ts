import "dotenv/config";

import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../app/generated/prisma/client";
import { normalizeUsername, usernameLoginEmail } from "../lib/auth/password";
import { P01_CONTENT_VERSION, P01_QUESTION_CONTRACTS } from "../lib/p01/contracts";
import { getP01OfficialQuestionValues, getP01ProfileAndVisit, type P01DraftDocument } from "../lib/p01/engine";
import { P01EngineService } from "../lib/p01/engine-service";
import { officialStateRelationsCreate } from "../lib/submission/official-state-persistence";
import { FOLLOW_UP_CONTEXT_VERSION, type FollowUpDeltaState } from "../lib/follow-up/types";
import { buildSyntheticDraft, SYNTHETIC_CASES as CASES, syntheticInitialMetrics, syntheticInitialVisitAt, type SyntheticCase } from "./synthetic-scenarios";
import { syntheticFollowUpChangesFor, syntheticFollowUpDeltaFor, syntheticFollowUpTrendFor, syntheticFollowUpVisitAt } from "./synthetic-clinical-coherence";
import type { PatientInputJson } from "../lib/patient-access/service";
import { seedDatabase } from "./seed";

const SYNTHETIC_SESSION_PREFIX = "synthetic-";
const SYNTHETIC_MRN_BASE = 900_000_000;

function assertSafeSyntheticDatabase(connectionString: string): void {
  const url = new URL(connectionString);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`Refusing synthetic seed on non-local database host: ${url.hostname}`);
  }
  if (process.env.ALLOW_SYNTHETIC_DATA !== "true") {
    throw new Error("Set ALLOW_SYNTHETIC_DATA=true to seed synthetic clinical data.");
  }
}

function initialDateAt(caseDef: SyntheticCase, hour = 9): Date {
  return syntheticInitialVisitAt(caseDef, hour);
}


async function createRuntimeScaffold(prisma: PrismaClient, input: { caseDef: SyntheticCase; contentVersionId: string; clinicScopeId: string; staffId: string; createdAt: Date }) {
  const { caseDef, contentVersionId, clinicScopeId, staffId, createdAt } = input;
  const invitationAt = new Date(createdAt.getTime() - 45 * 60_000);
  const sessionAt = new Date(createdAt.getTime() - 30 * 60_000);
  const draftStartedAt = new Date(createdAt.getTime() - 25 * 60_000);
  const draftDocument = buildSyntheticDraft(caseDef);
  const mrn = String(SYNTHETIC_MRN_BASE + caseDef.index);
  const patient = await prisma.patient.create({ data: { createdAt: invitationAt, updatedAt: createdAt } });
  await prisma.externalPatientIdentifier.create({ data: { patientId: patient.id, clinicScopeId, normalizedValue: mrn.replaceAll("-", ""), displayValue: mrn, createdAt: invitationAt, updatedAt: createdAt } });
  const occupations = [
    { maleAr: "مهندس", femaleAr: "مهندسة", en: "Engineer" },
    { maleAr: "معلم", femaleAr: "معلمة", en: "Teacher" },
    { maleAr: "محاسب", femaleAr: "محاسبة", en: "Accountant" },
    { maleAr: "طالب", femaleAr: "طالبة", en: "Student" },
    { maleAr: "مدير مشاريع", femaleAr: "مديرة مشاريع", en: "Project manager" },
    { maleAr: "مصمم", femaleAr: "مصممة", en: "Designer" },
    { maleAr: "موظف إداري", femaleAr: "موظفة إدارية", en: "Administrative employee" },
    { maleAr: "صيدلي", femaleAr: "صيدلانية", en: "Pharmacist" },
  ] as const;
  const occupation = occupations[caseDef.index % occupations.length];
  const occupationText = caseDef.locale === "ar" ? (caseDef.gender === "FEMALE" ? occupation.femaleAr : occupation.maleAr) : occupation.en;
  await prisma.patientProfile.create({ data: { patientId: patient.id, fullName: caseDef.name, gender: caseDef.gender, dateOfBirth: new Date(`${caseDef.dob}T00:00:00.000Z`), maritalStatus: caseDef.maritalStatus, occupation: occupationText, createdAt: invitationAt, updatedAt: createdAt } });

  const invitation = await prisma.interviewInvitation.create({ data: { patientId: patient.id, clinicScopeId, createdByUserId: staffId, createdAt: invitationAt, expiresAt: new Date(invitationAt.getTime() + 60 * 60_000) } });
  const session = await prisma.patientAccessSession.create({ data: { invitationId: invitation.id, sessionTokenHash: `${SYNTHETIC_SESSION_PREFIX}${randomUUID()}`, status: "CLOSED", closeReason: "SUBMITTED", lastActivityAt: createdAt, expiresAt: new Date(sessionAt.getTime() + 60 * 60_000), closedAt: createdAt, createdAt: sessionAt, updatedAt: createdAt } });
  const draft = await prisma.draftClinicalInterview.create({ data: { sessionId: session.id, contentVersionId, patientInputJson: { ...draftDocument, synthetic: true, scenarioId: `SYNTHETIC_CASE_${caseDef.index}` } as unknown as Prisma.InputJsonValue, status: "SUBMITTED", expiresAt: new Date(draftStartedAt.getTime() + 60 * 60_000), submittedAt: createdAt, createdAt: draftStartedAt, updatedAt: createdAt } });
  const episode = await prisma.clinicalEpisode.create({ data: { patientId: patient.id, clinicScopeId, primaryReasonCode: caseDef.primary, status: "ACTIVE", openedAt: createdAt, createdAt, updatedAt: createdAt } });
  const visit = await prisma.visit.create({ data: { patientId: patient.id, clinicScopeId, sourceDraftId: draft.id, clinicalEpisodeId: episode.id, visitType: "INITIAL", status: "COMPLETED", createdAt, completedAt: createdAt, updatedAt: createdAt } });
  const pendingInitialReview = caseDef.followUps === 0 && (caseDef.index - 1) % 6 === 0;
  const interview = await prisma.clinicalInterview.create({ data: { visitId: visit.id, status: pendingInitialReview ? "UNDER_REVIEW" : "COMPLETED", completedAt: pendingInitialReview ? undefined : createdAt, createdAt, updatedAt: createdAt } });
  return { mrn, patient, episode, visit, interview, draft };
}

async function createReasonLinks(prisma: PrismaClient, visitId: string, contentVersionId: string, caseDef: SyntheticCase) {
  const reasonCodes = [caseDef.primary, ...(caseDef.additional ?? [])];
  const defs = await prisma.reasonForVisitDefinition.findMany({ where: { contentVersionId, code: { in: reasonCodes } } });
  const byCode = new Map(defs.map((item) => [item.code, item.id]));
  for (const code of reasonCodes) {
    const id = byCode.get(code);
    if (!id) throw new Error(`Missing synthetic reason definition: ${code}`);
    await prisma.visitReason.create({ data: { visitId, reasonDefinitionId: id, role: code === caseDef.primary ? "PRIMARY" : "ADDITIONAL" } });
  }
}

async function createCompleteInitialInterviews(
  prisma: PrismaClient,
  contentVersionId: string,
  casesByIndex: Map<number, Awaited<ReturnType<typeof createRuntimeScaffold>>>,
) {
  const engine = new P01EngineService(prisma);
  const reasonDefinitions = await prisma.reasonForVisitDefinition.findMany({ where: { contentVersionId } });
  const reasonIdByCode = new Map(reasonDefinitions.map((item) => [item.code, item.id]));
  const aestheticDefinitions = await prisma.aestheticProcedureDefinition.findMany({ where: { contentVersionId } });
  const aestheticIdByCode = new Map(aestheticDefinitions.map((item) => [item.code, item.id]));
  const laserDefinitions = await prisma.laserServiceDefinition.findMany({ where: { contentVersionId } });
  const laserIdByCode = new Map(laserDefinitions.map((item) => [item.code, item.id]));

  for (const caseDef of CASES) {
    const runtime = casesByIndex.get(caseDef.index)!;
    const draft = buildSyntheticDraft(caseDef);
    const officialState = await engine.evaluateOfficialState({
      draftId: runtime.draft.id,
      contentVersionId,
      patientInputJson: draft as unknown as PatientInputJson,
    });
    if (officialState.state !== "READY") {
      throw new Error(`Synthetic case ${caseDef.index} official state is ${officialState.state}.`);
    }

    await prisma.clinicalInterview.update({
      where: { id: runtime.interview.id },
      data: officialStateRelationsCreate(officialState),
    });

    const profileAndVisit = getP01ProfileAndVisit(draft as unknown as PatientInputJson);
    for (const code of profileAndVisit.visit.selectedProcedureCodes) {
      const id = aestheticIdByCode.get(code);
      if (!id) throw new Error(`Missing aesthetic procedure definition: ${code}`);
      await prisma.visitAestheticProcedureSelection.create({
        data: {
          visitId: runtime.visit.id,
          procedureDefinitionId: id,
          ...(code === "AP_OTHER" ? { notes: profileAndVisit.visit.aestheticOtherNotes ?? caseText(caseDef, "إجراء تجميلي آخر", "Other procedure") } : {}),
        },
      });
    }
    for (const code of profileAndVisit.visit.selectedLaserServiceCodes) {
      const id = laserIdByCode.get(code);
      if (!id) throw new Error(`Missing laser service definition: ${code}`);
      await prisma.visitLaserServiceSelection.create({
        data: {
          visitId: runtime.visit.id,
          laserServiceDefinitionId: id,
          ...(code === "LASER_OTHER" ? { notes: profileAndVisit.visit.laserOtherNotes ?? caseText(caseDef, "مشكلة ليزر أخرى", "Other laser concern") } : {}),
        },
      });
    }

    for (const reasonCode of [profileAndVisit.visit.primaryReasonCode, ...profileAndVisit.visit.additionalReasonCodes]) {
      if (!reasonIdByCode.has(reasonCode)) throw new Error(`Missing reason definition after scenario build: ${reasonCode}`);
    }
  }
}

function caseText(caseDef: SyntheticCase, ar: string, en: string): string {
  return caseDef.locale === "ar" ? ar : en;
}


function canonicalFollowUpDeltaForRouting(caseDef: SyntheticCase, patientDeltaJson: Prisma.InputJsonValue): FollowUpDeltaState {
  if (caseDef.primary !== "RV_HAIR_LOSS" && caseDef.primary !== "RV_SCALP_SYMPTOMS") return {};
  if (typeof patientDeltaJson !== "object" || patientDeltaJson === null || Array.isArray(patientDeltaJson)) return {};
  const metrics = (patientDeltaJson as Record<string, unknown>).currentMetrics;
  if (typeof metrics !== "object" || metrics === null || Array.isArray(metrics)) return {};
  const out: FollowUpDeltaState["currentMetrics"] = {};
  for (const code of ["SHEDDING", "DENSITY", "ITCH", "BURNING", "SCALP_PAIN"] as const) {
    const value = (metrics as Record<string, unknown>)[code];
    if (typeof value === "number") out[code] = value;
  }
  return { currentMetrics: out };
}

function buildSyntheticFollowUpDraft(input: {
  caseDef: SyntheticCase;
  runtime: Awaited<ReturnType<typeof createRuntimeScaffold>>;
  sourceVisitId: string;
  sourceVisitAt: Date;
  visitCount: number;
  primaryLabelAr: string;
  primaryLabelEn: string;
  createdAt: Date;
  patientDeltaJson: Prisma.InputJsonValue;
}): P01DraftDocument {
  const initial = buildSyntheticDraft(input.caseDef);
  const initialPrivacy = initial.privacy;
  if (!initialPrivacy) {
    throw new Error(`Synthetic case ${input.caseDef.index} is missing privacy evidence.`);
  }

  const officialValues = getP01OfficialQuestionValues(initial as unknown as PatientInputJson);
  const contractByCode = new Map(P01_QUESTION_CONTRACTS.map((contract) => [contract.code, contract]));
  const recordedQuestionCodes = [...new Set(officialValues.map((value) => value.questionCode))];
  const latestMeasurementCodes = input.caseDef.primary === "RV_HAIR_LOSS" || input.caseDef.primary === "RV_SCALP_SYMPTOMS"
    ? ["SHEDDING", "DENSITY", "ITCH", "BURNING", "SCALP_PAIN"]
    : [];

  return {
    locale: input.caseDef.locale,
    answers: { Q_PRIVACY_CONSENT: "YES" },
    privacy: {
      ...initialPrivacy,
      acceptedAt: new Date(input.createdAt.getTime() - 20 * 60_000).toISOString(),
    },
    followUp: {
      version: FOLLOW_UP_CONTEXT_VERSION,
      mode: "RETURNING",
      patientId: input.runtime.patient.id,
      identity: {
        fullName: input.caseDef.name,
        dateOfBirth: input.caseDef.dob,
        sex: input.caseDef.gender,
        maritalStatus: input.caseDef.maritalStatus,
        mrn: input.runtime.mrn,
      },
      episodes: [{
        id: input.runtime.episode.id,
        primaryReasonCode: input.caseDef.primary,
        labelAr: input.primaryLabelAr,
        labelEn: input.primaryLabelEn,
        lastVisitId: input.sourceVisitId,
        lastVisitAt: input.sourceVisitAt.toISOString(),
        visitCount: input.visitCount,
        physicianContextAvailable: true,
      }],
      episodeState: [{
        episodeId: input.runtime.episode.id,
        primaryReasonCode: input.caseDef.primary,
        physicianContextAvailable: true,
        currentTreatmentCount: 0,
        priorProcedureCount: 0,
        latestMeasurementCodes,
        importantEventTypes: [],
        physicianRoutedQuestionCodes: [],
        physicianChangeDomains: [],
      }],
      recordedQuestionCodes,
      snapshot: {
        generatedAt: input.createdAt.toISOString(),
        entries: officialValues.map((value, index) => {
          const contract = contractByCode.get(value.questionCode);
          return {
            questionCode: value.questionCode,
            labelAr: contract?.localized.ar.label ?? value.questionCode,
            labelEn: contract?.localized.en.label ?? value.questionCode,
            value: value.value,
            responseScopeType: value.responseScopeType,
            responseScopeKey: value.responseScopeKey,
            sourceResponseId: `seed-source-${input.caseDef.index}-${index}`,
            sourceVisitId: input.runtime.visit.id,
            sourceEpisodeId: input.runtime.episode.id,
            sourceVisitAt: input.runtime.visit.createdAt.toISOString(),
            effectiveSource: "PATIENT",
          };
        }),
      },
      intent: "EXISTING_CONCERN",
      selectedEpisodeId: input.runtime.episode.id,
      selectedPrimaryReasonCode: input.caseDef.primary,
      sourceVisitId: input.sourceVisitId,
      changes: syntheticFollowUpChangesFor(input.caseDef),
      delta: canonicalFollowUpDeltaForRouting(input.caseDef, input.patientDeltaJson),
      changesReviewed: true,
    },
  };
}



async function createPhysicianClinicalData(
  prisma: PrismaClient,
  casesByIndex: Map<number, Awaited<ReturnType<typeof createRuntimeScaffold>>>,
  physicianId: string,
) {
  const metricDefs = [
    ["SHEDDING", "تساقط الشعر", "Shedding"],
    ["DENSITY", "نقص الكثافة", "Density Loss"],
    ["ITCH", "الحكة", "Itch"],
    ["BURNING", "الحرقان", "Burning"],
    ["SCALP_PAIN", "ألم فروة الرأس", "Scalp Pain"],
  ] as const;
  const engine = new P01EngineService(prisma);
  const metrics = new Map<string, string>();
  for (const [code, ar, en] of metricDefs) {
    const def = await prisma.measurementDefinition.upsert({
      where: { code },
      update: { nameAr: ar, nameEn: en, isActive: true },
      create: { code, nameAr: ar, nameEn: en, unitCode: "0_5", isActive: true },
    });
    metrics.set(code, def.id);
  }

  for (const caseDef of CASES) {
    const runtime = casesByIndex.get(caseDef.index)!;
    // One initial case per pathway intentionally remains patient-submitted / physician-pending.
    // It has a complete patient interview but no physician diagnosis/baseline yet.
    if (runtime.interview.status === "UNDER_REVIEW") continue;
    const assessmentAt = initialDateAt(caseDef, 12);
    await prisma.clinicianAssessment.create({
      data: {
        clinicalInterviewId: runtime.interview.id,
        assessmentType: "DIAGNOSIS",
        valueJson: { diagnosisAr: caseDef.diagnosisAr, diagnosisEn: caseDef.diagnosisEn, synthetic: true },
        note: caseText(caseDef, caseDef.assessmentNoteAr, caseDef.assessmentNoteEn),
        createdByUserId: physicianId,
        createdAt: assessmentAt,
        updatedAt: assessmentAt,
      },
    });
    await prisma.clinicianAssessment.create({
      data: {
        clinicalInterviewId: runtime.interview.id,
        assessmentType: "TREATMENT_PLAN",
        valueJson: {
          planCode: `CASE_${String(caseDef.index).padStart(2, "0")}_CLINICAL_PLAN`,
          followUpMonths: ({ RV_HAIR_LOSS: 3, RV_SCALP_SYMPTOMS: 2, RV_HAIR_QUALITY: 3, RV_DERMATOLOGY: 2, RV_LASER: 2, RV_AESTHETIC_PROCEDURES: 2 } as Record<string, number>)[caseDef.primary],
          synthetic: true,
        },
        note: caseText(
          caseDef,
          `خطة علاجية مرتبطة بالمشكلة الحالية: ${caseDef.diagnosisAr}.`,
          `Treatment plan for the current clinical concern: ${caseDef.diagnosisEn}.`,
        ),
        createdByUserId: physicianId,
        createdAt: assessmentAt,
        updatedAt: assessmentAt,
      },
    });

    let journey: Awaited<ReturnType<typeof prisma.physicianHairJourney.create>> | null = null;
    if (["RV_HAIR_LOSS", "RV_SCALP_SYMPTOMS"].includes(caseDef.primary)) {
      journey = await prisma.physicianHairJourney.create({
        data: {
          patientId: runtime.patient.id,
          startedAt: runtime.visit.createdAt,
          createdAt: runtime.visit.createdAt,
          updatedAt: runtime.visit.createdAt,
        },
      });
      const initialMetrics = syntheticInitialMetrics(caseDef);
      if (!initialMetrics) throw new Error(`Missing initial synthetic metrics for case ${caseDef.index}.`);
      for (const [code] of metricDefs) {
        await prisma.measurement.create({
          data: {
            physicianHairJourneyId: journey.id,
            recordedInVisitId: runtime.visit.id,
            recordedByUserId: physicianId,
            measurementDefinitionId: metrics.get(code)!,
            value: initialMetrics[code],
            measurementDate: runtime.visit.createdAt,
          },
        });
      }
      await prisma.timelineEvent.create({
        data: {
          physicianHairJourneyId: journey.id,
          recordedInVisitId: runtime.visit.id,
          recordedByUserId: physicianId,
          type: "DIAGNOSIS",
          title: caseText(caseDef, caseDef.diagnosisAr, caseDef.diagnosisEn),
          description: caseText(caseDef, caseDef.assessmentNoteAr, caseDef.assessmentNoteEn),
          valueJson: {
            diagnosisAr: caseDef.diagnosisAr,
            diagnosisEn: caseDef.diagnosisEn,
            titleAr: caseDef.diagnosisAr,
            titleEn: caseDef.diagnosisEn,
            descriptionAr: caseDef.assessmentNoteAr,
            descriptionEn: caseDef.assessmentNoteEn,
            synthetic: true,
          },
          eventDate: runtime.visit.createdAt,
          eventDatePrecision: "DAY",
        },
      });
      await prisma.timelineEvent.create({
        data: {
          physicianHairJourneyId: journey.id,
          recordedInVisitId: runtime.visit.id,
          recordedByUserId: physicianId,
          type: "MEDICATION",
          title: caseText(
            caseDef,
            caseDef.primary === "RV_HAIR_LOSS" ? "بدء الخطة العلاجية" : "بدء علاج فروة الرأس",
            caseDef.primary === "RV_HAIR_LOSS" ? "Treatment plan started" : "Scalp treatment started",
          ),
          description: caseText(
            caseDef,
            caseDef.primary === "RV_HAIR_LOSS" ? "بدء علاج الشعر الموجّه من الطبيب." : "بدء علاج فروة الرأس الموجّه من الطبيب.",
            caseDef.primary === "RV_HAIR_LOSS" ? "Initial physician-directed hair treatment." : "Initial physician-directed scalp treatment.",
          ),
          valueJson: {
            status: "STARTED",
            titleAr: caseDef.primary === "RV_HAIR_LOSS" ? "بدء الخطة العلاجية" : "بدء علاج فروة الرأس",
            titleEn: caseDef.primary === "RV_HAIR_LOSS" ? "Treatment plan started" : "Scalp treatment started",
            descriptionAr: caseDef.primary === "RV_HAIR_LOSS" ? "بدء علاج الشعر الموجّه من الطبيب." : "بدء علاج فروة الرأس الموجّه من الطبيب.",
            descriptionEn: caseDef.primary === "RV_HAIR_LOSS" ? "Initial physician-directed hair treatment." : "Initial physician-directed scalp treatment.",
            synthetic: true,
          },
          eventDate: runtime.visit.createdAt,
          eventDatePrecision: "DAY",
        },
      });
    }

    let previousVisit = runtime.visit;
    for (let followUp = 1; followUp <= caseDef.followUps; followUp += 1) {
      const createdAt = syntheticFollowUpVisitAt(caseDef, followUp, 10);
      const externalId = await prisma.externalPatientIdentifier.findFirstOrThrow({ where: { patientId: runtime.patient.id } });
      const sourceDraft = await prisma.draftClinicalInterview.findUniqueOrThrow({ where: { id: runtime.visit.sourceDraftId } });
      const primaryDef = await prisma.reasonForVisitDefinition.findFirstOrThrow({
        where: { contentVersionId: sourceDraft.contentVersionId, code: caseDef.primary },
      });
      const invitationAt = new Date(createdAt.getTime() - 45 * 60_000);
      const sessionAt = new Date(createdAt.getTime() - 30 * 60_000);
      const draftStartedAt = new Date(createdAt.getTime() - 25 * 60_000);
      const invitation = await prisma.interviewInvitation.create({
        data: {
          patientId: runtime.patient.id,
          clinicScopeId: externalId.clinicScopeId,
          createdByUserId: physicianId,
          createdAt: invitationAt,
          expiresAt: new Date(invitationAt.getTime() + 60 * 60_000),
        },
      });
      const session = await prisma.patientAccessSession.create({
        data: {
          invitationId: invitation.id,
          sessionTokenHash: `synthetic-followup-${randomUUID()}`,
          status: "CLOSED",
          closeReason: "SUBMITTED",
          lastActivityAt: createdAt,
          expiresAt: new Date(sessionAt.getTime() + 60 * 60_000),
          closedAt: createdAt,
          createdAt: sessionAt,
          updatedAt: createdAt,
        },
      });
      const patientDeltaJson = syntheticFollowUpDeltaFor(caseDef, followUp) as Prisma.InputJsonValue;
      const followUpDraft = buildSyntheticFollowUpDraft({
        caseDef,
        runtime,
        sourceVisitId: previousVisit.id,
        sourceVisitAt: previousVisit.createdAt,
        visitCount: followUp + 1,
        primaryLabelAr: primaryDef.labelAr,
        primaryLabelEn: primaryDef.labelEn,
        createdAt,
        patientDeltaJson,
      });
      const draft = await prisma.draftClinicalInterview.create({
        data: {
          sessionId: session.id,
          contentVersionId: sourceDraft.contentVersionId,
          patientInputJson: followUpDraft as unknown as Prisma.InputJsonValue,
          status: "SUBMITTED",
          expiresAt: new Date(draftStartedAt.getTime() + 60 * 60_000),
          submittedAt: createdAt,
          createdAt: draftStartedAt,
          updatedAt: createdAt,
        },
      });
      const visit = await prisma.visit.create({
        data: {
          patientId: runtime.patient.id,
          clinicScopeId: externalId.clinicScopeId,
          sourceDraftId: draft.id,
          clinicalEpisodeId: runtime.episode.id,
          visitType: "FOLLOW_UP",
          status: "COMPLETED",
          createdAt,
          completedAt: createdAt,
          updatedAt: createdAt,
        },
      });
      await prisma.visitReason.create({ data: { visitId: visit.id, reasonDefinitionId: primaryDef.id, role: "PRIMARY", createdAt } });
      const interview = await prisma.clinicalInterview.create({
        data: {
          visitId: visit.id,
          status: followUp === caseDef.followUps ? "UNDER_REVIEW" : "COMPLETED",
          completedAt: followUp === caseDef.followUps ? undefined : createdAt,
          createdAt,
          updatedAt: createdAt,
        },
      });
      const officialState = await engine.evaluateOfficialState({
        draftId: draft.id,
        contentVersionId: sourceDraft.contentVersionId,
        patientInputJson: followUpDraft as unknown as PatientInputJson,
      });
      if (officialState.state !== "READY") {
        throw new Error(`Synthetic follow-up ${caseDef.index}.${followUp} official state is ${officialState.state}.`);
      }
      await prisma.clinicalInterview.update({
        where: { id: interview.id },
        data: officialStateRelationsCreate(officialState),
      });
      await prisma.followUpVisitContext.create({
        data: {
          visitId: visit.id,
          sourceVisitId: previousVisit.id,
          intent: "EXISTING_CONCERN",
          snapshotJson: followUpDraft.followUp?.snapshot as unknown as Prisma.InputJsonValue,
          confirmationsJson: followUpDraft.followUp?.changes as unknown as Prisma.InputJsonValue,
          patientDeltaJson,
          createdAt,
        },
      });

      if (journey) {
        const followUpDelta = syntheticFollowUpDeltaFor(caseDef, followUp) as Record<string, unknown>;
        const followUpMetrics = followUpDelta.currentMetrics as Record<string, number> | undefined;
        if (!followUpMetrics) throw new Error(`Missing follow-up synthetic metrics for case ${caseDef.index}.`);
        for (const [code] of metricDefs) {
          await prisma.measurement.create({
            data: {
              physicianHairJourneyId: journey.id,
              recordedInVisitId: visit.id,
              recordedByUserId: physicianId,
              measurementDefinitionId: metrics.get(code)!,
              value: followUpMetrics[code],
              measurementDate: createdAt,
            },
          });
        }
        await prisma.timelineEvent.create({
          data: {
            physicianHairJourneyId: journey.id,
            recordedInVisitId: visit.id,
            recordedByUserId: physicianId,
            type: "MEDICATION",
            title: caseText(caseDef, "مراجعة الخطة العلاجية دون تغيير", "Treatment plan reviewed without change"),
            description: caseText(caseDef, "تمت مراجعة العلاج الحالي والاستمرار عليه دون بدء أو إيقاف علاج جديد.", "Current treatment was reviewed and continued without starting or stopping therapy."),
            valueJson: {
              status: "NO_CHANGE",
              titleAr: "مراجعة الخطة العلاجية دون تغيير",
              titleEn: "Treatment plan reviewed without change",
              descriptionAr: "تمت مراجعة العلاج الحالي والاستمرار عليه دون بدء أو إيقاف علاج جديد.",
              descriptionEn: "Current treatment was reviewed and continued without starting or stopping therapy.",
              synthetic: true,
              followUp,
            },
            eventDate: createdAt,
            eventDatePrecision: "DAY",
          },
        });
      }

      await prisma.clinicianAssessment.create({
        data: {
          clinicalInterviewId: interview.id,
          assessmentType: "FOLLOW_UP_ASSESSMENT",
          valueJson: {
            trend: syntheticFollowUpTrendFor(caseDef, followUp),
            primaryReason: caseDef.primary,
            synthetic: true,
          },
          note: caseText(
            caseDef,
            `المتابعة ${followUp}: تمت مراجعة التغييرات المسجلة منذ الزيارة السابقة.`,
            `Follow-up ${followUp}: changes recorded since the previous visit were reviewed.`,
          ),
          createdByUserId: physicianId,
          createdAt,
          updatedAt: createdAt,
        },
      });
      previousVisit = visit;
    }
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  assertSafeSyntheticDatabase(connectionString);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await seedDatabase(prisma);
    const clinicScope = await prisma.clinicScope.findUniqueOrThrow({ where: { code: "PILOT0" } });
    const contentVersion = await prisma.contentVersion.findUniqueOrThrow({ where: { versionCode: P01_CONTENT_VERSION } });
    const staff = await prisma.user.findUniqueOrThrow({ where: { email: usernameLoginEmail(normalizeUsername(process.env.P01_BOOTSTRAP_STAFF_USERNAME ?? "nurse")) } });
    const physician = await prisma.user.findUniqueOrThrow({ where: { email: usernameLoginEmail(normalizeUsername(process.env.P01_BOOTSTRAP_PHYSICIAN_USERNAME ?? "doctor")) } });

    const syntheticPatientWhere = {
      interviewInvitations: {
        some: {
          session: { is: { sessionTokenHash: { startsWith: SYNTHETIC_SESSION_PREFIX } } },
        },
      },
    } as const;

    // Idempotent refresh: identify this script's prior patients by an internal session marker, never by a physician-visible MRN.
    const prior = await prisma.patient.findMany({ where: syntheticPatientWhere, select: { id: true } });
    if (prior.length) {
      const ids = prior.map((item) => item.id);
      // Runtime graph has Restrict FKs; local synthetic refresh is intentionally handled by TRUNCATE only when the database contains no non-synthetic patients.
      const totalPatients = await prisma.patient.count();
      if (totalPatients !== ids.length) {
        throw new Error("Synthetic refresh found non-synthetic patients. Run the explicit db:clear:patients command first if you intend to replace all local runtime data.");
      }
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "Patient", "InterviewInvitation" CASCADE');
    }

    const casesByIndex = new Map<number, Awaited<ReturnType<typeof createRuntimeScaffold>>>();
    for (const caseDef of CASES) {
      const runtime = await createRuntimeScaffold(prisma, { caseDef, contentVersionId: contentVersion.id, clinicScopeId: clinicScope.id, staffId: staff.id, createdAt: initialDateAt(caseDef) });
      await createReasonLinks(prisma, runtime.visit.id, contentVersion.id, caseDef);
      casesByIndex.set(caseDef.index, runtime);
    }

    await createCompleteInitialInterviews(prisma, contentVersion.id, casesByIndex);
    await createPhysicianClinicalData(prisma, casesByIndex, physician.id);

    const coveredCodes = await prisma.questionInstance.findMany({
      where: { clinicalInterview: { visit: { patient: syntheticPatientWhere } } },
      select: { questionDefinition: { select: { code: true } } },
    });
    const covered = new Set(coveredCodes.map((item) => item.questionDefinition.code));
    const missing = P01_QUESTION_CONTRACTS.map((item) => item.code).filter((code) => !covered.has(code));
    if (missing.length) throw new Error(`Synthetic question coverage incomplete: ${missing.join(", ")}`);

    const [patients, visits, followUps, assessments, measurements, events] = await Promise.all([
      prisma.patient.count({ where: syntheticPatientWhere }),
      prisma.visit.count({ where: { patient: syntheticPatientWhere } }),
      prisma.visit.count({ where: { visitType: "FOLLOW_UP", patient: syntheticPatientWhere } }),
      prisma.clinicianAssessment.count({
        where: { clinicalInterview: { visit: { patient: syntheticPatientWhere } } },
      }),
      prisma.measurement.count({
        where: { physicianHairJourney: { patient: syntheticPatientWhere } },
      }),
      prisma.timelineEvent.count({
        where: { physicianHairJourney: { patient: syntheticPatientWhere } },
      }),
    ]);

    console.log("Synthetic clinical dataset ready.");
    console.log(`Patients: ${patients}`);
    console.log(`Visits: ${visits} (follow-ups: ${followUps})`);
    console.log(`Physician assessments: ${assessments}`);
    console.log(`Measurements: ${measurements}`);
    console.log(`Timeline events: ${events}`);
    console.log(`Question coverage: ${covered.size}/${P01_QUESTION_CONTRACTS.length}`);
    console.log("Scenario cohort: 36 complete patients — six per Pilot 0 primary pathway, with male/female, initial intake, branch variation, and follow-up diversity.");
    console.log("Synthetic patients use ordinary numeric test MRNs; fixture identity remains internal to the seed harness.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
