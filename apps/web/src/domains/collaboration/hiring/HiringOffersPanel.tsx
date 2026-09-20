import { useEffect, useRef, useState } from "react";

import { CollabNotice, collabButton, collabPrimary } from "../collaboration-ui";

import { newOfferRequest } from "./hiring-form-values";

import { hiringMatchingClient } from "./hiring-matching-client";
import { HiringTermsView } from "./HiringSlotEditor";

import type { HiringCandidate, HiringOffer, HiringSlot } from "../../../../../../packages/contracts/src/creator-hiring";

import Link from "@/compat/router-link";
import { getApiErrorMessage } from "@/infrastructure/api";

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
export function HiringDiscovery({ slot }: { slot: HiringSlot }) {
  const [items, setItems] = useState<HiringCandidate[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  const requests = useRef(new Map<string, { expiresAt: string; mutationId: string }>());
  async function discover() { if (busy) return; setBusy(true); setError(""); try { setItems((await hiringMatchingClient.discover(slot.postId, slot.id)).items); } catch (e) { setError(await getApiErrorMessage(e, "후보를 찾지 못했어요.")); } finally { setBusy(false); } }
  async function send(candidateId: string) {
    if (busy) return; setBusy(true); setError(""); setNote("");
    const key = `${slot.id}:${slot.revision}:${candidateId}`;
    if (!requests.current.has(key)) requests.current.set(key, newOfferRequest());
    const request = requests.current.get(key)!;
    try { await hiringMatchingClient.send(slot.postId, slot.id, { candidateId, expectedRevision: slot.revision, ...request }); requests.current.delete(key); setNote(`제안 저장을 확인했어요. 답변 만료는 ${new Date(request.expiresAt).toLocaleString("ko-KR")}입니다. 아직 열람·수락된 것은 아닙니다.`); } catch (e) { setError(await getApiErrorMessage(e, "제안을 보내지 못했어요. 같은 요청으로 다시 확인할 수 있어요.")); } finally { setBusy(false); }
  }
  return <section className="space-y-3 border-t border-line pt-4"><h4 className="font-bold">지금 작업 가능한 후보</h4><p className="text-xs text-fg-3">공개에 동의한 후보의 조건을 확인합니다. 조건과 작업 여력을 먼저 확인한 뒤 계정 식별자 순으로 최대 30명만 표시합니다. 전체 후보 목록이나 능력 순위가 아니며 다음 페이지는 제공하지 않습니다.</p><button className={collabButton} disabled={busy} onClick={() => { void discover(); }}>조건에 맞는 후보 찾기</button>{error && <CollabNotice error>{error}</CollabNotice>}{note && <CollabNotice>{note}</CollabNotice>}{items?.length === 0 && <p>조회 시점에 조건과 작업 여력이 맞는 공개 후보가 없어요.</p>}{items?.map((c) => <article key={c.userId} className="space-y-2 rounded border border-line p-3"><h5 className="font-semibold">{c.displayName}</h5><p className="text-sm">{c.reasons.join(" · ")}</p><p className="text-xs">직접 확인 {new Date(c.confirmedAt).toLocaleTimeString("ko-KR")} · 만료 {new Date(c.expiresAt).toLocaleTimeString("ko-KR")}</p><button className={collabButton} disabled={busy} onClick={() => { void send(c.userId); }}>이 조건으로 30분 유효 제안 보내기</button></article>)}</section>;
}
