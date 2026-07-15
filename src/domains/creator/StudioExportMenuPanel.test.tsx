import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { STUDIO_Z } from "./studio-z-index";
import { StudioExportMenuPanel } from "./StudioExportMenuPanel";

describe("StudioExportMenuPanel commercial chrome", () => {
  it("ships a fixed, body-safe panel shell (not menubar-clipped absolute)", () => {
    const html = renderToStaticMarkup(
      <StudioExportMenuPanel
        canvasWidth={800}
        canvasHeight={1200}
        exportScale={1}
        exportFormat="png"
        exportTransparent={false}
        exportPresetId={null}
        watermark={{ enabled: false, text: "", opacity: 0.2, position: "br", size: 0.028 }}
        isExporting={false}
        exportTitle="test"
        pageCount={1}
        pageLabels={["1"]}
        setExportScale={vi.fn()}
        setExportFormat={vi.fn()}
        setExportTransparent={vi.fn()}
        setExportPresetId={vi.fn()}
        setWatermark={vi.fn()}
        onCopyToClipboard={vi.fn()}
        capturePagesForPreset={vi.fn(async () => [])}
      />
    );
    expect(html).toContain('data-studio-export-menu-panel="true"');
    expect(html).toContain("fixed");
    // Regression: sm:absolute was clipped by menubar overflow-x-auto.
    expect(html).not.toMatch(/sm:absolute|lg:absolute/);
    expect(html).toContain("z-[100]");
    expect(STUDIO_Z.menubarMenu).toBeGreaterThanOrEqual(100);
  });
});
