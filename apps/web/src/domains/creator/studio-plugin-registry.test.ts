import { describe, expect, it } from "vitest";

import {
  evaluateStudioPluginInstall,
  validateStudioPluginManifest,
  type StudioPluginManifest,
} from "./studio-plugin-registry";

const PLUGIN: StudioPluginManifest = Object.freeze({
  id: "speech-balloon-checker",
  version: "1.2.0",
  name: "말풍선 검사",
  publisher: "verified-publisher",
  runtime: "worker",
  signature: "verified",
  permissions: ["document-read", "document-write", "network"],
  networkDomains: ["api.example.com"],
  entrypoint: "worker.js",
});

describe("Studio plugin registry", () => {
  it("asks for explicit elevated permissions before installation", () => {
    const decision = evaluateStudioPluginInstall(PLUGIN, {
      trustedPublisherIds: ["verified-publisher"],
      confirmedPermissions: [],
      allowedNetworkDomains: ["api.example.com"],
      enterprisePolicyAllowsUnsigned: false,
    });
    expect(decision).toMatchObject({
      status: "confirmation",
      grantedPermissions: ["document-read"],
      confirmationPermissions: ["document-write", "network"],
    });
  });

  it("grants only declared and confirmed permissions", () => {
    const decision = evaluateStudioPluginInstall(PLUGIN, {
      trustedPublisherIds: ["verified-publisher"],
      confirmedPermissions: ["document-write", "network", "publish"],
      allowedNetworkDomains: ["api.example.com"],
      enterprisePolicyAllowsUnsigned: false,
    });
    expect(decision.status).toBe("ready");
    expect(decision.grantedPermissions).toEqual([
      "document-read",
      "document-write",
      "network",
    ]);
    expect(decision.grantedNetworkDomains).toEqual(["api.example.com"]);
  });

  it("blocks revoked, unsigned elevated and unapproved network plugins", () => {
    expect(evaluateStudioPluginInstall({ ...PLUGIN, signature: "revoked" }, {
      trustedPublisherIds: ["verified-publisher"],
      confirmedPermissions: PLUGIN.permissions,
      allowedNetworkDomains: ["api.example.com"],
      enterprisePolicyAllowsUnsigned: false,
    }).blockingCodes).toContain("signature-revoked");
    expect(evaluateStudioPluginInstall({ ...PLUGIN, signature: "unsigned" }, {
      trustedPublisherIds: [],
      confirmedPermissions: PLUGIN.permissions,
      allowedNetworkDomains: ["api.example.com"],
      enterprisePolicyAllowsUnsigned: true,
    }).blockingCodes).toContain("unsigned-elevated-permission");
    expect(evaluateStudioPluginInstall(PLUGIN, {
      trustedPublisherIds: ["verified-publisher"],
      confirmedPermissions: PLUGIN.permissions,
      allowedNetworkDomains: [],
      enterprisePolicyAllowsUnsigned: false,
    }).blockingCodes).toContain("network-domain-not-allowed");
  });

  it("rejects malformed domain and permission declarations", () => {
    expect(validateStudioPluginManifest({
      ...PLUGIN,
      permissions: ["document-read", "document-read"],
      networkDomains: ["https://api.example.com/path"],
    })).toEqual(expect.arrayContaining([
      "permission-duplicate",
      "domain-invalid",
      "network-domain-without-permission",
    ]));
  });
});
