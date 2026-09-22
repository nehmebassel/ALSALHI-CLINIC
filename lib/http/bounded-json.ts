export type BoundedJsonBodyErrorCode =
  | "INVALID_REQUEST"
  | "REQUEST_BODY_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE";

export class BoundedJsonBodyError extends Error {
  constructor(readonly code: BoundedJsonBodyErrorCode) {
    super(
      code === "REQUEST_BODY_TOO_LARGE"
        ? "The request body is too large."
        : code === "UNSUPPORTED_MEDIA_TYPE"
          ? "The request body must use application/json."
          : "The request body is invalid.",
    );
    this.name = "BoundedJsonBodyError";
  }
}

export function boundedJsonBodyErrorStatus(
  error: BoundedJsonBodyError,
): number {
  return error.code === "REQUEST_BODY_TOO_LARGE"
    ? 413
    : error.code === "UNSUPPORTED_MEDIA_TYPE"
      ? 415
      : 400;
}

export async function parseBoundedJsonBody(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new BoundedJsonBodyError("UNSUPPORTED_MEDIA_TYPE");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new BoundedJsonBodyError("INVALID_REQUEST");
    }
    if (parsedLength > maxBytes) {
      throw new BoundedJsonBodyError("REQUEST_BODY_TOO_LARGE");
    }
  }

  if (!request.body) throw new BoundedJsonBodyError("INVALID_REQUEST");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new BoundedJsonBodyError("REQUEST_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof BoundedJsonBodyError) throw error;
    throw new BoundedJsonBodyError("INVALID_REQUEST");
  }
}
