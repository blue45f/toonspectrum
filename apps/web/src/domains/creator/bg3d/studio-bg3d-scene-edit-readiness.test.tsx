// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { attachStudioBg3dEditorSceneOpsHost } from "./studio-bg3d-editor-scene-ops-host";
import { isStudioBg3dSceneEditReady } from "./studio-bg3d-scene-edit-readiness";
import { useStudioBg3dEditorRestoreEffects } from "./useStudioBg3dEditorRestoreEffects";

const runtime = vi.hoisted(() => ({ wait: vi.fn<() => Promise<void>>() }));
vi.mock("./studio-bg3d-editor-runtime-bindings", async () => {
  const react = await import("react");
  return {
    ...react,
    DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT: { camera: {}, attachments: [], budgets: { complexity: { maxNodes: 100 } } },
    STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES: 100,
    studioBg3dModalOperationCoordinator: { waitForSceneMutationLane: runtime.wait },
    disposeModelCache: vi.fn(),
    canonicalSceneDocument: () => null,
    parseBg3dSceneWithModelsFromDataUrl: () => null,
    createStudioBg3dHistorySnapshot: (value: unknown) => structuredClone(value),
    studioBg3dHistoryDocumentAtView: (document: object) => document,
    createPrimitive: (kind: string, index: number) => ({ id: `primitive-${index}`, kind, scale: [1, 1, 1] }),
    isStudioBg3dPhysicsTransientPhase: () => false,
    clonePrimitives: (value: unknown) => structuredClone(value),
    cloneBgCustomModelInstances: (value: unknown) => structuredClone(value),
    resolveDeviceQuality: () => ({}),
  };
});

afterEach(() => { cleanup(); vi.useRealTimers(); });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function useEditorFixture(renderer: object | null, session: object, open = true) {
  const [primitives, setPrimitives] = useState<object[]>([]);
  const [customModels, setCustomModels] = useState<object[]>([]);
  const [document, setSceneBaseDocument] = useState({ camera: {}, attachments: [], budgets: { complexity: { maxNodes: 100 } } });
  const [isRestoringScene, setIsRestoringScene] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [, setCanUndo] = useState(false);
  const [, setCanRedo] = useState(false);
  const [, setRefTick] = useState(0);
  const host = useRef<(Record<string, any> & { open: boolean; modelRenderer: object | null; isRestoringScene: boolean }) | null>(null);
  if (!host.current) {
    const ref = (current: unknown = null) => ({ current });
    host.current = {
      open, modelRenderer: renderer, isRestoringScene, initialScene: undefined, initialDataUrl: undefined,
      modalAssetSessionRef: ref(session), sceneRestoreAbortRef: ref(),
      physicsGenerationRef: ref(0), physicsAbortRef: ref(), physicsAnimationFrameRef: ref(),
      physicsSessionRef: ref(), latestPhysicsSamplesRef: ref([]), physicsPhaseRef: ref("idle"),
      historyRef: ref([]), historyIndexRef: ref(-1), modelRootCacheRef: ref(new Map()),
      modelLoadPendingRef: ref(new Map()), attachmentByStorageModelIdRef: ref(new Map()),
      storageModelIdByAttachmentIdRef: ref(new Map()), pendingInitialCameraRef: ref(),
      viewportApiRef: ref({ applyView: () => true, readView: () => ({}) }), viewportHostRef: ref(),
      physicsRuntimeSourceRef: ref(), captureInFlightRef: ref(false), cameraLensGestureBeforeViewRef: ref(),
      isBatchRenderingShots: false, applyingTemplateId: null,
      setPhysicsPhase: vi.fn(), setPhysicsProgress: vi.fn(), setPhysicsCurrentSeconds: vi.fn(),
      setPhysicsError: vi.fn(), setFailedCloneIds: vi.fn(), setReadyCloneIds: vi.fn(),
      setSceneRecoveryError: vi.fn(), setError: vi.fn(),
    };
  }
  const h = host.current;
  Object.assign(h, { open, modelRenderer: renderer, primitives, customModels, sceneBaseDocument: document,
    isRestoringScene, selectedIds, setPrimitives, setCustomModels, setSceneBaseDocument,
    setIsRestoringScene, setSelectedIds, setCanUndo, setCanRedo, setRefTick });
  h.modalAssetSessionRef.current = session;
  h.isModalAssetSessionCurrent = (candidate: object) => candidate === session;
  h.physicsRuntimeSourceRef.current = { primitives, customModels, document };
  attachStudioBg3dEditorSceneOpsHost(h);
  useStudioBg3dEditorRestoreEffects(h);
  return h;
}

describe("BG3D initial scene editing admission", () => {
  it("requires an open editor, a created renderer, and completed restoration", () => {
    const ready = { open: true, modelRenderer: {}, isRestoringScene: false };
    expect(isStudioBg3dSceneEditReady(ready)).toBe(true);
    expect(isStudioBg3dSceneEditReady({ ...ready, modelRenderer: null })).toBe(false);
    expect(isStudioBg3dSceneEditReady({ ...ready, isRestoringScene: true })).toBe(false);
    expect(isStudioBg3dSceneEditReady({ ...ready, open: false })).toBe(false);
  });

  it("blocks early insertion while initial restoration is pending, then preserves the first admitted edit", async () => {
    const lane = deferred();
    runtime.wait.mockReturnValue(lane.promise);
    const session = {};
    const view = renderHook(({ renderer }) => useEditorFixture(renderer, session), {
      initialProps: { renderer: null as object | null },
    });
    act(() => view.result.current.addPrimitive("box"));
    expect(view.result.current.primitives).toEqual([]);
    view.rerender({ renderer: {} });
    act(() => view.result.current.addPrimitive("box"));
    expect(view.result.current.primitives).toEqual([]);
    expect(isStudioBg3dSceneEditReady(view.result.current)).toBe(false);
    await act(async () => { lane.resolve(); await lane.promise; });
    expect(isStudioBg3dSceneEditReady(view.result.current)).toBe(true);
    act(() => view.result.current.addPrimitive("box"));
    expect(view.result.current.primitives).toMatchObject([{ id: "primitive-0" }]);
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.primitives).toMatchObject([{ id: "primitive-0" }]);
  });

  it("locks a renderer replacement until cache rebuilding ends and preserves admitted scene edits", async () => {
    runtime.wait.mockResolvedValue(undefined);
    const session = {};
    const view = renderHook(({ renderer }) => useEditorFixture(renderer, session), { initialProps: { renderer: {} } });
    await act(async () => { await Promise.resolve(); });
    act(() => view.result.current.addPrimitive("box"));
    const lane = deferred();
    runtime.wait.mockReturnValue(lane.promise);
    view.rerender({ renderer: {} });
    expect(isStudioBg3dSceneEditReady(view.result.current)).toBe(false);
    act(() => view.result.current.addPrimitive("box"));
    expect(view.result.current.primitives).toHaveLength(1);
    await act(async () => { lane.resolve(); await lane.promise; });
    expect(isStudioBg3dSceneEditReady(view.result.current)).toBe(true);
    expect(view.result.current.primitives).toMatchObject([{ id: "primitive-0" }]);
  });

  it("reopening starts a new initial restore instead of retaining an earlier session's editable state", async () => {
    runtime.wait.mockResolvedValue(undefined);
    const renderer = {};
    const view = renderHook(({ session, open }) => useEditorFixture(renderer, session, open), {
      initialProps: { session: {}, open: true },
    });
    await act(async () => { await Promise.resolve(); });
    act(() => view.result.current.addPrimitive("box"));
    view.rerender({ session: {}, open: false });
    expect(isStudioBg3dSceneEditReady(view.result.current)).toBe(false);
    const lane = deferred();
    runtime.wait.mockReturnValue(lane.promise);
    view.rerender({ session: {}, open: true });
    expect(isStudioBg3dSceneEditReady(view.result.current)).toBe(false);
    act(() => view.result.current.addPrimitive("box"));
    expect(view.result.current.primitives).toHaveLength(1);
    await act(async () => { lane.resolve(); await lane.promise; });
    expect(view.result.current.primitives).toEqual([]);
    expect(isStudioBg3dSceneEditReady(view.result.current)).toBe(true);
    act(() => view.result.current.addPrimitive("box"));
    expect(view.result.current.primitives).toHaveLength(1);
  });
});
