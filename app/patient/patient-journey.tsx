"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

import { BrandHeader } from "@/app/components/brand-header";
import { formatClinicDateTime } from "@/lib/platform/date-time";
import { ClinicalDatePicker, ClinicalDateReferenceProvider, useClinicalDateReference } from "@/app/patient/clinical-date-picker";
import { coerceClinicalApproxDate } from "@/lib/p01/clinical-date";
import { localizeDigits, localeNumber, toAsciiDigits } from "@/lib/p01/locale";
import { evaluateP01Draft, type P01EvaluatedQuestion, type P01Evaluation, type P01Locale } from "@/lib/p01/engine";
import type { JsonValue, PatientInputJson } from "@/lib/patient-access/service";
import type { P01SectionCode } from "@/lib/p01/contracts";
import { getP01Contract, P01_QUESTION_CONTRACTS } from "@/lib/p01/contracts";
import { FollowUpCurrentMetrics, FollowUpDeltaStep, FollowUpReviewSummary } from "@/app/patient/follow-up-delta-step";
import { FOLLOW_UP_COPY } from "@/lib/follow-up/copy";
import { followUpDeltaCompletionIssues, followUpSafetyCompletionIssues } from "@/lib/follow-up/delta";
import { followUpSexSpecificCompletionIssues } from "@/lib/follow-up/sex-specific";
import { firstFollowUpRegistrySection, followUpJourneySections, isAllowedExistingFollowUpRegistrySection } from "@/lib/follow-up/journey";
import { getFollowUpDomain, getFollowUpLifecycle, requiredFollowUpChangeKeys } from "@/lib/follow-up/lifecycle";
import { followUpChangeAnswered, readFollowUpContext, selectedEpisodeState, type FollowUpChangeState, type FollowUpDeltaState, type P01FollowUpContext } from "@/lib/follow-up/types";
import { presentPatientReviewAnswer } from "@/lib/presentation/display-contract";
import {
  P01_FINAL_CONFIRMATION_AR,
  P01_FINAL_CONFIRMATION_EN,
  P01_PRIVACY_NOTICE_AR,
  P01_PRIVACY_NOTICE_EN,
  P01_PRIVACY_NOTICE_VERSION,
} from "@/lib/p01/privacy";

type SaveState = "idle" | "saving" | "saved" | "failed" | "offline";
type JourneyStep = P01SectionCode | "FOLLOW_UP_START" | "FOLLOW_UP_CHANGES" | "FOLLOW_UP_CURRENT" | "REVIEW";

interface DraftPayload {
  draft: {
    draftId: string;
    contentVersionId: string;
    patientInputJson: PatientInputJson;
    status: string;
    updatedAt: string;
    warningAt: string;
    lockAt: string;
    expiresAt: string;
  };
  evaluation: P01Evaluation;
  clinicalReferenceDate: string;
  error?: { code?: string; message?: string };
}

const SECTION_TITLES: Record<P01SectionCode, { ar: string; en: string }> = {
  PRIVACY: { ar: "مرحبًا بك", en: "Welcome" },
  PROFILE: { ar: "بياناتك الأساسية", en: "Your profile" },
  VISIT_REASON: { ar: "سبب الزيارة", en: "Reason for visit" },
  HEALTH_SNAPSHOT: { ar: "صحتك العامة", en: "General health" },
  HAIR_LOSS: { ar: "مشكلة الشعر", en: "Hair concern" },
  SCALP: { ar: "فروة الرأس", en: "Scalp" },
  SHARED_HISTORY: { ar: "تاريخ الشعر والفروة", en: "Hair and scalp history" },
  COURSE_IMPACT: { ar: "المسار والأثر والتوقعات", en: "Course, impact, and expectations" },
  LIFESTYLE_NUTRITION: { ar: "نمط الحياة والتغذية", en: "Lifestyle and nutrition" },
  WOMENS_HEALTH: { ar: "صحة المرأة", en: "Women's health" },
  PREGNANCY_CONTEXT: { ar: "سياق الحمل", en: "Pregnancy context" },
  MENS_HEALTH: { ar: "صحة الرجل", en: "Men's health" },
  HAIR_QUALITY: { ar: "جودة الشعر وروتين العناية", en: "Hair quality and care routine" },
  DERMATOLOGY: { ar: "المشكلة الجلدية", en: "Dermatology concern" },
  LASER: { ar: "الليزر", en: "Laser" },
  AESTHETIC_PROCEDURES: { ar: "الإجراءات التجميلية", en: "Aesthetic procedures" },
};

const SECTION_DESCRIPTIONS: Partial<Record<P01SectionCode, { ar: string; en: string }>> = {
  PROFILE: { ar: "معلومات أساسية تساعد الطبيب على قراءة إجاباتك في سياقها الصحيح.", en: "Basic information that helps the physician interpret your answers in context." },
  VISIT_REASON: { ar: "اختر السبب الأساسي فقط، وسنُظهر لك الأسئلة المرتبطة به تلقائيًا.", en: "Choose the primary reason only. Relevant questions will appear automatically." },
  HEALTH_SNAPSHOT: { ar: "أخبرنا عن صحتك العامة.", en: "Tell us about your general health." },
  HAIR_LOSS: { ar: "أجب بما تلاحظه أنت؛ يستطيع الطبيب مراجعة المعلومات معك لاحقًا.", en: "Answer based on what you notice. The physician can review it with you later." },
  SCALP: { ar: "اختر الأعراض الموجودة فقط، وستظهر تفاصيل كل عرض تحته مباشرة.", en: "Select only the symptoms you have. Each symptom's details will appear directly below it." },
  SHARED_HISTORY: { ar: "التشخيصات والعلاجات والإجراءات السابقة تساعد في بناء التاريخ الزمني قبل الزيارة.", en: "Previous diagnoses, treatments, and procedures help build the pre-visit clinical timeline." },
  COURSE_IMPACT: { ar: "نقيس مسار المشكلة وتأثيرها وما تتوقعه من العلاج.", en: "This section captures the course of the concern, its impact, and your treatment expectations." },
  LIFESTYLE_NUTRITION: { ar: "أسئلة مختصرة قد تساعد الطبيب على فهم العوامل المرتبطة بالشعر.", en: "Short questions that may help the physician understand hair-related factors." },
  WOMENS_HEALTH: { ar: "ستظهر فقط التفاصيل المرتبطة بما تختارينه.", en: "Only follow-up questions related to your selections will appear." },
  MENS_HEALTH: { ar: "ستظهر فقط التفاصيل المرتبطة بما تختاره.", en: "Only follow-up questions related to your selections will appear." },
  PREGNANCY_CONTEXT: { ar: "معلومات تساعد الطبيب على التخطيط لرعايتك بأمان.", en: "Information that helps the physician plan your care safely." },
  HAIR_QUALITY: { ar: "جودة الشعرة، المعالجات، الحرارة، الغسل وروتين العناية في رحلة واحدة قصيرة وواضحة.", en: "Hair quality, processing, heat, washing, and care routine in one guided section." },
  DERMATOLOGY: { ar: "اكتب المشكلة الجلدية التي ترغب بمناقشتها مع الطبيب.", en: "Describe the skin concern you would like to discuss." },
  LASER: { ar: "اختر كل مشكلة ليزر بشكل مستقل؛ تظهر تفاصيلها مباشرة تحتها.", en: "Select each laser concern independently; its details appear directly below it." },
  AESTHETIC_PROCEDURES: { ar: "كل إجراء تجميلي يبقى سجلًا مستقلًا حتى لا تختلط المناطق والأهداف والتجارب السابقة.", en: "Each aesthetic procedure stays independent so areas, goals, and prior history are not mixed." },
};

const SPECIAL_INLINE_CHILDREN = new Set([
  "Q_SCALP_SYMPTOM_DETAILS",
  "Q_TRIGGER_EVENT_DETAILS",
  "Q_TRIGGER_EVENTS_FEMALE_DETAILS",
  "Q_TRIGGER_EVENTS_MALE_DETAILS",
  "Q_PRIOR_DIAGNOSIS_DETAILS",
  "Q_HAIR_PROCEDURE_DETAILS",
  "Q_HQ_PREVIOUS_TREATMENT_DETAILS",
  "Q_HQ_DRUG_EXPOSURE_DETAILS",
  "Q_HQ_HEAT_TOOL_DETAILS",
  "Q_HQ_ROUTINE_DETAILS",
  "Q_LASER_CONCERN_DETAILS",
  "Q_AESTHETIC_DETAILS",
]);

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedDateValue(value: JsonValue | undefined): JsonValue | undefined {
  const parsed = coerceClinicalApproxDate(value);
  return parsed ? (parsed as unknown as JsonValue) : value;
}

function extractAnswers(input: PatientInputJson): Record<string, JsonValue> {
  if (!isRecord(input.answers)) return {};
  const answers: Record<string, JsonValue> = { ...input.answers };

  for (const contract of P01_QUESTION_CONTRACTS) {
    if (contract.responseType === "MONTH_YEAR" && answers[contract.code] !== undefined) {
      answers[contract.code] = normalizedDateValue(answers[contract.code])!;
    }
    const repeatableValue = answers[contract.code];
    if (contract.repeatable && Array.isArray(repeatableValue)) {
      answers[contract.code] = repeatableValue.map((rawItem: JsonValue) => {
        if (!isRecord(rawItem)) return rawItem;
        const item = { ...rawItem };
        for (const field of contract.repeatable!.fields) {
          if (field.type === "MONTH_YEAR" && item[field.code] !== undefined) {
            item[field.code] = normalizedDateValue(item[field.code])!;
          }
        }
        return item;
      });
    }
  }

  if (isRecord(answers.Q_SCALP_SYMPTOM_DETAILS)) {
    const migrated: Record<string, JsonValue> = {};
    for (const [symptom, rawDetail] of Object.entries(answers.Q_SCALP_SYMPTOM_DETAILS)) {
      if (!isRecord(rawDetail)) {
        migrated[symptom] = rawDetail;
        continue;
      }
      migrated[symptom] = {
        ...rawDetail,
        ...(rawDetail.onset !== undefined ? { onset: normalizedDateValue(rawDetail.onset)! } : {}),
      };
    }
    answers.Q_SCALP_SYMPTOM_DETAILS = migrated;
  }

  return answers;
}

function makeDocument(
  locale: P01Locale,
  answers: Record<string, JsonValue>,
  existing?: PatientInputJson,
  followUp?: P01FollowUpContext | null,
): PatientInputJson {
  return {
    ...existing,
    locale,
    answers,
    ...(followUp ? { followUp: followUp as unknown as JsonValue } : {}),
    uiSchemaVersion: "PILOT0_GUIDED_JOURNEY_v1.8.0_AUDITED",
    dateValueVersion: "CLINICAL_APPROX_DATE_v1",
    privacy: {
      noticeVersion: P01_PRIVACY_NOTICE_VERSION,
      noticeTextAr: P01_PRIVACY_NOTICE_AR,
      noticeTextEn: P01_PRIVACY_NOTICE_EN,
      language: locale,
      acceptedAt:
        isRecord(existing?.privacy) && typeof existing?.privacy.acceptedAt === "string"
          ? existing.privacy.acceptedAt
          : new Date().toISOString(),
    },
  };
}

function nestedRules(rule: Record<string, unknown>): Record<string, unknown>[] {
  if (rule.kind !== "ALL_OF" || !Array.isArray(rule.rules)) return [rule];
  return rule.rules.flatMap((child) =>
    typeof child === "object" && child !== null && !Array.isArray(child)
      ? nestedRules(child as Record<string, unknown>)
      : [],
  );
}

function getParentCode(question: P01EvaluatedQuestion): string | null {
  const rule = getP01Contract(question.code)?.visibility as Record<string, unknown> | undefined;
  if (!rule) return null;
  for (const candidate of nestedRules(rule)) {
    if (["SELECTED", "ANSWER_EQUALS", "ANSWER_IN", "HAS_SELECTION", "HAS_SELECTION_EXCEPT"].includes(String(candidate.kind))) {
      if (typeof candidate.questionCode === "string") return candidate.questionCode;
    }
    if (candidate.kind === "HAIR_CONCERN_INCLUDES") return "Q_HAIR_CONCERN";
    if (candidate.kind === "SCALP_HAS_SELECTED_SYMPTOM") return "Q_SCALP_SYMPTOMS";
    if (candidate.kind === "HQ_POST_WASH_APPLICABLE") return "Q_HQ_ROUTINE_ITEMS";
  }
  return null;
}

function childMatchesOption(question: P01EvaluatedQuestion, optionCode: string): boolean {
  const rule = getP01Contract(question.code)?.visibility as Record<string, unknown> | undefined;
  if (!rule) return false;
  for (const candidate of nestedRules(rule)) {
    if (candidate.kind === "SELECTED" && String(candidate.optionCode) === optionCode) return true;
    if (candidate.kind === "ANSWER_EQUALS" && String(candidate.value) === optionCode) return true;
    if (candidate.kind === "ANSWER_IN" && Array.isArray(candidate.values) && candidate.values.map(String).includes(optionCode)) return true;
    if (candidate.kind === "HAIR_CONCERN_INCLUDES") {
      const branch = String(candidate.branch);
      if (optionCode === branch || optionCode === "BOTH") return true;
    }
  }
  return false;
}

function selectedStrings(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}


function followUpPrimaryReason(context: P01FollowUpContext | null, answers: Record<string, JsonValue>): string | null {
  if (!context) return null;
  if (context.intent === "EXISTING_CONCERN") return context.selectedPrimaryReasonCode ?? null;
  return typeof answers.Q_VISIT_PRIMARY_REASON === "string" ? answers.Q_VISIT_PRIMARY_REASON : null;
}

function followUpRequiredChangesComplete(context: P01FollowUpContext | null, answers: Record<string, JsonValue>): boolean {
  const primary = followUpPrimaryReason(context, answers);
  if (!context || !primary) return false;
  const changes = context.changes;
  return requiredFollowUpChangeKeys(primary, context.identity.sex, selectedEpisodeState(context)).every((key) => followUpChangeAnswered(changes?.[key]));
}

function followUpChangeDetailsComplete(context: P01FollowUpContext | null, answers: Record<string, JsonValue>): boolean {
  if (!context || !followUpRequiredChangesComplete(context, answers)) return false;
  const primary = followUpPrimaryReason(context, answers);
  const deltaDetailsComplete = followUpDeltaCompletionIssues(context.changes, context.delta, primary).every((issue) => issue.startsWith("metric:"));
  const safetyComplete = followUpSafetyCompletionIssues(context, context.delta).length === 0;
  const sexSpecificComplete = followUpSexSpecificCompletionIssues(context, context.delta).length === 0;
  return deltaDetailsComplete && safetyComplete && sexSpecificComplete;
}

function followUpChangeReviewComplete(context: P01FollowUpContext | null, answers: Record<string, JsonValue>): boolean {
  return Boolean(context?.changesReviewed) && followUpChangeDetailsComplete(context, answers);
}

function followUpNeedsCurrentMetrics(context: P01FollowUpContext | null, answers: Record<string, JsonValue>): boolean {
  if (context?.intent !== "EXISTING_CONCERN") return false;
  const primary = followUpPrimaryReason(context, answers);
  return primary === "RV_HAIR_LOSS" || primary === "RV_SCALP_SYMPTOMS";
}

function followUpCurrentMetricsComplete(context: P01FollowUpContext | null, answers: Record<string, JsonValue>): boolean {
  if (!followUpNeedsCurrentMetrics(context, answers)) return true;
  const primary = followUpPrimaryReason(context, answers);
  return followUpDeltaCompletionIssues(context?.changes, context?.delta, primary).every((issue) => !issue.startsWith("metric:"));
}

function initialJourneyStep(
  evaluation: P01Evaluation,
  context: P01FollowUpContext | null,
  answers: Record<string, JsonValue>,
): JourneyStep {
  if (!context) return evaluation.firstIncompleteSection ?? "REVIEW";
  if (answers.Q_PRIVACY_CONSENT !== "YES") return "PRIVACY";
  if (!context.intent || (context.intent === "EXISTING_CONCERN" && !context.selectedEpisodeId)) return "FOLLOW_UP_START";
  if (context.intent === "NEW_CONCERN" && typeof answers.Q_VISIT_PRIMARY_REASON !== "string") return "VISIT_REASON";
  if (!followUpChangeReviewComplete(context, answers)) return "FOLLOW_UP_CHANGES";
  if (context.intent === "EXISTING_CONCERN" && !followUpCurrentMetricsComplete(context, answers)) return "FOLLOW_UP_CURRENT";
  return firstFollowUpRegistrySection(
    evaluation.questions.map(({ sectionCode }) => sectionCode),
    context,
  ) ?? "REVIEW";
}

export function PatientJourney() {
  const searchParams = useSearchParams();
  const [token] = useState(() => searchParams.get("token") ?? "");
  const [payload, setPayload] = useState<DraftPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, JsonValue>>({});
  const [followUp, setFollowUp] = useState<P01FollowUpContext | null>(null);
  const [locale, setLocale] = useState<P01Locale>("ar");
  const [step, setStep] = useState<JourneyStep>("PRIVACY");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [locked, setLocked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [finalConfirmed, setFinalConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<null | { visitId: string; clinicalInterviewId: string; idempotentReplay: boolean }>(null);
  const lastDocument = useRef<PatientInputJson>({});

  useEffect(() => {
    if (!token || searchParams.get("token") !== token) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [searchParams, token]);

  const saveDraft = useCallback(async (followUpOverride?: P01FollowUpContext | null): Promise<DraftPayload | null> => {
    if (!token || !answers.Q_PRIVACY_CONSENT) return null;
    if (!navigator.onLine) {
      setSaveState("offline");
      return null;
    }
    setSaveState("saving");
    setError("");
    const effectiveFollowUp = followUpOverride === undefined ? followUp : followUpOverride;
    const document = makeDocument(locale, answers, lastDocument.current, effectiveFollowUp);
    try {
      const response = await fetch("/api/patient-access/draft", {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ patientInputJson: document }),
      });
      const data = (await response.json()) as DraftPayload;
      if (!response.ok) {
        setLocked(response.status === 423);
        throw new Error(data.error?.message ?? "Autosave failed.");
      }
      lastDocument.current = data.draft.patientInputJson;
      setFollowUp(readFollowUpContext(data.draft.patientInputJson));
      setPayload(data);
      setDirty(false);
      setSaveState("saved");
      return data;
    } catch {
      setSaveState(navigator.onLine ? "failed" : "offline");
      setError(locale === "ar" ? "تعذر حفظ التغييرات. تحقق من الاتصال ثم أعد المحاولة." : "Unable to save changes. Check the connection and retry.");
      return null;
    }
  }, [answers, followUp, locale, token]);

  const loadDraft = useCallback(async () => {
    if (!token) return;
    setError("");
    const response = await fetch("/api/patient-access/draft", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    const data = (await response.json()) as DraftPayload;
    if (!response.ok) {
      setLocked(response.status === 423);
      throw new Error(data.error?.message ?? "Unable to load this session.");
    }
    const loadedAnswers = extractAnswers(data.draft.patientInputJson);
    const loadedFollowUp = readFollowUpContext(data.draft.patientInputJson);
    setPayload(data);
    setAnswers(loadedAnswers);
    setFollowUp(loadedFollowUp);
    setLocale(data.evaluation.locale);
    lastDocument.current = data.draft.patientInputJson;
    setStep(initialJourneyStep(data.evaluation, loadedFollowUp, loadedAnswers));
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDraft().catch(() => setError("تعذر فتح الجلسة. أعد المحاولة أو اطلب مساعدة الموظف. / Unable to open the session. Retry or ask a staff member for help."));
  }, [loadDraft]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const markOffline = () => setSaveState("offline");
    const markOnline = () => {
      setSaveState("idle");
      if (dirty) void saveDraft();
    };
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", markOnline);
    return () => {
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", markOnline);
    };
  }, [dirty, saveDraft]);

  useEffect(() => {
    if (!dirty || !answers.Q_PRIVACY_CONSENT) return;
    const timeout = window.setTimeout(() => void saveDraft(), 700);
    return () => window.clearTimeout(timeout);
  }, [answers, dirty, followUp, locale, saveDraft]);

  const evaluation = useMemo(
    () => payload
      ? evaluateP01Draft(
          makeDocument(locale, answers, payload.draft.patientInputJson, followUp),
          new Date(payload.clinicalReferenceDate),
        )
      : undefined,
    [payload, answers, followUp, locale],
  );
  const sectionQuestions = useMemo(
    () => evaluation?.questions.filter(({ sectionCode }) => sectionCode === step) ?? [],
    [evaluation, step],
  );
  const activeSections = useMemo(() => {
    if (!evaluation) return ["PRIVACY"] as P01SectionCode[];
    return followUpJourneySections(
      [...new Set(evaluation.questions.map(({ sectionCode }) => sectionCode))],
      followUp,
    );
  }, [evaluation, followUp]);

  function updateAnswer(code: string, value: JsonValue) {
    if (
      code === "Q_VISIT_PRIMARY_REASON" &&
      followUp?.intent === "NEW_CONCERN" &&
      typeof value === "string" &&
      followUp.episodes.some((episode) => episode.primaryReasonCode === value)
    ) {
      setError(locale === "ar"
        ? "هذه المشكلة لديها متابعة نشطة بالفعل. اخترها من شاشة متابعة المشكلة السابقة."
        : "This concern already has an active follow-up episode. Choose it from the previous-concern follow-up screen.");
      return;
    }
    setAnswers((current) => {
      const next: Record<string, JsonValue> = { ...current, [code]: value };
      if (code === "Q_PROFILE_SEX") {
        const nextSex = value === "MALE" ? "MALE" : value === "FEMALE" ? "FEMALE" : null;
        for (const contract of P01_QUESTION_CONTRACTS) {
          if (nextSex === "MALE" && (contract.sectionCode === "WOMENS_HEALTH" || contract.sectionCode === "PREGNANCY_CONTEXT")) delete next[contract.code];
          if (nextSex === "FEMALE" && contract.sectionCode === "MENS_HEALTH") delete next[contract.code];
        }
        if (nextSex === "MALE") {
          delete next.Q_TRIGGER_EVENTS_FEMALE;
          delete next.Q_TRIGGER_EVENTS_FEMALE_DETAILS;
        }
        if (nextSex === "FEMALE") {
          delete next.Q_TRIGGER_EVENTS_MALE;
          delete next.Q_TRIGGER_EVENTS_MALE_DETAILS;
        }
      }
      return next;
    });
    setDirty(true);
    setSaveState("idle");
    setError("");
  }


  function updateFollowUpIntent(intent: "EXISTING_CONCERN" | "NEW_CONCERN", episodeId?: string) {
    if (!followUp) return;
    const episode = intent === "EXISTING_CONCERN"
      ? followUp.episodes.find((item) => item.id === episodeId)
      : undefined;
    setFollowUp({
      ...followUp,
      intent,
      ...(episode ? {
        selectedEpisodeId: episode.id,
        selectedPrimaryReasonCode: episode.primaryReasonCode,
        sourceVisitId: episode.lastVisitId,
      } : {
        selectedEpisodeId: undefined,
        selectedPrimaryReasonCode: undefined,
        sourceVisitId: undefined,
      }),
      changes: undefined,
      delta: undefined,
      changesReviewed: false,
    });
    if (intent === "EXISTING_CONCERN") {
      setAnswers((current) => {
        const next = { ...current };
        delete next.Q_VISIT_PRIMARY_REASON;
        return next;
      });
    }
    setDirty(true);
    setSaveState("idle");
    setError("");
  }

  function updateFollowUpChange(
    key: keyof FollowUpChangeState,
    value: FollowUpChangeState[keyof FollowUpChangeState],
  ) {
    if (!followUp) return;
    const nextChanges = { ...(followUp.changes ?? {}), [key]: value } as FollowUpChangeState;
    const nextDelta = { ...(followUp.delta ?? {}) } as FollowUpDeltaState;

    // Follow-up delta is the source of today's changes. Clear only details that
    // are no longer applicable; selecting another action must not erase details
    // the patient already entered for a different action in the same domain.
    switch (key) {
      case "generalHealth":
        if (value !== "CHANGED") delete nextDelta.generalHealth;
        break;
      case "medicationsSupplements": {
        if (value === "NO_CHANGE" || !Array.isArray(value)) {
          delete nextDelta.medicationsSupplements;
          break;
        }
        const current = nextDelta.medicationsSupplements;
        if (current) {
          nextDelta.medicationsSupplements = {
            startedMedications: value.includes("STARTED") ? current.startedMedications : [],
            startedSupplements: value.includes("STARTED") ? current.startedSupplements : [],
            affectedExisting: current.affectedExisting.filter((item) => value.includes(item.action)),
          };
        }
        break;
      }
      case "hairTreatments": {
        if (value === "NO_CHANGE" || !Array.isArray(value)) {
          delete nextDelta.hairTreatments;
          break;
        }
        const current = nextDelta.hairTreatments;
        if (current) {
          nextDelta.hairTreatments = {
            started: value.includes("STARTED") ? current.started : [],
            affectedExisting: current.affectedExisting.filter((item) => value.includes(item.action)),
          };
        }
        break;
      }
      case "hairProcedures":
        if (value !== "YES") delete nextDelta.hairProcedures;
        break;
      case "triggerEvents":
        if (value !== "YES") delete nextDelta.triggerEvents;
        break;
      case "sexSpecific":
        if (value !== "CHANGED") delete nextDelta.sexSpecific;
        break;
      case "hairQualityLifestyle":
        if (value !== "CHANGED") delete nextDelta.hairQualityLifestyle;
        break;
    }

    setFollowUp({ ...followUp, changes: nextChanges, delta: nextDelta, changesReviewed: false });

    const changed = Array.isArray(value) ? value.length > 0 : typeof value === "string" && !["NO_CHANGE", "NO", "UNSURE"].includes(value);
    if (!changed) {
      const domainByKey: Record<keyof FollowUpChangeState, ReturnType<typeof getFollowUpDomain>> = {
        generalHealth: "GENERAL_HEALTH",
        medicationsSupplements: "MEDICATIONS_SUPPLEMENTS",
        hairTreatments: "HAIR_TREATMENTS",
        hairProcedures: "HAIR_PROCEDURES",
        triggerEvents: "TRIGGER_EVENTS",
        sexSpecific: "SEX_SPECIFIC",
        hairQualityLifestyle: "HAIR_QUALITY_LIFESTYLE",
      };
      const targetDomain = domainByKey[key];
      setAnswers((current) => {
        const next = { ...current };
        for (const contract of P01_QUESTION_CONTRACTS) {
          const lifecycle = getFollowUpLifecycle(contract.code);
          if (
            getFollowUpDomain(contract.code) === targetDomain &&
            lifecycle !== "VISIT_MEASUREMENT" &&
            lifecycle !== "CURRENT_SAFETY_STATE"
          ) {
            delete next[contract.code];
          }
        }
        return next;
      });
    }

    setDirty(true);
    setSaveState("idle");
    setError("");
  }

  function updateFollowUpDelta(delta: FollowUpDeltaState, preserveReviewed = false) {
    if (!followUp) return;
    setFollowUp({ ...followUp, delta, changesReviewed: preserveReviewed ? followUp.changesReviewed : false });
    setDirty(true);
    setSaveState("idle");
    setError("");
  }

  function switchLanguage(nextLocale: P01Locale) {
    setLocale(nextLocale);
    setDirty(true);
    setSaveState("idle");
  }

  async function continueJourney() {
    if (followUp && step === "PRIVACY") {
      const saved = await saveDraft();
      if (!saved) return;
      setStep("FOLLOW_UP_START");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (step === "FOLLOW_UP_START") {
      if (!followUp?.intent || (followUp.intent === "EXISTING_CONCERN" && !followUp.selectedEpisodeId)) {
        setError(locale === "ar" ? "حدد هدف زيارة اليوم أولًا." : "Choose the purpose of today's visit first.");
        return;
      }
      const saved = await saveDraft();
      if (!saved) return;
      setStep(followUp.intent === "NEW_CONCERN" ? "VISIT_REASON" : "FOLLOW_UP_CHANGES");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (step === "FOLLOW_UP_CHANGES") {
      if (!followUpRequiredChangesComplete(followUp, answers)) {
        setError(locale === "ar" ? "راجع كل بنود التغيير المطلوبة قبل المتابعة." : "Review each required change item before continuing.");
        return;
      }
      if (!followUpChangeDetailsComplete(followUp, answers)) {
        setError(locale === "ar" ? "أكمل تفاصيل التغيير الذي اخترته قبل المتابعة." : "Complete the details for the change you selected before continuing.");
        return;
      }
      const reviewedFollowUp = followUp ? { ...followUp, changesReviewed: true } : null;
      setFollowUp(reviewedFollowUp);
      const saved = await saveDraft(reviewedFollowUp);
      const nextEvaluation = saved?.evaluation ?? evaluation;
      if (!nextEvaluation) return;
      if (reviewedFollowUp?.intent === "EXISTING_CONCERN" && followUpNeedsCurrentMetrics(reviewedFollowUp, answers)) {
        setStep("FOLLOW_UP_CURRENT");
      } else {
        setStep(firstFollowUpRegistrySection(
          nextEvaluation.questions.map(({ sectionCode }) => sectionCode),
          reviewedFollowUp,
        ) ?? "REVIEW");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (step === "FOLLOW_UP_CURRENT") {
      if (!followUpCurrentMetricsComplete(followUp, answers)) {
        setError(locale === "ar" ? "أكمل المقاييس الحالية قبل المتابعة." : "Complete the current measures before continuing.");
        return;
      }
      const saved = await saveDraft();
      const nextEvaluation = saved?.evaluation ?? evaluation;
      if (!nextEvaluation) return;
      setStep(firstFollowUpRegistrySection(
        nextEvaluation.questions.map(({ sectionCode }) => sectionCode),
        followUp,
      ) ?? "REVIEW");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const saved = await saveDraft();
    const nextEvaluation = saved?.evaluation ?? evaluation;
    if (!nextEvaluation) return;
    const currentHasIssue = nextEvaluation.questions.some((question) => question.sectionCode === step && question.issues.length > 0);
    if (currentHasIssue) {
      setError(locale === "ar" ? "يوجد عنصر يحتاج إكمالًا في هذه الخطوة. ستجده موضحًا أسفل السؤال." : "An item in this step still needs attention. It is highlighted below the question.");
      return;
    }
    if (followUp?.intent === "NEW_CONCERN" && step === "VISIT_REASON") {
      setStep("FOLLOW_UP_CHANGES");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const refreshedSections = followUpJourneySections(
      [...new Set(nextEvaluation.questions.map(({ sectionCode }) => sectionCode))],
      followUp,
    );
    const currentIndex = refreshedSections.indexOf(step as P01SectionCode);
    setStep(refreshedSections[currentIndex + 1] ?? "REVIEW");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function previousStep() {
    if (step === "FOLLOW_UP_START") {
      setStep("PRIVACY");
      return;
    }
    if (step === "FOLLOW_UP_CHANGES") {
      setStep(followUp?.intent === "NEW_CONCERN" ? "VISIT_REASON" : "FOLLOW_UP_START");
      return;
    }
    if (step === "FOLLOW_UP_CURRENT") {
      setStep("FOLLOW_UP_CHANGES");
      return;
    }
    if (followUp?.intent === "NEW_CONCERN" && step === "VISIT_REASON") {
      setStep("FOLLOW_UP_START");
      return;
    }
    if (followUp?.intent === "EXISTING_CONCERN") {
      const clinical: P01SectionCode[] = activeSections.filter((section): section is P01SectionCode => section !== "PRIVACY" && section !== "VISIT_REASON");
      if (step === "REVIEW") {
        setStep(clinical.at(-1) ?? (followUpNeedsCurrentMetrics(followUp, answers) ? "FOLLOW_UP_CURRENT" : "FOLLOW_UP_CHANGES"));
        return;
      }
      const clinicalIndex = clinical.indexOf(step as P01SectionCode);
      if (clinicalIndex === 0) {
        setStep(followUpNeedsCurrentMetrics(followUp, answers) ? "FOLLOW_UP_CURRENT" : "FOLLOW_UP_CHANGES");
        return;
      }
      if (clinicalIndex > 0) {
        setStep(clinical[clinicalIndex - 1]);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }
    if (step === "REVIEW") {
      setStep(activeSections.at(-1) ?? (followUp ? "FOLLOW_UP_CHANGES" : "PRIVACY"));
      return;
    }
    const index = activeSections.indexOf(step as P01SectionCode);
    if (followUp && index === 0) {
      setStep("FOLLOW_UP_CHANGES");
      return;
    }
    if (index > 0) {
      setStep(activeSections[index - 1]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function finalSubmit() {
    if (!finalConfirmed || submitting) return;
    setSubmitting(true);
    const saved = dirty ? await saveDraft() : payload;
    if (!saved || saved.evaluation.state !== "READY") {
      const target = saved?.evaluation.firstIncompleteSection;
      if (target) {
        const canNavigate = followUp?.intent !== "EXISTING_CONCERN" || isAllowedExistingFollowUpRegistrySection(target);
        if (canNavigate) setStep(target);
      }
      setError(locale === "ar" ? "راجع العناصر الناقصة قبل الإرسال." : "Review missing items before submission.");
      setSubmitting(false);
      return;
    }
    try {
      const response = await fetch("/api/patient-access/final-submit", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      const result = (await response.json()) as { visitId?: string; clinicalInterviewId?: string; idempotentReplay?: boolean; evaluation?: P01Evaluation; error?: { message?: string } };
      if (!response.ok || !result.visitId || !result.clinicalInterviewId) {
        if (result.evaluation) setPayload((current) => current ? { ...current, evaluation: result.evaluation! } : current);
        throw new Error(result.error?.message ?? "Final Submit failed.");
      }
      setSubmitted({ visitId: result.visitId, clinicalInterviewId: result.clinicalInterviewId, idempotentReplay: Boolean(result.idempotentReplay) });
    } catch {
      setError(locale === "ar" ? "تعذر الإرسال. لم يتم تأكيد الإرسال؛ تحقق من الاتصال ثم أعد المحاولة." : "Unable to submit. Submission was not confirmed; check the connection and retry.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return <div className="app-shell" dir="rtl"><BrandHeader compact /><main className="patient-center-card"><h1>الرابط المؤقت مطلوب</h1><p>افتح الرابط أو امسح رمز QR الذي أنشأه الموظف.</p></main></div>;
  }

  if (submitted) {
    return (
      <div className="app-shell" dir={locale === "ar" ? "rtl" : "ltr"}>
        <BrandHeader compact locale={locale} />
        <main className="patient-center-card success-card">
          <span className="success-mark">✓</span>
          <h1>{locale === "ar" ? "تم الإرسال بنجاح" : "Submitted successfully"}</h1>
          <p>{locale === "ar" ? "أصبحت المقابلة جاهزة لمراجعة الطبيب." : "The interview is ready for physician review."}</p>
          <p>{locale === "ar" ? "يمكن إغلاق الصفحة أو انتظار تعليمات الفريق." : "You may close this page or wait for instructions from the team."}</p>
        </main>
      </div>
    );
  }

  if (!payload || !evaluation) {
    return <div className="app-shell" dir="rtl"><BrandHeader compact /><main className="patient-center-card"><div className="spinner" /><p>{error || "جارٍ فتح الجلسة المؤقتة…"}</p>{locked && <p>الجلسة مقفلة. اطلب من الموظف إعادة تفعيلها.</p>}</main></div>;
  }

  const warningRemaining = new Date(payload.draft.warningAt).getTime() - now;
  const lockRemaining = new Date(payload.draft.lockAt).getTime() - now;
  const showWarning = warningRemaining <= 0 && lockRemaining > 0;
  const direction = locale === "ar" ? "rtl" : "ltr";
  const title = step === "REVIEW"
    ? (locale === "ar" ? "مراجعة الإجابات" : "Review answers")
    : step === "FOLLOW_UP_START"
      ? (locale === "ar" ? "مرحبًا بعودتك" : "Welcome back")
      : step === "FOLLOW_UP_CHANGES"
        ? (locale === "ar" ? "ما الذي تغير منذ آخر زيارة؟" : "What changed since your last visit?")
        : step === "FOLLOW_UP_CURRENT"
          ? (locale === "ar" ? "حالة اليوم" : "Today’s state")
          : SECTION_TITLES[step][locale];
  const description = step === "REVIEW"
    ? (locale === "ar" ? "راجع الأقسام قبل الإرسال النهائي. يمكنك الرجوع لأي قسم بضغطة واحدة." : "Review each section before final submission. You can return to any section with one click.")
    : step === "FOLLOW_UP_START"
      ? (locale === "ar" ? "سنعتمد على معلوماتك المسجلة ونطلب فقط ما يخص زيارة اليوم أو ما تغير منذ زيارتك السابقة." : "We will use your existing record and ask only about today's visit or what has changed since your last visit.")
      : step === "FOLLOW_UP_CHANGES"
        ? (locale === "ar" ? "أجب فقط عن التغييرات منذ زيارتك السابقة، وأكمل تفاصيل أي تغيير تختاره." : "Answer only about changes since your previous visit, and complete the details for any change you select.")
        : step === "FOLLOW_UP_CURRENT"
          ? (locale === "ar" ? "سجّل المقاييس الحالية فقط حتى يستطيع الطبيب مقارنتها بالزيارات السابقة." : "Record only the current measures so the physician can compare them with previous visits.")
          : SECTION_DESCRIPTIONS[step]?.[locale];

  return (
    <ClinicalDateReferenceProvider value={payload.clinicalReferenceDate}>
    <div className="patient-shell" dir={direction} lang={locale}>
      <BrandHeader compact locale={locale} />
      <main className="patient-main">
        <div className="patient-toolbar">
          <button className="language-toggle" onClick={() => switchLanguage(locale === "ar" ? "en" : "ar")} type="button">{locale === "ar" ? "English" : "العربية"}</button>
          <SaveIndicator state={saveState} locale={locale} onRetry={() => void saveDraft()} />
        </div>

        {showWarning && <div className="warning-banner" role="alert">{locale === "ar" ? `ستنقفل الجلسة بعد ${localeNumber(Math.max(1, Math.ceil(lockRemaining / 1000)), locale)} ثانية من الخمول.` : `The session will lock in ${Math.max(1, Math.ceil(lockRemaining / 1000))} seconds of inactivity.`}</div>}

        <JourneyProgress locale={locale} activeSections={activeSections} step={step} followUp={followUp} />

        <section className={followUp ? "patient-card patient-card--returning" : "patient-card"}>
          <div className="patient-card-heading">
            <div>
              <p className="eyebrow">{followUp ? (locale === "ar" ? "متابعة الزيارة" : "Follow-up visit") : (locale === "ar" ? "مقابلة سريرية موجهة" : "Guided clinical interview")}</p>
              <h1>{title}</h1>
              {description && <p className="section-description">{description}</p>}
            </div>
          </div>

          {(step === "HAIR_LOSS" || step === "SCALP") && <FiveMetricsGuide locale={locale} compact={step === "SCALP"} />}

          {step === "FOLLOW_UP_START" && followUp ? (
            <FollowUpStartStep
              locale={locale}
              context={followUp}
              onIntent={updateFollowUpIntent}
            />
          ) : step === "FOLLOW_UP_CHANGES" && followUp ? (
            <FollowUpDeltaStep
              locale={locale}
              context={followUp}
              additional={selectedStrings(answers.Q_VISIT_ADDITIONAL_REQUESTS)}
              onChangeGate={updateFollowUpChange}
              onDelta={updateFollowUpDelta}
              onAdditional={(value) => updateAnswer("Q_VISIT_ADDITIONAL_REQUESTS", value)}
            />
          ) : step === "FOLLOW_UP_CURRENT" && followUp ? (
            <FollowUpCurrentMetrics locale={locale} context={followUp} onDelta={(delta) => updateFollowUpDelta(delta, true)} />
          ) : step === "PRIVACY" ? (
            <PrivacyStep locale={locale} accepted={answers.Q_PRIVACY_CONSENT === "YES"} onAccept={(accepted) => updateAnswer("Q_PRIVACY_CONSENT", accepted ? "YES" : "NO")} />
          ) : step === "REVIEW" ? (
            <ReviewStep locale={locale} evaluation={evaluation} followUp={followUp} onJump={setStep} onFollowUpJump={setStep} activeSections={activeSections} finalConfirmed={finalConfirmed} setFinalConfirmed={setFinalConfirmed} submitting={submitting} onSubmit={() => void finalSubmit()} />
          ) : (
            <QuestionTree questions={sectionQuestions} locale={locale} answers={answers} onChange={updateAnswer} />
          )}

          {error && <div className="error-summary" role="alert">{error}</div>}
          {step !== "REVIEW" && (
            <div className="patient-actions">
              <button className="button button--secondary" disabled={step === "PRIVACY"} onClick={previousStep} type="button">{locale === "ar" ? "السابق" : "Back"}</button>
              <button className="button button--primary" disabled={saveState === "saving" || answers.Q_PRIVACY_CONSENT !== "YES"} onClick={() => void continueJourney()} type="button">{locale === "ar" ? "متابعة" : "Continue"}</button>
            </div>
          )}
        </section>
      </main>
    </div>
    </ClinicalDateReferenceProvider>
  );
}

function JourneyProgress({ locale, activeSections, step, followUp }: { locale: P01Locale; activeSections: P01SectionCode[]; step: JourneyStep; followUp: P01FollowUpContext | null }) {
  const followUpClinicalSections = activeSections.filter((section) => section !== "PRIVACY" && section !== "VISIT_REASON");
  const sequence: JourneyStep[] = followUp
    ? [
        ...(activeSections.includes("PRIVACY") ? ["PRIVACY" as P01SectionCode] : []),
        "FOLLOW_UP_START",
        ...(followUp.intent === "NEW_CONCERN" && activeSections.includes("VISIT_REASON") ? ["VISIT_REASON" as P01SectionCode] : []),
        "FOLLOW_UP_CHANGES",
        ...(followUp.intent === "EXISTING_CONCERN" && ["RV_HAIR_LOSS", "RV_SCALP_SYMPTOMS"].includes(followUp.selectedPrimaryReasonCode ?? "") ? ["FOLLOW_UP_CURRENT" as const] : []),
        ...followUpClinicalSections,
        "REVIEW",
      ]
    : [...activeSections, "REVIEW"];
  const currentIndex = Math.max(0, sequence.indexOf(step));
  const total = sequence.length;
  const current = currentIndex + 1;
  const remaining = Math.max(0, total - current);
  const percent = Math.max(3, Math.round((current / total) * 100));
  const titleFor = (item: JourneyStep): string => {
    if (item === "FOLLOW_UP_START") return locale === "ar" ? "بداية المتابعة" : "Follow-up start";
    if (item === "FOLLOW_UP_CHANGES") return locale === "ar" ? "التغييرات" : "Changes";
    if (item === "FOLLOW_UP_CURRENT") return locale === "ar" ? "حالة اليوم" : "Today’s state";
    if (item === "REVIEW") return locale === "ar" ? "المراجعة" : "Review";
    return SECTION_TITLES[item][locale];
  };
  return (
    <div className="journey-progress" aria-label={locale === "ar" ? "تقدم المقابلة" : "Interview progress"}>
      <div className="journey-progress-copy">
        <strong>{locale === "ar" ? `الخطوة ${localeNumber(current, locale)} من ${localeNumber(total, locale)}` : `Step ${current} of ${total}`}</strong>
        <span>{remaining === 0 ? (locale === "ar" ? "بقيت المراجعة النهائية" : "Final review") : (locale === "ar" ? `باقي ${localeNumber(remaining, locale)} ${remaining === 1 ? "خطوة" : "خطوات"}` : `${remaining} step${remaining === 1 ? "" : "s"} remaining`)}</span>
      </div>
      <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
      <div className="section-stepper" role="list">
        {sequence.map((item, index) => {
          const status = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
          return <span key={`${item}:${index}`} className={`section-dot section-dot--${status}`} title={titleFor(item)} role="listitem">{status === "done" ? "✓" : localeNumber(index + 1, locale)}</span>;
        })}
      </div>
    </div>
  );
}


function FollowUpStartStep({
  locale,
  context,
  onIntent,
}: {
  locale: P01Locale;
  context: P01FollowUpContext;
  onIntent: (intent: "EXISTING_CONCERN" | "NEW_CONCERN", episodeId?: string) => void;
}) {
  const isAr = locale === "ar";
  return (
    <div className="follow-up-stack">
      <section className="follow-up-purpose-block">
        <h2>{isAr ? FOLLOW_UP_COPY.purpose.ar : FOLLOW_UP_COPY.purpose.en}</h2>
        {context.episodes.length > 0 && (
          <div className="follow-up-episode-grid">
            {context.episodes.map((episode) => {
              const selected = context.intent === "EXISTING_CONCERN" && context.selectedEpisodeId === episode.id;
              return (
                <button
                  aria-pressed={selected}
                  className={`follow-up-choice-card${selected ? " follow-up-choice-card--selected" : ""}`}
                  key={episode.id}
                  onClick={() => onIntent("EXISTING_CONCERN", episode.id)}
                  type="button"
                >
                  <span className="choice-radio" aria-hidden="true">{selected ? "●" : "○"}</span>
                  <span>
                    <strong>{isAr ? FOLLOW_UP_COPY.purpose.existingAr : FOLLOW_UP_COPY.purpose.existingEn}</strong>
                    <b>{isAr ? episode.labelAr : episode.labelEn}</b>
                    <small>{isAr ? `آخر زيارة: ${formatClinicDateTime(episode.lastVisitAt, locale)}` : `Last visit: ${formatClinicDateTime(episode.lastVisitAt, locale)}`}</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <button
          aria-pressed={context.intent === "NEW_CONCERN"}
          className={`follow-up-choice-card follow-up-choice-card--new${context.intent === "NEW_CONCERN" ? " follow-up-choice-card--selected" : ""}`}
          onClick={() => onIntent("NEW_CONCERN")}
          type="button"
        >
          <span className="choice-radio" aria-hidden="true">{context.intent === "NEW_CONCERN" ? "●" : "○"}</span>
          <span><strong>{isAr ? FOLLOW_UP_COPY.purpose.newAr : FOLLOW_UP_COPY.purpose.newEn}</strong></span>
        </button>
      </section>
    </div>
  );
}

function PrivacyStep({ locale, accepted, onAccept }: { locale: P01Locale; accepted: boolean; onAccept: (accepted: boolean) => void }) {
  return (
    <div className="privacy-step">
      <div className="notice-box"><span>{locale === "ar" ? "إشعار خصوصية — صياغة قانونية نهائية قيد الاعتماد" : "Privacy notice — final legal wording pending"}</span><p>{locale === "ar" ? P01_PRIVACY_NOTICE_AR : P01_PRIVACY_NOTICE_EN}</p></div>
      <label className="consent-row"><input checked={accepted} onChange={(event) => onAccept(event.target.checked)} type="checkbox" /><span>{locale === "ar" ? "أوافق صراحةً على معالجة بياناتي الشخصية والصحية للأغراض السريرية الموضحة." : "I explicitly consent to processing my personal and health data for the clinical purposes described."}</span></label>
    </div>
  );
}

function QuestionTree({ questions, locale, answers, onChange }: { questions: P01EvaluatedQuestion[]; locale: P01Locale; answers: Record<string, JsonValue>; onChange: (code: string, value: JsonValue) => void }) {
  const codes = new Set(questions.map(({ code }) => code));
  const rootQuestions = questions.filter((question) => {
    if (SPECIAL_INLINE_CHILDREN.has(question.code)) return false;
    const parent = getParentCode(question);
    return !parent || !codes.has(parent);
  });
  const childrenByParent = new Map<string, P01EvaluatedQuestion[]>();
  for (const question of questions) {
    if (SPECIAL_INLINE_CHILDREN.has(question.code)) continue;
    const parent = getParentCode(question);
    if (!parent || !codes.has(parent)) continue;
    const children = childrenByParent.get(parent) ?? [];
    children.push(question);
    childrenByParent.set(parent, children);
  }
  return (
    <div className="question-stack">
      {rootQuestions.map((question) => (
        <QuestionNode key={question.code} question={question} questions={questions} childrenByParent={childrenByParent} locale={locale} answers={answers} onChange={onChange} depth={0} />
      ))}
    </div>
  );
}

function QuestionNode({ question, questions, childrenByParent, locale, answers, onChange, depth }: { question: P01EvaluatedQuestion; questions: P01EvaluatedQuestion[]; childrenByParent: Map<string, P01EvaluatedQuestion[]>; locale: P01Locale; answers: Record<string, JsonValue>; onChange: (code: string, value: JsonValue) => void; depth: number }) {
  const children = childrenByParent.get(question.code) ?? [];
  return (
    <QuestionField
      question={question}
      locale={locale}
      answers={answers}
      onChange={onChange}
      depth={depth}
      renderOptionChildren={(optionCode) => children.filter((child) => childMatchesOption(child, optionCode)).map((child) => <QuestionNode key={child.code} question={child} questions={questions} childrenByParent={childrenByParent} locale={locale} answers={answers} onChange={onChange} depth={depth + 1} />)}
      renderQuestionChildren={() => children.filter((child) => !question.options.some((option) => childMatchesOption(child, option.code))).map((child) => <QuestionNode key={child.code} question={child} questions={questions} childrenByParent={childrenByParent} locale={locale} answers={answers} onChange={onChange} depth={depth + 1} />)}
      specialQuestions={questions}
    />
  );
}


const LOCALIZED_NUMERIC_TEXT_QUESTIONS = new Set([
  "Q_WOMEN_IRREGULAR_INTERVAL",
  "Q_WOMEN_IRREGULAR_DURATION",
]);

function LocalizedNumericInput({ locale, value, onChange }: { locale: P01Locale; value: JsonValue | undefined; onChange: (value: JsonValue) => void }) {
  const raw = typeof value === "string" ? value : "";
  return <input inputMode="numeric" type="text" value={localizeDigits(raw, locale)} onChange={(event) => onChange(toAsciiDigits(event.target.value).replace(/[^0-9]/g, ""))} />;
}

function QuestionField({ question, locale, answers, onChange, depth, renderOptionChildren, renderQuestionChildren, specialQuestions }: { question: P01EvaluatedQuestion; locale: P01Locale; answers: Record<string, JsonValue>; onChange: (code: string, value: JsonValue) => void; depth: number; renderOptionChildren: (optionCode: string) => React.ReactNode; renderQuestionChildren: () => React.ReactNode; specialQuestions: P01EvaluatedQuestion[] }) {
  const value = answers[question.code];
  const clinicalReferenceDate = useClinicalDateReference();
  if (question.code === "Q_HQ_POST_WASH_ORDER") return <PostWashOrderField question={question} locale={locale} answers={answers} onChange={onChange} depth={depth} />;
  if (question.code === "Q_HQ_HAIR_STATE") return <HairStateField question={question} locale={locale} value={value} onChange={(next) => onChange(question.code, next)} depth={depth} />;
  if (question.code === "Q_HQ_NATURAL_PATTERN") return <HairPatternField question={question} locale={locale} value={value} onChange={(next) => onChange(question.code, next)} depth={depth} />;
  if (question.repeatable) return <RepeatableField question={question} locale={locale} value={value} onChange={(next) => onChange(question.code, next)} depth={depth} />;
  const isNested = depth > 0;

  const specialChild = (code: string) => specialQuestions.find((candidate) => candidate.code === code);

  function pruneInlineDetail(optionCode: string) {
    if (question.code === "Q_SCALP_SYMPTOMS") {
      const details = isRecord(answers.Q_SCALP_SYMPTOM_DETAILS) ? answers.Q_SCALP_SYMPTOM_DETAILS : {};
      const { [optionCode]: _removed, ...rest } = details;
      void _removed;
      onChange("Q_SCALP_SYMPTOM_DETAILS", rest);
    }
    const repeatableChildCode = question.code === "Q_TRIGGER_EVENTS"
      ? "Q_TRIGGER_EVENT_DETAILS"
      : question.code === "Q_TRIGGER_EVENTS_FEMALE"
        ? "Q_TRIGGER_EVENTS_FEMALE_DETAILS"
        : question.code === "Q_TRIGGER_EVENTS_MALE"
          ? "Q_TRIGGER_EVENTS_MALE_DETAILS"
          : question.code === "Q_PRIOR_DIAGNOSES"
            ? "Q_PRIOR_DIAGNOSIS_DETAILS"
            : question.code === "Q_HAIR_PROCEDURES"
              ? "Q_HAIR_PROCEDURE_DETAILS"
              : question.code === "Q_HQ_PREVIOUS_TREATMENTS"
                ? "Q_HQ_PREVIOUS_TREATMENT_DETAILS"
                : question.code === "Q_HQ_DRUG_EXPOSURES"
                  ? "Q_HQ_DRUG_EXPOSURE_DETAILS"
                  : question.code === "Q_HQ_HEAT_TOOLS"
                    ? "Q_HQ_HEAT_TOOL_DETAILS"
                    : question.code === "Q_HQ_ROUTINE_ITEMS"
                      ? "Q_HQ_ROUTINE_DETAILS"
                      : question.code === "Q_LASER_CONCERNS"
                        ? "Q_LASER_CONCERN_DETAILS"
                        : question.code === "Q_AESTHETIC_PROCEDURES"
                          ? "Q_AESTHETIC_DETAILS"
                          : null;
    if (repeatableChildCode) {
      const rawItems = answers[repeatableChildCode];
      const items = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
      onChange(repeatableChildCode, items.filter((item) => item.id !== optionCode));
    }
  }

  function renderSpecialForOption(optionCode: string): React.ReactNode {
    if (question.code === "Q_SCALP_SYMPTOMS" && optionCode !== "NO_SYMPTOMS") {
      const child = specialChild("Q_SCALP_SYMPTOM_DETAILS");
      return child ? <ScalpSymptomInlineDetail symptom={optionCode} question={child} locale={locale} answers={answers} onChange={onChange} /> : null;
    }
    if (question.code === "Q_TRIGGER_EVENTS" && optionCode !== "NONE_OF_THE_ABOVE") {
      const child = specialChild("Q_TRIGGER_EVENT_DETAILS");
      return child ? <SelectionDateInline itemCode={optionCode} childQuestion={child} locale={locale} answers={answers} onChange={onChange} idField="event" /> : null;
    }
    if (question.code === "Q_TRIGGER_EVENTS_FEMALE" && optionCode !== "NONE") {
      const child = specialChild("Q_TRIGGER_EVENTS_FEMALE_DETAILS");
      return child ? <SelectionDateInline itemCode={optionCode} childQuestion={child} locale={locale} answers={answers} onChange={onChange} idField="event" /> : null;
    }
    if (question.code === "Q_TRIGGER_EVENTS_MALE" && optionCode !== "NONE") {
      const child = specialChild("Q_TRIGGER_EVENTS_MALE_DETAILS");
      return child ? <SelectionDateInline itemCode={optionCode} childQuestion={child} locale={locale} answers={answers} onChange={onChange} idField="event" /> : null;
    }
    if (question.code === "Q_PRIOR_DIAGNOSES" && optionCode !== "DO_NOT_REMEMBER") {
      const child = specialChild("Q_PRIOR_DIAGNOSIS_DETAILS");
      return child ? <SelectionDateInline itemCode={optionCode} childQuestion={child} locale={locale} answers={answers} onChange={onChange} idField="diagnosis" /> : null;
    }
    if (question.code === "Q_HAIR_PROCEDURES") {
      const child = specialChild("Q_HAIR_PROCEDURE_DETAILS");
      return child ? <ProcedureInlineDetail procedure={optionCode} childQuestion={child} locale={locale} answers={answers} onChange={onChange} /> : null;
    }
    if (question.code === "Q_HQ_PREVIOUS_TREATMENTS" && optionCode !== "NONE") {
      const child = specialChild("Q_HQ_PREVIOUS_TREATMENT_DETAILS");
      return child ? <HairQualityTreatmentInline treatment={optionCode} childQuestion={child} locale={locale} answers={answers} onChange={onChange} /> : null;
    }
    if (question.code === "Q_HQ_DRUG_EXPOSURES" && optionCode !== "NONE") {
      const child = specialChild("Q_HQ_DRUG_EXPOSURE_DETAILS");
      return child ? <HairQualityDrugInline exposure={optionCode} childQuestion={child} locale={locale} answers={answers} onChange={onChange} /> : null;
    }
    if (question.code === "Q_HQ_HEAT_TOOLS" && optionCode !== "NONE") {
      const child = specialChild("Q_HQ_HEAT_TOOL_DETAILS");
      return child ? <SelectionFrequencyInline itemCode={optionCode} itemField="tool" childQuestion={child} locale={locale} answers={answers} onChange={onChange} mode="heat" /> : null;
    }
    if (question.code === "Q_HQ_ROUTINE_ITEMS" && optionCode !== "NONE") {
      const child = specialChild("Q_HQ_ROUTINE_DETAILS");
      return child ? <SelectionFrequencyInline itemCode={optionCode} itemField="routineItem" childQuestion={child} locale={locale} answers={answers} onChange={onChange} mode="routine" /> : null;
    }
    if (question.code === "Q_LASER_CONCERNS") {
      const child = specialChild("Q_LASER_CONCERN_DETAILS");
      return child ? <LaserConcernInline concern={optionCode} childQuestion={child} locale={locale} answers={answers} onChange={onChange} /> : null;
    }
    if (question.code === "Q_AESTHETIC_PROCEDURES") {
      const child = specialChild("Q_AESTHETIC_DETAILS");
      return child ? <AestheticProcedureInline procedure={optionCode} childQuestion={child} locale={locale} answers={answers} onChange={onChange} /> : null;
    }
    return null;
  }

  return (
    <fieldset className={`question-field ${isNested ? "question-field--nested" : ""} ${question.issues.length ? "question-field--invalid" : ""}`}>
      <legend>{question.label}{question.help && <small className="question-help">{question.help}</small>}</legend>

      {question.responseType === "TEXT" ? (
        LOCALIZED_NUMERIC_TEXT_QUESTIONS.has(question.code)
          ? <LocalizedNumericInput locale={locale} value={value} onChange={(next) => onChange(question.code, next)} />
          : <input value={typeof value === "string" ? localizeDigits(value, locale) : ""} onChange={(event) => onChange(question.code, locale === "ar" ? event.target.value : toAsciiDigits(event.target.value))} />
      ) : question.responseType === "LONG_TEXT" ? (
        <textarea rows={4} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(question.code, event.target.value)} />
      ) : question.responseType === "NUMBER" || question.responseType === "INTEGER" ? (
        <LocalizedNumericInput locale={locale} value={value} onChange={(next) => onChange(question.code, next)} />
      ) : question.responseType === "DATE" ? (
        <input aria-label={question.label} max={clinicalReferenceDate.toISOString().slice(0, 10)} type="date" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(question.code, event.target.value)} />
      ) : question.responseType === "MONTH_YEAR" ? (
        <ClinicalDatePicker locale={locale} value={value} onChange={(next) => onChange(question.code, next)} />
      ) : question.responseType === "SCALE" ? (
        <ScaleQuestion questionCode={question.code} locale={locale} value={value} onChange={(next) => onChange(question.code, next)} />
      ) : question.responseType === "MULTI_SELECT" ? (
        <div className="option-list">
          {question.options.map((option) => {
            const selected = selectedStrings(value).includes(option.code);
            return (
              <div className={`option-shell ${selected ? "selected" : ""}`} key={option.code}>
                <label className="option-card">
                  <input checked={selected} onChange={() => {
                    const current = selectedStrings(value);
                    if (selected) {
                      pruneInlineDetail(option.code);
                      return onChange(question.code, current.filter((code) => code !== option.code));
                    }
                    const removedByExclusivity = current.filter((code) => option.exclusiveWith.includes(code) || Boolean(question.options.find((candidate) => candidate.code === code)?.exclusiveWith.includes(option.code)));
                    removedByExclusivity.forEach(pruneInlineDetail);
                    const withoutExclusive = current.filter((code) => !removedByExclusivity.includes(code));
                    onChange(question.code, [...withoutExclusive, option.code]);
                  }} type="checkbox" />
                  <span>{option.label}</span>
                </label>
                {selected && <div className="inline-followup">{renderSpecialForOption(option.code)}{renderOptionChildren(option.code)}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="option-list">
          {question.options.map((option) => {
            const selected = value === option.code;
            return (
              <div className={`option-shell ${selected ? "selected" : ""}`} key={option.code}>
                <label className="option-card">
                  <input checked={selected} name={question.code} onChange={() => onChange(question.code, option.code)} type="radio" />
                  <span>{option.label}</span>
                </label>
                {selected && <div className="inline-followup">{renderOptionChildren(option.code)}</div>}
              </div>
            );
          })}
        </div>
      )}

      {renderQuestionChildren()}
      {question.issues.map((issue) => <small className="field-error" key={issue.code}>{locale === "ar" ? issue.messageAr : issue.messageEn}</small>)}
    </fieldset>
  );
}

function HairStateField({ question, locale, value, onChange, depth }: { question: P01EvaluatedQuestion; locale: P01Locale; value: JsonValue | undefined; onChange: (value: JsonValue) => void; depth: number }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const marker = locale === "ar" ? "الشعر غير البكر:" : "Non-virgin hair:";
  const [virginBody = "", processedBody = ""] = (question.help ?? "").split(marker);
  const virginTitle = locale === "ar" ? "الشعر البكر" : "Virgin hair";
  const processedTitle = locale === "ar" ? "الشعر غير البكر" : "Non-virgin hair";
  return <fieldset className={`question-field ${depth > 0 ? "question-field--nested" : ""} ${question.issues.length ? "question-field--invalid" : ""}`}>
    <legend className="question-legend-with-help"><span>{question.label}</span><button type="button" className="question-help-toggle" aria-label={locale === "ar" ? "شرح الشعر البكر وغير البكر" : "Explain virgin and non-virgin hair"} aria-expanded={helpOpen} aria-controls="hair-state-help" onClick={() => setHelpOpen((open) => !open)}>?</button></legend>
    {helpOpen && <div id="hair-state-help" className="hair-state-help">
      <section><strong>{virginTitle}</strong><p>{virginBody.replace(`${virginTitle}:`, "").trim()}</p></section>
      <section><strong>{processedTitle}</strong><p>{processedBody.trim()}</p></section>
    </div>}
    <div className="option-list">
      {question.options.map((option) => {
        const selected = value === option.code;
        return <div className={`option-shell ${selected ? "selected" : ""}`} key={option.code}><label className="option-card"><input checked={selected} name={question.code} onChange={() => onChange(option.code)} type="radio" /><span>{option.label}</span></label></div>;
      })}
    </div>
    {question.issues.map((issue) => <small className="field-error" key={issue.code}>{locale === "ar" ? issue.messageAr : issue.messageEn}</small>)}
  </fieldset>;
}

function RepeatableField({ question, locale, value, onChange, depth }: { question: P01EvaluatedQuestion; locale: P01Locale; value: JsonValue | undefined; onChange: (value: JsonValue) => void; depth: number }) {
  const items = Array.isArray(value) ? value.filter(isRecord) : [];
  const definition = question.repeatable!;
  function updateItem(index: number, field: string, fieldValue: JsonValue) {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: fieldValue } : item));
  }
  return (
    <fieldset className={`question-field question-field--repeatable ${depth > 0 ? "question-field--nested" : ""} ${question.issues.length ? "question-field--invalid" : ""}`}>
      <legend>{question.label}</legend>
      <div className="repeatable-list">
        {items.map((item, index) => (
          <div className="repeatable-item" key={String(item.id)}>
            <div className="repeatable-heading"><strong>{locale === "ar" ? definition.itemLabelAr : definition.itemLabelEn} {localeNumber(index + 1, locale)}</strong><button aria-label={locale === "ar" ? "حذف" : "Remove"} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} type="button">×</button></div>
            {definition.fields.map((field) => (
              <div className="repeatable-control" key={field.code}>
                <span>{locale === "ar" ? field.labelAr : field.labelEn}</span>
                {field.type === "SINGLE_SELECT" ? (
                  <select aria-label={locale === "ar" ? field.labelAr : field.labelEn} value={typeof item[field.code] === "string" ? String(item[field.code]) : ""} onChange={(event) => updateItem(index, field.code, event.target.value)}><option value="" />{field.options?.map((option) => <option key={option.code} value={option.code}>{locale === "ar" ? option.labelAr : option.labelEn}</option>)}</select>
                ) : field.type === "MONTH_YEAR" ? (
                  <div role="group" aria-label={locale === "ar" ? field.labelAr : field.labelEn}><ClinicalDatePicker locale={locale} value={item[field.code]} onChange={(next) => updateItem(index, field.code, next)} allowUnknown={!field.required} /></div>
                ) : (
                  <input aria-label={locale === "ar" ? field.labelAr : field.labelEn} type="text" inputMode={field.code === "count" ? "numeric" : undefined} value={typeof item[field.code] === "string" ? (field.code === "count" ? localizeDigits(String(item[field.code]), locale) : String(item[field.code])) : ""} onChange={(event) => updateItem(index, field.code, field.code === "count" ? toAsciiDigits(event.target.value).replace(/[^0-9]/g, "") : event.target.value)} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <button className="button button--ghost button--compact" onClick={() => onChange([...items, { id: crypto.randomUUID() }])} type="button">+ {locale === "ar" ? "إضافة" : "Add"}</button>
      {question.issues.map((issue) => <small className="field-error" key={issue.code}>{locale === "ar" ? issue.messageAr : issue.messageEn}</small>)}
    </fieldset>
  );
}

function ScalpSymptomInlineDetail({ symptom, question, locale, answers, onChange }: { symptom: string; question: P01EvaluatedQuestion; locale: P01Locale; answers: Record<string, JsonValue>; onChange: (code: string, value: JsonValue) => void }) {
  const details = isRecord(answers.Q_SCALP_SYMPTOM_DETAILS) ? answers.Q_SCALP_SYMPTOM_DETAILS : {};
  const detail = isRecord(details[symptom]) ? details[symptom] : {};
  const governed = ["ITCH", "BURNING", "SCALP_PAIN"].includes(symptom);
  function update(field: string, value: JsonValue) {
    onChange("Q_SCALP_SYMPTOM_DETAILS", { ...details, [symptom]: { ...detail, [field]: value } });
  }
  return (
    <div className="inline-detail-card">
      <p className="inline-detail-title">{locale === "ar" ? "تفاصيل هذا العرض" : "Symptom details"}</p>
      <label><span>{locale === "ar" ? "البداية التقريبية" : "Approximate onset"}</span><ClinicalDatePicker locale={locale} value={detail.onset} onChange={(next) => update("onset", next)} /></label>
      <label><span>{locale === "ar" ? "النمط" : "Pattern"}</span><select value={typeof detail.pattern === "string" ? detail.pattern : ""} onChange={(event) => update("pattern", event.target.value)}><option value="" /><option value="CONTINUOUS">{locale === "ar" ? "مستمر" : "Continuous"}</option><option value="INTERMITTENT">{locale === "ar" ? "يأتي ويذهب" : "Comes and goes"}</option><option value="UNSURE">{locale === "ar" ? "غير متأكد" : "Not sure"}</option></select></label>
      {governed && <ClinicalScale metric={symptom === "ITCH" ? "ITCH" : symptom === "BURNING" ? "BURNING" : "SCALP_PAIN"} locale={locale} value={detail.severity} onChange={(next) => update("severity", next)} />}
      {question.issues.length > 0 && (!detail.onset || !detail.pattern || (governed && (detail.severity === undefined || detail.severity === ""))) && <small className="field-error">{locale === "ar" ? "أكمل تفاصيل هذا العرض." : "Complete this symptom's details."}</small>}
    </div>
  );
}

function SelectionDateInline({ itemCode, childQuestion, locale, answers, onChange, idField }: { itemCode: string; childQuestion: P01EvaluatedQuestion; locale: P01Locale; answers: Record<string, JsonValue>; onChange: (code: string, value: JsonValue) => void; idField: "event" | "diagnosis" }) {
  const rawItems = answers[childQuestion.code];
  const items: Record<string, JsonValue>[] = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
  const existing = items.find((item) => item.id === itemCode) ?? { id: itemCode, [idField]: itemCode };
  function update(patch: Record<string, JsonValue>) {
    const nextItem = { ...existing, id: itemCode, [idField]: itemCode, ...patch };
    const rest = items.filter((item) => item.id !== itemCode);
    onChange(childQuestion.code, [...rest, nextItem]);
  }
  return (
    <div className="inline-detail-card inline-detail-card--compact">
      {idField === "event" && itemCode === "OTHER" && <label><span>{locale === "ar" ? "ما الحدث الآخر؟" : "What was the other event?"}</span><input type="text" value={typeof existing.details === "string" ? existing.details : ""} onChange={(event) => update({ details: event.target.value })} /></label>}
      <label><span>{locale === "ar" ? "متى حدث ذلك تقريبًا؟" : "Approximately when did this happen?"}</span><ClinicalDatePicker locale={locale} value={existing.date} onChange={(next) => update({ date: next })} /></label>
      {childQuestion.issues.length > 0 && (!existing.date || (idField === "event" && itemCode === "OTHER" && (typeof existing.details !== "string" || existing.details.trim().length === 0))) && <small className="field-error">{idField === "event" && itemCode === "OTHER" ? (locale === "ar" ? "أكمل وصف الحدث وتاريخه التقريبي." : "Complete the event description and approximate date.") : (locale === "ar" ? "أدخل تاريخًا تقريبيًا أو اختر لا أتذكر." : "Enter an approximate date or choose I don't remember.")}</small>}
    </div>
  );
}

function ProcedureInlineDetail({ procedure, childQuestion, locale, answers, onChange }: { procedure: string; childQuestion: P01EvaluatedQuestion; locale: P01Locale; answers: Record<string, JsonValue>; onChange: (code: string, value: JsonValue) => void }) {
  const rawItems = answers[childQuestion.code];
  const items: Record<string, JsonValue>[] = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
  const existing = items.find((item) => item.id === procedure) ?? { id: procedure, procedure };
  function update(field: string, value: JsonValue) {
    const nextItem = { ...existing, id: procedure, procedure, [field]: value };
    onChange(childQuestion.code, [...items.filter((item) => item.id !== procedure), nextItem]);
  }
  const transplant = procedure === "HAIR_TRANSPLANT";
  return (
    <div className="inline-detail-card">
      <p className="inline-detail-title">{locale === "ar" ? "تفاصيل الإجراء" : "Procedure details"}</p>
      <label><span>{transplant ? (locale === "ar" ? "عدد عمليات زراعة الشعر" : "Number of hair-transplant procedures") : (locale === "ar" ? "عدد الجلسات التقريبي" : "Approximate number of sessions")}</span><input inputMode="numeric" type="text" value={typeof existing.count === "string" ? localizeDigits(existing.count, locale) : ""} onChange={(event) => update("count", toAsciiDigits(event.target.value))} /></label>
      <label><span>{transplant ? (locale === "ar" ? "تاريخ آخر عملية زراعة" : "Most recent transplant procedure") : (locale === "ar" ? "تاريخ آخر جلسة" : "Most recent session")}</span><ClinicalDatePicker locale={locale} value={existing.lastDate} onChange={(next) => update("lastDate", next)} /></label>
      {childQuestion.issues.length > 0 && (!existing.count || !existing.lastDate) && <small className="field-error">{locale === "ar" ? "أكمل عدد الجلسات/العمليات وتاريخ آخر إجراء." : "Complete the count and most recent procedure date."}</small>}
    </div>
  );
}


function localizedContractOption(questionCode: string, optionCode: string, locale: P01Locale): string {
  const option = getP01Contract(questionCode)?.options?.find((candidate) => candidate.code === optionCode);
  return option ? (locale === "ar" ? option.labelAr : option.labelEn) : optionCode;
}

function upsertInlineItem(items: Record<string, JsonValue>[], id: string, base: Record<string, JsonValue>, patch: Record<string, JsonValue>): Record<string, JsonValue>[] {
  const next = { ...base, ...patch, id };
  return [...items.filter((item) => item.id !== id), next];
}

function HairQualityTreatmentInline({ treatment, childQuestion, locale, answers, onChange }: { treatment: string; childQuestion: P01EvaluatedQuestion; locale: P01Locale; answers: Record<string, JsonValue>; onChange: (code: string, value: JsonValue) => void }) {
  const rawItems = answers[childQuestion.code];
  const items: Record<string, JsonValue>[] = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
  const existing = items.find((item) => item.id === treatment) ?? { id: treatment, treatment };
  const update = (field: string, value: JsonValue) => onChange(childQuestion.code, upsertInlineItem(items, treatment, { ...existing, treatment }, { [field]: value }));
  return <div className="inline-detail-card">
    <p className="inline-detail-title">{localizedContractOption("Q_HQ_PREVIOUS_TREATMENTS", treatment, locale)}</p>
    <label><span>{locale === "ar" ? "نوع المعالجة" : "Treatment type"}</span><input value={typeof existing.typeText === "string" ? existing.typeText : ""} onChange={(e) => update("typeText", e.target.value)} /></label>
    <label><span>{locale === "ar" ? "الشهر/السنة أو السنة التقريبية" : "Approximate month/year or year"}</span><ClinicalDatePicker locale={locale} value={existing.when} onChange={(next) => update("when", next)} /></label>
    <label><span>{locale === "ar" ? "هل ما زال أثرها أو استخدامها قائمًا؟" : "Is its effect or use still present?"}</span><select value={typeof existing.stillPresent === "string" ? existing.stillPresent : ""} onChange={(e) => update("stillPresent", e.target.value)}><option value=""/><option value="YES">{locale === "ar" ? "نعم" : "Yes"}</option><option value="NO">{locale === "ar" ? "لا" : "No"}</option><option value="UNSURE">{locale === "ar" ? "غير متأكد" : "Not sure"}</option></select></label>
  </div>;
}

function HairQualityDrugInline({ exposure, childQuestion, locale, answers, onChange }: { exposure: string; childQuestion: P01EvaluatedQuestion; locale: P01Locale; answers: Record<string, JsonValue>; onChange: (code: string, value: JsonValue) => void }) {
  const rawItems = answers[childQuestion.code];
  const items: Record<string, JsonValue>[] = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
  const existing = items.find((item) => item.id === exposure) ?? { id: exposure, exposure };
  const update = (field: string, value: JsonValue) => onChange(childQuestion.code, upsertInlineItem(items, exposure, { ...existing, exposure }, { [field]: value }));
  return <div className="inline-detail-card">
    <p className="inline-detail-title">{localizedContractOption("Q_HQ_DRUG_EXPOSURES", exposure, locale)}</p>
    <label><span>{locale === "ar" ? "الاستخدام" : "Use"}</span><select value={typeof existing.status === "string" ? existing.status : ""} onChange={(e) => update("status", e.target.value)}><option value=""/><option value="CURRENT">{locale === "ar" ? "أستخدمه حاليًا" : "Currently using"}</option><option value="PREVIOUS">{locale === "ar" ? "استخدمته سابقًا" : "Used previously"}</option></select></label>
    <label><span>{locale === "ar" ? "تاريخ البداية التقريبي" : "Approximate start date"}</span><ClinicalDatePicker locale={locale} value={existing.start} onChange={(next) => update("start", next)} /></label>
    {existing.status === "PREVIOUS" && <label><span>{locale === "ar" ? "تاريخ التوقف التقريبي" : "Approximate stop date"}</span><ClinicalDatePicker locale={locale} value={existing.stop} onChange={(next) => update("stop", next)} /></label>}
    <label><span>{locale === "ar" ? "هل لاحظت تغيرًا في طبيعة الشعر أو ملمسه؟" : "Did you notice a change in your hair's nature or texture?"}</span><select value={typeof existing.hairChange === "string" ? existing.hairChange : ""} onChange={(e) => update("hairChange", e.target.value)}><option value=""/><option value="YES">{locale === "ar" ? "نعم" : "Yes"}</option><option value="NO">{locale === "ar" ? "لا" : "No"}</option><option value="UNSURE">{locale === "ar" ? "غير متأكد" : "Not sure"}</option></select></label>
    {existing.hairChange === "YES" && <label><span>{locale === "ar" ? "صف التغير باختصار" : "Briefly describe the change"}</span><input value={typeof existing.changeDescription === "string" ? existing.changeDescription : ""} onChange={(e) => update("changeDescription", e.target.value)} /></label>}
  </div>;
}

function SelectionFrequencyInline({ itemCode, itemField, childQuestion, locale, answers, onChange, mode }: { itemCode: string; itemField: "tool" | "routineItem"; childQuestion: P01EvaluatedQuestion; locale: P01Locale; answers: Record<string, JsonValue>; onChange: (code: string, value: JsonValue) => void; mode: "heat" | "routine" }) {
  const rawItems = answers[childQuestion.code];
  const items: Record<string, JsonValue>[] = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
  const existing = items.find((item) => item.id === itemCode) ?? { id: itemCode, [itemField]: itemCode };
  const update = (frequency: string) => onChange(childQuestion.code, upsertInlineItem(items, itemCode, { ...existing, [itemField]: itemCode }, { frequency }));
  const heat = [["LT_WEEKLY","أقل من مرة أسبوعيًا","Less than once weekly"],["WEEKLY_1_2","١–٢ مرة أسبوعيًا","1–2 times weekly"],["WEEKLY_3_4","٣–٤ مرات أسبوعيًا","3–4 times weekly"],["WEEKLY_5_PLUS","٥ مرات أو أكثر أسبوعيًا","5 or more times weekly"]];
  const routine = [["EVERY_WASH","مع كل غسلة","With every wash"],["WEEKLY","أسبوعيًا","Weekly"],["MONTHLY","شهريًا","Monthly"],["OTHER","أخرى","Other"]];
  const options = mode === "heat" ? heat : routine;
  return <div className="inline-detail-card inline-detail-card--compact"><label><span>{locale === "ar" ? "كم مرة تستخدمه؟" : "How often do you use it?"}</span><select value={typeof existing.frequency === "string" ? existing.frequency : ""} onChange={(e) => update(e.target.value)}><option value=""/>{options.map(([code, ar, en]) => <option key={code} value={code}>{locale === "ar" ? ar : en}</option>)}</select></label></div>;
}

function HairPatternField({ question, locale, value, onChange, depth }: { question: P01EvaluatedQuestion; locale: P01Locale; value: JsonValue | undefined; onChange: (value: JsonValue) => void; depth: number }) {
  const images: Record<string, string> = {
    STRAIGHT: "/hair-patterns/straight.jpg",
    WAVY: "/hair-patterns/wavy.jpg",
    CURLY: "/hair-patterns/curly.jpg",
    COILY: "/hair-patterns/coily.jpg",
  };
  return <fieldset className={`question-field ${depth > 0 ? "question-field--nested" : ""} ${question.issues.length ? "question-field--invalid" : ""}`}>
    <legend>{question.label}{question.help && <small className="question-help">{question.help}</small>}</legend>
    <div className="hair-pattern-grid">
      {question.options.map((option) => (
        <label className={`hair-pattern-card hair-pattern-card--${option.code.toLowerCase()} ${images[option.code] ? "hair-pattern-card--visual" : "hair-pattern-card--text"} ${value === option.code ? "selected" : ""}`} key={option.code}>
          <input type="radio" name={question.code} checked={value === option.code} onChange={() => onChange(option.code)} />
          {images[option.code] && (
            <span className="hair-pattern-image-wrap">
              <Image src={images[option.code]} alt={option.label} fill sizes="(max-width: 640px) 44vw, 260px" className="hair-pattern-image" />
            </span>
          )}
          <strong>{option.label}</strong>
        </label>
      ))}
    </div>
    {question.issues.map((issue) => <small className="field-error" key={issue.code}>{locale === "ar" ? issue.messageAr : issue.messageEn}</small>)}
  </fieldset>;
}

function PostWashOrderField({ question, locale, answers, onChange, depth }: { question: P01EvaluatedQuestion; locale: P01Locale; answers: Record<string, JsonValue>; onChange: (code: string, value: JsonValue) => void; depth: number }) {
  const selected = selectedStrings(answers.Q_HQ_ROUTINE_ITEMS);
  const steps: Array<[string,string,string]> = [];
  if (selected.includes("CONDITIONER") || selected.includes("MASK")) steps.push(["CONDITIONING","التكييف (بلسم أو ماسك)","Conditioning (conditioner or mask)"]);
  if (selected.includes("LEAVE_IN")) steps.push(["LEAVE_IN","ليف إن","Leave-in"]);
  if (selected.includes("OIL")) steps.push(["OIL","زيت","Oil"]);
  const rawItems = answers[question.code];
  const items: Record<string, JsonValue>[] = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
  const update = (step: string, rank: string) => {
    const existing = items.find((item) => item.id === step) ?? { id: step, step };
    onChange(question.code, upsertInlineItem(items, step, { ...existing, step }, { rank }));
  };
  return <fieldset className={`question-field question-field--nested ${depth > 0 ? "question-field--nested" : ""} ${question.issues.length ? "question-field--invalid" : ""}`}><legend>{question.label}</legend><p className="question-help">{locale === "ar" ? "رتّب العناصر التي تستخدمها فقط." : "Rank only the items you actually use."}</p><div className="post-wash-order">{steps.map(([code, ar, en]) => { const item = items.find((row) => row.id === code); return <label key={code}><span>{locale === "ar" ? ar : en}</span><select value={typeof item?.rank === "string" ? item.rank : ""} onChange={(e) => update(code, e.target.value)}><option value=""/>{steps.map((_, index) => <option key={index+1} value={String(index+1)}>{localeNumber(index+1, locale)}</option>)}</select></label>; })}</div>{question.issues.map((issue) => <small className="field-error" key={issue.code}>{locale === "ar" ? issue.messageAr : issue.messageEn}</small>)}</fieldset>;
}

const LASER_AREAS = [["FACE","الوجه","Face"],["NECK","الرقبة","Neck"],["SCALP","فروة الرأس","Scalp"],["HANDS","اليدان","Hands"],["BODY","الجسم","Body"],["DOUBLE_CHIN","اللغلوغ","Double chin"],["UNDER_EYE","تحت العين","Under-eye area"],["OTHER","منطقة أخرى","Other area"]] as const;

function LaserConcernInline({ concern, childQuestion, locale, answers, onChange }: { concern: string; childQuestion: P01EvaluatedQuestion; locale: P01Locale; answers: Record<string, JsonValue>; onChange: (code: string, value: JsonValue) => void }) {
  const rawItems = answers[childQuestion.code];
  const items: Record<string, JsonValue>[] = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
  const existing = items.find((item) => item.id === concern) ?? { id: concern, concern };
  const update = (field: string, value: JsonValue) => onChange(childQuestion.code, upsertInlineItem(items, concern, { ...existing, concern }, { [field]: value }));
  const primary = answers.Q_VISIT_PRIMARY_REASON === "RV_LASER";
  return <div className="inline-detail-card"><p className="inline-detail-title">{localizedContractOption("Q_LASER_CONCERNS", concern, locale)}</p>
    {concern === "LASER_OTHER" && <label><span>{locale === "ar" ? "اكتب المشكلة أو الطلب الآخر" : "Write the other concern or request"}</span><input value={typeof existing.otherText === "string" ? existing.otherText : ""} onChange={(e) => update("otherText", e.target.value)} /></label>}
    {primary && <><label><span>{locale === "ar" ? "ما المنطقة المرتبطة بهذه المشكلة؟" : "Which area is related to this concern?"}</span><select value={typeof existing.area === "string" ? existing.area : ""} onChange={(e) => update("area", e.target.value)}><option value=""/>{LASER_AREAS.map(([code,ar,en]) => <option key={code} value={code}>{locale === "ar" ? ar : en}</option>)}</select></label>{existing.area === "OTHER" && <label><span>{locale === "ar" ? "اذكر المنطقة الأخرى" : "Specify the other area"}</span><input value={typeof existing.areaOther === "string" ? existing.areaOther : ""} onChange={(e) => update("areaOther", e.target.value)} /></label>}</>}
    <label><span>{locale === "ar" ? "هل سبق أن تلقيت علاج ليزر أو ضوء لنفس المشكلة؟" : "Have you previously had laser or light-based treatment for this same concern?"}</span><select value={typeof existing.prior === "string" ? existing.prior : ""} onChange={(e) => update("prior", e.target.value)}><option value=""/><option value="YES">{locale === "ar" ? "نعم" : "Yes"}</option><option value="NO">{locale === "ar" ? "لا" : "No"}</option></select></label>
    {existing.prior === "YES" && <><label><span>{locale === "ar" ? "كم عدد الجلسات السابقة تقريبًا؟" : "Approximately how many prior sessions?"}</span><input inputMode="numeric" value={typeof existing.count === "string" ? localizeDigits(existing.count, locale) : ""} onChange={(e) => update("count", toAsciiDigits(e.target.value).replace(/[^0-9]/g,""))} /></label><label><span>{locale === "ar" ? "متى كانت آخر جلسة تقريبًا؟" : "Approximately when was the last session?"}</span><ClinicalDatePicker locale={locale} value={existing.lastDate} onChange={(next) => update("lastDate", next)} /></label><label><span>{locale === "ar" ? "هل حدثت مضاعفات؟" : "Were there any complications?"}</span><select value={typeof existing.complications === "string" ? existing.complications : ""} onChange={(e) => update("complications", e.target.value)}><option value=""/><option value="YES">{locale === "ar" ? "نعم" : "Yes"}</option><option value="NO">{locale === "ar" ? "لا" : "No"}</option><option value="DONT_REMEMBER">{locale === "ar" ? "لا أتذكر" : "I do not remember"}</option></select></label>{existing.complications === "YES" && <label><span>{locale === "ar" ? "اذكر ما تتذكره من المضاعفات" : "Describe what you remember about the complications"}</span><input value={typeof existing.complicationText === "string" ? existing.complicationText : ""} onChange={(e) => update("complicationText", e.target.value)} /></label>}</>}
  </div>;
}

const AESTHETIC_AREA_OPTIONS: Record<string, ReadonlyArray<readonly [string,string,string]>> = {
  AP_BOTOX: [["FACE_NECK","الوجه والرقبة","Face and neck"],["SCALP_SWEATING","تعرّق فروة الرأس","Scalp sweating"],["SCARS","الندبات","Scars"],["ROSACEA","الوردية","Rosacea"],["RADIANCE","النضارة","Radiance"],["PORES","المسام","Pores"]],
  AP_FILLER: [["FACE","الوجه","Face"],["BODY","الجسم","Body"],["HANDS","اليدان","Hands"],["SPECIAL_AREAS","مناطق خاصة","Special areas"]],
  AP_COLLAGEN_STIMULATORS: [["FACE","الوجه","Face"],["NECK","الرقبة","Neck"],["HANDS","اليدان","Hands"],["BODY","الجسم","Body"]],
  AP_FAT_DISSOLVING: [["DOUBLE_CHIN","اللغلوغ","Double chin"],["UNDER_EYES","تحت العينين","Under-eye area"],["BODY","الجسم","Body"]],
};

function AestheticProcedureInline({ procedure, childQuestion, locale, answers, onChange }: { procedure: string; childQuestion: P01EvaluatedQuestion; locale: P01Locale; answers: Record<string, JsonValue>; onChange: (code: string, value: JsonValue) => void }) {
  const rawItems = answers[childQuestion.code];
  const items: Record<string, JsonValue>[] = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
  const existing = items.find((item) => item.id === procedure) ?? { id: procedure, procedure };
  const update = (field: string, value: JsonValue) => onChange(childQuestion.code, upsertInlineItem(items, procedure, { ...existing, procedure }, { [field]: value }));
  const primary = answers.Q_VISIT_PRIMARY_REASON === "RV_AESTHETIC_PROCEDURES";
  const areas = AESTHETIC_AREA_OPTIONS[procedure];
  return <div className="inline-detail-card"><p className="inline-detail-title">{localizedContractOption("Q_AESTHETIC_PROCEDURES", procedure, locale)}</p>
    {procedure === "AP_OTHER" && <label><span>{locale === "ar" ? "اكتب الطلب أو الإجراء الآخر الذي ترغب بمراجعته" : "Write the other request or procedure you would like reviewed"}</span><input value={typeof existing.otherText === "string" ? existing.otherText : ""} onChange={(e) => update("otherText", e.target.value)} /></label>}
    {primary && areas && <label><span>{locale === "ar" ? "المنطقة" : "Area"}</span><select value={typeof existing.area === "string" ? existing.area : ""} onChange={(e) => update("area", e.target.value)}><option value=""/>{areas.map(([code,ar,en]) => <option key={code} value={code}>{locale === "ar" ? ar : en}</option>)}</select></label>}
    {primary && ["AP_SKIN_BOOSTER","AP_SWEATING_INJECTION","AP_BODY_CONTOURING"].includes(procedure) && <label><span>{locale === "ar" ? "المنطقة" : "Area"}</span><input value={typeof existing.areaText === "string" ? existing.areaText : ""} onChange={(e) => update("areaText", e.target.value)} /></label>}
    {primary && procedure === "AP_SKIN_BOOSTER" && <p className="inline-note">{locale === "ar" ? "الهدف: إبرة نضارة" : "Goal: radiance / skin-booster treatment"}</p>}
    {primary && procedure === "AP_BODY_CONTOURING" && <label><span>{locale === "ar" ? "الهدف" : "Goal"}</span><select value={typeof existing.goal === "string" ? existing.goal : ""} onChange={(e) => update("goal", e.target.value)}><option value=""/><option value="ENLARGE">{locale === "ar" ? "تضخيم مناطق الجسم" : "Enlarge body areas"}</option><option value="SLIM">{locale === "ar" ? "تنحيف مناطق الجسم" : "Slim body areas"}</option></select></label>}
    <label><span>{locale === "ar" ? "هل سبق أن أجريت هذا الإجراء؟" : "Have you had this procedure before?"}</span><select value={typeof existing.prior === "string" ? existing.prior : ""} onChange={(e) => update("prior", e.target.value)}><option value=""/><option value="YES">{locale === "ar" ? "نعم" : "Yes"}</option><option value="NO">{locale === "ar" ? "لا" : "No"}</option></select></label>
    {existing.prior === "YES" && <><label><span>{locale === "ar" ? "كم عدد الجلسات أو الإجراءات السابقة تقريبًا؟" : "Approximately how many prior sessions or procedures?"}</span><input inputMode="numeric" value={typeof existing.count === "string" ? localizeDigits(existing.count, locale) : ""} onChange={(e) => update("count", toAsciiDigits(e.target.value).replace(/[^0-9]/g,""))} /></label><label><span>{locale === "ar" ? "متى كان آخر إجراء أو جلسة تقريبًا؟" : "Approximately when was the most recent procedure or session?"}</span><ClinicalDatePicker locale={locale} value={existing.lastDate} onChange={(next) => update("lastDate", next)} /></label><label><span>{locale === "ar" ? "هل حدثت مضاعفات؟" : "Were there any complications?"}</span><select value={typeof existing.complications === "string" ? existing.complications : ""} onChange={(e) => update("complications", e.target.value)}><option value=""/><option value="YES">{locale === "ar" ? "نعم" : "Yes"}</option><option value="NO">{locale === "ar" ? "لا" : "No"}</option><option value="DONT_REMEMBER">{locale === "ar" ? "لا أتذكر" : "I do not remember"}</option></select></label>{existing.complications === "YES" && <label><span>{locale === "ar" ? "اذكر ما تتذكره من المضاعفات" : "Describe what you remember about the complications"}</span><input value={typeof existing.complicationText === "string" ? existing.complicationText : ""} onChange={(e) => update("complicationText", e.target.value)} /></label>}</>}
    {primary && <label><span>{locale === "ar" ? "ما النتيجة أو التغيير الذي ترغب به؟" : "What result or change would you like?"}</span><textarea rows={3} value={typeof existing.desiredResult === "string" ? existing.desiredResult : ""} onChange={(e) => update("desiredResult", e.target.value)} /></label>}
  </div>;
}

const SCALE_LABELS = {
  ar: ["لا يوجد", "خفيف جدًا", "خفيف", "متوسط", "شديد", "شديد جدًا"],
  en: ["None", "Very mild", "Mild", "Moderate", "Severe", "Very severe"],
};

const METRIC_COPY: Record<string, { ar: { name: string; help: string }; en: { name: string; help: string } }> = {
  SHEDDING: { ar: { name: "تساقط الشعر", help: "اختر الدرجة التي تصف شدة تساقط الشعر الذي تلاحظه حاليًا." }, en: { name: "Hair shedding", help: "Choose the level that best describes the hair shedding you currently notice." } },
  DENSITY: { ar: { name: "نقص الكثافة", help: "اختر الدرجة التي تصف مدى ملاحظتك لانخفاض كثافة الشعر أو زيادة ظهور فروة الرأس." }, en: { name: "Density loss", help: "Choose the level that best describes reduced hair density or increased scalp visibility." } },
  ITCH: { ar: { name: "الحكة", help: "اختر الدرجة التي تصف شدة الحكة الحالية في فروة الرأس." }, en: { name: "Itch", help: "Choose the level that best describes your current scalp itch." } },
  BURNING: { ar: { name: "الحرقان", help: "اختر الدرجة التي تصف شدة الإحساس بالحرقان في فروة الرأس." }, en: { name: "Burning", help: "Choose the level that best describes the current burning sensation on your scalp." } },
  SCALP_PAIN: { ar: { name: "ألم فروة الرأس", help: "اختر الدرجة التي تصف شدة الألم أو الحساسية المؤلمة في فروة الرأس." }, en: { name: "Scalp pain", help: "Choose the level that best describes current scalp pain or painful tenderness." } },
};

function FiveMetricsGuide({ locale, compact = false }: { locale: P01Locale; compact?: boolean }) {
  return (
    <details className="metrics-guide" open={!compact}>
      <summary><span className="info-icon">i</span>{locale === "ar" ? "كيف تستخدم مقاييس ٠–٥؟" : "How to use the 0–5 measures"}</summary>
      <p>{locale === "ar" ? "هذه المقاييس تصف ما تلاحظه حاليًا. اختر ٠ عندما لا توجد المشكلة فعلًا، ولا نعامل المعلومة غير المعروفة على أنها صفر." : "These measures describe what you currently notice. Choose 0 only when the problem is actually absent; an unknown value is not treated as zero."}</p>
      <div className="metric-name-grid">{Object.values(METRIC_COPY).map((metric) => <span key={metric.en.name}>{metric[locale].name}</span>)}</div>
      <div className="scale-legend-inline"><span>{localeNumber(0, locale)} · {SCALE_LABELS[locale][0]}</span><span>{localeNumber(3, locale)} · {SCALE_LABELS[locale][3]}</span><span>{localeNumber(5, locale)} · {SCALE_LABELS[locale][5]}</span></div>
    </details>
  );
}

function ScaleQuestion({ questionCode, locale, value, onChange }: { questionCode: string; locale: P01Locale; value: JsonValue | undefined; onChange: (value: JsonValue) => void }) {
  if (questionCode === "Q_HAIR_SHEDDING_SEVERITY") return <ClinicalScale metric="SHEDDING" locale={locale} value={value} onChange={onChange} />;
  if (questionCode === "Q_HAIR_DENSITY_SEVERITY") return <ClinicalScale metric="DENSITY" locale={locale} value={value} onChange={onChange} />;
  const impactCopy = questionCode === "Q_CONFIDENCE_IMPACT"
    ? { ar: ["لا تأثير", "تأثير شديد جدًا"], en: ["No impact", "Very high impact"] }
    : { ar: ["لا تزعجني", "تزعجني جدًا"], en: ["Not at all", "Extremely"] };
  return <NumericScale locale={locale} value={value} onChange={onChange} left={impactCopy[locale][0]} right={impactCopy[locale][1]} />;
}

function ClinicalScale({ metric, locale, value, onChange }: { metric: keyof typeof METRIC_COPY; locale: P01Locale; value: JsonValue | undefined; onChange: (value: JsonValue) => void }) {
  const copy = METRIC_COPY[metric][locale];
  return (
    <div className="clinical-scale">
      <div className="metric-explanation"><strong>{copy.name}</strong><span>{copy.help}</span></div>
      <div className="scale-choice-grid" dir={locale === "ar" ? "rtl" : "ltr"}>
        {SCALE_LABELS[locale].map((label, index) => <button type="button" dir={locale === "ar" ? "rtl" : "ltr"} aria-pressed={String(value) === String(index)} key={label} className={String(value) === String(index) ? "selected" : ""} onClick={() => onChange(String(index))}><b>{localeNumber(index, locale)}</b><small>{label}</small></button>)}
      </div>
    </div>
  );
}

function NumericScale({ locale, value, onChange, left, right }: { locale: P01Locale; value: JsonValue | undefined; onChange: (value: JsonValue) => void; left: string; right: string }) {
  return (
    <div className="numeric-scale">
      <div className="scale-row" dir={locale === "ar" ? "rtl" : "ltr"}>{[0,1,2,3,4,5].map((score) => <button className={String(value) === String(score) ? "selected" : ""} key={score} onClick={() => onChange(String(score))} type="button">{localeNumber(score, locale)}</button>)}</div>
      <div className="scale-endpoints" dir={locale === "ar" ? "rtl" : "ltr"}><span>{localeNumber(0, locale)} · {left}</span><span>{localeNumber(5, locale)} · {right}</span></div>
    </div>
  );
}

function ReviewStep({ locale, evaluation, followUp, onJump, onFollowUpJump, activeSections, finalConfirmed, setFinalConfirmed, submitting, onSubmit }: { locale: P01Locale; evaluation: P01Evaluation; followUp: P01FollowUpContext | null; onJump: (section: P01SectionCode) => void; onFollowUpJump: (step: JourneyStep) => void; activeSections: P01SectionCode[]; finalConfirmed: boolean; setFinalConfirmed: (value: boolean) => void; submitting: boolean; onSubmit: () => void }) {
  const reviewSections = activeSections.filter((section) => section !== "PRIVACY");
  const existingFollowUp = followUp?.intent === "EXISTING_CONCERN";
  const hasCurrentMetrics = existingFollowUp && ["RV_HAIR_LOSS", "RV_SCALP_SYMPTOMS"].includes(followUp.selectedPrimaryReasonCode ?? "");
  const reviewPriority = [
    "Q_PROFILE_FULL_NAME",
    "Q_PROFILE_DOB",
    "Q_PROFILE_SEX",
    "Q_PROFILE_MARITAL_STATUS",
    "Q_VISIT_PRIMARY_REASON",
    "Q_VISIT_ADDITIONAL_REQUESTS",
    "Q_HAIR_CONCERN",
    "Q_HEALTH_SNAPSHOT",
  ];
  const quickSummary = [...evaluation.questions]
    .filter(({ sectionCode }) => sectionCode !== "PRIVACY")
    .sort((a, b) => {
      const aPriority = reviewPriority.indexOf(a.code);
      const bPriority = reviewPriority.indexOf(b.code);
      return (aPriority < 0 ? Number.MAX_SAFE_INTEGER : aPriority) - (bPriority < 0 ? Number.MAX_SAFE_INTEGER : bPriority);
    })
    .flatMap((question) => {
      const value = presentPatientReviewAnswer(question, locale);
      return value ? [{ question, value }] : [];
    })
    .slice(0, 8);
  return (
    <div className="review-step">
      {followUp && (
        <>
          <FollowUpReviewSummary locale={locale} context={followUp} />
          <div className="follow-up-review-actions">
            <button className="button button--secondary" type="button" onClick={() => onFollowUpJump("FOLLOW_UP_CHANGES")}>{locale === "ar" ? "تعديل التغييرات" : "Edit changes"}</button>
            {hasCurrentMetrics && <button className="button button--secondary" type="button" onClick={() => onFollowUpJump("FOLLOW_UP_CURRENT")}>{locale === "ar" ? "تعديل حالة اليوم" : "Edit today's state"}</button>}
          </div>
        </>
      )}
      <div className="review-section-grid">
        {reviewSections.map((section) => {
          const questions = evaluation.questions.filter((question) => question.sectionCode === section);
          const missing = questions.filter((question) => question.issues.length > 0).length;
          const answered = questions.length - missing;
          return (
            <button className={missing ? "review-section-card review-section-card--missing" : "review-section-card"} key={section} onClick={() => onJump(section)} type="button">
              <span className="review-section-icon">{missing ? "!" : "✓"}</span>
              <span><strong>{SECTION_TITLES[section][locale]}</strong><small>{missing ? (locale === "ar" ? `${localeNumber(missing, locale)} عناصر تحتاج مراجعة` : `${missing} item(s) need review`) : (locale === "ar" ? `${localeNumber(answered, locale)} إجابات محفوظة` : `${answered} saved answer(s)`)}</small></span>
              <span className="review-edit">{locale === "ar" ? "تعديل" : "Edit"}</span>
            </button>
          );
        })}
      </div>
      {quickSummary.length > 0 && (
        <div className="review-preview">
          <h2>{locale === "ar" ? "ملخص سريع" : "Quick summary"}</h2>
          {quickSummary.map(({ question, value }) => <div className="review-preview-row" key={`${question.code}:${question.scopeKey}`}><span>{question.label}</span><strong>{value}</strong></div>)}
        </div>
      )}
      <label className="consent-row final-confirm"><input checked={finalConfirmed} onChange={(event) => setFinalConfirmed(event.target.checked)} type="checkbox" /><span>{locale === "ar" ? P01_FINAL_CONFIRMATION_AR : P01_FINAL_CONFIRMATION_EN}</span></label>
      <button className="button button--primary button--wide" disabled={!finalConfirmed || submitting || evaluation.state !== "READY"} onClick={onSubmit} type="button">{submitting ? (locale === "ar" ? "جارٍ الإرسال…" : "Submitting…") : (locale === "ar" ? "الإرسال النهائي" : "Final Submit")}</button>
    </div>
  );
}
function SaveIndicator({ state, locale, onRetry }: { state: SaveState; locale: P01Locale; onRetry: () => void }) {
  const labels: Record<SaveState, { ar: string; en: string }> = {
    idle: { ar: "سيُحفظ تلقائيًا", en: "Autosave ready" },
    saving: { ar: "جارٍ الحفظ…", en: "Saving…" },
    saved: { ar: "تم الحفظ ✓", en: "Saved ✓" },
    failed: { ar: "فشل الحفظ — إعادة المحاولة", en: "Save failed — retry" },
    offline: { ar: "غير متصل — لم تُحفظ التغييرات", en: "Offline — changes not saved" },
  };
  return <button className={`save-indicator save-indicator--${state}`} disabled={state !== "failed" && state !== "offline"} onClick={onRetry} type="button">{labels[state][locale]}</button>;
}
