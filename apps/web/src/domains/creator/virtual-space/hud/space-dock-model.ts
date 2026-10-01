import type { LucideIcon } from "lucide-react";

import type { StudioVirtualSpaceActivity } from "../studio-virtual-space-model";

/** 도크에서 여는 작은 창. 한 번에 하나만 열린다. */
export type SpaceDockPopover = "me" | "react" | "more" | "work";

export interface SpaceDockMenuItem {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly icon: LucideIcon;
  readonly onSelect: () => void;
  /** 비활성 사유. 있으면 버튼을 aria-disabled로 두고 사유를 함께 읽어 준다. */
  readonly disabledReasonKo?: string;
  readonly disabledReasonEn?: string;
  readonly shortcut?: string;
  readonly group: "work" | "space" | "help";
}

export interface SpaceActivityOption {
  readonly id: StudioVirtualSpaceActivity;
  readonly labelKo: string;
  readonly labelEn: string;
}

const AVAILABLE_OPTION: SpaceActivityOption = { id: "available", labelKo: "대화 가능", labelEn: "Available" };

/** 내 상태 4종. 색 점과 글자를 함께 보여 줘 색만으로 상태를 전달하지 않는다. */
export const SPACE_ACTIVITY_OPTIONS: readonly SpaceActivityOption[] = [
  AVAILABLE_OPTION,
  { id: "focused", labelKo: "집중 작업 중", labelEn: "Focusing" },
  { id: "reviewing", labelKo: "검토 중", labelEn: "Reviewing" },
  { id: "away", labelKo: "자리 비움", labelEn: "Away" },
];

export function spaceActivityOption(activity: StudioVirtualSpaceActivity): SpaceActivityOption {
  return SPACE_ACTIVITY_OPTIONS.find((option) => option.id === activity) ?? AVAILABLE_OPTION;
}
