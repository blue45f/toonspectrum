// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_CORE_BRUSH_CATALOG_ITEMS,
  STUDIO_PRO_BRUSH_CATALOG_ITEMS,
} from "./studio-brush-catalog";
import { listStudioBrushTrayItems } from "./studio-creative-ux";
import {
  LargeBrushPreview,
  StudioBrushLibrarySheet,
} from "./StudioBrushLibrarySheet";

import type { StudioBrushTrayItem } from "./studio-creative-ux";

const catalog = new Map(listStudioBrushTrayItems("all").map((item) => [item.id, item]));
const coreCatalogCount = STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter(
  (item) => item.source === "core"
).length;
const proceduralCatalogCount = STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter(
  (item) => item.source === "pro"
).length;
const sheetSource = readFileSync(
  resolve(process.cwd(), "src/domains/creator/StudioBrushLibrarySheet.tsx"),
  "utf8"
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function brush(id: string): StudioBrushTrayItem {
  const item = catalog.get(id);
  if (!item) throw new Error(`Missing brush fixture: ${id}`);
  return item;
}

function catalogBrush(id: string): StudioBrushTrayItem {
  const item = STUDIO_ALL_BRUSH_CATALOG_ITEMS.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing extended brush fixture: ${id}`);
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
    expect(html).toContain("앱 브러시");
    expect(html).toContain(
      `코어 ${coreCatalogCount} + 프로시저럴 ${proceduralCatalogCount} · 내 브러시와 별개`
    );
    expect(html).toContain('aria-label="앱 브러시 닫기"');
    expect(html).not.toContain(">브러시 라이브러리<");
  });

  it(`publishes one unique ${STUDIO_ALL_BRUSH_CATALOG_ITEMS.length}-brush catalog while keeping the procedural runtime lazy`, () => {
    const coreItems = STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.source === "core");
    const proItems = STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.source === "pro");

    expect(coreItems).toEqual(STUDIO_CORE_BRUSH_CATALOG_ITEMS);
    expect(proItems).toEqual(STUDIO_PRO_BRUSH_CATALOG_ITEMS);
    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS).toEqual([
      ...STUDIO_CORE_BRUSH_CATALOG_ITEMS,
      ...STUDIO_PRO_BRUSH_CATALOG_ITEMS,
    ]);
    expect(new Set(STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.id))).toHaveProperty(
      "size",
      STUDIO_ALL_BRUSH_CATALOG_ITEMS.length
    );
    expect(sheetSource).toContain('import("./studio-brush-pack-runtime")');
    expect(sheetSource).not.toMatch(/from\s+["']\.\/studio-brush-pack-runtime["']/);
  });

  it("provides one controlled Portal host for desktop and mobile triggers", () => {
    expect(sheetSource.match(/createPortal\(/g)).toHaveLength(1);
    expect(sheetSource).toContain('type StudioBrushCatalogPlacement = "desktop-dock" | "mobile-sheet"');
    expect(sheetSource).toContain('data-studio-brush-catalog-session="true"');
    expect(sheetSource).toContain("triggerElement");
  });

  it("keeps outside-pointer focus on the newly chosen control and fits short viewports", () => {
    expect(sheetSource).toContain('onClose("outside-pointer")');
    expect(sheetSource).toContain('onClose("escape")');
    expect(sheetSource).toContain('onClose("selection")');
    expect(sheetSource).toContain("spaceAbove >= spaceBelow");
    expect(sheetSource).not.toContain("Math.max(224, viewportHeight - bottom - 8)");
  });

  it("keeps catalog search, tabs, close, and favorites at 44px touch density", () => {
    const html = renderSheet({ onToggleFavorite: vi.fn() });

    expect(html).toContain("size-11");
    expect(html).toContain("min-h-11");
    expect(html).toContain("min-w-11");
    expect(html).toContain("grid size-11 place-items-center");
  });

  it("exposes a non-modal dialog, one-tab-stop tablist, named panel, and live result count", () => {
    const html = renderSheet();

    expect(html).toContain('role="dialog"');
    expect(html).not.toContain('aria-modal="true"');
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(10);
    expect(html.match(/role="tab"[^>]*tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/role="tab"[^>]*tabindex="-1"/g)).toHaveLength(9);
    expect(html).toMatch(/role="tabpanel" aria-labelledby="[^"]+" tabindex="0"/);
    expect(html).toMatch(/aria-label="브러시 검색" aria-controls="[^"]+"/);
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain("8개의 브러시가 표시됩니다.");
  });

  it("opens the Pro 120 tab, labels every extended profile, and lazily materializes a durable selection", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <StudioBrushLibrarySheet
        open
        activeBrushId="pen"
        onClose={onClose}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "프로 120" }));

    expect(screen.getByRole("status").textContent).toBe("120개의 브러시가 표시됩니다.");
    expect(container.querySelectorAll('[data-studio-brush-source="pro"]')).toHaveLength(120);
    expect(screen.getAllByText("PRO")).toHaveLength(120);

    fireEvent.click(screen.getByRole("button", { name: "하트 도장 선택" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogId: "heart-stamp",
        catalogName: "하트 도장",
        runtimeBrushId: "ink-particle",
        defaultWidth: 26,
        defaultOpacity: 0.94,
        brushDynamics: expect.objectContaining({
          version: 1,
          tip: expect.objectContaining({ alphaMapSize: 24 }),
        }),
      })
    );
    expect(onClose).toHaveBeenCalledWith("selection");
  });

  it("renders distinct motif details for patterned, foliage, and stamp profiles", () => {
    const heart = renderToStaticMarkup(
      <LargeBrushPreview item={catalogBrush("heart-stamp")} active={false} />
    );
    const footsteps = renderToStaticMarkup(
      <LargeBrushPreview item={catalogBrush("footstep-stamp")} active={false} />
    );
    const checker = renderToStaticMarkup(
      <LargeBrushPreview item={catalogBrush("checker-grid")} active={false} />
    );
    const leaf = renderToStaticMarkup(
      <LargeBrushPreview item={catalogBrush("leaf-cluster")} active={false} />
    );
    const hair = renderToStaticMarkup(
      <LargeBrushPreview item={catalogBrush("hair-fiber")} active={false} />
    );

    expect(heart).toContain("M72 13 C72 8");
    expect(footsteps).toContain('<ellipse cx="64" cy="20" rx="3.2" ry="6.2"></ellipse>');
    expect(checker).toContain('<rect x="55" y="10" width="6" height="6"></rect>');
    expect(leaf).toContain("M0 0 C2.2 -3.4 6.5 -3.1 8 0");
    expect(hair).toContain("M50 9 C62");
    expect(new Set([heart, footsteps, checker, leaf, hair])).toHaveProperty("size", 5);
  });

  it("keeps every procedural preview SVG dimension non-negative", () => {
    for (const item of STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter(({ source }) => source === "pro")) {
      const html = renderToStaticMarkup(<LargeBrushPreview item={item} active={false} />);
      expect(html, item.id).not.toMatch(/\b(?:width|height|rx|ry|r)="-/);
    }
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
