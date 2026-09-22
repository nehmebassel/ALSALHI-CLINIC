import { AuthorizationError } from "@/lib/auth/authorization";
import { authorizationErrorResponse } from "@/lib/auth/http";
import { resolveAuthenticatedActor } from "@/lib/auth/session";
import { noStoreJson } from "@/lib/http/no-store-json";
import { patientAccessErrorResponse } from "@/lib/patient-access/http";
import { PrismaPatientAccessStore } from "@/lib/patient-access/prisma-store";
import {
  PatientAccessError,
  PatientAccessService,
} from "@/lib/patient-access/service";
import { getPrismaClient } from "@/lib/prisma";

interface SessionActionBody {
  sessionId?: unknown;
  action?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as SessionActionBody;
    if (
      typeof body.sessionId !== "string" ||
      (body.action !== "REACTIVATE" && body.action !== "CANCEL")
    ) {
      throw new PatientAccessError("INVALID_REQUEST");
    }

    const prisma = getPrismaClient();
    const actor = await resolveAuthenticatedActor(request, prisma);
    const service = new PatientAccessService(
      new PrismaPatientAccessStore(prisma),
    );
    if (body.action === "REACTIVATE") {
      const access = await service.reactivate(actor, body.sessionId);
      return noStoreJson({
        sessionId: access.session.id,
        status: access.session.status,
        expiresAt: access.session.expiresAt,
      });
    }

    await service.cancel(actor, body.sessionId);
    return noStoreJson({ sessionId: body.sessionId, status: "CANCELLED" });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    if (error instanceof PatientAccessError) {
      return patientAccessErrorResponse(error);
    }
    if (error instanceof SyntaxError) {
      return patientAccessErrorResponse(
        new PatientAccessError("INVALID_REQUEST"),
      );
    }

    console.error("Staff session action failed.", error);
    return noStoreJson(
      { error: { code: "INTERNAL_ERROR", message: "Session action failed." } },
      { status: 500 },
    );
  }
}
