import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "@/compat/auth-session-store";
import { getAuthSessionRevision } from "@/compat/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { listStudioVirtualSpaceReviewHistory, type StudioVirtualSpaceReviewChoice,
  type StudioVirtualSpaceReviewChoices } from "./studio-virtual-space-review-invitation";
import type { StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";
import { StudioReviewCompareDisplay } from "./StudioReviewCompareDisplay";
import { matchReviewSourcePage, sameReviewSourcePage } from "./studio-review-comparison-model";
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
      {selected ? <StudioPinnedReviewComparisonImages key={JSON.stringify([base, selected.subject])} base={base} title={title} choice={selected} onRevoked={onRevoked} /> : null}
    </div> : null}
  </section>;
}

export function StudioPinnedReviewComparisonImages({ base, title, choice, onRevoked }: {
  readonly base: StudioVirtualSpaceReviewSubject; readonly title: string;
  readonly choice: StudioVirtualSpaceReviewChoice; readonly onRevoked: () => void;
}) {
  const bt = useBilingual("StudioPinnedReviewComparisonImages");
  const left = useStudioPinnedReviewPreviews(base, onRevoked);
  const right = useStudioPinnedReviewPreviews(choice.subject, onRevoked);
  const [leftOrdinal, setLeftOrdinal] = useState<number | null>(null);
  const [rightOrdinal, setRightOrdinal] = useState<number | null>(null);
  const [linked, setLinked] = useState(false);
  const [matchNotice, setMatchNotice] = useState("");
  const leftPage = left.result?.ok ? left.result.previews.find((page) => page.ordinal === leftOrdinal) ?? left.result.previews[0] : null;
  const rightPage = right.result?.ok ? right.result.previews.find((page) => page.ordinal === rightOrdinal) ?? right.result.previews[0] : null;
  const selectPage = (side: "left" | "right", ordinal: number | null, shouldLink = linked) => {
    const source = side === "left" ? left : right, target = side === "left" ? right : left;
    (side === "left" ? setLeftOrdinal : setRightOrdinal)(ordinal);
    setMatchNotice("");
    if (!shouldLink || ordinal === null || !source.result?.ok || !target.result?.ok) return;
    const page = source.result.previews.find((item) => item.ordinal === ordinal);
    if (!page) return;
    const match = matchReviewSourcePage(page, target.result.previews);
    if (match.kind === "matched") (side === "left" ? setRightOrdinal : setLeftOrdinal)(match.page.ordinal);
    else setMatchNotice(bt("불러온 목록에서 같은 원본 페이지를 확인하지 못했습니다. 다른 페이지로 바꾸지 않았어요.", "No unique matching source page is loaded. The other selection has not changed."));
  };
  const sides = [{ state: left, page: leftPage, title, subject: base, setOrdinal: (ordinal: number | null) => selectPage("left", ordinal),
    label: bt("기준 검수본", "Original snapshot") },
  { state: right, page: rightPage, title: choice.title, subject: choice.subject, setOrdinal: (ordinal: number | null) => selectPage("right", ordinal),
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
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input type="checkbox" className="size-5 accent-accent" checked={linked}
        onChange={(event) => { setLinked(event.target.checked); if (leftPage) selectPage("left", leftPage.ordinal, event.target.checked); }} />
      {bt("같은 원본 페이지 연결", "Link matching source pages")}
    </label>
    {matchNotice ? <p role="status" className="text-sm text-fg-2">{matchNotice}</p> : null}
    {linked ? <p className="text-xs text-fg-2">{leftPage && rightPage && sameReviewSourcePage(leftPage, rightPage)
      ? bt("같은 페이지의 상대 스크롤 위치를 연결합니다. 컷 위치가 바뀌면 각각 확인하세요.", "Relative scroll positions are linked within the same page. Verify moved cuts independently.")
      : bt("페이지가 서로 달라 스크롤은 독립적으로 움직입니다. 다음 페이지 목록도 확인할 수 있어요.", "Different pages scroll independently. Check additional page lists when needed.")}</p> : null}
    {leftPage && rightPage ? <StudioReviewCompareDisplay left={leftPage} right={rightPage} linked={linked} /> : null}
  </div>;
}
