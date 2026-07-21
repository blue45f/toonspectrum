/** Searchable, reorderable, non-destructive smart-filter stack for image elements. */
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useId, useState } from "react";

import {
  STUDIO_ADJUSTMENT_ADDABLE_ENGINE_IDS,
  STUDIO_ADJUSTMENT_ENGINE_IDS,
  STUDIO_ADJUSTMENT_STACK_MAX_ENTRIES,
  appendStudioAdjustmentEntry,
  normalizeStudioAdjustmentStack,
  removeStudioAdjustmentEntry,
  reorderStudioAdjustmentEntry,
  setStudioAdjustmentEntryEnabled,
  studioAdjustmentDefaultParams,
  studioAdjustmentEngineLabel,
  type StudioAdjustmentEngineId,
  type StudioAdjustmentEntry,
  type StudioAdjustmentStack,
} from "./studio-adjustment-stack";
import {
  STUDIO_FILTER_GROUP_ORDER,
  searchStudioFilterCatalog,
  studioFilterCatalogEntry,
  studioFilterGroupLabel,
} from "./studio-filter-catalog";
import { StudioToolHintTarget } from "./StudioToolHint";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

type SmartFilterParams = StudioAdjustmentEntry["params"];

type NumericControlSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
  suffix?: string;
};

const NUMERIC_CONTROLS: Partial<Record<StudioAdjustmentEngineId, readonly NumericControlSpec[]>> = {
  blur: [
    { key: "radius", label: "반경", min: 0, max: 30, step: 1, fallback: 2, suffix: "px" },
  ],
  "gaussian-blur": [
    { key: "radius", label: "반경", min: 1, max: 40, step: 1, fallback: 8, suffix: "px" },
    { key: "strength", label: "세기", min: 0, max: 100, step: 1, fallback: 70, suffix: "%" },
  ],
  "motion-blur": [
    { key: "radius", label: "거리", min: 1, max: 40, step: 1, fallback: 18, suffix: "px" },
    { key: "strength", label: "세기", min: 0, max: 100, step: 1, fallback: 85, suffix: "%" },
    { key: "angle", label: "각도", min: 0, max: 360, step: 1, fallback: 0, suffix: "°" },
  ],
  "brightness-contrast": [
    { key: "brightness", label: "밝기", min: -0.8, max: 0.8, step: 0.05, fallback: 0 },
    { key: "contrast", label: "대비", min: -80, max: 80, step: 1, fallback: 0 },
  ],
  "hue-saturation": [
    { key: "hue", label: "색조", min: -180, max: 180, step: 5, fallback: 0, suffix: "°" },
    { key: "saturation", label: "채도", min: -1, max: 1, step: 0.05, fallback: 0 },
  ],
  levels: [
    { key: "black", label: "입력 검정", min: 0, max: 254, step: 1, fallback: 0 },
    { key: "white", label: "입력 흰색", min: 1, max: 255, step: 1, fallback: 255 },
    { key: "gamma", label: "감마", min: 0.1, max: 9.9, step: 0.1, fallback: 1 },
    { key: "outBlack", label: "출력 검정", min: 0, max: 255, step: 1, fallback: 0 },
    { key: "outWhite", label: "출력 흰색", min: 0, max: 255, step: 1, fallback: 255 },
  ],
  sharpen: [
    { key: "amount", label: "선명도", min: 0, max: 1, step: 0.05, fallback: 0.3 },
  ],
  noise: [
    { key: "amount", label: "양", min: 0, max: 100, step: 1, fallback: 15, suffix: "%" },
  ],
  exposure: [
    { key: "exposure", label: "노출", min: -5, max: 5, step: 0.1, fallback: 0, suffix: "EV" },
    { key: "gamma", label: "감마", min: 0.1, max: 3, step: 0.05, fallback: 1 },
    { key: "offset", label: "오프셋", min: -1, max: 1, step: 0.01, fallback: 0 },
  ],
  "unsharp-mask": [
    { key: "amount", label: "양", min: 0, max: 3, step: 0.05, fallback: 0.8 },
    { key: "radius", label: "반경", min: 1, max: 5, step: 1, fallback: 2, suffix: "px" },
    { key: "threshold", label: "임계값", min: 0, max: 255, step: 1, fallback: 8 },
  ],
  morphology: [
    { key: "radius", label: "반경", min: 0, max: 4, step: 1, fallback: 1, suffix: "px" },
  ],
  offset: [
    { key: "x", label: "가로", min: -512, max: 512, step: 1, fallback: 12, suffix: "px" },
    { key: "y", label: "세로", min: -512, max: 512, step: 1, fallback: 12, suffix: "px" },
  ],
  "custom-convolution": [
    { key: "divisor", label: "나눗수", min: -64, max: 64, step: 0.1, fallback: 1 },
    { key: "bias", label: "바이어스", min: -255, max: 255, step: 1, fallback: 0 },
  ],
  clouds: [
    { key: "amount", label: "합성량", min: 0, max: 1, step: 0.01, fallback: 0.35 },
    { key: "scale", label: "크기", min: 8, max: 512, step: 1, fallback: 96, suffix: "px" },
  ],
};

const PRESET_OPTIONS: Partial<Record<StudioAdjustmentEngineId, readonly { value: string; label: string }[]>> = {
  curves: [
    { value: "soft-contrast", label: "부드러운 S 커브" },
    { value: "matte", label: "매트" },
    { value: "fade", label: "페이드" },
  ],
  "color-balance": [
    { value: "cinematic", label: "시네마틱" },
    { value: "warm", label: "따뜻하게" },
    { value: "cool", label: "차갑게" },
    { value: "sunset", label: "석양" },
  ],
  "channel-mixer": [
    { value: "mono-balanced", label: "균형 흑백" },
    { value: "red-boost", label: "레드 부스트" },
    { value: "swap-gbr", label: "RGB → GBR" },
  ],
  "gradient-map": [
    { value: "teal-orange", label: "틸 오렌지" },
    { value: "mono", label: "흑백" },
    { value: "sepia", label: "세피아" },
    { value: "sunset", label: "석양" },
  ],
};

const CONVOLUTION_PRESETS: readonly {
  id: string;
  label: string;
  kernel: readonly number[];
  divisor: number;
  bias: number;
}[] = [
  { id: "sharpen", label: "샤픈", kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0], divisor: 1, bias: 0 },
  { id: "edge", label: "외곽선", kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1], divisor: 1, bias: 128 },
  { id: "emboss", label: "엠보스", kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2], divisor: 1, bias: 128 },
  { id: "box-blur", label: "박스 블러", kernel: [1, 1, 1, 1, 1, 1, 1, 1, 1], divisor: 9, bias: 0 },
];

function numericParam(params: SmartFilterParams, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatNumericValue(value: number, step: number): string {
  if (Number.isInteger(step)) return String(Math.round(value));
  const precision = Math.min(3, Math.max(1, String(step).split(".")[1]?.length ?? 1));
  return value.toFixed(precision).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function NumericParameterControl({
  spec,
  params,
  onChange,
}: {
  spec: NumericControlSpec;
  params: SmartFilterParams;
  onChange: (next: SmartFilterParams) => void;
}) {
  const id = useId();
  const value = numericParam(params, spec.key, spec.fallback);
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2">
      <label htmlFor={id} className="text-[0.62rem] font-semibold text-fg-2">
        {spec.label}
      </label>
      <input
        id={id}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(event) => onChange({ ...params, [spec.key]: Number(event.target.value) })}
        className="h-10 min-w-0 cursor-pointer accent-accent pointer-coarse:h-11"
      />
      <output htmlFor={id} className="text-right text-[0.6rem] tabular-nums text-fg-3">
        {formatNumericValue(value, spec.step)}{spec.suffix ?? ""}
      </output>
    </div>
  );
}

function SelectParameterControl({
  label,
  paramKey,
  value,
  options,
  params,
  onChange,
}: {
  label: string;
  paramKey: string;
  value: string;
  options: readonly { value: string; label: string }[];
  params: SmartFilterParams;
  onChange: (next: SmartFilterParams) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-[0.62rem] font-semibold text-fg-2">
      <span>{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange({ ...params, [paramKey]: event.target.value })}
        className="min-h-10 min-w-0 rounded-lg border border-line bg-canvas px-2 text-[0.65rem] text-fg outline-none focus:border-accent pointer-coarse:min-h-11"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ConvolutionKernelEditor({
  params,
  onChange,
}: {
  params: SmartFilterParams;
  onChange: (next: SmartFilterParams) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-line/70 bg-canvas/45 p-2">
      <div className="flex flex-wrap gap-1">
        {CONVOLUTION_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange({
              ...params,
              ...Object.fromEntries(preset.kernel.map((value, index) => [`k${index}`, value])),
              divisor: preset.divisor,
              bias: preset.bias,
            })}
            className="min-h-9 rounded-lg border border-line bg-card px-2 text-[0.6rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg pointer-coarse:min-h-11"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <fieldset>
        <legend className="mb-1 text-[0.6rem] font-semibold text-fg-3">3 × 3 커널</legend>
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 9 }, (_, index) => {
            const key = `k${index}`;
            return (
              <label key={key} className="min-w-0">
                <span className="sr-only">커널 {index + 1}</span>
                <input
                  type="number"
                  min={-16}
                  max={16}
                  step={0.25}
                  value={numericParam(params, key, index === 4 ? 1 : 0)}
                  onChange={(event) => onChange({ ...params, [key]: Number(event.target.value) })}
                  className="min-h-10 w-full rounded-md border border-line bg-card px-1 text-center text-[0.62rem] tabular-nums text-fg outline-none focus:border-accent pointer-coarse:min-h-11"
                />
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function StudioSmartFilterControls({
  entry,
  onChange,
}: {
  entry: StudioAdjustmentEntry;
  onChange: (params: SmartFilterParams) => void;
}) {
  const controls = NUMERIC_CONTROLS[entry.engine] ?? [];
  const presetOptions = PRESET_OPTIONS[entry.engine];
  return (
    <div className="ml-7 space-y-2 rounded-lg border border-line/60 bg-panel/35 p-2">
      {presetOptions ? (
        <SelectParameterControl
          label="프리셋"
          paramKey="preset"
          value={typeof entry.params.preset === "string" ? entry.params.preset : presetOptions[0]!.value}
          options={presetOptions}
          params={entry.params}
          onChange={onChange}
        />
      ) : null}
      {entry.engine === "morphology" ? (
        <SelectParameterControl
          label="연산"
          paramKey="mode"
          value={entry.params.mode === "dilate" ? "dilate" : "erode"}
          options={[
            { value: "erode", label: "침식 · 어두운 선 확장" },
            { value: "dilate", label: "팽창 · 밝은 영역 확장" },
          ]}
          params={entry.params}
          onChange={onChange}
        />
      ) : null}
      {entry.engine === "offset" ? (
        <SelectParameterControl
          label="가장자리"
          paramKey="edge"
          value={typeof entry.params.edge === "string" ? entry.params.edge : "transparent"}
          options={[
            { value: "transparent", label: "투명" },
            { value: "wrap", label: "반복" },
            { value: "clamp", label: "가장자리 늘이기" },
          ]}
          params={entry.params}
          onChange={onChange}
        />
      ) : null}
      {entry.engine === "noise" ? (
        <label className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-[0.62rem] font-semibold text-fg-2">
          <span>시드</span>
          <input
            type="number"
            min={0}
            max={2_147_483_647}
            step={1}
            value={numericParam(entry.params, "seed", 1_337)}
            onChange={(event) => onChange({ ...entry.params, seed: Number(event.target.value) })}
            className="min-h-10 rounded-lg border border-line bg-canvas px-2 text-[0.65rem] tabular-nums text-fg outline-none focus:border-accent pointer-coarse:min-h-11"
          />
        </label>
      ) : null}
      {entry.engine === "clouds" ? (
        <>
          <SelectParameterControl
            label="합성"
            paramKey="mode"
            value={typeof entry.params.mode === "string" ? entry.params.mode : "overlay"}
            options={[
              { value: "overlay", label: "오버레이" },
              { value: "multiply", label: "곱하기" },
              { value: "screen", label: "스크린" },
            ]}
            params={entry.params}
            onChange={onChange}
          />
          <label className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-[0.62rem] font-semibold text-fg-2">
            <span>시드</span>
            <input
              type="number"
              min={0}
              max={2_147_483_647}
              step={1}
              value={numericParam(entry.params, "seed", 1_337)}
              onChange={(event) => onChange({ ...entry.params, seed: Number(event.target.value) })}
              className="min-h-10 rounded-lg border border-line bg-canvas px-2 text-[0.65rem] tabular-nums text-fg outline-none focus:border-accent pointer-coarse:min-h-11"
            />
          </label>
        </>
      ) : null}
      {entry.engine === "custom-convolution" ? (
        <ConvolutionKernelEditor params={entry.params} onChange={onChange} />
      ) : null}
      {controls.map((spec) => (
        <NumericParameterControl
          key={spec.key}
          spec={spec}
          params={entry.params}
          onChange={onChange}
        />
      ))}
      {entry.engine === "invert" ? (
        <p className="text-[0.62rem] leading-relaxed text-fg-3">추가하는 즉시 RGB 색상을 반전합니다.</p>
      ) : null}
    </div>
  );
}

export function StudioSmartFiltersPanel({
  stack,
  onChange,
}: {
  stack: StudioAdjustmentStack | undefined;
  onChange: (next: StudioAdjustmentStack) => void;
}): React.ReactElement {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const current = normalizeStudioAdjustmentStack(stack);
  const visibleCatalog = searchStudioFilterCatalog(query, STUDIO_ADJUSTMENT_ADDABLE_ENGINE_IDS);
  const stackFull = current.entries.length >= STUDIO_ADJUSTMENT_STACK_MAX_ENTRIES;

  function patch(next: StudioAdjustmentStack) {
    onChange(normalizeStudioAdjustmentStack(next));
  }

  function addEngine(engine: StudioAdjustmentEngineId) {
    if (!STUDIO_ADJUSTMENT_ENGINE_IDS.includes(engine) || stackFull) return;
    patch(appendStudioAdjustmentEntry(current, {
      engine,
      params: studioAdjustmentDefaultParams(engine),
    }));
  }

  function patchEntryParams(entryId: string, params: SmartFilterParams) {
    patch({
      ...current,
      entries: current.entries.map((entry) => entry.id === entryId ? { ...entry, params } : entry),
    });
  }

  return (
    <div className="space-y-3" data-studio-filter-manager="true">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">필터 관리</p>
          <p className="mt-0.5 text-[0.65rem] leading-relaxed text-fg-3">
            원본은 유지됩니다. 필터를 검색해 추가하고 각 항목의 값을 언제든 다시 조절하세요.
            모든 계산은 브라우저의 로컬 Worker에서 우선 실행됩니다.
          </p>
        </div>
        <span className="shrink-0 rounded-lg border border-line bg-card px-2 py-1 text-[0.6rem] tabular-nums text-fg-3">
          {current.entries.length}/{STUDIO_ADJUSTMENT_STACK_MAX_ENTRIES}
        </span>
      </div>

      <div className="rounded-xl border border-line/70 bg-card/40 p-2.5">
        <label htmlFor={searchId} className="sr-only">필터 검색</label>
        <div className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 focus-within:border-accent">
          <Search className="size-3.5 shrink-0 text-fg-3" aria-hidden />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="필터 이름·효과 검색"
            className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-3"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="필터 검색어 지우기"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg pointer-coarse:size-11"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>

        <p className="mt-2 text-[0.58rem] text-fg-3" role="status" aria-live="polite">
          {query ? `검색 결과 ${visibleCatalog.length}개` : `사용 가능한 필터 ${visibleCatalog.length}개`}
          {stackFull ? " · 스택이 가득 찼습니다" : ""}
        </p>

        <div className="mt-2 max-h-72 space-y-2.5 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]">
          {STUDIO_FILTER_GROUP_ORDER.map((group) => {
            const items = visibleCatalog.filter((entry) => entry.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group} aria-labelledby={`${searchId}-${group}`}>
                <h3 id={`${searchId}-${group}`} className="mb-1 text-[0.58rem] font-bold uppercase tracking-wider text-fg-3">
                  {studioFilterGroupLabel(group)} · {items.length}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((entry) => (
                    <StudioToolHintTarget
                      key={entry.engine}
                      hint={{
                        id: `smart-filter-${entry.engine}`,
                        title: entry.title,
                        description: entry.description,
                        preview: "filter",
                        tip: "원본을 보존한 채 스택에 추가되며 나중에 값을 다시 바꿀 수 있어요.",
                      }}
                    >
                      <button
                        type="button"
                        disabled={stackFull}
                        onClick={() => addEngine(entry.engine as StudioAdjustmentEngineId)}
                        className={cn(
                          "inline-flex min-h-10 items-center gap-1 rounded-lg border border-line/70 bg-canvas/50 px-2.5 text-[0.62rem] font-bold text-fg-2 pointer-coarse:min-h-11",
                          "hover:border-accent/45 hover:bg-accent-soft/40 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                          "disabled:cursor-not-allowed disabled:opacity-45",
                        )}
                      >
                        <Plus className="size-3" aria-hidden />
                        {entry.title}
                      </button>
                    </StudioToolHintTarget>
                  ))}
                </div>
              </section>
            );
          })}
          {visibleCatalog.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center">
              <p className="text-xs font-semibold text-fg-2">일치하는 필터가 없습니다</p>
              <p className="mt-1 text-[0.62rem] text-fg-3">‘선명’, ‘구름’, ‘감마’처럼 효과 이름으로 찾아보세요.</p>
            </div>
          ) : null}
        </div>
      </div>

      {current.entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-card/40 px-3 py-4 text-center text-[0.68rem] text-fg-3">
          스택이 비어 있어요. 위 카탈로그에서 필터를 추가하면 여기에 조절값이 나타납니다.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="스마트 필터 목록">
          {current.entries.map((entry, index) => {
            const catalog = studioFilterCatalogEntry(entry.engine);
            return (
              <li key={entry.id} className={cn("space-y-2 bg-card/50 px-2 py-2", !entry.enabled && "opacity-55")}>
                <div className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-right font-display text-[0.62rem] tabular-nums text-fg-3">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.72rem] font-semibold text-fg">
                      {studioAdjustmentEngineLabel(entry.engine)}
                    </p>
                    <p className="line-clamp-2 text-[0.58rem] leading-relaxed text-fg-3">
                      {catalog?.description ?? entry.engine}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={entry.enabled ? `${studioAdjustmentEngineLabel(entry.engine)} 끄기` : `${studioAdjustmentEngineLabel(entry.engine)} 켜기`}
                    aria-pressed={entry.enabled}
                    title={entry.enabled ? "미리보기 끄기" : "미리보기 켜기"}
                    className={buttonClass({ size: "sm", variant: "quiet", className: "min-h-10 min-w-10 pointer-coarse:min-h-11 pointer-coarse:min-w-11" })}
                    onClick={() => patch(setStudioAdjustmentEntryEnabled(current, entry.id, !entry.enabled))}
                  >
                    {entry.enabled ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                  </button>
                  <button
                    type="button"
                    aria-label={`${studioAdjustmentEngineLabel(entry.engine)} 위로 이동`}
                    disabled={index === 0}
                    className={buttonClass({ size: "sm", variant: "quiet", className: "min-h-10 min-w-10 pointer-coarse:min-h-11 pointer-coarse:min-w-11" })}
                    onClick={() => patch(reorderStudioAdjustmentEntry(current, index, index - 1))}
                  >
                    <ArrowUp className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${studioAdjustmentEngineLabel(entry.engine)} 아래로 이동`}
                    disabled={index >= current.entries.length - 1}
                    className={buttonClass({ size: "sm", variant: "quiet", className: "min-h-10 min-w-10 pointer-coarse:min-h-11 pointer-coarse:min-w-11" })}
                    onClick={() => patch(reorderStudioAdjustmentEntry(current, index, index + 1))}
                  >
                    <ArrowDown className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${studioAdjustmentEngineLabel(entry.engine)} 삭제`}
                    className={buttonClass({ size: "sm", variant: "quiet", className: "min-h-10 min-w-10 text-bad pointer-coarse:min-h-11 pointer-coarse:min-w-11" })}
                    onClick={() => patch(removeStudioAdjustmentEntry(current, entry.id))}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
                {entry.enabled ? (
                  <StudioSmartFilterControls
                    entry={entry}
                    onChange={(params) => patchEntryParams(entry.id, params)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
