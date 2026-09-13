import { describe, expect, it } from "vitest";
import { encodeStudioDirectPacket, parseStudioDirectPacket } from "../studio-live-direct-port";
import { huddleRtcConfiguration, parseHuddlePacket } from "./studio-p2p-huddle-protocol";

const state = { kind: "state", epoch: "epoch-1", muted: true, camera: false, sharing: false, hand: false };
describe("direct-only huddle protocol", () => {
  it("round-trips state without treating strings as booleans", () => {
    expect(parseHuddlePacket(JSON.stringify(state))).toEqual(state);
    expect(parseHuddlePacket(JSON.stringify({ ...state, muted: "false" }))).toBeNull();
  });
  it.each(["null", "[]", "{", JSON.stringify({ ...state, epoch: "../oops" }),
    JSON.stringify({ ...state, camera: true, sharing: true }),
    JSON.stringify({ kind: "chat", epoch: "e", id: "x", text: " " }),
    JSON.stringify({ kind: "chat", epoch: "e", id: "x", text: "가".repeat(2001) }),
    JSON.stringify({ kind: "reaction", epoch: "e", id: "x", emoji: "not-allowed" }),
  ])("rejects malformed input %s", (raw) => { expect(parseHuddlePacket(raw)).toBeNull(); });
  it("requires target epochs and validates ICE candidates", () => {
    const ice = { kind: "ice", epoch: "e", toEpoch: "target", candidate: { candidate: "candidate:1", sdpMLineIndex: 0 } };
    expect(parseHuddlePacket(JSON.stringify(ice))).toEqual(ice);
    expect(parseHuddlePacket(JSON.stringify({ ...ice, toEpoch: undefined }))).toBeNull();
    expect(parseHuddlePacket(JSON.stringify({ ...ice, candidate: { candidate: "x", sdpMLineIndex: -1 } }))).toBeNull();
  });
  it("bounds UTF-8 bytes and isolates work ids", () => {
    const encoded = encodeStudioDirectPacket("work-a", "안녕하세요");
    expect(encoded).not.toBeNull();
    expect(parseStudioDirectPacket(JSON.parse(encoded!), "work-a")).toBe("안녕하세요");
    expect(parseStudioDirectPacket(JSON.parse(encoded!), "work-b")).toBeNull();
    expect(encodeStudioDirectPacket("work-a", "가".repeat(24000))).toBeNull();
  });
  it("has no TURN or credentials, regardless of server policy", () => {
    expect(huddleRtcConfiguration().iceServers).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
    expect(JSON.stringify(huddleRtcConfiguration())).not.toMatch(/turn:|turns:|credential|username/);
  });
});
