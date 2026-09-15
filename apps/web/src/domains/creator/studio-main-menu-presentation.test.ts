import { describe, expect, it } from "vitest";

import {
  STUDIO_MAIN_MENU_ACTION_ORDER,
  STUDIO_MAIN_MENU_COMPOSITE_GROUPS,
  STUDIO_MAIN_MENU_PRESENTATION_ORDER,
  createStudioMainMenuPresentation,
  studioMainMenuPresentedTitleFor,
  type StudioMainMenuPresentableGroup,
} from "./studio-main-menu-presentation";

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
  it("presents eight primary workflow titles and detaches AI beside completion actions", () => {
    const presentation = createStudioMainMenuPresentation(catalogue());

    expect(presentation.presentedGroupIds).toEqual([...STUDIO_MAIN_MENU_PRESENTATION_ORDER]);
    expect(presentation.presentedGroupIds).toHaveLength(8);
    expect(presentation.presentedGroupIds).not.toContain("ai");
    expect(presentation.presentedGroupIds.at(-1)).toBe("help");
    expect(presentation.presentedActionGroupIds).toEqual([...STUDIO_MAIN_MENU_ACTION_ORDER]);
    expect(presentation.actionGroups[0]?.label).toBe("AI 도우미");
    expect(presentation.specialistBoundaryGroupId).toBeNull();
  });

  it("folds related catalogue groups without dropping or reordering commands", () => {
    const groups = catalogue(3);
    const presentation = createStudioMainMenuPresentation(groups);

    expect(presentation.compositeSources).toEqual({
      file: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.file],
      edit: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.edit],
      view: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.view],
      insert: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.insert],
      create: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.create],
      filter: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.filter],
    });

    for (const [title, sources] of Object.entries(STUDIO_MAIN_MENU_COMPOSITE_GROUPS)) {
      const presented = presentation.groups.find((group) => group.id === title);
      const expectedIds = sources.flatMap((sourceId) =>
        groups.find((group) => group.id === sourceId)!.items.map((item) => item.id),
      );
      expect(presented?.items.map((item) => item.id)).toEqual(expectedIds);
    }

    for (const sourceId of [
      "collaboration",
      "select",
      "transform",
      "canvas",
      "window",
      "text",
      "vector",
      "3d",
      "brush",
      "comic",
      "animation",
    ]) {
      expect(presentation.presentedGroupIds).not.toContain(sourceId);
    }
  });

  it("captions every source section and draws one rule between adjacent sections", () => {
    const presentation = createStudioMainMenuPresentation(catalogue(2));
    const create = presentation.groups.find((group) => group.id === "create")!;

    expect(
      create.items.map((item) => item.sectionLabel).filter((label) => label !== undefined),
    ).toEqual(["그리기", "만화", "애니메이션"]);
    expect(create.items.map((item) => Boolean(item.separatorAfter))).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
    ]);
  });

  it("uses workflow labels in Korean and English while honouring explicit overrides", () => {
    const korean = createStudioMainMenuPresentation(catalogue(1));
    expect(korean.groups.find((group) => group.id === "insert")?.label).toBe("삽입");
    expect(korean.groups.find((group) => group.id === "create")?.label).toBe("창작");
    expect(korean.groups.find((group) => group.id === "filter")?.label).toBe("효과");
    expect(korean.actionGroups.find((group) => group.id === "ai")?.label).toBe("AI 도우미");

    const english = createStudioMainMenuPresentation(
      catalogue(1, {
        file: "File",
        edit: "Edit",
        view: "View",
        brush: "Brush",
        comic: "Comic",
        animation: "Animation",
        filter: "Filters",
        ai: "AI",
        help: "Help",
      }),
    );
    expect(english.groups.find((group) => group.id === "file")?.label).toBe("File");
    expect(english.groups.find((group) => group.id === "insert")?.label).toBe("Insert");
    expect(english.groups.find((group) => group.id === "create")?.label).toBe("Create");
    expect(english.groups.find((group) => group.id === "filter")?.label).toBe("Effects");
    expect(english.actionGroups.find((group) => group.id === "ai")?.label).toBe("AI Assist");

    const overridden = createStudioMainMenuPresentation(catalogue(1), {
      labels: { insert: "挿入", create: "制作", filter: "効果", ai: "AI 補助" },
    });
    expect(overridden.groups.find((group) => group.id === "insert")?.label).toBe("挿入");
    expect(overridden.groups.find((group) => group.id === "create")?.label).toBe("制作");
    expect(overridden.groups.find((group) => group.id === "filter")?.label).toBe("効果");
    expect(overridden.actionGroups.find((group) => group.id === "ai")?.label).toBe("AI 補助");
  });

  it("keeps unknown future groups in source order immediately before Help", () => {
    const groups: StudioMainMenuPresentableGroup[] = [
      { id: "layer", label: "레이어", items: [{ id: "layer" }] },
      { id: "future-a", label: "A", items: [{ id: "a" }] },
      { id: "ai", label: "AI", items: [{ id: "assist" }] },
      { id: "future-b", label: "B", items: [{ id: "b" }] },
      { id: "help", label: "도움말", items: [{ id: "h" }] },
    ];

    const presentation = createStudioMainMenuPresentation(groups);
    expect(presentation.presentedGroupIds).toEqual([
      "layer",
      "future-a",
      "future-b",
      "help",
    ]);
    expect(presentation.presentedActionGroupIds).toEqual(["ai"]);
  });

  it("passes standalone primary groups through and leaves catalogue actions immutable", () => {
    const groups = catalogue(2);
    const presentation = createStudioMainMenuPresentation(groups);

    for (const id of ["layer", "help"]) {
      const source = groups.find((group) => group.id === id);
      const presented = presentation.groups.find((group) => group.id === id);
      expect(presented).toBe(source);
      expect(presented?.items).toBe(source?.items);
    }

    const aiSource = groups.find((group) => group.id === "ai")!;
    const aiAction = presentation.actionGroups.find((group) => group.id === "ai")!;
    expect(aiAction).not.toBe(aiSource);
    expect(aiAction.items).toBe(aiSource.items);
    expect(aiSource.label).toBe("AI");
  });

  it("omits workflow composites and actions whose source groups are absent", () => {
    const presentation = createStudioMainMenuPresentation([
      { id: "layer", label: "레이어", items: [{ id: "layer" }] },
      { id: "help", label: "도움말", items: [{ id: "help" }] },
    ]);
    expect(presentation.presentedGroupIds).toEqual(["layer", "help"]);
    expect(presentation.presentedActionGroupIds).toEqual([]);
    expect(presentation.compositeSources).toEqual({});
  });

  it("maps every absorbed group to its visible workflow title", () => {
    expect(studioMainMenuPresentedTitleFor("collaboration")).toBe("file");
    expect(studioMainMenuPresentedTitleFor("select")).toBe("edit");
    expect(studioMainMenuPresentedTitleFor("transform")).toBe("edit");
    expect(studioMainMenuPresentedTitleFor("canvas")).toBe("view");
    expect(studioMainMenuPresentedTitleFor("window")).toBe("view");
    expect(studioMainMenuPresentedTitleFor("text")).toBe("insert");
    expect(studioMainMenuPresentedTitleFor("3d")).toBe("insert");
    expect(studioMainMenuPresentedTitleFor("brush")).toBe("create");
    expect(studioMainMenuPresentedTitleFor("comic")).toBe("create");
    expect(studioMainMenuPresentedTitleFor("animation")).toBe("create");
    expect(studioMainMenuPresentedTitleFor("filter")).toBe("filter");
    expect(studioMainMenuPresentedTitleFor("ai")).toBe("ai");
  });
});
