import {
  ArrowRight,
  Box,
  Brush,
  CalendarDays,
  Check,
  Compass,
  Images,
  Layers,
  LayoutGrid,
  Lightbulb,
  MessageCircle,
  MousePointer2,
  Palette,
  Play,
  Search,
  Sparkles,
  Store,
  TrendingUp,
} from "lucide-react";
import { useState, type MouseEvent } from "react";

import { CreatorBrandFilm } from "./CreatorHomePage";
import { HOME_COPY, creatorHomeLocale } from "./creator-home-content";
import "./creator-home-experience.css";

import { useI18n } from "@/shared/lib/i18n";
import Link from "@/compat/router-link";

const QUICK_START_ICONS = [Brush, LayoutGrid, Box, Store] as const;
const JOURNEY_ICONS = [Lightbulb, Search, Palette, Images] as const;
const DISCOVERY_ICONS = [Compass, TrendingUp, CalendarDays, MessageCircle] as const;

const EXPERIENCE_COPY = {
  ko: {
    heroBadge: "아이디어에서 공개까지, 하나의 창작 흐름",
    heroAside: "DRAW · TELL · BUILD · DISCOVER",
    jumpLabel: "홈 주요 영역 바로가기",
    jumpLinks: [
      ["creator-start", "바로 시작"],
      ["creator-flow", "창작 흐름"],
      ["creator-desk", "자료와 영감"],
      ["creator-film", "브랜드 필름"],
    ],
    previewLabel: "툰스튜디오 창작 흐름 미리보기",
    canvasLabel: "STORY CANVAS",
    saved: "모든 변경 사항 저장됨",
    stageLabel: "어떤 방식으로 시작할까요?",
    quickEyebrow: "START WHERE YOU ARE",
    quickTitle: "지금 하려는 일에서\n바로 시작하세요.",
    quickBody: "기능 이름을 외울 필요 없이, 만들고 싶은 결과를 고르면 알맞은 작업 공간으로 연결됩니다.",
    quickMeta: ["빈 캔버스", "컷과 대사", "캐릭터와 구도", "배경과 소품"],
    flowEyebrow: "ONE CREATIVE LOOP",
    flowTitle: "영감이 작업으로 이어지고,\n작업이 다음 이야기로 이어지도록.",
    flowBody: "툰스튜디오는 단일 편집기를 넘어, 떠올리고 조사하고 만들고 나누는 창작의 전체 흐름을 연결합니다.",
    flowSteps: [
      { title: "감각을 깨우고", body: "오늘의 사물·공간·빛·소리와 5컷 미션으로 빈 화면의 부담을 줄이세요.", href: "/now", action: "오늘의 영감 열기" },
      { title: "근거를 모으고", body: "작품·판본·공개 자료와 출처를 리서치 데스크 한곳에 정리하세요.", href: "/research", action: "리서치 시작하기" },
      { title: "장면으로 만들고", body: "브러시, 레이어, 컷, 말풍선과 3D 도구를 필요한 만큼 조합하세요.", href: "/studio", action: "스튜디오 열기" },
      { title: "사람과 연결하고", body: "다른 창작자의 표현을 발견하고, 작품과 생각을 커뮤니티에서 이어가세요.", href: "/create", action: "창작 갤러리 보기" },
    ],
    deskEyebrow: "CREATOR DESK",
    deskTitle: "막히는 순간마다,\n다음 한 걸음이 보이게.",
    deskBody: "영감, 레퍼런스, 학습 자료와 작가 기회를 흩어진 메뉴가 아닌 하나의 창작 데스크처럼 구성했습니다.",
    resources: [
      { tag: "DAILY", title: "오늘의 영감", body: "매일 달라지는 소재와 5컷 미션", href: "/now" },
      { tag: "RESEARCH", title: "리서치 데스크", body: "출처가 있는 자료와 판단 노트", href: "/research" },
      { tag: "ATLAS", title: "레퍼런스 아틀라스", body: "복식·소품·미술 자료를 장면별로", href: "/research/assets" },
      { tag: "GROW", title: "작가 기회센터", body: "공모전·지원사업·제작 기회", href: "/opportunities" },
    ],
    discoverEyebrow: "CREATE · SHARE · DISCOVER",
    discoverTitle: "만드는 즐거움과\n발견하는 즐거움을 함께.",
    discoverBody: "창작 도구와 작품 탐색이 분리되지 않도록, 다음 행동이 자연스럽게 이어지는 길을 만들었습니다.",
    discovery: [
      { title: "취향으로 탐색", body: "장르와 태그를 따라 다음 작품을 발견하세요.", href: "/explore", action: "작품 탐색" },
      { title: "지금의 흐름", body: "기간과 지표별 인기 변화를 투명하게 살펴보세요.", href: "/ranking", action: "랭킹 보기" },
      { title: "요일별 연재", body: "신작과 연재 일정을 놓치지 않게 정리하세요.", href: "/calendar", action: "연재 캘린더" },
      { title: "함께 이야기", body: "감상과 창작 경험을 사람들과 나누세요.", href: "/community", action: "커뮤니티 열기" },
    ],
    faqEyebrow: "GOOD TO KNOW",
    closingNote: "설치 없이 브라우저에서, 작은 스케치 하나부터 시작하세요.",
  },
  en: {
    heroBadge: "One creative flow, from idea to release",
    heroAside: "DRAW · TELL · BUILD · DISCOVER",
    jumpLabel: "Jump to the main home sections",
    jumpLinks: [
      ["creator-start", "Quick start"],
      ["creator-flow", "Creative flow"],
      ["creator-desk", "Resources"],
      ["creator-film", "Brand film"],
    ],
    previewLabel: "Preview the ToonStudio creative flow",
    canvasLabel: "STORY CANVAS",
    saved: "All changes saved",
    stageLabel: "How would you like to begin?",
    quickEyebrow: "START WHERE YOU ARE",
    quickTitle: "Start with what\nyou want to make.",
    quickBody: "Choose an outcome instead of memorizing feature names. ToonStudio takes you to the right workspace.",
    quickMeta: ["Blank canvas", "Panels & dialogue", "Character & pose", "Backgrounds & props"],
    flowEyebrow: "ONE CREATIVE LOOP",
    flowTitle: "Let inspiration become work,\nand work become another story.",
    flowBody: "Beyond a single editor, ToonStudio connects the complete creative loop: spark, research, making and sharing.",
    flowSteps: [
      { title: "Wake up your senses", body: "Ease into a blank page with a daily object, place, light, sound and five-panel mission.", href: "/now", action: "Open daily inspiration" },
      { title: "Gather evidence", body: "Organize stories, editions, public references and sources in one research desk.", href: "/research", action: "Start researching" },
      { title: "Build the scene", body: "Combine brushes, layers, panels, dialogue and 3D tools as your story needs.", href: "/studio", action: "Open the studio" },
      { title: "Connect with people", body: "Discover other creative voices and continue the conversation with the community.", href: "/create", action: "Visit the creator gallery" },
    ],
    deskEyebrow: "CREATOR DESK",
    deskTitle: "See the next step\nwhenever you get stuck.",
    deskBody: "Inspiration, references, learning and creator opportunities now feel like one desk instead of scattered menus.",
    resources: [
      { tag: "DAILY", title: "Daily inspiration", body: "A new prompt and five-panel mission every day", href: "/now" },
      { tag: "RESEARCH", title: "Research desk", body: "Sourced references and decision notes", href: "/research" },
      { tag: "ATLAS", title: "Reference atlas", body: "Costume, prop and art references by scene", href: "/research/assets" },
      { tag: "GROW", title: "Creator opportunities", body: "Contests, support programs and production calls", href: "/opportunities" },
    ],
    discoverEyebrow: "CREATE · SHARE · DISCOVER",
    discoverTitle: "The joy of making,\nand the joy of discovery.",
    discoverBody: "Creative tools and story discovery live in one continuous journey, so the next action always feels close.",
    discovery: [
      { title: "Explore by taste", body: "Follow genres and tags to find your next story.", href: "/explore", action: "Explore stories" },
      { title: "See what is moving", body: "Read popularity across transparent periods and signals.", href: "/ranking", action: "View rankings" },
      { title: "Track releases", body: "Keep new and returning series organized by day.", href: "/calendar", action: "Open calendar" },
      { title: "Join the conversation", body: "Share reading and creative experiences with people.", href: "/community", action: "Open community" },
    ],
    faqEyebrow: "GOOD TO KNOW",
    closingNote: "Start in your browser, with no installation and even the smallest sketch.",
  },
} as const;

function focusExperienceSection(event: MouseEvent<HTMLAnchorElement>) {
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  ) return;

  const sectionId = event.currentTarget.hash.slice(1);
  if (!sectionId) return;
  window.requestAnimationFrame(() => {
    const section = document.getElementById(sectionId);
    const heading = section?.querySelector<HTMLElement>("h2[tabindex='-1']");
    heading?.focus({ preventScroll: true });
  });
}

function ExperiencePreview({
  copy,
  experience,
  stage,
}: {
  copy: (typeof HOME_COPY)[keyof typeof HOME_COPY];
  experience: (typeof EXPERIENCE_COPY)[keyof typeof EXPERIENCE_COPY];
  stage: number;
}) {
  const selected = copy.stages[stage];

  return (
    <figure className="ce-preview" aria-label={experience.previewLabel}>
      <div className="ce-preview-bar">
        <span className="ce-window-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>{experience.canvasLabel}</span>
        <span className="ce-save-state"><Check size={13} aria-hidden="true" />{experience.saved}</span>
      </div>
      <div className="ce-preview-workspace">
        <div className="ce-tool-rail" aria-hidden="true">
          <MousePointer2 size={18} />
          <span><Brush size={18} /></span>
          <LayoutGrid size={18} />
          <Layers size={18} />
          <Sparkles size={18} />
        </div>
        <div className={`ce-artboard ce-artboard--${selected.id}`}>
          <span className="ce-artboard-kicker">CHAPTER 01 · SCENE 03</span>
          <img src="/brand/studio-scene.svg" alt="" width={720} height={560} fetchPriority="high" />
          <div className="ce-panel-line" aria-hidden="true"><span /><span /><span /></div>
          <p>{selected.title}</p>
        </div>
        <div className="ce-layer-rail" aria-hidden="true">
          <span>LAYERS</span>
          <i className="is-active" /><i /><i /><i />
          <span>COLOR</span>
          <div><b /><b /><b /><b /></div>
        </div>
      </div>
      <figcaption className="ce-preview-footer" aria-live="polite">
        <span><i aria-hidden="true" />{selected.label}</span>
        <Link href={selected.href}>{selected.action}<ArrowRight size={15} aria-hidden="true" /></Link>
      </figcaption>
    </figure>
  );
}

export function CreatorHomeExperience() {
  const language = useI18n((state) => state.lang);
  const locale = creatorHomeLocale(language);
  const copy = HOME_COPY[locale];
  const experience = EXPERIENCE_COPY[locale];
  const [stage, setStage] = useState(0);

  return (
    <div className="creator-home creator-experience" lang={locale} data-creator-home="experience-v2">
      <div className="ce-ambient ce-ambient--one" aria-hidden="true" />
      <div className="ce-ambient ce-ambient--two" aria-hidden="true" />
      <div className="ce-shell">
        <section className="ce-hero" aria-labelledby="creator-home-title">
          <div className="ce-hero-copy">
            <p className="ce-badge"><Sparkles size={14} aria-hidden="true" />{experience.heroBadge}</p>
            <p className="ce-overline">{copy.eyebrow}</p>
            <h1 id="creator-home-title">{copy.title[0]}<br /><span>{copy.title[1]}</span></h1>
            <p className="ce-lead">{copy.description}</p>
            <div className="ce-actions">
              <Link href="/studio" className="ce-button ce-button--primary">{copy.start}<ArrowRight size={19} aria-hidden="true" /></Link>
              <a href="#creator-film" onClick={focusExperienceSection} className="ce-button ce-button--secondary"><Play size={16} fill="currentColor" aria-hidden="true" />{copy.watch}</a>
            </div>
            <p className="ce-note"><Check size={15} aria-hidden="true" />{copy.note}</p>
            <div className="ce-capability-list" aria-label={copy.tools}>
              {copy.strip.map((item) => <span key={item}>{item}</span>)}
            </div>
          </div>

          <div className="ce-hero-visual">
            <p className="ce-visual-caption" aria-hidden="true">{experience.heroAside}</p>
            <ExperiencePreview copy={copy} experience={experience} stage={stage} />
            <div className="ce-stage-switcher" aria-label={experience.stageLabel}>
              {copy.stages.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={stage === index}
                  onClick={() => setStage(index)}
                >
                  <span>0{index + 1}</span>{item.label.replace(/^\d+\s*/, "")}
                </button>
              ))}
            </div>
          </div>
        </section>

        <nav className="ce-jump-nav" aria-label={experience.jumpLabel}>
          <span>EXPLORE THE FLOW</span>
          <div>
            {experience.jumpLinks.map(([href, label], index) => (
              <a key={href} href={`#${href}`} onClick={focusExperienceSection}><span>0{index + 1}</span>{label}<ArrowRight size={14} aria-hidden="true" /></a>
            ))}
          </div>
        </nav>

        <section className="ce-quick-start" id="creator-start" aria-labelledby="creator-start-title">
          <div className="ce-section-intro">
            <p className="ce-overline">{experience.quickEyebrow}</p>
            <h2 id="creator-start-title" tabIndex={-1}>{experience.quickTitle}</h2>
            <p>{experience.quickBody}</p>
          </div>
          <div className="ce-quick-grid">
            {copy.features.map((feature, index) => {
              const Icon = QUICK_START_ICONS[index];
              return (
                <Link href={feature.href} className="ce-quick-card" key={feature.tag}>
                  <div className="ce-card-top"><span>0{index + 1}</span><Icon size={24} strokeWidth={1.6} aria-hidden="true" /></div>
                  <span className="ce-card-meta">{experience.quickMeta[index]}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                  <span className="ce-card-action">{feature.action}<ArrowRight size={16} aria-hidden="true" /></span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="ce-flow" id="creator-flow" aria-labelledby="creator-flow-title">
          <div className="ce-flow-copy">
            <p className="ce-overline">{experience.flowEyebrow}</p>
            <h2 id="creator-flow-title" tabIndex={-1}>{experience.flowTitle}</h2>
            <p>{experience.flowBody}</p>
          </div>
          <ol className="ce-flow-list">
            {experience.flowSteps.map((step, index) => {
              const Icon = JOURNEY_ICONS[index];
              return (
                <li key={step.href}>
                  <span className="ce-flow-number">0{index + 1}</span>
                  <span className="ce-flow-icon"><Icon size={21} strokeWidth={1.7} aria-hidden="true" /></span>
                  <div><h3>{step.title}</h3><p>{step.body}</p><Link href={step.href}>{step.action}<ArrowRight size={15} aria-hidden="true" /></Link></div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="ce-desk" id="creator-desk" aria-labelledby="creator-desk-title">
          <div className="ce-desk-copy">
            <p className="ce-overline">{experience.deskEyebrow}</p>
            <h2 id="creator-desk-title" tabIndex={-1}>{experience.deskTitle}</h2>
            <p>{experience.deskBody}</p>
            <Link href="/research" className="ce-text-link">{experience.resources[1].title}<ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
          <div className="ce-resource-grid">
            {experience.resources.map((resource, index) => (
              <Link href={resource.href} className="ce-resource-card" key={resource.href}>
                <span className="ce-resource-index">0{index + 1}</span>
                <span className="ce-resource-tag">{resource.tag}</span>
                <h3>{resource.title}</h3>
                <p>{resource.body}</p>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <section className="ce-discover" aria-labelledby="creator-discover-title">
          <div className="ce-discover-heading">
            <div><p className="ce-overline">{experience.discoverEyebrow}</p><h2 id="creator-discover-title" tabIndex={-1}>{experience.discoverTitle}</h2></div>
            <p>{experience.discoverBody}</p>
          </div>
          <div className="ce-discover-grid">
            {experience.discovery.map((item, index) => {
              const Icon = DISCOVERY_ICONS[index];
              return (
                <Link href={item.href} key={item.href} className="ce-discover-card">
                  <Icon size={25} strokeWidth={1.55} aria-hidden="true" />
                  <div><h3>{item.title}</h3><p>{item.body}</p><span>{item.action}<ArrowRight size={15} aria-hidden="true" /></span></div>
                </Link>
              );
            })}
          </div>
        </section>

        <CreatorBrandFilm copy={copy} locale={locale} />

        <section className="ce-faq" aria-labelledby="creator-faq-title">
          <div><p className="ce-overline">{experience.faqEyebrow}</p><h2 id="creator-faq-title" tabIndex={-1}>{copy.faqTitle}</h2></div>
          <div className="ce-faq-list">
            {copy.faqs.map((faq, index) => (
              <details key={faq.q} defaultOpen={index === 0}>
                <summary><span>0{index + 1}</span>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="ce-closing" aria-labelledby="creator-closing-title">
          <span className="ce-closing-orbit" aria-hidden="true"><i /><i /><i /></span>
          <p className="ce-overline">{copy.closingEyebrow}</p>
          <h2 id="creator-closing-title" tabIndex={-1}>{copy.closingTitle}</h2>
          <p>{experience.closingNote}</p>
          <Link href="/studio" className="ce-button ce-button--closing">{copy.start}<ArrowRight size={19} aria-hidden="true" /></Link>
        </section>
      </div>
    </div>
  );
}
