import { describe, expect, it } from "vitest";

import {
  isStudioPasteScopeCurrent,
  resolveStudioEditAvailability,
  resolveStudioEditShortcut,
  shouldHandleStudioEditEvent,
  STUDIO_EDIT_MENU_COMMAND_ORDER,
  STUDIO_EDIT_MENU_COMMANDS,
} from "./studio-edit-controls";

describe("studio edit menu catalog", () => {
  it("keeps the production command order and Magma-compatible shortcuts in one contract", () => {
    const legacyCommandContract = STUDIO_EDIT_MENU_COMMAND_ORDER.map((id) => {
      const command = STUDIO_EDIT_MENU_COMMANDS[id];
      return "shortcut" in command
        ? { id: command.id, label: command.label, shortcut: command.shortcut }
        : { id: command.id, label: command.label };
    });

    expect(legacyCommandContract).toEqual([
      { id: "undo", label: "실행취소", shortcut: "⌘Z" },
      { id: "redo", label: "다시실행", shortcut: "⌘⇧Z" },
      { id: "cut", label: "잘라내기", shortcut: "⌘X" },
      { id: "copy", label: "복사", shortcut: "⌘C" },
      { id: "paste", label: "붙여넣기", shortcut: "⌘V" },
      { id: "paste-in-place", label: "현재 위치에 붙여넣기", shortcut: "⌘⇧V" },
      { id: "paste-file", label: "이미지 파일 붙여넣기…" },
      { id: "select-all", label: "모두 선택", shortcut: "⌘A" },
      { id: "deselect", label: "선택 해제", shortcut: "⌘D" },
      { id: "invert-selection", label: "선택 반전", shortcut: "⌘⇧I" },
      { id: "clear-selection", label: "선택 제거", shortcut: "Delete" },
      { id: "duplicate", label: "복제", shortcut: "⌘J" },
      { id: "bring-front", label: "레이어 · 맨 위로", shortcut: "⌘⇧]" },
      { id: "bring-forward", label: "레이어 · 위로", shortcut: "⌘]" },
      { id: "send-back", label: "레이어 · 맨 뒤로", shortcut: "⌘[" },
      { id: "send-backward", label: "레이어 · 뒤로", shortcut: "⌘⇧[" },
      { id: "crop-layer", label: "레이어 자르기…" },
      { id: "history", label: "작업 내역" },
      { id: "pen-pressure", label: "펜 압력 설정…" },
      { id: "app-settings", label: "애플리케이션 설정…" },
    ]);
  });

  it("provides a stable translation key for every production command", () => {
    expect(
      STUDIO_EDIT_MENU_COMMAND_ORDER.map((id) => STUDIO_EDIT_MENU_COMMANDS[id].labelKey),
    ).toEqual(
      STUDIO_EDIT_MENU_COMMAND_ORDER.map((id) => `studio.mainMenu.edit.command.${id}`),
    );
  });
});

describe("studio edit availability", () => {
  const editableSelection = {
    historyIndex: 1,
    historyLength: 3,
    documentEmpty: false,
    hasElementSelection: true,
    hasSingleElementSelection: true,
    hasPixelSelection: false,
    hasPixelEditing: false,
    pixelBusy: false,
    selectedImage: false,
    pixelToolTargetAvailable: false,
    interactionLocked: false,
    mutationLocked: false,
    selectedContentMutationLocked: false,
    masterEditMode: false,
  } as const;

  it("enables element mutations and both history directions for an editable selection", () => {
    expect(resolveStudioEditAvailability(editableSelection)).toMatchObject({
      undoDisabled: false,
      redoDisabled: false,
      cutDisabled: false,
      copyDisabled: false,
      pasteDisabled: false,
      selectAllDisabled: false,
      deselectDisabled: false,
      duplicateDisabled: false,
      reorderDisabled: false,
    });
  });

  it("keeps read-only selection commands usable while mutation commands are locked", () => {
    expect(resolveStudioEditAvailability({ ...editableSelection, mutationLocked: true })).toEqual({
      undoDisabled: true,
      redoDisabled: true,
      cutDisabled: true,
      copyDisabled: false,
      pasteDisabled: true,
      selectAllDisabled: false,
      deselectDisabled: false,
      invertSelectionDisabled: true,
      clearSelectionDisabled: true,
      duplicateDisabled: true,
      reorderDisabled: true,
      cropLayerDisabled: true,
    });
  });

  it("blocks read-only selection inspection while a transient capture owns the page history", () => {
    expect(resolveStudioEditAvailability({
      ...editableSelection,
      interactionLocked: true,
    })).toMatchObject({
      copyDisabled: true,
      selectAllDisabled: true,
      deselectDisabled: true,
      invertSelectionDisabled: true,
    });
  });

  it("models pixel selection and master history independently", () => {
    expect(resolveStudioEditAvailability({
      ...editableSelection,
      hasElementSelection: true,
      hasPixelSelection: true,
      hasPixelEditing: true,
      selectedImage: true,
      pixelToolTargetAvailable: true,
      masterEditMode: true,
    })).toMatchObject({
      undoDisabled: true,
      redoDisabled: true,
      deselectDisabled: false,
      invertSelectionDisabled: false,
      clearSelectionDisabled: false,
      cropLayerDisabled: false,
    });
  });

  it("enables crop when the sole editable image can be auto-selected without a prior selection", () => {
    // Rail Crop + keyboard C already work via ensurePixelToolTarget; the Edit menu must match.
    expect(resolveStudioEditAvailability({
      ...editableSelection,
      hasElementSelection: false,
      hasSingleElementSelection: false,
      selectedImage: false,
      pixelToolTargetAvailable: true,
    }).cropLayerDisabled).toBe(false);
  });

  it("keeps crop disabled when no pixel-tool target is available or mutations are locked", () => {
    expect(resolveStudioEditAvailability({
      ...editableSelection,
      selectedImage: true,
      pixelToolTargetAvailable: false,
    }).cropLayerDisabled).toBe(true);
    expect(resolveStudioEditAvailability({
      ...editableSelection,
      selectedImage: true,
      pixelToolTargetAvailable: true,
      mutationLocked: true,
    }).cropLayerDisabled).toBe(true);
  });

  it("never exposes destructive pixel deletion while the image is locked or already busy", () => {
    const pixelSelection = {
      ...editableSelection,
      hasPixelSelection: true,
      hasPixelEditing: true,
      selectedImage: true,
    };
    expect(resolveStudioEditAvailability({
      ...pixelSelection,
      selectedContentMutationLocked: true,
    }).clearSelectionDisabled).toBe(true);
    expect(resolveStudioEditAvailability({
      ...pixelSelection,
      pixelBusy: true,
    }).clearSelectionDisabled).toBe(true);
  });

  it("disables empty-document selection actions", () => {
    expect(resolveStudioEditAvailability({
      ...editableSelection,
      historyIndex: 0,
      historyLength: 1,
      documentEmpty: true,
      hasElementSelection: false,
      hasSingleElementSelection: false,
    })).toMatchObject({
      undoDisabled: true,
      redoDisabled: true,
      cutDisabled: true,
      copyDisabled: true,
      selectAllDisabled: true,
      deselectDisabled: true,
      clearSelectionDisabled: true,
      duplicateDisabled: true,
      reorderDisabled: true,
    });
  });
});

describe("studio edit shortcuts", () => {
  it.each([
    [{ code: "KeyX", metaKey: true }, "cut"],
    [{ code: "KeyC", ctrlKey: true }, "copy"],
    [{ code: "KeyV", metaKey: true, shiftKey: true }, "paste-in-place"],
    [{ code: "KeyA", ctrlKey: true }, "select-all"],
    [{ code: "KeyD", metaKey: true }, "deselect"],
    [{ code: "KeyI", ctrlKey: true, shiftKey: true }, "invert-selection"],
    [{ code: "KeyJ", metaKey: true }, "duplicate"],
    [{ code: "BracketRight", metaKey: true, shiftKey: true }, "bring-front"],
    [{ code: "BracketRight", metaKey: true }, "bring-forward"],
    [{ code: "BracketLeft", metaKey: true }, "send-back"],
    [{ code: "BracketLeft", metaKey: true, shiftKey: true }, "send-backward"],
  ] as const)("maps %o to %s", (event, expected) => {
    expect(resolveStudioEditShortcut(event)).toBe(expected);
  });

  it("does not steal plain paste, merged-copy, Alt, repeats, or IME input", () => {
    expect(resolveStudioEditShortcut({ code: "KeyV", metaKey: true })).toBeNull();
    expect(resolveStudioEditShortcut({ code: "KeyC", metaKey: true, shiftKey: true })).toBeNull();
    expect(resolveStudioEditShortcut({ code: "KeyX", metaKey: true, altKey: true })).toBeNull();
    expect(resolveStudioEditShortcut({ code: "KeyD", metaKey: true, repeat: true })).toBeNull();
    expect(resolveStudioEditShortcut({ code: "KeyA", metaKey: true, isComposing: true })).toBeNull();
    expect(resolveStudioEditShortcut({ code: "KeyA", metaKey: true, keyCode: 229 })).toBeNull();
  });
});

describe("studio edit event guard", () => {
  it("allows an untouched canvas/background event", () => {
    expect(shouldHandleStudioEditEvent({})).toBe(true);
  });

  it.each([
    "defaultPrevented",
    "composing",
    "typing",
    "editing",
    "insideShortcutBoundary",
    "modalOpen",
    "timelapseCapturing",
  ] as const)("blocks %s for both keydown and paste routing", (key) => {
    expect(shouldHandleStudioEditEvent({ [key]: true })).toBe(false);
  });
});

describe("studio async paste scope", () => {
  const current = {
    mutationAllowed: true,
    reviewLocked: false,
    targetPageId: "page-a",
    currentPageId: "page-a",
    targetMasterEditMode: false,
    currentMasterEditMode: false,
  } as const;

  it("allows the same editable page and master surface after await", () => {
    expect(isStudioPasteScopeCurrent(current)).toBe(true);
  });

  it.each([
    { mutationAllowed: false },
    { reviewLocked: true },
    { currentPageId: "page-b" },
    { currentMasterEditMode: true },
  ])("rejects a stale or newly locked continuation: %o", (patch) => {
    expect(isStudioPasteScopeCurrent({ ...current, ...patch })).toBe(false);
  });
});
