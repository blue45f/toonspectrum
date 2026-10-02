import type { LucideIcon } from "lucide-react";

import type { StudioVirtualSpaceActivity } from "../studio-virtual-space-model";
import type { StudioUserStatus } from "../studio-virtual-space-user-status";
import type { SpaceProximityRangeMode } from "./space-proximity-media";

/** 도크에서 여는 작은 창. 한 번에 하나만 열린다. */
export type SpaceDockPopover = "me" | "react" | "more" | "work";

export interface SpaceDockMenuItem {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly icon: LucideIcon;
  readonly onSelect: () => void;
  /** 한 줄 설명. HUD 인벤토리의 오버플로 항목처럼 무엇을 여는지 알려 준다. */
  readonly descriptionKo?: string;
  readonly descriptionEn?: string;
  /** 지금 열려 있는 패널이면 true. 메뉴에서 '열림'으로 표시한다. */
  readonly active?: boolean;
  /** 비활성 사유. 있으면 버튼을 aria-disabled로 두고 사유를 함께 읽어 준다. */
  readonly disabledReasonKo?: string;
  readonly disabledReasonEn?: string;
  readonly shortcut?: string;
  readonly group: "work" | "space" | "help";
}

/**
 * 내 상태 6종. 활동(activity)은 요청 수신·집중 동작을 정하고, 사용자 상태(userStatus)는
 * '회의 중·휴식 중·자리 비움'처럼 이름표와 팀원 목록에 보이는 표시를 정한다.
 * 색 점과 글자를 함께 보여 줘 색만으로 상태를 전달하지 않는다.
 */
export type SpaceStatusId = "available" | "focused" | "reviewing" | "in-meeting" | "break" | "away";

export interface SpaceStatusOption {
  readonly id: SpaceStatusId;
  readonly activity: StudioVirtualSpaceActivity;
  /** null이면 명시 상태를 지워 활동 표시를 그대로 쓴다. */
  readonly userStatus: StudioUserStatus | null;
  readonly labelKo: string;
  readonly labelEn: string;
}

const AVAILABLE_OPTION: SpaceStatusOption = { id: "available", activity: "available", userStatus: null, labelKo: "대화 가능", labelEn: "Available" };

export const SPACE_STATUS_OPTIONS: readonly SpaceStatusOption[] = [
  AVAILABLE_OPTION,
  { id: "focused", activity: "focused", userStatus: null, labelKo: "집중 작업 중", labelEn: "Focusing" },
  { id: "reviewing", activity: "reviewing", userStatus: null, labelKo: "검토 중", labelEn: "Reviewing" },
  // 회의·휴식 중에도 함께 있는 팀원의 대화 요청은 받는다(진행 중인 함께하기를 끝내지 않는다).
  { id: "in-meeting", activity: "available", userStatus: "in-meeting", labelKo: "회의 중", labelEn: "In a meeting" },
  { id: "break", activity: "available", userStatus: "break", labelKo: "휴식 중", labelEn: "On a break" },
  { id: "away", activity: "away", userStatus: "away", labelKo: "자리 비움", labelEn: "Away" },
];

/** 명시 상태가 있으면 그것을, 없으면 활동으로 현재 상태를 고른다. */
export function spaceStatusOption(activity: StudioVirtualSpaceActivity, userStatus?: StudioUserStatus | null): SpaceStatusOption {
  if (userStatus && userStatus !== "available") {
    const explicit = SPACE_STATUS_OPTIONS.find((option) => option.userStatus === userStatus);
    if (explicit) return explicit;
  }
  return SPACE_STATUS_OPTIONS.find((option) => option.userStatus === null && option.activity === activity)
    ?? (activity === "away" ? SPACE_STATUS_OPTIONS[SPACE_STATUS_OPTIONS.length - 1] ?? AVAILABLE_OPTION : AVAILABLE_OPTION);
}

export function spaceStatusOptionById(id: SpaceStatusId): SpaceStatusOption {
  return SPACE_STATUS_OPTIONS.find((option) => option.id === id) ?? AVAILABLE_OPTION;
}

/**
 * 근접 음성 범위 3종(Gather Quiet 대응). 반경 수치는 space-proximity-media의 모드 표가 정본이고,
 * 여기서는 상태 메뉴에 보일 이름·설명만 둔다. 좁게·끄기를 고르면 이름표 상태 점이 빨간색으로 바뀐다.
 */
export interface SpaceProximityRangeOption {
  readonly id: SpaceProximityRangeMode;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
}

export const SPACE_PROXIMITY_RANGE_OPTIONS: readonly SpaceProximityRangeOption[] = [
  { id: "standard", labelKo: "기본 범위", labelEn: "Standard", hintKo: "다가가면 서서히 들려요", hintEn: "Voices fade in as people approach" },
  { id: "quiet", labelKo: "좁게 · 조용히", labelEn: "Quiet · nearby only", hintKo: "바로 옆 사람만 들려요", hintEn: "Only people right next to you" },
  { id: "off", labelKo: "근접 음성 끄기", labelEn: "Proximity voice off", hintKo: "근처 음성·영상을 연결하지 않아요", hintEn: "No nearby voice or video links" },
];

export function spaceProximityRangeOption(mode: SpaceProximityRangeMode): SpaceProximityRangeOption {
  return SPACE_PROXIMITY_RANGE_OPTIONS.find((option) => option.id === mode) ?? SPACE_PROXIMITY_RANGE_OPTIONS[0]!;
}
