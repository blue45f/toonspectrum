// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addCharacterSurfaceInkStroke, createEmptyCharacterSurfaceInkDocument } from "./character-surface-ink";
import { CHARACTER_SURFACE_INK_SQLITE_NAMESPACE } from "./character-surface-ink-storage";
import { CHARACTER_SURFACE_INK_GROUP_NAME, characterSurfaceObjectPath, characterSurfaceTopologyRevision } from "./character-surface-ink-three-mesh";
import { useCharacterSurfaceInkRuntime } from "./use-character-surface-ink-runtime";

import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";
import type { CharacterSurfaceInkDocument } from "./character-surface-ink";

const db = vi.hoisted(() => ({ rows: new Map<string, string>(), writes: [] as { key: string; value: string }[] }));
vi.mock("../../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({ asAsyncKeyValueStore: (namespace: string) => ({
    get: async (key: string) => db.rows.get(`${namespace}:${key}`) ?? null,
    set: async (key: string, value: string) => { db.rows.set(`${namespace}:${key}`, value); db.writes.push({ key, value }); },
  }) }),
}));
beforeEach(() => { db.rows.clear(); db.writes.length = 0; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const read = () => JSON.parse(db.rows.get(`${CHARACTER_SURFACE_INK_SQLITE_NAMESPACE}:model-a`)!) as CharacterSurfaceInkDocument;
const status = (document: CharacterSurfaceInkDocument) => document.layers[0]?.strokes[0]?.status;

function fixture() {
  const scene = new Scene();
  const root = new Group(); root.name = "character";
  const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial()); mesh.name = "face";
  root.add(mesh); scene.add(root);
  const id = characterSurfaceObjectPath(mesh);
  const revision = characterSurfaceTopologyRevision("model-a", mesh);
  const anchor = { meshAssetId: id, topologyRevision: revision, primitiveIndex: 0, triangleIndex: 0, barycentric: [1, 0, 0] as const, localNormal: [0, 0, 1] as const, localTangent: [1, 0, 0] as const, skinIndices: [0, 0, 0, 0] as const, skinWeights: [1, 0, 0, 0] as const, pressure: 0.5, width: 1 };
  const document = addCharacterSurfaceInkStroke(createEmptyCharacterSurfaceInkDocument(), "default", {
    strokeId: "stored-ink", meshAssetId: id, topologyRevision: revision, anchors: [anchor, { ...anchor, barycentric: [0, 1, 0] }], status: "valid",
    style: { color: "#171717", widthMode: "surface", baseWidth: 0.008, opacity: 1, taperStart: 0, taperEnd: 0, pressureWidth: 0, pressureOpacity: 0, smoothing: 0.35, surfaceOffset: 0.0008, cap: "round", join: "round", frontFacesOnly: true },
  });
  db.rows.set(`${CHARACTER_SURFACE_INK_SQLITE_NAMESPACE}:model-a`, JSON.stringify(document));
  const h = { status: "ready", activeModelId: "model-a", vrm: { scene: root }, captureSceneGeneration: 1, captureRef: { current: { scene, camera: new PerspectiveCamera(), gl: { domElement: window.document.createElement("canvas") } } } } as unknown as StudioVrmPoserHost;
  const start = () => renderHook(({ revisionKey }) => useCharacterSurfaceInkRuntime({ h, modelKey: "model-a", revisionKey }), { initialProps: { revisionKey: "r1" } });
  return { h, scene, root, mesh, document, start, rendered: () => scene.getObjectByName(CHARACTER_SURFACE_INK_GROUP_NAME)?.children.length ?? 0 };
}

describe("surface ink topology on real mesh recovery", () => {
  async function drawable() {
    const f = fixture();
    const capture = f.h.captureRef.current!;
    const camera = capture.camera as PerspectiveCamera;
    camera.position.z = 2;
    camera.updateMatrixWorld();
    f.scene.updateMatrixWorld(true);
    const canvas = capture.gl.domElement;
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);
    const hook = f.start();
    await waitFor(() => expect(hook.result.current.strokeCount).toBe(1));
    act(() => hook.result.current.setActive(true));
    const draw = () => act(() => {
      for (const [type, x] of [["pointerdown", 45], ["pointermove", 55], ["pointerup", 55]] as const) {
        const event = new MouseEvent(type, { button: 0, clientX: x, clientY: 50, bubbles: true, cancelable: true });
        Object.defineProperties(event, { pointerId: { value: 1 }, pressure: { value: 0.5 } });
        canvas.dispatchEvent(event);
      }
    });
    return { ...f, hook, draw };
  }

  it("uses secure random bytes when randomUUID is unavailable and preserves both strokes through history", async () => {
    const f = await drawable();
    let sequence = 0;
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(++sequence));
    vi.stubGlobal("crypto", { getRandomValues });
    f.draw();
    f.draw();
    expect(getRandomValues).toHaveBeenCalledTimes(2);
    expect(f.hook.result.current.document.layers[0]?.strokes.map((stroke) => stroke.strokeId)).toEqual([
      "stored-ink", `ink:${"01".repeat(16)}`, `ink:${"02".repeat(16)}`,
    ]);
    act(() => f.hook.result.current.undo());
    expect(f.hook.result.current.strokeCount).toBe(2);
    act(() => f.hook.result.current.redo());
    expect(f.hook.result.current.strokeCount).toBe(3);
    await waitFor(() => expect(JSON.stringify(read())).toBe(JSON.stringify(f.hook.result.current.document)));
  });

  it("reports unavailable secure randomness without changing existing ink or history", async () => {
    const f = await drawable();
    vi.stubGlobal("crypto", undefined);
    f.draw();
    expect(f.hook.result.current.document).toEqual(f.document);
    expect(f.hook.result.current.canUndo).toBe(false);
    expect(f.hook.result.current.notice).toContain("식별자를 만들 수 없습니다");
    expect(read()).toEqual(f.document);
  });

  it("reopens the same mesh with the exact saved valid stroke and no new Undo entry", async () => {
    const f = fixture(); const hook = f.start();
    await waitFor(() => expect(hook.result.current.strokeCount).toBe(1));
    expect(hook.result.current.document).toEqual(f.document);
    expect(f.rendered()).toBe(1);
    expect(hook.result.current.canUndo).toBe(false);
    await waitFor(() => expect(read()).toEqual(f.document));
    expect(db.writes.every(({ value }) => value === JSON.stringify(f.document))).toBe(true);
  });

  it("preserves a pending read until the actual current model is attached and ready", async () => {
    const f = fixture(); f.h.status = "loading"; f.root.removeFromParent();
    const hook = f.start();
    await waitFor(() => expect(hook.result.current.strokeCount).toBe(1));
    expect(hook.result.current.document).toEqual(f.document);
    expect(f.rendered()).toBe(0);
    f.h.status = "ready"; hook.rerender({ revisionKey: "r1" });
    expect(hook.result.current.document).toEqual(f.document);
    f.scene.add(f.root); f.h.captureSceneGeneration = 2;
    hook.rerender({ revisionKey: "r1" });
    await waitFor(() => expect(f.rendered()).toBe(1));
    expect(hook.result.current.document).toEqual(f.document);
  });

  it("preserves changed topology as recoverable data and omits an invalid ribbon", async () => {
    const f = fixture(); const hook = f.start();
    await waitFor(() => expect(hook.result.current.strokeCount).toBe(1));
    f.mesh.geometry = new PlaneGeometry(1, 1, 2, 2);
    hook.rerender({ revisionKey: "r2" });
    await waitFor(() => expect(status(hook.result.current.document)).toBe("needs-reprojection"));
    expect(f.rendered()).toBe(0);
    expect(hook.result.current.document.layers[0]?.strokes[0]?.anchors).toEqual(f.document.layers[0]?.strokes[0]?.anchors);
    await waitFor(() => expect(status(read())).toBe("needs-reprojection"));
  });

  it("marks a removed mesh only after the ready model's scene is confirmed", async () => {
    const f = fixture(); f.mesh.removeFromParent(); f.h.status = "loading";
    const hook = f.start(); await waitFor(() => expect(hook.result.current.strokeCount).toBe(1));
    expect(status(hook.result.current.document)).toBe("valid");
    f.h.status = "ready"; hook.rerender({ revisionKey: "r1" });
    await waitFor(() => expect(status(hook.result.current.document)).toBe("needs-reprojection"));
    expect(f.rendered()).toBe(0);
    expect(hook.result.current.strokeCount).toBe(1);
  });

  it("validates imported ink against each live mesh instead of its model key", async () => {
    const f = fixture(); const hook = f.start();
    await waitFor(() => expect(hook.result.current.strokeCount).toBe(1));
    act(() => { hook.result.current.clear(); });
    act(() => { expect(hook.result.current.importJson(JSON.stringify(f.document))).toBe(true); });
    await waitFor(() => expect(hook.result.current.document).toEqual(f.document));
    expect(f.rendered()).toBe(1);
    expect(hook.result.current.canUndo).toBe(true);
  });

  it("repairs an older false mismatch without changing the stored anchors", async () => {
    const f = fixture();
    const old = { ...f.document, layers: f.document.layers.map((layer) => ({ ...layer, strokes: layer.strokes.map((stroke) => ({ ...stroke, status: "needs-reprojection" as const })) })) };
    db.rows.set(`${CHARACTER_SURFACE_INK_SQLITE_NAMESPACE}:model-a`, JSON.stringify(old));
    const hook = f.start();
    await waitFor(() => expect(hook.result.current.document).toEqual(f.document));
    await waitFor(() => expect(read()).toEqual(f.document));
    expect(f.rendered()).toBe(1);
    expect(hook.result.current.canUndo).toBe(false);
  });

  it("retains a confirmed mismatch and recovers only when its matching mesh returns", async () => {
    const f = fixture(); const originalGeometry = f.mesh.geometry;
    f.mesh.geometry = new PlaneGeometry(1, 1, 2, 2);
    const hook = f.start();
    await waitFor(() => expect(status(hook.result.current.document)).toBe("needs-reprojection"));
    expect(f.rendered()).toBe(0);
    const mismatched = hook.result.current.document;
    hook.rerender({ revisionKey: "pose-only" });
    expect(hook.result.current.document).toBe(mismatched);
    f.mesh.geometry = originalGeometry; f.h.captureSceneGeneration = 2;
    hook.rerender({ revisionKey: "pose-only" });
    await waitFor(() => expect(hook.result.current.document).toEqual(f.document));
    expect(f.rendered()).toBe(1);
  });

  it("restores when R3F attaches the ready model later without another host generation", async () => {
    const f = fixture(); f.root.removeFromParent();
    const hook = f.start();
    await waitFor(() => expect(hook.result.current.strokeCount).toBe(1));
    expect(f.rendered()).toBe(0);
    act(() => { f.scene.add(f.root); });
    expect(f.rendered()).toBe(1);
    expect(hook.result.current.document).toEqual(f.document);
    expect(hook.result.current.canUndo).toBe(false);
    act(() => { f.root.removeFromParent(); });
    expect(f.rendered()).toBe(0);
    act(() => { f.scene.add(f.root); });
    expect(f.rendered()).toBe(1);
  });

  it("does not rebuild into a foreign scene or after its effect is disposed", async () => {
    const f = fixture(); f.root.removeFromParent(); const otherScene = new Scene();
    const hook = f.start();
    await waitFor(() => expect(hook.result.current.strokeCount).toBe(1));
    act(() => { otherScene.add(f.root); });
    expect(f.rendered()).toBe(0);
    expect(hook.result.current.document).toEqual(f.document);
    hook.unmount();
    act(() => { f.scene.add(f.root); });
    expect(f.rendered()).toBe(0);
  });

  it("keeps one ribbon owner across StrictMode, revision changes and scene replacement", async () => {
    const f = fixture();
    const hook = renderHook(({ revisionKey }) => useCharacterSurfaceInkRuntime({ h: f.h, modelKey: "model-a", revisionKey }), { initialProps: { revisionKey: "r1" }, wrapper: StrictMode });
    await waitFor(() => expect(f.rendered()).toBe(1));
    const oldGroup = f.scene.getObjectByName(CHARACTER_SURFACE_INK_GROUP_NAME)!;
    hook.rerender({ revisionKey: "r2" });
    expect(oldGroup.parent).toBeNull();
    expect(f.scene.children.filter((child) => child.name === CHARACTER_SURFACE_INK_GROUP_NAME)).toHaveLength(1);
    const nextScene = new Scene();
    f.h.captureRef.current!.scene = nextScene;
    f.h.captureSceneGeneration = 2;
    hook.rerender({ revisionKey: "r2" });
    expect(f.rendered()).toBe(0);
    act(() => { nextScene.add(f.root); });
    expect(nextScene.getObjectByName(CHARACTER_SURFACE_INK_GROUP_NAME)?.children).toHaveLength(1);
    hook.unmount();
    expect(nextScene.getObjectByName(CHARACTER_SURFACE_INK_GROUP_NAME)).toBeUndefined();
    act(() => { f.scene.add(f.root); });
    expect(f.rendered()).toBe(0);
  });

  it("requests a demand-rendered frame after restore, ink history changes and cleanup", async () => {
    const f = fixture();
    const presentedRibbonCounts: number[] = [];
    f.h.texturePaintInvalidateRef = { current: () => presentedRibbonCounts.push(f.rendered()) };
    const hook = f.start();
    await waitFor(() => expect(hook.result.current.strokeCount).toBe(1));
    expect(presentedRibbonCounts.at(-1)).toBe(1);
    act(() => { hook.result.current.clear(); });
    expect(presentedRibbonCounts.at(-1)).toBe(0);
    act(() => { hook.result.current.undo(); });
    expect(presentedRibbonCounts.at(-1)).toBe(1);
    act(() => { hook.result.current.redo(); });
    expect(presentedRibbonCounts.at(-1)).toBe(0);
    act(() => { hook.result.current.undo(); });
    hook.unmount();
    expect(presentedRibbonCounts.at(-1)).toBe(0);
  });
});
