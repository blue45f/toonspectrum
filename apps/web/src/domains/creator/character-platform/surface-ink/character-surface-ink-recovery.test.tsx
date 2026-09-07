// @vitest-environment jsdom
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
afterEach(cleanup);
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
});
