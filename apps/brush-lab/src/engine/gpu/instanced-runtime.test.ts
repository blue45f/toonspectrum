import { describe, expect, it } from "vitest";

import { DabBatch, DAB_BYTES } from "../core/dab-layout";
import { InvalidStateError, LaneUnavailableError, WgslCompileError } from "../core/errors";
import { presetById } from "../presets/catalog";
import { normalizeProgram } from "../presets/program-schema";

import {
  alignedBytesPerRow,
  ENTRY_POINTS,
  INST_PARAMS_SCALARS,
  MAX_DABS_PER_BATCH,
  PAPER_TEXTURE_SIZE,
  TIP_ATLAS_LEVELS,
} from "./layout";
import { halfToFloat, instancedUnsupportedReason, instParamsForProgram, STROKE_TARGET_FORMAT, SumiInstancedRuntime } from "./pipeline-instanced";
import { createMockCanvas, createMockGpu } from "./testing/mock-gpu-device";

import type { DabInstance } from "../core/types";
import type { BrushProgram } from "../presets/program-schema";
import type { MockGpu } from "./testing/mock-gpu-device";

/**
 * 렌더 인스턴싱 런타임(webgpu-instanced) fake 장치 계약 테스트. 픽셀 값은 검증하지 않는다(브라우저 프로브 몫).
 * 파이프라인 구성(정점 레이아웃·블렌드·타깃 포맷)·패스 순서(획 draw → 인코드 → bake 핑퐁)·미지원 프로그램 거부·
 * 장치 손실·readback(half 디코딩)을 본다.
 */
const dryProgram = (): BrushProgram => normalizeProgram({ id: "t-dry", name: "dry", family: "pencil", description: "" });

function dab(x: number, y: number): DabInstance {
  return {
    x,
    y,
    rx: 4,
    ry: 4,
    angle: 0,
    hardness: 0.8,
    flow: 0.5,
    shapeExp: 2,
    r: 0,
    g: 0,
    b: 0,
    a: 1,
    tipKind: "round",
    seed: 1,
    grain: 0,
    wet: 0,
    pigmentMass: 0.5,
    erase: false,
    smudge: false,
    dualTip: false,
    lockAlpha: false,
    impasto: false,
    deposition: "dry-stamp",
  };
}

function batchOf(n: number): DabBatch {
  const b = new DabBatch(Math.max(1, n));
  for (let i = 0; i < n; i += 1) b.push(dab(10 + (i % 50), 10 + Math.floor(i / 50)));
  return b;
}

interface PassRecord {
  label: string;
  loadOp: string | undefined;
  target: string;
}

/** 렌더 패스 기술자(라벨·loadOp·대상 텍스처)와 렌더 파이프라인 기술자를 가로챈다(목 장치는 기술자를 기록하지 않는다). */
function spyDevice(gpu: MockGpu): { passes: PassRecord[]; pipelineDescs: GPURenderPipelineDescriptor[] } {
  const passes: PassRecord[] = [];
  const pipelineDescs: GPURenderPipelineDescriptor[] = [];
  const device = gpu.device as unknown as {
    createCommandEncoder: (d?: GPUCommandEncoderDescriptor) => GPUCommandEncoder;
    createRenderPipelineAsync: (d: GPURenderPipelineDescriptor) => Promise<GPURenderPipeline>;
    createTexture: (d: GPUTextureDescriptor) => GPUTexture;
  };
  const viewLabels = new WeakMap<object, string>();
  const textureLabels = new WeakMap<object, string>();
  const createTexture = device.createTexture.bind(device);
  device.createTexture = (d: GPUTextureDescriptor): GPUTexture => {
    const tex = createTexture(d);
    textureLabels.set(tex, d.label ?? "?");
    const createView = tex.createView.bind(tex);
    tex.createView = (vd?: GPUTextureViewDescriptor): GPUTextureView => {
      const view = createView(vd);
      viewLabels.set(view, d.label ?? "?");
      return view;
    };
    return tex;
  };
  const createEncoder = device.createCommandEncoder.bind(device);
  device.createCommandEncoder = (d?: GPUCommandEncoderDescriptor): GPUCommandEncoder => {
    const encoder = createEncoder(d);
    const begin = encoder.beginRenderPass.bind(encoder);
    encoder.beginRenderPass = (desc: GPURenderPassDescriptor): GPURenderPassEncoder => {
      const att = Array.from(desc.colorAttachments)[0];
      const view = att && "view" in att ? (att.view as object) : null;
      passes.push({ label: desc.label ?? "", loadOp: att?.loadOp, target: (view && viewLabels.get(view)) ?? "?" });
      return begin(desc);
    };
    return encoder;
  };
  const createPipeline = device.createRenderPipelineAsync.bind(device);
  device.createRenderPipelineAsync = async (d: GPURenderPipelineDescriptor): Promise<GPURenderPipeline> => {
    pipelineDescs.push(d);
    return createPipeline(d);
  };
  return { passes, pipelineDescs };
}

async function createRuntime(opts: { width?: number; height?: number; canvas?: boolean; spy?: boolean; gpu?: MockGpu } = {}) {
  const gpu = opts.gpu ?? createMockGpu({ features: [] });
  const spy = opts.spy ? spyDevice(gpu) : null;
  const width = opts.width ?? 40;
  const height = opts.height ?? 24;
  const canvas = opts.canvas ? createMockCanvas(gpu, width, height) : null;
  const runtime = await SumiInstancedRuntime.create(gpu.device, {
    width,
    height,
    seed: 3,
    features: new Set(),
    clock: { now: () => 0 },
    presentCanvas: canvas?.canvas,
    presentFormat: canvas ? "bgra8unorm" : undefined,
  });
  return { gpu, runtime, spy, canvas };
}

const paramOffset = (name: (typeof INST_PARAMS_SCALARS)[number][0]): number => INST_PARAMS_SCALARS.findIndex(([n]) => n === name) * 4;
const readParam = (gpu: MockGpu, name: (typeof INST_PARAMS_SCALARS)[number][0]): number => gpu.getU32("inst-params", paramOffset(name));

describe("halfToFloat(rgba16float 디코딩)", () => {
  it("정규·비정규·무한·NaN·부호 있는 0을 IEEE half로 디코딩한다", () => {
    expect(halfToFloat(0x3c00)).toBe(1);
    expect(halfToFloat(0x3800)).toBe(0.5);
    expect(halfToFloat(0xc000)).toBe(-2);
    expect(halfToFloat(0x0000)).toBe(0);
    expect(Object.is(halfToFloat(0x8000), -0)).toBe(true);
    expect(halfToFloat(0x0001)).toBe(2 ** -24);
    expect(halfToFloat(0x03ff)).toBeCloseTo(2 ** -14 * (1023 / 1024), 12);
    expect(halfToFloat(0x7bff)).toBe(65504);
    expect(halfToFloat(0x7c00)).toBe(Infinity);
    expect(halfToFloat(0xfc00)).toBe(-Infinity);
    expect(halfToFloat(0x7e00)).toBeNaN();
  });
});

describe("instancedUnsupportedReason·instParamsForProgram", () => {
  it("smudge·습식(wet-flow)·임파스토는 사유를 돌려주고 건식·erase는 지원한다", () => {
    expect(instancedUnsupportedReason(presetById("smudge-blend"))).toMatch(/smudge/);
    expect(instancedUnsupportedReason(presetById("watercolor-wet"))).toMatch(/습식/);
    expect(instancedUnsupportedReason(presetById("oil-impasto"))).toMatch(/임파스토/);
    expect(instancedUnsupportedReason(presetById("pencil-hb"))).toBeNull();
    expect(instancedUnsupportedReason(presetById("eraser-soft"))).toBeNull();
  });

  it("InstParams는 stroke_pass·불투명도·종이·팁 아틀라스 상수를 프로그램에서 채운다", () => {
    const program = presetById("pencil-hb");
    const pass1 = instParamsForProgram(program, 40, 24, 1);
    const pass0 = instParamsForProgram(program, 40, 24, 0);
    expect(pass1).toMatchObject({ width: 40, height: 24, stroke_pass: 1, tip_levels: TIP_ATLAS_LEVELS, stroke_opacity: program.deposition.opacity });
    expect(pass0.stroke_pass).toBe(0);
    expect(pass1.paper_enabled).toBe(program.paper.enabled ? 1 : 0);
    expect(pass1.paper_size).toBe(PAPER_TEXTURE_SIZE);
  });
});

describe("SumiInstancedRuntime.create", () => {
  it("셰이더 2모듈·렌더 파이프라인 3개(dab·bake·encode)를 async로 만들고 정점·블렌드·타깃 포맷이 계약대로다", async () => {
    const gpu = createMockGpu();
    const spy = spyDevice(gpu);
    const { runtime } = await createRuntime({ gpu });
    expect(gpu.shaderModules.map((m) => m.label)).toEqual(["sumi-instanced-dab", "sumi-instanced-blit"]);
    const render = gpu.pipelines.filter((p) => p.kind === "render");
    expect(render.map((p) => p.entryPoint)).toEqual([ENTRY_POINTS.instancedFs, ENTRY_POINTS.instancedBakeFs, ENTRY_POINTS.instancedEncodeFs]);
    expect(render.every((p) => p.async)).toBe(true);
    expect(gpu.pipelines.some((p) => p.kind === "compute")).toBe(false);

    const [dabDesc, bakeDesc, encodeDesc] = spy.pipelineDescs;
    // dab 64 B를 정점 버퍼 1개(instance step)·속성 4개(vec4×3 + uvec4)로 그대로 넘긴다.
    const vb = dabDesc?.vertex.buffers ? Array.from(dabDesc.vertex.buffers)[0] : null;
    expect(vb).toMatchObject({ arrayStride: DAB_BYTES, stepMode: "instance" });
    expect(Array.from(vb?.attributes ?? []).map((a) => `${a.shaderLocation}:${a.offset}:${a.format}`)).toEqual([
      "0:0:float32x4",
      "1:16:float32x4",
      "2:32:float32x4",
      "3:48:uint32x4",
    ]);
    expect(dabDesc?.vertex.entryPoint).toBe(ENTRY_POINTS.instancedVs);
    // 하드웨어 over(premultiplied): src·1 + dst·(1 − src.a), 획 타깃은 rgba16float.
    const target = Array.from(dabDesc?.fragment?.targets ?? [])[0];
    expect(target?.format).toBe(STROKE_TARGET_FORMAT);
    expect(STROKE_TARGET_FORMAT).toBe("rgba16float");
    expect(target?.blend).toEqual({
      color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
    });
    // bake는 블렌드 없이 rgba16float 핑퐁 문서에, encode는 rgba8unorm present에 쓴다.
    expect(Array.from(bakeDesc?.fragment?.targets ?? [])[0]).toMatchObject({ format: "rgba16float" });
    expect(Array.from(bakeDesc?.fragment?.targets ?? [])[0]?.blend).toBeUndefined();
    expect(Array.from(encodeDesc?.fragment?.targets ?? [])[0]).toMatchObject({ format: "rgba8unorm" });
    expect(bakeDesc?.vertex.entryPoint).toBe(ENTRY_POINTS.instancedBlitVs);
    runtime.dispose();
  });

  it("텍스처 포맷·usage: 문서 핑퐁 2개는 COPY_SRC(readback), 획·문서는 렌더 타깃이며 present는 rgba8unorm", async () => {
    const { gpu, runtime } = await createRuntime();
    const tex = (label: string) => gpu.textureByLabel(label);
    const RENDER = 0x10;
    const COPY_SRC = 0x01;
    expect(tex("inst-stroke").format).toBe("rgba16float");
    expect(tex("inst-stroke").usage & RENDER).toBe(RENDER);
    for (const label of ["inst-doc-a", "inst-doc-b"]) {
      expect(tex(label).format).toBe("rgba16float");
      expect(tex(label).usage & RENDER).toBe(RENDER);
      expect(tex(label).usage & COPY_SRC).toBe(COPY_SRC);
    }
    expect(tex("inst-present").format).toBe("rgba8unorm");
    expect(tex("inst-tip-atlas").mipLevelCount).toBe(TIP_ATLAS_LEVELS);
    expect(tex("inst-tip-atlas").format).toBe("r32float");
    runtime.dispose();
  });

  it("초기화: 획·문서 2개를 clear하고 encode를 1회 그린 뒤 submit 1회(캔버스가 있으면 present도 1회)", async () => {
    const { gpu, spy, runtime } = await createRuntime({ spy: true });
    expect(spy?.passes.map((p) => `${p.label}:${p.loadOp}`)).toEqual(["inst-clear:clear", "inst-clear:clear", "inst-clear:clear", "inst-encode-pass:clear"]);
    expect(gpu.draws).toEqual([{ entryPoint: ENTRY_POINTS.instancedEncodeFs, vertexCount: 3, instanceCount: 1, pass: expect.any(Number) }]);
    expect(gpu.submits).toBe(1);
    expect(runtime.runtimeState).toBe("ready");

    const withCanvas = await createRuntime({ canvas: true });
    expect(withCanvas.gpu.draws.map((d) => d.entryPoint)).toEqual([ENTRY_POINTS.instancedEncodeFs, ENTRY_POINTS.presentFs]);
  });

  it("presentCanvas에 presentFormat이 없으면 InvalidStateError, 컴파일 오류 주입은 WgslCompileError이며 자원은 해제된다", async () => {
    const gpu = createMockGpu();
    const canvas = createMockCanvas(gpu, 8, 8);
    await expect(
      SumiInstancedRuntime.create(gpu.device, { width: 8, height: 8, seed: 1, features: new Set(), clock: null, presentCanvas: canvas.canvas }),
    ).rejects.toBeInstanceOf(InvalidStateError);

    const bad = createMockGpu({ compilationMessages: { "sumi-instanced-blit": [{ type: "error", message: "bad", lineNum: 2 }] } });
    const err = await SumiInstancedRuntime.create(bad.device, { width: 8, height: 8, seed: 1, features: new Set(), clock: null }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WgslCompileError);
    expect((err as WgslCompileError).shaderId).toBe("sumi-instanced-blit");
    expect(bad.calls.filter((c) => c === "buffer.destroy").length).toBeGreaterThanOrEqual(3);
  });

  it("캔버스 크기 검증: 양의 정수가 아니면 RangeError, 2048² 초과는 limit-exceeded", async () => {
    const gpu = createMockGpu();
    const base = { seed: 1, features: new Set<string>(), clock: null };
    await expect(SumiInstancedRuntime.create(gpu.device, { ...base, width: 0, height: 8 })).rejects.toBeInstanceOf(RangeError);
    await expect(SumiInstancedRuntime.create(gpu.device, { ...base, width: 8.5, height: 8 })).rejects.toBeInstanceOf(RangeError);
    await expect(SumiInstancedRuntime.create(gpu.device, { ...base, width: 4096, height: 8 })).rejects.toMatchObject({ code: "limit-exceeded" });
  });
});

describe("SumiInstancedRuntime.beginStroke", () => {
  it("smudge·습식·임파스토 프로그램은 LaneUnavailableError(not-implemented)로 거부하고 상태는 ready로 남는다", async () => {
    const { runtime } = await createRuntime();
    for (const id of ["smudge-blend", "watercolor-wet", "oil-impasto"]) {
      const err = (() => {
        try {
          runtime.beginStroke(presetById(id), 1);
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(err, id).toBeInstanceOf(LaneUnavailableError);
      expect(err, id).toMatchObject({ code: "not-implemented" });
    }
    expect(runtime.runtimeState).toBe("ready");
    runtime.beginStroke(dryProgram(), 1);
    expect(runtime.runtimeState).toBe("in-stroke");
    expect(() => runtime.beginStroke(dryProgram(), 2)).toThrow(InvalidStateError);
  });

  it("팁 아틀라스 7레벨을 올리고 같은 프로그램은 다시 올리지 않으며, 종이는 활성일 때 키가 같으면 한 번만 올린다", async () => {
    const { gpu, runtime } = await createRuntime();
    const program = dryProgram();
    runtime.beginStroke(program, 1);
    const tipWrites = gpu.textureWrites.filter((w) => w.target === "inst-tip-atlas");
    expect(tipWrites.length).toBe(TIP_ATLAS_LEVELS);
    expect(tipWrites[0]).toMatchObject({ mipLevel: 0, width: 512, height: 64 });
    const paperWrites = gpu.textureWrites.filter((w) => w.target === "inst-paper");
    expect(paperWrites.length).toBe(program.paper.enabled ? 1 : 0);
    if (program.paper.enabled) expect(paperWrites[0]).toMatchObject({ width: PAPER_TEXTURE_SIZE, height: PAPER_TEXTURE_SIZE, bytes: PAPER_TEXTURE_SIZE * PAPER_TEXTURE_SIZE * 4 });
    expect(readParam(gpu, "stroke_pass")).toBe(1);
    expect(readParam(gpu, "width")).toBe(40);
  });
});

describe("SumiInstancedRuntime.submitBatch", () => {
  it("프레임당 submit 1회: 획 pass(draw(6, n)) → encode pass(draw(3, 1)), 첫 프레임만 획 타깃을 clear하고 이후는 load한다", async () => {
    const { gpu, spy, runtime } = await createRuntime({ spy: true });
    runtime.beginStroke(dryProgram(), 1);
    const passesBefore = spy?.passes.length ?? 0;
    const drawsBefore = gpu.draws.length;
    const submitsBefore = gpu.submits;
    const first = runtime.submitBatch(batchOf(37));
    expect(first).toMatchObject({ frameIndex: 0, dabCount: 37, submitCount: 1, drawCount: 2 });
    expect(gpu.submits - submitsBefore).toBe(1);
    expect(gpu.draws.slice(drawsBefore).map((d) => `${d.entryPoint}:${d.vertexCount}x${d.instanceCount}`)).toEqual([
      `${ENTRY_POINTS.instancedFs}:6x37`,
      `${ENTRY_POINTS.instancedEncodeFs}:3x1`,
    ]);
    const second = runtime.submitBatch(batchOf(5));
    expect(second.frameIndex).toBe(1);
    const passes = (spy?.passes ?? []).slice(passesBefore);
    expect(passes.map((p) => `${p.label}:${p.target}:${p.loadOp}`)).toEqual([
      "inst-stroke-pass:inst-stroke:clear",
      "inst-encode-pass:inst-present:clear",
      "inst-stroke-pass:inst-stroke:load",
      "inst-encode-pass:inst-present:clear",
    ]);
    // 정점 버퍼에는 dab×64 B만 올린다.
    expect(gpu.writes.filter((w) => w.target === "inst-dabs").map((w) => w.size)).toEqual([37 * DAB_BYTES, 5 * DAB_BYTES]);
  });

  it("빈 배치는 획 draw 없이 encode만 그린다(drawCount 1)", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.beginStroke(dryProgram(), 1);
    const drawsBefore = gpu.draws.length;
    const r = runtime.submitBatch(new DabBatch(1));
    expect(r).toMatchObject({ dabCount: 0, submitCount: 1, drawCount: 1 });
    expect(gpu.draws.slice(drawsBefore).map((d) => d.entryPoint)).toEqual([ENTRY_POINTS.instancedEncodeFs]);
  });

  it(`배치가 ${MAX_DABS_PER_BATCH}개를 넘으면 같은 프레임 안에서 분할 제출한다(submitCount 증가, 첫 조각만 clear)`, async () => {
    const { gpu, spy, runtime } = await createRuntime({ spy: true });
    runtime.beginStroke(dryProgram(), 1);
    const passesBefore = spy?.passes.length ?? 0;
    const submitsBefore = gpu.submits;
    const r = runtime.submitBatch(batchOf(MAX_DABS_PER_BATCH + 10));
    expect(r).toMatchObject({ frameIndex: 0, dabCount: MAX_DABS_PER_BATCH + 10, submitCount: 2, drawCount: 4 });
    expect(gpu.submits - submitsBefore).toBe(2);
    const strokePasses = (spy?.passes ?? []).slice(passesBefore).filter((p) => p.label === "inst-stroke-pass");
    expect(strokePasses.map((p) => p.loadOp)).toEqual(["clear", "load"]);
    expect(gpu.draws.filter((d) => d.entryPoint === ENTRY_POINTS.instancedFs).map((d) => d.instanceCount)).toEqual([MAX_DABS_PER_BATCH, 10]);
  });

  it("beginStroke 전·dispose 뒤 호출은 InvalidStateError", async () => {
    const { runtime } = await createRuntime();
    expect(() => runtime.submitBatch(batchOf(1))).toThrow(InvalidStateError);
    runtime.dispose();
    expect(runtime.runtimeState).toBe("disposed");
    expect(() => runtime.beginStroke(dryProgram(), 1)).toThrow(InvalidStateError);
    expect(() => runtime.submitBatch(batchOf(1))).toThrow(InvalidStateError);
    await expect(runtime.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
    await expect(runtime.readbackImage()).rejects.toBeInstanceOf(InvalidStateError);
  });
});

describe("SumiInstancedRuntime.endStroke", () => {
  it("bake(핑퐁 문서) → 획 clear → stroke_pass 0으로 encode 다시 그리기 순서로 2회 submit하고 영수증을 돌려준다", async () => {
    const { gpu, spy, runtime } = await createRuntime({ spy: true });
    runtime.beginStroke(dryProgram(), 1);
    runtime.submitBatch(batchOf(12));
    const passesBefore = spy?.passes.length ?? 0;
    const submitsBefore = gpu.submits;
    const drawsBefore = gpu.draws.length;
    const receipt = await runtime.endStroke();
    expect(gpu.submits - submitsBefore).toBe(2);
    expect((spy?.passes ?? []).slice(passesBefore).map((p) => `${p.label}:${p.target}:${p.loadOp}`)).toEqual([
      "inst-bake-pass:inst-doc-b:clear",
      "inst-stroke-clear:inst-stroke:clear",
      "inst-encode-pass:inst-present:clear",
    ]);
    expect(gpu.draws.slice(drawsBefore).map((d) => `${d.entryPoint}:${d.vertexCount}`)).toEqual([
      `${ENTRY_POINTS.instancedBakeFs}:3`,
      `${ENTRY_POINTS.instancedEncodeFs}:3`,
    ]);
    // encode는 획 레이어를 제외(stroke_pass 0)하고 다시 그려야 한다.
    expect(readParam(gpu, "stroke_pass")).toBe(0);
    expect(receipt).toMatchObject({ dabCount: 12, frames: 1 });
    expect(receipt.submitCount).toBe(1 + 2);
    expect(runtime.runtimeState).toBe("ready");
  });

  it("획마다 문서 핑퐁이 뒤바뀐다(a→b→a): 두 번째 획의 bake 대상은 inst-doc-a", async () => {
    const { spy, runtime } = await createRuntime({ spy: true });
    for (const target of ["inst-doc-b", "inst-doc-a"]) {
      runtime.beginStroke(dryProgram(), 1);
      runtime.submitBatch(batchOf(3));
      const before = spy?.passes.length ?? 0;
      await runtime.endStroke();
      const bake = (spy?.passes ?? []).slice(before).find((p) => p.label === "inst-bake-pass");
      expect(bake?.target).toBe(target);
    }
  });

  it("beginStroke 전 endStroke는 InvalidStateError, endStroke 뒤에는 다음 획을 시작할 수 있다", async () => {
    const { runtime } = await createRuntime();
    await expect(runtime.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
    runtime.beginStroke(dryProgram(), 1);
    await runtime.endStroke();
    expect(() => runtime.beginStroke(dryProgram(), 2)).not.toThrow();
  });
});

describe("SumiInstancedRuntime readback·장치 손실", () => {
  it("readbackImage는 present 텍스처를 256 정렬 행 길이로 복사해 straight sRGB RGBA8로 돌려준다", async () => {
    const { gpu, runtime } = await createRuntime({ width: 5, height: 2 });
    const bytes = new Uint8Array(5 * 2 * 4);
    bytes.forEach((_, i) => {
      bytes[i] = i * 3;
    });
    gpu.textureByLabel("inst-present").data = bytes;
    const image = await runtime.readbackImage();
    expect(image).toMatchObject({ width: 5, height: 2 });
    expect(gpu.textureCopies.at(-1)).toMatchObject({ from: "inst-present", to: "inst-staging", bytesPerRow: alignedBytesPerRow(5) });
    expect(image.data.length).toBe(5 * 2 * 4);
  });

  it("readbackLinear는 현재 문서 텍스처(rgba16float, 행 길이 256 정렬)를 half → f32로 디코딩한다", async () => {
    const { gpu, runtime } = await createRuntime({ width: 3, height: 2 });
    const bytesPerRow = alignedBytesPerRow(3, 8);
    const staging = gpu.bufferByLabel("inst-staging");
    const view = new DataView(staging.data);
    // (0,0) = [1, 0.5, 0, 1], (1,1)의 첫 채널 = -2.
    [0x3c00, 0x3800, 0x0000, 0x3c00].forEach((h, c) => view.setUint16(c * 2, h, true));
    view.setUint16(bytesPerRow + 1 * 8, 0xc000, true);
    const linear = await runtime.readbackLinear();
    expect(linear.length).toBe(3 * 2 * 4);
    expect(Array.from(linear.subarray(0, 4))).toEqual([1, 0.5, 0, 1]);
    expect(linear[(1 * 3 + 1) * 4]).toBe(-2);
    expect(gpu.textureCopies.at(-1)).toMatchObject({ from: "inst-doc-a", bytesPerRow });
    // 획이 끝나면 문서 핑퐁이 b로 바뀌고 readback도 b를 읽는다.
    runtime.beginStroke(dryProgram(), 1);
    await runtime.endStroke();
    await runtime.readbackLinear();
    expect(gpu.textureCopies.at(-1)).toMatchObject({ from: "inst-doc-b" });
  });

  it("device-lost 뒤에는 LaneUnavailableError(device-lost)로 표면화한다", async () => {
    const { gpu, runtime } = await createRuntime();
    gpu.loseDevice("unknown", "gpu hang");
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.runtimeState).toBe("device-lost");
    expect(() => runtime.beginStroke(dryProgram(), 1)).toThrow(LaneUnavailableError);
    await expect(runtime.readbackImage()).rejects.toMatchObject({ code: "device-lost" });
  });

  it("dispose는 멱등이며 모든 텍스처·버퍼를 파괴한다", async () => {
    const { gpu, runtime } = await createRuntime();
    runtime.dispose();
    runtime.dispose();
    expect(gpu.textures.every((t) => t.destroyed)).toBe(true);
    expect(gpu.buffers.filter((b) => b.label.startsWith("inst-")).every((b) => b.destroyed)).toBe(true);
  });
});
