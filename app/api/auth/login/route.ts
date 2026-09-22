import { createHash, randomBytes } from "node:crypto";

import { AUTHENTICATED_SESSION_COOKIE } from "@/lib/auth/session";
import { normalizeUsername, usernameLoginEmail, verifyPassword } from "@/lib/auth/password";
import { getPrismaClient } from "@/lib/prisma";
import {
  bootstrapAccountCanAuthenticate,
  isDevelopmentAuthEnabled,
  trustedLoginClientAddress,
} from "@/lib/auth/development-auth";

interface LoginBody {
  username?: unknown;
  password?: unknown;
  locale?: unknown;
}

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function clientKey(request: Request, username: string) {
  const ip = trustedLoginClientAddress(request);
  return `${ip}:${username}`;
}

function isRateLimited(key: string, now = Date.now()) {
  const state = attempts.get(key);
  if (!state || state.resetAt <= now) {
    attempts.delete(key);
    return false;
  }
  return state.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string, now = Date.now()) {
  const state = attempts.get(key);
  if (!state || state.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  state.count += 1;
}

export async function POST(request: Request): Promise<Response> {
  if (!isDevelopmentAuthEnabled()) {
    return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as LoginBody;
  if (typeof body.username !== "string" || typeof body.password !== "string") {
    return Response.json({ error: { code: "INVALID_CREDENTIALS" } }, { status: 401 });
  }

  const username = normalizeUsername(body.username);
  const locale = body.locale === "en" ? "en" : "ar";
  const key = clientKey(request, username);
  if (!username || body.password.length < 8) {
    recordFailure(key);
    return Response.json({ error: { code: "INVALID_CREDENTIALS" } }, { status: 401 });
  }
  if (isRateLimited(key)) {
    return Response.json({ error: { code: "LOGIN_BLOCKED" } }, { status: 429 });
  }

  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { email: usernameLoginEmail(username) },
    include: { role: true },
  });

  if (!user || !user.isActive || !bootstrapAccountCanAuthenticate(user.email) || !verifyPassword(body.password, user.passwordHash)) {
    recordFailure(key);
    return Response.json({ error: { code: "INVALID_CREDENTIALS" } }, { status: 401 });
  }

  if (user.role.code !== "STAFF" && user.role.code !== "PHYSICIAN") {
    return Response.json({ error: { code: "ROLE_NOT_ALLOWED" } }, { status: 403 });
  }

  const clinicScope = await prisma.clinicScope.findUniqueOrThrow({ where: { code: "PILOT0" } });
  let clinicDeviceId: string | null = null;

  if (user.role.code === "STAFF") {
    const allowLocalDevice = process.env.NODE_ENV !== "production" && process.env.P01_AUTO_APPROVE_LOCAL_DEVICE === "true";
    if (!allowLocalDevice) {
      return Response.json({ error: { code: "STAFF_DEVICE_NOT_APPROVED" } }, { status: 403 });
    }
    const deviceKey = process.env.P01_LOCAL_STAFF_DEVICE_KEY?.trim();
    if (!deviceKey || deviceKey.length < 24) {
      return Response.json({ error: { code: "DEVELOPMENT_AUTH_NOT_CONFIGURED" } }, { status: 503 });
    }
    const fingerprint = createHash("sha256").update(deviceKey).digest("hex");
    const device = await prisma.clinicDevice.upsert({
      where: { certificateFingerprintHash: fingerprint },
      update: { clinicScopeId: clinicScope.id, status: "APPROVED", approvedAt: new Date(), revokedAt: null },
      create: {
        clinicScopeId: clinicScope.id,
        name: "P01 Local Staff Browser",
        certificateFingerprintHash: fingerprint,
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });
    clinicDeviceId = device.id;
  }

  attempts.delete(key);
  const rawToken = randomBytes(32).toString("base64url");
  const sessionTokenHash = createHash("sha256").update(rawToken).digest("hex");
  const maxAgeSeconds = 8 * 60 * 60;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

  await prisma.authenticatedUserSession.create({
    data: { sessionTokenHash, userId: user.id, clinicScopeId: clinicScope.id, clinicDeviceId, expiresAt },
  });

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", `${AUTHENTICATED_SESSION_COOKIE}=${encodeURIComponent(rawToken)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`);
  headers.append("set-cookie", `alsalhi_locale=${locale}; Path=/; SameSite=Lax; Max-Age=${365 * 24 * 60 * 60}${secure}`);
  return Response.json(
    { user: { name: user.name, username, role: user.role.code }, redirectTo: user.role.code === "PHYSICIAN" ? "/physician" : "/staff" },
    { headers },
  );
}
