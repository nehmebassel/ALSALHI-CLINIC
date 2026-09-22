import { AuthorizationError } from "@/lib/auth/authorization";
import { authorizationErrorResponse } from "@/lib/auth/http";
import { resolveAuthenticatedActor } from "@/lib/auth/session";
import { noStoreJson } from "@/lib/http/no-store-json";
import { HairHistoryWriteError, PhysicianHairHistoryService } from "@/lib/physician/hair-history-service";
import { getPrismaClient } from "@/lib/prisma";

function writeErrorResponse(error: HairHistoryWriteError): Response {
  const status = error.code === "PATIENT_NOT_FOUND" || error.code === "SOURCE_VISIT_NOT_FOUND" || error.code === "REVIEW_VISIT_NOT_FOUND" || error.code === "DRAFT_NOT_FOUND"
    ? 404
    : error.code === "HAIR_HISTORY_NOT_ELIGIBLE"
      ? 403
    : error.code === "REVISION_CONFLICT" || error.code === "ALREADY_APPROVED"
      ? 409
      : 400;
  return noStoreJson({ error: { code: error.code, message: error.message } }, { status });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ patientId: string }> }): Promise<Response> {
  try {
    const prisma = getPrismaClient();
    const actor = await resolveAuthenticatedActor(request, prisma);
    const { patientId } = await params;
    const body = await request.json() as Record<string, unknown>;
    const service = new PhysicianHairHistoryService(prisma);
    if (body.action === "SAVE_DRAFT") {
      if (typeof body.sourceVisitId !== "string") throw new HairHistoryWriteError("INVALID_REQUEST");
      const result = await service.saveDraft(actor, { patientId, sourceVisitId: body.sourceVisitId, items: body.items, ...(typeof body.baseRevision === "number" ? { baseRevision: body.baseRevision } : {}), ...(typeof body.reason === "string" ? { reason: body.reason } : {}) });
      return noStoreJson(result);
    }
    if (body.action === "APPROVE") {
      if (typeof body.approvingVisitId !== "string") throw new HairHistoryWriteError("INVALID_REQUEST");
      return noStoreJson(await service.approve(actor, { patientId, approvingVisitId: body.approvingVisitId }));
    }
    if (body.action === "REOPEN") {
      if (typeof body.sourceVisitId !== "string" || typeof body.reason !== "string") throw new HairHistoryWriteError("INVALID_REQUEST");
      return noStoreJson(await service.reopen(actor, { patientId, sourceVisitId: body.sourceVisitId, reason: body.reason }));
    }
    throw new HairHistoryWriteError("INVALID_REQUEST");
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(error);
    if (error instanceof HairHistoryWriteError) return writeErrorResponse(error);
    if (error instanceof SyntaxError) return writeErrorResponse(new HairHistoryWriteError("INVALID_REQUEST"));
    console.error("Physician hair-history write failed.", error);
    return noStoreJson({ error: { code: "INTERNAL_ERROR", message: "Hair history update failed." } }, { status: 500 });
  }
}
