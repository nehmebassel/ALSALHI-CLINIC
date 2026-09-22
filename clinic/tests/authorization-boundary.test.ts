import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCanAddPhysicianVisitAddendum,
  assertCanBeginPhysicianEncounter,
  assertCanCorrectFinalizedPhysicianVisit,
  assertCanEditPhysicianVisitDraft,
  assertCanFinalizePhysicianVisit,
  assertCanModifyClinicalData,
  assertCanPreparePhysicianVisitDraft,
  assertCanReadPatientReference,
  assertCanReactivatePatientSession,
  assertCanStartPatientSession,
  assertCanViewClinicalAudit,
  AuthorizationError,
  type AuthenticatedActor,
} from "../lib/auth/authorization";

const STAFF: AuthenticatedActor = {
  actorType: "AUTHENTICATED_USER",
  userId: "staff-id",
  role: "STAFF",
  clinicScopeId: "clinic-id",
  clinicDeviceId: "device-id",
  authenticatedSessionId: "session-id",
};

const PHYSICIAN: AuthenticatedActor = {
  ...STAFF,
  role: "PHYSICIAN",
  clinicDeviceId: null,
};

test("TEST-STAFF-004A Staff session creation requires an approved-device context", () => {
  assert.doesNotThrow(() => assertCanStartPatientSession(STAFF));
  assert.throws(
    () => assertCanStartPatientSession({ ...STAFF, clinicDeviceId: null }),
    (error: unknown) =>
      error instanceof AuthorizationError &&
      error.code === "ACCESS_CONTEXT_NOT_ALLOWED",
  );
});

test("TEST-STAFF-001 Staff cannot modify clinical data", () => {
  assert.throws(
    () => assertCanModifyClinicalData(STAFF),
    (error: unknown) =>
      error instanceof AuthorizationError &&
      error.code === "ACTION_NOT_ALLOWED",
  );
  assert.doesNotThrow(() => assertCanModifyClinicalData(PHYSICIAN));
});

test("TEST-ACC-008 Staff and Physician may reactivate a session", () => {
  assert.doesNotThrow(() => assertCanReactivatePatientSession(STAFF));
  assert.doesNotThrow(() => assertCanReactivatePatientSession(PHYSICIAN));
});

test("FPV-1 STAFF and PHYSICIAN can prepare, read, and edit a Physician Visit Draft", () => {
  for (const actor of [STAFF, PHYSICIAN]) {
    assert.doesNotThrow(() => assertCanReadPatientReference(actor));
    assert.doesNotThrow(() => assertCanPreparePhysicianVisitDraft(actor));
    assert.doesNotThrow(() => assertCanEditPhysicianVisitDraft(actor));
  }
});

test("FPV-1 STAFF cannot finalize a Physician Visit", () => {
  assert.throws(
    () => assertCanFinalizePhysicianVisit(STAFF),
    (error: unknown) =>
      error instanceof AuthorizationError &&
      error.code === "PHYSICIAN_FINALIZATION_REQUIRED",
  );
  assert.doesNotThrow(() => assertCanFinalizePhysicianVisit(PHYSICIAN));
});

test("FPV-2 only a physician can establish the encounter clock", () => {
  assert.throws(
    () => assertCanBeginPhysicianEncounter(STAFF),
    (error: unknown) =>
      error instanceof AuthorizationError &&
      error.code === "ACTION_NOT_ALLOWED",
  );
  assert.doesNotThrow(() => assertCanBeginPhysicianEncounter(PHYSICIAN));
});

test("FPV-1 future locked-record capabilities remain physician-only", () => {
  for (const capability of [
    assertCanCorrectFinalizedPhysicianVisit,
    assertCanAddPhysicianVisitAddendum,
    assertCanViewClinicalAudit,
  ]) {
    assert.throws(
      () => capability(STAFF),
      (error: unknown) =>
        error instanceof AuthorizationError &&
        error.code === "ACTION_NOT_ALLOWED",
    );
    assert.doesNotThrow(() => capability(PHYSICIAN));
  }
});
