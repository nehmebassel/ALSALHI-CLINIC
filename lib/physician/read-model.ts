import type { PrismaClient } from "@/app/generated/prisma/client";
import { localeNumber } from "@/lib/p01/locale";

import { buildPhysicianCaseSummary } from "./case-summary";
import { effectivePathwayCodesForEpisode, isPhysicianQueueReviewPending, resolvePhysicianCapabilities, resolvePhysicianHairWorkflow, resolvePhysicianPatientReviewState } from "./capabilities";
import { buildClinicalStory, buildClinicalStorySummary } from "./clinical-story";
import { derivePatientHairHistory, effectiveReviewedHairHistoryItems } from "./hair-history";
import { buildCanonicalPhysicianHairJourney, type CanonicalJourneyEpisodeInput } from "./hair-journey";
import { buildPhysicianCumulativeFollowUpSections, mergeInterviewQuestions } from "./follow-up-presentation";
import { ageAt } from "./presentation";
import { comparePhysicianVisitChronology, selectPhysicianReviewVisit } from "./workspace-flow";

import type {
  PhysicianDiagnosisSummary,
  PhysicianEpisodeDetail,
  PhysicianInterviewQuestion,
  PhysicianPatientWorkspaceData,
  PhysicianQueuePatient,
  PhysicianQueueSummary,
  PhysicianVisitSummary,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConsultationContext(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase();
  return normalized.startsWith("استشارة") || /\bconsultation\b/.test(normalized);
}

export function diagnosisFrom(value: unknown): PhysicianDiagnosisSummary | undefined {
  if (isRecord(value)) {
    const ar = typeof value.diagnosisAr === "string" ? value.diagnosisAr : undefined;
    const en = typeof value.diagnosisEn === "string" ? value.diagnosisEn : undefined;
    if ((ar || en) && ![ar, en].filter((item): item is string => Boolean(item)).some(isConsultationContext)) {
      return { ar: ar ?? en!, en: en ?? ar! };
    }
  }
  return undefined;
}

function latestAssessment<T extends { assessmentType: string; valueJson: unknown; note: string | null; createdAt: Date }>(
  assessments: T[],
  type: string,
): T | undefined {
  return assessments
    .filter((assessment) => assessment.assessmentType === type)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

function primaryReason(visit: { reasons: Array<{ role: string; reasonDefinition: { code: string; labelAr: string; labelEn: string } }> }) {
  return visit.reasons.find((reason) => reason.role === "PRIMARY")?.reasonDefinition;
}

function additionalReasons(visit: { reasons: Array<{ role: string; reasonDefinition: { labelAr: string; labelEn: string } }> }) {
  return visit.reasons
    .filter((reason) => reason.role === "ADDITIONAL")
    .map((reason) => ({ ar: reason.reasonDefinition.labelAr, en: reason.reasonDefinition.labelEn }));
}

export async function getPhysicianQueue(
  prisma: PrismaClient,
  clinicScopeId: string,
): Promise<{ queue: PhysicianQueuePatient[]; summary: PhysicianQueueSummary }> {
  const patients = await prisma.patient.findMany({
    where: { externalIdentifiers: { some: { clinicScopeId } } },
    take: 200,
    include: {
      profile: true,
      externalIdentifiers: { where: { clinicScopeId }, take: 1 },
      approvedHairHistory: { select: { approvedVisitId: true, revision: true } },
      visits: {
        orderBy: { createdAt: "desc" },
        include: {
          clinicalEpisode: true,
          reasons: { include: { reasonDefinition: true } },
          clinicalInterview: {
            include: { clinicianAssessments: true },
          },
        },
      },
    },
  });

  const queue: PhysicianQueuePatient[] = patients
    .filter((patient) => patient.profile && patient.visits.length > 0)
    .map((patient) => {
      const profile = patient.profile!;
      const latestVisit = patient.visits[0];
      const episodeMap = new Map<string, PhysicianQueuePatient["episodes"][number]>();
      let pendingCount = 0;
      let latestDiagnosis: PhysicianDiagnosisSummary | undefined;

      const approvedHairHistoryVisitId = patient.approvedHairHistory && patient.approvedHairHistory.revision > 0
        ? patient.approvedHairHistory.approvedVisitId
        : undefined;
      const approvedHairHistoryRevision = patient.approvedHairHistory?.revision;
      const reviewPendingForVisit = (visit: (typeof patient.visits)[number]) => Boolean(visit.clinicalInterview) && isPhysicianQueueReviewPending({
        interviewStatus: visit.clinicalInterview!.status,
        visitType: visit.visitType,
        visitId: visit.id,
        ...(approvedHairHistoryVisitId ? { approvedHairHistoryVisitId } : {}),
        ...(approvedHairHistoryRevision !== undefined ? { approvedHairHistoryRevision } : {}),
      });

      for (const visit of patient.visits) {
        const visitPending = reviewPendingForVisit(visit);
        if (visitPending) pendingCount += 1;
        if (!latestDiagnosis && visit.clinicalInterview) {
          const diagnosis = latestAssessment(visit.clinicalInterview.clinicianAssessments, "DIAGNOSIS");
          latestDiagnosis = diagnosis ? diagnosisFrom(diagnosis.valueJson) : undefined;
        }
        const primary = primaryReason(visit);
        const key = visit.clinicalEpisodeId ?? `${patient.id}:${primary?.code ?? "UNKNOWN"}`;
        const existing = episodeMap.get(key);
        if (existing) {
          existing.visitCount += 1;
          if (visitPending) existing.pendingCount += 1;
        } else {
          episodeMap.set(key, {
            id: key,
            primary: { ar: primary?.labelAr ?? "—", en: primary?.labelEn ?? "—" },
            status: visit.clinicalEpisode?.status ?? "ACTIVE",
            visitCount: 1,
            pendingCount: visitPending ? 1 : 0,
            lastVisitAt: visit.createdAt.toISOString(),
          });
        }
      }

      const episodes = [...episodeMap.values()].sort((a, b) => b.lastVisitAt.localeCompare(a.lastVisitAt));
      return {
        patientId: patient.id,
        name: profile.fullName,
        mrn: patient.externalIdentifiers[0]?.displayValue ?? "—",
        gender: profile.gender,
        dateOfBirth: profile.dateOfBirth.toISOString(),
        latestAt: latestVisit.createdAt.toISOString(),
        latestVisitType: latestVisit.visitType,
        totalVisits: patient.visits.length,
        pendingCount,
        latestHairHistoryApproved: latestVisit.visitType === "INITIAL" && approvedHairHistoryVisitId === latestVisit.id,
        activeEpisodeCount: episodes.filter((episode) => episode.status === "ACTIVE").length,
        ...(latestDiagnosis ? { latestDiagnosis } : {}),
        episodes,
      };
    })
    .sort((a, b) => {
      if ((a.pendingCount > 0) !== (b.pendingCount > 0)) return a.pendingCount > 0 ? -1 : 1;
      return b.latestAt.localeCompare(a.latestAt);
    });

  return {
    queue,
    summary: {
      patients: queue.length,
      pendingInterviews: queue.reduce((sum, patient) => sum + patient.pendingCount, 0),
      followUpsPending: queue.filter((patient) => patient.pendingCount > 0 && patient.latestVisitType === "FOLLOW_UP").length,
      activeEpisodes: queue.reduce((sum, patient) => sum + patient.activeEpisodeCount, 0),
    },
  };
}

export async function getPhysicianPatientWorkspace(
  prisma: PrismaClient,
  clinicScopeId: string,
  patientId: string,
): Promise<PhysicianPatientWorkspaceData | null> {
  const clinicalReferenceAt = new Date().toISOString();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, externalIdentifiers: { some: { clinicScopeId } } },
    include: {
      profile: true,
      externalIdentifiers: { where: { clinicScopeId }, take: 1 },
      clinicalEpisodes: { orderBy: { openedAt: "desc" } },
      hairHistoryDraft: { include: { items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } },
      approvedHairHistory: { include: { items: { orderBy: [{ approximateDate: "asc" }, { createdAt: "asc" }] } } },
      visits: {
        orderBy: { createdAt: "desc" },
        include: {
          clinicalEpisode: true,
          reasons: { include: { reasonDefinition: true } },
          followUpContext: true,
          physicianVisitRecord: {
            include: {
              clinicalMeasurements: { orderBy: { code: "asc" } },
              patternAssessment: true,
              trichoscopy: { include: { findings: { orderBy: { createdAt: "asc" } } } },
              anatomicalMap: { include: { regions: { select: { view: true, anatomicalRegionCode: true, geometry: true, noteText: true } } } },
              diagnosisDecisions: { orderBy: [{ decisionOrder: "asc" }, { id: "asc" }] },
              treatmentDecisions: { orderBy: [{ decisionOrder: "asc" }, { id: "asc" }] },
              procedureDecisions: { orderBy: [{ decisionOrder: "asc" }, { id: "asc" }] },
            },
          },
          clinicalInterview: {
            include: {
              activePathways: {
                include: { pathwayDefinition: { select: { code: true } } },
              },
              clinicianAssessments: { orderBy: { createdAt: "desc" } },
              questionInstances: {
                include: {
                  questionDefinition: {
                    include: {
                      options: { orderBy: { sortOrder: "asc" } },
                      clinicalLibrary: true,
                      questionGroup: true,
                    },
                  },
                  response: { include: { repeatableItems: { orderBy: { sortOrder: "asc" } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!patient?.profile) return null;

  const approvedHairHistoryRecord = patient.approvedHairHistory && patient.approvedHairHistory.revision > 0
    ? patient.approvedHairHistory
    : null;

  const toVisitSummary = (visit: (typeof patient.visits)[number]): PhysicianVisitSummary | null => {
    if (!visit.clinicalInterview) return null;
    const primary = primaryReason(visit);
    const diagnosisAssessment = latestAssessment(visit.clinicalInterview.clinicianAssessments, "DIAGNOSIS");
    const diagnosis = diagnosisAssessment ? diagnosisFrom(diagnosisAssessment.valueJson) : undefined;
    const patientReviewState = resolvePhysicianPatientReviewState({
      interviewStatus: visit.clinicalInterview.status,
      visitType: visit.visitType,
      visitId: visit.id,
      ...(approvedHairHistoryRecord ? {
        approvedHairHistoryVisitId: approvedHairHistoryRecord.approvedVisitId,
        approvedHairHistoryRevision: approvedHairHistoryRecord.revision,
      } : {}),
    });
    return {
      id: visit.id,
      createdAt: visit.createdAt.toISOString(),
      ...(visit.visitOccurredAt ? { visitOccurredAt: visit.visitOccurredAt.toISOString() } : {}),
      ...(visit.completedAt ? { completedAt: visit.completedAt.toISOString() } : {}),
      visitType: visit.visitType,
      visitStatus: visit.status,
      interviewId: visit.clinicalInterview.id,
      interviewStatus: visit.clinicalInterview.status,
      patientReviewState,
      ...(visit.physicianVisitRecord ? { physicianRecordStatus: visit.physicianVisitRecord.status } : {}),
      primaryCode: primary?.code ?? "UNKNOWN",
      primary: { ar: primary?.labelAr ?? "—", en: primary?.labelEn ?? "—" },
      additionalCodes: visit.reasons.filter((reason) => reason.role === "ADDITIONAL").map((reason) => reason.reasonDefinition.code),
      additional: additionalReasons(visit),
      ...(visit.clinicalEpisodeId ? { episodeId: visit.clinicalEpisodeId } : {}),
      ...(diagnosis ? { diagnosis } : {}),
      hasFollowUpDelta: Boolean(visit.followUpContext?.patientDeltaJson),
    };
  };

  const visits = patient.visits.map(toVisitSummary).filter((visit): visit is PhysicianVisitSummary => Boolean(visit));
  const reviewVisit = selectPhysicianReviewVisit(visits);
  const reviewInterview = reviewVisit
    ? patient.visits.find((visit) => visit.clinicalInterview?.id === reviewVisit.interviewId)?.clinicalInterview
    : undefined;

  const toInterviewQuestions = (interview: typeof reviewInterview): PhysicianInterviewQuestion[] => [...(interview?.questionInstances ?? [])]
    .filter((instance) => instance.response)
    .sort((a, b) => a.questionDefinition.sortOrder - b.questionDefinition.sortOrder)
    .map((instance) => ({
      id: instance.id,
      responseId: instance.response!.id,
      code: instance.questionDefinition.code,
      text: { ar: instance.questionDefinition.textAr, en: instance.questionDefinition.textEn },
      ...(instance.questionDefinition.helpAr || instance.questionDefinition.helpEn
        ? { help: { ar: instance.questionDefinition.helpAr ?? "", en: instance.questionDefinition.helpEn ?? "" } }
        : {}),
      library: { ar: instance.questionDefinition.clinicalLibrary.nameAr, en: instance.questionDefinition.clinicalLibrary.nameEn },
      group: {
        ar: instance.questionDefinition.questionGroup.titleAr ?? instance.questionDefinition.clinicalLibrary.nameAr,
        en: instance.questionDefinition.questionGroup.titleEn ?? instance.questionDefinition.clinicalLibrary.nameEn,
      },
      responseType: instance.questionDefinition.responseType,
      responseScopeType: instance.responseScopeType,
      responseScopeKey: instance.responseScopeKey,
      currentSource: instance.response!.currentSource,
      value: instance.response!.valueJson,
      repeatableItems: instance.response!.repeatableItems.map((item) => item.valueJson),
      options: instance.questionDefinition.options.map((option) => ({ code: option.code, ar: option.labelAr, en: option.labelEn })),
      editableByPhysician: instance.questionDefinition.editableByPhysician,
    }));

  const reviewQuestions: PhysicianInterviewQuestion[] = toInterviewQuestions(reviewInterview);
  const effectivePathwayCodes = effectivePathwayCodesForEpisode(patient.visits, reviewVisit?.episodeId);
  const capabilities = resolvePhysicianCapabilities(effectivePathwayCodes);
  const initialSourceVisit = [...patient.visits]
    .reverse()
    .find((visit) =>
      visit.visitType === "INITIAL"
      && Boolean(visit.clinicalInterview)
      && (!reviewVisit?.episodeId || visit.clinicalEpisodeId === reviewVisit.episodeId),
    )
    ?? [...patient.visits].reverse().find((visit) => visit.visitType === "INITIAL" && Boolean(visit.clinicalInterview))
    ?? [...patient.visits].reverse().find((visit) => Boolean(visit.clinicalInterview));
  const initialVisit = initialSourceVisit ? toVisitSummary(initialSourceVisit) ?? undefined : undefined;
  const initialQuestions: PhysicianInterviewQuestion[] = toInterviewQuestions(initialSourceVisit?.clinicalInterview);
  const effectiveQuestions = mergeInterviewQuestions(initialQuestions, reviewQuestions);
  const presentationAuditSignals: import("./types").PhysicianPresentationAuditSignal[] = [];
  const presentationAuditKeys = new Set<string>();
  const reportPresentationAuditSignal = (signal: import("./types").PhysicianPresentationAuditSignal) => {
    const key = `${signal.code}:${signal.questionCode}:${signal.fieldPath}`;
    if (!presentationAuditKeys.has(key)) {
      presentationAuditKeys.add(key);
      presentationAuditSignals.push(signal);
    }
  };
  const followUpSections = reviewVisit?.visitType === "FOLLOW_UP"
    ? buildPhysicianCumulativeFollowUpSections(
        patient.visits
          .filter((visit) =>
            visit.visitType === "FOLLOW_UP"
            && visit.clinicalEpisodeId === reviewVisit.episodeId
            && visit.createdAt.getTime() <= new Date(reviewVisit.createdAt).getTime()
            && Boolean(visit.followUpContext?.patientDeltaJson),
          )
          .map((visit) => ({
            visitId: visit.id,
            visitAt: visit.createdAt.toISOString(),
            delta: visit.followUpContext!.patientDeltaJson,
          })),
        reportPresentationAuditSignal,
      )
    : [];

  const reasonByEpisode = new Map<string, { code: string; ar: string; en: string }>();
  for (const visit of patient.visits) {
    if (!visit.clinicalEpisodeId) continue;
    const primary = primaryReason(visit);
    if (primary && !reasonByEpisode.has(visit.clinicalEpisodeId)) {
      reasonByEpisode.set(visit.clinicalEpisodeId, { code: primary.code, ar: primary.labelAr, en: primary.labelEn });
    }
  }

  const episodes: PhysicianEpisodeDetail[] = patient.clinicalEpisodes.map((episode) => {
    const reason = reasonByEpisode.get(episode.id);
    return {
      id: episode.id,
      primary: { ar: reason?.ar ?? "—", en: reason?.en ?? "—" },
      status: episode.status,
      openedAt: episode.openedAt.toISOString(),
      ...(episode.closedAt ? { closedAt: episode.closedAt.toISOString() } : {}),
      visits: visits.filter((visit) => visit.episodeId === episode.id).sort((a, b) => comparePhysicianVisitChronology(b, a)),
    };
  });

  const canonicalJourneyEpisodes: CanonicalJourneyEpisodeInput[] = patient.clinicalEpisodes.flatMap((episode) => {
    const pathwayCodes = effectivePathwayCodesForEpisode(patient.visits, episode.id);
    if (!pathwayCodes.includes("HAIR_SCALP_PATHWAY")) return [];
    const reason = reasonByEpisode.get(episode.id);
    const canonicalVisits = patient.visits
      .filter((visit) => visit.clinicalEpisodeId === episode.id)
      .flatMap((visit) => {
        const record = visit.physicianVisitRecord;
        if (!record || record.status !== "FINALIZED" || !visit.visitOccurredAt || !record.finalizedAt) return [];
        return [{
          visitId: visit.id,
          physicianVisitRecordId: record.id,
          episodeId: episode.id,
          visitType: visit.visitType,
          visitOccurredAt: visit.visitOccurredAt,
          finalizedAt: record.finalizedAt,
          measurements: record.clinicalMeasurements.map((measurement) => ({ code: measurement.code, value: measurement.value })),
          ...(record.patternAssessment ? {
            pattern: {
              sinclair: record.patternAssessment.sinclair,
              mcuFvBasic: record.patternAssessment.mcuFvBasic,
              mcuFvFrontal: record.patternAssessment.mcuFvFrontal,
              mcuFvVertex: record.patternAssessment.mcuFvVertex,
              hairLineMidlineCm: record.patternAssessment.hairLineMidlineCm === null ? null : Number(record.patternAssessment.hairLineMidlineCm),
              hairLineRightSideCm: record.patternAssessment.hairLineRightSideCm === null ? null : Number(record.patternAssessment.hairLineRightSideCm),
              hairLineLeftSideCm: record.patternAssessment.hairLineLeftSideCm === null ? null : Number(record.patternAssessment.hairLineLeftSideCm),
            },
          } : {}),
          ...(record.trichoscopy ? {
            trichoscopy: {
              findingCodes: record.trichoscopy.findings.map((finding) => finding.code),
              otherFindingText: record.trichoscopy.otherFindingText,
            },
          } : {}),
          ...(record.anatomicalMap ? { anatomicalMap: { regions: record.anatomicalMap.regions.map((region) => ({
            view: region.view,
            ...(region.anatomicalRegionCode ? { anatomicalRegionCode: region.anatomicalRegionCode } : {}),
            geometry: region.geometry,
            ...(region.noteText ? { noteText: region.noteText } : {}),
          })) } } : {}),
          diagnoses: record.diagnosisDecisions.map((decision) => ({
            id: decision.id, diagnosisId: decision.diagnosisId, action: decision.action, text: decision.text, decisionOrder: decision.decisionOrder,
          })),
          treatments: record.treatmentDecisions.map((decision) => ({
            id: decision.id, treatmentCourseId: decision.treatmentCourseId, action: decision.action, name: decision.name,
            regimenText: decision.regimenText, noteText: decision.noteText, setsName: decision.setsName, setsRegimen: decision.setsRegimen,
            setsNote: decision.setsNote, decisionOrder: decision.decisionOrder,
          })),
          procedures: record.procedureDecisions.map((decision) => ({
            id: decision.id, procedurePlanId: decision.procedurePlanId, action: decision.action, procedureCode: decision.procedureCode,
            otherProcedureText: decision.otherProcedureText, plannedDate: decision.plannedDate, performedDate: decision.performedDate,
            noteText: decision.noteText, decisionOrder: decision.decisionOrder,
          })),
        }];
      });
    return [{
      episodeId: episode.id,
      primary: { ar: reason?.ar ?? "—", en: reason?.en ?? "—" },
      status: episode.status,
      visits: canonicalVisits,
    }];
  });
  const physicianHairJourney = buildCanonicalPhysicianHairJourney(canonicalJourneyEpisodes);
  const currentJourneyEpisode = reviewVisit
    ? physicianHairJourney.find((episode) => episode.episodeId === reviewVisit.episodeId)
    : physicianHairJourney[0];
  const measurementSeries = currentJourneyEpisode?.measurementSeries ?? [];
  const journeyTimeline = currentJourneyEpisode?.timeline ?? [];
  const latestDiagnosis = visits.find((visit) => visit.diagnosis)?.diagnosis;

  const historySourceVisit = initialSourceVisit;
  const historySourceQuestions = initialQuestions;
  const derivedHairHistory = derivePatientHairHistory(
    historySourceQuestions,
    historySourceVisit?.id,
    historySourceVisit?.createdAt.toISOString(),
  );

  const draftHairHistory = patient.hairHistoryDraft
    ? {
        status: patient.hairHistoryDraft.status,
        sourceVisitId: patient.hairHistoryDraft.sourceVisitId,
        sourceVisitAt: historySourceVisit?.createdAt.toISOString(),
        baseRevision: patient.hairHistoryDraft.baseRevision,
        ...(patient.hairHistoryDraft.lastEditedAt ? { lastEditedAt: patient.hairHistoryDraft.lastEditedAt.toISOString() } : {}),
        items: patient.hairHistoryDraft.items.map((item) => ({
          id: item.id,
          layer: item.layer,
          itemType: item.itemType,
          label: { ar: item.labelAr, en: item.labelEn },
          value: item.valueJson,
          ...(item.approximateDate ? { date: item.approximateDate.toISOString() } : {}),
          datePrecision: item.datePrecision,
          source: item.source,
          included: item.isIncluded,
          editable: true,
          ...(item.sourceQuestionCode ? { sourceQuestionCode: item.sourceQuestionCode } : {}),
          ...(item.sourceScopeKey ? { sourceScopeKey: item.sourceScopeKey } : {}),
          ...(item.sourceResponseId ? { sourceResponseId: item.sourceResponseId } : {}),
          ...(item.sourceItemIndex !== null ? { sourceItemIndex: item.sourceItemIndex } : {}),
        })),
      }
    : null;

  const approvedHairHistoryData = approvedHairHistoryRecord
    ? {
        status: "APPROVED_READ_ONLY" as const,
        sourceVisitId: historySourceVisit?.id,
        sourceVisitAt: historySourceVisit?.createdAt.toISOString(),
        baseRevision: approvedHairHistoryRecord.revision,
        approvedRevision: approvedHairHistoryRecord.revision,
        approvedAt: approvedHairHistoryRecord.approvedAt.toISOString(),
        items: approvedHairHistoryRecord.items.map((item) => {
          const payload = isRecord(item.valueJson) ? item.valueJson : {};
          const provenance = isRecord(payload.provenance) ? payload.provenance : {};
          const layer = typeof payload.layer === "string" ? payload.layer : "SYMPTOMS";
          const labelAr = typeof payload.labelAr === "string" ? payload.labelAr : item.itemType;
          const labelEn = typeof payload.labelEn === "string" ? payload.labelEn : item.itemType;
          const value = Object.prototype.hasOwnProperty.call(payload, "value") ? payload.value : item.valueJson;
          return {
            id: item.id,
            layer: layer as PhysicianPatientWorkspaceData["hairHistory"]["items"][number]["layer"],
            itemType: item.itemType,
            label: { ar: labelAr, en: labelEn },
            value,
            ...(item.approximateDate ? { date: item.approximateDate.toISOString() } : {}),
            datePrecision: item.datePrecision,
            source: item.source === "PHYSICIAN" ? "PHYSICIAN" as const : "PATIENT" as const,
            included: true,
            editable: false,
            ...(typeof provenance.questionCode === "string" && provenance.questionCode ? { sourceQuestionCode: provenance.questionCode } : {}),
            ...(typeof provenance.scopeKey === "string" && provenance.scopeKey ? { sourceScopeKey: provenance.scopeKey } : {}),
            ...(typeof provenance.responseId === "string" && provenance.responseId ? { sourceResponseId: provenance.responseId } : {}),
            ...(typeof provenance.itemIndex === "number" && provenance.itemIndex >= 0 ? { sourceItemIndex: provenance.itemIndex } : {}),
          };
        }),
      }
    : null;

  const selectedHairHistory = draftHairHistory ?? approvedHairHistoryData ?? derivedHairHistory;
  const hairHistory = {
    ...selectedHairHistory,
    items: effectiveReviewedHairHistoryItems(selectedHairHistory.items),
    clinicalReferenceAt,
  };
  const approvedHairHistory = approvedHairHistoryRecord
    ? { approvedAt: approvedHairHistoryRecord.approvedAt.toISOString(), itemCount: approvedHairHistoryRecord.items.length }
    : null;
  const hairWorkflow = resolvePhysicianHairWorkflow({
    visitType: reviewVisit?.visitType,
    hairHistoryAvailable: capabilities.hairHistory,
    physicianHairJourneyAvailable: capabilities.physicianHairJourney,
    physicianHairJourneyHasFinalizedData: Boolean(currentJourneyEpisode),
    hairHistoryStatus: hairHistory.status,
    hasApprovedRevision: Boolean(approvedHairHistoryRecord),
  });
  const caseSummary = buildPhysicianCaseSummary({
    questions: effectiveQuestions,
    ...(reviewVisit ? { reviewVisit } : {}),
    measurementSeries: capabilities.physicianHairJourney ? measurementSeries : [],
    historyApproved: Boolean(approvedHairHistory),
    hairHistoryApplicable: capabilities.hairHistory,
    hairHistoryReviewRequired: hairWorkflow.hairHistoryReviewRequired,
    physicianJourneyApplicable: capabilities.physicianHairJourney,
    physicianJourneyHasData: Boolean(currentJourneyEpisode),
    patientHairHistory: hairHistory,
    ...(latestDiagnosis ? { latestDiagnosis } : {}),
    ...(visits[1] ? { previousVisitAt: visits[1].createdAt } : {}),
  });
  const clinicalStory = buildClinicalStory({
    initialQuestions,
    currentQuestions: reviewQuestions,
    effectiveQuestions,
    ...(reviewVisit ? { reviewVisit } : {}),
    ...(initialVisit ? { initialVisit } : {}),
    followUpSections,
  });
  const referenceAt = reviewVisit?.createdAt ?? new Date().toISOString();
  const age = ageAt(patient.profile.dateOfBirth.toISOString(), referenceAt);
  const patientContext = patient.profile.gender === "FEMALE"
    ? { ar: `مراجعة، ${localeNumber(age, "ar")} سنة`, en: `Female patient, ${age} years` }
    : { ar: `مراجع، ${localeNumber(age, "ar")} سنة`, en: `Male patient, ${age} years` };
  const clinicalStorySummary = buildClinicalStorySummary({
    patientContext,
    ...(reviewVisit ? { visitReason: reviewVisit.primary } : {}),
    ...(latestDiagnosis ? { diagnosis: latestDiagnosis } : {}),
    sections: clinicalStory,
  });

  return {
    capabilities,
    patient: {
      id: patient.id,
      name: patient.profile.fullName,
      mrn: patient.externalIdentifiers[0]?.displayValue ?? "—",
      gender: patient.profile.gender,
      dateOfBirth: patient.profile.dateOfBirth.toISOString(),
      maritalStatus: patient.profile.maritalStatus,
    },
    summary: {
      totalVisits: visits.length,
      pendingCount: visits.filter((visit) => isPhysicianQueueReviewPending({
        interviewStatus: visit.interviewStatus,
        visitType: visit.visitType,
        visitId: visit.id,
        ...(approvedHairHistoryRecord ? { approvedHairHistoryVisitId: approvedHairHistoryRecord.approvedVisitId, approvedHairHistoryRevision: approvedHairHistoryRecord.revision } : {}),
      })).length,
      activeEpisodeCount: episodes.filter((episode) => episode.status === "ACTIVE").length,
      ...(visits[0] ? { latestVisitAt: visits[0].createdAt } : {}),
      ...(latestDiagnosis ? { latestDiagnosis } : {}),
    },
    ...(reviewVisit ? { reviewVisit } : {}),
    ...(initialVisit ? { initialVisit } : {}),
    initialQuestions,
    reviewQuestions,
    followUpSections,
    caseSummary,
    clinicalStorySummary,
    clinicalStory,
    episodes,
    measurementSeries: capabilities.physicianHairJourney ? measurementSeries : [],
    hairHistory,
    timeline: capabilities.physicianHairJourney ? journeyTimeline : [],
    physicianHairJourney: capabilities.physicianHairJourney ? physicianHairJourney : [],
    approvedHairHistory: capabilities.hairHistory ? approvedHairHistory : null,
    presentationAuditSignals,
  };
}
