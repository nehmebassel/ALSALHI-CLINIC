"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { usePlatformLocale } from "@/app/components/platform/platform-locale";
import { clinicDateInputValue, formatClinicDate, formatClinicDateTime } from "@/lib/platform/date-time";
import { localeNumber } from "@/lib/p01/locale";
import {
  MCU_FV_BASIC_VALUES,
  MCU_FV_FRONTAL_VALUES,
  MCU_FV_VERTEX_VALUES,
  PHYSICIAN_ANATOMICAL_MAP_VIEWS,
  PHYSICIAN_ANATOMICAL_REGION_CODES_BY_VIEW,
  PHYSICIAN_MEASUREMENT_CODES,
  PHYSICIAN_TRICHOSCOPY_FINDINGS,
  parseGovernedDraftSection,
  type PhysicianAnatomicalRegionCode,
} from "@/lib/physician/visit-clinical-contracts";
import { PHYSICIAN_PROCEDURE_CODES } from "@/lib/physician/visit-longitudinal-contracts";
import { VisitDraftAutosave, VisitDraftAcknowledgement, type DraftSaveState } from "@/lib/physician/visit-draft-autosave";
import {
  buildPreFinalizeReview,
  canAddDiagnosisDecision,
  canAddTreatmentDecision,
  deriveMcuFvWorkspaceCode,
  freshWorkspaceSections,
  hasIncompleteAnatomicalRegion,
  longitudinalActionLabel,
  presentHairLineDistance,
  presentLongitudinalDecision,
  presentDecisionDetails,
  presentPatientContextValue,
  presentAnatomicalRegionLabel,
  PHYSICIAN_ANATOMICAL_REGION_LABELS,
  presentProcedurePlanTarget,
  presentTreatmentTarget,
  readOnlyAnatomicalMapViews,
  suggestAnatomicalRegionCode,
  visitDraftHasPatientPromotion,
  workspaceErrorMessage,
  type WorkspaceDraftSections,
} from "@/lib/physician/visit-workspace";
import {
  physicianVisitWorkflowStatus,
  physicianWorkspaceSectionProfile,
  type PhysicianClinicalWorkspaceKind,
  type PhysicianVisitWorkflowStatus,
} from "@/lib/physician/workspace-flow";

import { TRICHOSCOPY_AR } from "@/lib/physician/trichoscopy-presentation";
import styles from "./physician-visit-workspace.module.css";

type ActorRole = "STAFF" | "PHYSICIAN";
type WorkspacePanel = "CONTEXT" | "TODAY" | "LONGITUDINAL" | "FINALIZE";

type DraftRecord = {
  status: "DRAFT" | "FINALIZED";
  draftVersion: number;
  draftJson: unknown;
  finalizedAt?: string | null;
};

type VisitEnvelope = {
  visit: {
    id: string;
    patientId: string;
    clinicalEpisodeId: string;
    visitType: "INITIAL" | "FOLLOW_UP";
    status: "CREATED" | "COMPLETED" | "CANCELLED";
    visitOccurredAt: string | null;
  };
  physicianVisitRecord: DraftRecord | null;
};

type EffectiveState = {
  diagnoses: Array<{ diagnosisId: string; text: string; status: "ACTIVE" | "RESOLVED" }>;
  treatmentCourses: Array<{ treatmentCourseId: string; name: string; regimenText?: string; noteText?: string; status: "ACTIVE" | "STOPPED" }>;
  procedurePlans: Array<{ procedurePlanId: string; procedureCode: string; otherProcedureText?: string; plannedDate?: string; noteText?: string; status: "OPEN" | "FULFILLED" | "CANCELLED_OR_DEFERRED" }>;
  performedProcedures: Array<{ procedureDecisionId: string; procedurePlanId?: string; procedureCode: string; otherProcedureText?: string; performedDate: string; noteText?: string }>;
};

type ContextItem = {
  id: string;
  code: string;
  source: "PATIENT_REPORTED";
  value: unknown;
  sourceUpdatedAt?: string;
  latestReconciliation: { reconciledAt: string } | null;
};

type CanonicalRead = {
  visitId: string;
  status: "DRAFT" | "FINALIZED";
  visitOccurredAt: string | null;
  finalizedAt: string | null;
  canonicalClinicalData: null | Record<string, unknown>;
  visitDecisions: {
    diagnoses: Array<Record<string, unknown>>;
    treatments: Array<Record<string, unknown>>;
    procedures: Array<Record<string, unknown>>;
  };
  effectivePhysicianState: EffectiveState;
  patientContext: {
    contextVersion: number | null;
    fingerprint: string | null;
    createdAt?: string;
    latestReview: { reviewedAt: string } | null;
    items: ContextItem[];
  };
  correction: null | { evaluatedAt: string; deadline: string; eligible: boolean };
};

type ApiErrorPayload = { error?: { code?: string; message?: string } };

class WorkspaceApiError extends Error {
  constructor(readonly status: number, readonly code?: string) {
    super(code ?? "WORKSPACE_REQUEST_FAILED");
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!response.ok) throw new WorkspaceApiError(response.status, payload.error?.code);
  return payload;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item) => typeof item === "object" && item !== null) as Array<Record<string, unknown>> : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function hairPullLabel(value: unknown, locale: "ar" | "en"): string {
  const labels: Record<string, { ar: string; en: string }> = {
    POSITIVE: { ar: "إيجابي", en: "Positive" }, NEGATIVE: { ar: "سلبي", en: "Negative" }, NOT_RECORDED: { ar: "غير مسجل", en: "Not recorded" },
  };
  return typeof value === "string" ? labels[value]?.[locale] ?? "—" : "—";
}

function hairPartingLabel(value: unknown, locale: "ar" | "en"): string {
  const labels: Record<string, { ar: string; en: string }> = {
    UNIVERSAL: { ar: "عام", en: "Universal" }, FRONTAL_THINNER: { ar: "أرق أماميًا", en: "Frontal thinner" }, CROWN_THINNER: { ar: "أرق عند التاج", en: "Crown thinner" }, VERTEX_THINNER: { ar: "أرق عند القمة", en: "Vertex thinner" },
  };
  return typeof value === "string" ? labels[value]?.[locale] ?? "—" : "—";
}

function optionalText(value: string): string | undefined {
  return value.trim().length ? value : undefined;
}

const CONTEXT_GROUPS = [
  { key: "GENERAL", codes: ["MARITAL_SOCIAL_STATUS"] },
  { key: "REPRODUCTIVE", codes: ["CONTRACEPTIVE_USE", "PREGNANCY_BREASTFEEDING_CONTEXT"] },
  { key: "MEDICAL", codes: ["PREVIOUSLY_DIAGNOSED_CONDITIONS", "CURRENT_MEDICATIONS", "ALLERGIES"] },
  { key: "HAIR", codes: ["PREVIOUS_HAIR_THERAPIES", "CURRENT_HAIR_THERAPIES"] },
] as const;

const CONTEXT_LABELS: Record<string, { ar: string; en: string }> = {
  GENERAL: { ar: "عام", en: "General" },
  REPRODUCTIVE: { ar: "الصحة الإنجابية", en: "Reproductive" },
  MEDICAL: { ar: "طبي", en: "Medical" },
  HAIR: { ar: "سياق علاجات الشعر", en: "Hair Treatment Context" },
  MARITAL_SOCIAL_STATUS: { ar: "الحالة الاجتماعية", en: "Marital / Social Status" },
  CONTRACEPTIVE_USE: { ar: "استخدام موانع الحمل", en: "Contraceptive Use" },
  PREGNANCY_BREASTFEEDING_CONTEXT: { ar: "سياق الحمل والرضاعة", en: "Pregnancy / Breastfeeding Context" },
  PREVIOUSLY_DIAGNOSED_CONDITIONS: { ar: "الحالات المشخّصة سابقًا", en: "Previously Diagnosed Conditions" },
  CURRENT_MEDICATIONS: { ar: "الأدوية الحالية", en: "Current Medications" },
  ALLERGIES: { ar: "الحساسية", en: "Allergies" },
  PREVIOUS_HAIR_THERAPIES: { ar: "علاجات الشعر السابقة", en: "Previous Hair Therapies" },
  CURRENT_HAIR_THERAPIES: { ar: "علاجات الشعر الحالية", en: "Current Hair Therapies" },
};

const MEASUREMENT_LABELS: Record<string, { ar: string; en: string }> = {
  SHEDDING: { ar: "التساقط", en: "Shedding" },
  DENSITY_LOSS: { ar: "فقدان الكثافة", en: "Density Loss" },
  ITCH: { ar: "الحكة", en: "Itch" },
  BURNING: { ar: "الحرقة", en: "Burning" },
  SCALP_PAIN: { ar: "ألم فروة الرأس", en: "Scalp Pain" },
};

const PROCEDURE_LABELS: Record<string, { ar: string; en: string }> = {
  PRP: { ar: "البلازما الغنية بالصفائح الدموية", en: "PRP / Platelet-Rich Plasma" },
  MICRONEEDLING: { ar: "المايكرونيدلينغ", en: "Microneedling" },
  HAIR_LASER: { ar: "ليزر تحفيز الشعر", en: "Hair Stimulation Laser" },
  RED_LIGHT: { ar: "العلاج بالضوء الأحمر", en: "Red Light Therapy" },
  MINOXIDIL_INJ: { ar: "حقن المينوكسيديل", en: "Minoxidil Injections" },
  DUTASTERIDE_INJ: { ar: "حقن الدوتاستيرايد", en: "Dutasteride Injections" },
  EXOSOME: { ar: "علاج الإكسوزوم", en: "Exosome Therapy" },
  CORTISONE_INJ: { ar: "حقن الكورتيزون", en: "Corticosteroid Injections" },
  REGENERA: { ar: "ريجينيرا / ريجينيرا أكتيفا", en: "Regenera / Regenera Activa" },
  ACELL: { ar: "إي سيل", en: "ACell" },
  HAIR_TRANSPLANT: { ar: "زراعة الشعر", en: "Hair Transplantation" },
  OTHER: { ar: "إجراء آخر", en: "Other" },
};



function messageTone(message: string): string {
  return message.startsWith("✓") ? styles.success : styles.error;
}

export function PhysicianVisitWorkspace(props: React.ComponentProps<typeof VisitWorkspace>) {
  return <VisitWorkspace key={props.visit.id} {...props} />;
}

function VisitWorkspace({
  patient,
  visit,
  visitNumber,
  episodeLabel,
  actorRole,
  workspaceLabel,
  workspaceKind = "GENERAL",
  autoPrepare = false,
  onWorkflowStatusChange,
  onFinalized,
  leaveGuardRef,
}: {
  patient: { name: string; mrn: string };
  visit: { id: string; visitType: "INITIAL" | "FOLLOW_UP"; visitStatus: "CREATED" | "COMPLETED" | "CANCELLED"; createdAt: string };
  visitNumber: number;
  episodeLabel: string;
  actorRole: ActorRole;
  workspaceLabel?: string;
  workspaceKind?: PhysicianClinicalWorkspaceKind;
  autoPrepare?: boolean;
  onWorkflowStatusChange?: (status: PhysicianVisitWorkflowStatus) => void;
  onFinalized?: () => void;
  leaveGuardRef?: React.RefObject<(() => Promise<boolean>) | null>;
}) {
  const { locale, dir } = usePlatformLocale();
  const isAr = locale === "ar";
  const t = useCallback((ar: string, en: string) => isAr ? ar : en, [isAr]);
  const [panel, setPanel] = useState<WorkspacePanel>("TODAY");
  const [envelope, setEnvelope] = useState<VisitEnvelope | null>(null);
  const [canonical, setCanonical] = useState<CanonicalRead | null>(null);
  const [sections, setSections] = useState<WorkspaceDraftSections>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const autoPrepareRequested = useRef(false);
  const actionLock = useRef(false);
  const incompleteDecisions = useRef(false);
  const [hasIncompleteDecision, setHasIncompleteDecision] = useState(false);
  const onIncompleteDecision = useCallback((value: boolean) => {
    incompleteDecisions.current = value;
    setHasIncompleteDecision(value);
  }, []);
  const [saveState, setSaveState] = useState<DraftSaveState>("saved");
  const [acknowledgement] = useState(() => new VisitDraftAcknowledgement());
  const [saveFailureCode, setSaveFailureCode] = useState<string | undefined>();
  const [autosave] = useState(() => new VisitDraftAutosave(async (command) => {
    if (visitDraftHasPatientPromotion({ [command.section]: command.value })) throw new Error("INVALID_DRAFT_DATA");
    try {
      const result = await api<{ physicianVisitRecord: DraftRecord }>(`/api/physician/visits/${visit.id}/draft`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      acknowledgement.acknowledge(freshWorkspaceSections(result.physicianVisitRecord.draftJson));
      setSaveFailureCode(undefined);
      return result.physicianVisitRecord.draftVersion;
    } catch (error) {
      setSaveFailureCode(error instanceof WorkspaceApiError ? error.code : undefined);
      throw error;
    }
  }, 650, async (attempted) => {
    // Retry an uncertain response only after checking whether that exact write
    // committed. Never adopt an unrelated change from another browser/editor.
    const live = (await api<VisitEnvelope>(`/api/physician/visits/${visit.id}`)).physicianVisitRecord;
    if (live?.status !== "DRAFT") throw new Error("PHYSICIAN_VISIT_ALREADY_FINALIZED");
    if (live.draftVersion === attempted.expectedDraftVersion) return null;
    if (live.draftVersion === attempted.expectedDraftVersion + 1 && acknowledgement.matchesAttempt(freshWorkspaceSections(live.draftJson), attempted.section, parseGovernedDraftSection(attempted.section, attempted.value))) {
      acknowledgement.acknowledge(freshWorkspaceSections(live.draftJson));
      setSaveFailureCode(undefined);
      return live.draftVersion;
    }
    setSaveFailureCode("DRAFT_CONFLICT");
    throw new Error("DRAFT_CONFLICT");
  }));

  useEffect(() => autosave.subscribe(setSaveState), [autosave]);

  useEffect(() => {
    const guard = async () => {
      if (actionLock.current || incompleteDecisions.current) return false;
      return autosave.flush();
    };
    if (leaveGuardRef) leaveGuardRef.current = guard;
    const warn = (event: BeforeUnloadEvent) => {
      if (autosave.hasUnsavedChanges() || incompleteDecisions.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const followLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      if (!autosave.hasUnsavedChanges() && !incompleteDecisions.current && !actionLock.current) return;
      event.preventDefault();
      event.stopPropagation();
      void guard().then((saved) => { if (saved && link.isConnected) link.click(); });
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", followLink, true);
    return () => {
      if (leaveGuardRef?.current === guard) leaveGuardRef.current = null;
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", followLink, true);
    };
  }, [autosave, leaveGuardRef]);

  const reload = useCallback(async () => {
    try {
      let loaded = await api<VisitEnvelope>(`/api/physician/visits/${visit.id}`);
      setEnvelope(loaded);
      if (
        autoPrepare
        && !autoPrepareRequested.current
        && !loaded.physicianVisitRecord
        && loaded.visit.status === "CREATED"
      ) {
        autoPrepareRequested.current = true;
        await api(`/api/physician/visits/${visit.id}/prepare`, { method: "POST" });
        loaded = await api<VisitEnvelope>(`/api/physician/visits/${visit.id}`);
        setEnvelope(loaded);
      }
      if (!autosave.hasUnsavedChanges()) {
        setSections(freshWorkspaceSections(loaded.physicianVisitRecord?.draftJson));
        if (loaded.physicianVisitRecord) {
          autosave.initialize(loaded.physicianVisitRecord.draftVersion);
          acknowledgement.acknowledge(freshWorkspaceSections(loaded.physicianVisitRecord.draftJson));
        }
      }
      if (loaded.physicianVisitRecord && actorRole === "PHYSICIAN") {
        setCanonical(await api<CanonicalRead>(`/api/physician/visits/${visit.id}/clinical`));
      } else {
        setCanonical(null);
      }
      onWorkflowStatusChange?.(physicianVisitWorkflowStatus({
        visitStatus: loaded.visit.status,
        ...(loaded.visit.visitOccurredAt ? { visitOccurredAt: loaded.visit.visitOccurredAt } : {}),
        ...(loaded.physicianVisitRecord ? { physicianRecordStatus: loaded.physicianVisitRecord.status } : {}),
      }));
    } catch (error) {
      const failure = error instanceof WorkspaceApiError ? error : undefined;
      if (failure?.status === 401) window.location.assign("/login");
      setNotice(workspaceErrorMessage(failure?.code, locale));
    }
  }, [acknowledgement, actorRole, autoPrepare, autosave, locale, onWorkflowStatusChange, visit.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const record = envelope?.physicianVisitRecord ?? null;
  const finalized = record?.status === "FINALIZED" || canonical?.status === "FINALIZED";
  const canEdit = Boolean(record && !finalized && visit.visitStatus === "CREATED");
  const isPhysician = actorRole === "PHYSICIAN";

  async function runAction(name: string, url: string, init: RequestInit = { method: "POST" }, success?: string): Promise<boolean> {
    if (actionLock.current) return false;
    if (name === "finalize" && incompleteDecisions.current) return false;
    actionLock.current = true;
    setBusy(name);
    setNotice("");
    try {
      // Begin/review/Finalize and their reloads must not race a pending save.
      if (!await autosave.flush()) return false;
      if (name === "finalize") init = {
        ...init,
        body: JSON.stringify({ expectedDraftVersion: autosave.getVersion() }),
      };
      await api(url, init);
      if (success && ["correction", "addendum"].includes(name)) setNotice(`✓ ${success}`);
      await reload();
      return true;
    } catch (error) {
      const failure = error instanceof WorkspaceApiError ? error : undefined;
      if (failure?.status === 401) window.location.assign("/login");
      setNotice(workspaceErrorMessage(failure?.code, locale));
      // Draft saves are already flushed and editing is locked during this
      // action, so refreshing stale patient-reference evidence is safe.
      if (failure?.code === "PATIENT_CONTEXT_VERSION_CONFLICT") await reload();
      return false;
    } finally {
      actionLock.current = false;
      setBusy(null);
    }
  }

  function updateSection(section: string, value: Record<string, unknown>) {
    if (!canEdit || actionLock.current) return;
    setSections((current) => ({ ...current, [section]: value }));
    autosave.edit(section, value);
  }

  const panels: Array<[WorkspacePanel, string]> = [
    ["CONTEXT", t("سياق المراجع", "Patient Context")],
    ["TODAY", t("زيارة اليوم", "Today's Visit")],
    ["LONGITUDINAL", t("السجل الطبي السابق", "Prior physician state")],
    ["FINALIZE", finalized ? t("السجل المعتمد", "Finalized Record") : t("المراجعة والاعتماد", "Review & Finalize")],
  ];

  return (
    <section className={styles.workspace} dir={dir} data-visit-workspace data-role={actorRole} aria-label={`${patient.name} — ${workspaceLabel ?? episodeLabel}`}>
      <header className={styles.visitHeader}>
        <div>
          <p className={styles.eyebrow}>{visit.visitType === "INITIAL" ? t("زيارة أولية", "Initial visit") : t("زيارة متابعة", "Follow-up visit")}</p>
          <h3>{t("الزيارة", "Visit")} {localeNumber(visitNumber, locale)}</h3>
          <div className={styles.headerMeta}>
            <span>{episodeLabel}</span>
            {!envelope?.visit.visitOccurredAt && <span>{formatClinicDateTime(visit.createdAt, locale)}</span>}
          </div>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.statePill} ${finalized ? styles.finalized : styles.draft}`}>{finalized ? t("معتمدة", "Finalized") : record ? t("مسودة", "Draft") : t("غير مهيأة", "Not prepared")}</span>
          {canEdit && <span className={styles.saveIndicator} role="status" aria-live="polite">
            {saveState === "failed" ? <>{t("تعذر الحفظ —", "Save failed —")} <button type="button" disabled={Boolean(busy)} onClick={() => void autosave.flush()}>{t("إعادة المحاولة", "Retry")}</button></> : hasIncompleteDecision ? t("أكمل القرار الذي بدأت إدخاله أو ألغِ إدخاله في زيارة اليوم.", "Complete or discard the unfinished decision in Today's Visit.") : saveState === "saving" ? t("جاري الحفظ...", "Saving...") : t("تم الحفظ ✓", "Saved ✓")}
          </span>}
          {canEdit && saveState === "failed" && saveFailureCode === "DRAFT_CONFLICT" && <small>{t("تغيّرت الزيارة في نافذة أخرى. احتفظنا بتعديلاتك هنا؛ راجع التغييرات قبل المتابعة.", "This Visit changed in another window. Your edits remain here; review the changes before continuing.")}</small>}
          {envelope?.visit.visitOccurredAt && <time>{t("بدأت المقابلة", "Encounter begun")}: {formatClinicDateTime(envelope.visit.visitOccurredAt, locale)}</time>}
          {!record && visit.visitStatus === "CREATED" && (
            <button type="button" className="button button--primary" disabled={Boolean(busy)} onClick={() => void runAction("prepare", `/api/physician/visits/${visit.id}/prepare`, { method: "POST" }, t("تمت تهيئة المسودة.", "Draft prepared."))}>{t("تهيئة المسودة", "Prepare Draft")}</button>
          )}
          {record && !finalized && !envelope?.visit.visitOccurredAt && isPhysician && (
            <button type="button" className="button button--primary" disabled={Boolean(busy)} onClick={() => void runAction("begin", `/api/physician/visits/${visit.id}/begin-encounter`, { method: "POST" }, t("بدأت المقابلة.", "Encounter begun."))}>{t("بدء المقابلة", "Begin Encounter")}</button>
          )}
        </div>
      </header>

      {notice && <div className={`${styles.notice} ${messageTone(notice)}`} role="status">{notice}</div>}
      {!envelope ? <div className={styles.loading}>{t("جارٍ تحميل الزيارة…", "Loading Visit…")}</div> : null}

      {record && (
        <>
          <nav className={styles.panelNav} aria-label={t("أقسام مساحة عمل الزيارة", "Visit Workspace sections")}>
            {panels.map(([value, label]) => <button type="button" key={value} aria-current={panel === value ? "page" : undefined} onClick={() => setPanel(value)}>{label}</button>)}
          </nav>

          {panel === "CONTEXT" && canonical && (
            <PatientContextPanel
              value={canonical.patientContext}
              locale={locale}
            />
          )}

          {panel === "CONTEXT" && !canonical && (
            <section className={styles.emptyCard}><h4>{t("سياق المراجع", "Patient Context")}</h4><p>{t("ابدأ زيارة اليوم لمراجعة السياق الصحي المسجل.", "Start today's visit to review the recorded health context.")}</p></section>
          )}

          <div hidden={panel !== "TODAY"}>{finalized && canonical ? (
            <><FinalizedClinicalPanel canonical={canonical} locale={locale} workspaceKind={workspaceKind} /><VisitDecisionList decisions={canonical.visitDecisions} state={canonical.effectivePhysicianState} locale={locale} /></>
          ) : (
            <TodayDraftPanel
              sections={sections}
              workspaceKind={workspaceKind}
              state={canonical?.effectivePhysicianState ?? { diagnoses: [], treatmentCourses: [], procedurePlans: [], performedProcedures: [] }}
              locale={locale}
              disabled={!canEdit || Boolean(busy)}
              onChange={updateSection}
              onIncompleteDecision={onIncompleteDecision}
            />
          )}</div>

          {panel === "LONGITUDINAL" && canonical && (
            <LongitudinalPanel
              mode="READ_ONLY"
              state={canonical.effectivePhysicianState}
              decisions={canonical.visitDecisions}
              sections={sections}
              locale={locale}
              followUp={visit.visitType === "FOLLOW_UP"}
              finalized={finalized}
              disabled={!canEdit || Boolean(busy)}
              setSection={updateSection}
            />
          )}

          {panel === "FINALIZE" && (
            <FinalizePanel
              sections={sections}
              canonical={canonical}
              locale={locale}
              workspaceKind={workspaceKind}
              isPhysician={isPhysician}
              canFinalize={Boolean(canEdit && envelope?.visit.visitOccurredAt && saveState !== "failed" && !hasIncompleteDecision && !hasIncompleteAnatomicalRegion(sections))}
              busy={busy}
              onFinalize={() => record && void (async () => {
                const finalizedSuccessfully = await runAction(
                  "finalize",
                  `/api/physician/visits/${visit.id}/finalize`,
                  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedDraftVersion: autosave.getVersion() }) },
                  t("تم اعتماد الزيارة.", "Visit finalized."),
                );
                if (finalizedSuccessfully) onFinalized?.();
              })()}
              visitId={visit.id}
              runAction={runAction}
            />
          )}
        </>
      )}
    </section>
  );
}

function PatientContextPanel({
  value, locale,
}: {
  value: CanonicalRead["patientContext"];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const t = (ar: string, en: string) => isAr ? ar : en;
  const byCode = useMemo(() => new Map(value.items.map((item) => [item.code, item])), [value.items]);
  return (
    <div className={styles.stack}>
      <section className={`${styles.boundaryBanner} ${styles.patientBoundary}`}>
        <div><h4>{t("سياق المراجع", "Patient Context")}</h4><p>{t("مرجع مختصر أثناء زيارة الطبيب.", "A concise reference during the physician Visit.")}</p></div>
      </section>
      
      {value.items.length === 0 ? <section className={styles.emptyCard}>{t("لا يوجد سياق مراجع مسجل لهذه الزيارة.", "No Patient Context is recorded for this Visit.")}</section> : (
        <div className={styles.contextGroups}>
          {CONTEXT_GROUPS.map((group) => {
            const items = group.codes.map((code) => byCode.get(code)).filter((item): item is ContextItem => Boolean(item));
            if (!items.length) return null;
            return <section className={styles.contextGroup} key={group.key}>
              <h4>{CONTEXT_LABELS[group.key][locale]}</h4>
              <div className={styles.contextGrid}>
                {items.map((item) => <article className={styles.contextItem} key={item.id}>
                  <header><strong>{CONTEXT_LABELS[item.code]?.[locale] ?? item.code}</strong></header>
                  <div className={styles.contextValueItems}>{presentPatientContextValue(item.value, locale).length === 0 && <p>{t("لا توجد عناصر مسجلة", "No items recorded")}</p>}{presentPatientContextValue(item.value, locale).map((presentedItem, itemIndex) => (
                    <section className={styles.contextValueItem} key={`${item.id}:value:${itemIndex}`}>
                      {presentedItem.title && <h5>{presentedItem.title}</h5>}
                      <dl>{presentedItem.fields.map((field, fieldIndex) => (
                        <div key={`${item.id}:field:${itemIndex}:${fieldIndex}`}>
                          {field.label && <dt>{field.label}</dt>}
                          <dd>{field.values.map((entry, valueIndex) => <span key={`${item.id}:field:${itemIndex}:${fieldIndex}:${valueIndex}`}>{entry}</span>)}</dd>
                        </div>
                      ))}</dl>
                    </section>
                  ))}</div>
                  {["CURRENT_MEDICATIONS", "CURRENT_HAIR_THERAPIES"].includes(item.code) && item.sourceUpdatedAt && <footer><small>{t("آخر تحديث", "Last updated")}: {formatClinicDateTime(item.sourceUpdatedAt, locale)}</small></footer>}
                </article>)}
              </div>
            </section>;
          })}
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return <section className={styles.sectionCard}><header className={styles.sectionHeading}><div><h4>{title}</h4>{eyebrow === "0–5 scale" || eyebrow === "المقياس ٠–٥" ? <small>{eyebrow}</small> : null}</div></header>{children}</section>;
}

function TodayDraftPanel({ sections, workspaceKind, state, locale, disabled, onChange, onIncompleteDecision }: { sections: WorkspaceDraftSections; workspaceKind: PhysicianClinicalWorkspaceKind; state: EffectiveState; locale: "ar" | "en"; disabled: boolean; onChange: (section: string, value: Record<string, unknown>) => void; onIncompleteDecision: (value: boolean) => void }) {
  const isAr = locale === "ar";
  const t = (ar: string, en: string) => isAr ? ar : en;
  const profile = physicianWorkspaceSectionProfile(workspaceKind);
  const workspaceIntro: Record<PhysicianClinicalWorkspaceKind, { ar: string; en: string }> = {
    HAIR: { ar: "وثّق فحص الشعر وفروة الرأس والتشخيص والخطة العلاجية", en: "Document the hair/scalp examination, diagnosis, and treatment plan" },
    HAIR_SCALP: { ar: "وثّق فحص الشعر وفروة الرأس والتشخيص والخطة العلاجية", en: "Document the hair and scalp examination, diagnosis, and treatment plan" },
    HAIR_QUALITY: { ar: "وثّق تقييم جودة الشعر والتشخيص والخطة العلاجية", en: "Document the hair-quality assessment, diagnosis, and treatment plan" },
    DERMATOLOGY: { ar: "وثّق تقييم الجلدية والتشخيص والخطة العلاجية", en: "Document the dermatology assessment, diagnosis, and treatment plan" },
    LASER: { ar: "وثّق تقييم الليزر وقرار العلاج أو الإجراء", en: "Document the laser assessment and treatment/procedure decision" },
    AESTHETIC: { ar: "وثّق التقييم التجميلي وقرار العلاج أو الإجراء", en: "Document the aesthetic assessment and treatment/procedure decision" },
    GENERAL: { ar: "وثّق تقييم اليوم والتشخيص والخطة العلاجية", en: "Document today's assessment, diagnosis, and treatment plan" },
  };
  const examination = object(sections.EXAMINATION);
  const measurements = object(sections.MEASUREMENTS);
  const pattern = object(sections.PATTERN);
  const mcuFv = object(pattern.mcuFv);
  const hairLine = object(pattern.hairLineDistanceCm);
  const trichoscopy = object(sections.TRICHOSCOPY);
  const selectedFindings = Array.isArray(trichoscopy.selectedFindingCodes) ? trichoscopy.selectedFindingCodes.filter((item): item is string => typeof item === "string") : [];
  const hairPullOptions: ReadonlyArray<readonly [string, string]> = [["POSITIVE", t("إيجابي", "Positive")], ["NEGATIVE", t("سلبي", "Negative")], ["NOT_RECORDED", t("غير مسجل", "Not recorded")]];
  const hairPartingOptions: ReadonlyArray<readonly [string, string]> = [["UNIVERSAL", t("عام", "Universal")], ["FRONTAL_THINNER", t("أرق أماميًا", "Frontal thinner")], ["CROWN_THINNER", t("أرق عند التاج", "Crown thinner")], ["VERTEX_THINNER", t("أرق عند القمة", "Vertex thinner")]];
  const distanceOptions: ReadonlyArray<readonly [string, string]> = [["midline", t("خط المنتصف", "Midline")], ["rightSide", t("الجهة اليمنى", "Right side")], ["leftSide", t("الجهة اليسرى", "Left side")]];

  return <div className={styles.stack}>
    <section className={`${styles.boundaryBanner} ${styles.todayBoundary}`}><div><span>{t("زيارة اليوم", "Today's Visit")}</span><h4>{workspaceIntro[workspaceKind][locale]}</h4></div></section>

    {profile.hairScalpAssessment ? <>
    <div className={styles.twoColumn}>
      <SectionCard title={t("الفحص السريري", "Clinical Examination")} eyebrow={t("الملاحظة", "Observation")}>
        <fieldset disabled={disabled} className={styles.fieldset}><legend>{t("اختبار شد الشعر", "Hair Pull")}</legend><div className={styles.choiceRow}>
          {hairPullOptions.map(([value, label]) => <label key={value}><input type="radio" name="hair-pull" checked={examination.hairPull === value} onChange={() => onChange("EXAMINATION", { ...examination, hairPull: value })} />{label}</label>)}
        </div></fieldset>
        <fieldset disabled={disabled} className={styles.fieldset}><legend>{t("تفرقة الشعر", "Hair Parting")}</legend><div className={styles.choiceGrid}>
          {hairPartingOptions.map(([value, label]) => {
            const selected = Array.isArray(examination.hairParting) ? examination.hairParting.filter((item): item is string => typeof item === "string") : [];
            return <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={(event) => onChange("EXAMINATION", { ...examination, hairParting: event.target.checked ? [...selected, value] : selected.filter((item) => item !== value) })} />{label}</label>;
          })}
        </div><small>{t("الخيار غير المحدد لا يعني نتيجة سلبية.", "An unselected option is not a negative finding.")}</small></fieldset>
      </SectionCard>

      <SectionCard title={t("قياسات الطبيب", "Physician Measurements")} eyebrow={t("المقياس ٠–٥", "0–5 scale")}>
        <div className={styles.measureGrid}>{PHYSICIAN_MEASUREMENT_CODES.map((code) => <label className={styles.measure} key={code}><span>{MEASUREMENT_LABELS[code][locale]}</span><select disabled={disabled} value={typeof measurements[code] === "number" ? String(measurements[code]) : ""} onChange={(event) => {
          const next = { ...measurements }; if (event.target.value === "") delete next[code]; else next[code] = Number(event.target.value); onChange("MEASUREMENTS", next);
        }}><option value="">{t("غير مسجل", "Not recorded")}</option>{[0,1,2,3,4,5].map((value) => <option value={value} key={value}>{localeNumber(value, locale)}</option>)}</select></label>)}</div>
      </SectionCard>
    </div>

    <SectionCard title={t("تقييم النمط", "Pattern Assessment")} eyebrow={t("اختياري حسب الحالة", "Optional when clinically relevant")}>
      <div className={styles.patternGrid}>
        <label><span>{t("درجة سنكلير", "Sinclair grade")}</span><select disabled={disabled} value={typeof pattern.sinclair === "number" ? String(pattern.sinclair) : ""} onChange={(event) => { const next = { ...pattern }; if (!event.target.value) delete next.sinclair; else next.sinclair = Number(event.target.value); onChange("PATTERN", next); }}><option value="">{t("اختياري", "Optional")}</option>{[1,2,3,4,5].map((value) => <option value={value} key={value}>{localeNumber(value, locale)}</option>)}</select></label>
        <label><span>{t("النوع الأساسي MCU/FV", "MCU/FV Basic type")}</span><select disabled={disabled} value={text(mcuFv.basic)} onChange={(event) => { const next = { ...pattern }; if (!event.target.value) delete next.mcuFv; else next.mcuFv = { ...mcuFv, basic: event.target.value }; onChange("PATTERN", next); }}><option value="">{t("اختياري", "Optional")}</option>{MCU_FV_BASIC_VALUES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>F</span><select disabled={disabled || !mcuFv.basic} value={text(mcuFv.frontal)} onChange={(event) => { const nextMcu = { ...mcuFv }; if (!event.target.value) delete nextMcu.frontal; else nextMcu.frontal = event.target.value; onChange("PATTERN", { ...pattern, mcuFv: nextMcu }); }}><option value="">—</option>{MCU_FV_FRONTAL_VALUES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>V</span><select disabled={disabled || !mcuFv.basic} value={text(mcuFv.vertex)} onChange={(event) => { const nextMcu = { ...mcuFv }; if (!event.target.value) delete nextMcu.vertex; else nextMcu.vertex = event.target.value; onChange("PATTERN", { ...pattern, mcuFv: nextMcu }); }}><option value="">—</option>{MCU_FV_VERTEX_VALUES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <div className={styles.derivedCode}><span>{t("رمز النمط", "Pattern code")}</span><strong dir="ltr">{deriveMcuFvWorkspaceCode(mcuFv)}</strong></div>
      </div>
      <div className={styles.distanceGrid}>{distanceOptions.map(([key, label]) => <label key={key}><span>{label}</span><div><input disabled={disabled} type="number" min="0" step="0.01" inputMode="decimal" value={typeof hairLine[key] === "number" ? String(hairLine[key]) : ""} onChange={(event) => { const nextLine = { ...hairLine }; if (!event.target.value) delete nextLine[key]; else nextLine[key] = Number(event.target.value); const nextPattern = { ...pattern }; if (Object.keys(nextLine).length) nextPattern.hairLineDistanceCm = nextLine; else delete nextPattern.hairLineDistanceCm; onChange("PATTERN", nextPattern); }} /><b>{t("سم", "cm")}</b></div></label>)}</div>
    </SectionCard>

    <SectionCard title={t("فحص منظار الشعر", "Trichoscopy")} eyebrow={t("اختياري حسب الحالة", "Optional when clinically relevant")}>
      <div className={styles.catalogue}>{PHYSICIAN_TRICHOSCOPY_FINDINGS.map((finding) => <label key={finding.code}><input disabled={disabled} type="checkbox" checked={selectedFindings.includes(finding.code)} onChange={(event) => onChange("TRICHOSCOPY", { ...trichoscopy, selectedFindingCodes: event.target.checked ? [...selectedFindings, finding.code] : selectedFindings.filter((code) => code !== finding.code) })} /><span>{isAr ? TRICHOSCOPY_AR[finding.code] : finding.label}</span></label>)}</div>
      <label className={styles.fullField}><span>{t("موجودات أخرى يكتبها الطبيب", "Other physician finding")}</span><textarea disabled={disabled} value={text(trichoscopy.otherFindingText)} onChange={(event) => { const next = { ...trichoscopy }; if (!event.target.value) delete next.otherFindingText; else next.otherFindingText = event.target.value; onChange("TRICHOSCOPY", next); }} /></label>
    </SectionCard>

    <SectionCard title={t("الخريطة التشريحية", "Anatomical Map")} eyebrow={t("حدد المناطق على فروة الرأس", "Mark the relevant scalp areas")}>
      <AnatomicalMapEditor value={object(sections.ANATOMICAL_MAP)} locale={locale} disabled={disabled} onChange={(value) => onChange("ANATOMICAL_MAP", value)} />
    </SectionCard>

    </> : null}

    <LongitudinalPanel
      mode="EDITOR"
      workspaceKind={workspaceKind}
      state={state}
      decisions={{ diagnoses: [], treatments: [], procedures: [] }}
      sections={sections}
      locale={locale}
      followUp={false}
      finalized={false}
      disabled={disabled}
      setSection={onChange}
      onIncompleteDecision={onIncompleteDecision}
    />
  </div>;
}

type MapPoint = { x: number; y: number };
type MapStroke = { radius: number; points: MapPoint[] };
type MapRegion = { view: (typeof PHYSICIAN_ANATOMICAL_MAP_VIEWS)[number]; anatomicalRegionCode?: PhysicianAnatomicalRegionCode; geometry: { version: 1; strokes: MapStroke[] }; noteText?: string; displayColorHex?: string };

const ANATOMICAL_MAP_ASSETS: Record<(typeof PHYSICIAN_ANATOMICAL_MAP_VIEWS)[number], string> = {
  FRONT: "/scalp-map/front.png",
  TOP: "/scalp-map/top.png",
  RIGHT_SIDE: "/scalp-map/right.png",
  LEFT_SIDE: "/scalp-map/left.png",
};

function AnatomicalMapEditor({ value, locale, disabled, onChange }: { value: Record<string, unknown>; locale: "ar" | "en"; disabled: boolean; onChange: (value: Record<string, unknown>) => void }) {
  const isAr = locale === "ar";
  const t = (ar: string, en: string) => isAr ? ar : en;
  const regions = Array.isArray(value.regions) ? value.regions as MapRegion[] : [];
  const incompleteIndex = regions.findIndex((region) => !region.anatomicalRegionCode);
  const incompleteRegion = incompleteIndex >= 0 ? regions[incompleteIndex] : undefined;
  const [view, setView] = useState<(typeof PHYSICIAN_ANATOMICAL_MAP_VIEWS)[number]>(() => incompleteRegion?.view ?? "FRONT");
  const [active, setActive] = useState<MapPoint[]>([]);
  const [color, setColor] = useState("#A86A3D");
  const [regionNote, setRegionNote] = useState("");
  const [pendingCode, setPendingCode] = useState<PhysicianAnatomicalRegionCode | "">("");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewRegions = regions.filter((item) => item.view === view);
  const labels: Record<string, { ar: string; en: string }> = { FRONT: { ar: "أمامي", en: "Front" }, TOP: { ar: "علوي", en: "Top" }, RIGHT_SIDE: { ar: "الجانب الأيمن", en: "Right side" }, LEFT_SIDE: { ar: "الجانب الأيسر", en: "Left side" } };

  function point(event: ReactPointerEvent<SVGSVGElement>): MapPoint {
    const bounds = svgRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  }
  function commit(strokePoints: MapPoint[]) {
    if (!strokePoints.length) return;
    const nextRegion: MapRegion = {
      view,
      geometry: { version: 1, strokes: [{ radius: 0.012, points: strokePoints }] },
      displayColorHex: color,
    };
    onChange({ regions: [...regions, nextRegion] });
    setPendingCode(suggestAnatomicalRegionCode(nextRegion));
    setRegionNote("");
  }
  function confirmRegion() {
    if (!incompleteRegion) return;
    const code = pendingCode || suggestAnatomicalRegionCode(incompleteRegion);
    onChange({ regions: regions.map((region, index) => index === incompleteIndex ? {
      ...region,
      anatomicalRegionCode: code,
      ...(regionNote.trim() ? { noteText: regionNote.trim() } : {}),
    } : region) });
    setPendingCode("");
    setRegionNote("");
  }
  function discardIncompleteRegion() {
    if (incompleteIndex < 0) return;
    onChange({ regions: regions.filter((_, index) => index !== incompleteIndex) });
    setPendingCode("");
    setRegionNote("");
  }
  function removeRegion(indexWithinView: number) {
    const removed = viewRegions[indexWithinView];
    let seen = -1;
    onChange({
      regions: regions.filter((region) => {
        if (region.view !== view) return true;
        seen += 1;
        return seen !== indexWithinView;
      }),
    });
    if (removed && !removed.anatomicalRegionCode) { setPendingCode(""); setRegionNote(""); }
  }
  const path = (points: MapPoint[]) => points.map((item) => `${item.x * 600},${item.y * 300}`).join(" ");
  return <div className={styles.mapEditor}>
    <div className={styles.viewTabs}>{PHYSICIAN_ANATOMICAL_MAP_VIEWS.map((item) => <button type="button" key={item} disabled={Boolean(incompleteRegion)} aria-pressed={view === item} onClick={() => { setView(item); setActive([]); setRegionNote(""); }}>{labels[item][locale]}</button>)}</div>
    <div className={styles.mapGrid}>
      <svg ref={svgRef} viewBox="0 0 600 300" role="img" aria-label={`${labels[view][locale]} ${t("خريطة تشريحية", "anatomical map")}`} onPointerDown={(event) => { if (disabled || incompleteRegion) return; event.currentTarget.setPointerCapture(event.pointerId); setActive([point(event)]); }} onPointerMove={(event) => { if (!active.length || disabled || incompleteRegion) return; setActive((current) => [...current, point(event)].slice(-4096)); }} onPointerUp={() => { if (disabled || incompleteRegion) return; commit(active); setActive([]); }}>
        <rect x="1" y="1" width="598" height="298" rx="28" className={styles.mapSurface} />
        <image href={ANATOMICAL_MAP_ASSETS[view]} x="0" y="0" width="600" height="300" preserveAspectRatio="xMidYMid meet" className={styles.anatomicalTemplate} />
        {viewRegions.flatMap((region, regionIndex) => region.geometry.strokes.map((stroke, strokeIndex) => <polyline key={`${regionIndex}:${strokeIndex}`} points={path(stroke.points)} fill="none" stroke={region.displayColorHex ?? color} strokeWidth={Math.max(3, stroke.radius * 300)} strokeLinecap="round" strokeLinejoin="round" />))}
        {active.length > 0 && <polyline points={path(active)} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <div className={styles.mapControls}>
        <label><span>{t("لون الرسم", "Drawing color")}</span><input disabled={disabled} type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} /></label>
        {incompleteRegion && <fieldset className={styles.regionConfirmation}>
          <legend>{t("تأكيد المنطقة المرسومة", "Confirm the drawn region")}</legend>
          <label><span>{t("الهوية التشريحية", "Anatomical identity")}</span><select disabled={disabled} value={pendingCode || suggestAnatomicalRegionCode(incompleteRegion)} onChange={(event) => setPendingCode(event.target.value as PhysicianAnatomicalRegionCode)}>{PHYSICIAN_ANATOMICAL_REGION_CODES_BY_VIEW[incompleteRegion.view].map((code) => <option value={code} key={code}>{PHYSICIAN_ANATOMICAL_REGION_LABELS[code][locale]}</option>)}</select></label>
          <label><span>{t("ملاحظة الطبيب (اختياري)", "Physician note (optional)")}</span><textarea disabled={disabled} value={regionNote} onChange={(event) => setRegionNote(event.target.value)} /></label>
          <div><button type="button" disabled={disabled} onClick={confirmRegion}>{t("تأكيد المنطقة", "Confirm region")}</button><button type="button" disabled={disabled} onClick={discardIncompleteRegion}>{t("إلغاء الرسم", "Discard drawing")}</button></div>
          <small>{t("اقتُرح الموقع من موضع الرسم. راجعه أو غيّره، ثم أكّد المنطقة.", "The drawing location provided a suggestion. Review or change it, then confirm the region.")}</small>
        </fieldset>}
        <button type="button" disabled={disabled || !viewRegions.length} onClick={() => { onChange({ regions: regions.filter((item) => item.view !== view) }); setPendingCode(""); setRegionNote(""); }}>{t("مسح مناطق هذا المنظر", "Clear regions in this view")}</button>
        <small>{t("ارسم مباشرة فوق فروة الرأس، ثم أكّد الهوية التشريحية لكل منطقة.", "Draw directly over the scalp, then confirm the anatomical identity of each region.")}</small>
        {viewRegions.length > 0 && <div className={styles.mapRegionList}>
          <strong>{t("المناطق المسجلة في هذا المنظر", "Recorded regions in this view")}</strong>
          {viewRegions.map((region, index) => <div key={`${view}:${index}`}>
            <span>{region.anatomicalRegionCode ? presentAnatomicalRegionLabel(region, locale) : t("غير مكتملة — أكّد الهوية التشريحية", "Incomplete — confirm anatomical identity")}{region.noteText ? ` — ${region.noteText}` : ""}</span>
            <button type="button" disabled={disabled} onClick={() => removeRegion(index)}>{t("حذف", "Remove")}</button>
          </div>)}
        </div>}
      </div>
    </div>
  </div>;
}

function LongitudinalPanel({ mode = "READ_ONLY", workspaceKind = "GENERAL", state, decisions, sections, locale, followUp, finalized, disabled, setSection, onIncompleteDecision }: {
  mode?: "EDITOR" | "READ_ONLY"; workspaceKind?: PhysicianClinicalWorkspaceKind; state: EffectiveState; decisions: CanonicalRead["visitDecisions"]; sections: WorkspaceDraftSections; locale: "ar" | "en"; followUp: boolean; finalized: boolean; disabled: boolean;
  setSection: (section: string, value: Record<string, unknown>) => void;
  onIncompleteDecision?: (value: boolean) => void;
}) {
  const isAr = locale === "ar";
  const t = (ar: string, en: string) => isAr ? ar : en;
  const workspaceProfile = physicianWorkspaceSectionProfile(workspaceKind);
  const diagnosisSection = object(sections.DIAGNOSIS);
  const diagnoses = list(diagnosisSection.decisions);
  const tpSection = object(sections.TREATMENT_PROCEDURES);
  const treatments = list(tpSection.treatments);
  const procedures = list(tpSection.procedures);
  const [form, setForm] = useState({
    diagnosisText: "", diagnosisAction: "ADD", diagnosisTarget: "",
    treatmentAction: "START", treatmentTarget: "", treatmentName: "", treatmentRegimen: "", treatmentNote: "",
    procedureAction: "PLAN", procedureTarget: "", procedureCode: "", procedureOther: "", procedureDate: "", procedureNote: "",
  });
  const { diagnosisText, diagnosisAction, diagnosisTarget, treatmentAction, treatmentTarget, treatmentName, treatmentRegimen, treatmentNote, procedureAction, procedureTarget, procedureCode, procedureOther, procedureDate, procedureNote } = form;
  type DecisionKind = "diagnosis" | "treatment" | "procedure";
  const [editor, setEditor] = useState<Record<DecisionKind, boolean>>({ diagnosis: false, treatment: false, procedure: false });
  const [dirty, setDirty] = useState<Record<DecisionKind, boolean>>({ diagnosis: false, treatment: false, procedure: false });
  const [editingIndex, setEditingIndex] = useState<Record<DecisionKind, number | null>>({ diagnosis: null, treatment: null, procedure: null });
  function setDirtyState(kind: DecisionKind, value: boolean) {
    const next = { ...dirty, [kind]: value };
    setDirty(next);
    onIncompleteDecision?.(Object.values(next).some(Boolean));
  }
  const activeDiagnoses = state.diagnoses.filter((item) => item.status === "ACTIVE");
  const activeTreatments = state.treatmentCourses.filter((item) => item.status === "ACTIVE");
  const openPlans = state.procedurePlans.filter((item) => item.status === "OPEN");
  const targetedTreatment = activeTreatments.find((item) => item.treatmentCourseId === treatmentTarget);
  const diagnosisDecisionValid = canAddDiagnosisDecision({ action: diagnosisAction, targetId: diagnosisTarget, text: diagnosisText });
  const treatmentDecisionValid = canAddTreatmentDecision({
    action: treatmentAction,
    targetId: treatmentTarget,
    name: treatmentName,
    regimenText: treatmentRegimen,
    noteText: treatmentNote,
    currentName: targetedTreatment?.name,
    currentRegimenText: targetedTreatment?.regimenText,
    currentNoteText: targetedTreatment?.noteText,
  });
  const procedureDecisionValid = (() => {
    const ownCode = procedureAction === "PLAN" || (procedureAction === "PERFORM" && !procedureTarget);
    return (!ownCode || Boolean(procedureCode && (procedureCode !== "OTHER" || procedureOther.trim())))
      && (procedureAction !== "PERFORM" || Boolean(procedureDate && procedureDate <= clinicDateInputValue()))
      && (procedureAction !== "CANCEL_OR_DEFER" || Boolean(procedureTarget));
  })();

  function blankForm(kind: DecisionKind) {
    return kind === "diagnosis" ? { diagnosisText: "", diagnosisAction: "ADD", diagnosisTarget: "" }
      : kind === "treatment" ? { treatmentAction: "START", treatmentTarget: "", treatmentName: "", treatmentRegimen: "", treatmentNote: "" }
      : { procedureAction: "PLAN", procedureTarget: "", procedureCode: "", procedureOther: "", procedureDate: "", procedureNote: "" };
  }
  function openNew(kind: DecisionKind) {
    setForm((current) => ({ ...current, ...blankForm(kind) }));
    setEditingIndex((current) => ({ ...current, [kind]: null }));
    setEditor((current) => ({ ...current, [kind]: true }));
    setDirtyState(kind, false);
  }
  function openEdit(kind: DecisionKind, index: number, item: Record<string, unknown>) {
    const patch = kind === "diagnosis" ? { diagnosisAction: text(item.action), diagnosisTarget: text(item.diagnosisId), diagnosisText: text(item.text) }
      : kind === "treatment" ? { treatmentAction: text(item.action), treatmentTarget: text(item.treatmentCourseId), treatmentName: text(item.name), treatmentRegimen: text(item.regimenText), treatmentNote: text(item.noteText) }
      : { procedureAction: text(item.action), procedureTarget: text(item.procedurePlanId), procedureCode: text(item.procedureCode), procedureOther: text(item.otherProcedureText), procedureDate: text(item.plannedDate) || text(item.performedDate), procedureNote: text(item.noteText) };
    setForm((current) => ({ ...current, ...patch }));
    setEditingIndex((current) => ({ ...current, [kind]: index }));
    setEditor((current) => ({ ...current, [kind]: true }));
    setDirtyState(kind, false);
  }
  function changeForm(kind: DecisionKind, patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    setDirtyState(kind, true);
  }
  function closeEditor(kind: DecisionKind) {
    setEditor((current) => ({ ...current, [kind]: false }));
    setEditingIndex((current) => ({ ...current, [kind]: null }));
    setDirtyState(kind, false);
  }
  function replaceOrAppend(items: Array<Record<string, unknown>>, kind: DecisionKind, decision: Record<string, unknown>) {
    const index = editingIndex[kind];
    if (index === null) return [...items, decision];
    return items.map((item, position) => position === index ? decision : item);
  }
  function saveDecision(kind: DecisionKind) {
    if (kind === "diagnosis" && diagnosisDecisionValid) {
      const decision = diagnosisAction === "ADD" ? { action: "ADD", text: diagnosisText }
        : diagnosisAction === "REVISE" ? { action: "REVISE", diagnosisId: diagnosisTarget, text: diagnosisText }
        : { action: "RESOLVE", diagnosisId: diagnosisTarget };
      setSection("DIAGNOSIS", { decisions: replaceOrAppend(diagnoses, kind, decision) });
    } else if (kind === "treatment" && treatmentDecisionValid) {
      const clinicalContent = { ...(optionalText(treatmentName) ? { name: treatmentName } : {}), ...(optionalText(treatmentRegimen) ? { regimenText: treatmentRegimen } : {}), ...(optionalText(treatmentNote) ? { noteText: treatmentNote } : {}) };
      const decision = treatmentAction === "START" ? { action: "START", ...clinicalContent }
        : treatmentAction === "MODIFY" ? { action: "MODIFY", treatmentCourseId: treatmentTarget, ...clinicalContent }
        : treatmentAction === "CONTINUE_EXISTING" ? { action: "CONTINUE_EXISTING", treatmentCourseId: treatmentTarget, ...(optionalText(treatmentNote) ? { noteText: treatmentNote } : {}) }
        : { action: "STOP", treatmentCourseId: treatmentTarget };
      setSection("TREATMENT_PROCEDURES", { treatments: replaceOrAppend(treatments, kind, decision), procedures });
    } else if (kind === "procedure" && procedureDecisionValid) {
      const common = { procedureCode, ...(procedureCode === "OTHER" ? { otherProcedureText: procedureOther } : {}), ...(optionalText(procedureNote) ? { noteText: procedureNote } : {}) };
      const decision = procedureAction === "PLAN" ? { action: "PLAN", ...common, ...(procedureDate ? { plannedDate: procedureDate } : {}) }
        : procedureAction === "PERFORM" ? { action: "PERFORM", ...(procedureTarget ? { procedurePlanId: procedureTarget, ...(optionalText(procedureNote) ? { noteText: procedureNote } : {}) } : common), performedDate: procedureDate }
        : { action: "CANCEL_OR_DEFER", procedurePlanId: procedureTarget, ...(optionalText(procedureNote) ? { noteText: procedureNote } : {}) };
      setSection("TREATMENT_PROCEDURES", { treatments, procedures: replaceOrAppend(procedures, kind, decision) });
    } else return;
    closeEditor(kind);
  }
  function removeDecision(kind: DecisionKind, index: number) {
    if (kind === "diagnosis") setSection("DIAGNOSIS", { decisions: diagnoses.filter((_, position) => position !== index) });
    if (kind === "treatment") setSection("TREATMENT_PROCEDURES", { treatments: treatments.filter((_, position) => position !== index), procedures });
    if (kind === "procedure") setSection("TREATMENT_PROCEDURES", { treatments, procedures: procedures.filter((_, position) => position !== index) });
    if (editingIndex[kind] === index) closeEditor(kind);
  }

  if (mode === "READ_ONLY") {
    const hasPriorState = state.diagnoses.length > 0 || state.treatmentCourses.length > 0 || state.procedurePlans.length > 0 || state.performedProcedures.length > 0;
    return <div className={styles.stack}>
      <section className={`${styles.boundaryBanner} ${styles.priorBoundary}`}>
        <div>
          <span>{finalized ? t("الحالة السريرية الحالية", "Current clinical state") : t("للقراءة فقط", "Read only")}</span>
          <h4>{finalized ? t("الحالة الطبية بعد هذه الزيارة المعتمدة", "Clinical state after this finalized Visit") : followUp ? t("الحالة الطبية قبل زيارة اليوم", "Clinical state before today's Visit") : t("لا يوجد تاريخ طبي سابق معتمد", "No prior finalized physician history")}</h4>
        </div>
        <p>{finalized ? t("تعرض هذه الصفحة ما تم اعتماده في الزيارة.", "This view shows what was finalized in the Visit.") : followUp ? t("راجع الحالة السابقة هنا، وسجّل أي تغيير ضمن زيارة اليوم.", "Review prior state here and record any change in Today's Visit.") : t("ابدأ التوثيق من زيارة اليوم.", "Begin documentation in Today's Visit.")}</p>
      </section>
      {hasPriorState || finalized ? <EffectiveStateGrid state={state} locale={locale} /> : <section className={styles.emptyCard}>{t("لا توجد تشخيصات أو علاجات أو خطط إجراءات معتمدة من زيارة سابقة.", "No finalized diagnoses, treatments, or procedure plans exist from a prior Visit.")}</section>}
      {finalized && <VisitDecisionList decisions={decisions} state={state} locale={locale} />}
    </div>;
  }

  return <div className={styles.todayDecisionStack}>
    <div className={styles.longitudinalForms}>
      <section className={styles.sectionCard}><div className={styles.sectionHeading}><h4>{t("التشخيص", "Diagnosis")}</h4>{!editor.diagnosis && <button type="button" disabled={disabled} onClick={() => openNew("diagnosis")}>+ {t("إضافة تشخيص", "Add diagnosis")}</button>}</div>
        <DecisionDraftList kind="diagnosis" items={diagnoses} state={state} locale={locale} onEdit={(index, item) => openEdit("diagnosis", index, item)} onRemove={(index) => removeDecision("diagnosis", index)} disabled={disabled || editor.diagnosis} />
        {editor.diagnosis && <div className={styles.decisionEditor}>
          <label><span>{t("قرار اليوم", "Today's decision")}</span><select aria-label={t("قرار التشخيص اليوم", "Diagnosis decision for today")} disabled={disabled} value={diagnosisAction} onChange={(event) => changeForm("diagnosis", { diagnosisAction: event.target.value })}><option value="ADD">{t("تشخيص جديد", "New diagnosis")}</option><option value="REVISE">{t("تحديث تشخيص سابق", "Update an existing diagnosis")}</option><option value="RESOLVE">{t("تسجيل زوال تشخيص", "Mark a diagnosis resolved")}</option></select></label>
          {diagnosisAction !== "ADD" && <label><span>{t("التشخيص", "Diagnosis")}</span><select disabled={disabled} value={diagnosisTarget} onChange={(event) => changeForm("diagnosis", { diagnosisTarget: event.target.value })}><option value="">{t("اختر تشخيصًا", "Choose a diagnosis")}</option>{activeDiagnoses.map((item) => <option key={item.diagnosisId} value={item.diagnosisId}>{item.text}</option>)}</select></label>}
          {diagnosisAction !== "RESOLVE" && <label className={styles.editorWide}><span>{t("التشخيص", "Diagnosis")}</span><textarea disabled={disabled} value={diagnosisText} onChange={(event) => changeForm("diagnosis", { diagnosisText: event.target.value })} /></label>}
          {dirty.diagnosis && !diagnosisDecisionValid && <p className={styles.inlineIncomplete} role="alert">{t("أكمل بيانات التشخيص المطلوبة.", "Complete the required diagnosis details.")}</p>}
          <div className={styles.editorActions}><button type="button" disabled={disabled || !diagnosisDecisionValid} onClick={() => saveDecision("diagnosis")}>{t("حفظ التشخيص", "Save diagnosis")}</button><button type="button" disabled={disabled} onClick={() => closeEditor("diagnosis")}>{t("إلغاء", "Cancel")}</button></div>
        </div>}
      </section>
      <section className={styles.sectionCard}><div className={styles.sectionHeading}><h4>{t("العلاج", "Treatment")}</h4>{!editor.treatment && <button type="button" disabled={disabled} onClick={() => openNew("treatment")}>+ {t("إضافة علاج", "Add treatment")}</button>}</div>
        <DecisionDraftList kind="treatment" items={treatments} state={state} locale={locale} onEdit={(index, item) => openEdit("treatment", index, item)} onRemove={(index) => removeDecision("treatment", index)} disabled={disabled || editor.treatment} />
        {editor.treatment && <div className={styles.decisionEditor}>
          <label><span>{t("قرار اليوم", "Today's decision")}</span><select disabled={disabled} value={treatmentAction} onChange={(event) => changeForm("treatment", { treatmentAction: event.target.value })}><option value="START">{t("بدء", "Start")}</option><option value="CONTINUE_EXISTING">{t("استمرار", "Continue")}</option><option value="MODIFY">{t("تعديل", "Modify")}</option><option value="STOP">{t("إيقاف", "Stop")}</option></select></label>
          {treatmentAction !== "START" && <label><span>{t("العلاج", "Treatment")}</span><select disabled={disabled} value={treatmentTarget} onChange={(event) => changeForm("treatment", { treatmentTarget: event.target.value })}><option value="">{t("اختر علاجًا حاليًا", "Choose a current treatment")}</option>{activeTreatments.map((item) => <option value={item.treatmentCourseId} key={item.treatmentCourseId}>{presentTreatmentTarget(item)}</option>)}</select></label>}
          {["START", "MODIFY"].includes(treatmentAction) && <><label><span>{t("العلاج", "Treatment")}</span><input disabled={disabled} value={treatmentName} onChange={(event) => changeForm("treatment", { treatmentName: event.target.value })} /></label><label><span>{t("النظام العلاجي (اختياري)", "Regimen (optional)")}</span><input disabled={disabled} value={treatmentRegimen} onChange={(event) => changeForm("treatment", { treatmentRegimen: event.target.value })} /></label></>}
          {treatmentAction !== "STOP" && <label className={styles.editorWide}><span>{t("ملاحظة (اختياري)", "Note (optional)")}</span><textarea disabled={disabled} value={treatmentNote} onChange={(event) => changeForm("treatment", { treatmentNote: event.target.value })} /></label>}
          {dirty.treatment && !treatmentDecisionValid && <p className={styles.inlineIncomplete} role="alert">{t("أكمل بيانات العلاج المطلوبة.", "Complete the required treatment details.")}</p>}
          <div className={styles.editorActions}><button type="button" disabled={disabled || !treatmentDecisionValid} onClick={() => saveDecision("treatment")}>{t("حفظ العلاج", "Save treatment")}</button><button type="button" disabled={disabled} onClick={() => closeEditor("treatment")}>{t("إلغاء", "Cancel")}</button></div>
        </div>}
      </section>
      {workspaceProfile.genericDecisions && <section className={styles.sectionCard}><div className={styles.sectionHeading}><h4>{workspaceProfile.hairProcedureDecisions ? t("إجراءات الشعر وفروة الرأس", "Hair & Scalp Procedures") : t("الإجراءات", "Procedures")}</h4>{!editor.procedure && <button type="button" disabled={disabled} onClick={() => openNew("procedure")}>+ {t("إضافة إجراء", "Add procedure")}</button>}</div>
        <DecisionDraftList kind="procedure" items={procedures} state={state} locale={locale} onEdit={(index, item) => openEdit("procedure", index, item)} onRemove={(index) => removeDecision("procedure", index)} disabled={disabled || editor.procedure} />
        {editor.procedure && <div className={styles.decisionEditor}>
          <label><span>{t("قرار اليوم", "Today's decision")}</span><select disabled={disabled} value={procedureAction} onChange={(event) => changeForm("procedure", { procedureAction: event.target.value })}><option value="PLAN">{t("تخطيط", "Plan")}</option><option value="PERFORM">{t("تم التنفيذ", "Performed")}</option><option value="CANCEL_OR_DEFER">{t("إلغاء أو تأجيل", "Cancel or defer")}</option></select></label>
          {procedureAction !== "PLAN" && <label><span>{t("الخطة السابقة (إن وجدت)", "Previous plan, if applicable")}</span><select disabled={disabled} value={procedureTarget} onChange={(event) => changeForm("procedure", { procedureTarget: event.target.value })}><option value="">{procedureAction === "PERFORM" ? t("إجراء مستقل", "Independent procedure") : t("اختر خطة مفتوحة", "Choose an open plan")}</option>{openPlans.map((item) => <option value={item.procedurePlanId} key={item.procedurePlanId}>{presentProcedurePlanTarget(item, locale)}</option>)}</select></label>}
          {(procedureAction === "PLAN" || (procedureAction === "PERFORM" && !procedureTarget)) && <label><span>{t("الإجراء", "Procedure")}</span><select disabled={disabled} value={procedureCode} onChange={(event) => changeForm("procedure", { procedureCode: event.target.value })}><option value="">{t("اختر إجراءً", "Choose a procedure")}</option>{(workspaceProfile.hairProcedureDecisions ? PHYSICIAN_PROCEDURE_CODES : ["OTHER"] as const).map((code) => <option value={code} key={code}>{PROCEDURE_LABELS[code][locale]}</option>)}</select></label>}
          {procedureCode === "OTHER" && (procedureAction === "PLAN" || !procedureTarget) && <label><span>{t("اسم الإجراء", "Procedure name")}</span><input disabled={disabled} value={procedureOther} onChange={(event) => changeForm("procedure", { procedureOther: event.target.value })} /></label>}
          {procedureAction !== "CANCEL_OR_DEFER" && <label><span>{procedureAction === "PLAN" ? t("التاريخ المخطط (اختياري)", "Planned date (optional)") : t("تاريخ التنفيذ", "Performed date")}</span><input disabled={disabled} type="date" max={procedureAction === "PERFORM" ? clinicDateInputValue() : undefined} value={procedureDate} onChange={(event) => changeForm("procedure", { procedureDate: event.target.value })} /></label>}
          <label className={styles.editorWide}><span>{t("ملاحظة (اختياري)", "Note (optional)")}</span><textarea disabled={disabled} value={procedureNote} onChange={(event) => changeForm("procedure", { procedureNote: event.target.value })} /></label>
          {dirty.procedure && !procedureDecisionValid && <p className={styles.inlineIncomplete} role="alert">{t("أكمل بيانات الإجراء المطلوبة.", "Complete the required procedure details.")}</p>}
          <div className={styles.editorActions}><button type="button" disabled={disabled || !procedureDecisionValid} onClick={() => saveDecision("procedure")}>{t("حفظ الإجراء", "Save procedure")}</button><button type="button" disabled={disabled} onClick={() => closeEditor("procedure")}>{t("إلغاء", "Cancel")}</button></div>
        </div>}
      </section>}
    </div>
  </div>;
}

function EffectiveStateGrid({ state, locale }: { state: EffectiveState; locale: "ar" | "en" }) {
  const isAr = locale === "ar"; const t = (ar: string, en: string) => isAr ? ar : en;
  return <div className={styles.stateGrid}>
    <section><h4>{t("التشخيصات الفعالة", "Active Diagnoses")}</h4>{state.diagnoses.filter((item) => item.status === "ACTIVE").map((item) => <p key={item.diagnosisId}>{item.text}</p>)}{!state.diagnoses.some((item) => item.status === "ACTIVE") && <small>{t("لا يوجد", "None")}</small>}</section>
    <section><h4>{t("العلاجات الفعالة", "Active Treatments")}</h4>{state.treatmentCourses.filter((item) => item.status === "ACTIVE").map((item) => <p key={item.treatmentCourseId}><strong>{presentTreatmentTarget(item)}</strong></p>)}{!state.treatmentCourses.some((item) => item.status === "ACTIVE") && <small>{t("لا يوجد", "None")}</small>}</section>
    <section><h4>{t("خطط الإجراءات المفتوحة", "Open Procedure Plans")}</h4>{state.procedurePlans.filter((item) => item.status === "OPEN").map((item) => <p key={item.procedurePlanId}><strong>{presentProcedurePlanTarget(item, locale)}</strong>{item.plannedDate && <span>{formatClinicDate(`${item.plannedDate}T00:00:00.000Z`, locale)}</span>}</p>)}{!state.procedurePlans.some((item) => item.status === "OPEN") && <small>{t("لا يوجد", "None")}</small>}</section>
  </div>;
}

function DecisionDraftList({ kind, items, state, locale, onEdit, onRemove, disabled }: { kind: "diagnosis" | "treatment" | "procedure"; items: Array<Record<string, unknown>>; state: EffectiveState; locale: "ar" | "en"; onEdit: (index: number, item: Record<string, unknown>) => void; onRemove: (index: number) => void; disabled: boolean }) {
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const empty = kind === "diagnosis" ? t("لم يُضف تشخيص لهذه الزيارة.", "No diagnosis added for this Visit.")
    : kind === "treatment" ? t("لم يُضف علاج لهذه الزيارة.", "No treatment added for this Visit.")
    : t("لم يُضف إجراء لهذه الزيارة.", "No procedure added for this Visit.");
  if (!items.length) return <p className={styles.noDecision}>{empty}</p>;
  return <div className={styles.decisionCards}>{items.map((item, index) => <article key={`${text(item.action)}:${index}`}>
    <div><span>{longitudinalActionLabel(item.action, locale)}</span><strong>{presentLongitudinalDecision(item, state, locale)}</strong>{presentDecisionDetails(item, locale).map((detail, detailIndex) => <small key={detailIndex}>{detail}</small>)}</div>
    <div className={styles.decisionCardActions}><button type="button" disabled={disabled} onClick={() => onEdit(index, item)}>{t("تعديل", "Edit")}</button><button type="button" disabled={disabled} onClick={() => onRemove(index)}>{t("حذف", "Remove")}</button></div>
  </article>)}</div>;
}

function VisitDecisionList({ decisions, state, locale }: { decisions: CanonicalRead["visitDecisions"]; state: EffectiveState; locale: "ar" | "en" }) {
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const groups = [[t("التشخيص", "Diagnosis"), decisions.diagnoses], [t("العلاج", "Treatment"), decisions.treatments], [t("الإجراء", "Procedure"), decisions.procedures]] as const;
  return <section className={styles.sectionCard}><h4>{t("قرارات هذه الزيارة المعتمدة", "Finalized decisions from this Visit")}</h4><div className={styles.decisionReadGrid}>{groups.map(([label, items]) => <div key={label}><strong>{label}</strong>{items.length ? items.map((item, index) => <p key={index}>{longitudinalActionLabel(item.action, locale)} · {[presentLongitudinalDecision(item, state, locale), ...presentDecisionDetails(item, locale)].join(" · ")}</p>) : <small>{t("لا يوجد", "None")}</small>}</div>)}</div></section>;
}

function canonicalMapStrokes(value: unknown): MapStroke[] {
  return list(object(value).strokes).map((stroke) => ({
    radius: typeof stroke.radius === "number" ? stroke.radius : 0.012,
    points: Array.isArray(stroke.points)
      ? stroke.points.flatMap((candidate) => {
          const point = object(candidate);
          return typeof point.x === "number" && typeof point.y === "number" ? [{ x: point.x, y: point.y }] : [];
        })
      : [],
  }));
}

function ReadOnlyAnatomicalMap({ value, locale, mode = "FINALIZED" }: { value: unknown; locale: "ar" | "en"; mode?: "REVIEW" | "FINALIZED" }) {
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const labels: Record<string, { ar: string; en: string }> = {
    FRONT: { ar: "أمامي", en: "Front" }, TOP: { ar: "علوي", en: "Top" },
    RIGHT_SIDE: { ar: "الجانب الأيمن", en: "Right side" }, LEFT_SIDE: { ar: "الجانب الأيسر", en: "Left side" },
  };
  const path = (points: MapPoint[]) => points.map((item) => `${item.x * 600},${item.y * 300}`).join(" ");
  return <div className={styles.readOnlyMapGrid} aria-label={mode === "FINALIZED" ? t("الخريطة التشريحية المعتمدة للقراءة فقط", "Finalized read-only Anatomical Map") : t("معاينة الخريطة التشريحية قبل الاعتماد", "Pre-Finalize Anatomical Map preview")}>
    {readOnlyAnatomicalMapViews(value).filter((view) => view.regions.length > 0).map((view) => <article key={view.view}>
      <h5>{labels[view.view][locale]}</h5>
      <svg viewBox="0 0 600 300" role="img" data-read-only="true" aria-label={`${labels[view.view][locale]} · ${mode === "FINALIZED" ? t("رسم معتمد للقراءة فقط", "finalized read-only drawing") : t("معاينة الرسم", "drawing preview")}`}>
        <rect x="1" y="1" width="598" height="298" rx="28" className={styles.mapSurface} />
        <image href={ANATOMICAL_MAP_ASSETS[view.view as (typeof PHYSICIAN_ANATOMICAL_MAP_VIEWS)[number]]} x="0" y="0" width="600" height="300" preserveAspectRatio="xMidYMid meet" className={styles.anatomicalTemplate} />
        {view.regions.flatMap((region, regionIndex) => canonicalMapStrokes(region.geometry).map((stroke, strokeIndex) => (
          <polyline key={`${regionIndex}:${strokeIndex}`} points={path(stroke.points)} fill="none" stroke={region.displayColorHex ?? "#A86A3D"} strokeWidth={Math.max(3, stroke.radius * 300)} strokeLinecap="round" strokeLinejoin="round" />
        )))}
      </svg>
      {view.regions.length ? <div className={styles.mapRegionSummary}>{view.regions.map((region, index) => <p key={index}><strong>{mode === "REVIEW" && !region.anatomicalRegionCode ? t("غير مكتملة — الهوية التشريحية غير مؤكدة", "Incomplete — anatomical identity not confirmed") : presentAnatomicalRegionLabel(region, locale)}</strong>{region.noteText ? ` — ${region.noteText}` : ""}</p>)}</div> : <small>{t("لا توجد منطقة مسجلة", "No recorded region")}</small>}
    </article>)}
    
  </div>;
}

function FinalizedClinicalPanel({ canonical, locale, workspaceKind }: { canonical: CanonicalRead; locale: "ar" | "en"; workspaceKind: PhysicianClinicalWorkspaceKind }) {
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const data = object(canonical.canonicalClinicalData);
  const examination = object(data.clinicalExamination);
  const measurements = object(data.physicianMeasurements);
  const pattern = object(data.patternMeasurements);
  const trichoscopy = object(data.trichoscopy);
  const map = object(data.anatomicalMap);
  const hairLine = presentHairLineDistance(pattern.hairLineDistance, locale);
  const profile = physicianWorkspaceSectionProfile(workspaceKind);
  return <div className={styles.stack}><section className={`${styles.boundaryBanner} ${styles.finalBoundary}`}><div><span>{t("زيارة معتمدة", "Finalized Visit")}</span><h4>{t("السجل السريري للزيارة", "Visit clinical record")}</h4></div>{canonical.finalizedAt && <time>{formatClinicDateTime(canonical.finalizedAt, locale)}</time>}</section>
    {profile.hairScalpAssessment ? <div className={styles.finalGrid}>{Object.keys(examination).length > 0 && <section><h4>{t("الفحص", "Examination")}</h4><p>{t("شد الشعر", "Hair Pull")}: {hairPullLabel(examination.hairPull, locale)}</p><p>{t("تفرقة الشعر", "Hair Parting")}: {Array.isArray(examination.hairParting) ? examination.hairParting.map((item) => hairPartingLabel(item, locale)).join(" · ") : "—"}</p></section>}{Object.keys(measurements).length > 0 && <section><h4>{t("القياسات", "Measurements")}</h4>{Object.entries(measurements).map(([code, value]) => <p key={code}>{MEASUREMENT_LABELS[code]?.[locale] ?? code}: {localeNumber(Number(value), locale)}/{localeNumber(5, locale)}</p>)}</section>}{Object.keys(pattern).length > 0 && <section><h4>{t("النمط", "Pattern")}</h4><p>{t("درجة سنكلير", "Sinclair grade")}: {typeof pattern.sinclair === "number" ? localeNumber(pattern.sinclair, locale) : "—"}</p><p dir="ltr">MCU/FV: {text(object(pattern.mcuFv).displayCode) || "—"}</p><div className={styles.finalHairLine}><strong>{t("مسافة خط الشعر", "Hair-line distance")}</strong>{hairLine.length ? hairLine.map((item) => <p key={item.position}>{item.label} — {item.value}</p>) : <p>—</p>}</div></section>}{(Array.isArray(trichoscopy.selectedFindings) && trichoscopy.selectedFindings.length > 0 || text(trichoscopy.otherFindingText)) && <section><h4>{t("منظار الشعر", "Trichoscopy")}</h4><p>{Array.isArray(trichoscopy.selectedFindings) ? trichoscopy.selectedFindings.map((item) => locale === "ar" ? TRICHOSCOPY_AR[text(object(item).code)] : text(object(item).label)).filter(Boolean).join(" · ") : t("غير مسجل", "Not recorded")}</p><p dir="auto">{text(trichoscopy.otherFindingText)}</p></section>}{Array.isArray(map.regions) && map.regions.length > 0 && <section className={styles.finalMapSection}><h4>{t("الخريطة التشريحية", "Anatomical Map")}</h4><ReadOnlyAnatomicalMap value={map} locale={locale} /></section>}</div> : <section className={styles.sectionCard}><p>{workspaceKind === "HAIR_QUALITY" ? t("سجل زيارة جودة الشعر المعتمد. تظهر قرارات الطبيب الخاصة بهذه الزيارة أدناه.", "Finalized Hair Quality Visit. The physician decisions from this Visit appear below.") : t("يعرض السجل المعتمد قرارات الطبيب الخاصة بهذه الخدمة أدناه.", "The finalized record shows the physician decisions for this service below.")}</p></section>}
  </div>;
}

function FinalizePanel({ sections, canonical, locale, workspaceKind, isPhysician, canFinalize, busy, onFinalize, visitId, runAction }: {
  sections: WorkspaceDraftSections; canonical: CanonicalRead | null; locale: "ar" | "en"; workspaceKind: PhysicianClinicalWorkspaceKind; isPhysician: boolean; canFinalize: boolean; busy: string | null; onFinalize: () => void; visitId: string;
  runAction: (name: string, url: string, init: RequestInit, success?: string) => Promise<unknown>;
}) {
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const finalized = canonical?.status === "FINALIZED";
  const [addendum, setAddendum] = useState("");
  const [addendumType, setAddendumType] = useState("CLARIFICATION");
  const effectiveState = canonical?.effectivePhysicianState ?? { diagnoses: [], treatmentCourses: [], procedurePlans: [], performedProcedures: [] };
  const reviewGroups = buildPreFinalizeReview(sections, effectiveState, locale, TRICHOSCOPY_AR);
  const draftMap = object(sections.ANATOMICAL_MAP);
  const mapIncomplete = hasIncompleteAnatomicalRegion(sections);
  if (finalized) return <div className={styles.stack}><a href={`/physician/visits/${visitId}/hospital-summary`} target="_blank" rel="noopener noreferrer" className="button button--secondary">Hospital Summary PDF</a><FinalizedClinicalPanel canonical={canonical} locale={locale} workspaceKind={workspaceKind} /><VisitDecisionList decisions={canonical.visitDecisions} state={effectiveState} locale={locale} />
    <section className={styles.sectionCard}><h4>{canonical.correction?.eligible ? t("نافذة التصحيح المباشر مفتوحة", "Direct-correction window is open") : t("انتهت مهلة التصحيح", "Correction period ended")}</h4>{canonical.correction && <p>{t("الموعد النهائي", "Deadline")}: {formatClinicDateTime(canonical.correction.deadline, locale)}</p>}{canonical.correction?.eligible ? <CorrectionForm locale={locale} busy={busy} onSubmit={(command) => void runAction("correction", `/api/physician/visits/${visitId}/corrections`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) }, t("تم حفظ التصحيح.", "Correction saved."))} /> : <div className={styles.addendumForm}><select value={addendumType} onChange={(event) => setAddendumType(event.target.value)}><option value="CLARIFICATION">{t("إيضاح", "Clarification")}</option><option value="ADDITIONAL_DOCUMENTATION">{t("توثيق إضافي", "Additional documentation")}</option><option value="CORRECTION">{t("ملحق تصحيحي", "Correction addendum")}</option></select><textarea value={addendum} onChange={(event) => setAddendum(event.target.value)} /><button className="button button--secondary" type="button" disabled={Boolean(busy) || !addendum.trim()} onClick={() => void runAction("addendum", `/api/physician/visits/${visitId}/addenda`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: addendumType, content: addendum }) }, t("أضيف الملحق.", "Addendum added."))}>{t("إضافة ملحق منفصل", "Add separate Addendum")}</button></div>}</section>
  </div>;
  return <div className={styles.stack}>
    <section className={styles.sectionCard}>
      <h4>{t("ملخص زيارة اليوم", "Today's Visit summary")}</h4>
      {!reviewGroups.length && <p>{t("لم يُسجل محتوى سريري بعد. عُد إلى زيارة اليوم للتوثيق.", "No clinical content recorded yet. Return to Today's Visit to document the assessment.")}</p>}
      <div className={styles.reviewDetails}>{reviewGroups.filter((group) => group.key !== "ANATOMICAL_MAP").map((group) => <article key={group.key}><h5>{group.label}</h5>{group.items.map((item, index) => <p dir="auto" key={`${group.key}:${index}`}>{item}</p>)}</article>)}</div>
      {Array.isArray(draftMap.regions) && draftMap.regions.length > 0 && <section className={styles.reviewMap}><h4>{t("الخريطة التشريحية", "Anatomical Map")}</h4><ReadOnlyAnatomicalMap value={draftMap} locale={locale} mode="REVIEW" /></section>}
    </section>
    {mapIncomplete && <div className={`${styles.notice} ${styles.error}`} role="alert">{t("أكّد الهوية التشريحية لكل منطقة مرسومة قبل اعتماد الزيارة.", "Confirm the anatomical identity of every drawn region before finalizing the Visit.")}</div>}
    {!canFinalize && !mapIncomplete && <p role="status">{t("ابدأ المقابلة وأكمل الإدخالات غير المكتملة وتأكد من الحفظ قبل الاعتماد.", "Begin the encounter, complete unfinished entries, and ensure changes are saved before finalizing.")}</p>}
    <section className={styles.finalizeAction}><div><h4>{t("اعتماد الزيارة", "Finalize Visit")}</h4><p>{t("راجع المحتوى أعلاه قبل الاعتماد.", "Review the content above before finalizing.")}</p></div>{isPhysician ? <button type="button" className="button button--primary" disabled={!canFinalize || Boolean(busy)} onClick={onFinalize}>{t("اعتماد الزيارة نهائيًا", "Finalize Visit")}</button> : <span>{t("يتطلب طبيبًا", "Physician required")}</span>}</section>
  </div>;
}

function CorrectionForm({ locale, busy, onSubmit }: { locale: "ar" | "en"; busy: string | null; onSubmit: (command: Record<string, unknown>) => void }) {
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const [target, setTarget] = useState("HAIR_PULL");
  const [operation, setOperation] = useState("SET");
  const [value, setValue] = useState("NOT_RECORDED");
  const [metric, setMetric] = useState("SHEDDING");
  function submit() {
    if (operation === "OMIT") {
      onSubmit(target === "PHYSICIAN_MEASUREMENT" ? { target, metric, operation } : { target, operation });
      return;
    }
    if (target === "HAIR_PULL") onSubmit({ target, operation, value });
    else if (target === "PHYSICIAN_MEASUREMENT") onSubmit({ target, metric, operation, value: Number(value) });
    else onSubmit({ target, operation, value: Number(value) });
  }
  return <div className={styles.correctionForm}>
    <p>{t("يمكن تصحيح الحقول المتاحة أدناه خلال نافذة التصحيح.", "Correct the available fields below during the correction window.")}</p>
    <select value={target} onChange={(event) => { const next = event.target.value; setTarget(next); setValue(next === "HAIR_PULL" ? "NOT_RECORDED" : next === "SINCLAIR" ? "1" : "0"); }}><option value="HAIR_PULL">{t("اختبار شد الشعر", "Hair Pull")}</option><option value="PHYSICIAN_MEASUREMENT">{t("قياس الطبيب", "Physician Measurement")}</option><option value="SINCLAIR">{t("درجة سنكلير", "Sinclair grade")}</option></select>
    {target === "PHYSICIAN_MEASUREMENT" && <select value={metric} onChange={(event) => setMetric(event.target.value)}>{PHYSICIAN_MEASUREMENT_CODES.map((code) => <option value={code} key={code}>{MEASUREMENT_LABELS[code][locale]}</option>)}</select>}
    <select value={operation} onChange={(event) => setOperation(event.target.value)}><option value="SET">{t("تعيين قيمة", "Set")}</option><option value="OMIT">{t("حذف القيمة", "Omit")}</option></select>
    {operation === "SET" && (target === "HAIR_PULL" ? <select value={value} onChange={(event) => setValue(event.target.value)}><option value="POSITIVE">{t("إيجابي", "Positive")}</option><option value="NEGATIVE">{t("سلبي", "Negative")}</option><option value="NOT_RECORDED">{t("غير مسجل", "Not recorded")}</option></select> : <select value={value} onChange={(event) => setValue(event.target.value)}>{(target === "SINCLAIR" ? [1,2,3,4,5] : [0,1,2,3,4,5]).map((item) => <option value={item} key={item}>{localeNumber(item, locale)}</option>)}</select>)}
    <button className="button button--secondary" type="button" disabled={Boolean(busy)} onClick={submit}>{t("تطبيق التصحيح", "Apply correction")}</button>
  </div>;
}
