import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioSelectOptionsBar } from "./StudioSelectOptionsBar";

describe("StudioSelectOptionsBar", () => {
  it("renders a commercial selection badge and action cluster", () => {
    const html = renderToStaticMarkup(
      <StudioSelectOptionsBar
        selectionLabel="레이어 1"
        selectionCount={1}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onBringFront={vi.fn()}
        onSendBack={vi.fn()}
        onToggleLock={vi.fn()}
      />
    );
    expect(html).toContain('data-studio-select-options="true"');
    expect(html).toContain('data-studio-selection-badge="true"');
    expect(html).toContain("레이어 1");
    expect(html).toContain("복제");
    expect(html).toContain("맨 앞");
    expect(html).toContain("삭제");
    expect(html).toContain("studio-opt-cluster");
  });

  it("shows multi-select count badge", () => {
    const html = renderToStaticMarkup(
      <StudioSelectOptionsBar
        selectionLabel={null}
        selectionCount={3}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onBringFront={vi.fn()}
        onSendBack={vi.fn()}
      />
    );
    expect(html).toContain("3개 선택");
  });
});
