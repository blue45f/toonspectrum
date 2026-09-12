import {
  Download,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  buildStudioDownloadPackage,
  type StudioDownloadPackageProgress,
} from "./studio-download-package";
import {
  canvasToBlob,
  downloadBlob,
  exportFormatLabel,
  exportMimeType,
  exportQuality,
} from "./studio-export";
import { drawWatermarkOnSlice } from "./studio-export-presets";
import {
  StudioExportMenuPanel,
  type StudioExportMenuPackageContext,
  type StudioExportMenuPanelProps,
} from "./StudioExportMenuPanel";

type PackageRunTone = "info" | "good" | "warn";

interface PackageRunStatus {
  tone: PackageRunTone;
  text: string;
  percent?: number;
}

function clampQuality(value: number): number {
  if (!Number.isFinite(value)) return 0.92;
  return Math.min(1, Math.max(0.4, value));
}

function progressPercent(progress: StudioDownloadPackageProgress): number {
  if (progress.totalBytes > 0) {
    return Math.min(
      100,
      Math.max(0, Math.round((progress.processedBytes / progress.totalBytes) * 100)),
    );
  }
  if (progress.total > 0) {
    return Math.min(
      100,
      Math.max(0, Math.round((progress.completed / progress.total) * 100)),
    );
  }
  return 0;
}

function progressLabel(progress: StudioDownloadPackageProgress): string {
  if (progress.phase === "hashing") {
    return `무결성 계산 ${progress.completed}/${progress.total}`;
  }
  return `ZIP 조립 ${progress.completed}/${progress.total}`;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error &&
      (error.name === "AbortError" ||
        error.message.includes("취소")))
  );
}

export function StudioEnhancedExportMenuPanel(
  props: StudioExportMenuPanelProps,
) {
  const [qualityPercent, setQualityPercent] = useState(92);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageStatus, setPackageStatus] =
    useState<PackageRunStatus | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lossless = props.exportFormat === "png";
  const effectiveQuality = lossless ? undefined : clampQuality(qualityPercent / 100);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    },
    [],
  );

  const cancelPackage = () => {
    const controller = abortControllerRef.current;
    if (!controller || controller.signal.aborted) return;
    controller.abort();
    setPackageStatus({
      tone: "info",
      text: "현재 단계를 마친 뒤 패키지 생성을 중단하고 있어요.",
    });
  };

  const downloadVerifiedPackage = async (context: StudioExportMenuPackageContext) => {
    if (packageBusy || context.busy || !context.canExport) return;
    const controller = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;
    setPackageBusy(true);
    setPackageStatus({
      tone: "info",
      text: `페이지 캡처 준비 0/${context.pageIndices.length} · ${context.rangeLabel}`,
      percent: 0,
    });

    try {
      const captured = await context.capturePages();
      const canvases = captured.pages;
      if (controller.signal.aborted) {
        throw new DOMException("다운로드 패키지 생성을 취소했어요.", "AbortError");
      }

      const encodedPages: Array<{
        index: number;
        label: string;
        width: number;
        height: number;
        image: Blob;
      }> = [];
      for (let index = 0; index < canvases.length; index += 1) {
        if (controller.signal.aborted) {
          throw new DOMException(
            "다운로드 패키지 생성을 취소했어요.",
            "AbortError",
          );
        }
        const canvas = canvases[index]!;
        const sourceIndex = captured.indices[index]!;
        drawWatermarkOnSlice(canvas, props.watermark);
        const image = await canvasToBlob(
          canvas,
          exportMimeType(props.exportFormat),
          effectiveQuality ?? exportQuality(props.exportFormat),
        );
        encodedPages.push({
          index: sourceIndex,
          label: props.pageLabels[sourceIndex] || `${sourceIndex + 1}페이지`,
          width: canvas.width,
          height: canvas.height,
          image,
        });
        setPackageStatus({
          tone: "info",
          text: `페이지 인코딩 ${index + 1}/${canvases.length}`,
          percent: Math.round(((index + 1) / canvases.length) * 100),
        });
      }

      const result = await buildStudioDownloadPackage(
        {
          title: props.exportTitle,
          format: props.exportFormat,
          scale: props.exportScale,
          transparentRequested:
            props.exportTransparent && props.exportFormat !== "jpg",
          pages: encodedPages,
        },
        {
          signal: controller.signal,
          onProgress: (progress) => {
            setPackageStatus({
              tone: "info",
              text: progressLabel(progress),
              percent: progressPercent(progress),
            });
          },
        },
      );
      if (controller.signal.aborted) {
        throw new DOMException("다운로드 패키지 생성을 취소했어요.", "AbortError");
      }
      downloadBlob(result.blob, result.fileName);
      setPackageStatus({
        tone: "good",
        text: `${result.manifest.pageCount}페이지와 SHA-256 매니페스트를 ZIP으로 저장했어요. (${captured.rangeLabel})`,
        percent: 100,
      });
    } catch (error) {
      if (isAbortError(error)) {
        setPackageStatus({
          tone: "warn",
          text: "다운로드 패키지 생성을 취소했어요. 다시 시도할 수 있습니다.",
        });
      } else {
        setPackageStatus({
          tone: "warn",
          text:
            error instanceof Error
              ? error.message
              : "검증 다운로드 패키지를 만들지 못했어요.",
        });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setPackageBusy(false);
    }
  };

  const statusClass =
    packageStatus?.tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : packageStatus?.tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
        : "border-accent/25 bg-accent/10 text-fg-2";

  return (
    <StudioExportMenuPanel
      {...props}
      isExporting={props.isExporting || packageBusy}
      renderAdditionalExports={(context) => (
      <section
        data-studio-verified-download-package="true"
        aria-labelledby="studio-verified-download-package-title"
        className="mt-3 rounded-xl border border-accent/25 bg-accent/5 p-2.5"
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
            <PackageCheck size={16} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span
              id="studio-verified-download-package-title"
              className="block text-[0.72rem] font-bold text-fg"
            >
              검증 다운로드 패키지
            </span>
            <span className="mt-0.5 block text-[0.61rem] leading-relaxed text-fg-3">
              페이지별 이미지와 순서·크기·SHA-256을 기록한 manifest.json을
              하나의 ZIP으로 저장합니다.
            </span>
          </span>
          <ShieldCheck
            size={16}
            className="mt-0.5 shrink-0 text-accent"
            aria-hidden
          />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[0.61rem]">
          <span className="rounded-lg border border-line/70 bg-panel/70 px-2 py-1.5 text-fg-3">
            {context.rangeLabel} · {context.pageIndices.length.toLocaleString("ko-KR")}P
          </span>
          <span className="rounded-lg border border-line/70 bg-panel/70 px-2 py-1.5 text-fg-3">
            {exportFormatLabel(props.exportFormat)} · {props.exportScale}×
          </span>
        </div>

        <label className="mt-2 block rounded-lg border border-line/70 bg-panel/70 px-2 py-1.5">
          <span className="flex items-center justify-between gap-2 text-[0.61rem] font-semibold text-fg-2">
            <span>손실 압축 품질</span>
            <span className="tabular-nums text-fg-3">
              {lossless ? "무손실" : `${qualityPercent}%`}
            </span>
          </span>
          <input
            type="range"
            min={40}
            max={100}
            step={1}
            value={qualityPercent}
            disabled={lossless || packageBusy}
            onChange={(event) =>
              setQualityPercent(Number(event.currentTarget.value))
            }
            aria-label="검증 패키지 이미지 품질"
            className="mt-1 h-5 w-full accent-accent disabled:opacity-40"
          />
        </label>

        {packageStatus ? (
          <div
            className={`mt-2 rounded-lg border px-2 py-1.5 text-[0.61rem] leading-relaxed ${statusClass}`}
            role={packageStatus.tone === "warn" ? "alert" : "status"}
          >
            <div className="flex items-center justify-between gap-2">
              <span>{packageStatus.text}</span>
              {typeof packageStatus.percent === "number" ? (
                <span className="shrink-0 tabular-nums">
                  {packageStatus.percent}%
                </span>
              ) : null}
            </div>
            {typeof packageStatus.percent === "number" ? (
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/20"
                role="progressbar"
                aria-label="검증 다운로드 패키지 진행률"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={packageStatus.percent}
              >
                <div
                  className="h-full rounded-full bg-current transition-[width] motion-reduce:transition-none"
                  style={{ width: `${packageStatus.percent}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => void downloadVerifiedPackage(context)}
            disabled={
              packageBusy ||
              context.busy ||
              !context.canExport
            }
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent/15 px-2 text-[0.68rem] font-bold text-accent transition-colors hover:bg-accent/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            {packageStatus?.tone === "warn" && !packageBusy ? (
              <RotateCcw size={14} aria-hidden />
            ) : (
              <Download size={14} aria-hidden />
            )}
            {packageBusy
              ? "패키지 생성 중"
              : packageStatus?.tone === "warn"
                ? "다시 시도"
                : "페이지 ZIP 다운로드"}
          </button>
          {packageBusy ? (
            <button
              type="button"
              onClick={cancelPackage}
              className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-line bg-panel text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="검증 다운로드 패키지 생성 취소"
              title="패키지 생성 취소"
            >
              <X size={15} aria-hidden />
            </button>
          ) : null}
        </div>
        <p className="mt-1.5 text-[0.57rem] leading-relaxed text-fg-4">
          기존 PDF·CBZ·웹툰 연합 스크롤은 그대로 유지됩니다. 이 패키지는
          전달·업로드·장기 보관 전 파일 무결성을 확인해야 할 때 사용하세요.
        </p>
      </section>
      )}
    />
  );
}
