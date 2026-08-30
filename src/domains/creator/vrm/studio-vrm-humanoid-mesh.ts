/**
 * 파라미터 → **실제 인체 형태의 스킨드 메시**. 생성형 VRM 캐릭터의 몸이 여기서 만들어진다.
 *
 * 이전 생성기는 관절마다 육면체 하나씩, 총 15개 박스를 붙인 마네킹이었다. 이 모듈은 같은
 * {@link AvatarForgeState} 를 받아 단면 스윕(로프트)으로 몸통·팔·다리를, 변형 타원체로 두상을,
 * 두개골 표면에 붙는 패치로 눈·눈썹·입을 만들고, 아바타 조형 패널이 이미 쓰고 있는
 * {@link buildAvatarForgeHairParts} 헤어 계획을 그대로 구워 넣는다.
 *
 * 설계 규칙
 *  - **순수·결정론적**: three.js 도 캔버스도 쓰지 않는다. 같은 상태면 같은 정점이 나온다.
 *  - **월드 rest 좌표계 저작**: studio-vrm-humanoid-rig 의 rest 월드 좌표를 그대로 쓴다.
 *    IBM 이 이동만 담으므로(리그 파일 상단 참고) 저작 좌표 = 바인드 좌표다.
 *  - **파트별 노드 분리**: Body/Face/Hair/Tops/Bottoms/Shoes 를 각각 별도 노드·메시로 낸다.
 *    스튜디오의 워드로브·헤어 교체 시스템이 **이름 휴리스틱**(studio-vrm-costume 의
 *    `classifyMeshName`)으로 대상을 찾기 때문에, 이름이 분류에 걸리도록 나눠 두어야
 *    생성 캐릭터도 의상 토글·리컬러·헤어 교체를 그대로 받는다.
 *  - **표정은 모프 타깃**: 익스포터의 표정 바인딩은 morphTarget 만 지원한다. 그래서 얼굴을
 *    텍스처가 아니라 지오메트리로 만들고, 눈/눈썹/입 패치의 파라미터를 바꿔 델타를 굽는다.
 *    덕분에 생성 캐릭터가 눈 깜빡임 안정화·웹캠 트래킹·표정 적용 경로에 그대로 올라탄다.
 */

import {
  buildAvatarForgeHairParts,
  type AvatarForgeHairPart,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";
import { hexToRgb, hslToRgb, rgbToHsl } from "./studio-vrm-costume";
import {
  addLoft,
  applyTrs,
  eulerXyzMatrix,
  forwardRing,
  lateralRing,
  meshClamp,
  meshLerp,
  SurfaceBuilder,
  verticalRing,
  type LoftRing,
  type MeshSkinBinding,
  type MeshUvRect,
  type MeshVec2,
  type MeshVec3,
} from "./studio-vrm-humanoid-mesh-geometry";
import {
  buildStudioVrmRig,
  STUDIO_VRM_RIG_NEUTRAL_HEIGHT,
  type StudioVrmRig,
  type StudioVrmRigBone,
  type StudioVrmRigHeadFit,
} from "./studio-vrm-humanoid-rig";

import type {
  StudioVrmExportMaterial,
  StudioVrmExportMorphTarget,
  StudioVrmExportPrimitive,
} from "./studio-vrm-export-plan";

export const STUDIO_VRM_HUMANOID_MESH_VERSION = 1 as const;

/* -------------------------------------------------------------------------- */
/* 머티리얼                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 머티리얼 인덱스. 이름은 studio-vrm-costume 의 분류 휴리스틱에 걸리도록 지었다
 * (Skin·Face_EyeWhite·Face_Iris·Face_Brow·Face_Mouth·Hair 는 보호,
 * Tops/Bottoms/Shoes 는 의상 슬롯).
 */
export const STUDIO_VRM_HUMANOID_MATERIALS = Object.freeze({
  skin: 0,
  eyeWhite: 1,
  iris: 2,
  brow: 3,
  mouth: 4,
  hair: 5,
  tops: 6,
  bottoms: 7,
  shoes: 8,
});

/** 피부 톤은 조형 상태에 파라미터가 없다. 중립적인 한 가지 톤으로 고정한다. */
const SKIN_BASE = "#f4d5c4";
const SKIN_SHADE = "#dcae9b";
const EYE_WHITE = "#fbfbfd";
const EYE_WHITE_SHADE = "#d8dce8";
const MOUTH_COLOR = "#b4525a";

type Rgb = readonly [number, number, number];

function rgb(hex: string): Rgb {
  const { r, g, b } = hexToRgb(hex);
  return [r, g, b];
}

/** 색조를 돌려 결정론적인 보조 색을 만든다(의상 팔레트용). */
function shiftHue(hex: string, degrees: number, saturation: number, lightness: number): Rgb {
  const hsl = rgbToHsl(hexToRgb(hex));
  const shifted = hslToRgb({
    h: hsl.h + degrees,
    s: meshClamp(saturation, 0, 1),
    l: meshClamp(lightness, 0, 1),
  });
  return [shifted.r, shifted.g, shifted.b];
}

function darken(color: Rgb, amount: number): Rgb {
  return [color[0] * amount, color[1] * amount, color[2] * amount];
}

function toonMaterial(
  name: string,
  base: Rgb,
  shade: Rgb,
  options: {
    readonly outline?: number;
    readonly doubleSided?: boolean;
    readonly toony?: number;
    readonly roughness?: number;
  } = {},
): StudioVrmExportMaterial {
  return {
    name,
    baseColorFactor: [base[0], base[1], base[2], 1],
    metallicFactor: 0,
    roughnessFactor: options.roughness ?? 0.85,
    doubleSided: options.doubleSided,
    mtoon: {
      shadeColorFactor: [shade[0], shade[1], shade[2]],
      shadingToonyFactor: options.toony ?? 0.9,
      outlineWidthMode: "worldCoordinates",
      outlineWidthFactor: options.outline ?? 0.0016,
    },
  };
}

function buildMaterials(state: AvatarForgeState): StudioVrmExportMaterial[] {
  const hairBase = rgb(state.hair.baseColor);
  const hairShade = darken(rgb(state.hair.tipColor), 0.72);
  // 의상 색은 헤어 색조에서 결정론적으로 파생한다 — 프리셋마다 다른 옷을 입되 조화롭게.
  const tops = shiftHue(state.hair.baseColor, 168, 0.34, 0.62);
  const bottoms = shiftHue(state.hair.baseColor, 196, 0.28, 0.34);
  const shoes = shiftHue(state.hair.tipColor, 12, 0.22, 0.26);

  return [
    toonMaterial("Skin", rgb(SKIN_BASE), rgb(SKIN_SHADE), { outline: 0.0012, toony: 0.85 }),
    toonMaterial("Face_EyeWhite", rgb(EYE_WHITE), rgb(EYE_WHITE_SHADE), { outline: 0, toony: 1 }),
    toonMaterial("Face_Iris", rgb(state.hair.tipColor), darken(rgb(state.hair.baseColor), 0.6), {
      outline: 0,
      toony: 1,
    }),
    toonMaterial("Face_Brow", hairBase, hairShade, { outline: 0, toony: 1 }),
    toonMaterial("Face_Mouth", rgb(MOUTH_COLOR), darken(rgb(MOUTH_COLOR), 0.7), {
      outline: 0,
      toony: 1,
    }),
    toonMaterial("Hair", hairBase, hairShade, {
      outline: 0.0022,
      doubleSided: true,
      toony: 0.94,
      // 조형 패널의 광택 슬라이더가 내보낸 VRM 에 실제로 반영되게 한다.
      roughness: meshClamp(1 - state.hair.shine, 0.2, 1),
    }),
    toonMaterial("Tops", tops, darken(tops, 0.68), { outline: 0.002 }),
    toonMaterial("Bottoms", bottoms, darken(bottoms, 0.68), { outline: 0.002 }),
    toonMaterial("Shoes", shoes, darken(shoes, 0.66), { outline: 0.002 }),
  ];
}

/* -------------------------------------------------------------------------- */
/* 스킨 바인딩                                                                 */
/* -------------------------------------------------------------------------- */

function only(rig: StudioVrmRig, bone: StudioVrmRigBone): MeshSkinBinding {
  return [[rig.jointIndex[bone], 1]];
}

function mix(
  rig: StudioVrmRig,
  from: StudioVrmRigBone,
  to: StudioVrmRigBone,
  t: number,
): MeshSkinBinding {
  const weight = meshClamp(t, 0, 1);
  return [
    [rig.jointIndex[from], 1 - weight],
    [rig.jointIndex[to], weight],
  ];
}

/** 0→1 로 부드럽게 오르는 전이 곡선. 관절 주변 가중치가 각지지 않게 한다. */
function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1;
  const t = meshClamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * 몸통 높이 y 에 대한 hips→spine→head 가중치.
 * 허리는 넉넉한 구간에서 섞어야 척추를 숙일 때 배가 접히지 않는다.
 */
function torsoSkin(rig: StudioVrmRig, y: number, h: number): MeshSkinBinding {
  const hipsY = rig.worldRest.hips[1];
  const spineY = rig.worldRest.spine[1];
  const headY = rig.worldRest.head[1];
  const neckStart = headY - 0.085 * h;

  if (y >= neckStart) {
    return mix(rig, "spine", "head", smoothstep(neckStart, headY + 0.01 * h, y));
  }
  return mix(rig, "hips", "spine", smoothstep(hipsY - 0.03 * h, spineY + 0.11 * h, y));
}

/* -------------------------------------------------------------------------- */
/* UV 아틀라스                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Body 메시는 머티리얼이 하나뿐이라 파트끼리 UV 가 겹치면 안 된다(표면 페인팅·텍스처 채우기가
 * 같은 텍스처를 공유하므로). 파트마다 서로 겹치지 않는 사각형을 할당한다.
 */
const UV = Object.freeze({
  torso: [0.0, 0.0, 0.5, 0.36] as MeshUvRect,
  armLeft: [0.5, 0.0, 0.74, 0.18] as MeshUvRect,
  armRight: [0.75, 0.0, 0.99, 0.18] as MeshUvRect,
  handLeft: [0.5, 0.19, 0.61, 0.29] as MeshUvRect,
  handRight: [0.62, 0.19, 0.73, 0.29] as MeshUvRect,
  thumbLeft: [0.74, 0.19, 0.81, 0.29] as MeshUvRect,
  thumbRight: [0.82, 0.19, 0.89, 0.29] as MeshUvRect,
  legLeft: [0.0, 0.37, 0.24, 0.69] as MeshUvRect,
  legRight: [0.25, 0.37, 0.49, 0.69] as MeshUvRect,
  footLeft: [0.5, 0.3, 0.63, 0.4] as MeshUvRect,
  footRight: [0.64, 0.3, 0.77, 0.4] as MeshUvRect,
  head: [0.0, 0.7, 0.55, 1.0] as MeshUvRect,
});

/* -------------------------------------------------------------------------- */
/* 몸통·팔다리                                                                 */
/* -------------------------------------------------------------------------- */

const TORSO_SEGMENTS = 24;
const LIMB_SEGMENTS = 14;

/**
 * 실루엣 상수는 전부 **중립 신장에 대한 비율**이다(중립 신장 = 1).
 *
 * 값은 상용 VRM 아바타를 실측해 캘리브레이션했다 — 겨드랑이 아래 구간의 몸통 단면과 무릎
 * 아래 다리 단면처럼 T 포즈 팔에 오염되지 않는 구간만 골라 잰 실루엣 프로파일이다.
 * (첫 구현은 몸통이 30~45% 좁고 종아리가 50% 굵어 "빨대 몸통에 통다리"로 보였다.)
 *
 * 비율로 적어 두면 `overallHeight` 로 키를 바꿔도 굵기가 함께 따라오고, 상수만 읽어도
 * 어떤 체형을 노린 것인지 바로 보인다.
 */
function bodyUnit(rig: StudioVrmRig): number {
  return heightScale(rig) * STUDIO_VRM_RIG_NEUTRAL_HEIGHT;
}

/**
 * 중립 대비 선형 배율(중립에서 정확히 1). 세로 오프셋도 이 값을 쓴다.
 *
 * 리그가 직접 주는 값을 쓴다. 골반 높이에서 유추하면 안 된다 — 다리를 늘려도 발바닥이
 * 지면에 남도록 골반이 보정되므로 `legLength` 가 배율에 새어 든다.
 */
function heightScale(rig: StudioVrmRig): number {
  return rig.heightScale;
}

/** 몸통 단면 계획 — [높이, 좌우 반지름 비율, 앞뒤 반지름 비율, 초타원 지수]. */
type TorsoProfile = readonly [y: number, radiusX: number, radiusZ: number, exponent: number];

/** 몸통·상의가 공유하는 높이 앵커. */
function torsoAnchors(rig: StudioVrmRig) {
  const h = heightScale(rig);
  const hipsY = rig.worldRest.hips[1];
  const shoulderY = rig.worldRest.leftUpperArm[1];
  return {
    h,
    hipsY,
    shoulderY,
    headY: rig.worldRest.head[1],
    crotchY: hipsY - 0.075 * h,
    waistY: hipsY + 0.13 * h,
    chestY: shoulderY - 0.06 * h,
  };
}

function buildTorso(builder: SurfaceBuilder, rig: StudioVrmRig, state: AvatarForgeState): void {
  const { h, hipsY, shoulderY, headY, crotchY, waistY, chestY } = torsoAnchors(rig);
  const unit = bodyUnit(rig);
  const shoulder = meshClamp(state.proportions.shoulderWidth, 0.7, 1.4);

  const profiles: readonly TorsoProfile[] = [
    [crotchY, 0.085, 0.068, 2.2],
    [hipsY - 0.035 * h, 0.094, 0.076, 2.3],
    [hipsY + 0.025 * h, 0.096, 0.077, 2.3],
    [waistY, 0.078, 0.066, 2.3],
    [meshLerp(waistY, chestY, 0.55), 0.09, 0.07, 2.3],
    [chestY, 0.106, 0.076, 2.4],
    [shoulderY - 0.012 * h, 0.116, 0.073, 2.5],
    [shoulderY + 0.03 * h, 0.098, 0.062, 2.4],
    [headY - 0.085 * h, 0.036, 0.034, 2.1],
    [headY - 0.045 * h, 0.03, 0.03, 2],
    [headY + 0.03 * h, 0.029, 0.029, 2],
  ];

  // 어깨 너비는 위쪽 단면에만 실린다 — 골반까지 같이 넓어지면 체형이 무너진다.
  const rings: LoftRing[] = profiles.map(([y, rx, rz, exponent], index) => {
    const lateral = meshLerp(1, shoulder, smoothstep(waistY, shoulderY, y));
    return verticalRing(
      [0, y, 0],
      rx * unit * lateral,
      rz * unit,
      torsoSkin(rig, y, h),
      index / (profiles.length - 1),
      exponent,
    );
  });

  addLoft(builder, rings, {
    segments: TORSO_SEGMENTS,
    uvRect: UV.torso,
    capStart: true,
    capEnd: true,
  });
}

/** 팔 한 쪽 — 어깨 안쪽에서 시작해 손목까지. `side` 는 +1(왼쪽) / −1(오른쪽). */
function buildArm(
  builder: SurfaceBuilder,
  rig: StudioVrmRig,
  side: 1 | -1,
  uvRect: MeshUvRect,
): void {
  const unit = bodyUnit(rig);
  const upper = side > 0 ? "leftUpperArm" : "rightUpperArm";
  const lower = side > 0 ? "leftLowerArm" : "rightLowerArm";
  const hand = side > 0 ? "leftHand" : "rightHand";
  const shoulderX = rig.worldRest[upper][0];
  const elbowX = rig.worldRest[lower][0];
  const wristX = rig.worldRest[hand][0];
  const y = rig.worldRest[upper][1];

  // 어깨 안쪽에서 출발해 몸통 실루엣에 파묻히게 한다(겨드랑이 틈 방지).
  const rootX = meshLerp(0, shoulderX, 0.42);
  const stops: readonly (readonly [x: number, radius: number, skin: MeshSkinBinding])[] = [
    [rootX, 0.038, mix(rig, "spine", upper, 0.25)],
    [shoulderX, 0.036, mix(rig, "spine", upper, 0.82)],
    [meshLerp(shoulderX, elbowX, 0.45), 0.031, only(rig, upper)],
    [elbowX, 0.027, mix(rig, upper, lower, 0.5)],
    [meshLerp(elbowX, wristX, 0.55), 0.024, only(rig, lower)],
    [wristX, 0.019, mix(rig, lower, hand, 0.45)],
  ];

  const rings = stops.map(([x, radius, skin], index) =>
    lateralRing(
      [x, y, 0],
      radius * unit,
      radius * unit * 0.94,
      skin,
      index / (stops.length - 1),
    ),
  );
  addLoft(builder, rings, { segments: LIMB_SEGMENTS, uvRect, capStart: true });
}

/** 손 — 손바닥이 아래를 보는 T 포즈 기준으로 Y 로 얇고 Z 로 넓다. */
function buildHand(
  builder: SurfaceBuilder,
  rig: StudioVrmRig,
  side: 1 | -1,
  palmRect: MeshUvRect,
  thumbRect: MeshUvRect,
): void {
  const unit = bodyUnit(rig);
  const hand = side > 0 ? "leftHand" : "rightHand";
  const lower = side > 0 ? "leftLowerArm" : "rightLowerArm";
  const [wristX, y, z] = rig.worldRest[hand];
  const reach = 0.07 * unit * side;

  const stops: readonly (readonly [t: number, ry: number, rz: number, skin: MeshSkinBinding])[] = [
    [0, 0.0165, 0.019, mix(rig, lower, hand, 0.6)],
    [0.26, 0.015, 0.027, only(rig, hand)],
    [0.6, 0.0132, 0.027, only(rig, hand)],
    [0.85, 0.0105, 0.022, only(rig, hand)],
    [1, 0.006, 0.013, only(rig, hand)],
  ];
  addLoft(
    builder,
    stops.map(([t, ry, rz, skin], index) =>
      lateralRing(
        [wristX + reach * t, y, z],
        ry * unit,
        rz * unit,
        skin,
        index / (stops.length - 1),
        2.4,
      ),
    ),
    { segments: LIMB_SEGMENTS, uvRect: palmRect, capEnd: true },
  );

  // 엄지 — 손목 근처에서 앞(+Z)으로 뻗는 짧은 원뿔. 실루엣이 손으로 읽히게 하는 최소 장치.
  const thumbBaseX = wristX + reach * 0.2;
  const thumbStops: readonly (readonly [t: number, radius: number])[] = [
    [0, 0.011],
    [0.5, 0.0095],
    [1, 0.0055],
  ];
  addLoft(
    builder,
    thumbStops.map(([t, radius], index) =>
      verticalRing(
        [thumbBaseX + reach * 0.18 * t, y - 0.004 * unit, z + 0.036 * unit * t],
        radius * unit,
        radius * unit,
        only(rig, hand),
        index / (thumbStops.length - 1),
      ),
    ),
    { segments: 10, uvRect: thumbRect, capStart: true, capEnd: true },
  );
}

function buildLeg(
  builder: SurfaceBuilder,
  rig: StudioVrmRig,
  side: 1 | -1,
  uvRect: MeshUvRect,
): void {
  const h = heightScale(rig);
  const unit = bodyUnit(rig);
  const upper = side > 0 ? "leftUpperLeg" : "rightUpperLeg";
  const lower = side > 0 ? "leftLowerLeg" : "rightLowerLeg";
  const foot = side > 0 ? "leftFoot" : "rightFoot";
  const [x, hipY] = rig.worldRest[upper];
  const kneeY = rig.worldRest[lower][1];
  const ankleY = rig.worldRest[foot][1];

  const stops: readonly (readonly [y: number, rx: number, rz: number, skin: MeshSkinBinding])[] = [
    [hipY + 0.05 * h, 0.045, 0.05, mix(rig, "hips", upper, 0.35)],
    [hipY - 0.04 * h, 0.043, 0.048, mix(rig, "hips", upper, 0.85)],
    [meshLerp(hipY, kneeY, 0.5), 0.036, 0.041, only(rig, upper)],
    [kneeY + 0.03 * h, 0.026, 0.031, mix(rig, upper, lower, 0.35)],
    [kneeY, 0.023, 0.029, mix(rig, upper, lower, 0.55)],
    [meshLerp(kneeY, ankleY, 0.32), 0.026, 0.032, only(rig, lower)],
    [meshLerp(kneeY, ankleY, 0.72), 0.018, 0.023, only(rig, lower)],
    [ankleY, 0.0145, 0.019, mix(rig, lower, foot, 0.4)],
  ];

  addLoft(
    builder,
    stops.map(([y, rx, rz, skin], index) =>
      verticalRing([x, y, 0], rx * unit, rz * unit, skin, index / (stops.length - 1), 2.1),
    ),
    { segments: 16, uvRect, capStart: true },
  );
}

/** 발 — 발목에서 앞(+Z)으로 스윕하고 바닥이 지면(y = groundY)에 닿는다. */
function buildFoot(
  builder: SurfaceBuilder,
  rig: StudioVrmRig,
  side: 1 | -1,
  uvRect: MeshUvRect,
  outset = 0,
): void {
  const unit = bodyUnit(rig);
  const foot = side > 0 ? "leftFoot" : "rightFoot";
  const [x, ankleY] = rig.worldRest[foot];
  // 발 노드의 균등 스케일은 **발목을 원점으로** 걸린다. 밑창을 지면에 그대로 저작하면
  // footScale>1 은 발을 바닥 아래로 밀고 <1 은 띄운다(1.6 에서 5.4cm 관통). 스케일 후
  // 밑창이 지면에 앉도록 저작 높이를 미리 되돌려 둔다: A + (s·(y−A)) = groundY 를 y 로 푼 값.
  const footScale = rig.nodeScale[foot]?.[1] ?? 1;
  const soleY = ankleY - (ankleY - rig.groundY) / (footScale === 0 ? 1 : footScale);
  const halfHeight = (ankleY - soleY) / 2 + outset;
  const centerY = soleY + halfHeight;

  const stops: readonly (readonly [z: number, rx: number, ryScale: number])[] = [
    [-0.028, 0.017, 0.7],
    [-0.013, 0.021, 0.98],
    [0.016, 0.023, 1],
    [0.046, 0.022, 0.86],
    [0.068, 0.017, 0.56],
    [0.078, 0.01, 0.3],
  ];

  addLoft(
    builder,
    stops.map(([z, rx, ryScale], index) =>
      forwardRing(
        [x, centerY, z * unit],
        rx * unit + outset,
        halfHeight * ryScale,
        only(rig, foot),
        index / (stops.length - 1),
        2.4,
      ),
    ),
    // 4의 배수여야 단면의 최저점에 정점이 놓여 밑창이 지면에 정확히 닿는다.
    // 14각형이면 최저 샘플이 0.979 지점이라 발이 1mm 가량 떠 보인다.
    { segments: 16, uvRect, capStart: true, capEnd: true },
  );
}

/* -------------------------------------------------------------------------- */
/* 두상                                                                        */
/* -------------------------------------------------------------------------- */

const HEAD_COLUMNS = 30;
const HEAD_ROWS = 22;

/**
 * 두개골 — 타원체를 아래쪽에서 턱으로 좁히고 광대에 볼륨을 얹은 형태.
 * 얼굴 비율(headWidth/Height/Depth)은 여기서 굽지 않는다. 머리 **노드 스케일**로 들어가므로
 * 이중 적용이 된다(리그 파일의 바인드 규약 참고).
 */
function buildHead(builder: SurfaceBuilder, rig: StudioVrmRig, state: AvatarForgeState): void {
  const head = rig.head;
  const skin = only(rig, "head");
  const chin = meshClamp(state.face.chinLength, 0.8, 1.25);
  const cheek = meshClamp(state.face.cheekVolume, 0, 1);
  const [u0, v0, u1, v1] = UV.head;

  const grid: number[][] = [];
  for (let row = 0; row <= HEAD_ROWS; row += 1) {
    const theta = (row / HEAD_ROWS) * Math.PI;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const line: number[] = [];
    for (let column = 0; column <= HEAD_COLUMNS; column += 1) {
      const phi = (column / HEAD_COLUMNS) * Math.PI * 2;
      // 턱: 아래 절반에서 좌우·앞뒤를 좁히고 세로로 늘인다.
      const lower = meshClamp(-cosTheta, 0, 1);
      const narrow = 1 - 0.42 * lower ** 1.45;
      const stretch = cosTheta < 0 ? chin : 1;
      // 광대: 눈높이 살짝 아래에서 좌우로만 부풀린다.
      const cheekFalloff = Math.exp(-(((cosTheta + 0.18) / 0.34) ** 2));
      const cheekGain = 1 + cheek * 0.13 * cheekFalloff;

      const x = -Math.cos(phi) * sinTheta;
      const z = Math.sin(phi) * sinTheta;
      // 정면은 살짝 눌러 애니메 특유의 평평한 얼굴 면을 만든다.
      const frontFlatten = z > 0 ? 1 - 0.13 * z : 1;

      line.push(
        builder.vertex(
          [
            head.center[0] + head.radiusX * x * narrow * cheekGain,
            head.center[1] + head.radiusY * cosTheta * stretch,
            head.center[2] + head.radiusZ * z * narrow * frontFlatten,
          ],
          [
            meshLerp(u0, u1, column / HEAD_COLUMNS),
            meshLerp(v0, v1, 1 - row / HEAD_ROWS),
          ] satisfies MeshVec2,
          skin,
        ),
      );
    }
    grid.push(line);
  }

  for (let row = 0; row < HEAD_ROWS; row += 1) {
    for (let column = 0; column < HEAD_COLUMNS; column += 1) {
      // (row, col) → (row+1, col) → (row+1, col+1) → (row, col+1) 순서가 바깥을 본다.
      builder.quad(
        grid[row][column],
        grid[row + 1][column],
        grid[row + 1][column + 1],
        grid[row][column + 1],
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 얼굴 — 두개골 표면 패치 + 표정 모프                                          */
/* -------------------------------------------------------------------------- */

/** `eyeline` 은 윗눈꺼풀 선. 이게 없으면 눈이 "고글"처럼 읽힌다(상용 아바타도 별도 재질로 둔다). */
type FacePatchId = "eye" | "iris" | "glint" | "eyeline" | "brow" | "mouth";
type FaceGroup = "eyeWhite" | "iris" | "brow" | "mouth";

/**
 * 얼굴 피처 하나의 모양. 전부 **두개골 중심 기준 얼굴 평면 좌표**(m)이며,
 * 실제 정점은 이 평면 좌표를 두개골 타원체 위로 올려서 만든다.
 */
type FacePatchParams = {
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  /** 초타원 지수. 2 = 정타원, 크면 사각형에 가까워진다(애니메 눈매). */
  readonly exponent: number;
  /** 두개골 표면에서 띄우는 거리. 겹치는 피처의 앞뒤 순서를 정한다. */
  readonly outset: number;
  /** 라디안. 눈썹 안쪽 끝의 상하 기울기. */
  readonly tilt: number;
  /** 가운데를 위(+)/아래(−)로 휘게 하는 포물선 성분 — 눈썹 아치·입꼬리. */
  readonly bow: number;
  /** 미러링 **이후** 월드 X 이동. 두 눈동자가 같은 방향을 보게 하는 시선 모프용. */
  readonly worldOffsetX: number;
};

type PatchMorphOp = {
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly worldOffsetX?: number;
  /** 두개골 세로 반경의 배수로 주는 이동. 피처 자기 크기와 무관하게 얼굴 전체를 기준으로 움직인다. */
  readonly offsetHeadY?: number;
  readonly tilt?: number;
  readonly bow?: number;
  /** 세로로 줄일 때 위/아래 어느 가장자리를 고정할지. 눈꺼풀이 닫히는 방향을 정한다. */
  readonly collapse?: "top" | "bottom";
};

type FaceMorph = {
  readonly name: string;
  readonly ops: Partial<Record<FacePatchId, PatchMorphOp>>;
  /** 지정하면 그쪽 패치에만 적용된다(한쪽 눈 깜빡임). */
  readonly side?: "left" | "right";
};

const FACE_PATCH_RINGS = 3;
const FACE_PATCH_SEGMENTS = 16;

/** 눈 감김 — 아래 눈꺼풀 선까지 눌러 붙인다. */
const CLOSE_EYE: PatchMorphOp = { collapse: "bottom", scaleY: 0.06 };
/** 눈이 닫히면 윗눈꺼풀 선도 아래 눈꺼풀까지 함께 내려와야 한 줄로 읽힌다. */
const CLOSE_EYELINE: PatchMorphOp = { offsetHeadY: -0.36 };

/**
 * VRM 1.0 표정 프리셋과 **이름이 1:1로 같은** 모프 타깃들. 표정 바인딩이
 * `가중치 1로 같은 이름의 타깃 하나`가 되어 익스포터·로더 양쪽에서 읽기 쉽다.
 */
const FACE_MORPHS: readonly FaceMorph[] = [
  { name: "blink", ops: { eye: CLOSE_EYE, iris: CLOSE_EYE, glint: CLOSE_EYE, eyeline: CLOSE_EYELINE } },
  {
    name: "blinkLeft",
    side: "left",
    ops: { eye: CLOSE_EYE, iris: CLOSE_EYE, glint: CLOSE_EYE, eyeline: CLOSE_EYELINE },
  },
  {
    name: "blinkRight",
    side: "right",
    ops: { eye: CLOSE_EYE, iris: CLOSE_EYE, glint: CLOSE_EYE, eyeline: CLOSE_EYELINE },
  },
  {
    name: "happy",
    ops: {
      eye: { collapse: "bottom", scaleY: 0.3, bow: 0.009 },
      iris: { collapse: "bottom", scaleY: 0.3, bow: 0.009 },
      glint: { collapse: "bottom", scaleY: 0.3, bow: 0.009 },
      eyeline: { offsetHeadY: -0.26, bow: 0.009 },
      brow: { offsetY: 0.004 },
      mouth: { scaleX: 1.5, scaleY: 1.5, bow: -0.006 },
    },
  },
  {
    name: "angry",
    ops: {
      brow: { tilt: 0.34, offsetY: -0.008 },
      eye: { scaleY: 0.82, offsetY: -0.002 },
      eyeline: { offsetHeadY: -0.03, tilt: 0.1 },
      mouth: { scaleX: 0.86, bow: 0.004 },
    },
  },
  {
    name: "sad",
    ops: {
      brow: { tilt: -0.3, offsetY: 0.004 },
      eye: { scaleY: 0.86, offsetY: -0.003 },
      mouth: { scaleX: 0.9, bow: 0.005 },
    },
  },
  {
    name: "relaxed",
    ops: {
      eye: { collapse: "bottom", scaleY: 0.58 },
      iris: { collapse: "bottom", scaleY: 0.58 },
      glint: { collapse: "bottom", scaleY: 0.58 },
      eyeline: { offsetHeadY: -0.15 },
      mouth: { scaleX: 1.2, bow: -0.004 },
    },
  },
  {
    name: "surprised",
    ops: {
      eye: { scaleX: 1.1, scaleY: 1.28 },
      iris: { scaleX: 1.1, scaleY: 1.2 },
      eyeline: { offsetHeadY: 0.02 },
      brow: { offsetY: 0.01 },
      mouth: { scaleX: 0.86, scaleY: 2.4 },
    },
  },
  { name: "aa", ops: { mouth: { scaleX: 0.92, scaleY: 3 } } },
  { name: "ih", ops: { mouth: { scaleX: 1.4, scaleY: 0.85 } } },
  { name: "ou", ops: { mouth: { scaleX: 0.62, scaleY: 2 } } },
  { name: "ee", ops: { mouth: { scaleX: 1.45, scaleY: 1.25 } } },
  { name: "oh", ops: { mouth: { scaleX: 0.85, scaleY: 2.6 } } },
  { name: "lookUp", ops: { iris: { offsetY: 0.006 }, glint: { offsetY: 0.006 } } },
  { name: "lookDown", ops: { iris: { offsetY: -0.006 }, glint: { offsetY: -0.006 } } },
  { name: "lookLeft", ops: { iris: { worldOffsetX: 0.007 }, glint: { worldOffsetX: 0.007 } } },
  { name: "lookRight", ops: { iris: { worldOffsetX: -0.007 }, glint: { worldOffsetX: -0.007 } } },
];

export const STUDIO_VRM_HUMANOID_MORPH_TARGET_NAMES: readonly string[] = Object.freeze(
  FACE_MORPHS.map((morph) => morph.name),
);

type FacePatchInstance = {
  readonly id: FacePatchId;
  readonly side: "left" | "right" | "center";
  readonly group: FaceGroup;
  readonly base: FacePatchParams;
  readonly mirrored: boolean;
  readonly vertices: readonly (readonly [index: number, lx: number, ly: number])[];
};

function facePatchPoint(
  head: StudioVrmRigHeadFit,
  params: FacePatchParams,
  mirrored: boolean,
  lx: number,
  ly: number,
): MeshVec3 {
  const sx = lx * params.radiusX;
  const sy = ly * params.radiusY + params.bow * (1 - lx * lx);
  const cos = Math.cos(params.tilt);
  const sin = Math.sin(params.tilt);
  const planarX = params.centerX + sx * cos - sy * sin;
  const planarY = params.centerY + sx * sin + sy * cos;
  const fx = (mirrored ? -planarX : planarX) + params.worldOffsetX;

  const nx = fx / head.radiusX;
  const ny = planarY / head.radiusY;
  // 0.05 하한은 피처가 두개골 옆면으로 넘어가 z 가 0 에 붙는 것을 막는다.
  const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
  return [
    head.center[0] + fx,
    head.center[1] + planarY,
    head.center[2] + (head.radiusZ + params.outset) * nz,
  ];
}

function morphedParams(
  base: FacePatchParams,
  op: PatchMorphOp,
  head: StudioVrmRigHeadFit,
): FacePatchParams {
  const radiusX = base.radiusX * (op.scaleX ?? 1);
  const radiusY = base.radiusY * (op.scaleY ?? 1);
  const anchoredY =
    op.collapse === "top"
      ? base.centerY + base.radiusY - radiusY
      : op.collapse === "bottom"
        ? base.centerY - base.radiusY + radiusY
        : base.centerY;
  return {
    ...base,
    radiusX,
    radiusY,
    centerX: base.centerX + (op.offsetX ?? 0),
    centerY: anchoredY + (op.offsetY ?? 0) + (op.offsetHeadY ?? 0) * head.radiusY,
    tilt: base.tilt + (op.tilt ?? 0),
    bow: base.bow + (op.bow ?? 0),
    worldOffsetX: base.worldOffsetX + (op.worldOffsetX ?? 0),
  };
}

/** 초타원 단위 원반 위의 표본점. `t` 는 중심(0)에서 가장자리(1)까지의 거리. */
function facePatchSample(exponent: number, t: number, angle: number): MeshVec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const power = 2 / exponent;
  return [
    t * Math.sign(cos) * Math.abs(cos) ** power,
    t * Math.sign(sin) * Math.abs(sin) ** power,
  ];
}

function addFacePatch(
  builder: SurfaceBuilder,
  rig: StudioVrmRig,
  patch: Omit<FacePatchInstance, "vertices">,
  uvRect: MeshUvRect,
): FacePatchInstance {
  const skin = only(rig, "head");
  const [u0, v0, u1, v1] = uvRect;
  const vertices: (readonly [number, number, number])[] = [];

  const push = (lx: number, ly: number): number => {
    const index = builder.vertex(
      facePatchPoint(rig.head, patch.base, patch.mirrored, lx, ly),
      [meshLerp(u0, u1, (lx + 1) / 2), meshLerp(v0, v1, (ly + 1) / 2)],
      skin,
    );
    vertices.push([index, lx, ly]);
    return index;
  };

  const indexStart = builder.indexCursor;
  const center = push(0, 0);
  const rings: number[][] = [];
  for (let ring = 1; ring <= FACE_PATCH_RINGS; ring += 1) {
    const t = ring / FACE_PATCH_RINGS;
    const row: number[] = [];
    for (let column = 0; column < FACE_PATCH_SEGMENTS; column += 1) {
      const angle = (column / FACE_PATCH_SEGMENTS) * Math.PI * 2;
      const [lx, ly] = facePatchSample(patch.base.exponent, t, angle);
      row.push(push(lx, ly));
    }
    rings.push(row);
  }

  for (let column = 0; column < FACE_PATCH_SEGMENTS; column += 1) {
    const next = (column + 1) % FACE_PATCH_SEGMENTS;
    builder.triangle(center, rings[0][column], rings[0][next]);
  }
  for (let ring = 0; ring + 1 < rings.length; ring += 1) {
    for (let column = 0; column < FACE_PATCH_SEGMENTS; column += 1) {
      const next = (column + 1) % FACE_PATCH_SEGMENTS;
      builder.quad(
        rings[ring][column],
        rings[ring + 1][column],
        rings[ring + 1][next],
        rings[ring][next],
      );
    }
  }

  // X 를 뒤집으면 손잡이가 바뀐다 — 오른쪽 패치는 감김을 되돌려야 정면을 본다.
  if (patch.mirrored) builder.flipWindingFrom(indexStart);

  return { ...patch, vertices };
}

function facePatchParams(overrides: Partial<FacePatchParams>): FacePatchParams {
  return {
    centerX: 0,
    centerY: 0,
    radiusX: 0.01,
    radiusY: 0.01,
    exponent: 2,
    outset: 0.002,
    tilt: 0,
    bow: 0,
    worldOffsetX: 0,
    ...overrides,
  };
}

/**
 * 얼굴 피처 배치. 좌표는 전부 **두개골 반경의 비율**이라 얼굴 비율 파라미터나 키가 바뀌어도
 * 이목구비가 같은 자리에 남는다.
 *
 * 구성은 상용 VRM 아바타의 얼굴 재질 구성(EyeWhite / EyeIris / EyeHighlight / FaceEyeline /
 * FaceBrow / FaceMouth)을 실측해 맞췄다. 특히 `eyeline`(윗눈꺼풀 선)이 빠지면 흰자와 홍채만
 * 남아 눈이 고글처럼 보인다 — 애니메 눈매를 만드는 것은 사실상 이 선이다.
 */
function buildFacePatches(rig: StudioVrmRig): {
  readonly builders: Record<FaceGroup, SurfaceBuilder>;
  readonly patches: readonly FacePatchInstance[];
} {
  const { radiusX: rx, radiusY: ry } = rig.head;

  const builders: Record<FaceGroup, SurfaceBuilder> = {
    eyeWhite: new SurfaceBuilder(),
    iris: new SurfaceBuilder(),
    brow: new SurfaceBuilder(),
    mouth: new SurfaceBuilder(),
  };

  const patch = (
    id: FacePatchId,
    group: FaceGroup,
    side: "left" | "right",
    base: Partial<FacePatchParams>,
  ): Omit<FacePatchInstance, "vertices"> => ({
    id,
    side,
    group,
    mirrored: side === "right",
    base: facePatchParams(base),
  });

  const eye = (side: "left" | "right") =>
    patch("eye", "eyeWhite", side, {
      centerX: 0.46 * rx,
      centerY: -0.205 * ry,
      radiusX: 0.29 * rx,
      radiusY: 0.215 * ry,
      exponent: 2.7,
      outset: 0.015 * rx,
    });

  const iris = (side: "left" | "right") =>
    patch("iris", "iris", side, {
      centerX: 0.46 * rx,
      centerY: -0.235 * ry,
      radiusX: 0.15 * rx,
      radiusY: 0.165 * ry,
      exponent: 2.2,
      outset: 0.034 * rx,
    });

  const glint = (side: "left" | "right") =>
    patch("glint", "eyeWhite", side, {
      centerX: 0.53 * rx,
      centerY: -0.145 * ry,
      radiusX: 0.055 * rx,
      radiusY: 0.05 * ry,
      outset: 0.05 * rx,
    });

  // 눈 위 가장자리를 덮는 굵은 선. 바깥쪽(관자놀이 쪽)이 살짝 두꺼워지도록 기울인다.
  const eyeline = (side: "left" | "right") =>
    patch("eyeline", "brow", side, {
      centerX: 0.47 * rx,
      centerY: 0.012 * ry,
      radiusX: 0.315 * rx,
      radiusY: 0.036 * ry,
      exponent: 3,
      outset: 0.028 * rx,
      tilt: -0.06,
      bow: 0.028 * ry,
    });

  const brow = (side: "left" | "right") =>
    patch("brow", "brow", side, {
      centerX: 0.44 * rx,
      centerY: 0.245 * ry,
      radiusX: 0.29 * rx,
      radiusY: 0.032 * ry,
      exponent: 3.2,
      outset: 0.024 * rx,
      bow: 0.032 * ry,
    });

  const mouth: Omit<FacePatchInstance, "vertices"> = {
    id: "mouth",
    side: "center",
    group: "mouth",
    mirrored: false,
    base: facePatchParams({
      centerX: 0,
      centerY: -0.55 * ry,
      radiusX: 0.15 * rx,
      radiusY: 0.045 * ry,
      exponent: 2.6,
      outset: 0.022 * rx,
      bow: -0.023 * ry,
    }),
  };

  const patches: FacePatchInstance[] = [
    addFacePatch(builders.eyeWhite, rig, eye("left"), [0.02, 0.52, 0.46, 0.98]),
    addFacePatch(builders.eyeWhite, rig, eye("right"), [0.52, 0.52, 0.96, 0.98]),
    addFacePatch(builders.eyeWhite, rig, glint("left"), [0.04, 0.06, 0.22, 0.24]),
    addFacePatch(builders.eyeWhite, rig, glint("right"), [0.54, 0.06, 0.72, 0.24]),
    addFacePatch(builders.iris, rig, iris("left"), [0.02, 0.02, 0.48, 0.98]),
    addFacePatch(builders.iris, rig, iris("right"), [0.52, 0.02, 0.98, 0.98]),
    addFacePatch(builders.brow, rig, brow("left"), [0.02, 0.52, 0.48, 0.98]),
    addFacePatch(builders.brow, rig, brow("right"), [0.52, 0.52, 0.98, 0.98]),
    addFacePatch(builders.brow, rig, eyeline("left"), [0.02, 0.02, 0.48, 0.48]),
    addFacePatch(builders.brow, rig, eyeline("right"), [0.52, 0.02, 0.98, 0.48]),
    addFacePatch(builders.mouth, rig, mouth, [0.02, 0.02, 0.98, 0.98]),
  ];

  return { builders, patches };
}

/** 한 얼굴 그룹의 모프 타깃 배열. 적용 대상이 없는 타깃도 0 델타로 반드시 채운다. */
function buildFaceMorphTargets(
  rig: StudioVrmRig,
  group: FaceGroup,
  builder: SurfaceBuilder,
  patches: readonly FacePatchInstance[],
): StudioVrmExportMorphTarget[] {
  const vertexCount = builder.vertexCount;
  return FACE_MORPHS.map((morph) => {
    const positions = new Array<number>(vertexCount * 3).fill(0);
    for (const patch of patches) {
      if (patch.group !== group) continue;
      if (morph.side !== undefined && patch.side !== morph.side) continue;
      const op = morph.ops[patch.id];
      if (!op) continue;
      const params = morphedParams(patch.base, op, rig.head);
      for (const [index, lx, ly] of patch.vertices) {
        const target = facePatchPoint(rig.head, params, patch.mirrored, lx, ly);
        const base = builder.positionAt(index);
        positions[index * 3] = target[0] - base[0];
        positions[index * 3 + 1] = target[1] - base[1];
        positions[index * 3 + 2] = target[2] - base[2];
      }
    }
    return { name: morph.name, positions };
  });
}

/* -------------------------------------------------------------------------- */
/* 헤어 — 아바타 조형 파츠 계획을 그대로 굽는다                                 */
/* -------------------------------------------------------------------------- */

const HAIR_STRAND_RADIAL = 10;
const HAIR_STRAND_LENGTH = 14;
const HAIR_CAP_COLUMNS = 24;
const HAIR_CAP_ROWS = 14;
const HAIR_SPHERE_COLUMNS = 20;
const HAIR_SPHERE_ROWS = 12;

type HairTransform = {
  readonly translation: MeshVec3;
  readonly rotation: ReturnType<typeof eulerXyzMatrix>;
  readonly scale: MeshVec3;
};

/**
 * 파츠 계획(머리 로컬·단위 스케일)을 두개골 실측에 맞춰 월드로 옮긴다.
 *
 * 계수 0.56/0.46/0.54 와 기준점 (0, 0.18, 0.015) 은 아바타 조형 렌더러
 * (`StudioVrmAvatarForge.tsx` 의 `transformHairPart`) 와 **같은 값**이다. 화면 미리보기와
 * 구워 나간 VRM 이 같은 자리에 같은 머리를 갖도록 규약을 공유한다. 생성 캐릭터는 항상
 * +Z 를 보므로 렌더러의 `frontSign` 은 여기서 +1 로 고정된다.
 */
function hairPartTransform(part: AvatarForgeHairPart, head: StudioVrmRigHeadFit): HairTransform {
  const scaleX = head.radiusX / 0.56;
  const scaleY = head.radiusY / 0.46;
  const scaleZ = head.radiusZ / 0.54;
  return {
    translation: [
      head.center[0] + part.position[0] * scaleX,
      head.center[1] + (part.position[1] - 0.18) * scaleY,
      head.center[2] + (part.position[2] - 0.015) * scaleZ,
    ],
    rotation: eulerXyzMatrix(part.rotation[0], part.rotation[1], part.rotation[2]),
    scale: [part.scale[0] * scaleX, part.scale[1] * scaleY, part.scale[2] * scaleZ],
  };
}

/**
 * 단위 구를 파츠 변환에 태워 쌓는다.
 *
 * 캡(두상 덮개)은 방위각에 따라 **덮는 각도를 달리한다** — 앞은 헤어라인에서 끊고 뒤는
 * 목덜미까지 내린다. 대칭 캡(렌더러의 0.7π)은 앞뒤가 같은 높이에서 끊겨 눈·눈썹까지
 * 덮어 버린다. 오버레이 렌더러는 알 수 없는 VRM 의 두상을 추정할 뿐이지만, 여기서는
 * 두개골 실측을 알고 있으므로 실제 머리처럼 앞뒤를 다르게 덮을 수 있다.
 */
function addHairSphere(
  builder: SurfaceBuilder,
  transform: HairTransform,
  skin: MeshSkinBinding,
  uvRect: MeshUvRect,
  options: {
    readonly columns: number;
    readonly rows: number;
    /** 정면(+Z)에서 덮는 극각. */
    readonly thetaFront: number;
    /** 후두부(−Z)에서 덮는 극각. */
    readonly thetaBack: number;
  },
): void {
  const [u0, v0, u1, v1] = uvRect;
  const grid: number[][] = [];
  for (let row = 0; row <= options.rows; row += 1) {
    const line: number[] = [];
    for (let column = 0; column <= options.columns; column += 1) {
      const phi = (column / options.columns) * Math.PI * 2;
      // sin(phi) = +1 이 정면(+Z), −1 이 후두부(−Z).
      const frontness = (Math.sin(phi) + 1) / 2;
      const theta =
        (row / options.rows) * meshLerp(options.thetaBack, options.thetaFront, frontness);
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);
      const unit: MeshVec3 = [-Math.cos(phi) * sinTheta, cosTheta, Math.sin(phi) * sinTheta];
      line.push(
        builder.vertex(
          applyTrs(unit, transform.translation, transform.rotation, transform.scale),
          [
            meshLerp(u0, u1, column / options.columns),
            meshLerp(v0, v1, 1 - row / options.rows),
          ],
          skin,
        ),
      );
    }
    grid.push(line);
  }
  for (let row = 0; row < options.rows; row += 1) {
    for (let column = 0; column < options.columns; column += 1) {
      builder.quad(
        grid[row][column],
        grid[row + 1][column],
        grid[row + 1][column + 1],
        grid[row][column + 1],
      );
    }
  }
}

/**
 * 가닥(tapered-capsule). 곡률·웨이브 산식은 렌더러의 `createTaperedStrandGeometry` 와
 * 같다 — 미리보기와 결과물의 실루엣이 갈라지지 않게 하기 위한 것이다.
 * 감김만 바깥 방향으로 바로잡았다(렌더러는 DoubleSide 라 방향이 문제되지 않았다).
 */
function addHairStrand(
  builder: SurfaceBuilder,
  part: AvatarForgeHairPart,
  transform: HairTransform,
  skin: MeshSkinBinding,
  uvRect: MeshUvRect,
): void {
  const [u0, v0, u1, v1] = uvRect;
  const waveAmount = part.wave ?? 0;
  const waveFrequency = part.waveFrequency ?? 2.4;
  const aspectX = meshClamp(part.scale[1] / Math.max(1e-4, Math.abs(part.scale[0])), 1, 10);
  const aspectZ = meshClamp(part.scale[1] / Math.max(1e-4, Math.abs(part.scale[2])), 1, 10);

  const place = (unit: MeshVec3): MeshVec3 =>
    applyTrs(unit, transform.translation, transform.rotation, transform.scale);

  const grid: number[][] = [];
  for (let row = 0; row <= HAIR_STRAND_LENGTH; row += 1) {
    const t = row / HAIR_STRAND_LENGTH;
    const y = 1 - t * 2;
    const radius = Math.max(0.08, 1 - part.taper * t ** 0.72);
    const spineCurveX = Math.sin(t * Math.PI * 2.15) * part.curl * 0.58 * t;
    const spineCurveZ = Math.sin(t * Math.PI) * part.curl * 0.34;
    const curveX =
      waveAmount > 0
        ? spineCurveX + Math.sin(t * Math.PI * waveFrequency) * waveAmount * 0.17 * aspectX * t
        : spineCurveX;
    const curveZ =
      waveAmount > 0
        ? spineCurveZ + Math.cos(t * Math.PI * waveFrequency) * waveAmount * 0.07 * aspectZ * t
        : spineCurveZ;

    const line: number[] = [];
    for (let column = 0; column <= HAIR_STRAND_RADIAL; column += 1) {
      const angle = (column / HAIR_STRAND_RADIAL) * Math.PI * 2;
      line.push(
        builder.vertex(
          place([curveX + Math.cos(angle) * radius, y, curveZ + Math.sin(angle) * radius]),
          [meshLerp(u0, u1, column / HAIR_STRAND_RADIAL), meshLerp(v0, v1, 1 - t)],
          skin,
        ),
      );
    }
    grid.push(line);
  }

  for (let row = 0; row < HAIR_STRAND_LENGTH; row += 1) {
    for (let column = 0; column < HAIR_STRAND_RADIAL; column += 1) {
      builder.quad(
        grid[row][column],
        grid[row][column + 1],
        grid[row + 1][column + 1],
        grid[row + 1][column],
      );
    }
  }

  const top = builder.vertex(place([0, 1, 0]), [meshLerp(u0, u1, 0.5), v1], skin);
  const bottom = builder.vertex(place([0, -1, 0]), [meshLerp(u0, u1, 0.5), v0], skin);
  for (let column = 0; column < HAIR_STRAND_RADIAL; column += 1) {
    builder.triangle(top, grid[0][column], grid[0][column + 1]);
    const last = HAIR_STRAND_LENGTH;
    builder.triangle(bottom, grid[last][column + 1], grid[last][column]);
  }
}

/**
 * 파츠 계획을 **실제 두상에 맞춰** 앉힌다.
 *
 * 조형 패널의 오버레이 렌더러는 알 수 없는 VRM 의 두상을 휴리스틱으로 **추정**하지만, 여기서는
 * 두개골을 직접 만들었으므로 실측을 안다. 그래서 계획을 그대로 두되(파츠 계획은 바이트 동일성
 * 계약이 걸린 공유 자산이다) 굽는 단계에서 두 가지를 바로잡는다:
 *
 *  1. **뿌리 앵커링** — 가닥·뒷머리가 정수리 위로 솟지 않게 내린다. 계획의 길이는 그대로라
 *     롱헤어는 여전히 길게 흐르고, 위로 튀어나온 부분만 사라진다.
 *  2. **앞머리 재적합** — 헤어라인에서 시작해 `fringe` 가 정하는 지점까지만 내려오게 한다.
 *     계획의 앞머리는 턱까지 닿아 얼굴을 덮어 버렸다.
 */
function fitHairPartToSkull(
  part: AvatarForgeHairPart,
  transform: HairTransform,
  head: StudioVrmRigHeadFit,
  fringe: number,
): HairTransform {
  if (part.role === "cap") return transform;

  if (part.role === "bang") {
    const hairlineY = head.center[1] + 0.62 * head.radiusY;
    const tipY = head.center[1] + head.radiusY * (0.3 - 0.8 * meshClamp(fringe, 0, 1.4));
    const halfY = Math.max(0.04 * head.radiusY, (hairlineY - tipY) / 2);
    return {
      ...transform,
      translation: [transform.translation[0], (hairlineY + tipY) / 2, transform.translation[2]],
      scale: [transform.scale[0], halfY, transform.scale[2]],
    };
  }

  // 먼저 머리 밖으로 밀고, 그 자리에서 다시 뿌리를 내린다. 순서가 중요하다 — 미는 만큼
  // 두개골 표면이 낮아지므로 천장도 같이 내려가야 뿌리가 캡 밑으로 들어간다.
  const pushed = pushOutsideSkull(transform.translation, head);
  // 회전이 작은 파츠들이라 |scale.y| 를 세로 반경으로 봐도 오차가 실루엣에 드러나지 않는다.
  const topY = pushed[1] + Math.abs(transform.scale[1]);
  const ceiling = skullTuckCeiling(pushed, head);
  const translation: MeshVec3 =
    topY <= ceiling ? pushed : [pushed[0], pushed[1] - (topY - ceiling), pushed[2]];

  return { ...transform, translation };
}

/**
 * 파츠가 놓인 **가로 위치에서의 두개골 표면 높이**. 여기에 약간의 여유를 더한 값이 가닥 뿌리의
 * 천장이 된다.
 *
 * 머리 반경만큼 옆으로 민 가닥의 천장을 정수리 높이로 잡으면 두개골이 이미 좁아진 자리에
 * 뿌리가 떠서 **머리 옆에 붙은 기둥 두 개**로 보인다. 옆으로 밀수록 표면이 낮아진다는
 * 타원체 관계를 그대로 쓰면 뿌리가 캡 밑으로 들어가 자연스럽게 흘러내린다.
 */
function skullTuckCeiling(translation: MeshVec3, head: StudioVrmRigHeadFit): number {
  const dx = (translation[0] - head.center[0]) / head.radiusX;
  const dz = (translation[2] - head.center[2]) / head.radiusZ;
  const horizontal = Math.min(1, Math.hypot(dx, dz));
  const surfaceY = head.center[1] + head.radiusY * Math.sqrt(Math.max(0, 1 - horizontal ** 2));
  return surfaceY + 0.12 * head.radiusY;
}

/**
 * 옆·뒷머리를 두개골 표면 밖으로 밀어낸다.
 *
 * 계획의 가로 오프셋은 두개골보다 안쪽이라(옆머리 |x| 0.069 < 두개골 반경 0.092) 머리 속에
 * 파묻히고, 두개골이 좁아지는 정수리·턱 부근에서만 삐져나와 **얼굴 옆 판자 두 장**으로
 * 보인다. 타원체 기준 정규화 거리를 표면 근처까지 끌어올려 머리에 얹는다.
 * 세로(dy)는 건드리지 않는다 — 길이와 흐름은 계획이 정한 그대로 둔다.
 */
function pushOutsideSkull(
  translation: MeshVec3,
  head: StudioVrmRigHeadFit,
  minNormalized = 0.9,
): MeshVec3 {
  const dx = translation[0] - head.center[0];
  const dz = translation[2] - head.center[2];
  const normalized = Math.hypot(dx / head.radiusX, dz / head.radiusZ);
  // 정수리 한가운데 파츠(번·삐침머리)는 밀 방향이 없다 — 그대로 둔다.
  if (normalized >= minNormalized || normalized < 0.05) return translation;
  const gain = minNormalized / normalized;
  return [head.center[0] + dx * gain, translation[1], head.center[2] + dz * gain];
}

function buildHair(rig: StudioVrmRig, state: AvatarForgeState): SurfaceBuilder | null {
  const parts = buildAvatarForgeHairParts(state);
  if (parts.length === 0) return null;

  const builder = new SurfaceBuilder();
  const skin = only(rig, "head");
  parts.forEach((part, index) => {
    // 파츠마다 세로 띠 하나씩 — 같은 머티리얼을 쓰므로 UV 가 겹치면 안 된다.
    const uvRect: MeshUvRect = [0, index / parts.length, 1, (index + 1) / parts.length];
    const transform = fitHairPartToSkull(
      part,
      hairPartTransform(part, rig.head),
      rig.head,
      state.hair.fringe,
    );
    if (part.primitive === "tapered-capsule") {
      addHairStrand(builder, part, transform, skin, uvRect);
      return;
    }
    if (part.role === "cap") {
      // 앞은 헤어라인에서 끊고 뒤는 목덜미까지 — 대칭 캡은 눈·눈썹까지 덮어 버린다.
      addHairSphere(builder, transform, skin, uvRect, {
        columns: HAIR_CAP_COLUMNS,
        rows: HAIR_CAP_ROWS,
        thetaFront: Math.PI * 0.4,
        thetaBack: Math.PI * 0.82,
      });
      return;
    }
    addHairSphere(builder, transform, skin, uvRect, {
      columns: HAIR_SPHERE_COLUMNS,
      rows: HAIR_SPHERE_ROWS,
      thetaFront: Math.PI,
      thetaBack: Math.PI,
    });
  });
  return builder;
}

/* -------------------------------------------------------------------------- */
/* 의상                                                                        */
/* -------------------------------------------------------------------------- */

/** 상의 — 몸통 실루엣에서 살짝 띄운 셸 + 반소매. */
function buildTops(rig: StudioVrmRig, state: AvatarForgeState): SurfaceBuilder {
  const builder = new SurfaceBuilder();
  const { h, hipsY, shoulderY, waistY, chestY } = torsoAnchors(rig);
  const unit = bodyUnit(rig);
  const shoulder = meshClamp(state.proportions.shoulderWidth, 0.7, 1.4);
  const thickness = 0.007 * unit;

  const profiles: readonly TorsoProfile[] = [
    [hipsY + 0.005 * h, 0.096, 0.077, 2.3],
    [waistY, 0.079, 0.067, 2.3],
    [meshLerp(waistY, chestY, 0.55), 0.091, 0.071, 2.3],
    [chestY, 0.107, 0.077, 2.4],
    [shoulderY - 0.012 * h, 0.117, 0.074, 2.5],
    [shoulderY + 0.028 * h, 0.097, 0.062, 2.4],
    [shoulderY + 0.048 * h, 0.06, 0.05, 2.2],
  ];

  addLoft(
    builder,
    profiles.map(([y, rx, rz, exponent], index) => {
      const lateral = meshLerp(1, shoulder, smoothstep(waistY, shoulderY, y));
      return verticalRing(
        [0, y, 0],
        rx * unit * lateral + thickness,
        rz * unit + thickness,
        torsoSkin(rig, y, h),
        index / (profiles.length - 1),
        exponent,
      );
    }),
    { segments: TORSO_SEGMENTS },
  );

  for (const side of [1, -1] as const) {
    const upper = side > 0 ? "leftUpperArm" : "rightUpperArm";
    const lower = side > 0 ? "leftLowerArm" : "rightLowerArm";
    const shoulderX = rig.worldRest[upper][0];
    const elbowX = rig.worldRest[lower][0];
    const y = rig.worldRest[upper][1];
    const stops: readonly (readonly [x: number, radius: number, skin: MeshSkinBinding])[] = [
      [meshLerp(0, shoulderX, 0.5), 0.036, mix(rig, "spine", upper, 0.3)],
      [shoulderX, 0.035, mix(rig, "spine", upper, 0.82)],
      [meshLerp(shoulderX, elbowX, 0.4), 0.031, only(rig, upper)],
    ];
    addLoft(
      builder,
      stops.map(([x, radius, skin], index) =>
        lateralRing(
          [x, y, 0],
          radius * unit,
          radius * unit * 0.94,
          skin,
          index / (stops.length - 1),
        ),
      ),
      { segments: LIMB_SEGMENTS, uvRect: side > 0 ? UV.armLeft : UV.armRight },
    );
  }

  return builder;
}

/** 하의 — 허리에서 허벅지 중간까지 퍼지는 스커트 셸. 가랑이 위상 없이 실루엣만 만든다. */
function buildBottoms(rig: StudioVrmRig): SurfaceBuilder {
  const builder = new SurfaceBuilder();
  const { h, hipsY, waistY } = torsoAnchors(rig);
  const unit = bodyUnit(rig);
  const thickness = 0.008 * unit;

  const profiles: readonly TorsoProfile[] = [
    [waistY + 0.012 * h, 0.082, 0.07, 2.3],
    [hipsY + 0.025 * h, 0.099, 0.08, 2.3],
    [hipsY - 0.045 * h, 0.108, 0.09, 2.2],
    [hipsY - 0.115 * h, 0.115, 0.099, 2.1],
  ];

  addLoft(
    builder,
    profiles.map(([y, rx, rz, exponent], index) =>
      verticalRing(
        [0, y, 0],
        rx * unit + thickness,
        rz * unit + thickness,
        torsoSkin(rig, y, h),
        index / (profiles.length - 1),
        exponent,
      ),
    ),
    { segments: TORSO_SEGMENTS },
  );
  return builder;
}

function buildShoes(rig: StudioVrmRig): SurfaceBuilder {
  const builder = new SurfaceBuilder();
  const outset = 0.004 * bodyUnit(rig);
  buildFoot(builder, rig, 1, UV.footLeft, outset);
  buildFoot(builder, rig, -1, UV.footRight, outset);
  return builder;
}

/* -------------------------------------------------------------------------- */
/* 조립                                                                        */
/* -------------------------------------------------------------------------- */

export type StudioVrmHumanoidMeshPart = {
  readonly nodeName: string;
  readonly meshName: string;
  readonly primitives: readonly StudioVrmExportPrimitive[];
};

export type StudioVrmHumanoidMesh = {
  readonly version: typeof STUDIO_VRM_HUMANOID_MESH_VERSION;
  readonly rig: StudioVrmRig;
  readonly materials: readonly StudioVrmExportMaterial[];
  readonly parts: readonly StudioVrmHumanoidMeshPart[];
  /** `parts` 안에서 표정 모프를 들고 있는 파트의 인덱스. */
  readonly facePartIndex: number;
  readonly morphTargetNames: readonly string[];
};

function primitiveOf(
  builder: SurfaceBuilder,
  material: number,
  targets?: readonly StudioVrmExportMorphTarget[],
): StudioVrmExportPrimitive {
  const built = builder.build();
  return {
    positions: built.positions,
    normals: built.normals,
    uvs: built.uvs,
    joints: built.joints,
    weights: built.weights,
    indices: built.indices,
    material,
    targets,
  };
}

/** 조형 상태 하나를 파트별 스킨드 메시 묶음으로 굽는다. */
export function buildStudioVrmHumanoidMesh(state: AvatarForgeState): StudioVrmHumanoidMesh {
  const rig = buildStudioVrmRig({ proportions: state.proportions, face: state.face });

  const body = new SurfaceBuilder();
  buildTorso(body, rig, state);
  buildHead(body, rig, state);
  buildArm(body, rig, 1, UV.armLeft);
  buildArm(body, rig, -1, UV.armRight);
  buildHand(body, rig, 1, UV.handLeft, UV.thumbLeft);
  buildHand(body, rig, -1, UV.handRight, UV.thumbRight);
  buildLeg(body, rig, 1, UV.legLeft);
  buildLeg(body, rig, -1, UV.legRight);
  buildFoot(body, rig, 1, UV.footLeft);
  buildFoot(body, rig, -1, UV.footRight);

  const face = buildFacePatches(rig);
  const faceGroups: readonly (readonly [FaceGroup, number])[] = [
    ["eyeWhite", STUDIO_VRM_HUMANOID_MATERIALS.eyeWhite],
    ["iris", STUDIO_VRM_HUMANOID_MATERIALS.iris],
    ["brow", STUDIO_VRM_HUMANOID_MATERIALS.brow],
    ["mouth", STUDIO_VRM_HUMANOID_MATERIALS.mouth],
  ];

  const parts: StudioVrmHumanoidMeshPart[] = [
    {
      nodeName: "Body",
      meshName: "Body_Skin",
      primitives: [primitiveOf(body, STUDIO_VRM_HUMANOID_MATERIALS.skin)],
    },
    {
      nodeName: "Face",
      meshName: "Face",
      primitives: faceGroups.map(([group, material]) =>
        primitiveOf(
          face.builders[group],
          material,
          buildFaceMorphTargets(rig, group, face.builders[group], face.patches),
        ),
      ),
    },
  ];
  const facePartIndex = 1;

  const hair = buildHair(rig, state);
  if (hair) {
    parts.push({
      nodeName: "Hair",
      meshName: "Hair",
      primitives: [primitiveOf(hair, STUDIO_VRM_HUMANOID_MATERIALS.hair)],
    });
  }

  parts.push(
    {
      nodeName: "Tops",
      meshName: "Tops",
      primitives: [primitiveOf(buildTops(rig, state), STUDIO_VRM_HUMANOID_MATERIALS.tops)],
    },
    {
      nodeName: "Bottoms",
      meshName: "Bottoms",
      primitives: [primitiveOf(buildBottoms(rig), STUDIO_VRM_HUMANOID_MATERIALS.bottoms)],
    },
    {
      nodeName: "Shoes",
      meshName: "Shoes",
      primitives: [primitiveOf(buildShoes(rig), STUDIO_VRM_HUMANOID_MATERIALS.shoes)],
    },
  );

  return {
    version: STUDIO_VRM_HUMANOID_MESH_VERSION,
    rig,
    materials: buildMaterials(state),
    parts,
    facePartIndex,
    morphTargetNames: STUDIO_VRM_HUMANOID_MORPH_TARGET_NAMES,
  };
}
