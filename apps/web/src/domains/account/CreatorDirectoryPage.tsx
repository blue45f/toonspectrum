import {
  BriefcaseBusiness,
  Loader2,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import Link from "@/compat/router-link";
import {
  searchCreatorDirectory,
  type CreatorDirectoryEntry,
  type CreatorDirectoryQuery,
} from "@/infrastructure/creator-client";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  CREATOR_COLLABORATION_LABELS,
  CREATOR_ROLE_DEFINITIONS,
  CREATOR_SPECIALTY_DEFINITIONS,
  creatorRoleDefinition,
  creatorText,
  type CreatorCollaborationStatus,
  type CreatorRoleId,
  type CreatorSpecialtyId,
} from "@/shared/lib/creator-role-contract";


const PAGE_SIZE = 24;

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

function CreatorCard({ creator }: { readonly creator: CreatorDirectoryEntry }) {
  const profile = creator.creatorRoleProfile;
  const primary = creatorRoleDefinition(profile.primaryRole);
  const displayRole = primary ? creatorText(primary.label, "ko") : "창작자";
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
              {creatorText(CREATOR_COLLABORATION_LABELS[profile.collaborationStatus], "ko")}
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
            const definition = CREATOR_SPECIALTY_DEFINITIONS.find((entry) => entry.id === specialty);
            return definition ? (
              <span key={specialty} className="rounded-full border border-line bg-panel px-2 py-1 text-[0.65rem] font-semibold text-fg-2">
                {creatorText(definition.label, "ko")}
              </span>
            ) : null;
          })}
        </div>
      ) : null}
      <Link
        href={`/u/${encodeURIComponent(creator.id)}`}
        className={buttonClass({ variant: "quiet", size: "sm", className: "mt-4 w-full" })}
      >
        프로필과 포트폴리오 보기
      </Link>
    </article>
  );
}

export function CreatorDirectoryPage() {
  const [draft, setDraft] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [items, setItems] = useState<readonly CreatorDirectoryEntry[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo<CreatorDirectoryQuery>(() => ({
    ...filters,
    q: filters.q?.trim() || undefined,
    limit: PAGE_SIZE,
    offset: 0,
  }), [filters]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    searchCreatorDirectory(query, controller.signal)
      .then((result) => {
        setItems(result.items);
        setNextOffset(result.nextOffset);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "창작자 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  const loadMore = async () => {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await searchCreatorDirectory({ ...query, offset: nextOffset });
      setItems((current) => [...current, ...result.items]);
      setNextOffset(result.nextOffset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "창작자를 더 불러오지 못했습니다.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-8 sm:py-12">
        <header className="max-w-3xl">
          <div className="flex items-center gap-2 text-accent">
            <UsersRound size={18} aria-hidden="true" />
            <p className="text-xs font-black uppercase tracking-[0.15em]">CREATOR DIRECTORY</p>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-fg sm:text-4xl">
            함께 만들 창작자 찾기
          </h1>
          <p className="mt-3 text-sm leading-7 text-fg-2">
            창작자가 공개하기로 선택한 직무, 전문 분야와 협업 상태만 검색합니다. 작업 모드와 프로젝트 내부 정보는 노출하지 않습니다.
          </p>
        </header>

        <form
          className="mt-7 rounded-2xl border border-line bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters(draft);
          }}
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]">
            <label className="text-xs font-bold text-fg">
              이름·소개
              <span className="mt-1.5 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 focus-within:border-accent">
                <Search size={14} className="text-fg-3" aria-hidden="true" />
                <input
                  value={draft.q ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, q: event.currentTarget.value }))}
                  maxLength={60}
                  placeholder="이름 또는 소개 검색"
                  className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none"
                />
              </span>
            </label>            <label className="text-xs font-bold text-fg">
              직무
              <select
                value={draft.role ?? ""}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  role: event.currentTarget.value
                    ? event.currentTarget.value as CreatorRoleId
                    : undefined,
                }))}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="">전체 직무</option>
                {CREATOR_ROLE_DEFINITIONS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {creatorText(entry.label, "ko")}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-fg">
              전문 분야
              <select
                value={draft.specialty ?? ""}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  specialty: event.currentTarget.value
                    ? event.currentTarget.value as CreatorSpecialtyId
                    : undefined,
                }))}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="">전체 전문 분야</option>                {CREATOR_SPECIALTY_DEFINITIONS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {creatorText(entry.label, "ko")}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-fg">
              협업 상태
              <select
                value={draft.collaborationStatus ?? ""}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  collaborationStatus: event.currentTarget.value
                    ? event.currentTarget.value as CreatorCollaborationStatus
                    : undefined,
                }))}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="">전체 상태</option>
                {Object.entries(CREATOR_COLLABORATION_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{creatorText(label, "ko")}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className={buttonClass({ className: "self-end gap-2" })}
            >
              <Search size={15} aria-hidden="true" />
              검색
            </button>
          </div>          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="flex items-center gap-1.5 text-[0.68rem] leading-5 text-fg-3">
              <Sparkles size={13} aria-hidden="true" />
              공개 동의한 정보만 검색 결과와 프로필에 표시됩니다.
            </p>
            <button
              type="button"
              className="min-h-9 rounded-lg px-3 text-xs font-bold text-fg-2 hover:bg-raised hover:text-fg"
              onClick={() => {
                setDraft(EMPTY_FILTERS);
                setFilters(EMPTY_FILTERS);
              }}
            >
              검색 조건 초기화
            </button>
          </div>
        </form>

        {error ? (
          <div className="mt-5 rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm font-semibold text-bad" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="창작자 목록 불러오는 중">
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={index} className="skeleton block h-56 rounded-2xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-dashed border-line bg-card px-5 py-12 text-center">
            <BriefcaseBusiness className="mx-auto size-8 text-fg-3" aria-hidden="true" />
            <h2 className="mt-3 text-base font-black text-fg">조건에 맞는 공개 창작자가 없습니다</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              다른 직무나 전문 분야를 선택하거나 검색어를 줄여 보세요.
            </p>
          </section>
        ) : (          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-fg">공개 창작자 {items.length}명</p>
              <p className="text-xs text-fg-3">최신 가입 순 · 공개 프로필 기준</p>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((creator) => (
                <CreatorCard key={creator.id} creator={creator} />
              ))}
            </div>
            {nextOffset !== null ? (
              <div className="mt-7 flex justify-center">
                <button
                  type="button"
                  className={buttonClass({ variant: "quiet", className: "gap-2" })}
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                  더 보기
                </button>
              </div>
            ) : null}
          </>
        )}
      </Container>
    </div>
  );
}
