import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { FOLLOW_UP_LIFECYCLE_BY_QUESTION } from "@/lib/follow-up/lifecycle";
import { projectCumulativeFollowUpSnapshot } from "@/lib/follow-up/cumulative-state";
import {
  FOLLOW_UP_CONTEXT_VERSION,
  FOLLOW_UP_SERVER_CONTEXT_VERSION,
  type FollowUpClientEpisodeState,
  type FollowUpDeltaHistoryEntry,
  type FollowUpEpisodeSummary,
  type FollowUpServerContext,
  type FollowUpServerEpisodeState,
  type FollowUpSnapshotEntry,
  type P01FollowUpContext,
} from "@/lib/follow-up/types";
import type { JsonValue, PatientInputJson } from "@/lib/patient-access/service";

type DbClient = PrismaClient | Prisma.TransactionClient;

const CLIENT_SAFE_SNAPSHOT_CODES = new Set([
  "Q_HEALTH_MEDICATION_ITEMS",
  "Q_HEALTH_SUPPLEMENT_ITEMS",
  "Q_HAIR_TREATMENT_ITEMS",
  "Q_HAIR_PROCEDURE_DETAILS",
]);

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function asJson(value: unknown): JsonValue | null {
  if (value === undefined) return null;
  return value as JsonValue;
}

function countRepeatable(entries: FollowUpSnapshotEntry[], questionCodes: string[]): number {
  let count = 0;
  for (const entry of entries) {
    if (!questionCodes.includes(entry.questionCode)) continue;
    if (Array.isArray(entry.value)) count += entry.value.length;
    else if (typeof entry.value === "object" && entry.value !== null) count += 1;
  }
  return count;
}

function physicianRoutedQuestionCodes(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const raw = (value as Record<string, unknown>).questionCodes;
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(Object.keys(FOLLOW_UP_LIFECYCLE_BY_QUESTION));
  return [...new Set(raw.filter((item): item is string => typeof item === "string" && allowed.has(item)))];
}

function physicianChangeDomains(value: unknown): Array<"generalHealth" | "medicationsSupplements" | "hairTreatments" | "hairProcedures" | "triggerEvents" | "sexSpecific" | "hairQualityLifestyle"> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const raw = (value as Record<string, unknown>).changeDomains;
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(["generalHealth", "medicationsSupplements", "hairTreatments", "hairProcedures", "triggerEvents", "sexSpecific", "hairQualityLifestyle"]);
  return [...new Set(raw.filter((item): item is "generalHealth" | "medicationsSupplements" | "hairTreatments" | "hairProcedures" | "triggerEvents" | "sexSpecific" | "hairQualityLifestyle" => typeof item === "string" && allowed.has(item)))];
}

export interface ReturningPatientContextBundle {
  patientInputJson: PatientInputJson;
  serverContext: FollowUpServerContext;
}

/**
 * Builds two views of the longitudinal record:
 * 1) a deliberately limited client-safe context stored in the patient draft;
 * 2) a full server-only context that includes physician-owned signals and is
 *    persisted separately from patientInputJson.
 *
 * Raw physician notes/diagnoses are never placed in the patient draft.
 */
export async function buildReturningPatientContextBundle(input: {
  db: DbClient;
  patientId: string;
  clinicScopeId: string;
  mrnDisplayValue: string;
  contentVersionId: string;
  now: Date;
  baseInput: PatientInputJson;
}): Promise<ReturningPatientContextBundle> {
  const { db, patientId } = input;
  const [patient, episodes, responses, currentReasons, assessments, effectiveResponses, profiles, followUpContexts] = await Promise.all([
    db.patient.findUnique({
      where: { id: patientId },
      select: {
        profile: {
          select: {
            fullName: true,
            dateOfBirth: true,
            gender: true,
            maritalStatus: true,
          },
        },
        externalIdentifiers: {
          where: { clinicScopeId: input.clinicScopeId, identifierType: "CLINIC_MRN" },
          take: 1,
          select: { displayValue: true },
        },
      },
    }),
    db.clinicalEpisode.findMany({
      where: { patientId, status: "ACTIVE" },
      orderBy: { openedAt: "desc" },
      include: {
        visits: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, createdAt: true },
        },
        _count: { select: { visits: true } },
      },
    }),
    db.response.findMany({
      where: {
        questionInstance: {
          clinicalInterview: { visit: { patientId } },
          questionDefinition: { code: { in: Object.keys(FOLLOW_UP_LIFECYCLE_BY_QUESTION) } },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        questionInstance: {
          select: {
            responseScopeType: true,
            responseScopeKey: true,
            questionDefinition: { select: { code: true, textAr: true, textEn: true } },
            clinicalInterview: {
              select: { visit: { select: { id: true, createdAt: true, clinicalEpisodeId: true } } },
            },
          },
        },
      },
    }),
    db.reasonForVisitDefinition.findMany({
      where: { contentVersionId: input.contentVersionId, isActive: true },
      select: { code: true, labelAr: true, labelEn: true },
    }),
    db.clinicianAssessment.findMany({
      where: { clinicalInterview: { visit: { patientId } } },
      orderBy: { createdAt: "desc" },
      select: {
        assessmentType: true,
        valueJson: true,
        note: true,
        createdAt: true,
        clinicalInterview: { select: { id: true, visit: { select: { id: true, clinicalEpisodeId: true } } } },
      },
    }),
    db.dualPerspectiveAssessment.findMany({
      where: {
        assessedAt: { not: null },
        questionInstance: { clinicalInterview: { visit: { patientId } } },
      },
      orderBy: { assessedAt: "desc" },
      select: {
        effectiveValueJson: true,
        effectiveValueSource: true,
        assessedAt: true,
        questionInstance: {
          select: {
            responseScopeType: true,
            responseScopeKey: true,
            questionDefinition: { select: { code: true } },
            clinicalInterview: { select: { visit: { select: { id: true, clinicalEpisodeId: true } } } },
          },
        },
      },
    }),
    db.clinicalEpisodeFollowUpProfile.findMany({
      where: { clinicalEpisode: { patientId } },
      select: {
        clinicalEpisodeId: true,
        sourceVisitId: true,
        routingJson: true,
        patientVisibleSummaryJson: true,
        approvedAt: true,
      },
    }),
    db.followUpVisitContext.findMany({
      where: { visit: { patientId } },
      orderBy: [{ visit: { createdAt: "asc" } }, { visitId: "asc" }],
      select: {
        id: true,
        visitId: true,
        sourceVisitId: true,
        intent: true,
        patientDeltaJson: true,
        visit: { select: { createdAt: true, clinicalEpisodeId: true } },
      },
    }),
  ]);

  if (!patient?.profile) throw new Error("RETURNING_PATIENT_PROFILE_MISSING");

  const reasonLabels = new Map(currentReasons.map((reason) => [reason.code, reason]));
  const profileByEpisode = new Map(profiles.map((profile) => [profile.clinicalEpisodeId, profile]));

  const allSnapshotEntries: FollowUpSnapshotEntry[] = responses.map((response) => {
    const question = response.questionInstance.questionDefinition;
    const visit = response.questionInstance.clinicalInterview.visit;
    return {
      questionCode: question.code,
      labelAr: question.textAr,
      labelEn: question.textEn,
      value: response.valueJson as JsonValue,
      responseScopeType: response.questionInstance.responseScopeType,
      responseScopeKey: response.questionInstance.responseScopeKey,
      sourceResponseId: response.id,
      sourceVisitId: visit.id,
      ...(visit.clinicalEpisodeId ? { sourceEpisodeId: visit.clinicalEpisodeId } : {}),
      sourceVisitAt: visit.createdAt.toISOString(),
      effectiveSource: response.currentSource,
    };
  });

  // The patient draft receives only the narrow state needed for delta entry.
  // Presence of every historical question is represented separately by code only,
  // so the renderer can suppress Initial Intake without exposing old clinical values.
  const recordedQuestionCodes = [...new Set(allSnapshotEntries.map((entry) => entry.questionCode))];
  const latestByIdentity = new Map<string, FollowUpSnapshotEntry>();
  for (const entry of allSnapshotEntries) {
    if (!CLIENT_SAFE_SNAPSHOT_CODES.has(entry.questionCode)) continue;
    const identity = `${entry.questionCode}|${entry.responseScopeType}|${entry.responseScopeKey}`;
    if (!latestByIdentity.has(identity)) latestByIdentity.set(identity, entry);
  }

  // If the physician corrected one of the client-safe current-state values in the
  // latest source visit, that effective value becomes the baseline for the next
  // follow-up. Raw diagnoses, notes, assessments, and unrelated answers remain
  // server-only in FollowUpSessionContext.
  for (const assessment of effectiveResponses) {
    const questionCode = assessment.questionInstance.questionDefinition.code;
    if (!CLIENT_SAFE_SNAPSHOT_CODES.has(questionCode) || assessment.effectiveValueJson === null) continue;
    const identity = `${questionCode}|${assessment.questionInstance.responseScopeType}|${assessment.questionInstance.responseScopeKey}`;
    const current = latestByIdentity.get(identity);
    if (!current || current.sourceVisitId !== assessment.questionInstance.clinicalInterview.visit.id) continue;
    if (assessment.assessedAt && assessment.assessedAt.getTime() < new Date(current.sourceVisitAt).getTime()) continue;
    latestByIdentity.set(identity, {
      ...current,
      value: assessment.effectiveValueJson as JsonValue,
      effectiveSource: "PHYSICIAN",
    });
  }

  const followUpHistory: FollowUpDeltaHistoryEntry[] = followUpContexts.flatMap((context) =>
    context.visit.clinicalEpisodeId && context.patientDeltaJson
      ? [{
          contextId: context.id,
          visitId: context.visitId,
          episodeId: context.visit.clinicalEpisodeId,
          visitAt: context.visit.createdAt.toISOString(),
          ...(context.sourceVisitId ? { sourceVisitId: context.sourceVisitId } : {}),
          intent: context.intent === "NEW_CONCERN" ? "NEW_CONCERN" as const : "EXISTING_CONCERN" as const,
          delta: context.patientDeltaJson as JsonValue,
        }]
      : [],
  );
  const cumulativeClientSnapshot = projectCumulativeFollowUpSnapshot(
    [...latestByIdentity.values()],
    followUpHistory,
  );
  const cumulativeServerSnapshot = projectCumulativeFollowUpSnapshot(
    allSnapshotEntries,
    followUpHistory,
  );

  const serverEpisodeStates: FollowUpServerEpisodeState[] = [];
  const clientEpisodeStates: FollowUpClientEpisodeState[] = [];
  const episodeSummaries: FollowUpEpisodeSummary[] = [];

  for (const episode of episodes) {
    const lastVisit = episode.visits[0];
    if (!lastVisit) continue;
    const label = reasonLabels.get(episode.primaryReasonCode);
    const profile = profileByEpisode.get(episode.id);
    const episodeHistory = followUpHistory.filter((entry) => entry.episodeId === episode.id);
    const patientSnapshot = cumulativeServerSnapshot.filter((entry) =>
      !entry.sourceEpisodeId || entry.sourceEpisodeId === episode.id,
    );
    const clientSnapshot = cumulativeClientSnapshot.filter((entry) =>
      !entry.sourceEpisodeId || entry.sourceEpisodeId === episode.id,
    );

    const episodeAssessments = assessments
      .filter((assessment) => assessment.clinicalInterview.visit.clinicalEpisodeId === episode.id)
      .map((assessment) => ({
        assessmentType: assessment.assessmentType,
        value: asJson(assessment.valueJson),
        note: assessment.note,
        sourceVisitId: assessment.clinicalInterview.visit.id,
        sourceInterviewId: assessment.clinicalInterview.id,
        createdAt: assessment.createdAt.toISOString(),
      }));

    const episodeEffective = effectiveResponses
      .filter((assessment) => assessment.questionInstance.clinicalInterview.visit.clinicalEpisodeId === episode.id)
      .map((assessment) => ({
        questionCode: assessment.questionInstance.questionDefinition.code,
        responseScopeType: assessment.questionInstance.responseScopeType,
        responseScopeKey: assessment.questionInstance.responseScopeKey,
        effectiveValue: asJson(assessment.effectiveValueJson),
        effectiveSource: assessment.effectiveValueSource,
        sourceVisitId: assessment.questionInstance.clinicalInterview.visit.id,
        ...(assessment.assessedAt ? { assessedAt: assessment.assessedAt.toISOString() } : {}),
      }));

    // FPV-6 cutover: legacy Measurement / TimelineEvent persistence is no longer
    // consulted by returning-patient runtime context. Patient follow-up routing is
    // driven by patient longitudinal state plus the explicitly physician-approved
    // follow-up profile; canonical physician measurements/events remain physician-side
    // finalized Visit data and are not copied into the patient follow-up context.
    const episodeMeasurements: FollowUpServerEpisodeState["physician"]["measurements"] = [];
    const episodeTimeline: FollowUpServerEpisodeState["physician"]["timelineEvents"] = [];

    const physicianContextAvailable = Boolean(
      profile || episodeAssessments.length || episodeEffective.length,
    );
    const physicianDates = [
      profile?.approvedAt,
      ...episodeAssessments.map((item) => new Date(item.createdAt)),
      ...episodeEffective.flatMap((item) => item.assessedAt ? [new Date(item.assessedAt)] : []),
    ].filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));
    const lastPhysicianRecordAt = physicianDates.sort((a, b) => b.getTime() - a.getTime())[0];

    episodeSummaries.push({
      id: episode.id,
      primaryReasonCode: episode.primaryReasonCode,
      labelAr: label?.labelAr ?? episode.primaryReasonCode,
      labelEn: label?.labelEn ?? episode.primaryReasonCode,
      lastVisitId: lastVisit.id,
      lastVisitAt: lastVisit.createdAt.toISOString(),
      visitCount: episode._count.visits,
      physicianContextAvailable,
      ...(profile ? { physicianFollowUpProfileApprovedAt: profile.approvedAt.toISOString() } : {}),
    });

    clientEpisodeStates.push({
      episodeId: episode.id,
      primaryReasonCode: episode.primaryReasonCode,
      physicianContextAvailable,
      ...(lastPhysicianRecordAt ? { lastPhysicianRecordAt: lastPhysicianRecordAt.toISOString() } : {}),
      currentTreatmentCount: countRepeatable(clientSnapshot, ["Q_HEALTH_MEDICATION_ITEMS", "Q_HAIR_TREATMENT_ITEMS"]),
      priorProcedureCount: countRepeatable(clientSnapshot, ["Q_HAIR_PROCEDURE_DETAILS", "Q_LASER_CONCERN_DETAILS", "Q_AESTHETIC_DETAILS"]),
      latestMeasurementCodes: [...new Set(episodeMeasurements.map((item) => item.code))],
      importantEventTypes: [...new Set(episodeTimeline.map((item) => item.type))],
      physicianRoutedQuestionCodes: physicianRoutedQuestionCodes(profile?.routingJson),
      physicianChangeDomains: physicianChangeDomains(profile?.routingJson),
    });

    serverEpisodeStates.push({
      episodeId: episode.id,
      primaryReasonCode: episode.primaryReasonCode,
      lastVisitId: lastVisit.id,
      lastVisitAt: lastVisit.createdAt.toISOString(),
      patientSnapshot,
      followUpHistory: episodeHistory,
      physician: {
        assessments: episodeAssessments,
        effectiveResponses: episodeEffective,
        measurements: episodeMeasurements,
        timelineEvents: episodeTimeline,
        routingProfile: asJson(profile?.routingJson),
        patientVisibleSummary: asJson(profile?.patientVisibleSummaryJson),
        ...(profile ? { routingProfileApprovedAt: profile.approvedAt.toISOString() } : {}),
      },
    });
  }

  const context: P01FollowUpContext = {
    version: FOLLOW_UP_CONTEXT_VERSION,
    mode: "RETURNING",
    patientId,
    identity: {
      fullName: patient.profile.fullName,
      dateOfBirth: dateOnly(patient.profile.dateOfBirth),
      sex: patient.profile.gender,
      maritalStatus: patient.profile.maritalStatus,
      mrn: patient.externalIdentifiers[0]?.displayValue ?? input.mrnDisplayValue,
    },
    episodes: episodeSummaries,
    episodeState: clientEpisodeStates,
    recordedQuestionCodes,
    followUpHistory,
    snapshot: {
      generatedAt: input.now.toISOString(),
      entries: cumulativeClientSnapshot,
    },
  };

  const serverContext: FollowUpServerContext = {
    version: FOLLOW_UP_SERVER_CONTEXT_VERSION,
    patientId,
    generatedAt: input.now.toISOString(),
    episodes: serverEpisodeStates,
  };

  return {
    patientInputJson: {
      ...input.baseInput,
      followUp: context as unknown as JsonValue,
    },
    serverContext,
  };
}

/** Backward-compatible helper for tests/utilities that only need the client draft. */
export async function buildReturningPatientDraft(input: Parameters<typeof buildReturningPatientContextBundle>[0]): Promise<PatientInputJson> {
  return (await buildReturningPatientContextBundle(input)).patientInputJson;
}
