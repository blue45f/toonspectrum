import {
  loadFullScreenAd,
  showFullScreenAd,
  TossAds,
  type TossAdsAttachBannerOptions,
} from "@apps-in-toss/web-framework";
import { pauseAudioForAd, resumeAudioAfterAd } from "@toonspectrum/core/fx";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 앱인토스 인앱 배너 광고 헬퍼.
 * 정책: 개발 단계는 테스트 광고 ID만 사용, 운영은 콘솔에서 발급한 광고 그룹 ID를 주입해요.
 * 외부 광고 네트워크는 금지(앱인토스 광고만 허용). 토스 밖/미지원 환경에서는 안전하게 no-op.
 *
 * 용어: 여기서 다루는 건 전부 '배너 광고'예요. SDK에는 광고 타입 구분이 없고,
 * 슬롯 종류(일반 배너 / 피드형 배너 등)는 콘솔 광고 그룹(adGroupId)이 결정해요.
 */

// WebView 배너 테스트 ID(공식 문서). 실제 광고 ID로 테스트하면 정책 위반이라 dev 전용.
const TEST_BANNER_AD_GROUP_ID = "ait-ad-test-banner-id";
// 공식 WebView 배너 가이드는 현재 리스트형 테스트 ID 하나만 제공한다.
const TEST_FEED_AD_GROUP_ID = TEST_BANNER_AD_GROUP_ID;

/** 배너 광고 배치 위치 라벨(슬롯 종류 X, 광고 타입 X) — 어느 콘솔 광고 그룹 ID를 쓸지 고르는 키. */
export type AdFormat = "banner" | "feed";
export type FullScreenAdFormat = "interstitial" | "rewarded";

/**
 * 노출할 배너 광고 그룹 ID.
 * - 운영: 콘솔 발급값(`VITE_TOSS_AD_GROUP_ID` / `VITE_TOSS_FEED_AD_GROUP_ID`)
 * - 개발: 테스트 ID  · 운영인데 미설정: null → 미노출(빈 슬롯 방지)
 * - 서로 다른 형식의 그룹 ID를 폴백으로 공유하지 않음(콘솔 형식과 실제 슬롯 불일치 방지)
 */
export function getBannerAdGroupId(format: AdFormat = "banner"): string | null {
  const banner = import.meta.env.VITE_TOSS_AD_GROUP_ID?.trim();
  const feed = import.meta.env.VITE_TOSS_FEED_AD_GROUP_ID?.trim();
  if (format === "feed") {
    if (feed) return feed;
    return import.meta.env.DEV ? TEST_FEED_AD_GROUP_ID : null;
  }
  if (banner) return banner;
  return import.meta.env.DEV ? TEST_BANNER_AD_GROUP_ID : null;
}

// WebView 보상형 테스트 ID(공식 문서). 보상형은 사용자가 버튼으로 옵트인해야만 노출되므로
// 개발 환경에선 테스트 ID 로 폴백해 흐름(load→loaded→show→reward)을 검증할 수 있게 한다.
const TEST_REWARDED_AD_GROUP_ID = "ait-ad-test-rewarded-id";

/**
 * 전면 광고 그룹 ID. 운영은 콘솔에서 발급받은 값만 사용하고, 미설정 시 광고를 요청하지 않아요.
 * - 전면형(interstitial)은 사용자의 진행을 가리므로 개발 환경에서도 테스트 ID 로 폴백하지 않아요.
 * - 보상형(rewarded)은 옵트인 버튼에서만 노출되므로 개발 환경 한정 테스트 ID 폴백을 허용해요.
 */
export function getFullScreenAdGroupId(
  format: FullScreenAdFormat,
): string | null {
  if (format === "rewarded") {
    const rewarded = import.meta.env.VITE_TOSS_REWARDED_AD_GROUP_ID?.trim();
    if (rewarded) return rewarded;
    return import.meta.env.DEV ? TEST_REWARDED_AD_GROUP_ID : null;
  }
  return import.meta.env.VITE_TOSS_INTERSTITIAL_AD_GROUP_ID?.trim() || null;
}

// SDK는 앱 전체에서 한 번만 초기화(중복 초기화 금지) — 모듈 스코프로 상태 공유.
let sdkInitialized = false;
let sdkInitializing = false;

function isAdsSupported(): boolean {
  try {
    return Boolean(TossAds?.initialize?.isSupported?.());
  } catch {
    return false;
  }
}

/** TossAds 초기화 + 배너 부착 헬퍼 훅. ready(초기화 완료), attach(반환 객체 destroy()로 정리). */
export function useTossBanner() {
  const [ready, setReady] = useState(sdkInitialized);

  useEffect(() => {
    if (sdkInitialized) {
      setReady(true);
      return;
    }
    if (sdkInitializing || !isAdsSupported()) return;
    sdkInitializing = true;
    try {
      TossAds.initialize({
        callbacks: {
          onInitialized: () => {
            sdkInitialized = true;
            sdkInitializing = false;
            setReady(true);
          },
          onInitializationFailed: () => {
            sdkInitializing = false;
          },
        },
      });
    } catch {
      sdkInitializing = false;
    }
  }, []);

  const attach = useCallback(
    (
      adGroupId: string,
      element: HTMLElement,
      options?: TossAdsAttachBannerOptions,
    ) => {
      if (!ready) return undefined;
      try {
        return TossAds.attachBanner(adGroupId, element, options);
      } catch {
        return undefined;
      }
    },
    [ready],
  );

  return { ready, attach, supported: isAdsSupported() };
}

type FullScreenAdCallbacks = Readonly<{
  /** 보상형 광고에서 SDK의 userEarnedReward 이벤트가 온 경우에만 호출해요. */
  onReward?: (reward: { unitType: string; unitAmount: number }) => void;
  /** 광고 노출이 끝났을 때(dismissed/failedToShow/오류 정리 포함) 1회 호출해요. */
  onClosed?: () => void;
  onError?: (error: Error) => void;
}>;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isFullScreenAdSupported(): boolean {
  try {
    return Boolean(
      loadFullScreenAd.isSupported() && showFullScreenAd.isSupported(),
    );
  } catch {
    return false;
  }
}

/**
 * 앱인토스 IntegratedAd 전면/보상형 광고 훅.
 *
 * 공식 순서인 `load → loaded 확인 → show → dismissed 후 다음 load`를 보장하고,
 * 언마운트·재로딩 때 SDK 이벤트 리스너를 반드시 해제해요. `show()`는 사용자 액션에서만
 * 호출해야 하며 자동 노출하지 않습니다. 보상은 `userEarnedReward` 수신 때만 지급해야 해요.
 */
export function useTossFullScreenAd(
  format: FullScreenAdFormat,
  callbacks: FullScreenAdCallbacks = {},
) {
  const adGroupId = getFullScreenAdGroupId(format);
  const supported = isFullScreenAdSupported();
  const [ready, setReady] = useState(false);
  const loadUnregisterRef = useRef<(() => void) | null>(null);
  const showUnregisterRef = useRef<(() => void) | null>(null);
  const loadRef = useRef<() => void>(() => undefined);
  const onRewardRef = useRef(callbacks.onReward);
  const onClosedRef = useRef(callbacks.onClosed);
  const onErrorRef = useRef(callbacks.onError);

  onRewardRef.current = callbacks.onReward;
  onClosedRef.current = callbacks.onClosed;
  onErrorRef.current = callbacks.onError;

  const unregisterLoad = () => {
    loadUnregisterRef.current?.();
    loadUnregisterRef.current = null;
  };

  const unregisterShow = () => {
    showUnregisterRef.current?.();
    showUnregisterRef.current = null;
  };

  loadRef.current = () => {
    unregisterLoad();
    setReady(false);
    if (!adGroupId || !supported) return;

    try {
      loadUnregisterRef.current = loadFullScreenAd({
        options: { adGroupId },
        onEvent: ({ type }) => {
          if (type !== "loaded") return;
          unregisterLoad();
          setReady(true);
        },
        onError: (error) => {
          unregisterLoad();
          setReady(false);
          onErrorRef.current?.(toError(error));
        },
      });
    } catch (error) {
      setReady(false);
      onErrorRef.current?.(toError(error));
    }
  };

  useEffect(() => {
    loadRef.current();
    return () => {
      unregisterLoad();
      unregisterShow();
    };
  }, [adGroupId, supported]);

  const show = (): boolean => {
    if (!ready || !adGroupId || !supported) return false;

    unregisterShow();
    setReady(false);
    let finished = false;
    const finishAndReload = () => {
      if (finished) return;
      finished = true;
      unregisterShow();
      resumeAudioAfterAd();
      onClosedRef.current?.();
      loadRef.current();
    };

    try {
      pauseAudioForAd();
      showUnregisterRef.current = showFullScreenAd({
        options: { adGroupId },
        onEvent: (event) => {
          if (event.type === "userEarnedReward") {
            onRewardRef.current?.(event.data);
          }
          if (event.type === "dismissed" || event.type === "failedToShow") {
            finishAndReload();
          }
        },
        onError: (error) => {
          onErrorRef.current?.(toError(error));
          finishAndReload();
        },
      });
      return true;
    } catch (error) {
      onErrorRef.current?.(toError(error));
      finishAndReload();
      return false;
    }
  };

  return {
    configured: Boolean(adGroupId),
    ready,
    reload: () => loadRef.current(),
    show,
    supported,
  };
}
