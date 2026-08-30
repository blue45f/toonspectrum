import {
  CircleUserRound,
  Download,
  Palette,
  PersonStanding,
  RotateCcw,
  Scissors,
  Sparkles,
  UserPlus,
  WandSparkles,
} from "lucide-react";
import { useId, useState } from "react";

import {
  AVATAR_FORGE_BANG_STYLE_OPTIONS,
  AVATAR_FORGE_FACE_ACCENT_OPTIONS,
  AVATAR_FORGE_FACE_LIMITS,
  AVATAR_FORGE_HAIR_LIMITS,
  AVATAR_FORGE_HAIR_STYLE_OPTIONS,
  AVATAR_FORGE_PRESETS,
  createAvatarForgeState,
  sanitizeAvatarForgeState,
  type AvatarForgeFaceAccentId,
  type AvatarForgeFaceParams,
  type AvatarForgeHairParams,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";
import { resolveStudioVrmAvatarForgeVisualProportionMetrics } from "./studio-vrm-avatar-forge-face-controller";
import {
  applyStudioVrmCharacterVariant,
  listStudioVrmCharacterVariantSummaries,
} from "./studio-vrm-character-variants";
import {
  generateStudioVrmCharacter,
  type StudioVrmGenerateResult,
} from "./studio-vrm-generate-mcp";
import { createStudioVrmGenerateRecipe } from "./studio-vrm-generate-recipe";
import {
  formatStudioVrmHeadUnits,
  resolveStudioVrmProportionMetrics,
  STUDIO_VRM_PROPORTION_KEYS,
  STUDIO_VRM_PROPORTION_LIMITS,
  STUDIO_VRM_PROPORTION_PRESETS,
  type StudioVrmProportionKey,
  type StudioVrmProportionMetrics,
} from "./studio-vrm-proportion-core";

/** 정밀 파라미터 슬라이더 순서 — 라벨/범위는 AVATAR_FORGE_HAIR_LIMITS가 단일 소스. */
const HAIR_DETAIL_KEYS = ["strandWidth", "fringe", "curl", "shine", "wave", "ahoge", "tailHeight"] as const;
const ORDERED_PROPORTION_PRESETS = Object.freeze(
  [...STUDIO_VRM_PROPORTION_PRESETS].sort(
    (left, right) => left.targetHeadUnits - right.targetHeadUnits,
  ),
);

type ForgeView = "presets" | "body" | "hair" | "face";

type StudioVrmAvatarForgePanelProps = {
  state: AvatarForgeState;
  disabled?: boolean;
  detectedOriginalHairCount?: number;
  proportionMetrics?: StudioVrmProportionMetrics | null;
  proportionMetricsLabel?: string;
  proportionPresetNote?: string | null;
  proportionUnavailableReason?: string | null;
  onChange: (state: AvatarForgeState) => void;
  onGeneratedFile?: (file: File) => void;
};

const VIEWS: ReadonlyArray<{
  id: ForgeView;
  label: string;
  hint: string;
  icon: typeof WandSparkles;
}> = [
  { id: "presets", label: "스타일", hint: "완성형 조합으로 시작", icon: WandSparkles },
  { id: "body", label: "체형", hint: "몸의 실루엣과 비율 조절", icon: PersonStanding },
  { id: "hair", label: "헤어", hint: "형태·색·광택 조절", icon: Scissors },
  { id: "face", label: "얼굴", hint: "비율·디테일 조절", icon: CircleUserRound },
];

function formatValue(value: number, unit?: string) {
  return unit === "×" ? `${value.toFixed(2)}×` : `${Math.round(value * 100)}%`;
}

export function StudioVrmAvatarForgePanel({
  state,
  disabled = false,
  detectedOriginalHairCount = 0,
  proportionMetrics: runtimeProportionMetrics = null,
  proportionMetricsLabel = "모델 실측",
  proportionPresetNote = null,
  proportionUnavailableReason = null,
  onChange,
  onGeneratedFile,
}: StudioVrmAvatarForgePanelProps) {
  const controlId = useId();
  const [view, setView] = useState<ForgeView>("presets");
  const [generateResult, setGenerateResult] = useState<StudioVrmGenerateResult | null>(null);
  const [generateBusy, setGenerateBusy] = useState(false);
  // 헤어 실루엣을 **직접 골랐는지**를 기억한다. 기본값이 이미 "없음"이라 목록에서 "없음"을
  // 눌러도 상태가 그대로여서, 상태 비교만으로는 의도한 민머리를 알아볼 수 없다.
  const [hairStyleChosen, setHairStyleChosen] = useState(false);
  const previewRecipe = createStudioVrmGenerateRecipe({
    presetId: state.presetId,
    state,
    allowDefaultPreset: !hairStyleChosen,
  });

  const updateFace = <K extends keyof AvatarForgeFaceParams>(key: K, value: AvatarForgeFaceParams[K]) => {
    onChange({ ...state, presetId: undefined, face: { ...state.face, [key]: value } });
  };

  const updateProportion = (key: StudioVrmProportionKey, value: number) => {
    onChange(sanitizeAvatarForgeState({
      ...state,
      presetId: undefined,
      bodyPresetId: undefined,
      proportions: {
        ...state.proportions,
        presetId: undefined,
        [key]: value,
      },
    }));
  };

  const updateHair = <K extends keyof AvatarForgeHairParams>(key: K, value: AvatarForgeHairParams[K]) => {
    onChange({ ...state, presetId: undefined, hair: { ...state.hair, [key]: value } });
  };

  const updateAccent = (
    id: AvatarForgeFaceAccentId,
    patch: Partial<NonNullable<AvatarForgeState["faceAccents"]>[number]>
  ) => {
    onChange({
      ...state,
      presetId: undefined,
      faceAccents: (state.faceAccents ?? []).map((accent) =>
        accent.id === id ? { ...accent, ...patch } : accent
      ),
    });
  };
  const proportionMetrics = runtimeProportionMetrics
    ?? resolveStudioVrmProportionMetrics(state.proportions);
  const visualProportionMetrics = resolveStudioVrmAvatarForgeVisualProportionMetrics(
    proportionMetrics,
    state.face,
  );
  const visualHeadUnitsDiffer = Math.abs(
    visualProportionMetrics.headUnits - proportionMetrics.headUnits,
  ) >= 0.05;
  const proportionControlsDisabled = disabled || Boolean(proportionUnavailableReason);
  const selectedProportionPreset = STUDIO_VRM_PROPORTION_PRESETS.find(
    (preset) => preset.id === state.proportions.presetId,
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-accent/30 bg-[linear-gradient(145deg,var(--color-card),color-mix(in_oklch,var(--color-accent)_7%,var(--color-panel)))] shadow-[0_12px_36px_oklch(0_0_0/0.12)]">
      <div className="border-b border-line/70 px-3.5 pb-3 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-fg">
                <Sparkles size={15} className="text-accent" aria-hidden />
                아바타 조형
              </h3>
              <span className="rounded-full border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[0.6rem] font-extrabold tracking-wide text-accent">
                LIVE 3D
              </span>
            </div>
            <p className="mt-1 max-w-[34rem] text-[0.68rem] leading-relaxed text-fg-3">
              스타일 프리셋과 슬라이더로 새 VRM을 만들거나, 불러온 모델의 체형·헤어·얼굴을 비파괴로 조형합니다.
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(createAvatarForgeState())}
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-3 transition-colors hover:bg-raised hover:text-fg disabled:opacity-40"
            aria-label="아바타 조형 초기화"
            title="기본 조형으로 초기화"
          >
            <RotateCcw size={16} aria-hidden />
          </button>
        </div>

        <div role="tablist" aria-label="아바타 조형 단계" className="mt-3 grid grid-cols-4 gap-1 rounded-xl border border-line/70 bg-panel/65 p-1">
          {VIEWS.map((item) => {
            const Icon = item.icon;
            const selected = item.id === view;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                title={item.hint}
                onClick={() => setView(item.id)}
                className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border px-1 text-[0.66rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  selected
                    ? "border-accent/45 bg-accent-soft text-accent shadow-sm"
                    : "border-transparent text-fg-3 hover:bg-raised hover:text-fg"
                }`}
              >
                <Icon size={14} className="shrink-0 max-[360px]:hidden" aria-hidden />
                <span className="min-w-0 truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-3.5">
        {view === "presets" ? (
          <div role="tabpanel" aria-label="아바타 스타일 프리셋">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[0.68rem] font-bold text-fg-2">완성형 스타일</p>
              <span className="text-[0.62rem] text-fg-3">옆으로 넘겨 전체 보기</span>
            </div>
            <div className="-mx-3.5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3.5 pb-2 [scrollbar-width:thin]">
              {AVATAR_FORGE_PRESETS.map((preset) => {
                const selected = state.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => onChange(createAvatarForgeState(preset.id))}
                    className={`min-h-[5.6rem] w-[8.4rem] shrink-0 snap-start rounded-xl border p-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg hover:bg-raised"
                    }`}
                  >
                    <span className="text-lg" aria-hidden>{preset.emoji}</span>
                    <span className="mt-1 block text-[0.68rem] font-extrabold">{preset.label}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[0.6rem] leading-snug text-fg-3">{preset.hint}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[0.68rem] font-bold text-fg-2">캐릭터 베리언트</p>
                <span className="text-[0.62rem] text-fg-3">얼굴 비율을 유지한 채 헤어·체형 교체</span>
              </div>
              <div className="-mx-3.5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3.5 pb-2 [scrollbar-width:thin]">
                {listStudioVrmCharacterVariantSummaries().map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    disabled={disabled}
                    aria-label={`${variant.label} 베리언트: ${variant.description}`}
                    title={variant.tags.join(" · ")}
                    onClick={() => onChange(applyStudioVrmCharacterVariant(state, variant.id))}
                    className="min-h-[5.2rem] w-[8.4rem] shrink-0 snap-start rounded-xl border border-line bg-card p-2.5 text-left text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
                  >
                    <span className="text-lg" aria-hidden>{variant.emoji}</span>
                    <span className="mt-1 block text-[0.68rem] font-extrabold">{variant.label}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[0.6rem] leading-snug text-fg-3">
                      {variant.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2.5 rounded-xl border border-line/70 bg-panel/55 p-2.5">
              <p className="flex items-center gap-1.5 text-[0.66rem] font-bold text-fg-2">
                <WandSparkles size={13} className="text-accent" aria-hidden />
                다음 단계
              </p>
              <p className="mt-1 text-[0.64rem] leading-relaxed text-fg-3">
                스타일을 고른 뒤 체형 탭에서 실루엣을, 헤어·얼굴 탭에서 형태와 색을 세밀하게 조절하세요.
              </p>
            </div>
          </div>
        ) : null}

        {view === "body" ? (
          <div role="tabpanel" aria-label="체형 실루엣 편집" className="space-y-3.5">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[0.68rem] font-bold text-fg-2">두신 비율 프리셋</p>
                <span className="text-[0.6rem] text-fg-3">3~9두신 · 얼굴·헤어 유지</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ORDERED_PROPORTION_PRESETS.map((preset) => {
                  const selected = state.proportions.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={proportionControlsDisabled}
                      aria-pressed={selected}
                      aria-label={`${preset.label} 체형: ${preset.hint}`}
                      onClick={() => onChange(sanitizeAvatarForgeState({
                        ...state,
                        presetId: undefined,
                        bodyPresetId: undefined,
                        proportions: preset.proportions,
                      }))}
                      className={`flex min-h-16 min-w-0 items-start gap-2 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${
                        selected
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-card text-fg hover:bg-raised"
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
                        {preset.emoji}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[0.68rem] font-extrabold">
                          {preset.label}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[0.6rem] leading-snug text-fg-3">
                          {preset.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-line bg-card/70 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[0.68rem] font-bold text-fg-2">리그 안전 체형 비율</p>
                <span className="rounded-full border border-accent/25 bg-accent-soft px-1.5 py-0.5 text-[0.58rem] font-bold text-accent">
                  관절 이동 방식
                </span>
              </div>
              <p className="mb-3 text-[0.62rem] leading-relaxed text-fg-3">
                본을 찌그러뜨리지 않고 관절 사이 거리를 rest 자세 기준으로 다시 계산합니다. 포즈·IK·의상·소품은 같은 리그를 계속 따라가요.
              </p>
              <div className="space-y-3">
                {STUDIO_VRM_PROPORTION_KEYS.map((key) => {
                  const limit = STUDIO_VRM_PROPORTION_LIMITS[key];
                  return (
                    <label key={key} className="block">
                      <span className="mb-1 flex items-center justify-between gap-2 text-[0.65rem] font-semibold text-fg-2">
                        <span>
                          {limit.label}
                          <span className="ml-1 font-normal text-fg-3">· {limit.hint}</span>
                        </span>
                        <output className="tabular-nums text-fg-3">
                          {formatValue(state.proportions[key], limit.unit)}
                        </output>
                      </span>
                      <input
                        type="range"
                        aria-label={limit.label}
                        min={limit.min}
                        max={limit.max}
                        step={limit.step}
                        value={state.proportions[key]}
                        disabled={proportionControlsDisabled}
                        onChange={(event) => updateProportion(key, Number(event.target.value))}
                        className="h-11 w-full cursor-pointer accent-accent disabled:cursor-not-allowed sm:h-8"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <p
              role="status"
              aria-live="polite"
              className="rounded-lg border border-line/70 bg-panel/55 px-3 py-2 text-[0.62rem] leading-relaxed text-fg-3"
            >
              <span className="font-bold text-fg-2">
                골격 {formatStudioVrmHeadUnits(proportionMetrics.headUnits)} · {runtimeProportionMetrics ? proportionMetricsLabel : "비율 기준 예상"} 신장 {proportionMetrics.totalHeight.toFixed(2)}m
              </span>
              {visualHeadUnitsDiffer
                ? ` · 현재 얼굴 조형 ${formatStudioVrmHeadUnits(visualProportionMetrics.headUnits)}`
                : ""}
              {selectedProportionPreset
                ? proportionPresetNote
                  ? ` · ${proportionPresetNote}`
                  : ` · ${selectedProportionPreset.label} 적용 중입니다. 슬라이더를 움직이면 직접 조절로 전환돼요.`
                : " · 직접 조절 중입니다. 실제 모델의 원래 키를 기준으로 같은 비율이 적용돼요."}
            </p>
            {proportionUnavailableReason ? (
              <p role="alert" className="rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-[0.62rem] leading-relaxed text-danger">
                {disabled
                  ? `리그를 안전한 상태로 확인할 때까지 아바타 조형을 잠시 중단했습니다. ${proportionUnavailableReason}`
                  : `이 모델은 리그 안전 체형 편집을 사용할 수 없습니다. ${proportionUnavailableReason} 헤어·얼굴 편집은 계속 사용할 수 있어요.`}
              </p>
            ) : null}
          </div>
        ) : null}

        {view === "hair" ? (
          <div role="tabpanel" aria-label="프로시저럴 헤어 편집" className="space-y-3.5">
            <div>
              <p className="mb-2 text-[0.68rem] font-bold text-fg-2">헤어 실루엣</p>
              <div className="grid grid-cols-4 gap-1.5">
                {AVATAR_FORGE_HAIR_STYLE_OPTIONS.map((option) => {
                  const selected = state.hair.style === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      title={option.hint}
                      onClick={() => {
                        setHairStyleChosen(true);
                        updateHair("style", option.id);
                      }}
                      className={`flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-[0.62rem] font-bold transition-colors disabled:opacity-40 ${
                        selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"
                      }`}
                    >
                      <span className="text-sm leading-none" aria-hidden>{option.emoji}</span>
                      <span className="mt-1 w-full truncate text-center">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[0.68rem] font-bold text-fg-2">앞머리 형태</p>
              <div className="grid grid-cols-3 gap-1.5">
                {AVATAR_FORGE_BANG_STYLE_OPTIONS.map((option) => {
                  const selected = state.hair.bangStyle === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={disabled || state.hair.style === "none"}
                      aria-pressed={selected}
                      title={option.hint}
                      onClick={() => updateHair("bangStyle", option.id)}
                      className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-1.5 text-[0.62rem] font-bold transition-colors disabled:opacity-40 ${
                        selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"
                      }`}
                    >
                      <span className="text-sm leading-none" aria-hidden>{option.emoji}</span>
                      <span className="min-w-0 truncate">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["baseColor", "tipColor"] as const).map((key) => (
                <label key={key} className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-card px-2.5 text-[0.66rem] font-bold text-fg-2">
                  <Palette size={13} className="text-fg-3" aria-hidden />
                  <span className="flex-1">{key === "baseColor" ? "뿌리색" : "끝색"}</span>
                  <input
                    type="color"
                    value={state.hair[key]}
                    disabled={disabled}
                    onChange={(event) => updateHair(key, event.target.value)}
                    className="size-8 cursor-pointer rounded-lg border border-line bg-transparent p-0 pointer-coarse:size-11"
                    aria-label={key === "baseColor" ? "헤어 뿌리 색상" : "헤어 끝 색상"}
                  />
                </label>
              ))}
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-card/70 p-3">
              {(["volume", "length"] as const).map((key) => {
                const limit = AVATAR_FORGE_HAIR_LIMITS[key];
                return (
                  <label key={key} className="block">
                    <span className="mb-1 flex items-center justify-between gap-2 text-[0.66rem] font-semibold text-fg-2">
                      {limit.label}
                      <output className="tabular-nums text-fg-3">{formatValue(state.hair[key], limit.unit)}</output>
                    </span>
                    <input
                      type="range"
                      min={limit.min}
                      max={limit.max}
                      step={limit.step}
                      value={state.hair[key]}
                      disabled={disabled || state.hair.style === "none"}
                      onChange={(event) => updateHair(key, Number(event.target.value))}
                      className="h-2 w-full accent-accent"
                    />
                  </label>
                );
              })}
            </div>

            <details className="group rounded-xl border border-line bg-card/55 p-3">
              <summary className="flex min-h-6 cursor-pointer list-none items-center text-[0.68rem] font-bold text-fg-2 [&::-webkit-details-marker]:hidden">
                정밀 헤어 파라미터
                <span className="ml-auto text-[0.62rem] font-medium text-fg-3 group-open:hidden">
                  {HAIR_DETAIL_KEYS.length}개
                </span>
                <span className="ml-auto hidden text-accent group-open:inline">−</span>
              </summary>
              <div className="mt-3 space-y-3 border-t border-line/60 pt-3">
                {HAIR_DETAIL_KEYS.map((key) => {
                  const limit = AVATAR_FORGE_HAIR_LIMITS[key];
                  return (
                    <label key={key} className="block">
                      <span className="mb-1 flex items-center justify-between gap-2 text-[0.65rem] font-semibold text-fg-2">
                        {limit.label}
                        <output className="tabular-nums text-fg-3">{formatValue(state.hair[key], limit.unit)}</output>
                      </span>
                      <input
                        type="range"
                        min={limit.min}
                        max={limit.max}
                        step={limit.step}
                        value={state.hair[key]}
                        disabled={disabled || state.hair.style === "none"}
                        onChange={(event) => updateHair(key, Number(event.target.value))}
                        className="h-2 w-full accent-accent"
                      />
                    </label>
                  );
                })}
              </div>
            </details>

            <div className="flex min-h-12 items-center gap-2.5 rounded-xl border border-line bg-panel/55 px-3">
              <input
                id={`${controlId}-replace-original`}
                type="checkbox"
                checked={state.hair.replaceOriginal}
                disabled={disabled || detectedOriginalHairCount === 0}
                onChange={(event) => updateHair("replaceOriginal", event.target.checked)}
                className="size-4 accent-accent pointer-coarse:size-5"
              />
              <label htmlFor={`${controlId}-replace-original`} className="min-w-0 flex-1 cursor-pointer">
                <span className="block text-[0.68rem] font-bold text-fg-2">분리 가능한 원본 헤어 숨기기</span>
                <span className="block text-[0.6rem] text-fg-3">
                  {detectedOriginalHairCount > 0
                    ? `${detectedOriginalHairCount}개 메시를 안전하게 탐지했어요.`
                    : "이 모델은 머리와 헤어가 한 메시라 원본을 유지합니다."}
                </span>
              </label>
            </div>
          </div>
        ) : null}

        {view === "face" ? (
          <div role="tabpanel" aria-label="얼굴 비율과 디테일 편집" className="space-y-3.5">
            <div className="rounded-xl border border-line bg-card/70 p-3">
              <p className="mb-1 text-[0.68rem] font-bold text-fg-2">리그 보존 얼굴 비율</p>
              <p className="mb-3 text-[0.62rem] leading-relaxed text-fg-3">
                머리 본의 안전 범위 안에서 실루엣을 조절합니다. 표정·립싱크·시선 리그는 그대로 유지돼요.
              </p>
              <div className="space-y-3">
                {(Object.keys(AVATAR_FORGE_FACE_LIMITS) as Array<keyof AvatarForgeFaceParams>).map((key) => {
                  const limit = AVATAR_FORGE_FACE_LIMITS[key];
                  return (
                    <label key={key} className="block">
                      <span className="mb-1 flex items-center justify-between gap-2 text-[0.65rem] font-semibold text-fg-2">
                        {limit.label}
                        <output className="tabular-nums text-fg-3">{formatValue(state.face[key], limit.unit)}</output>
                      </span>
                      <input
                        type="range"
                        min={limit.min}
                        max={limit.max}
                        step={limit.step}
                        value={state.face[key]}
                        disabled={disabled}
                        onChange={(event) => updateFace(key, Number(event.target.value))}
                        className="h-2 w-full accent-accent"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[0.68rem] font-bold text-fg-2">얼굴 디테일</p>
              <div className="space-y-2">
                {AVATAR_FORGE_FACE_ACCENT_OPTIONS.map((option) => {
                  const accent = state.faceAccents?.find((entry) => entry.id === option.id);
                  if (!accent) return null;
                  return (
                    <div key={option.id} className="rounded-xl border border-line bg-card p-2.5">
                      <div className="flex min-h-9 items-center gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <input
                            id={`${controlId}-${option.id}`}
                            type="checkbox"
                            checked={accent.enabled}
                            disabled={disabled}
                            onChange={(event) => updateAccent(option.id, { enabled: event.target.checked })}
                            className="size-4 accent-accent pointer-coarse:size-5"
                          />
                          <label htmlFor={`${controlId}-${option.id}`} className="min-w-0 cursor-pointer">
                            <span className="block text-[0.67rem] font-bold text-fg-2">{option.label}</span>
                            <span className="block truncate text-[0.58rem] text-fg-3">{option.hint}</span>
                          </label>
                        </div>
                        <input
                          type="color"
                          value={accent.color}
                          disabled={disabled || !accent.enabled}
                          onChange={(event) => updateAccent(option.id, { color: event.target.value })}
                          className="size-8 cursor-pointer rounded-lg border border-line bg-transparent p-0 pointer-coarse:size-11"
                          aria-label={`${option.label} 색상`}
                        />
                      </div>
                      {accent.enabled ? (
                        <label className="mt-2 flex items-center gap-2 text-[0.62rem] text-fg-3">
                          강도
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={accent.intensity}
                            disabled={disabled}
                            onChange={(event) => updateAccent(option.id, { intensity: Number(event.target.value) })}
                            className="h-2 flex-1 accent-accent"
                          />
                          <output className="w-9 text-right tabular-nums">{Math.round(accent.intensity * 100)}%</output>
                        </label>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div
        data-studio-vrm-generate=""
        className="space-y-2.5 border-t border-line/70 px-3.5 py-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[0.72rem] font-extrabold text-fg">
              <UserPlus size={14} className="text-accent" aria-hidden />
              새 VRM 캐릭터
            </p>
            <p className="mt-0.5 text-[0.62rem] leading-relaxed text-fg-3">
              위 프리셋·슬라이더를 레시피로 써서 휴머노이드 VRM을 생성합니다. 불러온 모델을 덮어쓰지 않아요.
            </p>
          </div>
          <span
            data-studio-vrm-generate-preset={previewRecipe.presetId ?? "custom"}
            className="shrink-0 rounded-full border border-line bg-card px-2 py-0.5 text-[0.6rem] font-bold text-fg-2"
          >
            {previewRecipe.label}
          </span>
        </div>

        {/* 미리보기는 편집 중인 상태가 아니라 **실제로 생성될 상태**를 보여준다. 아무것도 고르지
            않았을 때 기본 프리셋이 대신 들어가므로 둘이 갈릴 수 있다. */}
        <div
          data-studio-vrm-generate-preview=""
          className="flex items-center gap-2 rounded-xl border border-line bg-card/70 px-3 py-2"
        >
          <span
            className="size-7 rounded-full border border-line"
            style={{ background: previewRecipe.state.hair.baseColor }}
            aria-hidden
          />
          <span
            className="size-7 rounded-full border border-line"
            style={{ background: previewRecipe.state.hair.tipColor }}
            aria-hidden
          />
          <div className="min-w-0 text-[0.62rem] leading-relaxed text-fg-3">
            <p>
              헤어 {previewRecipe.state.hair.style} · 얼굴 폭{" "}
              {previewRecipe.state.face.headWidth.toFixed(2)}× · 다리{" "}
              {previewRecipe.state.proportions.legLength.toFixed(2)}×
            </p>
          </div>
        </div>

        {previewRecipe.appliedDefaultPresetId ? (
          <p
            data-studio-vrm-generate-default-preset={previewRecipe.appliedDefaultPresetId}
            className="rounded-xl border border-line bg-raised/60 px-3 py-2 text-[0.66rem] leading-relaxed text-fg-3"
          >
            아직 고른 스타일이 없어 기본 스타일 <b className="text-fg-2">{previewRecipe.label}</b>로
            생성됩니다. 위에서 다른 스타일을 고르거나 슬라이더를 조절하면 그 설정이 그대로 쓰입니다.
          </p>
        ) : null}

        {generateResult?.status === "unavailable" ? (
          <p
            data-studio-vrm-generate-unavailable=""
            data-studio-vrm-generate-status="unavailable"
            role="status"
            className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[0.66rem] leading-relaxed text-danger"
          >
            {generateResult.message}
          </p>
        ) : null}

        {generateResult?.status === "ok" ? (
          <p
            data-studio-vrm-generate-status="ok"
            role="status"
            className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-[0.66rem] text-accent"
          >
            {generateResult.recipe.label} VRM을 만들었습니다. 라이브러리에 넣고 뷰포트에서 미리볼 수 있어요.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-studio-vrm-generate-submit=""
            disabled={generateBusy}
            onClick={() => {
              setGenerateBusy(true);
              void generateStudioVrmCharacter({
                presetId: state.presetId,
                state,
                allowDefaultPreset: !hairStyleChosen,
              }).then((result) => {
                setGenerateResult(result);
                setGenerateBusy(false);
                if (result.status !== "ok") return;
                const file = new File(
                  [result.bytes],
                  `${result.recipe.label}.vrm`,
                  { type: "model/gltf-binary" },
                );
                onGeneratedFile?.(file);
              });
            }}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-2 text-[0.7rem] font-extrabold text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
          >
            <Sparkles size={14} aria-hidden />
            {generateBusy ? "생성 중…" : "VRM 생성"}
          </button>
          <button
            type="button"
            data-studio-vrm-generate-export=""
            disabled={generateBusy || generateResult?.status !== "ok"}
            onClick={() => {
              if (generateResult?.status !== "ok") return;
              const blob = new Blob([generateResult.bytes], { type: "model/gltf-binary" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `${generateResult.recipe.label}.vrm`;
              link.click();
              URL.revokeObjectURL(url);
            }}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-2 text-[0.7rem] font-extrabold text-fg-2 transition-colors hover:bg-raised disabled:opacity-40"
          >
            <Download size={14} aria-hidden />
            VRM 내보내기
          </button>
        </div>
      </div>
    </section>
  );
}
