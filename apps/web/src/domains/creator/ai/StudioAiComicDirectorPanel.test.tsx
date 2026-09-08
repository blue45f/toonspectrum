// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyStudioAiImageReferenceDocument } from "./studio-ai-image-reference-roles";
import {
  StudioAiComicDirectorPanel,
  type StudioAiComicDirectorPanelProps,
} from "./StudioAiComicDirectorPanel";

import type { ScenarioPreviewItem } from "../studio-scenario-layout";

const PREVIEW: ScenarioPreviewItem[] = [
  {
    frame: { x: 24, y: 24, width: 672, height: 480 },
    bubbles: [],
    beatType: "setup",
    summary: "비 내리는 폐역",
    imagePrompt: "비 내리는 폐역에 서하가 들어선다.",
    dialogue: "",
    aspect: "landscape",
  },
  {
    frame: { x: 24, y: 528, width: 672, height: 480 },
    bubbles: [],
    beatType: "turn",
    summary: "유진을 발견",
    imagePrompt: "어둠 속 유진이 웃고 있다.",
    dialogue: "유진: 오랜만이야, 서하.",
    aspect: "landscape",
  },
];

function props(
  overrides: Partial<StudioAiComicDirectorPanelProps> = {},
): StudioAiComicDirectorPanelProps {
  return {
    open: true,
    onClose: vi.fn(),
    textConfigured: true,
    imageConfigured: true,
    imageReferenceDocument: createEmptyStudioAiImageReferenceDocument(),
    imageReferenceAssetOptions: [],
    imageReferencesLoading: false,
    imageReferenceMissingCount: 0,
    onImageReferenceDocumentChange: vi.fn(),
    storyText: "비 오는 밤, 서하가 폐역에서 유진을 발견한다.",
    onStoryTextChange: vi.fn(),
    sceneCountHint: 2,
    onSceneCountHintChange: vi.fn(),
    applyTarget: "current-page",
    onApplyTargetChange: vi.fn(),
    busy: false,
    stageLabel: null,
    progress: null,
    error: null,
    preview: PREVIEW,
    textProvenance: null,
    onGenerate: vi.fn(),
    onGenerateImages: vi.fn(),
    onChangeScene: vi.fn(),
    onRemoveScene: vi.fn(),
    onRegenerateScene: vi.fn(),
    regeneratingIndex: null,
    onCancel: vi.fn(),
    onApply: vi.fn(),
    onDiscard: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("StudioAiComicDirectorPanel", () => {
  it("opens the reviewed plan as an accessible four-stage production flow", () => {
    render(<StudioAiComicDirectorPanel {...props()} />);

    expect(screen.getByRole("dialog", { name: /AI 코믹 디렉터/u })).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "AI 코믹 디렉터 제작 단계" }),
    ).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "컷 1 제작 선택" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "1번 장면 그림 프롬프트" })).toBeTruthy();
    expect(screen.getByText("작품 바이블 · AI 이미지 참조 팩")).toBeTruthy();
  });

  it("generates only explicitly selected panels with the production profile variants", () => {
    const onGenerateImages = vi.fn();
    render(
      <StudioAiComicDirectorPanel
        {...props({ onGenerateImages })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "선택 해제" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "컷 2 제작 선택" }));
    fireEvent.click(
      screen.getByRole("button", { name: "선택한 1컷 제작하기" }),
    );

    expect(onGenerateImages).toHaveBeenCalledWith({ indexes: [1], variants: 2 });
    expect(screen.getByText("후보를 만들고 사용할 결과 선택")).toBeTruthy();
  });

  it("writes the chosen creative direction into the real image prompt before generation", () => {
    const onChangeScene = vi.fn();
    render(<StudioAiComicDirectorPanel {...props({ onChangeScene })} />);

    fireEvent.click(screen.getByRole("button", { name: /유진을 발견/u }));
    fireEvent.change(screen.getByRole("combobox", { name: "2번 장면 제작 방향" }), {
      target: { value: "cinematic" },
    });

    expect(onChangeScene).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        imagePrompt: expect.stringContaining("AI 코믹 디렉터 제작 방향: 시네마틱형"),
      }),
    );
  });

  it("is honest when targeted mask repair is not connected", () => {
    const prepared = PREVIEW.map((item, index) => ({
      ...item,
      imageDataUrl: `data:image/png;base64,${index}`,
    }));
    render(<StudioAiComicDirectorPanel {...props({ preview: prepared })} />);

    expect(screen.getByText(/마스크 영역 수리를 연결하지 않았습니다/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "이 컷 전체 다시 제작" })).toBeTruthy();
  });

  it("previews exactly what will be added and uses the existing apply command", () => {
    const onApply = vi.fn();
    const onApplyTargetChange = vi.fn();
    render(
      <StudioAiComicDirectorPanel
        {...props({ onApply, onApplyTargetChange })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /마감·추가/u }));
    fireEvent.click(screen.getByRole("radio", { name: /다음 새 페이지/u }));
    fireEvent.click(screen.getByRole("button", { name: "현재 페이지에 적용" }));

    expect(onApplyTargetChange).toHaveBeenCalledWith("new-page");
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByText("기존 레이어 변경")).toBeTruthy();
    expect(screen.getByText("없음")).toBeTruthy();
  });

  it("keeps selected work and cancellation visible while a job is running", () => {
    const onCancel = vi.fn();
    render(
      <StudioAiComicDirectorPanel
        {...props({
          busy: true,
          stageLabel: "검토한 장면 이미지 생성 중…",
          progress: { done: 1, total: 4 },
          onCancel,
        })}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("(1/4)");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
