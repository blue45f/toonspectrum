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
    expect(source("brush/StudioDrawingInputDeck.tsx"))
      .toContain('data-studio-drawing-input-deck-trigger="true"');
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
    expect(target).toContain("setStudioFloatingSurfaceLock");
    expect(target).toContain("disabled={layout.positionLocked}");
    expect(target).toContain("disabled={layout.sizeLocked}");
    expect(target).toContain('data-studio-shell-floating-handle={surfaceId}');
    expect(target).toContain("zIndex: 119");
    expect(target).not.toContain('node.style.removeProperty("width")');
    expect(target).toContain('node.style.setProperty("translate", "none")');
    expect(target).toContain('"translate",');
    expect(target).toContain('typeof ResizeObserver === "undefined"');

    const provider = source("studio-shell/StudioShellFloatingLayoutProvider.tsx");
    expect(provider).not.toContain("navigator.storage");

    const manager = source("studio-shell/StudioShellFloatingLayoutManager.tsx");
    expect(manager).toContain('aria-keyshortcuts="Control+Shift+L Meta+Shift+L"');
    expect(manager).toContain("z-[70]");
    expect(manager).toContain("플랫폼 규격");
  });
});
