import { translateCurrentStaticSourceText, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { Accessibility, ArrowRight, BookOpen, Bot, Boxes, Brush, Check, ClipboardCheck, FileOutput, Map as MapIcon, PackageCheck, PanelsTopLeft, ShieldCheck, Sparkles, Handshake, Users, Workflow, type LucideIcon } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { usePathname } from "@/shared/navigation/navigation";
import { WorkflowIllustration } from "@/shared/components/site-experience/WorkflowIllustration";
import { type WorkflowVisual } from "@/shared/components/site-experience/workflow-illustration";
import { ReferenceCreatorDashboard } from "./ReferenceCreatorDashboard";
import { ProductIntentStart } from "@/domains/creator-resources/ProductIntentStart";
import { PRODUCT_IDENTITY, resolveProductLocale } from "@/shared/lib/product-identity";
import { useI18n } from "@/shared/lib/i18n";
import { useTheme } from "@/shared/lib/theme";

// 작업실 소개(/about/studio)와 공개 홈 래퍼 스타일은 한 파일로 합쳤다. 여백 리듬은 그 다음에 덮는다.
import "./studio-introduction.css";
import "./creator-home-spacing.css";

import { CreatorSectionLink } from "./CreatorHomeNavigation";
import { useCreatorHomeSectionNavigation } from "./use-creator-home-section-navigation";
import { useCinematicJumpNavActive } from "./use-cinematic-jump-nav";
import {
  CinematicHeadline,
  CinematicHeroMesh,
  CinematicHeroVisual,
  CinematicItem,
  CinematicReveal,
} from "./CreatorHomeCinematic";

const JUMP_SECTION_IDS = ["creator-start", "creator-bridge", "creator-flow", "creator-principles", "creator-support"] as const;

interface FlowStep {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly action: string;
}

interface BridgeItem {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly action: string;
}

const FLOW_ART: readonly WorkflowVisual[] = ["plan", "storyboard", "create", "collaborate", "review", "publish"];
const PRINCIPLE_ART: readonly WorkflowVisual[] = ["rights", "ai", "recovery", "learn"];
const SUPPORT_ART: readonly WorkflowVisual[] = ["assets", "collaborate", "learn"];
const FLOW_OUTCOMES = {
  ko: ["작품 설정 · 대본", "장면 순서 · 컷 구성", "선화 · 채색 · 완성 원고", "담당자 · 일정 · 인수인계", "수정 의견 · 검수본", "모바일 미리보기 · 게시본"],
  en: ["Story settings · script", "Scene order · panel layout", "Line art · color · manuscript", "Owners · schedule · handoff", "Feedback · review version", "Mobile preview · release"],
} as const;

const COPY = {
  ko: {
    primary: "새 작품 시작하기",
    secondary: "8분 제품 투어 보기",
    projects: "내 프로젝트",
    brandFilm: "창작 이야기 보기",
    trust: ["전문 2D·3D 제작", "자동 저장·버전·복구", "일정·협업·검수·연재"],
    previewAlt: "햇살이 드는 아틀리에에서 연필 스케치가 채색된 웹툰과 입체적인 이야기 세계로 이어지는 브랜드 콘셉트 아트",
    previewCaption: "작은 아이디어가 하나의 세계가 될 때까지.",
    artworkBadge: "AI로 제작한 브랜드 콘셉트 아트",
    previewBadge: "기능 설명용 제품 콘셉트 화면",
    floatCards: [
      { tag: "3D 배경", title: "컷에 바로 붙는 3D", body: "포즈·소품·카메라를 현재 컷에 연결" },
      { tag: "자동 저장", title: "작업은 알아서 저장", body: "버전 이력으로 언제든 되돌리기" },
    ],
    jumpLabel: "작업실 소개 섹션",
    jumpStart: "바로 시작",
    jumpBridge: "핵심 기능",
    jumpFlow: "제작 흐름",
    jumpPrinciples: "제품 원칙",
    jumpSupport: "소재·협업·도움",
    bridgeEyebrow: "한 프로젝트, 하나의 제작 공간",
    bridgeTitle: "그리기부터 연재 준비까지,\n작업이 끊기지 않게.",
    bridgeBody: "2D 원고, 3D 장면, 협업과 검토가 같은 작품·회차·컷을 가리킵니다. 프로그램 사이에서 파일을 옮기지 않고 한곳에서 이어서 작업하세요.",
    bridgeItems: [
      { icon: Brush, title: "전문 2D 드로잉", body: "브러시·레이어·선택·보정·컷·말풍선·식자를 한 작업실에서.", href: "/studio/canvas", action: "캔버스 열기" },
      { icon: Boxes, title: "3D 캐릭터·배경", body: "프리셋 캐릭터의 포즈와 3D 배경·카메라 구도를 현재 컷에 연결.", href: "/studio/assets/characters/new", action: "3D 캐릭터 만들기" },
      { icon: Users, title: "협업·제작 관리", body: "담당자·마감·수정 요청·승인을 실제 작업물에 연결.", href: "/production", action: "제작 관리 열기" },
      { icon: MapIcon, title: "가상 스튜디오", body: "내 캐릭터로 걷고 만나며 팀과 같은 공간에서 작업.", href: "/studio/space", action: "가상 스튜디오 입장" },
      { icon: Bot, title: "AI 보조", body: "반복 작업과 아이디어 탐색을 돕고, 적용 여부는 창작자가 결정.", href: "/studio/ai-lab", action: "AI 도구 보기" },
    ] satisfies BridgeItem[],
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
      { icon: ClipboardCheck, title: "검토·승인", body: "고정된 검수본에 의견을 남기고 수정본과 승인본을 정확히 구분합니다.", href: "/production/projects/sample-project/review", action: "샘플 검토 체험" },
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
    nextLabel: "이어서 보기",
    next: [
      { href: "/product-tour", label: "8분 제품 투어" },
      { href: "/about/workflow", label: "웹툰 제작 과정" },
      { href: "/about/principles", label: "제품 원칙 12가지" },
      { href: "/about", label: "서비스 소개" },
    ],
  },
  en: {
    primary: "Start a new work",
    secondary: "Watch the 8-minute product tour",
    projects: "My projects",
    brandFilm: "Explore our creative story",
    trust: ["Professional 2D and 3D creation", "Autosave, versions and recovery", "Scheduling, collaboration, review and publishing"],
    previewAlt: "Brand concept art of a sunlit atelier where pencil sketches become painted webtoon panels and a dimensional story world",
    previewCaption: "From a small idea to a world of your own.",
    artworkBadge: "AI-generated brand concept art",
    previewBadge: "Product concept screen for explaining features",
    floatCards: [
      { tag: "3D BACKGROUNDS", title: "3D that snaps to the panel", body: "Pose, props and camera linked to the current panel" },
      { tag: "AUTOSAVE", title: "Work saves itself", body: "Roll back anytime with version history" },
    ],
    jumpLabel: "Studio introduction sections",
    jumpStart: "Start here",
    jumpBridge: "Core features",
    jumpFlow: "Workflow",
    jumpPrinciples: "Product principles",
    jumpSupport: "Assets, people and help",
    bridgeEyebrow: "One project, one creation space",
    bridgeTitle: "Keep the work moving\nfrom drawing to publishing.",
    bridgeBody: "2D art, 3D scenes, collaboration and review refer to the same work, episode and panel. Create and continue without moving files between applications.",
    bridgeItems: [
      { icon: Brush, title: "Professional 2D drawing", body: "Brushes, layers, selection, adjustments, panels, balloons and lettering in one workspace.", href: "/studio/canvas", action: "Open the canvas" },
      { icon: Boxes, title: "3D characters and backgrounds", body: "Pose preset characters and connect 3D sets and camera framing to the current panel.", href: "/studio/assets/characters/new", action: "Create a 3D character" },
      { icon: Users, title: "Collaboration and production", body: "Connect owners, deadlines, revision requests and approvals to the actual work.", href: "/production", action: "Open production" },
      { icon: MapIcon, title: "Virtual studio", body: "Walk, meet and work with your team in one shared space as your character.", href: "/studio/space", action: "Enter the virtual studio" },
      { icon: Bot, title: "AI assistance", body: "Help with repetition and exploration while the creator decides what is applied.", href: "/studio/ai-lab", action: "See AI tools" },
    ] satisfies BridgeItem[],
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
      { icon: ClipboardCheck, title: "Review and approve", body: "Comment on a fixed review version and keep revisions, approvals and releases distinct.", href: "/production/projects/sample-project/review", action: "Try sample review" },
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
    nextLabel: "Continue with",
    next: [
      { href: "/product-tour", label: "8-minute product tour" },
      { href: "/about/workflow", label: "Webtoon workflow" },
      { href: "/about/principles", label: "12 product principles" },
      { href: "/about", label: "About ToonStudio" },
    ],
  },
} as const;

/** 공개 홈(/)은 참고 보드형 대시보드, /about/studio는 작업실 소개 서사를 보여 준다. */
export function CreatorHomeExperience() {
  useCreatorHomeSectionNavigation();
  const pathname = usePathname().replace(/\/+$/u, "").toLowerCase();
  const introduction = pathname === "/about/studio";
  const language = useI18n((state) => state.lang);
  const resolvedTheme = useTheme((state) => state.resolvedTheme);
  const locale = resolveProductLocale(language);
  const bi = useBilingualLocalizer("domains.marketing.CreatorHomeExperience");
  const identity = bi(PRODUCT_IDENTITY.ko, PRODUCT_IDENTITY.en);
  const copy = COPY[locale];
  const activeJumpSection = useCinematicJumpNavActive(JUMP_SECTION_IDS);

  return (
    <div
      className="creator-home creator-experience creator-flagship"
      data-creator-home="production-first"
      data-creator-experience="all-in-one-studio-v3"
      data-theme-art={resolvedTheme}
      data-product-direction="planning-to-publishing"
      data-home-view={introduction ? "introduction" : "dashboard"}
      lang={language}
    >
      {!introduction && <ReferenceCreatorDashboard />}
      {introduction && <>
      <section className="cf-hero cf-shell" aria-labelledby="creator-hero-title">
        <CinematicHeroMesh />
        <div className="cf-hero-copy">
          <p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{identity.category}</p>
          <CinematicHeadline id="creator-hero-title" lines={identity.headline} />
          <p className="cf-lead">{identity.description}</p>
          <div className="cf-actions">
            <Link href="/studio/new" className="cf-button cf-primary">{copy.primary}<ArrowRight size={17} aria-hidden="true" /></Link>
            <Link href="/product-tour" className="cf-button cf-secondary">{copy.secondary}</Link>
          </div>
          <div className="cf-hero-links">
            <Link href="/studio">{copy.projects}<ArrowRight size={14} aria-hidden="true" /></Link>
            <Link href="/brand-film">{copy.brandFilm}<ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className="cf-trust" aria-label={bi("핵심 제작 기능", "Core creation capabilities")}>
            {copy.trust.map((item) => <span key={item}><Check size={12} aria-hidden="true" />{item}</span>)}
          </div>
        </div>
        <CinematicHeroVisual cards={copy.floatCards}>
          <img src="/brand/atelier-20260927/creation-world.webp" alt={copy.previewAlt} width="1586" height="992" fetchPriority="high" decoding="async" />
          <figcaption><span>{copy.previewCaption}</span><span className="cf-artwork-credit"><Sparkles size={13} aria-hidden="true" />{copy.artworkBadge}</span></figcaption>
        </CinematicHeroVisual>
      </section>

      <nav className="cf-jump-nav cf-intro-nav" aria-label={copy.jumpLabel} data-active-section={activeJumpSection ?? undefined}>
        <div className="cf-shell cf-intro-nav-links">
          <CreatorSectionLink sectionId="creator-start">{copy.jumpStart}</CreatorSectionLink>
          <CreatorSectionLink sectionId="creator-bridge">{copy.jumpBridge}</CreatorSectionLink>
          <CreatorSectionLink sectionId="creator-flow">{copy.jumpFlow}</CreatorSectionLink>
          <CreatorSectionLink sectionId="creator-principles">{copy.jumpPrinciples}</CreatorSectionLink>
          <CreatorSectionLink sectionId="creator-support">{copy.jumpSupport}</CreatorSectionLink>
        </div>
      </nav>

      <div id="creator-start" className="cf-shell cf-home-wayfinding">
        <ProductIntentStart headingId="creator-toolkit-title" />
      </div>

      <CinematicReveal id="creator-bridge" className="cf-bridge cf-shell" labelledBy="creator-bridge-title">
        <figure className="cf-bridge-visual">
          <img src="/brand/production-os-workspace.svg" alt={bi("2D·3D 제작, 파일, 일정과 검토가 연결된 ToonStudio 작업공간 예시", "ToonStudio workspace concept connecting 2D, 3D, files, schedules and review")} width="1600" height="980" loading="lazy" />
          <figcaption>{copy.previewBadge}</figcaption>
        </figure>
        <div className="cf-bridge-copy">
          <p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.bridgeEyebrow}</p>
          <h2 id="creator-bridge-title" tabIndex={-1}>{copy.bridgeTitle}</h2>
          <p>{copy.bridgeBody}</p>
          <ul className="cf-bridge-list cf-bridge-list--linked">
            {copy.bridgeItems.map(({ icon: Icon, title, body, href, action }) => (
              <li key={title}>
                <Icon size={19} aria-hidden="true" />
                <div><h3>{title}</h3><p>{body}</p><Link href={href}>{action}<ArrowRight size={14} aria-hidden="true" /></Link></div>
              </li>
            ))}
          </ul>
        </div>
      </CinematicReveal>

      <CinematicReveal id="creator-flow" className="cf-flow" labelledBy="creator-process-title">
        <div className="cf-shell">
          <div className="cf-section-heading">
            <div><p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.flowEyebrow}</p><h2 id="creator-process-title" tabIndex={-1}>{copy.flowTitle}</h2></div>
            <p>{copy.flowIntro}</p>
          </div>
          <figure className="cf-process-art cf-production-journey">
            <img src="/brand/production-os-journey.svg" alt={copy.flowAlt} width="1600" height="680" loading="lazy" />
            <figcaption><span>{translateCurrentStaticSourceText("domains.marketing.CreatorHomeExperience", "en", "TOONSTUDIO · ALL-IN-ONE CREATION FLOW")}</span><span>{copy.flowCaption}</span></figcaption>
          </figure>
          <ol className="cf-flow-grid cf-flow-grid--illustrated">
            {copy.flow.map(({ icon: Icon, title, body, href, action }, index) => (
              <CinematicItem as="li" key={title} dataWorkflowStep={FLOW_ART[index]}>
                <Link className="cf-step-image-link" href={href} aria-label={`${title} — ${action}`}><WorkflowIllustration kind={FLOW_ART[index] ?? "plan"} className="cf-step-art" /><span className="cf-step-image-action" aria-hidden="true">{action}<ArrowRight size={16} /></span></Link>
                <div className="cf-flow-step"><span>{String(index + 1).padStart(2, "0")}</span><Icon size={18} aria-hidden="true" /></div>
                <h3>{title}</h3><p>{body}</p>
                <div className="cf-step-output"><span>{bi("완성되는 것", "You create")}</span><strong>{FLOW_OUTCOMES[locale][index]}</strong></div>
                <div className="cf-step-actions"><Link href={href}>{action}<ArrowRight size={14} aria-hidden="true" /></Link>
                  {copy.flow[index + 1] ? <Link href={copy.flow[index + 1]?.href ?? "/studio"} className="cf-step-next">{bi("다음", "Next")} · {copy.flow[index + 1]?.title}<ArrowRight size={13} aria-hidden="true" /></Link> : <Link href="/studio" className="cf-step-next">{bi("내 작품 관리", "Manage my work")}<ArrowRight size={13} aria-hidden="true" /></Link>}
                </div>
              </CinematicItem>
            ))}
          </ol>
        </div>
      </CinematicReveal>

      <CinematicReveal id="creator-principles" className="cf-principles cf-shell" labelledBy="creator-principles-title">
        <div className="cf-section-heading">
          <div><p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.principlesEyebrow}</p><h2 id="creator-principles-title" tabIndex={-1}>{copy.principlesTitle}</h2></div>
          <div className="cf-principles-intro">
            <p>{copy.principlesBody}</p>
            <Link href="/about/principles">{copy.principlesAction}<ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className="cf-principles-grid">
          {copy.principlesItems.map(({ icon: Icon, title, body }, index) => (
            <CinematicItem as="article" key={title}>
              <WorkflowIllustration kind={PRINCIPLE_ART[index] ?? "rights"} className="cf-principle-art" />
              <div><span>{String(index + 1).padStart(2, "0")}</span><Icon size={20} aria-hidden="true" /></div>
              <h3>{title}</h3><p>{body}</p>
            </CinematicItem>
          ))}
        </div>
      </CinematicReveal>

      <CinematicReveal id="creator-support" className="cf-toolkit cf-shell" labelledBy="creator-support-title">
        <div className="cf-section-heading">
          <div><p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.supportEyebrow}</p><h2 id="creator-support-title" tabIndex={-1}>{copy.supportTitle}</h2></div>
        </div>
        <div className="cf-support-grid">
          {copy.support.map(({ icon: Icon, tag, title, body, href }, index) => (
            <Link key={title} href={href}><WorkflowIllustration kind={SUPPORT_ART[index] ?? "assets"} className="cf-support-art" decorative /><span>{tag}</span><Icon size={22} aria-hidden="true" /><strong>{title}</strong><p>{body}</p><ArrowRight size={18} aria-hidden="true" /></Link>
          ))}
        </div>
      </CinematicReveal>

      <CinematicReveal className="cf-simple-closing cf-shell" labelledBy="creator-closing-title">
        <p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.closingEyebrow}</p>
        <h2 id="creator-closing-title" tabIndex={-1}>{copy.closingTitle}</h2><p>{copy.closingBody}</p>
        <div className="cf-actions">
          <Link href="/studio/new" className="cf-button cf-primary">{copy.closingAction}<ArrowRight size={17} aria-hidden="true" /></Link>
          <Link href="/production/projects/sample-project/overview" className="cf-button cf-secondary">{copy.closingSecondary}</Link>
        </div>
        <nav className="cf-next-pages" aria-label={copy.nextLabel}>
          <span>{copy.nextLabel}</span>
          {copy.next.map((item) => <Link key={item.href} href={item.href}>{item.label}<ArrowRight size={14} aria-hidden="true" /></Link>)}
        </nav>
        <nav className="cf-about-pager" aria-label={bi("소개 순서 이동", "About journey")}>
          <Link href="/about" rel="prev" className="cf-pager-prev">{bi("← 서비스 소개", "← About")}</Link>
          <Link href="/about/workflow" rel="next" className="cf-pager-next">{bi("웹툰 제작 과정 →", "Webtoon workflow →")}</Link>
        </nav>
      </CinematicReveal>
      </>}
    </div>
  );
}
