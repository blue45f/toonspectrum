import { ArrowLeftRight, Clapperboard, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  TIMELAPSE_CLIP_SORT_OPTIONS,
  TimelapseClipCard,
  parseTimelapseClipSort,
  sortTimelapseClips,
  useTimelapseShareStore,
  visibleTimelapseClips,
} from "@/domains/creator/public/timelapse";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useGuestSession } from "@/domains/auth/public/session/guest-session";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const SCOPE = "domains.community.TimelapseGalleryPage";

/**
 * 타임랩스 갤러리 — 클립 목록(썸네일 그리드). 게스트-퍼스트: 로그인 없이 볼 수 있다.
 * 현재는 브라우저 로컬 클립을 보여주고, 서버 어댑터가 등록되면 같은 페이지에서
 * 서버 클립과 합쳐 보여준다(`useTimelapseShareStore`의 serverAdapter 훅).
 */
export function TimelapseGalleryPage() {
  const b = useBilingual(SCOPE);
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = parseTimelapseClipSort(searchParams.get("sort"));
  const mineOnly = searchParams.get("mine") === "1";
  const [query, setQuery] = useState("");

  const clips = useTimelapseShareStore((s) => s.clips);
  const { status, data } = useSession();
  const { guest } = useGuestSession();

  const ownerIds = useMemo(() => {
    const ids: string[] = [];
    if (status === "authenticated" && data?.user?.id) ids.push(`user:${data.user.id}`);
    if (guest) ids.push(`guest:${guest.id}`);
    return ids;
  }, [status, data, guest]);

  const shown = useMemo(() => {
    const visible = visibleTimelapseClips(clips, { ownerIds });
    const pool = mineOnly ? visible.filter((clip) => ownerIds.includes(clip.ownerKey)) : visible;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? pool.filter(
          (clip) =>
            clip.title.toLowerCase().includes(q) ||
            clip.description.toLowerCase().includes(q) ||
            clip.authorName.toLowerCase().includes(q),
        )
      : pool;
    return sortTimelapseClips(filtered, sort);
  }, [clips, ownerIds, mineOnly, query, sort]);

  function updateParam(key: "sort" | "mine", value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  return (
    <Container>
      <SitePageHeader
        eyebrow={b("타임랩스", "Timelapse")}
        icon={Clapperboard}
        title={b("타임랩스 갤러리", "Timelapse gallery")}
        description={b(
          "창작자들이 남긴 그리기 과정을 짧은 영상으로 감상하세요. 로그인이 필요 없어요.",
          "Watch creators' drawing processes as short clips. No sign-in needed.",
        )}
        actions={
          <Link
            href="/studio"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-accent/60 bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Plus size={14} aria-hidden />
            {b("내 타임랩스 만들기", "Make my timelapse")}
          </Link>
        }
        aside={
          <img
            src="/images/hero-studio.webp"
            alt={b("작업 중인 스튜디오 일러스트", "Illustration of a studio at work")}
            loading="lazy"
            decoding="async"
            className="aspect-[4/3] w-full rounded-2xl object-cover"
          />
        }
        asideClassName="hidden lg:block"
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg-2">
            <ArrowLeftRight size={13} aria-hidden />
            <span className="sr-only">{b("정렬", "Sort")}</span>
            <select
              value={sort}
              onChange={(e) => updateParam("sort", e.target.value)}
              className="bg-transparent text-fg outline-none"
              aria-label={b("정렬", "Sort")}
            >
              {TIMELAPSE_CLIP_SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {b(option.ko, option.en)}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg-2">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => updateParam("mine", e.target.checked ? "1" : null)}
              className="size-4 accent-[var(--color-accent)]"
            />
            {b("내 클립만", "My clips only")}
          </label>
          <label className="inline-flex min-w-0 flex-1 items-center sm:max-w-64">
            <span className="sr-only">{b("클립 검색", "Search clips")}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={b("제목·설명·작성자로 검색", "Search title, description, author")}
              className="h-9 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent/50"
            />
          </label>
        </div>
      </SitePageHeader>

      <section aria-labelledby="timelapse-results-title" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="timelapse-results-title" className="text-lg font-semibold text-fg">
            {mineOnly ? b("내 클립", "My clips") : b("공유된 클립", "Shared clips")}
          </h2>
          <p className="text-sm text-fg-2" aria-live="polite">
            {b(`총 ${shown.length}개`, `${shown.length} total`)}
          </p>
        </div>

        {shown.length === 0 ? (
          <ActionableEmptyState
            icon={Clapperboard}
            title={
              mineOnly
                ? b("아직 내 클립이 없어요", "No clips of yours yet")
                : b("아직 공유된 클립이 없어요", "No shared clips yet")
            }
            description={b(
              "스튜디오에서 타임랩스를 녹화하고 한 번의 클릭으로 공유해보세요.",
              "Record a timelapse in the studio and share it with a single click.",
            )}
            primary={{ href: "/studio", label: b("스튜디오로 가기", "Go to studio") }}
            className="mt-6"
          />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {shown.map((clip) => (
              <TimelapseClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        )}
      </section>
    </Container>
  );
}
