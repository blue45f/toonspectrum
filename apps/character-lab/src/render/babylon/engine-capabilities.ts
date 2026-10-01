/**
 * 엔진 능력·어댑터 정보 읽기(순수에 가까운 구조적 접근). DOM 의존 모듈(WebGPUEngine·Engine)을 import하지 않아
 * NullEngine 하네스가 Node에서 검증할 수 있다. 실제 엔진 생성은 engine-factory.ts(브라우저 전용)가 한다.
 */
import type { EngineAdapterInfo, EngineCaps } from "../../contracts";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";

export function mapEngineCaps(engine: AbstractEngine): EngineCaps {
  const caps = engine.getCaps();
  const extensions = (engine as { enabledExtensions?: readonly string[] }).enabledExtensions ?? [];
  return {
    maxTextureSize: caps.maxTextureSize,
    computeShaders: caps.supportComputeShaders === true,
    multiRenderTargets: caps.drawBuffersExtension === true,
    floatReadback: caps.textureFloatRender === true,
    timestampQuery: engine.isWebGPU ? extensions.includes("timestamp-query") : Boolean(caps.timerQuery),
  };
}

interface AdapterInfoLike {
  readonly vendor?: string;
  readonly architecture?: string;
  readonly device?: string;
  readonly description?: string;
  readonly isFallbackAdapter?: boolean;
}

export function readAdapterInfo(engine: object): EngineAdapterInfo | null {
  const info = Reflect.get(engine, "_adapterInfo") as AdapterInfoLike | undefined;
  if (!info) return null;
  return {
    ...(info.vendor ? { vendor: info.vendor } : {}),
    ...(info.architecture ? { architecture: info.architecture } : {}),
    ...(info.device ? { device: info.device } : {}),
    ...(info.description ? { description: info.description } : {}),
    ...(info.isFallbackAdapter !== undefined ? { isFallbackAdapter: info.isFallbackAdapter } : {}),
  };
}
