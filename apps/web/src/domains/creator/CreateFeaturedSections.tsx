import { Boxes, Flame, PenLine, Trophy, Upload, WandSparkles, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { WorkCard, WorkGridSkeleton } from "./creator-community-ui";
import { buildStudioHref } from "./creator-studio-links";
import { pickFeaturedChallenge, trendingTagCounts } from "./publishing/showcase-featured-model";
import { showcaseChallengeHref, showcaseGalleryHref } from "./publishing/showcase-links";
import { useShowcaseResource } from "./publishing/use-showcase-resource";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import {
  challengeDday,
  listChallenges,
  listWorks,
  type ChallengeSummary,
  type WorkSummary,
} from "@/platform/creator-client";

const POPULAR_LIMIT = 5;
const RECENT_LIMIT = 12;
const REMIX_LIMIT = 4;
const URGENT_DDAY = 3;

interface FeaturedData {
  readonly popular: readonly WorkSummary[];
  readonly recent: readonly WorkSummary[];
  readonly challenge: ChallengeSummary | null;
}

function SectionShell({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-panel/30 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-bold text-fg">{title}</h2>
          {description ? <p className="mt-1 text-xs leading-relaxed text-fg-2">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

async function loadFeatured(signal: AbortSignal): Promise<FeaturedData> {
  // 한 요청이 실패해도 나머지 섹션은 보여 준다(Promise.all 이면 하나의 실패가 전체를 숨긴다).
  const [liked, recent, challenges] = await Promise.allSettled([
    listWorks({ sort: "likes" }, signal),
    listWorks({ sort: "recent" }, signal),
    listChallenges(signal),
  ]);
  if (liked.status === "rejected" && recent.status === "rejected" && challenges.status === "rejected") {
    throw liked.reason;
  }
  return {
    popular: liked.status === "fulfilled" ? liked.value.slice(0, POPULAR_LIMIT) : [],
    recent: recent.status === "fulfilled" ? recent.value.slice(0, RECENT_LIMIT) : [],
    challenge: challenges.status === "fulfilled" ? pickFeaturedChallenge(challenges.value) : null,
  };
}

function QuickStartLink({ href, icon: Icon, title, description }: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center gap-3 rounded-xl border border-line bg-card/60 px-4 py-3 transition-colors hover:border-accent/45 hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
        <Icon size={18} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="mt-0.5 block text-xs text-fg-2">{description}</span>
      </span>
    </Link>
  );
}

export function CreateFeaturedSections() {
  const bt = useBilingual("CreateFeaturedSections");
  const featured = useShowcaseResource<FeaturedData>(
    "featured",
    loadFeatured,
    bt("추천 작품을 불러오지 못했습니다.", "Couldn't load featured works."),
  );

  if (featured.status === "loading" || featured.status === "idle") {
    return (
      <div className="mb-6 rounded-2xl border border-line bg-panel/30 p-4 sm:p-5" aria-hidden>
        <span className="skeleton mb-4 block h-5 w-48" />
        <WorkGridSkeleton count={POPULAR_LIMIT} />
      </div>
    );
  }
  // 목록 자체의 연결 상태는 아래 작품 목록이 안내한다. 추천 영역은 조용히 비워 중복 경고를 피한다.
  if (featured.status === "error") return null;

  const { popular, recent, challenge } = featured.data;
  const trendingTags = trendingTagCounts(recent);
  const remixWorks = recent.filter((work) => work.remixFromId).slice(0, REMIX_LIMIT);
  if (popular.length === 0 && !challenge && trendingTags.length === 0) return null;

  const challengeDdayLabel = challenge ? challengeDday(challenge.endsAt) : null;

  return (
    <div className="mb-6 space-y-4">
      {challenge ? (
        <SectionShell
          eyebrow="WEEKLY CHALLENGE"
          title={challenge.title}
          description={challenge.theme}
          action={
            <Link
              href={buildStudioHref({ challengeId: challenge.id })}
              className={buttonClass({ size: "sm", variant: "solid", className: "gap-1.5" })}
            >
              <Trophy size={14} aria-hidden />
              {bt("바로 참여하기", "Join now")}
            </Link>
          }
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent-soft px-2.5 py-1 text-fg">
              <Trophy size={12} aria-hidden className="text-accent" />
              {bt("참여작", "Entries")} <span className="numeral font-semibold">{challenge.entries}</span>
            </span>
            {challengeDdayLabel != null && challengeDdayLabel >= 0 ? (
              <span
                className={cn(
                  "numeral inline-flex items-center rounded-full border px-2.5 py-1 font-semibold",
                  challengeDdayLabel <= URGENT_DDAY ? "border-warn/35 bg-warn/10 text-warn" : "border-line bg-raised text-fg-2",
                )}
              >
                {challengeDdayLabel === 0 ? bt("오늘 마감", "Ends today") : `D-${challengeDdayLabel}`}
              </span>
            ) : null}
            <Link
              href={showcaseChallengeHref(challenge.slug)}
              className="ml-auto inline-flex min-h-11 items-center text-accent underline-offset-4 hover:underline"
            >
              {bt("참여작 보기", "View entries")}
            </Link>
          </div>
        </SectionShell>
      ) : null}

      {popular.length > 0 ? (
        <SectionShell
          eyebrow="CREATOR PICKS"
          title={bt("이번 주 인기 창작물", "Popular this week")}
          description={bt("좋아요가 많은 작품을 모았습니다.", "Works with the most likes.")}
          action={
            <Link href={showcaseGalleryHref({ sort: "likes" })} className={buttonClass({ size: "sm", variant: "outline" })}>
              {bt("전체 보기", "View all")}
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {popular.map((work) => (
              <WorkCard key={work.id} work={work} />
            ))}
          </div>
        </SectionShell>
      ) : null}

      {trendingTags.length > 0 ? (
        <SectionShell
          eyebrow="TAG DISCOVERY"
          title={bt("요즘 많이 쓰는 태그", "Trending tags")}
          description={bt("태그를 눌러 비슷한 분위기의 창작물을 찾아보세요.", "Tap a tag to find works with a similar mood.")}
        >
          <div className="flex flex-wrap gap-2">
            {trendingTags.map(([tag, count]) => (
              <Link
                key={tag}
                href={showcaseGalleryHref({ tag })}
                aria-label={formatI18nTemplate(bt("#{tag} 태그 작품 {count}개 보기", "View {count} works tagged #{tag}"), { tag, count })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
              >
                <Flame size={13} aria-hidden className="text-warn" />#{tag}
                <span className="numeral text-xs text-fg-3">{count}</span>
              </Link>
            ))}
          </div>
        </SectionShell>
      ) : null}

      {remixWorks.length > 0 ? (
        <SectionShell
          eyebrow="REMIX LINEAGE"
          title={bt("리믹스로 이어지는 창작", "Creations continued by remix")}
          description={bt("다른 작품을 이어받아 새롭게 그린 작품들입니다.", "Works that build on another creator's piece.")}
          action={
            <span className="inline-flex items-center gap-1 text-xs text-fg-2">
              <WandSparkles size={13} aria-hidden className="text-accent" />
              {bt("작품 상세에서 ‘리믹스’로 참여", "Join from a work's ‘Remix’ action")}
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {remixWorks.map((work) => (
              <WorkCard key={work.id} work={work} />
            ))}
          </div>
        </SectionShell>
      ) : null}

      <SectionShell
        eyebrow="QUICK START"
        title={bt("오늘 바로 시작하기", "Start today")}
        description={bt("그리기가 부담스럽다면 이미지 업로드, 컷 구성이 필요하면 스튜디오로.", "Upload finished images, or open the Studio to compose panels.")}
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <QuickStartLink
            href={buildStudioHref({ mode: "upload" })}
            icon={Upload}
            title={bt("이미지 업로드 게시", "Publish by upload")}
            description={bt("완성 이미지를 순서대로 올리기", "Upload finished images in order")}
          />
          <QuickStartLink
            href="/studio"
            icon={PenLine}
            title={bt("컷툰 스튜디오", "Cut-toon Studio")}
            description={bt("템플릿·말풍선·VRM으로 제작", "Create with templates, balloons and VRM")}
          />
          <QuickStartLink
            href="/studio/lift3d"
            icon={Boxes}
            title={bt("2D → 3D 변환", "2D → 3D")}
            description={bt("원화를 3D 모델·배경으로 세우기", "Turn artwork into 3D models and sets")}
          />
        </div>
      </SectionShell>
    </div>
  );
}
