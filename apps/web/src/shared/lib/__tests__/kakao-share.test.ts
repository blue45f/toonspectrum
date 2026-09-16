// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SharePayload } from "../share";

const payload: SharePayload = {
  title: "  테스트 작품 · 툰스튜디오  ",
  text: "  여러   줄의\n소개  ",
  url: "https://www.toonstudio.cloud/title/test-work?tab=reviews#top",
  imageUrl: "/covers/test.jpg",
  buttonLabel: " 작품 보기 ",
};

interface TestKakaoRuntime {
  init(key: string): void;
  isInitialized(): boolean;
  Share?: {
    sendDefault(options: unknown): void;
  };
}

function setKakaoRuntime(runtime?: TestKakaoRuntime): void {
  Object.defineProperty(window, "Kakao", {
    configurable: true,
    writable: true,
    value: runtime,
  });
}

async function loadSubject() {
  return import("../kakao-share");
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_KAKAO_JAVASCRIPT_KEY", "test-javascript-key");
  setKakaoRuntime(undefined);
  document
    .getElementById("toonspectrum-kakao-javascript-sdk")
    ?.remove();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setKakaoRuntime(undefined);
  document
    .getElementById("toonspectrum-kakao-javascript-sdk")
    ?.remove();
});

describe("Kakao JavaScript SDK initialization", () => {
  it("SDK 코어를 먼저 받은 뒤 초기화하고 Share 모듈을 사용한다", async () => {
    let initialized = false;
    const sendDefault = vi.fn();
    const runtime: TestKakaoRuntime = {
      init: vi.fn(() => {
        initialized = true;
        runtime.Share = { sendDefault };
      }),
      isInitialized: vi.fn(() => initialized),
    };
    const { shareWithKakao } = await loadSubject();

    const sharing = shareWithKakao(payload);
    const script = document.getElementById(
      "toonspectrum-kakao-javascript-sdk",
    ) as HTMLScriptElement | null;
    expect(script?.src).toBe(
      "https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js",
    );

    setKakaoRuntime(runtime);
    script?.dispatchEvent(new Event("load"));
    await sharing;

    expect(runtime.init).toHaveBeenCalledWith("test-javascript-key");
    expect(sendDefault).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runtime.init).mock.invocationCallOrder[0]).toBeLessThan(
      sendDefault.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(sendDefault).toHaveBeenCalledWith(
      expect.objectContaining({
        objectType: "feed",
        content: expect.objectContaining({
          title: "테스트 작품 · 툰스튜디오",
          description: "여러 줄의 소개",
          imageUrl: "http://localhost:3000/covers/test.jpg",
          link: {
            mobileWebUrl: expect.stringContaining("utm_source=kakao"),
            webUrl: expect.stringContaining("utm_source=kakao"),
          },
        }),
        buttons: [
          expect.objectContaining({
            title: "작품 보기",
          }),
        ],
      }),
    );
  });

  it("초기화 뒤에도 Share 모듈이 없으면 명확하게 실패한다", async () => {
    let initialized = false;
    const runtime: TestKakaoRuntime = {
      init: vi.fn(() => {
        initialized = true;
      }),
      isInitialized: vi.fn(() => initialized),
    };
    const { shareWithKakao } = await loadSubject();

    const sharing = shareWithKakao(payload);
    const script = document.getElementById(
      "toonspectrum-kakao-javascript-sdk",
    );
    setKakaoRuntime(runtime);
    script?.dispatchEvent(new Event("load"));

    await expect(sharing).rejects.toThrow(
      "Kakao Share API was not exposed after initialization.",
    );
    expect(runtime.init).toHaveBeenCalledTimes(1);
  });

  it("이미 초기화된 런타임은 SDK 스크립트를 다시 만들지 않는다", async () => {
    const sendDefault = vi.fn();
    const runtime: TestKakaoRuntime = {
      init: vi.fn(),
      isInitialized: vi.fn(() => true),
      Share: { sendDefault },
    };
    setKakaoRuntime(runtime);
    const { shareWithKakao } = await loadSubject();

    await shareWithKakao(payload);

    expect(runtime.init).not.toHaveBeenCalled();
    expect(sendDefault).toHaveBeenCalledTimes(1);
    expect(
      document.getElementById("toonspectrum-kakao-javascript-sdk"),
    ).toBeNull();
  });
});
