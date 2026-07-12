import {
  type BgmPlaylistEntry,
  type SfxName,
  playSfx,
  registerBgmPlaylist,
  triggerParticleBurst,
} from "@toonspectrum/core/fx";
import { type ReactNode, lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { shouldRenderAppSplash } from "./app-shell-splash";
import { AppRouter } from "./routes/AppRouter";

import { AuthSessionProvider } from "@/components/auth/session-provider";
import { CommandPaletteHost } from "@/components/command-palette-host";
import { RandomIntro } from "@/components/RandomIntro";
import { pingVisit } from "@/lib/visits-api";
import { resolveAssetUrl } from "@/src/catalog-static";

// 공유 fx 키프레임/유틸(.pf-* + --ts-fx-* 토큰). 전역 1회 import(웹·토스 공유).
import "@toonspectrum/core/fx/fx.css";

// 보컬 BGM manifest(`public/audio/playlist.json`) — 트랙 추가는 파일만 얹고 manifest 에 등록.
// 스키마: { tracks: [{ src, title, artist, license, creditUrl }] }
const BGM_MANIFEST_URL = "/audio/playlist.json";

// manifest 로드 실패(오프라인·구버전 배포) 폴백 — 기존 수동 등록 트랙을 유지한다.
const FALLBACK_BGM_PLAYLIST: readonly BgmPlaylistEntry[] = [
  {
    url: "/audio/toonspectrum-anime-vocal-opening.mp3",
    label: "별빛 페이지 · Vocal Opening",
    artist: "PuyoPuyoMegaFan1234",
    creditUrl: "https://pixabay.com/music/upbeat-anime-239882/",
  },
];

/** manifest JSON → 검증된 플레이리스트 항목. 토스 교차출처 WebView 용으로 src 를 배포 오리진에 절대화. */
function parseBgmManifest(data: unknown): BgmPlaylistEntry[] {
  const tracks = (data as { tracks?: unknown })?.tracks;
  if (!Array.isArray(tracks)) return [];
  return tracks.flatMap((raw): BgmPlaylistEntry[] => {
    const track = raw as { src?: unknown; title?: unknown; artist?: unknown; creditUrl?: unknown };
    if (typeof track?.src !== "string" || track.src.trim() === "") return [];
    return [
      {
        url: resolveAssetUrl(track.src.trim()),
        label: typeof track.title === "string" ? track.title : undefined,
        artist: typeof track.artist === "string" ? track.artist : undefined,
        creditUrl: typeof track.creditUrl === "string" ? track.creditUrl : undefined,
      },
    ];
  });
}

const AgeGateHost = lazy(() =>
  import("@/components/age-gate-host").then((mod) => ({
    default: mod.AgeGateHost,
  })),
);
const StoreSync = lazy(() =>
  import("@/components/auth/store-sync").then((mod) => ({
    default: mod.StoreSync,
  })),
);
const ToastHost = lazy(() =>
  import("@/components/toast-host").then((mod) => ({ default: mod.ToastHost })),
);

// 라우트 전환 시 스크롤을 최상단으로 되돌리고, 본문 랜드마크로 포커스를 옮긴다(a11y).
// 첫 진입(직접 연 위치)은 포커스를 가로채지 않는다. 웹·토스 공유.
function ScrollToTop() {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    globalThis.scrollTo({ top: 0, left: 0 });
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}

function useDeferredByInput(timeoutMs = 4500) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    let timeoutId = 0;
    const activate = () => setReady(true);
    const options = { passive: true } as const;

    timeoutId = window.setTimeout(activate, timeoutMs);
    window.addEventListener("pointerdown", activate, options);
    window.addEventListener("keydown", activate);
    window.addEventListener("scroll", activate, options);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("pointerdown", activate);
      window.removeEventListener("keydown", activate);
      window.removeEventListener("scroll", activate);
    };
  }, [ready, timeoutMs]);

  return ready;
}

// 방문 핑 — 앱 마운트 시 하루 1회(localStorage 디바운스). best-effort, 렌더 비차단.
function useVisitPing() {
  useEffect(() => {
    void pingVisit();
  }, []);
}

/**
 * 웹과 토스가 함께 쓰는 라이선스 보컬 BGM. manifest(`/audio/playlist.json`)를 읽어 등록하고,
 * 로드 실패 시 기존 폴백 트랙을 유지한다(파일이 없거나 재생이 막히면 코어의 합성 BGM이 남는다).
 * 토스 WebView(교차 출처)는 resolveAssetUrl 이 manifest·트랙 경로를 배포 오리진으로 절대화한다.
 */
function useVocalBgmPlaylist() {
  useEffect(() => {
    let cancelled = false;
    // 폴백 즉시 등록 — manifest 도착 전 첫 제스처에서 BGM을 켜도 보컬 트랙이 나오게 한다.
    registerBgmPlaylist(
      FALLBACK_BGM_PLAYLIST.map((track) => ({ ...track, url: resolveAssetUrl(track.url) })),
    );
    void fetch(resolveAssetUrl(BGM_MANIFEST_URL), { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (cancelled || data == null) return;
        const tracks = parseBgmManifest(data);
        if (tracks.length > 0) registerBgmPlaylist(tracks);
      })
      .catch(() => {
        // manifest 미존재/네트워크 실패 — 폴백 플레이리스트 유지(합성 BGM 최종 폴백).
      });
    return () => {
      cancelled = true;
    };
  }, []);
}

/**
 * 전역 포인터 피드백. 모든 인터랙티브 요소에는 화려한 파티클 버스트와 상황별 맞춤 SFX를 더해요.
 */
function useClickVisualFeedback() {
  useEffect(() => {
    const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");

    let lastBurstAt = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>(
        "button, a[href], [role='button'], [role='tab'], [role='menuitem'], .pressable",
      );
      if (
        !target ||
        target.matches(":disabled, [aria-disabled='true'], [data-no-fx]") ||
        target.closest("[data-no-fx]")
      ) {
        return;
      }

      const now = performance.now();
      if (now - lastBurstAt < 40) return;
      lastBurstAt = now;

      // 요소 종류 및 클래스에 따른 맞춤 연출 결정
      const isTossAction = target.matches("[data-toss], .toss-btn, [data-coin], [data-points]");
      const isLikeHeart = target.matches("[data-like], [data-favorite], .like-btn, .heart-btn");
      const isTab = target.matches("[role='tab'], .tab-item, [data-tab]");
      const isPrimaryCta = target.matches(".bg-accent, .bg-accent-2, [data-fx='celebrate'], [data-state='active']");

      let chars: string[] = ["✨", "⚡", "⭐"];
      let count = 8;
      let durationMs = 480;
      let spread = 0.65;
      let sfx: SfxName = "tick";

      if (isTossAction) {
        chars = ["🪙", "💎", "✨"];
        count = 12;
        durationMs = 650;
        spread = 0.9;
        sfx = "toss_coin";
      } else if (isLikeHeart) {
        chars = ["💖", "🌸", "✨"];
        count = 14;
        durationMs = 700;
        spread = 0.95;
        sfx = "heart";
      } else if (isTab) {
        chars = ["✨", "✦"];
        count = 6;
        durationMs = 400;
        spread = 0.5;
        sfx = "tab";
      } else if (isPrimaryCta) {
        chars = ["✦", "✧", "★", "⚡"];
        count = 16;
        durationMs = 720;
        spread = 1.0;
        sfx = "sparkle";
      }

      // pointerdown 한 곳에서 상황별 SFX를 정확히 한 번만 재생한다.
      if (!target.matches("[data-no-sfx]") && !target.closest("[data-no-sfx]")) {
        playSfx(sfx);
      }

      // 동작 최소화는 시각 모션만 줄인다. 사용자가 명시적으로 켠 오디오 피드백은 유지한다.
      if (reducedMotion?.matches) return;

      triggerParticleBurst(event.clientX, event.clientY, {
        count,
        chars,
        durationMs,
        spread,
      });

      if (typeof target.animate === "function") {
        target.animate(
          [
            { transform: "scale(1)", filter: "brightness(1) saturate(1)" },
            { transform: "scale(0.94)", filter: "brightness(1.22) saturate(1.3)", offset: 0.35 },
            { transform: "scale(1)", filter: "brightness(1) saturate(1)" },
          ],
          { duration: 240, easing: "cubic-bezier(0.175, 0.885, 0.32, 1.275)" },
        );
      }
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
}

function DeferredGlobalOverlays() {
  const ready = useDeferredByInput();
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <AgeGateHost />
      <ToastHost />
    </Suspense>
  );
}

export interface AppShellProps {
  /**
   * 본문 위 상단 크롬(웹=SiteHeader, 토스=null — 토스는 자체 TDS BottomNav/SearchFab 를 chromeOverlay 로 띄운다).
   */
  header?: ReactNode;
  /** 본문 아래 푸터(웹=SiteFooter). 토스는 BottomNav 가 대신하므로 생략한다. */
  footer?: ReactNode;
  /**
   * 자동 숨김 플로팅 컨트롤 클러스터. 채널마다 노출 컨트롤이 달라(웹=사운드·BGM·테마·언어,
   * 토스=사운드·BGM) 호출부가 구성한 엘리먼트를 그대로 받는다.
   */
  floatingControls?: ReactNode;
  /**
   * 콘텐츠 트리 밖(셸 최상위)에 얹는 채널 전용 오버레이.
   * 웹=BackToTop·DeskCloud 마운트, 토스=BottomNav·검색 FAB.
   */
  chromeOverlay?: ReactNode;
  /** 인트로/스플래시 노출. 기본=RandomIntro(구 IntroSplash/현행 SplashScreen 랜덤, 세션 1회). 토스는 once={false} 엘리먼트를 직접 넘긴다. */
  splash?: ReactNode;
  /** 'sr-only' 스킵 링크 노출(웹 키보드 a11y). 토스 WebView 는 BottomNav 가 본문 포커스를 담당해 생략. */
  showSkipLink?: boolean;
  /** <main> 에 적용할 클래스(웹=풀 높이·반응형 패딩, 토스=하단 탭 여백 등). */
  mainClassName?: string;
}

/**
 * AppShell — 웹(/)·토스(apps/toss) **공유** 앱 본문 셸.
 *
 * 라우터 컨텍스트 안쪽(웹=BrowserRouter, 토스=HashRouter)에서 마운트되며, 양 채널이 동일한
 * 콘텐츠 트리(AuthSessionProvider → AppRouter(웹 도메인 페이지 전체) + 커맨드 팔레트 + 전역
 * 오버레이 + 스토어 동기화 + 스크롤/포커스 복원)를 공유한다. 채널 차이(상단/하단 크롬, 플로팅
 * 컨트롤, 스플래시, 스킵 링크)는 prop 으로만 주입한다 — 페이지/데이터 포크 0.
 */
export function AppShell({
  header,
  footer,
  floatingControls,
  chromeOverlay,
  splash,
  showSkipLink = true,
  mainClassName = "min-h-screen pb-20 outline-none md:pb-0",
}: AppShellProps) {
  const { pathname, search } = useLocation();
  useVisitPing();
  useVocalBgmPlaylist();
  // 전역 포인터 피드백 훅이 기본 클릭음과 상황별 SFX를 한 번만 라우팅한다.
  useClickVisualFeedback();
  return (
    <AuthSessionProvider>
      {shouldRenderAppSplash(pathname, search) ? (splash ?? <RandomIntro />) : null}
      <Suspense fallback={null}>
        <StoreSync />
      </Suspense>
      <ScrollToTop />
      {showSkipLink && (
        <a
          href="#main-content"
          className="sr-only rounded-md focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-fg focus:px-4 focus:py-2 focus:font-semibold focus:text-canvas"
        >
          본문으로 건너뛰기
        </a>
      )}
      {header}
      <main id="main-content" tabIndex={-1} className={mainClassName}>
        <AppRouter />
      </main>
      {footer}
      <CommandPaletteHost />
      <DeferredGlobalOverlays />
      {floatingControls}
      {chromeOverlay}
    </AuthSessionProvider>
  );
}

export default AppShell;
