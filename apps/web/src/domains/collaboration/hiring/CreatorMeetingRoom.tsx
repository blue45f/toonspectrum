import { useState } from "react";

import { CollabField, CollabNotice, collabButton, collabInput, collabPrimary } from "../collaboration-ui";
import { DeviceTest } from "./CreatorMeetingDeviceTest";
import { meetingIsTerminal } from "./creator-meeting-client";
import { useCreatorMeetingRoom } from "./use-creator-meeting-room";

export function MeetingRoom({ id, actor }: { id: string; actor: string }) {
  return <RoomContent key={`${id}:${actor}`} id={id} actor={actor} />;
}
function RoomContent({ id, actor }: { id: string; actor: string }) {
  const session = useCreatorMeetingRoom(id, actor);
  const { room, messages, busy, error, phase } = session;
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<"lobby" | "admitted">("lobby");
  const host = room?.hostId === actor;
  const labels = { invited: "초대됨", waiting: "호스트 입장 승인 대기", admitted: "텍스트 대화 입장 승인됨", removed: "퇴장됨", left: "나감" };
  async function sendMessage() {
    if (!room) return;
    const submitted = text;
    if (await session.send({ type: "messages", text: submitted, audience: room.myStatus === "admitted" ? audience : "lobby" })) {
      setText((current) => current === submitted ? "" : current);
    }
  }
  return <section className="space-y-4 rounded-xl border border-accent/40 bg-panel p-5" aria-label="면접·회의 대기실">
    {error && <CollabNotice error>{error}</CollabNotice>}
    {session.notice && <CollabNotice>{session.notice}</CollabNotice>}
    {phase === "loading" && <p role="status">방 상태를 확인하고 있어요.</p>}
    {phase === "paused" && <p role="status">화면이 숨겨졌거나 연결이 끊겨 조회를 멈췄어요. 돌아오면 최신 방 상태를 다시 확인합니다.</p>}
    <button type="button" className={collabButton} disabled={busy || session.checking || phase === "paused"} onClick={session.refresh}>{session.checking ? "상태 확인 중…" : "방 상태 다시 확인"}</button>
    {room && <>
      <h3 className="text-xl font-bold">{room.title}</h3>
      <p role="status">내 상태: {labels[room.myStatus]} · {room.status === "ended" ? "종료된 회의" : meetingIsTerminal(room) ? "자동 조회 중지" : "화면이 열려 있는 동안 5초 간격으로 확인"}</p>
      <p className="text-xs text-fg-3">일정: {new Date(room.startsAt).toLocaleString("ko-KR")} ~ {new Date(room.endsAt).toLocaleString("ko-KR")} (기기 시간대)</p>
      <CollabNotice>이 면접·팀 회의 기능의 음성·영상 제공자는 미설정입니다. 대기·입장 승인·텍스트 대화만 지원하며, 입장 승인은 팀·원고 권한을 부여하지 않습니다.</CollabNotice>
      {!meetingIsTerminal(room) && <DeviceTest />}
      {room.status !== "ended" && room.myStatus !== "removed" && <>
        <div className="flex flex-wrap gap-2">
          {["invited", "left"].includes(room.myStatus) && <button type="button" className={collabPrimary} disabled={busy} onClick={() => { void session.send({ type: "enter" }); }}>대기실에 들어가기</button>}
          {!host && ["waiting", "admitted"].includes(room.myStatus) && <button type="button" className={collabButton} disabled={busy} onClick={() => { void session.send({ type: "leave" }); }}>방에서 나가기</button>}
          {host && <button type="button" className={collabButton} disabled={busy} onClick={() => { if (globalThis.confirm("이 회의를 종료할까요?")) void session.send({ type: "host", action: "end", targetAccountId: null }); }}>회의 종료</button>}
        </div>
        <ul className="space-y-2" aria-label="현재 표시 가능한 참여자">{room.participants.map((p) => <li key={p.userId} className="flex flex-wrap gap-3">
          <span>{p.displayName} · {p.role === "host" ? "호스트" : "참여자"} · {labels[p.status]}</span>
          {host && p.userId !== actor && <>
            {p.status === "waiting" && <button type="button" disabled={busy} className={collabButton} aria-label={`${p.displayName} 입장 승인`} onClick={() => { void session.send({ type: "host", action: "admit", targetAccountId: p.userId }); }}>입장 승인</button>}
            {!["removed", "left"].includes(p.status) && <button type="button" disabled={busy} className={collabButton} aria-label={`${p.displayName} 퇴장`} onClick={() => { void session.send({ type: "host", action: "remove", targetAccountId: p.userId }); }}>퇴장</button>}
          </>}
        </li>)}</ul>
        <p className="text-xs text-fg-3">현재 입장 상태에서 볼 수 있는 최근 대화 최대 100개입니다. 방 상태가 바뀌면 표시 범위도 달라질 수 있습니다.</p>
        <ol aria-label="텍스트 대화" className="max-h-80 space-y-2 overflow-y-auto rounded border border-line p-3">{messages.map((m) => <li key={m.id}>
          <span className="text-xs text-fg-3">{m.displayName} · {new Date(m.createdAt).toLocaleTimeString("ko-KR")}</span><p className="whitespace-pre-wrap break-words">{m.text}</p>
        </li>)}</ol>
        {["waiting", "admitted"].includes(room.myStatus) && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
          <fieldset disabled={busy} className="space-y-3"><legend className="sr-only">면접·회의 메시지 작성</legend>
            {room.myStatus === "admitted" && <CollabField label="메시지 대상"><select className={collabInput} value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}>
              <option value="lobby">{host ? "대기실 전체 공지 (초대·대기·입장 참여자 모두)" : "호스트에게 보내기 (본인·호스트만 표시)"}</option><option value="admitted">입장 승인된 참여자</option>
            </select></CollabField>}
            <CollabField label="메시지"><textarea className={collabInput} required maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} /></CollabField>
            <button type="submit" className={collabPrimary} disabled={busy || !text.trim()}>{busy ? "전송 확인 중…" : "텍스트 보내기"}</button>
          </fieldset>
          <p className="text-xs text-fg-3">전송 실패 시 자동 재전송하지 않습니다. 작성 내용은 이 화면 메모리에만 유지하며 방·계정이 바뀌면 지웁니다.</p>
        </form>}
      </>}
    </>}
  </section>;
}
