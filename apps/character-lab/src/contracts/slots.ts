/**
 * SHAPER와 같은 15슬롯 캐릭터 구성 어휘.
 *
 * 절차적 소스와 제작(Blender) 패키지 소스 모두 같은 슬롯 키를 쓴다.
 * 슬롯 미지원은 `SlotCapability.reasonKo`로 노출하고 다른 프리셋으로 바꾸지 않는다.
 */
export const CHARACTER_SLOT_KINDS = [
  "face-shape",
  "eyes",
  "irises",
  "nose",
  "mouth",
  "ears",
  "hair",
  "body",
  "top",
  "bottom",
  "shoes",
  "accessory",
  "expression",
  "pose",
  "hand-pose",
] as const;

export type SlotKind = (typeof CHARACTER_SLOT_KINDS)[number];

/** 슬롯 한글 라벨(UI 탭·카드 제목) */
export const SLOT_LABELS_KO: Readonly<Record<SlotKind, string>> = {
  "face-shape": "얼굴형",
  eyes: "눈",
  irises: "눈동자",
  nose: "코",
  mouth: "입",
  ears: "귀",
  hair: "헤어",
  body: "체형",
  top: "상의",
  bottom: "하의",
  shoes: "신발",
  accessory: "액세서리",
  expression: "표정",
  pose: "포즈",
  "hand-pose": "손 포즈",
};

export type SlotGroup = "identity" | "figure" | "performance";

/** 슬롯 그룹: identity(얼굴), figure(몸·의상), performance(표정·포즈). 합집합 = 15슬롯 전부. */
export const SLOT_GROUPS: Readonly<Record<SlotGroup, readonly SlotKind[]>> = {
  identity: ["face-shape", "eyes", "irises", "nose", "mouth", "ears"],
  figure: ["hair", "body", "top", "bottom", "shoes", "accessory"],
  performance: ["expression", "pose", "hand-pose"],
};

export const SLOT_GROUP_LABELS_KO: Readonly<Record<SlotGroup, string>> = {
  identity: "얼굴",
  figure: "몸·의상",
  performance: "연기",
};

/** 외형 슬롯(썸네일·레시피 patch 대상 12개) */
export const APPEARANCE_SLOT_KINDS: readonly SlotKind[] = [...SLOT_GROUPS.identity, ...SLOT_GROUPS.figure];

export type SlotCapabilityStatus = "available" | "partial" | "unavailable";

export interface SlotCapability {
  readonly status: SlotCapabilityStatus;
  /** partial·unavailable일 때 카드에 표시하는 한글 사유 */
  readonly reasonKo?: string;
}

export type SlotCapabilityMap = Readonly<Record<SlotKind, SlotCapability>>;

/** 프리셋 id는 `<slot>/<name>` 형태로 슬롯을 자체 포함한다. */
export type PresetId = `${SlotKind}/${string}`;

const SLOT_KIND_SET: ReadonlySet<string> = new Set(CHARACTER_SLOT_KINDS);

export function isSlotKind(value: string): value is SlotKind {
  return SLOT_KIND_SET.has(value);
}

/** `<slot>/<name>` 형식이고 슬롯이 어휘 안이며 name이 kebab-case인지 판별 */
export function isPresetId(value: unknown): value is PresetId {
  if (typeof value !== "string") return false;
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return false;
  const slot = value.slice(0, slash);
  const name = value.slice(slash + 1);
  return isSlotKind(slot) && /^[a-z0-9][a-z0-9-]*$/u.test(name);
}

/** 프리셋 id에서 슬롯을 꺼낸다. 형식이 틀리면 throw(계약 위반은 조용히 넘기지 않는다). */
export function presetSlot(id: PresetId): SlotKind {
  const slot = id.slice(0, id.indexOf("/"));
  if (!isSlotKind(slot)) {
    throw new Error(`프리셋 id의 슬롯이 어휘 밖입니다: ${id}`);
  }
  return slot;
}

/** 프리셋 id에서 이름 부분만 꺼낸다. */
export function presetName(id: PresetId): string {
  return id.slice(id.indexOf("/") + 1);
}

/** 슬롯과 이름으로 프리셋 id를 만든다. */
export function makePresetId(slot: SlotKind, name: string): PresetId {
  return `${slot}/${name}`;
}

function capabilityMap(status: SlotCapabilityStatus, reasonKo?: string): SlotCapabilityMap {
  const entries = CHARACTER_SLOT_KINDS.map((slot) => [
    slot,
    reasonKo === undefined ? { status } : { status, reasonKo },
  ]);
  return Object.freeze(Object.fromEntries(entries) as Record<SlotKind, SlotCapability>);
}

/** 절차적 소스 기본값: 15슬롯 전부 available */
export const ALL_AVAILABLE_CAPABILITIES: SlotCapabilityMap = capabilityMap("available");

/** 소스가 아직 없을 때(엔진 미선택 등) 기본값 */
export const ALL_UNAVAILABLE_CAPABILITIES: SlotCapabilityMap = capabilityMap(
  "unavailable",
  "캐릭터 소스가 아직 로드되지 않았습니다.",
);
