import { LANE_IDS } from "./lab-store";

import type { LaneReasonCode } from "../../engine/core/errors";
import type { LaneCapabilityReport, LaneDescriptor, LaneId, LaneStatus } from "../../lanes/lane";

/** 셀렉트 값 등 문자열이 LaneId인지. */
export function isLaneId(value: string): value is LaneId {
  return (LANE_IDS as readonly string[]).includes(value);
}

/** 레인 unavailable 사유 코드 → 한글 설명(배너·셀렉터 공용). */
export const REASON_LABELS: Record<LaneReasonCode, string> = {
  "webgpu-api-unavailable": "이 브라우저에 navigator.gpu(WebGPU API)가 없음",
  "adapter-unavailable": "WebGPU 어댑터를 얻지 못함",
  "device-request-failed": "GPUDevice 요청 실패",
  "feature-missing": "필요한 GPU feature 누락",
  "limit-exceeded": "GPU 한도(limits) 부족",
  "dom-unavailable": "DOM/캔버스를 쓸 수 없는 환경",
  "webgl2-unavailable": "WebGL2 컨텍스트를 만들 수 없음",
  "wasm-artifact-missing": "wasm 산출물이 없음",
  "wasm-integrity-mismatch": "wasm INTEGRITY 해시 불일치",
  "wgsl-compile-error": "WGSL 컴파일 오류",
  "device-lost": "GPU 장치 유실",
  "not-implemented": "미구현(reserved) 레인",
};

export const STATUS_LABELS: Record<LaneStatus, string> = {
  implemented: "구현됨",
  "browser-verification-required": "브라우저 검증 필요",
  reserved: "예약(미구현)",
};

export const KIND_LABELS: Record<LaneDescriptor["kind"], string> = {
  baseline: "기준선",
  candidate: "후보",
  comparison: "비교",
};

export function describeReason(code: LaneReasonCode): string {
  return REASON_LABELS[code] ?? code;
}

export function findDescriptor(registry: readonly LaneDescriptor[], id: LaneId): LaneDescriptor | null {
  return registry.find((d) => d.id === id) ?? null;
}

/** 셀렉터에서 선택 가능한지와 비활성 사유. */
export function laneAvailability(
  desc: LaneDescriptor,
  capability: LaneCapabilityReport | null,
): { enabled: boolean; reason: string | null } {
  if (desc.status === "reserved") {
    return { enabled: false, reason: STATUS_LABELS.reserved };
  }
  if (capability && capability.status === "unavailable") {
    const reasons = capability.reasons.map((r) => `${r}: ${describeReason(r)}`).join(", ");
    return { enabled: false, reason: reasons || "unavailable" };
  }
  return { enabled: true, reason: null };
}

/** 활성 엔진 배지 문구. */
export function capabilityBadge(capability: LaneCapabilityReport | null): string {
  if (!capability) return "probe 대기";
  if (capability.status === "unavailable") {
    return `unavailable (${capability.reasons.join(", ") || "사유 없음"})`;
  }
  const parts = ["supported"];
  if (capability.adapterInfo) {
    const a = capability.adapterInfo;
    const label = [a.vendor, a.architecture, a.device].filter((s) => s.length > 0).join("/");
    parts.push(`adapter ${label || "(정보 없음)"}`);
  } else {
    parts.push("adapter 없음(CPU)");
  }
  if (capability.softwareRenderer === true) parts.push("softwareRenderer");
  else if (capability.softwareRenderer === false) parts.push("hardware");
  else parts.push("softwareRenderer 판단 불가");
  return parts.join(" · ");
}
