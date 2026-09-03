#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    (ROOT / relative).write_text(content, encoding="utf-8")


def replace_once(relative: str, old: str, new: str) -> None:
    source = read(relative)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one match, found {count}: {old[:100]!r}")
    write(relative, source.replace(old, new, 1))


def replace_between(relative: str, start: str, end: str, replacement: str) -> None:
    source = read(relative)
    start_index = source.find(start)
    if start_index < 0:
        raise RuntimeError(f"{relative}: start token missing: {start[:100]!r}")
    end_index = source.find(end, start_index + len(start))
    if end_index < 0:
        raise RuntimeError(f"{relative}: end token missing: {end[:100]!r}")
    write(relative, source[:start_index] + replacement + source[end_index:])


def replace_regex(relative: str, pattern: str, replacement: str) -> None:
    source = read(relative)
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1:
        raise RuntimeError(f"{relative}: regex expected one match, found {count}: {pattern[:100]!r}")
    write(relative, updated)


PANEL = "src/domains/creator/vrm/StudioVrmAvatarForgePanel.tsx"

replace_once(
    PANEL,
    '''import {
  CircleUserRound,
  Download,
  Palette,
  PersonStanding,
  RotateCcw,
  Scissors,
  Sparkles,
  UserPlus,
  WandSparkles,
} from "lucide-react";''',
    '''import {
  ArrowRight,
  ArrowRightLeft,
  CircleUserRound,
  Download,
  Palette,
  PersonStanding,
  RotateCcw,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  WandSparkles,
} from "lucide-react";''',
)

replace_once(
    PANEL,
    '''  AVATAR_FORGE_PRESETS,
  createAvatarForgeState,''',
    '''  AVATAR_FORGE_PRESETS,
  DEFAULT_AVATAR_FORGE_STATE,
  createAvatarForgeState,''',
)

replace_once(
    PANEL,
    '''import { createStudioVrmGenerateRecipe } from "./studio-vrm-generate-recipe";
import {''',
    '''import { createStudioVrmGenerateRecipe } from "./studio-vrm-generate-recipe";
import {
  countStudioVrmAvatarForgeChanges,
  describeStudioVrmAvatarForgeState,
  StudioVrmAvatarForgePreview,
} from "./StudioVrmAvatarForgePreview";
import { StudioVrmForgeRangeControl } from "./StudioVrmForgeRangeControl";
import {''',
)

replace_once(
    PANEL,
    '''const ORDERED_PROPORTION_PRESETS = Object.freeze(
  [...STUDIO_VRM_PROPORTION_PRESETS].sort(
    (left, right) => left.targetHeadUnits - right.targetHeadUnits,
  ),
);

type ForgeView = "presets" | "body" | "hair" | "face";''',
    '''const ORDERED_PROPORTION_PRESETS = Object.freeze(
  [...STUDIO_VRM_PROPORTION_PRESETS].sort(
    (left, right) => left.targetHeadUnits - right.targetHeadUnits,
  ),
);

type ForgeView = "presets" | "body" | "hair" | "face";
type ForgePresetFilter = "all" | "romance" | "modern" | "action" | "fantasy";

const FORGE_PRESET_FILTERS: ReadonlyArray<{
  readonly id: ForgePresetFilter;
  readonly label: string;
  readonly keywords: readonly string[];
}> = [
  { id: "all", label: "전체", keywords: [] },
  { id: "romance", label: "로맨스", keywords: ["romance", "soft", "long", "bob", "diva", "로맨스", "소프트"] },
  { id: "modern", label: "현대·학원", keywords: ["natural", "short", "pop", "modern", "senior", "내추럴", "숏", "팝"] },
  { id: "action", label: "액션", keywords: ["action", "pony", "fire", "wolf", "액션", "파이어"] },
  { id: "fantasy", label: "판타지", keywords: ["elegant", "silver", "mint", "gold", "fantasy", "엘리건트", "실버"] },
] as const;

const FACE_SHAPE_PRESETS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly face: AvatarForgeFaceParams;
}> = [
  {
    id: "balanced",
    label: "균형형",
    hint: "대부분의 장르에 맞는 자연스러운 기준형",
    face: { ...DEFAULT_AVATAR_FORGE_STATE.face },
  },
  {
    id: "soft-round",
    label: "부드러운 둥근형",
    hint: "넓은 볼과 짧은 턱의 친근한 인상",
    face: { headWidth: 1.1, headHeight: 0.96, headDepth: 1.02, cheekVolume: 0.72, chinLength: 0.94 },
  },
  {
    id: "oval",
    label: "계란형",
    hint: "세로로 길고 균형 잡힌 로맨스형",
    face: { headWidth: 0.98, headHeight: 1.08, headDepth: 1, cheekVolume: 0.42, chinLength: 1.05 },
  },
  {
    id: "sharp",
    label: "샤프형",
    hint: "좁은 볼과 긴 턱의 선명한 인상",
    face: { headWidth: 0.91, headHeight: 1.05, headDepth: 1.02, cheekVolume: 0.18, chinLength: 1.1 },
  },
  {
    id: "soft-volume",
    label: "볼륨형",
    hint: "볼륨을 살리고 깊이는 부드럽게 정리",
    face: { headWidth: 1.04, headHeight: 1.02, headDepth: 0.96, cheekVolume: 0.66, chinLength: 0.98 },
  },
  {
    id: "chibi",
    label: "SD 치비형",
    hint: "넓고 짧은 얼굴과 풍부한 볼륨",
    face: { headWidth: 1.14, headHeight: 0.93, headDepth: 1.06, cheekVolume: 0.8, chinLength: 0.9 },
  },
] as const;

const HAIR_COLOR_PRESETS = [
  { id: "ink", label: "잉크 블랙", baseColor: "#171515", tipColor: "#46403d" },
  { id: "espresso", label: "에스프레소", baseColor: "#2b1d18", tipColor: "#775344" },
  { id: "honey", label: "허니 블론드", baseColor: "#91611f", tipColor: "#f1ca6d" },
  { id: "silver", label: "실버", baseColor: "#777b86", tipColor: "#e8e9ee" },
  { id: "rose", label: "로즈", baseColor: "#713344", tipColor: "#e995ad" },
  { id: "violet", label: "바이올렛", baseColor: "#33254f", tipColor: "#9a7bd1" },
  { id: "ocean", label: "오션", baseColor: "#173a58", tipColor: "#5aa7cf" },
  { id: "mint", label: "민트", baseColor: "#174b48", tipColor: "#73d2c6" },
] as const;

function presetMatchesFilter(
  preset: (typeof AVATAR_FORGE_PRESETS)[number],
  filter: ForgePresetFilter,
): boolean {
  if (filter === "all") return true;
  const group = FORGE_PRESET_FILTERS.find((candidate) => candidate.id === filter);
  if (!group) return true;
  const haystack = `${preset.id} ${preset.label} ${preset.hint}`.toLocaleLowerCase("ko-KR");
  return group.keywords.some((keyword) => haystack.includes(keyword.toLocaleLowerCase("ko-KR")));
}

function sameFace(left: AvatarForgeFaceParams, right: AvatarForgeFaceParams): boolean {
  return (Object.keys(left) as Array<keyof AvatarForgeFaceParams>)
    .every((key) => Math.abs(left[key] - right[key]) < 1e-6);
}''',
)

replace_once(
    PANEL,
    '''  const [view, setView] = useState<ForgeView>("presets");
  const [generateResult, setGenerateResult] = useState<StudioVrmGenerateResult | null>(null);''',
    '''  const [view, setView] = useState<ForgeView>("presets");
  const [presetQuery, setPresetQuery] = useState("");
  const [presetFilter, setPresetFilter] = useState<ForgePresetFilter>("all");
  const [precisionMode, setPrecisionMode] = useState(false);
  const [generateResult, setGenerateResult] = useState<StudioVrmGenerateResult | null>(null);''',
)

replace_once(
    PANEL,
    '''  const [hairStyleChosen, setHairStyleChosen] = useState(false);

  // 이 의도는 **지금 편집 중인 조형 상태**에만 붙는다.''',
    '''  const [hairStyleChosen, setHairStyleChosen] = useState(false);
  const baselineRef = useRef({
    sessionId: sculptSessionId,
    state: sanitizeAvatarForgeState(state),
  });
  if (baselineRef.current.sessionId !== sculptSessionId) {
    baselineRef.current = {
      sessionId: sculptSessionId,
      state: sanitizeAvatarForgeState(state),
    };
  }

  // 이 의도는 **지금 편집 중인 조형 상태**에만 붙는다.''',
)

replace_once(
    PANEL,
    '''  const selectedProportionPreset = STUDIO_VRM_PROPORTION_PRESETS.find(
    (preset) => preset.id === state.proportions.presetId,
  );

  return (''',
    '''  const selectedProportionPreset = STUDIO_VRM_PROPORTION_PRESETS.find(
    (preset) => preset.id === state.proportions.presetId,
  );
  const visualSummary = describeStudioVrmAvatarForgeState(state, baselineRef.current.state);
  const changedControlCount = countStudioVrmAvatarForgeChanges(
    state,
    baselineRef.current.state,
  );
  const normalizedPresetQuery = presetQuery.trim().toLocaleLowerCase("ko-KR");
  const filteredPresets = useMemo(
    () => AVATAR_FORGE_PRESETS.filter((preset) => {
      if (!presetMatchesFilter(preset, presetFilter)) return false;
      if (!normalizedPresetQuery) return true;
      return `${preset.label} ${preset.hint} ${preset.id}`
        .toLocaleLowerCase("ko-KR")
        .includes(normalizedPresetQuery);
    }),
    [normalizedPresetQuery, presetFilter],
  );

  return (''',
)

replace_once(
    PANEL,
    '''        </div>

        <div role="tablist" aria-label="아바타 조형 단계" className="mt-3 grid grid-cols-4 gap-1 rounded-xl border border-line/70 bg-panel/65 p-1">''',
    '''        </div>

        <div className="mt-3 grid grid-cols-[7.4rem_minmax(0,1fr)] gap-3 rounded-2xl border border-line/70 bg-card/75 p-3 shadow-sm">
          <div className="overflow-hidden rounded-xl border border-line/80 bg-panel/70">
            <StudioVrmAvatarForgePreview
              state={state}
              variant="hero"
              label="현재 아바타 조형 미리보기"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.6rem] font-extrabold text-accent">
                실시간 조합
              </span>
              <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.6rem] font-bold text-fg-3">
                변경 {changedControlCount}개
              </span>
            </div>
            <p className="mt-2 text-[0.72rem] font-extrabold text-fg">
              {visualSummary.face} · {visualSummary.hair}
            </p>
            <p className="mt-0.5 text-[0.62rem] leading-relaxed text-fg-3">
              {visualSummary.bangs} · {visualSummary.body}. 카드로 큰 방향을 정한 뒤 숫자 입력으로 마무리하세요.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                aria-pressed={precisionMode}
                className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-line bg-panel px-2 text-[0.61rem] font-bold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => setPrecisionMode((active) => !active)}
              >
                <SlidersHorizontal size={12} aria-hidden />
                {precisionMode ? "빠른 편집" : "정밀 편집"}
              </button>
              <button
                type="button"
                disabled={disabled || changedControlCount === 0}
                className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-line bg-panel px-2 text-[0.61rem] font-bold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-35"
                onClick={() => emit(sanitizeAvatarForgeState(baselineRef.current.state))}
              >
                <RotateCcw size={12} aria-hidden />
                시작 상태
              </button>
            </div>
          </div>
        </div>

        <div role="tablist" aria-label="아바타 조형 단계" className="mt-3 grid grid-cols-4 gap-1 rounded-xl border border-line/70 bg-panel/65 p-1">''',
)

replace_once(
    PANEL,
    '''                <Icon size={14} className="shrink-0 max-[360px]:hidden" aria-hidden />
                <span className="min-w-0 truncate">{item.label}</span>''',
    '''                <Icon size={14} className="shrink-0 max-[360px]:hidden" aria-hidden />
                <span className="min-w-0 truncate">{item.label}</span>
                <span className="sr-only">{item.hint}</span>''',
)

PRESETS_BLOCK = '''        {view === "presets" ? (
          <div role="tabpanel" aria-label="아바타 스타일 프리셋" className="space-y-3.5">
            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[0.7rem] font-extrabold text-fg">완성형 스타일</p>
                  <p className="mt-0.5 text-[0.6rem] text-fg-3">실제 얼굴·헤어·색 조합을 보고 시작점을 고릅니다.</p>
                </div>
                <span className="text-[0.6rem] tabular-nums text-fg-3">{filteredPresets.length}개</span>
              </div>
              <label className="relative mt-2 block">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden />
                <input
                  type="search"
                  value={presetQuery}
                  aria-label="아바타 스타일 검색"
                  placeholder="분위기·장르·헤어 검색"
                  className="min-h-11 w-full rounded-xl border border-line bg-card pl-9 pr-3 text-xs text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  onChange={(event) => setPresetQuery(event.currentTarget.value)}
                />
              </label>
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]" role="radiogroup" aria-label="스타일 장르 필터">
                {FORGE_PRESET_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    role="radio"
                    aria-checked={presetFilter === filter.id}
                    className={`min-h-9 shrink-0 rounded-full border px-3 text-[0.61rem] font-bold transition-colors ${
                      presetFilter === filter.id
                        ? "border-accent/60 bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
                    }`}
                    onClick={() => setPresetFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredPresets.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {filteredPresets.map((preset) => {
                  const selected = state.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      aria-label={`${preset.label} 스타일 적용: ${preset.hint}`}
                      onClick={() => {
                        setHairStyleChosen(false);
                        emit(createAvatarForgeState(preset.id));
                      }}
                      className={`group min-h-[10.5rem] overflow-hidden rounded-2xl border text-left transition-[border-color,background-color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${
                        selected
                          ? "border-accent bg-accent-soft text-accent shadow-sm"
                          : "border-line bg-card text-fg hover:-translate-y-0.5 hover:bg-raised"
                      }`}
                    >
                      <span className="block h-[6.4rem] overflow-hidden border-b border-line/60 bg-panel/60 px-1 pt-1">
                        <StudioVrmAvatarForgePreview
                          state={preset.state}
                          variant="card"
                          showBody
                          label={`${preset.label} 조합 미리보기`}
                        />
                      </span>
                      <span className="block p-2.5">
                        <span className="block truncate text-[0.7rem] font-extrabold">{preset.label}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[0.59rem] leading-relaxed text-fg-3">{preset.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line bg-card/55 p-4 text-center text-[0.65rem] text-fg-3">
                검색 조건과 일치하는 스타일이 없습니다.
              </div>
            )}

            <details className="group rounded-xl border border-line bg-card/55 p-3">
              <summary className="flex min-h-9 cursor-pointer list-none items-center text-[0.68rem] font-bold text-fg-2 [&::-webkit-details-marker]:hidden">
                캐릭터 베리언트
                <span className="ml-auto text-[0.6rem] text-fg-3">얼굴 유지 · 실루엣 교체</span>
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line/60 pt-3">
                {listStudioVrmCharacterVariantSummaries().map((variant) => {
                  const previewState = applyStudioVrmCharacterVariant(state, variant.id);
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={disabled}
                      aria-label={`${variant.label} 베리언트: ${variant.description}`}
                      title={variant.tags.join(" · ")}
                      onClick={() => emit(previewState)}
                      className="overflow-hidden rounded-xl border border-line bg-card text-left text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
                    >
                      <span className="block h-20 overflow-hidden border-b border-line/60 bg-panel/60 px-1">
                        <StudioVrmAvatarForgePreview state={previewState} variant="compact" label={`${variant.label} 미리보기`} />
                      </span>
                      <span className="block p-2.5">
                        <span className="block truncate text-[0.67rem] font-extrabold">{variant.label}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[0.58rem] leading-relaxed text-fg-3">{variant.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </details>

            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-accent/25 bg-accent-soft/30 p-2">
              {([
                ["face", "얼굴형"],
                ["hair", "헤어"],
                ["body", "체형"],
              ] as const).map(([target, label]) => (
                <button
                  key={target}
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2 text-[0.62rem] font-bold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => setView(target)}
                >
                  {label}
                  <ArrowRight size={11} aria-hidden />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {view === "body" ? ('''
replace_regex(
    PANEL,
    r'        \{view === "presets" \? \([\s\S]*?        \) : null\}\n\n        \{view === "body" \? \(',
    PRESETS_BLOCK,
)

replace_between(
    PANEL,
    '''                {ORDERED_PROPORTION_PRESETS.map((preset) => {''',
    '''              </div>
            </div>

            <div className="rounded-lg border border-line bg-card/70 p-3">''',
    '''                {ORDERED_PROPORTION_PRESETS.map((preset) => {
                  const selected = state.proportions.presetId === preset.id;
                  const previewState = sanitizeAvatarForgeState({
                    ...state,
                    presetId: undefined,
                    bodyPresetId: undefined,
                    proportions: preset.proportions,
                  });
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={proportionControlsDisabled}
                      aria-pressed={selected}
                      aria-label={`${preset.label} 체형: ${preset.hint}`}
                      onClick={() => emit(previewState)}
                      className={`min-h-[8.5rem] overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${
                        selected
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-card text-fg hover:bg-raised"
                      }`}
                    >
                      <span className="block h-[5.2rem] overflow-hidden border-b border-line/60 bg-panel/60 px-1">
                        <StudioVrmAvatarForgePreview state={previewState} variant="compact" label={`${preset.label} 체형 미리보기`} />
                      </span>
                      <span className="block p-2">
                        <span className="block truncate text-[0.67rem] font-extrabold">{preset.label}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[0.58rem] leading-snug text-fg-3">{preset.hint}</span>
                      </span>
                    </button>
                  );
                })}
''',
)

replace_between(
    PANEL,
    '''                {STUDIO_VRM_PROPORTION_KEYS.map((key) => {''',
    '''              </div>
            </div>

            <p
              role="status"''',
    '''                {STUDIO_VRM_PROPORTION_KEYS.map((key) => {
                  const limit = STUDIO_VRM_PROPORTION_LIMITS[key];
                  return (
                    <StudioVrmForgeRangeControl
                      key={key}
                      label={limit.label}
                      hint={limit.hint}
                      value={state.proportions[key]}
                      minimum={limit.min}
                      maximum={limit.max}
                      step={limit.step}
                      defaultValue={DEFAULT_AVATAR_FORGE_STATE.proportions[key]}
                      unit={limit.unit ?? "%"}
                      disabled={proportionControlsDisabled}
                      onChange={(value) => updateProportion(key, value)}
                    />
                  );
                })}
''',
)

replace_once(
    PANEL,
    '''              <div className="grid grid-cols-4 gap-1.5">''',
    '''              <div className="grid grid-cols-3 gap-1.5">''',
)

replace_between(
    PANEL,
    '''                {AVATAR_FORGE_HAIR_STYLE_OPTIONS.map((option) => {''',
    '''              </div>
            </div>

            <div>
              <p className="mb-2 text-[0.68rem] font-bold text-fg-2">앞머리 형태</p>''',
    '''                {AVATAR_FORGE_HAIR_STYLE_OPTIONS.map((option) => {
                  const selected = state.hair.style === option.id;
                  const previewState = sanitizeAvatarForgeState({
                    ...state,
                    presetId: undefined,
                    hair: { ...state.hair, style: option.id },
                  });
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={disabled}
                      aria-label={option.label}
                      aria-pressed={selected}
                      title={option.hint}
                      onClick={() => {
                        setHairStyleChosen(true);
                        updateHair("style", option.id);
                      }}
                      className={`min-h-[7.5rem] overflow-hidden rounded-xl border text-[0.62rem] font-bold transition-colors disabled:opacity-40 ${
                        selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"
                      }`}
                    >
                      <span className="block h-[4.8rem] overflow-hidden border-b border-line/60 bg-panel/60 px-1">
                        <StudioVrmAvatarForgePreview state={previewState} variant="compact" showBody={false} label={`${option.label} 헤어 미리보기`} />
                      </span>
                      <span className="block truncate px-1.5 py-2 text-center">{option.label}</span>
                    </button>
                  );
                })}
''',
)

replace_between(
    PANEL,
    '''                {AVATAR_FORGE_BANG_STYLE_OPTIONS.map((option) => {''',
    '''              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">''',
    '''                {AVATAR_FORGE_BANG_STYLE_OPTIONS.map((option) => {
                  const selected = state.hair.bangStyle === option.id;
                  const previewState = sanitizeAvatarForgeState({
                    ...state,
                    presetId: undefined,
                    hair: { ...state.hair, bangStyle: option.id },
                  });
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={disabled || state.hair.style === "none"}
                      aria-label={option.label}
                      aria-pressed={selected}
                      title={option.hint}
                      onClick={() => updateHair("bangStyle", option.id)}
                      className={`min-h-[6.8rem] overflow-hidden rounded-xl border text-[0.62rem] font-bold transition-colors disabled:opacity-40 ${
                        selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"
                      }`}
                    >
                      <span className="block h-[4.1rem] overflow-hidden border-b border-line/60 bg-panel/60 px-1">
                        <StudioVrmAvatarForgePreview state={previewState} variant="compact" showBody={false} label={`${option.label} 앞머리 미리보기`} />
                      </span>
                      <span className="block truncate px-1.5 py-1.5 text-center">{option.label}</span>
                    </button>
                  );
                })}
''',
)

replace_once(
    PANEL,
    '''            <div className="grid grid-cols-2 gap-2">
              {(["baseColor", "tipColor"] as const).map((key) => (''',
    '''            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[0.68rem] font-bold text-fg-2">헤어 컬러 조합</p>
                <button
                  type="button"
                  disabled={disabled || state.hair.style === "none"}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line bg-card px-2 text-[0.59rem] font-bold text-fg-3 hover:bg-raised hover:text-fg disabled:opacity-35"
                  onClick={() => emit({
                    ...state,
                    presetId: undefined,
                    hair: {
                      ...state.hair,
                      baseColor: state.hair.tipColor,
                      tipColor: state.hair.baseColor,
                    },
                  })}
                >
                  <ArrowRightLeft size={11} aria-hidden />
                  뿌리·끝 교체
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {HAIR_COLOR_PRESETS.map((palette) => {
                  const selected = state.hair.baseColor === palette.baseColor
                    && state.hair.tipColor === palette.tipColor;
                  return (
                    <button
                      key={palette.id}
                      type="button"
                      disabled={disabled || state.hair.style === "none"}
                      aria-label={`${palette.label} 헤어 컬러 적용`}
                      aria-pressed={selected}
                      title={palette.label}
                      className={`min-h-12 rounded-xl border p-1 transition-colors disabled:opacity-35 ${
                        selected ? "border-accent bg-accent-soft" : "border-line bg-card hover:bg-raised"
                      }`}
                      onClick={() => emit({
                        ...state,
                        presetId: undefined,
                        hair: {
                          ...state.hair,
                          baseColor: palette.baseColor,
                          tipColor: palette.tipColor,
                        },
                      })}
                    >
                      <span
                        aria-hidden
                        className="block h-7 rounded-lg border border-white/15"
                        style={{ background: `linear-gradient(135deg, ${palette.baseColor}, ${palette.tipColor})` }}
                      />
                      <span className="sr-only">{palette.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["baseColor", "tipColor"] as const).map((key) => (''',
)

replace_between(
    PANEL,
    '''              {(["volume", "length"] as const).map((key) => {''',
    '''            </div>

            <details className="group rounded-xl border border-line bg-card/55 p-3">''',
    '''              {(["volume", "length"] as const).map((key) => {
                const limit = AVATAR_FORGE_HAIR_LIMITS[key];
                return (
                  <StudioVrmForgeRangeControl
                    key={key}
                    label={limit.label}
                    value={state.hair[key]}
                    minimum={limit.min}
                    maximum={limit.max}
                    step={limit.step}
                    defaultValue={DEFAULT_AVATAR_FORGE_STATE.hair[key]}
                    unit={limit.unit ?? "%"}
                    disabled={disabled || state.hair.style === "none"}
                    onChange={(value) => updateHair(key, value)}
                  />
                );
              })}
''',
)

replace_regex(
    PANEL,
    r'            <details className="group rounded-xl border border-line bg-card/55 p-3">[\s\S]*?            </details>',
    '''            {precisionMode ? (
              <div className="space-y-3 rounded-xl border border-accent/25 bg-accent-soft/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[0.68rem] font-bold text-fg-2">정밀 헤어 파라미터</p>
                    <p className="mt-0.5 text-[0.58rem] text-fg-3">가닥 두께·웨이브·광택·묶음 위치를 숫자로 마감합니다.</p>
                  </div>
                  <span className="rounded-full border border-accent/30 bg-card px-2 py-0.5 text-[0.58rem] font-bold text-accent">
                    {HAIR_DETAIL_KEYS.length}개
                  </span>
                </div>
                {HAIR_DETAIL_KEYS.map((key) => {
                  const limit = AVATAR_FORGE_HAIR_LIMITS[key];
                  return (
                    <StudioVrmForgeRangeControl
                      key={key}
                      label={limit.label}
                      value={state.hair[key]}
                      minimum={limit.min}
                      maximum={limit.max}
                      step={limit.step}
                      defaultValue={DEFAULT_AVATAR_FORGE_STATE.hair[key]}
                      unit={limit.unit ?? "%"}
                      disabled={disabled || state.hair.style === "none"}
                      onChange={(value) => updateHair(key, value)}
                    />
                  );
                })}
              </div>
            ) : (
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between rounded-xl border border-dashed border-line bg-card/55 px-3 text-left text-[0.66rem] font-bold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => setPrecisionMode(true)}
              >
                <span>
                  정밀 헤어 조절
                  <span className="mt-0.5 block text-[0.58rem] font-normal text-fg-3">가닥·웨이브·광택 등 {HAIR_DETAIL_KEYS.length}개</span>
                </span>
                <SlidersHorizontal size={15} className="text-accent" aria-hidden />
              </button>
            )}''',
)

replace_once(
    PANEL,
    '''        {view === "face" ? (
          <div role="tabpanel" aria-label="얼굴 비율과 디테일 편집" className="space-y-3.5">
            <div className="rounded-xl border border-line bg-card/70 p-3">''',
    '''        {view === "face" ? (
          <div role="tabpanel" aria-label="얼굴 비율과 디테일 편집" className="space-y-3.5">
            <div>
              <div className="mb-2 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[0.68rem] font-bold text-fg-2">얼굴형 프리셋</p>
                  <p className="mt-0.5 text-[0.58rem] text-fg-3">원본 눈·코·입 리그를 유지하면서 두상과 턱 실루엣만 안전하게 조절합니다.</p>
                </div>
                <span className="text-[0.58rem] text-fg-3">{FACE_SHAPE_PRESETS.length}종</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {FACE_SHAPE_PRESETS.map((preset) => {
                  const selected = sameFace(state.face, preset.face);
                  const previewState = sanitizeAvatarForgeState({
                    ...state,
                    presetId: undefined,
                    face: preset.face,
                  });
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={disabled}
                      aria-label={`${preset.label} 얼굴형 적용: ${preset.hint}`}
                      aria-pressed={selected}
                      title={preset.hint}
                      className={`min-h-[7.4rem] overflow-hidden rounded-xl border text-[0.61rem] font-bold transition-colors disabled:opacity-40 ${
                        selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"
                      }`}
                      onClick={() => emit({
                        ...state,
                        presetId: undefined,
                        face: { ...preset.face },
                      })}
                    >
                      <span className="block h-[4.7rem] overflow-hidden border-b border-line/60 bg-panel/60 px-1">
                        <StudioVrmAvatarForgePreview state={previewState} variant="compact" showBody={false} label={`${preset.label} 얼굴형 미리보기`} />
                      </span>
                      <span className="block truncate px-1 py-1.5 text-center">{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card/70 p-3">''',
)

replace_between(
    PANEL,
    '''                {(Object.keys(AVATAR_FORGE_FACE_LIMITS) as Array<keyof AvatarForgeFaceParams>).map((key) => {''',
    '''              </div>
            </div>

            <div>
              <p className="mb-2 text-[0.68rem] font-bold text-fg-2">얼굴 디테일</p>''',
    '''                {(Object.keys(AVATAR_FORGE_FACE_LIMITS) as Array<keyof AvatarForgeFaceParams>).map((key) => {
                  const limit = AVATAR_FORGE_FACE_LIMITS[key];
                  return (
                    <StudioVrmForgeRangeControl
                      key={key}
                      label={limit.label}
                      value={state.face[key]}
                      minimum={limit.min}
                      maximum={limit.max}
                      step={limit.step}
                      defaultValue={DEFAULT_AVATAR_FORGE_STATE.face[key]}
                      unit={limit.unit ?? "%"}
                      disabled={disabled}
                      onChange={(value) => updateFace(key, value)}
                    />
                  );
                })}
''',
)

replace_between(
    PANEL,
    '''        <div
          data-studio-vrm-generate-preview=""
          className="flex items-center gap-2 rounded-xl border border-line bg-card/70 px-3 py-2"
        >''',
    '''        {previewRecipe.appliedDefaultPresetId ? (''',
    '''        <div
          data-studio-vrm-generate-preview=""
          className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-xl border border-line bg-card/70 p-2.5"
        >
          <span className="block h-20 overflow-hidden rounded-lg border border-line/70 bg-panel/60 px-1">
            <StudioVrmAvatarForgePreview
              state={previewRecipe.state}
              variant="compact"
              label={`${previewRecipe.label} 생성 결과 미리보기`}
            />
          </span>
          <span className="min-w-0 text-[0.62rem] leading-relaxed text-fg-3">
            <span className="block truncate text-[0.69rem] font-extrabold text-fg-2">{previewRecipe.label}</span>
            <span className="mt-0.5 block">{describeStudioVrmAvatarForgeState(previewRecipe.state).face} · {describeStudioVrmAvatarForgeState(previewRecipe.state).hair}</span>
            <span className="block">{formatStudioVrmHeadUnits(resolveStudioVrmProportionMetrics(previewRecipe.state.proportions).headUnits)} · {describeStudioVrmAvatarForgeState(previewRecipe.state).body}</span>
          </span>
        </div>

''',
)

# Wider inspector gives visual cards and precision controls room without stealing the viewport.
replace_once(
    "src/domains/creator/vrm/StudioVrmPoserDialog.tsx",
    '            : "max-w-[1280px] rounded-2xl border border-line shadow-[0_24px_80px_oklch(0.05_0.01_70/0.55)]",',
    '            : "max-w-[1480px] rounded-2xl border border-line shadow-[0_24px_80px_oklch(0.05_0.01_70/0.55)]",',
)
replace_once(
    "src/domains/creator/vrm/StudioVrmPoserDialog.tsx",
    '                ? "grid-rows-[minmax(0,2fr)_minmax(0,3fr)] sm:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px]"',
    '                ? "grid-rows-[minmax(0,2fr)_minmax(0,3fr)] sm:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]"',
)
replace_once(
    "src/domains/creator/vrm/StudioVrmPoserDialog.tsx",
    '                : "grid-rows-[minmax(0,36dvh)_minmax(0,1fr)] sm:grid-rows-[minmax(0,40dvh)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px]",',
    '                : "grid-rows-[minmax(0,36dvh)_minmax(0,1fr)] sm:grid-rows-[minmax(0,40dvh)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]",',
)

# Toon presentation for generated hair: retain vertex gradients, add a restrained silhouette shell.
replace_once(
    "src/domains/creator/vrm/StudioVrmAvatarForge.tsx",
    '''function createHairMaterial(part: AvatarForgeHairPart) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: clamp(0.82 - part.shine * 0.54, 0.22, 0.84),
    metalness: clamp(0.015 + part.shine * 0.11, 0, 0.14),
    side: THREE.DoubleSide,
  });
}''',
    '''function createHairMaterial(part: AvatarForgeHairPart) {
  const material = new THREE.MeshToonMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  material.emissive.set(part.baseColor);
  material.emissiveIntensity = clamp(0.015 + part.shine * 0.055, 0.015, 0.07);
  return material;
}

function createHairOutlineMaterial(part: AvatarForgeHairPart) {
  const outline = new THREE.Color(part.baseColor)
    .lerp(new THREE.Color("#151112"), 0.72);
  return new THREE.MeshBasicMaterial({
    color: outline,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    toneMapped: false,
  });
}''',
)

replace_once(
    "src/domains/creator/vrm/StudioVrmAvatarForge.tsx",
    '''    const mesh = new THREE.Mesh(geometry, material);
    const transform = transformHairPart(part, fit);
    mesh.name = `ToonSpectrumAvatarForgeHair_${part.id}`;
    mesh.position.copy(transform.position);
    mesh.rotation.copy(transform.rotation);
    mesh.scale.copy(transform.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 6;
    group.add(mesh);''',
    '''    const mesh = new THREE.Mesh(geometry, material);
    const outline = new THREE.Mesh(geometry, createHairOutlineMaterial(part));
    const transform = transformHairPart(part, fit);
    mesh.name = `ToonSpectrumAvatarForgeHair_${part.id}`;
    mesh.position.copy(transform.position);
    mesh.rotation.copy(transform.rotation);
    mesh.scale.copy(transform.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 6;

    outline.name = `ToonSpectrumAvatarForgeHairOutline_${part.id}`;
    outline.position.copy(transform.position);
    outline.rotation.copy(transform.rotation);
    outline.scale.copy(transform.scale).multiplyScalar(1.026);
    outline.renderOrder = 5;
    group.add(outline);
    group.add(mesh);''',
)

# Creator-facing recommendation cards: show the actual recipe silhouette, not an emoji/debug score.
REFERENCE = "src/domains/creator/vrm/StudioVrmAvatarReferenceRecommendationsPanel.tsx"
replace_once(
    REFERENCE,
    '''import { createAvatarForgeState, type AvatarForgeState } from "./studio-vrm-avatar-forge";''',
    '''import { createAvatarForgeState, type AvatarForgeState } from "./studio-vrm-avatar-forge";
import {
  describeStudioVrmAvatarForgeState,
  StudioVrmAvatarForgePreview,
} from "./StudioVrmAvatarForgePreview";''',
)
replace_once(
    REFERENCE,
    '''                    const preset = findStudioVrmAvatarReferencePreset(recommendation.presetId);
                    if (!preset) return null;
                    return (''',
    '''                    const preset = findStudioVrmAvatarReferencePreset(recommendation.presetId);
                    if (!preset) return null;
                    const previewState = createAvatarForgeState(recommendation.presetId);
                    const visual = describeStudioVrmAvatarForgeState(previewState);
                    return (''',
)
replace_once(
    REFERENCE,
    '''                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-panel text-base" aria-hidden>
                            {preset.emoji}
                          </span>''',
    '''                          <span className="block h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-line bg-panel/70 px-1">
                            <StudioVrmAvatarForgePreview
                              state={previewState}
                              variant="compact"
                              showBody
                              label={`${preset.label} 추천 미리보기`}
                            />
                          </span>''',
)
replace_once(
    REFERENCE,
    '''                              <span className="shrink-0 text-[0.58rem] tabular-nums text-fg-3">
                                cosine {recommendation.similarity.toFixed(3)}
                              </span>''',
    '''                              <span className="shrink-0 rounded-full border border-line bg-panel px-2 py-0.5 text-[0.58rem] font-bold tabular-nums text-fg-3">
                                {Math.round(recommendation.similarity * 100)}% 유사
                              </span>''',
)
replace_once(
    REFERENCE,
    '''                            <p className="mt-0.5 line-clamp-2 text-[0.6rem] leading-relaxed text-fg-3">{preset.hint}</p>
                            <div className="mt-2 grid grid-cols-2 gap-1.5">''',
    '''                            <p className="mt-0.5 line-clamp-2 text-[0.6rem] leading-relaxed text-fg-3">{preset.hint}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {[visual.face, visual.hair, visual.body].map((label) => (
                                <span key={label} className="rounded-full border border-line bg-panel px-1.5 py-0.5 text-[0.55rem] font-semibold text-fg-3">
                                  {label}
                                </span>
                              ))}
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-1.5">''',
)
replace_once(
    REFERENCE,
    '''                <p className="border-t border-line/70 pt-2 text-[0.56rem] leading-relaxed text-fg-3">
                  {receipt.modelId} r{receipt.modelRevision} · model sha256 {receipt.modelSha256.slice(0, 12)}… · catalogue {receipt.catalogueRevision}
                </p>''',
    '''                <details className="border-t border-line/70 pt-2 text-[0.56rem] leading-relaxed text-fg-3">
                  <summary className="min-h-8 cursor-pointer font-semibold text-fg-3">분석 기술 정보</summary>
                  <p className="mt-1 break-all">
                    {receipt.modelId} r{receipt.modelRevision} · model sha256 {receipt.modelSha256.slice(0, 12)}… · catalogue {receipt.catalogueRevision}
                  </p>
                </details>''',
)

# Pose review: overlay detected joints on the actual source image and let creators choose scope.
POSE = "src/domains/creator/vrm/StudioVrmPhotoPoseScanner.tsx"
replace_once(
    POSE,
    '''function SkeletonPreview({
  landmarks,
  hands,
}: {
  readonly landmarks: readonly StudioVrmPhotoPoseLandmark[];
  readonly hands: StudioVrmPhotoHandInferenceResult;
}) {''',
    '''function SkeletonPreview({
  landmarks,
  hands,
  imageUrl,
}: {
  readonly landmarks: readonly StudioVrmPhotoPoseLandmark[];
  readonly hands: StudioVrmPhotoHandInferenceResult;
  readonly imageUrl: string;
}) {''',
)
replace_once(
    POSE,
    '''      viewBox="0 0 100 100"
    >
      {SKELETON_CONNECTIONS.map''',
    '''      viewBox="0 0 100 100"
    >
      {imageUrl ? (
        <>
          <image href={imageUrl} width="100" height="100" preserveAspectRatio="xMidYMid slice" />
          <rect width="100" height="100" fill="oklch(0.08 0.01 250 / 0.28)" />
        </>
      ) : null}
      {SKELETON_CONNECTIONS.map''',
)
replace_once(
    POSE,
    '''const PHOTO_POSE_QUALITY_RANK: Readonly<
  Record<StudioVrmPhotoPoseConfidenceSummary["quality"], number>
> = Object.freeze({ low: 0, medium: 1, high: 2 });''',
    '''const PHOTO_POSE_QUALITY_RANK: Readonly<
  Record<StudioVrmPhotoPoseConfidenceSummary["quality"], number>
> = Object.freeze({ low: 0, medium: 1, high: 2 });

type StudioVrmPhotoPoseApplyScope = "full" | "upper" | "arms";

const PHOTO_POSE_APPLY_SCOPES: ReadonlyArray<{
  readonly id: StudioVrmPhotoPoseApplyScope;
  readonly label: string;
  readonly hint: string;
}> = [
  { id: "full", label: "전신", hint: "몸통·팔·다리·손을 모두 적용" },
  { id: "upper", label: "상체", hint: "몸통·머리·팔·손만 적용" },
  { id: "arms", label: "팔·손", hint: "현재 하체를 유지하고 팔과 손만 적용" },
] as const;

function filterPhotoPoseBones(
  bones: BoneEulerMap,
  scope: StudioVrmPhotoPoseApplyScope,
): BoneEulerMap {
  if (scope === "full") return bones;
  const upperPattern = /head|neck|spine|chest|shoulder|arm|hand/i;
  const armPattern = /shoulder|arm|hand/i;
  const pattern = scope === "upper" ? upperPattern : armPattern;
  return Object.fromEntries(
    Object.entries(bones).filter(([bone]) => pattern.test(bone)),
  ) as BoneEulerMap;
}''',
)
replace_once(
    POSE,
    '''  const inputRef = useRef<HTMLInputElement>(null);
  const preprocessorRef = useRef<StudioVrmPhotoPosePreprocessor | null>(null);''',
    '''  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const preprocessorRef = useRef<StudioVrmPhotoPosePreprocessor | null>(null);''',
)
replace_once(
    POSE,
    '''  const [candidate, setCandidate] = useState<PhotoPoseCandidate | null>(null);
  const [includeFingerEdits, setIncludeFingerEdits] = useState(true);''',
    '''  const [candidate, setCandidate] = useState<PhotoPoseCandidate | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [applyScope, setApplyScope] = useState<StudioVrmPhotoPoseApplyScope>("full");
  const [includeFingerEdits, setIncludeFingerEdits] = useState(true);

  const replacePreviewUrl = (file: File | null) => {
    if (previewUrlRef.current && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const next = file && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : "";
    previewUrlRef.current = next || null;
    setPreviewUrl(next);
  };''',
)
replace_once(
    POSE,
    '''      preprocessorRef.current?.dispose();
      preprocessorRef.current = null;
      disposePhotoHandLandmarker();''',
    '''      preprocessorRef.current?.dispose();
      preprocessorRef.current = null;
      if (previewUrlRef.current && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      previewUrlRef.current = null;
      disposePhotoHandLandmarker();''',
)
replace_once(
    POSE,
    '''    if (!file || disabled) return;

    setBusy(true);''',
    '''    if (!file || disabled) return;

    replacePreviewUrl(file);
    setBusy(true);''',
)
replace_once(
    POSE,
    '''          <SkeletonPreview landmarks={candidate.landmarks} hands={candidate.hands} />''',
    '''          <SkeletonPreview landmarks={candidate.landmarks} hands={candidate.hands} imageUrl={previewUrl} />''',
)
replace_once(
    POSE,
    '''          <div className="grid grid-cols-2 gap-2">
            <button''',
    '''          <fieldset className="rounded-lg border border-line bg-panel/60 p-2">
            <legend className="px-1 text-[0.62rem] font-bold text-fg-2">적용 범위</legend>
            <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="사진 포즈 적용 범위">
              {PHOTO_POSE_APPLY_SCOPES.map((scope) => (
                <button
                  key={scope.id}
                  type="button"
                  role="radio"
                  aria-checked={applyScope === scope.id}
                  title={scope.hint}
                  className={`min-h-10 rounded-lg border px-1 text-[0.6rem] font-bold transition-colors ${
                    applyScope === scope.id
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
                  }`}
                  onClick={() => setApplyScope(scope.id)}
                >
                  {scope.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <button''',
)
replace_once(
    POSE,
    '''              onClick={() => setCandidate(null)}''',
    '''              onClick={() => {
                setCandidate(null);
                replacePreviewUrl(null);
              }}''',
)
replace_once(
    POSE,
    '''                  bones: candidate.bones,''',
    '''                  bones: filterPhotoPoseBones(candidate.bones, applyScope),''',
)
replace_once(
    POSE,
    '''                if (applied) setCandidate(null);''',
    '''                if (applied) {
                  setCandidate(null);
                  replacePreviewUrl(null);
                }''',
)

# Add explicit regression coverage for the new visual-first surfaces.
write(
    "src/domains/creator/vrm/StudioVrmAvatarForgePreview.test.tsx",
    '''// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createAvatarForgeState } from "./studio-vrm-avatar-forge";
import {
  countStudioVrmAvatarForgeChanges,
  describeStudioVrmAvatarForgeState,
  StudioVrmAvatarForgePreview,
} from "./StudioVrmAvatarForgePreview";

describe("StudioVrmAvatarForgePreview", () => {
  it("renders deterministic visual metadata for a real recipe", () => {
    const state = createAvatarForgeState("wave-diva");
    render(<StudioVrmAvatarForgePreview state={state} label="웨이브 디바 미리보기" />);

    const preview = screen.getByRole("img", { name: "웨이브 디바 미리보기" });
    expect(preview.getAttribute("data-forge-preview")).toBe("true");
    expect(preview.getAttribute("data-hair-style")).toBe(state.hair.style);
    expect(preview.querySelectorAll("path").length).toBeGreaterThan(4);
  });

  it("describes and counts only visible authoring changes", () => {
    const baseline = createAvatarForgeState();
    const changed = createAvatarForgeState();
    changed.face = { ...changed.face, headWidth: 1.1 };
    changed.hair = { ...changed.hair, style: "bob", baseColor: "#112233" };

    const summary = describeStudioVrmAvatarForgeState(changed, baseline);
    expect(summary.face).toContain("둥근");
    expect(summary.hair).toBe("보브");
    expect(summary.changedControls).toBe(countStudioVrmAvatarForgeChanges(changed, baseline));
    expect(summary.changedControls).toBeGreaterThanOrEqual(3);
  });
});
''',
)

write(
    "src/domains/creator/vrm/StudioVrmForgeRangeControl.test.tsx",
    '''// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioVrmForgeRangeControl } from "./StudioVrmForgeRangeControl";

describe("StudioVrmForgeRangeControl", () => {
  it("supports slider, exact number, step, and reset input", () => {
    const onChange = vi.fn();
    const view = render(
      <StudioVrmForgeRangeControl
        label="얼굴 너비"
        value={1.05}
        minimum={0.84}
        maximum={1.18}
        step={0.01}
        defaultValue={1}
        unit="×"
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("slider", { name: "얼굴 너비" }), {
      target: { value: "1.1" },
    });
    expect(onChange).toHaveBeenLastCalledWith(1.1);

    fireEvent.click(screen.getByRole("button", { name: "얼굴 너비 한 단계 늘리기" }));
    expect(onChange).toHaveBeenLastCalledWith(1.06);

    fireEvent.change(screen.getByRole("spinbutton", { name: "얼굴 너비 정확한 값" }), {
      target: { value: "2" },
    });
    expect(onChange).toHaveBeenLastCalledWith(1.18);

    fireEvent.click(screen.getByRole("button", { name: "얼굴 너비 기본값으로 복원" }));
    expect(onChange).toHaveBeenLastCalledWith(1);
    view.unmount();
  });
});
''',
)

# Source-level product contract so future refactors cannot silently fall back to emoji/debug UX.
write(
    "src/domains/creator/vrm/studio-vrm-character-workshop-boundary.test.ts",
    '''import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const panel = readFileSync(new URL("./StudioVrmAvatarForgePanel.tsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("./StudioVrmAvatarForgePreview.tsx", import.meta.url), "utf8");
const pose = readFileSync(new URL("./StudioVrmPhotoPoseScanner.tsx", import.meta.url), "utf8");
const reference = readFileSync(
  new URL("./StudioVrmAvatarReferenceRecommendationsPanel.tsx", import.meta.url),
  "utf8",
);
const renderer = readFileSync(new URL("./StudioVrmAvatarForge.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("./StudioVrmPoserDialog.tsx", import.meta.url), "utf8");

describe("Shaper-inspired character workshop product boundary", () => {
  it("uses visual recipe previews and precise controls instead of emoji-only selection", () => {
    expect(panel).toContain("StudioVrmAvatarForgePreview");
    expect(panel).toContain("StudioVrmForgeRangeControl");
    expect(panel).toContain("아바타 스타일 검색");
    expect(panel).toContain("FACE_SHAPE_PRESETS");
    expect(panel).toContain("HAIR_COLOR_PRESETS");
    expect(panel).toContain("정확한 값");
    expect(preview).toContain('data-forge-preview="true"');
    expect(preview).toContain("HairBack");
    expect(preview).toContain("Bangs");
  });

  it("keeps AI and pose review creator-facing and reversible", () => {
    expect(reference).toContain("StudioVrmAvatarForgePreview");
    expect(reference).toContain("% 유사");
    expect(reference).toContain("분석 기술 정보");
    expect(reference).not.toContain("cosine {");
    expect(pose).toContain("filterPhotoPoseBones");
    expect(pose).toContain("사진 포즈 적용 범위");
    expect(pose).toContain("<image href={imageUrl}");
    expect(pose).toContain("replacePreviewUrl(null)");
  });

  it("adds a toon silhouette without mutating source hair geometry", () => {
    expect(renderer).toContain("new THREE.MeshToonMaterial");
    expect(renderer).toContain("new THREE.MeshBasicMaterial");
    expect(renderer).toContain("THREE.BackSide");
    expect(renderer).toContain("multiplyScalar(1.026)");
    expect(dialog).toContain("max-w-[1480px]");
    expect(dialog).toContain("_460px");
  });
});
''',
)

# Detailed audit is an implementation contract, not marketing prose.
write(
    "docs/studio-shaper-quality-gap-audit-2026-09-03.md",
    '''# ToonStudio × SHAPER quality-gap audit — 2026-09-03

## Scope and evidence

This audit compares SHAPER's publicly documented creator workflow with ToonStudio's shipped VRM
builder. It does not use SHAPER source code, private assets, reverse engineering, or copied UI.

SHAPER publicly presents fourteen combinable preset categories: face shape, eyes, irises, nose,
mouth, ears, hair, body, tops, bottoms, shoes, accessories, pose, and hand pose. It also presents
direct model drawing, reference-image preset recommendations, photo/camera pose recognition,
transparent background, and component-layered PSD export.

## Why the previous result felt low quality

The feature inventory was not the main problem. ToonStudio already had a broad engine surface, but
its creator-facing representation was weaker:

1. Presets were represented primarily by emoji and copy instead of a visual prediction of the
   resulting character.
2. Character work was split across two navigation levels (`캐릭터` then `모델/조형/체형·색/의상/표면`),
   while pose and expression lived in separate top-level tabs. The user had to understand the
   implementation architecture before understanding the creative workflow.
3. Avatar Forge exposed five global face controls, fourteen procedural hair silhouettes, six bang
   styles, proportions, and three face accents. It did not provide independent eye, iris, nose,
   mouth, or ear asset slots.
4. Procedural hair used smooth PBR primitives. The geometry was functional but read as generic 3D
   rather than an authored webtoon asset because it lacked a controlled toon value ramp and a stable
   silhouette shell.
5. AI recommendations exposed raw cosine values and emoji cards. This was useful for debugging but
   weak for visual decision-making.
6. Photo pose review drew a skeleton on an abstract dark field, separating the detected joints from
   the source photograph the artist needed to judge.
7. The 360 px inspector forced thumbnail cards, precise numeric controls, explanations, and action
   buttons into the same narrow column.

## Implemented in this change

### Visual-first selection

- Deterministic SVG preview renderer for face shape, body proportions, fourteen hair silhouettes,
  six bang styles, gradients, and face accents.
- Two-column visual style shelf with search and genre filters.
- Visual face-shape, body-ratio, hair-style, bang-style, character-variant, AI recommendation, and
  generation-result cards.
- Current-character hero preview with a plain-language summary and changed-control count.

### Precision without clutter

- Shared sculpt control with range input, exact numeric input, increment/decrement, formatted units,
  and one-click per-control reset.
- Fast/precision mode. Advanced hair controls stay out of the first viewport until requested.
- Eight curated two-colour hair palettes and root/tip swap.
- Six safe face-shape recipes built only from the existing rig-preserving face authority.

### Creator-facing AI and pose review

- AI results now show the predicted character recipe and descriptive chips; raw model metadata is
  moved under a disclosure.
- Photo pose landmarks are drawn over the source image.
- The artist can apply full body, upper body, or arms/hands only, preserving the rest of the current
  pose.

### Render presentation

- Procedural hair keeps the canonical geometry and gradient vertices but uses toon shading plus a
  restrained back-face silhouette shell.
- The desktop inspector grows to 420–460 px and the overall dialog to 1480 px, while mobile layout
  remains stacked.

## Remaining quality gap — do not mislabel as complete parity

The following require a modular authored-asset pipeline rather than more sliders:

- independent eye, iris, nose, mouth, and ear libraries;
- authored hair cards backed by production meshes, LODs, thumbnails, and license metadata;
- tops, bottoms, shoes, and accessories presented in one semantic slot browser;
- hand-pose shelf next to full-body pose cards;
- semantic PSD passes for face, hair front/back, skin, top, bottom, shoes, accessories, line, shadow,
  and ID masks;
- visual regression baselines covering representative body types, skin tones, extreme head ratios,
  every hair/bang combination, and transparent/PSD export.

## Next architecture

Introduce a `CharacterSlotCatalog` whose entries carry a stable id, slot kind, thumbnail, asset or
recipe reference, compatibility predicate, license authority, tags, and semantic export layer. The
UI must consume that catalog rather than hard-coding feature cards. Runtime application remains
provider-specific and fail-closed; unsupported slots are never substituted silently.

The target slot kinds are:

`face-shape`, `eyes`, `irises`, `nose`, `mouth`, `ears`, `hair`, `body`, `top`, `bottom`, `shoes`,
`accessory`, `pose`, and `hand-pose`.

## Acceptance criteria for the next asset phase

- A creator can build a recognisably different character without touching a numeric slider.
- Every card predicts the actual runtime result, not an unrelated decorative image.
- Switching a slot preserves all other slots and creates one undoable command.
- Incompatible assets explain why they are unavailable.
- No automatic replacement occurs when an asset, GPU path, model, or license check fails.
- A saved project reopens with identical slot ids, transforms, materials, pose, paint atlas, and PSD
  layer mapping.
- A 2K representative character stays interactive during orbit and editing, and capture does not
  synchronously read pixels on the pointer hot path.
''',
)

for path in [
    PANEL,
    "src/domains/creator/vrm/StudioVrmAvatarForgePreview.tsx",
    "src/domains/creator/vrm/StudioVrmForgeRangeControl.tsx",
    "src/domains/creator/vrm/StudioVrmAvatarReferenceRecommendationsPanel.tsx",
    "src/domains/creator/vrm/StudioVrmPhotoPoseScanner.tsx",
    "src/domains/creator/vrm/StudioVrmAvatarForge.tsx",
    "src/domains/creator/vrm/StudioVrmPoserDialog.tsx",
]:
    source = read(path)
    if "StudioVrmAvatarForgePreview" not in read(PANEL):
        raise RuntimeError("visual preview was not wired into Avatar Forge")
    if "emoji-only" in source:
        raise RuntimeError(f"unexpected audit prose in product file {path}")

print("Applied visual-first character workshop upgrade.")
