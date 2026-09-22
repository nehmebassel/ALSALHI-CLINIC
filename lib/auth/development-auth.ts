export const BOOTSTRAP_LOGIN_DOMAIN = "@login.p01.invalid";

const FORBIDDEN_BOOTSTRAP_PASSWORDS = new Set([
  "Nurse-P01-Local-2026!",
  "Doctor-P01-Local-2026!",
]);

export type DevelopmentAuthEnvironment = Record<string, string | undefined>;

export type DevelopmentBootstrapAccount = {
  roleCode: "STAFF" | "PHYSICIAN";
  username: string;
  password: string;
  name: string;
};

export class DevelopmentAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevelopmentAuthConfigurationError";
  }
}

export function isDevelopmentAuthEnabled(
  environment: DevelopmentAuthEnvironment = process.env,
): boolean {
  return environment.NODE_ENV !== "production"
    && environment.P01_ENABLE_DEV_AUTH === "true";
}

export function isBootstrapLoginEmail(email: string): boolean {
  return email.toLowerCase().endsWith(BOOTSTRAP_LOGIN_DOMAIN);
}

function requireValue(environment: DevelopmentAuthEnvironment, key: string): string {
  const value = environment[key]?.trim();
  if (!value) {
    throw new DevelopmentAuthConfigurationError(`${key} is required when development authentication is enabled.`);
  }
  return value;
}

function assertStrongLocalPassword(password: string, key: string): void {
  if (
    password.length < 20
    || !/[a-z]/.test(password)
    || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password)
    || !/[^A-Za-z0-9]/.test(password)
    || FORBIDDEN_BOOTSTRAP_PASSWORDS.has(password)
  ) {
    throw new DevelopmentAuthConfigurationError(
      `${key} must be an explicit, non-default local secret of at least 20 characters with upper, lower, numeric, and symbol characters.`,
    );
  }
}

export function developmentBootstrapAccounts(
  environment: DevelopmentAuthEnvironment = process.env,
): DevelopmentBootstrapAccount[] {
  if (environment.NODE_ENV === "production" && environment.P01_ENABLE_DEV_AUTH === "true") {
    throw new DevelopmentAuthConfigurationError("Development authentication cannot be enabled in production.");
  }
  if (!isDevelopmentAuthEnabled(environment)) return [];

  const staffUsername = requireValue(environment, "P01_BOOTSTRAP_STAFF_USERNAME");
  const physicianUsername = requireValue(environment, "P01_BOOTSTRAP_PHYSICIAN_USERNAME");
  const staffPassword = requireValue(environment, "P01_BOOTSTRAP_STAFF_PASSWORD");
  const physicianPassword = requireValue(environment, "P01_BOOTSTRAP_PHYSICIAN_PASSWORD");
  assertStrongLocalPassword(staffPassword, "P01_BOOTSTRAP_STAFF_PASSWORD");
  assertStrongLocalPassword(physicianPassword, "P01_BOOTSTRAP_PHYSICIAN_PASSWORD");
  if (
    staffUsername.toLowerCase() === physicianUsername.toLowerCase()
    || staffPassword === physicianPassword
  ) {
    throw new DevelopmentAuthConfigurationError("Staff and physician bootstrap credentials must be distinct.");
  }

  return [
    { roleCode: "STAFF", username: staffUsername, password: staffPassword, name: "P01 Nurse / Staff" },
    { roleCode: "PHYSICIAN", username: physicianUsername, password: physicianPassword, name: "P01 Physician" },
  ];
}

export function bootstrapAccountCanAuthenticate(
  email: string,
  environment: DevelopmentAuthEnvironment = process.env,
): boolean {
  const normalized = email.toLowerCase();
  if (isBootstrapLoginEmail(normalized)) return isDevelopmentAuthEnabled(environment);
  if (normalized === "synthetic-staff@p01.invalid" || normalized === "synthetic-physician@p01.invalid") {
    return isDevelopmentAuthEnabled(environment)
      && environment.P01_ENABLE_LEGACY_DEV_AUTH === "true";
  }
  return true;
}

export function trustedLoginClientAddress(
  request: Request,
  environment: DevelopmentAuthEnvironment = process.env,
): string {
  if (environment.P01_TRUST_PROXY === "true") {
    return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "proxy-unknown";
  }
  return "direct-client";
}
