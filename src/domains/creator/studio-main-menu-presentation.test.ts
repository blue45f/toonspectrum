import { describe, expect, it } from "vitest";

import {
  STUDIO_MAIN_MENU_COMPOSITE_GROUPS,
  STUDIO_MAIN_MENU_PRESENTATION_ORDER,
  createStudioMainMenuPresentation,
  studioMainMenuPresentedTitleFor,
  type StudioMainMenuPresentableGroup,
} from "./studio-main-menu-presentation";

/** The §15.3 catalogue as `buildStudioMainMenuGroups()` emits it (Korean voice). */
const CATALOGUE_IDS = [
  "file",
  "edit",
  "view",
  "canvas",
  "layer",
  "select",
  "transform",
  "brush",
  "filter",
  "vector",
  "text",
  "comic",
  "animation",
  "3d",
  "collaboration",
  "window",
  "ai",
  "help",
] as const;

const KO_LABELS: Record<string, string> = {
  file: "파일",
  edit: "편집",
  view: "보기",
  canvas: "캔버스",
  layer: "레이어",
  select: "선택",
  transform: "변형",
  brush: "그리기",
  filter: "필터",
  vector: "벡터",
  text: "텍스트",
  comic: "만화",
  animation: "애니메이션",
  "3d": "3D",
  collaboration: "협업",
  window: "창",
  ai: "AI",
  help: "도움말",
};

function catalogue(
  rowsPerGroup = 2,
  labels: Record<string, string> = KO_LABELS,
): StudioMainMenuPresentableGroup[] {
  return CATALOGUE_IDS.map((id): StudioMainMenuPresentableGroup => ({
    id,
    label: labels[id] ?? id,
    items: Array.from({ length: rowsPerGroup }, (_, index) => ({
      id: `${id}-command-${index}`,
    })),
  }));
}

describe("createStudioMainMenuPresentation", () => {
  it("presents the nine workflow titles with Help last", () => {
    const presentation = createStudioMainMenuPresentation(catalogue());

    expect(presentation.presentedGroupIds).toEqual([
      ...STUDIO_MAIN_MENU_PRESENTATION_ORDER,
    ]);
    expect(presentation.presentedGroupIds).toHaveLength(9);
    expect(presentation.presentedGroupIds.at(-1)).toBe("help");
    expect(
      presentation.groups.find((group) => group.id === "filter")?.label,
    ).toBe("효과");
    expect(presentation.specialistBoundaryGroupId).toBeNull();
  });

  it("regroups every catalogue command by artist workflow without dropping a row", () => {
    const groups = catalogue(3);
    const presentation = createStudioMainMenuPresentation(groups);

    expect(presentation.compositeSources).toEqual({
      file: ["file", "collaboration"],
      edit: ["edit", "select", "transform"],
      view: ["view", "canvas", "window"],
      insert: ["text", "vector", "3d"],
      comic: ["comic", "animation"],
      filter: ["filter", "ai"],
    });

    for (const [title, sourceIds] of Object.entries(
      STUDIO_MAIN_MENU_COMPOSITE_GROUPS,
    )) {
      const presented = presentation.groups.find(
        (group) => group.id === title,
      );
      const expectedIds = sourceIds.flatMap((sourceId) =>
        groups
          .find((group) => group.id === sourceId)!
          .items.map((item) => item.id),
      );
      expect(presented?.items.map((item) => item.id), title).toEqual(
        expectedIds,
      );
    }

    const secondarySources = [
      "collaboration",
      "select",
      "transform",
      "canvas",
      "window",
      "text",
      "vector",
      "3d",
      "animation",
      "ai",
    ];
    for (const id of secondarySources) {
      expect(presentation.presentedGroupIds).not.toContain(id);
    }
  });

  it("captions every workflow section and draws rules only between sources", () => {
    const presentation = createStudioMainMenuPresentation(catalogue(2));

    const expectedCaptions: Readonly<Record<string, readonly string[]>> = {
      file: ["파일", "협업"],
      edit: ["편집", "선택", "변형"],
      view: ["보기", "캔버스", "창"],
      insert: ["텍스트", "벡터", "3D"],
      comic: ["만화", "애니메이션"],
      filter: ["필터", "AI"],
    };

    for (const [title, captions] of Object.entries(expectedCaptions)) {
      const group = presentation.groups.find((entry) => entry.id === title)!;
      expect(
        group.items
          .map((item) => item.sectionLabel)
          .filter((label): label is string => label !== undefined),
        title,
      ).toEqual(captions);

      const sourceCount = captions.length;
      const rules = group.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.separatorAfter)
        .map(({ index }) => index);
      expect(rules, title).toEqual(
        Array.from(
          { length: Math.max(0, sourceCount - 1) },
          (_, index) => index * 2 + 1,
        ),
      );
    }
  });

  it("uses English workflow titles and honours localized overrides", () => {
    const englishLabels: Record<string, string> = {
      file: "File",
      edit: "Edit",
      view: "View",
      filter: "Filter",
      comic: "Comic",
      help: "Help",
    };
    const english = createStudioMainMenuPresentation(
      catalogue(1, englishLabels),
    );
    expect(english.groups.map((group) => group.label)).toEqual([
      "File",
      "Edit",
      "View",
      "Insert",
      "레이어",
      "그리기",
      "Comic",
      "Effects",
      "Help",
    ]);

    const overridden = createStudioMainMenuPresentation(catalogue(1), {
      labels: { insert: "挿入", filter: "エフェクト" },
    });
    expect(
      overridden.groups.find((group) => group.id === "insert")?.label,
    ).toBe("挿入");
    expect(
      overridden.groups.find((group) => group.id === "filter")?.label,
    ).toBe("エフェクト");
    const japaneseLabels: Record<string, string> = {
      file: "ファイル",
      edit: "編集",
      view: "表示",
      filter: "フィルター",
      comic: "マンガ",
      layer: "レイヤー",
      brush: "描画",
      help: "ヘルプ",
    };
    const japanese = createStudioMainMenuPresentation(
      catalogue(1, japaneseLabels),
    );
    expect(japanese.groups.map((group) => group.label)).toEqual([
      "ファイル",
      "編集",
      "表示",
      "Insert",
      "レイヤー",
      "描画",
      "マンガ",
      // Until a locale pack ships an explicit Effects label, retain the
      // localized Filter wording rather than leaking Korean or English.
      "フィルター",
      "ヘルプ",
    ]);
  });

  it("keeps unknown/future groups before Help in source order", () => {
    const groups: StudioMainMenuPresentableGroup[] = [
      { id: "file", label: "파일", items: [{ id: "save" }] },
      { id: "future-a", label: "A", items: [{ id: "a" }] },
      { id: "brush", label: "그리기", items: [{ id: "pen" }] },
      { id: "future-b", label: "B", items: [{ id: "b" }] },
      { id: "help", label: "도움말", items: [{ id: "h" }] },
    ];

    const presentation = createStudioMainMenuPresentation(groups);

    expect(presentation.presentedGroupIds).toEqual([
      "file",
      "brush",
      "future-a",
      "future-b",
      "help",
    ]);
  });

  it("passes standalone groups and their command arrays through by reference", () => {
    const groups = catalogue(2);
    const presentation = createStudioMainMenuPresentation(groups);

    for (const id of ["layer", "brush", "help"]) {
      const source = groups.find((group) => group.id === id)!;
      const presented = presentation.groups.find(
        (candidate) => candidate.id === id,
      );
      expect(presented).toBe(source);
      expect(presented?.items).toBe(source.items);
    }
  });

  it("omits workflow composites whose sources are all absent", () => {
    const presentation = createStudioMainMenuPresentation([
      { id: "layer", label: "레이어", items: [{ id: "image" }] },
      { id: "help", label: "도움말", items: [{ id: "h" }] },
    ]);
    expect(presentation.presentedGroupIds).toEqual(["layer", "help"]);
    expect(presentation.compositeSources).toEqual({});
  });

  it("maps every absorbed catalogue group to its visible workflow title", () => {
    expect(studioMainMenuPresentedTitleFor("collaboration")).toBe("file");
    expect(studioMainMenuPresentedTitleFor("select")).toBe("edit");
    expect(studioMainMenuPresentedTitleFor("transform")).toBe("edit");
    expect(studioMainMenuPresentedTitleFor("canvas")).toBe("view");
    expect(studioMainMenuPresentedTitleFor("window")).toBe("view");
    expect(studioMainMenuPresentedTitleFor("text")).toBe("insert");
    expect(studioMainMenuPresentedTitleFor("vector")).toBe("insert");
    expect(studioMainMenuPresentedTitleFor("3d")).toBe("insert");
    expect(studioMainMenuPresentedTitleFor("animation")).toBe("comic");
    expect(studioMainMenuPresentedTitleFor("ai")).toBe("filter");
    expect(studioMainMenuPresentedTitleFor("layer")).toBe("layer");
  });
});
