import { useFx } from "@toonspectrum/core/fx";
import "@toonspectrum/core/fx/fx.css";
import {
  BookMarked,
  Compass,
  Home,
  MessageCircle,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isTossLoginAvailable, tossLoginFlow, useSession } from "@/src/compat/auth-session-store";

import { FloatingControls } from "@/components/FloatingControls";
import { RandomIntro } from "@/components/RandomIntro";
import { AppShell } from "@/src/app/AppShell";

import { BannerAd } from "./components/BannerAd.tsx";
import { MoreMenu } from "./components/MoreMenu.tsx";
import { TossTopBar, TOP_BAR_HEIGHT } from "./components/TossTopBar.tsx";
import { getBannerAdGroupId, useTossFullScreenAd } from "./lib/ads.ts";
import { hapticFeedback, isInToss } from "./lib/toss.ts";
import { theme } from "./theme";

// 반투명 글래스 표면 — 토큰 색을 살짝 투과시켜(backdrop-blur 위) warm-ink 위에 떠 있게 한다.
// raw rgba 대신 color-mix(토큰) 로 팔레트 단일 출처 유지(DESIGN.md: #000/#fff·raw 금지).
const NAV_GLASS = "color-mix(in oklab, var(--color-panel) 90%, transparent)";

// 광고가 사용자 흐름을 방해하지 않는 상한. 배너는 한 화면 한 슬롯만 유지하고, 전면형은
// 자연스러운 주요 화면 전환 3회 + 최소 2분 간격을 모두 만족할 때만 사용자 탭에서 노출한다.
const INTERSTITIAL_NAVIGATION_INTERVAL = 3;
const INTERSTITIAL_MIN_INTERVAL_MS = 2 * 60 * 1000;
const CONTENT_BOTTOM_INSET_WITH_BANNER = 168;

// 하단 네비 = 홈·랭킹·추천·탐색·커뮤니티·서재 — 웹 모바일 탭바와 동일 멤버십/순서로 맞춘다(웹↔토스 sync).
// 연재·놀이터·운세 등은 More 시트와 Explore/Home 섹션으로 한 탭 거리에 둔다(라우트는 모두 등록).
// 아이콘은 웹 모바일 내비와 동일한 lucide(에디토리얼 브랜드 일관 — 이모지 표류 제거).
type TabId = "home" | "ranking" | "recommend" | "explore" | "community" | "library";

// 비탭 라우트일 때 어떤 탭도 활성으로 칠하지 않는 센티넬. nav 가 위치를 거짓말하지 않게 한다.
const NO_TAB = "" as const;
type ActiveTab = TabId | typeof NO_TAB;

const NAV: { id: TabId; label: string; Icon: LucideIcon; to: string }[] = [
  { id: "home", label: "홈", Icon: Home, to: "/" },
  { id: "ranking", label: "랭킹", Icon: Trophy, to: "/ranking" },
  { id: "recommend", label: "추천", Icon: Sparkles, to: "/recommend" },
  { id: "explore", label: "탐색", Icon: Compass, to: "/explore" },
  { id: "community", label: "커뮤니티", Icon: MessageCircle, to: "/community" },
  { id: "library", label: "서재", Icon: BookMarked, to: "/library" },
];

// 경로 → 활성 탭. primary 탭에 정확히 매칭되는 라우트만 칠하고, 그 외(커뮤니티 하위·창작·운세·
// 놀이터·검색·정보/약관 등)는 NO_TAB 을 돌려 '아무 탭도 활성 아님' 으로 둔다 — 하단 nav 가
// 실제 위치와 다른 탭을 활성으로 보여주며 위치를 거짓말하던 문제를 없앤다(웹과 동일한 정확 매칭).
function activeTab(path: string): ActiveTab {
  if (path === "/") return "home";
  if (path.startsWith("/ranking")) return "ranking";
  if (path.startsWith("/recommend")) return "recommend";
  if (path.startsWith("/explore")) return "explore";
  if (path.startsWith("/community")) return "community";
  if (path.startsWith("/library")) return "library";
  // 그 외(작품 상세·연재·놀이터·운세·창작·검색·정보 등)는 어떤 primary 탭에도 속하지 않는다.
  // 더보기(☰)가 이 목적지들의 진입점이라, nav 대신 More 버튼이 오버플로를 책임진다.
  return NO_TAB;
}

// 몰입형 에디터(자체 하단 도구막대/풀스크린 캔버스 보유) — 토스 BottomNav·플로팅 컨트롤을 숨겨
// 자체 UI 와 겹치지 않게 한다. /studio(3D 캐릭터 포저), /create/:id·/create/series/:id(Konva 컷툰)가 해당.
function isImmersiveEditor(path: string): boolean {
  if (path.startsWith("/studio")) return true;
  // /create 갤러리(목록)는 일반 화면. /create/<id>·/create/series/<id>·/create/challenges 만 에디터/세부.
  if (path.startsWith("/create/")) return true;
  return false;
}

// 인증 처리·몰입형 에디터처럼 임시/전체화면 UI에는 광고를 붙이지 않는다. 나머지 화면은 하단 내비와
// 본문 사이의 전용 빈 영역에 표준 배너 한 슬롯을 유지해, 핵심 액션을 덮지 않으면서 노출을 넓힌다.
function canShowPersistentBanner(path: string): boolean {
  return !isImmersiveEditor(path) && !path.startsWith("/auth/callback");
}

function BottomNav({ tab, onNavigate }: { tab: ActiveTab; onNavigate: (to: string) => void }) {
  return (
    <nav
      aria-label="주요 탐색"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        gap: 1,
        padding: "7px 4px calc(7px + env(safe-area-inset-bottom))",
        background: NAV_GLASS,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderTop: `1px solid ${theme.border}`,
        // 상단 미세 하이라이트(다크 표면 깊이감) — warm-ink 축.
        boxShadow: "inset 0 1px 0 0 color-mix(in oklab, var(--color-fg) 5%, transparent)",
        zIndex: 50,
      }}
    >
      {NAV.map((it) => {
        const on = tab === it.id;
        const Icon = it.Icon;
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
              gap: 3,
              flex: 1,
              minWidth: 0,
              maxWidth: 84,
              // 6개 탭이 320px 폭에서도 44px 터치 타깃을 확보하도록 최소 높이 보장.
              minHeight: 50,
              padding: "5px 1px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: on ? theme.accent : theme.textMuted,
              fontWeight: on ? 700 : 600,
              // 라벨이 좁은 폭에서 줄바꿈/오버플로 없이 한 줄 유지(작은 화면 대비 clamp).
              fontSize: "clamp(9.5px, 2.9vw, 11px)",
              whiteSpace: "nowrap",
              lineHeight: 1.1,
              transition: "color 0.15s ease",
            }}
          >
            {/* 액티브 탭은 아이콘 뒤에 persimmon-soft 알약 — 활성 신호를 또렷하게(layout 안정). */}
            <span
              aria-hidden
              style={{
                display: "grid",
                placeItems: "center",
                width: 40,
                height: 26,
                borderRadius: 999,
                background: on ? theme.accentSoft : "transparent",
                transition: "background 0.15s ease",
              }}
            >
              <Icon size={21} strokeWidth={on ? 2.4 : 2} aria-hidden />
            </span>
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
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const interstitial = useTossFullScreenAd("interstitial");
  const eligibleNavigationCountRef = useRef(0);
  const lastInterstitialAtRef = useRef(0);

  const { status } = useSession();
  const hasAttemptedAutoLoginRef = useRef(false);

  // 토스 인앱 환경 진입 시 자동 로그인 시도
  useEffect(() => {
    if (status === "unauthenticated" && !hasAttemptedAutoLoginRef.current && isTossLoginAvailable()) {
      hasAttemptedAutoLoginRef.current = true;
      void tossLoginFlow().then((result) => {
        if (result.ok) {
          console.log("Toss in-app auto login successful");
        } else {
          console.warn("Toss in-app auto login failed:", result.error, result.message);
        }
      });
    }
  }, [status]);

  const tab = activeTab(pathname);
  const immersive = isImmersiveEditor(pathname);
  const persistentBanner =
    canShowPersistentBanner(pathname) &&
    !moreOpen &&
    isInToss() &&
    Boolean(getBannerAdGroupId("banner"));
  // 상단 바의 검색 액션은 다음에서 숨긴다: 검색 페이지(중복), 작품 상세(자체 sticky 헤더가 검색을 가짐),
  // 홈(히어로에 큰 '작품·작가·태그 검색' CTA 가 이미 있어 중복). 그 외엔 상단 바가 검색을 소유한다.
  const showSearch =
    pathname !== "/" &&
    !pathname.startsWith("/search") &&
    !pathname.startsWith("/title/");

  // 본문 인셋 — 고정 상단 바/하단 탭바가 콘텐츠를 가리지 않게 위·아래로 띄운다.
  //  · 상단: 브랜드 바 높이 + safe-area(상태바). 재사용 페이지 eyebrow/히어로가 바 아래에서 시작한다.
  //  · 하단: 탭바 높이 + safe-area. 몰입형 에디터(자체 풀스크린/도구막대)에선 위·아래 모두 0
  //    (100dvh 캔버스·스크롤 보존). 기존 paddingBottom 로직을 미러링한다.
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;
    main.style.paddingTop = immersive ? "0px" : `calc(${TOP_BAR_HEIGHT}px + env(safe-area-inset-top))`;
    main.style.paddingBottom = immersive
      ? "0px"
      : persistentBanner
        ? `calc(${CONTENT_BOTTOM_INSET_WITH_BANNER}px + env(safe-area-inset-bottom))`
        : "calc(72px + env(safe-area-inset-bottom))";
    return () => {
      // 라우트 전환/언마운트 시 인셋을 되돌려, 몰입형↔일반 전환에서 잔여 패딩이 남지 않게 한다.
      main.style.paddingTop = "";
      main.style.paddingBottom = "";
    };
  }, [immersive, persistentBanner]);

  const handleNavigate = (to: string) => {
    if (`${pathname}${search}` === to) return;

    if (interstitial.configured && interstitial.supported) {
      eligibleNavigationCountRef.current += 1;
      const now = Date.now();
      const frequencyReached =
        eligibleNavigationCountRef.current >= INTERSTITIAL_NAVIGATION_INTERVAL;
      const intervalReached =
        now - lastInterstitialAtRef.current >= INTERSTITIAL_MIN_INTERVAL_MS;

      if (interstitial.ready && frequencyReached && intervalReached && interstitial.show()) {
        eligibleNavigationCountRef.current = 0;
        lastInterstitialAtRef.current = now;
      }
    }

    navigate(to);
  };

  return (
    <>
      {/* 상단 브랜드 바 — 몰입형 에디터(자체 풀스크린)에서만 숨긴다. 그 외엔 항상 노출해
          상태바 스크림 + 브랜딩 + 검색/더보기 액션을 책임진다(작품 상세 포함: full-bleed 아트가
          토스 상태바 밑으로 파고드는 충돌을 이 바의 warm-ink 스크림이 막는다). */}
      {!immersive && (
        <TossTopBar
          showSearch={showSearch}
          onSearch={() => handleNavigate("/search")}
          onMore={() => setMoreOpen(true)}
        />
      )}
      <MoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onNavigate={handleNavigate}
      />
      {/* 하단 내비 위 전용 96px 표준 배너. 한 화면에 같은 형식 슬롯은 하나만 유지하며,
          More 임시 시트·인증 처리·몰입형 에디터에서는 제거한다. */}
      {persistentBanner && (
        <BannerAd format="banner" gap={0} placement="above-nav" variant="expanded" />
      )}
      {!immersive && <BottomNav tab={tab} onNavigate={handleNavigate} />}
      {/* 공유 자동 숨김 플로팅 컨트롤 — 토스는 사운드 + BGM 만(다크모드/언어 토글 없음).
          광고가 있으면 표준 배너까지 피해 올리고, 몰입형 에디터에선 자체 도구막대와 겹치지 않게 숨긴다. */}
      {!immersive && (
        <FloatingControls
          showTheme={false}
          showLang={false}
          placement={persistentBanner ? "above-ad-nav" : "above-nav"}
        />
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
