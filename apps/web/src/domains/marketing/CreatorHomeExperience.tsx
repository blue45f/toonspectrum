import {
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  Accessibility,
  ArrowRight,
  BookOpen,
  Bot,
  Boxes,
  Brush,
  Check,
  ClipboardCheck,
  FileOutput,
  FolderKanban,
  Handshake,
  PackageCheck,
  PanelsTopLeft,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import Link from "@/compat/router-link";
import { ProductIntentStart } from "@/domains/creator-resources/ProductIntentStart";
import { PRODUCT_IDENTITY, PRODUCT_START_DESTINATIONS, resolveProductLocale, type ProductStartDestinationId } from "@/shared/lib/product-identity";
import { useI18n } from "@/shared/lib/i18n";
import { useTheme } from "@/shared/lib/theme";

import "./creator-home-experience.css";
import "./creator-prism.css";
import "./creator-flagship.css";
import "./creator-all-in-one.css";
import "./creator-home-spacing.css";

interface LocalizedText {
  readonly ko: string;
  readonly en: string;
}

interface StartMeta {
  readonly icon: LucideIcon;
  readonly tag: LocalizedText;
  readonly action: LocalizedText;
}

interface FlowStep {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly action: string;
}

const START_META: Record<ProductStartDestinationId, StartMeta> = {
  plan: {
    icon: BookOpen,
    tag: { ko: "기획", en: "Planning" },
    action: { ko: "기획실 열기", en: "Open planning" },
  },
  draw: {
    icon: Brush,
    tag: { ko: "2D 제작", en: "2D creation" },
    action: { ko: "새 작품 만들기", en: "Create a new work" },
  },
  "three-d": {
    icon: Boxes,
    tag: { ko: "3D 제작", en: "3D creation" },
    action: { ko: "3D 장면 만들기", en: "Create a 3D scene" },
  },
  assets: {
    icon: PackageCheck,
    tag: { ko: "소재", en: "Assets" },
    action: { ko: "소재 열기", en: "Open assets" },
  },
  collaborate: {
    icon: Workflow,
    tag: { ko: "제작·협업", en: "Production" },
    action: { ko: "제작 흐름 열기", en: "Open production" },
  },
  publish: {
    icon: FileOutput,
    tag: { ko: "검토·연재", en: "Publishing" },
    action: { ko: "연재 준비 열기", en: "Prepare to publish" },
  },
};

const COPY = {
  ko: {
    primary: "새 작품 시작하기",
    secondary: "8분 제품 투어 보기",
    projects: "내 프로젝트",
    brandFilm: "8분 제품 투어 보기",
    trust: ["전문 2D·3D 제작", "자동 저장·버전·복구", "일정·협업·검수·연재"],
    previewAlt: "기획, 2D·3D 제작, 검토와 연재 준비가 한 프로젝트에서 이어지는 ToonStudio 제품 예시 화면",
    previewCaption: "대본 → 콘티 → 2D·3D 제작 → 검토 → 연재 준비가 하나의 작품 기록으로 이어집니다.",
    previewBadge: "기능 설명용 제품 콘셉트 화면",
    jumpStart: "바로 시작",
    jumpFlow: "전체 제작 흐름",
    jumpPrinciples: "제품 원칙",
    jumpSupport: "소재·협업·도움",
    toolkitEyebrow: "하려는 일에서 시작",
    toolkitTitle: "기능 이름을 몰라도,\n바로 만들 수 있습니다.",
    toolkitIntro: "현재 가진 아이디어·대본·원고에서 시작하세요. 필요한 작업공간과 다음 단계는 ToonStudio가 이어줍니다.",
    bridgeEyebrow: "한 프로젝트, 하나의 제작 공간",
    bridgeTitle: "그리기부터 연재 준비까지,\n작업이 끊기지 않게.",
    bridgeBody: "2D 원고, 3D 장면, 소재, 파일, 일정과 검토가 같은 작품·회차·컷을 가리킵니다. 프로그램 사이에서 파일을 반복해 옮기지 않고 한곳에서 만들고 이어서 작업하세요.",
    bridgeItems: [
      { icon: Brush, title: "전문 2D 제작", body: "브러시·레이어·선택·보정·컷·말풍선·식자를 한 작업실에서 다룹니다." },
      { icon: Boxes, title: "캐릭터·배경 3D", body: "포즈, 소품, 배경, 재질과 카메라 구도를 만들고 현재 컷에 연결합니다." },
      { icon: FolderKanban, title: "파일·버전·복구", body: "자동 저장과 버전 이력으로 다른 기기에서도 안전하게 이어갑니다." },
      { icon: Users, title: "일정·협업·검수", body: "담당자, 마감, 수정 요청, 승인과 연재 준비를 실제 작업물에 연결합니다." },
    ],
    flowEyebrow: "기획부터 연재까지",
    flowTitle: "모든 단계가 다음 작업으로\n자연스럽게 이어집니다.",
    flowIntro: "기능마다 새로운 파일과 페이지를 찾지 않아도 됩니다. 하나의 작품 프로젝트가 현재 위치와 다음 행동을 알려줍니다.",
    flowAlt: "기획, 콘티, 2D·3D 제작, 협업, 검토와 연재가 연결된 ToonStudio 제작 흐름 예시",
    flowCaption: "표시된 수치는 기능 이해를 위한 예시이며 실제 사용자 통계가 아닙니다.",
    flow: [
      { icon: BookOpen, title: "기획·대본", body: "작품 설정, 캐릭터, 시즌, 회차와 대본을 제작 기준으로 정리합니다.", href: "/story-lab", action: "기획 시작" },
      { icon: PanelsTopLeft, title: "콘티·컷 구성", body: "대본을 장면과 컷으로 나누고 스크롤 리듬과 연출을 설계합니다.", href: "/studio/new", action: "콘티 만들기" },
      { icon: Brush, title: "2D·3D 제작", body: "선화·채색·식자와 캐릭터 포즈·배경·카메라를 직접 제작합니다.", href: "/studio", action: "작업실 열기" },
      { icon: Workflow, title: "일정·협업", body: "역할, 담당자, 선행 작업, 마감과 인수인계를 실제 산출물에 연결합니다.", href: "/production", action: "제작 흐름 보기" },
      { icon: ClipboardCheck, title: "검토·승인", body: "고정된 검수본에 의견을 남기고 수정본과 승인본을 정확히 구분합니다.", href: "/production/projects/sample-project/review", action: "검토 화면 보기" },
      { icon: FileOutput, title: "연재·배포", body: "규격과 권리를 검사하고 모바일 미리보기와 게시본을 준비합니다.", href: "/studio/publish", action: "연재 준비" },
    ] satisfies FlowStep[],
    principlesEyebrow: "창작자를 중심에 둔 제품 원칙",
    principlesTitle: "연결하되 가두지 않고,\n도와주되 대신하지 않습니다.",
    principlesBody: "툰스튜디오는 작품 완성과 창작자의 통제권을 함께 지키는 방향으로 기능을 설계합니다. 중요한 저장·공개·AI·권리 선택은 사용자가 이해하고 결정할 수 있어야 합니다.",
    principlesAction: "12가지 제품 원칙 보기",
    principlesItems: [
      { icon: ShieldCheck, title: "작품과 결정권은 창작자에게", body: "게시·공유·외부 연결은 선택이며 원고와 프로젝트의 통제권을 우선합니다." },
      { icon: Bot, title: "AI는 보조 도구로", body: "아이디어와 반복 작업을 돕되 결과 적용과 최종 판단은 창작자가 결정합니다." },
      { icon: FileOutput, title: "가져오고 내보낼 수 있게", body: "이미지·PSD·로컬 저장과 백업을 확장해 서비스 안에 결과물을 가두지 않습니다." },
      { icon: Accessibility, title: "누구나 핵심 작업을 완료하도록", body: "키보드, 스크린 리더, 고대비, 모션 감소와 작은 화면을 기본 품질로 봅니다." },
    ],
    supportEyebrow: "필요한 모든 재료와 사람",
    supportTitle: "작품 밖으로 나가지 않고,\n찾고 배우고 함께 만드세요.",
    support: [
      { icon: PackageCheck, tag: "소재 마켓", title: "바로 쓸 소재 찾기", body: "브러시·배경·캐릭터·3D·폰트와 사용 권리를 확인하고 프로젝트에 추가합니다.", href: "/market" },
      { icon: Handshake, tag: "함께 만들기", title: "팀원·외부 작업자 연결", body: "역할, 작업 범위, 마감과 완료 기준을 분명히 한 뒤 안전하게 협업합니다.", href: "/collaborate" },
      { icon: BookOpen, tag: "배우기", title: "막힌 단계에서 바로 도움받기", body: "현재 화면과 제작 단계에 맞는 쉬운 설명, 예제와 복구 방법을 찾습니다.", href: "/learn" },
    ],
    closingEyebrow: "ToonStudio",
    closingTitle: "작품을 시작하는 순간부터,\n독자에게 공개하는 순간까지.",
    closingBody: "대본·콘티·2D·3D·소재·파일·일정·협업·검토와 연재 준비를 하나의 프로젝트에서 끝까지 이어가세요.",
    closingAction: "새 작품 시작하기",
    closingSecondary: "샘플 제작 흐름 보기",
  },
  en: {
    primary: "Start a new work",
    secondary: "Watch the 8-minute product tour",
    projects: "My projects",
    brandFilm: "Watch 8-minute product tour",
    trust: ["Professional 2D and 3D creation", "Autosave, versions and recovery", "Scheduling, collaboration, review and publishing"],
    previewAlt: "A ToonStudio product concept connecting planning, 2D and 3D creation, review and publishing inside one project",
    previewCaption: "Script, storyboard, 2D and 3D creation, review and publishing stay connected to one work.",
    previewBadge: "Product concept screen for explaining features",
    jumpStart: "Start here",
    jumpFlow: "Full workflow",
    jumpPrinciples: "Product principles",
    jumpSupport: "Assets, people and help",
    toolkitEyebrow: "Start from your task",
    toolkitTitle: "Create right away,\neven before you know every feature name.",
    toolkitIntro: "Start from the idea, script or files you already have. ToonStudio connects the right workspace and the next step.",
    bridgeEyebrow: "One project, one creation space",
    bridgeTitle: "Keep the work moving\nfrom drawing to publishing.",
    bridgeBody: "2D art, 3D scenes, assets, files, schedules and review refer to the same work, episode and panel. Create and continue without repeatedly moving files between applications.",
    bridgeItems: [
      { icon: Brush, title: "Professional 2D creation", body: "Use brushes, layers, selection, adjustments, panels, balloons and lettering in one workspace." },
      { icon: Boxes, title: "3D characters and backgrounds", body: "Build poses, props, backgrounds, materials and camera compositions for the current panel." },
      { icon: FolderKanban, title: "Files, versions and recovery", body: "Continue safely across devices with autosave and version history." },
      { icon: Users, title: "Schedule, collaborate and review", body: "Connect owners, deadlines, feedback, approvals and publishing to the actual work." },
    ],
    flowEyebrow: "From planning to publishing",
    flowTitle: "Every stage leads naturally\nto the next task.",
    flowIntro: "You do not need to hunt through a new page and file for every feature. One project keeps the current context and next action clear.",
    flowAlt: "A ToonStudio workflow connecting planning, storyboards, 2D and 3D creation, collaboration, review and publishing",
    flowCaption: "Displayed figures are examples for explaining the product, not live user statistics.",
    flow: [
      { icon: BookOpen, title: "Plan and script", body: "Shape the world, characters, seasons, episodes and scripts as production-ready source material.", href: "/story-lab", action: "Start planning" },
      { icon: PanelsTopLeft, title: "Storyboard and panels", body: "Turn the script into scenes and panels while designing scroll rhythm and direction.", href: "/studio/new", action: "Create a storyboard" },
      { icon: Brush, title: "Create in 2D and 3D", body: "Produce line art, color, lettering, character poses, backgrounds and camera compositions.", href: "/studio", action: "Open the studio" },
      { icon: Workflow, title: "Schedule and collaborate", body: "Connect roles, owners, dependencies, deadlines and handoffs to real deliverables.", href: "/production", action: "Open production" },
      { icon: ClipboardCheck, title: "Review and approve", body: "Comment on a fixed review version and keep revisions, approvals and releases distinct.", href: "/production/projects/sample-project/review", action: "See review" },
      { icon: FileOutput, title: "Publish and deliver", body: "Check format and rights, preview mobile reading and prepare a release.", href: "/studio/publish", action: "Prepare to publish" },
    ] satisfies FlowStep[],
    principlesEyebrow: "Creator-first product principles",
    principlesTitle: "Connected without lock-in,\nassisted without replacement.",
    principlesBody: "ToonStudio is designed to help creators finish work while retaining control. Important choices about storage, publishing, AI and rights should remain understandable and user-controlled.",
    principlesAction: "See all 12 product principles",
    principlesItems: [
      { icon: ShieldCheck, title: "The creator controls the work", body: "Publishing, sharing and external connections remain choices, with control of artwork and projects prioritised." },
      { icon: Bot, title: "AI remains an assistant", body: "AI can help with ideas and repetitive work, while the creator decides what is applied and what is final." },
      { icon: FileOutput, title: "Import, export and keep a copy", body: "Image, PSD, local storage and backup paths expand so results are not locked inside one service." },
      { icon: Accessibility, title: "Core work should remain reachable", body: "Keyboard use, screen readers, high contrast, reduced motion and small screens are baseline quality." },
    ],
    supportEyebrow: "Every asset, person and answer you need",
    supportTitle: "Find, learn and collaborate\nwithout leaving the work.",
    support: [
      { icon: PackageCheck, tag: "Asset market", title: "Find production-ready assets", body: "Check brushes, backgrounds, characters, 3D assets, fonts and usage rights, then add them to the project.", href: "/market" },
      { icon: Handshake, tag: "Collaborate", title: "Connect teammates and specialists", body: "Collaborate safely with clear roles, scope, deadlines and completion criteria.", href: "/collaborate" },
      { icon: BookOpen, tag: "Learn", title: "Get help at the blocked step", body: "Find plain-language guidance, examples and recovery steps for the current screen and production stage.", href: "/learn" },
    ],
    closingEyebrow: "ToonStudio",
    closingTitle: "From the moment a work begins\nto the moment readers see it.",
    closingBody: "Connect scripts, storyboards, 2D, 3D, assets, files, schedules, collaboration, review and publishing in one project.",
    closingAction: "Start a new work",
    closingSecondary: "See a sample workflow",
  },
} as const;

function localeText(copy: LocalizedText, _locale) {
  return bi((copy).ko, (copy).en);
}

export function CreatorHomeExperience() {
  useBilingualI18nRevision();
  useCreatorHomeSectionNavigation();
  const language = useI18n((state) => state.lang);
  const resolvedTheme = useTheme((state) => state.resolvedTheme);
  const locale = resolveProductLocale(language);
  const identity = bi((PRODUCT_IDENTITY).ko, (PRODUCT_IDENTITY).en);
  const copy = bi((COPY).ko, (COPY).en);

  return (
    <div
      className="creator-home creator-experience creator-flagship"
      data-creator-home="production-first"
      data-creator-experience="all-in-one-studio-v3"
      data-theme-art={resolvedTheme}
      data-product-direction="planning-to-publishing"
      lang={locale}
    >
      <section className="cf-hero cf-shell" aria-labelledby="creator-hero-title">
        <div className="cf-hero-copy">
          <p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{identity.category}</p>
          <h1 id="creator-hero-title">{identity.headline[0]}<br /><em>{identity.headline[1]}</em></h1>
          <p className="cf-lead">{identity.description}</p>
          <div className="cf-actions">
            <Link href="/studio/new" className="cf-button cf-primary">{copy.primary}<ArrowRight size={17} aria-hidden="true" /></Link>
            <Link href="/product-tour" className="cf-button cf-secondary">{copy.secondary}</Link>
          </div>
          <div className="cf-hero-links">
            <Link href="/studio/projects">{copy.projects}<ArrowRight size={14} aria-hidden="true" /></Link>
            <Link href="/brand-film">{copy.brandFilm}<ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className="cf-trust" aria-label={bi("핵심 제작 기능", "Core creation capabilities")}>
            {copy.trust.map((item) => <span key={item}><Check size={12} aria-hidden="true" />{item}</span>)}
          </div>
        </div>
        <figure className="cf-home-preview cf-production-preview">
          <img src="/brand/production-os-hero.svg" alt={copy.previewAlt} width="1600" height="1120" fetchPriority="high" />
          <span className="cf-preview-badge"><Sparkles size={13} aria-hidden="true" />{copy.previewBadge}</span>
          <figcaption>{copy.previewCaption}</figcaption>
        </figure>
      </section>

      <div className="cf-shell cf-home-wayfinding">
        <ProductIntentStart />
        <nav className="cf-jump-nav" aria-label={locale === "ko" ? "홈 주요 영역" : "Home sections"}>
          <a href="#creator-start">{copy.jumpStart}</a>
          <a href="#creator-flow">{copy.jumpFlow}</a>
          <a href="#creator-principles">{copy.jumpPrinciples}</a>
          <a href="#creator-support">{copy.jumpSupport}</a>
        </nav>
      </div>

      <section id="creator-start" className="cf-toolkit cf-shell" aria-labelledby="creator-toolkit-title">
        <div className="cf-section-heading">
          <div><p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.toolkitEyebrow}</p><h2 id="creator-toolkit-title" tabIndex={-1}>{copy.toolkitTitle}</h2></div>
          <p>{copy.toolkitIntro}</p>
        </div>
        <div className="cf-start-grid">
          {PRODUCT_START_DESTINATIONS.filter((destination) => ["plan", "draw", "three-d"].includes(destination.id) || destination.id === "assets").map((destination) => {
            const meta = START_META[destination.id];
            const Icon = meta.icon;
            return (
              <Link key={destination.id} href={destination.href} className="cf-start-card">
                <span className="cf-start-icon"><Icon size={24} aria-hidden="true" /></span>
                <span className="cf-start-tag">{localeText(meta.tag, locale)}</span>
                <strong>{bi((destination.label).ko, (destination.label).en)}</strong><p>{bi((destination.description).ko, (destination.description).en)}</p>
                <span className="cf-start-action">{localeText(meta.action, locale)}<ArrowRight size={15} aria-hidden="true" /></span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="cf-bridge cf-shell" aria-labelledby="creator-bridge-title">
        <figure className="cf-bridge-visual">
          <img src="/brand/production-os-workspace.svg" alt={bi("2D·3D 제작, 파일, 일정과 검토가 연결된 ToonStudio 작업공간 예시", "ToonStudio workspace concept connecting 2D, 3D, files, schedules and review")} width="1600" height="980" loading="lazy" />
          <figcaption>{copy.previewBadge}</figcaption>
        </figure>
        <div className="cf-bridge-copy">
          <p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.bridgeEyebrow}</p>
          <h2 id="creator-bridge-title">{copy.bridgeTitle}</h2>
          <p>{copy.bridgeBody}</p>
          <div className="cf-bridge-list">
            {copy.bridgeItems.map(({ icon: Icon, title, body }) => <article key={title}><Icon size={19} aria-hidden="true" /><div><h3>{title}</h3><p>{body}</p></div></article>)}
          </div>
        </div>
      </section>

      <section id="creator-flow" className="cf-flow" aria-labelledby="creator-process-title">
        <div className="cf-shell">
          <div className="cf-section-heading">
            <div><p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.flowEyebrow}</p><h2 id="creator-process-title" tabIndex={-1}>{copy.flowTitle}</h2></div>
            <p>{copy.flowIntro}</p>
          </div>
          <figure className="cf-process-art cf-production-journey">
            <img src="/brand/production-os-journey.svg" alt={copy.flowAlt} width="1600" height="680" loading="lazy" />
            <figcaption><span>{translateCurrentStaticSourceText("domains.marketing.CreatorHomeExperience", "en", "TOONSTUDIO · ALL-IN-ONE CREATION FLOW")}</span><span>{copy.flowCaption}</span></figcaption>
          </figure>
          <ol className="cf-flow-grid">
            {copy.flow.map(({ icon: Icon, title, body, href, action }, index) => (
              <li key={title}>
                <div className="cf-flow-step"><span>{String(index + 1).padStart(2, "0")}</span><Icon size={18} aria-hidden="true" /></div>
                <h3>{title}</h3><p>{body}</p><Link href={href}>{action}<ArrowRight size={14} aria-hidden="true" /></Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="creator-principles" className="cf-principles cf-shell" aria-labelledby="creator-principles-title">
        <div className="cf-section-heading">
          <div><p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.principlesEyebrow}</p><h2 id="creator-principles-title" tabIndex={-1}>{copy.principlesTitle}</h2></div>
          <div className="cf-principles-intro">
            <p>{copy.principlesBody}</p>
            <Link href="/about/principles">{copy.principlesAction}<ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className="cf-principles-grid">
          {copy.principlesItems.map(({ icon: Icon, title, body }, index) => (
            <article key={title}>
              <div><span>{String(index + 1).padStart(2, "0")}</span><Icon size={20} aria-hidden="true" /></div>
              <h3>{title}</h3><p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="creator-support" className="cf-toolkit cf-shell" aria-labelledby="creator-support-title">
        <div className="cf-section-heading">
          <div><p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.supportEyebrow}</p><h2 id="creator-support-title" tabIndex={-1}>{copy.supportTitle}</h2></div>
        </div>
        <div className="cf-support-grid">
          {copy.support.map(({ icon: Icon, tag, title, body, href }) => (
            <Link key={title} href={href}><span>{tag}</span><Icon size={22} aria-hidden="true" /><strong>{title}</strong><p>{body}</p><ArrowRight size={18} aria-hidden="true" /></Link>
          ))}
        </div>
      </section>

      <section className="cf-simple-closing cf-shell" aria-labelledby="creator-closing-title">
        <p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.closingEyebrow}</p>
        <h2 id="creator-closing-title" tabIndex={-1}>{copy.closingTitle}</h2><p>{copy.closingBody}</p>
        <div className="cf-actions">
          <Link href="/studio/new" className="cf-button cf-primary">{copy.closingAction}<ArrowRight size={17} aria-hidden="true" /></Link>
          <Link href="/production/projects/sample-project/overview" className="cf-button cf-secondary">{copy.closingSecondary}</Link>
        </div>
      </section>
    </div>
  );
}
