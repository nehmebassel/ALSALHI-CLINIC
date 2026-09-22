import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("patient bearer token is captured in memory and removed from the visible URL immediately", async () => {
  const source = await readFile(new URL("../app/patient/patient-journey.tsx", import.meta.url), "utf8");
  assert.match(source, /useState\(\(\) => searchParams\.get\("token"\)/);
  assert.match(source, /window\.history\.replaceState\(window\.history\.state, "", window\.location\.pathname\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test("platform responses suppress referrers, framing, MIME sniffing, and unused sensitive permissions", async () => {
  const source = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  for (const expected of [
    "Referrer-Policy",
    "no-referrer",
    "X-Content-Type-Options",
    "nosniff",
    "X-Frame-Options",
    "DENY",
    "Permissions-Policy",
  ]) {
    assert.equal(source.includes(expected), true, expected);
  }
});
