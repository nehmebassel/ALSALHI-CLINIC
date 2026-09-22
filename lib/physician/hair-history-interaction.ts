export type HairHistoryDatePrecision = "DAY" | "MONTH" | "YEAR" | "UNKNOWN";

export type HairHistoryPanelPlacement = "left" | "right" | "above" | "below";

export type HairHistoryRect = { left: number; top: number; width: number; height: number };

export type HairHistoryFloatingPanelPosition = {
  left: number;
  top: number;
  placement: HairHistoryPanelPlacement;
  pointerX: number;
  pointerY: number;
};

export type HairHistoryLaneInput = {
  id: string;
  label: string;
  markerX: number;
  intervalEndX?: number;
};

export type HairHistoryLaneVisual = HairHistoryLaneInput & {
  labelX: number;
  labelWidth: number;
  labelHeight: number;
  startX: number;
  endX: number;
  row: number;
};

export type HairHistoryMetricPoint<T> = {
  item: T;
  metricCode: string;
  date: string;
  dateKey?: string;
  value: number;
};

export type HairHistoryMetricCluster<T> = {
  key: string;
  metricCode: string;
  date: string;
  dateKey: string;
  value: number;
  items: T[];
};

export type HairHistoryMetricCollisionVisual<T> = HairHistoryMetricCluster<T> & {
  offsetX: number;
};

export type HairHistoryAxisDateInput = {
  id: string;
  date: string;
  precision: HairHistoryDatePrecision;
  x: number;
};

export type HairHistoryAxisDateVisual = HairHistoryAxisDateInput & {
  row: number;
  primary: string;
  secondary: string;
  labelWidth: number;
  labelLeft: number;
  labelRight: number;
};

/**
 * Groups only truly identical plotted metric positions. Same-date records with
 * different values remain independent points; no date or value is synthesized.
 */
export function clusterMetricPoints<T>(points: HairHistoryMetricPoint<T>[]): HairHistoryMetricCluster<T>[] {
  const clusters = new Map<string, HairHistoryMetricCluster<T>>();
  for (const point of points) {
    const dateKey = point.dateKey ?? point.date;
    const key = `${point.metricCode}\u0000${dateKey}\u0000${point.value}`;
    const existing = clusters.get(key);
    if (existing) {
      existing.items.push(point.item);
      continue;
    }
    clusters.set(key, {
      key,
      metricCode: point.metricCode,
      date: point.date,
      dateKey,
      value: point.value,
      items: [point.item],
    });
  }
  return [...clusters.values()].sort((a, b) => a.date.localeCompare(b.date) || a.value - b.value || a.key.localeCompare(b.key));
}

/**
 * Keeps clinically distinct metrics visible when they share the same recorded
 * date and numeric value. The offset is visual-only and horizontal: date/value
 * stored on the cluster are returned untouched and line coordinates can keep
 * using the true plotted position.
 */
export function layoutMetricCollisionOffsets<T>(
  clusters: HairHistoryMetricCluster<T>[],
  metricOrder: readonly string[] = [],
  spacing = 22,
): HairHistoryMetricCollisionVisual<T>[] {
  const rank = new Map<string, number>(metricOrder.map((metricCode, index) => [metricCode, index] as const));
  const grouped = new Map<string, HairHistoryMetricCluster<T>[]>();
  for (const cluster of clusters) {
    const key = `${cluster.dateKey}\u0000${cluster.value}`;
    const list = grouped.get(key) ?? [];
    list.push(cluster);
    grouped.set(key, list);
  }

  const offsets = new Map<string, number>();
  for (const group of grouped.values()) {
    const ordered = [...group].sort((a, b) => {
      const aRank = rank.get(a.metricCode) ?? Number.MAX_SAFE_INTEGER;
      const bRank = rank.get(b.metricCode) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank || a.metricCode.localeCompare(b.metricCode) || a.key.localeCompare(b.key);
    });
    ordered.forEach((cluster, index) => {
      offsets.set(cluster.key, (index - (ordered.length - 1) / 2) * spacing);
    });
  }

  return clusters.map((cluster) => ({ ...cluster, offsetX: offsets.get(cluster.key) ?? 0 }));
}

function axisDateParts(dateIso: string, precision: HairHistoryDatePrecision, locale: "ar" | "en"): { primary: string; secondary: string } {
  const date = new Date(dateIso);
  const intlLocale = locale === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : "en-US-u-ca-gregory-nu-latn";
  if (precision === "YEAR") {
    return {
      primary: new Intl.DateTimeFormat(intlLocale, { year: "numeric", timeZone: "UTC" }).format(date),
      secondary: "",
    };
  }
  if (precision === "MONTH") {
    return {
      primary: new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" }).format(date),
      secondary: new Intl.DateTimeFormat(intlLocale, { year: "numeric", timeZone: "UTC" }).format(date),
    };
  }
  return {
    primary: new Intl.DateTimeFormat(intlLocale, { day: "numeric", timeZone: "UTC" }).format(date),
    secondary: new Intl.DateTimeFormat(intlLocale, { month: "short", year: "numeric", timeZone: "UTC" }).format(date),
  };
}

function axisLabelWidth(primary: string, secondary: string): number {
  const longest = [primary, secondary].reduce((current, value) => Array.from(value).length > Array.from(current).length ? value : current, "");
  const averageGlyphWidth = /[\u0600-\u06ff]/.test(longest) ? 7.2 : 6.25;
  return clamp(18 + Array.from(longest).length * averageGlyphWidth, 34, 104);
}

export function recordedDateKey(dateIso: string, precision: HairHistoryDatePrecision): string {
  const date = new Date(dateIso);
  const year = date.getUTCFullYear();
  if (precision === "YEAR") return `Y:${year}`;
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  if (precision === "MONTH") return `M:${year}-${month}`;
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `D:${year}-${month}-${day}`;
}

/**
 * Packs every unique recorded plotted date into as many axis rows as needed.
 * No intermediate dates are created and same-row label bounds never overlap.
 */
export function layoutRecordedDateAxis(input: {
  dates: HairHistoryAxisDateInput[];
  locale: "ar" | "en";
  plotLeft: number;
  plotRight: number;
  gap?: number;
}): { visuals: HairHistoryAxisDateVisual[]; rowCount: number; rowHeight: number } {
  const gap = input.gap ?? 10;
  const unique = new Map<string, HairHistoryAxisDateInput>();
  for (const item of input.dates) {
    const key = recordedDateKey(item.date, item.precision);
    if (!unique.has(key)) unique.set(key, item);
  }
  const rows: Array<Array<{ left: number; right: number }>> = [];
  const visuals = [...unique.values()]
    .sort((a, b) => a.x - b.x || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((item) => {
      const { primary, secondary } = axisDateParts(item.date, item.precision, input.locale);
      const labelWidth = axisLabelWidth(primary, secondary);
      const labelLeft = clamp(item.x - labelWidth / 2, input.plotLeft, Math.max(input.plotLeft, input.plotRight - labelWidth));
      const labelRight = labelLeft + labelWidth;
      let row = rows.findIndex((ranges) => ranges.every((range) => labelRight + gap <= range.left || labelLeft - gap >= range.right));
      if (row < 0) row = rows.length;
      if (!rows[row]) rows[row] = [];
      rows[row]!.push({ left: labelLeft, right: labelRight });
      return { ...item, row, primary, secondary, labelWidth, labelLeft, labelRight };
    });
  return { visuals, rowCount: rows.length, rowHeight: 30 };
}

export type HairHistoryTreatmentDragMode = "START" | "END" | "BAR";

/**
 * Applies horizontal treatment-duration dragging while keeping the interval
 * bounded and non-inverted. BAR preserves the recorded duration exactly.
 */
export function moveTreatmentInterval(input: {
  mode: HairHistoryTreatmentDragMode;
  pointerTimestamp: number;
  pointerStartTimestamp: number;
  startTimestamp: number;
  endTimestamp: number;
  domainMin: number;
  domainMax: number;
}): { startTimestamp: number; endTimestamp: number } {
  const domainMin = Math.min(input.domainMin, input.domainMax);
  const domainMax = Math.max(input.domainMin, input.domainMax);
  const start = clamp(input.startTimestamp, domainMin, domainMax);
  const end = clamp(Math.max(input.endTimestamp, start), domainMin, domainMax);
  const pointer = clamp(input.pointerTimestamp, domainMin, domainMax);

  if (input.mode === "START") return { startTimestamp: Math.min(pointer, end), endTimestamp: end };
  if (input.mode === "END") return { startTimestamp: start, endTimestamp: Math.max(pointer, start) };

  const duration = end - start;
  const requestedDelta = pointer - input.pointerStartTimestamp;
  const minDelta = domainMin - start;
  const maxDelta = domainMax - end;
  const delta = clamp(requestedDelta, minDelta, maxDelta);
  return { startTimestamp: start + delta, endTimestamp: start + delta + duration };
}

/**
 * Keeps the governed 0-5 scale intact while making the measurement zone respond
 * to the amount of recorded data. Sparse histories stay compact; richer histories
 * get more vertical separation for markers and connected series.
 */
export function adaptiveMeasureStep(metricPointCount: number, activeMetricSeriesCount: number): number {
  if (metricPointCount <= 2) return 20;
  if (metricPointCount <= 6 && activeMetricSeriesCount <= 2) return 24;
  if (metricPointCount <= 12) return 29;
  return 34;
}

/** Returns indexes distributed across existing recorded dates; it never invents ticks. */
export function evenlySpacedTickIndexes(itemCount: number, maxTicks: number): number[] {
  const count = Math.max(0, Math.floor(itemCount));
  const limit = Math.max(0, Math.floor(maxTicks));
  if (count === 0 || limit === 0) return [];
  if (count <= limit) return Array.from({ length: count }, (_, index) => index);
  if (limit === 1) return [0];

  const indexes = Array.from({ length: limit }, (_, index) => Math.round(index * (count - 1) / (limit - 1)));
  return [...new Set(indexes)];
}

/** Selects only recorded tick positions while enforcing readable pixel spacing. */
export function collisionFreeTickIndexes(positions: number[], maxTicks: number, minGap: number): number[] {
  if (positions.length === 0 || maxTicks <= 0) return [];
  const candidates = evenlySpacedTickIndexes(positions.length, maxTicks);
  if (candidates.length <= 1) return candidates;
  const lastIndex = candidates.at(-1)!;
  const selected = [candidates[0]!];
  for (const index of candidates.slice(1, -1)) {
    const previous = selected.at(-1)!;
    if (positions[index]! - positions[previous]! >= minGap && positions[lastIndex]! - positions[index]! >= minGap) selected.push(index);
  }
  while (selected.length > 1 && positions[lastIndex]! - positions[selected.at(-1)!]! < minGap) selected.pop();
  if (lastIndex !== selected[0]) selected.push(lastIndex);
  return selected;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function intersectionArea(a: HairHistoryRect, b: HairHistoryRect): number {
  const width = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return width * height;
}

function pointToRectDistance(x: number, y: number, rect: HairHistoryRect): number {
  const dx = Math.max(rect.left - x, 0, x - (rect.left + rect.width));
  const dy = Math.max(rect.top - y, 0, y - (rect.top + rect.height));
  return Math.hypot(dx, dy);
}

/**
 * Chooses a bounded floating-inspector position around a selected chart anchor.
 * The selected point/event is treated as a protected zone. Only adjacent side
 * candidates are considered; the inspector never falls back to an unrelated
 * canvas corner. Obstacles are soft constraints because a dense chart may not
 * have a completely empty quadrant, but anchor clearance and canvas bounds are
 * always scored ahead of obstacle overlap.
 */
export function chooseFloatingPanelPosition(input: {
  containerWidth: number;
  containerHeight: number;
  panelWidth: number;
  panelHeight: number;
  anchorX: number;
  anchorY: number;
  margin?: number;
  gap?: number;
  protectedRadius?: number;
  avoidRects?: HairHistoryRect[];
}): HairHistoryFloatingPanelPosition {
  const margin = input.margin ?? 12;
  const gap = input.gap ?? 18;
  const protectedRadius = input.protectedRadius ?? 24;
  const maxLeft = Math.max(margin, input.containerWidth - input.panelWidth - margin);
  const maxTop = Math.max(margin, input.containerHeight - input.panelHeight - margin);
  const horizontalOffsets = [0, -input.panelHeight * 0.28, input.panelHeight * 0.28];
  const verticalOffsets = [0, -input.panelWidth * 0.24, input.panelWidth * 0.24];
  const horizontalOrder: HairHistoryPanelPlacement[] = input.anchorX >= input.containerWidth / 2 ? ["left", "right"] : ["right", "left"];
  const verticalOrder: HairHistoryPanelPlacement[] = input.anchorY >= input.containerHeight / 2 ? ["above", "below"] : ["below", "above"];
  const rawCandidates: Array<{ left: number; top: number; placement: HairHistoryPanelPlacement }> = [];
  for (const placement of horizontalOrder) {
    for (const offset of horizontalOffsets) {
      rawCandidates.push({
        left: placement === "left" ? input.anchorX - input.panelWidth - gap : input.anchorX + gap,
        top: input.anchorY - input.panelHeight / 2 + offset,
        placement,
      });
    }
  }
  for (const placement of verticalOrder) {
    for (const offset of verticalOffsets) {
      rawCandidates.push({
        left: input.anchorX - input.panelWidth / 2 + offset,
        top: placement === "above" ? input.anchorY - input.panelHeight - gap : input.anchorY + gap,
        placement,
      });
    }
  }

  let best = { left: margin, top: margin, placement: "right" as HairHistoryPanelPlacement, pointerX: 0, pointerY: 0 };
  let bestScore = Number.POSITIVE_INFINITY;

  rawCandidates.forEach((candidate, index) => {
    const overflowLeft = Math.max(0, margin - candidate.left);
    const overflowRight = Math.max(0, candidate.left + input.panelWidth + margin - input.containerWidth);
    const overflowTop = Math.max(0, margin - candidate.top);
    const overflowBottom = Math.max(0, candidate.top + input.panelHeight + margin - input.containerHeight);
    const overflow = overflowLeft + overflowRight + overflowTop + overflowBottom;

    const left = clamp(candidate.left, margin, maxLeft);
    const top = clamp(candidate.top, margin, maxTop);
    const panelRect = { left, top, width: input.panelWidth, height: input.panelHeight };
    const anchorDistance = pointToRectDistance(input.anchorX, input.anchorY, panelRect);
    const anchorIntrusion = Math.max(0, protectedRadius - anchorDistance);
    const obstacleArea = (input.avoidRects ?? []).reduce((total, rect) => total + intersectionArea(panelRect, rect), 0);
    const adjacencyDistance = Math.max(0, anchorDistance - gap);
    const score = overflow * 100_000
      + anchorIntrusion * 1_000_000
      + obstacleArea * 2_000
      + adjacencyDistance * 20
      + index;
    if (score < bestScore) {
      bestScore = score;
      best = {
        left,
        top,
        placement: candidate.placement,
        pointerX: clamp(input.anchorX - left, 14, Math.max(14, input.panelWidth - 14)),
        pointerY: clamp(input.anchorY - top, 14, Math.max(14, input.panelHeight - 14)),
      };
    }
  });

  return best;
}

/**
 * Estimates and packs readable event labels into collision-free rows. Labels are
 * kept inside the governed plot bounds, and long Arabic/English text wraps rather
 * than being clipped or abbreviated into a clinically ambiguous token.
 */
export function packTimelineLane(input: {
  items: HairHistoryLaneInput[];
  plotLeft: number;
  plotRight: number;
  locale: "ar" | "en";
  gap?: number;
}): { visuals: HairHistoryLaneVisual[]; rowCount: number; rowHeight: number } {
  const gap = input.gap ?? 16;
  const density = input.items.length;
  const maxLabelWidth = density >= 9 ? 224 : density >= 5 ? 258 : 304;
  const minLabelWidth = density >= 9 ? 136 : 148;
  const rowRanges: Array<Array<{ start: number; end: number }>> = [];

  const visuals = [...input.items]
    .sort((a, b) => a.markerX - b.markerX || a.id.localeCompare(b.id))
    .map((item, itemIndex) => {
      const normalized = item.label.replace(/\s+/g, " ").trim();
      const glyphCount = Array.from(normalized).length;
      const averageGlyphWidth = /[\u0600-\u06ff]/.test(normalized) ? 7.1 : 6.15;
      const naturalWidth = 34 + glyphCount * averageGlyphWidth;
      const labelWidth = clamp(naturalWidth, minLabelWidth, maxLabelWidth);
      const usableTextWidth = Math.max(96, labelWidth - 14);
      const lineCount = clamp(Math.ceil((glyphCount * averageGlyphWidth) / usableTextWidth), 1, 4);
      const labelHeight = 12 + lineCount * 16;
      const preferRight = item.markerX < (input.plotLeft + input.plotRight) / 2;
      const sides = itemIndex % 2 === 0 ? [preferRight, !preferRight] : [!preferRight, preferRight];
      let best: HairHistoryLaneVisual | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const placeRight of sides) {
        const rawLabelX = placeRight ? item.markerX + 14 : item.markerX - labelWidth - 14;
        const labelX = clamp(rawLabelX, input.plotLeft + 4, input.plotRight - labelWidth - 4);
        const startX = Math.min(item.markerX - 8, labelX, item.intervalEndX ?? item.markerX);
        const endX = Math.max(item.markerX + 8, labelX + labelWidth, item.intervalEndX ?? item.markerX);
        let row = rowRanges.findIndex((ranges) => ranges.every((range) => endX + gap < range.start || startX - gap > range.end));
        if (row < 0) row = rowRanges.length;
        const displacement = Math.abs(labelX - rawLabelX);
        const score = row * 10_000 + displacement * 10 + (placeRight === preferRight ? 0 : 1);
        if (score < bestScore) {
          bestScore = score;
          best = { ...item, labelX, labelWidth, labelHeight, startX, endX, row };
        }
      }

      const visual = best!;
      if (!rowRanges[visual.row]) rowRanges[visual.row] = [];
      rowRanges[visual.row]!.push({ start: visual.startX, end: visual.endX });
      return visual;
    });

  const tallestLabel = visuals.reduce((max, visual) => Math.max(max, visual.labelHeight), 0);
  return {
    visuals,
    rowCount: rowRanges.length,
    rowHeight: visuals.length > 0 ? Math.max(44, tallestLabel + 10) : 0,
  };
}

export function metricValueFromSvgY(svgY: number, measureTop: number, measureStep: number): number {
  return Math.max(0, Math.min(5, Math.round(5 - (svgY - measureTop) / measureStep)));
}

export function timestampFromTimelineX(
  svgX: number,
  plotLeft: number,
  plotRight: number,
  domainMin: number,
  domainMax: number,
): number {
  const clampedX = Math.max(plotLeft, Math.min(plotRight, svgX));
  const ratio = (clampedX - plotLeft) / (plotRight - plotLeft);
  return domainMin + ratio * (domainMax - domainMin);
}

export function historicalTimestampFromTimelineX(
  svgX: number,
  plotLeft: number,
  plotRight: number,
  visualDomainMin: number,
  visualDomainMax: number,
  editableMaximum: number,
): number {
  return Math.min(
    editableMaximum,
    timestampFromTimelineX(svgX, plotLeft, plotRight, visualDomainMin, visualDomainMax),
  );
}

export function dateInputFromTimestamp(timestamp: number, precision: HairHistoryDatePrecision): string {
  if (precision === "UNKNOWN") return "";
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  if (precision === "YEAR") return String(year);
  if (precision === "MONTH") return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

export function hairHistoryDateOnOrBefore(
  dateIso: string,
  precision: HairHistoryDatePrecision,
  referenceIso: string,
): boolean {
  const date = new Date(dateIso);
  const reference = new Date(referenceIso);
  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime())) return false;
  if (precision === "UNKNOWN") return true;
  if (date.getUTCFullYear() !== reference.getUTCFullYear()) return date.getUTCFullYear() < reference.getUTCFullYear();
  if (precision === "YEAR") return true;
  if (date.getUTCMonth() !== reference.getUTCMonth()) return date.getUTCMonth() < reference.getUTCMonth();
  return precision === "MONTH" || date.getUTCDate() <= reference.getUTCDate();
}

/**
 * Converts an editor value to the canonical stored timestamp while rejecting
 * impossible calendar dates instead of allowing JavaScript date rollover.
 */
export function isoDateFromInput(value: string, precision: HairHistoryDatePrecision): string | undefined {
  if (!value || precision === "UNKNOWN") return undefined;
  if (precision === "YEAR") {
    if (!/^\d{4}$/.test(value)) return undefined;
    const year = Number(value);
    return Number.isInteger(year) && year >= 1900 && year <= 2200
      ? new Date(Date.UTC(year, 6, 1)).toISOString()
      : undefined;
  }
  if (precision === "MONTH") {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match) return undefined;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || year < 1900 || year > 2200 || month < 1 || month > 12) return undefined;
    return new Date(Date.UTC(year, month - 1, 15)).toISOString();
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.toISOString();
}

export function shiftIsoDateByStartDelta(oldStartIso: string, nextStartIso: string, oldStopIso: string): string | undefined {
  const oldStart = new Date(oldStartIso).getTime();
  const nextStart = new Date(nextStartIso).getTime();
  const oldStop = new Date(oldStopIso).getTime();
  if (![oldStart, nextStart, oldStop].every(Number.isFinite)) return undefined;
  return new Date(oldStop + (nextStart - oldStart)).toISOString();
}
