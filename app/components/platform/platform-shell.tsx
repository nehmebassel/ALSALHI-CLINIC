"use client";

import { PlatformHeader } from "./platform-header";
import { PlatformLocaleProvider, type PlatformLocale } from "./platform-locale";
import styles from "./platform-shell.module.css";

export function PlatformShell({
  children,
  userName,
  role,
  initialLocale = "ar",
}: {
  children: React.ReactNode;
  userName: string;
  role: "STAFF" | "PHYSICIAN";
  initialLocale?: PlatformLocale;
}) {
  return (
    <PlatformLocaleProvider initialLocale={initialLocale}>
      <div className={styles.scope}>
        <div className="platform-shell">
        <PlatformHeader userName={userName} role={role} />
          {children}
        </div>
      </div>
    </PlatformLocaleProvider>
  );
}
