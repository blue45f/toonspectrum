import { RANK_AXES } from "@/lib/ranking";
import { FunctionSquare, Info } from "lucide-react";

// 랭킹 선정 방식 — 전 축 산식 + 보정·기간·데이터 출처를 투명 공개
export function RankingMethod() {
  return (
    <section className="rounded-2xl border border-line bg-panel/40 p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-2">
        <FunctionSquare size={18} className="text-accent" />
        <h2 className="text-lg font-bold tracking-tight">랭킹은 이렇게 정해집니다</h2>
        <span className="eyebrow ml-1 text-fg-3">METHODOLOGY</span>
      </div>

      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-fg-2">
        WEBDEX의 순위는 사람이 손으로 매기지 않습니다. 각 작품의 지표(조회·좋아요·관심·평점·완독률 등)를
        아래 산식에 넣어 <span className="text-fg">실시간으로 계산</span>하고 정렬합니다. 산식을 바꾸면 순위도
        즉시 바뀝니다.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {RANK_AXES.map((a) => (
          <div key={a.key} className="rounded-xl border border-line bg-card p-4">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-base">{a.emoji}</span>
              <span className="text-sm font-semibold text-fg">{a.label}</span>
            </div>
            <p className="mb-2 text-xs text-fg-3">{a.desc}</p>
            <code className="block rounded-md bg-canvas px-2.5 py-1.5 font-mono text-[0.72rem] leading-relaxed text-fg-2">
              {a.formula}
            </code>
          </div>
        ))}
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
            <span className="font-medium text-fg-2">기간(일·주·월)</span> — 본 데모에서는 실시간 수집
            데이터 대신 작품별 결정적 가중치로 기간 변동을 시뮬레이션합니다.
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
