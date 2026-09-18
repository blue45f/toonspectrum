import type { CSSProperties } from "react";
import {
  Bot,
  BookOpenText,
  Boxes,
  Brush,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FolderKanban,
  GalleryHorizontalEnd,
  Handshake,
  Heart,
  Home,
  LibraryBig,
  MessageCircle,
  Mic,
  MonitorUp,
  Play,
  Radio,
  Settings,
  Sparkles,
  Users,
  Video,
} from "lucide-react";

import Link from "@/compat/router-link";
import { CreatorExperienceModeSwitch } from "@/shared/components/CreatorExperienceModeSwitch";
import { useI18n } from "@/shared/lib/i18n";

import "./creator-virtual-studio.css";

const CHARACTERS = [
  { src: "/images/characters/ara.jpg", name: "아라" },
  { src: "/images/characters/danwoo.jpg", name: "단우" },
  { src: "/images/characters/gaon.jpg", name: "가온" },
  { src: "/images/characters/leona.jpg", name: "레오나" },
] as const;

const NAV = [
  { href: "/", ko: "홈", en: "Home", icon: Home },
  { href: "/studio", ko: "프로젝트", en: "Projects", icon: FolderKanban },
  { href: "/studio/immersive", ko: "스튜디오", en: "Studio", icon: Sparkles, active: true },
  { href: "/showcase", ko: "작품 관리", en: "Works", icon: GalleryHorizontalEnd },
  { href: "/collaborate", ko: "멤버", en: "Members", icon: Users },
  { href: "/production", ko: "작업 보드", en: "Production", icon: ClipboardCheck },
  { href: "/studio/assets", ko: "에셋 라이브러리", en: "Assets", icon: LibraryBig },
  { href: "/studio/ai-settings", ko: "AI 프로듀서", en: "AI Producer", icon: Bot },
  { href: "/community", ko: "커뮤니티", en: "Community", icon: MessageCircle },
  { href: "/market", ko: "마켓·외주", en: "Market", icon: Handshake },
] as const;

const ROOMS = [
  {
    id: "lounge",
    ko: "Creator Lounge",
    subKo: "라운지 · 가벼운 대화",
    en: "Creator Lounge",
    subEn: "Lounge · casual conversation",
    href: "/community",
    image: "/assets/studio/backgrounds/webtoon_cafe.jpg",
    icon: MessageCircle,
  },
  {
    id: "writers",
    ko: "Writers Room",
    subKo: "작가실 · 시놉시스와 대본",
    en: "Writers Room",
    subEn: "Story · synopsis and scripts",
    href: "/story-lab",
    image: "/assets/studio/backgrounds/webtoon_classroom.jpg",
    icon: BookOpenText,
  },
  {
    id: "storyboard",
    ko: "Storyboard Wall",
    subKo: "콘티 보드 · 장면과 컷 흐름",
    en: "Storyboard Wall",
    subEn: "Boards · scenes and panel flow",
    href: "/studio/new",
    image: "/assets/studio/backgrounds/webtoon_creator_room.png",
    icon: GalleryHorizontalEnd,
  },
  {
    id: "assets",
    ko: "Asset Library",
    subKo: "에셋 라이브러리",
    en: "Asset Library",
    subEn: "Production-ready assets",
    href: "/studio/assets",
    image: "/brand/atelier-materials-640.webp",
    icon: Boxes,
  },
  {
    id: "drawing",
    ko: "Drawing Studio",
    subKo: "드로잉 · 실시간 공동 작업",
    en: "Drawing Studio",
    subEn: "Drawing · live collaboration",
    href: "/studio",
    image: "/assets/studio/backgrounds/webtoon_creator_room.png",
    icon: Brush,
  },
  {
    id: "review",
    ko: "Review Room",
    subKo: "리뷰룸 · 코멘트와 승인",
    en: "Review Room",
    subEn: "Review · comments and approval",
    href: "/production",
    image: "/assets/studio/backgrounds/webtoon_drama_boardroom.jpg",
    icon: ClipboardCheck,
  },
  {
    id: "assistant",
    ko: "Assistant Desk",
    subKo: "어시스트 · 외주와 업무 배정",
    en: "Assistant Desk",
    subEn: "Assistants · staffing and handoff",
    href: "/collaborate",
    image: "/brand/atelier-process-640.webp",
    icon: Handshake,
  },
] as const;

const FEATURE_CARDS = [
  { href: "/studio", ko: "실시간 드로잉 협업", en: "Live drawing", captionKo: "같은 캔버스에서 함께 그려요", captionEn: "Create together on the same canvas", icon: Brush, kind: "draw" },
  { href: "/production", ko: "리뷰 & 코멘트", en: "Review & comments", captionKo: "컷에 정확히 피드백을 남겨요", captionEn: "Pin precise feedback to the work", icon: ClipboardCheck, kind: "review" },
  { href: "/production", ko: "작업 보드 & 진행 상황", en: "Production board", captionKo: "누가, 무엇을, 언제까지", captionEn: "Owners, work and deadlines", icon: FolderKanban, kind: "board" },
  { href: "/studio/ai-settings", ko: "AI 프로듀서", en: "AI Producer", captionKo: "회의·작업·마감을 연결해요", captionEn: "Connect meetings, tasks and deadlines", icon: Bot, kind: "ai" },
  { href: "/studio/immersive", ko: "라이브 드로잉 이벤트", en: "Live events", captionKo: "작업 과정을 함께 보는 특별한 시간", captionEn: "Share the creative process live", icon: Radio, kind: "live" },
  { href: "/community", ko: "크리에이터 커뮤니티", en: "Creator community", captionKo: "작품·협업·세미나가 만나는 광장", captionEn: "Works, teams and events in one plaza", icon: Users, kind: "community" },
] as const;

function CharacterAvatar({
  index,
  small = false,
  label,
}: {
  index: number;
  small?: boolean;
  label?: string;
}) {
  const character = CHARACTERS[index % CHARACTERS.length];
  return (
    <span className={small ? "vs-avatar vs-avatar--small" : "vs-avatar"} title={label ?? character.name}>
      <img src={character.src} alt="" loading="lazy" decoding="async" />
      <i aria-hidden="true" />
    </span>
  );
}

export function CreatorVirtualStudioExperience() {
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const t = (ko: string, en: string) => korean ? ko : en;

  return (
    <main className="vs-home" data-creator-home="virtual-studio" lang={korean ? "ko" : "en"}>
      <header className="vs-topbar">
        <Link href="/" className="vs-brand" aria-label="ToonSpectrum">
          <span className="vs-brand-mark"><Sparkles size={17} aria-hidden="true" /></span>
          <span><strong>ToonSpectrum</strong><small>Together, We Create Amazing Stories</small></span>
        </Link>
        <div className="vs-project-chip">
          <strong>{t("샘플 프로젝트", "Sample project")}</strong>
          <span>EP 38</span>
          <span className="vs-online-dot" aria-hidden="true" />
          <span>{t("협업 스튜디오", "Collaboration studio")}</span>
        </div>
        <div className="vs-top-actions">
          <div className="vs-presence-stack" aria-label={t("캐릭터 미리보기", "Character preview")}>
            {CHARACTERS.map((character, index) => <CharacterAvatar key={character.name} index={index} small />)}
          </div>
          <CreatorExperienceModeSwitch compact />
          <Link href="/calendar" className="vs-icon-button" aria-label={t("일정", "Calendar")}><CalendarDays size={17} /></Link>
          <Link href="/settings" className="vs-icon-button" aria-label={t("설정", "Settings")}><Settings size={17} /></Link>
        </div>
      </header>

      <aside className="vs-sidebar">
        <nav aria-label={t("Virtual Studio 메뉴", "Virtual Studio navigation")}>
          {NAV.map(({ href, ko, en, icon: Icon, active }) => (
            <Link key={href + ko} href={href} className={active ? "is-active" : undefined}>
              <Icon size={17} aria-hidden="true" /><span>{t(ko, en)}</span>
            </Link>
          ))}
        </nav>
        <Link href="/showcase" className="vs-sidebar-promo">
          <img src="/images/characters/ara.jpg" alt="" />
          <span><strong>{t("함께 만드는", "Create together")}</strong>{t("더 큰 이야기", "Bigger stories")}</span>
          <Heart size={18} fill="currentColor" aria-hidden="true" />
        </Link>
        <div className="vs-self">
          <CharacterAvatar index={0} small />
          <span><strong>{t("나의 스튜디오", "My studio")}</strong><small><i /> {t("온라인", "Online")}</small></span>
          <Settings size={15} aria-hidden="true" />
        </div>
      </aside>

      <section className="vs-world" aria-labelledby="vs-world-title">
        <div className="vs-world-heading">
          <div>
            <p><Sparkles size={14} /> VIRTUAL CREATOR STUDIO</p>
            <h1 id="vs-world-title">{t("작업과 대화가 같은 공간에서 이어집니다.", "Creation and conversation share one space.")}</h1>
          </div>
          <span>{t("각 방을 눌러 실제 기능으로 이동하세요.", "Open a room to jump into the real tool.")}</span>
        </div>

        <div className="vs-room-map">
          <div className="vs-ambient vs-ambient--a" aria-hidden="true" />
          <div className="vs-ambient vs-ambient--b" aria-hidden="true" />
          {ROOMS.map(({ id, ko, subKo, en, subEn, href, image, icon: Icon }, index) => (
            <Link
              key={id}
              href={href}
              className={"vs-room vs-room--" + id}
              style={{ "--vs-room-image": `url("${image}")` } as CSSProperties}
              aria-label={t(ko + " 열기", "Open " + en)}
            >
              <span className="vs-room-shade" aria-hidden="true" />
              <span className="vs-room-title"><Icon size={15} /><strong>{t(ko, en)}</strong><small>{t(subKo, subEn)}</small></span>
              <span className="vs-room-open">{t("입장", "Enter")}<ChevronRight size={14} /></span>
              <span className="vs-room-avatar"><CharacterAvatar index={index + 1} small /></span>
            </Link>
          ))}
          <div className="vs-plaza" aria-label={t("중앙 크리에이터 플라자", "Central creator plaza")}>
            <span className="vs-plaza-orb"><Sparkles size={25} aria-hidden="true" /></span>
            <strong>ToonSpectrum</strong><small>VIRTUAL STUDIO</small>
            <span>{t("Together, creators make brighter stories.", "Together, creators make brighter stories.")}</span>
          </div>
        </div>
      </section>

      <aside className="vs-social">
        <section className="vs-panel vs-huddle-preview">
          <header><div><strong>{t("Huddle", "Huddle")}</strong><small>{t("P2P 화상 대화 미리보기", "P2P video huddle preview")}</small></div><Video size={16} /></header>
          <div className="vs-video-grid">
            {CHARACTERS.map((character, index) => (
              <figure key={character.name}><img src={character.src} alt="" /><figcaption>{index === 0 ? t("작가 A", "Creator A") : index === 1 ? "PD" : index === 2 ? t("어시스트", "Assistant") : t("작가 B", "Creator B")}</figcaption></figure>
            ))}
          </div>
          <div className="vs-call-controls" aria-hidden="true"><span><Mic size={15} /></span><span><Video size={15} /></span><span><MonitorUp size={15} /></span><span><Settings size={15} /></span></div>
          <Link href="/studio" className="vs-panel-action">{t("실제 P2P Huddle 열기", "Open the real P2P Huddle")}<ChevronRight size={14} /></Link>
        </section>

        <section className="vs-panel vs-chat-preview">
          <header><div><strong>{t("스튜디오 채팅", "Studio chat")}</strong><small>{t("UI 예시 · 실제 메시지가 아닙니다", "UI preview · not live messages")}</small></div><MessageCircle size={16} /></header>
          <div className="vs-chat-list">
            <p><CharacterAvatar index={1} small /><span><strong>PD</strong>{t("리뷰할 컷을 Storyboard Wall에 올렸어요.", "I placed the review panels on the Storyboard Wall.")}</span></p>
            <p><CharacterAvatar index={2} small /><span><strong>{t("어시스트", "Assistant")}</strong>{t("배경 작업을 마무리하고 있어요.", "I’m finishing the background pass.")}</span></p>
            <p><CharacterAvatar index={0} small /><span><strong>{t("작가", "Creator")}</strong>{t("다음 컷까지 이어서 진행할게요.", "I’ll continue through the next panel.")}</span></p>
          </div>
          <Link href="/studio" className="vs-chat-input">{t("Studio에서 P2P 채팅 시작", "Start P2P chat in Studio")}<ChevronRight size={14} /></Link>
        </section>

        <section className="vs-panel vs-ai-preview">
          <header><div><strong>{t("AI 프로듀서", "AI Producer")}</strong><small>{t("창작자를 보조하는 작업 코디네이터", "A creator-controlled production assistant")}</small></div><Bot size={17} /></header>
          <ul>
            <li><span>✓</span>{t("회의 요약과 결정사항 정리", "Summarise meetings and decisions")}</li>
            <li><span>✓</span>{t("작업·담당자·마감 연결", "Connect tasks, owners and deadlines")}</li>
            <li><span>✓</span>{t("리뷰 대기와 병목 표시", "Surface review queues and bottlenecks")}</li>
          </ul>
          <Link href="/studio/ai-settings" className="vs-panel-action">{t("AI 설정 열기", "Open AI settings")}<ChevronRight size={14} /></Link>
        </section>
      </aside>

      <section className="vs-feature-strip" aria-label={t("Virtual Studio 주요 기능", "Virtual Studio capabilities")}>
        {FEATURE_CARDS.map(({ href, ko, en, captionKo, captionEn, icon: Icon, kind }) => (
          <Link href={href} key={kind} className={"vs-feature-card vs-feature-card--" + kind}>
            <span className="vs-feature-icon"><Icon size={20} /></span>
            <span><strong>{t(ko, en)}</strong><small>{t(captionKo, captionEn)}</small></span>
            {kind === "live" ? <em><Play size={12} fill="currentColor" /> LIVE</em> : null}
            <ChevronRight className="vs-feature-arrow" size={16} />
          </Link>
        ))}
      </section>
    </main>
  );
}
