/**
 * LT 변환 다이얼로그.
 *
 * 3D 뷰 렌더 캡처 또는 이미지 파일의 픽셀을 입력받아 선화 레이어와 톤 레이어
 * 미리보기를 보여주고, 슬라이더(톤 농도/선 굵기/선 임계값)로 조절한 뒤
 * 적용하면 두 레이어의 `ImageData`를 `onApply`로 전달한다.
 * 레이어 문서에 실제로 커밋하는 것은 호출 측(레이어 API 경계)의 몫이다.
 * (`studio-lt-convert-layer.ts`의 TODO 참고)
 */
import { ImagePlus, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { useStudioModalSheet } from "../useStudioModalSheet";

import {
  convertStudioLtImage,
  STUDIO_LT_CONVERT_DEFAULT_OPTIONS,
  STUDIO_LT_CONVERT_LINE_THICKNESS_RANGE,
  STUDIO_LT_CONVERT_LINE_THRESHOLD_RANGE,
  STUDIO_LT_CONVERT_TONE_DENSITY_RANGE,
  type StudioLtConvertOptions,
  type StudioLtConvertResult,
} from "./studio-lt-convert";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export type StudioLtConvertSourceStatus =
  | "idle"
  | "capturing"
  | "ready"
  | "error";

/** 다이얼로그에 전달되는 변환 소스. 캡처는 호출 측(HUD)이 수행한다. */
export interface StudioLtConvertDialogSource {
  readonly status: StudioLtConvertSourceStatus;
  readonly imageData: ImageData | null;
  readonly error: string | null;
  readonly label: string;
}

export interface StudioLtConvertDialogProps {
  readonly open: boolean;
  readonly source: StudioLtConvertDialogSource;
  /** 레이어 반영 실패 등 적용 단계의 오류 메시지. */
  readonly applyError: string | null;
  /** 이미지 파일로 소스를 교체한다. */
  readonly onImportImage: (file: File) => void;
  readonly onApply: (result: StudioLtConvertResult) => void;
  readonly onCancel: () => void;
}

type PreviewTab = "original" | "line" | "tone";

const PREVIEW_TABS: readonly PreviewTab[] = ["original", "line", "tone"];

function SliderRow({
  id,
  label,
  display,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly display: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}): ReactElement {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-fg-2">
          {label}
        </label>
        <output htmlFor={id} className="text-xs tabular-nums text-fg-3">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className={cn("mt-1 w-full accent-accent", STUDIO_FOCUS_RING)}
      />
    </div>
  );
}

export function StudioLtConvertDialog({
  open,
  source,
  applyError,
  onImportImage,
  onApply,
  onCancel,
}: StudioLtConvertDialogProps): ReactElement | null {
  const t = useT();
  const id = useId().replace(/:/gu, "");
  const dialogRef = useRef<HTMLElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const portalRootRef = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : document.body,
  );

  const [toneDensity, setToneDensity] = useState<number>(
    STUDIO_LT_CONVERT_DEFAULT_OPTIONS.toneDensity,
  );
  const [lineThickness, setLineThickness] = useState<number>(
    STUDIO_LT_CONVERT_DEFAULT_OPTIONS.lineThickness,
  );
  const [lineThresholdPercent, setLineThresholdPercent] = useState<number>(
    Math.round(STUDIO_LT_CONVERT_DEFAULT_OPTIONS.lineThreshold * 100),
  );
  const [screentone, setScreentone] = useState<boolean>(
    STUDIO_LT_CONVERT_DEFAULT_OPTIONS.screentone,
  );
  const [tab, setTab] = useState<PreviewTab>("line");

  const options: StudioLtConvertOptions = useMemo(
    () => ({
      toneDensity,
      lineThickness,
      lineThreshold: lineThresholdPercent / 100,
      screentone,
    }),
    [toneDensity, lineThickness, lineThresholdPercent, screentone],
  );

  const outcome = useMemo(() => {
    if (!source.imageData) return { result: null, error: null as string | null };
    try {
      return {
        result: convertStudioLtImage(source.imageData, options),
        error: null as string | null,
      };
    } catch (error) {
      return {
        result: null,
        error:
          error instanceof Error
            ? error.message
            : t("studio.ltConvert.convertFailed", "변환에 실패했습니다."),
      };
    }
  }, [source.imageData, options, t]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const drawable =
      tab === "line"
        ? outcome.result?.lineLayer
        : tab === "tone"
          ? outcome.result?.toneLayer
          : source.imageData;
    if (!drawable) {
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    canvas.width = drawable.width;
    canvas.height = drawable.height;
    canvas.getContext("2d")?.putImageData(drawable, 0, 0);
  }, [tab, outcome, source.imageData]);

  useStudioModalSheet({
    activeKey: open ? "studio-lt-convert" : null,
    dialogRef,
    onDismiss: onCancel,
    resolveInitialFocus: (dialog) =>
      dialog.querySelector<HTMLElement>("[data-autofocus='true']"),
    rootRef: portalRootRef,
  });

  if (!open || typeof document === "undefined") return null;

  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const slidersDisabled = source.status !== "ready" || outcome.result === null;
  const tabLabel: Record<PreviewTab, string> = {
    original: t("studio.ltConvert.tabOriginal", "원본"),
    line: t("studio.ltConvert.tabLine", "선화"),
    tone: t("studio.ltConvert.tabTone", "톤"),
  };

  const content = (
    <div className="fixed inset-0 z-[140] flex items-stretch justify-center pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:items-center sm:p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        data-studio-modal-backdrop="true"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-[oklch(0.08_0.01_70/0.86)] backdrop-blur-sm"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-studio-lt-convert-dialog="true"
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
        className="relative flex h-[100dvh] min-h-0 w-full min-w-0 flex-col overflow-hidden border-line-strong bg-panel pb-[env(safe-area-inset-bottom)] text-fg shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-3xl sm:rounded-2xl sm:border sm:pb-0"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line/70 px-4 py-3">
          <div>
            <h2 id={titleId} className="text-sm font-bold">
              {t("studio.ltConvert.title", "LT 변환")}
            </h2>
            <p id={descriptionId} className="mt-0.5 text-xs text-fg-3">
              {t(
                "studio.ltConvert.description",
                "3D 뷰 또는 이미지를 선화 레이어와 톤 레이어로 분리합니다.",
              )}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("studio.ltConvert.close", "닫기")}
            onClick={onCancel}
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl border border-line/70 bg-panel text-fg-2 transition-colors duration-150 hover:bg-accent-soft hover:text-accent motion-reduce:transition-none",
              STUDIO_FOCUS_RING,
            )}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-4 py-4 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0">
            <div
              role="group"
              aria-label={t("studio.ltConvert.preview", "미리보기")}
              className="mb-2 flex flex-wrap items-center gap-1.5"
            >
              {PREVIEW_TABS.map((previewTab) => (
                <button
                  key={previewTab}
                  type="button"
                  aria-pressed={tab === previewTab}
                  onClick={() => setTab(previewTab)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none",
                    STUDIO_FOCUS_RING,
                    tab === previewTab
                      ? "border-accent/60 bg-accent text-on-accent"
                      : "border-line/70 bg-panel text-fg-2 hover:bg-accent-soft hover:text-accent",
                  )}
                >
                  {tabLabel[previewTab]}
                </button>
              ))}
              <span className="ml-auto text-xs text-fg-3">
                {source.status === "ready" && source.imageData
                  ? `${source.label} · ${source.imageData.width}×${source.imageData.height}`
                  : source.label}
              </span>
            </div>

            <div className="grid min-h-48 place-items-center overflow-hidden rounded-xl border border-line/70 bg-[oklch(0.96_0.005_90)] p-2 dark:bg-[oklch(0.22_0.01_70)]">
              {source.status === "capturing" ? (
                <p className="text-xs text-fg-3">
                  {t("studio.ltConvert.capturing", "소스를 불러오는 중…")}
                </p>
              ) : source.status === "error" ? (
                <div className="px-2 py-6 text-center">
                  <p role="alert" className="text-xs text-fg-2">
                    {source.error ??
                      t("studio.ltConvert.sourceFailed", "소스를 불러오지 못했습니다.")}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "mt-3 inline-flex items-center gap-1.5 rounded-xl border border-line/70 bg-panel px-3 py-2 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:bg-accent-soft hover:text-accent motion-reduce:transition-none",
                      STUDIO_FOCUS_RING,
                    )}
                  >
                    <ImagePlus size={14} aria-hidden />
                    {t("studio.ltConvert.importImage", "이미지 파일 불러오기")}
                  </button>
                </div>
              ) : (
                <canvas
                  ref={previewCanvasRef}
                  className="max-h-[46dvh] max-w-full rounded-md object-contain [image-rendering:auto]"
                  aria-label={t("studio.ltConvert.previewCanvas", "LT 변환 미리보기")}
                  role="img"
                />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={t("studio.ltConvert.importImage", "이미지 파일 불러오기")}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) onImportImage(file);
              }}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <SliderRow
              id={`${id}-tone-density`}
              label={t("studio.ltConvert.toneDensity", "톤 농도")}
              display={t("studio.ltConvert.toneDensityValue", "{v0}단계").replace(
                "{v0}",
                String(toneDensity),
              )}
              min={STUDIO_LT_CONVERT_TONE_DENSITY_RANGE.min}
              max={STUDIO_LT_CONVERT_TONE_DENSITY_RANGE.max}
              step={1}
              value={toneDensity}
              disabled={slidersDisabled}
              onChange={setToneDensity}
            />
            <SliderRow
              id={`${id}-line-thickness`}
              label={t("studio.ltConvert.lineThickness", "선 굵기")}
              display={t("studio.ltConvert.lineThicknessValue", "{v0}px").replace(
                "{v0}",
                String(lineThickness),
              )}
              min={STUDIO_LT_CONVERT_LINE_THICKNESS_RANGE.min}
              max={STUDIO_LT_CONVERT_LINE_THICKNESS_RANGE.max}
              step={1}
              value={lineThickness}
              disabled={slidersDisabled}
              onChange={setLineThickness}
            />
            <SliderRow
              id={`${id}-line-threshold`}
              label={t("studio.ltConvert.lineThreshold", "선 임계값")}
              display={`${lineThresholdPercent}%`}
              min={STUDIO_LT_CONVERT_LINE_THRESHOLD_RANGE.min * 100}
              max={STUDIO_LT_CONVERT_LINE_THRESHOLD_RANGE.max * 100}
              step={1}
              value={lineThresholdPercent}
              disabled={slidersDisabled}
              onChange={setLineThresholdPercent}
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-fg-2">
              <input
                type="checkbox"
                checked={screentone}
                disabled={slidersDisabled}
                onChange={(event) => setScreentone(event.currentTarget.checked)}
                className={cn("size-4 accent-accent", STUDIO_FOCUS_RING)}
              />
              {t("studio.ltConvert.screentone", "도트 스크린톤")}
            </label>
            {outcome.error ? (
              <p role="alert" className="text-xs text-fg-2">
                {outcome.error}
              </p>
            ) : null}
          </div>
        </div>

        <footer className="border-t border-line/70 px-4 py-3">
          {applyError ? (
            <p role="alert" className="mb-2 text-xs text-fg-2">
              {applyError}
            </p>
          ) : null}
          <p className="mb-3 text-[0.7rem] leading-relaxed text-fg-3">
            {t(
              "studio.ltConvert.applyNote",
              "적용하면 선화와 톤, 2개의 레이어가 생성됩니다.",
            )}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                "rounded-xl border border-line/70 bg-panel px-4 py-2 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:bg-accent-soft hover:text-accent motion-reduce:transition-none",
                STUDIO_FOCUS_RING,
              )}
            >
              {t("studio.ltConvert.cancel", "취소")}
            </button>
            <button
              type="button"
              data-autofocus="true"
              disabled={outcome.result === null}
              onClick={() => {
                if (outcome.result) onApply(outcome.result);
              }}
              className={cn(
                "rounded-xl bg-accent px-4 py-2 text-xs font-bold text-on-accent transition-colors duration-150 hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
                STUDIO_FOCUS_RING,
              )}
            >
              {t("studio.ltConvert.apply", "적용")}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );

  return createPortal(content, document.body);
}
