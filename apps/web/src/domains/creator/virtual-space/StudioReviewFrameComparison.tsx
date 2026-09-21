import { useId, useMemo, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioReviewImage } from "./StudioPinnedReviewPreview";
import { reviewPreviewIdentity } from "./studio-review-viewport";
import { matchReviewSourceFrame, reviewFrameChoices, reviewFrameCrop, type ReviewFrameMatch } from "./studio-review-frame-comparison";
import type { StudioVirtualSpaceReviewPreview as Preview } from "./studio-virtual-space-review-preview";

const control = "min-h-11 min-w-0 rounded-lg border border-line bg-card px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
interface Props { readonly left: Preview; readonly right: Preview }

/** Read-only source-ID navigation, never a comment reattachment or editor mutation. */
export function StudioReviewFrameComparison(props: Props) {
  return <FrameComparisonPanel key={JSON.stringify([reviewPreviewIdentity(props.left), reviewPreviewIdentity(props.right)])} {...props} />;
}
function FrameComparisonPanel(props: Props) {
  const bt = useBilingual("StudioReviewFrameComparison"), id = useId();
  const [open, setOpen] = useState(false);
  return <section className="rounded-xl border border-line p-3" aria-label={bt("컷 단위 비교", "Source cut comparison")}>
    <button type="button" className={control} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      {open ? bt("컷 비교 닫기", "Close cut comparison") : bt("컷 단위로 비교", "Compare source cuts")}
    </button>
    {open ? <div id={id}><FrameComparisonBody {...props} /></div> : null}
  </section>;
}
function FrameComparisonBody({ left, right }: Props) {
  const bt = useBilingual("StudioReviewFrameComparison");
  const [side, setSide] = useState<"left" | "right">("left");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState("");
  const source = side === "left" ? left : right, target = side === "left" ? right : left;
  const choices = useMemo(() => reviewFrameChoices(source, query, offset), [source, query, offset]);
  const match = useMemo(() => selected ? matchReviewSourceFrame(source, target, selected) : null, [source, target, selected]);
  const resetSelection = () => { setSelected(""); setOffset(0); };
  const problems: Record<Exclude<ReviewFrameMatch["kind"], "matched">, string> = {
    "source-unavailable": bt("선택한 원본 컷을 확인할 수 없습니다.", "The selected source cut is unavailable."),
    "source-ambiguous": bt("원본 컷 ID가 중복되어 연결하지 않습니다.", "The source cut ID is ambiguous; no match is made."),
    "target-unmapped": bt("비교 페이지에 검증된 원본 위치 정보가 없습니다.", "The comparison page has no verified source mapping."),
    "different-page": bt("원본 페이지가 다릅니다. 같은 컷 번호나 ID만으로 연결하지 않습니다.", "The source pages differ. A cut number or ID alone is not sufficient."),
    "not-found": bt("선택된 비교 페이지에서 대응 컷을 확인하지 못했습니다. 삭제 여부는 단정하지 않습니다.", "No corresponding cut is present in this selected page. This does not establish deletion."),
    "target-ambiguous": bt("비교 페이지의 컷 ID가 중복되어 연결하지 않습니다.", "The comparison cut ID is ambiguous; no match is made."),
  };
  const safeSource = match && match.kind !== "source-unavailable" && match.kind !== "source-ambiguous";
  return <div className="mt-3 min-w-0 space-y-3">
    <p className="text-xs text-fg-2">{bt("현재 두 페이지에서 같은 원본 페이지·컷 ID만 연결합니다. 모양이나 순번으로 추측하지 않으며 의견·원고는 변경하지 않습니다.", "Matches require the same source page and cut IDs within these two pages. No visual or ordinal guesses; notes and manuscripts are unchanged.")}</p>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="min-w-0 text-sm">{bt("컷을 고를 검수본", "Source snapshot for cut selection")}
        <select className={`${control} mt-1 block w-full`} value={side} onChange={(event) => {
          setSide(event.target.value as "left" | "right"); setQuery(""); resetSelection();
        }}><option value="left">{bt("A · 기준본", "A · Original")}</option><option value="right">{bt("B · 비교본", "B · Comparison")}</option></select>
      </label>
      <label className="min-w-0 text-sm">{bt("원본 컷 ID 검색", "Search source cut IDs")}
        <input className={`${control} mt-1 block w-full`} maxLength={160} value={query}
          onChange={(event) => { setQuery(event.target.value); resetSelection(); }} />
      </label>
    </div>
    <label className="block min-w-0 text-sm">{bt("비교할 원본 컷", "Source cut to compare")}
      <select className={`${control} mt-1 block w-full`} value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">{bt("컷 ID를 선택하세요", "Choose a cut ID")}</option>
        {choices.items.map((item) => <option key={item.id} value={item.id}>{bt(`${item.ordinal + 1}번째 컷 · ${item.id}`, `Cut ${item.ordinal + 1} · ${item.id}`)}</option>)}
      </select>
    </label>
    <p className="text-xs text-fg-2">{source.mapping.status !== "mapped"
      ? bt("이 검수본에는 검증된 컷 정보가 없습니다. 전체 페이지 비교를 사용하세요.", "This snapshot has no verified cut mapping. Use the full-page comparison.")
      : bt(`현재 페이지의 검색 결과 ${choices.total}개 · 최대 100개씩 표시`, `${choices.total} matching IDs in this page; up to 100 per list`)}</p>
    {offset > 0 || choices.hasNext ? <div className="flex flex-wrap gap-2">
      <button type="button" className={control} disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - 100)); setSelected(""); }}>{bt("이전 컷 목록", "Previous cut list")}</button>
      <button type="button" className={control} disabled={!choices.hasNext} onClick={() => { setOffset(offset + 100); setSelected(""); }}>{bt("다음 컷 목록", "Next cut list")}</button>
    </div> : null}
    {match ? <>
      <p role="status" className="text-sm">{match.kind === "matched"
        ? bt("같은 원본 컷 ID입니다. 각 버전의 위치·크기로 따로 표시하며 내용이 같다는 뜻은 아닙니다.", "Same source cut ID. Each version uses its own position and size; content need not be identical.") : problems[match.kind]}</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {(["left", "right"] as const).map((pane) => <div key={pane} className="min-w-0">
          <p className="mb-2 text-sm font-semibold">{pane === "left" ? bt("A · 기준본 컷", "A · Original cut") : bt("B · 비교본 컷", "B · Comparison cut")}</p>
          {(pane === side ? safeSource : match.kind === "matched")
            ? <CutCrop preview={pane === "left" ? left : right} frameId={selected} label={pane === "left" ? bt("기준본 컷 영역", "Original cut bounds") : bt("비교본 컷 영역", "Comparison cut bounds")} />
            : <p className="rounded-lg border border-line p-3 text-sm">{bt("대응 근거가 없어 컷 이미지를 표시하지 않습니다.", "No cut image is shown without correspondence evidence.")}</p>}
        </div>)}
      </div>
      <p className="text-xs text-fg-2">{bt("페이지 안의 컷 경계 상자를 보여줍니다. 비정형 컷은 주변 이미지가 포함될 수 있으며 원본 파일을 자르지 않습니다.", "Shows each cut's bounding box within the page. Non-rectangular cuts may include surrounding pixels; source files are not cropped.")}</p>
    </> : null}
  </div>;
}
function CutCrop({ preview, frameId, label }: { readonly preview: Preview; readonly frameId: string; readonly label: string }) {
  const bt = useBilingual("StudioReviewFrameComparison"), crop = reviewFrameCrop(preview, frameId);
  const [failed, setFailed] = useState(false);
  if (!crop) return <p className="text-sm">{bt("안전한 표시 영역을 확인할 수 없습니다. 전체 페이지에서 확인하세요.", "No safe display region is available. Inspect the full page.")}</p>;
  return <div>
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Read-only cut scroll regions require keyboard access. */}
    <div tabIndex={0} role="region" aria-label={label} className="max-h-[60vh] min-w-0 overflow-auto rounded-lg border border-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      data-review-cut={frameId} onErrorCapture={() => setFailed(true)} onLoadCapture={() => setFailed(false)}>
    <div data-review-cut-window className="relative w-full overflow-hidden bg-panel" style={{ aspectRatio: `${crop.width} / ${crop.height}` }}>
      <div className="absolute" style={{ width: `${crop.imageWidth}%`, height: `${crop.imageHeight}%`, left: `${crop.imageLeft}%`, top: `${crop.imageTop}%` }}>
        <StudioReviewImage key={reviewPreviewIdentity(preview)} preview={preview} label={label}
          className="block h-full w-full max-h-none" figureClassName="h-full" />
      </div>
    </div>
    </div>
    {failed ? <p role="status" className="mt-2 text-sm">{bt(`${label} 이미지를 불러오지 못했습니다. 미리보기를 다시 확인하세요.`, `Could not load ${label}. Check the preview again.`)}</p> : null}
  </div>;
}
