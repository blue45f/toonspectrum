import type { BgPrimitiveKind } from "../studio-background-3d-metadata";

export type StudioBg3dCinematicAssetCategory = "character" | "scene" | "prop";

type Vec3 = readonly [number, number, number];

export interface StudioBg3dCinematicPartBlueprint {
  readonly id: string;
  readonly name: string;
  readonly kind: BgPrimitiveKind;
  readonly offset: Vec3;
  readonly rotation: Vec3;
  readonly scale: Vec3;
  readonly color: string;
}

export interface StudioBg3dCinematicAssetBlueprint {
  readonly id: string;
  readonly category: StudioBg3dCinematicAssetCategory;
  readonly label: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly bounds: {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
  };
  readonly parts: readonly StudioBg3dCinematicPartBlueprint[];
}

function freezeVec3(value: Vec3): Vec3 {
  return Object.freeze([...value]) as Vec3;
}

function part(
  id: string,
  name: string,
  kind: BgPrimitiveKind,
  offset: Vec3,
  scale: Vec3,
  color: string,
  rotation: Vec3 = [0, 0, 0],
): StudioBg3dCinematicPartBlueprint {
  return Object.freeze({
    id,
    name,
    kind,
    offset: freezeVec3(offset),
    rotation: freezeVec3(rotation),
    scale: freezeVec3(scale),
    color,
  });
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

/** Aligns a primitive whose authored long axis is +Y to a world-space segment. */
function segmentRotation(start: Vec3, end: Vec3): Vec3 {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(length) || length <= 1e-6) {
    throw new Error("Cinematic 3D segment endpoints must be distinct and finite.");
  }
  const pitch = Math.asin(Math.max(-1, Math.min(1, dz / length)));
  const roll = Math.atan2(-dx, dy);
  return [pitch, 0, roll];
}

function segment(
  id: string,
  name: string,
  start: Vec3,
  end: Vec3,
  diameter: number,
  color: string,
  kind: Extract<BgPrimitiveKind, "cylinder" | "capsule" | "tube"> = "cylinder",
): StudioBg3dCinematicPartBlueprint {
  return part(
    id,
    name,
    kind,
    midpoint(start, end),
    [diameter, distance(start, end), diameter],
    color,
    segmentRotation(start, end),
  );
}

function asset(
  input: StudioBg3dCinematicAssetBlueprint,
): StudioBg3dCinematicAssetBlueprint {
  return Object.freeze({
    ...input,
    tags: Object.freeze([...input.tags]),
    bounds: Object.freeze({ ...input.bounds }),
    parts: Object.freeze([...input.parts]),
  });
}

interface CharacterPose {
  readonly head: Vec3;
  readonly shoulderLeft: Vec3;
  readonly elbowLeft: Vec3;
  readonly handLeft: Vec3;
  readonly shoulderRight: Vec3;
  readonly elbowRight: Vec3;
  readonly handRight: Vec3;
  readonly hipLeft: Vec3;
  readonly kneeLeft: Vec3;
  readonly footLeft: Vec3;
  readonly hipRight: Vec3;
  readonly kneeRight: Vec3;
  readonly footRight: Vec3;
}

interface CharacterPalette {
  readonly skin: string;
  readonly hair: string;
  readonly top: string;
  readonly bottom: string;
  readonly accent: string;
}

interface CharacterBuildOptions {
  readonly pose: CharacterPose;
  readonly palette: CharacterPalette;
  readonly headScale?: Vec3;
  readonly torsoDepth?: number;
  readonly torsoRotation?: Vec3;
  readonly hairRotation?: Vec3;
  readonly limbDiameter?: number;
  readonly extras?: readonly StudioBg3dCinematicPartBlueprint[];
}

function characterParts(
  options: CharacterBuildOptions,
): readonly StudioBg3dCinematicPartBlueprint[] {
  const { pose, palette } = options;
  const shoulderCenter = midpoint(pose.shoulderLeft, pose.shoulderRight);
  const hipCenter = midpoint(pose.hipLeft, pose.hipRight);
  const torsoCenter = midpoint(shoulderCenter, hipCenter);
  const torsoWidth = distance(pose.shoulderLeft, pose.shoulderRight) * 1.08;
  const torsoHeight = Math.max(0.28, distance(shoulderCenter, hipCenter) * 1.04);
  const hipWidth = distance(pose.hipLeft, pose.hipRight);
  const torsoDepth = options.torsoDepth ?? 0.34;
  const torsoRotation: Vec3 = options.torsoRotation ?? [0, 0, 0];
  const headScale: Vec3 = options.headScale ?? [0.42, 0.48, 0.42];
  const hairRotation: Vec3 = options.hairRotation ?? [0, 0, 0];
  const limbDiameter = options.limbDiameter ?? 0.15;
  const neckBase: Vec3 = [
    shoulderCenter[0],
    shoulderCenter[1] + 0.015,
    shoulderCenter[2],
  ];
  const neckTop: Vec3 = [
    pose.head[0],
    pose.head[1] - headScale[1] * 0.53,
    pose.head[2],
  ];

  return Object.freeze([
    part(
      "torso",
      "몸통",
      "box",
      torsoCenter,
      [torsoWidth, torsoHeight, torsoDepth],
      palette.top,
      torsoRotation,
    ),
    part(
      "pelvis",
      "골반",
      "box",
      hipCenter,
      [hipWidth * 1.3, Math.max(0.18, torsoHeight * 0.3), torsoDepth * 1.02],
      palette.bottom,
      torsoRotation,
    ),
    segment("neck", "목", neckBase, neckTop, limbDiameter * 0.72, palette.skin),
    part("head", "머리", "sphere", pose.head, headScale, palette.skin),
    part(
      "hair",
      "헤어 실루엣",
      "hemisphere",
      [pose.head[0], pose.head[1] + headScale[1] * 0.19, pose.head[2] - 0.01],
      [headScale[0] * 1.07, headScale[1] * 0.62, headScale[2] * 1.07],
      palette.hair,
      hairRotation,
    ),
    segment(
      "upper-arm-left",
      "왼쪽 위팔",
      pose.shoulderLeft,
      pose.elbowLeft,
      limbDiameter,
      palette.top,
    ),
    segment(
      "forearm-left",
      "왼쪽 아래팔",
      pose.elbowLeft,
      pose.handLeft,
      limbDiameter * 0.88,
      palette.skin,
    ),
    segment(
      "upper-arm-right",
      "오른쪽 위팔",
      pose.shoulderRight,
      pose.elbowRight,
      limbDiameter,
      palette.top,
    ),
    segment(
      "forearm-right",
      "오른쪽 아래팔",
      pose.elbowRight,
      pose.handRight,
      limbDiameter * 0.88,
      palette.skin,
    ),
    segment(
      "thigh-left",
      "왼쪽 허벅지",
      pose.hipLeft,
      pose.kneeLeft,
      limbDiameter * 1.18,
      palette.bottom,
    ),
    segment(
      "shin-left",
      "왼쪽 종아리",
      pose.kneeLeft,
      pose.footLeft,
      limbDiameter,
      palette.accent,
    ),
    segment(
      "thigh-right",
      "오른쪽 허벅지",
      pose.hipRight,
      pose.kneeRight,
      limbDiameter * 1.18,
      palette.bottom,
    ),
    segment(
      "shin-right",
      "오른쪽 종아리",
      pose.kneeRight,
      pose.footRight,
      limbDiameter,
      palette.accent,
    ),
    ...(options.extras ?? []),
  ]);
}

const CHARACTER_ASSETS = Object.freeze([
  asset({
    id: "ts3d-character-neutral-hero-v1",
    category: "character",
    label: "중립 포즈 히어로",
    description: "정면 비례 확인과 의상 스케치에 적합한 13파츠 성인 포즈 마네킹",
    tags: ["character", "hero", "neutral", "pose", "캐릭터", "히어로", "정면", "포즈"],
    bounds: { width: 1.1, height: 2.2, depth: 0.8 },
    parts: characterParts({
      palette: {
        skin: "#d9a47d",
        hair: "#2e2528",
        top: "#2f6fb0",
        bottom: "#273a58",
        accent: "#403733",
      },
      pose: {
        head: [0, 1.93, 0],
        shoulderLeft: [-0.36, 1.53, 0],
        elbowLeft: [-0.48, 1.13, 0.02],
        handLeft: [-0.46, 0.78, 0.03],
        shoulderRight: [0.36, 1.53, 0],
        elbowRight: [0.48, 1.13, 0.02],
        handRight: [0.46, 0.78, 0.03],
        hipLeft: [-0.22, 0.89, 0],
        kneeLeft: [-0.2, 0.48, 0],
        footLeft: [-0.22, 0.08, 0.08],
        hipRight: [0.22, 0.89, 0],
        kneeRight: [0.2, 0.48, 0],
        footRight: [0.22, 0.08, 0.08],
      },
      extras: [
        part("belt", "벨트", "box", [0, 0.9, 0], [0.56, 0.08, 0.37], "#d9ad45"),
      ],
    }),
  }),
  asset({
    id: "ts3d-character-heroine-pose-v1",
    category: "character",
    label: "콘트라포스토 히로인",
    description: "한 손을 허리에 두고 중심축을 비튼 자연스러운 전신 여성 포즈",
    tags: ["character", "heroine", "contrapposto", "fashion", "캐릭터", "히로인", "여성", "패션"],
    bounds: { width: 1.15, height: 2.15, depth: 0.8 },
    parts: characterParts({
      palette: {
        skin: "#efbd99",
        hair: "#402a26",
        top: "#9d4f78",
        bottom: "#40345f",
        accent: "#6f4d72",
      },
      pose: {
        head: [0.02, 1.91, 0],
        shoulderLeft: [-0.33, 1.5, 0],
        elbowLeft: [-0.5, 1.22, 0.03],
        handLeft: [-0.27, 0.98, 0.08],
        shoulderRight: [0.33, 1.5, 0],
        elbowRight: [0.45, 1.22, 0.02],
        handRight: [0.5, 0.88, 0.04],
        hipLeft: [-0.2, 0.88, 0],
        kneeLeft: [-0.08, 0.46, 0.02],
        footLeft: [-0.18, 0.08, 0.1],
        hipRight: [0.22, 0.9, -0.02],
        kneeRight: [0.27, 0.48, -0.05],
        footRight: [0.33, 0.08, -0.08],
      },
      torsoRotation: [0, -0.08, 0.05],
      extras: [
        part("skirt", "스커트", "cone", [0.01, 0.82, 0], [0.66, 0.62, 0.66], "#57436e"),
      ],
    }),
  }),
  asset({
    id: "ts3d-character-broad-hero-v1",
    category: "character",
    label: "브로드 숄더 히어로",
    description: "넓은 어깨와 허리에 얹은 팔로 자신감을 강조한 액션 주인공 체형",
    tags: ["character", "hero", "broad shoulder", "action", "캐릭터", "남성", "근육", "액션"],
    bounds: { width: 1.35, height: 2.25, depth: 0.85 },
    parts: characterParts({
      palette: {
        skin: "#b97855",
        hair: "#211d21",
        top: "#7d2637",
        bottom: "#252c38",
        accent: "#242224",
      },
      pose: {
        head: [0, 2.0, 0],
        shoulderLeft: [-0.47, 1.58, 0],
        elbowLeft: [-0.62, 1.28, 0.02],
        handLeft: [-0.33, 1.0, 0.09],
        shoulderRight: [0.47, 1.58, 0],
        elbowRight: [0.62, 1.28, 0.02],
        handRight: [0.33, 1.0, 0.09],
        hipLeft: [-0.25, 0.92, 0],
        kneeLeft: [-0.27, 0.5, 0],
        footLeft: [-0.34, 0.08, 0.12],
        hipRight: [0.25, 0.92, 0],
        kneeRight: [0.27, 0.5, 0],
        footRight: [0.34, 0.08, 0.12],
      },
      headScale: [0.44, 0.48, 0.44],
      torsoDepth: 0.4,
      limbDiameter: 0.18,
      extras: [
        part("chest-plate", "가슴 플레이트", "box", [0, 1.38, 0.2], [0.7, 0.34, 0.08], "#d8b454"),
      ],
    }),
  }),
  asset({
    id: "ts3d-character-seated-reader-v1",
    category: "character",
    label: "앉아서 읽는 인물",
    description: "책과 의자를 포함해 대화·카페·교실 컷에 바로 배치하는 독서 포즈",
    tags: ["character", "seated", "reader", "book", "캐릭터", "앉기", "독서", "책"],
    bounds: { width: 1.05, height: 1.8, depth: 1.2 },
    parts: characterParts({
      palette: {
        skin: "#e0ae88",
        hair: "#5a3828",
        top: "#507a6a",
        bottom: "#3d4957",
        accent: "#3a332e",
      },
      pose: {
        head: [0, 1.56, 0.08],
        shoulderLeft: [-0.32, 1.2, 0.08],
        elbowLeft: [-0.3, 0.96, 0.2],
        handLeft: [-0.18, 0.84, 0.34],
        shoulderRight: [0.32, 1.2, 0.08],
        elbowRight: [0.3, 0.96, 0.2],
        handRight: [0.18, 0.84, 0.34],
        hipLeft: [-0.21, 0.7, 0],
        kneeLeft: [-0.28, 0.49, 0.46],
        footLeft: [-0.28, 0.08, 0.58],
        hipRight: [0.21, 0.7, 0],
        kneeRight: [0.28, 0.49, 0.46],
        footRight: [0.28, 0.08, 0.58],
      },
      torsoRotation: [0.14, 0, 0],
      extras: [
        part("book", "펼친 책", "box", [0, 0.83, 0.38], [0.48, 0.05, 0.32], "#d8c78c", [-0.12, 0, 0]),
        part("seat", "의자 좌판", "box", [0, 0.57, -0.05], [0.72, 0.1, 0.66], "#79573f"),
        part("seat-back", "의자 등받이", "box", [0, 0.92, -0.34], [0.72, 0.66, 0.1], "#6b4935"),
      ],
    }),
  }),
  asset({
    id: "ts3d-character-running-v1",
    category: "character",
    label: "달리는 인물",
    description: "몸통 전경사와 교차 팔다리로 속도감 있는 달리기 실루엣을 제공",
    tags: ["character", "running", "motion", "action", "캐릭터", "달리기", "동작", "액션"],
    bounds: { width: 1.15, height: 2.05, depth: 1.55 },
    parts: characterParts({
      palette: {
        skin: "#d69a73",
        hair: "#1f252d",
        top: "#e06a36",
        bottom: "#293d58",
        accent: "#1f2935",
      },
      pose: {
        head: [0, 1.86, 0.12],
        shoulderLeft: [-0.34, 1.47, 0.04],
        elbowLeft: [-0.52, 1.24, -0.18],
        handLeft: [-0.22, 1.1, -0.32],
        shoulderRight: [0.34, 1.47, 0.04],
        elbowRight: [0.49, 1.22, 0.23],
        handRight: [0.18, 1.02, 0.38],
        hipLeft: [-0.2, 0.86, 0],
        kneeLeft: [-0.12, 0.44, 0.4],
        footLeft: [-0.05, 0.08, 0.76],
        hipRight: [0.2, 0.86, 0],
        kneeRight: [0.28, 0.5, -0.24],
        footRight: [0.37, 0.12, -0.58],
      },
      torsoRotation: [-0.2, 0, 0],
      extras: [
        part("coat-tail", "재킷 자락", "triangularPrism", [0, 1.1, -0.3], [0.5, 0.62, 0.12], "#bd4e2a", [-0.18, 0, 0]),
      ],
    }),
  }),
  asset({
    id: "ts3d-character-action-punch-v1",
    category: "character",
    label: "전방 펀치 액션",
    description: "한 팔을 카메라 쪽으로 뻗고 반대팔을 가드한 원근 강조 전투 포즈",
    tags: ["character", "punch", "fight", "foreshortening", "캐릭터", "펀치", "전투", "원근"],
    bounds: { width: 1.4, height: 2.1, depth: 1.8 },
    parts: characterParts({
      palette: {
        skin: "#c8845f",
        hair: "#2d2020",
        top: "#324a78",
        bottom: "#222936",
        accent: "#6e2525",
      },
      pose: {
        head: [0, 1.91, 0.06],
        shoulderLeft: [-0.37, 1.5, 0],
        elbowLeft: [-0.2, 1.34, 0.45],
        handLeft: [-0.06, 1.29, 0.98],
        shoulderRight: [0.37, 1.5, 0],
        elbowRight: [0.52, 1.32, 0.18],
        handRight: [0.25, 1.48, 0.36],
        hipLeft: [-0.22, 0.88, 0],
        kneeLeft: [-0.36, 0.48, 0.22],
        footLeft: [-0.5, 0.08, 0.42],
        hipRight: [0.22, 0.88, 0],
        kneeRight: [0.34, 0.49, -0.2],
        footRight: [0.48, 0.08, -0.36],
      },
      torsoRotation: [-0.08, -0.16, -0.04],
      extras: [
        part("glove", "전방 글러브", "sphere", [-0.06, 1.29, 1.03], [0.24, 0.2, 0.24], "#9d3030"),
      ],
    }),
  }),
  asset({
    id: "ts3d-character-fantasy-ranger-v1",
    category: "character",
    label: "판타지 레인저",
    description: "망토와 장봉을 결합한 탐험·경계 자세의 판타지 캐릭터 실루엣",
    tags: ["character", "ranger", "fantasy", "staff", "캐릭터", "레인저", "판타지", "장봉"],
    bounds: { width: 1.45, height: 2.25, depth: 1.0 },
    parts: characterParts({
      palette: {
        skin: "#c8946f",
        hair: "#553822",
        top: "#385f47",
        bottom: "#4a4035",
        accent: "#332d28",
      },
      pose: {
        head: [-0.02, 1.94, 0],
        shoulderLeft: [-0.36, 1.52, 0],
        elbowLeft: [-0.52, 1.24, 0.08],
        handLeft: [-0.42, 0.96, 0.2],
        shoulderRight: [0.36, 1.52, 0],
        elbowRight: [0.48, 1.22, 0.12],
        handRight: [0.5, 0.94, 0.18],
        hipLeft: [-0.22, 0.88, 0],
        kneeLeft: [-0.3, 0.47, 0.13],
        footLeft: [-0.38, 0.08, 0.23],
        hipRight: [0.22, 0.88, 0],
        kneeRight: [0.3, 0.48, -0.08],
        footRight: [0.38, 0.08, -0.15],
      },
      extras: [
        segment("staff", "장봉", [0.56, 0.08, 0.2], [0.52, 2.12, 0.17], 0.06, "#7a542f"),
        part("cape", "망토", "triangularPrism", [0, 1.2, -0.25], [0.72, 1.18, 0.16], "#6b3142", [-0.06, 0, 0]),
      ],
    }),
  }),
  asset({
    id: "ts3d-character-school-child-v1",
    category: "character",
    label: "등교하는 어린이",
    description: "큰 머리 비율과 백팩을 적용한 교실·가족 장면용 아동 캐릭터",
    tags: ["character", "child", "school", "backpack", "캐릭터", "어린이", "학교", "백팩"],
    bounds: { width: 0.95, height: 1.7, depth: 0.9 },
    parts: characterParts({
      palette: {
        skin: "#efbb91",
        hair: "#3b2b25",
        top: "#e0b548",
        bottom: "#35577a",
        accent: "#5b4132",
      },
      pose: {
        head: [0, 1.48, 0],
        shoulderLeft: [-0.28, 1.13, 0],
        elbowLeft: [-0.36, 0.88, 0.04],
        handLeft: [-0.34, 0.64, 0.06],
        shoulderRight: [0.28, 1.13, 0],
        elbowRight: [0.36, 0.88, 0.04],
        handRight: [0.34, 0.64, 0.06],
        hipLeft: [-0.17, 0.66, 0],
        kneeLeft: [-0.18, 0.36, 0.02],
        footLeft: [-0.2, 0.07, 0.1],
        hipRight: [0.17, 0.66, 0],
        kneeRight: [0.18, 0.36, 0.02],
        footRight: [0.2, 0.07, 0.1],
      },
      headScale: [0.43, 0.46, 0.43],
      torsoDepth: 0.29,
      limbDiameter: 0.12,
      extras: [
        part("backpack", "백팩", "box", [0, 0.95, -0.23], [0.46, 0.5, 0.22], "#c64c4f"),
      ],
    }),
  }),
]);

const SCENE_ASSETS = Object.freeze([
  asset({
    id: "ts3d-scene-studio-apartment-v1",
    category: "scene",
    label: "모던 스튜디오 아파트",
    description: "창가 소파·테이블·플로어 램프까지 한 번에 배치하는 생활 공간 세트",
    tags: ["scene", "apartment", "interior", "living room", "배경", "아파트", "실내", "거실"],
    bounds: { width: 6.2, height: 3.0, depth: 5.2 },
    parts: [
      part("floor", "바닥", "box", [0, -0.08, 0], [6.2, 0.16, 5.2], "#b89d7a"),
      part("back-wall", "뒷벽", "box", [0, 1.45, -2.55], [6.2, 2.9, 0.1], "#ddd8cf"),
      part("side-wall", "측면 벽", "box", [-3.05, 1.45, 0], [0.1, 2.9, 5.2], "#d2cec7"),
      part("window-glass", "창 유리", "box", [-1.5, 1.65, -2.48], [2.2, 1.45, 0.035], "#a9d4df"),
      part("frame-left", "왼 창틀", "box", [-2.56, 1.65, -2.43], [0.11, 1.62, 0.08], "#545a60"),
      part("frame-right", "오른 창틀", "box", [-0.44, 1.65, -2.43], [0.11, 1.62, 0.08], "#545a60"),
      part("frame-top", "위 창틀", "box", [-1.5, 2.4, -2.43], [2.22, 0.11, 0.08], "#545a60"),
      part("frame-bottom", "아래 창틀", "box", [-1.5, 0.9, -2.43], [2.22, 0.11, 0.08], "#545a60"),
      part("sofa-base", "소파 베이스", "box", [1.05, 0.34, -1.55], [2.3, 0.36, 0.86], "#456e72"),
      part("sofa-back", "소파 등받이", "box", [1.05, 0.82, -1.9], [2.3, 0.74, 0.18], "#4f7f80"),
      part("sofa-arm-left", "왼 팔걸이", "box", [-0.03, 0.57, -1.55], [0.18, 0.56, 0.86], "#385b61"),
      part("sofa-arm-right", "오른 팔걸이", "box", [2.13, 0.57, -1.55], [0.18, 0.56, 0.86], "#385b61"),
      part("table-top", "테이블 상판", "cylinder", [0.7, 0.45, 0.25], [1.25, 0.12, 1.25], "#a66b42"),
      part("table-base", "테이블 받침", "cylinder", [0.7, 0.22, 0.25], [0.22, 0.44, 0.22], "#565d65"),
      part("lamp-post", "램프 기둥", "cylinder", [2.5, 0.9, -0.25], [0.1, 1.8, 0.1], "#4d5359"),
      part("lamp-shade", "램프 갓", "cone", [2.5, 1.88, -0.25], [0.65, 0.55, 0.65], "#e2bd72"),
    ],
  }),
  asset({
    id: "ts3d-scene-classroom-corner-v1",
    category: "scene",
    label: "교실 코너 세트",
    description: "칠판·교탁·학생 책상 4조를 포함한 웹툰 학교 장면 기본 배경",
    tags: ["scene", "classroom", "school", "desks", "배경", "교실", "학교", "책상"],
    bounds: { width: 7.0, height: 3.1, depth: 5.6 },
    parts: [
      part("floor", "교실 바닥", "box", [0, -0.07, 0], [7, 0.14, 5.6], "#b48a5d"),
      part("back-wall", "칠판 벽", "box", [0, 1.5, -2.75], [7, 3, 0.1], "#e3dfd4"),
      part("side-wall", "창가 벽", "box", [-3.45, 1.5, 0], [0.1, 3, 5.6], "#d8d5cc"),
      part("blackboard", "칠판", "box", [0.55, 1.75, -2.65], [3.8, 1.25, 0.08], "#315448"),
      part("teacher-desk", "교탁", "box", [0.55, 0.52, -1.65], [1.5, 1.04, 0.68], "#8a633f"),
      part("teacher-top", "교탁 상판", "box", [0.55, 1.07, -1.65], [1.65, 0.1, 0.82], "#a7794a"),
      part("desk-front-left", "앞 왼쪽 책상", "box", [-1.65, 0.65, -0.25], [1.15, 0.12, 0.75], "#b17a43"),
      part("chair-front-left", "앞 왼쪽 의자", "box", [-1.65, 0.44, 0.48], [0.72, 0.78, 0.12], "#6b7c85"),
      part("desk-front-right", "앞 오른쪽 책상", "box", [1.55, 0.65, -0.25], [1.15, 0.12, 0.75], "#b17a43"),
      part("chair-front-right", "앞 오른쪽 의자", "box", [1.55, 0.44, 0.48], [0.72, 0.78, 0.12], "#6b7c85"),
      part("desk-back-left", "뒤 왼쪽 책상", "box", [-1.65, 0.65, 1.55], [1.15, 0.12, 0.75], "#b17a43"),
      part("chair-back-left", "뒤 왼쪽 의자", "box", [-1.65, 0.44, 2.28], [0.72, 0.78, 0.12], "#6b7c85"),
      part("desk-back-right", "뒤 오른쪽 책상", "box", [1.55, 0.65, 1.55], [1.15, 0.12, 0.75], "#b17a43"),
      part("chair-back-right", "뒤 오른쪽 의자", "box", [1.55, 0.44, 2.28], [0.72, 0.78, 0.12], "#6b7c85"),
      part("window", "교실 창", "box", [-3.35, 1.75, 0.55], [0.05, 1.45, 2.7], "#9fd0dd"),
      part("clock", "벽시계", "cylinder", [2.82, 2.25, -2.58], [0.42, 0.08, 0.42], "#f0e8d4", [Math.PI / 2, 0, 0]),
    ],
  }),
  asset({
    id: "ts3d-scene-cafe-counter-v1",
    category: "scene",
    label: "카페 카운터 세트",
    description: "진열장·메뉴보드·바 스툴·펜던트 조명을 갖춘 상업 공간 배경",
    tags: ["scene", "cafe", "counter", "commercial", "배경", "카페", "카운터", "매장"],
    bounds: { width: 6.4, height: 3.2, depth: 4.8 },
    parts: [
      part("floor", "카페 바닥", "box", [0, -0.07, 0], [6.4, 0.14, 4.8], "#6f6258"),
      part("back-wall", "카페 뒷벽", "box", [0, 1.55, -2.35], [6.4, 3.1, 0.1], "#d7cfbf"),
      part("side-wall", "카페 측벽", "box", [-3.15, 1.55, 0], [0.1, 3.1, 4.8], "#c8c0b2"),
      part("counter-base", "카운터 하부", "box", [0.55, 0.52, -0.55], [3.9, 1.04, 0.86], "#3f5957"),
      part("counter-top", "카운터 상판", "box", [0.55, 1.08, -0.55], [4.15, 0.12, 1.0], "#9b6f45"),
      part("display-case", "디저트 진열장", "box", [-1.7, 1.45, -0.62], [1.15, 0.74, 0.72], "#a9d2d6"),
      part("shelf-low", "아래 선반", "box", [1.35, 0.85, -2.2], [2.5, 0.1, 0.42], "#8b613d"),
      part("shelf-mid", "중간 선반", "box", [1.35, 1.42, -2.2], [2.5, 0.1, 0.42], "#8b613d"),
      part("shelf-high", "위 선반", "box", [1.35, 1.99, -2.2], [2.5, 0.1, 0.42], "#8b613d"),
      part("stool-left-seat", "왼 스툴 좌판", "cylinder", [-0.35, 0.72, 0.65], [0.58, 0.12, 0.58], "#b75b47"),
      part("stool-left-post", "왼 스툴 기둥", "cylinder", [-0.35, 0.36, 0.65], [0.1, 0.7, 0.1], "#4b5055"),
      part("stool-right-seat", "오른 스툴 좌판", "cylinder", [1.35, 0.72, 0.65], [0.58, 0.12, 0.58], "#b75b47"),
      part("stool-right-post", "오른 스툴 기둥", "cylinder", [1.35, 0.36, 0.65], [0.1, 0.7, 0.1], "#4b5055"),
      part("pendant-left", "왼 펜던트", "cone", [-0.55, 2.52, -0.5], [0.55, 0.48, 0.55], "#d6a741"),
      part("pendant-right", "오른 펜던트", "cone", [1.65, 2.52, -0.5], [0.55, 0.48, 0.55], "#d6a741"),
      part("menu-board", "메뉴보드", "box", [-1.6, 2.16, -2.23], [1.55, 0.76, 0.08], "#293b37"),
    ],
  }),
  asset({
    id: "ts3d-scene-subway-platform-v1",
    category: "scene",
    label: "지하철 승강장 베이",
    description: "선로·안전선·벤치·안내판·자판기를 묶은 도시 교통 배경 모듈",
    tags: ["scene", "subway", "platform", "urban", "배경", "지하철", "승강장", "도시"],
    bounds: { width: 7.2, height: 3.3, depth: 6.4 },
    parts: [
      part("platform", "승강장 바닥", "box", [0, 0, 0.65], [7.2, 0.18, 5.1], "#898989"),
      part("track", "선로 공간", "box", [0, -0.3, -2.6], [7.2, 0.22, 1.25], "#292d31"),
      part("back-wall", "역사 벽", "box", [0, 1.55, 3.15], [7.2, 3.1, 0.1], "#c7c9c7"),
      part("safety-line", "안전선", "box", [0, 0.11, -1.72], [7.2, 0.025, 0.18], "#e1bd37"),
      part("column-left", "왼 기둥", "box", [-2.55, 1.5, 1.45], [0.42, 3, 0.42], "#6d777b"),
      part("column-right", "오른 기둥", "box", [2.55, 1.5, 1.45], [0.42, 3, 0.42], "#6d777b"),
      part("bench-seat", "벤치 좌판", "box", [-0.3, 0.52, 2.1], [2.4, 0.12, 0.56], "#477b91"),
      part("bench-back", "벤치 등받이", "box", [-0.3, 0.9, 2.34], [2.4, 0.58, 0.1], "#3d687b"),
      part("bench-leg-left", "벤치 왼 받침", "box", [-1.08, 0.25, 2.1], [0.12, 0.5, 0.4], "#4c5257"),
      part("bench-leg-right", "벤치 오른 받침", "box", [0.48, 0.25, 2.1], [0.12, 0.5, 0.4], "#4c5257"),
      part("sign-post", "안내판 기둥", "box", [1.5, 1.72, 2.72], [0.09, 2.7, 0.09], "#50575d"),
      part("sign", "역명 안내판", "box", [1.5, 2.28, 2.66], [1.6, 0.42, 0.1], "#3979a8"),
      part("vending-body", "자판기 본체", "box", [2.65, 0.93, 2.68], [0.78, 1.86, 0.58], "#d9e2e4"),
      part("vending-screen", "자판기 화면", "box", [2.65, 1.25, 2.36], [0.56, 0.82, 0.06], "#55a8bc"),
      part("light-left", "왼 천장등", "box", [-1.75, 3.02, 0.5], [2.1, 0.08, 0.34], "#e8f1ef"),
      part("light-right", "오른 천장등", "box", [1.75, 3.02, 0.5], [2.1, 0.08, 0.34], "#e8f1ef"),
    ],
  }),
  asset({
    id: "ts3d-scene-urban-rooftop-v1",
    category: "scene",
    label: "도심 옥상 세트",
    description: "난간·옥탑문·실외기·물탱크·안테나가 있는 드라마용 옥상 배경",
    tags: ["scene", "rooftop", "city", "drama", "배경", "옥상", "도시", "드라마"],
    bounds: { width: 7.4, height: 3.4, depth: 6.2 },
    parts: [
      part("roof", "옥상 바닥", "box", [0, -0.1, 0], [7.4, 0.2, 6.2], "#777a79"),
      part("parapet-back", "뒤 난간", "box", [0, 0.58, -3.02], [7.4, 1.16, 0.16], "#aaa8a1"),
      part("parapet-front", "앞 난간", "box", [0, 0.58, 3.02], [7.4, 1.16, 0.16], "#aaa8a1"),
      part("parapet-left", "왼 난간", "box", [-3.62, 0.58, 0], [0.16, 1.16, 6.2], "#aaa8a1"),
      part("parapet-right", "오른 난간", "box", [3.62, 0.58, 0], [0.16, 1.16, 6.2], "#aaa8a1"),
      part("access-room", "옥탑 구조물", "box", [-1.85, 1.2, -1.55], [2.2, 2.4, 1.7], "#c4c0b7"),
      part("access-door", "옥탑문", "box", [-1.85, 1.05, -0.66], [0.9, 2.1, 0.08], "#58656b"),
      part("ac-left", "왼 실외기", "box", [0.35, 0.55, -1.75], [1.15, 1.1, 0.82], "#9ca4a5"),
      part("ac-right", "오른 실외기", "box", [1.75, 0.55, -1.75], [1.15, 1.1, 0.82], "#9ca4a5"),
      part("water-tank", "물탱크", "cylinder", [2.35, 1.35, 1.42], [1.45, 1.9, 1.45], "#456c77"),
      part("tank-base", "물탱크 받침", "box", [2.35, 0.25, 1.42], [1.65, 0.5, 1.65], "#555b5e"),
      part("antenna-mast", "안테나 기둥", "cylinder", [-0.25, 1.45, 1.72], [0.08, 2.9, 0.08], "#51565b"),
      part("antenna-dish", "안테나 접시", "torus", [-0.25, 2.3, 1.72], [0.78, 0.18, 0.78], "#c4c8c8", [Math.PI / 2, 0.35, 0]),
      part("pipe-a", "배관 A", "cylinder", [0.35, 0.55, 0.25], [0.12, 1.1, 0.12], "#6a6f71"),
      part("pipe-b", "배관 B", "cylinder", [0.65, 0.38, 0.25], [0.12, 0.76, 0.12], "#6a6f71"),
      part("skylight", "채광창", "box", [-1.0, 0.32, 1.35], [1.65, 0.64, 1.05], "#87aeb5", [0.16, 0, 0]),
    ],
  }),
  asset({
    id: "ts3d-scene-forest-path-v1",
    category: "scene",
    label: "숲길 클러스터",
    description: "레이어 나무·바위·표지판을 배치한 판타지와 일상 공용 자연 배경",
    tags: ["scene", "forest", "path", "nature", "배경", "숲", "산책로", "자연"],
    bounds: { width: 7.2, height: 4.2, depth: 7.0 },
    parts: [
      part("ground", "숲 바닥", "box", [0, -0.08, 0], [7.2, 0.16, 7], "#547151"),
      part("path", "흙길", "box", [0.35, 0.02, 0], [2.1, 0.05, 7], "#9a7654", [0, 0.12, 0]),
      part("tree-a-trunk", "나무 A 줄기", "hexPrism", [-2.35, 0.9, -1.9], [0.42, 1.8, 0.42], "#735039"),
      part("tree-a-canopy", "나무 A 수관", "cone", [-2.35, 2.35, -1.9], [2.1, 2.35, 2.1], "#3e6e47"),
      part("tree-b-trunk", "나무 B 줄기", "hexPrism", [2.5, 0.75, -1.1], [0.36, 1.5, 0.36], "#79533b"),
      part("tree-b-canopy", "나무 B 수관", "cone", [2.5, 2.05, -1.1], [1.8, 2.1, 1.8], "#4a7a4e"),
      part("tree-c-trunk", "나무 C 줄기", "hexPrism", [-2.6, 0.72, 2.0], [0.34, 1.44, 0.34], "#704a35"),
      part("tree-c-canopy", "나무 C 수관", "cone", [-2.6, 1.95, 2.0], [1.7, 1.95, 1.7], "#47754b"),
      part("tree-d-trunk", "나무 D 줄기", "hexPrism", [2.55, 0.68, 2.35], [0.32, 1.36, 0.32], "#785038"),
      part("tree-d-canopy", "나무 D 수관", "cone", [2.55, 1.85, 2.35], [1.6, 1.8, 1.6], "#568355"),
      part("rock-a", "큰 바위", "hexPrism", [-1.75, 0.38, 0.35], [1.05, 0.76, 0.86], "#73766f", [0, 0.25, 0]),
      part("rock-b", "중간 바위", "pyramid", [1.8, 0.3, 0.45], [0.82, 0.6, 0.72], "#84867f", [0, -0.35, 0]),
      part("rock-c", "작은 바위", "hexPrism", [1.45, 0.2, -2.5], [0.55, 0.4, 0.5], "#686b66", [0, 0.48, 0]),
      part("sign-post", "표지판 기둥", "box", [-0.95, 0.8, -2.1], [0.12, 1.6, 0.12], "#6b472c"),
      part("sign-board", "숲길 표지", "box", [-0.95, 1.35, -2.1], [1.0, 0.42, 0.12], "#9a6b3f", [0, 0.18, 0]),
      part("shrine-stone", "길가 석표", "pyramid", [1.55, 0.65, 2.25], [0.72, 1.3, 0.62], "#8a8981"),
    ],
  }),
  asset({
    id: "ts3d-scene-fantasy-ruins-v1",
    category: "scene",
    label: "판타지 유적 관문",
    description: "계단·석주·부서진 문틀·룬 코어로 구성한 모험 장면용 고대 유적",
    tags: ["scene", "fantasy", "ruins", "gate", "배경", "판타지", "유적", "관문"],
    bounds: { width: 6.2, height: 4.1, depth: 5.4 },
    parts: [
      part("ground", "유적 바닥", "box", [0, -0.1, 0], [6.2, 0.2, 5.4], "#625f65"),
      part("step-low", "아래 계단", "box", [0, 0.12, 1.55], [3.8, 0.24, 0.72], "#817c82"),
      part("step-mid", "중간 계단", "box", [0, 0.34, 1.15], [3.4, 0.22, 0.72], "#78737a"),
      part("step-high", "위 계단", "box", [0, 0.55, 0.75], [3.0, 0.2, 0.72], "#706b72"),
      part("column-left", "왼 석주", "hexPrism", [-1.45, 1.85, -0.35], [0.62, 2.6, 0.62], "#8d878c"),
      part("column-right", "오른 석주", "hexPrism", [1.45, 1.85, -0.35], [0.62, 2.6, 0.62], "#8d878c"),
      part("cap-left", "왼 주두", "box", [-1.45, 3.22, -0.35], [0.88, 0.24, 0.88], "#a29ca0"),
      part("cap-right", "오른 주두", "box", [1.45, 3.22, -0.35], [0.88, 0.24, 0.88], "#a29ca0"),
      part("lintel", "관문 인방", "box", [0, 3.45, -0.35], [3.5, 0.46, 0.72], "#948e93"),
      part("broken-a", "부서진 석재 A", "pyramid", [-2.3, 0.45, 0.55], [0.92, 0.9, 0.8], "#777278", [0, 0.32, 0]),
      part("broken-b", "부서진 석재 B", "hexPrism", [2.25, 0.36, 0.85], [0.82, 0.72, 0.72], "#807b80", [0, -0.44, 0]),
      part("broken-c", "부서진 석재 C", "pyramid", [1.95, 0.24, -1.55], [0.58, 0.48, 0.55], "#6d696f", [0, 0.61, 0]),
      part("rune-core", "룬 코어", "sphere", [0, 1.35, -0.42], [0.62, 0.62, 0.62], "#53d5d2"),
      part("rune-pedestal", "룬 받침", "cylinder", [0, 0.82, -0.42], [1.05, 0.34, 1.05], "#514b5b"),
      part("brazier-left", "왼 화로", "cone", [-2.15, 1.0, -0.7], [0.52, 0.9, 0.52], "#db7d35"),
      part("brazier-right", "오른 화로", "cone", [2.15, 1.0, -0.7], [0.52, 0.9, 0.52], "#db7d35"),
    ],
  }),
  asset({
    id: "ts3d-scene-scifi-corridor-v1",
    category: "scene",
    label: "SF 코리도어 베이",
    description: "반복 리브·분할 도어·천장 라이트로 깊이감 있는 우주선 복도 모듈",
    tags: ["scene", "scifi", "corridor", "spaceship", "배경", "SF", "복도", "우주선"],
    bounds: { width: 4.6, height: 3.4, depth: 6.4 },
    parts: [
      part("floor", "복도 바닥", "box", [0, -0.08, 0], [4.6, 0.16, 6.4], "#323a44"),
      part("ceiling", "복도 천장", "box", [0, 3.22, 0], [4.6, 0.16, 6.4], "#252d37"),
      part("wall-left", "왼 벽", "box", [-2.22, 1.58, 0], [0.16, 3.16, 6.4], "#3d4651"),
      part("wall-right", "오른 벽", "box", [2.22, 1.58, 0], [0.16, 3.16, 6.4], "#3d4651"),
      part("rib-left-a", "왼 리브 A", "box", [-2.05, 1.58, -2.2], [0.28, 3.0, 0.24], "#697682"),
      part("rib-right-a", "오른 리브 A", "box", [2.05, 1.58, -2.2], [0.28, 3.0, 0.24], "#697682"),
      part("rib-left-b", "왼 리브 B", "box", [-2.05, 1.58, 0], [0.28, 3.0, 0.24], "#697682"),
      part("rib-right-b", "오른 리브 B", "box", [2.05, 1.58, 0], [0.28, 3.0, 0.24], "#697682"),
      part("rib-left-c", "왼 리브 C", "box", [-2.05, 1.58, 2.2], [0.28, 3.0, 0.24], "#697682"),
      part("rib-right-c", "오른 리브 C", "box", [2.05, 1.58, 2.2], [0.28, 3.0, 0.24], "#697682"),
      part("door-left", "도어 왼 패널", "box", [-0.92, 1.48, -3.1], [1.75, 2.75, 0.1], "#53616e"),
      part("door-right", "도어 오른 패널", "box", [0.92, 1.48, -3.1], [1.75, 2.75, 0.1], "#53616e"),
      part("door-seam", "도어 중앙 라이트", "box", [0, 1.48, -3.03], [0.09, 2.55, 0.05], "#62d8e1"),
      part("light-a", "천장 라이트 A", "box", [0, 3.1, -2.05], [1.7, 0.06, 0.28], "#80e3e5"),
      part("light-b", "천장 라이트 B", "box", [0, 3.1, 0], [1.7, 0.06, 0.28], "#80e3e5"),
      part("light-c", "천장 라이트 C", "box", [0, 3.1, 2.05], [1.7, 0.06, 0.28], "#80e3e5"),
    ],
  }),
]);

const PROP_ASSETS = Object.freeze([
  asset({
    id: "ts3d-prop-cinema-camera-rig-v1",
    category: "prop",
    label: "시네마 카메라 리그",
    description: "렌즈·모니터·마이크·레일·삼각대를 분리 편집하는 촬영 장비 소품",
    tags: ["prop", "camera", "cinema", "tripod", "소품", "카메라", "촬영", "삼각대"],
    bounds: { width: 1.5, height: 1.8, depth: 1.45 },
    parts: [
      part("camera-body", "카메라 바디", "box", [0, 1.35, 0], [0.62, 0.42, 0.52], "#262a2e"),
      part("lens", "렌즈", "cylinder", [0, 1.35, 0.4], [0.38, 0.55, 0.38], "#191c20", [Math.PI / 2, 0, 0]),
      part("monitor", "외장 모니터", "box", [0.35, 1.7, -0.02], [0.55, 0.36, 0.08], "#3b8ea0", [0, -0.2, 0]),
      part("tripod-hub", "삼각대 허브", "sphere", [0, 1.0, 0], [0.24, 0.2, 0.24], "#4d5358"),
      segment("tripod-left", "삼각대 왼 다리", [0, 0.98, 0], [-0.55, 0.05, 0.4], 0.08, "#4f555a"),
      segment("tripod-right", "삼각대 오른 다리", [0, 0.98, 0], [0.55, 0.05, 0.4], 0.08, "#4f555a"),
      segment("tripod-back", "삼각대 뒤 다리", [0, 0.98, 0], [0, 0.05, -0.62], 0.08, "#4f555a"),
      segment("top-handle", "상단 핸들", [-0.18, 1.62, -0.06], [0.18, 1.62, -0.06], 0.08, "#34393e"),
      segment("rail-left", "왼 리그 레일", [-0.23, 1.12, -0.3], [-0.23, 1.12, 0.38], 0.05, "#b45a32"),
      segment("rail-right", "오른 리그 레일", [0.23, 1.12, -0.3], [0.23, 1.12, 0.38], 0.05, "#b45a32"),
      part("microphone", "샷건 마이크", "cylinder", [-0.24, 1.72, 0.02], [0.12, 0.52, 0.12], "#30353a", [Math.PI / 2, 0, 0]),
      part("windscreen", "마이크 윈드스크린", "sphere", [-0.24, 1.72, 0.31], [0.17, 0.14, 0.17], "#4a4d50"),
    ],
  }),
  asset({
    id: "ts3d-prop-vending-machine-v1",
    category: "prop",
    label: "도시형 음료 자판기",
    description: "상품열·결제 패널·배출구를 분리한 거리와 지하철용 자판기",
    tags: ["prop", "vending machine", "drink", "urban", "소품", "자판기", "음료", "도시"],
    bounds: { width: 1.15, height: 2.15, depth: 0.85 },
    parts: [
      part("body", "자판기 본체", "box", [0, 1.02, 0], [1.05, 2.04, 0.72], "#d8dedf"),
      part("front", "전면 패널", "box", [0, 1.08, 0.38], [0.94, 1.86, 0.06], "#eff3f2"),
      part("window", "상품 창", "box", [-0.12, 1.45, 0.43], [0.62, 0.72, 0.05], "#6fb4c3"),
      part("display", "가격 화면", "box", [0.3, 1.63, 0.44], [0.2, 0.16, 0.04], "#72d0c8"),
      part("button-panel", "선택 버튼", "box", [0.3, 1.34, 0.44], [0.19, 0.34, 0.04], "#63717a"),
      part("coin-slot", "동전 투입구", "box", [0.3, 1.05, 0.44], [0.16, 0.08, 0.04], "#32383d"),
      part("delivery", "상품 배출구", "box", [-0.1, 0.4, 0.44], [0.55, 0.28, 0.05], "#343b40"),
      part("row-a", "상품열 A", "box", [-0.28, 1.68, 0.47], [0.13, 0.28, 0.04], "#e4584d"),
      part("row-b", "상품열 B", "box", [-0.1, 1.68, 0.47], [0.13, 0.28, 0.04], "#e6b84a"),
      part("row-c", "상품열 C", "box", [0.08, 1.68, 0.47], [0.13, 0.28, 0.04], "#55a56f"),
      part("foot-left", "왼 받침", "box", [-0.34, 0.03, 0], [0.18, 0.06, 0.52], "#3d4247"),
      part("foot-right", "오른 받침", "box", [0.34, 0.03, 0], [0.18, 0.06, 0.52], "#3d4247"),
    ],
  }),
  asset({
    id: "ts3d-prop-gaming-desk-v1",
    category: "prop",
    label: "크리에이터 게이밍 데스크",
    description: "울트라와이드 모니터·본체·입력장치·체어를 갖춘 방송 작업 공간",
    tags: ["prop", "gaming", "computer", "creator", "소품", "게이밍", "컴퓨터", "방송"],
    bounds: { width: 2.6, height: 1.65, depth: 1.75 },
    parts: [
      part("desk-top", "데스크 상판", "box", [0, 0.78, 0], [2.4, 0.12, 0.8], "#4d3d34"),
      part("desk-leg-left", "왼 책상 다리", "box", [-0.95, 0.39, 0], [0.12, 0.78, 0.62], "#2f353b"),
      part("desk-leg-right", "오른 책상 다리", "box", [0.95, 0.39, 0], [0.12, 0.78, 0.62], "#2f353b"),
      part("monitor-stand", "모니터 스탠드", "box", [0, 1.02, -0.2], [0.12, 0.48, 0.12], "#343a40"),
      part("monitor", "울트라와이드 모니터", "box", [0, 1.34, -0.16], [1.6, 0.62, 0.1], "#4aa3b5", [0, 0, 0.03]),
      part("keyboard", "키보드", "box", [-0.12, 0.87, 0.22], [0.85, 0.05, 0.26], "#31373d", [-0.08, 0, 0]),
      part("mouse", "마우스", "hemisphere", [0.58, 0.89, 0.22], [0.16, 0.08, 0.22], "#d06a42"),
      part("tower", "PC 본체", "box", [0.88, 0.45, -0.12], [0.52, 0.9, 0.62], "#22282e"),
      part("chair-base", "체어 베이스", "cylinder", [0, 0.12, 0.95], [0.75, 0.1, 0.75], "#3c4248"),
      part("chair-post", "체어 기둥", "cylinder", [0, 0.37, 0.95], [0.1, 0.5, 0.1], "#4b5157"),
      part("chair-seat", "체어 좌판", "box", [0, 0.68, 0.95], [0.82, 0.16, 0.72], "#8b3240"),
      part("chair-back", "체어 등받이", "box", [0, 1.12, 1.23], [0.78, 0.9, 0.18], "#6f2937", [-0.1, 0, 0]),
      part("headset", "헤드셋", "torus", [-0.9, 1.02, -0.18], [0.34, 0.13, 0.34], "#d88939", [Math.PI / 2, 0, 0]),
      part("speaker-pair", "스피커 바", "box", [0, 1.0, -0.12], [1.9, 0.12, 0.16], "#252b30"),
    ],
  }),
  asset({
    id: "ts3d-prop-street-food-cart-v1",
    category: "prop",
    label: "야시장 푸드 카트",
    description: "차양·그릴·바퀴·조미료를 갖춘 거리 음식점 이동식 카트",
    tags: ["prop", "food cart", "street", "market", "소품", "푸드카트", "야시장", "거리"],
    bounds: { width: 2.25, height: 2.35, depth: 1.45 },
    parts: [
      part("cart-body", "카트 본체", "box", [0, 0.72, 0], [1.8, 1.12, 1.0], "#4d7771"),
      part("counter", "조리 상판", "box", [0, 1.32, 0], [1.95, 0.12, 1.12], "#b98754"),
      part("wheel-left", "왼 바퀴", "torus", [-0.82, 0.35, 0.28], [0.5, 0.14, 0.5], "#2f3336", [Math.PI / 2, 0, 0]),
      part("wheel-right", "오른 바퀴", "torus", [0.82, 0.35, 0.28], [0.5, 0.14, 0.5], "#2f3336", [Math.PI / 2, 0, 0]),
      part("canopy-post-left", "왼 차양 기둥", "box", [-0.82, 1.78, -0.42], [0.08, 1.0, 0.08], "#54595d"),
      part("canopy-post-right", "오른 차양 기둥", "box", [0.82, 1.78, -0.42], [0.08, 1.0, 0.08], "#54595d"),
      part("canopy", "차양", "triangularPrism", [0, 2.22, -0.1], [2.2, 0.42, 1.38], "#c74f45"),
      part("grill", "그릴", "box", [-0.38, 1.42, 0.05], [0.72, 0.12, 0.55], "#343a3f"),
      part("bottle-a", "소스병 A", "cylinder", [0.35, 1.52, 0.13], [0.12, 0.3, 0.12], "#d34c3f"),
      part("bottle-b", "소스병 B", "cylinder", [0.53, 1.52, 0.13], [0.12, 0.3, 0.12], "#e2b248"),
      part("bottle-c", "소스병 C", "cylinder", [0.71, 1.52, 0.13], [0.12, 0.3, 0.12], "#5b9d56"),
      segment("push-handle", "밀대 손잡이", [0.9, 1.02, -0.22], [1.28, 1.02, -0.22], 0.08, "#555b60"),
      part("lamp", "카트 조명", "sphere", [0, 2.06, -0.46], [0.28, 0.22, 0.28], "#f0d66a"),
    ],
  }),
  asset({
    id: "ts3d-prop-city-bicycle-v1",
    category: "prop",
    label: "시티 바이시클",
    description: "두 바퀴와 프레임·핸들·안장을 실제 비례로 조립한 도시 자전거",
    tags: ["prop", "bicycle", "transport", "city", "소품", "자전거", "교통", "도시"],
    bounds: { width: 1.95, height: 1.25, depth: 0.55 },
    parts: [
      part("wheel-front", "앞바퀴", "torus", [0.72, 0.48, 0], [0.88, 0.11, 0.88], "#25292c", [Math.PI / 2, 0, 0]),
      part("wheel-back", "뒷바퀴", "torus", [-0.72, 0.48, 0], [0.88, 0.11, 0.88], "#25292c", [Math.PI / 2, 0, 0]),
      part("hub-front", "앞 허브", "cylinder", [0.72, 0.48, 0], [0.13, 0.24, 0.13], "#a7adb0", [Math.PI / 2, 0, 0]),
      part("hub-back", "뒤 허브", "cylinder", [-0.72, 0.48, 0], [0.13, 0.24, 0.13], "#a7adb0", [Math.PI / 2, 0, 0]),
      segment("frame-low", "프레임 하단", [-0.62, 0.52, 0], [0.12, 0.52, 0], 0.08, "#3d78a0"),
      segment("frame-seat", "시트 튜브", [0.12, 0.52, 0], [-0.12, 1.02, 0], 0.08, "#3d78a0"),
      segment("frame-top", "프레임 상단", [-0.12, 1.02, 0], [0.48, 0.92, 0], 0.08, "#3d78a0"),
      segment("frame-front", "프런트 튜브", [0.48, 0.92, 0], [0.12, 0.52, 0], 0.08, "#3d78a0"),
      segment("fork", "앞 포크", [0.48, 0.92, 0], [0.72, 0.48, 0], 0.07, "#374754"),
      segment("handlebar", "핸들바", [0.38, 1.12, -0.24], [0.38, 1.12, 0.24], 0.06, "#444b50"),
      part("seat", "안장", "box", [-0.15, 1.08, 0], [0.38, 0.1, 0.25], "#65412e", [0, 0, -0.05]),
      part("pedal", "페달 축", "cylinder", [0.12, 0.52, 0], [0.12, 0.5, 0.12], "#565c60", [Math.PI / 2, 0, 0]),
    ],
  }),
  asset({
    id: "ts3d-prop-arcade-cabinet-v1",
    category: "prop",
    label: "레트로 아케이드 캐비닛",
    description: "마키·스크린·조이스틱·버튼을 분리한 게임센터용 오락기",
    tags: ["prop", "arcade", "game", "retro", "소품", "오락기", "게임", "레트로"],
    bounds: { width: 1.05, height: 2.15, depth: 1.05 },
    parts: [
      part("body", "캐비닛 본체", "box", [0, 0.95, 0], [0.92, 1.9, 0.9], "#31394a"),
      part("marquee", "상단 마키", "box", [0, 1.88, 0.18], [0.86, 0.38, 0.16], "#d45670"),
      part("screen", "게임 화면", "box", [0, 1.43, 0.42], [0.72, 0.58, 0.06], "#4eb1bf", [-0.18, 0, 0]),
      part("control-panel", "조작 패널", "box", [0, 1.03, 0.46], [0.84, 0.14, 0.48], "#695083", [-0.12, 0, 0]),
      part("joystick-stem", "조이스틱 봉", "cylinder", [-0.22, 1.2, 0.51], [0.07, 0.24, 0.07], "#d7d7d4"),
      part("joystick-top", "조이스틱 볼", "sphere", [-0.22, 1.34, 0.51], [0.16, 0.16, 0.16], "#e2534d"),
      part("button-a", "버튼 A", "cylinder", [0.12, 1.16, 0.54], [0.12, 0.06, 0.12], "#e8b84b"),
      part("button-b", "버튼 B", "cylinder", [0.29, 1.18, 0.54], [0.12, 0.06, 0.12], "#58a66c"),
      part("button-c", "버튼 C", "cylinder", [0.2, 1.04, 0.56], [0.12, 0.06, 0.12], "#4a8ec7"),
      part("kick-base", "하단 받침", "box", [0, 0.15, 0.18], [0.98, 0.3, 0.72], "#242b36"),
      part("side-light-left", "왼 측면 라이트", "box", [-0.49, 1.2, 0.2], [0.05, 1.45, 0.08], "#c74cae"),
      part("side-light-right", "오른 측면 라이트", "box", [0.49, 1.2, 0.2], [0.05, 1.45, 0.08], "#4bc9c4"),
    ],
  }),
  asset({
    id: "ts3d-prop-kitchen-island-v1",
    category: "prop",
    label: "키친 아일랜드 세트",
    description: "싱크·수전·스툴·조리 냄비·펜던트를 포함한 주방 중심 소품",
    tags: ["prop", "kitchen", "island", "interior", "소품", "주방", "아일랜드", "실내"],
    bounds: { width: 2.8, height: 2.4, depth: 1.9 },
    parts: [
      part("base", "아일랜드 하부", "box", [0, 0.48, 0], [2.45, 0.96, 1.0], "#d8d2c7"),
      part("countertop", "상판", "box", [0, 1.02, 0], [2.7, 0.12, 1.18], "#77736f"),
      part("sink", "싱크", "box", [-0.55, 1.09, 0], [0.72, 0.06, 0.5], "#87959a"),
      segment("faucet-rise", "수전 기둥", [-0.84, 1.12, -0.08], [-0.84, 1.48, -0.08], 0.07, "#737d80"),
      segment("faucet-spout", "수전 출수구", [-0.84, 1.48, -0.08], [-0.57, 1.48, -0.08], 0.07, "#737d80"),
      part("stool-left-seat", "왼 스툴 좌판", "cylinder", [-0.55, 0.73, 0.92], [0.56, 0.12, 0.56], "#8a5d3d"),
      part("stool-left-post", "왼 스툴 기둥", "cylinder", [-0.55, 0.37, 0.92], [0.1, 0.72, 0.1], "#4b5054"),
      part("stool-right-seat", "오른 스툴 좌판", "cylinder", [0.65, 0.73, 0.92], [0.56, 0.12, 0.56], "#8a5d3d"),
      part("stool-right-post", "오른 스툴 기둥", "cylinder", [0.65, 0.37, 0.92], [0.1, 0.72, 0.1], "#4b5054"),
      part("pot", "조리 냄비", "cylinder", [0.62, 1.2, -0.08], [0.42, 0.28, 0.42], "#48545a"),
      part("pot-lid", "냄비 뚜껑", "hemisphere", [0.62, 1.36, -0.08], [0.46, 0.16, 0.46], "#69767b"),
      part("pendant-left", "왼 펜던트", "cone", [-0.62, 2.1, 0], [0.52, 0.48, 0.52], "#c67d45"),
      part("pendant-right", "오른 펜던트", "cone", [0.62, 2.1, 0], [0.52, 0.48, 0.52], "#c67d45"),
      part("open-shelf", "오픈 선반", "box", [0.92, 0.45, 0.52], [0.62, 0.5, 0.08], "#9b7656"),
    ],
  }),
  asset({
    id: "ts3d-prop-neon-sign-set-v1",
    category: "prop",
    label: "네온 사인 스탠드",
    description: "프레임·발광 튜브·스포트라이트를 분리한 공연·거리 연출 소품",
    tags: ["prop", "neon", "sign", "stage", "소품", "네온", "간판", "무대"],
    bounds: { width: 2.4, height: 2.15, depth: 0.85 },
    parts: [
      part("frame", "사인 프레임", "box", [0, 1.25, 0], [2.1, 1.25, 0.12], "#262b31"),
      part("backing", "반투명 백패널", "box", [0, 1.25, 0.08], [1.9, 1.05, 0.06], "#39444d"),
      segment("neon-left", "왼 네온 획", [-0.68, 0.92, 0.16], [-0.32, 1.58, 0.16], 0.09, "#ec4f9b", "tube"),
      segment("neon-mid", "가운데 네온 획", [-0.18, 1.58, 0.16], [0.18, 0.92, 0.16], 0.09, "#55dce1", "tube"),
      segment("neon-right", "오른 네온 획", [0.34, 0.92, 0.16], [0.7, 1.58, 0.16], 0.09, "#e9c84f", "tube"),
      segment("neon-bar", "네온 가로획", [-0.72, 1.24, 0.16], [0.72, 1.24, 0.16], 0.08, "#7d65e6", "tube"),
      part("stand-left", "왼 스탠드", "box", [-0.72, 0.42, 0], [0.12, 0.84, 0.12], "#454b50"),
      part("stand-right", "오른 스탠드", "box", [0.72, 0.42, 0], [0.12, 0.84, 0.12], "#454b50"),
      part("base", "바닥 베이스", "box", [0, 0.06, 0], [1.75, 0.12, 0.68], "#30363b"),
      part("spot-left", "왼 스포트", "cone", [-0.72, 0.28, 0.32], [0.35, 0.52, 0.35], "#dc4c91", [Math.PI / 2, 0, 0]),
      part("spot-right", "오른 스포트", "cone", [0.72, 0.28, 0.32], [0.35, 0.52, 0.35], "#4ccbd1", [Math.PI / 2, 0, 0]),
      part("top-badge", "상단 배지", "sphere", [0, 1.94, 0.05], [0.28, 0.2, 0.28], "#ee7444"),
    ],
  }),
]);

export const STUDIO_BG3D_CINEMATIC_ASSET_BLUEPRINTS = Object.freeze([
  ...CHARACTER_ASSETS,
  ...SCENE_ASSETS,
  ...PROP_ASSETS,
]);

export const STUDIO_BG3D_CINEMATIC_ASSET_IDS = Object.freeze(
  STUDIO_BG3D_CINEMATIC_ASSET_BLUEPRINTS.map((item) => item.id),
);

export const STUDIO_BG3D_CINEMATIC_ASSET_COUNTS = Object.freeze({
  character: CHARACTER_ASSETS.length,
  scene: SCENE_ASSETS.length,
  prop: PROP_ASSETS.length,
  total: STUDIO_BG3D_CINEMATIC_ASSET_BLUEPRINTS.length,
});
