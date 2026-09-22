import assert from "node:assert/strict";
import test from "node:test";

import {
  DevelopmentAuthConfigurationError,
  bootstrapAccountCanAuthenticate,
  developmentBootstrapAccounts,
  trustedLoginClientAddress,
} from "../lib/auth/development-auth";

const VALID = {
  NODE_ENV: "development",
  P01_ENABLE_DEV_AUTH: "true",
  P01_BOOTSTRAP_STAFF_USERNAME: "local-staff-a",
  P01_BOOTSTRAP_STAFF_PASSWORD: "Staff-Only!Local-Secret-2026-A",
  P01_BOOTSTRAP_PHYSICIAN_USERNAME: "local-physician-b",
  P01_BOOTSTRAP_PHYSICIAN_PASSWORD: "Physician-Only!Local-Secret-2026-B",
};

test("development bootstrap auth refuses production, missing secrets, and distributed defaults", () => {
  assert.throws(
    () => developmentBootstrapAccounts({ ...VALID, NODE_ENV: "production" }),
    DevelopmentAuthConfigurationError,
  );
  assert.throws(
    () => developmentBootstrapAccounts({ NODE_ENV: "development", P01_ENABLE_DEV_AUTH: "true" }),
    DevelopmentAuthConfigurationError,
  );
  assert.throws(
    () => developmentBootstrapAccounts({
      ...VALID,
      P01_BOOTSTRAP_STAFF_PASSWORD: "Nurse-P01-Local-2026!",
    }),
    DevelopmentAuthConfigurationError,
  );
  assert.equal(developmentBootstrapAccounts(VALID).length, 2);
});

test("previously persisted bootstrap identities fail closed when development auth is disabled", () => {
  assert.equal(
    bootstrapAccountCanAuthenticate("old-account@login.p01.invalid", {
      NODE_ENV: "development",
      P01_ENABLE_DEV_AUTH: "false",
    }),
    false,
  );
  assert.equal(
    bootstrapAccountCanAuthenticate("synthetic-staff@p01.invalid", {
      NODE_ENV: "development",
      P01_ENABLE_DEV_AUTH: "false",
      P01_ENABLE_LEGACY_DEV_AUTH: "true",
    }),
    false,
  );
  assert.equal(bootstrapAccountCanAuthenticate("physician@clinic.example", {}), true);
});

test("forwarded client addresses are ignored unless proxy trust is explicitly configured", () => {
  const request = new Request("http://localhost/api/auth/login", {
    headers: { "x-forwarded-for": "203.0.113.55, 10.0.0.1" },
  });
  assert.equal(trustedLoginClientAddress(request, {}), "direct-client");
  assert.equal(trustedLoginClientAddress(request, { P01_TRUST_PROXY: "true" }), "203.0.113.55");
});
