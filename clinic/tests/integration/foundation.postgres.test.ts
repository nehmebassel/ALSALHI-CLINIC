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
import {
  AUTHENTICATED_SESSION_COOKIE,
  hashAuthenticatedSessionToken,
  resolveAuthenticatedActor,
} from "../../lib/auth/session";
import { PrismaPatientAccessStore } from "../../lib/patient-access/prisma-store";
import { purgeTerminalDraftData } from "../../lib/patient-access/cleanup";
import {
  PatientAccessError,
  PatientAccessService,
} from "../../lib/patient-access/service";
import {
  FinalSubmitService,
  type EvaluatedOfficialState,
} from "../../lib/submission/service";

const NOW = new Date("2026-08-11T09:00:00.000Z");
const MIGRATIONS_URL = new URL("../../prisma/migrations/", import.meta.url);

async function loadMigrationSqlFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_URL, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    directories.map((directory) =>
      readFile(
        new URL(`${directory}/migration.sql`, MIGRATIONS_URL),
        "utf8",
      ),
    ),
  );
}

async function expectPrismaError(
  promise: Promise<unknown>,
  code: string,
) {
  await assert.rejects(
    promise,
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === code,
  );
}

const EMPTY_READY_STATE: EvaluatedOfficialState = {
  state: "READY",
  activePathwayDefinitionIds: [],
  activeLibraryIds: [],
  questionResponses: [],
  routingEvaluations: [],
};

test("PostgreSQL-backed P00.1 foundation contracts", async (context) => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required.");

  const schemaName = `foundation_test_${randomUUID().replaceAll("-", "")}`;
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
      adapter: new PrismaPg(
        { connectionString },
        { schema: schemaName },
      ),
    });

    const clinicScope = await prisma.clinicScope.findUniqueOrThrow({
      where: { code: "PILOT0" },
    });
    const staffRole = await prisma.role.create({
      data: { code: "STAFF", nameAr: "موظف", nameEn: "Staff" },
    });
    const physicianRole = await prisma.role.create({
      data: { code: "PHYSICIAN", nameAr: "طبيب", nameEn: "Physician" },
    });
    const staff = await prisma.user.create({
      data: {
        name: "Foundation Staff",
        email: "staff@foundation.test",
        passwordHash: "not-a-real-password-hash",
        roleId: staffRole.id,
      },
    });
    const physician = await prisma.user.create({
      data: {
        name: "Foundation Physician",
        email: "physician@foundation.test",
        passwordHash: "not-a-real-password-hash",
        roleId: physicianRole.id,
      },
    });
    const device = await prisma.clinicDevice.create({
      data: {
        clinicScopeId: clinicScope.id,
        name: "Integration Device",
        certificateFingerprintHash: "integration-fingerprint-hash",
        status: "APPROVED",
        approvedAt: NOW,
      },
    });
    const actor: AuthenticatedActor = {
      actorType: "AUTHENTICATED_USER",
      userId: staff.id,
      role: "STAFF",
      clinicScopeId: clinicScope.id,
      clinicDeviceId: device.id,
      authenticatedSessionId: "integration-auth-session",
    };

    const contentVersion = await prisma.contentVersion.create({
      data: {
        versionCode: "P00_1_FOUNDATION_TEST",
        isActive: true,
        publishedAt: NOW,
      },
    });
    const hairService = await prisma.clinicalService.create({
      data: {
        code: "HAIR",
        nameAr: "الشعر وفروة الرأس",
        nameEn: "Hair and Scalp",
      },
    });
    const aestheticService = await prisma.clinicalService.create({
      data: {
        code: "AESTHETIC",
        nameAr: "إجراءات تجميلية",
        nameEn: "Aesthetic",
      },
    });
    const hairReason = await prisma.reasonForVisitDefinition.create({
      data: {
        contentVersionId: contentVersion.id,
        clinicalServiceId: hairService.id,
        code: "RV_HAIR_LOSS",
        labelAr: "اختبار تقني فقط",
        labelEn: "Technical test only",
      },
    });
    const aestheticReason = await prisma.reasonForVisitDefinition.create({
      data: {
        contentVersionId: contentVersion.id,
        clinicalServiceId: aestheticService.id,
        code: "RV_AESTHETIC_PROCEDURES",
        labelAr: "اختبار تقني فقط",
        labelEn: "Technical test only",
      },
    });

    const store = new PrismaPatientAccessStore(prisma);
    const serviceAt = (rawToken: string, now: Date) =>
      new PatientAccessService(store, {
        now: () => now,
        generateToken: () => rawToken,
      });
    const finalSubmitService = (beforeCommit?: () => Promise<void>) =>
      new FinalSubmitService(prisma!, {
        now: () => NOW,
        evaluateOfficialState: async () => EMPTY_READY_STATE,
        deriveLockedDraftArtifacts: () => ({
          profile: {
            fullName: "Foundation transaction fixture",
            dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
            gender: "FEMALE",
            maritalStatus: "NOT_MARRIED",
          },
          visit: {
            primaryReasonCode: "RV_HAIR_LOSS",
            additionalReasonCodes: [],
            selectedProcedureCodes: [],
            selectedLaserServiceCodes: [],
          },
        }),
        beforeCommit,
      });

    await context.test(
      "TEST-STAFF-004A resolves only an authenticated Staff session on an approved device",
      async () => {
        const rawAuthToken = "authenticated-staff-token";
        const authSession = await prisma!.authenticatedUserSession.create({
          data: {
            sessionTokenHash: hashAuthenticatedSessionToken(rawAuthToken),
            userId: staff.id,
            clinicScopeId: clinicScope.id,
            clinicDeviceId: device.id,
            expiresAt: new Date("2026-08-11T10:00:00.000Z"),
          },
        });
        const request = new Request("https://example.test/internal", {
          headers: {
            cookie: `${AUTHENTICATED_SESSION_COOKIE}=${rawAuthToken}`,
          },
        });

        const resolved = await resolveAuthenticatedActor(request, prisma!, NOW);

        assert.equal(resolved.userId, staff.id);
        assert.equal(resolved.role, "STAFF");
        assert.equal(resolved.clinicDeviceId, device.id);

        await prisma!.authenticatedUserSession.update({
          where: { id: authSession.id },
          data: { revokedAt: NOW },
        });

        await assert.rejects(
          resolveAuthenticatedActor(request, prisma!, NOW),
          AuthorizationError,
        );
      },
    );

    let submittedVisitId = "";
    let submittedInterviewId = "";

    await context.test(
      "TEST-ID-002 and TEST-FS-001 keep new MRN temporary until atomic Final Submit",
      async () => {
        const rawToken = "new-mrn-submit-token";
        const flow = await serviceAt(rawToken, NOW).createFlow(actor, {
          clinicMrn: " mrn-١٢٣ ",
        });

        assert.equal(await prisma!.patient.count(), 0);
        assert.equal(await prisma!.externalPatientIdentifier.count(), 0);
        assert.equal(await prisma!.visit.count(), 0);

        const invitation = await prisma!.interviewInvitation.findUniqueOrThrow({
          where: { id: flow.invitationId },
        });
        assert.equal(invitation.patientId, null);
        assert.equal(invitation.temporaryMrnNormalizedValue, "MRN123");

        const result = await finalSubmitService().submit({
          patientSessionToken: rawToken,
          profile: {
            fullName: "Foundation Patient",
            dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
            gender: "FEMALE",
            maritalStatus: "NOT_MARRIED",
          },
          visit: {
            primaryReasonCode: "RV_HAIR_LOSS",
            additionalReasonCodes: [],
            selectedProcedureCodes: [],
            selectedLaserServiceCodes: [],
          },
        });

        submittedVisitId = result.visitId;
        submittedInterviewId = result.clinicalInterviewId;
        assert.equal(result.idempotentReplay, false);
        assert.equal(await prisma!.patient.count(), 1);
        assert.equal(await prisma!.externalPatientIdentifier.count(), 1);
        assert.equal(await prisma!.visit.count(), 1);
        assert.equal(await prisma!.clinicalInterview.count(), 1);

        const draft = await prisma!.draftClinicalInterview.findUniqueOrThrow({
          where: { id: flow.draftId },
          include: { session: true },
        });
        assert.equal(draft.status, "SUBMITTED");
        assert.equal(draft.session.status, "CLOSED");
        assert.equal(draft.session.closeReason, "SUBMITTED");

        const replay = await finalSubmitService().submit({
          patientSessionToken: rawToken,
          profile: {
            fullName: "Foundation Patient",
            dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
            gender: "FEMALE",
            maritalStatus: "NOT_MARRIED",
          },
          visit: {
            primaryReasonCode: "RV_HAIR_LOSS",
            additionalReasonCodes: [],
            selectedProcedureCodes: [],
            selectedLaserServiceCodes: [],
          },
        });

        assert.equal(replay.idempotentReplay, true);
        assert.equal(replay.visitId, result.visitId);
        assert.equal(await prisma!.visit.count(), 1);
      },
    );

    await context.test(
      "TEST-VIS-011 database rejects a second PRIMARY for the same Visit",
      async () => {
        await expectPrismaError(
          prisma!.visitReason.create({
            data: {
              visitId: submittedVisitId,
              reasonDefinitionId: aestheticReason.id,
              role: "PRIMARY",
            },
          }),
          "P2002",
        );

        assert.equal(
          await prisma!.visitReason.count({
            where: { visitId: submittedVisitId, role: "PRIMARY" },
          }),
          1,
        );
      },
    );

    await context.test(
      "TEST-QST-001/002 database deduplicates by QuestionDefinition plus Response Scope",
      async () => {
        const library = await prisma!.clinicalLibrary.create({
          data: {
            code: "FOUNDATION_TEST",
            contentVersionId: contentVersion.id,
            nameAr: "اختبار تقني",
            nameEn: "Technical test",
          },
        });
        const group = await prisma!.questionGroup.create({
          data: {
            clinicalLibraryId: library.id,
            code: "FOUNDATION_TEST_GROUP",
            sortOrder: 1,
          },
        });
        const definition = await prisma!.questionDefinition.create({
          data: {
            clinicalLibraryId: library.id,
            questionGroupId: group.id,
            code: "Q_SYNTHETIC_SCOPE_TEST",
            version: "1",
            textAr: "سؤال اصطناعي للاختبار فقط",
            textEn: "Synthetic test-only question",
            responseType: "BOOLEAN",
            visibilityRule: { op: "ALWAYS" },
            requirednessRule: { op: "ALWAYS" },
            validationRule: [],
            responseScopePolicy: "SYMPTOM_ITEM",
            dependencies: [],
            orderingKey: "001",
            outputEligibility: [],
            provenanceBaseline: "v1.7.2",
            provenanceSourceFile: "FOUNDATION_TEST_ONLY",
            provenanceSourceSection: "TEST",
            status: "APPROVED",
            sortOrder: 1,
          },
        });

        await prisma!.questionInstance.create({
          data: {
            clinicalInterviewId: submittedInterviewId,
            questionDefinitionId: definition.id,
            responseScopeType: "SYMPTOM_ITEM",
            responseScopeKey: "itch",
          },
        });
        await prisma!.questionInstance.create({
          data: {
            clinicalInterviewId: submittedInterviewId,
            questionDefinitionId: definition.id,
            responseScopeType: "SYMPTOM_ITEM",
            responseScopeKey: "burning",
          },
        });

        await expectPrismaError(
          prisma!.questionInstance.create({
            data: {
              clinicalInterviewId: submittedInterviewId,
              questionDefinitionId: definition.id,
              responseScopeType: "SYMPTOM_ITEM",
              responseScopeKey: "itch",
            },
          }),
          "P2002",
        );
      },
    );

    await context.test(
      "TEST-FS-002 rolls back identity and official state when Final Submit fails",
      async () => {
        const rawToken = "rollback-submit-token";
        const flow = await serviceAt(rawToken, NOW).createFlow(actor, {
          clinicMrn: "ROLLBACK-999",
        });
        const beforeCounts = {
          patients: await prisma!.patient.count(),
          visits: await prisma!.visit.count(),
          interviews: await prisma!.clinicalInterview.count(),
        };

        await assert.rejects(
          finalSubmitService(async () => {
              throw new Error("Injected transaction failure");
            }).submit({
            patientSessionToken: rawToken,
            profile: {
              fullName: "Rollback Patient",
              dateOfBirth: new Date("1992-02-02T00:00:00.000Z"),
              gender: "MALE",
              maritalStatus: "MARRIED",
            },
            visit: {
              primaryReasonCode: "RV_HAIR_LOSS",
              additionalReasonCodes: [],
              selectedProcedureCodes: [],
              selectedLaserServiceCodes: [],
            },
          }),
          /Injected transaction failure/,
        );

        assert.equal(await prisma!.patient.count(), beforeCounts.patients);
        assert.equal(await prisma!.visit.count(), beforeCounts.visits);
        assert.equal(
          await prisma!.clinicalInterview.count(),
          beforeCounts.interviews,
        );
        assert.equal(
          await prisma!.externalPatientIdentifier.count({
            where: { normalizedValue: "ROLLBACK999" },
          }),
          0,
        );
        assert.equal(
          (
            await prisma!.draftClinicalInterview.findUniqueOrThrow({
              where: { id: flow.draftId },
            })
          ).status,
          "DRAFT",
        );
      },
    );

    await context.test(
      "TEST-FS concurrent same-Draft submit returns one committed Visit",
      async () => {
        const rawToken = "same-draft-concurrent-token";
        const flow = await serviceAt(rawToken, NOW).createFlow(actor, {
          clinicMrn: "CONCURRENT-DRAFT-1",
        });
        const command = {
          patientSessionToken: rawToken,
          profile: {
            fullName: "Concurrent Draft Patient",
            dateOfBirth: new Date("1991-03-03T00:00:00.000Z"),
            gender: "FEMALE" as const,
            maritalStatus: "MARRIED" as const,
          },
          visit: {
            primaryReasonCode: "RV_HAIR_LOSS",
            additionalReasonCodes: [],
            selectedProcedureCodes: [],
            selectedLaserServiceCodes: [],
          },
        };

        const results = await Promise.all([
          finalSubmitService().submit(command),
          finalSubmitService().submit(command),
        ]);

        assert.equal(results[0].visitId, results[1].visitId);
        assert.equal(
          await prisma!.visit.count({
            where: { sourceDraftId: flow.draftId },
          }),
          1,
        );
      },
    );

    await context.test(
      "TEST-ID concurrent same-new-MRN creates one identity and two valid Visits",
      async () => {
        const tokens = ["same-mrn-token-a", "same-mrn-token-b"];
        await Promise.all(
          tokens.map((token) =>
            serviceAt(token, NOW).createFlow(actor, {
              clinicMrn: "SAME-NEW-MRN-55",
            }),
          ),
        );
        const patientCountBefore = await prisma!.patient.count();

        const results = await Promise.all(
          tokens.map((token, index) =>
            finalSubmitService().submit({
              patientSessionToken: token,
              profile: {
                fullName: `Concurrent MRN Patient ${index + 1}`,
                dateOfBirth: new Date("1988-04-04T00:00:00.000Z"),
                gender: "MALE",
                maritalStatus: "NOT_MARRIED",
              },
              visit: {
                primaryReasonCode: "RV_HAIR_LOSS",
                additionalReasonCodes: [],
                selectedProcedureCodes: [],
                selectedLaserServiceCodes: [],
              },
            }),
          ),
        );

        assert.equal(results[0].patientId, results[1].patientId);
        assert.equal(await prisma!.patient.count(), patientCountBefore + 1);
        assert.equal(
          await prisma!.externalPatientIdentifier.count({
            where: { normalizedValue: "SAMENEWMRN55" },
          }),
          1,
        );
        assert.equal(
          await prisma!.visit.count({
            where: { patientId: results[0].patientId },
          }),
          2,
        );
      },
    );

    await context.test(
      "TEST-ACC-007/008/009 persists LOCKED, reactivation, and EXPIRED lifecycle",
      async () => {
        const lockToken = "postgres-lock-token";
        const lockFlow = await serviceAt(lockToken, NOW).createFlow(actor, {
          clinicMrn: "LOCK-1",
        });

        await assert.rejects(
          serviceAt(
            lockToken,
            new Date("2026-08-11T09:07:00.000Z"),
          ).autosave(lockToken, {}),
          (error: unknown) =>
            error instanceof PatientAccessError &&
            error.code === "SESSION_LOCKED",
        );
        assert.equal(
          (
            await prisma!.patientAccessSession.findUniqueOrThrow({
              where: { id: lockFlow.sessionId },
            })
          ).status,
          "LOCKED",
        );

        await serviceAt(
          lockToken,
          new Date("2026-08-11T09:10:00.000Z"),
        ).reactivate(actor, lockFlow.sessionId);
        assert.equal(
          (
            await prisma!.patientAccessSession.findUniqueOrThrow({
              where: { id: lockFlow.sessionId },
            })
          ).status,
          "ACTIVE",
        );

        const expireToken = "postgres-expire-token";
        const expireFlow = await serviceAt(expireToken, NOW).createFlow(actor, {
          clinicMrn: "EXPIRE-1",
        });
        await assert.rejects(
          serviceAt(
            expireToken,
            new Date("2026-08-11T09:30:00.000Z"),
          ).autosave(expireToken, {}),
          (error: unknown) =>
            error instanceof PatientAccessError &&
            error.code === "SESSION_EXPIRED",
        );

        const expiredDraft =
          await prisma!.draftClinicalInterview.findUniqueOrThrow({
            where: { id: expireFlow.draftId },
            include: { session: true },
          });
        assert.equal(expiredDraft.status, "EXPIRED");
        assert.equal(expiredDraft.session.status, "EXPIRED");
        assert.equal(
          expiredDraft.purgeAfter?.toISOString(),
          "2026-08-12T09:30:00.000Z",
        );

        const existingIdentifier =
          await prisma!.externalPatientIdentifier.findUniqueOrThrow({
            where: {
              clinicScopeId_identifierType_normalizedValue: {
                clinicScopeId: clinicScope.id,
                identifierType: "CLINIC_MRN",
                normalizedValue: "MRN123",
              },
            },
          });
        const existingPatientFlow = await serviceAt(
          "existing-patient-expire-token",
          NOW,
        ).createFlow(actor, {
          clinicMrn: "MRN-123",
          patientInputJson: { temporary: "must be purged" },
        });
        await assert.rejects(
          serviceAt(
            "existing-patient-expire-token",
            new Date("2026-08-11T09:30:00.000Z"),
          ).autosave("existing-patient-expire-token", {}),
          PatientAccessError,
        );

        assert.equal(
          await purgeTerminalDraftData(
            new Date("2026-08-12T09:30:00.000Z"),
            prisma!,
          ),
          2,
        );
        const purgedDraft =
          await prisma!.draftClinicalInterview.findUniqueOrThrow({
            where: { id: existingPatientFlow.draftId },
          });
        const purgedInvitation =
          await prisma!.interviewInvitation.findUniqueOrThrow({
            where: { id: existingPatientFlow.invitationId },
          });
        assert.deepEqual(purgedDraft.patientInputJson, {});
        assert.equal(purgedInvitation.temporaryMrnNormalizedValue, null);
        assert.equal(
          await prisma!.patient.count({
            where: { id: existingIdentifier.patientId },
          }),
          1,
        );
      },
    );

    assert.equal(physician.roleId, physicianRole.id);
    assert.equal(hairReason.code, "RV_HAIR_LOSS");
  } finally {
    await prisma?.$disconnect();
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await adminPool.end();
  }
});
