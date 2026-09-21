import { useId, useState } from "react";
import type { StudioReviewSourceReference } from "@toonspectrum/studio-project-model";
import type { StudioWorkSessionView } from "@toonspectrum/studio-project-model/work-session";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioWorkSessionController } from "./studio-work-session-controller";
import { useSessionEvidence } from "./use-session-evidence";
import { studioSessionEvidenceNote } from "./studio-session-evidence-note";

const control = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm disabled:opacity-50";
export function StudioSessionEvidencePanel({ view, actorId, controller, busy, onInspect }: {
  readonly view: StudioWorkSessionView; readonly actorId: string; readonly controller: StudioWorkSessionController;
  readonly busy: boolean; readonly onInspect: (source: StudioReviewSourceReference) => void;
}) {
  const bt = useBilingual("StudioSessionEvidencePanel"), id = useId();
  const [open, setOpen] = useState(false), [filter, setFilter] = useState<"all" | "unknown" | "3d">("all");
  const resource = useSessionEvidence(view.session, actorId, open, () => controller.suspend());
  const evidence = resource.value?.evidence;
  const assets = evidence?.assets.filter((asset) => filter === "all" || (filter === "unknown" ? asset.commercialUse === "unknown" : asset.nativeSceneKind !== null)) ?? [];
  const inspectPage = (source: StudioReviewSourceReference) => onInspect({ version: 1, sourceServerRevision: source.sourceServerRevision,
    sourceContentDigest: source.sourceContentDigest, pageOrdinal: source.pageOrdinal, pageId: source.pageId });
  const canCite = !busy && view.capabilities.comment && view.session.participantUserIds.includes(actorId)
    && !["closed", "cancelled"].includes(view.session.status) && view.session.version < 128;
  return <section className="min-w-0 space-y-3 rounded-xl border border-line p-3" aria-label={bt("제출본 근거 기록", "Pinned evidence")}>
    <button type="button" className={`${control} w-full text-left font-semibold`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      {bt("소재 사용 · AI 기록", "Asset usage · AI records")} {open ? "−" : "+"}
    </button>
    {open ? <div id={id} className="min-w-0 space-y-3">
      <p className="text-xs text-fg-2">{bt("현재 원고가 아닌 제출본에 보존된 기록입니다. 원문 프롬프트·API 키·외부 오류 내용은 표시하지 않습니다. 라이선스와 비용의 외부 증명을 대신하지 않습니다.", "Records preserved in the submitted snapshot, not the current manuscript. Raw prompts, API keys and upstream errors are excluded. These records are not independent license or billing proof.")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={control} onClick={resource.refresh}>{bt("기록 다시 확인", "Refresh evidence")}</button>
        <button type="button" className={control} disabled={resource.offset === 0} onClick={() => resource.setOffset(0)}>{bt("처음 페이지", "First pages")}</button>
        {resource.value?.nextOffset !== null && resource.value?.nextOffset !== undefined ? <button type="button" className={control} onClick={() => resource.setOffset(resource.value!.nextOffset!)}>{bt("다음 페이지", "Next pages")}</button> : null}
      </div>
      {!resource.value ? <p role="status">{resource.failed ? bt("기록을 확인하지 못했습니다. 다시 시도해 주세요.", "Evidence could not be verified. Please retry.") : bt("제출본 기록 확인 중…", "Checking snapshot records…")}</p>
        : !evidence ? <p role="status">{bt("검증된 제출본 원본 기록이 없어 근거를 표시하지 않습니다. 최신 원고로 대체하지 않았습니다.", "Verified source records are unavailable; the current manuscript was not substituted.")}</p> : <>
        <p className="break-all text-xs">{bt("고정 제출본", "Pinned source")} · r{evidence.sourceServerRevision} · {evidence.sourceContentDigest}</p>
        <h5 className="font-semibold">{bt("소재 사용 위치", "Asset placements")} · {resource.offset + 1}–{resource.offset + 25}</h5>
        <label className="flex flex-wrap items-center gap-2 text-sm">{bt("표시 범위", "Show")}
          <select className={control} value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="all">{bt("모든 소재", "All assets")}</option><option value="unknown">{bt("상업 이용 미확인", "Commercial use unknown")}</option><option value="3d">{bt("3D 원본 기록", "3D source records")}</option>
          </select>
        </label>
        {assets.length ? <ul className="space-y-2">{assets.map((asset) => <li key={JSON.stringify(asset.source)} className="min-w-0 rounded-lg border border-line p-3 text-sm">
          <strong className="break-words">{asset.name}</strong><p className="break-all text-xs">{asset.source.pageId} / {asset.source.elementId} · {asset.kind}{asset.nativeSceneKind ? ` · ${asset.nativeSceneKind}` : ""}</p>
          <p className="break-words">{bt("저장된 이용 조건", "Saved usage terms")}: {asset.licenseLabel ?? bt("미확인", "Unknown")} · {asset.commercialUse === "unknown" ? bt("상업 이용 미확인", "Commercial use unknown") : asset.commercialUse === "allowed" ? bt("상업 이용 허용으로 기록됨", "Recorded as commercially allowed") : bt("상업 이용 금지로 기록됨", "Recorded as commercially prohibited")}</p>
          {asset.attribution ? <p className="break-words">{bt("저장된 출처 표기", "Saved attribution")}: {asset.attribution}</p> : null}
          <button type="button" className={`${control} mt-2`} disabled={busy} onClick={() => inspectPage(asset.source)}>{bt("사용된 고정 페이지 보기", "View pinned usage page")}</button>
        </li>)}</ul> : <p className="text-sm">{bt("이 페이지 범위와 필터에 해당하는 소재 기록이 없습니다.", "No asset records match this page window and filter.")}</p>}
        <h5 className="font-semibold">{bt("제출본 AI 실행 기록", "AI records in the snapshot")} · {evidence.aiOperations.length}</h5>
        <p className="text-xs text-fg-2">{bt("사용량은 저장된 보고값입니다. 실제 청구 비용·모델이 읽은 전체 입력·출력 변경 내역은 이 기록만으로 확인할 수 없습니다. 실패·취소 기록도 숨기지 않습니다.", "Usage is a stored report. This record alone cannot verify billing, the model's complete input or output changes. Failed and cancelled records remain visible.")}</p>
        {evidence.aiOperations.length ? <ul className="space-y-2">{evidence.aiOperations.map((op) => <li key={op.id} className="min-w-0 rounded-lg border border-line p-3 text-sm">
          <strong className="break-words">{op.provider} / {op.model}</strong>
          <p>{({ pending: bt("미완료", "Pending"), succeeded: bt("성공으로 기록됨", "Recorded successful"), failed: bt("실패", "Failed"), cancelled: bt("취소", "Cancelled") })[op.status]} · {op.transport}</p>
          <time dateTime={op.createdAt} className="text-xs">{op.createdAt}</time>
          <p>{bt("보고된 토큰 사용량", "Reported token usage")}: {op.usage?.totalTokens ?? bt("전체 미확인", "Total unknown")}
            {op.usage?.promptTokens !== undefined ? ` · ${bt("입력", "Input")} ${op.usage.promptTokens}` : ""}
            {op.usage?.completionTokens !== undefined ? ` · ${bt("출력", "Output")} ${op.usage.completionTokens}` : ""}</p>
          <p className="break-all text-xs">{bt("프롬프트 해시", "Prompt hash")}: {op.promptDigest ?? bt("미확인", "Unknown")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {op.target ? <button type="button" className={control} disabled={busy} onClick={() => inspectPage(op.target!)}>{bt("대상 고정 페이지 보기", "View pinned target page")}</button>
              : <span className="text-xs">{op.targetStatus === "outside-page-window" ? bt("대상은 다른 페이지 범위에 있습니다.", "The target is outside this page window.") : bt("대상 위치 미확인", "Target location unavailable")}</span>}
            <button type="button" className={control} disabled={!canCite} onClick={() => { if (!canCite) return; if (!resource.value || Date.parse(resource.value.expiresAt) <= Date.now()) { resource.refresh(); return; } void controller.command({ action: "note", category: "ai-evidence", body: studioSessionEvidenceNote(evidence, op) }); }}>{bt("검토 기록에 인용", "Cite in session notes")}</button>
          </div>
        </li>)}</ul> : <p className="text-sm">{bt("이 제출본에 확인 가능한 AI 실행 기록이 없습니다. AI 미사용을 뜻하지는 않습니다.", "No readable AI records in this snapshot. This does not establish that no AI was used.")}</p>}
        {evidence.omittedAssets || evidence.omittedAiOperations || evidence.invalidEntries ? <p role="status" className="text-xs">{bt("표시 한도 또는 형식 문제로 제외된 기록", "Records omitted due to limits or invalid format")}: {evidence.omittedAssets + evidence.omittedAiOperations + evidence.invalidEntries}</p> : null}
      </>}
    </div> : null}
  </section>;
}
