import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  PHYSICIAN_ANATOMICAL_REGION_CODES,
  PHYSICIAN_ANATOMICAL_REGION_CODES_BY_VIEW,
  PHYSICIAN_TRICHOSCOPY_FINDING_CODES,
} from "../lib/physician/visit-clinical-contracts";
import {
  CLINICIAN_DEMO_AS_OF,
  CLINICIAN_DEMO_SCENARIOS,
  CLINICIAN_DEMO_SCHEMA,
  syntheticCaseForDemo,
} from "../prisma/clinician-demo-scenarios";
import { buildSyntheticDraft } from "../prisma/synthetic-scenarios";

test("clinician demo preserves the original 12 and adds eight showcase patients", () => {
  assert.equal(CLINICIAN_DEMO_SCHEMA, "alsalhi_clinician_demo_20260907");
  assert.equal(CLINICIAN_DEMO_SCENARIOS.length, 20);
  assert.deepEqual(
    CLINICIAN_DEMO_SCENARIOS.map((scenario) => scenario.mrn),
    Array.from({ length: 20 }, (_, index) => `DEMO-${String(index + 1).padStart(3, "0")}`),
  );
  assert.equal(new Set(CLINICIAN_DEMO_SCENARIOS.map((scenario) => scenario.name)).size, 20);
  assert.ok(CLINICIAN_DEMO_SCENARIOS.every((scenario) => /Demo|تجريب/.test(scenario.name)));

  const originalPortfolioHash = createHash("sha256")
    .update(JSON.stringify(CLINICIAN_DEMO_SCENARIOS.slice(0, 12)))
    .digest("hex");
  assert.equal(
    originalPortfolioHash,
    "a2a193523e0006b1add90ee5af3775bb6dcf7c3c012079f42c57ee584540d8d9",
    "DEMO-001 through DEMO-012 must remain unchanged",
  );

  const hairQuality = CLINICIAN_DEMO_SCENARIOS.filter((scenario) => scenario.primary === "RV_HAIR_QUALITY");
  assert.equal(hairQuality.length, 3);
  assert.ok(hairQuality.every((scenario) => scenario.gender === "FEMALE"));
  assert.ok(CLINICIAN_DEMO_SCENARIOS.some((scenario) =>
    scenario.primary === "RV_HAIR_LOSS"
    && scenario.visits.some((visit) => (visit.clinical?.measurements?.BURNING ?? 0) > 0)
    && scenario.visits.some((visit) => (visit.clinical?.measurements?.SCALP_PAIN ?? 0) > 0),
  ));
  assert.ok(CLINICIAN_DEMO_SCENARIOS.some((scenario) => scenario.primary === "RV_SCALP_SYMPTOMS"));
  assert.ok(CLINICIAN_DEMO_SCENARIOS.some((scenario) => scenario.primary === "RV_DERMATOLOGY"));
  assert.ok(CLINICIAN_DEMO_SCENARIOS.some((scenario) => scenario.primary === "RV_LASER"));
  assert.ok(CLINICIAN_DEMO_SCENARIOS.some((scenario) => scenario.primary === "RV_AESTHETIC_PROCEDURES"));
  assert.ok(CLINICIAN_DEMO_SCENARIOS.some((scenario) => scenario.primary === "RV_DERMATOLOGY" && scenario.additional?.includes("RV_LASER")));
});

test("DEMO-013 through DEMO-020 are finalized English-only showcase cases", () => {
  const showcase = CLINICIAN_DEMO_SCENARIOS.slice(12);
  assert.deepEqual(
    showcase.map((scenario) => scenario.mrn),
    Array.from({ length: 8 }, (_, index) => `DEMO-${String(index + 13).padStart(3, "0")}`),
  );
  assert.ok(showcase.every((scenario) => scenario.locale === "en"));
  assert.ok(showcase.every((scenario) => scenario.visits.every((visit) => visit.workflowState === "FINALIZED")));
  assert.equal(/[\u0600-\u06ff]/u.test(JSON.stringify(showcase)), false);

  const diagnoses = new Map(showcase.map((scenario) => [
    scenario.mrn,
    scenario.visits[0]?.diagnoses[0]?.action === "ADD"
      ? scenario.visits[0].diagnoses[0].text
      : undefined,
  ]));
  assert.deepEqual(Object.fromEntries(diagnoses), {
    "DEMO-013": "Female Pattern Hair Loss",
    "DEMO-014": "Androgenetic Alopecia",
    "DEMO-015": "Telogen Effluvium",
    "DEMO-016": "Alopecia Areata",
    "DEMO-017": "Seborrheic Dermatitis",
    "DEMO-018": "Hair Shaft Damage / Weathering",
    "DEMO-019": "Lichen Planopilaris / Inflammatory Scarring Alopecia",
    "DEMO-020": "Androgenetic Alopecia — frontotemporal and vertex pattern",
  });

  for (const scenario of showcase) {
    for (const visit of scenario.visits) {
      assert.equal(/[\u0600-\u06ff]/u.test(JSON.stringify({
        diagnoses: visit.diagnoses,
        treatments: visit.treatments,
        procedures: visit.procedures,
        clinical: visit.clinical,
      })), false, `${scenario.mrn} physician content is English-only`);
    }
  }
});

test("showcase pathway boundaries and longitudinal references are coherent", () => {
  const byMrn = new Map(CLINICIAN_DEMO_SCENARIOS.map((scenario) => [scenario.mrn, scenario]));
  const hairQuality = byMrn.get("DEMO-018")!;
  assert.equal(hairQuality.gender, "FEMALE");
  assert.equal(hairQuality.primary, "RV_HAIR_QUALITY");
  assert.equal(hairQuality.visits[0]?.clinical, undefined);

  const combinedDraft = buildSyntheticDraft(syntheticCaseForDemo(byMrn.get("DEMO-019")!));
  assert.equal(combinedDraft.answers.Q_VISIT_PRIMARY_REASON, "RV_HAIR_LOSS");
  assert.equal(combinedDraft.answers.Q_SECONDARY_SCALP_GATE, "YES");

  const longitudinal = byMrn.get("DEMO-020")!;
  assert.equal(longitudinal.visits.length, 3);
  assert.deepEqual(
    longitudinal.visits.map((visit) => visit.treatments.map((decision) => decision.action)),
    [["START"], ["CONTINUE_EXISTING"], ["MODIFY"]],
  );
  assert.deepEqual(
    longitudinal.visits.map((visit) => visit.procedures.map((decision) => decision.action)),
    [["PLAN"], ["PERFORM"], []],
  );

  const treatmentKeys = new Set<string>();
  const procedureKeys = new Set<string>();
  for (const visit of longitudinal.visits) {
    for (const decision of visit.treatments) {
      if (decision.action === "START") treatmentKeys.add(decision.key);
      else assert.ok(treatmentKeys.has(decision.targetKey));
    }
    for (const decision of visit.procedures) {
      if (decision.action === "PLAN") procedureKeys.add(decision.key);
      else if (decision.targetKey) assert.ok(procedureKeys.has(decision.targetKey));
    }
  }
});

test("demo state distribution, chronology, and clinical decisions are intentional", () => {
  const visits = CLINICIAN_DEMO_SCENARIOS.flatMap((scenario) => scenario.visits);
  assert.equal(visits.filter((visit) => visit.workflowState === "AWAITING_REVIEW").length, 1);
  assert.equal(visits.filter((visit) => visit.workflowState === "DRAFT").length, 1);
  assert.ok(visits.filter((visit) => visit.workflowState === "FINALIZED").length >= 10);
  assert.ok(CLINICIAN_DEMO_SCENARIOS.filter((scenario) => scenario.visits.filter((visit) => visit.workflowState === "FINALIZED").length > 1).length >= 2);

  for (const scenario of CLINICIAN_DEMO_SCENARIOS) {
    const times = scenario.visits.map((visit) => Date.parse(visit.occurredAt));
    assert.deepEqual(times, [...times].sort((a, b) => a - b), `${scenario.mrn} chronology`);
    assert.ok(times.every((time) => time <= CLINICIAN_DEMO_AS_OF.getTime()), `${scenario.mrn} has no future Visit`);
    for (const visit of scenario.visits.filter((candidate) => candidate.workflowState === "FINALIZED")) {
      assert.ok(visit.diagnoses.length > 0, `${scenario.mrn} finalized Visit has a diagnosis decision`);
      assert.ok(visit.treatments.length + visit.procedures.length > 0, `${scenario.mrn} finalized Visit has treatment/procedure content`);
      for (const procedure of visit.procedures) {
        const clinicalDate = "performedDate" in procedure
          ? procedure.performedDate
          : "plannedDate" in procedure ? procedure.plannedDate : undefined;
        if (clinicalDate) assert.ok(Date.parse(clinicalDate) <= CLINICIAN_DEMO_AS_OF.getTime(), `${scenario.mrn} procedure date`);
      }
    }
    if (scenario.correctHairHistoryOnset) assert.ok(Date.parse(scenario.correctHairHistoryOnset) <= CLINICIAN_DEMO_AS_OF.getTime());
    if (scenario.addendum) assert.ok(Date.parse(scenario.addendum.createdAt) <= CLINICIAN_DEMO_AS_OF.getTime());
  }

  assert.ok(CLINICIAN_DEMO_SCENARIOS.some((scenario) => scenario.correctHairHistoryOnset));
  assert.ok(CLINICIAN_DEMO_SCENARIOS.some((scenario) => scenario.addendum));
});

test("demo trichoscopy and anatomical-map content uses only governed codes", () => {
  for (const scenario of CLINICIAN_DEMO_SCENARIOS) {
    for (const visit of scenario.visits) {
      for (const code of visit.clinical?.trichoscopy?.selectedFindingCodes ?? []) {
        assert.ok((PHYSICIAN_TRICHOSCOPY_FINDING_CODES as readonly string[]).includes(code), `${scenario.mrn}: ${code}`);
      }
      for (const region of visit.clinical?.anatomicalMap?.regions ?? []) {
        assert.ok((PHYSICIAN_ANATOMICAL_REGION_CODES as readonly string[]).includes(region.anatomicalRegionCode), `${scenario.mrn}: ${region.anatomicalRegionCode}`);
        assert.ok(
          (PHYSICIAN_ANATOMICAL_REGION_CODES_BY_VIEW[region.view] as readonly string[]).includes(region.anatomicalRegionCode),
          `${scenario.mrn}: ${region.anatomicalRegionCode} belongs to ${region.view}`,
        );
        assert.ok(region.geometry && typeof region.geometry === "object");
      }
    }
  }
});

test("all demo intake fixtures resolve through the real governed catalogue", () => {
  for (const scenario of CLINICIAN_DEMO_SCENARIOS) {
    const draft = buildSyntheticDraft(syntheticCaseForDemo(scenario));
    assert.equal(draft.answers.Q_PROFILE_FULL_NAME, scenario.name);
    assert.equal(draft.answers.Q_PROFILE_SEX, scenario.gender);
    assert.equal(draft.answers.Q_VISIT_PRIMARY_REASON, scenario.primary);
  }
});

test("demo tooling adds no migration and is not imported by active runtime", () => {
  const migrations = readdirSync(new URL("../prisma/migrations", import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.length, 20);
  assert.equal(migrations.some((name) => name.startsWith("202609" ) && name.includes("migration_21")), false);

  const runtimeRoots = ["../app", "../lib"];
  for (const root of runtimeRoots) {
    const absoluteRoot = new URL(root, import.meta.url).pathname;
    const pending = [absoluteRoot];
    while (pending.length > 0) {
      const current = pending.pop()!;
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) pending.push(path);
        else if (/\.(?:ts|tsx)$/.test(entry.name)) {
          assert.equal(readFileSync(path, "utf8").includes("clinician-demo-scenarios"), false, path);
        }
      }
    }
  }
});
