import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { officialStateRelationsCreate } from "../lib/submission/official-state-persistence";
import type { EvaluatedOfficialState } from "../lib/submission/service";

function readyState(): EvaluatedOfficialState {
  return {
    state: "READY",
    activePathwayDefinitionIds: ["path-hair"],
    activeLibraryIds: ["lib-hair"],
    questionResponses: [{
      questionDefinitionId: "question-1",
      responseScopeType: "VISIT",
      responseScopeKey: "VISIT",
      valueJson: "YES",
      activationSources: [{ sourceType: "SYSTEM", sourceKey: "P01", isRequired: true }],
    }],
    routingEvaluations: [{
      ruleVersionId: "rule-1",
      resultState: "TRUE",
      resultJson: { pathway: "HAIR_SCALP_PATHWAY" },
    }],
  };
}

test("canonical official-state persistence includes pathways, libraries, scoped responses, activation sources, and routing evaluations", () => {
  const persisted = officialStateRelationsCreate(readyState());
  assert.deepEqual(persisted.activePathways.create, [{ pathwayDefinitionId: "path-hair" }]);
  assert.deepEqual(persisted.activeLibraries.create, [{ clinicalLibraryId: "lib-hair", activationSourceType: "SYSTEM" }]);
  assert.equal(persisted.questionInstances.create[0].responseScopeType, "VISIT");
  assert.equal(persisted.questionInstances.create[0].responseScopeKey, "VISIT");
  assert.deepEqual(persisted.questionInstances.create[0].activationSources.create, [{ sourceType: "SYSTEM", sourceKey: "P01", isRequired: true }]);
  assert.equal(persisted.questionInstances.create[0].response.create.currentSource, "PATIENT");
  assert.equal(persisted.routingEvaluations.create[0].ruleVersionId, "rule-1");
});

test("canonical official-state persistence rejects non-READY engine states", () => {
  assert.throws(
    () => officialStateRelationsCreate({ ...readyState(), state: "PENDING" }),
    /OFFICIAL_STATE_NOT_READY:PENDING/,
  );
});

test("production Final Submit and synthetic seed share the same official-state persistence helper", () => {
  const finalSubmit = fs.readFileSync(new URL("../lib/submission/service.ts", import.meta.url), "utf8");
  const syntheticSeed = fs.readFileSync(new URL("../prisma/seed-synthetic.ts", import.meta.url), "utf8");
  assert.equal(finalSubmit.includes("officialStateRelationsCreate(evaluatedOfficialState)"), true);
  assert.equal(syntheticSeed.match(/officialStateRelationsCreate\(officialState\)/g)?.length, 2);
});
