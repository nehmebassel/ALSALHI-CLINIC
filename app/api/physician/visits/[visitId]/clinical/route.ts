import { AuthorizationError } from "@/lib/auth/authorization";
import { authorizationErrorResponse } from "@/lib/auth/http";
import { resolveAuthenticatedActor } from "@/lib/auth/session";
import { noStoreJson } from "@/lib/http/no-store-json";
import { PhysicianVisitClinicalService } from "@/lib/physician/visit-clinical-service";
import { PhysicianVisitLifecycleError } from "@/lib/physician/visit-lifecycle-contracts";
import { physicianVisitLifecycleErrorResponse } from "@/lib/physician/visit-lifecycle-http";
import { getPrismaClient } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> },
): Promise<Response> {
  try {
    const prisma = getPrismaClient();
    const actor = await resolveAuthenticatedActor(request, prisma);
    const { visitId } = await params;
    return noStoreJson(
      await new PhysicianVisitClinicalService(prisma).read(actor, visitId),
    );
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(error);
    if (error instanceof PhysicianVisitLifecycleError) {
      return physicianVisitLifecycleErrorResponse(error);
    }
    console.error("Canonical physician clinical read failed.", error);
    return noStoreJson(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Canonical physician clinical read failed.",
        },
      },
      { status: 500 },
    );
  }
}
