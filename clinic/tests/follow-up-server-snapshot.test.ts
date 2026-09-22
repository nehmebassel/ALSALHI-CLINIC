import assert from "node:assert/strict";
import test from "node:test";

import { selectFollowUpServerSnapshot } from "../lib/follow-up/server-snapshot";

test("visit follow-up snapshot keeps only the selected clinical episode", () => {
  const snapshot = selectFollowUpServerSnapshot({
    version: "P01_FOLLOW_UP_SERVER_v1",
    patientId: "P1",
    generatedAt: "2026-08-17T12:00:00.000Z",
    episodes: [
      { episodeId: "E1", physician: { assessments: [{ note: "internal-1" }] } },
      { episodeId: "E2", physician: { assessments: [{ note: "internal-2" }] } },
    ],
  }, "E2") as Record<string, unknown>;

  assert.equal(Array.isArray(snapshot.episodes), true);
  assert.deepEqual(snapshot.episodes, [
    { episodeId: "E2", physician: { assessments: [{ note: "internal-2" }] } },
  ]);
});
