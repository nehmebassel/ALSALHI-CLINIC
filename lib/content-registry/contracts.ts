export type QuestionResponseType =
  | "BOOLEAN"
  | "SINGLE_SELECT"
  | "MULTI_SELECT"
  | "TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "INTEGER"
  | "DATE"
  | "MONTH_YEAR"
  | "YEAR"
  | "SCALE";

export type ResponseScopeType =
  | "VISIT"
  | "PATHWAY"
  | "MODULE"
  | "PROCEDURE_SELECTION"
  | "LASER_SERVICE_SELECTION"
  | "MEDICATION_ITEM"
  | "CONDITION_ITEM"
  | "SYMPTOM_ITEM"
  | "EVENT_ITEM"
  | "BODY_AREA"
  | "VISUAL_CLASSIFICATION";

export interface QuestionOptionContract {
  code: string;
  labelAr: string;
  labelEn: string;
  exclusiveWith?: string[];
}

export interface QuestionContract {
  code: string;
  version: string;
  libraryCode: string;
  responseType: QuestionResponseType;
  localized: {
    ar: { label: string; help?: string };
    en: { label: string; help?: string };
  };
  options?: QuestionOptionContract[];
  scope: ResponseScopeType;
  visibility: unknown;
  requiredness: unknown;
  order: number;
  validation: unknown[];
  output: unknown[];
  provenance: {
    baseline: string;
    sourceFile: string;
    sourceSection: string;
  };
  status: "APPROVED" | "DRAFT" | "RETIRED" | "ARCHIVE_ONLY";
}

export interface RegistryValidationIssue {
  questionCode: string;
  field: string;
  message: string;
}

export class RegistryPublicationError extends Error {
  constructor(readonly issues: RegistryValidationIssue[]) {
    super("Question Registry publication validation failed.");
    this.name = "RegistryPublicationError";
  }
}

function isNonBlank(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasExplicitRule(value: unknown): boolean {
  return value !== undefined && value !== null;
}

export function validateQuestionRegistryPublication(
  questions: readonly QuestionContract[],
): void {
  const issues: RegistryValidationIssue[] = [];
  const seenCodes = new Set<string>();

  for (const question of questions) {
    if (seenCodes.has(question.code)) {
      issues.push({
        questionCode: question.code,
        field: "code",
        message: "Question code is duplicated in the ContentVersion.",
      });
    }

    seenCodes.add(question.code);

    const requiredStrings: Array<[string, string | undefined]> = [
      ["code", question.code],
      ["version", question.version],
      ["libraryCode", question.libraryCode],
      ["localized.ar.label", question.localized.ar.label],
      ["localized.en.label", question.localized.en.label],
      ["provenance.baseline", question.provenance.baseline],
      ["provenance.sourceFile", question.provenance.sourceFile],
      ["provenance.sourceSection", question.provenance.sourceSection],
    ];

    for (const [field, value] of requiredStrings) {
      if (!isNonBlank(value)) {
        issues.push({
          questionCode: question.code,
          field,
          message: "A required contract field is blank.",
        });
      }
    }

    for (const [field, rule] of [
      ["visibility", question.visibility],
      ["requiredness", question.requiredness],
    ] as const) {
      if (!hasExplicitRule(rule)) {
        issues.push({
          questionCode: question.code,
          field,
          message: "An explicit rule is required; no default is allowed.",
        });
      }
    }

    if (!Number.isInteger(question.order) || question.order < 0) {
      issues.push({
        questionCode: question.code,
        field: "order",
        message: "Ordering must be an explicit non-negative integer.",
      });
    }

    if (question.status !== "APPROVED") {
      issues.push({
        questionCode: question.code,
        field: "status",
        message: "Only APPROVED definitions may be published.",
      });
    }

    const requiresOptions =
      question.responseType === "SINGLE_SELECT" ||
      question.responseType === "MULTI_SELECT";

    if (requiresOptions && (!question.options || question.options.length === 0)) {
      issues.push({
        questionCode: question.code,
        field: "options",
        message: "Select questions require an approved option set.",
      });
    }

    const seenOptionCodes = new Set<string>();

    for (const option of question.options ?? []) {
      if (
        !isNonBlank(option.code) ||
        !isNonBlank(option.labelAr) ||
        !isNonBlank(option.labelEn)
      ) {
        issues.push({
          questionCode: question.code,
          field: "options",
          message: "Each option requires a code and both translations.",
        });
      }

      if (seenOptionCodes.has(option.code)) {
        issues.push({
          questionCode: question.code,
          field: "options.code",
          message: "Option code is duplicated within the question.",
        });
      }

      seenOptionCodes.add(option.code);
    }
  }

  if (issues.length > 0) {
    throw new RegistryPublicationError(issues);
  }
}
