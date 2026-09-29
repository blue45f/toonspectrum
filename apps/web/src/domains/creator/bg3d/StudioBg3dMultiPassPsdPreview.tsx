import { Download, Eye, EyeOff, Layers, Loader2, TriangleAlert, X } from "lucide-react";
import React, { useEffect, useMemo, useRef } from "react";

import {
  BG3D_MULTIPASS_PSD_LAYER_LABELS,
  BG3D_MULTIPASS_PSD_LAYER_ORDER,
  compositeMultiPassPsdPreview,
  type Bg3dMultiPassPsdLayerId,
  type Bg3dMultiPassPsdLayerInput,
  type Bg3dMultiPassPsdSkip,
} from "./studio-bg3d-multipass-psd";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface MultiPassPsdExportProgress {
  readonly label: string;
  readonly completed: number;
  readonly total: number;
}

export interface MultiPassPsdNotice {
  readonly tone: "info" | "good" | "bad";
  readonly text: string;
  readonly detail?: string;
}

export interface StudioBg3dMultiPassPsdPreviewProps {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly Bg3dMultiPassPsdLayerInput[];
  readonly visibleLayerIds: ReadonlySet<Bg3dMultiPassPsdLayerId>;
  readonly skipped: readonly Bg3dMultiPassPsdSkip[];
  readonly includedCharacter: boolean;
  readonly progress: MultiPassPsdExportProgress | null;
  readonly exporting: boolean;
  readonly notice: MultiPassPsdNotice | null;
  readonly disabled?: boolean;
  readonly onToggleLayer: (id: Bg3dMultiPassPsdLayerId) => void;
  readonly onExport: () => void;
  readonly onClose: () => void;
}

const BLEND_LABELS: Readonly<Record<Bg3dMultiPassPsdLayerId, string>> = Object.freeze({
  line: "일반",
  shade: "곱하기",
  flat: "일반",
  background: "일반",
});

/**
 * 출력 전 미리보기 — 레이어별 토글, 진행 상태, 호환 안내를 한 섹션에 둔다.
 * 미리보기는 PSD에 기록되는 합성과 같은 `compositeMultiPassPsdPreview`로 그리므로
 * 화면과 파일이 달라지지 않는다. 캔버스를 만들 수 없으면 토글·진행·안내는 유지하고
 * 그림만 생략한다.
 */
export function StudioBg3dMultiPassPsdPreview({
  title,
  width,
  height,
  layers,
  visibleLayerIds,
  skipped,
  includedCharacter,
  progress,
  exporting,
  notice,
  disabled = false,
  onToggleLayer,
  onExport,
  onClose,
}: StudioBg3dMultiPassPsdPreviewProps): React.JSX.Element {
  const copy = useBilingual("scene3d-multipass-psd-preview");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasFailed, setCanvasFailed] = React.useState(false);

  const orderedLayers = useMemo(
    () =>
      BG3D_MULTIPASS_PSD_LAYER_ORDER.map((id) =>
        layers.find((layer) => layer.id === id),
      ).filter((layer): layer is Bg3dMultiPassPsdLayerInput => !!layer),
    [layers],
  );

  const preview = useMemo(
    () => compositeMultiPassPsdPreview(width, height, orderedLayers, visibleLayerIds),
    [width, height, orderedLayers, visibleLayerIds],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) {
      setCanvasFailed(true);
      return;
    }
    setCanvasFailed(false);
    const imageData = new ImageData(preview, width, height);
    context.putImageData(imageData, 0, 0);
  }, [preview, width, height]);

  const aspectRatio = height > 0 ? `${width} / ${height}` : "16 / 9";
  const interactionLocked = disabled || exporting;

  return (
    <section
      className="grid gap-2 rounded-xl border border-accent/40 bg-card p-2.5"
      aria-label={copy("PSD 출력 전 미리보기", "Layered PSD pre-export preview")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 font-bold text-fg">
          <Layers className="size-4 text-accent" aria-hidden />
          <span className="text-[0.68rem]">
            {copy("출력 전 미리보기", "Pre-export preview")}
          </span>
        </div>
        <button
          type="button"
          disabled={interactionLocked}
          onClick={onClose}
          aria-label={copy("미리보기 닫기", "Close preview")}
          className="grid size-8 place-items-center rounded-lg border border-line bg-panel text-fg-3 hover:bg-raised hover:text-fg disabled:opacity-45"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <p className="truncate text-[0.6rem] text-fg-3" title={title}>
        {title} · {width.toLocaleString("ko-KR")} × {height.toLocaleString("ko-KR")}px
        {includedCharacter ? ` · ${copy("캐릭터 합성 포함", "character composite included")}` : ""}
      </p>

      <div
        className="overflow-hidden rounded-lg border border-line bg-panel [background-image:linear-gradient(45deg,oklch(0.75_0.01_80/0.25)_25%,transparent_25%),linear-gradient(-45deg,oklch(0.75_0.01_80/0.25)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,oklch(0.75_0.01_80/0.25)_75%),linear-gradient(-45deg,transparent_75%,oklch(0.75_0.01_80/0.25)_75%)] [background-position:0_0,0_6px,6px_-6px,-6px_0] [background-size:12px_12px]"
      >
        {canvasFailed ? (
          <p className="px-3 py-6 text-center text-[0.6rem] text-fg-3" role="status">
            {copy(
              "이 브라우저에서는 미리보기 그림을 그릴 수 없습니다. 레이어 토글과 PSD 저장은 그대로 쓸 수 있습니다.",
              "This browser cannot draw the preview image. Layer toggles and PSD export still work.",
            )}
          </p>
        ) : (
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="block h-auto w-full"
            style={{ aspectRatio }}
            role="img"
            aria-label={copy(
              "선화·음영·밑색·배경 레이어 합성 미리보기",
              "Composite preview of the line, shading, flat and background layers",
            )}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-1" role="group" aria-label={copy("레이어 표시 토글", "Toggle layer visibility")}>
        {orderedLayers.map((layer) => {
          const visible = visibleLayerIds.has(layer.id);
          return (
            <button
              key={layer.id}
              type="button"
              disabled={interactionLocked}
              aria-pressed={visible}
              onClick={() => onToggleLayer(layer.id)}
              className={`flex min-h-10 items-center gap-2 rounded-lg border px-2 text-left transition-colors disabled:opacity-45 ${
                visible
                  ? "border-accent/60 bg-accent/5 text-fg"
                  : "border-line bg-panel text-fg-3 opacity-70 hover:opacity-100"
              }`}
            >
              {visible ? (
                <Eye className="size-3.5 shrink-0 text-accent" aria-hidden />
              ) : (
                <EyeOff className="size-3.5 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.62rem] font-bold">
                  {BG3D_MULTIPASS_PSD_LAYER_LABELS[layer.id]}
                </span>
                <span className="block text-[0.52rem] text-fg-3">
                  {BLEND_LABELS[layer.id]}
                  {visible
                    ? ""
                    : ` · ${copy("숨김으로 저장", "saved hidden")}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {skipped.length > 0 ? (
        <ul className="grid gap-1" aria-label={copy("건너뛴 패스", "Skipped passes")}>
          {skipped.map((entry) => (
            <li key={`${entry.pass}`} className="flex gap-1.5 text-[0.56rem] leading-relaxed text-fg-3">
              <TriangleAlert className="mt-0.5 size-3 shrink-0 text-warn" aria-hidden />
              <span>{entry.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="rounded-lg border border-line bg-panel px-2.5 py-2 text-[0.56rem] leading-relaxed text-fg-3">
        {copy(
          "Photoshop과 CLIP STUDIO PAINT에서 레이어 구조 그대로 열립니다. 음영 레이어는 곱하기(Multiply)로 기록되어 밑색을 다시 칠해도 그림자가 유지됩니다. 미리보기에서 끈 레이어는 숨김 상태로 저장됩니다.",
          "Opens with its layer structure intact in Photoshop and CLIP STUDIO PAINT. The shading layer is recorded as Multiply, so shadows survive flat-colour repaints. Layers switched off in the preview are saved hidden.",
        )}
      </p>

      {progress ? (
        <div className="rounded-lg border border-line bg-panel px-2.5 py-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-[0.6rem] text-fg-3">
            <span className="min-w-0 truncate">{progress.label}</span>
            <span className="shrink-0 tabular-nums">
              {progress.completed}/{progress.total}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
            <div
              className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none"
              style={{ width: `${Math.round((progress.completed / Math.max(1, progress.total)) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {notice ? (
        <p
          role="status"
          title={notice.detail}
          className={`rounded-lg border px-2.5 py-2 text-[0.58rem] leading-relaxed ${
            notice.tone === "bad"
              ? "border-bad/40 bg-bad/10 text-bad"
              : notice.tone === "good"
                ? "border-good/40 bg-good/10 text-good"
                : "border-line bg-panel text-fg-2"
          }`}
        >
          {notice.text}
          {notice.detail ? <span className="mt-0.5 block font-normal text-fg-3">{notice.detail}</span> : null}
        </p>
      ) : null}

      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={interactionLocked || orderedLayers.length === 0}
          onClick={onExport}
          className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-[0.66rem] font-bold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-45"
        >
          {exporting ? (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Download className="size-3.5" aria-hidden />
          )}
          {copy("PSD로 저장", "Save as PSD")}
        </button>
      </div>
    </section>
  );
}
