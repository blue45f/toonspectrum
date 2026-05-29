import type { Metadata } from "next";
import { Container } from "@/components/section";
import { RankingBoard } from "@/components/ranking-board";
import { RankingMethod } from "@/components/ranking-method";
import { RANK_AXES, type RankAxis } from "@/lib/ranking";

export const metadata: Metadata = {
  title: "통합 랭킹",
  description: "6개 축으로 줄 세운 웹툰·웹소설 통합 랭킹. 투명한 산식과 함께.",
};

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ axis?: string }>;
}) {
  const sp = await searchParams;
  const axis: RankAxis =
    RANK_AXES.find((a) => a.key === sp.axis)?.key ?? "popular";

  return (
    <Container size="wide" className="py-10">
      <header className="mb-8">
        <p className="eyebrow text-accent">UNIFIED RANKING</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">통합 랭킹</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          플랫폼을 가로질러 한 줄로 세웁니다. 단순 조회수가 아니라 6개의 축으로, 그리고 각 순위가
          어떤 산식으로 매겨졌는지 투명하게 공개합니다.
        </p>
      </header>

      <RankingBoard initialAxis={axis} />

      <div className="mt-12">
        <RankingMethod />
      </div>
    </Container>
  );
}
