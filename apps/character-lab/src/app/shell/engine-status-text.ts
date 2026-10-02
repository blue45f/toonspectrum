/**
 * 엔진 상태·어댑터를 사람이 읽는 한글 문구로 바꾼다. TopBar 배지와 FailureBanner가 같은 문구를 쓴다.
 * 활성 레인은 contracts/engine.ts ENGINE_LANES(문서·HUD 동일 표기)에서 찾는다.
 */
import { ENGINE_BACKEND_LABELS_KO, ENGINE_LANES } from "../../contracts";

import type { EngineBackend, EngineDiagnostics, EngineStatus } from "../../contracts";

export type EngineStatusTone = "idle" | "busy" | "ok" | "error";

export interface EngineStatusText {
  readonly tone: EngineStatusTone;
  readonly text: string;
  /** 실패·손실 시 LabFailure.detail(접힌 상태로 표시) */
  readonly detail?: string;
}

export function engineLaneLabel(backend: EngineBackend): string {
  return ENGINE_LANES.find((lane) => lane.id === `babylon-${backend}`)?.labelKo ?? ENGINE_BACKEND_LABELS_KO[backend];
}

/** 어댑터 정보를 한 줄로. 정보가 없으면 그 사실을 적는다(빈 문자열로 숨기지 않는다). */
export function describeAdapter(diagnostics: EngineDiagnostics): string {
  const adapter = diagnostics.adapter;
  const parts: string[] = [];
  if (adapter) {
    for (const value of [adapter.vendor, adapter.device ?? adapter.description, adapter.architecture]) {
      if (value && !parts.includes(value)) parts.push(value);
    }
    if (adapter.isFallbackAdapter) parts.push("(소프트웨어 fallback 어댑터)");
  }
  if (parts.length === 0 && diagnostics.renderer) parts.push(diagnostics.renderer);
  return parts.length > 0 ? parts.join(" ") : "어댑터 정보 없음";
}

export function describeEngineStatus(status: EngineStatus): EngineStatusText {
  switch (status.phase) {
    case "idle":
      return { tone: "idle", text: "엔진 미선택 — 상단에서 WebGPU 또는 WebGL2를 명시 선택하세요(자동 선택·자동 전환 없음)." };
    case "initializing":
      return { tone: "busy", text: `${engineLaneLabel(status.backend)} 초기화 중…` };
    case "ready":
      return {
        tone: "ok",
        text: `활성 엔진 ${engineLaneLabel(status.backend)} · backend ${status.backend} · ${describeAdapter(status.diagnostics)} · Babylon ${status.diagnostics.engineVersion}`,
      };
    case "failed":
      return {
        tone: "error",
        text: `${engineLaneLabel(status.backend)} 초기화 실패 [${status.failure.code}]: ${status.failure.reasonKo}`,
        ...(status.failure.detail ? { detail: status.failure.detail } : {}),
      };
    case "lost":
      return {
        tone: "error",
        text: `${engineLaneLabel(status.backend)} 장치 손실 [${status.failure.code}]: ${status.failure.reasonKo} — 엔진을 다시 선택하면 현재 레시피로 복원합니다.`,
        ...(status.failure.detail ? { detail: status.failure.detail } : {}),
      };
    default:
      return { tone: "error", text: "알 수 없는 엔진 상태" };
  }
}
