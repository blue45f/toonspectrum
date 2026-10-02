import { Calculator, ChevronRight, Compass, GitCompare, ListFilter, Trophy, type LucideIcon } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import type { PlatformId } from "@/shared/lib/types";
import type { MouseEvent } from "react";

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
import { RankingBoard } from "@/shared/components/ranking-board";
import { RankingMethod } from "@/shared/components/ranking-method";
import { Container } from "@/shared/components/section";
import { SharePageButton } from "@/shared/components/share-page-button";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { PLATFORM_LIST } from "@/shared/lib/platforms";
import { RANK_AXES, type RankAxis } from "@/shared/lib/ranking";
import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  useBilingual,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { MotionIllustration } from "@/shared/motion-assets";

const SCOPE = "domains.catalog.RankingPage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);
const txEn = (source: string): string => translateCurrentStaticSourceText(SCOPE, "en", source);

/** 랭킹을 보고 난 뒤 이어지는 다음 행동 — 막다른 화면이 되지 않게 탐색·비교·커뮤니티로 잇는다. */
const NEXT_STEPS: readonly { readonly href: string; readonly icon: LucideIcon; readonly title: readonly [string, string]; readonly body: readonly [string, string] }[] = [
  { href: "/explore", icon: Compass, title: ["조건으로 탐색", "Explore by filters"], body: ["장르·태그·상태로 후보를 좁혀요", "Narrow candidates by genre, tag and status"] },
  { href: "/compare", icon: GitCompare, title: ["두 작품 비교", "Compare two"], body: ["고민되는 두 작품의 지표를 나란히", "Put two stories' signals side by side"] },
  { href: "/community", icon: Trophy, title: ["작품 이야기 나누기", "Talk about stories"], body: ["순위 속 작품의 감상을 나눠요", "Share impressions of ranked stories"] },
];

export function RankingPage() {
  useBilingualI18nRevision();
  const bt = useBilingual("RankingPage");
  const [searchParams] = useSearchParams();
  const axis: RankAxis =
    RANK_AXES.find((entry) => entry.key === searchParams.get("axis"))?.key ?? "popular";
  // 축 key("popular")를 그대로 노출하지 않고 사람이 읽는 한글 라벨("실시간 인기")로 표시.
  const axisLabel = RANK_AXES.find((entry) => entry.key === axis)?.label ?? axis;
  const platformParam = searchParams.get("platform");
  const platformIds = new Set(PLATFORM_LIST.map((platform) => platform.id));
  const platform: PlatformId | "all" = platformIds.has(platformParam as PlatformId)
    ? (platformParam as PlatformId)
    : "all";

  const jumpToBoard = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById("ranking-board")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <PageEntrance variant="slide">
    <Container size="wide" className="py-6 sm:py-10">
      <SitePageHeader
        className="mb-6 sm:mb-8"
        icon={Trophy}
        eyebrow={txEn("UNIFIED RANKING")}
        title={tx("통합 랭킹")}
        description={tx("무엇을 볼지 고민될 때 가장 확실한 출발점. 인기·급상승·평점까지, 여덟 가지 관점으로 지금의 흐름을 바로 확인해 보세요.")}
        aside={
          <MotionIllustration
            name="trophy"
            size="xl"
            className="mx-auto text-accent"
            title={tx("통합 랭킹 트로피 일러스트")}
          />
        }
        asideClassName="hidden lg:flex lg:justify-end"
        actions={
          <>
            <a
              href="#ranking-board"
              onClick={jumpToBoard}
              className={buttonClass({ size: "sm", className: "hidden min-h-11 gap-1.5 sm:inline-flex" })}
            >
              <ChevronRight size={14} aria-hidden="true" />
              {tx("랭킹 시작점으로 이동")}
            </a>
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs text-fg-2">
              <ListFilter size={14} className="text-fg-3" aria-hidden="true" />
              {tx("현재 축:")} <span className="font-medium text-fg">{axisLabel}</span>
            </span>
            {/* 랭킹 공유 — OS 공유 시트 → 클립보드 폴백 */}
            <SharePageButton path="/ranking" text={tx("툰스튜디오 통합 랭킹")} label={tx("랭킹 공유")} />
          </>
        }
      />

      <section id="ranking-board">
        <RankingBoard initialAxis={axis} initialPlatform={platform} />
      </section>

      <nav className="mt-10 grid grid-cols-1 gap-2.5 sm:mt-12 md:grid-cols-3" aria-label={bt("랭킹 다음 행동", "After the ranking")}>
        {NEXT_STEPS.map((step) => (
          <SiteLinkCard key={step.href} layout="compact" href={step.href} icon={step.icon} title={bt(...step.title)} description={bt(...step.body)} />
        ))}
      </nav>

      <SiteDisclosure
        className="mt-6"
        icon={Calculator}
        title={bt("순위는 어떻게 계산하나요?", "How is the ranking calculated?")}
        summary={formatI18nTemplate(bt("{v0}가지 관점의 산식과 데이터 한계를 확인하세요.", "See the formulas behind the {v0} views and the data limits."), { v0: RANK_AXES.length })}
        bodyClassName="p-3 sm:p-4"
      >
        <RankingMethod />
      </SiteDisclosure>
    </Container>
    </PageEntrance>
  );
}
