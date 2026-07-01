import { PlatformContext } from "@heejun/platform-bridge";
import { TDSMobileAITProvider } from "@toss/tds-mobile-ait";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";

// 웹의 레거시 스토리지 키 이관(스토어 hydrate 전에 최상단). 웹 main 과 동일 출처.
import "@/src/compat/storage-migrate";
import { installStaticCatalog } from "@/src/catalog-static";
import { setRuntimeApiBase } from "@/src/infrastructure/runtime-api-base";

import config from "../apps-in-toss.config.ts";
import { App } from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { API_BASE, isAdultTitle } from "./lib/api.ts";
import {
  buildTossShareLink,
  resolveTossEntryRoute,
  tossAppLogin,
} from "./lib/toss.ts";
import { tossPlatformBridge } from "./platform/tossBridge.ts";
// 웹 디자인 시스템(Tailwind v4 + 토큰 + 커스텀 유틸리티)을 먼저 로드해 웹 feature
// 컴포넌트(전 페이지)가 그대로 렌더되게 한다. 토스 셸의 기본 스타일은 그 다음
// index.css 가 덮어써 기존 인라인 크롬(BottomNav 등)의 외형을 보존한다.
import "./web-theme.css";
import "./index.css";

// 앱인토스는 시스템 테마 연동을 지원하지 않고 라이트 모드 기준 출시를 요구한다.
// 웹 본체의 사용자 테마는 건드리지 않고, 토스 WebView 엔트리에서만 정책 테마를 고정한다.
document.documentElement.dataset.theme = "light";
document.documentElement.style.colorScheme = "light";

// 공유 API 클라이언트는 웹에선 동일 출처 /api를 쓰지만, 토스 WebView는 별도 호스트에서 실행된다.
// 빌드 환경변수 유무와 무관하게 로그인·리뷰 등 모든 동적 API를 배포 오리진으로 고정한다.
setRuntimeApiBase(API_BASE);

// 공유 카탈로그 데이터 레이어(웹과 단일 출처) 설치 — 토스 정책만 옵션으로 주입한다:
//  ① dataBase: 교차 출처 WebView 라 /data·/api 를 배포 오리진(API_BASE)에서 가져온다.
//  ② filterTitle: 19+ 성인물 제외(비게임 미니앱 심사 요건). 카탈로그 시드에서 빠져 전 표면 일관.
// 렌더 전에 설치해 첫 fetch 부터 적용한다(웹 main.tsx 와 동일 순서).
installStaticCatalog({
  dataBase: API_BASE,
  filterTitle: (t) => !isAdultTitle(t),
});

// 토스 네이티브 로그인 노출 — 웹 로그인 모달(auth-modal)이 이 전역을 감지해 '토스로 로그인'을 띄운다.
// appLogin 인가코드 → 서버 mTLS 교환(/auth/toss/exchange). 토스 환경에서만 주입(웹 entry 엔 없음).
globalThis.__toonspectrumTossLogin = () => tossAppLogin();
globalThis.__toonspectrumTossShareLink = (path) => buildTossShareLink(path);

// getSchemeUri는 HashRouter가 자동으로 읽지 않으므로 첫 렌더 전에 안전한 딥링크 경로를 해시에 반영한다.
const entryRoute = resolveTossEntryRoute();
if (entryRoute && globalThis.location.hash !== `#${entryRoute}`) {
  globalThis.location.hash = entryRoute;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TDSMobileAITProvider
      brandPrimaryColor={config.brand.primaryColor}
      // 공유 Tailwind 디자인 시스템이 body/a/p 등 기본값을 소유한다. TDS reset을 함께 켜면
      // Emotion의 늦은 전역 규칙이 임의 text/background 유틸을 덮어 대비가 무너진다.
      resetGlobalCss={false}
    >
      <PlatformContext.Provider value={tossPlatformBridge}>
        <ErrorBoundary>
          {/* 토스 WebView 는 실 URL/history 가 없어 HashRouter(#/path)로 라우팅한다. 웹 호환 레이어
              (usePathname/useRouter/Link)와 AppRouter 가 100% react-router-dom 기반이라 그대로 동작하고,
              기존 토스 해시 URL 규약(#/ranking …)·딥링크도 보존된다. */}
          <HashRouter>
            <App />
          </HashRouter>
        </ErrorBoundary>
      </PlatformContext.Provider>
    </TDSMobileAITProvider>
  </StrictMode>,
);
