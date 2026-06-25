// 공유 가로 캐러셀(토스 뷰) — embla 헤드리스 로직(@toonspectrum/core/carousel)을 토스 인라인 스타일/
// 테마 토큰으로 입힌 얇은 뷰. 로직(스냅·관성 드래그·free-scroll·다음 카드 peek·화살표·닷·키보드·aria)은
// 웹과 같은 useCarousel 훅이 단일 출처로 소유한다(NO fork). 토스는 Tailwind 대신 theme.ts 토큰을 쓴다.
import { useCarousel } from '@toonspectrum/core/carousel';
import type { ReactNode } from 'react';

import { theme } from '../theme';

interface CarouselProps {
  children: ReactNode[];
  /** 각 슬라이드(카드) 폭(px). peek 은 이 폭 + gap + 가장자리 패딩으로 자연 생성. */
  itemWidth: number;
  gap?: number;
  ariaLabel?: string;
  /** 트랙 아래 여백(닷 위) — 카드 그림자/포커스 링이 잘리지 않게. */
  paddingBottom?: number;
}

const arrowBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 999,
  border: `1px solid ${theme.border}`,
  background: 'rgba(34,26,19,0.92)',
  color: theme.text,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  fontSize: 15,
  lineHeight: 1,
  position: 'absolute',
  top: '42%',
  transform: 'translateY(-50%)',
  zIndex: 2,
  transition: 'opacity .15s ease',
};

export function Carousel({ children, itemWidth, gap = 12, ariaLabel, paddingBottom = 4 }: CarouselProps) {
  const items = children.filter((child) => child !== null && child !== false && child !== undefined);
  const { emblaRef, selectedIndex, snapCount, canPrev, canNext, scrollPrev, scrollNext, scrollTo, hasPagination, onKeyDown } =
    useCarousel({ active: items.length > 1 });

  return (
    <div
      style={{ position: 'relative' }}
      role="group"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {/* viewport — overflow hidden. embla 가 트랙을 드래그/스냅 제어. */}
      <div ref={emblaRef} style={{ overflow: 'hidden', paddingBottom }}>
        <div style={{ display: 'flex', gap }}>
          {items.map((child, i) => (
            <div
              key={i}
              aria-roledescription="slide"
              style={{ flex: `0 0 ${itemWidth}px`, minWidth: 0 }}
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      {hasPagination && (
        <>
          {/* 데스크톱/와이드 프리뷰용 화살표 — 끝에 닿으면 비활성(opacity 0). 모바일은 드래그가 주 인터랙션. */}
          <button
            type="button"
            aria-label="이전"
            className="pressable"
            disabled={!canPrev}
            onClick={scrollPrev}
            style={{ ...arrowBtn, left: -6, opacity: canPrev ? 1 : 0, pointerEvents: canPrev ? 'auto' : 'none' }}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="다음"
            className="pressable"
            disabled={!canNext}
            onClick={scrollNext}
            style={{ ...arrowBtn, right: -6, opacity: canNext ? 1 : 0, pointerEvents: canNext ? 'auto' : 'none' }}
          >
            ›
          </button>

          {/* 닷 인디케이터 — 스냅(페이지)당 한 점. aria-current 로 현재 위치 표시. */}
          <div
            role="tablist"
            aria-label="페이지"
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 10 }}
          >
            {Array.from({ length: snapCount }).map((_, i) => {
              const on = i === selectedIndex;
              return (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-label={`${i + 1}페이지로 이동`}
                  aria-current={on}
                  aria-selected={on}
                  onClick={() => scrollTo(i)}
                  className="pressable"
                  style={{
                    width: on ? 18 : 6,
                    height: 6,
                    borderRadius: 999,
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    background: on ? theme.accent : 'rgba(255,255,255,0.18)',
                    transition: 'width .2s ease, background .2s ease',
                  }}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
