import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import { StudioVirtualSpaceSocialController } from "./studio-virtual-space-social";
import { StudioVirtualConversationController } from "./studio-virtual-space-conversation";
import { studioVirtualSpaceState } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import {
  StudioVirtualSpaceAcousticPolicy, resolveStudioAcousticZone, studioAcousticScope,
  validateStudioWorldAcousticZones, type StudioAcousticWorld,
} from "./studio-virtual-space-acoustics";

const zones = [
  { id: "lounge", roomId: "lounge", x: 0, y: 0, width: 400, height: 300, policy: "public" as const },
  { id: "meeting", roomId: "meeting", x: 400, y: 0, width: 400, height: 300, policy: "public" as const },
  { id: "private", roomId: "private", x: 800, y: 0, width: 200, height: 300, policy: "private" as const },
  { id: "door", roomId: "door", x: 1000, y: 0, width: 200, height: 300, policy: "public" as const, doorId: "door-one" },
];
const world: StudioAcousticWorld = { worldId: "world", contentRevision: "a".repeat(64), width: 1200, height: 350,
  rooms: zones.map((zone) => ({ id: zone.id, x: zone.x, y: zone.y, width: zone.width, height: zone.height })), acousticZones: zones };
interface Packet { from: string; to: string; raw: string }
const fixtures: Mesh[] = [];
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.close(); });

class Mesh {
  now = 0;
  readonly people: StudioLiveParticipant[];
  readonly positions = new Map<string, { x: number; y: number }>();
  readonly policies = new Map<string, StudioVirtualSpaceAcousticPolicy>();
  readonly social = new Map<string, StudioVirtualSpaceSocialController>();
  readonly groups = new Map<string, StudioVirtualConversationController>();
  readonly accepted = vi.fn(); readonly ended = vi.fn(); readonly ready = vi.fn(); readonly closed = vi.fn();
  readonly authorizeReview = vi.fn(async () => true);
  readonly held: Packet[] = [];
  hold: (packet: Packet) => boolean = () => false;
  private readonly listeners = new Map<string, Set<(sender: StudioLiveParticipant, raw: string) => void>>();
  constructor(ids = ["a", "b"]) {
    this.people = ids.map((sessionId, index) => {
      this.positions.set(sessionId, { x: 100 + index * 20, y: 100 });
      return { sessionId, displayName: sessionId, role: "editor" };
    });
    for (const person of this.people) {
      const policy = new StudioVirtualSpaceAcousticPolicy(world, person.sessionId, { now: () => this.now, wallNow: () => this.now });
      this.policies.set(person.sessionId, policy); policy.update(this.snapshot(person.sessionId), true);
      const port: StudioLiveDirectPort = {
        getPeers: () => this.people.filter((peer) => peer !== person),
        send: (to, raw) => {
          const packet = { from: person.sessionId, to, raw };
          if (!this.listeners.get(to)?.size) return false;
          if (this.hold(packet)) this.held.push(packet); else this.deliver(packet);
          return true;
        },
        subscribe: (listener) => {
          const bucket = this.listeners.get(person.sessionId) ?? new Set(); bucket.add(listener); this.listeners.set(person.sessionId, bucket);
          return () => { bucket.delete(listener); };
        },
      };
      const timer = { now: () => this.now, setInterval: () => 0, clearInterval: () => undefined };
      const social = new StudioVirtualSpaceSocialController(person, port, world, { ...timer, epoch: person.sessionId,
        acoustics: policy, authorizeReview: () => this.authorizeReview(), onAccepted: (request) => this.accepted(person.sessionId, request.id), onEnded: (request) => this.ended(person.sessionId, request.id) });
      const group = new StudioVirtualConversationController(person, port, world, { ...timer, instanceId: person.sessionId,
        acoustics: policy, onReady: (scope) => this.ready(person.sessionId, scope.id), onClosed: (scope) => this.closed(person.sessionId, scope.id) });
      this.social.set(person.sessionId, social); this.groups.set(person.sessionId, group); social.start(); group.start();
    }
    this.advance(350); fixtures.push(this);
  }
  snapshot(selfId: string): StudioVirtualSpaceSnapshot {
    return { self: { ...studioVirtualSpaceState(this.positions.get(selfId)!), ...this.positions.get(selfId)! }, peers: this.people.filter((person) => person.sessionId !== selfId).map((participant) => ({
      participant, state: { ...studioVirtualSpaceState(this.positions.get(participant.sessionId)!), ...this.positions.get(participant.sessionId)! }, lastSeen: this.now, sequence: 1,
    })), nearbyPeers: [], peerReactions: [], selfReaction: null, direct: true };
  }
  deliver(packet: Packet) { for (const listener of this.listeners.get(packet.to) ?? []) listener(this.people.find((person) => person.sessionId === packet.from)!, packet.raw); }
  advance(ms: number) {
    this.now += ms;
    for (const person of this.people) {
      this.policies.get(person.sessionId)!.update(this.snapshot(person.sessionId), true);
      this.social.get(person.sessionId)!.syncPeers(); this.groups.get(person.sessionId)!.sync();
    }
  }
  pair() {
    const id = this.social.get("a")!.request("b", "talk"); expect(id).not.toBeNull();
    expect(this.social.get("b")!.respond(id!, "accept")).toBe(true); return id!;
  }
  group() {
    const id = this.groups.get("a")!.propose(this.people.map((person) => person.sessionId)); expect(id).not.toBeNull();
    for (const person of this.people.slice(1)) expect(this.groups.get(person.sessionId)!.respond(id!, "accept")).toBe(true);
    return id!;
  }
  close() { for (const controller of this.social.values()) controller.close(); for (const controller of this.groups.values()) controller.close(); }
}

describe("strict acoustic geometry and permission policy", () => {
  it("validates explicit immutable zones and rejects malformed, overlapping or room-external definitions", () => {
    expect(validateStudioWorldAcousticZones(zones, world)).toEqual([]);
    for (const invalid of [null, {}, [...zones, zones[0]], [{ ...zones[0], id: undefined }], [{ ...zones[0], width: -1 }],
      [{ ...zones[0], roomId: "missing" }], [{ ...zones[0], x: 380 }], [{ ...zones[0], script: "alert(1)" }],
      [{ ...zones[0], width: Infinity }], [{ ...zones[0], policy: "open" }], [{ ...zones[0], doorId: "" }]]) {
      expect(validateStudioWorldAcousticZones(invalid, world).length).toBeGreaterThan(0);
    }
    expect(validateStudioWorldAcousticZones([{ ...zones[0], width: 250 }, { ...zones[0], id: "overlap", x: 200, width: 100 }], world).length).toBeGreaterThan(0);
  });
  it("uses half-open edges and returns unknown for gaps, outside positions and ambiguous overlaps", () => {
    expect(resolveStudioAcousticZone(zones, { x: 400, y: 100 })?.id).toBe("meeting");
    expect(resolveStudioAcousticZone(zones, { x: 0, y: 0 })?.id).toBe("lounge");
    for (const point of [{ x: -1, y: 10 }, { x: 1200, y: 10 }, { x: 10, y: 320 }, { x: NaN, y: 0 }]) expect(resolveStudioAcousticZone(zones, point)).toBeNull();
    expect(resolveStudioAcousticZone([zones[0]!, zones[0]!], { x: 10, y: 10 })).toBeNull();
  });
  it.each([810, 1010])("does not treat private or door zone x=%i as permission even when participants spoof lounge zoneId", (x) => {
    const f = new Mesh(); f.positions.set("a", { x, y: 100 }); f.positions.set("b", { x: x + 20, y: 100 }); f.advance(350);
    expect(f.policies.get("a")!.check(["a", "b"], "enter").reason).toBe("authority-required");
    expect(f.social.get("a")!.request("b", "talk")).toBeNull(); expect(f.groups.get("a")!.propose(["a", "b"])).toBeNull();
    expect(f.accepted).not.toHaveBeenCalled(); expect(f.ready).not.toHaveBeenCalled();
  });
  it("rejects missing zones, stale observations and a guard bound to another immutable world", () => {
    const f = new Mesh();
    for (const acousticZones of [undefined, {} as never, [null] as never]) {
      const missing = new StudioVirtualSpaceAcousticPolicy({ ...world, acousticZones }, "a"); missing.update(f.snapshot("a"), true);
      expect(missing.check(["a", "b"], "enter").reason).toBe("invalid-world");
    }
    expect(studioAcousticScope(f.policies.get("a"), { ...world, contentRevision: "b".repeat(64) }, ["a", "b"], "enter")).toBeNull();
    f.policies.get("a")!.update({ ...f.snapshot("a"), direct: false }, true);
    expect(f.policies.get("a")!.check(["a", "b"], "enter").reason).toBe("unavailable");
    f.policies.get("a")!.update(f.snapshot("a"), true);
    f.now += 10_000;
    expect(f.policies.get("a")!.check(["a", "b"], "retain").reason).toBe("stale-peer");
  });
});

describe("acoustic policy integrated with actual consent controllers", () => {
  it("rejects cross-room proposals on both proposer and receiver views", () => {
    const f = new Mesh();
    f.positions.set("a", { x: 390, y: 100 }); f.positions.set("b", { x: 410, y: 100 });
    // Only B observes the boundary first; A cannot force its stale public view on B.
    f.policies.get("b")!.update(f.snapshot("b"), true);
    const id = f.social.get("a")!.request("b", "talk"); expect(id).not.toBeNull();
    expect(f.social.get("b")!.respond(id!, "accept")).toBe(false);
    expect(f.accepted).not.toHaveBeenCalled();
    f.advance(350);
    expect(f.social.get("a")!.request("b", "talk")).toBeNull();
    expect(f.groups.get("a")!.propose(["a", "b"])).toBeNull();
  });
  it.each(["other-public-zone", "binding-loss", "leave-and-return"])("does not issue a delayed review proposal after %s even if eligibility recovers", async (cause) => {
    const f = new Mesh(); let resolve!: (allowed: boolean) => void;
    f.authorizeReview.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const result = f.social.get("a")!.requestReview("b", { schemaVersion: 1, workId: "work", projectId: "project", artifactId: "artifact",
      reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) });
    expect(f.authorizeReview).toHaveBeenCalledOnce();
    if (cause === "binding-loss") f.policies.get("a")!.update(f.snapshot("a"), false);
    else {
      f.positions.set("a", { x: 500, y: 100 }); f.positions.set("b", { x: 520, y: 100 }); f.advance(1);
      if (cause === "leave-and-return") { f.positions.set("a", { x: 100, y: 100 }); f.positions.set("b", { x: 120, y: 100 }); }
    }
    f.advance(1); f.advance(350);
    expect(f.policies.get("a")!.check(["a", "b"], "enter").allowed).toBe(true);
    resolve(true); expect(await result).toBeNull();
    expect(f.social.get("b")!.snapshot().requests).toEqual([]); expect(f.accepted).not.toHaveBeenCalled();
  });
  it("cancels an offered action when the receiver leaves before accepting", () => {
    const f = new Mesh(); const id = f.social.get("a")!.request("b", "follow")!;
    f.positions.set("b", { x: 410, y: 100 }); f.advance(1);
    expect(f.social.get("b")!.respond(id, "accept")).toBe(false); expect(f.accepted).not.toHaveBeenCalled();
  });
  it("hard-ends accepted sender media scope while a commit is delayed and never revives on late delivery", () => {
    const f = new Mesh(); f.hold = (packet) => JSON.parse(packet.raw).kind === "commit";
    const id = f.pair(); expect(f.accepted).toHaveBeenCalledExactlyOnceWith("a", id);
    f.positions.set("b", { x: 410, y: 100 }); f.advance(1);
    expect(f.ended).toHaveBeenCalledExactlyOnceWith("a", id);
    for (const packet of f.held.splice(0)) f.deliver(packet);
    expect(f.accepted).toHaveBeenCalledOnce(); expect(f.social.get("b")!.snapshot().requests[0]?.status).toBe("cancelled");
  });
  it("requires every group member to share the permitted zone and hard-closes the whole immutable roster on exit", () => {
    const f = new Mesh(["a", "b", "c", "d"]); const id = f.group(); expect(f.ready).toHaveBeenCalledTimes(4);
    f.positions.set("d", { x: 810, y: 100 }); f.advance(1);
    for (const group of f.groups.values()) expect(group.snapshot().active).toBeNull();
    expect(f.closed).toHaveBeenCalledTimes(4);
    f.positions.set("d", { x: 160, y: 100 }); f.advance(350);
    expect(f.groups.get("d")!.respond(id, "accept")).toBe(false); expect(f.ready).toHaveBeenCalledTimes(4);
  });
  it("rejects a group proposal against the receiver's stricter zone view", () => {
    const f = new Mesh(["a", "b", "c"]);
    f.positions.set("b", { x: 810, y: 100 }); f.policies.get("b")!.update(f.snapshot("b"), true);
    const id = f.groups.get("a")!.propose(["a", "b", "c"]); expect(id).not.toBeNull();
    expect(f.groups.get("b")!.respond(id!, "accept")).toBe(false);
    expect(f.groups.get("c")!.respond(id!, "accept")).toBe(false);
    expect(f.ready).not.toHaveBeenCalled();
  });
  it("cannot complete the final group vote after a member loses its zone and delayed votes arrive", () => {
    const f = new Mesh(["a", "b", "c"]);
    f.hold = (packet) => packet.from === "c" && JSON.parse(packet.raw).kind === "accept";
    const id = f.group(); expect(f.ready).toHaveBeenCalledExactlyOnceWith("c", id);
    f.positions.set("c", { x: 810, y: 100 }); f.policies.get("c")!.update(f.snapshot("c"), true);
    expect(f.closed).toHaveBeenCalledExactlyOnceWith("c", id);
    for (const packet of f.held.splice(0)) f.deliver(packet);
    for (const group of f.groups.values()) expect(group.snapshot().active).toBeNull();
    expect(f.ready).toHaveBeenCalledOnce();
  });
  it("pins consent to the original public zone even when every member moves together into another allowed room", () => {
    const f = new Mesh(); const pairId = f.pair(), groupId = f.group();
    f.positions.set("a", { x: 500, y: 100 }); f.positions.set("b", { x: 520, y: 100 }); f.advance(1);
    expect(f.ended).toHaveBeenCalledWith("a", pairId); expect(f.closed).toHaveBeenCalledWith("a", groupId);
    f.advance(350);
    expect(f.policies.get("a")!.check(["a", "b"], "enter")).toMatchObject({ allowed: true, zoneId: "meeting" });
    expect(f.accepted).toHaveBeenCalledTimes(2); expect(f.ready).toHaveBeenCalledTimes(2);
  });
  it("hard-ends pair and group immediately on binding loss without waiting for proximity grace", () => {
    const f = new Mesh(); const pairId = f.pair(), groupId = f.group();
    f.policies.get("a")!.update(f.snapshot("a"), false);
    expect(f.ended).toHaveBeenCalledWith("a", pairId); expect(f.closed).toHaveBeenCalledWith("a", groupId);
    expect(f.social.get("a")!.request("b", "talk")).toBeNull(); expect(f.groups.get("a")!.snapshot().active).toBeNull();
  });
  it("preserves active hysteresis under more than 128 later roster candidates and releases it on terminal consent", () => {
    const others = Array.from({ length: 22 }, (_, i) => `peer${i}`), f = new Mesh(["a", "b", ...others]);
    for (const id of others) f.positions.set(id, { x: 110, y: 100 });
    f.advance(1); f.advance(350); const pairId = f.pair();
    const groupId = f.groups.get("a")!.propose(["a", "b", "peer0"]);
    expect(groupId).not.toBeNull();
    expect(f.groups.get("b")!.respond(groupId!, "accept")).toBe(true);
    expect(f.groups.get("peer0")!.respond(groupId!, "accept")).toBe(true);
    expect(f.ready).toHaveBeenCalledTimes(3);
    f.positions.set("b", { x: 270, y: 100 }); f.advance(1);
    const policy = f.policies.get("a")!;
    for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) policy.check(["a", others[i]!, others[j]!], "enter");
    f.advance(801);
    expect(f.ended).toHaveBeenCalledWith("a", pairId);
    expect(f.ended).toHaveBeenCalledTimes(2);
    expect(f.social.get("a")!.snapshot().requests.find((request) => request.id === pairId)?.status).toBe("cancelled");
    // A's early cancellation can arrive before B's own expiry check; B also releases its scope.
    expect(f.ended).toHaveBeenCalledWith("b", pairId);
    expect(f.closed).toHaveBeenCalledTimes(3); expect(f.closed).toHaveBeenCalledWith("a", groupId);
    f.positions.set("b", { x: 120, y: 100 }); f.advance(1); f.advance(350);
    expect(policy.check(["a", "b"], "enter").allowed).toBe(true);
  });
  it("keeps consent through 100 permitted-zone boundary oscillations and closes once after sustained distance exit", () => {
    const f = new Mesh(); const pairId = f.pair(), groupId = f.group();
    for (let i = 0; i < 100; i++) { f.positions.set("b", { x: i % 2 ? 250 : 270, y: 100 }); f.advance(25); }
    expect(f.ended).not.toHaveBeenCalled(); expect(f.closed).not.toHaveBeenCalled();
    expect(f.social.get("a")!.snapshot().requests.find((request) => request.id === pairId)?.status).toBe("accepted");
    expect(f.groups.get("a")!.snapshot().active?.id).toBe(groupId);
    f.positions.set("b", { x: 270, y: 100 }); f.advance(1); f.advance(801);
    expect(f.ended).toHaveBeenCalledTimes(2); expect(f.closed).toHaveBeenCalledTimes(2);
    f.advance(1000); expect(f.ended).toHaveBeenCalledTimes(2); expect(f.closed).toHaveBeenCalledTimes(2);
  });
});
