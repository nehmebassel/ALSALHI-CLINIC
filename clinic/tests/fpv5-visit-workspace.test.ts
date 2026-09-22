import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { clinicDateInputValue } from "../lib/platform/date-time";
import {
  buildPreFinalizeReview,
  canAddDiagnosisDecision,
  canAddTreatmentDecision,
  deriveMcuFvWorkspaceCode,
  freshWorkspaceSections,
  presentHairLineDistance,
  presentLongitudinalDecision,
  presentPatientContextValue,
  presentProcedurePlanTarget,
  presentTreatmentTarget,
  readOnlyAnatomicalMapViews,
  visitDraftHasPatientPromotion,
  workspaceErrorMessage,
} from "../lib/physician/visit-workspace";

const workspace = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
const parent = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.module.css", import.meta.url), "utf8");
const effectiveState = {
  diagnoses: [{ diagnosisId: "diagnosis-1", text: "Androgenetic alopecia" }],
  treatmentCourses: [{ treatmentCourseId: "treatment-1", name: "Topical minoxidil", regimenText: "Once daily" }],
  procedurePlans: [{ procedurePlanId: "plan-1", procedureCode: "PRP", otherProcedureText: null }],
};

test("FPV-5 Visit 1 starts from only its own canonical Draft envelope", () => {
  const sections = freshWorkspaceSections({ schemaVersion: "FPV_DRAFT_V1", sections: { DIAGNOSIS: { decisions: [{ action: "ADD", text: "Provisional" }] } } });
  assert.deepEqual(sections, { DIAGNOSIS: { decisions: [{ action: "ADD", text: "Provisional" }] } });
  assert.notEqual(sections, (sections as unknown as { sections?: unknown }).sections);
  assert.deepEqual(freshWorkspaceSections({ schemaVersion: "OTHER", sections: { PATTERN: { sinclair: 4 } } }), {});
});

test("FPV-5 follow-up keeps Effective Physician State out of today's Draft", () => {
  const response = {
    physicianVisitRecord: { draftJson: { schemaVersion: "FPV_DRAFT_V1", sections: {} } },
    effectivePhysicianState: { diagnoses: [{ diagnosisId: "prior", text: "Prior", status: "ACTIVE" }] },
  };
  assert.deepEqual(freshWorkspaceSections(response.physicianVisitRecord.draftJson), {});
  assert.equal(workspace.includes("Clinical state before today's Visit"), true);
  assert.equal(workspace.includes("Read only"), true);
  assert.equal(workspace.includes('freshWorkspaceSections(loaded.physicianVisitRecord?.draftJson)'), true);
});

test("FPV-5 Patient Context remains distinct while evidence endpoints stay governed outside the compact UI", () => {
  const reviewRoute = fs.readFileSync(new URL("../app/api/physician/visits/[visitId]/patient-context/reviews/route.ts", import.meta.url), "utf8");
  const reconciliationRoute = fs.readFileSync(new URL("../app/api/physician/visits/[visitId]/patient-context/reconciliations/route.ts", import.meta.url), "utf8");
  assert.equal(workspace.includes("Patient Context"), true);
  for (const removedFromUi of ["Patient-reported reference", "/patient-context/reviews", "/patient-context/reconciliations", "Record item review"]) assert.equal(workspace.includes(removedFromUi), false, removedFromUi);
  for (const required of ["contextFingerprint"]) assert.equal(reviewRoute.includes(required), true, required);
  for (const required of ["contextFingerprint", "contextItemId"]) assert.equal(reconciliationRoute.includes(required), true, required);
  assert.equal(workspace.includes("noteText"), true, "noteText may exist for treatment/procedure fields");
  assert.equal(reconciliationRoute.includes("noteText"), false);
});

test("FPV-5 Patient Context presentation removes source registry metadata while preserving values", () => {
  assert.deepEqual(presentPatientContextValue({ items: [{ questionCode: "Q_HEALTH_MEDICATION_ITEMS", subtype: "MEDICATION", value: { name: "Levothyroxine" } }] }, "en"), [
    { title: "Current medication", fields: [{ label: "Name", values: ["Levothyroxine"] }] },
  ]);
  assert.deepEqual(presentPatientContextValue({ value: "MARRIED" }, "ar"), [{ title: null, fields: [{ label: null, values: ["متزوج/ة"] }] }]);
});

test("FPV-5 Patient Context preserves separate structured medication items and repeated values", () => {
  const presented = presentPatientContextValue({ items: [
    { questionCode: "Q_HEALTH_MEDICATION_ITEMS", value: { name: "Medicine A", dose: "5 mg", frequency: "Daily" } },
    { questionCode: "Q_HEALTH_MEDICATION_ITEMS", value: { name: "Medicine B", dose: "5 mg", frequency: "Daily" } },
  ] }, "en");
  assert.equal(presented.length, 2);
  assert.deepEqual(presented.map((item) => item.fields.find((field) => field.label === "Name")?.values[0]), ["Medicine A", "Medicine B"]);
  assert.deepEqual(presented.map((item) => item.fields.find((field) => field.label === "Dose")?.values[0]), ["5 mg", "5 mg"]);
  assert.deepEqual(presented.map((item) => item.fields.find((field) => field.label === "Frequency")?.values[0]), ["Daily", "Daily"]);
});

test("FPV-5 structured Patient Context uses governed labels instead of question codes", () => {
  const presented = presentPatientContextValue({ fields: [
    { questionCode: "Q_WOMEN_CONTRACEPTION_STATUS", value: "CURRENT" },
    { questionCode: "Q_WOMEN_CONTRACEPTION_TYPE", value: ["PILLS", "HORMONAL_IUD"] },
  ] }, "en");
  assert.deepEqual(presented[0].fields, [
    { label: "Use status", values: ["Currently using"] },
    { label: "Method type", values: ["Contraceptive pills", "Hormonal IUD"] },
  ]);
  assert.equal(JSON.stringify(presented).includes("Q_WOMEN"), false);
});

test("FPV-5 stale Draft and stale Context errors are explicit and safe", () => {
  assert.match(workspaceErrorMessage("DRAFT_CONFLICT", "en"), /newer Draft/);
  assert.match(workspaceErrorMessage("PATIENT_CONTEXT_VERSION_CONFLICT", "en"), /Patient Context changed/);
  assert.equal(workspace.includes('setSaveFailureCode("DRAFT_CONFLICT")'), true);
  assert.match(workspaceErrorMessage("DRAFT_CONFLICT", "en"), /Your edits remain here/);
  assert.equal(workspace.includes('setNotice(workspaceErrorMessage(failure?.code, locale))'), true);
  assert.equal(workspace.includes('if (failure?.code === "DRAFT_CONFLICT" || failure?.code === "PATIENT_CONTEXT_VERSION_CONFLICT") await reload()'), false, "a failed action must not discard newer local edits");
});

test("FPV-5 authorization keeps STAFF preparation/editing separate from physician-only actions", () => {
  assert.equal(workspace.includes('type ActorRole = "STAFF" | "PHYSICIAN"'), true);
  assert.equal(workspace.includes('actorRole === "PHYSICIAN"'), true);
  assert.equal(workspace.includes("/prepare"), true);
  assert.equal(workspace.includes("/draft"), true);
  assert.equal(workspace.includes("isPhysician &&"), true);
  assert.equal(workspace.includes("/begin-encounter"), true);
  assert.equal(workspace.includes("/finalize"), true);
  assert.equal(parent.includes('actorRole="PHYSICIAN"'), true);
});

test("FPV-5 Pattern Assessment derives MCU/FV code and accepts decimal centimetres", () => {
  assert.equal(deriveMcuFvWorkspaceCode({ basic: "M2" }), "M2");
  assert.equal(deriveMcuFvWorkspaceCode({ basic: "M2", frontal: "F2", vertex: "V1" }), "M2F2V1");
  assert.equal(workspace.includes('step="0.01"'), true);
  assert.equal(workspace.includes("hairLineDistanceCm"), true);
  assert.equal(workspace.includes("MCU_FV_BASIC_VALUES"), true);
});

test("FPV-5 renders all five approved physician measures without inventing a scale", () => {
  for (const code of ["SHEDDING", "DENSITY_LOSS", "ITCH", "BURNING", "SCALP_PAIN"]) assert.equal(workspace.includes(code), true, code);
  assert.equal(workspace.includes("[0,1,2,3,4,5]"), true);
});

test("FPV-5 Trichoscopy and Anatomical Map remain optional Visit-local sections", () => {
  assert.equal(workspace.includes("PHYSICIAN_TRICHOSCOPY_FINDINGS.map"), true);
  assert.equal(workspace.includes("selectedFindingCodes"), true);
  assert.equal(workspace.includes("otherFindingText"), true);
  assert.equal(workspace.includes("PHYSICIAN_ANATOMICAL_MAP_VIEWS.map"), true);
  assert.equal(workspace.includes("radius: 0.012"), true);
  assert.equal(workspace.includes("(event.clientX - bounds.left) / bounds.width"), true);
  assert.equal(workspace.includes("/scalp-map/front.png"), true);
  assert.equal(workspace.includes("Draw directly over the scalp"), true);
});

test("FPV-5 supports governed longitudinal action sets and no mandatory continue", () => {
  for (const action of ["ADD", "REVISE", "RESOLVE", "START", "MODIFY", "STOP", "CONTINUE_EXISTING", "PLAN", "PERFORM", "CANCEL_OR_DEFER"]) assert.equal(workspace.includes(action), true, action);
  assert.equal(workspace.includes("without a mandatory continue decision"), false);
  assert.equal(workspace.includes('t("استمرار", "Continue")'), true);
  assert.equal(workspace.includes('t("إجراء مستقل", "Independent procedure")'), true);
  assert.equal(workspace.includes("procedurePlanId"), true);
});

test("FPV-5 target decisions resolve human-readable canonical labels", () => {
  assert.equal(presentLongitudinalDecision({ action: "RESOLVE", diagnosisId: "diagnosis-1" }, effectiveState, "en"), "Androgenetic alopecia");
  assert.equal(presentLongitudinalDecision({ action: "STOP", treatmentCourseId: "treatment-1" }, effectiveState, "en"), "Topical minoxidil — Once daily");
  assert.equal(presentLongitudinalDecision({ action: "CANCEL_OR_DEFER", procedurePlanId: "plan-1" }, effectiveState, "en"), "PRP / Platelet-Rich Plasma");
  assert.equal(presentLongitudinalDecision({ action: "PERFORM", procedurePlanId: "plan-1", performedDate: "2026-09-02" }, effectiveState, "en"), "PRP / Platelet-Rich Plasma");
});

test("FPV-5 pre-Finalize review contains actual observations and target decision content", () => {
  const review = buildPreFinalizeReview({
    EXAMINATION: { hairPull: "POSITIVE" },
    MEASUREMENTS: { SHEDDING: 4 },
    PATTERN: { sinclair: 3, hairLineDistanceCm: { midline: 6.5 } },
    DIAGNOSIS: { decisions: [{ action: "RESOLVE", diagnosisId: "diagnosis-1" }] },
    TREATMENT_PROCEDURES: {
      treatments: [{ action: "STOP", treatmentCourseId: "treatment-1" }],
      procedures: [{ action: "CANCEL_OR_DEFER", procedurePlanId: "plan-1" }],
    },
    TRICHOSCOPY: { selectedFindingCodes: ["YELLOW_DOTS"] },
    ANATOMICAL_MAP: { regions: [{ view: "FRONT", anatomicalRegionCode: "FRONTAL_SCALP", geometry: { version: 1, strokes: [] } }] },
  }, effectiveState, "en");
  const content = review.flatMap((group) => group.items).join(" | ");
  assert.match(content, /Hair Pull: Positive/);
  assert.match(content, /Shedding: 4\/5/);
  assert.match(content, /Midline: 6.5 cm/);
  assert.match(content, /Diagnosis resolved · Androgenetic alopecia/);
  assert.match(content, /Treatment stopped · Topical minoxidil/);
  assert.match(content, /Procedure cancelled or deferred · PRP/);
  assert.match(content, /Yellow dots/);
  assert.match(content, /Frontal scalp/);
});

test("FPV-5 finalized Hair Line Distance retains positional association", () => {
  assert.deepEqual(presentHairLineDistance({ unit: "cm", midline: "6", rightSide: "7", leftSide: "8" }, "en"), [
    { position: "midline", label: "Midline", value: "6 cm" },
    { position: "rightSide", label: "Right side", value: "7 cm" },
    { position: "leftSide", label: "Left side", value: "8 cm" },
  ]);
});

test("FPV-5 finalized Anatomical Map model preserves geometry, color, note, and read-only state", () => {
  const geometry = { version: 1, strokes: [{ radius: 0.012, points: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.5 }] }] };
  const views = readOnlyAnatomicalMapViews({ regions: [{ view: "FRONT", geometry, displayColorHex: "#A86A3D", noteText: "Frontal region" }] });
  assert.deepEqual(views.map((item) => item.view), ["FRONT", "TOP", "RIGHT_SIDE", "LEFT_SIDE"]);
  assert.equal(views.every((item) => item.editable === false), true);
  assert.deepEqual(views[0].regions[0], { view: "FRONT", geometry, displayColorHex: "#A86A3D", noteText: "Frontal region" });
  assert.equal(workspace.includes('data-read-only="true"'), true);
});

test("FPV-5 prevents future performed dates in the UI while the backend remains authoritative", () => {
  assert.equal(clinicDateInputValue("2026-09-01T20:59:59.000Z"), "2026-09-01");
  assert.equal(clinicDateInputValue("2026-09-01T21:00:00.000Z"), "2026-09-02");
  assert.equal(clinicDateInputValue("2026-09-01T23:59:59.000Z"), "2026-09-02");
  assert.equal(workspace.includes('max={procedureAction === "PERFORM" ? clinicDateInputValue() : undefined}'), true);
  assert.equal(workspace.includes('procedureDate && procedureDate <= clinicDateInputValue()'), true);
});

test("FPV-5 rejects locally invalid empty REVISE and no-op MODIFY decisions", () => {
  assert.equal(canAddDiagnosisDecision({ action: "REVISE", targetId: "diagnosis-1", text: "   " }), false);
  assert.equal(canAddDiagnosisDecision({ action: "REVISE", targetId: "diagnosis-1", text: "Revised diagnosis" }), true);
  assert.equal(canAddTreatmentDecision({ action: "MODIFY", targetId: "treatment-1", name: "", regimenText: "" }), false);
  assert.equal(canAddTreatmentDecision({ action: "MODIFY", targetId: "treatment-1", name: "Topical minoxidil", regimenText: "Once daily", currentName: "Topical minoxidil", currentRegimenText: "Once daily" }), false);
  assert.equal(canAddTreatmentDecision({ action: "MODIFY", targetId: "treatment-1", name: "", regimenText: "Twice daily", currentName: "Topical minoxidil", currentRegimenText: "Once daily" }), true);
});

test("FPV-5 Finalize reads canonical truth and does not casually reopen a finalized Draft", () => {
  assert.equal(workspace.includes("canonicalClinicalData"), true);
  assert.equal(workspace.includes("Visit clinical record"), true);
  assert.equal(workspace.includes("Correct the available fields below during the correction window."), true);
  assert.equal(workspace.includes("correction?.eligible"), true);
  assert.equal(workspace.includes("/corrections"), true);
  assert.equal(workspace.includes("/addenda"), true);
});

test("FPV-5 rejects accidental patient provenance promotion before save", () => {
  assert.equal(visitDraftHasPatientPromotion({ DIAGNOSIS: { patientResponseId: "source" } }), true);
  assert.equal(visitDraftHasPatientPromotion({ TREATMENT_PROCEDURES: { treatments: [{ action: "START", name: "Physician-authored" }] } }), false);
  assert.equal(workspace.includes("visitDraftHasPatientPromotion({ [command.section]: command.value })"), true);
});

test("FPV-5 remains under Visits and preserves the five approved primary tabs", () => {
  assert.equal(parent.includes('type WorkspaceTab = "SUMMARY" | "STORY" | "HISTORY" | "JOURNEY" | "VISITS"'), true);
  assert.equal(parent.includes("<PhysicianVisitWorkspace"), true);
  assert.equal(parent.includes('activeTab === "VISITS"'), true);
  assert.equal(parent.includes("View full interview") && !parent.includes('value: "INTERVIEW"'), true);
});

test("FPV-5 uses a generous desktop grid with scoped responsive RTL-compatible CSS", () => {
  assert.equal(css.includes("grid-template-columns: repeat(3"), true);
  assert.equal(css.includes("border-inline-start"), true);
  assert.equal(css.includes("@media (max-width: 760px)"), true);
  assert.equal(workspace.includes("dir={dir}"), true);
});

test("FPV-5 OTHER procedure plans remain distinguishable by governed otherProcedureText", () => {
  const first = { procedureCode: "OTHER", otherProcedureText: "Stem Cell Procedure" };
  const second = { procedureCode: "OTHER", otherProcedureText: "Custom Scalp Injection" };
  assert.equal(presentProcedurePlanTarget(first, "en"), "Stem Cell Procedure");
  assert.equal(presentProcedurePlanTarget(second, "en"), "Custom Scalp Injection");
  assert.notEqual(presentProcedurePlanTarget(first, "en"), presentProcedurePlanTarget(second, "en"));
  assert.equal(workspace.includes("presentProcedurePlanTarget(item, locale)"), true);
});

test("FPV-5 prior patient diagnoses use exact governed bilingual registry labels", () => {
  const payload = { fields: [{ questionCode: "Q_PRIOR_DIAGNOSES", value: [
    "PATTERN_HAIR_LOSS", "TRICHOTILLOMANIA", "TRACTION_ALOPECIA", "POSTPARTUM_SHEDDING",
    "TINEA_CAPITIS", "LUPUS", "ALOPECIA_AREATA", "TELOGEN_EFFLUVIUM",
    "SCARRING_ALOPECIA", "SEBORRHEIC_DERMATITIS", "SCALP_PSORIASIS", "SCALP_ROSACEA",
    "SCALP_ALLERGY", "HAIR_FRAGILITY", "DO_NOT_REMEMBER", "OTHER",
  ] }] };
  const en = presentPatientContextValue(payload, "en")[0].fields[0].values;
  const ar = presentPatientContextValue(payload, "ar")[0].fields[0].values;
  assert.deepEqual(en, [
    "Pattern Hair Loss (Androgenetic Alopecia)", "Trichotillomania", "Traction alopecia",
    "Postpartum or breastfeeding-related hair shedding", "Tinea capitis / scalp fungal infection", "Lupus",
    "Alopecia areata", "Telogen effluvium", "Scarring alopecia", "Seborrheic dermatitis / dandruff",
    "Scalp psoriasis", "Scalp rosacea", "Sensitive scalp", "Hair fragility or breakage",
    "I do not remember the diagnosis", "Other",
  ]);
  assert.deepEqual(ar, [
    "تساقط الشعر النمطي (الوراثي)", "نتف الشعر", "ثعلبة الشد / تساقط الشعر بسبب الشد",
    "تساقط الشعر بعد الولادة أو أثناء الرضاعة", "فطريات فروة الرأس", "الذئبة", "الثعلبة المناعية",
    "التساقط الكربي", "تساقط الشعر الندبي", "القشرة أو التهاب الجلد الدهني", "صدفية فروة الرأس",
    "وردية فروة الرأس", "حساسية فروة الرأس", "هشاشة الشعر أو تكسره", "لا أتذكر التشخيص", "أخرى",
  ]);
});

test("FPV-5 Arabic pre-Finalize measurements localize numerator and denominator", () => {
  const review = buildPreFinalizeReview({ MEASUREMENTS: { SHEDDING: 4 } }, effectiveState, "ar");
  const content = review.flatMap((group) => group.items).join(" | ");
  assert.match(content, /٤\/٥/);
  assert.equal(content.includes("٤/5"), false);
});

test("FPV-5 Treatment targets use regimen for duplicate-name disambiguation", () => {
  assert.equal(presentTreatmentTarget({ name: "Minoxidil", regimenText: "Once daily" }), "Minoxidil — Once daily");
  assert.equal(presentTreatmentTarget({ name: "Minoxidil", regimenText: "Twice daily" }), "Minoxidil — Twice daily");
  assert.equal(workspace.includes("presentTreatmentTarget(item)"), true);
});
