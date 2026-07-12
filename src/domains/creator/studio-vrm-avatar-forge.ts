export const AVATAR_FORGE_VERSION = 1 as const;

export type AvatarForgeHairStyle =
  | "none"
  | "short"
  | "bob"
  | "long"
  | "ponytail"
  | "twintail"
  | "bun";

export type AvatarForgeFaceAccentId = "blush" | "freckles" | "beauty-mark";

export type AvatarForgeFaceParams = {
  headWidth: number;
  headHeight: number;
  headDepth: number;
  cheekVolume: number;
  chinLength: number;
};

export type AvatarForgeHairParams = {
  style: AvatarForgeHairStyle;
  replaceOriginal: boolean;
  volume: number;
  length: number;
  strandWidth: number;
  fringe: number;
  curl: number;
  shine: number;
  baseColor: string;
  tipColor: string;
};

export type AvatarForgeFaceAccent = {
  id: AvatarForgeFaceAccentId;
  enabled: boolean;
  color: string;
  intensity: number;
};

export type AvatarForgeState = {
  version: typeof AVATAR_FORGE_VERSION;
  presetId?: string;
  face: AvatarForgeFaceParams;
  hair: AvatarForgeHairParams;
  faceAccents?: AvatarForgeFaceAccent[];
};

export type AvatarForgeNumericLimit = {
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

export type AvatarForgeHairPart = {
  id: string;
  role: "cap" | "bang" | "side" | "back" | "tail" | "bun";
  primitive: "ellipsoid" | "tapered-capsule" | "sphere";
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale: readonly [number, number, number];
  baseColor: string;
  tipColor: string;
  taper: number;
  curl: number;
  shine: number;
};

export type AvatarForgePreset = {
  id: string;
  label: string;
  hint: string;
  emoji: string;
  state: AvatarForgeState;
};

export const AVATAR_FORGE_FACE_LIMITS: Record<keyof AvatarForgeFaceParams, AvatarForgeNumericLimit> = {
  headWidth: { label: "얼굴 너비", min: 0.84, max: 1.18, step: 0.01, unit: "×" },
  headHeight: { label: "얼굴 길이", min: 0.86, max: 1.16, step: 0.01, unit: "×" },
  headDepth: { label: "얼굴 입체감", min: 0.88, max: 1.14, step: 0.01, unit: "×" },
  cheekVolume: { label: "볼륨", min: 0, max: 1, step: 0.01 },
  chinLength: { label: "턱 길이", min: 0.88, max: 1.14, step: 0.01, unit: "×" },
};

export const AVATAR_FORGE_HAIR_LIMITS: Record<
  "volume" | "length" | "strandWidth" | "fringe" | "curl" | "shine",
  AvatarForgeNumericLimit
> = {
  volume: { label: "전체 볼륨", min: 0.72, max: 1.45, step: 0.01, unit: "×" },
  length: { label: "길이", min: 0.55, max: 1.7, step: 0.01, unit: "×" },
  strandWidth: { label: "모발 굵기", min: 0.68, max: 1.45, step: 0.01, unit: "×" },
  fringe: { label: "앞머리", min: 0.2, max: 1.35, step: 0.01, unit: "×" },
  curl: { label: "컬", min: 0, max: 1, step: 0.01 },
  shine: { label: "윤기", min: 0, max: 1, step: 0.01 },
};

export const AVATAR_FORGE_HAIR_STYLE_OPTIONS: ReadonlyArray<{
  id: AvatarForgeHairStyle;
  label: string;
  emoji: string;
  hint: string;
}> = [
  { id: "none", label: "헤어 없음", emoji: "◌", hint: "추가 헤어 파츠를 끕니다." },
  { id: "short", label: "숏", emoji: "✦", hint: "가벼운 숏 커트" },
  { id: "bob", label: "보브", emoji: "●", hint: "턱선 보브 커트" },
  { id: "long", label: "롱", emoji: "│", hint: "등을 따라 흐르는 긴 머리" },
  { id: "ponytail", label: "포니테일", emoji: "◒", hint: "뒤로 묶은 활동적인 헤어" },
  { id: "twintail", label: "트윈테일", emoji: "◖◗", hint: "양쪽으로 묶은 헤어" },
  { id: "bun", label: "번", emoji: "◎", hint: "단정하게 올린 번 헤어" },
] as const;

export const AVATAR_FORGE_FACE_ACCENT_OPTIONS: ReadonlyArray<{
  id: AvatarForgeFaceAccentId;
  label: string;
  hint: string;
}> = [
  { id: "blush", label: "홍조", hint: "볼에 부드러운 색을 더합니다." },
  { id: "freckles", label: "주근깨", hint: "코와 볼 주변에 작은 점을 더합니다." },
  { id: "beauty-mark", label: "매력점", hint: "얼굴에 작은 포인트를 더합니다." },
] as const;

const DEFAULT_FACE: AvatarForgeFaceParams = {
  headWidth: 1,
  headHeight: 1,
  headDepth: 1,
  cheekVolume: 0.35,
  chinLength: 1,
};

const DEFAULT_HAIR: AvatarForgeHairParams = {
  style: "none",
  replaceOriginal: false,
  volume: 1,
  length: 1,
  strandWidth: 1,
  fringe: 0.75,
  curl: 0.15,
  shine: 0.42,
  baseColor: "#352a28",
  tipColor: "#6b5148",
};

const DEFAULT_ACCENTS: AvatarForgeFaceAccent[] = [
  { id: "blush", enabled: false, color: "#ef8f9d", intensity: 0.35 },
  { id: "freckles", enabled: false, color: "#8b5c4a", intensity: 0.45 },
  { id: "beauty-mark", enabled: false, color: "#4b342f", intensity: 0.7 },
];

export const DEFAULT_AVATAR_FORGE_STATE: AvatarForgeState = {
  version: AVATAR_FORGE_VERSION,
  face: { ...DEFAULT_FACE },
  hair: { ...DEFAULT_HAIR },
  faceAccents: DEFAULT_ACCENTS.map((accent) => ({ ...accent })),
};

function preset(
  id: string,
  label: string,
  emoji: string,
  hint: string,
  face: Partial<AvatarForgeFaceParams>,
  hair: Partial<AvatarForgeHairParams>,
  accents: Partial<Record<AvatarForgeFaceAccentId, Partial<AvatarForgeFaceAccent>>> = {}
): AvatarForgePreset {
  const faceAccents = DEFAULT_ACCENTS.map((accent) => ({ ...accent, ...accents[accent.id] }));
  return {
    id,
    label,
    emoji,
    hint,
    state: {
      version: AVATAR_FORGE_VERSION,
      presetId: id,
      face: { ...DEFAULT_FACE, ...face },
      hair: { ...DEFAULT_HAIR, ...hair },
      faceAccents,
    },
  };
}

export const AVATAR_FORGE_PRESETS: ReadonlyArray<AvatarForgePreset> = [
  preset("natural-short", "내추럴 숏", "🌿", "현대극 주인공에 잘 맞는 자연스러운 숏", {}, { style: "short" }),
  preset("soft-bob", "소프트 보브", "☁️", "둥근 얼굴과 부드러운 보브", { headWidth: 1.05, cheekVolume: 0.62 }, { style: "bob", curl: 0.28, baseColor: "#4a302b", tipColor: "#8a6257" }, { blush: { enabled: true, intensity: 0.28 } }),
  preset("romance-long", "로맨스 롱", "🌙", "로맨스 판타지 컷에 어울리는 긴 실루엣", { headHeight: 1.04, chinLength: 1.05 }, { style: "long", length: 1.3, shine: 0.68, baseColor: "#2c253f", tipColor: "#725d8d" }),
  preset("action-pony", "액션 포니", "⚡", "움직임이 또렷한 높은 포니테일", { headWidth: 0.97 }, { style: "ponytail", length: 1.12, volume: 1.08, curl: 0.18, baseColor: "#222936", tipColor: "#485a70" }),
  preset("pop-twin", "팝 트윈", "🎧", "아이돌·학원물용 트윈테일", { headWidth: 1.04, cheekVolume: 0.55 }, { style: "twintail", volume: 1.12, length: 1.08, curl: 0.55, baseColor: "#33274f", tipColor: "#c064a2" }, { blush: { enabled: true } }),
  preset("elegant-bun", "엘리건트 번", "✨", "사극·오피스·의료 장면에 단정한 올림머리", { headHeight: 1.02 }, { style: "bun", volume: 0.95, shine: 0.55, baseColor: "#29211f", tipColor: "#59443e" }),
  preset("androgynous-crop", "앤드로지너스", "◇", "성별 표현에 구애받지 않는 짧은 커트", { headWidth: 0.96, headHeight: 1.04, chinLength: 1.04 }, { style: "short", fringe: 0.48, volume: 0.9, baseColor: "#3b3d42", tipColor: "#747980" }),
  preset("silver-senior", "실버 시니어", "🕊️", "중·노년 캐릭터용 은빛 보브", { headWidth: 1.04, cheekVolume: 0.48 }, { style: "bob", volume: 0.9, curl: 0.12, shine: 0.28, baseColor: "#a7a6a2", tipColor: "#e4e1db" }, { freckles: { enabled: true, intensity: 0.24 } }),
] as const;

const HAIR_STYLE_IDS = new Set<AvatarForgeHairStyle>(AVATAR_FORGE_HAIR_STYLE_OPTIONS.map((option) => option.id));
const ACCENT_IDS = new Set<AvatarForgeFaceAccentId>(AVATAR_FORGE_FACE_ACCENT_OPTIONS.map((option) => option.id));
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function clampNumber(value: unknown, limit: AvatarForgeNumericLimit, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(limit.max, Math.max(limit.min, numeric));
}

function color(value: unknown, fallback: string) {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function sanitizeAvatarForgeState(raw: unknown): AvatarForgeState {
  const source = record(raw);
  const face = record(source.face);
  const hair = record(source.hair);
  const style = HAIR_STYLE_IDS.has(hair.style as AvatarForgeHairStyle)
    ? (hair.style as AvatarForgeHairStyle)
    : DEFAULT_HAIR.style;
  const rawAccents = Array.isArray(source.faceAccents) ? source.faceAccents : [];
  const byId = new Map<AvatarForgeFaceAccentId, Record<string, unknown>>();
  for (const entry of rawAccents) {
    const parsed = record(entry);
    if (ACCENT_IDS.has(parsed.id as AvatarForgeFaceAccentId)) {
      byId.set(parsed.id as AvatarForgeFaceAccentId, parsed);
    }
  }

  return {
    version: AVATAR_FORGE_VERSION,
    ...(typeof source.presetId === "string" && source.presetId.trim()
      ? { presetId: source.presetId.trim().slice(0, 64) }
      : {}),
    face: {
      headWidth: clampNumber(face.headWidth, AVATAR_FORGE_FACE_LIMITS.headWidth, DEFAULT_FACE.headWidth),
      headHeight: clampNumber(face.headHeight, AVATAR_FORGE_FACE_LIMITS.headHeight, DEFAULT_FACE.headHeight),
      headDepth: clampNumber(face.headDepth, AVATAR_FORGE_FACE_LIMITS.headDepth, DEFAULT_FACE.headDepth),
      cheekVolume: clampNumber(face.cheekVolume, AVATAR_FORGE_FACE_LIMITS.cheekVolume, DEFAULT_FACE.cheekVolume),
      chinLength: clampNumber(face.chinLength, AVATAR_FORGE_FACE_LIMITS.chinLength, DEFAULT_FACE.chinLength),
    },
    hair: {
      style,
      replaceOriginal: hair.replaceOriginal === true,
      volume: clampNumber(hair.volume, AVATAR_FORGE_HAIR_LIMITS.volume, DEFAULT_HAIR.volume),
      length: clampNumber(hair.length, AVATAR_FORGE_HAIR_LIMITS.length, DEFAULT_HAIR.length),
      strandWidth: clampNumber(hair.strandWidth, AVATAR_FORGE_HAIR_LIMITS.strandWidth, DEFAULT_HAIR.strandWidth),
      fringe: clampNumber(hair.fringe, AVATAR_FORGE_HAIR_LIMITS.fringe, DEFAULT_HAIR.fringe),
      curl: clampNumber(hair.curl, AVATAR_FORGE_HAIR_LIMITS.curl, DEFAULT_HAIR.curl),
      shine: clampNumber(hair.shine, AVATAR_FORGE_HAIR_LIMITS.shine, DEFAULT_HAIR.shine),
      baseColor: color(hair.baseColor, DEFAULT_HAIR.baseColor),
      tipColor: color(hair.tipColor, DEFAULT_HAIR.tipColor),
    },
    faceAccents: DEFAULT_ACCENTS.map((fallback) => {
      const entry = byId.get(fallback.id) ?? {};
      return {
        id: fallback.id,
        enabled: entry.enabled === true,
        color: color(entry.color, fallback.color),
        intensity: clampNumber(
          entry.intensity,
          { label: "강도", min: 0, max: 1, step: 0.01 },
          fallback.intensity
        ),
      };
    }),
  };
}

export function parseAvatarForgeState(raw: unknown): AvatarForgeState {
  if (typeof raw === "string") {
    try {
      return sanitizeAvatarForgeState(JSON.parse(raw));
    } catch {
      return sanitizeAvatarForgeState(undefined);
    }
  }
  return sanitizeAvatarForgeState(raw);
}

export function serializeAvatarForgeState(raw: unknown): AvatarForgeState {
  return sanitizeAvatarForgeState(raw);
}

export function createAvatarForgeState(presetId?: string): AvatarForgeState {
  if (!presetId) return sanitizeAvatarForgeState(DEFAULT_AVATAR_FORGE_STATE);
  const selected = AVATAR_FORGE_PRESETS.find((item) => item.id === presetId);
  return sanitizeAvatarForgeState(selected?.state ?? DEFAULT_AVATAR_FORGE_STATE);
}

function hairPart(
  hair: AvatarForgeHairParams,
  id: string,
  role: AvatarForgeHairPart["role"],
  primitive: AvatarForgeHairPart["primitive"],
  position: AvatarForgeHairPart["position"],
  rotation: AvatarForgeHairPart["rotation"],
  scale: AvatarForgeHairPart["scale"],
  taper = 0.25
): AvatarForgeHairPart {
  return {
    id,
    role,
    primitive,
    position,
    rotation,
    scale,
    baseColor: hair.baseColor,
    tipColor: hair.tipColor,
    taper,
    curl: hair.curl,
    shine: hair.shine,
  };
}

/**
 * Head-local, unit-scale procedural part plan. The Three renderer owns geometry creation;
 * this module stays deterministic, serializable and testable.
 */
export function buildAvatarForgeHairParts(
  stateOrHair: AvatarForgeState | AvatarForgeHairParams
): AvatarForgeHairPart[] {
  const hair = "hair" in stateOrHair
    ? sanitizeAvatarForgeState(stateOrHair).hair
    : sanitizeAvatarForgeState({ hair: stateOrHair }).hair;
  if (hair.style === "none") return [];

  const v = hair.volume;
  const l = hair.length;
  const w = hair.strandWidth;
  const f = hair.fringe;
  const parts: AvatarForgeHairPart[] = [
    hairPart(hair, "cap", "cap", "ellipsoid", [0, 0.18, 0.015], [0, 0, 0], [0.56 * v, 0.46 * v, 0.54 * v], 0),
    hairPart(hair, "bang-center", "bang", "tapered-capsule", [0, 0.03, 0.43], [0.04, 0, 0], [0.12 * w, 0.35 * f, 0.08 * w], 0.72),
    hairPart(hair, "bang-left", "bang", "tapered-capsule", [-0.19, 0.04, 0.4], [0.08, 0, 0.18], [0.11 * w, 0.31 * f, 0.08 * w], 0.7),
    hairPart(hair, "bang-right", "bang", "tapered-capsule", [0.19, 0.04, 0.4], [0.08, 0, -0.18], [0.11 * w, 0.31 * f, 0.08 * w], 0.7),
  ];

  if (hair.style === "short") {
    parts.push(
      hairPart(hair, "short-left", "side", "tapered-capsule", [-0.42, -0.03, 0.02], [0.06, 0, 0.08], [0.12 * w, 0.35 * l, 0.12 * w], 0.55),
      hairPart(hair, "short-right", "side", "tapered-capsule", [0.42, -0.03, 0.02], [0.06, 0, -0.08], [0.12 * w, 0.35 * l, 0.12 * w], 0.55)
    );
  }

  if (hair.style === "bob" || hair.style === "long") {
    const sideLength = (hair.style === "long" ? 0.82 : 0.5) * l;
    parts.push(
      hairPart(hair, "side-left", "side", "tapered-capsule", [-0.43, -0.22 * l, 0.02], [0, 0, 0.05], [0.15 * w, sideLength, 0.13 * w], 0.38),
      hairPart(hair, "side-right", "side", "tapered-capsule", [0.43, -0.22 * l, 0.02], [0, 0, -0.05], [0.15 * w, sideLength, 0.13 * w], 0.38),
      hairPart(hair, "back", "back", "ellipsoid", [0, -0.25 * l, -0.34], [0, 0, 0], [0.47 * v, sideLength, 0.17 * v], 0.08)
    );
  }

  if (hair.style === "ponytail") {
    parts.push(
      hairPart(hair, "pony-root", "bun", "sphere", [0, 0.13, -0.48], [0, 0, 0], [0.19 * v, 0.19 * v, 0.19 * v], 0),
      hairPart(hair, "pony-tail", "tail", "tapered-capsule", [0, -0.42 * l, -0.58], [-0.22, 0, 0], [0.2 * w, 0.82 * l, 0.18 * w], 0.58)
    );
  }

  if (hair.style === "twintail") {
    parts.push(
      hairPart(hair, "twin-left", "tail", "tapered-capsule", [-0.48, -0.34 * l, -0.14], [0, 0, -0.2], [0.19 * w, 0.72 * l, 0.17 * w], 0.58),
      hairPart(hair, "twin-right", "tail", "tapered-capsule", [0.48, -0.34 * l, -0.14], [0, 0, 0.2], [0.19 * w, 0.72 * l, 0.17 * w], 0.58)
    );
  }

  if (hair.style === "bun") {
    parts.push(
      hairPart(hair, "bun", "bun", "sphere", [0, 0.53 * v, -0.16], [0, 0, 0], [0.28 * v, 0.28 * v, 0.25 * v], 0),
      hairPart(hair, "bun-wisp-left", "side", "tapered-capsule", [-0.39, -0.05, 0.12], [0.02, 0, 0.08], [0.07 * w, 0.28 * l, 0.06 * w], 0.78),
      hairPart(hair, "bun-wisp-right", "side", "tapered-capsule", [0.39, -0.05, 0.12], [0.02, 0, -0.08], [0.07 * w, 0.28 * l, 0.06 * w], 0.78)
    );
  }

  return parts;
}
