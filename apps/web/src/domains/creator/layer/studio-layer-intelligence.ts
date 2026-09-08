import type { LayerGroup } from "../studio-layers";
import type {
  StudioLayerColor,
  StudioLayerKind,
  StudioLayerNavigatorItem,
  StudioLayerRole,
} from "./studio-layer-navigator";

export const STUDIO_LAYER_SMART_VIEWS = [
  "all",
  "editable",
  "attention",
  "output",
  "unclassified",
  "advanced",
] as const;
export const STUDIO_LAYER_QUALITY_ISSUES = [
  "default-name",
  "unknown-kind",
  "disabled-mask",
  "zero-opacity",
  "orphan-group",
] as const;

export type StudioLayerSmartView = (typeof STUDIO_LAYER_SMART_VIEWS)[number];
export type StudioLayerQualityIssue = (typeof STUDIO_LAYER_QUALITY_ISSUES)[number];

const KIND_KEYWORDS: Record<Exclude<StudioLayerKind, "all">, readonly string[]> = {
  image: ["image", "raster", "이미지", "래스터", "사진"],
  text: ["text", "type", "텍스트", "글자", "대사"],
  bubble: ["bubble", "speech", "balloon", "말풍선", "대사"],
  draw: ["draw", "pen", "line", "stroke", "선화", "펜", "그리기", "도형"],
  frame: ["frame", "panel", "컷", "패널", "프레임"],
  sticker: ["sticker", "emoji", "스티커", "장식"],
  effect: ["effect", "focus", "speed", "효과", "집중선", "속도선"],
  other: ["other", "unknown", "기타", "알 수 없음"],
};

const ROLE_SEARCH_LABELS: Record<StudioLayerRole, string> = {
  storyboard: "콘티",
  rough: "밑그림",
  lineart: "선화",
  color: "채색",
  tone: "톤",
  lettering: "레터링",
  effect: "효과",
  reference: "참고",
};

const COLOR_SEARCH_LABELS: Record<StudioLayerColor, string> = {
  red: "빨강",
  orange: "주황",
  yellow: "노랑",
  green: "초록",
  blue: "파랑",
  violet: "보라",
};

type StudioLayerSearchCacheEntry = {
  label: string;
  textContent: string | undefined;
  id: string;
  groupName: string | undefined;
  kind: Exclude<StudioLayerKind, "all">;
  role: StudioLayerRole | undefined;
  color: StudioLayerColor | undefined;
  haystack: string;
};

// 검색어만 바뀌는 동안 동일한 불변 레이어 객체의 최대 4KB NFKC 정규화를 반복하지 않는다.
// WeakMap이라 문서 교체로 객체가 사라지면 캐시도 함께 수거된다.
const STUDIO_LAYER_SEARCH_CACHE = new WeakMap<StudioLayerNavigatorItem, StudioLayerSearchCacheEntry>();

export const STUDIO_LAYER_SMART_VIEW_LABELS: Record<StudioLayerSmartView, string> = {
  all: "전체",
  editable: "바로 편집 가능",
  attention: "확인 필요",
  output: "출력 후보",
  unclassified: "분류 미완료",
  advanced: "합성·모션",
};

export const STUDIO_LAYER_SMART_VIEW_DESCRIPTIONS: Record<StudioLayerSmartView, string> = {
  all: "모든 레이어를 표시합니다.",
  editable: "실제로 보이고 잠기지 않은 레이어만 표시합니다.",
  attention: "기본 이름, 꺼진 마스크, 0% 불투명도, 손상된 그룹 등 검수가 필요한 레이어입니다.",
  output: "표시 중이며 콘티·밑그림·참고 역할이 아닌 최종 출력 후보입니다.",
  unclassified: "작업 역할 또는 색 라벨이 아직 지정되지 않은 레이어입니다.",
  advanced: "마스크, 클리핑, 참조, 알파 락, AI, 애니메이션 또는 불투명도 조정이 있는 레이어입니다.",
};

export const STUDIO_LAYER_QUALITY_ISSUE_LABELS: Record<StudioLayerQualityIssue, string> = {
  "default-name": "기본 이름",
  "unknown-kind": "알 수 없는 레이어 종류",
  "disabled-mask": "비활성 마스크",
  "zero-opacity": "표시는 켜졌지만 불투명도 0%",
  "orphan-group": "존재하지 않는 그룹 참조",
};

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}

function boundedSearchPart(value: string | null | undefined, maximum = 4_096): string {
  if (!value) return "";
  return value.slice(0, maximum);
}

function normalizedOpacity(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function searchHaystack(
  item: StudioLayerNavigatorItem,
  kind: Exclude<StudioLayerKind, "all">,
  group: LayerGroup | null
): string {
  const cached = STUDIO_LAYER_SEARCH_CACHE.get(item);
  if (
    cached?.label === item.label &&
    cached.textContent === item.textContent &&
    cached.id === item.id &&
    cached.groupName === group?.name &&
    cached.kind === kind &&
    cached.role === item.role &&
    cached.color === item.color
  ) return cached.haystack;
  const haystack = normalizeSearchText(
    [
      boundedSearchPart(item.label, 512),
      boundedSearchPart(item.textContent),
      boundedSearchPart(item.id, 256),
      boundedSearchPart(group?.name, 256),
      ...KIND_KEYWORDS[kind],
      item.role ? `${item.role} ${ROLE_SEARCH_LABELS[item.role]}` : "",
      item.color ? `${item.color} ${COLOR_SEARCH_LABELS[item.color]}` : "",
    ].join(" ")
  );
  STUDIO_LAYER_SEARCH_CACHE.set(item, {
    label: item.label,
    textContent: item.textContent,
    id: item.id,
    groupName: group?.name,
    kind,
    role: item.role,
    color: item.color,
    haystack,
  });
  return haystack;
}

const DEFAULT_LAYER_NAME_PATTERN = /^(?:layer|new layer|untitled|레이어|새 레이어|무제)(?:[\s_-]*\d+)?$/iu;

export function inspectStudioLayerQuality(
  item: StudioLayerNavigatorItem,
  context: {
    kind: Exclude<StudioLayerKind, "all">;
    group: LayerGroup | null;
    effectivelyHidden: boolean;
  }
): readonly StudioLayerQualityIssue[] {
  const issues: StudioLayerQualityIssue[] = [];
  const label = normalizeSearchText(item.label);
  if (!label || DEFAULT_LAYER_NAME_PATTERN.test(label)) issues.push("default-name");
  if (context.kind === "other") issues.push("unknown-kind");
  if (item.masked === true && item.maskEnabled === false) issues.push("disabled-mask");
  if (!context.effectivelyHidden && normalizedOpacity(item.opacity) <= 0.005) issues.push("zero-opacity");
  if (item.groupId !== undefined && context.group === null) issues.push("orphan-group");
  return issues;
}

export function matchesStudioLayerSmartView(
  view: StudioLayerSmartView,
  item: StudioLayerNavigatorItem,
  kind: Exclude<StudioLayerKind, "all">,
  group: LayerGroup | null,
  effectivelyHidden: boolean,
  effectivelyLocked: boolean
): boolean {
  if (view === "all") return true;
  if (view === "editable") return !effectivelyHidden && !effectivelyLocked;
  if (view === "attention") {
    return inspectStudioLayerQuality(item, { kind, group, effectivelyHidden }).length > 0;
  }
  if (view === "output") {
    return (
      !effectivelyHidden &&
      item.role !== "storyboard" &&
      item.role !== "rough" &&
      item.role !== "reference"
    );
  }
  if (view === "unclassified") return item.role === undefined || item.color === undefined;
  return (
    item.masked === true ||
    item.clipBelow === true ||
    item.animated === true ||
    item.aiGenerated === true ||
    item.alphaLocked === true ||
    item.fillReference === true ||
    normalizedOpacity(item.opacity) < 0.999
  );
}

export type StudioLayerQueryState =
  | "visible"
  | "hidden"
  | "locked"
  | "unlocked"
  | "masked"
  | "unmasked"
  | "mask-enabled"
  | "mask-disabled"
  | "reference"
  | "alpha-locked"
  | "ai"
  | "clipped"
  | "animated"
  | "grouped"
  | "ungrouped"
  | "role"
  | "no-role"
  | "color"
  | "no-color"
  | "text"
  | "no-text"
  | "default-name"
  | "unknown-kind"
  | "zero-opacity"
  | "orphan-group"
  | "editable"
  | "attention"
  | "output"
  | "unclassified"
  | "advanced";

export type StudioLayerQueryTerm =
  | { kind: "text"; value: string; negated: boolean; raw: string }
  | { kind: "name"; value: string; negated: boolean; raw: string }
  | { kind: "content"; value: string; negated: boolean; raw: string }
  | { kind: "id"; value: string; negated: boolean; raw: string }
  | { kind: "group"; value: string | null; negated: boolean; raw: string }
  | {
      kind: "layer-kind";
      values: readonly Exclude<StudioLayerKind, "all">[];
      negated: boolean;
      raw: string;
    }
  | { kind: "role"; values: readonly (StudioLayerRole | "none")[]; negated: boolean; raw: string }
  | { kind: "color"; values: readonly (StudioLayerColor | "none")[]; negated: boolean; raw: string }
  | { kind: "state"; values: readonly StudioLayerQueryState[]; negated: boolean; raw: string }
  | { kind: "smart"; values: readonly Exclude<StudioLayerSmartView, "all">[]; negated: boolean; raw: string }
  | {
      kind: "opacity";
      operator: "=" | "!=" | "<" | "<=" | ">" | ">=";
      value: number;
      negated: boolean;
      raw: string;
    }
  | { kind: "invalid"; negated: false; raw: string };

export interface StudioLayerQueryDiagnostic {
  token: string;
  code: "unterminated-quote" | "unknown-value" | "invalid-opacity" | "empty-value";
  message: string;
}

export interface StudioLayerQueryPlan {
  terms: readonly StudioLayerQueryTerm[];
  diagnostics: readonly StudioLayerQueryDiagnostic[];
}

type StudioLayerQueryField =
  | "kind"
  | "role"
  | "color"
  | "group"
  | "id"
  | "name"
  | "content"
  | "state"
  | "opacity"
  | "smart";

const QUERY_FIELD_ALIASES = new Map<string, StudioLayerQueryField>([
  ["kind", "kind"],
  ["type", "kind"],
  ["종류", "kind"],
  ["유형", "kind"],
  ["role", "role"],
  ["역할", "role"],
  ["color", "color"],
  ["colour", "color"],
  ["label", "color"],
  ["색", "color"],
  ["라벨", "color"],
  ["group", "group"],
  ["folder", "group"],
  ["그룹", "group"],
  ["폴더", "group"],
  ["id", "id"],
  ["name", "name"],
  ["이름", "name"],
  ["text", "content"],
  ["content", "content"],
  ["대사", "content"],
  ["내용", "content"],
  ["is", "state"],
  ["has", "state"],
  ["state", "state"],
  ["flag", "state"],
  ["상태", "state"],
  ["속성", "state"],
  ["기능", "state"],
  ["opacity", "opacity"],
  ["alpha", "opacity"],
  ["불투명도", "opacity"],
  ["view", "smart"],
  ["smart", "smart"],
  ["보기", "smart"],
  ["스마트", "smart"],
]);

function buildAliasMap<Value extends string>(entries: readonly (readonly [Value, readonly string[]])[]): Map<string, Value> {
  const aliases = new Map<string, Value>();
  for (const [value, names] of entries) {
    aliases.set(normalizeSearchText(value), value);
    for (const name of names) aliases.set(normalizeSearchText(name), value);
  }
  return aliases;
}

const QUERY_KIND_ALIASES = buildAliasMap<Exclude<StudioLayerKind, "all">>([
  ["image", ["raster", "이미지", "래스터", "사진"]],
  ["text", ["type", "텍스트", "글자"]],
  ["bubble", ["speech", "balloon", "말풍선", "대사"]],
  ["draw", ["pen", "line", "stroke", "선화", "펜", "그리기", "도형"]],
  ["frame", ["panel", "컷", "패널", "프레임"]],
  ["sticker", ["emoji", "스티커", "장식"]],
  ["effect", ["focus", "speed", "효과", "집중선", "속도선"]],
  ["other", ["unknown", "기타", "알 수 없음"]],
]);

const QUERY_ROLE_ALIASES = buildAliasMap<StudioLayerRole | "none">([
  ["storyboard", ["콘티", "스토리보드"]],
  ["rough", ["밑그림", "러프"]],
  ["lineart", ["선화", "라인아트"]],
  ["color", ["채색", "컬러"]],
  ["tone", ["톤", "스크린톤"]],
  ["lettering", ["레터링", "식자"]],
  ["effect", ["효과", "이펙트"]],
  ["reference", ["참고", "참조"]],
  ["none", ["없음", "미지정", "unassigned"]],
]);

const QUERY_COLOR_ALIASES = buildAliasMap<StudioLayerColor | "none">([
  ["red", ["빨강", "빨간색"]],
  ["orange", ["주황", "주황색"]],
  ["yellow", ["노랑", "노란색"]],
  ["green", ["초록", "초록색"]],
  ["blue", ["파랑", "파란색"]],
  ["violet", ["purple", "보라", "보라색"]],
  ["none", ["없음", "미지정", "unassigned"]],
]);

const QUERY_SMART_ALIASES = buildAliasMap<Exclude<StudioLayerSmartView, "all">>([
  ["editable", ["edit", "편집", "편집 가능", "바로 편집 가능"]],
  ["attention", ["review", "issue", "확인", "확인 필요", "검수"]],
  ["output", ["export", "final", "출력", "출력 후보", "최종"]],
  ["unclassified", ["unassigned", "분류 미완료", "미분류"]],
  ["advanced", ["complex", "합성", "모션", "합성 모션"]],
]);

const QUERY_STATE_ALIASES = buildAliasMap<StudioLayerQueryState>([
  ["visible", ["shown", "show", "표시", "보임"]],
  ["hidden", ["hide", "숨김", "숨긴"]],
  ["locked", ["lock", "잠금", "잠김"]],
  ["unlocked", ["unlock", "잠금 해제", "안 잠김"]],
  ["masked", ["mask", "마스크"]],
  ["unmasked", ["no-mask", "마스크 없음"]],
  ["mask-enabled", ["enabled-mask", "마스크 켜짐", "활성 마스크"]],
  ["mask-disabled", ["disabled-mask", "마스크 꺼짐", "비활성 마스크"]],
  ["reference", ["ref", "fill-reference", "채우기 참조", "참조"]],
  ["alpha-locked", ["alpha-lock", "알파 락", "투명 픽셀 잠금"]],
  ["ai", ["ai-generated", "ai 작업", "ai 생성"]],
  ["clipped", ["clip", "clipping", "클리핑", "아래 클리핑"]],
  ["animated", ["animation", "애니메이션", "모션"]],
  ["grouped", ["in-group", "그룹", "그룹 소속"]],
  ["ungrouped", ["no-group", "그룹 없음", "그룹 밖"]],
  ["role", ["has-role", "역할 있음"]],
  ["no-role", ["without-role", "역할 없음"]],
  ["color", ["has-color", "색 있음", "라벨 있음"]],
  ["no-color", ["without-color", "색 없음", "라벨 없음"]],
  ["text", ["has-text", "대사 있음", "텍스트 있음"]],
  ["no-text", ["without-text", "대사 없음", "텍스트 없음"]],
  ["default-name", ["generic-name", "기본 이름", "자동 이름"]],
  ["unknown-kind", ["unknown-type", "알 수 없는 종류", "미지원 종류"]],
  ["zero-opacity", ["transparent", "0% 불투명도", "완전 투명"]],
  ["orphan-group", ["missing-group", "손상 그룹", "없는 그룹"]],
  ["editable", ["edit", "편집 가능"]],
  ["attention", ["review", "issue", "확인 필요", "검수"]],
  ["output", ["export", "final", "출력 후보", "최종"]],
  ["unclassified", ["unassigned", "분류 미완료", "미분류"]],
  ["advanced", ["complex", "합성 모션", "고급"]],
]);

function tokenizeStudioLayerQuery(input: string): {
  tokens: readonly string[];
  unterminatedQuote: boolean;
} {
  const source = input.normalize("NFKC").slice(0, 512);
  const tokens: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;
  let escaped = false;
  for (const character of source) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/u.test(character)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (escaped) current += "\\";
  if (current) tokens.push(current);
  return { tokens, unterminatedQuote: quote !== null };
}

function splitQueryAlternatives(value: string): readonly string[] {
  return value.split(/[|,]/u).map(normalizeSearchText).filter(Boolean);
}

function resolveQueryValues<Value extends string>(
  rawValue: string,
  aliases: ReadonlyMap<string, Value>,
  token: string,
  diagnostics: StudioLayerQueryDiagnostic[]
): { values: readonly Value[]; valid: boolean } {
  const result: Value[] = [];
  const unknown: string[] = [];
  for (const candidate of splitQueryAlternatives(rawValue)) {
    const value = aliases.get(candidate);
    if (value) result.push(value);
    else unknown.push(candidate);
  }
  if (unknown.length > 0) {
    diagnostics.push({
      token,
      code: "unknown-value",
      message: `지원하지 않는 값: ${unknown.join(", ")}`,
    });
  }
  return { values: [...new Set(result)], valid: unknown.length === 0 };
}

function parseOpacityTerm(
  value: string,
  raw: string,
  negated: boolean,
  diagnostics: StudioLayerQueryDiagnostic[]
): StudioLayerQueryTerm {
  const match = value.match(/^(!=|<=|>=|=|<|>)?\s*(\d+(?:\.\d+)?)\s*(%)?$/u);
  if (!match) {
    diagnostics.push({ token: raw, code: "invalid-opacity", message: "불투명도는 0–1 또는 0–100%로 입력하세요." });
    return { kind: "invalid", negated: false, raw };
  }
  const numeric = Number(match[2]);
  const normalized = (match[3] || numeric > 1) ? numeric / 100 : numeric;
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    diagnostics.push({ token: raw, code: "invalid-opacity", message: "불투명도 범위를 벗어났습니다." });
    return { kind: "invalid", negated: false, raw };
  }
  return {
    kind: "opacity",
    operator: (match[1] ?? "=") as "=" | "!=" | "<" | "<=" | ">" | ">=",
    value: normalized,
    negated,
    raw,
  };
}

export function parseStudioLayerQuery(query: string): StudioLayerQueryPlan {
  const lexed = tokenizeStudioLayerQuery(query);
  const terms: StudioLayerQueryTerm[] = [];
  const diagnostics: StudioLayerQueryDiagnostic[] = [];
  if (lexed.unterminatedQuote) {
    diagnostics.push({
      token: query.slice(0, 512),
      code: "unterminated-quote",
      message: "닫히지 않은 따옴표가 있습니다.",
    });
  }

  for (const originalToken of lexed.tokens) {
    let raw = originalToken;
    let negated = false;
    if ((raw.startsWith("-") || raw.startsWith("!")) && raw.length > 1) {
      negated = true;
      raw = raw.slice(1);
    }
    const separator = raw.indexOf(":");
    if (separator <= 0) {
      const value = normalizeSearchText(raw);
      if (value) terms.push({ kind: "text", value, negated, raw: originalToken });
      continue;
    }

    const rawField = normalizeSearchText(raw.slice(0, separator));
    const rawValue = raw.slice(separator + 1).trim();
    const field = QUERY_FIELD_ALIASES.get(rawField);
    if (!field) {
      const value = normalizeSearchText(raw);
      if (value) terms.push({ kind: "text", value, negated, raw: originalToken });
      continue;
    }
    if (!rawValue) {
      diagnostics.push({ token: originalToken, code: "empty-value", message: "필터 값이 비어 있습니다." });
      terms.push({ kind: "invalid", negated: false, raw: originalToken });
      continue;
    }

    if (field === "kind") {
      const resolved = resolveQueryValues(rawValue, QUERY_KIND_ALIASES, originalToken, diagnostics);
      terms.push(resolved.valid && resolved.values.length > 0
        ? { kind: "layer-kind", values: resolved.values, negated, raw: originalToken }
        : { kind: "invalid", negated: false, raw: originalToken });
      continue;
    }
    if (field === "role") {
      const resolved = resolveQueryValues(rawValue, QUERY_ROLE_ALIASES, originalToken, diagnostics);
      terms.push(resolved.valid && resolved.values.length > 0
        ? { kind: "role", values: resolved.values, negated, raw: originalToken }
        : { kind: "invalid", negated: false, raw: originalToken });
      continue;
    }
    if (field === "color") {
      const resolved = resolveQueryValues(rawValue, QUERY_COLOR_ALIASES, originalToken, diagnostics);
      terms.push(resolved.valid && resolved.values.length > 0
        ? { kind: "color", values: resolved.values, negated, raw: originalToken }
        : { kind: "invalid", negated: false, raw: originalToken });
      continue;
    }
    if (field === "state") {
      const resolved = resolveQueryValues(rawValue, QUERY_STATE_ALIASES, originalToken, diagnostics);
      terms.push(resolved.valid && resolved.values.length > 0
        ? { kind: "state", values: resolved.values, negated, raw: originalToken }
        : { kind: "invalid", negated: false, raw: originalToken });
      continue;
    }
    if (field === "smart") {
      const resolved = resolveQueryValues(rawValue, QUERY_SMART_ALIASES, originalToken, diagnostics);
      terms.push(resolved.valid && resolved.values.length > 0
        ? { kind: "smart", values: resolved.values, negated, raw: originalToken }
        : { kind: "invalid", negated: false, raw: originalToken });
      continue;
    }
    if (field === "opacity") {
      terms.push(parseOpacityTerm(rawValue, originalToken, negated, diagnostics));
      continue;
    }

    const value = normalizeSearchText(rawValue);
    if (field === "group") {
      const groupValue = ["none", "없음", "미지정", "ungrouped", "그룹 없음"].includes(value) ? null : value;
      terms.push({ kind: "group", value: groupValue, negated, raw: originalToken });
    } else if (field === "id") {
      terms.push({ kind: "id", value, negated, raw: originalToken });
    } else if (field === "name") {
      terms.push({ kind: "name", value, negated, raw: originalToken });
    } else {
      terms.push({ kind: "content", value, negated, raw: originalToken });
    }
  }

  return { terms, diagnostics };
}

function matchesQueryState(
  state: StudioLayerQueryState,
  item: StudioLayerNavigatorItem,
  kind: Exclude<StudioLayerKind, "all">,
  group: LayerGroup | null,
  effectivelyHidden: boolean,
  effectivelyLocked: boolean
): boolean {
  if (state === "visible") return !effectivelyHidden;
  if (state === "hidden") return effectivelyHidden;
  if (state === "locked") return effectivelyLocked;
  if (state === "unlocked") return !effectivelyLocked;
  if (state === "masked") return item.masked === true;
  if (state === "unmasked") return item.masked !== true;
  if (state === "mask-enabled") return item.masked === true && item.maskEnabled !== false;
  if (state === "mask-disabled") return item.masked === true && item.maskEnabled === false;
  if (state === "reference") return item.fillReference === true;
  if (state === "alpha-locked") return item.alphaLocked === true;
  if (state === "ai") return item.aiGenerated === true;
  if (state === "clipped") return item.clipBelow === true;
  if (state === "animated") return item.animated === true;
  if (state === "grouped") return group !== null;
  if (state === "ungrouped") return item.groupId === undefined;
  if (state === "role") return item.role !== undefined;
  if (state === "no-role") return item.role === undefined;
  if (state === "color") return item.color !== undefined;
  if (state === "no-color") return item.color === undefined;
  if (state === "text") return Boolean(normalizeSearchText(item.textContent ?? ""));
  if (state === "no-text") return !normalizeSearchText(item.textContent ?? "");
  if (state === "default-name") {
    return inspectStudioLayerQuality(item, { kind, group, effectivelyHidden }).includes("default-name");
  }
  if (state === "unknown-kind") return kind === "other";
  if (state === "zero-opacity") {
    return inspectStudioLayerQuality(item, { kind, group, effectivelyHidden }).includes("zero-opacity");
  }
  if (state === "orphan-group") return item.groupId !== undefined && group === null;
  return matchesStudioLayerSmartView(state, item, kind, group, effectivelyHidden, effectivelyLocked);
}

function opacityComparison(
  operator: "=" | "!=" | "<" | "<=" | ">" | ">=",
  actual: number,
  expected: number
): boolean {
  const tolerance = 0.005;
  if (operator === "=") return Math.abs(actual - expected) <= tolerance;
  if (operator === "!=") return Math.abs(actual - expected) > tolerance;
  if (operator === "<") return actual < expected;
  if (operator === "<=") return actual <= expected;
  if (operator === ">") return actual > expected;
  return actual >= expected;
}

function matchesStudioLayerQueryTerm(
  term: StudioLayerQueryTerm,
  item: StudioLayerNavigatorItem,
  kind: Exclude<StudioLayerKind, "all">,
  group: LayerGroup | null,
  effectivelyHidden: boolean,
  effectivelyLocked: boolean
): boolean {
  let matched = false;
  if (term.kind === "invalid") return false;
  if (term.kind === "text") {
    matched = searchHaystack(item, kind, group).includes(term.value);
  } else if (term.kind === "name") {
    matched = normalizeSearchText(item.label).includes(term.value);
  } else if (term.kind === "content") {
    matched = normalizeSearchText(item.textContent ?? "").includes(term.value);
  } else if (term.kind === "id") {
    matched = normalizeSearchText(item.id).includes(term.value);
  } else if (term.kind === "group") {
    matched = term.value === null
      ? item.groupId === undefined
      : normalizeSearchText(`${group?.name ?? ""} ${group?.id ?? ""}`).includes(term.value);
  } else if (term.kind === "layer-kind") {
    matched = term.values.includes(kind);
  } else if (term.kind === "role") {
    matched = term.values.some((value) => value === "none" ? item.role === undefined : item.role === value);
  } else if (term.kind === "color") {
    matched = term.values.some((value) => value === "none" ? item.color === undefined : item.color === value);
  } else if (term.kind === "state") {
    matched = term.values.some((state) =>
      matchesQueryState(state, item, kind, group, effectivelyHidden, effectivelyLocked)
    );
  } else if (term.kind === "smart") {
    matched = term.values.some((view) =>
      matchesStudioLayerSmartView(view, item, kind, group, effectivelyHidden, effectivelyLocked)
    );
  } else {
    matched = opacityComparison(term.operator, normalizedOpacity(item.opacity), term.value);
  }
  return term.negated ? !matched : matched;
}

export function matchesStudioLayerQuery(
  plan: StudioLayerQueryPlan,
  item: StudioLayerNavigatorItem,
  kind: Exclude<StudioLayerKind, "all">,
  group: LayerGroup | null,
  effectivelyHidden: boolean,
  effectivelyLocked: boolean
): boolean {
  return plan.terms.every((term) =>
    matchesStudioLayerQueryTerm(term, item, kind, group, effectivelyHidden, effectivelyLocked)
  );
}

