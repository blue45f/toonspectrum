import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SAMPLE_VRM_ENTRIES } from "./vrm-library";

const runtime = readFileSync(new URL("./useStudioVrmPoserRuntimeD.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("./StudioVrmCharacterLibraryPanel.tsx", import.meta.url), "utf8");

describe("bundled VRM thumbnail stability", () => {
  it("ships real same-origin thumbnails for every bundled picker entry", () => {
    expect(SAMPLE_VRM_ENTRIES.length).toBeGreaterThan(0);
    for (const entry of SAMPLE_VRM_ENTRIES) {
      expect(entry.thumbnail).toMatch(/^\/assets\/3d\/characters\/thumbnails\//u);
    }
  });

  it("never evicts bundled cards when the uploaded thumbnail window moves", () => {
    const start = runtime.indexOf("const handleVisibleVrmThumbnailWindow");
    const end = runtime.indexOf("useEffect(() => {", start);
    const handler = runtime.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(handler).toContain('entry.source === "sample"');
    expect(handler).not.toContain('startsWith("/vrm/thumbnails/")');
    expect(handler).toContain('return { ...entry, thumbnail: null }');
  });

  it("keeps a stable preview box while decoding product card art", () => {
    expect(panel).toContain('decoding="async"');
    expect(panel).toContain('loading="eager"');
    expect(panel).toContain('entry.thumbnail ?? buildFallbackVrmLibraryThumbnail');
  });
});
