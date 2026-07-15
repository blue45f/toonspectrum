import { describe, expect, it } from "vitest";

import {
  STUDIO_FILTER_CATALOG,
  studioFilterCatalogEntry,
  studioFilterGroupLabel,
  studioToolHint,
} from "./studio-tool-hints";

describe("studio tool hints (Magma-class hover copy)", () => {
  it("returns rich titles and descriptions for core rail tools", () => {
    const pen = studioToolHint("pen");
    expect(pen?.title).toBe("펜");
    expect(pen?.description.length).toBeGreaterThan(20);
    expect(pen?.shortcut).toBe("B");
    expect(studioToolHint("missing")).toBeNull();
  });

  it("catalogs Magma blur and tone filters with groups", () => {
    expect(studioFilterCatalogEntry("gaussian-blur")?.title).toContain("가우시안");
    expect(studioFilterCatalogEntry("motion-blur")?.description).toMatch(/각도|속도|이동/);
    expect(studioFilterCatalogEntry("curves")?.group).toBe("tone");
    expect(studioFilterGroupLabel("blur")).toBe("블러");
    expect(STUDIO_FILTER_CATALOG.some((e) => e.engine === "gaussian-blur")).toBe(true);
    expect(STUDIO_FILTER_CATALOG.some((e) => e.engine === "motion-blur")).toBe(true);
  });
});
