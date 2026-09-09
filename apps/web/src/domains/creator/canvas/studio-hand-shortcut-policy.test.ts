import { describe, expect, it } from "vitest";

import { defaultStudioAppSettings } from "../studio-app-settings";
import {
  isStudioPersistentHandShortcut,
  planStudioHandShortcutMigration,
  shouldDispatchStudioHandShortcut,
  STUDIO_CANVAS_FLIP_FALLBACK_SHORTCUT,
  STUDIO_HAND_SHORTCUT,
} from "./studio-hand-shortcut-policy";

describe("studio hand shortcut migration", () => {
  it("resolves the shipped Space/H conflict into professional Hand and flip bindings", () => {
    const shortcuts = defaultStudioAppSettings().shortcuts;

    expect(planStudioHandShortcutMigration(shortcuts)).toEqual({
      handShortcut: STUDIO_HAND_SHORTCUT,
      canvasFlipShortcut: STUDIO_CANVAS_FLIP_FALLBACK_SHORTCUT,
    });
  });

  it("does not rewrite any custom hand or canvas-flip mapping", () => {
    const customHand = defaultStudioAppSettings().shortcuts;
    customHand["tool-hand"] = "Alt+Space";
    expect(planStudioHandShortcutMigration(customHand)).toBeNull();

    const customFlip = defaultStudioAppSettings().shortcuts;
    customFlip["flip-canvas"] = "F";
    expect(planStudioHandShortcutMigration(customFlip)).toBeNull();
  });

  it("treats Space as temporary and non-empty alternatives as persistent", () => {
    expect(isStudioPersistentHandShortcut("Space")).toBe(false);
    expect(isStudioPersistentHandShortcut("  space  ")).toBe(false);
    expect(isStudioPersistentHandShortcut("")).toBe(false);
    expect(isStudioPersistentHandShortcut("H")).toBe(true);
    expect(isStudioPersistentHandShortcut("Alt+Space")).toBe(true);
  });
});

describe("studio hand shortcut safety gate", () => {
  const safeInput = {
    defaultPrevented: false,
    isComposing: false,
    keyCode: 72,
    repeat: false,
    typing: false,
    insideShortcutBoundary: false,
    openModal: false,
  } as const;

  it("allows an ordinary Studio keydown", () => {
    expect(shouldDispatchStudioHandShortcut(safeInput)).toBe(true);
  });

  it.each([
    ["already consumed", { defaultPrevented: true }],
    ["IME composition", { isComposing: true }],
    ["IME keyCode", { keyCode: 229 }],
    ["auto repeat", { repeat: true }],
    ["typing target", { typing: true }],
    ["shortcut boundary", { insideShortcutBoundary: true }],
    ["open modal", { openModal: true }],
  ])("blocks %s", (_label, patch) => {
    expect(
      shouldDispatchStudioHandShortcut({
        ...safeInput,
        ...patch,
      })
    ).toBe(false);
  });
});
