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
  it("retries uncertain requests unchanged, and uses a fresh request after success or a terms edit", async () => {
    const candidate = { userId: "candidate", displayName: "작가", reasons: ["선화 역할"], confirmedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() } as HiringCandidate;
    vi.mocked(hiringMatchingClient.discover).mockResolvedValue({ items: [candidate], ordering: "account-id", limit: 30 });
    vi.mocked(hiringMatchingClient.send).mockRejectedValueOnce(new Error("uncertain")).mockResolvedValue({ id: "offer" });
    const slot: HiringSlot = { id: "slot", postId: "post", revision: 1, state: "open", terms: emptyTerms(), createdAt: new Date().toISOString() };
    const view = render(<HiringDiscovery slot={slot} />);
    expect(screen.getByText(/작업 여력을 먼저 확인한 뒤 계정 식별자 순으로 최대 30명만/u)).toBeTruthy();
    expect(screen.getByText(/다음 페이지는 제공하지 않습니다/u)).toBeTruthy();
    fireEvent.click(screen.getByText("조건에 맞는 후보 찾기"));
    const send = await screen.findByText("이 조건으로 30분 유효 제안 보내기");
    fireEvent.click(send); await screen.findByText("연결 실패");
    fireEvent.click(send); await screen.findByText(/제안 저장을 확인했어요/u);
    const calls = vi.mocked(hiringMatchingClient.send).mock.calls;
    expect(calls[1][2]).toEqual(calls[0][2]);
    fireEvent.click(send); await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2][2].mutationId).not.toBe(calls[1][2].mutationId);
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    view.rerender(<HiringDiscovery slot={{ ...slot, revision: 2 }} />);
    fireEvent.click(send); await waitFor(() => expect(calls).toHaveLength(4));
    expect(calls[3][2].expectedRevision).toBe(2); expect(calls[3][2].mutationId).not.toBe(calls[2][2].mutationId);
  });
});
