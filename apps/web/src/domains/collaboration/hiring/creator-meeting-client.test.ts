import { beforeEach, describe, expect, it, vi } from "vitest";

import { creatorMeetingClient, parseCreatorRoom, parseCreatorRoomMessages } from "./creator-meeting-client";
import { deferred, fixtureMessage, fixtureRoom } from "./creator-meeting.test-fixtures";

import { api } from "@/platform/api";

vi.mock("@/platform/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
describe("private meeting response boundary", () => {
  it("accepts only the expected room and current participant projection", () => {
    expect(parseCreatorRoom(fixtureRoom, "room-a", "guest")).toEqual(fixtureRoom);
    expect(() => parseCreatorRoom(fixtureRoom, "room-b", "guest")).toThrow();
    expect(() => parseCreatorRoom(fixtureRoom, "room-a", "other")).toThrow();
  });
  it.each([
    {}, { ...fixtureRoom, participants: null }, { ...fixtureRoom, epoch: 0 },
    { ...fixtureRoom, myStatus: "admitted" }, { ...fixtureRoom, startsAt: fixtureRoom.endsAt },
    { ...fixtureRoom, participants: [...fixtureRoom.participants, fixtureRoom.participants[0]] },
    { ...fixtureRoom, media: { ...fixtureRoom.media, recordingEnabled: true } },
    { ...fixtureRoom, participants: [...fixtureRoom.participants, { userId: "other", displayName: "다른 지원자", role: "guest", status: "waiting" }] },
  ])("rejects malformed or over-disclosed room data", (value) => {
    expect(() => parseCreatorRoom(value, "room-a", "guest")).toThrow();
  });
  it("bounds and validates text messages without treating failure as an empty conversation", () => {
    expect(parseCreatorRoomMessages([fixtureMessage])).toEqual([fixtureMessage]);
    for (const invalid of [{}, null, [fixtureMessage, fixtureMessage], [{ ...fixtureMessage, createdAt: "bad-date" }], [{ ...fixtureMessage, text: "x".repeat(2001) }]]) {
      expect(() => parseCreatorRoomMessages(invalid)).toThrow();
    }
  });
  it("reads messages only after room verification, with that epoch and bounded no-retry options", async () => {
    const c = new AbortController();
    vi.mocked(api.get).mockResolvedValueOnce(fixtureRoom).mockResolvedValueOnce([fixtureMessage]);
    expect(await creatorMeetingClient.read("room-a", "guest", c.signal)).toEqual({ room: fixtureRoom, messages: [fixtureMessage] });
    expect(api.get).toHaveBeenNthCalledWith(2, "/collaborations/rooms/room-a/messages", { signal: c.signal, timeout: 10000, retry: 0, params: { epoch: 3 } });
  });
  it.each(["ended", "left", "removed"])("does not request conversation data for terminal state %s", async (status) => {
    const room = structuredClone(fixtureRoom);
    if (status === "ended") room.status = status;
    else { room.myStatus = status as "left" | "removed"; room.participants[1].status = room.myStatus; }
    vi.mocked(api.get).mockResolvedValue(room);
    const response = await creatorMeetingClient.read("room-a", "guest", new AbortController().signal);
    expect(response.messages).toEqual([]); expect(api.get).toHaveBeenCalledTimes(1);
  });
  it("aborts before messages even when the previous transport ignores cancellation", async () => {
    const pending = deferred<unknown>(), c = new AbortController();
    vi.mocked(api.get).mockReturnValueOnce(pending.promise);
    const result = creatorMeetingClient.read("room-a", "guest", c.signal);
    c.abort(); pending.resolve(fixtureRoom);
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  it("requires a valid server acknowledgement and never enables transport write retry", async () => {
    const c = new AbortController();
    vi.mocked(api.post).mockResolvedValueOnce({});
    await expect(creatorMeetingClient.send("room-a", 3, { type: "messages", text: "안녕하세요", audience: "lobby" }, c.signal)).rejects.toThrow();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenLastCalledWith("/collaborations/rooms/room-a/messages", { expectedEpoch: 3, text: "안녕하세요", audience: "lobby" }, { signal: c.signal, timeout: 10000, retry: 0 });
  });
});
