import {
  PatientAccessError,
  type PatientAccessErrorCode,
  type PatientInputJson,
} from "./service";
import { noStoreJson } from "../http/no-store-json";

const ERROR_STATUS: Record<PatientAccessErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_SESSION: 401,
  PRIVACY_CONSENT_REQUIRED: 400,
  PRIVACY_CONSENT_RECORD_INVALID: 400,
  SESSION_LOCKED: 423,
  SESSION_EXPIRED: 410,
  SESSION_CLOSED: 409,
};

export function patientAccessErrorResponse(error: PatientAccessError): Response {
  return noStoreJson(
    {
      error: {
        code: error.code,
        message: error.message,
      },
    },
    { status: ERROR_STATUS[error.code] },
  );
}

export function isPatientInputJson(value: unknown): value is PatientInputJson {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return "";
  }

  const [scheme, token, ...extra] = authorization.trim().split(/\s+/);

  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token ||
    extra.length > 0
  ) {
    return "";
  }

  return token;
}
