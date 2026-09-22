import { followUpChangeHasAction, followUpChangeIsNoChange, type FollowUpChangeState, type FollowUpClientEpisodeState } from "@/lib/follow-up/types";

export type FollowUpLifecycle =
  | "ASK_ONCE"
  | "HISTORICAL_RECORD"
  | "CURRENT_TREATMENT_STATE"
  | "VISIT_MEASUREMENT"
  | "SINCE_LAST_VISIT_EVENT"
  | "CURRENT_SAFETY_STATE";

export type FollowUpDomain =
  | "GENERAL_HEALTH"
  | "MEDICATIONS_SUPPLEMENTS"
  | "HAIR_TREATMENTS"
  | "HAIR_PROCEDURES"
  | "TRIGGER_EVENTS"
  | "SEX_SPECIFIC"
  | "HAIR_QUALITY_LIFESTYLE"
  | "CURRENT_CONCERN"
  | "LASER_AESTHETIC";

export const FOLLOW_UP_LIFECYCLE_BY_QUESTION = {
  Q_PRIVACY_CONSENT: "CURRENT_SAFETY_STATE",
  Q_PROFILE_FULL_NAME: "ASK_ONCE",
  Q_PROFILE_DOB: "ASK_ONCE",
  Q_PROFILE_SEX: "ASK_ONCE",
  Q_PROFILE_MARITAL_STATUS: "HISTORICAL_RECORD",
  Q_VISIT_PRIMARY_REASON: "HISTORICAL_RECORD",
  Q_VISIT_ADDITIONAL_REQUESTS: "HISTORICAL_RECORD",
  Q_HEALTH_SNAPSHOT: "SINCE_LAST_VISIT_EVENT",
  Q_HEALTH_CHRONIC_ITEMS: "SINCE_LAST_VISIT_EVENT",
  Q_HEALTH_TUMOR_ITEMS: "SINCE_LAST_VISIT_EVENT",
  Q_HEALTH_MEDICATION_ITEMS: "CURRENT_TREATMENT_STATE",
  Q_HEALTH_SUPPLEMENT_ITEMS: "CURRENT_TREATMENT_STATE",
  Q_HEALTH_ALLERGY_ITEMS: "SINCE_LAST_VISIT_EVENT",
  Q_HEALTH_SURGERY_ITEMS: "SINCE_LAST_VISIT_EVENT",
  Q_HAIR_CONCERN: "HISTORICAL_RECORD",
  Q_HAIR_SHEDDING_ONSET: "HISTORICAL_RECORD",
  Q_HAIR_THINNING_ONSET: "HISTORICAL_RECORD",
  Q_HAIR_SHEDDING_SEVERITY: "VISIT_MEASUREMENT",
  Q_HAIR_DENSITY_SEVERITY: "VISIT_MEASUREMENT",
  Q_HAIR_EVIDENCE: "SINCE_LAST_VISIT_EVENT",
  Q_HAIR_SHED_ROOT_BULB: "SINCE_LAST_VISIT_EVENT",
  Q_HAIR_SHORT_REGROWTH_SHEDDING: "SINCE_LAST_VISIT_EVENT",
  Q_HAIR_THINNING_SPEED: "HISTORICAL_RECORD",
  Q_HAIR_THINNING_AREAS: "SINCE_LAST_VISIT_EVENT",
  Q_HAIR_SHEDDING_COURSE: "VISIT_MEASUREMENT",
  Q_HAIR_THINNING_COURSE: "VISIT_MEASUREMENT",
  Q_HAIR_EVIDENCE_OTHER: "SINCE_LAST_VISIT_EVENT",
  Q_SECONDARY_SCALP_GATE: "VISIT_MEASUREMENT",
  Q_SCALP_SYMPTOMS: "VISIT_MEASUREMENT",
  Q_SCALP_SYMPTOM_DETAILS: "VISIT_MEASUREMENT",
  Q_SCALP_WORSENING: "SINCE_LAST_VISIT_EVENT",
  Q_SCALP_RELIEVING: "SINCE_LAST_VISIT_EVENT",
  Q_SECONDARY_HAIR_GATE: "VISIT_MEASUREMENT",
  Q_SCALP_OTHER_TEXT: "SINCE_LAST_VISIT_EVENT",
  Q_SCALP_WORSENING_DETAIL: "SINCE_LAST_VISIT_EVENT",
  Q_SCALP_RELIEVING_DETAIL: "SINCE_LAST_VISIT_EVENT",
  Q_SCALP_TIMING_GATE: "SINCE_LAST_VISIT_EVENT",
  Q_SCALP_TIMING_DETAIL: "SINCE_LAST_VISIT_EVENT",
  Q_PRIOR_DIAGNOSIS_GATE: "HISTORICAL_RECORD",
  Q_SCALP_BIOPSY_GATE: "HISTORICAL_RECORD",
  Q_HAIR_TREATMENT_GATE: "CURRENT_TREATMENT_STATE",
  Q_HAIR_PROCEDURE_GATE: "HISTORICAL_RECORD",
  Q_PRIOR_DIAGNOSES: "HISTORICAL_RECORD",
  Q_PRIOR_DIAGNOSIS_DETAILS: "HISTORICAL_RECORD",
  Q_PRIOR_DIAGNOSIS_OTHER: "HISTORICAL_RECORD",
  Q_SCALP_BIOPSY_DATE: "HISTORICAL_RECORD",
  Q_SCALP_BIOPSY_AREA: "HISTORICAL_RECORD",
  Q_SCALP_BIOPSY_RESULT_KNOWN: "HISTORICAL_RECORD",
  Q_SCALP_BIOPSY_RESULT_TEXT: "HISTORICAL_RECORD",
  Q_HAIR_TREATMENT_ITEMS: "CURRENT_TREATMENT_STATE",
  Q_HAIR_PROCEDURES: "SINCE_LAST_VISIT_EVENT",
  Q_HAIR_PROCEDURE_DETAILS: "SINCE_LAST_VISIT_EVENT",
  Q_TRIGGER_EVENTS: "SINCE_LAST_VISIT_EVENT",
  Q_OVERALL_COURSE: "VISIT_MEASUREMENT",
  Q_TREATMENT_PREFERENCE: "HISTORICAL_RECORD",
  Q_RESULT_SPEED_EXPECTATION: "HISTORICAL_RECORD",
  Q_PATIENT_BOTHER: "VISIT_MEASUREMENT",
  Q_CONFIDENCE_IMPACT: "VISIT_MEASUREMENT",
  Q_TRIGGER_EVENT_DETAILS: "SINCE_LAST_VISIT_EVENT",
  Q_TRIGGER_EVENTS_FEMALE: "SINCE_LAST_VISIT_EVENT",
  Q_TRIGGER_EVENTS_FEMALE_DETAILS: "SINCE_LAST_VISIT_EVENT",
  Q_TRIGGER_EVENTS_MALE: "SINCE_LAST_VISIT_EVENT",
  Q_TRIGGER_EVENTS_MALE_DETAILS: "SINCE_LAST_VISIT_EVENT",
  Q_LIFESTYLE_WEIGHT_GAIN: "SINCE_LAST_VISIT_EVENT",
  Q_LIFESTYLE_NO_VEGETABLES: "SINCE_LAST_VISIT_EVENT",
  Q_LIFESTYLE_NO_RED_MEAT: "SINCE_LAST_VISIT_EVENT",
  Q_LIFESTYLE_CHRONIC_DIARRHEA: "SINCE_LAST_VISIT_EVENT",
  Q_LIFESTYLE_BARIATRIC_SURGERY: "HISTORICAL_RECORD",
  Q_LIFESTYLE_SMOKING_VAPE: "SINCE_LAST_VISIT_EVENT",
  Q_LIFESTYLE_BARIATRIC_DETAILS: "HISTORICAL_RECORD",
  Q_LIFESTYLE_HAIR_CONCEALMENT: "SINCE_LAST_VISIT_EVENT",
  Q_WOMENS_HEALTH: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_IRREGULAR_ONSET: "HISTORICAL_RECORD",
  Q_WOMEN_IRREGULAR_INTERVAL: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_IRREGULAR_DURATION: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_PREMENSTRUAL_SYMPTOMS: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_GYN_EVALUATED: "HISTORICAL_RECORD",
  Q_WOMEN_HEAVY_SIGNS: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_SCANT_SIGNS: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_HIRSUTISM_AREAS: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_HIRSUTISM_ONSET: "HISTORICAL_RECORD",
  Q_WOMEN_ACNE_PATTERN: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_ACNE_ONSET: "HISTORICAL_RECORD",
  Q_WOMEN_OILINESS_AREA: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_OILINESS_ONSET: "HISTORICAL_RECORD",
  Q_WOMEN_FERTILITY_STATUS: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_CONTRACEPTION_STATUS: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_CONTRACEPTION_TYPE: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_CONTRACEPTION_NAME: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_INTIMATE_DESIRE: "SINCE_LAST_VISIT_EVENT",
  Q_WOMEN_INTIMATE_DESIRE_ONSET: "HISTORICAL_RECORD",
  Q_MENS_HEALTH: "SINCE_LAST_VISIT_EVENT",
  Q_MEN_LIBIDO_ONSET: "HISTORICAL_RECORD",
  Q_MEN_LIBIDO_MED_RELATION: "HISTORICAL_RECORD",
  Q_MEN_LIBIDO_MED_NAME: "HISTORICAL_RECORD",
  Q_MEN_ERECTION_ONSET: "HISTORICAL_RECORD",
  Q_MEN_ERECTION_FREQUENCY: "SINCE_LAST_VISIT_EVENT",
  Q_MEN_ERECTION_MED_RELATION: "HISTORICAL_RECORD",
  Q_MEN_ERECTION_MED_NAME: "HISTORICAL_RECORD",
  Q_MEN_BREAST_CHANGE: "SINCE_LAST_VISIT_EVENT",
  Q_MEN_BREAST_ONSET: "HISTORICAL_RECORD",
  Q_MEN_BREAST_MED_RELATION: "HISTORICAL_RECORD",
  Q_MEN_BREAST_MED_NAME: "HISTORICAL_RECORD",
  Q_MEN_BODY_HAIR_AREAS: "SINCE_LAST_VISIT_EVENT",
  Q_MEN_BODY_HAIR_ONSET: "HISTORICAL_RECORD",
  Q_MEN_BODY_HAIR_PATTERN: "SINCE_LAST_VISIT_EVENT",
  Q_MEN_MUSCLE_CHANGE: "SINCE_LAST_VISIT_EVENT",
  Q_MEN_MUSCLE_ONSET: "HISTORICAL_RECORD",
  Q_MEN_MUSCLE_ACTIVITY_RELATION: "SINCE_LAST_VISIT_EVENT",
  Q_MEN_FERTILITY_SHORT: "HISTORICAL_RECORD",
  Q_MEN_HORMONES_STEROIDS: "HISTORICAL_RECORD",
  Q_MEN_HORMONE_NAME: "HISTORICAL_RECORD",
  Q_MEN_HORMONE_START: "HISTORICAL_RECORD",
  Q_MEN_HORMONE_STOP: "HISTORICAL_RECORD",
  Q_MEN_HORMONE_HAIR_CHANGE: "HISTORICAL_RECORD",
  Q_MEN_HORMONE_HAIR_CHANGE_TYPES: "HISTORICAL_RECORD",
  Q_PREGNANCY_BREASTFEEDING_STATUS: "CURRENT_SAFETY_STATE",
  Q_PREGNANCY_MONTH: "CURRENT_SAFETY_STATE",
  Q_BREASTFEEDING_ONSET: "CURRENT_SAFETY_STATE",
  Q_PREGNANCY_PLANNING: "CURRENT_SAFETY_STATE",
  Q_HQ_HAIR_STATE: "HISTORICAL_RECORD",
  Q_HQ_PREVIOUS_TREATMENTS: "HISTORICAL_RECORD",
  Q_HQ_PREVIOUS_TREATMENT_DETAILS: "HISTORICAL_RECORD",
  Q_HQ_DRUG_EXPOSURES: "HISTORICAL_RECORD",
  Q_HQ_DRUG_EXPOSURE_DETAILS: "HISTORICAL_RECORD",
  Q_HQ_NATURAL_PATTERN: "HISTORICAL_RECORD",
  Q_HQ_CURRENT_PROBLEMS: "VISIT_MEASUREMENT",
  Q_HQ_HEAT_TOOLS: "SINCE_LAST_VISIT_EVENT",
  Q_HQ_HEAT_TOOL_DETAILS: "SINCE_LAST_VISIT_EVENT",
  Q_HQ_HEAT_PROTECTANT: "SINCE_LAST_VISIT_EVENT",
  Q_HQ_WASH_FREQUENCY: "SINCE_LAST_VISIT_EVENT",
  Q_HQ_CLEANSERS: "SINCE_LAST_VISIT_EVENT",
  Q_HQ_CLEANSER_OTHER: "SINCE_LAST_VISIT_EVENT",
  Q_HQ_ROUTINE_ITEMS: "SINCE_LAST_VISIT_EVENT",
  Q_HQ_ROUTINE_DETAILS: "SINCE_LAST_VISIT_EVENT",
  Q_HQ_ROUTINE_ADHERENCE: "SINCE_LAST_VISIT_EVENT",
  Q_HQ_ROUTINE_CHANGED: "SINCE_LAST_VISIT_EVENT",
  Q_HQ_ROUTINE_CHANGE_TEXT: "SINCE_LAST_VISIT_EVENT",
  Q_HQ_ROUTINE_CHANGE_DATE: "SINCE_LAST_VISIT_EVENT",
  Q_HQ_POST_WASH_ORDER: "SINCE_LAST_VISIT_EVENT",
  Q_DERMATOLOGY_CONCERN: "HISTORICAL_RECORD",
  Q_LASER_CONCERNS: "HISTORICAL_RECORD",
  Q_LASER_CONCERN_DETAILS: "SINCE_LAST_VISIT_EVENT",
  Q_AESTHETIC_PROCEDURES: "HISTORICAL_RECORD",
  Q_AESTHETIC_DETAILS: "SINCE_LAST_VISIT_EVENT",
} as const satisfies Record<string, FollowUpLifecycle>;


const GENERAL_HEALTH = new Set([
  "Q_PROFILE_MARITAL_STATUS", "Q_HEALTH_SNAPSHOT", "Q_HEALTH_CHRONIC_ITEMS",
  "Q_HEALTH_TUMOR_ITEMS", "Q_HEALTH_ALLERGY_ITEMS", "Q_HEALTH_SURGERY_ITEMS",
  "Q_PRIOR_DIAGNOSIS_GATE", "Q_PRIOR_DIAGNOSES", "Q_PRIOR_DIAGNOSIS_DETAILS",
  "Q_PRIOR_DIAGNOSIS_OTHER", "Q_SCALP_BIOPSY_GATE", "Q_SCALP_BIOPSY_DATE",
  "Q_SCALP_BIOPSY_AREA", "Q_SCALP_BIOPSY_RESULT_KNOWN", "Q_SCALP_BIOPSY_RESULT_TEXT",
]);

const MEDICATIONS_SUPPLEMENTS = new Set([
  "Q_HEALTH_MEDICATION_ITEMS", "Q_HEALTH_SUPPLEMENT_ITEMS",
]);

const HAIR_TREATMENTS = new Set([
  "Q_HAIR_TREATMENT_GATE", "Q_HAIR_TREATMENT_ITEMS",
]);

const HAIR_PROCEDURES = new Set([
  "Q_HAIR_PROCEDURE_GATE", "Q_HAIR_PROCEDURES", "Q_HAIR_PROCEDURE_DETAILS",
]);

const TRIGGER_EVENTS = new Set([
  "Q_TRIGGER_EVENTS", "Q_TRIGGER_EVENT_DETAILS",
  "Q_TRIGGER_EVENTS_FEMALE", "Q_TRIGGER_EVENTS_FEMALE_DETAILS",
  "Q_TRIGGER_EVENTS_MALE", "Q_TRIGGER_EVENTS_MALE_DETAILS",
]);

const SEX_SPECIFIC_PREFIXES = ["Q_WOMEN_", "Q_MEN_"];
const HAIR_QUALITY_LIFESTYLE_PREFIXES = ["Q_HQ_", "Q_LIFESTYLE_"];
const LASER_AESTHETIC_PREFIXES = ["Q_LASER_", "Q_AESTHETIC_"];

export function getFollowUpLifecycle(questionCode: string): FollowUpLifecycle | null {
  return FOLLOW_UP_LIFECYCLE_BY_QUESTION[questionCode as keyof typeof FOLLOW_UP_LIFECYCLE_BY_QUESTION] ?? null;
}

export function getFollowUpDomain(questionCode: string): FollowUpDomain {
  if (GENERAL_HEALTH.has(questionCode)) return "GENERAL_HEALTH";
  if (MEDICATIONS_SUPPLEMENTS.has(questionCode)) return "MEDICATIONS_SUPPLEMENTS";
  if (HAIR_TREATMENTS.has(questionCode)) return "HAIR_TREATMENTS";
  if (HAIR_PROCEDURES.has(questionCode)) return "HAIR_PROCEDURES";
  if (TRIGGER_EVENTS.has(questionCode)) return "TRIGGER_EVENTS";
  if (questionCode === "Q_WOMENS_HEALTH" || questionCode === "Q_MENS_HEALTH" || SEX_SPECIFIC_PREFIXES.some((prefix) => questionCode.startsWith(prefix))) return "SEX_SPECIFIC";
  if (HAIR_QUALITY_LIFESTYLE_PREFIXES.some((prefix) => questionCode.startsWith(prefix))) return "HAIR_QUALITY_LIFESTYLE";
  if (LASER_AESTHETIC_PREFIXES.some((prefix) => questionCode.startsWith(prefix))) return "LASER_AESTHETIC";
  return "CURRENT_CONCERN";
}

export function followUpDomainIsChanged(
  domain: FollowUpDomain,
  changes: FollowUpChangeState | undefined,
): boolean {
  if (!changes) return false;
  switch (domain) {
    case "GENERAL_HEALTH":
      return changes.generalHealth === "CHANGED";
    case "MEDICATIONS_SUPPLEMENTS":
      return !followUpChangeIsNoChange(changes.medicationsSupplements) && (
        followUpChangeHasAction(changes.medicationsSupplements, "STARTED") ||
        followUpChangeHasAction(changes.medicationsSupplements, "STOPPED") ||
        followUpChangeHasAction(changes.medicationsSupplements, "USAGE_CHANGED")
      );
    case "HAIR_TREATMENTS":
      return !followUpChangeIsNoChange(changes.hairTreatments) && (
        followUpChangeHasAction(changes.hairTreatments, "STARTED") ||
        followUpChangeHasAction(changes.hairTreatments, "STOPPED") ||
        followUpChangeHasAction(changes.hairTreatments, "USAGE_CHANGED")
      );
    case "HAIR_PROCEDURES":
      return changes.hairProcedures === "YES";
    case "TRIGGER_EVENTS":
      return changes.triggerEvents === "YES" || changes.triggerEvents === "UNSURE";
    case "SEX_SPECIFIC":
      return changes.sexSpecific === "CHANGED";
    case "HAIR_QUALITY_LIFESTYLE":
      return changes.hairQualityLifestyle === "CHANGED";
    case "LASER_AESTHETIC":
      return false;
    case "CURRENT_CONCERN":
      return false;
  }
}

/**
 * These are compact domain-change gates, not a replay of the initial registry.
 * A returning patient only confirms domains that can reasonably have changed.
 */
export function requiredFollowUpChangeKeys(
  primaryReasonCode: string | null,
  sex: string | null,
  episodeState?: FollowUpClientEpisodeState,
): Array<keyof FollowUpChangeState> {
  const keys = new Set<keyof FollowUpChangeState>();

  // New concern on an existing patient: do not replay the old health history;
  // only confirm whether shared current state changed before opening the new pathway.
  if (!episodeState) {
    keys.add("generalHealth");
    keys.add("medicationsSupplements");
    return [...keys];
  }

  // Existing episode: shared history is never replayed, but two compact delta gates
  // are clinically useful across pathways: important health changes and changes to
  // current medications/supplements. Details open only when the patient reports a change.
  keys.add("generalHealth");
  keys.add("medicationsSupplements");

  switch (primaryReasonCode) {
    case "RV_HAIR_LOSS":
      keys.add("hairTreatments");
      keys.add("hairProcedures");
      keys.add("triggerEvents");
      keys.add("sexSpecific");
      break;
    case "RV_SCALP_SYMPTOMS":
      keys.add("hairTreatments");
      keys.add("hairProcedures");
      keys.add("triggerEvents");
      break;
    case "RV_HAIR_QUALITY":
      keys.add("hairTreatments");
      keys.add("hairQualityLifestyle");
      break;
    case "RV_DERMATOLOGY":
      break;
    case "RV_LASER":
    case "RV_AESTHETIC_PROCEDURES":
      // Procedure follow-up is driven only by the physician-approved episode
      // profile; legacy Journey measurement/timeline persistence is not a runtime source.
      break;
  }

  // Physician-approved follow-up profile can add a domain based on diagnosis,
  // plan, treatment, or procedure without exposing the diagnosis itself.
  for (const domain of episodeState.physicianChangeDomains) keys.add(domain);

  // Sex-specific history is not replayed by default. Pregnancy/safety state is
  // separately classified as CURRENT_SAFETY_STATE and can still be rechecked.
  void sex;
  return [...keys];
}

export function isHistoricalFollowUpLifecycle(lifecycle: FollowUpLifecycle | null): boolean {
  return lifecycle === "ASK_ONCE" || lifecycle === "HISTORICAL_RECORD";
}
export function requiredFollowUpSafetyQuestionCodes(
  sex: string | null,
  episodeState?: FollowUpClientEpisodeState,
): string[] {
  if (sex !== "FEMALE" || !episodeState) return [];
  const routed = episodeState.physicianRoutedQuestionCodes.filter((code) =>
    getFollowUpLifecycle(code) === "CURRENT_SAFETY_STATE" && code !== "Q_PRIVACY_CONSENT",
  );
  if (routed.length === 0) return [];

  const result = new Set(routed);
  // Month and breastfeeding-onset are conditional details of the current status.
  // If either detail is requested, the governed status question is required first.
  if (result.has("Q_PREGNANCY_MONTH") || result.has("Q_BREASTFEEDING_ONSET")) {
    result.add("Q_PREGNANCY_BREASTFEEDING_STATUS");
  }
  return [...result];
}

