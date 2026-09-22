import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient, type Prisma } from "../../app/generated/prisma/client";
import type { AuthenticatedActor } from "../../lib/auth/authorization";
import { PatientContextService, persistPatientContextFromOfficialState } from "../../lib/patient-context/service";
import { PhysicianVisitClinicalService } from "../../lib/physician/visit-clinical-service";
import { PhysicianVisitLifecycleError } from "../../lib/physician/visit-lifecycle-contracts";
import { PhysicianVisitLifecycleService } from "../../lib/physician/visit-lifecycle-service";
import { PhysicianVisitLongitudinalService } from "../../lib/physician/visit-longitudinal-service";
import { PhysicianVisitService } from "../../lib/physician/visit-service";
import type { EvaluatedOfficialState } from "../../lib/submission/service";
import { seedDatabase } from "../../prisma/seed";

const MIGRATIONS_URL = new URL("../../prisma/migrations/", import.meta.url);
const HOUR = 60 * 60 * 1_000;

async function migrations() {
  const entries = await readdir(MIGRATIONS_URL, { withFileTypes: true });
  return Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().map(
    (directory) => readFile(new URL(`${directory}/migration.sql`, MIGRATIONS_URL), "utf8"),
  ));
}

test("FPV-4 governed longitudinal physician state and Patient Context", async (context) => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required.");
  const schemaName = `fpv4_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString });
  let prisma: PrismaClient | undefined;
  try {
    const setup = await admin.connect();
    try {
      await setup.query(`CREATE SCHEMA "${schemaName}"`);
      await setup.query(`SET search_path TO "${schemaName}"`);
      for (const sql of await migrations()) await setup.query(sql);
    } finally {
      setup.release();
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema: schemaName }) });
    await seedDatabase(prisma);
    const [scope, staff, physician, contentVersion] = await Promise.all([
      prisma.clinicScope.findUniqueOrThrow({ where: { code: "PILOT0" } }),
      prisma.user.findFirstOrThrow({ where: { role: { code: "STAFF" } } }),
      prisma.user.findFirstOrThrow({ where: { role: { code: "PHYSICIAN" } } }),
      prisma.contentVersion.findFirstOrThrow({ orderBy: { createdAt: "desc" } }),
    ]);
    const staffActor: AuthenticatedActor = {
      actorType: "AUTHENTICATED_USER", userId: staff.id, role: "STAFF",
      clinicScopeId: scope.id, clinicDeviceId: null,
      authenticatedSessionId: randomUUID(),
    };
    const physicianActor: AuthenticatedActor = { ...staffActor, userId: physician.id, role: "PHYSICIAN" };
    const patient = await prisma.patient.create({ data: {} });
    const episode = await prisma.clinicalEpisode.create({ data: {
      patientId: patient.id, clinicScopeId: scope.id,
      primaryReasonCode: "RV_HAIR_LOSS",
    } });
    let serial = 0;
    const createVisit = async () => {
      serial += 1;
      const invitation = await prisma!.interviewInvitation.create({ data: {
        patientId: patient.id, clinicScopeId: scope.id, createdByUserId: staff.id,
      } });
      const session = await prisma!.patientAccessSession.create({ data: {
        invitationId: invitation.id, sessionTokenHash: `fpv4-${randomUUID()}`,
        status: "CLOSED", closeReason: "SUBMITTED", closedAt: new Date(),
        expiresAt: new Date(Date.now() + HOUR),
      } });
      const sourceDraft = await prisma!.draftClinicalInterview.create({ data: {
        sessionId: session.id, contentVersionId: contentVersion.id,
        patientInputJson: {}, status: "SUBMITTED", submittedAt: new Date(),
        expiresAt: new Date(Date.now() + HOUR),
      } });
      const visit = await prisma!.visit.create({ data: {
        patientId: patient.id, clinicScopeId: scope.id,
        sourceDraftId: sourceDraft.id, clinicalEpisodeId: episode.id,
        visitType: serial === 1 ? "INITIAL" : "FOLLOW_UP",
      } });
      const interview = await prisma!.clinicalInterview.create({ data: { visitId: visit.id } });
      const service = new PhysicianVisitService(prisma!);
      const record = await service.prepareDraft(staffActor, visit.id);
      return { visit, interview, record, service };
    };
    const finalize = async (
      fixture: Awaited<ReturnType<typeof createVisit>>,
      sections: Array<{ section: string; value: Record<string, unknown> }>,
      occurredAt: Date,
    ) => {
      let version = fixture.record.draftVersion;
      for (const section of sections) {
        const updated = await fixture.service.updateDraft(staffActor, fixture.visit.id, {
          expectedDraftVersion: version, ...section,
        });
        version = updated.draftVersion;
      }
      const lifecycle = new PhysicianVisitLifecycleService(prisma!, { now: () => occurredAt, databaseSchema: schemaName });
      await lifecycle.beginEncounter(physicianActor, fixture.visit.id);
      await new PhysicianVisitLifecycleService(prisma!, { now: () => new Date(occurredAt.getTime() + 1_000), databaseSchema: schemaName })
        .finalize(physicianActor, fixture.visit.id, { expectedDraftVersion: version });
    };

    const base = new Date();
    const first = await createVisit();
    await finalize(first, [
      { section: "DIAGNOSIS", value: { decisions: [{ action: "ADD", text: "  exact D1  " }] } },
      { section: "TREATMENT_PROCEDURES", value: {
        treatments: [{ action: "START", name: "Minoxidil", regimenText: "daily" }],
        procedures: [
          { action: "PLAN", procedureCode: "PRP", plannedDate: "2027-01-01" },
          { action: "PERFORM", procedureCode: "MICRONEEDLING", performedDate: base.toISOString().slice(0, 10) },
        ],
      } },
    ], base);

    const firstRead = await new PhysicianVisitLongitudinalService(prisma).readForVisit(physicianActor, first.visit.id);
    const diagnosisId = firstRead.effectivePhysicianState.diagnoses[0]!.diagnosisId;
    const treatmentCourseId = firstRead.effectivePhysicianState.treatmentCourses[0]!.treatmentCourseId;
    const procedurePlanId = firstRead.effectivePhysicianState.procedurePlans[0]!.procedurePlanId;

    await context.test("Finalize stores only Visit decisions and derives carried Effective State", async () => {
      assert.equal(firstRead.visitDecisions.diagnoses.length, 1);
      assert.equal(firstRead.effectivePhysicianState.diagnoses[0]?.text, "  exact D1  ");
      assert.equal(firstRead.effectivePhysicianState.treatmentCourses[0]?.status, "ACTIVE");
      assert.equal(firstRead.effectivePhysicianState.procedurePlans[0]?.status, "OPEN");
      assert.equal(firstRead.effectivePhysicianState.performedProcedures.length, 1);

      const draft = await createVisit();
      const draftRead = await new PhysicianVisitClinicalService(prisma!).read(physicianActor, draft.visit.id);
      assert.deepEqual(draftRead.visitDecisions, { diagnoses: [], treatments: [], procedures: [] });
      assert.equal(draftRead.effectivePhysicianState.diagnoses[0]?.diagnosisId, diagnosisId);
      assert.equal(draftRead.canonicalClinicalData, null);
    });

    const second = await createVisit();
    await finalize(second, [
      { section: "DIAGNOSIS", value: { decisions: [{ action: "REVISE", diagnosisId, text: "D1 revised" }] } },
      { section: "TREATMENT_PROCEDURES", value: {
        treatments: [{ action: "MODIFY", treatmentCourseId, regimenText: "twice daily" }],
        procedures: [{ action: "PERFORM", procedurePlanId, performedDate: base.toISOString().slice(0, 10) }],
      } },
    ], new Date(base.getTime() + HOUR));

    await context.test("REVISE, MODIFY, and linked PERFORM replay without mutating Visit 1", async () => {
      const state = await new PhysicianVisitLongitudinalService(prisma!).readForVisit(physicianActor, second.visit.id);
      assert.equal(state.effectivePhysicianState.diagnoses[0]?.text, "D1 revised");
      assert.equal(state.effectivePhysicianState.treatmentCourses[0]?.regimenText, "twice daily");
      assert.equal(state.effectivePhysicianState.procedurePlans[0]?.status, "FULFILLED");
      const original = await new PhysicianVisitLongitudinalService(prisma!).readForVisit(physicianActor, first.visit.id);
      assert.equal(original.visitDecisions.diagnoses[0]?.text, "  exact D1  ");
    });

    await context.test("content correction replays state and OMIT rejects downstream dependencies", async () => {
      const originalDecisionId = firstRead.visitDecisions.diagnoses[0]!.decisionId;
      const correctionService = new PhysicianVisitLongitudinalService(
        prisma!,
        () => new Date(base.getTime() + 2 * HOUR),
        schemaName,
      );
      await correctionService.correct(physicianActor, first.visit.id, {
        target: "DIAGNOSIS_DECISION",
        decisionId: originalDecisionId,
        operation: "SET_CONTENT",
        value: { text: "corrected origin" },
      });
      const after = await correctionService.readForVisit(physicianActor, second.visit.id);
      assert.equal(after.effectivePhysicianState.diagnoses[0]?.text, "D1 revised");
      assert.equal(
        (await correctionService.readForVisit(physicianActor, first.visit.id)).visitDecisions.diagnoses[0]?.text,
        "corrected origin",
      );
      await assert.rejects(
        correctionService.correct(physicianActor, first.visit.id, {
          target: "DIAGNOSIS_DECISION",
          decisionId: originalDecisionId,
          operation: "OMIT",
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "DEPENDENT_LONGITUDINAL_DECISIONS",
      );
      await assert.rejects(
        new PhysicianVisitLongitudinalService(
          prisma!,
          () => new Date(base.getTime() + 24 * HOUR),
          schemaName,
        ).correct(physicianActor, first.visit.id, {
          target: "DIAGNOSIS_DECISION",
          decisionId: originalDecisionId,
          operation: "SET_CONTENT",
          value: { text: "too late" },
        }),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "VISIT_CORRECTION_WINDOW_CLOSED",
      );
    });

    await context.test("cross-Episode targets and future performed dates fail atomically", async () => {
      const otherPatient = await prisma!.patient.create({ data: {} });
      const otherEpisode = await prisma!.clinicalEpisode.create({ data: {
        patientId: otherPatient.id, clinicScopeId: scope.id, primaryReasonCode: "RV_HAIR_LOSS",
      } });
      const foreign = await prisma!.physicianDiagnosis.create({ data: {
        patientId: otherPatient.id, clinicScopeId: scope.id, clinicalEpisodeId: otherEpisode.id,
      } });
      const invalid = await createVisit();
      await assert.rejects(
        finalize(invalid, [{ section: "DIAGNOSIS", value: { decisions: [{ action: "RESOLVE", diagnosisId: foreign.id }] } }], new Date(base.getTime() + 2 * HOUR)),
        (error: unknown) => error instanceof PhysicianVisitLifecycleError && error.code === "INVALID_LONGITUDINAL_TARGET",
      );
      assert.equal(await prisma!.physicianDiagnosisDecision.count({ where: { physicianVisitRecordId: invalid.record.id } }), 0);
    });

    await context.test("same-Episode concurrent Finalize serializes and projects by encounter chronology", async () => {
      const earlier = await createVisit();
      const later = await createVisit();
      const earlierDraft = await earlier.service.updateDraft(staffActor, earlier.visit.id, {
        expectedDraftVersion: earlier.record.draftVersion,
        section: "TREATMENT_PROCEDURES",
        value: { treatments: [{ action: "MODIFY", treatmentCourseId, regimenText: "three times daily" }], procedures: [] },
      });
      const laterDraft = await later.service.updateDraft(staffActor, later.visit.id, {
        expectedDraftVersion: later.record.draftVersion,
        section: "TREATMENT_PROCEDURES",
        value: { treatments: [{ action: "MODIFY", treatmentCourseId, regimenText: "four times daily" }], procedures: [] },
      });
      const earlierAt = new Date(base.getTime() + 3 * HOUR);
      const laterAt = new Date(base.getTime() + 4 * HOUR);
      await new PhysicianVisitLifecycleService(prisma!, { now: () => earlierAt, databaseSchema: schemaName })
        .beginEncounter(physicianActor, earlier.visit.id);
      await new PhysicianVisitLifecycleService(prisma!, { now: () => laterAt, databaseSchema: schemaName })
        .beginEncounter(physicianActor, later.visit.id);
      await Promise.all([
        new PhysicianVisitLifecycleService(prisma!, { now: () => new Date(earlierAt.getTime() + 1_000), databaseSchema: schemaName })
          .finalize(physicianActor, earlier.visit.id, { expectedDraftVersion: earlierDraft.draftVersion }),
        new PhysicianVisitLifecycleService(prisma!, { now: () => new Date(laterAt.getTime() + 1_000), databaseSchema: schemaName })
          .finalize(physicianActor, later.visit.id, { expectedDraftVersion: laterDraft.draftVersion }),
      ]);
      const projected = await new PhysicianVisitLongitudinalService(prisma!).readForVisit(physicianActor, later.visit.id);
      assert.equal(projected.effectivePhysicianState.treatmentCourses[0]?.regimenText, "four times daily");
      assert.equal(await prisma!.physicianTreatmentCourse.count(), 1);
    });

    await context.test("Patient Context preserves exact source separation, versions, review, and reconciliation", async () => {
      const codes = ["Q_PROFILE_MARITAL_STATUS", "Q_HEALTH_MEDICATION_ITEMS", "Q_HAIR_TREATMENT_ITEMS"];
      const definitions = await prisma!.questionDefinition.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
      const byCode = new Map(definitions.map((row) => [row.code, row.id]));
      const official = (
        medication: string,
        hairTreatment?: string,
      ): EvaluatedOfficialState => ({
        state: "READY", activePathwayDefinitionIds: [], activeLibraryIds: [], routingEvaluations: [],
        questionResponses: [
          { questionDefinitionId: byCode.get("Q_PROFILE_MARITAL_STATUS")!, responseScopeType: "VISIT", responseScopeKey: "VISIT", valueJson: "MARRIED", activationSources: [] },
          { questionDefinitionId: byCode.get("Q_HEALTH_MEDICATION_ITEMS")!, responseScopeType: "MEDICATION_ITEM", responseScopeKey: `MED:${medication}`, valueJson: { name: medication }, activationSources: [] },
          ...(hairTreatment ? [{
            questionDefinitionId: byCode.get("Q_HAIR_TREATMENT_ITEMS")!,
            responseScopeType: "MEDICATION_ITEM" as const,
            responseScopeKey: `HAIR:${hairTreatment}`,
            valueJson: { name: hairTreatment, stillUsing: "YES" },
            activationSources: [],
          }] : []),
        ],
      });
      await persistPatientContextFromOfficialState(prisma! as unknown as Prisma.TransactionClient, {
        patientId: patient.id, clinicScopeId: scope.id, visitId: first.visit.id,
        clinicalInterviewId: first.interview.id,
        officialState: official("Levothyroxine", "Hair Minoxidil"), sourceUpdatedAt: base,
      });
      const contextRead = await new PatientContextService(prisma!).readCurrent(physicianActor, patient.id);
      assert.equal(contextRead.items.find((item) => item.code === "CURRENT_MEDICATIONS")?.source, "PATIENT_REPORTED");
      assert.equal(JSON.stringify(contextRead.items.find((item) => item.code === "CURRENT_MEDICATIONS")?.value).includes("Hair Minoxidil"), false);
      assert.equal(JSON.stringify(contextRead.items.find((item) => item.code === "CURRENT_HAIR_THERAPIES")?.value).includes("Hair Minoxidil"), true);
      const localVersion = await prisma!.patientContextVersion.findFirstOrThrow({
        where: { sourceClinicalInterviewId: first.interview.id },
      });

      const foreignScope = await prisma!.clinicScope.create({ data: {
        code: `FPV4-FOREIGN-${randomUUID()}`,
        nameAr: "نطاق آخر",
        nameEn: "Other Clinic Scope",
      } });
      const foreignEpisode = await prisma!.clinicalEpisode.create({ data: {
        patientId: patient.id,
        clinicScopeId: foreignScope.id,
        primaryReasonCode: "RV_DERMATOLOGY",
      } });
      const foreignInvitation = await prisma!.interviewInvitation.create({ data: {
        patientId: patient.id,
        clinicScopeId: foreignScope.id,
        createdByUserId: staff.id,
      } });
      const foreignSession = await prisma!.patientAccessSession.create({ data: {
        invitationId: foreignInvitation.id,
        sessionTokenHash: `fpv4-foreign-${randomUUID()}`,
        status: "CLOSED",
        closeReason: "SUBMITTED",
        closedAt: new Date(),
        expiresAt: new Date(Date.now() + HOUR),
      } });
      const foreignDraft = await prisma!.draftClinicalInterview.create({ data: {
        sessionId: foreignSession.id,
        contentVersionId: contentVersion.id,
        patientInputJson: {},
        status: "SUBMITTED",
        submittedAt: new Date(),
        expiresAt: new Date(Date.now() + HOUR),
      } });
      const foreignVisit = await prisma!.visit.create({ data: {
        patientId: patient.id,
        clinicScopeId: foreignScope.id,
        sourceDraftId: foreignDraft.id,
        clinicalEpisodeId: foreignEpisode.id,
        visitType: "INITIAL",
      } });
      const foreignInterview = await prisma!.clinicalInterview.create({
        data: { visitId: foreignVisit.id },
      });
      await persistPatientContextFromOfficialState(prisma! as unknown as Prisma.TransactionClient, {
        patientId: patient.id,
        clinicScopeId: foreignScope.id,
        visitId: foreignVisit.id,
        clinicalInterviewId: foreignInterview.id,
        officialState: official("Foreign Clinic Medication", "Foreign Hair Therapy"),
        sourceUpdatedAt: new Date(base.getTime() + HOUR),
      });
      const foreignVersion = await prisma!.patientContextVersion.findFirstOrThrow({
        where: { sourceClinicalInterviewId: foreignInterview.id },
      });
      assert.notEqual(foreignVersion.fingerprint, contextRead.fingerprint);

      const clinicScopedRead = await new PatientContextService(prisma!).readCurrent(
        physicianActor,
        patient.id,
      );
      assert.equal(clinicScopedRead.fingerprint, contextRead.fingerprint);
      assert.equal(JSON.stringify(clinicScopedRead).includes("Foreign Clinic Medication"), false);
      const canonicalRead = await new PhysicianVisitClinicalService(prisma!).read(
        physicianActor,
        first.visit.id,
      );
      assert.equal(canonicalRead.patientContext.fingerprint, contextRead.fingerprint);

      const longitudinalBefore = await new PhysicianVisitLongitudinalService(prisma!)
        .readForVisit(physicianActor, first.visit.id);
      const canonicalCountsBefore = await Promise.all([
        prisma!.physicianDiagnosis.count(),
        prisma!.physicianDiagnosisDecision.count(),
        prisma!.physicianTreatmentCourse.count(),
        prisma!.physicianTreatmentDecision.count(),
        prisma!.physicianProcedurePlan.count(),
        prisma!.physicianProcedureDecision.count(),
      ]);
      const evidenceService = new PatientContextService(
        prisma!,
        () => new Date(base.getTime() + HOUR),
      );
      const review = await evidenceService.review(
        physicianActor,
        first.visit.id,
        contextRead.fingerprint!,
      );
      assert.equal(review.contextVersionId, localVersion.id);
      const medicationItem = contextRead.items.find((item) => item.code === "CURRENT_MEDICATIONS")!;
      const reconciliation = await evidenceService.reconcile(
        physicianActor,
        first.visit.id,
        contextRead.fingerprint!,
        medicationItem.id,
      );
      assert.equal(reconciliation.contextVersionId, localVersion.id);
      assert.ok("contextItemId" in reconciliation);
      assert.equal(reconciliation.contextItemId, medicationItem.id);
      assert.deepEqual(
        await Promise.all([
          prisma!.physicianDiagnosis.count(),
          prisma!.physicianDiagnosisDecision.count(),
          prisma!.physicianTreatmentCourse.count(),
          prisma!.physicianTreatmentDecision.count(),
          prisma!.physicianProcedurePlan.count(),
          prisma!.physicianProcedureDecision.count(),
        ]),
        canonicalCountsBefore,
      );
      assert.deepEqual(
        (await new PhysicianVisitLongitudinalService(prisma!).readForVisit(
          physicianActor,
          first.visit.id,
        )).effectivePhysicianState,
        longitudinalBefore.effectivePhysicianState,
      );

      await persistPatientContextFromOfficialState(prisma! as unknown as Prisma.TransactionClient, {
        patientId: patient.id, clinicScopeId: scope.id, visitId: second.visit.id,
        clinicalInterviewId: second.interview.id,
        officialState: official("Amlodipine"), sourceUpdatedAt: new Date(base.getTime() + 2 * HOUR),
      });
      const changed = await new PatientContextService(prisma!).readCurrent(physicianActor, patient.id);
      assert.equal(changed.contextVersion, 3);
      assert.notEqual(changed.fingerprint, contextRead.fingerprint);
      assert.equal(JSON.stringify(changed).includes("Hair Minoxidil"), true);
      assert.equal(JSON.stringify(changed).includes("Foreign Hair Therapy"), false);
      assert.equal(changed.items.find((item) => item.code === "CURRENT_MEDICATIONS")?.latestReconciliation, null);
      assert.equal(changed.latestReview, null);
      await assert.rejects(
        new PatientContextService(prisma!).review(physicianActor, second.visit.id, contextRead.fingerprint!),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "PATIENT_CONTEXT_VERSION_CONFLICT",
      );
      await assert.rejects(
        new PatientContextService(prisma!).reconcile(
          physicianActor,
          second.visit.id,
          contextRead.fingerprint!,
          medicationItem.id,
        ),
        (error: unknown) =>
          error instanceof PhysicianVisitLifecycleError &&
          error.code === "PATIENT_CONTEXT_VERSION_CONFLICT",
      );
      assert.equal(await prisma!.patientContextReview.count(), 1);
      assert.equal(await prisma!.patientContextReconciliation.count(), 1);
    });

    await context.test("exact-deadline database hard lock blocks direct decision mutation", async () => {
      const late = await createVisit();
      await finalize(late, [
        { section: "DIAGNOSIS", value: { decisions: [{ action: "ADD", text: "late documentation" }] } },
      ], new Date(Date.now() - 25 * HOUR));
      const decision = await prisma!.physicianDiagnosisDecision.findFirstOrThrow({ where: { physicianVisitRecordId: late.record.id } });
      await assert.rejects(
        prisma!.$executeRawUnsafe(
          `UPDATE "${schemaName}"."PhysicianDiagnosisDecision" SET "text" = 'attack' WHERE "id" = $1`,
          decision.id,
        ),
      );
      await assert.rejects(
        prisma!.$executeRawUnsafe(
          `DELETE FROM "${schemaName}"."PhysicianDiagnosisDecision" WHERE "id" = $1`,
          decision.id,
        ),
      );
      await assert.rejects(
        prisma!.$executeRawUnsafe(
          `INSERT INTO "${schemaName}"."PhysicianDiagnosisDecision"
             ("id", "physicianVisitRecordId", "visitId", "diagnosisId", "clinicalEpisodeId", "patientId", "clinicScopeId", "action", "text", "decisionOrder", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'REVISE', 'attack', 99, clock_timestamp())`,
          randomUUID(), late.record.id, late.visit.id, decision.diagnosisId,
          episode.id, patient.id, scope.id,
        ),
      );
    });
  } finally {
    if (prisma) await prisma.$disconnect();
    await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.end();
  }
});
