import { describe, expect, it } from "vitest";
import { defaultStudioAppSettings } from "./studio-app-settings";
import { STUDIO_CANVAS_WIDTH } from "./canvas/studio-canvas-constants";
import { STUDIO_CREATION_PRESETS, studioCreationPreset } from "./studio-creation-presets";
import { readStudioLocalCanvasSeed, studioLocalCanvasSeedPage } from "./studio-local-canvas-seed";
import { readStudioLaunchDensity, readStudioLaunchPrimaryTool } from "./studio-launch-mode";
import { createStudioProjectWithInitialDocument } from "./studio-project-creation";
import { ensureInitialStudioProjectDocument } from "./studio-project-document-store";
import { preserveStudioTaskToolbarPreference, projectStudioTaskAppSettings } from "./studio-task-tools";
import { applyStudioTaskWorkspace, studioTaskWorkspaceId } from "./studio-task-workspace";
import { createStudioWorkspaceDefaultState } from "./studio-workspaces";

// Isolated in-memory fixture. Tests never access the user's stored documents.
class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("quick and task-specific studio workspaces", () => {
  it.each(STUDIO_CREATION_PRESETS)("initializes $id with its selected aspect ratio", (preset) => {
    const storage = new MemoryStorage();
    const { project, document } = createStudioProjectWithInitialDocument(storage, {
      title: "Task document", kind: preset.kind, templateId: preset.id,
    });
    expect(document).toMatchObject({ width: preset.width, height: preset.height });
    const route = { projectId: project.id, documentId: document.id, workId: null, remixSourceWorkId: null };
    expect(readStudioLocalCanvasSeed(route, storage)?.canvasH)
      .toBe(Math.round(STUDIO_CANVAS_WIDTH * preset.height / preset.width));
    expect(readStudioLocalCanvasSeed({ ...route, workId: "cloud-work" }, storage)).toBeNull();
    expect(readStudioLocalCanvasSeed({ ...route, remixSourceWorkId: "remix" }, storage)).toBeNull();
    expect(ensureInitialStudioProjectDocument(storage, {
      projectId: project.id, projectTitle: project.title, projectKind: project.kind,
      templateId: "different-template",
    }).id).toBe(document.id);
  });
  it("seeds four editable frames only for a new four-cut webtoon document", () => {
    const storage = new MemoryStorage();
    const { project, document } = createStudioProjectWithInitialDocument(storage, {
      title: "Four cut", kind: "webtoon", templateId: "webtoon-four-cut",
    });
    const seed = readStudioLocalCanvasSeed({
      projectId: project.id, documentId: document.id, workId: null, remixSourceWorkId: null,
    }, storage);
    expect(seed).not.toBeNull();
    if (!seed) return;
    const page = studioLocalCanvasSeedPage(seed, "page-a");
    expect(page.name).toBe(document.title);
    expect(page.elements).toHaveLength(4);
    for (const [index, frame] of page.elements.entries()) {
      expect(frame).toMatchObject({ id: `page-a-initial-frame-${index + 1}`, type: "frame" });
      if (frame.type !== "frame") throw new Error("expected an initial frame");
      expect(frame.x + frame.width).toBeLessThan(STUDIO_CANVAS_WIDTH);
      expect(frame.y + frame.height).toBeLessThan(seed.canvasH);
    }
  });
  it("rejects unavailable storage and does not borrow another task's template", () => {
    const route = { projectId: "test", documentId: "test", workId: null, remixSourceWorkId: null };
    expect(readStudioLocalCanvasSeed(route, null)).toBeNull();
    expect(readStudioLocalCanvasSeed(route, { getItem: () => { throw new Error("blocked"); }, setItem: () => undefined })).toBeNull();
    expect(studioCreationPreset("design", "webtoon-vertical").id).toBe("design-cover");
  });
  it("selects distinct layouts without changing document state", () => {
    const initial = createStudioWorkspaceDefaultState(null);
    const before = JSON.stringify(initial);
    const layouts = ["draw", "comic", "design"] as const;
    expect(layouts.map((task) => applyStudioTaskWorkspace(initial, studioTaskWorkspaceId(task, "simple")).activeWorkspaceId))
      .toEqual(["lineart", "pro-comic", "vector-design"]);
    expect(JSON.stringify(initial)).toBe(before);
    expect(studioTaskWorkspaceId(null, "simple")).toBeNull();
    expect(studioTaskWorkspaceId("3d", "simple")).toBeNull();
  });
  it("preserves custom layouts and edits to the current task profile", () => {
    const initial = createStudioWorkspaceDefaultState(null);
    const custom = { ...initial, activeWorkspaceId: "artist-layout", customWorkspaces: [
      { id: "artist-layout", name: "My layout", layout: initial.liveLayout },
    ] };
    expect(applyStudioTaskWorkspace(custom, "pro-comic")).toBe(custom);
    const drawing = applyStudioTaskWorkspace(initial, "lineart");
    expect(applyStudioTaskWorkspace(drawing, "lineart")).toBe(drawing);
  });
  it("projects task tools without mutating saved preferences", () => {
    const settings = defaultStudioAppSettings();
    const before = JSON.stringify(settings);
    expect(projectStudioTaskAppSettings(settings, "draw", "simple").toolbar.visibleIds).toContain("blend");
    expect(projectStudioTaskAppSettings(settings, "comic", "simple").toolbar.visibleIds).toContain("bubble");
    expect(projectStudioTaskAppSettings(settings, "design", "simple").toolbar.visibleIds).toContain("transform");
    expect(JSON.stringify(settings)).toBe(before);
  });
  it("keeps custom toolbars and exposes a compact quick drawing toolbar", () => {
    const settings = defaultStudioAppSettings();
    expect(projectStudioTaskAppSettings(settings, "draw", "focus").toolbar.visibleIds)
      .toEqual(["select", "pen", "eraser", "fill", "eyedropper", "zoom-fit"]);
    expect(projectStudioTaskAppSettings(settings, "design", "full")).toBe(settings);
    const custom = { ...settings, toolbar: { ...settings.toolbar, visibleIds: ["pen" as const] } };
    expect(projectStudioTaskAppSettings(custom, "design", "simple")).toBe(custom);
    expect(projectStudioTaskAppSettings(custom, "draw", "focus")).toBe(custom);
  });
  it("does not save recommended tools when an unrelated preference changes", () => {
    const stored = defaultStudioAppSettings();
    const presented = projectStudioTaskAppSettings(stored, "draw", "focus");
    const next = preserveStudioTaskToolbarPreference(stored, presented, {
      ...presented, general: { ...presented.general, densityMode: "full" },
    });
    expect(next.toolbar.visibleIds).toEqual(stored.toolbar.visibleIds);
    expect(next.general.densityMode).toBe("full");
    expect(projectStudioTaskAppSettings(next, "draw", "full")).toBe(next);
    const customized = { ...presented, toolbar: { ...presented.toolbar, visibleIds: ["pen" as const] } };
    expect(preserveStudioTaskToolbarPreference(stored, presented, customized)).toBe(customized);
  });
  it("distinguishes quick, standard and complete launch modes", () => {
    expect(readStudioLaunchDensity("?uiMode=focus")).toBe("focus");
    expect(readStudioLaunchDensity("?uiMode=simple")).toBe("focus");
    expect(readStudioLaunchDensity("?uiMode=basic")).toBe("simple");
    expect(readStudioLaunchDensity("?uiMode=standard")).toBe("simple");
    expect(readStudioLaunchDensity("?uiMode=full")).toBe("full");
    expect(readStudioLaunchDensity("?uiMode=studio")).toBe("full");
    expect(readStudioLaunchDensity("?uiMode=unknown")).toBeNull();
    expect(readStudioLaunchDensity("?uiMode=simple&uiMode=studio")).toBeNull();
    expect(readStudioLaunchPrimaryTool("?startTool=draw")).toBe("draw");
    expect(readStudioLaunchPrimaryTool("?startTool=select")).toBe("select");
    expect(readStudioLaunchPrimaryTool("?startTool=hand")).toBeNull();
    expect(readStudioLaunchPrimaryTool("?startTool=draw&startTool=select")).toBeNull();
  });
});
