import { describe, expect, it, vi } from "vitest";
import type { StudioLiveLockAcquireResult, StudioLiveLockLease, StudioLiveLockReleaseResult, StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveRoomEvent } from "../live/studio-live-collaboration-room";
import { StudioVirtualSlotLeaseController, parseStudioVirtualSlotResource, studioVirtualSlotResource, type StudioVirtualSlotRoom } from "./studio-virtual-space-slot-lease";

const REVISION = "a".repeat(64), OTHER = "b".repeat(64);
const alice: StudioLiveParticipant = { sessionId: "alice", displayName: "Alice", role: "editor" };
const bob: StudioLiveParticipant = { sessionId: "bob", displayName: "Bob", role: "editor" };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

class Room implements StudioVirtualSlotRoom {
  workId = "work-one";
  ready = true;
  authoritativeLockCapability: "fenced-v2" | null = "fenced-v2";
  readonly listeners = new Set<(event: StudioLiveRoomEvent) => void>();
  readonly locks = new Map<string, StudioLiveLockLease>();
  fence = 0;
  constructor(readonly participant = alice) {}
  getLocks() { return [...this.locks.values()]; }
  subscribe(listener: (event: StudioLiveRoomEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  emit() { for (const listener of this.listeners) listener({ type: "locks", locks: this.getLocks() }); }
  grant(resource: string): StudioLiveLockAcquireResult {
    const lock = { resource, claimId: `server-fence-${++this.fence}`, owner: this.participant, leaseUntil: 1_000_000 };
    this.locks.set(resource, lock); this.emit();
    return { status: "acquired", resource, requestId: "request", lock };
  }
  claimAuthoritativeLockAsync = vi.fn(async (resource: string, _renewLeaseId?: string): Promise<StudioLiveLockAcquireResult> => this.grant(resource));
  releaseLockAsync = vi.fn(async (resource: string): Promise<StudioLiveLockReleaseResult> => {
    const lock = this.locks.get(resource);
    this.locks.delete(resource); this.emit();
    return { status: "released", resource, requestId: "release", claimId: lock?.claimId ?? "absent", released: Boolean(lock) };
  });
}
function setup(room = new Room(), revision = REVISION) {
  let now = 0;
  const clearInterval = vi.fn();
  const controller = new StudioVirtualSlotLeaseController(room, revision, ["desk-left", "desk-right"], {
    now: () => now, setInterval: () => 1, clearInterval,
  });
  return { room, controller, clearInterval, time: (value: number) => { now = value; } };
}

describe("Virtual Studio authoritative interaction-slot leases", () => {
  it("separates slot identity by complete world revision and rejects ambiguous identifiers", () => {
    const resource = studioVirtualSlotResource(REVISION, "desk-left");
    expect(resource.length).toBeLessThanOrEqual(200);
    expect(parseStudioVirtualSlotResource(resource)).toEqual({ contentRevision: REVISION, slotId: "desk-left" });
    expect(studioVirtualSlotResource(OTHER, "desk-left")).not.toBe(resource);
    for (const invalid of ["", "../seat", "seat:other", "seat/other"]) expect(() => studioVirtualSlotResource(REVISION, invalid)).toThrow();
    expect(parseStudioVirtualSlotResource(`${resource}:extra`)).toBeNull();
    expect(() => setup(new Room(), "not-a-hash")).toThrow();
  });

  it.each(["local-or-signaling", "disconnected", "viewer"])("never requests a lease for %s", async (condition) => {
    const room = new Room(condition === "viewer" ? { ...alice, role: "viewer" } : alice);
    if (condition === "local-or-signaling") room.authoritativeLockCapability = null;
    if (condition === "disconnected") room.ready = false;
    const { controller } = setup(room);
    expect(await controller.acquire("desk-left")).toBe(false);
    expect(controller.snapshot().available).toBe(false);
    expect(room.claimAuthoritativeLockAsync).not.toHaveBeenCalled();
    await controller.close();
  });

  it("does not report held until a matching owner/resource server ACK arrives", async () => {
    const { controller, room } = setup();
    const pending = deferred<StudioLiveLockAcquireResult>();
    room.claimAuthoritativeLockAsync.mockImplementationOnce(() => pending.promise);
    const result = controller.acquire("desk-left"); await flush();
    expect(controller.snapshot()).toMatchObject({ status: "requesting", claimId: null });
    pending.resolve(room.grant(studioVirtualSlotResource(REVISION, "desk-left")));
    expect(await result).toBe(true);
    expect(controller.snapshot()).toMatchObject({ status: "held", ownerSessionId: "alice", claimId: "server-fence-1" });
    await controller.close();
  });

  it("renews the exact observed fence and accepts only a newly rotated fence", async () => {
    const { controller, room, time } = setup();
    await controller.acquire("desk-left");
    time(5_000); controller.refresh(); await flush();
    expect(room.claimAuthoritativeLockAsync).toHaveBeenLastCalledWith(studioVirtualSlotResource(REVISION, "desk-left"), "server-fence-1");
    expect(controller.snapshot().claimId).toBe("server-fence-2");
    const unchanged = room.getLocks()[0]!;
    room.claimAuthoritativeLockAsync.mockResolvedValueOnce({ status: "acquired", resource: unchanged.resource, requestId: "renew", lock: unchanged });
    time(10_000); controller.refresh(); await flush();
    expect(controller.snapshot()).toMatchObject({ status: "lost", claimId: null });
    await controller.close();
  });

  it("expires on monotonic time while renewal hangs even if the server wall deadline is far ahead", async () => {
    const { controller, room, time } = setup();
    await controller.acquire("desk-left");
    const renewal = deferred<StudioLiveLockAcquireResult>();
    room.claimAuthoritativeLockAsync.mockImplementationOnce(() => renewal.promise);
    time(5_000); controller.refresh(); await flush();
    time(15_000); controller.refresh();
    expect(controller.snapshot()).toMatchObject({ status: "lost", claimId: null });
    renewal.resolve(room.grant(studioVirtualSlotResource(REVISION, "desk-left"))); await flush();
    expect(room.releaseLockAsync).toHaveBeenCalled();
    expect(controller.snapshot().status).toBe("lost");
    await controller.close();
  });

  it("cannot revive a cancelled pending acquisition and releases its eventual grant", async () => {
    const { controller, room } = setup();
    const pending = deferred<StudioLiveLockAcquireResult>();
    room.claimAuthoritativeLockAsync.mockImplementationOnce(() => pending.promise);
    const acquiring = controller.acquire("desk-left"); await flush();
    const releasing = controller.release();
    pending.resolve(room.grant(studioVirtualSlotResource(REVISION, "desk-left")));
    expect(await acquiring).toBe(false); await releasing;
    expect(controller.snapshot()).toMatchObject({ status: "idle", claimId: null, slotId: null });
    expect(room.getLocks()).toEqual([]);
    await controller.close();
  });

  it("a replacement controller cannot inherit or release an old lifecycle's pending grant", async () => {
    const first = setup(); const pending = deferred<StudioLiveLockAcquireResult>();
    first.room.claimAuthoritativeLockAsync.mockImplementationOnce(() => pending.promise);
    const acquiring = first.controller.acquire("desk-left"); await flush();
    const closing = first.controller.close();
    const replacement = setup(first.room);
    expect(await replacement.controller.acquire("desk-left")).toBe(false);
    expect(replacement.controller.snapshot().reason).toBe("lifecycle_busy");
    pending.resolve(first.room.grant(studioVirtualSlotResource(REVISION, "desk-left")));
    await acquiring; await closing;
    expect(await replacement.controller.acquire("desk-left")).toBe(true);
    expect(replacement.controller.snapshot().claimId).toBe("server-fence-2");
    await replacement.controller.close();
  });

  it.each(["disconnect", "provider", "scope"])("revokes held ownership immediately on %s change", async (change) => {
    const { controller, room } = setup(); await controller.acquire("desk-left");
    if (change === "disconnect") room.ready = false;
    if (change === "provider") room.authoritativeLockCapability = null;
    if (change === "scope") room.workId = "another-work";
    room.emit();
    expect(controller.snapshot()).toMatchObject({ status: "lost", claimId: null, available: false });
    await controller.close();
  });

  it("releases the previous seat before switching and only lists this world's allowed slots", async () => {
    const { controller, room } = setup(); await controller.acquire("desk-left");
    const previous = studioVirtualSlotResource(REVISION, "desk-left");
    await controller.acquire("desk-right");
    expect(room.releaseLockAsync).toHaveBeenCalledWith(previous);
    room.locks.set("other", { resource: studioVirtualSlotResource(OTHER, "desk-left"), owner: bob, claimId: "other-world", leaseUntil: 1_000_000 });
    expect(controller.snapshot().occupied.map((item) => item.slotId)).toEqual(["desk-right"]);
    expect(await controller.acquire("unregistered-seat")).toBe(false);
    await controller.close();
  });

  it("never releases another owner's replacement lease and removes observers on close", async () => {
    const { controller, room, clearInterval } = setup(); await controller.acquire("desk-left");
    const resource = studioVirtualSlotResource(REVISION, "desk-left");
    room.locks.set(resource, { resource, claimId: "bob-fence", owner: bob, leaseUntil: 1_000_000 }); room.emit(); await flush();
    expect(controller.snapshot()).toMatchObject({ status: "lost", claimId: null });
    expect(room.releaseLockAsync).not.toHaveBeenCalled();
    await controller.close(); await controller.close();
    expect(room.listeners.size).toBe(0); expect(clearInterval).toHaveBeenCalledOnce();
    expect(await controller.acquire("desk-left")).toBe(false);
  });

  it("relinquishes local ownership even when a disconnected release rejects", async () => {
    const { controller, room } = setup(); await controller.acquire("desk-left");
    room.releaseLockAsync.mockRejectedValueOnce(new Error("disconnected"));
    await expect(controller.release()).resolves.toBeUndefined();
    expect(controller.snapshot()).toMatchObject({ status: "idle", claimId: null });
    await controller.close();
  });

  it("does not release a same-named resource after the room identity changes", async () => {
    const { controller, room } = setup(); await controller.acquire("desk-left");
    room.workId = "another-work"; room.emit();
    await controller.close();
    expect(controller.snapshot()).toMatchObject({ available: false, claimId: null });
    expect(room.releaseLockAsync).not.toHaveBeenCalled();
  });
});
