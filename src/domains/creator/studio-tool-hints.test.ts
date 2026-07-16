import { describe, expect, it } from "vitest";

import { STUDIO_ADJUSTMENT_ENGINE_IDS } from "./studio-adjustment-stack";
import {
  STUDIO_FILTER_CATALOG,
  studioFilterCatalogEntry,
  studioFilterGroupLabel,
} from "./studio-filter-catalog";
import { studioToolHintPreview } from "./studio-tool-hint-preview-routing";
import {
  studioToolHint,
  studioToolHintFromLabel,
} from "./studio-tool-hints";

describe("studio tool hints (rich hover copy)", () => {
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

  it.each([
    ["brush-size", "brush-size"],
    ["opacity", "opacity"],
    ["stroke-stabilizer", "stabilizer"],
    ["pen-pressure", "pressure"],
    ["symmetry", "symmetry"],
    ["zoom-fit", "zoom-view"],
    ["undo", "history"],
    ["add-layer", "layer"],
  ] as const)("resolves the stable %s action id before prose", (id, expected) => {
    expect(
      studioToolHintPreview({
        id,
        title: "동적 메뉴",
        description: "다른 기능 이름이 들어가도 액션 ID가 우선합니다.",
      })
    ).toBe(expected);
  });

  it.each([
    ["sharpen-preview", "Sharpen preview"],
    ["inversion-preview", "Invert preview"],
    ["commentary-mode", "Commentary mode"],
  ] as const)("does not classify incidental substrings in %s", (id, title) => {
    expect(
      studioToolHintPreview({
        id,
        title,
        description: "등록되지 않은 통합 도구입니다.",
      })
    ).toBe("select");
  });

  it.each([
    ["펜 (B)", "pen", "ink"],
    ["브러시", "brush-settings", "brush-size"],
    ["불투명도", "opacity", "opacity"],
    ["화면 맞춤", "zoom-view", "zoom-view"],
    ["되돌리기", "undo", "history"],
    ["레이어", "layer", "layer"],
    ["텍스트 추가", "text", "text"],
    ["핸드 (팬)", "hand", "zoom-view"],
    ["픽셀 펜 (P)", "pixel-pencil", "ink"],
    ["혼합 (스머지)", "blend", "filter"],
    ["사각 선택 (M)", "marquee-rect", "lasso"],
  ] as const)("turns the %s label into the stable %s id", (label, id, expectedPreview) => {
    const hint = studioToolHintFromLabel(label, "설명");

    expect(hint.id).toBe(id);
    expect(studioToolHintPreview(hint)).toBe(expectedPreview);
  });

  it("creates a deterministic slug for an unregistered display label", () => {
    expect(studioToolHintFromLabel("커스텀 잉크 믹서 (⇧K)", "설명").id).toBe(
      "커스텀-잉크-믹서"
    );
  });

  it("catalogs blur and tone filters with groups", () => {
    expect(studioFilterCatalogEntry("gaussian-blur")?.title).toContain("가우시안");
    expect(studioFilterCatalogEntry("motion-blur")?.description).toMatch(/각도|속도|이동/);
    expect(studioFilterCatalogEntry("curves")?.group).toBe("tone");
    expect(studioFilterCatalogEntry("channel-mixer")?.group).toBe("color");
    expect(studioFilterCatalogEntry("gradient-map")?.group).toBe("color");
    expect(studioFilterGroupLabel("blur")).toBe("블러");
    expect(STUDIO_FILTER_CATALOG.some((e) => e.engine === "gaussian-blur")).toBe(true);
    expect(STUDIO_FILTER_CATALOG.some((e) => e.engine === "motion-blur")).toBe(true);
  });

  it("gives every supported adjustment engine a filter identity", () => {
    expect(STUDIO_ADJUSTMENT_ENGINE_IDS.every((engine) => studioFilterCatalogEntry(engine))).toBe(
      true
    );
  });

  it.each(STUDIO_FILTER_CATALOG)(
    "resolves the $engine filter engine as a filter preview",
    (entry) => {
      expect(
        studioToolHintPreview({
          id: entry.engine,
          title: entry.title,
          description: entry.description,
        })
      ).toBe("filter");
    }
  );
});
