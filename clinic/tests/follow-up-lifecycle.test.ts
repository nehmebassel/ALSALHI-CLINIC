import assert from "node:assert/strict";
import test from "node:test";

import {
  getFollowUpLifecycle,
  requiredFollowUpChangeKeys,
} from "../lib/follow-up/lifecycle";
import type { FollowUpClientEpisodeState } from "../lib/follow-up/types";

function episodeState(overrides: Partial<FollowUpClientEpisodeState> = {}): FollowUpClientEpisodeState {
  return {
    episodeId: "EP-1",
    primaryReasonCode: "RV_HAIR_LOSS",
    physicianContextAvailable: true,
    currentTreatmentCount: 1,
    priorProcedureCount: 2,
    latestMeasurementCodes: ["SHEDDING"],
    importantEventTypes: ["PROCEDURE"],
    physicianRoutedQuestionCodes: [],
    physicianChangeDomains: [],
    ...overrides,
  };
}

test("existing Hair Loss follow-up defaults to concern-specific change domains, not general history replay", () => {
  const keys = requiredFollowUpChangeKeys("RV_HAIR_LOSS", "FEMALE", episodeState());
  assert.deepEqual(new Set(keys), new Set([
    "generalHealth",
    "medicationsSupplements",
    "hairTreatments",
    "hairProcedures",
    "triggerEvents",
    "sexSpecific",
  ]));
  assert.equal(keys.includes("generalHealth"), true);
  assert.equal(keys.includes("sexSpecific"), true);
  assert.equal(keys.includes("hairQualityLifestyle"), false);
});

test("physician-approved profile can add follow-up domains without replaying the full registry", () => {
  const keys = requiredFollowUpChangeKeys("RV_HAIR_LOSS", "FEMALE", episodeState({
    physicianChangeDomains: ["generalHealth", "sexSpecific"],
  }));
  assert.equal(keys.includes("generalHealth"), true);
  assert.equal(keys.includes("sexSpecific"), true);
});

test("Laser/Aesthetic existing episodes update only shared current state unless physician routing adds a governed domain", () => {
  const expected = new Set(["generalHealth", "medicationsSupplements"]);
  assert.deepEqual(new Set(requiredFollowUpChangeKeys("RV_LASER", "FEMALE", episodeState({ primaryReasonCode: "RV_LASER" }))), expected);
  assert.deepEqual(new Set(requiredFollowUpChangeKeys("RV_AESTHETIC_PROCEDURES", "FEMALE", episodeState({ primaryReasonCode: "RV_AESTHETIC_PROCEDURES" }))), expected);
});

test("follow-up lifecycle separates historical record, current measurement, treatment state, events and safety", () => {
  assert.equal(getFollowUpLifecycle("Q_PROFILE_FULL_NAME"), "ASK_ONCE");
  assert.equal(getFollowUpLifecycle("Q_PRIOR_DIAGNOSES"), "HISTORICAL_RECORD");
  assert.equal(getFollowUpLifecycle("Q_HAIR_TREATMENT_ITEMS"), "CURRENT_TREATMENT_STATE");
  assert.equal(getFollowUpLifecycle("Q_HAIR_SHEDDING_SEVERITY"), "VISIT_MEASUREMENT");
  assert.equal(getFollowUpLifecycle("Q_TRIGGER_EVENTS"), "SINCE_LAST_VISIT_EVENT");
  assert.equal(getFollowUpLifecycle("Q_PREGNANCY_BREASTFEEDING_STATUS"), "CURRENT_SAFETY_STATE");
  assert.equal(getFollowUpLifecycle("Q_SCALP_BIOPSY_GATE"), "HISTORICAL_RECORD");
  assert.equal(getFollowUpLifecycle("Q_WOMEN_GYN_EVALUATED"), "HISTORICAL_RECORD");
  assert.equal(getFollowUpLifecycle("Q_MEN_FERTILITY_SHORT"), "HISTORICAL_RECORD");
});

test("historical sex-specific details are not classified as follow-up re-entry points", () => {
  assert.equal(getFollowUpLifecycle("Q_WOMEN_IRREGULAR_ONSET"), "HISTORICAL_RECORD");
  assert.equal(getFollowUpLifecycle("Q_WOMEN_GYN_EVALUATED"), "HISTORICAL_RECORD");
  assert.equal(getFollowUpLifecycle("Q_MEN_LIBIDO_MED_RELATION"), "HISTORICAL_RECORD");
  assert.equal(getFollowUpLifecycle("Q_MEN_HORMONES_STEROIDS"), "HISTORICAL_RECORD");
});
