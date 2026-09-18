import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readSibling(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
}

describe("Studio BG3D professional workspace boundary", () => {
  it("keeps the modal shell typed and exposes the three-panel desktop workspace", () => {
    const source = readSibling("./StudioBg3dEditorModal.tsx");
    expect(source).not.toContain("@ts-nocheck");
    expect(source).toContain('data-studio-bg3d-workspace="professional-v2"');
    expect(source).toContain("<StudioBg3dProfessionalWorkspace");
    const workspace = readSibling("./StudioBg3dProfessionalWorkspace.tsx");
    expect(workspace).toContain('data-studio-bg3d-workspace-layout="dockable-v2"');
    expect(workspace).toContain("--studio-bg3d-outliner-order");
    expect(workspace).toContain("applyStudioBg3dWorkspacePreset");
    expect(workspace).toContain("swapStudioBg3dWorkspaceDockOrder");
    expect(source).toContain("scopeKey={h.sharedStageSessionScopeKey ?? null}");
    expect(source).toContain("<StudioBg3dSceneOutliner");
  });

  it("keeps the outliner controller renderer-neutral", () => {
    const source = readSibling("./studio-bg3d-scene-outliner-controller.ts");
    expect(source).not.toMatch(/from ["']three/);
    expect(source).not.toMatch(/babylon/i);
    expect(source).not.toContain("studio-bg3d-editor-runtime-bindings");
    expect(source).not.toContain("Object3D");
    expect(source).not.toContain("WebGLRenderer");
  });
  it("uses the same typed outliner on narrow and wide workspaces", () => {
    const modal = readSibling("./StudioBg3dEditorModal.tsx");
    const sidebar = readSibling("./StudioBg3dEditorSidebarExtras.tsx");
    expect(modal).toContain('variant="dock"');
    expect(sidebar).toContain('variant="panel"');
    expect(sidebar).not.toContain('role="tree" aria-label="3D 장면 객체"');
  });

  it("routes outliner writes through one typed history mutation boundary", () => {
    const editor = readSibling("./useStudioBg3dEditor.ts");
    const mutation = readSibling("./studio-bg3d-outliner-mutation.ts");
    expect(editor).toContain("planStudioBg3dOutlinerMutation");
    expect(editor).toContain("commitImmediateHistoryTransition");
    expect(editor).toContain("createStudioBg3dHistorySnapshot(live)");
    expect(editor).toContain("commandId: plan.command.id");
    expect(editor).not.toContain("h.renameBgObject(item.id, item.kind)");
    expect(editor).not.toContain("h.togglePrimitiveFlag(item.id");
    expect(editor).toContain("h.replaceCanonicalDocumentState({");
    expect(mutation).not.toMatch(/from ["']three/);
    expect(mutation).not.toContain("studio-bg3d-editor-runtime-bindings");
  });
});
