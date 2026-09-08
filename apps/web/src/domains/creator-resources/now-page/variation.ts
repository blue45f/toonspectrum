import type { DailyTheme, DirectingMode, KstDay, NowModeId } from "../now";

export interface VariationOption<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  readonly summary: string;
  readonly directive: string;
  readonly proof: string;
}

export const FRAMING_OPTIONS = [
  {
    id: "detail",
    label: "극근접",
    summary: "손·표면·흔적부터 시작",
    directive: "첫 컷은 사물의 일부만 보여주고 공간 정보는 2컷 뒤에 공개하세요.",
    proof: "첫 컷만 보아도 촉감이나 온도를 상상할 수 있는지 확인합니다.",
  },
  {
    id: "medium",
    label: "중거리",
    summary: "인물과 단서를 한 화면에 배치",
    directive: "인물의 행동과 핵심 사물이 동시에 읽히는 시선 높이를 유지하세요.",
    proof: "인물의 목적과 핵심 단서가 3초 안에 함께 읽히는지 확인합니다.",
  },
  {
    id: "wide",
    label: "원경",
    summary: "공간이 인물을 압도하게 구성",
    directive: "첫 두 컷에서 공간의 규칙과 빈자리를 크게 보여준 뒤 인물에게 접근하세요.",
    proof: "인물을 가려도 공간 자체가 사건의 성격을 설명하는지 확인합니다.",
  },
  {
    id: "overhead",
    label: "부감",
    summary: "배치와 이동 경로를 도식화",
    directive: "소품의 위치와 인물의 이동선을 위에서 내려다본 하나의 패턴으로 설계하세요.",
    proof: "대사 없이도 시작점·충돌점·도착점이 구분되는지 확인합니다.",
  },
] as const satisfies readonly VariationOption[];

export const PRESSURE_OPTIONS = [
  {
    id: "deadline",
    label: "시간 제한",
    summary: "곧 닫히거나 사라지는 조건",
    directive: "3컷 안에 되돌릴 수 없는 마감 신호를 보여주고 4컷에서 선택하게 하세요.",
    proof: "시계 문자를 쓰지 않아도 시간이 부족하다는 감각이 전달되는지 확인합니다.",
  },
  {
    id: "contradiction",
    label: "감각의 모순",
    summary: "보이는 것과 들리는 것이 불일치",
    directive: "빛·소리·사물 중 하나가 나머지 정보와 충돌하도록 두 번 반복하세요.",
    proof: "독자가 오류가 아니라 의도된 단서라고 알아차릴 수 있는지 확인합니다.",
  },
  {
    id: "witness",
    label: "숨은 목격자",
    summary: "화면 밖 시선이 장면을 압박",
    directive: "직접 보여주지 않은 관찰자의 존재를 반사·그림자·반응 중 하나로 암시하세요.",
    proof: "목격자를 공개하지 않아도 누군가 보고 있다는 긴장이 남는지 확인합니다.",
  },
  {
    id: "reversal",
    label: "의미 반전",
    summary: "같은 사물이 마지막에 다른 뜻을 획득",
    directive: "1컷의 핵심 사물을 5컷에서 같은 구도로 되돌려 의미만 뒤집으세요.",
    proof: "마지막 컷을 본 뒤 독자가 첫 컷을 다시 보고 싶어지는지 확인합니다.",
  },
] as const satisfies readonly VariationOption[];

export const DIALOGUE_OPTIONS = [
  {
    id: "silent",
    label: "무대사",
    summary: "행동·거리·소리만 사용",
    directive: "말풍선과 설명문을 쓰지 말고 손의 멈춤, 시선, 사운드 효과로 정보를 전달하세요.",
    proof: "텍스트를 모두 지워도 핵심 변화가 남는지 확인합니다.",
  },
  {
    id: "one-line",
    label: "한 문장",
    summary: "전체 장면에 대사 한 줄만 허용",
    directive: "유일한 대사는 설명이 아니라 인물의 선택을 바꾸는 행동으로 사용하세요.",
    proof: "그 문장을 빼면 장면의 방향이 달라지는지 확인합니다.",
  },
  {
    id: "sparse",
    label: "30자 제한",
    summary: "짧은 말과 충분한 여백",
    directive: "전체 텍스트를 한국어 30자 안으로 제한하고 컷마다 같은 정보를 반복하지 마세요.",
    proof: "텍스트가 이미 보이는 정보를 다시 설명하지 않는지 확인합니다.",
  },
  {
    id: "caption",
    label: "기록문만",
    summary: "대신 메모·표지·기록으로 말하기",
    directive: "인물 대사 대신 장부, 표지판, 메모처럼 장면 안에 존재하는 문자만 사용하세요.",
    proof: "문자가 소품이면서 동시에 사건 단서로 기능하는지 확인합니다.",
  },
] as const satisfies readonly VariationOption[];

export const VISUAL_RULE_OPTIONS = [
  {
    id: "two-tone",
    label: "2색 팔레트",
    summary: "기본색 하나와 단서색 하나",
    directive: "배경과 인물을 한 색군으로 묶고 핵심 단서에만 두 번째 색을 허용하세요.",
    proof: "흑백으로 바꿔도 단서의 명도 대비가 유지되는지 확인합니다.",
  },
  {
    id: "repeat",
    label: "반복 구도",
    summary: "같은 카메라를 세 번 재사용",
    directive: "동일 구도를 최소 세 번 반복하고 매번 사물 하나만 바꿔 시간과 사건을 보여주세요.",
    proof: "세 장을 나란히 놓았을 때 변화가 즉시 비교되는지 확인합니다.",
  },
  {
    id: "silhouette",
    label: "실루엣",
    summary: "표정보다 형태와 간격",
    directive: "인물의 얼굴 정보를 줄이고 윤곽, 자세, 인물 사이의 간격으로 감정을 설계하세요.",
    proof: "축소된 썸네일에서도 관계와 감정 방향이 읽히는지 확인합니다.",
  },
  {
    id: "single-light",
    label: "단일 광원",
    summary: "하나의 빛이 정보 공개를 통제",
    directive: "광원 하나만 두고 빛의 범위 안팎으로 단서가 들어오고 나가게 구성하세요.",
    proof: "광원 위치를 가렸을 때도 그림자 방향이 일관적인지 확인합니다.",
  },
] as const satisfies readonly VariationOption[];

export type FramingId = (typeof FRAMING_OPTIONS)[number]["id"];
export type PressureId = (typeof PRESSURE_OPTIONS)[number]["id"];
export type DialogueId = (typeof DIALOGUE_OPTIONS)[number]["id"];
export type VisualRuleId = (typeof VISUAL_RULE_OPTIONS)[number]["id"];
export type VariationCandidateId = "route-1" | "route-2" | "route-3";

export interface VariationSelection {
  framing: FramingId;
  pressure: PressureId;
  dialogue: DialogueId;
  visualRule: VisualRuleId;
}

export interface VariationDayState {
  selection: VariationSelection;
  shuffle: number;
  selectedCandidateId: VariationCandidateId;
  note: string;
}

export interface VariationState {
  version: 1;
  byDate: Record<string, VariationDayState>;
}

export interface VariationCandidate {
  id: VariationCandidateId;
  routeLabel: string;
  title: string;
  signature: string;
  hook: string;
  panelPlan: string;
  constraint: string;
  successCheck: string;
  startAction: string;
}

export interface VariationContext {
  day: KstDay;
  theme: DailyTheme;
  mode: DirectingMode;
  sessionMinutes: number;
  selection: VariationSelection;
  shuffle: number;
}

export const NOW_VARIATION_STORAGE_KEY = "toonstudio:daily-inspiration:variation-lab:v1";
export const NOW_VARIATION_NOTE_MAX_LENGTH = 1200;

const MAX_STORAGE_BYTES = 200_000;
const MAX_DAYS = 45;
const MAX_SHUFFLE = 9_999;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const CANDIDATE_IDS = new Set<string>(["route-1", "route-2", "route-3"]);
const FRAMING_IDS = new Set<string>(FRAMING_OPTIONS.map((option) => option.id));
const PRESSURE_IDS = new Set<string>(PRESSURE_OPTIONS.map((option) => option.id));
const DIALOGUE_IDS = new Set<string>(DIALOGUE_OPTIONS.map((option) => option.id));
const VISUAL_RULE_IDS = new Set<string>(VISUAL_RULE_OPTIONS.map((option) => option.id));

const OPENING_PATTERNS = [
  "결과를 먼저 보여주고 원인은 두 컷 뒤에 공개합니다.",
  "평온한 반복을 두 번 쌓은 뒤 세 번째 반복에서 규칙을 깨뜨립니다.",
  "화면 밖 소리를 먼저 들려주고 반응을 거쳐 정체를 보여줍니다.",
  "핵심 사물을 비워 둔 자리부터 보여준 뒤 누가 가져갔는지 추적합니다.",
] as const;

const TURN_PATTERNS = [
  "4컷에서 인물이 얻으려던 것과 실제로 지켜야 할 것이 충돌하게 만드세요.",
  "3컷의 작은 불일치를 5컷에서 사건의 원인으로 되돌려 주세요.",
  "관객이 믿은 공간의 방향을 한 번 뒤집되 단서는 첫 컷부터 남겨두세요.",
  "마지막 행동은 문제 해결보다 인물의 우선순위를 드러내게 하세요.",
] as const;

const ROUTE_LABELS = ["ANCHOR ROUTE", "TENSION ROUTE", "FORM ROUTE"] as const;
const ROUTE_IDS = ["route-1", "route-2", "route-3"] as const satisfies readonly VariationCandidateId[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function isFramingId(value: unknown): value is FramingId {
  return typeof value === "string" && FRAMING_IDS.has(value);
}

function isPressureId(value: unknown): value is PressureId {
  return typeof value === "string" && PRESSURE_IDS.has(value);
}

function isDialogueId(value: unknown): value is DialogueId {
  return typeof value === "string" && DIALOGUE_IDS.has(value);
}

function isVisualRuleId(value: unknown): value is VisualRuleId {
  return typeof value === "string" && VISUAL_RULE_IDS.has(value);
}

function isCandidateId(value: unknown): value is VariationCandidateId {
  return typeof value === "string" && CANDIDATE_IDS.has(value);
}

function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function pickFromSeed<T>(items: readonly T[], seed: number, salt: number): T {
  const index = (seed + Math.imul(salt, 2_654_435_761)) >>> 0;
  return items[index % items.length] ?? items[0]!;
}

function rotateOption<T extends { readonly id: string }>(
  items: readonly T[],
  selectedId: string,
  routeIndex: number,
  seed: number,
  salt: number,
): T {
  const selectedIndex = Math.max(0, items.findIndex((item) => item.id === selectedId));
  if (routeIndex === 0) return items[selectedIndex] ?? items[0]!;
  const distance = 1 + (((seed >>> (salt % 16)) + routeIndex + salt) % (items.length - 1));
  return items[(selectedIndex + distance) % items.length] ?? items[0]!;
}

function clampShuffle(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(MAX_SHUFFLE, Math.max(0, Math.trunc(value)));
}

function sanitizeSelection(value: unknown, fallback: VariationSelection): VariationSelection {
  if (!isRecord(value)) return fallback;
  return {
    framing: isFramingId(value.framing) ? value.framing : fallback.framing,
    pressure: isPressureId(value.pressure) ? value.pressure : fallback.pressure,
    dialogue: isDialogueId(value.dialogue) ? value.dialogue : fallback.dialogue,
    visualRule: isVisualRuleId(value.visualRule) ? value.visualRule : fallback.visualRule,
  };
}

export function createDefaultVariationSelection(modeId: NowModeId = "balanced"): VariationSelection {
  switch (modeId) {
    case "emotion":
      return { framing: "detail", pressure: "contradiction", dialogue: "silent", visualRule: "silhouette" };
    case "mystery":
      return { framing: "wide", pressure: "witness", dialogue: "one-line", visualRule: "single-light" };
    case "visual":
      return { framing: "overhead", pressure: "reversal", dialogue: "caption", visualRule: "repeat" };
    default:
      return { framing: "medium", pressure: "deadline", dialogue: "sparse", visualRule: "two-tone" };
  }
}

export function createDefaultVariationDayState(modeId: NowModeId = "balanced"): VariationDayState {
  return {
    selection: createDefaultVariationSelection(modeId),
    shuffle: 0,
    selectedCandidateId: "route-1",
    note: "",
  };
}

export function createEmptyVariationState(): VariationState {
  return { version: 1, byDate: {} };
}

export function parseVariationState(raw: string | null): VariationState {
  if (!raw || raw.length > MAX_STORAGE_BYTES) return createEmptyVariationState();

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !isRecord(value.byDate)) return createEmptyVariationState();

    const byDate: Record<string, VariationDayState> = {};
    const entries = Object.entries(value.byDate)
      .filter(([date, dayState]) => isIsoDate(date) && isRecord(dayState))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-MAX_DAYS);

    for (const [date, rawDayState] of entries) {
      const dayState = rawDayState as Record<string, unknown>;
      const fallback = createDefaultVariationDayState();
      byDate[date] = {
        selection: sanitizeSelection(dayState.selection, fallback.selection),
        shuffle: clampShuffle(dayState.shuffle),
        selectedCandidateId: isCandidateId(dayState.selectedCandidateId)
          ? dayState.selectedCandidateId
          : fallback.selectedCandidateId,
        note: typeof dayState.note === "string" ? dayState.note.slice(0, NOW_VARIATION_NOTE_MAX_LENGTH) : "",
      };
    }

    return { version: 1, byDate };
  } catch {
    return createEmptyVariationState();
  }
}

export function serializeVariationState(state: VariationState): string {
  return JSON.stringify(state);
}

export function getVariationDayState(
  state: VariationState,
  dayIso: string,
  modeId: NowModeId,
): VariationDayState {
  return state.byDate[dayIso] ?? createDefaultVariationDayState(modeId);
}

export function upsertVariationDayState(
  state: VariationState,
  dayIso: string,
  dayState: VariationDayState,
): VariationState {
  if (!isIsoDate(dayIso)) return state;
  const entries = Object.entries({ ...state.byDate, [dayIso]: dayState })
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-MAX_DAYS);
  return { version: 1, byDate: Object.fromEntries(entries) };
}

export function createVariationCandidates(context: VariationContext): VariationCandidate[] {
  const safeMinutes = Math.min(180, Math.max(5, Math.trunc(context.sessionMinutes || 20)));
  const seed = hashString(
    [
      context.day.iso,
      context.theme.id,
      context.mode.id,
      context.selection.framing,
      context.selection.pressure,
      context.selection.dialogue,
      context.selection.visualRule,
      String(clampShuffle(context.shuffle)),
    ].join("|"),
  );

  return ROUTE_IDS.map((id, routeIndex) => {
    const framing = rotateOption(FRAMING_OPTIONS, context.selection.framing, routeIndex, seed, 3);
    const pressure = rotateOption(PRESSURE_OPTIONS, context.selection.pressure, routeIndex, seed, 7);
    const dialogue = rotateOption(DIALOGUE_OPTIONS, context.selection.dialogue, routeIndex, seed, 11);
    const visualRule = rotateOption(VISUAL_RULE_OPTIONS, context.selection.visualRule, routeIndex, seed, 13);
    const opening = pickFromSeed(OPENING_PATTERNS, seed, 17 + routeIndex * 5);
    const turn = pickFromSeed(TURN_PATTERNS, seed, 23 + routeIndex * 7);
    const startMinutes = Math.max(1, Math.round(safeMinutes * (routeIndex === 0 ? 0.15 : 0.2)));

    return {
      id,
      routeLabel: ROUTE_LABELS[routeIndex] ?? ROUTE_LABELS[0],
      title: `${framing.label} × ${pressure.label}`,
      signature: `${framing.label} · ${pressure.label} · ${dialogue.label} · ${visualRule.label}`,
      hook: `핵심 사물 ‘${context.theme.object}’. ${framing.summary}. ${pressure.summary}. ${opening}`,
      panelPlan: `${context.mode.pacing}. ${framing.directive} ${pressure.directive} ${turn}`,
      constraint: `${dialogue.directive} ${visualRule.directive}`,
      successCheck: `${framing.proof} ${pressure.proof} ${dialogue.proof} ${visualRule.proof}`,
      startAction: `첫 ${startMinutes}분 동안 ${context.theme.place}의 가장 큰 형태와 ‘${context.theme.moods[0] ?? "분위기"}’을 보여줄 한 컷만 그립니다.`,
    };
  });
}

export function makeVariationBrief(
  context: Omit<VariationContext, "selection" | "shuffle">,
  candidate: VariationCandidate,
  note: string,
): string {
  const safeNote = note.trim().slice(0, NOW_VARIATION_NOTE_MAX_LENGTH);
  return [
    `ToonStudio 오늘의 변주 랩 · ${context.day.label}`,
    "",
    `원본 장면: ${context.theme.title}`,
    `원본 미션: ${context.theme.mission}`,
    `연출 모드: ${context.mode.label}`,
    `제작 세션: ${Math.max(5, Math.trunc(context.sessionMinutes || 20))}분`,
    "",
    `선택안: ${candidate.title}`,
    `조합: ${candidate.signature}`,
    `훅: ${candidate.hook}`,
    `5컷 전략: ${candidate.panelPlan}`,
    `제약: ${candidate.constraint}`,
    `완료 기준: ${candidate.successCheck}`,
    `첫 행동: ${candidate.startAction}`,
    ...(safeNote ? ["", `개인 메모: ${safeNote}`] : []),
  ].join("\n");
}
