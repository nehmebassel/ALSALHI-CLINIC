"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { usePlatformLocale } from "@/app/components/platform/platform-locale";
import { formatClinicDateTime } from "@/lib/platform/date-time";
import { localeNumber } from "@/lib/p01/locale";
import { ageAt, pickLocalized } from "@/lib/physician/presentation";
import type { PhysicianQueuePatient, PhysicianQueueSummary } from "@/lib/physician/types";
import styles from "./physician-dashboard.module.css";

type QueueFilter = "INITIAL" | "FOLLOW_UP" | "ALL";

export function PhysicianDashboard({
  queue,
  summary,
}: {
  queue: PhysicianQueuePatient[];
  summary: PhysicianQueueSummary;
}) {
  const { locale, dir } = usePlatformLocale();
  const isAr = locale === "ar";
  const [filter, setFilter] = useState<QueueFilter>("INITIAL");
  const [query, setQuery] = useState("");

  const visibleQueue = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return queue.filter((item) => {
      if (filter === "INITIAL" && item.latestVisitType !== "INITIAL") return false;
      if (filter === "FOLLOW_UP" && item.latestVisitType !== "FOLLOW_UP") return false;
      if (!normalized) return true;
      const haystack = [
        item.name,
        item.mrn,
        item.latestDiagnosis?.ar,
        item.latestDiagnosis?.en,
        ...item.episodes.flatMap((episode) => [episode.primary.ar, episode.primary.en]),
      ].filter(Boolean).join(" ").toLocaleLowerCase();
      return haystack.includes(normalized);
    });
  }, [filter, query, queue]);

  return (
    <div className={styles.scope}>
      <main className="workspace-main physician-dashboard physician-dashboard--v2" dir={dir}>
      <section className="physician-hero physician-hero--focused">
        <div>
          <p className="eyebrow">{isAr ? "مساحة الطبيب" : "Physician workspace"}</p>
          <h1>{isAr ? "مساحة العمل السريرية" : "Clinical workspace"}</h1>
          <p>
            {isAr
              ? "راجع معلومات المراجعين وتابع زياراتهم."
              : "Review patient information and continue their visits."}
          </p>
        </div>
      </section>

      <section className="physician-stat-grid" aria-label={isAr ? "ملخص القائمة" : "Queue summary"}>
        <article className="physician-kpi physician-kpi--attention">
          <span>{isAr ? "بانتظار المراجعة" : "Awaiting review"}</span>
          <strong>{localeNumber(summary.pendingInterviews, locale)}</strong>
        </article>
        <article className="physician-kpi">
          <span>{isAr ? "مراجعون" : "Patients"}</span>
          <strong>{localeNumber(summary.patients, locale)}</strong>
        </article>
        <article className="physician-kpi">
          <span>{isAr ? "متابعات حالية" : "Follow-ups"}</span>
          <strong>{localeNumber(summary.followUpsPending, locale)}</strong>
        </article>
        <article className="physician-kpi">
          <span>{isAr ? "مشكلات نشطة" : "Active episodes"}</span>
          <strong>{localeNumber(summary.activeEpisodes, locale)}</strong>
        </article>
      </section>

      <section className="surface-card physician-queue-card physician-queue-card--v2">
        <div className="physician-queue-toolbar">
          <div>
            <p className="eyebrow">{isAr ? "قائمة المراجعين" : "Patient queue"}</p>
            <h2>{isAr ? "الحالات السريرية" : "Clinical cases"}</h2>
          </div>
          <div className="physician-queue-controls">
            <label className="physician-search">
              <span className="sr-only">{isAr ? "البحث في المراجعين" : "Search patients"}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={isAr ? "ابحث بالاسم أو MRN أو التشخيص" : "Search name, MRN, or diagnosis"}
              />
            </label>
            <div className="physician-segmented" role="group" aria-label={isAr ? "تصفية القائمة" : "Queue filter"}>
              {([
                ["INITIAL", isAr ? "زيارة أولية" : "Initial visit"],
                ["FOLLOW_UP", isAr ? "متابعة" : "Follow-up"],
                ["ALL", isAr ? "الكل" : "All"],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {visibleQueue.length === 0 ? (
          <div className="empty-state physician-empty physician-empty--compact">
            <span>✓</span>
            <h2>{isAr ? "لا توجد حالات مطابقة" : "No matching cases"}</h2>
            <p>{isAr ? "جرّب تغيير البحث أو الفلتر." : "Try changing the search or filter."}</p>
          </div>
        ) : (
          <div className="physician-queue physician-queue--v2">
            {visibleQueue.map((item) => {
              const latestEpisode = item.episodes[0];
              const age = ageAt(item.dateOfBirth, item.latestAt);
              return (
                <article className="physician-case-row" key={item.patientId}>
                  <div className="patient-avatar patient-avatar--large" aria-hidden="true">{item.name.trim().slice(0, 1) || "P"}</div>
                  <div className="physician-case-main">
                    <div className="physician-case-title">
                      <div>
                        <strong>{item.name}</strong>
                        <span className="physician-case-demographics">
                          {isAr
                            ? `${item.gender === "MALE" ? "ذكر" : "أنثى"} · ${localeNumber(age, locale)} سنة`
                            : `${item.gender === "MALE" ? "Male" : "Female"} · ${age} years`}
                        </span>
                      </div>
                      <div className="physician-case-signals">
                        <span className={item.latestVisitType === "FOLLOW_UP" ? "physician-visit-type physician-visit-type--follow-up" : "physician-visit-type"}>
                          {item.latestVisitType === "FOLLOW_UP" ? (isAr ? "متابعة" : "Follow-up") : (isAr ? "زيارة أولية" : "Initial visit")}
                        </span>
                        {item.pendingCount > 0 ? (
                          <span className="status-pill status-pill--warning">
                            {isAr ? `${localeNumber(item.pendingCount, locale)} للمراجعة` : `${item.pendingCount} to review`}
                          </span>
                        ) : item.latestHairHistoryApproved ? (
                          <span className="status-pill status-pill--success">{isAr ? "تاريخ المراجع معتمد" : "Patient Hair History approved"}</span>
                        ) : (
                          <span className="status-pill status-pill--success">{isAr ? "مراجع" : "Reviewed"}</span>
                        )}
                      </div>
                    </div>

                    <div className="physician-case-meta">
                      <span dir="ltr">MRN {item.mrn}</span>
                      <span>{isAr ? "آخر زيارة" : "Last visit"}: {formatClinicDateTime(item.latestAt, locale)}</span>
                    </div>

                    <div className="physician-case-clinical">
                      {latestEpisode && <div>
                        <small>{isAr ? "المشكلة الحالية" : "Current episode"}</small>
                        <b>{pickLocalized(latestEpisode.primary, locale)}</b>
                      </div>}
                      {item.latestDiagnosis && <div>
                        <small>{isAr ? "آخر تشخيص مسجل" : "Latest recorded diagnosis"}</small>
                        <b>{pickLocalized(item.latestDiagnosis, locale)}</b>
                      </div>}
                    </div>
                  </div>
                  <div className="physician-case-action">
                    <Link className="button button--primary" href={`/physician/patients/${item.patientId}`}>
                      {isAr ? "فتح السجل" : "Open record"}
                    </Link>
                    <small>{isAr ? `${localeNumber(item.totalVisits, locale)} زيارة · ${localeNumber(item.activeEpisodeCount, locale)} نشطة` : `${item.totalVisits} visits · ${item.activeEpisodeCount} active`}</small>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      </main>
    </div>
  );
}
