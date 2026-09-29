// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceRtcPanel, type StudioVirtualSpaceRtcScreenShare } from "./StudioVirtualSpaceRtcPanel";

afterEach(cleanup);

function idleScreenShare(overrides: Partial<StudioVirtualSpaceRtcScreenShare> = {}): StudioVirtualSpaceRtcScreenShare {
  return {
    status: "idle",
    canShare: true,
    error: null,
    onStart: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
}

describe("StudioVirtualSpaceRtcPanel", () => {
  it("스포트라이트 없이 기존 진단 표시를 유지한다", () => {
    render(<StudioVirtualSpaceRtcPanel />);
    expect(screen.getByText("연결과 장치 상태")).toBeTruthy();
    expect(screen.queryByText("스포트라이트 우선 송출")).toBeNull();
  });

  it("스포트라이트가 활성화되면 발표자 우선 송출 상태를 표시한다", () => {
    render(<StudioVirtualSpaceRtcPanel spotlight={{ active: true, presenterLabel: "준 작가" }} />);
    expect(screen.getByText("스포트라이트 우선 송출")).toBeTruthy();
    expect(screen.getByText(/준 작가/)).toBeTruthy();
  });

  it("스포트라이트가 비활성화되면 우선 송출 표시를 숨긴다", () => {
    render(<StudioVirtualSpaceRtcPanel spotlight={{ active: false, presenterLabel: "준 작가" }} />);
    expect(screen.queryByText("스포트라이트 우선 송출")).toBeNull();
  });
});

describe("StudioVirtualSpaceRtcPanel 화면 공유", () => {
  it("screenShare prop이 없으면 화면 공유 UI를 표시하지 않는다", () => {
    render(<StudioVirtualSpaceRtcPanel />);
    expect(screen.queryByText("화면 공유")).toBeNull();
    expect(screen.queryByText("화면 공유 시작")).toBeNull();
  });

  it("대기 상태에서는 시작 버튼을 보여주고 클릭하면 onStart를 호출한다", () => {
    const share = idleScreenShare();
    render(<StudioVirtualSpaceRtcPanel screenShare={share} />);
    expect(screen.getByText("화면 공유")).toBeTruthy();
    expect(screen.getByText("이 브라우저에서만 보이는 로컬 미리보기로 공유됩니다. 실제 송출이 아닙니다.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "화면 공유 시작" });
    fireEvent.click(button);
    expect(share.onStart).toHaveBeenCalledTimes(1);
    expect(share.onStop).not.toHaveBeenCalled();
  });

  it("화면 선택 중에는 시작 버튼을 비활성화한다", () => {
    render(<StudioVirtualSpaceRtcPanel screenShare={idleScreenShare({ status: "requesting" })} />);
    expect((screen.getByRole("button", { name: "화면 공유 시작" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("공유할 수 없을 때는 시작 버튼을 비활성화한다", () => {
    render(<StudioVirtualSpaceRtcPanel screenShare={idleScreenShare({ canShare: false })} />);
    expect((screen.getByRole("button", { name: "화면 공유 시작" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("미리보기 공유 중에는 중지 버튼을 보여주고 클릭하면 onStop을 호출한다", () => {
    const share = idleScreenShare({ status: "previewing" });
    render(<StudioVirtualSpaceRtcPanel screenShare={share} />);
    const button = screen.getByRole("button", { name: "공유 중지" });
    fireEvent.click(button);
    expect(share.onStop).toHaveBeenCalledTimes(1);
    expect(share.onStart).not.toHaveBeenCalled();
  });

  it("실패 상태에서는 원인별 폴백 안내를 표시한다", () => {
    const { rerender } = render(<StudioVirtualSpaceRtcPanel screenShare={idleScreenShare({ status: "failed", error: "denied" })} />);
    expect(screen.getByText("화면 공유 권한이 거부됐습니다. 브라우저 주소창의 권한 설정을 확인한 뒤 다시 시도해 주세요.")).toBeTruthy();
    rerender(<StudioVirtualSpaceRtcPanel screenShare={idleScreenShare({ status: "failed", error: "unsupported" })} />);
    expect(screen.getByText("이 브라우저는 화면 공유를 지원하지 않습니다. 최신 Chrome·Edge에서 다시 시도해 주세요.")).toBeTruthy();
  });

  it("entryOnly에서는 화면 공유 UI를 숨긴다", () => {
    render(<StudioVirtualSpaceRtcPanel entryOnly screenShare={idleScreenShare()} />);
    expect(screen.queryByText("화면 공유")).toBeNull();
  });

  it("스포트라이트와 화면 공유가 동시에 표시돼도 서로 충돌하지 않는다", () => {
    render(<StudioVirtualSpaceRtcPanel
      spotlight={{ active: true, presenterLabel: "준 작가" }}
      screenShare={idleScreenShare()}
    />);
    expect(screen.getByText("스포트라이트 우선 송출")).toBeTruthy();
    expect(screen.getByText("화면 공유")).toBeTruthy();
  });
});
