-- FPV-3 adds only visit-scoped, physician-owned canonical observations.
-- No patient, legacy Measurement, ClinicianAssessment, TimelineEvent, Journey,
-- or synthetic data is copied or backfilled by this migration.

CREATE TYPE "PhysicianHairPullResult" AS ENUM (
  'POSITIVE',
  'NEGATIVE',
  'NOT_RECORDED'
);

CREATE TYPE "PhysicianHairPartingFinding" AS ENUM (
  'UNIVERSAL',
  'FRONTAL_THINNER',
  'CROWN_THINNER',
  'VERTEX_THINNER'
);

CREATE TYPE "PhysicianVisitMeasurementCode" AS ENUM (
  'SHEDDING',
  'DENSITY_LOSS',
  'ITCH',
  'BURNING',
  'SCALP_PAIN'
);

CREATE TYPE "PhysicianMcuFvBasic" AS ENUM (
  'L', 'M0', 'M1', 'M2', 'M3', 'C0', 'C1', 'C2', 'C3', 'U1', 'U2', 'U3'
);

CREATE TYPE "PhysicianMcuFvFrontal" AS ENUM ('F1', 'F2', 'F3');
CREATE TYPE "PhysicianMcuFvVertex" AS ENUM ('V1', 'V2', 'V3');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PHYSICIAN_CLINICAL_CORRECTION';

CREATE TABLE "PhysicianClinicalExamination" (
  "id" UUID NOT NULL,
  "physicianVisitRecordId" UUID NOT NULL,
  "hairPull" "PhysicianHairPullResult",
  "hairParting" "PhysicianHairPartingFinding"[] NOT NULL DEFAULT ARRAY[]::"PhysicianHairPartingFinding"[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhysicianClinicalExamination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhysicianVisitMeasurement" (
  "id" UUID NOT NULL,
  "physicianVisitRecordId" UUID NOT NULL,
  "code" "PhysicianVisitMeasurementCode" NOT NULL,
  "value" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhysicianVisitMeasurement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PhysicianVisitMeasurement_value_check" CHECK ("value" BETWEEN 0 AND 5)
);

CREATE TABLE "PhysicianPatternAssessment" (
  "id" UUID NOT NULL,
  "physicianVisitRecordId" UUID NOT NULL,
  "sinclair" INTEGER,
  "mcuFvBasic" "PhysicianMcuFvBasic",
  "mcuFvFrontal" "PhysicianMcuFvFrontal",
  "mcuFvVertex" "PhysicianMcuFvVertex",
  "hairLineMidlineCm" NUMERIC,
  "hairLineRightSideCm" NUMERIC,
  "hairLineLeftSideCm" NUMERIC,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhysicianPatternAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PhysicianPatternAssessment_sinclair_check"
    CHECK ("sinclair" IS NULL OR "sinclair" BETWEEN 1 AND 5),
  CONSTRAINT "PhysicianPatternAssessment_mcu_fv_check"
    CHECK (
      ("mcuFvBasic" IS NULL AND "mcuFvFrontal" IS NULL AND "mcuFvVertex" IS NULL)
      OR "mcuFvBasic" IS NOT NULL
    ),
  CONSTRAINT "PhysicianPatternAssessment_hair_line_midline_check"
    CHECK ("hairLineMidlineCm" IS NULL OR "hairLineMidlineCm" >= 0),
  CONSTRAINT "PhysicianPatternAssessment_hair_line_right_check"
    CHECK ("hairLineRightSideCm" IS NULL OR "hairLineRightSideCm" >= 0),
  CONSTRAINT "PhysicianPatternAssessment_hair_line_left_check"
    CHECK ("hairLineLeftSideCm" IS NULL OR "hairLineLeftSideCm" >= 0),
  CONSTRAINT "PhysicianPatternAssessment_nonempty_check"
    CHECK (
      "sinclair" IS NOT NULL
      OR "mcuFvBasic" IS NOT NULL
      OR "hairLineMidlineCm" IS NOT NULL
      OR "hairLineRightSideCm" IS NOT NULL
      OR "hairLineLeftSideCm" IS NOT NULL
    )
);

CREATE UNIQUE INDEX "PhysicianClinicalExamination_physicianVisitRecordId_key"
  ON "PhysicianClinicalExamination"("physicianVisitRecordId");
CREATE INDEX "PhysicianClinicalExamination_createdAt_idx"
  ON "PhysicianClinicalExamination"("createdAt");

CREATE UNIQUE INDEX "PhysicianVisitMeasurement_physicianVisitRecordId_code_key"
  ON "PhysicianVisitMeasurement"("physicianVisitRecordId", "code");
CREATE INDEX "PhysicianVisitMeasurement_physicianVisitRecordId_idx"
  ON "PhysicianVisitMeasurement"("physicianVisitRecordId");
CREATE INDEX "PhysicianVisitMeasurement_code_idx"
  ON "PhysicianVisitMeasurement"("code");

CREATE UNIQUE INDEX "PhysicianPatternAssessment_physicianVisitRecordId_key"
  ON "PhysicianPatternAssessment"("physicianVisitRecordId");
CREATE INDEX "PhysicianPatternAssessment_createdAt_idx"
  ON "PhysicianPatternAssessment"("createdAt");

ALTER TABLE "PhysicianClinicalExamination"
  ADD CONSTRAINT "PhysicianClinicalExamination_physicianVisitRecordId_fkey"
  FOREIGN KEY ("physicianVisitRecordId") REFERENCES "PhysicianVisitRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PhysicianVisitMeasurement"
  ADD CONSTRAINT "PhysicianVisitMeasurement_physicianVisitRecordId_fkey"
  FOREIGN KEY ("physicianVisitRecordId") REFERENCES "PhysicianVisitRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PhysicianPatternAssessment"
  ADD CONSTRAINT "PhysicianPatternAssessment_physicianVisitRecordId_fkey"
  FOREIGN KEY ("physicianVisitRecordId") REFERENCES "PhysicianVisitRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "fpv3_hair_parting_is_normalized"(
  input_values "PhysicianHairPartingFinding"[]
)
RETURNS BOOLEAN AS $$
  SELECT input_values = ARRAY(
    SELECT candidate
    FROM unnest(ARRAY[
      'UNIVERSAL',
      'FRONTAL_THINNER',
      'CROWN_THINNER',
      'VERTEX_THINNER'
    ]::"PhysicianHairPartingFinding"[]) AS candidate
    WHERE candidate = ANY(input_values)
  );
$$ LANGUAGE SQL IMMUTABLE STRICT;

ALTER TABLE "PhysicianClinicalExamination"
  ADD CONSTRAINT "PhysicianClinicalExamination_nonempty_check"
    CHECK ("hairPull" IS NOT NULL OR cardinality("hairParting") > 0),
  ADD CONSTRAINT "PhysicianClinicalExamination_hair_parting_check"
    CHECK (
      array_position("hairParting", NULL) IS NULL
      AND cardinality("hairParting") <= 4
      AND "fpv3_hair_parting_is_normalized"("hairParting")
    );

-- Initial materialization is inserted while the lifecycle envelope is DRAFT
-- and is valid only if the same transaction reaches FINALIZED before commit.
CREATE FUNCTION "fpv3_require_finalized_canonical_owner"()
RETURNS TRIGGER AS $$
DECLARE
  owner_is_finalized BOOLEAN;
BEGIN
  EXECUTE format(
    'SELECT pvr."status"::text = ''FINALIZED''
       FROM %I."PhysicianVisitRecord" pvr
      WHERE pvr."id" = $1',
    TG_TABLE_SCHEMA
  ) INTO owner_is_finalized USING NEW."physicianVisitRecordId";

  IF owner_is_finalized IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FPV-3 integrity: canonical clinical rows require a finalized PhysicianVisitRecord at commit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- All post-finalization direct mutations are governed by the immutable
-- encounter clock. The trigger intentionally allows a first INSERT while the
-- owner is DRAFT so late first Finalize can materialize atomically.
CREATE FUNCTION "fpv3_enforce_canonical_correction_window"()
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

  IF clock_timestamp() >= occurred_at + INTERVAL '24 hours' THEN
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
    NEW."updatedAt" := clock_timestamp();
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PhysicianClinicalExamination_correction_window"
BEFORE INSERT OR UPDATE OR DELETE ON "PhysicianClinicalExamination"
FOR EACH ROW EXECUTE FUNCTION "fpv3_enforce_canonical_correction_window"();

CREATE TRIGGER "PhysicianVisitMeasurement_correction_window"
BEFORE INSERT OR UPDATE OR DELETE ON "PhysicianVisitMeasurement"
FOR EACH ROW EXECUTE FUNCTION "fpv3_enforce_canonical_correction_window"();

CREATE TRIGGER "PhysicianPatternAssessment_correction_window"
BEFORE INSERT OR UPDATE OR DELETE ON "PhysicianPatternAssessment"
FOR EACH ROW EXECUTE FUNCTION "fpv3_enforce_canonical_correction_window"();

CREATE CONSTRAINT TRIGGER "PhysicianClinicalExamination_finalized_owner"
AFTER INSERT ON "PhysicianClinicalExamination"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_require_finalized_canonical_owner"();

CREATE CONSTRAINT TRIGGER "PhysicianVisitMeasurement_finalized_owner"
AFTER INSERT ON "PhysicianVisitMeasurement"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_require_finalized_canonical_owner"();

CREATE CONSTRAINT TRIGGER "PhysicianPatternAssessment_finalized_owner"
AFTER INSERT ON "PhysicianPatternAssessment"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "fpv3_require_finalized_canonical_owner"();
