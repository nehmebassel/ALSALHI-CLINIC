import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const FORMAT = "scrypt-v1";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("base64url");
  return `${FORMAT}$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [format, salt, expectedRaw] = storedHash.split("$");
  if (format !== FORMAT || !salt || !expectedRaw) return false;

  try {
    const expected = Buffer.from(expectedRaw, "base64url");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

export function usernameLoginEmail(username: string): string {
  const normalized = normalizeUsername(username);
  return `${normalized}@login.p01.invalid`;
}
