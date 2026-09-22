import { Suspense } from "react";

import { PatientJourney } from "@/app/patient/patient-journey";
import styles from "./patient-journey.module.css";

export default function PatientPage() {
  return (
    <div className={styles.scope}>
      <Suspense fallback={<div className="patient-loading">Loading…</div>}>
        <PatientJourney />
      </Suspense>
    </div>
  );
}
