"use client";

import { ClinicalDatePicker } from "@/app/patient/clinical-date-picker";
import { formatClinicDateTime } from "@/lib/platform/date-time";
import { formatClinicalApproxDate, isClinicalApproxDateValue } from "@/lib/p01/clinical-date";
import { FOLLOW_UP_COPY } from "@/lib/follow-up/copy";
import { followUpDeltaCompletionIssues, followUpSafetyCompletionIssues } from "@/lib/follow-up/delta";
import { followUpSexSpecificCompletionIssues, visibleFollowUpSexSpecificContracts } from "@/lib/follow-up/sex-specific";
import { requiredFollowUpChangeKeys, requiredFollowUpSafetyQuestionCodes } from "@/lib/follow-up/lifecycle";
import {
  selectedEpisodeState,
  type FollowUpChangeState,
  type FollowUpDeltaState,
  type FollowUpExistingItemChange,
  type FollowUpItemChangeAction,
  type FollowUpNamedHistoryItem,
  type FollowUpNewHairTreatment,
  type FollowUpNewProcedure,
  type FollowUpTriggerEvent,
  type P01FollowUpContext,
} from "@/lib/follow-up/types";
import { getP01Contract, type P01QuestionContract } from "@/lib/p01/contracts";
import { localizeDigits, localeNumber, toAsciiDigits } from "@/lib/p01/locale";
import type { P01Locale } from "@/lib/p01/engine";
import type { JsonValue } from "@/lib/patient-access/service";
import { isRawDisplayToken, localizedSystemValue } from "@/lib/presentation/display-contract";

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function itemName(value: JsonValue): string | null {
  if (!isRecord(value)) return null;
  for (const key of ["name", "procedure", "event", "treatment"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key] as string;
  }
  return null;
}

const PATIENT_WIDE_PRIOR_CODES = new Set([
  "Q_HEALTH_MEDICATION_ITEMS",
  "Q_HEALTH_SUPPLEMENT_ITEMS",
]);

type PriorSnapshotItem = {
  entry: P01FollowUpContext["snapshot"]["entries"][number];
  item: JsonValue;
  label: string;
  key: string;
  itemIndex?: number;
};

function priorEntries(context: P01FollowUpContext, questionCodes: string[]): PriorSnapshotItem[] {
  const items: PriorSnapshotItem[] = [];
  for (const entry of context.snapshot.entries) {
    if (!questionCodes.includes(entry.questionCode)) continue;
    // Regular medications and supplements are patient-wide longitudinal state.
    // Hair/scalp treatments remain tied to the selected clinical episode.
    if (
      !PATIENT_WIDE_PRIOR_CODES.has(entry.questionCode) &&
      context.selectedEpisodeId &&
      entry.sourceEpisodeId &&
      entry.sourceEpisodeId !== context.selectedEpisodeId
    ) continue;
    if (Array.isArray(entry.value)) {
      entry.value.forEach((item, index) => {
        const label = itemName(item);
        if (label) items.push({ entry, item, label, key: `${entry.sourceResponseId}:${index}`, itemIndex: index });
      });
      continue;
    }
    const label = itemName(entry.value);
    if (label) items.push({ entry, item: entry.value, label, key: entry.sourceResponseId });
  }
  return items;
}

function optionList(questionCode: string, excluded: string[] = []) {
  return (getP01Contract(questionCode)?.options ?? []).filter((option) => !excluded.includes(option.code));
}

export function FollowUpDeltaStep({
  locale,
  context,
  additional,
  onChangeGate,
  onDelta,
  onAdditional,
}: {
  locale: P01Locale;
  context: P01FollowUpContext;
  additional: string[];
  onChangeGate: (key: keyof FollowUpChangeState, value: FollowUpChangeState[keyof FollowUpChangeState]) => void;
  onDelta: (delta: FollowUpDeltaState) => void;
  onAdditional: (value: JsonValue) => void;
}) {
  const isAr = locale === "ar";
  const primary = context.selectedPrimaryReasonCode ?? null;
  const required = requiredFollowUpChangeKeys(primary, context.identity.sex, selectedEpisodeState(context));
  const changes = context.changes ?? {};
  const delta = context.delta ?? {};
  const issues = new Set([
    ...followUpDeltaCompletionIssues(changes, delta, primary),
    ...followUpSafetyCompletionIssues(context, delta),
    ...followUpSexSpecificCompletionIssues(context, delta),
  ]);
  const safetyQuestionCodes = requiredFollowUpSafetyQuestionCodes(context.identity.sex, selectedEpisodeState(context));

  function setDomain<K extends keyof FollowUpDeltaState>(key: K, value: FollowUpDeltaState[K]) {
    onDelta({ ...delta, [key]: value });
  }

  function gate(
    key: keyof FollowUpChangeState,
    copy: { ar: string; en: string },
    options: Array<{ code: string; ar: string; en: string }>,
    detail?: React.ReactNode,
  ) {
    if (!required.includes(key)) return null;
    const current = changes[key];
    const currentCode = typeof current === "string" ? current : undefined;
    return (
      <section className={`follow-up-domain-card${issues.has(key) ? " follow-up-domain-card--invalid" : ""}`} key={key}>
        <div className="follow-up-domain-header"><strong>{isAr ? copy.ar : copy.en}</strong></div>
        <div className="follow-up-answer-grid">
          {options.map((option) => (
            <button
              aria-pressed={currentCode === option.code}
              className={currentCode === option.code ? "choice-chip choice-chip--selected" : "choice-chip"}
              key={option.code}
              onClick={() => onChangeGate(key, option.code as FollowUpChangeState[typeof key])}
              type="button"
            >
              {isAr ? option.ar : option.en}
            </button>
          ))}
        </div>
        {detail}
        {issues.has(key) && currentCode && !["NO_CHANGE", "NO", "UNSURE"].includes(currentCode) && (
          <p className="field-error">{isAr ? "أكمل تفاصيل التغيير قبل المتابعة." : "Complete the change details before continuing."}</p>
        )}
      </section>
    );
  }

  function itemActionGate(
    key: "medicationsSupplements" | "hairTreatments",
    copy: { ar: string; en: string },
    labels: Record<FollowUpItemChangeAction, { ar: string; en: string }>,
    detail?: React.ReactNode,
  ) {
    if (!required.includes(key)) return null;
    const current = changes[key];
    const actions: FollowUpItemChangeAction[] = Array.isArray(current) ? current : [];
    const noChange = current === "NO_CHANGE";
    const order: FollowUpItemChangeAction[] = ["STARTED", "STOPPED", "USAGE_CHANGED"];

    function toggle(action: FollowUpItemChangeAction) {
      const next = actions.includes(action) ? actions.filter((item) => item !== action) : [...actions, action];
      onChangeGate(key, next);
    }

    return (
      <section className={`follow-up-domain-card${issues.has(key) ? " follow-up-domain-card--invalid" : ""}`} key={key}>
        <div className="follow-up-domain-header"><strong>{isAr ? copy.ar : copy.en}</strong></div>
        <p className="delta-help">{isAr ? "يمكن اختيار أكثر من تغيير إذا حدثت أشياء مختلفة منذ آخر زيارة." : "You can select more than one change if different things happened since the last visit."}</p>
        <div className="follow-up-answer-grid">
          <button aria-pressed={noChange} className={noChange ? "choice-chip choice-chip--selected" : "choice-chip"} onClick={() => onChangeGate(key, "NO_CHANGE")} type="button">
            {isAr ? "لا يوجد تغيير" : "No change"}
          </button>
          {order.map((action) => (
            <button aria-pressed={actions.includes(action)} className={actions.includes(action) ? "choice-chip choice-chip--selected" : "choice-chip"} key={action} onClick={() => toggle(action)} type="button">
              {isAr ? labels[action].ar : labels[action].en}
            </button>
          ))}
        </div>
        {actions.length > 0 ? detail : null}
        {issues.has(key) && actions.length > 0 && (
          <p className="field-error">{isAr ? "أكمل تفاصيل كل تغيير اخترته قبل المتابعة." : "Complete the details for each selected change before continuing."}</p>
        )}
      </section>
    );
  }

  const allowedAdditional = [
    ...(primary !== "RV_LASER" ? [{ code: "RV_LASER", ar: "الليزر", en: "Laser" }] : []),
    ...(primary !== "RV_AESTHETIC_PROCEDURES" ? [{ code: "RV_AESTHETIC_PROCEDURES", ar: "الإجراءات التجميلية", en: "Aesthetic Procedures" }] : []),
  ];

  function toggleAdditional(code: string) {
    onAdditional(additional.includes(code) ? additional.filter((item) => item !== code) : [...additional, code]);
  }

  const selectedEpisode = context.episodes.find((item) => item.id === context.selectedEpisodeId);

  return (
    <div className="follow-up-stack">
      <section className="follow-up-visit-banner" aria-label={isAr ? "بيانات المتابعة" : "Follow-up context"}>
        <div className="follow-up-visit-banner__main">
          <span>{isAr ? "متابعة" : "Follow-up"}</span>
          <strong>{isAr ? selectedEpisode?.labelAr : selectedEpisode?.labelEn}</strong>
        </div>
        {selectedEpisode?.lastVisitAt && (
          <time dateTime={selectedEpisode.lastVisitAt}>
            {isAr ? "آخر زيارة" : "Last visit"}: {formatClinicDateTime(selectedEpisode.lastVisitAt, locale)}
          </time>
        )}
        <p>{isAr ? "حدّث فقط ما تغيّر منذ الزيارة السابقة. لن نعيد أسئلة التاريخ المسجل." : "Update only what changed since the previous visit. We will not repeat recorded history."}</p>
      </section>

      <div className="follow-up-domain-list">
        {gate("generalHealth", FOLLOW_UP_COPY.generalHealth, [
          { code: "NO_CHANGE", ar: "لا، لا يوجد تغيير", en: "No change" },
          { code: "CHANGED", ar: "نعم، حدث تغيير", en: "Yes, something changed" },
        ], changes.generalHealth === "CHANGED" ? (
          <GeneralHealthDelta locale={locale} value={delta.generalHealth} onChange={(value) => setDomain("generalHealth", value)} />
        ) : null)}

        {itemActionGate("medicationsSupplements", FOLLOW_UP_COPY.medicationsSupplements, {
          STARTED: { ar: "بدأت شيئًا جديدًا", en: "Started something new" },
          STOPPED: { ar: "أوقفت شيئًا", en: "Stopped something" },
          USAGE_CHANGED: { ar: "تغيرت الجرعة أو طريقة الاستخدام", en: "Dose or use changed" },
        }, Array.isArray(changes.medicationsSupplements) ? (
          <MedicationDelta locale={locale} context={context} actions={changes.medicationsSupplements} value={delta.medicationsSupplements} onChange={(value) => setDomain("medicationsSupplements", value)} />
        ) : null)}

        {itemActionGate("hairTreatments", FOLLOW_UP_COPY.hairTreatments, {
          STARTED: { ar: "بدأت علاجًا أو دواءً جديدًا", en: "Started a new treatment or medication" },
          STOPPED: { ar: "أوقفت علاجًا أو دواءً", en: "Stopped a treatment or medication" },
          USAGE_CHANGED: { ar: "تغير استخدام علاج أو دواء موجود", en: "Use of an existing treatment changed" },
        }, Array.isArray(changes.hairTreatments) ? (
          <HairTreatmentDelta locale={locale} context={context} actions={changes.hairTreatments} value={delta.hairTreatments} onChange={(value) => setDomain("hairTreatments", value)} />
        ) : null)}

        {gate("hairProcedures", FOLLOW_UP_COPY.hairProcedures, [
          { code: "NO", ar: "لا", en: "No" },
          { code: "YES", ar: "نعم", en: "Yes" },
        ], changes.hairProcedures === "YES" ? (
          <ProcedureDelta locale={locale} context={context} value={delta.hairProcedures} onChange={(value) => setDomain("hairProcedures", value)} />
        ) : null)}

        {gate("triggerEvents", FOLLOW_UP_COPY.triggerEvents, [
          { code: "NO", ar: "لا", en: "No" },
          { code: "YES", ar: "نعم", en: "Yes" },
          { code: "UNSURE", ar: "غير متأكد", en: "Not sure" },
        ], changes.triggerEvents === "YES" ? (
          <TriggerDelta locale={locale} sex={context.identity.sex} value={delta.triggerEvents} onChange={(value) => setDomain("triggerEvents", value)} />
        ) : null)}

        {gate("sexSpecific", FOLLOW_UP_COPY.sexSpecific, [
          { code: "NO_CHANGE", ar: "لا يوجد تغيير", en: "No change" },
          { code: "CHANGED", ar: "نعم", en: "Yes" },
        ], changes.sexSpecific === "CHANGED" ? (
          <SexSpecificDelta locale={locale} context={context} value={delta.sexSpecific} issues={issues} onChange={(value) => setDomain("sexSpecific", value)} />
        ) : null)}

        {gate("hairQualityLifestyle", FOLLOW_UP_COPY.hairQualityLifestyle, [
          { code: "NO_CHANGE", ar: "لا", en: "No" },
          { code: "CHANGED", ar: "نعم", en: "Yes" },
        ], changes.hairQualityLifestyle === "CHANGED" ? (
          <HairQualityDelta locale={locale} value={delta.hairQualityLifestyle} onChange={(value) => setDomain("hairQualityLifestyle", value)} />
        ) : null)}
      </div>

      {safetyQuestionCodes.length > 0 && (
        <SafetyDelta locale={locale} questionCodes={safetyQuestionCodes} value={delta.safety} issues={issues} onChange={(value) => setDomain("safety", value)} />
      )}

      {allowedAdditional.length > 0 && (
        <section className="follow-up-additional-card">
          <strong>{isAr ? FOLLOW_UP_COPY.additional.ar : FOLLOW_UP_COPY.additional.en}</strong>
          <div className="follow-up-answer-grid follow-up-answer-grid--compact">
            {allowedAdditional.map((option) => (
              <button aria-pressed={additional.includes(option.code)} className={additional.includes(option.code) ? "choice-chip choice-chip--selected" : "choice-chip"} key={option.code} onClick={() => toggleAdditional(option.code)} type="button">
                {isAr ? option.ar : option.en}
              </button>
            ))}
            <button aria-pressed={additional.length === 0} className={additional.length === 0 ? "choice-chip choice-chip--selected" : "choice-chip"} onClick={() => onAdditional([])} type="button">
              {isAr ? "لا أرغب بإضافة خدمة" : "No additional service"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function SafetyChoiceQuestion({
  locale,
  code,
  responses,
  issues,
  onResponse,
}: {
  locale: P01Locale;
  code: string;
  responses: Record<string, JsonValue>;
  issues: Set<string>;
  onResponse: (code: string, next: JsonValue) => void;
}) {
  const isAr = locale === "ar";
  const contract = getP01Contract(code);
  if (!contract) return null;
  const current = typeof responses[code] === "string" ? responses[code] as string : "";
  return (
    <div className={`follow-up-safety-question${issues.has(`safety:${code}`) ? " follow-up-field--invalid" : ""}`}>
      <strong>{isAr ? contract.localized.ar.label : contract.localized.en.label}</strong>
      <div className="follow-up-answer-grid">
        {(contract.options ?? []).map((option) => (
          <button
            type="button"
            aria-pressed={current === option.code}
            key={option.code}
            className={current === option.code ? "choice-chip choice-chip--selected" : "choice-chip"}
            onClick={() => onResponse(code, option.code)}
          >
            {localizeDigits(isAr ? option.labelAr : option.labelEn, locale)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SafetyDelta({ locale, questionCodes, value, issues, onChange }: { locale: P01Locale; questionCodes: string[]; value: FollowUpDeltaState["safety"]; issues: Set<string>; onChange: (value: NonNullable<FollowUpDeltaState["safety"]>) => void }) {
  const isAr = locale === "ar";
  const responses = value?.responses ?? {};
  const status = typeof responses.Q_PREGNANCY_BREASTFEEDING_STATUS === "string" ? responses.Q_PREGNANCY_BREASTFEEDING_STATUS : "";

  function setResponse(code: string, next: JsonValue) {
    const updated = { ...responses, [code]: next };
    if (code === "Q_PREGNANCY_BREASTFEEDING_STATUS") {
      if (next !== "PREGNANT" && next !== "BOTH") delete updated.Q_PREGNANCY_MONTH;
      if (next !== "BREASTFEEDING" && next !== "BOTH") delete updated.Q_BREASTFEEDING_ONSET;
    }
    onChange({ responses: updated });
  }

  const requireStatus = questionCodes.includes("Q_PREGNANCY_BREASTFEEDING_STATUS");
  const requirePlanning = questionCodes.includes("Q_PREGNANCY_PLANNING");
  const breastfeedingContract = getP01Contract("Q_BREASTFEEDING_ONSET");

  return (
    <section className="follow-up-safety-card">
      <div className="card-heading-row">
        <div>
          <p className="eyebrow">{isAr ? "معلومات حالية" : "Current information"}</p>
          <h2>{isAr ? "تحديث مطلوب لهذه الزيارة" : "Update required for this visit"}</h2>
        </div>
      </div>
      {requireStatus && <SafetyChoiceQuestion locale={locale} code="Q_PREGNANCY_BREASTFEEDING_STATUS" responses={responses} issues={issues} onResponse={setResponse} />}
      {(status === "PREGNANT" || status === "BOTH") && <SafetyChoiceQuestion locale={locale} code="Q_PREGNANCY_MONTH" responses={responses} issues={issues} onResponse={setResponse} />}
      {(status === "BREASTFEEDING" || status === "BOTH") && breastfeedingContract && (
        <div className={`follow-up-safety-question${issues.has("safety:Q_BREASTFEEDING_ONSET") ? " follow-up-field--invalid" : ""}`}>
          <strong>{isAr ? breastfeedingContract.localized.ar.label : breastfeedingContract.localized.en.label}</strong>
          <ClinicalDatePicker locale={locale} value={responses.Q_BREASTFEEDING_ONSET} onChange={(next) => setResponse("Q_BREASTFEEDING_ONSET", next)} />
        </div>
      )}
      {requirePlanning && <SafetyChoiceQuestion locale={locale} code="Q_PREGNANCY_PLANNING" responses={responses} issues={issues} onResponse={setResponse} />}
    </section>
  );
}

function GeneralHealthDelta({ locale, value, onChange }: { locale: P01Locale; value: FollowUpDeltaState["generalHealth"]; onChange: (value: NonNullable<FollowUpDeltaState["generalHealth"]>) => void }) {
  const current = value ?? { chronicConditions: [], tumors: [], allergies: [], surgeriesHospitalizations: [] };
  const branches: Array<{ key: keyof typeof current; ar: string; en: string }> = [
    { key: "chronicConditions", ar: "مرض أو تشخيص صحي جديد", en: "New condition or diagnosis" },
    { key: "tumors", ar: "ورم جديد أو تشخيص متعلق بورم", en: "New tumor or tumor-related diagnosis" },
    { key: "allergies", ar: "حساسية جديدة", en: "New allergy" },
    { key: "surgeriesHospitalizations", ar: "جراحة أو تنويم جديد", en: "New surgery or hospitalization" },
  ];
  return <div className="follow-up-inline-details">{branches.map((branch) => <NamedItemEditor key={branch.key} locale={locale} title={locale === "ar" ? branch.ar : branch.en} items={current[branch.key]} onChange={(items) => onChange({ ...current, [branch.key]: items })} />)}</div>;
}

function NamedItemEditor({ locale, title, items, onChange }: { locale: P01Locale; title: string; items: FollowUpNamedHistoryItem[]; onChange: (items: FollowUpNamedHistoryItem[]) => void }) {
  const isAr = locale === "ar";
  function add() { onChange([...items, { id: uid("history"), name: "" }]); }
  function patch(id: string, next: Partial<FollowUpNamedHistoryItem>) { onChange(items.map((item) => item.id === id ? { ...item, ...next } : item)); }
  return (
    <div className="delta-editor-block">
      <div className="delta-editor-title"><strong>{title}</strong><button type="button" className="button-link" onClick={add}>+ {isAr ? "إضافة" : "Add"}</button></div>
      {items.map((item) => <div className="delta-item-card" key={item.id}>
        <label>{isAr ? "الاسم أو الوصف" : "Name or description"}<input value={item.name} onChange={(event) => patch(item.id, { name: event.target.value })} /></label>
        <label>{isAr ? "التاريخ التقريبي" : "Approximate date"}<ClinicalDatePicker locale={locale} value={item.date} onChange={(date) => patch(item.id, { date })} /></label>
        <label>{isAr ? "تفاصيل إضافية" : "Additional details"}<input value={item.details ?? ""} onChange={(event) => patch(item.id, { details: event.target.value })} /></label>
        <button type="button" className="button-link button-link--danger" onClick={() => onChange(items.filter((candidate) => candidate.id !== item.id))}>{isAr ? "حذف" : "Remove"}</button>
      </div>)}
    </div>
  );
}

function MedicationDelta({ locale, context, actions, value, onChange }: { locale: P01Locale; context: P01FollowUpContext; actions: FollowUpItemChangeAction[]; value: FollowUpDeltaState["medicationsSupplements"]; onChange: (value: NonNullable<FollowUpDeltaState["medicationsSupplements"]>) => void }) {
  const isAr = locale === "ar";
  const current = value ?? { startedMedications: [], startedSupplements: [], affectedExisting: [] };
  const prior = priorEntries(context, ["Q_HEALTH_MEDICATION_ITEMS", "Q_HEALTH_SUPPLEMENT_ITEMS"]);
  return <div className="follow-up-inline-details">
    {actions.includes("STARTED") && <div className="delta-action-group"><NamedItemEditor locale={locale} title={isAr ? "دواء منتظم جديد" : "New regular medication"} items={current.startedMedications} onChange={(items) => onChange({ ...current, startedMedications: items })} /><NamedItemEditor locale={locale} title={isAr ? "فيتامين أو مكمل جديد" : "New vitamin or supplement"} items={current.startedSupplements} onChange={(items) => onChange({ ...current, startedSupplements: items })} /></div>}
    {actions.includes("STOPPED") && <div className="delta-action-group"><strong>{isAr ? "ما الذي أوقفته؟" : "What did you stop?"}</strong><ExistingItemDelta locale={locale} entries={prior} mode="STOPPED" value={current.affectedExisting} onChange={(affectedExisting) => onChange({ ...current, affectedExisting })} /></div>}
    {actions.includes("USAGE_CHANGED") && <div className="delta-action-group"><strong>{isAr ? "ما الذي تغير استخدامه؟" : "What changed in use?"}</strong><ExistingItemDelta locale={locale} entries={prior} mode="USAGE_CHANGED" value={current.affectedExisting} onChange={(affectedExisting) => onChange({ ...current, affectedExisting })} /></div>}
  </div>;
}

function ExistingItemDelta({ locale, entries, mode, value, onChange }: { locale: P01Locale; entries: ReturnType<typeof priorEntries>; mode: "STOPPED" | "USAGE_CHANGED"; value: FollowUpExistingItemChange[]; onChange: (value: FollowUpExistingItemChange[]) => void }) {
  const isAr = locale === "ar";
  if (entries.length === 0) return <p className="follow-up-empty-note">{isAr ? "لا توجد عناصر سابقة مسجلة يمكن اختيارها لهذا التغيير." : "There are no previously recorded items available for this change."}</p>;

  function sameItem(item: FollowUpExistingItemChange, raw: ReturnType<typeof priorEntries>[number]): boolean {
    return item.sourceResponseId === raw.entry.sourceResponseId &&
      item.sourceScopeKey === raw.entry.responseScopeKey &&
      item.sourceItemIndex === raw.itemIndex;
  }

  function toggle(raw: ReturnType<typeof priorEntries>[number]) {
    const existing = value.find((item) => sameItem(item, raw));
    if (existing?.action === mode) return onChange(value.filter((item) => item !== existing));
    const withoutSameItem = value.filter((item) => !sameItem(item, raw));
    onChange([...withoutSameItem, {
      sourceResponseId: raw.entry.sourceResponseId,
      sourceQuestionCode: raw.entry.questionCode,
      sourceScopeKey: raw.entry.responseScopeKey,
      ...(raw.itemIndex !== undefined ? { sourceItemIndex: raw.itemIndex } : {}),
      itemLabel: raw.label,
      action: mode,
    }]);
  }

  function patch(raw: ReturnType<typeof priorEntries>[number], next: Partial<FollowUpExistingItemChange>) {
    onChange(value.map((item) => sameItem(item, raw) && item.action === mode ? { ...item, ...next, action: mode } : item));
  }

  return <div className="follow-up-inline-details"><p className="delta-help">{isAr ? "حدد العنصر الذي طرأ عليه هذا التغيير فقط." : "Select only the item affected by this change."}</p>{entries.map((raw) => {
    const selected = value.find((item) => sameItem(item, raw) && item.action === mode);
    const assignedElsewhere = value.find((item) => sameItem(item, raw) && item.action !== mode);
    return <div className={`delta-existing-card${selected ? " delta-existing-card--selected" : ""}`} key={`${raw.key}:${mode}`}>
      <label className="delta-existing-select"><input type="checkbox" checked={Boolean(selected)} onChange={() => toggle(raw)} /><strong>{raw.label}</strong></label>
      {assignedElsewhere && !selected && <small className="delta-help">{isAr ? "تم تحديد هذا العنصر تحت نوع تغيير آخر. اختياره هنا سينقله إلى هذا التغيير." : "This item is selected under another change type. Selecting it here will move it to this change."}</small>}
      {selected && <div className="delta-existing-details">
        {mode === "STOPPED" && <label>{isAr ? "تاريخ التوقف التقريبي" : "Approximate stop date"}<ClinicalDatePicker locale={locale} value={selected.date} onChange={(date) => patch(raw, { date })} /></label>}
        {mode === "USAGE_CHANGED" && <label>{isAr ? "ما الذي تغير؟" : "What changed?"}<textarea rows={2} value={selected.details ?? ""} onChange={(event) => patch(raw, { details: event.target.value })} /></label>}
      </div>}
    </div>;
  })}</div>;
}

function HairTreatmentDelta({ locale, context, actions, value, onChange }: { locale: P01Locale; context: P01FollowUpContext; actions: FollowUpItemChangeAction[]; value: FollowUpDeltaState["hairTreatments"]; onChange: (value: NonNullable<FollowUpDeltaState["hairTreatments"]>) => void }) {
  const isAr = locale === "ar";
  const current = value ?? { started: [], affectedExisting: [] };
  const prior = priorEntries(context, ["Q_HAIR_TREATMENT_ITEMS"]);
  return <div className="follow-up-inline-details">
    {actions.includes("STARTED") && <div className="delta-action-group"><HairTreatmentEditor locale={locale} items={current.started} onChange={(started) => onChange({ ...current, started })} /></div>}
    {actions.includes("STOPPED") && <div className="delta-action-group"><strong>{isAr ? "ما العلاج أو الدواء الذي أوقفته؟" : "Which treatment or medication did you stop?"}</strong><ExistingItemDelta locale={locale} entries={prior} mode="STOPPED" value={current.affectedExisting} onChange={(affectedExisting) => onChange({ ...current, affectedExisting })} /></div>}
    {actions.includes("USAGE_CHANGED") && <div className="delta-action-group"><strong>{isAr ? "ما العلاج أو الدواء الذي تغير استخدامه؟" : "Which treatment or medication changed in use?"}</strong><ExistingItemDelta locale={locale} entries={prior} mode="USAGE_CHANGED" value={current.affectedExisting} onChange={(affectedExisting) => onChange({ ...current, affectedExisting })} /></div>}
  </div>;
}

function HairTreatmentEditor({ locale, items, onChange }: { locale: P01Locale; items: FollowUpNewHairTreatment[]; onChange: (items: FollowUpNewHairTreatment[]) => void }) {
  const isAr = locale === "ar";
  function add() { onChange([...items, { id: uid("treatment"), name: "", start: null, stillUsing: "YES" }]); }
  function patch(id: string, next: Partial<FollowUpNewHairTreatment>) { onChange(items.map((item) => item.id === id ? { ...item, ...next } : item)); }
  return <div className="follow-up-inline-details"><div className="delta-editor-title"><strong>{isAr ? "العلاج أو الدواء الجديد" : "New treatment or medication"}</strong><button type="button" className="button-link" onClick={add}>+ {isAr ? "إضافة" : "Add"}</button></div>{items.map((item) => <div className="delta-item-card" key={item.id}>
    <label>{isAr ? "اسم العلاج أو الدواء" : "Treatment or medication name"}<input value={item.name} onChange={(event) => patch(item.id, { name: event.target.value })} /></label>
    <label>{isAr ? "تاريخ البداية التقريبي" : "Approximate start date"}<ClinicalDatePicker locale={locale} value={item.start} onChange={(start) => patch(item.id, { start })} /></label>
    <label>{isAr ? "هل ما زلت تستخدمه؟" : "Are you still using it?"}<select value={item.stillUsing} onChange={(event) => patch(item.id, { stillUsing: event.target.value as "YES" | "NO" })}><option value="YES">{isAr ? "نعم" : "Yes"}</option><option value="NO">{isAr ? "لا" : "No"}</option></select></label>
    {item.stillUsing === "NO" && <label>{isAr ? "تاريخ التوقف التقريبي إذا توقفت" : "Approximate stop date if stopped"}<ClinicalDatePicker locale={locale} value={item.stop} onChange={(stop) => patch(item.id, { stop })} /></label>}
    <button type="button" className="button-link button-link--danger" onClick={() => onChange(items.filter((candidate) => candidate.id !== item.id))}>{isAr ? "حذف" : "Remove"}</button>
  </div>)}</div>;
}

function ProcedureDelta({ locale, context, value, onChange }: { locale: P01Locale; context: P01FollowUpContext; value: FollowUpDeltaState["hairProcedures"]; onChange: (value: NonNullable<FollowUpDeltaState["hairProcedures"]>) => void }) {
  const isAr = locale === "ar";
  const items = value?.items ?? [];
  const options = optionList("Q_HAIR_PROCEDURES");
  const prior = priorEntries(context, ["Q_HAIR_PROCEDURE_DETAILS"]);
  const priorCodes = new Set(prior.flatMap((raw) => isRecord(raw.item) && typeof raw.item.procedure === "string" ? [raw.item.procedure] : []));
  const newOptions = options.filter((option) => !priorCodes.has(option.code));

  function samePrior(item: FollowUpNewProcedure, raw: ReturnType<typeof priorEntries>[number]): boolean {
    return item.sourceResponseId === raw.entry.sourceResponseId &&
      item.sourceScopeKey === raw.entry.responseScopeKey &&
      item.sourceItemIndex === raw.itemIndex;
  }

  function priorProcedureCode(raw: ReturnType<typeof priorEntries>[number]): string | null {
    return isRecord(raw.item) && typeof raw.item.procedure === "string" ? raw.item.procedure : null;
  }

  function togglePrior(raw: ReturnType<typeof priorEntries>[number]) {
    const existing = items.find((item) => samePrior(item, raw));
    if (existing) return onChange({ items: items.filter((item) => item !== existing) });
    const procedure = priorProcedureCode(raw);
    if (!procedure) return;
    onChange({ items: [...items, {
      id: `prior-${raw.entry.sourceResponseId}-${raw.itemIndex ?? "single"}`,
      procedure,
      count: "",
      lastDate: null,
      sourceResponseId: raw.entry.sourceResponseId,
      sourceQuestionCode: raw.entry.questionCode,
      sourceScopeKey: raw.entry.responseScopeKey,
      ...(raw.itemIndex !== undefined ? { sourceItemIndex: raw.itemIndex } : {}),
    }] });
  }

  function toggleNew(code: string) {
    const existing = items.find((item) => !item.sourceResponseId && item.procedure === code);
    onChange({ items: existing ? items.filter((item) => item !== existing) : [...items, { id: `new-${code}`, procedure: code, count: "", lastDate: null }] });
  }

  function patch(id: string, next: Partial<FollowUpNewProcedure>) {
    onChange({ items: items.map((item) => item.id === id ? { ...item, ...next } : item) });
  }

  function details(item: FollowUpNewProcedure, label: string) {
    return <div className="delta-item-card" key={item.id}>
      <strong>{label}</strong>
      <label>{isAr ? "عدد الجلسات / العمليات الجديدة منذ آخر زيارة" : "Number of new sessions / procedures since the last visit"}<input inputMode="numeric" value={localizeDigits(item.count, locale)} onChange={(event) => patch(item.id, { count: toAsciiDigits(event.target.value).replace(/[^0-9]/g, "") })} /></label>
      <label>{isAr ? "تاريخ آخر جلسة / عملية جديدة" : "Date of the most recent new session / procedure"}<ClinicalDatePicker locale={locale} value={item.lastDate} onChange={(lastDate) => patch(item.id, { lastDate })} /></label>
    </div>;
  }

  return <div className="follow-up-inline-details">
    {prior.length > 0 && <div className="delta-action-group">
      <strong>{isAr ? "إجراءات مسجلة سابقًا" : "Previously recorded procedures"}</strong>
      <p className="delta-help">{isAr ? "حدد فقط الإجراء الذي أجريت له جلسات أو عمليات إضافية منذ آخر زيارة." : "Select only the procedure for which you had additional sessions or procedures since the last visit."}</p>
      {prior.map((raw) => {
        const code = priorProcedureCode(raw);
        if (!code) return null;
        const selected = items.find((item) => samePrior(item, raw));
        const option = options.find((candidate) => candidate.code === code);
        const label = option ? (isAr ? option.labelAr : option.labelEn) : code;
        return <div className={`delta-existing-card${selected ? " delta-existing-card--selected" : ""}`} key={`procedure:${raw.key}`}>
          <label className="delta-existing-select"><input type="checkbox" checked={Boolean(selected)} onChange={() => togglePrior(raw)} /><strong>{label}</strong></label>
          {selected ? details(selected, label) : null}
        </div>;
      })}
    </div>}
    {newOptions.length > 0 && <div className="delta-action-group">
      <strong>{isAr ? "إجراء جديد غير المسجل سابقًا" : "A new procedure not previously recorded"}</strong>
      <div className="delta-option-grid">{newOptions.map((option) => <button type="button" key={option.code} className={items.some((item) => !item.sourceResponseId && item.procedure === option.code) ? "choice-chip choice-chip--selected" : "choice-chip"} onClick={() => toggleNew(option.code)}>{isAr ? option.labelAr : option.labelEn}</button>)}</div>
      {items.filter((item) => !item.sourceResponseId).map((item) => {
        const option = options.find((candidate) => candidate.code === item.procedure);
        return details(item, isAr ? option?.labelAr ?? item.procedure : option?.labelEn ?? item.procedure);
      })}
    </div>}
  </div>;
}

function TriggerDelta({ locale, sex, value, onChange }: { locale: P01Locale; sex: "MALE" | "FEMALE"; value: FollowUpDeltaState["triggerEvents"]; onChange: (value: NonNullable<FollowUpDeltaState["triggerEvents"]>) => void }) {
  const isAr = locale === "ar";
  const items = value?.items ?? [];
  const base = optionList("Q_TRIGGER_EVENTS", ["NONE_OF_THE_ABOVE"]);
  const sexOptions = sex === "FEMALE" ? optionList("Q_TRIGGER_EVENTS_FEMALE", ["NONE"]) : optionList("Q_TRIGGER_EVENTS_MALE", ["NONE"]);
  const options = [...base, ...sexOptions].filter((option, index, all) => all.findIndex((candidate) => candidate.code === option.code) === index);
  function toggle(code: string) {
    const existing = items.find((item) => item.event === code);
    onChange({ items: existing ? items.filter((item) => item !== existing) : [...items, { id: uid(code), event: code, date: null }] });
  }
  function patch(code: string, next: Partial<FollowUpTriggerEvent>) { onChange({ items: items.map((item) => item.event === code ? { ...item, ...next } : item) }); }
  return <div className="follow-up-inline-details"><div className="delta-option-grid">{options.map((option) => <button type="button" key={option.code} className={items.some((item) => item.event === option.code) ? "choice-chip choice-chip--selected" : "choice-chip"} onClick={() => toggle(option.code)}>{isAr ? option.labelAr : option.labelEn}</button>)}</div>{items.map((item) => {
    const option = options.find((candidate) => candidate.code === item.event);
    return <div className="delta-item-card" key={item.id}><strong>{isAr ? option?.labelAr : option?.labelEn}</strong>{item.event === "OTHER" && <label>{isAr ? "الحدث" : "Event"}<input value={item.details ?? ""} onChange={(event) => patch(item.event, { details: event.target.value })} /></label>}<label>{isAr ? "التاريخ التقريبي" : "Approximate date"}<ClinicalDatePicker locale={locale} value={item.date} onChange={(date) => patch(item.event, { date })} /></label></div>;
  })}</div>;
}

function SexSpecificDelta({ locale, context, value, issues, onChange }: { locale: P01Locale; context: P01FollowUpContext; value: FollowUpDeltaState["sexSpecific"]; issues: Set<string>; onChange: (value: NonNullable<FollowUpDeltaState["sexSpecific"]>) => void }) {
  const isAr = locale === "ar";
  const sex = context.identity.sex;
  const current = value ?? { affectedCodes: [], responses: {} };
  const options = optionList(sex === "FEMALE" ? "Q_WOMENS_HEALTH" : "Q_MENS_HEALTH", ["NONE"]);
  const routed = selectedEpisodeState(context)?.physicianRoutedQuestionCodes ?? [];
  const visibleDetails = visibleFollowUpSexSpecificContracts({
    sex,
    affectedCodes: current.affectedCodes,
    responses: current.responses,
    physicianRoutedQuestionCodes: routed,
  });

  function toggle(code: string) {
    const affectedCodes = current.affectedCodes.includes(code)
      ? current.affectedCodes.filter((item) => item !== code)
      : [...current.affectedCodes, code];
    const stillVisible = new Set(visibleFollowUpSexSpecificContracts({
      sex,
      affectedCodes,
      responses: current.responses,
      physicianRoutedQuestionCodes: routed,
    }).map((contract) => contract.code));
    const responses = Object.fromEntries(Object.entries(current.responses).filter(([questionCode]) => stillVisible.has(questionCode))) as Record<string, JsonValue>;
    onChange({ affectedCodes, responses });
  }

  function setResponse(code: string, next: JsonValue) {
    onChange({ ...current, responses: { ...current.responses, [code]: next } });
  }

  return <div className="follow-up-inline-details">
    <p className="delta-help">{isAr ? "حدد فقط العرض الجديد أو العرض الذي تغير منذ آخر زيارة." : "Select only the symptom that is new or has changed since the last visit."}</p>
    <div className="delta-option-grid">{options.map((option) => <button type="button" key={option.code} className={current.affectedCodes.includes(option.code) ? "choice-chip choice-chip--selected" : "choice-chip"} onClick={() => toggle(option.code)}>{isAr ? option.labelAr : option.labelEn}</button>)}</div>
    {visibleDetails.length > 0 && <div className="delta-governed-details">{visibleDetails.map((contract) => <GovernedDeltaQuestion key={contract.code} locale={locale} contract={contract} value={current.responses[contract.code]} invalid={issues.has(`sexSpecific:${contract.code}`)} onChange={(next) => setResponse(contract.code, next)} />)}</div>}
  </div>;
}

function GovernedDeltaQuestion({ locale, contract, value, invalid, onChange }: { locale: P01Locale; contract: P01QuestionContract; value: JsonValue | undefined; invalid: boolean; onChange: (value: JsonValue) => void }) {
  const isAr = locale === "ar";
  const label = localizeDigits(isAr ? contract.localized.ar.label : contract.localized.en.label, locale);
  const className = `follow-up-governed-question${invalid ? " follow-up-field--invalid" : ""}`;

  if (contract.responseType === "SINGLE_SELECT" || contract.responseType === "BOOLEAN") {
    const current = typeof value === "string" ? value : "";
    return <div className={className}><strong>{label}</strong><div className="follow-up-answer-grid">{(contract.options ?? []).map((option) => <button type="button" aria-pressed={current === option.code} key={option.code} className={current === option.code ? "choice-chip choice-chip--selected" : "choice-chip"} onClick={() => onChange(option.code)}>{localizeDigits(isAr ? option.labelAr : option.labelEn, locale)}</button>)}</div>{invalid && <p className="field-error">{isAr ? "أكمل هذه المعلومة." : "Complete this item."}</p>}</div>;
  }

  if (contract.responseType === "MULTI_SELECT") {
    const current = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    function toggle(optionCode: string) {
      const option = contract.options?.find((item) => item.code === optionCode);
      if (!option) return;
      if (current.includes(optionCode)) return onChange(current.filter((item) => item !== optionCode));
      const next = current.filter((existingCode) => {
        if (option.exclusiveWith?.includes(existingCode)) return false;
        const existing = contract.options?.find((candidate) => candidate.code === existingCode);
        return !existing?.exclusiveWith?.includes(optionCode);
      });
      onChange([...next, optionCode]);
    }
    return <div className={className}><strong>{label}</strong><div className="delta-option-grid">{(contract.options ?? []).map((option) => <button type="button" aria-pressed={current.includes(option.code)} key={option.code} className={current.includes(option.code) ? "choice-chip choice-chip--selected" : "choice-chip"} onClick={() => toggle(option.code)}>{localizeDigits(isAr ? option.labelAr : option.labelEn, locale)}</button>)}</div>{invalid && <p className="field-error">{isAr ? "أكمل هذه المعلومة." : "Complete this item."}</p>}</div>;
  }

  if (contract.responseType === "MONTH_YEAR" || contract.responseType === "YEAR") {
    return <div className={className}><strong>{label}</strong><ClinicalDatePicker locale={locale} value={value} onChange={onChange} />{invalid && <p className="field-error">{isAr ? "أكمل هذه المعلومة." : "Complete this item."}</p>}</div>;
  }

  if (contract.responseType === "DATE") {
    const dateValue = typeof value === "string" ? value : "";
    return <label className={className}><strong>{label}</strong><input type="date" value={dateValue} onChange={(event) => onChange(event.target.value)} />{invalid && <span className="field-error">{isAr ? "أكمل هذه المعلومة." : "Complete this item."}</span>}</label>;
  }

  const textValue = typeof value === "string" ? value : "";
  const multiline = contract.responseType === "LONG_TEXT";
  return <label className={className}><strong>{label}</strong>{multiline ? <textarea rows={3} value={textValue} onChange={(event) => onChange(event.target.value)} /> : <input value={textValue} onChange={(event) => onChange(event.target.value)} />}{invalid && <span className="field-error">{isAr ? "أكمل هذه المعلومة." : "Complete this item."}</span>}</label>;
}

function HairQualityDelta({ locale, value, onChange }: { locale: P01Locale; value: FollowUpDeltaState["hairQualityLifestyle"]; onChange: (value: NonNullable<FollowUpDeltaState["hairQualityLifestyle"]>) => void }) {
  const isAr = locale === "ar";
  const current = value ?? {};
  return <div className="follow-up-inline-details"><label>{isAr ? "ما الذي تغيّر؟" : "What changed?"}<textarea rows={3} value={current.changeText ?? ""} onChange={(event) => onChange({ ...current, changeText: event.target.value })} /></label><label>{isAr ? "متى بدأ التغير؟" : "When did the change begin?"}<ClinicalDatePicker locale={locale} value={current.changeDate} onChange={(changeDate) => onChange({ ...current, changeDate })} /></label></div>;
}

const METRICS = [
  { code: "SHEDDING", ar: "تساقط الشعر", en: "Hair shedding" },
  { code: "DENSITY", ar: "نقص الكثافة", en: "Density loss" },
  { code: "ITCH", ar: "الحكة", en: "Itch" },
  { code: "BURNING", ar: "الحرقان", en: "Burning" },
  { code: "SCALP_PAIN", ar: "ألم فروة الرأس", en: "Scalp pain" },
] as const;

const SCALE = {
  ar: ["لا يوجد", "خفيف جدًا", "خفيف", "متوسط", "شديد", "شديد جدًا"],
  en: ["None", "Very mild", "Mild", "Moderate", "Severe", "Very severe"],
} as const;

const CHANGE_VALUE_LABELS: Record<string, { ar: string; en: string }> = {
  NO_CHANGE: { ar: "لا يوجد تغيير", en: "No change" },
  CHANGED: { ar: "حدث تغيير", en: "Changed" },
  STARTED: { ar: "بدأ شيء جديد", en: "Started something new" },
  STOPPED: { ar: "تم إيقاف شيء", en: "Stopped something" },
  USAGE_CHANGED: { ar: "تغير الاستخدام", en: "Use changed" },
  NO: { ar: "لا", en: "No" },
  YES: { ar: "نعم", en: "Yes" },
  UNSURE: { ar: "غير متأكد", en: "Not sure" },
};

function deltaDate(value: JsonValue | undefined, locale: P01Locale): string | null {
  return isClinicalApproxDateValue(value) ? formatClinicalApproxDate(value, locale) : null;
}

function selectedOptionLabel(questionCode: string, optionCode: string, locale: P01Locale): string {
  const option = optionList(questionCode).find((item) => item.code === optionCode);
  if (option) return locale === "ar" ? option.labelAr : option.labelEn;
  const system = localizedSystemValue(optionCode, locale);
  if (system) return system;
  if (process.env.NODE_ENV !== "production") console.warn("Missing structured display mapping", { questionCode, fieldPath: "$value" });
  return locale === "ar" ? "قيمة منظمة غير متاحة للعرض" : "Structured value unavailable for display";
}

function ReviewList({ items }: { items: Array<string | null | undefined> }) {
  const visible = items.filter((item): item is string => Boolean(item));
  if (visible.length === 0) return null;
  return <ul className="follow-up-review-list">{visible.map((item, index) => <li key={`${item}:${index}`}>{item}</li>)}</ul>;
}

export function FollowUpReviewSummary({ locale, context }: { locale: P01Locale; context: P01FollowUpContext }) {
  const isAr = locale === "ar";
  const changes = context.changes ?? {};
  const delta = context.delta ?? {};
  const groups: React.ReactNode[] = [];

  function status(key: keyof FollowUpChangeState): string {
    const value = changes[key];
    if (Array.isArray(value)) {
      return value.map((action) => CHANGE_VALUE_LABELS[action]?.[locale] ?? localizedSystemValue(action, locale) ?? (isAr ? "قيمة منظمة غير متاحة للعرض" : "Structured value unavailable for display")).join(isAr ? "، " : ", ");
    }
    return value ? CHANGE_VALUE_LABELS[value]?.[locale] ?? localizedSystemValue(value, locale) ?? (isAr ? "قيمة منظمة غير متاحة للعرض" : "Structured value unavailable for display") : (isAr ? "لم تتم الإجابة" : "Not answered");
  }

  function governedResponseSummary(contract: P01QuestionContract, raw: JsonValue | undefined): string | null {
    if (raw === undefined || raw === null || raw === "") return null;
    const label = isAr ? contract.localized.ar.label : contract.localized.en.label;
    if (isClinicalApproxDateValue(raw)) return `${label}: ${formatClinicalApproxDate(raw, locale)}`;
    if (typeof raw === "string") {
      const option = contract.options?.find((item) => item.code === raw);
      const display = option ? (isAr ? option.labelAr : option.labelEn) : localizedSystemValue(raw, locale) ?? (isRawDisplayToken(raw) ? (isAr ? "قيمة منظمة غير متاحة للعرض" : "Structured value unavailable for display") : raw);
      return `${label}: ${localizeDigits(display, locale)}`;
    }
    if (Array.isArray(raw)) {
      const labels = raw.flatMap((code) => {
        if (typeof code !== "string") return [];
        const option = contract.options?.find((item) => item.code === code);
        return [option ? (isAr ? option.labelAr : option.labelEn) : localizedSystemValue(code, locale) ?? (isRawDisplayToken(code) ? (isAr ? "قيمة منظمة غير متاحة للعرض" : "Structured value unavailable for display") : code)];
      });
      return labels.length > 0 ? `${label}: ${labels.join(isAr ? "، " : ", ")}` : null;
    }
    return null;
  }

  if (changes.generalHealth) {
    const health = delta.generalHealth;
    const items = [
      ...(health?.chronicConditions ?? []), ...(health?.tumors ?? []),
      ...(health?.allergies ?? []), ...(health?.surgeriesHospitalizations ?? []),
    ];
    groups.push(<div className="follow-up-review-group" key="generalHealth"><div><strong>{isAr ? FOLLOW_UP_COPY.generalHealth.ar : FOLLOW_UP_COPY.generalHealth.en}</strong><span>{status("generalHealth")}</span></div><ReviewList items={items.map((item) => [item.name, deltaDate(item.date, locale)].filter(Boolean).join(" — "))} /></div>);
  }

  if (changes.medicationsSupplements) {
    const meds = delta.medicationsSupplements;
    groups.push(<div className="follow-up-review-group" key="medicationsSupplements"><div><strong>{isAr ? FOLLOW_UP_COPY.medicationsSupplements.ar : FOLLOW_UP_COPY.medicationsSupplements.en}</strong><span>{status("medicationsSupplements")}</span></div><ReviewList items={[
      ...(meds?.startedMedications ?? []).map((item) => item.name),
      ...(meds?.startedSupplements ?? []).map((item) => item.name),
      ...(meds?.affectedExisting ?? []).map((item) => item.itemLabel),
    ]} /></div>);
  }

  if (changes.hairTreatments) {
    const treatments = delta.hairTreatments;
    groups.push(<div className="follow-up-review-group" key="hairTreatments"><div><strong>{isAr ? FOLLOW_UP_COPY.hairTreatments.ar : FOLLOW_UP_COPY.hairTreatments.en}</strong><span>{status("hairTreatments")}</span></div><ReviewList items={[
      ...(treatments?.started ?? []).map((item) => item.name),
      ...(treatments?.affectedExisting ?? []).map((item) => item.itemLabel),
    ]} /></div>);
  }

  if (changes.hairProcedures) {
    groups.push(<div className="follow-up-review-group" key="hairProcedures"><div><strong>{isAr ? FOLLOW_UP_COPY.hairProcedures.ar : FOLLOW_UP_COPY.hairProcedures.en}</strong><span>{status("hairProcedures")}</span></div><ReviewList items={(delta.hairProcedures?.items ?? []).map((item) => {
      const name = selectedOptionLabel("Q_HAIR_PROCEDURES", item.procedure, locale);
      const date = deltaDate(item.lastDate, locale);
      const count = item.count ? `${localizeDigits(item.count, locale)} ${isAr ? "جديدة" : "new"}` : null;
      return [name, count, date].filter(Boolean).join(" — ");
    })} /></div>);
  }

  if (changes.triggerEvents) {
    groups.push(<div className="follow-up-review-group" key="triggerEvents"><div><strong>{isAr ? FOLLOW_UP_COPY.triggerEvents.ar : FOLLOW_UP_COPY.triggerEvents.en}</strong><span>{status("triggerEvents")}</span></div><ReviewList items={(delta.triggerEvents?.items ?? []).map((item) => {
      const base = getP01Contract("Q_TRIGGER_EVENTS")?.options?.find((option) => option.code === item.event);
      const sexQuestion = context.identity.sex === "FEMALE" ? "Q_TRIGGER_EVENTS_FEMALE" : "Q_TRIGGER_EVENTS_MALE";
      const sexOption = getP01Contract(sexQuestion)?.options?.find((option) => option.code === item.event);
      const option = base ?? sexOption;
      const label = option ? (isAr ? option.labelAr : option.labelEn) : localizedSystemValue(item.event, locale) ?? (isAr ? "قيمة منظمة غير متاحة للعرض" : "Structured value unavailable for display");
      return [label, deltaDate(item.date, locale)].filter(Boolean).join(" — ");
    })} /></div>);
  }

  if (changes.sexSpecific) {
    const q = context.identity.sex === "FEMALE" ? "Q_WOMENS_HEALTH" : "Q_MENS_HEALTH";
    const sexState = delta.sexSpecific ?? { affectedCodes: [], responses: {} };
    const visibleDetails = visibleFollowUpSexSpecificContracts({
      sex: context.identity.sex,
      affectedCodes: sexState.affectedCodes,
      responses: sexState.responses,
      physicianRoutedQuestionCodes: selectedEpisodeState(context)?.physicianRoutedQuestionCodes,
    });
    groups.push(<div className="follow-up-review-group" key="sexSpecific"><div><strong>{isAr ? FOLLOW_UP_COPY.sexSpecific.ar : FOLLOW_UP_COPY.sexSpecific.en}</strong><span>{status("sexSpecific")}</span></div><ReviewList items={[
      ...sexState.affectedCodes.map((code) => selectedOptionLabel(q, code, locale)),
      ...visibleDetails.map((contract) => governedResponseSummary(contract, sexState.responses[contract.code])),
    ]} /></div>);
  }

  if (changes.hairQualityLifestyle) {
    const routine = delta.hairQualityLifestyle;
    groups.push(<div className="follow-up-review-group" key="hairQualityLifestyle"><div><strong>{isAr ? FOLLOW_UP_COPY.hairQualityLifestyle.ar : FOLLOW_UP_COPY.hairQualityLifestyle.en}</strong><span>{status("hairQualityLifestyle")}</span></div><ReviewList items={routine?.changeText ? [[routine.changeText, deltaDate(routine.changeDate, locale)].filter(Boolean).join(" — ")] : []} /></div>);
  }

  const safetyResponses = delta.safety?.responses ?? {};
  const safetyCodes = [
    "Q_PREGNANCY_BREASTFEEDING_STATUS",
    "Q_PREGNANCY_MONTH",
    "Q_BREASTFEEDING_ONSET",
    "Q_PREGNANCY_PLANNING",
  ].filter((code) => safetyResponses[code] !== undefined);
  if (safetyCodes.length > 0) {
    groups.push(<div className="follow-up-review-group" key="safety"><div><strong>{isAr ? "المعلومات الحالية المطلوبة لهذه الزيارة" : "Current information required for this visit"}</strong><span>{isAr ? "محدّثة" : "Updated"}</span></div><ReviewList items={safetyCodes.map((code) => {
      const contract = getP01Contract(code);
      const raw = safetyResponses[code];
      const label = contract ? (isAr ? contract.localized.ar.label : contract.localized.en.label) : code;
      if (isClinicalApproxDateValue(raw)) return `${label}: ${formatClinicalApproxDate(raw, locale)}`;
      if (typeof raw === "string") {
        const option = contract?.options?.find((item) => item.code === raw);
        const value = option ? (isAr ? option.labelAr : option.labelEn) : localizedSystemValue(raw, locale) ?? (isRawDisplayToken(raw) ? (isAr ? "قيمة منظمة غير متاحة للعرض" : "Structured value unavailable for display") : raw);
        return `${label}: ${localizeDigits(value, locale)}`;
      }
      return null;
    })} /></div>);
  }

  const metrics = delta.currentMetrics;
  if (metrics && Object.keys(metrics).length > 0) {
    groups.push(<div className="follow-up-review-group" key="metrics"><div><strong>{isAr ? "المقاييس الحالية" : "Current measures"}</strong><span>{isAr ? "حالة اليوم" : "Today"}</span></div><ReviewList items={METRICS.flatMap((metric) => typeof metrics[metric.code] === "number" ? [`${isAr ? metric.ar : metric.en}: ${localeNumber(metrics[metric.code]!, locale)} — ${SCALE[locale][metrics[metric.code]!]}`] : [])} /></div>);
  }

  if (groups.length === 0) return null;
  return <section className="follow-up-review-summary"><div className="card-heading-row"><div><p className="eyebrow">{isAr ? "متابعة" : "Follow-up"}</p><h2>{isAr ? "راجع ما تم تحديثه لهذه الزيارة" : "Review what was updated for this visit"}</h2></div></div><div className="follow-up-review-groups">{groups}</div></section>;
}

export function FollowUpCurrentMetrics({ locale, context, onDelta }: { locale: P01Locale; context: P01FollowUpContext; onDelta: (delta: FollowUpDeltaState) => void }) {
  const isAr = locale === "ar";
  const delta = context.delta ?? {};
  const metrics = delta.currentMetrics ?? {};
  const issues = new Set(followUpDeltaCompletionIssues(context.changes, delta, context.selectedPrimaryReasonCode ?? null));
  function setMetric(code: typeof METRICS[number]["code"], value: number) { onDelta({ ...delta, currentMetrics: { ...metrics, [code]: value } }); }
  return <div className="follow-up-stack"><section className="follow-up-visit-banner"><div className="follow-up-visit-banner__main"><span>{isAr ? "حالة اليوم" : "Today"}</span><strong>{isAr ? "المقاييس الحالية" : "Current measures"}</strong></div><p>{isAr ? "قيّم ما تلاحظه اليوم فقط. الصفر يعني أن المشكلة غير موجودة، ولا يعني أن الإجابة غير معروفة." : "Rate only what you notice today. Zero means the problem is absent; it does not mean unknown."}</p></section><div className="follow-up-domain-list follow-up-metrics-list">{METRICS.map((metric) => <section className={`follow-up-domain-card${issues.has(`metric:${metric.code}`) ? " follow-up-domain-card--invalid" : ""}`} key={metric.code}><div className="follow-up-domain-header"><strong>{isAr ? metric.ar : metric.en}</strong></div><div className="scale-choice-grid" dir={isAr ? "rtl" : "ltr"}>{SCALE[locale].map((label, index) => <button type="button" dir={isAr ? "rtl" : "ltr"} aria-pressed={metrics[metric.code] === index} key={index} className={metrics[metric.code] === index ? "selected" : ""} onClick={() => setMetric(metric.code, index)}><b>{localeNumber(index, locale)}</b><small>{label}</small></button>)}</div></section>)}</div></div>;
}
