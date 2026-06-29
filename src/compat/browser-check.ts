/**
 * Browser Compatibility Diagnostic and Error Classification Module
 * 브라우저 호환성 문제를 정밀 진단하고, 런타임 오류가 브라우저 호환성으로 인한 것인지 구분합니다.
 */

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
}

export type ErrorClassificationType = "compatibility" | "network" | "chunk_load" | "general";

export interface ErrorAnalysis {
  type: ErrorClassificationType;
  title: string;
  message: string;
  details?: string;
  isCompatibilityIssue: boolean;
  missingFeatures?: string[];
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
  };
}

/**
 * 런타임 에러를 정밀 분석하여 브라우저 호환성 문제인지 일반 오류인지 분류합니다.
 */
export function classifyError(error: unknown): ErrorAnalysis {
  const compatResult = checkBrowserCompatibility();
  const errObj = error instanceof Error ? error : new Error(String(error));
  const errName = errObj.name || "";
  const errMessage = errObj.message || String(error) || "";
  const stack = errObj.stack || "";

  const lowerMsg = errMessage.toLowerCase();
  const lowerName = errName.toLowerCase();
  const lowerStack = stack.toLowerCase();

  // A. 동적 청크 로딩 오류 (Vite/배포 업데이트 관련 네트워크 청크 오류)
  if (
    lowerMsg.includes("failed to fetch dynamically imported module") ||
    lowerMsg.includes("loading chunk") ||
    lowerMsg.includes("error loading dynamically imported module") ||
    lowerName.includes("chunkloaderror")
  ) {
    return {
      type: "chunk_load",
      title: "앱 업데이트 및 모듈 로딩 오류",
      message: "새로운 버전이 배포되었거나 네트워크 연결이 불안정하여 모듈을 불러오지 못했습니다.",
      details: errMessage,
      isCompatibilityIssue: false,
    };
  }

  // B. 순수 네트워크 에러 (Failed to fetch, NetworkError 등)
  if (
    lowerMsg.includes("networkerror") ||
    lowerMsg.includes("failed to fetch") ||
    (lowerMsg.includes("fetch") && lowerMsg.includes("failed")) ||
    lowerName.includes("networkerror")
  ) {
    return {
      type: "network",
      title: "네트워크 연결 오류",
      message: "인터넷 연결 상태가 불안정하거나 서버와 통신할 수 없습니다.",
      details: errMessage,
      isCompatibilityIssue: false,
    };
  }

  // C. 브라우저 호환성/미지원 API 관련 오류 인자 검출
  const compatKeywords = [
    "is not a function",
    "is undefined",
    "is not defined",
    "can't find variable",
    "not supported",
    "unsupported",
    "webgl",
    "illegal invocation",
    "invalid character",
    "unexpected token",
    "syntaxerror",
    "object doesn't support property or method",
  ];

  const hasCompatKeyword = compatKeywords.some(
    (kw) => lowerMsg.includes(kw) || lowerName.includes(kw)
  );

  // 미지원 기능이 감지되었거나, 호환성 키워드가 포함된 TypeError/ReferenceError/SyntaxError일 때
  const isCompatErrType =
    errName === "TypeError" ||
    errName === "ReferenceError" ||
    errName === "SyntaxError" ||
    errName === "NotSupportedError" ||
    lowerStack.includes("polyfill");

  if (compatResult.missingFeatures.length > 0 || compatResult.isLegacy || (hasCompatKeyword && isCompatErrType)) {
    const missingInfo = compatResult.missingFeatures.length > 0
      ? `미지원 주요 기능: ${compatResult.missingFeatures.join(", ")}`
      : `${compatResult.browserInfo.name} ${compatResult.browserInfo.version} 환경`;

    return {
      type: "compatibility",
      title: "브라우저 호환성 경고",
      message: "사용 중인 브라우저가 최신 웹 표준 또는 그래픽 기능을 지원하지 않아 사이트가 정상 작동하지 않을 수 있습니다.",
      details: `${missingInfo} (${errMessage})`,
      isCompatibilityIssue: true,
      missingFeatures: compatResult.missingFeatures,
    };
  }

  // D. 일반 애플리케이션 런타임 오류
  return {
    type: "general",
    title: "시스템 실행 오류",
    message: "화면을 표시하는 중 예상치 못한 문제가 발생했습니다.",
    details: errMessage,
    isCompatibilityIssue: false,
  };
}
