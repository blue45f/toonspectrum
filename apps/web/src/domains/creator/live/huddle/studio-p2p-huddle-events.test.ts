// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { normalizeStudioP2pHuddleOpenDetail } from "./studio-p2p-huddle-events";

describe("huddle conversation intent", () => {
  it("rejects invalid or incomplete consent scopes instead of widening to every peer", () => {
    expect(normalizeStudioP2pHuddleOpenDetail({ conversationId: "call" })).toBeNull();
    expect(normalizeStudioP2pHuddleOpenDetail({ conversationId: "call", peerIds: [] })).toBeNull();
    expect(normalizeStudioP2pHuddleOpenDetail({ conversationId: "call", peerIds: ["a", "b", "c", "d"] })).toBeNull();
    expect(normalizeStudioP2pHuddleOpenDetail({ conversationId: "call", peerIds: ["invalid/peer"] })).toBeNull();
    expect(normalizeStudioP2pHuddleOpenDetail({ conversationId: "invalid/call", peerIds: ["b"] })).toBeNull();
  });
  it("preserves toolbar compatibility and stable explicit conversation membership", () => {
    expect(normalizeStudioP2pHuddleOpenDetail({ source: "toolbar" })).toEqual({
      source: "toolbar", peerIds: undefined, conversationId: undefined,
    });
    expect(normalizeStudioP2pHuddleOpenDetail({ conversationId: "9a00e361-e6c4-43a6-8e7e-ecdf221f0001:1.4", peerIds: ["b", "c"] })).toEqual({
      source: "unknown", peerIds: ["b", "c"], conversationId: "9a00e361-e6c4-43a6-8e7e-ecdf221f0001:1.4",
    });
  });
});
