import { RANK_AXES, type RankAxis } from "@/lib/ranking";
import { Flag, Flame, FunctionSquare, Gem, Heart, Info, Sprout, Star, TrendingUp, Waves, type LucideIcon } from "lucide-react";

const AXIS_ICONS: Record<RankAxis, LucideIcon> = {
  popular: Flame,
  trending: TrendingUp,
  favorites: Heart,
  rating: Star,
  hidden: Gem,
  binge: Waves,
  completed: Flag,
  rookie: Sprout,
};

// 랭킹 선정 방식 — 전 축 산식 + 보정·기간·데이터 출처를 투명 공개
export function RankingMethod() {
  return (
    <section className="rounded-xl border border-line bg-panel/40 p-5 surface-hl sm:p-6">
      <div className="mb-5 flex items-center gap-2">
        <FunctionSquare size={18} className="text-accent" />
        <h2 className="text-lg font-bold tracking-tight">랭킹은 이렇게 정해집니다</h2>
        <span className="eyebrow ml-1 text-fg-3">METHODOLOGY</span>
      </div>

      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-fg-2">
        툰스펙트럼의 순위는 사람이 손으로 매기지 않습니다. 랭킹 화면은 <span className="text-fg">/api/ranking</span>에서
        매 요청마다 산식을 계산하고, 인기·급상승 축은 네이버·카카오 실시간 소스를 함께 반영합니다.
        외부 소스가 막히면 같은 API가 산식 기반 순위로 즉시 폴백합니다.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {RANK_AXES.map((a) => {
          const AxisIcon = AXIS_ICONS[a.key];
          return (
            <div key={a.key} className="rounded-xl border border-line bg-card p-4">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg border border-accent/30 bg-accent-soft text-accent">
                  <AxisIcon size={15} />
                </span>
                <span className="text-sm font-semibold text-fg">{a.label}</span>
              </div>
              <p className="mb-2 text-xs text-fg-3">{a.desc}</p>
              <code className="block rounded-md bg-canvas px-2.5 py-1.5 font-mono text-[0.72rem] leading-relaxed text-fg-2">
                {a.formula}
              </code>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-2.5 border-t border-line pt-5 text-xs leading-relaxed text-fg-3">
        <p className="flex gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-fg-2" />
          <span>
            <span className="font-medium text-fg-2">베이즈 평균 보정</span> — 평가 수가 적은 작품의 평점
            거품을 막기 위해 사전 평균(C=4.0)과 가중 표본(m=800)으로 보정합니다. 표본이 클수록 실제 평점에
            수렴합니다.
          </span>
        </p>
        <p className="flex gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-fg-2" />
          <span>
            <span className="font-medium text-fg-2">라이브 보정</span> — 일간·주간 인기/급상승 축은
            네이버웹툰과 카카오웹툰의 현재 순위 응답을 서버에서 가져와 로컬 작품 ID와 매칭합니다. 매칭되지
            않는 외부 작품은 별도 링크로 홈 라이브 보드에 남고, 통합 랭킹은 검증된 작품 DB 안에서만 정렬합니다.
          </span>
        </p>
        <p className="flex gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-warn/90" />
          <span>
            <span className="font-medium text-fg-2">신뢰도 점수</span> — 화면 상단의 confidence는
            실시간 소스 정상 여부, 로컬 DB 매칭률, 추정 지표 비중, 폴백 여부를 합산한 해석 보조 지표입니다.
            점수가 낮아도 순위는 표시하지만, 그 경우 화면에 폴백 이유와 소스 상태를 함께 노출합니다.
          </span>
        </p>
        <p className="flex gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-good/80" />
          <span>
            <span className="font-medium text-fg-2">데이터 출처</span> — 제목·작가·장르·시놉시스·표지와{" "}
            <span className="text-fg-2">네이버의 조회수·관심수·별점</span>은 네이버 웹툰/시리즈에서 실제
            수집한 데이터입니다. 카카오웹툰은 메타데이터·표지를 실수집하되 평점·조회는 추정이며, 평가 수·평점
            분포·완독률 등 비공개 지표도 추정값입니다. 순위는 위 산식으로 계산됩니다(베이즈 보정이 추정 평점의
            영향을 억제).
          </span>
        </p>
      </div>
    </section>
  );
}
