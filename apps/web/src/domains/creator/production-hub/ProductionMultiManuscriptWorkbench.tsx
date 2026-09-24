import {
  Columns3,
  GalleryHorizontalEnd,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  MessageSquare,
  PanelTopOpen,
  RefreshCcw,
  Unlink2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { StudioPinnedReviewPanel } from "../virtual-space/StudioPinnedReviewPanel";
import { StudioReviewImage } from "../virtual-space/StudioPinnedReviewPreview";
import { matchReviewSourcePage, sameReviewSourcePage } from "../virtual-space/studio-review-comparison-model";
import type { StudioVirtualSpaceReviewPreview } from "../virtual-space/studio-virtual-space-review-preview";
import { useStudioPinnedReviewPreviews } from "../virtual-space/use-studio-pinned-review-previews";
import {
  parseProductionWorkbenchState,
  writeProductionWorkbenchState,
  type ProductionReviewCandidate,
  type ProductionWorkbenchBackground,
  type ProductionWorkbenchLayout,
  type ProductionWorkbenchPaneCount,
  type ProductionWorkbenchState,
} from "./production-manuscript-competitive-model";

const BACKGROUND_COLORS: Readonly<Record<ProductionWorkbenchBackground, string>> = Object.freeze({
  neutral: "#777777",
  light: "#f7f7f7",
  dark: "#171717",
});

interface PaneSnapshot {
  readonly previews: readonly StudioVirtualSpaceReviewPreview[];
  readonly current: StudioVirtualSpaceReviewPreview | null;
}

/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- Read-only manuscript viewport needs keyboard scrolling. */
interface PaneProps {
  readonly candidate: ProductionReviewCandidate;
  readonly index: number;
  readonly layout: ProductionWorkbenchLayout;
  readonly zoom: ProductionWorkbenchState["zoom"];
  readonly background: ProductionWorkbenchBackground;
  readonly selectedOrdinal: number | null;
  readonly scrollRatio: number;
  readonly onSelectPage: (candidate: ProductionReviewCandidate, page: StudioVirtualSpaceReviewPreview) => void;
  readonly onLoaded: (candidate: ProductionReviewCandidate, snapshot: PaneSnapshot) => void;
  readonly onScroll: (candidate: ProductionReviewCandidate, page: StudioVirtualSpaceReviewPreview | null, event: UIEvent<HTMLDivElement>) => void;
  readonly registerViewport: (reviewId: string, node: HTMLDivElement | null) => void;
  readonly onRevoked: () => void;
}

function WorkbenchPane({
  candidate,
  index,
  layout,
  zoom,
  background,
  selectedOrdinal,
  scrollRatio,
  onSelectPage,
  onLoaded,
  onScroll,
  registerViewport,
  onRevoked,
}: PaneProps) {
  const preview = useStudioPinnedReviewPreviews(candidate.subject, onRevoked);
  const current = preview.result?.ok
    ? preview.result.previews.find((page) => page.ordinal === selectedOrdinal) ?? preview.result.previews[0] ?? null
    : null;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const restoreScroll = useCallback(() => {
    if (layout !== "columns") return;
    const node = viewportRef.current;
    if (!node) return;
    requestAnimationFrame(() => {
      const max = Math.max(0, node.scrollHeight - node.clientHeight);
      node.scrollTop = max * Math.min(10_000, Math.max(0, scrollRatio)) / 10_000;
    });
  }, [layout, scrollRatio]);
  const setViewport = useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node;
    registerViewport(candidate.id, node);
    if (node) restoreScroll();
  }, [candidate.id, registerViewport, restoreScroll]);

  useEffect(() => {
    onLoaded(candidate, {
      previews: preview.result?.ok ? preview.result.previews : [],
      current,
    });
  }, [candidate, current, onLoaded, preview.result]);

  useEffect(() => {
    if (current && selectedOrdinal === null) onSelectPage(candidate, current);
  }, [candidate, current, onSelectPage, selectedOrdinal]);

  useEffect(() => {
    restoreScroll();
  }, [current?.sha256, restoreScroll, zoom]);

  return (
    <section
      className="min-w-0 overflow-hidden rounded-2xl border border-line bg-card"
      aria-label={`${index + 1}번 비교 원고 · ${candidate.artifactTitle}`}
      data-workbench-pane={candidate.id}
    >
      <header className="border-b border-line p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-fg">{candidate.episodeLabel} · {candidate.processLabel}</p>
            <p className="mt-0.5 truncate text-[0.6875rem] text-fg-3">{candidate.review.title} · {candidate.subject.revisionId}</p>
          </div>
          <span className={cn(
            "inline-flex min-h-7 items-center rounded-full border px-2 text-[0.625rem] font-bold",
            candidate.review.status === "approved"
              ? "border-good/35 bg-good/10 text-good"
              : candidate.review.status === "changes-requested"
                ? "border-bad/35 bg-bad/10 text-bad"
                : "border-warn/35 bg-warn/10 text-warn",
          )}>
            {candidate.review.status === "approved" ? "승인" : candidate.review.status === "changes-requested" ? "수정 요청" : "검수 중"}
          </span>
        </div>
      </header>

      {!preview.result ? (
        <div className="grid min-h-72 place-items-center p-6 text-center" role="status">
          <div><LoaderCircle className="mx-auto size-6 animate-spin text-accent" aria-hidden="true" /><p className="mt-2 text-xs text-fg-2">고정 원고 페이지를 확인하는 중…</p></div>
        </div>
      ) : !preview.result.ok ? (
        <div className="grid min-h-72 place-items-center p-6 text-center" role="alert">
          <div><LockKeyhole className="mx-auto size-6 text-warn" aria-hidden="true" /><p className="mt-2 text-xs font-bold text-fg">이 고정 검수본을 표시할 수 없습니다</p><button type="button" onClick={preview.refresh} className={buttonClass({ variant: "outline", size: "sm", className: "mt-3" })}><RefreshCcw className="size-4" aria-hidden="true" /> 다시 확인</button></div>
        </div>
      ) : layout === "overview" ? (
        <div className="overflow-x-auto overscroll-x-contain p-3" role="region" aria-label={`${candidate.artifactTitle} 가로 페이지 개요`}>
          <div className="flex min-w-max items-start gap-3">
            {preview.result.previews.map((page) => (
              <button
                key={page.sha256}
                type="button"
                onClick={() => onSelectPage(candidate, page)}
                className={cn(
                  "w-48 shrink-0 rounded-xl border p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  current?.ordinal === page.ordinal ? "border-accent bg-accent-soft/25" : "border-line bg-panel",
                )}
              >
                <StudioReviewImage preview={page} label={`${page.ordinal + 1}페이지`} className="block h-auto max-h-64 w-full rounded-lg object-contain" figureClassName="" />
                <span className="mt-2 block text-xs font-bold text-fg">{page.ordinal + 1}페이지</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 grid-cols-[4.5rem_minmax(0,1fr)]">
          <nav className="max-h-[66vh] overflow-y-auto border-r border-line bg-panel/60 p-2" aria-label={`${candidate.artifactTitle} 페이지 레일`}>
            <div className="space-y-2">
              {preview.result.previews.map((page) => (
                <button
                  key={page.sha256}
                  type="button"
                  onClick={() => onSelectPage(candidate, page)}
                  aria-current={current?.ordinal === page.ordinal ? "page" : undefined}
                  className={cn(
                    "min-h-11 w-full rounded-lg border px-1 py-1 text-[0.625rem] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                    current?.ordinal === page.ordinal ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2",
                  )}
                >
                  {page.ordinal + 1}P
                </button>
              ))}
              {preview.cursor ? <button type="button" onClick={() => preview.setCursor(null)} className="min-h-11 w-full rounded-lg border border-line bg-card text-[0.625rem] text-fg-2">처음</button> : null}
              {preview.result.nextCursor ? <button type="button" onClick={() => preview.setCursor(preview.result?.ok ? preview.result.nextCursor : null)} className="min-h-11 w-full rounded-lg border border-line bg-card text-[0.625rem] text-fg-2">다음</button> : null}
            </div>
          </nav>
          <div
            ref={setViewport}
            onScroll={(event) => onScroll(candidate, current, event)}
            onLoadCapture={restoreScroll}
            className="max-h-[66vh] min-w-0 overflow-auto overscroll-contain p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            style={{ backgroundColor: BACKGROUND_COLORS[background] }}
            tabIndex={0}
            role="region"
            aria-label={`${candidate.artifactTitle} ${current ? `${current.ordinal + 1}페이지` : "페이지"}`}
          >
            {current ? (
              <div style={{ width: `${zoom}%` }} className="mx-auto min-w-[12rem]">
                <StudioReviewImage preview={current} label={`${candidate.artifactTitle} ${current.ordinal + 1}페이지`} className="block h-auto w-full rounded-lg" figureClassName="" />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

/* eslint-enable jsx-a11y/no-noninteractive-tabindex */

export function ProductionMultiManuscriptWorkbench({
  candidates,
  preferredReviewId,
}: {
  readonly candidates: readonly ProductionReviewCandidate[];
  readonly preferredReviewId: string | null;
}) {
  const [params, setParams] = useSearchParams();
  const parsed = useMemo(() => parseProductionWorkbenchState(params, candidates, preferredReviewId), [candidates, params, preferredReviewId]);
  const state = parsed.state;
  const [loaded, setLoaded] = useState<Readonly<Record<string, PaneSnapshot>>>({});
  const viewportRefs = useRef(new Map<string, HTMLDivElement>());
  const syncing = useRef(false);
  const stateRef = useRef(state);
  const paramsRef = useRef(params);
  const scrollTimers = useRef(new Map<string, number>());
  const candidateById = useMemo(() => new Map(candidates.map((candidate) => [candidate.id, candidate])), [candidates]);
  const activeCandidate = state.activeReviewId ? candidateById.get(state.activeReviewId) ?? null : null;

  useEffect(() => {
    stateRef.current = state;
    paramsRef.current = params;
  }, [params, state]);
  useEffect(() => () => {
    for (const timer of scrollTimers.current.values()) window.clearTimeout(timer);
    scrollTimers.current.clear();
  }, []);

  const update = useCallback((change: (current: ProductionWorkbenchState) => ProductionWorkbenchState) => {
    const next = change(stateRef.current);
    const nextParams = writeProductionWorkbenchState(paramsRef.current, next);
    stateRef.current = next;
    paramsRef.current = nextParams;
    setParams(nextParams, { replace: true });
  }, [setParams]);

  const persistScrollRatio = useCallback((reviewId: string, ratio: number) => {
    const normalized = Math.min(10_000, Math.max(0, Math.round(ratio)));
    const existing = scrollTimers.current.get(reviewId);
    if (existing !== undefined) window.clearTimeout(existing);
    scrollTimers.current.set(reviewId, window.setTimeout(() => {
      scrollTimers.current.delete(reviewId);
      update((current) => current.reviewIds.includes(reviewId)
        ? { ...current, scrollRatios: { ...current.scrollRatios, [reviewId]: normalized } }
        : current);
    }, 120));
  }, [update]);

  const fillReviewIds = useCallback((requested: readonly string[], paneCount: ProductionWorkbenchPaneCount): readonly string[] => {
    const ids = [...new Set(requested.filter((id) => candidateById.has(id)))];
    for (const candidate of candidates) {
      if (ids.length >= paneCount) break;
      if (!ids.includes(candidate.id)) ids.push(candidate.id);
    }
    return ids.slice(0, paneCount);
  }, [candidateById, candidates]);

  const setPaneCount = (paneCount: ProductionWorkbenchPaneCount) => update((current) => {
    const reviewIds = fillReviewIds(current.reviewIds, paneCount);
    return { ...current, paneCount, reviewIds, activeReviewId: reviewIds.includes(current.activeReviewId ?? "") ? current.activeReviewId : reviewIds[0] ?? null };
  });

  const chooseCandidate = (index: number, reviewId: string) => update((current) => {
    const reviewIds = [...current.reviewIds];
    reviewIds[index] = reviewId;
    const normalized = fillReviewIds(reviewIds, current.paneCount);
    return { ...current, reviewIds: normalized, activeReviewId: reviewId };
  });

  const selectPage = useCallback((candidate: ProductionReviewCandidate, page: StudioVirtualSpaceReviewPreview) => {
    update((current) => {
      const ordinals = { ...current.pageOrdinals, [candidate.id]: page.ordinal };
      if (current.linked) {
        for (const reviewId of current.reviewIds) {
          if (reviewId === candidate.id) continue;
          const other = loaded[reviewId];
          if (!other) continue;
          const match = matchReviewSourcePage(page, other.previews);
          if (match.kind === "matched") ordinals[reviewId] = match.page.ordinal;
        }
      }
      return { ...current, activeReviewId: candidate.id, pageOrdinals: ordinals };
    });
  }, [loaded, update]);

  const registerViewport = useCallback((reviewId: string, node: HTMLDivElement | null) => {
    if (node) viewportRefs.current.set(reviewId, node);
    else viewportRefs.current.delete(reviewId);
  }, []);

  const onScroll = useCallback((candidate: ProductionReviewCandidate, page: StudioVirtualSpaceReviewPreview | null, event: UIEvent<HTMLDivElement>) => {
    if (!state.linked || !page || syncing.current) return;
    const source = event.currentTarget;
    const max = source.scrollHeight - source.clientHeight;
    const ratio = max > 0 ? source.scrollTop / max : 0;
    const ratioBasisPoints = Math.round(ratio * 10_000);
    persistScrollRatio(candidate.id, ratioBasisPoints);
    syncing.current = true;
    for (const reviewId of state.reviewIds) {
      if (reviewId === candidate.id) continue;
      const targetPage = loaded[reviewId]?.current ?? null;
      const target = viewportRefs.current.get(reviewId);
      if (!target || !targetPage || !sameReviewSourcePage(page, targetPage)) continue;
      const targetMax = target.scrollHeight - target.clientHeight;
      target.scrollTop = ratio * Math.max(0, targetMax);
      persistScrollRatio(reviewId, ratioBasisPoints);
    }
    requestAnimationFrame(() => { syncing.current = false; });
  }, [loaded, persistScrollRatio, state.linked, state.reviewIds]);

  const handleLoaded = useCallback((candidate: ProductionReviewCandidate, snapshot: PaneSnapshot) => {
    setLoaded((current) => {
      const prior = current[candidate.id];
      if (prior && prior.current?.sha256 === snapshot.current?.sha256 && prior.previews === snapshot.previews) return current;
      return { ...current, [candidate.id]: snapshot };
    });
  }, []);

  if (candidates.length === 0) {
    return <section className="rounded-3xl border border-dashed border-line bg-card p-8 text-center"><PanelTopOpen className="mx-auto size-8 text-fg-3" aria-hidden="true" /><h2 className="mt-3 text-lg font-black text-fg">비교할 고정 검수본이 없습니다</h2><p className="mt-1 text-sm text-fg-2">편집기에서 검수 제출본을 만든 뒤 여러 공정·회차 원고를 동시에 비교할 수 있습니다.</p></section>;
  }

  if (parsed.invalidReviewIds.length > 0) {
    return <section className="rounded-3xl border border-warn/35 bg-warn/10 p-6" role="alert"><LockKeyhole className="size-6 text-warn" aria-hidden="true" /><h2 className="mt-3 text-lg font-black text-fg">요청한 비교 검수본을 찾을 수 없습니다</h2><p className="mt-1 text-sm text-fg-2">다른 검수본으로 자동 대체하지 않았습니다. 잘못된 좌표: {parsed.invalidReviewIds.join(", ")}</p><button type="button" onClick={() => setParams(writeProductionWorkbenchState(params, parseProductionWorkbenchState(new URLSearchParams(), candidates, preferredReviewId).state), { replace: true })} className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}>안전한 기본 비교로 초기화</button></section>;
  }

  const visibleCandidates = state.reviewIds.map((id) => candidateById.get(id)).filter((candidate): candidate is ProductionReviewCandidate => Boolean(candidate));
  const gridClass = state.layout === "overview"
    ? "grid-cols-1"
    : state.paneCount === 2 ? "xl:grid-cols-2" : state.paneCount === 3 ? "2xl:grid-cols-3" : "2xl:grid-cols-4";

  return <div className="space-y-4" data-production-multi-workbench="">
    <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="multi-workbench-title">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div><p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">MULTI MANUSCRIPT REVIEW</p><h2 id="multi-workbench-title" className="mt-2 text-xl font-black text-fg">여러 공정·회차 원고를 한 작업대에서 비교합니다</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">고정 검수본만 사용합니다. 페이지 연결은 같은 원본 페이지가 확인될 때만 적용하고, 의견과 승인 결정은 활성 검수본에 남습니다.</p></div>
        <div className="flex flex-wrap gap-2" aria-label="비교 작업대 설정">
          {([2, 3, 4] as const).map((count) => <button key={count} type="button" aria-pressed={state.paneCount === count} onClick={() => setPaneCount(count)} className={buttonClass({ variant: state.paneCount === count ? "solid" : "outline", size: "sm" })}>{count}분할</button>)}
          <button type="button" aria-pressed={state.layout === "columns"} onClick={() => update((current) => ({ ...current, layout: "columns" }))} className={buttonClass({ variant: state.layout === "columns" ? "solid" : "outline", size: "sm" })}><Columns3 className="size-4" aria-hidden="true" /> 세로 비교</button>
          <button type="button" aria-pressed={state.layout === "overview"} onClick={() => update((current) => ({ ...current, layout: "overview" }))} className={buttonClass({ variant: state.layout === "overview" ? "solid" : "outline", size: "sm" })}><GalleryHorizontalEnd className="size-4" aria-hidden="true" /> 가로 개요</button>
          <button type="button" aria-pressed={state.linked} onClick={() => update((current) => ({ ...current, linked: !current.linked }))} className={buttonClass({ variant: state.linked ? "solid" : "outline", size: "sm" })}>{state.linked ? <Link2 className="size-4" aria-hidden="true" /> : <Unlink2 className="size-4" aria-hidden="true" />}{state.linked ? "페이지·스크롤 연결" : "독립 이동"}</button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: state.paneCount }, (_, index) => (
          <label key={index} className="text-xs font-bold text-fg-2">{index + 1}번 원고
            <select value={state.reviewIds[index] ?? ""} onChange={(event) => chooseCandidate(index, event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
              <option value="" disabled>검수본 선택</option>
              {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.episodeLabel} · {candidate.processLabel} · {candidate.review.title}</option>)}
            </select>
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel p-3">
        <label className="flex items-center gap-2 text-xs font-bold text-fg-2"><Maximize2 className="size-4" aria-hidden="true" /> 확대
          <select value={state.zoom} onChange={(event) => update((current) => ({ ...current, zoom: Number(event.target.value) as ProductionWorkbenchState["zoom"] }))} className="min-h-11 rounded-lg border border-line bg-card px-2 text-sm text-fg">{[75, 100, 125, 150, 200].map((zoom) => <option key={zoom} value={zoom}>{zoom}%</option>)}</select>
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-fg-2">원고 배경
          <select value={state.background} onChange={(event) => update((current) => ({ ...current, background: event.target.value as ProductionWorkbenchBackground }))} className="min-h-11 rounded-lg border border-line bg-card px-2 text-sm text-fg"><option value="neutral">중립 회색</option><option value="light">밝게</option><option value="dark">어둡게</option></select>
        </label>
        <span className="text-xs text-fg-3">설정과 선택 페이지는 URL에 보존됩니다.</span>
      </div>
    </section>

    <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_25rem]">
      <div className={cn("grid min-w-0 gap-3", gridClass)}>
        {visibleCandidates.map((candidate, index) => <div key={candidate.id} onPointerDown={() => update((current) => ({ ...current, activeReviewId: candidate.id }))}>
          <WorkbenchPane candidate={candidate} index={index} layout={state.layout} zoom={state.zoom} background={state.background}
            selectedOrdinal={state.pageOrdinals[candidate.id] ?? null} scrollRatio={state.scrollRatios[candidate.id] ?? 0}
            onSelectPage={selectPage} onLoaded={handleLoaded}
            onScroll={onScroll} registerViewport={registerViewport} onRevoked={() => setLoaded((current) => ({ ...current, [candidate.id]: { previews: [], current: null } }))} />
        </div>)}
      </div>

      <aside className="min-w-0" aria-label="활성 원고 피드백 레일">
        <section className="mb-3 rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center gap-2"><MessageSquare className="size-4 text-accent" aria-hidden="true" /><h2 className="text-sm font-black text-fg">활성 검수본 피드백</h2></div>
          {activeCandidate ? <><p className="mt-2 text-sm font-bold text-fg">{activeCandidate.episodeLabel} · {activeCandidate.processLabel}</p><p className="mt-1 text-xs text-fg-2">{activeCandidate.review.title} · 필수 {activeCandidate.review.openRequiredCommentCount}개</p></> : <p className="mt-2 text-xs text-fg-2">원고 pane을 선택하세요.</p>}
        </section>
        <StudioPinnedReviewPanel subject={activeCandidate?.subject ?? null} showShareTools={false} showExportTools={false} />
      </aside>
    </div>
  </div>;
}
