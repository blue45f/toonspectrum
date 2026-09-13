import { afterEach, describe, expect, it, vi } from "vitest";
import { HuddleActivities, parseHuddleActivity } from "./studio-p2p-activities";
import { StudioP2pCreativeHuddleController } from "./studio-p2p-creative-huddle-controller";
import type { StudioLiveParticipant } from "../studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../studio-live-direct-port";

const sessions: StudioP2pCreativeHuddleController[] = [];
afterEach(() => { sessions.splice(0).forEach((c) => c.close()); vi.useRealTimers(); });
function mesh() {
  vi.useFakeTimers(); vi.setSystemTime(100_000);
  const people: StudioLiveParticipant[] = ["a", "b"].map((sessionId) => ({ sessionId, displayName: sessionId, role: "editor" }));
  const listeners = new Map<string, Set<(sender: StudioLiveParticipant, raw: string) => void>>();
  const packets: { from: string; target: string; raw: string }[] = []; let drop = false;
  const make = (i: number) => {
    const self = people[i]; let n = 0;
    const port: StudioLiveDirectPort = { getPeers: () => people.filter((p) => p !== self),
      subscribe: (fn) => { const set = listeners.get(self.sessionId) ?? new Set(); set.add(fn); listeners.set(self.sessionId, set); return () => { set.delete(fn); }; },
      send: (target, raw) => { packets.push({ from: self.sessionId, target, raw });
        if (drop && JSON.parse(raw).kind === "activity") return false;
        for (const fn of [...(listeners.get(target) ?? [])]) fn(self, raw); return true; } };
    const c = new StudioP2pCreativeHuddleController(self, port, { id: () => `${self.sessionId}-${++n}`, now: () => Date.now() + i * 1_000_000 });
    sessions.push(c); c.start(); return c;
  };
  const a = make(0), b = make(1); vi.advanceTimersByTime(3000);
  return { a, b, packets, make, drop: (value: boolean) => { drop = value; },
    inject: (sender: StudioLiveParticipant, packet: unknown) => { for (const fn of listeners.get("b") ?? []) fn(sender, JSON.stringify(packet)); } };
}
const empty = { sequence: 1, challenge: null, poll: null, votes: [] };
describe("creative activity wire validation", () => {
  it.each([null, [], {}, { ...empty, sequence: 0 }, { ...empty, sequence: 1e20 },
    { ...empty, votes: Array(5).fill({ owner: "a", pollId: "p", choice: 0 }) },
    { ...empty, challenge: { id: "r", title: "round", prompt: "draw", remainingMs: -1, running: true } },
    { ...empty, poll: { id: "p", question: "?", options: ["A", " A "], open: true } },
    { ...empty, votes: [{ owner: "a", pollId: "p", choice: 4 }] },
  ])("rejects malformed or oversized state %#", (value) => expect(parseHuddleActivity(value)).toBeNull());
  it("reconstructs accepted fields and drops injected tallies", () => {
    expect(parseHuddleActivity({ ...empty, counts: [1000], voter: "admin" })).toEqual(empty);
  });
});
describe("P2P creative activities", () => {
  it("preserves chat receipts alongside new activities", () => {
    const { a, b } = mesh(); a.sendChat("새 기능도 P2P");
    expect(b.snapshot().messages[0]?.text).toBe("새 기능도 P2P"); expect(a.snapshot().messages[0]?.received).toEqual(["b"]);
  });
  it("shares remaining duration despite large device clock offsets", () => {
    const { a, b } = mesh(); expect(a.startChallenge("gesture")).toBe(true);
    expect(b.snapshot().activities[0]?.challenge?.remainingMs).toBe(60_000);
    vi.advanceTimersByTime(1200);
    expect(b.snapshot().activities[0]?.challenge?.remainingMs).toBe(58_800);
    expect(b.toggleChallenge()).toBe(false);
    expect(a.toggleChallenge()).toBe(true); vi.advanceTimersByTime(4000);
    expect(b.snapshot().activities[0]?.challenge).toMatchObject({ remainingMs: 58_800, running: false });
    a.toggleChallenge(); vi.advanceTimersByTime(60_000);
    expect(b.snapshot().activities[0]?.challenge).toMatchObject({ remainingMs: 0, running: false });
  });
  it("counts one current vote per session and removes departed votes", () => {
    const { a, b } = mesh(); a.createPoll("구도 선택", ["A", "B"]); a.vote("a", 0); b.vote("a", 1);
    expect(a.snapshot().activities[0]?.poll?.counts).toEqual([1, 1]);
    b.vote("a", 0); expect(a.snapshot().activities[0]?.poll?.counts).toEqual([2, 0]);
    b.close(); expect(a.snapshot().activities[0]?.poll?.counts).toEqual([1, 0]);
    a.clearPoll(); expect(a.snapshot().activities).toEqual([]);
  });
  it("recovers dropped state and hydrates a later joining session", () => {
    const { a, b, drop, make } = mesh(); drop(true);
    expect(a.startChallenge("expressions")).toBe(false); expect(b.snapshot().activities).toEqual([]);
    drop(false); vi.advanceTimersByTime(3000); expect(b.snapshot().activities).toHaveLength(1);
    b.close(); const next = make(1); vi.advanceTimersByTime(3000);
    expect(next.snapshot().activities[0]?.challenge?.title).toBe("표정 6컷");
  });
  it("ignores stale epochs, viewers and unknown senders", () => {
    const { a, b, packets, inject } = mesh(); a.createPoll("구도", ["A", "B"]);
    const packet = JSON.parse(packets.find((p) => p.from === "a" && JSON.parse(p.raw).state?.poll)?.raw ?? "{}");
    const author: StudioLiveParticipant = { sessionId: "a", role: "editor", displayName: "A" };
    const changed = { ...packet, state: { ...packet.state, sequence: 999, poll: { ...packet.state.poll, question: "forged" } } };
    inject(author, { ...changed, epoch: "stale" }); inject({ ...author, role: "viewer" }, changed); inject({ ...author, sessionId: "unknown" }, changed);
    expect(b.snapshot().activities[0]?.poll?.question).toBe("구도");
    b.block("a"); inject(author, changed); expect(b.snapshot().activities).toEqual([]);
  });
  it("requires peers, validates options, and prevents actions after leaving", () => {
    const { a } = mesh(); expect(a.createPoll("?", ["same", "same"])).toBe(false);
    a.close(); expect(a.startChallenge("gesture")).toBe(false); expect(a.snapshot().activities).toEqual([]);
    const isolated = new HuddleActivities("x", () => 0, () => "id", () => [], () => true);
    expect(isolated.startChallenge("gesture")).toBe(false);
  });
});
