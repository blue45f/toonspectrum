import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCreatorMeetingSession } from "./creator-meeting-session";
import { deferred, fixtureMessage, fixtureRoom } from "./creator-meeting.test-fixtures";

import type { CreatorRoom } from "../../../../../../packages/contracts/src/creator-hiring";

vi.mock("@/platform/api", () => ({ api: {}, getApiErrorMessage: async () => "연결 확인 실패" }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function setup() {
  let available = true;
  const client = { read: vi.fn(async () => ({ room: structuredClone(fixtureRoom), messages: [fixtureMessage] })), send: vi.fn(async () => undefined) };
  const session = createCreatorMeetingSession("room-a", "guest", { client, available: () => available, now: () => 123 });
  return { client, session, availability: (value: boolean) => { available = value; } };
}
describe("private room lifecycle and singular writes", () => {
  it("performs no work until mounted, then polls serially every five seconds after completion", async () => {
    const { session, client } = setup(); expect(client.read).not.toHaveBeenCalled();
    session.start(); session.start(); await flush();
    expect(session.getSnapshot()).toMatchObject({ phase: "ready", lastCheckedAt: 123 });
    await vi.advanceTimersByTimeAsync(4999); expect(client.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(client.read).toHaveBeenCalledTimes(2);
    session.dispose(); await vi.advanceTimersByTimeAsync(20000); expect(client.read).toHaveBeenCalledTimes(2);
  });
  it("does not overlap refreshes while a request is pending", async () => {
    const { session, client } = setup(), pending = deferred<{ room: CreatorRoom; messages: typeof fixtureMessage[] }>();
    client.read.mockReturnValueOnce(pending.promise); session.start(); session.refresh(); session.refresh();
    await vi.advanceTimersByTimeAsync(30000); expect(client.read).toHaveBeenCalledTimes(1);
    pending.resolve({ room: fixtureRoom, messages: [] }); await flush(); session.dispose();
  });
  it.each(["ended", "left"])("stops repeated polling and text reads after %s", async (status) => {
    const { session, client } = setup();
    const room = structuredClone(fixtureRoom);
    if (status === "ended") room.status = status; else room.myStatus = "left";
    client.read.mockResolvedValue({ room, messages: [] }); session.start(); await flush();
    await vi.advanceTimersByTimeAsync(30000); expect(client.read).toHaveBeenCalledTimes(1);
    expect(await session.send({ type: "messages", text: "no", audience: "lobby" })).toBe(false); session.dispose();
  });
  it("hides stale private data and pauses network use until genuine recovery", async () => {
    const { session, client, availability } = setup(); session.start(); await flush();
    availability(false); session.suspend();
    expect(session.getSnapshot()).toMatchObject({ phase: "paused", room: null, messages: [] });
    session.refresh(); await vi.advanceTimersByTimeAsync(20000); expect(client.read).toHaveBeenCalledTimes(1);
    availability(true); session.resume(); session.resume(); await flush(); expect(client.read).toHaveBeenCalledTimes(2); session.dispose();
  });
  it("cannot apply an old response or schedule its timer after hide/resume", async () => {
    const { session, client, availability } = setup(), pending = deferred<{ room: CreatorRoom; messages: typeof fixtureMessage[] }>();
    client.read.mockReturnValueOnce(pending.promise); session.start();
    availability(false); session.suspend(); availability(true); session.resume(); await flush();
    pending.resolve({ room: { ...fixtureRoom, title: "오래된 결과" }, messages: [] }); await flush();
    expect(session.getSnapshot().room?.title).toBe(fixtureRoom.title); expect(vi.getTimerCount()).toBe(1); session.dispose();
  });
  it("surfaces an error once, clears private data and supports explicit recovery without retries", async () => {
    const { session, client } = setup(); client.read.mockRejectedValueOnce(new Error("offline")); session.start(); await flush();
    expect(session.getSnapshot()).toMatchObject({ phase: "error", room: null, messages: [], error: "연결 확인 실패" });
    await vi.advanceTimersByTimeAsync(60000); expect(client.read).toHaveBeenCalledTimes(1);
    session.refresh(); await flush(); expect(session.getSnapshot().phase).toBe("ready"); session.dispose();
  });
  it("blocks duplicate sends synchronously and aborts an older read before a write", async () => {
    const { session, client } = setup(), pending = deferred<undefined>(); session.start(); await flush();
    client.send.mockReturnValueOnce(pending.promise);
    const command = { type: "messages" as const, text: "안녕하세요", audience: "lobby" as const };
    const first = session.send(command); const second = session.send(command); session.refresh();
    expect(await second).toBe(false); expect(client.send).toHaveBeenCalledTimes(1); expect(session.getSnapshot().busy).toBe(true);
    pending.resolve(undefined); expect(await first).toBe(true); await flush(); expect(client.read).toHaveBeenCalledTimes(2); session.dispose();
  });
  it("does not resend uncertain writes and retains a clear recovery notice", async () => {
    const { session, client } = setup(); session.start(); await flush(); client.send.mockRejectedValue(new Error("lost ack"));
    expect(await session.send({ type: "messages", text: "hello", audience: "lobby" })).toBe(false);
    await vi.advanceTimersByTimeAsync(60000); expect(client.send).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({ phase: "error", room: null, messages: [], busy: false });
    expect(session.getSnapshot().notice).toContain("자동으로 다시 전송하지 않습니다"); session.dispose();
  });
  it("never acknowledges a late write after hiding or disposal", async () => {
    const { session, client, availability } = setup(), pending = deferred<undefined>(); session.start(); await flush();
    client.send.mockReturnValueOnce(pending.promise); const result = session.send({ type: "messages", text: "hello", audience: "lobby" });
    availability(false); session.suspend(); expect(session.getSnapshot().notice).toContain("결과는 아직 확인되지");
    pending.resolve(undefined); expect(await result).toBe(false); expect(client.read).toHaveBeenCalledTimes(1); session.dispose();
  });
  it("rejects guest host controls and unapproved audiences without sending", async () => {
    const { session, client } = setup(); session.start(); await flush();
    expect(await session.send({ type: "host", action: "end", targetAccountId: null })).toBe(false);
    expect(await session.send({ type: "messages", text: "private", audience: "admitted" })).toBe(false);
    expect(await session.send({ type: "messages", text: "  ", audience: "lobby" })).toBe(false);
    expect(client.send).not.toHaveBeenCalled(); session.dispose();
  });
  it("supports StrictMode setup-cleanup-setup without stale completion", async () => {
    const { session, client } = setup(), pending = deferred<{ room: CreatorRoom; messages: typeof fixtureMessage[] }>();
    client.read.mockReturnValueOnce(pending.promise); session.start(); session.dispose(); session.start(); await flush();
    pending.resolve({ room: { ...fixtureRoom, title: "old mount" }, messages: [] }); await flush();
    expect(session.getSnapshot().room?.title).toBe(fixtureRoom.title); expect(vi.getTimerCount()).toBe(1); session.dispose();
  });
});
