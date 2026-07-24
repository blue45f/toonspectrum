import { CircleUserRound, Palette, RotateCcw, Scissors, Sparkles, WandSparkles } from "lucide-react";
import { useId, useState } from "react";

import {
  AVATAR_FORGE_BANG_STYLE_OPTIONS,
  AVATAR_FORGE_FACE_ACCENT_OPTIONS,
  AVATAR_FORGE_FACE_LIMITS,
  AVATAR_FORGE_HAIR_LIMITS,
  AVATAR_FORGE_HAIR_STYLE_OPTIONS,
  AVATAR_FORGE_PRESETS,
  createAvatarForgeState,
  type AvatarForgeFaceAccentId,
  type AvatarForgeFaceParams,
  type AvatarForgeHairParams,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";

/** 정밀 파라미터 슬라이더 순서 — 라벨/범위는 AVATAR_FORGE_HAIR_LIMITS가 단일 소스. */
const HAIR_DETAIL_KEYS = ["strandWidth", "fringe", "curl", "shine", "wave", "ahoge", "tailHeight"] as const;

type ForgeView = "presets" | "hair" | "face";

type StudioVrmAvatarForgePanelProps = {
  state: AvatarForgeState;
  disabled?: boolean;
  detectedOriginalHairCount?: number;
  onChange: (state: AvatarForgeState) => void;
};

const VIEWS: ReadonlyArray<{
  id: ForgeView;
  label: string;
  hint: string;
  icon: typeof WandSparkles;
}> = [
  { id: "presets", label: "스타일", hint: "완성형 조합으로 시작", icon: WandSparkles },
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
  onChange,
}: StudioVrmAvatarForgePanelProps) {
  const controlId = useId();
  const [view, setView] = useState<ForgeView>("presets");

  const updateFace = <K extends keyof AvatarForgeFaceParams>(key: K, value: AvatarForgeFaceParams[K]) => {
    onChange({ ...state, presetId: undefined, face: { ...state.face, [key]: value } });
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
              리그와 표정을 보존하면서 헤어 파츠와 얼굴 비율을 비파괴로 조형합니다. 모든 변경은 저장·공유·되돌리기에 포함돼요.
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

        <div role="tablist" aria-label="아바타 조형 단계" className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-line/70 bg-panel/65 p-1">
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
                className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-[0.68rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  selected
                    ? "border-accent/45 bg-accent-soft text-accent shadow-sm"
                    : "border-transparent text-fg-3 hover:bg-raised hover:text-fg"
                }`}
              >
                <Icon size={14} aria-hidden />
                {item.label}
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
            <div className="mt-2.5 rounded-xl border border-line/70 bg-panel/55 p-2.5">
              <p className="flex items-center gap-1.5 text-[0.66rem] font-bold text-fg-2">
                <WandSparkles size={13} className="text-accent" aria-hidden />
                다음 단계
              </p>
              <p className="mt-1 text-[0.64rem] leading-relaxed text-fg-3">
                스타일을 고른 뒤 헤어 탭에서 길이·컬·투톤을, 얼굴 탭에서 머리 비율과 메이크업 디테일을 조절하세요.
              </p>
            </div>
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
                      onClick={() => updateHair("style", option.id)}
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
    </section>
  );
}
