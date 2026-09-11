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
import { StudioBrushIntegratedWorkbench } from "./StudioBrushIntegratedWorkbench";
import { StudioBrushLegacyCataloguePanel } from "./StudioBrushLegacyCataloguePanel";
import { StudioBrushV5RuntimeWorkbench } from "./StudioBrushV5RuntimeWorkbench";

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
    title: "저장·게시·원고 비교",
    description: "V6 프로그램을 저장·게시하고 기존 캔버스 브러시와 실제 획을 비교합니다.",
  },
] as const;

function routeContext(params: {
  readonly workId?: string;
  readonly sourceWorkId?: string;
  readonly brushId?: string;
}) {
  if (params.workId) {
    const encoded = encodeURIComponent(params.workId);
    return {
      scope: `work:${params.workId}`,
      baseHref: `/studio/work/${encoded}/brush-lab`,
      returnHref: `/studio/work/${encoded}/canvas`,
      returnLabel: "원고로 돌아가기",
      contextLabel: `원고 ${params.workId}`,
    };
  }
  if (params.sourceWorkId) {
    const encoded = encodeURIComponent(params.sourceWorkId);
    return {
      scope: `remix:${params.sourceWorkId}`,
      baseHref: `/studio/remix/${encoded}/brush-lab`,
      returnHref: `/studio/remix/${encoded}/canvas`,
      returnLabel: "리믹스로 돌아가기",
      contextLabel: `리믹스 ${params.sourceWorkId}`,
    };
  }
  if (params.brushId) {
    const encoded = encodeURIComponent(params.brushId);
    return {
      scope: `brush:${params.brushId}`,
      baseHref: `/studio/assets/brushes/${encoded}/edit`,
      returnHref: `/studio/brushes?selected=${encoded}`,
      returnLabel: "브러시 라이브러리로",
      contextLabel: `브러시 ${params.brushId}`,
    };
  }
  return {
    scope: "draft",
    baseHref: "/studio/assets/brushes/new",
    returnHref: "/studio/canvas",
    returnLabel: "캔버스로 돌아가기",
    contextLabel: "새 브러시",
  };
}

/** Render the unified Brush Editor landing surface and its available workflows. */
export function StudioBrushLabPage() {
  const params = useParams<{ workId?: string; sourceWorkId?: string; brushId?: string }>();
  const context = routeContext(params);

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1920px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-[1.75rem] border border-line bg-card/55 p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.2em] text-accent">
              <Brush size={14} aria-hidden /> BRUSH EDITOR
            </p>
            <h1 className="mt-2 text-pretty text-2xl font-black tracking-tight text-fg sm:text-4xl">
              브러시 프로그램을 만들고, 시험하고, 실제 원고와 비교하세요.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">
              결과가 가까운 시작점을 고르고 실제 획을 확인한 뒤 필요한 설정만 조절하세요. V5의 72종
              품질 설계는 아래 승계 카탈로그에서 모두 찾을 수 있고, V6 프로그램은 저장·마켓 게시까지
              연결됩니다. 일반 캔버스의 기존 브러시 렌더 권위와는 실제 획으로 비교해 적용합니다.
            </p>
            <p className="mt-3 inline-flex rounded-full border border-line bg-panel/60 px-3 py-1 text-xs font-bold text-fg-3">
              {context.contextLabel}
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
              href={context.returnHref}
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg transition-colors hover:border-line-strong hover:bg-raised ${STUDIO_FOCUS_RING}`}
            >
              <ArrowLeft size={15} aria-hidden />
              {context.returnLabel}
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
        <StudioBrushIntegratedWorkbench scope={context.scope} />
        <StudioBrushLegacyCataloguePanel baseHref={context.baseHref} />

        <details className="rounded-3xl border border-line bg-card/35 p-4 sm:p-5">
          <summary className={`flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-fg-2 ${STUDIO_FOCUS_RING}`}>
            <BookOpen size={16} className="text-accent" aria-hidden />
            이전 브러시 런타임 호환성 진단
          </summary>
          <p className="mt-2 max-w-4xl text-xs leading-6 text-fg-3">
            아래 도구는 예전에 만든 브러시의 실제 실행 경로와 결과가 달라 보일 때 사용합니다.
            V5 설계 카탈로그 승계와 별도로, 런타임·장치 호환 문제를 진단하며 원본 브러시는 변경하지 않습니다.
          </p>
          <div className="mt-4 border-t border-line pt-4">
            <StudioBrushV5RuntimeWorkbench scope={context.scope} />
          </div>
        </details>
      </div>
    </main>
  );
}
