import { useEffect, useRef, useState } from "react";

import { CREATOR_HIRING_ROLES } from "../../../../../../packages/contracts/src/creator-hiring";
import { CollabField, CollabNotice, collabButton, collabInput, collabPrimary } from "../collaboration-ui";

import { careerConfirmationClient as client } from "./career-confirmation-client";

import type { CareerConfirmationCollaborator, CareerConfirmationPage, CareerConfirmationPreview, CareerConfirmationRequest, CareerConfirmationState } from "../../../../../../packages/contracts/src/creator-career-confirmation";
import type { CreatorCareerItem, CreatorCareerVersion } from "../../../../../../packages/contracts/src/creator-hiring";

import { getApiErrorMessage } from "@/platform/api";
import { useApp } from "@/shared/lib/store";

const labels: Record<CareerConfirmationState, string> = { requested: "응답 대기", confirmed: "상대방 확인", declined: "거절됨", revoked: "철회·효력 종료", expired: "만료됨" };
export function CareerConfirmationSnapshot({ content }: { content: CreatorCareerVersion["content"] }) {
  return <div className="space-y-2 rounded border border-line bg-panel p-4"><p className="font-bold">{content.title} · {CREATOR_HIRING_ROLES[content.role]}</p><p>{content.startMonth}~{content.endMonth ?? "진행 중"}{content.episodeFrom !== null ? ` · ${content.episodeFrom}~${content.episodeTo}화` : ""}</p><p className="whitespace-pre-wrap">작업 범위: {content.scope}</p><p className="whitespace-pre-wrap">기여 내용: {content.contribution}</p><p>{content.visibility === "public" ? "현재 경력은 공개 상태입니다." : "이 요청으로 비공개 경력이 공개되지 않습니다."}</p><a className={collabButton} href={content.portfolioUrl} target="_blank" rel="noopener noreferrer nofollow">공유 허락된 외부 포트폴리오 보기</a></div>;
}
export function CareerConfirmationPanel({ items }: { items: CreatorCareerItem[] }) {
  const actor = useApp((s) => s.userId);
  return actor ? <ConfirmationContent key={`${actor}:${items.map((i) => `${i.id}:${i.currentVersionId}`).join(",")}`} items={items.filter((i) => i.userId === actor)} /> : null;
}
function ConfirmationContent({ items }: { items: CreatorCareerItem[] }) {
  const [ready, setReady] = useState(false), [loadError, setLoadError] = useState(""), [error, setError] = useState(""), [note, setNote] = useState("");
  const [reload, setReload] = useState(0), [busy, setBusy] = useState(false);
  const life = useRef<AbortController | null>(null), busyRef = useRef(false), receipts = useRef(new Map<string, string>());
  const [collaborators, setCollaborators] = useState<CareerConfirmationPage<CareerConfirmationCollaborator> | null>(null), [collaboratorCursor, setCollaboratorCursor] = useState<string>();
  const [careerId, setCareerId] = useState(""), [collaboratorKey, setCollaboratorKey] = useState(""), [preview, setPreview] = useState<CareerConfirmationPreview | null>(null), [consent, setConsent] = useState(false);
  const [direction, setDirection] = useState<"sent" | "received">("received"), [cursor, setCursor] = useState<string>(), [page, setPage] = useState<CareerConfirmationPage<CareerConfirmationRequest> | null>(null);
  const [review, setReview] = useState<{ id: string; action: "confirmed" | "revoked" } | null>(null), [attest, setAttest] = useState(false);
  useEffect(() => { const c = new AbortController(); life.current = c; return () => { c.abort(); }; }, []);
  useEffect(() => {
    const c = new AbortController(); setReady(false); setLoadError("");
    void client.capability(c.signal).then(() => { if (!c.signal.aborted) setReady(true); }).catch(() => { if (!c.signal.aborted) setLoadError("상대방 확인 저장소를 사용할 수 없어요. 기존 경력 작성·권리 설정·이력서 가져오기는 계속 사용할 수 있습니다."); });
    return () => c.abort();
  }, [reload]);
  useEffect(() => {
    if (!ready) return;
    const c = new AbortController(); setCollaborators(null); setCollaboratorKey(""); setPreview(null); setConsent(false);
    void client.collaborators(collaboratorCursor, c.signal).then((v) => { if (!c.signal.aborted) setCollaborators(v); }).catch(async (e) => { const message = await getApiErrorMessage(e, "현재 팀원을 불러오지 못했어요."); if (!c.signal.aborted) setError(message); });
    return () => c.abort();
  }, [ready, collaboratorCursor]);
  useEffect(() => {
    if (!ready) return;
    const c = new AbortController(); setPage(null); setReview(null); setAttest(false);
    void client.list(direction, cursor, c.signal).then((v) => { if (!c.signal.aborted) setPage(v); }).catch(async (e) => { const message = await getApiErrorMessage(e, "확인 요청을 불러오지 못했어요."); if (!c.signal.aborted) setError(message); });
    return () => c.abort();
  }, [ready, direction, cursor]);
  const selected = items.find((i) => i.id === careerId && i.rights !== "pending");
  const teammate = collaborators?.items.find((m) => `${m.teamId}:${m.targetAccountId}` === collaboratorKey);
  // Preview is canceled and consent cleared whenever its selection changes.
  useEffect(() => {
    setPreview(null); setConsent(false);
    if (!selected || !teammate) return;
    const c = new AbortController();
    void client.preview({ careerId: selected.id, versionId: selected.currentVersionId, teamId: teammate.teamId, targetAccountId: teammate.targetAccountId }, c.signal)
      .then((v) => { if (!c.signal.aborted && v.careerId === selected.id && v.versionId === selected.currentVersionId && v.targetAccountId === teammate.targetAccountId && v.teamId === teammate.teamId) setPreview(v); })
      .catch(async (e) => { const message = await getApiErrorMessage(e, "공유 미리보기를 불러오지 못했어요."); if (!c.signal.aborted) setError(message); });
    return () => c.abort();
  }, [selected, teammate, reload]);
  async function run(key: string, work: (mutationId: string, signal: AbortSignal) => Promise<{ state: CareerConfirmationState }>) {
    const c = life.current;
    if (!c || c.signal.aborted || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setNote("");
    if (!receipts.current.has(key)) receipts.current.set(key, crypto.randomUUID());
    try {
      const result = await work(receipts.current.get(key)!, c.signal);
      if (c.signal.aborted) return;
      window.dispatchEvent(new Event("career-confirmation-changed"));
      receipts.current.delete(key); setPreview(null); setConsent(false); setReview(null); setPage(null);
      setNote(result.state === "expired" ? "유효기간이 지나 만료로 처리했어요." : "요청 결과를 저장했어요. 현재 상태를 다시 불러옵니다.");
      setReload((v) => v + 1);
    } catch (e) {
      const message = await getApiErrorMessage(e, "처리 결과를 확인하지 못했어요. 같은 동작을 다시 누르면 같은 요청 번호로 확인합니다.");
      if (!c.signal.aborted) setError(message);
    } finally { if (!c.signal.aborted) { busyRef.current = false; setBusy(false); } }
  }
  const retry = () => { setError(""); setLoadError(""); setReload((v) => v + 1); };
  return <section className="space-y-4 rounded-xl border border-line p-4" aria-label="경력 상대방 확인"><h3 className="text-lg font-bold">경력 상대방 확인</h3>
    <p className="text-sm leading-6">같은 팀의 현재 구성원에게 이 경력 버전의 기여·기간·범위를 직접 확인받습니다. 팀 참여는 서로의 관계만 보여 주며 실제 작업 완료를 증명하지 않습니다. 수락한 구인 제안도 제작 완료 증거가 아닙니다. 상대방 확인은 플랫폼의 신원·고용 검증이나 실력 평가가 아니며 채용 순위·활동 점수에 영향을 주지 않습니다.</p>
    <p className="text-sm">요청 내용은 당사자 두 사람만 볼 수 있습니다. 요청·확인은 요청일로부터 30일간 유효합니다. 버전·공개 설정·공유 권리·계정·팀 관계 변경이나 차단으로 효력이 끝나며, 어느 당사자든 철회할 수 있습니다. 기존 이력서 저장본에 영구 확인 배지를 넣지 않습니다.</p>
    {(loadError || error) && <CollabNotice error>{loadError || error}<button className={`${collabButton} ml-2`} onClick={retry} disabled={busy}>확인 기능 다시 불러오기</button></CollabNotice>}{note && <CollabNotice>{note}</CollabNotice>}
    {!ready && !loadError && <p role="status">확인 기능을 불러오고 있어요.</p>}
    {ready && <><fieldset disabled={busy} className="space-y-3"><legend className="font-semibold">확인 요청 보내기</legend>
      <CollabField label="확인받을 내 현재 경력"><select className={collabInput} value={careerId} onChange={(e) => setCareerId(e.target.value)}><option value="">공유 권리가 있는 경력 선택</option>{items.filter((i) => i.rights !== "pending").map((i) => <option value={i.id} key={i.id}>{i.title} · 버전 {i.revision}</option>)}</select></CollabField>
      {items.filter((i) => i.rights !== "pending").length === 0 && <p>먼저 경력을 저장하고 공유 권리를 확인해 주세요.</p>}
      <CollabField label="확인을 요청할 현재 팀원"><select className={collabInput} value={collaboratorKey} onChange={(e) => setCollaboratorKey(e.target.value)}><option value="">팀원 선택</option>{collaborators?.items.map((m) => <option key={`${m.teamId}:${m.targetAccountId}`} value={`${m.teamId}:${m.targetAccountId}`}>{m.displayName} · {m.teamName}</option>)}</select></CollabField>
      {!collaborators && !error && <p role="status">현재 팀원을 불러오고 있어요.</p>}{collaborators?.items.length === 0 && <p>요청할 수 있는 현재 팀원이 없어요. 초대 대기·탈퇴·차단된 계정은 선택할 수 없습니다.</p>}
      <div className="flex gap-2">{collaboratorCursor && <button className={collabButton} onClick={() => setCollaboratorCursor(undefined)}>팀원 처음 페이지</button>}{collaborators?.nextCursor && <button className={collabButton} onClick={() => setCollaboratorCursor(collaborators.nextCursor!)}>다음 팀원 50명</button>}</div>
      {selected && teammate && !preview && !error && <p role="status">상대방에게 보일 내용을 확인하고 있어요.</p>}
      {preview && <><h4 className="font-semibold">{preview.targetName}에게 보일 버전 {preview.versionRevision}</h4><CareerConfirmationSnapshot content={preview.snapshot} /><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />이 버전의 내용과 링크를 선택한 상대방에게 공유하고 확인을 요청하는 데 동의합니다.</label>
        <button className={collabPrimary} disabled={!consent} onClick={() => { if (!consent) return; const input = { careerId: preview.careerId, versionId: preview.versionId, teamId: preview.teamId, targetAccountId: preview.targetAccountId, sourceDigest: preview.sourceDigest, requesterMembershipRevision: preview.requesterMembershipRevision, targetMembershipRevision: preview.targetMembershipRevision, consent: "exact-version-2026-09-20" as const }; void run(JSON.stringify(input), (mutationId, signal) => client.request({ ...input, mutationId }, signal)); }}>이 버전 확인 요청 보내기</button></>}
    </fieldset>
    <div className="flex flex-wrap gap-2" aria-label="확인 요청함"><button className={collabButton} aria-pressed={direction === "received"} disabled={busy} onClick={() => { setDirection("received"); setCursor(undefined); }}>받은 확인 요청</button><button className={collabButton} aria-pressed={direction === "sent"} disabled={busy} onClick={() => { setDirection("sent"); setCursor(undefined); }}>보낸 확인 요청</button><button className={collabButton} disabled={busy} onClick={retry}>현재 상태 새로고침</button></div>
    {!page && !error && <p role="status">확인 요청을 불러오고 있어요.</p>}{page?.items.length === 0 && <p>{direction === "received" ? "받은" : "보낸"} 확인 요청이 없어요.</p>}
    {page?.items.map((r) => <article key={r.id} className="space-y-3 rounded border border-line p-4"><h4 className="font-semibold">{r.counterpartName} · {labels[r.state]} · 버전 {r.versionRevision}</h4><p className="text-sm">요청 {new Date(r.createdAt).toLocaleDateString("ko-KR")} · 유효기간 {new Date(r.expiresAt).toLocaleString("ko-KR")}까지</p>{r.snapshot ? <CareerConfirmationSnapshot content={r.snapshot} /> : <p>원본 또는 관계의 변경으로 공유 내용을 더 이상 볼 수 없어요. 이전 확인은 새 버전이나 재가입에 이어지지 않습니다.</p>}
      {r.confirmedAt && <p className="text-sm">상대방이 응답한 날짜: {new Date(r.confirmedAt).toLocaleDateString("ko-KR")} · 현재 효력은 위 상태를 확인해 주세요.</p>}
      <div className="flex flex-wrap gap-2">{r.canRespond && <><button className={collabPrimary} disabled={busy} onClick={() => { setReview({ id: r.id, action: "confirmed" }); setAttest(false); }}>내용 확인 후 응답</button><button className={collabButton} disabled={busy} onClick={() => { void run(`${r.id}:declined:${r.revision}`, (mutationId, signal) => client.action(r.id, { action: "declined", expectedRevision: r.revision, mutationId }, signal)); }}>확인 요청 거절</button></>}{r.canRevoke && <button className={collabButton} disabled={busy} onClick={() => { setReview({ id: r.id, action: "revoked" }); setAttest(false); }}>요청·확인 철회</button>}</div>
      {review?.id === r.id && <fieldset className="space-y-2 rounded border border-line p-3" disabled={busy}><legend>{review.action === "confirmed" ? "정확한 기여 내용 확인" : "확인 효력 철회"}</legend>{review.action === "confirmed" ? <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} />이 저장 버전의 기여·기간·범위를 직접 알고 있으며, 기재된 내용이 맞다고 확인합니다.</label> : <p>이 요청 또는 확인의 효력을 끝냅니다. 기존 경력과 이력서 내용은 그대로 남습니다.</p>}
        <button className={collabPrimary} disabled={review.action === "confirmed" && !attest} onClick={() => { const action = review.action; if (action === "confirmed" && !attest) return; void run(`${r.id}:${action}:${r.revision}`, (mutationId, signal) => client.action(r.id, { action, expectedRevision: r.revision, mutationId }, signal)); }}>{review.action === "confirmed" ? "이 버전의 기여 확인" : "철회 확정"}</button><button className={collabButton} onClick={() => setReview(null)}>취소</button></fieldset>}
    </article>)}
    <div className="flex gap-2">{cursor && <button className={collabButton} disabled={busy} onClick={() => setCursor(undefined)}>요청 처음 페이지</button>}{page?.nextCursor && <button className={collabButton} disabled={busy} onClick={() => setCursor(page.nextCursor!)}>다음 요청 30건</button>}</div></>}
  </section>;
}
