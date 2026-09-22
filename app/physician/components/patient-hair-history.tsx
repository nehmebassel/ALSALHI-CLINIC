"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import styles from "./patient-hair-history.module.css";

import { formatClinicDate } from "@/lib/platform/date-time";
import { localeNumber } from "@/lib/p01/locale";
import { effectiveReviewedHairHistoryItems, hairHistoryLayerLabel } from "@/lib/physician/hair-history";
import {
  adaptiveMeasureStep,
  clusterMetricPoints,
  chooseFloatingPanelPosition,
  dateInputFromTimestamp,
  hairHistoryDateOnOrBefore,
  historicalTimestampFromTimelineX,
  isoDateFromInput,
  layoutMetricCollisionOffsets,
  layoutRecordedDateAxis,
  metricValueFromSvgY,
  moveTreatmentInterval,
  recordedDateKey,
  shiftIsoDateByStartDelta,
  type HairHistoryTreatmentDragMode,
} from "@/lib/physician/hair-history-interaction";
import { pickLocalized } from "@/lib/physician/presentation";
import type { PhysicianHairHistory, PhysicianHairHistoryItem, PhysicianHairHistoryLayer } from "@/lib/physician/types";

const EVENT_LAYERS: PhysicianHairHistoryLayer[] = ["SYMPTOMS", "TREATMENTS", "PROCEDURES", "TRIGGERS", "DIAGNOSES", "TESTS_LABS", "PHOTOS"];
const METRIC_ORDER = ["SHEDDING", "DENSITY", "ITCH", "BURNING", "SCALP_PAIN"] as const;
const METRIC_CLASS: Record<string, string> = {
  SHEDDING: "history-metric--shedding",
  DENSITY: "history-metric--density",
  ITCH: "history-metric--itch",
  BURNING: "history-metric--burning",
  SCALP_PAIN: "history-metric--pain",
};
const METRIC_LABEL: Record<string, { ar: string; en: string }> = {
  SHEDDING: { ar: "شدة التساقط", en: "Shedding Severity" },
  DENSITY: { ar: "نقص الكثافة", en: "Density Loss" },
  ITCH: { ar: "الحكة", en: "Itch" },
  BURNING: { ar: "الحرقة", en: "Burning" },
  SCALP_PAIN: { ar: "ألم فروة الرأس", en: "Scalp Pain" },
};

type PanelMode = "IDLE" | "SELECTED" | "EDITING" | "SAVED" | "ERROR";

type EditDraft = {
  itemId: string;
  datePrecision: PhysicianHairHistoryItem["datePrecision"];
  dateInput: string;
  valueInput: string;
  valueOverride?: unknown;
  included: boolean;
};

type DragState = {
  itemId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
};

type TreatmentDragState = {
  itemId: string;
  pointerId: number;
  mode: HairHistoryTreatmentDragMode;
  startClientX: number;
  pointerStartTimestamp: number;
  startTimestamp: number;
  endTimestamp: number;
  moved: boolean;
};

type SavedChange = {
  label: string;
  summary: string;
  savedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metricPayload(item: PhysicianHairHistoryItem): { metricCode: string; value: number } | null {
  if (!isRecord(item.value) || typeof item.value.metricCode !== "string") return null;
  const value = typeof item.value.value === "number" ? item.value.value : Number(item.value.value);
  return Number.isInteger(value) && value >= 0 && value <= 5 ? { metricCode: item.value.metricCode, value } : null;
}

function parseMetricInput(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 5 ? parsed : null;
}

function formatHistoryDate(item: PhysicianHairHistoryItem, locale: "ar" | "en"): string {
  if (!item.date || item.datePrecision === "UNKNOWN") return locale === "ar" ? "التاريخ غير معروف" : "Date unknown";
  const date = new Date(item.date);
  if (item.datePrecision === "YEAR") {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : "en-US-u-ca-gregory-nu-latn", {
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  if (item.datePrecision === "MONTH") {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : "en-US-u-ca-gregory-nu-latn", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  return formatClinicDate(item.date, locale);
}

function inputDate(item: PhysicianHairHistoryItem): string {
  if (!item.date) return "";
  const d = new Date(item.date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  if (item.datePrecision === "YEAR") return String(year);
  if (item.datePrecision === "MONTH") return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

function dateFromInput(value: string, precision: PhysicianHairHistoryItem["datePrecision"]): string | undefined {
  return isoDateFromInput(value, precision);
}

function makeEditDraft(item: PhysicianHairHistoryItem): EditDraft {
  return {
    itemId: item.id,
    datePrecision: item.datePrecision,
    dateInput: inputDate(item),
    valueInput: metricPayload(item) ? String(metricPayload(item)!.value) : "",
    valueOverride: undefined,
    included: item.included,
  };
}

function editDiffers(item: PhysicianHairHistoryItem, draft: EditDraft): boolean {
  const nextDate = draft.datePrecision === "UNKNOWN" ? undefined : dateFromInput(draft.dateInput, draft.datePrecision);
  const originalDate = item.datePrecision === "UNKNOWN" ? undefined : item.date;
  const originalMetric = metricPayload(item);
  const metricChanged = originalMetric ? draft.valueInput !== String(originalMetric.value) : false;
  const valueChanged = draft.valueOverride !== undefined && JSON.stringify(draft.valueOverride) !== JSON.stringify(item.value);
  return draft.datePrecision !== item.datePrecision
    || nextDate !== originalDate
    || metricChanged
    || valueChanged
    || draft.included !== item.included;
}

function applyEditDraft(item: PhysicianHairHistoryItem, draft: EditDraft, commitSource: boolean, clinicalReferenceAt: string): { item?: PhysicianHairHistoryItem; error?: "VALUE" | "DATE" } {
  const metric = metricPayload(item);
  const value = metric ? parseMetricInput(draft.valueInput) : null;
  if (metric && value === null) return { error: "VALUE" };
  const date = draft.datePrecision === "UNKNOWN" ? undefined : dateFromInput(draft.dateInput, draft.datePrecision);
  if (draft.datePrecision !== "UNKNOWN" && !date) return { error: "DATE" };
  if (date && !hairHistoryDateOnOrBefore(date, draft.datePrecision, clinicalReferenceAt)) return { error: "DATE" };
  if (draft.valueOverride !== undefined && isRecord(draft.valueOverride) && typeof draft.valueOverride.stopDate === "string") {
    const stopPrecision = typeof draft.valueOverride.stopPrecision === "string" && ["DAY", "MONTH", "YEAR", "UNKNOWN"].includes(draft.valueOverride.stopPrecision)
      ? draft.valueOverride.stopPrecision as PhysicianHairHistoryItem["datePrecision"]
      : draft.datePrecision;
    if (stopPrecision === "UNKNOWN" || !hairHistoryDateOnOrBefore(draft.valueOverride.stopDate, stopPrecision, clinicalReferenceAt)) return { error: "DATE" };
    if (date && new Date(draft.valueOverride.stopDate).getTime() < new Date(date).getTime()) return { error: "DATE" };
  }

  const next: PhysicianHairHistoryItem = {
    ...item,
    datePrecision: draft.datePrecision,
    ...(date ? { date } : {}),
    included: draft.included,
    ...(commitSource ? { source: "PHYSICIAN" as const } : {}),
  };
  if (!date) delete next.date;
  if (draft.valueOverride !== undefined) next.value = draft.valueOverride;
  if (metric && value !== null) next.value = { ...(item.value as Record<string, unknown>), value };
  return { item: next };
}

function versionLabel(revision: number | undefined): string {
  return `H-${String(revision ?? 1).padStart(3, "0")}`;
}

function precisionLabel(precision: PhysicianHairHistoryItem["datePrecision"], locale: "ar" | "en"): string {
  if (locale === "ar") {
    if (precision === "DAY") return "يوم محدد";
    if (precision === "MONTH") return "شهر وسنة";
    if (precision === "YEAR") return "سنة فقط";
    return "غير معروف";
  }
  if (precision === "DAY") return "Exact day";
  if (precision === "MONTH") return "Month + year";
  if (precision === "YEAR") return "Year only";
  return "Unknown";
}

function sourceLabel(source: PhysicianHairHistoryItem["source"], locale: "ar" | "en"): string {
  if (source === "PATIENT") return locale === "ar" ? "المراجع" : "Patient";
  return locale === "ar" ? "عدّلها الطبيب" : "Modified by physician";
}

function provenanceLabel(item: PhysicianHairHistoryItem, locale: "ar" | "en"): string {
  if (item.source === "PATIENT") return locale === "ar" ? "سجل أبلغه المراجع" : "Patient-reported record";
  return locale === "ar"
    ? "عدله الطبيب"
    : "Modified by physician";
}

function itemTypeBadge(item: PhysicianHairHistoryItem, locale: "ar" | "en"): string {
  if (item.layer === "MEASURES") return locale === "ar" ? "شدة أبلغ عنها المراجع عند البداية" : "Patient-reported severity at onset";
  if (item.layer === "TREATMENTS") return locale === "ar" ? "علاج مسجل" : "Recorded treatment";
  if (item.layer === "SYMPTOMS") return locale === "ar" ? "عرض مسجل" : "Recorded symptom";
  if (item.layer === "PROCEDURES") return locale === "ar" ? "إجراء مسجل" : "Recorded procedure";
  if (item.layer === "TRIGGERS") return locale === "ar" ? "حدث مسجل" : "Recorded event";
  if (item.layer === "DIAGNOSES") return locale === "ar" ? "تشخيص أو فحص مسجل" : "Recorded diagnosis or test";
  if (item.layer === "TESTS_LABS") return locale === "ar" ? "فحص أو مختبر مسجل" : "Recorded test or lab";
  return locale === "ar" ? "صورة مسجلة" : "Recorded photo";
}

function primaryItemLabel(item: PhysicianHairHistoryItem, locale: "ar" | "en"): string {
  const label = pickLocalized(item.label, locale);
  if (/^(?:Q_|SYN[-_])/i.test(label) || /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(label)) {
    return pickLocalized(hairHistoryLayerLabel(item.layer), locale);
  }
  return label;
}

function patientProvidedDetail(item: PhysicianHairHistoryItem): string | null {
  if (!isRecord(item.value)) return null;
  for (const key of ["details", "description", "detailText", "otherText", "result", "note", "notes"]) {
    const value = item.value[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}

function treatmentDurationLabel(item: PhysicianHairHistoryItem, endDate: string | undefined, ongoing: boolean, locale: "ar" | "en"): string {
  if (!item.date || !endDate) return locale === "ar" ? "المدة غير مكتملة" : "Duration not complete";
  if (item.datePrecision !== "DAY" || treatmentStopPrecision(item) !== "DAY") {
    return ongoing
      ? (locale === "ar" ? "مدة تقريبية · العلاج مستمر" : "Approximate duration · ongoing")
      : (locale === "ar" ? "مدة تقريبية حسب التواريخ المسجلة" : "Approximate duration from recorded dates");
  }
  const days = Math.max(0, Math.round((new Date(endDate).getTime() - new Date(item.date).getTime()) / 86_400_000));
  return ongoing
    ? (locale === "ar" ? `${localeNumber(days, locale)} يومًا حتى الزيارة الحالية · مستمر` : `${localeNumber(days, locale)} days through the current visit · ongoing`)
    : (locale === "ar" ? `${localeNumber(days, locale)} يومًا` : `${localeNumber(days, locale)} days`);
}

const SVG_WIDTH = 1720;
const MEASURE_TOP = 48;
const PLOT_LEFT = 78;
const PLOT_RIGHT = 1650;
const DRAG_THRESHOLD_PX = 8;

function paddedTimelineDomain(items: PhysicianHairHistoryItem[], fallbackCenter: number, extraDates: Array<string | undefined> = []): { min: number; max: number } {
  const times = [...items.map((item) => item.date), ...extraDates].map((date) => date ? new Date(date).getTime() : Number.NaN).filter(Number.isFinite);
  let min = times.length > 0 ? Math.min(...times) : fallbackCenter - 86_400_000 * 30;
  let max = times.length > 0 ? Math.max(...times) : fallbackCenter + 86_400_000 * 30;
  if (min === max) {
    min -= 86_400_000 * 14;
    max += 86_400_000 * 14;
  }
  const pad = Math.max((max - min) * 0.06, 86_400_000 * 7);
  return { min: min - pad, max: max + pad };
}

function shiftIntervalValue(item: PhysicianHairHistoryItem, nextStartInput: string): unknown | undefined {
  if (item.layer !== "TREATMENTS" || !item.date || !isRecord(item.value) || typeof item.value.stopDate !== "string") return undefined;
  const nextStart = dateFromInput(nextStartInput, item.datePrecision);
  if (!nextStart) return undefined;
  const stopDate = shiftIsoDateByStartDelta(item.date, nextStart, item.value.stopDate);
  return stopDate ? { ...item.value, stopDate } : undefined;
}

function treatmentEnd(item: PhysicianHairHistoryItem, sourceVisitAt: string | undefined): { date?: string; ongoing: boolean } {
  if (!isRecord(item.value)) return { ongoing: false };
  if (typeof item.value.stopDate === "string") return { date: item.value.stopDate, ongoing: false };
  if (item.value.stillUsing === true) return { date: sourceVisitAt, ongoing: true };
  return { ongoing: false };
}

function formatDateValue(date: string, precision: PhysicianHairHistoryItem["datePrecision"], locale: "ar" | "en"): string {
  return formatHistoryDate({ date, datePrecision: precision } as PhysicianHairHistoryItem, locale);
}

function formatMetricScore(value: number, locale: "ar" | "en"): string {
  return locale === "ar" ? `${localeNumber(value, locale)} من ${localeNumber(5, locale)}` : `${localeNumber(value, locale)} of ${localeNumber(5, locale)}`;
}

function treatmentStopPrecision(item: PhysicianHairHistoryItem): PhysicianHairHistoryItem["datePrecision"] {
  if (!isRecord(item.value) || typeof item.value.stopPrecision !== "string") return item.datePrecision;
  return ["DAY", "MONTH", "YEAR", "UNKNOWN"].includes(item.value.stopPrecision)
    ? item.value.stopPrecision as PhysicianHairHistoryItem["datePrecision"]
    : item.datePrecision;
}

function metricMarker(metricCode: string, x: number, y: number, selected: boolean, readOnly: boolean, onPointerDown: (event: ReactPointerEvent<SVGGElement>) => void) {
  const className = `${selected ? "history-point history-point--selected" : "history-point"}${readOnly ? " history-point--readonly" : ""}`;
  if (metricCode === "DENSITY") {
    return <g className={className} transform={`translate(${x} ${y})`} onPointerDown={onPointerDown}><rect x="-7" y="-7" width="14" height="14" rx="1" /></g>;
  }
  if (metricCode === "ITCH") {
    return <g className={className} transform={`translate(${x} ${y})`} onPointerDown={onPointerDown}><polygon points="0,-9 9,0 0,9 -9,0" /></g>;
  }
  if (metricCode === "BURNING") {
    return <g className={className} transform={`translate(${x} ${y})`} onPointerDown={onPointerDown}><polygon points="0,-9 9,8 -9,8" /></g>;
  }
  if (metricCode === "SCALP_PAIN") {
    return <g className={className} transform={`translate(${x} ${y})`} onPointerDown={onPointerDown}><line x1="-8" y1="0" x2="8" y2="0"/><line x1="0" y1="-8" x2="0" y2="8"/></g>;
  }
  return <g className={className} transform={`translate(${x} ${y})`} onPointerDown={onPointerDown}><circle cx="0" cy="0" r="7" /></g>;
}

export function PatientHairHistory({ history, patientId, reviewVisitId, locale, referenceOnly = false, onApproved }: { history: PhysicianHairHistory; patientId: string; reviewVisitId?: string; locale: "ar" | "en"; referenceOnly?: boolean; onApproved?: () => void }) {
  const isAr = locale === "ar";
  const svgRef = useRef<SVGSVGElement | null>(null);
  const chartViewportRef = useRef<HTMLDivElement | null>(null);
  const svgWrapRef = useRef<HTMLDivElement | null>(null);
  const overviewRef = useRef<HTMLElement | null>(null);
  const [items, setItems] = useState(() => effectiveReviewedHairHistoryItems(history.items));
  const [localStatus, setLocalStatus] = useState(history.status);
  const [activeEventLayers, setActiveEventLayers] = useState<Set<PhysicianHairHistoryLayer>>(new Set(EVENT_LAYERS));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("IDLE");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [treatmentDragState, setTreatmentDragState] = useState<TreatmentDragState | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savedChange, setSavedChange] = useState<SavedChange | null>(null);
  const [showApprovalConfirm, setShowApprovalConfirm] = useState(false);
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const approved = localStatus === "APPROVED_READ_ONLY";
  const hasApprovedRevision = Boolean(history.approvedRevision && history.approvedRevision > 0);
  const readOnly = approved || referenceOnly;
  const canReopen = approved && hasApprovedRevision && !referenceOnly;
  const selected = selectedId ? items.find((item) => item.id === selectedId) ?? null : null;
  const selectedMetric = selected ? metricPayload(selected) : null;
  const selectedDirty = Boolean(selected && editDraft && editDiffers(selected, editDraft));
  const editPreview = selected && editDraft && selectedDirty ? applyEditDraft(selected, editDraft, false, history.clinicalReferenceAt) : null;
  const draftDateIso = editDraft && editDraft.datePrecision !== "UNKNOWN" ? dateFromInput(editDraft.dateInput, editDraft.datePrecision) : undefined;
  const draftDatePreview = draftDateIso && editDraft ? formatDateValue(draftDateIso, editDraft.datePrecision, locale) : null;

  const chartItems = items.map((item) => item.id === selectedId && editPreview?.item ? editPreview.item : item);
  const included = chartItems.filter((item) => item.included);
  const dated = included.filter((item) => item.date && item.datePrecision !== "UNKNOWN").sort((a, b) => a.date!.localeCompare(b.date!));
  const undated = items.filter((item) => item.included && (!item.date || item.datePrecision === "UNKNOWN"));

  const fallbackCenter = history.sourceVisitAt ? new Date(history.sourceVisitAt).getTime() : Date.UTC(2000, 0, 1);
  const metricItems = dated.filter((item) => item.layer === "MEASURES" && metricPayload(item));
  const stableDated = items.filter((item) => item.included && item.date && item.datePrecision !== "UNKNOWN");
  const stableMetricItems = stableDated.filter((item) => item.layer === "MEASURES" && metricPayload(item));
  const treatmentEndpointDates = stableDated.filter((item) => item.layer === "TREATMENTS").map((item) => treatmentEnd(item, history.sourceVisitAt).date);
  const metricDomain = paddedTimelineDomain(stableMetricItems, fallbackCenter, [history.clinicalReferenceAt]);
  const contextDomain = paddedTimelineDomain(stableDated, fallbackCenter, [...treatmentEndpointDates, history.clinicalReferenceAt]);
  const xFor = (date: string) => Math.max(PLOT_LEFT, Math.min(PLOT_RIGHT, PLOT_LEFT + ((new Date(date).getTime() - metricDomain.min) / (metricDomain.max - metricDomain.min)) * (PLOT_RIGHT - PLOT_LEFT)));
  const clinicalMax = new Date(history.clinicalReferenceAt).getTime();
  const timestampForX = (svgX: number) => historicalTimestampFromTimelineX(svgX, PLOT_LEFT, PLOT_RIGHT, metricDomain.min, metricDomain.max, clinicalMax);
  const metricClusters = clusterMetricPoints(metricItems.map((item) => ({
    item,
    metricCode: metricPayload(item)!.metricCode,
    date: item.date!,
    dateKey: recordedDateKey(item.date!, item.datePrecision),
    value: metricPayload(item)!.value,
  })));
  const metricVisualClusters = layoutMetricCollisionOffsets(metricClusters, METRIC_ORDER);
  const activeMetricSeriesCount = new Set(metricItems.map((item) => metricPayload(item)?.metricCode).filter(Boolean)).size;
  const metricDateClusterCount = new Set(metricItems.map((item) => recordedDateKey(item.date!, item.datePrecision))).size;
  const metricSeriesCounts = METRIC_ORDER.map((metricCode) => metricItems.filter((item) => metricPayload(item)?.metricCode === metricCode).length).filter((count) => count > 0);
  const sparseMetricState = metricItems.length > 0 && (metricDateClusterCount <= 1 || metricSeriesCounts.every((count) => count <= 1));
  const measureStep = adaptiveMeasureStep(metricItems.length, activeMetricSeriesCount);
  const displayedEventLayers = EVENT_LAYERS.filter((layer) => activeEventLayers.has(layer) && dated.some((item) => item.layer === layer));
  const metricBottom = MEASURE_TOP + 5 * measureStep;
  const dateAxis = layoutRecordedDateAxis({
    dates: metricItems.filter((item) => item.date).map((item) => ({ id: item.id, date: item.date!, precision: item.datePrecision, x: xFor(item.date!) })),
    locale,
    plotLeft: PLOT_LEFT,
    plotRight: PLOT_RIGHT,
  });
  const dateTicks = dateAxis.visuals;
  const svgHeight = metricBottom + 34 + Math.max(1, dateAxis.rowCount) * dateAxis.rowHeight + 18;
  const allEventLayersVisible = EVENT_LAYERS.every((layer) => activeEventLayers.has(layer));
  const dragOriginal = dragState ? items.find((item) => item.id === dragState.itemId) ?? null : null;
  const dragOriginalMetric = dragOriginal ? metricPayload(dragOriginal) : null;
  const selectedChartItem = selectedId ? chartItems.find((item) => item.id === selectedId) ?? selected : null;
  const selectedChartMetric = selectedChartItem ? metricPayload(selectedChartItem) : null;
  const selectedChartMeasure = selectedChartItem?.layer === "MEASURES" && selectedChartMetric ? selectedChartItem : null;
  const selectedMetricCluster = selectedChartMeasure
    ? metricClusters.find((cluster) => cluster.items.some((item) => item.id === selectedChartMeasure.id)) ?? null
    : null;
  const selectedMetricVisual = selectedMetricCluster ? metricVisualClusters.find((cluster) => cluster.key === selectedMetricCluster.key) ?? null : null;
  const sameMetricNeighbors = (() => {
    if (!selectedChartMeasure || !selectedChartMetric || !selectedChartMeasure.date) return { previous: null as PhysicianHairHistoryItem | null, next: null as PhysicianHairHistoryItem | null };
    const selectedDateKey = recordedDateKey(selectedChartMeasure.date, selectedChartMeasure.datePrecision);
    const series = chartItems
      .filter((item) => item.id !== selectedChartMeasure.id && item.date && item.included && metricPayload(item)?.metricCode === selectedChartMetric.metricCode && recordedDateKey(item.date, item.datePrecision) !== selectedDateKey)
      .sort((a, b) => a.date!.localeCompare(b.date!));
    return {
      previous: [...series].reverse().find((item) => item.date! < selectedChartMeasure.date!) ?? null,
      next: series.find((item) => item.date! > selectedChartMeasure.date!) ?? null,
    };
  })();
  const sameMetricDateCount = selectedChartMetric
    ? new Set(chartItems.filter((item) => item.included && item.date && metricPayload(item)?.metricCode === selectedChartMetric.metricCode).map((item) => recordedDateKey(item.date!, item.datePrecision))).size
    : 0;
  const selectedContextItem = selected && selected.layer !== "MEASURES" ? selected : null;
  const selectedContextDetail = selectedContextItem ? patientProvidedDetail(selectedContextItem) : null;
  const selectedTreatmentEnd = selectedContextItem?.layer === "TREATMENTS" ? treatmentEnd(selectedContextItem, history.sourceVisitAt) : null;
  const treatmentItems = displayedEventLayers.includes("TREATMENTS") ? dated.filter((item) => item.layer === "TREATMENTS") : [];
  const eventCardLayers = displayedEventLayers.filter((layer) => layer !== "TREATMENTS");
  const positionPercent = (date: string) => Math.max(0, Math.min(100, ((new Date(date).getTime() - contextDomain.min) / (contextDomain.max - contextDomain.min)) * 100));
  const displayedEventLayerKey = displayedEventLayers.join(":");
  const selectedAnchor = selectedChartMeasure?.date && selectedChartMetric
    ? { x: xFor(selectedChartMeasure.date) + (selectedMetricVisual?.offsetX ?? 0), y: MEASURE_TOP + (5 - selectedChartMetric.value) * measureStep }
    : null;
  const selectedAnchorX = selectedAnchor?.x;
  const selectedAnchorY = selectedAnchor?.y;

  useLayoutEffect(() => {
    const viewport = chartViewportRef.current;
    const wrap = svgWrapRef.current;
    const svg = svgRef.current;
    const overview = overviewRef.current;
    if (!overviewOpen || selectedAnchorX === undefined || selectedAnchorY === undefined || !viewport || !wrap || !svg || !overview) return;

    const updatePosition = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const overviewRect = overview.getBoundingClientRect();
      const anchorX = svgRect.left - viewportRect.left + (selectedAnchorX / SVG_WIDTH) * svgRect.width;
      const anchorY = svgRect.top - viewportRect.top + (selectedAnchorY / svgHeight) * svgRect.height;
      const anchorVisible = anchorX >= 0 && anchorX <= viewport.clientWidth && anchorY >= 0 && anchorY <= viewport.clientHeight;
      overview.style.visibility = anchorVisible ? "visible" : "hidden";
      if (!anchorVisible) return;
      const avoidRects = Array.from(viewport.querySelectorAll<SVGGraphicsElement>("[data-history-obstacle]"))
        .map((node) => node.getBoundingClientRect())
        .map((rect) => ({ left: rect.left - viewportRect.left, top: rect.top - viewportRect.top, width: rect.width, height: rect.height }))
        .filter((rect) => rect.width > 0 && rect.height > 0 && Math.hypot(rect.left + rect.width / 2 - anchorX, rect.top + rect.height / 2 - anchorY) < Math.max(overviewRect.width, overviewRect.height) + 180);
      const position = chooseFloatingPanelPosition({
        containerWidth: viewport.clientWidth,
        containerHeight: viewport.clientHeight,
        panelWidth: overviewRect.width,
        panelHeight: overviewRect.height,
        anchorX,
        anchorY,
        margin: 12,
        gap: 18,
        protectedRadius: 28,
        avoidRects,
      });
      overview.style.left = `${position.left}px`;
      overview.style.top = `${position.top}px`;
      overview.dataset.placement = position.placement;
      overview.style.setProperty("--overview-pointer-x", `${position.pointerX}px`);
      overview.style.setProperty("--overview-pointer-y", `${position.pointerY}px`);
    };

    let frame = 0;
    const schedulePosition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updatePosition);
    };
    schedulePosition();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedulePosition);
    observer?.observe(viewport);
    observer?.observe(wrap);
    observer?.observe(svg);
    observer?.observe(overview);
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    window.visualViewport?.addEventListener("resize", schedulePosition);
    window.visualViewport?.addEventListener("scroll", schedulePosition);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
      window.visualViewport?.removeEventListener("resize", schedulePosition);
      window.visualViewport?.removeEventListener("scroll", schedulePosition);
    };
  }, [overviewOpen, selectedAnchorX, selectedAnchorY, selectedId, svgHeight, locale, displayedEventLayerKey]);

  function selectItem(item: PhysicianHairHistoryItem, options?: { openEditor?: boolean; openOverview?: boolean }) {
    setSelectedId(item.id);
    setEditDraft(makeEditDraft(item));
    setPanelMode("SELECTED");
    setEditorOpen(Boolean(options?.openEditor));
    setOverviewOpen(options?.openOverview ?? Boolean(item.date && item.datePrecision !== "UNKNOWN"));
    setMessage(null);
    setSavedChange(null);
  }

  function openSelectedEditor() {
    if (!selected || readOnly || !selected.editable) return;
    setEditorOpen(true);
    setPanelMode(selectedDirty ? "EDITING" : "SELECTED");
  }

  function closeOverview() {
    setOverviewOpen(false);
  }

  function openMetricCluster(clusterItems: PhysicianHairHistoryItem[], event: ReactPointerEvent<SVGGElement>) {
    const first = clusterItems[0];
    if (!first) return;
    selectItem(first, { openOverview: true, openEditor: false });
    event.preventDefault();
  }

  function cancelEdit() {
    if (selected) setEditDraft(makeEditDraft(selected));
    setPanelMode("SELECTED");
    setMessage(isAr ? "أُلغي التغيير ولم تُحفظ أي تعديلات." : "The change was cancelled and nothing was saved.");
  }

  function setDraft(patch: Partial<EditDraft>) {
    setEditDraft((current) => current ? { ...current, ...patch } : current);
    setPanelMode("EDITING");
    setMessage(null);
  }

  async function request(body: Record<string, unknown>) {
    const response = await fetch(`/api/physician/patients/${patientId}/hair-history`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "Request failed");
    return payload as Record<string, unknown>;
  }

  async function saveReviewSnapshot() {
    if (readOnly) return;
    if (!history.sourceVisitId) return setMessage(isAr ? "تعذر حفظ تاريخ الشعر لهذا السجل." : "Hair History cannot be saved for this record.");
    if (selectedDirty) return setMessage(isAr ? "احفظ التعديل الحالي أو ألغِه قبل حفظ المراجعة." : "Save or cancel the current edit before saving the review.");
    setBusy(true);
    setMessage(null);
    try {
      await request({ action: "SAVE_DRAFT", sourceVisitId: history.sourceVisitId, baseRevision: history.baseRevision, items });
      setLocalStatus(history.baseRevision > 0 ? "AMENDMENT_DRAFT" : "REVIEWED_DRAFT");
      setMessage(isAr ? "تم حفظ المراجعة. اعتماد التاريخ يبقى خطوة مستقلة." : "Review saved. Hair History approval remains a separate step.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveSelectedEdit() {
    if (readOnly) return;
    if (!history.sourceVisitId || !selected || !editDraft || !selectedDirty) return;
    const applied = applyEditDraft(selected, editDraft, true, history.clinicalReferenceAt);
    if (applied.error === "VALUE") {
      setPanelMode("ERROR");
      setMessage(isAr ? "القيمة المدخلة غير صالحة. النطاق المسموح من ٠ إلى ٥." : "The entered value is invalid. Allowed range is 0–5.");
      return;
    }
    if (applied.error === "DATE") {
      setPanelMode("ERROR");
      setMessage(isAr ? "أدخل تاريخًا صالحًا لا يقع في المستقبل." : "Enter a valid date that is not in the future.");
      return;
    }
    if (!applied.item) return;

    const before = selected;
    const after = applied.item;
    const nextItems = items.map((item) => item.id === selected.id ? after : item);
    setBusy(true);
    setMessage(null);
    try {
      if (localStatus === "PATIENT_REPORTED_PREVIEW") {
        await request({ action: "SAVE_DRAFT", sourceVisitId: history.sourceVisitId, baseRevision: history.baseRevision, items });
        setLocalStatus("REVIEWED_DRAFT");
      }
      await request({
        action: "SAVE_DRAFT",
        sourceVisitId: history.sourceVisitId,
        baseRevision: history.baseRevision,
        items: nextItems,
      });
      const beforeMetric = metricPayload(before)?.value;
      const afterMetric = metricPayload(after)?.value;
      const summary = beforeMetric !== undefined && afterMetric !== undefined && beforeMetric !== afterMetric
        ? `${localeNumber(beforeMetric, locale)} → ${localeNumber(afterMetric, locale)}`
        : formatHistoryDate(before, locale) !== formatHistoryDate(after, locale)
          ? `${formatHistoryDate(before, locale)} → ${formatHistoryDate(after, locale)}`
          : before.included !== after.included
            ? (after.included ? (isAr ? "تم تضمين العنصر" : "Item included") : (isAr ? "تم استبعاد العنصر" : "Item excluded"))
            : (isAr ? "تم حفظ التعديل" : "Change saved");
      setItems(nextItems);
      setEditDraft(makeEditDraft(after));
      setLocalStatus(history.baseRevision > 0 ? "AMENDMENT_DRAFT" : "REVIEWED_DRAFT");
      setSavedChange({ label: pickLocalized(after.label, locale), summary, savedAt: new Date().toISOString() });
      setPanelMode("SAVED");
      setMessage(null);
    } catch (error) {
      setPanelMode("ERROR");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function approveHistory() {
    if (readOnly) return;
    if (!reviewVisitId) return setMessage(isAr ? "لا توجد زيارة حالية لاعتماد التاريخ." : "No current review visit is available for approval.");
    if (localStatus === "PATIENT_REPORTED_PREVIEW") return setMessage(isAr ? "احفظ المراجعة قبل اعتماد التاريخ." : "Save the review before approving Hair History.");
    if (selectedDirty) return setMessage(isAr ? "يوجد تغيير غير محفوظ يمنع اعتماد التاريخ." : "An unsaved change must be saved or cancelled before approval.");
    setBusy(true);
    setMessage(null);
    try {
      await request({ action: "APPROVE", approvingVisitId: reviewVisitId });
      setLocalStatus("APPROVED_READ_ONLY");
      if (onApproved) onApproved();
      else window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setShowApprovalConfirm(false);
    }
  }

  async function reopen() {
    if (!canReopen || !history.sourceVisitId) return;
    setBusy(true);
    setMessage(null);
    try {
      await request({ action: "REOPEN", sourceVisitId: history.sourceVisitId, reason: reopenReason });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function beginMetricDrag(item: PhysicianHairHistoryItem, event: ReactPointerEvent<SVGGElement>) {
    if (readOnly || !item.editable || item.datePrecision === "UNKNOWN" || !item.date) {
      selectItem(item, { openOverview: true, openEditor: false });
      return;
    }
    setSelectedId(item.id);
    setEditDraft(makeEditDraft(item));
    setPanelMode("SELECTED");
    setOverviewOpen(true);
    setEditorOpen(false);
    setMessage(null);
    setSavedChange(null);
    setDragState({ itemId: item.id, pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, moved: false });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleChartDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragState || !svgRef.current) return;
    const movement = Math.hypot(event.clientX - dragState.startClientX, event.clientY - dragState.startClientY);
    if (!dragState.moved && movement < DRAG_THRESHOLD_PX) return;
    if (!dragState.moved) {
      setDragState((current) => current ? { ...current, moved: true } : current);
      setEditorOpen(true);
      setOverviewOpen(false);
    }
    const sourceItem = items.find((item) => item.id === dragState.itemId);
    if (!sourceItem || sourceItem.datePrecision === "UNKNOWN") return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * SVG_WIDTH;
    const svgY = ((event.clientY - rect.top) / rect.height) * Number(svgRef.current.getAttribute("viewBox")?.split(" ")[3] ?? 760);
    const dateInput = dateInputFromTimestamp(timestampForX(svgX), sourceItem.datePrecision);
    setEditDraft((current) => {
      if (!current || current.itemId !== dragState.itemId) return current;
      const value = metricValueFromSvgY(svgY, MEASURE_TOP, measureStep);
      return { ...current, dateInput, valueInput: String(value) };
    });
    setPanelMode("EDITING");
  }

  function endChartDrag() {
    if (!dragState) return;
    if (dragState.moved) {
      setEditorOpen(true);
      setOverviewOpen(false);
      setPanelMode("EDITING");
    } else {
      setPanelMode("SELECTED");
      setEditorOpen(false);
      setOverviewOpen(true);
    }
    setDragState(null);
  }

  function timestampFromTreatmentTrack(clientX: number, track: HTMLElement): number {
    const rect = track.getBoundingClientRect();
    const ratio = rect.width <= 0 ? 0 : Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.min(clinicalMax, contextDomain.min + ratio * (contextDomain.max - contextDomain.min));
  }

  function beginTreatmentDrag(item: PhysicianHairHistoryItem, mode: HairHistoryTreatmentDragMode, event: ReactPointerEvent<HTMLElement>) {
    if (readOnly || !item.editable || !item.date || item.datePrecision === "UNKNOWN") return;
    const end = treatmentEnd(item, history.sourceVisitAt);
    if (!end.date) return;
    if (end.ongoing && mode !== "START") return;
    const track = event.currentTarget.closest<HTMLElement>(".hair-history-treatment-track");
    if (!track) return;
    const startTimestamp = new Date(item.date).getTime();
    const endTimestamp = new Date(end.date).getTime();
    if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) return;

    setSelectedId(item.id);
    setEditDraft(makeEditDraft(item));
    setPanelMode("SELECTED");
    setOverviewOpen(true);
    setEditorOpen(false);
    setMessage(null);
    setSavedChange(null);
    setTreatmentDragState({
      itemId: item.id,
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      pointerStartTimestamp: timestampFromTreatmentTrack(event.clientX, track),
      startTimestamp,
      endTimestamp,
      moved: false,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  function handleTreatmentDrag(item: PhysicianHairHistoryItem, event: ReactPointerEvent<HTMLElement>) {
    if (!treatmentDragState || treatmentDragState.itemId !== item.id) return;
    const movement = Math.abs(event.clientX - treatmentDragState.startClientX);
    if (!treatmentDragState.moved && movement < DRAG_THRESHOLD_PX) return;
    if (!treatmentDragState.moved) {
      setTreatmentDragState((current) => current ? { ...current, moved: true } : current);
      setEditorOpen(true);
      setOverviewOpen(false);
    }

    const pointerTimestamp = timestampFromTreatmentTrack(event.clientX, event.currentTarget);
    const moved = moveTreatmentInterval({
      mode: treatmentDragState.mode,
      pointerTimestamp,
      pointerStartTimestamp: treatmentDragState.pointerStartTimestamp,
      startTimestamp: treatmentDragState.startTimestamp,
      endTimestamp: treatmentDragState.endTimestamp,
      domainMin: contextDomain.min,
      domainMax: clinicalMax,
    });
    const startInput = dateInputFromTimestamp(moved.startTimestamp, item.datePrecision);
    const stopPrecision = treatmentStopPrecision(item);
    const endInput = dateInputFromTimestamp(moved.endTimestamp, stopPrecision);
    const nextStop = dateFromInput(endInput, stopPrecision);
    const originalValue = isRecord(item.value) ? item.value : {};

    setEditDraft((current) => {
      if (!current || current.itemId !== item.id) return current;
      if (treatmentDragState.mode === "START") return { ...current, dateInput: startInput };
      if (!nextStop) return current;
      if (treatmentDragState.mode === "END") {
        return { ...current, valueOverride: { ...originalValue, stopDate: nextStop, stopPrecision, stillUsing: false } };
      }
      return {
        ...current,
        dateInput: startInput,
        valueOverride: { ...originalValue, stopDate: nextStop, stopPrecision, stillUsing: false },
      };
    });
    setPanelMode("EDITING");
    event.stopPropagation();
    event.preventDefault();
  }

  function endTreatmentDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!treatmentDragState) return;
    if (treatmentDragState.moved) {
      setPanelMode("EDITING");
      setEditorOpen(true);
      setOverviewOpen(false);
    } else {
      setPanelMode("SELECTED");
      setEditorOpen(false);
      setOverviewOpen(true);
    }
    setTreatmentDragState(null);
    event.stopPropagation();
    event.preventDefault();
  }

  return <div className={styles.scope}><div className="hair-history-workspace">
    <section className="hair-history-commandbar" aria-label={isAr ? "أدوات تاريخ الشعر" : "Hair History tools"}>
      <div className="hair-history-command-source">
        <div>
          <strong>{referenceOnly ? (isAr ? "تاريخ المراجع — مرجع" : "Patient Hair History — reference") : approved ? (isAr ? "تاريخ شعر معتمد" : "Approved Hair History") : (isAr ? "تاريخ الشعر من المراجع" : "Patient-reported Hair History")}</strong>
          <span>{history.sourceVisitAt ? `${isAr ? "أُبلغ عنه في" : "Reported on"} ${formatClinicDate(history.sourceVisitAt, locale)}` : (isAr ? "المصدر: المراجع" : "Source: patient")}</span>
        </div>
        <span className={approved ? "status-pill status-pill--success" : referenceOnly ? "status-pill" : "status-pill status-pill--warning"}>
          {approved ? (isAr ? `معتمد · ${versionLabel(history.approvedRevision)}` : `Approved · ${versionLabel(history.approvedRevision)}`) : referenceOnly ? (isAr ? "مرجع فقط" : "Reference only") : localStatus === "PATIENT_REPORTED_PREVIEW" ? (isAr ? "بانتظار المراجعة" : "Awaiting review") : (isAr ? "مراجعة محفوظة" : "Review saved")}
        </span>
      </div>
      <div className="hair-history-layer-tools">
        <div className="history-layer-chip-row">
          <button type="button" className="history-layer-chip history-layer-chip--active history-layer-chip--locked" aria-pressed="true" disabled>{pickLocalized(hairHistoryLayerLabel("MEASURES"), locale)}</button>
          {EVENT_LAYERS.map((layer) => <button type="button" key={layer} aria-pressed={activeEventLayers.has(layer)} className={activeEventLayers.has(layer) ? "history-layer-chip history-layer-chip--active" : "history-layer-chip"} onClick={() => setActiveEventLayers((current) => { const next = new Set(current); if (next.has(layer)) next.delete(layer); else next.add(layer); return next; })}>{pickLocalized(hairHistoryLayerLabel(layer), locale)}</button>)}
        </div>
        <button type="button" className="hair-history-layer-mode" onClick={() => setActiveEventLayers(allEventLayersVisible ? new Set<PhysicianHairHistoryLayer>() : new Set<PhysicianHairHistoryLayer>(EVENT_LAYERS))}>{allEventLayersVisible ? (isAr ? "المقاييس فقط" : "Measures only") : (isAr ? "إظهار الكل" : "Show all")}</button>
      </div>
      <div className="hair-history-measure-legend" aria-label={isAr ? "مفتاح المقاييس" : "Measure legend"}>
        {METRIC_ORDER.map((code) => <span key={code} className={`history-legend-item ${METRIC_CLASS[code]}`}><i className={`history-legend-marker history-legend-marker--${code.toLowerCase()}`} />{pickLocalized(METRIC_LABEL[code], locale)}<b className="history-legend-line" /></span>)}
      </div>
    </section>

    <div className="hair-history-main-grid">
      <section className="hair-history-chart-card hair-history-chart-card--modern">
        {dated.length === 0 ? <div className="hair-history-empty"><strong>{isAr ? "لا توجد بيانات مؤرخة في هذا العرض" : "No dated data in this view"}</strong><p>{isAr ? "يمكن مراجعة العناصر غير المؤرخة من القسم أدناه." : "Undated items can be reviewed below."}</p></div> : <div ref={chartViewportRef} className={sparseMetricState ? "hair-history-chart-viewport hair-history-chart-viewport--sparse" : "hair-history-chart-viewport"}>
          {sparseMetricState && <div className="hair-history-sparse-note" role="note"><strong>{isAr ? "لقطة تاريخية محدودة" : "Limited historical snapshot"}</strong><span>{metricDateClusterCount <= 1 ? (isAr ? "تتوفر شدة أبلغ عنها المراجع عند تاريخ بداية واحد؛ لا يظهر اتجاه زمني بعد." : "Patient-reported onset severity is available at one clinical event date; no time trend is shown yet.") : (isAr ? "تتوفر نقاط تاريخية محدودة؛ لا يظهر مسار زمني كامل بعد." : "Historical points are limited; a complete time trajectory is not available yet.")}</span></div>}
          <div ref={svgWrapRef} className="hair-history-svg-wrap">
          <svg ref={svgRef} viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`} role="img" aria-label={isAr ? "مخطط المقاييس الخمسة لتاريخ الشعر" : "Five-measure Hair History graph"} onPointerMove={handleChartDrag} onPointerUp={endChartDrag} onPointerCancel={endChartDrag}>
            <text x="44" y="32" className="history-axis-title">{isAr ? "المقاييس ٠–٥" : "Measures 0–5"}</text>
            {[0, 1, 2, 3, 4, 5].map((value) => {
              const y = MEASURE_TOP + (5 - value) * measureStep;
              return <g key={value}><line x1={PLOT_LEFT} y1={y} x2={PLOT_RIGHT} y2={y} className="history-grid-line"/><text x={PLOT_LEFT - 18} y={y + 5} textAnchor="end" className="history-axis-label">{localeNumber(value, locale)}</text></g>;
            })}
            {METRIC_ORDER.map((metricCode) => {
              const clusters = metricVisualClusters.filter((cluster) => cluster.metricCode === metricCode);
              const coords = clusters.map((cluster) => ({ cluster, x: xFor(cluster.date), displayX: xFor(cluster.date) + cluster.offsetX, y: MEASURE_TOP + (5 - cluster.value) * measureStep }));
              const uniqueSeriesDates = new Set(clusters.map((cluster) => cluster.dateKey)).size;
              return <g key={metricCode} className={METRIC_CLASS[metricCode]}>
                {uniqueSeriesDates > 1 && coords.length > 1 && <polyline points={coords.map((coord) => `${coord.x},${coord.y}`).join(" ")} className="history-metric-line"/>}
                {coords.map(({ cluster, x, displayX, y }) => {
                  const representative = cluster.items[0]!;
                  const clusterSelected = cluster.items.some((item) => item.id === selectedId);
                  return <g key={cluster.key} data-history-item-id={representative.id} data-history-cluster-size={cluster.items.length} data-history-true-x={x} data-history-display-x={displayX}>
                    {cluster.offsetX !== 0 && <line x1={x} y1={y} x2={displayX} y2={y} className="history-point-collision-connector" aria-hidden="true"/>}
                    {metricMarker(cluster.metricCode, displayX, y, clusterSelected, readOnly || cluster.items.length > 1, (event) => cluster.items.length > 1 ? openMetricCluster(cluster.items, event) : beginMetricDrag(representative, event))}
                    <text x={displayX} y={y - 15} textAnchor="middle" className="history-point-value">{localeNumber(cluster.value, locale)}</text>
                    {cluster.items.length > 1 && <g className="history-point-cluster-badge" transform={`translate(${displayX + 12} ${y - 11})`} aria-label={isAr ? `${localeNumber(cluster.items.length, locale)} سجلات في النقطة نفسها` : `${cluster.items.length} records at this point`}><circle r="10"/><text x="0" y="3.5" textAnchor="middle">{localeNumber(cluster.items.length, locale)}</text></g>}
                  </g>;
                })}
              </g>;
            })}
            {dragState && dragOriginal?.date && dragOriginalMetric && <g className={`${METRIC_CLASS[dragOriginalMetric.metricCode]} history-drag-origin`}>
              <circle cx={xFor(dragOriginal.date)} cy={MEASURE_TOP + (5 - dragOriginalMetric.value) * measureStep} r="11" className="history-drag-origin-marker"/>
            </g>}
            {metricItems.length === 0 && <text x={(PLOT_LEFT + PLOT_RIGHT) / 2} y={MEASURE_TOP + 2.5 * measureStep} textAnchor="middle" className="history-measure-empty">{isAr ? "لا توجد قياسات رقمية مسجلة من ٠ إلى ٥" : "No recorded 0–5 measurements"}</text>}
            {dateTicks.map((tick) => <line key={`guide:${tick.id}`} x1={tick.x} y1={MEASURE_TOP} x2={tick.x} y2={metricBottom} className="history-date-guide"/>)}
            {dateTicks.map((tick) => {
              const labelX = (tick.labelLeft + tick.labelRight) / 2;
              const labelY = metricBottom + 29 + tick.row * dateAxis.rowHeight;
              return <text key={`date:${tick.id}`} x={labelX} y={labelY} textAnchor="middle" className="history-date-label" data-history-obstacle data-history-axis-row={tick.row} data-history-axis-left={tick.labelLeft} data-history-axis-right={tick.labelRight}>
                <tspan x={labelX} className="history-date-label-primary">{tick.primary}</tspan>
                {tick.secondary && <tspan x={labelX} dy="12" className="history-date-label-secondary">{tick.secondary}</tspan>}
              </text>;
            })}
          </svg>
          </div>
          {overviewOpen && selectedChartMeasure && selectedChartMetric && selectedChartMeasure.date && <aside ref={overviewRef} className="hair-history-overview-popover" aria-label={isAr ? "ملخص القياس المحدد" : "Selected measurement summary"}>
            <header className="hair-history-overview-header">
              <div>
                <h3>{selectedMetricCluster && selectedMetricCluster.items.length > 1 ? (isAr ? "سجلات متعددة في موضع الرسم نفسه" : "Multiple records at the same plotted position") : pickLocalized(METRIC_LABEL[selectedChartMetric.metricCode] ?? selectedChartMeasure.label, locale)}</h3>
                <span className={`hair-history-overview-category ${METRIC_CLASS[selectedChartMetric.metricCode] ?? ""}`}>{isAr ? "شدة أبلغ عنها المراجع عند البداية" : "Patient-reported severity at onset"}</span>
                {selectedChartMeasure.source === "PHYSICIAN" && <span className="status-pill status-pill--success">{sourceLabel(selectedChartMeasure.source, locale)}</span>}
              </div>
              <button type="button" className="hair-history-overview-close" aria-label={isAr ? "إغلاق النظرة السريعة" : "Close overview"} onClick={closeOverview}>×</button>
            </header>
            {selectedMetricCluster && selectedMetricCluster.items.length > 1 ? <>
              <dl className="hair-history-overview-rows hair-history-overview-rows--cluster">
                <div><dt>{isAr ? "تاريخ بداية العرض" : "Symptom onset date"}</dt><dd>{formatHistoryDate(selectedChartMeasure, locale)}</dd></div>
              </dl>
              <section className="hair-history-overview-cluster" aria-label={isAr ? "السجلات المتطابقة في موضع الرسم" : "Records sharing this plotted position"}>
                <div><strong>{isAr ? `${localeNumber(selectedMetricCluster.items.length, locale)} سجلات منفصلة` : `${selectedMetricCluster.items.length} separate records`}</strong><span>{isAr ? "لم تُدمج السجلات؛ اختر السجل المطلوب لمراجعته." : "Records are not merged; select the record you want to review."}</span></div>
                <div>{selectedMetricCluster.items.map((item) => <button type="button" key={item.id} className={item.id === selectedId ? "hair-history-overview-cluster-item hair-history-overview-cluster-item--selected" : "hair-history-overview-cluster-item"} onClick={() => selectItem(item, { openEditor: false, openOverview: true })}><span><b>{pickLocalized(METRIC_LABEL[metricPayload(item)!.metricCode] ?? item.label, locale)}</b><small>{sourceLabel(item.source, locale)}</small></span><strong>{formatMetricScore(metricPayload(item)!.value, locale)}</strong></button>)}</div>
              </section>
            </> : <dl className="hair-history-overview-rows">
              <div><dt>{isAr ? "القيمة" : "Value"}</dt><dd className={METRIC_CLASS[selectedChartMetric.metricCode] ?? ""}>{formatMetricScore(selectedChartMetric.value, locale)}</dd></div>
              <div><dt>{isAr ? "تاريخ بداية العرض" : "Symptom onset date"}</dt><dd>{formatHistoryDate(selectedChartMeasure, locale)}</dd></div>
              <div className="hair-history-overview-row--context"><dt>{isAr ? "السياق الزمني" : "Time context"}</dt><dd>{sameMetricDateCount <= 1 ? <strong>{isAr ? "لا يوجد اتجاه زمني بعد" : "No time trend yet"}</strong> : <span className="hair-history-overview-neighbors">
                {sameMetricNeighbors.previous && <span><b>{isAr ? "السابق" : "Previous"}</b><strong>{formatMetricScore(metricPayload(sameMetricNeighbors.previous)!.value, locale)}</strong><small>{formatHistoryDate(sameMetricNeighbors.previous, locale)}</small></span>}
                {sameMetricNeighbors.next && <span><b>{isAr ? "التالي" : "Next"}</b><strong>{formatMetricScore(metricPayload(sameMetricNeighbors.next)!.value, locale)}</strong><small>{formatHistoryDate(sameMetricNeighbors.next, locale)}</small></span>}
              </span>}</dd></div>
            </dl>}
            <footer className="hair-history-overview-footer">
              {!readOnly && selectedChartMeasure.editable && <button type="button" className="button button--primary" onClick={openSelectedEditor}>{isAr ? "تعديل العنصر" : "Edit item"}</button>}
              <details className="hair-history-overview-details"><summary>{isAr ? "عرض التفاصيل" : "Show details"}</summary><dl><div><dt>{isAr ? "المصدر" : "Source"}</dt><dd>{sourceLabel(selectedChartMeasure.source, locale)}</dd></div><div><dt>{isAr ? "دقة التاريخ" : "Date precision"}</dt><dd>{precisionLabel(selectedChartMeasure.datePrecision, locale)}</dd></div><div><dt>{isAr ? "المصدر وسجل التعديل" : "Source and change history"}</dt><dd>{provenanceLabel(selectedChartMeasure, locale)}</dd></div></dl></details>
            </footer>
          </aside>}
        </div>}
      </section>

      <section className="hair-history-context-dashboard" aria-label={isAr ? "السياق السريري المسجل" : "Recorded clinical context"}>
        <header className="hair-history-context-heading"><div><p className="eyebrow">{isAr ? "السياق السريري" : "Clinical context"}</p><h2>{isAr ? "السياق السريري المسجل" : "Recorded clinical context"}</h2><p>{isAr ? "علاجات وأحداث أبلغ عنها المراجع، مرتبة زمنيًا." : "Patient-reported treatments and events in chronological order."}</p></div><span>{localeNumber(displayedEventLayers.reduce((count, layer) => count + dated.filter((item) => item.layer === layer).length, 0), locale)} {isAr ? "عنصر" : "items"}</span></header>

        {treatmentItems.length > 0 && <section className="hair-history-treatment-section">
          <div className="hair-history-context-section-title"><span className="hair-history-context-icon hair-history-context-icon--treatments" aria-hidden="true"/><div><h3>{pickLocalized(hairHistoryLayerLabel("TREATMENTS"), locale)}</h3><p>{isAr ? "المدة تظهر فقط عندما تكون البداية والنهاية أو الاستمرارية مسجلة." : "Duration appears only when a recorded end or ongoing state exists."}</p></div></div>
          <div className="hair-history-treatment-list">{treatmentItems.map((item) => {
            const end = treatmentEnd(item, history.sourceVisitAt);
            const startPosition = positionPercent(item.date!);
            const endPosition = end.date ? Math.max(startPosition, positionPercent(end.date)) : startPosition;
            const hasDuration = Boolean(end.date && endPosition > startPosition);
            const canDragDuration = Boolean(hasDuration && !readOnly && item.editable);
            const canDragWholeBar = canDragDuration && !end.ongoing;
            return <button type="button" key={item.id} className={selectedId === item.id ? "hair-history-treatment-card hair-history-treatment-card--selected" : "hair-history-treatment-card"} onClick={() => selectItem(item, { openEditor: false, openOverview: true })}>
              <span className="hair-history-treatment-card-copy"><strong>{pickLocalized(item.label, locale)}</strong><small>{item.source === "PHYSICIAN" ? sourceLabel(item.source, locale) : (isAr ? "علاج أبلغ عنه المراجع" : "Patient-reported treatment")}</small></span>
              <span className="hair-history-treatment-dates"><span><b>{isAr ? "البداية" : "Start"}</b>{formatHistoryDate(item, locale)}</span><span><b>{end.ongoing ? (isAr ? "الحالة" : "Status") : (isAr ? "النهاية" : "End")}</b>{end.ongoing ? (isAr ? "مستمر حتى الزيارة الحالية" : "Ongoing at current visit") : end.date ? formatDateValue(end.date, treatmentStopPrecision(item), locale) : (isAr ? "غير مسجلة" : "Not recorded")}</span></span>
              <span className="hair-history-treatment-timeline">
                <span className="hair-history-treatment-timeline-label">{hasDuration ? (end.ongoing ? (isAr ? "مدة العلاج · مستمر" : "Treatment duration · ongoing") : (isAr ? "مدة العلاج المسجلة" : "Recorded treatment duration")) : (isAr ? "بداية مسجلة فقط — لا توجد مدة مكتملة" : "Recorded start only — no complete duration")}</span>
                <span className={canDragDuration ? "hair-history-treatment-track hair-history-treatment-track--editable" : "hair-history-treatment-track"} onPointerMove={(event) => handleTreatmentDrag(item, event)} onPointerUp={endTreatmentDrag} onPointerCancel={endTreatmentDrag} onClick={(event) => event.stopPropagation()}>
                  <i className={canDragDuration ? "hair-history-treatment-boundary hair-history-treatment-boundary--start hair-history-treatment-boundary--draggable" : "hair-history-treatment-boundary hair-history-treatment-boundary--start"} style={{ left: `${startPosition}%` }} onPointerDown={canDragDuration ? (event) => beginTreatmentDrag(item, "START", event) : undefined}/>
                  {hasDuration && <i className={`${end.ongoing ? "hair-history-treatment-duration hair-history-treatment-duration--ongoing" : "hair-history-treatment-duration"}${canDragWholeBar ? " hair-history-treatment-duration--draggable" : ""}`} style={{ left: `${startPosition}%`, width: `${Math.max(1.5, endPosition - startPosition)}%` }} onPointerDown={canDragWholeBar ? (event) => beginTreatmentDrag(item, "BAR", event) : undefined}/>} 
                  {hasDuration && <i className={`${end.ongoing ? "hair-history-treatment-boundary hair-history-treatment-boundary--end hair-history-treatment-boundary--ongoing" : "hair-history-treatment-boundary hair-history-treatment-boundary--end"}${canDragDuration && !end.ongoing ? " hair-history-treatment-boundary--draggable" : ""}`} style={{ left: `${endPosition}%` }} onPointerDown={canDragDuration && !end.ongoing ? (event) => beginTreatmentDrag(item, "END", event) : undefined}/>} 
                </span>
              </span>
            </button>;
          })}</div>
        </section>}

        {eventCardLayers.length > 0 ? <div className="hair-history-event-groups">{eventCardLayers.map((layer) => {
          const layerItems = dated.filter((item) => item.layer === layer);
          return <section key={layer} className={`hair-history-event-group hair-history-event-group--${layer.toLowerCase()}`}><header><span className="hair-history-context-icon" aria-hidden="true"/><h3>{pickLocalized(hairHistoryLayerLabel(layer), locale)}</h3><b>{localeNumber(layerItems.length, locale)}</b></header><div>{layerItems.map((item) => <button type="button" key={item.id} className={selectedId === item.id ? "hair-history-event-card hair-history-event-card--selected" : "hair-history-event-card"} onClick={() => selectItem(item, { openEditor: false, openOverview: true })}><span className="hair-history-event-card-marker" aria-hidden="true"/><span><strong>{pickLocalized(item.label, locale)}</strong><small>{formatHistoryDate(item, locale)}{item.source === "PHYSICIAN" ? ` · ${sourceLabel(item.source, locale)}` : ""}</small></span><i aria-hidden="true">›</i></button>)}</div></section>;
        })}</div> : treatmentItems.length === 0 && <div className="hair-history-context-empty"><strong>{isAr ? "لا توجد أحداث ظاهرة" : "No visible events"}</strong><p>{isAr ? "استخدم مرشحات السياق أعلاه لإظهار العناصر المسجلة." : "Use the context filters above to show recorded items."}</p></div>}
      </section>

      {overviewOpen && selectedContextItem && <section className="surface-card hair-history-selected-overview" aria-label={isAr ? "ملخص العنصر المحدد" : "Selected item overview"}>
        <header className="hair-history-selected-overview-header">
          <div><span className="hair-history-overview-category">{itemTypeBadge(selectedContextItem, locale)}</span><h3>{primaryItemLabel(selectedContextItem, locale)}</h3></div>
          <button type="button" className="hair-history-overview-close" aria-label={isAr ? "إغلاق النظرة السريعة" : "Close overview"} onClick={closeOverview}>×</button>
        </header>
        {selectedContextItem.layer === "TREATMENTS" && selectedTreatmentEnd ? <div className="hair-history-selected-overview-body">
          <div className="hair-history-selected-overview-grid">
            <div><span>{isAr ? "تاريخ البداية" : "Start date"}</span><strong>{formatHistoryDate(selectedContextItem, locale)}</strong></div>
            <div><span>{selectedTreatmentEnd.ongoing ? (isAr ? "الحالة" : "Status") : (isAr ? "تاريخ النهاية" : "End date")}</span><strong>{selectedTreatmentEnd.ongoing ? (isAr ? "مستمر" : "Ongoing") : selectedTreatmentEnd.date ? formatDateValue(selectedTreatmentEnd.date, treatmentStopPrecision(selectedContextItem), locale) : (isAr ? "غير مسجلة" : "Not recorded")}</strong></div>
            <div className="hair-history-selected-overview-duration"><span>{isAr ? "المدة" : "Duration"}</span><strong>{treatmentDurationLabel(selectedContextItem, selectedTreatmentEnd.date, selectedTreatmentEnd.ongoing, locale)}</strong></div>
          </div>
          {selectedContextDetail && <div className="hair-history-selected-overview-detail"><span>{isAr ? "تفاصيل ذكرها المراجع" : "Patient-provided detail"}</span><p>{selectedContextDetail}</p></div>}
        </div> : <div className="hair-history-selected-overview-body">
          <div className="hair-history-selected-overview-grid">
            <div><span>{isAr ? "تاريخ الحدث السريري" : "Clinical event date"}</span><strong>{formatHistoryDate(selectedContextItem, locale)}</strong></div>
            <div className="hair-history-selected-overview-clinical"><span>{isAr ? "المعلومة السريرية" : "Clinical record"}</span><strong>{primaryItemLabel(selectedContextItem, locale)}</strong></div>
          </div>
          {selectedContextDetail && <div className="hair-history-selected-overview-detail"><span>{isAr ? "تفاصيل ذكرها المراجع" : "Patient-provided detail"}</span><p>{selectedContextDetail}</p></div>}
        </div>}
        {!readOnly && selectedContextItem.editable && <div className="hair-history-overview-actions"><button type="button" className="button button--primary" onClick={openSelectedEditor}>{selectedContextItem.layer === "TREATMENTS" ? (isAr ? "تعديل العلاج" : "Edit treatment") : (isAr ? "تعديل العنصر" : "Edit item")}</button></div>}
        <details className="hair-history-overview-details"><summary>{isAr ? "عرض التفاصيل" : "Show details"}</summary><dl><div><dt>{isAr ? "المصدر" : "Source"}</dt><dd>{sourceLabel(selectedContextItem.source, locale)}</dd></div><div><dt>{isAr ? "دقة التاريخ" : "Date precision"}</dt><dd>{precisionLabel(selectedContextItem.datePrecision, locale)}</dd></div><div><dt>{isAr ? "المصدر وسجل التعديل" : "Source and change history"}</dt><dd>{provenanceLabel(selectedContextItem, locale)}</dd></div>{selectedContextItem.layer === "TREATMENTS" && selectedTreatmentEnd?.date && <div><dt>{isAr ? "دقة تاريخ النهاية" : "End-date precision"}</dt><dd>{precisionLabel(treatmentStopPrecision(selectedContextItem), locale)}</dd></div>}</dl></details>
      </section>}

      {(approved || (!readOnly && editorOpen && selected && editDraft)) && <section className={`surface-card hair-history-editor-card hair-history-editor-card--${panelMode.toLowerCase()}`} aria-live="polite">
        {approved ? <div className="hair-history-approved-panel">
          {!showReopenForm ? <>
            <div className="hair-history-review-header"><div><p className="eyebrow">{isAr ? "تاريخ شعر معتمد" : "Approved Hair History"}</p><h2>{isAr ? "السجل للقراءة فقط" : "History is read-only"}</h2></div><span className="status-pill status-pill--success">{versionLabel(history.approvedRevision)}</span></div>
            <dl className="hair-history-detail-list hair-history-detail-list--inline">
              <div><dt>{isAr ? "الحالة" : "Status"}</dt><dd>{isAr ? "معتمد" : "Approved"}</dd></div>
              {history.approvedAt && <div><dt>{isAr ? "تاريخ الاعتماد" : "Approved at"}</dt><dd>{formatClinicDate(history.approvedAt, locale)}</dd></div>}
            </dl>
            {canReopen && <div className="hair-history-panel-actions"><button type="button" className="button button--secondary" onClick={() => setShowReopenForm(true)}>{isAr ? "إعادة الفتح" : "Reopen"}</button></div>}
          </> : <>
            <div className="hair-history-review-header"><div><p className="eyebrow">{isAr ? "إعادة فتح السجل" : "Reopen Hair History"}</p><h2>{isAr ? "سبب إعادة الفتح" : "Reason for reopening"}</h2></div></div>
            <label className="hair-history-reopen-field"><span>{isAr ? "السبب" : "Reason"}</span><textarea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder={isAr ? "اكتب سبب إعادة فتح تاريخ الشعر" : "Enter the reason for reopening Hair History"}/></label>
            <div className="hair-history-panel-actions"><button type="button" className="button button--secondary" onClick={() => { setShowReopenForm(false); setReopenReason(""); }}>{isAr ? "إلغاء" : "Cancel"}</button><button type="button" className="button button--primary" disabled={busy || reopenReason.trim().length < 5} onClick={reopen}>{isAr ? "فتح نسخة تعديل" : "Open amendment draft"}</button></div>
          </>}
        </div> : selected && editDraft ? <div className="hair-history-edit-form">
          <div className="hair-history-review-header">
            <div><p className="eyebrow">{panelMode === "SAVED" ? (isAr ? "تم الحفظ" : "Saved") : panelMode === "ERROR" ? (isAr ? "تعذر الحفظ" : "Could not save") : selectedDirty ? (isAr ? "تغيير غير محفوظ" : "Unsaved change") : (isAr ? "العنصر المحدد" : "Selected item")}</p><h2>{pickLocalized(selected.label, locale)}</h2></div>
            <span className="hair-history-selected-source">{selected.source === "PATIENT" ? (isAr ? "المصدر: المراجع" : "Source: Patient") : sourceLabel(selected.source, locale)}</span>
          </div>
          {panelMode === "SAVED" && savedChange && <div className="hair-history-saved-state"><strong>{savedChange.summary}</strong><span>{isAr ? "تم حفظ التعديل" : "Change saved"}</span><small>{formatClinicDate(savedChange.savedAt, locale)}</small></div>}
          <div className="hair-history-review-fields">
            <label className="hair-history-field hair-history-field--precision"><span>{isAr ? "دقة التاريخ" : "Date precision"}</span><select value={editDraft.datePrecision} onChange={(event) => {
              const precision = event.target.value as PhysicianHairHistoryItem["datePrecision"];
              setDraft({ datePrecision: precision, ...(precision === "UNKNOWN" ? { dateInput: "" } : {}) });
            }}><option value="DAY">{isAr ? "يوم محدد" : "Exact day"}</option><option value="MONTH">{isAr ? "شهر وسنة" : "Month + year"}</option><option value="YEAR">{isAr ? "سنة فقط" : "Year only"}</option><option value="UNKNOWN">{isAr ? "غير معروف" : "Unknown"}</option></select></label>
            {editDraft.datePrecision !== "UNKNOWN" && <label className="hair-history-field hair-history-field--date"><span>{isAr ? "تاريخ الحدث السريري" : "Clinical event date"}</span><input dir="ltr" type={editDraft.datePrecision === "DAY" ? "date" : editDraft.datePrecision === "MONTH" ? "month" : "number"} min={editDraft.datePrecision === "YEAR" ? 1900 : undefined} max={editDraft.datePrecision === "DAY" ? history.clinicalReferenceAt.slice(0, 10) : editDraft.datePrecision === "MONTH" ? history.clinicalReferenceAt.slice(0, 7) : new Date(history.clinicalReferenceAt).getUTCFullYear()} value={editDraft.dateInput} onChange={(event) => setDraft({ dateInput: event.target.value, valueOverride: selected.layer === "TREATMENTS" ? shiftIntervalValue(selected, event.target.value) : undefined })}/>{draftDatePreview && <small className="hair-history-date-preview">{isAr ? `تاريخ الحدث: ${draftDatePreview}` : `Event date: ${draftDatePreview}`}</small>}</label>}
            {selectedMetric && <label className="hair-history-field hair-history-field--value"><span>{isAr ? "القيمة" : "Value"}</span><input type="number" min="0" max="5" step="1" value={editDraft.valueInput} onChange={(event) => setDraft({ valueInput: event.target.value })}/></label>}
            <label className="hair-history-field hair-history-field--state hair-history-include-toggle"><span>{isAr ? "الحالة" : "State"}</span><span className="hair-history-segmented"><button type="button" className={editDraft.included ? "is-active" : ""} onClick={() => setDraft({ included: true })}>{isAr ? "تضمين" : "Include"}</button><button type="button" className={!editDraft.included ? "is-active" : ""} onClick={() => setDraft({ included: false })}>{isAr ? "استبعاد" : "Exclude"}</button></span></label>
          </div>
          {message && <p className={panelMode === "ERROR" ? "hair-history-panel-error" : "hair-history-panel-message"}>{message}</p>}
          <div className="hair-history-panel-actions"><button type="button" className="button button--secondary" disabled={busy || !selectedDirty} onClick={cancelEdit}>{isAr ? "إلغاء التغيير" : "Cancel change"}</button><button type="button" className="button button--primary" disabled={busy || !selectedDirty} onClick={saveSelectedEdit}>{busy ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "حفظ التعديل" : "Save change")}</button></div>
        </div> : null}
      </section>}
    </div>

    {undated.length > 0 && <section className="surface-card hair-history-undated-card"><div className="card-heading-row"><div><p className="eyebrow">{isAr ? "التاريخ غير معروف" : "Date unknown"}</p><h2>{isAr ? "عناصر غير مؤرخة" : "Undated items"}</h2></div><span className="status-pill">{localeNumber(undated.length, locale)}</span></div><div className="hair-history-undated-list">{undated.map((item) => <button type="button" key={item.id} className={selectedId === item.id ? "hair-history-undated-item hair-history-undated-item--selected" : "hair-history-undated-item"} onClick={() => selectItem(item, { openEditor: false, openOverview: true })}><strong>{pickLocalized(item.label, locale)}</strong><span>{pickLocalized(hairHistoryLayerLabel(item.layer), locale)} · {sourceLabel(item.source, locale)}</span></button>)}</div></section>}

    {!readOnly && <section className="surface-card hair-history-actions">
      <div><strong>{isAr ? "اعتماد السجل السابق كمرجع تاريخي" : "Approve the prior record as historical reference"}</strong><p>{selectedDirty ? (isAr ? "يوجد تغيير غير محفوظ — احفظه أو ألغِه قبل الاعتماد." : "There is an unsaved change — save or cancel it before approval.") : localStatus === "PATIENT_REPORTED_PREVIEW" ? (isAr ? "احفظ المراجعة أولًا، ثم يصبح الاعتماد إجراءً مستقلاً." : "Save the review first; approval is a separate action.") : (isAr ? "النقاط والأحداث المؤرخة راجعت ولا توجد تعديلات غير محفوظة." : "Dated points and events have been reviewed and there are no unsaved changes.")}</p></div>
      <div><button type="button" className="button button--secondary" disabled={busy || selectedDirty} onClick={saveReviewSnapshot}>{busy ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "حفظ المراجعة" : "Save review")}</button><button type="button" className="button button--primary" disabled={busy || selectedDirty || localStatus === "PATIENT_REPORTED_PREVIEW" || !reviewVisitId} onClick={() => setShowApprovalConfirm(true)}>{isAr ? "اعتماد تاريخ الشعر" : "Approve Hair History"}</button></div>
    </section>}
    {message && panelMode !== "ERROR" && <p className="hair-history-message" role="status">{message}</p>}

    {showApprovalConfirm && <div className="hair-history-modal-backdrop" role="presentation"><section className="hair-history-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="hair-history-approve-title"><p className="eyebrow">{isAr ? "اعتماد تاريخ الشعر" : "Approve Hair History"}</p><h2 id="hair-history-approve-title">{isAr ? "اعتماد السجل السابق كمرجع تاريخي" : "Approve the prior record as historical reference"}</h2><ul><li>{isAr ? "راجعت النقاط والأحداث المؤرخة" : "Dated points and events reviewed"}<span>✓</span></li><li>{isAr ? "لا توجد تعديلات غير محفوظة" : "No unsaved changes"}<span>✓</span></li></ul><p>{isAr ? "هذا الاعتماد لا يعتمد الزيارة الأولى ولا يكمل مراجعة الحالة." : "This approval does not approve the first physician visit or complete the case review."}</p><div className="hair-history-panel-actions"><button type="button" className="button button--secondary" disabled={busy} onClick={() => setShowApprovalConfirm(false)}>{isAr ? "إلغاء" : "Cancel"}</button><button type="button" className="button button--primary" disabled={busy} onClick={approveHistory}>{isAr ? "تأكيد الاعتماد" : "Confirm approval"}</button></div></section></div>}
  </div></div>;
}
