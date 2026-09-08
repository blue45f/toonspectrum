import { Bone, BufferGeometry, Float32BufferAttribute, Group, InterleavedBuffer, InterleavedBufferAttribute, Mesh, Scene, Skeleton, SkinnedMesh } from "three";
import { describe, expect, it, vi } from "vitest";
import { characterSurfaceObjectPath, characterSurfaceTopologyRevision, disposeCharacterSurfaceInkGroup, rebuildCharacterSurfaceInkGroup, reconcileCharacterSurfaceInkTopology } from "./character-surface-ink-three-mesh";
import { createEmptyCharacterSurfaceInkDocument, addCharacterSurfaceInkStroke } from "./character-surface-ink";

function fixture() {
  const scene = new Scene(); const root = new Group(); root.name = "model"; scene.add(root);
  const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute([0,0,0, 1,0,0, 0,1,0], 3)); geometry.setIndex([0,1,2]);
  const mesh = new Mesh(geometry); mesh.name = "face"; root.add(mesh);
  const revision = characterSurfaceTopologyRevision("model-a", mesh);
  const anchor = { meshAssetId: characterSurfaceObjectPath(mesh), topologyRevision: revision, primitiveIndex: 0, triangleIndex: 0, barycentric: [1,0,0] as const, localNormal: [0,0,1] as const, localTangent: [1,0,0] as const, skinIndices: [0,0,0,0] as const, skinWeights: [1,0,0,0] as const, pressure: 0.5, width: 1 };
  const document = addCharacterSurfaceInkStroke(createEmptyCharacterSurfaceInkDocument(), "default", { strokeId: "ink", meshAssetId: anchor.meshAssetId, topologyRevision: revision, anchors: [anchor, { ...anchor, barycentric: [0,1,0] }], style: { color: "#111111", widthMode: "surface", baseWidth: 0.02, opacity: 1, taperStart: 0, taperEnd: 0, pressureWidth: 0, pressureOpacity: 0, smoothing: 0, surfaceOffset: 0.001, cap: "round", join: "round", frontFacesOnly: true }, status: "valid" });
  return { scene, root, mesh, geometry, revision, document };
}
describe("surface ink stable geometry identity", () => {
  it.each(["positions", "indices"] as const)("marks equal-count %s changes for reprojection without deleting the saved anchors", (kind) => {
    const f = fixture();
    if (kind === "positions") { f.geometry.attributes.position.setXYZ(0, 4, 5, 6); f.geometry.attributes.position.needsUpdate = true; }
    else { f.geometry.index!.setX(0, 2); f.geometry.index!.setX(2, 0); f.geometry.index!.needsUpdate = true; }
    expect(characterSurfaceTopologyRevision("model-a", f.mesh)).not.toBe(f.revision);
    const after = reconcileCharacterSurfaceInkTopology(f.document, "model-a", f.scene);
    expect(after.layers[0].strokes[0].status).toBe("needs-reprojection");
    expect(after.layers[0].strokes[0].anchors).toBe(f.document.layers[0].strokes[0].anchors);
  });
  it("keeps identical geometry clones and model transforms compatible", () => {
    const f = fixture(); f.mesh.geometry = f.geometry.clone();
    expect(characterSurfaceTopologyRevision("model-a", f.mesh)).toBe(f.revision);
    f.mesh.position.set(3, 2, 1); f.root.rotation.y = 0.7; f.scene.updateMatrixWorld(true);
    expect(characterSurfaceTopologyRevision("model-a", f.mesh)).toBe(f.revision);
    expect(reconcileCharacterSurfaceInkTopology(f.document, "model-a", f.scene)).toBe(f.document);
  });
  it("detects replacement attributes even when their initial versions and counts match", () => {
    const f = fixture(); f.geometry.setAttribute("position", new Float32BufferAttribute([1,0,0, 0,1,0, 0,0,0], 3));
    expect(characterSurfaceTopologyRevision("model-a", f.mesh)).not.toBe(f.revision);
  });
  it("normalizes interleaved storage and detects its standard shared-buffer update version", () => {
    const f = fixture(); const data = new InterleavedBuffer(new Float32Array([0,0,0,9, 1,0,0,9, 0,1,0,9]), 4);
    f.geometry.setAttribute("position", new InterleavedBufferAttribute(data, 3, 0));
    expect(characterSurfaceTopologyRevision("model-a", f.mesh)).toBe(f.revision);
    data.array[0] = 7; data.needsUpdate = true;
    expect(characterSurfaceTopologyRevision("model-a", f.mesh)).not.toBe(f.revision);
  });
});


describe("geometry revision lifecycle", () => {
  it("retains legacy anchors as needing reprojection instead of guessing their geometry", () => {
    const f = fixture(); const old = `${"model-a"}:${characterSurfaceObjectPath(f.mesh)}:3:3`;
    const stroke = f.document.layers[0].strokes[0];
    const legacy = { ...f.document, layers: [{ ...f.document.layers[0], strokes: [{ ...stroke, topologyRevision: old, anchors: stroke.anchors.map(anchor => ({ ...anchor, topologyRevision: old })) }] }] };
    const result = reconcileCharacterSurfaceInkTopology(legacy, "model-a", f.scene);
    expect(result.layers[0].strokes[0]).toEqual({ ...legacy.layers[0].strokes[0], status: "needs-reprojection" });
  });
  it("reuses a geometry digest until its standard update version changes", () => {
    const f = fixture(); const attribute = f.geometry.attributes.position;
    const read = vi.spyOn(attribute, "getX");
    for (let index = 0; index < 100; index++) expect(characterSurfaceTopologyRevision("model-a", f.mesh)).toBe(f.revision);
    expect(read).not.toHaveBeenCalled();
    attribute.needsUpdate = true;
    expect(characterSurfaceTopologyRevision("model-a", f.mesh)).toBe(f.revision);
    expect(read).toHaveBeenCalledTimes(3); read.mockRestore();
  });
  it("supports empty geometry without inventing a triangle identity", () => {
    const mesh = new Mesh(new BufferGeometry()); mesh.name = "empty";
    expect(characterSurfaceTopologyRevision("model-a", mesh)).toBe(characterSurfaceTopologyRevision("model-a", mesh));
  });
});

describe("surface ink transform ownership", () => {
  it.each([false, true])("tracks root and source transforms after creation (skinned=%s)", (skinned) => {
    const f = fixture();
    let source = f.mesh;
    if (skinned) {
      source = new SkinnedMesh(f.geometry);
      source.name = f.mesh.name;
      f.mesh.removeFromParent();
      f.root.add(source);
      const bone = new Bone();
      source.add(bone);
      (source as SkinnedMesh).bind(new Skeleton([bone]));
    }
    const group = rebuildCharacterSurfaceInkGroup(f.scene, f.document);
    const ink = group.children[0] as Mesh;
    expect(ink).toBeInstanceOf(skinned ? SkinnedMesh : Mesh);
    f.root.position.set(4, -2, 7);
    f.root.rotation.set(0.2, 0.7, -0.4);
    f.root.scale.set(1.5, 0.8, 2);
    source.position.set(-1, 0.5, 3);
    source.rotation.set(0.1, -0.2, 0.3);
    group.position.set(2, 3, 4);
    for (const offset of [0, 0.75]) {
      f.root.position.y += offset;
      f.scene.updateMatrixWorld(true);
      ink.matrixWorld.elements.forEach((value, index) => {
        expect(value).toBeCloseTo(source.matrixWorld.elements[index], 10);
      });
    }
    const dispose = vi.spyOn(ink.geometry, "dispose");
    disposeCharacterSurfaceInkGroup(group);
    expect(dispose).toHaveBeenCalledOnce();
    expect(group.parent).toBeNull();
    expect(source.parent).toBe(f.root);
  });
});
