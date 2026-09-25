import {
  BarChart3,
  CheckCircle2,
  CirclePause,
  FlaskConical,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import {
  assessGrowthExperiment,
  normalizedGrowthMetrics,
  type GrowthExperiment,
  type GrowthMetricEvent,
} from "./engagement-model";
import { useEngagement } from "./engagement-store";

import { Container } from "@/shared/components/section";
import { useDocumentTitle, useMetaRobots } from "@/shared/seo/use-document-title";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

const METRIC_LABELS: Record<GrowthExperiment["primaryMetric"], string> = {
  "open-rate": "상세 열기율",
  "start-rate": "읽기 시작률",
  "completion-rate": "완독률",
  "subscribe-rate": "구독 전환율",
};

const EVENT_BUTTONS: readonly { event: GrowthMetricEvent; label: string }[] = [
  { event: "impressions", label: "노출" },
  { event: "opens", label: "상세 열기" },
  { event: "starts", label: "읽기 시작" },
  { event: "completes", label: "완독" },
  { event: "subscribes", label: "구독" },
];

function percent(value: number): string {
  return new Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function statusLabel(status: GrowthExperiment["status"]): string {
  return {
    draft: "초안",
    running: "진행 중",
    paused: "일시 정지",
    completed: "종료",
  }[status];
}

function AudienceFunnel({ experiment }: { readonly experiment: GrowthExperiment }) {
  const totals = experiment.variants.reduce((sum, variant) => {
    const metrics = normalizedGrowthMetrics(variant.metrics);
    return {
      impressions: sum.impressions + metrics.impressions,
      opens: sum.opens + metrics.opens,
      starts: sum.starts + metrics.starts,
      completes: sum.completes + metrics.completes,
      subscribes: sum.subscribes + metrics.subscribes,
    };
  }, { impressions: 0, opens: 0, starts: 0, completes: 0, subscribes: 0 });
  const rows = [
    ["도달", totals.impressions],
    ["관심", totals.opens],
    ["읽기 시작", totals.starts],
    ["완독", totals.completes],
    ["구독", totals.subscribes],
  ] as const;
  const maximum = Math.max(1, totals.impressions);
  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-start gap-2">
        <UsersRound className="mt-0.5 size-4 text-accent" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-black text-fg">Audience CRM · 집계 세그먼트</h3>
          <p className="mt-1 text-[0.68rem] leading-5 text-fg-3">개별 독자 식별정보 없이 실험 전체의 단계별 수만 보여줍니다.</p>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {rows.map(([label, count]) => (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-fg-2">{label}</span>
              <span className="numeral text-fg">{count.toLocaleString("ko-KR")}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, (count / maximum) * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExperimentCard({ experiment }: { readonly experiment: GrowthExperiment }) {
  const updateStatus = useEngagement((state) => state.updateGrowthExperimentStatus);
  const recordMetric = useEngagement((state) => state.recordGrowthMetric);
  const deleteExperiment = useEngagement((state) => state.deleteGrowthExperiment);
  const assessment = useMemo(() => assessGrowthExperiment(experiment), [experiment]);
  const leader = assessment.leaderId
    ? experiment.variants.find((variant) => variant.id === assessment.leaderId)
    : null;

  return (
    <article className="rounded-3xl border border-line bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[0.65rem] font-bold text-fg-3">{statusLabel(experiment.status)}</span>
            <span className="rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 text-[0.65rem] font-bold text-accent">{METRIC_LABELS[experiment.primaryMetric]}</span>
          </div>
          <h2 className="mt-3 text-xl font-black text-fg">{experiment.name}</h2>
          {experiment.hypothesis ? <p className="mt-1 text-sm leading-6 text-fg-2">{experiment.hypothesis}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {experiment.status !== "running" ? (
            <button type="button" onClick={() => updateStatus(experiment.id, "running")} className={buttonClass({ size: "sm", className: "gap-1.5" })}><Play size={13} aria-hidden="true" /> 시작</button>
          ) : (
            <button type="button" onClick={() => updateStatus(experiment.id, "paused")} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}><CirclePause size={13} aria-hidden="true" /> 정지</button>
          )}
          <button type="button" onClick={() => updateStatus(experiment.id, "completed")} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}><CheckCircle2 size={13} aria-hidden="true" /> 종료</button>
          <button type="button" onClick={() => deleteExperiment(experiment.id)} aria-label="실험 삭제" className="grid size-9 place-items-center rounded-lg border border-line text-fg-3 hover:border-bad/40 hover:text-bad"><Trash2 size={14} aria-hidden="true" /></button>
        </div>
      </div>

      <div className={cn(
        "mt-5 rounded-2xl border p-4",
        assessment.state === "directional"
          ? "border-good/35 bg-good/10"
          : assessment.state === "collecting"
            ? "border-cool/30 bg-cool/10"
            : "border-warn/35 bg-warn/10",
      )}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm text-fg">
            {assessment.state === "directional" && leader
              ? `${leader.label}이 현재 방향성 우세`
              : assessment.state === "collecting"
                ? "표본 수집 중"
                : "차이 확인 불가"}
          </strong>
          {assessment.confidence !== null ? <span className="text-xs font-bold text-fg-2">신뢰도 {percent(assessment.confidence)}</span> : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-fg-2">{assessment.reason}</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {assessment.results.map((result) => {
          const variant = experiment.variants.find((item) => item.id === result.variantId)!;
          return (
            <section key={result.variantId} className="rounded-2xl border border-line bg-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-black text-fg">{result.label}</h3>
                <span className="text-xs text-fg-3">노출 {result.sample.toLocaleString("ko-KR")}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-xl bg-card p-3"><dt className="text-fg-3">열기율</dt><dd className="mt-1 font-black text-fg">{percent(result.openRate)}</dd></div>
                <div className="rounded-xl bg-card p-3"><dt className="text-fg-3">시작률</dt><dd className="mt-1 font-black text-fg">{percent(result.startRate)}</dd></div>
                <div className="rounded-xl bg-card p-3"><dt className="text-fg-3">완독률</dt><dd className="mt-1 font-black text-fg">{percent(result.completionRate)}</dd></div>
                <div className="rounded-xl bg-card p-3"><dt className="text-fg-3">구독률</dt><dd className="mt-1 font-black text-fg">{percent(result.subscribeRate)}</dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {EVENT_BUTTONS.map((item) => (
                  <button
                    key={item.event}
                    type="button"
                    disabled={experiment.status !== "running"}
                    onClick={() => recordMetric(experiment.id, variant.id, item.event)}
                    className={buttonClass({ variant: "outline", size: "sm" })}
                  >
                    + {item.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[0.65rem] leading-5 text-fg-3">현재는 수동·연동 테스트용 집계입니다. 실제 노출 시스템을 연결할 때에도 사용자별 원시 식별자는 이 화면에 노출하지 않습니다.</p>
            </section>
          );
        })}
      </div>

      <div className="mt-4">
        <AudienceFunnel experiment={experiment} />
      </div>
    </article>
  );
}

export function CreatorGrowthLabPage() {
  useDocumentTitle("Creator Growth Lab");
  useMetaRobots(NOINDEX_PRIVATE_ROBOTS);
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId")?.trim() || "local-project";
  const experiments = useEngagement((state) => state.growthExperiments)
    .filter((experiment) => experiment.projectId === projectId);
  const createExperiment = useEngagement((state) => state.createGrowthExperiment);
  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [minimumSample, setMinimumSample] = useState("100");
  const [primaryMetric, setPrimaryMetric] = useState<GrowthExperiment["primaryMetric"]>("open-rate");
  const [variantA, setVariantA] = useState("A안");
  const [variantB, setVariantB] = useState("B안");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createExperiment({
      projectId,
      name,
      hypothesis,
      minimumSample: Number(minimumSample),
      primaryMetric,
      variantLabels: [variantA, variantB],
    });
    setName("");
    setHypothesis("");
  };

  return (
    <Container size="wide" className="py-8 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-accent">CREATOR GROWTH LAB</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">성장 실험과 독자 퍼널</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            썸네일·제목·소개문 변형을 비교하되, 충분한 표본과 통계적 차이가 있기 전에는 승자를 선언하지 않습니다.
            실험 문서는 현재 브라우저 작업 공간에 저장됩니다. 현재 프로젝트: <strong className="font-semibold text-fg">{projectId}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-good/30 bg-good/10 px-3 py-2 text-xs text-fg-2">
          <ShieldCheck size={15} className="text-good" aria-hidden="true" /> 집계 데이터만 표시
        </div>
      </header>

      <div className="mt-8 grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <form onSubmit={submit} className="rounded-3xl border border-line bg-card p-5 xl:sticky xl:top-[var(--site-header-sticky-offset,5rem)] xl:self-start">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent"><FlaskConical size={17} aria-hidden="true" /></span>
            <div><h2 className="font-black text-fg">새 실험</h2><p className="text-[0.68rem] text-fg-3">두 변형의 같은 지표를 비교합니다.</p></div>
          </div>
          <label className="mt-5 block text-xs font-bold text-fg-2">실험 이름<input required value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="예: 1화 썸네일" className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg" /></label>
          <label className="mt-3 block text-xs font-bold text-fg-2">가설<textarea value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} maxLength={500} placeholder="캐릭터 얼굴을 크게 보여주면 상세 열기율이 높아질 것이다." className="mt-1.5 min-h-24 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm leading-6 text-fg" /></label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-fg-2">A 변형<input required value={variantA} onChange={(event) => setVariantA(event.target.value)} maxLength={80} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg" /></label>
            <label className="text-xs font-bold text-fg-2">B 변형<input required value={variantB} onChange={(event) => setVariantB(event.target.value)} maxLength={80} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg" /></label>
          </div>
          <label className="mt-3 block text-xs font-bold text-fg-2">주요 지표<select value={primaryMetric} onChange={(event) => setPrimaryMetric(event.target.value as GrowthExperiment["primaryMetric"])} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">{Object.entries(METRIC_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="mt-3 block text-xs font-bold text-fg-2">변형별 최소 노출<input type="number" min="20" max="1000000" value={minimumSample} onChange={(event) => setMinimumSample(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg" /></label>
          <button type="submit" className={buttonClass({ className: "mt-5 w-full gap-1.5" })}><Plus size={15} aria-hidden="true" /> 실험 만들기</button>
          <div className="mt-4 rounded-xl border border-line bg-panel p-3 text-[0.67rem] leading-5 text-fg-3"><BarChart3 className="mb-2 size-4 text-accent" aria-hidden="true" />클릭률만 높고 완독·구독이 낮은 변형을 자동 채택하지 않습니다. 최종 선택은 작품의 품질과 브랜드 맥락을 함께 검토합니다.</div>
        </form>

        <div className="space-y-5">
          {experiments.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line bg-card/50 p-12 text-center">
              <FlaskConical className="mx-auto size-11 text-fg-3" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-black text-fg">아직 성장 실험이 없습니다</h2>
              <p className="mt-2 text-sm text-fg-3">왼쪽에서 비교할 두 변형과 최소 표본을 정해 시작하세요.</p>
            </div>
          ) : experiments.map((experiment) => <ExperimentCard key={experiment.id} experiment={experiment} />)}
        </div>
      </div>
    </Container>
  );
}
