import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sceneIRSchema } from "@toonspectrum/studio-project-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Server } from "node:http";
import type { Browser, Page } from "playwright";

/**
 * StudioGpuFabric zero-copy interop real-browser probe (V12 §6, ADR-0011 원장).
 *
 * Opt-in: `GPU_FABRIC_BROWSER_PROBE=1 pnpm exec vitest run \
 *   packages/studio-engine-vello/src/__tests__/gpu-fabric-browser-probe.test.ts`
 *
 * 실측 항목 (추측 금지 — 전부 실행으로 판별):
 *  (a) vello GPU(pkg-gpu)가 외부 GPUDevice 를 받을 수 있는가 — wasm 모듈의 export
 *      표면을 전수 스캔해 디바이스 주입 진입점 부재를 실증한다(소스 근거는
 *      crates/studio-engine-vello/src/gpu_web.rs + wgpu 29.0.4, ADR-0011 기록).
 *  (b) 디바이스 간 텍스처 교환의 현행 비용 — vello 내부 디바이스 렌더+readback
 *      (render_scene_gpu_json) → fabric 디바이스 writeTexture 업로드(§6.3 L0 실경로)를
 *      같은 디바이스 GPU copy(L3)·CPU 왕복과 크기별로 대조 수치화한다.
 *  (c) 물리적 동일 GPU 라도 별개 GPUDevice 간 텍스처 직접 공유는 WebGPU 검증 오류로
 *      거부됨을 실증한다(브로커 same-device 확인이 필수인 이유).
 *  (d) fabric 디바이스에서 자체 WGSL 컴퓨트 커널(필터 런타임과 동일한 u32-packed
 *      storage buffer 아키텍처)이 vello 산출 픽셀 위에 결정적으로 도는 것을 검증한다.
 *
 * 결과는 tests/benchmarks/results/gpu-fabric-probe.json 에 기록된다. 기본 verify
 * 스코프에서 제외된 이유는 gpu-browser-probe 와 동일 — WebGPU Chromium 과 GPU 시간이
 * 필요하다. 벽시계 시간은 submit→완료 왕복(수 ms 플로어)을 포함한다(정직 기록).
 */

const ENABLED = process.env.GPU_FABRIC_BROWSER_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const RESULTS_PATH = join(REPO_ROOT, "tests", "benchmarks", "results", "gpu-fabric-probe.json");
const SIZES = [256, 512, 1024];
const TIMED_SAMPLES = 9;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

function startRepoServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/__gpu-fabric-harness__") {
      response.writeHead(200, { "content-type": MIME[".html"] });
      response.end(
        "<!doctype html><html><head><title>gpu fabric probe</title></head><body></body></html>",
      );
      return;
    }
    const requested = normalize(join(REPO_ROOT, decodeURIComponent(url.pathname)));
    if (!requested.startsWith(REPO_ROOT)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    readFile(requested)
      .then((body) => {
        response.writeHead(200, {
          "content-type": MIME[extname(requested)] ?? "application/octet-stream",
        });
        response.end(body);
      })
      .catch(() => {
        response.writeHead(404).end("not found");
      });
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
  engine?: string;
}

/** vello 렌더 대상 SceneIR — 크기별로 동일 노드 구성을 스케일해 비용 축을 크기에 고정. */
function buildSceneJson(size: number): string {
  const s = size / 128;
  const raw = {
    version: 11,
    width: size,
    height: size,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes: [
      {
        id: "plate",
        kind: "fill-path",
        path: {
          verbs: [
            { v: "M", x: 12 * s, y: 12 * s },
            { v: "L", x: 116 * s, y: 12 * s },
            { v: "L", x: 116 * s, y: 84 * s },
            { v: "L", x: 12 * s, y: 84 * s },
            { v: "Z" },
          ],
        },
        paint: { kind: "solid", color: { r: 0.86, g: 0.12, b: 0.16, a: 1 } },
      },
      {
        id: "wedge",
        kind: "fill-path",
        path: {
          verbs: [
            { v: "M", x: 64 * s, y: 60 * s },
            { v: "L", x: 116 * s, y: 120 * s },
            { v: "L", x: 12 * s, y: 120 * s },
            { v: "Z" },
          ],
        },
        paint: { kind: "solid", color: { r: 0.05, g: 0.55, b: 0.55, a: 1 } },
      },
    ],
  };
  return JSON.stringify(sceneIRSchema.parse(raw));
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

describeProbe("studio gpu-fabric zero-copy interop real-browser probe", () => {
  let server: Server;
  let baseUrl: string;
  let browser: Browser | undefined;
  let page: Page;
  let launchLabel = "";
  let probe: ProbePayload = { supported: false, reason: "probe not run" };

  beforeAll(async () => {
    ({ server, baseUrl } = await startRepoServer());
    const { chromium } = await import("playwright");
    const moduleUrl = `${baseUrl}/crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js`;
    for (const candidate of LAUNCH_CANDIDATES) {
      const attempt = await chromium.launch(candidate.options);
      const attemptPage = await attempt.newPage();
      await attemptPage.goto(`${baseUrl}/__gpu-fabric-harness__`);
      const payload = (await attemptPage.evaluate(async (url: string) => {
        const importModule = new Function("u", "return import(u)") as (
          u: string,
        ) => Promise<Record<string, CallableFunction>>;
        const module = await importModule(url);
        await (module.default as () => Promise<unknown>)();
        return JSON.parse(
          (await (module.probe_webgpu as () => Promise<string>)()) as string,
        ) as unknown;
      }, moduleUrl)) as ProbePayload;
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
    "measures device sharing feasibility and current cross-device exchange cost",
    async () => {
      expect(
        probe.supported,
        `no WebGPU adapter in any launch configuration — last probe: ${JSON.stringify(probe)}`,
      ).toBe(true);
      if (browser === undefined) throw new Error("unreachable: probe passed without browser");

      const scenes = SIZES.map((size) => ({ size, sceneJson: buildSceneJson(size) }));
      const payload = (await page.evaluate(
        async (input: {
          moduleUrl: string;
          scenes: Array<{ size: number; sceneJson: string }>;
          samples: number;
        }) => {
          const importModule = new Function("u", "return import(u)") as (
            u: string,
          ) => Promise<{
            default: () => Promise<unknown>;
            render_scene_gpu_json: (json: string) => Promise<Uint8Array>;
          } & Record<string, unknown>>;
          const module = await importModule(input.moduleUrl);
          await module.default();

          // (a) wasm export 전수 스캔 — 디바이스 주입 진입점 존재 여부를 실측.
          // (wasm-bindgen 셈 내부 export `adapter_version` 같은 비주입 심볼은 제외하되
          // 전체 목록은 증거로 기록한다.)
          const wasmExports = Object.keys(module).sort();
          const deviceInjectionExports = wasmExports.filter((name) =>
            /(set|with|from|inject|adopt|use|attach|bind|external).{0,12}(device|queue|adapter)|(device|queue|adapter).{0,12}(inject|adopt|handle|external)/i.test(
              name,
            ),
          );

          const gpu = (navigator as { gpu?: GPU }).gpu;
          if (!gpu) throw new Error("navigator.gpu missing despite wasm probe success");
          const adapter = await gpu.requestAdapter();
          if (!adapter) throw new Error("no adapter for fabric device");
          const wantTimestamp = adapter.features.has("timestamp-query");
          const device = await adapter.requestDevice({
            requiredFeatures: wantTimestamp ? ["timestamp-query"] : [],
          });
          const limits = device.limits;
          const capabilities = {
            maxTextureDimension2D: limits.maxTextureDimension2D,
            maxBufferSize: limits.maxBufferSize,
            maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
            maxComputeWorkgroupsPerDimension: limits.maxComputeWorkgroupsPerDimension,
            maxComputeInvocationsPerWorkgroup: limits.maxComputeInvocationsPerWorkgroup,
            timestampQuery: device.features.has("timestamp-query"),
            features: [...device.features].sort(),
          };

          const p50 = (samples: number[]): number => {
            const sorted = [...samples].sort((a, b) => a - b);
            return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
          };
          const timed = async (run: () => Promise<void>): Promise<number[]> => {
            await run();
            await run(); // warmup ×2
            const samples: number[] = [];
            for (let index = 0; index < input.samples; index += 1) {
              const start = performance.now();
              await run();
              samples.push(performance.now() - start);
            }
            return samples;
          };

          // (c) 별개 디바이스 간 텍스처 직접 공유 거부 실증 — 어댑터는 spec 상 디바이스
          // 1개로 소비되므로 두 번째 디바이스는 새 어댑터에서 얻는다(오늘의 필터 런타임
          // + vello wasm 이 실제로 각자 어댑터를 요청하는 구도와 동일).
          const adapter2 = await gpu.requestAdapter();
          if (!adapter2) throw new Error("no second adapter");
          const device2 = await adapter2.requestDevice();
          const foreignSize = 64;
          const foreignTexture = device.createTexture({
            size: { width: foreignSize, height: foreignSize },
            format: "rgba8unorm",
            usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
          });
          const localTexture = device2.createTexture({
            size: { width: foreignSize, height: foreignSize },
            format: "rgba8unorm",
            usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
          });
          let crossDeviceSyncError: string | null = null;
          let crossDeviceValidationError: string | null = null;
          device2.pushErrorScope("validation");
          try {
            const encoder = device2.createCommandEncoder();
            encoder.copyTextureToTexture(
              { texture: foreignTexture },
              { texture: localTexture },
              { width: foreignSize, height: foreignSize },
            );
            device2.queue.submit([encoder.finish()]);
          } catch (error) {
            crossDeviceSyncError = String(error);
          }
          const scopeError = await device2.popErrorScope();
          if (scopeError) crossDeviceValidationError = scopeError.message;
          device2.destroy();

          // (d) fabric 디바이스의 자체 WGSL 커널 — 필터 런타임과 동일한 u32-packed
          // storage buffer 컴퓨트 아키텍처(rgb invert, 알파 보존). 2회 적용 = 항등.
          const invertPipeline = device.createComputePipeline({
            layout: "auto",
            compute: {
              module: device.createShaderModule({
                code: `
@group(0) @binding(0) var<storage, read_write> pixels: array<u32>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= arrayLength(&pixels)) { return; }
  pixels[id.x] = pixels[id.x] ^ 0x00ffffffu;
}`,
              }),
              entryPoint: "main",
            },
          });

          const interop: Array<Record<string, unknown>> = [];
          let kernelParity = true;
          for (const { size, sceneJson } of input.scenes) {
            const byteLength = size * size * 4;

            // (b-1) vello 내부 디바이스 렌더 + readback + JS 경계 — 현행 교환의 앞반부.
            let velloPixels = new Uint8Array(0);
            const velloSamples = await timed(async () => {
              velloPixels = (await (
                module.render_scene_gpu_json as (json: string) => Promise<Uint8Array>
              )(sceneJson)) as Uint8Array;
            });

            // (b-2) fabric 디바이스 텍스처로 업로드 — 현행 교환의 뒷반부(L0 완성).
            const fabricTexture = device.createTexture({
              size: { width: size, height: size },
              format: "rgba8unorm",
              usage:
                GPUTextureUsage.COPY_SRC
                | GPUTextureUsage.COPY_DST
                | GPUTextureUsage.TEXTURE_BINDING,
            });
            const uploadSamples = await timed(async () => {
              device.queue.writeTexture(
                { texture: fabricTexture },
                velloPixels as unknown as BufferSource,
                { bytesPerRow: size * 4 },
                { width: size, height: size },
              );
              await device.queue.onSubmittedWorkDone();
            });

            // (b-3) 같은 디바이스 GPU copy(L3) — same-device 가 사줄 수 있는 상한 대조.
            const copyTarget = device.createTexture({
              size: { width: size, height: size },
              format: "rgba8unorm",
              usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
            });
            const sameDeviceCopySamples = await timed(async () => {
              const encoder = device.createCommandEncoder();
              encoder.copyTextureToTexture(
                { texture: fabricTexture },
                { texture: copyTarget },
                { width: size, height: size },
              );
              device.queue.submit([encoder.finish()]);
              await device.queue.onSubmittedWorkDone();
            });

            // (b-4) 일반화된 CPU 왕복(임의 provider 쌍의 L0 하한): 텍스처 → 256-정렬
            // readback 버퍼 → mapAsync → CPU 바이트 → writeTexture.
            const bytesPerRow = size * 4; // 256/512/1024 폭은 전부 256 배수.
            const readbackBuffer = device.createBuffer({
              size: byteLength,
              usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const cpuRoundtripSamples = await timed(async () => {
              const encoder = device.createCommandEncoder();
              encoder.copyTextureToBuffer(
                { texture: fabricTexture },
                { buffer: readbackBuffer, bytesPerRow },
                { width: size, height: size },
              );
              device.queue.submit([encoder.finish()]);
              await readbackBuffer.mapAsync(GPUMapMode.READ);
              const bytes = new Uint8Array(readbackBuffer.getMappedRange().slice(0));
              readbackBuffer.unmap();
              device.queue.writeTexture(
                { texture: copyTarget },
                bytes,
                { bytesPerRow: size * 4 },
                { width: size, height: size },
              );
              await device.queue.onSubmittedWorkDone();
            });

            // (d) 자체 WGSL 커널을 vello 산출 픽셀 위에 2회 적용 → 항등 검증.
            const storage = device.createBuffer({
              size: byteLength,
              usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            });
            device.queue.writeBuffer(storage, 0, velloPixels as unknown as BufferSource);
            const bindGroup = device.createBindGroup({
              layout: invertPipeline.getBindGroupLayout(0),
              entries: [{ binding: 0, resource: { buffer: storage } }],
            });
            const workgroups = Math.ceil((byteLength / 4) / 256);
            const kernelSamples = await timed(async () => {
              const encoder = device.createCommandEncoder();
              const pass = encoder.beginComputePass();
              pass.setPipeline(invertPipeline);
              pass.setBindGroup(0, bindGroup);
              pass.dispatchWorkgroups(workgroups);
              pass.end();
              device.queue.submit([encoder.finish()]);
              await device.queue.onSubmittedWorkDone();
            });
            // timed()가 워밍업 2 + 샘플 9 = 11회 적용했다 — 홀수라 한 번 더 적용해
            // 짝수(항등)로 되돌린 뒤 readback 해 원본과 비교한다.
            {
              const encoder = device.createCommandEncoder();
              const pass = encoder.beginComputePass();
              pass.setPipeline(invertPipeline);
              pass.setBindGroup(0, bindGroup);
              pass.dispatchWorkgroups(workgroups);
              pass.end();
              encoder.copyBufferToBuffer(storage, 0, readbackBuffer, 0, byteLength);
              device.queue.submit([encoder.finish()]);
              await readbackBuffer.mapAsync(GPUMapMode.READ);
              const roundtrip = new Uint8Array(readbackBuffer.getMappedRange().slice(0));
              readbackBuffer.unmap();
              for (let index = 0; index < byteLength; index += 1) {
                if (roundtrip[index] !== velloPixels[index]) {
                  kernelParity = false;
                  break;
                }
              }
            }

            readbackBuffer.destroy();
            storage.destroy();
            fabricTexture.destroy();
            copyTarget.destroy();
            interop.push({
              size,
              bytes: byteLength,
              velloRenderReadbackP50Ms: p50(velloSamples),
              uploadToFabricP50Ms: p50(uploadSamples),
              currentExchangeP50Ms: p50(velloSamples) + p50(uploadSamples),
              sameDeviceCopyP50Ms: p50(sameDeviceCopySamples),
              cpuRoundtripP50Ms: p50(cpuRoundtripSamples),
              fabricKernelDispatchP50Ms: p50(kernelSamples),
            });
          }
          device.destroy();

          return {
            wasmExports,
            deviceInjectionExports,
            capabilities,
            crossDevice: {
              rejected: crossDeviceSyncError !== null || crossDeviceValidationError !== null,
              syncError: crossDeviceSyncError,
              validationError: crossDeviceValidationError,
            },
            kernelParity,
            interop,
          };
        },
        {
          moduleUrl: `${baseUrl}/crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js`,
          scenes,
          samples: TIMED_SAMPLES,
        },
      )) as {
        wasmExports: string[];
        deviceInjectionExports: string[];
        capabilities: Record<string, unknown>;
        crossDevice: { rejected: boolean; syncError: string | null; validationError: string | null };
        kernelParity: boolean;
        interop: Array<Record<string, unknown>>;
      };

      // (a) pkg-gpu 는 외부 디바이스 주입 진입점을 노출하지 않는다 — export 전수 스캔.
      expect(payload.deviceInjectionExports).toEqual([]);
      expect(payload.wasmExports).toContain("render_scene_gpu_json");
      // (c) 별개 GPUDevice 간 텍스처 직접 공유는 거부된다 — 브로커 same-device 확인 근거.
      expect(
        payload.crossDevice.rejected,
        "cross-device texture copy unexpectedly accepted — broker same-device check would be moot",
      ).toBe(true);
      // (d) fabric 디바이스 자체 WGSL 커널은 vello 산출 픽셀 위에서 결정적(2회 적용=항등).
      expect(payload.kernelParity).toBe(true);
      for (const row of payload.interop) {
        expect(row.velloRenderReadbackP50Ms).toBeGreaterThan(0);
        expect(row.uploadToFabricP50Ms).toBeGreaterThan(0);
        expect(row.sameDeviceCopyP50Ms).toBeGreaterThan(0);
        expect(row.cpuRoundtripP50Ms).toBeGreaterThan(0);
      }

      const report = {
        harness:
          "packages/studio-engine-vello/src/__tests__/gpu-fabric-browser-probe.test.ts (GPU_FABRIC_BROWSER_PROBE=1)",
        measuredAt: new Date().toISOString(),
        browser: { launch: launchLabel, version: browser.version() },
        adapter: probe.adapter ?? null,
        note:
          "wall-clock includes submit->completion roundtrip floor; currentExchange = vello internal-device render+readback+JS boundary followed by fabric-device writeTexture (V12 §6.3 L0)",
        velloDeviceInjection: {
          supported: false,
          wasmExports: payload.wasmExports,
          deviceInjectionExports: payload.deviceInjectionExports,
          sourceEvidence:
            "crates/studio-engine-vello/src/gpu_web.rs acquire_context() creates its own wgpu Instance(BROWSER_WEBGPU) -> request_adapter -> request_device; wgpu 29.0.4 (vello 0.9 pin): src/lib.rs `mod backend` is private, backend::webgpu::WebDevice.inner is pub(crate), no public constructor from a JS GPUDevice; Device::from_custom requires a full custom DeviceInterface backend (not adoption)",
          patchBacklog:
            "toon-vello fork track item #1: expose Device/Queue adoption of an external browser GPUDevice (wgpu backend::webgpu public from_webgpu handle constructors, or wgpu 30 handle API once vello unlocks it) + Texture::from_webgpu_handle for zero-copy wrap",
        },
        fabricDevice: payload.capabilities,
        crossDeviceSharing: payload.crossDevice,
        fabricKernelParity: payload.kernelParity,
        interopCost: payload.interop,
      };
      await writeFile(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`);
    },
    240_000,
  );
});
