"use client";

import { useState } from "react";
import styles from "./staff-workspace.module.css";
import { usePlatformLocale } from "@/app/components/platform/platform-locale";
import Image from "next/image";
import QRCode from "qrcode";

interface CreatedFlow {
  invitationId: string;
  sessionId: string;
  draftId: string;
  sessionToken: string;
  expiresAt: string;
  warningAt: string;
  lockAt: string;
  status: "DRAFT";
  matchedExistingPatient: boolean;
}

export function StaffWorkspace() {
  const { locale, dir } = usePlatformLocale();
  const isAr = locale === "ar";
  const t = (ar: string, en: string) => isAr ? ar : en;
  const [clinicMrn, setClinicMrn] = useState("");
  const [flow, setFlow] = useState<CreatedFlow | null>(null);
  const [patientLink, setPatientLink] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [patientBaseUrl, setPatientBaseUrl] = useState(process.env.NEXT_PUBLIC_P01_PATIENT_BASE_URL?.trim() ?? "");

  const localOnlyPatientUrl = patientBaseUrl.includes("localhost") || patientBaseUrl.includes("127.0.0.1");

  async function startSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFlow(null);
    setPatientLink("");
    setQrDataUrl("");
    try {
      const cleanBaseUrl = (patientBaseUrl.trim() || window.location.origin).replace(/\/$/, "");
      let parsedBaseUrl: URL;
      try {
        parsedBaseUrl = new URL(cleanBaseUrl);
        if (!["http:", "https:"].includes(parsedBaseUrl.protocol)) throw new Error();
      } catch {
        setMessage(t("تحقق من عنوان فتح الرابط على جهاز المراجع.", "Check the address used to open the link on the patient's device."));
        return;
      }
      const response = await fetch("/api/interview-invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clinicMrn }),
      });
      const payload = (await response.json()) as CreatedFlow & {
        error?: { message?: string };
      };
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          window.location.assign("/login");
          return;
        }
        throw new Error(t("تعذر إنشاء الجلسة.", "Unable to create the session."));
      }

      const link = `${parsedBaseUrl.origin}/patient?token=${encodeURIComponent(payload.sessionToken)}`;
      setFlow(payload);
      setPatientLink(link);
      setQrDataUrl(await QRCode.toDataURL(link, { width: 260, margin: 2 }));
    } catch {
      setMessage(t("تعذر إكمال الطلب. تحقق من الاتصال وحاول مرة أخرى.", "Unable to complete the request. Check the connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
    await navigator.clipboard.writeText(patientLink);
    setMessage(t("تم نسخ الرابط المؤقت.", "Temporary link copied."));
    } catch {
      setMessage(t("تعذر النسخ التلقائي. يمكنك تحديد الرابط ونسخه.", "Unable to copy automatically. Select and copy the link."));
    }
  }

  async function reactivate() {
    if (!flow) return;
    setBusy(true);
    try {
    const response = await fetch("/api/staff/session-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: flow.sessionId, action: "REACTIVATE" }),
    });
    await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      window.location.assign("/login");
      return;
    }
    setMessage(
      response.ok
        ? t("تمت إعادة تفعيل الجلسة.", "Session reactivated.")
        : t("تعذرت إعادة التفعيل.", "Unable to reactivate the session."),
    );
    } catch {
      setMessage(t("تعذرت إعادة التفعيل. تحقق من الاتصال وحاول مرة أخرى.", "Unable to reactivate. Check the connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.scope}>
      <main className="workspace-main" dir={dir}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("التمريض / الموظفون", "Nurse / Staff")}</p>
          <h1>{t("بدء جلسة مراجع", "Start patient session")}</h1>
          <p className="muted">{t("أدخل رقم الملف، ثم شارك الرابط أو رمز QR مع المراجع.", "Enter the medical record number, then share the link or QR code with the patient.")}</p>
        </div>
        <span className="status-pill status-pill--success">{t("جهاز محلي معتمد", "Approved local device")}</span>
      </div>
      <div className="staff-grid">
      <section className="surface-card">
        <form className="stack-form" onSubmit={startSession}>
          <label htmlFor="clinic-mrn">{t("رقم الملف الطبي", "Medical record number")}</label>
          <input
            id="clinic-mrn"
            value={clinicMrn}
            onChange={(event) => setClinicMrn(event.target.value)}
            dir="ltr"
            autoComplete="off"
            required
          />
          <details className="staff-dev-url">
            <summary>{t("فتح الرابط على جهاز آخر", "Open the link on another device")}</summary>
            <label htmlFor="patient-base-url">{t("عنوان العيادة على الشبكة", "Clinic network address")}</label>
            <input
              id="patient-base-url"
              dir="ltr"
              value={patientBaseUrl}
              onChange={(event) => setPatientBaseUrl(event.target.value)}
              placeholder="https://"
              autoComplete="off"
            />
            <small>{t("اختياري. استخدم العنوان الذي زوّدك به مسؤول العيادة، أو اتركه فارغًا لاستخدام العنوان الحالي.", "Optional. Use the address provided by the clinic administrator, or leave blank to use the current address.")}</small>
            {localOnlyPatientUrl && <div className="dev-url-warning">{t("هذا العنوان يعمل على هذا الجهاز فقط.", "This address works on this device only.")}</div>}
          </details>
          <button className="button button--primary" disabled={busy} type="submit">
            {busy ? t("جارٍ الإنشاء…", "Creating…") : t("تحقق وأنشئ الجلسة", "Validate and create session")}
          </button>
        </form>
        {message && <div className="inline-message" role="status">{message}</div>}
      </section>

      <section className="surface-card handoff-card">
        {!flow ? (
          <div className="empty-state">
            <span>QR</span>
            <h2>{t("الرابط المؤقت سيظهر هنا", "Temporary link will appear here")}</h2>
            <p>{t("أنشئ الجلسة ليبدأ المراجع تعبئة معلوماته.", "Create a session so the patient can complete their information.")}</p>
          </div>
        ) : (
          <>
            <div className="card-heading-row">
              <div>
                <h2>{t("الرابط جاهز للمراجع", "Patient link is ready")}</h2>
              </div>
              <span className="status-pill status-pill--success">{t("نشطة", "ACTIVE")}</span>
            </div>
            <div className="identity-result">
              {flow.matchedExistingPatient ? t("مراجع سابق", "Returning patient") : t("مراجع جديد", "New patient")}
            </div>
            {qrDataUrl && (
              <Image
                className="qr-image"
                src={qrDataUrl}
                alt={t("رمز فتح جلسة المراجع", "Patient session QR code")}
                width={260}
                height={260}
                unoptimized
              />
            )}
            <div className="link-box" dir="ltr">{patientLink}</div>
            <div className="button-row">
              <button className="button button--primary" onClick={copyLink} type="button">{t("نسخ الرابط", "Copy link")}</button>
              <a className="button button--secondary" href={patientLink} target="_blank" rel="noreferrer">{t("فتح الرابط", "Open link")}</a>
              <button className="button button--ghost" disabled={busy} onClick={reactivate} type="button">{t("إعادة تفعيل الجلسة المقفلة", "Reactivate locked session")}</button>
            </div>
            <dl className="session-meta">
              <div><dt>{t("تحذير الخمول", "Idle warning")}</dt><dd>{t("٥ دقائق", "5 minutes")}</dd></div>
              <div><dt>{t("القفل", "Lock")}</dt><dd>{t("٧ دقائق", "7 minutes")}</dd></div>
              <div><dt>{t("الانتهاء", "Expiry")}</dt><dd>{t("٣٠ دقيقة", "30 minutes")}</dd></div>
            </dl>
          </>
        )}
      </section>
      </div>
      </main>
    </div>
  );
}
