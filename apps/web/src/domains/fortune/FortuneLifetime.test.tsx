// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fortuneMonthDays, type FortuneReading } from "@toonspectrum/core/fortune";
import { FortuneEnrichment } from "./FortuneEnrichment";
import { FortuneSpecialDays } from "./FortuneSpecialDays";

const now = Date.parse("2026-09-20T05:00:00.000Z");
const reading: FortuneReading = { id: "almanac", title: "만세력", eyebrow: "달력", summary: "로컬 결과", generatedFor: "2026-09-20", sections: [], notes: [], calendar: fortuneMonthDays("2024-02") };
const times = () => ({ checkedAt: new Date(Date.now()).toISOString(), expiresAt: new Date(Date.now() + 1000).toISOString() });
const calendar = () => ({ kind: "calendar", month: "2024-02", status: "external", source: "kasi", policyRevision: "fixture-v1", ...times(), checks: reading.calendar!.map((day) => ({ date: day.date, matches: true, fields: [] })) });
const special = () => ({ kind: "special-days", month: "2024-02", category: "holidays", status: "external", source: "kasi", policyRevision: "fixture-v1", ...times(), items: [{ date: "2024-02-29", sequence: 1, name: "확인용 특일", isHoliday: true }] });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("hides expired verification and enables manual retry without automatic fetching", async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(calendar()))); vi.stubGlobal("fetch", fetcher);
  render(<FortuneEnrichment reading={reading} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "공공 데이터로 대조하기" })); });
  expect(screen.getByText(/29일의 음력 날짜/)).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(1002); });
  expect(screen.queryByText(/29일의 음력 날짜/)).toBeNull(); expect(screen.getByText(/유효기간이 지났어요/)).toBeTruthy();
  expect(fetcher).toHaveBeenCalledOnce();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "공공 데이터로 대조하기" })); });
  expect(fetcher).toHaveBeenCalledTimes(2); expect(screen.getByText(/29일의 음력 날짜/)).toBeTruthy();
});
it.each(["focus", "pageshow", "visibilitychange"])("rechecks special-day expiry on %s without requests", async (event) => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(special()))); vi.stubGlobal("fetch", fetcher);
  const ui = render(<FortuneSpecialDays month="2024-02" />); ui.container.querySelector("details")!.open = true;
  // Drain the native details toggle task independently of our expiry timer.
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "특일 정보 확인" })); });
  expect(screen.getByText(/확인용 특일/)).toBeTruthy();
  vi.setSystemTime(now + 2000);
  act(() => { (event === "visibilitychange" ? document : window).dispatchEvent(new Event(event)); });
  expect(screen.queryByText(/확인용 특일/)).toBeNull(); expect(fetcher).toHaveBeenCalledOnce();
  ui.unmount(); expect(vi.getTimerCount()).toBe(0);
});
it("drops a late result and clears the timeout when reading context changes", async () => {
  let complete!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; })); vi.stubGlobal("fetch", fetcher);
  const ui = render(<FortuneEnrichment reading={reading} />);
  fireEvent.click(screen.getByRole("button", { name: "공공 데이터로 대조하기" }));
  ui.rerender(<FortuneEnrichment reading={{ ...reading, calendar: fortuneMonthDays("2024-03") }} />);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => { complete(new Response(JSON.stringify(calendar()))); });
  expect(screen.queryByText(/29일의 음력 날짜/)).toBeNull();
});
it("rejects oversized data and leaves the read action recoverable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(" ".repeat(65537)))); render(<FortuneEnrichment reading={reading} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "공공 데이터로 대조하기" })); });
  expect(screen.getByText(/기본 로컬 해석을 유지합니다/)).toBeTruthy(); expect(vi.getTimerCount()).toBe(0);
});
