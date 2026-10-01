/**
 * 백엔드 선택(순수). 요청한 backend 하나만 판정하고 다른 backend를 제안하지 않는다(ADR-0018).
 *
 * `probeGpu`는 GPUDevice를 할당하지 않고 `requestAdapter`만 호출한다. DOM 의존(WebGL2 캔버스 probe)은
 * 주입 가능한 `webgl2` 함수로 분리해 Node 테스트에서는 값을 넣어 준다.
 */
import { ENGINE_BACKEND_LABELS_KO, WEBGPU_MIN_LIMITS } from "../../contracts";

import type { BackendDecision, EngineBackend, GpuAdapterProbe, GpuProbe } from "../../contracts";

/** WebGPU 어댑터의 구조적 타입(GPUAdapter 호환, 테스트 주입 가능) */
export interface GpuAdapterLike {
  readonly isFallbackAdapter?: boolean;
  readonly info?: { readonly isFallbackAdapter?: boolean } | undefined;
  readonly limits?: {
    readonly maxTextureDimension2D?: number;
    readonly maxBufferSize?: number;
    readonly maxStorageBufferBindingSize?: number;
    readonly maxColorAttachments?: number;
  };
  readonly features?: Iterable<string>;
}

export interface GpuLike {
  requestAdapter(options?: { readonly powerPreference?: "low-power" | "high-performance" }): Promise<GpuAdapterLike | null>;
}

/** `navigator`의 구조적 타입 */
export interface NavigatorGpuLike {
  readonly gpu?: GpuLike | undefined;
}

export interface ProbeGpuOptions {
  /** WebGL2 지원 여부 판정(기본: document가 있으면 캔버스 probe, 없으면 false) */
  readonly webgl2?: () => boolean;
  /** requestAdapter 대기 상한(ms). 초과하면 adapter null로 취급한다. */
  readonly timeoutMs?: number;
}

const PROBE_TIMEOUT_MS = 5_000;

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** GPUAdapter → 직렬화 가능한 probe 값(원 객체는 보관하지 않는다) */
export function describeAdapter(adapter: GpuAdapterLike): GpuAdapterProbe {
  const features: string[] = [];
  for (const feature of adapter.features ?? []) features.push(String(feature));
  features.sort();
  return {
    isFallbackAdapter: Boolean(adapter.isFallbackAdapter ?? adapter.info?.isFallbackAdapter ?? false),
    limits: {
      maxTextureDimension2D: finiteOrZero(adapter.limits?.maxTextureDimension2D),
      maxBufferSize: finiteOrZero(adapter.limits?.maxBufferSize),
      maxStorageBufferBindingSize: finiteOrZero(adapter.limits?.maxStorageBufferBindingSize),
      maxColorAttachments: finiteOrZero(adapter.limits?.maxColorAttachments),
    },
    features,
  };
}

/** 기본 WebGL2 판정: 브라우저에서만 캔버스를 만들어 본다. */
export function detectWebgl2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    if (!context) return false;
    const lose = context.getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** GPU 능력 조회. requestAdapter만 호출하며 GPUDevice는 만들지 않는다. */
export async function probeGpu(nav: NavigatorGpuLike, options: ProbeGpuOptions = {}): Promise<GpuProbe> {
  const webgl2 = (options.webgl2 ?? detectWebgl2)();
  const gpu = nav.gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") {
    return { hasNavigatorGpu: false, adapter: null, webgl2 };
  }
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const adapter = await Promise.race([gpu.requestAdapter({ powerPreference: "high-performance" }), timeout]);
    return { hasNavigatorGpu: true, adapter: adapter ? describeAdapter(adapter) : null, webgl2 };
  } catch {
    // requestAdapter 자체가 던지면 어댑터 없음으로 판정한다(사유는 selectBackend가 한글로 만든다).
    return { hasNavigatorGpu: true, adapter: null, webgl2 };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function formatMiB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MiB`;
}

/** 요청 backend만 판정한다. 차단 사유는 사용자에게 그대로 보여주는 한글이다. */
export function selectBackend(requested: EngineBackend, probe: GpuProbe): BackendDecision {
  const label = ENGINE_BACKEND_LABELS_KO[requested];
  if (requested === "webgl2") {
    if (!probe.webgl2) {
      return { ok: false, backend: requested, code: "webgl2-unsupported", reasonKo: `${label} 컨텍스트를 만들 수 없습니다. 브라우저 하드웨어 가속을 확인해 주세요.` };
    }
    return { ok: true, backend: requested };
  }
  if (!probe.hasNavigatorGpu) {
    return { ok: false, backend: requested, code: "webgpu-unsupported", reasonKo: `${label}를 지원하지 않는 브라우저입니다(navigator.gpu 없음). WebGL2를 직접 선택할 수 있습니다.` };
  }
  const adapter = probe.adapter;
  if (!adapter) {
    return { ok: false, backend: requested, code: "webgpu-no-adapter", reasonKo: `${label} 어댑터를 얻지 못했습니다(requestAdapter null). GPU 드라이버나 브라우저 플래그를 확인해 주세요.` };
  }
  if (adapter.isFallbackAdapter) {
    return { ok: false, backend: requested, code: "webgpu-fallback-adapter", reasonKo: `${label} 어댑터가 소프트웨어 폴백(isFallbackAdapter)입니다. 성능 보장이 없어 차단합니다.` };
  }
  const limits = adapter.limits;
  const violations: string[] = [];
  if (limits.maxTextureDimension2D < WEBGPU_MIN_LIMITS.maxTextureDimension2D) {
    violations.push(`maxTextureDimension2D ${limits.maxTextureDimension2D} < ${WEBGPU_MIN_LIMITS.maxTextureDimension2D}`);
  }
  if (limits.maxBufferSize < WEBGPU_MIN_LIMITS.maxBufferSize) {
    violations.push(`maxBufferSize ${formatMiB(limits.maxBufferSize)} < ${formatMiB(WEBGPU_MIN_LIMITS.maxBufferSize)}`);
  }
  if (limits.maxStorageBufferBindingSize < WEBGPU_MIN_LIMITS.maxStorageBufferBindingSize) {
    violations.push(`maxStorageBufferBindingSize ${formatMiB(limits.maxStorageBufferBindingSize)} < ${formatMiB(WEBGPU_MIN_LIMITS.maxStorageBufferBindingSize)}`);
  }
  if (limits.maxColorAttachments < WEBGPU_MIN_LIMITS.maxColorAttachments) {
    violations.push(`maxColorAttachments ${limits.maxColorAttachments} < ${WEBGPU_MIN_LIMITS.maxColorAttachments}`);
  }
  if (violations.length > 0) {
    return { ok: false, backend: requested, code: "webgpu-limits", reasonKo: `${label} 어댑터 한계가 최소 요구치에 못 미칩니다: ${violations.join(", ")}.` };
  }
  return { ok: true, backend: requested };
}
