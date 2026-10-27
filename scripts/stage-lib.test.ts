// Guards the staging/production split (CLAUDE.md "Environments"): every staging binding must be a
// staging resource. stage-resources runs the same check in CI before anything is written.
import { describe, expect, it } from "vitest";
import { assertStagingIsolated, checkIsolated } from "./stage-lib.mjs";

const prod = {
  d1_databases: [{ database_name: "ftcref-auth", database_id: "prod-auth" }],
  services: [{ binding: "ACCOUNT", service: "ftcref-account" }],
  ratelimits: [{ name: "AUTH_LIMIT", namespace_id: "1001" }],
};
const staging = {
  d1_databases: [{ database_name: "ftcref-stage-auth", database_id: "stage-auth" }],
  services: [{ binding: "ACCOUNT", service: "ftcref-account-stage" }],
  ratelimits: [{ name: "AUTH_LIMIT", namespace_id: "1002" }],
};
const check = (stage: object) => () =>
  checkIsolated({ ...prod, env: { staging: { ...staging, ...stage } } }, "test");

describe("staging isolation", () => {
  it("passes for the committed wrangler configs", () => {
    expect(() => assertStagingIsolated()).not.toThrow();
  });

  it("accepts staging-only D1s, services and rate limits", () => {
    expect(check({})).not.toThrow();
  });

  it("rejects a production D1, Worker or rate limit in staging", () => {
    expect(check({ d1_databases: prod.d1_databases })).toThrow(/D1 ftcref-auth/);
    expect(check({ d1_databases: [{ database_name: "ftcref-other", database_id: "x" }] })).toThrow(/D1/);
    expect(check({ services: prod.services })).toThrow(/service ftcref-account/);
    expect(check({ ratelimits: prod.ratelimits })).toThrow(/rate limit namespace 1001/);
  });
});
