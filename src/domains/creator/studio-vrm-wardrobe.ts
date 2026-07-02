// VRM 실장착 워드로브 시스템 — 채색이 아니라 실제 3D 의상 지오메트리를 캐릭터에 장착한다.
// 겉옷/상의/하의/신발 4슬롯. 아이템은 여러 "파츠"로 분해되어 각 파츠가 humanoid 본에 부착되므로
// 포즈를 바꿔도 몸을 따라 움직인다(소품 studio-vrm-props와 같은 본 포털 부착 패턴의 의상 확장).
//
// 설계 원칙:
//  - three 의존 0. 아이템 → 파츠 스펙(도형·본·오프셋·정렬축) 순수 함수라 단위 테스트 가능.
//    실제 메시 생성·부착은 StudioVrmPoser가 스펙을 받아 수행한다.
//  - 사이징은 모델별 골격 실측 치수(WardrobeMetrics)로 계산 → 어떤 VRM에도 자동 핏.
//  - 부착 본은 VRM 필수 humanoid 본만 사용(spine/hips/팔다리/발) — chest·neck 등 옵셔널 본 미의존.

import type { CostumeSlot } from "./studio-vrm-costume";

export const VRM_WARDROBE_VERSION = 1 as const;

/* ── 슬롯 ────────────────────────────────────────────────────────────── */

export type WardrobeSlot = "outer" | "top" | "bottom" | "shoes";

export const WARDROBE_SLOTS: readonly WardrobeSlot[] = ["outer", "top", "bottom", "shoes"] as const;

export const WARDROBE_SLOT_LABELS: Record<WardrobeSlot, string> = {
  outer: "겉옷",
  top: "상의",
  bottom: "하의",
  shoes: "신발",
};

/** 장착 슬롯 → 자동 숨김 대상이 되는 기존(베이크드) 의상 슬롯 매핑. */
export const WARDROBE_HIDE_COSTUME_SLOTS: Record<WardrobeSlot, CostumeSlot[]> = {
  outer: ["outer"],
  top: ["tops", "onepiece"],
  bottom: ["bottoms", "onepiece"],
  shoes: ["shoes"],
};

/* ── 골격 실측 치수 ──────────────────────────────────────────────────── */

export type Vec3 = readonly [number, number, number];

/** 팔다리 한 세그먼트의 실측: 길이 + 본 로컬 공간에서 자식 관절을 향하는 단위 축. */
export interface LimbMetric {
  len: number;
  axis: Vec3;
}

export interface SideMetric {
  left: LimbMetric;
  right: LimbMetric;
}

/**
 * 모델별 골격 실측 치수(미터). StudioVrmPoser가 정규화 휴머노이드 rest 포즈에서 측정한다.
 * 모든 방향 벡터는 해당 부착 본의 로컬 공간 기준 단위 벡터.
 */
export interface WardrobeMetrics {
  /** 어깨 폭(좌우 upperArm 관절 거리). */
  shoulderW: number;
  /** 골반 폭(좌우 upperLeg 관절 거리). */
  hipW: number;
  /** hips 관절 → spine 관절 거리. */
  hipsToSpine: number;
  /** spine 관절 → 목 부근(neck 또는 head) 거리. */
  spineToNeck: number;
  /** 발목(발 관절)의 지면 기준 높이. */
  ankleH: number;
  /** 몸통 위쪽 방향(spine/hips 로컬). */
  up: Vec3;
  /** 발이 향하는 앞 방향(발 본 로컬). */
  footForward: { left: Vec3; right: Vec3 };
  upperArm: SideMetric;
  lowerArm: SideMetric;
  upperLeg: SideMetric;
  lowerLeg: SideMetric;
}

/** VRoid 표준 성인 체형 근사값 — 측정 실패 시(또는 테스트) 폴백. */
export const FALLBACK_WARDROBE_METRICS: WardrobeMetrics = {
  shoulderW: 0.32,
  hipW: 0.17,
  hipsToSpine: 0.09,
  spineToNeck: 0.32,
  ankleH: 0.08,
  up: [0, 1, 0],
  footForward: { left: [0, 0, 1], right: [0, 0, 1] },
  upperArm: { left: { len: 0.22, axis: [1, 0, 0] }, right: { len: 0.22, axis: [-1, 0, 0] } },
  lowerArm: { left: { len: 0.22, axis: [1, 0, 0] }, right: { len: 0.22, axis: [-1, 0, 0] } },
  upperLeg: { left: { len: 0.35, axis: [0, -1, 0] }, right: { len: 0.35, axis: [0, -1, 0] } },
  lowerLeg: { left: { len: 0.4, axis: [0, -1, 0] }, right: { len: 0.4, axis: [0, -1, 0] } },
};

const LEN_MIN = 0.02;
const LEN_MAX = 2.5;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampLen(value: number, fallback: number): number {
  const v = finiteOr(value, fallback);
  return Math.min(LEN_MAX, Math.max(LEN_MIN, v));
}

function normalizeVec(v: Vec3, fallback: Vec3): Vec3 {
  const [x, y, z] = [finiteOr(v[0], 0), finiteOr(v[1], 0), finiteOr(v[2], 0)];
  const mag = Math.hypot(x, y, z);
  if (mag < 1e-6) return fallback;
  return [x / mag, y / mag, z / mag];
}

function sanitizeLimb(limb: LimbMetric | undefined, fallback: LimbMetric): LimbMetric {
  if (!limb) return fallback;
  return { len: clampLen(limb.len, fallback.len), axis: normalizeVec(limb.axis, fallback.axis) };
}

function sanitizeSide(side: SideMetric | undefined, fallback: SideMetric): SideMetric {
  return {
    left: sanitizeLimb(side?.left, fallback.left),
    right: sanitizeLimb(side?.right, fallback.right),
  };
}

/** 측정값을 안전 범위로 정규화한다(NaN/비정상 rig 방어). 부분 입력은 폴백으로 채운다. */
export function sanitizeWardrobeMetrics(raw: Partial<WardrobeMetrics> | null | undefined): WardrobeMetrics {
  const f = FALLBACK_WARDROBE_METRICS;
  if (!raw) return f;
  return {
    shoulderW: clampLen(raw.shoulderW ?? f.shoulderW, f.shoulderW),
    hipW: clampLen(raw.hipW ?? f.hipW, f.hipW),
    hipsToSpine: clampLen(raw.hipsToSpine ?? f.hipsToSpine, f.hipsToSpine),
    spineToNeck: clampLen(raw.spineToNeck ?? f.spineToNeck, f.spineToNeck),
    ankleH: clampLen(raw.ankleH ?? f.ankleH, f.ankleH),
    up: normalizeVec(raw.up ?? f.up, f.up),
    footForward: {
      left: normalizeVec(raw.footForward?.left ?? f.footForward.left, f.footForward.left),
      right: normalizeVec(raw.footForward?.right ?? f.footForward.right, f.footForward.right),
    },
    upperArm: sanitizeSide(raw.upperArm, f.upperArm),
    lowerArm: sanitizeSide(raw.lowerArm, f.lowerArm),
    upperLeg: sanitizeSide(raw.upperLeg, f.upperLeg),
    lowerLeg: sanitizeSide(raw.lowerLeg, f.lowerLeg),
  };
}

/* ── 아이템 카탈로그 ─────────────────────────────────────────────────── */

export interface WardrobeItemDef {
  id: string;
  label: string;
  slot: WardrobeSlot;
  emoji: string;
  defaultColor: string;
  hint: string;
}

export const WARDROBE_ITEMS: readonly WardrobeItemDef[] = [
  // 겉옷
  { id: "blazer", label: "블레이저", slot: "outer", emoji: "🧥", defaultColor: "#2b3a5e", hint: "교복·오피스 컷. 색으로 학교/팀을 표현하세요." },
  { id: "hoodie", label: "후드집업", slot: "outer", emoji: "🧢", defaultColor: "#374151", hint: "캐주얼·스트릿 컷. 뒤에 후드가 달려요." },
  { id: "coat", label: "롱코트", slot: "outer", emoji: "🧥", defaultColor: "#8a6a3c", hint: "가을·탐정 컷. 기장이 무릎까지 내려와요." },
  { id: "cardigan", label: "가디건", slot: "outer", emoji: "🧶", defaultColor: "#d6b98c", hint: "포근한 일상 컷에." },
  { id: "armor", label: "플레이트 아머", slot: "outer", emoji: "🛡️", defaultColor: "#9aa3b2", hint: "기사·판타지 컷. 어깨 견갑이 포인트." },
  { id: "robe", label: "마법사 로브", slot: "outer", emoji: "🪄", defaultColor: "#3a2b55", hint: "마법사·사제 컷. 소매가 넓어요." },
  // 상의
  { id: "tshirt", label: "티셔츠", slot: "top", emoji: "👕", defaultColor: "#e5e7eb", hint: "만능 기본템. 반팔이에요." },
  { id: "shirt", label: "셔츠", slot: "top", emoji: "👔", defaultColor: "#f8fafc", hint: "긴팔+카라. 단추 라인이 살아있어요." },
  { id: "sweater", label: "터틀넥 스웨터", slot: "top", emoji: "🧣", defaultColor: "#7a3b3b", hint: "겨울·지적 캐릭터 컷." },
  { id: "sailor", label: "세일러 톱", slot: "top", emoji: "⚓", defaultColor: "#f8fafc", hint: "교복·마린 컷. 뒷카라와 리본 포함." },
  { id: "tank", label: "탱크톱", slot: "top", emoji: "🎽", defaultColor: "#94a3b8", hint: "여름·트레이닝 컷." },
  { id: "dress", label: "원피스", slot: "top", emoji: "👗", defaultColor: "#e8a6bd", hint: "상의+스커트 일체형. 하의 없이 단독 착용 추천." },
  // 하의
  { id: "pleated", label: "플리츠 스커트", slot: "bottom", emoji: "🩳", defaultColor: "#1e293b", hint: "교복 컷 단골. 물리 스커트와 달리 절대 뚫리지 않아요." },
  { id: "longskirt", label: "롱스커트", slot: "bottom", emoji: "👗", defaultColor: "#6e2434", hint: "우아한 컷. 발목까지 내려와요." },
  { id: "shorts", label: "반바지", slot: "bottom", emoji: "🩳", defaultColor: "#334155", hint: "여름·활동 컷." },
  { id: "pants", label: "슬림 팬츠", slot: "bottom", emoji: "👖", defaultColor: "#1c1c22", hint: "정장·데일리 컷." },
  { id: "wide", label: "와이드 팬츠", slot: "bottom", emoji: "👖", defaultColor: "#4b5563", hint: "밑단이 넓게 퍼지는 실루엣." },
  { id: "jeans", label: "청바지", slot: "bottom", emoji: "👖", defaultColor: "#3b5b85", hint: "캐주얼 만능. 밑단 롤업 디테일." },
  // 신발
  { id: "sneakers", label: "스니커즈", slot: "shoes", emoji: "👟", defaultColor: "#f1f5f9", hint: "캐주얼 기본. 색으로 포인트를." },
  { id: "boots", label: "앵클부츠", slot: "shoes", emoji: "🥾", defaultColor: "#5a4632", hint: "가을·여행 컷." },
  { id: "longboots", label: "롱부츠", slot: "shoes", emoji: "👢", defaultColor: "#1c1c22", hint: "무릎 아래까지 올라와요." },
  { id: "heels", label: "하이힐", slot: "shoes", emoji: "👠", defaultColor: "#991b1b", hint: "드레스·파티 컷." },
  { id: "loafers", label: "로퍼", slot: "shoes", emoji: "🥿", defaultColor: "#451a03", hint: "교복·오피스 컷." },
  { id: "sandals", label: "샌들", slot: "shoes", emoji: "🩴", defaultColor: "#d6b98c", hint: "여름·바캉스 컷." },
] as const;

export function wardrobeItemById(id: string): WardrobeItemDef | undefined {
  return WARDROBE_ITEMS.find((item) => item.id === id);
}

export function wardrobeItemsBySlot(slot: WardrobeSlot): WardrobeItemDef[] {
  return WARDROBE_ITEMS.filter((item) => item.slot === slot);
}

/* ── 장착 상태 + 직렬화 ──────────────────────────────────────────────── */

export const WARDROBE_FIT_MIN = 0.8;
export const WARDROBE_FIT_MAX = 1.4;

export interface WardrobeEquip {
  itemId: string;
  color: string;
  /** 품(반경) 배율 — 몸에 붙게/헐렁하게. */
  fit: number;
}

export type WardrobeState = Partial<Record<WardrobeSlot, WardrobeEquip>>;

export interface SerializedWardrobe {
  version: typeof VRM_WARDROBE_VERSION;
  slots: WardrobeState;
}

function normalizeHex(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

function clampFit(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.min(WARDROBE_FIT_MAX, Math.max(WARDROBE_FIT_MIN, n));
}

/** 임의 입력(저장 문서)을 안전한 장착 상태로 정규화한다. 슬롯-아이템 불일치·미지의 아이템은 버린다. */
export function parseWardrobe(raw: unknown): WardrobeState {
  if (!raw || typeof raw !== "object") return {};
  const slotsRaw = (raw as { slots?: unknown }).slots ?? raw;
  if (!slotsRaw || typeof slotsRaw !== "object") return {};

  const state: WardrobeState = {};
  for (const slot of WARDROBE_SLOTS) {
    const entry = (slotsRaw as Record<string, unknown>)[slot];
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Partial<Record<keyof WardrobeEquip, unknown>>;
    const def = wardrobeItemById(String(e.itemId ?? ""));
    if (!def || def.slot !== slot) continue;
    state[slot] = {
      itemId: def.id,
      color: normalizeHex(e.color, def.defaultColor),
      fit: clampFit(e.fit),
    };
  }
  return state;
}

export function serializeWardrobe(state: WardrobeState): SerializedWardrobe | undefined {
  const slots: WardrobeState = {};
  let count = 0;
  for (const slot of WARDROBE_SLOTS) {
    const equip = state[slot];
    if (!equip) continue;
    slots[slot] = { ...equip };
    count += 1;
  }
  if (count === 0) return undefined; // 빈 경우 문서에 키를 남기지 않음(하위호환)
  return { version: VRM_WARDROBE_VERSION, slots };
}

/** 카탈로그 기본값으로 슬롯 장착을 생성한다. */
export function createWardrobeEquip(itemId: string): WardrobeEquip | null {
  const def = wardrobeItemById(itemId);
  if (!def) return null;
  return { itemId: def.id, color: def.defaultColor, fit: 1 };
}

/* ── 테마 세트(원클릭 코디) ──────────────────────────────────────────── */

export interface WardrobeSet {
  id: string;
  label: string;
  emoji: string;
  equips: Partial<Record<WardrobeSlot, { itemId: string; color?: string }>>;
}

export const WARDROBE_SETS: readonly WardrobeSet[] = [
  { id: "school", label: "교복 세트", emoji: "🏫", equips: { outer: { itemId: "blazer", color: "#2b3a5e" }, top: { itemId: "shirt", color: "#f8fafc" }, bottom: { itemId: "pleated", color: "#1e293b" }, shoes: { itemId: "loafers", color: "#451a03" } } },
  { id: "knight", label: "성기사 세트", emoji: "🛡️", equips: { outer: { itemId: "armor", color: "#9aa3b2" }, bottom: { itemId: "pants", color: "#1e293b" }, shoes: { itemId: "longboots", color: "#3a2b1c" } } },
  { id: "royal", label: "황실 드레스 세트", emoji: "👑", equips: { top: { itemId: "dress", color: "#991b1b" }, shoes: { itemId: "heels", color: "#d97706" } } },
  { id: "cyber", label: "사이버펑크 세트", emoji: "⚡", equips: { outer: { itemId: "hoodie", color: "#0f172a" }, bottom: { itemId: "pants", color: "#1c1c22" }, shoes: { itemId: "sneakers", color: "#ec4899" } } },
  { id: "gothic", label: "고스 세트", emoji: "🖤", equips: { top: { itemId: "dress", color: "#111827" }, shoes: { itemId: "longboots", color: "#111827" } } },
  { id: "autumn", label: "클래식 코트 세트", emoji: "🍂", equips: { outer: { itemId: "coat", color: "#8a5a2b" }, bottom: { itemId: "pants", color: "#451a03" }, shoes: { itemId: "boots", color: "#5a4632" } } },
  { id: "marine", label: "마린 세일러 세트", emoji: "⚓", equips: { top: { itemId: "sailor", color: "#f8fafc" }, bottom: { itemId: "pleated", color: "#0f172a" }, shoes: { itemId: "loafers", color: "#1e293b" } } },
  { id: "druid", label: "숲의 로브 세트", emoji: "🍃", equips: { outer: { itemId: "robe", color: "#2f5141" }, bottom: { itemId: "pants", color: "#78350f" }, shoes: { itemId: "sandals", color: "#8a6a3c" } } },
  { id: "casual", label: "캐주얼 세트", emoji: "🛹", equips: { top: { itemId: "tshirt", color: "#e5e7eb" }, bottom: { itemId: "jeans", color: "#3b5b85" }, shoes: { itemId: "sneakers", color: "#f1f5f9" } } },
  { id: "winter", label: "겨울 니트 세트", emoji: "❄️", equips: { top: { itemId: "sweater", color: "#7a3b3b" }, bottom: { itemId: "longskirt", color: "#6e2434" }, shoes: { itemId: "boots", color: "#5a4632" } } },
] as const;

export function wardrobeSetById(id: string): WardrobeSet | undefined {
  return WARDROBE_SETS.find((set) => set.id === id);
}

/** 세트를 장착 상태로 변환한다(세트에 없는 슬롯은 비움). */
export function applyWardrobeSet(set: WardrobeSet): WardrobeState {
  const state: WardrobeState = {};
  for (const slot of WARDROBE_SLOTS) {
    const pick = set.equips[slot];
    if (!pick) continue;
    const def = wardrobeItemById(pick.itemId);
    if (!def || def.slot !== slot) continue;
    state[slot] = { itemId: def.id, color: normalizeHex(pick.color, def.defaultColor), fit: 1 };
  }
  return state;
}

/* ── 파츠 스펙 빌더(순수) ────────────────────────────────────────────── */

/** 부착 가능한 본 — VRM 필수 humanoid 본만(옵셔널 본 미의존). */
export type WardrobeBone =
  | "hips"
  | "spine"
  | "leftUpperArm"
  | "leftLowerArm"
  | "rightUpperArm"
  | "rightLowerArm"
  | "leftUpperLeg"
  | "leftLowerLeg"
  | "rightUpperLeg"
  | "rightLowerLeg"
  | "leftFoot"
  | "rightFoot";

export const WARDROBE_BONES: readonly WardrobeBone[] = [
  "hips",
  "spine",
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
  "leftUpperLeg",
  "leftLowerLeg",
  "rightUpperLeg",
  "rightLowerLeg",
  "leftFoot",
  "rightFoot",
] as const;

export type GarmentShape =
  | { kind: "cylinder"; rTop: number; rBottom: number; h: number; open?: boolean }
  | { kind: "box"; w: number; h: number; d: number }
  | { kind: "sphere"; r: number }
  | { kind: "torus"; r: number; tube: number; arc?: number };

export interface GarmentPart {
  bone: WardrobeBone;
  shape: GarmentShape;
  /** 본 로컬 오프셋(미터). */
  offset: Vec3;
  /** 도형의 +Y축을 이 방향(본 로컬 단위 벡터)으로 정렬. 생략 시 그대로. */
  align?: Vec3;
  /** 비균등 스케일(타원 단면 등). 생략 시 [1,1,1]. */
  squash?: Vec3;
  /** 파츠 색 오버라이드(hex). 생략 시 아이템 색. */
  color?: string;
  roughness?: number;
  metalness?: number;
}

const scaleVec = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
const addVec = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const negVec = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];

type Side = "left" | "right";
const SIDES: readonly Side[] = ["left", "right"] as const;

/** 팔/다리 세그먼트를 덮는 소매/바짓단 실린더 파츠. */
function limbSleeve(
  bone: WardrobeBone,
  limb: LimbMetric,
  opts: { start?: number; coverage: number; r: number; flare?: number; color?: string; roughness?: number; metalness?: number }
): GarmentPart {
  const start = opts.start ?? 0;
  const h = limb.len * opts.coverage;
  const center = scaleVec(limb.axis, limb.len * start + h / 2);
  return {
    bone,
    shape: { kind: "cylinder", rTop: opts.r, rBottom: opts.r * (opts.flare ?? 1), h, open: true },
    offset: center,
    // 실린더 +Y를 관절→자식 방향으로 정렬(아래로 갈수록 rBottom).
    align: limb.axis,
    color: opts.color,
    roughness: opts.roughness,
    metalness: opts.metalness,
  };
}

/** 몸통(spine 부착) 실린더 파츠 — bottomExt/topExt 는 hips/목 기준 연장 배율.
 * 기본 bottomExt 2.4 = hips 관절보다 1.4×hipsToSpine 아래까지 내려와 스커트/바지 허리와 확실히 겹친다(맨살 갭 방지). */
function torsoShell(
  m: WardrobeMetrics,
  opts: { bottomExt?: number; topExt?: number; rMul?: number; flare?: number; color?: string; roughness?: number; metalness?: number }
): GarmentPart {
  const bottomY = -m.hipsToSpine * (opts.bottomExt ?? 2.4);
  const topY = m.spineToNeck * (opts.topExt ?? 0.92);
  const h = topY - bottomY;
  const r = m.shoulderW * 0.56 * (opts.rMul ?? 1);
  return {
    bone: "spine",
    shape: { kind: "cylinder", rTop: r, rBottom: r * (opts.flare ?? 0.94), h, open: true },
    offset: scaleVec(m.up, (topY + bottomY) / 2),
    align: m.up,
    // 몸통 단면은 폭 대비 깊이 ~0.85 타원 — 얕으면 가슴/배가 옷을 관통한다.
    squash: [1, 1, 0.85],
    color: opts.color,
    roughness: opts.roughness,
    metalness: opts.metalness,
  };
}

/** 허리(hips 부착)에서 아래로 퍼지는 스커트 파츠. */
function skirtCone(
  m: WardrobeMetrics,
  opts: { len: number; rTopMul?: number; flare: number; color?: string }
): GarmentPart {
  const topY = m.hipsToSpine * 0.55;
  const rTop = Math.max(m.hipW * 0.95, m.shoulderW * 0.42) * (opts.rTopMul ?? 1);
  return {
    bone: "hips",
    shape: { kind: "cylinder", rTop, rBottom: rTop * opts.flare, h: opts.len, open: true },
    offset: scaleVec(m.up, topY - opts.len / 2),
    align: m.up,
    squash: [1, 1, 0.88],
    color: opts.color,
  };
}

/** 신발 파츠 묶음(한쪽 발). */
function shoeParts(
  m: WardrobeMetrics,
  side: Side,
  style: "sneakers" | "boots" | "longboots" | "heels" | "loafers" | "sandals",
  fit: number
): GarmentPart[] {
  const bone: WardrobeBone = side === "left" ? "leftFoot" : "rightFoot";
  const legBone: WardrobeBone = side === "left" ? "leftLowerLeg" : "rightLowerLeg";
  const fwd = m.footForward[side];
  const down = negVec(m.up);
  const lowerLeg = m.lowerLeg[side];
  // 신발은 발 메시를 "감싸야" 보인다 — 실측 발 치수보다 한 치수 크게 잡는다.
  const footLen = Math.max(m.ankleH * 2.3, lowerLeg.len * 0.52) * fit;
  const footW = footLen * 0.46;
  const soleDrop = m.ankleH * 0.92;
  const parts: GarmentPart[] = [];

  const soleH = style === "heels" ? 0.014 : 0.032;
  // 밑창 — 발끝 방향으로 치우친 박스.
  parts.push({
    bone,
    shape: { kind: "box", w: footW, h: soleH, d: footLen },
    offset: addVec(scaleVec(fwd, footLen * 0.32), scaleVec(down, soleDrop)),
    align: m.up,
    color: style === "sneakers" ? "#ffffff" : undefined,
    roughness: 0.85,
  });
  // 발등/토 — 앞쪽 반구.
  if (style !== "sandals") {
    parts.push({
      bone,
      shape: { kind: "sphere", r: footW * 0.66 },
      offset: addVec(scaleVec(fwd, footLen * 0.55), scaleVec(down, soleDrop - footW * 0.26)),
      squash: [1, 0.74, 1.4],
      roughness: 0.7,
    });
  }
  if (style === "sneakers" || style === "loafers" || style === "heels") {
    // 발목 아래 몸통 — 발등·뒤꿈치를 덮는다.
    parts.push({
      bone,
      shape: { kind: "cylinder", rTop: footW * 0.66, rBottom: footW * 0.74, h: Math.max(m.ankleH * 0.95, footW * 0.8), open: true },
      offset: addVec(scaleVec(fwd, footLen * 0.06), scaleVec(down, soleDrop * 0.42)),
      align: m.up,
      squash: [1, 1, 1.2],
      roughness: 0.7,
    });
  }
  if (style === "heels") {
    // 뒷굽.
    parts.push({
      bone,
      shape: { kind: "cylinder", rTop: footW * 0.18, rBottom: footW * 0.14, h: soleDrop * 0.95 },
      offset: addVec(scaleVec(fwd, -footLen * 0.16), scaleVec(down, soleDrop * 0.5)),
      align: m.up,
      roughness: 0.45,
    });
  }
  if (style === "boots" || style === "longboots") {
    // 부츠 샤프트 — 종아리 본을 따라 올라감.
    const coverage = style === "boots" ? 0.4 : 0.88;
    const r = Math.max(footW * 0.72, lowerLeg.len * 0.15 * fit);
    parts.push(
      limbSleeve(legBone, lowerLeg, {
        start: 1 - coverage,
        coverage,
        r,
        flare: 0.92,
        roughness: 0.62,
      })
    );
    // 발목 연결부(부츠 몸통과 샤프트 사이 빈틈 방지).
    parts.push({
      bone,
      shape: { kind: "cylinder", rTop: footW * 0.72, rBottom: footW * 0.78, h: Math.max(m.ankleH, footW), open: true },
      offset: addVec(scaleVec(fwd, footLen * 0.04), scaleVec(down, soleDrop * 0.35)),
      align: m.up,
      squash: [1, 1, 1.18],
      roughness: 0.62,
    });
  }
  if (style === "sandals") {
    // 스트랩.
    parts.push({
      bone,
      shape: { kind: "torus", r: footW * 0.6, tube: footW * 0.11, arc: Math.PI },
      offset: addVec(scaleVec(fwd, footLen * 0.36), scaleVec(down, soleDrop - footW * 0.18)),
      align: fwd,
      roughness: 0.7,
    });
  }
  return parts;
}

/**
 * 아이템 + 실측 치수 → 본 부착 파츠 스펙 목록.
 * fit은 반경(품)에만 적용되어 길이는 체형을 따른다.
 */
export function buildGarmentParts(itemId: string, metricsRaw: WardrobeMetrics, fit = 1): GarmentPart[] {
  const def = wardrobeItemById(itemId);
  if (!def) return [];
  const m = sanitizeWardrobeMetrics(metricsRaw);
  const f = clampFit(fit);
  const armR = (side: Side, mul = 1) => Math.max(0.03, m.upperArm[side].len * 0.19) * mul * f;
  const legR = (side: Side, mul = 1) => Math.max(0.045, m.upperLeg[side].len * 0.175) * mul * f;
  const parts: GarmentPart[] = [];

  switch (def.id) {
    case "blazer": {
      parts.push(torsoShell(m, { rMul: 1.12 * f, roughness: 0.72 }));
      for (const s of SIDES) {
        parts.push(limbSleeve(s === "left" ? "leftUpperArm" : "rightUpperArm", m.upperArm[s], { coverage: 1.02, r: armR(s, 1.32), roughness: 0.72 }));
        parts.push(limbSleeve(s === "left" ? "leftLowerArm" : "rightLowerArm", m.lowerArm[s], { coverage: 0.94, r: armR(s, 1.2), roughness: 0.72 }));
      }
      // 카라.
      parts.push({ bone: "spine", shape: { kind: "torus", r: m.shoulderW * 0.3, tube: m.shoulderW * 0.055 }, offset: scaleVec(m.up, m.spineToNeck * 0.9), align: m.up, squash: [1, 1, 0.72], roughness: 0.72 });
      break;
    }
    case "hoodie": {
      parts.push(torsoShell(m, { rMul: 1.2 * f, flare: 1, roughness: 0.85 }));
      for (const s of SIDES) {
        parts.push(limbSleeve(s === "left" ? "leftUpperArm" : "rightUpperArm", m.upperArm[s], { coverage: 1.02, r: armR(s, 1.42), roughness: 0.85 }));
        parts.push(limbSleeve(s === "left" ? "leftLowerArm" : "rightLowerArm", m.lowerArm[s], { coverage: 0.96, r: armR(s, 1.3), roughness: 0.85 }));
      }
      // 후드(등 뒤 반구) — 앞 방향의 반대로 배치.
      const back = negVec(m.footForward.left);
      parts.push({
        bone: "spine",
        shape: { kind: "sphere", r: m.shoulderW * 0.34 },
        offset: addVec(scaleVec(m.up, m.spineToNeck * 0.82), scaleVec(back, m.shoulderW * 0.3)),
        squash: [0.9, 0.82, 0.72],
        roughness: 0.85,
      });
      break;
    }
    case "coat": {
      const skirtLen = m.upperLeg.left.len * 0.85;
      parts.push(torsoShell(m, { rMul: 1.14 * f, roughness: 0.78 }));
      parts.push(skirtCone(m, { len: skirtLen, rTopMul: 1.16 * f, flare: 1.32 }));
      for (const s of SIDES) {
        parts.push(limbSleeve(s === "left" ? "leftUpperArm" : "rightUpperArm", m.upperArm[s], { coverage: 1.02, r: armR(s, 1.34), roughness: 0.78 }));
        parts.push(limbSleeve(s === "left" ? "leftLowerArm" : "rightLowerArm", m.lowerArm[s], { coverage: 0.96, r: armR(s, 1.22), roughness: 0.78 }));
      }
      parts.push({ bone: "spine", shape: { kind: "torus", r: m.shoulderW * 0.31, tube: m.shoulderW * 0.06 }, offset: scaleVec(m.up, m.spineToNeck * 0.9), align: m.up, squash: [1, 1, 0.74], roughness: 0.78 });
      break;
    }
    case "cardigan": {
      parts.push(torsoShell(m, { rMul: 1.1 * f, bottomExt: 3.1, roughness: 0.92 }));
      for (const s of SIDES) {
        parts.push(limbSleeve(s === "left" ? "leftUpperArm" : "rightUpperArm", m.upperArm[s], { coverage: 1.0, r: armR(s, 1.3), roughness: 0.92 }));
        parts.push(limbSleeve(s === "left" ? "leftLowerArm" : "rightLowerArm", m.lowerArm[s], { coverage: 0.92, r: armR(s, 1.18), roughness: 0.92 }));
      }
      break;
    }
    case "armor": {
      parts.push(torsoShell(m, { rMul: 1.16 * f, roughness: 0.32, metalness: 0.85 }));
      for (const s of SIDES) {
        // 견갑(퍼울드런).
        parts.push({
          bone: s === "left" ? "leftUpperArm" : "rightUpperArm",
          shape: { kind: "sphere", r: armR(s, 1.9) },
          offset: scaleVec(m.upperArm[s].axis, m.upperArm[s].len * 0.08),
          squash: [1, 0.78, 1],
          roughness: 0.32,
          metalness: 0.85,
        });
        parts.push(limbSleeve(s === "left" ? "leftLowerArm" : "rightLowerArm", m.lowerArm[s], { coverage: 0.9, r: armR(s, 1.24), roughness: 0.35, metalness: 0.8 }));
      }
      // 벨트.
      parts.push({ bone: "hips", shape: { kind: "torus", r: Math.max(m.hipW * 0.92, m.shoulderW * 0.4) * f, tube: 0.016 }, offset: scaleVec(m.up, m.hipsToSpine * 0.35), align: m.up, squash: [1, 1, 0.8], color: "#3a2b1c", roughness: 0.6, metalness: 0.2 });
      break;
    }
    case "robe": {
      const skirtLen = m.upperLeg.left.len + m.lowerLeg.left.len * 0.55;
      parts.push(torsoShell(m, { rMul: 1.18 * f, roughness: 0.88 }));
      parts.push(skirtCone(m, { len: skirtLen, rTopMul: 1.2 * f, flare: 1.6 }));
      for (const s of SIDES) {
        parts.push(limbSleeve(s === "left" ? "leftUpperArm" : "rightUpperArm", m.upperArm[s], { coverage: 1.02, r: armR(s, 1.5), roughness: 0.88 }));
        parts.push(limbSleeve(s === "left" ? "leftLowerArm" : "rightLowerArm", m.lowerArm[s], { coverage: 1.0, r: armR(s, 1.4), flare: 1.7, roughness: 0.88 }));
      }
      const back = negVec(m.footForward.left);
      parts.push({
        bone: "spine",
        shape: { kind: "sphere", r: m.shoulderW * 0.32 },
        offset: addVec(scaleVec(m.up, m.spineToNeck * 0.84), scaleVec(back, m.shoulderW * 0.28)),
        squash: [0.9, 0.8, 0.7],
        roughness: 0.88,
      });
      break;
    }
    case "tshirt": {
      parts.push(torsoShell(m, { rMul: 1.04 * f, roughness: 0.82 }));
      for (const s of SIDES) {
        parts.push(limbSleeve(s === "left" ? "leftUpperArm" : "rightUpperArm", m.upperArm[s], { coverage: 0.42, r: armR(s, 1.26), roughness: 0.82 }));
      }
      break;
    }
    case "shirt": {
      parts.push(torsoShell(m, { rMul: 1.05 * f, roughness: 0.68 }));
      for (const s of SIDES) {
        parts.push(limbSleeve(s === "left" ? "leftUpperArm" : "rightUpperArm", m.upperArm[s], { coverage: 1.0, r: armR(s, 1.22), roughness: 0.68 }));
        parts.push(limbSleeve(s === "left" ? "leftLowerArm" : "rightLowerArm", m.lowerArm[s], { coverage: 0.92, r: armR(s, 1.12), roughness: 0.68 }));
      }
      // 카라 + 단추 라인.
      parts.push({ bone: "spine", shape: { kind: "torus", r: m.shoulderW * 0.27, tube: m.shoulderW * 0.045 }, offset: scaleVec(m.up, m.spineToNeck * 0.92), align: m.up, squash: [1, 1, 0.72], roughness: 0.68 });
      const fwd = m.footForward.left;
      parts.push({
        bone: "spine",
        shape: { kind: "box", w: m.shoulderW * 0.05, h: m.spineToNeck * 0.66 + m.hipsToSpine, d: 0.008 },
        offset: addVec(scaleVec(m.up, m.spineToNeck * 0.28 - m.hipsToSpine * 0.45), scaleVec(fwd, m.shoulderW * 0.56 * 1.05 * f * 0.85 + 0.004)),
        align: m.up,
        color: "#d8dce4",
        roughness: 0.68,
      });
      break;
    }
    case "sweater": {
      parts.push(torsoShell(m, { rMul: 1.12 * f, roughness: 0.95 }));
      for (const s of SIDES) {
        parts.push(limbSleeve(s === "left" ? "leftUpperArm" : "rightUpperArm", m.upperArm[s], { coverage: 1.02, r: armR(s, 1.36), roughness: 0.95 }));
        parts.push(limbSleeve(s === "left" ? "leftLowerArm" : "rightLowerArm", m.lowerArm[s], { coverage: 0.94, r: armR(s, 1.24), roughness: 0.95 }));
      }
      // 터틀넥.
      parts.push({ bone: "spine", shape: { kind: "cylinder", rTop: m.shoulderW * 0.21, rBottom: m.shoulderW * 0.24, h: m.spineToNeck * 0.22, open: true }, offset: scaleVec(m.up, m.spineToNeck * 1.0), align: m.up, roughness: 0.95 });
      break;
    }
    case "sailor": {
      parts.push(torsoShell(m, { rMul: 1.05 * f, roughness: 0.8 }));
      for (const s of SIDES) {
        parts.push(limbSleeve(s === "left" ? "leftUpperArm" : "rightUpperArm", m.upperArm[s], { coverage: 0.46, r: armR(s, 1.28), roughness: 0.8 }));
      }
      // 뒷카라(사각 플랩) + 앞 리본.
      const back = negVec(m.footForward.left);
      parts.push({
        bone: "spine",
        shape: { kind: "box", w: m.shoulderW * 0.62, h: m.spineToNeck * 0.34, d: 0.01 },
        offset: addVec(scaleVec(m.up, m.spineToNeck * 0.72), scaleVec(back, m.shoulderW * 0.56 * 0.6 * f)),
        align: m.up,
        color: "#2b3a5e",
        roughness: 0.8,
      });
      const fwd = m.footForward.left;
      parts.push({
        bone: "spine",
        shape: { kind: "box", w: m.shoulderW * 0.2, h: m.shoulderW * 0.12, d: 0.012 },
        offset: addVec(scaleVec(m.up, m.spineToNeck * 0.68), scaleVec(fwd, m.shoulderW * 0.56 * 0.62 * f)),
        align: m.up,
        color: "#d8475e",
        roughness: 0.8,
      });
      break;
    }
    case "tank": {
      parts.push(torsoShell(m, { rMul: 1.06 * f, topExt: 0.82, roughness: 0.82 }));
      break;
    }
    case "dress": {
      const skirtLen = m.upperLeg.left.len * 1.05;
      parts.push(torsoShell(m, { rMul: 1.04 * f, roughness: 0.8 }));
      parts.push(skirtCone(m, { len: skirtLen, rTopMul: 1.05 * f, flare: 1.85 }));
      for (const s of SIDES) {
        parts.push(limbSleeve(s === "left" ? "leftUpperArm" : "rightUpperArm", m.upperArm[s], { coverage: 0.3, r: armR(s, 1.3), roughness: 0.8 }));
      }
      break;
    }
    case "pleated": {
      parts.push(skirtCone(m, { len: m.upperLeg.left.len * 0.58, rTopMul: f, flare: 1.7 }));
      // 허리 밴드.
      parts.push({ bone: "hips", shape: { kind: "torus", r: Math.max(m.hipW * 0.95, m.shoulderW * 0.42) * f, tube: 0.012 }, offset: scaleVec(m.up, m.hipsToSpine * 0.55), align: m.up, squash: [1, 1, 0.78], roughness: 0.7 });
      break;
    }
    case "longskirt": {
      parts.push(skirtCone(m, { len: m.upperLeg.left.len + m.lowerLeg.left.len * 0.72, rTopMul: f, flare: 1.55 }));
      parts.push({ bone: "hips", shape: { kind: "torus", r: Math.max(m.hipW * 0.95, m.shoulderW * 0.42) * f, tube: 0.012 }, offset: scaleVec(m.up, m.hipsToSpine * 0.55), align: m.up, squash: [1, 1, 0.78], roughness: 0.7 });
      break;
    }
    case "shorts": {
      parts.push(skirtCone(m, { len: m.hipsToSpine * 1.15, rTopMul: f, flare: 1.05 }));
      for (const s of SIDES) {
        parts.push(limbSleeve(s === "left" ? "leftUpperLeg" : "rightUpperLeg", m.upperLeg[s], { coverage: 0.42, r: legR(s, 1.26), roughness: 0.75 }));
      }
      break;
    }
    case "pants":
    case "jeans":
    case "wide": {
      const flare = def.id === "wide" ? 1.55 : 1.02;
      const rMul = def.id === "wide" ? 1.3 : 1.16;
      const rough = def.id === "jeans" ? 0.9 : 0.72;
      parts.push(skirtCone(m, { len: m.hipsToSpine * 1.1, rTopMul: f, flare: 1.02 }));
      for (const s of SIDES) {
        parts.push(limbSleeve(s === "left" ? "leftUpperLeg" : "rightUpperLeg", m.upperLeg[s], { start: 0.18, coverage: 0.86, r: legR(s, rMul), roughness: rough }));
        parts.push(
          limbSleeve(s === "left" ? "leftLowerLeg" : "rightLowerLeg", m.lowerLeg[s], {
            coverage: def.id === "jeans" ? 0.84 : 0.92,
            r: legR(s, rMul * 0.88),
            flare,
            roughness: rough,
          })
        );
        if (def.id === "jeans") {
          // 롤업 커프.
          const lower = m.lowerLeg[s];
          parts.push({
            bone: s === "left" ? "leftLowerLeg" : "rightLowerLeg",
            shape: { kind: "torus", r: legR(s, rMul * 0.82), tube: 0.011 },
            offset: scaleVec(lower.axis, lower.len * 0.84),
            align: lower.axis,
            color: "#2d4666",
            roughness: 0.9,
          });
        }
      }
      break;
    }
    case "sneakers":
    case "boots":
    case "longboots":
    case "heels":
    case "loafers":
    case "sandals": {
      for (const s of SIDES) parts.push(...shoeParts(m, s, def.id, f));
      break;
    }
    default:
      break;
  }
  return parts;
}
