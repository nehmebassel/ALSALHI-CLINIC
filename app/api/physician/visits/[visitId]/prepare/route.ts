import { AuthorizationError } from "@/lib/auth/authorization";
import { authorizationErrorResponse } from "@/lib/auth/http";
import { resolveAuthenticatedActor } from "@/lib/auth/session";
import { noStoreJson } from "@/lib/http/no-store-json";
import { PhysicianVisitDraftError } from "@/lib/physician/visit-contracts";
import { physicianVisitDraftErrorResponse } from "@/lib/physician/visit-http";
import { PhysicianVisitService } from "@/lib/physician/visit-service";
import { getPrismaClient } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> },
): Promise<Response> {
  try {
    const prisma = getPrismaClient();
    const actor = await resolveAuthenticatedActor(request, prisma);
    const { visitId } = await params;
    const physicianVisitRecord = await new PhysicianVisitService(prisma).prepareDraft(
      actor,
      visitId,
    );
    return noStoreJson({ physicianVisitRecord });
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(error);
    if (error instanceof PhysicianVisitDraftError) {
      return physicianVisitDraftErrorResponse(error);
    }
    console.error("Physician Visit Draft preparation failed.", error);
    return noStoreJson(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Physician Visit Draft preparation failed.",
        },
      },
      { status: 500 },
    );
  }
}
