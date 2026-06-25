import { useAmbientBgm, useClickSfx, useFx } from "@toonspectrum/core/fx";
import "@toonspectrum/core/fx/fx.css";

import IntroSplashScreen from "./components/IntroSplashScreen.tsx";
import { CalendarPage } from "./pages/CalendarPage.tsx";
import { CommunityPage } from "./pages/CommunityPage.tsx";
import { CreatePage } from "./pages/CreatePage.tsx";
import { ExplorePage } from "./pages/ExplorePage.tsx";
import { FortunePage } from "./pages/FortunePage.tsx";
import { DuelGame } from "./pages/games/DuelGame.tsx";
import { MemoryGame } from "./pages/games/MemoryGame.tsx";
import { QuizGame } from "./pages/games/QuizGame.tsx";
import { RouletteGame } from "./pages/games/RouletteGame.tsx";
import { RpsGame } from "./pages/games/RpsGame.tsx";
import { LibraryPage } from "./pages/LibraryPage.tsx";
import { PlayHubPage } from "./pages/PlayHubPage.tsx";
import { RankingPage } from "./pages/RankingPage.tsx";
import { RecommendPage } from "./pages/RecommendPage.tsx";
import { SearchPage } from "./pages/SearchPage.tsx";
import { StudioPage } from "./pages/StudioPage.tsx";
import { TitleDetailPage } from "./pages/TitleDetailPage.tsx";
import { TitleListPage } from "./pages/TitleListPage.tsx";
import { WebComponentSample } from "./pages/WebComponentSample.tsx";
import { navigate, useHashPath } from "./router";
import { theme } from "./theme";
import { hapticFeedback } from "./lib/toss.ts";

// 하단 네비 = plan.nav (홈·랭킹·연재·탐색·놀이터). 검색은 Top 바 어포던스, 추천은 홈 섹션/오버플로로
// 진입하므로 하단 탭에는 넣지 않는다(라우트는 등록). 5개 primary 탭만 노출.
const NAV = [
  { id: "home", label: "홈", emoji: "📚", to: "/" },
  { id: "ranking", label: "랭킹", emoji: "🏆", to: "/ranking" },
  { id: "calendar", label: "연재", emoji: "📅", to: "/calendar" },
  { id: "explore", label: "탐색", emoji: "🧭", to: "/explore" },
  { id: "play", label: "놀이터", emoji: "🎮", to: "/play" },
] as const;

type TabId = (typeof NAV)[number]["id"];

// 경로 → 활성 탭. 검색/추천/상세 등 비탭 라우트는 가장 가까운 primary 탭으로 귀속(없으면 홈).
function activeTab(path: string): TabId {
  // 운세·3D 스튜디오는 놀이터 허브에서 진입하므로 '놀이터' 탭에 귀속.
  if (path.startsWith("/play") || path.startsWith("/fortune") || path.startsWith("/studio")) return "play";
  if (path.startsWith("/ranking")) return "ranking";
  if (path.startsWith("/calendar")) return "calendar";
  // 창작 스튜디오·내 서재·커뮤니티는 '탐색' 오버플로로 진입하므로 '탐색' 탭에 귀속.
  if (path.startsWith("/explore") || path.startsWith("/create") || path.startsWith("/library") || path.startsWith("/community")) return "explore";
  return "home";
}

// 몰입형 에디터(자체 하단 도구막대/풀스크린 캔버스 보유) — 토스 BottomNav·BGM 토글을 숨겨
// 자체 UI 와 겹치지 않게 한다. /create(Konva 컷툰), /studio(3D 캐릭터 포저)가 해당.
function isImmersiveEditor(path: string): boolean {
  return path.startsWith("/create") || path.startsWith("/studio");
}

function renderRoute(path: string) {
  const detail = path.match(/^\/title\/(.+)$/);
  if (detail) return <TitleDetailPage id={decodeURIComponent(detail[1])} />;
  if (path === "/play/duel") return <DuelGame />;
  if (path === "/play/quiz") return <QuizGame />;
  if (path === "/play/roulette") return <RouletteGame />;
  if (path === "/play/memory") return <MemoryGame />;
  if (path === "/play/rps") return <RpsGame />;
  if (path.startsWith("/play")) return <PlayHubPage />;
  if (path.startsWith("/ranking")) return <RankingPage />;
  if (path.startsWith("/calendar")) return <CalendarPage />;
  if (path.startsWith("/explore")) return <ExplorePage />;
  if (path.startsWith("/search")) return <SearchPage />;
  if (path.startsWith("/recommend")) return <RecommendPage />;
  if (path.startsWith("/library")) return <LibraryPage />;
  if (path.startsWith("/fortune")) return <FortunePage />;
  if (path.startsWith("/studio")) return <StudioPage />;
  // 창작 스튜디오 — 웹(루트)의 Konva 컷툰 에디터를 lazy 재사용. 자체 모바일 레이아웃으로 렌더.
  if (path.startsWith("/create")) return <CreatePage />;
  if (path.startsWith("/community")) return <CommunityPage />;
  // 숨은 검증 라우트 — 웹 Tailwind 컴포넌트가 토스에서 렌더되는지 확인용(#/sample). 하단 탭 비노출.
  if (path.startsWith("/sample")) return <WebComponentSample />;
  return <TitleListPage />;
}

function BottomNav({ tab }: { tab: TabId }) {
  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        gap: 2,
        padding: "8px 0 calc(8px + env(safe-area-inset-bottom))",
        background: "rgba(21,16,12,0.92)",
        backdropFilter: "blur(8px)",
        borderTop: `1px solid ${theme.border}`,
        zIndex: 50,
      }}
    >
      {NAV.map((it) => {
        const on = tab === it.id;
        return (
          <button
            key={it.id}
            type="button"
            className="pressable"
            onClick={() => navigate(it.to)}
            aria-current={on ? "page" : undefined}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              flex: 1,
              maxWidth: 88,
              padding: "4px 0",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: on ? theme.accent : theme.textMuted,
              fontWeight: on ? 800 : 600,
              fontSize: 11,
            }}
          >
            <span style={{ fontSize: 20 }}>{it.emoji}</span>
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

// 🎵 BGM opt-in 토글 — 기본 OFF(autoplay 정책). 켜는 순간이 사용자 제스처라 그때
// 오디오 컨텍스트가 언락되고 첫 무드가 재생된다. data-no-sfx 로 전역 'tick' 중복을 막는다.
function BgmToggle() {
  const bgm = useAmbientBgm();
  const on = bgm.enabled;
  return (
    <button
      type="button"
      className="pressable"
      data-no-sfx
      aria-pressed={on}
      aria-label={on ? `배경음악 끄기 (현재 ${bgm.mood})` : "배경음악 켜기"}
      title={on ? `배경음악 켜짐 · ${bgm.mood}` : "배경음악 켜기"}
      onClick={() => {
        bgm.toggle(); // 제스처: 컨텍스트 언락 + 첫 무드 재생.
        hapticFeedback("tickWeak");
      }}
      style={{
        position: "fixed",
        right: 14,
        bottom: "calc(78px + env(safe-area-inset-bottom))",
        zIndex: 60,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 40,
        padding: "8px 12px",
        borderRadius: 999,
        border: `1px solid ${on ? theme.accent : theme.border}`,
        background: on ? theme.accentSoft : "rgba(21,16,12,0.82)",
        backdropFilter: "blur(8px)",
        color: on ? theme.accent : theme.textMuted,
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
      }}
    >
      <span aria-hidden style={{ fontSize: 16 }}>
        {on ? "🎵" : "🎧"}
      </span>
      <span>{on ? "배경음악" : "음악 켜기"}</span>
    </button>
  );
}

export function App() {
  const path = useHashPath();
  const tab = activeTab(path);
  const fx = useFx();
  useClickSfx(); // 전역 위임 클릭 'tick'(인터랙티브 요소 탭마다).
  // 몰입형 에디터에서는 토스 셸 크롬(하단 탭·BGM 토글)을 숨겨 에디터 자체 UI 와 겹치지 않게 한다.
  const immersive = isImmersiveEditor(path);

  // 타이틀 카드(인트로 스플래시) 탭 — 파티클 '팡' + 'pop' 효과음 + 토스 햅틱(축포).
  const onTitleCardTap = (e: React.PointerEvent<HTMLDivElement>) => {
    fx.burst(e.clientX, e.clientY, { count: 26, spread: 1.25 });
    fx.sfx("pop");
    hapticFeedback("confetti");
  };

  return (
    <>
      <div onPointerDown={onTitleCardTap} data-no-sfx>
        <IntroSplashScreen />
      </div>
      <div style={{ paddingBottom: immersive ? 0 : 72 }}>{renderRoute(path)}</div>
      {!immersive && <BottomNav tab={tab} />}
      {!immersive && <BgmToggle />}
    </>
  );
}
