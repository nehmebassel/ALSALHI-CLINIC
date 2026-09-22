import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../../app/generated/prisma/client";
import type { AuthenticatedActor } from "../../lib/auth/authorization";
import { BOOTSTRAP_LOGIN_DOMAIN } from "../../lib/auth/development-auth";
import { assertPublishedRegistryMatchesContracts } from "../../lib/content-registry/fingerprint";
import { P01_CONTENT_VERSION, P01_QUESTION_CONTRACTS } from "../../lib/p01/contracts";
import { evaluateP01Draft, getP01ProfileAndVisit } from "../../lib/p01/engine";
import { P01EngineService } from "../../lib/p01/engine-service";
import {
  P01_PRIVACY_NOTICE_AR,
  P01_PRIVACY_NOTICE_EN,
  P01_PRIVACY_NOTICE_VERSION,
} from "../../lib/p01/privacy";
import { PrismaPatientAccessStore } from "../../lib/patient-access/prisma-store";
import { PatientAccessError, PatientAccessService, type JsonValue, type PatientInputJson } from "../../lib/patient-access/service";
import { FinalSubmitService } from "../../lib/submission/service";
import type { P01FollowUpContext } from "../../lib/follow-up/types";
import { HairHistoryWriteError, PhysicianHairHistoryService } from "../../lib/physician/hair-history-service";
import { seedDatabase } from "../../prisma/seed";

const NOW = new Date("2026-08-14T08:00:00.000Z");
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

function syntheticRequiredAnswer(code: string, responseType: string): JsonValue {
  const contract = P01_QUESTION_CONTRACTS.find((item) => item.code === code)!;
  const fixed: Record<string, JsonValue> = {
    Q_TRIGGER_EVENTS_FEMALE: ["NONE"],
    Q_LIFESTYLE_BARIATRIC_SURGERY: "NO",
    Q_LIFESTYLE_HAIR_CONCEALMENT: ["NONE"],
    Q_WOMENS_HEALTH: ["NONE"],
    Q_WOMEN_CONTRACEPTION_STATUS: "NO",
    Q_PREGNANCY_BREASTFEEDING_STATUS: "NO",
    Q_PREGNANCY_PLANNING: "NO_PLAN",
  };
  if (fixed[code] !== undefined) return fixed[code];
  if (contract.repeatable) {
    const item: Record<string, JsonValue> = { id: `SYN-${code}-1` };
    for (const field of contract.repeatable.fields) {
      item[field.code] = field.type === "MONTH_YEAR"
        ? { calendar: "GREGORIAN", precision: "MONTH_YEAR", year: 2025, month: 1, normalizedGregorian: { year: 2025, month: 1 } }
        : field.type === "SINGLE_SELECT"
          ? (field.options?.[0]?.code ?? "YES")
          : "Synthetic item";
    }
    return [item];
  }
  if (responseType === "MULTI_SELECT") return [contract.options?.[0]?.code ?? "SYN_OPTION"];
  if (["SINGLE_SELECT", "BOOLEAN", "SCALE"].includes(responseType)) return contract.options?.[0]?.code ?? "YES";
  if (responseType === "DATE") return "1994-04-12";
  if (responseType === "MONTH_YEAR") return "2025-01";
  return "Synthetic answer";
}

function p01Draft(
  primary: "RV_HAIR_LOSS" | "RV_SCALP_SYMPTOMS" | "RV_HAIR_QUALITY" | "RV_DERMATOLOGY" | "RV_LASER" | "RV_AESTHETIC_PROCEDURES" = "RV_HAIR_LOSS",
  secondary = true,
): PatientInputJson {
  const draft: PatientInputJson = {
    locale: "ar",
    privacy: {
      noticeVersion: P01_PRIVACY_NOTICE_VERSION,
      noticeTextAr: P01_PRIVACY_NOTICE_AR,
      noticeTextEn: P01_PRIVACY_NOTICE_EN,
      language: "ar",
      acceptedAt: NOW.toISOString(),
    },
    answers: {
      Q_PRIVACY_CONSENT: "YES",
      Q_PROFILE_FULL_NAME: "SYN P01 Integration Patient",
      Q_PROFILE_DOB: "1992-02-02",
      Q_PROFILE_SEX: "FEMALE",
      Q_PROFILE_MARITAL_STATUS: "NOT_MARRIED",
      Q_VISIT_PRIMARY_REASON: primary,
      Q_HEALTH_SNAPSHOT: ["NONE_OF_THE_ABOVE"],
      Q_HAIR_CONCERN: "BOTH",
      Q_HAIR_SHEDDING_ONSET: "2025-01",
      Q_HAIR_THINNING_ONSET: "2025-02",
      Q_HAIR_SHEDDING_SEVERITY: "3",
      Q_HAIR_DENSITY_SEVERITY: "2",
      Q_HAIR_EVIDENCE: ["SCALP_MORE_VISIBLE"],
      Q_SECONDARY_SCALP_GATE: primary === "RV_HAIR_LOSS" && secondary ? "YES" : "NO",
      Q_SCALP_SYMPTOMS: ["ITCH", "DANDRUFF"],
      Q_SCALP_SYMPTOM_DETAILS: {
        ITCH: { onset: "2025-01", pattern: "INTERMITTENT", severity: "3" },
        DANDRUFF: { onset: "2025-02", pattern: "CONTINUOUS" },
      },
      Q_SCALP_WORSENING: "NO",
      Q_SCALP_RELIEVING: "NO",
      Q_SECONDARY_HAIR_GATE: primary === "RV_SCALP_SYMPTOMS" && secondary ? "YES" : "NO",
      Q_PRIOR_DIAGNOSIS_GATE: "NO",
      Q_SCALP_BIOPSY_GATE: "NO",
      Q_HAIR_TREATMENT_GATE: "NO",
    Q_HAIR_PROCEDURE_GATE: "NO",
      Q_TRIGGER_EVENTS: ["NONE_OF_THE_ABOVE"],
      Q_OVERALL_COURSE: "UNCHANGED",
      Q_TREATMENT_PREFERENCE: "BASIC_ONLY",
      Q_RESULT_SPEED_EXPECTATION: "UNDERSTANDS_TIME",
      Q_PATIENT_BOTHER: "3",
      Q_CONFIDENCE_IMPACT: "2",
    },
  };

  const answers = draft.answers as Record<string, JsonValue>;
  // Keep this PostgreSQL fixture synchronized with the complete published registry.
  // Explicit branch answers above are preserved; only newly-required visible fields
  // are filled with deterministic synthetic values.
  for (let pass = 0; pass < 8; pass += 1) {
    const evaluation = evaluateP01Draft(draft);
    for (const question of evaluation.questions) {
      if (question.required && answers[question.code] === undefined) {
        answers[question.code] = syntheticRequiredAnswer(question.code, question.responseType);
      }
    }
    if (evaluateP01Draft(draft).state === "READY") return draft;
  }
  return draft;
}

function existingFollowUpDraft(
  base: PatientInputJson,
  episodeId: string,
  changes: Record<string, JsonValue>,
  delta: Record<string, JsonValue>,
): PatientInputJson {
  return {
    ...base,
    locale: "ar",
    privacy: {
      noticeVersion: P01_PRIVACY_NOTICE_VERSION,
      noticeTextAr: P01_PRIVACY_NOTICE_AR,
      noticeTextEn: P01_PRIVACY_NOTICE_EN,
      language: "ar",
      acceptedAt: NOW.toISOString(),
    },
    answers: { Q_PRIVACY_CONSENT: "YES" },
    followUp: {
      ...(base.followUp as Record<string, JsonValue>),
      intent: "EXISTING_CONCERN",
      selectedEpisodeId: episodeId,
      changes,
      delta,
      changesReviewed: true,
    },
  };
}

test("PostgreSQL-backed P01 Hair/Scalp acceptance contracts", async (context) => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required.");

  const schemaName = `p01_test_${randomUUID().replaceAll("-", "")}`;
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
    await seedDatabase(prisma);

    const [clinicScope, staffRole, physicianRole, contentVersion] = await Promise.all([
      prisma.clinicScope.findUniqueOrThrow({ where: { code: "PILOT0" } }),
      prisma.role.findUniqueOrThrow({ where: { code: "STAFF" } }),
      prisma.role.findUniqueOrThrow({ where: { code: "PHYSICIAN" } }),
      prisma.contentVersion.findUniqueOrThrow({ where: { versionCode: P01_CONTENT_VERSION } }),
    ]);
    const staff = await prisma.user.create({
      data: {
        name: "SYN P01 Staff",
        email: `syn-p01-${randomUUID()}@example.invalid`,
        passwordHash: "synthetic-noncredential-hash",
        roleId: staffRole.id,
      },
    });
    const device = await prisma.clinicDevice.create({
      data: {
        clinicScopeId: clinicScope.id,
        name: "SYN P01 Approved Device",
        certificateFingerprintHash: `syn-${randomUUID()}`,
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
      authenticatedSessionId: "syn-p01-auth-session",
    };
    const physician = await prisma.user.create({
      data: {
        name: "SYN P01 Physician",
        email: `syn-p01-physician-${randomUUID()}@example.invalid`,
        passwordHash: "synthetic-noncredential-hash",
        roleId: physicianRole.id,
      },
    });
    const physicianActor: AuthenticatedActor = {
      actorType: "AUTHENTICATED_USER",
      userId: physician.id,
      role: "PHYSICIAN",
      clinicScopeId: clinicScope.id,
      clinicDeviceId: null,
      authenticatedSessionId: "syn-p01-physician-session",
    };
    const store = new PrismaPatientAccessStore(prisma);
    const access = (token: string) =>
      new PatientAccessService(store, { now: () => NOW, generateToken: () => token });
    const engine = new P01EngineService(prisma);
    const submitter = (beforeCommit?: () => Promise<void>) =>
      new FinalSubmitService(prisma!, {
        now: () => NOW,
        beforeCommit,
        evaluateOfficialState: (input) => engine.evaluateOfficialState(input),
      });

    await context.test("P01 registry is published, pinned, complete, and idempotently seeded", async () => {
      assert.equal(contentVersion.isActive, true);
      assert.ok(contentVersion.publishedAt);
      assert.equal(
        await prisma!.questionDefinition.count({
          where: { clinicalLibrary: { is: { contentVersionId: contentVersion.id } } },
        }),
        P01_QUESTION_CONTRACTS.length,
      );
      const registryGuard = await assertPublishedRegistryMatchesContracts(
        prisma!,
        contentVersion.id,
        P01_QUESTION_CONTRACTS,
      );
      assert.equal(registryGuard.questionCount, P01_QUESTION_CONTRACTS.length);
      const evaluated = await engine.evaluateForClient({
        contentVersionId: contentVersion.id,
        patientInputJson: p01Draft(),
      });
      assert.equal(evaluated.state, "READY");
      assert.deepEqual(evaluated.activeModules, {
        hairLoss: true,
        scalp: true,
        hairQuality: false,
        dermatology: false,
        laser: false,
        aesthetic: false,
        lifestyleNutrition: true,
      });
    });

    await context.test("disabled development auth deactivates persisted bootstrap accounts and revokes their sessions", async () => {
      const bootstrapUsers = await prisma!.user.findMany({
        where: { email: { endsWith: BOOTSTRAP_LOGIN_DOMAIN } },
        select: { id: true },
      });
      assert.equal(bootstrapUsers.length, 2);
      await prisma!.authenticatedUserSession.createMany({
        data: bootstrapUsers.map((user) => ({
          sessionTokenHash: `bootstrap-session-${user.id}`,
          userId: user.id,
          clinicScopeId: clinicScope.id,
          expiresAt: new Date("2026-08-15T08:00:00.000Z"),
        })),
      });
      const originalFlag = process.env.P01_ENABLE_DEV_AUTH;
      try {
        process.env.P01_ENABLE_DEV_AUTH = "false";
        await seedDatabase(prisma!);
        assert.equal(await prisma!.user.count({ where: { id: { in: bootstrapUsers.map((user) => user.id) }, isActive: true } }), 0);
        assert.equal(await prisma!.authenticatedUserSession.count({ where: { userId: { in: bootstrapUsers.map((user) => user.id) }, revokedAt: null } }), 0);
      } finally {
        process.env.P01_ENABLE_DEV_AUTH = originalFlag;
        await seedDatabase(prisma!);
      }
    });

    await context.test("server autosave rejects future historical dates before persistence", async () => {
      const token = `syn-future-date-${randomUUID()}`;
      await access(token).createFlow(actor, { clinicMrn: "SYN-P01-FUTURE-DATE-001" });
      const future = p01Draft();
      (future.answers as Record<string, JsonValue>).Q_HAIR_SHEDDING_ONSET = {
        calendar: "GREGORIAN",
        precision: "MONTH_YEAR",
        year: 2026,
        month: 9,
        normalizedGregorian: { year: 2026, month: 9 },
      };
      await assert.rejects(
        access(token).autosave(token, future),
        (error: unknown) => error instanceof PatientAccessError && error.code === "INVALID_REQUEST",
      );
      const reloaded = await access(token).load(token);
      assert.equal((reloaded.patientInputJson.answers as Record<string, JsonValue> | undefined)?.Q_HAIR_SHEDDING_ONSET, undefined);
    });

    let firstResult: Awaited<ReturnType<FinalSubmitService["submit"]>>;
    let secondEpisodeResult: Awaited<ReturnType<FinalSubmitService["submit"]>>;
    let revisionRaceResult: Awaited<ReturnType<FinalSubmitService["submit"]>>;
    await context.test("new MRN remains temporary until atomic P01 Final Submit", async () => {
      const token = `syn-new-${randomUUID()}`;
      const flow = await access(token).createFlow(actor, {
        clinicMrn: "SYN-P01-NEW-001",
        patientInputJson: {},
      });
      assert.equal(flow.matchedExistingPatient, false);
      assert.equal(await prisma!.patient.count(), 0);

      await access(token).autosave(token, p01Draft());
      firstResult = await submitter().submit({
        patientSessionToken: token,
        ...getP01ProfileAndVisit(p01Draft()),
      });
      assert.equal(firstResult.idempotentReplay, false);
      assert.equal(await prisma!.patient.count(), 1);
      assert.equal(
        await prisma!.visitReason.count({ where: { visitId: firstResult.visitId, role: "PRIMARY" } }),
        1,
      );

      const persistedPathways = await prisma!.activePathway.findMany({
        where: { clinicalInterviewId: firstResult.clinicalInterviewId },
        include: { pathwayDefinition: { select: { code: true } } },
      });
      assert.equal(persistedPathways.some((item) => item.pathwayDefinition.code === "HAIR_SCALP_PATHWAY"), true);
      assert.ok(await prisma!.routingEvaluation.count({ where: { clinicalInterviewId: firstResult.clinicalInterviewId } }) > 0);

      const shared = await prisma!.questionInstance.findMany({
        where: {
          clinicalInterviewId: firstResult.clinicalInterviewId,
          questionDefinition: { is: { code: "Q_PRIOR_DIAGNOSIS_GATE" } },
        },
        include: { activationSources: true },
      });
      assert.equal(shared.length, 1);
      assert.deepEqual(
        shared[0].activationSources.map(({ sourceKey }) => sourceKey).sort(),
        ["HAIR_LOSS", "SCALP"],
      );
      const symptomScopes = await prisma!.questionInstance.findMany({
        where: {
          clinicalInterviewId: firstResult.clinicalInterviewId,
          questionDefinition: { is: { code: "Q_SCALP_SYMPTOM_DETAILS" } },
        },
        select: { responseScopeKey: true },
      });
      assert.deepEqual(
        symptomScopes.map(({ responseScopeKey }) => responseScopeKey).sort(),
        ["SCALP:DANDRUFF", "SCALP:ITCH"],
      );
      const routing = await prisma!.routingEvaluation.findMany({
        where: { clinicalInterviewId: firstResult.clinicalInterviewId },
        include: { ruleVersion: true },
      });
      assert.deepEqual(
        Object.fromEntries(
          routing.map(({ ruleVersion, resultState }) => [ruleVersion.code, resultState]),
        ),
        { RULE_HAIR_TO_SCALP: "TRUE", RULE_SCALP_TO_HAIR: "FALSE" },
      );

      const replay = await submitter().submit({
        patientSessionToken: token,
        ...getP01ProfileAndVisit(p01Draft()),
      });
      assert.equal(replay.idempotentReplay, true);
      assert.equal(replay.visitId, firstResult.visitId);
      assert.equal(await prisma!.visit.count({ where: { sourceDraftId: flow.draftId } }), 1);
    });

    await context.test("existing MRN reuses Patient and creates a new Visit only", async () => {
      const token = `syn-existing-${randomUUID()}`;
      const patientCount = await prisma!.patient.count();
      const patientAccess = access(token);
      const flow = await patientAccess.createFlow(actor, { clinicMrn: "SYN-P01-NEW-001" });
      assert.equal(flow.matchedExistingPatient, true);

      // A known MRN is server-classified as RETURNING. This test intentionally
      // chooses a new Scalp concern; it must not bypass the returning-patient gate
      // by replaying an Initial Intake payload directly.
      const returning = await patientAccess.load(token);
      const newConcernDraft = p01Draft("RV_SCALP_SYMPTOMS", false);
      newConcernDraft.followUp = {
        ...returning.patientInputJson.followUp as Record<string, JsonValue>,
        intent: "NEW_CONCERN",
        changes: {
          generalHealth: "NO_CHANGE",
          medicationsSupplements: "NO_CHANGE",
          hairTreatments: "NO_CHANGE",
          hairProcedures: "NO",
          triggerEvents: "NO",
          sexSpecific: "NO_CHANGE",
          hairQualityLifestyle: "NO_CHANGE",
        },
        changesReviewed: true,
      };

      const saved = await patientAccess.autosave(token, newConcernDraft);
      const official = getP01ProfileAndVisit(saved.patientInputJson);
      assert.equal(official.visit.visitType, "INITIAL");
      assert.equal(official.visit.followUpIntent, "NEW_CONCERN");
      assert.equal(official.visit.primaryReasonCode, "RV_SCALP_SYMPTOMS");

      const result = await submitter().submit({
        patientSessionToken: token,
        ...official,
      });
      secondEpisodeResult = result;
      assert.equal(result.patientId, firstResult.patientId);
      assert.equal(await prisma!.patient.count(), patientCount);
      assert.equal(await prisma!.visit.count({ where: { patientId: result.patientId } }), 2);
      const newVisit = await prisma!.visit.findUniqueOrThrow({
        where: { id: result.visitId },
        select: { visitType: true, clinicalEpisodeId: true },
      });
      assert.equal(newVisit.visitType, "INITIAL");
      assert.ok(newVisit.clinicalEpisodeId);
      const firstVisit = await prisma!.visit.findUniqueOrThrow({
        where: { id: firstResult.visitId },
        select: { clinicalEpisodeId: true },
      });
      assert.notEqual(newVisit.clinicalEpisodeId, firstVisit.clinicalEpisodeId);
      const newEpisode = await prisma!.clinicalEpisode.findUniqueOrThrow({
        where: { id: newVisit.clinicalEpisodeId! },
        select: { primaryReasonCode: true, patientId: true },
      });
      assert.equal(newEpisode.patientId, firstResult.patientId);
      assert.equal(newEpisode.primaryReasonCode, "RV_SCALP_SYMPTOMS");
      const hiddenHair = await prisma!.questionInstance.count({
        where: {
          clinicalInterviewId: result.clinicalInterviewId,
          questionDefinition: { is: { code: { in: ["Q_HAIR_CONCERN", "Q_TRIGGER_EVENTS"] } } },
        },
      });
      assert.equal(hiddenHair, 0);
    });

    await context.test("Initial → Follow-up 1 → Follow-up 2 carries cumulative deltas into the next baseline with provenance", async () => {
      const initialVisit = await prisma!.visit.findUniqueOrThrow({
        where: { id: firstResult.visitId },
        select: { clinicalEpisodeId: true },
      });
      const episodeId = initialVisit.clinicalEpisodeId!;

      const token1 = `syn-follow-up-1-${randomUUID()}`;
      await access(token1).createFlow(actor, { clinicMrn: "SYN-P01-NEW-001" });
      const loaded1 = await access(token1).load(token1);
      const draft1 = existingFollowUpDraft(
        loaded1.patientInputJson,
        episodeId,
        {
          generalHealth: "CHANGED", medicationsSupplements: ["STARTED"], hairTreatments: ["STARTED"],
          hairProcedures: "YES", triggerEvents: "YES", sexSpecific: "NO_CHANGE", hairQualityLifestyle: "CHANGED",
        },
        {
          generalHealth: { chronicConditions: [{ id: "C1", name: "Condition recorded at follow-up 1", date: "2026-05" }], tumors: [], allergies: [], surgeriesHospitalizations: [] },
          medicationsSupplements: { startedMedications: [{ id: "M1", name: "Medicine from follow-up 1", date: "2026-06" }], startedSupplements: [{ id: "S1", name: "Supplement from follow-up 1", date: "2026-06" }], affectedExisting: [] },
          hairTreatments: { started: [{ id: "T1", name: "Treatment from follow-up 1", start: "2026-06", stillUsing: "YES" }], affectedExisting: [] },
          hairProcedures: { items: [{ id: "P1", procedure: "PRP", count: "2", lastDate: "2026-07" }] },
          triggerEvents: { items: [{ id: "E1", event: "SEVERE_STRESS", date: "2026-06" }] },
          hairQualityLifestyle: { changeText: "Routine changed at follow-up 1", changeDate: "2026-06" },
          safety: { responses: { Q_PREGNANCY_BREASTFEEDING_STATUS: "NO", Q_PREGNANCY_PLANNING: "NO_PLAN" } },
          currentMetrics: { SHEDDING: 3, DENSITY: 2, ITCH: 1, BURNING: 0, SCALP_PAIN: 0 },
        },
      );
      const saved1 = await access(token1).autosave(token1, draft1);
      assert.equal((await engine.evaluateForClient({ contentVersionId: saved1.contentVersionId, patientInputJson: saved1.patientInputJson })).state, "READY");
      const result1 = await submitter().submit({ patientSessionToken: token1 });

      const token2 = `syn-follow-up-2-${randomUUID()}`;
      await access(token2).createFlow(actor, { clinicMrn: "SYN-P01-NEW-001" });
      const loaded2 = await access(token2).load(token2);
      const context2 = loaded2.patientInputJson.followUp as unknown as P01FollowUpContext;
      assert.equal(context2.followUpHistory?.filter((entry) => entry.episodeId === episodeId).length, 1);
      const medicine = context2.snapshot.entries.find((entry) => JSON.stringify(entry.value).includes("Medicine from follow-up 1"))!;
      const treatment = context2.snapshot.entries.find((entry) => JSON.stringify(entry.value).includes("Treatment from follow-up 1"))!;
      const procedure = context2.snapshot.entries.find((entry) => entry.questionCode === "Q_HAIR_PROCEDURE_DETAILS" && entry.sourceVisitId === result1.visitId)!;
      assert.equal(medicine.sourceVisitId, result1.visitId);
      assert.equal(medicine.sourceType, "FOLLOW_UP_DELTA");

      const draft2 = existingFollowUpDraft(
        loaded2.patientInputJson,
        episodeId,
        {
          generalHealth: "NO_CHANGE", medicationsSupplements: ["USAGE_CHANGED"], hairTreatments: ["STOPPED"],
          hairProcedures: "YES", triggerEvents: "NO", sexSpecific: "NO_CHANGE", hairQualityLifestyle: "NO_CHANGE",
        },
        {
          medicationsSupplements: { startedMedications: [], startedSupplements: [], affectedExisting: [{ sourceResponseId: medicine.sourceResponseId, sourceQuestionCode: medicine.questionCode, sourceScopeKey: medicine.responseScopeKey, itemLabel: "forged", action: "USAGE_CHANGED", details: "Dose changed at follow-up 2" }] },
          hairTreatments: { started: [], affectedExisting: [{ sourceResponseId: treatment.sourceResponseId, sourceQuestionCode: treatment.questionCode, sourceScopeKey: treatment.responseScopeKey, itemLabel: "forged", action: "STOPPED", date: "2026-08" }] },
          hairProcedures: { items: [{ id: "P2", procedure: "PRP", count: "1", lastDate: "2026-08", sourceResponseId: procedure.sourceResponseId, sourceQuestionCode: procedure.questionCode, sourceScopeKey: procedure.responseScopeKey }] },
          safety: { responses: { Q_PREGNANCY_BREASTFEEDING_STATUS: "NO", Q_PREGNANCY_PLANNING: "NO_PLAN" } },
          currentMetrics: { SHEDDING: 2, DENSITY: 2, ITCH: 0, BURNING: 0, SCALP_PAIN: 0 },
        },
      );
      const saved2 = await access(token2).autosave(token2, draft2);
      assert.equal((await engine.evaluateForClient({ contentVersionId: saved2.contentVersionId, patientInputJson: saved2.patientInputJson })).state, "READY");
      const result2 = await submitter().submit({ patientSessionToken: token2 });

      const token3 = `syn-follow-up-3-${randomUUID()}`;
      await access(token3).createFlow(actor, { clinicMrn: "SYN-P01-NEW-001" });
      const loaded3 = await access(token3).load(token3);
      const context3 = loaded3.patientInputJson.followUp as unknown as P01FollowUpContext;
      const episodeHistory = context3.followUpHistory?.filter((entry) => entry.episodeId === episodeId) ?? [];
      assert.equal(episodeHistory.length, 2);
      assert.equal(episodeHistory[0].visitId, result1.visitId);
      assert.equal(episodeHistory[1].visitId, result2.visitId);
      assert.equal(context3.snapshot.entries.some((entry) => JSON.stringify(entry.value).includes("Treatment from follow-up 1")), false);
      const currentMedicine = context3.snapshot.entries.find((entry) => JSON.stringify(entry.value).includes("Medicine from follow-up 1"));
      assert.equal(currentMedicine?.sourceVisitId, result2.visitId);
      const currentProcedure = context3.snapshot.entries.find((entry) => entry.questionCode === "Q_HAIR_PROCEDURE_DETAILS");
      assert.equal((currentProcedure?.value as Record<string, JsonValue>).count, "3");
    });

    await context.test("autosave after stale submit-command derivation cannot create mixed-revision official state", async () => {
      const token = `syn-revision-race-${randomUUID()}`;
      const flow = await access(token).createFlow(actor, { clinicMrn: "SYN-P01-REVISION-RACE-001" });
      const revisionA = p01Draft("RV_HAIR_LOSS", true);
      await access(token).autosave(token, revisionA);
      const staleCommand = getP01ProfileAndVisit(revisionA);

      const revisionB = p01Draft("RV_SCALP_SYMPTOMS", false);
      (revisionB.answers as Record<string, JsonValue>).Q_PROFILE_FULL_NAME = "SYN Locked Revision B";
      let markSubmitStarted!: () => void;
      let releaseSubmit!: () => void;
      const submitStarted = new Promise<void>((resolve) => { markSubmitStarted = resolve; });
      const submitMayEnterTransaction = new Promise<void>((resolve) => { releaseSubmit = resolve; });
      const racingSubmitter = new FinalSubmitService(prisma!, {
        now: () => NOW,
        beforeTransaction: async () => {
          markSubmitStarted();
          await submitMayEnterTransaction;
        },
        evaluateOfficialState: (input) => engine.evaluateOfficialState(input),
      });
      const submitting = racingSubmitter.submit({ patientSessionToken: token, ...staleCommand });
      await submitStarted;
      await access(token).autosave(token, revisionB);
      releaseSubmit();
      const result = await submitting;
      revisionRaceResult = result;

      const [profile, visit, reasons] = await Promise.all([
        prisma!.patientProfile.findUniqueOrThrow({ where: { patientId: result.patientId } }),
        prisma!.visit.findUniqueOrThrow({ where: { id: result.visitId } }),
        prisma!.visitReason.findMany({ where: { visitId: result.visitId }, include: { reasonDefinition: true } }),
      ]);
      assert.equal(profile.fullName, "SYN Locked Revision B");
      assert.equal(reasons.find((reason) => reason.role === "PRIMARY")?.reasonDefinition.code, "RV_SCALP_SYMPTOMS");
      assert.equal(visit.sourceDraftId, flow.draftId);
      assert.equal(await prisma!.questionInstance.count({ where: { clinicalInterviewId: result.clinicalInterviewId, questionDefinition: { is: { code: "Q_HAIR_CONCERN" } } } }), 0);
      assert.equal(await prisma!.questionInstance.count({ where: { clinicalInterviewId: result.clinicalInterviewId, questionDefinition: { is: { code: "Q_SCALP_SYMPTOMS" } } } }), 1);
    });

    await context.test("Hair History server uses server now for dates while preserving visit/episode provenance", async () => {
      const dermatologyToken = `syn-dermatology-${randomUUID()}`;
      await access(dermatologyToken).createFlow(actor, { clinicMrn: "SYN-P01-DERMATOLOGY-001" });
      const dermatologyDraft = p01Draft("RV_DERMATOLOGY", false);
      await access(dermatologyToken).autosave(dermatologyToken, dermatologyDraft);
      const dermatologyResult = await submitter().submit({ patientSessionToken: dermatologyToken });
      const service = new PhysicianHairHistoryService(prisma!);

      await assert.rejects(
        service.saveDraft(physicianActor, {
          patientId: dermatologyResult.patientId,
          sourceVisitId: dermatologyResult.visitId,
          items: [],
        }),
        (error: unknown) => error instanceof HairHistoryWriteError && error.code === "HAIR_HISTORY_NOT_ELIGIBLE",
      );

      const validResponse = await prisma!.response.findFirstOrThrow({
        where: {
          questionInstance: {
            clinicalInterviewId: firstResult.clinicalInterviewId,
            questionDefinition: { is: { code: "Q_HAIR_SHEDDING_SEVERITY" } },
          },
        },
        include: { questionInstance: { include: { questionDefinition: true } } },
      });
      const validItem = {
        id: "server-provenance-measure",
        layer: "MEASURES",
        itemType: "PATIENT_MEASURE",
        label: { ar: "تساقط الشعر", en: "Shedding" },
        value: { metricCode: "SHEDDING", value: 3 },
        date: NOW.toISOString(),
        datePrecision: "DAY",
        source: "PATIENT",
        included: true,
        sourceQuestionCode: validResponse.questionInstance.questionDefinition.code,
        sourceScopeKey: validResponse.questionInstance.responseScopeKey,
        sourceResponseId: validResponse.id,
      };
      const sourceVisitCreatedAt = await prisma!.visit.findUniqueOrThrow({
        where: { id: firstResult.visitId },
        select: { createdAt: true },
      });
      const afterSourceVisit = new Date(sourceVisitCreatedAt.createdAt.getTime() + 1).toISOString();
      assert.ok(new Date(afterSourceVisit).getTime() > sourceVisitCreatedAt.createdAt.getTime());
      const afterServerNow = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();

      await assert.rejects(
        service.saveDraft(physicianActor, {
          patientId: firstResult.patientId,
          sourceVisitId: firstResult.visitId,
          items: [{ ...validItem, sourceResponseId: randomUUID() }],
        }),
        (error: unknown) => error instanceof HairHistoryWriteError && error.code === "INVALID_PROVENANCE",
      );

      await assert.doesNotReject(service.saveDraft(physicianActor, {
        patientId: firstResult.patientId,
        sourceVisitId: firstResult.visitId,
        items: [{ ...validItem, date: afterSourceVisit, source: "PHYSICIAN" }],
      }));
      await assert.rejects(
        service.saveDraft(physicianActor, {
          patientId: firstResult.patientId,
          sourceVisitId: firstResult.visitId,
          items: [{ ...validItem, date: afterServerNow, source: "PHYSICIAN" }],
        }),
        (error: unknown) => error instanceof HairHistoryWriteError
          && error.code === "INVALID_REQUEST"
          && error.message.includes("authoritative server time"),
      );

      const otherPatientResponse = await prisma!.response.findFirstOrThrow({
        where: { questionInstance: { clinicalInterviewId: revisionRaceResult.clinicalInterviewId } },
        include: { questionInstance: { include: { questionDefinition: true } } },
      });
      await assert.rejects(
        service.saveDraft(physicianActor, {
          patientId: firstResult.patientId,
          sourceVisitId: firstResult.visitId,
          items: [{
            ...validItem,
            sourceResponseId: otherPatientResponse.id,
            sourceQuestionCode: otherPatientResponse.questionInstance.questionDefinition.code,
            sourceScopeKey: otherPatientResponse.questionInstance.responseScopeKey,
          }],
        }),
        (error: unknown) => error instanceof HairHistoryWriteError && error.code === "INVALID_PROVENANCE",
      );

      const otherEpisodeResponse = await prisma!.response.findFirstOrThrow({
        where: { questionInstance: { clinicalInterviewId: secondEpisodeResult.clinicalInterviewId } },
        include: { questionInstance: { include: { questionDefinition: true } } },
      });
      await assert.rejects(
        service.saveDraft(physicianActor, {
          patientId: firstResult.patientId,
          sourceVisitId: firstResult.visitId,
          items: [{
            ...validItem,
            sourceResponseId: otherEpisodeResponse.id,
            sourceQuestionCode: otherEpisodeResponse.questionInstance.questionDefinition.code,
            sourceScopeKey: otherEpisodeResponse.questionInstance.responseScopeKey,
          }],
        }),
        (error: unknown) => error instanceof HairHistoryWriteError && error.code === "INVALID_PROVENANCE",
      );

      await service.saveDraft(physicianActor, {
        patientId: firstResult.patientId,
        sourceVisitId: firstResult.visitId,
        items: [validItem],
      });
      await assert.rejects(
        service.approve(physicianActor, {
          patientId: firstResult.patientId,
          approvingVisitId: secondEpisodeResult.visitId,
        }),
        (error: unknown) => error instanceof HairHistoryWriteError && error.code === "VISIT_EPISODE_MISMATCH",
      );
      const approved = await service.approve(physicianActor, {
        patientId: firstResult.patientId,
        approvingVisitId: firstResult.visitId,
      });
      assert.equal(approved.revision, 1);
      await assert.rejects(
        service.saveDraft(physicianActor, {
          patientId: firstResult.patientId,
          sourceVisitId: firstResult.visitId,
          baseRevision: approved.revision,
          items: [{ ...validItem, value: { metricCode: "SHEDDING", value: 4 }, source: "PHYSICIAN" }],
        }),
        (error: unknown) => error instanceof HairHistoryWriteError
          && error.code === "INVALID_REQUEST"
          && error.message.includes("reopened with a reason"),
      );
      await assert.rejects(
        service.reopen(physicianActor, {
          patientId: firstResult.patientId,
          sourceVisitId: secondEpisodeResult.visitId,
          reason: "Cross-episode amendment attempt",
        }),
        (error: unknown) => error instanceof HairHistoryWriteError && error.code === "VISIT_EPISODE_MISMATCH",
      );
      await service.reopen(physicianActor, {
        patientId: firstResult.patientId,
        sourceVisitId: firstResult.visitId,
        reason: "Valid same-episode amendment",
      });
      const reopened = await prisma!.hairHistoryDraft.findUniqueOrThrow({
        where: { patientId: firstResult.patientId },
        include: { items: true },
      });
      assert.equal(reopened.items[0].sourceResponseId, validResponse.id);
      const amendmentSave = await service.saveDraft(physicianActor, {
        patientId: firstResult.patientId,
        sourceVisitId: firstResult.visitId,
        baseRevision: approved.revision,
        items: reopened.items.map((item) => ({
          id: item.id,
          layer: item.layer,
          itemType: item.itemType,
          label: { ar: item.labelAr, en: item.labelEn },
          value: item.valueJson,
          ...(item.approximateDate ? { date: item.approximateDate.toISOString() } : {}),
          datePrecision: item.datePrecision,
          source: item.source,
          included: item.isIncluded,
          ...(item.sourceQuestionCode ? { sourceQuestionCode: item.sourceQuestionCode } : {}),
          ...(item.sourceScopeKey ? { sourceScopeKey: item.sourceScopeKey } : {}),
          ...(item.sourceResponseId ? { sourceResponseId: item.sourceResponseId } : {}),
          ...(item.sourceItemIndex !== null ? { sourceItemIndex: item.sourceItemIndex } : {}),
        })),
      });
      assert.equal(amendmentSave.status, "AMENDMENT_DRAFT");
      const amendmentEditAudit = await prisma!.auditLog.findFirstOrThrow({
        where: { patientId: firstResult.patientId, entityType: "HAIR_HISTORY_DRAFT", entityId: reopened.id, action: "UPDATE" },
        orderBy: { changedAt: "desc" },
      });
      assert.equal(amendmentEditAudit.reason, "Valid same-episode amendment");
      const reapproved = await service.approve(physicianActor, {
        patientId: firstResult.patientId,
        approvingVisitId: firstResult.visitId,
      });
      assert.equal(reapproved.revision, 2);
      const amendmentApprovalAudit = await prisma!.auditLog.findFirstOrThrow({
        where: { patientId: firstResult.patientId, entityType: "APPROVED_HAIR_HISTORY", action: "APPROVE" },
        orderBy: { changedAt: "desc" },
      });
      assert.equal(amendmentApprovalAudit.reason, "Valid same-episode amendment");
    });

    await context.test("P01 transaction rollback leaves no identity or official visit", async () => {
      const token = `syn-rollback-${randomUUID()}`;
      const flow = await access(token).createFlow(actor, { clinicMrn: "SYN-P01-ROLLBACK-001" });
      await access(token).autosave(token, p01Draft());
      await assert.rejects(
        submitter(async () => {
          throw new Error("SYN P01 injected rollback");
        }).submit({ patientSessionToken: token, ...getP01ProfileAndVisit(p01Draft()) }),
        /SYN P01 injected rollback/,
      );
      assert.equal(
        await prisma!.externalPatientIdentifier.count({ where: { normalizedValue: "SYNP01ROLLBACK001" } }),
        0,
      );
      assert.equal(await prisma!.visit.count({ where: { sourceDraftId: flow.draftId } }), 0);
      assert.equal(
        (await prisma!.draftClinicalInterview.findUniqueOrThrow({ where: { id: flow.draftId } })).status,
        "DRAFT",
      );
    });

    await context.test("concurrent same-Draft P01 submit commits exactly one Visit", async () => {
      const token = `syn-concurrent-${randomUUID()}`;
      const flow = await access(token).createFlow(actor, { clinicMrn: "SYN-P01-CONCURRENT-001" });
      await access(token).autosave(token, p01Draft());
      const command = { patientSessionToken: token, ...getP01ProfileAndVisit(p01Draft()) };
      const results = await Promise.all([submitter().submit(command), submitter().submit(command)]);
      assert.equal(results[0].visitId, results[1].visitId);
      assert.equal(await prisma!.visit.count({ where: { sourceDraftId: flow.draftId } }), 1);
    });
  } finally {
    await prisma?.$disconnect();
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await adminPool.end();
  }
});
