import { describe, expect, it } from "vitest";

import {
  STUDIO_FILTER_CATALOG,
  studioFilterCatalogEntry,
  studioFilterGroupLabel,
  studioToolHint,
  studioToolHintPreview,
} from "./studio-tool-hints";

describe("studio tool hints (Magma-class hover copy)", () => {
  it("returns rich titles and descriptions for core rail tools", () => {
    const pen = studioToolHint("pen");
    expect(pen?.title).toBe("펜");
    expect(pen?.description.length).toBeGreaterThan(20);
    expect(pen?.shortcut).toBe("B");
    expect(pen?.preview).toBe("ink");
    expect(pen?.tip).toMatch(/\[|크기/u);
    expect(studioToolHint("missing")).toBeNull();
  });

  it("infers purposeful visuals for dynamic rail tools", () => {
    expect(
      studioToolHintPreview({
        id: "liquify",
        title: "액체화",
        description: "이미지 위를 밀어 국소 왜곡합니다.",
      })
    ).toBe("filter");
    expect(
      studioToolHintPreview({
        id: "comment",
        title: "댓글",
        description: "캔버스에 협업 댓글을 남깁니다.",
      })
    ).toBe("bubble");
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
