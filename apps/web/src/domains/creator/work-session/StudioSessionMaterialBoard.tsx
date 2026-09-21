import { useState } from "react";
import type { StudioSessionResources, StudioWorkSessionView } from "@toonspectrum/studio-project-model/work-session";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { newStudioProjectGraphId } from "../project-graph/studio-project-graph-client";
import type { StudioWorkSessionController } from "./studio-work-session-controller";
import { useStudioSessionFormDraft } from "./use-studio-session-form-draft";
import { StudioSessionMaterialPreview } from "./StudioSessionMaterialPreview";

const control = "min-h-11 max-w-full rounded-lg border border-line bg-card px-3 text-sm disabled:opacity-50";
const field = "mt-1 block min-h-11 w-full rounded-lg border border-line bg-card p-2 text-sm";
export function StudioSessionMaterialBoard({ view, actorId, controller, busy, saving = busy, resources, name }: {
  readonly view: StudioWorkSessionView; readonly actorId: string; readonly controller: StudioWorkSessionController;
  readonly busy: boolean; readonly saving?: boolean; readonly resources: StudioSessionResources | null; readonly name: (id: string) => string;
}) {
  const bt = useBilingual("StudioSessionMaterialBoard"), { session } = view;
  const terminal = ["closed", "cancelled"].includes(session.status);
  const canWrite = !terminal && view.capabilities.comment && session.participantUserIds.includes(actorId);
  const candidates = session.workflow?.materialCandidates ?? [], votes = session.workflow?.materialVotes ?? [], history = session.workflow?.materialDecisions ?? [];
  const selected = history.at(-1)?.candidateId ?? null;
  const [assetId, setAssetId] = useState(""), [previewId, setPreviewId] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState<string | null>(null), [decision, setDecision] = useState<{ candidateId: string | null; version: number } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const prefix = JSON.stringify(["session-material-draft-v1", actorId, session.workId, session.id]);
  const [title, setTitle, titleError] = useStudioSessionFormDraft(prefix + ":title", 160);
  const [rationale, setRationale, rationaleError] = useStudioSessionFormDraft(prefix + ":reason", 2000);
  const [conditions, setConditions, conditionsError] = useStudioSessionFormDraft(prefix + ":conditions", 2000);
  const [voteReason, setVoteReason, voteError] = useStudioSessionFormDraft(prefix + ":vote", 1000);
  const available = resources?.assets ?? [];
  const chosen = available.find((item) => item.assetId === assetId);
  const propose = async () => {
    if (!resources || busy || !canWrite || !chosen || !title.trim() || !rationale.trim() || !conditions.trim() || selected) return;
    const id = newStudioProjectGraphId("material-candidate");
    const { assetId: identity, sha256, elementType } = chosen;
    await controller.command({ action: "material-propose", candidate: { id, title, rationale, usageConditions: conditions,
      asset: { assetId: identity, sha256, elementType } } });
    if (controller.getSnapshot().view?.session.workflow?.materialCandidates.some((item) => item.id === id)) {
      setTitle(""); setRationale(""); setConditions(""); setAssetId("");
    }
  };
  const decide = async () => {
    if (!decision || !decisionReason.trim() || decision.version !== session.version || busy) return;
    await controller.command({ action: "material-decide", candidateId: decision.candidateId, rationale: decisionReason,
      observedVersion: decision.version });
    const recorded = controller.getSnapshot().view?.session.workflow?.materialDecisions.at(-1);
    if (recorded?.sessionVersion === decision.version && recorded.candidateId === decision.candidateId) {
      setDecision(null); setDecisionReason("");
    }
  };
  return <section className="space-y-3 rounded-xl border border-line p-3" aria-label={bt("소재 후보 비교·선정", "Material candidates and selection")}>
    <h4 className="font-semibold">{bt("소재 후보 비교·선정", "Material candidates and selection")} · {candidates.length}/16</h4>
    <p className="text-xs text-fg-2">{bt("이 작품에 등록된 불변 파일만 후보로 연결합니다. 참여자가 직접 투표하고 진행자가 근거를 남겨 선정합니다. 선정은 사용권 획득·파일 삽입·결제·공개가 아닙니다.", "Candidates reference immutable files registered to this work. Participants vote themselves; the host records a reasoned selection. Selection is not a rights grant, insertion, purchase or publication.")}</p>
    {canWrite && !selected ? <label className="block text-sm">{bt("내 투표 근거", "My vote rationale")}<textarea className={field} maxLength={1000} value={voteReason} onChange={(event) => setVoteReason(event.target.value)} disabled={saving} /></label> : null}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">{candidates.map((item) => {
      const current = available.find((entry) => entry.assetId === item.asset.assetId && entry.sha256 === item.asset.sha256 && entry.elementType === item.asset.elementType);
      const ballot = votes.find((entry) => entry.userId === actorId && entry.candidateId === item.id);
      return <article key={item.id} className="min-w-0 rounded-xl border border-line p-3" aria-label={item.title}>
        <h5 className="break-words font-semibold">{item.title}{selected === item.id ? ` · ${bt("선정됨", "Selected")}` : ""}</h5>
        <p className="mt-1 text-xs text-fg-3">{item.asset.elementType} · {item.asset.sha256.slice(0, 12)}…</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.rationale}</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-xs"><strong>{bt("제안자가 기록한 사용 조건", "Proposer-recorded usage conditions")}</strong><br />{item.usageConditions}</p>
        <p className="mt-2 text-xs">{bt("제안자", "Proposed by")} · {name(item.proposedBy)} · {votes.filter((entry) => entry.candidateId === item.id).length}{bt("표", " votes")}</p>
        {item.withdrawnAt ? <p role="status" className="mt-2 text-sm">{bt("제안이 철회되었습니다. 이력은 유지됩니다.", "Withdrawn; history is preserved.")}</p> : <>
          {!current ? <p role="status" className="mt-2 text-xs">{bt("현재 파일을 다시 확인해야 합니다. 삭제·권한 변경 여부를 확인한 뒤 진행하세요.", "The current file must be reverified. Check deletion or permission changes before proceeding.")}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {item.asset.elementType === "image" ? <button type="button" className={control} disabled={!current} aria-expanded={previewId === item.id}
              onClick={() => setPreviewId(previewId === item.id ? null : item.id)}>{bt("파일 미리보기", "Preview file")}</button> : null}
            {canWrite && !selected ? <button type="button" className={control} disabled={busy || !current || session.status !== "active"} aria-pressed={Boolean(ballot)}
              onClick={() => { void controller.command({ action: "material-vote", candidateId: ballot ? null : item.id, rationale: voteReason }); }}>{ballot ? bt("내 투표 취소", "Withdraw my vote") : bt("이 후보에 투표", "Vote for candidate")}</button> : null}
            {view.capabilities.edit && canWrite ? <button type="button" className={control} disabled={busy || !current || session.status !== "active"}
              onClick={() => { setDecision({ candidateId: item.id, version: session.version }); setDecisionReason(""); }}>{bt("선정 검토…", "Review selection…")}</button> : null}
            {canWrite && !selected && (view.capabilities.edit || item.proposedBy === actorId) ? <button type="button" className={control} disabled={busy}
              onClick={() => setWithdraw(withdraw === item.id ? null : item.id)}>{bt("후보 철회…", "Withdraw candidate…")}</button> : null}
          </div>
          {withdraw === item.id ? <p className="mt-2 text-xs">{bt("현재 투표에서 제외하고 이력만 남깁니다.", "Remove from current voting; retain history.")} <button type="button" className={control} disabled={busy}
            onClick={() => { void controller.command({ action: "material-withdraw", candidateId: item.id }); setWithdraw(null); }}>{bt("철회 확인", "Confirm withdrawal")}</button></p> : null}
          {previewId === item.id && current && resources ? <StudioSessionMaterialPreview workId={session.workId} asset={item.asset} title={item.title} expiresAt={resources.expiresAt} /> : null}
        </>}
      </article>;
    })}</div>
    {!candidates.length ? <p className="text-sm">{bt("아직 후보가 없습니다. 등록된 파일과 사용 조건을 함께 제안하세요.", "No candidates yet. Propose a registered file with usage conditions.")}</p> : null}
    {selected && view.capabilities.edit && canWrite ? <button type="button" className={control} disabled={busy || session.status !== "active"}
      onClick={() => { setDecision({ candidateId: null, version: session.version }); setDecisionReason(""); }}>{bt("선정을 보류하고 다시 논의…", "Reopen selection…")}</button> : null}
    {decision ? <form className="space-y-2 rounded-lg border border-accent p-3" onSubmit={(event) => { event.preventDefault(); void decide(); }}>
      <p className="text-sm font-semibold">{decision.candidateId ? bt("선정할 후보", "Candidate to select") : bt("선정 재논의", "Reopen selection")} · {candidates.find((item) => item.id === decision.candidateId)?.title ?? bt("현재 선정 해제", "Clear current selection")}</p>
      <p className="text-xs">{bt("현재 투표와 세션 버전을 근거로 기록합니다. 승인·사용권·원고는 변경하지 않습니다.", "Records the current ballots and session version. Approval, usage rights and manuscript remain unchanged.")}</p>
      {decision.version !== session.version ? <p role="alert" className="text-sm">{bt("검토 중 다른 변경이 저장되었습니다. 최신 후보·투표를 확인하세요.", "The session changed during review. Inspect the latest candidates and votes.")} <button type="button" className={control} onClick={() => setDecision({ ...decision, version: session.version })}>{bt("최신 상태 확인함", "Reviewed latest state")}</button></p> : null}
      <label className="block text-sm">{bt("선정·보류 근거", "Selection / reopening rationale")}<textarea className={field} maxLength={2000} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} disabled={saving} /></label>
      <button type="submit" className={control} disabled={busy || !decisionReason.trim() || decision.version !== session.version}>{bt("근거와 함께 기록", "Record with rationale")}</button>
      <button type="button" className={control} disabled={busy} onClick={() => setDecision(null)}>{bt("취소", "Cancel")}</button>
    </form> : null}
    {history.length ? <details><summary className="min-h-11 cursor-pointer text-sm">{bt("선정 근거 이력", "Selection history")} · {history.length}</summary><ol className="space-y-2">{history.map((item, index) => <li key={index} className="rounded-lg border border-line p-3 text-sm">
      <strong>{item.candidateId ? candidates.find((entry) => entry.id === item.candidateId)?.title : bt("재논의", "Reopened")}</strong> · {name(item.authorUserId)} · <time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time>
      <p className="whitespace-pre-wrap break-words">{item.rationale}</p><p className="text-xs text-fg-3">{bt("결정 당시 투표", "Votes at decision")} · {item.votes.length} · v{item.sessionVersion}</p>
    </li>)}</ol></details> : null}
    {canWrite && !selected ? <details className="rounded-lg border border-line p-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold">{bt("소재 후보 제안", "Propose material candidate")}</summary>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void propose(); }}><fieldset className="space-y-3" disabled={saving || candidates.length >= 16}>
        <label className="block text-sm">{bt("이 작품의 등록 파일", "Registered file in this work")}<select className={field} value={chosen?.assetId ?? ""} disabled={!resources} onChange={(event) => { setAssetId(event.target.value); const item = available.find((entry) => entry.assetId === event.target.value); if (!title && item) setTitle(item.title); }}>
          <option value="">{bt("파일 선택", "Choose file")}</option>{available.map((item) => <option key={item.assetId} value={item.assetId}>{item.title} · {item.elementType}</option>)}</select></label>
        <label className="block text-sm">{bt("후보 이름", "Candidate name")}<input className={field} value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="block text-sm">{bt("제안 근거", "Proposal rationale")}<textarea className={field} value={rationale} maxLength={2000} onChange={(event) => setRationale(event.target.value)} /></label>
        <label className="block text-sm">{bt("확인한 사용 조건과 미확인 사항", "Known conditions and unresolved rights")}<textarea className={field} value={conditions} maxLength={2000} onChange={(event) => setConditions(event.target.value)} /></label>
        <button type="submit" className={control} disabled={busy || !chosen || !title.trim() || !rationale.trim() || !conditions.trim()}>{bt("후보 등록", "Register candidate")}</button>
      </fieldset></form></details> : null}
    {titleError || rationaleError || conditionsError || voteError ? <p role="status" className="text-xs">{bt("초안 저장 공간을 사용할 수 없습니다. 화면을 닫기 전에 입력을 보관하세요.", "Draft storage is unavailable. Preserve input before closing.")}</p> : null}
  </section>;
}
