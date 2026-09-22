import { AuthorizationError } from "@/lib/auth/authorization";
import { authorizationErrorResponse } from "@/lib/auth/http";
import { resolveAuthenticatedActor } from "@/lib/auth/session";
import {
  boundedJsonBodyErrorStatus,
  BoundedJsonBodyError,
  parseBoundedJsonBody,
} from "@/lib/http/bounded-json";
import { noStoreJson } from "@/lib/http/no-store-json";
import {
  parseFinalizePhysicianVisitRequestBody,
  PhysicianVisitLifecycleError,
} from "@/lib/physician/visit-lifecycle-contracts";
import { physicianVisitLifecycleErrorResponse } from "@/lib/physician/visit-lifecycle-http";
import { PhysicianVisitLifecycleService } from "@/lib/physician/visit-lifecycle-service";
import { getPrismaClient } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> },
): Promise<Response> {
  try {
    const prisma = getPrismaClient();
    const actor = await resolveAuthenticatedActor(request, prisma);
    const { visitId } = await params;
    const command = parseFinalizePhysicianVisitRequestBody(
      await parseBoundedJsonBody(request, 16 * 1024),
    );
    return noStoreJson(
      await new PhysicianVisitLifecycleService(prisma).finalize(
        actor,
        visitId,
        command,
      ),
    );
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(error);
    if (error instanceof PhysicianVisitLifecycleError) {
      return physicianVisitLifecycleErrorResponse(error);
    }
    if (error instanceof BoundedJsonBodyError) {
      return noStoreJson(
        { error: { code: error.code, message: error.message } },
        { status: boundedJsonBodyErrorStatus(error) },
      );
    }
    console.error("Physician Visit finalization failed.", error);
    return noStoreJson(
      { error: { code: "INTERNAL_ERROR", message: "Physician Visit finalization failed." } },
      { status: 500 },
    );
  }
}
