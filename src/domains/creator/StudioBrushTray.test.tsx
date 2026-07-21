// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_ALL_BRUSH_CATALOG_ITEMS } from "./studio-brush-catalog";
import { StudioBrushTray } from "./StudioBrushTray";

const traySource = readFileSync(
  resolve(process.cwd(), "src/domains/creator/StudioBrushTray.tsx"),
  "utf8"
);

afterEach(cleanup);

describe("StudioBrushTray", () => {
  it("renders recent and favorite brushes with a single full-library affordance", () => {
    const onSelect = vi.fn();
    const onOpenLibrary = vi.fn();
    const html = renderToStaticMarkup(
      <StudioBrushTray
        activeBrushId="pen"
        favoriteBrushIds={["neon", "pen"]}
        recentBrushIds={["marker", "neon", "gpen"]}
        onSelect={onSelect}
        onOpenLibrary={onOpenLibrary}
      />
    );
    expect(html).toContain('data-studio-brush-tray="true"');
    expect(html).toContain('role="listbox"');
    // Names live in aria-label / title only — no short-label text chips
    expect(html).toContain('aria-label="');
    expect(html).toContain("펜");
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('data-studio-quick-source="favorite"');
    expect(html).toContain('data-studio-quick-source="recent"');
    expect(html).toContain('data-studio-quick-source="starter"');
    expect(html).toContain('data-studio-open-brush-library="true"');
    expect(html).toContain('aria-label="기본 프리셋 전체 보기"');
    expect(html).toContain("전체 보기");
    expect(html).not.toContain("브러시 키트 펼치기");
    expect(html).not.toContain("브러시 키트 접기");
    // Commercial stroke-preview glyphs (not text-only chips)
    expect(html).toContain('data-studio-brush-preview=');
    expect(html).toContain('data-studio-brush-chip="pen"');
    expect(html).toContain('data-studio-brush-media=');
    // The quick shelf never duplicates the full catalog's category tabs.
    expect(html).not.toContain('role="tablist"');
    expect(traySource).toContain("onOpenLibrary(event.currentTarget)");
  });

  it("shows and selects injected Pro catalogue identities without collapsing to runtime ids", () => {
    const onSelect = vi.fn();
    render(
      <StudioBrushTray
        activeBrushId="heart-stamp"
        brushCatalogItems={STUDIO_ALL_BRUSH_CATALOG_ITEMS}
        favoriteBrushIds={["heart-stamp"]}
        recentBrushIds={["hair-fiber", "ink-particle"]}
        onSelect={onSelect}
        onOpenLibrary={vi.fn()}
      />
    );

    const heart = screen.getByRole("option", { name: /즐겨찾기 브러시 하트 도장/ });
    const hair = screen.getByRole("option", { name: /최근 사용 브러시 머리카락 결/ });
    expect(heart.getAttribute("aria-selected")).toBe("true");
    expect(heart.getAttribute("data-studio-brush-chip")).toBe("heart-stamp");
    expect(hair.getAttribute("data-studio-brush-chip")).toBe("hair-fiber");

    fireEvent.click(hair);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({
      id: "hair-fiber",
      name: "머리카락 결",
      quickSource: "recent",
    });
  });
});
