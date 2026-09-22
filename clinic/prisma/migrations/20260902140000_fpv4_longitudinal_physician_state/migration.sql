-- CreateEnum
CREATE TYPE "PhysicianDiagnosisDecisionAction" AS ENUM ('ADD', 'REVISE', 'RESOLVE');

-- CreateEnum
CREATE TYPE "PhysicianTreatmentDecisionAction" AS ENUM ('START', 'CONTINUE_EXISTING', 'MODIFY', 'STOP');

-- CreateEnum
CREATE TYPE "PhysicianProcedureDecisionAction" AS ENUM ('PLAN', 'PERFORM', 'CANCEL_OR_DEFER');

-- CreateEnum
CREATE TYPE "PhysicianProcedureCode" AS ENUM ('PRP', 'MICRONEEDLING', 'HAIR_LASER', 'RED_LIGHT', 'MINOXIDIL_INJ', 'DUTASTERIDE_INJ', 'EXOSOME', 'CORTISONE_INJ', 'REGENERA', 'ACELL', 'HAIR_TRANSPLANT', 'OTHER');

-- CreateEnum
CREATE TYPE "PatientContextValueKind" AS ENUM ('SCALAR', 'STRUCTURED', 'LIST');

-- CreateEnum
CREATE TYPE "PatientContextSource" AS ENUM ('PATIENT_REPORTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_CONTEXT_REVIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_CONTEXT_RECONCILED';

-- CreateTable
CREATE TABLE "PhysicianDiagnosis" (
    "id" UUID NOT NULL,
    "clinicalEpisodeId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicScopeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysicianDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicianDiagnosisDecision" (
    "id" UUID NOT NULL,
    "physicianVisitRecordId" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "diagnosisId" UUID NOT NULL,
    "clinicalEpisodeId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicScopeId" UUID NOT NULL,
    "action" "PhysicianDiagnosisDecisionAction" NOT NULL,
    "text" TEXT,
    "decisionOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicianDiagnosisDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicianTreatmentCourse" (
    "id" UUID NOT NULL,
    "clinicalEpisodeId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicScopeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysicianTreatmentCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicianTreatmentDecision" (
    "id" UUID NOT NULL,
    "physicianVisitRecordId" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "treatmentCourseId" UUID NOT NULL,
    "clinicalEpisodeId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicScopeId" UUID NOT NULL,
    "action" "PhysicianTreatmentDecisionAction" NOT NULL,
    "name" TEXT,
    "regimenText" TEXT,
    "noteText" TEXT,
    "setsName" BOOLEAN NOT NULL DEFAULT false,
    "setsRegimen" BOOLEAN NOT NULL DEFAULT false,
    "setsNote" BOOLEAN NOT NULL DEFAULT false,
    "decisionOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicianTreatmentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicianProcedurePlan" (
    "id" UUID NOT NULL,
    "clinicalEpisodeId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicScopeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysicianProcedurePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicianProcedureDecision" (
    "id" UUID NOT NULL,
    "physicianVisitRecordId" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "procedurePlanId" UUID,
    "clinicalEpisodeId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicScopeId" UUID NOT NULL,
    "action" "PhysicianProcedureDecisionAction" NOT NULL,
    "procedureCode" "PhysicianProcedureCode",
    "otherProcedureText" TEXT,
    "plannedDate" DATE,
    "performedDate" DATE,
    "noteText" TEXT,
    "decisionOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicianProcedureDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientContextDefinition" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "valueKind" "PatientContextValueKind" NOT NULL,
    "payloadSchemaVersion" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientContextDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientContextVersion" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "sourceVisitId" UUID NOT NULL,
    "sourceClinicalInterviewId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientContextVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientContextItem" (
    "id" UUID NOT NULL,
    "contextVersionId" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "sourceType" "PatientContextSource" NOT NULL DEFAULT 'PATIENT_REPORTED',
    "payloadJson" JSONB NOT NULL,
    "itemFingerprint" VARCHAR(64) NOT NULL,
    "sourceQuestionCodes" TEXT[],
    "sourceVisitId" UUID NOT NULL,
    "sourceClinicalInterviewId" UUID NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientContextItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientContextReview" (
    "id" UUID NOT NULL,
    "contextVersionId" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "physicianUserId" UUID NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientContextReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientContextReconciliation" (
    "id" UUID NOT NULL,
    "contextVersionId" UUID NOT NULL,
    "contextItemId" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "physicianUserId" UUID NOT NULL,
    "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientContextReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PD_episode_idx" ON "PhysicianDiagnosis"("clinicalEpisodeId");

-- CreateIndex
CREATE INDEX "PD_patient_idx" ON "PhysicianDiagnosis"("patientId");

-- CreateIndex
CREATE INDEX "PD_clinic_idx" ON "PhysicianDiagnosis"("clinicScopeId");

-- CreateIndex
CREATE UNIQUE INDEX "PD_owner_key" ON "PhysicianDiagnosis"("id", "clinicalEpisodeId", "patientId", "clinicScopeId");

-- CreateIndex
CREATE INDEX "PDD_visit_idx" ON "PhysicianDiagnosisDecision"("visitId");

-- CreateIndex
CREATE INDEX "PDD_diagnosis_idx" ON "PhysicianDiagnosisDecision"("diagnosisId");

-- CreateIndex
CREATE INDEX "PDD_episode_idx" ON "PhysicianDiagnosisDecision"("clinicalEpisodeId");

-- CreateIndex
CREATE UNIQUE INDEX "PDD_pvr_order_key" ON "PhysicianDiagnosisDecision"("physicianVisitRecordId", "decisionOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PDD_pvr_diagnosis_key" ON "PhysicianDiagnosisDecision"("physicianVisitRecordId", "diagnosisId");

-- CreateIndex
CREATE INDEX "PTC_episode_idx" ON "PhysicianTreatmentCourse"("clinicalEpisodeId");

-- CreateIndex
CREATE INDEX "PTC_patient_idx" ON "PhysicianTreatmentCourse"("patientId");

-- CreateIndex
CREATE INDEX "PTC_clinic_idx" ON "PhysicianTreatmentCourse"("clinicScopeId");

-- CreateIndex
CREATE UNIQUE INDEX "PTC_owner_key" ON "PhysicianTreatmentCourse"("id", "clinicalEpisodeId", "patientId", "clinicScopeId");

-- CreateIndex
CREATE INDEX "PTD_visit_idx" ON "PhysicianTreatmentDecision"("visitId");

-- CreateIndex
CREATE INDEX "PTD_course_idx" ON "PhysicianTreatmentDecision"("treatmentCourseId");

-- CreateIndex
CREATE INDEX "PTD_episode_idx" ON "PhysicianTreatmentDecision"("clinicalEpisodeId");

-- CreateIndex
CREATE UNIQUE INDEX "PTD_pvr_order_key" ON "PhysicianTreatmentDecision"("physicianVisitRecordId", "decisionOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PTD_pvr_course_key" ON "PhysicianTreatmentDecision"("physicianVisitRecordId", "treatmentCourseId");

-- CreateIndex
CREATE INDEX "PPP_episode_idx" ON "PhysicianProcedurePlan"("clinicalEpisodeId");

-- CreateIndex
CREATE INDEX "PPP_patient_idx" ON "PhysicianProcedurePlan"("patientId");

-- CreateIndex
CREATE INDEX "PPP_clinic_idx" ON "PhysicianProcedurePlan"("clinicScopeId");

-- CreateIndex
CREATE UNIQUE INDEX "PPP_owner_key" ON "PhysicianProcedurePlan"("id", "clinicalEpisodeId", "patientId", "clinicScopeId");

-- CreateIndex
CREATE INDEX "PPD_visit_idx" ON "PhysicianProcedureDecision"("visitId");

-- CreateIndex
CREATE INDEX "PPD_plan_idx" ON "PhysicianProcedureDecision"("procedurePlanId");

-- CreateIndex
CREATE INDEX "PPD_episode_idx" ON "PhysicianProcedureDecision"("clinicalEpisodeId");

-- CreateIndex
CREATE UNIQUE INDEX "PPD_pvr_order_key" ON "PhysicianProcedureDecision"("physicianVisitRecordId", "decisionOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PPD_pvr_plan_key" ON "PhysicianProcedureDecision"("physicianVisitRecordId", "procedurePlanId");

-- CreateIndex
CREATE UNIQUE INDEX "PCD_code_key" ON "PatientContextDefinition"("code");

-- CreateIndex
CREATE INDEX "PCD_active_idx" ON "PatientContextDefinition"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PCV_source_interview_key" ON "PatientContextVersion"("sourceClinicalInterviewId");

-- CreateIndex
CREATE INDEX "PCV_patient_created_idx" ON "PatientContextVersion"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PCV_patient_sequence_key" ON "PatientContextVersion"("patientId", "sequence");

-- CreateIndex
CREATE INDEX "PCV_patient_fingerprint_idx" ON "PatientContextVersion"("patientId", "fingerprint");

-- CreateIndex
CREATE INDEX "PCI_definition_idx" ON "PatientContextItem"("definitionId");

-- CreateIndex
CREATE INDEX "PCI_source_visit_idx" ON "PatientContextItem"("sourceVisitId");

-- CreateIndex
CREATE UNIQUE INDEX "PCI_version_definition_key" ON "PatientContextItem"("contextVersionId", "definitionId");

-- CreateIndex
CREATE INDEX "PCR_version_reviewed_idx" ON "PatientContextReview"("contextVersionId", "reviewedAt");

-- CreateIndex
CREATE INDEX "PCR_visit_idx" ON "PatientContextReview"("visitId");

-- CreateIndex
CREATE INDEX "PCRN_version_reconciled_idx" ON "PatientContextReconciliation"("contextVersionId", "reconciledAt");

-- CreateIndex
CREATE INDEX "PCRN_item_idx" ON "PatientContextReconciliation"("contextItemId");

-- CreateIndex
CREATE INDEX "PCRN_visit_idx" ON "PatientContextReconciliation"("visitId");

-- AddForeignKey
ALTER TABLE "PhysicianDiagnosis" ADD CONSTRAINT "PD_episode_fk" FOREIGN KEY ("clinicalEpisodeId") REFERENCES "ClinicalEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianDiagnosis" ADD CONSTRAINT "PD_patient_fk" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianDiagnosis" ADD CONSTRAINT "PD_clinic_fk" FOREIGN KEY ("clinicScopeId") REFERENCES "ClinicScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianDiagnosisDecision" ADD CONSTRAINT "PDD_pvr_fk" FOREIGN KEY ("physicianVisitRecordId") REFERENCES "PhysicianVisitRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianDiagnosisDecision" ADD CONSTRAINT "PDD_visit_fk" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianDiagnosisDecision" ADD CONSTRAINT "PDD_diagnosis_owner_fk" FOREIGN KEY ("diagnosisId", "clinicalEpisodeId", "patientId", "clinicScopeId") REFERENCES "PhysicianDiagnosis"("id", "clinicalEpisodeId", "patientId", "clinicScopeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianTreatmentCourse" ADD CONSTRAINT "PTC_episode_fk" FOREIGN KEY ("clinicalEpisodeId") REFERENCES "ClinicalEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianTreatmentCourse" ADD CONSTRAINT "PTC_patient_fk" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianTreatmentCourse" ADD CONSTRAINT "PTC_clinic_fk" FOREIGN KEY ("clinicScopeId") REFERENCES "ClinicScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianTreatmentDecision" ADD CONSTRAINT "PTD_pvr_fk" FOREIGN KEY ("physicianVisitRecordId") REFERENCES "PhysicianVisitRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianTreatmentDecision" ADD CONSTRAINT "PTD_visit_fk" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianTreatmentDecision" ADD CONSTRAINT "PTD_course_owner_fk" FOREIGN KEY ("treatmentCourseId", "clinicalEpisodeId", "patientId", "clinicScopeId") REFERENCES "PhysicianTreatmentCourse"("id", "clinicalEpisodeId", "patientId", "clinicScopeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianProcedurePlan" ADD CONSTRAINT "PPP_episode_fk" FOREIGN KEY ("clinicalEpisodeId") REFERENCES "ClinicalEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianProcedurePlan" ADD CONSTRAINT "PPP_patient_fk" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianProcedurePlan" ADD CONSTRAINT "PPP_clinic_fk" FOREIGN KEY ("clinicScopeId") REFERENCES "ClinicScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianProcedureDecision" ADD CONSTRAINT "PPD_pvr_fk" FOREIGN KEY ("physicianVisitRecordId") REFERENCES "PhysicianVisitRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianProcedureDecision" ADD CONSTRAINT "PPD_visit_fk" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianProcedureDecision" ADD CONSTRAINT "PPD_plan_owner_fk" FOREIGN KEY ("procedurePlanId", "clinicalEpisodeId", "patientId", "clinicScopeId") REFERENCES "PhysicianProcedurePlan"("id", "clinicalEpisodeId", "patientId", "clinicScopeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextVersion" ADD CONSTRAINT "PCV_patient_fk" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextVersion" ADD CONSTRAINT "PCV_source_visit_fk" FOREIGN KEY ("sourceVisitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextVersion" ADD CONSTRAINT "PCV_source_interview_fk" FOREIGN KEY ("sourceClinicalInterviewId") REFERENCES "ClinicalInterview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextItem" ADD CONSTRAINT "PCI_version_fk" FOREIGN KEY ("contextVersionId") REFERENCES "PatientContextVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextItem" ADD CONSTRAINT "PCI_definition_fk" FOREIGN KEY ("definitionId") REFERENCES "PatientContextDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextItem" ADD CONSTRAINT "PCI_source_visit_fk" FOREIGN KEY ("sourceVisitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextItem" ADD CONSTRAINT "PCI_source_interview_fk" FOREIGN KEY ("sourceClinicalInterviewId") REFERENCES "ClinicalInterview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextReview" ADD CONSTRAINT "PCR_version_fk" FOREIGN KEY ("contextVersionId") REFERENCES "PatientContextVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextReview" ADD CONSTRAINT "PCR_visit_fk" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextReview" ADD CONSTRAINT "PCR_physician_fk" FOREIGN KEY ("physicianUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextReconciliation" ADD CONSTRAINT "PCRN_version_fk" FOREIGN KEY ("contextVersionId") REFERENCES "PatientContextVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextReconciliation" ADD CONSTRAINT "PCRN_item_fk" FOREIGN KEY ("contextItemId") REFERENCES "PatientContextItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextReconciliation" ADD CONSTRAINT "PCRN_visit_fk" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContextReconciliation" ADD CONSTRAINT "PCRN_physician_fk" FOREIGN KEY ("physicianUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Governed FPV-4 registry. These rows define validation contracts; they are
-- not patient data and do not backfill any physician clinical truth.
INSERT INTO "PatientContextDefinition"
  ("id", "code", "valueKind", "payloadSchemaVersion", "isActive")
VALUES
  ('40000000-0000-4000-8000-000000000001', 'MARITAL_SOCIAL_STATUS', 'SCALAR', 'FPV4_PATIENT_CONTEXT_V1', true),
  ('40000000-0000-4000-8000-000000000002', 'CONTRACEPTIVE_USE', 'STRUCTURED', 'FPV4_PATIENT_CONTEXT_V1', true),
  ('40000000-0000-4000-8000-000000000003', 'PREGNANCY_BREASTFEEDING_CONTEXT', 'STRUCTURED', 'FPV4_PATIENT_CONTEXT_V1', true),
  ('40000000-0000-4000-8000-000000000004', 'PREVIOUSLY_DIAGNOSED_CONDITIONS', 'LIST', 'FPV4_PATIENT_CONTEXT_V1', true),
  ('40000000-0000-4000-8000-000000000005', 'CURRENT_MEDICATIONS', 'LIST', 'FPV4_PATIENT_CONTEXT_V1', true),
  ('40000000-0000-4000-8000-000000000006', 'ALLERGIES', 'LIST', 'FPV4_PATIENT_CONTEXT_V1', true),
  ('40000000-0000-4000-8000-000000000007', 'PREVIOUS_HAIR_THERAPIES', 'LIST', 'FPV4_PATIENT_CONTEXT_V1', true),
  ('40000000-0000-4000-8000-000000000008', 'CURRENT_HAIR_THERAPIES', 'LIST', 'FPV4_PATIENT_CONTEXT_V1', true);

ALTER TABLE "PhysicianDiagnosisDecision"
  ADD CONSTRAINT "PDD_action_content_check" CHECK (
    ("action" IN ('ADD', 'REVISE') AND "text" IS NOT NULL
      AND length("text") <= 16000 AND btrim("text", E' \t\n\r') <> '')
    OR ("action" = 'RESOLVE' AND "text" IS NULL)
  );

ALTER TABLE "PhysicianTreatmentDecision"
  ADD CONSTRAINT "PTD_action_content_check" CHECK (
    ("action" = 'START' AND "setsName" AND "name" IS NOT NULL)
    OR ("action" = 'MODIFY' AND ("setsName" OR "setsRegimen" OR "setsNote"))
    OR ("action" = 'CONTINUE_EXISTING' AND NOT "setsName" AND NOT "setsRegimen")
    OR ("action" = 'STOP' AND NOT "setsName" AND NOT "setsRegimen" AND NOT "setsNote")
  ),
  ADD CONSTRAINT "PTD_name_check" CHECK (
    NOT "setsName" OR ("name" IS NOT NULL AND length("name") <= 16000 AND btrim("name", E' \t\n\r') <> '')
  ),
  ADD CONSTRAINT "PTD_regimen_check" CHECK (
    "regimenText" IS NULL OR (length("regimenText") <= 16000 AND btrim("regimenText", E' \t\n\r') <> '')
  ),
  ADD CONSTRAINT "PTD_note_check" CHECK (
    "noteText" IS NULL OR (length("noteText") <= 16000 AND btrim("noteText", E' \t\n\r') <> '')
  );

ALTER TABLE "PhysicianProcedureDecision"
  ADD CONSTRAINT "PPD_action_content_check" CHECK (
    ("action" = 'PLAN' AND "procedurePlanId" IS NOT NULL AND "procedureCode" IS NOT NULL
      AND "performedDate" IS NULL)
    OR ("action" = 'PERFORM' AND "procedureCode" IS NOT NULL
      AND "performedDate" IS NOT NULL AND "plannedDate" IS NULL)
    OR ("action" = 'CANCEL_OR_DEFER' AND "procedurePlanId" IS NOT NULL
      AND "procedureCode" IS NULL AND "plannedDate" IS NULL AND "performedDate" IS NULL
      AND "otherProcedureText" IS NULL)
  ),
  ADD CONSTRAINT "PPD_other_check" CHECK (
    ("procedureCode" = 'OTHER' AND "otherProcedureText" IS NOT NULL
      AND length("otherProcedureText") <= 16000
      AND btrim("otherProcedureText", E' \t\n\r') <> '')
    OR ("procedureCode" IS DISTINCT FROM 'OTHER' AND "otherProcedureText" IS NULL)
  ),
  ADD CONSTRAINT "PPD_note_check" CHECK (
    "noteText" IS NULL OR (length("noteText") <= 16000 AND btrim("noteText", E' \t\n\r') <> '')
  );

ALTER TABLE "PatientContextVersion"
  ADD CONSTRAINT "PCV_sequence_check" CHECK ("sequence" > 0),
  ADD CONSTRAINT "PCV_fingerprint_check" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$');

ALTER TABLE "PatientContextItem"
  ADD CONSTRAINT "PCI_fingerprint_check" CHECK ("itemFingerprint" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "PCI_payload_object_check" CHECK (jsonb_typeof("payloadJson") = 'object'),
  ADD CONSTRAINT "PCI_source_codes_check" CHECK (
    cardinality("sourceQuestionCodes") > 0
    AND array_position("sourceQuestionCodes", NULL) IS NULL
  );

-- Verify that every longitudinal identity and decision repeats the authoritative
-- Episode/Patient/Clinic/Visit ownership. This also blocks direct-SQL attacks
-- that try to pair a decision with an unrelated PhysicianVisitRecord.
CREATE FUNCTION "fpv4_validate_longitudinal_ownership"()
RETURNS TRIGGER AS $$
DECLARE
  episode_patient UUID;
  episode_clinic UUID;
  visit_patient UUID;
  visit_clinic UUID;
  visit_episode UUID;
  pvr_visit UUID;
BEGIN
  IF TG_TABLE_NAME IN ('PhysicianDiagnosis', 'PhysicianTreatmentCourse', 'PhysicianProcedurePlan') THEN
    EXECUTE format(
      'SELECT "patientId", "clinicScopeId" FROM %I."ClinicalEpisode" WHERE "id" = $1',
      TG_TABLE_SCHEMA
    ) INTO episode_patient, episode_clinic USING NEW."clinicalEpisodeId";
    IF episode_patient IS DISTINCT FROM NEW."patientId"
       OR episode_clinic IS DISTINCT FROM NEW."clinicScopeId" THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'FPV-4 integrity: longitudinal identity ownership mismatch';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'PhysicianProcedureDecision'
     AND to_jsonb(NEW)->>'action' = 'PERFORM'
     AND (to_jsonb(NEW)->>'performedDate')::date > clock_timestamp()::date THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'FPV-4 integrity: performed procedure date cannot be in the future';
  END IF;

  EXECUTE format(
    'SELECT v."patientId", v."clinicScopeId", v."clinicalEpisodeId", pvr."visitId"
       FROM %I."Visit" v
       JOIN %I."PhysicianVisitRecord" pvr ON pvr."id" = $2
      WHERE v."id" = $1',
    TG_TABLE_SCHEMA, TG_TABLE_SCHEMA
  ) INTO visit_patient, visit_clinic, visit_episode, pvr_visit
  USING NEW."visitId", NEW."physicianVisitRecordId";
  IF pvr_visit IS DISTINCT FROM NEW."visitId"
     OR visit_patient IS DISTINCT FROM NEW."patientId"
     OR visit_clinic IS DISTINCT FROM NEW."clinicScopeId"
     OR visit_episode IS DISTINCT FROM NEW."clinicalEpisodeId" THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'FPV-4 integrity: longitudinal decision ownership mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PD_owner_check" BEFORE INSERT OR UPDATE ON "PhysicianDiagnosis"
FOR EACH ROW EXECUTE FUNCTION "fpv4_validate_longitudinal_ownership"();
CREATE TRIGGER "PTC_owner_check" BEFORE INSERT OR UPDATE ON "PhysicianTreatmentCourse"
FOR EACH ROW EXECUTE FUNCTION "fpv4_validate_longitudinal_ownership"();
CREATE TRIGGER "PPP_owner_check" BEFORE INSERT OR UPDATE ON "PhysicianProcedurePlan"
FOR EACH ROW EXECUTE FUNCTION "fpv4_validate_longitudinal_ownership"();
CREATE TRIGGER "PDD_owner_check" BEFORE INSERT OR UPDATE ON "PhysicianDiagnosisDecision"
FOR EACH ROW EXECUTE FUNCTION "fpv4_validate_longitudinal_ownership"();
CREATE TRIGGER "PTD_owner_check" BEFORE INSERT OR UPDATE ON "PhysicianTreatmentDecision"
FOR EACH ROW EXECUTE FUNCTION "fpv4_validate_longitudinal_ownership"();
CREATE TRIGGER "PPD_owner_check" BEFORE INSERT OR UPDATE ON "PhysicianProcedureDecision"
FOR EACH ROW EXECUTE FUNCTION "fpv4_validate_longitudinal_ownership"();

CREATE FUNCTION "fpv4_preserve_decision_identity"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."action" IS DISTINCT FROM OLD."action"
     OR NEW."visitId" IS DISTINCT FROM OLD."visitId"
     OR NEW."clinicalEpisodeId" IS DISTINCT FROM OLD."clinicalEpisodeId"
     OR NEW."patientId" IS DISTINCT FROM OLD."patientId"
     OR NEW."clinicScopeId" IS DISTINCT FROM OLD."clinicScopeId"
     OR (TG_TABLE_NAME = 'PhysicianDiagnosisDecision'
       AND to_jsonb(NEW)->>'diagnosisId' IS DISTINCT FROM to_jsonb(OLD)->>'diagnosisId')
     OR (TG_TABLE_NAME = 'PhysicianTreatmentDecision'
       AND to_jsonb(NEW)->>'treatmentCourseId' IS DISTINCT FROM to_jsonb(OLD)->>'treatmentCourseId')
     OR (TG_TABLE_NAME = 'PhysicianProcedureDecision'
       AND to_jsonb(NEW)->>'procedurePlanId' IS DISTINCT FROM to_jsonb(OLD)->>'procedurePlanId') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'FPV-4 integrity: decision action and longitudinal identity are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PDD_identity_lock" BEFORE UPDATE ON "PhysicianDiagnosisDecision"
FOR EACH ROW EXECUTE FUNCTION "fpv4_preserve_decision_identity"();
CREATE TRIGGER "PTD_identity_lock" BEFORE UPDATE ON "PhysicianTreatmentDecision"
FOR EACH ROW EXECUTE FUNCTION "fpv4_preserve_decision_identity"();
CREATE TRIGGER "PPD_identity_lock" BEFORE UPDATE ON "PhysicianProcedureDecision"
FOR EACH ROW EXECUTE FUNCTION "fpv4_preserve_decision_identity"();

-- Reuse the accepted lifecycle hard-lock and deferred finalized-owner functions.
CREATE TRIGGER "PDD_correction_window"
BEFORE INSERT OR UPDATE OR DELETE ON "PhysicianDiagnosisDecision"
FOR EACH ROW EXECUTE FUNCTION "fpv3_enforce_canonical_correction_window"();
CREATE TRIGGER "PTD_correction_window"
BEFORE INSERT OR UPDATE OR DELETE ON "PhysicianTreatmentDecision"
FOR EACH ROW EXECUTE FUNCTION "fpv3_enforce_canonical_correction_window"();
CREATE TRIGGER "PPD_correction_window"
BEFORE INSERT OR UPDATE OR DELETE ON "PhysicianProcedureDecision"
FOR EACH ROW EXECUTE FUNCTION "fpv3_enforce_canonical_correction_window"();

CREATE CONSTRAINT TRIGGER "PDD_finalized_owner"
AFTER INSERT ON "PhysicianDiagnosisDecision" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_require_finalized_canonical_owner"();
CREATE CONSTRAINT TRIGGER "PTD_finalized_owner"
AFTER INSERT ON "PhysicianTreatmentDecision" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_require_finalized_canonical_owner"();
CREATE CONSTRAINT TRIGGER "PPD_finalized_owner"
AFTER INSERT ON "PhysicianProcedureDecision" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_require_finalized_canonical_owner"();

CREATE FUNCTION "fpv4_reject_append_only_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001',
    MESSAGE = 'FPV-4 integrity: Patient Context historical evidence is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PCV_append_only" BEFORE UPDATE OR DELETE ON "PatientContextVersion"
FOR EACH ROW EXECUTE FUNCTION "fpv4_reject_append_only_mutation"();
CREATE TRIGGER "PCI_append_only" BEFORE UPDATE OR DELETE ON "PatientContextItem"
FOR EACH ROW EXECUTE FUNCTION "fpv4_reject_append_only_mutation"();
CREATE TRIGGER "PCR_append_only" BEFORE UPDATE OR DELETE ON "PatientContextReview"
FOR EACH ROW EXECUTE FUNCTION "fpv4_reject_append_only_mutation"();
CREATE TRIGGER "PCRN_append_only" BEFORE UPDATE OR DELETE ON "PatientContextReconciliation"
FOR EACH ROW EXECUTE FUNCTION "fpv4_reject_append_only_mutation"();

CREATE FUNCTION "fpv4_validate_context_evidence"()
RETURNS TRIGGER AS $$
DECLARE
  context_patient UUID;
  visit_patient UUID;
  visit_clinic UUID;
  physician_role TEXT;
  item_version UUID;
BEGIN
  EXECUTE format(
    'SELECT pcv."patientId", v."patientId", v."clinicScopeId"
       FROM %I."PatientContextVersion" pcv
       JOIN %I."Visit" v ON v."id" = $2
      WHERE pcv."id" = $1',
    TG_TABLE_SCHEMA, TG_TABLE_SCHEMA
  ) INTO context_patient, visit_patient, visit_clinic
  USING NEW."contextVersionId", NEW."visitId";
  IF context_patient IS DISTINCT FROM visit_patient THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'FPV-4 integrity: Patient Context evidence patient mismatch';
  END IF;
  EXECUTE format(
    'SELECT r."code"
       FROM %I."User" u
       JOIN %I."Role" r ON r."id" = u."roleId"
      WHERE u."id" = $1 AND u."isActive"',
    TG_TABLE_SCHEMA, TG_TABLE_SCHEMA
  ) INTO physician_role USING NEW."physicianUserId";
  IF physician_role IS DISTINCT FROM 'PHYSICIAN' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'FPV-4 integrity: Patient Context evidence requires an active physician';
  END IF;
  IF TG_TABLE_NAME = 'PatientContextReconciliation' THEN
    EXECUTE format(
      'SELECT "contextVersionId" FROM %I."PatientContextItem" WHERE "id" = $1',
      TG_TABLE_SCHEMA
    ) INTO item_version USING NEW."contextItemId";
    IF item_version IS DISTINCT FROM NEW."contextVersionId" THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'FPV-4 integrity: reconciliation item/version mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PCR_evidence_check" BEFORE INSERT ON "PatientContextReview"
FOR EACH ROW EXECUTE FUNCTION "fpv4_validate_context_evidence"();
CREATE TRIGGER "PCRN_evidence_check" BEFORE INSERT ON "PatientContextReconciliation"
FOR EACH ROW EXECUTE FUNCTION "fpv4_validate_context_evidence"();
