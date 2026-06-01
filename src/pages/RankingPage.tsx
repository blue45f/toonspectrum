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
      <header className="relative mb-8 overflow-hidden rounded-2xl border border-line bg-panel/55 p-6 surface-hl">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,oklch(0.72_0.185_42),oklch(0.82_0.16_82),oklch(0.76_0.16_280),oklch(0.72_0.185_42))]" />
        <p className="eyebrow text-accent">UNIFIED RANKING</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">통합 랭킹</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          플랫폼을 가로질러 한 줄로 세웁니다. 인기와 급상승은 API에서 실시간 소스를 받아
          보정하고, 완결·휴재 상태 신호까지 함께 확인합니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-fg-3">
          <span className="rounded-full border border-line bg-card px-2.5 py-1">축 변경 즉시 반영</span>
          <span className="rounded-full border border-line bg-card px-2.5 py-1">라이브 갱신 상태 실시간 표시</span>
          <span className="rounded-full border border-line bg-card px-2.5 py-1">플랫폼 교차 필터 지원</span>
        </div>
      </header>

      <RankingBoard initialAxis={axis} />

      <div className="mt-12">
        <RankingMethod />
      </div>
    </Container>
  );
}
