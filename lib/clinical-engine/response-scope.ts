import type { ResponseScopeType } from "@/lib/content-registry/contracts";

export interface ResponseScope {
  type: ResponseScopeType;
  key: string;
}

export class ResponseScopeError extends Error {
  readonly code = "INVALID_RESPONSE_SCOPE";

  constructor() {
    super("Response Scope requires a non-blank stable key.");
    this.name = "ResponseScopeError";
  }
}

export function getQuestionInstanceIdentity(
  questionDefinitionId: string,
  scope: ResponseScope,
): string {
  const definitionId = questionDefinitionId.trim();
  const scopeKey = scope.key.trim();

  if (!definitionId || !scopeKey) {
    throw new ResponseScopeError();
  }

  return JSON.stringify([definitionId, scope.type, scopeKey]);
}
