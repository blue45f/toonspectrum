import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import { StudioVirtualConversationController, parseStudioConversationPacket, type StudioConversationPacket } from "./studio-virtual-space-conversation";

const world = { worldId: "world", contentRevision: "a".repeat(64) };
const sessions: StudioVirtualConversationController[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.close(); });
type Delivery = { from: string; to: string; raw: string };
class Mesh {
  now = 0;
  readonly participants: StudioLiveParticipant[];
  readonly controllers = new Map<string, StudioVirtualConversationController>();
  readonly listeners = new Map<string, Set<(sender: StudioLiveParticipant, raw: string) => void>>();
  readonly ready = new Map<string, ReturnType<typeof vi.fn>>();
  readonly closed = new Map<string, ReturnType<typeof vi.fn>>();
  readonly packets: Delivery[] = [];
  readonly held: Delivery[] = [];
  readonly disconnected = new Set<string>();
  filter: (packet: Delivery) => "send" | "hold" | "drop" | "fail" = () => "send";
  constructor(ids = ["a", "b", "c", "d", "e"]) {
    this.participants = ids.map((id) => ({ sessionId: id, displayName: id.toUpperCase(), role: "editor" }));
    for (const id of ids) this.start(id);
    for (let count = 0; count < 3; count++) this.sync();
  }
  port(id: string): StudioLiveDirectPort {
    return {
      getPeers: () => this.participants.filter((peer) => peer.sessionId !== id && !this.disconnected.has(peer.sessionId)),
      subscribe: (listener) => { const bucket = this.listeners.get(id) ?? new Set(); bucket.add(listener); this.listeners.set(id, bucket); return () => { bucket.delete(listener); }; },
      send: (to, raw) => {
        const packet = { from: id, to, raw }; this.packets.push(packet);
        const decision = this.filter(packet);
        if (decision === "fail" || !this.listeners.get(to)?.size) return false;
        if (decision === "hold") this.held.push(packet);
        else if (decision === "send") this.deliver(packet);
        return true;
      },
    };
  }
  deliver(packet: Delivery) { for (const listener of this.listeners.get(packet.to) ?? []) listener(this.participants.find((peer) => peer.sessionId === packet.from)!, packet.raw); }
  start(id: string, suffix = "one") {
    const ready = vi.fn(), closed = vi.fn(); this.ready.set(id, ready); this.closed.set(id, closed);
    const controller = new StudioVirtualConversationController(this.participants.find((peer) => peer.sessionId === id)!, this.port(id), world,
      { instanceId: `${id}-${suffix}`, now: () => this.now, setInterval: () => 1, clearInterval: () => undefined, onReady: ready, onClosed: closed });
    this.controllers.set(id, controller); sessions.push(controller); controller.start(); return controller;
  }
  get(id: string) { return this.controllers.get(id)!; }
  sync() { for (const controller of this.controllers.values()) controller.sync(); }
  acceptAll(ids = ["a", "b", "c"]) {
    const id = this.get(ids[0]!).propose(ids)!; expect(id).not.toBeNull();
    for (const member of ids.slice(1)) expect(this.get(member).respond(id, "accept")).toBe(true);
    return id;
  }
}

describe("immutable two-to-four-person conversation consent", () => {
  it.each([2, 3, 4])("opens the same exact %i-person roster only after every authenticated member explicitly agrees", (count) => {
    const mesh = new Mesh(); const members = ["a", "b", "c", "d"].slice(0, count);
    expect(mesh.get("a").snapshot().readyPeers).toHaveLength(4);
    const id = mesh.get("a").propose(members)!;
    for (const member of members) expect(mesh.ready.get(member)).not.toHaveBeenCalled();
    for (const member of members.slice(1)) mesh.get(member).respond(id, "accept");
    for (const member of members) {
      expect(mesh.ready.get(member)).toHaveBeenCalledExactlyOnceWith({ id, memberIds: members });
      expect(mesh.get(member).snapshot().active).toEqual({ id, memberIds: members });
      expect(mesh.get(member).respond(id, "accept")).toBe(false);
    }
    expect(mesh.ready.get("e")).not.toHaveBeenCalled();
    expect(mesh.get("e").snapshot().records).toEqual([]);
  });

  it("does not trust a host's forged vote, arbitrary commit, extra audience, or unknown fields", () => {
    const mesh = new Mesh(); const id = mesh.get("a").propose(["a", "b", "c"])!;
    mesh.get("b").respond(id, "accept");
    const original = mesh.packets.find((entry) => entry.from === "a" && entry.to === "b" && JSON.parse(entry.raw).kind === "propose")!;
    const packet = JSON.parse(original.raw) as StudioConversationPacket;
    mesh.deliver({ ...original, raw: JSON.stringify({ ...packet, kind: "accept", senderSessionId: "c", sequence: 90 }) });
    mesh.deliver({ ...original, raw: JSON.stringify({ ...packet, kind: "commit", sequence: 91 }) });
    mesh.deliver({ ...original, raw: JSON.stringify({ ...packet, kind: "accept", sequence: 92, proposal: { ...packet.proposal, memberIds: ["a", "b", "d"] } }) });
    mesh.deliver({ ...original, raw: JSON.stringify({ ...packet, kind: "accept", sequence: 93, approvedBy: ["c"] }) });
    expect(mesh.ready.get("b")).not.toHaveBeenCalled();
    expect(mesh.get("b").snapshot().records[0]?.acceptedIds).toEqual(["a", "b"]);
    expect(parseStudioConversationPacket(JSON.stringify({ ...packet, proposal: { ...packet.proposal, memberIds: ["a", "b", "c", "d", "e"] } }))).toBeNull();
  });

  it("buffers an authenticated early vote but waits for the initiator's matching proposal and local acceptance", () => {
    const mesh = new Mesh(); mesh.filter = (packet) => packet.from === "a" && packet.to === "c" && JSON.parse(packet.raw).kind === "propose" ? "hold" : "send";
    const id = mesh.get("a").propose(["a", "b", "c"])!; mesh.get("b").respond(id, "accept");
    expect(mesh.get("c").snapshot().records).toEqual([]);
    mesh.deliver(mesh.held[0]!);
    expect(mesh.get("c").snapshot().records[0]?.acceptedIds).toEqual(["a", "b"]);
    expect(mesh.ready.get("c")).not.toHaveBeenCalled();
    expect(mesh.get("c").respond(id, "accept")).toBe(true);
    for (const member of ["a", "b", "c"]) expect(mesh.ready.get(member)).toHaveBeenCalledOnce();
  });

  it("requires fresh consent from all existing members before expanding to four and uses a new ID", () => {
    const mesh = new Mesh(); const old = mesh.acceptAll();
    const next = mesh.get("b").propose(["a", "b", "c", "d"])!; expect(next).not.toBe(old);
    mesh.get("d").respond(next, "accept");
    for (const member of ["a", "b", "c"]) expect(mesh.get(member).snapshot().active?.id).toBe(old);
    mesh.get("a").respond(next, "accept"); mesh.get("c").respond(next, "accept");
    for (const member of ["a", "b", "c", "d"]) expect(mesh.get(member).snapshot().active).toEqual({ id: next, memberIds: ["a", "b", "c", "d"] });
    for (const member of ["a", "b", "c"]) expect(mesh.closed.get(member)).toHaveBeenCalledExactlyOnceWith({ id: old, memberIds: ["a", "b", "c"] });
    expect(mesh.get("a").propose(["a", "b", "c", "d", "e"])).toBeNull();
    expect(mesh.get("a").propose(["a", "b", "b"])).toBeNull();
  });

  it("closes the immutable group on any member's leave without silently shrinking it", () => {
    const mesh = new Mesh(); const id = mesh.acceptAll(["a", "b", "c", "d"]);
    expect(mesh.get("c").leave(id)).toBe(true);
    for (const member of ["a", "b", "c", "d"]) { expect(mesh.get(member).snapshot().active).toBeNull(); expect(mesh.closed.get(member)).toHaveBeenCalledOnce(); }
    mesh.now += 10_000; mesh.sync();
    for (const member of ["a", "b", "c", "d"]) expect(mesh.ready.get(member)).toHaveBeenCalledOnce();
  });

  it.each(["decline", "expiry", "send-failure", "disconnect", "blocked"])("never starts after %s", (reason) => {
    const mesh = new Mesh(); const id = mesh.get("a").propose(["a", "b", "c"])!;
    if (reason === "decline") mesh.get("b").respond(id, "decline");
    if (reason === "expiry") { mesh.now = 20_000; mesh.sync(); }
    if (reason === "send-failure") { mesh.filter = (packet) => JSON.parse(packet.raw).kind === "accept" ? "fail" : "send"; mesh.get("b").respond(id, "accept"); }
    if (reason === "disconnect") { mesh.disconnected.add("c"); mesh.sync(); }
    if (reason === "blocked") mesh.get("b").setBlockedPeers(["c"]);
    mesh.get("c").respond(id, "accept"); mesh.get("b").respond(id, "accept");
    for (const member of ["a", "b", "c"]) expect(mesh.ready.get(member)).not.toHaveBeenCalled();
  });

  it("expires media consent on a silent partition even when the RTC peer roster looks connected", () => {
    const mesh = new Mesh(); mesh.acceptAll();
    mesh.filter = () => "drop"; mesh.now = 6_500; mesh.sync();
    for (const member of ["a", "b", "c"]) { expect(mesh.get(member).snapshot().active).toBeNull(); expect(mesh.closed.get(member)).toHaveBeenCalledOnce(); }
    mesh.filter = () => "send"; mesh.now = 8_000; mesh.sync();
    for (const member of ["a", "b", "c"]) expect(mesh.ready.get(member)).toHaveBeenCalledOnce();
  });

  it("sustains only the existing accepted roster with pulses and never interprets them as local consent", () => {
    const mesh = new Mesh(); const id = mesh.get("a").propose(["a", "b", "c"])!;
    for (let time = 2_000; time <= 10_000; time += 2_000) { mesh.now = time; mesh.sync(); }
    expect(mesh.ready.get("b")).not.toHaveBeenCalled();
    mesh.get("b").respond(id, "accept"); mesh.get("c").respond(id, "accept");
    for (let time = 12_000; time <= 40_000; time += 2_000) { mesh.now = time; mesh.sync(); }
    for (const member of ["a", "b", "c"]) { expect(mesh.get(member).snapshot().active?.id).toBe(id); expect(mesh.ready.get(member)).toHaveBeenCalledOnce(); }
  });

  it("fences controller restart and replayed consent while preserving the old terminal record", () => {
    const mesh = new Mesh(); const id = mesh.acceptAll();
    const replay = mesh.packets.filter((packet) => packet.to === "b");
    mesh.get("b").close(); mesh.start("b", "two"); mesh.sync();
    for (const packet of replay) mesh.deliver(packet);
    expect(mesh.get("b").snapshot().active).toBeNull(); expect(mesh.ready.get("b")).not.toHaveBeenCalled();
    for (const member of ["a", "c"]) expect(mesh.get(member).snapshot().active).toBeNull();
    expect(mesh.get("a").snapshot().records.find((record) => record.id === id)?.status).not.toBe("ready");
  });

  it("rejects wrong-world packets and keeps output rosters immutable", () => {
    const mesh = new Mesh(); const id = mesh.acceptAll();
    const active = mesh.get("a").snapshot().active!;
    expect(() => (active.memberIds as string[]).push("e")).toThrow();
    const accept = mesh.packets.find((packet) => packet.to === "b" && JSON.parse(packet.raw).kind === "accept")!;
    mesh.deliver({ ...accept, raw: JSON.stringify({ ...JSON.parse(accept.raw), kind: "leave", contentRevision: "b".repeat(64), sequence: 99 }) });
    expect(mesh.get("b").snapshot().active?.id).toBe(id);
  });
});
