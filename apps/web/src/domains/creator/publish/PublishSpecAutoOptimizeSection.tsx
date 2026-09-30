/**
 * PublishSpecAutoOptimizeSection — 내보내기 다이얼로그에 꽂는 발행 규격 섹션.
 *
 * PublishSpecChecklistPanel(표시 전용)에 상태·체크리스트 계산·자동 최적화 실행을
 * 붙인 컨테이너. "자동 최적화"를 누르면 현재 선택 범위의 페이지를 캡처해
 * 리사이즈·슬라이싱·용량 맞춤(페이지별)과 썸네일 3종(첫 페이지 기준)을
 * 규격 파일명으로 바로 다운로드한다.
 *
 * 사용자 노출 문자열은 한글(내보내기 다이얼로그 기존 패턴과 동일).
 */

import { useMemo, useState } from "react";

import { downloadBlob, type ExportFormat } from "../export/studio-export";
import { autoOptimizeEpisodeImage } from "./auto-slicer";
import {
  PublishSpecChecklistPanel,
  type PublishSpecChecklistStatus,
} from "./PublishSpecChecklistPanel";
import {
  PUBLISH_SPEC_PRESETS,
  buildPublishSpecChecklist,
  mapExportPresetToPublishSpecId,
  type PublishSpecPresetId,
} from "./spec-validator";
import { generatePublishThumbnails } from "./thumbnail-generator";

export interface PublishSpecAutoOptimizeSectionProps {
  canvasWidth: number;
  canvasHeight: number;
  exportScale: number;
  exportFormat: ExportFormat;
  exportPresetId: string | null;
  exportTitle: string;
  pageCount: number;
  /** 다이얼로그 전역 busy — 다른 내보내기가 돌면 최적화를 막는다. */
  busy: boolean;
  canExport: boolean;
  pageIndices: readonly number[];
  capturePages: () => Promise<{
    pages: HTMLCanvasElement[];
    indices: number[];
    rangeLabel: string;
  }>;
  /** 테스트 주입용 — 기본은 document.createElement("canvas"). */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
  /** 테스트 주입용 — 기본은 canvasToBlob. */
  encode?: (
    canvas: HTMLCanvasElement,
    mime: string,
    quality: number | undefined
  ) => Promise<Blob>;
}

export function PublishSpecAutoOptimizeSection({
  canvasWidth,
  canvasHeight,
  exportScale,
  exportFormat,
  exportPresetId,
  exportTitle,
  pageCount,
  busy,
  canExport,
  pageIndices,
  capturePages,
  createCanvas,
  encode,
}: PublishSpecAutoOptimizeSectionProps) {
  const [presetId, setPresetId] = useState<PublishSpecPresetId>(
    () => mapExportPresetToPublishSpecId(exportPresetId) ?? "canvas"
  );
  const [optimizing, setOptimizing] = useState(false);
  const [status, setStatus] = useState<PublishSpecChecklistStatus | null>(null);

  const preset = PUBLISH_SPEC_PRESETS[presetId];
  const rows = useMemo(
    () =>
      buildPublishSpecChecklist(
        {
          plannedWidth: canvasWidth * exportScale,
          plannedHeight: canvasHeight * exportScale,
          pageCount,
          format: exportFormat,
        },
        preset
      ),
    [canvasWidth, canvasHeight, exportScale, pageCount, exportFormat, preset]
  );

  const canOptimize = canExport && !busy && !optimizing && pageIndices.length > 0;

  const runAutoOptimize = async () => {
    if (!canOptimize) return;
    setOptimizing(true);
    setStatus({ tone: "info", text: "페이지를 캡처하고 있어요…" });
    try {
      const captured = await capturePages();
      const firstPage = captured.pages[0];
      if (!firstPage) {
        throw new Error("캡처된 페이지가 없어요. 범위를 확인해주세요.");
      }
      const title = exportTitle.trim() || "toonstudio-episode";
      const multiPage = captured.pages.length > 1;

      let sliceTotal = 0;
      let sliceOversized = 0;
      for (let pageIndex = 0; pageIndex < captured.pages.length; pageIndex += 1) {
        const page = captured.pages[pageIndex];
        if (!page) continue;
        setStatus({
          tone: "info",
          text: `자동 최적화 ${pageIndex + 1}/${captured.pages.length}페이지…`,
        });
        // 여러 페이지면 파일명 충돌을 피하려고 페이지 접미사를 붙인다.
        const pageTitle = multiPage ? `${title}-p${pageIndex + 1}` : title;
        const result = await autoOptimizeEpisodeImage(page, preset, {
          title: pageTitle,
          createCanvas,
          encode,
        });
        for (const slice of result.slices) {
          downloadBlob(slice.blob, slice.filename);
        }
        sliceTotal += result.slices.length;
        sliceOversized += result.oversized;
      }
      if (sliceTotal === 0) {
        throw new Error("최적화할 슬라이스를 만들지 못했어요.");
      }

      const thumbnails = await generatePublishThumbnails(firstPage, preset, {
        title,
        createCanvas,
        encode,
      });
      for (const thumbnail of thumbnails) {
        downloadBlob(thumbnail.blob, thumbnail.filename);
      }
      const thumbOversized = thumbnails.filter(
        (thumbnail) => thumbnail.oversized
      ).length;

      const oversizedTotal = sliceOversized + thumbOversized;
      if (oversizedTotal > 0) {
        setStatus({
          tone: "warn",
          text: `슬라이스 ${sliceTotal}장·썸네일 ${thumbnails.length}종을 저장했어요. 용량 한도를 넘긴 파일 ${oversizedTotal}개는 업로드 전 직접 확인해주세요.`,
        });
      } else {
        setStatus({
          tone: "good",
          text: `슬라이스 ${sliceTotal}장·썸네일 ${thumbnails.length}종을 ${preset.label} 규격에 맞게 저장했어요.`,
        });
      }
    } catch (error) {
      setStatus({
        tone: "warn",
        text:
          error instanceof Error
            ? error.message
            : "자동 최적화에 실패했어요. 다시 시도해주세요.",
      });
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <PublishSpecChecklistPanel
      presetId={presetId}
      onPresetChange={setPresetId}
      rows={rows}
      busy={optimizing || busy}
      canOptimize={canOptimize}
      status={status}
      onAutoOptimize={() => void runAutoOptimize()}
    />
  );
}
