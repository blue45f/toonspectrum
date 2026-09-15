import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const BG3D_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CREATOR_DIRECTORY = dirname(BG3D_DIRECTORY);

function readCreatorSource(relativePath: string): string {
  return readFileSync(join(CREATOR_DIRECTORY, relativePath), "utf8");
}

function productionTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...productionTypeScriptFiles(path));
      continue;
    }
    if (!/\.tsx?$/u.test(entry.name) || /\.test\.tsx?$/u.test(entry.name)) continue;
    files.push(path);
  }
  return files;
}

describe("Studio BG3D command integration boundary", () => {
  it("owns every production history mutation through the typed adapter", () => {
    const adapterPath = join(BG3D_DIRECTORY, "studio-bg3d-history-command-adapter.ts");
    const legacyMutation = /history(?:Index)?Ref\.current\s*(?:=|\+=|-=|\+\+|--|\.push|\.splice)/u;
    const offenders = productionTypeScriptFiles(BG3D_DIRECTORY)
      .filter((path) => path !== adapterPath)
      .filter((path) => legacyMutation.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(BG3D_DIRECTORY.length + 1));

    expect(offenders).toEqual([]);
  });

  it("routes immediate, debounced, restore, undo and redo through one timeline", () => {
    const sceneOps = readCreatorSource("bg3d/studio-bg3d-editor-scene-ops-host.ts");
    const restore = readCreatorSource("bg3d/useStudioBg3dEditorRestoreEffects.ts");
    const state = readCreatorSource("bg3d/useStudioBg3dEditorState.ts");

    expect(sceneOps).toContain("commitStudioBg3dHistoryTransition(commandHistoryRefs");
    expect(sceneOps).toContain("stepStudioBg3dCommandHistory(commandHistoryRefs, direction)");
    expect(sceneOps).toContain("resetStudioBg3dCommandHistory(");
    expect(restore).toContain("commitStudioBg3dDebouncedHistory(commandHistoryRefs");
    expect(restore).toContain("clearStudioBg3dCommandHistory(commandHistoryRefs)");
    expect(restore).toContain("resetStudioBg3dCommandHistory(");
    expect(state).toContain("historyCommandTimelineRef");
  });

  it("keeps the precision-modeling bridge connected and preserves the live canonical scene first", () => {
    const panels = readCreatorSource("studio-cuttoon-editor/StudioCuttoonEditorPanels.tsx");
    const stack = readCreatorSource("StudioThreeDPreviewPanelStack.tsx");
    const editor = readCreatorSource("bg3d/useStudioBg3dEditor.ts");
    const shotHost = readCreatorSource("bg3d/studio-bg3d-editor-shot-host.ts");
    const workbench = readCreatorSource("bg3d/StudioBg3dProSuitePanelContent.tsx");
    const launchStart = panels.indexOf("onOpenPrecisionModeler={(scene) =>");
    const accessGuard = panels.indexOf('if (hybridDccRouteAccess !== "allowed")', launchStart);
    const blockedNotice = panels.indexOf('openHybridDccWorkspace("model")', accessGuard);
    const preserve = panels.indexOf("setBg3dInitialScene(scene)", blockedNotice);
    const close = panels.indexOf("setBg3dOpen(false)", preserve);
    const openDcc = panels.indexOf('openHybridDccWorkspace("model")', close);

    expect(launchStart).toBeGreaterThanOrEqual(0);
    expect(accessGuard).toBeGreaterThan(launchStart);
    expect(blockedNotice).toBeGreaterThan(accessGuard);
    expect(preserve).toBeGreaterThan(blockedNotice);
    expect(close).toBeGreaterThan(preserve);
    expect(openDcc).toBeGreaterThan(close);
    expect(stack).toContain("onOpenPrecisionModeler ? { onOpenPrecisionModeler } : {}");
    expect(editor).toContain('h.readCurrentCanonicalScene?.("precision-modeler")');
    expect(editor).toContain("props.onOpenPrecisionModeler(scene)");
    expect(shotHost).toContain("h.readCurrentCanonicalScene = readCurrentCanonicalScene");
    expect(shotHost).toContain('return readCurrentCanonicalScene("shot")');
    expect(workbench).toContain('data-testid="studio-bg3d-open-precision-modeler"');
    expect(workbench).toContain("disabled={locked || !onOpenPrecisionModeler}");
    expect(workbench).toContain("CAD 형상으로 자동 변환하지 않습니다");
  });
});
