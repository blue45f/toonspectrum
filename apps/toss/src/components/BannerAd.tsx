import type { TossAdsAttachBannerOptions } from '@apps-in-toss/web-framework';
import { useEffect, useRef, useState } from 'react';

import { type AdFormat, getBannerAdGroupId, useTossBanner } from '../lib/ads';
import { isInToss } from '../lib/toss';

type BannerAdProps = Readonly<{
  /** 배너 광고 배치 위치(광고 타입 아님). banner=표준 가로 배너 · feed=콘솔 '배너(피드형)' 그룹. */
  format?: AdFormat;
  /** 위/아래 여백(px). 인접 콘텐츠와의 간격 조절. */
  gap?: number;
  /** flow=본문 흐름 · above-nav=하단 내비 바로 위에 고정. */
  placement?: 'flow' | 'above-nav';
  /** SDK가 허용하는 공식 배너 외형 프리셋. */
  variant?: NonNullable<TossAdsAttachBannerOptions['variant']>;
}>;

/**
 * 앱인토스 인앱 배너 광고 슬롯 (토스 애즈 SSP 정책 준수).
 * - 토스 밖/미지원/광고그룹 미설정이면 렌더 안 함(빈 슬롯·레이아웃 깨짐 방지).
 * - onNoFill/onAdFailedToRender 시 슬롯을 접어요(빈 공간 방지).
 * - 핵심 액션을 덮지 않고, 고정 배너는 하단 내비와 본문 사이의 전용 비상호작용 영역에 배치.
 * - SDK 기본 클릭·노출·'ad' 라벨 변조 금지(variant/theme 프리셋만).
 * 컨테이너 규격: 표준 고정형 96px · 피드 고정형 410px(공식 규격).
 */
export function BannerAd({
  format = 'banner',
  gap = 14,
  placement = 'flow',
  variant = 'card',
}: BannerAdProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ready, attach } = useTossBanner();
  const adGroupId = getBannerAdGroupId(format);
  const [collapsed, setCollapsed] = useState(false);
  const slotHeight = format === 'feed' ? 410 : 96;

  useEffect(() => {
    if (!ready || !adGroupId || !containerRef.current) return;
    const attached = attach(adGroupId, containerRef.current, {
      theme: 'light', // 앱인토스 비게임 미니앱은 라이트 모드 기준으로 출시
      tone: 'blackAndWhite',
      variant,
      callbacks: {
        onNoFill: () => setCollapsed(true),
        onAdFailedToRender: () => setCollapsed(true),
        onAdRendered: () => setCollapsed(false),
      },
    });
    return () => {
      attached?.destroy();
    };
  }, [ready, adGroupId, attach, variant]);

  // 토스 밖이거나 광고를 띄울 수 없는 환경이면 렌더하지 않아요.
  if (!isInToss() || !adGroupId) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden
      style={{
        width: '100%',
        height: collapsed ? 0 : slotHeight,
        margin: collapsed || placement === 'above-nav' ? 0 : `6px 0 ${gap}px`,
        overflow: 'hidden',
        transition: 'height 0.2s ease',
        ...(placement === 'above-nav'
          ? {
              position: 'fixed',
              right: 0,
              bottom: 'calc(64px + env(safe-area-inset-bottom))',
              left: 0,
              zIndex: 49,
            }
          : undefined),
      }}
    />
  );
}
