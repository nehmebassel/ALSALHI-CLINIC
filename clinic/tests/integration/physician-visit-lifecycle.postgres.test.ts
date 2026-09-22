import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../../app/generated/prisma/client";
import {
  AuthorizationError,
  type AuthenticatedActor,
} from "../../lib/auth/authorization";
import { PhysicianVisitLifecycleError } from "../../lib/physician/visit-lifecycle-contracts";
import { PhysicianVisitLifecycleService } from "../../lib/physician/visit-lifecycle-service";
import { PhysicianVisitDraftError } from "../../lib/physician/visit-contracts";
import { PhysicianVisitService } from "../../lib/physician/visit-service";
import { seedDatabase } from "../../prisma/seed";

const T0 = new Date("2026-08-28T08:00:00.000Z");
const HOUR = 60 * 60 * 1_000;
const MIGRATIONS_URL = new URL("../../prisma/migrations/", import.meta.url);

async function loadMigrationSqlFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_URL, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .map((directory) =>
        readFile(new URL(`${directory}/migration.sql`, MIGRATIONS_URL), "utf8"),
      ),
  );
}

test("FPV-2 PostgreSQL lifecycle infrastructure", async (context) => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required.");

  const schemaName = `fpv2_lifecycle_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString });
  let prisma: PrismaClient | undefined;

  try {
    const setup = await adminPool.connect();
    try {
      await setup.query(`CREATE SCHEMA "${schemaName}"`);
      await setup.query(`SET search_path TO "${schemaName}"`);
      for (const migration of await loadMigrationSqlFiles()) {
        await setup.query(migration);
      }
    } finally {
      setup.release();
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema: schemaName }),
    });
    await seedDatabase(prisma);

    const [clinicScope, staff, physician, contentVersion] = await Promise.all([
      prisma.clinicScope.findUniqueOrThrow({ where: { code: "PILOT0" } }),
      prisma.user.findFirstOrThrow({ where: { role: { code: "STAFF" } } }),
      prisma.user.findFirstOrThrow({ where: { role: { code: "PHYSICIAN" } } }),
      prisma.contentVersion.findFirstOrThrow({ orderBy: { createdAt: "desc" } }),
    ]);
    const foreignScope = await prisma.clinicScope.create({
      data: {
        code: `FPV2_FOREIGN_${randomUUID()}`,
        nameAr: "نطاق آخر",
        nameEn: "Foreign scope",
      },
    });
    const staffActor: AuthenticatedActor = {
      actorType: "AUTHENTICATED_USER",
      userId: staff.id,
      role: "STAFF",
      clinicScopeId: clinicScope.id,
      clinicDeviceId: null,
      authenticatedSessionId: randomUUID(),
    };
    const physicianActor: AuthenticatedActor = {
      ...staffActor,
      userId: physician.id,
      role: "PHYSICIAN",
    };
    const foreignPhysicianActor: AuthenticatedActor = {
      ...physicianActor,
      clinicScopeId: foreignScope.id,
    };

    let fixtureIndex = 0;
    const createDraftVisit = async () => {
      fixtureIndex += 1;
      const patient = await prisma!.patient.create({ data: {} });
      await prisma!.externalPatientIdentifier.create({
        data: {
          patientId: patient.id,
          clinicScopeId: clinicScope.id,
          normalizedValue: `FPV2${fixtureIndex}`,
          displayValue: `FPV2-${fixtureIndex}`,
        },
      });
      const invitation = await prisma!.interviewInvitation.create({
        data: {
          patientId: patient.id,
          clinicScopeId: clinicScope.id,
          createdByUserId: staff.id,
        },
      });
      const session = await prisma!.patientAccessSession.create({
        data: {
          invitationId: invitation.id,
          sessionTokenHash: `fpv2-${randomUUID()}`,
          status: "CLOSED",
          closeReason: "SUBMITTED",
          closedAt: T0,
          expiresAt: new Date(T0.getTime() + HOUR),
        },
      });
      const sourceDraft = await prisma!.draftClinicalInterview.create({
        data: {
          sessionId: session.id,
          contentVersionId: contentVersion.id,
          patientInputJson: {
            patientReportedDiagnosis: "Patient reference only",
            patientReportedTreatment: "Patient reference only",
          },
          status: "SUBMITTED",
          submittedAt: T0,
          expiresAt: new Date(T0.getTime() + HOUR),
        },
      });
      const episode = await prisma!.clinicalEpisode.create({
        data: {
          patientId: patient.id,
          clinicScopeId: clinicScope.id,
          primaryReasonCode: "RV_HAIR_LOSS",
          openedAt: T0,
        },
      });
      const visit = await prisma!.visit.create({
        data: {
          patientId: patient.id,
          clinicScopeId: clinicScope.id,
          sourceDraftId: sourceDraft.id,
          clinicalEpisodeId: episode.id,
          visitType: "INITIAL",
          status: "CREATED",
        },
      });
      await prisma!.clinicalInterview.create({
        data: { visitId: visit.id, status: "UNDER_REVIEW" },
      });
      const draftService = new PhysicianVisitService(prisma!, { now: () => T0 });
      const record = await draftService.prepareDraft(staffActor, visit.id);
      return { patient, episode, visit, record, draftService };
    };

    const officialStateCounts = async (patientId: string) => ({
      journeys: await prisma!.physicianHairJourney.count({ where: { patientId } }),
      measurements: await prisma!.measurement.count({
        where: { physicianHairJourney: { patientId } },
      }),
      timelineEvents: await prisma!.timelineEvent.count({
        where: { physicianHairJourney: { patientId } },
      }),
      clinicianAssessments: await prisma!.clinicianAssessment.count({
        where: { clinicalInterview: { visit: { patientId } } },
      }),
      effectiveAssessments: await prisma!.dualPerspectiveAssessment.count({
        where: {
          effectiveValueJson: { not: { equals: null } },
          questionInstance: { clinicalInterview: { visit: { patientId } } },
        },
      }),
    });

    await context.test("AuditLog permits INSERT and rejects UPDATE/DELETE at the database boundary", async () => {
      const inserted = await prisma!.auditLog.create({
        data: {
          entityType: "FPV2_1IntegrityProbe",
          entityId: randomUUID(),
          action: "CREATE",
          changedByUserId: physician.id,
          changedAt: T0,
          reason: "Append-only integration probe",
        },
      });

      await assert.rejects(
        prisma!.auditLog.update({
          where: { id: inserted.id },
          data: { reason: "forbidden rewrite" },
        }),
        /FPV-2\.1 append-only: AuditLog cannot be updated or deleted/,
      );
      await assert.rejects(
        prisma!.auditLog.delete({ where: { id: inserted.id } }),
        /FPV-2\.1 append-only: AuditLog cannot be updated or deleted/,
      );

      const readable = await prisma!.auditLog.findUniqueOrThrow({
        where: { id: inserted.id },
      });
      assert.equal(readable.reason, "Append-only integration probe");
    });

    const main = await createDraftVisit();
    const countsBefore = await officialStateCounts(main.patient.id);

    await context.test("STAFF keeps Draft access but cannot lifecycle-sign", async () => {
      const edited = await main.draftService.updateDraft(staffActor, main.visit.id, {
        expectedDraftVersion: 1,
        section: "PLAN",
        value: { workingNote: "Flexible Draft only" },
      });
      assert.equal(edited.draftVersion, 2);
      await assert.rejects(
        new PhysicianVisitLifecycleService(prisma!, { now: () => T0, databaseSchema: schemaName }).beginEncounter(
          staffActor,
          main.visit.id,
        ),
        (error: unknown) =>
          error instanceof AuthorizationError && error.code === "ACTION_NOT_ALLOWED",
      );
      await assert.rejects(
        new PhysicianVisitLifecycleService(prisma!, { now: () => T0, databaseSchema: schemaName }).finalize(
          staffActor,
          main.visit.id,
          { expectedDraftVersion: 2 },
        ),
        (error: unknown) =>
          error instanceof AuthorizationError &&
          error.code === "PHYSICIAN_FINALIZATION_REQUIRED",
      );
      await assert.rejects(
        new PhysicianVisitLifecycleService(prisma!, { now: () => T0, databaseSchema: schemaName }).evaluateCorrectionWindow(
          staffActor,
          main.visit.id,
        ),
        (error: unknown) =>
          error instanceof AuthorizationError && error.code === "ACTION_NOT_ALLOWED",
      );
      await assert.rejects(
        new PhysicianVisitLifecycleService(prisma!, { now: () => T0, databaseSchema: schemaName }).addAddendum(
          staffActor,
          main.visit.id,
          { type: "CLARIFICATION", content: "Not allowed" },
        ),
        (error: unknown) =>
          error instanceof AuthorizationError && error.code === "ACTION_NOT_ALLOWED",
      );
    });

    await context.test("unapproved Draft content cannot become authoritative", async () => {
      const lifecycle = new PhysicianVisitLifecycleService(prisma!, { now: () => T0, databaseSchema: schemaName });
      await lifecycle.beginEncounter(physicianActor, main.visit.id);
      await assert.rejects(
        lifecycle.finalize(physicianActor, main.visit.id, { expectedDraftVersion: 2 }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "UNAPPROVED_FINALIZATION_CONTENT",
      );
      const persisted = await prisma!.physicianVisitRecord.findUniqueOrThrow({
        where: { visitId: main.visit.id },
      });
      assert.equal(persisted.status, "DRAFT");
      assert.equal(persisted.finalizedAt, null);
      assert.deepEqual(await officialStateCounts(main.patient.id), countsBefore);
    });

    const happy = await createDraftVisit();
    const lifecycle = new PhysicianVisitLifecycleService(prisma!, { now: () => T0, databaseSchema: schemaName });

    await context.test("Begin Encounter is physician-only, server-owned, once, and scoped", async () => {
      const begun = await lifecycle.beginEncounter(physicianActor, happy.visit.id);
      assert.equal(begun.visitOccurredAt.toISOString(), T0.toISOString());
      assert.equal(begun.idempotentReplay, false);
      const replay = await new PhysicianVisitLifecycleService(prisma!, {
        now: () => new Date(T0.getTime() + HOUR),
        databaseSchema: schemaName,
      }).beginEncounter(physicianActor, happy.visit.id);
      assert.equal(replay.visitOccurredAt.toISOString(), T0.toISOString());
      assert.equal(replay.idempotentReplay, true);
      assert.equal(
        await prisma!.auditLog.count({
          where: { entityId: happy.visit.id, action: "PHYSICIAN_ENCOUNTER_BEGAN" },
        }),
        1,
      );
      await assert.rejects(
        lifecycle.beginEncounter(foreignPhysicianActor, happy.visit.id),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "VISIT_NOT_FOUND",
      );
      await assert.rejects(
        prisma!.visit.update({
          where: { id: happy.visit.id },
          data: { visitOccurredAt: new Date(T0.getTime() + HOUR) },
        }),
      );
      assert.equal(
        (await prisma!.visit.findUniqueOrThrow({ where: { id: happy.visit.id } }))
          .visitOccurredAt?.toISOString(),
        T0.toISOString(),
      );
    });

    await context.test("Finalize requires authoritative encounter time", async () => {
      const missingEncounter = await createDraftVisit();
      await assert.rejects(
        lifecycle.finalize(physicianActor, missingEncounter.visit.id, {
          expectedDraftVersion: 1,
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "ENCOUNTER_NOT_BEGUN",
      );
    });

    await context.test("Finalize reloads, fingerprints, and commits empty FPV-3 materialization once", async () => {
      const finalizedAt = new Date(T0.getTime() + HOUR);
      const finalizer = new PhysicianVisitLifecycleService(prisma!, {
        now: () => finalizedAt,
        databaseSchema: schemaName,
      });
      const result = await finalizer.finalize(physicianActor, happy.visit.id, {
        expectedDraftVersion: 1,
      });
      assert.equal(result.idempotentReplay, false);
      assert.equal(result.physicianVisitRecord.status, "FINALIZED");
      assert.equal(result.physicianVisitRecord.finalizedAt?.toISOString(), finalizedAt.toISOString());
      assert.equal(result.physicianVisitRecord.finalizedDraftVersion, 1);
      assert.match(result.physicianVisitRecord.finalizedDraftSha256 ?? "", /^[0-9a-f]{64}$/);
      assert.equal(result.physicianVisitRecord.isLateDocumentation, false);
      const evidence = result.physicianVisitRecord
        .originalFinalizationEvidenceJson as Record<string, unknown>;
      assert.equal(
        evidence.clinicalMaterialization,
        "FPV3_GOVERNED_CLINICAL_OBSERVATIONS",
      );
      assert.equal(evidence.reviewedDraftVersion, 1);
      assert.equal("sections" in evidence, false);
      assert.equal("draftJson" in evidence, false);

      const replay = await finalizer.finalize(physicianActor, happy.visit.id, {
        expectedDraftVersion: 999,
      });
      assert.equal(replay.idempotentReplay, true);
      assert.equal(replay.physicianVisitRecord.id, result.physicianVisitRecord.id);
      assert.equal(
        replay.physicianVisitRecord.finalizedDraftSha256,
        result.physicianVisitRecord.finalizedDraftSha256,
      );
      assert.equal(
        await prisma!.auditLog.count({
          where: {
            entityId: result.physicianVisitRecord.id,
            action: "PHYSICIAN_VISIT_FINALIZED",
          },
        }),
        1,
      );
      await assert.rejects(
        finalizer.finalize(foreignPhysicianActor, happy.visit.id, {
          expectedDraftVersion: 1,
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "VISIT_NOT_FOUND",
      );
      assert.deepEqual(await officialStateCounts(happy.patient.id), {
        journeys: 0,
        measurements: 0,
        timelineEvents: 0,
        clinicianAssessments: 0,
        effectiveAssessments: 0,
      });
    });

    await context.test("finalized PVR and Visit rows are fully hard-locked while replay remains readable", async () => {
      await assert.rejects(
        happy.draftService.updateDraft(staffActor, happy.visit.id, {
          expectedDraftVersion: 1,
          section: "PLAN",
          value: { workingNote: "too late" },
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitDraftError &&
          error.code === "PHYSICIAN_VISIT_ALREADY_FINALIZED",
      );
      const record = await prisma!.physicianVisitRecord.findUniqueOrThrow({
        where: { visitId: happy.visit.id },
      });
      const replacementEpisode = await prisma!.clinicalEpisode.create({
        data: {
          patientId: happy.patient.id,
          clinicScopeId: clinicScope.id,
          primaryReasonCode: "RV_DERMATOLOGY",
          openedAt: new Date(T0.getTime() + HOUR),
        },
      });

      for (const forbiddenVisitUpdate of [
        () =>
          prisma!.visit.update({
            where: { id: happy.visit.id },
            data: { id: randomUUID() },
          }),
        () =>
          prisma!.visit.update({
            where: { id: happy.visit.id },
            data: { patientId: main.patient.id },
          }),
        () =>
          prisma!.visit.update({
            where: { id: happy.visit.id },
            data: { clinicalEpisodeId: replacementEpisode.id },
          }),
        () =>
          prisma!.visit.update({
            where: { id: happy.visit.id },
            data: { clinicScopeId: foreignScope.id },
          }),
        () =>
          prisma!.visit.update({
            where: { id: happy.visit.id },
            data: { visitOccurredAt: new Date(T0.getTime() + HOUR) },
          }),
        () =>
          prisma!.visit.update({
            where: { id: happy.visit.id },
            data: { visitType: "FOLLOW_UP" },
          }),
        () =>
          prisma!.visit.update({
            where: { id: happy.visit.id },
            data: { createdAt: new Date(T0.getTime() - HOUR) },
          }),
        () =>
          prisma!.visit.update({
            where: { id: happy.visit.id },
            data: { cancelledAt: new Date(T0.getTime() + 2 * HOUR) },
          }),
        () =>
          prisma!.visit.update({
            where: { id: happy.visit.id },
            data: { updatedAt: new Date(T0.getTime() + 2 * HOUR) },
          }),
      ]) {
        await assert.rejects(
          forbiddenVisitUpdate(),
          /FPV-2\.1 hard lock: finalized physician Visit row is immutable|FPV-2\.1 hard lock: visitOccurredAt is immutable once assigned/,
        );
      }

      await assert.rejects(
        prisma!.physicianVisitRecord.update({
          where: { id: record.id },
          data: { updatedAt: new Date(T0.getTime() + 2 * HOUR) },
        }),
        /FPV-2\.1 hard lock: finalized PhysicianVisitRecord row is immutable/,
      );
      await assert.rejects(
        prisma!.physicianVisitRecord.delete({ where: { id: record.id } }),
        /FPV-2\.1 hard lock: finalized PhysicianVisitRecord row is immutable/,
      );

      const lifecycleAudit = await prisma!.auditLog.findFirstOrThrow({
        where: {
          entityId: record.id,
          action: "PHYSICIAN_VISIT_FINALIZED",
        },
      });
      await assert.rejects(
        prisma!.auditLog.update({
          where: { id: lifecycleAudit.id },
          data: { reason: "forbidden lifecycle audit rewrite" },
        }),
        /FPV-2\.1 append-only: AuditLog cannot be updated or deleted/,
      );
      await assert.rejects(
        prisma!.auditLog.delete({ where: { id: lifecycleAudit.id } }),
        /FPV-2\.1 append-only: AuditLog cannot be updated or deleted/,
      );
      assert.equal(
        (
          await prisma!.auditLog.findUniqueOrThrow({
            where: { id: lifecycleAudit.id },
          })
        ).action,
        "PHYSICIAN_VISIT_FINALIZED",
      );

      const after = await prisma!.physicianVisitRecord.findUniqueOrThrow({
        where: { id: record.id },
      });
      assert.equal(after.draftVersion, 1);
      assert.equal(after.finalizedAt?.toISOString(), record.finalizedAt?.toISOString());
    });

    await context.test("Finalize failure rolls back lifecycle and audit writes", async () => {
      const rollbackFixture = await createDraftVisit();
      const governedDraft = await rollbackFixture.draftService.updateDraft(
        staffActor,
        rollbackFixture.visit.id,
        {
          expectedDraftVersion: 1,
          section: "EXAMINATION",
          value: { hairPull: "POSITIVE" },
        },
      );
      await lifecycle.beginEncounter(physicianActor, rollbackFixture.visit.id);
      const failing = new PhysicianVisitLifecycleService(prisma!, {
        now: () => new Date(T0.getTime() + HOUR),
        databaseSchema: schemaName,
        beforeFinalizeCommit: () => {
          throw new Error("injected rollback");
        },
      });
      await assert.rejects(
        failing.finalize(physicianActor, rollbackFixture.visit.id, {
          expectedDraftVersion: governedDraft.draftVersion,
        }),
        /injected rollback/,
      );
      const [visitAfter, recordAfter, finalizeAudits] = await Promise.all([
        prisma!.visit.findUniqueOrThrow({ where: { id: rollbackFixture.visit.id } }),
        prisma!.physicianVisitRecord.findUniqueOrThrow({
          where: { visitId: rollbackFixture.visit.id },
        }),
        prisma!.auditLog.count({
          where: { action: "PHYSICIAN_VISIT_FINALIZED", entityId: rollbackFixture.record.id },
        }),
      ]);
      assert.equal(visitAfter.status, "CREATED");
      assert.equal(visitAfter.completedAt, null);
      assert.equal(recordAfter.status, "DRAFT");
      assert.equal(recordAfter.finalizedAt, null);
      assert.equal(finalizeAudits, 0);
      assert.equal(
        await prisma!.physicianClinicalExamination.count({
          where: { physicianVisitRecordId: rollbackFixture.record.id },
        }),
        0,
      );
    });

    await context.test("Finalize wins a row-lock race against stale autosave", async () => {
      const race = await createDraftVisit();
      await lifecycle.beginEncounter(physicianActor, race.visit.id);
      let releaseFinalize!: () => void;
      let enteredFinalize!: () => void;
      const entered = new Promise<void>((resolve) => {
        enteredFinalize = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseFinalize = resolve;
      });
      const finalizer = new PhysicianVisitLifecycleService(prisma!, {
        now: () => new Date(T0.getTime() + HOUR),
        databaseSchema: schemaName,
        beforeFinalizeCommit: async () => {
          enteredFinalize();
          await release;
        },
      });
      const finalizing = finalizer.finalize(physicianActor, race.visit.id, {
        expectedDraftVersion: 1,
      });
      await entered;
      const staleUpdate = race.draftService.updateDraft(staffActor, race.visit.id, {
        expectedDraftVersion: 1,
        section: "PLAN",
        value: { workingNote: "loses race" },
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      releaseFinalize();
      const finalized = await finalizing;
      assert.equal(finalized.physicianVisitRecord.status, "FINALIZED");
      await assert.rejects(
        staleUpdate,
        (error: unknown) =>
          (error instanceof PhysicianVisitDraftError &&
            error.code === "PHYSICIAN_VISIT_ALREADY_FINALIZED") ||
          (error instanceof PhysicianVisitDraftError && error.code === "DRAFT_CONFLICT"),
      );
      const record = await prisma!.physicianVisitRecord.findUniqueOrThrow({
        where: { visitId: race.visit.id },
      });
      assert.equal(record.status, "FINALIZED");
      assert.equal(record.draftVersion, 1);
    });

    await context.test("correction policy uses server time and rejects every ungoverned target", async () => {
      const openAt = new Date(T0.getTime() + 24 * HOUR - 1);
      const openPolicy = new PhysicianVisitLifecycleService(prisma!, {
        now: () => openAt,
        databaseSchema: schemaName,
      });
      const open = await openPolicy.evaluateCorrectionWindow(
        physicianActor,
        happy.visit.id,
      );
      assert.equal(open.status, "OPEN");
      assert.equal(open.evaluatedAt.toISOString(), openAt.toISOString());
      await assert.rejects(
        openPolicy.assertCorrectionTarget(
          physicianActor,
          happy.visit.id,
          "visitOccurredAt",
        ),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "IMMUTABLE_VISIT_FIELD",
      );
      await assert.rejects(
        openPolicy.assertCorrectionTarget(
          physicianActor,
          happy.visit.id,
          "EXAMINATION.opaqueClinicalValue",
        ),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "UNAPPROVED_CORRECTION_TARGET",
      );

      const exactDeadline = new PhysicianVisitLifecycleService(prisma!, {
        now: () => new Date(T0.getTime() + 24 * HOUR),
        databaseSchema: schemaName,
      });
      assert.equal(
        (await exactDeadline.evaluateCorrectionWindow(physicianActor, happy.visit.id))
          .status,
        "CLOSED",
      );
      await assert.rejects(
        exactDeadline.assertCorrectionTarget(
          physicianActor,
          happy.visit.id,
          "EXAMINATION.opaqueClinicalValue",
        ),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "VISIT_CORRECTION_WINDOW_CLOSED",
      );
    });

    await context.test("late Finalize preserves encounter time and creates no new window", async () => {
      const late = await createDraftVisit();
      await lifecycle.beginEncounter(physicianActor, late.visit.id);
      const lateAt = new Date(T0.getTime() + 25 * HOUR);
      const lateService = new PhysicianVisitLifecycleService(prisma!, {
        now: () => lateAt,
        databaseSchema: schemaName,
      });
      const finalized = await lateService.finalize(physicianActor, late.visit.id, {
        expectedDraftVersion: 1,
      });
      assert.equal(finalized.physicianVisitRecord.isLateDocumentation, true);
      assert.equal(finalized.physicianVisitRecord.finalizedAt?.toISOString(), lateAt.toISOString());
      const persistedVisit = await prisma!.visit.findUniqueOrThrow({
        where: { id: late.visit.id },
      });
      assert.equal(persistedVisit.visitOccurredAt?.toISOString(), T0.toISOString());
      assert.equal(
        (await lateService.evaluateCorrectionWindow(physicianActor, late.visit.id)).status,
        "CLOSED",
      );
      assert.equal(
        await prisma!.auditLog.count({
          where: {
            entityId: finalized.physicianVisitRecord.id,
            action: "PHYSICIAN_VISIT_LATE_FINALIZED",
          },
        }),
        1,
      );

      const addendumAt = new Date(T0.getTime() + 26 * HOUR);
      const addendum = await new PhysicianVisitLifecycleService(prisma!, {
        now: () => addendumAt,
        databaseSchema: schemaName,
      }).addAddendum(physicianActor, late.visit.id, {
        type: "CLARIFICATION",
        content: "Append-only physician clarification.",
      });
      assert.equal(addendum.createdAt.toISOString(), addendumAt.toISOString());
      assert.equal(addendum.type, "CLARIFICATION");
      await assert.rejects(
        new PhysicianVisitLifecycleService(prisma!, {
          now: () => addendumAt,
          databaseSchema: schemaName,
        }).addAddendum(foreignPhysicianActor, late.visit.id, {
          type: "CLARIFICATION",
          content: "Wrong clinic",
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "VISIT_NOT_FOUND",
      );
      const original = await prisma!.physicianVisitRecord.findUniqueOrThrow({
        where: { visitId: late.visit.id },
      });
      await assert.rejects(
        prisma!.physicianVisitAddendum.update({
          where: { id: addendum.id },
          data: { content: "forbidden rewrite" },
        }),
      );
      await assert.rejects(
        prisma!.physicianVisitAddendum.delete({ where: { id: addendum.id } }),
      );
      assert.deepEqual(
        await prisma!.physicianVisitRecord.findUniqueOrThrow({
          where: { visitId: late.visit.id },
        }),
        original,
      );
      assert.equal(
        await prisma!.physicianVisitAddendum.count({
          where: { physicianVisitRecordId: original.id },
        }),
        1,
      );
      assert.deepEqual(await officialStateCounts(late.patient.id), {
        journeys: 0,
        measurements: 0,
        timelineEvents: 0,
        clinicianAssessments: 0,
        effectiveAssessments: 0,
      });
    });

    await context.test("Addendum is unavailable before hard lock", async () => {
      await assert.rejects(
        new PhysicianVisitLifecycleService(prisma!, {
          now: () => new Date(T0.getTime() + 2 * HOUR),
          databaseSchema: schemaName,
        }).addAddendum(physicianActor, happy.visit.id, {
          type: "CORRECTION",
          content: "Too early",
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "ADDENDUM_BEFORE_HARD_LOCK",
      );
    });
  } finally {
    await prisma?.$disconnect();
    const cleanup = await adminPool.connect();
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      cleanup.release();
      await adminPool.end();
    }
  }
});
