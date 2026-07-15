import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioBrushTray } from "./StudioBrushTray";

describe("StudioBrushTray", () => {
  it("renders visual brush chips with short labels and expand control", () => {
    const onSelect = vi.fn();
    const html = renderToStaticMarkup(
      <StudioBrushTray activeBrushId="pen" onSelect={onSelect} compact />
    );
    expect(html).toContain('data-studio-brush-tray="true"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain("펜");
    expect(html).toContain("연필");
    expect(html).toContain("마커");
    expect(html).toContain("파인");
    expect(html).toContain("볼펜");
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("브러시 키트 펼치기");
    // Commercial stroke-preview glyphs (not text-only chips)
    expect(html).toContain('data-studio-brush-preview=');
    expect(html).toContain('data-studio-brush-chip="pen"');
    expect(html).toContain('data-studio-brush-media=');
    // Compact starts collapsed — category tabs appear after expand.
    expect(html).not.toContain('role="tablist"');
  });
});
