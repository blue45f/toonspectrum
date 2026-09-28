// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { StudioVirtualSpaceCustomFurniturePicker } from "./StudioVirtualSpaceCustomFurniturePicker";
import { studioVirtualDecorationPreset } from "./studio-virtual-space-customization";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/platform/api", () => ({ apiFetch: fetchMock }));

beforeEach(() => fetchMock.mockReset());
afterEach(() => { cleanup(); useI18n.getState().setLang("ko"); });

describe("내 가구 목록의 네트워크 복구", () => {
  it("패널을 닫으면 진행 중인 목록 요청을 취소한다", async () => {
    let finish: ((response: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const onDecorations = vi.fn();
    const view = render(<StudioVirtualSpaceCustomFurniturePicker
      decorations={studioVirtualDecorationPreset("minimal")}
      selfPoint={{ x: 480, y: 320 }} onDecorations={onDecorations} />);
    expect(fetchMock).toHaveBeenCalledOnce();
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish?.(new Response("[]", { status: 200 })); });
    expect(onDecorations).not.toHaveBeenCalled();
  });

  it.each(["ko", "en"] as const)("%s에서 실패를 안내하고 명시적 재시도로 목록만 복구한다", async (locale) => {
    useI18n.getState().setLang(locale);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([
      { id: "chair-1", name: "내 의자", width: 64, height: 64, createdAt: "2026-09-28T00:00:00Z" },
    ]), { status: 200, headers: { "Content-Type": "application/json" } }));
    const onDecorations = vi.fn();
    render(<StudioVirtualSpaceCustomFurniturePicker
      decorations={studioVirtualDecorationPreset("minimal")}
      selfPoint={{ x: 480, y: 320 }} onDecorations={onDecorations} />);

    const failure = locale === "ko" ? "가구 목록을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요." : "Could not load your furniture. Check your connection and try again.";
    await screen.findByText(failure);
    expect(screen.queryByText(locale === "ko" ? "아직 올린 가구가 없어요." : "You have not uploaded any furniture yet.")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: locale === "ko" ? "목록 다시 불러오기" : "Reload furniture" }));
    await screen.findByRole("button", { name: "내 의자" });
    await waitFor(() => expect(screen.queryByText(failure)).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([path, init]) => path === "/studio/space/furniture" && init.method === "GET")).toBe(true);
    expect(onDecorations).not.toHaveBeenCalled();
  });
});
