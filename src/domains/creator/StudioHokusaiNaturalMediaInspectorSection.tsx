import {
  Brush,
  ChevronDown,
  Feather,
  Highlighter,
  LoaderCircle,
  Paintbrush,
  Pencil,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  STUDIO_HOKUSAI_NATURAL_MEDIA_PRESETS,
  type StudioHokusaiNaturalMediaPresetId,
} from "./studio-hokusai-natural-media-contract";
import {
  STUDIO_FOCUS_RING,
  StudioSliderRow,
} from "./studio-panel-ui";

import type { DrawEl, El } from "./studio-element-model";
import type { StudioHokusaiNaturalMediaProductResult } from "./studio-hokusai-natural-media-product";
import type { LucideIcon } from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

export interface StudioHokusaiNaturalMediaInspectorSectionProps {
  readonly selected: El | null;
  readonly currentColor: string;
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly pageId: string;
  readonly masterEditMode: boolean;
  readonly disabled: boolean;
  readonly disabledReason: string | null;
  /** Moves the editor into object-selection mode so the artist can pick a finished stroke. */
  readonly onRequestSelectStroke?: () => void;
  readonly onReplace: (
    result: StudioHokusaiNaturalMediaProductResult,
    targetPageId: string,
    targetMasterEditMode: boolean,
  ) => boolean;
}

const PRESET_ICONS: Readonly<Record<
  StudioHokusaiNaturalMediaPresetId,
  LucideIcon
>> = Object.freeze({
  pencil: Pencil,
  charcoal: Feather,
  oil: Paintbrush,
  calligraphy: Brush,
  marker: Highlighter,
});
const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

function selectedFreehand(value: El | null): DrawEl | null {
  return value?.type === "draw"
    && (value.kind ?? "freehand") === "freehand"
    && value.mode !== "eraser"
    && value.points.length >= 4
    ? value
    : null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message.trim().slice(0, 320)
    : fallback;
}

function sourceColor(
  selected: DrawEl | null,
  currentColor: string,
): string {
  if (selected && COLOR_PATTERN.test(selected.stroke)) {
    return selected.stroke.toLowerCase();
  }
  return COLOR_PATTERN.test(currentColor)
    ? currentColor.toLowerCase()
    : "#202124";
}

function sourceOpacity(selected: DrawEl | null): number {
  const opacity = selected?.opacity;
  return typeof opacity === "number"
    && Number.isFinite(opacity)
    && opacity > 0
    && opacity <= 1
    ? opacity
    : 1;
}

export function StudioHokusaiNaturalMediaInspectorSection({
  selected,
  currentColor,
  documentWidth,
  documentHeight,
  pageId,
  masterEditMode,
  disabled,
  disabledReason,
  onRequestSelectStroke,
  onReplace,
}: StudioHokusaiNaturalMediaInspectorSectionProps): ReactElement {
  const selectedDraw = selectedFreehand(selected);
  const selectedDefaultColor = sourceColor(selectedDraw, currentColor);
  const selectedDefaultOpacity = sourceOpacity(selectedDraw);
  const [open, setOpen] = useState(false);
  const [presetId, setPresetId] =
    useState<StudioHokusaiNaturalMediaPresetId>("pencil");
  const [color, setColor] = useState(selectedDefaultColor);
  const [sizeScale, setSizeScale] = useState(1);
  const [opacity, setOpacity] = useState(selectedDefaultOpacity);
  const [seed, setSeed] = useState(0x48_4f_4b_55);
  const [capability, setCapability] =
    useState<"idle" | "checking" | "ready" | "unavailable">("idle");
  const [capabilityMessage, setCapabilityMessage] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const probeRef = useRef<AbortController | null>(null);
  const generationRef = useRef<AbortController | null>(null);
  const onReplaceRef = useRef(onReplace);
  const selectedId = selectedDraw?.id ?? null;
  const initializedSelectionIdRef = useRef<string | null>(selectedId);

  useEffect(() => {
    onReplaceRef.current = onReplace;
  }, [onReplace]);

  useEffect(() => {
    if (initializedSelectionIdRef.current === selectedId) return;
    initializedSelectionIdRef.current = selectedId;
    setColor(selectedDefaultColor);
    setOpacity(selectedDefaultOpacity);
  }, [selectedDefaultColor, selectedDefaultOpacity, selectedId]);

  useEffect(() => {
    generationRef.current?.abort();
    generationRef.current = null;
    setBusy(false);
    setError(null);
    setMessage(null);
  }, [selectedId]);

  useEffect(() => () => {
    probeRef.current?.abort();
    generationRef.current?.abort();
  }, []);

  const probe = (): void => {
    probeRef.current?.abort();
    const controller = new AbortController();
    probeRef.current = controller;
    setCapability("checking");
    setCapabilityMessage(null);
    setError(null);
    void import("./studio-hokusai-natural-media-product")
      .then(({ probeStudioHokusaiNaturalMediaProduct }) =>
        probeStudioHokusaiNaturalMediaProduct(controller.signal))
      .then((result) => {
        if (controller.signal.aborted) return;
        setCapability(result.available ? "ready" : "unavailable");
        setCapabilityMessage(result.message);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const detail = errorMessage(
          cause,
          "Hokusai 자연매체 엔진을 확인하지 못했습니다.",
        );
        setCapability("unavailable");
        setCapabilityMessage(detail);
      })
      .finally(() => {
        if (probeRef.current === controller) probeRef.current = null;
      });
  };

  const generate = (): void => {
    if (
      busy
      || disabled
      || capability !== "ready"
      || !selectedDraw
      || !COLOR_PATTERN.test(color)
    ) return;
    const controller = new AbortController();
    const sourceSnapshot = selectedDraw;
    const targetPageId = pageId;
    const targetMasterEditMode = masterEditMode;
    generationRef.current = controller;
    setBusy(true);
    setError(null);
    setMessage(null);
    void import("./studio-hokusai-natural-media-product")
      .then(({ generateStudioHokusaiNaturalMediaProduct }) =>
        generateStudioHokusaiNaturalMediaProduct(
          sourceSnapshot,
          {
            presetId,
            color: color.toLowerCase() as `#${string}`,
            sizeScale,
            opacity,
            seed,
          },
          {
            documentWidth,
            documentHeight,
            signal: controller.signal,
          },
        ))
      .then((result) => {
        if (controller.signal.aborted) return;
        // The document authority may change while the Worker is rendering.
        // Always ask the latest StudioPage transaction closure to validate the
        // source revision, page, locks and undo frontier before committing.
        if (!onReplaceRef.current(
          result,
          targetPageId,
          targetMasterEditMode,
        )) {
          throw new Error(
            "선택 획이 변경되어 자연매체 결과를 적용하지 않았습니다.",
          );
        }
        setMessage(result.message);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause, "자연매체 획 변환에 실패했습니다."));
      })
      .finally(() => {
        if (generationRef.current === controller) {
          generationRef.current = null;
          setBusy(false);
        }
      });
  };

  const controlsDisabled =
    disabled || busy || capability !== "ready";
  const actionDisabled = controlsDisabled || selectedDraw === null;
  const statusLabel =
    busy
      ? "변환 중"
      : capability === "checking"
        ? "확인 중"
        : capability === "ready"
          ? "사용 가능"
          : capability === "unavailable"
            ? "사용 불가"
            : "확인 전";

  return (
    <details
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        if (next && capability === "idle") probe();
        if (!next) {
          probeRef.current?.abort();
          probeRef.current = null;
        }
      }}
      data-studio-hokusai-natural-media="true"
      className="rounded-lg border border-line/65 bg-panel/30"
    >
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 text-left",
          "transition-colors hover:bg-raised/70",
          STUDIO_FOCUS_RING,
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent-soft/40 text-accent"
        >
          <Paintbrush size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-fg">
            Hokusai 자연매체
          </span>
          <span className="block truncate text-[0.6rem] text-fg-3">
            선택 선화 → 연필 · 목탄 · 오일 · 붓 · 마커
          </span>
        </span>
        <span
          role="status"
          className={cn(
            "shrink-0 rounded-full border px-1.5 py-0.5 text-[0.56rem] font-semibold",
            capability === "ready" && !busy
              ? "border-good/30 bg-good/10 text-good"
              : capability === "unavailable"
                ? "border-warn/35 bg-warn/10 text-warn"
                : "border-line bg-card text-fg-3",
          )}
        >
          {busy || capability === "checking" ? (
            <LoaderCircle
              size={10}
              aria-hidden
              className="mr-1 inline animate-spin motion-reduce:animate-none"
            />
          ) : null}
          {statusLabel}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className={cn(
            "shrink-0 text-fg-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </summary>

      {open ? (
        <div className="space-y-3 border-t border-line/55 p-2.5">
          <div className="rounded-lg border border-line/60 bg-card/55 px-2.5 py-2">
            <p className="text-[0.66rem] font-semibold text-fg-2">
              {selectedDraw
                ? `선택 획 · ${selectedDraw.name ?? selectedDraw.brush ?? "펜"} · ${Math.floor(selectedDraw.points.length / 2).toLocaleString()}점`
                : "캔버스에서 완성된 자유곡선 선화를 먼저 선택해 주세요."}
            </p>
            <p className="mt-0.5 text-[0.6rem] leading-relaxed text-fg-3">
              변환 성공 시 원본 벡터는 숨김 보존하고 같은 위치에 투명 래스터를 만듭니다. 실행 취소로 즉시 되돌릴 수 있습니다.
            </p>
            {!selectedDraw && onRequestSelectStroke ? (
              <button
                type="button"
                disabled={disabled || busy}
                onClick={onRequestSelectStroke}
                className={cn(
                  "mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-accent/35 bg-accent-soft/45 px-3 text-xs font-bold text-accent hover:bg-accent-soft/70",
                  STUDIO_FOCUS_RING,
                  "disabled:cursor-not-allowed disabled:opacity-45",
                )}
              >
                <Sparkles size={14} aria-hidden />
                선화 선택하기
              </button>
            ) : null}
          </div>

          <fieldset
            disabled={controlsDisabled}
            className="min-w-0"
          >
            <legend className="mb-1.5 text-[0.68rem] font-semibold text-fg-2">
              자연매체 프로필
            </legend>
            <div className="grid grid-cols-2 gap-1.5">
              {STUDIO_HOKUSAI_NATURAL_MEDIA_PRESETS.map((preset) => {
                const Icon = PRESET_ICONS[preset.id];
                return (
                  <label
                    key={preset.id}
                    title={preset.description}
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors",
                      "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                      presetId === preset.id
                        ? "border-accent/60 bg-accent-soft/50 text-fg"
                        : "border-line bg-card text-fg-2 hover:bg-raised",
                      controlsDisabled && "cursor-not-allowed opacity-45",
                    )}
                  >
                    <input
                      type="radio"
                      name="studio-hokusai-preset"
                      value={preset.id}
                      checked={presetId === preset.id}
                      className="sr-only"
                      onChange={() => setPresetId(preset.id)}
                    />
                    <Icon size={14} aria-hidden className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[0.68rem] font-semibold">
                        {preset.label}
                      </span>
                      <span className="block truncate text-[0.56rem] text-fg-3">
                        {preset.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
            <label className="min-w-0 text-[0.68rem] font-semibold text-fg-2">
              안료 색상
              <span className="mt-1 flex gap-1.5">
                <input
                  type="color"
                  aria-label="Hokusai 안료 색상"
                  value={COLOR_PATTERN.test(color) ? color : "#202124"}
                  disabled={controlsDisabled}
                  onChange={(event) => setColor(event.currentTarget.value)}
                  className="size-11 shrink-0 cursor-pointer rounded-lg border border-line bg-card p-1 disabled:cursor-not-allowed"
                />
                <input
                  type="text"
                  aria-label="Hokusai 안료 색상 코드"
                  value={color}
                  maxLength={7}
                  disabled={controlsDisabled}
                  onChange={(event) => setColor(event.currentTarget.value)}
                  className={cn(
                    "min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-2 font-mono text-xs uppercase text-fg",
                    STUDIO_FOCUS_RING,
                  )}
                />
              </span>
            </label>
            <div className="text-[0.68rem] font-semibold text-fg-2">
              <span>시드</span>
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={() => setSeed((value) =>
                  (Math.imul(value ^ 0x9e37_79b9, 1_664_525)
                    + 1_013_904_223) >>> 0)}
                className={cn(
                  "mt-1 flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-line bg-card text-xs text-fg-2 hover:bg-raised",
                  STUDIO_FOCUS_RING,
                )}
              >
                <RefreshCw size={13} aria-hidden />
                변경
              </button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-line/60 bg-card/45 p-2.5">
            <StudioSliderRow
              label="붓 크기"
              min={0.25}
              max={3}
              step={0.05}
              value={sizeScale}
              disabled={controlsDisabled}
              onChange={setSizeScale}
              readout={`${sizeScale.toFixed(2)}×`}
            />
            <StudioSliderRow
              label="안료 불투명도"
              min={0.1}
              max={1}
              step={0.01}
              value={opacity}
              disabled={controlsDisabled}
              onChange={setOpacity}
              readout={`${Math.round(opacity * 100)}%`}
            />
          </div>

          <p
            role="status"
            aria-live="polite"
            className={cn(
              "rounded-lg border px-2.5 py-2 text-[0.64rem] leading-relaxed",
              error
                ? "border-danger/35 bg-danger/10 text-danger"
                : "border-line/65 bg-card/50 text-fg-3",
            )}
          >
            {error
              ?? message
              ?? disabledReason
              ?? capabilityMessage
              ?? "Hokusai WASM 기능을 확인한 뒤 선택 획을 변환할 수 있습니다."}
          </p>

          <div className="flex gap-2">
            {busy ? (
              <button
                type="button"
                onClick={() => generationRef.current?.abort()}
                className={cn(
                  "min-h-11 flex-1 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised",
                  STUDIO_FOCUS_RING,
                )}
              >
                취소
              </button>
            ) : null}
            <button
              type="button"
              disabled={actionDisabled}
              onClick={generate}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-white shadow-sm",
                STUDIO_FOCUS_RING,
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {busy ? (
                <LoaderCircle
                  size={14}
                  aria-hidden
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Sparkles size={14} aria-hidden />
              )}
              {busy ? "자연매체 변환 중" : "선택 획을 자연매체로 변환"}
            </button>
          </div>
        </div>
      ) : null}
    </details>
  );
}
