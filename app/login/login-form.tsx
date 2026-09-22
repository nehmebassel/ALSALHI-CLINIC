"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import styles from "./login-form.module.css";
import { useEffect, useState } from "react";

import type { PlatformLocale } from "@/app/components/platform/platform-locale";

export function LoginForm({ initialLocale = "ar" }: { initialLocale?: PlatformLocale }) {
  const router = useRouter();
  const [locale, setLocale] = useState<PlatformLocale>(initialLocale);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isAr = locale === "ar";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  function chooseLocale(next: PlatformLocale) {
    setLocale(next);
    localStorage.setItem("alsalhi_locale", next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, locale }),
      });
      const payload = await response.json() as { redirectTo?: string; error?: { code?: string } };
      if (!response.ok || !payload.redirectTo) {
        if (payload.error?.code === "STAFF_DEVICE_NOT_APPROVED") {
          throw new Error(isAr ? "هذا الجهاز غير معتمد لدخول التمريض/الموظفين." : "This device is not approved for Nurse/Staff access.");
        }
        if (payload.error?.code === "LOGIN_BLOCKED") {
          throw new Error(isAr ? "تم إيقاف المحاولات مؤقتًا. حاول لاحقًا." : "Login attempts are temporarily blocked. Try again later.");
        }
        throw new Error(isAr ? "اسم المستخدم أو كلمة المرور غير صحيحة." : "Incorrect username or password.");
      }
      document.cookie = `alsalhi_locale=${locale}; Path=/; SameSite=Lax; Max-Age=${365 * 24 * 60 * 60}`;
      router.replace(payload.redirectTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (isAr ? "تعذر تسجيل الدخول." : "Unable to sign in."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.scope}>
      <main className="login-page" dir={isAr ? "rtl" : "ltr"}>
      <section className="login-card">
        <div className="login-brand">
          <Image src="/alsalhi-logo-original.jpg" alt="AlSalhi" width={72} height={72} priority />
          <div>
            <strong>{isAr ? "منصة الصالحي السريرية" : "AlSalhi Clinical Platform"}</strong>
            <span>{isAr ? "دخول الفريق السريري" : "Clinical team sign in"}</span>
          </div>
        </div>

        <div className="login-language" aria-label="Language">
          <button className={locale === "ar" ? "active" : ""} onClick={() => chooseLocale("ar")} type="button">العربية</button>
          <button className={locale === "en" ? "active" : ""} onClick={() => chooseLocale("en")} type="button">English</button>
        </div>

        <div className="login-copy">
          <p className="eyebrow">{isAr ? "وصول آمن حسب الصلاحية" : "Secure role-based access"}</p>
          <h1>{isAr ? "تسجيل الدخول" : "Sign in"}</h1>
          <p>{isAr ? "يدخل الطبيب إلى مساحة الطبيب، ويدخل فريق التمريض والموظفون إلى مساحة إنشاء جلسات المراجعين." : "Physicians are routed to the physician workspace, while nurses and staff are routed to patient-session handoff tools."}</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label>
            <span>{isAr ? "اسم المستخدم" : "Username"}</span>
            <input autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            <span>{isAr ? "كلمة المرور" : "Password"}</span>
            <input autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="button button--primary login-submit" disabled={busy} type="submit">
            {busy ? (isAr ? "جارٍ تسجيل الدخول…" : "Signing in…") : (isAr ? "دخول" : "Sign in")}
          </button>
        </form>
        <p className="login-footnote">{isAr ? "وصول المراجع لا يتم من هذه الصفحة؛ يستخدم المراجع الرابط أو رمز QR المؤقت." : "Patients do not sign in here; they use their temporary link or QR code."}</p>
      </section>
      </main>
    </div>
  );
}
