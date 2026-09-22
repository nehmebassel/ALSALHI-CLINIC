"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { usePlatformLocale } from "@/app/components/platform/platform-locale";
import { PatientHairHistory } from "@/app/physician/components/patient-hair-history";
import { PhysicianVisitWorkspace } from "@/app/physician/patients/[patientId]/physician-visit-workspace";
import { PhysicianHairJourney } from "@/app/physician/components/physician-hair-journey";
import clinicalStoryStyles from "@/app/physician/components/clinical-story.module.css";
import workspaceStyles from "./physician-patient-workspace.module.css";
import { formatClinicDate, formatClinicDateTime } from "@/lib/platform/date-time";
import { localeNumber } from "@/lib/p01/locale";
import { resolvePhysicianHairWorkflow } from "@/lib/physician/capabilities";
import { ageAt, buildStructuredLabelCatalog, pickLocalized, presentClinicalValue } from "@/lib/physician/presentation";
import type { PhysicianClinicalStorySection, PhysicianClinicalStoryTimeframe, PhysicianInterviewQuestion, PhysicianPatientWorkspaceData } from "@/lib/physician/types";
import {
  buildEpisodeVisitNumbers,
  coercePhysicianPrimaryTab,
  physicianClinicalWorkspaceKind,
  hasCurrentScalpConcern,
  physicianClinicalWorkspaceLabel,
  physicianVisitWorkflowStatus,
  shouldOfferCurrentPhysicianWorkspace,
  type PhysicianVisitWorkflowStatus,
} from "@/lib/physician/workspace-flow";

type WorkspaceTab = "SUMMARY" | "STORY" | "HISTORY" | "JOURNEY" | "VISITS";


function visitWorkflowLabel(status: ReturnType<typeof physicianVisitWorkflowStatus>, locale: "ar" | "en"): string {
  if (status === "FINALIZED") return locale === "ar" ? "زيارة معتمدة" : "Finalized Visit";
  if (status === "ENCOUNTER_IN_PROGRESS") return locale === "ar" ? "المقابلة بدأت" : "Encounter in progress";
  if (status === "DRAFT_READY") return locale === "ar" ? "المسودة مهيأة" : "Draft prepared";
  if (status === "CANCELLED") return locale === "ar" ? "ملغاة" : "Cancelled";
  return locale === "ar" ? "غير مهيأة" : "Not prepared";
}

function visitWorkflowPillClass(status: ReturnType<typeof physicianVisitWorkflowStatus>): string {
  if (status === "FINALIZED") return "status-pill status-pill--success";
  if (status === "CANCELLED") return "status-pill";
  return "status-pill status-pill--warning";
}

function storyTimeframeLabel(timeframe: PhysicianClinicalStoryTimeframe, locale: "ar" | "en"): string {
  const labels: Record<PhysicianClinicalStoryTimeframe, { ar: string; en: string }> = {
    CURRENT: { ar: "الحالة الحالية", en: "Current" },
    BASELINE: { ar: "المقابلة الأساسية", en: "Initial baseline" },
    PRIOR_FOLLOW_UP: { ar: "متابعة سابقة", en: "Prior follow-up" },
    CURRENT_FOLLOW_UP: { ar: "المتابعة الحالية", en: "Current follow-up" },
  };
  return labels[timeframe][locale];
}


type InterviewGroup = { title: string; items: PhysicianInterviewQuestion[] };

function storySourceContextLabel(timeframe: PhysicianClinicalStoryTimeframe, locale: "ar" | "en"): string {
  const labels: Record<PhysicianClinicalStoryTimeframe, { ar: string; en: string }> = {
    CURRENT: { ar: "المقابلة الأولية", en: "Initial interview" },
    BASELINE: { ar: "المقابلة الأساسية", en: "Initial interview" },
    PRIOR_FOLLOW_UP: { ar: "متابعة سابقة", en: "Prior follow-up" },
    CURRENT_FOLLOW_UP: { ar: "المتابعة الحالية", en: "Current follow-up" },
  };
  return labels[timeframe][locale];
}

type StorySectionSourceBundle = {
  key: string;
  timeframe: PhysicianClinicalStoryTimeframe;
  recordedAt?: string;
  questions: PhysicianInterviewQuestion[];
};

function buildStorySectionSourceBundles(
  section: PhysicianClinicalStorySection,
  questionById: Map<string, PhysicianInterviewQuestion>,
): StorySectionSourceBundle[] {
  const bundles = new Map<string, StorySectionSourceBundle>();
  for (const item of section.groups.flatMap((group) => group.items)) {
    for (const source of item.sourceRefs) {
      const questions = source.questionIds
        .map((questionId) => questionById.get(questionId))
        .filter((question): question is PhysicianInterviewQuestion => Boolean(question));
      if (questions.length === 0) continue;
      const key = `${item.timeframe}:${source.visitId ?? ""}:${source.recordedAt ?? ""}`;
      const bundle = bundles.get(key) ?? {
        key,
        timeframe: item.timeframe,
        ...(source.recordedAt ? { recordedAt: source.recordedAt } : {}),
        questions: [],
      };
      const known = new Set(bundle.questions.map((question) => question.id));
      for (const question of questions) {
        if (!known.has(question.id)) {
          bundle.questions.push(question);
          known.add(question.id);
        }
      }
      bundles.set(key, bundle);
    }
  }
  return [...bundles.values()];
}

function groupInterviewQuestions(questions: PhysicianInterviewQuestion[], locale: "ar" | "en"): InterviewGroup[] {
  const groups = new Map<string, InterviewGroup>();
  for (const question of questions) {
    const title = pickLocalized(question.group, locale) || pickLocalized(question.library, locale);
    const key = `${pickLocalized(question.library, locale)}::${title}`;
    const group = groups.get(key) ?? { title, items: [] };
    group.items.push(question);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function InterviewQuestionGroups({ groups, locale, embedded = false }: { groups: InterviewGroup[]; locale: "ar" | "en"; embedded?: boolean }) {
  const isAr = locale === "ar";
  const catalog = buildStructuredLabelCatalog(groups.flatMap((group) => group.items));
  return groups.map((group) => (
    <section className={embedded ? "physician-source-question-group" : "surface-card physician-question-group"} key={group.title}>
      <h2>{group.title}</h2>
      <div className="physician-question-list">
        {group.items.map((question) => {
          const presented = presentClinicalValue(question, locale, catalog);
          const longAnswer = question.responseType === "LONG_TEXT" || presented.lines.some((line) => line.length > 120);
          return (
            <article className={longAnswer ? "physician-question-row physician-question-row--long-answer" : "physician-question-row"} key={question.id}>
              <div className="physician-question-prompt">
                <strong>{pickLocalized(question.text, locale)}</strong>
                {question.help && <small>{pickLocalized(question.help, locale)}</small>}
              </div>
              <div className={longAnswer ? "physician-question-answer physician-question-answer--long" : "physician-question-answer"}>
                {presented.lines.map((line, index) => <span key={`${question.id}:${index}`}>{line}</span>)}
                <div className="physician-answer-meta">
                  <span>{question.currentSource === "PHYSICIAN" ? (isAr ? "القيمة الرسمية معدلة بواسطة الطبيب" : "Official value corrected by physician") : (isAr ? "إجابة المراجع" : "Patient-reported")}</span>
                  {presented.hasUntranslatedFreeText && <span className="language-origin-badge">{isAr ? "نص حر بلغة المراجع" : "Patient-entered text in original language"}</span>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  ));
}

export function PhysicianPatientWorkspace({ data }: { data: PhysicianPatientWorkspaceData }) {
  const { locale, dir } = usePlatformLocale();
  const router = useRouter();
  const isAr = locale === "ar";
  const [hairHistoryApprovedLocally, setHairHistoryApprovedLocally] = useState(false);
  const [fullInterviewOpen, setFullInterviewOpen] = useState(false);
  const [openStorySourceCode, setOpenStorySourceCode] = useState<PhysicianClinicalStorySection["code"] | null>(null);
  const [openVisitId, setOpenVisitId] = useState<string | null>(null);
  const hasApprovedHairHistory = Boolean(data.approvedHairHistory) || hairHistoryApprovedLocally;
  const currentJourneyAvailable = data.reviewVisit
    ? Boolean(data.reviewVisit.episodeId && data.physicianHairJourney.some((episode) => episode.episodeId === data.reviewVisit?.episodeId && episode.visits.length > 0))
    : data.physicianHairJourney.some((episode) => episode.visits.length > 0);
  const hairWorkflow = resolvePhysicianHairWorkflow({
    visitType: data.reviewVisit?.visitType,
    hairHistoryAvailable: data.capabilities.hairHistory,
    physicianHairJourneyAvailable: data.capabilities.physicianHairJourney,
    physicianHairJourneyHasFinalizedData: currentJourneyAvailable,
    hairHistoryStatus: hairHistoryApprovedLocally ? "APPROVED_READ_ONLY" : data.hairHistory.status,
    hasApprovedRevision: hasApprovedHairHistory,
  });
  const [tab, setTab] = useState<WorkspaceTab>(() => data.reviewVisit?.physicianRecordStatus === "FINALIZED" ? hairWorkflow.defaultTab : "STORY");
  const workspaceLeaveGuard = useRef<(() => Promise<boolean>) | null>(null);
  async function leaveWorkspace(next: () => void) {
    if (workspaceLeaveGuard.current && !await workspaceLeaveGuard.current()) return;
    next();
  }
  const [clinicalWorkspaceVisitId, setClinicalWorkspaceVisitId] = useState<string | null>(null);
  const [locallyObservedVisitStatus, setLocallyObservedVisitStatus] = useState<PhysicianVisitWorkflowStatus | null>(null);
  const hairHistoryReferenceOnly = hairWorkflow.hairHistoryReferenceOnly;
  const age = ageAt(data.patient.dateOfBirth, data.summary.latestVisitAt);
  const localInitialHairHistoryApproval = Boolean(
    hairHistoryApprovedLocally
      && data.reviewVisit?.visitType === "INITIAL"
      && data.capabilities.hairHistory
      && data.reviewVisit?.interviewStatus === "UNDER_REVIEW",
  );
  const patientReviewState = localInitialHairHistoryApproval
    ? "HAIR_HISTORY_APPROVED"
    : data.reviewVisit?.patientReviewState
    ?? (data.reviewVisit?.interviewStatus === "UNDER_REVIEW" ? "PENDING" : "COMPLETED");
  const reviewPending = patientReviewState === "PENDING";
  const initialHairHistoryApproved = Boolean(
    patientReviewState === "HAIR_HISTORY_APPROVED"
      || (data.reviewVisit?.visitType === "INITIAL"
        && data.capabilities.hairHistory
        && hasApprovedHairHistory
        && data.reviewVisit?.interviewStatus === "UNDER_REVIEW"),
  );
  const hairHistoryAmendmentOpen = Boolean(
    data.hairHistory.status === "AMENDMENT_DRAFT"
      && !hairHistoryApprovedLocally,
  );
  const reviewBadgeKind = hairHistoryAmendmentOpen
      ? "HAIR_HISTORY_AMENDMENT"
      : initialHairHistoryApproved
        ? "HAIR_HISTORY_APPROVED"
        : reviewPending
          ? "PENDING"
          : "COMPLETED";
  const currentVisitWorkflowStatus = locallyObservedVisitStatus
    ?? (data.reviewVisit ? physicianVisitWorkflowStatus(data.reviewVisit) : null);
  const currentEpisode = data.reviewVisit?.episodeId
    ? data.episodes.find((episode) => episode.id === data.reviewVisit?.episodeId)
    : undefined;
  const currentWorkspaceKind = physicianClinicalWorkspaceKind({
    primaryReasonCode: data.reviewVisit?.primaryCode,
    additionalReasonCodes: data.reviewVisit?.additionalCodes,
    hasScalpContent: hasCurrentScalpConcern([...data.initialQuestions, ...data.reviewQuestions]),
  });
  const currentWorkspaceLabel = physicianClinicalWorkspaceLabel(currentWorkspaceKind, locale);
  const currentServiceHasHairJourney = currentWorkspaceKind === "HAIR" || currentWorkspaceKind === "HAIR_SCALP";
  const currentWorkspaceOffered = shouldOfferCurrentPhysicianWorkspace({
    visit: data.reviewVisit,
    hairHistoryAvailable: data.capabilities.hairHistory,
    hasApprovedHairHistory,
  });
  const currentClinicalWorkspaceVisit = clinicalWorkspaceVisitId === data.reviewVisit?.id
    ? data.reviewVisit
    : undefined;

  function handleHairHistoryApproved() {
    setHairHistoryApprovedLocally(true);
    if (data.reviewVisit) setClinicalWorkspaceVisitId(data.reviewVisit.id);
    setTab("STORY");
    router.refresh();
  }

  const handleVisitWorkflowStatusChange = useCallback((status: PhysicianVisitWorkflowStatus) => {
    setLocallyObservedVisitStatus(status);
  }, []);

  const handleVisitFinalized = useCallback(() => {
    setLocallyObservedVisitStatus("FINALIZED");
    setClinicalWorkspaceVisitId(null);
    setTab(currentServiceHasHairJourney && data.capabilities.physicianHairJourney ? "JOURNEY" : "SUMMARY");
    router.refresh();
  }, [currentServiceHasHairJourney, data.capabilities.physicianHairJourney, router]);

  const initialQuestionGroups = useMemo(() => groupInterviewQuestions(data.initialQuestions, locale), [data.initialQuestions, locale]);
  const currentQuestionGroups = useMemo(() => groupInterviewQuestions(data.reviewQuestions, locale), [data.reviewQuestions, locale]);
  const sourceQuestionById = useMemo(() => {
    const questions = new Map<string, PhysicianInterviewQuestion>();
    for (const question of [...data.initialQuestions, ...data.reviewQuestions]) questions.set(question.id, question);
    return questions;
  }, [data.initialQuestions, data.reviewQuestions]);
  const availableTabs = useMemo(() => {
    const items: Array<{ value: WorkspaceTab; label: string; hidden?: boolean }> = [
      { value: "SUMMARY", label: isAr ? "الملخص" : "Summary" },
      { value: "STORY", label: isAr ? "القصة السريرية" : "Clinical Story" },
      { value: "HISTORY", label: isAr ? "تاريخ المراجع" : "Patient Hair History", hidden: !data.capabilities.hairHistory },
      { value: "JOURNEY", label: isAr ? "مسار الشعر الطبي" : "Physician Hair Journey", hidden: !currentServiceHasHairJourney || !hairWorkflow.physicianHairJourneyActive },
      { value: "VISITS", label: isAr ? "الزيارات" : "Visits" },
    ];
    return items.filter((item) => !item.hidden);
  }, [currentServiceHasHairJourney, data.capabilities.hairHistory, hairWorkflow.physicianHairJourneyActive, isAr]);

  const activeTab = coercePhysicianPrimaryTab({
    current: tab,
    preferred: hairWorkflow.defaultTab,
    hairHistoryAvailable: data.capabilities.hairHistory,
    physicianHairJourneyActive: currentServiceHasHairJourney && hairWorkflow.physicianHairJourneyActive,
  });

  const visitNumbers = useMemo(() => buildEpisodeVisitNumbers(data.episodes), [data.episodes]);

  return (
    <div className={`${workspaceStyles.scope} ${clinicalStoryStyles.scope}`}>
      <main className={activeTab === "HISTORY" ? "workspace-main physician-record physician-record--history-focus" : "workspace-main physician-record"} dir={dir}>
      <nav className="physician-breadcrumb" aria-label={isAr ? "التنقل" : "Breadcrumb"}>
        <Link href="/physician">{isAr ? "قائمة المراجعين" : "Patient queue"}</Link>
        <span aria-hidden="true">/</span>
        <b>{data.patient.name}</b>
      </nav>

      <section className="physician-record-header">
        <div className="physician-record-identity">
          <div className="patient-avatar patient-avatar--record" aria-hidden="true">{data.patient.name.trim().slice(0, 1)}</div>
          <div>
            <p className="eyebrow">{isAr ? "السجل السريري" : "Clinical record"}</p>
            <h1>{data.patient.name}</h1>
            <div className="physician-record-demographics">
              <span dir="ltr">MRN {data.patient.mrn}</span>
              <span>{data.patient.gender === "MALE" ? (isAr ? "ذكر" : "Male") : (isAr ? "أنثى" : "Female")}</span>
              <span>{isAr ? `${localeNumber(age, locale)} سنة` : `${age} years`}</span>
              <span>{isAr ? "تاريخ الميلاد" : "DOB"}: {formatClinicDate(data.patient.dateOfBirth, locale)}</span>
            </div>
          </div>
        </div>
        <div className="physician-record-status">
          <div className="physician-record-status-pills">
            <span className={reviewBadgeKind === "PENDING" || reviewBadgeKind === "HAIR_HISTORY_AMENDMENT" ? "status-pill status-pill--warning" : "status-pill status-pill--success"}>
              {reviewBadgeKind === "COMPLETED"
                ? (isAr ? "المراجعة مكتملة" : "Review completed")
                : reviewBadgeKind === "HAIR_HISTORY_AMENDMENT"
                  ? (isAr ? "تعديل تاريخ المراجع مفتوح" : "Hair History amendment open")
                : reviewBadgeKind === "HAIR_HISTORY_APPROVED"
                  ? (isAr ? "تاريخ المراجع معتمد" : "Patient Hair History approved")
                  : (isAr ? "بانتظار مراجعة الطبيب" : "Awaiting physician review")}
            </span>
            {currentVisitWorkflowStatus && <span className={visitWorkflowPillClass(currentVisitWorkflowStatus)}>{visitWorkflowLabel(currentVisitWorkflowStatus, locale)}</span>}
          </div>
          {data.reviewVisit && (
            <small>{data.reviewVisit.visitType === "FOLLOW_UP" ? (isAr ? "زيارة متابعة" : "Follow-up visit") : (isAr ? "زيارة أولية" : "Initial visit")} · {formatClinicDateTime(data.reviewVisit.visitOccurredAt ?? data.reviewVisit.createdAt, locale)}</small>
          )}
        </div>
      </section>

      <div className={activeTab === "HISTORY" || activeTab === "SUMMARY" ? "physician-record-layout physician-record-layout--focus" : "physician-record-layout"}>
        {activeTab !== "HISTORY" && activeTab !== "SUMMARY" && <aside className="physician-record-sidebar">
          <section className="surface-card physician-side-card">
            <p className="eyebrow">{isAr ? "الحالة الحالية" : "Current state"}</p>
            <dl className="physician-summary-list">
              <div><dt>{isAr ? "الزيارات" : "Visits"}</dt><dd>{localeNumber(data.summary.totalVisits, locale)}</dd></div>
              <div><dt>{isAr ? "مشكلات نشطة" : "Active episodes"}</dt><dd>{localeNumber(data.summary.activeEpisodeCount, locale)}</dd></div>
              <div><dt>{isAr ? "بانتظار المراجعة" : "To review"}</dt><dd>{localeNumber(data.summary.pendingCount, locale)}</dd></div>
              {data.capabilities.hairHistory && <div><dt>{isAr ? "تاريخ المراجع" : "Patient Hair History"}</dt><dd>{hasApprovedHairHistory ? (isAr ? "معتمد" : "Approved") : hairHistoryReferenceOnly ? (isAr ? "مرجع" : "Reference") : (isAr ? "غير معتمد" : "Pending")}</dd></div>}
            </dl>
          </section>

          <section className="surface-card physician-side-card">
            <p className="eyebrow">{isAr ? "المشكلات السريرية" : "Clinical episodes"}</p>
            <div className="physician-episode-list">
              {data.episodes.map((episode) => (
                <article key={episode.id} className="physician-episode-card">
                  <div><strong>{pickLocalized(episode.primary, locale)}</strong><span className={episode.status === "ACTIVE" ? "episode-state episode-state--active" : "episode-state"}>{episode.status === "ACTIVE" ? (isAr ? "نشطة" : "Active") : (isAr ? "مغلقة" : "Closed")}</span></div>
                  <small>{isAr ? `بدأت ${formatClinicDate(episode.openedAt, locale)}` : `Opened ${formatClinicDate(episode.openedAt, locale)}`}</small>
                  <small>{isAr ? `${localeNumber(episode.visits.length, locale)} زيارة` : `${episode.visits.length} visit${episode.visits.length === 1 ? "" : "s"}`}</small>
                </article>
              ))}
            </div>
          </section>
        </aside>}

        <section className="physician-record-main">
          <div className="physician-record-tabs" role="tablist" aria-label={isAr ? "أقسام مراجعة الحالة" : "Case review sections"}>
            {availableTabs.map(({ value, label }) => (
              <button key={value} role="tab" type="button" aria-selected={!currentClinicalWorkspaceVisit && activeTab === value} onClick={() => void leaveWorkspace(() => { setFullInterviewOpen(false); setOpenStorySourceCode(null); setClinicalWorkspaceVisitId(null); setTab(value); })}>{label}</button>
            ))}
          </div>

          {currentClinicalWorkspaceVisit ? (
            <div className="physician-clinical-workspace-stack">
              <section className="surface-card physician-clinical-workspace-heading">
                <div>
                  <h2>{currentWorkspaceLabel}</h2>
                </div>
                <button type="button" className="button button--secondary" onClick={() => void leaveWorkspace(() => setClinicalWorkspaceVisitId(null))}>{isAr ? "العودة إلى السجل" : "Back to clinical record"}</button>
              </section>
              <PhysicianVisitWorkspace
                patient={{ name: data.patient.name, mrn: data.patient.mrn }}
                visit={currentClinicalWorkspaceVisit}
                visitNumber={visitNumbers.get(currentClinicalWorkspaceVisit.id) ?? 1}
                episodeLabel={currentEpisode ? pickLocalized(currentEpisode.primary, locale) : pickLocalized(currentClinicalWorkspaceVisit.primary, locale)}
                actorRole="PHYSICIAN"
                workspaceLabel={currentWorkspaceLabel}
                workspaceKind={currentWorkspaceKind}
                autoPrepare
                leaveGuardRef={workspaceLeaveGuard}
                onWorkflowStatusChange={handleVisitWorkflowStatusChange}
                onFinalized={handleVisitFinalized}
              />
            </div>
          ) : <>
          {activeTab === "SUMMARY" && (
            <div className="physician-record-stack">
              <section className="surface-card physician-clinical-snapshot">
                <header className="physician-clinical-snapshot__header">
                  <div><p className="eyebrow">{isAr ? "لمحة سريرية" : "Clinical Snapshot"}</p><h2>{isAr ? "أهم المعلومات قبل قراءة القصة الكاملة" : "Key information before the full Clinical Story"}</h2></div>
                  <button type="button" className="button button--secondary" onClick={() => setTab("STORY")}>{reviewPending ? (isAr ? "مراجعة القصة السريرية" : "Review Clinical Story") : (isAr ? "فتح القصة السريرية" : "Open Clinical Story")}</button>
                </header>
                <div className="physician-clinical-snapshot__core">
                  <section>
                    <h3>{isAr ? "سبب الزيارة" : "Visit reason"}</h3>
                    <p>{data.caseSummary.visitReason ? pickLocalized(data.caseSummary.visitReason, locale) : (isAr ? "غير مسجل" : "Not recorded")}</p>
                  </section>
                  <section>
                    <h3>{isAr ? "الشكوى الرئيسية" : "Main concern"}</h3>
                    <div className="physician-clinical-snapshot__values">
                      {data.caseSummary.mainConcern.length > 0
                        ? data.caseSummary.mainConcern.map((value, index) => <span key={`${index}:${value.en}`}>{pickLocalized(value, locale)}</span>)
                        : <span>{isAr ? "غير مسجل" : "Not recorded"}</span>}
                    </div>
                  </section>
                  {data.caseSummary.problemOnset.length > 0 && <section>
                    <h3>{isAr ? "بداية المشكلة" : "Problem onset"}</h3>
                    <div className="physician-clinical-snapshot__values">{data.caseSummary.problemOnset.map((value, index) => <span key={`${index}:${value.en}`}>{pickLocalized(value, locale)}</span>)}</div>
                  </section>}
                </div>
                {data.caseSummary.importantContext.length > 0 && <section className="physician-clinical-snapshot__context">
                  <h3>{isAr ? "السياق المهم للطبيب" : "Important patient context"}</h3>
                  <dl>
                    {data.caseSummary.importantContext.map((item) => <div key={item.code}>
                      <dt>{pickLocalized(item.label, locale)}</dt>
                      <dd>{item.values.map((value, index) => <span key={`${item.code}:${index}:${value.en}`}>{pickLocalized(value, locale)}</span>)}</dd>
                    </div>)}
                  </dl>
                </section>}
              </section>
            </div>
          )}

          {activeTab === "STORY" && (
            <div className="physician-record-stack">
              {currentWorkspaceOffered && data.reviewVisit && currentVisitWorkflowStatus !== "FINALIZED" && (
                <section className="surface-card physician-clinical-workspace-cta">
                  <div>
                    <p className="eyebrow">{isAr ? "بعد قراءة إجابات المراجع" : "After reviewing the patient's answers"}</p>
                    <h2>{currentWorkspaceLabel}</h2>
                    <p>{currentVisitWorkflowStatus === "NOT_PREPARED"
                      ? (isAr ? "عندما تكون مستعدًا، ابدأ زيارة الطبيب لتوثيق تقييم اليوم." : "When ready, start the physician Visit to document today's assessment.")
                      : (isAr ? "تابع توثيق زيارة اليوم ثم اعتمدها عند اكتمالها." : "Continue documenting today's Visit, then finalize it when complete.")}</p>
                  </div>
                  <button type="button" className="button button--primary" onClick={() => setClinicalWorkspaceVisitId(data.reviewVisit!.id)}>{currentVisitWorkflowStatus === "NOT_PREPARED" ? (isAr ? "بدء زيارة الطبيب" : "Start Physician Visit") : (isAr ? "متابعة زيارة الطبيب" : "Continue Physician Visit")}</button>
                </section>
              )}
              <section className="surface-card physician-story-intro">
                <div>
                  <p className="eyebrow">{isAr ? "القصة السريرية" : "Clinical Story"}</p>
                  <h2>{isAr ? "الحالة في نظرة سريرية واحدة" : "The case in one clinical scan"}</h2>
                  <div className="physician-story-summary">
                    {data.clinicalStorySummary.length === 0
                      ? <p className="muted">{isAr ? "لا توجد قصة سريرية مشتقة من الإجابات المسجلة بعد." : "No Clinical Story can be derived from the recorded answers yet."}</p>
                      : data.clinicalStorySummary.map((paragraph, index) => <p key={`${index}:${paragraph.en}`}>{pickLocalized(paragraph, locale)}</p>)}
                  </div>
                </div>
                <button className="button button--secondary" type="button" aria-expanded={fullInterviewOpen} aria-controls="physician-full-interview-reference" onClick={() => { setOpenStorySourceCode(null); setFullInterviewOpen((open) => !open); }}>{isAr ? "عرض المقابلة الكاملة" : "View full interview"}</button>
              </section>

          {fullInterviewOpen && (
            <div id="physician-full-interview-reference" className="physician-record-stack physician-full-interview-reference" role="region" aria-label={isAr ? "المقابلة الكاملة كما أدخلها المراجع" : "Full interview as entered by the patient"}>
              <section className="surface-card physician-interview-header">
                <div>
                  <p className="eyebrow">{isAr ? "مرجع تفصيلي" : "Detailed reference"}</p>
                  <h2>{isAr ? "المقابلة الكاملة كما أدخلها المراجع" : "Full interview as entered by the patient"}</h2>
                  <p className="muted">{isAr ? "إجابات المراجع المسجلة كاملة للرجوع إليها عند الحاجة." : "The patient’s complete recorded answers, available as a secondary reference when needed."}</p>
                </div>
                <div className="card-heading-row">
                  {data.reviewVisit && <span className={reviewPending ? "status-pill status-pill--warning" : "status-pill status-pill--success"}>{patientReviewState === "HAIR_HISTORY_APPROVED" ? (isAr ? "تاريخ المراجع معتمد" : "Patient Hair History approved") : reviewPending ? (isAr ? "تحت المراجعة" : "Under review") : (isAr ? "مكتملة" : "Completed")}</span>}
                  <button type="button" className="button button--secondary" onClick={() => setFullInterviewOpen(false)}>{isAr ? "إغلاق" : "Close"}</button>
                </div>
              </section>

              {data.reviewVisit?.visitType === "FOLLOW_UP" && (
                <section className="surface-card physician-interview-source-summary">
                  <div>
                    <p className="eyebrow">{isAr ? "تحديث المتابعة الحالية" : "Current follow-up update"}</p>
                    <h2>{formatClinicDate(data.reviewVisit.createdAt, locale)}</h2>
                    <p className="muted">{isAr ? "هذه هي التغييرات التي سجلها المراجع لهذه الزيارة فقط." : "These are the changes recorded by the patient for this visit only."}</p>
                  </div>
                  {data.initialVisit && (
                    <div>
                      <p className="eyebrow">{isAr ? "المقابلة الأساسية" : "Initial interview"}</p>
                      <strong>{formatClinicDate(data.initialVisit.createdAt, locale)}</strong>
                      <p className="muted">{isAr ? `${localeNumber(data.initialQuestions.length, locale)} إجابة من المقابلة الأولى` : `${data.initialQuestions.length} answers from the initial interview`}</p>
                    </div>
                  )}
                </section>
              )}

              {data.reviewVisit?.visitType === "FOLLOW_UP" && (
                <section className="surface-card physician-follow-up-source">
                  <div className="card-heading-row"><div><p className="eyebrow">{isAr ? "التغييرات المسجلة عبر زيارات المتابعة" : "Recorded changes across follow-up visits"}</p><h2>{isAr ? "تحديثات المتابعة" : "Follow-up updates"}</h2></div></div>
                  {data.followUpSections.length === 0 && currentQuestionGroups.length === 0 ? (
                    <p className="physician-story-empty">{isAr ? "لم تُسجل تغييرات منظمة لهذه المتابعة." : "No structured changes were recorded for this follow-up."}</p>
                  ) : (
                    <div className="physician-follow-up-sections">
                      {data.followUpSections.map((section) => (
                        <article key={section.code} className="physician-follow-up-section">
                          <h3>{pickLocalized(section.title, locale)}</h3>
                          {section.facts.map((fact) => (
                            <div key={fact.id} className="physician-follow-up-fact">
                              <strong>{pickLocalized(fact.label, locale)}</strong>
                              {fact.sourceVisitAt && <small>{formatClinicDate(fact.sourceVisitAt, locale)}</small>}
                              <div>{fact.values.map((value, index) => <span key={`${fact.id}:${index}`}>{pickLocalized(value, locale)}</span>)}</div>
                            </div>
                          ))}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {data.reviewVisit?.visitType === "FOLLOW_UP" && currentQuestionGroups.length > 0 && (
                <section className="physician-record-stack">
                  <div className="physician-section-divider"><strong>{isAr ? "أسئلة منظمة أُجيب عنها في هذه المتابعة" : "Structured questions answered in this follow-up"}</strong></div>
                  <InterviewQuestionGroups groups={currentQuestionGroups} locale={locale} />
                </section>
              )}

              <section className="physician-section-divider physician-section-divider--source">
                <div>
                  <strong>{data.reviewVisit?.visitType === "FOLLOW_UP" ? (isAr ? "المقابلة الأساسية الأصلية" : "Original initial interview") : (isAr ? "إجابات المقابلة الحالية" : "Current interview answers")}</strong>
                  {data.initialVisit && <small>{formatClinicDate(data.initialVisit.createdAt, locale)}</small>}
                </div>
              </section>

              {initialQuestionGroups.length === 0 ? (
                <section className="surface-card physician-no-interview"><h2>{isAr ? "المقابلة الأساسية غير متاحة" : "Initial interview unavailable"}</h2><p className="muted">{isAr ? "لا توجد مقابلة أساسية متاحة ضمن هذا السجل." : "No initial interview is available in this record."}</p></section>
              ) : (
                <InterviewQuestionGroups groups={initialQuestionGroups} locale={locale} />
              )}
            </div>
          )}

              <div className="physician-story-grid">
                {data.clinicalStory.length === 0 && (
                  <section className="surface-card physician-empty-state">
                    <strong>{isAr ? "لا توجد أقسام سريرية مسجلة" : "No Clinical Story sections recorded"}</strong>
                    <p>{isAr ? "يبقى هذا القسم فارغًا بدل إنشاء معلومات غير مسجلة." : "This section stays empty rather than inventing unrecorded information."}</p>
                  </section>
                )}
                {data.clinicalStory.map((section) => {
                  const sourceBundles = buildStorySectionSourceBundles(section, sourceQuestionById);
                  const sourceOpen = openStorySourceCode === section.code;
                  const sourcePanelId = `physician-story-source-${section.code.toLowerCase()}`;
                  return (
                    <section className="surface-card physician-story-section" data-story-code={section.code} key={section.code}>
                      <header>
                        <div><h2>{pickLocalized(section.title, locale)}</h2><p>{pickLocalized(section.description, locale)}</p></div>
                        {sourceBundles.length > 0 && (
                          <button
                            type="button"
                            className="physician-story-source-toggle"
                            aria-expanded={sourceOpen}
                            aria-controls={sourcePanelId}
                            onClick={() => { setFullInterviewOpen(false); setOpenStorySourceCode((current) => current === section.code ? null : section.code); }}
                          >
                            {isAr ? "عرض المصدر" : "View source"}
                          </button>
                        )}
                      </header>

                      {sourceOpen && sourceBundles.length > 0 && (
                        <div id={sourcePanelId} className="physician-story-source-reference" role="region" aria-label={isAr ? `مصدر ${pickLocalized(section.title, locale)}` : `${pickLocalized(section.title, locale)} source`}>
                          <div className="physician-story-source-reference-heading">
                            <div>
                              <strong>{isAr ? `مصدر هذا القسم — ${pickLocalized(section.title, locale)}` : `Section source — ${pickLocalized(section.title, locale)}`}</strong>
                              <p>{isAr ? "يعرض فقط أسئلة المقابلة وإجاباتها المرتبطة بهذا القسم." : "Shows only the interview questions and recorded answers linked to this section."}</p>
                            </div>
                            <button type="button" onClick={() => setOpenStorySourceCode(null)}>{isAr ? "إغلاق المصدر" : "Close source"}</button>
                          </div>
                          <div className="physician-story-source-bundles">
                            {sourceBundles.map((bundle) => (
                              <section className="physician-story-source-bundle" key={bundle.key}>
                                <div className="physician-story-source-context">
                                  <strong>{storySourceContextLabel(bundle.timeframe, locale)}</strong>
                                  {bundle.recordedAt && <time>{formatClinicDate(bundle.recordedAt, locale)}</time>}
                                </div>
                                <InterviewQuestionGroups groups={groupInterviewQuestions(bundle.questions, locale)} locale={locale} embedded />
                              </section>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="physician-story-groups">
                        {section.groups.map((group) => (
                          <section className="physician-story-group" key={group.id}>
                            <h3>{pickLocalized(group.title, locale)}</h3>
                            <div className="physician-story-items">
                              {group.items.map((item) => (
                                <article className="physician-story-item" key={item.id}>
                                  <div className="physician-story-item-heading">
                                    <h4>{pickLocalized(item.label, locale)}</h4>
                                    {item.timeframe !== "CURRENT" && <span className={`physician-story-timeframe physician-story-timeframe--${item.timeframe.toLowerCase()}`}>{storyTimeframeLabel(item.timeframe, locale)}</span>}
                                  </div>
                                  <div className="physician-story-entries">
                                    {item.entries.map((entry) => (
                                      <div
                                        className={`physician-story-entry physician-story-entry--${entry.valueType.toLowerCase()}${entry.patientAuthored ? " physician-story-entry--patient-authored" : ""}`}
                                        key={entry.id}
                                      >
                                        {entry.values.map((value, index) => <p key={`${entry.id}:${index}`}>{pickLocalized(value, locale)}</p>)}
                                      </div>
                                    ))}
                                  </div>
                                </article>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}



          {activeTab === "HISTORY" && data.capabilities.hairHistory && (
            <PatientHairHistory
              history={data.hairHistory}
              patientId={data.patient.id}
              reviewVisitId={data.reviewVisit?.id}
              locale={locale}
              referenceOnly={hairHistoryReferenceOnly}
              onApproved={handleHairHistoryApproved}
            />
          )}

          {activeTab === "JOURNEY" && currentServiceHasHairJourney && hairWorkflow.physicianHairJourneyActive && (
            <div className="physician-record-stack">
              {data.capabilities.hairHistory && (hasApprovedHairHistory || hairHistoryReferenceOnly) && (
                <section className="surface-card">
                  <div className="card-heading-row">
                    <div>
                      <p className="eyebrow">{isAr ? "تاريخ المراجع" : "Patient Hair History"}</p>
                      <h2>{hasApprovedHairHistory ? (isAr ? "مرجع تاريخي معتمد" : "Approved historical reference") : (isAr ? "مرجع من الزيارة الأولى" : "Initial-visit reference")}</h2>
                      <p className="muted">{isAr ? "تاريخ المراجع معتمد ويمكنك الرجوع إليه في أي وقت." : "Patient history approved. You can review it at any time."}</p>
                    </div>
                    <button type="button" className="button button--secondary" onClick={() => setTab("HISTORY")}>{isAr ? "فتح تاريخ المراجع" : "Open Patient Hair History"}</button>
                  </div>
                </section>
              )}
              <PhysicianHairJourney
                episodes={data.physicianHairJourney}
                locale={locale}
                onOpenVisit={(visitId) => {
                  setOpenVisitId(visitId);
                  setTab("VISITS");
                }}
              />
            </div>
          )}

          {activeTab === "VISITS" && (
            <div className="physician-record-stack">
              {data.episodes.length === 0 && (
                <section className="surface-card physician-empty-state">
                  <strong>{isAr ? "لا توجد زيارات سريرية مرتبطة بعد" : "No linked clinical Visits yet"}</strong>
                  <p>{isAr ? "ستظهر الزيارات هنا عند وجود سجل زيارة مرتبط بهذه الحالة." : "Visits will appear here when a Visit record is linked to this case."}</p>
                </section>
              )}
              {data.episodes.map((episode) => (
                <section className="surface-card physician-visits-card" key={episode.id}>
                  <div className="card-heading-row">
                    <div><p className="eyebrow">{episode.status === "ACTIVE" ? (isAr ? "مشكلة نشطة" : "Active episode") : (isAr ? "مشكلة مغلقة" : "Closed episode")}</p><h2>{pickLocalized(episode.primary, locale)}</h2></div>
                    <span className="status-pill">{isAr ? `${localeNumber(episode.visits.length, locale)} زيارة` : `${episode.visits.length} visits`}</span>
                  </div>
                  <div className="physician-visit-list">
                    {episode.visits.map((visit) => (
                      <div key={visit.id}>
                      <article key={visit.id} className="physician-visit-row">
                        <div className="physician-visit-date">
                          <strong>{formatClinicDate(visit.visitOccurredAt ?? visit.createdAt, locale)}</strong>
                          <small>{visit.visitOccurredAt ? (isAr ? "تاريخ المقابلة" : "Encounter date") : (isAr ? "تاريخ إنشاء السجل" : "Record created")}</small>
                          <small>{visit.visitType === "FOLLOW_UP" ? (isAr ? "متابعة" : "Follow-up") : (isAr ? "أولية" : "Initial")}</small>
                        </div>
                        <div className="physician-visit-diagnosis">
                          <small>{isAr ? "التشخيص" : "Diagnosis"}</small>
                          {visit.diagnosis
                            ? <strong>{pickLocalized(visit.diagnosis, locale)}</strong>
                            : <span>{visit.physicianRecordStatus === "FINALIZED" ? (isAr ? "راجع قرارات الطبيب في تفاصيل الزيارة" : "See physician decisions in Visit detail") : (isAr ? "لم تُعتمد قرارات هذه الزيارة بعد" : "Visit decisions are not finalized yet")}</span>}
                        </div>
                        <div className="physician-visit-workflow-status">
                          <span className={visitWorkflowPillClass(physicianVisitWorkflowStatus(visit))}>{visitWorkflowLabel(physicianVisitWorkflowStatus(visit), locale)}</span>
                          <small>
                            {visit.patientReviewState === "HAIR_HISTORY_APPROVED"
                              ? (isAr ? "تاريخ المراجع معتمد" : "Patient Hair History approved")
                              : visit.patientReviewState === "PENDING"
                                ? (isAr ? "مرجع المراجع بانتظار المراجعة" : "Patient reference awaiting review")
                                : (isAr ? "مرجع المراجع مكتمل" : "Patient reference reviewed")}
                          </small>
                        </div>
                        <button type="button" className="button button--secondary" aria-expanded={openVisitId === visit.id} onClick={() => setOpenVisitId((current) => current === visit.id ? null : visit.id)}>{openVisitId === visit.id ? (isAr ? "إخفاء تفاصيل الزيارة" : "Hide Visit Detail") : physicianVisitWorkflowStatus(visit) === "FINALIZED" ? (isAr ? "فتح الزيارة المعتمدة" : "Open Finalized Visit") : (isAr ? "فتح مسودة الزيارة" : "Open Draft Visit")}</button>
                      </article>
                      {openVisitId === visit.id && (
                        <PhysicianVisitWorkspace
                          patient={{ name: data.patient.name, mrn: data.patient.mrn }}
                          visit={visit}
                          visitNumber={visitNumbers.get(visit.id) ?? 1}
                          episodeLabel={pickLocalized(episode.primary, locale)}
                          actorRole="PHYSICIAN"
                          workspaceKind={physicianClinicalWorkspaceKind({
                            primaryReasonCode: visit.primaryCode,
                            additionalReasonCodes: visit.additionalCodes,
                            hasScalpContent: visit.id === data.reviewVisit?.id
                              && hasCurrentScalpConcern([...data.initialQuestions, ...data.reviewQuestions]),
                          })}
                          workspaceLabel={physicianClinicalWorkspaceLabel(physicianClinicalWorkspaceKind({
                            primaryReasonCode: visit.primaryCode,
                            additionalReasonCodes: visit.additionalCodes,
                            hasScalpContent: visit.id === data.reviewVisit?.id
                              && hasCurrentScalpConcern([...data.initialQuestions, ...data.reviewQuestions]),
                          }), locale)}
                          onFinalized={handleVisitFinalized}
                        />
                      )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          </>}
        </section>
      </div>
      </main>
    </div>
  );
}
