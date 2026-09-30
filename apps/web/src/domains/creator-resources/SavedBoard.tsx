import { useEffect, useMemo, useState } from "react";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { resourceLicenseLabel, sourceFreshness } from "./research-dashboard";
import { downloadText } from "./workspace";

import type { BoardSort, DeadlineFilter } from "@/shared/lib/creator-resource-workflow";
import type { CreatorResource, ResourceProvider } from "@/shared/lib/creator-resources";

import { selectBoardResources } from "@/shared/lib/creator-resource-workflow";
import { attributionMarkdown, deadlineLabel, isProvider, RESOURCE_LABELS } from "@/shared/lib/creator-resources";
import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { MotionEmptyState } from "@/shared/motion-assets";

const SCOPE = "domains.creator.resources.SavedBoard";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);

const PAGE_SIZE = 12;
const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "short",
  day: "numeric",
});

function fetchedDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_FORMATTER.format(date) : tx("조회일 확인 필요");
}

export function SavedBoard({ items, onRemove, disabled = false }: { items: readonly CreatorResource[]; onRemove: (id: string) => void; disabled?: boolean }) {
  useBilingualI18nRevision();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<ResourceProvider | "all">("all");
  const [sort, setSort] = useState<BoardSort>("saved");
  const [deadline, setDeadline] = useState<DeadlineFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const canFilterDeadline = provider === "all" || provider === "bizinfo";
  const visible = useMemo(() => selectBoardResources(items, {
    query,
    provider,
    sort,
    deadline: canFilterDeadline ? deadline : "all",
  }), [canFilterDeadline, deadline, items, provider, query, sort]);
  const rendered = visible.slice(0, limit);
  const hasActiveFilters = Boolean(query.trim()) || provider !== "all" || sort !== "saved" || deadline !== "all";

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [deadline, items.length, provider, query, sort]);

  const resetFilters = () => {
    setQuery("");
    setProvider("all");
    setSort("saved");
    setDeadline("all");
  };

  return <section id="saved-board" aria-labelledby="saved-board-title" className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-accent">{tx("내 창작 보드")}</p><h2 id="saved-board-title" className="mt-1 text-xl font-bold">{tx("저장한 자료 찾기")}</h2></div>
      <button type="button" className={RESOURCE_BUTTON} disabled={!hasActiveFilters} onClick={resetFilters}>{tx("필터 초기화")}</button>
    </header>
    <div className="grid gap-4 sm:grid-cols-2">
      <label htmlFor="board-query" className="text-sm font-semibold">{tx("제목·저작자·설명·ISBN 검색")}
        <input id="board-query" type="search" maxLength={80} value={query} placeholder={tx("보드 안에서 다시 찾기")} className={`${RESOURCE_INPUT} mt-2`} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <label htmlFor="board-provider" className="text-sm font-semibold">{tx("제공처")}
        <select id="board-provider" className={`${RESOURCE_INPUT} mt-2`} value={provider} onChange={(event) => setProvider(isProvider(event.target.value) ? event.target.value : "all")}>
          <option value="all">{tx("모든 제공처")}</option>{Object.entries(RESOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label htmlFor="board-sort" className="text-sm font-semibold">{tx("정렬")}
        <select id="board-sort" className={`${RESOURCE_INPUT} mt-2`} value={sort} onChange={(event) => setSort(event.target.value as BoardSort)}>
          <option value="saved">{tx("마지막에 추가한 자료")}</option><option value="recent">{tx("조회일 최신순")}</option><option value="title">{tx("제목순")}</option><option value="deadline">{tx("마감일 빠른순")}</option>
        </select>
      </label>
      <label htmlFor="board-deadline" className="text-sm font-semibold">{tx("공고 마감 날짜")}
        <select id="board-deadline" className={`${RESOURCE_INPUT} mt-2`} value={canFilterDeadline ? deadline : "all"} disabled={!canFilterDeadline} onChange={(event) => setDeadline(event.target.value as DeadlineFilter)}>
          <option value="all">{tx("전체 자료")}</option><option value="upcoming">{tx("오늘 이후 마감 날짜")}</option><option value="expired">{tx("마감일 경과")}</option><option value="unknown">{tx("마감일 원문 확인")}</option>
        </select>
      </label>
    </div>
    <div className="flex flex-wrap gap-2" aria-label={tx("저장 자료 제공처별 개수")}>
      {Object.entries(RESOURCE_LABELS).map(([key, label]) => {
        const count = items.filter((item) => item.provider === key).length;
        return count ? <span key={key} className="rounded-full border border-line bg-canvas px-3 py-1 text-xs">{formatI18nTemplate(tx("{v0} · {v1}"), { v0: label, v1: count })}</span> : null;
      })}
    </div>
    <p className="text-xs leading-6 text-fg-2">{tx("현재 브라우저의 저장 자료만 검색합니다. 마감 날짜 분류는 접수 중임을 보증하지 않습니다. 정확한 접수 시간과 변경 여부는 원문에서 확인하세요.")}</p>
    <div className="flex flex-wrap items-center gap-3">
      <p role="status" className="text-sm text-fg-2">{formatI18nTemplate(tx("전체 {v0}개 중 {v1}개 · 현재 {v2}개 표시"), { v0: items.length, v1: visible.length, v2: rendered.length })}</p>
      <button className={RESOURCE_BUTTON} disabled={!visible.length} onClick={() => downloadText("selected-creator-sources.md", attributionMarkdown(visible))}>{tx("검색 결과 출처 내보내기")}</button>
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rendered.map((item) => {
      const freshness = sourceFreshness(item);
      return <article key={item.id} className="min-w-0 overflow-hidden rounded-xl border border-line bg-canvas">
        {item.imageUrl && <div className="aspect-[4/3] overflow-hidden border-b border-line bg-card"><img src={item.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" /></div>}
        <div className="p-4">
          <p className="text-xs text-accent">{RESOURCE_LABELS[item.provider]}</p>
          <h3 className="mt-2 break-words font-bold">{item.title}</h3>
          <p className="mt-2 text-sm text-fg-2">{item.creator || tx("저작자·기관 원문 확인")}</p>
          {item.description && <p className="mt-3 max-h-20 overflow-hidden text-sm leading-6 text-fg-2">{item.description}</p>}
          <dl className="mt-4 grid gap-2 border-t border-line pt-3 text-xs">
            <div className="flex items-start justify-between gap-3"><dt className="text-fg-2">{tx("이용조건")}</dt><dd className="text-right font-semibold">{tx(resourceLicenseLabel(item.license))}</dd></div>
            <div className="flex items-start justify-between gap-3"><dt className="text-fg-2">{tx("조회일")}</dt><dd className={`text-right ${freshness.needsReview ? "font-semibold text-fg" : "text-fg-2"}`}><time dateTime={item.fetchedAt}>{fetchedDate(item.fetchedAt)}</time><span className="block">{tx(freshness.label)}</span></dd></div>
            {item.provider === "bizinfo" && <div className="flex items-start justify-between gap-3"><dt className="text-fg-2">{tx("마감")}</dt><dd className="text-right font-semibold">{tx(deadlineLabel(item.deadline))}</dd></div>}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2"><a className={RESOURCE_BUTTON} href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{tx("원문 확인 ↗")}</a>
            <button className={RESOURCE_BUTTON} disabled={disabled} aria-label={formatI18nTemplate(tx("{v0} 저장 해제"), { v0: item.title })} onClick={() => onRemove(item.id)}>{tx("저장 해제")}</button>
          </div>
        </div>
      </article>;
    })}</div>
    {rendered.length < visible.length && <div className="flex justify-center"><button type="button" className={RESOURCE_BUTTON} onClick={() => setLimit((value) => Math.min(value + PAGE_SIZE, visible.length))}>{formatI18nTemplate(tx("자료 더 보기 · {v0}개 남음"), { v0: visible.length - rendered.length })}</button></div>}
    {!visible.length && <MotionEmptyState
      kind={items.length ? "search" : "empty"}
      title={tx(items.length ? "조건에 맞는 저장 자료가 없습니다" : "아직 저장한 자료가 없습니다")}
      description={tx(items.length ? "검색어를 줄이거나 필터 선택을 바꾸면 더 많은 자료를 찾을 수 있습니다." : "기회센터·레퍼런스·글로벌 판본 탐색에서 보드에 저장을 선택하세요.")}
      action={items.length ? <button type="button" className={RESOURCE_BUTTON} onClick={resetFilters}>{tx("필터 초기화")}</button> : undefined}
    />}
  </section>;
}
