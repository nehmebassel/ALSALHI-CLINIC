"use client";

import { PhysicianMetricChart } from "@/app/physician/components/physician-metric-chart";
import { formatClinicDate, formatClinicDateTime } from "@/lib/platform/date-time";
import { localeNumber } from "@/lib/p01/locale";
import { pickLocalized } from "@/lib/physician/presentation";
import type { PhysicianHairJourneyEpisode } from "@/lib/physician/types";
import { trichoscopyLabel } from "@/lib/physician/trichoscopy-presentation";
import styles from "./physician-hair-journey.module.css";

const EVENT_TYPE_LABELS = {
  MEDICATION: { ar: "قرار علاجي", en: "Treatment decision" },
  PROCEDURE: { ar: "قرار إجراء", en: "Procedure decision" },
  LAB: { ar: "فحص / تحليل", en: "Test / lab" },
  DIAGNOSIS: { ar: "قرار تشخيص", en: "Diagnosis decision" },
  TRIGGER: { ar: "حدث محفز", en: "Trigger event" },
  OTHER: { ar: "حدث سريري", en: "Clinical event" },
} as const;


const PROCEDURE_LABELS: Record<string, { ar: string; en: string }> = {
  PRP: { ar: "البلازما الغنية بالصفائح الدموية", en: "PRP / Platelet-Rich Plasma" },
  MICRONEEDLING: { ar: "المايكرونيدلينغ", en: "Microneedling" },
  HAIR_LASER: { ar: "ليزر تحفيز الشعر", en: "Hair Stimulation Laser" },
  RED_LIGHT: { ar: "العلاج بالضوء الأحمر", en: "Red Light Therapy" },
  MINOXIDIL_INJ: { ar: "حقن المينوكسيديل", en: "Minoxidil Injections" },
  DUTASTERIDE_INJ: { ar: "حقن الدوتاستيرايد", en: "Dutasteride Injections" },
  EXOSOME: { ar: "علاج الإكسوزوم", en: "Exosome Therapy" },
  CORTISONE_INJ: { ar: "حقن الكورتيزون", en: "Corticosteroid Injections" },
  REGENERA: { ar: "ريجينيرا / ريجينيرا أكتيفا", en: "Regenera / Regenera Activa" },
  ACELL: { ar: "إي سيل", en: "ACell" },
  HAIR_TRANSPLANT: { ar: "زراعة الشعر", en: "Hair Transplantation" },
  OTHER: { ar: "إجراء آخر", en: "Other procedure" },
};

function journeyProcedureLabel(
  value: { procedureCode: string; otherProcedureText?: string },
  locale: "ar" | "en",
): string {
  if (value.procedureCode === "OTHER" && value.otherProcedureText?.trim()) return value.otherProcedureText.trim();
  return PROCEDURE_LABELS[value.procedureCode]?.[locale] ?? (locale === "ar" ? "إجراء مسجل" : "Recorded procedure");
}

export function PhysicianHairJourney({
  episodes,
  locale,
  onOpenVisit,
}: {
  episodes: PhysicianHairJourneyEpisode[];
  locale: "ar" | "en";
  onOpenVisit: (visitId: string) => void;
}) {
  const isAr = locale === "ar";
  if (episodes.length === 0) {
    return (
      <section className={`surface-card ${styles.scope}`}>
        <p className="eyebrow">{isAr ? "مسار الشعر الطبي" : "Physician Hair Journey"}</p>
        <h2>{isAr ? "لم يبدأ المسار الطبي بعد" : "The medical journey has not started yet"}</h2>
        <p className="muted">
          {isAr
            ? "سيظهر المسار الطبي بعد أن يعتمد الطبيب الزيارة الأولى."
            : "The medical journey will appear after the physician finalizes the first Visit."}
        </p>
      </section>
    );
  }

  return (
    <div className={styles.scope}>
      {episodes.map((episode) => (
        <section className="surface-card" key={episode.episodeId}>
          <div className={styles.episodeHeader}>
            <div>
              <p className="eyebrow">{isAr ? "حلقة سريرية" : "Clinical episode"}</p>
              <h2>{pickLocalized(episode.primary, locale)}</h2>
              <p className="muted">
                {isAr
                  ? "راجع تغيرات حالة الشعر التي وثقها الطبيب عبر الزيارات المكتملة."
                  : "Review physician-recorded hair changes across completed visits."}
              </p>
            </div>
            <span className="status-pill">
              {episode.status === "ACTIVE"
                ? (isAr ? "نشطة" : "Active")
                : (isAr ? "مغلقة" : "Closed")}
            </span>
          </div>

          <div className={styles.sectionBlock}>
            <div className={styles.sectionHeading}>
              <div>
                
                <h3>{isAr ? "الحالة الطبية الحالية" : "Current physician state"}</h3>
              </div>
              <span className={styles.readOnlyBadge}>{isAr ? "تاريخ سريري معتمد" : "Finalized clinical history"}</span>
            </div>
            <div className={styles.stateGrid}>
              <article className={styles.stateCard}>
                <h4>{isAr ? "التشخيصات النشطة" : "Active diagnoses"}</h4>
                {episode.effectiveState.diagnoses.filter((item) => item.status === "ACTIVE").length === 0 ? (
                  <p className="muted">{isAr ? "لا يوجد تشخيص نشط مسجل." : "No active diagnosis recorded."}</p>
                ) : (
                  <ul>{episode.effectiveState.diagnoses.filter((item) => item.status === "ACTIVE").map((item) => <li key={item.diagnosisId}>{item.text}</li>)}</ul>
                )}
              </article>
              <article className={styles.stateCard}>
                <h4>{isAr ? "العلاجات النشطة" : "Active treatments"}</h4>
                {episode.effectiveState.treatmentCourses.filter((item) => item.status === "ACTIVE").length === 0 ? (
                  <p className="muted">{isAr ? "لا يوجد علاج طبيب نشط مسجل." : "No active treatment recorded."}</p>
                ) : (
                  <ul>{episode.effectiveState.treatmentCourses.filter((item) => item.status === "ACTIVE").map((item) => <li key={item.treatmentCourseId}><strong>{item.name}</strong>{item.regimenText ? <span>{item.regimenText}</span> : null}</li>)}</ul>
                )}
              </article>
              <article className={styles.stateCard}>
                <h4>{isAr ? "خطط الإجراءات المفتوحة" : "Open procedure plans"}</h4>
                {episode.effectiveState.procedurePlans.filter((item) => item.status === "OPEN").length === 0 ? (
                  <p className="muted">{isAr ? "لا توجد خطة إجراء مفتوحة." : "No open procedure plan."}</p>
                ) : (
                  <ul>{episode.effectiveState.procedurePlans.filter((item) => item.status === "OPEN").map((item) => <li key={item.procedurePlanId}><strong>{journeyProcedureLabel(item, locale)}</strong>{item.plannedDate ? <span>{isAr ? `مخطط: ${formatClinicDate(item.plannedDate, locale)}` : `Planned: ${formatClinicDate(item.plannedDate, locale)}`}</span> : null}</li>)}</ul>
                )}
              </article>
            </div>
          </div>

          <div className={styles.sectionBlock}>
            <div className={styles.sectionHeading}>
              <div>
                <p className="eyebrow">{isAr ? "القياسات" : "Measurements"}</p>
                <h3>{isAr ? "قياسات الطبيب عبر الزيارات" : "Physician measurements over time"}</h3>
              </div>
              <span className={styles.readOnlyBadge}>{isAr ? "للقراءة فقط" : "Read only"}</span>
            </div>
            <PhysicianMetricChart series={episode.measurementSeries} locale={locale} />
          </div>

          <div className={styles.sectionBlock}>
            <div className={styles.sectionHeading}>
              <div>
                <p className="eyebrow">{isAr ? "القرارات" : "Decisions"}</p>
                <h3>{isAr ? "الخط الزمني لقرارات الطبيب" : "Physician decision timeline"}</h3>
              </div>
            </div>
            {episode.timeline.length === 0 ? (
              <p className="muted">{isAr ? "لا توجد قرارات طبيب معتمدة في هذه الحلقة بعد." : "No finalized physician decisions in this episode yet."}</p>
            ) : (
              <div className={styles.timeline}>
                {episode.timeline.map((event) => (
                  <article className={styles.timelineItem} key={event.id}>
                    <time>{event.date ? formatClinicDateTime(event.date, locale) : (isAr ? "دون تاريخ" : "Undated")}</time>
                    <div>
                      <span className={styles.eventKind}>{pickLocalized(EVENT_TYPE_LABELS[event.type], locale)}</span>
                      <strong>{event.title ? pickLocalized(event.title, locale) : (isAr ? "قرار طبي" : "Physician decision")}</strong>
                      {event.description && <p>{pickLocalized(event.description, locale)}</p>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className={styles.sectionBlock}>
            <div className={styles.sectionHeading}>
              <div>
                <p className="eyebrow">{isAr ? "الزيارات" : "Visits"}</p>
                <h3>{isAr ? "الزيارات المعتمدة" : "Finalized Visits"}</h3>
              </div>
              <span className={styles.visitCount}>{localeNumber(episode.visits.length, locale)}</span>
            </div>
            <div className={styles.visitGrid}>
              {episode.visits.map((visit, index) => (
                <article className={styles.visitCard} key={visit.visitId}>
                  <div className={styles.visitCardHeader}>
                    <div>
                      <small>{isAr ? `زيارة ${localeNumber(index + 1, locale)}` : `Visit ${index + 1}`}</small>
                      <strong>{formatClinicDate(visit.visitOccurredAt, locale)}</strong>
                    </div>
                    <span>{visit.visitType === "FOLLOW_UP" ? (isAr ? "متابعة" : "Follow-up") : (isAr ? "أولية" : "Initial")}</span>
                  </div>

                  {visit.pattern && (
                    <div className={styles.referenceGroup}>
                      <h4>{isAr ? "تقييم النمط" : "Pattern Assessment"}</h4>
                      <dl>
                        {visit.pattern.sinclair !== undefined && <><dt>{isAr ? "سنكلير" : "Sinclair"}</dt><dd>{localeNumber(visit.pattern.sinclair, locale)}</dd></>}
                        {visit.pattern.mcuFvCode && <><dt>MCU/FV</dt><dd dir="ltr">{visit.pattern.mcuFvCode}</dd></>}
                        {visit.pattern.hairLineMidlineCm !== undefined && <><dt>{isAr ? "خط الشعر — المنتصف" : "Hair line — Midline"}</dt><dd>{localeNumber(visit.pattern.hairLineMidlineCm, locale)} {isAr ? "سم" : "cm"}</dd></>}
                        {visit.pattern.hairLineRightSideCm !== undefined && <><dt>{isAr ? "خط الشعر — اليمين" : "Hair line — Right"}</dt><dd>{localeNumber(visit.pattern.hairLineRightSideCm, locale)} {isAr ? "سم" : "cm"}</dd></>}
                        {visit.pattern.hairLineLeftSideCm !== undefined && <><dt>{isAr ? "خط الشعر — اليسار" : "Hair line — Left"}</dt><dd>{localeNumber(visit.pattern.hairLineLeftSideCm, locale)} {isAr ? "سم" : "cm"}</dd></>}
                      </dl>
                    </div>
                  )}

                  {visit.trichoscopy && (
                    <div className={styles.referenceGroup}>
                      <h4>{isAr ? "منظار الشعر" : "Trichoscopy"}</h4>
                      <div className={styles.chips}>
                        {visit.trichoscopy.findingLabels.map((label, findingIndex) => <span key={`${visit.visitId}:tricho:${findingIndex}`}>{trichoscopyLabel(label, locale)}</span>)}
                      </div>
                      {visit.trichoscopy.otherFindingText && <p dir="auto">{visit.trichoscopy.otherFindingText}</p>}
                    </div>
                  )}

                  {visit.anatomicalMap && (
                    <div className={styles.referenceGroup}>
                      <h4>{isAr ? "الخريطة التشريحية" : "Anatomical Map"}</h4>
                      <div className={styles.chips}>
                        {visit.anatomicalMap.regions.map((region, regionIndex) => (
                          <span key={`${visit.visitId}:${region.view}:${regionIndex}`}>{pickLocalized(region.label, locale)}{region.noteText ? ` — ${region.noteText}` : ""}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {!visit.pattern && !visit.trichoscopy && !visit.anatomicalMap && (
                    <p className="muted">{isAr ? "لا توجد مراجع فحص إضافية مسجلة في هذه الزيارة." : "No additional examination references were recorded in this Visit."}</p>
                  )}

                  <button type="button" className="button button--secondary" onClick={() => onOpenVisit(visit.visitId)}>
                    {isAr ? "فتح الزيارة المعتمدة" : "Open finalized Visit"}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
