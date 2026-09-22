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
  parsePhysicianClinicalCorrectionRequestBody,
  PhysicianVisitClinicalContractError,
} from "@/lib/physician/visit-clinical-contracts";
import { PhysicianVisitClinicalService } from "@/lib/physician/visit-clinical-service";
import { PhysicianVisitLifecycleError } from "@/lib/physician/visit-lifecycle-contracts";
import { physicianVisitLifecycleErrorResponse } from "@/lib/physician/visit-lifecycle-http";
import {
  parseLongitudinalCorrectionCommand,
  PhysicianLongitudinalContractError,
} from "@/lib/physician/visit-longitudinal-contracts";
import { PhysicianVisitLongitudinalService } from "@/lib/physician/visit-longitudinal-service";
import { getPrismaClient } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> },
): Promise<Response> {
  try {
    const prisma = getPrismaClient();
    const actor = await resolveAuthenticatedActor(request, prisma);
    const { visitId } = await params;
    const body = await parseBoundedJsonBody(request, 32 * 1024);
    const target =
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>).target
        : undefined;
    if (
      target === "DIAGNOSIS_DECISION" ||
      target === "TREATMENT_DECISION" ||
      target === "PROCEDURE_DECISION"
    ) {
      const correction = await new PhysicianVisitLongitudinalService(
        prisma,
      ).correct(actor, visitId, parseLongitudinalCorrectionCommand(body));
      return noStoreJson({ correction }, { status: 200 });
    }
    const command = parsePhysicianClinicalCorrectionRequestBody(body);
    return noStoreJson(
      {
        correction: await new PhysicianVisitClinicalService(prisma).correct(
          actor,
          visitId,
          command,
        ),
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(error);
    if (error instanceof PhysicianVisitLifecycleError) {
      return physicianVisitLifecycleErrorResponse(error);
    }
    if (error instanceof PhysicianVisitClinicalContractError) {
      return noStoreJson(
        { error: { code: "INVALID_CLINICAL_DATA", message: error.message } },
        { status: 400 },
      );
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
    console.error("Physician clinical correction failed.", error);
    return noStoreJson(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Physician clinical correction failed.",
        },
      },
      { status: 500 },
    );
  }
}
