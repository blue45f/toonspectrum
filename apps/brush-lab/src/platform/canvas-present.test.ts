// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { installCanvasStub } from "../app/testing/canvas-stub";

import { clearCanvas, configureWebGpuCanvas, presentLabImage, presentPreview } from "./canvas-present";

import type { CanvasStubRecorder } from "../app/testing/canvas-stub";
import type { LabImage } from "../engine/core/types";

function image(width: number, height: number, fill = 128): LabImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(fill);
  return { width, height, data };
}

describe("canvas-present", () => {
  let stub: CanvasStubRecorder | null = null;
  afterEach(() => {
    stub?.restore();
    stub = null;
  });

  it("presentLabImage는 캔버스를 이미지 크기로 맞추고 putImageData 1회로 올린다", () => {
    stub = installCanvasStub();
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    presentLabImage(canvas, image(8, 6, 200));
    expect(canvas.width).toBe(8);
    expect(canvas.height).toBe(6);
    expect(stub.putImageDataCalls).toBe(1);
    expect(stub.lastImage?.width).toBe(8);
    expect(stub.lastImage?.data[0]).toBe(200);
    expect(stub.lastImage?.data.length).toBe(8 * 6 * 4);
  });

  it("2D 컨텍스트가 없으면 SumiError(canvas-2d-unavailable)로 드러낸다(무음 대체 없음)", () => {
    const canvas = document.createElement("canvas");
    expect(() => presentLabImage(canvas, image(2, 2))).toThrow(
      expect.objectContaining({ code: "canvas-2d-unavailable" }),
    );
    expect(() => clearCanvas(canvas)).toThrow(expect.objectContaining({ code: "canvas-2d-unavailable" }));
    expect(() => presentPreview(canvas, [], 4)).toThrow(expect.objectContaining({ code: "canvas-2d-unavailable" }));
  });

  it("presentPreview는 먼저 지우고 예측 점마다 arc를 그리며, 빈 목록이면 지우기만 한다", () => {
    stub = installCanvasStub();
    const canvas = document.createElement("canvas");
    presentPreview(canvas, [], 5);
    expect(stub.clearRectCalls).toBe(1);
    expect(stub.arcCalls).toBe(0);
    presentPreview(
      canvas,
      [
        { x: 1, y: 1, pressure: 0.5 },
        { x: 2, y: 2, pressure: 0 },
        { x: 3, y: 3, pressure: 1 },
      ],
      5,
    );
    expect(stub.clearRectCalls).toBe(2);
    expect(stub.arcCalls).toBe(3);
    clearCanvas(canvas);
    expect(stub.clearRectCalls).toBe(3);
  });

  it("configureWebGpuCanvas는 컨텍스트 부재·2D 컨텍스트 반환을 각각 webgpu-canvas-unavailable로 던진다", () => {
    const device = {} as GPUDevice;
    const none = document.createElement("canvas");
    expect(() => configureWebGpuCanvas(none, device, "bgra8unorm")).toThrow(
      expect.objectContaining({ code: "webgpu-canvas-unavailable" }),
    );
    stub = installCanvasStub({ webgpuAs2d: true });
    expect(() => configureWebGpuCanvas(document.createElement("canvas"), device, "bgra8unorm")).toThrow(
      /2D\/WebGL/u,
    );
  });

  it("configureWebGpuCanvas는 WebGPU 컨텍스트를 premultiplied로 구성해 돌려준다", () => {
    stub = installCanvasStub({ webgpu: true });
    const device = {} as GPUDevice;
    const ctx = configureWebGpuCanvas(document.createElement("canvas"), device, "rgba8unorm");
    expect(typeof ctx.getCurrentTexture).toBe("function");
    expect(stub.configureCalls).toEqual([{ device, format: "rgba8unorm", alphaMode: "premultiplied" }]);
  });
});
