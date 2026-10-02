import { ChevronRight, ListFilter, Trophy } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import type { PlatformId } from "@/shared/lib/types";
import type { MouseEvent } from "react";

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
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { MotionIllustration } from "@/shared/motion-assets";

const SCOPE = "domains.catalog.RankingPage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);
const txEn = (source: string): string => translateCurrentStaticSourceText(SCOPE, "en", source);

export function RankingPage() {
  useBilingualI18nRevision();
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
              className={buttonClass({ size: "sm", className: "min-h-11 gap-1.5" })}
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

      <div className="mt-12">
        <RankingMethod />
      </div>
    </Container>
    </PageEntrance>
  );
}
