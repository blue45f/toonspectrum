// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emptyTerms } from "./hiring-form-values";
import { hiringMatchingClient } from "./hiring-matching-client";
import { HiringDiscovery } from "./HiringOffersPanel";

import type { HiringCandidate, HiringSlot } from "../../../../../../packages/contracts/src/creator-hiring";

vi.mock("./hiring-matching-client", () => ({ hiringMatchingClient: { discover: vi.fn(), send: vi.fn() } }));
vi.mock("@/infrastructure/api", () => ({ getApiErrorMessage: async () => "연결 실패" }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("offer request identity", () => {
  it("retries uncertain requests unchanged, and blocks repeated success and re-queries after a terms edit", async () => {
    const candidate = { userId: "candidate", displayName: "작가", reasons: ["선화 역할"], confirmedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() } as HiringCandidate;
    vi.mocked(hiringMatchingClient.discover).mockResolvedValue({ items: [candidate], ordering: "account-id", limit: 30, next: null, termsRevision: 1, observedAt: new Date().toISOString() });
    vi.mocked(hiringMatchingClient.send).mockRejectedValueOnce(new Error("uncertain")).mockResolvedValue({ id: "offer" });
    const slot: HiringSlot = { id: "slot", postId: "post", revision: 1, state: "open", terms: emptyTerms(), createdAt: new Date().toISOString() };
    const view = render(<HiringDiscovery slot={slot} />);
    expect(screen.getByText(/계정 식별자 순으로 한 페이지 최대 30명씩/u)).toBeTruthy();
    expect(screen.getByText(/다음 페이지에서도 최신 상태/u)).toBeTruthy();
    fireEvent.click(screen.getByText("조건에 맞는 후보 찾기"));
    const send = await screen.findByText("이 조건으로 30분 유효 제안 보내기");
    fireEvent.click(send); await screen.findByText("연결 실패");
    fireEvent.click(send); await screen.findByText(/제안 저장을 확인했어요/u);
    const calls = vi.mocked(hiringMatchingClient.send).mock.calls;
    expect(calls[1][2]).toEqual(calls[0][2]);
    const complete = screen.getByRole("button", { name: "제안 저장 완료" });
    expect((complete as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(complete); expect(calls).toHaveLength(2);
    vi.mocked(hiringMatchingClient.discover).mockResolvedValue({ items: [candidate], ordering: "account-id", limit: 30, next: null, termsRevision: 2, observedAt: new Date().toISOString() });
    view.rerender(<HiringDiscovery slot={{ ...slot, revision: 2 }} />);
    expect(screen.queryByText("작가")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "조건에 맞는 후보 찾기" }));
    fireEvent.click(await screen.findByText("이 조건으로 30분 유효 제안 보내기"));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2][2].expectedRevision).toBe(2);
    expect(calls[2][2].mutationId).not.toBe(calls[1][2].mutationId);
  });
});
