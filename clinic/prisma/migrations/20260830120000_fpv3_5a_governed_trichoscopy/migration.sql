-- FPV-3.5A adds only visit-scoped, physician-owned canonical Trichoscopy.
-- No patient, legacy, Journey, Effective State, or synthetic data is copied
-- or backfilled by this migration.

CREATE TYPE "PhysicianTrichoscopyFindingCode" AS ENUM (
  'VELLUS_HAIRS',
  'CORKSCREW_HAIRS',
  'ANISOTRICHOSIS',
  'EXCLAMATION_TAPERING_HAIRS',
  'SINGLE_HAIR_FOLLICULAR_UNITS',
  'COUDABILITY_HAIRS',
  'YELLOW_DOTS',
  'PIGTAIL_CIRCLE_HAIRS',
  'FOLLICULAR_PLUGS',
  'UPRIGHT_REGROWING_HAIRS',
  'PUSTULES',
  'PERIFOLLICULAR_SCALE',
  'BLACK_DOTS',
  'PERIFOLLICULAR_ERYTHEMA',
  'RED_DOTS',
  'INTERFOLLICULAR_SCALES',
  'FOLLICULAR_DROPOUT',
  'DYSPIGMENTATION',
  'PERIPILAR_SIGN',
  'ARBORIZING_DILATED_BLOOD_VESSELS',
  'BROKEN_HAIRS',
  'GLOMERULAR_BLOOD_VESSELS',
  'V_SIGN',
  'SERPIGINOUS_BLOOD_VESSELS',
  'HOOK_HAIRS',
  'PILI_TORTI',
  'COILED_HAIRS',
  'WIGGLY_SQUIGGLY_HAIR',
  'FLAME_HAIRS',
  'TRICHOPTILOSIS',
  'TULIP_HAIRS',
  'POLYTRICHIA',
  'COMMA_HAIRS',
  'MILKY_WHITE_STRUCTURELESS_AREAS',
  'ZIGZAG_HAIRS'
);

CREATE TABLE "PhysicianVisitTrichoscopy" (
  "id" UUID NOT NULL,
  "physicianVisitRecordId" UUID NOT NULL,
  "otherFindingText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhysicianVisitTrichoscopy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PhysicianVisitTrichoscopy_other_finding_text_check"
    CHECK (
      "otherFindingText" IS NULL
      OR (
        length(btrim("otherFindingText")) > 0
        AND char_length("otherFindingText") <= 16000
      )
    )
);

CREATE TABLE "PhysicianVisitTrichoscopyFinding" (
  "id" UUID NOT NULL,
  "physicianVisitTrichoscopyId" UUID NOT NULL,
  "code" "PhysicianTrichoscopyFindingCode" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PhysicianVisitTrichoscopyFinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhysicianVisitTrichoscopy_physicianVisitRecordId_key"
  ON "PhysicianVisitTrichoscopy"("physicianVisitRecordId");
CREATE INDEX "PhysicianVisitTrichoscopy_createdAt_idx"
  ON "PhysicianVisitTrichoscopy"("createdAt");
CREATE UNIQUE INDEX "PhysicianVisitTrichoscopyFinding_physicianVisitTrichoscopyId_code_key"
  ON "PhysicianVisitTrichoscopyFinding"("physicianVisitTrichoscopyId", "code");
CREATE INDEX "PhysicianVisitTrichoscopyFinding_physicianVisitTrichoscopyId_idx"
  ON "PhysicianVisitTrichoscopyFinding"("physicianVisitTrichoscopyId");
CREATE INDEX "PhysicianVisitTrichoscopyFinding_code_idx"
  ON "PhysicianVisitTrichoscopyFinding"("code");

ALTER TABLE "PhysicianVisitTrichoscopy"
  ADD CONSTRAINT "PhysicianVisitTrichoscopy_physicianVisitRecordId_fkey"
  FOREIGN KEY ("physicianVisitRecordId") REFERENCES "PhysicianVisitRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PhysicianVisitTrichoscopyFinding"
  ADD CONSTRAINT "PhysicianVisitTrichoscopyFinding_physicianVisitTrichoscopyId_fkey"
  FOREIGN KEY ("physicianVisitTrichoscopyId") REFERENCES "PhysicianVisitTrichoscopy"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- The container can reuse FPV-3's owner and correction-window functions because
-- it directly owns the PhysicianVisitRecord foreign key.
CREATE TRIGGER "PhysicianVisitTrichoscopy_correction_window"
BEFORE INSERT OR UPDATE OR DELETE ON "PhysicianVisitTrichoscopy"
FOR EACH ROW EXECUTE FUNCTION "fpv3_enforce_canonical_correction_window"();

CREATE CONSTRAINT TRIGGER "PhysicianVisitTrichoscopy_finalized_owner"
AFTER INSERT ON "PhysicianVisitTrichoscopy"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_require_finalized_canonical_owner"();

-- Finding rows resolve the immutable encounter clock through their container.
CREATE FUNCTION "fpv3_5a_enforce_trichoscopy_finding_correction_window"()
RETURNS TRIGGER AS $$
DECLARE
  container_id UUID;
  record_status TEXT;
  occurred_at TIMESTAMP(3);
BEGIN
  container_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."physicianVisitTrichoscopyId"
    ELSE NEW."physicianVisitTrichoscopyId"
  END;

  EXECUTE format(
    'SELECT pvr."status"::text, v."visitOccurredAt"
       FROM %I."PhysicianVisitTrichoscopy" trichoscopy
       JOIN %I."PhysicianVisitRecord" pvr
         ON pvr."id" = trichoscopy."physicianVisitRecordId"
       JOIN %I."Visit" v ON v."id" = pvr."visitId"
      WHERE trichoscopy."id" = $1
      FOR SHARE OF trichoscopy, pvr, v',
    TG_TABLE_SCHEMA,
    TG_TABLE_SCHEMA,
    TG_TABLE_SCHEMA
  ) INTO record_status, occurred_at USING container_id;

  IF record_status IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3.5A integrity: canonical trichoscopy owner is missing';
  END IF;

  IF TG_OP = 'INSERT' AND record_status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  IF record_status <> 'FINALIZED' OR occurred_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3.5A integrity: canonical trichoscopy correction requires a finalized encounter';
  END IF;

  IF (clock_timestamp() AT TIME ZONE 'UTC') >= occurred_at + INTERVAL '24 hours' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3.5A hard lock: canonical trichoscopy correction window is closed';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."physicianVisitTrichoscopyId" IS DISTINCT FROM OLD."physicianVisitTrichoscopyId"
       OR NEW."code" IS DISTINCT FROM OLD."code"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'FPV-3.5A integrity: canonical trichoscopy finding identity is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PhysicianVisitTrichoscopyFinding_correction_window"
BEFORE INSERT OR UPDATE OR DELETE ON "PhysicianVisitTrichoscopyFinding"
FOR EACH ROW EXECUTE FUNCTION "fpv3_5a_enforce_trichoscopy_finding_correction_window"();

CREATE FUNCTION "fpv3_5a_require_finalized_trichoscopy_finding_owner"()
RETURNS TRIGGER AS $$
DECLARE
  owner_is_finalized BOOLEAN;
BEGIN
  EXECUTE format(
    'SELECT pvr."status"::text = ''FINALIZED''
       FROM %I."PhysicianVisitTrichoscopy" trichoscopy
       JOIN %I."PhysicianVisitRecord" pvr
         ON pvr."id" = trichoscopy."physicianVisitRecordId"
      WHERE trichoscopy."id" = $1',
    TG_TABLE_SCHEMA,
    TG_TABLE_SCHEMA
  ) INTO owner_is_finalized USING NEW."physicianVisitTrichoscopyId";

  IF owner_is_finalized IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3.5A integrity: canonical trichoscopy findings require a finalized PhysicianVisitRecord at commit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "PhysicianVisitTrichoscopyFinding_finalized_owner"
AFTER INSERT ON "PhysicianVisitTrichoscopyFinding"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_5a_require_finalized_trichoscopy_finding_owner"();

-- Empty draft sections are valid, but no empty canonical container may survive
-- commit. Deferred checks allow container-first materialization and finding-first
-- teardown within one transaction.
CREATE FUNCTION "fpv3_5a_require_nonempty_trichoscopy_container"()
RETURNS TRIGGER AS $$
DECLARE
  container_id UUID;
  container_exists BOOLEAN;
  container_is_nonempty BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'PhysicianVisitTrichoscopy' THEN
    container_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    container_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD."physicianVisitTrichoscopyId"
      ELSE NEW."physicianVisitTrichoscopyId"
    END;
  END IF;

  EXECUTE format(
    'SELECT true,
            trichoscopy."otherFindingText" IS NOT NULL
            OR EXISTS (
              SELECT 1
                FROM %I."PhysicianVisitTrichoscopyFinding" finding
               WHERE finding."physicianVisitTrichoscopyId" = trichoscopy."id"
            )
       FROM %I."PhysicianVisitTrichoscopy" trichoscopy
      WHERE trichoscopy."id" = $1',
    TG_TABLE_SCHEMA,
    TG_TABLE_SCHEMA
  ) INTO container_exists, container_is_nonempty USING container_id;

  IF container_exists IS TRUE AND container_is_nonempty IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3.5A integrity: canonical trichoscopy container must not be empty';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "PhysicianVisitTrichoscopy_nonempty"
AFTER INSERT OR UPDATE ON "PhysicianVisitTrichoscopy"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_5a_require_nonempty_trichoscopy_container"();

CREATE CONSTRAINT TRIGGER "PhysicianVisitTrichoscopyFinding_nonempty"
AFTER INSERT OR UPDATE OR DELETE ON "PhysicianVisitTrichoscopyFinding"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_5a_require_nonempty_trichoscopy_container"();
