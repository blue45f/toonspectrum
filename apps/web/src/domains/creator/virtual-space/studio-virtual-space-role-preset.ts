import {
  creatorRoleDefinition,
  type CreatorRoleDefinition,
  type CreatorRoleId,
} from "@/shared/lib/creator-role-contract";
import type { CreatorWorkReason } from "@/shared/lib/creator-role-workspace-contract";

import {
  STUDIO_VIRTUAL_PLACES,
  studioVirtualPlacesForMode,
  type StudioVirtualPlaceDefinition,
} from "./studio-virtual-space-place-catalog";

/**
 * 직군 → 가상스튜디오 추천 공간 매핑.
 *
 * 직군은 사용성 프리셋일 뿐 접근 제한이 아니다 (role-ux-review §4-2).
 * 이 표는 "어디부터 보여 줄까"의 순서·강조만 정한다. 여기에 없는 공간도
 * 전부 그대로 갈 수 있고, 추천은 미니맵 강조와 작업 시작 안내에만 쓰인다.
 * 공간의 의미는 장소 카탈로그(description·category)와 직군 정의의
 * workspaceSummary를 대조해 정했다.
 */
const ROLE_PLACE_IDS: Readonly<Record<CreatorRoleId, readonly string[]>> = Object.freeze({
  creator: ["personal-atelier", "story-lab", "review-gallery"],
  story: ["story-lab", "observatory", "tree-library"],
  planner: ["production-control", "story-lab", "observatory"],
  storyboard: ["story-lab", "personal-atelier", "review-gallery"],
  "line-art": ["personal-atelier", "review-gallery", "story-lab"],
  background: ["personal-atelier", "tree-library", "review-gallery"],
  color: ["personal-atelier", "review-gallery", "story-lab"],
  lettering: ["personal-atelier", "story-lab", "review-gallery"],
  character: ["personal-atelier", "review-gallery", "tree-library"],
  "three-d": ["personal-atelier", "tree-library", "production-control"],
  educator: ["event-stage", "team-meeting", "story-lab"],
  assistant: ["personal-atelier", "story-lab", "review-gallery"],
  editor: ["review-gallery", "observatory", "production-control"],
  producer: ["production-control", "team-meeting", "observatory"],
  localization: ["story-lab", "personal-atelier", "review-gallery"],
  reviewer: ["review-gallery", "observatory", "production-control"],
});

/** 직군이 없을 때의 중립 추천. 카탈로그에서 recommended인 창작 공간들. */
const DEFAULT_PLACE_IDS: readonly string[] = Object.freeze([
  "personal-atelier",
  "story-lab",
  "review-gallery",
]);

export interface StudioVirtualSpaceRolePreset {
  readonly roleId: CreatorRoleId | null;
  readonly definition: CreatorRoleDefinition | null;
  /** 모드(개인/팀)에 맞게 걸러진 추천 공간. 순서가 곧 추천 우선순위다. */
  readonly places: readonly StudioVirtualPlaceDefinition[];
  /** 미니맵 강조용 방 id. 직군이 있을 때만 채워진다 (전원 강조는 소음이라 하지 않는다). */
  readonly roomIds: readonly string[];
}

export function studioVirtualSpaceRolePreset(
  roleId: CreatorRoleId | null | undefined,
  personal = false,
): StudioVirtualSpaceRolePreset {
  const definition = creatorRoleDefinition(roleId);
  const placeIds = definition ? ROLE_PLACE_IDS[definition.id] : DEFAULT_PLACE_IDS;
  const byId = new Map(STUDIO_VIRTUAL_PLACES.map((place) => [place.id, place] as const));
  const ordered = placeIds.flatMap((id) => {
    const place = byId.get(id);
    return place ? [place] : [];
  });
  const modeIds = new Set(studioVirtualPlacesForMode(personal).map((place) => place.id));
  return Object.freeze({
    roleId: definition?.id ?? null,
    definition,
    places: Object.freeze(ordered.filter((place) => modeIds.has(place.id))),
    roomIds: Object.freeze(definition ? ordered.map((place) => place.roomId) : []),
  });
}

/** 직군 우선 업무 랭킹 사유의 표시 문구. 개인화 센터와 같은 어휘를 쓴다. */
export const STUDIO_VIRTUAL_SPACE_WORK_REASON_LABELS: Readonly<
  Record<CreatorWorkReason, readonly [string, string]>
> = Object.freeze({
  "assigned-to-me": ["나에게 배정", "Assigned to me"],
  "role-match": ["내 직군 작업", "Matches my role"],
  overdue: ["마감 지남", "Overdue"],
  "due-today": ["오늘 마감", "Due today"],
  "due-soon": ["마감 임박", "Due soon"],
  blocked: ["진행 막힘", "Blocked"],
  urgent: ["긴급", "Urgent"],
  "review-requested": ["검수 요청", "Review requested"],
  "approval-required": ["승인 필요", "Approval required"],
  "dependency-ready": ["선행 작업 완료", "Dependencies ready"],
});
