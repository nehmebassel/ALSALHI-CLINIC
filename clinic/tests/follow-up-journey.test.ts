import assert from "node:assert/strict";
import test from "node:test";

import {
  firstFollowUpRegistrySection,
  followUpJourneySections,
  isAllowedExistingFollowUpRegistrySection,
} from "../lib/follow-up/journey";
import { FOLLOW_UP_CONTEXT_VERSION, type P01FollowUpContext } from "../lib/follow-up/types";
import type { P01SectionCode } from "../lib/p01/contracts";

function context(intent: "EXISTING_CONCERN" | "NEW_CONCERN"): P01FollowUpContext {
  return {
    version: FOLLOW_UP_CONTEXT_VERSION,
    mode: "RETURNING",
    patientId: "SYNTHETIC_PATIENT",
    identity: {
      fullName: "Synthetic Patient",
      dateOfBirth: "1990-01-01",
      sex: "FEMALE",
      maritalStatus: "MARRIED",
      mrn: "SYN-001",
    },
    episodes: [],
    episodeState: [],
    recordedQuestionCodes: [],
    snapshot: { generatedAt: "2026-08-18T00:00:00.000Z", entries: [] },
    intent,
    ...(intent === "EXISTING_CONCERN" ? {
      selectedEpisodeId: "EP-1",
      selectedPrimaryReasonCode: "RV_HAIR_LOSS",
      sourceVisitId: "VISIT-1",
    } : {}),
  };
}

const INITIAL_AND_ADDITIONAL: P01SectionCode[] = [
  "PRIVACY",
  "PROFILE",
  "VISIT_REASON",
  "HEALTH_SNAPSHOT",
  "HAIR_LOSS",
  "SCALP",
  "SHARED_HISTORY",
  "COURSE_IMPACT",
  "LIFESTYLE_NUTRITION",
  "WOMENS_HEALTH",
  "PREGNANCY_CONTEXT",
  "LASER",
  "AESTHETIC_PROCEDURES",
];

test("existing-concern follow-up hard-filters Initial Intake sections", () => {
  assert.deepEqual(
    followUpJourneySections(INITIAL_AND_ADDITIONAL, context("EXISTING_CONCERN")),
    ["PRIVACY", "LASER", "AESTHETIC_PROCEDURES"],
  );
});

test("existing-concern follow-up permits only additional Laser/Aesthetic registry pathways", () => {
  assert.equal(isAllowedExistingFollowUpRegistrySection("LASER"), true);
  assert.equal(isAllowedExistingFollowUpRegistrySection("AESTHETIC_PROCEDURES"), true);
  assert.equal(isAllowedExistingFollowUpRegistrySection("HAIR_LOSS"), false);
  assert.equal(isAllowedExistingFollowUpRegistrySection("HEALTH_SNAPSHOT"), false);
  assert.equal(isAllowedExistingFollowUpRegistrySection("WOMENS_HEALTH"), false);
});

test("existing-concern follow-up has no registry section when there is no additional pathway", () => {
  assert.equal(
    firstFollowUpRegistrySection(["PRIVACY", "PROFILE", "HAIR_LOSS", "SHARED_HISTORY"], context("EXISTING_CONCERN")),
    null,
  );
});

test("returning NEW_CONCERN keeps the engine-selected new-concern sections", () => {
  assert.deepEqual(
    followUpJourneySections(["PRIVACY", "VISIT_REASON", "DERMATOLOGY", "PREGNANCY_CONTEXT"], context("NEW_CONCERN")),
    ["PRIVACY", "VISIT_REASON", "DERMATOLOGY", "PREGNANCY_CONTEXT"],
  );
});
