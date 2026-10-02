import { STUDIO_VIRTUAL_SPACE_ZONES, type StudioVirtualSpaceActivity, type StudioVirtualSpacePeer } from "./studio-virtual-space-model";
import { STUDIO_VIRTUAL_PLACES } from "./studio-virtual-space-place-catalog";
import type { StudioVirtualSpaceSocialController } from "./studio-virtual-space-social";
import { userStatusBadge, type StudioUserStatus } from "./studio-virtual-space-user-status";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

export interface StudioTeammateLabel { readonly ko: string; readonly en: string }
const ACTIVITY: Readonly<Record<StudioVirtualSpaceActivity, StudioTeammateLabel>> = {
  available: { ko: "대화 가능", en: "Available" },
  reviewing: { ko: "원고 검토 중", en: "Reviewing" },
  focused: { ko: "집중 중 · 요청 쉬는 중", en: "Focusing · invitations paused" },
  away: { ko: "자리비움", en: "Away" },
};
const ROLES: Readonly<Record<StudioVirtualSpacePeer["participant"]["role"], StudioTeammateLabel>> = {
  owner: { ko: "작품 소유자", en: "Project owner" },
  admin: { ko: "관리자", en: "Administrator" },
  editor: { ko: "편집 참여자", en: "Editor" },
  commenter: { ko: "의견 참여자", en: "Commenter" },
  viewer: { ko: "보기 전용", en: "Viewer" },
};

/** 접속 역할은 권한 표시에만 쓴다. 그림 작가·PD 같은 업무 직책을 추측하지 않는다. */
export function studioTeammatePresentation(peer: StudioVirtualSpacePeer, manifest?: StudioVirtualSpaceWorldManifest) {
  const room = manifest?.rooms.find((item) => item.id === peer.state.zoneId)
    ?? STUDIO_VIRTUAL_PLACES.find((item) => item.id === peer.state.zoneId)
    ?? STUDIO_VIRTUAL_SPACE_ZONES.find((item) => item.id === peer.state.zoneId);
  return {
    activity: ACTIVITY[peer.state.activity],
    role: ROLES[peer.participant.role],
    location: room ? { ko: room.labelKo, en: room.labelEn } : { ko: "위치 알 수 없음", en: "Location unavailable" },
  };
}

export function studioTeammateMatches(peer: StudioVirtualSpacePeer, query: string, manifest?: StudioVirtualSpaceWorldManifest): boolean {
  const terms = query.trim().normalize("NFKC").toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  const presentation = studioTeammatePresentation(peer, manifest);
  const text = [peer.participant.displayName, ...Object.values(presentation).flatMap((item) => [item.ko, item.en])]
    .join(" ").normalize("NFKC").toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
}

type SocialSnapshot = ReturnType<StudioVirtualSpaceSocialController["snapshot"]>;
/** 버튼과 안내는 기존 요청 컨트롤러의 준비 상태를 그대로 반영한다. 허가는 컨트롤러가 재확인한다. */
export function studioTeammateInvitationReason(peer: StudioVirtualSpacePeer, social: SocialSnapshot, options: {
  readonly disabled: boolean;
  readonly focused: boolean;
  readonly review?: boolean;
}): StudioTeammateLabel | null {
  const id = peer.participant.sessionId;
  if (options.focused) return { ko: "내 집중·자리비움 상태에서는 초대를 쉬어요.", en: "Invitations pause while you are focusing or away." };
  if (social.blockedPeerIds.includes(id)) return { ko: "이 접속의 요청을 차단했어요.", en: "Invitations from this session are blocked." };
  if (peer.state.activity === "focused") return { ko: "집중 중인 팀원에게는 요청을 보내지 않아요.", en: "This teammate is focusing; invitations are paused." };
  if (peer.state.activity === "away") return { ko: "팀원이 돌아오면 초대할 수 있어요.", en: "Invite this teammate when they return." };
  if (social.requests.some((request) => request.peer.sessionId === id && ["offered", "accepting", "accepted"].includes(request.status))) {
    return { ko: "진행 중인 요청이나 함께하기를 먼저 확인하세요.", en: "Check the existing invitation or shared activity first." };
  }
  if (options.disabled || !social.available || !social.readyPeerIds.includes(id)) {
    return { ko: "연결 또는 공간의 접근 권한을 확인 중이에요.", en: "Connection or room access is not ready yet." };
  }
  if (options.review && !social.reviewReadyPeerIds.includes(id)) {
    return { ko: "상대의 검수 초대 연결을 확인 중이에요.", en: "This teammate's review invitation connection is not ready yet." };
  }
  return null;
}

const ACTIVITY_DOT: Record<StudioVirtualSpaceActivity, string> = {
  available: "#34d399",
  focused: "#60a5fa",
  reviewing: "#fbbf24",
  away: "#94a3b8",
};

const USER_STATUS_DOT: Record<StudioUserStatus, string> = {
  available: "#34d399",
  "in-meeting": "#f87171",
  presenting: "#c084fc",
  focusing: "#60a5fa",
  away: "#94a3b8",
  break: "#fbbf24",
};

export interface StudioTeammateStatusBadge {
  readonly dotColor: string;
  readonly labelKo: string;
  readonly labelEn: string;
}

/**
 * 팀원 목록용 상태 배지.
 * 명시적 사용자 상태(userStatus)가 있으면 활동 표시를 덮어쓴다.
 */
export function teammateStatusBadge(
  activity: StudioVirtualSpaceActivity,
  userStatus?: StudioUserStatus | null,
): StudioTeammateStatusBadge {
  if (userStatus) {
    const badge = userStatusBadge(userStatus);
    return { dotColor: USER_STATUS_DOT[userStatus], labelKo: badge.ko, labelEn: badge.en };
  }
  const label = ACTIVITY[activity];
  return { dotColor: ACTIVITY_DOT[activity], labelKo: label.ko, labelEn: label.en };
}

export type TeammateListNavKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/**
 * 팀원 목록 키보드 탐색: 방향키·Home·End에 대한 다음 인덱스 (랩어라운드).
 * 목록 컴포넌트의 roving tabindex와 함께 쓴다.
 */
export function teammateListNextIndex(
  current: number,
  total: number,
  key: TeammateListNavKey,
): number {
  if (total <= 0) return 0;
  const safe = Math.min(Math.max(0, current), total - 1);
  switch (key) {
    case "ArrowDown": return (safe + 1) % total;
    case "ArrowUp": return (safe - 1 + total) % total;
    case "Home": return 0;
    case "End": return total - 1;
  }
}
