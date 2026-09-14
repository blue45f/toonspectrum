import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  readFreeInfrastructurePolicy,
  validateFreeInfrastructurePolicy,
} from "./free-infrastructure-policy.mjs";

const policy = JSON.parse(
  readFileSync(new URL("../config/free-infrastructure-policy.json", import.meta.url), "utf8"),
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("free infrastructure policy", () => {
  it("keeps the committed profile valid and credential-free", () => {
    expect(validateFreeInfrastructurePolicy(policy)).toEqual([]);
    expect(readFreeInfrastructurePolicy()).toEqual(policy);
    expect(JSON.stringify(policy)).not.toMatch(/sk-|BEGIN PRIVATE KEY|password\s*[:=]/iu);
  });

  it("rejects automatic deployment and paid failover", () => {
    const changed = clone(policy);
    changed.automaticDeployments = true;
    changed.automaticPaidFailover = true;
    expect(validateFreeInfrastructurePolicy(changed)).toEqual(
      expect.arrayContaining([
        "automaticDeployments must remain false",
        "automaticPaidFailover must remain false",
      ]),
    );
  });

  it("rejects provider caps above the central-write stop boundary", () => {
    const changed = clone(policy);
    changed.providers["cloudflare-r2"].applicationHardCapRatio = 0.9;
    expect(validateFreeInfrastructurePolicy(changed)).toContain(
      "providers.cloudflare-r2.applicationHardCapRatio must not exceed stopCentralPersonalWrites",
    );
  });

  it("requires local/BYOS default storage and explicit Oracle exclusion", () => {
    const changed = clone(policy);
    changed.defaultProjectStorage = "central-cloud";
    changed.forbiddenProviders = [];
    const issues = validateFreeInfrastructurePolicy(changed);
    expect(issues).toEqual(expect.arrayContaining([
      "defaultProjectStorage must remain local-or-byos",
      "forbiddenProviders must include oracle",
      "forbiddenProviders must include oci",
    ]));
  });
});
