import { isValidApproxDateValue } from "@/lib/p01/clinical-date";
import { P01_QUESTION_CONTRACTS, type P01QuestionContract } from "@/lib/p01/contracts";
import { getFollowUpLifecycle } from "@/lib/follow-up/lifecycle";
import { selectedEpisodeState, type FollowUpDeltaState, type P01FollowUpContext } from "@/lib/follow-up/types";
import type { JsonValue } from "@/lib/patient-access/service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selected(value: JsonValue | undefined, code: string): boolean {
  return Array.isArray(value) && value.some((item) => item === code);
}

function answerEquals(value: JsonValue | undefined, expected: string): boolean {
  return value === expected;
}

function answerIn(value: JsonValue | undefined, expected: string[]): boolean {
  return typeof value === "string" && expected.includes(value);
}

/**
 * Follow-up detail visibility intentionally supports only the rule shapes used by
 * the approved Women's/Men's Health contracts. Section/pathway gates are treated
 * as already satisfied because this helper is called only inside the applicable
 * Hair Loss follow-up domain for the patient's recorded sex.
 */
function ruleVisible(rule: unknown, answers: Record<string, JsonValue>): boolean {
  if (!isRecord(rule)) return false;
  switch (rule.kind) {
    case "ALL_OF":
      return Array.isArray(rule.rules) && rule.rules.every((child) => ruleVisible(child, answers));
    case "ALWAYS":
    case "SEX_AND_HAIR_ACTIVE":
    case "HAIR_MODULE_ACTIVE":
    case "HAIR_SCALP_PATHWAY_ACTIVE":
      return true;
    case "SELECTED":
      return typeof rule.questionCode === "string" && typeof rule.optionCode === "string"
        ? selected(answers[rule.questionCode], rule.optionCode)
        : false;
    case "ANSWER_EQUALS":
      return typeof rule.questionCode === "string" && typeof rule.value === "string"
        ? answerEquals(answers[rule.questionCode], rule.value)
        : false;
    case "ANSWER_IN":
      return typeof rule.questionCode === "string" && Array.isArray(rule.values)
        ? answerIn(answers[rule.questionCode], rule.values.filter((item): item is string => typeof item === "string"))
        : false;
    default:
      return false;
  }
}

function hasAnswerDependency(rule: unknown): boolean {
  if (!isRecord(rule)) return false;
  if (["SELECTED", "ANSWER_EQUALS", "ANSWER_IN"].includes(String(rule.kind))) return true;
  return rule.kind === "ALL_OF" && Array.isArray(rule.rules) && rule.rules.some(hasAnswerDependency);
}

function mainQuestionCode(sex: "MALE" | "FEMALE"): "Q_WOMENS_HEALTH" | "Q_MENS_HEALTH" {
  return sex === "FEMALE" ? "Q_WOMENS_HEALTH" : "Q_MENS_HEALTH";
}

function sectionCode(sex: "MALE" | "FEMALE"): "WOMENS_HEALTH" | "MENS_HEALTH" {
  return sex === "FEMALE" ? "WOMENS_HEALTH" : "MENS_HEALTH";
}

export function allowedFollowUpSexSpecificQuestionCodes(): Set<string> {
  return new Set(P01_QUESTION_CONTRACTS.filter((contract) =>
    (contract.sectionCode === "WOMENS_HEALTH" || contract.sectionCode === "MENS_HEALTH") &&
    contract.code !== "Q_WOMENS_HEALTH" && contract.code !== "Q_MENS_HEALTH" &&
    getFollowUpLifecycle(contract.code) === "SINCE_LAST_VISIT_EVENT"
  ).map((contract) => contract.code));
}

export function visibleFollowUpSexSpecificContracts(input: {
  sex: "MALE" | "FEMALE";
  affectedCodes: string[];
  responses: Record<string, JsonValue>;
  physicianRoutedQuestionCodes?: string[];
}): P01QuestionContract[] {
  const main = mainQuestionCode(input.sex);
  const answers: Record<string, JsonValue> = {
    ...input.responses,
    [main]: input.affectedCodes,
  };
  const routed = new Set(input.physicianRoutedQuestionCodes ?? []);

  return P01_QUESTION_CONTRACTS
    .filter((contract) => contract.sectionCode === sectionCode(input.sex))
    .filter((contract) => contract.code !== main)
    // Historical onset/history fields never re-enter the patient follow-up.
    .filter((contract) => getFollowUpLifecycle(contract.code) === "SINCE_LAST_VISIT_EVENT")
    // Standalone initial-intake questions are not repeated unless the physician
    // explicitly routed that governed code for the next visit. Dependent branch
    // details may appear when their approved parent answer is selected.
    .filter((contract) => routed.has(contract.code) || hasAnswerDependency(contract.visibility))
    .filter((contract) => ruleVisible(contract.visibility, answers))
    .sort((a, b) => a.order - b.order);
}

function isRequired(contract: P01QuestionContract): boolean {
  return !(isRecord(contract.requiredness) && contract.requiredness.kind === "OPTIONAL");
}

function validationBounds(contract: P01QuestionContract): { minLength?: number; maxLength?: number; minSelections?: number } {
  const bounds: { minLength?: number; maxLength?: number; minSelections?: number } = {};
  for (const rule of contract.validation) {
    if (!isRecord(rule)) continue;
    if (typeof rule.minLength === "number") bounds.minLength = rule.minLength;
    if (typeof rule.maxLength === "number") bounds.maxLength = rule.maxLength;
    if (typeof rule.minSelections === "number") bounds.minSelections = rule.minSelections;
  }
  return bounds;
}

export function validFollowUpSexSpecificValue(contract: P01QuestionContract, value: JsonValue | undefined): boolean {
  if (value === undefined || value === null || value === "") return !isRequired(contract);
  const optionCodes = new Set((contract.options ?? []).map((option) => option.code));
  const bounds = validationBounds(contract);

  switch (contract.responseType) {
    case "BOOLEAN":
    case "SINGLE_SELECT":
      return typeof value === "string" && optionCodes.has(value);
    case "MULTI_SELECT":
      return Array.isArray(value) &&
        value.length >= (bounds.minSelections ?? 1) &&
        value.every((item) => typeof item === "string" && optionCodes.has(item));
    case "TEXT":
    case "LONG_TEXT": {
      if (typeof value !== "string") return false;
      const length = value.trim().length;
      return length >= (bounds.minLength ?? 1) && length <= (bounds.maxLength ?? Number.POSITIVE_INFINITY);
    }
    case "MONTH_YEAR":
    case "YEAR":
    case "DATE":
      return isValidApproxDateValue(value);
    case "NUMBER":
    case "INTEGER":
    case "SCALE":
      return typeof value === "number" || (typeof value === "string" && value.trim().length > 0);
  }
}

export function followUpSexSpecificCompletionIssues(
  context: P01FollowUpContext | null | undefined,
  delta: FollowUpDeltaState | undefined,
): string[] {
  if (!context || context.changes?.sexSpecific !== "CHANGED") return [];
  const state = delta?.sexSpecific;
  if (!state || state.affectedCodes.length === 0) return ["sexSpecific"];

  const main = P01_QUESTION_CONTRACTS.find((contract) => contract.code === mainQuestionCode(context.identity.sex));
  const allowedMain = new Set((main?.options ?? []).filter((option) => option.code !== "NONE").map((option) => option.code));
  if (state.affectedCodes.some((code) => !allowedMain.has(code))) return ["sexSpecific"];

  const episode = selectedEpisodeState(context);
  const visible = visibleFollowUpSexSpecificContracts({
    sex: context.identity.sex,
    affectedCodes: state.affectedCodes,
    responses: state.responses,
    physicianRoutedQuestionCodes: episode?.physicianRoutedQuestionCodes,
  });
  return visible
    .filter((contract) => !validFollowUpSexSpecificValue(contract, state.responses[contract.code]))
    .map((contract) => `sexSpecific:${contract.code}`);
}
