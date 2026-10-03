import { ChevronRight, Flame, Trophy, WandSparkles } from "lucide-react";
import type { ReactNode } from "react";

import { WorkCard, WorkGridSkeleton } from "./creator-community-ui";
import { buildStudioHref } from "./creator-studio-links";
import { pickFeaturedChallenge, trendingTagCounts } from "./publishing/showcase-featured-model";
import { showcaseChallengeHref, showcaseGalleryHref } from "./publishing/showcase-links";
import { ShowcaseRail } from "./publishing/ShowcaseRail";
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
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="eyebrow text-accent">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-bold text-fg">{title}</h2>
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

/** 이번 주 챌린지를 한 줄 배너로 — 주제·마감·참여작 수와 바로 참여 행동을 함께 둔다. */
function ChallengeBanner({ challenge }: { challenge: ChallengeSummary }) {
  const bt = useBilingual("CreateFeaturedSections");
  const dday = challengeDday(challenge.endsAt);
  return (
    <section
      aria-label={bt("이번 주 챌린지", "This week's challenge")}
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-accent/35 bg-accent-soft/50 p-4"
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-on-accent">
        <Trophy size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-accent">WEEKLY CHALLENGE</p>
        <p className="mt-0.5 truncate text-base font-bold text-fg">{challenge.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-2">
          {challenge.theme ? <span className="line-clamp-1">{challenge.theme}</span> : null}
          <span>
            {bt("참여작", "Entries")} <span className="numeral font-semibold text-fg">{challenge.entries}</span>
          </span>
          {dday != null && dday >= 0 ? (
            <span
              className={cn(
                "numeral rounded-full border px-2 py-0.5 font-semibold",
                dday <= URGENT_DDAY ? "border-warn/40 bg-warn/10 text-warn" : "border-line bg-raised text-fg-2",
              )}
            >
              {dday === 0 ? bt("오늘 마감", "Ends today") : `D-${dday}`}
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={showcaseChallengeHref(challenge.slug)} className={buttonClass({ size: "sm", variant: "outline", className: "min-h-11" })}>
          {bt("참여작 보기", "View entries")}
        </Link>
        <Link href={buildStudioHref({ challengeId: challenge.id })} className={buttonClass({ size: "sm", variant: "solid", className: "min-h-11 gap-1.5" })}>
          <Trophy size={14} aria-hidden />
          {bt("바로 참여하기", "Join now")}
        </Link>
      </div>
    </section>
  );
}

const VIEW_ALL = "inline-flex min-h-11 items-center gap-0.5 rounded-lg px-1 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function CreateFeaturedSections() {
  const bt = useBilingual("CreateFeaturedSections");
  const featured = useShowcaseResource<FeaturedData>(
    "featured",
    loadFeatured,
    bt("추천 작품을 불러오지 못했습니다.", "Couldn't load featured works."),
  );

  if (featured.status === "loading" || featured.status === "idle") {
    return (
      <div className="mb-6" aria-hidden>
        <span className="skeleton mb-3 block h-5 w-48" />
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

  return (
    <div className="mb-8 space-y-6">
      {challenge ? <ChallengeBanner challenge={challenge} /> : null}

      {popular.length > 0 ? (
        <SectionShell
          eyebrow="CREATOR PICKS"
          title={bt("이번 주 인기 창작물", "Popular this week")}
          action={
            <Link href={showcaseGalleryHref({ sort: "likes" })} className={VIEW_ALL}>
              {bt("전체 보기", "View all")}
              <ChevronRight size={15} aria-hidden />
            </Link>
          }
        >
          <ShowcaseRail
            label={bt("인기 창작물", "Popular works")}
            items={popular}
            itemKey={(work) => work.id}
            renderItem={(work) => <WorkCard work={work} />}
            gridClassName="sm:grid-cols-3 lg:grid-cols-5"
          />
        </SectionShell>
      ) : null}

      {trendingTags.length > 0 ? (
        <SectionShell eyebrow="TAG DISCOVERY" title={bt("요즘 많이 쓰는 태그", "Trending tags")}>
          <ShowcaseRail
            label={bt("인기 태그", "Trending tags")}
            items={trendingTags}
            itemKey={([tag]) => tag}
            itemClassName="w-auto"
            gridClassName="sm:flex sm:flex-wrap"
            renderItem={([tag, count]) => (
              <Link
                href={showcaseGalleryHref({ tag })}
                aria-label={formatI18nTemplate(bt("#{tag} 태그 작품 {count}개 보기", "View {count} works tagged #{tag}"), { tag, count })}
                className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-card px-3 text-sm text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
              >
                <Flame size={13} aria-hidden className="text-warn" />#{tag}
                <span className="numeral text-xs text-fg-3">{count}</span>
              </Link>
            )}
          />
        </SectionShell>
      ) : null}

      {remixWorks.length > 0 ? (
        <SectionShell
          eyebrow="REMIX LINEAGE"
          title={bt("리믹스로 이어지는 창작", "Creations continued by remix")}
          action={
            <span className="inline-flex items-center gap-1 text-xs text-fg-2">
              <WandSparkles size={13} aria-hidden className="text-accent" />
              {bt("작품 상세에서 ‘리믹스’로 참여", "Join from a work's ‘Remix’ action")}
            </span>
          }
        >
          <ShowcaseRail
            label={bt("리믹스 작품", "Remix works")}
            items={remixWorks}
            itemKey={(work) => work.id}
            renderItem={(work) => <WorkCard work={work} />}
            gridClassName="sm:grid-cols-4"
          />
        </SectionShell>
      ) : null}
    </div>
  );
}
