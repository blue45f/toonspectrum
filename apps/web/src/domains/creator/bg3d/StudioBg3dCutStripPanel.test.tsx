// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dCutStripPanel } from "./StudioBg3dCutStripPanel";
import type { StoryboardCut } from "../scene-3d/studio-3d-storyboard-cut-strip";

// 무거운 패널 렌더가 병렬 실행 부하에서 5초를 넘길 수 있어 타임아웃을 늘립니다.
vi.setConfig({ testTimeout: 30000 });

const seedCuts: readonly StoryboardCut[] = [
  {
    id: "cut-a",
    cutNumber: 1,
    title: "오프닝",
    aspectRatio: "21:9-wide-action",
    cameraPosition: [0, 1.6, 6],
    cameraTarget: [0, 1.4, 0],
    cameraFovDeg: 45,
    cameraRollDeg: 0,
    characterIds: [],
  },
  {
    id: "cut-b",
    cutNumber: 2,
    title: "클로즈업",
    aspectRatio: "9:16-vertical-climax",
    cameraPosition: [0, 1.6, 2],
    cameraTarget: [0, 1.5, 0],
    cameraFovDeg: 35,
    cameraRollDeg: 0,
    characterIds: [],
  },
];

function renderPanel(cuts: readonly StoryboardCut[] = seedCuts) {
  const onAddCut = vi.fn();
  const onRemoveCut = vi.fn();
  const onMoveCut = vi.fn();
  const onUpdateCutAspect = vi.fn();
  const view = render(
    <StudioBg3dCutStripPanel
      cuts={cuts}
      onAddCut={onAddCut}
      onRemoveCut={onRemoveCut}
      onMoveCut={onMoveCut}
      onUpdateCutAspect={onUpdateCutAspect}
    />,
  );
  return { view, onAddCut, onRemoveCut, onMoveCut, onUpdateCutAspect };
}

describe("StudioBg3dCutStripPanel", () => {
  afterEach(cleanup);

  it("explains the panel purpose and lists cuts with aspect tooltips", () => {
    renderPanel();
    expect(screen.getByText("컷 스트립")).toBeDefined();
    expect(screen.getByText("오프닝")).toBeDefined();
    expect(screen.getByText("클로즈업")).toBeDefined();
    const aspectSelect = screen.getByLabelText("오프닝 화면비");
    expect(aspectSelect.getAttribute("title")).toContain("21:9");
    // strip height: 800px width → 21:9 = 343px + 9:16 = 1422px + 80px spacing
    expect(screen.getByText("800 × 1845px")).toBeDefined();
  });

  it("adds, moves and removes cuts through callbacks", () => {
    const { onAddCut, onMoveCut, onRemoveCut } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "컷 추가" }));
    expect(onAddCut).toHaveBeenCalledOnce();
    const added = onAddCut.mock.calls[0][0] as StoryboardCut;
    expect(added.cutNumber).toBe(3);
    expect(typeof added.id).toBe("string");

    fireEvent.click(screen.getByRole("button", { name: "클로즈업 위로 이동" }));
    expect(onMoveCut).toHaveBeenCalledWith("cut-b", "up");

    fireEvent.click(screen.getByRole("button", { name: "오프닝 삭제" }));
    expect(onRemoveCut).toHaveBeenCalledWith("cut-a");
  });

  it("shows an empty state and disables export without cuts", () => {
    renderPanel([]);
    expect(screen.getByText(/아직 컷이 없습니다/)).toBeDefined();
    expect(
      screen.getByRole("button", { name: "PSD 명세 내보내기" }),
    ).toHaveProperty("disabled", true);
  });

  it("downloads a manifest JSON when no export callback is provided", () => {
    renderPanel();
    expect(screen.queryByRole("status")).toBeNull();

    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });

    try {
      fireEvent.click(screen.getByRole("button", { name: "PSD 명세 내보내기" }));
      expect(createObjectURL).toHaveBeenCalledOnce();
      const status = screen.getByRole("status");
      expect(status.textContent).toContain("PSD 명세 준비 완료");
    } finally {
      Object.defineProperty(URL, "createObjectURL", { value: originalCreate, configurable: true });
      Object.defineProperty(URL, "revokeObjectURL", { value: originalRevoke, configurable: true });
    }
  });
});
