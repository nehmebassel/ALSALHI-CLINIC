import { P01_QUESTION_CONTRACTS, type P01QuestionContract } from "../lib/p01/contracts";
import { evaluateP01Draft, type P01DraftDocument, type P01EvaluatedQuestion } from "../lib/p01/engine";
import { makeClinicalApproxDate } from "../lib/p01/clinical-date";
import { P01_PRIVACY_NOTICE_AR, P01_PRIVACY_NOTICE_EN, P01_PRIVACY_NOTICE_VERSION } from "../lib/p01/privacy";
import type { JsonValue, PatientInputJson } from "../lib/patient-access/service";

export type SyntheticGender = "MALE" | "FEMALE";
export type SyntheticMaritalStatus = "MARRIED" | "NOT_MARRIED";
export type PrimaryReason =
  | "RV_HAIR_LOSS"
  | "RV_SCALP_SYMPTOMS"
  | "RV_HAIR_QUALITY"
  | "RV_DERMATOLOGY"
  | "RV_LASER"
  | "RV_AESTHETIC_PROCEDURES";

export interface SyntheticCase {
  index: number;
  name: string;
  gender: SyntheticGender;
  maritalStatus: SyntheticMaritalStatus;
  dob: string;
  primary: PrimaryReason;
  diagnosisAr: string;
  diagnosisEn: string;
  assessmentNoteAr: string;
  assessmentNoteEn: string;
  followUps: number;
  additional?: Array<"RV_LASER" | "RV_AESTHETIC_PROCEDURES">;
  locale: "ar" | "en";
}

const identities: ReadonlyArray<{ name: string; gender: SyntheticGender }> = [
  { name: "خالد السالم", gender: "MALE" }, { name: "نورة العتيبي", gender: "FEMALE" }, { name: "سارة الحربي", gender: "FEMALE" }, { name: "فيصل القحطاني", gender: "MALE" }, { name: "شهد العنزي", gender: "FEMALE" }, { name: "راكان الغامدي", gender: "MALE" },
  { name: "ريم الشهري", gender: "FEMALE" }, { name: "عبدالله الدوسري", gender: "MALE" }, { name: "أروى الدوسري", gender: "FEMALE" }, { name: "ناصر المطيري", gender: "MALE" }, { name: "ليان الزهراني", gender: "FEMALE" }, { name: "بدر الشمري", gender: "MALE" },
  { name: "دانة المطيري", gender: "FEMALE" }, { name: "هدى العنزي", gender: "FEMALE" }, { name: "غادة القحطاني", gender: "FEMALE" }, { name: "عهود الحربي", gender: "FEMALE" }, { name: "مها السبيعي", gender: "FEMALE" }, { name: "سمر الغامدي", gender: "FEMALE" },
  { name: "هيا الغامدي", gender: "FEMALE" }, { name: "محمد الزهراني", gender: "MALE" }, { name: "الجوهرة الشهري", gender: "FEMALE" }, { name: "عمر الدوسري", gender: "MALE" }, { name: "لينا العنزي", gender: "FEMALE" }, { name: "فهد القحطاني", gender: "MALE" },
  { name: "لمى السبيعي", gender: "FEMALE" }, { name: "سعود الشمري", gender: "MALE" }, { name: "رزان الحربي", gender: "FEMALE" }, { name: "نايف المطيري", gender: "MALE" }, { name: "تالا الغامدي", gender: "FEMALE" }, { name: "مازن العنزي", gender: "MALE" },
  { name: "جود القحطاني", gender: "FEMALE" }, { name: "ماجد الحربي", gender: "MALE" }, { name: "رغد الدوسري", gender: "FEMALE" }, { name: "وليد الزهراني", gender: "MALE" }, { name: "نور الشهري", gender: "FEMALE" }, { name: "عبدالرحمن السبيعي", gender: "MALE" },
];

const caseNarratives: Record<number, { diagnosisAr: string; diagnosisEn: string; noteAr: string; noteEn: string }> = {
  1: { diagnosisAr: "الصلع الوراثي", diagnosisEn: "Androgenetic alopecia", noteAr: "ترقق تدريجي في مقدمة وقمة الرأس مع نمط متوافق مع الصلع الوراثي.", noteEn: "Gradual frontal and crown thinning consistent with androgenetic alopecia." },
  2: { diagnosisAr: "تساقط نمطي أنثوي مع تساقط كربي مزمن", diagnosisEn: "Female pattern hair loss with chronic telogen effluvium", noteAr: "نقص كثافة تدريجي مع زيادة تساقط منتشرة بعد ضغط نفسي ونقص حديد سابق.", noteEn: "Gradual density loss with diffuse shedding after stress and a prior iron-deficiency period." },
  3: { diagnosisAr: "تساقط كربي بعد الولادة", diagnosisEn: "Postpartum telogen effluvium", noteAr: "تساقط منتشر بدأ بعد الولادة مع رضاعة مستمرة ودون دلائل على فقدان ندبي.", noteEn: "Diffuse shedding beginning postpartum during ongoing breastfeeding, without scarring features." },
  4: { diagnosisAr: "الصلع الوراثي", diagnosisEn: "Androgenetic alopecia", noteAr: "ترقق تدريجي أمامي وصدغي دون أعراض فروة مهمة.", noteEn: "Gradual frontal-temporal thinning without significant scalp symptoms." },
  5: { diagnosisAr: "الثعلبة البقعية", diagnosisEn: "Alopecia areata", noteAr: "بقع محددة من نقص الشعر مع تاريخ استجابة لحقن الكورتيزون الموضعي.", noteEn: "Discrete patches of hair loss with prior response to intralesional corticosteroid injections." },
  6: { diagnosisAr: "حزاز مسطح شعري / تساقط ندبي", diagnosisEn: "Lichen planopilaris / scarring alopecia", noteAr: "ترقق مع ألم وحرقان فروة وتاريخ خزعة متوافق مع التهاب جريبات ندبي.", noteEn: "Thinning with scalp pain and burning; prior biopsy compatible with cicatricial folliculitis." },
  7: { diagnosisAr: "التهاب الجلد الدهني بفروة الرأس", diagnosisEn: "Seborrheic dermatitis of the scalp", noteAr: "حكة وقشور متقطعة تتحسن بالشامبو العلاجي وتزداد مع التعرق.", noteEn: "Intermittent itch and scale that improve with medicated shampoo and worsen with sweating." },
  8: { diagnosisAr: "صدفية فروة الرأس", diagnosisEn: "Scalp psoriasis", noteAr: "قشور وحكة مزمنة مع نوبات تزداد في الطقس الجاف.", noteEn: "Chronic scale and itch with flares in dry weather." },
  9: { diagnosisAr: "التهاب جلد تماسي بفروة الرأس", diagnosisEn: "Allergic contact dermatitis of the scalp", noteAr: "حرقان وحكة بعد صبغة شعر مع تحسن بعد إيقاف المنتج.", noteEn: "Burning and itch after hair dye exposure, improving after the product was stopped." },
  10: { diagnosisAr: "التهاب جلد دهني مع صلع وراثي", diagnosisEn: "Seborrheic dermatitis with androgenetic alopecia", noteAr: "أعراض فروة متكررة مع ترقق تدريجي بالقمة ومقدمة الرأس.", noteEn: "Recurrent scalp symptoms with gradual crown and frontal thinning." },
  11: { diagnosisAr: "وردية فروة الرأس", diagnosisEn: "Scalp rosacea", noteAr: "حرقان واحمرار متقطعان يزدادان مع الحرارة.", noteEn: "Intermittent scalp burning and erythema aggravated by heat." },
  12: { diagnosisAr: "تساقط ندبي التهابي", diagnosisEn: "Inflammatory scarring alopecia", noteAr: "ألم وحرقان مع مناطق نقص كثافة وخزعة سابقة تدعم تساقطًا ندبيًا.", noteEn: "Pain and burning with focal density loss and a prior biopsy supporting scarring alopecia." },
  13: { diagnosisAr: "تضرر ساق الشعرة بسبب الصبغة والحرارة", diagnosisEn: "Hair-shaft damage from color and heat", noteAr: "جفاف وتقصف بعد صبغة واستخدام متكرر للحرارة.", noteEn: "Dryness and breakage after coloring and recurrent heat exposure." },
  14: { diagnosisAr: "جفاف وهشاشة شعر مرتبطة بالإيزوتريتينوين", diagnosisEn: "Isotretinoin-associated hair dryness and fragility", noteAr: "جفاف وهشاشة بدأت أثناء علاج الإيزوتريتينوين دون تساقط ندبي.", noteEn: "Dryness and fragility beginning during isotretinoin treatment, without scarring hair loss." },
  15: { diagnosisAr: "تضرر كيميائي لساق الشعرة", diagnosisEn: "Chemical hair-shaft damage", noteAr: "تقصف وخشونة بعد تفتيح ومعالجة كيراتين متكررة.", noteEn: "Breakage and rough texture after bleaching and repeated keratin treatment." },
  16: { diagnosisAr: "جفاف وهيشان في شعر مجعد", diagnosisEn: "Dryness and frizz in curly hair", noteAr: "مشكلة عناية وجودة شعر دون تاريخ معالجات كيميائية مهمة.", noteEn: "Hair-care and quality concern without meaningful chemical-treatment history." },
  17: { diagnosisAr: "تقصف بعد التفتيح", diagnosisEn: "Breakage after bleaching", noteAr: "تقصف واضح بعد التفتيح مع روتين عناية غير منتظم.", noteEn: "Marked breakage after bleaching with an inconsistent care routine." },
  18: { diagnosisAr: "هشاشة بعد الفرد الكيميائي", diagnosisEn: "Fragility after chemical straightening", noteAr: "ضعف وملمس خشن بعد فرد كيميائي سابق.", noteEn: "Fragility and rough texture after prior chemical straightening." },
  19: { diagnosisAr: "التهاب جلد تأتبي", diagnosisEn: "Atopic dermatitis", noteAr: "لويحات حاكة متكررة في الثنيات مع جفاف جلدي.", noteEn: "Recurrent pruritic flexural plaques with xerosis." },
  20: { diagnosisAr: "حب شباب التهابي", diagnosisEn: "Inflammatory acne", noteAr: "حب شباب وجهي التهابي متكرر مع آثار تصبغية بعد الالتهاب.", noteEn: "Recurrent inflammatory facial acne with post-inflammatory marks." },
  21: { diagnosisAr: "صدفية لويحية", diagnosisEn: "Plaque psoriasis", noteAr: "لويحات محددة متقشرة على المرفقين والركبتين.", noteEn: "Well-demarcated scaly plaques on the elbows and knees." },
  22: { diagnosisAr: "التهاب جلد تماسي", diagnosisEn: "Contact dermatitis", noteAr: "طفح حاك موضعي مرتبط بمنتج جلدي جديد.", noteEn: "Localized pruritic eruption associated with a new skin product." },
  23: { diagnosisAr: "كلف", diagnosisEn: "Melasma", noteAr: "تصبغ وجهي متناظر يزداد مع التعرض للشمس.", noteEn: "Symmetric facial hyperpigmentation worsened by sun exposure." },
  24: { diagnosisAr: "شرى مزمن", diagnosisEn: "Chronic urticaria", noteAr: "انتبارات حاكة متكررة تزول خلال ساعات دون أثر ثابت.", noteEn: "Recurrent pruritic wheals resolving within hours without fixed lesions." },
  25: { diagnosisAr: "استشارة إزالة شعر بالليزر", diagnosisEn: "Laser hair-removal consultation", noteAr: "طلب إزالة شعر غير مرغوب فيه مع مراجعة عوامل الأمان الحالية.", noteEn: "Unwanted-hair laser consultation with review of current safety factors." },
  26: { diagnosisAr: "استشارة إزالة وشم بالليزر", diagnosisEn: "Laser tattoo-removal consultation", noteAr: "وشم سابق يرغب المراجع في تخفيفه مع خدمة تجميلية إضافية.", noteEn: "Prior tattoo for reduction, with an additional aesthetic-service request." },
  27: { diagnosisAr: "استشارة ليزر للتصبغ والكلف", diagnosisEn: "Laser consultation for pigmentation and melasma", noteAr: "تصبغ وجهي وكلف مع مناقشة الخيارات الآمنة أثناء الرضاعة.", noteEn: "Facial pigmentation and melasma with treatment-safety discussion during breastfeeding." },
  28: { diagnosisAr: "استشارة ليزر لإزالة الشعر والوشم", diagnosisEn: "Laser consultation for hair and tattoo removal", noteAr: "طلبان محددان لليزر دون مضاعفات سابقة مهمة.", noteEn: "Two defined laser requests without significant prior complications." },
  29: { diagnosisAr: "استشارة ليزر للتصبغ والاحمرار", diagnosisEn: "Laser consultation for pigmentation and redness", noteAr: "تصبغ سطحي واحمرار وعائي بالوجه مع طلب تجميلي إضافي.", noteEn: "Superficial pigmentation and facial vascular redness with an additional aesthetic request." },
  30: { diagnosisAr: "استشارة ليزر لندبات حب الشباب", diagnosisEn: "Laser consultation for acne scars", noteAr: "ندبات حب شباب ضامرة مع رغبة في تحسين الملمس تدريجيًا.", noteEn: "Atrophic acne scars with a goal of gradual texture improvement." },
  31: { diagnosisAr: "استشارة بوتوكس وفيلر", diagnosisEn: "Botulinum toxin and filler consultation", noteAr: "طلب نتيجة طبيعية لتجاعيد تعبيرية ونقص حجم موضعي.", noteEn: "Natural-result consultation for dynamic lines and focal volume loss." },
  32: { diagnosisAr: "استشارة فيلر ومحفز ترطيب", diagnosisEn: "Filler and skin-booster consultation", noteAr: "تحسين بسيط للحجم وجودة الجلد مع تفضيل نتيجة محافظة.", noteEn: "Conservative improvement in facial volume and skin quality." },
  33: { diagnosisAr: "استشارة جودة الجلد ومحفزات الكولاجين", diagnosisEn: "Skin-quality and collagen-stimulator consultation", noteAr: "تحسين جودة الجلد تدريجيًا مع مراجعة ليزر إضافية لندبات حب الشباب.", noteEn: "Gradual skin-quality improvement with an additional laser review for acne scars." },
  34: { diagnosisAr: "استشارة إذابة دهون وتنسيق قوام", diagnosisEn: "Fat-dissolving and body-contouring consultation", noteAr: "هدف محدد لتحسين الذقن المزدوج وتناسق منطقة موضعية.", noteEn: "Defined goal to improve submental fullness and a localized body-contour concern." },
  35: { diagnosisAr: "استشارة علاج فرط التعرق", diagnosisEn: "Hyperhidrosis treatment consultation", noteAr: "تعرق إبطي زائد مع رغبة في علاج حقني محافظ.", noteEn: "Axillary hyperhidrosis with interest in a conservative injectable treatment." },
  36: { diagnosisAr: "استشارة تنسيق قوام مع ليزر إضافي", diagnosisEn: "Body-contouring consultation with additional laser review", noteAr: "هدف تنسيق قوام محدد مع مراجعة إزالة وشم بالليزر في نفس الزيارة.", noteEn: "Defined body-contouring goal with tattoo-laser review in the same visit." },
};

export function syntheticInitialVisitAt(caseDef: Pick<SyntheticCase, "index">, hour = 9): Date {
  const date = new Date("2026-04-01T09:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + caseDef.index);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

const primaries: PrimaryReason[] = [
  "RV_HAIR_LOSS",
  "RV_SCALP_SYMPTOMS",
  "RV_HAIR_QUALITY",
  "RV_DERMATOLOGY",
  "RV_LASER",
  "RV_AESTHETIC_PROCEDURES",
];

export const SYNTHETIC_CASES: SyntheticCase[] = primaries.flatMap((primary, pathwayIndex) =>
  Array.from({ length: 6 }, (_, offset) => {
    const index = pathwayIndex * 6 + offset + 1;
    const identity = identities[index - 1];
    if (!identity) throw new Error(`Missing synthetic identity for case ${index}`);
    const gender = identity.gender;
    const additionalByCase: Partial<Record<number, Array<"RV_LASER" | "RV_AESTHETIC_PROCEDURES">>> = {
      23: ["RV_LASER"],
      26: ["RV_AESTHETIC_PROCEDURES"],
      29: ["RV_AESTHETIC_PROCEDURES"],
      33: ["RV_LASER"],
      36: ["RV_LASER"],
    };
    const additional = additionalByCase[index];
    return {
      index,
      name: identity.name,
      gender,
      maritalStatus: [1, 2, 3, 6, 7, 10, 12, 21, 23, 25, 27].includes(index) ? "MARRIED" : (offset % 3 === 0 ? "MARRIED" : "NOT_MARRIED"),
      dob: `${1980 + ((index * 3) % 22)}-${String(((index * 5) % 12) + 1).padStart(2, "0")}-${String(((index * 7) % 25) + 1).padStart(2, "0")}`,
      primary,
      diagnosisAr: caseNarratives[index].diagnosisAr,
      diagnosisEn: caseNarratives[index].diagnosisEn,
      assessmentNoteAr: caseNarratives[index].noteAr,
      assessmentNoteEn: caseNarratives[index].noteEn,
      followUps: offset % 3,
      ...(additional ? { additional } : {}),
      locale: index % 2 === 0 ? "en" : "ar",
    } satisfies SyntheticCase;
  }),
);

export type SyntheticHairMetricCode = "SHEDDING" | "DENSITY" | "ITCH" | "BURNING" | "SCALP_PAIN";

const initialMetricsByCase: Partial<Record<number, Record<SyntheticHairMetricCode, number>>> = {
  1: { SHEDDING: 1, DENSITY: 4, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
  2: { SHEDDING: 4, DENSITY: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
  3: { SHEDDING: 4, DENSITY: 1, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
  4: { SHEDDING: 1, DENSITY: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
  5: { SHEDDING: 1, DENSITY: 3, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
  6: { SHEDDING: 3, DENSITY: 4, ITCH: 1, BURNING: 3, SCALP_PAIN: 3 },
  7: { SHEDDING: 2, DENSITY: 0, ITCH: 4, BURNING: 0, SCALP_PAIN: 0 },
  8: { SHEDDING: 0, DENSITY: 0, ITCH: 4, BURNING: 1, SCALP_PAIN: 0 },
  9: { SHEDDING: 0, DENSITY: 0, ITCH: 3, BURNING: 3, SCALP_PAIN: 0 },
  10: { SHEDDING: 1, DENSITY: 3, ITCH: 3, BURNING: 0, SCALP_PAIN: 0 },
  11: { SHEDDING: 0, DENSITY: 0, ITCH: 1, BURNING: 3, SCALP_PAIN: 1 },
  12: { SHEDDING: 2, DENSITY: 3, ITCH: 1, BURNING: 3, SCALP_PAIN: 4 },
};

export function syntheticInitialMetrics(caseDef: Pick<SyntheticCase, "index">): Record<SyntheticHairMetricCode, number> | null {
  return initialMetricsByCase[caseDef.index] ? { ...initialMetricsByCase[caseDef.index]! } : null;
}

export function syntheticFollowUpMetrics(caseDef: Pick<SyntheticCase, "index">, followUp: number): Record<SyntheticHairMetricCode, number> | null {
  const initial = syntheticInitialMetrics(caseDef);
  if (!initial) return null;
  const improves = ![6, 12].includes(caseDef.index);
  const step = improves ? followUp : 0;
  return {
    SHEDDING: Math.max(0, Math.min(5, initial.SHEDDING - step)),
    DENSITY: Math.max(0, Math.min(5, initial.DENSITY - (followUp >= 2 && improves ? 1 : 0))),
    ITCH: Math.max(0, Math.min(5, initial.ITCH - step)),
    BURNING: Math.max(0, Math.min(5, initial.BURNING - step)),
    SCALP_PAIN: Math.max(0, Math.min(5, initial.SCALP_PAIN - step)),
  };
}

function syntheticText(caseDef: SyntheticCase, ar: string, en: string): string {
  return caseDef.locale === "ar" ? ar : en;
}

function approxDate(caseDef: SyntheticCase, salt = 0): JsonValue {
  const initial = syntheticInitialVisitAt(caseDef);
  const monthsBack = 8 + Math.max(0, salt) * 3;
  const date = new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth() - monthsBack, 1));
  return makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }) as unknown as JsonValue;
}

function monthsBeforeInitial(caseDef: SyntheticCase, monthsBack: number): JsonValue {
  const initial = syntheticInitialVisitAt(caseDef);
  const date = new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth() - monthsBack, 1));
  return makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }) as unknown as JsonValue;
}

const hairOnsetMonths: Partial<Record<number, { shedding?: number; thinning?: number }>> = {
  1: { thinning: 48 }, 2: { shedding: 8, thinning: 36 }, 3: { shedding: 4 }, 4: { thinning: 60 }, 5: { thinning: 6 }, 6: { shedding: 24, thinning: 36 },
  7: { shedding: 10 }, 10: { thinning: 48 }, 12: { shedding: 18, thinning: 36 },
};

function selectedStrings(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

const healthSnapshotByCase: Record<number, string[]> = {
  1: ["REGULAR_MEDICATIONS"], 2: ["CHRONIC_DISEASE", "REGULAR_MEDICATIONS", "SUPPLEMENTS"], 3: ["SUPPLEMENTS"], 4: ["NONE_OF_THE_ABOVE"], 5: ["ALLERGY"], 6: ["SURGERY_HOSPITALIZATION"],
  7: ["CHRONIC_DISEASE", "REGULAR_MEDICATIONS"], 8: ["NONE_OF_THE_ABOVE"], 9: ["ALLERGY"], 10: ["REGULAR_MEDICATIONS"], 11: ["NONE_OF_THE_ABOVE"], 12: ["CHRONIC_DISEASE", "REGULAR_MEDICATIONS"],
  13: ["NONE_OF_THE_ABOVE"], 14: ["REGULAR_MEDICATIONS"], 15: ["ALLERGY"], 16: ["NONE_OF_THE_ABOVE"], 17: ["SUPPLEMENTS"], 18: ["NONE_OF_THE_ABOVE"],
  19: ["TUMOR"], 20: ["NONE_OF_THE_ABOVE"], 21: ["NONE_OF_THE_ABOVE"], 22: ["ALLERGY"], 23: ["NONE_OF_THE_ABOVE"], 24: ["REGULAR_MEDICATIONS"],
  25: ["NONE_OF_THE_ABOVE"], 26: ["ALLERGY"], 27: ["NONE_OF_THE_ABOVE"], 28: ["SURGERY_HOSPITALIZATION"], 29: ["NONE_OF_THE_ABOVE"], 30: ["NONE_OF_THE_ABOVE"],
  31: ["NONE_OF_THE_ABOVE"], 32: ["REGULAR_MEDICATIONS"], 33: ["ALLERGY"], 34: ["NONE_OF_THE_ABOVE"], 35: ["NONE_OF_THE_ABOVE"], 36: ["NONE_OF_THE_ABOVE"],
};

const womenHealthByCase: Partial<Record<number, string[]>> = {
  2: ["IRREGULAR_CYCLES", "SCANT_FLOW", "HIRSUTISM", "ACNE", "OILINESS", "DIFFICULTY_CONCEIVING"],
  3: ["ABSENT_PERIODS"],
  5: ["NONE"],
  7: ["IRREGULAR_CYCLES", "HEAVY_FLOW", "DIFFICULTY_CONCEIVING"],
};

const mensHealthByCase: Partial<Record<number, string[]>> = {
  1: ["LOW_LIBIDO", "FERTILITY"],
  4: ["NONE"],
  6: ["BREAST_CHANGE", "BODY_HAIR_REDUCTION", "MUSCLE_CHANGE"],
  10: ["LOW_LIBIDO", "ERECTILE_DIFFICULTY", "BREAST_CHANGE"],
  12: ["FERTILITY"],
};

const pregnancyByCase: Record<number, { status: string; month?: string; breastfeeding?: JsonValue; planning: string }> = {
  2: { status: "NO", planning: "ABOUT_1Y" },
  3: { status: "BREASTFEEDING", breastfeeding: makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2025, month: 10 }) as unknown as JsonValue, planning: "NO_PLAN" },
  5: { status: "NO", planning: "WITHIN_6M" },
  7: { status: "NO", planning: "MAYBE_NO_SET_TIME" },
  9: { status: "NO", planning: "NO_PLAN" }, 11: { status: "NO", planning: "NO_PLAN" },
  13: { status: "NO", planning: "NO_PLAN" }, 15: { status: "NO", planning: "ABOUT_1Y" }, 17: { status: "NO", planning: "NO_PLAN" },
  19: { status: "NO", planning: "NO_PLAN" }, 21: { status: "PREGNANT", month: "4", planning: "NO_PLAN" }, 23: { status: "BREASTFEEDING", breastfeeding: makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 2 }) as unknown as JsonValue, planning: "NO_PLAN" },
  25: { status: "PREGNANT", month: "5", planning: "NO_PLAN" }, 27: { status: "BREASTFEEDING", breastfeeding: makeClinicalApproxDate({ calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2026, month: 1 }) as unknown as JsonValue, planning: "NO_PLAN" }, 29: { status: "UNSURE", planning: "UNSURE" },
  31: { status: "NO", planning: "MAYBE_NO_SET_TIME" }, 33: { status: "NO", planning: "WITHIN_6M" }, 35: { status: "NO", planning: "ABOUT_1Y" },
};

const hairConcernByCase: Partial<Record<number, string>> = { 1: "THINNING", 2: "BOTH", 3: "SHEDDING", 4: "THINNING", 5: "THINNING", 6: "BOTH", 7: "SHEDDING", 10: "THINNING", 12: "BOTH" };
const priorDiagnosisByCase: Partial<Record<number, string[]>> = {
  1: ["PATTERN_HAIR_LOSS"], 2: ["PATTERN_HAIR_LOSS", "TELOGEN_EFFLUVIUM"], 3: ["POSTPARTUM_SHEDDING"], 5: ["ALOPECIA_AREATA"], 6: ["OTHER"],
  7: ["SEBORRHEIC_DERMATITIS"], 8: ["SCALP_PSORIASIS"], 9: ["SCALP_ALLERGY"], 10: ["SEBORRHEIC_DERMATITIS", "PATTERN_HAIR_LOSS"], 11: ["SCALP_ROSACEA"], 12: ["SCARRING_ALOPECIA"],
};
const scalpSymptomsByCase: Partial<Record<number, string[]>> = {
  6: ["BURNING", "SCALP_PAIN"], 7: ["ITCH", "DANDRUFF"], 8: ["ITCH", "DANDRUFF"], 9: ["ITCH", "BURNING"], 10: ["ITCH", "DANDRUFF"], 11: ["BURNING", "OTHER"], 12: ["BURNING", "SCALP_PAIN"],
};
const triggerEventsByCase: Partial<Record<number, string[]>> = { 1: ["NONE_OF_THE_ABOVE"], 2: ["SEVERE_STRESS", "WEIGHT_LOSS"], 3: ["NONE_OF_THE_ABOVE"], 4: ["NONE_OF_THE_ABOVE"], 5: ["SEVERE_STRESS"], 6: ["SEVERE_STRESS"], 7: ["NONE_OF_THE_ABOVE"], 8: ["NONE_OF_THE_ABOVE"], 9: ["NONE_OF_THE_ABOVE"], 10: ["NONE_OF_THE_ABOVE"], 11: ["NONE_OF_THE_ABOVE"], 12: ["SEVERE_ILLNESS"] };
const femaleTriggerByCase: Partial<Record<number, string[]>> = { 2: ["NONE"], 3: ["CHILDBIRTH", "BREASTFEEDING"], 5: ["NONE"], 7: ["NONE"] };
const maleTriggerByCase: Partial<Record<number, string[]>> = { 1: ["NONE"], 4: ["NONE"], 6: ["START_STOP_HORMONES_STEROIDS"], 10: ["NONE"], 12: ["START_STOP_HORMONES_STEROIDS"] };

const hqByCase: Record<number, Record<string, JsonValue>> = {
  13: { Q_HQ_HAIR_STATE: "PROCESSED", Q_HQ_PREVIOUS_TREATMENTS: ["DYE", "BLEACH"], Q_HQ_DRUG_EXPOSURES: ["NONE"], Q_HQ_NATURAL_PATTERN: "WAVY", Q_HQ_CURRENT_PROBLEMS: ["DRYNESS", "SPLIT_ENDS", "BREAKAGE"], Q_HQ_HEAT_TOOLS: ["BLOW_DRYER", "FLAT_IRON"], Q_HQ_HEAT_PROTECTANT: "SOMETIMES", Q_HQ_WASH_FREQUENCY: "3", Q_HQ_CLEANSERS: ["SULFATE_FREE"], Q_HQ_ROUTINE_ITEMS: ["SHAMPOO", "CONDITIONER", "MASK", "LEAVE_IN"], Q_HQ_ROUTINE_ADHERENCE: "SOMETIMES", Q_HQ_ROUTINE_CHANGED: "YES" },
  14: { Q_HQ_HAIR_STATE: "VIRGIN", Q_HQ_PREVIOUS_TREATMENTS: ["NONE"], Q_HQ_DRUG_EXPOSURES: ["ISOTRETINOIN"], Q_HQ_NATURAL_PATTERN: "STRAIGHT", Q_HQ_CURRENT_PROBLEMS: ["DRYNESS", "ROUGH_TEXTURE"], Q_HQ_HEAT_TOOLS: ["BLOW_DRYER"], Q_HQ_HEAT_PROTECTANT: "ALWAYS", Q_HQ_WASH_FREQUENCY: "4", Q_HQ_CLEANSERS: ["SULFATE_FREE"], Q_HQ_ROUTINE_ITEMS: ["SHAMPOO", "CONDITIONER"], Q_HQ_ROUTINE_ADHERENCE: "USUALLY", Q_HQ_ROUTINE_CHANGED: "NO" },
  15: { Q_HQ_HAIR_STATE: "PROCESSED", Q_HQ_PREVIOUS_TREATMENTS: ["BLEACH", "KERATIN"], Q_HQ_DRUG_EXPOSURES: ["NONE"], Q_HQ_NATURAL_PATTERN: "WAVY", Q_HQ_CURRENT_PROBLEMS: ["BREAKAGE", "ROUGH_TEXTURE", "REDUCED_ELASTICITY"], Q_HQ_HEAT_TOOLS: ["BLOW_DRYER", "FLAT_IRON"], Q_HQ_HEAT_PROTECTANT: "SOMETIMES", Q_HQ_WASH_FREQUENCY: "3", Q_HQ_CLEANSERS: ["SULFATE_FREE"], Q_HQ_ROUTINE_ITEMS: ["SHAMPOO", "CONDITIONER", "MASK"], Q_HQ_ROUTINE_ADHERENCE: "USUALLY", Q_HQ_ROUTINE_CHANGED: "NO" },
  16: { Q_HQ_HAIR_STATE: "VIRGIN", Q_HQ_PREVIOUS_TREATMENTS: ["NONE"], Q_HQ_DRUG_EXPOSURES: ["NONE"], Q_HQ_NATURAL_PATTERN: "CURLY", Q_HQ_CURRENT_PROBLEMS: ["DRYNESS", "FRIZZ", "TANGLING"], Q_HQ_HEAT_TOOLS: ["DIFFUSER"], Q_HQ_HEAT_PROTECTANT: "ALWAYS", Q_HQ_WASH_FREQUENCY: "2", Q_HQ_CLEANSERS: ["CO_WASH_LOW_SHAMPOO"], Q_HQ_ROUTINE_ITEMS: ["SHAMPOO", "CONDITIONER", "LEAVE_IN", "OIL"], Q_HQ_ROUTINE_ADHERENCE: "SOMETIMES", Q_HQ_ROUTINE_CHANGED: "YES" },
  17: { Q_HQ_HAIR_STATE: "PROCESSED", Q_HQ_PREVIOUS_TREATMENTS: ["DYE", "BLEACH"], Q_HQ_DRUG_EXPOSURES: ["NONE"], Q_HQ_NATURAL_PATTERN: "STRAIGHT", Q_HQ_CURRENT_PROBLEMS: ["BREAKAGE", "SPLIT_ENDS", "LACK_SHINE"], Q_HQ_HEAT_TOOLS: ["BLOW_DRYER", "CURLING_TOOL"], Q_HQ_HEAT_PROTECTANT: "NO", Q_HQ_WASH_FREQUENCY: "4", Q_HQ_CLEANSERS: ["SULFATE_FREE", "OTHER"], Q_HQ_ROUTINE_ITEMS: ["SHAMPOO", "CONDITIONER"], Q_HQ_ROUTINE_ADHERENCE: "RARELY", Q_HQ_ROUTINE_CHANGED: "NO" },
  18: { Q_HQ_HAIR_STATE: "PROCESSED", Q_HQ_PREVIOUS_TREATMENTS: ["CHEMICAL_STRAIGHTENING"], Q_HQ_DRUG_EXPOSURES: ["NONE"], Q_HQ_NATURAL_PATTERN: "CURLY", Q_HQ_CURRENT_PROBLEMS: ["BREAKAGE", "ROUGH_TEXTURE"], Q_HQ_HEAT_TOOLS: ["BLOW_DRYER"], Q_HQ_HEAT_PROTECTANT: "SOMETIMES", Q_HQ_WASH_FREQUENCY: "3", Q_HQ_CLEANSERS: ["SULFATE_FREE"], Q_HQ_ROUTINE_ITEMS: ["SHAMPOO", "CONDITIONER", "MASK"], Q_HQ_ROUTINE_ADHERENCE: "USUALLY", Q_HQ_ROUTINE_CHANGED: "NO" },
};

const laserConcernsByCase: Partial<Record<number, string[]>> = { 23: ["LASER_PIGMENTATION", "LASER_MELASMA"], 25: ["LASER_UNWANTED_HAIR"], 26: ["LASER_TATTOO_PMU"], 27: ["LASER_PIGMENTATION", "LASER_MELASMA"], 28: ["LASER_UNWANTED_HAIR", "LASER_TATTOO_PMU"], 29: ["LASER_PIGMENTATION", "LASER_REDNESS_VESSELS"], 30: ["LASER_ACNE_SCARS", "LASER_RESURFACING"], 33: ["LASER_ACNE_SCARS"], 36: ["LASER_TATTOO_PMU"] };
const aestheticByCase: Partial<Record<number, string[]>> = { 26: ["AP_BOTOX"], 29: ["AP_BOTOX"], 31: ["AP_BOTOX", "AP_FILLER"], 32: ["AP_FILLER", "AP_SKIN_BOOSTER"], 33: ["AP_SKIN_BOOSTER", "AP_COLLAGEN_STIMULATORS"], 34: ["AP_FAT_DISSOLVING", "AP_BODY_CONTOURING"], 35: ["AP_SWEATING_INJECTION"], 36: ["AP_BODY_CONTOURING"] };

function coherentAnswerOverride(code: string, caseDef: SyntheticCase): JsonValue | undefined {
  if (code === "Q_HEALTH_SNAPSHOT") return healthSnapshotByCase[caseDef.index] as JsonValue;
  if (code === "Q_WOMENS_HEALTH" && womenHealthByCase[caseDef.index]) return womenHealthByCase[caseDef.index] as JsonValue;
  if (code === "Q_MENS_HEALTH" && mensHealthByCase[caseDef.index]) return mensHealthByCase[caseDef.index] as JsonValue;
  const pregnancy = pregnancyByCase[caseDef.index];
  if (pregnancy) {
    if (code === "Q_PREGNANCY_BREASTFEEDING_STATUS") return pregnancy.status;
    if (code === "Q_PREGNANCY_MONTH" && pregnancy.month) return pregnancy.month;
    if (code === "Q_BREASTFEEDING_ONSET" && pregnancy.breastfeeding) return pregnancy.breastfeeding;
    if (code === "Q_PREGNANCY_PLANNING") return pregnancy.planning;
  }
  if (hairConcernByCase[caseDef.index] && code === "Q_HAIR_CONCERN") return hairConcernByCase[caseDef.index]!;
  if (code === "Q_HAIR_SHEDDING_ONSET" && hairOnsetMonths[caseDef.index]?.shedding) return monthsBeforeInitial(caseDef, hairOnsetMonths[caseDef.index]!.shedding!);
  if (code === "Q_HAIR_THINNING_ONSET" && hairOnsetMonths[caseDef.index]?.thinning) return monthsBeforeInitial(caseDef, hairOnsetMonths[caseDef.index]!.thinning!);
  if (priorDiagnosisByCase[caseDef.index] && code === "Q_PRIOR_DIAGNOSES") return priorDiagnosisByCase[caseDef.index] as JsonValue;
  if (scalpSymptomsByCase[caseDef.index] && code === "Q_SCALP_SYMPTOMS") return scalpSymptomsByCase[caseDef.index] as JsonValue;
  if (triggerEventsByCase[caseDef.index] && code === "Q_TRIGGER_EVENTS") return triggerEventsByCase[caseDef.index] as JsonValue;
  if (femaleTriggerByCase[caseDef.index] && code === "Q_TRIGGER_EVENTS_FEMALE") return femaleTriggerByCase[caseDef.index] as JsonValue;
  if (maleTriggerByCase[caseDef.index] && code === "Q_TRIGGER_EVENTS_MALE") return maleTriggerByCase[caseDef.index] as JsonValue;
  if (hqByCase[caseDef.index]?.[code] !== undefined) return hqByCase[caseDef.index][code];
  if (code === "Q_HQ_ROUTINE_CHANGE_DATE" && [13, 16].includes(caseDef.index)) return monthsBeforeInitial(caseDef, caseDef.index === 13 ? 4 : 3);
  if (laserConcernsByCase[caseDef.index] && code === "Q_LASER_CONCERNS") return laserConcernsByCase[caseDef.index] as JsonValue;
  if (aestheticByCase[caseDef.index] && code === "Q_AESTHETIC_PROCEDURES") return aestheticByCase[caseDef.index] as JsonValue;

  if (code === "Q_SECONDARY_SCALP_GATE") return caseDef.index === 6 ? "YES" : "NO";
  if (code === "Q_SECONDARY_HAIR_GATE") return [7, 10, 12].includes(caseDef.index) ? "YES" : "NO";
  if (code === "Q_PRIOR_DIAGNOSIS_GATE" && [1,2,3,4,5,6,7,8,9,10,11,12].includes(caseDef.index)) return caseDef.index === 4 ? "NO" : "YES";
  if (code === "Q_SCALP_BIOPSY_GATE") return [6, 12].includes(caseDef.index) ? "YES" : "NO";
  if (code === "Q_SCALP_BIOPSY_DATE" && [6, 12].includes(caseDef.index)) return monthsBeforeInitial(caseDef, caseDef.index === 6 ? 31 : 31);
  if (code === "Q_SCALP_BIOPSY_AREA" && [6, 12].includes(caseDef.index)) return caseDef.index === 6 ? "TEMPLES" : "CROWN";
  if (code === "Q_SCALP_BIOPSY_RESULT_KNOWN" && [6, 12].includes(caseDef.index)) return "YES";
  if (code === "Q_HAIR_TREATMENT_GATE") return [1,2,5,6,7,8,10,11,12].includes(caseDef.index) ? "YES" : "NO";
  if (code === "Q_HAIR_PROCEDURE_GATE") return [2,5,6].includes(caseDef.index) ? "YES" : "NO";
  if (code === "Q_HAIR_PROCEDURES") {
    if (caseDef.index === 2) return ["PRP"];
    if (caseDef.index === 5 || caseDef.index === 6) return ["CORTISONE_INJ"];
  }

  const hairEvidence: Partial<Record<number, string[]>> = { 1: ["SCALP_MORE_VISIBLE", "PART_WIDENED", "HAIRLINE_RECEDED"], 2: ["PART_WIDENED", "SCALP_MORE_VISIBLE", "MORE_DURING_WASHING"], 3: ["MORE_DURING_WASHING", "OTHERS_NOTICED", "OTHER"], 4: ["HAIRLINE_RECEDED", "OLD_PHOTOS"], 5: ["GAPS", "OLD_PHOTOS"], 6: ["SCALP_MORE_VISIBLE", "GAPS"], 7: ["MORE_DURING_WASHING"], 10: ["HAIRLINE_RECEDED", "SCALP_MORE_VISIBLE"], 12: ["GAPS", "SCALP_MORE_VISIBLE"] };
  if (code === "Q_HAIR_EVIDENCE" && hairEvidence[caseDef.index]) return hairEvidence[caseDef.index] as JsonValue;
  const thinAreas: Partial<Record<number, string[]>> = { 1: ["FRONTAL", "TEMPLES", "CROWN"], 2: ["MID_SCALP", "CROWN"], 4: ["FRONTAL", "TEMPLES"], 5: ["PATCHES"], 6: ["FRONTAL", "TEMPLES", "PATCHES"], 10: ["FRONTAL", "CROWN"], 12: ["PATCHES", "CROWN"] };
  if (code === "Q_HAIR_THINNING_AREAS" && thinAreas[caseDef.index]) return thinAreas[caseDef.index] as JsonValue;
  if (code === "Q_HAIR_SHEDDING_SEVERITY") return String(({2:4,3:4,6:3,7:2,12:2} as Record<number,number>)[caseDef.index] ?? 2);
  if (code === "Q_HAIR_DENSITY_SEVERITY") return String(({1:4,2:3,4:3,5:3,6:4,10:3,12:3} as Record<number,number>)[caseDef.index] ?? 2);
  if (code === "Q_PATIENT_BOTHER") return String(({1:4,2:4,3:3,4:2,5:4,6:5,7:2,10:3,12:5} as Record<number,number>)[caseDef.index] ?? 2);
  if (code === "Q_CONFIDENCE_IMPACT") return String(({1:3,2:4,3:2,4:2,5:4,6:4,7:1,10:3,12:4} as Record<number,number>)[caseDef.index] ?? 2);
  if (code === "Q_HAIR_THINNING_SPEED") return caseDef.index === 5 ? "M3_6" : caseDef.index === 6 || caseDef.index === 12 ? "Y1_2" : "GE_2Y";
  if (code === "Q_HAIR_SHEDDING_COURSE") return caseDef.index === 3 ? "PERSISTENT_FLUCTUATING" : "PERSISTENT_SAME";
  if (code === "Q_HAIR_THINNING_COURSE") return caseDef.index === 5 ? "COMES_GOES" : "PERSISTENT_FLUCTUATING";
  if (code === "Q_OVERALL_COURSE") return ({3:"IMPROVED",5:"IMPROVED",6:"WORSENED",12:"WORSENED"} as Record<number,string>)[caseDef.index] ?? "UNCHANGED";
  if (code === "Q_TREATMENT_PREFERENCE") return "ALL_MEDICAL_OPTIONS";
  if (code === "Q_RESULT_SPEED_EXPECTATION") return "UNDERSTANDS_TIME";

  if (code === "Q_SCALP_WORSENING") return [7,8,9,11,12].includes(caseDef.index) ? "YES" : "NO";
  if (code === "Q_SCALP_RELIEVING") return [7,8,9,10,11,12].includes(caseDef.index) ? "YES" : "NO";
  if (code === "Q_SCALP_TIMING_GATE") return [7,8,11,12].includes(caseDef.index) ? "YES" : "NO";

  if (code === "Q_WOMEN_IRREGULAR_ONSET") return monthsBeforeInitial(caseDef, caseDef.index === 7 ? 30 : 24);
  if (code === "Q_WOMEN_HIRSUTISM_ONSET") return monthsBeforeInitial(caseDef, 24);
  if (code === "Q_WOMEN_ACNE_ONSET") return monthsBeforeInitial(caseDef, 18);
  if (code === "Q_WOMEN_OILINESS_ONSET") return monthsBeforeInitial(caseDef, 18);
  if (code === "Q_WOMEN_GYN_EVALUATED") return caseDef.index === 7 ? "YES" : "NO";
  if (code === "Q_WOMEN_PREMENSTRUAL_SYMPTOMS") return caseDef.index === 7 ? "SOMETIMES" : "USUALLY";
  if (code === "Q_WOMEN_HEAVY_SIGNS" && caseDef.index === 7) return ["FREQUENT_PAD_CHANGE", "LARGE_CLOTS", "ANEMIA_IRON"];
  if (code === "Q_WOMEN_SCANT_SIGNS" && caseDef.index === 2) return ["MUCH_LESS", "VERY_FEW_PADS", "VERY_SHORT"];
  if (code === "Q_WOMEN_HIRSUTISM_AREAS" && caseDef.index === 2) return ["CHIN_LIP", "LOWER_ABDOMEN"];
  if (code === "Q_WOMEN_ACNE_PATTERN") return caseDef.index === 2 || caseDef.index === 5 ? "FACE" : "OCCASIONAL";
  if (code === "Q_WOMEN_OILINESS_AREA") return "FACE";
  if (code === "Q_WOMEN_FERTILITY_STATUS") return caseDef.index === 7 ? "GE_12M" : "M6_12";
  if (code === "Q_WOMEN_CONTRACEPTION_STATUS") return caseDef.index === 2 ? "CURRENT" : "NO";
  if (code === "Q_WOMEN_CONTRACEPTION_TYPE" && caseDef.index === 2) return ["PILLS"];
  if (code === "Q_WOMEN_INTIMATE_DESIRE") return caseDef.index === 2 ? "DECREASED" : "NO_CHANGE";
  if (code === "Q_WOMEN_INTIMATE_DESIRE_ONSET" && caseDef.index === 2) return "M3_6";

  if (code === "Q_MEN_BREAST_ONSET") return monthsBeforeInitial(caseDef, caseDef.index === 6 ? 12 : 8);
  if (code === "Q_MEN_BODY_HAIR_ONSET") return monthsBeforeInitial(caseDef, 12);
  if (code === "Q_MEN_MUSCLE_ONSET") return monthsBeforeInitial(caseDef, 12);
  if (code === "Q_MEN_HORMONE_START") return monthsBeforeInitial(caseDef, 36);
  if (code === "Q_MEN_HORMONE_STOP") return monthsBeforeInitial(caseDef, 18);
  if (code === "Q_MEN_LIBIDO_ONSET") return "M6_12";
  if (code === "Q_MEN_LIBIDO_MED_RELATION") return [1,10].includes(caseDef.index) ? "YES" : "NO";
  if (code === "Q_MEN_ERECTION_ONSET") return "M6_12";
  if (code === "Q_MEN_ERECTION_FREQUENCY") return "SOMETIMES";
  if (code === "Q_MEN_ERECTION_MED_RELATION") return caseDef.index === 10 ? "YES" : "NO";
  if (code === "Q_MEN_BREAST_CHANGE") return caseDef.index === 6 ? "ENLARGEMENT" : "PAIN";
  if (code === "Q_MEN_BREAST_MED_RELATION") return [6,10].includes(caseDef.index) ? "YES" : "NO";
  if (code === "Q_MEN_BODY_HAIR_AREAS" && caseDef.index === 6) return ["BEARD_MOUSTACHE", "CHEST"];
  if (code === "Q_MEN_BODY_HAIR_PATTERN") return "GRADUAL";
  if (code === "Q_MEN_MUSCLE_CHANGE" && caseDef.index === 6) return "BOTH";
  if (code === "Q_MEN_MUSCLE_ACTIVITY_RELATION") return "NO";
  if (code === "Q_MEN_FERTILITY_SHORT") return [1,12].includes(caseDef.index) ? "YES" : "NO";
  if (code === "Q_MEN_HORMONES_STEROIDS") return caseDef.index === 6 || caseDef.index === 12 ? "PREVIOUS" : "NEVER";
  if (code === "Q_MEN_HORMONE_HAIR_CHANGE") return caseDef.index === 6 || caseDef.index === 12 ? "YES" : "NO";
  if (code === "Q_MEN_HORMONE_HAIR_CHANGE_TYPES") return caseDef.index === 6 ? ["THINNING", "OILINESS"] : ["SHEDDING"];

  const lifestyle: Partial<Record<number, Record<string, JsonValue>>> = {
    1: { Q_LIFESTYLE_WEIGHT_GAIN: "NO", Q_LIFESTYLE_NO_VEGETABLES: "NO", Q_LIFESTYLE_NO_RED_MEAT: "NO", Q_LIFESTYLE_CHRONIC_DIARRHEA: "NO", Q_LIFESTYLE_BARIATRIC_SURGERY: "NO", Q_LIFESTYLE_SMOKING_VAPE: "NO", Q_LIFESTYLE_HAIR_CONCEALMENT: ["FIBERS"] },
    2: { Q_LIFESTYLE_WEIGHT_GAIN: "NO", Q_LIFESTYLE_NO_VEGETABLES: "NO", Q_LIFESTYLE_NO_RED_MEAT: "YES", Q_LIFESTYLE_CHRONIC_DIARRHEA: "NO", Q_LIFESTYLE_BARIATRIC_SURGERY: "NO", Q_LIFESTYLE_SMOKING_VAPE: "NO", Q_LIFESTYLE_HAIR_CONCEALMENT: ["FIBERS"] },
    3: { Q_LIFESTYLE_WEIGHT_GAIN: "NO", Q_LIFESTYLE_NO_VEGETABLES: "NO", Q_LIFESTYLE_NO_RED_MEAT: "NO", Q_LIFESTYLE_CHRONIC_DIARRHEA: "NO", Q_LIFESTYLE_BARIATRIC_SURGERY: "NO", Q_LIFESTYLE_SMOKING_VAPE: "NO", Q_LIFESTYLE_HAIR_CONCEALMENT: ["NONE"] },
    4: { Q_LIFESTYLE_WEIGHT_GAIN: "NO", Q_LIFESTYLE_NO_VEGETABLES: "NO", Q_LIFESTYLE_NO_RED_MEAT: "NO", Q_LIFESTYLE_CHRONIC_DIARRHEA: "NO", Q_LIFESTYLE_BARIATRIC_SURGERY: "NO", Q_LIFESTYLE_SMOKING_VAPE: "YES", Q_LIFESTYLE_HAIR_CONCEALMENT: ["NONE"] },
    5: { Q_LIFESTYLE_WEIGHT_GAIN: "NO", Q_LIFESTYLE_NO_VEGETABLES: "NO", Q_LIFESTYLE_NO_RED_MEAT: "NO", Q_LIFESTYLE_CHRONIC_DIARRHEA: "NO", Q_LIFESTYLE_BARIATRIC_SURGERY: "NO", Q_LIFESTYLE_SMOKING_VAPE: "NO", Q_LIFESTYLE_HAIR_CONCEALMENT: ["WIG"] },
    6: { Q_LIFESTYLE_WEIGHT_GAIN: "NO", Q_LIFESTYLE_NO_VEGETABLES: "NO", Q_LIFESTYLE_NO_RED_MEAT: "NO", Q_LIFESTYLE_CHRONIC_DIARRHEA: "NO", Q_LIFESTYLE_BARIATRIC_SURGERY: "YES", Q_LIFESTYLE_SMOKING_VAPE: "NO", Q_LIFESTYLE_HAIR_CONCEALMENT: ["NONE"] },
    7: { Q_LIFESTYLE_WEIGHT_GAIN: "NO", Q_LIFESTYLE_NO_VEGETABLES: "NO", Q_LIFESTYLE_NO_RED_MEAT: "NO", Q_LIFESTYLE_CHRONIC_DIARRHEA: "NO", Q_LIFESTYLE_BARIATRIC_SURGERY: "NO", Q_LIFESTYLE_SMOKING_VAPE: "NO", Q_LIFESTYLE_HAIR_CONCEALMENT: ["NONE"] },
    10: { Q_LIFESTYLE_WEIGHT_GAIN: "NO", Q_LIFESTYLE_NO_VEGETABLES: "NO", Q_LIFESTYLE_NO_RED_MEAT: "NO", Q_LIFESTYLE_CHRONIC_DIARRHEA: "NO", Q_LIFESTYLE_BARIATRIC_SURGERY: "NO", Q_LIFESTYLE_SMOKING_VAPE: "NO", Q_LIFESTYLE_HAIR_CONCEALMENT: ["NONE"] },
    12: { Q_LIFESTYLE_WEIGHT_GAIN: "NO", Q_LIFESTYLE_NO_VEGETABLES: "NO", Q_LIFESTYLE_NO_RED_MEAT: "NO", Q_LIFESTYLE_CHRONIC_DIARRHEA: "NO", Q_LIFESTYLE_BARIATRIC_SURGERY: "NO", Q_LIFESTYLE_SMOKING_VAPE: "NO", Q_LIFESTYLE_HAIR_CONCEALMENT: ["NONE"] },
  };
  const lifestyleCase = lifestyle[caseDef.index];
  if (lifestyleCase?.[code] !== undefined) return lifestyleCase[code];
  return undefined;
}

function chooseMulti(question: P01EvaluatedQuestion): string[] {
  const options = question.options;
  if (!options.length) return [];
  const neutral = options.find((option) => /^(NONE|NONE_OF_THE_ABOVE|NO_SYMPTOMS|NO_CHANGE|NEVER)$/.test(option.code));
  if (neutral) return [neutral.code];
  return [options[0].code];
}

function chooseSingle(question: P01EvaluatedQuestion): string {
  if (!question.options.length) return "YES";
  const neutralCodes = ["NO", "NONE", "NONE_OF_THE_ABOVE", "NO_CHANGE", "NEVER", "UNCHANGED", "NOT_APPLICABLE", "UNSURE"];
  for (const code of neutralCodes) {
    const match = question.options.find((option) => option.code === code);
    if (match) return match.code;
  }
  return question.options[0].code;
}

function genericRepeatable(contract: P01QuestionContract, caseDef: SyntheticCase): JsonValue {
  throw new Error(`Synthetic case ${caseDef.index} has no clinically coherent repeatable fixture for ${contract.code}.`);
}

function repeatableAnswer(contract: P01QuestionContract, caseDef: SyntheticCase, answers: Record<string, JsonValue>): JsonValue {
  const make = (id: string, extra: Record<string, JsonValue>): Record<string, JsonValue> => ({ id, ...extra });

  const healthItem: Partial<Record<string, { ar: string; en: string; detailsAr: string; detailsEn: string; monthsBack: number }>> = {
    Q_HEALTH_CHRONIC_ITEMS: caseDef.index === 2
      ? { ar: "قصور الغدة الدرقية", en: "Hypothyroidism", detailsAr: "مستقر على العلاج والمتابعة الدورية.", detailsEn: "Stable on treatment with routine follow-up.", monthsBack: 60 }
      : caseDef.index === 7
        ? { ar: "السكري من النوع الثاني", en: "Type 2 diabetes", detailsAr: "مضبوط حاليًا دون مضاعفات معروفة.", detailsEn: "Currently controlled without known complications.", monthsBack: 48 }
        : { ar: "ارتفاع ضغط الدم", en: "Hypertension", detailsAr: "مستقر على العلاج.", detailsEn: "Stable on treatment.", monthsBack: 54 },
    Q_HEALTH_TUMOR_ITEMS: { ar: "سرطان خلايا قاعدية سابق بالوجه", en: "Prior facial basal cell carcinoma", detailsAr: "أزيل جراحيًا بالكامل ولا يوجد علاج نشط حاليًا.", detailsEn: "Completely excised; no active treatment currently.", monthsBack: 42 },
    Q_HEALTH_MEDICATION_ITEMS: caseDef.index === 1 || caseDef.index === 10
      ? { ar: "فيناسترايد", en: "Finasteride", detailsAr: "استخدام منتظم لعلاج تساقط الشعر.", detailsEn: "Regular use for hair loss.", monthsBack: 18 }
      : caseDef.index === 2
        ? { ar: "ليفوثيروكسين", en: "Levothyroxine", detailsAr: "جرعة ثابتة لقصور الغدة الدرقية.", detailsEn: "Stable dose for hypothyroidism.", monthsBack: 48 }
      : caseDef.index === 7
        ? { ar: "ميتفورمين", en: "Metformin", detailsAr: "استخدام منتظم لضبط السكري من النوع الثاني.", detailsEn: "Regular use for type 2 diabetes control.", monthsBack: 36 }
      : caseDef.index === 12
        ? { ar: "لوسارتان", en: "Losartan", detailsAr: "جرعة يومية ثابتة لضغط الدم.", detailsEn: "Stable daily dose for blood pressure.", monthsBack: 30 }
      : caseDef.index === 14
        ? { ar: "إيزوتريتينوين", en: "Isotretinoin", detailsAr: "علاج حب الشباب بجرعة ثابتة حاليًا.", detailsEn: "Current fixed-dose acne treatment.", monthsBack: 5 }
      : caseDef.index === 24
        ? { ar: "سيتريزين", en: "Cetirizine", detailsAr: "يستخدم عند الحاجة لنوبات الشرى.", detailsEn: "Used as needed for urticaria flares.", monthsBack: 14 }
      : { ar: "تريتينوين موضعي", en: "Topical tretinoin", detailsAr: "استخدام ليلي منتظم للعناية الجلدية.", detailsEn: "Regular nightly topical skin-care use.", monthsBack: 12 },
    Q_HEALTH_SUPPLEMENT_ITEMS: caseDef.index === 2
      ? { ar: "حديد", en: "Iron supplement", detailsAr: "بدأ بعد اكتشاف انخفاض مخزون الحديد.", detailsEn: "Started after low iron stores were identified.", monthsBack: 10 }
      : caseDef.index === 3
        ? { ar: "فيتامينات ما بعد الولادة", en: "Postnatal multivitamin", detailsAr: "تستخدمه خلال فترة الرضاعة.", detailsEn: "Used during breastfeeding.", monthsBack: 6 }
        : { ar: "فيتامين د", en: "Vitamin D", detailsAr: "مكمل أسبوعي بجرعة ثابتة.", detailsEn: "Stable weekly supplement.", monthsBack: 12 },
    Q_HEALTH_ALLERGY_ITEMS: { ar: "حساسية من البنسلين", en: "Penicillin allergy", detailsAr: "طفح جلدي سابق دون تأق.", detailsEn: "Prior rash without anaphylaxis.", monthsBack: 120 },
    Q_HEALTH_SURGERY_ITEMS: caseDef.index === 6
      ? { ar: "تكميم المعدة", en: "Sleeve gastrectomy", detailsAr: "أجريت دون مضاعفات مستمرة.", detailsEn: "Completed without ongoing complications.", monthsBack: 40 }
      : { ar: "استئصال الزائدة الدودية", en: "Appendectomy", detailsAr: "جراحة سابقة دون مضاعفات لاحقة.", detailsEn: "Prior surgery without later complications.", monthsBack: 72 },
  };
  if (healthItem[contract.code]) {
    const item = healthItem[contract.code]!;
    return [make(`${contract.code}-${caseDef.index}`, { name: syntheticText(caseDef, item.ar, item.en), date: monthsBeforeInitial(caseDef, item.monthsBack), details: syntheticText(caseDef, item.detailsAr, item.detailsEn) })];
  }
  if (contract.code === "Q_LIFESTYLE_BARIATRIC_DETAILS") {
    return [make(`bariatric-${caseDef.index}`, { name: syntheticText(caseDef, "تكميم المعدة", "Sleeve gastrectomy"), date: monthsBeforeInitial(caseDef, 40) })];
  }

  if (contract.code === "Q_SCALP_SYMPTOM_DETAILS") {
    const result: Record<string, JsonValue> = {};
    const onsetMonths: Partial<Record<number, number>> = { 6: 36, 7: 24, 8: 36, 9: 2, 10: 30, 11: 12, 12: 36 };
    const metrics = syntheticInitialMetrics(caseDef);
    for (const code of selectedStrings(answers.Q_SCALP_SYMPTOMS).filter((code) => code !== "NO_SYMPTOMS")) {
      const severityByCode: Partial<Record<string, number>> = {
        ITCH: metrics?.ITCH,
        BURNING: metrics?.BURNING,
        SCALP_PAIN: metrics?.SCALP_PAIN,
      };
      const severity = severityByCode[code];
      result[code] = {
        onset: monthsBeforeInitial(caseDef, onsetMonths[caseDef.index] ?? 12),
        pattern: [6, 12].includes(caseDef.index) ? "PERSISTENT" : "INTERMITTENT",
        ...(["ITCH", "BURNING", "SCALP_PAIN"].includes(code) ? { severity: String(Math.max(1, severity ?? 1)) } : {}),
      } as JsonValue;
    }
    return result;
  }

  if (contract.code === "Q_TRIGGER_EVENT_DETAILS") {
    const onset = Math.min(hairOnsetMonths[caseDef.index]?.shedding ?? 60, hairOnsetMonths[caseDef.index]?.thinning ?? 60);
    return selectedStrings(answers.Q_TRIGGER_EVENTS).filter((code) => code !== "NONE_OF_THE_ABOVE").map((code, i) => make(code, { event: code, ...(code === "OTHER" ? { details: syntheticText(caseDef, "تغير واضح في نمط النوم والعمل", "A marked change in sleep and work pattern") } : {}), date: monthsBeforeInitial(caseDef, onset + 2 + i) }));
  }
  if (contract.code === "Q_TRIGGER_EVENTS_FEMALE_DETAILS") {
    const months = caseDef.index === 3 ? 6 : 18;
    return selectedStrings(answers.Q_TRIGGER_EVENTS_FEMALE).filter((code) => code !== "NONE").map((code) => make(code, { event: code, date: monthsBeforeInitial(caseDef, months) }));
  }
  if (contract.code === "Q_TRIGGER_EVENTS_MALE_DETAILS") {
    return selectedStrings(answers.Q_TRIGGER_EVENTS_MALE).filter((code) => code !== "NONE").map((code) => make(code, { event: code, date: monthsBeforeInitial(caseDef, 36) }));
  }
  if (contract.code === "Q_PRIOR_DIAGNOSIS_DETAILS") {
    const monthsByCaseAndDiagnosis: Partial<Record<number, Record<string, number>>> = {
      1: { PATTERN_HAIR_LOSS: 36 },
      2: { PATTERN_HAIR_LOSS: 36, TELOGEN_EFFLUVIUM: 6 },
      3: { POSTPARTUM_SHEDDING: 3 },
      5: { ALOPECIA_AREATA: 5 },
      6: { OTHER: 30 },
      7: { SEBORRHEIC_DERMATITIS: 24 },
      8: { SCALP_PSORIASIS: 30 },
      9: { SCALP_ALLERGY: 1 },
      10: { SEBORRHEIC_DERMATITIS: 24, PATTERN_HAIR_LOSS: 36 },
      11: { SCALP_ROSACEA: 10 },
      12: { SCARRING_ALOPECIA: 30 },
    };
    return selectedStrings(answers.Q_PRIOR_DIAGNOSES).filter((code) => code !== "DO_NOT_REMEMBER").map((code) => make(code, { diagnosis: code, date: monthsBeforeInitial(caseDef, monthsByCaseAndDiagnosis[caseDef.index]?.[code] ?? 12) }));
  }
  if (contract.code === "Q_HAIR_TREATMENT_ITEMS") {
    const treatments: Record<number, { ar: string; en: string; monthsBack: number; using: "YES" | "NO"; stopMonthsBack?: number }> = {
      1: { ar: "فيناسترايد", en: "Finasteride", monthsBack: 18, using: "YES" },
      2: { ar: "مينوكسيديل موضعي 5%", en: "Topical minoxidil 5%", monthsBack: 14, using: "YES" },
      5: { ar: "كورتيزون موضعي", en: "Topical corticosteroid", monthsBack: 4, using: "NO", stopMonthsBack: 2 },
      6: { ar: "هيدروكسي كلوروكوين", en: "Hydroxychloroquine", monthsBack: 24, using: "YES" },
      7: { ar: "شامبو كيتوكونازول", en: "Ketoconazole shampoo", monthsBack: 20, using: "YES" },
      8: { ar: "كورتيزون موضعي لفروة الرأس", en: "Topical scalp corticosteroid", monthsBack: 18, using: "YES" },
      10: { ar: "شامبو كيتوكونازول", en: "Ketoconazole shampoo", monthsBack: 18, using: "YES" },
      11: { ar: "دوكسيسيكلين", en: "Doxycycline", monthsBack: 8, using: "NO", stopMonthsBack: 2 },
      12: { ar: "هيدروكسي كلوروكوين", en: "Hydroxychloroquine", monthsBack: 20, using: "YES" },
    };
    const item = treatments[caseDef.index] ?? { ar: "مينوكسيديل موضعي", en: "Topical minoxidil", monthsBack: 12, using: "YES" as const };
    return [make(`treatment-${caseDef.index}`, { name: syntheticText(caseDef, item.ar, item.en), start: monthsBeforeInitial(caseDef, item.monthsBack), stillUsing: item.using, ...(item.using === "NO" && item.stopMonthsBack ? { stop: monthsBeforeInitial(caseDef, item.stopMonthsBack) } : {}) })];
  }
  if (contract.code === "Q_HAIR_PROCEDURE_DETAILS") {
    return selectedStrings(answers.Q_HAIR_PROCEDURES).map((code, i) => make(code, { procedure: code, count: String(caseDef.index === 2 ? 3 : 2), lastDate: monthsBeforeInitial(caseDef, 4 + i * 2) }));
  }
  if (contract.code === "Q_HQ_PREVIOUS_TREATMENT_DETAILS") {
    const treatmentText: Record<string, { ar: string; en: string; stillPresent: "YES" | "NO" | "UNSURE"; monthsBack: number }> = {
      DYE: { ar: "صبغة شعر دائمة", en: "Permanent hair color", stillPresent: "YES", monthsBack: 5 },
      BLEACH: { ar: "تفتيح الشعر", en: "Hair bleaching", stillPresent: "YES", monthsBack: 7 },
      KERATIN: { ar: "معالجة كيراتين لتنعيم الشعر", en: "Keratin smoothing treatment", stillPresent: "YES", monthsBack: 10 },
      CHEMICAL_STRAIGHTENING: { ar: "فرد كيميائي للشعر", en: "Chemical hair straightening", stillPresent: "YES", monthsBack: 11 },
    };
    return selectedStrings(answers.Q_HQ_PREVIOUS_TREATMENTS).filter((code) => code !== "NONE").map((code, i) => {
      const detail = treatmentText[code] ?? { ar: "معالجة كيميائية سابقة للشعر", en: "Prior chemical hair treatment", stillPresent: "UNSURE" as const, monthsBack: 9 + i };
      return make(code, { treatment: code, typeText: syntheticText(caseDef, detail.ar, detail.en), when: monthsBeforeInitial(caseDef, detail.monthsBack), stillPresent: detail.stillPresent });
    });
  }
  if (contract.code === "Q_HQ_DRUG_EXPOSURE_DETAILS") {
    return selectedStrings(answers.Q_HQ_DRUG_EXPOSURES).filter((code) => code !== "NONE").map((code, i) => {
      if (caseDef.index === 14 && code === "ISOTRETINOIN") {
        return make(code, {
          exposure: code,
          status: "CURRENT",
          start: monthsBeforeInitial(caseDef, 5),
          hairChange: "YES",
          changeDescription: syntheticText(caseDef, "بدأ جفاف وهشاشة الشعر بعد بدء الإيزوتريتينوين.", "Hair dryness and fragility began after isotretinoin was started."),
        });
      }
      return make(code, { exposure: code, status: "PREVIOUS", start: monthsBeforeInitial(caseDef, 18 + i * 3), stop: monthsBeforeInitial(caseDef, 8 + i * 2), hairChange: "NO" });
    });
  }
  if (contract.code === "Q_HQ_HEAT_TOOL_DETAILS") {
    const frequencyByTool: Record<string, string> = { BLOW_DRYER: "WEEKLY_3_4", FLAT_IRON: "WEEKLY_1_2", CURLING_TOOL: "WEEKLY_1_2", DIFFUSER: "WEEKLY_3_4" };
    return selectedStrings(answers.Q_HQ_HEAT_TOOLS).filter((code) => code !== "NONE").map((code) => make(code, { tool: code, frequency: frequencyByTool[code] ?? "LT_WEEKLY" }));
  }
  if (contract.code === "Q_HQ_ROUTINE_DETAILS") {
    const frequencyByItem: Record<string, string> = { SHAMPOO: "EVERY_WASH", CONDITIONER: "EVERY_WASH", MASK: "WEEKLY", LEAVE_IN: "EVERY_WASH", OIL: "WEEKLY" };
    return selectedStrings(answers.Q_HQ_ROUTINE_ITEMS).filter((code) => code !== "NONE").map((code) => make(code, { routineItem: code, frequency: frequencyByItem[code] ?? "WEEKLY" }));
  }
  if (contract.code === "Q_HQ_POST_WASH_ORDER") {
    const selected = selectedStrings(answers.Q_HQ_ROUTINE_ITEMS);
    const steps: string[] = [];
    if (selected.includes("CONDITIONER") || selected.includes("MASK")) steps.push("CONDITIONING");
    if (selected.includes("LEAVE_IN")) steps.push("LEAVE_IN");
    if (selected.includes("OIL")) steps.push("OIL");
    return steps.map((step, i) => make(step, { step, rank: i + 1 }));
  }
  if (contract.code === "Q_LASER_CONCERN_DETAILS") {
    const laserDetailByCode: Record<string, { area: string; goalAr: string; goalEn: string; resultAr: string; resultEn: string }> = {
      LASER_UNWANTED_HAIR: { area: "FACE", goalAr: "تقليل نمو الشعر غير المرغوب فيه تدريجيًا.", goalEn: "Gradually reduce unwanted hair growth.", resultAr: "انخفاض واضح في كثافة الشعر مع أقل تهيج ممكن.", resultEn: "Visible reduction in hair density with minimal irritation." },
      LASER_PIGMENTATION: { area: "FACE", goalAr: "تخفيف التصبغ السطحي وتوحيد اللون.", goalEn: "Reduce superficial pigmentation and even skin tone.", resultAr: "تحسن تدريجي في البقع دون تفتيح مفرط.", resultEn: "Gradual fading of spots without over-lightening." },
      LASER_MELASMA: { area: "FACE", goalAr: "مناقشة دور الليزر ضمن خطة محافظة للكلف.", goalEn: "Discuss the role of laser within a conservative melasma plan.", resultAr: "تحسن محافظ مع تقليل خطر ارتداد التصبغ.", resultEn: "Conservative improvement while minimizing rebound pigmentation." },
      LASER_REDNESS_VESSELS: { area: "FACE", goalAr: "تقليل الاحمرار والأوعية السطحية الظاهرة.", goalEn: "Reduce visible redness and superficial vessels.", resultAr: "انخفاض الاحمرار مع الحفاظ على لون الجلد الطبيعي.", resultEn: "Less redness while preserving natural skin tone." },
      LASER_ACNE_SCARS: { area: "FACE", goalAr: "تحسين ملمس ندبات حب الشباب تدريجيًا.", goalEn: "Gradually improve acne-scar texture.", resultAr: "تحسن ملموس في الملمس مع توقعات واقعية.", resultEn: "Meaningful texture improvement with realistic expectations." },
      LASER_RESURFACING: { area: "FACE", goalAr: "تحسين الملمس غير المتجانس المرتبط بالندبات.", goalEn: "Improve uneven texture related to scarring.", resultAr: "سطح جلد أكثر تجانسًا بعد سلسلة علاج مناسبة.", resultEn: "More even skin texture after an appropriate treatment series." },
      LASER_TATTOO_PMU: { area: "BODY", goalAr: "تخفيف صبغة الوشم تدريجيًا على جلسات متعددة.", goalEn: "Gradually fade tattoo pigment over multiple sessions.", resultAr: "تخفيف واضح للصبغة مع تقليل خطر الندبة أو تغير اللون.", resultEn: "Clear pigment fading while minimizing scarring or dyspigmentation." },
    };
    return selectedStrings(answers.Q_LASER_CONCERNS).map((code, i) => {
      const detail = laserDetailByCode[code] ?? { area: "OTHER", goalAr: "مناقشة ملاءمة الليزر للمشكلة المحددة.", goalEn: "Discuss laser suitability for the specific concern.", resultAr: "تحسن محافظ يتناسب مع نوع المشكلة.", resultEn: "Conservative improvement appropriate to the concern." };
      const priorByCase: Partial<Record<number, "YES" | "NO">> = { 25: "NO", 26: "NO", 27: "NO", 28: "YES", 29: "NO", 30: "YES" };
      const prior = priorByCase[caseDef.index] ?? "NO";
      return make(code, {
        concern: code,
        ...(code === "LASER_OTHER" ? { otherText: syntheticText(caseDef, "طلب ليزر موضعي يحتاج تقييم الطبيب", "Localized laser concern requiring physician assessment") } : {}),
        ...(caseDef.primary === "RV_LASER" ? { area: detail.area, ...(detail.area === "OTHER" ? { areaOther: syntheticText(caseDef, "منطقة محددة يوضحها المراجع أثناء الفحص", "A specific area to be clarified during examination") } : {}), goal: syntheticText(caseDef, detail.goalAr, detail.goalEn), desiredResult: syntheticText(caseDef, detail.resultAr, detail.resultEn) } : {}),
        prior,
        ...(prior === "YES" ? { count: caseDef.index === 28 ? 4 : 3, lastDate: monthsBeforeInitial(caseDef, 6 + i * 2), complications: "NO" } : {}),
      });
    });
  }
  if (contract.code === "Q_AESTHETIC_DETAILS") {
    const areaByCode: Record<string, string> = {
      AP_BOTOX: "FACE_NECK", AP_FILLER: "FACE", AP_COLLAGEN_STIMULATORS: "NECK", AP_FAT_DISSOLVING: "DOUBLE_CHIN",
    };
    const desiredByCode: Record<string, { ar: string; en: string }> = {
      AP_BOTOX: { ar: "تخفيف خطوط التعبير مع الحفاظ على حركة طبيعية.", en: "Soften dynamic lines while preserving natural movement." },
      AP_FILLER: { ar: "تعويض حجم بسيط دون تغيير مبالغ في الملامح.", en: "Restore subtle volume without over-altering facial features." },
      AP_SKIN_BOOSTER: { ar: "تحسين الترطيب والملمس مع نتيجة تدريجية.", en: "Improve hydration and texture with a gradual result." },
      AP_COLLAGEN_STIMULATORS: { ar: "تحسين تدريجي في تماسك وجودة الجلد.", en: "Gradual improvement in skin firmness and quality." },
      AP_FAT_DISSOLVING: { ar: "تقليل امتلاء الذقن المزدوج بشكل محافظ.", en: "Conservatively reduce submental fullness." },
      AP_SWEATING_INJECTION: { ar: "تقليل التعرق الإبطي بما يحسن الراحة اليومية.", en: "Reduce axillary sweating to improve day-to-day comfort." },
      AP_BODY_CONTOURING: { ar: "تحسين تناسق المنطقة المستهدفة مع توقعات واقعية.", en: "Improve contour of the targeted area with realistic expectations." },
    };
    return selectedStrings(answers.Q_AESTHETIC_PROCEDURES).map((code, i) => {
      const priorByCase: Partial<Record<number, "YES" | "NO">> = { 31: "YES", 32: "NO", 33: "NO", 34: "NO", 35: "NO", 36: "NO" };
      const prior = priorByCase[caseDef.index] ?? "NO";
      const areaText = code === "AP_SKIN_BOOSTER"
        ? syntheticText(caseDef, "الوجه والخدين", "Face and cheeks")
        : code === "AP_SWEATING_INJECTION"
          ? syntheticText(caseDef, "الإبطان", "Both axillae")
          : syntheticText(caseDef, "البطن السفلي", "Lower abdomen");
      const desired = desiredByCode[code] ?? { ar: "نتيجة محافظة تتناسب مع تقييم الطبيب.", en: "A conservative result appropriate to physician assessment." };
      return make(code, {
        procedure: code,
        ...(code === "AP_OTHER" ? { otherText: syntheticText(caseDef, "تحسين تجميلي لمنطقة محددة", "Cosmetic improvement for a selected area") } : {}),
        ...(caseDef.primary === "RV_AESTHETIC_PROCEDURES" ? {
          ...(areaByCode[code] ? { area: areaByCode[code] } : {}),
          ...(["AP_SKIN_BOOSTER", "AP_SWEATING_INJECTION", "AP_BODY_CONTOURING"].includes(code) ? { areaText } : {}),
          ...(code === "AP_BODY_CONTOURING" ? { goal: "SLIM" } : {}),
          desiredResult: syntheticText(caseDef, desired.ar, desired.en),
        } : {}),
        prior,
        ...(prior === "YES" ? { count: 2, lastDate: monthsBeforeInitial(caseDef, 8 + i * 2), complications: "NO" } : {}),
      });
    });
  }

  return genericRepeatable(contract, caseDef);
}

function textAnswer(question: P01EvaluatedQuestion, caseDef: SyntheticCase): string {
  const contract = P01_QUESTION_CONTRACTS.find((item) => item.code === question.code)!;
  const textRule = (contract.validation as Array<Record<string, unknown>>).find((rule) => rule.kind === "TEXT");
  const maxLength = typeof textRule?.maxLength === "number" ? textRule.maxLength : 500;
  const semanticText: Partial<Record<string, { ar: string; en: string }>> = {
    Q_HAIR_EVIDENCE_OTHER: { ar: "ألاحظ شعرًا أكثر من المعتاد على الوسادة والملابس.", en: "I notice more hair than usual on my pillow and clothing." },
    Q_SCALP_OTHER_TEXT: { ar: "إحساس بالشد والاحمرار في فروة الرأس.", en: "A tight, red sensation on the scalp." },
    Q_SCALP_WORSENING_DETAIL: caseDef.index === 8 ? { ar: "الطقس الجاف والبارد.", en: "Cold, dry weather." } : { ar: "الحرارة والتعرق.", en: "Heat and sweating." },
    Q_SCALP_RELIEVING_DETAIL: caseDef.index === 9 ? { ar: "إيقاف صبغة الشعر واستخدام شامبو لطيف.", en: "Stopping the hair dye and using a gentle shampoo." } : { ar: "الشامبو أو العلاج الموصوف لفروة الرأس.", en: "The prescribed scalp shampoo or treatment." },
    Q_SCALP_TIMING_DETAIL: { ar: "تزداد الأعراض بعد التعرض للحرارة أو في نهاية اليوم.", en: "Symptoms worsen after heat exposure or toward the end of the day." },
    Q_PRIOR_DIAGNOSIS_OTHER: { ar: "الحزاز المسطح الشعري", en: "Lichen planopilaris" },
    Q_SCALP_BIOPSY_RESULT_TEXT: { ar: "التهاب حول الجريبات مع تليف يتوافق مع تساقط ندبي.", en: "Perifollicular inflammation and fibrosis consistent with scarring alopecia." },
    Q_WOMEN_IRREGULAR_INTERVAL: { ar: "45", en: "45" },
    Q_WOMEN_IRREGULAR_DURATION: { ar: "6", en: "6" },
    Q_WOMEN_CONTRACEPTION_NAME: { ar: "حبوب منع حمل مركبة", en: "Combined oral contraceptive pill" },
    Q_MEN_LIBIDO_MED_NAME: { ar: "فيناسترايد", en: "Finasteride" },
    Q_MEN_ERECTION_MED_NAME: { ar: "فيناسترايد", en: "Finasteride" },
    Q_MEN_BREAST_MED_NAME: caseDef.index === 6 ? { ar: "استخدام سابق لستيرويد بنائي", en: "Prior anabolic steroid use" } : { ar: "فيناسترايد", en: "Finasteride" },
    Q_MEN_HORMONE_NAME: { ar: "تستوستيرون / ستيرويد بنائي", en: "Testosterone / anabolic steroid" },
    Q_HQ_CLEANSER_OTHER: { ar: "شامبو مخصص للشعر المصبوغ", en: "Color-safe shampoo" },
    Q_HQ_ROUTINE_CHANGE_TEXT: caseDef.index === 13 ? { ar: "زاد استخدام المكواة بعد جلسة تفتيح للشعر.", en: "Flat-iron use increased after a bleaching session." } : { ar: "بدأ استخدام ليف-إن وزيت خفيف بعد الغسل.", en: "Started using a leave-in product and light oil after washing." },
    Q_DERMATOLOGY_CONCERN: { ar: caseDef.assessmentNoteAr, en: caseDef.assessmentNoteEn },
  };
  if (semanticText[question.code]) return syntheticText(caseDef, semanticText[question.code]!.ar, semanticText[question.code]!.en).slice(0, maxLength);
  if (maxLength <= 3) {
    const compact = maxLength <= 2 ? "5" : "30";
    return compact.slice(0, maxLength);
  }
  const pathwayText: Record<PrimaryReason, { ar: string; en: string }> = {
    RV_HAIR_LOSS: { ar: "تساقط وترقق متدرج مع اختلاف واضح في الشدة عبر الوقت.", en: "Gradual shedding and thinning with clear variation in severity over time." },
    RV_SCALP_SYMPTOMS: { ar: "أعراض فروة متقطعة تشمل الحكة أو القشور وتختلف حسب الظروف.", en: "Intermittent scalp symptoms including itch or flaking that vary with circumstances." },
    RV_HAIR_QUALITY: { ar: "تغير في جودة ساق الشعرة مرتبط بالعناية والحرارة أو المعالجات السابقة.", en: "Hair-shaft quality change associated with care routine, heat, or prior treatments." },
    RV_DERMATOLOGY: { ar: "مشكلة جلدية متكررة يرغب المراجع في تقييمها ووضع خطة علاج واضحة لها.", en: "A recurrent dermatologic concern for assessment and a clear treatment plan." },
    RV_LASER: { ar: "طلب ليزر محدد مع تاريخ جلسات سابق وهدف واضح من العلاج.", en: "A specific laser request with prior-session history and a clear treatment goal." },
    RV_AESTHETIC_PROCEDURES: { ar: "استشارة لإجراء تجميلي مع هدف طبيعي وتاريخ إجراءات سابق متفاوت.", en: "An aesthetic-procedure consultation with a natural goal and varied prior-procedure history." },
  };
  const baseText = syntheticText(caseDef, pathwayText[caseDef.primary].ar, pathwayText[caseDef.primary].en);
  return baseText.slice(0, maxLength);
}

function answerQuestion(question: P01EvaluatedQuestion, caseDef: SyntheticCase, answers: Record<string, JsonValue>): JsonValue {
  const contract = P01_QUESTION_CONTRACTS.find((item) => item.code === question.code)!;
  const coherentOverride = coherentAnswerOverride(question.code, caseDef);
  if (coherentOverride !== undefined) return coherentOverride;

  switch (question.code) {
    case "Q_PRIVACY_CONSENT": return "YES";
    case "Q_PROFILE_FULL_NAME": return caseDef.name;
    case "Q_PROFILE_DOB": return caseDef.dob;
    case "Q_PROFILE_SEX": return caseDef.gender;
    case "Q_PROFILE_MARITAL_STATUS": return caseDef.maritalStatus;
    case "Q_VISIT_PRIMARY_REASON": return caseDef.primary;
    case "Q_VISIT_ADDITIONAL_REQUESTS": return (caseDef.additional ?? []) as JsonValue;
  }

  if (contract.repeatable) return repeatableAnswer(contract, caseDef, answers);

  if (question.responseType === "MULTI_SELECT") return chooseMulti(question);
  if (["SINGLE_SELECT", "BOOLEAN"].includes(question.responseType)) return chooseSingle(question);
  if (question.responseType === "SCALE") return "1";
  if (question.responseType === "DATE") return caseDef.dob;
  if (question.responseType === "MONTH_YEAR") return approxDate(caseDef);
  if (question.responseType === "YEAR") return 2022;
  if (question.responseType === "NUMBER" || question.responseType === "INTEGER") {
    const range = (contract.validation as Array<Record<string, unknown>>).find((rule) => typeof rule.min === "number" || typeof rule.max === "number");
    const min = typeof range?.min === "number" ? range.min : 1;
    const max = typeof range?.max === "number" ? range.max : min + 10;
    const sensible = Math.max(min, Math.min(max, min === 0 ? 1 : min));
    return sensible;
  }
  return textAnswer(question, caseDef);
}

export function buildSyntheticDraft(caseDef: SyntheticCase): P01DraftDocument {
  const acceptedAt = new Date(syntheticInitialVisitAt(caseDef).getTime() - 20 * 60_000).toISOString();
  const draft: P01DraftDocument = {
    locale: caseDef.locale,
    answers: {
      Q_PRIVACY_CONSENT: "YES",
      Q_PROFILE_FULL_NAME: caseDef.name,
      Q_PROFILE_DOB: caseDef.dob,
      Q_PROFILE_SEX: caseDef.gender,
      Q_PROFILE_MARITAL_STATUS: caseDef.maritalStatus,
      Q_VISIT_PRIMARY_REASON: caseDef.primary,
      Q_VISIT_ADDITIONAL_REQUESTS: (caseDef.additional ?? []) as JsonValue,
    },
    privacy: {
      noticeVersion: P01_PRIVACY_NOTICE_VERSION,
      noticeTextAr: P01_PRIVACY_NOTICE_AR,
      noticeTextEn: P01_PRIVACY_NOTICE_EN,
      language: caseDef.locale,
      acceptedAt,
    },
  };

  for (let pass = 0; pass < 30; pass += 1) {
    const evaluation = evaluateP01Draft(draft as unknown as PatientInputJson);
    let changed = false;
    for (const question of evaluation.questions) {
      if (draft.answers[question.code] !== undefined) continue;
      draft.answers[question.code] = answerQuestion(question, caseDef, draft.answers);
      changed = true;
    }
    if (!changed) {
      const finalEvaluation = evaluateP01Draft(draft as unknown as PatientInputJson);
      if (finalEvaluation.state !== "READY") {
        const issues = finalEvaluation.issues.map((issue) => `${issue.questionCode}:${issue.code}`).join(", ");
        throw new Error(`Synthetic case ${caseDef.index} did not reach READY: ${issues}`);
      }
      return draft;
    }
  }
  throw new Error(`Synthetic case ${caseDef.index} exceeded routing passes.`);
}

export function syntheticCoverageSummary() {
  const activeQuestionCodes = new Set<string>();
  const selectedOptionsByQuestion = new Map<string, Set<string>>();
  const pathwayCounts = new Map<PrimaryReason, number>();
  const cases = SYNTHETIC_CASES.map((caseDef) => {
    const draft = buildSyntheticDraft(caseDef);
    const evaluation = evaluateP01Draft(draft as unknown as PatientInputJson);
    pathwayCounts.set(caseDef.primary, (pathwayCounts.get(caseDef.primary) ?? 0) + 1);
    for (const question of evaluation.questions) {
      activeQuestionCodes.add(question.code);
      const value = draft.answers[question.code];
      const selected = selectedOptionsByQuestion.get(question.code) ?? new Set<string>();
      if (typeof value === "string" && question.options.some((option) => option.code === value)) selected.add(value);
      if (Array.isArray(value)) for (const item of value) if (typeof item === "string") selected.add(item);
      selectedOptionsByQuestion.set(question.code, selected);
    }
    return { caseDef, draft, evaluation };
  });
  return { cases, activeQuestionCodes, selectedOptionsByQuestion, pathwayCounts };
}
