import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  buildAvatarForgeHairParts,
  createAvatarForgeState,
} from "./studio-vrm-avatar-forge";
import {
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
