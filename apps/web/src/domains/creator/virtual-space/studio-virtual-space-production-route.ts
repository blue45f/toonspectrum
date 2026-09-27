import type { ProductionTask, ProductionTaskStatus } from "@toonstudio/core/production";

export type StudioVirtualProductionDestination = "story" | "drawing" | "review" | "production" | "assets";

export const STUDIO_VIRTUAL_PRODUCTION_DESTINATIONS: Readonly<Record<StudioVirtualProductionDestination, readonly [string, string]>> = {
  story: ["대본 데스크", "Story desk"],
  drawing: ["드로잉 스튜디오", "Drawing studio"],
  review: ["검수실", "Review room"],
  production: ["제작 관제실", "Production control"],
  assets: ["자료실", "Asset library"],
};

export const STUDIO_VIRTUAL_TASK_STATUS_LABELS: Readonly<Record<ProductionTaskStatus, readonly [string, string]>> = {
  draft: ["초안", "Draft"],
  "needs-input": ["입력 자료 대기", "Awaiting input"],
  ready: ["작업 준비", "Ready"],
  "in-progress": ["작업 중", "In progress"],
  "internal-review": ["내부 검수", "Internal review"],
  "external-review": ["외부 검수", "External review"],
  "changes-requested": ["수정 요청", "Changes requested"],
  "conditionally-approved": ["조건부 승인", "Conditionally approved"],
  approved: ["승인 완료", "Approved"],
  done: ["완료", "Done"],
  blocked: ["진행 막힘", "Blocked"],
  paused: ["잠시 보류", "Paused"],
  cancelled: ["취소", "Cancelled"],
  "out-of-scope": ["범위 제외", "Out of scope"],
};

const REVIEW_STATUSES = new Set<ProductionTaskStatus>(["internal-review", "external-review", "changes-requested", "conditionally-approved"]);
const PROCESS_DESTINATIONS: Readonly<Record<string, StudioVirtualProductionDestination>> = {
  story: "story", script: "story", "story-lock": "story",
  thumbnail: "drawing", storyboard: "drawing", conte: "drawing", drawing: "drawing", "canvas-2d": "drawing",
  "line-art": "drawing", background: "drawing", color: "drawing", lettering: "drawing", typesetting: "drawing", localization: "drawing",
  "background-3d": "assets", "scene-3d": "assets",
  asset: "assets", assets: "assets", audio: "assets", reference: "assets", research: "assets",
  "rights-preflight": "review", "joint-proof": "review", proof: "review", review: "review", "review-snapshot": "review", qc: "review", "quality-control": "review",
};

/** 알려진 제작 공정은 해당 도구 공간으로, 사용자 정의 공정은 제작 관제로 안내한다. */
export function studioVirtualProductionDestination(task: Pick<ProductionTask, "processKey" | "status">): StudioVirtualProductionDestination {
  if (REVIEW_STATUSES.has(task.status)) return "review";
  const processKey = task.processKey.trim().toLowerCase().replaceAll("_", "-");
  return Object.hasOwn(PROCESS_DESTINATIONS, processKey) ? PROCESS_DESTINATIONS[processKey] ?? "production" : "production";
}
