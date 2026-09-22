export const PHYSICIAN_PROCEDURE_CODES = [
  "PRP",
  "MICRONEEDLING",
  "HAIR_LASER",
  "RED_LIGHT",
  "MINOXIDIL_INJ",
  "DUTASTERIDE_INJ",
  "EXOSOME",
  "CORTISONE_INJ",
  "REGENERA",
  "ACELL",
  "HAIR_TRANSPLANT",
  "OTHER",
] as const;

export const PATIENT_CONTEXT_DEFINITION_CODES = [
  "MARITAL_SOCIAL_STATUS",
  "CONTRACEPTIVE_USE",
  "PREGNANCY_BREASTFEEDING_CONTEXT",
  "PREVIOUSLY_DIAGNOSED_CONDITIONS",
  "CURRENT_MEDICATIONS",
  "ALLERGIES",
  "PREVIOUS_HAIR_THERAPIES",
  "CURRENT_HAIR_THERAPIES",
] as const;

export const LONGITUDINAL_TEXT_MAX_LENGTH = 16_000;
export const LONGITUDINAL_MAX_DECISIONS_PER_DOMAIN = 128;

export type PhysicianProcedureCode = (typeof PHYSICIAN_PROCEDURE_CODES)[number];
export type PatientContextDefinitionCode =
  (typeof PATIENT_CONTEXT_DEFINITION_CODES)[number];

export type DiagnosisDraftDecision =
  | { action: "ADD"; text: string }
  | { action: "REVISE"; diagnosisId: string; text: string }
  | { action: "RESOLVE"; diagnosisId: string };

export type TreatmentDraftDecision =
  | {
      action: "START";
      name: string;
      regimenText?: string;
      noteText?: string;
    }
  | {
      action: "CONTINUE_EXISTING";
      treatmentCourseId: string;
      noteText?: string;
    }
  | {
      action: "MODIFY";
      treatmentCourseId: string;
      name?: string;
      regimenText?: string | null;
      noteText?: string | null;
    }
  | { action: "STOP"; treatmentCourseId: string };

export type ProcedureDraftDecision =
  | {
      action: "PLAN";
      procedureCode: PhysicianProcedureCode;
      otherProcedureText?: string;
      plannedDate?: string;
      noteText?: string;
    }
  | {
      action: "PERFORM";
      procedurePlanId?: string;
      procedureCode?: PhysicianProcedureCode;
      otherProcedureText?: string;
      performedDate: string;
      noteText?: string;
    }
  | {
      action: "CANCEL_OR_DEFER";
      procedurePlanId: string;
      noteText?: string;
    };

export interface GovernedPhysicianLongitudinalDraft {
  diagnoses?: DiagnosisDraftDecision[];
  treatments?: TreatmentDraftDecision[];
  procedures?: ProcedureDraftDecision[];
}

export type LongitudinalCorrectionCommand =
  | {
      target: "DIAGNOSIS_DECISION";
      decisionId: string;
      operation: "SET_CONTENT";
      value: { text: string };
    }
  | {
      target: "DIAGNOSIS_DECISION";
      decisionId: string;
      operation: "OMIT";
      replacement?: DiagnosisDraftDecision;
    }
  | {
      target: "TREATMENT_DECISION";
      decisionId: string;
      operation: "SET_CONTENT";
      value: {
        name?: string;
        regimenText?: string | null;
        noteText?: string | null;
      };
    }
  | {
      target: "TREATMENT_DECISION";
      decisionId: string;
      operation: "OMIT";
      replacement?: TreatmentDraftDecision;
    }
  | {
      target: "PROCEDURE_DECISION";
      decisionId: string;
      operation: "SET_CONTENT";
      value: {
        procedureCode?: PhysicianProcedureCode;
        otherProcedureText?: string | null;
        plannedDate?: string | null;
        performedDate?: string;
        noteText?: string | null;
      };
    }
  | {
      target: "PROCEDURE_DECISION";
      decisionId: string;
      operation: "OMIT";
      replacement?: ProcedureDraftDecision;
    };

export class PhysicianLongitudinalContractError extends Error {
  constructor() {
    super("The governed physician longitudinal data is invalid.");
    this.name = "PhysicianLongitudinalContractError";
  }
}

function invalid(): never {
  throw new PhysicianLongitudinalContractError();
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) invalid();
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    invalid();
  }
  return value;
}

function text(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > LONGITUDINAL_TEXT_MAX_LENGTH
  ) {
    invalid();
  }
  return value;
}

function optionalText(value: unknown): string | undefined {
  return value === undefined ? undefined : text(value);
}

function nullableText(value: unknown): string | null | undefined {
  return value === undefined ? undefined : value === null ? null : text(value);
}

export function parseIsoClinicalDate(value: unknown): string {
  if (typeof value !== "string") invalid();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) invalid();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    invalid();
  }
  return value;
}

function procedureCode(value: unknown): PhysicianProcedureCode {
  if (
    typeof value !== "string" ||
    !PHYSICIAN_PROCEDURE_CODES.includes(value as PhysicianProcedureCode)
  ) {
    invalid();
  }
  return value as PhysicianProcedureCode;
}

function assertOtherProcedure(
  code: PhysicianProcedureCode,
  otherProcedureText: string | null | undefined,
) {
  if (code === "OTHER" ? !otherProcedureText : otherProcedureText !== undefined && otherProcedureText !== null) {
    invalid();
  }
}

export function parseDiagnosisDecision(value: unknown): DiagnosisDraftDecision {
  const decision = object(value);
  if (decision.action === "ADD") {
    exactKeys(decision, ["action", "text"]);
    return { action: "ADD", text: text(decision.text) };
  }
  if (decision.action === "REVISE") {
    exactKeys(decision, ["action", "diagnosisId", "text"]);
    return {
      action: "REVISE",
      diagnosisId: uuid(decision.diagnosisId),
      text: text(decision.text),
    };
  }
  if (decision.action === "RESOLVE") {
    exactKeys(decision, ["action", "diagnosisId"]);
    return { action: "RESOLVE", diagnosisId: uuid(decision.diagnosisId) };
  }
  return invalid();
}

export function parseTreatmentDecision(value: unknown): TreatmentDraftDecision {
  const decision = object(value);
  if (decision.action === "START") {
    exactKeys(decision, ["action", "name", "regimenText", "noteText"]);
    return {
      action: "START",
      name: text(decision.name),
      ...(decision.regimenText !== undefined
        ? { regimenText: text(decision.regimenText) }
        : {}),
      ...(decision.noteText !== undefined ? { noteText: text(decision.noteText) } : {}),
    };
  }
  if (decision.action === "CONTINUE_EXISTING") {
    exactKeys(decision, ["action", "treatmentCourseId", "noteText"]);
    return {
      action: "CONTINUE_EXISTING",
      treatmentCourseId: uuid(decision.treatmentCourseId),
      ...(decision.noteText !== undefined ? { noteText: text(decision.noteText) } : {}),
    };
  }
  if (decision.action === "MODIFY") {
    exactKeys(decision, [
      "action",
      "treatmentCourseId",
      "name",
      "regimenText",
      "noteText",
    ]);
    if (
      decision.name === undefined &&
      decision.regimenText === undefined &&
      decision.noteText === undefined
    ) {
      invalid();
    }
    return {
      action: "MODIFY",
      treatmentCourseId: uuid(decision.treatmentCourseId),
      ...(decision.name !== undefined ? { name: text(decision.name) } : {}),
      ...(decision.regimenText !== undefined
        ? { regimenText: nullableText(decision.regimenText)! }
        : {}),
      ...(decision.noteText !== undefined
        ? { noteText: nullableText(decision.noteText)! }
        : {}),
    };
  }
  if (decision.action === "STOP") {
    exactKeys(decision, ["action", "treatmentCourseId"]);
    return { action: "STOP", treatmentCourseId: uuid(decision.treatmentCourseId) };
  }
  return invalid();
}

export function parseProcedureDecision(value: unknown): ProcedureDraftDecision {
  const decision = object(value);
  if (decision.action === "PLAN") {
    exactKeys(decision, [
      "action",
      "procedureCode",
      "otherProcedureText",
      "plannedDate",
      "noteText",
    ]);
    const code = procedureCode(decision.procedureCode);
    const other = optionalText(decision.otherProcedureText);
    assertOtherProcedure(code, other);
    return {
      action: "PLAN",
      procedureCode: code,
      ...(other !== undefined ? { otherProcedureText: other } : {}),
      ...(decision.plannedDate !== undefined
        ? { plannedDate: parseIsoClinicalDate(decision.plannedDate) }
        : {}),
      ...(decision.noteText !== undefined ? { noteText: text(decision.noteText) } : {}),
    };
  }
  if (decision.action === "PERFORM") {
    exactKeys(decision, [
      "action",
      "procedurePlanId",
      "procedureCode",
      "otherProcedureText",
      "performedDate",
      "noteText",
    ]);
    const planId = decision.procedurePlanId === undefined
      ? undefined
      : uuid(decision.procedurePlanId);
    const code = decision.procedureCode === undefined
      ? undefined
      : procedureCode(decision.procedureCode);
    if (!planId && !code) invalid();
    const other = optionalText(decision.otherProcedureText);
    if (code) assertOtherProcedure(code, other);
    else if (other !== undefined) invalid();
    return {
      action: "PERFORM",
      ...(planId ? { procedurePlanId: planId } : {}),
      ...(code ? { procedureCode: code } : {}),
      ...(other !== undefined ? { otherProcedureText: other } : {}),
      performedDate: parseIsoClinicalDate(decision.performedDate),
      ...(decision.noteText !== undefined ? { noteText: text(decision.noteText) } : {}),
    };
  }
  if (decision.action === "CANCEL_OR_DEFER") {
    exactKeys(decision, ["action", "procedurePlanId", "noteText"]);
    return {
      action: "CANCEL_OR_DEFER",
      procedurePlanId: uuid(decision.procedurePlanId),
      ...(decision.noteText !== undefined ? { noteText: text(decision.noteText) } : {}),
    };
  }
  return invalid();
}

function decisions<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (
    !Array.isArray(value) ||
    value.length > LONGITUDINAL_MAX_DECISIONS_PER_DOMAIN
  ) {
    invalid();
  }
  return value.map(parse);
}

export function parseDiagnosisSection(value: unknown): DiagnosisDraftDecision[] {
  const section = object(value);
  exactKeys(section, ["decisions"]);
  if (!("decisions" in section)) invalid();
  return decisions(section.decisions, parseDiagnosisDecision);
}

export function parseTreatmentProceduresSection(value: unknown): {
  treatments: TreatmentDraftDecision[];
  procedures: ProcedureDraftDecision[];
} {
  const section = object(value);
  exactKeys(section, ["treatments", "procedures"]);
  return {
    treatments:
      section.treatments === undefined
        ? []
        : decisions(section.treatments, parseTreatmentDecision),
    procedures:
      section.procedures === undefined
        ? []
        : decisions(section.procedures, parseProcedureDecision),
  };
}

export function parseLongitudinalDraftSections(
  sections: Record<string, unknown>,
): GovernedPhysicianLongitudinalDraft {
  const diagnosis = sections.DIAGNOSIS === undefined
    ? undefined
    : parseDiagnosisSection(sections.DIAGNOSIS);
  const treatmentProcedures = sections.TREATMENT_PROCEDURES === undefined
    ? undefined
    : parseTreatmentProceduresSection(sections.TREATMENT_PROCEDURES);
  return {
    ...(diagnosis ? { diagnoses: diagnosis } : {}),
    ...(treatmentProcedures
      ? {
          treatments: treatmentProcedures.treatments,
          procedures: treatmentProcedures.procedures,
        }
      : {}),
  };
}

export function parsePatientContextReviewCommand(value: unknown): {
  contextFingerprint: string;
} {
  const body = object(value);
  exactKeys(body, ["contextFingerprint"]);
  if (
    typeof body.contextFingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(body.contextFingerprint)
  ) {
    invalid();
  }
  return { contextFingerprint: body.contextFingerprint };
}

export function parsePatientContextReconciliationCommand(value: unknown): {
  contextFingerprint: string;
  contextItemId: string;
} {
  const body = object(value);
  exactKeys(body, ["contextFingerprint", "contextItemId"]);
  return {
    ...parsePatientContextReviewCommand({
      contextFingerprint: body.contextFingerprint,
    }),
    contextItemId: uuid(body.contextItemId),
  };
}

export function parseLongitudinalCorrectionCommand(
  value: unknown,
): LongitudinalCorrectionCommand {
  const body = object(value);
  if (
    body.target !== "DIAGNOSIS_DECISION" &&
    body.target !== "TREATMENT_DECISION" &&
    body.target !== "PROCEDURE_DECISION"
  ) {
    invalid();
  }
  const decisionId = uuid(body.decisionId);
  if (body.operation === "OMIT") {
    exactKeys(body, ["target", "decisionId", "operation", "replacement"]);
    const replacement = body.replacement === undefined
      ? undefined
      : body.target === "DIAGNOSIS_DECISION"
        ? parseDiagnosisDecision(body.replacement)
        : body.target === "TREATMENT_DECISION"
          ? parseTreatmentDecision(body.replacement)
          : parseProcedureDecision(body.replacement);
    return {
      target: body.target,
      decisionId,
      operation: "OMIT",
      ...(replacement ? { replacement } : {}),
    } as LongitudinalCorrectionCommand;
  }
  if (body.operation !== "SET_CONTENT") invalid();
  exactKeys(body, ["target", "decisionId", "operation", "value"]);
  const content = object(body.value);
  if (body.target === "DIAGNOSIS_DECISION") {
    exactKeys(content, ["text"]);
    return {
      target: body.target,
      decisionId,
      operation: "SET_CONTENT",
      value: { text: text(content.text) },
    };
  }
  if (body.target === "TREATMENT_DECISION") {
    exactKeys(content, ["name", "regimenText", "noteText"]);
    if (
      content.name === undefined &&
      content.regimenText === undefined &&
      content.noteText === undefined
    ) {
      invalid();
    }
    return {
      target: body.target,
      decisionId,
      operation: "SET_CONTENT",
      value: {
        ...(content.name !== undefined ? { name: text(content.name) } : {}),
        ...(content.regimenText !== undefined
          ? { regimenText: nullableText(content.regimenText)! }
          : {}),
        ...(content.noteText !== undefined
          ? { noteText: nullableText(content.noteText)! }
          : {}),
      },
    };
  }
  exactKeys(content, [
    "procedureCode",
    "otherProcedureText",
    "plannedDate",
    "performedDate",
    "noteText",
  ]);
  if (Object.keys(content).length === 0) invalid();
  return {
    target: body.target,
    decisionId,
    operation: "SET_CONTENT",
    value: {
      ...(content.procedureCode !== undefined
        ? { procedureCode: procedureCode(content.procedureCode) }
        : {}),
      ...(content.otherProcedureText !== undefined
        ? { otherProcedureText: nullableText(content.otherProcedureText)! }
        : {}),
      ...(content.plannedDate !== undefined
        ? {
            plannedDate:
              content.plannedDate === null
                ? null
                : parseIsoClinicalDate(content.plannedDate),
          }
        : {}),
      ...(content.performedDate !== undefined
        ? { performedDate: parseIsoClinicalDate(content.performedDate) }
        : {}),
      ...(content.noteText !== undefined
        ? { noteText: nullableText(content.noteText)! }
        : {}),
    },
  };
}
