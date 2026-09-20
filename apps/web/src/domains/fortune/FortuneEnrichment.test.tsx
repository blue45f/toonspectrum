// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fortuneMonthDays, type FortuneReading } from "@toonspectrum/core/fortune";
import { FortuneEnrichment } from "./FortuneEnrichment";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const base: FortuneReading = { id: "almanac", title: "만세력", eyebrow: "달력", summary: "기본 로컬 결과", generatedFor: "2026-09-20", sections: [], notes: [], calendar: fortuneMonthDays("2024-02") };
function checks() { return { kind: "calendar", month: "2024-02", status: "external", source: "kasi", checkedAt: "2026-09-20T01:00:00Z", policyRevision: "fixture-v1", checks: base.calendar!.map((day) => ({ date: day.date, matches: true, fields: [] })) }; }
describe("optional fortune enrichment UI", () => {
  it("makes no request before an explicit action and sends only the public month", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(checks()))); vi.stubGlobal("fetch", fetcher);
    render(<FortuneEnrichment reading={base} />); expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "공공 데이터로 대조하기" }));
    await waitFor(() => expect(screen.getByText("29일의 음력 날짜·윤달·요일 대조 일치")).toBeTruthy());
    expect(fetcher.mock.calls[0][0]).toBe("/api/fortune/calendar?month=2024-02");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store" });
    expect(screen.getByText(/운세 예측력이나 사주 전체의 공식 인증이 아닙니다/)).toBeTruthy();
  });
  it.each(["network", "wrong-month", "partial", "duplicate"])("retains base content after %s failure", async (mode) => {
    const result = checks();
    if (mode === "wrong-month") result.month = "2024-03";
    if (mode === "partial") result.checks.pop();
    if (mode === "duplicate") result.checks[1] = result.checks[0];
    const fetcher = vi.fn(); if (mode === "network") fetcher.mockRejectedValue(new Error("offline")); else fetcher.mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal("fetch", fetcher); render(<FortuneEnrichment reading={base} />);
    fireEvent.click(screen.getByRole("button", { name: "공공 데이터로 대조하기" }));
    await waitFor(() => expect(screen.getByText(/추가 데이터를 확인할 수 없어 기본 로컬 해석을 유지합니다/)).toBeTruthy());
  });
  it("provides Korean daily/weekly/monthly content without a server", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<FortuneEnrichment reading={{ ...base, id: "zodiac", calendar: undefined, zodiacSign: "aquarius" }} />);
    fireEvent.click(screen.getByRole("button", { name: "주간" }));
    expect(screen.getByText(/2026-09-14부터 2026-09-21/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "월간" }));
    expect(screen.getByText(/2026-09-01부터 2026-10-01/)).toBeTruthy(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("discards a late result after cancellation", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((done) => { resolve = done; })); vi.stubGlobal("fetch", fetcher);
    render(<FortuneEnrichment reading={base} />);
    fireEvent.click(screen.getByRole("button", { name: "공공 데이터로 대조하기" }));
    fireEvent.click(screen.getByRole("button", { name: "확인 취소" }));
    await act(async () => { resolve(new Response(JSON.stringify(checks()))); });
    expect(screen.queryByText("29일의 음력 날짜·윤달·요일 대조 일치")).toBeNull();
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
  });
  it("shows configuration fallback without falsely claiming verification", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...checks(), source: "local", status: "local-fallback", checks: [], reason: "not-configured" }))));
    render(<FortuneEnrichment reading={base} />); fireEvent.click(screen.getByRole("button", { name: "공공 데이터로 대조하기" }));
    await waitFor(() => expect(screen.getByText(/외부 데이터 연결은 아직 활성화되지 않았어요/)).toBeTruthy());
    expect(screen.queryByText(/대조 일치$/)).toBeNull();
  });
});
