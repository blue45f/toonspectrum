import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS,
  countActiveStudioLayerFilters,
  filterStudioLayerNavigatorItems,
  inspectStudioLayerQuality,
  parseStudioLayerQuery,
  type StudioLayerNavigatorFilters,
  type StudioLayerNavigatorItem,
} from "./studio-layer-navigator";

function noFilters(): StudioLayerNavigatorFilters {
  return { ...DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS, flags: [] };
}

function layer(
  id: string,
  type: string,
  patch: Partial<StudioLayerNavigatorItem> = {}
): StudioLayerNavigatorItem {
  return {
    id,
    type,
    label: patch.label ?? id,
    zIndex: patch.zIndex ?? 0,
    ...patch,
  };
}

const groups = [
  { id: "g-lines", name: "주인공 선화" },
  { id: "g-hidden", name: "숨긴 러프", hidden: true },
] as const;

const items: readonly StudioLayerNavigatorItem[] = [
  layer("ink", "draw", {
    label: "G펜 얼굴선",
    groupId: "g-lines",
    opacity: 0.8,
    role: "lineart",
    color: "blue",
  }),
  layer("rough", "draw", {
    label: "포즈 러프",
    groupId: "g-hidden",
    role: "rough",
    color: "orange",
  }),
  layer("masked", "image", {
    label: "레이어 12",
    masked: true,
    maskEnabled: false,
    opacity: 0,
    role: "color",
    color: "red",
  }),
  layer("dialogue", "bubble", {
    label: "주인공 대사",
    textContent: "오늘도 힘내자",
    role: "lettering",
  }),
  layer("orphan", "future-layer", {
    label: "Imported 3D",
    groupId: "missing-group",
  }),
];

function resultIds(query: string, filters = noFilters()): readonly string[] {
  return filterStudioLayerNavigatorItems(items, groups, query, filters).map((result) => result.item.id);
}

describe("studio layer structured query", () => {
  it("combines field predicates, quoted values, exclusions, and opacity comparisons with AND semantics", () => {
    expect(
      resultIds('kind:draw role:lineart -is:hidden group:"주인공 선화" opacity:>=50%')
    ).toEqual(["ink"]);
    expect(resultIds('name:"G펜 얼굴선"')).toEqual(["ink"]);
    expect(resultIds('text:"오늘도 힘내자"')).toEqual(["dialogue"]);
  });

  it("supports Korean aliases and comma-separated OR values", () => {
    expect(resultIds("종류:이미지,말풍선 -상태:숨김")).toEqual(["masked", "dialogue"]);
    expect(resultIds("역할:선화,레터링")).toEqual(["ink", "dialogue"]);
    expect(resultIds("색:파랑,빨강")).toEqual(["ink", "masked"]);
  });

  it("finds production states that are expensive to inspect manually", () => {
    expect(resultIds("is:mask-disabled")).toEqual(["masked"]);
    expect(resultIds("is:default-name")).toEqual(["masked"]);
    expect(resultIds("is:zero-opacity")).toEqual(["masked"]);
    expect(resultIds("is:unknown-kind,orphan-group")).toEqual(["orphan"]);
    expect(resultIds("is:unknown-kind")).toEqual(["orphan"]);
    expect(resultIds("is:orphan-group")).toEqual(["orphan"]);
    expect(resultIds("has:text -is:hidden")).toEqual(["dialogue"]);
    expect(resultIds("opacity:<10%")).toEqual(["masked"]);
    expect(resultIds("group:none -kind:other")).toEqual(["masked", "dialogue"]);
    expect(resultIds("is:ungrouped")).toEqual(["masked", "dialogue"]);
  });

  it("keeps plain-text search behavior, including NFKC normalization and negative terms", () => {
    expect(resultIds("Ｇ펜")).toEqual(["ink"]);
    expect(resultIds("주인공 -대사")).toEqual(["ink"]);
    expect(resultIds("오늘 힘내자")).toEqual(["dialogue"]);
  });

  it("reports invalid known filters and fails closed instead of broadening the result", () => {
    const opacityPlan = parseStudioLayerQuery("opacity:120%");
    const rolePlan = parseStudioLayerQuery("role:not-a-role");
    expect(opacityPlan.diagnostics.map((diagnostic) => diagnostic.code)).toContain("invalid-opacity");
    expect(rolePlan.diagnostics.map((diagnostic) => diagnostic.code)).toContain("unknown-value");
    expect(resultIds("opacity:120%")).toEqual([]);
    expect(resultIds("role:not-a-role")).toEqual([]);
    expect(resultIds("kind:image,not-a-kind")).toEqual([]);
  });

  it("preserves unknown colon terms as ordinary text for backwards-compatible names", () => {
    const colonLayer = layer("scene", "text", { label: "scene:01 title" });
    expect(
      filterStudioLayerNavigatorItems([colonLayer], [], "scene:01", noFilters()).map((result) => result.item.id)
    ).toEqual(["scene"]);
  });
});

describe("studio layer smart views and quality lens", () => {
  it("exposes useful built-in views without changing document metadata", () => {
    expect(resultIds("", { ...noFilters(), smart: "editable" })).toEqual([
      "ink",
      "masked",
      "dialogue",
      "orphan",
    ]);
    expect(resultIds("", { ...noFilters(), smart: "attention" })).toEqual(["masked", "orphan"]);
    expect(resultIds("", { ...noFilters(), smart: "output" })).toEqual([
      "ink",
      "dialogue",
      "orphan",
    ]);
    expect(resultIds("view:output")).toEqual(["ink", "dialogue", "orphan"]);
    expect(resultIds("", { ...noFilters(), smart: "unclassified" })).toEqual(["dialogue", "orphan"]);
    // 80% opacity is a compositing adjustment even without a mask or animation.
    expect(resultIds("", { ...noFilters(), smart: "advanced" })).toEqual(["ink", "masked"]);
    expect(resultIds("view:attention")).toEqual(["masked", "orphan"]);
  });

  it("finds opacity adjustments in both smart views and queries until full opacity is restored", () => {
    expect(resultIds("view:advanced")).toEqual(["ink", "masked"]);
    const restored = items.map((item) => item.id === "ink" ? { ...item, opacity: 1 } : item);
    for (const [query, filters] of [
      ["view:advanced", noFilters()],
      ["", { ...noFilters(), smart: "advanced" }],
    ] as const) {
      expect(filterStudioLayerNavigatorItems(restored, groups, query, filters).map((result) => result.item.id))
        .toEqual(["masked"]);
    }
  });

  it("returns deterministic issue codes for review automation", () => {
    expect(
      inspectStudioLayerQuality(items[2]!, {
        kind: "image",
        group: null,
        effectivelyHidden: false,
      })
    ).toEqual(["default-name", "disabled-mask", "zero-opacity"]);
    expect(
      inspectStudioLayerQuality(items[4]!, {
        kind: "other",
        group: null,
        effectivelyHidden: false,
      })
    ).toEqual(["unknown-kind", "orphan-group"]);
  });

  it("counts a smart view as one independent active filter dimension", () => {
    expect(countActiveStudioLayerFilters({ ...noFilters(), smart: "attention" })).toBe(1);
  });
});
