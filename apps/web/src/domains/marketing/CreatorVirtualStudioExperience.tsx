import {
  Bell, Bot, CalendarDays, ClipboardCheck, FolderKanban,
  GalleryHorizontalEnd, Handshake, Heart, Home, LibraryBig,
  MessageCircle, Mic, MonitorUp, PhoneOff, Settings, Sparkles,
  Users, Video,
} from "lucide-react";

import Link from "@/compat/router-link";
import { CreatorExperienceModeSwitch } from "@/shared/components/CreatorExperienceModeSwitch";
import { useI18n } from "@/shared/lib/i18n";
import { StudioChibiSprite } from "../creator/virtual-space/StudioChibiSprite";
import { VirtualStudioMasterWorld } from "./VirtualStudioMasterWorld";
import "./creator-virtual-studio.css";

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

const MEMBERS = [
  ["하늘ちゃん", 0], ["루나", 8], ["PD_지훈", 2], ["제이", 9],
  ["나비", 3], ["트리", 6], ["민준", 5], ["시나", 1],
] as const;

function TinyAvatar({ variant, label = "" }: { readonly variant: number; readonly label?: string }) {
  return (
    <span className="vs2-tiny-avatar" title={label}>
      <StudioChibiSprite variant={variant} size={38} motion="idle" />
      <i aria-hidden="true" />
    </span>
  );
}

function HuddleTile({ variant, label }: { readonly variant: number; readonly label: string }) {
  return (
    <div className="vs2-huddle-tile">
      <span className="vs2-huddle-portrait">
        <StudioChibiSprite variant={variant} size={88} motion={variant % 2 ? "talk" : "idle"} />
      </span>
      <strong>{label}</strong><i aria-hidden="true" />
    </div>
  );
}

function SketchPreview() {
  return (
    <svg viewBox="0 0 190 126" aria-hidden="true">
      <rect width="190" height="126" rx="8" fill="#fbfbfa" />
      <path d="M88 19c-21 1-38 19-38 43 0 28 19 46 43 46 26 0 43-20 43-47 0-25-20-43-48-42z" fill="none" stroke="#aeb5c2" strokeWidth="2" />
      <path d="M64 52c8-20 43-31 59-9M69 69c5 18 42 24 56 0M76 56c4-3 10-3 14 0M103 56c4-3 10-3 14 0" fill="none" stroke="#959eac" strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="84" cy="62" rx="5" ry="7" fill="none" stroke="#8f98a8" />
      <ellipse cx="110" cy="62" rx="5" ry="7" fill="none" stroke="#8f98a8" />
      <path d="M95 70c2 2 4 2 6 0M87 80c7 5 16 5 23 0" fill="none" stroke="#8f98a8" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="164" cy="95" r="14" fill="#ff6c91" opacity=".92" />
      <path d="m157 96 5 5 9-12" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
          <span className="vs2-mascot"><StudioChibiSprite variant={10} size={45} motion="idle"/></span>
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
        <Link href="/showcase" className="vs2-promo">
          <span className="vs2-promo-art"><StudioChibiSprite variant={4} size={104} motion="idle"/></span>
          <span><strong>{t("함께 만드는","Together we make")}</strong><b>{t("더 큰 이야기","bigger stories")}</b></span>
          <Heart size={19} fill="currentColor"/>
        </Link>
        <div className="vs2-self"><TinyAvatar variant={0}/><span><strong>하늘ちゃん</strong><small>● {t("온라인","Online")}</small></span><Settings size={15}/></div>
      </aside>

      <section className="vs2-world-wrap"><VirtualStudioMasterWorld/></section>

      <aside className="vs2-rightbar">
        <section className="vs2-panel vs2-huddle">
          <header><strong>Huddle <small>({t("화상 대화","video chat")})</small></strong><button type="button">×</button></header>
          <div className="vs2-huddle-grid">
            <HuddleTile variant={0} label="하늘ちゃん"/><HuddleTile variant={2} label="PD_지훈"/>
            <HuddleTile variant={3} label="나비"/><HuddleTile variant={1} label="민준"/>
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
          <div className="vs2-feature-body vs2-drawing-card"><SketchPreview/><span className="live">라이브</span></div>
        </Link>
        <Link href="/production" className="vs2-feature">
          <header><strong>{t("리뷰 & 코멘트","Review & comments")}</strong><small>{t("정확한 위치에 피드백을 남겨요","Pin feedback precisely")}</small></header>
          <div className="vs2-feature-body vs2-review-card"><SketchPreview/><span className="circle"/><span className="comment"><TinyAvatar variant={2}/>{t("눈을 조금 더 크게!","Make the eyes bigger!")}</span></div>
        </Link>
        <Link href="/production" className="vs2-feature">
          <header><strong>{t("작업 보드 & 진행 상황","Production board")}</strong><small>{t("누가, 무엇을, 언제까지","Who, what, by when")}</small></header>
          <div className="vs2-feature-body vs2-board-card"><div><b>To Do (5)</b><p>38화 콘티</p><p>컷 14-2 선화</p><p>배경 채색</p><p>효과 작업</p></div><div><b>In Progress (3)</b>{[0,2,4].map(v=><TinyAvatar key={v} variant={v}/>)}</div><div><b>Review (2)</b>{[1,3].map(v=><TinyAvatar key={v} variant={v}/>)}</div></div>
        </Link>
        <Link href="/studio/ai-settings" className="vs2-feature">
          <header><strong>{t("AI 프로듀서","AI Producer")}</strong><small>{t("항상 함께하는 든든한 PD","Your always-on production partner")}</small></header>
          <div className="vs2-feature-body vs2-ai-card"><span className="orb"><Bot size={42}/></span><span className="bubble">{t("제가 프로젝트를 도와드릴게요!","I’ll help with the project!")}</span><ul><li>✓ {t("회의 요약","Meeting summaries")}</li><li>✓ {t("작업 자동 생성","Task creation")}</li><li>✓ {t("담당자 배정","Assignment")}</li><li>✓ {t("마감일 관리","Deadline tracking")}</li></ul></div>
        </Link>
        <Link href="/studio/immersive" className="vs2-feature">
          <header><strong>{t("라이브 드로잉 이벤트","Live drawing events")}</strong><small>{t("작가와 함께하는 특별한 시간","Create live together")}</small></header>
          <div className="vs2-feature-body vs2-live-card"><span className="live-pill">LIVE ● 327</span><StudioChibiSprite variant={7} size={115} motion="draw"/><div className="hearts">♥<br/>♥<br/>♥</div></div>
        </Link>
        <Link href="/community" className="vs2-feature">
          <header><strong>{t("크리에이터 커뮤니티","Creator community")}</strong><small>{t("새로운 사람들과 더 많은 기회","More creators, more opportunities")}</small></header>
          <div className="vs2-feature-body vs2-community-card"><span className="sign">ToonSpectrum<br/><small>CREATOR PLAZA</small></span><div className="crew">{[0,1,3,5].map(v=><StudioChibiSprite key={v} variant={v} size={56} motion="idle"/>)}</div><footer><span>◈ {t("작품 전시","Gallery")}</span><span>◉ {t("협업 모집","Collab")}</span><span>◌ {t("세미나","Seminar")}</span><span>▣ {t("포트폴리오","Portfolio")}</span></footer></div>
        </Link>
      </section>

      <footer className="vs2-footer"><strong>ToonSpectrum</strong><span>{t("혼자가 아닌, 함께 만드는 더 큰 이야기.","Bigger stories, made together.")}</span><em>Creators for a Brighter Tomorrow ♥</em></footer>
      <div className="vs2-mode-switch"><CreatorExperienceModeSwitch compact/></div>
    </main>
  );
}
