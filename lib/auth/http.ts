import { AuthorizationError } from "./authorization";
import { noStoreJson } from "../http/no-store-json";

const ERROR_STATUS: Record<AuthorizationError["code"], number> = {
  AUTHENTICATION_REQUIRED: 401,
  ACCESS_CONTEXT_NOT_ALLOWED: 403,
  ACTION_NOT_ALLOWED: 403,
  PHYSICIAN_FINALIZATION_REQUIRED: 403,
};

export function authorizationErrorResponse(
  error: AuthorizationError,
): Response {
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
