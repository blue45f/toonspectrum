import { useSearchParams } from "react-router-dom";
import { Container } from "@/components/section";
import { RankingBoard } from "@/components/ranking-board";
import { RankingMethod } from "@/components/ranking-method";
import { RANK_AXES, type RankAxis } from "@/lib/ranking";
import { PLATFORM_LIST } from "@/lib/platforms";
import type { PlatformId } from "@/lib/types";
import { ChevronRight, ListFilter } from "lucide-react";
import type { MouseEvent } from "react";

export function RankingPage() {
  const [searchParams] = useSearchParams();
  const axis: RankAxis =
    RANK_AXES.find((entry) => entry.key === searchParams.get("axis"))?.key ?? "popular";
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
    <Container size="wide" className="py-10">
      <header className="mb-8 rounded-2xl border border-line bg-panel/55 p-5 sm:p-6">
        <p className="eyebrow text-accent">UNIFIED RANKING</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">통합 랭킹</h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-fg-2">
          공개 신호, 라이브 보정, 투명 산식을 함께 반영해 지금 볼 작품을 고릅니다.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <a
            href="#ranking-board"
            onClick={jumpToBoard}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs text-fg-3 transition-colors hover:border-accent/55 hover:text-fg"
          >
            <ChevronRight size={14} />
            랭킹 시작점으로 이동
          </a>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1.5 text-xs text-fg-3">
            <ListFilter size={14} />
            현재 축: {axis}
          </span>
        </div>
      </header>

      <section id="ranking-board">
        <RankingBoard initialAxis={axis} initialPlatform={platform} />
      </section>

      <div className="mt-12">
        <RankingMethod />
      </div>
    </Container>
  );
}
