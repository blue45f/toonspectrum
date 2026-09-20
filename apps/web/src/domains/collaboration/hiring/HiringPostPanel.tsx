import { useEffect, useState } from "react";

import { CollabNotice, collabButton, collabPrimary } from "../collaboration-ui";

import { HiringCampaignPanel } from "./HiringCampaignPanel";

import { HiringDiscovery } from "./HiringOffersPanel";

import { hiringSlotsClient } from "./hiring-slots-client";
import { HiringSlotEditor, HiringTermsView } from "./HiringSlotEditor";
import { emptyTerms } from "./hiring-form-values";

import type { HiringSlot, HiringSlotTerms } from "../../../../../../packages/contracts/src/creator-hiring";

import { getApiErrorMessage } from "@/infrastructure/api";

export function HiringPostPanel({ postId, postVersion, canManage }: { postId: string; postVersion: number; canManage: boolean }) {
  const [items, setItems] = useState<HiringSlot[] | null>(null), [refresh, setRefresh] = useState(0), [error, setError] = useState("");
  const [edit, setEdit] = useState<{ slot: HiringSlot | null; terms: HiringSlotTerms } | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    void hiringSlotsClient.list(postId, c.signal).then((v) => { if (!c.signal.aborted) setItems(v); }).catch(async (e) => { const m = await getApiErrorMessage(e, "모집 조건을 불러오지 못했어요."); if (!c.signal.aborted) setError(m); });
    return () => c.abort();
  }, [postId, postVersion, refresh]);
  async function act(work: () => Promise<unknown>) {
    if (busy) return; setBusy(true); setError("");
    try { await work(); setEdit(null); setRefresh((n) => n + 1); } catch (e) { setError(await getApiErrorMessage(e, "모집 조건을 저장하지 못했어요.")); } finally { setBusy(false); }
  }
  const states = { open: "모집 중", matching: "후보 탐색 중", reserved: "예약 중", filled: "모집 완료", paused: "일시 중지", cancelled: "취소" };
  return <section className="space-y-4 rounded-2xl border border-line bg-panel p-6"><h2 className="text-xl font-bold">분야별 모집 조건</h2>{error && <CollabNotice error>{error}<button className={collabButton} onClick={() => { setError(""); setRefresh((n) => n + 1); }}>새로 불러오기</button></CollabNotice>}
    {!items && !error && <p role="status">모집 조건을 불러오고 있어요.</p>}{items?.length === 0 && <p className="text-sm">아직 추가된 분야별 조건이 없어요. 기존 공고 본문에서 조건을 확인하세요.</p>}
    {canManage && <button className={collabPrimary} disabled={busy} onClick={() => setEdit({ slot: null, terms: emptyTerms() })}>1명 모집 자리 추가</button>}
    {edit && <HiringSlotEditor key={edit.slot?.id ?? "new"} initial={edit.terms} busy={busy} onCancel={() => setEdit(null)} onSave={(terms) => { void act(() => hiringSlotsClient.save(postId, edit.slot?.id ?? null, terms, edit.slot?.revision ?? 0, postVersion)); }} />}
    {items?.map((s) => <article key={s.id} className="space-y-4 rounded-xl border border-line p-4"><h3 className="font-semibold">1명 모집 · {states[s.state]} · 조건 버전 {s.revision}</h3><HiringTermsView terms={s.terms} />
      {canManage && <div className="flex flex-wrap gap-2"><button className={collabButton} disabled={busy || !["open", "paused", "matching"].includes(s.state)} onClick={() => setEdit({ slot: s, terms: s.terms })}>조건 수정</button>{s.state !== "filled" && <><button className={collabButton} disabled={busy || s.state === "reserved"} onClick={() => { void act(() => hiringSlotsClient.state(postId, s, s.state === "open" ? "paused" : "open")); }}>{s.state === "open" ? "모집 일시 중지" : "모집 재개"}</button><button className={collabButton} disabled={busy || s.state === "cancelled"} onClick={() => { if (globalThis.confirm("이 모집 자리와 대기 중인 제안·예약을 취소할까요?")) void act(() => hiringSlotsClient.state(postId, s, "cancelled")); }}>모집 취소</button></>}</div>}
      {canManage && ["open", "matching"].includes(s.state) && <><HiringDiscovery slot={s} /><HiringCampaignPanel slot={s} postVersion={postVersion} /></>}
    </article>)}
  </section>;
}
