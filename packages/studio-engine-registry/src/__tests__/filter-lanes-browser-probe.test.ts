import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { planStudioGpuFilterChain } from "../../../../src/domains/creator/studio-gpu-filter-apply";
import {
  STUDIO_GPU_FILTER_BINDINGS,
  STUDIO_GPU_FILTER_DISPATCH_ROW_THREADS,
  STUDIO_GPU_FILTER_KERNELS,
  STUDIO_GPU_FILTER_WORKGROUP_SIZE,
} from "../../../../src/domains/creator/studio-gpu-filter-kernels";
import {
  applyImageFilters,
  buildImageFilters,
  registerStudioKonvaFilters,
  type KonvaLike,
} from "../../../../src/domains/creator/studio-konva-filters";

import type { StudioGpuFilterPlan } from "../../../../src/domains/creator/studio-gpu-filter-apply";
import type { ImageFilterFields } from "../../../../src/domains/creator/studio-konva-filter-fields";
import type { Browser, Page } from "playwright";

/**
 * **Production filter GPU-lane probe** — tests/benchmarks/harness/filter-lanes.ts 의 GPU 짝.
 *
 * 하니스는 프로덕션 폴백 사슬(`gpu-chain → worker → konva-native`) 중 CPU/Worker 두 레인을
 * node 에서 잰다. GPU 레인은 WebGPU 가 필요해 node 에서 잴 수 없으므로, 이 옵트인 프로브가
 * 실제 브라우저에서 **프로덕션 커널·프로덕션 planner** 로 같은 매트릭스(1024²/2048²/4096² ×
 * 1단/3단/5단 체인)를 재고 같은 JSON(tests/benchmarks/results/filter-lanes.json)의
 * `gpuLanes`/`crossover` 를 채워 넣는다.
 *
 * 실행:
 *   FILTER_LANE_PROBE=1 pnpm exec vitest run \
 *     packages/studio-engine-registry/src/__tests__/filter-lanes-browser-probe.test.ts
 * (플래그가 없으면 통째로 skip — 기본 vitest 스코프를 브라우저에 묶지 않는다.)
 *
 * 무엇이 프로덕션 그대로이고 무엇이 프로브 코드인가(정직성):
 *  - WGSL 커널 소스·바인딩 인덱스·워크그룹/디스패치 좌표계: `studio-gpu-filter-kernels.ts` 실물.
 *  - 스텝 열(순서·LUT 내용·융합 여부): `planStudioGpuFilterChain` 실물.
 *  - CPU 참조 픽셀: `buildImageFilters` + `applyImageFilters` 실물(Worker 안 레지스트리와 동일
 *    구성 = 하니스 `direct-cpu` 레인과 같은 픽셀).
 *  - 디스패치 루프/버퍼 핑퐁/리드백은 `applyGpuFilterChain` 의 절차를 페이지 안에서 그대로
 *    재현한 것이다(applyGpuFilterChain 자체는 번들이 필요해 페이지에 넣을 수 없다).
 *    프로브가 재현한 부분은 결과 JSON 에도 명시된다.
 *
 * 측정 플로어 분리: 512² 프로브(wgsl-variants-pipeline.json)에서 submit→onSubmittedWorkDone
 * 왕복(~2.5ms)이 작은 작업의 GPU 실행을 통째로 가리는 것이 관측됐다. 그래서 이 프로브는
 *  (a) `dispatchMs` — 인코드+submit+onSubmittedWorkDone (동기화 플로어 포함),
 *  (b) `applyMs`    — 업로드+디스패치+리드백 = applyGpuFilterChain 이 실제로 무는 비용,
 *  (c) `gpuPassMs`  — timestamp-query 로 잰 **순수 GPU 패스 실행 시간**(플로어 제외)
 * 세 가지를 따로 기록한다. 레인 전환 임계(GPU vs Worker)는 (b) 로 판정한다 — 프로덕션이
 * 실제로 지불하는 비용이 그것이기 때문이다.
 */

const ENABLED =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.FILTER_LANE_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;

const RESULTS_URL = new URL(
  "../../../../tests/benchmarks/results/filter-lanes.json",
  import.meta.url,
);

// ---------------------------------------------------------------------------
// node 내장 모듈 접근 — 이 패키지 tsconfig 는 @types/node 를 포함하지 않으므로
// (types 필드 없음 + 패키지 devDep 없음) 정적 `node:*` import 는 타입 해석이 안 된다.
// 런타임(vitest, node)에는 당연히 존재하므로 변수 지정자 동적 import + 최소 구조 타입으로
// 접근한다(wgsl-variants-pipeline-probe.test.ts 와 동일 우회).
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
  readFile(path: URL, encoding: "utf8"): Promise<string>;
}

interface NodeOsModule {
  loadavg(): number[];
  cpus(): unknown[];
}

// ---------------------------------------------------------------------------
// 매트릭스 — tests/benchmarks/harness/filter-lanes.ts 와 **같은 크기·같은 체인·같은 소스 픽셀**
// (LCG 시드·점화식 동일). 두 파일의 수치가 한 표에서 비교되려면 반드시 일치해야 한다.
// ---------------------------------------------------------------------------

interface SizeSpec {
  readonly size: number;
  readonly warmup: number;
  readonly iterations: number;
  /** 전체 픽셀 diff 를 node 로 가져올지 — 큰 캔버스는 CDP 직렬화가 과해 스트라이드 표본만 쓴다. */
  readonly fullPixelDiff: boolean;
}

const SIZES: readonly SizeSpec[] = [
  { size: 256, warmup: 5, iterations: 30, fullPixelDiff: true },
  { size: 512, warmup: 4, iterations: 25, fullPixelDiff: true },
  { size: 1024, warmup: 3, iterations: 20, fullPixelDiff: true },
  { size: 2048, warmup: 2, iterations: 12, fullPixelDiff: false },
  { size: 4096, warmup: 1, iterations: 8, fullPixelDiff: false },
];

/** 큰 캔버스 품질 표본 — 소수 스트라이드로 픽셀을 고르게 훑는다(정렬 아티팩트 회피). */
const PIXEL_SAMPLE_STRIDE = 1009;

interface ChainSpec {
  readonly id: string;
  readonly label: string;
  readonly el: ImageFilterFields;
}

const CHAINS: readonly ChainSpec[] = [
  { id: "single", label: "밝기 1단", el: { brightness: 0.2 } },
  {
    id: "triple",
    label: "밝기+대비+HSL 3단",
    el: { brightness: 0.2, contrast: 15, saturation: 0.4, hue: 30 },
  },
  {
    id: "full5",
    label: "밝기/대비+HSL+레벨+커브+컬러밸런스 5단 풀체인",
    el: {
      brightness: 0.2,
      contrast: 15,
      saturation: 0.4,
      hue: 30,
      levelsBlack: 12,
      levelsWhite: 240,
      levelsGamma: 1.15,
      curve: [
        { x: 0, y: 0 },
        { x: 64, y: 48 },
        { x: 192, y: 214 },
        { x: 255, y: 255 },
      ],
      colorBalance: {
        shadows: [12, -6, -18],
        midtones: [-8, 4, 14],
        highlights: [18, 2, -10],
      },
    },
  },
];

/**
 * 프로덕션 planner 는 인접 LUT 스텝을 항상 융합한다. 같은 필드를 커널 그룹별로 따로 계획해
 * 이어붙이면 융합 **이전**의 스텝 열(= 정적 커널 경로)이 그대로 재구성된다 — 순서도
 * buildImageFilters 순서 그대로다. 하니스의 `unfusedDispatchCount` 와 동일한 구성.
 */
function unfusedPlan(el: ImageFilterFields): StudioGpuFilterPlan {
  const groups: ImageFilterFields[] = [
    { brightness: el.brightness, contrast: el.contrast },
    { saturation: el.saturation, hue: el.hue },
    {
      levelsBlack: el.levelsBlack,
      levelsWhite: el.levelsWhite,
      levelsGamma: el.levelsGamma,
      levelsOutBlack: el.levelsOutBlack,
      levelsOutWhite: el.levelsOutWhite,
      levelsCh: el.levelsCh,
    },
    { curve: el.curve, curveCh: el.curveCh },
    { colorBalance: el.colorBalance },
  ];
  const steps: StudioGpuFilterPlan[number][] = [];
  for (const group of groups) {
    for (const step of planStudioGpuFilterChain(group) ?? []) steps.push(step);
  }
  return steps;
}

// ---------------------------------------------------------------------------
// 페이지로 넘기는 직렬화 페이로드 — 커널 WGSL/uniform/LUT 는 전부 프로덕션 산출물이다.
// ---------------------------------------------------------------------------

interface SerializedStep {
  readonly kernelId: string;
  readonly shaderId: string;
  readonly wgsl: string;
  readonly entryPoint: string;
  readonly usesLut: boolean;
  readonly uniformBytes: number[];
  readonly lutWords: number[] | null;
}

function serializePlan(plan: StudioGpuFilterPlan, pixelCount: number): SerializedStep[] {
  return plan.map((step) => {
    const kernel = STUDIO_GPU_FILTER_KERNELS[
      step.kernelId as keyof typeof STUDIO_GPU_FILTER_KERNELS
    ];
    // apply 와 동일하게 uniform 사본의 pixelCount(offset 0, u32 LE)만 요청별로 패치한다.
    const uniform = step.uniform.slice(0);
    new DataView(uniform).setUint32(0, pixelCount >>> 0, true);
    return {
      kernelId: step.kernelId,
      shaderId: kernel.shaderId,
      wgsl: kernel.wgsl,
      entryPoint: kernel.entryPoint,
      usesLut: kernel.usesLut,
      uniformBytes: [...new Uint8Array(uniform)],
      lutWords: step.lut ? [...step.lut] : null,
    };
  });
}

// ---------------------------------------------------------------------------
// CPU 참조 — 하니스 `direct-cpu` 레인과 동일 구성(빈 레지스트리 + 네이티브 포팅).
// ---------------------------------------------------------------------------

const nativeRegistry: KonvaLike = { Filters: {} };
registerStudioKonvaFilters(nativeRegistry);

function deterministicPixels(pixelCount: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixelCount * 4);
  let state = 0x2f6e2b1;
  for (let index = 0; index < data.length; index += 1) {
    state = (Math.imul(state, 48271) + 11) >>> 0;
    data[index] = state & 0xff;
  }
  return data;
}

function cpuReference(
  el: ImageFilterFields,
  size: number,
): Uint8ClampedArray {
  const imageData = {
    data: deterministicPixels(size * size),
    width: size,
    height: size,
  };
  const { filters, attrs } = buildImageFilters(el, nativeRegistry);
  applyImageFilters(imageData, filters, attrs);
  return imageData.data;
}

/** FNV-1a 32비트 — 페이지 안 구현과 반드시 동일해야 한다(비트 동일성 판정용). */
function fnv1a(bytes: Uint8ClampedArray | Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index]!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// 통계
// ---------------------------------------------------------------------------

interface Stats {
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly meanMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly jankP99OverP50: number;
  readonly mbPerSec: number;
  readonly megapixelsPerSec: number;
  readonly samplesMs: number[];
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

function percentile(sorted: readonly number[], p: number): number {
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[rank] ?? 0;
}

function summarize(samples: readonly number[], pixelCount: number): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p99 = percentile(sorted, 99);
  const megabytes = (pixelCount * 4) / 1_048_576;
  return {
    p50Ms: round3(p50),
    p95Ms: round3(percentile(sorted, 95)),
    p99Ms: round3(p99),
    meanMs: round3(samples.reduce((sum, value) => sum + value, 0) / samples.length),
    minMs: round3(sorted[0] ?? 0),
    maxMs: round3(sorted[sorted.length - 1] ?? 0),
    jankP99OverP50: p50 > 0 ? round3(p99 / p50) : 0,
    mbPerSec: p50 > 0 ? round3(megabytes / (p50 / 1000)) : 0,
    megapixelsPerSec: p50 > 0 ? round3(pixelCount / 1e6 / (p50 / 1000)) : 0,
    samplesMs: samples.map(round3),
  };
}

interface PixelDiff {
  readonly maxColorDiff: number;
  readonly mismatchedColorChannels: number;
  readonly alphaMismatches: number;
  readonly comparedChannels: number;
}

function diffPixels(
  actual: Uint8Array | Uint8ClampedArray,
  expected: Uint8Array | Uint8ClampedArray,
): PixelDiff {
  let maxColorDiff = 0;
  let mismatchedColorChannels = 0;
  let alphaMismatches = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const diff = Math.abs((actual[index] ?? 0) - (expected[index] ?? 0));
    if (index % 4 === 3) {
      if (diff !== 0) alphaMismatches += 1;
      continue;
    }
    if (diff > 0) mismatchedColorChannels += 1;
    if (diff > maxColorDiff) maxColorDiff = diff;
  }
  return {
    maxColorDiff,
    mismatchedColorChannels,
    alphaMismatches,
    comparedChannels: Math.floor(expected.length / 4) * 3,
  };
}

/** 큰 캔버스용 — 소수 스트라이드로 고른 픽셀만 RGBA 로 뽑는다. */
function stridedSample(
  bytes: Uint8Array | Uint8ClampedArray,
  stride: number,
): Uint8Array {
  const pixelCount = bytes.length / 4;
  const sampled = Math.ceil(pixelCount / stride);
  const out = new Uint8Array(sampled * 4);
  for (let index = 0; index < sampled; index += 1) {
    const source = index * stride * 4;
    out[index * 4] = bytes[source] ?? 0;
    out[index * 4 + 1] = bytes[source + 1] ?? 0;
    out[index * 4 + 2] = bytes[source + 2] ?? 0;
    out[index * 4 + 3] = bytes[source + 3] ?? 0;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 브라우저 기동 — gpu-browser-probe / wgsl-variants-* 와 동일한 후보열.
// ---------------------------------------------------------------------------

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

interface ProbePayload {
  supported: boolean;
  reason?: string;
  adapter?: Record<string, string>;
  limits?: Record<string, number>;
}

async function startHarnessServer(): Promise<{
  server: MinimalHttpServer;
  baseUrl: string;
}> {
  const { createServer } = (await dynamicImport("node:http")) as NodeHttpModule;
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      "<!doctype html><html><head><title>filter lane probe</title></head><body></body></html>",
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
      limits: {
        maxBufferSize: Number(adapter.limits.maxBufferSize),
        maxStorageBufferBindingSize: Number(adapter.limits.maxStorageBufferBindingSize),
        maxComputeWorkgroupsPerDimension: Number(
          adapter.limits.maxComputeWorkgroupsPerDimension,
        ),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// 한 셀(크기 × 체인) 측정 — 페이지 안에서 융합/비융합 두 계획을 교차 실행한다.
// ---------------------------------------------------------------------------

interface VariantSamples {
  dispatchMs: number[];
  applyMs: number[];
  gpuPassMs: number[];
  checksum: number;
  sampleBase64: string;
  fullBase64: string | null;
}

interface CellPayload {
  timestampQueryAvailable: boolean;
  fused: VariantSamples;
  unfused: VariantSamples;
}

interface CellInput {
  fusedSteps: SerializedStep[];
  unfusedSteps: SerializedStep[];
  pixelCount: number;
  width: number;
  height: number;
  rowThreads: number;
  workgroupSize: number;
  bindings: { src: number; dst: number; params: number; lut: number };
  warmup: number;
  iterations: number;
  sampleStride: number;
  wantFullPixels: boolean;
}

async function measureCell(page: Page, input: CellInput): Promise<CellPayload> {
  return (await page.evaluate(async (config: CellInput) => {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("no adapter during filter lane probe");
    const hasTimestamps = adapter.features.has("timestamp-query");
    const device = await adapter.requestDevice(
      hasTimestamps ? { requiredFeatures: ["timestamp-query"] } : {},
    );
    const byteLength = config.pixelCount * 4;

    // WebGPU 명세 고정 상수 — GPUBufferUsage/GPUMapMode 전역은 이 tsconfig lib 집합에 없다
    // (studio-gpu-filter-runtime.ts 도 같은 이유로 리터럴을 쓴다).
    const USAGE_MAP_READ = 0x0001;
    const USAGE_COPY_SRC = 0x0004;
    const USAGE_COPY_DST = 0x0008;
    const USAGE_UNIFORM = 0x0040;
    const USAGE_STORAGE = 0x0080;
    const USAGE_QUERY_RESOLVE = 0x0200;
    const MAP_MODE_READ = 0x0001;

    // 결정적 소스 픽셀 — node 측 deterministicPixels 와 동일 LCG.
    const src = new Uint8Array(byteLength);
    let state = 0x2f6e2b1;
    for (let index = 0; index < src.length; index += 1) {
      state = (Math.imul(state, 48271) + 11) >>> 0;
      src[index] = state & 0xff;
    }

    const fnv1a = (bytes: Uint8Array): number => {
      let hash = 0x811c9dc5;
      for (let index = 0; index < bytes.length; index += 1) {
        hash ^= bytes[index]!;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash >>> 0;
    };
    const toBase64 = (bytes: Uint8Array): string => {
      let binary = "";
      const chunk = 0x8000;
      for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
      }
      return btoa(binary);
    };

    const workgroupsX = config.rowThreads / config.workgroupSize;
    const workgroupsY = Math.ceil(config.pixelCount / config.rowThreads);

    // applyGpuFilterChain 과 동일한 리소스 구성: 픽셀 storage 버퍼 핑퐁 2개 + 리드백 스테이징.
    const ping = device.createBuffer({
      size: byteLength,
      usage: USAGE_STORAGE | USAGE_COPY_SRC | USAGE_COPY_DST,
    });
    const pong = device.createBuffer({
      size: byteLength,
      usage: USAGE_STORAGE | USAGE_COPY_SRC | USAGE_COPY_DST,
    });
    const staging = device.createBuffer({
      size: byteLength,
      usage: USAGE_MAP_READ | USAGE_COPY_DST,
    });

    interface PreparedVariant {
      pipelines: GPUComputePipeline[];
      /** [순방향(ping→pong…)] 스텝별 bind group. 마지막 출력 버퍼 인덱스도 함께 계산해 둔다. */
      bindGroups: GPUBindGroup[];
      finalBuffer: GPUBuffer;
      querySet: GPUQuerySet | null;
      resolveBuffer: GPUBuffer | null;
      stagingTs: GPUBuffer | null;
    }

    const prepare = (steps: CellInput["fusedSteps"]): PreparedVariant => {
      const modules = new Map<string, GPUShaderModule>();
      const pipelines: GPUComputePipeline[] = [];
      const bindGroups: GPUBindGroup[] = [];
      let current = ping;
      let other = pong;
      for (const step of steps) {
        let module = modules.get(step.shaderId);
        if (!module) {
          module = device.createShaderModule({ label: step.shaderId, code: step.wgsl });
          modules.set(step.shaderId, module);
        }
        const pipeline = device.createComputePipeline({
          label: step.shaderId,
          layout: "auto",
          compute: { module, entryPoint: step.entryPoint },
        });
        const uniformBuffer = device.createBuffer({
          size: step.uniformBytes.length,
          usage: USAGE_UNIFORM | USAGE_COPY_DST,
        });
        device.queue.writeBuffer(uniformBuffer, 0, new Uint8Array(step.uniformBytes));
        const entries: GPUBindGroupEntry[] = [
          { binding: config.bindings.src, resource: { buffer: current } },
          { binding: config.bindings.dst, resource: { buffer: other } },
          { binding: config.bindings.params, resource: { buffer: uniformBuffer } },
        ];
        if (step.usesLut && step.lutWords !== null) {
          const lutBuffer = device.createBuffer({
            size: step.lutWords.length * 4,
            usage: USAGE_STORAGE | USAGE_COPY_DST,
          });
          device.queue.writeBuffer(lutBuffer, 0, new Uint32Array(step.lutWords));
          entries.push({ binding: config.bindings.lut, resource: { buffer: lutBuffer } });
        }
        bindGroups.push(
          device.createBindGroup({
            label: step.kernelId,
            layout: pipeline.getBindGroupLayout(0),
            entries,
          }),
        );
        pipelines.push(pipeline);
        const written = other;
        other = current;
        current = written;
      }
      const queryCount = steps.length * 2;
      return {
        pipelines,
        bindGroups,
        finalBuffer: current,
        querySet: hasTimestamps
          ? device.createQuerySet({ type: "timestamp", count: queryCount })
          : null,
        resolveBuffer: hasTimestamps
          ? device.createBuffer({
            size: queryCount * 8,
            usage: USAGE_QUERY_RESOLVE | USAGE_COPY_SRC,
          })
          : null,
        stagingTs: hasTimestamps
          ? device.createBuffer({
            size: queryCount * 8,
            usage: USAGE_COPY_DST | USAGE_MAP_READ,
          })
          : null,
      };
    };

    const encodePasses = (
      encoder: GPUCommandEncoder,
      variant: PreparedVariant,
      timed: boolean,
    ): void => {
      for (let index = 0; index < variant.pipelines.length; index += 1) {
        const pass = encoder.beginComputePass(
          timed && variant.querySet
            ? {
              timestampWrites: {
                querySet: variant.querySet,
                beginningOfPassWriteIndex: index * 2,
                endOfPassWriteIndex: index * 2 + 1,
              },
            }
            : {},
        );
        pass.setPipeline(variant.pipelines[index]!);
        pass.setBindGroup(0, variant.bindGroups[index]!);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);
        pass.end();
      }
    };

    // (a) 디스패치만 — 업로드/리드백 제외, submit→onSubmittedWorkDone 동기화 플로어 포함.
    const dispatchOnly = async (variant: PreparedVariant): Promise<number> => {
      const start = performance.now();
      const encoder = device.createCommandEncoder();
      encodePasses(encoder, variant, false);
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      return performance.now() - start;
    };

    // (b) applyGpuFilterChain 전체 — writeBuffer 업로드 + 디스패치 + 스테이징 리드백.
    const applyRoundTrip = async (
      variant: PreparedVariant,
    ): Promise<{ ms: number; bytes: Uint8Array }> => {
      const start = performance.now();
      device.queue.writeBuffer(ping, 0, src);
      const encoder = device.createCommandEncoder();
      encodePasses(encoder, variant, false);
      encoder.copyBufferToBuffer(variant.finalBuffer, 0, staging, 0, byteLength);
      device.queue.submit([encoder.finish()]);
      await staging.mapAsync(MAP_MODE_READ);
      const bytes = new Uint8Array(staging.getMappedRange().slice(0));
      staging.unmap();
      return { ms: performance.now() - start, bytes };
    };

    // (c) timestamp-query — 순수 GPU 패스 실행 시간(플로어 제외). 패스 합을 쓴다.
    const timedPasses = async (variant: PreparedVariant): Promise<number> => {
      if (!variant.querySet || !variant.resolveBuffer || !variant.stagingTs) return 0;
      const queryCount = variant.pipelines.length * 2;
      const encoder = device.createCommandEncoder();
      encodePasses(encoder, variant, true);
      encoder.resolveQuerySet(variant.querySet, 0, queryCount, variant.resolveBuffer, 0);
      encoder.copyBufferToBuffer(
        variant.resolveBuffer,
        0,
        variant.stagingTs,
        0,
        queryCount * 8,
      );
      device.queue.submit([encoder.finish()]);
      await variant.stagingTs.mapAsync(MAP_MODE_READ);
      const stamps = new BigUint64Array(variant.stagingTs.getMappedRange().slice(0));
      variant.stagingTs.unmap();
      let sumNs = 0;
      for (let index = 0; index < variant.pipelines.length; index += 1) {
        sumNs += Math.max(0, Number(stamps[index * 2 + 1]! - stamps[index * 2]!));
      }
      return sumNs / 1e6;
    };

    const fused = prepare(config.fusedSteps);
    const unfused = prepare(config.unfusedSteps);

    const blank = (): VariantAccumulator => ({
      dispatchMs: [],
      applyMs: [],
      gpuPassMs: [],
      checksum: 0,
      sampleBase64: "",
      fullBase64: null,
    });
    interface VariantAccumulator {
      dispatchMs: number[];
      applyMs: number[];
      gpuPassMs: number[];
      checksum: number;
      sampleBase64: string;
      fullBase64: string | null;
    }
    const fusedOut = blank();
    const unfusedOut = blank();

    for (let index = 0; index < config.warmup; index += 1) {
      await dispatchOnly(fused);
      await dispatchOnly(unfused);
      await applyRoundTrip(fused);
      await applyRoundTrip(unfused);
    }

    // 두 variant 를 반복마다 교차 실행 — 병행 부하 드리프트가 한쪽에만 실리지 않게 한다.
    let lastFused: Uint8Array | null = null;
    let lastUnfused: Uint8Array | null = null;
    for (let index = 0; index < config.iterations; index += 1) {
      fusedOut.dispatchMs.push(await dispatchOnly(fused));
      unfusedOut.dispatchMs.push(await dispatchOnly(unfused));
      const fusedApply = await applyRoundTrip(fused);
      fusedOut.applyMs.push(fusedApply.ms);
      lastFused = fusedApply.bytes;
      const unfusedApply = await applyRoundTrip(unfused);
      unfusedOut.applyMs.push(unfusedApply.ms);
      lastUnfused = unfusedApply.bytes;
      if (hasTimestamps) {
        fusedOut.gpuPassMs.push(await timedPasses(fused));
        unfusedOut.gpuPassMs.push(await timedPasses(unfused));
      }
    }

    const finish = (out: VariantAccumulator, bytes: Uint8Array | null): void => {
      if (!bytes) return;
      out.checksum = fnv1a(bytes);
      const pixelCount = bytes.length / 4;
      const sampled = Math.ceil(pixelCount / config.sampleStride);
      const sample = new Uint8Array(sampled * 4);
      for (let index = 0; index < sampled; index += 1) {
        const source = index * config.sampleStride * 4;
        sample[index * 4] = bytes[source]!;
        sample[index * 4 + 1] = bytes[source + 1]!;
        sample[index * 4 + 2] = bytes[source + 2]!;
        sample[index * 4 + 3] = bytes[source + 3]!;
      }
      out.sampleBase64 = toBase64(sample);
      out.fullBase64 = config.wantFullPixels ? toBase64(bytes) : null;
    };
    finish(fusedOut, lastFused);
    finish(unfusedOut, lastUnfused);

    device.destroy();
    return {
      timestampQueryAvailable: hasTimestamps,
      fused: fusedOut,
      unfused: unfusedOut,
    };
  }, input)) as CellPayload;
}

// ---------------------------------------------------------------------------

interface VariantReport {
  readonly dispatches: number;
  readonly kernelIds: readonly string[];
  readonly dispatchMs: Stats;
  readonly applyMs: Stats;
  readonly gpuPassMs: Stats | null;
}

async function readExistingReport(
  readFile: NodeFsPromisesModule["readFile"],
): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(RESULTS_URL, "utf8")) as Record<string, unknown>;
  } catch {
    // 하니스가 아직 안 돌았거나 파일이 손상된 경우 — GPU 레인만 담은 새 리포트를 쓴다.
    return {};
  }
}

interface GpuCellReport {
  readonly size: number;
  readonly pixels: number;
  readonly megabytes: number;
  readonly chain: string;
  readonly chainLabel: string;
  readonly iterations: number;
  readonly warmup: number;
  readonly variants: Record<string, VariantReport>;
  readonly quality: Record<string, unknown>;
}

describeProbe("production filter lane GPU probe", () => {
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
  }, 180_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose) => {
      server?.close(() => resolveClose());
    });
  });

  it(
    "measures the production GPU filter chain (fused vs unfused) across canvas sizes and merges it into filter-lanes.json",
    async () => {
      expect(
        probe.supported,
        `no WebGPU adapter in any launch configuration — last probe: ${JSON.stringify(probe)}`,
      ).toBe(true);
      if (browser === undefined) throw new Error("unreachable: probe passed without browser");

      const cells: GpuCellReport[] = [];
      for (const spec of SIZES) {
        const pixelCount = spec.size * spec.size;
        for (const chain of CHAINS) {
          const fusedPlan = planStudioGpuFilterChain(chain.el);
          expect(fusedPlan, `${chain.id} must be GPU-eligible`).not.toBeNull();
          const unfused = unfusedPlan(chain.el);
          const payload = await measureCell(page, {
            fusedSteps: serializePlan(fusedPlan!, pixelCount),
            unfusedSteps: serializePlan(unfused, pixelCount),
            pixelCount,
            width: spec.size,
            height: spec.size,
            rowThreads: STUDIO_GPU_FILTER_DISPATCH_ROW_THREADS,
            workgroupSize: STUDIO_GPU_FILTER_WORKGROUP_SIZE,
            bindings: { ...STUDIO_GPU_FILTER_BINDINGS },
            warmup: spec.warmup,
            iterations: spec.iterations,
            sampleStride: PIXEL_SAMPLE_STRIDE,
            wantFullPixels: spec.fullPixelDiff,
          });

          const reference = cpuReference(chain.el, spec.size);
          const referenceChecksum = fnv1a(reference);
          const referenceSample = stridedSample(reference, PIXEL_SAMPLE_STRIDE);
          const { Buffer } = (await dynamicImport("node:buffer")) as {
            Buffer: { from(data: string, encoding: "base64"): Uint8Array };
          };

          const quality: Record<string, unknown> = {
            reference:
              "direct-cpu (buildImageFilters + applyImageFilters, 네이티브 포팅 레지스트리)"
              + " — tests/benchmarks/harness/filter-lanes.ts 의 CPU 참조와 동일 픽셀",
            checksumAlgorithm: "FNV-1a 32bit over the full RGBA buffer",
            referenceChecksum,
            sampleStridePixels: PIXEL_SAMPLE_STRIDE,
          };
          for (const [name, variant] of [
            ["gpu-fused", payload.fused],
            ["gpu-unfused", payload.unfused],
          ] as const) {
            const sampleDiff = diffPixels(
              Buffer.from(variant.sampleBase64, "base64"),
              referenceSample,
            );
            quality[name] = {
              checksum: variant.checksum,
              bitIdenticalToCpu: variant.checksum === referenceChecksum,
              stridedSample: sampleDiff,
              fullFrame: variant.fullBase64
                ? diffPixels(Buffer.from(variant.fullBase64, "base64"), reference)
                : null,
            };
          }
          quality["gpu-fused-vs-gpu-unfused-checksumMatch"] =
            payload.fused.checksum === payload.unfused.checksum;

          const report = (
            steps: StudioGpuFilterPlan,
            samples: { dispatchMs: number[]; applyMs: number[]; gpuPassMs: number[] },
          ): VariantReport => ({
            dispatches: steps.length,
            kernelIds: steps.map((step) => step.kernelId),
            dispatchMs: summarize(samples.dispatchMs, pixelCount),
            applyMs: summarize(samples.applyMs, pixelCount),
            gpuPassMs: samples.gpuPassMs.length > 0
              ? summarize(samples.gpuPassMs, pixelCount)
              : null,
          });

          cells.push({
            size: spec.size,
            pixels: pixelCount,
            megabytes: round3((pixelCount * 4) / 1_048_576),
            chain: chain.id,
            chainLabel: chain.label,
            iterations: spec.iterations,
            warmup: spec.warmup,
            variants: {
              "gpu-fused": report(fusedPlan!, payload.fused),
              "gpu-unfused": report(unfused, payload.unfused),
            },
            quality,
          });
          const recorded = cells[cells.length - 1]!;
          console.log(
            `${spec.size}² ${chain.id}: fused apply p50 ${recorded.variants["gpu-fused"]!.applyMs.p50Ms}ms`
            + ` | unfused apply p50 ${recorded.variants["gpu-unfused"]!.applyMs.p50Ms}ms`,
          );
        }
      }

      const os = (await dynamicImport("node:os")) as NodeOsModule;
      const { readFile, writeFile } = (await dynamicImport(
        "node:fs/promises",
      )) as NodeFsPromisesModule;

      // 하니스가 이미 쓴 CPU 레인 위에 GPU 레인을 병합한다(같은 파일 = 한 표에서 비교).
      const existing = await readExistingReport(readFile);

      const gpuLanes = {
        probe:
          "packages/studio-engine-registry/src/__tests__/filter-lanes-browser-probe.test.ts"
          + " (FILTER_LANE_PROBE=1)",
        measuredAt: new Date().toISOString(),
        browser: { launch: launchLabel, version: browser.version() },
        adapter: probe.adapter ?? null,
        adapterLimits: probe.limits ?? null,
        concurrentLoad: {
          note:
            "다른 에이전트의 빌드/테스트와 24h 소크가 병행 실행되는 머신에서 측정했다."
            + " 융합/비융합 두 variant 를 반복마다 교차 실행하고 비교는 중앙값(p50) 기준이다.",
          loadavgBeforeLaunch: loadavgBeforeLaunch.map(round3),
          loadavgAfterMeasurement: os.loadavg().map(round3),
          cpuCount: os.cpus().length,
        },
        productionFidelity: {
          kernels: "studio-gpu-filter-kernels.ts 실물 WGSL·바인딩·디스패치 좌표계",
          plan: "planStudioGpuFilterChain 실물(융합) / 같은 planner 를 커널 그룹별로 호출해 이어붙인 비융합",
          reproducedInProbe:
            "디스패치 루프·버퍼 핑퐁·리드백 절차는 applyGpuFilterChain 을 페이지 안에서 재현한"
            + " 것이다(모듈 자체는 번들 없이 페이지에 넣을 수 없다). 버퍼 usage·핑퐁 순서·"
            + "리드백 스테이징 구성은 동일하다.",
          notReproduced:
            "error scope fail-closed, 디바이스 손실 처리, 버퍼 풀 재활용, revision supersede 취소는"
            + " 성능 경로가 아니어서 재현하지 않았다.",
        },
        fusionScope:
          "프로덕션 planner 의 LUT 융합은 **인접한 lut3 스텝이 둘 이상일 때만** 작동한다."
          + " 밝기+대비는 이미 한 lut3 커널이라 single/triple 체인은 융합/비융합 스텝 열이"
          + " 동일하다(디스패치 수가 같다). 융합 이득이 실제로 측정되는 셀은 레벨+커브가 함께"
          + " 켜지는 full5(5 → 4 디스패치)뿐이며, 그 셀의 dispatches 값이 그 사실을 드러낸다.",
        metrics: {
          dispatchMs:
            "인코드+submit+onSubmittedWorkDone. 업로드/리드백 제외 — 동기화 플로어(~2.5ms 관측)를 포함한다.",
          applyMs:
            "writeBuffer 업로드 + 디스패치 + 스테이징 리드백(mapAsync) = applyGpuFilterChain 이"
            + " 실제로 무는 비용. **레인 전환 임계는 이 값으로 판정한다.**",
          gpuPassMs:
            "timestamp-query 로 잰 컴퓨트 패스 실행 시간 합 — 동기화/전송 플로어를 제외한 순수 GPU 시간.",
        },
        config: {
          sizes: SIZES.map((spec) => ({
            size: `${spec.size}x${spec.size}`,
            warmup: spec.warmup,
            iterations: spec.iterations,
            fullPixelDiff: spec.fullPixelDiff,
          })),
          chains: CHAINS.map((chain) => ({ id: chain.id, label: chain.label })),
          source: "deterministic LCG RGBA (하니스와 동일 시드·점화식)",
          timestampQuery: cells.length > 0,
        },
        results: cells,
      };

      const merged = {
        ...existing,
        gpuLanes,
        crossover: buildCrossover(existing, cells),
      };
      // 어느 CPU 실행과 짝지어졌는지 남긴다 — 하니스를 다시 돌리면 이 crossover 는 무효화되고
      // (하니스가 stale 마커로 덮어쓴다) 프로브 재실행이 필요하다는 사실이 파일 안에서 읽힌다.
      (merged.crossover as { mergedAgainstCpuRun?: unknown }).mergedAgainstCpuRun =
        typeof existing.generatedAt === "string" ? existing.generatedAt : null;
      await writeFile(RESULTS_URL, `${JSON.stringify(merged, null, 2)}\n`);

      // ── 정합성 단언(성능이 아니라 정확성만 게이트) ─────────────────────────
      for (const cell of cells) {
        for (const name of ["gpu-fused", "gpu-unfused"] as const) {
          const entry = cell.quality[name] as {
            stridedSample: PixelDiff;
            fullFrame: PixelDiff | null;
          };
          const diff = entry.fullFrame ?? entry.stridedSample;
          expect(
            diff.alphaMismatches,
            `${cell.size}² ${cell.chain} ${name}: alpha must match the CPU reference exactly`,
          ).toBe(0);
          expect(
            diff.maxColorDiff,
            `${cell.size}² ${cell.chain} ${name}: max channel error ${diff.maxColorDiff} exceeds ±2/255`,
          ).toBeLessThanOrEqual(2);
        }
        expect(
          cell.quality["gpu-fused-vs-gpu-unfused-checksumMatch"],
          `${cell.size}² ${cell.chain}: LUT fusion must be bit-identical to the sequential chain`,
        ).toBe(true);
      }
    },
    900_000,
  );
});

// ---------------------------------------------------------------------------
// 레인 전환 임계 — 하니스가 남긴 CPU 레인 p50 과 GPU applyMs p50 을 같은 셀에서 비교한다.
// ---------------------------------------------------------------------------

interface HarnessCell {
  size: number;
  chain: string;
  lanes: Record<string, { p50Ms: number }>;
}

/**
 * 레인 비용의 1차 모델 `cost(MP) = fixedMs + perMegapixelMs × MP` 최소제곱 적합.
 * GPU 레인은 크기와 무관한 제출/리드백 플로어가 절편으로, 픽셀 처리량이 기울기로 잡힌다 —
 * 토너먼트 cost model 이 "이 크기면 어느 레인" 을 계산할 때 필요한 두 계수가 정확히 이것이다.
 */
function linearFit(
  points: ReadonlyArray<{ readonly x: number; readonly y: number }>,
): { fixedMs: number; perMegapixelMs: number; r2: number; points: number } | null {
  if (points.length < 2) return null;
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const point of points) {
    sxx += (point.x - meanX) * (point.x - meanX);
    sxy += (point.x - meanX) * (point.y - meanY);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  let ssRes = 0;
  let ssTot = 0;
  for (const point of points) {
    const predicted = intercept + slope * point.x;
    ssRes += (point.y - predicted) * (point.y - predicted);
    ssTot += (point.y - meanY) * (point.y - meanY);
  }
  return {
    fixedMs: round3(intercept),
    perMegapixelMs: round3(slope),
    r2: ssTot === 0 ? 1 : round3(1 - ssRes / ssTot),
    points: n,
  };
}

function buildCostModelSeed(
  harnessCells: readonly HarnessCell[],
  cells: readonly GpuCellReport[],
): unknown {
  const megapixels = (size: number): number => (size * size) / 1e6;
  const byChain = CHAINS.map((chain) => {
    const gpuCells = cells.filter((cell) => cell.chain === chain.id);
    const cpuCells = harnessCells.filter((cell) => cell.chain === chain.id);
    const lane = (
      source: ReadonlyArray<{ readonly x: number; readonly y: number }>,
    ): ReturnType<typeof linearFit> => linearFit(source);
    return {
      chain: chain.id,
      gpuDispatches: gpuCells[0]?.variants["gpu-fused"]?.dispatches ?? null,
      lanes: {
        "gpu-fused-apply": lane(
          gpuCells.map((cell) => ({
            x: megapixels(cell.size),
            y: cell.variants["gpu-fused"]!.applyMs.p50Ms,
          })),
        ),
        "gpu-fused-pure-pass": lane(
          gpuCells
            .filter((cell) => cell.variants["gpu-fused"]!.gpuPassMs !== null)
            .map((cell) => ({
              x: megapixels(cell.size),
              y: cell.variants["gpu-fused"]!.gpuPassMs!.p50Ms,
            })),
        ),
        "worker-cpu": lane(
          cpuCells.map((cell) => ({
            x: megapixels(cell.size),
            y: cell.lanes["worker-cpu"]?.p50Ms ?? 0,
          })),
        ),
        "direct-cpu": lane(
          cpuCells.map((cell) => ({
            x: megapixels(cell.size),
            y: cell.lanes["direct-cpu"]?.p50Ms ?? 0,
          })),
        ),
        "konva-fallback": lane(
          cpuCells.map((cell) => ({
            x: megapixels(cell.size),
            y: cell.lanes["konva-fallback"]?.p50Ms ?? 0,
          })),
        ),
      },
    };
  });
  return {
    model: "cost(MP) = fixedMs + perMegapixelMs × megapixels (least squares over the measured sizes)",
    note:
      "GPU 레인의 fixedMs 는 크기와 무관한 제출/리드백 플로어, perMegapixelMs 는 처리량이다."
      + " 두 레인의 직선이 만나는 지점이 곧 레인 전환 임계이고, thresholdByChain 의 실측"
      + " 계단값과 교차 검증된다. 계수는 이 호스트·이 병행 부하에서의 값이므로 절대치가 아니라"
      + " 비율·절편 구조를 시드로 쓰는 것이 안전하다.",
    byChain,
  };
}

function buildCrossover(
  existing: Record<string, unknown>,
  cells: readonly GpuCellReport[],
): unknown {
  const harnessCells = Array.isArray(existing.results)
    ? (existing.results as HarnessCell[])
    : [];
  if (harnessCells.length === 0) {
    return {
      note:
        "CPU 레인 데이터가 없다 — tests/benchmarks/harness/filter-lanes.ts 를 먼저 실행하면"
        + " 다음 프로브 실행이 교차점을 채운다.",
      cells: null,
    };
  }
  const comparisons = cells.map((cell) => {
    const harness = harnessCells.find(
      (entry) => entry.size === cell.size && entry.chain === cell.chain,
    );
    const worker = harness?.lanes["worker-cpu"]?.p50Ms ?? null;
    const direct = harness?.lanes["direct-cpu"]?.p50Ms ?? null;
    const konva = harness?.lanes["konva-fallback"]?.p50Ms ?? null;
    const gpuApply = cell.variants["gpu-fused"]!.applyMs.p50Ms;
    return {
      size: cell.size,
      chain: cell.chain,
      gpuFusedApplyP50Ms: gpuApply,
      gpuFusedPurePassP50Ms: cell.variants["gpu-fused"]!.gpuPassMs?.p50Ms ?? null,
      workerCpuP50Ms: worker,
      directCpuP50Ms: direct,
      konvaFallbackP50Ms: konva,
      gpuSpeedupOverWorker: worker !== null && gpuApply > 0 ? round3(worker / gpuApply) : null,
      gpuSpeedupOverKonva: konva !== null && gpuApply > 0 ? round3(konva / gpuApply) : null,
      gpuWins: worker !== null ? gpuApply < worker : null,
    };
  });
  // 체인별로 "GPU 가 Worker 를 이기기 시작하는 가장 작은 크기"를 뽑는다 — 이 값이 토너먼트
  // cost model 의 레인 전환 임계 시드다. 모든 크기에서 이기면 최소 측정 크기(=임계가 그보다
  // 아래), 아무 데서도 못 이기면 null 로 남긴다(둘 다 명시적으로 구분해 기록).
  const thresholdByChain = CHAINS.map((chain) => {
    const forChain = comparisons
      .filter((entry) => entry.chain === chain.id)
      .sort((a, b) => a.size - b.size);
    const firstWin = forChain.find((entry) => entry.gpuWins === true) ?? null;
    const allWin = forChain.length > 0 && forChain.every((entry) => entry.gpuWins === true);
    return {
      chain: chain.id,
      gpuWinsFromSize: firstWin?.size ?? null,
      belowMeasuredRange: allWin,
      largestCpuWinSize:
        forChain.filter((entry) => entry.gpuWins === false).at(-1)?.size ?? null,
    };
  });
  return {
    note:
      "GPU 레인 비용은 applyMs(업로드+디스패치+리드백) p50, CPU 레인 비용은 하니스의 레인별 p50."
      + " gpuWins=true 인 가장 작은 (크기, 체인) 조합이 실측 레인 전환 임계다."
      + " belowMeasuredRange=true 면 측정한 모든 크기에서 GPU 가 이겼다는 뜻이라 임계는 최소"
      + " 측정 크기보다 아래에 있다.",
    basis: "gpu-fused applyMs p50 vs worker-cpu p50 (same size/chain cell)",
    thresholdByChain,
    costModelSeed: buildCostModelSeed(harnessCells, cells),
    cells: comparisons,
  };
}
