import { AUTHENTICATED_SESSION_COOKIE, hashAuthenticatedSessionToken } from "@/lib/auth/session";
import { noStoreJson } from "@/lib/http/no-store-json";
import { getPrismaClient } from "@/lib/prisma";

function readCookie(request: Request, name: string): string {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export async function POST(request: Request): Promise<Response> {
  const rawToken = readCookie(request, AUTHENTICATED_SESSION_COOKIE);
  if (rawToken) {
    const prisma = getPrismaClient();
    await prisma.authenticatedUserSession.updateMany({
      where: { sessionTokenHash: hashAuthenticatedSessionToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return noStoreJson({ ok: true }, {
    headers: { "set-cookie": `${AUTHENTICATED_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}` },
  });
}
