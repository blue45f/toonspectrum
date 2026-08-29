import { describe, expect, it } from "vitest";

import {
  classifyStudioBg3dInAppBrowser,
  STUDIO_BG3D_INAPP_USER_AGENT_MAX_LENGTH,
} from "./studio-bg3d-inapp-browser";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1";
const IOS_WEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 15; SM-S928N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.0.0 Mobile Safari/537.36";

describe("Studio BG3D in-app browser classification", () => {
  it("identifies KakaoTalk on either platform and asks for an explicit WebGPU opt-in", () => {
    const android = classifyStudioBg3dInAppBrowser({
      userAgent: `${ANDROID_WEBVIEW} KAKAOTALK 10.6.5`,
    });
    expect(android).toMatchObject({
      family: "kakaotalk",
      platform: "android",
      isInApp: true,
      gpuTrust: "opt-in",
      confidence: "high",
    });

    expect(classifyStudioBg3dInAppBrowser({ userAgent: `${IOS_WEBVIEW} KAKAOTALK 10.6.5` }))
      .toMatchObject({ family: "kakaotalk", platform: "ios", gpuTrust: "opt-in" });
  });

  it("identifies the NAVER app even though it also carries the Android WebView marker", () => {
    expect(classifyStudioBg3dInAppBrowser({
      userAgent: `${ANDROID_WEBVIEW} NAVER(inapp; search; 2000; 12.9.6)`,
    })).toMatchObject({ family: "naver-app", gpuTrust: "opt-in", confidence: "high" });
  });

  it("prefers the specific app token over the shared Facebook in-app token", () => {
    expect(classifyStudioBg3dInAppBrowser({
      userAgent: `${IOS_WEBVIEW} Instagram 350.0.0.0 (iPhone16,2; iOS 18_2) FBAN/Instagram`,
    })).toMatchObject({ family: "instagram", gpuTrust: "blocked" });

    expect(classifyStudioBg3dInAppBrowser({
      userAgent: `${IOS_WEBVIEW} [FBAN/FBIOS;FBAV/500.0.0.0]`,
    })).toMatchObject({ family: "facebook", gpuTrust: "blocked" });

    expect(classifyStudioBg3dInAppBrowser({ userAgent: `${ANDROID_WEBVIEW} Barcelona 350.0` }))
      .toMatchObject({ family: "threads", gpuTrust: "blocked" });
  });

  it("treats a bare Android WebView and a bare iOS WKWebView as in-app hosts", () => {
    expect(classifyStudioBg3dInAppBrowser({ userAgent: ANDROID_WEBVIEW }))
      .toMatchObject({ family: "android-webview", isInApp: true, gpuTrust: "opt-in" });
    expect(classifyStudioBg3dInAppBrowser({ userAgent: IOS_WEBVIEW }))
      .toMatchObject({ family: "ios-webview", isInApp: true, gpuTrust: "opt-in" });
  });

  it("treats standalone browsers, WebKit-based iOS browsers, and home-screen apps as trusted", () => {
    expect(classifyStudioBg3dInAppBrowser({ userAgent: ANDROID_CHROME }))
      .toMatchObject({ family: "standalone", isInApp: false, gpuTrust: "trusted" });
    expect(classifyStudioBg3dInAppBrowser({ userAgent: IOS_SAFARI }))
      .toMatchObject({ family: "standalone", gpuTrust: "trusted" });
    expect(classifyStudioBg3dInAppBrowser({
      userAgent: `${IOS_WEBVIEW} CriOS/133.0.0.0`,
    })).toMatchObject({ family: "standalone", gpuTrust: "trusted" });
    expect(classifyStudioBg3dInAppBrowser({
      userAgent: IOS_WEBVIEW,
      displayModeStandalone: true,
    })).toMatchObject({ family: "standalone", gpuTrust: "trusted" });
  });

  it("falls back to a trusted standalone profile with low confidence for an absent user agent", () => {
    expect(classifyStudioBg3dInAppBrowser({}))
      .toMatchObject({ family: "standalone", confidence: "low", platform: "other" });
    expect(classifyStudioBg3dInAppBrowser({ userAgent: "" }))
      .toMatchObject({ family: "standalone", confidence: "low" });
  });

  it("bounds how much of a hostile user agent it is willing to scan", () => {
    const padding = "x".repeat(STUDIO_BG3D_INAPP_USER_AGENT_MAX_LENGTH);
    expect(classifyStudioBg3dInAppBrowser({ userAgent: `${padding} KAKAOTALK 10.6.5` }))
      .toMatchObject({ family: "standalone" });
    expect(classifyStudioBg3dInAppBrowser({ userAgent: `KAKAOTALK 10.6.5 ${padding}` }))
      .toMatchObject({ family: "kakaotalk" });
  });

  it("returns frozen profiles so a status surface cannot mutate the classification", () => {
    expect(Object.isFrozen(classifyStudioBg3dInAppBrowser({ userAgent: ANDROID_CHROME }))).toBe(true);
  });
});
