/**
 * Pure in-app browser (인앱브라우저) classification and 3D engine admission policy.
 *
 * Korean traffic reaches the studio overwhelmingly through embedded WebViews — KakaoTalk, the
 * NAVER app, Instagram, Band, Toss — rather than through a standalone browser. Those hosts share
 * three properties that matter to a next-generation 3D renderer:
 *
 * 1. the GPU process is shared with the host application and is reclaimed under memory pressure,
 *    so an adapter that probes successfully can still disappear mid-session;
 * 2. the user cannot open devtools, switch renderers, or reload without losing the host context;
 * 3. `navigator.gpu` may exist while the embedder has not enabled a usable WebGPU device.
 *
 * The module therefore never reads `navigator`, `window`, or renderer state. Adapters pass the raw
 * user-agent string plus explicitly observed signals, so tests, workers, and SSR agree exactly with
 * the browser. Classification is a bounded heuristic and is always reported alongside a confidence
 * level; policy decisions must degrade safely when confidence is `low`.
 */

export type StudioBg3dInAppBrowserFamily =
  | "kakaotalk"
  | "naver-app"
  | "instagram"
  | "facebook"
  | "threads"
  | "line"
  | "band"
  | "daum"
  | "toss"
  | "coupang"
  | "android-webview"
  | "ios-webview"
  | "standalone";

export type StudioBg3dInAppBrowserPlatform = "android" | "ios" | "other";

export type StudioBg3dInAppBrowserConfidence = "high" | "medium" | "low";

/**
 * How aggressively the host may be trusted with a WebGPU device.
 *
 * - `trusted`: a standalone browser; `auto` may promote to WebGPU once the adapter probe passes.
 * - `opt-in`: a WebView that can run WebGPU but cannot recover visibly from device loss, so `auto`
 *   stays on WebGL2 and only an explicit user choice promotes it.
 * - `blocked`: a host where a WebGPU device is known to be unusable or unrecoverable; even an
 *   explicit user choice is refused so the editor never presents a dead viewport.
 */
export type StudioBg3dInAppBrowserGpuTrust = "trusted" | "opt-in" | "blocked";

export interface StudioBg3dInAppBrowserSignals {
  /** Raw `navigator.userAgent`. Never parsed for anything but the bounded tokens below. */
  readonly userAgent?: string;
  /** `navigator.standalone` on iOS, or a display-mode media query result. Optional. */
  readonly displayModeStandalone?: boolean;
}

export interface StudioBg3dInAppBrowserProfile {
  readonly family: StudioBg3dInAppBrowserFamily;
  readonly platform: StudioBg3dInAppBrowserPlatform;
  readonly isInApp: boolean;
  readonly confidence: StudioBg3dInAppBrowserConfidence;
  readonly gpuTrust: StudioBg3dInAppBrowserGpuTrust;
  /** Human-readable Korean label for status surfaces. */
  readonly label: string;
}

/** Longest user-agent the classifier will read; longer input is truncated, never rejected. */
export const STUDIO_BG3D_INAPP_USER_AGENT_MAX_LENGTH = 1_024;

const FAMILY_LABELS: Readonly<Record<StudioBg3dInAppBrowserFamily, string>> = Object.freeze({
  kakaotalk: "카카오톡 인앱 브라우저",
  "naver-app": "네이버 앱 인앱 브라우저",
  instagram: "인스타그램 인앱 브라우저",
  facebook: "페이스북 인앱 브라우저",
  threads: "스레드 인앱 브라우저",
  line: "라인 인앱 브라우저",
  band: "밴드 인앱 브라우저",
  daum: "다음 앱 인앱 브라우저",
  toss: "토스 인앱 브라우저",
  coupang: "쿠팡 인앱 브라우저",
  "android-webview": "안드로이드 웹뷰",
  "ios-webview": "iOS 웹뷰",
  standalone: "일반 브라우저",
});

/**
 * A WebView whose GPU process is owned by a host app that reclaims it under memory pressure gets
 * `opt-in`. Hosts that historically fail to produce a usable device at all get `blocked`.
 */
const FAMILY_GPU_TRUST: Readonly<Record<StudioBg3dInAppBrowserFamily, StudioBg3dInAppBrowserGpuTrust>> =
  Object.freeze({
    kakaotalk: "opt-in",
    "naver-app": "opt-in",
    instagram: "blocked",
    facebook: "blocked",
    threads: "blocked",
    line: "opt-in",
    band: "opt-in",
    daum: "opt-in",
    toss: "opt-in",
    coupang: "opt-in",
    "android-webview": "opt-in",
    "ios-webview": "opt-in",
    standalone: "trusted",
  });

interface FamilyMatcher {
  readonly family: StudioBg3dInAppBrowserFamily;
  readonly pattern: RegExp;
  readonly confidence: StudioBg3dInAppBrowserConfidence;
}

/**
 * Ordered most-specific first. Instagram/Threads embed Facebook's `FBAV`/`FB_IAB` tokens, so the
 * narrower app token has to win before the shared one is considered.
 */
const FAMILY_MATCHERS: readonly FamilyMatcher[] = Object.freeze([
  { family: "kakaotalk", pattern: /\bKAKAOTALK\b/iu, confidence: "high" },
  { family: "band", pattern: /\bBAND\/[\d.]/iu, confidence: "high" },
  { family: "threads", pattern: /\bBarcelona\b/u, confidence: "medium" },
  { family: "instagram", pattern: /\bInstagram\b/iu, confidence: "high" },
  { family: "naver-app", pattern: /\bNAVER\(inapp/iu, confidence: "high" },
  { family: "daum", pattern: /\bDaumApps?\b/iu, confidence: "high" },
  { family: "toss", pattern: /\b(?:TossApp|viewer-toss)\b/iu, confidence: "high" },
  { family: "coupang", pattern: /\bCoupang\b/iu, confidence: "medium" },
  { family: "line", pattern: /\bLine\/[\d.]/iu, confidence: "high" },
  { family: "facebook", pattern: /\bFB(?:AN|AV|_IAB)\b/u, confidence: "high" },
]);

const ANDROID_PATTERN = /\bAndroid\b/iu;
const IOS_PATTERN = /\b(?:iPhone|iPad|iPod)\b/iu;
/** Chrome's WebView marker: the platform token list carries a bare `wv`. */
const ANDROID_WEBVIEW_PATTERN = /;\s*wv[);]/iu;
const SAFARI_PATTERN = /\bSafari\/[\d.]/iu;
/** Safari and SFSafariViewController advertise both `Version/x Mobile` and `Safari/x`. */
const IOS_BROWSER_VERSION_PATTERN = /\bVersion\/[\d.]+ Mobile\b/iu;
/** Third-party iOS browsers ship their own tokens even though they run WebKit. */
const IOS_STANDALONE_BROWSER_PATTERN = /\b(?:CriOS|FxiOS|EdgiOS|Whale|OPiOS|DuckDuckGo)\b/iu;

function normalizeUserAgent(userAgent: string | undefined): string {
  if (typeof userAgent !== "string") return "";
  return userAgent.slice(0, STUDIO_BG3D_INAPP_USER_AGENT_MAX_LENGTH);
}

function resolvePlatform(userAgent: string): StudioBg3dInAppBrowserPlatform {
  if (ANDROID_PATTERN.test(userAgent)) return "android";
  if (IOS_PATTERN.test(userAgent)) return "ios";
  return "other";
}

function profile(
  family: StudioBg3dInAppBrowserFamily,
  platform: StudioBg3dInAppBrowserPlatform,
  confidence: StudioBg3dInAppBrowserConfidence,
): StudioBg3dInAppBrowserProfile {
  return Object.freeze({
    family,
    platform,
    isInApp: family !== "standalone",
    confidence,
    gpuTrust: FAMILY_GPU_TRUST[family],
    label: FAMILY_LABELS[family],
  });
}

/**
 * Classifies the embedding host. An unreadable or absent user-agent resolves to `standalone` with
 * `low` confidence rather than to a guessed WebView, because callers combine this with an adapter
 * probe that already fails closed.
 */
export function classifyStudioBg3dInAppBrowser(
  signals: StudioBg3dInAppBrowserSignals,
): StudioBg3dInAppBrowserProfile {
  const userAgent = normalizeUserAgent(signals?.userAgent);
  const platform = resolvePlatform(userAgent);
  if (userAgent.length === 0) return profile("standalone", platform, "low");

  for (const matcher of FAMILY_MATCHERS) {
    if (matcher.pattern.test(userAgent)) return profile(matcher.family, platform, matcher.confidence);
  }

  if (platform === "android" && ANDROID_WEBVIEW_PATTERN.test(userAgent)) {
    return profile("android-webview", platform, "medium");
  }
  // A bare WKWebView omits the `Version/x Mobile … Safari/x` pair that Safari and
  // SFSafariViewController always send. Third-party WebKit browsers and home-screen web apps carry
  // their own markers and stay standalone.
  const isSafariShapedUserAgent =
    IOS_BROWSER_VERSION_PATTERN.test(userAgent) && SAFARI_PATTERN.test(userAgent);
  if (
    platform === "ios" &&
    signals?.displayModeStandalone !== true &&
    !IOS_STANDALONE_BROWSER_PATTERN.test(userAgent) &&
    !isSafariShapedUserAgent
  ) {
    return profile("ios-webview", platform, "medium");
  }
  return profile("standalone", platform, userAgent.length > 0 ? "high" : "low");
}
