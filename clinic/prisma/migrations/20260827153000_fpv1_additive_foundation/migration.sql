-- FPV-1 is additive. It deliberately creates no PhysicianVisitRecord rows for
-- legacy or synthetic Visits and deliberately leaves visitOccurredAt NULL.

CREATE TYPE "PhysicianVisitRecordStatus" AS ENUM ('DRAFT');

ALTER TYPE "AuditAction" ADD VALUE 'PHYSICIAN_VISIT_STARTED';
ALTER TYPE "AuditAction" ADD VALUE 'PHYSICIAN_VISIT_DRAFT_UPDATED';

ALTER TABLE "Visit"
  ADD COLUMN "clinicScopeId" UUID,
  ADD COLUMN "visitOccurredAt" TIMESTAMP(3);

ALTER TABLE "ClinicalEpisode"
  ADD COLUMN "clinicScopeId" UUID;

-- A Visit's tenant scope is provable only through its immutable submit path:
-- Visit -> DraftClinicalInterview -> PatientAccessSession -> InterviewInvitation.
-- Abort if the join ever produces conflicting tenant scopes; never choose one.
DO $$
BEGIN
  IF EXISTS (
    SELECT v."id"
    FROM "Visit" v
    JOIN "DraftClinicalInterview" d ON d."id" = v."sourceDraftId"
    JOIN "PatientAccessSession" s ON s."id" = d."sessionId"
    JOIN "InterviewInvitation" i ON i."id" = s."invitationId"
    GROUP BY v."id"
    HAVING COUNT(DISTINCT i."clinicScopeId") > 1
  ) THEN
    RAISE EXCEPTION 'FPV-1 preflight failed: Visit has conflicting clinic scopes';
  END IF;
END $$;

UPDATE "Visit" v
SET "clinicScopeId" = i."clinicScopeId"
FROM "DraftClinicalInterview" d
JOIN "PatientAccessSession" s ON s."id" = d."sessionId"
JOIN "InterviewInvitation" i ON i."id" = s."invitationId"
WHERE d."id" = v."sourceDraftId"
  AND v."clinicScopeId" IS NULL;

-- An Episode scope is provable only when all scoped Visits in that Episode agree.
-- Conflicts stop the migration; zero-evidence Episodes remain NULL for later
-- reconciliation instead of receiving a guessed tenant scope.
DO $$
BEGIN
  IF EXISTS (
    SELECT v."clinicalEpisodeId"
    FROM "Visit" v
    WHERE v."clinicalEpisodeId" IS NOT NULL
      AND v."clinicScopeId" IS NOT NULL
    GROUP BY v."clinicalEpisodeId"
    HAVING COUNT(DISTINCT v."clinicScopeId") > 1
  ) THEN
    RAISE EXCEPTION 'FPV-1 preflight failed: ClinicalEpisode spans conflicting clinic scopes';
  END IF;
END $$;

WITH deterministic_episode_scope AS (
  SELECT
    v."clinicalEpisodeId" AS "episodeId",
    MIN(v."clinicScopeId"::text)::uuid AS "clinicScopeId"
  FROM "Visit" v
  WHERE v."clinicalEpisodeId" IS NOT NULL
    AND v."clinicScopeId" IS NOT NULL
  GROUP BY v."clinicalEpisodeId"
  HAVING COUNT(DISTINCT v."clinicScopeId") = 1
)
UPDATE "ClinicalEpisode" e
SET "clinicScopeId" = resolved."clinicScopeId"
FROM deterministic_episode_scope resolved
WHERE e."id" = resolved."episodeId"
  AND e."clinicScopeId" IS NULL;

ALTER TABLE "Visit"
  ADD CONSTRAINT "Visit_clinicScopeId_fkey"
  FOREIGN KEY ("clinicScopeId") REFERENCES "ClinicScope"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicalEpisode"
  ADD CONSTRAINT "ClinicalEpisode_clinicScopeId_fkey"
  FOREIGN KEY ("clinicScopeId") REFERENCES "ClinicScope"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Visit_clinicScopeId_status_idx"
  ON "Visit"("clinicScopeId", "status");

CREATE INDEX "ClinicalEpisode_clinicScopeId_status_idx"
  ON "ClinicalEpisode"("clinicScopeId", "status");

CREATE TABLE "PhysicianVisitRecord" (
  "id" UUID NOT NULL,
  "visitId" UUID NOT NULL,
  "status" "PhysicianVisitRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "draftJson" JSONB NOT NULL,
  "draftVersion" INTEGER NOT NULL DEFAULT 1,
  "startedByUserId" UUID NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDraftEditedByUserId" UUID NOT NULL,
  "lastDraftEditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhysicianVisitRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PhysicianVisitRecord_draftVersion_check" CHECK ("draftVersion" >= 1)
);

CREATE UNIQUE INDEX "PhysicianVisitRecord_visitId_key"
  ON "PhysicianVisitRecord"("visitId");

CREATE INDEX "PhysicianVisitRecord_status_idx"
  ON "PhysicianVisitRecord"("status");

CREATE INDEX "PhysicianVisitRecord_startedAt_idx"
  ON "PhysicianVisitRecord"("startedAt");

CREATE INDEX "PhysicianVisitRecord_startedByUserId_idx"
  ON "PhysicianVisitRecord"("startedByUserId");

CREATE INDEX "PhysicianVisitRecord_lastDraftEditedByUserId_idx"
  ON "PhysicianVisitRecord"("lastDraftEditedByUserId");

ALTER TABLE "PhysicianVisitRecord"
  ADD CONSTRAINT "PhysicianVisitRecord_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "Visit"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PhysicianVisitRecord"
  ADD CONSTRAINT "PhysicianVisitRecord_startedByUserId_fkey"
  FOREIGN KEY ("startedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PhysicianVisitRecord"
  ADD CONSTRAINT "PhysicianVisitRecord_lastDraftEditedByUserId_fkey"
  FOREIGN KEY ("lastDraftEditedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
