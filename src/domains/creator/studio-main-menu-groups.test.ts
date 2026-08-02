import { describe, expect, it, vi } from "vitest";

import {
  buildStudioMainMenuGroups,
  type StudioMainMenuBuilderState,
  type StudioMainMenuEditAvailability,
  type StudioMainMenuEditorActions,
  type StudioMainMenuUiActions,
} from "./studio-main-menu-groups";

import type {
  StudioMainMenuGroup,
  StudioMainMenuItem,
} from "./studio-main-menu-model";

const AVAILABLE_EDIT_ACTIONS: StudioMainMenuEditAvailability = {
  undoDisabled: false,
  redoDisabled: false,
  cutDisabled: false,
  copyDisabled: false,
  pasteDisabled: false,
  selectAllDisabled: false,
  deselectDisabled: false,
  invertSelectionDisabled: false,
  clearSelectionDisabled: false,
  duplicateDisabled: false,
  reorderDisabled: false,
  cropLayerDisabled: false,
};

const BASE_STATE: StudioMainMenuBuilderState = {
  sharedNonOwnerSave: false,
  saving: false,
  collaborationDocumentLocked: false,
  hasWorkId: false,
  projectArchiveBusy: false,
  interchangeImportBusy: false,
  psdImportBusy: false,
  edit: AVAILABLE_EDIT_ACTIONS,
  filterDisabled: false,
  filterUnavailableReason: null,
  viewTransformSuppressed: false,
  canvasFlipH: false,
  canvasRotation: 0,
  fullscreen: false,
  canvasRulersVisible: true,
  colorVisionMode: "none",
  referencePanelOpen: false,
  pageSequenceOpen: false,
  hasSavedView: false,
  perspectiveRulerActive: false,
  hasLocallyHiddenLayers: false,
  quickAccessPaletteOpen: false,
  quickAccessPaletteLoading: false,
  leftPanelOpen: true,
  rightPanelOpen: true,
  lastFilterDraft: null,
};

function createEditorActions(): StudioMainMenuEditorActions {
  return {
    copyImageToClipboard: vi.fn(),
    save: vi.fn(),
    exportProject: vi.fn(),
    exportProjectArchive: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    cutSelectedElements: vi.fn(),
    copySelectedElements: vi.fn(),
    pasteElements: vi.fn(),
    openImagePastePicker: vi.fn(),
    selectAll: vi.fn(),
    deselect: vi.fn(),
    invertSelection: vi.fn(),
    clearSelection: vi.fn(),
    duplicateSelected: vi.fn(),
    reorder: vi.fn(),
    openSelectedLayerCrop: vi.fn(),
    addText: vi.fn(),
    addPage: vi.fn(),
    toggleHorizontalCanvasView: vi.fn(),
    rotateCanvasView: vi.fn(),
    resetCanvasViewRotation: vi.fn(),
    fitCanvasToWidth: vi.fn(),
    setActualPixelView: vi.fn(),
    toggleFullscreen: vi.fn(),
    toggleCanvasRulers: vi.fn(),
    setColorVisionMode: vi.fn(),
    saveCurrentStudioView: vi.fn(),
    restoreSavedStudioView: vi.fn(),
    togglePerspectiveGuideView: vi.fn(),
    showAllLocallyHiddenLayers: vi.fn(),
    setStudioUiDensity: vi.fn(),
    enterCanvasOnlyMode: vi.fn(),
    openFeatureTutorial: vi.fn(),
    openStudioFilter: vi.fn(),
    toggleAdvancedFill: vi.fn(),
  };
}

function createUiActions(): StudioMainMenuUiActions {
  return {
    openExportDownload: vi.fn(),
    requestProjectImport: vi.fn(),
    requestInterchangeImport: vi.fn(),
    requestPsdImport: vi.fn(),
    openProjectTools: vi.fn(),
    toggleHistoryPanel: vi.fn(),
    openAppSettings: vi.fn(),
    openStudioMenu: vi.fn(),
    openAssetMenu: vi.fn(),
    requestImageInsert: vi.fn(),
    openMannequinPoser: vi.fn(),
    openVrmPoser: vi.fn(),
    openBackground3d: vi.fn(),
    openReferencePanel: vi.fn(),
    stepZoom: vi.fn(),
    toggleReferencePanel: vi.fn(),
    togglePageSequence: vi.fn(),
    openProductionInsights: vi.fn(),
    collapseSidePanels: vi.fn(),
    openToolsCompanion: vi.fn(),
    toggleQuickAccessPalette: vi.fn(),
    toggleLeftPanel: vi.fn(),
    toggleRightPanel: vi.fn(),
    openShortcuts: vi.fn(),
    selectDrawMode: vi.fn(),
    enableSmartShape: vi.fn(),
  };
}

type StateOverrides = Partial<Omit<StudioMainMenuBuilderState, "edit">> & {
  edit?: Partial<StudioMainMenuEditAvailability>;
};

function buildMenu(
  stateOverrides: StateOverrides = {},
  translate: (key: string) => string = (key) => key,
) {
  const editor = createEditorActions();
  const ui = createUiActions();
  const state: StudioMainMenuBuilderState = {
    ...BASE_STATE,
    ...stateOverrides,
    edit: {
      ...AVAILABLE_EDIT_ACTIONS,
      ...stateOverrides.edit,
    },
  };
  const groups = buildStudioMainMenuGroups({
    state,
    editor,
    ui,
    t: translate,
  });
  return { editor, groups, ui };
}

function menuItem(
  groups: readonly StudioMainMenuGroup[],
  groupId: string,
  itemId: string,
): StudioMainMenuItem {
  const group = groups.find((candidate) => candidate.id === groupId);
  const item = group?.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`Missing menu item: ${groupId}/${itemId}`);
  return item;
}

describe("buildStudioMainMenuGroups", () => {
  it("keeps the new Help group localized by reusing the established item keys", () => {
    const english = buildMenu({}, (key) => ({
      "studio.mainMenu.item.view.feature-tutorials": "Feature tutorials",
      "studio.mainMenu.item.view.shortcuts": "Shortcut help",
    }[key] ?? key)).groups;
    const korean = buildMenu({}, (key) => ({
      "studio.mainMenu.item.view.feature-tutorials": "기능 튜토리얼",
      "studio.mainMenu.item.view.shortcuts": "단축키 도움말",
    }[key] ?? key)).groups;

    expect(english.find((group) => group.id === "help")?.label).toBe("Help");
    expect(menuItem(english, "help", "feature-tutorials").label).toBe("Feature tutorials");
    expect(menuItem(english, "help", "shortcuts").label).toBe("Shortcut help");
    expect(korean.find((group) => group.id === "help")?.label).toBe("도움말");
    expect(menuItem(korean, "help", "feature-tutorials").label).toBe("사용법 · 기능 튜토리얼");
    expect(menuItem(korean, "help", "shortcuts").label).toBe("단축키 · 기본 조작");
  });

  it("preserves the complete group and item order", () => {
    const { groups } = buildMenu();

    expect(groups.map((group) => group.id)).toEqual([
      "file",
      "edit",
      "insert",
      "view",
      "filter",
      "draw",
      "ai",
      "help",
    ]);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      [
        "export",
        "copy-image",
        "save-draft",
        "publish",
        "export-json",
        "export-archive",
        "import-json",
        "import-psd",
        "import-ora-cbz",
        "project",
      ],
      [
        "undo",
        "redo",
        "cut",
        "copy",
        "paste",
        "paste-in-place",
        "paste-file",
        "select-all",
        "deselect",
        "invert-selection",
        "clear-selection",
        "duplicate",
        "bring-front",
        "bring-forward",
        "send-back",
        "send-backward",
        "crop-layer",
        "history",
        "pen-pressure",
        "app-settings",
      ],
      [
        "template",
        "collage",
        "elements",
        "bubble",
        "text",
        "image",
        "mannequin3d",
        "char",
        "bg3d",
        "ref",
        "page",
      ],
      [
        "zoom-in",
        "zoom-out",
        "flip-horizontal",
        "rotate-left",
        "rotate-right",
        "reset-rotation",
        "fit",
        "actual-pixels",
        "canvas-rulers",
        "fullscreen",
        "color-vision-original",
        "color-vision-grayscale",
        "color-vision-protanopia",
        "color-vision-deuteranopia",
        "color-vision-tritanopia",
        "reference-window",
        "page-sequence",
        "save-current-view",
        "restore-view",
        "perspective-guide",
        "reset-local-visibility",
        "production-insights",
        "density-focus",
        "density-full",
        "wide",
        "tools-companion",
        "canvas-only",
        "quick-access-palette",
        "left-panel",
        "right-panel",
        "app-settings",
      ],
      [
        "last-filter",
        "gaussian-blur",
        "motion-blur",
        "hue-saturation-brightness",
        "brightness-contrast",
        "color-curves",
        "mosaic",
        "radial-blur",
        "zoom-blur",
        "chromatic-aberration",
        "glitch",
        "scanline",
        "vignette",
        "lens-flare",
        "emboss",
        "solarize",
        "threshold",
        "oil-paint",
        "surface-blur",
        "lens-blur",
        "field-iris-blur",
        "tilt-shift-blur",
        "selective-gaussian-blur",
        "tileable-blur",
        "line-cleanup",
        "screentone-removal",
        "jpeg-artifact-reduction",
        "edge-aware-denoise",
        "dust-scratches",
        "difference-of-gaussians",
        "color-to-alpha",
        "duotone",
        "noise-add",
      ],
      ["pen", "eraser", "fill", "smart-shape", "bg", "style"],
      ["ai-assist", "stock", "integrations"],
      ["feature-tutorials", "shortcuts"],
    ]);
  });

  it("projects document, collaboration, edit, and view state without changing semantics", () => {
    const lastFilterDraft = { kind: "gaussian-blur" as const, radius: 12 };
    const { groups } = buildMenu({
      sharedNonOwnerSave: true,
      saving: true,
      collaborationDocumentLocked: true,
      hasWorkId: true,
      projectArchiveBusy: true,
      interchangeImportBusy: true,
      psdImportBusy: true,
      edit: Object.fromEntries(
        Object.keys(AVAILABLE_EDIT_ACTIONS).map((key) => [key, true]),
      ) as unknown as StudioMainMenuEditAvailability,
      filterDisabled: true,
      filterUnavailableReason: "저장이 끝난 뒤 필터를 적용하세요.",
      viewTransformSuppressed: true,
      canvasFlipH: true,
      canvasRotation: 90,
      fullscreen: true,
      canvasRulersVisible: false,
      colorVisionMode: "deuteranopia",
      referencePanelOpen: true,
      pageSequenceOpen: true,
      hasSavedView: true,
      perspectiveRulerActive: true,
      hasLocallyHiddenLayers: true,
      quickAccessPaletteOpen: true,
      quickAccessPaletteLoading: true,
      leftPanelOpen: false,
      rightPanelOpen: false,
      lastFilterDraft,
    });

    expect(menuItem(groups, "file", "save-draft")).toMatchObject({
      label: "공동 저장",
      disabled: true,
    });
    expect(menuItem(groups, "file", "publish")).toMatchObject({
      label: "수정 게시",
      disabled: true,
    });
    expect(menuItem(groups, "file", "export-archive").disabled).toBe(true);
    expect(menuItem(groups, "file", "import-psd").disabled).toBe(true);
    expect(menuItem(groups, "file", "import-ora-cbz").disabled).toBe(true);
    expect(menuItem(groups, "insert", "page").disabled).toBe(true);

    for (const itemId of [
      "undo",
      "redo",
      "cut",
      "copy",
      "paste",
      "paste-in-place",
      "paste-file",
      "select-all",
      "deselect",
      "invert-selection",
      "clear-selection",
      "duplicate",
      "bring-front",
      "bring-forward",
      "send-back",
      "send-backward",
      "crop-layer",
    ]) {
      expect(menuItem(groups, "edit", itemId).disabled, itemId).toBe(true);
    }

    expect(menuItem(groups, "view", "flip-horizontal")).toMatchObject({
      checked: true,
      disabled: true,
    });
    expect(menuItem(groups, "view", "fullscreen")).toMatchObject({
      checked: true,
      disabled: true,
    });
    expect(menuItem(groups, "view", "canvas-rulers")).toMatchObject({
      label: "캔버스 px 눈금자",
      checked: false,
      shortcut: "⌥⌘R",
    });
    expect(menuItem(groups, "view", "color-vision-deuteranopia")).toMatchObject({
      checked: true,
      disabled: true,
      selectionRole: "radio",
      hintKey: "color-vision:deuteranopia",
    });
    expect(menuItem(groups, "view", "color-vision-original").checked).toBe(false);
    for (const [id, previewVariant] of [
      ["original", "none"],
      ["grayscale", "grayscale"],
      ["protanopia", "protanopia"],
      ["deuteranopia", "deuteranopia"],
      ["tritanopia", "tritanopia"],
    ] as const) {
      expect(menuItem(groups, "view", `color-vision-${id}`)).toMatchObject({
        selectionRole: "radio",
        hintKey: `color-vision:${previewVariant}`,
      });
    }
    expect(menuItem(groups, "view", "reference-window").checked).toBe(true);
    expect(menuItem(groups, "view", "page-sequence")).toMatchObject({
      label: "페이지 시퀀스 닫기",
      checked: true,
    });
    expect(menuItem(groups, "view", "reset-rotation")).toMatchObject({
      label: "보기 회전 초기화 (90°)",
      disabled: true,
    });
    expect(menuItem(groups, "view", "restore-view").disabled).toBe(true);
    expect(menuItem(groups, "view", "perspective-guide").checked).toBe(true);
    expect(menuItem(groups, "view", "reset-local-visibility").disabled).toBe(false);
    expect(menuItem(groups, "view", "quick-access-palette")).toMatchObject({
      label: "빠른 액세스 불러오는 중…",
      shortcut: "⇧Q",
      checked: true,
      disabled: true,
    });
    expect(menuItem(groups, "view", "left-panel").label).toBe("왼쪽 패널 보이기");
    expect(menuItem(groups, "view", "right-panel").label).toBe("속성 패널 보이기");
    expect(menuItem(groups, "filter", "last-filter")).toMatchObject({
      label: "마지막 필터 다시 열기",
      disabled: true,
      unavailableReason: "저장이 끝난 뒤 필터를 적용하세요.",
    });
    expect(menuItem(groups, "filter", "color-curves")).toMatchObject({
      disabled: true,
      unavailableReason: "저장이 끝난 뒤 필터를 적용하세요.",
    });
  });

  it("gives every disabled command an actionable unavailable reason", () => {
    const { groups } = buildMenu({
      sharedNonOwnerSave: true,
      saving: true,
      collaborationDocumentLocked: true,
      projectArchiveBusy: true,
      interchangeImportBusy: true,
      psdImportBusy: true,
      edit: Object.fromEntries(
        Object.keys(AVAILABLE_EDIT_ACTIONS).map((key) => [key, true]),
      ) as unknown as StudioMainMenuEditAvailability,
      filterDisabled: true,
      filterUnavailableReason: "현재 문서 검사가 끝난 뒤 필터를 적용하세요.",
      viewTransformSuppressed: true,
      quickAccessPaletteLoading: true,
    });
    const disabledItems = groups.flatMap((group) =>
      group.items
        .filter((item) => item.disabled)
        .map((item) => ({ groupId: group.id, item }))
    );

    expect(disabledItems.length).toBeGreaterThan(20);
    for (const { groupId, item } of disabledItems) {
      expect(
        item.unavailableReason?.trim(),
        `${groupId}/${item.id} should explain why it is unavailable`,
      ).toBeTruthy();
    }
    expect(menuItem(groups, "file", "publish").unavailableReason).toContain(
      "협업 잠금"
    );
    expect(menuItem(groups, "edit", "invert-selection").unavailableReason).toContain(
      "픽셀 선택"
    );
    expect(menuItem(groups, "view", "restore-view").unavailableReason).toContain(
      "보기 변환"
    );
  });

  it("routes file, edit, insert, and drawing commands to their injected owners", () => {
    const { editor, groups, ui } = buildMenu();

    menuItem(groups, "file", "export").onSelect();
    menuItem(groups, "file", "save-draft").onSelect();
    menuItem(groups, "file", "publish").onSelect();
    menuItem(groups, "file", "import-json").onSelect();
    menuItem(groups, "file", "import-psd").onSelect();
    menuItem(groups, "file", "import-ora-cbz").onSelect();
    menuItem(groups, "edit", "paste").onSelect();
    menuItem(groups, "edit", "paste-in-place").onSelect();
    menuItem(groups, "edit", "bring-forward").onSelect();
    menuItem(groups, "edit", "pen-pressure").onSelect();
    menuItem(groups, "insert", "template").onSelect();
    menuItem(groups, "insert", "elements").onSelect();
    menuItem(groups, "insert", "text").onSelect();
    menuItem(groups, "insert", "page").onSelect();
    menuItem(groups, "draw", "pen").onSelect();
    menuItem(groups, "draw", "smart-shape").onSelect();
    menuItem(groups, "draw", "fill").onSelect();
    menuItem(groups, "ai", "ai-assist").onSelect();

    expect(ui.openExportDownload).toHaveBeenCalledOnce();
    expect(editor.save).toHaveBeenNthCalledWith(1, "draft");
    expect(editor.save).toHaveBeenNthCalledWith(2, "published");
    expect(ui.requestProjectImport).toHaveBeenCalledOnce();
    expect(ui.requestPsdImport).toHaveBeenCalledOnce();
    expect(ui.requestInterchangeImport).toHaveBeenCalledOnce();
    expect(editor.pasteElements).toHaveBeenNthCalledWith(1, "cascade");
    expect(editor.pasteElements).toHaveBeenNthCalledWith(2, "in-place");
    expect(editor.reorder).toHaveBeenCalledWith("forward");
    expect(ui.openAppSettings).toHaveBeenCalledWith("other");
    expect(ui.openAssetMenu).toHaveBeenCalledOnce();
    expect(ui.openStudioMenu).toHaveBeenCalledWith("elements");
    expect(editor.addText).toHaveBeenCalledOnce();
    expect(editor.addPage).toHaveBeenCalledOnce();
    expect(ui.selectDrawMode).toHaveBeenCalledWith("pen");
    expect(ui.enableSmartShape).toHaveBeenCalledOnce();
    expect(editor.toggleAdvancedFill).toHaveBeenCalledOnce();
    expect(ui.openStudioMenu).toHaveBeenCalledWith("aiAssist");
  });

  it("routes view and filter commands, including compound focus layout behavior", () => {
    const lastFilterDraft = { kind: "motion-blur" as const, distance: 8, angle: -30 };
    const { editor, groups, ui } = buildMenu({ lastFilterDraft });

    menuItem(groups, "view", "zoom-in").onSelect();
    menuItem(groups, "view", "zoom-out").onSelect();
    menuItem(groups, "view", "rotate-left").onSelect();
    menuItem(groups, "view", "canvas-rulers").onSelect();
    menuItem(groups, "view", "color-vision-tritanopia").onSelect();
    menuItem(groups, "view", "density-focus").onSelect();
    menuItem(groups, "view", "density-full").onSelect();
    menuItem(groups, "view", "tools-companion").onSelect();
    menuItem(groups, "view", "quick-access-palette").onSelect();
    menuItem(groups, "help", "feature-tutorials").onSelect();
    menuItem(groups, "help", "shortcuts").onSelect();
    menuItem(groups, "view", "app-settings").onSelect();
    menuItem(groups, "filter", "last-filter").onSelect();
    menuItem(groups, "filter", "gaussian-blur").onSelect();

    expect(ui.stepZoom).toHaveBeenNthCalledWith(1, 1);
    expect(ui.stepZoom).toHaveBeenNthCalledWith(2, -1);
    expect(editor.rotateCanvasView).toHaveBeenCalledWith("left");
    expect(editor.toggleCanvasRulers).toHaveBeenCalledOnce();
    expect(editor.setColorVisionMode).toHaveBeenCalledWith("tritanopia");
    expect(editor.setStudioUiDensity).toHaveBeenNthCalledWith(1, "focus");
    expect(ui.collapseSidePanels).toHaveBeenCalledOnce();
    expect(editor.setStudioUiDensity).toHaveBeenNthCalledWith(2, "full");
    expect(menuItem(groups, "view", "tools-companion").label).toBe(
      "멀티 디스플레이 작업공간…"
    );
    expect(ui.openToolsCompanion).toHaveBeenCalledOnce();
    expect(ui.toggleQuickAccessPalette).toHaveBeenCalledOnce();
    expect(editor.openFeatureTutorial).toHaveBeenCalledOnce();
    expect(ui.openShortcuts).toHaveBeenCalledOnce();
    expect(ui.openAppSettings).toHaveBeenCalledWith();
    expect(editor.openStudioFilter).toHaveBeenNthCalledWith(
      1,
      "motion-blur",
      lastFilterDraft,
    );
    expect(editor.openStudioFilter).toHaveBeenNthCalledWith(2, "gaussian-blur");
    expect(
      vi.mocked(editor.setStudioUiDensity).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(ui.collapseSidePanels).mock.invocationCallOrder[0]);
  });
});
