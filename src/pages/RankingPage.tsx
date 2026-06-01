import { useSearchParams } from "react-router-dom";
import { Container } from "@/components/section";
import { RankingBoard } from "@/components/ranking-board";
import { RankingMethod } from "@/components/ranking-method";
import { RANK_AXES, type RankAxis } from "@/lib/ranking";

export function RankingPage() {
  const [searchParams] = useSearchParams();
  const axis: RankAxis =
    RANK_AXES.find((entry) => entry.key === searchParams.get("axis"))?.key ?? "popular";

  return (
    <Container size="wide" className="py-10">
      <header className="mb-8">
        <p className="eyebrow text-accent">UNIFIED RANKING</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">통합 랭킹</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          플랫폼을 가로질러 한 줄로 세웁니다. 인기와 급상승은 API에서 실시간 소스를 받아
          보정하고, 완결·휴재 상태 신호까지 함께 확인합니다.
        </p>
      </header>

      <RankingBoard initialAxis={axis} />

      <div className="mt-12">
        <RankingMethod />
      </div>
    </Container>
  );
}
