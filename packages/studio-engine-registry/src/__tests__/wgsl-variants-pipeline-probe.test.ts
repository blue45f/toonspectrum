import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  composeWgslVariant,
  evaluateVariantOnPixels,
  packWgslVariantLut,
  packWgslVariantUniform,
  patchWgslVariantPixelCount,
  WGSL_VARIANT_DISPATCH_ROW_THREADS,
  WGSL_VARIANT_WORKGROUP_SIZE,
} from "../wgsl-variants";

import type { WgslFilterOpSpec } from "../wgsl-variants";
import type { Browser, Page } from "playwright";

// ---------------------------------------------------------------------------
// node 내장 모듈 접근 — 이 패키지 tsconfig 는 @types/node 를 포함하지 않으므로
// (types 필드 없음 + 패키지 devDep 없음), 정적 `node:*` import 는 타입 해석이
// 안 된다. 런타임(vitest, node)에는 당연히 존재하므로 변수 지정자 동적
// import + 최소 구조 타입으로 접근한다(wgsl-variants-browser.test.ts 와 동일
// 우회 — tsconfig/package.json 은 이 레인의 무접촉 대상).
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
  readFile(path: URL, encoding: "utf8"): Promise<string>;
  writeFile(path: URL, data: string): Promise<void>;
}

interface NodeBufferModule {
  Buffer: { from(data: string, encoding: "base64"): Uint8Array };
}

interface NodeOsModule {
  loadavg(): number[];
  cpus(): unknown[];
}

/**
 * Real-browser WGSL variant **pipeline count / jank** probe (V12 lane 5
 * `WESL_SHADER_PLATFORM` 마지막 재개 게이트 "파이프라인 수/jank 감소 실측").
 *
 * Opt-in: `WGSL_VARIANT_PIPELINE_PROBE=1 pnpm exec vitest run \
 *   packages/studio-engine-registry/src/__tests__/wgsl-variants-pipeline-probe.test.ts`
 *
 * 512² RGBA 입력에 5연산 체인(밝기→대비→HSL→레벨→커브)을 두 방식으로 적용:
 *  - A(정적 커널 경로 모사): 단일 연산 variant 5개 → 컴퓨트 파이프라인 5개,
 *    프레임마다 5 디스패치 연쇄(중간 버퍼 핑퐁).
 *  - B(융합): 5연산 융합 variant 1개 → 파이프라인 1개, 프레임마다 1 디스패치.
 * 각 방식 60프레임(워밍업 10 제외 → 측정 50), 프레임마다
 * `device.queue.onSubmittedWorkDone()` 동기화. A/B 프레임을 반복마다
 * 교차(interleave)해 백그라운드 부하(24h 소크 병행) 드리프트가 한쪽에만
 * 실리지 않게 하고, 통계는 중앙값(p50) 기반으로 요약한다.
 *
 * 벽시계 프레임 시간은 512² 워크로드에서 submit→onSubmittedWorkDone 왕복
 * (~2.5ms)이 GPU 실행(수백 µs)을 가리는 측정 플로어를 가진다(1차 실측에서
 * 두 방식 p50 이 동일 플로어에 앉는 것을 확인). 그래서 어댑터가
 * `timestamp-query` 를 지원하면 GPU 패스 실행 시간을 보조 계측해 디스패치
 * 수 차이가 GPU 점유 시간에 실제로 어떻게 나타나는지도 기록한다.
 *
 * 정합성: 두 방식의 출력 픽셀을 서로, 그리고 CPU 참조
 * (`evaluateVariantOnPixels`)와 대조한다(색 채널 ±2/255, 알파 정확 일치).
 * 성능 수치는 단언하지 않고 결과 그대로
 * tests/benchmarks/results/wgsl-variants-pipeline.json 에 기록한다 — 게이트가
 * "감소 실측"이므로 실측치가 판정이다(융합 우위가 아니어도 그대로 남긴다).
 */

const ENABLED =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.WGSL_VARIANT_PIPELINE_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;

const RESULTS_URL = new URL(
  "../../../../tests/benchmarks/results/wgsl-variants-pipeline.json",
  import.meta.url,
);

const CHANNEL_TOLERANCE = 2;
const IMAGE_SIZE = 512;
const PIXEL_COUNT = IMAGE_SIZE * IMAGE_SIZE;
const TOTAL_FRAMES = 60;
const WARMUP_FRAMES = 10;

interface PipelinePromotionGateInput {
  pipelineCountReduced: boolean;
  pipelineCreateTimeReduced: boolean;
  wallClockJankReduced: boolean;
  gpuExecutionReduced: boolean | null;
}

function passesPipelinePromotionGate(input: PipelinePromotionGateInput): boolean {
  return (
    input.pipelineCountReduced &&
    input.pipelineCreateTimeReduced &&
    input.wallClockJankReduced &&
    input.gpuExecutionReduced === true
  );
}

describe("committed WGSL/WESL pipeline promotion evidence", () => {
  it("cannot pass unless pipeline count, creation, GPU execution, and wall-clock jank all improve", async () => {
    const { readFile } = (await dynamicImport(
      "node:fs/promises",
    )) as NodeFsPromisesModule;
    const artifact = JSON.parse(await readFile(RESULTS_URL, "utf8")) as {
      gate: {
        pipelineCountReduced: boolean;
        pipelineCreateTimeReduced: boolean;
        wallClockFrame: {
          jankReduced: boolean;
          jankStddevReduced: boolean;
          jankP99OverP50Reduced: boolean;
        };
        gpuExecution: { reduced: boolean | null };
        passed: boolean;
      };
    };
    const { gate } = artifact;

    expect(gate.wallClockFrame.jankReduced).toBe(
      gate.wallClockFrame.jankStddevReduced ||
        gate.wallClockFrame.jankP99OverP50Reduced,
    );
    expect(gate.passed).toBe(
      passesPipelinePromotionGate({
        pipelineCountReduced: gate.pipelineCountReduced,
        pipelineCreateTimeReduced: gate.pipelineCreateTimeReduced,
        wallClockJankReduced: gate.wallClockFrame.jankReduced,
        gpuExecutionReduced: gate.gpuExecution.reduced,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 5연산 체인 — 밝기→대비→HSL→레벨→커브. 밝기/대비는 정적 커널 경로에서 별개
// 패스로 도는 케이스를 모사하기 위해 구조가 다른 단일 연산 스펙 2개로 나눈다.
// 레벨/커브는 채널별로 다른 비항등 감마 LUT 를 써서 스테이지 순서/청크 버그가
// 결과 동일성으로 가려지지 않게 한다(wgsl-variants-browser.test.ts 와 동일 장치).
// ---------------------------------------------------------------------------

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

const CHAIN_OPS: readonly WgslFilterOpSpec[] = [
  { op: "brightness-contrast", brightness: 0.2 },
  { op: "brightness-contrast", contrast: 15 },
  { op: "hsl", hue: 30, saturation: 0.4, luminance: 0.05 },
  { op: "levels", lut: gammaLut3([0.8, 1.1, 1.35]) },
  { op: "curves", lut: gammaLut3([1.25, 0.9, 0.7]) },
];

// 결정적 테스트 픽셀 — 브라우저측 evaluate 안의 LCG 와 반드시 동일해야 한다
// (같은 시드·같은 점화식, CPU 참조가 이 픽셀로 계산된다).
function deterministicPixels(pixelCount: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixelCount * 4);
  let state = 0x2f6e2b1;
  for (let i = 0; i < data.length; i += 1) {
    state = (Math.imul(state, 48271) + 11) >>> 0;
    data[i] = state & 0xff;
  }
  return data;
}

interface VariantGpuPayload {
  key: string;
  wgsl: string;
  entryPoint: string;
  uniformBytes: number[];
  lutWords: number[] | null;
}

function gpuPayload(ops: readonly WgslFilterOpSpec[]): VariantGpuPayload {
  const variant = composeWgslVariant(ops);
  const uniform = packWgslVariantUniform(ops);
  patchWgslVariantPixelCount(uniform, PIXEL_COUNT);
  const lut = packWgslVariantLut(ops);
  return {
    key: variant.variantKey,
    wgsl: variant.wgsl,
    entryPoint: variant.entryPoint,
    uniformBytes: [...new Uint8Array(uniform)],
    lutWords: lut === null ? null : [...lut],
  };
}

// ---------------------------------------------------------------------------
// 통계 — 병행 부하(24h 소크)가 도는 머신에서의 실측이므로 중앙값 기반으로
// 요약하고, jank 프록시는 표준편차와 p99/p50 비율 두 가지를 함께 기록한다.
// ---------------------------------------------------------------------------

interface FrameStats {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  stddev: number;
  min: number;
  max: number;
  jankP99OverP50: number;
}

function percentile(sorted: readonly number[], p: number): number {
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[rank]!;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

function summarizeFrames(samples: readonly number[]): FrameStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance =
    samples.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) /
    (samples.length - 1);
  const p50 = percentile(sorted, 50);
  const p99 = percentile(sorted, 99);
  return {
    p50: round3(p50),
    p95: round3(percentile(sorted, 95)),
    p99: round3(p99),
    mean: round3(mean),
    stddev: round3(Math.sqrt(variance)),
    min: round3(sorted[0]!),
    max: round3(sorted[sorted.length - 1]!),
    jankP99OverP50: round3(p99 / p50),
  };
}

interface DiffStats {
  maxColorDiff: number;
  mismatchedColorChannels: number;
  alphaMismatches: number;
}

function diffStats(
  actual: Uint8Array,
  expected: Uint8Array | Uint8ClampedArray,
): DiffStats {
  let maxColorDiff = 0;
  let mismatchedColorChannels = 0;
  let alphaMismatches = 0;
  for (let i = 0; i < expected.length; i += 1) {
    const diff = Math.abs(actual[i]! - expected[i]!);
    if (i % 4 === 3) {
      if (diff !== 0) alphaMismatches += 1;
      continue;
    }
    if (diff > 0) mismatchedColorChannels += 1;
    if (diff > maxColorDiff) maxColorDiff = diff;
  }
  return { maxColorDiff, mismatchedColorChannels, alphaMismatches };
}

async function startHarnessServer(): Promise<{
  server: MinimalHttpServer;
  baseUrl: string;
}> {
  const { createServer } = (await dynamicImport("node:http")) as NodeHttpModule;
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      "<!doctype html><html><head><title>wgsl pipeline probe</title></head><body></body></html>",
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

interface PipelineProbePayload {
  pipelineCreateMsA: number[];
  pipelineCreateMsB: number[];
  frameMsA: number[];
  frameMsB: number[];
  timestampQueryAvailable: boolean;
  gpuSamplesA: Array<{ sumMs: number; spanMs: number }>;
  gpuSamplesB: number[];
  outputABase64: string;
  outputBBase64: string;
}

/**
 * gpu-browser-probe / wgsl-variants-browser 와 동일한 런치 후보열 — 번들
 * headless shell 의 WebGPU 지원이 갈리므로 system chrome 까지 순서대로 시도.
 */
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

describeProbe("wgsl variant pipeline count / jank real-browser probe", () => {
  let server: MinimalHttpServer;
  let baseUrl: string;
  let browser: Browser | undefined;
  let page: Page;
  let launchLabel = "";
  let probe: ProbePayload = { supported: false, reason: "probe not run" };
  let loadavgBeforeLaunch: number[] = [];

  beforeAll(async () => {
    const os = (await dynamicImport("node:os")) as NodeOsModule;
    loadavgBeforeLaunch = os.loadavg();
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
    "measures 5-pipeline static-path emulation vs 1-pipeline fused variant and records the result",
    async () => {
      expect(
        probe.supported,
        `no WebGPU adapter in any launch configuration — last probe: ${JSON.stringify(probe)}`,
      ).toBe(true);
      if (browser === undefined) throw new Error("unreachable: probe passed without browser");

      // ── 0) 페이로드 — A: 단일 연산 variant 5개, B: 5연산 융합 variant 1개 ──
      const singles = CHAIN_OPS.map((op) => gpuPayload([op]));
      const fused = gpuPayload(CHAIN_OPS);
      expect(singles).toHaveLength(5);

      // ── 1) 브라우저 실측 — 파이프라인 생성 시간 + 교차 프레임 루프 ────────
      const payload = (await page.evaluate(
        async (input: {
          singles: Array<{
            wgsl: string;
            entryPoint: string;
            uniformBytes: number[];
            lutWords: number[] | null;
          }>;
          fused: {
            wgsl: string;
            entryPoint: string;
            uniformBytes: number[];
            lutWords: number[] | null;
          };
          pixelCount: number;
          rowThreads: number;
          workgroupSize: number;
          totalFrames: number;
        }) => {
          const adapter = await navigator.gpu.requestAdapter();
          if (!adapter) throw new Error("no adapter during pipeline probe");
          // GPU 패스 실행 시간 보조 계측 — 어댑터가 지원할 때만 요청(미지원이면
          // 벽시계 계측만 수행하고 JSON 에 미지원으로 기록).
          const hasTimestamps = adapter.features.has("timestamp-query");
          const device = await adapter.requestDevice(
            hasTimestamps ? { requiredFeatures: ["timestamp-query"] } : {},
          );
          const byteLength = input.pixelCount * 4;

          // WebGPU 명세 고정 상수 — GPUBufferUsage/GPUMapMode 전역은 이
          // tsconfig lib 집합에 없다(wgsl-variants-browser.test.ts 와 동일 규약).
          const USAGE_MAP_READ = 0x0001;
          const USAGE_COPY_SRC = 0x0004;
          const USAGE_COPY_DST = 0x0008;
          const USAGE_UNIFORM = 0x0040;
          const USAGE_STORAGE = 0x0080;
          const MAP_MODE_READ = 0x0001;

          // 결정적 소스 픽셀 — node 측 deterministicPixels 와 동일 LCG.
          const src = new Uint8Array(byteLength);
          let state = 0x2f6e2b1;
          for (let i = 0; i < src.length; i += 1) {
            state = (Math.imul(state, 48271) + 11) >>> 0;
            src[i] = state & 0xff;
          }

          const srcBuffer = device.createBuffer({
            size: byteLength,
            usage: USAGE_STORAGE | USAGE_COPY_DST,
          });
          device.queue.writeBuffer(srcBuffer, 0, src);
          // A 경로 중간 버퍼 핑퐁 2개(마지막 출력은 ping) + B 경로 출력 1개.
          const ping = device.createBuffer({
            size: byteLength,
            usage: USAGE_STORAGE | USAGE_COPY_SRC,
          });
          const pong = device.createBuffer({
            size: byteLength,
            usage: USAGE_STORAGE | USAGE_COPY_SRC,
          });
          const dstFused = device.createBuffer({
            size: byteLength,
            usage: USAGE_STORAGE | USAGE_COPY_SRC,
          });

          const makeUniform = (bytes: number[]): GPUBuffer => {
            const buffer = device.createBuffer({
              size: bytes.length,
              usage: USAGE_UNIFORM | USAGE_COPY_DST,
            });
            device.queue.writeBuffer(buffer, 0, new Uint8Array(bytes));
            return buffer;
          };
          const makeLut = (words: number[] | null): GPUBuffer | null => {
            if (words === null) return null;
            const buffer = device.createBuffer({
              size: words.length * 4,
              usage: USAGE_STORAGE | USAGE_COPY_DST,
            });
            device.queue.writeBuffer(buffer, 0, new Uint32Array(words));
            return buffer;
          };

          // 셰이더 모듈은 비계측 생성, createComputePipelineAsync 만 계측한다.
          const singleModules = input.singles.map((variant) =>
            device.createShaderModule({ code: variant.wgsl }),
          );
          const fusedModule = device.createShaderModule({ code: input.fused.wgsl });

          const pipelineCreateMsA: number[] = [];
          const singlePipelines: GPUComputePipeline[] = [];
          for (let i = 0; i < input.singles.length; i += 1) {
            const start = performance.now();
            const pipeline = await device.createComputePipelineAsync({
              layout: "auto",
              compute: {
                module: singleModules[i]!,
                entryPoint: input.singles[i]!.entryPoint,
              },
            });
            pipelineCreateMsA.push(performance.now() - start);
            singlePipelines.push(pipeline);
          }
          const fusedStart = performance.now();
          const fusedPipeline = await device.createComputePipelineAsync({
            layout: "auto",
            compute: { module: fusedModule, entryPoint: input.fused.entryPoint },
          });
          const pipelineCreateMsB = [performance.now() - fusedStart];

          // A 디스패치 연쇄: src→ping→pong→ping→pong→ping (최종 출력 ping).
          const chainSources = [srcBuffer, ping, pong, ping, pong];
          const chainTargets = [ping, pong, ping, pong, ping];
          const singleBindGroups = singlePipelines.map((pipeline, i) => {
            const uniformBuffer = makeUniform(input.singles[i]!.uniformBytes);
            const lutBuffer = makeLut(input.singles[i]!.lutWords);
            const entries: GPUBindGroupEntry[] = [
              { binding: 0, resource: { buffer: chainSources[i]! } },
              { binding: 1, resource: { buffer: chainTargets[i]! } },
              { binding: 2, resource: { buffer: uniformBuffer } },
            ];
            if (lutBuffer !== null) {
              entries.push({ binding: 3, resource: { buffer: lutBuffer } });
            }
            return device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries,
            });
          });
          const fusedUniform = makeUniform(input.fused.uniformBytes);
          const fusedLut = makeLut(input.fused.lutWords);
          const fusedEntries: GPUBindGroupEntry[] = [
            { binding: 0, resource: { buffer: srcBuffer } },
            { binding: 1, resource: { buffer: dstFused } },
            { binding: 2, resource: { buffer: fusedUniform } },
          ];
          if (fusedLut !== null) {
            fusedEntries.push({ binding: 3, resource: { buffer: fusedLut } });
          }
          const fusedBindGroup = device.createBindGroup({
            layout: fusedPipeline.getBindGroupLayout(0),
            entries: fusedEntries,
          });

          const workgroupsX = input.rowThreads / input.workgroupSize;
          const workgroupsY = Math.ceil(input.pixelCount / input.rowThreads);

          const frameStatic = async (): Promise<number> => {
            const start = performance.now();
            const encoder = device.createCommandEncoder();
            for (let i = 0; i < singlePipelines.length; i += 1) {
              const pass = encoder.beginComputePass();
              pass.setPipeline(singlePipelines[i]!);
              pass.setBindGroup(0, singleBindGroups[i]!);
              pass.dispatchWorkgroups(workgroupsX, workgroupsY);
              pass.end();
            }
            device.queue.submit([encoder.finish()]);
            await device.queue.onSubmittedWorkDone();
            return performance.now() - start;
          };
          const frameFused = async (): Promise<number> => {
            const start = performance.now();
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(fusedPipeline);
            pass.setBindGroup(0, fusedBindGroup);
            pass.dispatchWorkgroups(workgroupsX, workgroupsY);
            pass.end();
            device.queue.submit([encoder.finish()]);
            await device.queue.onSubmittedWorkDone();
            return performance.now() - start;
          };

          // A/B 프레임을 반복마다 교차 — 병행 부하 드리프트가 한 방식에만
          // 실리지 않게 한다(워밍업 컷은 node 측에서 프레임 인덱스로 수행).
          const frameMsA: number[] = [];
          const frameMsB: number[] = [];
          for (let frame = 0; frame < input.totalFrames; frame += 1) {
            frameMsA.push(await frameStatic());
            frameMsB.push(await frameFused());
          }

          // GPU 패스 실행 시간 보조 계측(timestamp-query) — 벽시계 루프를
          // 오염시키지 않도록 별도 페이즈로 같은 프레임 수만큼 교차 실행한다.
          // A 는 5개 패스 각각의 begin/end(쿼리 10개)로 "패스 합"과
          // "첫 begin→마지막 end 스팬"을, B 는 단일 패스(쿼리 2개)를 잰다.
          const gpuSamplesA: Array<{ sumMs: number; spanMs: number }> = [];
          const gpuSamplesB: number[] = [];
          if (hasTimestamps) {
            const USAGE_QUERY_RESOLVE = 0x0200;
            const querySetA = device.createQuerySet({ type: "timestamp", count: 10 });
            const querySetB = device.createQuerySet({ type: "timestamp", count: 2 });
            const resolveA = device.createBuffer({
              size: 10 * 8,
              usage: USAGE_QUERY_RESOLVE | USAGE_COPY_SRC,
            });
            const resolveB = device.createBuffer({
              size: 2 * 8,
              usage: USAGE_QUERY_RESOLVE | USAGE_COPY_SRC,
            });
            const stagingTsA = device.createBuffer({
              size: 10 * 8,
              usage: USAGE_COPY_DST | USAGE_MAP_READ,
            });
            const stagingTsB = device.createBuffer({
              size: 2 * 8,
              usage: USAGE_COPY_DST | USAGE_MAP_READ,
            });

            const timedStatic = async (): Promise<{ sumMs: number; spanMs: number }> => {
              const encoder = device.createCommandEncoder();
              for (let i = 0; i < singlePipelines.length; i += 1) {
                const pass = encoder.beginComputePass({
                  timestampWrites: {
                    querySet: querySetA,
                    beginningOfPassWriteIndex: i * 2,
                    endOfPassWriteIndex: i * 2 + 1,
                  },
                });
                pass.setPipeline(singlePipelines[i]!);
                pass.setBindGroup(0, singleBindGroups[i]!);
                pass.dispatchWorkgroups(workgroupsX, workgroupsY);
                pass.end();
              }
              encoder.resolveQuerySet(querySetA, 0, 10, resolveA, 0);
              encoder.copyBufferToBuffer(resolveA, 0, stagingTsA, 0, 10 * 8);
              device.queue.submit([encoder.finish()]);
              await stagingTsA.mapAsync(MAP_MODE_READ);
              const stamps = new BigUint64Array(stagingTsA.getMappedRange().slice(0));
              stagingTsA.unmap();
              let sumNs = 0;
              for (let i = 0; i < 5; i += 1) {
                sumNs += Math.max(0, Number(stamps[i * 2 + 1]! - stamps[i * 2]!));
              }
              const spanNs = Math.max(0, Number(stamps[9]! - stamps[0]!));
              return { sumMs: sumNs / 1e6, spanMs: spanNs / 1e6 };
            };
            const timedFused = async (): Promise<number> => {
              const encoder = device.createCommandEncoder();
              const pass = encoder.beginComputePass({
                timestampWrites: {
                  querySet: querySetB,
                  beginningOfPassWriteIndex: 0,
                  endOfPassWriteIndex: 1,
                },
              });
              pass.setPipeline(fusedPipeline);
              pass.setBindGroup(0, fusedBindGroup);
              pass.dispatchWorkgroups(workgroupsX, workgroupsY);
              pass.end();
              encoder.resolveQuerySet(querySetB, 0, 2, resolveB, 0);
              encoder.copyBufferToBuffer(resolveB, 0, stagingTsB, 0, 2 * 8);
              device.queue.submit([encoder.finish()]);
              await stagingTsB.mapAsync(MAP_MODE_READ);
              const stamps = new BigUint64Array(stagingTsB.getMappedRange().slice(0));
              stagingTsB.unmap();
              return Math.max(0, Number(stamps[1]! - stamps[0]!)) / 1e6;
            };
            for (let frame = 0; frame < input.totalFrames; frame += 1) {
              gpuSamplesA.push(await timedStatic());
              gpuSamplesB.push(await timedFused());
            }
          }

          // 출력 리드백 — 마지막 프레임 결과(매 프레임 동일 입력·동일 결과).
          const readbackA = device.createBuffer({
            size: byteLength,
            usage: USAGE_COPY_DST | USAGE_MAP_READ,
          });
          const readbackB = device.createBuffer({
            size: byteLength,
            usage: USAGE_COPY_DST | USAGE_MAP_READ,
          });
          const encoder = device.createCommandEncoder();
          encoder.copyBufferToBuffer(ping, 0, readbackA, 0, byteLength);
          encoder.copyBufferToBuffer(dstFused, 0, readbackB, 0, byteLength);
          device.queue.submit([encoder.finish()]);
          await readbackA.mapAsync(MAP_MODE_READ);
          const bytesA = new Uint8Array(readbackA.getMappedRange()).slice();
          readbackA.unmap();
          await readbackB.mapAsync(MAP_MODE_READ);
          const bytesB = new Uint8Array(readbackB.getMappedRange()).slice();
          readbackB.unmap();
          device.destroy();

          // 1MB 리드백 × 2 는 number[] 직렬화가 무거우므로 base64 로 반환.
          const toBase64 = (bytes: Uint8Array): string => {
            let binary = "";
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
              binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
            }
            return btoa(binary);
          };

          return {
            pipelineCreateMsA,
            pipelineCreateMsB,
            frameMsA,
            frameMsB,
            timestampQueryAvailable: hasTimestamps,
            gpuSamplesA,
            gpuSamplesB,
            outputABase64: toBase64(bytesA),
            outputBBase64: toBase64(bytesB),
          };
        },
        {
          singles: singles.map((variant) => ({
            wgsl: variant.wgsl,
            entryPoint: variant.entryPoint,
            uniformBytes: variant.uniformBytes,
            lutWords: variant.lutWords,
          })),
          fused: {
            wgsl: fused.wgsl,
            entryPoint: fused.entryPoint,
            uniformBytes: fused.uniformBytes,
            lutWords: fused.lutWords,
          },
          pixelCount: PIXEL_COUNT,
          rowThreads: WGSL_VARIANT_DISPATCH_ROW_THREADS,
          workgroupSize: WGSL_VARIANT_WORKGROUP_SIZE,
          totalFrames: TOTAL_FRAMES,
        },
      )) as PipelineProbePayload;

      const os = (await dynamicImport("node:os")) as NodeOsModule;
      const loadavgAfterMeasurement = os.loadavg();

      // ── 2) 파이프라인 수(정의적) + 프레임 배열 형태 검증 ──────────────────
      expect(payload.pipelineCreateMsA).toHaveLength(5);
      expect(payload.pipelineCreateMsB).toHaveLength(1);
      expect(payload.frameMsA).toHaveLength(TOTAL_FRAMES);
      expect(payload.frameMsB).toHaveLength(TOTAL_FRAMES);
      for (const sample of [...payload.frameMsA, ...payload.frameMsB]) {
        expect(Number.isFinite(sample)).toBe(true);
        expect(sample).toBeGreaterThan(0);
      }

      // ── 3) 출력 픽셀 동일성 — A vs B vs CPU 참조 ─────────────────────────
      const { Buffer } = (await dynamicImport("node:buffer")) as NodeBufferModule;
      const outputA = Buffer.from(payload.outputABase64, "base64");
      const outputB = Buffer.from(payload.outputBBase64, "base64");
      const srcPixels = deterministicPixels(PIXEL_COUNT);
      const cpuReference = evaluateVariantOnPixels(CHAIN_OPS, srcPixels);
      expect(outputA).toHaveLength(cpuReference.length);
      expect(outputB).toHaveLength(cpuReference.length);
      const staticVsCpu = diffStats(outputA, cpuReference);
      const fusedVsCpu = diffStats(outputB, cpuReference);
      const staticVsFused = diffStats(outputA, outputB);

      // ── 4) 통계 요약 + 실측 기록(성능은 단언 없이 그대로 기록) ────────────
      const measuredA = payload.frameMsA.slice(WARMUP_FRAMES);
      const measuredB = payload.frameMsB.slice(WARMUP_FRAMES);
      const frameA = summarizeFrames(measuredA);
      const frameB = summarizeFrames(measuredB);
      const createTotalA = payload.pipelineCreateMsA.reduce((sum, ms) => sum + ms, 0);
      const createTotalB = payload.pipelineCreateMsB.reduce((sum, ms) => sum + ms, 0);

      const gpuAvailable =
        payload.timestampQueryAvailable &&
        payload.gpuSamplesA.length === TOTAL_FRAMES &&
        payload.gpuSamplesB.length === TOTAL_FRAMES;
      const gpuStaticSum = gpuAvailable
        ? summarizeFrames(payload.gpuSamplesA.slice(WARMUP_FRAMES).map((s) => s.sumMs))
        : null;
      const gpuStaticSpan = gpuAvailable
        ? summarizeFrames(payload.gpuSamplesA.slice(WARMUP_FRAMES).map((s) => s.spanMs))
        : null;
      const gpuFused = gpuAvailable
        ? summarizeFrames(payload.gpuSamplesB.slice(WARMUP_FRAMES))
        : null;

      // Chromium performance.now() 는 100µs 로 조대화된다 — 벽시계 p50 차이가
      // 이 해상도 이내면 "감소"도 "악화"도 아닌 플로어 동률로 판정한다.
      const TIMER_RESOLUTION_MS = 0.1;
      const wallClockVerdict =
        frameB.p50 < frameA.p50 - TIMER_RESOLUTION_MS
          ? "reduced"
          : frameB.p50 > frameA.p50 + TIMER_RESOLUTION_MS
            ? "regressed"
            : "parity-at-sync-floor";
      const gpuExecutionReduced =
        gpuStaticSum !== null && gpuFused !== null ? gpuFused.p50 < gpuStaticSum.p50 : null;
      const wallClockJankReduced =
        frameB.stddev < frameA.stddev ||
        frameB.jankP99OverP50 < frameA.jankP99OverP50;

      const gate = {
        criterion:
          "파이프라인 수 감소(정의적 5→1) + jank 감소 실측(벽시계 프레임 stddev·p99/p50, 최초 사용 파이프라인 생성 스톨, GPU 패스 실행 시간)",
        pipelineCountReduced: true,
        pipelineCreateTimeReduced: createTotalB < createTotalA,
        wallClockFrame: {
          timerResolutionMs: TIMER_RESOLUTION_MS,
          p50DeltaMs: round3(frameB.p50 - frameA.p50),
          frameP50Reduced: frameB.p50 < frameA.p50,
          jankStddevReduced: frameB.stddev < frameA.stddev,
          jankP99OverP50Reduced: frameB.jankP99OverP50 < frameA.jankP99OverP50,
          jankReduced: wallClockJankReduced,
          verdict: wallClockVerdict,
          note: "512² 체인의 GPU 실행(수백µs)이 submit→onSubmittedWorkDone 왕복(~2.5ms)에 가려져 두 방식 모두 같은 측정 플로어에 앉는다 — 벽시계 프레임/jank 차이는 타이머 해상도(100µs) 이내",
        },
        gpuExecution: {
          available: gpuAvailable,
          reduced: gpuExecutionReduced,
        },
        passed: false,
      };
      gate.passed = passesPipelinePromotionGate({
        pipelineCountReduced: gate.pipelineCountReduced,
        pipelineCreateTimeReduced: gate.pipelineCreateTimeReduced,
        wallClockJankReduced,
        gpuExecutionReduced,
      });

      const report = {
        harness:
          "packages/studio-engine-registry/src/__tests__/wgsl-variants-pipeline-probe.test.ts (WGSL_VARIANT_PIPELINE_PROBE=1)",
        note: "V12 lane 5 (WESL_SHADER_PLATFORM) 마지막 재개 게이트 근거 — 512² RGBA 5연산 체인(밝기→대비→HSL→레벨→커브): 정적 커널 경로 모사(파이프라인 5·프레임당 5디스패치 핑퐁) vs 융합 variant(파이프라인 1·1디스패치) 실측",
        measuredAt: new Date().toISOString(),
        browser: { launch: launchLabel, version: browser.version() },
        adapter: probe.adapter ?? null,
        concurrentLoad: {
          note: "24h 소크(pnpm run soak:studio-engine → tests/benchmarks/harness/soak.ts + vitest fork workers)가 측정 내내 이 머신에서 병행 실행 중 — 절대 시간은 부풀려질 수 있어 A/B 프레임 교차 실행 + 중앙값(p50) 기반 비교로 설계했다",
          loadavgBeforeLaunch: loadavgBeforeLaunch.map(round3),
          loadavgAfterMeasurement: loadavgAfterMeasurement.map(round3),
          cpuCount: os.cpus().length,
        },
        config: {
          image: `${IMAGE_SIZE}x${IMAGE_SIZE} RGBA (deterministic LCG)`,
          pixelCount: PIXEL_COUNT,
          chain: ["brightness", "contrast", "hsl", "levels", "curves"],
          totalFramesPerApproach: TOTAL_FRAMES,
          warmupFramesExcluded: WARMUP_FRAMES,
          measuredFrames: measuredA.length,
          frameSync: "device.queue.onSubmittedWorkDone() per frame",
          scheduling:
            "A/B frames interleaved per iteration (background-load drift fairness)",
          gpuTiming: gpuAvailable
            ? "timestamp-query — 별도 페이즈에서 동일 프레임 수 교차 계측(A: 패스 5개 begin/end 10쿼리 → 합·스팬, B: 단일 패스 2쿼리)"
            : "unavailable — adapter lacks timestamp-query",
        },
        approaches: {
          staticPathEmulation: {
            pipelineCount: payload.pipelineCreateMsA.length,
            dispatchesPerFrame: 5,
            intermediateBuffers: "ping-pong x2",
            variantKeys: singles.map((variant) => variant.key),
            pipelineCreate: {
              totalMs: round3(createTotalA),
              perPipelineMs: payload.pipelineCreateMsA.map(round3),
            },
            frame: frameA,
            frameSamplesMs: measuredA.map(round3),
            gpuExecutionMs:
              gpuStaticSum !== null && gpuStaticSpan !== null
                ? { passSum: gpuStaticSum, firstBeginToLastEndSpan: gpuStaticSpan }
                : null,
          },
          fusedVariant: {
            pipelineCount: payload.pipelineCreateMsB.length,
            dispatchesPerFrame: 1,
            intermediateBuffers: "none",
            variantKey: fused.key,
            pipelineCreate: {
              totalMs: round3(createTotalB),
              perPipelineMs: payload.pipelineCreateMsB.map(round3),
            },
            frame: frameB,
            frameSamplesMs: measuredB.map(round3),
            gpuExecutionMs: gpuFused !== null ? { pass: gpuFused } : null,
          },
        },
        comparison: {
          pipelineCountReduction: "5 → 1 (-80%)",
          pipelineCreateTotalRatioAOverB: round3(createTotalA / createTotalB),
          frameP50SpeedupAOverB: round3(frameA.p50 / frameB.p50),
          frameP95SpeedupAOverB: round3(frameA.p95 / frameB.p95),
          frameP99SpeedupAOverB: round3(frameA.p99 / frameB.p99),
          jankStddevRatioAOverB: round3(frameA.stddev / frameB.stddev),
          jankP99OverP50: { staticPath: frameA.jankP99OverP50, fused: frameB.jankP99OverP50 },
          gpuExecutionP50SpeedupAOverB:
            gpuStaticSum !== null && gpuFused !== null && gpuFused.p50 > 0
              ? round3(gpuStaticSum.p50 / gpuFused.p50)
              : null,
        },
        pixelParity: {
          tolerancePerChannel: CHANNEL_TOLERANCE,
          totalColorChannels: PIXEL_COUNT * 3,
          staticVsCpu,
          fusedVsCpu,
          staticVsFused,
        },
        gate,
      };
      const { writeFile } = (await dynamicImport(
        "node:fs/promises",
      )) as NodeFsPromisesModule;
      await writeFile(RESULTS_URL, `${JSON.stringify(report, null, 2)}\n`);

      // ── 5) 정합성 단언(성능이 아니라 정확성만 게이트) ─────────────────────
      expect(
        staticVsCpu.alphaMismatches,
        "static-path alpha channels must match CPU reference exactly",
      ).toBe(0);
      expect(
        fusedVsCpu.alphaMismatches,
        "fused alpha channels must match CPU reference exactly",
      ).toBe(0);
      expect(
        staticVsCpu.maxColorDiff,
        `static-path/CPU divergence ${staticVsCpu.maxColorDiff} exceeds ±${CHANNEL_TOLERANCE}/255`,
      ).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
      expect(
        fusedVsCpu.maxColorDiff,
        `fused/CPU divergence ${fusedVsCpu.maxColorDiff} exceeds ±${CHANNEL_TOLERANCE}/255`,
      ).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
      expect(
        staticVsFused.maxColorDiff,
        `static-path/fused divergence ${staticVsFused.maxColorDiff} exceeds ±${CHANNEL_TOLERANCE}/255`,
      ).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
    },
    240_000,
  );
});
