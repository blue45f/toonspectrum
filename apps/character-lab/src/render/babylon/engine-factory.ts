/**
 * 브라우저 엔진 팩토리(브라우저 미검증): 요청 backend 하나만 만든다.
 * - WebGPU: `new WebGPUEngine(canvas, …)` → initAsync(timeout) → `_device.lost`(구조적 접근) → lost 보고.
 * - WebGL2: `new Engine(canvas, true, …)`; Babylon이 WebGL1로 조용히 내려가면(webGLVersion < 2) 실패로 처리한다.
 * 실패·timeout은 engine-init.ts(순수)가 부분 disposer로 정리하고 LabFailure로 reject한다. 다른 backend 시도 없음.
 */
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine.js";

import { failVisible } from "../../contracts";
import { attachDeviceLost, createLostReporter, initializeEngine } from "../engine-init";

import { mapEngineCaps, readAdapterInfo } from "./engine-capabilities";

import type { EngineBackend, EngineDiagnostics, LabFailure } from "../../contracts";
import type { DeviceLostInfoLike } from "../engine-init";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";

export interface BabylonEngineHandle {
  readonly engine: AbstractEngine;
  readonly diagnostics: EngineDiagnostics;
  /** lost 리스너 해제 + 엔진 dispose */
  dispose(): void;
}

export interface CreateBabylonEngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly backend: EngineBackend;
  readonly initTimeoutMs: number;
  onLost(failure: LabFailure): void;
  readonly now?: () => number;
}

export async function createBabylonEngine(options: CreateBabylonEngineOptions): Promise<BabylonEngineHandle> {
  const now = options.now ?? (() => Date.now());
  const report = createLostReporter(options.backend, options.onLost, now);
  if (options.backend === "webgpu") {
    const { engine } = await initializeEngine<WebGPUEngine>({
      backend: "webgpu",
      create: () => new WebGPUEngine(options.canvas, { antialias: true, powerPreference: "high-performance", enableAllFeatures: false, setMaximumLimits: false }),
      init: (created) => created.initAsync(),
      timeoutMs: options.initTimeoutMs,
      now,
    });
    const device = Reflect.get(engine, "_device") as { lost?: Promise<DeviceLostInfoLike> } | undefined;
    attachDeviceLost(device?.lost, report);
    const adapter = readAdapterInfo(engine);
    if (adapter?.isFallbackAdapter) {
      engine.dispose();
      throw failVisible("webgpu-fallback-adapter", "WebGPU 어댑터가 소프트웨어 폴백입니다. 성능 보장이 없어 중단합니다.", undefined, now());
    }
    const info = engine.getInfo();
    return {
      engine,
      diagnostics: { backend: "webgpu", engineVersion: WebGPUEngine.Version, adapter, renderer: info.renderer, caps: mapEngineCaps(engine) },
      dispose: () => engine.dispose(),
    };
  }
  const { engine } = await initializeEngine<Engine>({
    backend: "webgl2",
    create: () =>
      new Engine(options.canvas, true, {
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        failIfMajorPerformanceCaveat: true,
        powerPreference: "high-performance",
        doNotHandleContextLost: true,
        useExactSrgbConversions: true,
        stencil: true,
      }),
    init: async (created) => {
      if (created.webGLVersion < 2) {
        throw failVisible("webgl2-unsupported", `WebGL2 컨텍스트 대신 WebGL${created.webGLVersion}가 만들어졌습니다. 자동 하향 없이 중단합니다.`, undefined, now());
      }
    },
    timeoutMs: options.initTimeoutMs,
    now,
  });
  const onContextLost = (): void => report({ reason: "webglcontextlost" });
  options.canvas.addEventListener("webglcontextlost", onContextLost);
  const observer = engine.onContextLostObservable.add(() => report({ reason: "context-lost" }));
  const info = engine.getGlInfo();
  return {
    engine,
    diagnostics: {
      backend: "webgl2",
      engineVersion: Engine.Version,
      adapter: { vendor: info.vendor, description: info.renderer, isFallbackAdapter: false },
      renderer: info.renderer,
      caps: mapEngineCaps(engine),
    },
    dispose() {
      options.canvas.removeEventListener("webglcontextlost", onContextLost);
      engine.onContextLostObservable.remove(observer);
      engine.dispose();
    },
  };
}
