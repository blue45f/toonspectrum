import { describe, expect, it } from "vitest";
import { parseStudioLiveAcousticInvalidation, studioLiveAcousticJoinBinding } from "./studio-live-acoustic-control";

const hint = { version: 1, workId: "work-1", conversationId: "00000000-0000-4000-8000-000000000001", selfSessionEpoch: "00000000-0000-4000-8000-000000000002" };
describe("Core acoustic identity and invalidation admission", () => {
  it("requires the exact acknowledged local client identity and immutable bounded identifiers", () => {
    const binding = { connectionId: "socket-1", clientInstanceId: "client-1" };
    expect(studioLiveAcousticJoinBinding(binding, "client-1")).toEqual(binding);
    expect(Object.isFrozen(studioLiveAcousticJoinBinding(binding, "client-1"))).toBe(true);
    for (const value of [{ ...binding, clientInstanceId: "other" }, { ...binding, connectionId: " socket-1" },
      { ...binding, clientInstanceId: "x".repeat(81) }, { ...binding, grant: true }]) {
      expect(studioLiveAcousticJoinBinding(value, "client-1")).toBeNull();
    }
  });
  it("accepts only a strict current-work hint, never a peer's grant or expanded roster", () => {
    expect(parseStudioLiveAcousticInvalidation(hint, "work-1")).toEqual(hint);
    for (const value of [{ ...hint, workId: "other" }, { ...hint, version: 2 }, { ...hint, selfSessionEpoch: "old" },
      { ...hint, allowed: true }, { ...hint, members: ["peer"] }]) {
      expect(parseStudioLiveAcousticInvalidation(value, "work-1")).toBeNull();
    }
  });
});
