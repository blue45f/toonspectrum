import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { CollabField, CollabNotice, collabInput, collabPrimary } from "../collaboration-ui";
import { dateInput } from "./hiring-form-values";

import type { CreatorRoomInput } from "../../../../../../packages/contracts/src/creator-hiring";

import { api, getApiErrorMessage } from "@/infrastructure/api";

type Scope = Pick<CreatorRoomInput, "kind" | "applicationId" | "teamId" | "participantIds">;
interface Props { scope: Scope; onCreated: (id: string) => void }
export function MeetingScheduleForm(props: Props) {
  const { scope } = props;
  const identity = JSON.stringify([scope.kind, scope.applicationId, scope.teamId, [...scope.participantIds].sort()]);
  return <ScheduleForm key={identity} {...props} />;
}
function ScheduleForm({ scope, onCreated }: Props) {
  const [title, setTitle] = useState(scope.kind === "interview" ? "지원자 면접" : "팀 회의");
  const [start, setStart] = useState(() => dateInput(new Date(Date.now() + 5 * 60000).toISOString()));
  const [end, setEnd] = useState(() => dateInput(new Date(Date.now() + 35 * 60000).toISOString()));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  async function submit() {
    if (pending.current) return;
    const startsAt = new Date(start), endsAt = new Date(end);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 4 * 3600000) {
      setError("종료는 시작 이후이며 회의 길이는 4시간 이내여야 해요."); return;
    }
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError("");
    try {
      const response = await api.post<unknown>("/collaborations/rooms", { ...scope, title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }, { signal: controller.signal, timeout: 10000, retry: 0 });
      if (pending.current !== controller || controller.signal.aborted) return;
      const result = z.object({ id: z.string().min(1).max(256) }).safeParse(response);
      if (!result.success) throw new Error("생성된 회의의 응답을 확인하지 못했어요.");
      onCreated(result.data.id);
    } catch (cause) {
      const message = await getApiErrorMessage(cause, "일정 저장 결과를 확인하지 못했어요.");
      if (pending.current === controller && !controller.signal.aborted) setError(message);
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }
  return <form className="space-y-3 rounded border border-line p-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <fieldset className="space-y-3" disabled={busy}>
      <legend className="mb-2 font-bold">{scope.kind === "interview" ? "이 지원자와 면접 예약" : "선택한 팀원과 회의 예약"}</legend>
      <p className="text-xs">대기실과 텍스트 대화가 가능합니다. 음성·영상은 미설정입니다. 최대 4시간 · 호스트 포함 12명</p>
      <CollabField label="방 이름"><input required maxLength={100} className={collabInput} value={title} onChange={(event) => setTitle(event.target.value)} /></CollabField>
      <CollabField label="시작 (기기 시간대)"><input type="datetime-local" required className={collabInput} value={start} onChange={(event) => setStart(event.target.value)} /></CollabField>
      <CollabField label="종료 (기기 시간대)"><input type="datetime-local" required className={collabInput} value={end} onChange={(event) => setEnd(event.target.value)} /></CollabField>
      {error && <CollabNotice error>{error}<p>자동 재전송하지 않습니다. 이미 저장됐을 수 있으니 회의 목록을 먼저 확인해 주세요.</p></CollabNotice>}
      <button type="submit" className={collabPrimary}>{busy ? "일정 저장 확인 중…" : "일정·초대 저장"}</button>
    </fieldset>
    <p className="text-xs text-fg-3">참여 대상이 바뀌면 입력 화면도 새로 시작합니다. 화면 전환은 서버에서 이미 처리한 예약을 취소하지 않습니다.</p>
  </form>;
}
