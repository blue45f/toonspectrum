// 홍보영상 제작 4단계(기획 → 컷·장면 → 음악·내레이션 → 내보내기)의 진행 상태 — 화면 상단 단계 안내가 쓴다.
import type { PromoPreflightIssue } from "./promo-preflight";
import type { PromoProject } from "./promo-model";

export type PromoStepId = "plan" | "cuts" | "sound" | "export";

/** done=끝남, current=지금 할 차례, todo=앞 단계가 먼저, optional=건너뛰어도 되는 단계. */
export type PromoStepState = "done" | "current" | "todo" | "optional";

export interface PromoStepStatus {
  readonly id: PromoStepId;
  readonly state: PromoStepState;
}

/** 단계별 화면 앵커 — 단계 안내에서 해당 카드로 바로 이동한다. */
export const PROMO_STEP_ANCHOR: Readonly<Record<PromoStepId, string>> = {
  plan: "promo-step-plan",
  cuts: "promo-step-cuts",
  sound: "promo-step-sound",
  export: "promo-step-export",
};

/** 권장 컷 수 — 15초 예고편 기준 3~6컷이 읽기 편하다(자동 판정이 아닌 안내 문구용). */
export const PROMO_RECOMMENDED_PANELS = { min: 3, max: 6 } as const;

/**
 * 단계 상태 — 반드시 해야 하는 일(컷 추가)과 권장·선택 단계(줄거리, 음악)를 구분한다.
 * - 기획: 줄거리를 쓰면 완료, 비어 있으면 권장(AI 콘티 정확도에만 영향).
 * - 컷: 한 컷 이상이면 완료, 없으면 지금 할 차례.
 * - 음악·내레이션: 넣으면 완료, 없으면 선택(무음 저장 가능).
 * - 내보내기: 컷이 있고 오류가 없으면 지금 할 차례, 아니면 대기.
 */
export function promoStepStatuses(
  project: Pick<PromoProject, "synopsis" | "panels" | "audio" | "voiceover">,
  issues: readonly Pick<PromoPreflightIssue, "severity">[],
): PromoStepStatus[] {
  const cutsDone = project.panels.length > 0;
  const exportReady = cutsDone && !issues.some((issue) => issue.severity === "error");
  return [
    { id: "plan", state: project.synopsis.trim() ? "done" : "optional" },
    { id: "cuts", state: cutsDone ? "done" : "current" },
    { id: "sound", state: project.audio || project.voiceover ? "done" : "optional" },
    { id: "export", state: exportReady ? "current" : "todo" },
  ];
}
