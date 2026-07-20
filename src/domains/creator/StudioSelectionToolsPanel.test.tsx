import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { emptyPixelSelection } from "./studio-selection-tools";
import { StudioSelectionToolsPanel } from "./StudioSelectionToolsPanel";

describe("StudioSelectionToolsPanel", () => {
  it("labels subpath removal independently from document undo", () => {
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
    const html = renderToStaticMarkup(
      <StudioSelectionToolsPanel
        selection={selection}
        activeTool="lasso"
        combineMode="add"
        onPickTool={vi.fn()}
        onCombineModeChange={vi.fn()}
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
      />
    );

    expect(html).toContain('aria-label="마지막 선택 영역 제거"');
    expect(html).toContain("마지막 영역 제거");
    expect(html).toContain('aria-label="선택 작업 실행 취소"');
    expect(html).toContain('aria-label="선택 작업 다시 실행"');
    expect(html).toContain("선택 기록");
    expect(html).not.toContain(">되돌리기<");
  });
});
