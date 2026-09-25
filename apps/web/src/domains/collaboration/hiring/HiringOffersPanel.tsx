import { useEffect, useRef, useState } from "react";

import { CollabNotice, collabButton, collabPrimary } from "../collaboration-ui";

import { hiringMatchingClient } from "./hiring-matching-client";
import { HiringTermsView } from "./HiringSlotEditor";

import type { HiringOffer } from "../../../../../../packages/contracts/src/creator-hiring";

import Link from "@/shared/navigation/router-link";
import { getApiErrorMessage } from "@/platform/api";

export function HiringOffersPanel({ actor }: { actor: string }) {
  const [items, setItems] = useState<HiringOffer[] | null>(null), [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  const keys = useRef(new Map<string, string>());
  useEffect(() => { const c = new AbortController(); void hiringMatchingClient.offers(c.signal).then((v) => { if (!c.signal.aborted) setItems(v); }).catch(async (e) => { const m = await getApiErrorMessage(e, "제안을 불러오지 못했어요."); if (!c.signal.aborted) setError(m); }); return () => c.abort(); }, [refresh]);
  async function act(offer: HiringOffer, action: "accept" | "decline" | "cancel") {
    if (busy) return; setBusy(true); setError(""); setNote("");
    const key = `${offer.id}:${action}`; if (!keys.current.has(key)) keys.current.set(key, crypto.randomUUID());
    try {
      if (action === "accept") { const receipt = await hiringMatchingClient.accept(offer.id, keys.current.get(key)!); setNote(`조건 수락을 기록했어요. ${new Date(receipt.holdExpiresAt).toLocaleString("ko-KR")}까지 예약되며 작업실 연결은 대기 중입니다. 계약 체결·문서 접근 권한은 부여되지 않았습니다.`); }
      else { await hiringMatchingClient.change(offer.id, action, keys.current.get(key)!); setNote("제안을 종료하고 예약 여력을 해제했어요."); }
      setRefresh((n) => n + 1);
    } catch (e) { setError(await getApiErrorMessage(e, "제안을 처리하지 못했어요.")); } finally { setBusy(false); }
  }
  const labels = { pending: "답변 대기", accepted: "조건 수락 · 작업실 연결 대기", declined: "거절", cancelled: "취소", expired: "만료" };
  return <section className="space-y-4 rounded-2xl border border-line p-5"><h2 className="text-xl font-bold">받고 보낸 작업 제안</h2><p className="text-sm text-fg-3">관심 표시, 조건 수락, 계약, 작업실 권한은 각각 별도 단계입니다. 현재 작업실 연결은 대기 상태이며 자동으로 문서를 열 수 없습니다.</p>{error && <CollabNotice error>{error}</CollabNotice>}{note && <CollabNotice>{note}</CollabNotice>}<button className={collabButton} disabled={busy} onClick={() => setRefresh((n) => n + 1)}>새로 불러오기</button>{items?.length === 0 && <p>아직 받은 제안이나 보낸 제안이 없어요.</p>}
    {items?.map((o) => <article key={o.id} className="space-y-4 rounded-xl border border-line bg-panel p-4"><h3 className="font-bold">{o.candidateId === actor ? "받은 제안" : "보낸 제안"} · {labels[o.state]}</h3><Link className="text-accent underline" href={`/collaborate/${o.postId}`}>원래 공고 보기</Link><p className="text-sm">답변 만료 {new Date(o.expiresAt).toLocaleString("ko-KR")} · 조건 버전 {o.termsRevision}</p><HiringTermsView terms={o.terms} />
      <div className="flex flex-wrap gap-2">{o.state === "pending" && o.candidateId === actor && <><button className={collabPrimary} disabled={busy} onClick={() => { if (globalThis.confirm("표시된 조건을 수락하고 30분 동안 작업 여력을 예약할까요? 계약·문서 권한은 별도입니다.")) void act(o, "accept"); }}>이 조건 수락</button><button className={collabButton} disabled={busy} onClick={() => { void act(o, "decline"); }}>거절</button></>}{["pending", "accepted"].includes(o.state) && <button className={collabButton} disabled={busy} onClick={() => { void act(o, "cancel"); }}>제안·예약 취소</button>}</div>
    </article>)}
  </section>;
}
export { HiringDiscovery } from "./HiringDiscovery";
