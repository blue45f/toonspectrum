import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { emptyPixelSelection } from "./studio-selection-tools";
import { StudioSelectionToolsPanel } from "./StudioSelectionToolsPanel";

import type { StudioToolHintSpec } from "./studio-tool-hints";
import type { ReactNode } from "react";

vi.mock("./StudioToolHint", () => ({
  StudioToolHintTarget: ({
    hint,
    children,
    className,
    disabled,
    unavailableReason,
  }: {
    hint: StudioToolHintSpec;
    children: ReactNode;
    className?: string;
    disabled?: boolean;
    unavailableReason?: string;
  }) => (
    <span
      className={className}
      data-hint-id={hint.id}
      data-preview-kind={hint.preview}
      data-preview-variant={hint.previewVariant}
      data-hint-disabled={disabled ? "true" : undefined}
      data-unavailable-reason={unavailableReason}
    >
      {children}
    </span>
  ),
}));

const componentSource = readFileSync(
  new URL("./StudioSelectionToolsPanel.tsx", import.meta.url),
  "utf8"
);

const selection = {
  ...emptyPixelSelection(),
  subpaths: [{
    mode: "add" as const,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.8, y: 0.1 },
      { x: 0.5, y: 0.8 },
    ],
  }],
};

function renderPanel(overrides: Partial<Parameters<typeof StudioSelectionToolsPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <StudioSelectionToolsPanel
      selection={selection}
      activeTool="lasso"
      combineMode="add"
      onPickTool={vi.fn()}
      onCombineModeChange={vi.fn()}
      onBrushRadiusChange={vi.fn()}
      onFeatherChange={vi.fn()}
      onToggleInvert={vi.fn()}
      canUndoSelection
      canRedoSelection={false}
      onUndoSelection={vi.fn()}
      onRedoSelection={vi.fn()}
      onUndoSubpath={vi.fn()}
      onClearSelection={vi.fn()}
      onSelectAll={vi.fn()}
      onExpand={vi.fn()}
      onContract={vi.fn()}
      onRotate={vi.fn()}
      onFlip={vi.fn()}
      onTranslate={vi.fn()}
      onScale={vi.fn()}
      onContentTransform={vi.fn()}
      onApplyAdjust={vi.fn()}
      onContentAwareFill={vi.fn()}
      {...overrides}
    />
  );
}

describe("StudioSelectionToolsPanel", () => {
  it("labels subpath removal independently from document undo", () => {
    const html = renderPanel();

    expect(html).toContain('aria-label="마지막 선택 영역 제거"');
    expect(html).toContain("마지막 영역 제거");
    expect(html).toContain('aria-label="선택 작업 실행 취소"');
    expect(html).toContain('aria-label="선택 작업 다시 실행"');
    expect(html).toContain("선택 기록");
    expect(html).not.toContain(">되돌리기<");
  });

  it("routes every advanced pixel-selection action to an explicit rich preview", () => {
    const html = renderPanel();
    const expectedMappings = [
      ["selection-boundary", "select-all"],
      ["selection-boundary", "clear"],
      ["selection-boundary", "invert"],
      ["selection-boundary", "remove-last-subpath"],
      ["selection-boundary", "expand"],
      ["selection-boundary", "contract"],
      ["selection-history", "undo"],
      ["selection-history", "redo"],
      ["selection-marquee-transform", "rotate-custom"],
      ["selection-marquee-transform", "rotate-cw-90"],
      ["selection-marquee-transform", "rotate-ccw-90"],
      ["selection-marquee-transform", "rotate-180"],
      ["selection-marquee-transform", "flip-x"],
      ["selection-marquee-transform", "flip-y"],
      ["selection-marquee-transform", "translate-left"],
      ["selection-marquee-transform", "translate-right"],
      ["selection-marquee-transform", "translate-up"],
      ["selection-marquee-transform", "translate-down"],
      ["selection-marquee-transform", "scale-up"],
      ["selection-marquee-transform", "scale-down"],
      ["selection-content-transform", "apply-scale-rotate"],
      ["selection-content-transform", "rotate-cw-90"],
      ["selection-content-transform", "flip-x"],
      ["selection-content-transform", "flip-y"],
      ["selection-content-transform", "delete"],
      ["selection-content-transform", "content-aware-fill"],
      ["selection-adjust", "brightness"],
      ["selection-adjust", "hue"],
    ] as const;

    for (const [kind, variant] of expectedMappings) {
      expect(html).toContain(
        `data-preview-kind="${kind}" data-preview-variant="${variant}"`
      );
    }

    const buttonCount = html.match(/<button\b/gu)?.length ?? 0;
    const richHintTargetCount = html.match(/data-hint-id=/gu)?.length ?? 0;
    expect(buttonCount).toBe(36);
    expect(richHintTargetCount).toBe(buttonCount);
  });

  it("removes native title duplication and explains unavailable action states", () => {
    expect(componentSource).not.toMatch(/\btitle=/u);

    const noSelectionHtml = renderPanel({
      selection: null,
      canUndoSelection: false,
      canRedoSelection: false,
    });
    expect(noSelectionHtml).toContain('data-unavailable-reason="먼저 이미지에서 픽셀 영역을 선택하세요."');
    expect(noSelectionHtml).toContain('data-unavailable-reason="해제할 선택 영역이 없습니다."');
    expect(noSelectionHtml).toContain('data-unavailable-reason="되돌릴 선택 작업이 없습니다."');
    expect(noSelectionHtml).toContain('data-unavailable-reason="다시 적용할 선택 작업이 없습니다."');

    const zeroValueHtml = renderPanel();
    expect(zeroValueHtml).toContain('data-unavailable-reason="밝기 값을 0이 아닌 값으로 조절하세요."');
    expect(zeroValueHtml).toContain('data-unavailable-reason="색조 값을 0°가 아닌 값으로 조절하세요."');
  });

  it("disables only boundary transforms for a full-image selection without subpaths", () => {
    const fullImageHtml = renderPanel({
      selection: {
        ...emptyPixelSelection(),
        invert: true,
      },
    });
    const boundaryReason = "전체 이미지 선택에는 변형할 점선 선택 경계가 없습니다.";
    const boundaryHintIds = [
      "pixel-selection-expand",
      "pixel-selection-contract",
      "pixel-selection-marquee-rotate-custom",
      "pixel-selection-marquee-rotate-cw-90",
      "pixel-selection-marquee-rotate-ccw-90",
      "pixel-selection-marquee-rotate-180",
      "pixel-selection-marquee-flip-x",
      "pixel-selection-marquee-flip-y",
      "pixel-selection-marquee-translate-left",
      "pixel-selection-marquee-translate-right",
      "pixel-selection-marquee-translate-up",
      "pixel-selection-marquee-translate-down",
      "pixel-selection-marquee-scale-up",
      "pixel-selection-marquee-scale-down",
    ];

    for (const hintId of boundaryHintIds) {
      expect(fullImageHtml).toMatch(
        new RegExp(
          `data-hint-id="${hintId}"[^>]*data-hint-disabled="true"[^>]*data-unavailable-reason="${boundaryReason}"`,
          "u"
        )
      );
    }

    for (const contentHintId of [
      "pixel-selection-content-apply",
      "pixel-selection-content-rotate-cw-90",
      "pixel-selection-content-flip-x",
      "pixel-selection-content-flip-y",
      "pixel-selection-adjust-brightness",
      "pixel-selection-adjust-hue",
      "pixel-selection-content-delete",
      "pixel-selection-content-aware-fill",
    ]) {
      expect(fullImageHtml).not.toMatch(
        new RegExp(`data-hint-id="${contentHintId}"[^>]*data-unavailable-reason="${boundaryReason}"`, "u")
      );
    }
  });

  it("uses plain Korean copy for the animated selection boundary", () => {
    const html = renderPanel({ selection: null, activeTool: "rect" });

    expect(componentSource).not.toContain("마칭앤츠");
    expect(html).toContain("점선 선택 경계가 영역을 표시합니다.");
  });

  it("keeps selection-only shortcuts in the rich hint copy", () => {
    expect(componentSource).toContain('shortcut: "⌘/Ctrl+A"');
    expect(componentSource).toContain('shortcut: "⌘/Ctrl+D"');
    expect(componentSource).toContain('shortcut: "⌘/Ctrl+⇧+I"');
    expect(componentSource).toContain('shortcut: "⌘/Ctrl+Z"');
    expect(componentSource).toContain('shortcut: "⌘/Ctrl+⇧+Z"');
  });

  it("makes every compact control explain a busy state through the hint target", () => {
    const html = renderPanel({ busy: true });
    const busyReason = "다른 픽셀 작업을 적용하는 동안 기다려 주세요.";

    expect(html.match(/data-hint-disabled="true"/gu)?.length).toBe(36);
    expect(html.match(new RegExp(`data-unavailable-reason="${busyReason}"`, "gu"))?.length).toBe(36);
  });
});
