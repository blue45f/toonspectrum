import { useState, type ReactNode } from "react";
import { Hand, MessageCircle, Footprints, ClipboardCheck, PartyPopper, X, ShieldBan } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpacePeer } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceSocialController } from "./studio-virtual-space-social";
import { resolveStudioCharacterAppearance } from "./studio-virtual-space-character-skins";

export type StudioSpaceSocialSnapshot = ReturnType<StudioVirtualSpaceSocialController["snapshot"]>;
export type StudioSpaceSocialRequest = StudioSpaceSocialSnapshot["requests"][number];
export type StudioSpaceSocialAction = StudioSpaceSocialRequest["action"];

const ACTIONS = [
  { id: "talk", ko: "대화 요청", en: "Ask to talk", icon: MessageCircle },
  { id: "follow", ko: "함께 이동 요청", en: "Ask to follow", icon: Footprints },
  { id: "review", ko: "함께 검토 요청", en: "Invite to review", icon: ClipboardCheck },
  { id: "high-five", ko: "함께 축하", en: "Celebrate together", icon: PartyPopper },
] as const;

export function StudioVirtualSpaceSocialPanel({
  selectedPeer, peers, social, disabled, focused, onSelect, onWave, onRequest, onRespond, onCancel, onBlock, nearbyPeerIds = [], conversationPeerIds = [], renderPeerAvatar,
}: {
  readonly renderPeerAvatar?: (peer: StudioVirtualSpacePeer) => ReactNode;
  readonly nearbyPeerIds?: readonly string[];
  readonly conversationPeerIds?: readonly string[];
  readonly selectedPeer: StudioVirtualSpacePeer | null;
  readonly peers: readonly StudioVirtualSpacePeer[];
  readonly social: StudioSpaceSocialSnapshot;
  readonly disabled: boolean;
  readonly focused: boolean;
  readonly onSelect: (id: string | null) => void;
  readonly onWave: () => void;
  readonly onRequest: (id: string, action: StudioSpaceSocialAction) => void;
  readonly onRespond: (id: string, response: "accept" | "decline") => void;
  readonly onCancel: (id: string) => void;
  readonly onBlock: (id: string, blocked: boolean) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceSocialPanel");
  const [filter, setFilter] = useState<"all" | "nearby" | "conversation">("all");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().normalize("NFKC").toLocaleLowerCase();
  const shownPeers = peers.filter((peer) => peer.participant.displayName.normalize("NFKC").toLocaleLowerCase().includes(normalizedQuery)
    && (filter === "all" || (filter === "nearby" ? nearbyPeerIds : conversationPeerIds).includes(peer.participant.sessionId)));
  const activeRequests = social.requests.filter((request) =>
    ["offered", "accepting", "accepted"].includes(request.status),
  );
  const latestResult = social.requests.find((request) =>
    !["offered", "accepting", "accepted"].includes(request.status),
  );
  const hasPending = selectedPeer && activeRequests.some((request) =>
    request.peer.sessionId === selectedPeer.participant.sessionId,
  );
  const blocked = selectedPeer ? social.blockedPeerIds.includes(selectedPeer.participant.sessionId) : false;
  const appearance = selectedPeer ? resolveStudioCharacterAppearance(selectedPeer.state, selectedPeer.participant.sessionId) : null;
  return <section className="vs2-panel studio-vspace-social" aria-label={bt("팀원과 상호작용", "Teammate interactions")} data-space-interactive="true">
    <header><h2>{bt("함께 작업하기", "Work together")}</h2><UsersMark /></header>
    <p>{focused
      ? bt("집중 중에는 새 요청을 받거나 보내지 않아요.", "New invitations are paused while focusing.")
      : bt("팀원을 선택해 인사하거나 함께할 작업을 제안하세요. 상대가 수락하면 시작됩니다.", "Select a teammate to say hello or invite them to an activity. It starts when they accept.")}</p>
    <label className="block text-sm">{bt("팀원 이름 찾기", "Find a teammate")}
      <input type="search" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3" maxLength={120} value={query}
        onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key !== "Escape") event.stopPropagation(); }} />
    </label>
    <div className="my-2 flex flex-wrap gap-2" role="group" aria-label={bt("팀원 범위", "Teammate scope")}>
      {([["all", "전체", "All"], ["nearby", "근처", "Nearby"], ["conversation", "대화 중", "In conversation"]] as const).map(([value, ko, en]) =>
        <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{bt(ko, en)}</button>)}
    </div>
    {peers.length && !shownPeers.length ? <p role="status">{bt("이 범위에서 일치하는 팀원이 없어요.", "No matching teammates in this scope.")}</p> : null}
    {peers.length ? <div className="studio-vspace-peer-picker" aria-label={bt("팀원 선택", "Choose teammate")}>
      {shownPeers.map((peer) => <button key={peer.participant.sessionId} type="button"
        aria-pressed={selectedPeer?.participant.sessionId === peer.participant.sessionId}
        onClick={() => onSelect(peer.participant.sessionId)}>
        {renderPeerAvatar?.(peer)}<span className="studio-vspace-presence-dot" aria-hidden />{peer.participant.displayName}
      </button>)}
    </div> : <p className="studio-vspace-social-empty">{bt("같은 프로젝트에 접속한 팀원이 여기에 표시됩니다. NPC는 접속 인원에 포함되지 않아요.", "Teammates in this project appear here. NPCs are not counted as online members.")}</p>}
    {selectedPeer ? <div className="studio-vspace-peer-actions">
      <div className="studio-vspace-peer-heading"><strong>{selectedPeer.participant.displayName}</strong>
        <button type="button" onClick={() => onSelect(null)} aria-label={bt("팀원 선택 닫기", "Close teammate selection")}><X size={16} aria-hidden /></button>
      </div>
      {appearance?.issues.length ? <p className="text-xs text-fg-3">
        {appearance.issues.includes("unknown-skin") || appearance.issues.includes("invalid-appearance")
          ? bt("상대 캐릭터가 아직 지원되지 않아 기본 캐릭터로 표시합니다.", "This character is not supported here yet, so a default character is shown.")
          : appearance.issues.includes("legacy-index")
            ? bt("이전 버전으로 접속한 팀원입니다. 캐릭터 일부 동작은 다르게 보일 수 있어요.", "This teammate uses an older version. Some character actions may appear differently.")
            : bt("캐릭터 버전이 달라 함께 지원하는 동작으로 표시합니다.", "Character versions differ. Actions supported by both versions are shown.")}
      </p> : null}
      <button type="button" disabled={disabled || focused || blocked || !social.greetingReadyPeerIds.includes(selectedPeer.participant.sessionId)
        || selectedPeer.state.activity === "focused" || selectedPeer.state.activity === "away"} onClick={onWave}><Hand size={16} aria-hidden />{bt("인사하기", "Wave hello")}</button>
      {ACTIONS.map(({ id, ko, en, icon: Icon }) => <button key={id} type="button"
        disabled={disabled || focused || blocked || Boolean(hasPending) || !social.readyPeerIds.includes(selectedPeer.participant.sessionId)
          || (id === "review" && !social.reviewReadyPeerIds.includes(selectedPeer.participant.sessionId))
          || selectedPeer.state.activity === "focused" || selectedPeer.state.activity === "away"}
        onClick={() => onRequest(selectedPeer.participant.sessionId, id)}>
        <Icon size={16} aria-hidden />{bt(ko, en)}
      </button>)}
      <button type="button" aria-pressed={blocked} onClick={() => onBlock(selectedPeer.participant.sessionId, !blocked)}>
        <ShieldBan size={16} aria-hidden />{blocked ? bt("요청 차단 해제", "Unblock invitations") : bt("이 접속의 요청 차단", "Block this session's invitations")}
      </button>
      {blocked ? <p>{bt("이 접속과 진행 중이던 대화·함께하기를 종료하고 새 요청을 차단했어요.", "Activities with this session have ended and new invitations are blocked.")}</p> : null}
    </div> : null}
    <div className="studio-vspace-social-requests" aria-live="polite" aria-relevant="additions text">
      {social.greetings.slice(0, 1).map((greeting) => <p key={greeting.id} className="studio-vspace-greeting">
        <Hand size={16} aria-hidden />{greeting.peer.displayName} · {greeting.direction === "incoming"
          ? bt("인사를 보냈어요", "Waved hello")
          : greeting.status === "delivered" ? bt("인사를 전달했어요", "Greeting delivered")
            : greeting.status === "failed" ? bt("인사 전달을 확인하지 못했어요", "Greeting delivery was not confirmed")
              : bt("인사 전달 중…", "Sending greeting…")}
      </p>)}
      {activeRequests.map((request) => {
        const action = ACTIONS.find((candidate) => candidate.id === request.action)!;
        const incoming = request.direction === "incoming" && request.status === "offered";
        return <div key={request.id} className="studio-vspace-social-request" data-request-status={request.status}>
          <strong>{request.peer.displayName} · {bt(action.ko, action.en)}</strong>
          {request.reviewSubject ? <small className="break-all">{bt("검수 버전", "Review version")} · {request.reviewSubject.revisionId}</small> : null}
          <span>{incoming ? bt("함께하시겠어요?", "Join them?") : request.status === "accepted"
            ? bt("서로 수락했어요", "Accepted by both")
            : request.status === "accepting" ? bt("상대 연결 확인 중…", "Confirming connection…")
              : bt("상대의 응답을 기다리는 중…", "Waiting for their response…")}</span>
          <div>{incoming ? <>
            <button type="button" disabled={disabled || focused} onClick={() => onRespond(request.id, "accept")}>{bt("수락", "Accept")}</button>
            <button type="button" onClick={() => onRespond(request.id, "decline")}>{bt("거절", "Decline")}</button>
          </> : <button type="button" onClick={() => onCancel(request.id)}>{request.status === "accepted" ? bt("함께하기 종료", "End activity") : bt("요청 취소", "Cancel request")}</button>}</div>
        </div>;
      })}
      {latestResult ? <p role="status">{bt("최근 요청", "Latest invitation")} · {latestResult.peer.displayName} · {bt(
        ({ declined: "거절됨", cancelled: "취소됨", expired: "시간 만료", disconnected: "상대 연결 종료", failed: "전송 실패 · 다시 요청해 주세요" } as Record<string, string>)[latestResult.status] ?? latestResult.status,
        latestResult.status,
      )}</p> : null}
    </div>
  </section>;
}

function UsersMark() {
  return <MessageCircle size={18} aria-hidden />;
}
