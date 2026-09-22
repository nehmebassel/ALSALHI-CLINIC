CREATE TYPE "HairHistoryReviewStatus" AS ENUM ('PATIENT_REPORTED_PREVIEW', 'REVIEWED_DRAFT', 'AMENDMENT_DRAFT');
CREATE TYPE "HairHistoryLayer" AS ENUM ('MEASURES', 'SYMPTOMS', 'TREATMENTS', 'PROCEDURES', 'TRIGGERS', 'DIAGNOSES', 'TESTS_LABS', 'PHOTOS');
CREATE TYPE "HairHistoryItemSource" AS ENUM ('PATIENT', 'PHYSICIAN');

CREATE TABLE "HairHistoryDraft" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "sourceVisitId" UUID NOT NULL,
    "status" "HairHistoryReviewStatus" NOT NULL DEFAULT 'PATIENT_REPORTED_PREVIEW',
    "baseRevision" INTEGER NOT NULL DEFAULT 0,
    "lastEditedByUserId" UUID,
    "lastEditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HairHistoryDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HairHistoryDraftItem" (
    "id" UUID NOT NULL,
    "hairHistoryDraftId" UUID NOT NULL,
    "layer" "HairHistoryLayer" NOT NULL,
    "itemType" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "approximateDate" DATE,
    "datePrecision" "ClinicalDatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "source" "HairHistoryItemSource" NOT NULL DEFAULT 'PATIENT',
    "sourceQuestionCode" TEXT,
    "sourceScopeKey" TEXT,
    "sourceResponseId" UUID,
    "sourceItemIndex" INTEGER,
    "isIncluded" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HairHistoryDraftItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ApprovedHairHistory" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "HairHistoryDraft_patientId_key" ON "HairHistoryDraft"("patientId");
CREATE INDEX "HairHistoryDraft_sourceVisitId_idx" ON "HairHistoryDraft"("sourceVisitId");
CREATE INDEX "HairHistoryDraft_lastEditedByUserId_idx" ON "HairHistoryDraft"("lastEditedByUserId");
CREATE INDEX "HairHistoryDraft_status_idx" ON "HairHistoryDraft"("status");
CREATE INDEX "HairHistoryDraftItem_hairHistoryDraftId_idx" ON "HairHistoryDraftItem"("hairHistoryDraftId");
CREATE INDEX "HairHistoryDraftItem_layer_idx" ON "HairHistoryDraftItem"("layer");
CREATE INDEX "HairHistoryDraftItem_approximateDate_idx" ON "HairHistoryDraftItem"("approximateDate");
CREATE INDEX "HairHistoryDraftItem_sourceQuestionCode_idx" ON "HairHistoryDraftItem"("sourceQuestionCode");

ALTER TABLE "HairHistoryDraft"
  ADD CONSTRAINT "HairHistoryDraft_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HairHistoryDraft_sourceVisitId_fkey" FOREIGN KEY ("sourceVisitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "HairHistoryDraft_lastEditedByUserId_fkey" FOREIGN KEY ("lastEditedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HairHistoryDraftItem"
  ADD CONSTRAINT "HairHistoryDraftItem_hairHistoryDraftId_fkey" FOREIGN KEY ("hairHistoryDraftId") REFERENCES "HairHistoryDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
