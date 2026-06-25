// 게임 커버 — 표지 썸네일(프록시·킬스위치 적용)을 우선 노출하되, 미노출/차단/실패 시
// 자체 타이포그래픽 커버(그라디언트 + 패턴 + 글로우 + 제목 타이포)로 폴백한다.
// → 표지 정책 off(COVER_IMAGE_POLICY=off)면 프록시가 막혀 자동으로 타이포만 남는다.

import { useState, type CSSProperties } from 'react';

import type { GameTitle } from './types';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const PATTERNS = [
  { image: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 13px)', size: 'auto' },
  { image: 'radial-gradient(rgba(255,255,255,0.7) 1.1px, transparent 1.4px)', size: '14px 14px' },
  { image: 'repeating-linear-gradient(-30deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 16px)', size: 'auto' },
  { image: 'radial-gradient(rgba(255,255,255,0.6) 1.3px, transparent 1.5px)', size: '20px 20px' },
];

function titleFont(len: number, big: boolean): number {
  if (len <= 3) return big ? 38 : 26;
  if (len <= 6) return big ? 30 : 20;
  if (len <= 10) return big ? 24 : 16;
  return big ? 19 : 13;
}

export function GameCover({
  t,
  aspect = '3 / 4',
  radius = 16,
  mode = 'title',
  big = false,
  style,
}: {
  t: GameTitle;
  aspect?: string;
  radius?: number;
  mode?: 'title' | 'mystery';
  big?: boolean;
  style?: CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  const mystery = mode === 'mystery';
  const grad = `linear-gradient(150deg, ${t.cover[0]}, ${t.cover[1]})`;
  const h = hash(t.id);
  const p = PATTERNS[h % PATTERNS.length];
  const glowX = h % 2 === 0 ? '-12%' : '70%';
  const showImg = !!t.coverImage && !broken;

  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: aspect,
        borderRadius: radius,
        overflow: 'hidden',
        background: grad,
        boxShadow: '0 8px 22px rgba(0,0,0,0.38)',
        ...style,
      }}
    >
      {/* 타이포 베이스(폴백) */}
      <div style={{ position: 'absolute', top: '-22%', left: glowX, width: '80%', height: '68%', background: 'radial-gradient(circle, rgba(255,255,255,0.24), transparent 68%)' }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.1, backgroundImage: p.image, backgroundSize: p.size }} />
      {!mystery && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 12 }}>
          <span
            style={{
              fontSize: titleFont(t.title.length, big),
              fontWeight: 900,
              color: 'rgba(255,255,255,0.95)',
              textShadow: '0 3px 14px rgba(0,0,0,0.45)',
              textAlign: 'center',
              lineHeight: 1.16,
              wordBreak: 'keep-all',
              letterSpacing: -0.5,
            }}
          >
            {t.title}
          </span>
        </div>
      )}

      {/* 표지 썸네일(있으면 위에 덮음; 퀴즈는 블러) */}
      {showImg && (
        <img
          src={t.coverImage}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: mystery ? 'blur(9px) brightness(0.8)' : 'none',
            transform: mystery ? 'scale(1.18)' : 'none',
          }}
        />
      )}

      {/* 미스터리(퀴즈) 마커 */}
      {mystery && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: big ? 72 : 44, fontWeight: 900, color: 'rgba(255,255,255,0.92)', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>
          ?
        </div>
      )}
    </div>
  );
}
