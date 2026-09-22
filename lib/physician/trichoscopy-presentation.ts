import { PHYSICIAN_TRICHOSCOPY_FINDINGS } from "./visit-clinical-contracts";

export const TRICHOSCOPY_AR: Record<string, string> = {
  VELLUS_HAIRS: "شعر زغبي", CORKSCREW_HAIRS: "شعر لولبي", ANISOTRICHOSIS: "تفاوت أقطار الشعر",
  EXCLAMATION_TAPERING_HAIRS: "شعر علامة التعجب (المستدق)", SINGLE_HAIR_FOLLICULAR_UNITS: "وحدات جريبية أحادية الشعرة",
  COUDABILITY_HAIRS: "شعر قابل للانثناء", YELLOW_DOTS: "نقاط صفراء", PIGTAIL_CIRCLE_HAIRS: "شعر دائري (ذيل الخنزير)",
  FOLLICULAR_PLUGS: "سدادات جريبية", UPRIGHT_REGROWING_HAIRS: "شعر نامٍ منتصب", PUSTULES: "بثور قيحية",
  PERIFOLLICULAR_SCALE: "قشور حول الجريبات", BLACK_DOTS: "نقاط سوداء", PERIFOLLICULAR_ERYTHEMA: "حمامى حول الجريبات",
  RED_DOTS: "نقاط حمراء", INTERFOLLICULAR_SCALES: "قشور بين الجريبات", FOLLICULAR_DROPOUT: "فقدان الجريبات",
  DYSPIGMENTATION: "اضطراب التصبغ", PERIPILAR_SIGN: "علامة محيط الشعرة", ARBORIZING_DILATED_BLOOD_VESSELS: "أوعية دموية متوسعة متشجرة",
  BROKEN_HAIRS: "شعر متكسر", GLOMERULAR_BLOOD_VESSELS: "أوعية دموية كبيبية", V_SIGN: "علامة V",
  SERPIGINOUS_BLOOD_VESSELS: "أوعية دموية متعرجة", HOOK_HAIRS: "شعر خطافي", PILI_TORTI: "الشعر الملتوي",
  COILED_HAIRS: "شعر ملفوف", WIGGLY_SQUIGGLY_HAIR: "شعر متموج متعرج", FLAME_HAIRS: "شعر اللهب",
  TRICHOPTILOSIS: "تقصف الشعر", TULIP_HAIRS: "شعر التوليب", POLYTRICHIA: "تعدد الشعر في الوحدة الجريبية",
  COMMA_HAIRS: "شعر الفاصلة", MILKY_WHITE_STRUCTURELESS_AREAS: "مناطق بيضاء حليبية عديمة البنية", ZIGZAG_HAIRS: "شعر متعرج",
};

/** Localizes approved labels without translating physician-authored free text. */
export function trichoscopyLabel(label: string, locale: "ar" | "en"): string {
  if (locale === "en") return label;
  const finding = PHYSICIAN_TRICHOSCOPY_FINDINGS.find((item) => item.label === label);
  return finding ? TRICHOSCOPY_AR[finding.code] ?? label : label;
}

