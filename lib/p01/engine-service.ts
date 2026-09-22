import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import type { EvaluatedOfficialState } from "@/lib/submission/service";
import { getPrismaClient } from "@/lib/prisma";
import {
  P01_CONTENT_VERSION,
  P01_PATHWAY_CODES,
  getP01QuestionCodes,
} from "@/lib/p01/contracts";
import {
  evaluateP01Draft,
  getP01OfficialQuestionValues,
  getP01RoutingAnswers,
  type P01Evaluation,
} from "@/lib/p01/engine";
import type { PatientInputJson } from "@/lib/patient-access/service";

const RULE_HAIR_TO_SCALP = "RULE_HAIR_TO_SCALP";
const RULE_SCALP_TO_HAIR = "RULE_SCALP_TO_HAIR";

export class P01EngineService {
  constructor(
    private readonly prisma: PrismaClient = getPrismaClient(),
  ) {}

  async evaluateForClient(input: {
    contentVersionId: string;
    patientInputJson: PatientInputJson;
    referenceDate?: Date;
  }): Promise<P01Evaluation> {
    const evaluation = evaluateP01Draft(input.patientInputJson, input.referenceDate);
    const configurationValid = await this.assertPublishedConfiguration(
      input.contentVersionId,
    );

    if (configurationValid) {
      return evaluation;
    }

    return {
      ...evaluation,
      state: "CONFIGURATION_ERROR",
      issues: [
        ...evaluation.issues,
        {
          code: "CONFIGURATION_ERROR",
          questionCode: "CONTENT_VERSION",
          messageAr: "إصدار المحتوى المثبت غير مكتمل أو غير منشور.",
          messageEn:
            "The pinned content version is incomplete or unpublished.",
        },
      ],
      firstIncompleteSection:
        evaluation.firstIncompleteSection ?? "PRIVACY",
    };
  }

  async evaluateOfficialState(input: {
    draftId: string;
    contentVersionId: string;
    patientInputJson: PatientInputJson;
  }): Promise<EvaluatedOfficialState> {
    const evaluation = await this.evaluateForClient(input);
    if (evaluation.state !== "READY") {
      return {
        state:
          evaluation.state === "CONFIGURATION_ERROR"
            ? "CONFIGURATION_ERROR"
            : "UNKNOWN",
        activePathwayDefinitionIds: [],
        activeLibraryIds: [],
        questionResponses: [],
        routingEvaluations: [],
      };
    }

    const officialValues = getP01OfficialQuestionValues(
      input.patientInputJson,
    );
    const questionCodes = [
      ...new Set(officialValues.map(({ questionCode }) => questionCode)),
    ];
    const routingAnswers = getP01RoutingAnswers(input.patientInputJson);
    const sex = routingAnswers.Q_PROFILE_SEX;
    const activeLibraryCodes = [
      "PATIENT_PROFILE",
      "VISIT_CONTEXT",
      "MEDICAL_HISTORY",
      ...(evaluation.activeModules.hairLoss || evaluation.activeModules.scalp ? ["HAIR_SCALP_SHARED"] : []),
      ...(evaluation.activeModules.hairLoss ? ["HAIR_LOSS"] : []),
      ...(evaluation.activeModules.scalp ? ["SCALP"] : []),
      ...(evaluation.activeModules.hairQuality ? ["HAIR_QUALITY"] : []),
      ...(evaluation.activeModules.lifestyleNutrition ? ["LIFESTYLE_NUTRITION"] : []),
      ...(evaluation.activeModules.hairLoss && sex === "FEMALE" ? ["WOMENS_HEALTH"] : []),
      ...(evaluation.activeModules.hairLoss && sex === "MALE" ? ["MENS_HEALTH"] : []),
      ...(sex === "FEMALE" ? ["PREGNANCY_CONTEXT"] : []),
      ...(evaluation.activeModules.dermatology ? ["DERMATOLOGY"] : []),
      ...(evaluation.activeModules.laser ? ["LASER"] : []),
      ...(evaluation.activeModules.aesthetic ? ["AESTHETIC_PROCEDURES"] : []),
    ];
    const activePathwayCodes = [
      ...(evaluation.activeModules.hairLoss || evaluation.activeModules.scalp ? [P01_PATHWAY_CODES.hairScalp] : []),
      ...(evaluation.activeModules.hairQuality ? [P01_PATHWAY_CODES.hairQuality] : []),
      ...(evaluation.activeModules.dermatology ? [P01_PATHWAY_CODES.dermatology] : []),
      ...(evaluation.activeModules.laser ? [P01_PATHWAY_CODES.laser] : []),
      ...(evaluation.activeModules.aesthetic ? [P01_PATHWAY_CODES.aesthetic] : []),
    ];

    const [pathways, libraries, questions, rules] = await Promise.all([
      this.prisma.clinicalPathwayDefinition.findMany({
        where: {
          contentVersionId: input.contentVersionId,
          code: { in: activePathwayCodes },
          isActive: true,
        },
        select: { id: true, code: true },
      }),
      this.prisma.clinicalLibrary.findMany({
        where: {
          contentVersionId: input.contentVersionId,
          code: { in: activeLibraryCodes },
          isActive: true,
        },
        select: { id: true, code: true },
      }),
      this.prisma.questionDefinition.findMany({
        where: {
          code: { in: questionCodes },
          status: "APPROVED",
          isActive: true,
          clinicalLibrary: {
            is: { contentVersionId: input.contentVersionId },
          },
        },
        select: { id: true, code: true },
      }),
      this.prisma.ruleVersion.findMany({
        where: {
          code: { in: [RULE_HAIR_TO_SCALP, RULE_SCALP_TO_HAIR] },
          contentVersions: {
            some: { contentVersionId: input.contentVersionId },
          },
        },
        select: { id: true, code: true },
      }),
    ]);

    if (
      pathways.length !== new Set(activePathwayCodes).size ||
      libraries.length !== new Set(activeLibraryCodes).size ||
      questions.length !== questionCodes.length ||
      rules.length !== 2
    ) {
      return {
        state: "CONFIGURATION_ERROR",
        activePathwayDefinitionIds: [],
        activeLibraryIds: [],
        questionResponses: [],
        routingEvaluations: [],
      };
    }

    const questionIds = new Map(
      questions.map(({ code, id }) => [code, id]),
    );
    const ruleIds = new Map(rules.map(({ code, id }) => [code, id]));
    const primaryReason = routingAnswers.Q_VISIT_PRIMARY_REASON;
    const hairToScalpActivated =
      primaryReason === "RV_HAIR_LOSS" &&
      routingAnswers.Q_SECONDARY_SCALP_GATE === "YES";
    const scalpToHairActivated =
      primaryReason === "RV_SCALP_SYMPTOMS" &&
      routingAnswers.Q_SECONDARY_HAIR_GATE === "YES";

    return {
      state: "READY",
      activePathwayDefinitionIds: pathways.map(({ id }) => id),
      activeLibraryIds: libraries.map(({ id }) => id),
      questionResponses: officialValues.map((value) => ({
        questionDefinitionId: questionIds.get(value.questionCode)!,
        responseScopeType: value.responseScopeType,
        responseScopeKey: value.responseScopeKey,
        valueJson: value.value as Prisma.InputJsonValue,
        activationSources: value.activationSources,
      })),
      routingEvaluations: [
        {
          ruleVersionId: ruleIds.get(RULE_HAIR_TO_SCALP)!,
          resultState: hairToScalpActivated ? "TRUE" : "FALSE",
          resultJson: {
            primaryReason,
            active: hairToScalpActivated,
          } as Prisma.InputJsonValue,
        },
        {
          ruleVersionId: ruleIds.get(RULE_SCALP_TO_HAIR)!,
          resultState: scalpToHairActivated ? "TRUE" : "FALSE",
          resultJson: {
            primaryReason,
            active: scalpToHairActivated,
          },
        },
      ],
    };
  }

  private async assertPublishedConfiguration(
    contentVersionId: string,
  ): Promise<boolean> {
    const [version, questionCount, pathwayCount, ruleCount] =
      await Promise.all([
        this.prisma.contentVersion.findUnique({
          where: { id: contentVersionId },
          select: {
            versionCode: true,
            isActive: true,
            publishedAt: true,
          },
        }),
        this.prisma.questionDefinition.count({
          where: {
            code: { in: getP01QuestionCodes() },
            status: "APPROVED",
            isActive: true,
            clinicalLibrary: {
              is: { contentVersionId },
            },
          },
        }),
        this.prisma.clinicalPathwayDefinition.count({
          where: {
            contentVersionId,
            code: { in: Object.values(P01_PATHWAY_CODES) },
            isActive: true,
          },
        }),
        this.prisma.contentVersionRuleVersion.count({
          where: {
            contentVersionId,
            ruleVersion: {
              code: { in: [RULE_HAIR_TO_SCALP, RULE_SCALP_TO_HAIR] },
            },
          },
        }),
      ]);

    return Boolean(
      version?.versionCode === P01_CONTENT_VERSION &&
        version.isActive &&
        version.publishedAt &&
        questionCount === getP01QuestionCodes().length &&
        pathwayCount === new Set(Object.values(P01_PATHWAY_CODES)).size &&
        ruleCount === 2,
    );
  }
}

export { RULE_HAIR_TO_SCALP, RULE_SCALP_TO_HAIR };
