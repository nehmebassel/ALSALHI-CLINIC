import { createHash } from "node:crypto";

import type { PrismaClient } from "@/app/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { bootstrapAccountCanAuthenticate } from "./development-auth";

import {
  AuthorizationError,
  type AuthenticatedActor,
  type AuthenticatedActorRole,
} from "./authorization";

export const AUTHENTICATED_SESSION_COOKIE = "alsalhi_user_session";

export function hashAuthenticatedSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function readCookie(request: Request, name: string): string {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return "";
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const cookieName = cookie.slice(0, separatorIndex).trim();

    if (cookieName === name) {
      return decodeURIComponent(cookie.slice(separatorIndex + 1).trim());
    }
  }

  return "";
}

export async function resolveAuthenticatedActorFromToken(
  rawToken: string,
  prisma: PrismaClient = getPrismaClient(),
  now = new Date(),
): Promise<AuthenticatedActor> {
  if (!rawToken) {
    throw new AuthorizationError("AUTHENTICATION_REQUIRED");
  }

  const session = await prisma.authenticatedUserSession.findUnique({
    where: {
      sessionTokenHash: hashAuthenticatedSessionToken(rawToken),
    },
    include: {
      user: {
        include: {
          role: true,
        },
      },
      clinicDevice: true,
    },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= now.getTime() ||
    !session.user.isActive ||
    !bootstrapAccountCanAuthenticate(session.user.email)
  ) {
    throw new AuthorizationError("AUTHENTICATION_REQUIRED");
  }

  const role = session.user.role.code;

  if (role !== "STAFF" && role !== "PHYSICIAN") {
    throw new AuthorizationError("ACTION_NOT_ALLOWED");
  }

  if (
    role === "STAFF" &&
    (!session.clinicDevice ||
      session.clinicDevice.status !== "APPROVED" ||
      session.clinicDevice.revokedAt ||
      session.clinicDevice.clinicScopeId !== session.clinicScopeId)
  ) {
    throw new AuthorizationError("ACCESS_CONTEXT_NOT_ALLOWED");
  }

  await prisma.authenticatedUserSession.update({
    where: {
      id: session.id,
    },
    data: {
      lastSeenAt: now,
    },
  });

  return {
    actorType: "AUTHENTICATED_USER",
    userId: session.userId,
    userName: session.user.name,
    userLogin: session.user.email.split("@")[0] ?? session.user.email,
    role: role as AuthenticatedActorRole,
    clinicScopeId: session.clinicScopeId,
    clinicDeviceId: session.clinicDeviceId,
    authenticatedSessionId: session.id,
  };
}

export async function resolveAuthenticatedActor(
  request: Request,
  prisma: PrismaClient = getPrismaClient(),
  now = new Date(),
): Promise<AuthenticatedActor> {
  const rawToken = readCookie(request, AUTHENTICATED_SESSION_COOKIE);
  return resolveAuthenticatedActorFromToken(rawToken, prisma, now);
}
