/**
 * PsdPlan → ag-psd `writePsdUint8Array`. Node 테스트는 testing/psd-canvas-stub, 브라우저는 psd-canvas.browser.ts가
 * 캔버스 팩토리를 먼저 등록한다. 썸네일은 만들지 않는다(generateThumbnail:false → 캔버스 불필요).
 * 그룹은 ag-psd `children` 중첩, 혼합은 'normal' | 'multiply' | 'screen' 문자열, 그룹은 'pass through'.
 */
import { writePsdUint8Array } from "ag-psd";

import type { CapturedRaster } from "../contracts";
import type { PsdLayerPlan, PsdPlan } from "./psd-plan";
import type { Layer, Psd } from "ag-psd";

export const PSD_MIME = "image/vnd.adobe.photoshop";

export interface AssemblePsdOptions {
  /** zip 압축(파일은 작지만 일부 소프트웨어 호환성 저하) */
  readonly compress?: boolean;
}

function imageData(raster: CapturedRaster): NonNullable<Layer["imageData"]> {
  return { width: raster.width, height: raster.height, data: raster.rgba };
}

export function toAgPsdLayer(plan: PsdLayerPlan): Layer {
  if (plan.kind === "group") {
    return {
      name: plan.name,
      opened: plan.opened,
      hidden: plan.hidden,
      blendMode: "pass through",
      opacity: 1,
      children: plan.children.map(toAgPsdLayer),
    };
  }
  return {
    name: plan.name,
    top: 0,
    left: 0,
    bottom: plan.raster.height,
    right: plan.raster.width,
    opacity: plan.opacity,
    blendMode: plan.blendMode,
    hidden: plan.hidden,
    imageData: imageData(plan.raster),
  };
}

export function toAgPsd(plan: PsdPlan): Psd {
  return {
    width: plan.width,
    height: plan.height,
    channels: 4,
    bitsPerChannel: 8,
    children: plan.layers.map(toAgPsdLayer),
    imageData: imageData(plan.composite),
  };
}

export function assemblePsd(plan: PsdPlan, options: AssemblePsdOptions = {}): Uint8Array {
  return writePsdUint8Array(toAgPsd(plan), {
    generateThumbnail: false,
    trimImageData: false,
    noBackground: true,
    ...(options.compress ? { compress: true } : {}),
  });
}
