import assert from "node:assert/strict";
import test from "node:test";

import {
  ANATOMICAL_MAP_MAX_POINTS,
  ANATOMICAL_MAP_MAX_REGIONS,
  ANATOMICAL_MAP_MAX_STROKES,
  ANATOMICAL_MAP_NOTE_TEXT_MAX_LENGTH,
  parseAnatomicalMapGeometry,
  parseAnatomicalMapRegions,
  parseGovernedPhysicianVisitDraft,
  parsePhysicianAnatomicalMap,
  parsePhysicianClinicalCorrectionRequestBody,
  PHYSICIAN_ANATOMICAL_MAP_VIEWS,
  PhysicianVisitClinicalContractError,
} from "../lib/physician/visit-clinical-contracts";
import { PhysicianVisitDraftError } from "../lib/physician/visit-contracts";
import { validatePhysicianVisitDraftEnvelope } from "../lib/physician/visit-service";

function geometry(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 1,
    strokes: [
      {
        radius: 0.02,
        points: [
          { x: 0.43, y: 0.27 },
          { x: 0.44, y: 0.28 },
        ],
      },
    ],
    ...overrides,
  };
}

function region(
  view: (typeof PHYSICIAN_ANATOMICAL_MAP_VIEWS)[number] = "FRONT",
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const anatomicalRegionCode = view === "FRONT" ? "FRONTAL_SCALP" : view === "TOP" ? "MID_SCALP" : view === "RIGHT_SIDE" ? "RIGHT_TEMPORAL" : "LEFT_TEMPORAL";
  return { view, anatomicalRegionCode, geometry: geometry(), ...overrides };
}

function rejectsClinical(operation: () => unknown): void {
  assert.throws(
    operation,
    (error: unknown) => error instanceof PhysicianVisitClinicalContractError,
  );
}

test("FPV-3.5B accepts omission, an empty Draft map, and every exact view", () => {
  assert.deepEqual(parseGovernedPhysicianVisitDraft({}), {});
  assert.deepEqual(parsePhysicianAnatomicalMap({ regions: [] }), { regions: [] });
  assert.deepEqual(
    parsePhysicianAnatomicalMap({
      regions: PHYSICIAN_ANATOMICAL_MAP_VIEWS.map((view) => region(view)),
    }).regions.map(({ view }) => view),
    ["FRONT", "TOP", "RIGHT_SIDE", "LEFT_SIDE"],
  );
});

test("FPV-3.5B regions support geometry, note, color, and stable input order", () => {
  const exactNote = "  focal observation\nsecond line  ";
  const regions = parseAnatomicalMapRegions([
    region("TOP"),
    region("RIGHT_SIDE", { noteText: exactNote }),
    region("LEFT_SIDE", { displayColorHex: "#a1b2c3" }),
    region("FRONT", {
      noteText: "combined",
      displayColorHex: "#00FF7F",
    }),
  ]);
  assert.equal(regions.length, 4);
  assert.equal(regions[1]?.noteText, exactNote);
  assert.equal(regions[2]?.displayColorHex, "#A1B2C3");
  assert.deepEqual(
    regions.map(({ view }) => view),
    ["TOP", "RIGHT_SIDE", "LEFT_SIDE", "FRONT"],
  );
});

test("FPV-3.5B geometry rejects non-V1, empty, out-of-range, and nonnumeric data", () => {
  const invalidGeometries = [
    geometry({ version: 2 }),
    geometry({ strokes: [] }),
    geometry({ strokes: [{ radius: 0.02, points: [] }] }),
    geometry({ strokes: [{ radius: 0, points: [{ x: 0, y: 0 }] }] }),
    geometry({ strokes: [{ radius: -0.1, points: [{ x: 0, y: 0 }] }] }),
    geometry({ strokes: [{ radius: 1.01, points: [{ x: 0, y: 0 }] }] }),
    geometry({ strokes: [{ radius: "0.02", points: [{ x: 0, y: 0 }] }] }),
    geometry({ strokes: [{ radius: 0.02, points: [{ x: -0.01, y: 0 }] }] }),
    geometry({ strokes: [{ radius: 0.02, points: [{ x: 1.01, y: 0 }] }] }),
    geometry({ strokes: [{ radius: 0.02, points: [{ x: 0, y: -0.01 }] }] }),
    geometry({ strokes: [{ radius: 0.02, points: [{ x: 0, y: 1.01 }] }] }),
    geometry({ strokes: [{ radius: 0.02, points: [{ x: "0.1", y: 0 }] }] }),
    geometry({ strokes: [{ radius: 0.02, points: [{ x: Number.NaN, y: 0 }] }] }),
    geometry({ strokes: [{ radius: 0.02, points: [{ x: Number.POSITIVE_INFINITY, y: 0 }] }] }),
    geometry({ strokes: [{ radius: 0.02, points: [{ x: 0, y: Number.NEGATIVE_INFINITY }] }] }),
  ];
  for (const invalidGeometry of invalidGeometries) {
    rejectsClinical(() => parseAnatomicalMapGeometry(invalidGeometry));
  }
});

test("FPV-3.5B geometry rejects unknown keys, SVG/path payloads, and metadata", () => {
  rejectsClinical(() => parseAnatomicalMapGeometry({ ...geometry(), path: "M0,0" }));
  rejectsClinical(() =>
    parseAnatomicalMapGeometry({
      version: 1,
      strokes: [{ radius: 0.02, points: [{ x: 0, y: 0 }], svg: "<svg/>" }],
    }),
  );
  rejectsClinical(() =>
    parseAnatomicalMapGeometry({
      version: 1,
      strokes: [
        {
          radius: 0.02,
          points: [{ x: 0, y: 0, metadata: { diagnosis: "forbidden" } }],
        },
      ],
    }),
  );
  rejectsClinical(() => parseAnatomicalMapGeometry("M0,0 L1,1"));
});

test("FPV-3.5B map and region keys, view, note, and color fail closed", () => {
  rejectsClinical(() => parsePhysicianAnatomicalMap({ regions: [], templateVersion: 1 }));
  rejectsClinical(() => parsePhysicianAnatomicalMap({}));
  rejectsClinical(() => parseAnatomicalMapRegions([region("FRONT", { findingType: "scar" })]));
  rejectsClinical(() => parseAnatomicalMapRegions([{ ...region(), view: "BACK" }]));
  for (const noteText of ["", " \t\n ", null, 4, "x".repeat(ANATOMICAL_MAP_NOTE_TEXT_MAX_LENGTH + 1)]) {
    rejectsClinical(() => parseAnatomicalMapRegions([region("FRONT", { noteText })]));
  }
  assert.equal(
    parseAnatomicalMapRegions([
      region("FRONT", { noteText: "x".repeat(ANATOMICAL_MAP_NOTE_TEXT_MAX_LENGTH) }),
    ])[0]?.noteText?.length,
    ANATOMICAL_MAP_NOTE_TEXT_MAX_LENGTH,
  );
  for (const displayColorHex of ["red", "#FFF", "#GG0000", "#1234567", "123456", null]) {
    rejectsClinical(() =>
      parseAnatomicalMapRegions([region("FRONT", { displayColorHex })]),
    );
  }
});

test("FPV-3.5B documents and enforces technical anti-abuse bounds", () => {
  assert.deepEqual(
    [ANATOMICAL_MAP_MAX_REGIONS, ANATOMICAL_MAP_MAX_STROKES, ANATOMICAL_MAP_MAX_POINTS],
    [128, 512, 4096],
  );
  rejectsClinical(() =>
    parseAnatomicalMapRegions(
      Array.from({ length: ANATOMICAL_MAP_MAX_REGIONS + 1 }, () => region()),
    ),
  );
  rejectsClinical(() =>
    parseAnatomicalMapGeometry({
      version: 1,
      strokes: Array.from({ length: ANATOMICAL_MAP_MAX_STROKES + 1 }, () => ({
        radius: 0.01,
        points: [{ x: 0, y: 0 }],
      })),
    }),
  );
  rejectsClinical(() =>
    parseAnatomicalMapGeometry({
      version: 1,
      strokes: [{
        radius: 0.01,
        points: Array.from({ length: ANATOMICAL_MAP_MAX_POINTS + 1 }, () => ({ x: 0, y: 0 })),
      }],
    }),
  );
});

test("FPV-3.5B Draft validation governs ANATOMICAL_MAP and rejects provenance aliases", () => {
  const validated = validatePhysicianVisitDraftEnvelope({
    schemaVersion: "FPV_DRAFT_V1",
    sections: {
      ANATOMICAL_MAP: { regions: [region("FRONT", { displayColorHex: "#abcdef" })] },
    },
  } as never);
  assert.equal(
    parseGovernedPhysicianVisitDraft(validated.sections).anatomicalMap?.regions[0]
      ?.displayColorHex,
    "#ABCDEF",
  );
  for (const forbidden of [
    { patientResponseId: "forbidden" },
    { source_response_ref: "forbidden" },
    { patientHairHistoryId: "forbidden" },
  ]) {
    assert.throws(
      () =>
        validatePhysicianVisitDraftEnvelope({
          schemaVersion: "FPV_DRAFT_V1",
          sections: { ANATOMICAL_MAP: { regions: [region("FRONT", forbidden)] } },
        } as never),
      (error: unknown) =>
        error instanceof PhysicianVisitDraftError &&
        error.code === "PATIENT_PROVENANCE_BOUNDARY_VIOLATION",
    );
  }
});

test("FPV-3.5B correction contract permits only whole-set SET and OMIT", () => {
  assert.deepEqual(
    parsePhysicianClinicalCorrectionRequestBody({
      target: "ANATOMICAL_MAP_REGIONS",
      operation: "SET",
      value: [region("TOP", { displayColorHex: "#abcdef" })],
    }),
    {
      target: "ANATOMICAL_MAP_REGIONS",
      operation: "SET",
      value: [region("TOP", { displayColorHex: "#ABCDEF" })],
    },
  );
  assert.deepEqual(
    parsePhysicianClinicalCorrectionRequestBody({
      target: "ANATOMICAL_MAP_REGIONS",
      operation: "OMIT",
    }),
    { target: "ANATOMICAL_MAP_REGIONS", operation: "OMIT" },
  );
  rejectsClinical(() =>
    parsePhysicianClinicalCorrectionRequestBody({
      target: "ANATOMICAL_MAP_REGIONS",
      operation: "OMIT",
      value: [],
    }),
  );
  rejectsClinical(() =>
    parsePhysicianClinicalCorrectionRequestBody({
      target: "ANATOMICAL_MAP_REGION",
      operation: "SET",
      value: region(),
    }),
  );
});
