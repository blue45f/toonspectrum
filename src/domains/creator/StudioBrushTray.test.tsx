import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioBrushTray } from "./StudioBrushTray";

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
    expect(html).toContain('aria-label="전체 브러시 보기"');
    expect(html).toContain("전체 보기");
    expect(html).not.toContain("브러시 키트 펼치기");
    expect(html).not.toContain("브러시 키트 접기");
    // Commercial stroke-preview glyphs (not text-only chips)
    expect(html).toContain('data-studio-brush-preview=');
    expect(html).toContain('data-studio-brush-chip="pen"');
    expect(html).toContain('data-studio-brush-media=');
    // The quick shelf never duplicates the full catalog's category tabs.
    expect(html).not.toContain('role="tablist"');
  });
});
