import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintHospitalSummaryButton } from "./print-button";
import styles from "./hospital-summary.module.css";
import { requirePageActor } from "@/lib/auth/page-session";
import { loadHospitalVisitSummary } from "@/lib/physician/hospital-summary";
import { PhysicianVisitLifecycleError } from "@/lib/physician/visit-lifecycle-contracts";
import { formatClinicDate, formatClinicDateTime } from "@/lib/platform/date-time";
import { getPrismaClient } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Hospital Visit Summary | AlSalhi Clinical Platform",
};

function DetailList({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <dl className={styles.detailList}>
      {items.map((item, index) => (
        <div key={`${item.label}:${index}`}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DecisionSection({
  title,
  items,
}: {
  title: string;
  items: Array<{
    status: string;
    title: string;
    details: Array<{ label: string; value: string }>;
  }>;
}) {
  if (items.length === 0) return null;
  return (
    <section className={styles.clinicalSection}>
      <h2>{title}</h2>
      <div className={styles.decisionList}>
        {items.map((item, index) => (
          <article key={`${item.status}:${index}`}>
            <div className={styles.decisionHeading}>
              <strong>{item.title}</strong>
              <span>{item.status}</span>
            </div>
            {item.details.length > 0 && <DetailList items={item.details} />}
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function HospitalSummaryPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const actor = await requirePageActor("PHYSICIAN");
  const { visitId } = await params;
  let summary;
  try {
    summary = await loadHospitalVisitSummary(
      getPrismaClient(),
      actor,
      visitId,
    );
  } catch (error) {
    if (error instanceof PhysicianVisitLifecycleError) notFound();
    throw error;
  }
  if (!summary) notFound();

  const patientRows = [
    { label: "Patient Name", value: summary.patient.name },
    ...(summary.patient.mrn
      ? [{ label: "MRN", value: summary.patient.mrn }]
      : []),
    {
      label: "Date of Birth",
      value: formatClinicDate(summary.patient.dateOfBirth, "en"),
    },
    { label: "Age", value: String(summary.patient.age) },
    { label: "Sex", value: summary.patient.sex },
  ];
  const visitRows = [
    {
      label: "Visit Date / Time",
      value: formatClinicDateTime(summary.visit.occurredAt, "en"),
    },
    ...(summary.visit.physician
      ? [{ label: "Physician", value: summary.visit.physician }]
      : []),
    ...(summary.visit.service
      ? [{ label: "Service", value: summary.visit.service }]
      : []),
    { label: "Visit ID", value: summary.visit.id },
  ];

  return (
    <main className={styles.page} lang="en" dir="ltr">
      <div className={styles.toolbar} aria-label="Hospital summary actions">
        <Link href={`/physician/patients/${summary.patient.id}`}>Back to patient record</Link>
        <PrintHospitalSummaryButton />
      </div>
      <article className={styles.document} aria-labelledby="hospital-summary-title">
        <header className={styles.documentHeader}>
          <p>AlSalhi Clinical Platform</p>
          <h1 id="hospital-summary-title">Hospital Visit Summary</h1>
        </header>

        <section className={styles.identificationGrid}>
          <div>
            <h2>Patient Identification</h2>
            <DetailList items={patientRows} />
          </div>
          <div>
            <h2>Visit Information</h2>
            <DetailList items={visitRows} />
          </div>
        </section>

        <DecisionSection title="Final Diagnosis" items={summary.diagnoses} />
        <DecisionSection title="Treatment Plan" items={summary.treatments} />
        <DecisionSection title="Procedures" items={summary.procedures} />

        {summary.clinicalFindings.length > 0 && (
          <section className={styles.clinicalSection}>
            <h2>Relevant Clinical Findings</h2>
            <DetailList items={summary.clinicalFindings} />
          </section>
        )}
        {summary.trichoscopyFindings.length > 0 && (
          <section className={styles.clinicalSection}>
            <h2>Trichoscopy Findings</h2>
            <ul className={styles.findingList}>
              {summary.trichoscopyFindings.map((finding, index) => (
                <li key={index}>{finding}</li>
              ))}
            </ul>
          </section>
        )}
        {summary.measurements.length > 0 && (
          <section className={styles.clinicalSection}>
            <h2>Relevant Measurements</h2>
            <DetailList items={summary.measurements} />
          </section>
        )}
      </article>
    </main>
  );
}
