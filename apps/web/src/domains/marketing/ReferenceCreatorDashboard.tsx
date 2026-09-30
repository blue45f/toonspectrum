import { ArrowRight, BookOpen, Boxes, ChevronRight, FolderKanban, Plus, Search, Sparkles, UserRound, WandSparkles, type LucideIcon } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { ToonStudioWordmark } from "@/shared/components/toonstudio-brand";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { useUi } from "@/shared/lib/ui-store";

import { HomeCoreStudios } from "./HomeCoreStudios";
import { ReferenceCreatorDashboardModules } from "./ReferenceCreatorDashboardModules";
import { ReferenceEditorPreview } from "./ReferenceEditorPreview";
import { HOME_EXAMPLES, HOME_LEARN_MORE, HOME_LUNA_SUGGESTIONS, HOME_QUICK_STARTS, homeArt } from "./reference-home-content";
import "./reference-creator-dashboard.css";

const LUNA_ICONS: Readonly<Record<(typeof HOME_LUNA_SUGGESTIONS)[number]["icon"], LucideIcon>> = {
  story: BookOpen,
  character: UserRound,
  scene: Boxes,
  ai: WandSparkles,
};

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
          <button type="button" className="rd-search" onClick={openSearch}>
            <Search size={16} aria-hidden="true" />
            <span>{bi("작품·도구·소재, 필요한 것을 찾아보세요", "Find projects, tools and creative materials")}</span>
            <kbd className="rd-search-kbd" aria-hidden="true">Ctrl K</kbd>
            <span className="rd-search-arrow" aria-hidden="true"><ArrowRight size={17} /></span>
          </button>
        </div>
        <aside className="rd-luna" aria-label={bi("Luna 창작 안내", "Luna creative guide")}>
          <img src={homeArt("luna", 320)} alt={bi("은보라색 머리의 창작 도우미 Luna", "Luna, a creative guide with silver-lilac hair")} width={320} height={400} decoding="async" />
          <div className="rd-luna-copy">
            <strong><Sparkles size={13} aria-hidden="true" />Luna<small>{bi("창작 안내", "Creative guide")}</small></strong>
            <p>{bi("안녕하세요! 어떤 이야기를 함께 만들어 볼까요?", "Hello! What story would you like to create?")}</p>
            <ul>
              {HOME_LUNA_SUGGESTIONS.map((suggestion) => {
                const Icon = LUNA_ICONS[suggestion.icon];
                return <li key={suggestion.href}><Link href={suggestion.href}><Icon size={14} aria-hidden="true" /><span>{bi(suggestion.ko, suggestion.en)}</span><ChevronRight size={13} aria-hidden="true" /></Link></li>;
              })}
            </ul>
          </div>
        </aside>
        <nav id="creator-start" className="rd-quick" aria-labelledby="creator-toolkit-title">
          <h2 id="creator-toolkit-title" tabIndex={-1} className="sr-only">{bi("무엇부터 시작할까요?", "Where would you like to start?")}</h2>
          <div className="rd-quick-grid">{HOME_QUICK_STARTS.map((item) => <Link key={item.href} href={item.href}><img src={homeArt(item.image, 320)} alt="" width={240} height={144} decoding="async" /><strong>{bi(item.ko, item.en)}</strong><small>{bi(item.detailKo, item.detailEn)}</small></Link>)}</div>
        </nav>
        <section className="rd-examples" aria-labelledby="rd-examples-title">
          <div className="rd-examples-heading"><h2 id="rd-examples-title">{bi("예시 작품", "Example works")}</h2><Link href="/studio"><FolderKanban size={13} aria-hidden="true" />{bi("내 프로젝트", "My projects")}<ChevronRight size={13} aria-hidden="true" /></Link></div>
          <div className="rd-example-shelf">{HOME_EXAMPLES.map((example) => <div className="rd-example-cover" key={example.image}><img src={homeArt(example.image, 320)} alt="" width={180} height={120} decoding="async" /><span>{bi(example.ko, example.en)}</span></div>)}<Link className="rd-new-project" href="/studio/new"><Plus size={22} aria-hidden="true" /><span>{bi("새 작품", "New work")}</span></Link></div>
        </section>
      </div>
      <ReferenceEditorPreview />
    </section>
    <HomeCoreStudios />
    <ReferenceCreatorDashboardModules />
    <nav className="rd-chapters" aria-label={bi("서비스 더 알아보기", "Learn more about ToonStudio")}>
      <span className="rd-chapters-label">{bi("더 알아보기", "Learn more")}</span>
      {HOME_LEARN_MORE.map((link) => <Link key={link.href} href={link.href}>{bi(link.ko, link.en)}<ArrowRight size={14} aria-hidden="true" /></Link>)}
    </nav>
  </div>;
}
