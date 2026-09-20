import { useEffect, useRef, useState } from "react";

import { CollabNotice, collabButton } from "../collaboration-ui";
import { newOfferRequest } from "./hiring-form-values";
import { hiringMatchingClient } from "./hiring-matching-client";

import type { HiringCandidate, HiringCandidatePage, HiringSlot } from "../../../../../../packages/contracts/src/creator-hiring";

import { getApiErrorMessage } from "@/infrastructure/api";

export function HiringDiscovery({ slot, postVersion = 1 }: { slot: HiringSlot; postVersion?: number }) {
  return <CandidateDiscovery key={`${slot.postId}:${slot.id}:${slot.revision}:${slot.state}:${postVersion}`} slot={slot} />;
}
function CandidateDiscovery({ slot }: { slot: HiringSlot }) {
  const [page, setPage] = useState<HiringCandidatePage | null>(null);
  const [trail, setTrail] = useState<(string | undefined)[]>([undefined]);
  const [busy, setBusy] = useState<"search" | "offer" | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set());
  const [now, setNow] = useState(Date.now);
  const search = useRef<AbortController | null>(null);
  const sending = useRef<AbortController | null>(null);
  const offset = useRef(0);
  const requests = useRef(new Map<string, { expiresAt: string; mutationId: string }>());
  const open = ["open", "matching"].includes(slot.state);
  useEffect(() => () => {
    search.current?.abort(); search.current = null;
    sending.current?.abort(); sending.current = null;
  }, []);
  useEffect(() => {
    if (!page) return;
    const tick = () => setNow(Date.now() + offset.current);
    const timer = window.setInterval(tick, 15000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(timer); window.removeEventListener("focus", tick); };
  }, [page]);
  async function discover(nextTrail: (string | undefined)[]) {
    if (!open || sending.current) return;
    search.current?.abort();
    const controller = new AbortController(); search.current = controller;
    setTrail(nextTrail); setBusy("search"); setPage(null); setError(""); setNote("");
    try {
      const next = await hiringMatchingClient.discover(slot.postId, slot.id, { expectedRevision: slot.revision, ...(nextTrail.at(-1) ? { after: nextTrail.at(-1) } : {}) }, controller.signal);
      if (search.current !== controller || controller.signal.aborted) return;
      if (!next || !Array.isArray(next.items) || next.items.length > 30 || next.limit !== 30 || next.ordering !== "account-id"
        || next.termsRevision !== slot.revision || !Number.isFinite(Date.parse(next.observedAt)) || !(next.next === null || (typeof next.next === "string" && next.next.length > 0 && next.next.length <= 2048))
        || next.items.some((candidate) => !candidate || typeof candidate.userId !== "string" || !candidate.userId || typeof candidate.displayName !== "string"
          || !Array.isArray(candidate.reasons) || candidate.reasons.some((reason) => typeof reason !== "string")
          || !Number.isFinite(Date.parse(candidate.expiresAt)) || !Number.isFinite(Date.parse(candidate.confirmedAt)))
        || new Set(next.items.map((candidate) => candidate.userId)).size !== next.items.length) throw new Error("Invalid candidate page");
      offset.current = Date.parse(next.observedAt) - Date.now(); setNow(Date.parse(next.observedAt)); setPage(next);
    } catch (cause) {
      const message = await getApiErrorMessage(cause, "후보를 찾지 못했어요. 모집 조건을 확인한 뒤 다시 조회해 주세요.");
      if (search.current === controller && !controller.signal.aborted) setError(message);
    } finally {
      if (search.current === controller) { search.current = null; setBusy(null); }
    }
  }
  function cancelSearch() {
    search.current?.abort(); search.current = null; setBusy(null); setPage(null); setError(""); setNote("후보 조회를 취소했어요.");
  }
  async function send(candidate: HiringCandidate, requestedAt: number) {
    if (!open || search.current || sending.current || !page || sent.has(candidate.userId)
      || !page.items.some((item) => item.userId === candidate.userId) || Date.parse(candidate.expiresAt) <= requestedAt + offset.current) return;
    const controller = new AbortController(); sending.current = controller; setBusy("offer"); setError(""); setNote("");
    if (!requests.current.has(candidate.userId)) requests.current.set(candidate.userId, newOfferRequest());
    const request = requests.current.get(candidate.userId)!;
    try {
      await hiringMatchingClient.send(slot.postId, slot.id, { candidateId: candidate.userId, expectedRevision: slot.revision, ...request }, controller.signal);
      if (sending.current !== controller || controller.signal.aborted) return;
      requests.current.delete(candidate.userId); setSent((value) => new Set([...value, candidate.userId]));
      setNote(`제안 저장을 확인했어요. 답변 만료는 ${new Date(request.expiresAt).toLocaleString("ko-KR")}입니다. 아직 열람·수락된 것은 아닙니다.`);
    } catch (cause) {
      const message = await getApiErrorMessage(cause, "제안 결과를 확인하지 못했어요. 같은 요청으로 다시 확인할 수 있어요.");
      if (sending.current === controller && !controller.signal.aborted) setError(message);
    } finally { if (sending.current === controller) { sending.current = null; setBusy(null); } }
  }
  const hasNext = Boolean(page?.next && !trail.includes(page.next));
  return <section className="space-y-3 border-t border-line pt-4" aria-label="지금 작업 가능한 후보" aria-busy={busy !== null}>
    <h4 className="font-bold">지금 작업 가능한 후보</h4>
    <p className="text-xs text-fg-3">공개에 동의한 후보를 조건과 작업 여력을 먼저 확인한 뒤 계정 식별자 순으로 한 페이지 최대 30명씩 표시합니다. 능력 순위나 전체 인원 수가 아니며, 다음 페이지에서도 최신 상태를 확인합니다.</p>
    <div className="flex flex-wrap gap-2"><button type="button" className={collabButton} disabled={busy !== null || !open} onClick={() => { void discover([undefined]); }}>조건에 맞는 후보 찾기</button>
      {busy === "search" && <button type="button" className={collabButton} onClick={cancelSearch}>후보 조회 취소</button>}
      {error && <button type="button" className={collabButton} disabled={busy !== null || !open} onClick={() => { void discover(trail); }}>현재 페이지 다시 조회</button>}</div>
    {!open && <CollabNotice>모집이 중단되었어요. 다시 열린 모집 자리에서 후보를 찾아 주세요.</CollabNotice>}
    {busy && <p role="status">{busy === "search" ? "최신 조건과 작업 여력을 확인하고 있어요." : "제안 저장 결과를 확인하고 있어요."}</p>}
    {error && <CollabNotice error>{error}</CollabNotice>}{note && <CollabNotice>{note}</CollabNotice>}
    {page && <p role="status" className="text-sm">{trail.length}페이지 · 이 페이지 {page.items.length}명 · 조건 버전 {page.termsRevision}</p>}
    {page?.items.length === 0 && <p>{trail.length === 1 ? "조회 시점에 조건과 작업 여력이 맞는 공개 후보가 없어요." : "이 위치 이후에 현재 조건과 작업 여력이 맞는 후보가 없어요. 이전 페이지 또는 처음부터 다시 확인해 주세요."}</p>}
    {page?.items.map((candidate) => {
      const expired = Date.parse(candidate.expiresAt) <= now;
      return <article key={candidate.userId} className="space-y-2 rounded border border-line p-3">
        <h5 className="font-semibold">{candidate.displayName}</h5><p className="text-sm">{candidate.reasons.join(" · ")}</p>
        <p className="text-xs">직접 확인 {new Date(candidate.confirmedAt).toLocaleTimeString("ko-KR")} · 만료 {new Date(candidate.expiresAt).toLocaleTimeString("ko-KR")}</p>
        {expired && <p className="text-xs">작업 가능 확인이 만료되었어요. 후보를 다시 조회해 주세요.</p>}
        <button type="button" className={collabButton} disabled={busy !== null || expired || sent.has(candidate.userId) || !open} onClick={() => { void send(candidate, Date.now()); }}>{sent.has(candidate.userId) ? "제안 저장 완료" : "이 조건으로 30분 유효 제안 보내기"}</button>
      </article>;
    })}
    {(trail.length > 1 || hasNext) && <nav aria-label="후보 페이지 이동" className="flex flex-wrap gap-2">
      <button type="button" className={collabButton} disabled={busy !== null || trail.length === 1} onClick={() => { void discover(trail.slice(0, -1)); }}>이전 후보</button>
      <button type="button" className={collabButton} disabled={busy !== null || trail.length === 1} onClick={() => { void discover([undefined]); }}>처음부터 다시 조회</button>
      <button type="button" className={collabButton} disabled={busy !== null || !hasNext} onClick={() => { if (page?.next && hasNext) void discover([...trail, page.next]); }}>다음 후보</button>
    </nav>}
    <p className="text-xs text-fg-3">조회 결과는 조회 시점의 정보입니다. 제안을 저장할 때 서버에서 동의·차단·가능 시간·작업 여력을 다시 확인합니다. 자동으로 제안을 보내거나 문서 권한을 부여하지 않습니다.</p>
  </section>;
}
