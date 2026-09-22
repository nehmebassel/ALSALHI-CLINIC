-- FPV-3.5A closure hardening: reject physician other-finding text made only
-- from the explicitly governed whitespace characters (space, tab, LF, CR).
-- Meaningful text is stored byte-for-byte as submitted; no data is rewritten.

ALTER TABLE "PhysicianVisitTrichoscopy"
  DROP CONSTRAINT "PhysicianVisitTrichoscopy_other_finding_text_check",
  ADD CONSTRAINT "PhysicianVisitTrichoscopy_other_finding_text_check"
    CHECK (
      "otherFindingText" IS NULL
      OR (
        length(btrim("otherFindingText", E' \t\n\r')) > 0
        AND char_length("otherFindingText") <= 16000
      )
    );
