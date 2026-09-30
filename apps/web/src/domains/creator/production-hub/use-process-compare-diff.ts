import { useEffect, useState, type RefObject } from "react";

import {
  computeProcessCompareDiffRegions,
  type ProcessCompareDiffRegion,
  type ProcessCompareMode,
} from "./process-compare-model";

/** 픽셀 비교용 다운스케일 너비(px). */
const DIFF_PREVIEW_WIDTH = 80;

/**
 * 두 이미지를 같은 크기의 작은 캔버스에 그려 픽셀 단위로 비교하고,
 * 차이가 큰 영역을 원본 좌표(%) 박스로 반환한다.
 * CORS 등으로 캔버스가 오염되면 null을 반환한다.
 */
function readComparePixels(
  imgA: HTMLImageElement,
  imgB: HTMLImageElement,
): { dataA: Uint8ClampedArray; dataB: Uint8ClampedArray; width: number; height: number } | null {
  if (imgA.naturalWidth === 0 || imgB.naturalWidth === 0) return null;
  const width = DIFF_PREVIEW_WIDTH;
  const height = Math.max(1, Math.round((width * imgA.naturalHeight) / imgA.naturalWidth));

  const read = (img: HTMLImageElement): Uint8ClampedArray | null => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  };

  const dataA = read(imgA);
  const dataB = read(imgB);
  if (!dataA || !dataB) return null;
  return { dataA, dataB, width, height };
}

/**
 * 차이 하이라이트: 슬라이더·깜빡임 모드에서 두 이미지의 차이가 큰 영역을 계산한다.
 * 조건이 맞지 않으면 빈 배열을 반환한다.
 */
export function useProcessCompareDiffRegions(
  enabled: boolean,
  mode: ProcessCompareMode,
  artA: string | null,
  artB: string | null,
  imgARef: RefObject<HTMLImageElement | null>,
  imgBRef: RefObject<HTMLImageElement | null>,
): readonly ProcessCompareDiffRegion[] {
  const [regions, setRegions] = useState<readonly ProcessCompareDiffRegion[]>([]);

  useEffect(() => {
    if (!enabled || (mode !== "slider" && mode !== "blink") || !artA || !artB) {
      setRegions([]);
      return;
    }
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      const imgA = imgARef.current;
      const imgB = imgBRef.current;
      if (!imgA || !imgB) return;
      try {
        const pixels = readComparePixels(imgA, imgB);
        if (!pixels || cancelled) return;
        setRegions(
          computeProcessCompareDiffRegions(pixels.dataA, pixels.dataB, pixels.width, pixels.height),
        );
      } catch {
        // CORS 등으로 캔버스가 오염되면 조용히 비활성화
        if (!cancelled) setRegions([]);
      }
    };

    const timer = window.setTimeout(run, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, mode, artA, artB, imgARef, imgBRef]);

  return regions;
}
