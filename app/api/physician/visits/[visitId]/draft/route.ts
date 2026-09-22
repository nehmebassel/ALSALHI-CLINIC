import { AuthorizationError } from "@/lib/auth/authorization";
import { authorizationErrorResponse } from "@/lib/auth/http";
import { resolveAuthenticatedActor } from "@/lib/auth/session";
import { noStoreJson } from "@/lib/http/no-store-json";
import {
  boundedJsonBodyErrorStatus,
  BoundedJsonBodyError,
  parseBoundedJsonBody,
} from "@/lib/http/bounded-json";
import {
  parseUpdatePhysicianVisitDraftRequestBody,
  PhysicianVisitDraftError,
} from "@/lib/physician/visit-contracts";
import { physicianVisitDraftErrorResponse } from "@/lib/physician/visit-http";
import { PhysicianVisitService } from "@/lib/physician/visit-service";
import { getPrismaClient } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> },
): Promise<Response> {
  try {
    const prisma = getPrismaClient();
    const actor = await resolveAuthenticatedActor(request, prisma);
    const { visitId } = await params;
    const command = parseUpdatePhysicianVisitDraftRequestBody(
      await parseBoundedJsonBody(request, 160 * 1024),
    );
    const physicianVisitRecord = await new PhysicianVisitService(
      prisma,
    ).updateDraft(actor, visitId, command);
    return noStoreJson({ physicianVisitRecord });
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(error);
    if (error instanceof PhysicianVisitDraftError) {
      return physicianVisitDraftErrorResponse(error);
    }
    if (error instanceof BoundedJsonBodyError) {
      return noStoreJson(
        { error: { code: error.code, message: error.message } },
        { status: boundedJsonBodyErrorStatus(error) },
      );
    }
    console.error("Physician Visit draft update failed.", error);
    return noStoreJson(
      { error: { code: "INTERNAL_ERROR", message: "Physician Visit draft update failed." } },
      { status: 500 },
    );
  }
}
