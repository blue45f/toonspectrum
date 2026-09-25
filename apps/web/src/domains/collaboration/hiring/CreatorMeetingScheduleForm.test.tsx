// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MeetingScheduleForm } from "./CreatorMeetingScheduleForm";
import { deferred } from "./creator-meeting.test-fixtures";

import { api } from "@/platform/api";

vi.mock("@/platform/api", () => ({ api: { post: vi.fn() }, getApiErrorMessage: async () => "예약 확인 오류" }));
const scope = { kind: "interview" as const, applicationId: "app-a", teamId: null, participantIds: ["guest-a"] };
beforeEach(() => vi.resetAllMocks()); afterEach(cleanup);
describe("scope-bound meeting scheduling", () => {
  it("sends only once while pending, with explicit timeout and no retries", async () => {
    const pending = deferred<unknown>(), onCreated = vi.fn(); vi.mocked(api.post).mockReturnValueOnce(pending.promise);
    render(<MeetingScheduleForm scope={scope} onCreated={onCreated} />);
    const button = screen.getByRole("button", { name: "일정·초대 저장" }); fireEvent.click(button); fireEvent.click(button);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.post).mock.calls[0][2]).toMatchObject({ timeout: 10000, retry: 0 });
    await act(async () => { pending.resolve({ id: "created-room" }); }); expect(onCreated).toHaveBeenCalledWith("created-room");
  });
  it("ignores the previous target's response after participants change", async () => {
    const pending = deferred<unknown>(), onCreated = vi.fn(); vi.mocked(api.post).mockReturnValueOnce(pending.promise);
    const view = render(<MeetingScheduleForm scope={scope} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("방 이름"), { target: { value: "이전 지원자의 면접" } });
    fireEvent.click(screen.getByRole("button", { name: "일정·초대 저장" }));
    const signal = vi.mocked(api.post).mock.calls[0][2]?.signal;
    view.rerender(<MeetingScheduleForm scope={{ ...scope, applicationId: "app-b", participantIds: ["guest-b"] }} onCreated={onCreated} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => { pending.resolve({ id: "wrong-room" }); }); expect(onCreated).not.toHaveBeenCalled();
    expect((screen.getByLabelText("방 이름") as HTMLInputElement).value).toBe("지원자 면접");
  });
  it("does not navigate after unmount, even if the transport later succeeds", async () => {
    const pending = deferred<unknown>(), onCreated = vi.fn(); vi.mocked(api.post).mockReturnValueOnce(pending.promise);
    const view = render(<MeetingScheduleForm scope={scope} onCreated={onCreated} />);
    fireEvent.click(screen.getByRole("button", { name: "일정·초대 저장" })); view.unmount();
    await act(async () => { pending.resolve({ id: "late-room" }); }); expect(onCreated).not.toHaveBeenCalled();
  });
  it("rejects an invalid interval before sending", () => {
    render(<MeetingScheduleForm scope={scope} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("시작 (기기 시간대)"), { target: { value: "2026-09-21T10:00" } });
    fireEvent.change(screen.getByLabelText("종료 (기기 시간대)"), { target: { value: "2026-09-21T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "일정·초대 저장" }));
    expect(screen.getByRole("alert").textContent).toContain("4시간 이내"); expect(api.post).not.toHaveBeenCalled();
  });
  it("does not pretend a malformed acknowledgement is a successful booking", async () => {
    vi.mocked(api.post).mockResolvedValue({}); const onCreated = vi.fn();
    render(<MeetingScheduleForm scope={scope} onCreated={onCreated} />);
    fireEvent.click(screen.getByRole("button", { name: "일정·초대 저장" }));
    await screen.findByText("예약 확인 오류"); expect(onCreated).not.toHaveBeenCalled(); expect(api.post).toHaveBeenCalledTimes(1);
  });
});
