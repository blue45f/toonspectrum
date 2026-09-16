import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CreatorMarketplaceInstallReceipt,
  CreatorMarketplaceInstallReceiptState,
} from "@/shared/lib/creator-marketplace-install-receipt";
import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceRecord,
} from "@/shared/lib/creator-marketplace-resource-contract";

import {
  CREATOR_MARKETPLACE_INSTALL_RECEIPT_EVENT,
  CREATOR_MARKETPLACE_INSTALL_RECEIPT_STORAGE_KEY,
  isCreatorMarketplaceInstallReceiptKind,
  readCreatorMarketplaceInstallReceipt,
  resolveCreatorMarketplaceInstallReceiptState,
} from "@/shared/lib/creator-marketplace-install-receipt";
import { creatorMarketplaceStudioPackId } from "@/shared/lib/creator-marketplace-package-identity";

export interface MarketDeviceInstallTarget {
  readonly logicalPackId: string;
  readonly kind: CreatorMarketplaceResourceKind;
  readonly resourceVersion: string;
  readonly manifestHash: string;
}

export interface MarketDeviceInstallSnapshot {
  readonly trackable: boolean;
  readonly logicalPackId: string;
  readonly receipt: CreatorMarketplaceInstallReceipt | null;
  readonly state: CreatorMarketplaceInstallReceiptState;
}

/**
 * Market pages must not import the heavyweight Studio repositories merely to paint a badge.
 * The product installer publishes this bounded receipt only after an exact local commit, and
 * removes it only after an exact uninstall. It is a same-browser hint, never entitlement authority.
 */
export function marketDeviceInstallTargetFromRecord(
  record: CreatorMarketplaceResourceRecord,
): MarketDeviceInstallTarget {
  return {
    logicalPackId: creatorMarketplaceStudioPackId(record),
    kind: record.kind,
    resourceVersion: record.resourceVersion,
    manifestHash: record.manifestHash,
  };
}

export function useMarketDeviceInstall(
  source: CreatorMarketplaceResourceRecord | MarketDeviceInstallTarget,
): MarketDeviceInstallSnapshot {
  const target = useMemo<MarketDeviceInstallTarget>(
    () => "logicalPackId" in source
      ? source
      : marketDeviceInstallTargetFromRecord(source),
    [source],
  );
  const { logicalPackId } = target;
  const trackable = isCreatorMarketplaceInstallReceiptKind(target.kind);
  const readReceipt = useCallback(
    () => trackable
      ? readCreatorMarketplaceInstallReceipt(logicalPackId)
      : null,
    [logicalPackId, trackable],
  );
  const [storedSnapshot, setStoredSnapshot] = useState<Readonly<{
    logicalPackId: string;
    receipt: CreatorMarketplaceInstallReceipt | null;
  }>>(() => ({
    logicalPackId,
    receipt: readReceipt(),
  }));
  const receipt = storedSnapshot.logicalPackId === logicalPackId
    ? storedSnapshot.receipt
    : readReceipt();

  useEffect(() => {
    const refresh = () => setStoredSnapshot({
      logicalPackId,
      receipt: readReceipt(),
    });
    refresh();
    if (!trackable) return undefined;

    const onStorage = (event: StorageEvent) => {
      if (
        event.key === null
        || event.key === CREATOR_MARKETPLACE_INSTALL_RECEIPT_STORAGE_KEY
      ) refresh();
    };
    const onReceipt = (event: Event) => {
      const eventPackId = (event as CustomEvent<{ logicalPackId?: unknown }>).detail
        ?.logicalPackId;
      if (eventPackId === undefined || eventPackId === logicalPackId) refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(CREATOR_MARKETPLACE_INSTALL_RECEIPT_EVENT, onReceipt);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CREATOR_MARKETPLACE_INSTALL_RECEIPT_EVENT, onReceipt);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [logicalPackId, readReceipt, trackable]);

  return {
    trackable,
    logicalPackId,
    receipt,
    state: resolveCreatorMarketplaceInstallReceiptState(target, receipt),
  };
}
