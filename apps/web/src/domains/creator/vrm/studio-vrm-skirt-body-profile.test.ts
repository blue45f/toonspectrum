import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { measureStudioVrmSkirtBodyProfile, readStudioVrmSkirtBodyProfileSignature } from "./studio-vrm-skirt-body-profile";

function fixture() {
  const scene = new THREE.Group();
  const left = new THREE.Bone(); left.position.x = 0.2;
  const right = new THREE.Bone(); right.position.x = -0.2;
  scene.add(left, right);
  const position: number[] = [], indices: number[] = [], weights: number[] = [];
  for (const [side, radius] of [[0, 0.09], [1, 0.055]]) {
    for (const height of [0.2, 0.4, 0.6, 0.8]) for (let ring = 0; ring < 24; ring += 1) {
      const angle = ring / 24 * Math.PI * 2;
      position.push((side === 0 ? 0.2 : -0.2) + radius * Math.cos(angle), height, radius * Math.sin(angle));
      indices.push(side, 0, 0, 0); weights.push(255, 0, 0, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new THREE.Uint8BufferAttribute(weights, 4, true));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  scene.add(mesh); scene.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([left, right]));
  const inputs = [
    { id: "leftThigh", bone: left, head: [0.2, 0, 0] as const, tail: [0.2, 1, 0] as const, fallbackRadius: 0.025 },
    { id: "rightThigh", bone: right, head: [-0.2, 0, 0] as const, tail: [-0.2, 1, 0] as const, fallbackRadius: 0.025 },
  ];
  return { scene, mesh, inputs };
}

describe("skirt body collision envelope", () => {
  it("does not spend the body sample budget on large face meshes sharing the skeleton", () => {
    const { scene, mesh, inputs } = fixture();
    scene.remove(mesh);
    const head = new THREE.Bone(); scene.add(head);
    const count = 48_000;
    const face = new THREE.BufferGeometry();
    face.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    const skinIndices = new Uint16Array(count * 4);
    const skinWeights = new Float32Array(count * 4);
    for (let vertex = 0; vertex < count; vertex += 1) {
      skinIndices[vertex * 4] = 2; skinWeights[vertex * 4] = 1;
    }
    face.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
    face.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
    for (let index = 0; index < 4; index += 1) {
      const part = new THREE.SkinnedMesh(face, mesh.material);
      scene.add(part); scene.updateMatrixWorld(true);
      part.bind(new THREE.Skeleton([...inputs.map((input) => input.bone), head]));
    }
    scene.add(mesh);
    const profile = measureStudioVrmSkirtBodyProfile(scene, inputs);
    expect(profile.inspectedVertices).toBe(mesh.geometry.getAttribute("position").count);
    expect(profile.capsules.leftThigh).toMatchObject({ source: "skinned-surface-envelope", sampleCount: 96 });
    expect(profile.capsules.rightThigh.radius).toBeCloseTo(0.058, 6);
  });

  it("measures asymmetric skinned surfaces independently in model space", () => {
    const { scene, inputs } = fixture();
    const original = measureStudioVrmSkirtBodyProfile(scene, inputs);
    expect(original.capsules.leftThigh).toMatchObject({ source: "skinned-surface-envelope", sampleCount: 96 });
    expect(original.capsules.leftThigh.radius).toBeCloseTo(0.093, 6);
    expect(original.capsules.rightThigh.radius).toBeCloseTo(0.058, 6);
    scene.position.set(4, -3, 2); scene.rotation.set(0.4, 0.7, -0.2); scene.scale.set(2, 3, 4);
    const transformed = measureStudioVrmSkirtBodyProfile(scene, inputs);
    expect(transformed.capsules.leftThigh.radius).toBeCloseTo(original.capsules.leftThigh.radius, 6);
    expect(transformed.capsules.rightThigh.radius).toBeCloseTo(original.capsules.rightThigh.radius, 6);
  });

  it("follows an active body morph and all weighted bones without changing imported arrays", () => {
    const { scene, mesh, inputs } = fixture();
    const position = mesh.geometry.getAttribute("position");
    const before = Array.from(position.array);
    const morph = new Float32Array(position.count * 3);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const center = vertex < 96 ? 0.2 : -0.2;
      morph[vertex * 3] = (position.getX(vertex) - center) * 0.5;
      morph[vertex * 3 + 2] = position.getZ(vertex) * 0.5;
    }
    mesh.geometry.morphTargetsRelative = true;
    mesh.geometry.morphAttributes.position = [new THREE.BufferAttribute(morph, 3)];
    mesh.updateMorphTargets(); mesh.morphTargetInfluences![0] = 1;
    const profile = measureStudioVrmSkirtBodyProfile(scene, inputs);
    expect(profile.capsules.leftThigh.radius).toBeCloseTo(0.138, 6);
    expect(profile.capsules.rightThigh.radius).toBeCloseTo(0.0855, 6);
    expect(Array.from(position.array)).toEqual(before);
  });

  it("excludes an already equipped wardrobe and records an explicit fallback", () => {
    const { scene, mesh, inputs } = fixture();
    const attachment = new THREE.Group(); attachment.name = "wardrobe:bottom:longskirt";
    scene.add(attachment); attachment.add(mesh);
    const profile = measureStudioVrmSkirtBodyProfile(scene, inputs);
    expect(profile.inspectedVertices).toBe(0);
    expect(profile.capsules.leftThigh).toEqual({ radius: 0.025, source: "skeleton-fallback", sampleCount: 0 });
  });

  it("excludes hidden imported clothes and invalidates the visible-shape signature", () => {
    const { scene, mesh, inputs } = fixture();
    const visible = readStudioVrmSkirtBodyProfileSignature(scene, inputs.map((input) => input.bone));
    const parent = new THREE.Group(); scene.add(parent); parent.add(mesh);
    parent.visible = false;
    const hidden = readStudioVrmSkirtBodyProfileSignature(scene, inputs.map((input) => input.bone));
    expect(hidden).not.toBe(visible);
    expect(measureStudioVrmSkirtBodyProfile(scene, inputs).capsules.leftThigh.source).toBe("skeleton-fallback");
    parent.visible = true;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, inputs.map((input) => input.bone))).toBe(visible);
    const position = mesh.geometry.getAttribute("position");
    const morph = new Float32Array(position.count * 3); morph[0] = 0.02;
    mesh.geometry.morphTargetsRelative = true;
    mesh.geometry.morphAttributes.position = [new THREE.BufferAttribute(morph, 3)];
    mesh.updateMorphTargets();
    const beforeMorph = readStudioVrmSkirtBodyProfileSignature(scene, inputs.map((input) => input.bone));
    mesh.morphTargetInfluences![0] = 0.5;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, inputs.map((input) => input.bone))).not.toBe(beforeMorph);
  });

  it("rejects malformed vertices and never turns a singular scene transform into measured success", () => {
    const { scene, mesh, inputs } = fixture();
    const weights = mesh.geometry.getAttribute("skinWeight");
    for (let vertex = 0; vertex < weights.count; vertex += 1) weights.setX(vertex, 0);
    expect(measureStudioVrmSkirtBodyProfile(scene, inputs).capsules.leftThigh.source).toBe("skeleton-fallback");
    scene.scale.x = 0;
    expect(measureStudioVrmSkirtBodyProfile(scene, inputs).inspectedVertices).toBe(0);
  });
});


describe("lower-body profile shape dependencies", () => {
  it("ignores animated face-only deltas on a mixed skinned mesh and reuses bounded dependency scans", () => {
    const { scene, mesh, inputs } = fixture();
    const head = new THREE.Bone(); scene.add(head);
    const geometry = mesh.geometry;
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([...geometry.getAttribute("position").array, 0, 1.4, 0], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([...geometry.getAttribute("skinIndex").array, 2, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Uint8BufferAttribute([...geometry.getAttribute("skinWeight").array, 255, 0, 0, 0], 4, true));
    scene.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([...inputs.map((input) => input.bone), head]));
    const position = geometry.getAttribute("position");
    const blink = new Float32Array(position.count * 3); blink[blink.length - 2] = 0.03;
    const body = new Float32Array(blink.length); body[0] = 0.02;
    geometry.morphTargetsRelative = true;
    geometry.morphAttributes.position = [new THREE.BufferAttribute(blink, 3), new THREE.BufferAttribute(body, 3)];
    mesh.updateMorphTargets();
    const bones = inputs.map((input) => input.bone);
    const before = readStudioVrmSkirtBodyProfileSignature(scene, bones);
    const weightsRead = vi.spyOn(geometry.getAttribute("skinWeight"), "getComponent");
    const deltaRead = vi.spyOn(geometry.morphAttributes.position[0], "getComponent");
    for (const influence of [0.25, 0.5, 0.75, 1, 0]) {
      mesh.morphTargetInfluences![0] = influence;
      expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).toBe(before);
    }
    expect(weightsRead).not.toHaveBeenCalled();
    expect(deltaRead).not.toHaveBeenCalled();
    mesh.morphTargetInfluences![0] = Number.NaN;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).not.toBe(before);
    mesh.morphTargetInfluences![0] = 0;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).toBe(before);
    mesh.morphTargetInfluences![1] = 0.5;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).not.toBe(before);
    weightsRead.mockRestore(); deltaRead.mockRestore();
  });

  it("resolves dominant lower-body weights per mesh skeleton even when geometry is shared", () => {
    const { scene, mesh, inputs } = fixture();
    const head = new THREE.Bone(), hair = new THREE.Bone(); scene.add(head, hair);
    const face = new THREE.SkinnedMesh(mesh.geometry, new THREE.MeshBasicMaterial()); scene.add(face);
    scene.updateMatrixWorld(true);
    face.bind(new THREE.Skeleton([head, hair, ...inputs.map((input) => input.bone)]));
    const bones = inputs.map((input) => input.bone);
    const before = readStudioVrmSkirtBodyProfileSignature(scene, bones);
    face.visible = false;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).toBe(before);
    face.visible = true;
    face.morphTargetInfluences = [0.75];
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).toBe(before);
    face.bind(new THREE.Skeleton([...bones, head, hair]));
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).not.toBe(before);
  });

  it("invalidates same-version attribute replacement, versioned weights and morph deltas", () => {
    const { scene, mesh, inputs } = fixture();
    const bones = inputs.map((input) => input.bone);
    const first = readStudioVrmSkirtBodyProfileSignature(scene, bones);
    const replacement = mesh.geometry.getAttribute("position").clone();
    replacement.setX(0, replacement.getX(0) + 0.02);
    mesh.geometry.setAttribute("position", replacement);
    const second = readStudioVrmSkirtBodyProfileSignature(scene, bones);
    expect(second).not.toBe(first);
    const zero = new THREE.Float32BufferAttribute(new Float32Array(replacement.count * 3), 3);
    mesh.geometry.morphTargetsRelative = true;
    mesh.geometry.morphAttributes.position = [zero]; mesh.updateMorphTargets();
    const beforeMorphEdit = readStudioVrmSkirtBodyProfileSignature(scene, bones);
    mesh.morphTargetInfluences![0] = 0.5;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).toBe(beforeMorphEdit);
    zero.setZ(0, 0.04); zero.needsUpdate = true;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).not.toBe(beforeMorphEdit);
    const weights = mesh.geometry.getAttribute("skinWeight");
    for (let vertex = 0; vertex < weights.count; vertex += 1) weights.setX(vertex, 0);
    weights.needsUpdate = true;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).toBe("[]");
  });

  it("compares absolute morph positions to rest positions and handles interleaved version updates", () => {
    const { scene, mesh, inputs } = fixture();
    const bones = inputs.map((input) => input.bone);
    const position = mesh.geometry.getAttribute("position");
    const packed = new Float32Array(position.count * 4);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      packed.set([position.getX(vertex), position.getY(vertex), position.getZ(vertex)], vertex * 4);
    }
    const data = new THREE.InterleavedBuffer(packed, 4);
    mesh.geometry.setAttribute("position", new THREE.InterleavedBufferAttribute(data, 3, 0));
    mesh.geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(position.array), 3)];
    mesh.geometry.morphTargetsRelative = false; mesh.updateMorphTargets();
    const before = readStudioVrmSkirtBodyProfileSignature(scene, bones);
    mesh.morphTargetInfluences![0] = 1;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).toBe(before);
    packed[0] += 0.03; data.needsUpdate = true;
    const changed = readStudioVrmSkirtBodyProfileSignature(scene, bones);
    expect(changed).not.toBe(before);
    mesh.morphTargetInfluences![0] = 0;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).not.toBe(changed);
  });

  it("conservatively retains unscanned morph influences when the preparation budget is exhausted", () => {
    const { scene, mesh, inputs } = fixture();
    const count = 12_000;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Uint8Array(count * 4);
    for (let vertex = 0; vertex < count; vertex += 1) weights[vertex * 4] = 255;
    geometry.setAttribute("skinWeight", new THREE.Uint8BufferAttribute(weights, 4, true));
    geometry.morphTargetsRelative = true;
    const zeroMorph = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3);
    geometry.morphAttributes.position = Array.from({ length: 41 }, () => zeroMorph);
    mesh.geometry = geometry; mesh.updateMorphTargets();
    const bones = inputs.map((input) => input.bone);
    const before = readStudioVrmSkirtBodyProfileSignature(scene, bones);
    mesh.morphTargetInfluences![0] = 1;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).toBe(before);
    mesh.morphTargetInfluences![40] = 0.5;
    expect(readStudioVrmSkirtBodyProfileSignature(scene, bones)).not.toBe(before);
  });
});
