// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceBotRecorder } from "./StudioVirtualSpaceBotRecorder";
import type { StudioBotRecording, StudioBotRecordingZone } from "./studio-virtual-space-bot-recording";

const ZONES: readonly StudioBotRecordingZone[] = [
  { id: "zone:meeting", name: "회의실" },
  { id: "zone:review", name: "검수실" },
];

afterEach(() => {
  cleanup();
});

function renderRecorder(onAssetize: ((recording: StudioBotRecording) => void) | null = null) {
  render(<StudioVirtualSpaceBotRecorder zones={ZONES} defaultZoneId="zone:meeting" onAssetize={onAssetize} />);
}

describe("StudioVirtualSpaceBotRecorder", () => {
  // jsdom 환경의 첫 렌더 비용을 흡수한다(환경 지연에 의한 간헐 실패 방지).
  it("구역 선택·녹화 시작/일시정지/재개/중지 흐름을 제공한다", { timeout: 30000 }, () => {
    renderRecorder();
    expect(screen.getByText("대기 중")).toBeTruthy();
    const zoneSelect = screen.getByRole("combobox", { name: "Bot 배치 구역" });
    fireEvent.change(zoneSelect, { target: { value: "zone:review" } });
    expect((zoneSelect as HTMLSelectElement).value).toBe("zone:review");

    fireEvent.click(screen.getByRole("button", { name: "녹화 시작" }));
    expect(screen.getByText("녹화 중")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(screen.getByText("일시정지됨")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다시 녹화" }));
    expect(screen.getByText("녹화 중")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "녹화 중지" }));
    expect(screen.getByText("대기 중")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "녹화물 목록" })).toBeTruthy();
    expect(screen.getByText("Bot 녹화 · 검수실")).toBeTruthy();
  });

  it("녹화 중에는 구역·품질 선택을 바꿀 수 없다", () => {
    renderRecorder();
    fireEvent.click(screen.getByRole("button", { name: "녹화 시작" }));
    const zoneSelect = screen.getByRole("combobox", { name: "Bot 배치 구역" });
    const qualitySelect = screen.getByRole("combobox", { name: "녹화 품질" });
    expect((zoneSelect as HTMLSelectElement).disabled).toBe(true);
    expect((qualitySelect as HTMLSelectElement).disabled).toBe(true);
  });

  it("녹화물이 없으면 빈 상태를 보여준다", () => {
    renderRecorder();
    expect(screen.getByText(/아직 녹화물이 없습니다/)).toBeTruthy();
  });

  it("다운로드 버튼은 캡처 연동 전까지 비활성화되고 에셋 편입은 콜백을 호출한다", () => {
    const onAssetize = vi.fn();
    renderRecorder(onAssetize);
    fireEvent.click(screen.getByRole("button", { name: "녹화 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "녹화 중지" }));

    const download = screen.getByRole("button", { name: "다운로드" });
    expect((download as HTMLButtonElement).disabled).toBe(true);

    const assetize = screen.getByRole("button", { name: "에셋으로 편입" });
    fireEvent.click(assetize);
    expect(onAssetize).toHaveBeenCalledTimes(1);
    const recording = onAssetize.mock.calls[0]?.[0] as StudioBotRecording;
    expect(recording.zoneId).toBe("zone:meeting");
    expect(recording.title).toContain("회의실");
  });
});
