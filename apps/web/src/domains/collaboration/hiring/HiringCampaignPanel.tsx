import { HiringAutomationPanel } from "./HiringAutomationPanel";
import { useEffect, useRef, useState } from "react";

import { CollabNotice, collabButton, collabPrimary } from "../collaboration-ui";

import type { HiringCampaign, HiringInvitation, HiringSlot } from "../../../../../../packages/contracts/src/creator-hiring";

import Link from "@/compat/router-link";
import { api, getApiErrorMessage } from "@/platform/api";

const root = "/collaborations/hiring";
export function HiringCampaignPanel({ slot, postVersion }: { slot: HiringSlot; postVersion: number }) {
  const [campaign, setCampaign] = useState<HiringCampaign | null>(null), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  const request = useRef<{ round: number; id: string } | null>(null);
  const path = `${root}/posts/${encodeURIComponent(slot.postId)}/slots/${encodeURIComponent(slot.id)}/campaign`;
  async function load() { const v = await api.get<HiringCampaign | null>(path); setCampaign(v); setLoaded(true); }
  async function act(kind: "load" | "dispatch" | "stop") {
    if (busy) return; setBusy(true); setError(""); setNote("");
    try {
      if (kind === "dispatch") {
        const round = campaign?.round ?? 0;
        if (request.current?.round !== round) request.current = { round, id: crypto.randomUUID() };
        const result = await api.post<{ sent: number }>(`${path}/dispatch`, { mutationId: request.current!.id });
        setNote(`${result.sent}명의 사이트 내 초대함에 저장했습니다. 발송은 열람·응답을 뜻하지 않습니다.`);
      } else if (kind === "stop") await api.post(`${path}/stop`, {});
      await load();
    } catch (e) { setError(await getApiErrorMessage(e, "초대 캠페인을 처리하지 못했어요.")); } finally { setBusy(false); }
  }
  return <section className="space-y-3 border-t border-line pt-4"><h4 className="font-bold">긴급 후보 초대 · 수동 실행</h4><p className="text-sm">1차 최대 5명, 5분 뒤 2차 최대 10명에게 초대합니다. 모집 성공 시간 보장이 아니며 자동 초대는 아래에서 별도로 설정합니다. 외부 문자·메일을 보내지 않습니다.</p>{error && <CollabNotice error>{error}</CollabNotice>}{note && <CollabNotice>{note}</CollabNotice>}
    <button className={collabButton} disabled={busy} onClick={() => { void act("load"); }}>캠페인 상태 확인</button>{loaded && <><p className="text-sm">{campaign ? `${campaign.round}차 완료 · 초대 저장 ${campaign.invitedCount}건 · ${{ active: "진행 중", completed: "회차 완료", stopped: "중지", exhausted: "종료" }[campaign.state]}` : "아직 시작하지 않았어요."}{campaign?.nextDispatchAt ? ` · 다음 수동 실행 가능 ${new Date(campaign.nextDispatchAt).toLocaleString("ko-KR")}` : ""}</p>{(!campaign || campaign.state === "active") && <div className="flex gap-2"><button className={collabPrimary} disabled={busy} onClick={() => { void act("dispatch"); }}>{campaign?.round ? "2차 초대 직접 보내기" : "1차 초대 직접 보내기"}</button>{campaign && <button className={collabButton} disabled={busy} onClick={() => { void act("stop"); }}>캠페인·대기 초대 중지</button>}</div>}</>}
    <HiringAutomationPanel slot={slot} postVersion={postVersion} />
  </section>;
}
export function HiringInvitationInbox() {
  const [items, setItems] = useState<HiringInvitation[] | null>(null), [reload, setReload] = useState(0), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { const c = new AbortController(); void api.get<HiringInvitation[]>(`${root}/invitations`, { signal: c.signal }).then((v) => { if (!c.signal.aborted) setItems(v); }).catch(async (e) => { const m = await getApiErrorMessage(e, "초대함을 불러오지 못했어요."); if (!c.signal.aborted) setError(m); }); return () => c.abort(); }, [reload]);
  async function respond(id: string, action: string) { if (busy) return; setBusy(true); setError(""); try { await api.patch(`${root}/invitations/${encodeURIComponent(id)}`, { action }); setReload((n) => n + 1); } catch (e) { setError(await getApiErrorMessage(e, "초대에 응답하지 못했어요.")); } finally { setBusy(false); } }
  const labels = { unread: "읽지 않음", read: "읽음", interested: "관심 있음", declined: "거절", expired: "만료", cancelled: "취소" };
  return <section className="space-y-4 rounded-2xl border border-line p-5"><h2 className="text-xl font-bold">후보 초대함</h2><p className="text-sm">관심 표시는 지원·조건 수락·계약이 아닙니다. 공고를 확인하고 원하는 경우 별도로 지원하세요.</p>{error && <CollabNotice error>{error}</CollabNotice>}<button className={collabButton} disabled={busy} onClick={() => setReload((n) => n + 1)}>새로 불러오기</button>{items?.length === 0 && <p>도착한 초대가 없어요.</p>}{items?.map((i) => <article key={i.id} className="space-y-3 rounded-xl border border-line bg-panel p-4"><h3 className="font-bold">{i.title} · {labels[i.state]}</h3><p className="text-sm">만료 {new Date(i.expiresAt).toLocaleString("ko-KR")}</p><Link href={`/collaborate/${i.postId}`} className={collabButton}>공고 보기</Link>{["unread", "read", "interested"].includes(i.state) && <div className="flex flex-wrap gap-2">{([ ["read", "읽음으로 표시"], ["interested", "관심 있음"], ["declined", "거절"], ["stop", "앞으로 초대 알림 받지 않기"] ] as const).map(([action, label]) => <button key={action} className={collabButton} disabled={busy} onClick={() => { void respond(i.id, action); }}>{label}</button>)}</div>}</article>)}</section>;
}
