import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { VisitDraftAutosave, VisitDraftAcknowledgement, sameDraftContent, type DraftSaveCommand, type DraftSaveState } from "../lib/physician/visit-draft-autosave";
import { VisitDecisionComposer } from "../lib/physician/visit-decision-composer";
import { parseGovernedDraftSection } from "../lib/physician/visit-clinical-contracts";
import { buildPreFinalizeReview } from "../lib/physician/visit-workspace";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("Visit autosave debounces rapid typing and coalesces a section to its latest value", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls: DraftSaveCommand[] = [];
  const queue = new VisitDraftAutosave(async (command) => { calls.push(command); return command.expectedDraftVersion + 1; });
  queue.initialize(4);
  queue.edit("DIAGNOSIS", { decisions: [{ action: "ADD", text: "a" }] });
  t.mock.timers.tick(400);
  queue.edit("DIAGNOSIS", { decisions: [{ action: "ADD", text: "alopecia" }] });
  t.mock.timers.tick(649);
  assert.equal(calls.length, 0);
  t.mock.timers.tick(1);
  await queue.flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedDraftVersion, 4);
  assert.deepEqual(calls[0].value, { decisions: [{ action: "ADD", text: "alopecia" }] });
  assert.equal(queue.hasUnsavedChanges(), false);
});

test("all clinical sections share one serialized version chain; editing during save keeps newer values", async () => {
  const first = deferred<number>();
  const calls: DraftSaveCommand[] = [];
  const queue = new VisitDraftAutosave(async (command) => {
    calls.push(command);
    return calls.length === 1 ? first.promise : command.expectedDraftVersion + 1;
  });
  queue.initialize(10);
  queue.edit("EXAMINATION", { hairPull: "POSITIVE" });
  const completion = queue.flush();
  queue.edit("EXAMINATION", { hairPull: "NEGATIVE" });
  queue.edit("MEASUREMENTS", { SHEDDING: 2 });
  queue.edit("PATTERN", { sinclair: 3 });
  queue.edit("TRICHOSCOPY", { selectedFindingCodes: ["YELLOW_DOTS"] });
  queue.edit("ANATOMICAL_MAP", { regions: [] });
  queue.edit("DIAGNOSIS", { decisions: [{ action: "ADD", text: "physician assessment" }] });
  queue.edit("TREATMENT_PROCEDURES", { treatments: [], procedures: [] });
  assert.equal(queue.flush(), completion, "Finalize/Retry must join the same in-flight drain");
  assert.equal(calls.length, 1, "no parallel section writes");
  queue.initialize(100);
  first.resolve(11);
  assert.equal(await completion, true);
  assert.deepEqual(calls.map((call) => call.expectedDraftVersion), [10, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual(calls[1].value, { hairPull: "NEGATIVE" });
  assert.equal(queue.getVersion(), 18);
});

test("failure retains newest edits, remains visible while typing, and Retry resumes from last acknowledged version", async () => {
  const attempt = deferred<number>();
  const states: DraftSaveState[] = [];
  const calls: DraftSaveCommand[] = [];
  const queue = new VisitDraftAutosave(async (command) => { calls.push(command); return calls.length === 1 ? attempt.promise : command.expectedDraftVersion + 1; });
  queue.initialize(2);
  queue.subscribe((state) => states.push(state));
  queue.edit("MEASUREMENTS", { SHEDDING: 1 });
  const saving = queue.flush();
  queue.edit("MEASUREMENTS", { SHEDDING: 4 });
  attempt.reject(new Error("network unavailable"));
  assert.equal(await saving, false);
  assert.equal(queue.hasUnsavedChanges(), true);
  queue.edit("MEASUREMENTS", { SHEDDING: 5 });
  assert.equal(states.at(-1), "failed");
  assert.equal(await queue.flush(), true);
  assert.equal(calls[1].expectedDraftVersion, 2);
  assert.deepEqual(calls[1].value, { SHEDDING: 5 });
  assert.equal(states.at(-1), "saved");
});

test("Finalize waits for every queued edit, uses final version, and is not called on save failure", async () => {
  const first = deferred<number>();
  let count = 0;
  let finalizedVersion: number | undefined;
  const queue = new VisitDraftAutosave(async (command) => ++count === 1 ? first.promise : command.expectedDraftVersion + 1);
  queue.initialize(1);
  queue.edit("PATTERN", { sinclair: 2 });
  const finalize = async () => { if (await queue.flush()) finalizedVersion = queue.getVersion(); };
  const completing = finalize();
  queue.edit("MEASUREMENTS", { DENSITY_LOSS: 3 });
  assert.equal(finalizedVersion, undefined);
  first.resolve(2);
  await completing;
  assert.equal(finalizedVersion, 3);
  const failed = new VisitDraftAutosave(async () => { throw new Error("DRAFT_CONFLICT"); });
  failed.initialize(3);
  failed.edit("PATTERN", { sinclair: 4 });
  let called = false;
  if (await failed.flush()) called = true;
  assert.equal(called, false);
  assert.equal(failed.getVersion(), 3);
});

test("lost response after commit is recovered without duplicate save, then newer typing uses recovered version", async () => {
  const calls: DraftSaveCommand[] = [];
  let recovered: DraftSaveCommand | undefined;
  const queue = new VisitDraftAutosave(async (command) => {
    calls.push(command);
    if (calls.length === 1) throw new Error("response lost after commit");
    return command.expectedDraftVersion + 1;
  }, 650, async (attempted) => { recovered = attempted; return attempted.expectedDraftVersion + 1; });
  queue.initialize(5);
  queue.edit("MEASUREMENTS", { ITCH: 1 });
  assert.equal(await queue.flush(), false);
  queue.edit("MEASUREMENTS", { ITCH: 4 });
  assert.equal(await queue.flush(), true);
  assert.deepEqual(recovered?.value, { ITCH: 1 });
  assert.equal(calls[1].expectedDraftVersion, 6);
  assert.deepEqual(calls[1].value, { ITCH: 4 });
});

test("recovered unchanged save becomes Saved without sending a duplicate decision", async () => {
  let count = 0;
  const queue = new VisitDraftAutosave(async () => { count++; throw new Error("lost response"); }, 650, async () => 2);
  queue.initialize(1);
  queue.edit("DIAGNOSIS", { decisions: [{ action: "ADD", text: "assessment" }] });
  await queue.flush();
  assert.equal(await queue.flush(), true);
  assert.equal(count, 1);
  assert.equal(queue.hasUnsavedChanges(), false);
});

test("external version conflict never silently rebases or discards local changes", async () => {
  let count = 0;
  const queue = new VisitDraftAutosave(async () => { count++; throw new Error("DRAFT_CONFLICT"); }, 650, async () => { throw new Error("different remote content"); });
  queue.initialize(3);
  queue.edit("PATTERN", { sinclair: 5 });
  assert.equal(await queue.flush(), false);
  assert.equal(await queue.flush(), false);
  assert.equal(count, 1);
  assert.equal(queue.getVersion(), 3);
  assert.equal(queue.hasUnsavedChanges(), true);
});

test("draft comparison ignores object-key order but preserves arrays, omissions, and values", () => {
  assert.equal(sameDraftContent({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  assert.equal(sameDraftContent({ a: [1, 2] }, { a: [2, 1] }), false);
  assert.equal(sameDraftContent({ a: 1 }, { a: 1, b: 2 }), false);
});

test("a timer queued while saving cannot silently retry after failure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const response = deferred<number>();
  let calls = 0;
  const states: DraftSaveState[] = [];
  const queue = new VisitDraftAutosave(async () => { calls++; return response.promise; });
  queue.initialize(1);
  queue.subscribe((state) => states.push(state));
  queue.edit("MEASUREMENTS", { ITCH: 1 });
  const saving = queue.flush();
  queue.edit("MEASUREMENTS", { ITCH: 2 });
  response.reject(new Error("offline"));
  await saving;
  t.mock.timers.tick(5_000);
  assert.equal(calls, 1);
  assert.equal(states.at(-1), "failed");
});

test("ambiguous-write recovery compares every section and governed normalization", () => {
  const acknowledgement = new VisitDraftAcknowledgement();
  acknowledgement.acknowledge({ EXAMINATION: { hairPull: "NEGATIVE" }, MEASUREMENTS: { ITCH: 2 } });
  const normalized = parseGovernedDraftSection("DIAGNOSIS", { decisions: [{ action: "ADD", text: "  physician assessment  " }] });
  const expected = { EXAMINATION: { hairPull: "NEGATIVE" }, MEASUREMENTS: { ITCH: 2 }, DIAGNOSIS: normalized };
  assert.equal(acknowledgement.matchesAttempt(expected, "DIAGNOSIS", normalized), true);
  assert.equal(acknowledgement.matchesAttempt({ ...expected, MEASUREMENTS: { ITCH: 5 } }, "DIAGNOSIS", normalized), false);
});

test("decision typing updates one entry, another decision appends, incomplete typing leaves last valid entry intact", () => {
  const composer = new VisitDecisionComposer();
  let items = composer.update([], { action: "ADD", text: "a" })!;
  items = composer.update(items, { action: "ADD", text: "alopecia" })!;
  assert.equal(items.length, 1);
  assert.equal(composer.update(items, null), null);
  assert.equal(items[0].text, "alopecia");
  composer.next();
  items = composer.update(items, { action: "ADD", text: "second assessment" })!;
  assert.equal(items.length, 2);
  items = composer.remove(items, 0);
  items = composer.update(items, { action: "ADD", text: "revised second assessment" })!;
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "revised second assessment");
  items = composer.remove(items, 0);
  assert.deepEqual(composer.update(items, { action: "ADD", text: "new" }), [{ action: "ADD", text: "new" }]);
});

test("autosaved physician decisions remain governed and readable in pre-Finalize review", () => {
  const diagnosis = parseGovernedDraftSection("DIAGNOSIS", { decisions: [{ action: "ADD", text: "Physician assessment" }] });
  const treatment = parseGovernedDraftSection("TREATMENT_PROCEDURES", { treatments: [{ action: "START", name: "Physician treatment" }], procedures: [{ action: "PLAN", procedureCode: "OTHER", otherProcedureText: "Physician procedure" }] });
  const groups = buildPreFinalizeReview({ DIAGNOSIS: diagnosis, TREATMENT_PROCEDURES: treatment }, { diagnoses: [], treatmentCourses: [], procedurePlans: [] }, "en");
  const readable = JSON.stringify(groups);
  for (const value of ["Physician assessment", "Physician treatment", "Physician procedure"]) assert.ok(readable.includes(value));
});

test("workspace wiring removes Save buttons, preserves section mounting, gates Finalize and navigation", () => {
  const source = readFileSync(new URL("../app/physician/patients/[patientId]/physician-visit-workspace.tsx", import.meta.url), "utf8");
  for (const removed of ["saveSection", "onSave=", "Save Diagnosis", "Save Treatments & Procedures", "Section saved."]) assert.equal(source.includes(removed), false);
  assert.ok(source.includes('hidden={panel !== "TODAY"}'));
  assert.ok(source.includes('if (!await autosave.flush()) return false;'));
  assert.ok(source.includes('expectedDraftVersion: autosave.getVersion()'));
  assert.ok(source.includes('incompleteDecisions.current'));
  assert.ok(source.includes('saveState !== "failed" && !hasIncompleteDecision'));
  const parent = readFileSync(new URL("../app/physician/patients/[patientId]/physician-patient-workspace.tsx", import.meta.url), "utf8");
  assert.ok(parent.includes("await workspaceLeaveGuard.current()"));
  const readModel = readFileSync(new URL("../lib/physician/read-model.ts", import.meta.url), "utf8");
  assert.ok(readModel.includes("select: { view: true, anatomicalRegionCode: true, geometry: true, noteText: true }"));
});
