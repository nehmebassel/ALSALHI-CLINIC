export type SupportedLocale = "ar" | "en";

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toAsciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);
    const easternIndex = EASTERN_ARABIC_DIGITS.indexOf(digit);
    return easternIndex >= 0 ? String(easternIndex) : digit;
  });
}

export function localizeDigits(value: string | number, locale: SupportedLocale): string {
  const ascii = toAsciiDigits(String(value));
  if (locale === "en") return ascii;
  return ascii.replace(/\d/g, (digit) => ARABIC_INDIC_DIGITS[Number(digit)] ?? digit);
}

export function localeNumber(value: number, locale: SupportedLocale): string {
  return localizeDigits(String(value), locale);
}

export function localeForCalendar(locale: SupportedLocale, calendar: "GREGORIAN" | "HIJRI"): string {
  if (calendar === "GREGORIAN") {
    return locale === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : "en-US-u-ca-gregory-nu-latn";
  }
  return locale === "ar" ? "ar-SA-u-ca-islamic-umalqura-nu-arab" : "en-US-u-ca-islamic-umalqura-nu-latn";
}
