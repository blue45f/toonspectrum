import { useCallback, useEffect, useRef, useState } from "react";
import { StudioVirtualSlotLeaseController, type StudioVirtualSlotLeaseSnapshot, type StudioVirtualSlotRoom } from "./studio-virtual-space-slot-lease";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

const EMPTY: StudioVirtualSlotLeaseSnapshot = { available: false, status: "idle", slotId: null, claimId: null, ownerSessionId: null, reason: null, occupied: [] };
const foreground = () => typeof document !== "undefined" && document.visibilityState !== "hidden" && document.hasFocus();

export function useStudioVirtualSpaceSlots({ room, manifest, enabled, point, moving, onApproach, publishedScope }: {
  readonly room: StudioVirtualSlotRoom | null | undefined;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly enabled: boolean;
  readonly publishedScope?: string;
  readonly point: StudioVirtualSpacePoint;
  readonly moving: boolean;
  readonly onApproach: (point: StudioVirtualSpacePoint) => void;
}) {
  const controller = useRef<StudioVirtualSlotLeaseController | null>(null);
  const approach = useRef(onApproach);
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [approachingSlotId, setApproachingSlotId] = useState<string | null>(null);
  const pendingSlot = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const invalidateRequest = useCallback(() => { requestGeneration.current += 1; return requestGeneration.current; }, []);
  const [foregroundSession, setForegroundSession] = useState(() => ({ active: foreground(), generation: 0 }));
  const foregroundAllowed = useRef(foregroundSession.active);
  const foregroundEpoch = useRef(0);
  useEffect(() => { approach.current = onApproach; }, [onApproach]);
  useEffect(() => {
    const blur = () => {
      // Fence callbacks synchronously, before React cleanup or an already queued server ACK.
      foregroundAllowed.current = false; foregroundEpoch.current += 1; invalidateRequest();
      pendingSlot.current = null;
      const owner = controller.current; controller.current = null;
      if (owner) void owner.close();
      setSnapshot(EMPTY); setApproachingSlotId(null);
      setForegroundSession((previous) => ({ active: false, generation: previous.generation + 1 }));
    };
    const focus = () => {
      const active = foreground(); foregroundAllowed.current = active;
      setForegroundSession((previous) => ({ ...previous, active }));
    };
    const visibility = () => { if (foreground()) focus(); else blur(); };
    window.addEventListener("blur", blur); window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", blur); window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [invalidateRequest]);
  useEffect(() => {
    invalidateRequest();
    setSnapshot(EMPTY); setApproachingSlotId(null); pendingSlot.current = null;
    if (!enabled || !foregroundSession.active || !room || typeof globalThis.crypto?.subtle?.digest !== "function") return;
    let disposed = false;
    const epoch = foregroundEpoch.current;
    let owner: StudioVirtualSlotLeaseController | undefined;
    let unsubscribe: (() => void) | undefined;
    void (publishedScope ? Promise.resolve(publishedScope) : crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(manifest)))
      .then((digest) => [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""))).then((revision) => {
      if (disposed || epoch !== foregroundEpoch.current || !foregroundAllowed.current || !foreground()) return;
      owner = new StudioVirtualSlotLeaseController(room, revision, (manifest.interactionSlots ?? []).map((slot) => slot.id));
      controller.current = owner;
      const refresh = () => { if (owner && !disposed && controller.current === owner && foregroundAllowed.current && foreground()) setSnapshot(owner.snapshot()); };
      unsubscribe = owner.subscribe(refresh); refresh();
    }).catch(() => { if (!disposed) setSnapshot(EMPTY); });
    return () => {
      disposed = true; invalidateRequest(); pendingSlot.current = null;
      unsubscribe?.(); if (owner) void owner.close();
      if (controller.current === owner) controller.current = null;
    };
  }, [enabled, room, manifest, invalidateRequest, foregroundSession.active, foregroundSession.generation, publishedScope]);

  const cancel = useCallback(() => {
    invalidateRequest(); pendingSlot.current = null; setApproachingSlotId(null);
    return controller.current?.release() ?? Promise.resolve();
  }, [invalidateRequest]);

  const requestSlot = useCallback((slotId: string): boolean => {
    const slot = manifest.interactionSlots?.find((item) => item.id === slotId);
    const owner = controller.current;
    if (!enabled || !foregroundAllowed.current || !foreground() || !slot || !owner?.snapshot().available) return false;
    // Finish any previous lease before movement; arrival, not the button, acquires the new slot.
    const generation = invalidateRequest();
    pendingSlot.current = null; setApproachingSlotId(null);
    void owner.release().then(() => {
      if (generation !== requestGeneration.current || controller.current !== owner || !foregroundAllowed.current || !foreground() || !owner.snapshot().available) return;
      approach.current(slot.approachPoint);
      if (generation !== requestGeneration.current || controller.current !== owner || !foregroundAllowed.current || !foreground()) return;
      pendingSlot.current = slotId; setApproachingSlotId(slotId);
    });
    return true;
  }, [enabled, manifest, invalidateRequest]);

  useEffect(() => {
    if (!enabled || !foregroundAllowed.current || !foreground() || !approachingSlotId || pendingSlot.current !== approachingSlotId) return;
    const slot = manifest.interactionSlots?.find((item) => item.id === approachingSlotId);
    if (!slot || !snapshot.available) { void cancel(); return; }
    if (!moving && Math.hypot(point.x - slot.approachPoint.x, point.y - slot.approachPoint.y) <= slot.radius) {
      pendingSlot.current = null; setApproachingSlotId(null);
      void controller.current?.acquire(slot.id);
    }
  }, [enabled, manifest, approachingSlotId, moving, point.x, point.y, snapshot.available, cancel]);

  useEffect(() => {
    if (snapshot.status !== "held" && snapshot.status !== "requesting") return;
    const slot = manifest.interactionSlots?.find((item) => item.id === snapshot.slotId);
    if (!enabled || moving || !slot || Math.hypot(point.x - slot.approachPoint.x, point.y - slot.approachPoint.y) > slot.radius + 4) void cancel();
  }, [enabled, manifest, moving, point.x, point.y, snapshot.slotId, snapshot.status, cancel]);

  useEffect(() => {
    if (!approachingSlotId) return;
    const timer = globalThis.setTimeout(() => { void cancel(); }, 30_000);
    return () => globalThis.clearTimeout(timer);
  }, [approachingSlotId, cancel]);

  return { snapshot, approachingSlotId, requestSlot, cancel };
}
