-- P01 v1.5 Returning Patient / Follow-up Architecture
-- Adds longitudinal Clinical Episodes and a small audited Follow-up context per Visit.

CREATE TYPE "ClinicalEpisodeStatus" AS ENUM ('ACTIVE', 'CLOSED');

CREATE TABLE "ClinicalEpisode" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "primaryReasonCode" TEXT NOT NULL,
    "status" "ClinicalEpisodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicalEpisode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FollowUpVisitContext" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "sourceVisitId" UUID,
    "intent" TEXT NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "confirmationsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUpVisitContext_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Visit" ADD COLUMN "clinicalEpisodeId" UUID;

CREATE INDEX "ClinicalEpisode_patientId_status_idx" ON "ClinicalEpisode"("patientId", "status");
CREATE INDEX "ClinicalEpisode_patientId_primaryReasonCode_idx" ON "ClinicalEpisode"("patientId", "primaryReasonCode");
CREATE UNIQUE INDEX "ClinicalEpisode_one_active_per_patient_reason_idx"
  ON "ClinicalEpisode"("patientId", "primaryReasonCode")
  WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "FollowUpVisitContext_visitId_key" ON "FollowUpVisitContext"("visitId");
CREATE INDEX "FollowUpVisitContext_sourceVisitId_idx" ON "FollowUpVisitContext"("sourceVisitId");
CREATE INDEX "Visit_clinicalEpisodeId_idx" ON "Visit"("clinicalEpisodeId");

ALTER TABLE "ClinicalEpisode" ADD CONSTRAINT "ClinicalEpisode_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_clinicalEpisodeId_fkey"
  FOREIGN KEY ("clinicalEpisodeId") REFERENCES "ClinicalEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUpVisitContext" ADD CONSTRAINT "FollowUpVisitContext_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUpVisitContext" ADD CONSTRAINT "FollowUpVisitContext_sourceVisitId_fkey"
  FOREIGN KEY ("sourceVisitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill legacy visits into one active episode per patient + primary reason.
-- This is intentionally a migration bridge for pre-v1.5 data. New episodes are created explicitly by application logic.
WITH legacy_groups AS (
  SELECT DISTINCT v."patientId", rfd."code" AS "primaryReasonCode"
  FROM "Visit" v
  JOIN "VisitReason" vr ON vr."visitId" = v."id" AND vr."role" = 'PRIMARY'
  JOIN "ReasonForVisitDefinition" rfd ON rfd."id" = vr."reasonDefinitionId"
), episode_rows AS (
  SELECT
    (
      substr(md5(lg."patientId"::text || ':' || lg."primaryReasonCode"), 1, 8) || '-' ||
      substr(md5(lg."patientId"::text || ':' || lg."primaryReasonCode"), 9, 4) || '-' ||
      substr(md5(lg."patientId"::text || ':' || lg."primaryReasonCode"), 13, 4) || '-' ||
      substr(md5(lg."patientId"::text || ':' || lg."primaryReasonCode"), 17, 4) || '-' ||
      substr(md5(lg."patientId"::text || ':' || lg."primaryReasonCode"), 21, 12)
    )::uuid AS "id",
    lg."patientId",
    lg."primaryReasonCode"
  FROM legacy_groups lg
)
INSERT INTO "ClinicalEpisode" ("id", "patientId", "primaryReasonCode", "status", "openedAt", "createdAt", "updatedAt")
SELECT er."id", er."patientId", er."primaryReasonCode", 'ACTIVE', MIN(v."createdAt"), MIN(v."createdAt"), CURRENT_TIMESTAMP
FROM episode_rows er
JOIN "Visit" v ON v."patientId" = er."patientId"
JOIN "VisitReason" vr ON vr."visitId" = v."id" AND vr."role" = 'PRIMARY'
JOIN "ReasonForVisitDefinition" rfd ON rfd."id" = vr."reasonDefinitionId" AND rfd."code" = er."primaryReasonCode"
GROUP BY er."id", er."patientId", er."primaryReasonCode";

UPDATE "Visit" v
SET "clinicalEpisodeId" = ce."id"
FROM "ClinicalEpisode" ce, "VisitReason" vr, "ReasonForVisitDefinition" rfd
WHERE vr."visitId" = v."id"
  AND vr."role" = 'PRIMARY'
  AND rfd."id" = vr."reasonDefinitionId"
  AND ce."patientId" = v."patientId"
  AND ce."primaryReasonCode" = rfd."code"
  AND v."clinicalEpisodeId" IS NULL;
