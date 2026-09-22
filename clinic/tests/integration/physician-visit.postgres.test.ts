import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../../app/generated/prisma/client";
import {
  assertCanFinalizePhysicianVisit,
  AuthorizationError,
  type AuthenticatedActor,
} from "../../lib/auth/authorization";
import { getPhysicianPatientWorkspace } from "../../lib/physician/read-model";
import { PhysicianVisitDraftError } from "../../lib/physician/visit-contracts";
import { PhysicianVisitService } from "../../lib/physician/visit-service";
import { VisitDraftAutosave } from "../../lib/physician/visit-draft-autosave";
import { freshWorkspaceSections } from "../../lib/physician/visit-workspace";
import { seedDatabase } from "../../prisma/seed";

const NOW = new Date("2026-08-27T09:30:00.000Z");
const MIGRATIONS_URL = new URL("../../prisma/migrations/", import.meta.url);

async function loadMigrationEntries(): Promise<Array<{ name: string; sql: string }>> {
  const entries = await readdir(MIGRATIONS_URL, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .map(async (directory) => ({
        name: directory,
        sql: await readFile(
          new URL(`${directory}/migration.sql`, MIGRATIONS_URL),
          "utf8",
        ),
      })),
  );
}

async function loadMigrationSqlFiles(): Promise<string[]> {
  return (await loadMigrationEntries()).map((entry) => entry.sql);
}

test("FPV-1 migration backfills only proven tenant scope and fabricates no physician provenance", async () => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required.");

  const schemaName = `fpv1_migration_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString });
  let prisma: PrismaClient | undefined;

  try {
    const migrations = await loadMigrationEntries();
    const fpvMigration = migrations.find(
      (entry) => entry.name === "20260827153000_fpv1_additive_foundation",
    );
    assert.ok(fpvMigration, "FPV-1 migration must exist.");
    const fpvMigrationIndex = migrations.findIndex(
      (entry) => entry.name === fpvMigration.name,
    );

    const setupClient = await adminPool.connect();
    try {
      await setupClient.query(`CREATE SCHEMA "${schemaName}"`);
      await setupClient.query(`SET search_path TO "${schemaName}"`);
      for (const migration of migrations.slice(0, fpvMigrationIndex)) {
        await setupClient.query(migration.sql);
      }
    } finally {
      setupClient.release();
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema: schemaName }),
    });
    await seedDatabase(prisma);
    const [clinicScope, staff, contentVersion] = await Promise.all([
      prisma.clinicScope.findUniqueOrThrow({ where: { code: "PILOT0" } }),
      prisma.user.findFirstOrThrow({ where: { role: { code: "STAFF" } } }),
      prisma.contentVersion.findFirstOrThrow({ orderBy: { createdAt: "desc" } }),
    ]);
    const patient = await prisma.patient.create({ data: {} });
    const invitation = await prisma.interviewInvitation.create({
      data: {
        patientId: patient.id,
        clinicScopeId: clinicScope.id,
        createdByUserId: staff.id,
      },
    });
    const patientSession = await prisma.patientAccessSession.create({
      data: {
        invitationId: invitation.id,
        sessionTokenHash: `fpv1-migration-${randomUUID()}`,
        expiresAt: new Date(NOW.getTime() + 60_000),
      },
    });
    const sourceDraft = await prisma.draftClinicalInterview.create({
      data: {
        sessionId: patientSession.id,
        contentVersionId: contentVersion.id,
        patientInputJson: {},
        status: "SUBMITTED",
        submittedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 60_000),
      },
    });
    const episodeId = randomUUID();
    const unscopedEpisodeId = randomUUID();
    const completedVisitId = randomUUID();

    const migrationClient = await adminPool.connect();
    try {
      await migrationClient.query(`SET search_path TO "${schemaName}"`);
      await migrationClient.query(
        `INSERT INTO "ClinicalEpisode" ("id", "patientId", "primaryReasonCode", "status", "openedAt", "createdAt", "updatedAt")
         VALUES ($1, $2, 'RV_HAIR_LOSS', 'ACTIVE', $3, $3, $3),
                ($4, $2, 'RV_DERMATOLOGY', 'ACTIVE', $3, $3, $3)`,
        [episodeId, patient.id, NOW, unscopedEpisodeId],
      );
      await migrationClient.query(
        `INSERT INTO "Visit" ("id", "patientId", "sourceDraftId", "clinicalEpisodeId", "visitType", "status", "createdAt", "completedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'INITIAL', 'COMPLETED', $5, $5, $5)`,
        [completedVisitId, patient.id, sourceDraft.id, episodeId, NOW],
      );
      await migrationClient.query(fpvMigration.sql);
      for (const migration of migrations.slice(fpvMigrationIndex + 1)) {
        await migrationClient.query(migration.sql);
      }
    } finally {
      migrationClient.release();
    }

    const [backfilledVisit, backfilledEpisode, unresolvedEpisode] =
      await Promise.all([
        prisma.visit.findUniqueOrThrow({ where: { id: completedVisitId } }),
        prisma.clinicalEpisode.findUniqueOrThrow({ where: { id: episodeId } }),
        prisma.clinicalEpisode.findUniqueOrThrow({
          where: { id: unscopedEpisodeId },
        }),
      ]);
    assert.equal(backfilledVisit.clinicScopeId, clinicScope.id);
    assert.equal(backfilledVisit.visitOccurredAt, null);
    assert.equal(backfilledEpisode.clinicScopeId, clinicScope.id);
    assert.equal(unresolvedEpisode.clinicScopeId, null);
    assert.equal(await prisma.physicianVisitRecord.count(), 0);
  } finally {
    await prisma?.$disconnect();
    const cleanupClient = await adminPool.connect();
    try {
      await cleanupClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      cleanupClient.release();
      await adminPool.end();
    }
  }
});

test("FPV-1.1 migration preflight stops an Episode with conflicting tenant scopes", async () => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required.");

  const schemaName = `fpv1_conflict_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString });
  let prisma: PrismaClient | undefined;

  try {
    const migrations = await loadMigrationEntries();
    const fpvMigrationIndex = migrations.findIndex(
      (entry) => entry.name === "20260827153000_fpv1_additive_foundation",
    );
    assert.ok(fpvMigrationIndex >= 0, "FPV-1 migration must exist.");
    const setupClient = await adminPool.connect();
    try {
      await setupClient.query(`CREATE SCHEMA "${schemaName}"`);
      await setupClient.query(`SET search_path TO "${schemaName}"`);
      for (const migration of migrations.slice(0, fpvMigrationIndex)) {
        await setupClient.query(migration.sql);
      }
    } finally {
      setupClient.release();
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema: schemaName }),
    });
    await seedDatabase(prisma);
    const [primaryScope, staff, contentVersion] = await Promise.all([
      prisma.clinicScope.findUniqueOrThrow({ where: { code: "PILOT0" } }),
      prisma.user.findFirstOrThrow({ where: { role: { code: "STAFF" } } }),
      prisma.contentVersion.findFirstOrThrow({ orderBy: { createdAt: "desc" } }),
    ]);
    const foreignScope = await prisma.clinicScope.create({
      data: {
        code: `FPV1_CONFLICT_${randomUUID()}`,
        nameAr: "نطاق تعارض",
        nameEn: "Conflict scope",
      },
    });
    const patient = await prisma.patient.create({ data: {} });
    const drafts: string[] = [];
    for (const clinicScopeId of [primaryScope.id, foreignScope.id]) {
      const invitation = await prisma.interviewInvitation.create({
        data: { patientId: patient.id, clinicScopeId, createdByUserId: staff.id },
      });
      const session = await prisma.patientAccessSession.create({
        data: {
          invitationId: invitation.id,
          sessionTokenHash: `fpv1-conflict-${randomUUID()}`,
          expiresAt: new Date(NOW.getTime() + 60_000),
        },
      });
      const draft = await prisma.draftClinicalInterview.create({
        data: {
          sessionId: session.id,
          contentVersionId: contentVersion.id,
          patientInputJson: {},
          status: "SUBMITTED",
          submittedAt: NOW,
          expiresAt: new Date(NOW.getTime() + 60_000),
        },
      });
      drafts.push(draft.id);
    }

    const episodeId = randomUUID();
    const migrationClient = await adminPool.connect();
    try {
      await migrationClient.query(`SET search_path TO "${schemaName}"`);
      await migrationClient.query(
        `INSERT INTO "ClinicalEpisode" ("id", "patientId", "primaryReasonCode", "status", "openedAt", "createdAt", "updatedAt")
         VALUES ($1, $2, 'RV_HAIR_LOSS', 'ACTIVE', $3, $3, $3)`,
        [episodeId, patient.id, NOW],
      );
      await migrationClient.query(
        `INSERT INTO "Visit" ("id", "patientId", "sourceDraftId", "clinicalEpisodeId", "visitType", "status", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $5, 'INITIAL', 'CREATED', $6, $6),
                ($4, $2, $7, $5, 'FOLLOW_UP', 'CREATED', $6, $6)`,
        [
          randomUUID(),
          patient.id,
          drafts[0],
          randomUUID(),
          episodeId,
          NOW,
          drafts[1],
        ],
      );
      await assert.rejects(
        migrationClient.query(migrations[fpvMigrationIndex]!.sql),
        /ClinicalEpisode spans conflicting clinic scopes/,
      );
    } finally {
      migrationClient.release();
    }
  } finally {
    await prisma?.$disconnect();
    const cleanupClient = await adminPool.connect();
    try {
      await cleanupClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      cleanupClient.release();
      await adminPool.end();
    }
  }
});

test("FPV-1 PostgreSQL Draft foundation", async (context) => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required.");

  const schemaName = `fpv1_test_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString });
  let prisma: PrismaClient | undefined;

  try {
    const setupClient = await adminPool.connect();
    try {
      await setupClient.query(`CREATE SCHEMA "${schemaName}"`);
      await setupClient.query(`SET search_path TO "${schemaName}"`);
      for (const migrationSql of await loadMigrationSqlFiles()) {
        await setupClient.query(migrationSql);
      }
    } finally {
      setupClient.release();
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema: schemaName }),
    });
    await seedDatabase(prisma);

    const [clinicScope, staffRole, physicianRole, contentVersion] =
      await Promise.all([
        prisma.clinicScope.findUniqueOrThrow({ where: { code: "PILOT0" } }),
        prisma.role.findUniqueOrThrow({ where: { code: "STAFF" } }),
        prisma.role.findUniqueOrThrow({ where: { code: "PHYSICIAN" } }),
        prisma.contentVersion.findFirstOrThrow({ orderBy: { createdAt: "desc" } }),
      ]);

    const [staff, physician] = await Promise.all([
      prisma.user.create({
        data: {
          name: "FPV-1 Staff",
          email: `fpv1-staff-${randomUUID()}@example.invalid`,
          passwordHash: "synthetic-noncredential-hash",
          roleId: staffRole.id,
        },
      }),
      prisma.user.create({
        data: {
          name: "FPV-1 Physician",
          email: `fpv1-physician-${randomUUID()}@example.invalid`,
          passwordHash: "synthetic-noncredential-hash",
          roleId: physicianRole.id,
        },
      }),
    ]);
    const device = await prisma.clinicDevice.create({
      data: {
        clinicScopeId: clinicScope.id,
        name: "FPV-1 Staff Device",
        certificateFingerprintHash: `fpv1-${randomUUID()}`,
        status: "APPROVED",
        approvedAt: NOW,
      },
    });
    const staffActor: AuthenticatedActor = {
      actorType: "AUTHENTICATED_USER",
      userId: staff.id,
      role: "STAFF",
      clinicScopeId: clinicScope.id,
      clinicDeviceId: device.id,
      authenticatedSessionId: "fpv1-staff-session",
    };
    const physicianActor: AuthenticatedActor = {
      actorType: "AUTHENTICATED_USER",
      userId: physician.id,
      role: "PHYSICIAN",
      clinicScopeId: clinicScope.id,
      clinicDeviceId: null,
      authenticatedSessionId: "fpv1-physician-session",
    };
    const foreignScope = await prisma.clinicScope.create({
      data: {
        code: `FPV1_FOREIGN_${randomUUID()}`,
        nameAr: "نطاق أجنبي",
        nameEn: "Foreign scope",
      },
    });
    const foreignActor: AuthenticatedActor = {
      ...physicianActor,
      clinicScopeId: foreignScope.id,
      authenticatedSessionId: "fpv1-foreign-session",
    };

    const patient = await prisma.patient.create({
      data: {
        profile: {
          create: {
            fullName: "FPV-1 Patient",
            dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
            gender: "FEMALE",
            maritalStatus: "NOT_MARRIED",
          },
        },
        externalIdentifiers: {
          create: {
            clinicScopeId: clinicScope.id,
            normalizedValue: `FPV1${randomUUID().replaceAll("-", "")}`,
            displayValue: "FPV-1-MRN",
          },
        },
      },
    });
    const invitation = await prisma.interviewInvitation.create({
      data: {
        patientId: patient.id,
        clinicScopeId: clinicScope.id,
        createdByUserId: staff.id,
        temporaryMrnDisplayValue: "FPV-1-MRN",
        temporaryMrnNormalizedValue: "FPV1MRN",
      },
    });
    const patientSession = await prisma.patientAccessSession.create({
      data: {
        invitationId: invitation.id,
        sessionTokenHash: `fpv1-${randomUUID()}`,
        status: "CLOSED",
        closeReason: "SUBMITTED",
        closedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 60_000),
      },
    });
    const sourceDraft = await prisma.draftClinicalInterview.create({
      data: {
        sessionId: patientSession.id,
        contentVersionId: contentVersion.id,
        patientInputJson: { fixture: "patient-authored-pre-visit" },
        status: "SUBMITTED",
        submittedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 60_000),
      },
    });
    const episode = await prisma.clinicalEpisode.create({
      data: {
        patientId: patient.id,
        clinicScopeId: clinicScope.id,
        primaryReasonCode: "RV_HAIR_LOSS",
        openedAt: NOW,
      },
    });
    const visit = await prisma.visit.create({
      data: {
        patientId: patient.id,
        clinicScopeId: clinicScope.id,
        sourceDraftId: sourceDraft.id,
        clinicalEpisodeId: episode.id,
        visitType: "INITIAL",
        status: "CREATED",
      },
    });
    await prisma.clinicalInterview.create({
      data: { visitId: visit.id, status: "UNDER_REVIEW" },
    });

    const createSubmittedSourceDraft = async (sourcePatientId = patient.id) => {
      const extraInvitation = await prisma!.interviewInvitation.create({
        data: {
          patientId: sourcePatientId,
          clinicScopeId: clinicScope.id,
          createdByUserId: staff.id,
        },
      });
      const extraSession = await prisma!.patientAccessSession.create({
        data: {
          invitationId: extraInvitation.id,
          sessionTokenHash: `fpv1-extra-${randomUUID()}`,
          status: "CLOSED",
          closeReason: "SUBMITTED",
          closedAt: NOW,
          expiresAt: new Date(NOW.getTime() + 60_000),
        },
      });
      return prisma!.draftClinicalInterview.create({
        data: {
          sessionId: extraSession.id,
          contentVersionId: contentVersion.id,
          patientInputJson: {},
          status: "SUBMITTED",
          submittedAt: NOW,
          expiresAt: new Date(NOW.getTime() + 60_000),
        },
      });
    };

    const service = new PhysicianVisitService(prisma, { now: () => NOW });
    const officialStateCounts = async () => ({
      journeys: await prisma!.physicianHairJourney.count({
        where: { patientId: patient.id },
      }),
      measurements: await prisma!.measurement.count({
        where: { physicianHairJourney: { patientId: patient.id } },
      }),
      timelineEvents: await prisma!.timelineEvent.count({
        where: { physicianHairJourney: { patientId: patient.id } },
      }),
      clinicianAssessments: await prisma!.clinicianAssessment.count({
        where: { clinicalInterview: { visit: { patientId: patient.id } } },
      }),
      effectiveAssessments: await prisma!.dualPerspectiveAssessment.count({
        where: {
          effectiveValueJson: { not: { equals: null } },
          questionInstance: {
            clinicalInterview: { visit: { patientId: patient.id } },
          },
        },
      }),
    });
    const countsBefore = await officialStateCounts();
    const workspaceBefore = await getPhysicianPatientWorkspace(
      prisma,
      clinicScope.id,
      patient.id,
    );

    await context.test("STAFF can prepare and read an isolated Draft", async () => {
      const record = await service.prepareDraft(staffActor, visit.id);
      assert.equal(record.status, "DRAFT");
      assert.equal(record.draftVersion, 1);
      assert.equal(record.draftStartedByUserId, staff.id);
      assert.deepEqual(record.draftJson, {
        schemaVersion: "FPV_DRAFT_V1",
        sections: {},
      });

      const persistedVisit = await prisma!.visit.findUniqueOrThrow({
        where: { id: visit.id },
      });
      assert.equal(persistedVisit.visitOccurredAt, null);
      const read = await service.read(staffActor, visit.id);
      assert.equal(read.physicianVisitRecord?.id, record.id);
      assert.equal(
        await prisma!.auditLog.count({
          where: {
            entityId: record.id,
            action: "PHYSICIAN_VISIT_DRAFT_STARTED",
            changedByUserId: staff.id,
          },
        }),
        1,
      );
    });

    await context.test("Draft preparation is idempotent and preserves original authorship", async () => {
      const record = await service.prepareDraft(physicianActor, visit.id);
      assert.equal(record.draftStartedByUserId, staff.id);
      assert.equal(record.draftVersion, 1);
      assert.equal(
        await prisma!.physicianVisitRecord.count({ where: { visitId: visit.id } }),
        1,
      );
      assert.equal(
        await prisma!.auditLog.count({
          where: { entityId: record.id, action: "PHYSICIAN_VISIT_DRAFT_STARTED" },
        }),
        1,
      );
    });

    await context.test("foreign clinic read/prepare/update all fail as VISIT_NOT_FOUND", async () => {
      for (const operation of [
        () => service.read(foreignActor, visit.id),
        () => service.prepareDraft(foreignActor, visit.id),
        () =>
          service.updateDraft(foreignActor, visit.id, {
            expectedDraftVersion: 1,
            section: "EXAMINATION",
            value: {},
          }),
      ]) {
        await assert.rejects(
          operation(),
          (error: unknown) =>
            error instanceof PhysicianVisitDraftError &&
            error.code === "VISIT_NOT_FOUND",
        );
      }
    });

    await context.test("Visit/Episode tenant and patient mismatches fail closed", async () => {
      await prisma!.clinicalEpisode.update({
        where: { id: episode.id },
        data: { clinicScopeId: foreignScope.id },
      });
      await assert.rejects(
        service.read(staffActor, visit.id),
        (error: unknown) =>
          error instanceof PhysicianVisitDraftError &&
          error.code === "EPISODE_MISMATCH",
      );
      await prisma!.clinicalEpisode.update({
        where: { id: episode.id },
        data: { clinicScopeId: clinicScope.id },
      });

      const otherPatient = await prisma!.patient.create({ data: {} });
      await prisma!.clinicalEpisode.update({
        where: { id: episode.id },
        data: { patientId: otherPatient.id },
      });
      await assert.rejects(
        service.updateDraft(staffActor, visit.id, {
          expectedDraftVersion: 1,
          section: "EXAMINATION",
          value: {},
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitDraftError &&
          error.code === "EPISODE_MISMATCH",
      );
      await prisma!.clinicalEpisode.update({
        where: { id: episode.id },
        data: { patientId: patient.id },
      });
    });

    await context.test("unresolved Visit/Episode scope cannot prepare a Draft", async () => {
      const unresolvedPatient = await prisma!.patient.create({ data: {} });
      const unresolvedDraft = await createSubmittedSourceDraft(unresolvedPatient.id);
      const unresolvedEpisode = await prisma!.clinicalEpisode.create({
        data: {
          patientId: unresolvedPatient.id,
          clinicScopeId: null,
          primaryReasonCode: "RV_DERMATOLOGY",
          openedAt: NOW,
        },
      });
      const unresolvedVisit = await prisma!.visit.create({
        data: {
          patientId: unresolvedPatient.id,
          clinicScopeId: null,
          sourceDraftId: unresolvedDraft.id,
          clinicalEpisodeId: unresolvedEpisode.id,
          visitType: "INITIAL",
          status: "CREATED",
        },
      });
      await assert.rejects(
        service.prepareDraft(staffActor, unresolvedVisit.id),
        (error: unknown) =>
          error instanceof PhysicianVisitDraftError &&
          error.code === "VISIT_NOT_FOUND",
      );
      assert.equal(
        await prisma!.physicianVisitRecord.count({
          where: { visitId: unresolvedVisit.id },
        }),
        0,
      );
    });

    await context.test("STAFF and PHYSICIAN can edit with optimistic versioning", async () => {
      const staffEdit = await service.updateDraft(staffActor, visit.id, {
        expectedDraftVersion: 1,
        section: "EXAMINATION",
        value: { hairPull: "POSITIVE" },
      });
      assert.equal(staffEdit.draftVersion, 2);
      assert.equal(staffEdit.lastDraftEditedByUserId, staff.id);

      await assert.rejects(
        service.updateDraft(physicianActor, visit.id, {
          expectedDraftVersion: 1,
          section: "EXAMINATION",
          value: { hairPull: "NEGATIVE" },
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitDraftError &&
          error.code === "DRAFT_CONFLICT",
      );

      const physicianEdit = await service.updateDraft(
        physicianActor,
        visit.id,
        {
          expectedDraftVersion: 2,
          section: "PLAN",
          value: { workingNote: "still draft only" },
        },
      );
      assert.equal(physicianEdit.draftVersion, 3);
      assert.equal(physicianEdit.lastDraftEditedByUserId, physician.id);
      assert.equal(
        await prisma!.auditLog.count({
          where: {
            entityId: physicianEdit.id,
            action: "PHYSICIAN_VISIT_DRAFT_UPDATED",
          },
        }),
        2,
      );
    });

    await context.test("patient response provenance cannot cross into physician Draft", async () => {
      await assert.rejects(
        service.updateDraft(staffActor, visit.id, {
          expectedDraftVersion: 3,
          section: "PLAN",
          value: { patientResponseId: randomUUID() },
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitDraftError &&
          error.code === "PATIENT_PROVENANCE_BOUNDARY_VIOLATION",
      );
      const record = await prisma!.physicianVisitRecord.findUniqueOrThrow({
        where: { visitId: visit.id },
      });
      assert.equal(record.draftVersion, 3);
    });

    await context.test("Draft rejects unknown sections and nested provenance aliases", async () => {
      await assert.rejects(
        service.updateDraft(staffActor, visit.id, {
          expectedDraftVersion: 3,
          section: "UNAPPROVED_SECTION",
          value: {},
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitDraftError &&
          error.code === "INVALID_REQUEST",
      );
      for (const value of [
        { nested: { patient_answer_identifier: randomUUID() } },
        { nested: { originResponseUuid: randomUUID() } },
        { nested: { source: { patientAnswers: ["copied"] } } },
      ]) {
        await assert.rejects(
          service.updateDraft(staffActor, visit.id, {
            expectedDraftVersion: 3,
            section: "PLAN",
            value,
          }),
          (error: unknown) =>
            error instanceof PhysicianVisitDraftError &&
            error.code === "PATIENT_PROVENANCE_BOUNDARY_VIOLATION",
        );
      }
      assert.equal(
        (
          await prisma!.physicianVisitRecord.findUniqueOrThrow({
            where: { visitId: visit.id },
          })
        ).draftVersion,
        3,
      );
    });

    await context.test("Draft enforces a total serialized size ceiling", async () => {
      const first = await service.updateDraft(staffActor, visit.id, {
        expectedDraftVersion: 3,
        section: "TESTS_MEDIA",
        value: { workingData: "a".repeat(120 * 1024) },
      });
      assert.equal(first.draftVersion, 4);
      const second = await service.updateDraft(staffActor, visit.id, {
        expectedDraftVersion: 4,
        section: "PLAN",
        value: { workingData: "b".repeat(121 * 1024) },
      });
      assert.equal(second.draftVersion, 5);
      await assert.rejects(
        service.updateDraft(staffActor, visit.id, {
          expectedDraftVersion: 5,
          section: "DIAGNOSIS",
          value: { decisions: [{ action: "ADD", text: "c".repeat(16_000) }] },
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitDraftError &&
          error.code === "INVALID_DRAFT_DATA",
      );
      assert.equal(
        (
          await prisma!.physicianVisitRecord.findUniqueOrThrow({
            where: { visitId: visit.id },
          })
        ).draftVersion,
        5,
      );
    });

    await context.test("concurrent Draft preparation and update races are deterministic", async () => {
      const racePatient = await prisma!.patient.create({ data: {} });
      const raceEpisode = await prisma!.clinicalEpisode.create({
        data: {
          patientId: racePatient.id,
          clinicScopeId: clinicScope.id,
          primaryReasonCode: "RV_HAIR_LOSS",
          openedAt: NOW,
        },
      });
      const raceSourceDraft = await createSubmittedSourceDraft(racePatient.id);
      const raceVisit = await prisma!.visit.create({
        data: {
          patientId: racePatient.id,
          clinicScopeId: clinicScope.id,
          sourceDraftId: raceSourceDraft.id,
          clinicalEpisodeId: raceEpisode.id,
          visitType: "FOLLOW_UP",
          status: "CREATED",
        },
      });
      await prisma!.clinicalInterview.create({
        data: { visitId: raceVisit.id, status: "UNDER_REVIEW" },
      });

      const prepared = await Promise.all([
        service.prepareDraft(staffActor, raceVisit.id),
        service.prepareDraft(physicianActor, raceVisit.id),
      ]);
      assert.equal(prepared[0].id, prepared[1].id);
      assert.equal(
        await prisma!.physicianVisitRecord.count({
          where: { visitId: raceVisit.id },
        }),
        1,
      );
      assert.equal(
        await prisma!.auditLog.count({
          where: {
            entityId: prepared[0].id,
            action: "PHYSICIAN_VISIT_DRAFT_STARTED",
          },
        }),
        1,
      );

      const updates = await Promise.allSettled([
        service.updateDraft(staffActor, raceVisit.id, {
          expectedDraftVersion: 1,
          section: "EXAMINATION",
          value: { hairPull: "POSITIVE" },
        }),
        service.updateDraft(physicianActor, raceVisit.id, {
          expectedDraftVersion: 1,
          section: "PLAN",
          value: { race: "physician" },
        }),
      ]);
      assert.equal(
        updates.filter((result) => result.status === "fulfilled").length,
        1,
      );
      const rejected = updates.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      assert.ok(rejected);
      assert.equal(rejected.reason instanceof PhysicianVisitDraftError, true);
      assert.equal((rejected.reason as PhysicianVisitDraftError).code, "DRAFT_CONFLICT");
      assert.equal(
        (
          await prisma!.physicianVisitRecord.findUniqueOrThrow({
            where: { visitId: raceVisit.id },
          })
        ).draftVersion,
        2,
      );
    });

    await context.test("STAFF cannot finalize", () => {
      assert.throws(
        () => assertCanFinalizePhysicianVisit(staffActor),
        (error: unknown) =>
          error instanceof AuthorizationError &&
          error.code === "PHYSICIAN_FINALIZATION_REQUIRED",
      );
      assert.doesNotThrow(() => assertCanFinalizePhysicianVisit(physicianActor));
    });

    await context.test("serialized physician autosave persists latest sections without canonical clinical effect", async () => {
      const before = (await service.read(physicianActor, visit.id)).physicianVisitRecord!;
      const versions: number[] = [];
      let release!: () => void;
      const delayedFirstRequest = new Promise<void>((resolve) => { release = resolve; });
      const queue = new VisitDraftAutosave(async (command) => {
        versions.push(command.expectedDraftVersion);
        if (versions.length === 1) await delayedFirstRequest;
        return (await service.updateDraft(physicianActor, visit.id, command)).draftVersion;
      });
      queue.initialize(before.draftVersion);
      queue.edit("MEASUREMENTS", { SHEDDING: 1 });
      const saving = queue.flush();
      queue.edit("MEASUREMENTS", { SHEDDING: 4, ITCH: 2 });
      queue.edit("EXAMINATION", { hairPull: "NEGATIVE" });
      queue.edit("DIAGNOSIS", { decisions: [{ action: "ADD", text: "Autosave test assessment" }] });
      queue.edit("TREATMENT_PROCEDURES", { treatments: [{ action: "START", name: "Autosave test treatment" }], procedures: [{ action: "PLAN", procedureCode: "PRP" }] });
      assert.equal(versions.length, 1);
      release();
      assert.equal(await saving, true);
      assert.deepEqual(versions, Array.from({ length: 5 }, (_, index) => before.draftVersion + index));
      const after = (await service.read(physicianActor, visit.id)).physicianVisitRecord!;
      assert.equal(after.draftVersion, before.draftVersion + 5);
      assert.deepEqual(freshWorkspaceSections(after.draftJson).MEASUREMENTS, { SHEDDING: 4, ITCH: 2 });
      assert.equal(after.status, "DRAFT");
      for (const count of await Promise.all([
        prisma!.physicianVisitMeasurement.count(), prisma!.physicianDiagnosis.count(),
        prisma!.physicianDiagnosisDecision.count(), prisma!.physicianTreatmentCourse.count(),
        prisma!.physicianTreatmentDecision.count(), prisma!.physicianProcedurePlan.count(),
        prisma!.physicianProcedureDecision.count(),
      ])) assert.equal(count, 0, "autosave writes only the Draft, never canonical clinical state");
    });

    await context.test("Draft has zero Journey or Effective-State effect", async () => {
      assert.deepEqual(await officialStateCounts(), countsBefore);
      const workspaceAfter = await getPhysicianPatientWorkspace(
        prisma!,
        clinicScope.id,
        patient.id,
      );
      assert.deepEqual(workspaceAfter?.measurementSeries, workspaceBefore?.measurementSeries);
      assert.deepEqual(workspaceAfter?.timeline, workspaceBefore?.timeline);
      assert.deepEqual(workspaceAfter?.summary, workspaceBefore?.summary);

      const episodeClinicalProjection = (episodes: NonNullable<typeof workspaceAfter>["episodes"]) =>
        structuredClone(episodes).map((episode) => ({
          ...episode,
          visits: episode.visits.map((visit) => {
            delete visit.physicianRecordStatus;
            return visit;
          }),
        }));

      assert.deepEqual(
        episodeClinicalProjection(workspaceAfter?.episodes ?? []),
        episodeClinicalProjection(workspaceBefore?.episodes ?? []),
      );
      assert.equal(
        workspaceAfter?.episodes
          .flatMap((episode) => episode.visits)
          .find((workspaceVisit) => workspaceVisit.id === visit.id)?.physicianRecordStatus,
        "DRAFT",
      );
      assert.equal(
        await prisma!.physicianVisitRecord.count({ where: { visitId: visit.id } }),
        1,
      );
    });
  } finally {
    await prisma?.$disconnect();
    const cleanupClient = await adminPool.connect();
    try {
      await cleanupClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      cleanupClient.release();
      await adminPool.end();
    }
  }
});
