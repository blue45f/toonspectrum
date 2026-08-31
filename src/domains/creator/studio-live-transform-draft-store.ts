/**
 * External store for the exact, model-backed half of a live draw transform.
 *
 * A separately certified renderer may stay on a retained node. Current admitted ink engines all
 * contain absolute-pixel spacing, quantization or topology rules and therefore use this exact
 * lane even for uniform scale/rotation. The store publishes one transformed DrawEl to an isolated
 * React-Konva root at most once per animation frame without putting that draft into
 * document/history/CRDT state.
 */

import { canonicalJson } from "@toonspectrum/studio-project-model";

import type { DrawEl, El } from "./studio-element-model";
import type { StudioLiveTransformClipRect } from "./studio-live-transform-clip-tracking";

export interface StudioLiveTransformDraftSnapshot {
  readonly scope: string;
  readonly element: DrawEl;
  readonly clip: StudioLiveTransformClipRect | null;
  readonly phase: "active" | "handoff";
  readonly revision: number;
}

export interface StudioLiveTransformDraftPresentation {
  readonly element: DrawEl;
  readonly clip: StudioLiveTransformClipRect | null;
}

export interface StudioLiveTransformDraftClaim {
  readonly generation: number;
  readonly scope: string;
  readonly elementId: string;
  /** True only after this exact generation no longer owns the store. */
  readonly isReleased: () => boolean;
  /** Replace the latest exact preview. This is called from the rAF renderer seam, never pointermove. */
  readonly present: (presentation: StudioLiveTransformDraftPresentation) => void;
  /** Remove an active preview immediately. False retains a handoff whose source recovery failed. */
  readonly clear: () => boolean;
  /** End this generation. False keeps a failed handoff owned and retryable. */
  readonly release: () => boolean;
  /**
   * Retain the terminal preview until the authoritative document renders the same element.
   * `onRelease` restores the hidden source wrapper after receipt or timeout.
   */
  readonly handoff: (expected: DrawEl, onRelease: () => void) => boolean;
}

export interface StudioLiveTransformDraftStore {
  readonly getSnapshot: () => StudioLiveTransformDraftSnapshot | null;
  readonly subscribe: (listener: () => void) => () => void;
  /** One generation owns mutation rights; stale cleanup from an older gesture becomes a no-op. */
  readonly claim: (scope: string, elementId: string) => StudioLiveTransformDraftClaim | null;
  /** Called after an authoritative document render; clears only an exact terminal receipt. */
  readonly acknowledgeAuthoritative: (scope: string, elements: readonly El[]) => boolean;
  /** Release an active/handoff owner only when it belongs to this document scope. */
  readonly releaseScope: (scope: string) => boolean;
}

export interface CreateStudioLiveTransformDraftStoreOptions {
  /** Safety valve for an interrupted/unmounted authoritative render. */
  readonly handoffTimeoutMs?: number;
  readonly scheduleTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly cancelTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
}

const DEFAULT_HANDOFF_TIMEOUT_MS = 3_000;

/** Model payloads are JSON-safe; equality is evaluated only at pointer-up receipt, not per frame. */
export function studioLiveTransformDraftReceipt(element: DrawEl): string {
  // CRDT restoration materializes fields in schema order rather than preserving the producer's
  // insertion order. Canonical JSON makes a semantic payload receipt independent of that order,
  // including nested records, while keeping arrays ordered because sample order is meaningful.
  return canonicalJson(element);
}

export function createStudioLiveTransformDraftStore(
  options: CreateStudioLiveTransformDraftStoreOptions = {},
): StudioLiveTransformDraftStore {
  const listeners = new Set<() => void>();
  const scheduleTimeout = options.scheduleTimeout ?? globalThis.setTimeout.bind(globalThis);
  const cancelTimeout = options.cancelTimeout ?? globalThis.clearTimeout.bind(globalThis);
  const handoffTimeoutMs = options.handoffTimeoutMs ?? DEFAULT_HANDOFF_TIMEOUT_MS;
  let snapshot: StudioLiveTransformDraftSnapshot | null = null;
  let revision = 0;
  let expectedReceipt: string | null = null;
  let releaseSource: (() => void) | null = null;
  let releaseSourceInProgress = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let nextGeneration = 0;
  let ownerGeneration: number | null = null;
  let ownerScope: string | null = null;
  let ownerElementId: string | null = null;

  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // A broken observer cannot strand a renderer claim. React will retry from getSnapshot.
      }
    }
  };

  const cancelHandoffTimeout = (): void => {
    if (timeoutHandle === null) return;
    // Detach ownership before invoking an injectable host timer. Even a throwing canceller cannot
    // make a later release skip the source-restoration callback or retain a stale handle forever.
    const handle = timeoutHandle;
    timeoutHandle = null;
    try {
      cancelTimeout(handle);
    } catch {
      // The generation guard makes a late timer callback harmless after owner state is cleared.
    }
  };

  const releaseHandoff = (): boolean => {
    const callback = releaseSource;
    if (callback) {
      if (releaseSourceInProgress) return false;
      releaseSourceInProgress = true;
      try {
        callback();
      } catch {
        // The exact draft remains the only proven raster authority. Keep every handoff token so a
        // later authoritative receipt, scope release, timeout or superseding claim can retry.
        return false;
      } finally {
        releaseSourceInProgress = false;
      }
    }
    releaseSource = null;
    expectedReceipt = null;
    cancelHandoffTimeout();
    return true;
  };

  const clearOwned = (): boolean => {
    const hadSnapshot = snapshot !== null;
    if (!releaseHandoff()) return false;
    snapshot = null;
    ownerGeneration = null;
    ownerScope = null;
    ownerElementId = null;
    if (hadSnapshot) notify();
    return true;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    claim: (scope, elementId) => {
      if (!scope) return null;
      if (ownerGeneration !== null && snapshot?.phase !== "handoff") return null;
      // A newer user gesture may start before React acknowledges the previous commit. Its exact
      // draft supersedes that already-durable handoff and restores the old hidden wrapper first.
      if (ownerGeneration !== null && !clearOwned()) return null;
      // A release subscriber may synchronously claim the now-restored store. Preserve that newer
      // generation instead of overwriting it from this older supersession attempt.
      if (ownerGeneration !== null) return null;
      const generation = ++nextGeneration;
      ownerGeneration = generation;
      ownerScope = scope;
      ownerElementId = elementId;
      const owns = (): boolean =>
        ownerGeneration === generation
        && ownerScope === scope
        && ownerElementId === elementId;
      const clear = (): boolean => {
        if (!owns()) return false;
        const hadSnapshot = snapshot !== null;
        if (!releaseHandoff()) return false;
        snapshot = null;
        if (hadSnapshot) notify();
        return true;
      };
      const releaseClaim = (): boolean => {
        if (!owns()) return false;
        return clearOwned();
      };
      return {
        generation,
        scope,
        elementId,
        isReleased: () => !owns(),
        present: ({ element, clip }) => {
          if (!owns() || element.id !== elementId) return;
          if (!releaseHandoff()) return;
          snapshot = {
            scope,
            element,
            clip,
            phase: "active",
            revision: ++revision,
          };
          notify();
        },
        clear,
        release: releaseClaim,
        handoff: (expected, onRelease) => {
          let terminalReceipt: string;
          if (
            !owns()
            || expected.id !== elementId
            || snapshot === null
            || snapshot.element.id !== expected.id
          ) {
            try {
              onRelease();
            } catch {
              // No handoff tokens exist on this rejected path; the caller owns fallback recovery.
            }
            return false;
          }
          // The normal path hands off the exact object just published by exactPresentation. Avoid
          // serializing a potentially 1.8MB, 100k-sample payload merely to compare it with itself;
          // a non-identical test/adapter candidate still receives semantic canonical validation.
          if (snapshot.element === expected) {
            terminalReceipt = studioLiveTransformDraftReceipt(expected);
          } else {
            const snapshotReceipt = studioLiveTransformDraftReceipt(snapshot.element);
            terminalReceipt = studioLiveTransformDraftReceipt(expected);
            if (snapshotReceipt !== terminalReceipt) {
              try {
                onRelease();
              } catch {
                // No handoff tokens exist on this rejected path; the caller owns fallback recovery.
              }
              return false;
            }
          }
          if (!releaseHandoff()) return false;
          expectedReceipt = terminalReceipt;
          releaseSource = onRelease;
          snapshot = { ...snapshot, phase: "handoff", revision: ++revision };
          let scheduled: ReturnType<typeof setTimeout>;
          try {
            scheduled = scheduleTimeout(releaseClaim, handoffTimeoutMs);
          } catch {
            // A terminal preview without either an authoritative receipt or a safety timer may
            // never retain the hidden source. Roll back synchronously and report no handoff.
            clearOwned();
            return false;
          }
          // A hostile/test scheduler may invoke the callback synchronously before returning.
          // Do not resurrect its handle after that callback already released this generation.
          if (!owns() || snapshot?.phase !== "handoff") {
            try {
              cancelTimeout(scheduled);
            } catch {
              // The generation is already released; a late callback is a no-op.
            }
            return false;
          }
          timeoutHandle = scheduled;
          notify();
          return true;
        },
      };
    },
    acknowledgeAuthoritative: (scope, elements) => {
      if (
        snapshot?.phase !== "handoff"
        || snapshot.scope !== scope
        || ownerScope !== scope
        || expectedReceipt === null
      ) {
        return false;
      }
      const authoritative = elements.find((element) => element.id === snapshot?.element.id);
      if (
        authoritative?.type !== "draw"
        || studioLiveTransformDraftReceipt(authoritative) !== expectedReceipt
      ) {
        return false;
      }
      return clearOwned();
    },
    releaseScope: (scope) => {
      if (ownerScope !== scope) return false;
      return clearOwned();
    },
  };
}
