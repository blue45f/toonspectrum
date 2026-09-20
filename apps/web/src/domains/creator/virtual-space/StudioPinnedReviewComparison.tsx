import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "@/compat/auth-session-store";
import { getAuthSessionRevision } from "@/compat/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { listStudioVirtualSpaceReviewHistory, type StudioVirtualSpaceReviewChoice,
  type StudioVirtualSpaceReviewChoices } from "./studio-virtual-space-review-invitation";
import type { StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";
import type { StudioVirtualSpaceReviewPreview } from "./studio-virtual-space-review-preview";
import { StudioReviewImage } from "./StudioPinnedReviewPreview";
import { useStudioPinnedReviewPreviews } from "./use-studio-pinned-review-previews";

const control = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm";

/** Comparison never moves the editor selection or changes the revision targeted by review notes. */
export function StudioPinnedReviewComparison({ subject, title, onRevoked }: {
  readonly subject: StudioVirtualSpaceReviewSubject; readonly title: string; readonly onRevoked: () => void;
}) {
  const actor = useSession().data?.user.id ?? null;
  return <ComparisonForActor key={JSON.stringify([actor, subject])} actor={actor} subject={subject} title={title} onRevoked={onRevoked} />;
}

function ComparisonForActor({ actor, subject, title, onRevoked }: {
  readonly actor: string | null; readonly subject: StudioVirtualSpaceReviewSubject;
  readonly title: string; readonly onRevoked: () => void;
}) {
  const bt = useBilingual("StudioPinnedReviewComparison");
  const id = useId();
  const [base] = useState(subject);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<StudioVirtualSpaceReviewChoices | null>(null);
  const [selected, setSelected] = useState<StudioVirtualSpaceReviewChoice | null>(null);
  const generation = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLElement>(null);
  useLayoutEffect(() => () => { ++generation.current; }, []);
  const close = useCallback(() => {
    ++generation.current; setOpen(false); setBusy(false); setSelected(null); setChoices(null); trigger.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !(event.target instanceof Node) || !region.current?.contains(event.target)) return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [open, close]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === "hidden") {
      ++generation.current; setSelected(null); setChoices(null); setBusy(false);
    } };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  const discover = async () => {
    if (!actor || busy) return;
    const own = ++generation.current, revision = getAuthSessionRevision();
    setOpen(true); setBusy(true); setChoices(null); setSelected(null);
    const next = await listStudioVirtualSpaceReviewHistory(base);
    if (own !== generation.current) return;
    setBusy(false);
    if (revision !== getAuthSessionRevision()) return;
    setChoices(next);
    if (!next.ok && next.reason === "access-denied") onRevoked();
  };
  return <section ref={region} className="mt-5 rounded-xl border border-line p-4" aria-label={bt("검수 버전 비교", "Compare review versions")}>
    <button ref={trigger} type="button" className={control} aria-expanded={open} aria-controls={id}
      disabled={!actor} onClick={() => { if (open) close(); else void discover(); }}>
      {open ? bt("비교 닫기", "Close comparison") : bt("이전 검수본과 비교", "Compare another snapshot")}
    </button>
    {open ? <div id={id} className="mt-3 space-y-3">
      <p className="text-sm text-fg-2">{bt("두 검수본을 골라 확인하세요. 아래 의견과 승인 결정은 처음 연 검수본에 남습니다.", "Inspect two snapshots. Notes and approval below still belong to the original review.")}</p>
      {busy ? <p role="status">{bt("접근 가능한 검수 기록을 확인 중…", "Checking available review history…")}</p> : null}
      {choices?.ok ? <>
        <label className="block text-sm">{bt("비교할 검수본", "Snapshot to compare")}
          <select className={`${control} mt-2 block w-full`} value={selected?.subject.reviewId ?? ""}
            onChange={(event) => setSelected(choices.choices.find((choice) => choice.subject.reviewId === event.target.value) ?? null)}>
            <option value="">{bt("검수본을 선택하세요", "Choose a snapshot")}</option>
            {choices.choices.map((choice) => <option key={choice.subject.reviewId} value={choice.subject.reviewId}>
              {choice.title} · {choice.subject.revisionId}
            </option>)}
          </select>
        </label>
        {!choices.choices.length ? <p className="text-sm">{bt("이 작업에는 비교할 다른 검수본이 없어요.", "This artifact has no other review snapshot to compare.")}</p> : null}
        {choices.truncated ? <p className="text-xs text-fg-3">{bt("최근 검수 기록 64개까지 표시합니다.", "Showing up to 64 recent review snapshots.")}</p> : null}
      </> : !busy ? <p role="status">{bt("검수 기록을 다시 확인해 주세요.", "Check the review history again.")}</p> : null}
      {!busy ? <button type="button" className={control} onClick={() => void discover()}>{bt("비교 목록 새로 확인", "Refresh comparison choices")}</button> : null}
      {selected ? <ComparisonImages key={JSON.stringify([base, selected.subject])} base={base} title={title} choice={selected} onRevoked={onRevoked} /> : null}
    </div> : null}
  </section>;
}

function matchingPage(left: StudioVirtualSpaceReviewPreview, right: StudioVirtualSpaceReviewPreview): boolean {
  if (left.mapping.status !== "mapped" || right.mapping.status !== "mapped") return false;
  const a = left.mapping.page, b = right.mapping.page;
  return a.id === b.id && a.width === b.width && a.height === b.height
    && a.renderWidth === b.renderWidth && a.renderHeight === b.renderHeight;
}

function ComparisonImages({ base, title, choice, onRevoked }: {
  readonly base: StudioVirtualSpaceReviewSubject; readonly title: string;
  readonly choice: StudioVirtualSpaceReviewChoice; readonly onRevoked: () => void;
}) {
  const bt = useBilingual("StudioPinnedReviewComparisonImages");
  const left = useStudioPinnedReviewPreviews(base, onRevoked);
  const right = useStudioPinnedReviewPreviews(choice.subject, onRevoked);
  const [leftOrdinal, setLeftOrdinal] = useState<number | null>(null);
  const [rightOrdinal, setRightOrdinal] = useState<number | null>(null);
  const [mode, setMode] = useState<"side-by-side" | "overlay">("side-by-side");
  const [opacity, setOpacity] = useState(50);
  const leftPage = left.result?.ok ? left.result.previews.find((page) => page.ordinal === leftOrdinal) ?? left.result.previews[0] : null;
  const rightPage = right.result?.ok ? right.result.previews.find((page) => page.ordinal === rightOrdinal) ?? right.result.previews[0] : null;
  const overlayAllowed = !!leftPage && !!rightPage && matchingPage(leftPage, rightPage);
  const overlay = mode === "overlay" && overlayAllowed;
  const sides = [{ state: left, page: leftPage, title, subject: base, setOrdinal: setLeftOrdinal,
    label: bt("기준 검수본", "Original snapshot") },
  { state: right, page: rightPage, title: choice.title, subject: choice.subject, setOrdinal: setRightOrdinal,
    label: bt("비교 검수본", "Comparison snapshot") }];
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      {sides.map((side) => <div key={side.label} className="min-w-0 rounded-lg bg-panel p-3">
        <h3 className="font-semibold">{side.label} · {side.title}</h3>
        <p className="break-all text-xs text-fg-3">{side.subject.revisionId}</p>
        {side.state.result?.ok ? <>
          <label className="mt-2 block text-sm">{bt(`${side.label} 페이지`, `${side.label} page`)}
            <select className={`${control} mt-1 w-full`} value={side.page?.ordinal ?? ""}
              onChange={(event) => side.setOrdinal(Number(event.target.value))}>
              {side.state.result.previews.map((page) => <option key={page.ordinal} value={page.ordinal}>
                {bt(`${page.ordinal + 1}페이지`, `Page ${page.ordinal + 1}`)}
              </option>)}
            </select>
          </label>
          {side.state.cursor ? <button type="button" className={control} onClick={() => { side.setOrdinal(null); side.state.setCursor(null); }}>{bt("처음 페이지 목록", "First page list")}</button> : null}
          {side.state.result.nextCursor ? <button type="button" className={control} onClick={() => { side.setOrdinal(null); side.state.setCursor(side.state.result?.ok ? side.state.result.nextCursor : null); }}>{bt("다음 페이지 목록", "Next page list")}</button> : null}
        </> : <><p role="status" className="mt-2 text-sm">{bt("이 버전의 미리보기를 확인 중이거나 사용할 수 없습니다.", "This version's preview is loading or unavailable.")}</p>
          {side.state.result ? <button type="button" className={control} onClick={side.state.refresh}>{bt("미리보기 다시 확인", "Check preview again")}</button> : null}</>}
      </div>)}
    </div>
    <div className="flex flex-wrap gap-2" aria-label={bt("비교 표시 방식", "Comparison layout")}>
      <button type="button" className={control} aria-pressed={!overlay} onClick={() => setMode("side-by-side")}>{bt("나란히 보기", "Side by side")}</button>
      <button type="button" className={control} aria-pressed={overlay} disabled={!overlayAllowed} onClick={() => setMode("overlay")}>{bt("겹쳐 보기", "Overlay")}</button>
    </div>
    {!overlayAllowed ? <p className="text-xs text-fg-3">{bt("같은 원본 페이지와 이미지 크기가 확인된 두 검수본에서 겹쳐 볼 수 있어요. 페이지는 각각 선택할 수 있습니다.", "Overlay requires the same verified source page and image dimensions. You can select each page independently.")}</p> : null}
    {leftPage && rightPage ? overlay ? <>
      <label className="block text-sm">{bt("비교본 불투명도", "Comparison opacity")} · {opacity}%
        <input type="range" className="mt-2 block min-h-11 w-full" min={0} max={100} step={5} value={opacity}
          onChange={(event) => setOpacity(Number(event.target.value))} />
      </label>
      <div className="relative grid rounded-lg border border-line bg-panel">
        <div className="col-start-1 row-start-1"><StudioReviewImage key={`left:${leftPage.sha256}`} preview={leftPage} label={bt("기준 검수본 페이지", "Original snapshot page")} /></div>
        <div className="col-start-1 row-start-1" style={{ opacity: opacity / 100 }}><StudioReviewImage key={`right:${rightPage.sha256}`} preview={rightPage} label={bt("비교 검수본 페이지", "Comparison snapshot page")} /></div>
      </div>
    </> : <div className="grid gap-3 sm:grid-cols-2">
      <StudioReviewImage key={`left:${leftPage.sha256}`} preview={leftPage} label={bt("기준 검수본 페이지", "Original snapshot page")} />
      <StudioReviewImage key={`right:${rightPage.sha256}`} preview={rightPage} label={bt("비교 검수본 페이지", "Comparison snapshot page")} />
    </div> : null}
  </div>;
}
