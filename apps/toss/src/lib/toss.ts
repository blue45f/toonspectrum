/**
 * 앱인토스 WebView 브릿지 래퍼.
 * 토스 환경이 아닐 때(일반 브라우저/개발)는 안전하게 폴백하되, 로그인 오류는 상위 흐름이
 * 사용자 취소·SDK 실패를 구분해 안내할 수 있도록 숨기지 않아요.
 */
import {
  appLogin,
  generateHapticFeedback,
  getAnonymousKey,
  getOperationalEnvironment,
  getSchemeUri,
  getTossShareLink,
  openURL,
  share,
  type HapticFeedbackType,
} from "@apps-in-toss/web-framework";

export type { HapticFeedbackType };

export type TossEnv = "toss" | "sandbox" | "web";

/** 'toss'(실기기/앱) | 'sandbox'(샌드박스) | 'web'(브릿지 없음). */
export function getTossEnv(): TossEnv {
  try {
    return getOperationalEnvironment();
  } catch {
    return "web";
  }
}

export const isInToss = (): boolean => getTossEnv() !== "web";

const TOSS_OG_IMAGE_URL = "https://toonspectrum.vercel.app/og-toss.png";

/**
 * 비게임 미니앱 사용자 식별키(hash). 서버/동의 없이 미니앱 내 고유 사용자 식별.
 * 샌드박스에서는 mock, 미지원/실패 시 null.
 */
export async function getStableUserKey(): Promise<string | null> {
  try {
    const result = await getAnonymousKey();
    if (result && typeof result === "object" && result.type === "HASH") {
      return result.hash;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 토스 로그인 인가 코드 획득. 토큰 교환/사용자 조회는 서버에서 처리해야 해요(mTLS).
 * 인가 코드는 10분 유효·일회성.
 */
export async function tossAppLogin(): Promise<{
  authorizationCode: string;
  referrer: "DEFAULT" | "SANDBOX";
} | null> {
  const result = await appLogin();
  return result ?? null;
}

/**
 * 디바이스 햅틱 진동(토스 네이티브). 토스 밖(일반 브라우저/개발)에서는 조용히 no-op.
 * 'tickWeak'(가벼운 탭) ~ 'confetti'(축포) 등 — fx 파티클/효과음과 함께 써요.
 */
export function hapticFeedback(type: HapticFeedbackType): void {
  if (!isInToss()) return;
  try {
    void generateHapticFeedback({ type }).catch(() => {
      // 미지원 디바이스/환경은 조용히 무시
    });
  } catch {
    // 미지원 디바이스/환경은 조용히 무시
  }
}

/**
 * 외부 웹 URL 을 기기 기본 브라우저로 연다(토스 네이티브 openURL → 일반 브라우저 window.open 폴백).
 * 약관·개인정보처리방침 등 운영 사이트(자사 서비스) 정책 문서 아웃링크에 사용한다.
 * (앱 설치 유도가 아니라 동일 서비스의 법적 고지 문서로의 이동이라 외부링크 가이드라인에 부합.)
 */
export function openExternalUrl(url: string): void {
  if (isInToss()) {
    try {
      void openURL(url);
      return;
    } catch {
      // fall through to web fallback
    }
  }
  try {
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch {
    // 차단/미지원 환경은 조용히 무시
  }
}

/** 이 미니앱으로 돌아오는 딥링크 스킴(intoss://pickflow ...). */
export function getMiniAppSchemeUri(): string | null {
  try {
    return getSchemeUri();
  } catch {
    return null;
  }
}

/** 앱 시작 시 전달된 intoss 딥링크 중 앱이 지원하는 내부 경로만 반환한다. */
export function resolveTossEntryRoute(): string | null {
  const scheme = getMiniAppSchemeUri();
  if (!scheme) return null;
  try {
    const path = new URL(scheme).pathname;
    if (/^\/title\/[a-zA-Z0-9_-]+$/.test(path)) return path;
    if (
      path === "/" ||
      path === "/ranking" ||
      path === "/recommend" ||
      path === "/explore" ||
      path === "/community" ||
      path === "/library" ||
      path === "/fortune"
    ) {
      return path;
    }
  } catch {
    // malformed/unsupported scheme
  }
  return null;
}

/** 공식 앱인토스 공유 링크 + 1200×600 OG 이미지를 생성한다. */
export async function buildTossShareLink(path = "/"): Promise<string | null> {
  if (!isInToss()) return null;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  try {
    const link = await getTossShareLink(
      `intoss://toonspectrum${normalizedPath === "/" ? "" : normalizedPath}`,
      TOSS_OG_IMAGE_URL,
    );
    return typeof link === "string" && link.length > 0 ? link : null;
  } catch {
    return null;
  }
}

/**
 * 메시지 공유. 토스 네이티브 공유 → navigator.share → 클립보드 순으로 폴백.
 * @returns 공유/복사 성공 여부
 */
export async function shareMessage(
  message: string,
): Promise<"toss" | "web-share" | "clipboard" | null> {
  if (isInToss()) {
    try {
      await share({ message });
      return "toss";
    } catch {
      // fall through to web fallbacks
    }
  }

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      await navigator.share({ text: message });
      return "web-share";
    }
  } catch {
    return null; // 사용자가 공유 시트를 닫은 경우 등
  }

  try {
    await navigator.clipboard.writeText(message);
    return "clipboard";
  } catch {
    return null;
  }
}
