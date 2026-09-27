import { STUDIO_VIRTUAL_SPACE_ZONES, type StudioVirtualSpaceActivity, type StudioVirtualSpacePeer } from "./studio-virtual-space-model";
import { STUDIO_VIRTUAL_PLACES } from "./studio-virtual-space-place-catalog";
import type { StudioVirtualSpaceSocialController } from "./studio-virtual-space-social";
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
    location: room ? { ko: room.labelKo, en: room.labelEn } : { ko: "위치 확인 중", en: "Location unavailable" },
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
