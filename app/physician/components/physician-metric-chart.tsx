"use client";

import { formatClinicDate } from "@/lib/platform/date-time";
import { localeNumber } from "@/lib/p01/locale";
import { pickLocalized } from "@/lib/physician/presentation";
import type { PhysicianMeasurementSeries } from "@/lib/physician/types";
import { measurementTimeLayout } from "@/lib/physician/measurement-chart-layout";
import styles from "./physician-metric-chart.module.css";

const SERIES_CLASS: Record<string, string> = {
  SHEDDING: "metric-series--shedding",
  DENSITY: "metric-series--density",
  ITCH: "metric-series--itch",
  BURNING: "metric-series--burning",
  SCALP_PAIN: "metric-series--pain",
};

export function PhysicianMetricChart({
  series,
  locale,
}: {
  series: PhysicianMeasurementSeries[];
  locale: "ar" | "en";
}) {
  const allDates = series.flatMap((item) => item.points.map((point) => new Date(point.date).getTime())).filter(Number.isFinite);
  if (allDates.length === 0) {
    return <div className={styles.scope}><div className="physician-chart-empty">{locale === "ar" ? "لا توجد قياسات مسجلة بعد." : "No measurements recorded yet."}</div></div>;
  }

  const width = 920;
  const height = 300;
  const left = 54;
  const right = 24;
  const top = 24;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const { x, ticks: axisDates } = measurementTimeLayout(series.flatMap((item) => item.points.map((point) => point.date)), left, plotWidth);
  const y = (value: number) => top + ((5 - value) / 5) * plotHeight;

  return (
    <div className={styles.scope}>
      <div className="physician-chart-wrap">
      <div className="physician-chart-legend">
        {series.map((item) => (
          <span key={item.code} className={SERIES_CLASS[item.code] ?? "metric-series--other"}>
            <i aria-hidden="true" />{pickLocalized(item.label, locale)}
          </span>
        ))}
      </div>
      <div className="physician-chart-scroll">
        <svg className="physician-metric-chart" viewBox={`0 0 ${width} ${height}`} role="img" direction="ltr" aria-label={locale === "ar" ? "الرسم الزمني لمقاييس الشعر وفروة الرأس" : "Hair and scalp measurement timeline"}>
          {[0, 1, 2, 3, 4, 5].map((value) => (
            <g key={value}>
              <line className="metric-grid-line" x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
              <text className="metric-axis-label" x={left - 18} y={y(value) + 4} textAnchor="middle">{localeNumber(value, locale)}</text>
            </g>
          ))}
          {axisDates.map((time, index) => {
            return (
              <g key={time}>
                <line className="metric-grid-line metric-grid-line--vertical" x1={x(time)} x2={x(time)} y1={top} y2={height - bottom} />
                <text className="metric-date-label" x={x(time)} y={height - 15} textAnchor={axisDates.length === 1 ? "middle" : index === 0 ? "start" : index === axisDates.length - 1 ? "end" : "middle"}>{formatClinicDate(new Date(time).toISOString(), locale)}</text>
              </g>
            );
          })}
          {series.map((item) => {
            const points = item.points.map((point) => ({ ...point, x: x(new Date(point.date).getTime()), y: y(point.value) }));
            const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
            const className = SERIES_CLASS[item.code] ?? "metric-series--other";
            return (
              <g key={item.code} className={className}>
                {points.length > 1 && <path className="metric-series-line" d={path} fill="none" />}
                {points.map((point) => (
                  <g key={`${item.code}:${point.date}:${point.visitId}`}>
                    <circle className="metric-series-point" cx={point.x} cy={point.y} r="5" />
                    <title>{`${pickLocalized(item.label, locale)}: ${point.value}/5 — ${formatClinicDate(point.date, locale)}`}</title>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      </div>
    </div>
  );
}
