import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { resolvePropAttachment } from "./studio-vrm-prop-rig";
import { createPropInstance, propDefById } from "./studio-vrm-props";

const metrics: Parameters<typeof resolvePropAttachment>[2] = {
  avatarHeight: 1.65,
  hand: 0.075,
  leftHand: 0.075,
  rightHand: 0.075,
  head: 0.16,
  eyeDistance: 0.064,
  shoulder: 0.32,
  hip: 0.18,
  handSockets: {
    rightHand: { position: [0.021, 0.013, 0.009], rotationQuaternion: [0, 0, 0, 1], rotationDeg: [0, 0, 0], source: "measured" },
    leftHand: { position: [-0.021, 0.013, 0.009], rotationQuaternion: [0, 0, 0, 1], rotationDeg: [0, 0, 0], source: "measured" },
  },
  faceSocket: { position: [0, 0.06, 0.075], rotationQuaternion: [0, 0, 0, 1], rotationDeg: [0, 0, 0], source: "measured" },
  boneWorldPositions: {},
  sources: { hand: "measured", head: "measured", shoulder: "measured", hip: "measured", avatarHeight: "measured", eyeDistance: "measured" },
  missingBones: [],
};

const profiles = [
  { id: "blender_ice_cream_cone_v8", point: [0, 0.085, 0], radius: 0.021 },
  { id: "blender_bubble_tea_v8", point: [0, 0.08, 0], radius: 0.03 },
  { id: "blender_fox_mask_v8", point: [0, 0.04, 0.06014], radius: undefined },
] as const;

describe("refined GLB attachment profiles", () => {
  it.each(profiles)("uses the measured raw GLTF contact point for $id", ({ id, point, radius }) => {
    const definition = propDefById(id);
    expect(definition).toBeDefined();
    const anchor = definition!.anchors.find((entry) => entry.role === "primary" || entry.role === "surface");
    expect(anchor?.position).toEqual(point);
    expect(anchor?.gripRadius).toBe(radius);
    expect(definition!.grip?.radius).toBe(radius);
  });

  it.each(profiles)("maps the actual mesh contact point onto the avatar socket for $id", ({ id, point }) => {
    const definition = propDefById(id)!;
    const instance = createPropInstance(id, `refined-test-${id}`)!;
    const resolved = resolvePropAttachment(definition, instance, metrics);
    expect(resolved.usesSmartRig).toBe(true);
    const radians = resolved.rotationDeg.map((value) => value * Math.PI / 180);
    const rotation = new Quaternion().setFromEuler(new Euler(radians[0], radians[1], radians[2], "XYZ"));
    const transform = new Matrix4().compose(
      new Vector3(...resolved.position), rotation, new Vector3().setScalar(resolved.scale),
    );
    const transformedContact = new Vector3(...point).applyMatrix4(transform);
    expect(transformedContact.distanceTo(new Vector3(...resolved.socketPosition))).toBeLessThan(1e-8);
    expect(resolved.scale).toBeGreaterThan(0);
  });

  it("keeps legacy explicit transforms unchanged when no smart rig is stored", () => {
    const definition = propDefById("blender_ice_cream_cone")!;
    const instance = createPropInstance(definition.id, "legacy-cone")!;
    const { rig: _rig, ...legacy } = instance;
    const resolved = resolvePropAttachment(definition, legacy, metrics);
    expect(resolved.usesSmartRig).toBe(false);
    expect(resolved.position).toEqual(instance.position);
    expect(resolved.rotationDeg).toEqual(instance.rotationDeg);
    expect(resolved.scale).toEqual(instance.scale);
  });
});
