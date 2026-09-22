import assert from "node:assert/strict";
import test from "node:test";

import { mergeServerOwnedFollowUpContext } from "../lib/follow-up/autosave";
import { readFollowUpContext } from "../lib/follow-up/types";
import type { PatientInputJson } from "../lib/patient-access/service";
import type { P01FollowUpContext } from "../lib/follow-up/types";

const server: PatientInputJson = {
  locale: "ar",
  answers: {},
  followUp: {
    version: "P01_FOLLOW_UP_v5",
    mode: "RETURNING",
    patientId: "SERVER-PATIENT",
    identity: {
      fullName: "Server Name",
      dateOfBirth: "1990-01-01",
      sex: "FEMALE",
      maritalStatus: "NOT_MARRIED",
      mrn: "SERVER-MRN",
    },
    episodes: [{
      id: "EP-1",
      primaryReasonCode: "RV_HAIR_LOSS",
      labelAr: "تساقط الشعر",
      labelEn: "Hair Loss",
      lastVisitId: "VISIT-1",
      lastVisitAt: "2026-08-01T08:00:00.000Z",
      visitCount: 2,
        physicianContextAvailable: false,
    }],
    episodeState: [{
      episodeId: "EP-1",
      primaryReasonCode: "RV_HAIR_LOSS",
      physicianContextAvailable: false,
      currentTreatmentCount: 0,
      priorProcedureCount: 0,
      latestMeasurementCodes: [],
      importantEventTypes: [],
      physicianRoutedQuestionCodes: [],
      physicianChangeDomains: [],
    }],
    recordedQuestionCodes: [],
    snapshot: { generatedAt: "2026-08-17T08:00:00.000Z", entries: [] },
  },
};

test("autosave preserves server-owned identity, episodes, and snapshot", () => {
  const incoming: PatientInputJson = {
    locale: "en",
    answers: { Q_PATIENT_BOTHER: "3" },
    followUp: {
      version: "P01_FOLLOW_UP_v5",
      mode: "RETURNING",
      patientId: "ATTACKER-PATIENT",
      identity: {
        fullName: "Tampered",
        dateOfBirth: "2000-01-01",
        sex: "MALE",
        maritalStatus: "MARRIED",
        mrn: "TAMPERED-MRN",
      },
      episodes: [],
      episodeState: [],
      recordedQuestionCodes: [],
      snapshot: { generatedAt: "2099-01-01T00:00:00.000Z", entries: [] },
      intent: "EXISTING_CONCERN",
      selectedEpisodeId: "EP-1",
      changes: {
        generalHealth: "NO_CHANGE",
        triggerEvents: "INVALID_VALUE",
      },
      delta: {
        hairProcedures: { items: [{ id: "PRP", procedure: "PRP", count: "1" }] },
      },
      changesReviewed: true,
    },
  };

  const merged = mergeServerOwnedFollowUpContext(server, incoming);
  const followUp = merged.followUp as Record<string, unknown>;
  const identity = followUp.identity as Record<string, unknown>;

  assert.equal(followUp.patientId, "SERVER-PATIENT");
  assert.equal(identity.fullName, "Server Name");
  assert.equal(identity.sex, "FEMALE");
  assert.deepEqual(followUp.episodes, (server.followUp as Record<string, unknown>).episodes);
  assert.deepEqual(followUp.episodeState, (server.followUp as Record<string, unknown>).episodeState);
  assert.equal(followUp.selectedEpisodeId, "EP-1");
  assert.equal(followUp.selectedPrimaryReasonCode, "RV_HAIR_LOSS");
  assert.equal(followUp.sourceVisitId, "VISIT-1");
  assert.equal((followUp.changes as Record<string, unknown>).generalHealth, "NO_CHANGE");
  assert.equal((followUp.changes as Record<string, unknown>).triggerEvents, undefined);
  assert.equal(followUp.changesReviewed, true);
  assert.equal(((followUp.delta as Record<string, unknown>).hairProcedures as Record<string, unknown>).items instanceof Array, true);
  assert.deepEqual(merged.answers, { Q_PATIENT_BOTHER: "3" });
});


test("legacy v3 follow-up context migrates action strings, sex-specific responses, and recorded-question metadata", () => {
  const legacy = structuredClone(server) as PatientInputJson;
  const raw = legacy.followUp as Record<string, unknown>;
  raw.version = "P01_FOLLOW_UP_v3";
  delete raw.recordedQuestionCodes;
  const rawSnapshot = raw.snapshot as Record<string, unknown>;
  rawSnapshot.entries = [{
    questionCode: "Q_HAIR_CONCERN", labelAr: "", labelEn: "", value: "SHEDDING",
    responseScopeType: "PATHWAY", responseScopeKey: "HAIR", sourceResponseId: "R1",
    sourceVisitId: "V1", sourceVisitAt: "2026-08-01T08:00:00.000Z",
  }];
  raw.changes = { medicationsSupplements: "STOPPED" };
  raw.delta = { sexSpecific: { affectedCodes: ["IRREGULAR_CYCLES"] } };

  const migrated = readFollowUpContext(legacy);
  assert.ok(migrated);
  assert.equal(migrated.version, "P01_FOLLOW_UP_v6");
  assert.deepEqual(migrated.followUpHistory, []);
  assert.deepEqual(migrated.recordedQuestionCodes, ["Q_HAIR_CONCERN"]);
  assert.deepEqual(migrated.changes?.medicationsSupplements, ["STOPPED"]);
  assert.deepEqual(migrated.delta?.sexSpecific?.responses, {});
});

test("autosave canonicalizes longitudinal source references and drops forged procedure sources", () => {
  const source = structuredClone(server) as PatientInputJson;
  const followUp = source.followUp as unknown as P01FollowUpContext;
  followUp.recordedQuestionCodes = ["Q_HEALTH_MEDICATION_ITEMS", "Q_HAIR_PROCEDURE_DETAILS"];
  followUp.snapshot.entries = [
    {
      questionCode: "Q_HEALTH_MEDICATION_ITEMS", labelAr: "دواء", labelEn: "Medication",
      value: { name: "Canonical medicine" }, responseScopeType: "MEDICATION_ITEM", responseScopeKey: "MED:1",
      sourceResponseId: "MED-R1", sourceVisitId: "VISIT-1", sourceVisitAt: "2026-08-01T08:00:00.000Z",
    },
    {
      questionCode: "Q_HAIR_PROCEDURE_DETAILS", labelAr: "إجراء", labelEn: "Procedure",
      value: { procedure: "PRP", count: "3", lastDate: "2026-07" }, responseScopeType: "PROCEDURE_SELECTION", responseScopeKey: "PROC:1",
      sourceResponseId: "PROC-R1", sourceVisitId: "VISIT-1", sourceEpisodeId: "EP-1", sourceVisitAt: "2026-08-01T08:00:00.000Z",
    },
  ];

  const incoming: PatientInputJson = {
    locale: "ar", answers: {},
    followUp: {
      version: "P01_FOLLOW_UP_v5", mode: "RETURNING", patientId: "FORGED",
      identity: followUp.identity, episodes: [], episodeState: [], recordedQuestionCodes: [],
      snapshot: { generatedAt: "2099-01-01T00:00:00.000Z", entries: [] },
      intent: "EXISTING_CONCERN", selectedEpisodeId: "EP-1",
      changes: { medicationsSupplements: ["STOPPED"], hairProcedures: "YES" },
      delta: {
        medicationsSupplements: {
          startedMedications: [], startedSupplements: [],
          affectedExisting: [{ sourceResponseId: "MED-R1", sourceQuestionCode: "Q_HEALTH_MEDICATION_ITEMS", sourceScopeKey: "MED:1", itemLabel: "Tampered label", action: "STOPPED", date: "2026-08" }],
        },
        hairProcedures: { items: [
          { id: "P1", procedure: "PRP", count: "1", lastDate: "2026-08", sourceResponseId: "PROC-R1", sourceQuestionCode: "Q_HAIR_PROCEDURE_DETAILS", sourceScopeKey: "PROC:1" },
          { id: "P2", procedure: "PRP", count: "9", lastDate: "2026-08", sourceResponseId: "FORGED-R", sourceQuestionCode: "Q_HAIR_PROCEDURE_DETAILS", sourceScopeKey: "FORGED" },
        ] },
      },
    },
  };

  const merged = mergeServerOwnedFollowUpContext(source, incoming);
  const mergedFollowUp = merged.followUp as unknown as P01FollowUpContext;
  assert.equal(mergedFollowUp.delta?.medicationsSupplements?.affectedExisting[0]?.itemLabel, "Canonical medicine");
  assert.equal(mergedFollowUp.delta?.hairProcedures?.items.length, 1);
  assert.equal(mergedFollowUp.delta?.hairProcedures?.items[0]?.sourceResponseId, "PROC-R1");
});

test("autosave restricts sex-specific trigger events to the server-owned patient sex", () => {
  const incoming: PatientInputJson = {
    locale: "ar", answers: {},
    followUp: {
      version: "P01_FOLLOW_UP_v5", mode: "RETURNING", patientId: "FORGED",
      identity: (server.followUp as unknown as P01FollowUpContext).identity, episodes: [], episodeState: [], recordedQuestionCodes: [],
      snapshot: { generatedAt: "2099-01-01T00:00:00.000Z", entries: [] },
      intent: "EXISTING_CONCERN", selectedEpisodeId: "EP-1",
      changes: { triggerEvents: "YES" },
      delta: {
        triggerEvents: { items: [
          { id: "F1", event: "CHILDBIRTH", date: "2026-08" },
          { id: "M1", event: "START_STOP_HORMONES_STEROIDS", date: "2026-08" },
          { id: "B1", event: "SEVERE_STRESS", date: "2026-08" },
        ] },
      },
    },
  };

  const merged = mergeServerOwnedFollowUpContext(server, incoming);
  const events = ((merged.followUp as unknown as P01FollowUpContext).delta?.triggerEvents?.items ?? []).map((item) => item.event);
  assert.deepEqual(events, ["CHILDBIRTH", "SEVERE_STRESS"]);
});
