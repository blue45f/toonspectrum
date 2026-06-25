// 자체 타이포그래픽 커버 — 플랫폼 표지(저작물) 대신 그라디언트 + 패턴 + 제목 타이포로
// 시각적으로 풍부하게. 저작권 안전(색상 + 사실정보인 제목 텍스트만 사용).

import type { CSSProperties } from 'react';

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
  const grad = `linear-gradient(150deg, ${t.cover[0]}, ${t.cover[1]})`;
  const h = hash(t.id);
  const p = PATTERNS[h % PATTERNS.length];
  const text = mode === 'mystery' ? '?' : t.title;
  const fontSize = mode === 'mystery' ? (big ? 72 : 44) : titleFont(t.title.length, big);
  const glowX = h % 2 === 0 ? '-12%' : '70%';

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
      <div style={{ position: 'absolute', top: '-22%', left: glowX, width: '80%', height: '68%', background: 'radial-gradient(circle, rgba(255,255,255,0.24), transparent 68%)' }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.1, backgroundImage: p.image, backgroundSize: p.size }} />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 12 }}>
        <span
          style={{
            fontSize,
            fontWeight: 900,
            color: 'rgba(255,255,255,0.95)',
            textShadow: '0 3px 14px rgba(0,0,0,0.45)',
            textAlign: 'center',
            lineHeight: 1.16,
            wordBreak: 'keep-all',
            letterSpacing: mode === 'mystery' ? 0 : -0.5,
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
