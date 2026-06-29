import "../compat/polyfills"; // 최상단 브라우저 API 폴리필 보완
import "../compat/storage-migrate"; // 스토어 hydrate 전에 레거시 키 이관
import { PlatformContext, webPlatformBridge } from "@heejun/platform-bridge";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { installStaticCatalog } from "../catalog-static";

import App from "./App";
import "../styles/globals.css";

// 정적 카탈로그 모드(기본): 카탈로그 /api/* 호출을 정적 파일/클라이언트 계산으로 라우팅.
// VITE_CATALOG_SOURCE=api 면 비활성(기존 DB/API 경로 유지). 렌더 전에 설치해 첫 fetch부터 적용.
installStaticCatalog();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlatformContext.Provider value={webPlatformBridge}>
      <App />
    </PlatformContext.Provider>
  </StrictMode>
)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

