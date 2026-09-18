import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useMemo, useState } from "react";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { resourceLicenseLabel, sourceFreshness } from "./research-dashboard";
import { downloadText } from "./workspace";

import type { BoardSort, DeadlineFilter } from "@/shared/lib/creator-resource-workflow";
import type { CreatorResource, ResourceProvider } from "@/shared/lib/creator-resources";

import { selectBoardResources } from "@/shared/lib/creator-resource-workflow";
import { attributionMarkdown, deadlineLabel, isProvider, RESOURCE_LABELS } from "@/shared/lib/creator-resources";

const PAGE_SIZE = 12;
const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "short",
  day: "numeric",
});

function fetchedDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_FORMATTER.format(date) : "조회일 확인 필요";
}

export function SavedBoard({ items, onRemove, disabled = false }: { items: readonly CreatorResource[]; onRemove: (id: string) => void; disabled?: boolean }) {
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
      <div><p className="text-sm font-semibold text-accent">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "내 창작 보드")}</p><h2 id="saved-board-title" className="mt-1 text-xl font-bold">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "저장한 자료 찾기")}</h2></div>
      <button type="button" className={RESOURCE_BUTTON} disabled={!hasActiveFilters} onClick={resetFilters}>{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "필터 초기화")}</button>
    </header>
    <div className="grid gap-4 sm:grid-cols-2">
      <label htmlFor="board-query" className="text-sm font-semibold">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "제목·저작자·설명·ISBN 검색")}<input id="board-query" type="search" maxLength={80} value={query} placeholder={translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "보드 안에서 다시 찾기")} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "en", "{v0} mt-2"), { v0: String(RESOURCE_INPUT) })} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <label htmlFor="board-provider" className="text-sm font-semibold">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "제공처")}<select id="board-provider" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "en", "{v0} mt-2"), { v0: String(RESOURCE_INPUT) })} value={provider} onChange={(event) => setProvider(isProvider(event.target.value) ? event.target.value : "all")}>
          <option value="all">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "모든 제공처")}</option>{Object.entries(RESOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label htmlFor="board-sort" className="text-sm font-semibold">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "정렬")}<select id="board-sort" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "en", "{v0} mt-2"), { v0: String(RESOURCE_INPUT) })} value={sort} onChange={(event) => setSort(event.target.value as BoardSort)}>
          <option value="saved">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "마지막에 추가한 자료")}</option><option value="recent">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "조회일 최신순")}</option><option value="title">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "제목순")}</option><option value="deadline">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "마감일 빠른순")}</option>
        </select>
      </label>
      <label htmlFor="board-deadline" className="text-sm font-semibold">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "공고 마감 날짜")}<select id="board-deadline" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "en", "{v0} mt-2"), { v0: String(RESOURCE_INPUT) })} value={canFilterDeadline ? deadline : translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "en", "all")} disabled={!canFilterDeadline} onChange={(event) => setDeadline(event.target.value as DeadlineFilter)}>
          <option value="all">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "전체 자료")}</option><option value="upcoming">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "오늘 이후 마감 날짜")}</option><option value="expired">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "마감일 경과")}</option><option value="unknown">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "마감일 원문 확인")}</option>
        </select>
      </label>
    </div>
    <div className="flex flex-wrap gap-2" aria-label={translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "저장 자료 제공처별 개수")}>
      {Object.entries(RESOURCE_LABELS).map(([key, label]) => {
        const count = items.filter((item) => item.provider === key).length;
        return count ? <span key={key} className="rounded-full border border-line bg-canvas px-3 py-1 text-xs">{label} · {count}</span> : null;
      })}
    </div>
    <p className="text-xs leading-6 text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "현재 브라우저의 저장 자료만 검색합니다. 마감 날짜 분류는 접수 중임을 보증하지 않습니다. 정확한 접수 시간과 변경 여부는 원문에서 확인하세요.")}</p>
    <div className="flex flex-wrap items-center gap-3">
      <p role="status" className="text-sm text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "전체 ")}{items.length}{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "개 중 ")}{visible.length}{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "개 · 현재 ")}{rendered.length}{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "개 표시")}</p>
      <button className={RESOURCE_BUTTON} disabled={!visible.length} onClick={() => downloadText("selected-creator-sources.md", attributionMarkdown(visible))}>{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "검색 결과 출처 내보내기")}</button>
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rendered.map((item) => {
      const freshness = sourceFreshness(item);
      return <article key={item.id} className="min-w-0 overflow-hidden rounded-xl border border-line bg-canvas">
        {item.imageUrl && <div className="aspect-[4/3] overflow-hidden border-b border-line bg-card"><img src={item.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" /></div>}
        <div className="p-4">
          <p className="text-xs text-accent">{RESOURCE_LABELS[item.provider]}</p>
          <h3 className="mt-2 break-words font-bold">{item.title}</h3>
          <p className="mt-2 text-sm text-fg-2">{item.creator || translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "저작자·기관 원문 확인")}</p>
          {item.description && <p className="mt-3 max-h-20 overflow-hidden text-sm leading-6 text-fg-2">{item.description}</p>}
          <dl className="mt-4 grid gap-2 border-t border-line pt-3 text-xs">
            <div className="flex items-start justify-between gap-3"><dt className="text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "이용조건")}</dt><dd className="text-right font-semibold">{resourceLicenseLabel(item.license)}</dd></div>
            <div className="flex items-start justify-between gap-3"><dt className="text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "조회일")}</dt><dd className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "en", "text-right {v0}"), { v0: String(freshness.needsReview ? "font-semibold text-fg" : "text-fg-2") })}><time dateTime={item.fetchedAt}>{fetchedDate(item.fetchedAt)}</time><span className="block">{freshness.label}</span></dd></div>
            {item.provider === "bizinfo" && <div className="flex items-start justify-between gap-3"><dt className="text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "마감")}</dt><dd className="text-right font-semibold">{deadlineLabel(item.deadline)}</dd></div>}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2"><a className={RESOURCE_BUTTON} href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "원문 확인 ↗")}</a>
            <button className={RESOURCE_BUTTON} disabled={disabled} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "{v0} 저장 해제"), { v0: String(item.title) })} onClick={() => onRemove(item.id)}>{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "저장 해제")}</button>
          </div>
        </div>
      </article>;
    })}</div>
    {rendered.length < visible.length && <div className="flex justify-center"><button type="button" className={RESOURCE_BUTTON} onClick={() => setLimit((value) => Math.min(value + PAGE_SIZE, visible.length))}>{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "자료 더 보기 · ")}{visible.length - rendered.length}{translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "개 남음")}</button></div>}
    {!visible.length && <p className="rounded-xl border border-dashed border-line p-5 text-sm text-fg-2">{items.length ? translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "조건에 맞는 저장 자료가 없습니다. 검색어나 필터를 바꿔보세요.") : translateCurrentStaticSourceText("domains.creator.resources.SavedBoard", "ko", "아직 저장한 자료가 없습니다. 기회센터·레퍼런스·글로벌 판본 탐색에서 보드에 저장을 선택하세요.")}</p>}
  </section>;
}
