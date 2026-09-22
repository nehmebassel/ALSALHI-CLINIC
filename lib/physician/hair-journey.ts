import { PHYSICIAN_TRICHOSCOPY_FINDINGS } from "./visit-clinical-contracts";
import { presentAnatomicalRegionLabel } from "./visit-workspace";
import {
  compareLongitudinalVisits,
  projectEffectivePhysicianState,
  type ChronologicalDecisionVisit,
} from "./visit-longitudinal-projection";
import type {
  PhysicianHairJourneyEpisode,
  PhysicianLocalizedText,
  PhysicianMeasurementSeries,
  PhysicianTimelineItem,
} from "./types";

export type CanonicalJourneyVisitInput = ChronologicalDecisionVisit & {
  episodeId: string;
  visitType: "INITIAL" | "FOLLOW_UP";
  finalizedAt: Date;
  measurements: Array<{
    code: "SHEDDING" | "DENSITY_LOSS" | "ITCH" | "BURNING" | "SCALP_PAIN";
    value: number;
  }>;
  pattern?: {
    sinclair: number | null;
    mcuFvBasic: string | null;
    mcuFvFrontal: string | null;
    mcuFvVertex: string | null;
    hairLineMidlineCm: number | null;
    hairLineRightSideCm: number | null;
    hairLineLeftSideCm: number | null;
  };
  trichoscopy?: {
    findingCodes: string[];
    otherFindingText: string | null;
  };
  anatomicalMap?: {
    regions: Array<{ view: "FRONT" | "TOP" | "RIGHT_SIDE" | "LEFT_SIDE"; anatomicalRegionCode?: import("./visit-clinical-contracts").PhysicianAnatomicalRegionCode; geometry?: unknown; noteText?: string }>;
  };
};

export type CanonicalJourneyEpisodeInput = {
  episodeId: string;
  primary: PhysicianLocalizedText;
  status: "ACTIVE" | "CLOSED";
  visits: CanonicalJourneyVisitInput[];
};

const MEASUREMENT_LABELS: Record<CanonicalJourneyVisitInput["measurements"][number]["code"], PhysicianLocalizedText> = {
  SHEDDING: { ar: "التساقط", en: "Shedding" },
  DENSITY_LOSS: { ar: "فقدان الكثافة", en: "Density Loss" },
  ITCH: { ar: "الحكة", en: "Itch" },
  BURNING: { ar: "الحرقة", en: "Burning" },
  SCALP_PAIN: { ar: "ألم فروة الرأس", en: "Scalp Pain" },
};

const PROCEDURE_LABELS: Record<string, PhysicianLocalizedText> = {
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
  OTHER: { ar: "إجراء آخر", en: "Other procedure" },
};

const TRICHOSCOPY_LABEL_BY_CODE = new Map<string, string>(
  PHYSICIAN_TRICHOSCOPY_FINDINGS.map((finding) => [finding.code, finding.label] as const),
);

function procedureLabel(code: string, otherText: string | null | undefined): PhysicianLocalizedText {
  if (code === "OTHER" && otherText?.trim()) {
    const exact = otherText.trim();
    return { ar: exact, en: exact };
  }
  return PROCEDURE_LABELS[code] ?? { ar: "إجراء مسجل", en: "Recorded procedure" };
}

function actionTitle(
  kind: "DIAGNOSIS" | "MEDICATION" | "PROCEDURE",
  action: string,
  target: PhysicianLocalizedText,
): PhysicianLocalizedText {
  const labels: Record<string, PhysicianLocalizedText> = {
    ADD: { ar: "إضافة تشخيص", en: "Add diagnosis" },
    REVISE: { ar: "تعديل تشخيص", en: "Revise diagnosis" },
    RESOLVE: { ar: "حل تشخيص", en: "Resolve diagnosis" },
    START: { ar: "بدء علاج", en: "Start treatment" },
    CONTINUE_EXISTING: { ar: "استمرار علاج موثق", en: "Document treatment continuation" },
    MODIFY: { ar: "تعديل علاج", en: "Modify treatment" },
    STOP: { ar: "إيقاف علاج", en: "Stop treatment" },
    PLAN: { ar: "تخطيط إجراء", en: "Plan procedure" },
    PERFORM: { ar: "تنفيذ إجراء", en: "Perform procedure" },
    CANCEL_OR_DEFER: { ar: "إلغاء أو تأجيل إجراء", en: "Cancel or defer procedure" },
  };
  const prefix = labels[action] ?? (
    kind === "DIAGNOSIS"
      ? { ar: "قرار تشخيص", en: "Diagnosis decision" }
      : kind === "MEDICATION"
        ? { ar: "قرار علاجي", en: "Treatment decision" }
        : { ar: "قرار إجراء", en: "Procedure decision" }
  );
  return {
    ar: `${prefix.ar} — ${target.ar}`,
    en: `${prefix.en} — ${target.en}`,
  };
}

function treatmentDescription(value: { regimenText?: string; noteText?: string }): PhysicianLocalizedText | undefined {
  const ar: string[] = [];
  const en: string[] = [];
  if (value.regimenText) {
    ar.push(`النظام: ${value.regimenText}`);
    en.push(`Regimen: ${value.regimenText}`);
  }
  if (value.noteText) {
    ar.push(`ملاحظة: ${value.noteText}`);
    en.push(`Note: ${value.noteText}`);
  }
  return ar.length ? { ar: ar.join(" · "), en: en.join(" · ") } : undefined;
}

function procedureDescription(value: { noteText?: string; plannedDate?: string; performedDate?: string }): PhysicianLocalizedText | undefined {
  const ar: string[] = [];
  const en: string[] = [];
  if (value.plannedDate) {
    ar.push(`تاريخ مخطط: ${value.plannedDate}`);
    en.push(`Planned date: ${value.plannedDate}`);
  }
  if (value.performedDate) {
    ar.push(`تاريخ التنفيذ: ${value.performedDate}`);
    en.push(`Performed date: ${value.performedDate}`);
  }
  if (value.noteText) {
    ar.push(`ملاحظة: ${value.noteText}`);
    en.push(`Note: ${value.noteText}`);
  }
  return ar.length ? { ar: ar.join(" · "), en: en.join(" · ") } : undefined;
}

function timelineForVisits(visits: CanonicalJourneyVisitInput[]): PhysicianTimelineItem[] {
  const chronological = [...visits].sort(compareLongitudinalVisits);
  const prefix: ChronologicalDecisionVisit[] = [];
  const timeline: PhysicianTimelineItem[] = [];

  for (const visit of chronological) {
    prefix.push(visit);
    const state = projectEffectivePhysicianState(prefix);
    const occurredDate = visit.visitOccurredAt.toISOString();

    for (const decision of [...visit.diagnoses].sort((a, b) => a.decisionOrder - b.decisionOrder || a.id.localeCompare(b.id))) {
      const current = state.diagnoses.find((item) => item.diagnosisId === decision.diagnosisId);
      const exact = decision.text ?? current?.text ?? "";
      const target = { ar: exact, en: exact };
      timeline.push({
        id: decision.id,
        type: "DIAGNOSIS",
        visitId: visit.visitId,
        date: occurredDate,
        datePrecision: "DAY",
        title: actionTitle("DIAGNOSIS", decision.action, target),
      });
    }

    for (const decision of [...visit.treatments].sort((a, b) => a.decisionOrder - b.decisionOrder || a.id.localeCompare(b.id))) {
      const current = state.treatmentCourses.find((item) => item.treatmentCourseId === decision.treatmentCourseId);
      const name = decision.name ?? current?.name ?? "";
      const target = { ar: name, en: name };
      const description = treatmentDescription({
        ...(current?.regimenText ? { regimenText: current.regimenText } : {}),
        ...(current?.noteText ? { noteText: current.noteText } : {}),
      });
      timeline.push({
        id: decision.id,
        type: "MEDICATION",
        visitId: visit.visitId,
        date: occurredDate,
        datePrecision: "DAY",
        title: actionTitle("MEDICATION", decision.action, target),
        ...(description ? { description } : {}),
      });
    }

    for (const decision of [...visit.procedures].sort((a, b) => a.decisionOrder - b.decisionOrder || a.id.localeCompare(b.id))) {
      const plan = decision.procedurePlanId
        ? state.procedurePlans.find((item) => item.procedurePlanId === decision.procedurePlanId)
        : undefined;
      const performed = state.performedProcedures.find((item) => item.procedureDecisionId === decision.id);
      const code = decision.procedureCode ?? plan?.procedureCode ?? performed?.procedureCode ?? "OTHER";
      const otherText = decision.otherProcedureText ?? plan?.otherProcedureText ?? performed?.otherProcedureText;
      const target = procedureLabel(code, otherText);
      const description = procedureDescription({
        ...(decision.plannedDate ? { plannedDate: decision.plannedDate.toISOString().slice(0, 10) } : {}),
        ...(decision.performedDate ? { performedDate: decision.performedDate.toISOString().slice(0, 10) } : {}),
        ...(decision.noteText ? { noteText: decision.noteText } : {}),
      });
      timeline.push({
        id: decision.id,
        type: "PROCEDURE",
        visitId: visit.visitId,
        date: occurredDate,
        datePrecision: "DAY",
        title: actionTitle("PROCEDURE", decision.action, target),
        ...(description ? { description } : {}),
      });
    }
  }

  return timeline;
}

function measurementSeriesForVisits(visits: CanonicalJourneyVisitInput[]): PhysicianMeasurementSeries[] {
  const map = new Map<string, PhysicianMeasurementSeries>();
  for (const visit of [...visits].sort(compareLongitudinalVisits)) {
    for (const measurement of visit.measurements) {
      const existing = map.get(measurement.code) ?? {
        code: measurement.code,
        label: MEASUREMENT_LABELS[measurement.code],
        points: [],
      };
      existing.points.push({
        visitId: visit.visitId,
        date: visit.visitOccurredAt.toISOString(),
        value: measurement.value,
      });
      map.set(measurement.code, existing);
    }
  }
  return [...map.values()];
}

function visitReferences(visits: CanonicalJourneyVisitInput[]): PhysicianHairJourneyEpisode["visits"] {
  return [...visits].sort(compareLongitudinalVisits).map((visit) => {
    const pattern = visit.pattern;
    const mcuFvCode = pattern?.mcuFvBasic
      ? `${pattern.mcuFvBasic}${pattern.mcuFvFrontal ?? ""}${pattern.mcuFvVertex ?? ""}`
      : undefined;
    const trichoscopy = visit.trichoscopy;
    const mapViews = (["FRONT", "TOP", "RIGHT_SIDE", "LEFT_SIDE"] as const).map((view) => ({
      view,
      regionCount: visit.anatomicalMap?.regions.filter((region) => region.view === view).length ?? 0,
    }));
    const regionCount = mapViews.reduce((sum, view) => sum + view.regionCount, 0);
    const anatomicalRegions = visit.anatomicalMap?.regions.map((region) => ({
      view: region.view,
      label: {
        ar: presentAnatomicalRegionLabel({ view: region.view, anatomicalRegionCode: region.anatomicalRegionCode, geometry: region.geometry }, "ar"),
        en: presentAnatomicalRegionLabel({ view: region.view, anatomicalRegionCode: region.anatomicalRegionCode, geometry: region.geometry }, "en"),
      },
      ...(region.noteText ? { noteText: region.noteText } : {}),
    })) ?? [];

    return {
      visitId: visit.visitId,
      episodeId: visit.episodeId,
      visitOccurredAt: visit.visitOccurredAt.toISOString(),
      visitType: visit.visitType,
      ...(pattern && (
        pattern.sinclair !== null
        || mcuFvCode
        || pattern.hairLineMidlineCm !== null
        || pattern.hairLineRightSideCm !== null
        || pattern.hairLineLeftSideCm !== null
      ) ? {
        pattern: {
          ...(pattern.sinclair !== null ? { sinclair: pattern.sinclair } : {}),
          ...(mcuFvCode ? { mcuFvCode } : {}),
          ...(pattern.hairLineMidlineCm !== null ? { hairLineMidlineCm: pattern.hairLineMidlineCm } : {}),
          ...(pattern.hairLineRightSideCm !== null ? { hairLineRightSideCm: pattern.hairLineRightSideCm } : {}),
          ...(pattern.hairLineLeftSideCm !== null ? { hairLineLeftSideCm: pattern.hairLineLeftSideCm } : {}),
        },
      } : {}),
      ...(trichoscopy && (trichoscopy.findingCodes.length || trichoscopy.otherFindingText) ? {
        trichoscopy: {
          findingCodes: trichoscopy.findingCodes,
          findingLabels: trichoscopy.findingCodes.map((code) => TRICHOSCOPY_LABEL_BY_CODE.get(code) ?? code),
          ...(trichoscopy.otherFindingText ? { otherFindingText: trichoscopy.otherFindingText } : {}),
        },
      } : {}),
      ...(regionCount > 0 ? { anatomicalMap: { regionCount, views: mapViews, regions: anatomicalRegions } } : {}),
    };
  });
}

export function buildCanonicalPhysicianHairJourney(
  episodes: CanonicalJourneyEpisodeInput[],
): PhysicianHairJourneyEpisode[] {
  return episodes
    .map((episode) => {
      const state = projectEffectivePhysicianState(episode.visits);
      return {
        episodeId: episode.episodeId,
        primary: episode.primary,
        status: episode.status,
        effectiveState: {
          diagnoses: state.diagnoses.map(({ diagnosisId, text, status }) => ({ diagnosisId, text, status })),
          treatmentCourses: state.treatmentCourses.map(({ treatmentCourseId, name, regimenText, noteText, status }) => ({
            treatmentCourseId, name, ...(regimenText ? { regimenText } : {}), ...(noteText ? { noteText } : {}), status,
          })),
          procedurePlans: state.procedurePlans.map(({ procedurePlanId, procedureCode, otherProcedureText, plannedDate, noteText, status }) => ({
            procedurePlanId, procedureCode, ...(otherProcedureText ? { otherProcedureText } : {}), ...(plannedDate ? { plannedDate } : {}), ...(noteText ? { noteText } : {}), status,
          })),
          performedProcedures: state.performedProcedures.map(({ procedureDecisionId, procedurePlanId, procedureCode, otherProcedureText, performedDate, noteText, visitId }) => ({
            procedureDecisionId, ...(procedurePlanId ? { procedurePlanId } : {}), procedureCode, ...(otherProcedureText ? { otherProcedureText } : {}), performedDate, ...(noteText ? { noteText } : {}), visitId,
          })),
        },
        measurementSeries: measurementSeriesForVisits(episode.visits),
        timeline: timelineForVisits(episode.visits),
        visits: visitReferences(episode.visits),
      };
    })
    .filter((episode) => episode.visits.length > 0);
}
