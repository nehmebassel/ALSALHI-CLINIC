"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type PlatformLocale = "ar" | "en";

const LocaleContext = createContext<{
  locale: PlatformLocale;
  dir: "rtl" | "ltr";
  setLocale: (locale: PlatformLocale) => void;
}>({ locale: "ar", dir: "rtl", setLocale: () => undefined });

function persist(locale: PlatformLocale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  localStorage.setItem("alsalhi_locale", locale);
  document.cookie = `alsalhi_locale=${locale}; Path=/; SameSite=Lax; Max-Age=${365 * 24 * 60 * 60}`;
}

export function PlatformLocaleProvider({ children, initialLocale = "ar" }: { children: React.ReactNode; initialLocale?: PlatformLocale }) {
  const [locale, updateLocale] = useState<PlatformLocale>(initialLocale);

  useEffect(() => {
    persist(locale);
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    dir: locale === "ar" ? "rtl" as const : "ltr" as const,
    setLocale(next: PlatformLocale) {
      updateLocale(next);
      persist(next);
    },
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function usePlatformLocale() {
  return useContext(LocaleContext);
}
