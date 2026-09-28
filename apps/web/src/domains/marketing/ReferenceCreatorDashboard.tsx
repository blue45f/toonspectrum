import { ArrowRight, BookOpen, Boxes, Brush, ChevronRight, FolderKanban, Layers3, MousePointer2, PackageCheck, PanelsTopLeft, Search, Sparkles, Type, Users } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { ToonStudioWordmark } from "@/shared/components/toonstudio-brand";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { useUi } from "@/shared/lib/ui-store";

import { CreatorSectionLink } from "./CreatorHomeNavigation";
import "./reference-creator-dashboard.css";

const SCENES = "/assets/studio/scene-assistant/imagegen25-v1";
const HERO = "/brand/reference-20260928/story-world.png";

const QUICK_STARTS = [
  { href: "/studio/new?kind=webtoon&template=webtoon-vertical", ko: "새 웹툰 시작하기", en: "Create a webtoon", detailKo: "첫 컷부터 나의 이야기", detailEn: "Your story, panel by panel", image: `${SCENES}/city.webp` },
  { href: "/story-lab", ko: "스토리 만들기", en: "Shape a story", detailKo: "아이디어를 기획과 대본으로", detailEn: "Turn ideas into a script", image: `${SCENES}/rooftop.webp` },
  { href: "/studio/assets/characters/new", ko: "캐릭터 만들기", en: "Create a character", detailKo: "표정과 포즈에 생명을", detailEn: "Expressions with a story", image: HERO },
  { href: "/studio/bg3d", ko: "배경 만들기", en: "Build a world", detailKo: "장면을 완성하는 공간", detailEn: "Set the scene in 3D", image: `${SCENES}/palace.webp` },
  { href: "/studio/new?kind=illustration&template=illustration-blank", ko: "빈 캔버스", en: "Blank canvas", detailKo: "지금, 자유롭게 그리기", detailEn: "A space for your next idea", image: `${SCENES}/classroom.webp` },
] as const;

const MODULES = [
  { href: "/studio", ko: "프로젝트", en: "Projects", detailKo: "작품·회차·최근 작업을 한곳에서", detailEn: "Works, episodes and recent projects", tag: "YOUR STORIES, ONE UNIVERSE", image: `${SCENES}/city.webp`, icon: FolderKanban },
  { href: "/studio/assets/characters/new", ko: "캐릭터 스튜디오", en: "Character studio", detailKo: "인물의 설정부터 표정과 포즈까지", detailEn: "From personality to expressions and poses", tag: "BRING CHARACTERS TO LIFE", image: HERO, icon: Users },
  { href: "/studio/bg3d", ko: "배경 스튜디오", en: "Background studio", detailKo: "카메라와 빛으로 완성하는 세계", detailEn: "Build worlds with light and perspective", tag: "WORLDS BEYOND IMAGINATION", image: `${SCENES}/palace.webp`, icon: Boxes },
  { href: "/studio/assets", ko: "에셋 라이브러리", en: "Asset library", detailKo: "브러시·소재·폰트와 사용 조건", detailEn: "Brushes, materials, fonts and usage rights", tag: "EVERYTHING YOU NEED", image: "/brand/atelier-materials-640.webp", icon: Layers3 },
  { href: "/story-lab", ko: "스토리보드", en: "Story development", detailKo: "떠오른 아이디어를 장면과 대본으로", detailEn: "Turn your idea into scenes and scripts", tag: "FROM IDEAS TO SCENES", image: `${SCENES}/rooftop.webp`, icon: PanelsTopLeft },
  { href: "/studio/ai-lab", ko: "AI 크리에이티브", en: "AI creative studio", detailKo: "내 API 키로 선택하고 실행하는 창작 도구", detailEn: "Creative tools with your own API key", tag: "CREATE WITH YOUR OWN AI", image: "/brand/toonstudio-visual-identity/ai-creative-director.webp", icon: Sparkles },
  { href: "/studio/publish", ko: "발행 & 공유", en: "Publish & share", detailKo: "규격·권리·미리보기부터 내보내기까지", detailEn: "Check formats, rights and previews before export", tag: "SHARE YOUR STORY", image: `${SCENES}/fantasy.webp`, icon: PackageCheck },
  { href: "/community", ko: "커뮤니티", en: "Community", detailKo: "함께 만드는 더 큰 이야기", detailEn: "Meet the people behind the stories", tag: "TOGETHER, WE CREATE MORE", image: `${SCENES}/cafe.webp`, icon: Users },
] as const;

/** 공개 홈의 작업 입구. 실제 사용자 작품이나 실행하지 않은 AI 결과를 모사하지 않는다. */
export function ReferenceCreatorDashboard() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const openSearch = useUi((state) => state.openCommandPalette);
  return (
    <div className="reference-dashboard" data-reference-dashboard="true">
      <section className="rd-hero" aria-labelledby="creator-hero-title">
        <div className="rd-hero-art" aria-hidden="true" />
        <div className="rd-hero-content">
          <p className="rd-brand"><ToonStudioWordmark /><small>Stories Come to Life</small></p>
          <p className="rd-eyebrow">{bi("상상하는 모든 이야기, 여기서 작품이 됩니다.", "Every story you imagine starts here.")}</p>
          <h1 id="creator-hero-title">{bi("오늘은 어떤 이야기를", "What story will you")}<br /><em>{bi("만들까요?", "create today?")}</em></h1>
          <p className="rd-intro">{bi("작은 아이디어부터 마지막 한 컷까지. 당신만의 이야기를 그려 보세요.", "From a small idea to the final panel. Make a story only you can tell.")}</p>
          <button type="button" className="rd-search" onClick={openSearch}>
            <Search size={18} aria-hidden="true" />
            <span>{bi("작품·도구·소재, 필요한 것을 찾아보세요", "Find projects, tools and creative materials")}</span>
            <span className="rd-search-arrow" aria-hidden="true"><ArrowRight size={18} /></span>
          </button>
          <nav id="creator-start" className="rd-quick" aria-labelledby="creator-toolkit-title">
            <h2 id="creator-toolkit-title" tabIndex={-1} className="rd-quick-title">{bi("무엇부터 시작할까요?", "Where would you like to start?")}</h2>
            <div className="rd-quick-grid">
              {QUICK_STARTS.map((item) => <Link key={item.href} href={item.href}>
                <img src={item.image} alt="" width={240} height={144} loading="lazy" decoding="async" />
                <strong>{bi(item.ko, item.en)}</strong><small>{bi(item.detailKo, item.detailEn)}</small>
              </Link>)}
            </div>
          </nav>
          <div className="rd-hero-links">
            <Link href="/product-tour">{bi("8분 제품 투어", "8-minute product tour")}<ArrowRight size={14} aria-hidden="true" /></Link>
            <Link href="/about/studio">{bi("ToonStudio 알아보기", "Explore ToonStudio")}<ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        </div>
        <figure className="rd-editor" aria-labelledby="rd-editor-caption">
          <div className="rd-editor-heading"><Brush size={20} aria-hidden="true" /><strong>{bi("캔버스", "Canvas")}</strong><span>{bi("한 장면의 시작", "The first scene")}</span><Link href="/studio/new" aria-label={bi("드로잉 작업 시작하기", "Start a drawing")}><ArrowRight size={18} aria-hidden="true" /></Link></div>
          <div className="rd-editor-body" aria-hidden="true">
            <div className="rd-editor-tools"><MousePointer2 /><Brush /><PanelsTopLeft /><Type /><Layers3 /><Boxes /></div>
            <div className="rd-editor-canvas">
              <img src={HERO} alt="" width={1672} height={941} decoding="async" />
              <div className="rd-editor-panel-grid"><img src={`${SCENES}/city.webp`} alt="" width={480} height={320} loading="lazy" decoding="async" /><img src={`${SCENES}/rooftop.webp`} alt="" width={480} height={320} loading="lazy" decoding="async" /></div>
              <span className="rd-editor-bubble">{bi("우리의 이야기는, 이제 시작이야.", "Our story is only beginning.")}</span>
            </div>
            <div className="rd-editor-layers"><strong>{bi("레이어", "Layers")}</strong>{[bi("대사", "Dialogue"), bi("캐릭터", "Character"), bi("배경", "Background"), bi("선화", "Line art"), bi("스케치", "Sketch")].map((label, index) => <span key={label}><i>{String(index + 1).padStart(2, "0")}</i>{label}</span>)}</div>
          </div>
          <div className="rd-editor-strip" aria-hidden="true">{["city", "rooftop", "classroom", "palace", "cafe"].map((scene, index) => <span key={scene}><img src={`${SCENES}/${scene}.webp`} alt="" width={120} height={80} loading="lazy" decoding="async" /><small>{index + 1}</small></span>)}</div>
          <figcaption id="rd-editor-caption"><strong>{bi("그리는 순간, 이야기가 살아납니다.", "Draw your story into life.")}</strong><small>{bi("AI 브랜드 아트로 구성한 편집기 콘셉트 · 실제 작업은 캔버스에서 시작하세요.", "Editor concept with AI brand art. Start your own work on the canvas.")}</small></figcaption>
        </figure>
      </section>

      <section className="rd-resume" aria-labelledby="rd-resume-title">
        <div><FolderKanban size={24} aria-hidden="true" /><div><h2 id="rd-resume-title">{bi("당신의 다음 장면을 이어가세요.", "Continue your next chapter.")}</h2><p>{bi("진행 중인 작품과 복구할 초안은 내 프로젝트에서 확인할 수 있어요.", "Find your works in progress and recoverable drafts in My projects.")}</p></div></div>
        <Link href="/studio">{bi("내 프로젝트", "My projects")}<ArrowRight size={17} aria-hidden="true" /></Link>
      </section>

      <section className="rd-modules" aria-labelledby="rd-modules-title">
        <div className="rd-section-heading"><div><p className="rd-eyebrow">YOUR CREATIVE UNIVERSE</p><h2 id="rd-modules-title">{bi("모든 이야기가 연결되는 곳", "One place for every part of your story")}</h2></div><Link href="/sitemap">{bi("전체 기능 보기", "Explore all tools")}<ArrowRight size={15} aria-hidden="true" /></Link></div>
        <div className="rd-module-grid">{MODULES.map(({ href, ko, en, detailKo, detailEn, tag, image, icon: Icon }) => <Link href={href} key={href} className="rd-module">
          <div className="rd-module-heading"><Icon size={21} aria-hidden="true" /><h3>{bi(ko, en)}</h3><ChevronRight size={16} aria-hidden="true" /></div>
          <div className="rd-module-art"><img src={image} alt="" width={560} height={336} loading="lazy" decoding="async" /></div>
          <div className="rd-module-copy"><p>{bi(detailKo, detailEn)}</p><small>{tag}</small></div>
        </Link>)}</div>
      </section>
      <nav className="rd-chapters" aria-label={bi("제작 안내 바로가기", "Creation guide sections")}>
        <CreatorSectionLink sectionId="creator-flow"><BookOpen size={16} aria-hidden="true" />{bi("전체 제작 흐름", "The complete workflow")}</CreatorSectionLink>
        <CreatorSectionLink sectionId="creator-principles">{bi("창작자를 위한 원칙", "Creator-first principles")}</CreatorSectionLink>
        <CreatorSectionLink sectionId="creator-support">{bi("소재·협업·도움", "Materials, people and help")}</CreatorSectionLink>
      </nav>
    </div>
  );
}
