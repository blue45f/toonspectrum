import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowRight, MessageCircle, Search } from "lucide-react";
import { type FormEvent, useId } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { ErrorState } from "@/components/error-state";
import { useApiResource } from "@/infrastructure/use-api-resource";
import { COMMUNITY_SCOPE_LABEL, COMMUNITY_SORT_OPTIONS, getCommunityScopeTargetLink, parseCommunitySort } from "@/shared/lib/community-ui";

export type DirectoryScope = "title" | "author" | "pencafe";
interface Board { scope: DirectoryScope; targetId: string; targetLabel: string }
interface BoardResponse { items: Board[] }

const EMPTY_DESTINATION = {
  title: { href: "/discover", label: "이야기 나눌 작품 찾기" },
  author: { href: "/authors", label: "좋아하는 작가 찾기" },
  pencafe: { href: "/community/cafes", label: "장르 카페 둘러보기" },
} as const;

/** A category is a directory, not a single-target post feed. Target validation stays intact. */
export function CommunityScopeDirectory({ scope }: { scope: DirectoryScope }) {
  const [params, setParams] = useSearchParams();
  const searchId = useId();
  const sortId = useId();
  const query = (params.get("q") ?? "").slice(0, 120);
  const sort = parseCommunitySort(params.get("sort"));
  const request = new URLSearchParams({ scope, sort, limit: "60" });
  if (query.trim()) request.set("q", query.trim());
  const { data, loading, error, notFound, reload } = useApiResource<BoardResponse>(
    `/api/community/boards?${request.toString()}`, "커뮤니티 목록을 불러오지 못했습니다.",
  );
  const malformed = data !== null && !Array.isArray(data.items);
  const boards = Array.isArray(data?.items) ? data.items.filter((board) => board
    && board.scope === scope && typeof board.targetId === "string" && board.targetId.trim()
    && typeof board.targetLabel === "string" && board.targetLabel.trim()).slice(0, 60) : [];
  const destination = EMPTY_DESTINATION[scope];
  const update = (key: string, value: string) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update("q", String(new FormData(event.currentTarget).get("q") ?? "").trim().slice(0, 120));
  };

  return (
    <section aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "{v0} 대화 목록"), { v0: String(COMMUNITY_SCOPE_LABEL[scope]) })} className="space-y-5">
      <form onSubmit={submit} role="search" aria-label={translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "커뮤니티 이름 검색")} className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-panel/60 p-4 sm:p-5">
        <div className="min-w-0 flex-1 basis-52">
          <label htmlFor={searchId} className="mb-2 block text-xs font-semibold text-fg-2">{COMMUNITY_SCOPE_LABEL[scope]} {translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "이름 검색")}</label>
          <input id={searchId} key={`${scope}:${query}`} name="q" type="search" maxLength={120} defaultValue={query}
            placeholder={translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "이름을 입력하세요")} className="min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent" />
        </div>
        <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"><Search size={16} aria-hidden="true" />{translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "검색")}</button>
        <div>
          <label htmlFor={sortId} className="mb-2 block text-xs font-semibold text-fg-2">{translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "정렬")}</label>
          <select id={sortId} value={sort} onChange={(event) => update("sort", event.target.value)} className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-fg">
            {COMMUNITY_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        {query && <button type="button" onClick={() => update("q", "")} className="min-h-11 rounded-xl border border-line px-4 text-sm text-fg-2">{translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "검색 지우기")}</button>}
      </form>

      {error || notFound || malformed ? <ErrorState title={translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "커뮤니티 목록을 불러오지 못했습니다.")}
        message={translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "잠시 후 다시 시도해 주세요. 통합 커뮤니티와 작품 탐색은 아래 링크로 계속 이용할 수 있습니다.")} onRetry={reload} />
        : loading ? <div role="status" className="rounded-2xl border border-line bg-panel/40 p-8 text-sm text-fg-2">{translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "대화가 있는 커뮤니티를 찾고 있습니다…")}</div>
          : boards.length ? <>
            <p role="status" className="text-xs leading-relaxed text-fg-2">{translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "대화가 있는 ")}{COMMUNITY_SCOPE_LABEL[scope]} {boards.length}{translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "개 · 최대 60개를 표시합니다. 이름으로 검색해 더 좁혀보세요.")}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {boards.map((board) => <Link key={`${board.scope}:${board.targetId}`} href={getCommunityScopeTargetLink(board.scope, board.targetId, board.targetLabel)}
                className="group flex min-h-28 min-w-0 items-center gap-4 rounded-2xl border border-line bg-panel/60 p-5 transition-colors hover:border-accent hover:bg-card focus-visible:outline-2 focus-visible:outline-accent">
                <MessageCircle size={21} aria-hidden="true" className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1"><strong className="block break-words text-sm text-fg">{board.targetLabel}</strong><span className="mt-2 block text-xs text-fg-2">{translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "작품과 대화 살펴보기")}</span></span>
                <ArrowRight size={17} aria-hidden="true" className="shrink-0 text-fg-3 group-hover:text-accent" />
              </Link>)}
            </div>
          </> : <div className="rounded-2xl border border-dashed border-line-strong bg-panel/40 p-8 text-center">
            <h2 className="text-lg font-semibold text-fg">{query ? translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "검색한 이름의 대화가 아직 없어요") : translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "아직 등록된 대화가 없어요")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-2">{query ? translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "다른 이름으로 검색하거나 관심 있는 작품과 작가를 찾아보세요.") : translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "관심 있는 작품과 작가의 페이지에서 첫 이야기를 시작해 보세요.")}</p>
          </div>}
      <nav aria-label={translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "커뮤니티 탐색 이어가기")} className="flex flex-wrap gap-3">
        <Link href={destination.href} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold text-accent">{destination.label}<ArrowRight size={15} aria-hidden="true" /></Link>
        <Link href="/community" className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm text-fg-2">{translateCurrentStaticSourceText("domains.community.components.community.scope.directory", "ko", "통합 커뮤니티로 돌아가기")}</Link>
      </nav>
    </section>
  );
}
