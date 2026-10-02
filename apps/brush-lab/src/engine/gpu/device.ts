import { LaneUnavailableError, WgslCompileError } from "../core/errors";

import { MAX_CANVAS_PX, PARAMS_BYTES, WET_WORKGROUP_STORAGE_BYTES, WORKGROUP_1D } from "./layout";

import type { LaneReasonCode, WgslCompileMessage } from "../core/errors";
import type { GpuAdapterInfo } from "../core/types";

/**
 * WebGPU 장치 프로브·요청·셰이더 컴파일. 엔진은 `navigator`를 직접 만지지 않고 `GPU` 객체를 주입받는다.
 * 프로브는 절대 throw하지 않고 구조화 결과(fail-visible)를 돌려준다(ADR-0018).
 */

export interface GpuProbeInput {
  gpu: GPU | null | undefined;
  /** 필요한 한도(이름 → 최솟값). 생략 시 SUMI_REQUIRED_LIMITS. */
  requiredLimits?: Partial<Record<string, number>>;
  /** 어댑터 요청 옵션(기본 high-performance). */
  powerPreference?: GPUPowerPreference;
}

export interface GpuProbeResult {
  status: "supported" | "unavailable";
  reasons: LaneReasonCode[];
  adapterInfo: GpuAdapterInfo | null;
  features: string[];
  limits: Record<string, number>;
  /** swiftshader/llvmpipe/lavapipe/fallback 어댑터면 true. 판단 불가면 null. */
  softwareRenderer: boolean | null;
  /** 미달 한도(이름: 실제/필요). */
  limitShortfalls: { name: string; actual: number; required: number }[];
}

/** Sumi compute 파이프라인이 요구하는 최소 한도. 기본 WebGPU 한도 안에서 모두 만족한다. */
export const SUMI_REQUIRED_LIMITS: Readonly<Record<string, number>> = {
  /**
   * 기본 가족: group 0(dabs·bins·refs·table) + group 1(stroke·wet·document) + group 2(indirect) = 8.
   * 습식 가족은 dabs·bins·refs를 바인딩하지 않는 별도 레이아웃(group 0..3)이라 가족마다 8개 이하다(`WET_FAMILIES`).
   * 모두 기본 한도(8) 안이다.
   */
  maxStorageBuffersPerShaderStage: 8,
  /** 습식 가족이 group 0..3(group 3 = 확장 풀·스냅샷·종이·서브스텝 상수·유화 스크래치·표시 출력)을 쓴다. 기본 한도(4) 안이다. */
  maxBindGroups: 4,
  maxComputeWorkgroupSizeX: WORKGROUP_1D,
  maxComputeInvocationsPerWorkgroup: WORKGROUP_1D,
  /** 수채 물 스텝이 종이 파생 18×18 배열(h·absorb·capBase·κ 4클래스 ≈ 9 KB)을 워크그룹 공유 메모리에 둔다. 기본 한도(16 KiB) 안이다. */
  maxComputeWorkgroupStorageSize: WET_WORKGROUP_STORAGE_BYTES,
  maxComputeWorkgroupsPerDimension: 16_384,
  maxTextureDimension2D: MAX_CANVAS_PX,
  maxUniformBufferBindingSize: PARAMS_BYTES,
  /** 2048² 문서(64 MiB)가 storage 버퍼 1개에 들어가야 한다. */
  maxStorageBufferBindingSize: MAX_CANVAS_PX * MAX_CANVAS_PX * 16,
  maxBufferSize: MAX_CANVAS_PX * MAX_CANVAS_PX * 16,
};

/** 프로브 결과에 기록하는 한도 키(GPUSupportedLimits는 열거 불가 getter라 명시 목록으로 읽는다). */
export const PROBED_LIMIT_KEYS: readonly string[] = [
  "maxTextureDimension2D",
  "maxBindGroups",
  "maxStorageBuffersPerShaderStage",
  "maxStorageTexturesPerShaderStage",
  "maxUniformBufferBindingSize",
  "maxStorageBufferBindingSize",
  "maxBufferSize",
  "maxComputeWorkgroupStorageSize",
  "maxComputeInvocationsPerWorkgroup",
  "maxComputeWorkgroupSizeX",
  "maxComputeWorkgroupSizeY",
  "maxComputeWorkgroupsPerDimension",
  "maxVertexBuffers",
  "maxVertexAttributes",
  "maxColorAttachments",
];

/** 선택 기능(있으면 요청). */
export const OPTIONAL_FEATURES: readonly string[] = ["timestamp-query", "shader-f16"];

const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|lavapipe|software|warp\b|microsoft basic render/i;

function readLimits(limits: GPUSupportedLimits | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!limits) return out;
  const bag = limits as unknown as Record<string, unknown>;
  for (const key of PROBED_LIMIT_KEYS) {
    const v = bag[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

/**
 * 장치가 **실제로 받은** 한도(`device.limits`). 어댑터 한도가 아니다: 장치는 `requiredLimits`로 요청한 만큼(+ 기본값)만 가진다.
 * 버퍼 예산 검증은 항상 이 값으로 한다(어댑터 한도로 통과시키면 장치가 만들 수 없는 버퍼가 무음 검증 오류가 된다).
 */
export function readDeviceLimits(device: GPUDevice): Record<string, number> {
  return readLimits(device.limits);
}

/**
 * 호출자가 준 한도(`supplied`, 보통 생략)와 실제 장치 한도 중 **더 작은 쪽**. 어댑터 한도 같은 더 큰 값이 장치 한도를 가리지 못한다.
 * 키마다 장치 값이 없으면 호출자 값을, 호출자 값이 없으면 장치 값을 쓴다(테스트가 작은 한도를 주입해 예산 초과를 만들 수 있다).
 */
export function effectiveDeviceLimits(device: GPUDevice, supplied?: Readonly<Record<string, number>>): Record<string, number> {
  const actual = readDeviceLimits(device);
  if (!supplied) return actual;
  const out: Record<string, number> = { ...supplied, ...actual };
  for (const [name, value] of Object.entries(supplied)) {
    const have = actual[name];
    out[name] = have === undefined ? value : Math.min(have, value);
  }
  return out;
}

function readAdapterInfo(adapter: GPUAdapter): GpuAdapterInfo | null {
  const raw = (adapter as unknown as { info?: Partial<GPUAdapterInfo> | null }).info;
  if (!raw || typeof raw !== "object") return null;
  return {
    vendor: String(raw.vendor ?? ""),
    architecture: String(raw.architecture ?? ""),
    device: String(raw.device ?? ""),
    description: String(raw.description ?? ""),
  };
}

/** 어댑터 정보·플래그로 소프트웨어 렌더러 여부를 판단한다. */
export function detectSoftwareRenderer(info: GpuAdapterInfo | null, isFallbackAdapter: boolean | undefined): boolean | null {
  if (isFallbackAdapter === true) return true;
  if (!info) return null;
  const text = `${info.vendor} ${info.architecture} ${info.device} ${info.description}`;
  if (SOFTWARE_RENDERER_PATTERN.test(text)) return true;
  if (text.trim().length === 0) return null;
  return false;
}

/** 한도 미달 목록. */
export function limitShortfalls(
  actual: Record<string, number>,
  required: Partial<Record<string, number>>,
): { name: string; actual: number; required: number }[] {
  const out: { name: string; actual: number; required: number }[] = [];
  for (const [name, need] of Object.entries(required)) {
    if (need === undefined) continue;
    const have = actual[name];
    if (have === undefined) continue; // 브라우저가 노출하지 않는 한도는 판단하지 않는다(요청 시 드러난다).
    if (have < need) out.push({ name, actual: have, required: need });
  }
  return out;
}

function unavailable(reasons: LaneReasonCode[], partial: Partial<GpuProbeResult> = {}): GpuProbeResult {
  return {
    status: "unavailable",
    reasons,
    adapterInfo: null,
    features: [],
    limits: {},
    softwareRenderer: null,
    limitShortfalls: [],
    ...partial,
  };
}

/**
 * WebGPU 가용성 프로브(어댑터 포함). throw하지 않는다.
 * - gpu 부재 → `webgpu-api-unavailable`
 * - requestAdapter null/예외 → `adapter-unavailable`
 * - 한도 미달 → `limit-exceeded`(미달 목록 포함)
 * 레인은 이 함수로 어댑터를 받아 그대로 `requestSumiDevice`에 넘긴다(requestAdapter 1회).
 */
export async function probeWebGpuAdapter(input: GpuProbeInput): Promise<{ result: GpuProbeResult; adapter: GPUAdapter | null }> {
  const gpu = input.gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") {
    return { result: unavailable(["webgpu-api-unavailable"]), adapter: null };
  }
  let adapter: GPUAdapter | null;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: input.powerPreference ?? "high-performance" });
  } catch {
    return { result: unavailable(["adapter-unavailable"]), adapter: null };
  }
  if (!adapter) return { result: unavailable(["adapter-unavailable"]), adapter: null };
  const adapterInfo = readAdapterInfo(adapter);
  const isFallback = (adapter as unknown as { info?: { isFallbackAdapter?: boolean } }).info?.isFallbackAdapter;
  const softwareRenderer = detectSoftwareRenderer(adapterInfo, isFallback);
  const features = Array.from((adapter.features as unknown as Iterable<string>) ?? []).sort();
  const limits = readLimits(adapter.limits);
  const shortfalls = limitShortfalls(limits, input.requiredLimits ?? SUMI_REQUIRED_LIMITS);
  if (shortfalls.length > 0) {
    return {
      result: unavailable(["limit-exceeded"], { adapterInfo, features, limits, softwareRenderer, limitShortfalls: shortfalls }),
      adapter,
    };
  }
  return { result: { status: "supported", reasons: [], adapterInfo, features, limits, softwareRenderer, limitShortfalls: [] }, adapter };
}

/** WebGPU 가용성 프로브(결과만). */
export async function probeWebGpu(input: GpuProbeInput): Promise<GpuProbeResult> {
  return (await probeWebGpuAdapter(input)).result;
}

/** 프로브 결과를 요약 문자열로(배너·리포트용). */
export function describeProbe(result: GpuProbeResult): string {
  if (result.status === "unavailable") {
    const limits = result.limitShortfalls.map((s) => `${s.name} ${s.actual} < ${s.required}`).join(", ");
    return `unavailable (${result.reasons.join(", ")}${limits ? `; ${limits}` : ""})`;
  }
  const info = result.adapterInfo;
  const name = info ? `${info.vendor} ${info.architecture} ${info.device}`.trim() : "unknown adapter";
  return `supported: ${name}${result.softwareRenderer ? " [software renderer]" : ""}; features ${result.features.join(", ") || "none"}`;
}

export interface SumiDeviceRequest {
  /** 선택 기능 중 어댑터가 지원하는 것만 요청한다. 기본 OPTIONAL_FEATURES. */
  optionalFeatures?: readonly string[];
  /** 요청할 한도(어댑터 한도로 clamp). 기본 SUMI_REQUIRED_LIMITS 중 기본값보다 큰 항목만. */
  requiredLimits?: Partial<Record<string, number>>;
  onLost?: (info: GPUDeviceLostInfo) => void;
}

/**
 * 장치를 요청한다. timestamp-query·shader-f16은 가능할 때만 요청하고 실패는 `LaneUnavailableError("device-request-failed")`로 던진다.
 */
export async function requestSumiDevice(
  adapter: GPUAdapter,
  request: SumiDeviceRequest = {},
): Promise<{ device: GPUDevice; features: Set<string> }> {
  const want = request.optionalFeatures ?? OPTIONAL_FEATURES;
  const adapterFeatures = adapter.features as unknown as { has(name: string): boolean };
  const requiredFeatures = want.filter((f) => adapterFeatures.has(f)) as GPUFeatureName[];
  const adapterLimits = readLimits(adapter.limits);
  const requiredLimits: Record<string, number> = {};
  for (const [name, need] of Object.entries(request.requiredLimits ?? SUMI_REQUIRED_LIMITS)) {
    if (need === undefined) continue;
    const have = adapterLimits[name];
    if (have === undefined) continue;
    // 기본 한도보다 큰 요구만 요청한다(작은 값은 기본으로 충분하다). 어댑터 한도로 clamp한 값이 기본 이하면 요청할 것이 없다.
    const clamped = Math.min(need, have);
    if (clamped > DEFAULT_LIMITS[name]!) requiredLimits[name] = clamped;
  }
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice({ label: "sumi-device", requiredFeatures, requiredLimits });
  } catch (error) {
    throw new LaneUnavailableError("device-request-failed", `WebGPU 장치 요청 실패: ${String(error)}`, {
      requiredFeatures,
      requiredLimits,
    });
  }
  const features = new Set<string>(Array.from((device.features as unknown as Iterable<string>) ?? []));
  if (request.onLost) {
    void device.lost.then((info) => request.onLost?.(info));
  }
  return { device, features };
}

/** WebGPU 기본 한도(요청 생략 가능 여부 판단용, 사양 표 일부). */
const DEFAULT_LIMITS: Record<string, number> = {
  maxStorageBuffersPerShaderStage: 8,
  maxBindGroups: 4,
  maxComputeWorkgroupSizeX: 256,
  maxComputeInvocationsPerWorkgroup: 256,
  maxComputeWorkgroupStorageSize: 16384,
  maxComputeWorkgroupsPerDimension: 65535,
  maxTextureDimension2D: 8192,
  maxUniformBufferBindingSize: 65536,
  maxStorageBufferBindingSize: 134217728,
  maxBufferSize: 268435456,
};

/**
 * 셰이더 모듈을 만들고 `getCompilationInfo`의 error 메시지를 `WgslCompileError`로 표면화한다.
 * (studio-engine-registry 미사용 — 엔진 코어는 서비스 패키지에 의존하지 않는다.)
 */
export async function compileShaderOrThrow(device: GPUDevice, label: string, code: string): Promise<GPUShaderModule> {
  const module = device.createShaderModule({ label, code });
  const info = await module.getCompilationInfo();
  const errors: WgslCompileMessage[] = [];
  for (const m of info.messages) {
    if (m.type !== "error") continue;
    errors.push({ message: m.message, lineNum: m.lineNum, linePos: m.linePos });
  }
  if (errors.length > 0) throw new WgslCompileError(label, errors);
  return module;
}
