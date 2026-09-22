import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthenticatedActorRole } from "./authorization";
import {
  AUTHENTICATED_SESSION_COOKIE,
  resolveAuthenticatedActorFromToken,
} from "./session";

export async function getPageActor() {
  const store = await cookies();
  const token = store.get(AUTHENTICATED_SESSION_COOKIE)?.value ?? "";
  if (!token) return null;
  try {
    return await resolveAuthenticatedActorFromToken(token);
  } catch {
    return null;
  }
}

export async function requirePageActor(role?: AuthenticatedActorRole) {
  const actor = await getPageActor();
  if (!actor) redirect("/login");
  if (role && actor.role !== role) {
    redirect(actor.role === "PHYSICIAN" ? "/physician" : "/staff");
  }
  return actor;
}
