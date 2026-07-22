import "../compat/polyfills"; // 최상단 브라우저 API 폴리필 보완
import "../compat/storage-migrate"; // 스토어 hydrate 전에 레거시 키 이관
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { installStaticCatalog } from "../catalog-static";

import App from "./App";
import "../styles/globals.css";

// API 카탈로그 모드(기본): /api/* 서버 경로에서 KMAS 병합/런타임 정책을 적용한다.
// VITE_CATALOG_SOURCE=static 일 때만 정적 파일/클라이언트 계산 라우팅을 설치한다.
installStaticCatalog();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
