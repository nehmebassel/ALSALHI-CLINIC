import { createHash, randomBytes } from "node:crypto";

import { AUTHENTICATED_SESSION_COOKIE } from "@/lib/auth/session";
import { isDevelopmentAuthEnabled } from "@/lib/auth/development-auth";
import { getPrismaClient } from "@/lib/prisma";

interface DevAuthBody {
  actorMode?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  if (
    !isDevelopmentAuthEnabled() ||
    process.env.P01_ENABLE_LEGACY_DEV_AUTH !== "true"
  ) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Not found." } },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as DevAuthBody;
  const actorMode =
    body.actorMode === "PHYSICIAN" || body.actorMode === "UNAPPROVED_STAFF"
      ? body.actorMode
      : "APPROVED_STAFF";
  const prisma = getPrismaClient();
  const clinicScope = await prisma.clinicScope.findUniqueOrThrow({
    where: { code: "PILOT0" },
  });
  const roleCode = actorMode === "PHYSICIAN" ? "PHYSICIAN" : "STAFF";
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  const user = await prisma.user.upsert({
    where: { email: `synthetic-${roleCode.toLowerCase()}@p01.invalid` },
    update: { roleId: role.id, isActive: true },
    create: {
      name: `Synthetic P01 ${roleCode}`,
      email: `synthetic-${roleCode.toLowerCase()}@p01.invalid`,
      passwordHash: "DEV_BOUNDARY_NO_PASSWORD_LOGIN",
      roleId: role.id,
      isActive: true,
    },
  });

  const device =
    roleCode === "STAFF"
      ? await prisma.clinicDevice.upsert({
          where: {
            certificateFingerprintHash:
              actorMode === "UNAPPROVED_STAFF"
                ? "synthetic-p01-revoked-device"
                : "synthetic-p01-approved-device",
          },
          update: {
            clinicScopeId: clinicScope.id,
            status:
              actorMode === "UNAPPROVED_STAFF" ? "REVOKED" : "APPROVED",
            approvedAt:
              actorMode === "UNAPPROVED_STAFF" ? null : new Date(),
            revokedAt:
              actorMode === "UNAPPROVED_STAFF" ? new Date() : null,
          },
          create: {
            clinicScopeId: clinicScope.id,
            name: `Synthetic P01 ${actorMode}`,
            certificateFingerprintHash:
              actorMode === "UNAPPROVED_STAFF"
                ? "synthetic-p01-revoked-device"
                : "synthetic-p01-approved-device",
            status:
              actorMode === "UNAPPROVED_STAFF" ? "REVOKED" : "APPROVED",
            approvedAt:
              actorMode === "UNAPPROVED_STAFF" ? null : new Date(),
            revokedAt:
              actorMode === "UNAPPROVED_STAFF" ? new Date() : null,
          },
        })
      : null;

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await prisma.authenticatedUserSession.create({
    data: {
      sessionTokenHash: tokenHash,
      userId: user.id,
      clinicScopeId: clinicScope.id,
      clinicDeviceId: device?.id ?? null,
      expiresAt,
    },
  });

  return Response.json(
    {
      actorMode,
      expiresAt,
      boundary: "DEVELOPMENT_TEST_ONLY",
    },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": `${AUTHENTICATED_SESSION_COOKIE}=${encodeURIComponent(rawToken)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${8 * 60 * 60}`,
      },
    },
  );
}
