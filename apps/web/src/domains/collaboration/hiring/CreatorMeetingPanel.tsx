import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { CollabField, CollabNotice, collabButton, collabInput } from "../collaboration-ui";

import { MeetingScheduleForm } from "./CreatorMeetingScheduleForm";
import { MeetingRoom } from "./CreatorMeetingRoom";


import type { CreatorRoom, CreatorTeam, CreatorTeamMember } from "../../../../../../packages/contracts/src/creator-hiring";

import Link from "@/shared/navigation/router-link";
import { api, getApiErrorMessage } from "@/platform/api";

export { MeetingScheduleForm } from "./CreatorMeetingScheduleForm";
export { DeviceTest } from "./CreatorMeetingDeviceTest";

const root = "/collaborations/rooms";
type RoomSummary = Pick<CreatorRoom, "id" | "title" | "kind" | "startsAt" | "endsAt">;
export function InterviewScheduleButton({ applicationId, candidateId }: { applicationId: string; candidateId: string }) {
  const [open, setOpen] = useState(false), [id, setId] = useState("");
  return <div className="mt-4 space-y-3"><button className={collabButton} onClick={() => setOpen(!open)}>이 지원자와 면접 예약</button>{open && !id && <MeetingScheduleForm scope={{ kind: "interview", applicationId, teamId: null, participantIds: [candidateId] }} onCreated={setId} />}{id && <Link className={collabButton} href={`/team/recruiting?room=${id}`}>예약한 면접 대기실 열기</Link>}</div>;
}
export function CreatorMeetingPanel({ actor }: { actor: string }) {
  return <MeetingPanelContent key={actor} actor={actor} />;
}
function MeetingPanelContent({ actor }: { actor: string }) {
  const [params, setParams] = useSearchParams(), selected = params.get("room") ?? "";
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null), [teams, setTeams] = useState<CreatorTeam[]>([]), [teamId, setTeamId] = useState("");
  const [members, setMembers] = useState<CreatorTeamMember[]>([]), [participantIds, setParticipantIds] = useState<string[]>([]), [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { const c = new AbortController(); void Promise.all([api.get<RoomSummary[]>(root, { signal: c.signal, timeout: 10000, retry: 0 }), api.get<CreatorTeam[]>("/collaborations/teams", { signal: c.signal })]).then(([r, t]) => { if (!c.signal.aborted) { setRooms(r); setTeams(t); setError(""); } }).catch(async (e) => { const m = await getApiErrorMessage(e, "회의 목록을 불러오지 못했어요."); if (!c.signal.aborted) setError(m); }); return () => c.abort(); }, [refresh]);
  useEffect(() => { if (!teamId) return; const c = new AbortController(); void api.get<CreatorTeamMember[]>(`/collaborations/teams/${teamId}/members`, { signal: c.signal }).then((m) => { if (!c.signal.aborted) setMembers(m.filter((v) => v.status === "active" && v.userId !== actor)); }).catch(async (e) => { const m = await getApiErrorMessage(e, "팀원을 불러오지 못했어요."); if (!c.signal.aborted) setError(m); }); return () => c.abort(); }, [teamId, actor]);
  const open = (id: string) => { const next = new URLSearchParams(params); next.set("room", id); setParams(next); };
  return <section className="space-y-4 rounded-2xl border border-line p-5"><h2 className="text-xl font-bold">면접·팀 회의</h2>{error && <CollabNotice error>{error}</CollabNotice>}<button className={collabButton} onClick={() => setRefresh((n) => n + 1)}>목록 새로 불러오기</button><div className="flex flex-wrap gap-2">{rooms?.map((r) => <button key={r.id} className={collabButton} onClick={() => open(r.id)}>{r.title} · {new Date(r.startsAt).toLocaleString("ko-KR")}</button>)}</div>{rooms === null && !error && <p role="status">초대된 면접·회의를 불러오고 있어요.</p>}{rooms?.length === 0 && !error && <p>초대된 면접·회의가 없어요.</p>}
    <CollabField label="회의를 만들 팀"><select className={collabInput} value={teamId} onChange={(e) => { setTeamId(e.target.value); setMembers([]); setParticipantIds([]); }}><option value="">참여 중인 팀 선택</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></CollabField>{teamId && <fieldset><legend>초대할 팀원 (최대 11명)</legend>{members.map((m) => <label className="flex min-h-11 items-center gap-2" key={m.userId}><input type="checkbox" checked={participantIds.includes(m.userId)} disabled={!participantIds.includes(m.userId) && participantIds.length >= 11} onChange={() => setParticipantIds(participantIds.includes(m.userId) ? participantIds.filter((id) => id !== m.userId) : [...participantIds, m.userId])} />{m.displayName}</label>)}</fieldset>}
    {teamId && participantIds.length > 0 && <MeetingScheduleForm scope={{ kind: "meeting", teamId, applicationId: null, participantIds }} onCreated={(id) => { open(id); setRefresh((v) => v + 1); }} />}
    {selected && <MeetingRoom key={`${selected}:${actor}`} id={selected} actor={actor} />}
  </section>;
}
