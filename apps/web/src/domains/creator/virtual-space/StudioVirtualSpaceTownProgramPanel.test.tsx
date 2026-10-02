// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { studioVirtualDecorationPreset } from "./studio-virtual-space-customization";
import { StudioVirtualSpaceTownProgramPanel } from "./StudioVirtualSpaceTownProgramPanel";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import { STUDIO_TOWN_DESK_PODS } from "./studio-virtual-space-town-program";

afterEach(cleanup);

const operations: StudioVirtualOperationsSnapshot = {
  phase: "ready",
  project: null,
  inbox: [],
  calendar: [],
  error: null,
};

function props() {
  return {
    operations,
    manifest: DEFAULT_STUDIO_WORLD_MANIFEST,
    decorations: studioVirtualDecorationPreset("minimal"),
    rewards: { version: 1 as const, unlocked: [] as const },
    spotlightActive: false,
    onDecorations: vi.fn(),
    onClaimReward: vi.fn(),
    onEquipReward: vi.fn(),
    onMoveToRoom: vi.fn(),
    onOpenPeople: vi.fn(),
    onOpenAnnotation: vi.fn(),
    onOpenSessions: vi.fn(),
    onStartSpotlight: vi.fn(),
    onStopSpotlight: vi.fn(),
  };
}

function clickFirstButton(name: string) {
  const button = screen.getAllByRole("button", { name }).at(0);
  if (!button) throw new Error(`버튼을 찾지 못했습니다: ${name}`);
  fireEvent.click(button);
}

describe("StudioVirtualSpaceTownProgramPanel", () => {
  it("팀 자리 이동 시 방 이름만이 아닌 실제 자리 좌표와 식별자를 전달한다", () => {
    const value = { ...props(), onMoveToDesk: vi.fn() };
    render(<StudioVirtualSpaceTownProgramPanel {...value} />);
    fireEvent.click(screen.getByRole("tab", { name: "팀 자리" }));
    for (const pod of STUDIO_TOWN_DESK_PODS) {
      fireEvent.click(screen.getByRole("button", { name: `${pod.labelKo} 팀 자리로 이동` }));
      expect(value.onMoveToDesk).toHaveBeenLastCalledWith(pod);
    }
    expect(value.onMoveToRoom).not.toHaveBeenCalled();
    expect(value.onOpenSessions).not.toHaveBeenCalled();
  });
  it("개인 마을에서 협업 목적지를 숨기고 탐방·활동·블루프린트를 유지한다", () => {
    const value = props();
    const view = render(<StudioVirtualSpaceTownProgramPanel {...value} personal />);
    expect(screen.queryByRole("tab", { name: "팀 자리" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "모바일" })).toBeNull();
    expect(screen.queryByText("오늘의 동선 확인")).toBeNull();
    expect(screen.queryByText("검수 라운드")).toBeNull();
    expect(screen.queryByText("마감 점검")).toBeNull();
    expect(screen.queryByText("회의 준비")).toBeNull();
    expect(screen.getByText("제작 지구 탐방")).toBeTruthy();
    expect(screen.getByText("내 공간 꾸미기")).toBeTruthy();
    clickFirstButton("목적지까지 안내");
    expect(value.onMoveToRoom).toHaveBeenCalledWith("live");
    fireEvent.click(screen.getByRole("tab", { name: "이벤트" }));
    expect(screen.queryByRole("button", { name: "Bubble 만들기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "주석 보드 열기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "발표 준비" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "장소로 이동" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "활동" }));
    clickFirstButton("라운드 시작");
    expect(view.container.querySelector(".studio-vspace-mini-game-round")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "블루프린트" }));
    clickFirstButton("블루프린트 배치");
    expect(value.onDecorations).toHaveBeenCalledOnce();
    expect(value.onOpenPeople).not.toHaveBeenCalled();
    expect(value.onOpenAnnotation).not.toHaveBeenCalled();
    expect(value.onOpenSessions).not.toHaveBeenCalled();
  });

  it("프로젝트 마을의 협업 버튼은 원래 목적지를 연다", () => {
    const value = props();
    render(<StudioVirtualSpaceTownProgramPanel {...value} />);
    fireEvent.click(screen.getByRole("tab", { name: "이벤트" }));
    fireEvent.click(screen.getByRole("button", { name: "Bubble 만들기" }));
    fireEvent.click(screen.getByRole("button", { name: "주석 보드 열기" }));
    clickFirstButton("발표 준비");
    fireEvent.click(screen.getByRole("tab", { name: "팀 자리" }));
    fireEvent.click(screen.getByRole("button", { name: "세션 열기" }));
    expect(value.onOpenPeople).toHaveBeenCalledOnce();
    expect(value.onOpenAnnotation).toHaveBeenCalledOnce();
    expect(value.onOpenSessions).toHaveBeenCalledOnce();
    expect(value.onStartSpotlight).toHaveBeenCalledOnce();
  });

  it("선택 중인 프로젝트 전용 탭이 사라지면 사용 가능한 퀘스트로 돌아간다", () => {
    const value = props();
    const view = render(<StudioVirtualSpaceTownProgramPanel {...value} />);
    fireEvent.click(screen.getByRole("tab", { name: "모바일" }));
    expect(screen.getByText("모바일 Companion")).toBeTruthy();
    view.rerender(<StudioVirtualSpaceTownProgramPanel {...value} personal />);
    expect(screen.getByRole("tab", { name: "퀘스트", selected: true })).toBeTruthy();
    expect(screen.getByText("내 공간 꾸미기")).toBeTruthy();
    expect(screen.queryByText("모바일 Companion")).toBeNull();
  });

  it("claims a completed quest reward without currency or chance", () => {
    const value = props();
    render(<StudioVirtualSpaceTownProgramPanel {...value} />);
    const buttons = screen.getAllByRole("button", { name: "보상 받기" });
    fireEvent.click(buttons[0]!);
    expect(value.onClaimReward).toHaveBeenCalledWith("navigator-badge");
  });

  it("shows and equips unlocked cosmetic rewards", () => {
    const value = {
      ...props(),
      rewards: { version: 1 as const, unlocked: ["review-sparkle" as const] },
    };
    render(<StudioVirtualSpaceTownProgramPanel {...value} />);
    fireEvent.click(screen.getByRole("tab", { name: "보상" }));
    const equip = screen.getAllByRole("button", { name: "내 캐릭터에 적용" })
      .find((button) => !button.hasAttribute("disabled"));
    expect(equip).toBeTruthy();
    fireEvent.click(equip!);
    expect(value.onEquipReward).toHaveBeenCalledWith("review-sparkle");
  });

  it("독립 장소의 블루프린트 적용 결과를 알리고 한도 부족 시 기존 배치를 유지한다", () => {
    const value = { ...props(), manifest: studioVirtualPlaceWorldManifest("personal-atelier", true) };
    const view = render(<StudioVirtualSpaceTownProgramPanel {...value} selfPoint={{ x: 480, y: 540 }} />);
    fireEvent.click(screen.getByRole("tab", { name: "블루프린트" }));
    clickFirstButton("블루프린트 배치");
    expect(value.onDecorations).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toContain("가구 4개를 배치했어요");
    value.onDecorations.mockClear();
    const decorations = { ...value.decorations, placements: Array.from({ length: 34 }, (_, index) => ({
      id: `rug-${index}`, type: "rug" as const, x: 100, y: 100, rotation: 0 as const, scale: 1,
    })) };
    view.rerender(<StudioVirtualSpaceTownProgramPanel {...value} decorations={decorations} />);
    clickFirstButton("블루프린트 배치");
    expect(value.onDecorations).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("빈 자리 4개가 필요해요");
  });

  it("스포트라이트 방송: 발표자 지정→시작→손들기→지목→종료 흐름을 로컬 상태로 처리한다", () => {
    const value = { ...props(), spotlightActive: true };
    const view = render(<StudioVirtualSpaceTownProgramPanel {...value} />);
    fireEvent.click(screen.getByRole("tab", { name: "이벤트" }));
    expect(screen.getByLabelText("스포트라이트 방송 콘솔")).toBeTruthy();
    expect(screen.getByText("준비 중")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("발표자"), { target: { value: "spotlight-jun" } });
    fireEvent.click(screen.getByRole("button", { name: "방송 시작" }));
    expect(screen.getByText("방송 중")).toBeTruthy();
    expect(screen.getAllByText("자동 음소거").length).toBeGreaterThan(0);
    const raiseButtons = screen.getAllByRole("button", { name: "손들기" });
    fireEvent.click(raiseButtons[0]!);
    expect(screen.getByText("손들기 1번째")).toBeTruthy();
    expect(screen.getByText("손든 사람 1명")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "지목하기" }));
    expect(screen.getByText("발언 중")).toBeTruthy();
    expect(screen.getByText("손든 사람 0명")).toBeTruthy();
    expect(screen.getByRole("button", { name: "발언 종료" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "방송 종료" }));
    expect(value.onStopSpotlight).toHaveBeenCalledOnce();
    expect(screen.queryByText("방송 중")).toBeNull();
    view.rerender(<StudioVirtualSpaceTownProgramPanel {...value} spotlightActive={false} />);
    expect(screen.queryByLabelText("스포트라이트 방송 콘솔")).toBeNull();
  });

  it("발표자 화면 전체화면 토글은 로컬 표시 상태를 전환한다", () => {
    const value = { ...props(), spotlightActive: true };
    render(<StudioVirtualSpaceTownProgramPanel {...value} />);
    fireEvent.click(screen.getByRole("tab", { name: "이벤트" }));
    fireEvent.change(screen.getByLabelText("발표자"), { target: { value: "spotlight-jun" } });
    fireEvent.click(screen.getByRole("button", { name: "방송 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "발표자 화면 전체화면" }));
    expect(screen.getByRole("button", { name: "전체화면 끝내기" })).toBeTruthy();
    expect(screen.getByText("브라우저 전체화면 API가 없어 화면 안에서 크게 표시합니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "전체화면 끝내기" }));
    expect(screen.getByRole("button", { name: "발표자 화면 전체화면" })).toBeTruthy();
  });

  it("개인 마을에서는 스포트라이트 콘솔을 노출하지 않는다", () => {
    const value = { ...props(), spotlightActive: true };
    render(<StudioVirtualSpaceTownProgramPanel {...value} personal />);
    fireEvent.click(screen.getByRole("tab", { name: "이벤트" }));
    expect(screen.queryByLabelText("스포트라이트 방송 콘솔")).toBeNull();
    expect(screen.queryByRole("button", { name: "발표 준비" })).toBeNull();
  });
});
