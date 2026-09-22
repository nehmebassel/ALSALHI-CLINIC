import { formatClinicalApproxDate } from "@/lib/p01/clinical-date";
import { getP01Contract } from "@/lib/p01/contracts";
import type { JsonValue } from "@/lib/patient-access/service";

import type { PhysicianFollowUpSection, PhysicianLocalizedText, PhysicianPresentationAuditSignal } from "./types";

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function local(ar: string, en: string): PhysicianLocalizedText {
  return { ar, en };
}

function optionLabel(questionCode: string, value: unknown): PhysicianLocalizedText | null {
  if (typeof value !== "string") return null;
  const option = getP01Contract(questionCode)?.options?.find((item) => item.code === value);
  return option ? local(option.labelAr, option.labelEn) : null;
}

const SAFE_MISSING_MAPPING = local("قيمة منظمة غير متاحة للعرض", "Structured value unavailable for display");

function plainValue(
  value: unknown,
  auditContext?: { questionCode: string; fieldPath: string },
  reportAuditSignal?: (signal: PhysicianPresentationAuditSignal) => void,
): PhysicianLocalizedText | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? local("نعم", "Yes") : local("لا", "No");
  if (typeof value === "number") return local(String(value), String(value));
  if (typeof value === "string") {
    const known: Record<string, PhysicianLocalizedText> = {
      YES: local("نعم", "Yes"),
      NO: local("لا", "No"),
      NO_CHANGE: local("لا يوجد تغيير", "No change"),
      CHANGED: local("يوجد تغيير", "Changed"),
      STARTED: local("بدأ", "Started"),
      STOPPED: local("أوقف", "Stopped"),
      USAGE_CHANGED: local("تغير الاستخدام/الجرعة", "Use/dose changed"),
      DOSE_OR_USE_CHANGED: local("تغير الاستخدام/الجرعة", "Use/dose changed"),
      NEW_SESSION: local("جلسة جديدة", "New session"),
      NO_NEW_PROCEDURE: local("لا يوجد إجراء جديد", "No new procedure"),
      GOOD: local("استجابة جيدة", "Good response"),
      PARTIAL: local("استجابة جزئية", "Partial response"),
      UNCHANGED: local("دون تغير", "Unchanged"),
      SATISFIED: local("راضٍ عن النتيجة", "Satisfied"),
      NEEDS_REVIEW: local("تحتاج مراجعة", "Needs review"),
      DEFERRED_SAFETY_REVIEW: local("مؤجل لحين مراجعة السلامة", "Deferred pending safety review"),
      NONE: local("لا توجد", "None"),
      TRANSIENT_REDNESS: local("احمرار عابر", "Transient redness"),
      BRUISING: local("كدمات", "Bruising"),
      IMPROVING: local("يتحسن", "Improving"),
      STABLE: local("مستقر", "Stable"),
      UNSURE: local("غير متأكد/ة", "Not sure"),
      "Symptoms became less frequent after treatment.": local("أصبحت الأعراض أقل تكرارًا بعد العلاج.", "Symptoms became less frequent after treatment."),
      "No important change since the prior visit.": local("لا يوجد تغير مهم منذ الزيارة السابقة.", "No important change since the prior visit."),
    };
    if (known[value]) return known[value];
    if (auditContext && (/^[A-Z][A-Z0-9_]{3,}$/.test(value) || /^(?:RV|AP|LASER|Q|P01|SYN)_[A-Z0-9_]+$/.test(value))) {
      reportAuditSignal?.({ code: "MISSING_STRUCTURED_LABEL", ...auditContext });
      return SAFE_MISSING_MAPPING;
    }
    return local(value, value);
  }
  return null;
}

function dateValue(value: unknown): PhysicianLocalizedText | null {
  const looksLikeStructuredDate = isRecord(value)
    && (value.calendar === "GREGORIAN" || value.calendar === "HIJRI")
    && typeof value.precision === "string";
  const looksLikeLegacyDate = typeof value === "string"
    && (value === "UNKNOWN" || /^\d{4}(?:[-\/]\d{1,2})?$/.test(value.trim()) || /^\d{1,2}[-\/]\d{4}$/.test(value.trim()));
  if (!looksLikeStructuredDate && !looksLikeLegacyDate) return null;
  try {
    return local(
      formatClinicalApproxDate(value as JsonValue, "ar"),
      formatClinicalApproxDate(value as JsonValue, "en"),
    );
  } catch {
    return null;
  }
}

function addFact(
  sections: PhysicianFollowUpSection[],
  sectionCode: string,
  title: PhysicianLocalizedText,
  label: PhysicianLocalizedText,
  values: PhysicianLocalizedText[],
  id: string,
) {
  if (values.length === 0) return;
  let section = sections.find((item) => item.code === sectionCode);
  if (!section) {
    section = { code: sectionCode, title, facts: [] };
    sections.push(section);
  }
  section.facts.push({ id, label, values });
}

function namedItems(value: unknown): PhysicianLocalizedText[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const name = typeof item.name === "string" ? item.name : typeof item.itemLabel === "string" ? item.itemLabel : null;
    if (!name) return [];
    const details = typeof item.details === "string" && item.details.trim() ? ` — ${item.details.trim()}` : "";
    return [local(`${name}${details}`, `${name}${details}`)];
  });
}

function procedureItems(value: unknown): PhysicianLocalizedText[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.procedure !== "string") return [];
    const procedure = optionLabel("Q_HAIR_PROCEDURES", item.procedure);
    if (!procedure) return [];
    const count = typeof item.count === "string" && item.count ? ` × ${item.count}` : "";
    return [local(`${procedure.ar}${count}`, `${procedure.en}${count}`)];
  });
}

function triggerItems(value: unknown): PhysicianLocalizedText[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.event !== "string") return [];
    const base = optionLabel("Q_TRIGGER_EVENTS", item.event)
      ?? optionLabel("Q_TRIGGER_EVENTS_FEMALE", item.event)
      ?? optionLabel("Q_TRIGGER_EVENTS_MALE", item.event);
    if (!base) return [];
    const details = typeof item.details === "string" && item.details.trim() ? item.details.trim() : null;
    return [details ? local(`${base.ar} — ${details}`, `${base.en} — ${details}`) : base];
  });
}

export function buildPhysicianFollowUpSections(
  delta: unknown,
  reportAuditSignal?: (signal: PhysicianPresentationAuditSignal) => void,
): PhysicianFollowUpSection[] {
  if (!isRecord(delta)) return [];
  const sections: PhysicianFollowUpSection[] = [];

  const metrics = isRecord(delta.currentMetrics) ? delta.currentMetrics : null;
  if (metrics) {
    const metricDefs = [
      ["SHEDDING", local("تساقط الشعر", "Shedding")],
      ["DENSITY", local("نقص الكثافة", "Density loss")],
      ["ITCH", local("الحكة", "Itch")],
      ["BURNING", local("الحرقان", "Burning")],
      ["SCALP_PAIN", local("ألم فروة الرأس", "Scalp pain")],
    ] as const;
    for (const [code, label] of metricDefs) {
      const raw = metrics[code];
      if (typeof raw === "number") {
        addFact(sections, "CURRENT_METRICS", local("المقاييس الحالية", "Current measures"), label, [local(`${raw}/5`, `${raw}/5`)], `metric:${code}`);
      }
    }
  }

  const generalHealth = isRecord(delta.generalHealth) ? delta.generalHealth : null;
  if (generalHealth) {
    for (const [key, label] of [
      ["chronicConditions", local("أمراض مزمنة جديدة/متغيرة", "New/changed chronic conditions")],
      ["tumors", local("أورام جديدة/متغيرة", "New/changed tumors")],
      ["allergies", local("حساسيات جديدة/متغيرة", "New/changed allergies")],
      ["surgeriesHospitalizations", local("عمليات/تنويم جديد", "New surgeries/hospitalizations")],
    ] as const) {
      addFact(sections, "GENERAL_HEALTH", local("الصحة العامة", "General health"), label, namedItems(generalHealth[key]), `general:${key}`);
    }
  }

  const meds = isRecord(delta.medicationsSupplements) ? delta.medicationsSupplements : null;
  if (meds) {
    addFact(sections, "MEDICATIONS", local("الأدوية والمكملات", "Medications and supplements"), local("أدوية بدأت", "Started medications"), namedItems(meds.startedMedications), "meds:started");
    addFact(sections, "MEDICATIONS", local("الأدوية والمكملات", "Medications and supplements"), local("مكملات بدأت", "Started supplements"), namedItems(meds.startedSupplements), "supplements:started");
    addFact(sections, "MEDICATIONS", local("الأدوية والمكملات", "Medications and supplements"), local("عناصر سابقة تغيرت", "Existing items changed"), namedItems(meds.affectedExisting), "meds:changed");
  }

  const hairTreatments = isRecord(delta.hairTreatments) ? delta.hairTreatments : null;
  if (hairTreatments) {
    addFact(sections, "HAIR_TREATMENTS", local("علاجات الشعر وفروة الرأس", "Hair/scalp treatments"), local("علاجات بدأت", "Treatments started"), namedItems(hairTreatments.started), "hair-treatment:started");
    addFact(sections, "HAIR_TREATMENTS", local("علاجات الشعر وفروة الرأس", "Hair/scalp treatments"), local("علاجات سابقة تغيرت", "Existing treatments changed"), namedItems(hairTreatments.affectedExisting), "hair-treatment:changed");
  }

  const procedures = isRecord(delta.hairProcedures) ? delta.hairProcedures : null;
  if (procedures) {
    addFact(sections, "PROCEDURES", local("الإجراءات والجلسات", "Procedures and sessions"), local("إجراءات جديدة", "New procedures"), procedureItems(procedures.items), "procedures:new");
  }

  const triggers = isRecord(delta.triggerEvents) ? delta.triggerEvents : null;
  if (triggers) {
    addFact(sections, "TRIGGERS", local("الأحداث المحفزة", "Trigger events"), local("أحداث جديدة", "New events"), triggerItems(triggers.items), "triggers:new");
  }

  for (const containerKey of ["sexSpecific", "safety"] as const) {
    const container = isRecord(delta[containerKey]) ? delta[containerKey] : null;
    const responses = container && isRecord(container.responses) ? container.responses : null;
    if (!responses) continue;
    for (const [questionCode, raw] of Object.entries(responses)) {
      const contract = getP01Contract(questionCode);
      const label = contract ? local(contract.localized.ar.label, contract.localized.en.label) : local("تحديث صحي حالي", "Current health update");
      const option = optionLabel(questionCode, raw);
      const value = option ?? dateValue(raw) ?? plainValue(
        raw,
        { questionCode, fieldPath: "followUp.response" },
        reportAuditSignal,
      );
      if (value) addFact(sections, "SEX_SAFETY", local("السياق الصحي الحالي", "Current health context"), label, [value], `${containerKey}:${questionCode}`);
    }
  }

  const quality = isRecord(delta.hairQualityLifestyle) ? delta.hairQualityLifestyle : null;
  if (quality) {
    const text = plainValue(quality.changeText);
    const date = dateValue(quality.changeDate);
    addFact(sections, "HAIR_QUALITY", local("جودة الشعر والعادات", "Hair quality and routine"), local("التغيير المسجل", "Recorded change"), [text, date].filter((item): item is PhysicianLocalizedText => Boolean(item)), "hair-quality:change");
  }

  // Compatibility with compact visit-level delta fields used by the current follow-up fixtures.
  // Presentation remains clinical and does not expose fixture metadata.
  if (Array.isArray(delta.medicationChanges)) {
    const values = delta.medicationChanges.flatMap((item) => {
      const value = plainValue(item, { questionCode: "FOLLOW_UP_DELTA", fieldPath: "medicationChanges" }, reportAuditSignal);
      return value ? [value] : [];
    });
    addFact(sections, "MEDICATIONS", local("الأدوية والمكملات", "Medications and supplements"), local("تغيير الأدوية", "Medication change"), values, "follow-up:medicationChanges");
  }
  if (delta.procedureChange !== undefined) {
    const value = plainValue(delta.procedureChange, { questionCode: "FOLLOW_UP_DELTA", fieldPath: "procedureChange" }, reportAuditSignal);
    if (value) addFact(sections, "PROCEDURES", local("الإجراءات والجلسات", "Procedures and sessions"), local("تغيير الإجراءات", "Procedure change"), [value], "follow-up:procedureChange");
  }

  const qualitySynthetic = isRecord(delta.hairQuality) ? delta.hairQuality : null;
  if (qualitySynthetic) {
    for (const [key, label] of [
      ["routineChanged", local("تغير روتين العناية", "Care routine changed")],
      ["heatUseChanged", local("تغير استخدام الحرارة", "Heat use changed")],
      ["breakageTrend", local("اتجاه التكسر", "Breakage trend")],
    ] as const) {
      const value = plainValue(qualitySynthetic[key], { questionCode: "FOLLOW_UP_DELTA", fieldPath: `hairQuality.${key}` }, reportAuditSignal);
      if (value) addFact(sections, "HAIR_QUALITY", local("جودة الشعر والعادات", "Hair quality and routine"), label, [value], `follow-up:hairQuality:${key}`);
    }
  }

  const dermatology = isRecord(delta.dermatology) ? delta.dermatology : null;
  if (dermatology) {
    const changed = plainValue(dermatology.concernChanged, { questionCode: "FOLLOW_UP_DELTA", fieldPath: "dermatology.concernChanged" }, reportAuditSignal);
    const summary = plainValue(dermatology.changeSummary);
    addFact(sections, "DERMATOLOGY", local("تحديث المشكلة الجلدية", "Dermatology update"), local("التغيير منذ الزيارة السابقة", "Change since previous visit"), [changed, summary].filter((item): item is PhysicianLocalizedText => Boolean(item)), "follow-up:dermatology");
  }

  const laser = isRecord(delta.laser) ? delta.laser : null;
  if (laser) {
    for (const [key, label] of [
      ["newSession", local("جلسة جديدة", "New session")],
      ["response", local("الاستجابة", "Response")],
      ["complication", local("المضاعفات", "Complications")],
    ] as const) {
      const value = plainValue(laser[key], { questionCode: "FOLLOW_UP_DELTA", fieldPath: `laser.${key}` }, reportAuditSignal);
      if (value) addFact(sections, "LASER", local("متابعة الليزر", "Laser follow-up"), label, [value], `follow-up:laser:${key}`);
    }
  }

  const aesthetic = isRecord(delta.aesthetic) ? delta.aesthetic : null;
  if (aesthetic) {
    for (const [key, label] of [
      ["newProcedureOrReview", local("إجراء/مراجعة جديدة", "New procedure/review")],
      ["result", local("النتيجة", "Result")],
      ["complication", local("المضاعفات", "Complications")],
    ] as const) {
      const value = plainValue(aesthetic[key], { questionCode: "FOLLOW_UP_DELTA", fieldPath: `aesthetic.${key}` }, reportAuditSignal);
      if (value) addFact(sections, "AESTHETIC", local("متابعة الإجراءات التجميلية", "Aesthetic follow-up"), label, [value], `follow-up:aesthetic:${key}`);
    }
  }

  return sections;
}

export function buildPhysicianCumulativeFollowUpSections(records: Array<{
  visitId: string;
  visitAt: string;
  delta: unknown;
}>, reportAuditSignal?: (signal: PhysicianPresentationAuditSignal) => void): PhysicianFollowUpSection[] {
  const cumulative: PhysicianFollowUpSection[] = [];
  for (const record of [...records].sort((a, b) =>
    a.visitAt.localeCompare(b.visitAt) || a.visitId.localeCompare(b.visitId),
  )) {
    for (const section of buildPhysicianFollowUpSections(record.delta, reportAuditSignal)) {
      let target = cumulative.find((item) => item.code === section.code);
      if (!target) {
        target = { code: section.code, title: section.title, facts: [] };
        cumulative.push(target);
      }
      target.facts.push(...section.facts.map((fact) => ({
        ...fact,
        id: `${record.visitId}:${fact.id}`,
        sourceVisitId: record.visitId,
        sourceVisitAt: record.visitAt,
      })));
    }
  }
  return cumulative;
}

export function mergeInterviewQuestions(
  baseline: readonly import("./types").PhysicianInterviewQuestion[],
  current: readonly import("./types").PhysicianInterviewQuestion[],
): import("./types").PhysicianInterviewQuestion[] {
  const map = new Map<string, import("./types").PhysicianInterviewQuestion>();
  const keyOf = (question: import("./types").PhysicianInterviewQuestion) => `${question.code}::${question.responseScopeType}::${question.responseScopeKey}`;
  for (const question of baseline) map.set(keyOf(question), question);
  for (const question of current) map.set(keyOf(question), question);
  return [...map.values()];
}
