import { buildVectorPdf, pxToPt, type StudioPdfColor, type StudioPdfOp } from "../render/studio-canvaskit-pdf-vector";
import { canvasToBlob } from "./studio-export";

import type { DrawEl } from "../studio-element-model";

export interface StudioVectorPdfProductInput {
  readonly canvas: HTMLCanvasElement;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly title: string;
  readonly drawElements: readonly DrawEl[];
}

export interface StudioVectorPdfExportResult {
  readonly bytes: Uint8Array;
  readonly vectorStrokeCount: number;
  readonly skippedStrokeCount: number;
  readonly warnings: readonly string[];
}

function colorFromCss(value: string): { color: StudioPdfColor; approximated: boolean } {
  const source = value.trim();
  const short = /^#([0-9a-f]{3})$/iu.exec(source);
  if (short) {
    const digits = short[1]!;
    return {
      color: {
        space: "rgb",
        r: Number.parseInt(`${digits[0]}${digits[0]}`, 16) / 255,
        g: Number.parseInt(`${digits[1]}${digits[1]}`, 16) / 255,
        b: Number.parseInt(`${digits[2]}${digits[2]}`, 16) / 255,
      },
      approximated: false,
    };
  }
  const full = /^#([0-9a-f]{6})$/iu.exec(source);
  if (full) {
    const digits = full[1]!;
    return {
      color: {
        space: "rgb",
        r: Number.parseInt(digits.slice(0, 2), 16) / 255,
        g: Number.parseInt(digits.slice(2, 4), 16) / 255,
        b: Number.parseInt(digits.slice(4, 6), 16) / 255,
      },
      approximated: false,
    };
  }
  return { color: { space: "rgb", r: 0.067, g: 0.067, b: 0.067 }, approximated: true };
}

function vectorStrokeOps(
  elements: readonly DrawEl[],
  scaleXPt: number,
  scaleYPt: number,
): { ops: StudioPdfOp[]; vectorStrokeCount: number; skippedStrokeCount: number; approximatedColors: number } {
  const ops: StudioPdfOp[] = [];
  let vectorStrokeCount = 0;
  let skippedStrokeCount = 0;
  let approximatedColors = 0;
  for (const element of elements) {
    if (element.hidden || element.mode === "eraser" || (element.kind && element.kind !== "freehand")) {
      skippedStrokeCount += 1;
      continue;
    }
    if (element.points.length < 4 || element.points.length % 2 !== 0) {
      skippedStrokeCount += 1;
      continue;
    }
    const commands: Extract<StudioPdfOp, { op: "path" }>["commands"][number][] = [];
    for (let index = 0; index < element.points.length; index += 2) {
      const x = element.points[index]! * scaleXPt;
      const y = element.points[index + 1]! * scaleYPt;
      commands.push(index === 0 ? { op: "move", x, y } : { op: "line", x, y });
    }
    const parsedColor = colorFromCss(element.stroke);
    if (parsedColor.approximated) approximatedColors += 1;
    ops.push({
      op: "path",
      commands,
      stroke: {
        color: parsedColor.color,
        width: Math.max(0.1, element.strokeWidth * (scaleXPt + scaleYPt) / 2),
        cap: 1,
        join: 1,
        alpha: Math.max(0, Math.min(1, element.opacity ?? 1)),
      },
    });
    vectorStrokeCount += 1;
  }
  return { ops, vectorStrokeCount, skippedStrokeCount, approximatedColors };
}

/**
 * Product bridge for the deterministic PDF 1.7 writer.
 *
 * The current rendered page is embedded as the visual-fidelity backdrop while editable freehand
 * line art is emitted again as true PDF vector paths. This intentionally does not claim that text,
 * filters, images, or every Studio effect remain editable vectors; callers surface that limitation.
 */
export async function exportStudioCurrentPageVectorPdf(
  input: StudioVectorPdfProductInput,
): Promise<StudioVectorPdfExportResult> {
  if (!(input.canvas instanceof HTMLCanvasElement) || input.canvas.width < 1 || input.canvas.height < 1) {
    throw new Error("벡터 PDF로 내보낼 현재 페이지 캡처가 올바르지 않습니다.");
  }
  if (!Number.isFinite(input.logicalWidth) || !Number.isFinite(input.logicalHeight) || input.logicalWidth <= 0 || input.logicalHeight <= 0) {
    throw new Error("벡터 PDF의 원고 크기가 올바르지 않습니다.");
  }

  const jpeg = await canvasToBlob(input.canvas, "image/jpeg", 0.96);
  const jpegBytes = new Uint8Array(await jpeg.arrayBuffer());
  const widthPt = pxToPt(input.canvas.width);
  const heightPt = pxToPt(input.canvas.height);
  const scaleXPt = widthPt / input.logicalWidth;
  const scaleYPt = heightPt / input.logicalHeight;
  const vector = vectorStrokeOps(input.drawElements, scaleXPt, scaleYPt);
  const backdropName = "PageBackdrop";
  const ops: StudioPdfOp[] = [
    {
      op: "image",
      name: backdropName,
      x: 0,
      y: 0,
      width: widthPt,
      height: heightPt,
    },
    ...vector.ops,
  ];
  const bytes = buildVectorPdf({
    title: input.title.trim() || "ToonSpectrum Studio",
    pages: [{ widthPt, heightPt, ops }],
    images: [{
      name: backdropName,
      jpegBytes,
      widthPx: input.canvas.width,
      heightPx: input.canvas.height,
      colorSpace: "rgb",
    }],
    originTopLeft: true,
  });
  const warnings: string[] = [
    "현재 화면은 고품질 JPEG 배경으로 보존하고, 지원되는 펜 자유곡선만 PDF 벡터 패스로 중첩합니다.",
  ];
  if (vector.skippedStrokeCount > 0) {
    warnings.push(`지우개·도형 등 ${vector.skippedStrokeCount}개 드로잉 요소는 화면 배경에만 포함됩니다.`);
  }
  if (vector.approximatedColors > 0) {
    warnings.push(`CSS 복합 색상 ${vector.approximatedColors}개는 벡터 패스에서 짙은 중성색으로 근사했습니다.`);
  }
  return Object.freeze({
    bytes: bytes.slice(),
    vectorStrokeCount: vector.vectorStrokeCount,
    skippedStrokeCount: vector.skippedStrokeCount,
    warnings: Object.freeze(warnings),
  });
}
