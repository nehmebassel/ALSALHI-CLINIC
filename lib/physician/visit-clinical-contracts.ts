import {
  parseDiagnosisSection,
  parseTreatmentProceduresSection,
} from "./visit-longitudinal-contracts";

export const HAIR_PULL_RESULTS = [
  "POSITIVE",
  "NEGATIVE",
  "NOT_RECORDED",
] as const;

export const HAIR_PARTING_FINDINGS = [
  "UNIVERSAL",
  "FRONTAL_THINNER",
  "CROWN_THINNER",
  "VERTEX_THINNER",
] as const;

export const PHYSICIAN_MEASUREMENT_CODES = [
  "SHEDDING",
  "DENSITY_LOSS",
  "ITCH",
  "BURNING",
  "SCALP_PAIN",
] as const;

export const MCU_FV_BASIC_VALUES = [
  "L",
  "M0",
  "M1",
  "M2",
  "M3",
  "C0",
  "C1",
  "C2",
  "C3",
  "U1",
  "U2",
  "U3",
] as const;

export const MCU_FV_FRONTAL_VALUES = ["F1", "F2", "F3"] as const;
export const MCU_FV_VERTEX_VALUES = ["V1", "V2", "V3"] as const;
export const HAIR_LINE_POSITIONS = [
  "MIDLINE",
  "RIGHT_SIDE",
  "LEFT_SIDE",
] as const;

export const PHYSICIAN_ANATOMICAL_MAP_VIEWS = [
  "FRONT",
  "TOP",
  "RIGHT_SIDE",
  "LEFT_SIDE",
] as const;
export const PHYSICIAN_ANATOMICAL_REGION_CODES = [
  "FRONTAL_SCALP",
  "MID_SCALP",
  "VERTEX_CROWN",
  "RIGHT_TEMPORAL",
  "LEFT_TEMPORAL",
  "RIGHT_PARIETAL",
  "LEFT_PARIETAL",
  "RIGHT_OCCIPITAL",
  "LEFT_OCCIPITAL",
] as const;
export const PHYSICIAN_ANATOMICAL_REGION_CODES_BY_VIEW = {
  FRONT: ["FRONTAL_SCALP"],
  TOP: ["FRONTAL_SCALP", "MID_SCALP", "VERTEX_CROWN"],
  RIGHT_SIDE: ["RIGHT_TEMPORAL", "RIGHT_PARIETAL", "RIGHT_OCCIPITAL"],
  LEFT_SIDE: ["LEFT_TEMPORAL", "LEFT_PARIETAL", "LEFT_OCCIPITAL"],
} as const satisfies Record<PhysicianAnatomicalMapView, readonly PhysicianAnatomicalRegionCode[]>;
export const PHYSICIAN_ANATOMICAL_MAP_TEMPLATE_VERSION = 1 as const;
export const PHYSICIAN_ANATOMICAL_MAP_GEOMETRY_VERSION = 1 as const;
export const ANATOMICAL_MAP_NOTE_TEXT_MAX_LENGTH = 16_000;
// Technical anti-abuse limits only; they carry no clinical meaning.
export const ANATOMICAL_MAP_MAX_REGIONS = 128;
export const ANATOMICAL_MAP_MAX_STROKES = 512;
export const ANATOMICAL_MAP_MAX_POINTS = 4_096;

export const PHYSICIAN_TRICHOSCOPY_FINDINGS = [
  { code: "VELLUS_HAIRS", label: "Vellus hairs" },
  { code: "CORKSCREW_HAIRS", label: "Corkscrew hairs" },
  { code: "ANISOTRICHOSIS", label: "Anisotrichosis" },
  { code: "EXCLAMATION_TAPERING_HAIRS", label: "Exclamation (tapering) hairs" },
  { code: "SINGLE_HAIR_FOLLICULAR_UNITS", label: "Single-hair follicular units" },
  { code: "COUDABILITY_HAIRS", label: "Coudability hairs" },
  { code: "YELLOW_DOTS", label: "Yellow dots" },
  { code: "PIGTAIL_CIRCLE_HAIRS", label: "Pigtail (circle) hairs" },
  { code: "FOLLICULAR_PLUGS", label: "Follicular plugs" },
  { code: "UPRIGHT_REGROWING_HAIRS", label: "Upright regrowing hairs" },
  { code: "PUSTULES", label: "Pustules" },
  { code: "PERIFOLLICULAR_SCALE", label: "Perifollicular scale" },
  { code: "BLACK_DOTS", label: "Black dots" },
  { code: "PERIFOLLICULAR_ERYTHEMA", label: "Perifollicular erythema" },
  { code: "RED_DOTS", label: "Red dots" },
  { code: "INTERFOLLICULAR_SCALES", label: "Interfollicular scales" },
  { code: "FOLLICULAR_DROPOUT", label: "Follicular dropout" },
  { code: "DYSPIGMENTATION", label: "Dyspigmentation" },
  { code: "PERIPILAR_SIGN", label: "Peripilar sign" },
  { code: "ARBORIZING_DILATED_BLOOD_VESSELS", label: "Arborizing dilated blood vessels" },
  { code: "BROKEN_HAIRS", label: "Broken hairs" },
  { code: "GLOMERULAR_BLOOD_VESSELS", label: "Glomerular blood vessels" },
  { code: "V_SIGN", label: "V-sign" },
  { code: "SERPIGINOUS_BLOOD_VESSELS", label: "Serpiginous blood vessels" },
  { code: "HOOK_HAIRS", label: "Hook hairs" },
  { code: "PILI_TORTI", label: "Pili torti" },
  { code: "COILED_HAIRS", label: "Coiled hairs" },
  { code: "WIGGLY_SQUIGGLY_HAIR", label: "Wiggly Squiggly hair" },
  { code: "FLAME_HAIRS", label: "Flame hairs" },
  { code: "TRICHOPTILOSIS", label: "Trichoptilosis" },
  { code: "TULIP_HAIRS", label: "Tulip hairs" },
  { code: "POLYTRICHIA", label: "Polytrichia" },
  { code: "COMMA_HAIRS", label: "Comma hairs" },
  { code: "MILKY_WHITE_STRUCTURELESS_AREAS", label: "Milky-white structureless areas" },
  { code: "ZIGZAG_HAIRS", label: "Zigzag hairs" },
] as const;

export const PHYSICIAN_TRICHOSCOPY_FINDING_CODES =
  PHYSICIAN_TRICHOSCOPY_FINDINGS.map((finding) => finding.code);
export const TRICHOSCOPY_OTHER_FINDING_TEXT_MAX_LENGTH = 16_000;

export type HairPullResult = (typeof HAIR_PULL_RESULTS)[number];
export type HairPartingFinding = (typeof HAIR_PARTING_FINDINGS)[number];
export type PhysicianMeasurementCode =
  (typeof PHYSICIAN_MEASUREMENT_CODES)[number];
export type McuFvBasic = (typeof MCU_FV_BASIC_VALUES)[number];
export type McuFvFrontal = (typeof MCU_FV_FRONTAL_VALUES)[number];
export type McuFvVertex = (typeof MCU_FV_VERTEX_VALUES)[number];
export type HairLinePosition = (typeof HAIR_LINE_POSITIONS)[number];
export type PhysicianAnatomicalMapView =
  (typeof PHYSICIAN_ANATOMICAL_MAP_VIEWS)[number];
export type PhysicianAnatomicalRegionCode =
  (typeof PHYSICIAN_ANATOMICAL_REGION_CODES)[number];
export type PhysicianTrichoscopyFindingCode =
  (typeof PHYSICIAN_TRICHOSCOPY_FINDING_CODES)[number];

export interface GovernedClinicalExamination {
  hairPull?: HairPullResult;
  hairParting?: HairPartingFinding[];
}

export type GovernedPhysicianMeasurements = Partial<
  Record<PhysicianMeasurementCode, number>
>;

export interface GovernedMcuFvClassification {
  basic: McuFvBasic;
  frontal?: McuFvFrontal;
  vertex?: McuFvVertex;
}

export interface GovernedHairLineDistanceCm {
  midline?: number;
  rightSide?: number;
  leftSide?: number;
}

export interface GovernedPatternAssessment {
  sinclair?: number;
  mcuFv?: GovernedMcuFvClassification;
  hairLineDistanceCm?: GovernedHairLineDistanceCm;
}

export interface GovernedPhysicianTrichoscopy {
  selectedFindingCodes?: PhysicianTrichoscopyFindingCode[];
  otherFindingText?: string;
}

export interface GovernedAnatomicalMapPoint {
  x: number;
  y: number;
}

export interface GovernedAnatomicalMapStroke {
  radius: number;
  points: GovernedAnatomicalMapPoint[];
}

export interface GovernedAnatomicalMapGeometryV1 {
  version: typeof PHYSICIAN_ANATOMICAL_MAP_GEOMETRY_VERSION;
  strokes: GovernedAnatomicalMapStroke[];
}

export interface GovernedAnatomicalMapRegion {
  view: PhysicianAnatomicalMapView;
  anatomicalRegionCode?: PhysicianAnatomicalRegionCode;
  geometry: GovernedAnatomicalMapGeometryV1;
  noteText?: string;
  displayColorHex?: string;
}

export interface GovernedPhysicianAnatomicalMap {
  regions: GovernedAnatomicalMapRegion[];
}

export interface GovernedPhysicianVisitClinicalDraft {
  examination?: GovernedClinicalExamination;
  measurements?: GovernedPhysicianMeasurements;
  pattern?: GovernedPatternAssessment;
  trichoscopy?: GovernedPhysicianTrichoscopy;
  anatomicalMap?: GovernedPhysicianAnatomicalMap;
}

export type PhysicianClinicalCorrectionCommand =
  | {
      target: "HAIR_PULL";
      operation: "SET";
      value: HairPullResult;
    }
  | { target: "HAIR_PULL"; operation: "OMIT" }
  | {
      target: "HAIR_PARTING";
      operation: "SET";
      value: HairPartingFinding[];
    }
  | { target: "HAIR_PARTING"; operation: "OMIT" }
  | {
      target: "PHYSICIAN_MEASUREMENT";
      metric: PhysicianMeasurementCode;
      operation: "SET";
      value: number;
    }
  | {
      target: "PHYSICIAN_MEASUREMENT";
      metric: PhysicianMeasurementCode;
      operation: "OMIT";
    }
  | { target: "SINCLAIR"; operation: "SET"; value: number }
  | { target: "SINCLAIR"; operation: "OMIT" }
  | {
      target: "MCU_FV";
      operation: "SET";
      value: GovernedMcuFvClassification;
    }
  | { target: "MCU_FV"; operation: "OMIT" }
  | {
      target: "HAIR_LINE_DISTANCE";
      position: HairLinePosition;
      operation: "SET";
      value: number;
    }
  | {
      target: "HAIR_LINE_DISTANCE";
      position: HairLinePosition;
      operation: "OMIT";
    }
  | {
      target: "TRICHOSCOPY_SELECTED_FINDINGS";
      operation: "SET";
      value: PhysicianTrichoscopyFindingCode[];
    }
  | { target: "TRICHOSCOPY_SELECTED_FINDINGS"; operation: "OMIT" }
  | {
      target: "TRICHOSCOPY_OTHER_FINDING_TEXT";
      operation: "SET";
      value: string;
    }
  | { target: "TRICHOSCOPY_OTHER_FINDING_TEXT"; operation: "OMIT" }
  | {
      target: "ANATOMICAL_MAP_REGIONS";
      operation: "SET";
      value: GovernedAnatomicalMapRegion[];
    }
  | { target: "ANATOMICAL_MAP_REGIONS"; operation: "OMIT" };

export class PhysicianVisitClinicalContractError extends Error {
  constructor() {
    super("The governed physician clinical data is invalid.");
    this.name = "PhysicianVisitClinicalContractError";
  }
}

function invalid(): never {
  throw new PhysicianVisitClinicalContractError();
}

function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid();
  }
  return value as Record<string, unknown>;
}

function requirePlainObject(value: unknown): Record<string, unknown> {
  const object = requireObject(value);
  const prototype = Object.getPrototypeOf(object);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return object;
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) invalid();
}

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function requireIntegerInRange(value: unknown, minimum: number, maximum: number) {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalid();
  }
  return value as number;
}

function requireHairLineDistance(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid();
  }
  return value;
}

function requireNormalizedCoordinate(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    invalid();
  }
  return value;
}

function requireNormalizedBrushRadius(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 1
  ) {
    invalid();
  }
  return value;
}

function requireAnatomicalMapNoteText(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > ANATOMICAL_MAP_NOTE_TEXT_MAX_LENGTH
  ) {
    invalid();
  }
  return value;
}

function normalizeDisplayColorHex(value: unknown): string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) invalid();
  return value.toUpperCase();
}

export function parseAnatomicalMapGeometry(
  value: unknown,
): GovernedAnatomicalMapGeometryV1 {
  const geometry = requirePlainObject(value);
  assertExactKeys(geometry, ["version", "strokes"]);
  if (geometry.version !== PHYSICIAN_ANATOMICAL_MAP_GEOMETRY_VERSION) invalid();
  if (
    !Array.isArray(geometry.strokes) ||
    geometry.strokes.length === 0 ||
    geometry.strokes.length > ANATOMICAL_MAP_MAX_STROKES
  ) {
    invalid();
  }

  let pointCount = 0;
  const strokes = geometry.strokes.map((candidate) => {
    const stroke = requirePlainObject(candidate);
    assertExactKeys(stroke, ["radius", "points"]);
    if (!Array.isArray(stroke.points) || stroke.points.length === 0) invalid();
    pointCount += stroke.points.length;
    if (pointCount > ANATOMICAL_MAP_MAX_POINTS) invalid();
    return {
      radius: requireNormalizedBrushRadius(stroke.radius),
      points: stroke.points.map((pointCandidate) => {
        const point = requirePlainObject(pointCandidate);
        assertExactKeys(point, ["x", "y"]);
        if (!("x" in point) || !("y" in point)) invalid();
        return {
          x: requireNormalizedCoordinate(point.x),
          y: requireNormalizedCoordinate(point.y),
        };
      }),
    };
  });

  return {
    version: PHYSICIAN_ANATOMICAL_MAP_GEOMETRY_VERSION,
    strokes,
  };
}

export function parseAnatomicalMapRegions(
  value: unknown,
): GovernedAnatomicalMapRegion[] {
  if (!Array.isArray(value) || value.length > ANATOMICAL_MAP_MAX_REGIONS) {
    invalid();
  }
  let strokeCount = 0;
  let pointCount = 0;
  return value.map((candidate) => {
    const region = requirePlainObject(candidate);
    assertExactKeys(region, ["view", "anatomicalRegionCode", "geometry", "noteText", "displayColorHex"]);
    if (!isOneOf(region.view, PHYSICIAN_ANATOMICAL_MAP_VIEWS)) invalid();
    const geometry = parseAnatomicalMapGeometry(region.geometry);
    strokeCount += geometry.strokes.length;
    pointCount += geometry.strokes.reduce(
      (total, stroke) => total + stroke.points.length,
      0,
    );
    if (
      strokeCount > ANATOMICAL_MAP_MAX_STROKES ||
      pointCount > ANATOMICAL_MAP_MAX_POINTS
    ) {
      invalid();
    }
    const anatomicalRegionCode = region.anatomicalRegionCode !== undefined
      ? isOneOf(region.anatomicalRegionCode, PHYSICIAN_ANATOMICAL_REGION_CODES) ? region.anatomicalRegionCode : invalid()
      : undefined;
    if (anatomicalRegionCode && !(PHYSICIAN_ANATOMICAL_REGION_CODES_BY_VIEW[region.view] as readonly string[]).includes(anatomicalRegionCode)) invalid();
    return {
      view: region.view,
      ...(anatomicalRegionCode ? { anatomicalRegionCode } : {}),
      geometry,
      ...(region.noteText !== undefined
        ? { noteText: requireAnatomicalMapNoteText(region.noteText) }
        : {}),
      ...(region.displayColorHex !== undefined
        ? { displayColorHex: normalizeDisplayColorHex(region.displayColorHex) }
        : {}),
    };
  });
}

export function requireConfirmedAnatomicalMapRegions(
  regions: GovernedAnatomicalMapRegion[],
): GovernedAnatomicalMapRegion[] {
  if (regions.some((region) => !region.anatomicalRegionCode)) invalid();
  return regions;
}

export function parsePhysicianAnatomicalMap(
  value: unknown,
): GovernedPhysicianAnatomicalMap {
  const map = requirePlainObject(value);
  assertExactKeys(map, ["regions"]);
  if (!("regions" in map)) invalid();
  return { regions: parseAnatomicalMapRegions(map.regions) };
}

export function normalizeHairPartingFindings(
  value: unknown,
): HairPartingFinding[] {
  if (!Array.isArray(value)) invalid();
  const findings = value.map((item) => {
    if (!isOneOf(item, HAIR_PARTING_FINDINGS)) return invalid();
    return item;
  });
  if (new Set(findings).size !== findings.length) invalid();
  const selected = new Set(findings);
  return HAIR_PARTING_FINDINGS.filter((finding) => selected.has(finding));
}

export function parseClinicalExamination(
  value: unknown,
): GovernedClinicalExamination {
  const object = requireObject(value);
  assertExactKeys(object, ["hairPull", "hairParting"]);
  const result: GovernedClinicalExamination = {};
  if ("hairPull" in object) {
    if (!isOneOf(object.hairPull, HAIR_PULL_RESULTS)) invalid();
    result.hairPull = object.hairPull;
  }
  if ("hairParting" in object) {
    result.hairParting = normalizeHairPartingFindings(object.hairParting);
  }
  return result;
}

export function parsePhysicianMeasurements(
  value: unknown,
): GovernedPhysicianMeasurements {
  const object = requireObject(value);
  assertExactKeys(object, PHYSICIAN_MEASUREMENT_CODES);
  const result: GovernedPhysicianMeasurements = {};
  for (const code of PHYSICIAN_MEASUREMENT_CODES) {
    if (code in object) result[code] = requireIntegerInRange(object[code], 0, 5);
  }
  return result;
}

export function parseMcuFvClassification(
  value: unknown,
): GovernedMcuFvClassification {
  const object = requireObject(value);
  assertExactKeys(object, ["basic", "frontal", "vertex"]);
  if (!isOneOf(object.basic, MCU_FV_BASIC_VALUES)) invalid();
  const result: GovernedMcuFvClassification = { basic: object.basic };
  if ("frontal" in object) {
    if (!isOneOf(object.frontal, MCU_FV_FRONTAL_VALUES)) invalid();
    result.frontal = object.frontal;
  }
  if ("vertex" in object) {
    if (!isOneOf(object.vertex, MCU_FV_VERTEX_VALUES)) invalid();
    result.vertex = object.vertex;
  }
  return result;
}

export function deriveMcuFvDisplayCode(
  value: GovernedMcuFvClassification,
): string {
  return `${value.basic}${value.frontal ?? ""}${value.vertex ?? ""}`;
}

export function parsePatternAssessment(
  value: unknown,
): GovernedPatternAssessment {
  const object = requireObject(value);
  assertExactKeys(object, ["sinclair", "mcuFv", "hairLineDistanceCm"]);
  const result: GovernedPatternAssessment = {};
  if ("sinclair" in object) {
    result.sinclair = requireIntegerInRange(object.sinclair, 1, 5);
  }
  if ("mcuFv" in object) result.mcuFv = parseMcuFvClassification(object.mcuFv);
  if ("hairLineDistanceCm" in object) {
    const hairLine = requireObject(object.hairLineDistanceCm);
    assertExactKeys(hairLine, ["midline", "rightSide", "leftSide"]);
    const parsed: GovernedHairLineDistanceCm = {};
    if ("midline" in hairLine) parsed.midline = requireHairLineDistance(hairLine.midline);
    if ("rightSide" in hairLine) parsed.rightSide = requireHairLineDistance(hairLine.rightSide);
    if ("leftSide" in hairLine) parsed.leftSide = requireHairLineDistance(hairLine.leftSide);
    result.hairLineDistanceCm = parsed;
  }
  return result;
}

export function normalizeTrichoscopyFindingCodes(
  value: unknown,
): PhysicianTrichoscopyFindingCode[] {
  if (!Array.isArray(value)) invalid();
  const codes = value.map((item) => {
    if (!isOneOf(item, PHYSICIAN_TRICHOSCOPY_FINDING_CODES)) return invalid();
    return item;
  });
  if (new Set(codes).size !== codes.length) invalid();
  const selected = new Set(codes);
  return PHYSICIAN_TRICHOSCOPY_FINDING_CODES.filter((code) => selected.has(code));
}

function requireTrichoscopyOtherFindingText(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > TRICHOSCOPY_OTHER_FINDING_TEXT_MAX_LENGTH
  ) {
    invalid();
  }
  return value;
}

export function parsePhysicianTrichoscopy(
  value: unknown,
): GovernedPhysicianTrichoscopy {
  const object = requireObject(value);
  assertExactKeys(object, ["selectedFindingCodes", "otherFindingText"]);
  const result: GovernedPhysicianTrichoscopy = {};
  if ("selectedFindingCodes" in object) {
    result.selectedFindingCodes = normalizeTrichoscopyFindingCodes(
      object.selectedFindingCodes,
    );
  }
  if ("otherFindingText" in object) {
    result.otherFindingText = requireTrichoscopyOtherFindingText(
      object.otherFindingText,
    );
  }
  return result;
}

export function parseGovernedDraftSection(
  section: string,
  value: unknown,
): unknown {
  if (section === "EXAMINATION") return parseClinicalExamination(value);
  if (section === "MEASUREMENTS") return parsePhysicianMeasurements(value);
  if (section === "PATTERN") return parsePatternAssessment(value);
  if (section === "TRICHOSCOPY") return parsePhysicianTrichoscopy(value);
  if (section === "ANATOMICAL_MAP") return parsePhysicianAnatomicalMap(value);
  if (section === "DIAGNOSIS") return { decisions: parseDiagnosisSection(value) };
  if (section === "TREATMENT_PROCEDURES") {
    return parseTreatmentProceduresSection(value);
  }
  return value;
}

export function parseGovernedPhysicianVisitDraft(
  sections: Record<string, unknown>,
): GovernedPhysicianVisitClinicalDraft {
  const result: GovernedPhysicianVisitClinicalDraft = {};
  if ("EXAMINATION" in sections) {
    result.examination = parseClinicalExamination(sections.EXAMINATION);
  }
  if ("MEASUREMENTS" in sections) {
    result.measurements = parsePhysicianMeasurements(sections.MEASUREMENTS);
  }
  if ("PATTERN" in sections) {
    result.pattern = parsePatternAssessment(sections.PATTERN);
  }
  if ("TRICHOSCOPY" in sections) {
    result.trichoscopy = parsePhysicianTrichoscopy(sections.TRICHOSCOPY);
  }
  if ("ANATOMICAL_MAP" in sections) {
    result.anatomicalMap = parsePhysicianAnatomicalMap(
      sections.ANATOMICAL_MAP,
    );
  }
  return result;
}

export function hasNonemptyUngovernedClinicalSection(
  sections: Record<string, unknown>,
): boolean {
  return Object.entries(sections).some(([section, value]) => {
    if (["EXAMINATION", "MEASUREMENTS", "PATTERN", "TRICHOSCOPY", "ANATOMICAL_MAP", "DIAGNOSIS", "TREATMENT_PROCEDURES"].includes(section)) return false;
    return Object.keys(requireObject(value)).length > 0;
  });
}

function requireOperation(value: unknown): "SET" | "OMIT" {
  if (value !== "SET" && value !== "OMIT") invalid();
  return value;
}

export function parsePhysicianClinicalCorrectionRequestBody(
  value: unknown,
): PhysicianClinicalCorrectionCommand {
  const body = requireObject(value);
  if (typeof body.target !== "string") invalid();
  const operation = requireOperation(body.operation);

  if (body.target === "HAIR_PULL") {
    assertExactKeys(body, operation === "SET" ? ["target", "operation", "value"] : ["target", "operation"]);
    if (operation === "OMIT") return { target: "HAIR_PULL", operation };
    if (!isOneOf(body.value, HAIR_PULL_RESULTS)) invalid();
    return { target: "HAIR_PULL", operation, value: body.value };
  }
  if (body.target === "HAIR_PARTING") {
    assertExactKeys(body, operation === "SET" ? ["target", "operation", "value"] : ["target", "operation"]);
    if (operation === "OMIT") return { target: "HAIR_PARTING", operation };
    return { target: "HAIR_PARTING", operation, value: normalizeHairPartingFindings(body.value) };
  }
  if (body.target === "PHYSICIAN_MEASUREMENT") {
    assertExactKeys(body, operation === "SET" ? ["target", "metric", "operation", "value"] : ["target", "metric", "operation"]);
    if (!isOneOf(body.metric, PHYSICIAN_MEASUREMENT_CODES)) invalid();
    if (operation === "OMIT") return { target: "PHYSICIAN_MEASUREMENT", metric: body.metric, operation };
    return {
      target: "PHYSICIAN_MEASUREMENT",
      metric: body.metric,
      operation,
      value: requireIntegerInRange(body.value, 0, 5),
    };
  }
  if (body.target === "SINCLAIR") {
    assertExactKeys(body, operation === "SET" ? ["target", "operation", "value"] : ["target", "operation"]);
    if (operation === "OMIT") return { target: "SINCLAIR", operation };
    return { target: "SINCLAIR", operation, value: requireIntegerInRange(body.value, 1, 5) };
  }
  if (body.target === "MCU_FV") {
    assertExactKeys(body, operation === "SET" ? ["target", "operation", "value"] : ["target", "operation"]);
    if (operation === "OMIT") return { target: "MCU_FV", operation };
    return { target: "MCU_FV", operation, value: parseMcuFvClassification(body.value) };
  }
  if (body.target === "HAIR_LINE_DISTANCE") {
    assertExactKeys(body, operation === "SET" ? ["target", "position", "operation", "value"] : ["target", "position", "operation"]);
    if (!isOneOf(body.position, HAIR_LINE_POSITIONS)) invalid();
    if (operation === "OMIT") return { target: "HAIR_LINE_DISTANCE", position: body.position, operation };
    return {
      target: "HAIR_LINE_DISTANCE",
      position: body.position,
      operation,
      value: requireHairLineDistance(body.value),
    };
  }
  if (body.target === "TRICHOSCOPY_SELECTED_FINDINGS") {
    assertExactKeys(body, operation === "SET" ? ["target", "operation", "value"] : ["target", "operation"]);
    if (operation === "OMIT") return { target: "TRICHOSCOPY_SELECTED_FINDINGS", operation };
    return {
      target: "TRICHOSCOPY_SELECTED_FINDINGS",
      operation,
      value: normalizeTrichoscopyFindingCodes(body.value),
    };
  }
  if (body.target === "TRICHOSCOPY_OTHER_FINDING_TEXT") {
    assertExactKeys(body, operation === "SET" ? ["target", "operation", "value"] : ["target", "operation"]);
    if (operation === "OMIT") return { target: "TRICHOSCOPY_OTHER_FINDING_TEXT", operation };
    return {
      target: "TRICHOSCOPY_OTHER_FINDING_TEXT",
      operation,
      value: requireTrichoscopyOtherFindingText(body.value),
    };
  }
  if (body.target === "ANATOMICAL_MAP_REGIONS") {
    assertExactKeys(
      body,
      operation === "SET"
        ? ["target", "operation", "value"]
        : ["target", "operation"],
    );
    if (operation === "OMIT") {
      return { target: "ANATOMICAL_MAP_REGIONS", operation };
    }
    return {
      target: "ANATOMICAL_MAP_REGIONS",
      operation,
      value: requireConfirmedAnatomicalMapRegions(parseAnatomicalMapRegions(body.value)),
    };
  }
  return invalid();
}
