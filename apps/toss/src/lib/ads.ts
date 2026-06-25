import { TossAds, type TossAdsAttachBannerOptions } from '@apps-in-toss/web-framework';
import { useCallback, useEffect, useState } from 'react';

/**
 * 앱인토스 인앱 배너 광고 헬퍼.
 * 정책: 개발 단계는 테스트 광고 ID만 사용, 운영은 콘솔에서 발급한 광고 그룹 ID를 주입해요.
 * 외부 광고 네트워크는 금지(앱인토스 광고만 허용). 토스 밖/미지원 환경에서는 안전하게 no-op.
 *
 * 용어: 여기서 다루는 건 전부 '배너 광고'예요. SDK에는 광고 타입 구분이 없고,
 * 슬롯 종류(일반 배너 / 피드형 배너 등)는 콘솔 광고 그룹(adGroupId)이 결정해요.
 */

// WebView 배너 테스트 ID(공식 문서). 실제 광고 ID로 테스트하면 정책 위반이라 dev 전용.
const TEST_BANNER_AD_GROUP_ID = 'ait-ad-test-banner-id';
const TEST_FEED_AD_GROUP_ID = 'ait-ad-test-native-image-id';

/** 배너 광고 배치 위치 라벨(슬롯 종류 X, 광고 타입 X) — 어느 콘솔 광고 그룹 ID를 쓸지 고르는 키. */
export type AdFormat = 'banner' | 'feed';

/**
 * 노출할 배너 광고 그룹 ID.
 * - 운영: 콘솔 발급값(`VITE_TOSS_AD_GROUP_ID` / `VITE_TOSS_FEED_AD_GROUP_ID`)
 * - 개발: 테스트 ID  · 운영인데 미설정: null → 미노출(빈 슬롯 방지)
 */
export function getBannerAdGroupId(format: AdFormat = 'banner'): string | null {
  const banner = import.meta.env.VITE_TOSS_AD_GROUP_ID?.trim();
  const feed = import.meta.env.VITE_TOSS_FEED_AD_GROUP_ID?.trim();
  if (format === 'feed') {
    if (feed) return feed;
    if (banner) return banner;
    return import.meta.env.DEV ? TEST_FEED_AD_GROUP_ID : null;
  }
  if (banner) return banner;
  return import.meta.env.DEV ? TEST_BANNER_AD_GROUP_ID : null;
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
    (adGroupId: string, element: HTMLElement, options?: TossAdsAttachBannerOptions) => {
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
