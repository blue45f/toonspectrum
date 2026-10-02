import { ClipboardCheck, Footprints, LayoutGrid, MessageCircle, UserPlus } from "lucide-react";
import { useId, useRef, type KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import type { StudioVirtualSpaceActivity, StudioVirtualSpacePresenceState } from "../studio-virtual-space-model";
import type { StudioUserStatus } from "../studio-virtual-space-user-status";
import { SpaceAvatar } from "./SpaceAvatar";
import { spaceStatusOption } from "./space-dock-model";

/** 같이 작업하기 요청 종류. 모두 기존 동의 흐름(상대가 수락해야 시작)을 그대로 쓴다. */
export type SpaceCoworkAction = "talk" | "review" | "follow";

export interface SpaceCoworkPeer {
  readonly id: string;
  readonly name: string;
  readonly activity: StudioVirtualSpaceActivity;
  readonly userStatus?: StudioUserStatus | null;
  readonly avatarIndex: number;
  readonly appearance?: StudioVirtualSpacePresenceState["appearance"];
  /** 대화 거리 안이면 true. 멀면 먼저 다가가야 한다. */
  readonly near: boolean;
}

const ACTIONS: readonly { readonly id: SpaceCoworkAction; readonly icon: typeof MessageCircle; readonly ko: string; readonly en: string; readonly noteKo: string; readonly noteEn: string }[] = [
  {
    id: "talk", icon: MessageCircle, ko: "대화하며 같이 작업", en: "Talk while working",
    noteKo: "수락하면 근처 대화방(채팅·통화)이 열려요. 마이크·카메라·화면 공유는 직접 켜요.",
    noteEn: "Once accepted, a nearby chat and call opens. You turn on mic, camera or screen share yourself.",
  },
  {
    id: "review", icon: ClipboardCheck, ko: "같은 원고 함께 검토", en: "Review the same pages",
    noteKo: "검수본을 골라 초대해요. 수락하면 같은 버전을 함께 열어 코멘트가 엇갈리지 않아요.",
    noteEn: "Pick a review snapshot to invite. Once accepted you both open the same version.",
  },
  {
    id: "follow", icon: Footprints, ko: "같이 이동하기", en: "Walk together",
    noteKo: "수락하면 상대를 따라 회의실·작업 자리까지 함께 걸어가요.",
    noteEn: "Once accepted you follow them to the meeting room or desk.",
  },
];

/**
 * '같이 작업하기' 요청 흐름. 팀원을 고르고(근처 우선) 무엇을 함께 할지 고르면 기존 요청을 보낸다.
 * 상대가 수락하기 전에는 아무것도 시작되지 않고, 회차 보드·검수함 바로 가기를 함께 둔다.
 */
export function SpaceCoworkSheet({ peers, targetId, disabledReason, links, onSelectTarget, onRequest, onApproach, onOpenTeam }: {
  readonly peers: readonly SpaceCoworkPeer[];
  readonly targetId: string | null;
  /** 지금 요청을 보낼 수 없는 이유(연결 확인 중·집중 중 등). */
  readonly disabledReason: string | null;
  readonly links: readonly { readonly id: string; readonly href: string; readonly labelKo: string; readonly labelEn: string }[];
  readonly onSelectTarget: (id: string) => void;
  readonly onRequest: (peerId: string, action: SpaceCoworkAction) => void;
  readonly onApproach: (peerId: string) => void;
  readonly onOpenTeam: () => void;
}) {
  const bt = useBilingual("SpaceCoworkSheet");
  const groupId = useId();
  const peopleGroup = useRef<HTMLDivElement>(null);
  const shownPeers = peers.slice(0, 6);
  const target = peers.find((peer) => peer.id === targetId) ?? peers.find((peer) => peer.near) ?? peers[0] ?? null;
  if (!target) {
    return <div className="space-cowork" data-empty="true">
      <p className="space-panel-note">{bt(
        "지금 같이 작업할 수 있는 팀원이 없어요. 팀원을 초대하거나 접속을 기다려 주세요. NPC는 팀원 수에 들어가지 않아요.",
        "No teammate is available right now. Invite one or wait for them to join. NPCs are not teammates.",
      )}</p>
      <button type="button" className="space-pill-button space-pill-button--primary" onClick={onOpenTeam}>
        <UserPlus size={16} aria-hidden />{bt("팀·초대 열기", "Open teams & invites")}
      </button>
    </div>;
  }
  const status = spaceStatusOption(target.activity, target.userStatus);
  const busy = target.activity === "focused" || target.activity === "away";
  const reason = disabledReason ?? (busy ? bt("상대가 집중 중이거나 자리를 비웠어요", "They are focusing or away") : null);
  // 선택된 팀원이 표시 범위 밖에 있으면 첫 항목이 탭 진입점이 된다.
  const tabbableId = shownPeers.some((peer) => peer.id === target.id) ? target.id : shownPeers[0]?.id;
  // 라디오 그룹 관례: 화살표로 선택을 옮기고 초점도 따라간다 (SpaceStatusMenu와 동일).
  const onPersonKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = shownPeers[(index + step + shownPeers.length) % shownPeers.length];
    if (!next) return;
    onSelectTarget(next.id);
    peopleGroup.current?.querySelector<HTMLButtonElement>(`[data-cowork-peer="${next.id}"]`)?.focus();
  };
  return <div className="space-cowork">
    <div ref={peopleGroup} className="space-cowork__people" role="radiogroup" aria-labelledby={`${groupId}-who`}>
      <p id={`${groupId}-who`} className="space-cowork__label">{bt("누구와 함께할까요?", "Who will you work with?")}</p>
      {shownPeers.map((peer, index) => {
        const peerStatus = spaceStatusOption(peer.activity, peer.userStatus);
        return <button key={peer.id} type="button" role="radio" aria-checked={peer.id === target.id} className="space-cowork__person"
          data-cowork-peer={peer.id} tabIndex={peer.id === tabbableId ? 0 : -1}
          onClick={() => onSelectTarget(peer.id)} onKeyDown={(event) => onPersonKeyDown(event, index)}>
          <SpaceAvatar identity={peer.id} activity={peer.activity} avatarIndex={peer.avatarIndex} appearance={peer.appearance} size="sm" />
          <span><strong>{peer.name}</strong><small>
            <span className="space-status-dot" data-activity={peer.activity} data-status={peerStatus.id} aria-hidden />
            {bt(peerStatus.labelKo, peerStatus.labelEn)} · {peer.near ? bt("근처", "Nearby") : bt("멀리 있음", "Far away")}
          </small></span>
        </button>;
      })}
      {peers.length > shownPeers.length ? <p className="space-panel-note">{bt(
        `함께할 팀원이 많아 가까운 ${shownPeers.length}명만 먼저 보여요. (전체 ${peers.length}명)`,
        `Showing the ${shownPeers.length} closest teammates first. (${peers.length} in total)`,
      )}</p> : null}
    </div>
    {!target.near ? <div className="space-cowork__far" role="status">
      <p>{bt(`${target.name} 님이 조금 떨어져 있어요. 먼저 다가가면 대화·이동 요청을 보낼 수 있어요.`,
        `${target.name} is a little far away. Walk over first to send talk or follow requests.`)}</p>
      <button type="button" className="space-pill-button" onClick={() => onApproach(target.id)}><Footprints size={16} aria-hidden />{bt("다가가기", "Walk over")}</button>
    </div> : null}
    <div className="space-cowork__actions" role="group" aria-label={bt(`${target.name}에게 보낼 요청`, `Request to send to ${target.name}`)}>
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        const needsNear = action.id !== "review";
        const actionReason = reason ?? (needsNear && !target.near ? bt("먼저 다가가 주세요", "Walk over first") : null);
        return <button key={action.id} type="button" className="space-cowork__action" data-action={action.id}
          aria-disabled={actionReason ? true : undefined} title={actionReason ?? undefined}
          onClick={() => { if (!actionReason) onRequest(target.id, action.id); }}>
          <Icon size={20} aria-hidden />
          <span><strong>{bt(action.ko, action.en)}</strong><small>{actionReason ?? bt(action.noteKo, action.noteEn)}</small></span>
        </button>;
      })}
    </div>
    <p className="space-cowork__note">{bt(
      `${target.name} 님 상태: ${status.labelKo}. 요청은 상대가 수락해야 시작되고, 언제든 취소할 수 있어요.`,
      `${target.name}'s status: ${status.labelEn}. Requests start only after they accept, and you can cancel anytime.`,
    )}</p>
    {links.length ? <nav className="space-cowork__links" aria-label={bt("작업 바로 가기", "Work shortcuts")}>
      <LayoutGrid size={15} aria-hidden />
      {links.map((link) => <Link key={link.id} href={link.href} className="space-pill-button">{bt(link.labelKo, link.labelEn)}</Link>)}
    </nav> : null}
  </div>;
}
