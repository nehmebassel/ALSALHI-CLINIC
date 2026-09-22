const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_INDIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const MRN_FORMATTING_CHARACTERS = /[\s\-_/]/gu;
const NORMALIZED_MRN_PATTERN = /^[A-Z0-9]{1,64}$/u;

export class ClinicMrnValidationError extends Error {
  readonly code = "INVALID_CLINIC_MRN";

  constructor() {
    super("Clinic MRN must contain 1 to 64 letters or digits.");
    this.name = "ClinicMrnValidationError";
  }
}

function normalizeDigit(character: string): string {
  const arabicIndicIndex = ARABIC_INDIC_DIGITS.indexOf(character);

  if (arabicIndicIndex >= 0) {
    return String(arabicIndicIndex);
  }

  const easternArabicIndicIndex =
    EASTERN_ARABIC_INDIC_DIGITS.indexOf(character);

  if (easternArabicIndicIndex >= 0) {
    return String(easternArabicIndicIndex);
  }

  return character;
}

/**
 * Canonical Clinic MRN normalization used for lookup, persistence, and
 * uniqueness. Display formatting is retained separately.
 */
export function normalizeClinicMrn(displayValue: string): string {
  const normalizedValue = Array.from(
    displayValue.normalize("NFKC").trim(),
    normalizeDigit,
  )
    .join("")
    .replace(MRN_FORMATTING_CHARACTERS, "")
    .toLocaleUpperCase("en-US");

  if (!NORMALIZED_MRN_PATTERN.test(normalizedValue)) {
    throw new ClinicMrnValidationError();
  }

  return normalizedValue;
}
