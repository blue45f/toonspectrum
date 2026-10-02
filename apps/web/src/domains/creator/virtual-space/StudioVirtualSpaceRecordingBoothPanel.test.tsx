// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceRecordingBoothPanel } from "./StudioVirtualSpaceRecordingBoothPanel";
import {
  createScriptedRecordingBoothDriver,
  type StudioRecordingBoothConfig,
} from "./studio-virtual-space-recording-booth";
import type { StudioSpaceBooking } from "./studio-virtual-space-space-booking";

function config(overrides: Partial<StudioRecordingBoothConfig> = {}): StudioRecordingBoothConfig {
  return {
    boothId: "booth-a",
    roomId: "recording-booth",
    zone: { x: 100, y: 100, width: 200, height: 160 },
    reverb: "room",
    maxDurationSec: 300,
    exclusive: false,
    ...overrides,
  };
}

const INSIDE = { x: 150, y: 150 };

function renderPanel(overrides: Partial<Parameters<typeof StudioVirtualSpaceRecordingBoothPanel>[0]> = {}) {
  return render(
    <StudioVirtualSpaceRecordingBoothPanel
      config={config()}
      bookings={[]}
      position={INSIDE}
      userName="김작가"
      micMutedByUser={false}
      projectId="project-1"
      driver={createScriptedRecordingBoothDriver()}
      {...overrides}
    />,
  );
}

describe("StudioVirtualSpaceRecordingBoothPanel", () => {
  it("부스 안에서는 조용한 구역 뱃지와 녹음 버튼을 보여준다", () => {
    renderPanel();
    expect(screen.getByText(/마이크가 자동으로 꺼졌어요/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /녹음 시작/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /드라이/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /룸/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /홀/ })).toBeTruthy();
  });

  it("반향 프리셋을 골라 녹음하고 테이크를 프로젝트 에셋으로 넣는다", async () => {
    const onProjectAsset = vi.fn();
    renderPanel({ onProjectAsset });
    fireEvent.click(screen.getByRole("radio", { name: /홀/ }));
    expect((screen.getByRole("radio", { name: /홀/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /녹음 시작/ }));
    const stopButton = await screen.findByRole("button", { name: /녹음 종료/ });
    fireEvent.click(stopButton);
    const addButton = await screen.findByRole("button", { name: "프로젝트 에셋으로 넣기" });
    fireEvent.click(addButton);
    expect(onProjectAsset).toHaveBeenCalledTimes(1);
    expect(onProjectAsset.mock.calls[0]?.[0]).toMatchObject({ kind: "audio", projectId: "project-1" });
    expect(await screen.findByText("프로젝트 에셋에 넣었어요")).toBeTruthy();
  });

  it("독점 부스에서 예약이 없으면 녹음이 막히고 안내가 보인다", () => {
    renderPanel({ config: config({ exclusive: true }) });
    expect(screen.getByText(/예약된 시간이 아니라/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /녹음 시작/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("내 예약 시간에는 녹음할 수 있다", () => {
    const booking: StudioSpaceBooking = {
      id: "booking-1",
      spaceId: "recording-booth",
      spaceName: "녹음부스",
      capacity: 2,
      equipmentTags: ["마이크"],
      startsAt: Date.now() - 60_000,
      endsAt: Date.now() + 3_600_000,
      bookerNames: ["김작가"],
      note: "",
      status: "confirmed",
    };
    renderPanel({ config: config({ exclusive: true }), bookings: [booking], nowMs: undefined });
    expect(screen.getByText(/예약 시간이에요/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /녹음 시작/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("게스트는 녹음할 수 있지만 에셋 편입에서 로그인 안내가 뜬다", async () => {
    const onRequireLogin = vi.fn();
    const onProjectAsset = vi.fn();
    renderPanel({ isGuest: true, onRequireLogin, onProjectAsset });
    fireEvent.click(screen.getByRole("button", { name: /녹음 시작/ }));
    fireEvent.click(await screen.findByRole("button", { name: /녹음 종료/ }));
    fireEvent.click(await screen.findByRole("button", { name: "프로젝트 에셋으로 넣기" }));
    expect(await screen.findByText(/프로젝트에 넣으려면 로그인/)).toBeTruthy();
    expect(onRequireLogin).toHaveBeenCalledTimes(1);
    expect(onProjectAsset).not.toHaveBeenCalled();
  });

  it("부스 밖에서는 뱃지가 숨고 입장 안내가 보인다", () => {
    renderPanel({ position: { x: 10, y: 10 } });
    expect(screen.queryByText(/마이크가 자동으로 꺼졌어요/)).toBeNull();
    expect(screen.getByText(/부스 안에 들어가면 녹음할 수 있어요/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /녹음 시작/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
