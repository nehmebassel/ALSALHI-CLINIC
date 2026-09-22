import type { EvaluatedOfficialState } from "./service";

/**
 * Canonical Prisma nested-write shape for the official clinical state produced
 * by the P01 engine. Production Final Submit and synthetic seeding both use
 * this helper so their persisted interview relations cannot drift silently.
 */
export function officialStateRelationsCreate(state: EvaluatedOfficialState) {
  if (state.state !== "READY") {
    throw new Error(`OFFICIAL_STATE_NOT_READY:${state.state}`);
  }

  return {
    activePathways: {
      create: state.activePathwayDefinitionIds.map((pathwayDefinitionId) => ({ pathwayDefinitionId })),
    },
    activeLibraries: {
      create: state.activeLibraryIds.map((clinicalLibraryId) => ({
        clinicalLibraryId,
        activationSourceType: "SYSTEM" as const,
      })),
    },
    questionInstances: {
      create: state.questionResponses.map((question) => ({
        questionDefinitionId: question.questionDefinitionId,
        responseScopeType: question.responseScopeType,
        responseScopeKey: question.responseScopeKey,
        activationSources: { create: question.activationSources },
        response: {
          create: {
            valueJson: question.valueJson,
            currentSource: "PATIENT" as const,
          },
        },
      })),
    },
    routingEvaluations: {
      create: state.routingEvaluations.map((evaluation) => ({
        ruleVersionId: evaluation.ruleVersionId,
        resultState: evaluation.resultState,
        resultJson: evaluation.resultJson,
      })),
    },
  };
}
