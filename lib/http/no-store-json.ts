export function noStoreJson(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(data, { ...init, headers });
}
