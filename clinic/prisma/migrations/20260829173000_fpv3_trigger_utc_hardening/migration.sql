-- Make FPV-3 trigger behavior independent of search_path enum resolution and
-- compare Prisma UTC timestamp-without-time-zone values to authoritative
-- database time in UTC. This migration changes no clinical data.

CREATE OR REPLACE FUNCTION "fpv3_hair_parting_is_normalized"(
  input_values "PhysicianHairPartingFinding"[]
)
RETURNS BOOLEAN AS $$
  SELECT input_values::text[] = ARRAY(
    SELECT candidate
    FROM unnest(ARRAY[
      'UNIVERSAL',
      'FRONTAL_THINNER',
      'CROWN_THINNER',
      'VERTEX_THINNER'
    ]::text[]) AS candidate
    WHERE candidate = ANY(input_values::text[])
  );
$$ LANGUAGE SQL IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION "fpv3_enforce_canonical_correction_window"()
RETURNS TRIGGER AS $$
DECLARE
  record_id UUID;
  record_status TEXT;
  occurred_at TIMESTAMP(3);
BEGIN
  record_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."physicianVisitRecordId"
    ELSE NEW."physicianVisitRecordId"
  END;

  EXECUTE format(
    'SELECT pvr."status"::text, v."visitOccurredAt"
       FROM %I."PhysicianVisitRecord" pvr
       JOIN %I."Visit" v ON v."id" = pvr."visitId"
      WHERE pvr."id" = $1
      FOR SHARE OF pvr, v',
    TG_TABLE_SCHEMA,
    TG_TABLE_SCHEMA
  ) INTO record_status, occurred_at USING record_id;

  IF record_status IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3 integrity: canonical clinical owner is missing';
  END IF;

  IF TG_OP = 'INSERT' AND record_status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  IF record_status <> 'FINALIZED' OR occurred_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3 integrity: canonical correction requires a finalized encounter';
  END IF;

  IF (clock_timestamp() AT TIME ZONE 'UTC') >= occurred_at + INTERVAL '24 hours' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3 hard lock: canonical clinical correction window is closed';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."physicianVisitRecordId" IS DISTINCT FROM OLD."physicianVisitRecordId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR (
         TG_TABLE_NAME = 'PhysicianVisitMeasurement'
         AND to_jsonb(NEW)->>'code' IS DISTINCT FROM to_jsonb(OLD)->>'code'
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'FPV-3 integrity: canonical clinical identity is immutable';
    END IF;
    NEW."updatedAt" := clock_timestamp() AT TIME ZONE 'UTC';
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
