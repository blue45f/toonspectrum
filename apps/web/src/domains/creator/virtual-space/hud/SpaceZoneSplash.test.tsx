// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_ZONE_SPLASH_MS } from "../studio-virtual-space-zone-transition";
import { SpaceZoneSplash, type SpaceZoneSplashInput } from "./SpaceZoneSplash";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const MEETING: SpaceZoneSplashInput = {
  roomId: "meeting-room",
  labelKo: "회의실",
  labelEn: "Meeting Room",
  descriptionKo: "함께 모여 이야기하는 곳",
  descriptionEn: "Gather and talk together",
  privateZone: false,
  reason: "enter",
  worldReady: true,
};

describe("SpaceZoneSplash", () => {
  it("구역에 들어오면 이름과 설명을 보여 주고 1.2초 뒤 사라진다", () => {
    vi.useFakeTimers();
    const view = render(<SpaceZoneSplash input={MEETING} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("회의실");
    expect(status.textContent).toContain("함께 모여 이야기하는 곳");
    act(() => { vi.advanceTimersByTime(STUDIO_ZONE_SPLASH_MS - 1); });
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(view.container.firstChild).toBeNull();
  });

  it("첫 진입(initial)도 시작 구역을 알려 준다", () => {
    render(<SpaceZoneSplash input={{ ...MEETING, reason: "initial" }} />);
    expect(screen.getByRole("status").textContent).toContain("회의실");
  });

  it("공용 구역·방 밖·월드 미준비 상태에서는 보여 주지 않는다", () => {
    const view = render(<SpaceZoneSplash input={{ ...MEETING, roomId: "campus-commons" }} />);
    expect(view.container.firstChild).toBeNull();
    view.rerender(<SpaceZoneSplash input={{ ...MEETING, roomId: null }} />);
    expect(view.container.firstChild).toBeNull();
    view.rerender(<SpaceZoneSplash input={{ ...MEETING, worldReady: false }} />);
    expect(view.container.firstChild).toBeNull();
  });

  it("구역이 연속으로 바뀌면 마지막 구역으로 갈아 끼우고 시간을 다시 센다", () => {
    vi.useFakeTimers();
    const view = render(<SpaceZoneSplash input={MEETING} />);
    act(() => { vi.advanceTimersByTime(800); });
    view.rerender(<SpaceZoneSplash input={{ ...MEETING, roomId: "creator-cafe", labelKo: "카페", labelEn: "Cafe" }} />);
    expect(screen.getByRole("status").textContent).toContain("카페");
    act(() => { vi.advanceTimersByTime(800); });
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(400); });
    expect(view.container.firstChild).toBeNull();
  });

  it("프라이빗 구역이면 배지를 함께 보여 준다", () => {
    render(<SpaceZoneSplash input={{ ...MEETING, privateZone: true }} />);
    expect(screen.getByRole("status").textContent).toContain("프라이빗 구역");
  });
});
