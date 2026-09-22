-- Post-FPV Anatomical Map closure: persist an optional governed physician-
-- confirmed anatomical identity per canonical region. Historical rows remain
-- NULL; no geometry, note, color, or clinical data is rewritten.

CREATE TYPE "PhysicianAnatomicalRegionCode" AS ENUM (
  'FRONTAL_SCALP',
  'MID_SCALP',
  'VERTEX_CROWN',
  'RIGHT_TEMPORAL',
  'LEFT_TEMPORAL',
  'RIGHT_PARIETAL',
  'LEFT_PARIETAL',
  'RIGHT_OCCIPITAL',
  'LEFT_OCCIPITAL'
);

ALTER TABLE "PhysicianVisitAnatomicalRegion"
  ADD COLUMN "anatomicalRegionCode" "PhysicianAnatomicalRegionCode";
