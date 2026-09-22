-- FPV-2 adds lifecycle infrastructure only. Flexible Draft JSON remains a
-- non-canonical work buffer and is not materialized into clinical tables.

ALTER TYPE "PhysicianVisitRecordStatus" ADD VALUE 'FINALIZED';

CREATE TYPE "PhysicianVisitAddendumType" AS ENUM (
  'CORRECTION',
  'CLARIFICATION',
  'ADDITIONAL_DOCUMENTATION'
);

ALTER TYPE "AuditAction" ADD VALUE 'PHYSICIAN_ENCOUNTER_BEGAN';
ALTER TYPE "AuditAction" ADD VALUE 'PHYSICIAN_VISIT_FINALIZED';
ALTER TYPE "AuditAction" ADD VALUE 'PHYSICIAN_VISIT_LATE_FINALIZED';
ALTER TYPE "AuditAction" ADD VALUE 'PHYSICIAN_VISIT_ADDENDUM_ADDED';

ALTER TABLE "PhysicianVisitRecord"
  ADD COLUMN "finalizedByUserId" UUID,
  ADD COLUMN "finalizedAt" TIMESTAMP(3),
  ADD COLUMN "finalizedDraftVersion" INTEGER,
  ADD COLUMN "finalizedDraftSha256" VARCHAR(64),
  ADD COLUMN "originalFinalizationEvidenceJson" JSONB,
  ADD COLUMN "isLateDocumentation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PhysicianVisitRecord"
  ADD CONSTRAINT "PhysicianVisitRecord_finalizedByUserId_fkey"
  FOREIGN KEY ("finalizedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PhysicianVisitRecord"
  ADD CONSTRAINT "PhysicianVisitRecord_finalization_lifecycle_check"
  CHECK (
    (
      "status"::text = 'DRAFT'
      AND "finalizedByUserId" IS NULL
      AND "finalizedAt" IS NULL
      AND "finalizedDraftVersion" IS NULL
      AND "finalizedDraftSha256" IS NULL
      AND "originalFinalizationEvidenceJson" IS NULL
      AND "isLateDocumentation" = false
    )
    OR
    (
      "status"::text = 'FINALIZED'
      AND "finalizedByUserId" IS NOT NULL
      AND "finalizedAt" IS NOT NULL
      AND "finalizedDraftVersion" >= 1
      AND "finalizedDraftSha256" ~ '^[0-9a-f]{64}$'
      AND "originalFinalizationEvidenceJson" IS NOT NULL
    )
  );

CREATE INDEX "PhysicianVisitRecord_finalizedByUserId_idx"
  ON "PhysicianVisitRecord"("finalizedByUserId");

CREATE INDEX "PhysicianVisitRecord_finalizedAt_idx"
  ON "PhysicianVisitRecord"("finalizedAt");

CREATE TABLE "PhysicianVisitAddendum" (
  "id" UUID NOT NULL,
  "physicianVisitRecordId" UUID NOT NULL,
  "authorUserId" UUID NOT NULL,
  "type" "PhysicianVisitAddendumType" NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PhysicianVisitAddendum_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PhysicianVisitAddendum_content_check"
    CHECK (length(btrim("content")) BETWEEN 1 AND 16000)
);

CREATE INDEX "PhysicianVisitAddendum_physicianVisitRecordId_createdAt_idx"
  ON "PhysicianVisitAddendum"("physicianVisitRecordId", "createdAt");

CREATE INDEX "PhysicianVisitAddendum_authorUserId_idx"
  ON "PhysicianVisitAddendum"("authorUserId");

ALTER TABLE "PhysicianVisitAddendum"
  ADD CONSTRAINT "PhysicianVisitAddendum_physicianVisitRecordId_fkey"
  FOREIGN KEY ("physicianVisitRecordId") REFERENCES "PhysicianVisitRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PhysicianVisitAddendum"
  ADD CONSTRAINT "PhysicianVisitAddendum_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- The encounter clock is write-once at the database boundary. The application
-- separately restricts the null -> timestamp transition to PHYSICIAN actors.
CREATE FUNCTION "fpv2_reject_visit_occurred_at_rewrite"()
RETURNS TRIGGER AS $$
DECLARE
  visit_is_finalized BOOLEAN;
BEGIN
  IF OLD."visitOccurredAt" IS NOT NULL
     AND NEW."visitOccurredAt" IS DISTINCT FROM OLD."visitOccurredAt" THEN
    RAISE EXCEPTION 'FPV-2 hard lock: visitOccurredAt is immutable once assigned';
  END IF;

  EXECUTE format(
    'SELECT EXISTS (
       SELECT 1
       FROM %I."PhysicianVisitRecord" pvr
       WHERE pvr."visitId" = $1
         AND pvr."status"::text = ''FINALIZED''
     )',
    TG_TABLE_SCHEMA
  ) INTO visit_is_finalized USING OLD."id";

  IF visit_is_finalized AND (
    NEW."patientId" IS DISTINCT FROM OLD."patientId"
    OR NEW."clinicScopeId" IS DISTINCT FROM OLD."clinicScopeId"
    OR NEW."sourceDraftId" IS DISTINCT FROM OLD."sourceDraftId"
    OR NEW."clinicalEpisodeId" IS DISTINCT FROM OLD."clinicalEpisodeId"
    OR NEW."visitType" IS DISTINCT FROM OLD."visitType"
    OR NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt"
  ) THEN
    RAISE EXCEPTION 'FPV-2 hard lock: finalized Visit identity and lifecycle are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Visit_visitOccurredAt_immutable"
BEFORE UPDATE ON "Visit"
FOR EACH ROW EXECUTE FUNCTION "fpv2_reject_visit_occurred_at_rewrite"();

-- First-finalization evidence and its reviewed Draft are immutable. Future
-- governed clinical correction tables may change their own current values,
-- but cannot rewrite this forensic evidence or reopen the Draft.
CREATE FUNCTION "fpv2_reject_finalized_record_rewrite"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status"::text = 'FINALIZED' THEN
    RAISE EXCEPTION 'FPV-2 hard lock: finalized PhysicianVisitRecord cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status"::text = 'FINALIZED' AND (
    NEW."visitId" IS DISTINCT FROM OLD."visitId"
    OR NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."draftJson" IS DISTINCT FROM OLD."draftJson"
    OR NEW."draftVersion" IS DISTINCT FROM OLD."draftVersion"
    OR NEW."draftStartedByUserId" IS DISTINCT FROM OLD."draftStartedByUserId"
    OR NEW."draftStartedAt" IS DISTINCT FROM OLD."draftStartedAt"
    OR NEW."lastDraftEditedByUserId" IS DISTINCT FROM OLD."lastDraftEditedByUserId"
    OR NEW."lastDraftEditedAt" IS DISTINCT FROM OLD."lastDraftEditedAt"
    OR NEW."finalizedByUserId" IS DISTINCT FROM OLD."finalizedByUserId"
    OR NEW."finalizedAt" IS DISTINCT FROM OLD."finalizedAt"
    OR NEW."finalizedDraftVersion" IS DISTINCT FROM OLD."finalizedDraftVersion"
    OR NEW."finalizedDraftSha256" IS DISTINCT FROM OLD."finalizedDraftSha256"
    OR NEW."originalFinalizationEvidenceJson" IS DISTINCT FROM OLD."originalFinalizationEvidenceJson"
    OR NEW."isLateDocumentation" IS DISTINCT FROM OLD."isLateDocumentation"
  ) THEN
    RAISE EXCEPTION 'FPV-2 hard lock: finalized lifecycle evidence is immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PhysicianVisitRecord_finalized_immutable"
BEFORE UPDATE OR DELETE ON "PhysicianVisitRecord"
FOR EACH ROW EXECUTE FUNCTION "fpv2_reject_finalized_record_rewrite"();

-- Addenda are append-only even for direct database callers using the
-- application role. A later clarification must be a new Addendum.
CREATE FUNCTION "fpv2_reject_addendum_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'FPV-2 append-only: PhysicianVisitAddendum cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PhysicianVisitAddendum_append_only"
BEFORE UPDATE OR DELETE ON "PhysicianVisitAddendum"
FOR EACH ROW EXECUTE FUNCTION "fpv2_reject_addendum_mutation"();
