import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  compileWeslVariant,
  WESL_VARIANT_CONDITION_BY_OP,
  WESL_VARIANT_STAGE_FN_BY_OP,
  WESL_VARIANT_STAGE_MARKER_BY_OP,
  weslConditionsForOps,
  WeslVariantCompileError,
  weslStageCallSnippet,
} from "../wesl-compile";
import {
  composeWgslVariant,
  evaluateVariantOnPixels,
  identityWgslLut3,
  packWgslVariantLut,
  packWgslVariantUniform,
  patchWgslVariantPixelCount,
  UnsupportedWgslOpError,
  WGSL_VARIANT_DISPATCH_ROW_THREADS,
  WGSL_VARIANT_WORKGROUP_SIZE,
  WgslVariantComposeError,
} from "../wgsl-variants";

import type { CompiledWeslVariant } from "../wesl-compile";
import type { WgslFilterOpKind, WgslFilterOpSpec } from "../wgsl-variants";
import type { Browser, Page } from "playwright";

/**
 * WESL variant 컴파일 계약 (V12 lane 5 `WESL_SHADER_PLATFORM` 격리 해제 PoC).
 *
 * 기준 진실은 기존 자체 생성기(wgsl-variants.ts)다. 이 스위트는 WESL 경로
 * (wesl-js 0.7.28 link + src/wesl/ 모듈 + studio_schedule 가상 모듈)가:
 *  1) 코퍼스와 동일한 35종 전 조합을 컴파일하고(variantKey 파리티 포함),
 *  2) 활성 스테이지의 시그니처(마커 상수·스테이지 함수·호출)를 정확히
 *     포함하며 비활성 스테이지는 부재함을 구조적으로 보장하고,
 *  3) 같은 ops 는 항상 같은 산출(결정성)을 낳고,
 *  4) @if 조건 누락/과잉이 조용히 넘어가지 않고 명시 실패함을 검증한다.
 *
 * 텍스트 비교는 코퍼스 .wgsl 과 하지 않는다 — 모듈 링킹이 공백·선언 순서를
 * 바꾸므로 구조 단언이 올바른 대조 수단이다(의미 동등성의 실행 검증은
 * 아래 옵트인 브라우저 프로브가 담당).
 */

// ---------------------------------------------------------------------------
// Variant 열거 — 코퍼스(wgsl-variants-corpus.test.ts)와 동일한 결정적 35종.
// ---------------------------------------------------------------------------

function sampleSpec(kind: "bc" | "hsl" | "lv" | "cv" | "cb"): WgslFilterOpSpec {
  switch (kind) {
    case "bc":
      return { op: "brightness-contrast", brightness: 0.2, contrast: 15 };
    case "hsl":
      return { op: "hsl", hue: 30, saturation: 0.4, luminance: 0.05 };
    case "lv":
      return { op: "levels", lut: identityWgslLut3() };
    case "cv":
      return { op: "curves", lut: identityWgslLut3() };
    case "cb":
      return {
        op: "color-balance",
        shadows: [15, 0, -5],
        midtones: [0, 8, 0],
        highlights: [20, 8, -10],
      };
  }
}

const KINDS = ["bc", "hsl", "lv", "cv", "cb"] as const;
const EXPECTED_VARIANT_COUNT = 35;

function variantChains(): WgslFilterOpSpec[][] {
  const chains: WgslFilterOpSpec[][] = [];
  for (const kind of KINDS) chains.push([sampleSpec(kind)]);
  for (const first of KINDS) {
    for (const second of KINDS) {
      chains.push([sampleSpec(first), sampleSpec(second)]);
    }
  }
  chains.push(KINDS.map((kind) => sampleSpec(kind)));
  chains.push([{ op: "brightness-contrast", brightness: 0.2 }]);
  chains.push([{ op: "brightness-contrast", contrast: 15 }]);
  chains.push([{ op: "hsl", hue: 30 }]);
  chains.push([{ op: "color-balance", midtones: [0, 8, 0] }]);
  return chains;
}

interface CompiledChain {
  readonly ops: WgslFilterOpSpec[];
  readonly compiled: CompiledWeslVariant;
}

// 35개 링크를 스위트에서 1회만 수행해 테스트 간 공유한다(결정성 계약 덕에 안전).
let compiledChainsMemo: Promise<CompiledChain[]> | null = null;
function compileAllChains(): Promise<CompiledChain[]> {
  compiledChainsMemo ??= (async () =>
    Promise.all(
      variantChains().map(async (ops) => ({
        ops,
        compiled: await compileWeslVariant(ops),
      })),
    ))();
  return compiledChainsMemo;
}

const ALL_OPS = Object.keys(WESL_VARIANT_CONDITION_BY_OP) as WgslFilterOpKind[];

describe("wesl variant compile — 35종 전 조합과 기존 생성기 파리티", () => {
  it("코퍼스와 동일한 35종 전 조합이 WESL 경로로 컴파일된다", async () => {
    const compiled = await compileAllChains();
    expect(compiled).toHaveLength(EXPECTED_VARIANT_COUNT);
    const keys = new Set(compiled.map((entry) => entry.compiled.variantKey));
    expect(keys.size).toBe(EXPECTED_VARIANT_COUNT);
    for (const { compiled: variant } of compiled) {
      expect(variant.wgsl.length).toBeGreaterThan(0);
      expect(variant.entryPoint).toBe("main");
      expect(variant.shaderId).toBe(`wesl-variant/${variant.variantKey}`);
    }
  });

  it("variantKey·레이아웃 메타가 기존 생성기 산출과 동일하다(기존 패커 재사용 근거)", async () => {
    for (const { ops, compiled } of await compileAllChains()) {
      const reference = composeWgslVariant(ops);
      expect(compiled.variantKey).toBe(reference.variantKey);
      expect(compiled.structure).toBe(reference.structure);
      expect(compiled.bindings).toEqual(reference.bindings);
      expect(compiled.usesLut).toBe(reference.usesLut);
      expect(compiled.lutEntryCount).toBe(reference.lutEntryCount);
      expect(compiled.uniformByteLength).toBe(reference.uniformByteLength);
      expect(compiled.stages).toEqual(reference.stages);
    }
  });

  it("활성 스테이지의 마커·함수·호출이 포함되고 비활성 스테이지는 부재한다(전 35종)", async () => {
    for (const { compiled } of await compileAllChains()) {
      const active = new Set(compiled.stages.map((stage) => stage.op));
      for (const op of ALL_OPS) {
        const marker = WESL_VARIANT_STAGE_MARKER_BY_OP[op];
        const stageFn = WESL_VARIANT_STAGE_FN_BY_OP[op];
        expect(
          compiled.wgsl.includes(marker),
          `${compiled.variantKey}: marker ${marker}`,
        ).toBe(active.has(op));
        expect(
          compiled.wgsl.includes(`fn ${stageFn}(`),
          `${compiled.variantKey}: stage fn ${stageFn}`,
        ).toBe(active.has(op));
      }
      compiled.stages.forEach((stage, index) => {
        expect(
          compiled.wgsl.includes(weslStageCallSnippet(stage, index)),
          `${compiled.variantKey}: stage ${index} call`,
        ).toBe(true);
      });
    }
  });

  it("스테이지 호출이 ops 순서를 보존한다 — 역순 페어는 서로 다른 WGSL 을 낳는다", async () => {
    const forward = await compileWeslVariant([sampleSpec("bc"), sampleSpec("hsl")]);
    const backward = await compileWeslVariant([sampleSpec("hsl"), sampleSpec("bc")]);
    expect(forward.variantKey).not.toBe(backward.variantKey);
    expect(forward.wgsl).not.toBe(backward.wgsl);
    // forward: bc(stage 0, lut base 0) → hsl(stage 1) 순서로 호출이 등장한다.
    const bcCall = forward.wgsl.indexOf(weslStageCallSnippet(forward.stages[0]!, 0));
    const hslCall = forward.wgsl.indexOf(weslStageCallSnippet(forward.stages[1]!, 1));
    expect(bcCall).toBeGreaterThanOrEqual(0);
    expect(hslCall).toBeGreaterThan(bcCall);
    // backward 는 hsl 이 stage 0 — bc 호출(lut base 0)이 hsl 호출 뒤에 온다.
    const hslFirst = backward.wgsl.indexOf(weslStageCallSnippet(backward.stages[0]!, 0));
    const bcSecond = backward.wgsl.indexOf(weslStageCallSnippet(backward.stages[1]!, 1));
    expect(hslFirst).toBeGreaterThanOrEqual(0);
    expect(bcSecond).toBeGreaterThan(hslFirst);
  });

  it("반복 스테이지를 지원한다 — [bc,bc] 는 lut base 0/768 로 두 번 호출, 함수 정의는 1회", async () => {
    const repeated = await compileWeslVariant([sampleSpec("bc"), sampleSpec("bc")]);
    expect(repeated.wgsl).toContain("studio_brightness_contrast_stage(rgb, 0u)");
    expect(repeated.wgsl).toContain("studio_brightness_contrast_stage(rgb, 768u)");
    const fnDefs = repeated.wgsl.split("fn studio_brightness_contrast_stage(").length - 1;
    expect(fnDefs).toBe(1);
    expect(repeated.lutEntryCount).toBe(768 * 2);
  });

  it("동일 ops 는 항상 동일 산출을 낳는다(결정성)", async () => {
    const ops = KINDS.map((kind) => sampleSpec(kind));
    const first = await compileWeslVariant(ops);
    const second = await compileWeslVariant(ops);
    expect(second.wgsl).toBe(first.wgsl);
    expect(second.variantKey).toBe(first.variantKey);
    expect(second.conditions).toEqual(first.conditions);
  });

  it("@if 조건 누락 시 wesl 링크가 명시 실패한다(조용한 폴백 없음)", async () => {
    const ops = [sampleSpec("hsl")];
    const conditions = weslConditionsForOps(ops);
    conditions[WESL_VARIANT_CONDITION_BY_OP.hsl] = false;
    const attempt = compileWeslVariant(ops, { conditionsOverride: conditions });
    await expect(attempt).rejects.toBeInstanceOf(WeslVariantCompileError);
    await expect(attempt).rejects.toThrow(/wesl link failed/);
  });

  it("@if 조건 과잉 시 마커 가드가 명시 실패한다(비활성 스테이지 누출 금지)", async () => {
    const ops = [sampleSpec("bc")];
    const conditions = weslConditionsForOps(ops);
    conditions[WESL_VARIANT_CONDITION_BY_OP["color-balance"]] = true;
    const attempt = compileWeslVariant(ops, { conditionsOverride: conditions });
    await expect(attempt).rejects.toBeInstanceOf(WeslVariantCompileError);
    await expect(attempt).rejects.toThrow(/excess @if condition/);
  });

  it("LUT 바인딩은 LUT 스테이지가 있을 때만 존재한다(기존 생성기 레이아웃 파리티)", async () => {
    const hslOnly = await compileWeslVariant([sampleSpec("hsl")]);
    expect(hslOnly.usesLut).toBe(false);
    expect(hslOnly.wgsl).not.toContain("@binding(3)");
    const cbOnly = await compileWeslVariant([sampleSpec("cb")]);
    expect(cbOnly.wgsl).not.toContain("@binding(3)");
    const levelsOnly = await compileWeslVariant([sampleSpec("lv")]);
    expect(levelsOnly.usesLut).toBe(true);
    expect(levelsOnly.wgsl).toContain("@binding(3)");
  });

  it("빈 체인·미지원 연산은 기존 생성기와 동일한 명시 예외를 던진다", async () => {
    await expect(compileWeslVariant([])).rejects.toBeInstanceOf(WgslVariantComposeError);
    const unknown = [{ op: "sepia" } as unknown as WgslFilterOpSpec];
    await expect(compileWeslVariant(unknown)).rejects.toBeInstanceOf(UnsupportedWgslOpError);
  });

  it("디스패치 규약(workgroup 64·행 16384 스레드)이 기존 생성기와 일치한다", async () => {
    const compiled = await compileWeslVariant([sampleSpec("bc")]);
    expect(compiled.wgsl).toContain(`@workgroup_size(${WGSL_VARIANT_WORKGROUP_SIZE})`);
    expect(compiled.wgsl).toContain(`${WGSL_VARIANT_DISPATCH_ROW_THREADS}u`);
  });

  it("uniform 스테이지 필드가 기존 패커 레이아웃 이름 그대로 방출된다(s{i}_*)", async () => {
    const full = await compileWeslVariant(KINDS.map((kind) => sampleSpec(kind)));
    // [bc, hsl, lv, cv, cb] — stage 1 = hsl 행렬, stage 4 = 컬러밸런스 존.
    expect(full.wgsl).toContain("s1_row_r");
    expect(full.wgsl).toContain("s1_row_g");
    expect(full.wgsl).toContain("s1_row_b");
    expect(full.wgsl).toContain("s4_shadows");
    expect(full.wgsl).toContain("s4_midtones");
    expect(full.wgsl).toContain("s4_highlights");
    expect(full.wgsl).toContain("pixel_count");
  });
});

// ---------------------------------------------------------------------------
// 브라우저 프로브 — 기존 WGSL_VARIANT_BROWSER_PROBE 패턴 복제(WESL 산출 대상).
// Opt-in: `WESL_VARIANT_BROWSER_PROBE=1 pnpm exec vitest run \
//   packages/studio-engine-registry/src/__tests__/wesl-compile.test.ts`
// 결과는 tests/benchmarks/results/wesl-variants-browser.json 에 남긴다.
// ---------------------------------------------------------------------------

const dynamicImport = (specifier: string): Promise<unknown> =>
  import(/* @vite-ignore */ specifier);

interface MinimalHttpResponse {
  writeHead(status: number, headers: Record<string, string>): void;
  end(body?: string): void;
}

interface MinimalHttpServer {
  once(event: "error", listener: (error: unknown) => void): void;
  listen(port: number, host: string, listener: () => void): void;
  close(listener?: () => void): void;
  address(): { port: number } | string | null;
}

interface NodeHttpModule {
  createServer(
    handler: (request: unknown, response: MinimalHttpResponse) => void,
  ): MinimalHttpServer;
}

interface NodeFsPromisesModule {
  writeFile(path: URL, data: string): Promise<void>;
}

const ENABLED =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.WESL_VARIANT_BROWSER_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;

const RESULTS_URL = new URL(
  "../../../../tests/benchmarks/results/wesl-variants-browser.json",
  import.meta.url,
);

const CHANNEL_TOLERANCE = 2;
const PIXEL_COUNT = 64 * 64;

// 결정적 비항등 LUT — 기존 브라우저 프로브와 동일한 채널별 감마 곡선.
function gammaLut3(gammas: readonly [number, number, number]): {
  r: Uint8ClampedArray;
  g: Uint8ClampedArray;
  b: Uint8ClampedArray;
} {
  const build = (gamma: number): Uint8ClampedArray => {
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i += 1) {
      lut[i] = Math.round(255 * Math.pow(i / 255, gamma));
    }
    return lut;
  };
  return { r: build(gammas[0]), g: build(gammas[1]), b: build(gammas[2]) };
}

// 대표 variant: 지원 5연산 풀체인(레벨/커브는 비항등 LUT — 기존 프로브와 동일).
const REPRESENTATIVE_OPS: WgslFilterOpSpec[] = [
  sampleSpec("bc"),
  sampleSpec("hsl"),
  { op: "levels", lut: gammaLut3([0.8, 1.1, 1.35]) },
  { op: "curves", lut: gammaLut3([1.25, 0.9, 0.7]) },
  sampleSpec("cb"),
];

// 결정적 테스트 픽셀(기존 프로브와 동일 LCG 시드 계열).
function deterministicPixels(pixelCount: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixelCount * 4);
  let state = 0x2f6e2b1;
  for (let i = 0; i < data.length; i += 1) {
    state = (Math.imul(state, 48271) + 11) >>> 0;
    data[i] = state & 0xff;
  }
  return data;
}

async function startHarnessServer(): Promise<{
  server: MinimalHttpServer;
  baseUrl: string;
}> {
  const { createServer } = (await dynamicImport("node:http")) as NodeHttpModule;
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      "<!doctype html><html><head><title>wesl variant probe</title></head><body></body></html>",
    );
  });
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        rejectPromise(new Error("server did not bind a TCP port"));
        return;
      }
      resolvePromise({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

interface ProbePayload {
  supported: boolean;
  reason?: string;
  adapter?: Record<string, string>;
}

interface CompileResultPayload {
  key: string;
  errors: string[];
  warnings: string[];
}

interface DispatchPayload {
  pixels: number[];
}

const LAUNCH_CANDIDATES: Array<{
  label: string;
  options: { channel?: "chrome"; headless: boolean; args: string[] };
}> = [
  {
    label: "playwright chromium headless shell (metal, unsafe-webgpu)",
    options: {
      headless: true,
      args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--use-angle=metal"],
    },
  },
  {
    label: "system chrome headless (metal, unsafe-webgpu)",
    options: {
      channel: "chrome",
      headless: true,
      args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--use-angle=metal"],
    },
  },
  {
    label: "system chrome headed (metal, unsafe-webgpu)",
    options: {
      channel: "chrome",
      headless: false,
      args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
    },
  },
];

async function probeWebGpu(page: Page): Promise<ProbePayload> {
  return page.evaluate(async () => {
    const gpu = navigator.gpu;
    if (!gpu) return { supported: false, reason: "navigator.gpu missing" };
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { supported: false, reason: "no adapter" };
    const info = adapter.info;
    return {
      supported: true,
      adapter: {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description,
      },
    };
  });
}

describeProbe("wesl variant real-browser compile/dispatch probe", () => {
  let server: MinimalHttpServer;
  let baseUrl: string;
  let browser: Browser | undefined;
  let page: Page;
  let launchLabel = "";
  let probe: ProbePayload = { supported: false, reason: "probe not run" };

  beforeAll(async () => {
    ({ server, baseUrl } = await startHarnessServer());
    const { chromium } = await import("playwright");
    for (const candidate of LAUNCH_CANDIDATES) {
      const attempt = await chromium.launch(candidate.options);
      const attemptPage = await attempt.newPage();
      await attemptPage.goto(baseUrl);
      const payload = await probeWebGpu(attemptPage);
      if (payload.supported) {
        browser = attempt;
        page = attemptPage;
        launchLabel = candidate.label;
        probe = payload;
        break;
      }
      probe = payload;
      await attempt.close();
    }
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose) => {
      server?.close(() => resolveClose());
    });
  });

  it(
    "compiles every WESL-linked variant with zero errors and matches the CPU reference on dispatch",
    async () => {
      expect(
        probe.supported,
        `no WebGPU adapter in any launch configuration — last probe: ${JSON.stringify(probe)}`,
      ).toBe(true);
      if (browser === undefined) throw new Error("unreachable: probe passed without browser");

      // ── 1) 전 variant compile 게이트(WESL 링크 산출 35종) ────────────────
      const compiledChains = await compileAllChains();
      expect(compiledChains).toHaveLength(EXPECTED_VARIANT_COUNT);
      const compileResults = (await page.evaluate(
        async (variants: Array<{ key: string; wgsl: string }>) => {
          const adapter = await navigator.gpu.requestAdapter();
          if (!adapter) throw new Error("no adapter during compile gate");
          const device = await adapter.requestDevice();
          const results: Array<{ key: string; errors: string[]; warnings: string[] }> = [];
          for (const variant of variants) {
            const module = device.createShaderModule({ code: variant.wgsl });
            const info = await module.getCompilationInfo();
            const errors: string[] = [];
            const warnings: string[] = [];
            for (const message of info.messages) {
              const rendered = `${message.type} ${message.lineNum}:${message.linePos} ${message.message}`;
              if (message.type === "error") errors.push(rendered);
              else warnings.push(rendered);
            }
            results.push({ key: variant.key, errors, warnings });
          }
          device.destroy();
          return results;
        },
        compiledChains.map((entry) => ({
          key: entry.compiled.variantKey,
          wgsl: entry.compiled.wgsl,
        })),
      )) as CompileResultPayload[];

      const failed = compileResults.filter((result) => result.errors.length > 0);
      expect(
        failed,
        `WESL-linked WGSL compile errors: ${JSON.stringify(failed, null, 2)}`,
      ).toEqual([]);
      const compileErrorCount = failed.reduce((sum, result) => sum + result.errors.length, 0);

      // ── 2) 대표 variant 디스패치 — CPU 참조와 픽셀 정합 ─────────────────
      // 레이아웃 등가 계약 덕에 기존 패커를 그대로 재사용한다.
      const representative = await compileWeslVariant(REPRESENTATIVE_OPS);
      const srcPixels = deterministicPixels(PIXEL_COUNT);
      const expected = evaluateVariantOnPixels(REPRESENTATIVE_OPS, srcPixels);
      const uniform = packWgslVariantUniform(REPRESENTATIVE_OPS);
      expect(uniform.byteLength).toBe(representative.uniformByteLength);
      patchWgslVariantPixelCount(uniform, PIXEL_COUNT);
      const lut = packWgslVariantLut(REPRESENTATIVE_OPS);
      if (lut === null) throw new Error("representative chain must carry LUT stages");
      expect(lut.length).toBe(representative.lutEntryCount);

      const dispatch = (await page.evaluate(
        async (input: {
          wgsl: string;
          entryPoint: string;
          srcBytes: number[];
          uniformBytes: number[];
          lutWords: number[];
          pixelCount: number;
          rowThreads: number;
          workgroupSize: number;
        }) => {
          const adapter = await navigator.gpu.requestAdapter();
          if (!adapter) throw new Error("no adapter during dispatch");
          const device = await adapter.requestDevice();
          const byteLength = input.srcBytes.length;

          // WebGPU 명세 고정 상수 — 기존 프로브와 동일 규약.
          const USAGE_MAP_READ = 0x0001;
          const USAGE_COPY_SRC = 0x0004;
          const USAGE_COPY_DST = 0x0008;
          const USAGE_UNIFORM = 0x0040;
          const USAGE_STORAGE = 0x0080;
          const MAP_MODE_READ = 0x0001;

          const srcBuffer = device.createBuffer({
            size: byteLength,
            usage: USAGE_STORAGE | USAGE_COPY_DST,
          });
          device.queue.writeBuffer(srcBuffer, 0, new Uint8Array(input.srcBytes));
          const dstBuffer = device.createBuffer({
            size: byteLength,
            usage: USAGE_STORAGE | USAGE_COPY_SRC,
          });
          const uniformBuffer = device.createBuffer({
            size: input.uniformBytes.length,
            usage: USAGE_UNIFORM | USAGE_COPY_DST,
          });
          device.queue.writeBuffer(uniformBuffer, 0, new Uint8Array(input.uniformBytes));
          const lutBuffer = device.createBuffer({
            size: input.lutWords.length * 4,
            usage: USAGE_STORAGE | USAGE_COPY_DST,
          });
          device.queue.writeBuffer(lutBuffer, 0, new Uint32Array(input.lutWords));

          const module = device.createShaderModule({ code: input.wgsl });
          const pipeline = await device.createComputePipelineAsync({
            layout: "auto",
            compute: { module, entryPoint: input.entryPoint },
          });
          const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: srcBuffer } },
              { binding: 1, resource: { buffer: dstBuffer } },
              { binding: 2, resource: { buffer: uniformBuffer } },
              { binding: 3, resource: { buffer: lutBuffer } },
            ],
          });

          const readback = device.createBuffer({
            size: byteLength,
            usage: USAGE_COPY_DST | USAGE_MAP_READ,
          });
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginComputePass();
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bindGroup);
          pass.dispatchWorkgroups(
            input.rowThreads / input.workgroupSize,
            Math.ceil(input.pixelCount / input.rowThreads),
          );
          pass.end();
          encoder.copyBufferToBuffer(dstBuffer, 0, readback, 0, byteLength);
          device.queue.submit([encoder.finish()]);
          await readback.mapAsync(MAP_MODE_READ);
          const pixels = [...new Uint8Array(readback.getMappedRange())];
          readback.unmap();
          device.destroy();
          return { pixels };
        },
        {
          wgsl: representative.wgsl,
          entryPoint: representative.entryPoint,
          srcBytes: [...srcPixels],
          uniformBytes: [...new Uint8Array(uniform)],
          lutWords: [...lut],
          pixelCount: PIXEL_COUNT,
          rowThreads: WGSL_VARIANT_DISPATCH_ROW_THREADS,
          workgroupSize: WGSL_VARIANT_WORKGROUP_SIZE,
        },
      )) as DispatchPayload;

      expect(dispatch.pixels).toHaveLength(expected.length);
      let maxChannelDiff = 0;
      let mismatchedChannels = 0;
      for (let i = 0; i < expected.length; i += 1) {
        const diff = Math.abs(dispatch.pixels[i]! - expected[i]!);
        const isAlpha = i % 4 === 3;
        if (isAlpha) {
          expect(diff, `alpha channel ${i} must match exactly`).toBe(0);
          continue;
        }
        if (diff > 0) mismatchedChannels += 1;
        if (diff > maxChannelDiff) maxChannelDiff = diff;
      }
      expect(
        maxChannelDiff,
        `GPU/CPU divergence ${maxChannelDiff} exceeds ±${CHANNEL_TOLERANCE}/255`,
      ).toBeLessThanOrEqual(CHANNEL_TOLERANCE);

      // ── 3) 실측 기록 ────────────────────────────────────────────────────
      const report = {
        harness:
          "packages/studio-engine-registry/src/__tests__/wesl-compile.test.ts (WESL_VARIANT_BROWSER_PROBE=1)",
        note: "V12 lane 5 (WESL_SHADER_PLATFORM) 격리 해제 근거 — wesl-js 0.7.28 link 산출 WGSL variant 전수 브라우저 컴파일 + 대표 variant 디스패치 CPU 정합(기존 자체 생성기와 레이아웃 등가·기존 패커 재사용)",
        linker: "wesl 0.7.28 (wesl-js link, @if conditions + studio_schedule virtualLib)",
        measuredAt: new Date().toISOString(),
        browser: { launch: launchLabel, version: browser.version() },
        adapter: probe.adapter ?? null,
        variantCount: compiledChains.length,
        compileErrorCount,
        compileWarnings: compileResults
          .filter((result) => result.warnings.length > 0)
          .map((result) => ({ key: result.key, warnings: result.warnings })),
        dispatch: {
          variantKey: representative.variantKey,
          shaderId: representative.shaderId,
          stages: representative.stages.map((stage) => stage.op),
          pixelCount: PIXEL_COUNT,
          channelTolerance: CHANNEL_TOLERANCE,
          maxChannelDiff,
          mismatchedChannels,
          totalColorChannels: PIXEL_COUNT * 3,
        },
        variantKeys: compiledChains.map((entry) => entry.compiled.variantKey),
      };
      const { writeFile } = (await dynamicImport(
        "node:fs/promises",
      )) as NodeFsPromisesModule;
      await writeFile(RESULTS_URL, `${JSON.stringify(report, null, 2)}\n`);
    },
    240_000,
  );
});
