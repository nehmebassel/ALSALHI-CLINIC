"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { usePlatformLocale } from "./platform-locale";

export function PlatformHeader({
  userName,
  role,
}: {
  userName: string;
  role: "STAFF" | "PHYSICIAN";
}) {
  const { locale, dir, setLocale } = usePlatformLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isAr = locale === "ar";

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="platform-header" dir={dir}>
      <div className="platform-brand">
        <Image src="/alsalhi-logo-original.jpg" alt="AlSalhi" width={48} height={48} priority />
        <div>
          <strong>{isAr ? "منصة الصالحي السريرية" : "AlSalhi Clinical Platform"}</strong>
          <small>{role === "PHYSICIAN" ? (isAr ? "بوابة الطبيب" : "Physician workspace") : (isAr ? "بوابة التمريض والموظفين" : "Nurse & staff workspace")}</small>
        </div>
      </div>
      <div className="platform-header-actions">
        <div className="platform-user">
          <strong>{userName}</strong>
          <small>{role === "PHYSICIAN" ? (isAr ? "طبيب" : "Physician") : (isAr ? "تمريض / موظف" : "Nurse / Staff")}</small>
        </div>
        <div className="platform-language" aria-label="Language">
          <button className={locale === "ar" ? "active" : ""} onClick={() => setLocale("ar")} type="button">العربية</button>
          <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")} type="button">English</button>
        </div>
        <button className="button button--ghost button--compact" disabled={busy} onClick={logout} type="button">
          {isAr ? "تسجيل الخروج" : "Sign out"}
        </button>
      </div>
    </header>
  );
}
