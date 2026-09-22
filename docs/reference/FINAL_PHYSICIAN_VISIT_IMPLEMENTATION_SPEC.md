# Final Physician Visit — Current Governing Implementation Specification

Consolidated through implemented FPV-7; effective 2026-09-03.

This file is the active Final Physician Visit architecture reference. It distinguishes **closed lifecycle infrastructure**, **implemented FPV-3 through FPV-4 governed clinical domains**, **implemented FPV-5 Visit Workspace UI**, **implemented FPV-6 Physician Hair Journey read-model cutover**, **implemented FPV-7 Final Physician Workflow Integration & Polish**, and **deferred later domains**.

## 1. Ownership boundary

Patient Pre-Visit History and physician-authored medical records are separate domains. Patient Interview, Clinical Story, Full Interview and Patient Hair History may be shown to the physician as reference, but they never become physician clinical truth automatically. No patient response ID, answer ID or patient provenance identifier may be used to manufacture physician authorship.

## 2. Visit and episode model

A clinical concern is represented longitudinally by `ClinicalEpisode`. Individual physician visits are immutable historical snapshots inside the episode. Visit 1 becomes the physician baseline; later visits document new observations and decisions prospectively. FPV-4 Effective Physician State is derived by replaying finalized physician decisions ordered by authoritative `visitOccurredAt ASC`, with stable bytewise `Visit.id` as the tie-break. It is not stored as a second mutable source of truth.

## 3. Roles

- STAFF: may prepare/read/edit the physician Draft under the current pilot role model.
- PHYSICIAN: all Draft abilities plus Begin Encounter, Finalize, governed direct correction within the correction window, and Addendum after hard lock.
- No generic staff/admin bypass may sign physician clinical content.

## 4. Encounter clock

Draft preparation is not encounter start. Physician-only Begin Encounter assigns `Visit.visitOccurredAt = serverNow` exactly once. `visitOccurredAt` is server-owned, immutable once assigned and must not be derived from Visit creation, patient submission, invitation time, Draft preparation, Finalize time or browser time.

## 5. Draft

`PhysicianVisitRecord.draftJson` is an editable work buffer with optimistic `draftVersion`. Draft does not alter Journey or the finalized Effective Physician State projection. FPV-1.1 bounds Draft section size/depth/node count and blocks patient-provenance aliases. Arbitrary Draft JSON is never sufficient to create canonical clinical truth; each materialized clinical domain requires strict field-level validation.

## 6. Finalize lifecycle

Finalize is PHYSICIAN-only and uses a SERIALIZABLE transaction with row locks and authoritative PostgreSQL Draft reload. First Finalize records finalizing physician, server timestamp, Draft version, deterministic SHA-256 fingerprint and immutable first-finalization evidence. Repeated Finalize is idempotent and returns existing evidence without rewriting the finalized row or duplicating audit events.

FPV-3 extends this transaction with authoritative Draft validation and field-by-field materialization for Clinical Examination, five physician measurements and Pattern Assessment. FPV-3.5A adds governed Trichoscopy, FPV-3.5B adds the governed Anatomical Map, and FPV-4 adds governed Diagnosis, Treatment and Procedure decisions to the same transaction. Finalize takes an Episode-scoped lock, validates longitudinal targets, materializes decisions, and proves that full chronological replay succeeds before commit. Finalize rejects every non-empty ungoverned clinical section. Clinical materialization, lifecycle transition, immutable evidence and audit commit atomically; replay remains idempotent and does not duplicate canonical rows.

## 7. Correction and Addendum

Direct correction of governed structured physician clinical data is permitted only while:

`serverNow < visitOccurredAt + 24 hours`

At exactly or after the deadline, direct mutation is forbidden. The original lifecycle envelope remains immutable; correction changes only separately governed canonical clinical records and must append old/new/actor/server-time audit evidence atomically.

Late first Finalize is allowed but does not reopen the correction clock. After the window closes, later documentation is a new append-only Addendum. Addendum never rewrites the original structured record.

## 8. Database integrity through FPV-4

- `AuditLog`: database append-only; UPDATE/DELETE rejected.
- Finalized `PhysicianVisitRecord`: full-row immutable; DRAFT → FINALIZED transition allowed, later UPDATE/DELETE rejected.
- `Visit`: `visitOccurredAt` write-once; after associated physician record is FINALIZED, the entire Visit row is immutable.
- `PhysicianVisitAddendum`: append-only.
- Canonical Draft fingerprint uses locale-independent deterministic object-key ordering and SHA-256 of canonical UTF-8 bytes.
- FPV-3 canonical observation tables enforce stable numeric, uniqueness and ownership constraints.
- PostgreSQL rejects canonical FPV-3 INSERT, UPDATE and DELETE at or after `visitOccurredAt + 24 hours`; deferred ownership checks preserve atomic initial materialization, including late first Finalize.
- FPV-3.5A applies the same INSERT/UPDATE/DELETE deadline lock to its Trichoscopy container and finding rows, requires finalized ownership at commit and rejects any surviving empty canonical Trichoscopy container.
- FPV-3.5B applies the same deadline to its Anatomical Map container and region rows, requires finalized ownership at commit, rejects any surviving empty canonical map and validates canonical JSONB geometry at PostgreSQL level.
- FPV-4 decision rows use composite ownership constraints and PostgreSQL triggers to reject cross-patient, cross-clinic, cross-Episode, cross-Visit and cross-physician-record targets, future performed dates and non-finalized ownership.
- FPV-4 keeps decision ID, action and longitudinal identity immutable during content correction and applies the exact finalized-owner correction deadline to decision INSERT/UPDATE/DELETE.
- Patient Context versions, items, reviews and reconciliations are append-only; review/reconciliation must target the exact immutable version and fingerprint.

## 9. Implemented governed clinical domains through FPV-4

FPV-3 introduces only governed physician-owned canonical records and does not reuse patient/legacy physician-looking records as source-of-truth.

### Clinical Examination

Hair Pull values: `POSITIVE`, `NEGATIVE`, `NOT_RECORDED`. Omitted/not-recorded is not negative.

Hair Parting selected findings: `UNIVERSAL`, `FRONTAL_THINNER`, `CROWN_THINNER`, `VERTEX_THINNER`. Selection is optional/multi-select; unselected is not explicit negative.

### Five physician measures

- Shedding Severity
- Density Loss
- Itch
- Burning
- Scalp Pain

Each is optional integer 0–5. Zero is a real recorded value; blank/no-data is not zero. No patient Hair History measurement may be promoted automatically.

### Pattern

Sinclair: optional integer 1–5.

MCU/FV: structured classification, never numeric ratio. Basic exactly one when recorded: `L`, `M0–M3`, `C0–C3`, `U1–U3`; optional F component `F1–F3`; optional V component `V1–V3`. Derived display code order: Basic + optional F + optional V.

Hair line distance: three independent optional values — Midline, Right side, Left side — in centimeters (cm); decimals allowed; finite and non-negative; no invented maximum, fixed precision or fixed scale.

### Trichoscopy

The optional Draft section is exactly a plain object with optional `selectedFindingCodes` and optional `otherFindingText`. Unknown keys, unknown codes and duplicate codes are rejected. An explicit empty selection is valid and produces no placeholder canonical row unless other-finding text is recorded.

The approved code/label catalogue and canonical order are:

1. `VELLUS_HAIRS` — Vellus hairs
2. `CORKSCREW_HAIRS` — Corkscrew hairs
3. `ANISOTRICHOSIS` — Anisotrichosis
4. `EXCLAMATION_TAPERING_HAIRS` — Exclamation (tapering) hairs
5. `SINGLE_HAIR_FOLLICULAR_UNITS` — Single-hair follicular units
6. `COUDABILITY_HAIRS` — Coudability hairs
7. `YELLOW_DOTS` — Yellow dots
8. `PIGTAIL_CIRCLE_HAIRS` — Pigtail (circle) hairs
9. `FOLLICULAR_PLUGS` — Follicular plugs
10. `UPRIGHT_REGROWING_HAIRS` — Upright regrowing hairs
11. `PUSTULES` — Pustules
12. `PERIFOLLICULAR_SCALE` — Perifollicular scale
13. `BLACK_DOTS` — Black dots
14. `PERIFOLLICULAR_ERYTHEMA` — Perifollicular erythema
15. `RED_DOTS` — Red dots
16. `INTERFOLLICULAR_SCALES` — Interfollicular scales
17. `FOLLICULAR_DROPOUT` — Follicular dropout
18. `DYSPIGMENTATION` — Dyspigmentation
19. `PERIPILAR_SIGN` — Peripilar sign
20. `ARBORIZING_DILATED_BLOOD_VESSELS` — Arborizing dilated blood vessels
21. `BROKEN_HAIRS` — Broken hairs
22. `GLOMERULAR_BLOOD_VESSELS` — Glomerular blood vessels
23. `V_SIGN` — V-sign
24. `SERPIGINOUS_BLOOD_VESSELS` — Serpiginous blood vessels
25. `HOOK_HAIRS` — Hook hairs
26. `PILI_TORTI` — Pili torti
27. `COILED_HAIRS` — Coiled hairs
28. `WIGGLY_SQUIGGLY_HAIR` — Wiggly Squiggly hair
29. `FLAME_HAIRS` — Flame hairs
30. `TRICHOPTILOSIS` — Trichoptilosis
31. `TULIP_HAIRS` — Tulip hairs
32. `POLYTRICHIA` — Polytrichia
33. `COMMA_HAIRS` — Comma hairs
34. `MILKY_WHITE_STRUCTURELESS_AREAS` — Milky-white structureless areas
35. `ZIGZAG_HAIRS` — Zigzag hairs

Other-finding text is optional, must be nonblank after validation-only trimming and is defensively limited to 16,000 characters. Accepted text is stored and returned exactly, with no trimming or silent truncation. Canonical persistence uses one optional visit Trichoscopy container and unique typed finding rows; there is no patient/legacy backfill.

Direct correction exposes only `TRICHOSCOPY_SELECTED_FINDINGS` and `TRICHOSCOPY_OTHER_FINDING_TEXT`, each with closed `SET`/`OMIT` operations. Both use the established physician-only authorization, serializable row locking, immutable encounter deadline and append-only old/new audit evidence.

### Anatomical Map

The optional Draft section is exactly `{ regions: [...] }`. Each region contains exactly `view`, `geometry` and optional `noteText`/`displayColorHex`; no client template version or canonical ID is accepted. Views are exactly `FRONT`, `TOP`, `RIGHT_SIDE` and `LEFT_SIDE`.

Geometry is the narrow approved canonical JSONB exception. Version 1 contains only a nonempty `strokes` array; each stroke contains only positive normalized `radius` and a nonempty ordered `points` array; each point contains only finite numeric `x` and `y` in `[0,1]`. Arbitrary SVG/path data and metadata are rejected. Region/stroke/point limits are technical anti-abuse bounds only and carry no clinical meaning.

The map template version is server-owned and exactly 1. Region note is optional, meaningful after validation-only trimming, limited defensively to 16,000 characters and otherwise stored/read exactly. Optional color is normalized to uppercase `#RRGGBB` and is presentation-only: it does not encode a finding, diagnosis, severity or Pattern meaning. No structured mark-type catalogue is approved.

Canonical persistence uses at most one `PhysicianVisitAnatomicalMap` per physician visit record and ordered `PhysicianVisitAnatomicalRegion` rows. Empty Draft maps create no canonical placeholder. IDs are server/database generated. No patient, Clinical Story, Patient Hair History, legacy, TimelineEvent, ClinicianAssessment, Journey or synthetic value is promoted, and no prior-Visit geometry carries forward.

Direct correction exposes only `ANATOMICAL_MAP_REGIONS` with closed whole-set `SET`/`OMIT` operations. Correction replaces or removes the complete region set and atomically appends full old/new snapshots, actor and server time under the existing physician-only 24-hour rule. The map does not replace or infer Pattern Assessment. FPV-3.5B adds no UI, Journey projection or Effective Physician State behavior.

### FPV-4 Diagnosis

`PhysicianDiagnosis` is a stable Episode-scoped identity. Each finalized Visit records immutable ordered `PhysicianDiagnosisDecision` rows with action `ADD`, `REVISE` or `RESOLVE`. Diagnosis content is meaningful exact-preserved physician free text bounded at 16,000 characters; there is no fixed catalogue, automatic ICD mapping, severity/probability or confirmed/provisional taxonomy. Projection yields `ACTIVE` or `RESOLVED` identities with origin and latest-decision provenance.

### FPV-4 Treatment

`PhysicianTreatmentCourse` is a stable Episode-scoped identity. Finalized Visit decisions are `START`, `CONTINUE_EXISTING`, `MODIFY` or `STOP`. `MODIFY` is sparse and can change or clear only its governed name, regimen text and note fields. An unchanged active course carries forward without a mandatory `CONTINUE_EXISTING` event. Projection yields `ACTIVE` or `STOPPED` courses with origin and latest-decision provenance. Patient-reported current therapy is not automatically promoted into a physician course.

### FPV-4 Procedures

Finalized Procedure decisions are `PLAN`, `PERFORM` and `CANCEL_OR_DEFER`. Codes are exactly `PRP`, `MICRONEEDLING`, `HAIR_LASER`, `RED_LIGHT`, `MINOXIDIL_INJ`, `DUTASTERIDE_INJ`, `EXOSOME`, `CORTISONE_INJ`, `REGENERA`, `ACELL`, `HAIR_TRANSPLANT` and `OTHER`; `OTHER` requires exact-preserved physician text. `PERFORM` may be independent or link to an open `PhysicianProcedurePlan`; linked performance derives the plan code and changes its projected state to `FULFILLED`. `CANCEL_OR_DEFER` closes a plan as `CANCELLED_OR_DEFERRED` without inventing a narrower taxonomy. Actual performed dates cannot be future; optional planned dates may be future.

### FPV-4 Effective Physician State

The authoritative source is the normalized identity/decision history, never a mutable current-state row. Projection replays all finalized decisions for one `ClinicalEpisode` by `visitOccurredAt ASC`, then stable bytewise `Visit.id`, with decision order and ID tie-breaking inside a Visit. It returns diagnoses, treatment courses, procedure plans and performed Procedure events. Late Finalize is inserted at its authoritative encounter chronology and the complete Episode is replayed. Invalid targets and conflicting history reject the transaction atomically.

The canonical read keeps current-Visit decisions separate from the derived Effective Physician State. A DRAFT Visit shows no unfinalized decisions as canonical truth, while it may read the state derived from prior finalized Visits. Addendum remains append-only narrative and does not mutate or replay structured Effective Physician State.

Content correction uses `SET_CONTENT` only for the approved content fields while retaining decision ID, action and longitudinal target. Whole-decision `OMIT` may include an explicit replacement. Correction locks the Episode, applies the candidate change, replays the whole Episode and commits with old/new audit evidence only if every downstream dependency remains valid; it never cascades deletion or silently retargets another decision.

### FPV-4 Persistent Patient Context

Patient Context is a separate persistent patient-origin reference architecture. `PatientContextDefinition` is an extensible governed registry, but the active FPV-4 registry contains exactly: `MARITAL_SOCIAL_STATUS`, `CONTRACEPTIVE_USE`, `PREGNANCY_BREASTFEEDING_CONTEXT`, `PREVIOUSLY_DIAGNOSED_CONDITIONS`, `CURRENT_MEDICATIONS`, `ALLERGIES`, `PREVIOUS_HAIR_THERAPIES` and `CURRENT_HAIR_THERAPIES`.

Each official patient Final Submit may create an immutable `PatientContextVersion` with immutable `PatientContextItem` rows. Items retain definition, exact source question mappings, Clinical Interview/Visit evidence, structured category/subtype provenance, canonical payload fingerprint and source freshness. Unchanged prior items may carry forward unchanged. `CURRENT_MEDICATIONS` uses only `Q_HEALTH_MEDICATION_ITEMS`; current versus previous Hair Therapies is separated only by explicit `stillUsing = YES`. No missing, inferred or legacy value is fabricated.

`PatientContextReview` is physician-only append-only acknowledgement tied to the exact current version/fingerprint; it is not confirmation. `PatientContextReconciliation` is append-only physician-authored per-item reconciliation evidence tied to the exact version/fingerprint; it requires no free-text note and is not Diagnosis, Treatment, continuation or prescription. Stale fingerprint commands are rejected. Patient Context never promotes automatically into Effective Physician State.

## 10. FPV-5 Physician Visit Workspace UI

The existing physician patient workspace keeps exactly five primary tabs. FPV-5 is nested under Visits and provides a large-monitor, grid-based bilingual/RTL workspace. The Visit header shows authoritative patient/Visit context and status. STAFF may use the shared Draft preparation/edit capability; only PHYSICIAN may Begin Encounter, Finalize, record Context evidence or perform governed correction. The browser never supplies encounter time.

Every prepared physician Visit presents Patient Context as a visibly separate patient-reported reference with freshness, exact-version review state and per-item reconciliation evidence. Structured/list payloads retain separate item grouping, repeated values and governed field associations; internal question codes are not the primary physician-facing labels. Visit 1 authors a new physician baseline. Follow-up shows prior Effective Physician State read-only while loading only the current Visit's own Draft sections into controls. Examination, measures, Pattern, optional Trichoscopy and optional normalized Anatomical Map remain Visit-local. Longitudinal forms create only explicit Diagnosis, Treatment or Procedure decisions taken today; unchanged state is not duplicated. Target-based Draft and finalized decisions resolve human-readable Diagnosis, Treatment Course or Procedure Plan identity from available canonical state rather than displaying UUIDs.

Finalize review displays concise actual physician-authored Draft observations and decision content and delegates validation/materialization to the backend. Success switches to canonical finalized read-only truth, including position-labeled Hair Line Distance and non-editable four-view Anatomical Map geometry with presentation color and notes preserved. The performed-date UI maximum follows the established Riyadh clinic-date convention; server validation remains authoritative. Empty REVISE and no-op MODIFY decisions are not added locally. A conservative governed correction surface is available only while canonical server output reports the direct-correction window open; after hard lock, Addendum remains separate. Understandable localized errors cover optimistic Draft conflict, stale Context fingerprint, authorization, finalized state, correction expiry and invalid longitudinal targets.

FPV-5 adds no schema or migration and does not create a second Visit state model. FPV-6 then cuts Physician Hair Journey over to canonical finalized physician Visit data without altering Patient Hair History or adding a mutable Journey state model.

## 11. Later domains — not implemented by this baseline

Structured medication prescribing and dose/unit/route/frequency catalogues, Tests/Labs, Photos/Media workflow, Follow-up Plan, synthetic physician regeneration and HIS/EMR integration require later governed phases.

## 12. Read-model boundary

The physician canonical read distinguishes Draft from finalized canonical records, preserves omitted/zero and structured-classification semantics, exposes Hair Line distances in cm without binary floating-point output, returns Trichoscopy findings in approved catalogue order, and returns an Anatomical Map only from visit-scoped canonical rows. FPV-4 additionally returns distinct `visitDecisions`, derived `effectivePhysicianState` and versioned `patientContext` DTOs. It does not return unrestricted Draft JSON or merge patient/legacy records into physician truth.

## 13. No-cutover rule

FPV-4 Effective Physician State remains authoritative through its canonical backend projection. FPV-6 uses finalized physician Visit decisions and canonical Effective Physician State to build a read-only Physician Hair Journey; it does not backfill synthetic historical physician rows into `PhysicianVisitRecord` or FPV-4 longitudinal tables, and it does not use legacy mutable Journey rows as runtime truth.

## 14. Stop rather than invent

Stop for Owner/clinician clarification when implementation would require inventing clinical meaning, including Trichoscopy or Procedure codes beyond approved catalogues, diagnosis coding/severity/taxonomy, medication dose/unit/frequency catalogues, prescribing, treatment restart/resume, complex multi-session Procedure courses, Patient Context categories beyond the approved eight, structured Anatomical Map mark types, automatic clinical inference, HIS behavior or patient-to-physician promotion. Do not begin FPV-7 from this specification.
