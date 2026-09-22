"use client";

import Link from "next/link";

import { usePlatformLocale } from "@/app/components/platform/platform-locale";
import workspaceStyles from "./physician-patient-workspace.module.css";

export default function PhysicianPatientRecordError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale, dir } = usePlatformLocale();
  const isAr = locale === "ar";

  return (
    <div className={workspaceStyles.scope}>
      <main className="workspace-main physician-record" dir={dir}>
        <section className="surface-card physician-record-error" role="alert">
          <p className="eyebrow">{isAr ? "السجل السريري" : "Clinical record"}</p>
          <h1>{isAr ? "تعذر فتح سجل المراجع" : "The patient record could not be opened"}</h1>
          <p>{isAr ? "لم يتم تغيير أي بيانات. حاول إعادة تحميل السجل، أو ارجع إلى قائمة المراجعين." : "No data was changed. Retry loading the record, or return to the patient queue."}</p>
          <div>
            <button type="button" className="button button--primary" onClick={reset}>{isAr ? "إعادة المحاولة" : "Retry"}</button>
            <Link className="button button--secondary" href="/physician">{isAr ? "العودة لقائمة المراجعين" : "Back to patient queue"}</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
