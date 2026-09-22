import type { JsonValue } from "../lib/patient-access/service";
import type { SyntheticCase } from "./synthetic-scenarios";

export const CLINICIAN_DEMO_SCHEMA = "alsalhi_clinician_demo_20260907";
export const CLINICIAN_DEMO_AS_OF = new Date("2026-09-07T23:59:59.999+03:00");

export type DemoLocale = "ar" | "en";
export type DemoWorkflowState = "AWAITING_REVIEW" | "DRAFT" | "FINALIZED";

type Localized = { ar: string; en: string };

export type DemoClinicalSections = {
  examination?: {
    hairPull?: "POSITIVE" | "NEGATIVE" | "NOT_RECORDED";
    hairParting?: Array<"UNIVERSAL" | "FRONTAL_THINNER" | "CROWN_THINNER" | "VERTEX_THINNER">;
  };
  measurements?: Partial<Record<"SHEDDING" | "DENSITY_LOSS" | "ITCH" | "BURNING" | "SCALP_PAIN", number>>;
  pattern?: {
    sinclair?: number;
    mcuFv?: { basic: string; frontal?: string; vertex?: string };
    hairLineDistanceCm?: { midline?: number; rightSide?: number; leftSide?: number };
  };
  trichoscopy?: {
    selectedFindingCodes: string[];
    otherFindingText?: string;
  };
  anatomicalMap?: {
    regions: Array<{
      view: "FRONT" | "TOP" | "RIGHT_SIDE" | "LEFT_SIDE";
      anatomicalRegionCode: string;
      geometry: JsonValue;
      noteText?: string;
      displayColorHex?: string;
    }>;
  };
};

export type DemoDiagnosisDecision =
  | { key: string; action: "ADD"; text: string }
  | { targetKey: string; action: "REVISE"; text: string }
  | { targetKey: string; action: "RESOLVE" };

export type DemoTreatmentDecision =
  | { key: string; action: "START"; name: string; regimenText?: string; noteText?: string }
  | { targetKey: string; action: "CONTINUE_EXISTING"; noteText?: string }
  | { targetKey: string; action: "MODIFY"; name?: string; regimenText?: string | null; noteText?: string | null }
  | { targetKey: string; action: "STOP" };

export type DemoProcedureDecision =
  | { key: string; action: "PLAN"; procedureCode: string; otherProcedureText?: string; plannedDate?: string; noteText?: string }
  | { targetKey?: string; action: "PERFORM"; procedureCode?: string; otherProcedureText?: string; performedDate: string; noteText?: string }
  | { targetKey: string; action: "CANCEL_OR_DEFER"; noteText?: string };

export type DemoVisit = {
  occurredAt: string;
  workflowState: DemoWorkflowState;
  clinical?: DemoClinicalSections;
  diagnoses: DemoDiagnosisDecision[];
  treatments: DemoTreatmentDecision[];
  procedures: DemoProcedureDecision[];
  diagnosisSummary: Localized;
  treatmentSummary: Localized;
  patientFollowUp?: {
    changes: Record<string, JsonValue>;
    delta: Record<string, JsonValue>;
  };
};

export type ClinicianDemoScenario = {
  mrn: `DEMO-${string}`;
  sourceCaseIndex: number;
  name: string;
  gender: "MALE" | "FEMALE";
  maritalStatus: "MARRIED" | "NOT_MARRIED";
  dob: string;
  primary: SyntheticCase["primary"];
  additional?: SyntheticCase["additional"];
  locale: DemoLocale;
  diagnosis: Localized;
  patientNarrative: Localized;
  occupation: Localized;
  approveHairHistory: boolean;
  correctHairHistoryOnset?: string;
  addendum?: { visitIndex: number; type: "CORRECTION" | "CLARIFICATION" | "ADDITIONAL_DOCUMENTATION"; content: string; createdAt: string };
  visits: DemoVisit[];
};

function geometry(points: Array<[number, number]>, radius = 0.018): JsonValue {
  return {
    version: 1,
    strokes: [{ radius, points: points.map(([x, y]) => ({ x, y })) }],
  };
}

function regions(
  input: Array<{
    view: "FRONT" | "TOP" | "RIGHT_SIDE" | "LEFT_SIDE";
    code: string;
    points: Array<[number, number]>;
    note: string;
    color: string;
  }>,
): NonNullable<DemoClinicalSections["anatomicalMap"]> {
  return {
    regions: input.map((item) => ({
      view: item.view,
      anatomicalRegionCode: item.code,
      geometry: geometry(item.points),
      noteText: item.note,
      displayColorHex: item.color,
    })),
  };
}

const unchangedHairFollowUp = (
  measurements: Record<"SHEDDING" | "DENSITY" | "ITCH" | "BURNING" | "SCALP_PAIN", number>,
  safety?: Record<string, JsonValue>,
) => ({
  changes: {
    generalHealth: "NO_CHANGE",
    medicationsSupplements: "NO_CHANGE",
    hairTreatments: "NO_CHANGE",
    hairProcedures: "NO",
    triggerEvents: "NO",
    sexSpecific: "NO_CHANGE",
  },
  delta: {
    currentMetrics: measurements,
    ...(safety ? { safety: { responses: safety } } : {}),
  },
});

export const CLINICIAN_DEMO_SCENARIOS: readonly ClinicianDemoScenario[] = [
  {
    mrn: "DEMO-001",
    sourceCaseIndex: 1,
    name: "مراجع تجريبي 001 — نمط ذكوري",
    gender: "MALE",
    maritalStatus: "MARRIED",
    dob: "1988-02-14",
    primary: "RV_HAIR_LOSS",
    locale: "ar",
    diagnosis: { ar: "الصلع الوراثي الذكوري", en: "Male androgenetic alopecia" },
    patientNarrative: { ar: "تراجع تدريجي لخط الشعر مع ترقق في القمة منذ أربع سنوات.", en: "Gradual hairline recession with crown thinning over four years." },
    occupation: { ar: "مهندس — بيانات تجريبية", en: "Engineer — synthetic data" },
    approveHairHistory: true,
    visits: [
      {
        occurredAt: "2026-04-02T09:00:00.000Z",
        workflowState: "FINALIZED",
        clinical: {
          examination: { hairPull: "NEGATIVE", hairParting: ["FRONTAL_THINNER", "CROWN_THINNER"] },
          measurements: { SHEDDING: 1, DENSITY_LOSS: 4, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
          pattern: { mcuFv: { basic: "M2", frontal: "F2", vertex: "V2" }, hairLineDistanceCm: { midline: 7.4, rightSide: 7.8, leftSide: 7.7 } },
          trichoscopy: { selectedFindingCodes: ["ANISOTRICHOSIS", "PERIPILAR_SIGN", "VELLUS_HAIRS"], otherFindingText: "Miniaturization is most evident frontally." },
          anatomicalMap: regions([
            { view: "FRONT", code: "FRONTAL_SCALP", points: [[0.38, 0.23], [0.48, 0.20], [0.59, 0.24]], note: "Frontal recession", color: "#B95D50" },
            { view: "TOP", code: "VERTEX_CROWN", points: [[0.47, 0.60], [0.55, 0.62], [0.59, 0.69]], note: "Crown thinning", color: "#8B6F47" },
          ]),
        },
        diagnoses: [{ key: "aga", action: "ADD", text: "الصلع الوراثي الذكوري بدرجة متوسطة" }],
        treatments: [{ key: "minoxidil", action: "START", name: "مينوكسيديل موضعي 5%", regimenText: "1 مل مساءً على المناطق المتأثرة", noteText: "شرح الالتزام والنتائج المتوقعة خلال أشهر." }],
        procedures: [{ key: "prp", action: "PLAN", procedureCode: "PRP", plannedDate: "2026-06-18", noteText: "جلسة واحدة بعد مراجعة الاستجابة المبكرة." }],
        diagnosisSummary: { ar: "الصلع الوراثي الذكوري", en: "Male androgenetic alopecia" },
        treatmentSummary: { ar: "بدء مينوكسيديل موضعي وخطة PRP", en: "Started topical minoxidil with a PRP plan" },
      },
      {
        occurredAt: "2026-06-18T10:00:00.000Z",
        workflowState: "FINALIZED",
        patientFollowUp: unchangedHairFollowUp({ SHEDDING: 1, DENSITY: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 }),
        clinical: {
          examination: { hairPull: "NEGATIVE", hairParting: ["FRONTAL_THINNER", "CROWN_THINNER"] },
          measurements: { SHEDDING: 1, DENSITY_LOSS: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
          pattern: { mcuFv: { basic: "M2", frontal: "F2", vertex: "V1" }, hairLineDistanceCm: { midline: 7.4, rightSide: 7.8, leftSide: 7.7 } },
          trichoscopy: { selectedFindingCodes: ["ANISOTRICHOSIS", "UPRIGHT_REGROWING_HAIRS", "VELLUS_HAIRS"] },
          anatomicalMap: regions([
            { view: "FRONT", code: "FRONTAL_SCALP", points: [[0.40, 0.24], [0.49, 0.22], [0.57, 0.25]], note: "Stable frontal outline", color: "#B95D50" },
            { view: "TOP", code: "VERTEX_CROWN", points: [[0.49, 0.61], [0.55, 0.64]], note: "Early density response", color: "#668C79" },
          ]),
        },
        diagnoses: [{ targetKey: "aga", action: "REVISE", text: "الصلع الوراثي الذكوري — استجابة كثافة مبكرة" }],
        treatments: [{ targetKey: "minoxidil", action: "CONTINUE_EXISTING", noteText: "تحمل جيد؛ الاستمرار دون تغيير." }],
        procedures: [{ targetKey: "prp", action: "PERFORM", performedDate: "2026-06-18", noteText: "أُجريت الجلسة دون مضاعفات فورية." }],
        diagnosisSummary: { ar: "الصلع الوراثي مع استجابة مبكرة", en: "Androgenetic alopecia with early response" },
        treatmentSummary: { ar: "استمرار المينوكسيديل وإجراء PRP", en: "Continued minoxidil and performed PRP" },
      },
    ],
  },
  {
    mrn: "DEMO-002",
    sourceCaseIndex: 2,
    name: "Demo Patient 002 — Female Pattern",
    gender: "FEMALE",
    maritalStatus: "MARRIED",
    dob: "1992-06-09",
    primary: "RV_HAIR_LOSS",
    locale: "en",
    diagnosis: { ar: "تساقط نمطي أنثوي مع تساقط كربي مزمن", en: "Female pattern hair loss with chronic telogen effluvium" },
    patientNarrative: { ar: "اتساع فرق الشعر مع زيادة التساقط بعد ضغط نفسي ونقص حديد سابق.", en: "Widening part with increased shedding after stress and prior iron deficiency." },
    occupation: { ar: "محاسبة — بيانات تجريبية", en: "Accountant — synthetic data" },
    approveHairHistory: true,
    visits: [
      {
        occurredAt: "2026-04-03T09:00:00.000Z",
        workflowState: "FINALIZED",
        clinical: {
          examination: { hairPull: "POSITIVE", hairParting: ["UNIVERSAL", "CROWN_THINNER"] },
          measurements: { SHEDDING: 4, DENSITY_LOSS: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
          pattern: { sinclair: 3, hairLineDistanceCm: { midline: 6.6, rightSide: 6.7, leftSide: 6.6 } },
          trichoscopy: { selectedFindingCodes: ["ANISOTRICHOSIS", "SINGLE_HAIR_FOLLICULAR_UNITS", "PERIPILAR_SIGN"] },
          anatomicalMap: regions([
            { view: "TOP", code: "MID_SCALP", points: [[0.47, 0.40], [0.53, 0.44], [0.57, 0.49]], note: "Widened central part", color: "#B95D50" },
            { view: "TOP", code: "VERTEX_CROWN", points: [[0.47, 0.63], [0.55, 0.65]], note: "Diffuse crown thinning", color: "#8B6F47" },
          ]),
        },
        diagnoses: [{ key: "fphl", action: "ADD", text: "Female pattern hair loss with chronic telogen effluvium" }],
        treatments: [
          { key: "minoxidil", action: "START", name: "Topical minoxidil 5%", regimenText: "Apply once nightly to the central scalp", noteText: "Discussed transient early shedding." },
          { key: "iron", action: "START", name: "Oral iron replacement", regimenText: "Continue per documented deficiency plan", noteText: "Coordinate ferritin follow-up with primary care." },
        ],
        procedures: [{ key: "prp", action: "PLAN", procedureCode: "PRP", plannedDate: "2026-06-23", noteText: "Proceed only after iron status review." }],
        diagnosisSummary: { ar: "تساقط نمطي أنثوي مع تساقط كربي", en: "Female pattern hair loss with telogen effluvium" },
        treatmentSummary: { ar: "بدء مينوكسيديل وتعويض الحديد", en: "Started minoxidil and iron replacement" },
      },
      {
        occurredAt: "2026-06-23T10:00:00.000Z",
        workflowState: "FINALIZED",
        patientFollowUp: unchangedHairFollowUp(
          { SHEDDING: 3, DENSITY: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
          { Q_PREGNANCY_BREASTFEEDING_STATUS: "NO", Q_PREGNANCY_PLANNING: "ABOUT_1Y" },
        ),
        clinical: {
          examination: { hairPull: "POSITIVE", hairParting: ["UNIVERSAL", "CROWN_THINNER"] },
          measurements: { SHEDDING: 3, DENSITY_LOSS: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
          pattern: { sinclair: 3 },
          trichoscopy: { selectedFindingCodes: ["ANISOTRICHOSIS", "UPRIGHT_REGROWING_HAIRS"] },
          anatomicalMap: regions([{ view: "TOP", code: "MID_SCALP", points: [[0.48, 0.41], [0.53, 0.46]], note: "Reduced shedding; density stable", color: "#C28A4B" }]),
        },
        diagnoses: [{ targetKey: "fphl", action: "REVISE", text: "Female pattern hair loss with improving telogen shedding" }],
        treatments: [
          { targetKey: "minoxidil", action: "CONTINUE_EXISTING", noteText: "Continue nightly application." },
          { targetKey: "iron", action: "CONTINUE_EXISTING", noteText: "Continue until planned reassessment." },
        ],
        procedures: [{ targetKey: "prp", action: "CANCEL_OR_DEFER", noteText: "Deferred while correcting iron deficiency." }],
        diagnosisSummary: { ar: "تساقط نمطي أنثوي مع تحسن التساقط", en: "Female pattern hair loss with improving shedding" },
        treatmentSummary: { ar: "استمرار العلاج وتأجيل PRP", en: "Continued treatment; PRP deferred" },
      },
      {
        occurredAt: "2026-08-25T10:30:00.000Z",
        workflowState: "FINALIZED",
        patientFollowUp: unchangedHairFollowUp(
          { SHEDDING: 2, DENSITY: 2, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
          { Q_PREGNANCY_BREASTFEEDING_STATUS: "NO", Q_PREGNANCY_PLANNING: "ABOUT_1Y" },
        ),
        clinical: {
          examination: { hairPull: "NEGATIVE", hairParting: ["CROWN_THINNER"] },
          measurements: { SHEDDING: 2, DENSITY_LOSS: 2, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
          pattern: { sinclair: 2 },
          trichoscopy: { selectedFindingCodes: ["UPRIGHT_REGROWING_HAIRS", "ANISOTRICHOSIS"] },
          anatomicalMap: regions([{ view: "TOP", code: "MID_SCALP", points: [[0.49, 0.42], [0.53, 0.44]], note: "Visible central regrowth", color: "#668C79" }]),
        },
        diagnoses: [{ targetKey: "fphl", action: "REVISE", text: "Female pattern hair loss — clinically improving" }],
        treatments: [
          { targetKey: "minoxidil", action: "MODIFY", regimenText: "Continue once nightly; use measured application", noteText: "Simplified regimen to support adherence." },
          { targetKey: "iron", action: "STOP" },
        ],
        procedures: [],
        diagnosisSummary: { ar: "تساقط نمطي أنثوي يتحسن سريريًا", en: "Clinically improving female pattern hair loss" },
        treatmentSummary: { ar: "تعديل نظام المينوكسيديل وإيقاف الحديد", en: "Refined minoxidil regimen; iron stopped" },
      },
    ],
  },
  {
    mrn: "DEMO-003",
    sourceCaseIndex: 3,
    name: "مراجعة تجريبية 003 — ما بعد الولادة",
    gender: "FEMALE",
    maritalStatus: "MARRIED",
    dob: "1995-11-22",
    primary: "RV_HAIR_LOSS",
    locale: "ar",
    diagnosis: { ar: "تساقط كربي بعد الولادة", en: "Postpartum telogen effluvium" },
    patientNarrative: { ar: "تساقط منتشر بدأ بعد الولادة أثناء الرضاعة.", en: "Diffuse shedding began postpartum during breastfeeding." },
    occupation: { ar: "معلمة — بيانات تجريبية", en: "Teacher — synthetic data" },
    approveHairHistory: true,
    correctHairHistoryOnset: "2025-11-15T00:00:00.000Z",
    addendum: { visitIndex: 0, type: "CLARIFICATION", content: "للتوضيح: بدأت زيادة التساقط تدريجيًا في نوفمبر 2025 حسب التاريخ المصحح المعتمد.", createdAt: "2026-04-06T11:00:00.000Z" },
    visits: [{
      occurredAt: "2026-04-04T09:30:00.000Z",
      workflowState: "FINALIZED",
      clinical: {
        examination: { hairPull: "POSITIVE", hairParting: ["UNIVERSAL"] },
        measurements: { SHEDDING: 4, DENSITY_LOSS: 1, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
        pattern: { sinclair: 1 },
        trichoscopy: { selectedFindingCodes: ["UPRIGHT_REGROWING_HAIRS", "SINGLE_HAIR_FOLLICULAR_UNITS"] },
        anatomicalMap: regions([
          { view: "TOP", code: "MID_SCALP", points: [[0.45, 0.40], [0.52, 0.46]], note: "Diffuse shedding", color: "#C28A4B" },
          { view: "RIGHT_SIDE", code: "RIGHT_TEMPORAL", points: [[0.42, 0.32], [0.49, 0.35]], note: "Short regrowth", color: "#668C79" },
        ]),
      },
      diagnoses: [{ key: "postpartum", action: "ADD", text: "تساقط كربي بعد الولادة دون دلائل ندبية" }],
      treatments: [{ key: "supportive", action: "START", name: "خطة دعم ومراقبة", regimenText: "عناية لطيفة ومتابعة خلال 12 أسبوعًا", noteText: "مناقشة المسار المتوقع والتنبيه لعلامات المراجعة المبكرة." }],
      procedures: [],
      diagnosisSummary: { ar: "تساقط كربي بعد الولادة", en: "Postpartum telogen effluvium" },
      treatmentSummary: { ar: "خطة دعم ومراقبة", en: "Supportive care and monitoring" },
    }],
  },
  {
    mrn: "DEMO-004",
    sourceCaseIndex: 5,
    name: "Demo Patient 004 — Awaiting Review",
    gender: "FEMALE",
    maritalStatus: "NOT_MARRIED",
    dob: "1999-03-17",
    primary: "RV_HAIR_LOSS",
    locale: "en",
    diagnosis: { ar: "اشتباه ثعلبة بقعية — بانتظار مراجعة الطبيب", en: "Possible alopecia areata — awaiting physician review" },
    patientNarrative: { ar: "بقعة جديدة محددة من نقص الشعر تحتاج مراجعة الطبيب.", en: "A new discrete patch of hair loss awaiting physician review." },
    occupation: { ar: "طالبة — بيانات تجريبية", en: "Student — synthetic data" },
    approveHairHistory: false,
    visits: [{
      occurredAt: "2026-09-05T14:00:00.000Z",
      workflowState: "AWAITING_REVIEW",
      diagnoses: [], treatments: [], procedures: [],
      diagnosisSummary: { ar: "لم يراجع الطبيب بعد", en: "Not yet physician-reviewed" },
      treatmentSummary: { ar: "لا قرار طبيًا بعد", en: "No physician decision yet" },
    }],
  },
  {
    mrn: "DEMO-005",
    sourceCaseIndex: 6,
    name: "مراجع تجريبي 005 — شعر وفروة",
    gender: "MALE",
    maritalStatus: "MARRIED",
    dob: "1985-08-30",
    primary: "RV_HAIR_LOSS",
    locale: "ar",
    diagnosis: { ar: "تساقط ندبي التهابي", en: "Inflammatory scarring alopecia" },
    patientNarrative: { ar: "ترقق مع ألم وحرقان في الصدغين وتاريخ خزعة متوافق.", en: "Thinning with temporal pain and burning and a compatible prior biopsy." },
    occupation: { ar: "مدير مشاريع — بيانات تجريبية", en: "Project manager — synthetic data" },
    approveHairHistory: true,
    visits: [{
      occurredAt: "2026-04-07T10:00:00.000Z",
      workflowState: "FINALIZED",
      clinical: {
        examination: { hairPull: "POSITIVE", hairParting: ["FRONTAL_THINNER"] },
        measurements: { SHEDDING: 3, DENSITY_LOSS: 4, ITCH: 1, BURNING: 3, SCALP_PAIN: 3 },
        pattern: { mcuFv: { basic: "M1", frontal: "F2" }, hairLineDistanceCm: { midline: 7.1, rightSide: 8.0, leftSide: 7.9 } },
        trichoscopy: { selectedFindingCodes: ["FOLLICULAR_DROPOUT", "PERIFOLLICULAR_ERYTHEMA", "PERIFOLLICULAR_SCALE"], otherFindingText: "Reduced follicular openings at the right temple." },
        anatomicalMap: regions([
          { view: "RIGHT_SIDE", code: "RIGHT_TEMPORAL", points: [[0.42, 0.31], [0.51, 0.34], [0.55, 0.40]], note: "Active perifollicular erythema", color: "#B95D50" },
          { view: "LEFT_SIDE", code: "LEFT_TEMPORAL", points: [[0.43, 0.31], [0.49, 0.35]], note: "Milder tenderness", color: "#C28A4B" },
        ]),
      },
      diagnoses: [{ key: "scarring", action: "ADD", text: "تساقط ندبي التهابي نشط يحتاج متابعة قريبة" }],
      treatments: [{ key: "antiinflammatory", action: "START", name: "خطة مضادة للالتهاب", regimenText: "علاج فروة موضعي حسب الوصفة ومتابعة الأعراض", noteText: "توثيق الألم والحرقان كنقاط متابعة." }],
      procedures: [{ action: "PERFORM", procedureCode: "CORTISONE_INJ", performedDate: "2026-04-07", noteText: "حقن موضعي محدود في المنطقة النشطة." }],
      diagnosisSummary: { ar: "تساقط ندبي التهابي", en: "Inflammatory scarring alopecia" },
      treatmentSummary: { ar: "بدء علاج مضاد للالتهاب مع حقن موضعي", en: "Anti-inflammatory plan with local injection" },
    }],
  },
  {
    mrn: "DEMO-006",
    sourceCaseIndex: 7,
    name: "Demo Patient 006 — Scalp Symptoms",
    gender: "FEMALE",
    maritalStatus: "MARRIED",
    dob: "1990-01-12",
    primary: "RV_SCALP_SYMPTOMS",
    locale: "en",
    diagnosis: { ar: "التهاب الجلد الدهني بفروة الرأس", en: "Seborrheic dermatitis of the scalp" },
    patientNarrative: { ar: "حكة وقشور تزداد مع التعرق وتتحسن بالشامبو العلاجي.", en: "Itch and scale worsen with sweating and improve with medicated shampoo." },
    occupation: { ar: "صيدلانية — بيانات تجريبية", en: "Pharmacist — synthetic data" },
    approveHairHistory: true,
    visits: [{
      occurredAt: "2026-04-08T11:00:00.000Z",
      workflowState: "FINALIZED",
      clinical: {
        examination: { hairPull: "NEGATIVE", hairParting: ["UNIVERSAL"] },
        measurements: { SHEDDING: 1, DENSITY_LOSS: 0, ITCH: 4, BURNING: 0, SCALP_PAIN: 0 },
        trichoscopy: { selectedFindingCodes: ["INTERFOLLICULAR_SCALES", "PERIFOLLICULAR_ERYTHEMA"] },
        anatomicalMap: regions([
          { view: "TOP", code: "VERTEX_CROWN", points: [[0.49, 0.61], [0.57, 0.63]], note: "Adherent scale", color: "#C28A4B" },
          { view: "LEFT_SIDE", code: "LEFT_OCCIPITAL", points: [[0.34, 0.67], [0.42, 0.70]], note: "Intermittent itch", color: "#8B6F47" },
        ]),
      },
      diagnoses: [{ key: "sebderm", action: "ADD", text: "Seborrheic dermatitis of the scalp" }],
      treatments: [{ key: "shampoo", action: "START", name: "Ketoconazole shampoo", regimenText: "Use twice weekly for four weeks, then weekly as needed", noteText: "Leave on scalp briefly before rinsing." }],
      procedures: [],
      diagnosisSummary: { ar: "التهاب الجلد الدهني بفروة الرأس", en: "Seborrheic dermatitis of the scalp" },
      treatmentSummary: { ar: "بدء شامبو كيتوكونازول", en: "Started ketoconazole shampoo" },
    }],
  },
  {
    mrn: "DEMO-007",
    sourceCaseIndex: 13,
    name: "مراجعة تجريبية 007 — جودة شعر مصبوغ",
    gender: "FEMALE",
    maritalStatus: "NOT_MARRIED",
    dob: "1997-05-08",
    primary: "RV_HAIR_QUALITY",
    locale: "ar",
    diagnosis: { ar: "تضرر ساق الشعرة بسبب الصبغة والحرارة", en: "Hair-shaft damage from color and heat" },
    patientNarrative: { ar: "جفاف وتقصف بعد التفتيح مع استخدام متكرر للمكواة.", en: "Dryness and breakage after bleaching with frequent flat-iron use." },
    occupation: { ar: "مصممة — بيانات تجريبية", en: "Designer — synthetic data" },
    approveHairHistory: false,
    visits: [{
      occurredAt: "2026-04-14T12:00:00.000Z",
      workflowState: "FINALIZED",
      diagnoses: [{ key: "shaftdamage", action: "ADD", text: "تضرر مكتسب في ساق الشعرة بسبب التفتيح والحرارة" }],
      treatments: [{ key: "haircare", action: "START", name: "برنامج عناية واقٍ لساق الشعرة", regimenText: "تقليل الحرارة، واقٍ حراري، بلسم بعد كل غسلة وقناع أسبوعي", noteText: "إيقاف التفتيح مؤقتًا ومراجعة التقصف بعد 12 أسبوعًا." }],
      procedures: [],
      diagnosisSummary: { ar: "تضرر ساق الشعرة بسبب الصبغة والحرارة", en: "Hair-shaft damage from color and heat" },
      treatmentSummary: { ar: "برنامج حماية وتقليل للحرارة", en: "Protective hair-care and heat reduction plan" },
    }],
  },
  {
    mrn: "DEMO-008",
    sourceCaseIndex: 16,
    name: "Demo Patient 008 — Virgin Curly Hair",
    gender: "FEMALE",
    maritalStatus: "NOT_MARRIED",
    dob: "2000-09-19",
    primary: "RV_HAIR_QUALITY",
    locale: "en",
    diagnosis: { ar: "جفاف وهيشان في شعر مجعد غير معالج", en: "Dryness and frizz in untreated curly hair" },
    patientNarrative: { ar: "شعر مجعد غير معالج كيميائيًا مع جفاف وتشابك.", en: "Untreated curly hair with dryness, frizz, and tangling." },
    occupation: { ar: "طالبة دراسات عليا — بيانات تجريبية", en: "Graduate student — synthetic data" },
    approveHairHistory: false,
    visits: [{
      occurredAt: "2026-09-03T15:00:00.000Z",
      workflowState: "DRAFT",
      diagnoses: [{ key: "curlydryness", action: "ADD", text: "Dryness and frizz in untreated curly hair" }],
      treatments: [{ key: "curlroutine", action: "START", name: "Curly-hair moisture routine", regimenText: "Condition every wash; leave-in product and gentle diffuser technique", noteText: "Draft plan pending encounter confirmation." }],
      procedures: [],
      diagnosisSummary: { ar: "جفاف وهيشان في شعر مجعد", en: "Dryness and frizz in curly hair" },
      treatmentSummary: { ar: "مسودة روتين ترطيب", en: "Moisture-routine draft" },
    }],
  },
  {
    mrn: "DEMO-009",
    sourceCaseIndex: 20,
    name: "مراجعة تجريبية 009 — جلدية",
    gender: "FEMALE",
    maritalStatus: "NOT_MARRIED",
    dob: "1998-12-03",
    primary: "RV_DERMATOLOGY",
    locale: "ar",
    diagnosis: { ar: "حب شباب التهابي متوسط", en: "Moderate inflammatory acne" },
    patientNarrative: { ar: "حبوب ملتهبة متكررة في الوجه مع آثار تصبغ بعد الالتهاب.", en: "Recurrent inflammatory facial acne with post-inflammatory marks." },
    occupation: { ar: "محللة بيانات — بيانات تجريبية", en: "Data analyst — synthetic data" },
    approveHairHistory: false,
    visits: [{
      occurredAt: "2026-04-21T13:00:00.000Z",
      workflowState: "FINALIZED",
      diagnoses: [{ key: "acne", action: "ADD", text: "حب شباب التهابي متوسط مع تصبغ تالٍ للالتهاب" }],
      treatments: [{ key: "acneplan", action: "START", name: "خطة علاج موضعي لحب الشباب", regimenText: "غسول لطيف وعلاج موضعي تدريجي مساءً", noteText: "تجنب العبث بالبثور واستخدام واقي الشمس." }],
      procedures: [],
      diagnosisSummary: { ar: "حب شباب التهابي متوسط", en: "Moderate inflammatory acne" },
      treatmentSummary: { ar: "بدء خطة علاج موضعي", en: "Started a topical acne plan" },
    }],
  },
  {
    mrn: "DEMO-010",
    sourceCaseIndex: 28,
    name: "Demo Patient 010 — Laser",
    gender: "MALE",
    maritalStatus: "NOT_MARRIED",
    dob: "1991-07-26",
    primary: "RV_LASER",
    locale: "en",
    diagnosis: { ar: "شعر غير مرغوب فيه مناسب لخطة ليزر مرحلية", en: "Unwanted hair suitable for staged laser reduction" },
    patientNarrative: { ar: "طلب إزالة شعر غير مرغوب فيه مع مراجعة جلسات سابقة دون مضاعفات.", en: "Requests unwanted-hair reduction after prior sessions without complications." },
    occupation: { ar: "مدير منتجات — بيانات تجريبية", en: "Product manager — synthetic data" },
    approveHairHistory: false,
    visits: [{
      occurredAt: "2026-04-29T14:00:00.000Z",
      workflowState: "FINALIZED",
      diagnoses: [{ key: "laserhair", action: "ADD", text: "Unwanted hair suitable for staged laser reduction" }],
      treatments: [{ key: "aftercare", action: "START", name: "Laser aftercare plan", regimenText: "Sun protection and gentle skin care for 48 hours", noteText: "Reviewed expected transient erythema." }],
      procedures: [{ action: "PERFORM", procedureCode: "OTHER", otherProcedureText: "Laser hair-reduction session", performedDate: "2026-04-29", noteText: "Test area tolerated; conservative settings used." }],
      diagnosisSummary: { ar: "شعر غير مرغوب فيه مناسب لليزر", en: "Unwanted hair suitable for laser reduction" },
      treatmentSummary: { ar: "جلسة ليزر مع تعليمات العناية", en: "Laser session with aftercare guidance" },
    }],
  },
  {
    mrn: "DEMO-011",
    sourceCaseIndex: 31,
    name: "مراجعة تجريبية 011 — تجميل",
    gender: "FEMALE",
    maritalStatus: "NOT_MARRIED",
    dob: "1989-04-11",
    primary: "RV_AESTHETIC_PROCEDURES",
    locale: "ar",
    diagnosis: { ar: "خطوط تعبيرية بالجبهة وبين الحاجبين", en: "Dynamic forehead and glabellar lines" },
    patientNarrative: { ar: "ترغب في نتيجة محافظة مع بقاء تعابير الوجه طبيعية.", en: "Requests a conservative result preserving natural facial expression." },
    occupation: { ar: "مهندسة معمارية — بيانات تجريبية", en: "Architect — synthetic data" },
    approveHairHistory: false,
    visits: [{
      occurredAt: "2026-05-02T15:00:00.000Z",
      workflowState: "FINALIZED",
      diagnoses: [{ key: "dynamiclines", action: "ADD", text: "خطوط تعبيرية بالجبهة وبين الحاجبين" }],
      treatments: [{ key: "aftercare", action: "START", name: "تعليمات ما بعد الإجراء", regimenText: "تجنب الضغط على مواضع الحقن والرياضة الشديدة بقية اليوم", noteText: "شرح التوقعات الواقعية وموعد المراجعة." }],
      procedures: [{ action: "PERFORM", procedureCode: "OTHER", otherProcedureText: "حقن محافظ لخطوط التعبير", performedDate: "2026-05-02", noteText: "أُجري بعد موافقة المراجعة ودون مضاعفات فورية." }],
      diagnosisSummary: { ar: "خطوط تعبيرية بالجبهة وبين الحاجبين", en: "Dynamic forehead and glabellar lines" },
      treatmentSummary: { ar: "إجراء محافظ وتعليمات متابعة", en: "Conservative procedure with follow-up guidance" },
    }],
  },
  {
    mrn: "DEMO-012",
    sourceCaseIndex: 23,
    name: "Demo Patient 012 — Dermatology + Laser",
    gender: "FEMALE",
    maritalStatus: "MARRIED",
    dob: "1993-10-05",
    primary: "RV_DERMATOLOGY",
    additional: ["RV_LASER"],
    locale: "en",
    diagnosis: { ar: "كلف مع تصبغ وجهي سطحي", en: "Melasma with superficial facial pigmentation" },
    patientNarrative: { ar: "تصبغ وجهي متناظر يزداد مع الشمس مع طلب تقييم الليزر.", en: "Symmetric facial pigmentation worsened by sun exposure, with a laser review request." },
    occupation: { ar: "باحثة — بيانات تجريبية", en: "Researcher — synthetic data" },
    approveHairHistory: false,
    visits: [{
      occurredAt: "2026-04-24T13:30:00.000Z",
      workflowState: "FINALIZED",
      diagnoses: [{ key: "melasma", action: "ADD", text: "Melasma with superficial facial pigmentation" }],
      treatments: [{ key: "melasmaplan", action: "START", name: "Conservative melasma plan", regimenText: "Daily tinted sunscreen with a staged topical regimen", noteText: "Laser role discussed as adjunctive, not first-line monotherapy." }],
      procedures: [{ key: "laserreview", action: "PLAN", procedureCode: "OTHER", otherProcedureText: "Conservative pigmentation-laser test area", plannedDate: "2026-06-05", noteText: "Plan only after stable sun-protection routine." }],
      diagnosisSummary: { ar: "كلف مع تصبغ وجهي سطحي", en: "Melasma with superficial facial pigmentation" },
      treatmentSummary: { ar: "خطة محافظة مع تقييم ليزر مرحلي", en: "Conservative plan with staged laser review" },
    }],
  },
  {
    mrn: "DEMO-013",
    sourceCaseIndex: 2,
    name: "Demo Patient 013 — Central Pattern Thinning",
    gender: "FEMALE",
    maritalStatus: "MARRIED",
    dob: "1987-09-18",
    primary: "RV_HAIR_LOSS",
    locale: "en",
    diagnosis: { ar: "Female Pattern Hair Loss", en: "Female Pattern Hair Loss" },
    patientNarrative: {
      ar: "Gradual widening of the central part over four years without significant scalp inflammation.",
      en: "Gradual widening of the central part over four years without significant scalp inflammation.",
    },
    occupation: { ar: "University lecturer", en: "University lecturer" },
    approveHairHistory: true,
    visits: [{
      occurredAt: "2026-07-06T09:00:00.000Z",
      workflowState: "FINALIZED",
      clinical: {
        examination: { hairPull: "NEGATIVE", hairParting: ["UNIVERSAL", "CROWN_THINNER"] },
        measurements: { SHEDDING: 1, DENSITY_LOSS: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
        pattern: {
          sinclair: 3,
          hairLineDistanceCm: { midline: 6.4, rightSide: 6.5, leftSide: 6.5 },
        },
        trichoscopy: {
          selectedFindingCodes: ["ANISOTRICHOSIS", "SINGLE_HAIR_FOLLICULAR_UNITS", "PERIPILAR_SIGN"],
          otherFindingText: "Miniaturization is concentrated along the central part.",
        },
        anatomicalMap: regions([
          { view: "TOP", code: "MID_SCALP", points: [[0.47, 0.38], [0.52, 0.45], [0.55, 0.52]], note: "Widened central part", color: "#B95D50" },
          { view: "TOP", code: "VERTEX_CROWN", points: [[0.48, 0.62], [0.55, 0.65]], note: "Moderate density reduction", color: "#C28A4B" },
        ]),
      },
      diagnoses: [{ key: "fphl", action: "ADD", text: "Female Pattern Hair Loss" }],
      treatments: [{
        key: "minoxidil",
        action: "START",
        name: "Topical minoxidil 5%",
        regimenText: "Apply 1 mL to the central scalp once nightly.",
        noteText: "Reviewed expected timing of response and the possibility of transient early shedding.",
      }],
      procedures: [{
        key: "prp",
        action: "PLAN",
        procedureCode: "PRP",
        plannedDate: "2026-08-20",
        noteText: "One session planned after confirming tolerance of the topical regimen.",
      }],
      diagnosisSummary: { ar: "Female Pattern Hair Loss", en: "Female Pattern Hair Loss" },
      treatmentSummary: {
        ar: "Started topical minoxidil with a staged PRP plan",
        en: "Started topical minoxidil with a staged PRP plan",
      },
    }],
  },
  {
    mrn: "DEMO-014",
    sourceCaseIndex: 4,
    name: "Demo Patient 014 — Male Pattern Progression",
    gender: "MALE",
    maritalStatus: "MARRIED",
    dob: "1985-03-27",
    primary: "RV_HAIR_LOSS",
    locale: "en",
    diagnosis: { ar: "Androgenetic Alopecia", en: "Androgenetic Alopecia" },
    patientNarrative: {
      ar: "Progressive frontotemporal recession with vertex thinning over five years.",
      en: "Progressive frontotemporal recession with vertex thinning over five years.",
    },
    occupation: { ar: "Civil engineer", en: "Civil engineer" },
    approveHairHistory: true,
    visits: [{
      occurredAt: "2026-07-08T10:00:00.000Z",
      workflowState: "FINALIZED",
      clinical: {
        examination: { hairPull: "NEGATIVE", hairParting: ["FRONTAL_THINNER", "VERTEX_THINNER"] },
        measurements: { SHEDDING: 1, DENSITY_LOSS: 4, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
        pattern: {
          mcuFv: { basic: "M2", frontal: "F2", vertex: "V2" },
          hairLineDistanceCm: { midline: 7.3, rightSide: 7.8, leftSide: 7.7 },
        },
        trichoscopy: {
          selectedFindingCodes: ["VELLUS_HAIRS", "ANISOTRICHOSIS", "PERIPILAR_SIGN"],
          otherFindingText: "Miniaturization is most prominent at the frontal scalp and vertex.",
        },
        anatomicalMap: regions([
          { view: "FRONT", code: "FRONTAL_SCALP", points: [[0.37, 0.23], [0.49, 0.20], [0.61, 0.24]], note: "Frontotemporal recession", color: "#B95D50" },
          { view: "TOP", code: "VERTEX_CROWN", points: [[0.47, 0.61], [0.55, 0.65], [0.60, 0.69]], note: "Vertex thinning", color: "#8B6F47" },
        ]),
      },
      diagnoses: [{ key: "aga", action: "ADD", text: "Androgenetic Alopecia" }],
      treatments: [{
        key: "minoxidil",
        action: "START",
        name: "Topical minoxidil 5%",
        regimenText: "Apply 1 mL to the frontal scalp and vertex once nightly.",
        noteText: "Discussed adherence, realistic density goals, and the expected treatment timeline.",
      }],
      procedures: [],
      diagnosisSummary: { ar: "Androgenetic Alopecia", en: "Androgenetic Alopecia" },
      treatmentSummary: { ar: "Started topical minoxidil", en: "Started topical minoxidil" },
    }],
  },
  {
    mrn: "DEMO-015",
    sourceCaseIndex: 3,
    name: "Demo Patient 015 — Postpartum Shedding",
    gender: "FEMALE",
    maritalStatus: "MARRIED",
    dob: "1994-12-11",
    primary: "RV_HAIR_LOSS",
    locale: "en",
    diagnosis: { ar: "Telogen Effluvium", en: "Telogen Effluvium" },
    patientNarrative: {
      ar: "Diffuse shedding began approximately three months after delivery, without focal loss or scalp inflammation.",
      en: "Diffuse shedding began approximately three months after delivery, without focal loss or scalp inflammation.",
    },
    occupation: { ar: "Primary school teacher", en: "Primary school teacher" },
    approveHairHistory: true,
    visits: [{
      occurredAt: "2026-07-10T09:30:00.000Z",
      workflowState: "FINALIZED",
      clinical: {
        examination: { hairPull: "POSITIVE", hairParting: ["UNIVERSAL"] },
        measurements: { SHEDDING: 4, DENSITY_LOSS: 1, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
        pattern: { sinclair: 1 },
        trichoscopy: {
          selectedFindingCodes: ["UPRIGHT_REGROWING_HAIRS", "SINGLE_HAIR_FOLLICULAR_UNITS"],
          otherFindingText: "Diffuse short regrowing hairs are present without scarring features.",
        },
        anatomicalMap: regions([
          { view: "TOP", code: "MID_SCALP", points: [[0.43, 0.39], [0.51, 0.45], [0.58, 0.49]], note: "Diffuse shedding", color: "#C28A4B" },
        ]),
      },
      diagnoses: [{ key: "te", action: "ADD", text: "Telogen Effluvium" }],
      treatments: [{
        key: "supportive",
        action: "START",
        name: "Supportive shedding-recovery plan",
        regimenText: "Use gentle hair care and maintain adequate dietary protein during postpartum recovery.",
        noteText: "Reviewed the expected self-limited course and indications for earlier reassessment.",
      }],
      procedures: [],
      diagnosisSummary: { ar: "Telogen Effluvium", en: "Telogen Effluvium" },
      treatmentSummary: {
        ar: "Supportive postpartum shedding-recovery plan",
        en: "Supportive postpartum shedding-recovery plan",
      },
    }],
  },
  {
    mrn: "DEMO-016",
    sourceCaseIndex: 5,
    name: "Demo Patient 016 — Focal Alopecia",
    gender: "FEMALE",
    maritalStatus: "NOT_MARRIED",
    dob: "1998-05-22",
    primary: "RV_HAIR_LOSS",
    locale: "en",
    diagnosis: { ar: "Alopecia Areata", en: "Alopecia Areata" },
    patientNarrative: {
      ar: "A sharply defined patch of hair loss developed over six weeks without scale or pain.",
      en: "A sharply defined patch of hair loss developed over six weeks without scale or pain.",
    },
    occupation: { ar: "Graphic designer", en: "Graphic designer" },
    approveHairHistory: true,
    visits: [{
      occurredAt: "2026-07-13T11:00:00.000Z",
      workflowState: "FINALIZED",
      clinical: {
        examination: { hairPull: "POSITIVE", hairParting: ["UNIVERSAL"] },
        measurements: { SHEDDING: 1, DENSITY_LOSS: 2, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
        trichoscopy: {
          selectedFindingCodes: ["EXCLAMATION_TAPERING_HAIRS", "YELLOW_DOTS", "BLACK_DOTS"],
        },
        anatomicalMap: regions([
          { view: "RIGHT_SIDE", code: "RIGHT_TEMPORAL", points: [[0.43, 0.34], [0.48, 0.38], [0.45, 0.43]], note: "Discrete nonscarring patch", color: "#B95D50" },
        ]),
      },
      diagnoses: [{ key: "aa", action: "ADD", text: "Alopecia Areata" }],
      treatments: [],
      procedures: [{
        action: "PERFORM",
        procedureCode: "CORTISONE_INJ",
        performedDate: "2026-07-13",
        noteText: "A conservative intralesional corticosteroid treatment was performed within the active patch.",
      }],
      diagnosisSummary: { ar: "Alopecia Areata", en: "Alopecia Areata" },
      treatmentSummary: {
        ar: "Intralesional corticosteroid treatment performed",
        en: "Intralesional corticosteroid treatment performed",
      },
    }],
  },
  {
    mrn: "DEMO-017",
    sourceCaseIndex: 7,
    name: "Demo Patient 017 — Scalp Flaking",
    gender: "FEMALE",
    maritalStatus: "MARRIED",
    dob: "1990-08-04",
    primary: "RV_SCALP_SYMPTOMS",
    locale: "en",
    diagnosis: { ar: "Seborrheic Dermatitis", en: "Seborrheic Dermatitis" },
    patientNarrative: {
      ar: "Intermittent scalp itching and flaking worsen with heat and sweating.",
      en: "Intermittent scalp itching and flaking worsen with heat and sweating.",
    },
    occupation: { ar: "Pharmacist", en: "Pharmacist" },
    approveHairHistory: true,
    visits: [{
      occurredAt: "2026-07-15T12:00:00.000Z",
      workflowState: "FINALIZED",
      clinical: {
        examination: { hairPull: "NEGATIVE", hairParting: ["UNIVERSAL"] },
        measurements: { SHEDDING: 0, DENSITY_LOSS: 0, ITCH: 4, BURNING: 1, SCALP_PAIN: 0 },
        trichoscopy: {
          selectedFindingCodes: ["INTERFOLLICULAR_SCALES", "PERIFOLLICULAR_ERYTHEMA"],
        },
        anatomicalMap: regions([
          { view: "TOP", code: "VERTEX_CROWN", points: [[0.47, 0.59], [0.54, 0.63], [0.59, 0.66]], note: "Fine adherent scale", color: "#C28A4B" },
          { view: "LEFT_SIDE", code: "LEFT_OCCIPITAL", points: [[0.35, 0.66], [0.42, 0.70]], note: "Mild background erythema", color: "#8B6F47" },
        ]),
      },
      diagnoses: [{ key: "sebderm", action: "ADD", text: "Seborrheic Dermatitis" }],
      treatments: [{
        key: "shampoo",
        action: "START",
        name: "Ketoconazole 2% shampoo",
        regimenText: "Use twice weekly for four weeks, then once weekly as maintenance.",
        noteText: "Leave on the scalp for several minutes before rinsing and alternate with a gentle shampoo.",
      }],
      procedures: [],
      diagnosisSummary: { ar: "Seborrheic Dermatitis", en: "Seborrheic Dermatitis" },
      treatmentSummary: {
        ar: "Started an antifungal shampoo regimen",
        en: "Started an antifungal shampoo regimen",
      },
    }],
  },
  {
    mrn: "DEMO-018",
    sourceCaseIndex: 13,
    name: "Demo Patient 018 — Hair Quality",
    gender: "FEMALE",
    maritalStatus: "NOT_MARRIED",
    dob: "1996-02-16",
    primary: "RV_HAIR_QUALITY",
    locale: "en",
    diagnosis: {
      ar: "Hair Shaft Damage / Weathering",
      en: "Hair Shaft Damage / Weathering",
    },
    patientNarrative: {
      ar: "Dryness, frizz, and breakage increased after repeated bleaching and frequent heat styling.",
      en: "Dryness, frizz, and breakage increased after repeated bleaching and frequent heat styling.",
    },
    occupation: { ar: "Interior designer", en: "Interior designer" },
    approveHairHistory: false,
    visits: [{
      occurredAt: "2026-07-20T13:00:00.000Z",
      workflowState: "FINALIZED",
      diagnoses: [{
        key: "weathering",
        action: "ADD",
        text: "Hair Shaft Damage / Weathering",
      }],
      treatments: [{
        key: "protective-care",
        action: "START",
        name: "Protective hair-shaft care plan",
        regimenText: "Pause bleaching, limit high-heat styling, use heat protection, and condition after every wash.",
        noteText: "Reassess breakage and manageability after twelve weeks of consistent protective care.",
      }],
      procedures: [],
      diagnosisSummary: {
        ar: "Hair Shaft Damage / Weathering",
        en: "Hair Shaft Damage / Weathering",
      },
      treatmentSummary: {
        ar: "Protective care with reduced chemical and heat exposure",
        en: "Protective care with reduced chemical and heat exposure",
      },
    }],
  },
  {
    mrn: "DEMO-019",
    sourceCaseIndex: 6,
    name: "Demo Patient 019 — Inflammatory Scarring Alopecia",
    gender: "MALE",
    maritalStatus: "MARRIED",
    dob: "1983-11-09",
    primary: "RV_HAIR_LOSS",
    locale: "en",
    diagnosis: {
      ar: "Lichen Planopilaris / Inflammatory Scarring Alopecia",
      en: "Lichen Planopilaris / Inflammatory Scarring Alopecia",
    },
    patientNarrative: {
      ar: "Progressive temporal thinning with scalp burning, tenderness, and a prior biopsy supporting scarring alopecia.",
      en: "Progressive temporal thinning with scalp burning, tenderness, and a prior biopsy supporting scarring alopecia.",
    },
    occupation: { ar: "Operations director", en: "Operations director" },
    approveHairHistory: true,
    visits: [{
      occurredAt: "2026-07-22T14:00:00.000Z",
      workflowState: "FINALIZED",
      clinical: {
        examination: { hairPull: "POSITIVE", hairParting: ["FRONTAL_THINNER"] },
        measurements: { SHEDDING: 2, DENSITY_LOSS: 4, ITCH: 3, BURNING: 3, SCALP_PAIN: 3 },
        pattern: { mcuFv: { basic: "M1", frontal: "F2" } },
        trichoscopy: {
          selectedFindingCodes: ["PERIFOLLICULAR_SCALE", "PERIFOLLICULAR_ERYTHEMA", "FOLLICULAR_DROPOUT"],
          otherFindingText: "Inflammatory activity is greatest at the advancing temporal margins.",
        },
        anatomicalMap: regions([
          { view: "FRONT", code: "FRONTAL_SCALP", points: [[0.38, 0.23], [0.49, 0.21], [0.60, 0.24]], note: "Frontal inflammatory margin", color: "#B95D50" },
          { view: "RIGHT_SIDE", code: "RIGHT_TEMPORAL", points: [[0.40, 0.33], [0.47, 0.39], [0.44, 0.46]], note: "Active perifollicular change", color: "#B95D50" },
          { view: "LEFT_SIDE", code: "LEFT_TEMPORAL", points: [[0.39, 0.34], [0.46, 0.40], [0.43, 0.46]], note: "Patchy follicular dropout", color: "#8B6F47" },
        ]),
      },
      diagnoses: [{
        key: "lpp",
        action: "ADD",
        text: "Lichen Planopilaris / Inflammatory Scarring Alopecia",
      }],
      treatments: [{
        key: "anti-inflammatory",
        action: "START",
        name: "Topical anti-inflammatory scalp therapy",
        regimenText: "Apply a thin layer to active temporal margins once daily as directed.",
        noteText: "Treatment is directed at inflammatory activity rather than regrowth within established scarred areas.",
      }],
      procedures: [{
        key: "cortisone",
        action: "PLAN",
        procedureCode: "CORTISONE_INJ",
        plannedDate: "2026-08-12",
        noteText: "Plan focal intralesional treatment to the most active temporal margins after interval review.",
      }],
      diagnosisSummary: {
        ar: "Lichen Planopilaris / Inflammatory Scarring Alopecia",
        en: "Lichen Planopilaris / Inflammatory Scarring Alopecia",
      },
      treatmentSummary: {
        ar: "Started anti-inflammatory therapy with planned focal injection treatment",
        en: "Started anti-inflammatory therapy with planned focal injection treatment",
      },
    }],
  },
  {
    mrn: "DEMO-020",
    sourceCaseIndex: 4,
    name: "Demo Patient 020 — Longitudinal Hair Loss",
    gender: "MALE",
    maritalStatus: "MARRIED",
    dob: "1989-06-21",
    primary: "RV_HAIR_LOSS",
    locale: "en",
    diagnosis: { ar: "Androgenetic Alopecia", en: "Androgenetic Alopecia" },
    patientNarrative: {
      ar: "Progressive frontotemporal recession and vertex thinning over several years, with no inflammatory scalp symptoms.",
      en: "Progressive frontotemporal recession and vertex thinning over several years, with no inflammatory scalp symptoms.",
    },
    occupation: { ar: "Financial analyst", en: "Financial analyst" },
    approveHairHistory: true,
    visits: [
      {
        occurredAt: "2026-03-10T09:00:00.000Z",
        workflowState: "FINALIZED",
        clinical: {
          examination: { hairPull: "NEGATIVE", hairParting: ["FRONTAL_THINNER", "VERTEX_THINNER"] },
          measurements: { SHEDDING: 3, DENSITY_LOSS: 4, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
          pattern: {
            mcuFv: { basic: "M2", frontal: "F2", vertex: "V2" },
            hairLineDistanceCm: { midline: 7.2, rightSide: 7.7, leftSide: 7.6 },
          },
          trichoscopy: {
            selectedFindingCodes: ["ANISOTRICHOSIS", "VELLUS_HAIRS", "PERIPILAR_SIGN"],
            otherFindingText: "Baseline miniaturization is present at the frontal scalp and vertex.",
          },
          anatomicalMap: regions([
            { view: "FRONT", code: "FRONTAL_SCALP", points: [[0.38, 0.24], [0.49, 0.21], [0.60, 0.25]], note: "Baseline frontal recession", color: "#B95D50" },
            { view: "TOP", code: "VERTEX_CROWN", points: [[0.47, 0.60], [0.54, 0.64], [0.59, 0.68]], note: "Baseline vertex thinning", color: "#8B6F47" },
          ]),
        },
        diagnoses: [{ key: "aga", action: "ADD", text: "Androgenetic Alopecia — frontotemporal and vertex pattern" }],
        treatments: [{
          key: "minoxidil",
          action: "START",
          name: "Topical minoxidil 5%",
          regimenText: "Apply 1 mL to the frontal scalp and vertex once nightly.",
          noteText: "Baseline photographs reviewed; discussed adherence and the expected response timeline.",
        }],
        procedures: [{
          key: "prp",
          action: "PLAN",
          procedureCode: "PRP",
          plannedDate: "2026-05-19",
          noteText: "Plan one adjunctive session after the initial topical-treatment interval.",
        }],
        diagnosisSummary: {
          ar: "Androgenetic Alopecia — baseline",
          en: "Androgenetic Alopecia — baseline",
        },
        treatmentSummary: {
          ar: "Started topical minoxidil and planned PRP",
          en: "Started topical minoxidil and planned PRP",
        },
      },
      {
        occurredAt: "2026-05-19T10:00:00.000Z",
        workflowState: "FINALIZED",
        patientFollowUp: unchangedHairFollowUp({
          SHEDDING: 2,
          DENSITY: 3,
          ITCH: 0,
          BURNING: 0,
          SCALP_PAIN: 0,
        }),
        clinical: {
          examination: { hairPull: "NEGATIVE", hairParting: ["FRONTAL_THINNER", "VERTEX_THINNER"] },
          measurements: { SHEDDING: 2, DENSITY_LOSS: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
          pattern: {
            mcuFv: { basic: "M2", frontal: "F2", vertex: "V2" },
            hairLineDistanceCm: { midline: 7.2, rightSide: 7.7, leftSide: 7.6 },
          },
          trichoscopy: {
            selectedFindingCodes: ["ANISOTRICHOSIS", "UPRIGHT_REGROWING_HAIRS", "VELLUS_HAIRS"],
            otherFindingText: "Short regrowing hairs are visible at the frontal margin.",
          },
          anatomicalMap: regions([
            { view: "FRONT", code: "FRONTAL_SCALP", points: [[0.39, 0.24], [0.49, 0.22], [0.59, 0.25]], note: "Stable frontal outline", color: "#C28A4B" },
            { view: "TOP", code: "VERTEX_CROWN", points: [[0.48, 0.61], [0.54, 0.64]], note: "Early density response", color: "#668C79" },
          ]),
        },
        diagnoses: [{
          targetKey: "aga",
          action: "REVISE",
          text: "Androgenetic Alopecia — early clinical response",
        }],
        treatments: [{
          targetKey: "minoxidil",
          action: "CONTINUE_EXISTING",
          noteText: "Tolerating treatment; continue the established nightly application.",
        }],
        procedures: [{
          targetKey: "prp",
          action: "PERFORM",
          performedDate: "2026-05-19",
          noteText: "PRP session completed without immediate complication.",
        }],
        diagnosisSummary: {
          ar: "Androgenetic Alopecia — early response",
          en: "Androgenetic Alopecia — early response",
        },
        treatmentSummary: {
          ar: "Continued topical minoxidil and performed PRP",
          en: "Continued topical minoxidil and performed PRP",
        },
      },
      {
        occurredAt: "2026-08-18T10:30:00.000Z",
        workflowState: "FINALIZED",
        patientFollowUp: unchangedHairFollowUp({
          SHEDDING: 1,
          DENSITY: 3,
          ITCH: 0,
          BURNING: 0,
          SCALP_PAIN: 0,
        }),
        clinical: {
          examination: { hairPull: "NEGATIVE", hairParting: ["FRONTAL_THINNER"] },
          measurements: { SHEDDING: 1, DENSITY_LOSS: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
          pattern: {
            mcuFv: { basic: "M2", frontal: "F1", vertex: "V1" },
            hairLineDistanceCm: { midline: 7.2, rightSide: 7.7, leftSide: 7.6 },
          },
          trichoscopy: {
            selectedFindingCodes: ["UPRIGHT_REGROWING_HAIRS", "ANISOTRICHOSIS"],
            otherFindingText: "Improved terminal-hair density is visible across the vertex.",
          },
          anatomicalMap: regions([
            { view: "FRONT", code: "FRONTAL_SCALP", points: [[0.40, 0.24], [0.49, 0.23], [0.58, 0.25]], note: "Stable frontal contour", color: "#668C79" },
            { view: "TOP", code: "VERTEX_CROWN", points: [[0.49, 0.61], [0.54, 0.63]], note: "Improved vertex density", color: "#668C79" },
          ]),
        },
        diagnoses: [{
          targetKey: "aga",
          action: "REVISE",
          text: "Androgenetic Alopecia — sustained clinical improvement",
        }],
        treatments: [{
          targetKey: "minoxidil",
          action: "MODIFY",
          regimenText: "Continue 1 mL nightly using the measured applicator.",
          noteText: "Regimen restated at this visit to support consistent application.",
        }],
        procedures: [],
        diagnosisSummary: {
          ar: "Androgenetic Alopecia — sustained improvement",
          en: "Androgenetic Alopecia — sustained improvement",
        },
        treatmentSummary: {
          ar: "Confirmed the measured nightly minoxidil regimen",
          en: "Confirmed the measured nightly minoxidil regimen",
        },
      },
    ],
  },
] as const;

export function syntheticCaseForDemo(scenario: ClinicianDemoScenario): SyntheticCase {
  return {
    index: scenario.sourceCaseIndex,
    name: scenario.name,
    gender: scenario.gender,
    maritalStatus: scenario.maritalStatus,
    dob: scenario.dob,
    primary: scenario.primary,
    diagnosisAr: scenario.diagnosis.ar,
    diagnosisEn: scenario.diagnosis.en,
    assessmentNoteAr: scenario.patientNarrative.ar,
    assessmentNoteEn: scenario.patientNarrative.en,
    followUps: 0,
    ...(scenario.additional ? { additional: [...scenario.additional] } : {}),
    locale: scenario.locale,
  };
}
