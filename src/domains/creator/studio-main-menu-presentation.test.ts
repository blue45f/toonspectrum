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
  it("presents the twelve-title menubar with Help last (UX 감사 2026-09-02 §3.4)", () => {
    const presentation = createStudioMainMenuPresentation(catalogue());

    expect(presentation.presentedGroupIds).toEqual([...STUDIO_MAIN_MENU_PRESENTATION_ORDER]);
    expect(presentation.presentedGroupIds).toHaveLength(12);
    expect(presentation.presentedGroupIds.at(-1)).toBe("help");
    expect(presentation.specialistBoundaryGroupId).toBeNull();
  });

  it("folds the thin specialist groups into 삽입 and 도구 without dropping a row", () => {
    const groups = catalogue(3);
    const presentation = createStudioMainMenuPresentation(groups);

    const insert = presentation.groups.find((group) => group.id === "insert");
    const tools = presentation.groups.find((group) => group.id === "tools");
    expect(insert?.label).toBe("삽입");
    expect(tools?.label).toBe("도구");
    expect(presentation.compositeSources).toEqual({
      insert: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.insert],
      tools: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.tools],
    });

    // Every absorbed row is still there, in source order, with its id intact.
    const absorbed = [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.insert, ...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.tools];
    const expectedRowIds = absorbed.flatMap((id) =>
      groups.find((group) => group.id === id)!.items.map((item) => item.id),
    );
    const presentedRowIds = [...(insert?.items ?? []), ...(tools?.items ?? [])].map((item) => item.id);
    expect(presentedRowIds).toEqual(expectedRowIds);

    // No absorbed group survives as a title of its own.
    for (const id of absorbed) {
      expect(presentation.presentedGroupIds).not.toContain(id);
    }
  });

  it("captions every section inside a composite and rules between them, not after the last", () => {
    const presentation = createStudioMainMenuPresentation(catalogue(2));
    const tools = presentation.groups.find((group) => group.id === "tools")!;

    const captions = tools.items
      .map((item) => item.sectionLabel)
      .filter((label): label is string => label !== undefined);
    expect(captions).toEqual(["캔버스", "변형", "애니메이션", "3D", "협업", "AI"]);

    const rules = tools.items.map((item) => Boolean(item.separatorAfter));
    // 6 sections × 2 rows: a rule closes each section except the last one.
    expect(rules).toEqual([false, true, false, true, false, true, false, true, false, true, false, false]);
  });

  it("falls back to English composite titles for a non-Korean catalogue and honours overrides", () => {
    const english = createStudioMainMenuPresentation(
      catalogue(1, { file: "File", help: "Help" }),
    );
    expect(english.groups.find((group) => group.id === "insert")?.label).toBe("Insert");
    expect(english.groups.find((group) => group.id === "tools")?.label).toBe("Tools");

    const overridden = createStudioMainMenuPresentation(catalogue(1), {
      labels: { insert: "挿入" },
    });
    expect(overridden.groups.find((group) => group.id === "insert")?.label).toBe("挿入");
    expect(overridden.groups.find((group) => group.id === "tools")?.label).toBe("도구");
  });

  it("keeps unknown/future groups, slotted before 창 in source order", () => {
    const groups: StudioMainMenuPresentableGroup[] = [
      { id: "file", label: "파일", items: [{ id: "save" }] },
      { id: "future-a", label: "A", items: [{ id: "a" }] },
      { id: "brush", label: "그리기", items: [{ id: "pen" }] },
      { id: "window", label: "창", items: [{ id: "w" }] },
      { id: "future-b", label: "B", items: [{ id: "b" }] },
      { id: "help", label: "도움말", items: [{ id: "h" }] },
    ];

    const presentation = createStudioMainMenuPresentation(groups);

    expect(presentation.presentedGroupIds).toEqual([
      "file",
      "brush",
      "future-a",
      "future-b",
      "window",
      "help",
    ]);
  });

  it("passes non-composite groups and their command arrays through by reference", () => {
    const groups = catalogue(2);
    const presentation = createStudioMainMenuPresentation(groups);

    for (const group of groups) {
      if (studioMainMenuPresentedTitleFor(group.id) !== group.id) continue;
      const presented = presentation.groups.find((candidate) => candidate.id === group.id);
      expect(presented).toBe(group);
      expect(presented?.items).toBe(group.items);
    }
  });

  it("omits a composite title whose sources are all absent", () => {
    const presentation = createStudioMainMenuPresentation([
      { id: "file", label: "파일", items: [{ id: "save" }] },
      { id: "help", label: "도움말", items: [{ id: "h" }] },
    ]);
    expect(presentation.presentedGroupIds).toEqual(["file", "help"]);
    expect(presentation.compositeSources).toEqual({});
  });

  it("maps an absorbed catalogue group to the title that now presents it", () => {
    expect(studioMainMenuPresentedTitleFor("canvas")).toBe("tools");
    expect(studioMainMenuPresentedTitleFor("text")).toBe("insert");
    expect(studioMainMenuPresentedTitleFor("filter")).toBe("filter");
  });
});
