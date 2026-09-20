// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MeetingRoom } from "./CreatorMeetingRoom";
import { deferred, fixtureMessage, fixtureRoom } from "./creator-meeting.test-fixtures";

import { api } from "@/infrastructure/api";

vi.mock("@/infrastructure/api", () => ({ api: { get: vi.fn(), post: vi.fn() }, getApiErrorMessage: async () => "테스트 연결 오류" }));
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.mocked(api.get).mockImplementation(async (path) => path.endsWith("/messages") ? [fixtureMessage] : structuredClone(fixtureRoom));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("private interview UI recovery", () => {
  it("shows a guest-safe waiting room without host controls and supports error recovery", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("offline"));
    render(<MeetingRoom id="room-a" actor="guest" />);
    await screen.findByText("테스트 연결 오류"); expect(screen.queryByText("대기 안내")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "방 상태 다시 확인" }));
    await screen.findByText("대기 안내");
    expect(screen.queryByRole("button", { name: "회의 종료" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "메시지 대상" })).toBeNull();
  });
  it("preserves an unsent draft through failure and manual recovery without automatic resend", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error("uncertain"));
    render(<MeetingRoom id="room-a" actor="guest" />);
    const input = await screen.findByRole("textbox", { name: "메시지" }); fireEvent.change(input, { target: { value: "소중한 초안" } });
    fireEvent.click(screen.getByRole("button", { name: "텍스트 보내기" }));
    await screen.findByText("테스트 연결 오류"); expect(api.post).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "방 상태 다시 확인" }));
    expect((await screen.findByRole("textbox", { name: "메시지" }) as HTMLTextAreaElement).value).toBe("소중한 초안");
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it("sends once and clears only a server-confirmed message", async () => {
    const pending = deferred<unknown>(); vi.mocked(api.post).mockReturnValueOnce(pending.promise);
    render(<MeetingRoom id="room-a" actor="guest" />);
    fireEvent.change(await screen.findByRole("textbox", { name: "메시지" }), { target: { value: "안녕하세요" } });
    const button = screen.getByRole("button", { name: "텍스트 보내기" }); fireEvent.click(button); fireEvent.click(button);
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ id: "saved-message" }); });
    await waitFor(() => expect((screen.getByRole("textbox", { name: "메시지" }) as HTMLTextAreaElement).value).toBe(""));
  });
  it("clears visible private data offline and rereads before restoring controls", async () => {
    render(<MeetingRoom id="room-a" actor="guest" />); await screen.findByText("대기 안내");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false); fireEvent(window, new Event("offline"));
    expect(screen.queryByText("대기 안내")).toBeNull(); expect(screen.queryByRole("textbox", { name: "메시지" })).toBeNull();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true); fireEvent(window, new Event("online"));
    await screen.findByText("대기 안내"); expect(api.get).toHaveBeenCalledTimes(4);
  });
  it("switching rooms clears the previous draft and ignores its late response", async () => {
    const view = render(<MeetingRoom id="room-a" actor="guest" />);
    fireEvent.change(await screen.findByRole("textbox", { name: "메시지" }), { target: { value: "이전 방 초안" } });
    vi.mocked(api.get).mockImplementation(async (path) => path.endsWith("/messages") ? [] : { ...fixtureRoom, id: "room-b", title: "새 면접" });
    view.rerender(<MeetingRoom id="room-b" actor="guest" />);
    await screen.findByRole("heading", { name: "새 면접" });
    expect((screen.getByRole("textbox", { name: "메시지" }) as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByText("대기 안내")).toBeNull();
  });
  it("does not expose device tests or writing controls for an ended room", async () => {
    vi.mocked(api.get).mockResolvedValue({ ...fixtureRoom, status: "ended" });
    render(<MeetingRoom id="room-a" actor="guest" />); await screen.findByRole("heading", { name: fixtureRoom.title });
    expect(screen.queryByText("장치 테스트 시작")).toBeNull(); expect(screen.queryByRole("textbox")).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
