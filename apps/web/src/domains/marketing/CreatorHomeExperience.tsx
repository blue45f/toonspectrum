import { ArrowRight, Box, Brush, Check, Clapperboard, Layers, LayoutGrid, Play, Search, Sparkles } from "lucide-react";
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";

import { ProductIntentStart } from "../creator-resources/ProductIntentStart";
import { CreatorBrandFilm } from "./CreatorHomePage";
import { CreatorLaunchpad } from "./CreatorLaunchpad";
import { CreatorReferenceSearch } from "./CreatorReferenceSearch";
import { CreatorWorkspaceReadiness } from "./CreatorWorkspaceReadiness";
import { HOME_COPY, creatorHomeLocale } from "./creator-home-content";
import { bindCreatorSectionNavigation, creatorWorkflowIndex, focusCreatorSection, isPlainCreatorJump } from "./creator-home-navigation";
import "./creator-home-experience.css";
import "./creator-flagship.css";

import { useI18n } from "@/shared/lib/i18n";
import Link from "@/compat/router-link";

const COPY = {
  ko: {
    eyebrow: "YOUR NEXT STORY STARTS HERE", title: ["한 장의 상상,", "하나의 세계로."],
    intro: "가볍게 그리고, 장면을 쌓고, 나만의 이야기로. 도구를 찾느라 흐름을 놓치지 않는 웹툰 작업실.",
    start: "심플 모드로 그리기", projects: "프로젝트 열기", watch: "24초로 둘러보기",
    trust: ["브라우저에서 시작", "같은 문서로 전문 모드 전환", "저장 환경 직접 확인"],
    preview: "창작 흐름 예시 — 실제 편집 화면이나 AI 변환 결과가 아닙니다.",
    stageLabel: "창작 흐름 미리보기 선택", sketch: "작은 장면에서 시작해요.",
    strip: ["DRAW YOUR IDEA", "BUILD YOUR SCENE", "TELL YOUR STORY"],
    jump: "홈 주요 영역 바로가기", jumpLabels: ["제작 도구", "창작 흐름", "한글 자료 검색", "오프라인 준비", "궁금한 점"],
    toolkit: "하고 싶은 일에,\n딱 맞는 시작점.", toolkitBody: "복잡한 설정 대신 결과에서 시작하세요. 모든 버튼은 실제 작업 화면으로 연결됩니다.",
    flow: "하나의 아이디어가\n다음 장면이 되기까지.",
    flowBody: "조사한 자료, 그린 컷, 잡아 둔 구도. 작업을 다음 도구로 이어가세요.",
    flowSteps: [
      { title: "발견하고", body: "출처가 있는 복식·공간·소품 자료로 이야기의 빈칸을 채우세요.", href: "/research", action: "리서치 데스크" },
      { title: "장면을 만들고", body: "같은 편집기 안에서 드로잉, 컷 구성과 캐릭터 구도를 이어가세요.", href: "/studio", action: "스튜디오 열기" },
      { title: "이야기를 전하고", body: "컷에 움직임과 자막을 더해 작품을 소개하는 모션툰을 구성하세요.", href: "/create/promo", action: "홍보 영상 작업실" },
    ],
    tools: [
      { tag: "01 / DRAW", title: "캔버스에만 집중.", body: "심플 모드로 시작하고, 필요한 순간 전체 도구로 전환하세요. 문서와 브러시 엔진은 그대로입니다.", action: "심플 모드 시작", href: "/studio?uiMode=simple", note: "동일한 편집기 · UI만 전환", tone: "ink" },
      { tag: "02 / STORY", title: "컷이 모여, 이야기가 되도록.", body: "컷과 대사를 배치하고 페이지를 이어 만드는 웹툰 작업 공간.", action: "컷툰 만들기", href: "/studio/comic", note: "컷 구성 · 말풍선", tone: "paper" },
      { tag: "03 / CHARACTER", title: "먼저 포즈를 잡고, 나답게 그리기.", body: "캐릭터와 구도를 만들고 PNG·레이어 PSD로 작업을 이어가세요.", action: "캐릭터 셰이퍼", href: "/studio/character", note: "3D 배치 → 2D 출력", tone: "sage" },
      { tag: "04 / MOTION", title: "내 작품의 첫 예고편.", body: "컷·자막·음악으로 홍보 영상을 구성하세요. 캐릭터 연기를 새로 생성하는 AI 애니메이션과는 다릅니다.", action: "모션툰 만들기", href: "/create/promo", note: "정지 컷 기반 모션 · 내보내기", tone: "peach" },
      { tag: "05 / DIMENSION", title: "원화에 깊이를 더하다.", body: "실루엣과 명암을 활용해 원화를 입체화하고 GLB로 내보내세요. AI 입체 복원은 아닙니다.", action: "2D → 3D 리프트", href: "/studio/lift3d", note: "브라우저 계산 · 텍스처 GLB", tone: "paper" },
      { tag: "06 / MATERIALS", title: "혼자 다 만들지 않아도.", body: "브러시·팔레트·소재와 3D 에셋을 찾아 작업에 필요한 재료를 모으세요.", action: "에셋 마켓 열기", href: "/market", note: "출처와 사용 조건 확인", tone: "lavender" },
    ],
    continue: "최근 작업과 다른 탐색 메뉴", planner: "시작이 막막하다면, 작업 흐름 추천받기",
    explore: "만드는 일 너머의 발견.", exploreBody: "작품, 영감, 사람을 만나는 길도 그대로 열려 있습니다.",
    destinations: [
      { href: "/explore", title: "취향으로 찾는 작품", tag: "DISCOVER" },
      { href: "/now", title: "오늘의 영감과 5컷 미션", tag: "DAILY SPARK" },
      { href: "/create", title: "창작자의 작품과 이야기", tag: "CREATORS" },
      { href: "/community", title: "함께 나누는 작업 경험", tag: "COMMUNITY" },
    ],
    closing: "다음 장면은,\n당신의 손끝에서.", closingBody: "큰 계획이 아니어도 괜찮아요. 오늘은 한 획부터.", full: "기존 설정으로 시작", questions: "시작 전에 궁금한 것들.",
  },
  en: {
    eyebrow: "YOUR NEXT STORY STARTS HERE", title: ["A little imagination.", "A world of your own."],
    intro: "Draw lightly. Build a scene. Tell your story. A webtoon workspace that keeps your next step close.",
    start: "Draw in Simple Mode", projects: "Open projects", watch: "Explore in 24 seconds",
    trust: ["Start in your browser", "One document, two workspaces", "Check your storage environment"],
    preview: "Workflow illustration — not an editor capture or an AI-generated conversion.",
    stageLabel: "Select a creative workflow preview", sketch: "Begin with a little scene.",
    strip: ["DRAW YOUR IDEA", "BUILD YOUR SCENE", "TELL YOUR STORY"],
    jump: "Jump to home sections", jumpLabels: ["Creative tools", "Workflow", "Reference search", "Offline preparation", "Questions"],
    toolkit: "The right start\nfor what you want to make.", toolkitBody: "Start with an outcome, not a wall of settings. Every action opens a real workspace.",
    flow: "From a little idea\nto the next scene.", flowBody: "Keep your references, panels and compositions moving through the creative process.",
    flowSteps: [
      { title: "Find your references", body: "Fill the gaps in your story with sourced costume, place and prop references.", href: "/research", action: "Research desk" },
      { title: "Build the scene", body: "Move between drawing, panel composition and character planning in one editor.", href: "/studio", action: "Open studio" },
      { title: "Introduce your story", body: "Add motion and captions to still panels to introduce your work.", href: "/create/promo", action: "Promo workspace" },
    ],
    tools: [
      { tag: "01 / DRAW", title: "Just you and the canvas.", body: "Start in Simple Mode and reveal the full workspace when you need it. Your document and brush engine stay the same.", action: "Start Simple Mode", href: "/studio?uiMode=simple", note: "Same editor · a lighter interface", tone: "ink" },
      { tag: "02 / STORY", title: "Panels become a story.", body: "Arrange panels, dialogue and pages in your webtoon workspace.", action: "Create a comic", href: "/studio/comic", note: "Panel layout · speech balloons", tone: "paper" },
      { tag: "03 / CHARACTER", title: "Pose it. Make it yours.", body: "Compose a character and continue with PNG or layered PSD output.", action: "Character shaper", href: "/studio/character", note: "3D composition → 2D output", tone: "sage" },
      { tag: "04 / MOTION", title: "Your story’s first trailer.", body: "Build a promo with panels, captions and music. This is not AI-generated character acting.", action: "Make a motion comic", href: "/create/promo", note: "Still-panel motion · export", tone: "peach" },
      { tag: "05 / DIMENSION", title: "Give your art some depth.", body: "Lift silhouettes and shading into textured GLB geometry. This is not AI 3D reconstruction.", action: "2D → 3D lift", href: "/studio/lift3d", note: "Browser computation · textured GLB", tone: "paper" },
      { tag: "06 / MATERIALS", title: "Build on a little help.", body: "Find brushes, palettes, materials and 3D assets for your next scene.", action: "Explore the asset market", href: "/market", note: "Check sources and usage terms", tone: "lavender" },
    ],
    continue: "Recent work and more destinations", planner: "Not sure where to start? Plan your workflow",
    explore: "There’s more to discover.", exploreBody: "Stories, inspiration and people are still part of your creative world.",
    destinations: [
      { href: "/explore", title: "Stories that fit your taste", tag: "DISCOVER" },
      { href: "/now", title: "A daily spark and five panels", tag: "DAILY SPARK" },
      { href: "/create", title: "Creators and their stories", tag: "CREATORS" },
      { href: "/community", title: "Share the creative experience", tag: "COMMUNITY" },
    ],
    closing: "The next scene\nstarts with you.", closingBody: "It doesn’t need to be a grand plan. Begin with a single stroke.", full: "Open saved workspace", questions: "A few things before you begin.",
  },
} as const;
const TOOL_ICONS = [Brush, LayoutGrid, Box, Clapperboard, Layers, Search] as const;
const SECTIONS = ["creator-toolkit-title", "creator-process-title", "creator-desk-title", "creator-offline-title", "creator-faq-title"] as const;

function focusExperienceSection(event: MouseEvent<HTMLAnchorElement>) {
  const href = event.currentTarget.hash;
  if (!isPlainCreatorJump(event) || window.location.hash !== href) return;
  if (focusCreatorSection(href, (id) => document.getElementById(id), true)) event.preventDefault();
}

export function CreatorHomeExperience() {
  const language = useI18n((state) => state.lang);
  const locale = creatorHomeLocale(language);
  const copy = HOME_COPY[locale];
  const text = COPY[locale];
  const [stage, setStage] = useState(0);
  const selectedStage = copy.stages[stage];
  useEffect(() => bindCreatorSectionNavigation({
    getHash: () => window.location.hash,
    findTarget: (id) => document.getElementById(id),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    subscribe: (callback) => { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); },
  }), []);
  const moveStage = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = creatorWorkflowIndex(event.key, index, copy.stages.length);
    if (next === null) return;
    event.preventDefault(); setStage(next);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button").item(next).focus({ preventScroll: true });
  };
  return (
    <div className="creator-home creator-experience creator-flagship" lang={locale} data-creator-home="studio-first" data-creator-experience="v4">
      <div className="cf-shell">
        <section className="cf-hero ce-hero" aria-labelledby="creator-home-title">
          <div className="cf-hero-copy">
            <p className="cf-kicker"><span aria-hidden="true" className="cf-mark">✳</span> {text.eyebrow}</p>
            <h1 id="creator-home-title">{text.title[0]}<br /><em>{text.title[1]}</em></h1>
            <p className="cf-lead">{text.intro}</p>
            <div className="cf-actions"><Link href="/studio?uiMode=simple" className="cf-button cf-primary">{text.start}<ArrowRight size={19} aria-hidden="true" /></Link><Link href="/studio/projects" className="cf-button cf-secondary">{text.projects}</Link></div>
            <a className="cf-film-link" href="#creator-film" onClick={focusExperienceSection}><span><Play size={14} fill="currentColor" aria-hidden="true" /></span>{text.watch}</a>
            <div className="cf-trust">{text.trust.map((item) => <span key={item}><Check size={13} aria-hidden="true" />{item}</span>)}</div>
          </div>
          <div className="cf-hero-visual">
            <figure className={`cf-art-window ce-preview cf-art-window--${selectedStage.id}`}>
              <div className="cf-window-bar"><span className="cf-window-dots" aria-hidden="true"><i /><i /><i /></span><span>TOONSTUDIO / STORY CANVAS</span><span>01</span></div>
              <div className="cf-artboard"><div className="cf-art-meta"><span>THE FIRST SCENE</span><span>IMAGINATION IN PROGRESS</span></div><img src="/brand/studio-scene.svg" width={720} height={560} alt="" fetchPriority="high" /><div className="cf-panel-marks" aria-hidden="true"><span>01</span><span>02</span><span>03</span></div><p>{text.sketch}</p></div>
              <figcaption>{text.preview}</figcaption>
            </figure>
            <div className="cf-stage-switcher ch-preview-options" aria-label={text.stageLabel}>
              {copy.stages.map((item, index) => <button type="button" key={item.id} aria-pressed={stage === index} aria-controls="creator-stage-description" data-creator-stage={item.id} onClick={() => setStage(index)} onKeyDown={(event) => moveStage(event, index)}><span>0{index + 1}</span>{item.label.replace(/^\d+\s*/, "")}</button>)}
            </div>
            <div className="cf-stage-description" id="creator-stage-description" data-creator-stage={selectedStage.id} aria-live="polite"><strong>{selectedStage.title}</strong><p>{selectedStage.body}</p><Link href={selectedStage.href}>{selectedStage.action}<ArrowRight size={16} aria-hidden="true" /></Link></div>
          </div>
        </section>
        <div className="cf-editorial-strip" aria-hidden="true">{text.strip.map((item, index) => <span key={item}><b>0{index + 1}</b>{item}<i>✳</i></span>)}</div>
        <nav className="cf-jump-nav ce-jump-nav" aria-label={text.jump}>{SECTIONS.map((id, index) => <a href={`#${id}`} key={id} onClick={focusExperienceSection}>{text.jumpLabels[index]}<ArrowRight size={14} aria-hidden="true" /></a>)}</nav>
        <details className="cf-continuity"><summary>{text.continue}<ArrowRight size={17} aria-hidden="true" /></summary><ProductIntentStart /></details>
        <section className="cf-toolkit" id="creator-start" aria-labelledby="creator-toolkit-title">
          <div className="cf-section-heading"><div><p className="cf-kicker">MADE FOR THE WAY YOU CREATE</p><h2 id="creator-toolkit-title" tabIndex={-1}>{text.toolkit}</h2></div><p>{text.toolkitBody}</p></div>
          <div className="cf-tool-grid">{text.tools.map((tool, index) => { const Icon = TOOL_ICONS[index]; return <article className={`cf-tool-card cf-tone-${tool.tone}`} key={tool.tag}><div className="cf-tool-top"><span>{tool.tag}</span><Icon size={25} strokeWidth={1.5} aria-hidden="true" /></div><h3>{tool.title}</h3><p>{tool.body}</p><div className="cf-tool-bottom"><small>{tool.note}</small><Link className="cf-link" href={tool.href}>{tool.action}<ArrowRight size={18} aria-hidden="true" /></Link></div></article>; })}</div>
        </section>
        <section className="cf-flow" id="creator-flow" aria-labelledby="creator-process-title"><div><p className="cf-kicker">ONE IDEA. EVERY NEXT STEP.</p><h2 id="creator-process-title" tabIndex={-1}>{text.flow}</h2><p>{text.flowBody}</p><Link href="/research" className="cf-link">{text.flowSteps[0].action}<ArrowRight size={17} aria-hidden="true" /></Link></div><ol>{text.flowSteps.map((item, index) => <li key={item.href}><span>0{index + 1}</span><div><h3>{item.title}</h3><p>{item.body}</p><Link href={item.href}>{item.action}<ArrowRight size={15} aria-hidden="true" /></Link></div></li>)}</ol></section>
        <section id="creator-desk" aria-labelledby="creator-desk-title"><CreatorReferenceSearch locale={locale} /></section>
        <CreatorWorkspaceReadiness locale={locale} />
        <details className="cf-planner"><summary><Sparkles size={19} aria-hidden="true" />{text.planner}</summary><CreatorLaunchpad locale={locale} /></details>
        <CreatorBrandFilm copy={copy} locale={locale} />
        <section className="cf-discover" aria-labelledby="creator-discover-title"><div className="cf-section-heading"><h2 id="creator-discover-title" tabIndex={-1}>{text.explore}</h2><p>{text.exploreBody}</p></div><div>{text.destinations.map((item) => <Link href={item.href} key={item.href}><span>{item.tag}</span><strong>{item.title}</strong><ArrowRight size={20} aria-hidden="true" /></Link>)}</div></section>
        <section className="cf-faq ch-faq" aria-labelledby="creator-faq-title"><div><p className="cf-kicker">GOOD TO KNOW</p><h2 id="creator-faq-title" tabIndex={-1}>{text.questions}</h2></div><div>{copy.faqs.map((faq, index) => <details key={faq.q}><summary><span>0{index + 1}</span>{faq.q}</summary><p>{faq.a}</p></details>)}</div></section>
        <section className="cf-closing" aria-labelledby="creator-closing-title"><span className="cf-closing-mark" aria-hidden="true">✳</span><p className="cf-kicker">A WORLD ONLY YOU CAN MAKE</p><h2 id="creator-closing-title" tabIndex={-1}>{text.closing}</h2><p>{text.closingBody}</p><div className="cf-actions"><Link href="/studio?uiMode=simple" className="cf-button cf-primary">{text.start}<ArrowRight size={19} aria-hidden="true" /></Link><Link href="/studio" className="cf-button cf-secondary">{text.full}</Link></div></section>
      </div>
    </div>
  );
}
