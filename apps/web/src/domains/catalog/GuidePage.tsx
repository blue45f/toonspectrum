import { Scale, Sigma, Gauge, ShieldCheck, ArrowRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { PlatformId } from "@/shared/lib/types";

import { Container } from "@/shared/components/section";
import { VisualStepGuide, type VisualStepGuideStep } from "@/shared/components/VisualStepGuide";
import { PLATFORMS } from "@/shared/lib/platforms";
import { RANK_AXES, PLATFORM_REACH_WEIGHT } from "@/shared/lib/ranking";
import Link from "@/shared/navigation/router-link";



// 랭킹 산정 방식 공개 페이지(/guide) — 투명 산식을 사람이 읽을 수 있게 풀어 설명한다.
// 산식·도달가중·축 목록은 lib/ranking.ts 의 단일 출처를 그대로 읽어와 코드와 어긋나지 않게 한다.

/** 도식 다이어그램용 SVG 공통 값 */
const INK = "var(--color-fg-2)";
const ACCENT = "var(--color-accent)";

function BayesDiagram() {
  return (
    <svg viewBox="0 0 320 150" role="img" aria-label="베이즈 평점 보정 도식: 평가가 적을수록 사전 평균 쪽으로 끌어당겨진다" className="block h-auto w-full">
      <defs>
        <marker id="bayes-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill={ACCENT} />
        </marker>
      </defs>
      {/* 사전 평균 */}
      <line x1="160" y1="18" x2="160" y2="122" stroke={ACCENT} strokeDasharray="5 4" strokeWidth="1.5" opacity="0.7" />
      <text x="160" y="14" textAnchor="middle" fontSize="11" fill={ACCENT}>사전 평균 4.0</text>
      {/* 축 */}
      <line x1="24" y1="122" x2="296" y2="122" stroke={INK} strokeWidth="1.5" />
      {[3, 4, 5].map((v) => {
        const x = 24 + ((v - 3) / 2) * 272;
        return (
          <g key={v}>
            <line x1={x} y1="122" x2={x} y2="128" stroke={INK} strokeWidth="1.5" />
            <text x={x} y="141" textAnchor="middle" fontSize="11" fill={INK}>{v}.0</text>
          </g>
        );
      })}
      {/* 평가 3개 · 5.0 → 4.15로 보정 */}
      <circle cx="296" cy="88" r="6" fill={ACCENT} />
      <text x="296" y="76" textAnchor="end" fontSize="11" fill={INK}>평가 3개 · ★5.0</text>
      <path d="M 288 84 Q 234 44 190 80" fill="none" stroke={ACCENT} strokeWidth="1.8" strokeDasharray="4 3" markerEnd="url(#bayes-arrow)" />
      <circle cx="180" cy="88" r="5" fill="none" stroke={ACCENT} strokeWidth="2" />
      <text x="180" y="110" textAnchor="middle" fontSize="11" fill={INK}>→ 4.15로 보정</text>
      {/* 평가 1만 개 · 4.6 → 그대로 */}
      <circle cx="242" cy="52" r="6" fill={INK} opacity="0.75" />
      <text x="242" y="40" textAnchor="middle" fontSize="11" fill={INK}>평가 1만 개 · ★4.6</text>
      <text x="242" y="70" textAnchor="middle" fontSize="11" fill={ACCENT}>그대로 유지</text>
    </svg>
  );
}

function PercentileDiagram() {
  return (
    <svg viewBox="0 0 320 150" role="img" aria-label="인기 백분위 도식: 지수 감쇠로 최상위권만 점수가 또렷해진다" className="block h-auto w-full">
      <rect x="252" y="18" width="44" height="104" fill={ACCENT} opacity="0.1" />
      <text x="274" y="34" textAnchor="middle" fontSize="11" fill={ACCENT}>상위권만</text>
      <text x="274" y="48" textAnchor="middle" fontSize="11" fill={ACCENT}>또렷하게</text>
      <line x1="24" y1="122" x2="296" y2="122" stroke={INK} strokeWidth="1.5" />
      <line x1="24" y1="122" x2="24" y2="18" stroke={INK} strokeWidth="1.5" />
      <text x="160" y="141" textAnchor="middle" fontSize="11" fill={INK}>플랫폼 내 인기 백분위 →</text>
      <text x="12" y="70" textAnchor="middle" fontSize="11" fill={INK} transform="rotate(-90 12 70)">점수</text>
      <path d="M 24 119 C 140 117, 205 112, 248 84 S 288 30, 294 22" fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
      <text x="120" y="105" fontSize="11" fill={INK}>하위권은 점수 차이 거의 없음</text>
    </svg>
  );
}

function ReachDiagram() {
  return (
    <div role="img" aria-label="도달 가중 도식: 네이버 웹툰 1위는 가중 1.00, 레진코믹스 1위는 0.62" className="space-y-3">
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-fg">네이버 웹툰 1위</span>
          <span className="numeral text-fg-2">×1.00</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-line/50">
          <div className="h-full rounded-full bg-accent" style={{ width: "100%" }} />
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-fg">레진코믹스 1위</span>
          <span className="numeral text-fg-2">×0.62</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-line/50">
          <div className="h-full rounded-full bg-accent/55" style={{ width: "62%" }} />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-fg-3">같은 &lsquo;플랫폼 1위&rsquo;라도 종합 점수는 도달 규모만큼 달라집니다.</p>
    </div>
  );
}

function TrustDiagram() {
  return (
    <div role="img" aria-label="신뢰 계수 도식: 실데이터는 1.05, 추정 지표는 0.79를 곱한다" className="flex items-end justify-center gap-10">
      <div className="flex flex-col items-center gap-1.5">
        <span className="numeral text-sm font-bold text-fg">×1.05</span>
        <div className="w-14 rounded-t-lg bg-accent" style={{ height: "6rem" }} />
        <span className="text-xs text-fg-2">실데이터</span>
      </div>
      <div className="flex flex-col items-center gap-1.5 opacity-70">
        <span className="numeral text-sm font-bold text-fg">×0.79</span>
        <div className="w-14 rounded-t-lg bg-fg-3" style={{ height: "4.5rem" }} />
        <span className="text-xs text-fg-2">추정 지표</span>
      </div>
    </div>
  );
}

/** 단계 도식 + 산식 펼치기 — 다이어그램을 먼저 보여주고 산식은 details 로 접어둔다. */
function PillarFigure({
  icon: Icon,
  sub,
  diagram,
  formula,
}: {
  icon: LucideIcon;
  sub: string;
  diagram: ReactNode;
  formula: string;
}) {
  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-line/70 bg-card/60">
      <figcaption className="flex items-center gap-2 border-b border-line/60 px-4 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="text-xs font-medium text-fg-3">{sub}</span>
      </figcaption>
      <div className="p-4">{diagram}</div>
      <details className="border-t border-line/60 px-4">
        <summary className="cursor-pointer py-2.5 text-xs font-medium text-fg-3 transition-colors hover:text-accent">
          산식 보기
        </summary>
        <code className="mb-3 block rounded-lg bg-raised px-3 py-2 text-xs leading-relaxed text-fg-2">
          {formula}
        </code>
      </details>
    </figure>
  );
}

const PILLARS: {
  icon: LucideIcon;
  title: string;
  sub: string;
  body: string;
  diagram: ReactNode;
  formula: string;
}[] = [
  {
    icon: Scale,
    title: "베이즈 평점",
    sub: "적은 표본 보정",
    body: "평가 3개의 5.0점과 평가 1만 개의 4.6점, 어느 쪽을 믿어야 할까요? 평가가 적을수록 전체 평균 쪽으로 끌어당겨 보정하고, 평가가 쌓일수록 작품의 실제 점수에 가까워집니다.",
    diagram: <BayesDiagram />,
    formula: "bayes = (C×m + 평균평점×평가수) / (m + 평가수) — C·m은 카탈로그 분포에서 유도",
  },
  {
    icon: Sigma,
    title: "인기 백분위",
    sub: "플랫폼 안에서 먼저 줄 세우기",
    body: "플랫폼마다 조회수의 단위가 달라 직접 비교는 불공평합니다. 각 플랫폼 안에서의 인기 순위를 먼저 매긴 뒤, 최상위권만 또렷하게 부각합니다.",
    diagram: <PercentileDiagram />,
    formula: "popComp = 100 × exp((백분위−100)/2.5) × 도달가중 × 신뢰계수",
  },
  {
    icon: Gauge,
    title: "도달 가중",
    sub: "플랫폼 트래픽 규모",
    body: "같은 '플랫폼 1위'라도 실제 도달(트래픽 규모)은 다릅니다. 플랫폼 규모를 곱해 메이저와 소형의 격차를 분명히 둡니다.",
    diagram: <ReachDiagram />,
    formula: "도달가중 = 작품이 연재되는 플랫폼들 중 최댓값",
  },
  {
    icon: ShieldCheck,
    title: "신뢰 계수",
    sub: "실데이터는 확신 있게",
    body: "실제로 수집한 값은 확신 있게, 추정으로 채운 값은 살짝 낮게 반영합니다. 추정 지표가 실데이터 작품을 1위에서 밀어내지 못하게 하는 안전장치입니다.",
    diagram: <TrustDiagram />,
    formula: "실데이터 1.00~1.06 · 순수 추정 0.78~0.80",
  },
];

function reachTier(w: number): string {
  if (w >= 0.9) return "메이저";
  if (w >= 0.7) return "대형";
  if (w >= 0.5) return "중형";
  return "전문·소형";
}

export function GuidePage() {
  // 도달 가중 표 — lib/ranking.ts 의 값을 그대로 읽어 내림차순 정렬.
  const reachRows = (Object.entries(PLATFORM_REACH_WEIGHT) as [PlatformId, number][])
    .map(([id, w]) => ({ id, w, p: PLATFORMS[id] }))
    .filter((r) => r.p)
    .sort((a, b) => b.w - a.w);

  return (
    <Container size="prose" className="py-10 sm:py-14">
      {/* 헤더 */}
      <header>
        <p className="eyebrow text-accent">투명 산식 · OPEN FORMULA</p>
        <h1 className="mt-2 text-pretty font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          랭킹은 이렇게 매겨집니다
        </h1>
        <p className="mt-3 text-base leading-relaxed text-fg-2">
          툰스튜디오의 모든 순위는 사람이 손으로 고르지 않습니다. 공개된 산식으로만 계산하고, 그 산식을
          이 페이지에 그대로 적어둡니다. 어떤 작품이 왜 그 자리에 있는지 직접 검산할 수 있어야
          한다고 믿기 때문입니다.
        </p>
      </header>

      {/* 정직성 원칙 */}
      <section className="mt-8 rounded-2xl border border-line bg-panel/40 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-fg">
          <span className="numeral text-accent">01</span> 실데이터와 추정값을 섞지 않습니다
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-fg-2">
          네이버 웹툰의 <strong className="text-fg">별점은 실제 수집값</strong>입니다. 다만 네이버가
          조회·관심 집계를 비공개로 전환하면서, 조회수·관심수 등 일부 보조 지표는{" "}
          <strong className="text-fg">추정값(≈)</strong>으로 표기합니다. 다른 플랫폼의 평점·조회·완독률
          중 일부도 마찬가지입니다. 추정값은 화면 어디서나 <code className="rounded bg-raised px-1 py-0.5 text-[0.8em] text-fg-2">≈</code>{" "}
          기호로 분명히 구분하고, 위의 <strong className="text-fg">신뢰 계수</strong>로 순위 영향력도 낮춥니다.
          가격·조회수를 부풀려 표시하지 않습니다.
        </p>
      </section>

      {/* 4가지 핵심 장치 — VisualStepGuide 도식 다이어그램으로 전환 */}
      <VisualStepGuide
        className="mt-10"
        eyebrow="HOW IT WORKS"
        heading="순위를 떠받치는 4가지 장치"
        steps={
          PILLARS.map(
            (p): VisualStepGuideStep => ({
              title: p.title,
              body: p.body,
              illustration: (
                <PillarFigure icon={p.icon} sub={p.sub} diagram={p.diagram} formula={p.formula} />
              ),
            }),
          )
        }
      />
      <p className="mt-4 text-sm leading-relaxed text-fg-3">
        모든 축은 위 네 가지를 조합해 만들어집니다. 정확한 계산식은 각 단계의 &lsquo;산식 보기&rsquo;에서
        확인할 수 있습니다.
      </p>

      {/* 도달 가중 표 */}
      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight text-fg">플랫폼 도달 가중</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-2">
          작품이 연재되는 플랫폼들 중 가장 큰 값을 씁니다. 인기·급상승 점수에 곱으로 들어갑니다.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line">
          {reachRows.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${i % 2 ? "bg-card/20" : "bg-transparent"}`}
            >
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: r.p.color }} />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.p.name}</span>
              <span className="shrink-0 text-xs text-fg-3">{reachTier(r.w)}</span>
              <span className="numeral w-12 shrink-0 text-right text-sm tabular-nums text-fg-2">
                ×{r.w.toFixed(2)}
              </span>
              <span aria-hidden className="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-line sm:block">
                <span className="block h-full rounded-full bg-accent/70" style={{ width: `${r.w * 100}%` }} />
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 8개 랭킹 축 */}
      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight text-fg">8개 랭킹 축</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-2">
          하나의 점수로 줄 세우면 시야가 좁아집니다. 보는 관점마다 다른 축을 둡니다.
        </p>
        <ol className="mt-4 flex flex-col gap-2.5">
          {RANK_AXES.map((a, i) => (
            <li key={a.key} className="rounded-2xl border border-line bg-card/30 p-4">
              <div className="flex items-baseline gap-2.5">
                <span className="numeral text-sm text-fg-3">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-bold text-fg">{a.label}</h3>
                <span className="text-[0.78rem] text-fg-3">{a.desc}</span>
              </div>
              <code className="mt-2 block rounded-lg border border-line/70 bg-raised px-3 py-2 text-xs leading-relaxed text-fg-2">
                {a.formula}
              </code>
            </li>
          ))}
        </ol>
      </section>

      {/* 워크드 예시 — 막대 비교 일러스트 */}
      <section className="mt-10 rounded-2xl border border-line bg-panel/40 p-5 sm:p-6">
        <h2 className="text-lg font-bold text-fg">예: 왜 종합 1위가 군소 플랫폼 작품이 아닌가</h2>
        <p className="mt-2.5 text-sm leading-relaxed text-fg-2">
          각 플랫폼의 1위는 모두 인기 백분위 100에 가깝습니다. 백분위만 보면 전부 동점이라, 추정
          지표가 큰 군소 플랫폼 작품이 우연히 종합 1위에 오를 수 있습니다. 도달 가중과 신뢰 계수를
          곱으로 적용하면 이야기가 달라집니다.
        </p>
        <figure className="mt-4">
          <div className="space-y-3.5">
            <div>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-fg">
                  네이버 웹툰 1위 <span className="font-normal text-fg-3">(실데이터)</span>
                </span>
                <span className="numeral text-fg-2">
                  100 × 1.00(도달) × 1.05(신뢰) ≈ <strong className="text-fg">105</strong>
                </span>
              </div>
              <div
                className="h-4 overflow-hidden rounded-full bg-line/50"
                role="img"
                aria-label="네이버 웹툰 1위 종합 점수 105"
              >
                <div className="h-full rounded-full bg-accent" style={{ width: "100%" }} />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-fg">
                  레진 1위 <span className="font-normal text-fg-3">(추정 지표)</span>
                </span>
                <span className="numeral text-fg-2">
                  100 × 0.62(도달) × 0.79(신뢰) ≈ <strong className="text-fg">49</strong>
                </span>
              </div>
              <div
                className="h-4 overflow-hidden rounded-full bg-line/50"
                role="img"
                aria-label="레진 1위 종합 점수 49"
              >
                <div className="h-full rounded-full bg-fg-3" style={{ width: "46.7%" }} />
              </div>
            </div>
          </div>
          <figcaption className="mt-2 text-xs text-fg-3">
            막대 길이는 종합 점수에 비례 (105 기준)
          </figcaption>
        </figure>
        <p className="mt-3 text-sm leading-relaxed text-fg-3">
          같은 '플랫폼 1위'라도 종합 점수는 두 배 넘게 벌어집니다. 군소 플랫폼이 무시되는 게 아니라,
          장르·숨은 명작 같은 다른 축에서 정당하게 상위에 오릅니다.
        </p>
      </section>

      {/* CTA */}
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/ranking"
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
        >
          통합 랭킹 보러가기 <ArrowRight size={15} />
        </Link>
        <Link
          href="/about"
          className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised"
        >
          툰스튜디오 소개
        </Link>
      </div>
    </Container>
  );
}
