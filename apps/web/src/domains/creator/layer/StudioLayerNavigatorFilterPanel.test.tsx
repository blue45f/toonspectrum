import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS } from "./studio-layer-navigator";
import { StudioLayerNavigatorFilterPanel } from "./StudioLayerNavigatorFilterPanel";

import type { RefObject } from "react";

function nullRef<ElementType>(): RefObject<ElementType | null> {
  return { current: null };
}

describe("StudioLayerNavigatorFilterPanel", () => {
  it("renders smart views, structured-query help, and the local preset shelf accessibly", () => {
    const html = renderToStaticMarkup(
      <StudioLayerNavigatorFilterPanel
        id="layer-filter"
        panelRef={nullRef<HTMLDivElement>()}
        triggerRef={nullRef<HTMLButtonElement>()}
        open
        onOpenChange={vi.fn()}
        filters={{
          ...DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS,
          flags: [],
          smart: "attention",
        }}
        setFilters={vi.fn()}
        onReset={vi.fn()}
        filterActive
        stats={{ referenced: 2, masked: 3, ai: 1 }}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-studio-layer-smart-view="attention"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("고급 검색 문법");
    expect(html).toContain("kind:draw role:lineart -is:hidden");
    expect(html).toContain('data-studio-layer-filter-presets="true"');
    expect(html).toContain("검색 문구는 저장하지 않습니다");
    expect(html).toContain("참조 2 · 마스크 3 · AI 1");
  });
});
