export interface ChronologicalDecisionVisit {
  visitId: string;
  physicianVisitRecordId: string;
  visitOccurredAt: Date;
  diagnoses: Array<{
    id: string;
    diagnosisId: string;
    action: "ADD" | "REVISE" | "RESOLVE";
    text: string | null;
    decisionOrder: number;
  }>;
  treatments: Array<{
    id: string;
    treatmentCourseId: string;
    action: "START" | "CONTINUE_EXISTING" | "MODIFY" | "STOP";
    name: string | null;
    regimenText: string | null;
    noteText: string | null;
    setsName: boolean;
    setsRegimen: boolean;
    setsNote: boolean;
    decisionOrder: number;
  }>;
  procedures: Array<{
    id: string;
    procedurePlanId: string | null;
    action: "PLAN" | "PERFORM" | "CANCEL_OR_DEFER";
    procedureCode:
      | "PRP"
      | "MICRONEEDLING"
      | "HAIR_LASER"
      | "RED_LIGHT"
      | "MINOXIDIL_INJ"
      | "DUTASTERIDE_INJ"
      | "EXOSOME"
      | "CORTISONE_INJ"
      | "REGENERA"
      | "ACELL"
      | "HAIR_TRANSPLANT"
      | "OTHER"
      | null;
    otherProcedureText: string | null;
    plannedDate: Date | null;
    performedDate: Date | null;
    noteText: string | null;
    decisionOrder: number;
  }>;
}

export interface EffectiveDiagnosis {
  diagnosisId: string;
  text: string;
  status: "ACTIVE" | "RESOLVED";
  originVisitId: string;
  latestDecisionVisitId: string;
  latestDecisionId: string;
}

export interface EffectiveTreatmentCourse {
  treatmentCourseId: string;
  name: string;
  regimenText?: string;
  noteText?: string;
  status: "ACTIVE" | "STOPPED";
  originVisitId: string;
  latestDecisionVisitId: string;
  latestDecisionId: string;
}

export interface EffectiveProcedurePlan {
  procedurePlanId: string;
  procedureCode: NonNullable<
    ChronologicalDecisionVisit["procedures"][number]["procedureCode"]
  >;
  otherProcedureText?: string;
  plannedDate?: string;
  noteText?: string;
  status: "OPEN" | "FULFILLED" | "CANCELLED_OR_DEFERRED";
  originVisitId: string;
  latestDecisionVisitId: string;
  latestDecisionId: string;
}

export interface EffectiveProcedureEvent {
  procedureDecisionId: string;
  procedurePlanId?: string;
  procedureCode: NonNullable<
    ChronologicalDecisionVisit["procedures"][number]["procedureCode"]
  >;
  otherProcedureText?: string;
  performedDate: string;
  noteText?: string;
  visitId: string;
}

export interface EffectivePhysicianState {
  diagnoses: EffectiveDiagnosis[];
  treatmentCourses: EffectiveTreatmentCourse[];
  procedurePlans: EffectiveProcedurePlan[];
  performedProcedures: EffectiveProcedureEvent[];
}

export class LongitudinalReplayError extends Error {
  constructor(
    readonly code:
      | "INVALID_LONGITUDINAL_TARGET"
      | "LONGITUDINAL_DECISION_CONFLICT",
    readonly decisionId: string,
  ) {
    super(code);
    this.name = "LongitudinalReplayError";
  }
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function compareLongitudinalVisits(
  left: ChronologicalDecisionVisit,
  right: ChronologicalDecisionVisit,
): number {
  const byTime = left.visitOccurredAt.getTime() - right.visitOccurredAt.getTime();
  return byTime || (left.visitId < right.visitId ? -1 : left.visitId > right.visitId ? 1 : 0);
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function projectEffectivePhysicianState(
  input: ChronologicalDecisionVisit[],
): EffectivePhysicianState {
  const diagnoses = new Map<string, EffectiveDiagnosis>();
  const treatments = new Map<string, EffectiveTreatmentCourse>();
  const plans = new Map<string, EffectiveProcedurePlan>();
  const performed: EffectiveProcedureEvent[] = [];

  for (const visit of [...input].sort(compareLongitudinalVisits)) {
    for (const decision of [...visit.diagnoses].sort(
      (left, right) => left.decisionOrder - right.decisionOrder || compareIds(left.id, right.id),
    )) {
      const current = diagnoses.get(decision.diagnosisId);
      if (decision.action === "ADD") {
        if (current || !decision.text) {
          throw new LongitudinalReplayError("LONGITUDINAL_DECISION_CONFLICT", decision.id);
        }
        diagnoses.set(decision.diagnosisId, {
          diagnosisId: decision.diagnosisId,
          text: decision.text,
          status: "ACTIVE",
          originVisitId: visit.visitId,
          latestDecisionVisitId: visit.visitId,
          latestDecisionId: decision.id,
        });
      } else {
        if (!current || current.status !== "ACTIVE") {
          throw new LongitudinalReplayError("INVALID_LONGITUDINAL_TARGET", decision.id);
        }
        diagnoses.set(decision.diagnosisId, {
          ...current,
          ...(decision.action === "REVISE" ? { text: decision.text! } : {}),
          ...(decision.action === "RESOLVE" ? { status: "RESOLVED" as const } : {}),
          latestDecisionVisitId: visit.visitId,
          latestDecisionId: decision.id,
        });
      }
    }

    for (const decision of [...visit.treatments].sort(
      (left, right) => left.decisionOrder - right.decisionOrder || compareIds(left.id, right.id),
    )) {
      const current = treatments.get(decision.treatmentCourseId);
      if (decision.action === "START") {
        if (current || !decision.name) {
          throw new LongitudinalReplayError("LONGITUDINAL_DECISION_CONFLICT", decision.id);
        }
        treatments.set(decision.treatmentCourseId, {
          treatmentCourseId: decision.treatmentCourseId,
          name: decision.name,
          ...(decision.regimenText !== null ? { regimenText: decision.regimenText } : {}),
          ...(decision.noteText !== null ? { noteText: decision.noteText } : {}),
          status: "ACTIVE",
          originVisitId: visit.visitId,
          latestDecisionVisitId: visit.visitId,
          latestDecisionId: decision.id,
        });
        continue;
      }
      if (!current || current.status !== "ACTIVE") {
        throw new LongitudinalReplayError("INVALID_LONGITUDINAL_TARGET", decision.id);
      }
      const next: EffectiveTreatmentCourse = {
        ...current,
        latestDecisionVisitId: visit.visitId,
        latestDecisionId: decision.id,
      };
      if (decision.action === "MODIFY") {
        if (decision.setsName) next.name = decision.name!;
        if (decision.setsRegimen) {
          if (decision.regimenText === null) delete next.regimenText;
          else next.regimenText = decision.regimenText;
        }
        if (decision.setsNote) {
          if (decision.noteText === null) delete next.noteText;
          else next.noteText = decision.noteText;
        }
      } else if (decision.action === "CONTINUE_EXISTING" && decision.setsNote) {
        if (decision.noteText === null) delete next.noteText;
        else next.noteText = decision.noteText;
      } else if (decision.action === "STOP") {
        next.status = "STOPPED";
      }
      treatments.set(decision.treatmentCourseId, next);
    }

    for (const decision of [...visit.procedures].sort(
      (left, right) => left.decisionOrder - right.decisionOrder || compareIds(left.id, right.id),
    )) {
      if (decision.action === "PLAN") {
        if (!decision.procedurePlanId || !decision.procedureCode || plans.has(decision.procedurePlanId)) {
          throw new LongitudinalReplayError("LONGITUDINAL_DECISION_CONFLICT", decision.id);
        }
        plans.set(decision.procedurePlanId, {
          procedurePlanId: decision.procedurePlanId,
          procedureCode: decision.procedureCode,
          ...(decision.otherProcedureText !== null
            ? { otherProcedureText: decision.otherProcedureText }
            : {}),
          ...(decision.plannedDate ? { plannedDate: isoDate(decision.plannedDate) } : {}),
          ...(decision.noteText !== null ? { noteText: decision.noteText } : {}),
          status: "OPEN",
          originVisitId: visit.visitId,
          latestDecisionVisitId: visit.visitId,
          latestDecisionId: decision.id,
        });
        continue;
      }
      if (decision.action === "CANCEL_OR_DEFER") {
        const plan = decision.procedurePlanId
          ? plans.get(decision.procedurePlanId)
          : undefined;
        if (!plan || plan.status !== "OPEN") {
          throw new LongitudinalReplayError("INVALID_LONGITUDINAL_TARGET", decision.id);
        }
        plans.set(plan.procedurePlanId, {
          ...plan,
          ...(decision.noteText !== null ? { noteText: decision.noteText } : {}),
          status: "CANCELLED_OR_DEFERRED",
          latestDecisionVisitId: visit.visitId,
          latestDecisionId: decision.id,
        });
        continue;
      }
      if (!decision.procedureCode || !decision.performedDate) {
        throw new LongitudinalReplayError("LONGITUDINAL_DECISION_CONFLICT", decision.id);
      }
      if (decision.procedurePlanId) {
        const plan = plans.get(decision.procedurePlanId);
        if (
          !plan ||
          plan.status !== "OPEN" ||
          plan.procedureCode !== decision.procedureCode
        ) {
          throw new LongitudinalReplayError("INVALID_LONGITUDINAL_TARGET", decision.id);
        }
        plans.set(plan.procedurePlanId, {
          ...plan,
          status: "FULFILLED",
          latestDecisionVisitId: visit.visitId,
          latestDecisionId: decision.id,
        });
      }
      performed.push({
        procedureDecisionId: decision.id,
        ...(decision.procedurePlanId ? { procedurePlanId: decision.procedurePlanId } : {}),
        procedureCode: decision.procedureCode,
        ...(decision.otherProcedureText !== null
          ? { otherProcedureText: decision.otherProcedureText }
          : {}),
        performedDate: isoDate(decision.performedDate),
        ...(decision.noteText !== null ? { noteText: decision.noteText } : {}),
        visitId: visit.visitId,
      });
    }
  }

  return {
    diagnoses: [...diagnoses.values()],
    treatmentCourses: [...treatments.values()],
    procedurePlans: [...plans.values()],
    performedProcedures: performed,
  };
}
