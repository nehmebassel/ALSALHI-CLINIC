"use client";

import styles from "./hospital-summary.module.css";

export function PrintHospitalSummaryButton() {
  return (
    <button
      type="button"
      className={styles.printButton}
      onClick={() => window.print()}
    >
      Print / Save as PDF
    </button>
  );
}
