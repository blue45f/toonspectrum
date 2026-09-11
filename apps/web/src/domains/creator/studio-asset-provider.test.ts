import { describe, expect, it } from "vitest";

import {
  evaluateStudioAssetEntitlement,
  evaluateStudioAssetProviderRequest,
  validateStudioAssetProvider,
  type StudioAssetEntitlement,
  type StudioAssetProviderDefinition,
} from "./studio-asset-provider";

const PROVIDER: StudioAssetProviderDefinition = Object.freeze<StudioAssetProviderDefinition>({
  id: "official-market",
  name: "Official Market",
  mode: "official-api",
  actions: ["search", "purchase", "download", "update", "sync-entitlements"],
  authorizedDomains: ["assets.example.com"],
  requiresAuthentication: true,
  allowsBackgroundSync: true,
});

const ENTITLEMENT: StudioAssetEntitlement = Object.freeze<StudioAssetEntitlement>({
  providerId: "official-market",
  assetId: "asset-1",
  versionId: "v2",
  ownerId: "team-1",
  receiptId: "receipt-1",
  purchasedAt: "2026-09-01T00:00:00.000Z",
  expiresAt: "2027-09-01T00:00:00.000Z",
  seatLimit: 5,
});

describe("Studio asset provider policy", () => {
  it("allows official search and requires confirmation before purchase", () => {
    expect(evaluateStudioAssetProviderRequest(PROVIDER, {
      action: "search",
      authenticated: true,
      userInitiated: true,
      sourceUrl: "https://assets.example.com/search?q=brush",
      bypassesAccessControl: false,
    }).status).toBe("allowed");
    expect(evaluateStudioAssetProviderRequest(PROVIDER, {
      action: "purchase",
      authenticated: true,
      userInitiated: true,
      sourceUrl: "https://shop.assets.example.com/items/1",
      bypassesAccessControl: false,
    })).toMatchObject({ status: "confirmation", code: "user-confirmation" });
  });

  it("blocks unsupported domains, missing authentication and access-control bypass", () => {
    expect(evaluateStudioAssetProviderRequest(PROVIDER, {
      action: "download",
      authenticated: false,
      userInitiated: true,
      sourceUrl: null,
      bypassesAccessControl: false,
    }).code).toBe("authentication-required");
    expect(evaluateStudioAssetProviderRequest(PROVIDER, {
      action: "download",
      authenticated: true,
      userInitiated: true,
      sourceUrl: "https://mirror.invalid/asset.zip",
      bypassesAccessControl: false,
    }).code).toBe("domain-not-authorized");
    expect(evaluateStudioAssetProviderRequest(PROVIDER, {
      action: "download",
      authenticated: true,
      userInitiated: true,
      sourceUrl: "https://assets.example.com/asset.zip",
      bypassesAccessControl: true,
    }).code).toBe("access-control-bypass");
  });

  it("keeps manual import local and user controlled", () => {
    const manual: StudioAssetProviderDefinition = {
      id: "manual",
      name: "Manual import",
      mode: "manual-import",
      actions: ["register-file", "register-receipt"],
      authorizedDomains: [],
      requiresAuthentication: false,
      allowsBackgroundSync: false,
    };
    expect(validateStudioAssetProvider(manual)).toEqual([]);
    expect(evaluateStudioAssetProviderRequest(manual, {
      action: "register-file",
      authenticated: false,
      userInitiated: true,
      sourceUrl: null,
      bypassesAccessControl: false,
    }).status).toBe("confirmation");
    expect(validateStudioAssetProvider({
      ...manual,
      actions: ["register-file", "download"],
    })).toContain("manual-provider-remote-action");
  });

  it("validates receipts, ownership, expiry and seats", () => {
    expect(evaluateStudioAssetEntitlement(ENTITLEMENT, {
      providerId: "official-market",
      ownerId: "team-1",
      teamSeats: 4,
      now: "2026-09-11T00:00:00.000Z",
      requiresReceipt: true,
    })).toEqual({ status: "active", codes: [] });

    expect(evaluateStudioAssetEntitlement({
      ...ENTITLEMENT,
      receiptId: null,
      expiresAt: "2025-01-01T00:00:00.000Z",
    }, {
      providerId: "official-market",
      ownerId: "team-1",
      teamSeats: 7,
      now: "2026-09-11T00:00:00.000Z",
      requiresReceipt: true,
    })).toMatchObject({
      status: "blocked",
      codes: expect.arrayContaining([
        "receipt-missing",
        "entitlement-expired",
        "seat-limit-exceeded",
      ]),
    });
  });
});
