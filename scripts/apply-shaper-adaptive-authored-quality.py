#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, source: str) -> None:
    (ROOT / relative).write_text(source, encoding="utf-8")


def replace_exact(relative: str, old: str, new: str, expected: int = 1) -> None:
    source = read(relative)
    count = source.count(old)
    if count != expected:
        raise RuntimeError(f"{relative}: expected {expected} matches, found {count}: {old[:120]!r}")
    write(relative, source.replace(old, new))


def replace_regex(relative: str, pattern: str, replacement: str, expected: int = 1) -> None:
    source = read(relative)
    updated, count = re.subn(pattern, replacement, source, flags=re.MULTILINE | re.DOTALL)
    if count != expected:
        raise RuntimeError(f"{relative}: expected {expected} regex matches, found {count}: {pattern[:120]!r}")
    write(relative, updated)


STATE = "src/domains/creator/vrm/studio-vrm-avatar-forge.ts"
ACTOR = "src/domains/creator/vrm/StudioVrmAvatarForge.tsx"
PANEL = "src/domains/creator/vrm/StudioVrmAvatarForgePanel.tsx"
PREVIEW = "src/domains/creator/vrm/StudioVrmAvatarForgePreview.tsx"
GEOMETRY_TEST = "src/domains/creator/vrm/StudioVrmAvatarForge.test.ts"
SEMANTIC_TEST = "src/domains/creator/vrm/studio-vrm-semantic-face-morph.test.ts"

# Persist an explicit shadow colour without changing legacy documents/digests.
replace_exact(
    STATE,
    "  baseColor: string;\n  tipColor: string;",
    "  baseColor: string;\n  /** Optional authored cel-shadow colour. Omitted legacy states derive it from baseColor. */\n  shadowColor?: string;\n  tipColor: string;",
    expected=2,
)
replace_exact(
    STATE,
    "    baseColor: hair.baseColor,\n    tipColor: hair.tipColor,",
    "    baseColor: hair.baseColor,\n    ...(hair.shadowColor ? { shadowColor: hair.shadowColor } : {}),\n    tipColor: hair.tipColor,",
)
replace_exact(
    STATE,
    "      baseColor: color(hair.baseColor, DEFAULT_HAIR.baseColor),\n      tipColor: color(hair.tipColor, DEFAULT_HAIR.tipColor),",
    "      baseColor: color(hair.baseColor, DEFAULT_HAIR.baseColor),\n      ...(typeof hair.shadowColor === \"string\" && HEX_COLOR.test(hair.shadowColor)\n        ? { shadowColor: hair.shadowColor.toLowerCase() }\n        : {}),\n      tipColor: color(hair.tipColor, DEFAULT_HAIR.tipColor),",
)

# Replace per-part radial hair with one merged authored clump buffer + one outline buffer.
replace_exact(
    ACTOR,
    'import { applyStudioVrmSemanticFaceMorphs } from "./studio-vrm-semantic-face-morph";\n',
    '''import { applyStudioVrmSemanticFaceMorphs } from "./studio-vrm-semantic-face-morph";
import {
  createStudioVrmAuthoredHairGeometry,
  createStudioVrmAuthoredHairGradientTexture,
  mergeStudioVrmAuthoredHairGeometry,
  type StudioVrmAuthoredHairInstance,
} from "./studio-vrm-authored-hair-geometry";
''',
)
replace_exact(
    ACTOR,
    'const AVATAR_FORGE_MARKER = "toonSpectrumAvatarForge";\n',
    'const AVATAR_FORGE_MARKER = "toonSpectrumAvatarForge";\nconst AVATAR_FORGE_OWNED_TEXTURES = "toonSpectrumAvatarForgeOwnedTextures";\n',
)

HAIR_RUNTIME = r'''/** The shipped runtime and tests share the same authored clump generator. */
// eslint-disable-next-line react-refresh/only-export-components
export function createAvatarForgeHairGeometry(part: AvatarForgeHairPart) {
  return createStudioVrmAuthoredHairGeometry(part);
}

function transformHairPart(part: AvatarForgeHairPart, fit: HeadFit) {
  const scaleX = fit.radiusX / 0.56;
  const scaleY = fit.radiusY / 0.46;
  const scaleZ = fit.radiusZ / 0.54;
  const position = new THREE.Vector3(
    fit.center.x + part.position[0] * scaleX,
    fit.center.y + (part.position[1] - 0.18) * scaleY,
    fit.center.z + (part.position[2] - 0.015) * scaleZ * fit.frontSign
  );
  const rotation = new THREE.Euler(
    part.rotation[0] * fit.frontSign,
    part.rotation[1],
    part.rotation[2],
    "XYZ"
  );
  const scale = new THREE.Vector3(
    part.scale[0] * scaleX,
    part.scale[1] * scaleY,
    part.scale[2] * scaleZ
  );
  return { position, rotation, scale };
}

function authoredHairInstance(
  part: AvatarForgeHairPart,
  fit: HeadFit,
): StudioVrmAuthoredHairInstance {
  const transform = transformHairPart(part, fit);
  const matrix = new THREE.Matrix4().compose(
    transform.position,
    new THREE.Quaternion().setFromEuler(transform.rotation),
    transform.scale,
  );
  return Object.freeze({ part, matrix });
}

function createExpandedOutlineGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const outline = source.clone();
  const position = outline.getAttribute("position");
  const normal = outline.getAttribute("normal");
  if (!position || !normal) return outline;
  outline.computeBoundingSphere();
  const thickness = Math.max(0.00045, (outline.boundingSphere?.radius ?? 0.08) * 0.0085);
  const values = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    values[index * 3] = position.getX(index) + normal.getX(index) * thickness;
    values[index * 3 + 1] = position.getY(index) + normal.getY(index) * thickness;
    values[index * 3 + 2] = position.getZ(index) + normal.getZ(index) * thickness;
  }
  outline.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
  outline.computeBoundingBox();
  outline.computeBoundingSphere();
  return outline;
}

function createHairMaterial(state: AvatarForgeState, gradientMap: THREE.DataTexture) {
  const material = new THREE.MeshToonMaterial({
    color: 0xffffff,
    vertexColors: true,
    gradientMap,
    side: THREE.DoubleSide,
  });
  material.emissive.set(state.hair.baseColor);
  material.emissiveIntensity = clamp(0.012 + state.hair.shine * 0.045, 0.012, 0.057);
  return material;
}

function createHairOutlineMaterial(state: AvatarForgeState) {
  const outline = new THREE.Color(state.hair.shadowColor ?? state.hair.baseColor)
    .lerp(new THREE.Color("#090708"), 0.62);
  return new THREE.MeshBasicMaterial({
    color: outline,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  });
}

function addHairParts(group: THREE.Group, state: AvatarForgeState, fit: HeadFit) {
  const parts = buildAvatarForgeHairParts(state);
  const merged = mergeStudioVrmAuthoredHairGeometry(
    parts.map((part) => authoredHairInstance(part, fit)),
  );
  if (!merged) return;

  const gradientMap = createStudioVrmAuthoredHairGradientTexture();
  const mesh = new THREE.Mesh(merged, createHairMaterial(state, gradientMap));
  const outline = new THREE.Mesh(
    createExpandedOutlineGeometry(merged),
    createHairOutlineMaterial(state),
  );
  mesh.name = "ToonSpectrumAvatarForgeHair_AuthoredMerged";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = 6;
  mesh.userData.partCount = parts.length;
  outline.name = "ToonSpectrumAvatarForgeHairOutline_AuthoredMerged";
  outline.renderOrder = 5;
  outline.userData.partCount = parts.length;
  group.userData[AVATAR_FORGE_OWNED_TEXTURES] = [gradientMap];
  group.add(outline, mesh);
}

'''
replace_regex(
    ACTOR,
    r"function setGradientColors\(.*?\nfunction faceSurfaceZ\(",
    HAIR_RUNTIME + "function faceSurfaceZ(",
)
replace_exact(
    ACTOR,
    "  materials.forEach((material) => material.dispose());\n}",
    '''  materials.forEach((material) => material.dispose());
  const textures = object.userData[AVATAR_FORGE_OWNED_TEXTURES];
  if (Array.isArray(textures)) {
    for (const texture of textures) {
      if (texture instanceof THREE.Texture) texture.dispose();
    }
  }
}''',
)

# Three-stop cel palette and provider-aware face UI.
HAIR_PALETTES = '''const HAIR_COLOR_PRESETS = [
  { id: "ink", label: "잉크 블랙", baseColor: "#171515", shadowColor: "#070606", tipColor: "#5d5551" },
  { id: "espresso", label: "에스프레소", baseColor: "#2b1d18", shadowColor: "#110b09", tipColor: "#8d6756" },
  { id: "honey", label: "허니 블론드", baseColor: "#91611f", shadowColor: "#3c260b", tipColor: "#f4d67f" },
  { id: "silver", label: "실버", baseColor: "#777b86", shadowColor: "#30333a", tipColor: "#f0f1f5" },
  { id: "rose", label: "로즈", baseColor: "#713344", shadowColor: "#2b1119", tipColor: "#efa8bb" },
  { id: "violet", label: "바이올렛", baseColor: "#33254f", shadowColor: "#130d20", tipColor: "#aa91dc" },
  { id: "ocean", label: "오션", baseColor: "#173a58", shadowColor: "#071724", tipColor: "#70b9dc" },
  { id: "mint", label: "민트", baseColor: "#174b48", shadowColor: "#071e1d", tipColor: "#8be0d5" },
] as const;

function deriveHairShadowColor(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return "#111111";
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 0xff) * 0.38)
    .toString(16)
    .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}'''
replace_regex(PANEL, r"const HAIR_COLOR_PRESETS = \[.*?\] as const;", HAIR_PALETTES)
replace_exact(
    PANEL,
    '''                  const selected = state.hair.baseColor === palette.baseColor
                    && state.hair.tipColor === palette.tipColor;''',
    '''                  const selected = state.hair.baseColor === palette.baseColor
                    && (state.hair.shadowColor ?? deriveHairShadowColor(state.hair.baseColor)) === palette.shadowColor
                    && state.hair.tipColor === palette.tipColor;''',
)
replace_exact(
    PANEL,
    '''                          baseColor: palette.baseColor,
                          tipColor: palette.tipColor,''',
    '''                          baseColor: palette.baseColor,
                          shadowColor: palette.shadowColor,
                          tipColor: palette.tipColor,''',
)
replace_exact(PANEL, "뿌리·끝 교체", "기본·하이라이트 교체")

COLOR_CONTROLS = '''            <div className="grid grid-cols-3 gap-2">
              {([
                ["baseColor", "기본색"],
                ["shadowColor", "그림자색"],
                ["tipColor", "하이라이트"],
              ] as const).map(([key, label]) => {
                const value = key === "shadowColor"
                  ? state.hair.shadowColor ?? deriveHairShadowColor(state.hair.baseColor)
                  : state.hair[key];
                return (
                  <label key={key} className="flex min-h-12 min-w-0 flex-col justify-center gap-1 rounded-xl border border-line bg-card px-2 text-[0.58rem] font-bold text-fg-2">
                    <span className="flex items-center gap-1 truncate">
                      <Palette size={11} className="shrink-0 text-fg-3" aria-hidden />
                      {label}
                    </span>
                    <input
                      type="color"
                      value={value}
                      disabled={disabled || state.hair.style === "none"}
                      onChange={(event) => updateHair(key, event.target.value)}
                      className="h-8 w-full cursor-pointer rounded-lg border border-line bg-transparent p-0 disabled:opacity-35 pointer-coarse:h-11"
                      aria-label={`헤어 ${label}`}
                    />
                  </label>
                );
              })}
            </div>'''
replace_regex(
    PANEL,
    r'''            <div className="grid grid-cols-2 gap-2">\n              \{\(\["baseColor", "tipColor"\] as const\)\.map\(\(key\) => \(.*?\n            </div>''',
    COLOR_CONTROLS,
)
replace_exact(PANEL, "모델 고유 얼굴 모프", "적응형 얼굴 디테일")
replace_exact(
    PANEL,
    "눈·코·입·귀 이름이 명확한 shape key만 탐지합니다. 표정·립싱크 채널은 제외합니다.",
    "모델 고유 shape key를 먼저 사용하고, 없는 항목은 머리·눈 랜드마크와 얼굴 메시를 기반으로 부드럽게 조형합니다. 표정·립싱크 채널은 제외합니다.",
)
replace_exact(
    PANEL,
    '''                      hint={control.hint}
                      value={state.semanticFaceMorphs?.[control.id] ?? 0}''',
    '''                      hint={`${control.provider === "native-morph" ? "모델 morph" : `적응형 mesh ${control.adaptiveMeshCount}개`} · ${control.hint}`}
                      value={state.semanticFaceMorphs?.[control.id] ?? 0}''',
)
replace_exact(PANEL, "연결된 shape key 확인", "조형 공급자 확인")
replace_exact(
    PANEL,
    '''                          <b className="text-fg-2">{control.label}</b> · {control.targetNames.join(" · ")}''',
    '''                          <b className="text-fg-2">{control.label}</b> · {control.provider === "native-morph"
                            ? `모델 morph · ${control.targetNames.join(" · ")}`
                            : `적응형 mesh · 얼굴 메시 ${control.adaptiveMeshCount}개`}''',
)
replace_exact(
    PANEL,
    '"모델을 불러오면 호환되는 상세 얼굴 morph를 검사합니다."',
    '"모델을 불러오면 native morph와 적응형 얼굴 메시를 함께 검사합니다."',
)

# Visual cards show the same authored three-stop palette as the 3D runtime.
replace_exact(
    PREVIEW,
    '''        <linearGradient id={hairGradientId} x1="0" x2="0.9" y1="0" y2="1">
          <stop offset="0" stopColor={safe.hair.baseColor} />
          <stop offset="0.58" stopColor={safe.hair.baseColor} />
          <stop offset="1" stopColor={safe.hair.tipColor} />
        </linearGradient>''',
    '''        <linearGradient id={hairGradientId} x1="0" x2="0.9" y1="0" y2="1">
          <stop offset="0" stopColor={safe.hair.shadowColor ?? safe.hair.baseColor} />
          <stop offset="0.34" stopColor={safe.hair.baseColor} />
          <stop offset="0.72" stopColor={safe.hair.baseColor} />
          <stop offset="1" stopColor={safe.hair.tipColor} />
        </linearGradient>''',
)
replace_exact(
    PREVIEW,
    'stroke={safe.hair.baseColor}',
    'stroke={safe.hair.shadowColor ?? safe.hair.baseColor}',
    expected=2,
)

# Geometry tests now inspect the authored 19x7 front/back clump grid.
replace_exact(
    GEOMETRY_TEST,
    '''  it("가닥(tapered-capsule)은 링 15개 × 10정점 + 양 끝 중심 2개 = 152 정점", () => {
    const strand = planFor("long").find((part) => part.primitive === "tapered-capsule");
    expect(strand).toBeDefined();
    // (lengthSegments 14 + 1) * radialSegments 10 + top/bottom 캡 중심 2
    expect(positionsOf(strand!).count).toBe(152);
  });''',
    '''  it("가닥은 19×7 front/back 그리드의 닫힌 authored clump로 구워진다", () => {
    const strand = planFor("long").find((part) => part.primitive === "tapered-capsule");
    expect(strand).toBeDefined();
    expect(positionsOf(strand!).count).toBe((18 + 1) * (6 + 1) * 2);
  });''',
)
replace_exact(
    GEOMETRY_TEST,
    '''  it("캡은 반구(32×18), 그 외 구체 파츠는 완전구(24×16)로 구워진다", () => {
    const parts = planFor("bun");
    const cap = parts.find((part) => part.role === "cap");
    const bun = parts.find((part) => part.id === "bun");
    expect(positionsOf(cap!).count).toBe(33 * 19);
    expect(positionsOf(bun!).count).toBe(25 * 17);
  });''',
    '''  it("캡은 고밀도 authored shell, 번 파츠는 완전구로 구워진다", () => {
    const parts = planFor("bun");
    const cap = parts.find((part) => part.role === "cap");
    const bun = parts.find((part) => part.id === "bun");
    expect(positionsOf(cap!).count).toBe(29 * 19);
    expect(positionsOf(bun!).count).toBe(25 * 17);
  });''',
)
replace_regex(
    GEOMETRY_TEST,
    r'''    const ringCenterXs = \(values: Float32Array\) =>\n      Array\.from\(\{ length: 15 \}, \(_, row\) => \{.*?    expect\(maximumCenterlineShift\)\.toBeGreaterThan\(0\.1\);''',
    '''    const centrelineXs = (values: Float32Array) =>
      Array.from({ length: 19 }, (_, row) => values[(row * 7 + 3) * 3] ?? 0);
    const beforeCenters = centrelineXs(before.array);
    const afterCenters = centrelineXs(after.array);
    const maximumCenterlineShift = Math.max(
      ...afterCenters.map((value, index) => Math.abs(value - (beforeCenters[index] ?? 0))),
    );
    expect(maximumCenterlineShift).toBeGreaterThan(0.1);''',
)
replace_exact(
    GEOMETRY_TEST,
    '''    const radialSegments = 10;

    const spread = (row: number, axis: 0 | 2) => {
      let minimum = Number.POSITIVE_INFINITY;
      let maximum = Number.NEGATIVE_INFINITY;
      for (let column = 0; column < radialSegments; column += 1) {
        const value = array[(row * radialSegments + column) * 3 + axis]!;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
      return maximum - minimum;
    };

    const rootWidth = spread(1, 0);
    const rootDepth = spread(1, 2);
    const tipWidth = spread(14, 0);''',
    '''    const columns = 7;

    const spread = (row: number, axis: 0 | 2) => {
      let minimum = Number.POSITIVE_INFINITY;
      let maximum = Number.NEGATIVE_INFINITY;
      for (let column = 0; column < columns; column += 1) {
        const value = array[(row * columns + column) * 3 + axis]!;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
      return maximum - minimum;
    };

    const rootWidth = spread(1, 0);
    const rootDepth = spread(1, 2);
    const tipWidth = spread(18, 0);''',
)

# Replace semantic profile tests with native-priority + adaptive-fallback coverage.
write(SEMANTIC_TEST, '''import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  applyStudioVrmSemanticFaceMorphs,
  inspectStudioVrmSemanticFaceMorphProfile,
} from "./studio-vrm-semantic-face-morph";

import type { VRM } from "@pixiv/three-vrm";

function vrmWithMorphs(names: readonly string[], baselines?: readonly number[]): VRM {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 12), new THREE.MeshBasicMaterial());
  mesh.name = "FaceSkin";
  mesh.morphTargetDictionary = Object.fromEntries(names.map((name, index) => [name, index]));
  mesh.morphTargetInfluences = names.map((_, index) => baselines?.[index] ?? 0);
  scene.add(mesh);
  return { scene } as unknown as VRM;
}

function firstMorphMesh(vrm: VRM): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  vrm.scene.traverse((object) => {
    if (!found && (object as THREE.Mesh).isMesh) found = object as THREE.Mesh;
  });
  if (!found) throw new Error("missing morph mesh");
  return found;
}

describe("studio-vrm-semantic-face-morph", () => {
  it("admits exact semantic aliases while excluding expression morphs", () => {
    const vrm = vrmWithMorphs([
      "Face_EyeSizeBig",
      "face_eye_size_small",
      "Fcl_EYE_Blink",
      "Fcl_MTH_A",
      "Joy",
    ]);
    const profile = inspectStudioVrmSemanticFaceMorphProfile(vrm);
    const eyeSize = profile.controls.find((control) => control.id === "eyeSize");

    expect(profile.status).toBe("ready");
    expect(eyeSize).toMatchObject({
      id: "eyeSize",
      minimum: -1,
      maximum: 1,
      positiveTargetCount: 1,
      negativeTargetCount: 1,
      provider: "native-morph",
    });
    expect(profile.nativeTargetCount).toBe(2);
    expect(eyeSize?.targetNames).not.toContain("Fcl_EYE_Blink");
  });

  it("applies positive and negative native targets from an exact captured baseline", () => {
    const vrm = vrmWithMorphs(
      ["eyeSizeBig", "eyeSizeSmall", "noseWidthWide"],
      [0.2, 0.1, 0.25],
    );
    const mesh = firstMorphMesh(vrm);
    const releasePositive = applyStudioVrmSemanticFaceMorphs(vrm, {
      eyeSize: 0.5,
      noseWidth: 0.4,
    });

    expect(mesh.morphTargetInfluences?.[0]).toBeCloseTo(0.6);
    expect(mesh.morphTargetInfluences?.[1]).toBeCloseTo(0.1);
    expect(mesh.morphTargetInfluences?.[2]).toBeCloseTo(0.55);

    releasePositive();
    expect(mesh.morphTargetInfluences).toEqual([0.2, 0.1, 0.25]);

    const releaseNegative = applyStudioVrmSemanticFaceMorphs(vrm, { eyeSize: -0.75 });
    expect(mesh.morphTargetInfluences?.[0]).toBeCloseTo(0.2);
    expect(mesh.morphTargetInfluences?.[1]).toBeCloseTo(0.775);
    releaseNegative();
    expect(mesh.morphTargetInfluences).toEqual([0.2, 0.1, 0.25]);
  });

  it("reports one-sided native ranges without inventing the missing direction", () => {
    const positiveOnly = inspectStudioVrmSemanticFaceMorphProfile(
      vrmWithMorphs(["avatarMouthWidthWide"]),
    );
    expect(positiveOnly.controls.find((control) => control.id === "mouthWidth")).toMatchObject({
      provider: "native-morph",
      minimum: 0,
      maximum: 1,
    });

    const negativeOnly = inspectStudioVrmSemanticFaceMorphProfile(
      vrmWithMorphs(["blendshapeEarSizeSmall"]),
    );
    expect(negativeOnly.controls.find((control) => control.id === "earSize")).toMatchObject({
      provider: "native-morph",
      minimum: -1,
      maximum: 0,
    });
  });

  it("fills missing semantics with adaptive mesh controls while expressions stay unclaimed", () => {
    const profile = inspectStudioVrmSemanticFaceMorphProfile(
      vrmWithMorphs(["Blink", "Fcl_EYE_Joy", "Fcl_MTH_A", "Surprised"]),
    );
    expect(profile.status).toBe("ready");
    expect(profile.nativeTargetCount).toBe(0);
    expect(profile.adaptiveMeshCount).toBeGreaterThan(0);
    expect(profile.controls.some((control) => control.provider === "adaptive-mesh")).toBe(true);
    expect(profile.controls.flatMap((control) => control.targetNames)).not.toContain("Fcl_EYE_Joy");
  });

  it("lets an exact native channel win while adapting a different missing semantic", () => {
    const vrm = vrmWithMorphs(["eyeSizeBig"]);
    const mesh = firstMorphMesh(vrm);
    const originalGeometry = mesh.geometry;
    const release = applyStudioVrmSemanticFaceMorphs(vrm, {
      eyeSize: 0.6,
      mouthWidth: 0.5,
    });
    expect(mesh.morphTargetInfluences?.[0]).toBeCloseTo(0.6);
    expect(mesh.geometry).not.toBe(originalGeometry);
    release();
    expect(mesh.morphTargetInfluences?.[0]).toBe(0);
    expect(mesh.geometry).toBe(originalGeometry);
  });

  it("fails closed only when neither native nor adaptive geometry is available", () => {
    const profile = inspectStudioVrmSemanticFaceMorphProfile({
      scene: new THREE.Group(),
    } as unknown as VRM);
    expect(profile.status).toBe("unavailable");
    expect(profile.controls).toEqual([]);
    expect(profile.targetCount).toBe(0);
    expect(profile.adaptiveMeshCount).toBe(0);
  });
});
''')

# New product boundary: native precedence, reversible adaptive geometry, merged authored hair.
write("src/domains/creator/vrm/studio-vrm-character-quality-closure.test.ts", '''import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const forge = readFileSync(new URL("./StudioVrmAvatarForge.tsx", import.meta.url), "utf8");
const semantic = readFileSync(new URL("./studio-vrm-semantic-face-morph.ts", import.meta.url), "utf8");
const adaptive = readFileSync(new URL("./studio-vrm-adaptive-face-deformer.ts", import.meta.url), "utf8");
const authoredHair = readFileSync(new URL("./studio-vrm-authored-hair-geometry.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("./StudioVrmAvatarForgePanel.tsx", import.meta.url), "utf8");

describe("VRM character quality closure", () => {
  it("uses exact native morphs before adaptive mesh deformation", () => {
    expect(semantic).toContain("nativeSemanticIds");
    expect(semantic).toContain("applyStudioVrmAdaptiveFaceMorphs(vrm, state, nativeSemanticIds)");
    expect(semantic).toContain('provider: "native-morph"');
    expect(semantic).toContain('provider: "adaptive-mesh"');
    expect(adaptive).toContain("excludedSemanticIds");
    expect(adaptive).toContain("binding.mesh.geometry = deformed");
    expect(adaptive).toContain("binding.mesh.geometry = originalGeometry");
  });

  it("renders authored clumps as one merged buffer plus one expanded outline", () => {
    expect(forge).toContain("mergeStudioVrmAuthoredHairGeometry(");
    expect(forge).toContain("ToonSpectrumAvatarForgeHair_AuthoredMerged");
    expect(forge).toContain("ToonSpectrumAvatarForgeHairOutline_AuthoredMerged");
    expect(forge).not.toContain("for (const part of buildAvatarForgeHairParts(state))");
    expect(authoredHair).toContain("CLUMP_CROSS_SEGMENTS = 6");
    expect(authoredHair).toContain("mergeGeometries(geometries, false)");
    expect(authoredHair).toContain("part.shadowColor");
  });

  it("exposes a three-stop palette and honest provider labels", () => {
    expect(panel).toContain("shadowColor");
    expect(panel).toContain("적응형 얼굴 디테일");
    expect(panel).toContain("모델 morph");
    expect(panel).toContain("적응형 mesh");
  });
});
''')

required = {
    STATE: ["shadowColor?: string", "hair.shadowColor ? { shadowColor"],
    ACTOR: ["mergeStudioVrmAuthoredHairGeometry(", "AuthoredMerged", "AVATAR_FORGE_OWNED_TEXTURES"],
    PANEL: ["적응형 얼굴 디테일", "shadowColor", "적응형 mesh"],
    PREVIEW: ["safe.hair.shadowColor ?? safe.hair.baseColor"],
}
for path, markers in required.items():
    source = read(path)
    for marker in markers:
        if marker not in source:
            raise RuntimeError(f"{path}: missing marker {marker!r}")

print("Applied adaptive face + authored hair quality closure")
for path in [STATE, ACTOR, PANEL, PREVIEW, GEOMETRY_TEST, SEMANTIC_TEST]:
    print(f" - {path}")
