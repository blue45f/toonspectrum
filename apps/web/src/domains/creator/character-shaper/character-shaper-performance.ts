/**
 * 뷰포트 아래 "표정·포즈" 썸네일 스트립의 목록 규칙.
 *
 * 오른쪽 편집 패널은 지금 고른 카테고리의 카드를 보여 주므로, 아래 스트립은 장면 연기(표정·포즈·
 * 손 모양)를 카테고리와 상관없이 한 번에 바꾸는 용도다. 카탈로그 항목과 적용 명령은 그대로 쓴다.
 */
import { CHARACTER_POSE_GROUPS } from "./character-shaper-catalog";

import type { CharacterPoseGroupId } from "./character-shaper-catalog";
import type { CharacterSlotEntry, CharacterSlotKind } from "./character-shaper-contract";

export type CharacterPerformanceTab = Extract<CharacterSlotKind, "expression" | "pose" | "hand-pose">;
export type CharacterPerformancePoseFilter = "featured" | CharacterPoseGroupId;

export const CHARACTER_PERFORMANCE_TABS: readonly {
  readonly id: CharacterPerformanceTab;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "expression", ko: "표정", en: "Expression" },
  { id: "pose", ko: "포즈", en: "Pose" },
  { id: "hand-pose", ko: "손 모양", en: "Hands" },
];

/** 포즈 카탈로그는 묶음마다 100 단위 순서 대역을 쓴다(`CHARACTER_POSE_GROUPS.orderBase`). */
const POSE_GROUP_ORDER_SPAN = 100;

export function characterPoseGroupForOrder(order: number): CharacterPoseGroupId | null {
  return CHARACTER_POSE_GROUPS.find((group) => order >= group.orderBase && order < group.orderBase + POSE_GROUP_ORDER_SPAN)?.id
    ?? null;
}

/** 추천 항목을 앞에 두고 카탈로그 순서를 지킨다. 포즈는 추천 또는 한 묶음만 보여 준다. */
export function listCharacterPerformanceEntries(
  entries: readonly CharacterSlotEntry[],
  tab: CharacterPerformanceTab,
  poseFilter: CharacterPerformancePoseFilter = "featured",
): readonly CharacterSlotEntry[] {
  const slotEntries = entries.filter((entry) => entry.slot === tab);
  const visible = tab !== "pose"
    ? slotEntries
    : poseFilter === "featured"
      ? slotEntries.filter((entry) => entry.featured)
      : slotEntries.filter((entry) => characterPoseGroupForOrder(entry.order) === poseFilter);
  return visible.toSorted((left, right) =>
    Number(Boolean(right.featured)) - Number(Boolean(left.featured)) || left.order - right.order);
}
