import Image from "next/image";
import Link from "next/link";

export function BrandHeader({
  locale = "ar",
  compact = false,
}: {
  locale?: "ar" | "en";
  compact?: boolean;
}) {
  return (
    <header className={`brand-header ${compact ? "brand-header--compact" : ""}`}>
      <Link className="brand-lockup" href="/" aria-label="AlSalhi Clinical Platform">
        <span className="brand-logo-frame">
          <Image
            src="/alsalhi-logo-original.jpg"
            alt="AlSalhi logo"
            width={56}
            height={56}
            priority
          />
        </span>
        <span>
          <strong>{locale === "ar" ? "منصة الصالحي السريرية" : "AlSalhi Clinical Platform"}</strong>
          {!compact && (
            <small>{locale === "ar" ? "الرحلة السريرية — Pilot 0" : "Clinical Journey — Pilot 0"}</small>
          )}
        </span>
      </Link>
      <span className="synthetic-badge">
        {locale === "ar" ? "بيانات تجريبية فقط" : "Synthetic data only"}
      </span>
    </header>
  );
}
