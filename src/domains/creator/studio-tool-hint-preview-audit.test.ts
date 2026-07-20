import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SOURCES = {
  background3d: readFileSync(new URL("./StudioBackground3D.tsx", import.meta.url), "utf8"),
  frame: readFileSync(new URL("./StudioFrameAnimationPanel.tsx", import.meta.url), "utf8"),
  layer: readFileSync(new URL("./StudioLayerNavigator.tsx", import.meta.url), "utf8"),
  mainMenu: readFileSync(new URL("./StudioMainMenu.tsx", import.meta.url), "utf8"),
  menubar: readFileSync(new URL("./StudioMenubarContent.tsx", import.meta.url), "utf8"),
  vrm: readFileSync(new URL("./StudioVrmPoser.tsx", import.meta.url), "utf8"),
} as const;

function authoredPreview(source: string, id: string): string | null {
  const start = source.indexOf(`id: "${id}"`);
  expect(start, `missing hint id ${id}`).toBeGreaterThanOrEqual(0);
  const preview = source.slice(start, start + 700).match(/preview:\s*"([a-z0-9-]+)"/u);
  return preview?.[1] ?? null;
}

describe("Studio tool-hint preview authorship audit", () => {
  it.each([
    ["menubar", "menubar-undo", "undo"],
    ["menubar", "menubar-redo", "redo"],
    ["menubar", "menubar-history", "history"],
    ["menubar", "menubar-assets", "assets"],
    ["menubar", "menubar-bubbles", "bubble"],
    ["menubar", "menubar-download", "export"],
    ["menubar", "menubar-export-options", "export"],
    ["menubar", "menubar-project", "project"],
    ["menubar", "menubar-immersive", "fullscreen"],
    ["menubar", "menubar-save-draft", "save"],
    ["menubar", "menubar-publish", "publish"],
    ["mainMenu", "main-menu-file", "project"],
    ["mainMenu", "main-menu-edit", "history"],
    ["mainMenu", "main-menu-insert", "assets"],
    ["mainMenu", "main-menu-view", "zoom-view"],
    ["mainMenu", "main-menu-filter", "filter"],
    ["mainMenu", "main-menu-draw", "ink"],
    ["mainMenu", "main-menu-ai", "ai-assist"],
    ["frame", "frame-reorder-previous", "frame-reorder"],
    ["frame", "frame-reorder-next", "frame-reorder"],
    ["frame", "frame-duplicate", "frame-duplicate"],
    ["frame", "frame-delete", "frame-delete"],
    ["frame", "frame-capture", "frame-capture"],
    ["frame", "frame-playback", "frame-playback"],
  ] as const)("keeps %s:%s on the authored %s visual", (sourceName, id, preview) => {
    expect(authoredPreview(SOURCES[sourceName], id)).toBe(preview);
  });

  it.each([
    ["background3d", "bg3d:transform:translate", "object-translate"],
    ["background3d", "bg3d:transform:rotate", "object-rotate"],
    ["background3d", "bg3d:transform:scale", "object-scale"],
    ["background3d", "bg3d:view:quad", "quad-view"],
    ["background3d", "bg3d:history:undo", "undo"],
    ["background3d", "bg3d:history:redo", "redo"],
    ["background3d", "bg3d:object:ground", "object-ground"],
    ["background3d", "bg3d:object:origin-ground", "object-ground"],
    ["background3d", "bg3d:camera:focus-selection", "camera-zoom"],
    ["background3d", "bg3d:camera:zoom-in", "camera-zoom"],
    ["background3d", "bg3d:camera:zoom-out", "camera-zoom"],
    ["background3d", "bg3d:camera:reset", "camera-reset"],
    ["background3d", "bg3d:view:line-preview", "line-art"],
    ["vrm", "vrm:history:undo", "undo"],
    ["vrm", "vrm:history:redo", "redo"],
    ["vrm", "vrm:camera:zoom-in", "camera-zoom"],
    ["vrm", "vrm:camera:zoom-out", "camera-zoom"],
    ["vrm", "vrm:camera:reset", "camera-reset"],
    ["vrm", "vrm:camera:turntable", "camera-orbit"],
  ] as const)("keeps %s:%s on the spatially correct %s visual", (sourceName, id, preview) => {
    expect(authoredPreview(SOURCES[sourceName], id)).toBe(preview);
  });

  it.each([
    ["layer-batch-show", "layer-visibility"],
    ["layer-batch-hide", "layer-visibility"],
    ["layer-batch-lock", "layer-lock"],
    ["layer-batch-unlock", "layer-lock"],
    ["layer-batch-merge-selected", "layer-merge"],
    ["layer-batch-flatten-visible", "layer-merge"],
    ["layer-batch-more", "layer-actions"],
  ] as const)("keeps layer action %s on the %s visual", (id, preview) => {
    expect(authoredPreview(SOURCES.layer, id)).toBe(preview);
  });
});
