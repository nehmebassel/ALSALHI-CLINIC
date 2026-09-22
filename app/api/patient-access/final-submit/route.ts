import { readBearerToken } from "@/lib/patient-access/http";
import { noStoreJson } from "@/lib/http/no-store-json";
import { P01EngineService } from "@/lib/p01/engine-service";
import { getPrismaClient } from "@/lib/prisma";
import {
  FinalSubmitError,
  FinalSubmitService,
} from "@/lib/submission/service";

interface FinalSubmitBody {
  confirmed?: unknown;
}

const ERROR_STATUS: Record<FinalSubmitError["code"], number> = {
  INVALID_SESSION: 401,
  SESSION_NOT_ACTIVE: 409,
  DRAFT_NOT_SUBMITTABLE: 409,
  OFFICIAL_STATE_NOT_READY: 422,
  INVALID_PROFILE: 422,
  CONFIGURATION_ERROR: 500,
  RETRYABLE_CONFLICT: 409,
};

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as FinalSubmitBody;
    if (body.confirmed !== true) {
      return noStoreJson(
        {
          error: {
            code: "FINAL_CONFIRMATION_REQUIRED",
            message: "Final submission confirmation is required.",
          },
        },
        { status: 400 },
      );
    }

    const token = readBearerToken(request);
    if (!token) {
      throw new FinalSubmitError("INVALID_SESSION");
    }

    const prisma = getPrismaClient();
    const engine = new P01EngineService(prisma);
    const submission = new FinalSubmitService(prisma, {
      evaluateOfficialState: (input) => engine.evaluateOfficialState(input),
    });
    const result = await submission.submit({
      patientSessionToken: token,
    });

    return noStoreJson(result, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    if (error instanceof FinalSubmitError) {
      return noStoreJson(
        { error: { code: error.code, message: error.message } },
        { status: ERROR_STATUS[error.code] },
      );
    }

    if (error instanceof SyntaxError) {
      return noStoreJson(
        { error: { code: "INVALID_REQUEST", message: "Invalid JSON body." } },
        { status: 400 },
      );
    }

    console.error("P01 Final Submit failed.", error);
    return noStoreJson(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Final Submit could not be completed.",
        },
      },
      { status: 500 },
    );
  }
}
