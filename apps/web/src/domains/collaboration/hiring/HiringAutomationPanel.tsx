import { useEffect, useRef, useState } from "react";

import { CollabNotice, collabButton, collabPrimary } from "../collaboration-ui";
import { automaticInvitations } from "./hiring-automation-client";

import type { AutomaticInvitationState } from "./hiring-automation-client";
import type { HiringSlot } from "../../../../../../packages/contracts/src/creator-hiring";

import { getApiErrorMessage } from "@/infrastructure/api";

export function HiringAutomationPanel({ slot, postVersion }: { slot: HiringSlot; postVersion: number }) {
  return <AutomaticCampaign key={`${slot.postId}:${slot.id}:${slot.revision}:${postVersion}`} slot={slot} postVersion={postVersion} />;
}
function AutomaticCampaign({ slot, postVersion }: { slot: HiringSlot; postVersion: number }) {
  const [state, setState] = useState<AutomaticInvitationState | null>(null);
  const [reload, setReload] = useState(0);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mutation = useRef<AbortController | null>(null);
  const uncertainStart = useRef<string | null>(null);
  useEffect(() => () => { mutation.current?.abort(); mutation.current = null; }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function read() {
      try {
        const next = await automaticInvitations.read(slot.postId, slot.id, controller.signal);
        if (controller.signal.aborted) return;
        setState(next);
        if (next.enabled && next.job && ["queued", "processing"].includes(next.job.status)) {
          timer = setTimeout(() => { if (document.visibilityState === "visible") void read(); }, 15000);
        }
      } catch (cause) {
        const message = await getApiErrorMessage(cause, "자동 초대 상태를 확인하지 못했어요.");
        if (!controller.signal.aborted) { setState(null); setError(message); }
      }
    }
    void read();
    const visible = () => { if (document.visibilityState === "visible") setReload((value) => value + 1); };
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [slot.postId, slot.id, reload]);
  async function act(action: "start" | "stop") {
    if (mutation.current || (action === "start" && (!consent || !state?.enabled))) return;
    const controller = new AbortController();
    mutation.current = controller; setBusy(true); setError(""); setNotice("");
    try {
      if (action === "start") {
        uncertainStart.current ??= crypto.randomUUID();
        await automaticInvitations.start(slot.postId, slot.id, { mutationId: uncertainStart.current, expectedRevision: slot.revision, expectedPostVersion: postVersion, mode: "automatic" }, controller.signal);
      } else await automaticInvitations.stop(slot.postId, slot.id, controller.signal);
      if (mutation.current !== controller || controller.signal.aborted) return;
      uncertainStart.current = null; setConsent(false);
      setNotice(action === "start" ? "자동 초대를 예약했어요. 초대는 지원·채용 확정이 아닙니다." : "자동 초대와 유효한 대기 초대를 중지했어요.");
      setReload((value) => value + 1);
    } catch (cause) {
      const message = await getApiErrorMessage(cause, "요청 결과를 확인하지 못했어요. 다시 시도해 주세요.");
      if (mutation.current === controller && !controller.signal.aborted) setError(message);
    } finally {
      if (mutation.current === controller) { mutation.current = null; setBusy(false); }
    }
  }
  const active = state?.job && ["queued", "processing"].includes(state.job.status);
  const canStart = Boolean(state?.enabled && !active && state.job?.status !== "completed");
  const labels = { queued: "실행 대기", processing: "초대 처리 중", completed: "두 차례 처리 완료", failed: "재시도 한도 도달", stopped: "중지", expired: "만료" };
  return <section aria-label="자동 급구 초대" className="space-y-3 border-t border-line pt-4">
    <h4 className="font-bold">긴급 후보 초대 · 자동 실행</h4>
    <p className="text-sm">현재 조건으로 1차 최대 5명, 5분 뒤 2차 최대 10명에게 사이트 내 초대를 보냅니다. 후보의 최신 동의와 작업 여력을 확인하며 문자·메일이나 유료 제공자는 사용하지 않습니다.</p>
    {!state && !error && <p role="status">자동 초대 기능 상태를 확인하고 있어요.</p>}
    {state && !state.enabled && <CollabNotice>자동 초대가 운영 설정에서 꺼져 있거나 아직 준비되지 않았어요. 수동 초대는 계속 이용할 수 있습니다.</CollabNotice>}
    {error && <CollabNotice error>{error}</CollabNotice>}{notice && <CollabNotice>{notice}</CollabNotice>}
    {state?.job && <p role="status">{labels[state.job.status]} · 조건 버전 {state.job.termsRevision}{active ? ` · 다음 확인 ${new Date(state.job.nextExecutionAt).toLocaleString("ko-KR")}` : ""}</p>}
    {canStart && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />현재 공고 버전 {postVersion} · 모집 조건 버전 {slot.revision}으로 두 차례 자동 초대에 동의합니다.</label>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={collabButton} disabled={busy} onClick={() => { setError(""); setReload((value) => value + 1); }}>자동 초대 상태 새로고침</button>
      {canStart && <button type="button" className={collabPrimary} disabled={busy || !consent} onClick={() => { void act("start"); }}>동의한 조건으로 자동 초대 시작</button>}
      {state?.job && ["queued", "processing", "failed"].includes(state.job.status) && <button type="button" className={collabButton} disabled={busy} onClick={() => { void act("stop"); }}>자동 초대·대기 초대 중지</button>}
    </div>
    <p className="text-xs text-fg-3">후보가 부족하면 가능한 인원만 초대합니다. 매칭 성공이나 응답 시간을 보장하지 않으며 원고 접근 권한을 부여하지 않습니다.</p>
  </section>;
}
