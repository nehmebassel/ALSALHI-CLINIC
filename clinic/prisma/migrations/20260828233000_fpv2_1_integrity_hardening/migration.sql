-- FPV-2.1 integrity hardening only. This migration adds no clinical schema,
-- performs no backfill, and does not fabricate physician provenance.

-- AuditLog is an append-only ledger at the database boundary. INSERT remains
-- allowed; every UPDATE or DELETE fails for all callers subject to triggers.
CREATE FUNCTION "fpv2_1_reject_audit_log_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'FPV-2.1 append-only: AuditLog cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AuditLog_append_only" ON "AuditLog";
CREATE TRIGGER "AuditLog_append_only"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "fpv2_1_reject_audit_log_mutation"();

-- Keep the pre-finalization encounter timestamp write-once rule, then lock the
-- entire Visit row once its PhysicianVisitRecord has reached FINALIZED. Source
-- inspection found no legitimate post-finalization Visit-row update path.
CREATE OR REPLACE FUNCTION "fpv2_reject_visit_occurred_at_rewrite"()
RETURNS TRIGGER AS $$
DECLARE
  visit_is_finalized BOOLEAN;
BEGIN
  IF OLD."visitOccurredAt" IS NOT NULL
     AND NEW."visitOccurredAt" IS DISTINCT FROM OLD."visitOccurredAt" THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-2.1 hard lock: visitOccurredAt is immutable once assigned';
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

  IF visit_is_finalized THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-2.1 hard lock: finalized physician Visit row is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Visit_visitOccurredAt_immutable" ON "Visit";
CREATE TRIGGER "Visit_visitOccurredAt_immutable"
BEFORE UPDATE ON "Visit"
FOR EACH ROW EXECUTE FUNCTION "fpv2_reject_visit_occurred_at_rewrite"();

-- The DRAFT -> FINALIZED transition is allowed because OLD.status is DRAFT.
-- Once FINALIZED is committed, the entire lifecycle-envelope row is immutable,
-- including columns introduced by future migrations.
CREATE OR REPLACE FUNCTION "fpv2_reject_finalized_record_rewrite"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status"::text = 'FINALIZED' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-2.1 hard lock: finalized PhysicianVisitRecord row is immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "PhysicianVisitRecord_finalized_immutable"
  ON "PhysicianVisitRecord";
CREATE TRIGGER "PhysicianVisitRecord_finalized_immutable"
BEFORE UPDATE OR DELETE ON "PhysicianVisitRecord"
FOR EACH ROW EXECUTE FUNCTION "fpv2_reject_finalized_record_rewrite"();
