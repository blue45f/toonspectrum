import IntroSplashScreen from "./components/IntroSplashScreen.tsx";
import { CardBattleGame } from "./pages/games/CardBattleGame.tsx";
import { DiceBoardGame } from "./pages/games/DiceBoardGame.tsx";
import { DuelGame } from "./pages/games/DuelGame.tsx";
import { MemoryGame } from "./pages/games/MemoryGame.tsx";
import { QuizGame } from "./pages/games/QuizGame.tsx";
import { RouletteGame } from "./pages/games/RouletteGame.tsx";
import { PlayHubPage } from "./pages/PlayHubPage.tsx";
import { TitleDetailPage } from "./pages/TitleDetailPage.tsx";
import { TitleListPage } from "./pages/TitleListPage.tsx";
import { navigate, useHashPath } from "./router";
import { theme } from "./theme";

function renderRoute(path: string) {
  const detail = path.match(/^\/title\/(.+)$/);
  if (detail) return <TitleDetailPage id={decodeURIComponent(detail[1])} />;
  if (path === "/play/duel") return <DuelGame />;
  if (path === "/play/quiz") return <QuizGame />;
  if (path === "/play/roulette") return <RouletteGame />;
  if (path === "/play/memory") return <MemoryGame />;
  if (path === "/play/dice") return <DiceBoardGame />;
  if (path === "/play/cardbattle") return <CardBattleGame />;
  if (path.startsWith("/play")) return <PlayHubPage />;
  return <TitleListPage />;
}

function BottomNav({ tab }: { tab: "home" | "play" }) {
  const items = [
    { id: "home", label: "작품", emoji: "📚", to: "/" },
    { id: "play", label: "놀이터", emoji: "🎮", to: "/play" },
  ] as const;
  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        gap: 8,
        padding: "8px 0 calc(8px + env(safe-area-inset-bottom))",
        background: "rgba(21,16,12,0.92)",
        backdropFilter: "blur(8px)",
        borderTop: `1px solid ${theme.border}`,
        zIndex: 50,
      }}
    >
      {items.map((it) => {
        const on = tab === it.id;
        return (
          <button
            key={it.id}
            type="button"
            className="pressable"
            onClick={() => navigate(it.to)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              width: 92,
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
  const tab = path.startsWith("/play") ? "play" : "home";
  return (
    <>
      <IntroSplashScreen />
      <div style={{ paddingBottom: 72 }}>{renderRoute(path)}</div>
      <BottomNav tab={tab} />
    </>
  );
}
