import {
  ArrowRight,
  BookOpen,
  Brush,
  Check,
  Compass,
  LayoutGrid,
  MessageCircle,
  PanelsTopLeft,
  UserRoundPen,
  type LucideIcon,
} from "lucide-react";

import { ProductIntentStart } from "../creator-resources/ProductIntentStart";
import "./creator-home-experience.css";
import "./creator-flagship.css";

import Link from "@/compat/router-link";
import { useI18n } from "@/shared/lib/i18n";

type Locale = "ko" | "en";

type HomeCard = Readonly<{
  href: string;
  icon: LucideIcon;
  tag: string;
  title: string;
  body: string;
  action: string;
}>;

const COPY = {
  ko: {
    eyebrow: "THE WEBTOON WORKSPACE",
    title: ["아이디어부터", "연재 원고까지."],
    intro: "웹툰을 기획하고, 그리고, 검토하고, 플랫폼 규격으로 내보내는 브라우저 작업실입니다.",
    create: "새 작품 만들기",
    continue: "작업 이어가기",
    trust: ["브라우저에서 바로 시작", "작업 중 자동 저장", "웹툰 규격 내보내기"],
    previewAlt: "콘티와 선화, 채색을 거쳐 웹툰 장면이 완성되는 제작 과정 예시",
    previewCaption: "실제 제작 흐름을 설명하는 예시 이미지",
    createEyebrow: "START WITH AN OUTCOME",
    createTitle: "무엇을 만들까요?",
    createBody: "가장 자주 쓰는 네 가지 시작점만 먼저 보여드려요. 세부 설정은 작업을 시작한 뒤에도 바꿀 수 있습니다.",
    createCards: [
      {
        href: "/studio/new?kind=webtoon&template=webtoon-vertical",
        icon: PanelsTopLeft,
        tag: "WEBTOON",
        title: "세로 웹툰",
        body: "긴 원고, 컷과 말풍선, 모바일 미리보기를 함께 시작합니다.",
        action: "웹툰 시작하기",
      },
      {
        href: "/studio/new?kind=webtoon&template=webtoon-four-cut",
        icon: LayoutGrid,
        tag: "CUTTOON",
        title: "4컷·컷툰",
        body: "미리 나뉜 컷에 장면과 대사를 빠르게 구성합니다.",
        action: "4컷 시작하기",
      },
      {
        href: "/studio/new?kind=illustration&template=illustration-portrait",
        icon: Brush,
        tag: "ILLUSTRATION",
        title: "일러스트",
        body: "레이어와 브러시가 준비된 캔버스에서 바로 그립니다.",
        action: "그림 시작하기",
      },
      {
        href: "/studio/assets/characters/new",
        icon: UserRoundPen,
        tag: "CHARACTER",
        title: "캐릭터 설정",
        body: "표정, 포즈와 캐릭터 참고 자료를 한곳에서 준비합니다.",
        action: "캐릭터 만들기",
      },
    ] satisfies readonly HomeCard[],
    moreFormats: "더 많은 작업 종류 보기",
    flowEyebrow: "ONE IDEA. THREE STEPS.",
    flowTitle: "시작부터 내보내기까지, 길을 잃지 않게.",
    flowBody: "기능 목록을 외우지 않아도 다음 단계가 자연스럽게 이어집니다.",
    flow: [
      {
        tag: "CHOOSE",
        title: "만들 작업을 고르세요.",
        body: "웹툰, 4컷, 일러스트 중 결과물만 고르면 추천 문서가 준비됩니다.",
        href: "/studio/new",
        action: "새 작품 만들기",
      },
      {
        tag: "CREATE",
        title: "그리고 구성하세요.",
        body: "브러시, 컷, 말풍선과 소재는 필요한 순간에만 나타납니다.",
        href: "/studio/projects",
        action: "내 작업 열기",
      },
      {
        tag: "FINISH",
        title: "미리 보고 내보내세요.",
        body: "모바일 읽기 흐름과 플랫폼 규격을 확인한 뒤 파일을 만듭니다.",
        href: "/help",
        action: "내보내기 알아보기",
      },
    ],
    supportEyebrow: "WHEN YOU NEED THE NEXT STEP",
    supportTitle: "필요한 도움은 작업 가까이에.",
    supportBody: "영감, 학습과 커뮤니티는 별도 기능을 찾아 헤매지 않도록 명확한 목적지로 정리했습니다.",
    support: [
      { href: "/discover", icon: Compass, tag: "INSPIRE", title: "영감 찾기", body: "작품과 참고자료에서 다음 장면의 실마리를 찾습니다." },
      { href: "/learn", icon: BookOpen, tag: "LEARN", title: "배우기", body: "첫 3컷부터 선화·채색과 내보내기까지 단계별로 익힙니다." },
      { href: "/community", icon: MessageCircle, tag: "CONNECT", title: "커뮤니티", body: "작품을 보여주고 질문과 협업 경험을 나눕니다." },
    ],
    faqTitle: "시작하기 전에 궁금한 것들",
    faqs: [
      { q: "처음인데 어떤 작업을 골라야 하나요?", a: "세로 웹툰을 고르면 컷과 말풍선, 모바일 미리보기가 준비된 추천 문서로 시작합니다. 한 장면부터 그리고 싶다면 일러스트를 선택하세요." },
      { q: "작업은 어디에 저장되나요?", a: "기본값은 현재 브라우저의 이 기기 저장소입니다. 작업을 시작한 뒤 프로젝트 파일이나 개인 드라이브 백업을 추가할 수 있습니다." },
      { q: "3D나 AI 기능을 먼저 설정해야 하나요?", a: "아니요. 기본 웹툰과 그림 작업은 바로 시작할 수 있고, 3D와 AI 도구는 해당 기능을 선택한 순간에만 안내됩니다." },
    ],
    closingEyebrow: "YOUR NEXT SCENE STARTS HERE",
    closingTitle: "다음 장면은,\n한 번의 시작에서.",
    closingBody: "복잡한 설정 없이 새 작품을 만들거나 마지막 작업을 바로 이어가세요.",
  },
  en: {
    eyebrow: "THE WEBTOON WORKSPACE",
    title: ["From the first idea", "to a finished episode."],
    intro: "Plan, draw, review and export webtoons for publishing from one browser-based workspace.",
    create: "Create new work",
    continue: "Continue working",
    trust: ["Start in your browser", "Autosave while you work", "Export for webtoon platforms"],
    previewAlt: "An example production flow from storyboard and line art to a finished webtoon scene",
    previewCaption: "Illustrative example of the real production flow",
    createEyebrow: "START WITH AN OUTCOME",
    createTitle: "What would you like to make?",
    createBody: "Start with the four most common outcomes. You can change detailed settings after the project opens.",
    createCards: [
      { href: "/studio/new?kind=webtoon&template=webtoon-vertical", icon: PanelsTopLeft, tag: "WEBTOON", title: "Vertical webtoon", body: "Start with a long canvas, panels, balloons and mobile preview.", action: "Start a webtoon" },
      { href: "/studio/new?kind=webtoon&template=webtoon-four-cut", icon: LayoutGrid, tag: "CUTTOON", title: "Four-panel comic", body: "Arrange scenes and dialogue quickly in prepared panels.", action: "Start four panels" },
      { href: "/studio/new?kind=illustration&template=illustration-portrait", icon: Brush, tag: "ILLUSTRATION", title: "Illustration", body: "Draw immediately on a canvas prepared with layers and brushes.", action: "Start drawing" },
      { href: "/studio/assets/characters/new", icon: UserRoundPen, tag: "CHARACTER", title: "Character sheet", body: "Prepare expressions, poses and character references in one place.", action: "Create a character" },
    ] satisfies readonly HomeCard[],
    moreFormats: "Browse more project types",
    flowEyebrow: "ONE IDEA. THREE STEPS.",
    flowTitle: "A clear path from setup to export.",
    flowBody: "You do not need to learn a feature map before making your first scene.",
    flow: [
      { tag: "CHOOSE", title: "Choose an outcome.", body: "Pick a webtoon, four-panel comic or illustration and the recommended document is prepared.", href: "/studio/new", action: "Create new work" },
      { tag: "CREATE", title: "Draw and compose.", body: "Brushes, panels, dialogue and materials appear only when you need them.", href: "/studio/projects", action: "Open My work" },
      { tag: "FINISH", title: "Preview and export.", body: "Check mobile reading flow and platform requirements before creating files.", href: "/help", action: "Learn about export" },
    ],
    supportEyebrow: "WHEN YOU NEED THE NEXT STEP",
    supportTitle: "Help stays close to the work.",
    supportBody: "Inspiration, learning and community are organized as clear destinations instead of another list of tools.",
    support: [
      { href: "/discover", icon: Compass, tag: "INSPIRE", title: "Find inspiration", body: "Find visual and story references for your next scene." },
      { href: "/learn", icon: BookOpen, tag: "LEARN", title: "Learn", body: "Follow guided paths from your first panels to final export." },
      { href: "/community", icon: MessageCircle, tag: "CONNECT", title: "Community", body: "Share work, ask questions and find collaborators." },
    ],
    faqTitle: "Good to know before you start",
    faqs: [
      { q: "Which project should a beginner choose?", a: "Vertical webtoon prepares panels, balloons and mobile preview. Choose Illustration when you want to begin with a single scene." },
      { q: "Where is my work saved?", a: "By default, work is saved on this device in the current browser. You can add a project file or personal-drive backup later." },
      { q: "Do I need to configure 3D or AI first?", a: "No. Core webtoon and drawing work starts immediately. 3D and AI guidance appears only when you open those tools." },
    ],
    closingEyebrow: "YOUR NEXT SCENE STARTS HERE",
    closingTitle: "Your next scene,\none clear start.",
    closingBody: "Create new work without setup overload, or return to the last project immediately.",
  },
} as const;

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

/** A focused creator landing page that explains the product before exposing advanced tools. */
export function CreatorHomeExperience() {
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const copy = COPY[locale];

  return (
    <div
      className="creator-home creator-experience creator-flagship"
      lang={locale}
      data-creator-home="studio-first"
      data-creator-experience="clarity-v1"
    >
      <div className="cf-shell">
        <section className="cf-hero" aria-labelledby="creator-home-title">
          <div className="cf-hero-copy">
            <p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.eyebrow}</p>
            <h1 id="creator-home-title">{copy.title[0]}<br /><em>{copy.title[1]}</em></h1>
            <p className="cf-lead">{copy.intro}</p>
            <div className="cf-actions">
              <Link href="/studio/new" className="cf-button cf-primary">
                {copy.create}<ArrowRight size={19} aria-hidden="true" />
              </Link>
              <Link href="/studio/projects" className="cf-button cf-secondary">{copy.continue}</Link>
            </div>
            <div className="cf-trust">
              {copy.trust.map((item) => <span key={item}><Check size={13} aria-hidden="true" />{item}</span>)}
            </div>
          </div>
          <figure className="cf-home-preview">
            <img
              src="/brand/atelier-process.webp"
              width={1536}
              height={1024}
              decoding="async"
              fetchPriority="high"
              alt={copy.previewAlt}
            />
            <figcaption>{copy.previewCaption}</figcaption>
          </figure>
        </section>

        <ProductIntentStart />

        <section className="cf-toolkit cf-simple-start" id="creator-start" aria-labelledby="creator-toolkit-title">
          <div className="cf-section-heading">
            <div>
              <p className="cf-kicker">{copy.createEyebrow}</p>
              <h2 id="creator-toolkit-title">{copy.createTitle}</h2>
            </div>
            <p>{copy.createBody}</p>
          </div>
          <div className="cf-start-grid">
            {copy.createCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link key={card.href} href={card.href} className="cf-start-card">
                  <span className="cf-start-icon"><Icon size={22} aria-hidden="true" /></span>
                  <span className="cf-start-tag">{card.tag}</span>
                  <strong>{card.title}</strong>
                  <p>{card.body}</p>
                  <span className="cf-start-action">{card.action}<ArrowRight size={15} aria-hidden="true" /></span>
                </Link>
              );
            })}
          </div>
          <Link href="/studio/new" className="cf-link cf-more-formats">
            {copy.moreFormats}<ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>

        <section className="cf-flow" id="creator-flow" aria-labelledby="creator-process-title">
          <div className="cf-section-heading">
            <div>
              <p className="cf-kicker">{copy.flowEyebrow}</p>
              <h2 id="creator-process-title">{copy.flowTitle}</h2>
            </div>
            <p>{copy.flowBody}</p>
          </div>
          <ol>
            {copy.flow.map((item, index) => (
              <li key={item.tag}>
                <div className="cf-flow-step"><span>0{index + 1}</span><span>{item.tag}</span><ArrowRight size={20} aria-hidden="true" /></div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <Link href={item.href}>{item.action}<ArrowRight size={15} aria-hidden="true" /></Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="cf-discover cf-simple-support" aria-labelledby="creator-support-title">
          <div className="cf-section-heading">
            <div>
              <p className="cf-kicker">{copy.supportEyebrow}</p>
              <h2 id="creator-support-title">{copy.supportTitle}</h2>
            </div>
            <p>{copy.supportBody}</p>
          </div>
          <div className="cf-support-grid">
            {copy.support.map((item) => {
              const Icon = item.icon;
              return (
                <Link href={item.href} key={item.href}>
                  <span>{item.tag}</span>
                  <Icon size={23} aria-hidden="true" />
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <ArrowRight size={21} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="cf-faq" aria-labelledby="creator-faq-title">
          <div><p className="cf-kicker">GOOD TO KNOW</p><h2 id="creator-faq-title">{copy.faqTitle}</h2></div>
          <div>
            {copy.faqs.map((faq) => (
              <details key={faq.q}><summary>{faq.q}<span aria-hidden="true">+</span></summary><p>{faq.a}</p></details>
            ))}
          </div>
        </section>

        <section className="cf-simple-closing" aria-labelledby="creator-closing-title">
          <p className="cf-kicker">{copy.closingEyebrow}</p>
          <h2 id="creator-closing-title">{copy.closingTitle}</h2>
          <p>{copy.closingBody}</p>
          <div className="cf-actions">
            <Link href="/studio/new" className="cf-button cf-primary">{copy.create}<ArrowRight size={19} aria-hidden="true" /></Link>
            <Link href="/studio/projects" className="cf-button cf-secondary">{copy.continue}</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
