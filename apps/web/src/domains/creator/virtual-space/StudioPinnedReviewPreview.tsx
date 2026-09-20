import { useEffect, useRef, useState } from "react";
import { validateStudioReviewSpatialAnchor } from "@toonspectrum/studio-project-model";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceReviewPreview } from "./studio-virtual-space-review-preview";
import type { StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";
import { useStudioPinnedReviewPreviews } from "./use-studio-pinned-review-previews";
import { StudioReviewSpatialAnnotation, type StudioReviewAnnotationControl, type StudioReviewAnnotationNote } from "./StudioReviewSpatialAnnotation";

export function StudioReviewImage({ preview, label, className = "max-h-[70vh] w-full rounded-lg object-contain", figureClassName = "mt-3" }: {
  readonly preview: StudioVirtualSpaceReviewPreview; readonly label: string; readonly className?: string;
  readonly figureClassName?: string;
}) {
  const bt = useBilingual("StudioPinnedReviewPreviewImage");
  const [source, setSource] = useState(preview.url);
  const [failed, setFailed] = useState(false);
  const loaded = useRef(false);
  // Keep already decoded immutable pixels while fresh ACL reads renew their visibility lease.
  // Only not-yet-loaded images need the renewed URL, avoiding repeated image downloads.
  useEffect(() => { if (!loaded.current) { setSource(preview.url); setFailed(false); } }, [preview.url]);
  return <figure className={figureClassName}>
    <img src={source} alt={label} loading="lazy" referrerPolicy="no-referrer" className={className}
      onLoad={() => { loaded.current = true; setFailed(false); }} onError={() => setFailed(true)} />
    {failed ? <figcaption className="text-xs text-fg-3">{bt("이미지를 불러오지 못했어요. 미리보기를 다시 확인해 주세요.", "The image could not be loaded. Check the preview again.")}</figcaption> : null}
  </figure>;
}

export function StudioPinnedReviewPreview({ subject, onRevoked, annotation, notes }: {
  readonly subject: StudioVirtualSpaceReviewSubject;
  readonly onRevoked: () => void;
  readonly annotation?: StudioReviewAnnotationControl;
  readonly notes?: readonly StudioReviewAnnotationNote[];
}) {
  const bt = useBilingual("StudioPinnedReviewPreview");
  const { result, cursor, setCursor, refresh } = useStudioPinnedReviewPreviews(subject, onRevoked);
  useEffect(() => {
    const selected = annotation?.selected;
    if (!selected) return;
    const page = result?.ok ? result.previews.find((preview) => preview.sha256 === selected.sha256
      && preview.ordinal === selected.anchor.source.pageOrdinal) : null;
    if (!page || page.expiresAt <= Date.now() || !validateStudioReviewSpatialAnchor(page.mapping, selected.anchor)) {
      annotation.onSelect(null);
    } else if (selected.expiresAt !== page.expiresAt && page.mapping.status === "mapped") {
      annotation.onSelect({ ...selected, mapping: page.mapping, expiresAt: page.expiresAt });
    }
  }, [annotation, result]);
  const changePage = (next: string | null) => { annotation?.onSelect(null); setCursor(next); };
  return <div className="mt-4" aria-label={bt("검수본 미리보기", "Snapshot preview")}>
    {result?.ok ? <>
      {result.previews.map((preview) => (annotation || notes?.length) && preview.mapping.status === "mapped"
        ? <StudioReviewSpatialAnnotation key={`${preview.ordinal}:${preview.sha256}`} mapping={preview.mapping} sha256={preview.sha256} expiresAt={preview.expiresAt}
          control={annotation ?? { selected: null, onSelect: () => undefined, disabled: true }} editable={!!annotation} notes={notes}>
          <StudioReviewImage preview={preview} label={bt(`검수 미리보기 ${preview.ordinal + 1}`, `Review preview ${preview.ordinal + 1}`)} className="block h-auto w-full rounded-lg" figureClassName="" />
        </StudioReviewSpatialAnnotation>
        : <div key={`${preview.ordinal}:${preview.sha256}`}><StudioReviewImage preview={preview} label={bt(`검수 미리보기 ${preview.ordinal + 1}`, `Review preview ${preview.ordinal + 1}`)} />
          {annotation ? <p className="mt-2 text-sm text-fg-2">{bt("이 검수본은 페이지·컷 위치를 확인할 수 없어 전체 검수 의견으로 남깁니다.", "This snapshot has no verified page or cut mapping. Leave a note on the whole review.")}</p> : null}
        </div>)}
      {cursor ? <button type="button" className="min-h-11 px-3" disabled={annotation?.disabled} onClick={() => changePage(null)}>{bt("처음부터 보기", "Back to first previews")}</button> : null}
      {result.nextCursor ? <button type="button" className="min-h-11 px-3" disabled={annotation?.disabled} onClick={() => changePage(result.nextCursor)}>{bt("다음 미리보기", "Next previews")}</button> : null}
    </> : <p className="text-sm text-fg-3" role="status">{result
      ? bt("이 검수 버전에 연결된 미리보기가 아직 준비되지 않았어요. 검토 기록은 아래에서 확인할 수 있습니다.", "A preview for this exact review version is not ready. Its review notes are available below.")
      : bt("검수 미리보기를 확인 중…", "Checking snapshot previews…")}</p>}
    {result && !result.ok ? <button type="button" className="min-h-11 px-3" onClick={() => { annotation?.onSelect(null); refresh(); }}>{bt("미리보기 다시 확인", "Check preview again")}</button> : null}
  </div>;
}
