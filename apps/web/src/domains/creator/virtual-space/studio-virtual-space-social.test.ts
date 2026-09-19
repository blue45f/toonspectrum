import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import {
  parseStudioVirtualSpaceSocialPacket,
  StudioVirtualSpaceSocialController,
  STUDIO_VIRTUAL_SPACE_SOCIAL_MAX_BYTES,
  STUDIO_VIRTUAL_SPACE_SOCIAL_TTL_MS,
  type StudioVirtualSpaceSocialAction,
  type StudioVirtualSpaceSocialPacket,
  type StudioVirtualSpaceSocialWorld,
} from "./studio-virtual-space-social";

const A: StudioLiveParticipant = { sessionId: "a", displayName: "Alice", role: "editor" };
const B: StudioLiveParticipant = { sessionId: "b", displayName: "Bob", role: "editor" };
const C: StudioLiveParticipant = { sessionId: "c", displayName: "Cleo", role: "editor" };
const WORLD = { worldId: "studio", contentRevision: "layout-7" };
interface Message { sender: StudioLiveParticipant; target: string; raw: string }

class PairedPorts {
  readonly listeners = new Map<string, (sender: StudioLiveParticipant, raw: string) => void>();
  readonly queue: Message[] = [];
  readonly history: Message[] = [];
  participants = [A, B];
  failKind: string | null = null;
  synchronous = false;

  port(self: StudioLiveParticipant): StudioLiveDirectPort {
    return {
      getPeers: () => this.participants.filter((peer) => peer.sessionId !== self.sessionId),
      send: (target, raw) => {
        if (JSON.parse(raw).kind === this.failKind || !this.listeners.has(target)) return false;
        const message = { sender: self, target, raw };
        this.history.push(message);
        if (this.synchronous) this.deliver(message);
        else this.queue.push(message);
        return true;
      },
      subscribe: (listener) => {
        this.listeners.set(self.sessionId, listener);
        return () => { if (this.listeners.get(self.sessionId) === listener) this.listeners.delete(self.sessionId); };
      },
    };
  }

  deliver(message: Message): void { this.listeners.get(message.target)?.(message.sender, message.raw); }
  flush(): void {
    let budget = 100;
    while (this.queue.length && budget-- > 0) this.deliver(this.queue.shift()!);
    if (this.queue.length) throw new Error("Unexpected protocol feedback loop");
  }
  take(kind: string): Message {
    const index = this.queue.findIndex((message) => JSON.parse(message.raw).kind === kind);
    if (index < 0) throw new Error(`Missing ${kind}`);
    return this.queue.splice(index, 1)[0]!;
  }
}

const controllers: StudioVirtualSpaceSocialController[] = [];
afterEach(() => { for (const controller of controllers.splice(0)) controller.close(); });

function setup(options: { worldB?: StudioVirtualSpaceSocialWorld; synchronous?: boolean } = {}) {
  const hub = new PairedPorts();
  hub.synchronous = options.synchronous ?? false;
  let now = 5_000;
  const acceptedA = vi.fn();
  const acceptedB = vi.fn();
  const ticks: Array<() => void> = [];
  const make = (participant: StudioLiveParticipant, epoch: string, world = WORLD, onAccepted = vi.fn()) => {
    const controller = new StudioVirtualSpaceSocialController(participant, hub.port(participant), world, {
      epoch, now: () => now, onAccepted,
      setInterval: (handler) => { ticks.push(handler); return handler; },
      clearInterval: (handler) => { const index = ticks.indexOf(handler as () => void); if (index >= 0) ticks.splice(index, 1); },
    });
    controllers.push(controller);
    controller.start();
    return controller;
  };
  const a = make(A, "epoch-a", WORLD, acceptedA);
  const b = make(B, "epoch-b", options.worldB ?? WORLD, acceptedB);
  a.syncPeers();
  b.syncPeers();
  hub.flush();
  const advance = (ms: number) => { now += ms; for (const tick of [...ticks]) tick(); };
  const state = (controller: StudioVirtualSpaceSocialController, id: string) =>
    controller.snapshot().requests.find((request) => request.id === id)?.status;
  return { hub, a, b, make, advance, state, acceptedA, acceptedB, ticks };
}

describe("virtual studio social consent", () => {
  it.each<StudioVirtualSpaceSocialAction>(["talk", "follow", "review", "high-five"])(
    "requires receiver consent before completing %s, with exactly one callback per participant", (action) => {
      const { a, b, hub, state, acceptedA, acceptedB } = setup();
      expect(a.snapshot().readyPeerIds).toEqual([B.sessionId]);
      expect(b.snapshot().readyPeerIds).toEqual([A.sessionId]);
      const id = a.request(B.sessionId, action)!;
      hub.flush();
      expect(state(a, id)).toBe("offered");
      expect(state(b, id)).toBe("offered");
      expect(acceptedA).not.toHaveBeenCalled();
      expect(acceptedB).not.toHaveBeenCalled();
      expect(a.respond(id, "accept")).toBe(false);
      expect(b.respond(id, "accept")).toBe(true);
      expect(state(b, id)).toBe("accepting");
      hub.flush();
      expect(state(a, id)).toBe("accepted");
      expect(state(b, id)).toBe("accepted");
      expect(acceptedA).toHaveBeenCalledTimes(1);
      expect(acceptedB).toHaveBeenCalledTimes(1);
      for (const message of [...hub.history]) hub.deliver(message);
      hub.flush();
      expect(acceptedA).toHaveBeenCalledTimes(1);
      expect(acceptedB).toHaveBeenCalledTimes(1);
      expect(acceptedA.mock.calls[0]![0]).toMatchObject({ id, action, direction: "outgoing", peer: B });
      expect(acceptedB.mock.calls[0]![0]).toMatchObject({ id, action, direction: "incoming", peer: A });
    },
  );

  it("also handles synchronous authorized ports without losing consent callbacks", () => {
    const { a, b, state, acceptedA, acceptedB } = setup({ synchronous: true });
    const id = a.request(B.sessionId, "talk")!;
    expect(b.respond(id, "accept")).toBe(true);
    expect(state(a, id)).toBe("accepted");
    expect(state(b, id)).toBe("accepted");
    expect(acceptedA).toHaveBeenCalledTimes(1);
    expect(acceptedB).toHaveBeenCalledTimes(1);
  });

  it("declines explicitly and cannot later accept the declined offer", () => {
    const { a, b, hub, state, acceptedA, acceptedB } = setup();
    const id = a.request(B.sessionId, "review")!;
    hub.flush();
    expect(b.respond(id, "decline")).toBe(true);
    hub.flush();
    expect(state(a, id)).toBe("declined");
    expect(state(b, id)).toBe("declined");
    expect(b.respond(id, "accept")).toBe(false);
    expect(acceptedA).not.toHaveBeenCalled();
    expect(acceptedB).not.toHaveBeenCalled();
  });

  it("preserves cancellation when accept arrives late and ignores duplicated controls", () => {
    const { a, b, hub, state, acceptedA, acceptedB } = setup();
    const id = a.request(B.sessionId, "follow")!;
    hub.flush();
    b.respond(id, "accept");
    const accepted = hub.take("accept");
    a.cancel(id);
    hub.flush();
    hub.deliver(accepted);
    hub.deliver(accepted);
    expect(state(a, id)).toBe("cancelled");
    expect(state(b, id)).toBe("cancelled");
    expect(acceptedA).not.toHaveBeenCalled();
    expect(acceptedB).not.toHaveBeenCalled();
  });

  it("does not surface a reordered offer that arrived after its cancellation", () => {
    const { a, b, hub, state } = setup();
    const id = a.request(B.sessionId, "high-five")!;
    const offer = hub.take("request");
    a.cancel(id);
    hub.flush();
    hub.deliver(offer);
    expect(state(a, id)).toBe("cancelled");
    expect(b.snapshot().requests).toHaveLength(0);
  });

  it("expires lost offers locally with no speculative retry or accepted event", () => {
    const { a, b, hub, advance, state, acceptedA } = setup();
    const id = a.request(B.sessionId, "talk")!;
    hub.take("request"); // Artificial loss; the real direct port requires reliable ordered RTC.
    advance(STUDIO_VIRTUAL_SPACE_SOCIAL_TTL_MS + 1);
    hub.flush();
    expect(state(a, id)).toBe("expired");
    expect(b.snapshot().requests).toHaveLength(0);
    expect(hub.history.filter((message) => JSON.parse(message.raw).kind === "request")).toHaveLength(1);
    expect(acceptedA).not.toHaveBeenCalled();
  });

  it("revokes both sides when a receiver expires waiting for a lost acceptance commit", () => {
    const { a, b, hub, advance, state, acceptedA, acceptedB } = setup();
    const id = a.request(B.sessionId, "follow")!;
    hub.flush();
    b.respond(id, "accept");
    hub.deliver(hub.take("accept"));
    const commit = hub.take("commit");
    expect(state(a, id)).toBe("accepted");
    expect(state(b, id)).toBe("accepting");
    advance(STUDIO_VIRTUAL_SPACE_SOCIAL_TTL_MS + 1);
    hub.deliver(commit);
    hub.flush();
    expect(state(a, id)).toBe("expired");
    expect(state(b, id)).toBe("expired");
    hub.deliver(commit);
    hub.flush();
    expect(state(a, id)).toBe("expired");
    expect(state(b, id)).toBe("expired");
    expect(acceptedA).toHaveBeenCalledTimes(1);
    expect(acceptedB).not.toHaveBeenCalled();
  });

  it("expires late acceptance using the sender's local deadline rather than remote time", () => {
    const { a, b, hub, advance, state, acceptedA } = setup();
    const id = a.request(B.sessionId, "talk")!;
    hub.flush();
    b.respond(id, "accept");
    const accepted = hub.take("accept");
    advance(STUDIO_VIRTUAL_SPACE_SOCIAL_TTL_MS + 1);
    hub.deliver(accepted);
    expect(state(a, id)).toBe("expired");
    expect(acceptedA).not.toHaveBeenCalled();
  });

  it.each(["request", "accept", "commit"])("surfaces %s send failure and never reports that failed action as accepted", (kind) => {
    const { a, b, hub, state, acceptedA, acceptedB } = setup();
    if (kind === "request") hub.failKind = kind;
    const id = a.request(B.sessionId, "review");
    if (kind === "request") {
      expect(id).toBeNull();
      expect(a.snapshot().requests[0]?.status).toBe("failed");
    } else {
      hub.flush();
      hub.failKind = kind;
      b.respond(id!, "accept");
      hub.flush();
      expect(state(kind === "accept" ? b : a, id!)).toBe("failed");
    }
    expect(acceptedA).not.toHaveBeenCalled();
    expect(acceptedB).not.toHaveBeenCalled();
  });

  it("terminates consent when the peer leaves and fences packets from the previous connection", () => {
    const { a, b, hub, state, acceptedA } = setup();
    const id = a.request(B.sessionId, "follow")!;
    hub.flush();
    b.respond(id, "accept");
    const oldAccept = hub.take("accept");
    const oldPackets = [...hub.history];
    hub.participants = [A];
    a.syncPeers();
    expect(state(a, id)).toBe("disconnected");
    hub.participants = [A, B];
    a.syncPeers();
    hub.flush();
    for (const message of oldPackets) hub.deliver(message);
    hub.deliver(oldAccept);
    hub.flush();
    expect(state(a, id)).toBe("disconnected");
    expect(acceptedA).not.toHaveBeenCalled();
    expect(a.snapshot().readyPeerIds).toEqual([B.sessionId]);
  });

  it("fences a controller restart under the same session identity", () => {
    const { a, b, hub, make, state, acceptedA } = setup();
    const id = a.request(B.sessionId, "talk")!;
    hub.flush();
    b.respond(id, "accept");
    const oldAccept = hub.take("accept");
    const oldHello = hub.history.find((message) => message.sender === B && JSON.parse(message.raw).kind === "hello")!;
    b.close();
    make(B, "epoch-b-restarted");
    hub.flush();
    hub.deliver(oldHello);
    hub.deliver(oldAccept);
    hub.flush();
    expect(["cancelled", "disconnected"]).toContain(state(a, id));
    expect(acceptedA).not.toHaveBeenCalled();
  });

  it("resolves simultaneous invitations deterministically without granting automatic consent", () => {
    const { a, b, hub, state, acceptedA, acceptedB } = setup();
    const idA = a.request(B.sessionId, "talk")!;
    const idB = b.request(A.sessionId, "follow")!;
    hub.flush();
    expect(state(a, idA)).toBe("offered");
    expect(state(b, idA)).toBe("offered");
    expect(["declined", "cancelled"]).toContain(state(a, idB));
    expect(["declined", "cancelled"]).toContain(state(b, idB));
    expect(acceptedA).not.toHaveBeenCalled();
    expect(acceptedB).not.toHaveBeenCalled();
    b.respond(idA, "accept");
    hub.flush();
    expect(acceptedA).toHaveBeenCalledTimes(1);
    expect(acceptedB).toHaveBeenCalledTimes(1);
  });

  it("rotates link challenges after many restarts without retaining unbounded epochs or accepting old offers", () => {
    const { a, b, hub, make, advance } = setup();
    a.request(B.sessionId, "talk");
    const oldOffer = hub.take("request");
    a.cancel(JSON.parse(oldOffer.raw).requestId);
    hub.flush();
    let current = b;
    for (let index = 0; index < 12; index++) {
      advance(3_100);
      current.close();
      current = make(B, `restarted-b-${index}`);
      hub.flush();
      expect(a.snapshot().readyPeerIds).toEqual([B.sessionId]);
      expect(current.snapshot().readyPeerIds).toEqual([A.sessionId]);
    }
    hub.deliver(oldOffer);
    expect(current.snapshot().requests).toHaveLength(0);
    const id = a.request(B.sessionId, "review")!;
    hub.flush();
    expect(current.respond(id, "accept")).toBe(true);
    hub.flush();
    expect(a.snapshot().requests.find((request) => request.id === id)?.status).toBe("accepted");
  });

  it.each([{ worldId: "other", contentRevision: "layout-7" }, { worldId: "studio", contentRevision: "layout-8" }])(
    "rejects incompatible world identity %j", (worldB) => {
      const { a, b, hub } = setup({ worldB });
      expect(a.snapshot().readyPeerIds).toEqual([]);
      expect(b.snapshot().readyPeerIds).toEqual([]);
      expect(a.request(B.sessionId, "review")).toBeNull();
      expect(hub.history.every((message) => JSON.parse(message.raw).kind === "hello")).toBe(true);
    },
  );

  it("binds sender and target to the actual authorized port and refuses remote command payloads", () => {
    const { a, b, hub } = setup();
    a.request(B.sessionId, "review");
    const offer = hub.take("request");
    const original = JSON.parse(offer.raw) as StudioVirtualSpaceSocialPacket;
    hub.deliver({ ...offer, sender: C });
    for (const edit of [
      { senderSessionId: C.sessionId }, { targetSessionId: C.sessionId },
      { targetEpoch: "stale-epoch" }, { action: "navigate" }, { documentUrl: "https://example.com" },
    ]) hub.deliver({ ...offer, raw: JSON.stringify({ ...original, ...edit }) });
    expect(b.snapshot().requests).toHaveLength(0);
    hub.deliver(offer);
    expect(b.snapshot().requests).toHaveLength(1);
  });

  it("bounds outstanding offers, per-peer request frequency and terminal history", () => {
    const { a, b, hub, advance } = setup();
    const extras = Array.from({ length: 4 }, (_, index) => ({ ...C, sessionId: `extra-${index}` }));
    hub.participants.push(...extras);
    for (const peer of extras) makeExtra(peer);
    function makeExtra(peer: StudioLiveParticipant) {
      const controller = new StudioVirtualSpaceSocialController(peer, hub.port(peer), WORLD, {
        epoch: `epoch-${peer.sessionId}`, setInterval: () => 0, clearInterval: () => undefined,
      });
      controllers.push(controller);
      controller.start();
    }
    a.syncPeers();
    hub.flush();
    const first = a.request(B.sessionId, "talk")!;
    expect(a.request(B.sessionId, "follow")).toBeNull();
    for (const peer of extras.slice(0, 3)) expect(a.request(peer.sessionId, "talk")).not.toBeNull();
    expect(a.request(extras[3]!.sessionId, "talk")).toBeNull();
    a.cancel(first);
    expect(a.request(B.sessionId, "talk")).toBeNull();
    hub.flush();
    for (let index = 0; index < 70; index++) {
      advance(3_100);
      hub.flush();
      const id = a.request(B.sessionId, "talk");
      expect(id).not.toBeNull();
      hub.flush();
      b.respond(id!, "decline");
      hub.flush();
    }
    expect(a.snapshot().requests.length).toBeLessThanOrEqual(64);
    expect(b.snapshot().requests.length).toBeLessThanOrEqual(64);
  });

  it.each(["incoming", "outgoing"])("retains accepted activities while pruning more than 64 later %s invitations", (direction) => {
    const { a, b, hub, make, advance, state, acceptedA, acceptedB } = setup();
    hub.participants.push(C);
    const c = make(C, "epoch-c");
    a.syncPeers();
    hub.flush();
    const activeId = a.request(B.sessionId, "talk")!;
    hub.flush();
    b.respond(activeId, "accept");
    hub.flush();
    const activeStates: Array<string | undefined> = [];
    a.subscribe(() => activeStates.push(state(a, activeId)));
    for (let index = 0; index < 70; index++) {
      advance(3_100);
      const id = direction === "incoming" ? c.request(A.sessionId, "review") : a.request(C.sessionId, "review");
      expect(id).not.toBeNull();
      hub.flush();
      (direction === "incoming" ? a : c).respond(id!, "decline");
      hub.flush();
      expect(a.snapshot().requests.length).toBeLessThanOrEqual(64);
    }
    expect(state(a, activeId)).toBe("accepted");
    expect(state(b, activeId)).toBe("accepted");
    expect(activeStates.every((status) => status === "accepted")).toBe(true);
    expect(a.snapshot().requests).toHaveLength(64);
    expect(acceptedA).toHaveBeenCalledTimes(1);
    expect(acceptedB).toHaveBeenCalledTimes(1);
    expect(a.cancel(activeId)).toBe(true);
    hub.flush();
    expect(state(b, activeId)).toBe("cancelled");
  });

  it("rejects new invitations when all retained records are active and resumes after explicit cancellation", () => {
    const { a, b, hub, make, advance, state } = setup();
    const activeIds: string[] = [];
    for (let index = 0; index < 64; index++) {
      advance(3_100);
      const id = a.request(B.sessionId, "talk")!;
      activeIds.push(id);
      hub.flush();
      expect(b.respond(id, "accept")).toBe(true);
      hub.flush();
    }
    advance(3_100);
    expect(a.request(B.sessionId, "review")).toBeNull();
    expect(a.snapshot().requests).toHaveLength(64);
    expect(a.snapshot().requests.every((request) => request.status === "accepted")).toBe(true);
    hub.participants.push(C);
    const c = make(C, "epoch-c");
    a.syncPeers();
    hub.flush();
    const refusedId = c.request(A.sessionId, "follow")!;
    hub.flush();
    expect(state(c, refusedId)).toBe("declined");
    expect(a.snapshot().requests).toHaveLength(64);
    expect(a.snapshot().requests.every((request) => request.status === "accepted")).toBe(true);
    expect(a.cancel(activeIds[0]!)).toBe(true);
    hub.flush();
    const nextId = a.request(B.sessionId, "review")!;
    expect(nextId).not.toBeNull();
    hub.flush();
    expect(b.respond(nextId, "accept")).toBe(true);
    hub.flush();
    expect(state(a, nextId)).toBe("accepted");
    expect(a.snapshot().requests).toHaveLength(64);
    expect(a.snapshot().requests.every((request) => request.status === "accepted")).toBe(true);
  });

  it("cleans timers and listeners on close and disables viewer participation", () => {
    const { a, b, hub, ticks, state, make } = setup();
    const notify = vi.fn();
    a.subscribe(notify);
    const id = a.request(B.sessionId, "talk")!;
    hub.flush();
    a.close();
    hub.flush();
    expect(state(b, id)).toBe("cancelled");
    expect(ticks).toHaveLength(1);
    expect(hub.listeners.has(A.sessionId)).toBe(false);
    expect(a.snapshot().available).toBe(false);
    expect(a.request(B.sessionId, "talk")).toBeNull();
    const count = notify.mock.calls.length;
    a.close();
    expect(notify).toHaveBeenCalledTimes(count);
    const viewer = make({ ...C, role: "viewer" }, "viewer");
    expect(viewer.snapshot().available).toBe(false);
  });
});

describe("social packet validation", () => {
  it("rejects excessive bytes, invalid TTL, nonintegral sequence, bad request identity and unknown properties", () => {
    const { a, hub } = setup();
    a.request(B.sessionId, "talk");
    const raw = hub.take("request").raw;
    const packet = JSON.parse(raw) as StudioVirtualSpaceSocialPacket;
    expect(parseStudioVirtualSpaceSocialPacket(raw)).toEqual(packet);
    expect(parseStudioVirtualSpaceSocialPacket("x".repeat(STUDIO_VIRTUAL_SPACE_SOCIAL_MAX_BYTES + 1))).toBeNull();
    expect(parseStudioVirtualSpaceSocialPacket("[]")).toBeNull();
    expect(parseStudioVirtualSpaceSocialPacket("null")).toBeNull();
    for (const edit of [
      { sequence: 1.5 }, { sequence: -1 }, { expiresAfterMs: -1 }, { expiresAfterMs: 0 },
      { expiresAfterMs: STUDIO_VIRTUAL_SPACE_SOCIAL_TTL_MS + 1 }, { requestId: "unrelated" },
      { contentRevision: "" }, { action: "enable-microphone" }, { payload: {} },
    ]) expect(parseStudioVirtualSpaceSocialPacket(JSON.stringify({ ...packet, ...edit }))).toBeNull();
  });
});
