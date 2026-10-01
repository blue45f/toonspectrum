import {
  BriefcaseBusiness,
  Loader2,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import Link from "@/shared/navigation/router-link";
import {
  searchCreatorDirectory,
  type CreatorDirectoryEntry,
  type CreatorDirectoryQuery,
} from "@/platform/creator-client";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n-core";
import {
  CREATOR_COLLABORATION_LABELS,
  CREATOR_ROLE_DEFINITIONS,
  CREATOR_SPECIALTY_DEFINITIONS,
  creatorRoleDefinition,
  creatorSpecialtyDefinition,
  creatorText,
  normalizeCreatorCollaborationStatus,
  normalizeCreatorRoleId,
  normalizeCreatorSpecialtyId,
} from "@/shared/lib/creator-role-contract";

const PAGE_SIZE = 24;
const SKELETON_CARD_COUNT = 6;

type DirectoryFilters = Pick<
  CreatorDirectoryQuery,
  "q" | "role" | "specialty" | "collaborationStatus"
>;

const EMPTY_FILTERS: DirectoryFilters = {
  q: "",
  role: undefined,
  specialty: undefined,
  collaborationStatus: undefined,
};

function CreatorCard({ creator, locale }: { readonly creator: CreatorDirectoryEntry; readonly locale: string }) {
  const t = useBilingual("CreatorDirectoryPage");
  const profile = creator.creatorRoleProfile;
  const primary = creatorRoleDefinition(profile.primaryRole);
  const displayRole = primary ? creatorText(primary.label, locale) : t("창작자", "Creator");
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-base font-black text-white"
          style={{ backgroundColor: creator.avatar }}
          aria-hidden="true"
        >
          {creator.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-black text-fg">{creator.name}</h2>
          <p className="mt-1 text-xs font-bold text-accent">{displayRole}</p>
          {profile.collaborationStatus ? (
            <p className="mt-1 text-[0.68rem] text-fg-3">
              {creatorText(CREATOR_COLLABORATION_LABELS[profile.collaborationStatus], locale)}
            </p>
          ) : null}
        </div>
      </div>
      {creator.bio ? (
        <p className="mt-3 line-clamp-3 break-words text-xs leading-5 text-fg-2">{creator.bio}</p>
      ) : null}
      {profile.specialties.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {profile.specialties.slice(0, 5).map((specialty) => {
            const definition = creatorSpecialtyDefinition(specialty);
            return definition ? (
              <span key={specialty} className="rounded-full border border-line bg-panel px-2 py-1 text-[0.65rem] font-semibold text-fg-2">
                {creatorText(definition.label, locale)}
              </span>
            ) : null;
          })}
        </div>
      ) : null}
      <Link
        href={`/u/${encodeURIComponent(creator.id)}`}
        className={buttonClass({ variant: "quiet", size: "sm", className: "mt-4 w-full" })}
      >
        {t("프로필과 포트폴리오 보기", "View profile and portfolio")}
      </Link>
    </article>
  );
}

/**
 * 본 조회(첫 페이지·조건 변경) 결과. 실패하면 이전 조건의 목록을 남기지 않는다 —
 * 다른 조건의 결과와 "공개 창작자 N명"이 새 조건의 결과처럼 보이는 것을 막는다.
 */
type DirectoryQueryState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly items: readonly CreatorDirectoryEntry[]; readonly nextOffset: number | null };

export function CreatorDirectoryPage() {
  const t = useBilingual("CreatorDirectoryPage");
  const lang = useI18n((state) => state.lang);
  const [draft, setDraft] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [result, setResult] = useState<DirectoryQueryState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  // "더 보기" 실패는 이미 받은 목록을 유지한 채 그 자리에서 다시 시도한다(본 조회 실패와 분리).
  const [moreError, setMoreError] = useState<string | null>(null);
  // 다시 시도 시 같은 조건으로 첫 페이지부터 재조회하도록 질의 식별자를 갱신합니다.
  const [retryNonce, setRetryNonce] = useState(0);
  // 조건이 바뀌면 진행 중인 "더 보기" 요청을 취소해 이전 조건의 다음 페이지가 붙지 않게 한다.
  const moreControllerRef = useRef<AbortController | null>(null);

  const query = useMemo<CreatorDirectoryQuery>(() => ({
    ...filters,
    q: filters.q?.trim() || undefined,
    limit: PAGE_SIZE,
    offset: 0,
  }), [filters]);

  useEffect(() => {
    const controller = new AbortController();
    moreControllerRef.current?.abort();
    moreControllerRef.current = null;
    setResult({ status: "loading" });
    setMoreError(null);
    setLoadingMore(false);
    searchCreatorDirectory(query, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setResult({ status: "ready", items: page.items, nextOffset: page.nextOffset });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          status: "error",
          message: cause instanceof Error ? cause.message : t("창작자 목록을 불러오지 못했습니다.", "Could not load the creator list."),
        });
      });
    return () => controller.abort();
  }, [query, retryNonce, t]);

  useEffect(() => () => moreControllerRef.current?.abort(), []);

  const loadMore = async () => {
    if (result.status !== "ready" || result.nextOffset === null || moreControllerRef.current) return;
    const controller = new AbortController();
    moreControllerRef.current = controller;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await searchCreatorDirectory({ ...query, offset: result.nextOffset }, controller.signal);
      if (controller.signal.aborted) return;
      setResult((current) => current.status === "ready"
        ? { status: "ready", items: [...current.items, ...page.items], nextOffset: page.nextOffset }
        : current);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setMoreError(cause instanceof Error ? cause.message : t("창작자를 더 불러오지 못했습니다.", "Could not load more creators."));
    } finally {
      if (moreControllerRef.current === controller) {
        moreControllerRef.current = null;
        setLoadingMore(false);
      }
    }
  };

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-8 sm:py-12">
        <SitePageHeader
          surface="plain"
          icon={UsersRound}
          eyebrow="CREATOR DIRECTORY"
          title={t("함께 만들 창작자 찾기", "Find creators to build with")}
          description={t("창작자가 공개하기로 선택한 직무, 전문 분야와 협업 상태만 검색합니다. 작업 모드와 프로젝트 내부 정보는 노출하지 않습니다.", "Searches only the roles, specialties, and collaboration status creators chose to make public. Work modes and internal project information are never exposed.")}
        />

        <form
          className="mt-7 rounded-2xl border border-line bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters(draft);
          }}
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]">
            <label className="text-xs font-bold text-fg">
              {t("이름·소개", "Name / bio")}
              <span className="mt-1.5 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 focus-within:border-accent">
                <Search size={14} className="text-fg-3" aria-hidden="true" />
                <input
                  value={draft.q ?? ""}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...current, q: value }));
                  }}
                  maxLength={60}
                  placeholder={t("이름 또는 소개 검색", "Search names or bios")}
                  className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none"
                />
              </span>
            </label>
            <label className="text-xs font-bold text-fg">
              {t("직무", "Role")}
              <select
                value={draft.role ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDraft((current) => ({ ...current, role: normalizeCreatorRoleId(value) ?? undefined }));
                }}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="">{t("전체 직무", "All roles")}</option>
                {CREATOR_ROLE_DEFINITIONS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {creatorText(entry.label, lang)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-fg">
              {t("전문 분야", "Specialty")}
              <select
                value={draft.specialty ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDraft((current) => ({ ...current, specialty: normalizeCreatorSpecialtyId(value) ?? undefined }));
                }}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="">{t("전체 전문 분야", "All specialties")}</option>
                {CREATOR_SPECIALTY_DEFINITIONS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {creatorText(entry.label, lang)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-fg">
              {t("협업 상태", "Collaboration status")}
              <select
                value={draft.collaborationStatus ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDraft((current) => ({ ...current, collaborationStatus: normalizeCreatorCollaborationStatus(value) ?? undefined }));
                }}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="">{t("전체 상태", "All statuses")}</option>
                {Object.entries(CREATOR_COLLABORATION_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{creatorText(label, lang)}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className={buttonClass({ className: "self-end gap-2" })}
            >
              <Search size={15} aria-hidden="true" />
              {t("검색", "Search")}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="flex items-center gap-1.5 text-[0.68rem] leading-5 text-fg-3">
              <Sparkles size={13} aria-hidden="true" />
              {t("공개 동의한 정보만 검색 결과와 프로필에 표시됩니다.", "Only information creators consented to make public is shown in results and profiles.")}
            </p>
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 text-xs font-bold text-fg-2 hover:bg-raised hover:text-fg"
              onClick={resetFilters}
            >
              {t("검색 조건 초기화", "Clear filters")}
            </button>
          </div>
        </form>

        {result.status === "loading" ? (
          <div role="status" aria-busy="true" className="mt-6">
            <span className="sr-only">{t("창작자 목록을 불러오는 중", "Loading the creator list")}</span>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
              {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
                <span key={index} className="skeleton block h-56 rounded-2xl" />
              ))}
            </div>
          </div>
        ) : result.status === "error" ? (
          // 본 조회 실패는 빈 결과("조건에 맞는 창작자 없음")·이전 조건의 목록과 구분해 결과 자리에서 첫 페이지부터 다시 시도한다.
          <ErrorState
            className="mt-6 p-8"
            title={t("창작자 목록을 불러오지 못했습니다.", "Could not load the creator list.")}
            message={result.message}
            onRetry={() => setRetryNonce((current) => current + 1)}
          />
        ) : result.items.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-dashed border-line bg-card px-5 py-12 text-center">
            <BriefcaseBusiness className="mx-auto size-8 text-fg-3" aria-hidden="true" />
            <h2 className="mt-3 text-base font-black text-fg">{t("조건에 맞는 공개 창작자가 없습니다", "No public creators match these filters")}</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              {t("다른 직무나 전문 분야를 선택하거나 검색어를 줄여 보세요.", "Try a different role or specialty, or shorten your search term.")}
            </p>
            <button
              type="button"
              className={buttonClass({ variant: "quiet", className: "mt-5" })}
              onClick={resetFilters}
            >
              {t("검색 조건 초기화", "Clear filters")}
            </button>
          </section>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-fg">{t(`공개 창작자 ${result.items.length}명`, `Public creators: ${result.items.length}`)}</p>
              <p className="text-xs text-fg-3">{t("최신 가입 순 · 공개 프로필 기준", "Newest first · public profiles only")}</p>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {result.items.map((creator) => (
                <CreatorCard key={creator.id} creator={creator} locale={lang} />
              ))}
            </div>
            {moreError ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3" role="alert">
                <p className="text-sm font-semibold text-bad">{moreError}</p>
                <button type="button" className={buttonClass({ variant: "quiet", size: "sm" })} onClick={() => void loadMore()}>
                  {t("다시 시도", "Try again")}
                </button>
              </div>
            ) : null}
            {result.nextOffset !== null && !moreError ? (
              <div className="mt-7 flex justify-center">
                <button
                  type="button"
                  className={buttonClass({ variant: "quiet", className: "gap-2" })}
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                  {t("더 보기", "Load more")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </Container>
    </div>
  );
}
