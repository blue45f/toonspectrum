import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { listStudioBrushTrayItems } from "./studio-creative-ux";
import {
  LargeBrushPreview,
  StudioBrushLibrarySheet,
} from "./StudioBrushLibrarySheet";

import type { StudioBrushTrayItem } from "./studio-creative-ux";

const catalog = new Map(listStudioBrushTrayItems("all").map((item) => [item.id, item]));

function brush(id: string): StudioBrushTrayItem {
  const item = catalog.get(id);
  if (!item) throw new Error(`Missing brush fixture: ${id}`);
  return item;
}

function renderSheet(overrides: Partial<Parameters<typeof StudioBrushLibrarySheet>[0]> = {}): string {
  return renderToStaticMarkup(
    <StudioBrushLibrarySheet
      open
      activeBrushId="pen"
      onClose={vi.fn()}
      onSelect={vi.fn()}
      {...overrides}
    />
  );
}

describe("StudioBrushLibrarySheet", () => {
  it("does not render the catalog while closed", () => {
    expect(renderSheet({ open: false })).toBe("");
  });

  it("names the built-in catalog separately from the saved My Brushes library", () => {
    const html = renderSheet();

    expect(html).toContain('data-studio-brush-catalog="built-in"');
    expect(html).toContain("기본 브러시 카탈로그");
    expect(html).toContain("내 브러시와 별개");
    expect(html).toContain('aria-label="기본 브러시 카탈로그 닫기"');
    expect(html).not.toContain(">브러시 라이브러리<");
  });

  it("exposes a non-modal dialog, one-tab-stop tablist, named panel, and live result count", () => {
    const html = renderSheet();

    expect(html).toContain('role="dialog"');
    expect(html).not.toContain('aria-modal="true"');
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(9);
    expect(html.match(/role="tab"[^>]*tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/role="tab"[^>]*tabindex="-1"/g)).toHaveLength(8);
    expect(html).toMatch(/role="tabpanel" aria-labelledby="[^"]+" tabindex="0"/);
    expect(html).toMatch(/aria-label="브러시 검색" aria-controls="[^"]+"/);
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain("8개의 브러시가 표시됩니다.");
  });

  it("marks the active preset and favorite action independently", () => {
    const html = renderSheet({
      favoriteIds: ["pen"],
      onToggleFavorite: vi.fn(),
    });

    expect(html).toMatch(/aria-label="펜\(매끈\) 선택" aria-pressed="true"/);
    expect(html).toMatch(/aria-label="파인라이너 선택" aria-pressed="false"/);
    expect(html).toContain('aria-label="펜(매끈) 즐겨찾기 해제"');
    expect(html).toContain('fill="currentColor"');
  });

  it.each([
    ["gpen", "calligraphy"],
    ["highlighter", "square-marker"],
    ["marker-bold", "marker"],
    ["pencil", "pencil"],
    ["charcoal", "texture"],
    ["airbrush-fine", "soft-air"],
    ["spray", "soft-air"],
    ["wash-brush", "soft-wash"],
    ["pastel", "soft-pigment"],
    ["oil", "oil"],
    ["neon", "neon"],
    ["soft-glow", "glow"],
    ["star-dust", "particle"],
    ["screentone", "tone"],
  ] as const)("renders %s with its %s visual contract", (id, expectedKind) => {
    const item = brush(id);
    const html = renderToStaticMarkup(<LargeBrushPreview item={item} active={false} />);

    expect(html).toContain(`data-studio-brush-preview-kind="${expectedKind}"`);
    expect(html).toContain(`data-studio-brush-preview-layer="${expectedKind}"`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
  });

  it("shows the renderer-defining details instead of one generic line", () => {
    const highlighter = renderToStaticMarkup(
      <LargeBrushPreview item={brush("highlighter")} active={false} />
    );
    const glow = renderToStaticMarkup(
      <LargeBrushPreview item={brush("glow")} active={false} />
    );
    const tone = renderToStaticMarkup(
      <LargeBrushPreview item={brush("screentone")} active={false} />
    );
    const texture = renderToStaticMarkup(
      <LargeBrushPreview item={brush("pencil-grain")} active={false} />
    );

    expect(highlighter).toContain('stroke-linecap="square"');
    expect(glow.match(/<path/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(tone.match(/<circle/g)?.length ?? 0).toBeGreaterThan(12);
    expect(texture).toContain("stroke-dasharray");
    expect(texture.match(/<circle/g)?.length ?? 0).toBeGreaterThan(3);
  });

  it("uses the selected-state ink without exposing the decorative SVG to assistive tech", () => {
    const html = renderToStaticMarkup(
      <LargeBrushPreview item={brush("neon")} active />
    );

    expect(html).toContain("text-on-accent");
    expect(html).toContain('stroke="currentColor"');
    expect(html).not.toContain("oklch(0.96 0.02 85)");
  });

  it("uses a preset's suggested effect color only while the preview is inactive", () => {
    const inactive = renderToStaticMarkup(
      <LargeBrushPreview item={brush("neon")} active={false} />
    );
    const active = renderToStaticMarkup(
      <LargeBrushPreview item={brush("neon")} active />
    );

    expect(inactive).toContain("#39ff14");
    expect(active).not.toContain("#39ff14");
  });
});
