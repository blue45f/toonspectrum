import { describe, expect, it } from "vitest";

import {
  STUDIO_VRM_PREMIUM_CATALOG_IDS,
  classifyStudioVrmCatalogQuality,
  filterStudioVrmProductionLibraryEntries,
} from "./studio-vrm-production-catalog";

describe("deployment VRM visual admission", () => {
  it("keeps polished anchors and the coherent Quaternius reference family", () => {
    for (const id of STUDIO_VRM_PREMIUM_CATALOG_IDS) {
      expect(classifyStudioVrmCatalogQuality(id), id).toBe("premium");
    }
    expect(classifyStudioVrmCatalogQuality("quaternius-modular-female-ranger")).toBe(
      "stylized-reference",
    );
    expect(classifyStudioVrmCatalogQuality("orion")).toBe("stylized-reference");
  });

  it("rejects visually inconsistent legacy mascots from new-project discovery", () => {
    for (const id of [
      "avocado",
      "bad-bot",
      "cool-ramen",
      "ice-cream",
      "strawberry-princess",
      "weird-cat",
      "zombie",
    ]) {
      expect(classifyStudioVrmCatalogQuality(id), id).toBeNull();
    }
  });

  it("filters only deployment-owned sample cards and preserves uploaded work", () => {
    const entries = [
      { id: "sample-vrm", source: "sample" },
      { id: "weird-cat", source: "sample" },
      { id: "weird-cat", source: "sqlite-opfs" },
      { id: "private-draft", source: "memory" },
    ] as const;

    expect(filterStudioVrmProductionLibraryEntries(entries)).toEqual([
      entries[0],
      entries[2],
      entries[3],
    ]);
  });

  it("keeps a rejected bundled card visible while an existing document actively uses it", () => {
    const entries = [
      { id: "sample-vrm", source: "sample" },
      { id: "weird-cat", source: "sample" },
    ] as const;

    expect(filterStudioVrmProductionLibraryEntries(entries, ["weird-cat"])).toEqual(entries);
  });
});
