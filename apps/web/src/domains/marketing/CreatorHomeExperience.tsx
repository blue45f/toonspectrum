import {
  ArrowRight,
  BookOpen,
  Boxes,
  Brush,
  Check,
  ClipboardCheck,
  Compass,
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

import { CreatorHomeNavigation } from "./CreatorHomeNavigation";

import { ProductIntentStart } from "@/domains/creator-resources/ProductIntentStart";
import Link from "@/compat/router-link";
import { useI18n } from "@/shared/lib/i18n";

import "./creator-home-experience.css";
import "./creator-prism.css";
import "./creator-flagship.css";

interface HomeCard {
  icon: LucideIcon;
  tag: string;
  title: string;
  body: string;
  href: string;
  action: string;
}

interface FlowStep {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  action: string;
}

const COPY = {
  ko: {
    eyebrow: "웹툰 제작 운영 플랫폼",
    title: ["그림은 익숙한 도구에서.", "제작은 한곳에서."],
    intro: "기획·회차·파일·일정·검수·계약·배포까지. 흩어진 웹툰 제작을 하나의 흐름으로 연결합니다.",
    primary: "제작 관리 둘러보기",
    secondary: "새 작품 시작하기",
    projects: "내 프로젝트",
    trust: ["기존 드로잉 도구 그대로", "회차·버전·수정 요청 한눈에", "플랫폼별 내보내기"],
    previewAlt: "웹툰 작가가 기획, 작화, 검수, 공개 단계를 한 작업실에서 관리하는 모습",
    previewCaption: "아이디어 → 기획 → 작화 → 검수 → 공개가 한 흐름으로 이어집니다.",
    previewBadge: "기능을 설명하기 위한 AI 생성 예시 이미지",
    jumpStart: "무엇을 하려는지 고르세요",
    jumpFlow: "제작 순서 보기",
    jumpSupport: "도움·협업 찾기",
    toolkitEyebrow: "바로 시작",
    toolkitTitle: "기능 이름보다, 하려는 일로 찾으세요.",
    toolkitIntro: "처음 방문한 사람도 목적만 고르면 알맞은 화면으로 바로 이동합니다.",
    starts: [
      { icon: Workflow, tag: "전체 흐름", title: "작품 전체 관리", body: "기획, 회차, 일정, 팀 작업, 검수와 계약을 한 화면에서 봅니다.", href: "/production", action: "제작 관리 열기" },
      { icon: Brush, tag: "원고 작업", title: "직접 그리기", body: "웹툰, 컷툰, 일러스트에 맞는 작업공간을 바로 시작합니다.", href: "/studio/new", action: "새 작품 만들기" },
      { icon: Boxes, tag: "파일·소재", title: "작품 재료 정리", body: "캐릭터, 배경, 브러시, 오디오와 사용 권리를 함께 모읍니다.", href: "/studio/assets", action: "작품 재료 보기" },
      { icon: PackageCheck, tag: "완성 단계", title: "검수하고 내보내기", body: "모바일 읽기 흐름과 플랫폼 규격을 확인한 뒤 파일을 만듭니다.", href: "/studio/publish", action: "검수·내보내기" },
    ] satisfies HomeCard[],
    bridgeEyebrow: "도구를 바꿀 필요 없음",
    bridgeTitle: "그림 도구는 그대로.\n작품의 흐름만 연결하세요.",
    bridgeBody: "Clip Studio, Photoshop, Procreate와 로컬 파일을 그대로 쓰면서 ToonStudio에서 회차, 담당자, 최신 버전과 수정 요청을 관리합니다.",
    bridgeItems: [
      { icon: FolderKanban, title: "최신 파일이 무엇인지", body: "회차와 작업 단계별 최신본을 바로 확인합니다." },
      { icon: Users, title: "누가 무엇을 하는지", body: "담당자와 마감, 다음 확인자를 한눈에 봅니다." },
      { icon: ClipboardCheck, title: "무엇을 고쳐야 하는지", body: "수정 요청을 장면과 파일에 붙여 놓치지 않습니다." },
      { icon: ShieldCheck, title: "어디에 써도 되는지", body: "작품 재료의 출처와 사용 권리를 함께 기록합니다." },
    ],
    flowEyebrow: "한눈에 보는 제작 순서",
    flowTitle: "아이디어부터 공개 준비까지,\n다음 할 일이 끊기지 않게.",
    flowIntro: "각 단계는 독립된 복잡한 도구가 아니라 하나의 작품 기록으로 연결됩니다.",
    flowAlt: "기획, 작화, 협업, 검수, 내보내기 기능이 연결된 ToonStudio 예시 화면",
    flowCaption: "설명을 위한 AI 생성 예시 화면이며 표시된 수치는 실제 서비스 통계가 아닙니다.",
    flow: [
      { icon: BookOpen, title: "기획 정리", body: "작품 목표, 세계관, 시즌과 회차 기준을 먼저 맞춥니다.", href: "/production/projects/sample-project/planning", action: "기획 보기" },
      { icon: PanelsTopLeft, title: "회차 나누기", body: "회차별 장면과 컷, 마감 흐름을 정리합니다.", href: "/production/projects/sample-project/episodes", action: "회차 보기" },
      { icon: Handshake, title: "작업 넘기기", body: "스토리에서 콘티와 작화로 넘어갈 때 꼭 지킬 내용을 남깁니다.", href: "/production/projects/sample-project/handoff", action: "작업 넘기기 보기" },
      { icon: Workflow, title: "진행 확인", body: "담당자, 일정, 막힌 작업과 다음 할 일을 한곳에서 봅니다.", href: "/production/projects/sample-project/production", action: "작업 보드 보기" },
      { icon: ClipboardCheck, title: "검수·수정", body: "수정 요청과 승인 상태를 최신 파일에 연결합니다.", href: "/production/projects/sample-project/review", action: "검수 보기" },
      { icon: FileOutput, title: "내보내기", body: "플랫폼 규격과 권리를 점검하고 제출 파일을 만듭니다.", href: "/studio/publish", action: "내보내기 보기" },
    ] satisfies FlowStep[],
    supportEyebrow: "필요할 때 확장",
    supportTitle: "제작을 중심에 두고,\n사람·자료·시장과 연결합니다.",
    support: [
      { icon: Handshake, tag: "함께 만들기", title: "팀원·외주 찾기", body: "글, 콘티, 작화, 배경, 채색 등 필요한 역할과 연결합니다.", href: "/collaborate" },
      { icon: Compass, tag: "시장 이해", title: "작품·트렌드 살펴보기", body: "다른 작품과 플랫폼 흐름을 다음 기획의 참고자료로 활용합니다.", href: "/discover" },
      { icon: BookOpen, tag: "막힐 때", title: "쉬운 설명으로 배우기", body: "처음 시작, 제작 단계, 문제 해결을 작업 순서에 맞춰 찾습니다.", href: "/learn" },
    ],
    closingEyebrow: "ToonStudio",
    closingTitle: "작화 프로그램은 많습니다.\n작품 전체를 책임지는 공간은 드뭅니다.",
    closingBody: "그림은 원하는 도구로 그리고, 작품의 기획·파일·사람·검수·권리는 한곳에서 이어가세요.",
    closingAction: "제작 관리 시작하기",
    closingSecondary: "기능 미리 보기",
  },
  en: {
    eyebrow: "Webtoon production workspace",
    title: ["Draw with the tools you know.", "Run production in one place."],
    intro: "Connect planning, episodes, files, schedules, review, agreements and delivery in one clear production flow.",
    primary: "Explore production",
    secondary: "Start a new work",
    projects: "My projects",
    trust: ["Keep your drawing tools", "See versions and feedback clearly", "Export for each platform"],
    previewAlt: "A webtoon creator managing planning, drawing, review and publishing in one workspace",
    previewCaption: "Idea, planning, drawing, review and delivery stay connected.",
    previewBadge: "AI-generated concept image for explaining the product",
    jumpStart: "Choose your goal",
    jumpFlow: "See the workflow",
    jumpSupport: "Find help and people",
    toolkitEyebrow: "Start now",
    toolkitTitle: "Find features by what you need to do.",
    toolkitIntro: "Choose a goal and go straight to the right workspace, even on your first visit.",
    starts: [
      { icon: Workflow, tag: "Full flow", title: "Run the whole work", body: "See planning, episodes, schedule, teamwork, review and agreements together.", href: "/production", action: "Open production" },
      { icon: Brush, tag: "Drawing", title: "Draw the work", body: "Start the right workspace for a webtoon, short comic or illustration.", href: "/studio/new", action: "Create new work" },
      { icon: Boxes, tag: "Files & assets", title: "Organize assets", body: "Keep characters, backgrounds, brushes, audio and usage rights together.", href: "/studio/assets", action: "View assets" },
      { icon: PackageCheck, tag: "Finish", title: "Review and export", body: "Check mobile reading flow and platform requirements before export.", href: "/studio/publish", action: "Review & export" },
    ] satisfies HomeCard[],
    bridgeEyebrow: "No tool migration required",
    bridgeTitle: "Keep your drawing tools.\nConnect the production flow.",
    bridgeBody: "Use Clip Studio, Photoshop, Procreate and local files as before, while ToonStudio tracks episodes, owners, latest versions and feedback.",
    bridgeItems: [
      { icon: FolderKanban, title: "Know the latest file", body: "See the current version for every episode and stage." },
      { icon: Users, title: "Know who owns what", body: "See owners, deadlines and the next reviewer." },
      { icon: ClipboardCheck, title: "Know what to fix", body: "Attach feedback to scenes and files so nothing gets lost." },
      { icon: ShieldCheck, title: "Know where assets can be used", body: "Track sources and usage rights with the work." },
    ],
    flowEyebrow: "The production flow",
    flowTitle: "From idea to delivery,\nkeep the next step clear.",
    flowIntro: "Every stage contributes to one connected record of the work.",
    flowAlt: "A ToonStudio concept showing connected planning, drawing, collaboration, review and export tools",
    flowCaption: "AI-generated concept screen for explanation; displayed figures are not service statistics.",
    flow: [
      { icon: BookOpen, title: "Plan", body: "Align the work, world, season and episode goals.", href: "/production/projects/sample-project/planning", action: "See planning" },
      { icon: PanelsTopLeft, title: "Break down episodes", body: "Organize scenes, panels and deadlines by episode.", href: "/production/projects/sample-project/episodes", action: "See episodes" },
      { icon: Handshake, title: "Pass work clearly", body: "Record what must stay intact when work moves to art.", href: "/production/projects/sample-project/handoff", action: "See handoff" },
      { icon: Workflow, title: "Track progress", body: "See owners, timing, blockers and next actions together.", href: "/production/projects/sample-project/production", action: "See work board" },
      { icon: ClipboardCheck, title: "Review and revise", body: "Connect feedback and approvals to the latest file.", href: "/production/projects/sample-project/review", action: "See review" },
      { icon: FileOutput, title: "Deliver", body: "Check rights and platform requirements before export.", href: "/studio/publish", action: "See export" },
    ] satisfies FlowStep[],
    supportEyebrow: "Expand when needed",
    supportTitle: "Keep production central,\nthen connect people and insight.",
    support: [
      { icon: Handshake, tag: "Collaborate", title: "Find teammates and specialists", body: "Connect with writing, storyboard, art, background and color roles.", href: "/collaborate" },
      { icon: Compass, tag: "Market insight", title: "Explore work and trends", body: "Use stories and platform movement as references for your next plan.", href: "/discover" },
      { icon: BookOpen, tag: "Learn", title: "Get plain-language help", body: "Find guidance by production step and problem.", href: "/learn" },
    ],
    closingEyebrow: "ToonStudio",
    closingTitle: "There are many drawing apps.\nFew places take care of the whole work.",
    closingBody: "Draw in the tools you choose. Keep planning, files, people, review and rights connected in one place.",
    closingAction: "Start production",
    closingSecondary: "Preview features",
  },
} as const;

export function CreatorHomeExperience() {
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const copy = COPY[locale];

  return (
    <main
      className="creator-home creator-experience creator-flagship"
      data-creator-home="production-first"
      data-creator-experience="production-os-v2"
      lang={locale}
    >
      <CreatorHomeNavigation locale={locale} />
      <div className="cf-shell"><ProductIntentStart /></div>

      <section className="cf-hero cf-shell" aria-labelledby="creator-hero-title">
        <div className="cf-hero-copy">
          <p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.eyebrow}</p>
          <h1 id="creator-hero-title">{copy.title[0]}<br /><em>{copy.title[1]}</em></h1>
          <p className="cf-lead">{copy.intro}</p>
          <div className="cf-actions">
            <Link href="/production" className="cf-button cf-primary">{copy.primary}<ArrowRight size={17} aria-hidden="true" /></Link>
            <Link href="/studio/new" className="cf-button cf-secondary">{copy.secondary}</Link>
          </div>
          <div className="cf-hero-links"><Link href="/studio/projects">{copy.projects}<ArrowRight size={14} aria-hidden="true" /></Link></div>
          <div className="cf-trust" aria-label={locale === "ko" ? "핵심 장점" : "Core advantages"}>
            {copy.trust.map((item) => <span key={item}><Check size={12} aria-hidden="true" />{item}</span>)}
          </div>
        </div>
        <figure className="cf-home-preview cf-production-preview">
          <img src="/brand/production-os-hero.svg" alt={copy.previewAlt} width="1600" height="1120" fetchPriority="high" />
          <span className="cf-preview-badge"><Sparkles size={13} aria-hidden="true" />{copy.previewBadge}</span>
          <figcaption>{copy.previewCaption}</figcaption>
        </figure>
      </section>

      <div className="cf-shell">
        <nav className="cf-jump-nav" aria-label={locale === "ko" ? "홈 섹션" : "Home sections"}>
          <a href="#creator-start">{copy.jumpStart}</a>
          <a href="#creator-flow">{copy.jumpFlow}</a>
          <a href="#creator-support">{copy.jumpSupport}</a>
        </nav>
      </div>

      <section id="creator-start" className="cf-toolkit cf-shell" aria-labelledby="creator-toolkit-title">
        <div className="cf-section-heading">
          <div><p className="cf-kicker"><span className="cf-signal" aria-hidden="true" />{copy.toolkitEyebrow}</p><h2 id="creator-toolkit-title" tabIndex={-1}>{copy.toolkitTitle}</h2></div>
          <p>{copy.toolkitIntro}</p>
        </div>
        <div className="cf-start-grid">
          {copy.starts.map(({ icon: Icon, tag, title, body, href, action }) => (
            <Link key={title} href={href} className="cf-start-card">
              <span className="cf-start-icon"><Icon size={24} aria-hidden="true" /></span>
              <span className="cf-start-tag">{tag}</span>
              <strong>{title}</strong><p>{body}</p>
              <span className="cf-start-action">{action}<ArrowRight size={15} aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="cf-bridge cf-shell" aria-labelledby="creator-bridge-title">
        <figure className="cf-bridge-visual">
          <img src="/brand/production-os-workspace.svg" alt={locale === "ko" ? "프로젝트, 할 일, 팀 소식과 작업 통계를 함께 보여주는 제작 관리 예시 화면" : "Production workspace concept with projects, tasks, team updates and activity"} width="1600" height="980" loading="lazy" />
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
            <figcaption><span>TOONSTUDIO · PRODUCTION FLOW</span><span>{copy.flowCaption}</span></figcaption>
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
          <Link href="/production" className="cf-button cf-primary">{copy.closingAction}<ArrowRight size={17} aria-hidden="true" /></Link>
          <Link href="/production/projects/sample-project/overview" className="cf-button cf-secondary">{copy.closingSecondary}</Link>
        </div>
      </section>
    </main>
  );
}
