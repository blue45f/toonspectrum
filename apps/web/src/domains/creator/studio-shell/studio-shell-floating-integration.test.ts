import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const shellDir = dirname(fileURLToPath(import.meta.url));
const creatorDir = join(shellDir, "..");

function source(path: string): string {
  return readFileSync(join(creatorDir, path), "utf8");
}

describe("studio shell floating integration", () => {
  it("registers every persistent drawing chrome target without owning transient safety UI", () => {
    expect(source("studio-shell/StudioDocumentWindowHub.tsx"))
      .toContain('data-studio-document-window-hub-bar="true"');
    expect(source("studio-shell/StudioDocumentWorkspaceDock.tsx"))
      .toContain('data-studio-shell-floating-target="document-tools"');
    expect(source("StudioDraftSaveCenterImpl.tsx"))
      .toContain("data-studio-shell-force-visible");
    expect(source("brush/StudioDrawOptionsBar.tsx"))
      .toContain('data-studio-draw-options-dock={docked ? "true" : undefined}');
    // Device calibration remains available as a dedicated panel, but it is no longer a permanent
    // canvas launcher. Drawing and selection share the canonical bottom context surface instead.
    expect(source("StudioOptionsBars.tsx")).not.toContain("StudioDrawingInputDeck");
    expect(source("brush/StudioDrawingInputDeckPanel.tsx"))
      .toContain('data-studio-drawing-input-deck-panel="true"');
    expect(source("offline/StudioOfflinePanel.tsx"))
      .toContain('data-studio-shell-floating-target="offline-readiness"');
    expect(source("live/huddle/StudioP2pHuddleLauncher.tsx"))
      .toContain('data-studio-shell-floating-target="collaboration"');
    expect(source("StudioWorkspaceArrangementToolbar.tsx"))
      .toContain('data-studio-shell-floating-target="workspace-arrangement"');
    expect(source("StudioWorkspaceArrangementControls.tsx"))
      .toContain('data-studio-shell-force-visible={arranging ? "true" : undefined}');
    expect(source("studio-cuttoon-editor/studio-cuttoon-stage-pointers-down-draw.ts"))
      .toContain('setStudioStrokeFocusActivity("canvas-stroke", true)');
    expect(source("StudioCuttoonEditorHost.tsx"))
      .toContain('setStudioStrokeFocusActivity("canvas-stroke", false)');
    expect(source("live/huddle/StudioP2pHuddleLauncher.tsx"))
      .toContain('strokeFocusPhase === "drawing"');
  });

  it("keeps phone floating status controls in separate lanes above the editing dock", () => {
    const saveCenter = source("StudioDraftSaveCenterImpl.tsx");
    const offline = source("offline/StudioOfflinePanel.tsx");
    const huddle = source("live/huddle/StudioP2pHuddleLauncher.tsx");
    const manager = source("studio-shell/StudioShellFloatingLayoutManager.tsx");
    expect(saveCenter).toContain("var(--studio-canvas-bottom-inset,7rem)+4.25rem");
    expect(offline).toContain("var(--studio-canvas-bottom-inset,7rem)+7.5rem");
    expect(offline).toContain('const shouldShowPanel = connectivity.mode !== "online"');
    expect(offline).toContain("if (!shouldShowPanel) return null;");
    expect(offline).toContain('data-studio-shell-force-visible="true"');
    expect(huddle).toContain("var(--studio-canvas-bottom-inset,7rem)+4.25rem");
    expect(manager).toContain("var(--studio-canvas-bottom-inset,0px)+0.75rem");
    expect(manager).toContain("보기 설정");
    expect(manager).toContain("{visibleCount}개");
  });

  it("lazy-loads the durable manager inside the document lifetime boundary", () => {
    const layout = source("studio-router/StudioDocumentLayout.tsx");
    const host = source("studio-shell/StudioShellFloatingLayoutHost.tsx");
    expect(layout).toContain('import("../studio-shell/StudioShellFloatingLayoutHost")');
    expect(layout).toContain("<StudioShellFloatingLayoutHost />");
    expect(layout.indexOf("{children}"))
      .toBeLessThan(layout.indexOf("<StudioShellFloatingLayoutHost />"));
    expect(host).toContain("<StudioShellFloatingLayoutProvider>");
    expect(host).toContain("<StudioShellFloatingLayoutManager />");
  });

  it("keeps WYSIWYG movement keyboard-accessible, lockable and below modal chrome", () => {
    const target = source("studio-shell/StudioShellFloatingTarget.tsx");
    expect(target).toContain("setStudioFloatingSurfaceDock");
    expect(target).toContain("setStudioFloatingSurfaceLock");
    expect(target).toContain("disabled={layout.positionLocked}");
    expect(target).toContain("disabled={layout.sizeLocked}");
    expect(target).toContain('data-studio-shell-floating-handle={surfaceId}');
    expect(target).toContain('data-studio-shell-floating-dock-guide={surfaceId}');
    expect(target).toContain('aria-label={`${definition.label} 도킹 위치`}');
    expect(target).toContain("const managedVisible = preferredVisible || forceVisible");
    expect(target).toContain("setSurfaceMounted(surfaceId, node !== null)");
    expect(target).toContain("if (!node || !managedVisible || !positionEnabled)");
    expect(target).toContain("zIndex: 119");
    expect(target).not.toContain('node.style.removeProperty("width")');
    expect(target).toContain('node.style.setProperty("translate", "none")');
    expect(target).toContain('"translate",');
    expect(target).toContain('typeof ResizeObserver === "undefined"');

    const provider = source("studio-shell/StudioShellFloatingLayoutProvider.tsx");
    expect(provider).not.toContain("navigator.storage");
    expect(provider).toContain('"data-studio-shell-stroke-auto-hide"');
    expect(provider).toContain("studioStrokeFocusActivitySnapshot");
    expect(provider).toContain("STUDIO_SHELL_DRAWING_AUTO_HIDE_RELEASE_MS");

    const manager = source("studio-shell/StudioShellFloatingLayoutManager.tsx");
    expect(manager).toContain('aria-keyshortcuts="Control+Shift+L Meta+Shift+L"');
    expect(manager).toContain("z-[70]");
    expect(manager).toContain("drawingAutoHideRunning");
    expect(manager).toContain("shell.autoHideWhileDrawing");
    expect(manager).toContain("shell.drawingAutoHideActive");
    expect(manager).toContain("플랫폼 규격");
    expect(manager).toContain("펜으로 그리는 동안 자동 숨김");
    expect(manager).toContain("data-studio-shell-drawing-auto-hide-active");
    expect(manager).toContain("data-studio-shell-mounted-state");
    expect(manager).toContain("data-studio-shell-focus-mode");
    expect(manager).toContain("--studio-canvas-bottom-inset");
    expect(manager).toContain("StudioDesktopFloatingSurface");
    expect(manager).toContain("STUDIO_FLOATING_MENU_LAYOUTS.viewOptions");
    expect(manager).toContain('data-studio-shell-view-options-panel');
    expect(manager).toContain("useMediaQuery(STUDIO_DESKTOP_FLOATING_QUERY)");
  });
});
