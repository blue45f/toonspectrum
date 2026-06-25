import IntroSplashScreen from "./components/IntroSplashScreen.tsx";
import { CalendarPage } from "./pages/CalendarPage.tsx";
import { CommunityPage } from "./pages/CommunityPage.tsx";
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
import { TitleDetailPage } from "./pages/TitleDetailPage.tsx";
import { TitleListPage } from "./pages/TitleListPage.tsx";
import { navigate, useHashPath } from "./router";
import { theme } from "./theme";

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
  // 운세는 놀이터 허브 배너로 진입하므로 '놀이터' 탭에 귀속.
  if (path.startsWith("/play") || path.startsWith("/fortune")) return "play";
  if (path.startsWith("/ranking")) return "ranking";
  if (path.startsWith("/calendar")) return "calendar";
  // 내 서재·커뮤니티는 '탐색' 오버플로로 진입하므로 '탐색' 탭에 귀속.
  if (path.startsWith("/explore") || path.startsWith("/library") || path.startsWith("/community")) return "explore";
  return "home";
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
  if (path.startsWith("/community")) return <CommunityPage />;
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

export function App() {
  const path = useHashPath();
  const tab = activeTab(path);
  return (
    <>
      <IntroSplashScreen />
      <div style={{ paddingBottom: 72 }}>{renderRoute(path)}</div>
      <BottomNav tab={tab} />
    </>
  );
}
