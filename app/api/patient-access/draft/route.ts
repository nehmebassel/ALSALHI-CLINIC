import {
  isPatientInputJson,
  patientAccessErrorResponse,
  readBearerToken,
} from "@/lib/patient-access/http";
import { PrismaPatientAccessStore } from "@/lib/patient-access/prisma-store";
import { PatientAccessError, PatientAccessService } from "@/lib/patient-access/service";
import { assertPrivacyBeforeP01Autosave } from "@/lib/p01/engine";
import { mergeServerOwnedFollowUpContext } from "@/lib/follow-up/autosave";
import { noStoreJson } from "@/lib/http/no-store-json";
import { P01EngineService } from "@/lib/p01/engine-service";
import { historicalClinicalDateIssues } from "@/lib/p01/historical-date-integrity";
import { getPrismaClient } from "@/lib/prisma";

interface AutosaveBody {
  patientInputJson?: unknown;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const prisma = getPrismaClient();
    const service = new PatientAccessService(
      new PrismaPatientAccessStore(prisma),
    );
    const draft = await service.load(readBearerToken(request));
    const clinicalReferenceDate = new Date();
    const evaluation = await new P01EngineService(prisma).evaluateForClient({
      contentVersionId: draft.contentVersionId,
      patientInputJson: draft.patientInputJson,
      referenceDate: clinicalReferenceDate,
    });

    return noStoreJson({ draft, evaluation, clinicalReferenceDate: clinicalReferenceDate.toISOString() });
  } catch (error) {
    if (error instanceof PatientAccessError) {
      return patientAccessErrorResponse(error);
    }

    console.error("Failed to load patient draft.", error);
    return noStoreJson(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "The patient draft could not be loaded.",
        },
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as AutosaveBody;

    if (!isPatientInputJson(body.patientInputJson)) {
      throw new PatientAccessError("INVALID_REQUEST");
    }

    const prisma = getPrismaClient();
    const service = new PatientAccessService(
      new PrismaPatientAccessStore(prisma),
    );
    const token = readBearerToken(request);
    const current = await service.load(token);
    const patientInputJson = mergeServerOwnedFollowUpContext(
      current.patientInputJson,
      body.patientInputJson,
    );

    try {
      assertPrivacyBeforeP01Autosave(patientInputJson);
    } catch (error) {
      const code =
        error instanceof Error &&
        error.message === "PRIVACY_CONSENT_RECORD_INVALID"
          ? "PRIVACY_CONSENT_RECORD_INVALID"
          : "PRIVACY_CONSENT_REQUIRED";
      throw new PatientAccessError(code);
    }

    const clinicalReferenceDate = new Date();
    if (historicalClinicalDateIssues(patientInputJson, clinicalReferenceDate).length > 0) {
      throw new PatientAccessError("INVALID_REQUEST");
    }

    const draft = await service.autosave(token, patientInputJson);

    const evaluation = await new P01EngineService(prisma).evaluateForClient({
      contentVersionId: draft.contentVersionId,
      patientInputJson: draft.patientInputJson,
      referenceDate: clinicalReferenceDate,
    });

    return noStoreJson({ draft, evaluation, clinicalReferenceDate: clinicalReferenceDate.toISOString() });
  } catch (error) {
    if (error instanceof PatientAccessError) {
      return patientAccessErrorResponse(error);
    }

    if (error instanceof SyntaxError) {
      return patientAccessErrorResponse(
        new PatientAccessError("INVALID_REQUEST"),
      );
    }

    console.error("Failed to autosave patient draft.", error);
    return noStoreJson(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "The patient draft could not be autosaved.",
        },
      },
      { status: 500 },
    );
  }
}
