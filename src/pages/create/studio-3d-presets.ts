export type Vec3 = [number, number, number];
export type HairStyle = "bob" | "twin" | "short" | "curly" | "side" | "spiky";
export type FringeStyle = "sideSwept" | "rounded" | "parted" | "curtain" | "blunt" | "shortSweep";
export type Accessory = "glasses" | "ribbon" | "catEars" | "hat" | "flower" | "horns" | "maidHeadband" | "crown" | "antenna" | "none";
export type GenreProp = "none" | "cape" | "wizardHat" | "headband" | "swordBack";
export type CharacterArchetype =
  | "knight"
  | "mage"
  | "wuxia"
  | "student"
  | "office"
  | "hoodie"
  | "cheer"
  | "villain"
  | "maid"
  | "ninja"
  | "princess"
  | "robot";
export type ExpressionId = "happy" | "sad" | "angry" | "surprised" | "love" | "neutral";
export type PoseId = "idle" | "wave" | "point" | "cheer" | "think" | "sit";
export type CameraPresetId = "front" | "quarter" | "low";

export type CharacterPreset = {
  id: string;
  name: string;
  tag: string;
  archetype: CharacterArchetype;
  skin: string;
  blush: string;
  hair: string;
  hairStyle: HairStyle;
  fringe: FringeStyle;
  eye: string;
  outfit: string;
  outfitTrim: string;
  shoe: string;
  accessory: Accessory;
  accessoryColor: string;
  prop: GenreProp;
};

export type PosePreset = {
  id: PoseId;
  label: string;
  hint: string;
  leftArm: Vec3;
  rightArm: Vec3;
  leftLeg: Vec3;
  rightLeg: Vec3;
  body: Vec3;
  head: Vec3;
  lift: number;
};

export type CameraPreset = {
  id: CameraPresetId;
  label: string;
  position: Vec3;
  target: Vec3;
};

export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    id: "silver-knight",
    name: "은빛 기사",
    tag: "중세 기사",
    archetype: "knight",
    skin: "#f1bea3",
    blush: "#e98c98",
    hair: "#d8ad61",
    hairStyle: "bob",
    fringe: "parted",
    eye: "#5a8fd9",
    outfit: "#9ea9b5",
    outfitTrim: "#f4d88f",
    shoe: "#52606d",
    accessory: "none",
    accessoryColor: "#c93d4b",
    prop: "cape",
  },
  {
    id: "star-mage",
    name: "별빛 마법사",
    tag: "판타지 마법",
    archetype: "mage",
    skin: "#e7ad8d",
    blush: "#e78091",
    hair: "#6953c9",
    hairStyle: "curly",
    fringe: "rounded",
    eye: "#7f6ff0",
    outfit: "#5047a8",
    outfitTrim: "#f0d770",
    shoe: "#2d285f",
    accessory: "none",
    accessoryColor: "#5d4dcc",
    prop: "wizardHat",
  },
  {
    id: "moon-wuxia",
    name: "설월 검객",
    tag: "무협 검객",
    archetype: "wuxia",
    skin: "#eec7ad",
    blush: "#e9959a",
    hair: "#20242c",
    hairStyle: "side",
    fringe: "curtain",
    eye: "#445f83",
    outfit: "#eef1f7",
    outfitTrim: "#87a7c5",
    shoe: "#4b5965",
    accessory: "none",
    accessoryColor: "#7d96b6",
    prop: "swordBack",
  },
  {
    id: "spring-student",
    name: "봄빛 학생",
    tag: "교복 학생",
    archetype: "student",
    skin: "#f2c4aa",
    blush: "#ee8e9a",
    hair: "#4f3024",
    hairStyle: "bob",
    fringe: "blunt",
    eye: "#5b6fc5",
    outfit: "#2f5e9e",
    outfitTrim: "#f4f0df",
    shoe: "#2f3850",
    accessory: "ribbon",
    accessoryColor: "#e05f75",
    prop: "none",
  },
  {
    id: "navy-office",
    name: "네이비 직장인",
    tag: "정장 오피스",
    archetype: "office",
    skin: "#d79a78",
    blush: "#d57484",
    hair: "#2a2320",
    hairStyle: "short",
    fringe: "sideSwept",
    eye: "#3e766d",
    outfit: "#253b57",
    outfitTrim: "#e9edf2",
    shoe: "#1c2531",
    accessory: "glasses",
    accessoryColor: "#29231f",
    prop: "none",
  },
  {
    id: "lime-hoodie",
    name: "라임 후드",
    tag: "후드 소년",
    archetype: "hoodie",
    skin: "#e9b28e",
    blush: "#e7898d",
    hair: "#27465c",
    hairStyle: "spiky",
    fringe: "shortSweep",
    eye: "#46a981",
    outfit: "#83c45d",
    outfitTrim: "#d9f4c4",
    shoe: "#315140",
    accessory: "none",
    accessoryColor: "#83c45d",
    prop: "none",
  },
  {
    id: "peach-cheer",
    name: "피치 치어",
    tag: "응원 소녀",
    archetype: "cheer",
    skin: "#f0b985",
    blush: "#e9827d",
    hair: "#f1c05c",
    hairStyle: "twin",
    fringe: "rounded",
    eye: "#4f84ee",
    outfit: "#f06686",
    outfitTrim: "#fff1a8",
    shoe: "#7b3750",
    accessory: "ribbon",
    accessoryColor: "#ff7ca0",
    prop: "none",
  },
  {
    id: "crimson-villain",
    name: "크림슨 마왕",
    tag: "마왕 빌런",
    archetype: "villain",
    skin: "#c88d72",
    blush: "#d07485",
    hair: "#241b2b",
    hairStyle: "spiky",
    fringe: "parted",
    eye: "#d64b63",
    outfit: "#4a2132",
    outfitTrim: "#d4b468",
    shoe: "#241922",
    accessory: "horns",
    accessoryColor: "#8d2d45",
    prop: "cape",
  },
  {
    id: "snow-maid",
    name: "스노우 메이드",
    tag: "메이드",
    archetype: "maid",
    skin: "#efd0b6",
    blush: "#ee9a9a",
    hair: "#5f3828",
    hairStyle: "bob",
    fringe: "sideSwept",
    eye: "#6d8fe2",
    outfit: "#2a2f3b",
    outfitTrim: "#ffffff",
    shoe: "#20232b",
    accessory: "maidHeadband",
    accessoryColor: "#f6f1e9",
    prop: "none",
  },
  {
    id: "shadow-ninja",
    name: "그림자 닌자",
    tag: "닌자 액션",
    archetype: "ninja",
    skin: "#d6a384",
    blush: "#cf7781",
    hair: "#161b22",
    hairStyle: "short",
    fringe: "shortSweep",
    eye: "#d84f53",
    outfit: "#27313d",
    outfitTrim: "#6e8aa0",
    shoe: "#141a20",
    accessory: "none",
    accessoryColor: "#e04a4f",
    prop: "headband",
  },
  {
    id: "rose-princess",
    name: "로즈 공주",
    tag: "로맨스 공주",
    archetype: "princess",
    skin: "#f3c8b1",
    blush: "#ef8ca4",
    hair: "#e7a6b9",
    hairStyle: "curly",
    fringe: "curtain",
    eye: "#7d6ce1",
    outfit: "#f19abc",
    outfitTrim: "#f9e7a2",
    shoe: "#a05a77",
    accessory: "crown",
    accessoryColor: "#f3cf65",
    prop: "none",
  },
  {
    id: "chrome-robot",
    name: "크롬 로봇소년",
    tag: "SF 로봇",
    archetype: "robot",
    skin: "#bfc8cf",
    blush: "#91becd",
    hair: "#5b6878",
    hairStyle: "short",
    fringe: "blunt",
    eye: "#28bfd1",
    outfit: "#2b7588",
    outfitTrim: "#a8f1ea",
    shoe: "#2f4854",
    accessory: "antenna",
    accessoryColor: "#72d8e8",
    prop: "none",
  },
];

export const EXPRESSIONS: { id: ExpressionId; label: string }[] = [
  { id: "happy", label: "활짝" },
  { id: "sad", label: "시무룩" },
  { id: "angry", label: "발끈" },
  { id: "surprised", label: "깜짝" },
  { id: "love", label: "두근" },
  { id: "neutral", label: "담백" },
];

export const POSE_PRESETS: PosePreset[] = [
  {
    id: "idle",
    label: "기본",
    hint: "차분한 정면 포즈",
    leftArm: [0, 0, -0.18],
    rightArm: [0, 0, 0.18],
    leftLeg: [0, 0, -0.08],
    rightLeg: [0, 0, 0.08],
    body: [0, 0, 0],
    head: [0, 0, 0],
    lift: 0,
  },
  {
    id: "wave",
    label: "손인사",
    hint: "한 손을 크게 흔드는 포즈",
    leftArm: [0.08, 0, -0.34],
    rightArm: [-0.12, 0, 2.42],
    leftLeg: [0, 0, -0.08],
    rightLeg: [0, 0, 0.12],
    body: [0, 0, -0.04],
    head: [0, 0.08, -0.07],
    lift: 0,
  },
  {
    id: "point",
    label: "가리키기",
    hint: "대사를 강조하는 손짓",
    leftArm: [0.18, 0, -0.16],
    rightArm: [-1.22, 0, 1.2],
    leftLeg: [0, 0, -0.05],
    rightLeg: [0, 0, 0.08],
    body: [0, -0.08, 0.03],
    head: [0, -0.12, 0.02],
    lift: 0,
  },
  {
    id: "cheer",
    label: "점프",
    hint: "두 팔을 올린 응원 포즈",
    leftArm: [-0.08, 0, -2.34],
    rightArm: [-0.08, 0, 2.34],
    leftLeg: [0.18, 0, -0.34],
    rightLeg: [0.18, 0, 0.34],
    body: [-0.04, 0, 0],
    head: [0.04, 0, 0],
    lift: 0.16,
  },
  {
    id: "think",
    label: "고민",
    hint: "턱에 손을 댄 생각 포즈",
    leftArm: [0.05, 0, -0.24],
    rightArm: [-0.18, 0, 1.74],
    leftLeg: [0, 0, -0.1],
    rightLeg: [0, 0, 0.04],
    body: [0.02, 0, -0.05],
    head: [0.05, -0.2, -0.12],
    lift: 0,
  },
  {
    id: "sit",
    label: "앉기",
    hint: "패널 하단에 놓기 좋은 앉은 포즈",
    leftArm: [-0.35, 0, -0.52],
    rightArm: [-0.35, 0, 0.52],
    leftLeg: [-1.18, 0, -0.2],
    rightLeg: [-1.18, 0, 0.2],
    body: [0.18, 0, 0],
    head: [-0.08, 0, 0],
    lift: -0.2,
  },
];

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: "front", label: "정면", position: [0, 1.55, 5.15], target: [0, 1.42, 0] },
  { id: "quarter", label: "사선", position: [3.05, 1.75, 4.35], target: [0, 1.42, 0] },
  { id: "low", label: "로우", position: [0.35, 0.9, 4.9], target: [0, 1.35, 0] },
];
