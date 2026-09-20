// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FortuneSpecialDays } from "./FortuneSpecialDays";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function payload() { return { kind: "special-days", month: "2024-09", category: "holidays", source: "kasi", status: "external", policyRevision: "fixture-v1",
  checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(),
  items: [{ date: "2024-09-17", sequence: 1, name: "테스트 휴일", isHoliday: true }] }; }
function view() { const result = render(<FortuneSpecialDays month="2024-09" />); result.container.querySelector("details")!.open = true; return result; }
it("does not fetch until requested and sends only public month/category", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload()))); vi.stubGlobal("fetch", fetcher); view();
  expect(fetcher).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "특일 정보 확인" }));
  await waitFor(() => expect(screen.getByText(/테스트 휴일/)).toBeTruthy());
  expect(fetcher.mock.calls[0][0]).toBe("/api/fortune/special-days?month=2024-09&category=holidays");
  expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "omit" });
});
it.each(["month", "category", "expired", "duplicate", "private"])("discards %s response mismatches", async (mode) => {
  const data: Record<string, unknown> = payload();
  if (mode === "month") data.month = "2024-10";
  if (mode === "category") data.category = "solar-terms";
  if (mode === "expired") data.expiresAt = "2000-01-01T00:00:00.000Z";
  if (mode === "duplicate") data.items = [payload().items[0], payload().items[0]];
  if (mode === "private") data.birthDate = "1990-01-01";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(data)))); view();
  fireEvent.click(screen.getByRole("button", { name: "특일 정보 확인" }));
  await waitFor(() => expect(screen.getByText("특일 데이터를 확인할 수 없어 기본 달력을 유지합니다.")).toBeTruthy());
});
it.each(["cancel", "category", "month"])("ignores late responses after %s changes", async (mode) => {
  let complete!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; })); vi.stubGlobal("fetch", fetcher); const ui = view();
  fireEvent.click(screen.getByRole("button", { name: "특일 정보 확인" }));
  if (mode === "cancel") fireEvent.click(screen.getByRole("button", { name: "특일 조회 취소" }));
  if (mode === "category") fireEvent.change(screen.getByLabelText("특일 분류"), { target: { value: "solar-terms" } });
  if (mode === "month") ui.rerender(<FortuneSpecialDays month="2024-10" />);
  await act(async () => { complete(new Response(JSON.stringify(payload()))); });
  expect(screen.queryByText(/테스트 휴일/)).toBeNull();
  expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
});
it("distinguishes empty provider results from an unavailable connection", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ...payload(), items: [] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...payload(), status: "local-fallback", source: "local", items: [], reason: "not-configured" })));
  vi.stubGlobal("fetch", fetcher); view(); fireEvent.click(screen.getByRole("button", { name: "특일 정보 확인" }));
  await waitFor(() => expect(screen.getByText(/이 달에 제공된 공휴일 항목이 없습니다/)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "특일 정보 확인" }));
  await waitFor(() => expect(screen.getByText(/특일 데이터 연결은 아직 활성화되지 않았어요/)).toBeTruthy());
});
