// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useMarketDeviceInstall } from "./use-market-device-install";

import {
  CREATOR_MARKETPLACE_INSTALL_RECEIPT_STORAGE_KEY,
  removeCreatorMarketplaceInstallReceipt,
  writeCreatorMarketplaceInstallReceipt,
} from "@/shared/lib/creator-marketplace-install-receipt";

const TARGET = {
  logicalPackId: `community:${"a".repeat(64)}`,
  kind: "brush" as const,
  resourceVersion: "2.0.0",
  manifestHash: "b".repeat(64),
};

const OTHER_TARGET = {
  ...TARGET,
  logicalPackId: `community:${"c".repeat(64)}`,
};

afterEach(() => {
  cleanup();
  localStorage.removeItem(CREATOR_MARKETPLACE_INSTALL_RECEIPT_STORAGE_KEY);
});

describe("useMarketDeviceInstall", () => {
  it("reacts to same-document install and uninstall receipts", async () => {
    const { result } = renderHook(() => useMarketDeviceInstall(TARGET));
    expect(result.current.state).toBe("no-verified-receipt");

    act(() => {
      expect(writeCreatorMarketplaceInstallReceipt({
        logicalPackId: TARGET.logicalPackId,
        packageVersion: TARGET.resourceVersion,
        packageFingerprint: TARGET.manifestHash,
        kind: TARGET.kind,
        installedAt: Date.now(),
      })).toBe(true);
    });
    await waitFor(() => expect(result.current.state).toBe("installed-current"));

    act(() => {
      expect(removeCreatorMarketplaceInstallReceipt(TARGET.logicalPackId)).toBe(true);
    });
    await waitFor(() => expect(result.current.state).toBe("no-verified-receipt"));
  });

  it("never reuses an exact-looking receipt after the logical package changes", async () => {
    expect(writeCreatorMarketplaceInstallReceipt({
      logicalPackId: TARGET.logicalPackId,
      packageVersion: TARGET.resourceVersion,
      packageFingerprint: TARGET.manifestHash,
      kind: TARGET.kind,
      installedAt: Date.now(),
    })).toBe(true);
    const { result, rerender } = renderHook(
      ({ source }) => useMarketDeviceInstall(source),
      { initialProps: { source: TARGET } },
    );
    expect(result.current.state).toBe("installed-current");

    rerender({ source: OTHER_TARGET });
    await waitFor(() => {
      expect(result.current.logicalPackId).toBe(OTHER_TARGET.logicalPackId);
      expect(result.current.receipt).toBeNull();
      expect(result.current.state).toBe("no-verified-receipt");
    });
  });

  it("ignores local installation receipts for catalog-only resource kinds", () => {
    const { result } = renderHook(() => useMarketDeviceInstall({
      ...TARGET,
      kind: "template" as const,
    }));
    expect(result.current.trackable).toBe(false);
    expect(result.current.receipt).toBeNull();
    expect(result.current.state).toBe("no-verified-receipt");
  });
});
