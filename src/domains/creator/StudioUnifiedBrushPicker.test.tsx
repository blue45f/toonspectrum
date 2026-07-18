import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioUnifiedBrushPicker } from "./StudioUnifiedBrushPicker";

const pickerSource = readFileSync(new URL("./StudioUnifiedBrushPicker.tsx", import.meta.url), "utf8");
const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

function renderPicker(): string {
  return renderToStaticMarkup(
    <StudioUnifiedBrushPicker
      activeBrushId="pen"
      brushOpacity={0.75}
      catalogOpen
      color="#7c5cfc"
      proDrawPrefs={{
        sizeLocked: false,
        opacityLocked: false,
        favoriteBrushIds: ["pen", "neon"],
        recentBrushIds: ["marker", "gpen"],
      }}
      stampTuning={{ flow: 0.48, hardness: 0.35, minSize: 0.18 }}
      strokeWidth={12}
      onStampTuningChange={vi.fn()}
      onSelectBrush={vi.fn()}
      onToggleCatalog={vi.fn()}
      onToggleFavoriteBrush={vi.fn()}
    />
  );
}

describe("StudioUnifiedBrushPicker", () => {
  it("is a mobile-only controlled projection of the shared built-in preset session", () => {
    const html = renderPicker();

    expect(html).toContain('data-studio-unified-brush-picker="mobile"');
    expect(html).toContain('aria-label="기본 프리셋"');
    expect(html).toContain("앱 제공 · 내 브러시와 별도");
    expect(html).toContain("현재 브러시");
    expect(html).toContain("펜(매끈)");
    expect(html).toContain("12px");
    expect(html).toContain("75%");
    expect(html).toContain('data-studio-brush-tray="true"');
    expect(html).toContain('data-studio-open-brush-library="true"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="펜(매끈) 즐겨찾기 해제"');
    expect(html).toContain("size-11");
  });

  it("keeps the thumb shelf and stamp controls at a 44px touch density", () => {
    const html = renderPicker();

    expect(html).toContain('aria-label="기본 프리셋 빠른 선택 — 즐겨찾기, 최근 사용, 추천"');
    expect(html).toContain('data-studio-quick-source="favorite"');
    expect(html).toContain('data-studio-quick-source="recent"');
    expect(html).toContain('data-studio-quick-source="starter"');
    expect(html).toContain('aria-label="스탬프 브러시 세부 조절"');
    expect(html).toContain('aria-label="스탬프 흐름"');
    expect(html).toContain('aria-label="스탬프 경도"');
    expect(html).toContain('aria-label="스탬프 최소 굵기"');
    expect(html.match(/class="h-11 w-full cursor-pointer accent-accent"/g)).toHaveLength(3);
  });

  it("does not own independent dialog or favorite persistence state", () => {
    expect(pickerSource).not.toContain("createPortal");
    expect(pickerSource).not.toContain("StudioBrushLibrarySheet");
    expect(pickerSource).not.toContain("setLibraryOpen");
    expect(pickerSource).not.toContain("setProDrawPrefs");
    expect(pickerSource).toContain("onToggleCatalog");
    expect(pickerSource).toContain("onToggleFavoriteBrush");
  });

  it("keeps built-in quick discovery out of the desktop inspector", () => {
    expect(studioPageSource.match(/<StudioUnifiedBrushPicker/g)).toHaveLength(1);
    expect(studioPageSource).toContain('data-studio-inspector-brush-summary="true"');
    expect(studioPageSource).toContain("기본 프리셋 변경은 캔버스 하단 브러시 도크에서");
    expect(studioPageSource).toContain("brushCatalogSession");
    expect(studioPageSource.match(/<StudioBrushCatalogPortal/g)).toHaveLength(1);
  });
});
