import {
  P01_CONTENT_VERSION,
  P01_PATHWAY_CODE,
  P01_QUESTION_CONTRACTS,
  P01_SECTION_ORDER,
  type P01QuestionContract,
  type P01SectionCode,
} from "@/lib/p01/contracts";
import type { JsonValue, PatientInputJson } from "@/lib/patient-access/service";
import { isHistoricalApproxDateOnOrBefore } from "@/lib/p01/clinical-date";
import { localizeDigits } from "@/lib/p01/locale";
import {
  followUpDomainIsChanged,
  getFollowUpDomain,
  getFollowUpLifecycle,
  requiredFollowUpChangeKeys,
} from "@/lib/follow-up/lifecycle";
import { followUpDeltaCompletionIssues, followUpSafetyCompletionIssues } from "@/lib/follow-up/delta";
import { followUpSexSpecificCompletionIssues } from "@/lib/follow-up/sex-specific";
import {
  followUpChangeAnswered,
  hasRecordedQuestion,
  readFollowUpContext,
  selectedEpisodeState,
  type FollowUpChangeState,
  type P01FollowUpContext,
} from "@/lib/follow-up/types";
import {
  P01_PRIVACY_NOTICE_AR,
  P01_PRIVACY_NOTICE_EN,
  P01_PRIVACY_NOTICE_VERSION,
} from "@/lib/p01/privacy";

export type P01Locale = "ar" | "en";

export interface P01DraftDocument {
  locale: P01Locale;
  answers: Record<string, JsonValue>;
  followUp?: P01FollowUpContext;
  privacy?: {
    noticeVersion: string;
    noticeTextAr: string;
    noticeTextEn: string;
    language: P01Locale;
    acceptedAt: string;
  };
}

export interface P01ValidationIssue {
  code:
    | "REQUIRED"
    | "INVALID_VALUE"
    | "INVALID_COMBINATION"
    | "CONFIGURATION_ERROR";
  questionCode: string;
  messageAr: string;
  messageEn: string;
}

export interface P01EvaluatedQuestion {
  code: string;
  sectionCode: P01SectionCode;
  responseType: P01QuestionContract["responseType"];
  label: string;
  help?: string;
  options: Array<{
    code: string;
    label: string;
    exclusiveWith: string[];
  }>;
  value: JsonValue | undefined;
  required: boolean;
  scopeType: P01QuestionContract["scope"];
  scopeKey: string;
  repeatable: P01QuestionContract["repeatable"];
  issues: P01ValidationIssue[];
}

export interface P01Evaluation {
  contentVersion: typeof P01_CONTENT_VERSION;
  locale: P01Locale;
  direction: "rtl" | "ltr";
  state: "READY" | "UNKNOWN" | "CONFIGURATION_ERROR";
  activeModules: {
    hairLoss: boolean;
    scalp: boolean;
    hairQuality: boolean;
    dermatology: boolean;
    laser: boolean;
    aesthetic: boolean;
    lifestyleNutrition: boolean;
  };
  activeQuestionCodes: string[];
  questions: P01EvaluatedQuestion[];
  issues: P01ValidationIssue[];
  firstIncompleteSection: P01SectionCode | null;
  progress: {
    completed: number;
    total: number;
  };
}

export interface P01OfficialQuestionValue {
  questionCode: string;
  responseScopeType: P01QuestionContract["scope"];
  responseScopeKey: string;
  value: JsonValue;
  activationSources: Array<{
    sourceType: "SYSTEM" | "PATHWAY" | "RULE" | "VISIT_REASON";
    sourceKey: string;
    isRequired: boolean;
  }>;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeP01Draft(input: PatientInputJson): P01DraftDocument {
  const locale: P01Locale = input.locale === "en" ? "en" : "ar";
  const answers = isRecord(input.answers) ? input.answers : {};
  const privacy = isRecord(input.privacy)
    ? {
        noticeVersion:
          typeof input.privacy.noticeVersion === "string"
            ? input.privacy.noticeVersion
            : "",
        noticeTextAr:
          typeof input.privacy.noticeTextAr === "string"
            ? input.privacy.noticeTextAr
            : "",
        noticeTextEn:
          typeof input.privacy.noticeTextEn === "string"
            ? input.privacy.noticeTextEn
            : "",
        language: (input.privacy.language === "en" ? "en" : "ar") as P01Locale,
        acceptedAt:
          typeof input.privacy.acceptedAt === "string"
            ? input.privacy.acceptedAt
            : "",
      }
    : undefined;

  const followUp = readFollowUpContext(input);
  return {
    locale,
    answers,
    ...(followUp ? { followUp } : {}),
    ...(privacy ? { privacy } : {}),
  };
}

export function getP01RoutingAnswers(input: PatientInputJson): Record<string, JsonValue> {
  const draft = normalizeP01Draft(input);
  const answers: Record<string, JsonValue> = { ...draft.answers };
  const followUp = draft.followUp;
  if (!followUp) return answers;

  answers.Q_PROFILE_FULL_NAME ??= followUp.identity.fullName;
  answers.Q_PROFILE_DOB ??= followUp.identity.dateOfBirth;
  answers.Q_PROFILE_SEX ??= followUp.identity.sex;
  answers.Q_PROFILE_MARITAL_STATUS ??= followUp.identity.maritalStatus;
  if (followUp.intent === "EXISTING_CONCERN" && followUp.selectedPrimaryReasonCode) {
    answers.Q_VISIT_PRIMARY_REASON = followUp.selectedPrimaryReasonCode;

    // Prior values are used only as routing context so the follow-up can preserve
    // the previous clinical branch without asking historical questions again.
    // They are NOT copied into draft.answers and therefore never become new
    // official Responses for this visit.
    for (const entry of followUp.snapshot.entries) {
      if (entry.sourceEpisodeId && entry.sourceEpisodeId !== followUp.selectedEpisodeId) continue;
      if (answers[entry.questionCode] !== undefined) continue;
      const lifecycle = getFollowUpLifecycle(entry.questionCode);
      if (lifecycle === "VISIT_MEASUREMENT" || lifecycle === "CURRENT_SAFETY_STATE") continue;
      if (["Q_VISIT_PRIMARY_REASON", "Q_VISIT_ADDITIONAL_REQUESTS"].includes(entry.questionCode)) continue;
      answers[entry.questionCode] = entry.value;
    }
  }
  return answers;
}

function asString(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: JsonValue | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}


function optionAllowedForPatient(
  questionCode: string,
  optionCode: string,
  answers: Record<string, JsonValue>,
): boolean {
  // Sex-specific options inside otherwise shared questions must be filtered
  // server-side as well as in the renderer. This prevents stale/forged
  // opposite-sex values from becoming an official response.
  if (questionCode === "Q_PRIOR_DIAGNOSES" && optionCode === "POSTPARTUM_SHEDDING") {
    return asString(answers.Q_PROFILE_SEX) === "FEMALE";
  }
  if (questionCode === "Q_VISIT_PRIMARY_REASON" && optionCode === "RV_HAIR_QUALITY") {
    return asString(answers.Q_PROFILE_SEX) === "FEMALE";
  }
  return true;
}

function isAnswered(value: JsonValue | undefined): boolean {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function answerEquals(
  answers: Record<string, JsonValue>,
  code: string,
  expected: string,
): boolean {
  return asString(answers[code]) === expected;
}

interface P01ActiveModules {
  hairLoss: boolean;
  scalp: boolean;
  hairQuality: boolean;
  dermatology: boolean;
  laser: boolean;
  aesthetic: boolean;
  lifestyleNutrition: boolean;
}

function evaluateRule(
  rule: Record<string, unknown>,
  answers: Record<string, JsonValue>,
  modules: P01ActiveModules,
): boolean | "CONFIGURATION_ERROR" {
  switch (rule.kind) {
    case "ALL_OF": {
      if (!Array.isArray(rule.rules)) return "CONFIGURATION_ERROR";
      for (const child of rule.rules) {
        if (typeof child !== "object" || child === null || Array.isArray(child)) return "CONFIGURATION_ERROR";
        const result = evaluateRule(child as Record<string, unknown>, answers, modules);
        if (result === "CONFIGURATION_ERROR") return result;
        if (!result) return false;
      }
      return true;
    }
    case "ALWAYS":
      return true;
    case "HAS_PRIMARY_REASON":
      return typeof asString(answers.Q_VISIT_PRIMARY_REASON) === "string";
    case "HAIR_QUALITY_ACTIVE":
      return modules.hairQuality;
    case "DERMATOLOGY_ACTIVE":
      return modules.dermatology;
    case "LASER_ACTIVE":
      return modules.laser;
    case "AESTHETIC_ACTIVE":
      return modules.aesthetic;
    case "HAIR_OR_QUALITY_ACTIVE":
      return modules.hairLoss || modules.hairQuality;
    case "FEMALE_PILOT_PATHWAY_ACTIVE":
      return asString(answers.Q_PROFILE_SEX) === "FEMALE" && Boolean(asString(answers.Q_VISIT_PRIMARY_REASON));
    case "HQ_POST_WASH_APPLICABLE": {
      if (!modules.hairQuality) return false;
      const selected = asStringArray(answers.Q_HQ_ROUTINE_ITEMS);
      return selected.some((code) => ["CONDITIONER", "MASK", "LEAVE_IN", "OIL"].includes(code));
    }
    case "HAIR_MODULE_ACTIVE":
      return modules.hairLoss;
    case "SCALP_MODULE_ACTIVE":
      return modules.scalp;
    case "HAIR_SCALP_PATHWAY_ACTIVE":
      return modules.hairLoss || modules.scalp;
    case "SCALP_HAS_SELECTED_SYMPTOM":
      return modules.scalp && asStringArray(answers.Q_SCALP_SYMPTOMS).some(
        (code) => code !== "NO_SYMPTOMS",
      );
    case "PRIMARY_IS":
      return asString(answers.Q_VISIT_PRIMARY_REASON) === rule.reasonCode;
    case "SELECTED":
      return asStringArray(answers[String(rule.questionCode)]).includes(
        String(rule.optionCode),
      );
    case "ANSWER_EQUALS":
      return answerEquals(
        answers,
        String(rule.questionCode),
        String(rule.value),
      );
    case "ANSWER_IN":
      return Array.isArray(rule.values) && rule.values.map(String).includes(asString(answers[String(rule.questionCode)]) ?? "");
    case "HAS_SELECTION":
      return asStringArray(answers[String(rule.questionCode)]).length > 0;
    case "HAS_SELECTION_EXCEPT": {
      const except = Array.isArray(rule.except) ? rule.except.map(String) : [];
      return asStringArray(answers[String(rule.questionCode)]).some((value) => !except.includes(value));
    }
    case "SEX_AND_HAIR_ACTIVE":
      return modules.hairLoss && asString(answers.Q_PROFILE_SEX) === String(rule.sex);
    case "HAIR_CONCERN_INCLUDES": {
      if (!modules.hairLoss) return false;
      const concern = asString(answers.Q_HAIR_CONCERN);
      return concern === "BOTH" || concern === rule.branch;
    }
    default:
      return "CONFIGURATION_ERROR";
  }
}

function evaluateVisibility(
  contract: P01QuestionContract,
  answers: Record<string, JsonValue>,
  modules: P01ActiveModules,
): boolean | "CONFIGURATION_ERROR" {
  return evaluateRule(contract.visibility as Record<string, unknown>, answers, modules);
}

function validateSelection(
  contract: P01QuestionContract,
  value: JsonValue | undefined,
  answers: Record<string, JsonValue>,
): boolean {
  const allowed = new Set(
    (contract.options ?? [])
      .filter(({ code }) => optionAllowedForPatient(contract.code, code, answers))
      .map(({ code }) => code),
  );

  if (contract.responseType === "MULTI_SELECT") {
    const selections = asStringArray(value);
    if (selections.length === 0 || selections.some((code) => !allowed.has(code))) {
      return false;
    }

    for (const selected of selections) {
      const option = contract.options?.find(({ code }) => code === selected);
      if (option?.exclusiveWith?.some((code) => selections.includes(code))) {
        return false;
      }
    }

    return true;
  }

  return typeof value === "string" && allowed.has(value);
}

function validateRepeatable(
  contract: P01QuestionContract,
  value: JsonValue | undefined,
  answers: Record<string, JsonValue>,
  referenceDate: Date,
): boolean {
  if (!contract.repeatable || !Array.isArray(value) || value.length === 0) {
    return false;
  }

  const records = value.filter(isRecord);
  if (contract.code === "Q_TRIGGER_EVENT_DETAILS") {
    const expected = asStringArray(answers.Q_TRIGGER_EVENTS).filter((code) => code !== "NONE_OF_THE_ABOVE");
    if (expected.length !== records.length || expected.some((code) => !records.some((item) => item.id === code && item.event === code))) return false;
    const other = records.find((item) => item.id === "OTHER" && item.event === "OTHER");
    if (other && (typeof other.details !== "string" || other.details.trim().length === 0)) return false;
  }
  if (contract.code === "Q_PRIOR_DIAGNOSIS_DETAILS") {
    const expected = asStringArray(answers.Q_PRIOR_DIAGNOSES).filter((code) => code !== "DO_NOT_REMEMBER");
    if (expected.length !== records.length || expected.some((code) => !records.some((item) => item.id === code && item.diagnosis === code))) return false;
  }
  if (contract.code === "Q_HAIR_PROCEDURE_DETAILS") {
    const expected = asStringArray(answers.Q_HAIR_PROCEDURES);
    if (expected.length !== records.length || expected.some((code) => !records.some((item) => item.id === code && item.procedure === code))) return false;
  }
  if (contract.code === "Q_HQ_PREVIOUS_TREATMENT_DETAILS") {
    const expected = asStringArray(answers.Q_HQ_PREVIOUS_TREATMENTS).filter((code) => code !== "NONE");
    return expected.length === records.length && expected.every((code) => {
      const item = records.find((row) => row.id === code && row.treatment === code);
      return Boolean(
        item &&
        typeof item.typeText === "string" && item.typeText.trim().length > 0 &&
        isHistoricalApproxDateOnOrBefore(item.when, referenceDate) &&
        ["YES","NO","UNSURE"].includes(String(item.stillPresent ?? ""))
      );
    });
  }
  if (contract.code === "Q_HQ_DRUG_EXPOSURE_DETAILS") {
    const expected = asStringArray(answers.Q_HQ_DRUG_EXPOSURES).filter((code) => code !== "NONE");
    return expected.length === records.length && expected.every((code) => {
      const item = records.find((row) => row.id === code && row.exposure === code);
      if (!item || !["CURRENT","PREVIOUS"].includes(String(item.status ?? "")) || !isHistoricalApproxDateOnOrBefore(item.start, referenceDate)) return false;
      if (item.status === "PREVIOUS" && !isHistoricalApproxDateOnOrBefore(item.stop, referenceDate)) return false;
      if (!["YES","NO","UNSURE"].includes(String(item.hairChange ?? ""))) return false;
      if (item.hairChange === "YES" && (typeof item.changeDescription !== "string" || item.changeDescription.trim().length === 0)) return false;
      return true;
    });
  }
  if (contract.code === "Q_HQ_HEAT_TOOL_DETAILS") {
    const expected = asStringArray(answers.Q_HQ_HEAT_TOOLS).filter((code) => code !== "NONE");
    const allowed = new Set(["LT_WEEKLY","WEEKLY_1_2","WEEKLY_3_4","WEEKLY_5_PLUS"]);
    return expected.length === records.length && expected.every((code) => {
      const item = records.find((row) => row.id === code && row.tool === code);
      return Boolean(item && allowed.has(String(item.frequency ?? "")));
    });
  }
  if (contract.code === "Q_HQ_ROUTINE_DETAILS") {
    const expected = asStringArray(answers.Q_HQ_ROUTINE_ITEMS).filter((code) => code !== "NONE");
    const allowed = new Set(["EVERY_WASH","WEEKLY","MONTHLY","OTHER"]);
    return expected.length === records.length && expected.every((code) => {
      const item = records.find((row) => row.id === code && row.routineItem === code);
      return Boolean(item && allowed.has(String(item.frequency ?? "")));
    });
  }
  if (contract.code === "Q_HQ_POST_WASH_ORDER") {
    const selected = asStringArray(answers.Q_HQ_ROUTINE_ITEMS);
    const expected: string[] = [];
    if (selected.includes("CONDITIONER") || selected.includes("MASK")) expected.push("CONDITIONING");
    if (selected.includes("LEAVE_IN")) expected.push("LEAVE_IN");
    if (selected.includes("OIL")) expected.push("OIL");
    if (records.length !== expected.length || expected.some((code) => !records.some((item) => item.id === code && item.step === code))) return false;
    const ranks = records.map((item) => Number(item.rank));
    return ranks.every((rank) => Number.isInteger(rank) && rank >= 1 && rank <= expected.length) && new Set(ranks).size === expected.length;
  }
  if (contract.code === "Q_LASER_CONCERN_DETAILS") {
    const expected = asStringArray(answers.Q_LASER_CONCERNS);
    const primaryLaser = asString(answers.Q_VISIT_PRIMARY_REASON) === "RV_LASER";
    const validAreas = new Set(["FACE","NECK","SCALP","HANDS","BODY","DOUBLE_CHIN","UNDER_EYE","OTHER"]);
    return expected.length === records.length && expected.every((code) => {
      const item = records.find((row) => row.id === code && row.concern === code);
      if (!item) return false;
      if (code === "LASER_OTHER" && (typeof item.otherText !== "string" || item.otherText.trim().length === 0)) return false;
      if (primaryLaser) {
        if (!validAreas.has(String(item.area ?? ""))) return false;
        if (item.area === "OTHER" && (typeof item.areaOther !== "string" || item.areaOther.trim().length === 0)) return false;
      }
      if (!["YES","NO"].includes(String(item.prior ?? ""))) return false;
      if (item.prior === "YES") {
        const count = Number(item.count);
        if (!Number.isInteger(count) || count < 1 || !isHistoricalApproxDateOnOrBefore(item.lastDate, referenceDate)) return false;
        if (!["YES","NO","DONT_REMEMBER"].includes(String(item.complications ?? ""))) return false;
        if (item.complications === "YES" && (typeof item.complicationText !== "string" || item.complicationText.trim().length === 0)) return false;
      }
      return true;
    });
  }
  if (contract.code === "Q_AESTHETIC_DETAILS") {
    const expected = asStringArray(answers.Q_AESTHETIC_PROCEDURES);
    const primaryAesthetic = asString(answers.Q_VISIT_PRIMARY_REASON) === "RV_AESTHETIC_PROCEDURES";
    const areaSets: Record<string, Set<string>> = {
      AP_BOTOX: new Set(["FACE_NECK","SCALP_SWEATING","SCARS","ROSACEA","RADIANCE","PORES"]),
      AP_FILLER: new Set(["FACE","BODY","HANDS","SPECIAL_AREAS"]),
      AP_COLLAGEN_STIMULATORS: new Set(["FACE","NECK","HANDS","BODY"]),
      AP_FAT_DISSOLVING: new Set(["DOUBLE_CHIN","UNDER_EYES","BODY"]),
    };
    return expected.length === records.length && expected.every((code) => {
      const item = records.find((row) => row.id === code && row.procedure === code);
      if (!item) return false;
      if (code === "AP_OTHER" && (typeof item.otherText !== "string" || item.otherText.trim().length === 0)) return false;
      if (primaryAesthetic) {
        const areaSet = areaSets[code];
        if (areaSet && !areaSet.has(String(item.area ?? ""))) return false;
        if (["AP_SKIN_BOOSTER","AP_SWEATING_INJECTION","AP_BODY_CONTOURING"].includes(code) && (typeof item.areaText !== "string" || item.areaText.trim().length === 0)) return false;
        if (code === "AP_BODY_CONTOURING" && !["ENLARGE","SLIM"].includes(String(item.goal ?? ""))) return false;
        if (typeof item.desiredResult !== "string" || item.desiredResult.trim().length === 0) return false;
      }
      if (!["YES","NO"].includes(String(item.prior ?? ""))) return false;
      if (item.prior === "YES") {
        const count = Number(item.count);
        if (!Number.isInteger(count) || count < 1 || !isHistoricalApproxDateOnOrBefore(item.lastDate, referenceDate)) return false;
        if (!["YES","NO","DONT_REMEMBER"].includes(String(item.complications ?? ""))) return false;
        if (item.complications === "YES" && (typeof item.complicationText !== "string" || item.complicationText.trim().length === 0)) return false;
      }
      return true;
    });
  }

  return value.every((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || item.id.length === 0) {
      return false;
    }

    return contract.repeatable!.fields.every((field) => {
      const fieldValue = item[field.code];
      if (!field.required && (fieldValue === undefined || fieldValue === null || fieldValue === "")) {
        return true;
      }
      if (field.type === "MONTH_YEAR") {
        return isHistoricalApproxDateOnOrBefore(fieldValue, referenceDate);
      }
      if (field.type === "SINGLE_SELECT") {
        return typeof fieldValue === "string" && Boolean(field.options?.some(({ code }) => code === fieldValue));
      }
      return typeof fieldValue === "string" && fieldValue.trim().length > 0;
    });
  });
}

function validateScalpDetails(
  value: JsonValue | undefined,
  selectedSymptoms: string[],
  referenceDate: Date,
): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return selectedSymptoms
    .filter((code) => code !== "NO_SYMPTOMS")
    .every((symptomCode) => {
      const detail = value[symptomCode];
      if (!isRecord(detail)) {
        return false;
      }
      if (
        !isHistoricalApproxDateOnOrBefore(detail.onset, referenceDate) ||
        typeof detail.pattern !== "string" ||
        detail.pattern.length === 0
      ) {
        return false;
      }
      if (["ITCH", "BURNING", "SCALP_PAIN"].includes(symptomCode)) {
        const severity = detail.severity;
        return (
          (typeof severity === "string" || typeof severity === "number") &&
          String(severity).length > 0 &&
          Number.isInteger(Number(severity)) &&
          Number(severity) >= 0 &&
          Number(severity) <= 5
        );
      }
      return true;
    });
}

function isQuestionRequired(contract: P01QuestionContract): boolean {
  if (typeof contract.requiredness !== "object" || contract.requiredness === null) return true;
  return (contract.requiredness as { kind?: unknown }).kind !== "OPTIONAL";
}

function validateValue(
  contract: P01QuestionContract,
  value: JsonValue | undefined,
  answers: Record<string, JsonValue>,
  referenceDate: Date,
): boolean {
  if (!isAnswered(value)) {
    return false;
  }

  if (contract.code === "Q_PRIVACY_CONSENT") {
    return value === "YES";
  }

  if (contract.repeatable) {
    if (contract.code === "Q_SCALP_SYMPTOM_DETAILS") {
      return validateScalpDetails(
        value,
        asStringArray(answers.Q_SCALP_SYMPTOMS),
        referenceDate,
      );
    }
    return validateRepeatable(contract, value, answers, referenceDate);
  }

  if (
    contract.responseType === "SINGLE_SELECT" ||
    contract.responseType === "MULTI_SELECT" ||
    contract.responseType === "BOOLEAN" ||
    contract.responseType === "SCALE"
  ) {
    return validateSelection(contract, value, answers);
  }

  if (contract.responseType === "DATE") {
    if (typeof value !== "string") {
      return false;
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= referenceDate.getTime();
  }

  if (contract.responseType === "TEXT" || contract.responseType === "LONG_TEXT") {
    if (typeof value !== "string") return false;
    const length = value.trim().length;
    const textRule = (contract.validation as Array<Record<string, unknown>>).find(
      ({ kind }) => kind === "TEXT",
    );
    const minLength =
      typeof textRule?.minLength === "number" ? textRule.minLength : 1;
    const maxLength =
      typeof textRule?.maxLength === "number"
        ? textRule.maxLength
        : Number.POSITIVE_INFINITY;
    return length >= minLength && length <= maxLength;
  }

  if (contract.responseType === "MONTH_YEAR") {
    return isHistoricalApproxDateOnOrBefore(value, referenceDate);
  }

  return typeof value === "string" || typeof value === "number";
}

function getActivationSources(
  contract: P01QuestionContract,
  primary: string | null,
  additional: string[],
  modules: P01ActiveModules,
): P01OfficialQuestionValue["activationSources"] {
  if (contract.sectionCode === "SHARED_HISTORY") {
    const sources: P01OfficialQuestionValue["activationSources"] = [];
    if (modules.hairLoss) {
      sources.push({ sourceType: "PATHWAY", sourceKey: "HAIR_LOSS", isRequired: true });
    }
    if (modules.scalp) {
      sources.push({ sourceType: "PATHWAY", sourceKey: "SCALP", isRequired: true });
    }
    return sources;
  }

  if (contract.sectionCode === "HAIR_LOSS" || contract.sectionCode === "COURSE_IMPACT") {
    return [
      {
        sourceType: primary === "RV_HAIR_LOSS" ? "VISIT_REASON" : "RULE",
        sourceKey: primary === "RV_HAIR_LOSS" ? primary : "RULE_SCALP_TO_HAIR",
        isRequired: true,
      },
    ];
  }

  if (contract.sectionCode === "SCALP") {
    return [
      {
        sourceType: primary === "RV_SCALP_SYMPTOMS" ? "VISIT_REASON" : "RULE",
        sourceKey: primary === "RV_SCALP_SYMPTOMS" ? primary : "RULE_HAIR_TO_SCALP",
        isRequired: true,
      },
    ];
  }
  const sectionReason: Partial<Record<P01SectionCode, string>> = {
    HAIR_QUALITY: "RV_HAIR_QUALITY", DERMATOLOGY: "RV_DERMATOLOGY",
    LASER: "RV_LASER", AESTHETIC_PROCEDURES: "RV_AESTHETIC_PROCEDURES",
  };
  const reason = sectionReason[contract.sectionCode];
  if (reason) {
    return [{ sourceType: "VISIT_REASON", sourceKey: reason, isRequired: primary === reason && !additional.includes(reason) }];
  }

  return [{ sourceType: "SYSTEM", sourceKey: contract.sectionCode, isRequired: true }];
}


function followUpChangesRecord(context: P01FollowUpContext | undefined): FollowUpChangeState | undefined {
  return context?.changes;
}

function followUpSetupComplete(context: P01FollowUpContext | undefined, routingAnswers: Record<string, JsonValue>): boolean {
  if (!context?.intent) return false;
  if (context.intent === "EXISTING_CONCERN") {
    return Boolean(
      context.selectedEpisodeId &&
      context.selectedPrimaryReasonCode &&
      context.sourceVisitId &&
      selectedEpisodeState(context),
    );
  }
  return typeof asString(routingAnswers.Q_VISIT_PRIMARY_REASON) === "string";
}

function followUpChangeGatesComplete(context: P01FollowUpContext | undefined, primary: string | null): boolean {
  if (!context || !primary || !context.changesReviewed) return false;
  const changes = followUpChangesRecord(context);
  return requiredFollowUpChangeKeys(primary, context.identity.sex, selectedEpisodeState(context)).every((key) => followUpChangeAnswered(changes?.[key]));
}

function hasPriorForQuestion(context: P01FollowUpContext | undefined, questionCode: string): boolean {
  return hasRecordedQuestion(context, questionCode);
}

function followUpQuestionVisible(
  question: P01QuestionContract,
  context: P01FollowUpContext | undefined,
  answers: Record<string, JsonValue>,
): boolean {
  if (!context) return true;

  if (["Q_PROFILE_FULL_NAME", "Q_PROFILE_DOB", "Q_PROFILE_SEX", "Q_PROFILE_MARITAL_STATUS"].includes(question.code)) return false;
  if (question.code === "Q_PRIVACY_CONSENT") return true;
  if (question.code === "Q_VISIT_PRIMARY_REASON") return context.intent === "NEW_CONCERN";
  if (question.code === "Q_VISIT_ADDITIONAL_REQUESTS") return false;

  const lifecycle = getFollowUpLifecycle(question.code);
  if (!lifecycle) return true;
  const prior = hasPriorForQuestion(context, question.code);
  const domain = getFollowUpDomain(question.code);
  const changes = followUpChangesRecord(context);
  const additional = asStringArray(answers.Q_VISIT_ADDITIONAL_REQUESTS);
  const isNewLaserAdditional = question.code.startsWith("Q_LASER_") && additional.includes("RV_LASER");
  const isNewAestheticAdditional = question.code.startsWith("Q_AESTHETIC_") && additional.includes("RV_AESTHETIC_PROCEDURES");

  // A follow-up can add Laser/Aesthetic as a NEW additional mini-pathway. Those
  // questions belong to today's added service, not to replaying the old episode.
  if (isNewLaserAdditional || isNewAestheticAdditional) return true;

  // A brand-new clinical episode may use the normal pathway for questions that
  // were never recorded before, while patient-level identity/history remains reused.
  if (context.intent === "NEW_CONCERN") {
    // Shared patient-wide health and medication state is updated exclusively by
    // the dedicated delta step. Reopening the Initial Intake here would ask the
    // same information twice in one visit.
    if (domain === "GENERAL_HEALTH" || domain === "MEDICATIONS_SUPPLEMENTS") return false;
    if (lifecycle === "ASK_ONCE") return !prior;
    if (lifecycle === "HISTORICAL_RECORD") return !prior;
    if (lifecycle === "CURRENT_TREATMENT_STATE") return !prior || followUpDomainIsChanged(domain, changes);
    if (lifecycle === "SINCE_LAST_VISIT_EVENT") return !prior || followUpDomainIsChanged(domain, changes);
    return true;
  }

  // Existing episode follow-up uses a dedicated delta journey. The initial
  // registry is not used as a hidden follow-up form. This is an intentional
  // hard boundary: historical, treatment, event, measurement, and safety
  // questions from the initial intake do not re-enter the renderer here.
  // The only registry questions allowed above are a newly-added Laser/Aesthetic
  // mini-pathway. Physician routing can add change domains, but it cannot reopen
  // an initial-intake question in the patient portal.
  void lifecycle;
  void prior;
  void domain;
  void changes;
  return false;
}

export function evaluateP01Draft(input: PatientInputJson, referenceDate: Date = new Date()): P01Evaluation {
  const draft = normalizeP01Draft(input);
  const answers = draft.answers;
  const routingAnswers = getP01RoutingAnswers(input);
  const locale = draft.locale;
  const primary = asString(routingAnswers.Q_VISIT_PRIMARY_REASON);
  const privacyAccepted = answerEquals(answers, "Q_PRIVACY_CONSENT", "YES");
  const additional = asStringArray(answers.Q_VISIT_ADDITIONAL_REQUESTS);
  const hairLoss =
    primary === "RV_HAIR_LOSS" ||
    (primary === "RV_SCALP_SYMPTOMS" && answerEquals(routingAnswers, "Q_SECONDARY_HAIR_GATE", "YES"));
  const scalp =
    primary === "RV_SCALP_SYMPTOMS" ||
    (primary === "RV_HAIR_LOSS" && answerEquals(routingAnswers, "Q_SECONDARY_SCALP_GATE", "YES"));
  const hqTreatments = asStringArray(routingAnswers.Q_HQ_PREVIOUS_TREATMENTS);
  const modules: P01ActiveModules = {
    hairLoss,
    scalp,
    hairQuality: primary === "RV_HAIR_QUALITY" && asString(routingAnswers.Q_PROFILE_SEX) === "FEMALE",
    dermatology: primary === "RV_DERMATOLOGY",
    laser: primary === "RV_LASER" || additional.includes("RV_LASER"),
    aesthetic: primary === "RV_AESTHETIC_PROCEDURES" || additional.includes("RV_AESTHETIC_PROCEDURES"),
    lifestyleNutrition: hairLoss || (primary === "RV_HAIR_QUALITY" && asString(routingAnswers.Q_PROFILE_SEX) === "FEMALE"),
  };
  const issues: P01ValidationIssue[] = [];
  const evaluatedQuestions: P01EvaluatedQuestion[] = [];

  for (const question of P01_QUESTION_CONTRACTS) {
    const visibility = evaluateVisibility(question, routingAnswers, modules);
    if (visibility === "CONFIGURATION_ERROR") {
      issues.push({
        code: "CONFIGURATION_ERROR",
        questionCode: question.code,
        messageAr: "خطأ في تهيئة قاعدة ظهور السؤال.",
        messageEn: "The question visibility rule is misconfigured.",
      });
      continue;
    }

    const baseVisible =
      question.code === "Q_PRIVACY_CONSENT"
        ? true
        : privacyAccepted && visibility;
    const visible = baseVisible && followUpQuestionVisible(question, draft.followUp, routingAnswers);
    if (!visible) {
      continue;
    }

    const value = answers[question.code];
    const questionIssues: P01ValidationIssue[] = [];
    const required = isQuestionRequired(question);
    const answered = isAnswered(value);
    const valid = !answered && !required ? true : validateValue(question, value, routingAnswers, referenceDate);
    if (!valid) {
      questionIssues.push({
        code: answered ? "INVALID_VALUE" : "REQUIRED",
        questionCode: question.code,
        messageAr: answered
          ? "راجع الإجابة؛ القيمة غير صالحة لهذا السؤال."
          : "هذا العنصر مطلوب قبل الإرسال.",
        messageEn: answered
          ? "Review this answer; the value is not valid for this question."
          : "This item is required before submission.",
      });
    }

    issues.push(...questionIssues);
    evaluatedQuestions.push({
      code: question.code,
      sectionCode: question.sectionCode,
      responseType: question.responseType,
      label: localizeDigits(question.localized[locale].label, locale),
      help: question.localized[locale].help ? localizeDigits(question.localized[locale].help!, locale) : undefined,
      options: (question.options ?? [])
        .filter((option) => {
          if (!optionAllowedForPatient(question.code, option.code, routingAnswers)) return false;
          if (question.code === "Q_VISIT_ADDITIONAL_REQUESTS" && option.code === primary) return false;
          if (question.code === "Q_HQ_NATURAL_PATTERN" && option.code === "DONT_REMEMBER_BEFORE_TREATMENT") {
            return hqTreatments.some((code) => ["KERATIN", "CHEMICAL_STRAIGHTENING", "CHEMICAL_CURLING", "OTHER_CHEMICAL"].includes(code));
          }
          return true;
        })
        .map((option) => ({
          code: option.code,
          label: localizeDigits(locale === "ar" ? option.labelAr : option.labelEn, locale),
          exclusiveWith: option.exclusiveWith ?? [],
        })),
      value,
      required,
      scopeType: question.scope,
      scopeKey: question.scopeKey,
      repeatable: question.repeatable,
      issues: questionIssues,
    });
  }

  const validPrimaryReasons = new Set([
    "RV_HAIR_LOSS", "RV_SCALP_SYMPTOMS", "RV_HAIR_QUALITY",
    "RV_DERMATOLOGY", "RV_LASER", "RV_AESTHETIC_PROCEDURES",
  ]);
  if (primary !== null && !validPrimaryReasons.has(primary)) {
    issues.push({
      code: "INVALID_COMBINATION", questionCode: "Q_VISIT_PRIMARY_REASON",
      messageAr: "سبب الزيارة الأساسي غير معتمد في Pilot 0.",
      messageEn: "The primary reason is not approved in Pilot 0.",
    });
  }
  if (primary === "RV_HAIR_QUALITY" && asString(routingAnswers.Q_PROFILE_SEX) !== "FEMALE") {
    issues.push({
      code: "INVALID_COMBINATION", questionCode: "Q_VISIT_PRIMARY_REASON",
      messageAr: "خدمة جودة الشعر متاحة للمراجعات الإناث فقط في المنتج الحالي.",
      messageEn: "Hair Quality is available only to female patients in the current product.",
    });
  }
  if (primary && additional.includes(primary)) {
    issues.push({
      code: "INVALID_COMBINATION", questionCode: "Q_VISIT_ADDITIONAL_REQUESTS",
      messageAr: "لا يمكن اختيار سبب الزيارة الأساسي نفسه كخدمة إضافية.",
      messageEn: "The primary reason cannot also be selected as an additional service.",
    });
  }
  if (primary === "RV_HAIR_QUALITY" && (modules.hairLoss || modules.scalp)) {
    issues.push({
      code: "INVALID_COMBINATION", questionCode: "Q_VISIT_PRIMARY_REASON",
      messageAr: "مسار جودة الشعر مستقل ولا يُدمج مع تساقط الشعر أو أعراض فروة الرأس.",
      messageEn: "Hair Quality is an independent pathway and cannot be combined with Hair Loss or Scalp Symptoms.",
    });
  }
  if (modules.hairQuality && routingAnswers.Q_HQ_HAIR_STATE === "VIRGIN" && hqTreatments.some((code) => code !== "NONE")) {
    issues.push({
      code: "INVALID_COMBINATION", questionCode: "Q_HQ_HAIR_STATE",
      messageAr: "اختر حالة الشعر مرة أخرى؛ اختيار شعر بكر لا يتوافق مع وجود معالجة سابقة محددة.",
      messageEn: "Please review the hair-state answer; Virgin hair conflicts with a selected previous treatment.",
    });
  }

  if (
    draft.followUp?.intent === "NEW_CONCERN" &&
    primary &&
    draft.followUp.episodes.some((episode) => episode.primaryReasonCode === primary)
  ) {
    issues.push({
      code: "INVALID_COMBINATION",
      questionCode: "Q_VISIT_PRIMARY_REASON",
      messageAr: "هذه المشكلة لديها متابعة نشطة بالفعل. اختر متابعة المشكلة السابقة بدل إنشاء مشكلة جديدة بنفس السبب.",
      messageEn: "This concern already has an active follow-up episode. Choose the existing concern instead of creating a new episode for the same reason.",
    });
  }

  if (draft.followUp && !followUpSetupComplete(draft.followUp, routingAnswers)) {
    issues.push({
      code: "REQUIRED",
      questionCode: "FOLLOW_UP_START",
      messageAr: "حدد هدف زيارة المتابعة قبل المتابعة.",
      messageEn: "Choose the purpose of this follow-up visit before continuing.",
    });
  } else if (draft.followUp && primary && !followUpChangeGatesComplete(draft.followUp, primary)) {
    issues.push({
      code: "REQUIRED",
      questionCode: "FOLLOW_UP_CHANGES",
      messageAr: "راجع التغييرات منذ آخر زيارة قبل المتابعة.",
      messageEn: "Review changes since the last visit before continuing.",
    });
  } else if (draft.followUp && primary) {
    const deltaIssues = [
      ...followUpDeltaCompletionIssues(draft.followUp.changes, draft.followUp.delta, primary)
        .filter((issue) => draft.followUp?.intent === "EXISTING_CONCERN" || !issue.startsWith("metric:")),
      ...followUpSafetyCompletionIssues(draft.followUp, draft.followUp.delta),
      ...followUpSexSpecificCompletionIssues(draft.followUp, draft.followUp.delta),
    ];
    if (deltaIssues.length > 0) {
      issues.push({
        code: "REQUIRED",
        questionCode: "FOLLOW_UP_DELTA",
        messageAr: draft.followUp.intent === "EXISTING_CONCERN"
          ? "أكمل تفاصيل التغييرات والقياسات الحالية قبل الإرسال."
          : "أكمل تفاصيل التغييرات التي اخترتها قبل الإرسال.",
        messageEn: draft.followUp.intent === "EXISTING_CONCERN"
          ? "Complete the change details and current measurements before submission."
          : "Complete the details for the changes you selected before submission.",
      });
    }
  }

  const firstIncompleteSection =
    P01_SECTION_ORDER.find((sectionCode) =>
      evaluatedQuestions.some(
        (question) =>
          question.sectionCode === sectionCode && question.issues.length > 0,
      ),
    ) ?? null;
  const state = issues.some(({ code }) => code === "CONFIGURATION_ERROR")
    ? "CONFIGURATION_ERROR"
    : issues.length > 0
      ? "UNKNOWN"
      : "READY";

  return {
    contentVersion: P01_CONTENT_VERSION,
    locale,
    direction: locale === "ar" ? "rtl" : "ltr",
    state,
    activeModules: modules,
    activeQuestionCodes: evaluatedQuestions.map(({ code }) => code),
    questions: evaluatedQuestions,
    issues,
    firstIncompleteSection,
    progress: {
      completed: evaluatedQuestions.filter(({ issues: questionIssues }) => questionIssues.length === 0).length,
      total: evaluatedQuestions.length,
    },
  };
}

function sanitizeOfficialRepeatableItem(
  questionCode: string,
  item: Record<string, JsonValue>,
  primary: string | null,
): Record<string, JsonValue> {
  if (questionCode === "Q_LASER_CONCERN_DETAILS" && primary !== "RV_LASER") {
    const { area: _area, areaOther: _areaOther, goal: _goal, desiredResult: _desiredResult, ...mini } = item;
    void _area; void _areaOther; void _goal; void _desiredResult;
    return mini;
  }
  if (questionCode === "Q_AESTHETIC_DETAILS" && primary !== "RV_AESTHETIC_PROCEDURES") {
    const { area: _area, areaText: _areaText, goal: _goal, desiredResult: _desiredResult, ...mini } = item;
    void _area; void _areaText; void _goal; void _desiredResult;
    return mini;
  }
  return item;
}

export function getP01OfficialQuestionValues(
  input: PatientInputJson,
): P01OfficialQuestionValue[] {
  const draft = normalizeP01Draft(input);
  const evaluation = evaluateP01Draft(input);
  if (evaluation.state !== "READY") {
    return [];
  }

  const routingAnswers = getP01RoutingAnswers(input);
  const primary = asString(routingAnswers.Q_VISIT_PRIMARY_REASON);
  const additional = asStringArray(draft.answers.Q_VISIT_ADDITIONAL_REQUESTS);
  const values: P01OfficialQuestionValue[] = [];

  for (const question of evaluation.questions) {
    const contract = P01_QUESTION_CONTRACTS.find(({ code }) => code === question.code)!;
    const value = draft.answers[question.code];
    if (value === undefined) {
      continue;
    }

    const sources = getActivationSources(contract, primary, additional, evaluation.activeModules);
    if (contract.repeatable && Array.isArray(value)) {
      for (const item of value) {
        if (!isRecord(item) || typeof item.id !== "string") {
          continue;
        }
        values.push({
          questionCode: question.code,
          responseScopeType: contract.scope,
          responseScopeKey: `${contract.scopeKey}:${item.id}`,
          value: sanitizeOfficialRepeatableItem(question.code, item, primary),
          activationSources: sources,
        });
      }
      continue;
    }

    if (question.code === "Q_SCALP_SYMPTOM_DETAILS" && isRecord(value)) {
      for (const [symptomCode, detail] of Object.entries(value)) {
        values.push({
          questionCode: question.code,
          responseScopeType: "SYMPTOM_ITEM",
          responseScopeKey: `SCALP:${symptomCode}`,
          value: detail,
          activationSources: sources,
        });
      }
      continue;
    }

    values.push({
      questionCode: question.code,
      responseScopeType: contract.scope,
      responseScopeKey: contract.scopeKey,
      value,
      activationSources: sources,
    });
  }

  const identities = new Set<string>();
  return values.filter((value) => {
    const identity = `${value.questionCode}|${value.responseScopeType}|${value.responseScopeKey}`;
    if (identities.has(identity)) {
      return false;
    }
    identities.add(identity);
    return true;
  });
}

export function assertPrivacyBeforeP01Autosave(input: PatientInputJson): void {
  const draft = normalizeP01Draft(input);
  const accepted = answerEquals(draft.answers, "Q_PRIVACY_CONSENT", "YES");
  if (!accepted) {
    throw new Error("PRIVACY_CONSENT_REQUIRED");
  }
  if (
    !draft.privacy ||
    draft.privacy.noticeVersion !== P01_PRIVACY_NOTICE_VERSION ||
    draft.privacy.noticeTextAr !== P01_PRIVACY_NOTICE_AR ||
    draft.privacy.noticeTextEn !== P01_PRIVACY_NOTICE_EN ||
    Number.isNaN(new Date(draft.privacy.acceptedAt).getTime())
  ) {
    throw new Error("PRIVACY_CONSENT_RECORD_INVALID");
  }
}

export function getP01ProfileAndVisit(input: PatientInputJson): {
  profile: { fullName: string; dateOfBirth: Date; gender: "MALE" | "FEMALE"; maritalStatus: "MARRIED" | "NOT_MARRIED"; };
  visit: {
    primaryReasonCode: "RV_HAIR_LOSS" | "RV_SCALP_SYMPTOMS" | "RV_HAIR_QUALITY" | "RV_DERMATOLOGY" | "RV_LASER" | "RV_AESTHETIC_PROCEDURES";
    additionalReasonCodes: string[]; selectedProcedureCodes: string[]; selectedLaserServiceCodes: string[];
    visitType: "INITIAL" | "FOLLOW_UP";
    clinicalEpisodeId?: string;
    sourceVisitId?: string;
    followUpIntent?: "EXISTING_CONCERN" | "NEW_CONCERN";
    followUpSnapshot?: JsonValue;
    followUpConfirmations?: JsonValue;
    followUpDelta?: JsonValue;
    aestheticOtherNotes?: string | null; laserOtherNotes?: string | null;
  };
} {
  const draft = normalizeP01Draft(input);
  const routingAnswers = getP01RoutingAnswers(input);
  const fullName = asString(routingAnswers.Q_PROFILE_FULL_NAME);
  const dob = asString(routingAnswers.Q_PROFILE_DOB);
  const gender = asString(routingAnswers.Q_PROFILE_SEX);
  const maritalStatus = asString(draft.answers.Q_PROFILE_MARITAL_STATUS) ?? asString(routingAnswers.Q_PROFILE_MARITAL_STATUS);
  const primary = asString(routingAnswers.Q_VISIT_PRIMARY_REASON);
  const validPrimary = new Set(["RV_HAIR_LOSS","RV_SCALP_SYMPTOMS","RV_HAIR_QUALITY","RV_DERMATOLOGY","RV_LASER","RV_AESTHETIC_PROCEDURES"]);
  if (!fullName || !dob || (gender !== "MALE" && gender !== "FEMALE") || (maritalStatus !== "MARRIED" && maritalStatus !== "NOT_MARRIED") || !primary || !validPrimary.has(primary) || (primary === "RV_HAIR_QUALITY" && gender !== "FEMALE")) throw new Error("P01_DRAFT_NOT_READY");
  const additionalReasonCodes = asStringArray(draft.answers.Q_VISIT_ADDITIONAL_REQUESTS).filter((code) => code !== primary);
  const selectedProcedureCodes = asStringArray(draft.answers.Q_AESTHETIC_PROCEDURES);
  const selectedLaserServiceCodes = asStringArray(draft.answers.Q_LASER_CONCERNS);
  const aestheticDetails = Array.isArray(draft.answers.Q_AESTHETIC_DETAILS) ? draft.answers.Q_AESTHETIC_DETAILS.filter(isRecord) : [];
  const laserDetails = Array.isArray(draft.answers.Q_LASER_CONCERN_DETAILS) ? draft.answers.Q_LASER_CONCERN_DETAILS.filter(isRecord) : [];
  const aestheticOther = aestheticDetails.find((item) => item.id === "AP_OTHER");
  const laserOther = laserDetails.find((item) => item.id === "LASER_OTHER");
  const followUp = draft.followUp;
  const isExistingFollowUp = followUp?.intent === "EXISTING_CONCERN";
  return {
    profile: { fullName, dateOfBirth: new Date(`${dob}T00:00:00.000Z`), gender, maritalStatus },
    visit: {
      primaryReasonCode: primary as "RV_HAIR_LOSS" | "RV_SCALP_SYMPTOMS" | "RV_HAIR_QUALITY" | "RV_DERMATOLOGY" | "RV_LASER" | "RV_AESTHETIC_PROCEDURES",
      additionalReasonCodes, selectedProcedureCodes, selectedLaserServiceCodes,
      visitType: isExistingFollowUp ? "FOLLOW_UP" : "INITIAL",
      ...(isExistingFollowUp && followUp?.selectedEpisodeId ? { clinicalEpisodeId: followUp.selectedEpisodeId } : {}),
      ...(isExistingFollowUp && followUp?.sourceVisitId ? { sourceVisitId: followUp.sourceVisitId } : {}),
      ...(followUp?.intent ? { followUpIntent: followUp.intent } : {}),
      ...(followUp ? { followUpSnapshot: followUp.snapshot as unknown as JsonValue } : {}),
      ...(followUp?.changes ? { followUpConfirmations: followUp.changes as unknown as JsonValue } : {}),
      ...(followUp?.delta ? { followUpDelta: followUp.delta as unknown as JsonValue } : {}),
      ...(typeof aestheticOther?.otherText === "string" ? { aestheticOtherNotes: aestheticOther.otherText } : {}),
      ...(typeof laserOther?.otherText === "string" ? { laserOtherNotes: laserOther.otherText } : {}),
    },
  };
}

export { P01_PATHWAY_CODE };
