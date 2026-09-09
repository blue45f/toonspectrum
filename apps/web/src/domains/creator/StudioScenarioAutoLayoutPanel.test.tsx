// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEmptyStudioAiImageReferenceDocument,
  hydrateStudioAiImageReferenceDocument,
  type StudioAiImageReferenceDocument,
} from "./ai/studio-ai-image-reference-roles";
import {
  StudioScenarioAutoLayoutPanel,
  type StudioScenarioAutoLayoutPanelProps,
} from "./StudioScenarioAutoLayoutPanel";

import type { ScenarioPreviewItem } from "./studio-scenario-layout";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

const ASSETS = [
  {
    id: "asset/hero",
    name: "주인공 설정화",
    thumbnailUrl: "data:image/png;base64,preview-only",
  },
  {
    id: "asset/camera",
    name: "로우 앵글 구도",
    thumbnailUrl: "blob:http://localhost/camera-preview",
  },
  {
    id: "asset/style",
    name: "잉크 화풍",
    thumbnailUrl: "data:image/webp;base64,style-preview-only",
  },
] as const;

const PREVIEW: ScenarioPreviewItem[] = [
  {
    frame: { x: 24, y: 24, width: 672, height: 480 },
    bubbles: [],
    beatType: "setup",
    summary: "주인공이 골목에 들어선다.",
    imagePrompt: "비 내리는 저녁 골목, 주인공의 전신",
    dialogue: "주인공: 늦었다.",
    aspect: "landscape",
  },
];

function referenceDocument(): StudioAiImageReferenceDocument {
  return hydrateStudioAiImageReferenceDocument({
    references: [
      {
        id: "hero-reference",
        role: "character",
        assetId: "asset/hero",
        label: "주인공 설정화",
      },
      {
        id: "camera-reference",
        role: "method",
        assetId: "asset/camera",
        label: "로우 앵글 구도",
      },
      {
        id: "style-reference",
        role: "style",
        assetId: "asset/style",
        label: "잉크 화풍",
      },
    ],
  });
}

function panelProps(
  overrides: Partial<StudioScenarioAutoLayoutPanelProps> = {},
): StudioScenarioAutoLayoutPanelProps {
  return {
    open: true,
    onClose: vi.fn(),
    textConfigured: true,
    imageConfigured: true,
    imageReferenceDocument: referenceDocument(),
    imageReferenceAssetOptions: ASSETS,
    imageReferencesLoading: false,
    imageReferenceMissingCount: 0,
    onImageReferenceDocumentChange: vi.fn(),
    storyText: "비 오는 날 주인공이 약속 장소로 달려간다.",
    onStoryTextChange: vi.fn(),
    sceneCountHint: 3,
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

describe("StudioScenarioAutoLayoutPanel comic director integration", () => {
  it("keeps the three canonical reference roles controlled by the existing parent", () => {
    const props = panelProps();
    render(<StudioScenarioAutoLayoutPanel {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /이야기·기준/u }));
    expect(screen.getByRole("heading", { name: "Character · 캐릭터" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Method · 구도·연출" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Style · 화풍" })).toBeTruthy();

    fireEvent.change(
      screen.getByRole("textbox", { name: "주인공 설정화 참조 지침" }),
      { target: { value: "얼굴과 의상 정체성만 유지" } },
    );

    expect(props.onImageReferenceDocumentChange).toHaveBeenCalledTimes(1);
    const changed = vi.mocked(props.onImageReferenceDocumentChange).mock.calls[0]?.[0];
    expect(changed?.references.map((reference) => reference.role)).toEqual([
      "character",
      "method",
      "style",
    ]);
    expect(changed?.references[0]).toMatchObject({
      id: "hero-reference",
      role: "character",
      guidance: "얼굴과 의상 정체성만 유지",
    });
  });

  it("makes story and reference editing read-only while keeping cancellation available", () => {
    const props = panelProps({
      busy: true,
      stageLabel: "검토한 장면 이미지 생성 중…",
      progress: { done: 0, total: 1 },
    });
    render(<StudioScenarioAutoLayoutPanel {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /이야기·기준/u }));
    expect(
      (screen.getByRole("textbox", { name: "이야기 또는 회차 대본" }) as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("combobox", { name: "Character에 추가할 에셋" }) as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("textbox", { name: "주인공 설정화 참조 지침" }) as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /제작·수리/u }));
    const cancel = screen.getByRole("button", { name: "취소" });
    fireEvent.click(cancel);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("status").some((status) => status.textContent?.includes("(0/1)")))
      .toBe(true);
  });

  it("blocks selected image requests while a configured reference is missing", () => {
    const props = panelProps({ imageReferenceMissingCount: 1 });
    render(<StudioScenarioAutoLayoutPanel {...props} />);

    const generate = screen.getByRole("button", { name: "선택한 1컷 제작하기" }) as HTMLButtonElement;
    expect(generate.disabled).toBe(true);
    fireEvent.click(generate);
    expect(props.onGenerateImages).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /이야기·기준/u }));
    expect(screen.getByRole("alert").textContent).toContain("참조 에셋 1개");
  });

  it("does not make an empty reference pack depend on asset-list loading", () => {
    const props = panelProps({
      imageReferenceDocument: createEmptyStudioAiImageReferenceDocument(),
      imageReferencesLoading: true,
      imageReferenceMissingCount: 0,
    });
    render(<StudioScenarioAutoLayoutPanel {...props} />);

    const generate = screen.getByRole("button", { name: "선택한 1컷 제작하기" }) as HTMLButtonElement;
    expect(generate.disabled).toBe(false);
    fireEvent.click(generate);
    expect(props.onGenerateImages).toHaveBeenCalledWith({ indexes: [0], variants: 2 });
  });
});
