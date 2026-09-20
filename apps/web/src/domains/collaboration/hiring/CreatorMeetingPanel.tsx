import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { CollabField, CollabNotice, collabButton, collabInput, collabPrimary } from "../collaboration-ui";

import { dateInput } from "./hiring-form-values";

import type { CreatorRoom, CreatorRoomInput, CreatorRoomMessage, CreatorTeam, CreatorTeamMember } from "../../../../../../packages/contracts/src/creator-hiring";

import Link from "@/compat/router-link";
import { api, getApiErrorMessage } from "@/infrastructure/api";

const root = "/collaborations/rooms";
type RoomSummary = Pick<CreatorRoom, "id" | "title" | "kind" | "startsAt" | "endsAt">;
export function MeetingScheduleForm({ scope, onCreated }: { scope: Pick<CreatorRoomInput, "kind" | "applicationId" | "teamId" | "participantIds">; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState(scope.kind === "interview" ? "지원자 면접" : "팀 회의"), [start, setStart] = useState(() => dateInput(new Date(Date.now() + 5 * 60000).toISOString())), [end, setEnd] = useState(() => dateInput(new Date(Date.now() + 35 * 60000).toISOString()));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit() { if (busy) return; setBusy(true); setError(""); try { const v = await api.post<{ id: string }>(root, { ...scope, title, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() }); onCreated(v.id); } catch (e) { setError(await getApiErrorMessage(e, "일정을 저장하지 못했어요.")); } finally { setBusy(false); } }
  return <form className="space-y-3 rounded border border-line p-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}><fieldset className="space-y-3" disabled={busy}><legend className="mb-2 font-bold">{scope.kind === "interview" ? "이 지원자와 면접 예약" : "선택한 팀원과 회의 예약"}</legend><p className="text-xs">음성·영상 서비스는 미설정입니다. 대기실과 텍스트 대화가 가능합니다. 최대 4시간 · 호스트 포함 12명</p><CollabField label="방 이름"><input required maxLength={100} className={collabInput} value={title} onChange={(e) => setTitle(e.target.value)} /></CollabField><CollabField label="시작 (기기 시간대)"><input type="datetime-local" required className={collabInput} value={start} onChange={(e) => setStart(e.target.value)} /></CollabField><CollabField label="종료 (기기 시간대)"><input type="datetime-local" required className={collabInput} value={end} onChange={(e) => setEnd(e.target.value)} /></CollabField>{error && <CollabNotice error>{error}</CollabNotice>}<button type="submit" className={collabPrimary}>일정·초대 저장</button></fieldset></form>;
}
export function InterviewScheduleButton({ applicationId, candidateId }: { applicationId: string; candidateId: string }) {
  const [open, setOpen] = useState(false), [id, setId] = useState("");
  return <div className="mt-4 space-y-3"><button className={collabButton} onClick={() => setOpen(!open)}>이 지원자와 면접 예약</button>{open && !id && <MeetingScheduleForm scope={{ kind: "interview", applicationId, teamId: null, participantIds: [candidateId] }} onCreated={setId} />}{id && <Link className={collabButton} href={`/collaborate/workspace?room=${id}`}>예약한 면접 대기실 열기</Link>}</div>;
}
export function CreatorMeetingPanel({ actor }: { actor: string }) {
  const [params, setParams] = useSearchParams(), selected = params.get("room") ?? "";
  const [rooms, setRooms] = useState<RoomSummary[]>([]), [teams, setTeams] = useState<CreatorTeam[]>([]), [teamId, setTeamId] = useState("");
  const [members, setMembers] = useState<CreatorTeamMember[]>([]), [participantIds, setParticipantIds] = useState<string[]>([]), [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { const c = new AbortController(); void Promise.all([api.get<RoomSummary[]>(root, { signal: c.signal }), api.get<CreatorTeam[]>("/collaborations/teams", { signal: c.signal })]).then(([r, t]) => { if (!c.signal.aborted) { setRooms(r); setTeams(t); } }).catch(async (e) => { const m = await getApiErrorMessage(e, "회의 목록을 불러오지 못했어요."); if (!c.signal.aborted) setError(m); }); return () => c.abort(); }, [refresh]);
  useEffect(() => { if (!teamId) return; const c = new AbortController(); void api.get<CreatorTeamMember[]>(`/collaborations/teams/${teamId}/members`, { signal: c.signal }).then((m) => { if (!c.signal.aborted) setMembers(m.filter((v) => v.status === "active" && v.userId !== actor)); }).catch(async (e) => { const m = await getApiErrorMessage(e, "팀원을 불러오지 못했어요."); if (!c.signal.aborted) setError(m); }); return () => c.abort(); }, [teamId, actor]);
  const open = (id: string) => { const next = new URLSearchParams(params); next.set("room", id); setParams(next); };
  return <section className="space-y-4 rounded-2xl border border-line p-5"><h2 className="text-xl font-bold">면접·팀 회의</h2>{error && <CollabNotice error>{error}</CollabNotice>}<button className={collabButton} onClick={() => setRefresh((n) => n + 1)}>목록 새로 불러오기</button><div className="flex flex-wrap gap-2">{rooms.map((r) => <button key={r.id} className={collabButton} onClick={() => open(r.id)}>{r.title} · {new Date(r.startsAt).toLocaleString("ko-KR")}</button>)}</div>{rooms.length === 0 && !error && <p>초대된 면접·회의가 없어요.</p>}
    <CollabField label="회의를 만들 팀"><select className={collabInput} value={teamId} onChange={(e) => { setTeamId(e.target.value); setMembers([]); setParticipantIds([]); }}><option value="">참여 중인 팀 선택</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></CollabField>{teamId && <fieldset><legend>초대할 팀원 (최대 11명)</legend>{members.map((m) => <label className="flex min-h-11 items-center gap-2" key={m.userId}><input type="checkbox" checked={participantIds.includes(m.userId)} disabled={!participantIds.includes(m.userId) && participantIds.length >= 11} onChange={() => setParticipantIds(participantIds.includes(m.userId) ? participantIds.filter((id) => id !== m.userId) : [...participantIds, m.userId])} />{m.displayName}</label>)}</fieldset>}
    {teamId && participantIds.length > 0 && <MeetingScheduleForm scope={{ kind: "meeting", teamId, applicationId: null, participantIds }} onCreated={(id) => { open(id); setRefresh((v) => v + 1); }} />}
    {selected && <MeetingRoom key={`${selected}:${actor}`} id={selected} actor={actor} />}
  </section>;
}
function MeetingRoom({ id, actor }: { id: string; actor: string }) {
  const [room, setRoom] = useState<CreatorRoom | null>(null), [messages, setMessages] = useState<CreatorRoomMessage[]>([]), [text, setText] = useState(""), [audience, setAudience] = useState<"lobby" | "admitted">("lobby");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const path = `${root}/${encodeURIComponent(id)}`;
  useEffect(() => {
    const c = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const next = await api.get<CreatorRoom>(path, { signal: c.signal });
        const data = next.status === "ended" ? [] : await api.get<CreatorRoomMessage[]>(`${path}/messages`, { params: { epoch: next.epoch }, signal: c.signal });
        if (!c.signal.aborted) { setRoom(next); setMessages(data); setError(""); }
      } catch (e) { const message = await getApiErrorMessage(e, "방 상태를 확인하지 못했어요."); if (!c.signal.aborted) { setRoom(null); setMessages([]); setError(message); } }
      finally { if (!c.signal.aborted) timer = setTimeout(() => { void poll(); }, 5000); }
    }
    void poll(); return () => { c.abort(); if (timer) clearTimeout(timer); };
  }, [path, refresh]);
  async function act(endpoint: string, body: object) { if (!room || busy) return; setBusy(true); setError(""); try { await api.post(`${path}/${endpoint}`, { expectedEpoch: room.epoch, ...body }); setText(""); setRefresh((n) => n + 1); } catch (e) { setError(await getApiErrorMessage(e, "방 상태가 바뀌었어요. 다시 확인해 주세요.")); setMessages([]); setRefresh((n) => n + 1); } finally { setBusy(false); } }
  const host = room?.hostId === actor;
  return <section className="space-y-4 rounded-xl border border-accent/40 bg-panel p-5" aria-label="면접·회의 대기실">{error && <CollabNotice error>{error}</CollabNotice>}{!room && !error && <p role="status">방 상태를 확인하고 있어요.</p>}{room && <><h3 className="text-xl font-bold">{room.title}</h3><p>내 상태: {({ invited: "초대됨", waiting: "호스트 입장 승인 대기", admitted: "텍스트 대화 입장 승인됨", removed: "퇴장됨", left: "나감" })[room.myStatus]} · {room.status === "ended" ? "종료된 회의" : "5초마다 상태 확인"}</p><CollabNotice>음성·영상 제공자가 구성되지 않았습니다. 실시간 통화, 녹음, 전사, AI는 꺼져 있습니다. 입장 승인으로 팀·원고 권한이 생기지 않습니다.</CollabNotice><DeviceTest />
      {room.status !== "ended" && <><div className="flex flex-wrap gap-2">{["invited", "left"].includes(room.myStatus) && <button className={collabPrimary} disabled={busy} onClick={() => { void act("enter", {}); }}>대기실에 들어가기</button>}{!host && ["waiting", "admitted"].includes(room.myStatus) && <button className={collabButton} disabled={busy} onClick={() => { void act("leave", {}); }}>방에서 나가기</button>}{host && <button className={collabButton} disabled={busy} onClick={() => { if (globalThis.confirm("이 회의를 종료할까요?")) void act("host", { action: "end", targetAccountId: null }); }}>회의 종료</button>}</div>
        <ul className="space-y-2">{room.participants.map((p) => <li key={p.userId} className="flex flex-wrap gap-3"><span>{p.displayName} · {p.role === "host" ? "호스트" : "참여자"} · {p.status}</span>{host && p.userId !== actor && <>{p.status === "waiting" && <button disabled={busy} className={collabButton} onClick={() => { void act("host", { action: "admit", targetAccountId: p.userId }); }}>입장 승인</button>}{!["removed", "left"].includes(p.status) && <button disabled={busy} className={collabButton} onClick={() => { void act("host", { action: "remove", targetAccountId: p.userId }); }}>퇴장</button>}</>}</li>)}</ul>
        <ol aria-label="텍스트 대화" className="max-h-80 space-y-2 overflow-y-auto rounded border border-line p-3">{messages.map((m) => <li key={m.id}><span className="text-xs text-fg-3">{m.displayName} · {new Date(m.createdAt).toLocaleTimeString("ko-KR")}</span><p className="whitespace-pre-wrap break-words">{m.text}</p></li>)}</ol>
        {["waiting", "admitted"].includes(room.myStatus) && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void act("messages", { text, audience: room.myStatus === "admitted" ? audience : "lobby" }); }}>{room.myStatus === "admitted" && <CollabField label="메시지 대상"><select className={collabInput} value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}><option value="lobby">{host ? "대기실 전체 공지 (초대·대기·입장 참여자 모두)" : "호스트에게 보내기 (본인·호스트만 표시)"}</option><option value="admitted">입장 승인된 참여자</option></select></CollabField>}<CollabField label="메시지"><textarea className={collabInput} required maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} /></CollabField><button type="submit" className={collabPrimary} disabled={busy}>텍스트 보내기</button></form>}
      </>}
    </>}</section>;
}
export function DeviceTest() {
  const generation = useRef(0);
  const stream = useRef<MediaStream | null>(null), video = useRef<HTMLVideoElement>(null), mounted = useRef(true), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState("꺼짐"), [busy, setBusy] = useState(false);
  function stop() { generation.current++; stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; if (video.current) video.current.srcObject = null; if (timer.current) clearTimeout(timer.current); timer.current = null; if (mounted.current) setState("꺼짐"); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); }; }, []);
  async function test() { if (busy) return; stop(); const currentGeneration = generation.current; setBusy(true); try { const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); if (!mounted.current || currentGeneration !== generation.current) { s.getTracks().forEach((t) => t.stop()); return; } stream.current = s; if (video.current) video.current.srcObject = s; setState("이 기기에서만 확인 중 · 30초 뒤 자동 종료"); timer.current = setTimeout(stop, 30000); } catch { if (mounted.current) setState("장치를 열지 못했어요. 브라우저 권한을 확인해 주세요."); } finally { if (mounted.current) setBusy(false); } }
  return <details><summary className="cursor-pointer py-2">내 마이크·카메라 장치 확인</summary><p className="my-2 text-xs">직접 버튼을 누를 때만 장치를 엽니다. 전송·녹음하지 않으며 테스트 소리는 재생하지 않습니다.</p><div className="flex gap-2"><button className={collabButton} disabled={busy} onClick={() => { void test(); }}>장치 테스트 시작</button><button className={collabButton} onClick={stop}>장치 끄기</button></div><p role="status" className="my-2 text-sm">{state}</p><video ref={video} muted autoPlay playsInline className="max-h-48 w-full rounded bg-black" aria-label="내 기기 카메라 미리보기" /></details>;
}
