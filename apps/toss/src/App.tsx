import { useFx } from "@toonspectrum/core/fx";
import "@toonspectrum/core/fx/fx.css";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { FloatingControls } from "@/components/FloatingControls";
import { RandomIntro } from "@/components/RandomIntro";
import { AppShell } from "@/src/app/AppShell";

import { BannerAd } from "./components/BannerAd.tsx";
import { MoreMenu } from "./components/MoreMenu.tsx";
import { hapticFeedback } from "./lib/toss.ts";
import { theme } from "./theme";

// 하단 네비 = 홈·랭킹·연재·탐색·서재·놀이터. 내 서재는 핵심 기능이라 primary 탭으로 노출한다.
// 검색은 셸 검색 FAB, 추천은 홈 섹션/오버플로로 진입하므로 하단 탭엔 넣지 않는다(라우트는 등록).
const NAV = [
  { id: "home", label: "홈", emoji: "📚", to: "/" },
  { id: "ranking", label: "랭킹", emoji: "🏆", to: "/ranking" },
  { id: "calendar", label: "연재", emoji: "📅", to: "/calendar" },
  { id: "explore", label: "탐색", emoji: "🧭", to: "/explore" },
  { id: "library", label: "서재", emoji: "📖", to: "/library" },
  { id: "play", label: "놀이터", emoji: "🎮", to: "/play" },
] as const;

type TabId = (typeof NAV)[number]["id"];

// 경로 → 활성 탭. 비탭 라우트는 "어디서 진입하는지"로 가장 가까운 primary 탭에 귀속한다.
function activeTab(path: string): TabId {
  // 운세·3D 스튜디오는 놀이터 허브(/play)에서 진입하므로 '놀이터' 탭에 귀속.
  if (path.startsWith("/play") || path.startsWith("/fortune") || path.startsWith("/studio")) return "play";
  if (path.startsWith("/ranking")) return "ranking";
  if (path.startsWith("/calendar")) return "calendar";
  if (path.startsWith("/library")) return "library";
  // 탐색 오버플로(ExplorePage 상단 칩)로 진입하는 부가 화면들 — 창작·내 서재·커뮤니티·추천·정보/약관 등.
  // 검색(/search)도 어느 탭에서든 Top 검색 버튼으로 열리지만, 비탭 라우트라 가장 가까운 '탐색'에 귀속한다.
  if (
    path.startsWith("/explore") ||
    path.startsWith("/create") ||
    path.startsWith("/library") ||
    path.startsWith("/community") ||
    path.startsWith("/recommend") ||
    path.startsWith("/reviews") ||
    path.startsWith("/insights") ||
    path.startsWith("/tags") ||
    path.startsWith("/authors") ||
    path.startsWith("/news") ||
    path.startsWith("/compare") ||
    path.startsWith("/random") ||
    path.startsWith("/search") ||
    path.startsWith("/settings") ||
    path.startsWith("/me") ||
    path.startsWith("/about") ||
    path.startsWith("/guide") ||
    path.startsWith("/sitemap") ||
    path.startsWith("/design") ||
    path.startsWith("/feedback") ||
    path.startsWith("/support") ||
    path.startsWith("/contact") ||
    path.startsWith("/terms") ||
    path.startsWith("/privacy") ||
    path.startsWith("/copyright") ||
    path.startsWith("/info")
  )
    return "explore";
  // 작품 상세(/title/..)·작가/카페·홈 등 그 외는 홈에 귀속.
  return "home";
}

// 몰입형 에디터(자체 하단 도구막대/풀스크린 캔버스 보유) — 토스 BottomNav·플로팅 컨트롤을 숨겨
// 자체 UI 와 겹치지 않게 한다. /studio(3D 캐릭터 포저), /create/:id·/create/series/:id(Konva 컷툰)가 해당.
function isImmersiveEditor(path: string): boolean {
  if (path.startsWith("/studio")) return true;
  // /create 갤러리(목록)는 일반 화면. /create/<id>·/create/series/<id>·/create/challenges 만 에디터/세부.
  if (path.startsWith("/create/")) return true;
  return false;
}

// 리스트형(카드 그리드) 화면 — 콘텐츠가 끝나는 자연스러운 지점에 토스 인앱 배너 광고를 1회 배치한다
// (ATF·핵심 액션 위 금지). 상세·에디터·운세·놀이터 등 비리스트 화면엔 넣지 않는다.
function isListPage(path: string): boolean {
  return (
    path === "/" ||
    path.startsWith("/ranking") ||
    path.startsWith("/calendar") ||
    path.startsWith("/explore") ||
    path.startsWith("/recommend") ||
    path.startsWith("/search") ||
    path.startsWith("/library") ||
    path.startsWith("/tags") ||
    path.startsWith("/authors") ||
    path.startsWith("/news") ||
    path.startsWith("/reviews")
  );
}

// 토스 셸 검색 어포던스 — 어느 탭에서든 통합 검색(/search)으로 진입. 하단 탭은 5개로 꽉 차 있어
// 검색은 우상단 플로팅 버튼(셸 크롬)으로 노출한다. 검색·상세·몰입형 에디터 화면에선 숨긴다.
function SearchFab({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      className="pressable"
      onClick={onPress}
      aria-label="통합 검색"
      title="검색"
      style={{
        position: "fixed",
        top: "calc(10px + env(safe-area-inset-top))",
        right: 12,
        zIndex: 60,
        width: 44,
        height: 44,
        display: "grid",
        placeItems: "center",
        borderRadius: 999,
        border: `1px solid ${theme.border}`,
        background: "rgba(34,26,19,0.82)",
        backdropFilter: "blur(8px)",
        color: theme.text,
        fontSize: 19,
        cursor: "pointer",
      }}
    >
      🔍
    </button>
  );
}

// 토스 셸 "더보기"(More) 어포던스 — 웹 SiteHeader 오버플로 메뉴(☰)의 토스판.
// 하단 탭 6개로 못 담는 부가 기능(창작 게시판·커뮤니티·추천·운세·리뷰·비교 등) 전부로 가는 진입점.
// 검색 FAB 왼쪽(우상단)에 두고, 몰입형 에디터에선 검색 FAB과 함께 숨긴다.
function MoreFab({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      className="pressable"
      onClick={onPress}
      aria-label="더보기 메뉴"
      aria-haspopup="dialog"
      title="더보기"
      style={{
        position: "fixed",
        top: "calc(10px + env(safe-area-inset-top))",
        right: 64,
        zIndex: 60,
        width: 44,
        height: 44,
        display: "grid",
        placeItems: "center",
        borderRadius: 999,
        border: `1px solid ${theme.border}`,
        background: "rgba(34,26,19,0.82)",
        backdropFilter: "blur(8px)",
        color: theme.text,
        fontSize: 19,
        cursor: "pointer",
      }}
    >
      ☰
    </button>
  );
}

function BottomNav({ tab, onNavigate }: { tab: TabId; onNavigate: (to: string) => void }) {
  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        gap: 1,
        padding: "6px 2px calc(6px + env(safe-area-inset-bottom))",
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
            onClick={() => onNavigate(it.to)}
            aria-current={on ? "page" : undefined}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              flex: 1,
              minWidth: 0,
              maxWidth: 88,
              // 6개 탭이 320px 폭에서도 44px 터치 타깃을 확보하도록 최소 높이 보장.
              minHeight: 48,
              padding: "4px 1px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: on ? theme.accent : theme.textMuted,
              fontWeight: on ? 800 : 600,
              // 라벨이 좁은 폭에서 줄바꿈/오버플로 없이 한 줄 유지(작은 화면 대비 clamp).
              fontSize: "clamp(9.5px, 2.9vw, 11px)",
              whiteSpace: "nowrap",
              lineHeight: 1.1,
            }}
          >
            <span style={{ fontSize: "clamp(18px, 5.4vw, 20px)" }}>{it.emoji}</span>
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * 토스 셸 크롬 — 공유 AppShell(웹 페이지 전체) 둘레에 토스 정책 크롬을 두른다.
 * 라우터 컨텍스트(HashRouter) 안에서 마운트되므로 react-router 의 useLocation/useNavigate 로
 * 현재 경로·탭을 읽는다(웹 호환 레이어와 동일 출처).
 */
function TossChrome() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const tab = activeTab(pathname);
  const immersive = isImmersiveEditor(pathname);
  // 검색 FAB 은 몰입형 에디터·검색 페이지(중복)·상세 페이지(자체 sticky 헤더와 겹침)에선 숨긴다.
  const showSearchFab =
    !immersive && !pathname.startsWith("/search") && !pathname.startsWith("/title/");
  // "더보기"(☰) FAB 은 몰입형 에디터(자체 풀스크린)에서만 숨기고, 그 외 모든 화면에서 노출한다.
  // (전 라우트로 가는 유일한 진입점이라 검색/상세 화면에서도 살려둔다.)
  const showMoreFab = !immersive;

  // 본문 하단 여백 — 고정 BottomNav 가 마지막 콘텐츠를 가리지 않게 탭바 높이만큼 띄운다.
  // 몰입형 에디터(자체 풀스크린/도구막대)에선 탭이 없으므로 여백 0(스크롤·100dvh 캔버스 보존).
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;
    main.style.paddingBottom = immersive ? "0px" : "calc(72px + env(safe-area-inset-bottom))";
  }, [immersive]);

  return (
    <>
      {showMoreFab && <MoreFab onPress={() => setMoreOpen(true)} />}
      {showSearchFab && <SearchFab onPress={() => navigate("/search")} />}
      <MoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} />
      {/* 리스트형 화면 콘텐츠 끝에 토스 인앱 배너 광고 1회(ATF 아님). 토스 밖/미설정 시 자동 미노출. */}
      {!immersive && isListPage(pathname) && (
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 16px 8px" }}>
          <BannerAd format="feed" />
        </div>
      )}
      {!immersive && <BottomNav tab={tab} onNavigate={(to) => navigate(to)} />}
      {/* 공유 자동 숨김 플로팅 컨트롤 — 토스는 사운드 + BGM 만(다크모드/언어 토글 없음).
          하단 탭바 위(above-nav)로 띄우고, 몰입형 에디터에선 자체 도구막대와 겹치지 않게 숨긴다. */}
      {!immersive && (
        <FloatingControls showTheme={false} showLang={false} placement="above-nav" />
      )}
    </>
  );
}

/**
 * 본문 여백/스플래시 — 몰입형 에디터에선 하단 탭이 없어 여백 0, 그 외엔 탭바 높이만큼 띄운다.
 * 라우터 컨텍스트 안에서 경로를 읽어야 하므로 AppShell 의 mainClassName 으로는 못 갈라(정적) 셸에서 처리한다.
 */
function TossSplash() {
  const fx = useFx();

  // 타이틀 카드(인트로 스플래시) 탭 — 파티클 '팡' + 'pop' 효과음 + 토스 햅틱(축포).
  const onTitleCardTap = (e: React.PointerEvent<HTMLDivElement>) => {
    fx.burst(e.clientX, e.clientY, { count: 26, spread: 1.25 });
    fx.sfx("pop");
    hapticFeedback("confetti");
  };

  return (
    // 공유 동적 인트로/스플래시(NO fork) — 토스는 매 진입(앱 재오픈)마다 노출하므로 once={false}.
    // RandomIntro 가 마운트마다 구 IntroSplash(Three.js 웨이브)/현행 SplashScreen 을 랜덤 노출한다.
    // 타이틀 카드 탭 시 파티클 '팡' + 'pop' + 토스 햅틱(축포) 으로 동적 연출.
    <div onPointerDown={onTitleCardTap} data-no-sfx>
      <RandomIntro once={false} />
    </div>
  );
}

export function App() {
  return (
    <AppShell
      // 토스는 웹 SiteHeader/SiteFooter 대신 TDS BottomNav·검색 FAB(자체 크롬)을 쓴다(심사 요건: 네이티브 내비).
      header={null}
      footer={null}
      // 토스는 토글 일부만(사운드·BGM) — TossChrome 안에서 경로별 노출을 갈라 직접 렌더한다.
      floatingControls={null}
      splash={<TossSplash />}
      // 스킵 링크는 BottomNav 가 본문 포커스를 담당하는 토스 WebView 에선 생략.
      showSkipLink={false}
      // 하단 탭바 높이만큼 본문 여백(몰입형 에디터는 자체 풀스크린이라 따로 음수 마진 불필요 —
      // BannerAd/탭이 숨겨져 여백이 남아도 빈 영역일 뿐이라 안전하게 일괄 패딩).
      mainClassName="min-h-screen outline-none"
      chromeOverlay={<TossChrome />}
    />
  );
}
