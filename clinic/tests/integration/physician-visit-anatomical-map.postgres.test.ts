import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient, type Prisma } from "../../app/generated/prisma/client";
import {
  AuthorizationError,
  type AuthenticatedActor,
} from "../../lib/auth/authorization";
import { PhysicianVisitClinicalService } from "../../lib/physician/visit-clinical-service";
import { PhysicianVisitLifecycleError } from "../../lib/physician/visit-lifecycle-contracts";
import { PhysicianVisitLifecycleService } from "../../lib/physician/visit-lifecycle-service";
import { PhysicianVisitService } from "../../lib/physician/visit-service";
import { seedDatabase } from "../../prisma/seed";

const HOUR = 60 * 60 * 1_000;
const MIGRATIONS_URL = new URL("../../prisma/migrations/", import.meta.url);

const geometry = (x = 0.43, y = 0.27, radius = 0.02) => ({
  version: 1 as const,
  strokes: [{ radius, points: [{ x, y }, { x: x + 0.01, y: y + 0.01 }] }],
});

const region = (
  view: "FRONT" | "TOP" | "RIGHT_SIDE" | "LEFT_SIDE" = "FRONT",
  extras: Record<string, unknown> = {},
) => ({
  view,
  anatomicalRegionCode: view === "FRONT" ? "FRONTAL_SCALP" as const : view === "TOP" ? "MID_SCALP" as const : view === "RIGHT_SIDE" ? "RIGHT_TEMPORAL" as const : "LEFT_TEMPORAL" as const,
  geometry: geometry(),
  ...extras,
});

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

test("FPV-3.5B governed physician Anatomical Map", async (context) => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required.");

  const schemaName = `fpv3_5b_map_${randomUUID().replaceAll("-", "")}`;
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
        code: `FPV3_5B_FOREIGN_${randomUUID()}`,
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
    const createDraftVisit = async (
      options: {
        patientId?: string;
        clinicalEpisodeId?: string;
        patientInputJson?: Prisma.InputJsonValue;
      } = {},
    ) => {
      fixtureIndex += 1;
      const patient = options.patientId
        ? await prisma!.patient.findUniqueOrThrow({ where: { id: options.patientId } })
        : await prisma!.patient.create({ data: {} });
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
          sessionTokenHash: `fpv3-5b-${randomUUID()}`,
          status: "CLOSED",
          closeReason: "SUBMITTED",
          closedAt: new Date(),
          expiresAt: new Date(Date.now() + HOUR),
        },
      });
      const sourceDraft = await prisma!.draftClinicalInterview.create({
        data: {
          sessionId: session.id,
          contentVersionId: contentVersion.id,
          patientInputJson:
            options.patientInputJson ??
            ({ anatomicalMap: { regions: [region("TOP")] } } as Prisma.InputJsonValue),
          status: "SUBMITTED",
          submittedAt: new Date(),
          expiresAt: new Date(Date.now() + HOUR),
        },
      });
      const episode = options.clinicalEpisodeId
        ? await prisma!.clinicalEpisode.findUniqueOrThrow({
            where: { id: options.clinicalEpisodeId },
          })
        : await prisma!.clinicalEpisode.create({
            data: {
              patientId: patient.id,
              clinicScopeId: clinicScope.id,
              primaryReasonCode: "RV_HAIR_LOSS",
              openedAt: new Date(),
            },
          });
      const visit = await prisma!.visit.create({
        data: {
          patientId: patient.id,
          clinicScopeId: clinicScope.id,
          sourceDraftId: sourceDraft.id,
          clinicalEpisodeId: episode.id,
          visitType: fixtureIndex % 2 === 0 ? "FOLLOW_UP" : "INITIAL",
          status: "CREATED",
        },
      });
      const clinicalInterview = await prisma!.clinicalInterview.create({
        data: { visitId: visit.id, status: "UNDER_REVIEW" },
      });
      const draftService = new PhysicianVisitService(prisma!);
      const record = await draftService.prepareDraft(staffActor, visit.id);
      return {
        patient,
        episode,
        visit,
        record,
        sourceDraft,
        clinicalInterview,
        draftService,
      };
    };

    const finalizeFixture = async (
      sections: Array<{ section: string; value: Record<string, unknown> }>,
      encounterAt = new Date(),
      finalizedAt = new Date(),
      options: Parameters<typeof createDraftVisit>[0] = {},
    ) => {
      const fixture = await createDraftVisit(options);
      let draftVersion = fixture.record.draftVersion;
      for (const section of sections) {
        const updated = await fixture.draftService.updateDraft(
          staffActor,
          fixture.visit.id,
          { expectedDraftVersion: draftVersion, ...section },
        );
        draftVersion = updated.draftVersion;
      }
      const lifecycle = new PhysicianVisitLifecycleService(prisma!, {
        now: () => encounterAt,
        databaseSchema: schemaName,
      });
      await lifecycle.beginEncounter(physicianActor, fixture.visit.id);
      const finalized = await new PhysicianVisitLifecycleService(prisma!, {
        now: () => finalizedAt,
        databaseSchema: schemaName,
      }).finalize(physicianActor, fixture.visit.id, { expectedDraftVersion: draftVersion });
      return { ...fixture, draftVersion, finalized };
    };

    const clinical = new PhysicianVisitClinicalService(prisma, {
      databaseSchema: schemaName,
    });
    let canonicalFixture: Awaited<ReturnType<typeof finalizeFixture>>;

    await context.test("an incomplete autosaved region cannot Finalize", async () => {
      const draft = await createDraftVisit();
      const updated = await draft.draftService.updateDraft(staffActor, draft.visit.id, {
        expectedDraftVersion: draft.record.draftVersion,
        section: "ANATOMICAL_MAP",
        value: { regions: [{ view: "TOP", geometry: geometry(0.5, 0.8), noteText: "Unconfirmed drawing" }] },
      });
      const encounterAt = new Date();
      const lifecycle = new PhysicianVisitLifecycleService(prisma!, { now: () => encounterAt, databaseSchema: schemaName });
      await lifecycle.beginEncounter(physicianActor, draft.visit.id);
      await assert.rejects(
        lifecycle.finalize(physicianActor, draft.visit.id, { expectedDraftVersion: updated.draftVersion }),
        (error: unknown) => error instanceof PhysicianVisitLifecycleError && error.code === "INVALID_CLINICAL_DATA",
      );
      assert.equal(await prisma!.physicianVisitAnatomicalMap.count({ where: { physicianVisitRecordId: draft.record.id } }), 0);
      assert.equal((await draft.draftService.read(physicianActor, draft.visit.id)).physicianVisitRecord?.status, "DRAFT");
    });

    await context.test("Finalize materializes all four views atomically and canonical read is strict", async () => {
      const draft = await createDraftVisit();
      const regions = [
        region("FRONT"),
        region("TOP", { noteText: "  exact map note  " }),
        region("RIGHT_SIDE", { displayColorHex: "#a1b2c3" }),
        region("LEFT_SIDE", { noteText: "combined", displayColorHex: "#00FF7F" }),
      ];
      let version = draft.record.draftVersion;
      for (const section of [
        { section: "EXAMINATION", value: { hairPull: "POSITIVE" } },
        { section: "MEASUREMENTS", value: { SHEDDING: 3 } },
        { section: "PATTERN", value: { sinclair: 2 } },
        {
          section: "TRICHOSCOPY",
          value: { selectedFindingCodes: ["YELLOW_DOTS"] },
        },
        { section: "ANATOMICAL_MAP", value: { regions } },
      ]) {
        const updated = await draft.draftService.updateDraft(staffActor, draft.visit.id, {
          expectedDraftVersion: version,
          ...section,
        });
        version = updated.draftVersion;
      }
      const draftRead = await clinical.read(physicianActor, draft.visit.id);
      assert.equal(draftRead.status, "DRAFT");
      assert.equal(draftRead.canonicalClinicalData, null);

      const encounterAt = new Date();
      const lifecycle = new PhysicianVisitLifecycleService(prisma!, {
        now: () => encounterAt,
        databaseSchema: schemaName,
      });
      await lifecycle.beginEncounter(physicianActor, draft.visit.id);
      await lifecycle.finalize(physicianActor, draft.visit.id, {
        expectedDraftVersion: version,
      });
      canonicalFixture = { ...draft, draftVersion: version, finalized: undefined as never };

      const map = await prisma!.physicianVisitAnatomicalMap.findUniqueOrThrow({
        where: { physicianVisitRecordId: draft.record.id },
        include: { regions: { orderBy: { displayOrder: "asc" } } },
      });
      assert.equal(map.templateVersion, 1);
      assert.deepEqual(map.regions.map(({ displayOrder }) => displayOrder), [0, 1, 2, 3]);
      assert.deepEqual(map.regions.map(({ anatomicalRegionCode }) => anatomicalRegionCode), ["FRONTAL_SCALP", "MID_SCALP", "RIGHT_TEMPORAL", "LEFT_TEMPORAL"]);
      assert.equal(map.regions[1]?.noteText, "  exact map note  ");
      assert.equal(map.regions[2]?.displayColorHex, "#A1B2C3");
      const read = await clinical.read(physicianActor, draft.visit.id);
      assert.deepEqual(
        read.canonicalClinicalData?.anatomicalMap?.regions.map(({ view }) => view),
        ["FRONT", "TOP", "RIGHT_SIDE", "LEFT_SIDE"],
      );
      assert.deepEqual(read.canonicalClinicalData?.anatomicalMap?.regions[0]?.geometry, geometry());
      assert.equal(read.canonicalClinicalData?.anatomicalMap?.regions[0]?.anatomicalRegionCode, "FRONTAL_SCALP");
      assert.equal(read.canonicalClinicalData?.anatomicalMap?.templateVersion, 1);
      assert.equal(read.canonicalClinicalData?.physicianMeasurements.SHEDDING, 3);
      assert.equal(read.canonicalClinicalData?.trichoscopy?.selectedFindings[0]?.code, "YELLOW_DOTS");

      const replay = await lifecycle.finalize(physicianActor, draft.visit.id, {
        expectedDraftVersion: version,
      });
      assert.equal(replay.idempotentReplay, true);
      assert.equal(
        await prisma!.physicianVisitAnatomicalMap.count({
          where: { physicianVisitRecordId: draft.record.id },
        }),
        1,
      );
      assert.equal(
        await prisma!.physicianVisitAnatomicalRegion.count({
          where: { physicianVisitAnatomicalMapId: map.id },
        }),
        4,
      );
    });

    await context.test("omission, empty map, patient/legacy data, and prior Visit never promote or carry forward", async () => {
      const omitted = await finalizeFixture([]);
      const empty = await finalizeFixture([
        { section: "ANATOMICAL_MAP", value: { regions: [] } },
      ]);
      for (const fixture of [omitted, empty]) {
        assert.equal(
          await prisma!.physicianVisitAnatomicalMap.count({
            where: { physicianVisitRecordId: fixture.record.id },
          }),
          0,
        );
        assert.equal(
          (await clinical.read(physicianActor, fixture.visit.id)).canonicalClinicalData
            ?.anatomicalMap,
          undefined,
        );
      }

      const legacy = await createDraftVisit({
        patientInputJson: { anatomicalMap: { regions: [region("LEFT_SIDE")] } },
      });
      await prisma!.clinicianAssessment.create({
        data: {
          clinicalInterviewId: legacy.clinicalInterview.id,
          assessmentType: "ANATOMICAL_MAP",
          valueJson: { regions: [region("RIGHT_SIDE")] },
          createdByUserId: physician.id,
        },
      });
      const legacyJourney = await prisma!.physicianHairJourney.create({
        data: { patientId: legacy.patient.id, startedAt: new Date() },
      });
      await prisma!.timelineEvent.create({
        data: {
          physicianHairJourneyId: legacyJourney.id,
          recordedInVisitId: legacy.visit.id,
          recordedByUserId: physician.id,
          type: "OTHER",
          title: "Legacy map-like event",
          valueJson: { anatomicalMap: [region("TOP")] },
          eventDate: new Date(),
        },
      });
      await new PhysicianVisitLifecycleService(prisma!, {
        databaseSchema: schemaName,
      }).beginEncounter(physicianActor, legacy.visit.id);
      await new PhysicianVisitLifecycleService(prisma!, {
        databaseSchema: schemaName,
      }).finalize(physicianActor, legacy.visit.id, {
        expectedDraftVersion: legacy.record.draftVersion,
      });
      assert.equal(
        await prisma!.physicianVisitAnatomicalMap.count({
          where: { physicianVisitRecordId: legacy.record.id },
        }),
        0,
      );

      const first = await finalizeFixture([
        {
          section: "ANATOMICAL_MAP",
          value: {
            regions: [region("FRONT", { noteText: "visit one only", displayColorHex: "#112233" })],
          },
        },
      ]);
      const second = await finalizeFixture(
        [],
        new Date(),
        new Date(),
        { patientId: first.patient.id, clinicalEpisodeId: first.episode.id },
      );
      assert.equal(
        (await clinical.read(physicianActor, second.visit.id)).canonicalClinicalData
          ?.anatomicalMap,
        undefined,
      );
      assert.equal(
        (await clinical.read(physicianActor, first.visit.id)).canonicalClinicalData
          ?.anatomicalMap?.regions[0]?.noteText,
        "visit one only",
      );
    });

    await context.test("historical canonical NULL identity remains readable and is not inferred into storage", async () => {
      const legacy = await finalizeFixture([{ section: "ANATOMICAL_MAP", value: { regions: [region("TOP", {
        anatomicalRegionCode: "VERTEX_CROWN", geometry: geometry(0.5, 0.8), noteText: "Historical canonical region",
      })] } }]);
      const created = await prisma!.physicianVisitAnatomicalRegion.findFirstOrThrow({
        where: { physicianVisitAnatomicalMap: { physicianVisitRecordId: legacy.record.id } },
      });
      // A temporary-schema fixture representing a pre-Migration-20 row. The
      // production migration itself performs no UPDATE/backfill.
      const persisted = await prisma!.physicianVisitAnatomicalRegion.update({
        where: { id: created.id }, data: { anatomicalRegionCode: null },
      });
      assert.equal(persisted.anatomicalRegionCode, null);
      const read = await clinical.read(physicianActor, legacy.visit.id);
      assert.equal(read.canonicalClinicalData?.anatomicalMap?.regions[0]?.anatomicalRegionCode, undefined);
      assert.deepEqual(read.canonicalClinicalData?.anatomicalMap?.regions[0]?.geometry, geometry(0.5, 0.8));
    });

    await context.test("invalid map rolls back all Finalize materialization", async () => {
      const fixture = await createDraftVisit();
      await prisma!.physicianVisitRecord.update({
        where: { id: fixture.record.id },
        data: {
          draftJson: {
            schemaVersion: "FPV_DRAFT_V1",
            sections: {
              MEASUREMENTS: { SHEDDING: 2 },
              ANATOMICAL_MAP: {
                regions: [region("FRONT", { geometry: { version: 1, strokes: [] } })],
              },
            },
          },
        },
      });
      const lifecycle = new PhysicianVisitLifecycleService(prisma!, {
        databaseSchema: schemaName,
      });
      await lifecycle.beginEncounter(physicianActor, fixture.visit.id);
      await assert.rejects(
        lifecycle.finalize(physicianActor, fixture.visit.id, {
          expectedDraftVersion: fixture.record.draftVersion,
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "INVALID_CLINICAL_DATA",
      );
      assert.equal(
        await prisma!.physicianVisitMeasurement.count({
          where: { physicianVisitRecordId: fixture.record.id },
        }),
        0,
      );
      assert.equal(
        await prisma!.physicianVisitAnatomicalMap.count({
          where: { physicianVisitRecordId: fixture.record.id },
        }),
        0,
      );
      assert.equal(
        (await prisma!.physicianVisitRecord.findUniqueOrThrow({ where: { id: fixture.record.id } })).status,
        "DRAFT",
      );
    });

    await context.test("concurrent Finalize produces one map and one immutable evidence event", async () => {
      const fixture = await createDraftVisit();
      const updated = await fixture.draftService.updateDraft(staffActor, fixture.visit.id, {
        expectedDraftVersion: fixture.record.draftVersion,
        section: "ANATOMICAL_MAP",
        value: { regions: [region("TOP")] },
      });
      const now = new Date();
      const lifecycle = new PhysicianVisitLifecycleService(prisma!, {
        now: () => now,
        databaseSchema: schemaName,
      });
      await lifecycle.beginEncounter(physicianActor, fixture.visit.id);
      const results = await Promise.all([
        lifecycle.finalize(physicianActor, fixture.visit.id, {
          expectedDraftVersion: updated.draftVersion,
        }),
        lifecycle.finalize(physicianActor, fixture.visit.id, {
          expectedDraftVersion: updated.draftVersion,
        }),
      ]);
      assert.deepEqual(results.map(({ idempotentReplay }) => idempotentReplay).sort(), [false, true]);
      assert.equal(
        await prisma!.physicianVisitAnatomicalMap.count({
          where: { physicianVisitRecordId: fixture.record.id },
        }),
        1,
      );
      assert.equal(
        await prisma!.auditLog.count({
          where: { entityId: fixture.record.id, action: "PHYSICIAN_VISIT_FINALIZED" },
        }),
        1,
      );
    });

    await context.test("whole-set correction replaces and omits map with full audit and security", async () => {
      const firstCorrection = await clinical.correct(physicianActor, canonicalFixture.visit.id, {
        target: "ANATOMICAL_MAP_REGIONS",
        operation: "SET",
        value: [
          region("LEFT_SIDE", {
            geometry: geometry(0.2, 0.3, 0.04),
            noteText: "changed note",
            displayColorHex: "#445566",
          }),
          region("TOP", { displayColorHex: "#778899" }),
        ],
      });
      assert.equal(firstCorrection.clinicalDomain, "ANATOMICAL_MAP");
      assert.equal(firstCorrection.canonicalTarget, "REGIONS");
      assert.equal((firstCorrection.oldValue as { regions: unknown[] }).regions.length, 4);
      assert.equal((firstCorrection.newValue as { regions: unknown[] }).regions.length, 2);
      const correctedRead = await clinical.read(physicianActor, canonicalFixture.visit.id);
      assert.equal(correctedRead.canonicalClinicalData?.anatomicalMap?.regions[0]?.noteText, "changed note");
      assert.deepEqual(
        correctedRead.canonicalClinicalData?.anatomicalMap?.regions[0]?.geometry,
        geometry(0.2, 0.3, 0.04),
      );
      const audit = await prisma!.auditLog.findUniqueOrThrow({
        where: { id: firstCorrection.auditLogId },
      });
      assert.equal(audit.fieldName, "anatomicalMap.regions");
      assert.equal((audit.oldValueJson as { value: { regions: unknown[] } }).value.regions.length, 4);
      assert.equal((audit.newValueJson as { value: { regions: unknown[] } }).value.regions.length, 2);

      const beforeFailure = await prisma!.physicianVisitAnatomicalMap.findUniqueOrThrow({
        where: { physicianVisitRecordId: canonicalFixture.record.id },
        include: { regions: true },
      });
      await assert.rejects(
        new PhysicianVisitClinicalService(prisma!, {
          databaseSchema: schemaName,
          beforeCorrectionAudit: () => {
            throw new Error("injected map audit failure");
          },
        }).correct(physicianActor, canonicalFixture.visit.id, {
          target: "ANATOMICAL_MAP_REGIONS",
          operation: "SET",
          value: [region("FRONT")],
        }),
        /injected map audit failure/,
      );
      assert.equal(
        (
          await prisma!.physicianVisitAnatomicalMap.findUniqueOrThrow({
            where: { physicianVisitRecordId: canonicalFixture.record.id },
            include: { regions: true },
          })
        ).regions.length,
        beforeFailure.regions.length,
      );
      await assert.rejects(
        clinical.correct(staffActor, canonicalFixture.visit.id, {
          target: "ANATOMICAL_MAP_REGIONS",
          operation: "OMIT",
        }),
        (error: unknown) =>
          error instanceof AuthorizationError && error.code === "ACTION_NOT_ALLOWED",
      );
      await assert.rejects(
        clinical.correct(foreignPhysicianActor, canonicalFixture.visit.id, {
          target: "ANATOMICAL_MAP_REGIONS",
          operation: "OMIT",
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError && error.code === "VISIT_NOT_FOUND",
      );
      const omitted = await clinical.correct(physicianActor, canonicalFixture.visit.id, {
        target: "ANATOMICAL_MAP_REGIONS",
        operation: "OMIT",
      });
      assert.equal(omitted.newValue, undefined);
      assert.equal(
        await prisma!.physicianVisitAnatomicalMap.count({
          where: { physicianVisitRecordId: canonicalFixture.record.id },
        }),
        0,
      );
      const restored = await clinical.correct(physicianActor, canonicalFixture.visit.id, {
        target: "ANATOMICAL_MAP_REGIONS",
        operation: "SET",
        value: [region("FRONT")],
      });
      assert.equal((restored.oldValue as unknown), undefined);
    });

    await context.test("correction uses the exact 24-hour encounter boundary", async () => {
      const justBeforeEncounter = new Date(Date.now() - 24 * HOUR + 30_000);
      const justBefore = await finalizeFixture([], justBeforeEncounter, new Date());
      await new PhysicianVisitClinicalService(prisma!, {
        now: () => new Date(justBeforeEncounter.getTime() + 24 * HOUR - 1),
        databaseSchema: schemaName,
      }).correct(physicianActor, justBefore.visit.id, {
        target: "ANATOMICAL_MAP_REGIONS",
        operation: "SET",
        value: [region("RIGHT_SIDE")],
      });

      for (const offset of [24 * HOUR, 24 * HOUR + 1]) {
        const encounterAt = new Date(Date.now() - 25 * HOUR);
        const fixture = await finalizeFixture(
          [{ section: "ANATOMICAL_MAP", value: { regions: [region("FRONT")] } }],
          encounterAt,
          new Date(),
        );
        await assert.rejects(
          new PhysicianVisitClinicalService(prisma!, {
            now: () => new Date(encounterAt.getTime() + offset),
            databaseSchema: schemaName,
          }).correct(physicianActor, fixture.visit.id, {
            target: "ANATOMICAL_MAP_REGIONS",
            operation: "OMIT",
          }),
          (error: unknown) =>
            error instanceof PhysicianVisitLifecycleError &&
            error.code === "VISIT_CORRECTION_WINDOW_CLOSED",
        );
      }
    });

    await context.test("late first Finalize succeeds and PostgreSQL hard-locks six mutation paths", async () => {
      const encounterAt = new Date(Date.now() - 25 * HOUR);
      const late = await finalizeFixture(
        [{ section: "ANATOMICAL_MAP", value: { regions: [region("TOP")] } }],
        encounterAt,
        new Date(),
      );
      assert.equal(late.finalized.physicianVisitRecord.isLateDocumentation, true);
      const map = await prisma!.physicianVisitAnatomicalMap.findUniqueOrThrow({
        where: { physicianVisitRecordId: late.record.id },
        include: { regions: true },
      });
      const locked = /FPV-3(?:\.5B)? hard lock: canonical (?:clinical|anatomical map) correction window is closed/;
      await assert.rejects(
        prisma!.physicianVisitAnatomicalMap.update({
          where: { id: map.id },
          data: { templateVersion: 1 },
        }),
        locked,
      );
      await assert.rejects(
        prisma!.physicianVisitAnatomicalMap.delete({ where: { id: map.id } }),
        locked,
      );
      await assert.rejects(
        prisma!.$executeRawUnsafe(
          `INSERT INTO "${schemaName}"."PhysicianVisitAnatomicalMap" ("id", "physicianVisitRecordId", "templateVersion", "updatedAt") VALUES ($1::uuid, $2::uuid, 1, CURRENT_TIMESTAMP)`,
          randomUUID(),
          late.record.id,
        ),
        locked,
      );
      await assert.rejects(
        prisma!.physicianVisitAnatomicalRegion.create({
          data: {
            physicianVisitAnatomicalMapId: map.id,
            view: "FRONT",
            geometry: geometry(),
            displayOrder: 1,
          },
        }),
        locked,
      );
      await assert.rejects(
        prisma!.physicianVisitAnatomicalRegion.update({
          where: { id: map.regions[0]!.id },
          data: { noteText: "forbidden" },
        }),
        locked,
      );
      await assert.rejects(
        prisma!.physicianVisitAnatomicalRegion.delete({
          where: { id: map.regions[0]!.id },
        }),
        locked,
      );
      assert.equal(
        await prisma!.physicianVisitAnatomicalRegion.count({
          where: { physicianVisitAnatomicalMapId: map.id },
        }),
        1,
      );
    });

    await context.test("database rejects malformed geometry, blank note, invalid color, and AuditLog mutation", async () => {
      const fixture = await finalizeFixture([
        {
          section: "ANATOMICAL_MAP",
          value: { regions: [region("FRONT", { noteText: "valid", displayColorHex: "#123456" })] },
        },
      ]);
      const map = await prisma!.physicianVisitAnatomicalMap.findUniqueOrThrow({
        where: { physicianVisitRecordId: fixture.record.id },
        include: { regions: true },
      });
      await assert.rejects(
        prisma!.$executeRawUnsafe(
          `UPDATE "${schemaName}"."PhysicianVisitAnatomicalRegion" SET "geometry" = $1::jsonb WHERE "id" = $2::uuid`,
          JSON.stringify({ version: 1, strokes: [] }),
          map.regions[0]!.id,
        ),
        /PVA_Region_geometry_check/,
      );
      for (const noteText of ["   ", "\t\n\r"]) {
        await assert.rejects(
          prisma!.$executeRawUnsafe(
            `UPDATE "${schemaName}"."PhysicianVisitAnatomicalRegion" SET "noteText" = $1 WHERE "id" = $2::uuid`,
            noteText,
            map.regions[0]!.id,
          ),
          /PVA_Region_note_check/,
        );
      }
      await assert.rejects(
        prisma!.physicianVisitAnatomicalRegion.update({
          where: { id: map.regions[0]!.id },
          data: { displayColorHex: "red" },
        }),
        /PVA_Region_color_check/,
      );
      const audit = await prisma!.auditLog.findFirstOrThrow({
        where: { entityId: fixture.record.id, action: "PHYSICIAN_VISIT_FINALIZED" },
      });
      await assert.rejects(
        prisma!.auditLog.update({
          where: { id: audit.id },
          data: { reason: "forbidden" },
        }),
        /append-only: AuditLog cannot be updated or deleted/,
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
