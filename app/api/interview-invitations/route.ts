import { AuthorizationError } from "@/lib/auth/authorization";
import { authorizationErrorResponse } from "@/lib/auth/http";
import { resolveAuthenticatedActor } from "@/lib/auth/session";
import { ClinicMrnValidationError } from "@/lib/identity/mrn";
import { noStoreJson } from "@/lib/http/no-store-json";
import { patientAccessErrorResponse } from "@/lib/patient-access/http";
import { PrismaPatientAccessStore } from "@/lib/patient-access/prisma-store";
import {
  PatientAccessError,
  PatientAccessService,
} from "@/lib/patient-access/service";
import { getPrismaClient } from "@/lib/prisma";

interface CreateInvitationBody {
  clinicMrn?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as CreateInvitationBody;

    if (typeof body.clinicMrn !== "string") {
      throw new PatientAccessError("INVALID_REQUEST");
    }

    const prisma = getPrismaClient();
    const actor = await resolveAuthenticatedActor(request, prisma);

    const service = new PatientAccessService(
      new PrismaPatientAccessStore(prisma),
    );

    const flow = await service.createFlow({
      ...actor,
    }, {
      clinicMrn: body.clinicMrn,
    });

    return noStoreJson(flow, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (error instanceof ClinicMrnValidationError) {
      return patientAccessErrorResponse(
        new PatientAccessError("INVALID_REQUEST"),
      );
    }

    if (error instanceof PatientAccessError) {
      return patientAccessErrorResponse(error);
    }

    if (error instanceof SyntaxError) {
      return patientAccessErrorResponse(
        new PatientAccessError("INVALID_REQUEST"),
      );
    }

    console.error("Failed to create patient access flow.", error);

    return noStoreJson(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "The patient access flow could not be created.",
        },
      },
      { status: 500 },
    );
  }
}
