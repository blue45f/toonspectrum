import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioUnifiedBrushPicker } from "./StudioUnifiedBrushPicker";

function renderPicker(placement: "inspector" | "mobile"): string {
  return renderToStaticMarkup(
    <StudioUnifiedBrushPicker
      activeBrushId="pen"
      brushOpacity={0.75}
      color="#7c5cfc"
      placement={placement}
      proDrawPrefs={{
        sizeLocked: false,
        opacityLocked: false,
        favoriteBrushIds: ["pen", "neon"],
        recentBrushIds: ["marker", "gpen"],
      }}
      stampTuning={{ flow: 0.48, hardness: 0.35, minSize: 0.18 }}
      strokeWidth={12}
      setProDrawPrefs={vi.fn()}
      onStampTuningChange={vi.fn()}
      onSelectBrush={vi.fn()}
    />
  );
}

describe("StudioUnifiedBrushPicker", () => {
  it("keeps current, quick, and full-catalog discovery in one desktop path", () => {
    const html = renderPicker("inspector");

    expect(html).toContain('data-studio-unified-brush-picker="inspector"');
    expect(html).toContain("현재 브러시");
    expect(html).toContain("펜(매끈)");
    expect(html).toContain("12px");
    expect(html).toContain("75%");
    expect(html).toContain('data-studio-brush-tray="true"');
    expect(html).toContain('data-studio-open-brush-library="true"');
    expect(html).toContain('aria-label="펜(매끈) 즐겨찾기 해제"');
  });

  it("reuses the same discovery contract in the mobile sheet", () => {
    const html = renderPicker("mobile");

    expect(html).toContain('data-studio-unified-brush-picker="mobile"');
    expect(html).toContain('aria-label="빠른 브러시 — 즐겨찾기, 최근 사용, 추천"');
    expect(html).toContain('data-studio-quick-source="favorite"');
    expect(html).toContain('data-studio-quick-source="recent"');
    expect(html).toContain('data-studio-quick-source="starter"');
    expect(html).toContain('aria-label="스탬프 브러시 세부 조절"');
    expect(html).toContain('aria-label="스탬프 흐름"');
    expect(html).toContain('aria-label="스탬프 경도"');
    expect(html).toContain('aria-label="스탬프 최소 굵기"');
  });
});
