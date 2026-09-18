import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createStudioManualChunks } from "../apps/web/config/vite-manual-chunks";

describe("Marketplace CC0 catalogue bundle boundary", () => {
  it("isolates the generated catalogue without capturing its runtime wrappers", () => {
    const chunk = createStudioManualChunks({
      isInitialIconModule: () => false,
      isStudioCoreIconModule: () => false,
    });
    expect(chunk("/repo/apps/web/src/domains/creator/studio-marketplace-cc0-catalog.generated.ts"))
      .toBe("studio-marketplace-cc0-catalog");
    expect(chunk("/repo/apps/web/src/domains/creator/studio-marketplace-cc0-assets.ts"))
      .toBeUndefined();
    expect(chunk("/repo/apps/web/src/domains/creator/studio-marketplace-cc0-registry.ts"))
      .toBeUndefined();
  });

  it("keeps the catalogue out of entry modulepreloads", () => {
    const vite = readFileSync(resolve(import.meta.dirname, "../vite.config.ts"), "utf8");
    expect(vite).toContain('"studio-marketplace-cc0-catalog"');
    expect(vite).toContain("ENTRY_PRELOAD_EXCLUSIONS");
  });
});
