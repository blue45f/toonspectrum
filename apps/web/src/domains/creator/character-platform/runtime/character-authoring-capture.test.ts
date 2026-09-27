import { Bone, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from "three";
import { describe, expect, it } from "vitest";

import { captureCharacterSemanticPasses } from "../../character-shaper/character-shaper-semantic-psd";
import { CharacterGroomThreeRuntime } from "../groom/character-groom-three-runtime";
import { addCharacterGroomGroup } from "../groom/character-groom-edit";
import { createEmptyCharacterGroomDocument } from "../groom/character-groom-document";
import { addCharacterSurfaceInkStroke, createEmptyCharacterSurfaceInkDocument } from "../surface-ink/character-surface-ink";
import { characterSurfaceObjectPath, characterSurfaceTopologyRevision, disposeCharacterSurfaceInkGroup, rebuildCharacterSurfaceInkGroup } from "../surface-ink/character-surface-ink-three-mesh";
import { CharacterGeometryStrokeThreeRuntime } from "./character-geometry-stroke-three-runtime";
import { executeCharacterAuthoringTask } from "./character-authoring-worker-runtime";

import type { VRM } from "@pixiv/three-vrm";
import type { WebGLRenderer } from "three";

describe("저작 파생 메시의 기존 PNG/PSD 장면 연결", () => {
  it("beauty에는 groom·입체선·펜선을 함께 포함하고 각 semantic mask에서는 다른 부위를 숨긴다", async () => {
    const scene = new Scene();
    const root = new Group(); root.name = "model"; scene.add(root);
    const head = new Bone(); head.name = "head-bone"; root.add(head);
    const sourceGeometry = new BufferGeometry();
    sourceGeometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    sourceGeometry.setIndex([0, 1, 2]);
    const source = new Mesh(sourceGeometry, new MeshStandardMaterial()); source.name = "Face"; root.add(source);
    const groom = new CharacterGroomThreeRuntime(head, () => undefined, async (task) => executeCharacterAuthoringTask(task));
    await groom.update(addCharacterGroomGroup(createEmptyCharacterGroomDocument("topology:test"), "헤어"), "topology:test");
    const geometry = new CharacterGeometryStrokeThreeRuntime(root, () => undefined, async (task) => executeCharacterAuthoringTask(task));
    await geometry.update({ version: 1, strokes: [{
      strokeId: "stroke:free", name: "자유선", visible: true, locked: false, status: "valid",
      style: { color: "#222222", baseWidth: 0.01, opacity: 1, taperStart: 0, taperEnd: 0, pressureWidth: 0, profile: "ribbon", fill: true, lineOnly: false },
      points: [
        { anchor: { kind: "free", position: [0, 0, 0] }, pressure: 0.5, width: 1, twist: 0 },
        { anchor: { kind: "free", position: [0, 1, 0] }, pressure: 0.5, width: 1, twist: 0 },
      ],
    }] });
    const meshAssetId = characterSurfaceObjectPath(source);
    const topologyRevision = characterSurfaceTopologyRevision("model", source);
    const anchor = { meshAssetId, topologyRevision, primitiveIndex: 0, triangleIndex: 0, barycentric: [1, 0, 0] as const,
      localNormal: [0, 0, 1] as const, localTangent: [1, 0, 0] as const, skinIndices: [0, 0, 0, 0] as const,
      skinWeights: [1, 0, 0, 0] as const, pressure: 0.5, width: 1 };
    const inkDocument = addCharacterSurfaceInkStroke(createEmptyCharacterSurfaceInkDocument(), "default", {
      strokeId: "ink", meshAssetId, topologyRevision, status: "valid", anchors: [anchor, { ...anchor, barycentric: [0, 1, 0] }],
      style: { color: "#111111", widthMode: "surface", baseWidth: 0.02, opacity: 1, taperStart: 0, taperEnd: 0,
        pressureWidth: 0, pressureOpacity: 0, smoothing: 0, surfaceOffset: 0.001, cap: "round", join: "round", frontFacesOnly: true },
    });
    const ink = rebuildCharacterSurfaceInkGroup(scene, inkDocument, root);
    const visibleByPass = new Map<string, string[]>();
    let pass = "";
    // GPU 픽셀 대신 실제 capture 분류·visibility scope를 관찰하는 명시적 CPU 테스트 seam이다.
    const result = await captureCharacterSemanticPasses({
      capture: { gl: {} as WebGLRenderer, scene, camera: new PerspectiveCamera() },
      vrm: { scene: root } as VRM, width: 2, height: 2,
      onProgress: (progress) => { if (progress.phase === "render") pass = progress.pass; },
    }, { captureRgba: () => {
      const names: string[] = [];
      scene.traverseVisible((node) => { if (node instanceof Mesh) names.push(node.name); });
      visibleByPass.set(pass, names);
      return new Uint8ClampedArray(16).fill(255);
    } });
    const beauty = visibleByPass.get("beauty") ?? [];
    const hair = beauty.find((name) => name.includes("groom"));
    const free = beauty.find((name) => name.includes("geometry-stroke:"));
    const line = beauty.find((name) => name.includes("surface-ink:"));
    expect(hair).toBeDefined(); expect(free).toBeDefined(); expect(line).toBeDefined();
    expect(visibleByPass.get("mask-hair")).toEqual([hair]);
    expect(visibleByPass.get("mask-accessory")).toEqual([free]);
    expect(visibleByPass.get("mask-face")).toEqual(["Face", line]);
    expect(result.passes.map((entry) => entry.id)).toEqual(expect.arrayContaining(["beauty", "mask-hair", "mask-accessory", "mask-face"]));
    expect(source.visible).toBe(true);
    disposeCharacterSurfaceInkGroup(ink); geometry.dispose(); groom.dispose();
  });
});
