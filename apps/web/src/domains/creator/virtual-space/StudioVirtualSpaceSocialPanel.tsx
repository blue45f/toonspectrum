import { Hand, MessageCircle, Footprints, ClipboardCheck, PartyPopper, X } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpacePeer } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceSocialController } from "./studio-virtual-space-social";

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
  selectedPeer, peers, social, disabled, focused, onSelect, onWave, onRequest, onRespond, onCancel,
}: {
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
}) {
  const bt = useBilingual("StudioVirtualSpaceSocialPanel");
  const activeRequests = social.requests.filter((request) =>
    ["offered", "accepting", "accepted"].includes(request.status),
  );
  const latestResult = social.requests.find((request) =>
    !["offered", "accepting", "accepted"].includes(request.status),
  );
  const hasPending = selectedPeer && activeRequests.some((request) =>
    request.peer.sessionId === selectedPeer.participant.sessionId,
  );
  return <section className="vs2-panel studio-vspace-social" aria-label={bt("팀원과 상호작용", "Teammate interactions")} data-space-interactive="true">
    <header><h2>{bt("함께 작업하기", "Work together")}</h2><UsersMark /></header>
    <p>{focused
      ? bt("집중 중에는 새 요청을 받거나 보내지 않아요.", "New invitations are paused while focusing.")
      : bt("팀원을 선택해 인사하거나 함께할 작업을 제안하세요. 상대가 수락하면 시작됩니다.", "Select a teammate to say hello or invite them to an activity. It starts when they accept.")}</p>
    {peers.length ? <div className="studio-vspace-peer-picker" aria-label={bt("팀원 선택", "Choose teammate")}>
      {peers.map((peer) => <button key={peer.participant.sessionId} type="button"
        aria-pressed={selectedPeer?.participant.sessionId === peer.participant.sessionId}
        onClick={() => onSelect(peer.participant.sessionId)}>
        <span className="studio-vspace-presence-dot" aria-hidden />{peer.participant.displayName}
      </button>)}
    </div> : <p className="studio-vspace-social-empty">{bt("같은 프로젝트에 접속한 팀원이 여기에 표시됩니다. NPC는 접속 인원에 포함되지 않아요.", "Teammates in this project appear here. NPCs are not counted as online members.")}</p>}
    {selectedPeer ? <div className="studio-vspace-peer-actions">
      <div className="studio-vspace-peer-heading"><strong>{selectedPeer.participant.displayName}</strong>
        <button type="button" onClick={() => onSelect(null)} aria-label={bt("팀원 선택 닫기", "Close teammate selection")}><X size={16} aria-hidden /></button>
      </div>
      <button type="button" disabled={disabled} onClick={onWave}><Hand size={16} aria-hidden />{bt("인사하기", "Wave hello")}</button>
      {ACTIONS.map(({ id, ko, en, icon: Icon }) => <button key={id} type="button"
        disabled={disabled || focused || Boolean(hasPending) || !social.readyPeerIds.includes(selectedPeer.participant.sessionId)
          || selectedPeer.state.activity === "focused" || selectedPeer.state.activity === "away"}
        onClick={() => onRequest(selectedPeer.participant.sessionId, id)}>
        <Icon size={16} aria-hidden />{bt(ko, en)}
      </button>)}
    </div> : null}
    <div className="studio-vspace-social-requests" aria-live="polite" aria-relevant="additions text">
      {activeRequests.map((request) => {
        const action = ACTIONS.find((candidate) => candidate.id === request.action)!;
        const incoming = request.direction === "incoming" && request.status === "offered";
        return <div key={request.id} className="studio-vspace-social-request" data-request-status={request.status}>
          <strong>{request.peer.displayName} · {bt(action.ko, action.en)}</strong>
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
