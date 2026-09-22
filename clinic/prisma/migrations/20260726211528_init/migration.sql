-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ResponseSource" AS ENUM ('PATIENT', 'PHYSICIAN');

-- CreateEnum
CREATE TYPE "ClinicalDatePrecision" AS ENUM ('DAY', 'MONTH', 'YEAR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DraftInterviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('CREATED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('INITIAL', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "ClinicalInterviewStatus" AS ENUM ('UNDER_REVIEW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ActivationSourceType" AS ENUM ('SYSTEM', 'PATHWAY', 'RULE', 'ASSESSMENT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE');

-- CreateEnum
CREATE TYPE "MediaStorageProvider" AS ENUM ('LOCAL');

-- CreateEnum
CREATE TYPE "MediaCategory" AS ENUM ('BASELINE', 'FOLLOW_UP', 'PROCEDURE', 'OTHER');

-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('MEDICATION', 'PROCEDURE', 'LAB', 'DIAGNOSIS', 'TRIGGER', 'OTHER');

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" DATE,
    "maritalStatusCode" TEXT,
    "occupation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Condition" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "diagnosedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT,
    "frequency" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergy" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryProcedure" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurgeryProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewInvitation" (
    "id" UUID NOT NULL,
    "patientId" UUID,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "InterviewInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAccessSession" (
    "id" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientAccessSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftClinicalInterview" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "patientInputJson" JSONB NOT NULL,
    "status" "DraftInterviewStatus" NOT NULL DEFAULT 'DRAFT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftClinicalInterview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalService" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClinicalService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "clinicalServiceId" UUID NOT NULL,
    "sourceDraftId" UUID NOT NULL,
    "visitType" "VisitType" NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReasonForVisitDefinition" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "clinicalServiceId" UUID NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReasonForVisitDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitReason" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "reasonDefinitionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionalProcedureRequest" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "procedureCode" TEXT NOT NULL,
    "labelAr" TEXT,
    "labelEn" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptionalProcedureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalInterview" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "status" "ClinicalInterviewStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalInterview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" UUID NOT NULL,
    "versionCode" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalPathwayDefinition" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "clinicalServiceId" UUID NOT NULL,
    "contentVersionId" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClinicalPathwayDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentDefinition" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "clinicalServiceId" UUID NOT NULL,
    "contentVersionId" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AssessmentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalLibrary" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "contentVersionId" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClinicalLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionGroup" (
    "id" UUID NOT NULL,
    "clinicalLibraryId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "titleAr" TEXT,
    "titleEn" TEXT,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "QuestionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionDefinition" (
    "id" UUID NOT NULL,
    "clinicalLibraryId" UUID NOT NULL,
    "questionGroupId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "textAr" TEXT NOT NULL,
    "textEn" TEXT NOT NULL,
    "responseType" TEXT NOT NULL,
    "editableByPhysician" BOOLEAN NOT NULL DEFAULT true,
    "isDualPerspective" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "QuestionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivePathway" (
    "id" UUID NOT NULL,
    "clinicalInterviewId" UUID NOT NULL,
    "pathwayDefinitionId" UUID NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivePathway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentInstance" (
    "id" UUID NOT NULL,
    "clinicalInterviewId" UUID NOT NULL,
    "assessmentDefinitionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveLibrary" (
    "id" UUID NOT NULL,
    "clinicalInterviewId" UUID NOT NULL,
    "clinicalLibraryId" UUID NOT NULL,
    "activationSourceType" "ActivationSourceType" NOT NULL,
    "sourceActivePathwayId" UUID,
    "sourceRuleVersionId" UUID,
    "sourceAssessmentInstanceId" UUID,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionInstance" (
    "id" UUID NOT NULL,
    "clinicalInterviewId" UUID NOT NULL,
    "questionDefinitionId" UUID NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "becameInactiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" UUID NOT NULL,
    "questionInstanceId" UUID NOT NULL,
    "valueJson" JSONB NOT NULL,
    "currentSource" "ResponseSource" NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepeatableResponseItem" (
    "id" UUID NOT NULL,
    "responseId" UUID NOT NULL,
    "valueJson" JSONB NOT NULL,
    "approximateDate" DATE,
    "datePrecision" "ClinicalDatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepeatableResponseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DualPerspectiveAssessment" (
    "id" UUID NOT NULL,
    "questionInstanceId" UUID NOT NULL,
    "patientValueJson" JSONB,
    "physicianValueJson" JSONB,
    "effectiveValueJson" JSONB,
    "effectiveValueSource" TEXT,
    "assessedByUserId" UUID,
    "assessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DualPerspectiveAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleVersion" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "definitionJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingEvaluation" (
    "id" UUID NOT NULL,
    "clinicalInterviewId" UUID NOT NULL,
    "ruleVersionId" UUID NOT NULL,
    "resultJson" JSONB NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutputEligibilityEvaluation" (
    "id" UUID NOT NULL,
    "clinicalInterviewId" UUID NOT NULL,
    "ruleVersionId" UUID,
    "outputType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "eligible" BOOLEAN NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutputEligibilityEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" UUID NOT NULL,
    "clinicalInterviewId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" UUID,

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicianAssessment" (
    "id" UUID NOT NULL,
    "clinicalInterviewId" UUID NOT NULL,
    "responseId" UUID,
    "assessmentType" TEXT NOT NULL,
    "valueJson" JSONB,
    "note" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicianAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovedHairHistory" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "approvedByUserId" UUID NOT NULL,
    "approvedVisitId" UUID NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovedHairHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HairHistoryItem" (
    "id" UUID NOT NULL,
    "approvedHairHistoryId" UUID NOT NULL,
    "itemType" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "approximateDate" DATE,
    "datePrecision" "ClinicalDatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HairHistoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicianHairJourney" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicianHairJourney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementDefinition" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "unitCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MeasurementDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" UUID NOT NULL,
    "physicianHairJourneyId" UUID NOT NULL,
    "recordedInVisitId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "measurementDefinitionId" UUID NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "measurementDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" UUID NOT NULL,
    "physicianHairJourneyId" UUID NOT NULL,
    "recordedInVisitId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "type" "TimelineEventType" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "valueJson" JSONB,
    "eventDate" DATE,
    "eventDatePrecision" "ClinicalDatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaTypeDefinition" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MediaTypeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "recordedInVisitId" UUID,
    "physicianHairJourneyId" UUID,
    "recordedByUserId" UUID NOT NULL,
    "mediaTypeDefinitionId" UUID NOT NULL,
    "category" "MediaCategory" NOT NULL DEFAULT 'OTHER',
    "storageProvider" "MediaStorageProvider" NOT NULL DEFAULT 'LOCAL',
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedOutput" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "contentVersionId" UUID NOT NULL,
    "outputType" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "sourceMetaJson" JSONB,
    "generatorVersion" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "patientId" UUID,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldName" TEXT,
    "action" "AuditAction" NOT NULL,
    "oldValueJson" JSONB,
    "newValueJson" JSONB,
    "changedByUserId" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_patientId_key" ON "PatientProfile"("patientId");

-- CreateIndex
CREATE INDEX "PatientProfile_gender_idx" ON "PatientProfile"("gender");

-- CreateIndex
CREATE INDEX "PatientProfile_maritalStatusCode_idx" ON "PatientProfile"("maritalStatusCode");

-- CreateIndex
CREATE INDEX "Condition_patientId_idx" ON "Condition"("patientId");

-- CreateIndex
CREATE INDEX "Condition_name_idx" ON "Condition"("name");

-- CreateIndex
CREATE INDEX "Medication_patientId_idx" ON "Medication"("patientId");

-- CreateIndex
CREATE INDEX "Medication_name_idx" ON "Medication"("name");

-- CreateIndex
CREATE INDEX "Medication_isCurrent_idx" ON "Medication"("isCurrent");

-- CreateIndex
CREATE INDEX "Allergy_patientId_idx" ON "Allergy"("patientId");

-- CreateIndex
CREATE INDEX "Allergy_substance_idx" ON "Allergy"("substance");

-- CreateIndex
CREATE INDEX "SurgeryProcedure_patientId_idx" ON "SurgeryProcedure"("patientId");

-- CreateIndex
CREATE INDEX "SurgeryProcedure_name_idx" ON "SurgeryProcedure"("name");

-- CreateIndex
CREATE INDEX "InterviewInvitation_patientId_idx" ON "InterviewInvitation"("patientId");

-- CreateIndex
CREATE INDEX "InterviewInvitation_createdByUserId_idx" ON "InterviewInvitation"("createdByUserId");

-- CreateIndex
CREATE INDEX "InterviewInvitation_expiresAt_idx" ON "InterviewInvitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAccessSession_invitationId_key" ON "PatientAccessSession"("invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAccessSession_sessionTokenHash_key" ON "PatientAccessSession"("sessionTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "DraftClinicalInterview_sessionId_key" ON "DraftClinicalInterview"("sessionId");

-- CreateIndex
CREATE INDEX "DraftClinicalInterview_status_idx" ON "DraftClinicalInterview"("status");

-- CreateIndex
CREATE INDEX "DraftClinicalInterview_expiresAt_idx" ON "DraftClinicalInterview"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalService_code_key" ON "ClinicalService"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_sourceDraftId_key" ON "Visit"("sourceDraftId");

-- CreateIndex
CREATE INDEX "Visit_patientId_idx" ON "Visit"("patientId");

-- CreateIndex
CREATE INDEX "Visit_clinicalServiceId_idx" ON "Visit"("clinicalServiceId");

-- CreateIndex
CREATE INDEX "Visit_visitType_idx" ON "Visit"("visitType");

-- CreateIndex
CREATE INDEX "Visit_status_idx" ON "Visit"("status");

-- CreateIndex
CREATE INDEX "Visit_createdAt_idx" ON "Visit"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReasonForVisitDefinition_code_key" ON "ReasonForVisitDefinition"("code");

-- CreateIndex
CREATE INDEX "ReasonForVisitDefinition_clinicalServiceId_idx" ON "ReasonForVisitDefinition"("clinicalServiceId");

-- CreateIndex
CREATE INDEX "VisitReason_visitId_idx" ON "VisitReason"("visitId");

-- CreateIndex
CREATE INDEX "VisitReason_reasonDefinitionId_idx" ON "VisitReason"("reasonDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitReason_visitId_reasonDefinitionId_key" ON "VisitReason"("visitId", "reasonDefinitionId");

-- CreateIndex
CREATE INDEX "OptionalProcedureRequest_visitId_idx" ON "OptionalProcedureRequest"("visitId");

-- CreateIndex
CREATE INDEX "OptionalProcedureRequest_procedureCode_idx" ON "OptionalProcedureRequest"("procedureCode");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalInterview_visitId_key" ON "ClinicalInterview"("visitId");

-- CreateIndex
CREATE INDEX "ClinicalInterview_status_idx" ON "ClinicalInterview"("status");

-- CreateIndex
CREATE INDEX "ClinicalInterview_reviewedByUserId_idx" ON "ClinicalInterview"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentVersion_versionCode_key" ON "ContentVersion"("versionCode");

-- CreateIndex
CREATE INDEX "ClinicalPathwayDefinition_clinicalServiceId_idx" ON "ClinicalPathwayDefinition"("clinicalServiceId");

-- CreateIndex
CREATE INDEX "ClinicalPathwayDefinition_contentVersionId_idx" ON "ClinicalPathwayDefinition"("contentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalPathwayDefinition_code_contentVersionId_key" ON "ClinicalPathwayDefinition"("code", "contentVersionId");

-- CreateIndex
CREATE INDEX "AssessmentDefinition_clinicalServiceId_idx" ON "AssessmentDefinition"("clinicalServiceId");

-- CreateIndex
CREATE INDEX "AssessmentDefinition_contentVersionId_idx" ON "AssessmentDefinition"("contentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentDefinition_code_contentVersionId_key" ON "AssessmentDefinition"("code", "contentVersionId");

-- CreateIndex
CREATE INDEX "ClinicalLibrary_contentVersionId_idx" ON "ClinicalLibrary"("contentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalLibrary_code_contentVersionId_key" ON "ClinicalLibrary"("code", "contentVersionId");

-- CreateIndex
CREATE INDEX "QuestionGroup_clinicalLibraryId_idx" ON "QuestionGroup"("clinicalLibraryId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionGroup_clinicalLibraryId_code_key" ON "QuestionGroup"("clinicalLibraryId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionGroup_id_clinicalLibraryId_key" ON "QuestionGroup"("id", "clinicalLibraryId");

-- CreateIndex
CREATE INDEX "QuestionDefinition_clinicalLibraryId_idx" ON "QuestionDefinition"("clinicalLibraryId");

-- CreateIndex
CREATE INDEX "QuestionDefinition_questionGroupId_idx" ON "QuestionDefinition"("questionGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionDefinition_clinicalLibraryId_code_key" ON "QuestionDefinition"("clinicalLibraryId", "code");

-- CreateIndex
CREATE INDEX "ActivePathway_clinicalInterviewId_idx" ON "ActivePathway"("clinicalInterviewId");

-- CreateIndex
CREATE INDEX "ActivePathway_pathwayDefinitionId_idx" ON "ActivePathway"("pathwayDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivePathway_clinicalInterviewId_pathwayDefinitionId_key" ON "ActivePathway"("clinicalInterviewId", "pathwayDefinitionId");

-- CreateIndex
CREATE INDEX "AssessmentInstance_clinicalInterviewId_idx" ON "AssessmentInstance"("clinicalInterviewId");

-- CreateIndex
CREATE INDEX "AssessmentInstance_assessmentDefinitionId_idx" ON "AssessmentInstance"("assessmentDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentInstance_clinicalInterviewId_assessmentDefinition_key" ON "AssessmentInstance"("clinicalInterviewId", "assessmentDefinitionId");

-- CreateIndex
CREATE INDEX "ActiveLibrary_clinicalInterviewId_idx" ON "ActiveLibrary"("clinicalInterviewId");

-- CreateIndex
CREATE INDEX "ActiveLibrary_clinicalLibraryId_idx" ON "ActiveLibrary"("clinicalLibraryId");

-- CreateIndex
CREATE INDEX "ActiveLibrary_activationSourceType_idx" ON "ActiveLibrary"("activationSourceType");

-- CreateIndex
CREATE INDEX "ActiveLibrary_sourceActivePathwayId_idx" ON "ActiveLibrary"("sourceActivePathwayId");

-- CreateIndex
CREATE INDEX "ActiveLibrary_sourceRuleVersionId_idx" ON "ActiveLibrary"("sourceRuleVersionId");

-- CreateIndex
CREATE INDEX "ActiveLibrary_sourceAssessmentInstanceId_idx" ON "ActiveLibrary"("sourceAssessmentInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveLibrary_clinicalInterviewId_clinicalLibraryId_key" ON "ActiveLibrary"("clinicalInterviewId", "clinicalLibraryId");

-- CreateIndex
CREATE INDEX "QuestionInstance_clinicalInterviewId_idx" ON "QuestionInstance"("clinicalInterviewId");

-- CreateIndex
CREATE INDEX "QuestionInstance_questionDefinitionId_idx" ON "QuestionInstance"("questionDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionInstance_clinicalInterviewId_questionDefinitionId_key" ON "QuestionInstance"("clinicalInterviewId", "questionDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "Response_questionInstanceId_key" ON "Response"("questionInstanceId");

-- CreateIndex
CREATE INDEX "Response_updatedByUserId_idx" ON "Response"("updatedByUserId");

-- CreateIndex
CREATE INDEX "RepeatableResponseItem_responseId_idx" ON "RepeatableResponseItem"("responseId");

-- CreateIndex
CREATE UNIQUE INDEX "DualPerspectiveAssessment_questionInstanceId_key" ON "DualPerspectiveAssessment"("questionInstanceId");

-- CreateIndex
CREATE INDEX "DualPerspectiveAssessment_assessedByUserId_idx" ON "DualPerspectiveAssessment"("assessedByUserId");

-- CreateIndex
CREATE INDEX "RuleVersion_ruleType_idx" ON "RuleVersion"("ruleType");

-- CreateIndex
CREATE UNIQUE INDEX "RuleVersion_code_version_key" ON "RuleVersion"("code", "version");

-- CreateIndex
CREATE INDEX "RoutingEvaluation_clinicalInterviewId_idx" ON "RoutingEvaluation"("clinicalInterviewId");

-- CreateIndex
CREATE INDEX "RoutingEvaluation_ruleVersionId_idx" ON "RoutingEvaluation"("ruleVersionId");

-- CreateIndex
CREATE INDEX "RoutingEvaluation_evaluatedAt_idx" ON "RoutingEvaluation"("evaluatedAt");

-- CreateIndex
CREATE INDEX "OutputEligibilityEvaluation_clinicalInterviewId_idx" ON "OutputEligibilityEvaluation"("clinicalInterviewId");

-- CreateIndex
CREATE INDEX "OutputEligibilityEvaluation_ruleVersionId_idx" ON "OutputEligibilityEvaluation"("ruleVersionId");

-- CreateIndex
CREATE INDEX "OutputEligibilityEvaluation_outputType_idx" ON "OutputEligibilityEvaluation"("outputType");

-- CreateIndex
CREATE INDEX "OutputEligibilityEvaluation_eligible_idx" ON "OutputEligibilityEvaluation"("eligible");

-- CreateIndex
CREATE INDEX "ReviewItem_clinicalInterviewId_idx" ON "ReviewItem"("clinicalInterviewId");

-- CreateIndex
CREATE INDEX "ReviewItem_resolvedAt_idx" ON "ReviewItem"("resolvedAt");

-- CreateIndex
CREATE INDEX "ReviewItem_entityType_entityId_idx" ON "ReviewItem"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ClinicianAssessment_clinicalInterviewId_idx" ON "ClinicianAssessment"("clinicalInterviewId");

-- CreateIndex
CREATE INDEX "ClinicianAssessment_responseId_idx" ON "ClinicianAssessment"("responseId");

-- CreateIndex
CREATE INDEX "ClinicianAssessment_createdByUserId_idx" ON "ClinicianAssessment"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovedHairHistory_patientId_key" ON "ApprovedHairHistory"("patientId");

-- CreateIndex
CREATE INDEX "ApprovedHairHistory_approvedVisitId_idx" ON "ApprovedHairHistory"("approvedVisitId");

-- CreateIndex
CREATE INDEX "ApprovedHairHistory_approvedByUserId_idx" ON "ApprovedHairHistory"("approvedByUserId");

-- CreateIndex
CREATE INDEX "HairHistoryItem_approvedHairHistoryId_idx" ON "HairHistoryItem"("approvedHairHistoryId");

-- CreateIndex
CREATE INDEX "HairHistoryItem_itemType_idx" ON "HairHistoryItem"("itemType");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicianHairJourney_patientId_key" ON "PhysicianHairJourney"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "MeasurementDefinition_code_key" ON "MeasurementDefinition"("code");

-- CreateIndex
CREATE INDEX "Measurement_physicianHairJourneyId_idx" ON "Measurement"("physicianHairJourneyId");

-- CreateIndex
CREATE INDEX "Measurement_recordedInVisitId_idx" ON "Measurement"("recordedInVisitId");

-- CreateIndex
CREATE INDEX "Measurement_measurementDefinitionId_idx" ON "Measurement"("measurementDefinitionId");

-- CreateIndex
CREATE INDEX "Measurement_measurementDate_idx" ON "Measurement"("measurementDate");

-- CreateIndex
CREATE INDEX "TimelineEvent_physicianHairJourneyId_idx" ON "TimelineEvent"("physicianHairJourneyId");

-- CreateIndex
CREATE INDEX "TimelineEvent_recordedInVisitId_idx" ON "TimelineEvent"("recordedInVisitId");

-- CreateIndex
CREATE INDEX "TimelineEvent_type_idx" ON "TimelineEvent"("type");

-- CreateIndex
CREATE INDEX "TimelineEvent_eventDate_idx" ON "TimelineEvent"("eventDate");

-- CreateIndex
CREATE INDEX "TimelineEvent_eventDatePrecision_idx" ON "TimelineEvent"("eventDatePrecision");

-- CreateIndex
CREATE UNIQUE INDEX "MediaTypeDefinition_code_key" ON "MediaTypeDefinition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_patientId_idx" ON "MediaAsset"("patientId");

-- CreateIndex
CREATE INDEX "MediaAsset_recordedInVisitId_idx" ON "MediaAsset"("recordedInVisitId");

-- CreateIndex
CREATE INDEX "MediaAsset_physicianHairJourneyId_idx" ON "MediaAsset"("physicianHairJourneyId");

-- CreateIndex
CREATE INDEX "MediaAsset_mediaTypeDefinitionId_idx" ON "MediaAsset"("mediaTypeDefinitionId");

-- CreateIndex
CREATE INDEX "MediaAsset_category_idx" ON "MediaAsset"("category");

-- CreateIndex
CREATE INDEX "MediaAsset_capturedAt_idx" ON "MediaAsset"("capturedAt");

-- CreateIndex
CREATE INDEX "GeneratedOutput_visitId_idx" ON "GeneratedOutput"("visitId");

-- CreateIndex
CREATE INDEX "GeneratedOutput_contentVersionId_idx" ON "GeneratedOutput"("contentVersionId");

-- CreateIndex
CREATE INDEX "GeneratedOutput_outputType_idx" ON "GeneratedOutput"("outputType");

-- CreateIndex
CREATE INDEX "GeneratedOutput_generatedAt_idx" ON "GeneratedOutput"("generatedAt");

-- CreateIndex
CREATE INDEX "AuditLog_patientId_idx" ON "AuditLog"("patientId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_changedByUserId_idx" ON "AuditLog"("changedByUserId");

-- CreateIndex
CREATE INDEX "AuditLog_changedAt_idx" ON "AuditLog"("changedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryProcedure" ADD CONSTRAINT "SurgeryProcedure_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewInvitation" ADD CONSTRAINT "InterviewInvitation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewInvitation" ADD CONSTRAINT "InterviewInvitation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAccessSession" ADD CONSTRAINT "PatientAccessSession_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "InterviewInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftClinicalInterview" ADD CONSTRAINT "DraftClinicalInterview_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PatientAccessSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_clinicalServiceId_fkey" FOREIGN KEY ("clinicalServiceId") REFERENCES "ClinicalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_sourceDraftId_fkey" FOREIGN KEY ("sourceDraftId") REFERENCES "DraftClinicalInterview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReasonForVisitDefinition" ADD CONSTRAINT "ReasonForVisitDefinition_clinicalServiceId_fkey" FOREIGN KEY ("clinicalServiceId") REFERENCES "ClinicalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitReason" ADD CONSTRAINT "VisitReason_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitReason" ADD CONSTRAINT "VisitReason_reasonDefinitionId_fkey" FOREIGN KEY ("reasonDefinitionId") REFERENCES "ReasonForVisitDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionalProcedureRequest" ADD CONSTRAINT "OptionalProcedureRequest_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalInterview" ADD CONSTRAINT "ClinicalInterview_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalInterview" ADD CONSTRAINT "ClinicalInterview_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathwayDefinition" ADD CONSTRAINT "ClinicalPathwayDefinition_clinicalServiceId_fkey" FOREIGN KEY ("clinicalServiceId") REFERENCES "ClinicalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathwayDefinition" ADD CONSTRAINT "ClinicalPathwayDefinition_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentDefinition" ADD CONSTRAINT "AssessmentDefinition_clinicalServiceId_fkey" FOREIGN KEY ("clinicalServiceId") REFERENCES "ClinicalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentDefinition" ADD CONSTRAINT "AssessmentDefinition_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalLibrary" ADD CONSTRAINT "ClinicalLibrary_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionGroup" ADD CONSTRAINT "QuestionGroup_clinicalLibraryId_fkey" FOREIGN KEY ("clinicalLibraryId") REFERENCES "ClinicalLibrary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDefinition" ADD CONSTRAINT "QuestionDefinition_clinicalLibraryId_fkey" FOREIGN KEY ("clinicalLibraryId") REFERENCES "ClinicalLibrary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDefinition" ADD CONSTRAINT "QuestionDefinition_questionGroupId_clinicalLibraryId_fkey" FOREIGN KEY ("questionGroupId", "clinicalLibraryId") REFERENCES "QuestionGroup"("id", "clinicalLibraryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivePathway" ADD CONSTRAINT "ActivePathway_clinicalInterviewId_fkey" FOREIGN KEY ("clinicalInterviewId") REFERENCES "ClinicalInterview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivePathway" ADD CONSTRAINT "ActivePathway_pathwayDefinitionId_fkey" FOREIGN KEY ("pathwayDefinitionId") REFERENCES "ClinicalPathwayDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentInstance" ADD CONSTRAINT "AssessmentInstance_clinicalInterviewId_fkey" FOREIGN KEY ("clinicalInterviewId") REFERENCES "ClinicalInterview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentInstance" ADD CONSTRAINT "AssessmentInstance_assessmentDefinitionId_fkey" FOREIGN KEY ("assessmentDefinitionId") REFERENCES "AssessmentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveLibrary" ADD CONSTRAINT "ActiveLibrary_clinicalInterviewId_fkey" FOREIGN KEY ("clinicalInterviewId") REFERENCES "ClinicalInterview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveLibrary" ADD CONSTRAINT "ActiveLibrary_clinicalLibraryId_fkey" FOREIGN KEY ("clinicalLibraryId") REFERENCES "ClinicalLibrary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveLibrary" ADD CONSTRAINT "ActiveLibrary_sourceActivePathwayId_fkey" FOREIGN KEY ("sourceActivePathwayId") REFERENCES "ActivePathway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveLibrary" ADD CONSTRAINT "ActiveLibrary_sourceRuleVersionId_fkey" FOREIGN KEY ("sourceRuleVersionId") REFERENCES "RuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveLibrary" ADD CONSTRAINT "ActiveLibrary_sourceAssessmentInstanceId_fkey" FOREIGN KEY ("sourceAssessmentInstanceId") REFERENCES "AssessmentInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionInstance" ADD CONSTRAINT "QuestionInstance_clinicalInterviewId_fkey" FOREIGN KEY ("clinicalInterviewId") REFERENCES "ClinicalInterview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionInstance" ADD CONSTRAINT "QuestionInstance_questionDefinitionId_fkey" FOREIGN KEY ("questionDefinitionId") REFERENCES "QuestionDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_questionInstanceId_fkey" FOREIGN KEY ("questionInstanceId") REFERENCES "QuestionInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatableResponseItem" ADD CONSTRAINT "RepeatableResponseItem_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DualPerspectiveAssessment" ADD CONSTRAINT "DualPerspectiveAssessment_questionInstanceId_fkey" FOREIGN KEY ("questionInstanceId") REFERENCES "QuestionInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DualPerspectiveAssessment" ADD CONSTRAINT "DualPerspectiveAssessment_assessedByUserId_fkey" FOREIGN KEY ("assessedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingEvaluation" ADD CONSTRAINT "RoutingEvaluation_clinicalInterviewId_fkey" FOREIGN KEY ("clinicalInterviewId") REFERENCES "ClinicalInterview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingEvaluation" ADD CONSTRAINT "RoutingEvaluation_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "RuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutputEligibilityEvaluation" ADD CONSTRAINT "OutputEligibilityEvaluation_clinicalInterviewId_fkey" FOREIGN KEY ("clinicalInterviewId") REFERENCES "ClinicalInterview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutputEligibilityEvaluation" ADD CONSTRAINT "OutputEligibilityEvaluation_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "RuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_clinicalInterviewId_fkey" FOREIGN KEY ("clinicalInterviewId") REFERENCES "ClinicalInterview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicianAssessment" ADD CONSTRAINT "ClinicianAssessment_clinicalInterviewId_fkey" FOREIGN KEY ("clinicalInterviewId") REFERENCES "ClinicalInterview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicianAssessment" ADD CONSTRAINT "ClinicianAssessment_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicianAssessment" ADD CONSTRAINT "ClinicianAssessment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedHairHistory" ADD CONSTRAINT "ApprovedHairHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedHairHistory" ADD CONSTRAINT "ApprovedHairHistory_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedHairHistory" ADD CONSTRAINT "ApprovedHairHistory_approvedVisitId_fkey" FOREIGN KEY ("approvedVisitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HairHistoryItem" ADD CONSTRAINT "HairHistoryItem_approvedHairHistoryId_fkey" FOREIGN KEY ("approvedHairHistoryId") REFERENCES "ApprovedHairHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianHairJourney" ADD CONSTRAINT "PhysicianHairJourney_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_physicianHairJourneyId_fkey" FOREIGN KEY ("physicianHairJourneyId") REFERENCES "PhysicianHairJourney"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_recordedInVisitId_fkey" FOREIGN KEY ("recordedInVisitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_measurementDefinitionId_fkey" FOREIGN KEY ("measurementDefinitionId") REFERENCES "MeasurementDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_physicianHairJourneyId_fkey" FOREIGN KEY ("physicianHairJourneyId") REFERENCES "PhysicianHairJourney"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_recordedInVisitId_fkey" FOREIGN KEY ("recordedInVisitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_recordedInVisitId_fkey" FOREIGN KEY ("recordedInVisitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_physicianHairJourneyId_fkey" FOREIGN KEY ("physicianHairJourneyId") REFERENCES "PhysicianHairJourney"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_mediaTypeDefinitionId_fkey" FOREIGN KEY ("mediaTypeDefinitionId") REFERENCES "MediaTypeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedOutput" ADD CONSTRAINT "GeneratedOutput_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedOutput" ADD CONSTRAINT "GeneratedOutput_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
