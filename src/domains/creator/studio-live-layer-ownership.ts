/**
 * Pure projection of live collaboration locks onto layer-navigator ownership UI.
 *
 * Locks use `page:{pageId}` / `element:{pageId}:{elementId}` (see
 * `studio-live-mutation-guard`). This module never claims or releases leases —
 * it only describes who currently holds a conflicting lock for display.
 */

import { studioLiveParticipantColor } from "./studio-live-canvas-overlay-model";
import {
  studioLiveElementResource,
  studioLivePageResource,
  type StudioLiveLockLike,
} from "./studio-live-mutation-guard";

import { parseStudioLiveLockResourceScope } from "@/lib/studio-live-lock-resource";


export const STUDIO_LIVE_LAYER_OWNERSHIP_VERSION =
  "live-layer-ownership-v1" as const;

export type StudioLiveLayerOwnershipKind =
  | "self"
  | "peer"
  | "page-peer"
  | "free";

export interface StudioLiveLayerOwnership {
  readonly kind: StudioLiveLayerOwnershipKind;
  /** Resource that produced this ownership (page or element). */
  readonly resource: string;
  readonly ownerSessionId: string | null;
  readonly ownerDisplayName: string | null;
  /** Participant colour used for badges/cursors. */
  readonly ownerColor: string | null;
  /** Human-readable short status for the layer row. */
  readonly statusLabel: string | null;
  /** When true the local editor should treat the layer as read-only for edits. */
  readonly blocksLocalEdit: boolean;
}

export const FREE_STUDIO_LIVE_LAYER_OWNERSHIP: StudioLiveLayerOwnership =
  Object.freeze({
    kind: "free",
    resource: "",
    ownerSessionId: null,
    ownerDisplayName: null,
    ownerColor: null,
    statusLabel: null,
    blocksLocalEdit: false,
  });

function isActiveLock(lock: StudioLiveLockLike, now: number): boolean {
  return Number.isFinite(lock.leaseUntil) && lock.leaseUntil > now;
}

function displayName(lock: StudioLiveLockLike): string {
  const name = lock.owner.displayName?.trim();
  return name && name.length > 0 ? name : "참가자";
}

/**
 * Resolve ownership for one layer/element on a page.
 * Page-level peer locks shadow every element on that page.
 */
export function resolveStudioLiveLayerOwnership(input: {
  readonly pageId: string;
  readonly elementId: string;
  readonly locks: readonly StudioLiveLockLike[];
  readonly selfSessionId: string;
  readonly now?: number;
}): StudioLiveLayerOwnership {
  const pageId = typeof input.pageId === "string" ? input.pageId.trim() : "";
  const elementId =
    typeof input.elementId === "string" ? input.elementId.trim() : "";
  const self =
    typeof input.selfSessionId === "string" ? input.selfSessionId.trim() : "";
  if (!pageId || !elementId) return FREE_STUDIO_LIVE_LAYER_OWNERSHIP;

  const now = input.now ?? Date.now();
  const pageResource = studioLivePageResource(pageId);
  const elementResource = studioLiveElementResource(pageId, elementId);

  let pagePeer: StudioLiveLockLike | null = null;
  let pageSelf: StudioLiveLockLike | null = null;
  let elementPeer: StudioLiveLockLike | null = null;
  let elementSelf: StudioLiveLockLike | null = null;

  for (const lock of input.locks) {
    if (!isActiveLock(lock, now)) continue;
    if (lock.resource === pageResource) {
      if (lock.owner.sessionId === self) pageSelf = lock;
      else pagePeer = lock;
      continue;
    }
    if (lock.resource === elementResource) {
      if (lock.owner.sessionId === self) elementSelf = lock;
      else elementPeer = lock;
    }
  }

  if (pagePeer) {
    const name = displayName(pagePeer);
    return Object.freeze({
      kind: "page-peer",
      resource: pagePeer.resource,
      ownerSessionId: pagePeer.owner.sessionId,
      ownerDisplayName: name,
      ownerColor: studioLiveParticipantColor(pagePeer.owner.sessionId),
      statusLabel: `${name} · 페이지 편집 중`,
      blocksLocalEdit: true,
    });
  }

  if (elementPeer) {
    const name = displayName(elementPeer);
    return Object.freeze({
      kind: "peer",
      resource: elementPeer.resource,
      ownerSessionId: elementPeer.owner.sessionId,
      ownerDisplayName: name,
      ownerColor: studioLiveParticipantColor(elementPeer.owner.sessionId),
      statusLabel: `${name} · 편집 중`,
      blocksLocalEdit: true,
    });
  }

  if (pageSelf || elementSelf) {
    const lock = elementSelf ?? pageSelf!;
    return Object.freeze({
      kind: "self",
      resource: lock.resource,
      ownerSessionId: self,
      ownerDisplayName: displayName(lock),
      ownerColor: studioLiveParticipantColor(self),
      statusLabel: "내가 편집 중",
      blocksLocalEdit: false,
    });
  }

  return FREE_STUDIO_LIVE_LAYER_OWNERSHIP;
}

/**
 * Build a dense ownership map for every navigator item on the active page.
 * Only non-free entries are included so empty live sessions stay allocation-light.
 */
export function buildStudioLiveLayerOwnershipByItemId(input: {
  readonly pageId: string;
  readonly elementIds: readonly string[];
  readonly locks: readonly StudioLiveLockLike[];
  readonly selfSessionId: string;
  readonly now?: number;
}): ReadonlyMap<string, StudioLiveLayerOwnership> {
  const map = new Map<string, StudioLiveLayerOwnership>();
  for (const elementId of input.elementIds) {
    const ownership = resolveStudioLiveLayerOwnership({
      pageId: input.pageId,
      elementId,
      locks: input.locks,
      selfSessionId: input.selfSessionId,
      now: input.now,
    });
    if (ownership.kind === "free") continue;
    map.set(elementId, ownership);
  }
  return map;
}

/** Active locks that affect the given page (for presence rails / debug). */
export function listStudioLiveLayerOwnershipLocksOnPage(
  locks: readonly StudioLiveLockLike[],
  pageId: string,
  now = Date.now(),
): readonly StudioLiveLockLike[] {
  const trimmed = typeof pageId === "string" ? pageId.trim() : "";
  if (!trimmed) return Object.freeze([]);
  const out: StudioLiveLockLike[] = [];
  for (const lock of locks) {
    if (!isActiveLock(lock, now)) continue;
    const scope = parseStudioLiveLockResourceScope(lock.resource);
    if (!scope || scope.pageId !== trimmed) continue;
    out.push(lock);
  }
  return Object.freeze(out);
}

/**
 * Deterministic lock-set fingerprint so UI can skip ownership map rebuilds when
 * the room re-emits an equal lease snapshot under a new array identity.
 */
export function fingerprintStudioLiveLocks(
  locks: readonly StudioLiveLockLike[],
): string {
  if (locks.length === 0) return "";
  const parts: string[] = [];
  for (const lock of locks) {
    const session = lock.owner?.sessionId ?? "";
    parts.push(`${lock.resource}\0${session}\0${lock.leaseUntil}`);
  }
  parts.sort();
  return parts.join("\n");
}

export interface StudioLiveSelectionOwnershipSummary {
  readonly selectedCount: number;
  readonly blockedCount: number;
  readonly selfCount: number;
  readonly freeCount: number;
  readonly blocksLocalEdit: boolean;
  /** Null when nothing is selected or every selected layer is free. */
  readonly bannerLabel: string | null;
  readonly primaryPeerName: string | null;
  readonly primaryKind: StudioLiveLayerOwnershipKind | null;
}

/**
 * Project dense ownership onto the current selection for inspector/navigator banners.
 * Free layers are counted even when absent from the dense map.
 */
export function summarizeStudioLiveSelectionOwnership(input: {
  readonly selectedIds: readonly string[];
  readonly ownershipByItemId: ReadonlyMap<string, StudioLiveLayerOwnership>;
}): StudioLiveSelectionOwnershipSummary {
  const selected = input.selectedIds.filter(
    (id) => typeof id === "string" && id.trim().length > 0,
  );
  if (selected.length === 0) {
    return Object.freeze({
      selectedCount: 0,
      blockedCount: 0,
      selfCount: 0,
      freeCount: 0,
      blocksLocalEdit: false,
      bannerLabel: null,
      primaryPeerName: null,
      primaryKind: null,
    });
  }

  let blockedCount = 0;
  let selfCount = 0;
  let freeCount = 0;
  let primaryPeerName: string | null = null;
  let primaryKind: StudioLiveLayerOwnershipKind | null = null;

  for (const id of selected) {
    const ownership = input.ownershipByItemId.get(id);
    if (!ownership || ownership.kind === "free") {
      freeCount += 1;
      continue;
    }
    if (ownership.kind === "self") {
      selfCount += 1;
      if (!primaryKind) primaryKind = "self";
      continue;
    }
    blockedCount += 1;
    if (ownership.blocksLocalEdit) {
      if (!primaryPeerName && ownership.ownerDisplayName) {
        primaryPeerName = ownership.ownerDisplayName;
      }
      if (!primaryKind || primaryKind === "self") {
        primaryKind = ownership.kind;
      }
    }
  }

  const blocksLocalEdit = blockedCount > 0;
  let bannerLabel: string | null = null;
  if (blocksLocalEdit) {
    if (blockedCount === selected.length && primaryPeerName) {
      bannerLabel =
        blockedCount === 1
          ? `${primaryPeerName} · 편집 중`
          : `${primaryPeerName} 외 ${blockedCount - 1}개 · 편집 중`;
    } else if (primaryPeerName) {
      bannerLabel = `선택 ${blockedCount}/${selected.length} · ${primaryPeerName} 편집 중`;
    } else {
      bannerLabel = `선택 ${blockedCount}/${selected.length} · 다른 참가자 편집 중`;
    }
  } else if (selfCount > 0) {
    bannerLabel =
      selfCount === selected.length
        ? "내가 편집 중"
        : `선택 ${selfCount}/${selected.length} · 내가 편집 중`;
  }

  return Object.freeze({
    selectedCount: selected.length,
    blockedCount,
    selfCount,
    freeCount,
    blocksLocalEdit,
    bannerLabel,
    primaryPeerName,
    primaryKind,
  });
}

/**
 * Rebuild ownership only when lock fingerprint or element set changes.
 * Returns the previous map reference when nothing material changed.
 */
export function reuseOrBuildStudioLiveLayerOwnershipByItemId(input: {
  readonly pageId: string;
  readonly elementIds: readonly string[];
  readonly locks: readonly StudioLiveLockLike[];
  readonly selfSessionId: string;
  readonly now?: number;
  readonly previous:
    | {
        readonly fingerprint: string;
        readonly pageId: string;
        readonly selfSessionId: string;
        readonly elementKey: string;
        readonly map: ReadonlyMap<string, StudioLiveLayerOwnership>;
      }
    | null;
}): {
  readonly fingerprint: string;
  readonly pageId: string;
  readonly selfSessionId: string;
  readonly elementKey: string;
  readonly map: ReadonlyMap<string, StudioLiveLayerOwnership>;
  readonly reused: boolean;
} {
  const pageId = typeof input.pageId === "string" ? input.pageId.trim() : "";
  const self =
    typeof input.selfSessionId === "string" ? input.selfSessionId.trim() : "";
  const fingerprint = fingerprintStudioLiveLocks(input.locks);
  const elementKey = input.elementIds.join("\0");
  if (
    input.previous
    && input.previous.fingerprint === fingerprint
    && input.previous.pageId === pageId
    && input.previous.selfSessionId === self
    && input.previous.elementKey === elementKey
  ) {
    return {
      fingerprint,
      pageId,
      selfSessionId: self,
      elementKey,
      map: input.previous.map,
      reused: true,
    };
  }
  const map = buildStudioLiveLayerOwnershipByItemId({
    pageId,
    elementIds: input.elementIds,
    locks: input.locks,
    selfSessionId: self,
    now: input.now,
  });
  return {
    fingerprint,
    pageId,
    selfSessionId: self,
    elementKey,
    map,
    reused: false,
  };
}
