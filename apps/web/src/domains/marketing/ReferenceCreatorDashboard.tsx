import { useState } from "react";
import { ArrowRight, BookOpen, Brush, ChevronRight, Eye, FolderKanban, Layers3, MousePointer2, PanelsTopLeft, Plus, Search, Sparkles, Type, Users } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { ToonStudioWordmark } from "@/shared/components/toonstudio-brand";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { useUi } from "@/shared/lib/ui-store";

import { CreatorSectionLink } from "./CreatorHomeNavigation";
import { ReferenceCreatorDashboardModules } from "./ReferenceCreatorDashboardModules";
import "./reference-creator-dashboard.css";

const ART = "/brand/illustrated-20260928";
const QUICK_STARTS = [
  { href: "/studio/new?kind=webtoon&template=webtoon-vertical", ko: "새 웹툰 시작하기", en: "Create a webtoon", detailKo: "첫 컷부터 나의 이야기", detailEn: "Your first panel", image: "hero" },
  { href: "/story-lab", ko: "스토리 만들기", en: "Shape a story", detailKo: "아이디어를 대본으로", detailEn: "Ideas into scripts", image: "character-blue" },
  { href: "/studio/assets/characters/new", ko: "캐릭터 만들기", en: "Create a character", detailKo: "표정에 생명을 더해요", detailEn: "Bring expressions to life", image: "character-pink" },
  { href: "/studio/bg3d", ko: "배경 만들기", en: "Build a world", detailKo: "장면을 완성하는 공간", detailEn: "Set the scene", image: "background-city" },
  { href: "/studio/new?kind=illustration&template=illustration-blank", ko: "빈 캔버스", en: "Blank canvas", detailKo: "지금, 자유롭게 그리기", detailEn: "Make your own mark", image: "blank-canvas" },
] as const;
const EXAMPLES = [
  { image: "canvas-noir", ko: "회색의 도시", en: "City in grey" },
  { image: "character-pink", ko: "다시, 봄", en: "Spring, again" },
  { image: "project-romance", ko: "너에게 닿는 밤", en: "A night with you" },
  { image: "character-blue", ko: "푸른 계절", en: "Blue season" },
  { image: "project-crimson", ko: "붉은 기억", en: "Crimson memories" },
] as const;
const FRAMES = ["canvas-noir", "project-romance", "character-blue", "project-crimson", "background-city"] as const;

/** 공개 홈의 로컬 미리보기. 사용자 프로젝트나 저장된 편집 상태와 연결하지 않는다. */
function EditorPreview() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const [frame, setFrame] = useState(0);
  const [dialogue, setDialogue] = useState<string | null>(null);
  const visibleDialogue = dialogue ?? bi("…아직 끝나지 않았어.", "…This story isn't over.");
  return <figure className="rd-editor" aria-labelledby="rd-editor-caption">
    <div className="rd-editor-heading">
      <Brush size={18} aria-hidden="true" /><strong>{bi("캔버스", "Canvas")}</strong>
      <span>{bi("회색의 도시 · 예시", "City in grey · Sample")}</span>
      <Link href="/studio/new" aria-label={bi("드로잉 작업 시작하기", "Start a drawing")}>{bi("작업 시작", "Start drawing")}<ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
    <div className="rd-editor-menubar" aria-hidden="true"><ToonStudioWordmark /><span>↶ · ↷ · ⌕</span><span>{bi("예시 컷 미리보기", "Sample panel preview")}</span><span>100%</span></div>
    <div className="rd-editor-body">
      <nav className="rd-editor-tools" aria-label={bi("캔버스 도구 바로가기", "Canvas tool shortcuts")}>
        <Link href="/studio/new" aria-label={bi("캔버스 열기", "Open canvas")}><MousePointer2 aria-hidden="true" /></Link>
        <Link href="/studio/new?kind=illustration&template=illustration-blank" aria-label={bi("그림 그리기", "Draw an illustration")}><Brush aria-hidden="true" /></Link>
        <Link href="/story-lab" aria-label={bi("스토리보드 열기", "Open storyboard")}><PanelsTopLeft aria-hidden="true" /></Link>
        <Link href="/studio/assets/characters/new" aria-label={bi("캐릭터 도구 열기", "Open character tools")}><Users aria-hidden="true" /></Link>
        <Link href="/studio/assets" aria-label={bi("작품 소재 열기", "Open creative assets")}><Layers3 aria-hidden="true" /></Link>
      </nav>
      <div className="rd-editor-canvas">
        <img data-editor-selected-frame={frame + 1} src={`${ART}/${FRAMES[frame]}-640.webp`} srcSet={`${ART}/${FRAMES[frame]}-320.webp 320w, ${ART}/${FRAMES[frame]}-640.webp 640w`} sizes="(max-width: 599px) 75vw, 40vw" alt={bi(`예시 컷 ${frame + 1}`, `Sample panel ${frame + 1}`)} width={960} height={640} decoding="async" />
        <div className="rd-editor-panel-grid" aria-hidden="true"><img src={`${ART}/storyboard-320.webp`} alt="" width={480} height={320} decoding="async" /><img src={`${ART}/background-city-320.webp`} alt="" width={480} height={320} decoding="async" /></div>
        <span className="rd-editor-bubble">{visibleDialogue}</span>
        <div className="rd-editor-color" aria-hidden="true"><span /><i /><i /><i /><i /></div>
      </div>
      <div className="rd-editor-layers" aria-hidden="true">
        <strong><Layers3 size={12} />{bi("레이어", "Layers")}</strong><small>Normal · 100%</small>
        {[bi("대사", "Dialogue"), bi("캐릭터", "Character"), bi("효과", "Effects"), bi("배경", "Background"), bi("선화", "Line art")].map((label, index) => <span key={label}><i>{String(index + 1).padStart(2, "0")}</i>{label}<Eye size={10} /></span>)}
      </div>
    </div>
    <div className="rd-editor-strip" role="group" aria-label={bi("예시 컷 선택", "Choose a sample panel")}>
      {FRAMES.map((image, index) => <button type="button" key={image} aria-pressed={frame === index} aria-label={bi(`예시 컷 ${index + 1} 선택`, `Select sample panel ${index + 1}`)} onClick={() => setFrame(index)}><img src={`${ART}/${image}-320.webp`} alt="" width={120} height={80} decoding="async" /><small>{index + 1}</small></button>)}
      <Link href="/studio/new" aria-label={bi("내 작품에 새 컷 만들기", "Create a panel in your own work")}><Plus size={18} aria-hidden="true" /></Link>
    </div>
    <label className="rd-dialogue"><Type size={14} aria-hidden="true" /><span>{bi("예시 대사 편집", "Edit sample dialogue")}</span><input value={visibleDialogue} maxLength={60} onChange={(event) => setDialogue(event.target.value)} /></label>
    <figcaption id="rd-editor-caption"><strong>{bi("그리는 순간, 이야기가 살아납니다.", "Draw your story into life.")}</strong><small>{bi("편집기 콘셉트 · 예시는 저장되지 않아요", "Editor concept · Samples are not saved")}</small></figcaption>
  </figure>;
}

export function ReferenceCreatorDashboard() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const openSearch = useUi((state) => state.openCommandPalette);
  return <div className="reference-dashboard" data-reference-dashboard="true">
    <section className="rd-hero" aria-labelledby="creator-hero-title">
      <div className="rd-hero-content">
        <div className="rd-hero-art" aria-hidden="true" />
        <div className="rd-story">
          <p className="rd-brand"><ToonStudioWordmark /><small>Stories Come to Life</small></p>
          <p className="rd-eyebrow">{bi("상상하는 모든 이야기, 여기서 작품이 됩니다.", "Every story you imagine starts here.")}</p>
          <h1 id="creator-hero-title">{bi("오늘은 어떤 이야기를", "What story will you")}<br /><em>{bi("만들까요?", "create today?")}</em></h1>
          <p className="rd-intro">{bi("당신의 상상이, 세상을 놀라게 할 웹툰이 됩니다.", "Your imagination. Your next extraordinary story.")}</p>
          <button type="button" className="rd-search" onClick={openSearch}><Search size={16} aria-hidden="true" /><span>{bi("작품·도구·소재, 필요한 것을 찾아보세요", "Find projects, tools and creative materials")}</span><span className="rd-search-arrow" aria-hidden="true"><ArrowRight size={17} /></span></button>
        </div>
        <aside className="rd-luna" aria-label={bi("Luna 창작 안내", "Luna creative guide")}>
          <img src={`${ART}/luna-320.webp`} alt={bi("은보라색 머리의 창작 도우미 Luna", "Luna, a creative guide with silver-lilac hair")} width={320} height={400} decoding="async" />
          <div className="rd-luna-copy"><strong><Sparkles size={13} aria-hidden="true" />Luna</strong><p>{bi("안녕하세요! 어떤 이야기를 함께 만들어 볼까요?", "Hello! What story would you like to create?")}</p>
            <Link href="/story-lab">{bi("스토리 아이디어 정리", "Shape a story idea")}<ChevronRight size={13} aria-hidden="true" /></Link>
            <Link href="/studio/ai-lab">{bi("AI 창작 도구 살펴보기", "Explore AI tools")}<ChevronRight size={13} aria-hidden="true" /></Link>
          </div>
        </aside>
        <nav id="creator-start" className="rd-quick" aria-labelledby="creator-toolkit-title">
          <h2 id="creator-toolkit-title" tabIndex={-1} className="sr-only">{bi("무엇부터 시작할까요?", "Where would you like to start?")}</h2>
          <div className="rd-quick-grid">{QUICK_STARTS.map((item) => <Link key={item.href} href={item.href}><img src={`${ART}/${item.image}-320.webp`} alt="" width={240} height={144} decoding="async" /><strong>{bi(item.ko, item.en)}</strong><small>{bi(item.detailKo, item.detailEn)}</small></Link>)}</div>
        </nav>
        <section className="rd-examples" aria-labelledby="rd-examples-title">
          <div className="rd-examples-heading"><h2 id="rd-examples-title">{bi("예시 작품", "Example works")}</h2><Link href="/studio"><FolderKanban size={13} aria-hidden="true" />{bi("내 프로젝트", "My projects")}<ChevronRight size={13} aria-hidden="true" /></Link></div>
          <div className="rd-example-shelf">{EXAMPLES.map((example) => <div className="rd-example-cover" key={example.image}><img src={`${ART}/${example.image}-320.webp`} alt="" width={180} height={120} decoding="async" /><span>{bi(example.ko, example.en)}</span></div>)}<Link className="rd-new-project" href="/studio/new"><Plus size={22} aria-hidden="true" /><span>{bi("새 작품", "New work")}</span></Link></div>
        </section>
      </div>
      <EditorPreview />
    </section>
    <ReferenceCreatorDashboardModules />
    <nav className="rd-chapters" aria-label={bi("제작 안내 바로가기", "Creation guide sections")}>
      <Link href="/product-tour">{bi("8분 제품 투어", "8-minute product tour")}<ArrowRight size={14} aria-hidden="true" /></Link>
      <CreatorSectionLink sectionId="creator-flow"><BookOpen size={15} aria-hidden="true" />{bi("전체 제작 흐름", "The complete workflow")}</CreatorSectionLink>
      <CreatorSectionLink sectionId="creator-principles">{bi("창작자를 위한 원칙", "Creator-first principles")}</CreatorSectionLink>
      <CreatorSectionLink sectionId="creator-support">{bi("소재·협업·도움", "Materials, people and help")}</CreatorSectionLink>
    </nav>
  </div>;
}
