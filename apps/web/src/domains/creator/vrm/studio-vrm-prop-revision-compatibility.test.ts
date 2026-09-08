import { readFileSync } from "node:fs";

import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { resolvePropAttachment } from "./studio-vrm-prop-rig";
import {
  createPropInstance,
  inspectVrmPropsDocumentForProjection,
  parseVrmProps,
  propDefById,
  serializeVrmProps,
  VRM_PROPS,
} from "./studio-vrm-props";

import type { Mesh, Object3D } from "three";

const metrics: Parameters<typeof resolvePropAttachment>[2] = {
  avatarHeight: 1.65, hand: 0.075, leftHand: 0.075, rightHand: 0.075,
  head: 0.16, eyeDistance: 0.064, shoulder: 0.32, hip: 0.18,
  handSockets: {
    rightHand: { position: [0.021, 0.013, 0.009], rotationQuaternion: [0, 0, 0, 1], rotationDeg: [0, 0, 0], source: "measured" },
    leftHand: { position: [-0.021, 0.013, 0.009], rotationQuaternion: [0, 0, 0, 1], rotationDeg: [0, 0, 0], source: "measured" },
  },
  faceSocket: { position: [0, 0.06, 0.075], rotationQuaternion: [0, 0, 0, 1], rotationDeg: [0, 0, 0], source: "measured" },
  boneWorldPositions: {},
  sources: { hand: "measured", head: "measured", shoulder: "measured", hip: "measured", avatarHeight: "measured", eyeDistance: "measured" },
  missingBones: [],
};

const replacements = ["hanging_sign", "traffic_light", "mailbox", "bubble_tea", "ice_cream_cone", "fox_mask", "robot_pet"] as const;
// Contact coordinates of the original shipped geometry, before refined-v8.
const originalContacts = [
  { name: "ice_cream_cone", point: [0, -0.04, 0] },
  { name: "bubble_tea", point: [0, -0.03, 0] },
  { name: "fox_mask", point: [0, 0, 0.02] },
] as const;

function matrix(attachment: ReturnType<typeof resolvePropAttachment>): Matrix4 {
  const [x, y, z] = attachment.rotationDeg.map(value => value * Math.PI / 180);
  return new Matrix4().compose(
    new Vector3(...attachment.position),
    new Quaternion().setFromEuler(new Euler(x, y, z, "XYZ")),
    new Vector3().setScalar(attachment.scale),
  );
}

async function meshVertices(url: string, transform: Matrix4): Promise<number[][]> {
  const bytes = readFileSync(new URL(`../../../../public${url}`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, "");
  const vertices: number[][] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node: Object3D) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.getAttribute("position");
    for (let index = 0; index < Math.min(positions.count, 8); index += 1) {
      vertices.push(new Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld).applyMatrix4(transform).toArray());
    }
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
  });
  expect(vertices.length).toBeGreaterThan(0);
  return vertices;
}

describe("saved VRM prop geometry revisions", () => {
  it.each(originalContacts)("preserves $name contact in unversioned, V1 and rig-less V2 saved documents", ({ name, point }) => {
    const id = `blender_${name}`;
    const def = propDefById(id)!;
    for (const version of [undefined, 1, 2]) {
      const item = { uid: `saved-${id}`, propId: id, bone: def.defaultBone, position: point.map(value => -value), rotationDeg: [0, 0, 0], scale: 1, color: null };
      const saved = { ...(version === undefined ? {} : { version }), items: [item] };
      const before = structuredClone(saved);
      const restored = parseVrmProps(saved).items[0];
      const attachment = resolvePropAttachment(def, restored, metrics);
      const contact = new Vector3(...attachment.anchor.position).applyMatrix4(matrix(attachment));
      expect(contact.length(), `${name}: old hand/face contact must stay at the authored origin`).toBeLessThan(1e-8);
      expect(attachment.usesSmartRig).toBe(false);
      expect(saved).toEqual(before);
      expect(parseVrmProps(serializeVrmProps([restored])).items).toEqual([restored]);
    }
  });

  it.each(replacements)("keeps old %s bytes and mesh placement while selecting an explicit new revision", async name => {
    const legacyId = `blender_${name}`;
    const newId = `${legacyId}_v8`;
    const legacy = propDefById(legacyId)!;
    const item = parseVrmProps({ version: 1, items: [{ uid: `legacy-${name}`, propId: legacyId, bone: legacy.defaultBone, position: [0.03, 0.04, 0.05], rotationDeg: [10, 20, 30], scale: 0.9, color: null }] }).items[0];
    const transform = matrix(resolvePropAttachment(legacy, item, metrics));
    const originalUrl = `/assets/3d/${name}.glb`;
    expect(legacy.geometrySource.kind).toBe("gltf");
    if (legacy.geometrySource.kind !== "gltf") throw new Error("Expected the original GLB");
    expect(await meshVertices(legacy.geometrySource.url, transform)).toEqual(await meshVertices(originalUrl, transform));
    expect(legacy.geometrySource.url).toBe(originalUrl);
    expect(VRM_PROPS.some(def => def.id === legacyId)).toBe(false);
    const selectable = VRM_PROPS.find(def => def.id === newId);
    expect(selectable?.geometrySource).toEqual({ kind: "gltf", url: `/assets/3d/refined-v8/${name}.glb` });
    expect(selectable?.label).toContain("개선형");
    const created = createPropInstance(newId, `new-${name}`)!;
    expect(created?.propId).toBe(newId);
    const mixed = serializeVrmProps([item, created]);
    expect(parseVrmProps(mixed).items).toEqual([item, created]);
    expect(inspectVrmPropsDocumentForProjection(mixed).status).toBe("ready");
  });

  it.each(originalContacts)("retains $name smart-rig edits independently of newly selected v8 items", ({ name, point }) => {
    const id = `blender_${name}`;
    const legacy = createPropInstance(id, `smart-${id}`)!;
    legacy.rig!.deltaPosition = [0.01, -0.02, 0.03];
    legacy.rig!.deltaRotationDeg = [10, -20, 30];
    legacy.rig!.deltaScale = 1.1;
    const restored = parseVrmProps(serializeVrmProps([legacy])).items[0];
    const attachment = resolvePropAttachment(propDefById(id)!, restored, metrics);
    expect(new Vector3(...point).applyMatrix4(matrix(attachment)).distanceTo(new Vector3(...attachment.socketPosition))).toBeLessThan(1e-8);
    expect(restored).toEqual(legacy);
    expect(propDefById(`${id}_v8`)).toBeDefined();
  });
});
