import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  applyAvatarForgeBodyPreset,
  buildAvatarForgeHairParts,
  createAvatarForgeState,
} from "./studio-vrm-avatar-forge";
import {
  applyAvatarForgeBodyProportions,
  countDetectedVrmHairMeshes,
  createAvatarForgeHairGeometry,
} from "./StudioVrmAvatarForge";

import type { AvatarForgeHairPart, AvatarForgeHairStyle } from "./studio-vrm-avatar-forge";
import type { VRM } from "@pixiv/three-vrm";

function material(name: string) {
  const value = new THREE.MeshBasicMaterial();
  value.name = name;
  return value;
}

function mesh(name: string, materials: THREE.Material | THREE.Material[]) {
  const value = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials);
  value.name = name;
  return value;
}

function vrmWith(...objects: THREE.Object3D[]) {
  const scene = new THREE.Group();
  scene.add(...objects);
  return { scene } as unknown as VRM;
}

describe("countDetectedVrmHairMeshes", () => {
  it("detects explicitly separated hair meshes by node or material name", () => {
    const namedHair = mesh("Hair_Back", material("Material.001"));
    const materialHair = mesh("Node_001", material("N00_000_Hair_00_HAIR"));

    expect(countDetectedVrmHairMeshes(vrmWith(namedHair, materialHair))).toBe(2);
  });

  it("never treats a baked body mesh with skin and hair materials as replaceable", () => {
    const bakedBody = mesh("Body (merged).baked", [
      material("N00_000_00_Body_00_SKIN (Instance)"),
      material("N00_000_00_HairBack_00_HAIR (Instance)"),
    ]);

    expect(countDetectedVrmHairMeshes(vrmWith(bakedBody))).toBe(0);
  });

  it("rejects face meshes and ambiguous multi-material generic nodes", () => {
    const faceHair = mesh("Face_Hair_Combined", material("Hair"));
    const ambiguous = mesh("Node_002", [material("Hair_Back"), material("Material.002")]);

    expect(countDetectedVrmHairMeshes(vrmWith(faceHair, ambiguous))).toBe(0);
  });

  it("excludes generated forge descendants from subsequent detection passes", () => {
    const forge = new THREE.Group();
    forge.userData.toonSpectrumAvatarForge = true;
    forge.add(mesh("ToonSpectrumAvatarForgeHair_bang", material("Hair_Bang")));

    expect(countDetectedVrmHairMeshes(vrmWith(forge))).toBe(0);
  });
});

describe("applyAvatarForgeBodyProportions", () => {
  type TransformSnapshot = {
    readonly position: THREE.Vector3;
    readonly quaternion: THREE.Quaternion;
    readonly scale: THREE.Vector3;
  };

  function bone(position: readonly [number, number, number]) {
    const node = new THREE.Object3D();
    node.position.set(...position);
    node.quaternion.setFromEuler(new THREE.Euler(0.1, -0.2, 0.3));
    node.scale.set(1.2, 0.9, 1.1);
    return node;
  }

  function snapshot(node: THREE.Object3D): TransformSnapshot {
    return {
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      scale: node.scale.clone(),
    };
  }

  function expectTransform(node: THREE.Object3D, expected: TransformSnapshot) {
    expect(node.position).toEqual(expected.position);
    expect(node.quaternion.toArray()).toEqual(expected.quaternion.toArray());
    expect(node.scale).toEqual(expected.scale);
  }

  function riggedVrm() {
    const scene = new THREE.Group();
    const raw = new Map<string, THREE.Object3D>();
    const normalized = new Map<string, THREE.Object3D>();
    for (const name of ["hips", "chest", "leftLowerArm", "leftHand", "leftLowerLeg", "leftFoot"]) {
      const rawNode = bone([0.2, 0.4, 0.1]);
      const normalizedNode = bone([0.25, 0.5, 0.125]);
      raw.set(name, rawNode);
      normalized.set(name, normalizedNode);
      scene.add(rawNode, normalizedNode);
    }
    return {
      vrm: {
        scene,
        humanoid: {
          getRawBoneNode: (name: string) => raw.get(name) ?? null,
          getNormalizedBoneNode: (name: string) => normalized.get(name) ?? null,
        },
      } as unknown as VRM,
      normalized,
      raw,
    };
  }

  it("uses only the raw/skinned rig as dimension authority and leaves normalized pose controls intact", () => {
    const { vrm, normalized, raw } = riggedVrm();
    const hero = applyAvatarForgeBodyPreset(createAvatarForgeState(), "hero").body;
    const rawChest = raw.get("chest")!;
    const normalizedHand = normalized.get("leftHand")!;
    const chestBefore = snapshot(rawChest);
    const normalizedBefore = snapshot(normalizedHand);

    const restore = applyAvatarForgeBodyProportions(vrm, hero);

    expect(rawChest.scale.x).toBeCloseTo(chestBefore.scale.x * hero.shoulderWidth, 10);
    expect(rawChest.scale.y).toBe(chestBefore.scale.y);
    expect(rawChest.quaternion.toArray()).toEqual(chestBefore.quaternion.toArray());
    expectTransform(normalizedHand, normalizedBefore);
    expect(vrm.scene.children.every((node) => !(node as THREE.Mesh).isMesh)).toBe(true);

    restore();

    expectTransform(rawChest, chestBefore);
    expectTransform(normalizedHand, normalizedBefore);
  });

  it("restores exact TRS before each sequential preset reapply without accumulating drift", () => {
    const { vrm, normalized, raw } = riggedVrm();
    const originalRaw = new Map([...raw].map(([name, node]) => [name, snapshot(node)]));
    const originalNormalized = new Map(
      [...normalized].map(([name, node]) => [name, snapshot(node)]),
    );

    for (const presetId of ["hero", "compact", "long-line"] as const) {
      const body = applyAvatarForgeBodyPreset(createAvatarForgeState(), presetId).body;
      const restore = applyAvatarForgeBodyProportions(vrm, body);
      const rawHand = raw.get("leftHand")!;
      expect(rawHand.position.x).toBeCloseTo(
        originalRaw.get("leftHand")!.position.x * body.armLength,
        10,
      );
      restore();

      for (const [name, node] of raw) expectTransform(node, originalRaw.get(name)!);
      for (const [name, node] of normalized) {
        expectTransform(node, originalNormalized.get(name)!);
      }
    }
  });

  it("ignores missing optional humanoid bones and returns an idempotent restore", () => {
    const scene = new THREE.Group();
    const vrm = {
      scene,
      humanoid: {
        getRawBoneNode: () => null,
        getNormalizedBoneNode: () => null,
      },
    } as unknown as VRM;

    const restore = applyAvatarForgeBodyProportions(vrm, createAvatarForgeState().body);
    expect(() => restore()).not.toThrow();
    expect(() => restore()).not.toThrow();
  });
});

/* ── 계획 → 실제 지오메트리 (정점 수·좌표 수치 검증) ───────────────────── */

const ALL_STYLES: readonly AvatarForgeHairStyle[] = [
  "short", "bob", "long", "ponytail", "twintail", "bun",
  "wavy", "braid", "twin-braid", "hime", "wolf", "half-up", "pixie",
];

function planFor(style: AvatarForgeHairStyle, patch: Record<string, unknown> = {}) {
  const state = createAvatarForgeState();
  state.hair = { ...state.hair, style, ...patch } as typeof state.hair;
  return buildAvatarForgeHairParts(state);
}

function positionsOf(part: AvatarForgeHairPart) {
  const geometry = createAvatarForgeHairGeometry(part);
  const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
  const array = Float32Array.from(attribute.array as ArrayLike<number>);
  geometry.dispose();
  return { count: attribute.count, array };
}

describe("createAvatarForgeHairGeometry", () => {
  it("가닥(tapered-capsule)은 링 15개 × 10정점 + 양 끝 중심 2개 = 152 정점", () => {
    const strand = planFor("long").find((part) => part.primitive === "tapered-capsule");
    expect(strand).toBeDefined();
    // (lengthSegments 14 + 1) * radialSegments 10 + top/bottom 캡 중심 2
    expect(positionsOf(strand!).count).toBe(152);
  });

  it("캡은 반구(32×18), 그 외 구체 파츠는 완전구(24×16)로 구워진다", () => {
    const parts = planFor("bun");
    const cap = parts.find((part) => part.role === "cap");
    const bun = parts.find((part) => part.id === "bun");
    expect(positionsOf(cap!).count).toBe(33 * 19);
    expect(positionsOf(bun!).count).toBe(25 * 17);
  });

  it("모든 스타일의 모든 파츠가 유한한 정점과 색 속성을 만든다", () => {
    let partsChecked = 0;
    for (const style of ALL_STYLES) {
      for (const part of planFor(style, { ahoge: 0.6 })) {
        const geometry = createAvatarForgeHairGeometry(part);
        const position = geometry.getAttribute("position");
        const color = geometry.getAttribute("color");
        expect(position.count).toBeGreaterThan(0);
        expect(color?.count).toBe(position.count);
        for (let index = 0; index < position.count * 3; index += 1) {
          expect(Number.isFinite((position.array as ArrayLike<number>)[index])).toBe(true);
        }
        geometry.dispose();
        partsChecked += 1;
      }
    }
    expect(partsChecked).toBeGreaterThan(100);
  });

  it("wave가 없는 v1 계획은 정점 좌표가 웨이브 코드 도입 전과 완전히 동일하다", () => {
    // v1 스타일의 가닥에는 wave 키가 없어야 하고, 그때 좌표는 곡률(curl)만으로 결정된다.
    for (const style of ["short", "bob", "long", "ponytail", "twintail", "bun"] as const) {
      for (const part of planFor(style)) {
        expect(part.wave).toBeUndefined();
      }
    }

    // 웨이브 분기를 켜고 끈 두 계획을 같은 파츠에서 비교 — 0일 때는 완전 동일해야 한다.
    const straight = planFor("long").find((part) => part.id === "side-left")!;
    const zeroWave: AvatarForgeHairPart = { ...straight, wave: 0, waveFrequency: 2.4 };
    expect(positionsOf(zeroWave).array).toEqual(positionsOf(straight).array);
  });

  it("wave가 커지면 가닥이 실제로 좌우로 휜다", () => {
    const straight = planFor("long").find((part) => part.id === "side-left")!;
    const waved: AvatarForgeHairPart = { ...straight, wave: 0.8, waveFrequency: 2.4 };

    const before = positionsOf(straight);
    const after = positionsOf(waved);
    expect(after.count).toBe(before.count);

    const spreadX = (values: Float32Array) => {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < values.length; index += 3) {
        min = Math.min(min, values[index]);
        max = Math.max(max, values[index]);
      }
      return max - min;
    };
    expect(spreadX(after.array)).toBeGreaterThan(spreadX(before.array) * 1.3);
  });
});
