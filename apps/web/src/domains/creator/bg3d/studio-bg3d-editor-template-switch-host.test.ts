import { describe, expect, it, vi } from "vitest";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { createPrimitive, type BgPrimitive } from "../studio-background-3d-primitives";
import { BG_SCENE_TEMPLATES, instantiateSceneTemplate } from "../studio-background-3d-scene-templates";
import { attachStudioBg3dEditorTemplateSwitchHost } from "./studio-bg3d-editor-template-switch-host";
import { createStudioBg3dHistorySnapshot, type StudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { commitStudioBg3dHistoryTransition, stepStudioBg3dCommandHistory, type StudioBg3dHistoryCommandRefs } from "./studio-bg3d-history-command-adapter";
import type { StudioBg3dPhysicsPhase } from "./studio-bg3d-physics-ui";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, normalizeStudioBg3dSceneDocument, type StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioBg3dCanonicalDocumentMutation, StudioBg3dCanonicalDocumentSnapshot } from "./useStudioBg3dCanonicalDocumentState";

// Match the real host: module exports are NOT copied into its state bag.
function createHost() {
  const live = { current: {
    revision: 0, primitives: [], customModels: [],
    document: normalizeStudioBg3dSceneDocument(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT),
  } as StudioBg3dCanonicalDocumentSnapshot };
  const history: StudioBg3dHistoryCommandRefs = {
    historyRef: { current: [] }, historyIndexRef: { current: 0 },
    historyCommandTimelineRef: { current: null },
  };
  let seed = 0;
  const host = {
    open: true, modelRenderer: {} as object | null, isRestoringScene: false,
    physicsPhaseRef: { current: "idle" as StudioBg3dPhysicsPhase },
    physicsRuntimeSourceRef: live,
    generateId: vi.fn(() => `template-test-${++seed}`),
    setSelectedIds: vi.fn<(ids: Set<string>) => void>(),
    setError: vi.fn<(error: string | null) => void>(),
    addSceneTemplate: (_templateId: string) => {},
    replaceCanonicalDocumentState: vi.fn((mutation: StudioBg3dCanonicalDocumentMutation) => {
      live.current = {
        revision: live.current.revision + 1,
        primitives: [...(mutation.primitives ?? live.current.primitives)],
        customModels: [...(mutation.customModels ?? live.current.customModels)],
        document: mutation.document ?? live.current.document,
      };
      return live.current;
    }),
    commitImmediateHistoryTransition: vi.fn((
      primitives: readonly BgPrimitive[], customModels: readonly BgCustomModelInstance[],
      document: StudioBg3dSceneDocument, before?: StudioBg3dHistorySnapshot,
    ) => {
      commitStudioBg3dHistoryTransition(history, {
        before: before ?? createStudioBg3dHistorySnapshot(live.current),
        after: createStudioBg3dHistorySnapshot({ primitives, customModels, document }),
      });
    }),
  };
  attachStudioBg3dEditorTemplateSwitchHost(host);
  return { host, live, history };
}

describe("BG3D template insertion through the actual command host", () => {
  it.each(BG_SCENE_TEMPLATES.map((template) => [template.id, template] as const))(
    "inserts %s using module dependencies instead of nonexistent host exports", (_id, template) => {
      const { host, live } = createHost();
      expect(() => host.addSceneTemplate(template.id)).not.toThrow();
      expect(live.current.primitives).toHaveLength(instantiateSceneTemplate(template, 0).length);
      expect(host.commitImmediateHistoryTransition).toHaveBeenCalledOnce();
      expect(host.replaceCanonicalDocumentState).toHaveBeenCalledOnce();
      expect(host.setSelectedIds).toHaveBeenLastCalledWith(new Set(live.current.primitives.map((item) => item.id)));
      expect(host.setError).toHaveBeenLastCalledWith(null);
    },
  );

  it("replaces the previous background, keeps independent props, and supports atomic undo/redo", () => {
    const { host, live, history } = createHost();
    const prop = createPrimitive("box", 0);
    host.replaceCanonicalDocumentState({ primitives: [prop] });
    host.addSceneTemplate(BG_SCENE_TEMPLATES[0].id);
    const first = createStudioBg3dHistorySnapshot(live.current);
    host.addSceneTemplate(BG_SCENE_TEMPLATES[1].id);
    const second = createStudioBg3dHistorySnapshot(live.current);
    expect(second.primitives).toHaveLength(1 + instantiateSceneTemplate(BG_SCENE_TEMPLATES[1], 0).length);
    expect(second.primitives).toContainEqual(prop);
    expect(second.primitives.slice(1).some((item) => first.primitives.some((old) => old.id === item.id))).toBe(false);
    expect(host.commitImmediateHistoryTransition).toHaveBeenCalledTimes(2);
    expect(stepStudioBg3dCommandHistory(history, "undo")?.state).toEqual(first);
    expect(stepStudioBg3dCommandHistory(history, "redo")?.state).toEqual(second);
  });

  it.each(["loading", "running", "paused", "complete", "baking"] as const)(
    "does not mutate while physics is %s", (phase) => {
      const { host, live } = createHost();
      host.physicsPhaseRef.current = phase;
      host.addSceneTemplate(BG_SCENE_TEMPLATES[0].id);
      expect(live.current.primitives).toEqual([]);
      expect(host.commitImmediateHistoryTransition).not.toHaveBeenCalled();
    },
  );

  it.each(["closed", "restoring", "renderer-unavailable"] as const)(
    "does not insert into an editor that is %s", (reason) => {
      const { host } = createHost();
      if (reason === "closed") host.open = false;
      if (reason === "restoring") host.isRestoringScene = true;
      if (reason === "renderer-unavailable") host.modelRenderer = null;
      host.addSceneTemplate(BG_SCENE_TEMPLATES[0].id);
      expect(host.replaceCanonicalDocumentState).not.toHaveBeenCalled();
      expect(host.commitImmediateHistoryTransition).not.toHaveBeenCalled();
    },
  );

  it("leaves the scene unchanged for an unknown template", () => {
    const { host } = createHost();
    expect(() => host.addSceneTemplate("missing-template")).not.toThrow();
    expect(host.replaceCanonicalDocumentState).not.toHaveBeenCalled();
  });

  it("rejects a background beyond the document node budget before history or state changes", () => {
    const { host, live } = createHost();
    live.current = { ...live.current, document: {
      ...live.current.document, budgets: { ...live.current.document.budgets,
        complexity: { ...live.current.document.budgets.complexity, maxNodes: 1 },
      },
    } };
    host.addSceneTemplate(BG_SCENE_TEMPLATES[0].id);
    expect(host.setError).toHaveBeenCalledWith(expect.stringContaining("최대 1개"));
    expect(host.replaceCanonicalDocumentState).not.toHaveBeenCalled();
    expect(host.commitImmediateHistoryTransition).not.toHaveBeenCalled();
  });

  it("preserves the old background when an independent object is parented to it", () => {
    const { host, live } = createHost();
    host.addSceneTemplate(BG_SCENE_TEMPLATES[0].id);
    const child = { ...createPrimitive("box", 0), parentId: live.current.primitives[0].id };
    host.replaceCanonicalDocumentState({ primitives: [...live.current.primitives, child] });
    const before = live.current;
    host.addSceneTemplate(BG_SCENE_TEMPLATES[1].id);
    expect(live.current).toBe(before);
    expect(host.commitImmediateHistoryTransition).toHaveBeenCalledOnce();
    expect(host.setError).toHaveBeenLastCalledWith(expect.stringContaining("외부 오브젝트"));
  });
});
