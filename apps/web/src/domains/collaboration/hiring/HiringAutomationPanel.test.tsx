// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HiringAutomationPanel } from "./HiringAutomationPanel";
import { automaticInvitations } from "./hiring-automation-client";
import { emptyTerms } from "./hiring-form-values";

import type { AutomaticInvitationState } from "./hiring-automation-client";
import type { HiringSlot } from "../../../../../../packages/contracts/src/creator-hiring";

vi.mock("./hiring-automation-client", () => ({ automaticInvitations: { read: vi.fn(), start: vi.fn(), stop: vi.fn() } }));
vi.mock("@/infrastructure/api", () => ({ getApiErrorMessage: async () => "요청 결과를 확인하지 못했어요" }));
const available: AutomaticInvitationState = { enabled: true, supported: true, job: null };
const slot: HiringSlot = { id: "slot", postId: "post", revision: 1, state: "open", terms: emptyTerms(), createdAt: new Date().toISOString() };
const running: AutomaticInvitationState = { ...available, job: { id: "job", generation: 1, termsRevision: 1, status: "queued", attempts: 0, nextExecutionAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
beforeEach(() => {
  vi.mocked(automaticInvitations.read).mockReset().mockResolvedValue(available);
  vi.mocked(automaticInvitations.start).mockReset().mockResolvedValue({ id: "job" });
  vi.mocked(automaticInvitations.stop).mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("explicit automatic urgent invitation controls", () => {
  it("does not send or expose start when the operator capability is off", async () => {
    vi.mocked(automaticInvitations.read).mockResolvedValue({ ...available, enabled: false });
    render(<HiringAutomationPanel slot={slot} postVersion={3} />);
    await screen.findByText(/자동 초대가 운영 설정에서 꺼져/u);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(automaticInvitations.start).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "동의한 조건으로 자동 초대 시작" })).toBeNull();
  });
  it("requires version-specific consent and retains an uncertain request identity", async () => {
    vi.mocked(automaticInvitations.start).mockRejectedValueOnce(new Error("uncertain")).mockResolvedValue({ id: "job" });
    render(<HiringAutomationPanel slot={slot} postVersion={3} />);
    const start = await screen.findByRole("button", { name: "동의한 조건으로 자동 초대 시작" });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(start);
    await screen.findByText("요청 결과를 확인하지 못했어요");
    fireEvent.click(start);
    await screen.findByText(/자동 초대를 예약했어요/u);
    const calls = vi.mocked(automaticInvitations.start).mock.calls;
    expect(calls).toHaveLength(2); expect(calls[0][2]).toEqual(calls[1][2]);
    expect(calls[0][2]).toMatchObject({ expectedPostVersion: 3, expectedRevision: 1, mode: "automatic" });
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });
  it("clears consent and stale request state when terms change", async () => {
    const view = render(<HiringAutomationPanel slot={slot} postVersion={3} />);
    fireEvent.click(await screen.findByRole("checkbox"));
    view.rerender(<HiringAutomationPanel slot={{ ...slot, revision: 2 }} postVersion={4} />);
    expect((await screen.findByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/공고 버전 4 · 모집 조건 버전 2/u)).toBeTruthy();
  });
  it("allows stopping an existing queue after the operator disables new jobs", async () => {
    vi.mocked(automaticInvitations.read).mockResolvedValue({ ...running, enabled: false });
    render(<HiringAutomationPanel slot={slot} postVersion={3} />);
    fireEvent.click(await screen.findByRole("button", { name: "자동 초대·대기 초대 중지" }));
    await screen.findByText(/유효한 대기 초대를 중지했어요/u);
    await waitFor(() => expect(automaticInvitations.stop).toHaveBeenCalledTimes(1));
    expect(automaticInvitations.start).not.toHaveBeenCalled();
  });
  it("aborts pending work on unmount and ignores a late transport response", async () => {
    let resolve!: (result: { id: string }) => void;
    vi.mocked(automaticInvitations.start).mockImplementation(() => new Promise((yes) => { resolve = yes; }));
    const view = render(<HiringAutomationPanel slot={slot} postVersion={3} />);
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "동의한 조건으로 자동 초대 시작" }));
    const signal = vi.mocked(automaticInvitations.start).mock.calls[0][3];
    view.unmount(); expect(signal?.aborted).toBe(true);
    await act(async () => resolve({ id: "job" }));
    expect(automaticInvitations.read).toHaveBeenCalledTimes(1);
  });
});
