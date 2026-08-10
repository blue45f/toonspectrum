import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  composeWgslVariant,
  evaluateVariantOnPixels,
  identityWgslLut3,
  packWgslVariantLut,
  packWgslVariantUniform,
  patchWgslVariantPixelCount,
  WGSL_VARIANT_DISPATCH_ROW_THREADS,
  WGSL_VARIANT_WORKGROUP_SIZE,
} from "../wgsl-variants";

import type { ComposedWgslVariant, WgslFilterOpSpec } from "../wgsl-variants";
import type { Browser, Page } from "playwright";

// ---------------------------------------------------------------------------
// node 내장 모듈 접근 — 이 패키지 tsconfig 는 @types/node 를 포함하지 않으므로
// (types 필드 없음 + 패키지 devDep 없음), 정적 `node:*` import 는 타입 해석이
// 안 된다. 런타임(vitest, node)에는 당연히 존재하므로 변수 지정자 동적
// import + 최소 구조 타입으로 접근한다. tsconfig/package.json 은 이 레인의
// 무접촉 대상이라 여기서 우회하는 것이 맞다.
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

/**
 * Real-browser WGSL variant compile + dispatch probe (V12 lane 5 WESL 재개
 * 게이트 "모든 variant compile" 의 브라우저측 실측).
 *
 * Opt-in: `WGSL_VARIANT_BROWSER_PROBE=1 pnpm exec vitest run \
 *   packages/studio-engine-registry/src/__tests__/wgsl-variants-browser.test.ts`
 *
 * 패턴은 packages/studio-engine-vello/src/__tests__/gpu-browser-probe.test.ts
 * 를 따른다(playwright chromium + --enable-unsafe-webgpu, 127.0.0.1 하니스
 * 페이지 = secure context). 생성기 출력 공간(단일 연산 5 + 순서 있는 2연산
 * 25 + 5연산 풀체인 + 구조 변형 4)을 전부 device.createShaderModule +
 * getCompilationInfo 로 검증(에러 0 게이트)하고, 대표 variant 1개(풀체인)를
 * 실제 컴퓨트 디스패치해 CPU 참조(evaluateVariantOnPixels)와 픽셀 정합을
 * 확인한다(채널 허용 오차 ±2/255, 알파는 정확 일치). 결과는
 * tests/benchmarks/results/wgsl-variants-browser.json 에 남긴다.
 */

const ENABLED =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.WGSL_VARIANT_BROWSER_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;

const RESULTS_URL = new URL(
  "../../../../tests/benchmarks/results/wgsl-variants-browser.json",
  import.meta.url,
);

const CHANNEL_TOLERANCE = 2;
const PIXEL_COUNT = 64 * 64;

// ---------------------------------------------------------------------------
// Variant corpus — 생성기 출력 공간의 결정적 열거(값이 아니라 구조가 대상).
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

// 결정적 비항등 LUT — 디스패치 검증에서 LUT 조회 경로가 실제로 값을 바꾸도록
// 채널별로 다른 단조 감마 곡선을 굽는다(값은 임의여도 조회 계약은 동일).
// 레벨/커브 스테이지에 서로 다른 감마를 줘서, 스테이지별 lutBase 청크가
// 뒤바뀌는 인덱싱 버그가 결과 동일성으로 가려지지 않게 한다.
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

// 대표 variant: 지원 5연산 전부를 한 패스로 융합한 풀체인(레벨/커브는 비항등 LUT).
const REPRESENTATIVE_OPS: WgslFilterOpSpec[] = [
  sampleSpec("bc"),
  sampleSpec("hsl"),
  { op: "levels", lut: gammaLut3([0.8, 1.1, 1.35]) },
  { op: "curves", lut: gammaLut3([1.25, 0.9, 0.7]) },
  sampleSpec("cb"),
];

function variantCorpus(): ComposedWgslVariant[] {
  const chains: WgslFilterOpSpec[][] = [];
  for (const kind of KINDS) chains.push([sampleSpec(kind)]);
  for (const first of KINDS) {
    for (const second of KINDS) {
      chains.push([sampleSpec(first), sampleSpec(second)]);
    }
  }
  chains.push(REPRESENTATIVE_OPS);
  // 파라미터 구조 변형 — 같은 연산이라도 구조가 다르면 별도 variant 키다.
  chains.push([{ op: "brightness-contrast", brightness: 0.2 }]);
  chains.push([{ op: "brightness-contrast", contrast: 15 }]);
  chains.push([{ op: "hsl", hue: 30 }]);
  chains.push([{ op: "color-balance", midtones: [0, 8, 0] }]);

  const byKey = new Map<string, ComposedWgslVariant>();
  for (const chain of chains) {
    const variant = composeWgslVariant(chain);
    if (!byKey.has(variant.variantKey)) byKey.set(variant.variantKey, variant);
  }
  return [...byKey.values()];
}

// 결정적 테스트 픽셀(오프라인 스위트와 동일 LCG 시드 계열).
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
      "<!doctype html><html><head><title>wgsl variant probe</title></head><body></body></html>",
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

/**
 * gpu-browser-probe 와 동일한 런치 후보열 — 번들 headless shell 의 WebGPU
 * 지원이 갈리므로 system chrome(headless → headed)까지 순서대로 시도한다.
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

describeProbe("wgsl variant real-browser compile/dispatch probe", () => {
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
    "compiles every generated variant with zero errors and matches the CPU reference on dispatch",
    async () => {
      expect(
        probe.supported,
        `no WebGPU adapter in any launch configuration — last probe: ${JSON.stringify(probe)}`,
      ).toBe(true);
      if (browser === undefined) throw new Error("unreachable: probe passed without browser");

      // ── 1) 전 variant compile 게이트 ────────────────────────────────────
      const corpus = variantCorpus();
      expect(corpus.length).toBeGreaterThanOrEqual(30);
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
        corpus.map((variant) => ({ key: variant.variantKey, wgsl: variant.wgsl })),
      )) as CompileResultPayload[];

      const failed = compileResults.filter((result) => result.errors.length > 0);
      expect(
        failed,
        `WGSL compile errors: ${JSON.stringify(failed, null, 2)}`,
      ).toEqual([]);
      const compileErrorCount = failed.reduce((sum, result) => sum + result.errors.length, 0);

      // ── 2) 대표 variant 디스패치 — CPU 참조와 픽셀 정합 ─────────────────
      const representative = composeWgslVariant(REPRESENTATIVE_OPS);
      const srcPixels = deterministicPixels(PIXEL_COUNT);
      const expected = evaluateVariantOnPixels(REPRESENTATIVE_OPS, srcPixels);
      const uniform = packWgslVariantUniform(REPRESENTATIVE_OPS);
      patchWgslVariantPixelCount(uniform, PIXEL_COUNT);
      const lut = packWgslVariantLut(REPRESENTATIVE_OPS);
      if (lut === null) throw new Error("representative chain must carry LUT stages");

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

          // WebGPU 명세 고정 상수 — studio-gpu-filter-runtime.ts 와 동일 규약
          // (GPUBufferUsage/GPUMapMode 전역은 이 tsconfig lib 집합에 없다).
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
          "packages/studio-engine-registry/src/__tests__/wgsl-variants-browser.test.ts (WGSL_VARIANT_BROWSER_PROBE=1)",
        note: "V12 lane 5 (WESL_SHADER_PLATFORM) 재개 게이트 근거 — EffectGraph 융합 WGSL variant 전수 브라우저 컴파일 + 대표 variant 디스패치 CPU 정합",
        measuredAt: new Date().toISOString(),
        browser: { launch: launchLabel, version: browser.version() },
        adapter: probe.adapter ?? null,
        variantCount: corpus.length,
        compileErrorCount,
        compileWarnings: compileResults
          .filter((result) => result.warnings.length > 0)
          .map((result) => ({ key: result.key, warnings: result.warnings })),
        dispatch: {
          variantKey: representative.variantKey,
          stages: representative.stages.map((stage) => stage.op),
          pixelCount: PIXEL_COUNT,
          channelTolerance: CHANNEL_TOLERANCE,
          maxChannelDiff,
          mismatchedChannels,
          totalColorChannels: PIXEL_COUNT * 3,
        },
        variantKeys: corpus.map((variant) => variant.variantKey),
      };
      const { writeFile } = (await dynamicImport(
        "node:fs/promises",
      )) as NodeFsPromisesModule;
      await writeFile(RESULTS_URL, `${JSON.stringify(report, null, 2)}\n`);
    },
    240_000,
  );
});
