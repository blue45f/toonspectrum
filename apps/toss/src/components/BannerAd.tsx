import { useEffect, useRef, useState } from 'react';

import { type AdFormat, getBannerAdGroupId, useTossBanner } from '../lib/ads';
import { isInToss } from '../lib/toss';

type BannerAdProps = Readonly<{
  /** 배너 광고 배치 위치(광고 타입 아님). banner=표준 가로 배너 · feed=콘솔 '배너(피드형)' 그룹. */
  format?: AdFormat;
  /** 위/아래 여백(px). 인접 콘텐츠와의 간격 조절. */
  gap?: number;
}>;

/**
 * 앱인토스 인앱 배너 광고 슬롯 (토스 애즈 SSP 정책 준수).
 * - 토스 밖/미지원/광고그룹 미설정이면 렌더 안 함(빈 슬롯·레이아웃 깨짐 방지).
 * - onNoFill/onAdFailedToRender 시 슬롯을 접어요(빈 공간 방지).
 * - 첫 화면 진입 직후(ATF)나 핵심 액션 위가 아니라 콘텐츠가 끝나는 자연스러운 지점에 배치.
 * - SDK 기본 클릭·노출·'ad' 라벨 변조 금지(variant/theme 프리셋만).
 * 컨테이너 규격: width 100% · height 96px(고정형).
 */
export function BannerAd({ format = 'banner', gap = 14 }: BannerAdProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ready, attach } = useTossBanner();
  const adGroupId = getBannerAdGroupId(format);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!ready || !adGroupId || !containerRef.current) return;
    const attached = attach(adGroupId, containerRef.current, {
      theme: 'light', // 앱인토스 비게임 미니앱은 라이트 모드 기준으로 출시
      tone: 'blackAndWhite',
      variant: 'card', // 좌우 패딩 + border-radius로 카드 리스트에 자연스럽게
      callbacks: {
        onNoFill: () => setCollapsed(true),
        onAdFailedToRender: () => setCollapsed(true),
        onAdRendered: () => setCollapsed(false),
      },
    });
    return () => {
      attached?.destroy();
    };
  }, [ready, adGroupId, attach]);

  // 토스 밖이거나 광고를 띄울 수 없는 환경이면 렌더하지 않아요.
  if (!isInToss() || !adGroupId) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden
      style={{
        width: '100%',
        height: collapsed ? 0 : 96,
        margin: collapsed ? 0 : `6px 0 ${gap}px`,
        overflow: 'hidden',
        transition: 'height 0.2s ease',
      }}
    />
  );
}
