import {
  absoluteShareImageUrl,
  shareText,
  type SharePayload,
  withShareAttribution,
} from "./share";

const KAKAO_SDK_ID = "toonspectrum-kakao-javascript-sdk";
const KAKAO_SDK_URL =
  "https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js";
const KAKAO_SDK_INTEGRITY =
  "sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy";
const KAKAO_SDK_TIMEOUT_MS = 12_000;

interface KakaoLink {
  readonly mobileWebUrl: string;
  readonly webUrl: string;
}

interface KakaoShareRuntime {
  init(javaScriptKey: string): void;
  isInitialized(): boolean;
  Share: {
    sendDefault(options: KakaoDefaultShareOptions): void;
  };
}

interface KakaoDefaultShareOptions {
  readonly objectType: "feed";
  readonly content: {
    readonly title: string;
    readonly description: string;
    readonly imageUrl: string;
    readonly link: KakaoLink;
  };
  readonly buttons: readonly {
    readonly title: string;
    readonly link: KakaoLink;
  }[];
}

declare global {
  interface Window {
    Kakao?: KakaoShareRuntime;
  }
}

let sdkPromise: Promise<KakaoShareRuntime> | null = null;

export function kakaoJavaScriptKey(): string {
  return import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY?.trim() ?? "";
}

export function isKakaoShareConfigured(): boolean {
  return kakaoJavaScriptKey().length > 0;
}

function currentRuntime(): KakaoShareRuntime | null {
  return typeof window !== "undefined" && window.Kakao?.Share
    ? window.Kakao
    : null;
}

function loadKakaoSdk(): Promise<KakaoShareRuntime> {
  const current = currentRuntime();
  if (current) return Promise.resolve(current);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<KakaoShareRuntime>((resolve, reject) => {
    let settled = false;
    const settle = (
      result: { readonly runtime: KakaoShareRuntime } | { readonly error: Error },
    ) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if ("runtime" in result) resolve(result.runtime);
      else reject(result.error);
    };
    const finish = () => {
      const runtime = currentRuntime();
      settle(
        runtime
          ? { runtime }
          : { error: new Error("Kakao Share API was not exposed.") },
      );
    };
    let timeoutId = 0;
    const fail = () =>
      settle({ error: new Error("Kakao JavaScript SDK could not be loaded.") });

    timeoutId = window.setTimeout(() => {
      settle({ error: new Error("Kakao JavaScript SDK loading timed out.") });
    }, KAKAO_SDK_TIMEOUT_MS);

    const existing = document.getElementById(
      KAKAO_SDK_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", fail, { once: true });
      window.setTimeout(() => {
        if (currentRuntime()) finish();
      }, 0);
      return;
    }

    const script = document.createElement("script");
    script.id = KAKAO_SDK_ID;
    script.src = KAKAO_SDK_URL;
    script.integrity = KAKAO_SDK_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", fail, { once: true });
    document.head.append(script);
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });

  return sdkPromise;
}

export async function shareWithKakao(payload: SharePayload): Promise<void> {
  const key = kakaoJavaScriptKey();
  if (!key) throw new Error("Kakao JavaScript key is not configured.");

  const kakao = await loadKakaoSdk();
  if (!kakao.isInitialized()) kakao.init(key);

  const url = withShareAttribution(payload.url, "kakao");
  const link = { mobileWebUrl: url, webUrl: url };
  kakao.Share.sendDefault({
    objectType: "feed",
    content: {
      title: payload.title.trim().slice(0, 120),
      description: shareText(payload).slice(0, 200),
      imageUrl: absoluteShareImageUrl(payload.imageUrl),
      link,
    },
    buttons: [
      {
        title: payload.buttonLabel?.trim().slice(0, 30) || "자세히 보기",
        link,
      },
    ],
  });
}
