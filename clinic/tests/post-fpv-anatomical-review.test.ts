import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PHYSICIAN_ANATOMICAL_REGION_CODES,
  parseAnatomicalMapRegions,
  requireConfirmedAnatomicalMapRegions,
  PhysicianVisitClinicalContractError,
} from "../lib/physician/visit-clinical-contracts";
import {
  buildPreFinalizeReview,
  hasIncompleteAnatomicalRegion,
  presentAnatomicalRegionLabel,
  readOnlyAnatomicalMapViews,
  suggestAnatomicalRegionCode,
} from "../lib/physician/visit-workspace";

const geometry = (x: number, y: number) => ({ version: 1 as const, strokes: [{ radius: 0.012, points: [{ x, y }, { x: x + 0.01, y: y + 0.01 }] }] });

test("new map identity is a closed governed code set and incomplete regions cannot pass finalization validation", () => {
  assert.deepEqual(PHYSICIAN_ANATOMICAL_REGION_CODES, [
    "FRONTAL_SCALP", "MID_SCALP", "VERTEX_CROWN", "RIGHT_TEMPORAL", "LEFT_TEMPORAL",
    "RIGHT_PARIETAL", "LEFT_PARIETAL", "RIGHT_OCCIPITAL", "LEFT_OCCIPITAL",
  ]);
  const incomplete = parseAnatomicalMapRegions([{ view: "TOP", geometry: geometry(0.5, 0.8) }]);
  assert.equal(hasIncompleteAnatomicalRegion({ ANATOMICAL_MAP: { regions: incomplete } }), true);
  assert.throws(() => requireConfirmedAnatomicalMapRegions(incomplete), PhysicianVisitClinicalContractError);
  assert.throws(() => parseAnatomicalMapRegions([{ view: "TOP", anatomicalRegionCode: "CROWNISH", geometry: geometry(0.5, 0.8) }]), PhysicianVisitClinicalContractError);
  assert.throws(() => parseAnatomicalMapRegions([{ view: "LEFT_SIDE", anatomicalRegionCode: "RIGHT_TEMPORAL", geometry: geometry(0.2, 0.5) }]), PhysicianVisitClinicalContractError);
});

test("multiple same-view regions retain separate geometry, confirmed identity, note, and color", () => {
  const regions = parseAnatomicalMapRegions([
    { view: "TOP", anatomicalRegionCode: "MID_SCALP", geometry: geometry(0.5, 0.45), noteText: "Diffuse thinning", displayColorHex: "#a86a3d" },
    { view: "TOP", anatomicalRegionCode: "VERTEX_CROWN", geometry: geometry(0.5, 0.82), noteText: "Focal density loss", displayColorHex: "#334455" },
  ]);
  assert.equal(regions.length, 2);
  assert.notDeepEqual(regions[0].geometry, regions[1].geometry);
  assert.deepEqual(regions.map(({ anatomicalRegionCode, noteText, displayColorHex }) => ({ anatomicalRegionCode, noteText, displayColorHex })), [
    { anatomicalRegionCode: "MID_SCALP", noteText: "Diffuse thinning", displayColorHex: "#A86A3D" },
    { anatomicalRegionCode: "VERTEX_CROWN", noteText: "Focal density loss", displayColorHex: "#334455" },
  ]);
});

test("centroid is only a suggestion and an explicit physician selection controls presentation", () => {
  const drawn = { view: "TOP" as const, geometry: geometry(0.5, 0.82) };
  assert.equal(suggestAnatomicalRegionCode(drawn), "VERTEX_CROWN");
  const physicianConfirmed = { ...drawn, anatomicalRegionCode: "MID_SCALP" as const };
  assert.equal(presentAnatomicalRegionLabel(physicianConfirmed, "en"), "Mid-scalp");
  assert.equal(presentAnatomicalRegionLabel(physicianConfirmed, "ar"), "منتصف فروة الرأس");
});

test("pre-Finalize review lists confirmed map labels and exact Trichoscopy content", () => {
  const sections = {
    TRICHOSCOPY: { selectedFindingCodes: ["YELLOW_DOTS", "PERIFOLLICULAR_SCALE", "VELLUS_HAIRS"], otherFindingText: "Milky-white structureless area" },
    ANATOMICAL_MAP: { regions: [
      { view: "TOP", anatomicalRegionCode: "VERTEX_CROWN", geometry: geometry(0.5, 0.82), noteText: "Clear density loss" },
      { view: "TOP", anatomicalRegionCode: "MID_SCALP", geometry: geometry(0.5, 0.45), noteText: "Diffuse thinning" },
    ] },
  };
  const groups = buildPreFinalizeReview(sections, { diagnoses: [], treatmentCourses: [], procedurePlans: [] }, "en");
  assert.deepEqual(groups.find((group) => group.key === "TRICHOSCOPY")?.items, [
    "Yellow dots", "Perifollicular scale", "Vellus hairs", "Physician observation: Milky-white structureless area",
  ]);
  assert.deepEqual(groups.find((group) => group.key === "ANATOMICAL_MAP")?.items, [
    "Vertex / crown — Clear density loss", "Mid-scalp — Diffuse thinning",
  ]);
});

test("review and finalized snapshots share actual base images, saved polylines, and read-only labels", () => {
  const source = readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('<ReadOnlyAnatomicalMap value={draftMap} locale={locale} mode="REVIEW" />'));
  assert.ok(source.includes('<ReadOnlyAnatomicalMap value={map} locale={locale} />'));
  assert.ok(source.includes("ANATOMICAL_MAP_ASSETS[view.view"));
  assert.ok(source.includes("canonicalMapStrokes(region.geometry)"));
  assert.ok(source.includes("<polyline"));
  assert.ok(source.includes(".filter((view) => view.regions.length > 0)"));
  assert.ok(source.includes('data-read-only="true"'));
});

test("legacy NULL identity stays readable only through geometry fallback", () => {
  const legacy = { view: "TOP" as const, geometry: geometry(0.5, 0.82), noteText: "Historical note" };
  assert.equal(presentAnatomicalRegionLabel(legacy, "en"), "Vertex / crown");
  const views = readOnlyAnatomicalMapViews({ regions: [legacy] });
  assert.equal(views.find((view) => view.view === "TOP")?.regions[0]?.anatomicalRegionCode, undefined);
  assert.deepEqual(views.find((view) => view.view === "TOP")?.regions[0]?.geometry, legacy.geometry);
});

test("editor confirmation is explicit, autosaved, and blocks Finalize while incomplete", () => {
  const source = readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("Confirm the drawn region"));
  assert.ok(source.includes("setPendingCode(event.target.value"));
  assert.ok(source.includes("anatomicalRegionCode: code"));
  assert.ok(source.includes("onChange({ regions: [...regions, nextRegion] })"), "the unconfirmed drawing participates in Draft autosave");
  assert.ok(source.includes("!hasIncompleteAnatomicalRegion(sections)"));
  assert.ok(source.includes("Confirm the anatomical identity of every drawn region before finalizing"));
  assert.equal(source.includes("Save Anatomical"), false);
});
