import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SAMPLE_VRM_ENTRIES, SAMPLE_VRMS } from "./vrm-library";
import {
  STUDIO_VRM_TECHNICAL_THUMBNAIL_REJECTIONS,
} from "./studio-vrm-thumbnail-technical-denylist.generated";
import { isStudioVrmProductionThumbnailUrl } from "./studio-vrm-thumbnail-quality";

const librarySource = readFileSync(new URL("./vrm-library.ts", import.meta.url), "utf8");

describe("VRM production thumbnail quality integration", () => {
  it("exposes only technically admitted deployment-owned card art", () => {
    const rejected = new Set(Object.keys(STUDIO_VRM_TECHNICAL_THUMBNAIL_REJECTIONS));
    const visibleIds = new Set(SAMPLE_VRM_ENTRIES.map((entry) => entry.id));
    expect(visibleIds.size).toBeGreaterThan(0);

    for (const entry of SAMPLE_VRM_ENTRIES) {
      expect(rejected.has(entry.id), entry.id).toBe(false);
      expect(isStudioVrmProductionThumbnailUrl(entry.thumbnail), entry.id).toBe(true);
    }

    for (const sample of SAMPLE_VRMS) {
      if (sample.visibility === "legacy") continue;
      if (rejected.has(sample.id) || !isStudioVrmProductionThumbnailUrl(sample.thumbnailUrl)) {
        expect(visibleIds.has(sample.id), sample.id).toBe(false);
      }
    }
  });

  it("keeps thumbnail admission in the source discovery pipeline", () => {
    expect(librarySource).toContain("isStudioVrmProductionThumbnailUrl(sample.thumbnailUrl)");
    expect(librarySource).toContain("isStudioVrmTechnicallyAdmittedThumbnail(sample.id)");
  });
});
