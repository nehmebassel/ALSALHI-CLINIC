-- P00.1 Repository Foundation Alignment
-- Technical-only migration. It adds no clinical question content.

CREATE TYPE "ExternalIdentifierType" AS ENUM ('CLINIC_MRN');
CREATE TYPE "MaritalStatus" AS ENUM ('MARRIED', 'NOT_MARRIED');
CREATE TYPE "ClinicDeviceStatus" AS ENUM ('APPROVED', 'REVOKED');
CREATE TYPE "PatientSessionStatus" AS ENUM ('ACTIVE', 'LOCKED', 'EXPIRED', 'CLOSED');
CREATE TYPE "PatientSessionCloseReason" AS ENUM ('CANCELLED', 'SUBMITTED');
CREATE TYPE "QuestionResponseType" AS ENUM (
  'BOOLEAN',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'INTEGER',
  'DATE',
  'MONTH_YEAR',
  'YEAR',
  'SCALE'
);
CREATE TYPE "ResponseScopeType" AS ENUM (
  'VISIT',
  'PATHWAY',
  'MODULE',
  'PROCEDURE_SELECTION',
  'LASER_SERVICE_SELECTION',
  'MEDICATION_ITEM',
  'CONDITION_ITEM',
  'SYMPTOM_ITEM',
  'EVENT_ITEM',
  'BODY_AREA',
  'VISUAL_CLASSIFICATION'
);
CREATE TYPE "QuestionDefinitionStatus" AS ENUM ('APPROVED', 'DRAFT', 'RETIRED', 'ARCHIVE_ONLY');
CREATE TYPE "RuleEvaluationState" AS ENUM ('TRUE', 'FALSE', 'UNKNOWN', 'PENDING', 'CONFIGURATION_ERROR');

ALTER TYPE "ActivationSourceType" ADD VALUE 'VISIT_REASON';
ALTER TYPE "ActivationSourceType" ADD VALUE 'PROCEDURE_SELECTION';
ALTER TYPE "ActivationSourceType" ADD VALUE 'LASER_SERVICE_SELECTION';
ALTER TYPE "ActivationSourceType" ADD VALUE 'PHYSICIAN_REVIEW_REQUIREMENT';

ALTER TYPE "AuditAction" ADD VALUE 'SUBMIT';
ALTER TYPE "AuditAction" ADD VALUE 'CANCEL';
ALTER TYPE "AuditAction" ADD VALUE 'EXPIRE';
ALTER TYPE "AuditAction" ADD VALUE 'REACTIVATE';
ALTER TYPE "AuditAction" ADD VALUE 'ACCESS_DENIED';

ALTER TYPE "DraftInterviewStatus" ADD VALUE 'CANCELLED';

CREATE TABLE "ClinicScope" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicScope_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicScope_code_key" ON "ClinicScope"("code");

INSERT INTO "ClinicScope" (
  "id",
  "code",
  "nameAr",
  "nameEn",
  "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'PILOT0',
  'نطاق العيادة التجريبي',
  'Pilot 0 Clinic Scope',
  CURRENT_TIMESTAMP
);

CREATE TABLE "ClinicDevice" (
  "id" UUID NOT NULL,
  "clinicScopeId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "certificateFingerprintHash" TEXT NOT NULL,
  "status" "ClinicDeviceStatus" NOT NULL DEFAULT 'APPROVED',
  "approvedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicDevice_certificateFingerprintHash_key"
  ON "ClinicDevice"("certificateFingerprintHash");
CREATE INDEX "ClinicDevice_clinicScopeId_status_idx"
  ON "ClinicDevice"("clinicScopeId", "status");

CREATE TABLE "AuthenticatedUserSession" (
  "id" UUID NOT NULL,
  "sessionTokenHash" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "clinicScopeId" UUID NOT NULL,
  "clinicDeviceId" UUID,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthenticatedUserSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthenticatedUserSession_sessionTokenHash_key"
  ON "AuthenticatedUserSession"("sessionTokenHash");
CREATE INDEX "AuthenticatedUserSession_userId_expiresAt_idx"
  ON "AuthenticatedUserSession"("userId", "expiresAt");
CREATE INDEX "AuthenticatedUserSession_clinicScopeId_idx"
  ON "AuthenticatedUserSession"("clinicScopeId");
CREATE INDEX "AuthenticatedUserSession_clinicDeviceId_idx"
  ON "AuthenticatedUserSession"("clinicDeviceId");

CREATE TABLE "ExternalPatientIdentifier" (
  "id" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "clinicScopeId" UUID NOT NULL,
  "identifierType" "ExternalIdentifierType" NOT NULL DEFAULT 'CLINIC_MRN',
  "normalizedValue" TEXT NOT NULL,
  "displayValue" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalPatientIdentifier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExternalPatientIdentifier_normalizedValue_nonblank"
    CHECK (length(btrim("normalizedValue")) > 0)
);

CREATE INDEX "ExternalPatientIdentifier_patientId_idx"
  ON "ExternalPatientIdentifier"("patientId");
CREATE UNIQUE INDEX "ExternalPatientIdentifier_clinicScopeId_identifierType_norm_key"
  ON "ExternalPatientIdentifier"("clinicScopeId", "identifierType", "normalizedValue");

ALTER TABLE "InterviewInvitation"
  ADD COLUMN "clinicScopeId" UUID,
  ADD COLUMN "temporaryMrnDisplayValue" TEXT,
  ADD COLUMN "temporaryMrnNormalizedValue" TEXT;

UPDATE "InterviewInvitation"
SET "clinicScopeId" = '00000000-0000-4000-8000-000000000001'
WHERE "clinicScopeId" IS NULL;

ALTER TABLE "InterviewInvitation"
  ALTER COLUMN "clinicScopeId" SET NOT NULL;

CREATE INDEX "InterviewInvitation_clinicScopeId_temporaryMrnNormalizedVal_idx"
  ON "InterviewInvitation"("clinicScopeId", "temporaryMrnNormalizedValue");

ALTER TABLE "PatientAccessSession"
  ADD COLUMN "status" "PatientSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "closeReason" "PatientSessionCloseReason",
  ADD COLUMN "lastActivityAt" TIMESTAMP(3),
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "expiredAt" TIMESTAMP(3);

UPDATE "PatientAccessSession"
SET "lastActivityAt" = "updatedAt"
WHERE "lastActivityAt" IS NULL;

ALTER TABLE "PatientAccessSession"
  ALTER COLUMN "lastActivityAt" SET NOT NULL,
  ALTER COLUMN "lastActivityAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "PatientAccessSession"
  ADD CONSTRAINT "PatientAccessSession_closed_state_consistent"
  CHECK (
    "status" <> 'CLOSED'
    OR ("closedAt" IS NOT NULL AND "closeReason" IS NOT NULL)
  ),
  ADD CONSTRAINT "PatientAccessSession_expired_state_consistent"
  CHECK (
    "status" <> 'EXPIRED'
    OR "expiredAt" IS NOT NULL
  );

ALTER TABLE "DraftClinicalInterview"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "purgeAfter" TIMESTAMP(3),
  ADD COLUMN "purgedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PatientProfile") THEN
    RAISE EXCEPTION
      'FOUNDATION_ALIGNMENT_BLOCKED: existing PatientProfile rows need an explicit approved profile-field migration';
  END IF;

  IF EXISTS (SELECT 1 FROM "QuestionDefinition") THEN
    RAISE EXCEPTION
      'FOUNDATION_ALIGNMENT_BLOCKED: existing QuestionDefinition rows need an explicit approved-contract migration; P00.1 will not invent registry fields';
  END IF;

  IF EXISTS (SELECT 1 FROM "QuestionInstance") THEN
    RAISE EXCEPTION
      'FOUNDATION_ALIGNMENT_BLOCKED: existing QuestionInstance rows need an explicit Response Scope mapping';
  END IF;

  IF EXISTS (SELECT 1 FROM "RoutingEvaluation") THEN
    RAISE EXCEPTION
      'FOUNDATION_ALIGNMENT_BLOCKED: existing RoutingEvaluation rows need an explicit result-state mapping';
  END IF;

  IF EXISTS (
    SELECT "visitId"
    FROM "VisitReason"
    WHERE "role" = 'PRIMARY'
    GROUP BY "visitId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'FOUNDATION_ALIGNMENT_BLOCKED: existing VisitReason rows contain more than one PRIMARY per Visit';
  END IF;
END
$$;

DROP INDEX "PatientProfile_maritalStatusCode_idx";

ALTER TABLE "PatientProfile"
  DROP COLUMN "firstName",
  DROP COLUMN "lastName",
  DROP COLUMN "maritalStatusCode",
  ADD COLUMN "fullName" TEXT NOT NULL,
  ADD COLUMN "maritalStatus" "MaritalStatus" NOT NULL,
  ALTER COLUMN "dateOfBirth" SET NOT NULL;

CREATE INDEX "PatientProfile_maritalStatus_idx"
  ON "PatientProfile"("maritalStatus");

ALTER TABLE "QuestionDefinition"
  ADD COLUMN "version" TEXT,
  ADD COLUMN "helpAr" TEXT,
  ADD COLUMN "helpEn" TEXT,
  ADD COLUMN "visibilityRule" JSONB,
  ADD COLUMN "requirednessRule" JSONB,
  ADD COLUMN "validationRule" JSONB,
  ADD COLUMN "responseScopePolicy" "ResponseScopeType",
  ADD COLUMN "dependencies" JSONB,
  ADD COLUMN "orderingKey" TEXT,
  ADD COLUMN "outputEligibility" JSONB,
  ADD COLUMN "provenanceBaseline" TEXT,
  ADD COLUMN "provenanceSourceFile" TEXT,
  ADD COLUMN "provenanceSourceSection" TEXT,
  ADD COLUMN "status" "QuestionDefinitionStatus" NOT NULL DEFAULT 'DRAFT';

ALTER TABLE "QuestionDefinition" DROP COLUMN "responseType";
ALTER TABLE "QuestionDefinition" ADD COLUMN "responseType" "QuestionResponseType";

ALTER TABLE "QuestionDefinition"
  ALTER COLUMN "version" SET NOT NULL,
  ALTER COLUMN "visibilityRule" SET NOT NULL,
  ALTER COLUMN "requirednessRule" SET NOT NULL,
  ALTER COLUMN "validationRule" SET NOT NULL,
  ALTER COLUMN "responseScopePolicy" SET NOT NULL,
  ALTER COLUMN "dependencies" SET NOT NULL,
  ALTER COLUMN "orderingKey" SET NOT NULL,
  ALTER COLUMN "outputEligibility" SET NOT NULL,
  ALTER COLUMN "provenanceBaseline" SET NOT NULL,
  ALTER COLUMN "provenanceSourceFile" SET NOT NULL,
  ALTER COLUMN "provenanceSourceSection" SET NOT NULL,
  ALTER COLUMN "responseType" SET NOT NULL;

CREATE INDEX "QuestionDefinition_status_idx" ON "QuestionDefinition"("status");

CREATE TABLE "QuestionOptionDefinition" (
  "id" UUID NOT NULL,
  "questionDefinitionId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "labelAr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "exclusiveWithCodes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionOptionDefinition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuestionOptionDefinition_questionDefinitionId_sortOrder_idx"
  ON "QuestionOptionDefinition"("questionDefinitionId", "sortOrder");
CREATE UNIQUE INDEX "QuestionOptionDefinition_questionDefinitionId_code_key"
  ON "QuestionOptionDefinition"("questionDefinitionId", "code");

DROP INDEX "QuestionInstance_clinicalInterviewId_questionDefinitionId_key";

ALTER TABLE "QuestionInstance"
  ADD COLUMN "responseScopeType" "ResponseScopeType",
  ADD COLUMN "responseScopeKey" TEXT;

ALTER TABLE "QuestionInstance"
  ALTER COLUMN "responseScopeType" SET NOT NULL,
  ALTER COLUMN "responseScopeKey" SET NOT NULL;

ALTER TABLE "QuestionInstance"
  ADD CONSTRAINT "QuestionInstance_responseScopeKey_nonblank"
  CHECK (length(btrim("responseScopeKey")) > 0);

CREATE UNIQUE INDEX "QuestionInstance_clinicalInterviewId_questionDefinitionId_r_key"
  ON "QuestionInstance"(
    "clinicalInterviewId",
    "questionDefinitionId",
    "responseScopeType",
    "responseScopeKey"
  );

CREATE TABLE "QuestionActivationSource" (
  "id" UUID NOT NULL,
  "questionInstanceId" UUID NOT NULL,
  "sourceType" "ActivationSourceType" NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionActivationSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuestionActivationSource_questionInstanceId_idx"
  ON "QuestionActivationSource"("questionInstanceId");
CREATE UNIQUE INDEX "QuestionActivationSource_questionInstanceId_sourceType_sour_key"
  ON "QuestionActivationSource"("questionInstanceId", "sourceType", "sourceKey");

ALTER TABLE "RoutingEvaluation"
  ADD COLUMN "resultState" "RuleEvaluationState";
ALTER TABLE "RoutingEvaluation"
  ALTER COLUMN "resultState" SET NOT NULL,
  ALTER COLUMN "resultJson" DROP NOT NULL;

CREATE UNIQUE INDEX "VisitReason_one_primary_per_visit"
  ON "VisitReason"("visitId")
  WHERE "role" = 'PRIMARY';

ALTER TABLE "ClinicDevice"
  ADD CONSTRAINT "ClinicDevice_clinicScopeId_fkey"
  FOREIGN KEY ("clinicScopeId") REFERENCES "ClinicScope"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuthenticatedUserSession"
  ADD CONSTRAINT "AuthenticatedUserSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuthenticatedUserSession"
  ADD CONSTRAINT "AuthenticatedUserSession_clinicScopeId_fkey"
  FOREIGN KEY ("clinicScopeId") REFERENCES "ClinicScope"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuthenticatedUserSession"
  ADD CONSTRAINT "AuthenticatedUserSession_clinicDeviceId_fkey"
  FOREIGN KEY ("clinicDeviceId") REFERENCES "ClinicDevice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExternalPatientIdentifier"
  ADD CONSTRAINT "ExternalPatientIdentifier_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExternalPatientIdentifier"
  ADD CONSTRAINT "ExternalPatientIdentifier_clinicScopeId_fkey"
  FOREIGN KEY ("clinicScopeId") REFERENCES "ClinicScope"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InterviewInvitation"
  ADD CONSTRAINT "InterviewInvitation_clinicScopeId_fkey"
  FOREIGN KEY ("clinicScopeId") REFERENCES "ClinicScope"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuestionOptionDefinition"
  ADD CONSTRAINT "QuestionOptionDefinition_questionDefinitionId_fkey"
  FOREIGN KEY ("questionDefinitionId") REFERENCES "QuestionDefinition"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuestionActivationSource"
  ADD CONSTRAINT "QuestionActivationSource_questionInstanceId_fkey"
  FOREIGN KEY ("questionInstanceId") REFERENCES "QuestionInstance"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
