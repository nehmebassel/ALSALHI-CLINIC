import { AuthorizationError } from "@/lib/auth/authorization";
import { authorizationErrorResponse } from "@/lib/auth/http";
import { resolveAuthenticatedActor } from "@/lib/auth/session";
import { noStoreJson } from "@/lib/http/no-store-json";

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await resolveAuthenticatedActor(request);
    return noStoreJson({ actor });
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(error);
    throw error;
  }
}
