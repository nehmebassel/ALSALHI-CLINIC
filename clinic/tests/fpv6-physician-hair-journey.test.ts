import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildReturningPatientContextBundle } from "../lib/follow-up/context";
import { buildCanonicalPhysicianHairJourney, type CanonicalJourneyEpisodeInput } from "../lib/physician/hair-journey";

function visit(input: Partial<CanonicalJourneyEpisodeInput["visits"][number]> & {
  visitId: string;
  occurred: string;
}): CanonicalJourneyEpisodeInput["visits"][number] {
  return {
    visitId: input.visitId,
    physicianVisitRecordId: `pvr-${input.visitId}`,
    episodeId: input.episodeId ?? "episode-1",
    visitType: input.visitType ?? "FOLLOW_UP",
    visitOccurredAt: new Date(input.occurred),
    finalizedAt: new Date(input.occurred),
    measurements: input.measurements ?? [],
    diagnoses: input.diagnoses ?? [],
    treatments: input.treatments ?? [],
    procedures: input.procedures ?? [],
    ...(input.pattern ? { pattern: input.pattern } : {}),
    ...(input.trichoscopy ? { trichoscopy: input.trichoscopy } : {}),
    ...(input.anatomicalMap ? { anatomicalMap: input.anatomicalMap } : {}),
  };
}

function episode(visits: CanonicalJourneyEpisodeInput["visits"]): CanonicalJourneyEpisodeInput {
  return {
    episodeId: "episode-1",
    primary: { ar: "تساقط الشعر", en: "Hair loss" },
    status: "ACTIVE",
    visits,
  };
}

test("FPV-6 canonical Journey uses finalized physician Visit chronology for measurements", () => {
  const output = buildCanonicalPhysicianHairJourney([episode([
    visit({ visitId: "v2", occurred: "2026-02-10T09:00:00.000Z", measurements: [{ code: "SHEDDING", value: 2 }] }),
    visit({ visitId: "v1", occurred: "2026-01-05T09:00:00.000Z", measurements: [{ code: "SHEDDING", value: 4 }] }),
  ])]);
  assert.equal(output.length, 1);
  assert.deepEqual(output[0].measurementSeries[0].points.map((point) => [point.visitId, point.value]), [["v1", 4], ["v2", 2]]);
  assert.equal(output[0].measurementSeries[0].points[0].date, "2026-01-05T09:00:00.000Z");
});

test("FPV-6 diagnosis and treatment timeline resolves target identity without mutable Journey rows", () => {
  const output = buildCanonicalPhysicianHairJourney([episode([
    visit({
      visitId: "v1",
      occurred: "2026-01-05T09:00:00.000Z",
      diagnoses: [{ id: "d1", diagnosisId: "dx1", action: "ADD", text: "Pattern hair loss", decisionOrder: 0 }],
      treatments: [{ id: "t1", treatmentCourseId: "tx1", action: "START", name: "Minoxidil", regimenText: "Once daily", noteText: null, setsName: true, setsRegimen: true, setsNote: false, decisionOrder: 0 }],
    }),
    visit({
      visitId: "v2",
      occurred: "2026-02-05T09:00:00.000Z",
      diagnoses: [{ id: "d2", diagnosisId: "dx1", action: "RESOLVE", text: null, decisionOrder: 0 }],
      treatments: [{ id: "t2", treatmentCourseId: "tx1", action: "STOP", name: null, regimenText: null, noteText: null, setsName: false, setsRegimen: false, setsNote: false, decisionOrder: 0 }],
    }),
  ])]);
  const titles = output[0].timeline.map((item) => item.title?.en ?? "");
  assert.equal(titles.some((title) => title.includes("Resolve diagnosis — Pattern hair loss")), true);
  assert.equal(titles.some((title) => title.includes("Stop treatment — Minoxidil")), true);
});

test("FPV-6 procedure timeline preserves OTHER text and distinguishes plan from performance", () => {
  const output = buildCanonicalPhysicianHairJourney([episode([
    visit({
      visitId: "v1",
      occurred: "2026-01-05T09:00:00.000Z",
      procedures: [{ id: "p1", procedurePlanId: "plan1", action: "PLAN", procedureCode: "OTHER", otherProcedureText: "Custom scalp procedure", plannedDate: new Date("2026-01-20T00:00:00.000Z"), performedDate: null, noteText: null, decisionOrder: 0 }],
    }),
    visit({
      visitId: "v2",
      occurred: "2026-01-20T09:00:00.000Z",
      procedures: [{ id: "p2", procedurePlanId: "plan1", action: "PERFORM", procedureCode: "OTHER", otherProcedureText: "Custom scalp procedure", plannedDate: null, performedDate: new Date("2026-01-20T00:00:00.000Z"), noteText: null, decisionOrder: 0 }],
    }),
  ])]);
  assert.equal(output[0].timeline[0].title?.en, "Plan procedure — Custom scalp procedure");
  assert.equal(output[0].timeline[1].title?.en, "Perform procedure — Custom scalp procedure");
});

test("FPV-6 Pattern, Trichoscopy, and Anatomical Map remain Visit-local references", () => {
  const output = buildCanonicalPhysicianHairJourney([episode([
    visit({
      visitId: "v1",
      occurred: "2026-01-05T09:00:00.000Z",
      pattern: { sinclair: 3, mcuFvBasic: "M2", mcuFvFrontal: "F1", mcuFvVertex: "V2", hairLineMidlineCm: 6.5, hairLineRightSideCm: 7, hairLineLeftSideCm: 7.2 },
      trichoscopy: { findingCodes: ["EXCLAMATION_TAPERING_HAIRS", "WIGGLY_SQUIGGLY_HAIR"], otherFindingText: "Exact physician note" },
      anatomicalMap: { regions: [{ view: "FRONT" }, { view: "FRONT" }, { view: "TOP", anatomicalRegionCode: "MID_SCALP", geometry: { version: 1, strokes: [{ radius: 0.012, points: [{ x: 0.5, y: 0.9 }] }] } }] },
    }),
    visit({ visitId: "v2", occurred: "2026-02-05T09:00:00.000Z" }),
  ])]);
  const [first, second] = output[0].visits;
  assert.equal(first.pattern?.mcuFvCode, "M2F1V2");
  assert.deepEqual(first.trichoscopy?.findingLabels, ["Exclamation (tapering) hairs", "Wiggly Squiggly hair"]);
  assert.equal(first.anatomicalMap?.regionCount, 3);
  assert.equal(first.anatomicalMap?.regions[2]?.label.en, "Mid-scalp", "Journey uses confirmed identity rather than centroid suggestion");
  assert.equal(second.pattern, undefined);
  assert.equal(second.trichoscopy, undefined);
  assert.equal(second.anatomicalMap, undefined);
});

test("FPV-6 read model cuts over from legacy PhysicianHairJourney persistence", () => {
  const source = fs.readFileSync(new URL("../lib/physician/read-model.ts", import.meta.url), "utf8");
  assert.equal(source.includes("patient.physicianHairJourney"), false);
  assert.equal(source.includes('record.status !== "FINALIZED"'), true);
  assert.equal(source.includes("visit.visitOccurredAt"), true);
  assert.equal(source.includes("buildCanonicalPhysicianHairJourney"), true);
});

test("FPV-6 Journey UI is read-only and opens canonical finalized Visit for full detail", () => {
  const source = fs.readFileSync(new URL("../app/physician/components/physician-hair-journey.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('Review physician-recorded hair changes across completed visits.'), true);
  assert.equal(source.includes('Finalized clinical history'), true);
  assert.equal(source.includes("onOpenVisit(visit.visitId)"), true);
  assert.equal(source.includes("<input"), false);
  assert.equal(source.includes("<textarea"), false);
});


test("FPV-6 returning-patient runtime does not read legacy Measurement or TimelineEvent persistence", async () => {
  const db: Record<string, unknown> = {
    patient: {
      findUnique: async () => ({
        profile: {
          fullName: "Test Patient",
          dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
          gender: "FEMALE",
          maritalStatus: "NOT_MARRIED",
        },
        externalIdentifiers: [{ displayValue: "10001" }],
      }),
    },
    clinicalEpisode: {
      findMany: async () => [{
        id: "episode-1",
        primaryReasonCode: "RV_HAIR_LOSS",
        status: "ACTIVE",
        openedAt: new Date("2026-01-01T00:00:00.000Z"),
        visits: [{ id: "visit-1", createdAt: new Date("2026-01-02T00:00:00.000Z") }],
        _count: { visits: 1 },
      }],
    },
    response: { findMany: async () => [] },
    reasonForVisitDefinition: {
      findMany: async () => [{ code: "RV_HAIR_LOSS", labelAr: "تساقط الشعر", labelEn: "Hair Loss" }],
    },
    clinicianAssessment: { findMany: async () => [] },
    dualPerspectiveAssessment: { findMany: async () => [] },
    clinicalEpisodeFollowUpProfile: { findMany: async () => [] },
    followUpVisitContext: { findMany: async () => [] },
  };

  Object.defineProperty(db, "measurement", {
    get() { throw new Error("LEGACY_MEASUREMENT_RUNTIME_ACCESS"); },
  });
  Object.defineProperty(db, "timelineEvent", {
    get() { throw new Error("LEGACY_TIMELINE_EVENT_RUNTIME_ACCESS"); },
  });

  const result = await buildReturningPatientContextBundle({
    db: db as never,
    patientId: "patient-1",
    clinicScopeId: "clinic-1",
    mrnDisplayValue: "10001",
    contentVersionId: "cv-1",
    now: new Date("2026-03-01T09:00:00.000Z"),
    baseInput: { locale: "en", answers: {} },
  });

  const client = result.patientInputJson.followUp as unknown as {
    episodeState: Array<{ latestMeasurementCodes: string[]; importantEventTypes: string[] }>;
  };
  assert.deepEqual(client.episodeState[0].latestMeasurementCodes, []);
  assert.deepEqual(client.episodeState[0].importantEventTypes, []);
  assert.deepEqual(result.serverContext.episodes[0].physician.measurements, []);
  assert.deepEqual(result.serverContext.episodes[0].physician.timelineEvents, []);
});

test("FPV-6 runtime source scan includes returning-patient flow in legacy cutover", () => {
  const followUp = fs.readFileSync(new URL("../lib/follow-up/context.ts", import.meta.url), "utf8");
  const patientAccess = fs.readFileSync(new URL("../lib/patient-access/prisma-store.ts", import.meta.url), "utf8");
  assert.equal(followUp.includes("db.measurement.findMany"), false);
  assert.equal(followUp.includes("db.timelineEvent.findMany"), false);
  assert.equal(patientAccess.includes("buildReturningPatientContextBundle"), true);
});

test("FPV-6 same-time visits use deterministic bytewise visitId ordering", () => {
  const occurred = "2026-01-05T09:00:00.000Z";
  const output = buildCanonicalPhysicianHairJourney([episode([
    visit({ visitId: "visit-b", occurred, measurements: [{ code: "SHEDDING", value: 2 }] }),
    visit({ visitId: "visit-a", occurred, measurements: [{ code: "SHEDDING", value: 4 }] }),
  ])]);
  assert.deepEqual(output[0].measurementSeries[0].points.map((point) => point.visitId), ["visit-a", "visit-b"]);
});

test("FPV-6 CANCEL_OR_DEFER stays distinct and episode projections remain isolated", () => {
  const first: CanonicalJourneyEpisodeInput = {
    episodeId: "episode-a",
    primary: { ar: "تساقط الشعر", en: "Hair loss" },
    status: "ACTIVE",
    visits: [
      visit({
        visitId: "a1",
        episodeId: "episode-a",
        occurred: "2026-01-01T09:00:00.000Z",
        procedures: [{ id: "plan-a", procedurePlanId: "plan-a", action: "PLAN", procedureCode: "PRP", otherProcedureText: null, plannedDate: null, performedDate: null, noteText: null, decisionOrder: 0 }],
      }),
      visit({
        visitId: "a2",
        episodeId: "episode-a",
        occurred: "2026-01-02T09:00:00.000Z",
        procedures: [{ id: "cancel-a", procedurePlanId: "plan-a", action: "CANCEL_OR_DEFER", procedureCode: "PRP", otherProcedureText: null, plannedDate: null, performedDate: null, noteText: null, decisionOrder: 0 }],
      }),
    ],
  };
  const second: CanonicalJourneyEpisodeInput = {
    episodeId: "episode-b",
    primary: { ar: "فروة الرأس", en: "Scalp" },
    status: "ACTIVE",
    visits: [visit({ visitId: "b1", episodeId: "episode-b", occurred: "2026-01-03T09:00:00.000Z", measurements: [{ code: "ITCH", value: 3 }] })],
  };
  const output = buildCanonicalPhysicianHairJourney([first, second]);
  const a = output.find((item) => item.episodeId === "episode-a");
  const b = output.find((item) => item.episodeId === "episode-b");
  assert.ok(a && b);
  assert.equal(a.timeline.some((item) => item.title?.en === "Cancel or defer procedure — PRP / Platelet-Rich Plasma"), true);
  assert.equal(a.measurementSeries.some((series) => series.code === "ITCH"), false);
  assert.equal(b.timeline.length, 0);
  assert.deepEqual(b.measurementSeries[0].points.map((point) => point.visitId), ["b1"]);
});
