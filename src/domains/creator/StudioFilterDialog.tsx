import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from "react";

import {
  browserStudioCreatorPackStorage,
  listStudioCreatorFilterPresets,
} from "./studio-creator-filter-preset-reader";
import {
  STUDIO_FILTER_LABELS,
  cloneStudioFilterDraft,
  createStudioFilterDraft,
  isStudioFilterPackDraft,
  studioFilterDraftToPatch,
  type StudioFilterDraft,
  type StudioFilterKind,
  type StudioFilterPackDraft,
} from "./studio-filter-menu";
import {
  STUDIO_FILTER_PACK_DEFS,
  isStudioFilterPackKind,
  type StudioFilterPackValues,
} from "./studio-filter-pack";
import { isStudioFilterUnionWaveKind } from "./studio-filter-union-wave";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { StudioCurvePanel } from "./StudioCurvePanel";
import { useStudioHistogramSource } from "./useStudioHistogramSource";
import { useStudioModalSheet } from "./useStudioModalSheet";

import type { CurvePoint, CurveRgbChannels } from "./studio-curves";
import type { ImageFilterFields } from "./studio-konva-filter-fields";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

type FilterPatch = Partial<ImageFilterFields>;

interface StudioFilterDialogProps {
  activeKey: string;
  kind: StudioFilterKind;
  image: ImageFilterFields;
  /** 선택 이미지의 src — 있으면 색상 커브 위에 히스토그램을 그린다(페이지 합성 대상이면 생략). */
  imageSrc?: string | null;
  initialDraft?: StudioFilterDraft;
  rootRef: RefObject<HTMLElement | null>;
  targetKind?: "image" | "page-composite";
  mutationLocked?: boolean;
  mutationLockReason?: string;
  applying?: boolean;
  onPreview: (patch: FilterPatch | null) => void;
  onApply: (patch: FilterPatch, draft: StudioFilterDraft) => void;
  onClose: () => void;
}

interface NumberControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  autofocus?: boolean;
  onChange: (value: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function committedNumberDraft(rawValue: string, fallback: number, min: number, max: number): number {
  const normalized = rawValue.trim().replace(",", ".");
  if (normalized === "" || normalized === "-" || normalized === "." || normalized === "-.") {
    return clamp(fallback, min, max);
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : clamp(fallback, min, max);
}

function isEditableNumberDraft(rawValue: string): boolean {
  return /^-?(?:\d+)?(?:[.,]\d*)?$/.test(rawValue);
}

function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  autofocus,
  onChange,
}: NumberControlProps): ReactElement {
  const id = `studio-filter-${label.replace(/\s+/g, "-")}`;
  const [numberDraft, setNumberDraft] = useState<string | null>(null);
  const commitNumberDraft = (rawValue: string) => {
    const committed = committedNumberDraft(rawValue, value, min, max);
    setNumberDraft(null);
    if (committed !== value) onChange(committed);
  };
  const updateRange = (rawValue: string) => {
    const committed = clamp(Number(rawValue), min, max);
    setNumberDraft(null);
    onChange(committed);
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-x-3 gap-y-2 min-[420px]:grid-cols-[minmax(5rem,1fr)_minmax(0,2fr)_5.5rem]">
      <label htmlFor={id} className="col-span-2 text-xs font-semibold text-fg-2 min-[420px]:col-span-1">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => updateRange(event.target.value)}
        className="h-11 w-full cursor-pointer accent-accent sm:h-8 pointer-coarse:h-11"
        data-autofocus={autofocus ? "true" : undefined}
      />
      <label className="flex min-h-11 items-center rounded-xl border border-line bg-card px-2 focus-within:border-accent sm:min-h-10 pointer-coarse:min-h-11">
        <span className="sr-only">{label} 숫자</span>
        <input
          type="text"
          inputMode="decimal"
          value={numberDraft ?? String(value)}
          onFocus={(event) => setNumberDraft(event.currentTarget.value)}
          onChange={(event) => {
            if (isEditableNumberDraft(event.target.value)) setNumberDraft(event.target.value);
          }}
          onBlur={(event) => commitNumberDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitNumberDraft(event.currentTarget.value);
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-right text-xs font-semibold tabular-nums text-fg outline-none"
          aria-label={`${label} 숫자`}
        />
        {suffix ? <span className="ml-1 text-[0.65rem] text-fg-3">{suffix}</span> : null}
      </label>
    </div>
  );
}

interface ColorControlProps {
  label: string;
  value: string;
  autofocus?: boolean;
  onChange: (value: string) => void;
}

// 듀오톤 등 색상 파라미터용 — 네이티브 색상 피커 + 현재 헥스 값 표시.
function ColorControl({ label, value, autofocus, onChange }: ColorControlProps): ReactElement {
  const id = `studio-filter-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-x-3 gap-y-2">
      <label htmlFor={id} className="text-xs font-semibold text-fg-2">
        {label}
      </label>
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-2 focus-within:border-accent sm:min-h-10 pointer-coarse:min-h-11">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="size-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
          data-autofocus={autofocus ? "true" : undefined}
          aria-label={label}
        />
        <span className="min-w-0 flex-1 text-right text-xs font-semibold tabular-nums text-fg">
          {value}
        </span>
      </label>
    </div>
  );
}

interface FilterPackControlsProps {
  draft: StudioFilterPackDraft;
  onChange: (values: StudioFilterPackValues) => void;
}

// 필터 팩 종류 — studio-filter-pack의 파라미터 스키마로 컨트롤을 데이터 기반 렌더링.
function FilterPackControls({ draft, onChange }: FilterPackControlsProps): ReactElement {
  const def = STUDIO_FILTER_PACK_DEFS[draft.kind];
  const setValue = (key: string, value: number | string) => {
    onChange({ ...draft.values, [key]: value });
  };
  return (
    <>
      {def.params.map((param, index) => {
        if (param.control === "color") {
          const raw = draft.values[param.key];
          const fallback = def.defaults[param.key];
          return (
            <ColorControl
              key={param.key}
              label={param.label}
              value={typeof raw === "string" ? raw : String(fallback)}
              autofocus={index === 0}
              onChange={(value) => setValue(param.key, value)}
            />
          );
        }
        const raw = draft.values[param.key];
        const fallback = def.defaults[param.key];
        return (
          <NumberControl
            key={param.key}
            label={param.label}
            min={param.min}
            max={param.max}
            step={param.step ?? 1}
            {...(param.suffix ? { suffix: param.suffix } : {})}
            value={typeof raw === "number" ? raw : Number(fallback)}
            autofocus={index === 0}
            onChange={(value) => setValue(param.key, value)}
          />
        );
      })}
    </>
  );
}

function defaultDraft(kind: StudioFilterKind): StudioFilterDraft {
  return createStudioFilterDraft(kind, {});
}

export function StudioFilterDialog({
  activeKey,
  kind,
  image,
  imageSrc,
  initialDraft,
  rootRef,
  targetKind = "image",
  mutationLocked = false,
  mutationLockReason,
  applying = false,
  onPreview,
  onApply,
  onClose,
}: StudioFilterDialogProps): ReactElement {
  const dialogRef = useRef<HTMLElement>(null);
  // 히스토그램 원본 — src 키 LRU 캐시(디코드는 다이얼로그 세션당 최대 1회).
  const histogramSource = useStudioHistogramSource(imageSrc);
  const [draft, setDraft] = useState<StudioFilterDraft>(() =>
    initialDraft && initialDraft.kind === kind
      ? cloneStudioFilterDraft(initialDraft)
      : createStudioFilterDraft(kind, image),
  );
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [installedPackPresets] = useState(() =>
    isStudioFilterPackKind(kind)
      ? listStudioCreatorFilterPresets(
        browserStudioCreatorPackStorage(),
      ).filter((preset) => preset.engine === kind)
      : [],
  );
  const reportPreview = useEffectEvent(onPreview);

  useStudioModalSheet({
    activeKey,
    dialogRef,
    onDismiss: onClose,
    resolveInitialFocus: (dialog) => dialog.querySelector<HTMLElement>("[data-autofocus='true']"),
    rootRef,
  });

  useEffect(() => {
    reportPreview(previewEnabled ? studioFilterDraftToPatch(draft) : null);
  }, [draft, previewEnabled]);

  useEffect(() => () => reportPreview(null), []);

  const title = STUDIO_FILTER_LABELS[kind];
  const resetDraft = () => {
    if (applying) return;
    setDraft(defaultDraft(kind));
  };
  const lockMessage =
    mutationLockReason ??
    "선택한 이미지 또는 문서가 잠겨 있어 적용할 수 없습니다. 잠금을 해제하면 현재 미리보기 값을 적용할 수 있습니다.";
  const descriptionId = "studio-filter-dialog-description";
  const compositeNoticeId = "studio-filter-composite-notice";
  const lockMessageId = "studio-filter-lock-message";
  const describedBy = [
    descriptionId,
    targetKind === "page-composite" ? compositeNoticeId : null,
    mutationLocked ? lockMessageId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-2 sm:p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        data-studio-modal-backdrop="true"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[oklch(0.08_0.01_70/0.78)] backdrop-blur-sm"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-filter-dialog-title"
        aria-describedby={describedBy}
        aria-busy={applying || undefined}
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
        className="relative flex max-h-[min(86dvh,42rem)] w-[min(34rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel text-fg shadow-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent/35 bg-accent-soft text-accent">
            <SlidersHorizontal size={17} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="studio-filter-dialog-title" className="truncate text-sm font-bold tracking-tight text-fg">
              {title}
            </h2>
            <p id={descriptionId} className="mt-0.5 text-[0.7rem] leading-relaxed text-fg-3">
              {targetKind === "page-composite"
                ? "현재 보이는 페이지를 편집 가능한 합성 레이어로 만들고, 원본 레이어를 보존한 채 필터를 적용합니다."
                : "선택한 이미지 레이어에 비파괴 필터로 적용합니다."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`${title} 닫기`}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised hover:text-fg sm:size-10 pointer-coarse:size-11",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-width:thin]">
          <div className="space-y-4">
            {targetKind === "page-composite" ? (
              <p
                id={compositeNoticeId}
                role="note"
                className="rounded-lg border border-accent/25 bg-accent-soft/55 px-3 py-2 text-[0.7rem] leading-relaxed text-fg-2"
              >
                <strong className="font-semibold text-fg">원본은 그대로 유지됩니다.</strong>{" "}
                적용 후 실행 취소 한 번으로 새 합성 레이어만 제거할 수 있습니다.
              </p>
            ) : null}

            {isStudioFilterPackDraft(draft) ? (
              <>
                {installedPackPresets.length > 0 ? (
                  <section
                    aria-label="설치한 Creator Pack 필터 프리셋"
                    className="rounded-lg border border-accent/25 bg-accent-soft/35 p-2.5"
                  >
                    <p className="text-[0.68rem] font-bold text-fg">
                      설치한 Creator Pack 프리셋
                    </p>
                    <p className="mt-0.5 text-[0.62rem] leading-relaxed text-fg-3">
                      선택하면 현재 다이얼로그 값과 비파괴 미리보기에 즉시 반영됩니다.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {installedPackPresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setDraft({
                            kind: preset.engine,
                            values: { ...preset.values },
                          })}
                          className={cn(
                            "min-h-11 rounded-lg border border-line bg-card px-3 text-[0.68rem] font-semibold text-fg-2 hover:border-accent/45 hover:bg-raised",
                            STUDIO_EASE,
                            STUDIO_FOCUS_RING,
                          )}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
                {isStudioFilterUnionWaveKind(draft.kind) ? (
                  <p
                    role="note"
                    className="rounded-lg border border-line bg-card/70 px-3 py-2 text-[0.68rem] leading-relaxed text-fg-3"
                  >
                    가장자리는 반복 없이 고정해 빈 틈을 막고, 투명도는 원본 그대로
                    보존합니다. 같은 시드는 언제나 같은 결과를 만듭니다.
                  </p>
                ) : null}
                <FilterPackControls
                  draft={draft}
                  onChange={(values) => setDraft({ ...draft, values })}
                />
              </>
            ) : null}

            {draft.kind === "gaussian-blur" ? (
              <NumberControl
                label="반지름"
                min={1}
                max={40}
                value={draft.radius}
                suffix="px"
                autofocus
                onChange={(radius) => setDraft({ ...draft, radius })}
              />
            ) : null}

            {draft.kind === "motion-blur" ? (
              <>
                <NumberControl
                  label="거리"
                  min={1}
                  max={40}
                  value={draft.distance}
                  suffix="px"
                  autofocus
                  onChange={(distance) => setDraft({ ...draft, distance })}
                />
                <NumberControl
                  label="각도"
                  min={-180}
                  max={180}
                  value={draft.angle}
                  suffix="°"
                  onChange={(angle) => setDraft({ ...draft, angle })}
                />
              </>
            ) : null}

            {draft.kind === "hue-saturation-brightness" ? (
              <>
                <NumberControl
                  label="색조"
                  min={-180}
                  max={180}
                  value={draft.hue}
                  suffix="°"
                  autofocus
                  onChange={(hue) => setDraft({ ...draft, hue })}
                />
                <NumberControl
                  label="채도"
                  min={-100}
                  max={100}
                  value={draft.saturation}
                  suffix="%"
                  onChange={(saturation) => setDraft({ ...draft, saturation })}
                />
                <NumberControl
                  label="밝기/명도"
                  min={-80}
                  max={80}
                  value={draft.brightness}
                  suffix="%"
                  onChange={(brightness) => setDraft({ ...draft, brightness })}
                />
              </>
            ) : null}

            {draft.kind === "brightness-contrast" ? (
              <>
                <NumberControl
                  label="명도"
                  min={-80}
                  max={80}
                  value={draft.brightness}
                  suffix="%"
                  autofocus
                  onChange={(brightness) => setDraft({ ...draft, brightness })}
                />
                <NumberControl
                  label="대비"
                  min={-80}
                  max={80}
                  value={draft.contrast}
                  suffix="%"
                  onChange={(contrast) => setDraft({ ...draft, contrast })}
                />
              </>
            ) : null}

            {draft.kind === "color-curves" ? (
              <StudioCurvePanel
                histogramSource={histogramSource}
                points={draft.curve}
                channels={draft.curveCh}
                onChange={(curve: CurvePoint[]) => setDraft({ ...draft, curve })}
                onChannelsChange={(curveCh: CurveRgbChannels) => setDraft({ ...draft, curveCh })}
                onReset={resetDraft}
              />
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
            <button
              type="button"
              disabled={applying}
              onClick={resetDraft}
              className={buttonClass({
                size: "sm",
                variant: "quiet",
                className: "min-h-11 sm:min-h-8 pointer-coarse:min-h-11",
              })}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              기본값
            </button>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2 text-xs font-semibold text-fg-2 hover:bg-raised">
              <input
                type="checkbox"
                checked={previewEnabled}
                onChange={(event) => setPreviewEnabled(event.target.checked)}
                className="size-4 accent-accent"
              />
              캔버스 미리보기
            </label>
          </div>
        </div>

        <footer className="shrink-0 border-t border-line bg-card/35 px-4 py-3">
          {mutationLocked ? (
            <p
              id={lockMessageId}
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="mb-2 rounded-xl border border-warn/35 bg-warn/10 px-3 py-2 text-[0.7rem] font-semibold leading-relaxed text-warn"
            >
              {lockMessage}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={buttonClass({
                variant: "ghost",
                className: "min-h-11 sm:min-h-10 pointer-coarse:min-h-11",
              })}
            >
              취소
            </button>
            <button
              type="button"
              disabled={mutationLocked || applying}
              aria-busy={applying || undefined}
              aria-describedby={mutationLocked ? lockMessageId : undefined}
              onClick={() => {
                if (mutationLocked || applying) return;
                onApply(studioFilterDraftToPatch(draft), cloneStudioFilterDraft(draft));
              }}
              className={buttonClass({
                variant: "solid",
                className: "min-h-11 sm:min-h-10 pointer-coarse:min-h-11",
              })}
            >
              {applying ? "적용 중…" : "적용"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
