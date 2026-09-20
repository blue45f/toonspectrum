// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HiringDiscovery } from "./HiringDiscovery";
import { hiringMatchingClient } from "./hiring-matching-client";
import { emptyTerms } from "./hiring-form-values";
import type { HiringCandidate, HiringCandidatePage, HiringSlot } from "../../../../../../packages/contracts/src/creator-hiring";

vi.mock("./hiring-matching-client", () => ({ hiringMatchingClient: { discover: vi.fn(), send: vi.fn() } }));
vi.mock("@/infrastructure/api", () => ({ getApiErrorMessage: async () => "연결 실패" }));
const discover = vi.mocked(hiringMatchingClient.discover);
const send = vi.mocked(hiringMatchingClient.send);
const slot: HiringSlot = { id: "slot", postId: "post", revision: 1, state: "open", terms: emptyTerms(), createdAt: new Date().toISOString() };
const candidate = (id: string): HiringCandidate => ({ userId: id, displayName: id, roles: ["lineart"], tools: [], formats: [], startsAt: new Date(Date.now()-1000).toISOString(), endsAt: new Date(Date.now()+7200000).toISOString(), confirmedAt: new Date().toISOString(), expiresAt: new Date(Date.now()+60000).toISOString(), capacity: 1, minRate: 1000, rateUnit: "cut", reasons: ["선화 역할"] });
const page = (id: string, next: string | null = null): HiringCandidatePage => ({ items: [candidate(id)], limit: 30, ordering: "account-id", next, termsRevision: 1, observedAt: new Date().toISOString() });
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
const search = () => fireEvent.click(screen.getByRole("button", { name: "조건에 맞는 후보 찾기" }));
beforeEach(() => { discover.mockReset(); send.mockReset().mockResolvedValue({ id: "offer" }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("candidate discovery lifecycle", () => {
  it("fetches only on explicit request and pins the displayed revision", async () => {
    discover.mockResolvedValue(page("작가A")); render(<HiringDiscovery slot={slot} />);
    expect(discover).not.toHaveBeenCalled(); search(); await screen.findByText("작가A");
    expect(discover.mock.calls[0].slice(0,3)).toEqual(["post","slot",{ expectedRevision:1 }]);
    expect(discover.mock.calls[0][3]).toBeInstanceOf(AbortSignal);
    expect(screen.getByText("1페이지 · 이 페이지 1명 · 조건 버전 1")).toBeTruthy();
  });
  it("moves forward and back without inventing totals", async () => {
    discover.mockResolvedValueOnce(page("작가A","next")).mockResolvedValueOnce(page("작가B")).mockResolvedValueOnce(page("작가A","next"));
    render(<HiringDiscovery slot={slot} />); search(); await screen.findByText("작가A");
    fireEvent.click(screen.getByRole("button", { name:"다음 후보" })); await screen.findByText("작가B");
    expect(discover.mock.calls[1][2]).toEqual({ expectedRevision:1,after:"next" });
    expect(screen.getByText("2페이지 · 이 페이지 1명 · 조건 버전 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name:"이전 후보" })); await screen.findByText("작가A");
    expect(discover.mock.calls[2][2]).toEqual({ expectedRevision:1 });
  });
  it("retries a failed page with the same cursor instead of presenting an empty list", async () => {
    discover.mockResolvedValueOnce(page("작가A","next")).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page("작가B"));
    render(<HiringDiscovery slot={slot} />); search(); await screen.findByText("작가A");
    fireEvent.click(screen.getByRole("button", { name:"다음 후보" })); await screen.findByText("연결 실패");
    expect(screen.queryByText("작가A")).toBeNull(); expect(discover).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name:"현재 페이지 다시 조회" })); await screen.findByText("작가B");
    expect(discover.mock.calls[2][2]).toEqual(discover.mock.calls[1][2]);
  });
  it("ignores cancelled responses while a newer query is pending", async () => {
    const old=pending<HiringCandidatePage>(), fresh=pending<HiringCandidatePage>();
    discover.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    render(<HiringDiscovery slot={slot} />); search(); fireEvent.click(screen.getByRole("button", {name:"후보 조회 취소"}));
    expect(discover.mock.calls[0][3]?.aborted).toBe(true); search();
    await act(async () => old.resolve(page("오래된 작가")));
    expect(screen.queryByText("오래된 작가")).toBeNull(); expect(screen.getByText("최신 조건과 작업 여력을 확인하고 있어요.")).toBeTruthy();
    await act(async () => fresh.resolve(page("현재 작가"))); await screen.findByText("현재 작가");
  });
  it.each([{revision:2},{state:"paused" as const},{postId:"other-post"},{id:"other-slot"}])("discards pending work after slot identity changes %j", async (delta) => {
    const old=pending<HiringCandidatePage>(); discover.mockReturnValueOnce(old.promise);
    const view=render(<HiringDiscovery slot={slot} />); search(); view.rerender(<HiringDiscovery slot={{...slot,...delta}} />);
    expect(discover.mock.calls[0][3]?.aborted).toBe(true);
    await act(async () => old.resolve(page("오래된 작가"))); expect(screen.queryByText("오래된 작가")).toBeNull();
  });
  it("clears results on a parent post revision change", async () => {
    discover.mockResolvedValue(page("작가A")); const view=render(<HiringDiscovery slot={slot} postVersion={1} />); search(); await screen.findByText("작가A");
    view.rerender(<HiringDiscovery slot={slot} postVersion={2} />); expect(screen.queryByText("작가A")).toBeNull(); expect(discover).toHaveBeenCalledTimes(1);
  });
  it("refuses a repeating next cursor", async () => {
    discover.mockResolvedValueOnce(page("작가A","next")).mockResolvedValueOnce(page("작가B","next"));
    render(<HiringDiscovery slot={slot} />); search(); await screen.findByText("작가A"); fireEvent.click(screen.getByRole("button",{name:"다음 후보"})); await screen.findByText("작가B");
    expect((screen.getByRole("button",{name:"다음 후보"}) as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps malformed responses as visible errors", async () => {
    discover.mockResolvedValue({} as HiringCandidatePage); render(<HiringDiscovery slot={slot} />); search(); await screen.findByText("연결 실패");
    expect(screen.queryByText(/조회 시점에 조건과 작업 여력이 맞는 공개 후보가 없어요/u)).toBeNull();
  });
  it("checks expiry on focus before allowing a new offer", async () => {
    const result=page("작가A"); discover.mockResolvedValue(result); render(<HiringDiscovery slot={slot} />); search(); await screen.findByText("작가A");
    vi.spyOn(Date,"now").mockReturnValue(Date.parse(result.observedAt)+120000); fireEvent.focus(window);
    const button=screen.getByRole("button",{name:"이 조건으로 30분 유효 제안 보내기"}); expect((button as HTMLButtonElement).disabled).toBe(true); fireEvent.click(button); expect(send).not.toHaveBeenCalled();
  });
  it("allows only one pending send and discards its late response after unmount", async () => {
    const result=pending<unknown>(); send.mockReturnValue(result.promise); discover.mockResolvedValue(page("작가A"));
    const view=render(<HiringDiscovery slot={slot} />); search(); const button=await screen.findByRole("button",{name:"이 조건으로 30분 유효 제안 보내기"});
    fireEvent.click(button); fireEvent.click(button); expect(send).toHaveBeenCalledTimes(1);
    view.unmount(); expect(send.mock.calls[0][3]?.aborted).toBe(true); await act(async () => result.resolve({id:"offer"}));
    expect(discover).toHaveBeenCalledTimes(1);
  });
});
