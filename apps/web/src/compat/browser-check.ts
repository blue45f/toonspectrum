/**
 * Browser Compatibility Diagnostic and Error Classification Module
 * 브라우저 호환성 문제를 정밀 진단하고, 런타임 오류가 브라우저 호환성으로 인한 것인지 구분합니다.
 */

import {
  diagnoseStudioInAppBrowserFromGlobals,
  type StudioInAppBrowserDiagnosis,
} from "./in-app-browser";
import {
  classifyRuntimeError,
  type ErrorAnalysis,
} from "./runtime-error-classification";

export type { ErrorAnalysis, ErrorClassificationType } from "./runtime-error-classification";

export interface BrowserCompatibilityResult {
  isSupported: boolean;
  isLegacy: boolean;
  missingFeatures: string[];
  recommendUpdate: boolean;
  browserInfo: {
    name: string;
    version: string;
    os: string;
  };
  /**
   * 임베디드 WebView 판정. 여기서 막지는 않는다 — 인앱 브라우저는 대개 최신 Chromium 이라
   * 기능이 없는 게 아니라 팝업·저장소 정책이 다를 뿐이다. 다만 오류 안내 문구는 달라야 한다:
   * 설정 화면이 없는 브라우저에 "업데이트하세요"는 실행할 수 없는 지시다.
   */
  inAppBrowser: StudioInAppBrowserDiagnosis;
}

/**
 * 사용자 브라우저 정보 추출
 */
export function getBrowserInfo(): { name: string; version: string; os: string } {
  if (typeof window === "undefined" || !navigator) {
    return { name: "Unknown", version: "0", os: "Unknown" };
  }

  const ua = navigator.userAgent;
  let name = "Browser";
  let version = "0";
  let os = "Unknown";

  // OS 감지
  if (ua.indexOf("Win") !== -1) os = "Windows";
  else if (ua.indexOf("Mac") !== -1) os = "macOS";
  else if (ua.indexOf("Android") !== -1) os = "Android";
  else if (ua.indexOf("like Mac") !== -1 || ua.indexOf("iPhone") !== -1 || ua.indexOf("iPad") !== -1) os = "iOS";
  else if (ua.indexOf("Linux") !== -1) os = "Linux";

  // 브라우저 감지
  if (ua.indexOf("Edg") !== -1) {
    name = "Edge";
    version = ua.split("Edg/")[1]?.split(" ")[0] || "0";
  } else if (ua.indexOf("Chrome") !== -1 && ua.indexOf("Chromium") === -1) {
    name = "Chrome";
    version = ua.split("Chrome/")[1]?.split(" ")[0] || "0";
  } else if (ua.indexOf("Safari") !== -1 && ua.indexOf("Chrome") === -1) {
    name = "Safari";
    version = ua.split("Version/")[1]?.split(" ")[0] || "0";
  } else if (ua.indexOf("Firefox") !== -1) {
    name = "Firefox";
    version = ua.split("Firefox/")[1]?.split(" ")[0] || "0";
  } else if (ua.indexOf("MSIE") !== -1 || ua.indexOf("Trident/") !== -1) {
    name = "Internet Explorer";
    version = "11";
  }

  return { name, version, os };
}

/**
 * 현재 브라우저의 필수 기능 지원 여부를 진단합니다.
 */
export function checkBrowserCompatibility(): BrowserCompatibilityResult {
  if (typeof window === "undefined") {
    return {
      isSupported: true,
      isLegacy: false,
      missingFeatures: [],
      recommendUpdate: false,
      browserInfo: { name: "Server", version: "0", os: "Server" },
      inAppBrowser: diagnoseStudioInAppBrowserFromGlobals(),
    };
  }

  const missingFeatures: string[] = [];
  const info = getBrowserInfo();

  // 1. 핵심 JS API
  if (typeof Promise === "undefined") missingFeatures.push("Promise API");
  if (typeof fetch === "undefined") missingFeatures.push("Fetch API");
  if (typeof Symbol === "undefined") missingFeatures.push("ES6 Symbol");
  if (typeof URL === "undefined" || typeof URLSearchParams === "undefined") missingFeatures.push("URL / URLSearchParams");
  if (typeof Map === "undefined" || typeof Set === "undefined") missingFeatures.push("ES6 Map/Set");

  // 2. DOM & Web API
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) {
      missingFeatures.push("WebGL 3D Graphic Engine");
    }
  } catch {
    missingFeatures.push("WebGL 3D Graphic Engine");
  }

  if (typeof localStorage === "undefined") missingFeatures.push("LocalStorage Web Storage");
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
    missingFeatures.push("Modern CSS (CSS.supports)");
  }

  // 3. 구형 브라우저(IE 등) 감지
  const isIE = info.name === "Internet Explorer";
  const majorVersion = parseInt(info.version, 10);
  let isLegacy = isIE;

  if (info.name === "Chrome" && majorVersion < 90) isLegacy = true;
  if (info.name === "Safari" && majorVersion < 14) isLegacy = true;
  if (info.name === "Firefox" && majorVersion < 88) isLegacy = true;
  if (info.name === "Edge" && majorVersion < 90) isLegacy = true;

  const isSupported = missingFeatures.length === 0 && !isIE;
  const recommendUpdate = !isSupported || isLegacy;

  return {
    isSupported,
    isLegacy,
    missingFeatures,
    recommendUpdate,
    browserInfo: info,
    inAppBrowser: diagnoseStudioInAppBrowserFromGlobals(),
  };
}

/**
 * 런타임 에러를 정밀 분석하여 브라우저 호환성 문제인지 일반 오류인지 분류합니다.
 */
export function classifyError(error: unknown): ErrorAnalysis {
  const baseAnalysis = classifyRuntimeError(error);
  if (baseAnalysis.type === "chunk_load" || baseAnalysis.type === "network") {
    return baseAnalysis;
  }

  const compatResult = checkBrowserCompatibility();
  if (
    baseAnalysis.type === "compatibility" ||
    compatResult.missingFeatures.length > 0 ||
    compatResult.isLegacy
  ) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    const missingInfo = compatResult.missingFeatures.length > 0
      ? `미지원 주요 기능: ${compatResult.missingFeatures.join(", ")}`
      : `${compatResult.browserInfo.name} ${compatResult.browserInfo.version} 환경`;
    const inApp = compatResult.inAppBrowser;

    return {
      type: "compatibility",
      title: inApp.inApp ? "인앱 브라우저 제한" : "브라우저 호환성 경고",
      message: inApp.inApp
        ? `${inApp.name ?? "인앱"} 브라우저에서는 이 기능을 쓸 수 없어요. ` +
          `${inApp.escapeHint ?? "주소를 복사해 기본 브라우저에서 열어 주세요."}`
        : "사용 중인 브라우저가 최신 웹 표준 또는 그래픽 기능을 지원하지 않아 사이트가 정상 작동하지 않을 수 있습니다.",
      details: `${missingInfo} (${errObj.message || String(error) || ""})`,
      isCompatibilityIssue: true,
      missingFeatures: compatResult.missingFeatures,
    };
  }

  return baseAnalysis;
}
