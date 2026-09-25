import { useEffect, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioConversationScope, StudioConversationSnapshot } from "./studio-virtual-space-conversation";

const button = "min-h-11 rounded-lg border border-line px-3 text-xs disabled:opacity-50";
export function StudioVirtualSpaceConversationPanel({ self, snapshot, currentConversation, onPropose, onRespond, onLeave }: {
  readonly self: StudioLiveParticipant | undefined;
  readonly snapshot: StudioConversationSnapshot;
  /** An existing two-person social call may seed the next exact roster, never its consent. */
  readonly currentConversation?: StudioConversationScope | null;
  readonly onPropose: (memberIds: readonly string[]) => string | null;
  readonly onRespond: (id: string, answer: "accept" | "decline") => void;
  readonly onLeave: (id: string) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceConversationPanel");
  const active = snapshot.active ?? currentConversation;
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [notice, setNotice] = useState(false);
  const activeRoster = active?.memberIds.filter((id) => id !== self?.sessionId).join(",") ?? "";
  useEffect(() => { setSelected(activeRoster ? activeRoster.split(",") : []); setNotice(false); }, [active?.id, activeRoster]);
  const name = (id: string) => id === self?.sessionId ? bt("나", "You") : snapshot.readyPeers.find((peer) => peer.sessionId === id)?.displayName ?? id;
  const members = self ? [self.sessionId, ...selected].sort() : [];
  const canPropose = snapshot.available && members.length >= 2 && members.length <= 4
    && selected.every((id) => snapshot.readyPeers.some((peer) => peer.sessionId === id));
  const pending = snapshot.records.filter((record) => record.status === "offered" || record.status === "waiting");
  return <section className="vs2-panel studio-vspace-bubble-panel" aria-label={bt("소규모 Bubble 대화", "Conversation bubble")} data-space-interactive="true" data-bubble-active={active ? "true" : undefined}>
    <h2 className="font-bold">{bt("소규모 Bubble 대화", "Conversation bubble")}</h2>
    <p className="mt-2 text-xs text-fg-2">{bt("나를 포함해 최대 4명. 모든 사람이 전체 명단에 동의해야 열리고, 공간 범위를 벗어나면 종료됩니다. 마이크와 카메라는 직접 켜야 해요.", "Up to four people including you. Everyone must accept the full roster, and the bubble closes when its spatial scope ends. Turn on microphone and camera yourself.")}</p>
    {!snapshot.available ? <p className="mt-2 text-xs text-fg-2" role="status">{bt("이 창에서 같은 프로젝트의 팀 연결을 확인한 뒤 제안할 수 있어요.", "Keep this window active and connect to the same project before proposing a conversation.")}</p> : null}
    {active ? <div className="mt-3 rounded-xl border border-line p-3 text-xs">
      <p>{bt("현재 Bubble", "Current bubble")} · {active.memberIds.map(name).join(", ")}</p>
      <button type="button" className={`${button} mt-2`} onClick={() => onLeave(active.id)}>{bt("대화 나가기", "Leave conversation")}</button>
      <p className="mt-2 text-fg-2">{bt("인원을 바꾸면 기존 대화를 닫고 새 명단에 다시 동의해요.", "Changing members closes the previous conversation and requires fresh consent to the new roster.")}</p>
    </div> : null}
    <fieldset className="mt-3 space-y-1" disabled={!snapshot.available}>
      <legend className="text-xs font-semibold">{bt("제안할 명단 선택", "Choose the proposed roster")}</legend>
      {snapshot.readyPeers.map((peer) => <label key={peer.sessionId} className="flex min-h-11 items-center gap-2 text-xs">
        <input type="checkbox" checked={selected.includes(peer.sessionId)} disabled={selected.length >= 3 && !selected.includes(peer.sessionId)}
          onChange={(event) => { const checked = event.currentTarget.checked; setSelected((previous) => checked ? [...previous, peer.sessionId] : previous.filter((id) => id !== peer.sessionId)); }} />
        {peer.displayName}
      </label>)}
      {!snapshot.readyPeers.length ? <p className="py-2 text-xs text-fg-2">{bt("연결을 확인한 팀원이 아직 없어요.", "No verified teammates are ready yet.")}</p> : null}
    </fieldset>
    <p className="mt-2 text-xs" data-conversation-proposed-roster="true">{bt("제안 명단", "Proposed roster")} · {members.map(name).join(", ")}</p>
    <button type="button" className={`${button} mt-2`} aria-label={bt("이 명단으로 대화 제안", "Propose conversation with this roster")} disabled={!canPropose} onClick={() => setNotice(onPropose(members) === null)}>{bt("이 명단으로 Bubble 제안", "Propose this bubble")}</button>
    {notice ? <p role="status" className="mt-2 text-xs">{bt("제안을 보내지 못했어요. 연결과 참여자 명단을 확인해 주세요.", "The proposal could not be sent. Check the connection and roster.")}</p> : null}
    <div aria-live="polite" className="mt-3 space-y-2">
      {pending.map((record) => <article key={record.id} className="rounded-xl border border-line p-3 text-xs">
        <p className="font-semibold">{record.members.map((member) => member.sessionId === self?.sessionId ? bt("나", "You") : member.displayName).join(", ")}</p>
        <p className="mt-1 text-fg-2">{bt(`${record.acceptedIds.length}/${record.memberIds.length}명 동의`, `${record.acceptedIds.length}/${record.memberIds.length} accepted`)}</p>
        {record.localAccepted ? <div className="mt-2"><span>{bt("모두의 동의를 기다리는 중", "Waiting for everyone's consent")}</span><button type="button" className={`${button} ml-2`} onClick={() => onLeave(record.id)}>{bt("제안 취소", "Cancel proposal")}</button></div>
          : <div className="mt-2 flex gap-2"><button type="button" className={button} disabled={!snapshot.available || !record.canAccept} onClick={() => onRespond(record.id, "accept")}>{bt("이 전체 명단에 동의", "Accept this entire roster")}</button><button type="button" className={button} onClick={() => onRespond(record.id, "decline")}>{bt("거절", "Decline")}</button></div>}
      </article>)}
    </div>
  </section>;
}
