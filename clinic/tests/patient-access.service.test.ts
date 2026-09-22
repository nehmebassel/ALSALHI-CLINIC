import assert from "node:assert/strict";
import test from "node:test";

import type { AuthenticatedActor } from "../lib/auth/authorization";
import {
  hashPatientAccessToken,
  PatientAccessError,
  PatientAccessService,
  type FinalSubmitReferenceData,
  type PatientAccessSnapshot,
  type PatientAccessStore,
  type PatientInputJson,
} from "../lib/patient-access/service";

const LAST_ACTIVITY = new Date("2026-08-11T09:00:00.000Z");
const INITIAL_EXPIRY = new Date("2026-08-11T09:30:00.000Z");
const RAW_TOKEN = "pilot-0-test-token";

const STAFF_ACTOR: AuthenticatedActor = {
  actorType: "AUTHENTICATED_USER",
  userId: "staff-user-id",
  role: "STAFF",
  clinicScopeId: "clinic-scope-id",
  clinicDeviceId: "approved-device-id",
  authenticatedSessionId: "staff-auth-session-id",
};

const PHYSICIAN_ACTOR: AuthenticatedActor = {
  ...STAFF_ACTOR,
  userId: "physician-user-id",
  role: "PHYSICIAN",
  clinicDeviceId: null,
  authenticatedSessionId: "physician-auth-session-id",
};

class FakePatientAccessStore implements PatientAccessStore {
  access: PatientAccessSnapshot | null = null;
  createdInput:
    | Parameters<PatientAccessStore["createAccessFlow"]>[0]
    | null = null;
  purgeAfter: Date | null = null;
  autosaveCalls = 0;

  async createAccessFlow(
    input: Parameters<PatientAccessStore["createAccessFlow"]>[0],
  ) {
    this.createdInput = input;

    return {
      invitationId: "invitation-id",
      sessionId: "session-id",
      draftId: "draft-id",
      status: "DRAFT" as const,
      matchedExistingPatient: false,
    };
  }

  async findAccessByTokenHash(sessionTokenHash: string) {
    return sessionTokenHash === hashPatientAccessToken(RAW_TOKEN)
      ? this.access
      : null;
  }

  async findAccessBySessionId(sessionId: string) {
    return this.access?.session.id === sessionId ? this.access : null;
  }

  async lockAccess(input: { sessionId: string; now: Date }) {
    if (this.access?.session.id === input.sessionId) {
      this.access.session.status = "LOCKED";
      this.access.session.lockedAt = input.now;
    }
  }

  async expireAccess(input: {
    sessionId: string;
    draftId: string;
    now: Date;
    purgeAfter: Date;
  }) {
    if (
      this.access?.session.id === input.sessionId &&
      this.access.draft.id === input.draftId
    ) {
      this.access.session.status = "EXPIRED";
      this.access.session.expiredAt = input.now;
      this.access.draft.status = "EXPIRED";
      this.purgeAfter = input.purgeAfter;
    }
  }

  async reactivateAccess(input: {
    sessionId: string;
    now: Date;
    expiresAt: Date;
  }) {
    if (
      this.access?.session.id !== input.sessionId ||
      this.access.session.status !== "LOCKED"
    ) {
      return null;
    }

    this.access.session.status = "ACTIVE";
    this.access.session.lastActivityAt = input.now;
    this.access.session.expiresAt = input.expiresAt;
    this.access.session.lockedAt = null;
    return this.access;
  }

  async cancelAccess(input: {
    sessionId: string;
    now: Date;
    purgeAfter: Date;
  }) {
    if (
      this.access?.session.id !== input.sessionId ||
      (this.access.session.status !== "ACTIVE" &&
        this.access.session.status !== "LOCKED")
    ) {
      return false;
    }

    this.access.session.status = "CLOSED";
    this.access.session.closeReason = "CANCELLED";
    this.access.session.closedAt = input.now;
    this.access.draft.status = "CANCELLED";
    this.purgeAfter = input.purgeAfter;
    return true;
  }

  async autosaveDraft(input: {
    draftId: string;
    sessionTokenHash: string;
    patientInputJson: PatientInputJson;
    now: Date;
    expiresAt: Date;
  }) {
    this.autosaveCalls += 1;

    if (
      !this.access ||
      this.access.session.status !== "ACTIVE" ||
      this.access.draft.id !== input.draftId ||
      input.sessionTokenHash !== hashPatientAccessToken(RAW_TOKEN)
    ) {
      return null;
    }

    this.access.session.lastActivityAt = input.now;
    this.access.session.expiresAt = input.expiresAt;
    this.access.draft.patientInputJson = input.patientInputJson;
    this.access.draft.expiresAt = input.expiresAt;
    this.access.draft.updatedAt = input.now;
    return this.access.draft;
  }

  async loadFinalSubmitReferenceData(): Promise<FinalSubmitReferenceData> {
    return {
      validReasonCodes: new Set(),
      validAestheticProcedureCodes: new Set(),
      validLaserServiceCodes: new Set(),
    };
  }
}

function access(
  status: PatientAccessSnapshot["session"]["status"] = "ACTIVE",
): PatientAccessSnapshot {
  return {
    session: {
      id: "session-id",
      status,
      closeReason: null,
      lastActivityAt: LAST_ACTIVITY,
      expiresAt: INITIAL_EXPIRY,
      lockedAt: status === "LOCKED" ? LAST_ACTIVITY : null,
      expiredAt: null,
      closedAt: null,
    },
    invitation: {
      clinicScopeId: "clinic-scope-id",
      patientId: null,
      temporaryMrnDisplayValue: "MRN-١٢٣",
      temporaryMrnNormalizedValue: "MRN123",
      expiresAt: INITIAL_EXPIRY,
      cancelledAt: null,
    },
    draft: {
      id: "draft-id",
      contentVersionId: "content-version-id",
      status: "DRAFT",
      expiresAt: INITIAL_EXPIRY,
      patientInputJson: {},
      updatedAt: LAST_ACTIVITY,
    },
  };
}

async function expectPatientAccessError(
  promise: Promise<unknown>,
  code: PatientAccessError["code"],
) {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof PatientAccessError && error.code === code,
  );
}

test("TEST-ID-002 creates temporary normalized MRN state without accepting a Patient id", async () => {
  const store = new FakePatientAccessStore();
  const service = new PatientAccessService(store, {
    now: () => LAST_ACTIVITY,
    generateToken: () => RAW_TOKEN,
  });

  const result = await service.createFlow(STAFF_ACTOR, {
    clinicMrn: " mrn-١٢٣ ",
  });

  assert.equal(result.sessionToken, RAW_TOKEN);
  assert.equal(store.createdInput?.createdByUserId, STAFF_ACTOR.userId);
  assert.equal(store.createdInput?.clinicScopeId, STAFF_ACTOR.clinicScopeId);
  assert.equal(store.createdInput?.temporaryMrnDisplayValue, "mrn-١٢٣");
  assert.equal(store.createdInput?.temporaryMrnNormalizedValue, "MRN123");
  assert.equal(
    store.createdInput?.sessionTokenHash,
    hashPatientAccessToken(RAW_TOKEN),
  );
});

test("TEST-STAFF-004 rejects physician creation of a Staff-owned patient session", async () => {
  const service = new PatientAccessService(new FakePatientAccessStore(), {
    now: () => LAST_ACTIVITY,
  });

  await assert.rejects(
    service.createFlow(PHYSICIAN_ACTOR, { clinicMrn: "123" }),
    (error: unknown) =>
      error instanceof Error && error.name === "AuthorizationError",
  );
});

test("TEST-ACC-005 warning threshold does not lock or block autosave", async () => {
  const store = new FakePatientAccessStore();
  store.access = access();
  const afterWarning = new Date("2026-08-11T09:06:00.000Z");
  const service = new PatientAccessService(store, {
    now: () => afterWarning,
  });

  const saved = await service.autosave(RAW_TOKEN, { acknowledged: true });

  assert.equal(saved.sessionStatus, "ACTIVE");
  assert.deepEqual(saved.patientInputJson, { acknowledged: true });
});

test("TEST-ACC-007 locks at seven minutes and blocks patient autosave", async () => {
  const store = new FakePatientAccessStore();
  store.access = access();
  const service = new PatientAccessService(store, {
    now: () => new Date("2026-08-11T09:07:00.000Z"),
  });

  await expectPatientAccessError(
    service.autosave(RAW_TOKEN, {}),
    "SESSION_LOCKED",
  );
  assert.equal(store.access.session.status, "LOCKED");
  assert.equal(store.autosaveCalls, 0);
});

test("TEST-ACC-009 expires at thirty minutes and schedules 24-hour purge", async () => {
  const store = new FakePatientAccessStore();
  store.access = access();
  const service = new PatientAccessService(store, {
    now: () => new Date("2026-08-11T09:30:00.000Z"),
  });

  await expectPatientAccessError(
    service.autosave(RAW_TOKEN, {}),
    "SESSION_EXPIRED",
  );
  assert.equal(store.access.session.status, "EXPIRED");
  assert.equal(store.access.draft.status, "EXPIRED");
  assert.equal(store.purgeAfter?.toISOString(), "2026-08-12T09:30:00.000Z");
});

test("TEST-ACC-008 Staff or Physician can reactivate LOCKED but unexpired session", async () => {
  for (const actor of [STAFF_ACTOR, PHYSICIAN_ACTOR]) {
    const store = new FakePatientAccessStore();
    store.access = access("LOCKED");
    const reactivatedAt = new Date("2026-08-11T09:10:00.000Z");
    const service = new PatientAccessService(store, {
      now: () => reactivatedAt,
    });

    const reactivated = await service.reactivate(actor, "session-id");

    assert.equal(reactivated.session.status, "ACTIVE");
    assert.equal(
      reactivated.session.expiresAt.toISOString(),
      "2026-08-11T09:40:00.000Z",
    );
  }
});

test("TEST-ACC-021 Staff cancellation closes the session and schedules purge", async () => {
  const store = new FakePatientAccessStore();
  store.access = access();
  const cancelledAt = new Date("2026-08-11T09:04:00.000Z");
  const service = new PatientAccessService(store, {
    now: () => cancelledAt,
  });

  await service.cancel(STAFF_ACTOR, "session-id");

  assert.equal(store.access.session.status, "CLOSED");
  assert.equal(store.access.session.closeReason, "CANCELLED");
  assert.equal(store.access.draft.status, "CANCELLED");
  assert.equal(store.purgeAfter?.toISOString(), "2026-08-12T09:04:00.000Z");
});
