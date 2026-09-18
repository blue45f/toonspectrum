// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioBg3dSceneDirectorPanel,
  type StudioBg3dSceneGoal,
} from "./StudioBg3dSceneDirectorPanel";

afterEach(() => cleanup());

function renderPanel(overrides: Partial<{
  activeGoal: StudioBg3dSceneGoal | null;
  lineArtPreview: boolean;
  savedShotCount: number;
  sceneHasContent: boolean;
  disabled: boolean;
}> = {}) {
  const onSelectGoal = vi.fn();
  const onOpenPro = vi.fn();
  render(
    <StudioBg3dSceneDirectorPanel
      activeGoal={overrides.activeGoal ?? null}
      lineArtPreview={overrides.lineArtPreview ?? false}
      savedShotCount={overrides.savedShotCount ?? 0}
      sceneHasContent={overrides.sceneHasContent ?? false}
      disabled={overrides.disabled ?? false}
      onSelectGoal={onSelectGoal}
      onOpenPro={onOpenPro}
    />,
  );
  return { onSelectGoal, onOpenPro };
}

describe("StudioBg3dSceneDirectorPanel", () => {
  it("explains the webtoon-first workflow before exposing technical controls", () => {
    renderPanel();

    expect(screen.getByText("어떤 장면을 만들까요?")).toBeDefined();
    expect(screen.getByText("1 장면 구성")).toBeDefined();
    expect(screen.getByText("2 구도·포즈")).toBeDefined();
    expect(screen.getByText("3 웹툰 변환")).toBeDefined();
    expect(screen.getByText("작화에 적용")).toBeDefined();
  });

  it("routes every creator goal through a single purpose-led surface", () => {
    const { onSelectGoal } = renderPanel();
    const expectations: Array<[string, StudioBg3dSceneGoal]> = [
      ["배경 만들기", "background"],
      ["구도 잡기", "camera"],
      ["인물·포즈", "character"],
      ["소품 배치", "props"],
      ["웹툰 변환", "webtoon"],
    ];

    for (const [label, goal] of expectations) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
      expect(onSelectGoal).toHaveBeenLastCalledWith(goal);
    }
  });

  it("shows continuity context without making it a required decision", () => {
    renderPanel({ sceneHasContent: true, savedShotCount: 3, lineArtPreview: true });

    expect(screen.getByText(/현재 장면을 편집 중입니다 · 저장된 컷 3개/)).toBeDefined();
    expect(screen.getByRole("button", { name: /웹툰 변환/ }).getAttribute("aria-pressed"))
      .toBe("false");
  });

  it("opens professional settings only when the creator asks for them", () => {
    const { onOpenPro } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "전문 설정" }));
    expect(onOpenPro).toHaveBeenCalledOnce();
  });
});
