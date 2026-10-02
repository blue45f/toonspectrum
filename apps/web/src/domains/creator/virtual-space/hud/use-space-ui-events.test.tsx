// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioSpaceUiEvent } from "../studio-virtual-space-engine-events";
import { SpaceEventBanner } from "./SpaceEventBanner";
import { spaceUiEventSurface, useSpaceUiEvents } from "./use-space-ui-events";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const ko = (value: string) => value;
const event = (kind: StudioSpaceUiEvent["kind"], extra: Partial<StudioSpaceUiEvent> = {}): StudioSpaceUiEvent => ({
  kind, titleKo: "카페에 손님이 왔어요", titleEn: "A guest arrived at the cafe", at: 10, ...extra,
});

describe("spaceUiEventSurface", () => {
  it("toast는 제목과 본문을 한 줄 알림으로, banner는 배너로 옮기고 highlight·dialogue는 HUD에 그리지 않는다", () => {
    expect(spaceUiEventSurface(event("toast", { bodyKo: "인사해 보세요" }), ko)).toEqual({ kind: "toast", message: "카페에 손님이 왔어요 · 인사해 보세요" });
    expect(spaceUiEventSurface(event("banner"), ko)).toEqual({ kind: "banner", banner: { key: 10, title: "카페에 손님이 왔어요", body: "" } });
    expect(spaceUiEventSurface(event("highlight"), ko)).toBeNull();
    expect(spaceUiEventSurface(event("dialogue"), ko)).toBeNull();
    expect(spaceUiEventSurface(event("toast", { titleKo: " ", titleEn: " " }), ko)).toBeNull();
  });
});

describe("useSpaceUiEvents", () => {
  it("toast는 알림 큐로 보내고 banner는 12초 뒤 스스로 숨거나 닫기로 숨는다", () => {
    vi.useFakeTimers();
    const notify = vi.fn();
    const { result } = renderHook(() => useSpaceUiEvents(ko, notify));
    act(() => result.current.handleSpaceUiEvent(event("toast")));
    expect(notify).toHaveBeenCalledExactlyOnceWith("카페에 손님이 왔어요", "info");
    act(() => result.current.handleSpaceUiEvent(event("banner", { at: 20 })));
    expect(result.current.banner?.key).toBe(20);
    act(() => { vi.advanceTimersByTime(12_000); });
    expect(result.current.banner).toBeNull();
    act(() => result.current.handleSpaceUiEvent(event("banner", { at: 30 })));
    act(() => result.current.dismissBanner());
    expect(result.current.banner).toBeNull();
  });
});

describe("SpaceEventBanner", () => {
  it("배너가 없으면 그리지 않고, 있으면 상태로 읽히며 닫을 수 있다", () => {
    const onDismiss = vi.fn();
    const view = render(<SpaceEventBanner banner={null} onDismiss={onDismiss} />);
    expect(view.container.firstChild).toBeNull();
    view.rerender(<SpaceEventBanner banner={{ key: 1, title: "환영해요", body: "로비 광장" }} onDismiss={onDismiss} />);
    expect(screen.getByRole("status").textContent).toContain("환영해요");
    fireEvent.click(screen.getByRole("button", { name: "배너 닫기" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
