import { ArrowRight, BookOpen, Languages, MessageSquareText, Sparkles, WandSparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";

import { CreatorEcosystemWorkbench } from "./CreatorEcosystemWorkbench";
import { createOriginalSample, ORIGINAL_CONTENT_CREDIT, SAMPLE_WORKS, SCENE_RECIPES } from "./ecosystem-content";

const workflowCards = [
  [Languages, "언어별 원고", "원문 변경 감지, 번역 검토·승인, 언어별 식자 흐름을 문서 단위로 관리합니다."],
  [WandSparkles, "설정 변경 영향", "캐릭터 의상·소품·장면 설정의 사용 위치를 찾고 공개·승인 원고를 제외해 선택 적용합니다."],
  [MessageSquareText, "베타 독자 검토", "가독성·이해도·다음 장면 기대를 묻는 검토 패키지를 만들고 문서로 다시 가져옵니다."],
  [BookOpen, "제작 과정 기록", "콘티·선화·채색·완성 체크포인트를 작품과 연결해 학습형 쇼케이스로 내보냅니다."],
] as const;

export function CreatorEcosystemPage() {
  useDocumentTitle("완성형 예제와 제작 워크플로 · ToonStudio");
  return <Container size="wide" className="py-8 sm:py-12">
    <header className="max-w-4xl">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-accent">CREATOR ECOSYSTEM</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-fg sm:text-5xl">예제를 고쳐 보며 작품을 완성하세요.</h1>
      <p className="mt-4 text-sm leading-7 text-fg-2">완성 작품, 장면 레시피, 다국어 원고, 설정 영향 분석, 베타 검토와 제작 과정 공개를 한 흐름으로 연결합니다. AI가 필요한 단계는 통합 설정의 사용자 키만 사용합니다.</p>
      <p className="mt-2 text-xs text-fg-3">{ORIGINAL_CONTENT_CREDIT}</p>
    </header>

    <section className="mt-10" aria-labelledby="sample-work-heading">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black text-accent">STARTER WORKS</p><h2 id="sample-work-heading" className="mt-1 text-2xl font-black text-fg">완성형 미니 작품</h2></div><Link to="/learn" className="min-h-11 text-sm font-bold text-accent">학습실 보기</Link></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SAMPLE_WORKS.map(work => {
          const page = createOriginalSample(work.id, 800, "final", (() => { let id = 0; return () => `${work.id}-${id++}`; })());
          return <article key={work.id} className="flex min-h-64 flex-col rounded-2xl border border-line bg-card p-5">
            <span className="text-xs font-black text-accent">{work.genre}</span><h3 className="mt-2 text-xl font-black text-fg">{work.title}</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-fg-2">{work.description}</p>
            <p className="mt-3 text-xs text-fg-3">4개 장면 · 편집 요소 {page.elements.length}개 · 실행 취소 가능한 벡터 원본</p>
            <Link to={`/studio/canvas?sample=${encodeURIComponent(work.id)}`} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-on-accent">사본으로 실습 시작 <ArrowRight size={15} /></Link>
          </article>;
        })}
      </div>
    </section>
    <section className="mt-12" aria-labelledby="scene-recipe-heading">
      <p className="text-xs font-black text-accent">SCENE RECIPES</p><h2 id="scene-recipe-heading" className="mt-1 text-2xl font-black text-fg">장면·연기 레시피 12종</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SCENE_RECIPES.map(recipe => <article key={recipe.id} className="rounded-2xl border border-line bg-panel/50 p-4">
          <div className="flex items-start justify-between gap-3"><h3 className="font-black text-fg">{recipe.title}</h3><Sparkles size={16} className="text-accent" /></div>
          <p className="mt-2 text-xs text-fg-3">{recipe.environment} · {recipe.pose} · {recipe.camera}</p>
          <p className="mt-2 text-sm leading-6 text-fg-2">{recipe.lesson}</p>
        </article>)}
      </div>
    </section>

    <section className="mt-12" aria-labelledby="workflow-heading">
      <p className="text-xs font-black text-accent">PRODUCTION WORKFLOWS</p><h2 id="workflow-heading" className="mt-1 text-2xl font-black text-fg">한 번 만들고, 여러 회차와 언어에 안전하게 사용</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {workflowCards.map(([Icon, title, description]) => <article key={title} className="rounded-2xl border border-line bg-card p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={18} /></span>
          <h3 className="mt-4 text-lg font-black text-fg">{title}</h3><p className="mt-2 text-sm leading-6 text-fg-2">{description}</p>
        </article>)}
      </div>
    </section>

    <CreatorEcosystemWorkbench />

    <section className="mt-12 flex flex-col gap-4 rounded-3xl border border-accent/30 bg-accent-soft/30 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-xl font-black text-fg">AI 비용은 사용자 연결에서만 발생합니다.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">텍스트·이미지·개인 추론 서버 연결을 한 설정에서 선택합니다. 텍스트·이미지·개인 추론 키는 운영 서버에 저장하지 않습니다. Hyper3D/Rodin 키는 작업 중 일시 전달되지만 보관·로그하지 않으며, 어느 기능도 운영측 유료 AI로 자동 전환하지 않습니다.</p></div>
      <Link to="/settings/ai" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-accent/40 px-4 text-sm font-black text-accent">통합 AI 설정</Link>
    </section>
  </Container>;
}
