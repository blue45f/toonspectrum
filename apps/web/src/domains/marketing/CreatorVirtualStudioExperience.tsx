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
  { src: "/assets/3d/characters/thumbnails/refined-v2/fumi.png", name: "후미" },
  { src: "/assets/3d/characters/thumbnails/refined-v2/mio.png", name: "미오" },
  { src: "/assets/3d/characters/thumbnails/refined-v2/anna.png", name: "안나" },
  { src: "/assets/3d/characters/thumbnails/refined-v2/moon-girl.png", name: "루나" },
  { src: "/assets/3d/characters/thumbnails/refined-v2/megan-the-fox.png", name: "메건" },
  { src: "/assets/3d/characters/thumbnails/refined-v2/teddy.png", name: "테디" },
  { src: "/assets/3d/characters/thumbnails/refined-v2/bot-bunny.png", name: "버니" },
  { src: "/assets/3d/characters/thumbnails/refined-v2/strawberry-princess.png", name: "베리" },
] as const;

type VirtualStudioNavItem = {
  readonly href: string;
  readonly ko: string;
  readonly en: string;
  readonly icon: typeof Home;
  readonly active?: boolean;
};

const NAV: readonly VirtualStudioNavItem[] = [
  { href: "/", ko: "홈", en: "Home", icon: Home },
  { href: "/studio/projects", ko: "프로젝트", en: "Projects", icon: FolderKanban },
  { href: "/studio", ko: "스튜디오", en: "Studio", icon: Sparkles, active: true },
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
    image: "/assets/3d/environments/refined-v6/thumbnails/stylized_cafe_interior.png",
    icon: MessageCircle,
  },
  {
    id: "writers",
    ko: "Writers Room",
    subKo: "작가실 · 시놉시스와 대본",
    en: "Writers Room",
    subEn: "Story · synopsis and scripts",
    href: "/story-lab",
    image: "/assets/3d/environments/expansion-v1/thumbnails/library_reading_room.png",
    icon: BookOpenText,
  },
  {
    id: "storyboard",
    ko: "Storyboard Wall",
    subKo: "콘티 보드 · 장면과 컷 흐름",
    en: "Storyboard Wall",
    subEn: "Boards · scenes and panel flow",
    href: "/studio/new",
    image: "/assets/3d/environments/refined-v6/thumbnails/classroom_art_studio.png",
    icon: GalleryHorizontalEnd,
  },
  {
    id: "assets",
    ko: "Asset Library",
    subKo: "에셋 라이브러리",
    en: "Asset Library",
    subEn: "Production-ready assets",
    href: "/studio/assets",
    image: "/assets/3d/environments/refined-v6/thumbnails/fantasy_alchemist_workshop_library.png",
    icon: Boxes,
  },
  {
    id: "drawing",
    ko: "Drawing Studio",
    subKo: "드로잉 · 실시간 공동 작업",
    en: "Drawing Studio",
    subEn: "Drawing · live collaboration",
    href: "/studio",
    image: "/assets/3d/environments/refined-v6/thumbnails/classroom_art_studio.png",
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
    image: "/assets/3d/environments/expansion-v1/thumbnails/science_research_laboratory.png",
    icon: Handshake,
  },
] as const;

type VirtualRoomProp = {
  readonly src: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly rotate?: number;
  readonly flip?: boolean;
};

const ROOM_PROPS: Readonly<Record<string, readonly VirtualRoomProp[]>> = {
  lounge: [
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-lounge-design-sofa.png", x: 8, y: 4, width: 44, rotate: -2 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-table-coffee.png", x: 48, y: 2, width: 27 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-plant-small2.png", x: 75, y: 10, width: 20 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-lamp-round-floor.png", x: 2, y: 5, width: 16 },
  ],
  writers: [
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-desk.png", x: 15, y: 2, width: 46 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-chair-desk.png", x: 52, y: 0, width: 28, flip: true },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-bookcase-open.png", x: 72, y: 14, width: 23 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-books.png", x: 40, y: 18, width: 15 },
  ],
  storyboard: [
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-cabinet-television.png", x: 9, y: 4, width: 43 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-table-cross.png", x: 49, y: 0, width: 28 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-chair-modern-cushion.png", x: 72, y: 1, width: 22, flip: true },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-lamp-square-floor.png", x: 82, y: 13, width: 14 },
  ],
  assets: [
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-bookcase-open.png", x: 5, y: 9, width: 38 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-cardboard-box-open.png", x: 47, y: 1, width: 30 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-survival-box-large.png", x: 70, y: 0, width: 27 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-lamp-square-table.png", x: 41, y: 16, width: 13 },
  ],
  drawing: [
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-desk-corner.png", x: 5, y: 0, width: 48 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-computer-screen.png", x: 43, y: 12, width: 27 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-lamp-square-floor.png", x: 73, y: 6, width: 22 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-computer-keyboard.png", x: 44, y: 20, width: 17 },
  ],
  review: [
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-television-modern.png", x: 8, y: 12, width: 31 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-lounge-sofa-long.png", x: 34, y: 0, width: 45 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-table-coffee-glass.png", x: 70, y: 0, width: 23 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-plant-small3.png", x: 83, y: 12, width: 14 },
  ],
  assistant: [
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-desk.png", x: 7, y: 1, width: 42 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-chair-rounded.png", x: 47, y: 0, width: 25, flip: true },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-cardboard-box-closed.png", x: 73, y: 1, width: 22 },
    { src: "/assets/studio/cc0-20260906/previews/kenney-furniture-plant-small1.png", x: 84, y: 11, width: 13 },
  ],
};

type VirtualSceneCharacter = {
  readonly src: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly flip?: boolean;
  readonly status?: "online" | "focused" | "reviewing";
  readonly labelKo: string;
  readonly labelEn: string;
};

const ROOM_CHARACTERS: Readonly<Record<string, readonly VirtualSceneCharacter[]>> = {
  lounge: [
    { src: "/assets/3d/characters/thumbnails/refined-v2/teddy.png", x: 27, y: 1, width: 22, status: "online", labelKo: "아이디어 토크", labelEn: "Idea chat" },
    { src: "/assets/3d/characters/thumbnails/refined-v2/megan-the-fox.png", x: 69, y: 2, width: 21, flip: true, status: "online", labelKo: "레퍼런스 공유", labelEn: "Sharing refs" },
  ],
  writers: [
    { src: "/assets/3d/characters/thumbnails/refined-v2/fumi.png", x: 58, y: 0, width: 23, status: "focused", labelKo: "38화 대본", labelEn: "EP38 script" },
  ],
  storyboard: [
    { src: "/assets/3d/characters/thumbnails/refined-v2/mio.png", x: 61, y: 0, width: 22, flip: true, status: "reviewing", labelKo: "컷 흐름 리뷰", labelEn: "Panel review" },
  ],
  assets: [
    { src: "/assets/3d/characters/thumbnails/refined-v2/bot-bunny.png", x: 62, y: 0, width: 25, status: "online", labelKo: "배경 탐색", labelEn: "Finding assets" },
  ],
  drawing: [
    { src: "/assets/3d/characters/thumbnails/refined-v2/anna.png", x: 29, y: 0, width: 23, status: "focused", labelKo: "선화 작업", labelEn: "Line art" },
    { src: "/assets/3d/characters/thumbnails/refined-v2/moon-girl.png", x: 71, y: 0, width: 22, flip: true, status: "online", labelKo: "채색 합류", labelEn: "Color pass" },
  ],
  review: [
    { src: "/assets/3d/characters/thumbnails/refined-v2/strawberry-princess.png", x: 55, y: 0, width: 22, status: "reviewing", labelKo: "승인 대기", labelEn: "Awaiting approval" },
  ],
  assistant: [
    { src: "/assets/3d/characters/thumbnails/refined-v2/cosmic-bot.png", x: 35, y: 0, width: 24, status: "online", labelKo: "작업 배정", labelEn: "Task routing" },
    { src: "/assets/3d/characters/thumbnails/refined-v2/blue-pixie.png", x: 72, y: 0, width: 21, flip: true, status: "focused", labelKo: "마감 체크", labelEn: "Deadline check" },
  ],
};

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
          <Link href="/events/beta-open" className="vs-beta-chip">
            <Sparkles size={11} aria-hidden="true" /> BETA FREE
          </Link>
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
          <img src="/assets/3d/characters/thumbnails/refined-v2/strawberry-princess.png" alt="" />
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
          <div className="vs-world-path" aria-hidden="true">
            <i className="vs-world-path-line vs-world-path-line--top" />
            <i className="vs-world-path-line vs-world-path-line--middle" />
            <i className="vs-world-path-line vs-world-path-line--left" />
            <i className="vs-world-path-line vs-world-path-line--right" />
          </div>
          {ROOMS.map(({ id, ko, subKo, en, subEn, href, image, icon: Icon }, index) => (
            <Link
              key={id}
              href={href}
              className={"vs-room vs-room--" + id}
              style={{ "--vs-room-image": `url("${image}")` } as CSSProperties}
              aria-label={t(ko + " 열기", "Open " + en)}
            >
              <span className="vs-room-shade" aria-hidden="true" />
              <span className="vs-room-props" aria-hidden="true">
                {(ROOM_PROPS[id] ?? []).map((prop, propIndex) => (
                  <img
                    key={prop.src}
                    src={prop.src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{
                      "--vs-prop-x": `${prop.x}%`,
                      "--vs-prop-y": `${prop.y}%`,
                      "--vs-prop-width": `${prop.width}%`,
                      "--vs-prop-rotate": `${prop.rotate ?? 0}deg`,
                      "--vs-prop-flip": prop.flip ? -1 : 1,
                      "--vs-prop-delay": `${propIndex * 45}ms`,
                    } as CSSProperties}
                  />
                ))}
              </span>
              <span className="vs-room-characters" aria-hidden="true">
                {(ROOM_CHARACTERS[id] ?? []).map((character, characterIndex) => (
                  <span
                    key={character.src + characterIndex}
                    className="vs-scene-character"
                    data-status={character.status ?? "online"}
                    style={{
                      "--vs-character-x": `${character.x}%`,
                      "--vs-character-y": `${character.y}%`,
                      "--vs-character-width": `${character.width}%`,
                      "--vs-character-flip": character.flip ? -1 : 1,
                      "--vs-character-delay": `${characterIndex * 110}ms`,
                    } as CSSProperties}
                  >
                    <span className="vs-scene-character-label">{t(character.labelKo, character.labelEn)}</span>
                    <img src={character.src} alt="" loading="lazy" decoding="async" />
                    <i />
                  </span>
                ))}
              </span>
              <span className="vs-room-title"><Icon size={15} /><strong>{t(ko, en)}</strong><small>{t(subKo, subEn)}</small></span>
              <span className="vs-room-open">{t("입장", "Enter")}<ChevronRight size={14} /></span>
              <span className="vs-room-avatar"><CharacterAvatar index={index + 1} small /></span>
            </Link>
          ))}
          <Link href="/studio/immersive" className="vs-plaza" aria-label={t("중앙 크리에이터 플라자 열기", "Open the central creator plaza")}>
            <img className="vs-plaza-prop vs-plaza-prop--left" src="/assets/studio/cc0-20260906/previews/kenney-furniture-plant-small1.png" alt="" aria-hidden="true" />
            <img className="vs-plaza-prop vs-plaza-prop--right" src="/assets/studio/cc0-20260906/previews/kenney-furniture-plant-small3.png" alt="" aria-hidden="true" />
            <span className="vs-plaza-crew" aria-hidden="true">
              <img className="vs-plaza-person vs-plaza-person--a" src="/assets/3d/characters/thumbnails/refined-v2/lady-koi.png" alt="" />
              <img className="vs-plaza-person vs-plaza-person--b" src="/assets/3d/characters/thumbnails/refined-v2/cute-saurus.png" alt="" />
              <img className="vs-plaza-person vs-plaza-person--c" src="/assets/3d/characters/thumbnails/refined-v2/mushroom-fairy.png" alt="" />
            </span>
            <span className="vs-plaza-orb"><Sparkles size={25} aria-hidden="true" /></span>
            <strong>ToonSpectrum</strong><small>VIRTUAL STUDIO</small>
            <span>{t("라이브 · 이벤트 · 공개 협업 공간", "Live · events · public collaboration")}</span>
          </Link>
        </div>
      </section>

      <aside className="vs-social">
        <section className="vs-panel vs-huddle-preview">
          <header><div><strong>{t("Huddle", "Huddle")}</strong><small>{t("P2P 화상 대화 미리보기", "P2P video huddle preview")}</small></div><Video size={16} /></header>
          <div className="vs-video-grid">
            {CHARACTERS.slice(0, 4).map((character, index) => (
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

        <section className="vs-panel vs-members-preview">
          <header><div><strong>{t("접속 중인 멤버", "Members online")}</strong><small>{t("현재 공간의 작업 상태", "Live studio presence")}</small></div><Users size={17} /></header>
          <div className="vs-member-list">
            {[
              { index: 0, ko: "하늘", en: "Haneul", statusKo: "작업 중", statusEn: "Creating" },
              { index: 1, ko: "지훈 PD", en: "Jihun · PD", statusKo: "리뷰 중", statusEn: "Reviewing" },
              { index: 2, ko: "민준", en: "Minjun", statusKo: "집중 중", statusEn: "Focused" },
              { index: 3, ko: "시나", en: "Sina", statusKo: "온라인", statusEn: "Online" },
            ].map((member) => (
              <div key={member.en}>
                <CharacterAvatar index={member.index} small />
                <span><strong>{t(member.ko, member.en)}</strong><small>{t(member.statusKo, member.statusEn)}</small></span>
                <i aria-hidden="true" />
              </div>
            ))}
          </div>
          <Link href="/collaborate" className="vs-panel-action">{t("멤버와 협업 관리", "Manage collaboration")}<ChevronRight size={14} /></Link>
        </section>

        <section className="vs-panel vs-ai-preview">
          <header><div><strong>{t("AI 프로듀서", "AI Producer")}</strong><small>{t("창작 흐름을 정리하는 프로젝트 코디네이터", "Project coordinator for the creative flow")}</small></div><Bot size={17} /></header>
          <div className="vs-ai-brief">
            <p><span>38</span><strong>{t("화 진행 중", "episode in progress")}</strong><small>{t("리뷰 대기 3컷 · 배경 6컷 작업 중", "3 panels awaiting review · 6 backgrounds in progress")}</small></p>
            <ul>
              <li><i>✓</i>{t("회의 결정사항을 작업으로 연결", "Turn meeting decisions into tasks")}</li>
              <li><i>✓</i>{t("리뷰 병목과 다음 액션 표시", "Surface review bottlenecks and next actions")}</li>
            </ul>
          </div>
          <Link href="/studio/ai-settings" className="vs-panel-action">{t("AI 프로듀서 열기", "Open AI Producer")}<ChevronRight size={14} /></Link>
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
