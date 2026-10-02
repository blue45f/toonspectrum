/**
 * 브라우저에서 ag-psd 캔버스 팩토리 등록(1회). Node 테스트는 testing/psd-canvas-stub.ts를 쓴다.
 */
import { initializeCanvas } from "ag-psd";

let installed = false;

export function installPsdBrowserCanvas(): void {
  if (installed) return;
  if (typeof document === "undefined") {
    throw new Error("document가 없어 ag-psd 캔버스 팩토리를 등록할 수 없습니다(브라우저 전용).");
  }
  initializeCanvas((width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
  installed = true;
}
