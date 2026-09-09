import { ArrowLeft, Brush, CheckCircle2, Gauge, SlidersHorizontal, Sparkles } from "lucide-react";
import { useParams } from "react-router-dom";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { StudioBrushV5RuntimeWorkbench } from "./StudioBrushV5RuntimeWorkbench";
import { StudioBrushV6Workbench } from "./StudioBrushV6Workbench";

const STEPS = [
  {
    icon: Sparkles,
    number: "1",
    title: "원하는 느낌 고르기",
    description: "연필·잉크·수채·유화·입자처럼 결과가 가까운 시작점을 먼저 선택합니다.",
  },
  {
    icon: Brush,
    number: "2",
    title: "직접 그려보기",
    description: "실제 필압·기울기·속도로 획을 그려 보고 바뀐 느낌을 바로 확인합니다.",
  },
  {
    icon: SlidersHorizontal,
    number: "3",
    title: "필요한 것만 조절",
    description: "굵기·질감·재료·물리·패턴을 단계별로 조절하고 전문 엔진은 원할 때만 펼칩니다.",
  },
  {
    icon: CheckCircle2,
    number: "4",
    title: "검사하고 저장",
    description: "성능·호환성·저장 가능 상태를 확인한 뒤 브러시로 저장하거나 파일로 내보냅니다.",
  },
] as const;

export function StudioBrushLabPage() {
  const params = useParams<{ workId?: string; sourceWorkId?: string }>();
  const scope = params.workId
    ? `work:${params.workId}`
    : params.sourceWorkId
      ? `remix:${params.sourceWorkId}`
      : "draft";
  const editorHref = params.workId
    ? `/studio/work/${encodeURIComponent(params.workId)}/canvas`
    : params.sourceWorkId
      ? `/studio/remix/${encodeURIComponent(params.sourceWorkId)}/canvas`
      : "/studio";

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1920px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-[1.75rem] border border-line bg-card/55 p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.2em] text-accent">
              <Brush size={14} aria-hidden /> Brush Studio
            </p>
            <h1 className="mt-2 text-pretty text-2xl font-black tracking-tight text-fg sm:text-4xl">
              원하는 획을 먼저 고르고, 필요한 만큼만 깊게 조절하세요.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">
              엔진 이름이나 렌더링 용어를 몰라도 됩니다. 결과가 가까운 브러시를 고른 뒤 직접 그려 보고,
              차이가 필요한 항목만 조절하세요. 세밀한 물리·재질·그래프 설정은 그대로 제공하지만 기본 화면에서는 앞세우지 않습니다.
            </p>
          </div>
          <a
            href={editorHref}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg transition-colors hover:border-line-strong hover:bg-raised ${STUDIO_FOCUS_RING}`}
          >
            <ArrowLeft size={15} aria-hidden />
            캔버스로 돌아가기
          </a>
        </div>

        <ol className="mt-6 grid gap-2 md:grid-cols-2 xl:grid-cols-4" aria-label="브러시 만들기 단계">
          {STEPS.map(({ icon: Icon, number, title, description }) => (
            <li key={number} className="rounded-2xl border border-line bg-bg-2/55 p-3.5">
              <div className="flex items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon size={15} aria-hidden />
                </span>
                <span className="text-[0.62rem] font-black text-accent">STEP {number}</span>
              </div>
              <strong className="mt-3 block text-sm text-fg">{title}</strong>
              <span className="mt-1 block text-xs leading-5 text-fg-3">{description}</span>
            </li>
          ))}
        </ol>

        <details className="mt-4 rounded-2xl border border-line bg-bg-2/35 p-3.5">
          <summary className={`flex min-h-11 cursor-pointer items-center gap-2 text-xs font-bold text-fg-2 ${STUDIO_FOCUS_RING}`}>
            <Gauge size={15} className="text-accent" aria-hidden />
            어떤 고급 기능까지 있나요?
          </summary>
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-xs leading-6 text-fg-3">
              필압·틸트·호버·팜리젝션, 종이 접촉, 안료 혼합, 수채·유화·강모·입자·반응 물리,
              결정적 패턴과 출력 품질을 조합할 수 있습니다. 장치가 지원하지 않는 기능은 저장 전에 상태와 대체 경로를 표시합니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[0.65rem] font-semibold text-fg-3">
              {["필압·틸트", "종이·재질", "수채·유화 물리", "듀얼 팁·입자", "패턴·문양", "장치 성능 검사", "JSON 가져오기·내보내기"].map((label) => (
                <span key={label} className="rounded-full border border-line bg-card px-2.5 py-1">{label}</span>
              ))}
            </div>
          </div>
        </details>
      </header>

      <div className="mt-5 space-y-5">
        <StudioBrushV6Workbench scope={scope} />

        <details className="rounded-3xl border border-line bg-card/35 p-4 sm:p-5">
          <summary className={`min-h-11 cursor-pointer text-sm font-bold text-fg-2 ${STUDIO_FOCUS_RING}`}>
            이전 엔진 검증·호환 도구 열기
          </summary>
          <p className="mt-2 max-w-4xl text-xs leading-6 text-fg-3">
            일반적인 브러시 제작에는 위 작업대만 사용해도 됩니다. 아래 영역은 기존 V5 실행 경로와 결과를 비교하거나
            호환성 문제를 진단해야 할 때 쓰는 전문 도구입니다.
          </p>
          <div className="mt-4 border-t border-line pt-4">
            <StudioBrushV5RuntimeWorkbench scope={scope} />
          </div>
        </details>
      </div>
    </main>
  );
}
