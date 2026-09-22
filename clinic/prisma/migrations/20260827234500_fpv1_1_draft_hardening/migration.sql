-- FPV-1.1 separates staff-capable Draft preparation from the future,
-- physician-only Begin Encounter transition. No encounter timestamp is assigned.

ALTER TYPE "AuditAction"
  RENAME VALUE 'PHYSICIAN_VISIT_STARTED' TO 'PHYSICIAN_VISIT_DRAFT_STARTED';

ALTER TABLE "PhysicianVisitRecord"
  RENAME COLUMN "startedByUserId" TO "draftStartedByUserId";

ALTER TABLE "PhysicianVisitRecord"
  RENAME COLUMN "startedAt" TO "draftStartedAt";

ALTER TABLE "PhysicianVisitRecord"
  RENAME CONSTRAINT "PhysicianVisitRecord_startedByUserId_fkey"
  TO "PhysicianVisitRecord_draftStartedByUserId_fkey";

ALTER INDEX "PhysicianVisitRecord_startedAt_idx"
  RENAME TO "PhysicianVisitRecord_draftStartedAt_idx";

ALTER INDEX "PhysicianVisitRecord_startedByUserId_idx"
  RENAME TO "PhysicianVisitRecord_draftStartedByUserId_idx";
