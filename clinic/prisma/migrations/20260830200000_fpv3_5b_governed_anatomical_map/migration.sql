-- FPV-3.5B adds only visit-scoped, physician-owned canonical Anatomical Map
-- data. No patient, legacy, prior-Visit, Journey, Effective State, or
-- synthetic data is copied or backfilled.

CREATE TYPE "PhysicianAnatomicalMapView" AS ENUM (
  'FRONT',
  'TOP',
  'RIGHT_SIDE',
  'LEFT_SIDE'
);

CREATE TABLE "PhysicianVisitAnatomicalMap" (
  "id" UUID NOT NULL,
  "physicianVisitRecordId" UUID NOT NULL,
  "templateVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhysicianVisitAnatomicalMap_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PVA_Map_template_check" CHECK ("templateVersion" = 1)
);

CREATE TABLE "PhysicianVisitAnatomicalRegion" (
  "id" UUID NOT NULL,
  "physicianVisitAnatomicalMapId" UUID NOT NULL,
  "view" "PhysicianAnatomicalMapView" NOT NULL,
  "geometry" JSONB NOT NULL,
  "noteText" TEXT,
  "displayColorHex" TEXT,
  "displayOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhysicianVisitAnatomicalRegion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PVA_Region_order_check" CHECK ("displayOrder" >= 0),
  CONSTRAINT "PVA_Region_note_check" CHECK (
    "noteText" IS NULL
    OR (
      length(btrim("noteText", E' \t\n\r')) > 0
      AND char_length("noteText") <= 16000
    )
  ),
  CONSTRAINT "PVA_Region_color_check" CHECK (
    "displayColorHex" IS NULL
    OR "displayColorHex" ~ '^#[0-9A-F]{6}$'
  ),
  CONSTRAINT "PVA_Region_geometry_size_check" CHECK (
    pg_column_size("geometry") <= 131072
  )
);

CREATE UNIQUE INDEX "PVA_Map_pvr_key"
  ON "PhysicianVisitAnatomicalMap"("physicianVisitRecordId");
CREATE INDEX "PVA_Map_created_idx"
  ON "PhysicianVisitAnatomicalMap"("createdAt");
CREATE UNIQUE INDEX "PVA_Region_map_order_key"
  ON "PhysicianVisitAnatomicalRegion"("physicianVisitAnatomicalMapId", "displayOrder");
CREATE INDEX "PVA_Region_map_idx"
  ON "PhysicianVisitAnatomicalRegion"("physicianVisitAnatomicalMapId");
CREATE INDEX "PVA_Region_view_idx"
  ON "PhysicianVisitAnatomicalRegion"("view");

ALTER TABLE "PhysicianVisitAnatomicalMap"
  ADD CONSTRAINT "PVA_Map_pvr_fk"
  FOREIGN KEY ("physicianVisitRecordId") REFERENCES "PhysicianVisitRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PhysicianVisitAnatomicalRegion"
  ADD CONSTRAINT "PVA_Region_map_fk"
  FOREIGN KEY ("physicianVisitAnatomicalMapId") REFERENCES "PhysicianVisitAnatomicalMap"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- JSONB is permitted only for strict versioned brush geometry. These limits
-- are technical anti-abuse limits, not clinical limits or classifications.
CREATE FUNCTION "fpv3_5b_geometry_is_valid"(input_geometry JSONB)
RETURNS BOOLEAN AS $$
DECLARE
  stroke JSONB;
  point JSONB;
  radius_value NUMERIC;
  x_value NUMERIC;
  y_value NUMERIC;
  total_points INTEGER := 0;
BEGIN
  IF jsonb_typeof(input_geometry) IS DISTINCT FROM 'object'
     OR NOT (input_geometry ? 'version')
     OR NOT (input_geometry ? 'strokes')
     OR (SELECT count(*) FROM jsonb_object_keys(input_geometry)) <> 2
     OR jsonb_typeof(input_geometry->'version') IS DISTINCT FROM 'number'
     OR (input_geometry->>'version')::numeric <> 1
     OR jsonb_typeof(input_geometry->'strokes') IS DISTINCT FROM 'array'
     OR jsonb_array_length(input_geometry->'strokes') NOT BETWEEN 1 AND 512 THEN
    RETURN false;
  END IF;

  FOR stroke IN SELECT value FROM jsonb_array_elements(input_geometry->'strokes')
  LOOP
    IF jsonb_typeof(stroke) IS DISTINCT FROM 'object'
       OR NOT (stroke ? 'radius')
       OR NOT (stroke ? 'points')
       OR (SELECT count(*) FROM jsonb_object_keys(stroke)) <> 2
       OR jsonb_typeof(stroke->'radius') IS DISTINCT FROM 'number'
       OR jsonb_typeof(stroke->'points') IS DISTINCT FROM 'array'
       OR jsonb_array_length(stroke->'points') = 0 THEN
      RETURN false;
    END IF;

    radius_value := (stroke->>'radius')::numeric;
    IF radius_value <= 0 OR radius_value > 1 THEN
      RETURN false;
    END IF;

    total_points := total_points + jsonb_array_length(stroke->'points');
    IF total_points > 4096 THEN
      RETURN false;
    END IF;

    FOR point IN SELECT value FROM jsonb_array_elements(stroke->'points')
    LOOP
      IF jsonb_typeof(point) IS DISTINCT FROM 'object'
         OR NOT (point ? 'x')
         OR NOT (point ? 'y')
         OR (SELECT count(*) FROM jsonb_object_keys(point)) <> 2
         OR jsonb_typeof(point->'x') IS DISTINCT FROM 'number'
         OR jsonb_typeof(point->'y') IS DISTINCT FROM 'number' THEN
        RETURN false;
      END IF;

      x_value := (point->>'x')::numeric;
      y_value := (point->>'y')::numeric;
      IF x_value < 0 OR x_value > 1 OR y_value < 0 OR y_value > 1 THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

ALTER TABLE "PhysicianVisitAnatomicalRegion"
  ADD CONSTRAINT "PVA_Region_geometry_check"
  CHECK ("fpv3_5b_geometry_is_valid"("geometry"));

-- The map container directly owns the PhysicianVisitRecord and reuses the
-- accepted FPV-3 correction-window and deferred-owner functions.
CREATE TRIGGER "PVA_Map_correction_window"
BEFORE INSERT OR UPDATE OR DELETE ON "PhysicianVisitAnatomicalMap"
FOR EACH ROW EXECUTE FUNCTION "fpv3_enforce_canonical_correction_window"();

CREATE CONSTRAINT TRIGGER "PVA_Map_finalized_owner"
AFTER INSERT ON "PhysicianVisitAnatomicalMap"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_require_finalized_canonical_owner"();

CREATE FUNCTION "fpv3_5b_enforce_region_correction_window"()
RETURNS TRIGGER AS $$
DECLARE
  map_id UUID;
  record_status TEXT;
  occurred_at TIMESTAMP(3);
BEGIN
  map_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."physicianVisitAnatomicalMapId"
    ELSE NEW."physicianVisitAnatomicalMapId"
  END;

  EXECUTE format(
    'SELECT pvr."status"::text, v."visitOccurredAt"
       FROM %I."PhysicianVisitAnatomicalMap" anatomical_map
       JOIN %I."PhysicianVisitRecord" pvr
         ON pvr."id" = anatomical_map."physicianVisitRecordId"
       JOIN %I."Visit" v ON v."id" = pvr."visitId"
      WHERE anatomical_map."id" = $1
      FOR SHARE OF anatomical_map, pvr, v',
    TG_TABLE_SCHEMA,
    TG_TABLE_SCHEMA,
    TG_TABLE_SCHEMA
  ) INTO record_status, occurred_at USING map_id;

  IF record_status IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3.5B integrity: canonical anatomical map owner is missing';
  END IF;

  IF TG_OP = 'INSERT' AND record_status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  IF record_status <> 'FINALIZED' OR occurred_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3.5B integrity: canonical anatomical map correction requires a finalized encounter';
  END IF;

  IF (clock_timestamp() AT TIME ZONE 'UTC') >= occurred_at + INTERVAL '24 hours' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3.5B hard lock: canonical anatomical map correction window is closed';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."physicianVisitAnatomicalMapId" IS DISTINCT FROM OLD."physicianVisitAnatomicalMapId"
       OR NEW."displayOrder" IS DISTINCT FROM OLD."displayOrder"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'FPV-3.5B integrity: canonical anatomical region identity is immutable';
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

CREATE TRIGGER "PVA_Region_correction_window"
BEFORE INSERT OR UPDATE OR DELETE ON "PhysicianVisitAnatomicalRegion"
FOR EACH ROW EXECUTE FUNCTION "fpv3_5b_enforce_region_correction_window"();

CREATE FUNCTION "fpv3_5b_require_finalized_region_owner"()
RETURNS TRIGGER AS $$
DECLARE
  owner_is_finalized BOOLEAN;
BEGIN
  EXECUTE format(
    'SELECT pvr."status"::text = ''FINALIZED''
       FROM %I."PhysicianVisitAnatomicalMap" anatomical_map
       JOIN %I."PhysicianVisitRecord" pvr
         ON pvr."id" = anatomical_map."physicianVisitRecordId"
      WHERE anatomical_map."id" = $1',
    TG_TABLE_SCHEMA,
    TG_TABLE_SCHEMA
  ) INTO owner_is_finalized USING NEW."physicianVisitAnatomicalMapId";

  IF owner_is_finalized IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3.5B integrity: canonical anatomical regions require a finalized PhysicianVisitRecord at commit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "PVA_Region_finalized_owner"
AFTER INSERT ON "PhysicianVisitAnatomicalRegion"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_5b_require_finalized_region_owner"();

-- Empty Draft maps are valid, but no empty canonical container may survive a
-- transaction. Deferred checks permit container-first creation and teardown.
CREATE FUNCTION "fpv3_5b_require_nonempty_map"()
RETURNS TRIGGER AS $$
DECLARE
  map_id UUID;
  map_exists BOOLEAN;
  map_is_nonempty BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'PhysicianVisitAnatomicalMap' THEN
    map_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    map_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD."physicianVisitAnatomicalMapId"
      ELSE NEW."physicianVisitAnatomicalMapId"
    END;
  END IF;

  EXECUTE format(
    'SELECT true,
            EXISTS (
              SELECT 1
                FROM %I."PhysicianVisitAnatomicalRegion" region
               WHERE region."physicianVisitAnatomicalMapId" = anatomical_map."id"
            )
       FROM %I."PhysicianVisitAnatomicalMap" anatomical_map
      WHERE anatomical_map."id" = $1',
    TG_TABLE_SCHEMA,
    TG_TABLE_SCHEMA
  ) INTO map_exists, map_is_nonempty USING map_id;

  IF map_exists IS TRUE AND map_is_nonempty IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3.5B integrity: canonical anatomical map must contain a region';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "PVA_Map_nonempty"
AFTER INSERT OR UPDATE ON "PhysicianVisitAnatomicalMap"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_5b_require_nonempty_map"();

CREATE CONSTRAINT TRIGGER "PVA_Region_nonempty"
AFTER INSERT OR UPDATE OR DELETE ON "PhysicianVisitAnatomicalRegion"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_5b_require_nonempty_map"();
