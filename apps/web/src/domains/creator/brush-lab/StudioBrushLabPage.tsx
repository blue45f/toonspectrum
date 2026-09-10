import {
  ArrowLeft,
  BookOpen,
  Brush,
  CheckCircle2,
  Gauge,
  Library,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useParams } from "react-router-dom";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { StudioBrushV5RuntimeWorkbench } from "./StudioBrushV5RuntimeWorkbench";
import { StudioBrushV6Workbench } from "./StudioBrushV6Workbench";

const STEPS = [
  {
    icon: Sparkles,
    number: "1",
    title: "시작 느낌 고르기",
    description: "연필·잉크·수채·유화·입자처럼 결과가 가까운 브러시에서 시작합니다.",
  },
  {
    icon: Brush,
    number: "2",
    title: "실제로 그려보기",
    description: "현재 펜의 필압·기울기·속도로 획을 그리며 변화를 바로 확인합니다.",
  },
  {
    icon: SlidersHorizontal,
    number: "3",
    title: "필요한 만큼 조절",
    description: "굵기·질감·물감·패턴부터 전문 설정까지 같은 편집기에서 단계적으로 조절합니다.",
  },
  {
    icon: CheckCircle2,
    number: "4",
    title: "내 브러시로 저장",
    description: "호환성과 성능을 확인한 뒤 개인·팀 브러시로 저장하거나 파일로 내보냅니다.",
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
      : "/studio/canvas";

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1920px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-[1.75rem] border border-line bg-card/55 p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.2em] text-accent">
              <Brush size={14} aria-hidden /> BRUSH EDITOR
            </p>
            <h1 className="mt-2 text-pretty text-2xl font-black tracking-tight text-fg sm:text-4xl">
              브러시를 만들고, 시험하고, 바로 원고에 사용하세요.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">
              별도의 연구실이나 엔진 이름을 배울 필요가 없습니다. 결과가 가까운 시작점을 고르고 실제 획을 확인한 뒤,
              필요한 설정만 조절하세요. 자연 매체·재질·입자·전문 그래프 기능도 같은 편집기 안에서 단계적으로 열립니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/studio/assets/brushes"
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg transition-colors hover:border-line-strong hover:bg-raised ${STUDIO_FOCUS_RING}`}
            >
              <Library size={15} aria-hidden />
              브러시 선택
            </a>
            <a
              href={editorHref}
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg transition-colors hover:border-line-strong hover:bg-raised ${STUDIO_FOCUS_RING}`}
            >
              <ArrowLeft size={15} aria-hidden />
              캔버스로 돌아가기
            </a>
          </div>
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
            전문 브러시 설정 보기
          </summary>
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-xs leading-6 text-fg-3">
              필압·기울기·펜 회전, 종이 접촉, 안료 혼합, 수채·유화·강모·입자 물리,
              결정적 패턴과 출력 품질까지 조절할 수 있습니다. 현재 장치가 지원하지 않는 설정은
              저장 전에 가장 안전한 대체 방법과 함께 알려 줍니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[0.65rem] font-semibold text-fg-3">
              {["필압·기울기", "종이·재질", "수채·유화", "듀얼 팁·입자", "패턴·문양", "이 기기에 맞게 최적화", "가져오기·내보내기"].map((label) => (
                <span key={label} className="rounded-full border border-line bg-card px-2.5 py-1">{label}</span>
              ))}
            </div>
          </div>
        </details>
      </header>

      <div className="mt-5 space-y-5">
        <StudioBrushV6Workbench scope={scope} />

        <details className="rounded-3xl border border-line bg-card/35 p-4 sm:p-5">
          <summary className={`flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-fg-2 ${STUDIO_FOCUS_RING}`}>
            <BookOpen size={16} className="text-accent" aria-hidden />
            이전 브러시 호환성 진단
          </summary>
          <p className="mt-2 max-w-4xl text-xs leading-6 text-fg-3">
            일반적인 브러시 제작에는 위 편집기만 사용하면 됩니다. 아래 도구는 예전에 만든 브러시의 결과가 달라 보이거나
            변환 상태를 자세히 확인해야 할 때만 사용합니다. 원본 브러시는 변경하지 않습니다.
          </p>
          <div className="mt-4 border-t border-line pt-4">
            <StudioBrushV5RuntimeWorkbench scope={scope} />
          </div>
        </details>
      </div>
    </main>
  );
}
