import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptiveMeasureStep,
  clusterMetricPoints,
  chooseFloatingPanelPosition,
  collisionFreeTickIndexes,
  dateInputFromTimestamp,
  evenlySpacedTickIndexes,
  hairHistoryDateOnOrBefore,
  historicalTimestampFromTimelineX,
  isoDateFromInput,
  layoutMetricCollisionOffsets,
  layoutRecordedDateAxis,
  metricValueFromSvgY,
  moveTreatmentInterval,
  packTimelineLane,
  shiftIsoDateByStartDelta,
  timestampFromTimelineX,
} from "../lib/physician/hair-history-interaction";
import { assertHistoricalHairHistoryDates, HairHistoryWriteError, type HairHistoryDraftInput } from "../lib/physician/hair-history-service";

function historyItem(overrides: Partial<HairHistoryDraftInput> = {}): HairHistoryDraftInput {
  return {
    id: "history-item",
    layer: "MEASURES",
    itemType: "MEASUREMENT",
    label: { ar: "قياس", en: "Measure" },
    value: { metricCode: "SHEDDING", value: 3 },
    date: "2026-08-24T12:00:00.000Z",
    datePrecision: "DAY",
    source: "PHYSICIAN",
    included: true,
    ...overrides,
  };
}

test("Hair History server boundary is authoritative server now, not source provenance", () => {
  const serverNow = new Date("2026-08-26T17:00:00.000Z");
  assert.doesNotThrow(() => assertHistoricalHairHistoryDates([historyItem()], serverNow));
  assert.doesNotThrow(() => assertHistoricalHairHistoryDates([historyItem({ date: "2026-08-25T12:00:00.000Z" })], serverNow));
  assert.doesNotThrow(() => assertHistoricalHairHistoryDates([historyItem({ date: "2026-12-15T00:00:00.000Z", datePrecision: "YEAR" })], serverNow));
  assert.doesNotThrow(() => assertHistoricalHairHistoryDates([historyItem({ date: "2026-08-26T12:00:00.000Z" })], serverNow));
  assert.throws(
    () => assertHistoricalHairHistoryDates([historyItem({ date: "2026-08-27T12:00:00.000Z" })], serverNow),
    (error) => error instanceof HairHistoryWriteError && error.code === "INVALID_REQUEST",
  );
  assert.throws(
    () => assertHistoricalHairHistoryDates([historyItem({ date: "2026-09-15T12:00:00.000Z", datePrecision: "MONTH" })], serverNow),
    (error) => error instanceof HairHistoryWriteError && error.code === "INVALID_REQUEST",
  );
  assert.throws(
    () => assertHistoricalHairHistoryDates([historyItem({ date: "2027-07-01T12:00:00.000Z", datePrecision: "YEAR" })], serverNow),
    (error) => error instanceof HairHistoryWriteError && error.code === "INVALID_REQUEST",
  );
});

test("Hair History UNKNOWN precision remains undated", () => {
  const serverNow = new Date("2026-08-26T17:00:00.000Z");
  assert.doesNotThrow(() => assertHistoricalHairHistoryDates([historyItem({ date: undefined, datePrecision: "UNKNOWN" })], serverNow));
  assert.throws(
    () => assertHistoricalHairHistoryDates([historyItem({ date: "2026-01-01T12:00:00.000Z", datePrecision: "UNKNOWN" })], serverNow),
    HairHistoryWriteError,
  );
});

test("Hair History enforces start <= stop <= authoritative server now", () => {
  const serverNow = new Date("2026-08-26T17:00:00.000Z");
  assert.doesNotThrow(() => assertHistoricalHairHistoryDates([historyItem({
    layer: "TREATMENTS",
    date: "2026-08-20T12:00:00.000Z",
    value: { stopDate: "2026-08-26T12:00:00.000Z", stopPrecision: "DAY" },
  })], serverNow));
  assert.throws(
    () => assertHistoricalHairHistoryDates([historyItem({
      layer: "TREATMENTS",
      value: { stopDate: "2026-09-15T00:00:00.000Z", stopPrecision: "MONTH" },
    })], serverNow),
    HairHistoryWriteError,
  );
  assert.throws(
    () => assertHistoricalHairHistoryDates([historyItem({
      layer: "TREATMENTS",
      date: "2026-08-20T12:00:00.000Z",
      value: { stopDate: "2026-08-10T12:00:00.000Z", stopPrecision: "DAY" },
    })], serverNow),
    HairHistoryWriteError,
  );
});

test("Hair History clusters only identical metric/date/value positions and preserves every record", () => {
  const arA = { id: "ar-a", label: "شدة التساقط" };
  const arB = { id: "ar-b", label: "تساقط مسجل" };
  const enDifferentValue = { id: "en-c", label: "Shedding severity" };
  const densitySameDate = { id: "en-d", label: "Density loss" };
  const clusters = clusterMetricPoints([
    { item: arA, metricCode: "SHEDDING", date: "2026-08-01T12:00:00.000Z", value: 4 },
    { item: arB, metricCode: "SHEDDING", date: "2026-08-01T12:00:00.000Z", value: 4 },
    { item: enDifferentValue, metricCode: "SHEDDING", date: "2026-08-01T12:00:00.000Z", value: 3 },
    { item: densitySameDate, metricCode: "DENSITY", date: "2026-08-01T12:00:00.000Z", value: 4 },
  ]);

  assert.equal(clusters.length, 3);
  const overlap = clusters.find((cluster) => cluster.metricCode === "SHEDDING" && cluster.value === 4);
  assert.ok(overlap);
  assert.deepEqual(overlap.items, [arA, arB]);
  assert.equal(clusters.find((cluster) => cluster.metricCode === "SHEDDING" && cluster.value === 3)?.items[0], enDifferentValue);
  assert.equal(clusters.find((cluster) => cluster.metricCode === "DENSITY")?.items[0], densitySameDate);
});

test("different metrics may share the same date and same clinical value without being deduplicated", () => {
  const clusters = clusterMetricPoints([
    { item: { id: "itch" }, metricCode: "ITCH", date: "2026-08-20T12:00:00.000Z", value: 5 },
    { item: { id: "pain" }, metricCode: "SCALP_PAIN", date: "2026-08-20T12:00:00.000Z", value: 5 },
  ]);
  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.map((cluster) => cluster.metricCode).sort(), ["ITCH", "SCALP_PAIN"]);
});

test("same-date same-value different metrics receive distinct visual offsets while true clinical values remain unchanged", () => {
  const clusters = clusterMetricPoints([
    { item: { id: "itch" }, metricCode: "ITCH", date: "2026-08-20T12:00:00.000Z", value: 5 },
    { item: { id: "burning" }, metricCode: "BURNING", date: "2026-08-20T12:00:00.000Z", value: 5 },
    { item: { id: "pain" }, metricCode: "SCALP_PAIN", date: "2026-08-20T12:00:00.000Z", value: 5 },
  ]);
  const visuals = layoutMetricCollisionOffsets(clusters, ["ITCH", "BURNING", "SCALP_PAIN"]);
  assert.equal(new Set(visuals.map((item) => item.offsetX)).size, 3);
  assert.deepEqual(visuals.map((item) => item.value), [5, 5, 5]);
  assert.deepEqual(visuals.map((item) => item.date), Array(3).fill("2026-08-20T12:00:00.000Z"));
});

test("same metric + same date + same value still uses counted cluster behavior", () => {
  const clusters = clusterMetricPoints([
    { item: { id: "a" }, metricCode: "ITCH", date: "2026-08-20T12:00:00.000Z", value: 5 },
    { item: { id: "b" }, metricCode: "ITCH", date: "2026-08-20T12:00:00.000Z", value: 5 },
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]?.items.length, 2);
});

test("Hair History treatment duration dragging keeps boundaries ordered and BAR drag preserves duration", () => {
  const day = 86_400_000;
  const domainMin = Date.UTC(2026, 0, 1);
  const domainMax = Date.UTC(2026, 0, 31);
  const start = Date.UTC(2026, 0, 10);
  const end = Date.UTC(2026, 0, 20);

  const shifted = moveTreatmentInterval({
    mode: "BAR",
    pointerTimestamp: Date.UTC(2026, 0, 18),
    pointerStartTimestamp: Date.UTC(2026, 0, 15),
    startTimestamp: start,
    endTimestamp: end,
    domainMin,
    domainMax,
  });
  assert.equal(shifted.endTimestamp - shifted.startTimestamp, 10 * day);
  assert.equal(shifted.startTimestamp, Date.UTC(2026, 0, 13));

  const startPastEnd = moveTreatmentInterval({ mode: "START", pointerTimestamp: Date.UTC(2026, 0, 25), pointerStartTimestamp: start, startTimestamp: start, endTimestamp: end, domainMin, domainMax });
  assert.equal(startPastEnd.startTimestamp, end);
  const endBeforeStart = moveTreatmentInterval({ mode: "END", pointerTimestamp: Date.UTC(2026, 0, 5), pointerStartTimestamp: end, startTimestamp: start, endTimestamp: end, domainMin, domainMax });
  assert.equal(endBeforeStart.endTimestamp, start);
});

test("Hair History measurement height grows only when recorded metric density grows", () => {
  assert.equal(adaptiveMeasureStep(0, 0), 20);
  assert.equal(adaptiveMeasureStep(2, 2), 20);
  assert.equal(adaptiveMeasureStep(5, 2), 24);
  assert.equal(adaptiveMeasureStep(10, 4), 29);
  assert.equal(adaptiveMeasureStep(18, 5), 34);
});

test("Hair History date ticks are distributed across recorded dates without fabricating intermediates", () => {
  assert.deepEqual(evenlySpacedTickIndexes(4, 8), [0, 1, 2, 3]);
  assert.deepEqual(evenlySpacedTickIndexes(10, 4), [0, 3, 6, 9]);
  assert.deepEqual(evenlySpacedTickIndexes(0, 8), []);
});

test("AEP-009 clustered recorded dates are removed from the axis until labels have safe rendered spacing", () => {
  const positions = [78, 350, 720, 744, 778, 826, 1120, 1650];
  const indexes = collisionFreeTickIndexes(positions, 8, 122);
  assert.deepEqual(indexes, [0, 1, 2, 6, 7]);
  assert.equal(indexes.every((index) => positions.includes(positions[index]!)), true);
  for (let index = 1; index < indexes.length; index += 1) {
    assert.equal(positions[indexes[index]!]! - positions[indexes[index - 1]!]! >= 122, true);
  }
});

test("Hair History packs close recorded dates into collision-free axis rows without inventing dates", () => {
  const dates = [
    { id: "d1", date: "2026-08-20T12:00:00.000Z", precision: "DAY" as const, x: 700 },
    { id: "d2", date: "2026-08-21T12:00:00.000Z", precision: "DAY" as const, x: 708 },
    { id: "d3", date: "2026-08-23T12:00:00.000Z", precision: "DAY" as const, x: 720 },
  ];
  const layout = layoutRecordedDateAxis({ dates, locale: "ar", plotLeft: 78, plotRight: 1650 });
  assert.equal(layout.visuals.length, 3);
  assert.deepEqual(layout.visuals.map((item) => item.date), dates.map((item) => item.date));
  for (const row of new Set(layout.visuals.map((item) => item.row))) {
    const inRow = layout.visuals.filter((item) => item.row === row).sort((a, b) => a.labelLeft - b.labelLeft);
    for (let index = 1; index < inRow.length; index += 1) {
      assert.equal(inRow[index - 1]!.labelRight <= inRow[index]!.labelLeft, true);
    }
  }
  assert.equal(layout.rowCount >= 2, true, "nearby dragged dates are separated into additional rows instead of overlapping");
});

test("Hair History axis deduplicates the same clinical day and never fabricates intermediate labels", () => {
  const layout = layoutRecordedDateAxis({
    dates: [
      { id: "a", date: "2026-08-20T09:00:00.000Z", precision: "DAY", x: 500 },
      { id: "b", date: "2026-08-20T18:00:00.000Z", precision: "DAY", x: 501 },
      { id: "c", date: "2026-08-25T12:00:00.000Z", precision: "DAY", x: 900 },
    ],
    locale: "en",
    plotLeft: 78,
    plotRight: 1650,
  });
  assert.equal(layout.visuals.length, 2);
  assert.deepEqual(layout.visuals.map((item) => item.id), ["a", "c"]);
});

test("Hair History date editor rejects impossible calendar dates and preserves precision semantics", () => {
  assert.equal(isoDateFromInput("2026-02-31", "DAY"), undefined);
  assert.equal(isoDateFromInput("2026-02-29", "DAY"), undefined);
  assert.match(isoDateFromInput("2028-02-29", "DAY") ?? "", /^2028-02-29T12:00:00\.000Z$/);
  assert.match(isoDateFromInput("2026-08", "MONTH") ?? "", /^2026-08-15T00:00:00\.000Z$/);
  assert.match(isoDateFromInput("2026", "YEAR") ?? "", /^2026-07-01T00:00:00\.000Z$/);
  assert.equal(isoDateFromInput("", "UNKNOWN"), undefined);
});

function panelContains(position: { left: number; top: number }, width: number, height: number, x: number, y: number): boolean {
  return x >= position.left && x <= position.left + width && y >= position.top && y <= position.top + height;
}

test("AEP-008 Hair History overview stays adjacent, bounded, and clear of the selected anchor", () => {
  const rightEdge = chooseFloatingPanelPosition({
    containerWidth: 1200,
    containerHeight: 700,
    panelWidth: 310,
    panelHeight: 260,
    anchorX: 1100,
    anchorY: 180,
  });
  assert.equal(rightEdge.left < 1100 - 24, true);
  assert.equal(rightEdge.left >= 12, true);
  assert.equal(rightEdge.top >= 12, true);
  assert.equal(rightEdge.left + 310 <= 1188, true);
  assert.equal(rightEdge.top + 260 <= 688, true);
  assert.equal(rightEdge.placement, "left");
  assert.equal(1100 - (rightEdge.left + 310) >= 18, true);
  assert.equal(1100 - (rightEdge.left + 310) < 40, true, "panel remains connected to the selected item rather than drifting to a corner");

  const lowerLeft = chooseFloatingPanelPosition({
    containerWidth: 760,
    containerHeight: 520,
    panelWidth: 300,
    panelHeight: 250,
    anchorX: 80,
    anchorY: 455,
  });
  assert.equal(lowerLeft.left >= 12, true);
  assert.equal(lowerLeft.top >= 12, true);
  assert.equal(lowerLeft.left + 300 <= 748, true);
  assert.equal(lowerLeft.top + 250 <= 508, true);
  assert.equal(panelContains(lowerLeft, 300, 250, 80, 455), false);
  assert.equal(["right", "above"].includes(lowerLeft.placement), true);
});

test("AEP-008 overview flips at every canvas boundary and avoids important nearby labels", () => {
  const cases = [
    { anchorX: 35, anchorY: 250, expected: "right" },
    { anchorX: 965, anchorY: 250, expected: "left" },
    { anchorX: 500, anchorY: 35, expected: "below" },
    { anchorX: 500, anchorY: 565, expected: "above" },
  ] as const;
  for (const boundary of cases) {
    const position = chooseFloatingPanelPosition({
      containerWidth: 1000,
      containerHeight: 600,
      panelWidth: 300,
      panelHeight: 220,
      anchorX: boundary.anchorX,
      anchorY: boundary.anchorY,
      gap: 18,
      protectedRadius: 28,
    });
    assert.equal(position.placement, boundary.expected);
    assert.equal(position.left >= 12 && position.top >= 12, true);
    assert.equal(position.left + 300 <= 988 && position.top + 220 <= 588, true);
    assert.equal(panelContains(position, 300, 220, boundary.anchorX, boundary.anchorY), false);
  }

  const blockedRight = chooseFloatingPanelPosition({
    containerWidth: 1100,
    containerHeight: 650,
    panelWidth: 300,
    panelHeight: 220,
    anchorX: 420,
    anchorY: 300,
    avoidRects: [{ left: 438, top: 185, width: 320, height: 240 }],
  });
  assert.notEqual(blockedRight.placement, "right");
});

function assertCollisionFree(locale: "ar" | "en", labels: string[]) {
  const packed = packTimelineLane({
    plotLeft: 78,
    plotRight: 1650,
    locale,
    items: labels.map((label, index) => ({ id: `${locale}-${index}`, label, markerX: 720 + index * 22 })),
  });
  assert.equal(packed.visuals.length, labels.length);
  for (const visual of packed.visuals) {
    assert.equal(visual.labelX >= 82, true);
    assert.equal(visual.labelX + visual.labelWidth <= 1646, true);
    assert.equal(visual.labelHeight >= 28, true);
  }
  for (let index = 0; index < packed.visuals.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < packed.visuals.length; otherIndex += 1) {
      const a = packed.visuals[index]!;
      const b = packed.visuals[otherIndex]!;
      if (a.row !== b.row) continue;
      assert.equal(a.endX + 16 < b.startX || b.endX + 16 < a.startX, true, `${a.id} and ${b.id} collided`);
    }
  }
  return packed;
}

test("AEP-009 dense Arabic and English labels wrap and pack into collision-free rows", () => {
  const ar = assertCollisionFree("ar", [
    "تساقط شديد ومفاجئ مع ترقق ملحوظ في مقدمة ومنتصف فروة الرأس",
    "استخدام علاج موضعي لفترة محددة حسب ما ذكرته المراجعة",
    "إجراء سابق طويل الوصف في منطقة الشعر وفروة الرأس",
    "حدث محفز متزامن مع تغيرات صحية مسجلة",
    "تشخيص سابق مسجل من جهة طبية أخرى",
    "فحص مختبري سابق مع تفاصيل طويلة مسجلة",
    "صور سابقة التقطتها المراجعة قبل بدء العلاج",
    "حكة وحرقة وألم في فروة الرأس",
    "تغير إضافي متقارب زمنياً يحتاج إلى صف مستقل",
  ]);
  const en = assertCollisionFree("en", [
    "Sudden severe shedding with visible thinning across the frontal and central scalp",
    "A recorded topical treatment used for a defined period",
    "A previous procedure with a long patient-recorded description",
    "A trigger event recorded alongside a health change",
    "A previous diagnosis recorded by another clinician",
    "A prior laboratory test with a long recorded detail",
    "Patient photographs captured before starting treatment",
    "Itch, burning, and scalp pain recorded together",
    "Another closely timed event requiring an independent row",
  ]);
  assert.equal(ar.rowCount > 1, true);
  assert.equal(en.rowCount > 1, true);
  assert.equal(Math.max(...ar.visuals.map((item) => item.labelWidth)) <= 224, true);
  assert.equal(Math.max(...en.visuals.map((item) => item.labelWidth)) <= 224, true);
});

test("AEP-009 sparse event lanes stay compact without empty-row allocation", () => {
  const packed = packTimelineLane({
    plotLeft: 78,
    plotRight: 1650,
    locale: "ar",
    items: [{ id: "single", label: "بداية التساقط", markerX: 840 }],
  });
  assert.equal(packed.rowCount, 1);
  assert.equal(packed.rowHeight <= 54, true);
  assert.equal(packed.visuals[0]!.labelWidth <= 304, true);
  assert.deepEqual(packTimelineLane({ plotLeft: 78, plotRight: 1650, locale: "en", items: [] }), { visuals: [], rowCount: 0, rowHeight: 0 });
});

test("v1.13.2 metric drag snaps to governed integer 0-5 values", () => {
  assert.equal(metricValueFromSvgY(58, 58, 50), 5);
  assert.equal(metricValueFromSvgY(308, 58, 50), 0);
  assert.equal(metricValueFromSvgY(-500, 58, 50), 5);
  assert.equal(metricValueFromSvgY(900, 58, 50), 0);
  assert.equal(metricValueFromSvgY(183, 58, 50), 3);
});

test("v1.13.2 horizontal drag preserves DAY, MONTH, and YEAR precision", () => {
  const min = Date.UTC(2024, 0, 1);
  const max = Date.UTC(2024, 11, 31);
  const timestamp = timestampFromTimelineX(50, 0, 100, min, max);
  assert.match(dateInputFromTimestamp(timestamp, "DAY"), /^2024-\d{2}-\d{2}$/);
  assert.match(dateInputFromTimestamp(timestamp, "MONTH"), /^2024-\d{2}$/);
  assert.equal(dateInputFromTimestamp(timestamp, "YEAR"), "2024");
  assert.equal(dateInputFromTimestamp(timestamp, "UNKNOWN"), "");
});

test("Hair History client date boundary uses authoritative server now with precision parity", () => {
  const serverNow = "2026-08-26T17:00:00.000Z";
  assert.equal(hairHistoryDateOnOrBefore("2026-08-24T12:00:00.000Z", "DAY", serverNow), true);
  assert.equal(hairHistoryDateOnOrBefore("2026-08-25T12:00:00.000Z", "DAY", serverNow), true);
  assert.equal(hairHistoryDateOnOrBefore("2026-08-27T12:00:00.000Z", "DAY", serverNow), false);
  assert.equal(hairHistoryDateOnOrBefore("2026-08-31T12:00:00.000Z", "MONTH", serverNow), true);
  assert.equal(hairHistoryDateOnOrBefore("2026-09-15T00:00:00.000Z", "MONTH", serverNow), false);
  assert.equal(hairHistoryDateOnOrBefore("2026-12-15T00:00:00.000Z", "YEAR", serverNow), true);
  assert.equal(hairHistoryDateOnOrBefore("2027-01-01T00:00:00.000Z", "YEAR", serverNow), false);
});

test("Hair History drag may move after source provenance but clamps beyond server now", () => {
  const sourceVisit = Date.UTC(2026, 3, 2);
  const serverNow = Date.UTC(2026, 7, 26);
  const visualMax = Date.UTC(2026, 8, 10);
  const withinRange = historicalTimestampFromTimelineX(75, 0, 100, sourceVisit, visualMax, serverNow);
  const beyondNow = historicalTimestampFromTimelineX(100, 0, 100, sourceVisit, visualMax, serverNow);
  assert.equal(withinRange > sourceVisit && withinRange < serverNow, true);
  assert.equal(beyondNow, serverNow);
});

test("v1.13.2 timeline X drag clamps to the existing chart domain", () => {
  const min = Date.UTC(2024, 0, 1);
  const max = Date.UTC(2024, 0, 31);
  assert.equal(timestampFromTimelineX(-20, 0, 100, min, max), min);
  assert.equal(timestampFromTimelineX(120, 0, 100, min, max), max);
});

test("v1.13.2 dragging a treatment interval preserves its duration", () => {
  const shifted = shiftIsoDateByStartDelta(
    "2024-01-01T12:00:00.000Z",
    "2024-02-01T12:00:00.000Z",
    "2024-03-01T12:00:00.000Z",
  );
  assert.equal(shifted, "2024-04-01T12:00:00.000Z");
});
