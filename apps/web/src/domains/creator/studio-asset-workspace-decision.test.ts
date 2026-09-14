import { describe, expect, it } from "vitest";

import {
  buildStudioAssetApplyPlan,
  deriveStudioAssetIntents,
  filterStudioInsertHubEntriesByIntent,
  reconcileStudioAssetComparisonIds,
  toggleStudioAssetComparisonId,
} from "./studio-asset-workspace-decision";

import type {
  StudioInsertHubAssetEntry,
  StudioInsertHubEntry,
} from "./studio-insert-hub-model";
import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

type LocalItemOptions = {
  readonly caution?: boolean;
  readonly width?: number;
  readonly height?: number;
};

function localItem(
  id: string,
  title: string,
  keywords: readonly string[],
  options: LocalItemOptions = {},
): StudioUnifiedAssetItem {
  return {
    id: `local:${id}`,
    category: "mine",
    scope: "mine",
    title,
    description: `${title} 제작 에셋`,
    categoryLabel: "내 에셋",
    keywords,
    badges: options.caution ? ["권리 미확인"] : ["내 에셋"],
    preview: { kind: "none" },
    useMode: "insert",
    useLabel: "캔버스에 삽입",
    discoverability: options.caution ? "caution" : "standard",
    sortPriority: 10,
    source: {
      kind: "local",
      value: {
        id,
        name: title,
        dataUrl: "data:image/png;base64,AA==",
        width: options.width ?? 800,
        height: options.height ?? 600,
        createdAt: 1,
      },
    },
  };
}

function assetEntry(item: StudioUnifiedAssetItem): StudioInsertHubAssetEntry {
  return {
    id: item.id,
    kind: "asset",
    item,
    title: item.title,
    description: item.description,
    category: "mine",
    categoryLabel: item.categoryLabel,
    keywords: item.keywords,
    badges: item.badges,
    useLabel: item.useLabel,
    sortPriority: item.sortPriority,
    placementSupport: "image",
    preview: item.preview,
  };
}

describe("studio asset workspace decisions", () => {
  it("classifies and filters assets by webtoon production intent", () => {
    const dialogue = assetEntry(
      localItem("dialogue", "옥상 2인 대화", ["대사", "긴장", "night"]),
    );
    const chase = assetEntry(
      localItem("chase", "야간 추격", ["액션", "속도", "night"]),
    );
    const entries: readonly StudioInsertHubEntry[] = [dialogue, chase];

    expect(deriveStudioAssetIntents(dialogue)).toEqual(
      expect.arrayContaining(["dialogue", "emotion", "time"]),
    );
    expect(
      filterStudioInsertHubEntriesByIntent(entries, "dialogue"),
    ).toEqual([dialogue]);
    expect(filterStudioInsertHubEntriesByIntent(entries, "action")).toEqual([
      chase,
    ]);
  });

  it("keeps a bounded, unique comparison tray and removes stale ids", () => {
    let ids: readonly string[] = [];
    ids = toggleStudioAssetComparisonId(ids, "a");
    ids = toggleStudioAssetComparisonId(ids, "b");
    ids = toggleStudioAssetComparisonId(ids, "c");
    ids = toggleStudioAssetComparisonId(ids, "d");
    expect(ids).toEqual(["d", "c", "b"]);

    ids = toggleStudioAssetComparisonId(ids, "c");
    expect(ids).toEqual(["d", "b"]);
    expect(
      reconcileStudioAssetComparisonIds(
        ["d", "d", "missing", "b"],
        new Set(["b", "d"]),
      ),
    ).toEqual(["d", "b"]);
  });

  it("builds an explicit apply plan and flags rights and placement risks", () => {
    const item = localItem(
      "licensed",
      "외부 고해상도 배경",
      ["배경"],
      { caution: true, width: 4_000, height: 3_000 },
    );
    const plan = buildStudioAssetApplyPlan(item, "selection", false);

    expect(plan.requiresExplicitConfirmation).toBe(true);
    expect(plan.rights).toBe("review");
    expect(plan.performanceTier).toBe("heavy");
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("라이선스"),
        expect.stringContaining("메모리"),
        expect.stringContaining("선택 영역"),
        expect.stringContaining("정적 미리보기"),
      ]),
    );
    expect(plan.steps[0]).toContain("선택 영역");
  });
});
