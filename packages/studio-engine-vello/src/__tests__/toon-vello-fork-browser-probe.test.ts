import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sceneIRSchema } from "@toonspectrum/studio-project-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Server } from "node:http";
import type { Browser, Page } from "playwright";

/**
 * toon-vello fork track (V12 §5) real-browser proof — device adoption + L4.
 *
 * Opt-in: `TOON_VELLO_FORK_PROBE=1 pnpm exec vitest run \
 *   packages/studio-engine-vello/src/__tests__/toon-vello-fork-browser-probe.test.ts`
 *
 * 전제: pkg-gpu 가 build track B(`--features lottie,fabric`, crates/vendor/wgpu-toon
 * 의 `toon-fabric` 패치)로 빌드되어 있어야 한다. 그렇지 않으면 `adopt_gpu_device`
 * export 자체가 없어 (a)에서 즉시 실패한다 — 조용한 폴백 없음.
 *
 * 실측 항목 (추측 금지 — 전부 실행으로 판별):
 *  (a) `adopt_gpu_device(fabricDevice)` 이후 wasm 이 렌더에 쓰는 GPUDevice 가
 *      **JS 가 만든 바로 그 객체**인지 — `fabric_device_handle() === fabricDevice`
 *      참조 동일성으로 판별한다(문자열·플래그가 아니라 객체 아이덴티티).
 *  (b) `render_scene_gpu_texture_json` 이 돌려준 GPUTexture 를 fabric 디바이스가
 *      readback 없이 곧바로 소비할 수 있는지 — 같은 디바이스 GPU copy(L3) 및
 *      바인딩 샘플링(L4)이 검증 오류 없이 통과하는지.
 *  (c) 교환 비용 — 기존 L0(vello 내부 디바이스 렌더+readback+JS 경계+writeTexture,
 *      `gpu-fabric-probe.json` 기준선) 대비 adopted 렌더의 p50 를 크기별로 대조.
 *  (d) 픽셀 동등성 — adopted 경로가 만든 텍스처를 readback 해 기존 L0 경로의
 *      `render_scene_gpu_json` 결과와 바이트 일치하는지(패치가 렌더를 바꾸지 않음).
 *
 * 결과는 tests/benchmarks/results/toon-vello-fork.json 에 기록된다.
 * 기본 verify 스코프에서 제외된 이유는 gpu-fabric-browser-probe 와 동일하다.
 */

const ENABLED = process.env.TOON_VELLO_FORK_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const RESULTS_PATH = join(REPO_ROOT, "tests", "benchmarks", "results", "toon-vello-fork.json");
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
    if (url.pathname === "/__toon-vello-fork-harness__") {
      response.writeHead(200, { "content-type": MIME[".html"] });
      response.end(
        "<!doctype html><html><head><title>toon-vello fork probe</title></head><body></body></html>",
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

/** 기존 fabric 프로브와 동일한 장면 구성 — 두 리포트의 비용 축을 직접 비교 가능하게. */
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

describeProbe("toon-vello fork track: external GPUDevice adoption + L4 texture sharing", () => {
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
      await attemptPage.goto(`${baseUrl}/__toon-vello-fork-harness__`);
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
    "adopts the fabric GPUDevice and shares vello output with zero readback",
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
          ) => Promise<Record<string, unknown>>;
          const module = await importModule(input.moduleUrl);
          await (module.default as () => Promise<unknown>)();

          const wasmExports = Object.keys(module).sort();
          const hasAdoption =
            typeof module.adopt_gpu_device === "function"
            && typeof module.render_scene_gpu_texture_json === "function";
          if (!hasAdoption) {
            return {
              trackB: false,
              wasmExports,
              reason:
                "pkg-gpu was not built on build track B — rebuild with "
                + "`wasm-pack build --target web --release --out-dir pkg-gpu -- --features lottie,fabric`",
            };
          }

          const gpu = (navigator as { gpu?: GPU }).gpu;
          if (!gpu) throw new Error("navigator.gpu missing despite wasm probe success");
          const adapter = await gpu.requestAdapter();
          if (!adapter) throw new Error("no adapter for fabric device");
          // StudioGpuFabric 소유 디바이스 — 필터 커널과 vello 가 공유해야 하는 그 객체.
          const fabricDevice = await adapter.requestDevice();

          // (a) 주입. 첫 렌더 전에 호출해야 하며, 이후 wasm 의 디바이스는 이 객체여야 한다.
          (module.adopt_gpu_device as (device: GPUDevice) => void)(fabricDevice);
          const adoptedFlag = (module.fabric_device_adopted as () => boolean)();
          const handle = (module.fabric_device_handle as () => unknown)();
          const sameDeviceObject = handle === fabricDevice;

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

          // 공유된 텍스처를 fabric 디바이스가 실제로 바인딩·샘플링할 수 있는지 검증하는
          // 커널(rgba8unorm 텍스처 → u32-packed storage buffer). 필터 런타임과 같은
          // storage-buffer 아키텍처를 쓰되, 입력은 readback 이 아니라 텍스처 바인딩이다.
          const samplePipeline = fabricDevice.createComputePipeline({
            layout: "auto",
            compute: {
              module: fabricDevice.createShaderModule({
                code: `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> out: array<u32>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let dims = textureDimensions(src);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  let texel = textureLoad(src, vec2<i32>(i32(id.x), i32(id.y)), 0);
  let r = u32(round(texel.r * 255.0));
  let g = u32(round(texel.g * 255.0));
  let b = u32(round(texel.b * 255.0));
  let a = u32(round(texel.a * 255.0));
  out[id.y * dims.x + id.x] = r | (g << 8u) | (b << 16u) | (a << 24u);
}`,
              }),
              entryPoint: "main",
            },
          });

          const rows: Array<Record<string, unknown>> = [];
          let l4BindingAccepted = true;
          let l4ValidationError: string | null = null;
          let pixelParity = true;
          let pixelParityDetail: string | null = null;

          for (const { size, sceneJson } of input.scenes) {
            const byteLength = size * size * 4;

            // (c-1) adopted 경로: 렌더 → GPUTexture 핸들. readback 없음.
            let sharedTexture: GPUTexture | undefined;
            const adoptedSamples = await timed(async () => {
              const previous = sharedTexture;
              sharedTexture = (await (
                module.render_scene_gpu_texture_json as (json: string) => Promise<GPUTexture>
              )(sceneJson)) as GPUTexture;
              previous?.destroy();
              await fabricDevice.queue.onSubmittedWorkDone();
            });
            if (!sharedTexture) throw new Error("adopted render produced no texture");

            // (b-1) L3 — 같은 디바이스 GPU copy 가 검증 오류 없이 통과하는지.
            const copyTarget = fabricDevice.createTexture({
              size: { width: size, height: size },
              format: "rgba8unorm",
              usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
            });
            const sameDeviceCopySamples = await timed(async () => {
              const encoder = fabricDevice.createCommandEncoder();
              encoder.copyTextureToTexture(
                { texture: sharedTexture as GPUTexture },
                { texture: copyTarget },
                { width: size, height: size },
              );
              fabricDevice.queue.submit([encoder.finish()]);
              await fabricDevice.queue.onSubmittedWorkDone();
            });

            // (b-2) L4 — 공유 텍스처를 바인드그룹에 직접 넣어 컴퓨트 패스에서 소비.
            const storage = fabricDevice.createBuffer({
              size: byteLength,
              usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            fabricDevice.pushErrorScope("validation");
            const bindGroup = fabricDevice.createBindGroup({
              layout: samplePipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: (sharedTexture as GPUTexture).createView() },
                { binding: 1, resource: { buffer: storage } },
              ],
            });
            const workgroups = Math.ceil(size / 8);
            const l4Samples = await timed(async () => {
              const encoder = fabricDevice.createCommandEncoder();
              const pass = encoder.beginComputePass();
              pass.setPipeline(samplePipeline);
              pass.setBindGroup(0, bindGroup);
              pass.dispatchWorkgroups(workgroups, workgroups);
              pass.end();
              fabricDevice.queue.submit([encoder.finish()]);
              await fabricDevice.queue.onSubmittedWorkDone();
            });
            const bindError = await fabricDevice.popErrorScope();
            if (bindError) {
              l4BindingAccepted = false;
              l4ValidationError = bindError.message;
            }

            // (d) 픽셀 동등성 — L4 커널이 읽어낸 바이트 vs 기존 L0 경로의 렌더 결과.
            const readback = fabricDevice.createBuffer({
              size: byteLength,
              usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            {
              const encoder = fabricDevice.createCommandEncoder();
              encoder.copyBufferToBuffer(storage, 0, readback, 0, byteLength);
              fabricDevice.queue.submit([encoder.finish()]);
              await readback.mapAsync(GPUMapMode.READ);
              const shared = new Uint8Array(readback.getMappedRange().slice(0));
              readback.unmap();
              const reference = (await (
                module.render_scene_gpu_json as (json: string) => Promise<Uint8Array>
              )(sceneJson)) as Uint8Array;
              if (reference.length !== shared.length) {
                pixelParity = false;
                pixelParityDetail = `length ${reference.length} vs ${shared.length} @${size}`;
              } else {
                for (let index = 0; index < shared.length; index += 1) {
                  if (shared[index] !== reference[index]) {
                    pixelParity = false;
                    pixelParityDetail = `byte ${index} ${String(shared[index])} vs ${String(reference[index])} @${size}`;
                    break;
                  }
                }
              }
            }

            // (c-2) 기존 L0 경로 비용을 같은 실행·같은 기기에서 재측정해 나란히 기록한다.
            let l0Pixels = new Uint8Array(0) as Uint8Array;
            const l0RenderSamples = await timed(async () => {
              l0Pixels = (await (
                module.render_scene_gpu_json as (json: string) => Promise<Uint8Array>
              )(sceneJson)) as Uint8Array;
            });
            const uploadTarget = fabricDevice.createTexture({
              size: { width: size, height: size },
              format: "rgba8unorm",
              usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
            });
            const l0UploadSamples = await timed(async () => {
              fabricDevice.queue.writeTexture(
                { texture: uploadTarget },
                l0Pixels as unknown as BufferSource,
                { bytesPerRow: size * 4 },
                { width: size, height: size },
              );
              await fabricDevice.queue.onSubmittedWorkDone();
            });

            const adoptedP50 = p50(adoptedSamples);
            const l0ExchangeP50 = p50(l0RenderSamples) + p50(l0UploadSamples);
            rows.push({
              size,
              bytes: byteLength,
              adoptedRenderToSharedTextureP50Ms: adoptedP50,
              l4BindAndConsumeP50Ms: p50(l4Samples),
              sameDeviceCopyP50Ms: p50(sameDeviceCopySamples),
              l0RenderReadbackP50Ms: p50(l0RenderSamples),
              l0UploadToFabricP50Ms: p50(l0UploadSamples),
              l0ExchangeP50Ms: l0ExchangeP50,
              exchangeSpeedupVsL0: l0ExchangeP50 / adoptedP50,
            });

            readback.destroy();
            storage.destroy();
            copyTarget.destroy();
            uploadTarget.destroy();
            (sharedTexture as GPUTexture).destroy();
          }

          fabricDevice.destroy();
          return {
            trackB: true,
            wasmExports,
            adoption: { adoptedFlag, sameDeviceObject },
            l4: { bindingAccepted: l4BindingAccepted, validationError: l4ValidationError },
            pixelParity: { equal: pixelParity, detail: pixelParityDetail },
            rows,
          };
        },
        {
          moduleUrl: `${baseUrl}/crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js`,
          scenes,
          samples: TIMED_SAMPLES,
        },
      )) as {
        trackB: boolean;
        wasmExports: string[];
        reason?: string;
        adoption?: { adoptedFlag: boolean; sameDeviceObject: boolean };
        l4?: { bindingAccepted: boolean; validationError: string | null };
        pixelParity?: { equal: boolean; detail: string | null };
        rows?: Array<Record<string, unknown>>;
      };

      expect(payload.trackB, payload.reason ?? "pkg-gpu is not a track B artifact").toBe(true);
      // (a) 주입된 디바이스가 wasm 이 실제로 쓰는 디바이스와 동일 객체.
      expect(payload.adoption?.adoptedFlag).toBe(true);
      expect(
        payload.adoption?.sameDeviceObject,
        "fabric_device_handle() is not the JS-created GPUDevice — adoption did not take",
      ).toBe(true);
      // (b) 공유 텍스처가 같은 디바이스에서 검증 오류 없이 소비된다.
      expect(
        payload.l4?.bindingAccepted,
        `L4 texture binding rejected: ${payload.l4?.validationError ?? "unknown"}`,
      ).toBe(true);
      // (d) 패치가 렌더 결과를 바꾸지 않는다.
      expect(
        payload.pixelParity?.equal,
        `adopted-device output diverged from the L0 lane: ${payload.pixelParity?.detail ?? ""}`,
      ).toBe(true);
      for (const row of payload.rows ?? []) {
        expect(row.adoptedRenderToSharedTextureP50Ms).toBeGreaterThan(0);
        expect(row.l0ExchangeP50Ms).toBeGreaterThan(0);
      }

      const report = {
        harness:
          "packages/studio-engine-vello/src/__tests__/toon-vello-fork-browser-probe.test.ts (TOON_VELLO_FORK_PROBE=1)",
        measuredAt: new Date().toISOString(),
        browser: { launch: launchLabel, version: browser.version() },
        adapter: probe.adapter ?? null,
        forkTrack: {
          vendor: "crates/vendor/wgpu-toon (crates.io wgpu 29.0.4 + TOON-PATCH 0001, feature `toon-fabric`)",
          upstreamCrateSha256:
            "76e8840e1ba2881d4cbb18d2147627a56af426ff064c0401eb0c8410c6325d07",
          buildTrackA: "cargo check --target wasm32-unknown-unknown --features lottie (toon-fabric off; vendored crate is API-identical to upstream)",
          buildTrackB: "wasm-pack build --target web --release --out-dir pkg-gpu -- --features lottie,fabric",
          patchSurface: [
            "wgpu::webgpu public handle module (backport of wgpu 30.0.0)",
            "Device::as_webgpu / Queue::as_webgpu / Texture::as_webgpu (backport of wgpu 30.0.0)",
            "Device::create_texture_from_webgpu_handle (backport of wgpu 30.0.0, minus DropCallback)",
            "Device::from_webgpu_handle — external GPUDevice/GPUQueue adoption; absent from wgpu 30 too, upstream PR candidate (V12 §5.4)",
          ],
        },
        note:
          "wall-clock includes submit->completion roundtrip floor; adoptedRenderToSharedTexture has no readback and no pixel array crossing the wasm boundary (V12 §6.3 L4), l0Exchange is the pre-fork baseline measured in the same run",
        wasmExports: payload.wasmExports,
        adoption: payload.adoption,
        l4TextureSharing: payload.l4,
        pixelParityVsL0Lane: payload.pixelParity,
        exchangeCost: payload.rows,
      };
      await writeFile(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`);
    },
    240_000,
  );
});
