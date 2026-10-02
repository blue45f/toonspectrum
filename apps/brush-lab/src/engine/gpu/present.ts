import { SumiError } from "../core/errors";

import { compileShaderOrThrow } from "./device";
import { ENTRY_POINTS, PRESENT_BINDINGS, SHADER_STAGE } from "./layout";
import { PRESENT_WGSL } from "./wgsl/present.wgsl";

/**
 * present 렌더 패스: present_tex(rgba8unorm, sRGB straight + 선형 알파)를 풀스크린 삼각형 1개로 캔버스에 올린다.
 * 캔버스는 `alphaMode: "premultiplied"`로 구성하고 fragment가 rgb × a 를 출력한다.
 */
export interface PresentPipeline {
  pipeline: GPURenderPipeline;
  layout: GPUBindGroupLayout;
  format: GPUTextureFormat;
  createBindGroup(source: GPUTextureView, sampler: GPUSampler): GPUBindGroup;
}

export async function createPresentPipeline(device: GPUDevice, format: GPUTextureFormat): Promise<PresentPipeline> {
  const module = await compileShaderOrThrow(device, "sumi-present", PRESENT_WGSL);
  const layout = device.createBindGroupLayout({
    label: "sumi-present-bgl",
    entries: [
      { binding: PRESENT_BINDINGS.source.binding, visibility: SHADER_STAGE.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
      { binding: PRESENT_BINDINGS.sampler.binding, visibility: SHADER_STAGE.FRAGMENT, sampler: { type: "filtering" } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ label: "sumi-present-layout", bindGroupLayouts: [layout] });
  const pipeline = await device.createRenderPipelineAsync({
    label: "sumi-present",
    layout: pipelineLayout,
    vertex: { module, entryPoint: ENTRY_POINTS.presentVs },
    fragment: { module, entryPoint: ENTRY_POINTS.presentFs, targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  return {
    pipeline,
    layout,
    format,
    createBindGroup(source: GPUTextureView, sampler: GPUSampler): GPUBindGroup {
      return device.createBindGroup({
        label: "sumi-present-bg",
        layout,
        entries: [
          { binding: PRESENT_BINDINGS.source.binding, resource: source },
          { binding: PRESENT_BINDINGS.sampler.binding, resource: sampler },
        ],
      });
    },
  };
}

function isGpuCanvasContext(ctx: unknown): ctx is GPUCanvasContext {
  return typeof ctx === "object" && ctx !== null && "configure" in ctx && "getCurrentTexture" in ctx;
}

/**
 * 주입된 캔버스에서 WebGPU 컨텍스트를 얻어 구성한다. 컨텍스트가 없거나 WebGPU가 아니면
 * `SumiError("webgpu-canvas-unavailable")`(무음 대체 없음). 엔진은 DOM 전역을 만지지 않는다 — 캔버스는 인자다.
 */
export function configurePresentCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  device: GPUDevice,
  format: GPUTextureFormat,
): GPUCanvasContext {
  const getter = (canvas as { getContext?: (id: string) => unknown }).getContext;
  const ctx = typeof getter === "function" ? getter.call(canvas, "webgpu") : null;
  if (!ctx) {
    throw new SumiError("webgpu-canvas-unavailable", "WebGPU 캔버스 컨텍스트를 만들 수 없다");
  }
  if (!isGpuCanvasContext(ctx)) {
    throw new SumiError("webgpu-canvas-unavailable", "캔버스가 WebGPU 컨텍스트 대신 다른 컨텍스트를 돌려줬다");
  }
  ctx.configure({ device, format, alphaMode: "premultiplied" });
  return ctx;
}

/** 풀스크린 삼각형 1개를 그린다(렌더 패스 1개, draw 1회). */
export function encodePresent(
  encoder: GPUCommandEncoder,
  present: PresentPipeline,
  bindGroup: GPUBindGroup,
  target: GPUTextureView,
): void {
  const pass = encoder.beginRenderPass({
    label: "sumi-present-pass",
    colorAttachments: [{ view: target, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
  });
  pass.setPipeline(present.pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3, 1);
  pass.end();
}
