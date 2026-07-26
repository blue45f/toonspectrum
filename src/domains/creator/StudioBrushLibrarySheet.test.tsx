// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_BRUSH_CATALOG_COUNTS,
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
const selectionSource = readFileSync(
  resolve(process.cwd(), "src/domains/creator/studio-brush-selection.ts"),
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

  it("separates the full built-in catalogue from quick sub-tools and saved brushes", () => {
    const html = renderSheet();

    expect(html).toContain('data-studio-brush-catalog="built-in"');
    expect(html).toContain('data-studio-brush-surface-role="full-catalog-management"');
    expect(html).toContain("브러시 전체 라이브러리");
    expect(html).toContain(
      `앱 제공 ${STUDIO_BRUSH_CATALOG_COUNTS.total}종 · 코어 ${coreCatalogCount} + 프로시저럴 ${proceduralCatalogCount}`
    );
    expect(html).toContain('aria-label="브러시 전체 라이브러리 닫기"');
    expect(html).toContain('data-studio-brush-library-close="true"');
    expect(html).not.toContain('data-studio-brush-surface-role="quick-subtools"');
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
    expect(selectionSource).toContain('import("./studio-brush-pack-runtime")');
    expect(sheetSource).toContain("materializeStudioBrushCatalogSelection");
    expect(sheetSource).not.toContain('import("./studio-brush-pack-runtime")');
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
    expect(html).toMatch(/aria-label="전체 브러시 검색" aria-controls="[^"]+"/);
    expect(html).toContain('data-studio-brush-search-scope="all"');
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain("8/8개의 브러시가 표시됩니다.");
  });

  it("searches the full brush catalog regardless of the currently selected category", () => {
    render(
      <StudioBrushLibrarySheet
        open
        activeBrushId="pen"
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("tab", { name: "기본" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.change(screen.getByRole("searchbox", { name: "전체 브러시 검색" }), {
      target: { value: "heart-stamp" },
    });

    expect(screen.getByText(`분류와 관계없이 전체 ${STUDIO_BRUSH_CATALOG_COUNTS.total}종에서 검색 중`)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("1/1개의 브러시가 표시됩니다.");
    expect(screen.getByRole("button", { name: "하트 도장 선택" })).toBeTruthy();
  });

  it("shows brush-kind badges and re-applies the active catalogue defaults", async () => {
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

    expect(container.querySelector('[data-studio-brush-kind-badge="line"]')?.textContent).toBe(
      "선화"
    );
    fireEvent.click(screen.getByRole("button", { name: "펜(매끈) 기본값 다시 적용" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      catalogId: "pen",
      catalogName: "펜(매끈)",
      runtimeBrushId: "pen",
      defaultWidth: 6,
      defaultOpacity: 1,
    }));
    expect(onClose).toHaveBeenCalledWith("selection");
  });

  it("progressively opens the Pro catalog and lazily materializes a durable selection", async () => {
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

    fireEvent.click(screen.getByRole("tab", {
      name: `프로 ${STUDIO_BRUSH_CATALOG_COUNTS.pro}`,
    }));

    expect(screen.getByRole("status").textContent).toBe(
      `48/${STUDIO_BRUSH_CATALOG_COUNTS.pro}개의 브러시가 표시됩니다.`
    );
    expect(container.querySelectorAll('[data-studio-brush-source="pro"]')).toHaveLength(48);
    expect(screen.getAllByText("PRO")).toHaveLength(48);
    while (container.querySelector('[data-studio-brush-load-more="true"]')) {
      fireEvent.click(container.querySelector('[data-studio-brush-load-more="true"]')!);
    }
    expect(screen.getByRole("status").textContent).toBe(
      `${STUDIO_BRUSH_CATALOG_COUNTS.pro}/${STUDIO_BRUSH_CATALOG_COUNTS.pro}개의 브러시가 표시됩니다.`
    );
    expect(container.querySelectorAll('[data-studio-brush-source="pro"]')).toHaveLength(
      STUDIO_BRUSH_CATALOG_COUNTS.pro
    );
    expect(screen.getAllByText("PRO")).toHaveLength(STUDIO_BRUSH_CATALOG_COUNTS.pro);

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

  it("keeps one brush-selection tab stop and moves it with arrows", () => {
    render(
      <StudioBrushLibrarySheet
        open
        activeBrushId="pen"
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    const selections = screen.getAllByRole("button", { name: /선택$/ });
    expect(selections.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    const scrollIntoView = vi.fn();
    Object.defineProperty(selections[1]!, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    selections[0]?.focus();
    fireEvent.keyDown(selections[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(selections[1]);
    expect(selections[1]?.tabIndex).toBe(0);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    fireEvent.keyDown(selections[1]!, { key: "Home" });
    expect(document.activeElement).toBe(selections[0]);
  });

  it("keeps favorite actions out of the tab sequence and exposes F on the roving tile", () => {
    const onToggleFavorite = vi.fn();
    render(
      <StudioBrushLibrarySheet
        open
        activeBrushId="pen"
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onToggleFavorite={onToggleFavorite}
      />
    );

    const favoriteActions = screen.getAllByRole("button", { name: /즐겨찾기/u });
    expect(favoriteActions.every((button) => button.tabIndex === -1)).toBe(true);

    const penTile = screen.getByRole("button", { name: "펜(매끈) 선택" });
    expect(penTile.getAttribute("aria-keyshortcuts")).toBe("F");
    penTile.focus();
    fireEvent.keyDown(penTile, { key: "f" });
    expect(onToggleFavorite).toHaveBeenCalledOnce();
    expect(onToggleFavorite).toHaveBeenCalledWith("pen");
    expect(document.activeElement).toBe(penTile);
  });

  it("cancels an in-flight selection when the controlled sheet closes", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <StudioBrushLibrarySheet
        open
        activeBrushId="pen"
        onClose={onClose}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "펜(매끈) 선택" }));
    rerender(
      <StudioBrushLibrarySheet
        open={false}
        activeBrushId="pen"
        onClose={onClose}
        onSelect={onSelect}
      />
    );
    await act(async () => {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
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

  it("does not make a deliberately translucent catalogue brush opaque in preview", () => {
    const colorlessMarker = renderToStaticMarkup(
      <LargeBrushPreview item={catalogBrush("marker-colorless-blender")} active={false} />
    );

    expect(catalogBrush("marker-colorless-blender").defaultOpacity).toBe(0.2);
    expect(colorlessMarker).toContain('data-studio-brush-preview-opacity="0.2"');
    expect(colorlessMarker).toContain('opacity="0.048"');
    expect(colorlessMarker).toContain('opacity="0.096"');
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
