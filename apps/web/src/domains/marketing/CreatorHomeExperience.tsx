import { ArrowDown, ArrowRight, Box, Brush, Check, Clapperboard, Layers, LayoutGrid, Play, Search, Sparkles } from "lucide-react";
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";

import { ProductIntentStart } from "../creator-resources/ProductIntentStart";
import { CreatorArtworkStudy } from "./CreatorArtworkStudy";
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
    eyebrow: "THE PROFESSIONAL WEBTOON ATELIER", title: ["한 획에서,", "한 편의 웹툰까지."],
    intro: "웹툰을 그리는 전문 작업실, ToonStudio. 펜선과 채색, 컷과 말풍선, 캐릭터와 배경 구도까지. 장면을 쌓아 당신의 이야기를 완성하세요.",
    start: "웹툰 스튜디오 열기", simple: "처음이라면 심플 모드", projects: "내 프로젝트", watch: "24초 브랜드 필름",
    trust: ["브러시 · 레이어 · 필압", "컷 · 말풍선 · 3D 구도", "브라우저에서 바로 시작"],
    stageLabel: "작업 단계별 구성 가이드 선택", signature: "당신의 선으로, 당신의 세계를.",
    strip: ["DRAW WITH INTENTION", "COMPOSE YOUR WORLD", "MAKE IT YOURS"],
    jump: "홈 주요 영역 바로가기", jumpLabels: ["제작 도구", "작업 흐름", "레퍼런스", "저장 환경", "자주 묻는 질문"],
    toolkit: "표현은 자유롭게.\n작업은 정교하게.", toolkitBody: "브러시의 질감, 컷의 호흡, 공간의 깊이. 표현에 필요한 도구를 골라 하나의 작품으로 연결하세요.",
    flow: "영감을 모으는 순간부터\n작품을 보여주는 순간까지.", flowBody: "레퍼런스를 찾고, 화면을 구성하고, 나의 이야기를 세상에 소개하세요. 작업의 다음 단계가 바로 이어집니다.",
    processAlt: "캐릭터의 스케치, 채색과 완성된 웹툰 장면을 보여주는 창작 과정 콘셉트 아트",
    processCaption: "FROM THE FIRST MARK TO THE FINAL SCENE", processNote: "각 제작 단계를 설명하는 콘셉트 아트",
    flowSteps: [
      { title: "관찰하고, 수집하다.", body: "복식과 건축, 소품의 디테일. 출처가 있는 자료로 장면의 설득력을 더하세요.", href: "/research", action: "리서치 데스크에서 찾기", tag: "RESEARCH" },
      { title: "그리고, 구성하다.", body: "선을 쌓고 색을 고르고 컷을 나누세요. 캐릭터와 배경 도구로 장면의 구도까지 다듬으세요.", href: "/studio", action: "스튜디오에서 그리기", tag: "CREATE" },
      { title: "움직이고, 전하다.", body: "완성한 컷에 움직임과 자막, 음악을 더해 작품을 소개하는 모션툰으로 이어가세요.", href: "/create/promo", action: "홍보 영상 구성하기", tag: "PRESENT" },
    ],
    tools: [
      { tag: "DRAWING", title: "한 획에도, 나만의 필치.", body: "브러시와 필압, 레이어로 선의 감각과 화면의 밀도를 조절하세요. 스케치에서 채색까지 나의 작업 방식으로.", action: "드로잉 시작하기", href: "/studio", note: "브러시 · 레이어 · 필압 표현", visual: "draw", image: "/brand/atelier-materials.webp", alt: "다양한 브러시 터치, 안료와 종이 질감을 보여주는 아티스트의 재료 연구" },
      { tag: "COMIC & STORY", title: "컷 사이의 호흡까지.", body: "컷과 말풍선, 대사의 흐름을 한 작업 공간에서 구성하세요. 스크롤을 따라 읽히는 이야기의 리듬을 만드세요.", action: "웹툰 작업실 열기", href: "/studio/comic", note: "컷 구성 · 말풍선 · 페이지", visual: "comic", image: "/brand/atelier-process.webp", alt: "스케치와 채색을 거쳐 웹툰 장면이 완성되는 과정" },
      { tag: "CHARACTER & SPACE", title: "장면에 필요한 깊이.", body: "캐릭터 포즈와 구도를 탐색하고 PNG·레이어 PSD로 그리기를 이어가세요.", action: "캐릭터 셰이퍼 열기", href: "/studio/character", note: "3D 구도 → 2D 작업", visual: "scene", image: "/brand/atelier-world.webp", alt: "인물과 건축, 빛의 방향으로 깊이를 표현한 일러스트 장면" },
      { tag: "MOTION COMIC", title: "멈춘 컷에 새로운 리듬.", body: "컷, 자막과 음악을 엮는 홍보 영상. 정지 이미지에 화면 움직임을 더해 작품을 소개하세요.", action: "모션툰 구성하기", href: "/create/promo", note: "정지 컷 기반 모션 · 영상 출력", visual: "motion", image: "/brand/atelier-process.webp", alt: "영상의 시작점이 되는 완성된 일러스트와 스토리보드" },
      { tag: "2D TO 3D", title: "평면에서 입체로.", body: "실루엣과 명암을 바탕으로 원화에 깊이를 만들고 텍스처가 담긴 GLB로 내보내세요.", action: "2D → 3D 리프트", href: "/studio/lift3d", note: "기하 기반 입체화 · GLB 출력", visual: "dimension", image: "/brand/atelier-world.webp", alt: "원근과 입체적인 구조를 연구할 수 있는 판타지 건축 장면" },
      { tag: "ARTIST MATERIALS", title: "좋은 재료가 여는 가능성.", body: "브러시, 팔레트, 소재와 3D 에셋. 출처와 사용 조건을 확인하고 필요한 재료를 찾아보세요.", action: "소재 마켓 둘러보기", href: "/market", note: "브러시 · 팔레트 · 3D 에셋", visual: "materials", image: "/brand/atelier-materials.webp", alt: "붓과 안료, 다양한 표면 질감으로 구성된 창작 재료 보드" },
    ],
    continue: "최근 작업에서 이어가기", planner: "내 작업에 맞는 시작점 찾기",
    explore: "그리는 시간 밖에서도,\n영감은 계속됩니다.", exploreBody: "좋아하는 작품을 만나고, 새로운 표현을 배우고, 작업의 경험을 나누세요.",
    destinations: [
      { href: "/explore", title: "다음 영감이 될 작품", body: "취향으로 탐색하는 웹툰과 웹소설", tag: "DISCOVER" },
      { href: "/learn", title: "표현의 다음 단계", body: "도구 사용법과 창작 학습", tag: "LEARN" },
      { href: "/create", title: "창작자의 시선", body: "다양한 작품과 창작 이야기", tag: "CREATORS" },
      { href: "/community", title: "함께 만드는 성장", body: "서로의 작업 경험을 나누는 공간", tag: "COMMUNITY" },
    ],
    closing: "다음 작품의 시작은,\n당신의 한 획.", closingBody: "상상하던 장면을 이제 당신의 손으로 완성하세요.", questions: "작업실에 들어가기 전에.",
  },
  en: {
    eyebrow: "THE PROFESSIONAL WEBTOON ATELIER", title: ["From your first mark", "to your next webtoon."],
    intro: "Your professional workspace for drawing webtoons. Connect inking and color, panels and dialogue, characters and background composition to create your next story.",
    start: "Open webtoon studio", simple: "New here? Try Simple Mode", projects: "My projects", watch: "The 24-second brand film",
    trust: ["Brushes · layers · pressure", "Panels · dialogue · 3D", "Create in your browser"],
    stageLabel: "Select a workflow composition guide", signature: "Your hand. Your world.",
    strip: ["DRAW WITH INTENTION", "COMPOSE YOUR WORLD", "MAKE IT YOURS"],
    jump: "Jump to home sections", jumpLabels: ["Creative tools", "Workflow", "References", "Storage", "Questions"],
    toolkit: "Freedom to express.\nPrecision to create.", toolkitBody: "The texture of a brush, the rhythm of panels, the depth of a scene. Bring the tools for your expression into one creative process.",
    flow: "From collecting inspiration\nto sharing your story.", flowBody: "Find your references, compose a scene and introduce your work. Your next step is always within reach.",
    processAlt: "Concept art showing a character sketch, color study and a finished webtoon scene",
    processCaption: "FROM THE FIRST MARK TO THE FINAL SCENE", processNote: "Concept art illustrating the stages of creation",
    flowSteps: [
      { title: "Observe. Collect.", body: "Costumes, architecture and the details of a prop. Give your scene credibility with sourced references.", href: "/research", action: "Open the research desk", tag: "RESEARCH" },
      { title: "Draw. Compose.", body: "Build your lines, select your colors and arrange your panels. Refine composition with character and background tools.", href: "/studio", action: "Draw in the studio", tag: "CREATE" },
      { title: "Move. Share.", body: "Add movement, captions and music to your finished panels to introduce your work as a motion comic.", href: "/create/promo", action: "Create a promo", tag: "PRESENT" },
    ],
    tools: [
      { tag: "DRAWING", title: "A signature in every stroke.", body: "Shape your marks with brushes, pressure and layers. Find your own process, from the first sketch to the final colors.", action: "Start drawing", href: "/studio", note: "Brushes · layers · pressure expression", visual: "draw", image: "/brand/atelier-materials.webp", alt: "An artist’s material study with varied brush marks, pigment and paper textures" },
      { tag: "COMIC & STORY", title: "The space between panels.", body: "Compose panels, speech bubbles and dialogue in one workspace. Shape the rhythm of a story as it scrolls.", action: "Open comic workspace", href: "/studio/comic", note: "Panel composition · dialogue · pages", visual: "comic", image: "/brand/atelier-process.webp", alt: "A webtoon scene progressing from sketch through color to a finished illustration" },
      { tag: "CHARACTER & SPACE", title: "Give your scene depth.", body: "Explore character poses and composition, then continue drawing with PNG or layered PSD output.", action: "Open character shaper", href: "/studio/character", note: "3D composition → 2D artwork", visual: "scene", image: "/brand/atelier-world.webp", alt: "A scene exploring depth through characters, architecture and directional light" },
      { tag: "MOTION COMIC", title: "A new rhythm for still art.", body: "Introduce your work with panels, captions and music. Add camera movement to your still images.", action: "Compose a motion comic", href: "/create/promo", note: "Still-panel motion · video export", visual: "motion", image: "/brand/atelier-process.webp", alt: "Finished illustration and storyboard as the starting point for a promo video" },
      { tag: "2D TO 3D", title: "Beyond the flat canvas.", body: "Build depth from silhouettes and shading, and export your artwork as textured GLB geometry.", action: "Explore 2D → 3D lift", href: "/studio/lift3d", note: "Geometry-based depth · GLB output", visual: "dimension", image: "/brand/atelier-world.webp", alt: "Fantasy architecture with perspective and dimensional structures" },
      { tag: "ARTIST MATERIALS", title: "Good materials. New possibilities.", body: "Brushes, palettes, textures and 3D assets. Check the source and usage terms to find materials for your work.", action: "Browse the asset market", href: "/market", note: "Brushes · palettes · 3D assets", visual: "materials", image: "/brand/atelier-materials.webp", alt: "A material board with brushes, pigments and a variety of surface textures" },
    ],
    continue: "Continue your recent work", planner: "Find the right starting point for your work",
    explore: "Inspiration continues\nbeyond the canvas.", exploreBody: "Discover stories you love, learn a new technique and share what you have learned along the way.",
    destinations: [
      { href: "/explore", title: "Your next inspiration", body: "Explore webtoons and web novels", tag: "DISCOVER" },
      { href: "/learn", title: "Your next technique", body: "Learn your tools and your craft", tag: "LEARN" },
      { href: "/create", title: "A creator’s perspective", body: "Different works and creative stories", tag: "CREATORS" },
      { href: "/community", title: "Make progress together", body: "Share experiences from your practice", tag: "COMMUNITY" },
    ],
    closing: "Your next work.\nYour first mark.", closingBody: "Make the scene you have imagined, with your own hands.", questions: "Before you enter the atelier.",
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
    event.preventDefault();
    setStage(next);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button").item(next).focus({ preventScroll: true });
  };
  return (
    <div className="creator-home creator-experience creator-flagship" lang={locale} data-creator-home="studio-first" data-creator-experience="v4">
      <div className="cf-shell">
        <section className="cf-hero" aria-labelledby="creator-home-title">
          <div className="cf-hero-copy">
            <p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{text.eyebrow}</p>
            <h1 id="creator-home-title">{text.title[0]}<br /><em>{text.title[1]}</em></h1>
            <p className="cf-lead">{text.intro}</p>
            <div className="cf-actions"><Link href="/studio" className="cf-button cf-primary">{text.start}<ArrowRight size={19} aria-hidden="true" /></Link><Link href="/studio/projects" className="cf-button cf-secondary">{text.projects}</Link></div>
            <div className="cf-hero-links"><Link href="/studio?uiMode=simple">{text.simple}<ArrowRight size={14} aria-hidden="true" /></Link><a className="cf-film-link" href="#creator-film" onClick={focusExperienceSection}><Play size={13} fill="currentColor" aria-hidden="true" />{text.watch}</a></div>
            <div className="cf-trust">{text.trust.map((item) => <span key={item}><Check size={13} aria-hidden="true" />{item}</span>)}</div>
            <div className="cf-hero-signature"><span aria-hidden="true">T/s.</span><p>{text.signature}</p><a href="#creator-toolkit-title" onClick={focusExperienceSection} aria-label={text.jumpLabels[0]}><ArrowDown size={18} aria-hidden="true" /></a></div>
          </div>
          <div className="cf-hero-visual">
            <CreatorArtworkStudy locale={locale} stage={stage} />
            <div className="cf-stage-switcher" role="group" aria-label={text.stageLabel}>{copy.stages.map((item, index) => <button type="button" key={item.id} aria-pressed={stage === index} aria-controls="creator-stage-description" data-creator-stage={item.id} onClick={() => setStage(index)} onKeyDown={(event) => moveStage(event, index)}><span>0{index + 1}</span>{item.label.replace(/^\d+\s*/, "")}<ArrowRight size={14} aria-hidden="true" /></button>)}</div>
            <div className="cf-stage-description" id="creator-stage-description" data-creator-stage={selectedStage.id} aria-live="polite"><div><strong>{selectedStage.title}</strong><p>{selectedStage.body}</p></div><Link href={selectedStage.href} aria-label={selectedStage.action}><ArrowRight size={20} aria-hidden="true" /></Link></div>
          </div>
        </section>
        <div className="cf-editorial-strip" aria-hidden="true">{text.strip.map((item) => <span key={item}>{item}<i>✳</i></span>)}</div>
        <nav className="cf-jump-nav" aria-label={text.jump}>{SECTIONS.map((id, index) => <a href={`#${id}`} key={id} onClick={focusExperienceSection}>{text.jumpLabels[index]}<ArrowRight size={13} aria-hidden="true" /></a>)}</nav>
        <details className="cf-continuity"><summary>{text.continue}<ArrowRight size={17} aria-hidden="true" /></summary><ProductIntentStart /></details>
        <section className="cf-toolkit" id="creator-start" aria-labelledby="creator-toolkit-title">
          <div className="cf-section-heading"><div><p className="cf-kicker">A TOOLKIT FOR YOUR SIGNATURE</p><h2 id="creator-toolkit-title" tabIndex={-1}>{text.toolkit}</h2></div><p>{text.toolkitBody}</p></div>
          <div className="cf-tool-grid">{text.tools.map((tool, index) => { const Icon = TOOL_ICONS[index]; return <article className={`cf-tool-card cf-tool-${tool.visual}`} key={tool.tag}><div className="cf-tool-art"><img src={tool.image} width={1536} height={1024} loading="lazy" alt={tool.alt} /><span className="cf-tool-symbol" aria-hidden="true"><Icon size={25} strokeWidth={1.4} /></span>{tool.visual === "comic" && <div className="cf-comic-guides" aria-hidden="true"><i /><i /><i /></div>}{tool.visual === "motion" && <span className="cf-motion-track" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>}</div><div className="cf-tool-body"><div className="cf-tool-top"><span>{tool.tag}</span><ArrowRight size={18} aria-hidden="true" /></div><h3>{tool.title}</h3><p>{tool.body}</p><div className="cf-tool-bottom"><small>{tool.note}</small><Link className="cf-link" href={tool.href}>{tool.action}<ArrowRight size={17} aria-hidden="true" /></Link></div></div></article>; })}</div>
        </section>
        <section className="cf-flow" id="creator-flow" aria-labelledby="creator-process-title"><div className="cf-section-heading"><div><p className="cf-kicker">ONE IDEA. EVERY NEXT STEP.</p><h2 id="creator-process-title" tabIndex={-1}>{text.flow}</h2></div><p>{text.flowBody}</p></div><figure className="cf-process-art"><img src="/brand/atelier-process.webp" width={1536} height={1024} loading="lazy" alt={text.processAlt} /><figcaption><span>{text.processCaption}</span><span>{text.processNote}</span></figcaption></figure><ol>{text.flowSteps.map((item, index) => <li key={item.href}><div className="cf-flow-step"><span>0{index + 1}</span><span>{item.tag}</span><ArrowRight size={20} aria-hidden="true" /></div><h3>{item.title}</h3><p>{item.body}</p><Link href={item.href}>{item.action}<ArrowRight size={15} aria-hidden="true" /></Link></li>)}</ol></section>
        <section id="creator-desk" aria-labelledby="creator-desk-title"><CreatorReferenceSearch locale={locale} /></section>
        <CreatorWorkspaceReadiness locale={locale} />
        <details className="cf-planner"><summary><Sparkles size={19} aria-hidden="true" />{text.planner}</summary><CreatorLaunchpad locale={locale} /></details>
        <CreatorBrandFilm copy={copy} locale={locale} />
        <section className="cf-discover" aria-labelledby="creator-discover-title"><div className="cf-section-heading"><div><p className="cf-kicker">A LIFE AROUND MAKING</p><h2 id="creator-discover-title" tabIndex={-1}>{text.explore}</h2></div><p>{text.exploreBody}</p></div><div className="cf-destinations">{text.destinations.map((item) => <Link href={item.href} key={item.href}><span>{item.tag}</span><strong>{item.title}</strong><p>{item.body}</p><ArrowRight size={21} aria-hidden="true" /></Link>)}</div></section>
        <section className="cf-faq" aria-labelledby="creator-faq-title"><div><p className="cf-kicker">GOOD TO KNOW</p><h2 id="creator-faq-title" tabIndex={-1}>{text.questions}</h2></div><div>{copy.faqs.map((faq) => <details key={faq.q}><summary>{faq.q}<span aria-hidden="true">+</span></summary><p>{faq.a}</p></details>)}</div></section>
        <section className="cf-closing" aria-labelledby="creator-closing-title"><img src="/brand/atelier-world.webp" width={1536} height={1024} loading="lazy" alt="" aria-hidden="true" /><div><p className="cf-kicker">THE CANVAS IS YOURS</p><h2 id="creator-closing-title" tabIndex={-1}>{text.closing}</h2><p>{text.closingBody}</p><div className="cf-actions"><Link href="/studio" className="cf-button cf-primary">{text.start}<ArrowRight size={19} aria-hidden="true" /></Link><Link href="/research" className="cf-button cf-secondary">{text.flowSteps[0].action}</Link></div></div><span className="cf-closing-wordmark" aria-hidden="true">ToonStudio.</span></section>
      </div>
    </div>
  );
}
