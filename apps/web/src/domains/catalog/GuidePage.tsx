import { Scale, Sigma, Gauge, ShieldCheck, ArrowRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { PlatformId } from "@/shared/lib/types";

import { Container } from "@/shared/components/section";
import { VisualStepGuide, type VisualStepGuideStep } from "@/shared/components/VisualStepGuide";
import { PLATFORMS } from "@/shared/lib/platforms";
import { RANK_AXES, PLATFORM_REACH_WEIGHT } from "@/shared/lib/ranking";
import { useT } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";

type TranslationResolver = ReturnType<typeof useT>;



// 랭킹 산정 방식 공개 페이지(/guide) — 투명 산식을 사람이 읽을 수 있게 풀어 설명한다.
// 산식·도달가중·축 목록은 lib/ranking.ts 의 단일 출처를 그대로 읽어와 코드와 어긋나지 않게 한다.
// 표시 문구는 public/i18n/app/guide/{ko,en}.json 사전(guide.*)이 단일 출처다.

/** 도식 다이어그램용 SVG 공통 값 */
const INK = "var(--color-fg-2)";
const ACCENT = "var(--color-accent)";

function BayesDiagram({ t }: { t: TranslationResolver }) {
  return (
    <svg viewBox="0 0 320 150" role="img" aria-label={t("guide.diagram.bayes.aria")} className="block h-auto w-full">
      <defs>
        <marker id="bayes-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill={ACCENT} />
        </marker>
      </defs>
      {/* 사전 평균 */}
      <line x1="160" y1="18" x2="160" y2="122" stroke={ACCENT} strokeDasharray="5 4" strokeWidth="1.5" opacity="0.7" />
      <text x="160" y="14" textAnchor="middle" fontSize="11" fill={ACCENT}>{t("guide.diagram.bayes.prior")}</text>
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
      {/* 평가 3개 · 5.0 → 사전 평균 쪽으로 강하게 보정 (기본 사전값 C=4.0, m=800 기준 (4.0×800+5.0×3)/(800+3)≈4.00) */}
      <circle cx="296" cy="88" r="6" fill={ACCENT} />
      <text x="296" y="76" textAnchor="end" fontSize="11" fill={INK}>{t("guide.diagram.bayes.few")}</text>
      <path d="M 288 84 Q 230 40 170 78" fill="none" stroke={ACCENT} strokeWidth="1.8" strokeDasharray="4 3" markerEnd="url(#bayes-arrow)" />
      <circle cx="161" cy="88" r="5" fill="none" stroke={ACCENT} strokeWidth="2" />
      <text x="161" y="110" textAnchor="middle" fontSize="11" fill={INK}>{t("guide.diagram.bayes.fewResult")}</text>
      {/* 평가 1만 개 · 4.6 → (4.0×800+4.6×10000)/(800+10000)≈4.56 */}
      <circle cx="242" cy="52" r="6" fill={INK} opacity="0.75" />
      <text x="242" y="40" textAnchor="middle" fontSize="11" fill={INK}>{t("guide.diagram.bayes.many")}</text>
      <text x="242" y="70" textAnchor="middle" fontSize="11" fill={ACCENT}>{t("guide.diagram.bayes.manyResult")}</text>
    </svg>
  );
}

function PercentileDiagram({ t }: { t: TranslationResolver }) {
  return (
    <svg viewBox="0 0 320 150" role="img" aria-label={t("guide.diagram.pct.aria")} className="block h-auto w-full">
      <rect x="252" y="18" width="44" height="104" fill={ACCENT} opacity="0.1" />
      <text x="274" y="34" textAnchor="middle" fontSize="11" fill={ACCENT}>{t("guide.diagram.pct.top1")}</text>
      <text x="274" y="48" textAnchor="middle" fontSize="11" fill={ACCENT}>{t("guide.diagram.pct.top2")}</text>
      <line x1="24" y1="122" x2="296" y2="122" stroke={INK} strokeWidth="1.5" />
      <line x1="24" y1="122" x2="24" y2="18" stroke={INK} strokeWidth="1.5" />
      <text x="160" y="141" textAnchor="middle" fontSize="11" fill={INK}>{t("guide.diagram.pct.x")}</text>
      <text x="12" y="70" textAnchor="middle" fontSize="11" fill={INK} transform="rotate(-90 12 70)">{t("guide.diagram.pct.y")}</text>
      <path d="M 24 119 C 140 117, 205 112, 248 84 S 288 30, 294 22" fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
      <text x="120" y="105" fontSize="11" fill={INK}>{t("guide.diagram.pct.note")}</text>
    </svg>
  );
}

function ReachDiagram({ t }: { t: TranslationResolver }) {
  return (
    <div role="img" aria-label={t("guide.diagram.reach.aria")} className="space-y-3">
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-fg">{t("guide.diagram.reach.naver")}</span>
          <span className="numeral text-fg-2">×1.00</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-line/50">
          <div className="h-full rounded-full bg-accent" style={{ width: "100%" }} />
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-fg">{t("guide.diagram.reach.lezhin")}</span>
          <span className="numeral text-fg-2">×0.62</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-line/50">
          <div className="h-full rounded-full bg-accent/55" style={{ width: "62%" }} />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-fg-3">{t("guide.diagram.reach.note")}</p>
    </div>
  );
}

function TrustDiagram({ t }: { t: TranslationResolver }) {
  return (
    <div role="img" aria-label={t("guide.diagram.trust.aria")} className="flex items-end justify-center gap-10">
      <div className="flex flex-col items-center gap-1.5">
        <span className="numeral text-sm font-bold text-fg">×1.00~1.06</span>
        <div className="w-14 rounded-t-lg bg-accent" style={{ height: "6rem" }} />
        <span className="text-xs text-fg-2">{t("guide.diagram.trust.real")}</span>
      </div>
      <div className="flex flex-col items-center gap-1.5 opacity-70">
        <span className="numeral text-sm font-bold text-fg">×0.78~0.80</span>
        <div className="w-14 rounded-t-lg bg-fg-3" style={{ height: "4.5rem" }} />
        <span className="text-xs text-fg-2">{t("guide.diagram.trust.est")}</span>
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
  t,
}: {
  icon: LucideIcon;
  sub: string;
  diagram: ReactNode;
  formula: string;
  t: TranslationResolver;
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
          {t("guide.formula.toggle")}
        </summary>
        <code className="mb-3 block rounded-lg bg-raised px-3 py-2 text-xs leading-relaxed text-fg-2">
          {formula}
        </code>
      </details>
    </figure>
  );
}

type Pillar = {
  icon: LucideIcon;
  title: string;
  sub: string;
  body: string;
  diagram: ReactNode;
  formula: string;
};

function buildPillars(t: TranslationResolver): Pillar[] {
  return [
    {
      icon: Scale,
      title: t("guide.pillar.bayes.title"),
      sub: t("guide.pillar.bayes.sub"),
      body: t("guide.pillar.bayes.body"),
      diagram: <BayesDiagram t={t} />,
      formula: t("guide.pillar.bayes.formula"),
    },
    {
      icon: Sigma,
      title: t("guide.pillar.percentile.title"),
      sub: t("guide.pillar.percentile.sub"),
      body: t("guide.pillar.percentile.body"),
      diagram: <PercentileDiagram t={t} />,
      formula: t("guide.pillar.percentile.formula"),
    },
    {
      icon: Gauge,
      title: t("guide.pillar.reach.title"),
      sub: t("guide.pillar.reach.sub"),
      body: t("guide.pillar.reach.body"),
      diagram: <ReachDiagram t={t} />,
      formula: t("guide.pillar.reach.formula"),
    },
    {
      icon: ShieldCheck,
      title: t("guide.pillar.trust.title"),
      sub: t("guide.pillar.trust.sub"),
      body: t("guide.pillar.trust.body"),
      diagram: <TrustDiagram t={t} />,
      formula: t("guide.pillar.trust.formula"),
    },
  ];
}

function reachTierKey(w: number): string {
  if (w >= 0.9) return "guide.tier.major";
  if (w >= 0.7) return "guide.tier.large";
  if (w >= 0.5) return "guide.tier.mid";
  return "guide.tier.small";
}

export function GuidePage() {
  const t = useT();
  const pillars = buildPillars(t);
  // 도달 가중 표 — lib/ranking.ts 의 값을 그대로 읽어 내림차순 정렬.
  const reachRows = (Object.entries(PLATFORM_REACH_WEIGHT) as [PlatformId, number][])
    .map(([id, w]) => ({ id, w, p: PLATFORMS[id] }))
    .filter((r) => r.p)
    .sort((a, b) => b.w - a.w);

  return (
    <Container size="prose" className="py-10 sm:py-14">
      {/* 헤더 */}
      <header>
        <p className="eyebrow text-accent">{t("guide.eyebrow")}</p>
        <h1 className="mt-2 text-pretty font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          {t("guide.title")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-fg-2">
          {t("guide.lede")}
        </p>
      </header>

      {/* 정직성 원칙 */}
      <section className="mt-8 rounded-2xl border border-line bg-panel/40 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-fg">
          <span className="numeral text-accent">01</span> {t("guide.honesty.title")}
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-fg-2">
          {t("guide.honesty.pre")}<strong className="text-fg">{t("guide.honesty.measured")}</strong>{t("guide.honesty.mid1")}{" "}
          <strong className="text-fg">{t("guide.honesty.estimated")}</strong>{t("guide.honesty.mid2")}{" "}
          <code className="rounded bg-raised px-1 py-0.5 text-[0.8em] text-fg-2">≈</code>{" "}
          {t("guide.honesty.mid3")}<strong className="text-fg">{t("guide.honesty.trust")}</strong>{t("guide.honesty.mid4")}
        </p>
      </section>

      {/* 4가지 핵심 장치 — VisualStepGuide 도식 다이어그램으로 전환 */}
      <VisualStepGuide
        className="mt-10"
        eyebrow="HOW IT WORKS"
        heading={t("guide.how.heading")}
        steps={
          pillars.map(
            (p): VisualStepGuideStep => ({
              title: p.title,
              body: p.body,
              illustration: (
                <PillarFigure icon={p.icon} sub={p.sub} diagram={p.diagram} formula={p.formula} t={t} />
              ),
            }),
          )
        }
      />
      <p className="mt-4 text-sm leading-relaxed text-fg-3">
        {t("guide.how.note")}
      </p>

      {/* 도달 가중 표 */}
      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight text-fg">{t("guide.reach.title")}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-2">
          {t("guide.reach.desc")}
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line">
          {reachRows.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${i % 2 ? "bg-card/20" : "bg-transparent"}`}
            >
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: r.p.color }} />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.p.name}</span>
              <span className="shrink-0 text-xs text-fg-3">{t(reachTierKey(r.w))}</span>
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
        <h2 className="text-xl font-bold tracking-tight text-fg">{t("guide.axes.title")}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-2">
          {t("guide.axes.desc")}
        </p>
        <ol className="mt-4 flex flex-col gap-2.5">
          {RANK_AXES.map((a, i) => (
            <li key={a.key} className="rounded-2xl border border-line bg-card/30 p-4">
              <div className="flex items-baseline gap-2.5">
                <span className="numeral text-sm text-fg-3">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-bold text-fg">{t(`guide.axis.${a.key}.label`, a.label)}</h3>
                <span className="text-[0.78rem] text-fg-3">{t(`guide.axis.${a.key}.desc`, a.desc)}</span>
              </div>
              <code className="mt-2 block rounded-lg border border-line/70 bg-raised px-3 py-2 text-xs leading-relaxed text-fg-2">
                {t(`guide.axis.${a.key}.formula`, a.formula)}
              </code>
            </li>
          ))}
        </ol>
      </section>

      {/* 워크드 예시 — 막대 비교 일러스트 */}
      <section className="mt-10 rounded-2xl border border-line bg-panel/40 p-5 sm:p-6">
        <h2 className="text-lg font-bold text-fg">{t("guide.example.title")}</h2>
        <p className="mt-2.5 text-sm leading-relaxed text-fg-2">
          {t("guide.example.body")}
        </p>
        <figure className="mt-4">
          <div className="space-y-3.5">
            <div>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-fg">
                  {t("guide.diagram.reach.naver")} <span className="font-normal text-fg-3">{t("guide.example.realTag")}</span>
                </span>
                <span className="numeral text-fg-2">
                  100 × 1.00({t("guide.word.reach")}) × 1.05({t("guide.word.trust")}) ≈ <strong className="text-fg">105</strong>
                </span>
              </div>
              <div
                className="h-4 overflow-hidden rounded-full bg-line/50"
                role="img"
                aria-label={t("guide.example.naverAria")}
              >
                <div className="h-full rounded-full bg-accent" style={{ width: "100%" }} />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-fg">
                  {t("guide.example.lezhinShort")} <span className="font-normal text-fg-3">{t("guide.example.estTag")}</span>
                </span>
                <span className="numeral text-fg-2">
                  100 × 0.62({t("guide.word.reach")}) × 0.79({t("guide.word.trust")}) ≈ <strong className="text-fg">49</strong>
                </span>
              </div>
              <div
                className="h-4 overflow-hidden rounded-full bg-line/50"
                role="img"
                aria-label={t("guide.example.lezhinAria")}
              >
                <div className="h-full rounded-full bg-fg-3" style={{ width: "46.7%" }} />
              </div>
            </div>
          </div>
          <figcaption className="mt-2 text-xs text-fg-3">
            {t("guide.example.caption")}
          </figcaption>
        </figure>
        <p className="mt-3 text-sm leading-relaxed text-fg-3">
          {t("guide.example.note")}
        </p>
      </section>

      {/* CTA */}
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/ranking"
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
        >
          {t("guide.cta.ranking")} <ArrowRight size={15} />
        </Link>
        <Link
          href="/about"
          className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised"
        >
          {t("guide.cta.about")}
        </Link>
      </div>
    </Container>
  );
}
