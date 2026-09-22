import type {
  QuestionContract,
  QuestionOptionContract,
  QuestionResponseType,
  ResponseScopeType,
} from "@/lib/content-registry/contracts";

export const P01_CONTENT_VERSION = "PILOT0_QUESTION_REGISTRY_v1.3.2_TRIGGER_OTHER_DETAIL_FIX";
export const P01_BASELINE = "v1.7.2";
export const P01_PATHWAY_CODE = "HAIR_SCALP_PATHWAY";
export const P01_PATHWAY_CODES = {
  hairScalp: "HAIR_SCALP_PATHWAY",
  hairQuality: "HAIR_QUALITY_PATHWAY",
  dermatology: "DERMATOLOGY_PATHWAY",
  laser: "LASER_PATHWAY",
  aesthetic: "AESTHETIC_PROCEDURES_PATHWAY",
} as const;

export type P01SectionCode =
  | "PRIVACY"
  | "PROFILE"
  | "VISIT_REASON"
  | "HEALTH_SNAPSHOT"
  | "HAIR_LOSS"
  | "SCALP"
  | "SHARED_HISTORY"
  | "COURSE_IMPACT"
  | "LIFESTYLE_NUTRITION"
  | "WOMENS_HEALTH"
  | "PREGNANCY_CONTEXT"
  | "MENS_HEALTH"
  | "HAIR_QUALITY"
  | "DERMATOLOGY"
  | "LASER"
  | "AESTHETIC_PROCEDURES";

export interface P01RepeatableField {
  code: string;
  labelAr: string;
  labelEn: string;
  type: "TEXT" | "MONTH_YEAR" | "SINGLE_SELECT";
  required: boolean;
  options?: QuestionOptionContract[];
}

export interface P01QuestionContract extends QuestionContract {
  sectionCode: P01SectionCode;
  scopeKey: string;
  repeatable?: {
    itemLabelAr: string;
    itemLabelEn: string;
    fields: P01RepeatableField[];
  };
}

const YES_NO: QuestionOptionContract[] = [
  { code: "YES", labelAr: "نعم", labelEn: "Yes" },
  { code: "NO", labelAr: "لا", labelEn: "No" },
];

const YES_NO_UNSURE: QuestionOptionContract[] = [
  ...YES_NO,
  { code: "UNSURE", labelAr: "غير متأكد/ة", labelEn: "Not sure" },
];

const SCALE_0_5: QuestionOptionContract[] = [0, 1, 2, 3, 4, 5].map(
  (score) => ({
    code: String(score),
    labelAr: String(score),
    labelEn: String(score),
  }),
);

function contract(input: {
  code: string;
  libraryCode: string;
  sectionCode: P01SectionCode;
  responseType: QuestionResponseType;
  labelAr: string;
  labelEn: string;
  sourceSection: string;
  order: number;
  scope?: ResponseScopeType;
  scopeKey?: string;
  options?: QuestionOptionContract[];
  visibility?: unknown;
  requiredness?: unknown;
  validation?: unknown[];
  output?: unknown[];
  helpAr?: string;
  helpEn?: string;
  repeatable?: P01QuestionContract["repeatable"];
}): P01QuestionContract {
  return {
    code: input.code,
    version: "1.0.0",
    libraryCode: input.libraryCode,
    sectionCode: input.sectionCode,
    responseType: input.responseType,
    localized: {
      ar: { label: input.labelAr, help: input.helpAr },
      en: { label: input.labelEn, help: input.helpEn },
    },
    options: input.options,
    scope: input.scope ?? "VISIT",
    scopeKey: input.scopeKey ?? "VISIT",
    visibility: (() => {
      const base = input.visibility ?? { kind: "ALWAYS" };
      const sectionGate: Partial<Record<P01SectionCode, Record<string, unknown>>> = {
        HAIR_LOSS: { kind: "HAIR_MODULE_ACTIVE" },
        COURSE_IMPACT: { kind: "HAIR_MODULE_ACTIVE" },
        SCALP: { kind: "SCALP_MODULE_ACTIVE" },
        SHARED_HISTORY: { kind: "HAIR_SCALP_PATHWAY_ACTIVE" },
        HAIR_QUALITY: { kind: "HAIR_QUALITY_ACTIVE" },
        LIFESTYLE_NUTRITION: { kind: "HAIR_OR_QUALITY_ACTIVE" },
        WOMENS_HEALTH: { kind: "SEX_AND_HAIR_ACTIVE", sex: "FEMALE" },
        MENS_HEALTH: { kind: "SEX_AND_HAIR_ACTIVE", sex: "MALE" },
        PREGNANCY_CONTEXT: { kind: "FEMALE_PILOT_PATHWAY_ACTIVE" },
        DERMATOLOGY: { kind: "DERMATOLOGY_ACTIVE" },
        LASER: { kind: "LASER_ACTIVE" },
        AESTHETIC_PROCEDURES: { kind: "AESTHETIC_ACTIVE" },
      };
      const gate = sectionGate[input.sectionCode];
      if (!gate) return base;
      return { kind: "ALL_OF", rules: [gate, base] };
    })(),
    requiredness: input.requiredness ?? { kind: "WHEN_VISIBLE" },
    order: input.order,
    validation: input.validation ?? [{ kind: "RESPONSE_TYPE" }],
    output: input.output ?? [{ kind: "OFFICIAL_WHEN_ACTIVE" }],
    provenance: {
      baseline: P01_BASELINE,
      sourceFile:
        "QUESTION_LIBRARY_CLINICAL_ENGINE_v1.12.1_BASELINE_CANDIDATE.md",
      sourceSection: input.sourceSection,
    },
    status: "APPROVED",
    repeatable: input.repeatable,
  };
}

const HEALTH_OPTIONS: QuestionOptionContract[] = [
  { code: "CHRONIC_DISEASE", labelAr: "مرض مزمن", labelEn: "Chronic disease" },
  { code: "TUMOR", labelAr: "ورم سابق أو حالي", labelEn: "Past or current tumor" },
  {
    code: "REGULAR_MEDICATIONS",
    labelAr: "أستخدم أدوية بانتظام حاليًا — غير علاجات الشعر أو فروة الرأس",
    labelEn: "I currently take regular medications — excluding hair or scalp treatments",
  },
  {
    code: "SUPPLEMENTS",
    labelAr: "أستخدم فيتامينات أو مكملات غذائية حاليًا",
    labelEn: "I currently use vitamins or supplements",
  },
  { code: "ALLERGY", labelAr: "لدي حساسية معروفة", labelEn: "I have a known allergy" },
  {
    code: "SURGERY_HOSPITALIZATION",
    labelAr: "سبق أن أجريت عملية جراحية أو تم تنويمي بالمستشفى",
    labelEn: "I previously had surgery or was hospitalized",
  },
  {
    code: "NONE_OF_THE_ABOVE",
    labelAr: "لا يوجد شيء مما سبق",
    labelEn: "None of the above",
    exclusiveWith: [
      "CHRONIC_DISEASE",
      "TUMOR",
      "REGULAR_MEDICATIONS",
      "SUPPLEMENTS",
      "ALLERGY",
      "SURGERY_HOSPITALIZATION",
    ],
  },
];

const SCALP_SYMPTOMS: QuestionOptionContract[] = [
  { code: "ITCH", labelAr: "حكة", labelEn: "Itch" },
  { code: "BURNING", labelAr: "حرقان", labelEn: "Burning" },
  { code: "SCALP_PAIN", labelAr: "ألم", labelEn: "Pain" },
  {
    code: "ROOT_MOVEMENT_PAIN",
    labelAr: "ألم عند تحريك الشعر من الجذور",
    labelEn: "Pain when moving hair at the roots",
  },
  { code: "DANDRUFF", labelAr: "قشرة", labelEn: "Dandruff" },
  { code: "SWEATING", labelAr: "تعرق مفرط", labelEn: "Excessive sweating" },
  { code: "ODOR", labelAr: "رائحة مزعجة", labelEn: "Unpleasant odor" },
  { code: "OTHER", labelAr: "أخرى", labelEn: "Other" },
  {
    code: "NO_SYMPTOMS",
    labelAr: "لا توجد أعراض",
    labelEn: "No symptoms",
    exclusiveWith: [
      "ITCH",
      "BURNING",
      "SCALP_PAIN",
      "ROOT_MOVEMENT_PAIN",
      "DANDRUFF",
      "SWEATING",
      "ODOR",
      "OTHER",
    ],
  },
];

export const P01_QUESTION_CONTRACTS: readonly P01QuestionContract[] = [
  contract({
    code: "Q_PRIVACY_CONSENT",
    libraryCode: "PATIENT_PROFILE",
    sectionCode: "PRIVACY",
    responseType: "BOOLEAN",
    labelAr:
      "أوافق صراحةً على جمع ومعالجة بياناتي الشخصية والصحية للأغراض السريرية الموضحة في إشعار وسياسة الخصوصية.",
    labelEn:
      "I explicitly consent to the collection and processing of my personal and health data for the clinical purposes described in the privacy notice and policy.",
    sourceSection: "Master Context §1.16",
    order: 10,
    options: YES_NO,
    validation: [{ kind: "EQUALS", value: "YES" }],
    output: [{ kind: "PRIVACY_AUDIT" }],
  }),
  contract({
    code: "Q_PROFILE_FULL_NAME",
    libraryCode: "PATIENT_PROFILE",
    sectionCode: "PROFILE",
    responseType: "TEXT",
    labelAr: "الاسم الكامل",
    labelEn: "Full name",
    sourceSection: "§13.1 Patient Profile",
    order: 20,
    validation: [{ kind: "TEXT", minLength: 2, maxLength: 160 }],
  }),
  contract({
    code: "Q_PROFILE_DOB",
    libraryCode: "PATIENT_PROFILE",
    sectionCode: "PROFILE",
    responseType: "DATE",
    labelAr: "تاريخ الميلاد",
    labelEn: "Date of birth",
    sourceSection: "§13.1 Patient Profile",
    order: 30,
    validation: [{ kind: "PAST_OR_TODAY_DATE" }],
  }),
  contract({
    code: "Q_PROFILE_SEX",
    libraryCode: "PATIENT_PROFILE",
    sectionCode: "PROFILE",
    responseType: "SINGLE_SELECT",
    labelAr: "الجنس",
    labelEn: "Sex",
    sourceSection: "§13.1 Patient Profile",
    order: 40,
    options: [
      { code: "MALE", labelAr: "ذكر", labelEn: "Male" },
      { code: "FEMALE", labelAr: "أنثى", labelEn: "Female" },
    ],
  }),
  contract({
    code: "Q_PROFILE_MARITAL_STATUS",
    libraryCode: "PATIENT_PROFILE",
    sectionCode: "PROFILE",
    responseType: "SINGLE_SELECT",
    labelAr: "الحالة الاجتماعية",
    labelEn: "Marital status",
    sourceSection: "§13.1 Patient Profile",
    order: 50,
    options: [
      { code: "MARRIED", labelAr: "متزوج/ة", labelEn: "Married" },
      { code: "NOT_MARRIED", labelAr: "غير متزوج/ة", labelEn: "Not married" },
    ],
  }),
  contract({
    code: "Q_VISIT_PRIMARY_REASON",
    libraryCode: "VISIT_CONTEXT",
    sectionCode: "VISIT_REASON",
    responseType: "SINGLE_SELECT",
    labelAr: "اختر سببًا أساسيًا واحدًا للزيارة",
    labelEn: "Choose exactly one primary reason for the visit",
    sourceSection: "§13.1 Visit Reasons",
    order: 60,
    options: [
      { code: "RV_HAIR_LOSS", labelAr: "تساقط الشعر أو ترققه / نقص كثافته", labelEn: "Hair loss, thinning, or reduced density" },
      { code: "RV_SCALP_SYMPTOMS", labelAr: "أعراض أو مشكلة في فروة الرأس", labelEn: "Scalp symptoms or concern" },
      { code: "RV_HAIR_QUALITY", labelAr: "جودة الشعر", labelEn: "Hair quality" },
      { code: "RV_DERMATOLOGY", labelAr: "الأمراض الجلدية", labelEn: "Dermatology" },
      { code: "RV_LASER", labelAr: "الليزر", labelEn: "Laser" },
      { code: "RV_AESTHETIC_PROCEDURES", labelAr: "الإجراءات التجميلية", labelEn: "Aesthetic procedures" },
    ],
  }),
  contract({
    code: "Q_VISIT_ADDITIONAL_REQUESTS",
    libraryCode: "VISIT_CONTEXT",
    sectionCode: "VISIT_REASON",
    responseType: "MULTI_SELECT",
    labelAr: "هل ترغب أيضًا في مناقشة خدمة إضافية خلال نفس الزيارة؟",
    labelEn: "Would you also like to discuss an additional service during the same visit?",
    sourceSection: "§13.1 Visit Reasons — ADDITIONAL only Laser/Aesthetic",
    order: 61,
    visibility: { kind: "HAS_PRIMARY_REASON" },
    requiredness: { kind: "OPTIONAL" },
    validation: [{ kind: "MULTI_SELECT", minSelections: 0 }],
    options: [
      { code: "RV_LASER", labelAr: "الليزر", labelEn: "Laser" },
      { code: "RV_AESTHETIC_PROCEDURES", labelAr: "الإجراءات التجميلية", labelEn: "Aesthetic procedures" },
    ],
  }),
  contract({
    code: "Q_HEALTH_SNAPSHOT",
    libraryCode: "MEDICAL_HISTORY",
    sectionCode: "HEALTH_SNAPSHOT",
    responseType: "MULTI_SELECT",
    labelAr: "نود معرفة بعض المعلومات عن صحتك العامة. اختر كل ما يتعلق بك:",
    labelEn: "We would like to know some information about your general health. Select all that apply:",
    sourceSection: "§13.2 Health Snapshot",
    order: 70,
    options: HEALTH_OPTIONS,
    validation: [{ kind: "MULTI_SELECT", minSelections: 1, enforceExclusiveWith: true }],
  }),
  ...[
    ["Q_HEALTH_CHRONIC_ITEMS", "CHRONIC_DISEASE", "الأمراض المزمنة", "Chronic diseases", "CONDITION_ITEM"],
    ["Q_HEALTH_TUMOR_ITEMS", "TUMOR", "الأورام السابقة أو الحالية", "Past or current tumors", "CONDITION_ITEM"],
    ["Q_HEALTH_MEDICATION_ITEMS", "REGULAR_MEDICATIONS", "الأدوية المنتظمة", "Regular medications", "MEDICATION_ITEM"],
    ["Q_HEALTH_SUPPLEMENT_ITEMS", "SUPPLEMENTS", "الفيتامينات والمكملات", "Vitamins and supplements", "MEDICATION_ITEM"],
    ["Q_HEALTH_ALLERGY_ITEMS", "ALLERGY", "الحساسية المعروفة", "Known allergies", "CONDITION_ITEM"],
    ["Q_HEALTH_SURGERY_ITEMS", "SURGERY_HOSPITALIZATION", "الجراحات أو التنويم", "Surgeries or hospitalizations", "EVENT_ITEM"],
  ].map(([code, option, ar, en, scope], index) =>
    contract({
      code,
      libraryCode: "MEDICAL_HISTORY",
      sectionCode: "HEALTH_SNAPSHOT",
      responseType: "LONG_TEXT",
      labelAr: ar,
      labelEn: en,
      sourceSection: "§13.2 Health Snapshot selected branches",
      order: 80 + index,
      scope: scope as ResponseScopeType,
      scopeKey: option,
      visibility: { kind: "SELECTED", questionCode: "Q_HEALTH_SNAPSHOT", optionCode: option },
      validation: [{ kind: "REPEATABLE", minItems: 1 }],
      repeatable: {
        itemLabelAr: ar,
        itemLabelEn: en,
        fields: [
          { code: "name", labelAr: "الاسم أو الوصف", labelEn: "Name or description", type: "TEXT", required: true },
          { code: "date", labelAr: "التاريخ التقريبي", labelEn: "Approximate date", type: "MONTH_YEAR", required: false },
          { code: "details", labelAr: "تفاصيل إضافية", labelEn: "Additional details", type: "TEXT", required: false },
        ],
      },
    }),
  ),
  contract({
    code: "Q_HAIR_CONCERN",
    libraryCode: "HAIR_LOSS",
    sectionCode: "HAIR_LOSS",
    responseType: "SINGLE_SELECT",
    labelAr: "ما المشكلة الأساسية التي تلاحظها؟",
    labelEn: "What is the main concern you notice?",
    sourceSection: "§13.3.1 Main Hair Loss concern",
    order: 100,
    scope: "MODULE",
    scopeKey: "HAIR_LOSS",
    visibility: { kind: "HAIR_MODULE_ACTIVE" },
    options: [
      { code: "SHEDDING", labelAr: "تساقط الشعر", labelEn: "Hair shedding" },
      { code: "THINNING", labelAr: "ترقق الشعر / نقص الكثافة", labelEn: "Thinning / reduced density" },
      { code: "BOTH", labelAr: "كلاهما بنفس الدرجة", labelEn: "Both to the same degree" },
    ],
  }),
  ...[
    ["Q_HAIR_SHEDDING_ONSET", "متى لاحظت تساقط الشعر لأول مرة؟", "When did you first notice hair shedding?", "MONTH_YEAR", "SHEDDING"],
    ["Q_HAIR_THINNING_ONSET", "متى لاحظت ترقق الشعر أو انخفاض كثافته لأول مرة؟", "When did you first notice hair thinning or reduced density?", "MONTH_YEAR", "THINNING"],
    ["Q_HAIR_SHEDDING_SEVERITY", "شدة تساقط الشعر الحالية", "Current hair-shedding severity", "SCALE", "SHEDDING"],
    ["Q_HAIR_DENSITY_SEVERITY", "شدة ترقق الشعر أو نقص الكثافة الحالية", "Current thinning or density-loss severity", "SCALE", "THINNING"],
  ].map(([code, ar, en, responseType, branch], index) =>
    contract({
      code,
      libraryCode: "HAIR_LOSS",
      sectionCode: "HAIR_LOSS",
      responseType: responseType as QuestionResponseType,
      labelAr: ar,
      labelEn: en,
      sourceSection: "§13.3 Hair Loss Current Concern",
      order: 110 + index,
      scope: "MODULE",
      scopeKey: "HAIR_LOSS",
      visibility: { kind: "HAIR_CONCERN_INCLUDES", branch },
      options: responseType === "SCALE" ? SCALE_0_5 : undefined,
      validation: responseType === "SCALE" ? [{ kind: "INTEGER_RANGE", min: 0, max: 5 }] : [{ kind: "MONTH_YEAR_OR_UNKNOWN" }],
    }),
  ),
  contract({
    code: "Q_HAIR_EVIDENCE",
    libraryCode: "HAIR_LOSS",
    sectionCode: "HAIR_LOSS",
    responseType: "MULTI_SELECT",
    labelAr: "ما الذي جعلك تلاحظ أن كمية شعرك أو كثافته قد انخفضت؟",
    labelEn: "What made you notice that your hair amount or density had decreased?",
    sourceSection: "§13.3.9 Patient-observed evidence",
    order: 120,
    scope: "MODULE",
    scopeKey: "HAIR_LOSS",
    visibility: { kind: "HAIR_MODULE_ACTIVE" },
    options: [
      ["PONYTAIL_THINNER", "أصبحت ربطة الشعر أرفع", "My ponytail became thinner"],
      ["HAIR_TIE_MORE_WRAPS", "أصبحت تحتاج إلى لف ربطة الشعر مرات أكثر", "I need to wrap my hair tie more times"],
      ["SCALP_MORE_VISIBLE", "أصبحت فروة الرأس أكثر وضوحًا", "My scalp became more visible"],
      ["PART_WIDENED", "اتسع مفرق الشعر", "My hair part widened"],
      ["HAIRLINE_RECEDED", "تراجع خط الشعر", "My hairline receded"],
      ["GAPS", "ظهرت فراغات أو مناطق أقل كثافة", "Gaps or lower-density areas appeared"],
      ["MORE_DURING_WASHING", "ألاحظ كمية أكبر أثناء الغسل أو التمشيط", "I notice more hair during washing or combing"],
      ["OTHERS_NOTICED", "لاحظ أشخاص آخرون تغيرًا في شعري", "Other people noticed a change"],
      ["OLD_PHOTOS", "الصور القديمة تظهر فرقًا واضحًا", "Older photos show a clear difference"],
      ["OTHER", "أخرى", "Other"],
    ].map(([code, labelAr, labelEn]) => ({ code, labelAr, labelEn })),
    validation: [{ kind: "MULTI_SELECT", minSelections: 1 }],
  }),
  contract({
    code: "Q_SECONDARY_SCALP_GATE",
    libraryCode: "HAIR_LOSS",
    sectionCode: "HAIR_LOSS",
    responseType: "BOOLEAN",
    labelAr: "بالإضافة إلى مشكلة الشعر التي ذكرتها، هل لديك حاليًا أعراض أو مشكلة في فروة الرأس ترغب في مناقشتها مع الطبيب؟",
    labelEn: "In addition to the hair concern you described, do you currently have scalp symptoms or a scalp concern you would like to discuss with the physician?",
    sourceSection: "§13.1 Hair Loss ↔ Scalp secondary concern gates",
    order: 130,
    scope: "PATHWAY",
    scopeKey: P01_PATHWAY_CODE,
    visibility: { kind: "PRIMARY_IS", reasonCode: "RV_HAIR_LOSS" },
    options: YES_NO,
  }),
  contract({
    code: "Q_SCALP_SYMPTOMS",
    libraryCode: "SCALP",
    sectionCode: "SCALP",
    responseType: "MULTI_SELECT",
    labelAr: "ما الأعراض التي تلاحظها في فروة الرأس؟ اختر كل ما ينطبق عليك.",
    labelEn: "Which symptoms do you notice on your scalp? Select all that apply.",
    sourceSection: "§15.2 Scalp Symptoms",
    order: 140,
    scope: "MODULE",
    scopeKey: "SCALP",
    visibility: { kind: "SCALP_MODULE_ACTIVE" },
    options: SCALP_SYMPTOMS,
    validation: [{ kind: "MULTI_SELECT", minSelections: 1, enforceExclusiveWith: true }],
  }),
  contract({
    code: "Q_SCALP_SYMPTOM_DETAILS",
    libraryCode: "SCALP",
    sectionCode: "SCALP",
    responseType: "LONG_TEXT",
    labelAr: "تفاصيل العرض",
    labelEn: "Symptom details",
    sourceSection: "§15.3–15.4 Per-Symptom Detail",
    order: 150,
    scope: "SYMPTOM_ITEM",
    scopeKey: "SELECTED_SYMPTOM",
    visibility: { kind: "SCALP_HAS_SELECTED_SYMPTOM" },
    validation: [{ kind: "REPEATABLE_FROM_SELECTION", sourceQuestionCode: "Q_SCALP_SYMPTOMS" }],
    repeatable: {
      itemLabelAr: "عرض",
      itemLabelEn: "Symptom",
      fields: [
        { code: "onset", labelAr: "البداية التقريبية", labelEn: "Approximate onset", type: "MONTH_YEAR", required: true },
        {
          code: "pattern",
          labelAr: "النمط",
          labelEn: "Pattern",
          type: "SINGLE_SELECT",
          required: true,
          options: [
            { code: "CONTINUOUS", labelAr: "مستمر", labelEn: "Continuous" },
            { code: "INTERMITTENT", labelAr: "يأتي ويذهب", labelEn: "Comes and goes" },
            { code: "UNSURE", labelAr: "لا أعلم / غير متأكد", labelEn: "Do not know / not sure" },
          ],
        },
        { code: "severity", labelAr: "الشدة الحالية 0–5", labelEn: "Current severity 0–5", type: "TEXT", required: false },
      ],
    },
  }),
  ...[
    ["Q_SCALP_WORSENING", "هل لاحظت شيئًا يزيد أعراض فروة الرأس أو يجعلها أسوأ؟", "Have you noticed anything that worsens your scalp symptoms?"],
    ["Q_SCALP_RELIEVING", "هل لاحظت شيئًا يخفف أعراض فروة الرأس؟", "Have you noticed anything that relieves your scalp symptoms?"],
  ].map(([code, ar, en], index) =>
    contract({
      code,
      libraryCode: "SCALP",
      sectionCode: "SCALP",
      responseType: "SINGLE_SELECT",
      labelAr: ar,
      labelEn: en,
      sourceSection: "§15.5–15.6 Scalp group factors",
      order: 160 + index,
      scope: "MODULE",
      scopeKey: "SCALP",
      visibility: { kind: "SCALP_MODULE_ACTIVE" },
      options: YES_NO,
    }),
  ),
  contract({
    code: "Q_SECONDARY_HAIR_GATE",
    libraryCode: "SCALP",
    sectionCode: "SCALP",
    responseType: "BOOLEAN",
    labelAr: "بالإضافة إلى مشكلة فروة الرأس، هل تلاحظ أيضًا تساقطًا في الشعر أو ترققًا / نقصًا في كثافته ترغب في مناقشته مع الطبيب؟",
    labelEn: "In addition to the scalp concern, do you also notice hair shedding, thinning, or reduced density that you would like to discuss with the physician?",
    sourceSection: "§13.1 Hair Loss ↔ Scalp secondary concern gates",
    order: 170,
    scope: "PATHWAY",
    scopeKey: P01_PATHWAY_CODE,
    visibility: { kind: "PRIMARY_IS", reasonCode: "RV_SCALP_SYMPTOMS" },
    options: YES_NO,
  }),
  ...[
    ["Q_PRIOR_DIAGNOSIS_GATE", "هل سبق أن شخّصك طبيب بمشكلة في الشعر أو فروة الرأس؟", "Has a physician previously diagnosed you with a hair or scalp condition?"],
    ["Q_SCALP_BIOPSY_GATE", "هل سبق أن أُخذت خزعة من فروة الرأس؟", "Have you previously had a scalp biopsy?"],
    ["Q_HAIR_TREATMENT_GATE", "هل تستخدم حاليًا، أو سبق أن استخدمت، أي علاج أو دواء مخصص للشعر أو فروة الرأس؟", "Are you currently using, or have you previously used, any treatment or medication specifically for your hair or scalp?"],
    ["Q_HAIR_PROCEDURE_GATE", "هل سبق أن أجريت أي جلسة أو إجراء مخصص للشعر أو فروة الرأس؟", "Have you previously had any session or procedure specifically for your hair or scalp?"],
  ].map(([code, ar, en], index) =>
    contract({
      code,
      libraryCode: "HAIR_SCALP_SHARED",
      sectionCode: "SHARED_HISTORY",
      responseType: "BOOLEAN",
      labelAr: ar,
      labelEn: en,
      sourceSection: "§13.4–13.6 Shared Hair/Scalp history",
      order: 180 + index,
      scope: "PATHWAY",
      scopeKey: P01_PATHWAY_CODE,
      visibility: { kind: "HAIR_SCALP_PATHWAY_ACTIVE" },
      options: YES_NO,
    }),
  ),
  contract({
    code: "Q_PRIOR_DIAGNOSES",
    libraryCode: "HAIR_SCALP_SHARED",
    sectionCode: "SHARED_HISTORY",
    responseType: "MULTI_SELECT",
    labelAr: "ما التشخيصات التي سبق أن أخبرك بها طبيب بخصوص الشعر أو فروة الرأس؟",
    labelEn: "Which hair or scalp diagnoses has a physician previously told you about?",
    sourceSection: "§13.4.2 Prior diagnosis list",
    order: 190,
    scope: "PATHWAY",
    scopeKey: P01_PATHWAY_CODE,
    visibility: { kind: "ANSWER_EQUALS", questionCode: "Q_PRIOR_DIAGNOSIS_GATE", value: "YES" },
    options: [
      ["PATTERN_HAIR_LOSS", "تساقط الشعر النمطي (الوراثي)", "Pattern Hair Loss (Androgenetic Alopecia)"],
      ["TRICHOTILLOMANIA", "نتف الشعر", "Trichotillomania"],
      ["TRACTION_ALOPECIA", "ثعلبة الشد / تساقط الشعر بسبب الشد", "Traction alopecia"],
      ["POSTPARTUM_SHEDDING", "تساقط الشعر بعد الولادة أو أثناء الرضاعة", "Postpartum or breastfeeding-related hair shedding"],
      ["TINEA_CAPITIS", "فطريات فروة الرأس", "Tinea capitis / scalp fungal infection"],
      ["LUPUS", "الذئبة", "Lupus"],
      ["ALOPECIA_AREATA", "الثعلبة المناعية", "Alopecia areata"],
      ["TELOGEN_EFFLUVIUM", "التساقط الكربي", "Telogen effluvium"],
      ["SCARRING_ALOPECIA", "تساقط الشعر الندبي", "Scarring alopecia"],
      ["SEBORRHEIC_DERMATITIS", "القشرة أو التهاب الجلد الدهني", "Seborrheic dermatitis / dandruff"],
      ["SCALP_PSORIASIS", "صدفية فروة الرأس", "Scalp psoriasis"],
      ["SCALP_ROSACEA", "وردية فروة الرأس", "Scalp rosacea"],
      ["SCALP_ALLERGY", "حساسية فروة الرأس", "Sensitive scalp"],
      ["HAIR_FRAGILITY", "هشاشة الشعر أو تكسره", "Hair fragility or breakage"],
      ["DO_NOT_REMEMBER", "لا أتذكر التشخيص", "I do not remember the diagnosis"],
      ["OTHER", "أخرى", "Other"],
    ].map(([code, labelAr, labelEn]) => ({ code, labelAr, labelEn })),
    validation: [{ kind: "MULTI_SELECT", minSelections: 1 }],
  }),
  contract({
    code: "Q_TRIGGER_EVENTS",
    libraryCode: "HAIR_LOSS",
    sectionCode: "COURSE_IMPACT",
    responseType: "MULTI_SELECT",
    labelAr: "هل حدث أي مما يلي في الأشهر التي سبقت بداية مشكلة الشعر أو ازديادها؟",
    labelEn: "Did any of the following occur in the months before the hair concern began or worsened?",
    sourceSection: "§14.1 Trigger Events",
    order: 200,
    scope: "MODULE",
    scopeKey: "HAIR_LOSS",
    visibility: { kind: "HAIR_MODULE_ACTIVE" },
    options: [
      ["SEVERE_STRESS", "ضغط نفسي شديد", "Severe psychological stress"],
      ["DEPRESSION", "اكتئاب", "Depression"],
      ["WEIGHT_LOSS", "حمية قاسية أو نزول وزن ملحوظ", "Strict diet or noticeable weight loss"],
      ["SEVERE_ILLNESS", "مرض شديد أو ارتفاع حرارة", "Severe illness or high fever"],
      ["MAJOR_INJURY", "حادث أو إصابة شديدة", "Major accident or severe injury"],
      ["NEW_MEDICATION", "بدء دواء جديد", "Starting a new medication"],
      ["STOPPED_MEDICATION", "إيقاف دواء", "Stopping a medication"],
      ["OTHER", "أخرى", "Other"],
      ["NONE_OF_THE_ABOVE", "لا شيء مما سبق", "None of the above"],
    ].map(([code, labelAr, labelEn]) => ({
      code, labelAr, labelEn,
      exclusiveWith: code === "NONE_OF_THE_ABOVE" ? ["SEVERE_STRESS","DEPRESSION","WEIGHT_LOSS","SEVERE_ILLNESS","MAJOR_INJURY","NEW_MEDICATION","STOPPED_MEDICATION","OTHER"] : undefined,
    })),
    validation: [{ kind: "MULTI_SELECT", minSelections: 1 }],
  }),
  ...[
    ["Q_OVERALL_COURSE", "بشكل عام، كيف ترى حالة شعرك الآن مقارنة ببداية المشكلة؟", "Overall, how do you see your hair condition now compared with when the concern began?", [
      ["IMPROVED", "تحسنت", "Improved"],
      ["UNCHANGED", "لم تتغير بشكل ملحوظ", "No noticeable change"],
      ["WORSENED", "تدهورت", "Worsened"],
    ]],
    ["Q_TREATMENT_PREFERENCE", "ما مستوى العلاج الذي ترغب في مناقشته لتحسين حالة شعرك؟", "What level of treatment would you like to discuss for improving your hair condition?", [
      ["BASIC_ONLY", "العلاجات الأساسية فقط", "Basic treatments only"],
      ["ALL_MEDICAL_OPTIONS", "كل ما يمكن فعله طبيًا لتحسين حالة شعري", "All medically available options to improve my hair condition"],
    ]],
    ["Q_RESULT_SPEED_EXPECTATION", "كيف تصف توقعك للمدة اللازمة لظهور نتيجة العلاج؟", "How would you describe your expectation for the time needed to see a treatment result?", [
      ["UNDERSTANDS_TIME", "أتفهم أن علاج الشعر يحتاج إلى وقت", "I understand that hair treatment takes time"],
      ["WANTS_FAST_RESULT", "أرغب في نتيجة سريعة", "I would like a fast result"],
      ["UNSURE", "غير متأكد/ة", "Not sure"],
    ]],
  ].map(([code, ar, en, rawOptions], index) =>
    contract({
      code: code as string,
      libraryCode: "HAIR_LOSS",
      sectionCode: "COURSE_IMPACT",
      responseType: "SINGLE_SELECT",
      labelAr: ar as string,
      labelEn: en as string,
      sourceSection: "§14 Course / Impact / Expectations",
      order: 210 + index,
      scope: "MODULE",
      scopeKey: "HAIR_LOSS",
      visibility: { kind: "HAIR_MODULE_ACTIVE" },
      options: (rawOptions as string[][]).map(([optionCode, labelAr, labelEn]) => ({ code: optionCode, labelAr, labelEn })),
    }),
  ),
  ...[
    ["Q_PATIENT_BOTHER", "إلى أي درجة تزعجك مشكلة شعرك حاليًا؟", "How much does your hair concern bother you currently?"],
    ["Q_CONFIDENCE_IMPACT", "إلى أي درجة أثرت مشكلة شعرك على ثقتك بمظهرك؟", "How much has your hair concern affected your confidence in your appearance?"],
  ].map(([code, ar, en], index) =>
    contract({
      code,
      libraryCode: "HAIR_LOSS",
      sectionCode: "COURSE_IMPACT",
      responseType: "SCALE",
      labelAr: ar,
      labelEn: en,
      sourceSection: "§14.3–14.4 Patient Impact",
      order: 220 + index,
      scope: "MODULE",
      scopeKey: "HAIR_LOSS",
      visibility: { kind: "HAIR_MODULE_ACTIVE" },
      options: SCALE_0_5,
      validation: [{ kind: "INTEGER_RANGE", min: 0, max: 5 }],
    }),
  ),
  // Owner-reconciled P01 detail branches and deterministic dashboard-ready scopes.
  contract({code:"Q_HAIR_SHED_ROOT_BULB",libraryCode:"HAIR_LOSS",sectionCode:"HAIR_LOSS",responseType:"SINGLE_SELECT",labelAr:"عندما تلاحظ الشعر المتساقط، هل يكون في طرف الشعرة جذر أو انتفاخ صغير؟",labelEn:"When you notice shed hairs, is there a root or small bulb at one end of the hair?",sourceSection:"Owner §4 Hair Loss",order:114,scope:"MODULE",scopeKey:"HAIR_LOSS",visibility:{kind:"HAIR_CONCERN_INCLUDES",branch:"SHEDDING"},options:YES_NO_UNSURE}),
  contract({code:"Q_HAIR_SHORT_REGROWTH_SHEDDING",libraryCode:"HAIR_LOSS",sectionCode:"HAIR_LOSS",responseType:"SINGLE_SELECT",labelAr:"هل تلاحظ أيضًا تساقط شعر قصير جدًا أو شعر صغير حديث النمو؟",labelEn:"Do you also notice shedding of very short hairs or newly growing short hairs?",sourceSection:"Owner §4 Hair Loss",order:115,scope:"MODULE",scopeKey:"HAIR_LOSS",visibility:{kind:"HAIR_CONCERN_INCLUDES",branch:"SHEDDING"},options:YES_NO_UNSURE}),
  contract({code:"Q_HAIR_THINNING_SPEED",libraryCode:"HAIR_LOSS",sectionCode:"HAIR_LOSS",responseType:"SINGLE_SELECT",labelAr:"ما هي سرعة ترقق الشعر وتغير كثافة فروة الرأس؟",labelEn:"How quickly has your hair thinned or your scalp hair density changed?",sourceSection:"Owner §4 Hair Loss",order:116,scope:"MODULE",scopeKey:"HAIR_LOSS",visibility:{kind:"HAIR_CONCERN_INCLUDES",branch:"THINNING"},options:[{code:"LT_3M",labelAr:"أقل من 3 أشهر",labelEn:"Less than 3 months"},{code:"M3_6",labelAr:"3 إلى أقل من 6 أشهر",labelEn:"3 to less than 6 months"},{code:"M6_12",labelAr:"6 إلى أقل من 12 شهرًا",labelEn:"6 to less than 12 months"},{code:"Y1_2",labelAr:"سنة إلى أقل من سنتين",labelEn:"1 to less than 2 years"},{code:"GE_2Y",labelAr:"سنتان أو أكثر",labelEn:"2 years or more"},{code:"UNSURE",labelAr:"لا أتذكر / غير متأكد",labelEn:"I don't remember / I'm not sure"}]}),
  contract({code:"Q_HAIR_THINNING_AREAS",libraryCode:"HAIR_LOSS",sectionCode:"HAIR_LOSS",responseType:"MULTI_SELECT",labelAr:"في أي منطقة أو مناطق تلاحظ ترقق الشعر أو نقص الكثافة؟",labelEn:"In which area or areas do you notice hair thinning or reduced density?",sourceSection:"Owner §4 Hair Loss",order:117,scope:"MODULE",scopeKey:"HAIR_LOSS",visibility:{kind:"HAIR_CONCERN_INCLUDES",branch:"THINNING"},validation:[{kind:"MULTI_SELECT",minSelections:1}],options:[{code:"ENTIRE_SCALP",labelAr:"كامل فروة الرأس",labelEn:"Entire scalp"},{code:"FRONTAL",labelAr:"مقدمة الرأس / خط الشعر الأمامي",labelEn:"Front of the scalp / frontal hairline"},{code:"TEMPLES",labelAr:"الصدغان",labelEn:"Temples"},{code:"MID_SCALP",labelAr:"منتصف فروة الرأس / مفرق الشعر",labelEn:"Mid-scalp / hair part"},{code:"CROWN",labelAr:"التاج",labelEn:"Crown / vertex"},{code:"BACK",labelAr:"مؤخرة الرأس",labelEn:"Back of the scalp"},{code:"PATCHES",labelAr:"مناطق محددة أو بقعية",labelEn:"Specific areas or patches"},{code:"OTHER",labelAr:"أخرى",labelEn:"Other"}]}),
  contract({code:"Q_HAIR_SHEDDING_COURSE",libraryCode:"HAIR_LOSS",sectionCode:"HAIR_LOSS",responseType:"SINGLE_SELECT",labelAr:"كيف كان تساقط الشعر منذ أن بدأ؟",labelEn:"How has your hair shedding behaved since it started?",sourceSection:"Owner §4 Hair Loss",order:118,scope:"MODULE",scopeKey:"HAIR_LOSS",visibility:{kind:"HAIR_CONCERN_INCLUDES",branch:"SHEDDING"},options:[{code:"PERSISTENT_SAME",labelAr:"مستمر تقريبًا بنفس الشدة",labelEn:"Persistent at approximately the same severity"},{code:"PERSISTENT_FLUCTUATING",labelAr:"مستمر لكن شدته تتغير",labelEn:"Persistent, but the severity fluctuates"},{code:"COMES_GOES",labelAr:"يأتي ويذهب",labelEn:"Comes and goes"},{code:"UNSURE",labelAr:"غير متأكد / لا أتذكر",labelEn:"Not sure / I don't remember"}]}),
  contract({code:"Q_HAIR_THINNING_COURSE",libraryCode:"HAIR_LOSS",sectionCode:"HAIR_LOSS",responseType:"SINGLE_SELECT",labelAr:"كيف كان ترقق الشعر أو نقص الكثافة منذ أن بدأ؟",labelEn:"How has your hair thinning or reduced density behaved since it started?",sourceSection:"Owner §4 Hair Loss",order:119,scope:"MODULE",scopeKey:"HAIR_LOSS",visibility:{kind:"HAIR_CONCERN_INCLUDES",branch:"THINNING"},options:[{code:"PERSISTENT_SAME",labelAr:"مستمر تقريبًا بنفس الشدة",labelEn:"Persistent at approximately the same severity"},{code:"PERSISTENT_FLUCTUATING",labelAr:"مستمر لكن شدته تتغير",labelEn:"Persistent, but the severity fluctuates"},{code:"COMES_GOES",labelAr:"يأتي ويذهب",labelEn:"Comes and goes"},{code:"UNSURE",labelAr:"غير متأكد / لا أتذكر",labelEn:"Not sure / I don't remember"}]}),
  contract({code:"Q_HAIR_EVIDENCE_OTHER",libraryCode:"HAIR_LOSS",sectionCode:"HAIR_LOSS",responseType:"TEXT",labelAr:"ما العلامة الأخرى التي لاحظتها؟",labelEn:"What other sign did you notice?",sourceSection:"Owner §4 Hair Loss",order:121,scope:"MODULE",scopeKey:"HAIR_LOSS",visibility:{kind:"SELECTED",questionCode:"Q_HAIR_EVIDENCE",optionCode:"OTHER"},validation:[{kind:"TEXT",minLength:1,maxLength:240}]}),

  contract({code:"Q_SCALP_OTHER_TEXT",libraryCode:"SCALP",sectionCode:"SCALP",responseType:"TEXT",labelAr:"ما العرض الآخر؟",labelEn:"Please specify the other scalp symptom.",sourceSection:"Owner §11 Scalp",order:151,scope:"MODULE",scopeKey:"SCALP",visibility:{kind:"SELECTED",questionCode:"Q_SCALP_SYMPTOMS",optionCode:"OTHER"},validation:[{kind:"TEXT",minLength:1,maxLength:240}]}),
  contract({code:"Q_SCALP_WORSENING_DETAIL",libraryCode:"SCALP",sectionCode:"SCALP",responseType:"TEXT",labelAr:"ما الذي يزيد الأعراض أو يجعلها أسوأ؟",labelEn:"What makes the symptoms worse?",sourceSection:"Owner §11 Scalp",order:162,scope:"MODULE",scopeKey:"SCALP",visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_SCALP_WORSENING",value:"YES"},validation:[{kind:"TEXT",minLength:1,maxLength:500}]}),
  contract({code:"Q_SCALP_RELIEVING_DETAIL",libraryCode:"SCALP",sectionCode:"SCALP",responseType:"TEXT",labelAr:"ما الذي يخفف الأعراض؟",labelEn:"What helps relieve the symptoms?",sourceSection:"Owner §11 Scalp",order:163,scope:"MODULE",scopeKey:"SCALP",visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_SCALP_RELIEVING",value:"YES"},validation:[{kind:"TEXT",minLength:1,maxLength:500}]}),
  contract({code:"Q_SCALP_TIMING_GATE",libraryCode:"SCALP",sectionCode:"SCALP",responseType:"SINGLE_SELECT",labelAr:"هل تلاحظ أن أعراض فروة الرأس تزداد في وقت أو ظرف معين؟",labelEn:"Do you notice that your scalp symptoms become worse at a particular time or under certain circumstances?",sourceSection:"Owner §11 Scalp",order:164,scope:"MODULE",scopeKey:"SCALP",visibility:{kind:"SCALP_MODULE_ACTIVE"},options:YES_NO_UNSURE}),
  contract({code:"Q_SCALP_TIMING_DETAIL",libraryCode:"SCALP",sectionCode:"SCALP",responseType:"TEXT",labelAr:"متى أو في أي ظرف؟",labelEn:"When, or under what circumstances?",sourceSection:"Owner §11 Scalp",order:165,scope:"MODULE",scopeKey:"SCALP",visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_SCALP_TIMING_GATE",value:"YES"},validation:[{kind:"TEXT",minLength:1,maxLength:500}]}),

  contract({code:"Q_PRIOR_DIAGNOSIS_DETAILS",libraryCode:"HAIR_SCALP_SHARED",sectionCode:"SHARED_HISTORY",responseType:"LONG_TEXT",labelAr:"متى تم تشخيص كل حالة؟",labelEn:"When was each condition diagnosed?",sourceSection:"Owner §6 Previous Diagnoses",order:191,scope:"CONDITION_ITEM",scopeKey:"HAIR_SCALP_DIAGNOSIS",visibility:{kind:"HAS_SELECTION",questionCode:"Q_PRIOR_DIAGNOSES"},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"تشخيص",itemLabelEn:"Diagnosis",fields:[{code:"diagnosis",labelAr:"التشخيص",labelEn:"Diagnosis",type:"TEXT",required:true},{code:"date",labelAr:"التاريخ التقريبي",labelEn:"Approximate diagnosis date",type:"MONTH_YEAR",required:true}]}}),
  contract({code:"Q_PRIOR_DIAGNOSIS_OTHER",libraryCode:"HAIR_SCALP_SHARED",sectionCode:"SHARED_HISTORY",responseType:"TEXT",labelAr:"ما التشخيص الآخر؟",labelEn:"What was the other diagnosis?",sourceSection:"Owner §6 Previous Diagnoses",order:199,scope:"PATHWAY",scopeKey:P01_PATHWAY_CODE,visibility:{kind:"SELECTED",questionCode:"Q_PRIOR_DIAGNOSES",optionCode:"OTHER"},validation:[{kind:"TEXT",minLength:1,maxLength:240}]}),
  contract({code:"Q_SCALP_BIOPSY_DATE",libraryCode:"HAIR_SCALP_SHARED",sectionCode:"SHARED_HISTORY",responseType:"MONTH_YEAR",labelAr:"متى أُخذت الخزعة؟",labelEn:"When was the scalp biopsy performed?",sourceSection:"Owner §7 Scalp Biopsy",order:192,scope:"PATHWAY",scopeKey:P01_PATHWAY_CODE,visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_SCALP_BIOPSY_GATE",value:"YES"},validation:[{kind:"MONTH_YEAR_OR_UNKNOWN"}]}),
  contract({code:"Q_SCALP_BIOPSY_AREA",libraryCode:"HAIR_SCALP_SHARED",sectionCode:"SHARED_HISTORY",responseType:"SINGLE_SELECT",labelAr:"من أي منطقة في فروة الرأس أُخذت الخزعة؟",labelEn:"Which area of the scalp was biopsied?",sourceSection:"Owner §7 Scalp Biopsy",order:193,scope:"PATHWAY",scopeKey:P01_PATHWAY_CODE,visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_SCALP_BIOPSY_GATE",value:"YES"},options:[{code:"FRONT",labelAr:"مقدمة الرأس",labelEn:"Front of the scalp"},{code:"TEMPLES",labelAr:"الصدغان / الجوانب",labelEn:"Temples / sides"},{code:"MID",labelAr:"منتصف فروة الرأس",labelEn:"Mid-scalp"},{code:"CROWN",labelAr:"التاج",labelEn:"Crown / vertex"},{code:"BACK",labelAr:"مؤخرة الرأس",labelEn:"Back of the scalp"},{code:"OTHER",labelAr:"أخرى",labelEn:"Other"},{code:"UNKNOWN",labelAr:"لا أتذكر",labelEn:"I don't remember"}]}),
  contract({code:"Q_SCALP_BIOPSY_RESULT_KNOWN",libraryCode:"HAIR_SCALP_SHARED",sectionCode:"SHARED_HISTORY",responseType:"BOOLEAN",labelAr:"هل تعرف أو تتذكر نتيجة الخزعة؟",labelEn:"Do you know or remember the biopsy result?",sourceSection:"Owner §7 Scalp Biopsy",order:194,scope:"PATHWAY",scopeKey:P01_PATHWAY_CODE,visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_SCALP_BIOPSY_GATE",value:"YES"},options:YES_NO}),
  contract({code:"Q_SCALP_BIOPSY_RESULT_TEXT",libraryCode:"HAIR_SCALP_SHARED",sectionCode:"SHARED_HISTORY",responseType:"TEXT",labelAr:"ما النتيجة التي تتذكرها؟",labelEn:"What result do you remember?",sourceSection:"Owner §7 Scalp Biopsy",order:195,scope:"PATHWAY",scopeKey:P01_PATHWAY_CODE,visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_SCALP_BIOPSY_RESULT_KNOWN",value:"YES"},validation:[{kind:"TEXT",minLength:1,maxLength:1000}]}),
  contract({code:"Q_HAIR_TREATMENT_ITEMS",libraryCode:"HAIR_SCALP_SHARED",sectionCode:"SHARED_HISTORY",responseType:"LONG_TEXT",labelAr:"العلاجات أو الأدوية المخصصة للشعر أو فروة الرأس",labelEn:"Hair or scalp treatments or medications",sourceSection:"Owner §8 Hair & Scalp Treatments",order:196,scope:"MEDICATION_ITEM",scopeKey:"HAIR_SCALP_TREATMENT",visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_HAIR_TREATMENT_GATE",value:"YES"},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"علاج / دواء",itemLabelEn:"Treatment / medication",fields:[{code:"name",labelAr:"اسم العلاج أو الدواء",labelEn:"Treatment or medication name",type:"TEXT",required:true},{code:"start",labelAr:"تاريخ البداية التقريبي",labelEn:"Approximate start date",type:"MONTH_YEAR",required:true},{code:"stillUsing",labelAr:"هل ما زلت تستخدمه؟",labelEn:"Are you still using it?",type:"SINGLE_SELECT",required:true,options:YES_NO},{code:"stop",labelAr:"تاريخ التوقف التقريبي إذا توقفت",labelEn:"Approximate stop date if stopped",type:"MONTH_YEAR",required:false}]}}),
  contract({code:"Q_HAIR_PROCEDURES",libraryCode:"HAIR_SCALP_SHARED",sectionCode:"SHARED_HISTORY",responseType:"MULTI_SELECT",labelAr:"ما الإجراءات أو الجلسات التي سبق أن أجريتها للشعر أو فروة الرأس؟",labelEn:"Which hair or scalp procedures or sessions have you previously had?",sourceSection:"Owner §8 Procedure catalogue",order:197,scope:"PATHWAY",scopeKey:P01_PATHWAY_CODE,visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_HAIR_PROCEDURE_GATE",value:"YES"},validation:[{kind:"MULTI_SELECT",minSelections:1}],options:[{code:"PRP",labelAr:"البلازما الغنية بالصفائح الدموية",labelEn:"PRP / Platelet-Rich Plasma"},{code:"MICRONEEDLING",labelAr:"المايكرونيدلينغ",labelEn:"Microneedling"},{code:"HAIR_LASER",labelAr:"ليزر تحفيز الشعر",labelEn:"Hair Stimulation Laser"},{code:"RED_LIGHT",labelAr:"الضوء الأحمر",labelEn:"Red Light Therapy"},{code:"MINOXIDIL_INJ",labelAr:"حقن المينوكسيديل",labelEn:"Minoxidil Injections"},{code:"DUTASTERIDE_INJ",labelAr:"حقن الدوتاستيرايد",labelEn:"Dutasteride Injections"},{code:"EXOSOME",labelAr:"الإكسوزوم",labelEn:"Exosome Therapy"},{code:"CORTISONE_INJ",labelAr:"حقن الكورتيزون",labelEn:"Corticosteroid Injections"},{code:"REGENERA",labelAr:"ريجينيرا",labelEn:"Regenera / Regenera Activa"},{code:"ACELL",labelAr:"إي سيل",labelEn:"ACell"},{code:"HAIR_TRANSPLANT",labelAr:"زراعة الشعر",labelEn:"Hair Transplantation"},{code:"OTHER",labelAr:"إجراء آخر",labelEn:"Other"}]}),
  contract({code:"Q_HAIR_PROCEDURE_DETAILS",libraryCode:"HAIR_SCALP_SHARED",sectionCode:"SHARED_HISTORY",responseType:"LONG_TEXT",labelAr:"تفاصيل الإجراءات السابقة",labelEn:"Previous procedure details",sourceSection:"Owner §8 Procedure details",order:198,scope:"PROCEDURE_SELECTION",scopeKey:"HAIR_SCALP_PROCEDURE",visibility:{kind:"HAS_SELECTION",questionCode:"Q_HAIR_PROCEDURES"},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"إجراء",itemLabelEn:"Procedure",fields:[{code:"procedure",labelAr:"الإجراء",labelEn:"Procedure",type:"TEXT",required:true},{code:"count",labelAr:"عدد الجلسات / العمليات التقريبي",labelEn:"Approximate number of sessions / procedures",type:"TEXT",required:true},{code:"lastDate",labelAr:"تاريخ آخر جلسة / عملية",labelEn:"Date of most recent session / procedure",type:"MONTH_YEAR",required:true}]}}),
  contract({code:"Q_TRIGGER_EVENT_DETAILS",libraryCode:"HAIR_LOSS",sectionCode:"COURSE_IMPACT",responseType:"LONG_TEXT",labelAr:"تاريخ الأحداث المختارة",labelEn:"Dates of selected events",sourceSection:"Owner §9 Trigger Events",order:201,scope:"EVENT_ITEM",scopeKey:"HAIR_TRIGGER",visibility:{kind:"HAS_SELECTION_EXCEPT",questionCode:"Q_TRIGGER_EVENTS",except:["NONE_OF_THE_ABOVE"]},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"حدث",itemLabelEn:"Event",fields:[{code:"event",labelAr:"الحدث",labelEn:"Event",type:"TEXT",required:true},{code:"details",labelAr:"وصف الحدث الآخر",labelEn:"Other event description",type:"TEXT",required:false},{code:"date",labelAr:"التاريخ التقريبي",labelEn:"Approximate date",type:"MONTH_YEAR",required:true}]}}),
  contract({code:"Q_TRIGGER_EVENTS_FEMALE",libraryCode:"HAIR_LOSS",sectionCode:"COURSE_IMPACT",responseType:"MULTI_SELECT",labelAr:"هل حدث أي من الأحداث التالية المرتبطة بصحة المرأة قبل بداية المشكلة أو ازديادها؟",labelEn:"Did any of the following women-specific events occur before the problem began or worsened?",sourceSection:"Owner §9 Trigger Events",order:202,scope:"MODULE",scopeKey:"HAIR_LOSS",visibility:{kind:"SEX_AND_HAIR_ACTIVE",sex:"FEMALE"},validation:[{kind:"MULTI_SELECT",minSelections:1,enforceExclusiveWith:true}],options:[{code:"CHILDBIRTH",labelAr:"ولادة",labelEn:"Childbirth"},{code:"BREASTFEEDING",labelAr:"رضاعة",labelEn:"Breastfeeding"},{code:"CONTRACEPTION_HORMONE_CHANGE",labelAr:"تغيير مانع الحمل أو الهرمونات",labelEn:"Changing contraception or hormones"},{code:"NONE",labelAr:"لا شيء مما سبق",labelEn:"None of the above",exclusiveWith:["CHILDBIRTH","BREASTFEEDING","CONTRACEPTION_HORMONE_CHANGE"]}]}),
  contract({code:"Q_TRIGGER_EVENTS_FEMALE_DETAILS",libraryCode:"HAIR_LOSS",sectionCode:"COURSE_IMPACT",responseType:"LONG_TEXT",labelAr:"تواريخ الأحداث المرتبطة بصحة المرأة",labelEn:"Dates of women-specific trigger events",sourceSection:"Owner §9 Trigger Events",order:203,scope:"EVENT_ITEM",scopeKey:"HAIR_TRIGGER_FEMALE",visibility:{kind:"ALL_OF",rules:[{kind:"SEX_AND_HAIR_ACTIVE",sex:"FEMALE"},{kind:"HAS_SELECTION_EXCEPT",questionCode:"Q_TRIGGER_EVENTS_FEMALE",except:["NONE"]}]},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"حدث",itemLabelEn:"Event",fields:[{code:"event",labelAr:"الحدث",labelEn:"Event",type:"TEXT",required:true},{code:"date",labelAr:"التاريخ التقريبي",labelEn:"Approximate date",type:"MONTH_YEAR",required:true}]}}),
  contract({code:"Q_TRIGGER_EVENTS_MALE",libraryCode:"HAIR_LOSS",sectionCode:"COURSE_IMPACT",responseType:"MULTI_SELECT",labelAr:"هل بدأت أو أوقفت هرمونات أو منشطات لبناء العضلات قبل بداية المشكلة أو ازديادها؟",labelEn:"Did you start or stop hormones or muscle-building steroids before the problem began or worsened?",sourceSection:"Owner §9 Trigger Events",order:204,scope:"MODULE",scopeKey:"HAIR_LOSS",visibility:{kind:"SEX_AND_HAIR_ACTIVE",sex:"MALE"},validation:[{kind:"MULTI_SELECT",minSelections:1,enforceExclusiveWith:true}],options:[{code:"START_STOP_HORMONES_STEROIDS",labelAr:"بدء أو إيقاف هرمونات أو منشطات لبناء العضلات",labelEn:"Starting or stopping hormones or muscle-building steroids"},{code:"NONE",labelAr:"لا شيء مما سبق",labelEn:"None of the above",exclusiveWith:["START_STOP_HORMONES_STEROIDS"]}]}),
  contract({code:"Q_TRIGGER_EVENTS_MALE_DETAILS",libraryCode:"HAIR_LOSS",sectionCode:"COURSE_IMPACT",responseType:"LONG_TEXT",labelAr:"تاريخ الحدث المرتبط بالهرمونات أو المنشطات",labelEn:"Date of the hormone or steroid trigger event",sourceSection:"Owner §9 Trigger Events",order:205,scope:"EVENT_ITEM",scopeKey:"HAIR_TRIGGER_MALE",visibility:{kind:"ALL_OF",rules:[{kind:"SEX_AND_HAIR_ACTIVE",sex:"MALE"},{kind:"HAS_SELECTION_EXCEPT",questionCode:"Q_TRIGGER_EVENTS_MALE",except:["NONE"]}]},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"حدث",itemLabelEn:"Event",fields:[{code:"event",labelAr:"الحدث",labelEn:"Event",type:"TEXT",required:true},{code:"date",labelAr:"التاريخ التقريبي",labelEn:"Approximate date",type:"MONTH_YEAR",required:true}]}}),

  ...[["Q_LIFESTYLE_WEIGHT_GAIN","هل تواجه صعوبة في زيادة الوزن؟","Do you have difficulty gaining weight?"],["Q_LIFESTYLE_NO_VEGETABLES","هل يمر عليك أسبوع كامل من دون تناول خضار؟","Do you sometimes go an entire week without eating vegetables?"],["Q_LIFESTYLE_NO_RED_MEAT","هل يمر عليك أسبوع كامل من دون تناول لحوم حمراء؟","Do you sometimes go an entire week without eating red meat?"],["Q_LIFESTYLE_CHRONIC_DIARRHEA","هل لديك إسهال مزمن؟","Do you have chronic diarrhea?"],["Q_LIFESTYLE_BARIATRIC_SURGERY","هل أجريت عملية لإنقاص الوزن؟","Have you undergone weight-loss surgery?"],["Q_LIFESTYLE_SMOKING_VAPE","هل تدخن أو تستخدم السجائر الإلكترونية / الفيب؟","Do you smoke or use electronic cigarettes / vape products?"]].map(([code,labelAr,labelEn],index)=>contract({code,libraryCode:"LIFESTYLE_NUTRITION",sectionCode:"LIFESTYLE_NUTRITION",responseType:"SINGLE_SELECT",labelAr,labelEn,sourceSection:"Owner §13 Lifestyle/Nutrition",order:300+index,scope:"MODULE",scopeKey:"HAIR_LOSS",visibility:{kind:"HAIR_OR_QUALITY_ACTIVE"},options:["Q_LIFESTYLE_CHRONIC_DIARRHEA","Q_LIFESTYLE_BARIATRIC_SURGERY","Q_LIFESTYLE_SMOKING_VAPE"].includes(code)?YES_NO:YES_NO_UNSURE})),
  contract({code:"Q_LIFESTYLE_BARIATRIC_DETAILS",libraryCode:"LIFESTYLE_NUTRITION",sectionCode:"LIFESTYLE_NUTRITION",responseType:"LONG_TEXT",labelAr:"تفاصيل عملية إنقاص الوزن",labelEn:"Weight-loss surgery details",sourceSection:"Owner §13 Lifestyle/Nutrition",order:306,scope:"EVENT_ITEM",scopeKey:"BARIATRIC_SURGERY",visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_LIFESTYLE_BARIATRIC_SURGERY",value:"YES"},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"العملية",itemLabelEn:"Surgery",fields:[{code:"name",labelAr:"نوع العملية",labelEn:"Type of surgery",type:"TEXT",required:true},{code:"date",labelAr:"التاريخ التقريبي",labelEn:"Approximate date",type:"MONTH_YEAR",required:true}]}}),
  contract({code:"Q_LIFESTYLE_HAIR_CONCEALMENT",libraryCode:"LIFESTYLE_NUTRITION",sectionCode:"LIFESTYLE_NUTRITION",responseType:"MULTI_SELECT",labelAr:"هل تستخدم أيًا مما يلي؟",labelEn:"Do you use any of the following?",sourceSection:"Owner §13 Lifestyle/Nutrition",order:307,scope:"MODULE",scopeKey:"HAIR_LOSS",visibility:{kind:"HAIR_OR_QUALITY_ACTIVE"},validation:[{kind:"MULTI_SELECT",minSelections:1,enforceExclusiveWith:true}],options:[{code:"EXTENSIONS",labelAr:"وصلات شعر",labelEn:"Hair extensions"},{code:"WIG",labelAr:"باروكة / قطعة شعر",labelEn:"Wig / hairpiece"},{code:"FIBERS",labelAr:"ألياف لتكثيف الشعر",labelEn:"Hair-building fibers"},{code:"CONCEALERS",labelAr:"منتجات أو بخاخات لإخفاء مناطق الترقق أو الفراغات",labelEn:"Products or sprays used to conceal thinning areas"},{code:"NONE",labelAr:"لا أستخدم أيًا مما سبق",labelEn:"I don't use any of the above",exclusiveWith:["EXTENSIONS","WIG","FIBERS","CONCEALERS"]}]}),

  // Women's Health — FEMALE + active Hair Loss only. Every follow-up is hard-guarded by section policy.
  contract({code:"Q_WOMENS_HEALTH",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"MULTI_SELECT",labelAr:"هل تعانين من أي من الأعراض التالية؟",labelEn:"Do you experience any of the following?",sourceSection:"Owner §14 Women's Health",order:400,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"ALWAYS"},validation:[{kind:"MULTI_SELECT",minSelections:1,enforceExclusiveWith:true}],options:[{code:"IRREGULAR_CYCLES",labelAr:"عدم انتظام الدورة الشهرية",labelEn:"Irregular menstrual cycles"},{code:"HEAVY_FLOW",labelAr:"غزارة الدورة الشهرية",labelEn:"Heavy menstrual bleeding"},{code:"SCANT_FLOW",labelAr:"شح الدورة الشهرية",labelEn:"Light/scant menstrual bleeding"},{code:"ABSENT_PERIODS",labelAr:"انقطاع الدورة الشهرية",labelEn:"Absent menstrual periods"},{code:"HIRSUTISM",labelAr:"زيادة نمو الشعر في الوجه أو الجسم",labelEn:"Increased facial or body hair"},{code:"ACNE",labelAr:"حب الشباب المتكرر",labelEn:"Recurrent acne"},{code:"OILINESS",labelAr:"زيادة دهنية البشرة أو فروة الرأس",labelEn:"Increased skin or scalp oiliness"},{code:"DIFFICULTY_CONCEIVING",labelAr:"صعوبة حدوث الحمل",labelEn:"Difficulty conceiving"},{code:"NONE",labelAr:"لا شيء مما سبق",labelEn:"None of the above",exclusiveWith:["IRREGULAR_CYCLES","HEAVY_FLOW","SCANT_FLOW","ABSENT_PERIODS","HIRSUTISM","ACNE","OILINESS","DIFFICULTY_CONCEIVING"]}]}),
  contract({code:"Q_WOMEN_IRREGULAR_ONSET",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"MONTH_YEAR",labelAr:"متى بدأ عدم انتظام الدورة؟",labelEn:"When did your menstrual cycles become irregular?",sourceSection:"Owner irregular-cycle branch",order:401,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"IRREGULAR_CYCLES"},validation:[{kind:"MONTH_YEAR_OR_UNKNOWN"}]}),
  contract({code:"Q_WOMEN_IRREGULAR_INTERVAL",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"TEXT",labelAr:"كل كم يوم تأتي الدورة تقريبًا؟",labelEn:"Approximately how many days are there between your periods?",sourceSection:"Owner irregular-cycle branch",order:402,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"IRREGULAR_CYCLES"},validation:[{kind:"TEXT",minLength:1,maxLength:3}]}),
  contract({code:"Q_WOMEN_IRREGULAR_DURATION",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"TEXT",labelAr:"كم يومًا تستمر الدورة عادة؟",labelEn:"How many days does your period usually last?",sourceSection:"Owner irregular-cycle branch",order:403,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"IRREGULAR_CYCLES"},validation:[{kind:"TEXT",minLength:1,maxLength:2}]}),
  contract({code:"Q_WOMEN_PREMENSTRUAL_SYMPTOMS",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"قبل نزول الدم، هل تشعرين عادةً بأعراض الدورة المعتادة؟",labelEn:"Before your period starts, do you usually experience your usual premenstrual symptoms?",sourceSection:"Owner irregular-cycle branch",order:404,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"IRREGULAR_CYCLES"},options:[{code:"USUALLY",labelAr:"نعم غالبًا",labelEn:"Yes, usually"},{code:"SOMETIMES",labelAr:"أحيانًا",labelEn:"Sometimes"},{code:"NO",labelAr:"لا",labelEn:"No"},{code:"UNKNOWN",labelAr:"لا أعرف",labelEn:"I don't know"}]}),
  contract({code:"Q_WOMEN_GYN_EVALUATED",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"BOOLEAN",labelAr:"هل سبق تقييم هذا الأمر في عيادة نساء وولادة؟",labelEn:"Have you previously been evaluated for this issue by an obstetrician-gynecologist?",sourceSection:"Owner irregular-cycle branch",order:405,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"IRREGULAR_CYCLES"},options:YES_NO}),
  contract({code:"Q_WOMEN_HEAVY_SIGNS",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"MULTI_SELECT",labelAr:"كيف تعرفين أن دورتك الشهرية غزيرة؟",labelEn:"How do you know that your menstrual bleeding is heavy?",sourceSection:"Owner heavy-flow branch",order:406,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"HEAVY_FLOW"},validation:[{kind:"MULTI_SELECT",minSelections:1}],options:[{code:"FREQUENT_PAD_CHANGE",labelAr:"أحتاج إلى تغيير الفوطة الصحية بشكل متكرر جدًا",labelEn:"I need to change sanitary pads very frequently"},{code:"LEAKAGE",labelAr:"يحدث تسرب رغم استخدام الفوطة الصحية",labelEn:"I experience leakage despite using sanitary pads"},{code:"LARGE_CLOTS",labelAr:"ألاحظ نزول كتل أو تجلطات دموية كبيرة",labelEn:"I notice large blood clots"},{code:"GT_8_DAYS",labelAr:"يستمر نزول الدم أكثر من 8 أيام",labelEn:"The bleeding lasts more than 8 days"},{code:"ANEMIA_IRON",labelAr:"سبق أن قيل لي إن لدي فقر دم أو نقصًا في الحديد بسبب الدورة",labelEn:"I have previously been told that I have anemia or iron deficiency related to my periods"},{code:"OTHER",labelAr:"وصف آخر",labelEn:"Other"},{code:"UNSURE",labelAr:"غير متأكدة",labelEn:"Not sure"}]}),
  contract({code:"Q_WOMEN_SCANT_SIGNS",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"MULTI_SELECT",labelAr:"كيف تعرفين أن دورتك الشهرية شحيحة؟",labelEn:"How do you know that your menstrual bleeding is light/scant?",sourceSection:"Owner scant-flow branch",order:407,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"SCANT_FLOW"},validation:[{kind:"MULTI_SELECT",minSelections:1}],options:[{code:"MUCH_LESS",labelAr:"كمية الدم أقل بكثير من المعتاد",labelEn:"The amount of bleeding is much less than usual"},{code:"VERY_FEW_PADS",labelAr:"أحتاج إلى عدد قليل جدًا من الفوط الصحية",labelEn:"I need very few sanitary pads"},{code:"LIGHT_SPOTTING",labelAr:"النزف خفيف جدًا أو على شكل تنقيط فقط",labelEn:"The bleeding is very light or only spotting"},{code:"VERY_SHORT",labelAr:"تستمر الدورة لفترة قصيرة جدًا",labelEn:"The bleeding lasts for a very short time"},{code:"OTHER",labelAr:"وصف آخر",labelEn:"Other"},{code:"UNSURE",labelAr:"غير متأكدة",labelEn:"Not sure"}]}),
  contract({code:"Q_WOMEN_HIRSUTISM_AREAS",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"MULTI_SELECT",labelAr:"أين لاحظتِ شعرًا خشنًا أو داكنًا أكثر من المعتاد؟",labelEn:"Where have you noticed coarse or dark hair more than usual?",sourceSection:"Governing Women's Health",order:410,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"HIRSUTISM"},validation:[{kind:"MULTI_SELECT",minSelections:1}],options:[{code:"CHIN_LIP",labelAr:"الذقن أو أعلى الشفة",labelEn:"Chin or upper lip"},{code:"CHEST",labelAr:"الصدر",labelEn:"Chest"},{code:"LOWER_ABDOMEN",labelAr:"أسفل البطن",labelEn:"Lower abdomen"},{code:"BACK",labelAr:"الظهر",labelEn:"Back"},{code:"THIGHS",labelAr:"أعلى أو داخل الفخذين",labelEn:"Upper or inner thighs"},{code:"OTHER",labelAr:"مناطق أخرى",labelEn:"Other areas"},{code:"UNSURE",labelAr:"غير متأكدة",labelEn:"Not sure"}]}),
  contract({code:"Q_WOMEN_HIRSUTISM_ONSET",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"MONTH_YEAR",labelAr:"متى بدأ نمو الشعر الزائد تقريبًا؟",labelEn:"When did the increased hair begin approximately?",sourceSection:"Governing Women's Health 11.4",order:411,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"HIRSUTISM"},validation:[{kind:"MONTH_YEAR_OR_UNKNOWN"}]}),
  contract({code:"Q_WOMEN_ACNE_PATTERN",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"أين يظهر حب الشباب المتكرر أو المستمر؟",labelEn:"Where does recurrent or persistent acne appear?",sourceSection:"Governing Women's Health",order:412,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"ACNE"},options:[{code:"FACE",labelAr:"غالبًا في الوجه",labelEn:"Mostly on the face"},{code:"CHEST_BACK",labelAr:"الصدر أو الظهر",labelEn:"Chest or back"},{code:"MULTIPLE",labelAr:"أكثر من منطقة",labelEn:"More than one area"},{code:"OCCASIONAL",labelAr:"يظهر أحيانًا فقط",labelEn:"Only occasionally"},{code:"UNSURE",labelAr:"غير متأكدة",labelEn:"Not sure"}]}),
  contract({code:"Q_WOMEN_ACNE_ONSET",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"MONTH_YEAR",labelAr:"متى بدأ حب الشباب أو ازداد بشكل ملحوظ؟",labelEn:"When did the acne begin or noticeably worsen?",sourceSection:"Governing Women's Health 11.5",order:413,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"ACNE"},validation:[{kind:"MONTH_YEAR_OR_UNKNOWN"}]}),
  contract({code:"Q_WOMEN_OILINESS_AREA",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"أين توجد زيادة الدهنية؟",labelEn:"Where is the increased oiliness?",sourceSection:"Governing Women's Health",order:414,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"OILINESS"},options:[{code:"FACE",labelAr:"الوجه فقط",labelEn:"Face only"},{code:"SCALP",labelAr:"فروة الرأس فقط",labelEn:"Scalp only"},{code:"BOTH",labelAr:"الوجه وفروة الرأس",labelEn:"Face and scalp"},{code:"CANNOT_TELL",labelAr:"لا أستطيع التحديد",labelEn:"I cannot tell"},{code:"UNSURE",labelAr:"غير متأكدة",labelEn:"Not sure"}]}),
  contract({code:"Q_WOMEN_OILINESS_ONSET",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"MONTH_YEAR",labelAr:"متى لاحظتِ زيادة الدهنية؟",labelEn:"When did you notice the increased oiliness?",sourceSection:"Governing Women's Health 11.6",order:415,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"OILINESS"},validation:[{kind:"MONTH_YEAR_OR_UNKNOWN"}]}),
  contract({code:"Q_WOMEN_FERTILITY_STATUS",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"ما الذي ينطبق عليك بخصوص محاولة الحمل؟",labelEn:"Which of the following applies to your attempts to conceive?",sourceSection:"Governing Women's Health",order:416,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_WOMENS_HEALTH",optionCode:"DIFFICULTY_CONCEIVING"},options:[{code:"NOT_TRIED",labelAr:"لم أحاول الحمل",labelEn:"I have not tried to conceive"},{code:"LT_6M",labelAr:"أحاول منذ أقل من 6 أشهر",labelEn:"Trying for less than 6 months"},{code:"M6_12",labelAr:"أحاول منذ 6 إلى أقل من 12 شهرًا",labelEn:"Trying for 6 to less than 12 months"},{code:"GE_12M",labelAr:"أحاول منذ 12 شهرًا أو أكثر",labelEn:"Trying for 12 months or more"},{code:"PREVIOUS",labelAr:"سبق أن واجهت صعوبة في الحمل",labelEn:"Previously experienced difficulty conceiving"},{code:"UNSURE",labelAr:"غير متأكدة",labelEn:"Not sure"}]}),
  contract({code:"Q_WOMEN_CONTRACEPTION_STATUS",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"هل تستخدمين حاليًا مانع حمل أو منظم هرمونات، أو تم إيقافه أو تغييره مؤخرًا؟",labelEn:"Are you currently using contraception or a hormonal regulator, or was either stopped or changed recently?",sourceSection:"Governing Women's Health 11.8",order:417,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"ALWAYS"},options:[{code:"CURRENT",labelAr:"أستخدمه حاليًا",labelEn:"Currently using"},{code:"STOPPED",labelAr:"تم إيقافه مؤخرًا",labelEn:"Stopped recently"},{code:"CHANGED",labelAr:"تم تغييره مؤخرًا",labelEn:"Changed recently"},{code:"NO",labelAr:"لا",labelEn:"No"},{code:"UNSURE",labelAr:"غير متأكدة",labelEn:"Not sure"}]}),
  contract({code:"Q_WOMEN_CONTRACEPTION_TYPE",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"MULTI_SELECT",labelAr:"ما نوع الوسيلة؟",labelEn:"What type of method?",sourceSection:"Governing Women's Health 11.8",order:418,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"ANSWER_IN",questionCode:"Q_WOMEN_CONTRACEPTION_STATUS",values:["CURRENT","STOPPED","CHANGED"]},validation:[{kind:"MULTI_SELECT",minSelections:1}],options:[{code:"PILLS",labelAr:"حبوب منع الحمل",labelEn:"Contraceptive pills"},{code:"HORMONAL_IUD",labelAr:"لولب هرموني",labelEn:"Hormonal IUD"},{code:"COPPER_IUD",labelAr:"لولب نحاسي",labelEn:"Copper IUD"},{code:"IMPLANT",labelAr:"شريحة",labelEn:"Implant"},{code:"INJECTION",labelAr:"حقنة",labelEn:"Injection"},{code:"PATCH_RING",labelAr:"لاصقة أو حلقة مهبلية",labelEn:"Patch or vaginal ring"},{code:"OTHER",labelAr:"أخرى",labelEn:"Other"}]}),
  contract({code:"Q_WOMEN_CONTRACEPTION_NAME",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"TEXT",labelAr:"اسم الوسيلة أو الدواء إن أمكن",labelEn:"Method or medication name, if known",sourceSection:"Governing Women's Health 11.8",order:419,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"ANSWER_IN",questionCode:"Q_WOMEN_CONTRACEPTION_STATUS",values:["CURRENT","STOPPED","CHANGED"]},requiredness:{kind:"OPTIONAL"},validation:[{kind:"TEXT",minLength:1,maxLength:160}]}),
  // Pregnancy/breastfeeding/planning are intentionally not duplicated here; they belong to the distinct Pregnancy Context module.
  contract({code:"Q_WOMEN_INTIMATE_DESIRE",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"هل لاحظتِ تغيرًا في الرغبة الحميمية؟",labelEn:"Have you noticed a change in sexual desire?",sourceSection:"Governing Women's Health 11.11",order:420,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"ALWAYS"},options:[{code:"DECREASED",labelAr:"نقص",labelEn:"Decreased"},{code:"INCREASED",labelAr:"زيادة",labelEn:"Increased"},{code:"NO_CHANGE",labelAr:"لا يوجد تغير",labelEn:"No change"}]}),
  contract({code:"Q_WOMEN_INTIMATE_DESIRE_ONSET",libraryCode:"WOMENS_HEALTH",sectionCode:"WOMENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"منذ متى لاحظتِ هذا التغير؟",labelEn:"How long have you noticed this change?",sourceSection:"Governing Women's Health 11.11",order:421,scope:"MODULE",scopeKey:"WOMENS_HEALTH",visibility:{kind:"ANSWER_IN",questionCode:"Q_WOMEN_INTIMATE_DESIRE",values:["DECREASED","INCREASED"]},options:[{code:"LT_3M",labelAr:"أقل من 3 أشهر",labelEn:"Less than 3 months"},{code:"M3_6",labelAr:"3 إلى أقل من 6 أشهر",labelEn:"3 to less than 6 months"},{code:"M6_12",labelAr:"6 إلى أقل من 12 شهرًا",labelEn:"6 to less than 12 months"},{code:"GE_1Y",labelAr:"سنة أو أكثر",labelEn:"1 year or more"},{code:"UNKNOWN",labelAr:"لا أتذكر",labelEn:"I do not remember"}]}),

  // Men's Health — owner-approved short P01 version, MALE + active Hair Loss only.
  contract({code:"Q_MENS_HEALTH",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"MULTI_SELECT",labelAr:"هل تعاني من أي من الأعراض التالية؟",labelEn:"Do you experience any of the following?",sourceSection:"Owner §16 Men's Health",order:500,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"ALWAYS"},validation:[{kind:"MULTI_SELECT",minSelections:1,enforceExclusiveWith:true}],options:[{code:"LOW_LIBIDO",labelAr:"انخفاض ملحوظ في الرغبة الجنسية",labelEn:"Noticeable decrease in sexual desire"},{code:"ERECTILE_DIFFICULTY",labelAr:"صعوبة متكررة في الانتصاب",labelEn:"Recurrent difficulty with erection"},{code:"BREAST_CHANGE",labelAr:"تضخم أو ألم في منطقة الثدي",labelEn:"Breast enlargement or pain"},{code:"BODY_HAIR_REDUCTION",labelAr:"انخفاض واضح في شعر اللحية أو الجسم",labelEn:"Clear decrease in beard or body hair"},{code:"MUSCLE_CHANGE",labelAr:"ضعف أو نقص ملحوظ في الكتلة العضلية",labelEn:"Noticeable weakness or loss of muscle mass"},{code:"FERTILITY",labelAr:"صعوبة أو تأخر في الإنجاب",labelEn:"Difficulty or delay in conceiving"},{code:"NONE",labelAr:"لا شيء مما سبق",labelEn:"None of the above",exclusiveWith:["LOW_LIBIDO","ERECTILE_DIFFICULTY","BREAST_CHANGE","BODY_HAIR_REDUCTION","MUSCLE_CHANGE","FERTILITY"]}]}),
  contract({code:"Q_MEN_LIBIDO_ONSET",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"منذ متى لاحظت انخفاض الرغبة الجنسية؟",labelEn:"Since when have you noticed decreased sexual desire?",sourceSection:"Owner Men's Health",order:501,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"LOW_LIBIDO"},options:[{code:"LT_3M",labelAr:"أقل من 3 أشهر",labelEn:"Less than 3 months"},{code:"M3_6",labelAr:"3 إلى أقل من 6 أشهر",labelEn:"3 to less than 6 months"},{code:"M6_12",labelAr:"6 إلى أقل من 12 شهرًا",labelEn:"6 to less than 12 months"},{code:"GE_1Y",labelAr:"سنة أو أكثر",labelEn:"1 year or more"},{code:"UNKNOWN",labelAr:"لا أتذكر",labelEn:"I do not remember"}]}),
  contract({code:"Q_MEN_LIBIDO_MED_RELATION",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"هل بدأ هذا التغير بعد استخدام دواء أو علاج معين؟",labelEn:"Did this change begin after using a particular medication or treatment?",sourceSection:"Owner Men's Health",order:502,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"LOW_LIBIDO"},options:YES_NO_UNSURE}),
  contract({code:"Q_MEN_LIBIDO_MED_NAME",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"TEXT",labelAr:"ما الدواء أو العلاج؟",labelEn:"What medication or treatment?",sourceSection:"Owner Men's Health",order:503,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_MEN_LIBIDO_MED_RELATION",value:"YES"},validation:[{kind:"TEXT",minLength:1,maxLength:160}]}),
  contract({code:"Q_MEN_ERECTION_ONSET",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"منذ متى بدأت صعوبة الانتصاب؟",labelEn:"Since when did the erection difficulty begin?",sourceSection:"Owner Men's Health",order:504,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"ERECTILE_DIFFICULTY"},options:[{code:"LT_3M",labelAr:"أقل من 3 أشهر",labelEn:"Less than 3 months"},{code:"M3_6",labelAr:"3 إلى أقل من 6 أشهر",labelEn:"3 to less than 6 months"},{code:"M6_12",labelAr:"6 إلى أقل من 12 شهرًا",labelEn:"6 to less than 12 months"},{code:"GE_1Y",labelAr:"سنة أو أكثر",labelEn:"1 year or more"},{code:"UNKNOWN",labelAr:"لا أتذكر",labelEn:"I do not remember"}]}),
  contract({code:"Q_MEN_ERECTION_FREQUENCY",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"هل تحدث المشكلة في أغلب المرات؟",labelEn:"Does the problem occur most times?",sourceSection:"Owner Men's Health",order:505,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"ERECTILE_DIFFICULTY"},options:[{code:"MOST",labelAr:"نعم، في أغلب المرات",labelEn:"Yes, most times"},{code:"SOMETIMES",labelAr:"لا، تحدث أحيانًا فقط",labelEn:"No, only sometimes"},{code:"UNSURE",labelAr:"غير متأكد",labelEn:"Not sure"}]}),
  contract({code:"Q_MEN_ERECTION_MED_RELATION",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"هل بدأت المشكلة بعد استخدام دواء أو علاج معين؟",labelEn:"Did the problem begin after using a particular medication or treatment?",sourceSection:"Owner Men's Health",order:506,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"ERECTILE_DIFFICULTY"},options:YES_NO_UNSURE}),
  contract({code:"Q_MEN_ERECTION_MED_NAME",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"TEXT",labelAr:"ما الدواء أو العلاج؟",labelEn:"What medication or treatment?",sourceSection:"Owner Men's Health",order:507,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_MEN_ERECTION_MED_RELATION",value:"YES"},validation:[{kind:"TEXT",minLength:1,maxLength:160}]}),
  contract({code:"Q_MEN_BREAST_CHANGE",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"ما التغير الذي لاحظته في منطقة الثدي؟",labelEn:"What change did you notice in the breast area?",sourceSection:"Owner Men's Health",order:508,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"BREAST_CHANGE"},options:[{code:"ENLARGEMENT",labelAr:"تضخم أو زيادة في الحجم",labelEn:"Enlargement / increased size"},{code:"PAIN",labelAr:"ألم أو حساسية عند اللمس",labelEn:"Pain or tenderness"},{code:"BOTH",labelAr:"تضخم وألم معًا",labelEn:"Enlargement and pain"},{code:"ONE_SIDED",labelAr:"كتلة أو تغير في جهة واحدة",labelEn:"Lump or one-sided change"},{code:"UNSURE",labelAr:"غير متأكد",labelEn:"Not sure"}]}),
  contract({code:"Q_MEN_BREAST_ONSET",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"MONTH_YEAR",labelAr:"متى بدأ هذا التغير تقريبًا؟",labelEn:"When did this change begin approximately?",sourceSection:"Owner Men's Health",order:509,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"BREAST_CHANGE"},validation:[{kind:"MONTH_YEAR_OR_UNKNOWN"}]}),
  contract({code:"Q_MEN_BREAST_MED_RELATION",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"هل بدأ هذا التغير بعد استخدام دواء أو علاج معين؟",labelEn:"Did it begin after a medication or treatment?",sourceSection:"Owner Men's Health",order:510,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"BREAST_CHANGE"},options:YES_NO_UNSURE}),
  contract({code:"Q_MEN_BREAST_MED_NAME",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"TEXT",labelAr:"ما الدواء أو العلاج؟",labelEn:"What medication or treatment?",sourceSection:"Owner Men's Health",order:511,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_MEN_BREAST_MED_RELATION",value:"YES"},validation:[{kind:"TEXT",minLength:1,maxLength:160}]}),
  contract({code:"Q_MEN_BODY_HAIR_AREAS",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"MULTI_SELECT",labelAr:"أين لاحظت انخفاض شعر اللحية أو الجسم؟",labelEn:"Where have you noticed a decrease in beard or body hair?",sourceSection:"Owner Men's Health",order:512,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"BODY_HAIR_REDUCTION"},validation:[{kind:"MULTI_SELECT",minSelections:1}],options:[{code:"BEARD_MOUSTACHE",labelAr:"اللحية أو الشارب",labelEn:"Beard or moustache"},{code:"CHEST",labelAr:"الصدر",labelEn:"Chest"},{code:"LIMBS",labelAr:"الذراعان أو الساقان",labelEn:"Arms or legs"},{code:"ARMPITS",labelAr:"الإبطان",labelEn:"Armpits"},{code:"MULTIPLE",labelAr:"أكثر من منطقة",labelEn:"More than one area"},{code:"OTHER",labelAr:"منطقة أخرى",labelEn:"Another area"},{code:"UNSURE",labelAr:"غير متأكد",labelEn:"Not sure"}]}),
  contract({code:"Q_MEN_BODY_HAIR_ONSET",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"MONTH_YEAR",labelAr:"متى لاحظت هذا التغير تقريبًا؟",labelEn:"When did you notice this change approximately?",sourceSection:"Owner Men's Health",order:513,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"BODY_HAIR_REDUCTION"},validation:[{kind:"MONTH_YEAR_OR_UNKNOWN"}]}),
  contract({code:"Q_MEN_BODY_HAIR_PATTERN",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"هل حدث هذا التغير تدريجيًا أم بشكل مفاجئ؟",labelEn:"Was the change gradual or sudden?",sourceSection:"Owner Men's Health",order:514,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"BODY_HAIR_REDUCTION"},options:[{code:"GRADUAL",labelAr:"تدريجيًا",labelEn:"Gradual"},{code:"SUDDEN",labelAr:"بشكل مفاجئ",labelEn:"Sudden"},{code:"UNSURE",labelAr:"غير متأكد",labelEn:"Not sure"}]}),
  contract({code:"Q_MEN_MUSCLE_CHANGE",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"ما التغير الذي لاحظته في العضلات أو القوة؟",labelEn:"What change have you noticed in muscle size or strength?",sourceSection:"Owner Men's Health",order:515,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"MUSCLE_CHANGE"},options:[{code:"SMALLER",labelAr:"أصبحت العضلات أقل حجمًا من المعتاد",labelEn:"Muscles became smaller than usual"},{code:"WEAKER",labelAr:"أصبحت القوة البدنية أقل من المعتاد",labelEn:"Physical strength decreased"},{code:"BOTH",labelAr:"لاحظت التغيرين معًا",labelEn:"Both changes"},{code:"UNSURE",labelAr:"غير متأكد",labelEn:"Not sure"}]}),
  contract({code:"Q_MEN_MUSCLE_ONSET",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"MONTH_YEAR",labelAr:"متى بدأ هذا التغير تقريبًا؟",labelEn:"When did the change begin approximately?",sourceSection:"Owner Men's Health",order:516,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"MUSCLE_CHANGE"},validation:[{kind:"MONTH_YEAR_OR_UNKNOWN"}]}),
  contract({code:"Q_MEN_MUSCLE_ACTIVITY_RELATION",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"هل حدث هذا التغير مع نقص في الوزن أو تغير واضح في النشاط البدني؟",labelEn:"Did this occur with weight loss or a clear change in physical activity?",sourceSection:"Owner Men's Health",order:517,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"MUSCLE_CHANGE"},options:YES_NO_UNSURE}),
  contract({code:"Q_MEN_FERTILITY_SHORT",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"هل سبق أن واجهت صعوبة في الإنجاب؟",labelEn:"Have you previously experienced difficulty conceiving?",sourceSection:"Owner Men's Health short fertility",order:518,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"SELECTED",questionCode:"Q_MENS_HEALTH",optionCode:"FERTILITY"},options:[{code:"YES",labelAr:"نعم",labelEn:"Yes"},{code:"NO",labelAr:"لا",labelEn:"No"},{code:"NOT_TRIED",labelAr:"لم أحاول الإنجاب",labelEn:"I have not tried to conceive"}]}),
  contract({code:"Q_MEN_HORMONES_STEROIDS",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"هل تستخدم حاليًا، أو سبق أن استخدمت، هرمونات أو منشطات لبناء العضلات؟",labelEn:"Do you currently use, or have you previously used, hormones or muscle-building steroids?",sourceSection:"Owner Men's Health",order:519,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"ALWAYS"},options:[{code:"CURRENT",labelAr:"أستخدمها حاليًا",labelEn:"Currently using"},{code:"PREVIOUS",labelAr:"استخدمتها سابقًا",labelEn:"Used previously"},{code:"NEVER",labelAr:"لم أستخدمها",labelEn:"Never used"}]}),
  contract({code:"Q_MEN_HORMONE_NAME",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"TEXT",labelAr:"اسم الهرمون أو المنشط",labelEn:"Hormone or steroid name",sourceSection:"Owner Men's Health",order:520,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"ANSWER_IN",questionCode:"Q_MEN_HORMONES_STEROIDS",values:["CURRENT","PREVIOUS"]},validation:[{kind:"TEXT",minLength:1,maxLength:160}]}),
  contract({code:"Q_MEN_HORMONE_START",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"MONTH_YEAR",labelAr:"متى بدأت استخدامه؟",labelEn:"When did you start using it?",sourceSection:"Owner Men's Health",order:521,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"ANSWER_IN",questionCode:"Q_MEN_HORMONES_STEROIDS",values:["CURRENT","PREVIOUS"]},validation:[{kind:"MONTH_YEAR_OR_UNKNOWN"}]}),
  contract({code:"Q_MEN_HORMONE_STOP",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"MONTH_YEAR",labelAr:"متى توقفت عن استخدامه؟",labelEn:"When did you stop using it?",sourceSection:"Owner Men's Health",order:522,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_MEN_HORMONES_STEROIDS",value:"PREVIOUS"},validation:[{kind:"MONTH_YEAR_OR_UNKNOWN"}]}),
  contract({code:"Q_MEN_HORMONE_HAIR_CHANGE",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"SINGLE_SELECT",labelAr:"هل لاحظت تغيرًا في الشعر أو فروة الرأس بعد بدء استخدامه؟",labelEn:"Did you notice any change in your hair or scalp after starting it?",sourceSection:"Owner Men's Health",order:523,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"ANSWER_IN",questionCode:"Q_MEN_HORMONES_STEROIDS",values:["CURRENT","PREVIOUS"]},options:YES_NO_UNSURE}),
  contract({code:"Q_MEN_HORMONE_HAIR_CHANGE_TYPES",libraryCode:"MENS_HEALTH",sectionCode:"MENS_HEALTH",responseType:"MULTI_SELECT",labelAr:"ما التغير الذي لاحظته؟",labelEn:"What change did you notice?",sourceSection:"Owner Men's Health",order:524,scope:"MODULE",scopeKey:"MENS_HEALTH",visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_MEN_HORMONE_HAIR_CHANGE",value:"YES"},validation:[{kind:"MULTI_SELECT",minSelections:1}],options:[{code:"SHEDDING",labelAr:"زيادة تساقط الشعر",labelEn:"Increased hair shedding"},{code:"THINNING",labelAr:"زيادة ترقق الشعر أو ظهور الفراغات",labelEn:"Increased hair thinning or visible gaps"},{code:"OILINESS",labelAr:"زيادة دهنية فروة الرأس",labelEn:"Increased scalp oiliness"},{code:"ACNE",labelAr:"ظهور أو زيادة حب الشباب",labelEn:"New or worsening acne"},{code:"OTHER",labelAr:"تغير آخر",labelEn:"Other change"}]}),

  // --------------------------------------------------------------------------
  // Shared Pregnancy Context — published package-local wording, global owner
  // removal of "Prefer not to answer" applied. This is distinct from Women's
  // Health and is available to eligible female patients across Pilot 0.
  // --------------------------------------------------------------------------
  contract({
    code:"Q_PREGNANCY_BREASTFEEDING_STATUS",libraryCode:"PREGNANCY_CONTEXT",sectionCode:"PREGNANCY_CONTEXT",responseType:"SINGLE_SELECT",
    labelAr:"هل أنتِ حامل حاليًا أو ترضعين؟",labelEn:"Are you currently pregnant or breastfeeding?",
    sourceSection:"§17.1 Pregnancy Context + ALL_QUESTIONS §11.9",order:350,scope:"MODULE",scopeKey:"PREGNANCY_CONTEXT",visibility:{kind:"FEMALE_PILOT_PATHWAY_ACTIVE"},
    options:[{code:"PREGNANT",labelAr:"حامل حاليًا",labelEn:"Pregnant"},{code:"BREASTFEEDING",labelAr:"أرضع حاليًا",labelEn:"Breastfeeding"},{code:"BOTH",labelAr:"حامل وأرضع",labelEn:"Pregnant and breastfeeding"},{code:"NO",labelAr:"لا",labelEn:"No"},{code:"UNSURE",labelAr:"غير متأكدة",labelEn:"Not sure"}]
  }),
  contract({
    code:"Q_PREGNANCY_MONTH",libraryCode:"PREGNANCY_CONTEXT",sectionCode:"PREGNANCY_CONTEXT",responseType:"SINGLE_SELECT",
    labelAr:"إذا كنتِ حاملًا: في أي شهر؟",labelEn:"If pregnant: which month?",sourceSection:"ALL_QUESTIONS §11.9",order:351,scope:"MODULE",scopeKey:"PREGNANCY_CONTEXT",
    visibility:{kind:"ANSWER_IN",questionCode:"Q_PREGNANCY_BREASTFEEDING_STATUS",values:["PREGNANT","BOTH"]},
    options:[1,2,3,4,5,6,7,8,9].map((n)=>({code:String(n),labelAr:String(n),labelEn:String(n)}))
  }),
  contract({
    code:"Q_BREASTFEEDING_ONSET",libraryCode:"PREGNANCY_CONTEXT",sectionCode:"PREGNANCY_CONTEXT",responseType:"MONTH_YEAR",
    labelAr:"إذا كنتِ ترضعين: منذ متى بدأتِ الرضاعة؟",labelEn:"If breastfeeding: when did breastfeeding begin?",sourceSection:"ALL_QUESTIONS §11.9",order:352,scope:"MODULE",scopeKey:"PREGNANCY_CONTEXT",
    visibility:{kind:"ANSWER_IN",questionCode:"Q_PREGNANCY_BREASTFEEDING_STATUS",values:["BREASTFEEDING","BOTH"]},validation:[{kind:"MONTH_YEAR_OR_UNKNOWN"}]
  }),
  contract({
    code:"Q_PREGNANCY_PLANNING",libraryCode:"PREGNANCY_CONTEXT",sectionCode:"PREGNANCY_CONTEXT",responseType:"SINGLE_SELECT",
    labelAr:"هل تخططين للحمل خلال الفترة القريبة؟",labelEn:"Are you planning pregnancy in the near future?",sourceSection:"ALL_QUESTIONS §11.10",order:353,scope:"MODULE",scopeKey:"PREGNANCY_CONTEXT",visibility:{kind:"FEMALE_PILOT_PATHWAY_ACTIVE"},
    options:[{code:"WITHIN_6M",labelAr:"نعم، خلال الأشهر الستة القادمة",labelEn:"Yes, within the next 6 months"},{code:"ABOUT_1Y",labelAr:"نعم، خلال سنة تقريبًا",labelEn:"Yes, in about a year"},{code:"MAYBE_NO_SET_TIME",labelAr:"ربما، دون وقت محدد",labelEn:"Maybe, no set time"},{code:"NO_PLAN",labelAr:"لا أخطط حاليًا",labelEn:"No current plan"},{code:"UNSURE",labelAr:"غير متأكدة",labelEn:"Not sure"}]
  }),

  // --------------------------------------------------------------------------
  // Hair Quality — Section 16, owner-approved current wording/visual behavior.
  // --------------------------------------------------------------------------
  contract({
    code:"Q_HQ_HAIR_STATE",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"SINGLE_SELECT",
    labelAr:"كيف تصف حالة شعرك؟",labelEn:"How would you describe your hair?",sourceSection:"Owner override + §16.2 Hair State",order:600,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"HAIR_QUALITY_ACTIVE"},
    helpAr:"الشعر البكر: شعر طبيعي لم يتعرض لأي تغيير كيميائي؛ لم يُصبغ أو يُسحب لونه، ولم يتعرض لفرد أو تجعيد كيميائي، ولم يُعالج ببروتينات أو كيراتين صالونات، ولم يتعرض لحرارة مفرطة مثل الاستشوار أو مكواة الفرد بدون حماية. تركيبته الداخلية (الكيراتين) طبيعية وسليمة، وغالبًا أقوى وأقل عرضة للتقصف والجفاف. الشعر غير البكر: شعر طرأ عليه تغيير في تركيبه الطبيعي، ويشمل أي تدخل يغير بنية الشعرة الأصلية. من أمثلته: الصبغ، سحب اللون، الفرد الكيميائي، التجعيد الكيميائي، بروتين الشعر في الصالونات، أو التعرض لحرارة متكررة أو قوية مثل الاستشوار بدون حماية أو مكواة الفرد (الليس). قد يصبح أضعف وأكثر عرضة للجفاف والتقصف.",
    helpEn:"Virgin hair: Natural hair that has not undergone a chemical change; it has not been dyed or bleached, chemically straightened or curled, treated with salon protein or keratin, or repeatedly exposed to excessive heat without protection. Its internal keratin structure is natural and intact, and it is often stronger and less prone to dryness and split ends. Non-virgin hair: Hair whose natural structure has been altered. This includes dyeing, bleaching, chemical straightening, chemical curling, salon protein treatments, or repeated/strong heat such as blow-drying without protection or a flat iron. It may become weaker and more prone to dryness and split ends.",
    options:[{code:"VIRGIN",labelAr:"شعر بكر",labelEn:"Virgin hair"},{code:"PROCESSED",labelAr:"شعر غير بكر / معالج",labelEn:"Non-virgin / processed hair"}]
  }),
  contract({
    code:"Q_HQ_PREVIOUS_TREATMENTS",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"MULTI_SELECT",
    labelAr:"ما المعالجات التي سبق أن تعرض لها شعرك؟",labelEn:"Which treatments has your hair previously undergone?",sourceSection:"§16.3 Previous Hair Treatments",order:601,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"HAIR_QUALITY_ACTIVE"},validation:[{kind:"MULTI_SELECT",minSelections:1,enforceExclusiveWith:true}],
    options:[{code:"DYE",labelAr:"صبغات",labelEn:"Hair dye"},{code:"BLEACH",labelAr:"سحب اللون / تفتيح الشعر",labelEn:"Bleaching / color removal"},{code:"KERATIN",labelAr:"كيراتين",labelEn:"Keratin treatment"},{code:"PROTEIN",labelAr:"بروتين",labelEn:"Protein treatment"},{code:"CHEMICAL_STRAIGHTENING",labelAr:"فرد كيميائي",labelEn:"Chemical straightening"},{code:"CHEMICAL_CURLING",labelAr:"تجعيد كيميائي (بيرم / بيرما)",labelEn:"Chemical curling / perm"},{code:"OTHER_CHEMICAL",labelAr:"معالجة كيميائية أخرى",labelEn:"Another chemical treatment"},{code:"NONE",labelAr:"لا شيء مما سبق",labelEn:"None of the above",exclusiveWith:["DYE","BLEACH","KERATIN","PROTEIN","CHEMICAL_STRAIGHTENING","CHEMICAL_CURLING","OTHER_CHEMICAL"]}]
  }),
  contract({
    code:"Q_HQ_PREVIOUS_TREATMENT_DETAILS",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"LONG_TEXT",
    labelAr:"تفاصيل المعالجات السابقة",labelEn:"Previous treatment details",sourceSection:"ALL_QUESTIONS §7.3",order:602,scope:"PROCEDURE_SELECTION",scopeKey:"HAIR_QUALITY_TREATMENT",visibility:{kind:"HAS_SELECTION_EXCEPT",questionCode:"Q_HQ_PREVIOUS_TREATMENTS",except:["NONE"]},validation:[{kind:"REPEATABLE",minItems:1}],
    repeatable:{itemLabelAr:"معالجة",itemLabelEn:"Treatment",fields:[]}
  }),
  contract({
    code:"Q_HQ_DRUG_EXPOSURES",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"MULTI_SELECT",
    labelAr:"هل تستخدم حاليًا، أو سبق أن استخدمت، أيًا من الأدوية أو العلاجات التالية؟ اختر كل ما ينطبق عليك.",labelEn:"Do you currently use, or have you previously used, any of the following medications or treatments? Select all that apply.",sourceSection:"§16.4 Drug / Treatment Exposure",order:603,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"HAIR_QUALITY_ACTIVE"},validation:[{kind:"MULTI_SELECT",minSelections:1,enforceExclusiveWith:true}],
    options:[{code:"TAXANES",labelAr:"العلاج الكيماوي — التاكسانات",labelEn:"Chemotherapy — taxanes"},{code:"BUSULFAN",labelAr:"العلاج الكيماوي — بوسلفان",labelEn:"Chemotherapy — busulfan"},{code:"CYCLOPHOSPHAMIDE",labelAr:"العلاج الكيماوي — سيكلوفوسفاميد",labelEn:"Chemotherapy — cyclophosphamide"},{code:"ISOTRETINOIN",labelAr:"الريتينويدات — إيزوتريتينوين (روأكيوتان / روكتان)",labelEn:"Retinoids — isotretinoin"},{code:"ACITRETIN",labelAr:"الريتينويدات — أسيتريتين",labelEn:"Retinoids — acitretin"},{code:"VALPROIC_ACID",labelAr:"أدوية عصبية / مضادة للاختلاجات — حمض الفالبرويك",labelEn:"Neurologic / anticonvulsant medication — valproic acid"},{code:"PREGABALIN",labelAr:"أدوية عصبية / مضادة للاختلاجات — بريجابالين",labelEn:"Neurologic / anticonvulsant medication — pregabalin"},{code:"PHENYTOIN",labelAr:"أدوية عصبية / مضادة للاختلاجات — فينيتوين",labelEn:"Neurologic / anticonvulsant medication — phenytoin"},{code:"ANTIRETROVIRAL",labelAr:"العلاج المضاد للفيروسات القهقرية",labelEn:"Antiretroviral therapy"},{code:"TOCILIZUMAB",labelAr:"علاج مُعدّل للمناعة — توسيليزوماب",labelEn:"Immune-modulating treatment — tocilizumab"},{code:"OTHER",labelAr:"دواء أو علاج آخر",labelEn:"Other medication or treatment"},{code:"NONE",labelAr:"لا شيء مما سبق",labelEn:"None of the above",exclusiveWith:["TAXANES","BUSULFAN","CYCLOPHOSPHAMIDE","ISOTRETINOIN","ACITRETIN","VALPROIC_ACID","PREGABALIN","PHENYTOIN","ANTIRETROVIRAL","TOCILIZUMAB","OTHER"]}]
  }),
  contract({
    code:"Q_HQ_DRUG_EXPOSURE_DETAILS",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"LONG_TEXT",labelAr:"تفاصيل الأدوية أو العلاجات المختارة",labelEn:"Selected medication or treatment details",sourceSection:"§16.4 per-item details",order:604,scope:"MEDICATION_ITEM",scopeKey:"HAIR_QUALITY_EXPOSURE",visibility:{kind:"HAS_SELECTION_EXCEPT",questionCode:"Q_HQ_DRUG_EXPOSURES",except:["NONE"]},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"دواء / علاج",itemLabelEn:"Medication / treatment",fields:[]}
  }),
  contract({
    code:"Q_HQ_NATURAL_PATTERN",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"SINGLE_SELECT",labelAr:"ما النمط الطبيعي لشعرك؟",labelEn:"What is your natural hair pattern?",sourceSection:"§16.5 Natural Hair Pattern",order:605,scope:"VISUAL_CLASSIFICATION",scopeKey:"HAIR_QUALITY_PATTERN",visibility:{kind:"HAIR_QUALITY_ACTIVE"},
    helpAr:"اختر الصورة الأقرب لشكل شعرك بعد غسله وتركه يجف طبيعيًا، دون سشوار أو مكواة أو منتجات تغيّر شكله. إذا تم اختيار فرد كيميائي أو كيراتين أو معالجة تغيّر شكل الشعر: اختر النمط الطبيعي قبل المعالجة.",
    helpEn:"Choose the image closest to your hair after washing and allowing it to air-dry, without a blow-dryer, flat iron, or products that change its shape. If chemical straightening, keratin, or another shape-altering treatment was selected: choose the natural pattern before the treatment.",
    options:[{code:"STRAIGHT",labelAr:"مستقيم",labelEn:"Straight"},{code:"WAVY",labelAr:"متموج",labelEn:"Wavy"},{code:"CURLY",labelAr:"مجعد",labelEn:"Curly"},{code:"COILY",labelAr:"شديد التجعد أو لولبي",labelEn:"Coily / tightly curled"},{code:"MULTIPLE",labelAr:"يوجد أكثر من نمط في مناطق مختلفة",labelEn:"More than one pattern in different areas"},{code:"UNSURE",labelAr:"غير متأكد",labelEn:"Not sure"},{code:"DONT_REMEMBER_BEFORE_TREATMENT",labelAr:"لا أتذكر نمط شعري الطبيعي قبل المعالجة",labelEn:"I do not remember my natural pattern before treatment"}]
  }),
  contract({
    code:"Q_HQ_CURRENT_PROBLEMS",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"MULTI_SELECT",labelAr:"ما المشكلات التي تلاحظها حاليًا في جودة شعرك؟",labelEn:"What problems do you currently notice in your hair quality?",sourceSection:"§16.6 Current Hair Quality Problems",order:606,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"HAIR_QUALITY_ACTIVE"},validation:[{kind:"MULTI_SELECT",minSelections:1,enforceExclusiveWith:true}],
    options:[{code:"DRYNESS",labelAr:"جفاف",labelEn:"Dryness"},{code:"SPLIT_ENDS",labelAr:"تقصف",labelEn:"Split ends"},{code:"BREAKAGE",labelAr:"تكسر",labelEn:"Breakage"},{code:"FRIZZ",labelAr:"هيشان",labelEn:"Frizz"},{code:"TANGLING",labelAr:"تشابك",labelEn:"Tangling"},{code:"LACK_SHINE",labelAr:"قلة لمعان",labelEn:"Lack of shine"},{code:"REDUCED_ELASTICITY",labelAr:"ضعف المرونة",labelEn:"Reduced elasticity"},{code:"ROUGH_TEXTURE",labelAr:"خشونة الشعرة",labelEn:"Rough texture"},{code:"NONE",labelAr:"لا شيء مما سبق",labelEn:"None of the above",exclusiveWith:["DRYNESS","SPLIT_ENDS","BREAKAGE","FRIZZ","TANGLING","LACK_SHINE","REDUCED_ELASTICITY","ROUGH_TEXTURE"]}]
  }),
  contract({
    code:"Q_HQ_HEAT_TOOLS",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"MULTI_SELECT",labelAr:"ما أدوات الحرارة التي تستخدمها على شعرك؟ اختر كل ما ينطبق عليك",labelEn:"Which heat tools do you use on your hair? Select all that apply.",sourceSection:"§16.7 Heat Tools",order:607,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"HAIR_QUALITY_ACTIVE"},validation:[{kind:"MULTI_SELECT",minSelections:1,enforceExclusiveWith:true}],
    options:[{code:"BLOW_DRYER",labelAr:"سشوار / مجفف الشعر",labelEn:"Blow-dryer"},{code:"FLAT_IRON",labelAr:"مكواة فرد الشعر (ليس / سيراميك / تيتانيوم)",labelEn:"Flat iron"},{code:"CURLING_TOOL",labelAr:"جهاز تجعيد الشعر (فير)",labelEn:"Curling tool"},{code:"DIFFUSER",labelAr:"ديفيوزر",labelEn:"Diffuser"},{code:"NONE",labelAr:"لا أستخدم أدوات حرارة",labelEn:"I do not use heat tools",exclusiveWith:["BLOW_DRYER","FLAT_IRON","CURLING_TOOL","DIFFUSER"]}]
  }),
  contract({
    code:"Q_HQ_HEAT_TOOL_DETAILS",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"LONG_TEXT",labelAr:"تكرار استخدام أدوات الحرارة",labelEn:"Heat-tool frequency",sourceSection:"§16.7 Heat Tools frequency",order:608,scope:"PROCEDURE_SELECTION",scopeKey:"HAIR_QUALITY_HEAT_TOOL",visibility:{kind:"HAS_SELECTION_EXCEPT",questionCode:"Q_HQ_HEAT_TOOLS",except:["NONE"]},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"أداة حرارة",itemLabelEn:"Heat tool",fields:[]}
  }),
  contract({
    code:"Q_HQ_HEAT_PROTECTANT",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"SINGLE_SELECT",labelAr:"هل تستخدم واقيًا للحرارة عند استخدام أدوات الحرارة؟",labelEn:"Do you use a heat protectant when using heat tools?",sourceSection:"§16.7 Heat Tools",order:609,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"HAS_SELECTION_EXCEPT",questionCode:"Q_HQ_HEAT_TOOLS",except:["NONE"]},options:[{code:"ALWAYS",labelAr:"دائمًا",labelEn:"Always"},{code:"SOMETIMES",labelAr:"أحيانًا",labelEn:"Sometimes"},{code:"NO",labelAr:"لا",labelEn:"No"}]
  }),
  contract({
    code:"Q_HQ_WASH_FREQUENCY",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"SINGLE_SELECT",labelAr:"كم مرة تغسل شعرك عادة في الأسبوع؟",labelEn:"How many times do you usually wash your hair each week?",sourceSection:"§16.8 Hair Washing",order:610,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"HAIR_QUALITY_ACTIVE"},
    options:[0,1,2,3,4,5,6,7].map((n)=>({code:String(n),labelAr:String(n),labelEn:String(n)})).concat([{code:"GT_7",labelAr:"أكثر من 7",labelEn:"More than 7"}])
  }),
  contract({
    code:"Q_HQ_CLEANSERS",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"MULTI_SELECT",labelAr:"ما أنواع المنظفات أو الشامبو التي تستخدمها حاليًا؟",labelEn:"Which cleansers or shampoo types do you currently use?",sourceSection:"§16.8 Hair Washing and Cleansers",order:611,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"HAIR_QUALITY_ACTIVE"},validation:[{kind:"MULTI_SELECT",minSelections:1}],
    options:[{code:"CO_WASH_LOW_SHAMPOO",labelAr:"كو-واش أو لو-شامبو",labelEn:"Co-wash or low-shampoo"},{code:"SULFATE_SULFONATE",labelAr:"شامبو يحتوي على سلفات أو سلفونات",labelEn:"Shampoo containing sulfates or sulfonates"},{code:"SULFATE_FREE",labelAr:"شامبو خالٍ من السلفات",labelEn:"Sulfate-free shampoo"},{code:"CLARIFYING",labelAr:"شامبو منقٍ",labelEn:"Clarifying shampoo"},{code:"CHELATING",labelAr:"شامبو مخلبي",labelEn:"Chelating shampoo"},{code:"ANTI_DANDRUFF",labelAr:"شامبو مضاد للقشرة",labelEn:"Anti-dandruff shampoo"},{code:"UNKNOWN",labelAr:"لا أعرف نوعه",labelEn:"I do not know the type"},{code:"OTHER",labelAr:"أخرى",labelEn:"Other"}]
  }),
  contract({code:"Q_HQ_CLEANSER_OTHER",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"TEXT",labelAr:"اكتب نوع المنظف أو الشامبو الآخر",labelEn:"Write the other cleanser or shampoo type",sourceSection:"§16.8 Other cleanser",order:612,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"SELECTED",questionCode:"Q_HQ_CLEANSERS",optionCode:"OTHER"},validation:[{kind:"TEXT",minLength:1,maxLength:160}]}),
  contract({
    code:"Q_HQ_ROUTINE_ITEMS",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"MULTI_SELECT",labelAr:"أي عناصر من روتين العناية تستخدمها حاليًا؟",labelEn:"Which parts of a hair-care routine do you currently use?",sourceSection:"§16.9 Hair Care Routine",order:613,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"HAIR_QUALITY_ACTIVE"},validation:[{kind:"MULTI_SELECT",minSelections:1,enforceExclusiveWith:true}],
    options:[{code:"SHAMPOO",labelAr:"شامبو",labelEn:"Shampoo"},{code:"CONDITIONER",labelAr:"بلسم",labelEn:"Conditioner"},{code:"MASK",labelAr:"ماسك",labelEn:"Mask"},{code:"LEAVE_IN",labelAr:"ليف إن",labelEn:"Leave-in"},{code:"OIL",labelAr:"زيت",labelEn:"Oil"},{code:"NONE",labelAr:"لا أستخدم أيًا منها بانتظام",labelEn:"I do not use any of them regularly",exclusiveWith:["SHAMPOO","CONDITIONER","MASK","LEAVE_IN","OIL"]}]
  }),
  contract({code:"Q_HQ_ROUTINE_DETAILS",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"LONG_TEXT",labelAr:"تكرار استخدام عناصر روتين العناية",labelEn:"Hair-care routine item frequency",sourceSection:"ALL_QUESTIONS §7.12",order:614,scope:"PROCEDURE_SELECTION",scopeKey:"HAIR_QUALITY_ROUTINE",visibility:{kind:"HAS_SELECTION_EXCEPT",questionCode:"Q_HQ_ROUTINE_ITEMS",except:["NONE"]},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"عنصر روتين",itemLabelEn:"Routine item",fields:[]}}),
  contract({code:"Q_HQ_ROUTINE_ADHERENCE",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"SINGLE_SELECT",labelAr:"إلى أي مدى تلتزم عادة بالروتين الذي تتبعه؟",labelEn:"How consistently do you usually follow your routine?",sourceSection:"ALL_QUESTIONS §7.13",order:615,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"HAS_SELECTION_EXCEPT",questionCode:"Q_HQ_ROUTINE_ITEMS",except:["NONE"]},options:[{code:"USUALLY",labelAr:"ملتزم/ة غالبًا",labelEn:"Usually consistent"},{code:"SOMETIMES",labelAr:"ألتزم أحيانًا",labelEn:"Sometimes consistent"},{code:"RARELY",labelAr:"نادرًا ما ألتزم",labelEn:"Rarely consistent"}]}),
  contract({code:"Q_HQ_ROUTINE_CHANGED",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"SINGLE_SELECT",labelAr:"هل تغيّر روتين العناية بشعرك مؤخرًا؟",labelEn:"Has your hair-care routine changed recently?",sourceSection:"§16.9 Hair Care Routine",order:616,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"HAIR_QUALITY_ACTIVE"},options:[{code:"YES",labelAr:"نعم",labelEn:"Yes"},{code:"NO",labelAr:"لا",labelEn:"No"},{code:"DONT_REMEMBER",labelAr:"لا أتذكر",labelEn:"I do not remember"}]}),
  contract({code:"Q_HQ_ROUTINE_CHANGE_TEXT",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"TEXT",labelAr:"ما الذي تغيّر؟",labelEn:"What changed?",sourceSection:"ALL_QUESTIONS §7.15",order:617,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_HQ_ROUTINE_CHANGED",value:"YES"},validation:[{kind:"TEXT",minLength:1,maxLength:500}]}),
  contract({code:"Q_HQ_ROUTINE_CHANGE_DATE",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"MONTH_YEAR",labelAr:"متى بدأ التغير؟",labelEn:"When did the change begin?",sourceSection:"ALL_QUESTIONS §7.15",order:618,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"ANSWER_EQUALS",questionCode:"Q_HQ_ROUTINE_CHANGED",value:"YES"},validation:[{kind:"MONTH_YEAR_OR_UNKNOWN"}]}),
  contract({code:"Q_HQ_POST_WASH_ORDER",libraryCode:"HAIR_QUALITY",sectionCode:"HAIR_QUALITY",responseType:"LONG_TEXT",labelAr:"رتّب خطوات العناية بشعرك بعد الغسل",labelEn:"Arrange your after-wash hair-care steps",sourceSection:"§16.10 Post-Wash Order",order:619,scope:"MODULE",scopeKey:"HAIR_QUALITY",visibility:{kind:"HQ_POST_WASH_APPLICABLE"},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"خطوة",itemLabelEn:"Step",fields:[]}}),

  // --------------------------------------------------------------------------
  // Dermatology — intentionally one free-text concern only.
  // --------------------------------------------------------------------------
  contract({code:"Q_DERMATOLOGY_CONCERN",libraryCode:"DERMATOLOGY",sectionCode:"DERMATOLOGY",responseType:"LONG_TEXT",labelAr:"ما المشكلة الجلدية التي ترغب بمراجعتها؟",labelEn:"What dermatology concern would you like the doctor to review?",sourceSection:"§19 Dermatology",order:700,scope:"MODULE",scopeKey:"DERMATOLOGY",visibility:{kind:"DERMATOLOGY_ACTIVE"},validation:[{kind:"TEXT",minLength:1,maxLength:2000}]}),

  // --------------------------------------------------------------------------
  // Laser — concern-centric full/mini pathway.
  // --------------------------------------------------------------------------
  contract({
    code:"Q_LASER_CONCERNS",libraryCode:"LASER",sectionCode:"LASER",responseType:"MULTI_SELECT",labelAr:"ما المشكلة أو الطلب الذي ترغب بمراجعته ضمن خدمات الليزر؟",labelEn:"Which laser concern or request would you like the doctor to review?",sourceSection:"§20.1 Laser Clinical Content",order:800,scope:"MODULE",scopeKey:"LASER",visibility:{kind:"LASER_ACTIVE"},validation:[{kind:"MULTI_SELECT",minSelections:1}],
    options:[{code:"LASER_UNWANTED_HAIR",labelAr:"إزالة الشعر غير المرغوب فيه",labelEn:"Unwanted hair removal"},{code:"LASER_PIGMENTATION",labelAr:"التصبغات والبقع الداكنة، بما فيها النمش",labelEn:"Pigmentation and dark spots, including freckles"},{code:"LASER_MELASMA",labelAr:"الكلف",labelEn:"Melasma"},{code:"LASER_REDNESS_VESSELS",labelAr:"الاحمرار والوردية والأوعية الدموية السطحية",labelEn:"Redness, rosacea, and superficial blood vessels"},{code:"LASER_ACNE_SCARS",labelAr:"ندبات حب الشباب",labelEn:"Acne scars"},{code:"LASER_OTHER_SCARS",labelAr:"الندبات الأخرى",labelEn:"Other scars"},{code:"LASER_RESURFACING",labelAr:"إعادة تسطيح الجلد لتحسين الملمس أو الخطوط الدقيقة",labelEn:"Skin resurfacing for texture or fine lines"},{code:"LASER_TATTOO_PMU",labelAr:"إزالة الوشم أو المكياج الدائم",labelEn:"Tattoo or permanent-makeup removal"},{code:"LASER_OTHER",labelAr:"مشكلة أخرى قد تحتاج علاجًا بالليزر",labelEn:"Another concern that may need laser treatment"},{code:"LASER_UNSURE",labelAr:"غير متأكد وأرغب بمناقشة الخيارات مع الطبيب",labelEn:"Not sure; I would like to discuss options with the doctor"}]
  }),
  contract({code:"Q_LASER_CONCERN_DETAILS",libraryCode:"LASER",sectionCode:"LASER",responseType:"LONG_TEXT",labelAr:"تفاصيل مشاكل الليزر المختارة",labelEn:"Selected laser concern details",sourceSection:"§20.2–20.8 Concern-Centric Data Model",order:801,scope:"LASER_SERVICE_SELECTION",scopeKey:"LASER_CONCERN",visibility:{kind:"HAS_SELECTION",questionCode:"Q_LASER_CONCERNS"},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"مشكلة ليزر",itemLabelEn:"Laser concern",fields:[]}}),

  // --------------------------------------------------------------------------
  // Aesthetic Procedures — procedure-centric full/mini pathway.
  // --------------------------------------------------------------------------
  contract({
    code:"Q_AESTHETIC_PROCEDURES",libraryCode:"AESTHETIC_PROCEDURES",sectionCode:"AESTHETIC_PROCEDURES",responseType:"MULTI_SELECT",labelAr:"ما الإجراء أو الإجراءات التجميلية التي ترغب بمراجعتها؟",labelEn:"Which aesthetic procedure or procedures would you like to review?",sourceSection:"§21.1 Aesthetic Procedures Clinical Content",order:900,scope:"MODULE",scopeKey:"AESTHETIC_PROCEDURES",visibility:{kind:"AESTHETIC_ACTIVE"},validation:[{kind:"MULTI_SELECT",minSelections:1}],
    options:[{code:"AP_BOTOX",labelAr:"بوتوكس",labelEn:"Botox"},{code:"AP_FILLER",labelAr:"فيلر",labelEn:"Filler"},{code:"AP_SKIN_BOOSTER",labelAr:"سكين بوستر",labelEn:"Skin booster"},{code:"AP_COLLAGEN_STIMULATORS",labelAr:"محفزات الكولاجين",labelEn:"Collagen stimulators"},{code:"AP_FAT_DISSOLVING",labelAr:"حقن إذابة الدهون",labelEn:"Fat-dissolving injections"},{code:"AP_SWEATING_INJECTION",labelAr:"علاج التعرق بالحقن",labelEn:"Injected treatment for sweating"},{code:"AP_BODY_CONTOURING",labelAr:"إجراءات نحت أو تحسين القوام",labelEn:"Body contouring or body-improvement procedures"},{code:"AP_OTHER",labelAr:"إجراء تجميلي آخر",labelEn:"Other aesthetic procedure"}]
  }),
  contract({code:"Q_AESTHETIC_DETAILS",libraryCode:"AESTHETIC_PROCEDURES",sectionCode:"AESTHETIC_PROCEDURES",responseType:"LONG_TEXT",labelAr:"تفاصيل الإجراءات التجميلية المختارة",labelEn:"Selected aesthetic procedure details",sourceSection:"§21.2–21.10 Procedure-Centric Data Model",order:901,scope:"PROCEDURE_SELECTION",scopeKey:"AESTHETIC_PROCEDURE",visibility:{kind:"HAS_SELECTION",questionCode:"Q_AESTHETIC_PROCEDURES"},validation:[{kind:"REPEATABLE",minItems:1}],repeatable:{itemLabelAr:"إجراء تجميلي",itemLabelEn:"Aesthetic procedure",fields:[]}}),

] as const;

export const P01_SECTION_ORDER: readonly P01SectionCode[] = [
  "PRIVACY",
  "PROFILE",
  "VISIT_REASON",
  "HEALTH_SNAPSHOT",
  "PREGNANCY_CONTEXT",
  "HAIR_LOSS",
  "SCALP",
  "SHARED_HISTORY",
  "COURSE_IMPACT",
  "HAIR_QUALITY",
  "LIFESTYLE_NUTRITION",
  "WOMENS_HEALTH",
  "MENS_HEALTH",
  "DERMATOLOGY",
  "LASER",
  "AESTHETIC_PROCEDURES",
];

export function getP01Contract(code: string): P01QuestionContract | undefined {
  return P01_QUESTION_CONTRACTS.find((question) => question.code === code);
}

export function getP01QuestionCodes(): string[] {
  return P01_QUESTION_CONTRACTS.map(({ code }) => code);
}

export { YES_NO, YES_NO_UNSURE };
