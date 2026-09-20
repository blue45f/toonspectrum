import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import type { useStudioWorldPublication } from "./use-studio-world-publication";

export function StudioWorldPublicationPanel({ publication, draft, draftBaseRevision, onApplied, onEdit, onRebaseDraft }: {
  readonly publication: ReturnType<typeof useStudioWorldPublication>;
  readonly draft?: StudioVirtualSpaceWorldManifest;
  readonly draftBaseRevision?: string | null;
  readonly onApplied: () => void;
  readonly onEdit?: () => void;
  readonly onRebaseDraft?: (revisionId: string | null) => boolean;
}) {
  const bt = useBilingual("StudioWorldPublicationPanel"), { snapshot, refresh, publish } = publication;
  const [baseReviewFailed, setBaseReviewFailed] = useState(false);
  const baseScope = useRef({ active: false, request: 0 });
  useLayoutEffect(() => {
    const scope = { active: true, request: 0 }; baseScope.current = scope;
    return () => { scope.active = false; };
  }, [draft, draftBaseRevision]);
  if (!publication.enabled) return null;
  const busy = ["reading", "publishing", "preparing"].includes(snapshot.phase);
  const needsBaseReview = draftBaseRevision === undefined || draftBaseRevision !== (snapshot.authority?.publication?.revisionId ?? null);
  const different = snapshot.authority?.publication?.revisionId !== snapshot.active?.publication.revisionId;
  const notice = snapshot.reason === "assets" ? bt("공간은 게시되었을 수 있지만 이미지 준비를 마치지 못했어요. 현재 공간을 유지합니다. 게시 공간을 다시 확인해 주세요.", "Images could not be prepared. The current space is preserved; check the published space again.")
    : snapshot.reason === "conflict" ? bt("다른 게시가 먼저 반영됐어요. 최신 공간을 확인한 뒤 초안을 다시 검토해 주세요.", "Another publication won. Check the current space and review your draft again.")
      : snapshot.reason === "access-denied" ? bt("현재 작품의 공간 접근 권한을 확인할 수 없어요.", "Access to this work's space could not be verified.")
        : snapshot.reason === "invalid-world" ? bt("공간 데이터나 게시 증명이 올바르지 않아 적용하지 않았어요.", "The world or publication proof is invalid; it was not applied.")
          : snapshot.retryIntent ? bt("게시 결과를 확정하지 못했어요. 같은 게시 요청으로 확인할 수 있어요. 초안을 바꿔 새 요청을 보내지 않습니다.", "Publication is uncertain. Retry the same request to confirm it; the frozen draft and request ID are retained.")
            : snapshot.phase === "preparing" ? bt("게시된 공간의 이미지를 준비하고 있어요. 준비가 끝날 때까지 현재 공간을 유지합니다.", "Preparing published images while keeping the current space.")
              : snapshot.phase === "publishing" ? bt("현재 권한과 게시 버전을 확인하고 게시하는 중…", "Checking current access and publishing…")
                : different ? bt("새 게시 공간이 있어요. 적용하면 대화·자리·이동을 마치고 입구에서 시작해요.", "A new publication is available. Applying it ends calls, seats and movement, then starts at the entrance.")
                  : snapshot.active ? bt("서버에 게시된 공간을 사용 중이에요.", "Using the server-published space.")
                    : snapshot.authority ? bt("게시된 공간이 없어 기본 공간을 사용해요. 초안은 이 브라우저에만 저장됩니다.", "No published space yet. Using the built-in space; drafts remain in this browser.")
                      : bt("공간 게시 상태를 확인해 주세요. 브라우저 초안은 공동 게시가 아니에요.", "Check publication status. A browser draft is not a shared publication.");
  const apply = async (operation: () => Promise<boolean>) => { if (await operation()) onApplied(); };
  return <section aria-label={bt("공간 게시", "World publication")} className="vs2-panel min-w-0 shrink-0 rounded-xl border border-line bg-card p-4">
    <p role="status" className="text-sm text-fg-2">{notice}</p>
    {snapshot.active ? <p className="mt-1 text-xs text-fg-3">{bt("게시", "Published")} {new Date(snapshot.active.publication.publishedAt).toLocaleString()} · #{snapshot.active.publication.sequence}</p> : null}
    {draft ? <p className="mt-2 text-xs text-fg-3">{bt("편집 화면은 개인 초안 미리보기예요. 게시·적용하면 공동 활동을 종료하고 게시 공간으로 이동해요.", "This editor previews a private draft. Publish and apply ends shared activities and opens the published space.")}</p> : null}
    {draft && needsBaseReview ? <p className="mt-2 text-sm text-fg-2">{bt("이 초안의 기준 게시본이 현재 게시본과 다르거나 기록되어 있지 않아요. 최신 게시 내용이 이 초안으로 바뀔 수 있으니 내용을 검토한 뒤 기준을 명시적으로 선택해 주세요.", "This draft has an older or unknown publication base. Review it before explicitly choosing the current base: it may replace the latest published content.")}</p> : null}
    {baseReviewFailed ? <p role="alert" className="mt-2 text-sm text-fg-2">{bt("기준 확인 또는 초안 저장을 마치지 못했어요. 현재 게시 상태를 확인한 뒤 다시 선택해 주세요.", "The base could not be confirmed or the draft saved. Check the publication and choose again.")}</p> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      {!draft && snapshot.authority?.canPublish && onEdit ? <Button variant="outline" className="min-h-11 max-w-full whitespace-normal" disabled={busy} onClick={onEdit}>{bt("공간 초안 편집", "Edit world draft")}</Button> : null}
      <Button variant="outline" className="min-h-11 max-w-full whitespace-normal" disabled={busy} onClick={() => { void apply(refresh); }}>{bt("게시 공간 확인·적용", "Check and apply published space")}</Button>
      {snapshot.retryIntent ? <Button className="min-h-11 max-w-full whitespace-normal" disabled={busy} onClick={() => { void apply(() => publish()); }}>{bt("같은 게시 요청 확인", "Retry same publication")}</Button>
        : draft && snapshot.authority?.canPublish ? needsBaseReview
          ? onRebaseDraft ? <Button variant="outline" className="min-h-11 max-w-full whitespace-normal" disabled={busy} onClick={() => { void (async () => {
            const scope = baseScope.current, generation = ++scope.request;
            const base = await publication.reviewDraftBase();
            if (scope.active && generation === scope.request) setBaseReviewFailed(!base || !onRebaseDraft(base.revisionId));
          })(); }}>{bt("현재 게시본을 기준으로 초안 저장", "Save draft with current publication base")}</Button> : null
          : <Button className="min-h-11 max-w-full whitespace-normal" disabled={busy} onClick={() => { void apply(() => publish(draft, draftBaseRevision)); }}>{bt("초안 게시·적용", "Publish and apply draft")}</Button> : null}
      {!snapshot.retryIntent && snapshot.previous && snapshot.authority?.canPublish ? <Button variant="outline" className="min-h-11 max-w-full whitespace-normal" disabled={busy}
        onClick={() => { void apply(() => publish(snapshot.previous!.manifest)); }}>{bt("이전 공간을 새 버전으로 게시", "Publish previous space as a new version")}</Button> : null}
    </div>
  </section>;
}
