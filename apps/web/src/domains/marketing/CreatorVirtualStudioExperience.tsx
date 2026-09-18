import {
  Bell, Bot, CalendarDays, ClipboardCheck, FolderKanban,
  GalleryHorizontalEnd, Handshake, Home, LibraryBig,
  MessageCircle, Mic, MonitorUp, PhoneOff, Settings, Sparkles,
  Users, Video,
} from "lucide-react";

import Link from "@/compat/router-link";
import { CreatorExperienceModeSwitch } from "@/shared/components/CreatorExperienceModeSwitch";
import { useI18n } from "@/shared/lib/i18n";
import { VirtualStudioMasterWorld } from "@/shared/components/virtual-studio/VirtualStudioMasterWorld";
import "@/shared/components/virtual-studio/virtual-studio-shell.css";

const NAV = [
  ["/", "홈", "Home", Home],
  ["/studio/projects", "프로젝트", "Projects", FolderKanban],
  ["/studio", "스튜디오", "Studio", Sparkles],
  ["/showcase", "작품 관리", "Works", GalleryHorizontalEnd],
  ["/collaborate", "멤버", "Members", Users],
  ["/production", "작업 보드", "Production", ClipboardCheck],
  ["/studio/assets", "에셋 라이브러리", "Assets", LibraryBig],
  ["/studio/ai-settings", "AI 프로듀서", "AI Producer", Bot],
  ["/community", "커뮤니티", "Community", MessageCircle],
  ["/events", "이벤트", "Events", CalendarDays],
  ["/market", "마켓(외주/매칭)", "Market", Handshake],
] as const;

const REFERENCE_SKINS = ["pink", "silver", "dark", "purple"] as const;

const MEMBERS = [
  ["하늘ちゃん", 0], ["루나", 8], ["PD_지훈", 2], ["제이", 9],
  ["나비", 3], ["트리", 6], ["민준", 5], ["시나", 1],
] as const;

function TinyAvatar({ variant, label = "" }: { readonly variant: number; readonly label?: string }) {
  const skin = REFERENCE_SKINS[Math.abs(variant) % REFERENCE_SKINS.length] ?? "pink";
  return (
    <span className="vs2-tiny-avatar" title={label}>
      <img
        src={`/assets/virtual-studio/reference/player-${skin}-direction-down.png`}
        alt=""
        draggable={false}
        className="vs2-reference-avatar-img"
      />
      <i aria-hidden="true" />
    </span>
  );
}

function HuddleTile({
  asset,
  label,
}: {
  readonly asset: "haneul" | "jihun" | "nabi" | "minjun";
  readonly label: string;
}) {
  return (
    <div className="vs2-huddle-tile">
      <img
        src={`/assets/virtual-studio/reference/ui/huddle-${asset}.jpg`}
        alt=""
        draggable={false}
        className="vs2-reference-huddle-img"
      />
      <strong>{label}</strong><i aria-hidden="true" />
    </div>
  );
}

export function CreatorVirtualStudioExperience() {
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const t = (ko: string, en: string) => korean ? ko : en;
  return (
    <main className="vs2-shell" data-creator-home="virtual-studio" lang={korean ? "ko" : "en"}>
      <header className="vs2-topbar">
        <Link href="/" className="vs2-brand">
          <span className="vs2-brand-mark"><Sparkles size={17} /></span>
          <span><strong>ToonSpectrum</strong><small>Together, We Create Amazing Stories</small></span>
        </Link>
        <div className="vs2-project">
          <span className="vs2-project-icon"><Sparkles size={15} /></span>
          <strong>{t("푸른 달의 기록", "Blue Moon Chronicle")}</strong><span>⌄</span>
          <em>EP 38⌄</em><span className="vs2-studio-pill">◉ {t("스튜디오", "Studio")}</span>
          <span className="vs2-online">● {t("8명 접속 중", "8 online")}</span>
          <div className="vs2-stack">{[0,8,1,3,2].map((v)=><TinyAvatar key={v} variant={v}/>)}</div>
        </div>
        <div className="vs2-top-actions">
          <Link href="/calendar"><CalendarDays size={17}/></Link>
          <button type="button"><Bell size={17}/><i/></button>
          <Link href="/settings"><Settings size={17}/></Link>
          <span className="vs2-mascot"><img src="/assets/virtual-studio/reference/player-silver-direction-down.png" alt="" className="vs2-reference-mascot-img" /></span>
          <span className="vs2-slogan">{t("좋은 이야기가","Good stories")}<br/>{t("세상을 바꿔요! ✨","change the world! ✨")}</span>
        </div>
      </header>

      <aside className="vs2-sidebar">
        <nav>
          {NAV.map(([href,ko,en,Icon], index)=>(
            <Link key={href} href={href} className={index===2?"is-active":undefined}>
              <Icon size={17}/><span>{t(ko,en)}</span>{index===2?null:<i/>}
            </Link>
          ))}
        </nav>
        <Link href="/showcase" className="vs2-promo" aria-label={t("함께 만드는 더 큰 이야기", "Together we make bigger stories")}>
          <img src="/assets/virtual-studio/reference/ui/sidebar-promo.jpg" alt="" className="vs2-reference-promo-img" />
        </Link>
        <div className="vs2-self"><TinyAvatar variant={0}/><span><strong>하늘ちゃん</strong><small>● {t("온라인","Online")}</small></span><Settings size={15}/></div>
      </aside>

      <section className="vs2-world-wrap"><VirtualStudioMasterWorld/></section>

      <aside className="vs2-rightbar">
        <section className="vs2-panel vs2-huddle">
          <header><strong>Huddle <small>({t("화상 대화","video chat")})</small></strong><button type="button">×</button></header>
          <div className="vs2-huddle-grid">
            <HuddleTile asset="haneul" label="하늘ちゃん"/><HuddleTile asset="jihun" label="PD_지훈"/>
            <HuddleTile asset="nabi" label="나비"/><HuddleTile asset="minjun" label="민준"/>
          </div>
          <div className="vs2-call-controls">
            <button type="button"><Mic size={15}/></button><button type="button"><Video size={15}/></button>
            <button type="button"><MonitorUp size={15}/></button><button type="button"><Settings size={15}/></button>
            <button type="button" className="danger"><PhoneOff size={15}/></button>
          </div>
        </section>

        <section className="vs2-panel vs2-chat">
          <header><strong># {t("스튜디오 채팅","Studio chat")}</strong><button type="button">⌃</button></header>
          <div className="vs2-chat-log">
            <p><TinyAvatar variant={3}/><span><strong>나비 <small>오후 2:14</small></strong>{t("이 컷 너무 좋아요!💗","I love this panel! 💗")}</span></p>
            <p><TinyAvatar variant={2}/><span><strong>PD_지훈 <small>오후 2:15</small></strong>{t("눈을 조금 더 크게 해볼까요?","Could we make the eyes a bit bigger?")}</span></p>
            <p><TinyAvatar variant={1}/><span><strong>민준 <small>오후 2:16</small></strong>{t("네! 바로 수정해둘게요. ✏️","Sure, I’ll update it now. ✏️")}</span></p>
            <p><TinyAvatar variant={0}/><span><strong>시나 <small>오후 2:17</small></strong>{t("다음 컷도 미리 준비하겠습니다!","I’ll prep the next panel too!")}</span></p>
          </div>
          <div className="vs2-chat-input"><span>{t("메시지를 입력하세요...","Type a message...")}</span><span>☺︎ ➤</span></div>
        </section>

        <section className="vs2-panel vs2-members">
          <header><strong>{t("접속 중인 멤버 (8)","Members online (8)")}</strong><span>⌁ ＋ ◉</span></header>
          <div className="vs2-member-grid">
            {MEMBERS.map(([name,variant],i)=>(
              <div key={name}><TinyAvatar variant={variant} label={name}/><span><strong>{name}</strong><small>{i%3===1?t("작업 중","Working"):t("온라인","Online")}</small></span></div>
            ))}
          </div>
        </section>
      </aside>

      <section className="vs2-bottom">
        <Link href="/studio" className="vs2-feature">
          <header><strong>{t("실시간 드로잉 협업","Live drawing collaboration")}</strong><small>{t("같은 캔버스에서 함께 그려요","Draw together on one canvas")}</small></header>
          <div className="vs2-feature-body"><img src="/assets/virtual-studio/reference/ui/feature-drawing.jpg" alt="" className="vs2-reference-feature-img" /></div>
        </Link>
        <Link href="/production" className="vs2-feature">
          <header><strong>{t("리뷰 & 코멘트","Review & comments")}</strong><small>{t("정확한 위치에 피드백을 남겨요","Pin feedback precisely")}</small></header>
          <div className="vs2-feature-body"><img src="/assets/virtual-studio/reference/ui/feature-review.jpg" alt="" className="vs2-reference-feature-img" /></div>
        </Link>
        <Link href="/production" className="vs2-feature">
          <header><strong>{t("작업 보드 & 진행 상황","Production board")}</strong><small>{t("누가, 무엇을, 언제까지","Who, what, by when")}</small></header>
          <div className="vs2-feature-body"><img src="/assets/virtual-studio/reference/ui/feature-board.jpg" alt="" className="vs2-reference-feature-img" /></div>
        </Link>
        <Link href="/studio/ai-settings" className="vs2-feature">
          <header><strong>{t("AI 프로듀서","AI Producer")}</strong><small>{t("항상 함께하는 든든한 PD","Your always-on production partner")}</small></header>
          <div className="vs2-feature-body"><img src="/assets/virtual-studio/reference/ui/feature-ai.jpg" alt="" className="vs2-reference-feature-img" /></div>
        </Link>
        <Link href="/studio/immersive" className="vs2-feature">
          <header><strong>{t("라이브 드로잉 이벤트","Live drawing events")}</strong><small>{t("작가와 함께하는 특별한 시간","Create live together")}</small></header>
          <div className="vs2-feature-body"><img src="/assets/virtual-studio/reference/ui/feature-live.jpg" alt="" className="vs2-reference-feature-img" /></div>
        </Link>
        <Link href="/community" className="vs2-feature">
          <header><strong>{t("크리에이터 커뮤니티","Creator community")}</strong><small>{t("새로운 사람들과 더 많은 기회","More creators, more opportunities")}</small></header>
          <div className="vs2-feature-body"><img src="/assets/virtual-studio/reference/ui/feature-community.jpg" alt="" className="vs2-reference-feature-img" /></div>
        </Link>
      </section>

      <footer className="vs2-footer"><strong>ToonSpectrum</strong><span>{t("혼자가 아닌, 함께 만드는 더 큰 이야기.","Bigger stories, made together.")}</span><em>Creators for a Brighter Tomorrow ♥</em></footer>
      <div className="vs2-mode-switch"><CreatorExperienceModeSwitch compact/></div>
    </main>
  );
}
