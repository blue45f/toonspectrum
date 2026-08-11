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
