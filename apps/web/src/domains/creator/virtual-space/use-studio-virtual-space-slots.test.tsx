// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioLiveLockAcquireResult, StudioLiveLockLease, StudioLiveLockReleaseResult } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveRoomEvent } from "../live/studio-live-collaboration-room";
import type { StudioVirtualSlotRoom } from "./studio-virtual-space-slot-lease";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import { useStudioVirtualSpaceSlots } from "./use-studio-virtual-space-slots";

type Props = Parameters<typeof useStudioVirtualSpaceSlots>[0];
const slot = DEFAULT_STUDIO_WORLD_MANIFEST.interactionSlots![0]!;
const second = DEFAULT_STUDIO_WORLD_MANIFEST.interactionSlots![1]!;
class Room implements StudioVirtualSlotRoom {
  workId = "work-one";
  ready = true;
  authoritativeLockCapability: "fenced-v2" | null = "fenced-v2";
  participant = { sessionId: "alice", displayName: "Alice", role: "editor" as const };
  listeners = new Set<(event: StudioLiveRoomEvent) => void>();
  locks = new Map<string, StudioLiveLockLease>();
  fence = 0;
  getLocks() { return [...this.locks.values()]; }
  subscribe(listener: (event: StudioLiveRoomEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  emit() { for (const listener of this.listeners) listener({ type: "locks", locks: this.getLocks() }); }
  grant(resource: string): StudioLiveLockAcquireResult {
    const lock = { resource, claimId: `fence-${++this.fence}`, owner: this.participant, leaseUntil: Date.now() + 15_000 };
    this.locks.set(resource, lock); this.emit();
    return { status: "acquired", resource, requestId: "request", lock };
  }
  claimAuthoritativeLockAsync = vi.fn(async (resource: string): Promise<StudioLiveLockAcquireResult> => this.grant(resource));
  releaseLockAsync = vi.fn(async (resource: string): Promise<StudioLiveLockReleaseResult> => {
    const lock = this.locks.get(resource); this.locks.delete(resource); this.emit();
    return { status: "released", resource, claimId: lock?.claimId ?? "absent", requestId: "release", released: Boolean(lock) };
  });
}
function props(room = new Room()): Props & { room: Room } {
  return { room, manifest: DEFAULT_STUDIO_WORLD_MANIFEST, enabled: true, point: { x: 425, y: 500 }, moving: false, onApproach: vi.fn() };
}
async function ready(hook: { result: { current: ReturnType<typeof useStudioVirtualSpaceSlots> } }) {
  await waitFor(() => expect(hook.result.current.snapshot.available).toBe(true));
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); vi.spyOn(document, "hasFocus").mockReturnValue(true); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("shared workspace hook arrival and ownership lifetime", () => {
  it("does not claim from rendering or navigation; claims once after arrival and server confirmation", async () => {
    const p = props(); const hook = renderHook(useStudioVirtualSpaceSlots, { initialProps: p }); await ready(hook);
    expect(p.room.claimAuthoritativeLockAsync).not.toHaveBeenCalled();
    await act(async () => { expect(hook.result.current.requestSlot(slot.id)).toBe(true); });
    expect(p.onApproach).toHaveBeenCalledExactlyOnceWith(slot.approachPoint);
    expect(p.room.claimAuthoritativeLockAsync).not.toHaveBeenCalled();
    hook.rerender({ ...p, point: slot.approachPoint, moving: true });
    expect(p.room.claimAuthoritativeLockAsync).not.toHaveBeenCalled();
    hook.rerender({ ...p, point: slot.approachPoint });
    await waitFor(() => expect(hook.result.current.snapshot.status).toBe("held"));
    hook.rerender({ ...p, point: { ...slot.approachPoint } });
    expect(p.room.claimAuthoritativeLockAsync).toHaveBeenCalledOnce();
    expect(hook.result.current.snapshot.ownerSessionId).toBe("alice");
  });

  it("cancels a deferred approach before it can move the user and only starts the newest selection", async () => {
    const p = props(); const hook = renderHook(useStudioVirtualSpaceSlots, { initialProps: p }); await ready(hook);
    await act(async () => { hook.result.current.requestSlot(slot.id); await hook.result.current.cancel(); });
    expect(p.onApproach).not.toHaveBeenCalled();
    await act(async () => { hook.result.current.requestSlot(slot.id); hook.result.current.requestSlot(second.id); });
    expect(p.onApproach).toHaveBeenCalledExactlyOnceWith(second.approachPoint);
    expect(hook.result.current.approachingSlotId).toBe(second.id);
    expect(p.room.claimAuthoritativeLockAsync).not.toHaveBeenCalled();
  });

  it.each(["movement", "focus", "world", "room"])("releases a held lease on %s change", async (change) => {
    const p = { ...props(), point: slot.approachPoint };
    const hook = renderHook((value: Props) => useStudioVirtualSpaceSlots(value), { initialProps: p }); await ready(hook);
    await act(async () => { hook.result.current.requestSlot(slot.id); });
    await waitFor(() => expect(hook.result.current.snapshot.status).toBe("held"));
    hook.rerender(change === "movement" ? { ...p, moving: true }
      : change === "focus" ? { ...p, enabled: false }
        : change === "world" ? { ...p, manifest: { ...p.manifest, version: p.manifest.version + 1 } }
          : { ...p, room: new Room() });
    await waitFor(() => expect(p.room.releaseLockAsync).toHaveBeenCalledOnce());
    expect(hook.result.current.snapshot.status).not.toBe("held");
    expect(p.room.locks.size).toBe(0);
  });

  it("releases a late server grant after movement while acquisition was pending", async () => {
    const p = { ...props(), point: slot.approachPoint };
    let resolve!: (value: StudioLiveLockAcquireResult) => void;
    p.room.claimAuthoritativeLockAsync.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const hook = renderHook(useStudioVirtualSpaceSlots, { initialProps: p }); await ready(hook);
    await act(async () => { hook.result.current.requestSlot(slot.id); });
    await waitFor(() => expect(hook.result.current.snapshot.status).toBe("requesting"));
    const resource = p.room.claimAuthoritativeLockAsync.mock.calls[0]![0];
    hook.rerender({ ...p, moving: true });
    expect(hook.result.current.snapshot.status).toBe("idle");
    await act(async () => { resolve(p.room.grant(resource)); await flush(); });
    expect(hook.result.current.snapshot.status).toBe("idle");
    expect(p.room.locks.size).toBe(0);
    expect(p.room.releaseLockAsync).toHaveBeenCalledExactlyOnceWith(resource);
  });

  it("fails closed for unsupported authority and an unavailable digest", async () => {
    const p = props(); p.room.authoritativeLockCapability = null;
    const hook = renderHook(useStudioVirtualSpaceSlots, { initialProps: p });
    await waitFor(() => expect(p.room.listeners.size).toBe(1));
    expect(hook.result.current.requestSlot(slot.id)).toBe(false);
    expect(p.room.claimAuthoritativeLockAsync).not.toHaveBeenCalled();
    hook.unmount(); vi.stubGlobal("crypto", {});
    const insecure = renderHook(useStudioVirtualSpaceSlots, { initialProps: props() });
    expect(insecure.result.current.snapshot.available).toBe(false);
    expect(insecure.result.current.requestSlot(slot.id)).toBe(false);
  });

  it("keeps one subscription in strict mode and removes it on unmount without acquiring", async () => {
    const p = props(); const hook = renderHook(useStudioVirtualSpaceSlots, {
      initialProps: p, wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    }); await ready(hook);
    expect(p.room.listeners.size).toBe(1); hook.unmount();
    expect(p.room.listeners.size).toBe(0);
    expect(p.room.claimAuthoritativeLockAsync).not.toHaveBeenCalled();
  });

  it("fences a pending server grant immediately on blur, including the same microtask, and never restores it on refocus", async () => {
    const p = { ...props(), point: slot.approachPoint };
    let resolve!: (value: StudioLiveLockAcquireResult) => void;
    p.room.claimAuthoritativeLockAsync.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const hook = renderHook(useStudioVirtualSpaceSlots, { initialProps: p }); await ready(hook);
    await act(async () => { hook.result.current.requestSlot(slot.id); });
    await waitFor(() => expect(hook.result.current.snapshot.status).toBe("requesting"));
    const resource = p.room.claimAuthoritativeLockAsync.mock.calls[0]![0];
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      expect(hook.result.current.requestSlot(slot.id)).toBe(false);
      resolve(p.room.grant(resource)); await flush();
    });
    expect(hook.result.current.snapshot).toMatchObject({ available: false, claimId: null });
    expect(p.room.releaseLockAsync).toHaveBeenCalledExactlyOnceWith(resource);
    act(() => { window.dispatchEvent(new Event("focus")); }); await ready(hook);
    expect(hook.result.current.snapshot.status).toBe("idle"); expect(p.room.claimAuthoritativeLockAsync).toHaveBeenCalledOnce();
  });

  it("releases a held slot on hidden visibility and creates an idle foreground session on return", async () => {
    const p = { ...props(), point: slot.approachPoint };
    const hook = renderHook(useStudioVirtualSpaceSlots, { initialProps: p }); await ready(hook);
    await act(async () => { hook.result.current.requestSlot(slot.id); });
    await waitFor(() => expect(hook.result.current.snapshot.status).toBe("held"));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await flush(); });
    expect(hook.result.current.snapshot.available).toBe(false); expect(p.room.releaseLockAsync).toHaveBeenCalledOnce();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); }); await ready(hook);
    expect(hook.result.current.snapshot.status).toBe("idle"); expect(hook.result.current.approachingSlotId).toBeNull();
  });

  it("rejects an old pending digest after rapid blur/focus before the fresh digest completes", async () => {
    const digests: Array<(value: ArrayBuffer) => void> = [];
    const digest = vi.fn(() => new Promise<ArrayBuffer>((resolve) => { digests.push(resolve); }));
    vi.stubGlobal("crypto", { subtle: { digest } });
    const p = props(); const subscribe = vi.spyOn(p.room, "subscribe");
    const hook = renderHook(useStudioVirtualSpaceSlots, { initialProps: p });
    expect(digests).toHaveLength(1);
    await act(async () => { window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("focus")); digests[0]!(new ArrayBuffer(32)); await flush(); });
    expect(subscribe).not.toHaveBeenCalled(); expect(hook.result.current.snapshot.available).toBe(false);
    expect(digests).toHaveLength(2);
    await act(async () => { digests[1]!(new ArrayBuffer(32)); await flush(); });
    await ready(hook); expect(subscribe).toHaveBeenCalledOnce(); expect(p.room.claimAuthoritativeLockAsync).not.toHaveBeenCalled();
  });

  it("cancels an approach queued before blur and resumes only after another explicit selection", async () => {
    const p = props(); const hook = renderHook(useStudioVirtualSpaceSlots, { initialProps: p }); await ready(hook);
    await act(async () => { hook.result.current.requestSlot(slot.id); window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("focus")); await flush(); });
    await ready(hook); expect(p.onApproach).not.toHaveBeenCalled(); expect(hook.result.current.approachingSlotId).toBeNull();
    await act(async () => { hook.result.current.requestSlot(slot.id); });
    expect(p.onApproach).toHaveBeenCalledExactlyOnceWith(slot.approachPoint);
    expect(p.room.claimAuthoritativeLockAsync).not.toHaveBeenCalled();
  });
});
