import { AuthorizationError } from "@/lib/auth/authorization";
import { authorizationErrorResponse } from "@/lib/auth/http";
import { resolveAuthenticatedActor } from "@/lib/auth/session";
import {
  boundedJsonBodyErrorStatus,
  BoundedJsonBodyError,
  parseBoundedJsonBody,
} from "@/lib/http/bounded-json";
import { noStoreJson } from "@/lib/http/no-store-json";
import { PatientContextService } from "@/lib/patient-context/service";
import {
  parsePatientContextReviewCommand,
  PhysicianLongitudinalContractError,
} from "@/lib/physician/visit-longitudinal-contracts";
import { PhysicianVisitLifecycleError } from "@/lib/physician/visit-lifecycle-contracts";
import { physicianVisitLifecycleErrorResponse } from "@/lib/physician/visit-lifecycle-http";
import { getPrismaClient } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> },
): Promise<Response> {
  try {
    const prisma = getPrismaClient();
    const actor = await resolveAuthenticatedActor(request, prisma);
    const { visitId } = await params;
    const command = parsePatientContextReviewCommand(
      await parseBoundedJsonBody(request, 4 * 1024),
    );
    return noStoreJson(
      {
        review: await new PatientContextService(prisma).review(
          actor,
          visitId,
          command.contextFingerprint,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(error);
    if (error instanceof PhysicianVisitLifecycleError) {
      return physicianVisitLifecycleErrorResponse(error);
    }
    if (error instanceof PhysicianLongitudinalContractError) {
      return noStoreJson(
        { error: { code: "INVALID_CLINICAL_DATA", message: error.message } },
        { status: 400 },
      );
    }
    if (error instanceof BoundedJsonBodyError) {
      return noStoreJson(
        { error: { code: error.code, message: error.message } },
        { status: boundedJsonBodyErrorStatus(error) },
      );
    }
    console.error("Patient Context review failed.", error);
    return noStoreJson(
      { error: { code: "INTERNAL_ERROR", message: "Patient Context review failed." } },
      { status: 500 },
    );
  }
}
