import { getP01Contract, P01_SECTION_ORDER, type P01SectionCode } from "../p01/contracts";
import { localizeDigits } from "../p01/locale";
import { buildStructuredLabelCatalog, presentClinicalValue } from "./presentation";
import type {
  PhysicianClinicalStoryEntry,
  PhysicianClinicalStoryGroup,
  PhysicianClinicalStoryItem,
  PhysicianClinicalStorySection,
  PhysicianClinicalStorySourceRef,
  PhysicianClinicalStoryTimeframe,
  PhysicianFollowUpSection,
  PhysicianInterviewQuestion,
  PhysicianLocalizedText,
  PhysicianVisitSummary,
} from "./types";

type TaggedQuestion = {
  question: PhysicianInterviewQuestion;
  timeframe: PhysicianClinicalStoryTimeframe;
  visitId?: string;
  recordedAt?: string;
};

type ClinicalStoryInput = {
  initialQuestions: PhysicianInterviewQuestion[];
  currentQuestions: PhysicianInterviewQuestion[];
  effectiveQuestions: PhysicianInterviewQuestion[];
  reviewVisit?: PhysicianVisitSummary;
  initialVisit?: PhysicianVisitSummary;
  followUpSections?: PhysicianFollowUpSection[];
};

type ClinicalSectionCode = Exclude<P01SectionCode, "PRIVACY" | "PROFILE">;

type SectionDefinition = {
  code: ClinicalSectionCode;
  title: PhysicianLocalizedText;
  description: PhysicianLocalizedText;
};

type GroupDefinition = {
  id: string;
  title: PhysicianLocalizedText;
};

const SECTION_COPY: Record<ClinicalSectionCode, Omit<SectionDefinition, "code">> = {
  VISIT_REASON: {
    title: { ar: "سبب الزيارة", en: "Visit Reason" },
    description: { ar: "سبب المراجعة والخدمات الإضافية المسجلة.", en: "Recorded reason for review and additional services." },
  },
  HEALTH_SNAPSHOT: {
    title: { ar: "الصحة العامة", en: "General Health" },
    description: { ar: "الحالات الصحية والأدوية والمكملات والحساسيات والأحداث الصحية المسجلة.", en: "Recorded health conditions, medications, supplements, allergies, and health events." },
  },
  HAIR_LOSS: {
    title: { ar: "مشكلة الشعر", en: "Hair Loss" },
    description: { ar: "الشكوى والبداية والمسار والتوزيع والشدة كما سجلها المراجع.", en: "Recorded concern, onset, course, distribution, and severity." },
  },
  SCALP: {
    title: { ar: "فروة الرأس", en: "Scalp" },
    description: { ar: "الأعراض وشدتها وتوقيتها والعوامل المؤثرة المسجلة.", en: "Recorded symptoms, severity, timing, and modifying factors." },
  },
  SHARED_HISTORY: {
    title: { ar: "تاريخ الشعر والفروة", en: "Hair and Scalp History" },
    description: { ar: "التشخيصات والفحوصات والعلاجات والإجراءات السابقة.", en: "Previous diagnoses, tests, treatments, and procedures." },
  },
  COURSE_IMPACT: {
    title: { ar: "المسار والأثر", en: "Course and Impact" },
    description: { ar: "الأحداث المرتبطة والمسار والأثر المسجل على المراجع.", en: "Recorded related events, course, and patient impact." },
  },
  LIFESTYLE_NUTRITION: {
    title: { ar: "نمط الحياة والتغذية", en: "Lifestyle and Nutrition" },
    description: { ar: "عوامل نمط الحياة والتغذية ذات الصلة.", en: "Relevant recorded lifestyle and nutrition factors." },
  },
  WOMENS_HEALTH: {
    title: { ar: "صحة المرأة", en: "Women's Health" },
    description: { ar: "الدورة والهرمونات والخصوبة والسياق الصحي المسجل.", en: "Recorded menstrual, hormonal, fertility, and related health context." },
  },
  MENS_HEALTH: {
    title: { ar: "صحة الرجل", en: "Men's Health" },
    description: { ar: "الصحة الجنسية والإنجابية والهرمونات المسجلة.", en: "Recorded sexual, reproductive, and hormone context." },
  },
  PREGNANCY_CONTEXT: {
    title: { ar: "سياق الحمل", en: "Pregnancy Context" },
    description: { ar: "الحمل والرضاعة والتخطيط للحمل كما سُجلت.", en: "Recorded pregnancy, breastfeeding, and pregnancy-planning context." },
  },
  HAIR_QUALITY: {
    title: { ar: "جودة الشعر وروتين العناية", en: "Hair Quality and Care Routine" },
    description: { ar: "حالة الشعرة والعناية والمعالجات والعادات المسجلة.", en: "Recorded hair state, care, treatments, and routine." },
  },
  DERMATOLOGY: {
    title: { ar: "المشكلة الجلدية", en: "Dermatology Concern" },
    description: { ar: "وصف المراجع للمشكلة الجلدية.", en: "The patient's recorded dermatology concern." },
  },
  LASER: {
    title: { ar: "الليزر", en: "Laser" },
    description: { ar: "الطلب والمناطق والتاريخ والهدف المسجل.", en: "Recorded request, areas, history, and goal." },
  },
  AESTHETIC_PROCEDURES: {
    title: { ar: "الإجراءات التجميلية", en: "Aesthetic Procedures" },
    description: { ar: "الإجراءات المطلوبة والمناطق والهدف والتاريخ المسجل.", en: "Recorded requested procedures, areas, goal, and history." },
  },
};

const SECTION_DEFINITIONS: SectionDefinition[] = P01_SECTION_ORDER
  .filter((code): code is ClinicalSectionCode => code !== "PRIVACY" && code !== "PROFILE")
  .map((code) => ({ code, ...SECTION_COPY[code] }));

const GROUPS = {
  visit: { id: "visit-context", title: { ar: "سياق الزيارة", en: "Visit context" } },
  healthConditions: { id: "health-conditions", title: { ar: "الحالات الصحية", en: "Health conditions" } },
  medicines: { id: "medications", title: { ar: "الأدوية", en: "Medications" } },
  supplements: { id: "supplements", title: { ar: "الفيتامينات والمكملات", en: "Vitamins and supplements" } },
  allergies: { id: "allergies", title: { ar: "الحساسيات", en: "Allergies" } },
  healthEvents: { id: "health-events", title: { ar: "الجراحات أو التنويم", en: "Surgeries or hospitalizations" } },
  concern: { id: "current-concern", title: { ar: "الشكوى الحالية", en: "Current concern" } },
  onsetCourse: { id: "onset-course", title: { ar: "البداية والمسار", en: "Onset and course" } },
  measures: { id: "measures", title: { ar: "الشدة والمقاييس", en: "Severity and measures" } },
  observations: { id: "observations", title: { ar: "الملاحظات والتوزيع", en: "Observed changes and distribution" } },
  symptoms: { id: "symptoms", title: { ar: "الأعراض", en: "Symptoms" } },
  modifiers: { id: "modifiers", title: { ar: "التوقيت والعوامل المؤثرة", en: "Timing and modifying factors" } },
  diagnoses: { id: "diagnoses", title: { ar: "التشخيصات السابقة", en: "Previous diagnoses" } },
  tests: { id: "tests", title: { ar: "الفحوصات والخزعات", en: "Tests and biopsy" } },
  treatments: { id: "treatments", title: { ar: "العلاجات", en: "Treatments" } },
  procedures: { id: "procedures", title: { ar: "الإجراءات والجلسات", en: "Procedures and sessions" } },
  triggers: { id: "triggers", title: { ar: "الأحداث المرتبطة", en: "Related events" } },
  impact: { id: "impact", title: { ar: "المسار والأثر", en: "Course and impact" } },
  menstrual: { id: "menstrual", title: { ar: "الدورة والنزف", en: "Menstrual pattern and bleeding" } },
  androgen: { id: "androgen", title: { ar: "حب الشباب والدهنية وزيادة الشعر", en: "Acne, oiliness, and hirsutism" } },
  fertility: { id: "fertility", title: { ar: "الخصوبة ووسائل منع الحمل", en: "Fertility and contraception" } },
  intimate: { id: "intimate", title: { ar: "الرغبة والصحة الجنسية", en: "Desire and sexual health" } },
  hormones: { id: "hormones", title: { ar: "الهرمونات أو المنشطات", en: "Hormones or steroids" } },
  pregnancy: { id: "pregnancy", title: { ar: "الحمل والرضاعة والتخطيط", en: "Pregnancy, breastfeeding, and planning" } },
  hairState: { id: "hair-state", title: { ar: "حالة الشعرة", en: "Hair state" } },
  care: { id: "care-routine", title: { ar: "روتين العناية", en: "Care routine" } },
  changes: { id: "routine-change", title: { ar: "التغيرات المسجلة", en: "Recorded changes" } },
  request: { id: "request-details", title: { ar: "تفاصيل الطلب", en: "Request details" } },
  lifestyle: { id: "lifestyle", title: { ar: "العوامل المسجلة", en: "Recorded factors" } },
} satisfies Record<string, GroupDefinition>;

function groupFor(section: ClinicalSectionCode, code: string): GroupDefinition {
  if (section === "VISIT_REASON") return GROUPS.visit;
  if (section === "HEALTH_SNAPSHOT") {
    if (code.includes("MEDICATION")) return GROUPS.medicines;
    if (code.includes("SUPPLEMENT")) return GROUPS.supplements;
    if (code.includes("ALLERGY")) return GROUPS.allergies;
    if (code.includes("SURGERY")) return GROUPS.healthEvents;
    return GROUPS.healthConditions;
  }
  if (section === "HAIR_LOSS") {
    if (/ONSET|COURSE|SPEED/.test(code)) return GROUPS.onsetCourse;
    if (/SEVERITY/.test(code)) return GROUPS.measures;
    if (/EVIDENCE|AREAS/.test(code)) return GROUPS.observations;
    return GROUPS.concern;
  }
  if (section === "SCALP") return /WORSEN|RELIEV|TIMING/.test(code) ? GROUPS.modifiers : GROUPS.symptoms;
  if (section === "SHARED_HISTORY") {
    if (/DIAGNOS/.test(code)) return GROUPS.diagnoses;
    if (/BIOPSY|TEST|LAB/.test(code)) return GROUPS.tests;
    if (/PROCEDURE/.test(code)) return GROUPS.procedures;
    return GROUPS.treatments;
  }
  if (section === "COURSE_IMPACT") return /TRIGGER/.test(code) ? GROUPS.triggers : GROUPS.impact;
  if (section === "LIFESTYLE_NUTRITION") return GROUPS.lifestyle;
  if (section === "WOMENS_HEALTH") {
    if (/IRREGULAR|HEAVY|SCANT|PREMENSTRUAL|ABSENT/.test(code) || code === "Q_WOMENS_HEALTH") return GROUPS.menstrual;
    if (/ACNE|OILINESS|HIRSUTISM/.test(code)) return GROUPS.androgen;
    if (/FERTILITY|GYN|CONTRACEPTION/.test(code)) return GROUPS.fertility;
    return GROUPS.intimate;
  }
  if (section === "MENS_HEALTH") return /HORMONE|STEROID/.test(code) ? GROUPS.hormones : GROUPS.intimate;
  if (section === "PREGNANCY_CONTEXT") return GROUPS.pregnancy;
  if (section === "HAIR_QUALITY") {
    if (/PREVIOUS_TREATMENT|DRUG_EXPOSURE/.test(code)) return GROUPS.treatments;
    if (/ROUTINE_CHANGE/.test(code)) return GROUPS.changes;
    if (/HAIR_STATE|NATURAL_PATTERN|CURRENT_PROBLEMS/.test(code)) return GROUPS.hairState;
    return GROUPS.care;
  }
  return GROUPS.request;
}

const CLINICAL_LABELS: Record<string, PhysicianLocalizedText> = {
  Q_VISIT_PRIMARY_REASON: { ar: "السبب الرئيسي", en: "Primary reason" },
  Q_VISIT_ADDITIONAL_REASONS: { ar: "خدمات إضافية", en: "Additional services" },
  Q_VISIT_ADDITIONAL_REQUESTS: { ar: "خدمات إضافية", en: "Additional services" },
  Q_HEALTH_SNAPSHOT: { ar: "ملخص الصحة العامة", en: "General-health overview" },
  Q_HAIR_CONCERN: { ar: "الشكوى", en: "Concern" },
  Q_HAIR_EVIDENCE: { ar: "الملاحظات", en: "Observed evidence" },
  Q_HAIR_EVIDENCE_OTHER: { ar: "وصف المراجع", en: "Patient wording" },
  Q_HAIR_THINNING_AREAS: { ar: "التوزيع", en: "Distribution" },
  Q_HAIR_SHEDDING_ONSET: { ar: "بداية التساقط", en: "Shedding onset" },
  Q_HAIR_THINNING_ONSET: { ar: "بداية نقص الكثافة", en: "Density-loss onset" },
  Q_HAIR_SHEDDING_COURSE: { ar: "مسار التساقط", en: "Shedding course" },
  Q_HAIR_THINNING_COURSE: { ar: "مسار نقص الكثافة", en: "Density-loss course" },
  Q_HAIR_THINNING_SPEED: { ar: "سرعة التغير", en: "Pace of change" },
  Q_HAIR_SHEDDING_SEVERITY: { ar: "شدة التساقط", en: "Shedding severity" },
  Q_HAIR_DENSITY_SEVERITY: { ar: "شدة نقص الكثافة", en: "Density-loss severity" },
  Q_HAIR_SHED_ROOT_BULB: { ar: "وجود جذر أو انتفاخ بالشعرة المتساقطة", en: "Root or bulb on shed hairs" },
  Q_HAIR_SHORT_REGROWTH_SHEDDING: { ar: "تساقط الشعر القصير حديث النمو", en: "Short regrowth shedding" },
  Q_SCALP_SYMPTOMS: { ar: "الأعراض الحالية", en: "Current symptoms" },
  Q_SCALP_SYMPTOM_DETAILS: { ar: "تفاصيل الأعراض", en: "Symptom details" },
  Q_SCALP_OTHER_TEXT: { ar: "العرض الآخر", en: "Other symptom" },
  Q_SCALP_WORSENING: { ar: "وجود عوامل تزيد الأعراض", en: "Worsening factors present" },
  Q_SCALP_WORSENING_DETAIL: { ar: "العوامل التي تزيد الأعراض", en: "Worsening factors" },
  Q_SCALP_RELIEVING: { ar: "وجود عوامل تخفف الأعراض", en: "Relieving factors present" },
  Q_SCALP_RELIEVING_DETAIL: { ar: "العوامل التي تخفف الأعراض", en: "Relieving factors" },
  Q_SCALP_TIMING_GATE: { ar: "ارتباط الأعراض بوقت أو ظرف", en: "Timing or circumstance association" },
  Q_SCALP_TIMING_DETAIL: { ar: "الوقت أو الظرف", en: "Timing or circumstance" },
  Q_OVERALL_COURSE: { ar: "المسار العام", en: "Overall course" },
  Q_PATIENT_BOTHER: { ar: "درجة الانزعاج", en: "Bother" },
  Q_CONFIDENCE_IMPACT: { ar: "الأثر على الثقة", en: "Confidence impact" },
  Q_TREATMENT_PREFERENCE: { ar: "تفضيل مستوى العلاج", en: "Treatment preference" },
  Q_RESULT_SPEED_EXPECTATION: { ar: "توقع مدة ظهور النتيجة", en: "Result-timing expectation" },
  Q_PRIOR_DIAGNOSIS_GATE: { ar: "وجود تشخيص سابق", en: "Previous diagnosis present" },
  Q_PRIOR_DIAGNOSES: { ar: "التشخيصات", en: "Diagnoses" },
  Q_PRIOR_DIAGNOSIS_DETAILS: { ar: "تفاصيل التشخيصات", en: "Diagnosis details" },
  Q_PRIOR_DIAGNOSIS_OTHER: { ar: "التشخيص الآخر", en: "Other diagnosis" },
  Q_SCALP_BIOPSY_GATE: { ar: "خزعة سابقة لفروة الرأس", en: "Previous scalp biopsy" },
  Q_SCALP_BIOPSY_DATE: { ar: "تاريخ الخزعة", en: "Biopsy date" },
  Q_SCALP_BIOPSY_AREA: { ar: "موضع الخزعة", en: "Biopsy site" },
  Q_SCALP_BIOPSY_RESULT_KNOWN: { ar: "معرفة النتيجة", en: "Result known" },
  Q_SCALP_BIOPSY_RESULT_TEXT: { ar: "النتيجة كما يتذكرها المراجع", en: "Result as recalled" },
  Q_HAIR_TREATMENT_GATE: { ar: "استخدام علاج للشعر أو الفروة", en: "Hair/scalp treatment use" },
  Q_HAIR_TREATMENT_ITEMS: { ar: "علاجات الشعر وفروة الرأس", en: "Hair/scalp treatments" },
  Q_HAIR_PROCEDURE_GATE: { ar: "وجود إجراءات سابقة للشعر أو الفروة", en: "Previous hair/scalp procedures" },
  Q_HAIR_PROCEDURES: { ar: "الإجراءات السابقة", en: "Previous procedures" },
  Q_HAIR_PROCEDURE_DETAILS: { ar: "تفاصيل الإجراءات السابقة", en: "Previous procedure details" },
  Q_TRIGGER_EVENTS: { ar: "الأحداث المرتبطة", en: "Related events" },
  Q_TRIGGER_EVENT_DETAILS: { ar: "تفاصيل الأحداث", en: "Event details" },
  Q_TRIGGER_EVENTS_FEMALE: { ar: "أحداث مرتبطة بصحة المرأة", en: "Women's-health related events" },
  Q_TRIGGER_EVENTS_FEMALE_DETAILS: { ar: "تفاصيل الأحداث المرتبطة بصحة المرأة", en: "Women's-health event details" },
  Q_TRIGGER_EVENTS_MALE: { ar: "أحداث مرتبطة بصحة الرجل", en: "Men's-health related events" },
  Q_TRIGGER_EVENTS_MALE_DETAILS: { ar: "تفاصيل الأحداث المرتبطة بصحة الرجل", en: "Men's-health event details" },
  Q_LIFESTYLE_WEIGHT_GAIN: { ar: "صعوبة زيادة الوزن", en: "Difficulty gaining weight" },
  Q_LIFESTYLE_NO_VEGETABLES: { ar: "قلة تناول الخضروات", en: "Low vegetable intake" },
  Q_LIFESTYLE_NO_RED_MEAT: { ar: "عدم تناول اللحوم الحمراء", en: "No red-meat intake" },
  Q_LIFESTYLE_CHRONIC_DIARRHEA: { ar: "الإسهال المزمن", en: "Chronic diarrhea" },
  Q_LIFESTYLE_BARIATRIC_SURGERY: { ar: "جراحة سابقة لإنقاص الوزن", en: "Previous weight-loss surgery" },
  Q_LIFESTYLE_SMOKING_VAPE: { ar: "التدخين أو السجائر الإلكترونية", en: "Smoking or vaping" },
  Q_LIFESTYLE_BARIATRIC_DETAILS: { ar: "تفاصيل جراحة إنقاص الوزن", en: "Weight-loss surgery details" },
  Q_LIFESTYLE_HAIR_CONCEALMENT: { ar: "وسائل إخفاء مشكلة الشعر", en: "Hair-concealment methods" },
  Q_WOMENS_HEALTH: { ar: "الأعراض المسجلة", en: "Recorded symptoms" },
  Q_WOMEN_IRREGULAR_ONSET: { ar: "بداية عدم الانتظام", en: "Irregularity onset" },
  Q_WOMEN_IRREGULAR_DURATION: { ar: "مدة النزف", en: "Bleeding duration" },
  Q_WOMEN_IRREGULAR_INTERVAL: { ar: "الفاصل بين الدورات", en: "Cycle interval" },
  Q_WOMEN_HEAVY_SIGNS: { ar: "علامات غزارة النزف", en: "Heavy-bleeding signs" },
  Q_WOMEN_SCANT_SIGNS: { ar: "علامات قلة النزف", en: "Scant-bleeding signs" },
  Q_WOMEN_PREMENSTRUAL_SYMPTOMS: { ar: "أعراض ما قبل الدورة", en: "Premenstrual symptoms" },
  Q_WOMEN_ACNE_ONSET: { ar: "بداية حب الشباب", en: "Acne onset" },
  Q_WOMEN_ACNE_PATTERN: { ar: "نمط حب الشباب", en: "Acne pattern" },
  Q_WOMEN_OILINESS_AREA: { ar: "موضع الدهنية", en: "Oiliness area" },
  Q_WOMEN_OILINESS_ONSET: { ar: "بداية الدهنية", en: "Oiliness onset" },
  Q_WOMEN_HIRSUTISM_AREAS: { ar: "مواضع زيادة الشعر", en: "Hirsutism areas" },
  Q_WOMEN_HIRSUTISM_ONSET: { ar: "بداية زيادة الشعر", en: "Hirsutism onset" },
  Q_WOMEN_FERTILITY_STATUS: { ar: "القدرة على الحمل", en: "Conceiving status" },
  Q_WOMEN_GYN_EVALUATED: { ar: "التقييم النسائي", en: "Gynecologic evaluation" },
  Q_WOMEN_CONTRACEPTION_STATUS: { ar: "استخدام مانع الحمل", en: "Contraception status" },
  Q_WOMEN_CONTRACEPTION_TYPE: { ar: "نوع مانع الحمل", en: "Contraception type" },
  Q_WOMEN_CONTRACEPTION_NAME: { ar: "اسم مانع الحمل", en: "Contraception name" },
  Q_WOMEN_INTIMATE_DESIRE: { ar: "الرغبة", en: "Intimate desire" },
  Q_WOMEN_INTIMATE_DESIRE_ONSET: { ar: "بداية التغير", en: "Change onset" },
  Q_MENS_HEALTH: { ar: "الأعراض المسجلة", en: "Recorded symptoms" },
  Q_MEN_LIBIDO_ONSET: { ar: "بداية انخفاض الرغبة", en: "Decreased-desire onset" },
  Q_MEN_LIBIDO_MED_RELATION: { ar: "ارتباط انخفاض الرغبة بدواء أو علاج", en: "Medication relation" },
  Q_MEN_LIBIDO_MED_NAME: { ar: "الدواء أو العلاج المرتبط", en: "Related medication or treatment" },
  Q_MEN_ERECTION_ONSET: { ar: "بداية صعوبة الانتصاب", en: "Erection-difficulty onset" },
  Q_MEN_ERECTION_FREQUENCY: { ar: "تكرار صعوبة الانتصاب", en: "Erection-difficulty frequency" },
  Q_MEN_ERECTION_MED_RELATION: { ar: "ارتباط الصعوبة بدواء أو علاج", en: "Medication relation" },
  Q_MEN_ERECTION_MED_NAME: { ar: "الدواء أو العلاج المرتبط", en: "Related medication or treatment" },
  Q_MEN_BREAST_CHANGE: { ar: "نوع تغير الثدي", en: "Breast change" },
  Q_MEN_BREAST_ONSET: { ar: "بداية تغير الثدي", en: "Breast-change onset" },
  Q_MEN_BREAST_MED_RELATION: { ar: "ارتباط تغير الثدي بدواء أو علاج", en: "Medication relation" },
  Q_MEN_BREAST_MED_NAME: { ar: "الدواء أو العلاج المرتبط", en: "Related medication or treatment" },
  Q_MEN_BODY_HAIR_AREAS: { ar: "مواضع نقص شعر الوجه أو الجسم", en: "Reduced face/body-hair areas" },
  Q_MEN_BODY_HAIR_ONSET: { ar: "بداية نقص شعر الوجه أو الجسم", en: "Body-hair change onset" },
  Q_MEN_BODY_HAIR_PATTERN: { ar: "نمط تغير شعر الوجه أو الجسم", en: "Body-hair change pattern" },
  Q_MEN_MUSCLE_CHANGE: { ar: "نوع تغير العضلات", en: "Muscle change" },
  Q_MEN_MUSCLE_ONSET: { ar: "بداية تغير العضلات", en: "Muscle-change onset" },
  Q_MEN_MUSCLE_ACTIVITY_RELATION: { ar: "ارتباط التغير بالوزن أو النشاط", en: "Weight or activity relation" },
  Q_MEN_FERTILITY_SHORT: { ar: "صعوبة الإنجاب سابقًا", en: "Previous difficulty conceiving" },
  Q_MEN_HORMONES_STEROIDS: { ar: "الاستخدام", en: "Use" },
  Q_MEN_HORMONE_NAME: { ar: "اسم الهرمون أو المنشط", en: "Hormone or steroid name" },
  Q_MEN_HORMONE_START: { ar: "البداية", en: "Started" },
  Q_MEN_HORMONE_STOP: { ar: "التوقف", en: "Stopped" },
  Q_MEN_HORMONE_HAIR_CHANGE: { ar: "تغير الشعر أو الفروة", en: "Hair/scalp change" },
  Q_MEN_HORMONE_HAIR_CHANGE_TYPES: { ar: "نوع تغير الشعر أو الفروة", en: "Hair/scalp change type" },
  Q_PREGNANCY_BREASTFEEDING_STATUS: { ar: "الحالة الحالية", en: "Current status" },
  Q_PREGNANCY_MONTH: { ar: "شهر الحمل", en: "Pregnancy month" },
  Q_PREGNANCY_PLANNING: { ar: "التخطيط للحمل", en: "Pregnancy planning" },
  Q_BREASTFEEDING_ONSET: { ar: "بداية الرضاعة", en: "Breastfeeding onset" },
  Q_HQ_HAIR_STATE: { ar: "حالة الشعر", en: "Hair state" },
  Q_HQ_PREVIOUS_TREATMENTS: { ar: "المعالجات الكيميائية السابقة", en: "Previous chemical treatments" },
  Q_HQ_PREVIOUS_TREATMENT_DETAILS: { ar: "تفاصيل المعالجات السابقة", en: "Previous treatment details" },
  Q_HQ_DRUG_EXPOSURES: { ar: "الأدوية أو العلاجات المستخدمة", en: "Medication or treatment exposure" },
  Q_HQ_DRUG_EXPOSURE_DETAILS: { ar: "تفاصيل الأدوية أو العلاجات", en: "Medication or treatment details" },
  Q_HQ_NATURAL_PATTERN: { ar: "النمط الطبيعي", en: "Natural pattern" },
  Q_HQ_CURRENT_PROBLEMS: { ar: "المشكلات الحالية", en: "Current problems" },
  Q_HQ_HEAT_TOOLS: { ar: "أدوات الحرارة", en: "Heat tools" },
  Q_HQ_HEAT_TOOL_DETAILS: { ar: "تكرار استخدام أدوات الحرارة", en: "Heat-tool frequency" },
  Q_HQ_HEAT_PROTECTANT: { ar: "واقي الحرارة", en: "Heat protectant" },
  Q_HQ_WASH_FREQUENCY: { ar: "تكرار الغسل أسبوعيًا", en: "Weekly wash frequency" },
  Q_HQ_CLEANSERS: { ar: "المنظفات أو الشامبو", en: "Cleansers or shampoo" },
  Q_HQ_CLEANSER_OTHER: { ar: "المنظف الآخر", en: "Other cleanser" },
  Q_HQ_ROUTINE_ITEMS: { ar: "عناصر روتين العناية", en: "Care-routine items" },
  Q_HQ_ROUTINE_DETAILS: { ar: "تكرار استخدام عناصر الروتين", en: "Routine-item frequency" },
  Q_HQ_ROUTINE_ADHERENCE: { ar: "الالتزام بالروتين", en: "Routine consistency" },
  Q_HQ_ROUTINE_CHANGED: { ar: "تغير الروتين", en: "Routine changed" },
  Q_HQ_ROUTINE_CHANGE_TEXT: { ar: "التغير كما وصفه المراجع", en: "Change in the patient's words" },
  Q_HQ_ROUTINE_CHANGE_DATE: { ar: "بداية التغير", en: "Change onset" },
  Q_HQ_POST_WASH_ORDER: { ar: "ترتيب العناية بعد الغسل", en: "After-wash care order" },
  Q_DERMATOLOGY_CONCERN: { ar: "وصف المراجع", en: "Patient description" },
  Q_LASER_CONCERNS: { ar: "طلبات الليزر", en: "Laser requests" },
  Q_LASER_CONCERN_DETAILS: { ar: "تفاصيل طلب الليزر", en: "Laser-request details" },
  Q_AESTHETIC_PROCEDURES: { ar: "الإجراءات المطلوبة", en: "Requested procedures" },
  Q_AESTHETIC_DETAILS: { ar: "تفاصيل الإجراء المطلوب", en: "Requested-procedure details" },
};

const CONTEXTUAL_NEGATIVES: Partial<Record<string, PhysicianLocalizedText>> = {
  Q_HEALTH_SNAPSHOT: { ar: "لا توجد حالات صحية من القائمة مسجلة", en: "No listed health conditions are recorded" },
  Q_TRIGGER_EVENTS: { ar: "لا توجد أحداث محفزة من القائمة مسجلة", en: "No listed trigger events are recorded" },
  Q_TRIGGER_EVENTS_FEMALE: { ar: "لا توجد أحداث مرتبطة بصحة المرأة من القائمة مسجلة", en: "No listed women's-health trigger events are recorded" },
  Q_TRIGGER_EVENTS_MALE: { ar: "لا توجد أحداث مرتبطة بصحة الرجل من القائمة مسجلة", en: "No listed men's-health trigger events are recorded" },
  Q_WOMENS_HEALTH: { ar: "لا توجد أعراض من قائمة صحة المرأة مسجلة", en: "No listed Women's Health symptoms are recorded" },
  Q_MENS_HEALTH: { ar: "لا توجد أعراض من قائمة صحة الرجل مسجلة", en: "No listed Men's Health symptoms are recorded" },
  Q_HQ_PREVIOUS_TREATMENTS: { ar: "لا توجد معالجات كيميائية سابقة للشعر مسجلة", en: "No prior chemical hair treatments are recorded" },
  Q_HQ_DRUG_EXPOSURES: { ar: "لا توجد تعرضات دوائية مرتبطة بجودة الشعر مسجلة", en: "No medication exposures related to hair quality are recorded" },
  Q_HQ_CURRENT_PROBLEMS: { ar: "لا توجد مشكلات حالية من قائمة جودة الشعر مسجلة", en: "No listed current hair-quality problems are recorded" },
};

const IMPLEMENTATION_ONLY_CODES = new Set(["Q_PRIVACY_CONSENT", "Q_SECONDARY_SCALP_GATE", "Q_SECONDARY_HAIR_GATE"]);

const DETAIL_PARENT_CODES: Record<string, string[]> = {
  Q_SCALP_SYMPTOM_DETAILS: ["Q_SCALP_SYMPTOMS"],
  Q_PRIOR_DIAGNOSIS_DETAILS: ["Q_PRIOR_DIAGNOSES"],
  Q_HAIR_PROCEDURE_DETAILS: ["Q_HAIR_PROCEDURES"],
  Q_HQ_PREVIOUS_TREATMENT_DETAILS: ["Q_HQ_PREVIOUS_TREATMENTS"],
  Q_HQ_DRUG_EXPOSURE_DETAILS: ["Q_HQ_DRUG_EXPOSURES"],
  Q_TRIGGER_EVENT_DETAILS: ["Q_TRIGGER_EVENTS"],
  Q_TRIGGER_EVENTS_FEMALE_DETAILS: ["Q_TRIGGER_EVENTS_FEMALE"],
  Q_TRIGGER_EVENTS_MALE_DETAILS: ["Q_TRIGGER_EVENTS_MALE"],
  Q_AESTHETIC_DETAILS: ["Q_AESTHETIC_PROCEDURES"],
  Q_LASER_CONCERN_DETAILS: ["Q_LASER_CONCERNS"],
};

const PARENT_CODES = new Set(Object.values(DETAIL_PARENT_CODES).flat());
const TIMEFRAME_ORDER: PhysicianClinicalStoryTimeframe[] = ["CURRENT", "BASELINE", "PRIOR_FOLLOW_UP", "CURRENT_FOLLOW_UP"];

function taggedQuestions(input: ClinicalStoryInput): TaggedQuestion[] {
  if (input.reviewVisit?.visitType !== "FOLLOW_UP") {
    return input.effectiveQuestions.map((question) => ({ question, timeframe: "CURRENT", ...(input.reviewVisit ? { visitId: input.reviewVisit.id, recordedAt: input.reviewVisit.createdAt } : {}) }));
  }
  const initialByScope = new Map(input.initialQuestions.map((question) => [
    `${question.code}:${question.responseScopeType}:${question.responseScopeKey}`,
    question,
  ]));
  const changedCurrentQuestions = input.currentQuestions.filter((question) => {
    const baseline = initialByScope.get(`${question.code}:${question.responseScopeType}:${question.responseScopeKey}`);
    return !baseline || JSON.stringify([baseline.value, baseline.repeatableItems]) !== JSON.stringify([question.value, question.repeatableItems]);
  });
  return [
    ...input.initialQuestions.map((question): TaggedQuestion => ({ question, timeframe: "BASELINE", ...(input.initialVisit ? { visitId: input.initialVisit.id, recordedAt: input.initialVisit.createdAt } : {}) })),
    ...changedCurrentQuestions.map((question): TaggedQuestion => ({ question, timeframe: "CURRENT_FOLLOW_UP", visitId: input.reviewVisit!.id, recordedAt: input.reviewVisit!.createdAt })),
  ];
}

function pairedLines(question: PhysicianInterviewQuestion, catalog: ReturnType<typeof buildStructuredLabelCatalog>): PhysicianLocalizedText[] {
  const ar = presentClinicalValue(question, "ar", catalog).lines;
  const en = presentClinicalValue(question, "en", catalog).lines;
  return Array.from({ length: Math.max(ar.length, en.length) }, (_, index) => ({ ar: ar[index] ?? en[index] ?? "—", en: en[index] ?? ar[index] ?? "—" }))
    .filter((value) => !["غير مسجل", "Not recorded", "—"].includes(value.ar) && !["غير مسجل", "Not recorded", "—"].includes(value.en));
}

function recordedCodes(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function meaningfulLines(question: PhysicianInterviewQuestion, catalog: ReturnType<typeof buildStructuredLabelCatalog>): PhysicianLocalizedText[] {
  const codes = recordedCodes(question.value);
  if (codes.length > 0 && codes.every((code) => code === "NONE" || code === "NONE_OF_THE_ABOVE")) {
    const wording = CONTEXTUAL_NEGATIVES[question.code];
    if (wording) return [wording];
  }
  let lines = pairedLines(question, catalog);
  if (question.code === "Q_AESTHETIC_DETAILS" || question.code === "Q_LASER_CONCERN_DETAILS") {
    const record = question.value && typeof question.value === "object" && !Array.isArray(question.value) ? question.value as Record<string, unknown> : {};
    lines = lines.filter((line) => !/^(إجراء سابق|Prior treatment|مضاعفات|المضاعفات|Complications):/.test(`${line.ar}:${line.en}`));
    if (record.prior === "NO") {
      lines.push(question.code === "Q_AESTHETIC_DETAILS"
        ? { ar: "لا يوجد إجراء سابق مسجل لهذا الطلب", en: "No prior procedure is recorded for this request" }
        : { ar: "لا يوجد علاج ليزر أو ضوء سابق مسجل لهذا الطلب", en: "No prior laser or light treatment is recorded for this request" });
    } else if (record.prior === "YES" && record.complications === "NO") lines.push({ ar: "لا توجد مضاعفات مسجلة", en: "No complications are recorded" });
  }
  return lines;
}

function clinicalDateKey(value: unknown): string | null {
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4})(?:[-/]?(\d{1,2}))?(?:[-/]?(\d{1,2}))?$/);
    return match ? `${match[1]}-${String(match[2] ?? "1").padStart(2, "0")}-${String(match[3] ?? "1").padStart(2, "0")}` : null;
  }
  if (Array.isArray(value)) return value.map(clinicalDateKey).filter((item): item is string => Boolean(item)).sort()[0] ?? null;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const normalized = record.normalizedGregorian;
  if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    const date = normalized as Record<string, unknown>;
    if (typeof date.year === "number") return `${date.year}-${String(typeof date.month === "number" ? date.month : 1).padStart(2, "0")}-${String(typeof date.day === "number" ? date.day : 1).padStart(2, "0")}`;
  }
  if (typeof record.year === "number") return `${record.year}-${String(typeof record.month === "number" ? record.month : 1).padStart(2, "0")}-${String(typeof record.day === "number" ? record.day : 1).padStart(2, "0")}`;
  return Object.values(record).map(clinicalDateKey).filter((item): item is string => Boolean(item)).sort()[0] ?? null;
}

function entryType(question: PhysicianInterviewQuestion, repeatable: boolean): PhysicianClinicalStoryEntry["valueType"] {
  if (repeatable) return "RECORD";
  if (question.responseType === "SCALE") return "MEASURE";
  if (question.responseType === "TEXT" || question.responseType === "LONG_TEXT") return "FREE_TEXT";
  return "STRUCTURED";
}

function normalizeMeasure(question: PhysicianInterviewQuestion, values: PhysicianLocalizedText[]): PhysicianLocalizedText[] {
  if (question.responseType !== "SCALE") return values;
  return values.map((value) => ({
    ar: value.ar.includes("/5") ? value.ar.replace(/([٠-٥0-5])\s*\/\s*[٥5]/g, (_, score: string) => `${localizeDigits(score, "ar")} من ٥`) : `${localizeDigits(value.ar, "ar")} من ٥`,
    en: value.en.includes("/5") ? value.en.replace(/([0-5])\s*\/\s*5/g, "$1 of 5") : `${value.en} of 5`,
  }));
}

function entriesFor(tagged: TaggedQuestion, catalog: ReturnType<typeof buildStructuredLabelCatalog>): Array<PhysicianClinicalStoryEntry & { dateKey: string | null }> {
  const { question } = tagged;
  if (question.repeatableItems.length === 0) {
    const values = normalizeMeasure(question, meaningfulLines(question, catalog));
    return values.length === 0 ? [] : [{ id: `${question.id}:value`, values, valueType: entryType(question, false), patientAuthored: question.responseType === "TEXT" || question.responseType === "LONG_TEXT", dateKey: clinicalDateKey(question.value) }];
  }
  return question.repeatableItems.flatMap((record, index) => {
    const values = pairedLines({ ...question, value: [], repeatableItems: [record] }, catalog);
    return values.length === 0 ? [] : [{ id: `${question.id}:record:${index}`, values, valueType: "RECORD" as const, patientAuthored: true, dateKey: clinicalDateKey(record) }];
  });
}

function sourceRefsFor(taggedQuestions: TaggedQuestion[]): PhysicianClinicalStorySourceRef[] {
  const refs = new Map<string, PhysicianClinicalStorySourceRef>();
  for (const tagged of taggedQuestions) {
    const key = `${tagged.question.currentSource}:${tagged.visitId ?? ""}:${tagged.recordedAt ?? ""}`;
    const ref = refs.get(key) ?? { actor: tagged.question.currentSource, questionIds: [], ...(tagged.visitId ? { visitId: tagged.visitId } : {}), ...(tagged.recordedAt ? { recordedAt: tagged.recordedAt } : {}) };
    if (!ref.questionIds.includes(tagged.question.id)) ref.questionIds.push(tagged.question.id);
    refs.set(key, ref);
  }
  return [...refs.values()];
}

function valueKey(value: PhysicianLocalizedText): string {
  return `${value.ar.trim().replace(/\s+/g, " ")}\u0000${value.en.trim().replace(/\s+/g, " ")}`.toLocaleLowerCase();
}

function deduplicateEntries(entries: Array<PhysicianClinicalStoryEntry & { dateKey: string | null }>): Array<PhysicianClinicalStoryEntry & { dateKey: string | null }> {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    const values = entry.values.filter((value) => {
      const key = valueKey(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return values.length > 0 ? [{ ...entry, values }] : [];
  });
}

function parentValuesCovered(parentEntries: Array<PhysicianClinicalStoryEntry & { dateKey: string | null }>, detailEntries: Array<PhysicianClinicalStoryEntry & { dateKey: string | null }>): boolean {
  const detailAr = detailEntries.flatMap((entry) => entry.values.map((value) => value.ar.toLocaleLowerCase())).join(" ");
  const detailEn = detailEntries.flatMap((entry) => entry.values.map((value) => value.en.toLocaleLowerCase())).join(" ");
  const parents = parentEntries.flatMap((entry) => entry.values);
  return parents.length > 0 && parents.every((value) => detailAr.includes(value.ar.toLocaleLowerCase()) && detailEn.includes(value.en.toLocaleLowerCase()));
}

function itemLabel(question: PhysicianInterviewQuestion): PhysicianLocalizedText {
  const contract = getP01Contract(question.code);
  return CLINICAL_LABELS[question.code] ?? (contract
    ? { ar: contract.localized.ar.label.replace(/[؟?]\s*$/, ""), en: contract.localized.en.label.replace(/[؟?]\s*$/, "") }
    : question.text);
}

function buildSectionGroups(definition: SectionDefinition, tagged: TaggedQuestion[], catalog: ReturnType<typeof buildStructuredLabelCatalog>): PhysicianClinicalStoryGroup[] {
  const relevant = tagged.filter(({ question }) => getP01Contract(question.code)?.sectionCode === definition.code && !IMPLEMENTATION_ONLY_CODES.has(question.code));
  const groupMap = new Map<string, PhysicianClinicalStoryGroup>();
  for (const timeframe of TIMEFRAME_ORDER) {
    const byCode = new Map<string, TaggedQuestion[]>();
    for (const taggedQuestion of relevant.filter((item) => item.timeframe === timeframe)) {
      const bucket = byCode.get(taggedQuestion.question.code) ?? [];
      bucket.push(taggedQuestion);
      byCode.set(taggedQuestion.question.code, bucket);
    }
    for (const [code, codeQuestions] of byCode) {
      if (PARENT_CODES.has(code) && Object.entries(DETAIL_PARENT_CODES).some(([detail, parents]) => parents.includes(code) && byCode.has(detail))) continue;
      const parentQuestions = (DETAIL_PARENT_CODES[code] ?? []).flatMap((parent) => byCode.get(parent) ?? []);
      const detailEntries = codeQuestions.flatMap((item) => entriesFor(item, catalog));
      const parentEntries = parentQuestions.flatMap((item) => entriesFor(item, catalog));
      const combined = parentValuesCovered(parentEntries, detailEntries) ? detailEntries : [...parentEntries, ...detailEntries];
      const entries = deduplicateEntries(combined);
      if (definition.code === "COURSE_IMPACT") entries.sort((a, b) => a.dateKey && b.dateKey ? a.dateKey.localeCompare(b.dateKey) : a.dateKey ? -1 : b.dateKey ? 1 : 0);
      if (entries.length === 0) continue;
      const groupDefinition = groupFor(definition.code, code);
      const group = groupMap.get(groupDefinition.id) ?? { id: groupDefinition.id, title: groupDefinition.title, items: [] };
      group.items.push({
        id: `${definition.code}:${groupDefinition.id}:${code}:${timeframe}`,
        label: itemLabel(codeQuestions[0].question),
        entries: entries.map((entry) => ({
          id: entry.id,
          values: entry.values,
          valueType: entry.valueType,
          patientAuthored: entry.patientAuthored,
        })),
        timeframe,
        sourceRefs: sourceRefsFor([...parentQuestions, ...codeQuestions]),
      });
      groupMap.set(groupDefinition.id, group);
    }
  }
  return [...groupMap.values()];
}

function addVisitFallback(sections: PhysicianClinicalStorySection[], reviewVisit?: PhysicianVisitSummary): void {
  if (!reviewVisit) return;
  const section = sections.find((candidate) => candidate.code === "VISIT_REASON");
  if (!section || section.groups.length > 0) return;
  section.groups.push({ id: GROUPS.visit.id, title: GROUPS.visit.title, items: [{
    id: `visit:${reviewVisit.id}:reason`,
    label: { ar: "سبب المراجعة", en: "Reason for review" },
    entries: [{ id: `visit:${reviewVisit.id}:reason:value`, values: [reviewVisit.primary, ...reviewVisit.additional], valueType: "STRUCTURED", patientAuthored: false }],
    timeframe: reviewVisit.visitType === "FOLLOW_UP" ? "CURRENT_FOLLOW_UP" : "CURRENT",
    sourceRefs: [{ actor: "SYSTEM", questionIds: [], visitId: reviewVisit.id, recordedAt: reviewVisit.createdAt }],
  }] });
}

function addFollowUpSection(sections: PhysicianClinicalStorySection[], followUpSections: PhysicianFollowUpSection[], reviewVisit: PhysicianVisitSummary): void {
  const groups: PhysicianClinicalStoryGroup[] = followUpSections.flatMap((followUpSection) => {
    const visits = new Map<string, typeof followUpSection.facts>();
    for (const fact of followUpSection.facts) {
      const visitId = fact.sourceVisitId ?? reviewVisit.id;
      const bucket = visits.get(visitId) ?? [];
      bucket.push(fact);
      visits.set(visitId, bucket);
    }
    const items = [...visits].map(([visitId, facts]): PhysicianClinicalStoryItem | null => {
      const entries = facts.flatMap((fact, index) => fact.values.length > 0 ? [{
        id: `${fact.id}:${index}`,
        values: fact.values.map((value) => ({
          ar: `${fact.label.ar}: ${value.ar.replace(/([٠-٥0-5])\s*\/\s*[٥5]/g, (_, score: string) => `${localizeDigits(score, "ar")} من ٥`)}`,
          en: `${fact.label.en}: ${value.en.replace(/([0-5])\s*\/\s*5/g, "$1 of 5")}`,
        })),
        valueType: fact.id.startsWith("metric:") ? "MEASURE" as const : "STRUCTURED" as const,
        patientAuthored: false,
      }] : []);
      if (entries.length === 0) return null;
      const recordedAt = facts.find((fact) => fact.sourceVisitAt)?.sourceVisitAt;
      return {
        id: `follow-up:${followUpSection.code}:${visitId}`,
        label: followUpSection.title,
        entries,
        timeframe: visitId === reviewVisit.id ? "CURRENT_FOLLOW_UP" : "PRIOR_FOLLOW_UP",
        sourceRefs: [{ actor: "PATIENT", questionIds: [], visitId, ...(recordedAt ? { recordedAt } : {}) }],
      };
    }).filter((item): item is PhysicianClinicalStoryItem => Boolean(item));
    return items.length > 0 ? [{ id: `follow-up:${followUpSection.code}`, title: followUpSection.title, items }] : [];
  });
  if (groups.length > 0) sections.splice(1, 0, {
    code: "FOLLOW_UP_CHANGE",
    title: { ar: "التغير منذ الزيارة السابقة", en: "Follow-up Change" },
    description: { ar: "التحديثات المسجلة في المتابعات، مع فصل الحالي عن السابق.", en: "Recorded follow-up updates, with current and prior changes kept distinct." },
    groups,
  });
}

export function buildClinicalStory(input: ClinicalStoryInput): PhysicianClinicalStorySection[] {
  const tagged = taggedQuestions(input);
  const catalog = buildStructuredLabelCatalog([...input.initialQuestions, ...input.currentQuestions, ...input.effectiveQuestions]);
  const sections: PhysicianClinicalStorySection[] = SECTION_DEFINITIONS.map((definition) => ({
    code: definition.code,
    title: definition.title,
    description: definition.description,
    groups: buildSectionGroups(definition, tagged, catalog),
  }));
  addVisitFallback(sections, input.reviewVisit);
  if (input.reviewVisit?.visitType === "FOLLOW_UP") addFollowUpSection(sections, input.followUpSections ?? [], input.reviewVisit);
  return sections.filter((section) => section.groups.some((group) => group.items.length > 0));
}

type ClinicalStorySummaryInput = {
  patientContext: PhysicianLocalizedText;
  visitReason?: PhysicianLocalizedText;
  diagnosis?: PhysicianLocalizedText;
  sections: PhysicianClinicalStorySection[];
};

function completeSentence(value: string): string {
  const trimmed = value.trim();
  return !trimmed || /[.!?؟]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function buildClinicalStorySummary(input: ClinicalStorySummaryInput): PhysicianLocalizedText[] {
  return [{
    ar: completeSentence(input.visitReason ? `${input.patientContext.ar} يراجع بسبب ${input.visitReason.ar}` : input.patientContext.ar),
    en: completeSentence(input.visitReason ? `${input.patientContext.en} presents for ${input.visitReason.en}` : input.patientContext.en),
  }];
}
