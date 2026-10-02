import { SumiError } from "../engine/core/errors";

import type { LabImage } from "../engine/core/types";

/**
 * 캔버스 표시 어댑터. 레인 readback 결과(sRGB straight RGBA8)를 `putImageData`로 올리고,
 * 예측 표본은 별도 미리보기 캔버스에만 그린다.
 */

/** 2D 컨텍스트를 얻지 못하면 `SumiError("canvas-2d-unavailable")`를 던진다(무음 대체 없음). */
export function presentLabImage(canvas: HTMLCanvasElement, img: LabImage): void {
  if (canvas.width !== img.width) canvas.width = img.width;
  if (canvas.height !== img.height) canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new SumiError("canvas-2d-unavailable", "캔버스 2D 컨텍스트를 만들 수 없다");
  }
  const imageData = ctx.createImageData(img.width, img.height);
  imageData.data.set(img.data.subarray(0, img.width * img.height * 4));
  ctx.putImageData(imageData, 0, 0);
}

/** 캔버스를 비운다. */
export function clearCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new SumiError("canvas-2d-unavailable", "캔버스 2D 컨텍스트를 만들 수 없다");
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export interface PreviewPoint {
  x: number;
  y: number;
  pressure: number;
}

/**
 * 예측 표본 미리보기(scratch 레이어). 정본 레이어와 분리된 캔버스에 반투명 점·선으로 그린다.
 * `radiusPx`는 현재 브러시 반경(압력 1 기준).
 */
export function presentPreview(
  canvas: HTMLCanvasElement,
  points: readonly PreviewPoint[],
  radiusPx: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new SumiError("canvas-2d-unavailable", "캔버스 2D 컨텍스트를 만들 수 없다");
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (points.length === 0) return;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#7c68ec";
  for (const p of points) {
    const r = Math.max(0.75, radiusPx * Math.max(0.05, p.pressure));
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * `getContext("webgpu")`는 lib.dom에서 `RenderingContext | null`(2D·WebGL·WebGPU 유니언)로 선언돼 있으므로
 * WebGPU 전용 멤버(`configure`·`getCurrentTexture`)로 명시적으로 좁힌다.
 */
function isGpuCanvasContext(ctx: RenderingContext): ctx is GPUCanvasContext {
  return "configure" in ctx && "getCurrentTexture" in ctx;
}

/** WebGPU 레인 표시용 캔버스 구성. 컨텍스트가 없거나 WebGPU가 아니면 `SumiError("webgpu-canvas-unavailable")`. */
export function configureWebGpuCanvas(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  format: GPUTextureFormat,
): GPUCanvasContext {
  const ctx = canvas.getContext("webgpu");
  if (!ctx) {
    throw new SumiError("webgpu-canvas-unavailable", "WebGPU 캔버스 컨텍스트를 만들 수 없다");
  }
  if (!isGpuCanvasContext(ctx)) {
    throw new SumiError(
      "webgpu-canvas-unavailable",
      "캔버스가 WebGPU 컨텍스트 대신 다른 컨텍스트를 돌려줬다(이미 2D/WebGL로 초기화됨)",
    );
  }
  ctx.configure({ device, format, alphaMode: "premultiplied" });
  return ctx;
}
