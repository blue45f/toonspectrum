// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { defaultStudioAppSettings } from "../studio-app-settings";
import { readStudioCuttoonEditorSource } from "../studio-cuttoon-editor/read-studio-cuttoon-editor-source";
import { buildStudioShortcutHandler, type StudioShortcutHandlerContext } from "../studio-page-shortcut-dispatcher";
import type { StudioBrushEngineProgramSet } from "./studio-brush-engine-program-set";
import { adjustStudioBrushWidthFromWheel } from "./studio-drawing-shortcuts";

const materialPrograms = () => createBrushStudioV6ProductBrush(createBrushStudioV6Program("oil-hair-mixer")).enginePrograms!;

function shortcuts(width: number, programs: StudioBrushEngineProgramSet | null, opacity = 1) {
  const current = { tool: "draw" as const, drawMode: "pen" as const,
    strokeWidth: width, brushOpacity: opacity, brushEnginePrograms: programs };
  const setStrokeWidth = vi.fn();
  const setBrushOpacity = vi.fn();
  // Unrelated editing actions remain absent; this executes the real dispatcher and focus gates.
  const context = {
    appSettingsRef: { current: defaultStudioAppSettings() },
    drawingShortcutStateRef: { current },
    pixelSelectionHistoryRef: { current: null },
    pixelSelectionDocumentHistoryOwnsLatestEditRef: { current: false },
    activeSurfaceReviewLockedRef: { current: false },
    setStrokeWidth, setBrushOpacity, announceDrawingShortcut: vi.fn(),
  } as unknown as StudioShortcutHandlerContext;
  return { current, setStrokeWidth, setBrushOpacity, handle: buildStudioShortcutHandler(context) };
}

describe("material brush numeric shortcuts", () => {
  it("uses the actual bracket dispatcher to nudge material widths above 80 and stop at 240", () => {
    const active = shortcuts(150, materialPrograms());
    active.handle(new KeyboardEvent("keydown", { key: "]", code: "BracketRight", cancelable: true }));
    expect(active.setStrokeWidth).toHaveBeenLastCalledWith(151);
    active.handle(new KeyboardEvent("keydown", { key: "{", code: "BracketLeft", shiftKey: true, cancelable: true }));
    expect(active.setStrokeWidth).toHaveBeenLastCalledWith(146);
    active.current.strokeWidth = 239;
    active.handle(new KeyboardEvent("keydown", { key: "}", code: "BracketRight", shiftKey: true, cancelable: true }));
    expect(active.setStrokeWidth).toHaveBeenLastCalledWith(240);
    active.setStrokeWidth.mockClear();
    active.handle(new KeyboardEvent("keydown", { key: "]", code: "BracketRight", cancelable: true }));
    expect(active.current.strokeWidth).toBe(240);
    expect(active.setStrokeWidth).not.toHaveBeenCalled();
  });

  it("keeps built-in bracket bounds at 80 and material Alt-bracket opacity at 1%", () => {
    const builtin = shortcuts(79, null);
    builtin.handle(new KeyboardEvent("keydown", { key: "}", code: "BracketRight", shiftKey: true }));
    expect(builtin.current.strokeWidth).toBe(80);
    const material = shortcuts(150, materialPrograms(), 0.02);
    material.handle(new KeyboardEvent("keydown", { key: "[", code: "BracketLeft", altKey: true }));
    expect(material.setBrushOpacity).toHaveBeenLastCalledWith(0.01);
    material.handle(new KeyboardEvent("keydown", { key: "]", code: "BracketRight", altKey: true }));
    expect(material.setBrushOpacity).toHaveBeenLastCalledWith(0.06);
    const builtinOpacity = shortcuts(24, null, 0.07);
    builtinOpacity.handle(new KeyboardEvent("keydown", { key: "[", code: "BracketLeft", altKey: true }));
    expect(builtinOpacity.setBrushOpacity).toHaveBeenLastCalledWith(0.05);
  });

  it("uses the configured wheel direction and shift step with the same material bounds", () => {
    const material = materialPrograms();
    expect(adjustStudioBrushWidthFromWheel(150, { deltaY: -40, shiftKey: false }, false, material)).toBe(151);
    expect(adjustStudioBrushWidthFromWheel(150, { deltaY: 40, shiftKey: true }, false, material)).toBe(145);
    expect(adjustStudioBrushWidthFromWheel(150, { deltaY: 40, shiftKey: true }, true, material)).toBe(155);
    expect(adjustStudioBrushWidthFromWheel(239, { deltaY: -40, shiftKey: true }, false, material)).toBe(240);
    expect(adjustStudioBrushWidthFromWheel(1, { deltaY: 40, shiftKey: true }, false, material)).toBe(1);
    expect(adjustStudioBrushWidthFromWheel(79, { deltaY: -40, shiftKey: true }, false)).toBe(80);
    const source = readStudioCuttoonEditorSource();
    const wheelStart = source.indexOf('if (wheelMode === "brush-size")');
    const wheel = source.slice(wheelStart, source.indexOf('if (wheelMode === "pan")', wheelStart));
    expect(wheel).toContain("adjustStudioBrushWidthFromWheel(w, e, prefs.reverseWheel, currentBrushSnapshotRef.current?.enginePrograms)");
    expect(source).toContain("drawingShortcutStateRef.current = { tool, drawMode, strokeWidth, brushOpacity, brushEnginePrograms }");
  });
});
