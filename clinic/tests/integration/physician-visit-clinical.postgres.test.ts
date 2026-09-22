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
import type { PhysicianClinicalCorrectionCommand } from "../../lib/physician/visit-clinical-contracts";
import { PhysicianVisitLifecycleError } from "../../lib/physician/visit-lifecycle-contracts";
import { PhysicianVisitLifecycleService } from "../../lib/physician/visit-lifecycle-service";
import { PhysicianVisitDraftError } from "../../lib/physician/visit-contracts";
import { PhysicianVisitService } from "../../lib/physician/visit-service";
import { seedDatabase } from "../../prisma/seed";

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

test("FPV-3 governed physician clinical observations", async (context) => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required.");

  const schemaName = `fpv3_clinical_${randomUUID().replaceAll("-", "")}`;
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
        code: `FPV3_FOREIGN_${randomUUID()}`,
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
          sessionTokenHash: `fpv3-${randomUUID()}`,
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
          patientInputJson: options.patientInputJson ?? {
            examination: { hairPull: "NEGATIVE" },
            measurements: { SHEDDING: 5, DENSITY: 4 },
            patientHairHistoryId: randomUUID(),
          },
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
        draftService,
        sourceDraft,
        clinicalInterview,
      };
    };

    const finalizeFixture = async (
      sections: Array<{ section: string; value: Record<string, unknown> }>,
      encounterAt = new Date(),
      finalizedAt = new Date(),
    ) => {
      const fixture = await createDraftVisit();
      let draftVersion = fixture.record.draftVersion;
      for (const section of sections) {
        const updated = await fixture.draftService.updateDraft(
          staffActor,
          fixture.visit.id,
          { expectedDraftVersion: draftVersion, ...section },
        );
        draftVersion = updated.draftVersion;
      }
      await new PhysicianVisitLifecycleService(prisma!, {
        now: () => encounterAt,
        databaseSchema: schemaName,
      }).beginEncounter(physicianActor, fixture.visit.id);
      const finalized = await new PhysicianVisitLifecycleService(prisma!, {
        now: () => finalizedAt,
        databaseSchema: schemaName,
      }).finalize(physicianActor, fixture.visit.id, {
        expectedDraftVersion: draftVersion,
      });
      return { ...fixture, draftVersion, finalized };
    };

    const allSections = [
      {
        section: "EXAMINATION",
        value: {
          hairPull: "NOT_RECORDED",
          hairParting: ["VERTEX_THINNER", "UNIVERSAL", "FRONTAL_THINNER"],
        },
      },
      {
        section: "MEASUREMENTS",
        value: { SHEDDING: 3, DENSITY_LOSS: 0, ITCH: 2, BURNING: 5 },
      },
      {
        section: "PATTERN",
        value: {
          sinclair: 3,
          mcuFv: { basic: "M2", frontal: "F2", vertex: "V1" },
          hairLineDistanceCm: { midline: 7.125, rightSide: 7, leftSide: 7.25 },
        },
      },
      {
        section: "TRICHOSCOPY",
        value: {
          selectedFindingCodes: [
            "ZIGZAG_HAIRS",
            "VELLUS_HAIRS",
            "WIGGLY_SQUIGGLY_HAIR",
          ],
          otherFindingText: "  exact physician trichoscopy note\nsecond line  ",
        },
      },
    ];
    const main = await finalizeFixture(allSections);
    const clinical = new PhysicianVisitClinicalService(prisma!, {
      databaseSchema: schemaName,
    });

    await context.test("Finalize atomically materializes all governed domains and strict read preserves semantics", async () => {
      assert.equal(
        await prisma!.physicianClinicalExamination.count({
          where: { physicianVisitRecordId: main.record.id },
        }),
        1,
      );
      assert.equal(
        await prisma!.physicianVisitMeasurement.count({
          where: { physicianVisitRecordId: main.record.id },
        }),
        4,
      );
      assert.equal(
        await prisma!.physicianPatternAssessment.count({
          where: { physicianVisitRecordId: main.record.id },
        }),
        1,
      );
      assert.equal(
        await prisma!.physicianVisitTrichoscopy.count({
          where: { physicianVisitRecordId: main.record.id },
        }),
        1,
      );
      assert.equal(
        await prisma!.physicianVisitTrichoscopyFinding.count({
          where: {
            physicianVisitTrichoscopy: {
              physicianVisitRecordId: main.record.id,
            },
          },
        }),
        3,
      );
      const read = await clinical.read(physicianActor, main.visit.id);
      assert.equal(read.status, "FINALIZED");
      assert.deepEqual(read.canonicalClinicalData?.clinicalExamination, {
        hairPull: "NOT_RECORDED",
        hairParting: ["UNIVERSAL", "FRONTAL_THINNER", "VERTEX_THINNER"],
      });
      assert.deepEqual(read.canonicalClinicalData?.physicianMeasurements, {
        SHEDDING: 3,
        DENSITY_LOSS: 0,
        ITCH: 2,
        BURNING: 5,
      });
      assert.deepEqual(read.canonicalClinicalData?.patternMeasurements, {
        sinclair: 3,
        mcuFv: {
          basic: "M2",
          frontal: "F2",
          vertex: "V1",
          displayCode: "M2F2V1",
        },
        hairLineDistance: {
          unit: "cm",
          midline: "7.125",
          rightSide: "7",
          leftSide: "7.25",
        },
      });
      assert.deepEqual(read.canonicalClinicalData?.trichoscopy, {
        selectedFindings: [
          { code: "VELLUS_HAIRS", label: "Vellus hairs" },
          { code: "WIGGLY_SQUIGGLY_HAIR", label: "Wiggly Squiggly hair" },
          { code: "ZIGZAG_HAIRS", label: "Zigzag hairs" },
        ],
        otherFindingText: "  exact physician trichoscopy note\nsecond line  ",
      });
      assert.equal(JSON.stringify(read).includes("draftJson"), false);
      assert.equal(JSON.stringify(read).includes("patientInputJson"), false);
    });

    await context.test("Finalize replay is idempotent and immutable evidence is unchanged", async () => {
      const before = await prisma!.physicianVisitRecord.findUniqueOrThrow({
        where: { id: main.record.id },
      });
      const replay = await new PhysicianVisitLifecycleService(prisma!, {
        databaseSchema: schemaName,
      }).finalize(physicianActor, main.visit.id, { expectedDraftVersion: 999 });
      assert.equal(replay.idempotentReplay, true);
      assert.equal(
        await prisma!.physicianClinicalExamination.count({
          where: { physicianVisitRecordId: main.record.id },
        }),
        1,
      );
      assert.equal(
        await prisma!.physicianVisitMeasurement.count({
          where: { physicianVisitRecordId: main.record.id },
        }),
        4,
      );
      assert.equal(
        await prisma!.physicianPatternAssessment.count({
          where: { physicianVisitRecordId: main.record.id },
        }),
        1,
      );
      assert.equal(
        await prisma!.physicianVisitTrichoscopy.count({
          where: { physicianVisitRecordId: main.record.id },
        }),
        1,
      );
      const after = await prisma!.physicianVisitRecord.findUniqueOrThrow({
        where: { id: main.record.id },
      });
      assert.equal(after.finalizedAt?.toISOString(), before.finalizedAt?.toISOString());
      assert.equal(after.finalizedDraftSha256, before.finalizedDraftSha256);
      assert.deepEqual(after.originalFinalizationEvidenceJson, before.originalFinalizationEvidenceJson);
      assert.equal(
        await prisma!.auditLog.count({
          where: { entityId: main.record.id, action: "PHYSICIAN_VISIT_FINALIZED" },
        }),
        1,
      );
    });

    await context.test("duplicate concurrent Finalize creates one canonical materialization", async () => {
      const concurrent = await createDraftVisit();
      const updated = await concurrent.draftService.updateDraft(
        staffActor,
        concurrent.visit.id,
        {
          expectedDraftVersion: 1,
          section: "MEASUREMENTS",
          value: { SHEDDING: 3 },
        },
      );
      const now = new Date();
      await new PhysicianVisitLifecycleService(prisma!, {
        now: () => now,
        databaseSchema: schemaName,
      }).beginEncounter(physicianActor, concurrent.visit.id);
      const service = new PhysicianVisitLifecycleService(prisma!, {
        now: () => now,
        databaseSchema: schemaName,
      });
      const results = await Promise.all([
        service.finalize(physicianActor, concurrent.visit.id, {
          expectedDraftVersion: updated.draftVersion,
        }),
        service.finalize(physicianActor, concurrent.visit.id, {
          expectedDraftVersion: updated.draftVersion,
        }),
      ]);
      assert.deepEqual(
        results.map((result) => result.idempotentReplay).sort(),
        [false, true],
      );
      assert.equal(
        await prisma!.physicianVisitMeasurement.count({
          where: { physicianVisitRecordId: concurrent.record.id },
        }),
        1,
      );
      assert.equal(
        await prisma!.auditLog.count({
          where: {
            entityId: concurrent.record.id,
            action: "PHYSICIAN_VISIT_FINALIZED",
          },
        }),
        1,
      );
    });

    await context.test("explicit empty governed sections Finalize without placeholder rows", async () => {
      const empty = await finalizeFixture([
        { section: "EXAMINATION", value: { hairParting: [] } },
        { section: "MEASUREMENTS", value: {} },
        { section: "PATTERN", value: { hairLineDistanceCm: {} } },
        { section: "TRICHOSCOPY", value: { selectedFindingCodes: [] } },
      ]);
      assert.equal(
        await prisma!.physicianClinicalExamination.count({
          where: { physicianVisitRecordId: empty.record.id },
        }),
        0,
      );
      assert.equal(
        await prisma!.physicianVisitMeasurement.count({
          where: { physicianVisitRecordId: empty.record.id },
        }),
        0,
      );
      assert.equal(
        await prisma!.physicianPatternAssessment.count({
          where: { physicianVisitRecordId: empty.record.id },
        }),
        0,
      );
      assert.equal(
        await prisma!.physicianVisitTrichoscopy.count({
          where: { physicianVisitRecordId: empty.record.id },
        }),
        0,
      );
    });

    await context.test("patient and legacy records are not promoted or merged", async () => {
      const definition = await prisma!.measurementDefinition.upsert({
        where: { code: "SHEDDING" },
        create: {
          code: "SHEDDING",
          nameAr: "تساقط",
          nameEn: "Legacy shedding",
          unitCode: "0_5",
        },
        update: {},
      });
      const journey = await prisma!.physicianHairJourney.create({
        data: { patientId: main.patient.id, startedAt: new Date() },
      });
      await prisma!.measurement.create({
        data: {
          physicianHairJourneyId: journey.id,
          recordedInVisitId: main.visit.id,
          recordedByUserId: physician.id,
          measurementDefinitionId: definition.id,
          value: 5,
          measurementDate: new Date(),
        },
      });
      const read = await clinical.read(physicianActor, main.visit.id);
      assert.equal(read.canonicalClinicalData?.physicianMeasurements.SHEDDING, 3);
      assert.equal("DENSITY" in (read.canonicalClinicalData?.physicianMeasurements ?? {}), false);
      const canonicalRows = await prisma!.physicianVisitMeasurement.findMany({
        where: { physicianVisitRecordId: main.record.id },
      });
      assert.equal(canonicalRows.every((row) => row.physicianVisitRecordId === main.record.id), true);
      assert.equal(JSON.stringify(canonicalRows).includes("responseId"), false);
      assert.equal(JSON.stringify(canonicalRows).includes("hairHistory"), false);
    });

    await context.test("patient and legacy Trichoscopy-like data is never promoted into canonical Trichoscopy", async () => {
      const patientAndLegacy = await createDraftVisit({
        patientInputJson: {
          trichoscopy: {
            selectedFindingCodes: ["YELLOW_DOTS"],
            otherFindingText: "patient-origin trichoscopy-like text",
          },
        },
      });
      await prisma!.clinicianAssessment.create({
        data: {
          clinicalInterviewId: patientAndLegacy.clinicalInterview.id,
          assessmentType: "TRICHOSCOPY",
          valueJson: {
            selectedFindingCodes: ["BLACK_DOTS"],
            otherFindingText: "legacy clinician assessment text",
          },
          createdByUserId: physician.id,
        },
      });
      await new PhysicianVisitLifecycleService(prisma!, {
        databaseSchema: schemaName,
      }).beginEncounter(physicianActor, patientAndLegacy.visit.id);
      await new PhysicianVisitLifecycleService(prisma!, {
        databaseSchema: schemaName,
      }).finalize(physicianActor, patientAndLegacy.visit.id, {
        expectedDraftVersion: patientAndLegacy.record.draftVersion,
      });
      assert.equal(
        await prisma!.physicianVisitTrichoscopy.count({
          where: { physicianVisitRecordId: patientAndLegacy.record.id },
        }),
        0,
      );
      assert.equal(
        (await clinical.read(physicianActor, patientAndLegacy.visit.id))
          .canonicalClinicalData?.trichoscopy,
        undefined,
      );

      const governed = await createDraftVisit({
        patientInputJson: {
          trichoscopy: {
            selectedFindingCodes: ["YELLOW_DOTS"],
            otherFindingText: "patient value must remain non-canonical",
          },
        },
      });
      await prisma!.clinicianAssessment.create({
        data: {
          clinicalInterviewId: governed.clinicalInterview.id,
          assessmentType: "TRICHOSCOPY",
          valueJson: {
            selectedFindingCodes: ["BLACK_DOTS"],
            otherFindingText: "legacy value must remain non-canonical",
          },
          createdByUserId: physician.id,
        },
      });
      const governedDraft = await governed.draftService.updateDraft(
        staffActor,
        governed.visit.id,
        {
          expectedDraftVersion: governed.record.draftVersion,
          section: "TRICHOSCOPY",
          value: {
            selectedFindingCodes: ["VELLUS_HAIRS"],
            otherFindingText: "governed physician Draft only",
          },
        },
      );
      await new PhysicianVisitLifecycleService(prisma!, {
        databaseSchema: schemaName,
      }).beginEncounter(physicianActor, governed.visit.id);
      await new PhysicianVisitLifecycleService(prisma!, {
        databaseSchema: schemaName,
      }).finalize(physicianActor, governed.visit.id, {
        expectedDraftVersion: governedDraft.draftVersion,
      });
      assert.deepEqual(
        (await clinical.read(physicianActor, governed.visit.id)).canonicalClinicalData
          ?.trichoscopy,
        {
          selectedFindings: [{ code: "VELLUS_HAIRS", label: "Vellus hairs" }],
          otherFindingText: "governed physician Draft only",
        },
      );
    });

    await context.test("a later visit in the same clinical episode does not carry Trichoscopy forward", async () => {
      const first = await finalizeFixture([
        {
          section: "TRICHOSCOPY",
          value: {
            selectedFindingCodes: ["YELLOW_DOTS"],
            otherFindingText: "visit one only",
          },
        },
      ]);
      const second = await createDraftVisit({
        patientId: first.patient.id,
        clinicalEpisodeId: first.episode.id,
      });
      await new PhysicianVisitLifecycleService(prisma!, {
        databaseSchema: schemaName,
      }).beginEncounter(physicianActor, second.visit.id);
      await new PhysicianVisitLifecycleService(prisma!, {
        databaseSchema: schemaName,
      }).finalize(physicianActor, second.visit.id, {
        expectedDraftVersion: second.record.draftVersion,
      });
      assert.equal(
        await prisma!.physicianVisitTrichoscopy.count({
          where: { physicianVisitRecordId: second.record.id },
        }),
        0,
      );
      assert.equal(
        (await clinical.read(physicianActor, second.visit.id)).canonicalClinicalData
          ?.trichoscopy,
        undefined,
      );
      assert.deepEqual(
        (await clinical.read(physicianActor, first.visit.id)).canonicalClinicalData
          ?.trichoscopy,
        {
          selectedFindings: [{ code: "YELLOW_DOTS", label: "Yellow dots" }],
          otherFindingText: "visit one only",
        },
      );
    });

    await context.test("invalid or ungoverned Draft content rolls back all Finalize materialization", async () => {
      const invalid = await createDraftVisit();
      const governed = await invalid.draftService.updateDraft(staffActor, invalid.visit.id, {
        expectedDraftVersion: 1,
        section: "EXAMINATION",
        value: { hairPull: "POSITIVE" },
      });
      const blocked = await invalid.draftService.updateDraft(staffActor, invalid.visit.id, {
        expectedDraftVersion: governed.draftVersion,
        section: "PLAN",
        value: { text: "Out of FPV-3 scope" },
      });
      const now = new Date();
      const lifecycle = new PhysicianVisitLifecycleService(prisma!, {
        now: () => now,
        databaseSchema: schemaName,
      });
      await lifecycle.beginEncounter(physicianActor, invalid.visit.id);
      await assert.rejects(
        lifecycle.finalize(physicianActor, invalid.visit.id, {
          expectedDraftVersion: blocked.draftVersion,
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "UNAPPROVED_FINALIZATION_CONTENT",
      );
      assert.equal(
        await prisma!.physicianClinicalExamination.count({
          where: { physicianVisitRecordId: invalid.record.id },
        }),
        0,
      );
      assert.equal(
        (await prisma!.physicianVisitRecord.findUniqueOrThrow({ where: { id: invalid.record.id } })).status,
        "DRAFT",
      );
      await assert.rejects(
        invalid.draftService.updateDraft(staffActor, invalid.visit.id, {
          expectedDraftVersion: blocked.draftVersion,
          section: "MEASUREMENTS",
          value: { SHEDDING: 6 },
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitDraftError &&
          error.code === "INVALID_DRAFT_DATA",
      );
    });

    await context.test("STAFF and cross-clinic correction/read fail closed", async () => {
      await assert.rejects(
        clinical.correct(staffActor, main.visit.id, {
          target: "PHYSICIAN_MEASUREMENT",
          metric: "SHEDDING",
          operation: "SET",
          value: 2,
        }),
        (error: unknown) =>
          error instanceof AuthorizationError && error.code === "ACTION_NOT_ALLOWED",
      );
      await assert.rejects(
        clinical.correct(foreignPhysicianActor, main.visit.id, {
          target: "SINCLAIR",
          operation: "SET",
          value: 2,
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "VISIT_NOT_FOUND",
      );
      await assert.rejects(
        clinical.read(staffActor, main.visit.id),
        (error: unknown) =>
          error instanceof AuthorizationError && error.code === "ACTION_NOT_ALLOWED",
      );
      await assert.rejects(
        clinical.read(foreignPhysicianActor, main.visit.id),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "VISIT_NOT_FOUND",
      );
    });

    await context.test("direct correction covers recorded, omitted, zero, and structured optional semantics with audit", async () => {
      const before = await prisma!.physicianVisitRecord.findUniqueOrThrow({
        where: { id: main.record.id },
      });
      const visitBefore = await prisma!.visit.findUniqueOrThrow({
        where: { id: main.visit.id },
      });
      const commands: PhysicianClinicalCorrectionCommand[] = [
        { target: "PHYSICIAN_MEASUREMENT", metric: "SHEDDING", operation: "SET", value: 2 },
        { target: "PHYSICIAN_MEASUREMENT", metric: "DENSITY_LOSS", operation: "SET", value: 1 },
        { target: "PHYSICIAN_MEASUREMENT", metric: "ITCH", operation: "OMIT" },
        { target: "PHYSICIAN_MEASUREMENT", metric: "SCALP_PAIN", operation: "SET", value: 0 },
        { target: "HAIR_PULL", operation: "OMIT" },
        { target: "HAIR_PULL", operation: "SET", value: "NEGATIVE" },
        { target: "HAIR_PARTING", operation: "OMIT" },
        { target: "HAIR_PARTING", operation: "SET", value: ["CROWN_THINNER"] },
        { target: "SINCLAIR", operation: "OMIT" },
        { target: "SINCLAIR", operation: "SET", value: 2 },
        { target: "MCU_FV", operation: "SET", value: { basic: "C1" } },
        { target: "MCU_FV", operation: "OMIT" },
        { target: "MCU_FV", operation: "SET", value: { basic: "C1" } },
        { target: "HAIR_LINE_DISTANCE", position: "MIDLINE", operation: "SET", value: 6.875 },
        { target: "HAIR_LINE_DISTANCE", position: "RIGHT_SIDE", operation: "OMIT" },
        { target: "HAIR_LINE_DISTANCE", position: "LEFT_SIDE", operation: "OMIT" },
        { target: "HAIR_LINE_DISTANCE", position: "LEFT_SIDE", operation: "SET", value: 7.375 },
      ];
      const corrections = [];
      for (const command of commands) {
        corrections.push(await clinical.correct(physicianActor, main.visit.id, command));
      }
      assert.equal(corrections[0]?.oldValue, 3);
      assert.equal(corrections[0]?.newValue, 2);
      assert.equal(corrections[0]?.correctedByUserId, physician.id);
      assert.equal(corrections.every((item) => item.auditLogId.length > 0), true);

      const read = await clinical.read(physicianActor, main.visit.id);
      assert.deepEqual(read.canonicalClinicalData?.physicianMeasurements, {
        SHEDDING: 2,
        DENSITY_LOSS: 1,
        BURNING: 5,
        SCALP_PAIN: 0,
      });
      assert.deepEqual(read.canonicalClinicalData?.clinicalExamination, {
        hairPull: "NEGATIVE",
        hairParting: ["CROWN_THINNER"],
      });
      assert.deepEqual(read.canonicalClinicalData?.patternMeasurements, {
        sinclair: 2,
        mcuFv: { basic: "C1", displayCode: "C1" },
        hairLineDistance: { unit: "cm", midline: "6.875", leftSide: "7.375" },
      });
      const after = await prisma!.physicianVisitRecord.findUniqueOrThrow({
        where: { id: main.record.id },
      });
      const visitAfter = await prisma!.visit.findUniqueOrThrow({
        where: { id: main.visit.id },
      });
      assert.equal(after.finalizedAt?.toISOString(), before.finalizedAt?.toISOString());
      assert.equal(after.finalizedDraftSha256, before.finalizedDraftSha256);
      assert.equal(visitAfter.visitOccurredAt?.toISOString(), visitBefore.visitOccurredAt?.toISOString());
      assert.equal(
        await prisma!.auditLog.count({
          where: { entityId: main.record.id, action: "PHYSICIAN_CLINICAL_CORRECTION" },
        }),
        commands.length,
      );
      const sheddingAudit = await prisma!.auditLog.findFirstOrThrow({
        where: {
          entityId: main.record.id,
          action: "PHYSICIAN_CLINICAL_CORRECTION",
          fieldName: "physicianMeasurements.SHEDDING",
        },
        orderBy: { changedAt: "asc" },
      });
      assert.deepEqual(sheddingAudit.oldValueJson, { recorded: true, value: 3 });
      assert.deepEqual(sheddingAudit.newValueJson, { recorded: true, value: 2 });
      assert.equal(sheddingAudit.changedByUserId, physician.id);
    });

    await context.test("audit failure rolls back the clinical mutation", async () => {
      const before = await prisma!.physicianVisitMeasurement.findUniqueOrThrow({
        where: {
          physicianVisitRecordId_code: {
            physicianVisitRecordId: main.record.id,
            code: "BURNING",
          },
        },
      });
      const auditsBefore = await prisma!.auditLog.count({
        where: {
          entityId: main.record.id,
          action: "PHYSICIAN_CLINICAL_CORRECTION",
          fieldName: "physicianMeasurements.BURNING",
        },
      });
      await assert.rejects(
        new PhysicianVisitClinicalService(prisma!, {
          databaseSchema: schemaName,
          beforeCorrectionAudit: () => {
            throw new Error("injected audit failure");
          },
        }).correct(physicianActor, main.visit.id, {
          target: "PHYSICIAN_MEASUREMENT",
          metric: "BURNING",
          operation: "SET",
          value: 1,
        }),
        /injected audit failure/,
      );
      assert.equal(
        (
          await prisma!.physicianVisitMeasurement.findUniqueOrThrow({
            where: { id: before.id },
          })
        ).value,
        before.value,
      );
      assert.equal(
        await prisma!.auditLog.count({
          where: {
            entityId: main.record.id,
            action: "PHYSICIAN_CLINICAL_CORRECTION",
            fieldName: "physicianMeasurements.BURNING",
          },
        }),
        auditsBefore,
      );
    });

    await context.test("Trichoscopy corrections replace or omit each explicit target and preserve exact text with audit", async () => {
      const selected = await clinical.correct(physicianActor, main.visit.id, {
        target: "TRICHOSCOPY_SELECTED_FINDINGS",
        operation: "SET",
        value: ["BLACK_DOTS", "VELLUS_HAIRS"],
      });
      assert.equal(selected.clinicalDomain, "TRICHOSCOPY");
      assert.deepEqual(selected.oldValue, [
        "VELLUS_HAIRS",
        "WIGGLY_SQUIGGLY_HAIR",
        "ZIGZAG_HAIRS",
      ]);
      assert.deepEqual(selected.newValue, ["VELLUS_HAIRS", "BLACK_DOTS"]);

      const auditCountBeforeFailure = await prisma!.auditLog.count({
        where: {
          entityId: main.record.id,
          action: "PHYSICIAN_CLINICAL_CORRECTION",
          fieldName: "trichoscopy.otherFindingText",
        },
      });
      await assert.rejects(
        new PhysicianVisitClinicalService(prisma!, {
          databaseSchema: schemaName,
          beforeCorrectionAudit: () => {
            throw new Error("injected trichoscopy audit failure");
          },
        }).correct(physicianActor, main.visit.id, {
          target: "TRICHOSCOPY_OTHER_FINDING_TEXT",
          operation: "SET",
          value: "must roll back",
        }),
        /injected trichoscopy audit failure/,
      );
      assert.equal(
        (
          await prisma!.physicianVisitTrichoscopy.findUniqueOrThrow({
            where: { physicianVisitRecordId: main.record.id },
          })
        ).otherFindingText,
        "  exact physician trichoscopy note\nsecond line  ",
      );
      assert.equal(
        await prisma!.auditLog.count({
          where: {
            entityId: main.record.id,
            action: "PHYSICIAN_CLINICAL_CORRECTION",
            fieldName: "trichoscopy.otherFindingText",
          },
        }),
        auditCountBeforeFailure,
      );

      const replacementText = "  corrected exact text\nwith spacing  ";
      await clinical.correct(physicianActor, main.visit.id, {
        target: "TRICHOSCOPY_OTHER_FINDING_TEXT",
        operation: "SET",
        value: replacementText,
      });
      let read = await clinical.read(physicianActor, main.visit.id);
      assert.deepEqual(read.canonicalClinicalData?.trichoscopy, {
        selectedFindings: [
          { code: "VELLUS_HAIRS", label: "Vellus hairs" },
          { code: "BLACK_DOTS", label: "Black dots" },
        ],
        otherFindingText: replacementText,
      });

      await clinical.correct(physicianActor, main.visit.id, {
        target: "TRICHOSCOPY_OTHER_FINDING_TEXT",
        operation: "OMIT",
      });
      read = await clinical.read(physicianActor, main.visit.id);
      assert.deepEqual(read.canonicalClinicalData?.trichoscopy, {
        selectedFindings: [
          { code: "VELLUS_HAIRS", label: "Vellus hairs" },
          { code: "BLACK_DOTS", label: "Black dots" },
        ],
      });

      await clinical.correct(physicianActor, main.visit.id, {
        target: "TRICHOSCOPY_SELECTED_FINDINGS",
        operation: "OMIT",
      });
      read = await clinical.read(physicianActor, main.visit.id);
      assert.equal(read.canonicalClinicalData?.trichoscopy, undefined);
      assert.equal(
        await prisma!.auditLog.count({
          where: {
            entityId: main.record.id,
            action: "PHYSICIAN_CLINICAL_CORRECTION",
            fieldName: { startsWith: "trichoscopy." },
          },
        }),
        4,
      );
    });

    await context.test("concurrent corrections serialize and preserve an auditable old/new chain", async () => {
      const beforeCount = await prisma!.auditLog.count({
        where: {
          entityId: main.record.id,
          action: "PHYSICIAN_CLINICAL_CORRECTION",
          fieldName: "physicianMeasurements.SHEDDING",
        },
      });
      const [left, right] = await Promise.all([
        clinical.correct(physicianActor, main.visit.id, {
          target: "PHYSICIAN_MEASUREMENT",
          metric: "SHEDDING",
          operation: "SET",
          value: 4,
        }),
        clinical.correct(physicianActor, main.visit.id, {
          target: "PHYSICIAN_MEASUREMENT",
          metric: "SHEDDING",
          operation: "SET",
          value: 5,
        }),
      ]);
      assert.equal([left.oldValue, right.oldValue].includes(2), true);
      const first = left.oldValue === 2 ? left : right;
      const second = left.oldValue === 2 ? right : left;
      assert.equal(second.oldValue, first.newValue);
      assert.equal(
        await prisma!.auditLog.count({
          where: {
            entityId: main.record.id,
            action: "PHYSICIAN_CLINICAL_CORRECTION",
            fieldName: "physicianMeasurements.SHEDDING",
          },
        }),
        beforeCount + 2,
      );
    });

    await context.test("just-before deadline succeeds; exact and after deadline fail", async () => {
      const justBeforeEncounter = new Date(Date.now() - 24 * HOUR + 30_000);
      const justBefore = await finalizeFixture(
        [{ section: "MEASUREMENTS", value: { SHEDDING: 3 } }],
        justBeforeEncounter,
        new Date(),
      );
      await new PhysicianVisitClinicalService(prisma!, {
        now: () => new Date(justBeforeEncounter.getTime() + 24 * HOUR - 1),
        databaseSchema: schemaName,
      }).correct(physicianActor, justBefore.visit.id, {
        target: "PHYSICIAN_MEASUREMENT",
        metric: "SHEDDING",
        operation: "SET",
        value: 2,
      });

      const exactEncounter = new Date(Date.now() - 24 * HOUR);
      const exact = await finalizeFixture([], exactEncounter, new Date());
      await assert.rejects(
        new PhysicianVisitClinicalService(prisma!, {
          now: () => new Date(exactEncounter.getTime() + 24 * HOUR),
          databaseSchema: schemaName,
        }).correct(physicianActor, exact.visit.id, {
          target: "SINCLAIR",
          operation: "SET",
          value: 2,
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "VISIT_CORRECTION_WINDOW_CLOSED",
      );

      const afterEncounter = new Date(Date.now() - 25 * HOUR);
      const after = await finalizeFixture([], afterEncounter, new Date());
      await assert.rejects(
        new PhysicianVisitClinicalService(prisma!, {
          now: () => new Date(),
          databaseSchema: schemaName,
        }).correct(physicianActor, after.visit.id, {
          target: "SINCLAIR",
          operation: "SET",
          value: 2,
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "VISIT_CORRECTION_WINDOW_CLOSED",
      );
    });

    await context.test("correction racing the exact database deadline rolls back without audit", async () => {
      const encounterAt = new Date(Date.now() - 24 * HOUR + 500);
      const race = await finalizeFixture(
        [{ section: "MEASUREMENTS", value: { SHEDDING: 3 } }],
        encounterAt,
        new Date(),
      );
      await assert.rejects(
        new PhysicianVisitClinicalService(prisma!, {
          now: () => new Date(encounterAt.getTime() + 24 * HOUR - 1),
          databaseSchema: schemaName,
          beforeCorrectionMutation: () =>
            new Promise<void>((resolve) => setTimeout(resolve, 750)),
        }).correct(physicianActor, race.visit.id, {
          target: "PHYSICIAN_MEASUREMENT",
          metric: "SHEDDING",
          operation: "SET",
          value: 2,
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "VISIT_CORRECTION_WINDOW_CLOSED",
      );
      assert.equal(
        (
          await prisma!.physicianVisitMeasurement.findUniqueOrThrow({
            where: {
              physicianVisitRecordId_code: {
                physicianVisitRecordId: race.record.id,
                code: "SHEDDING",
              },
            },
          })
        ).value,
        3,
      );
      assert.equal(
        await prisma!.auditLog.count({
          where: {
            entityId: race.record.id,
            action: "PHYSICIAN_CLINICAL_CORRECTION",
          },
        }),
        0,
      );
    });

    await context.test("late first Finalize materializes, then PostgreSQL rejects UPDATE, DELETE, and correction-like INSERT", async () => {
      const encounterAt = new Date(Date.now() - 25 * HOUR);
      const late = await finalizeFixture(allSections, encounterAt, new Date());
      assert.equal(late.finalized.physicianVisitRecord.isLateDocumentation, true);
      assert.equal(
        await prisma!.physicianVisitMeasurement.count({
          where: { physicianVisitRecordId: late.record.id },
        }),
        4,
      );
      const shedding = await prisma!.physicianVisitMeasurement.findUniqueOrThrow({
        where: {
          physicianVisitRecordId_code: {
            physicianVisitRecordId: late.record.id,
            code: "SHEDDING",
          },
        },
      });
      await assert.rejects(
        prisma!.physicianVisitMeasurement.update({
          where: { id: shedding.id },
          data: { value: 2 },
        }),
        /FPV-3 hard lock: canonical clinical correction window is closed/,
      );
      await assert.rejects(
        prisma!.physicianVisitMeasurement.delete({ where: { id: shedding.id } }),
        /FPV-3 hard lock: canonical clinical correction window is closed/,
      );
      await assert.rejects(
        prisma!.physicianVisitMeasurement.create({
          data: {
            physicianVisitRecordId: late.record.id,
            code: "SCALP_PAIN",
            value: 2,
          },
        }),
        /FPV-3 hard lock: canonical clinical correction window is closed/,
      );
      const trichoscopy = await prisma!.physicianVisitTrichoscopy.findUniqueOrThrow({
        where: { physicianVisitRecordId: late.record.id },
        include: { findings: true },
      });
      await assert.rejects(
        prisma!.physicianVisitTrichoscopy.update({
          where: { id: trichoscopy.id },
          data: { otherFindingText: "late forbidden update" },
        }),
        /FPV-3 hard lock: canonical clinical correction window is closed/,
      );
      await assert.rejects(
        prisma!.physicianVisitTrichoscopyFinding.delete({
          where: { id: trichoscopy.findings[0]!.id },
        }),
        /FPV-3.5A hard lock: canonical trichoscopy correction window is closed/,
      );
      await assert.rejects(
        prisma!.physicianVisitTrichoscopyFinding.create({
          data: {
            physicianVisitTrichoscopyId: trichoscopy.id,
            code: "BLACK_DOTS",
          },
        }),
        /FPV-3.5A hard lock: canonical trichoscopy correction window is closed/,
      );
      await assert.rejects(
        prisma!.$executeRawUnsafe(
          `UPDATE "${schemaName}"."PhysicianVisitTrichoscopyFinding" SET "code" = 'YELLOW_DOTS' WHERE "id" = $1::uuid`,
          trichoscopy.findings[0]!.id,
        ),
        /FPV-3.5A hard lock: canonical trichoscopy correction window is closed/,
      );
      await assert.rejects(
        prisma!.physicianVisitTrichoscopy.delete({ where: { id: trichoscopy.id } }),
        /FPV-3 hard lock: canonical clinical correction window is closed/,
      );

      const lateWithoutTrichoscopy = await finalizeFixture([], encounterAt, new Date());
      await assert.rejects(
        prisma!.$executeRawUnsafe(
          `INSERT INTO "${schemaName}"."PhysicianVisitTrichoscopy" ("id", "physicianVisitRecordId", "otherFindingText", "updatedAt") VALUES ($1::uuid, $2::uuid, $3, CURRENT_TIMESTAMP)`,
          randomUUID(),
          lateWithoutTrichoscopy.record.id,
          "late forbidden insert",
        ),
        /FPV-3 hard lock: canonical clinical correction window is closed/,
      );
    });

    await context.test("database numeric constraints reject invalid direct values", async () => {
      const current = await prisma!.physicianVisitMeasurement.findUniqueOrThrow({
        where: {
          physicianVisitRecordId_code: {
            physicianVisitRecordId: main.record.id,
            code: "SHEDDING",
          },
        },
      });
      await assert.rejects(
        prisma!.physicianVisitMeasurement.update({
          where: { id: current.id },
          data: { value: 6 },
        }),
        /PhysicianVisitMeasurement_value_check/,
      );
      const pattern = await prisma!.physicianPatternAssessment.findUniqueOrThrow({
        where: { physicianVisitRecordId: main.record.id },
      });
      await assert.rejects(
        prisma!.$executeRawUnsafe(
          `UPDATE "${schemaName}"."PhysicianPatternAssessment" SET "sinclair" = 0 WHERE "id" = $1::uuid`,
          pattern.id,
        ),
        /PhysicianPatternAssessment_sinclair_check/,
      );
      await assert.rejects(
        prisma!.$executeRawUnsafe(
          `UPDATE "${schemaName}"."PhysicianPatternAssessment" SET "hairLineMidlineCm" = -1 WHERE "id" = $1::uuid`,
          pattern.id,
        ),
        /PhysicianPatternAssessment_hair_line_midline_check/,
      );

      const constrained = await finalizeFixture([
        {
          section: "TRICHOSCOPY",
          value: {
            selectedFindingCodes: ["VELLUS_HAIRS"],
            otherFindingText: "valid",
          },
        },
      ]);
      const trichoscopy = await prisma!.physicianVisitTrichoscopy.findUniqueOrThrow({
        where: { physicianVisitRecordId: constrained.record.id },
      });
      for (const whitespaceOnly of ["   ", "\t", "\n", "\r", " \t\n\r "]) {
        await assert.rejects(
          prisma!.$executeRawUnsafe(
            `UPDATE "${schemaName}"."PhysicianVisitTrichoscopy" SET "otherFindingText" = $1 WHERE "id" = $2::uuid`,
            whitespaceOnly,
            trichoscopy.id,
          ),
          /PhysicianVisitTrichoscopy_other_finding_text_check/,
        );
      }
      await assert.rejects(
        prisma!.physicianVisitTrichoscopyFinding.create({
          data: {
            physicianVisitTrichoscopyId: trichoscopy.id,
            code: "VELLUS_HAIRS",
          },
        }),
        /Unique constraint failed/,
      );
      await assert.rejects(
        prisma!.$executeRawUnsafe(
          `INSERT INTO "${schemaName}"."PhysicianVisitTrichoscopyFinding" ("id", "physicianVisitTrichoscopyId", "code") VALUES ($1::uuid, $2::uuid, 'UNKNOWN')`,
          randomUUID(),
          trichoscopy.id,
        ),
        /invalid input value for enum/,
      );
    });

    await context.test("Addendum remains append-only after hard lock and does not mutate canonical rows", async () => {
      const encounterAt = new Date(Date.now() - 26 * HOUR);
      const locked = await finalizeFixture(
        [{ section: "MEASUREMENTS", value: { SHEDDING: 3 } }],
        encounterAt,
        new Date(),
      );
      const before = await prisma!.physicianVisitMeasurement.findMany({
        where: { physicianVisitRecordId: locked.record.id },
      });
      const addendum = await new PhysicianVisitLifecycleService(prisma!, {
        now: () => new Date(),
        databaseSchema: schemaName,
      }).addAddendum(physicianActor, locked.visit.id, {
        type: "CORRECTION",
        content: "Append-only correction documentation after hard lock.",
      });
      assert.equal(addendum.type, "CORRECTION");
      assert.deepEqual(
        await prisma!.physicianVisitMeasurement.findMany({
          where: { physicianVisitRecordId: locked.record.id },
        }),
        before,
      );
      await assert.rejects(
        prisma!.physicianVisitAddendum.update({
          where: { id: addendum.id },
          data: { content: "forbidden" },
        }),
      );
    });

    await context.test("DRAFT canonical read never presents Draft values as finalized truth", async () => {
      const draft = await createDraftVisit();
      await draft.draftService.updateDraft(staffActor, draft.visit.id, {
        expectedDraftVersion: 1,
        section: "MEASUREMENTS",
        value: { SHEDDING: 5 },
      });
      const read = await clinical.read(physicianActor, draft.visit.id);
      assert.equal(read.status, "DRAFT");
      assert.equal(read.canonicalClinicalData, null);
      assert.equal(read.correction, null);
      await assert.rejects(
        prisma!.physicianVisitMeasurement.create({
          data: {
            physicianVisitRecordId: draft.record.id,
            code: "SHEDDING",
            value: 5,
          },
        }),
        /canonical clinical rows require a finalized PhysicianVisitRecord at commit/,
      );
      await assert.rejects(
        prisma!.physicianVisitTrichoscopy.create({
          data: {
            physicianVisitRecordId: draft.record.id,
            otherFindingText: "forbidden draft canonical row",
          },
        }),
        /canonical clinical rows require a finalized PhysicianVisitRecord at commit/,
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
