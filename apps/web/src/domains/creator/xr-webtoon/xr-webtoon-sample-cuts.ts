/**
 * XR 웹툰 스튜디오 샘플 컷.
 *
 * 깊이 뷰어·VR 시어터·컷 캡처가 "빈 화면"이 아닌 실제 감상 가능한
 * 콘텐츠로 열리도록, 인라인 SVG 데이터 URL 레이어를 제공한다.
 * 외부 네트워크·에셋 서버 없이 동작하며, 레이어는 투명 배경이라
 * 배경/인물/전경이 서로 다른 깊이 층에서 합성된다.
 */

import type { XrDepthCut, XrDepthLayer } from "./xr-webtoon-depth-model";

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const W = 480;
const H = 640;

function wrap(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
}

/** 배경층: 노을 산맥. depth 0. */
function bgLayer(hue: string, hue2: string): string {
  return svgDataUrl(
    wrap(`
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="${hue2}"/><stop offset="1" stopColor="#0b1026"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#sky)"/>
      <circle cx="360" cy="140" r="52" fill="#fbbf24" opacity="0.85"/>
      <path d="M0 460 L120 260 L240 460 Z" fill="${hue}" opacity="0.75"/>
      <path d="M160 460 L320 220 L480 460 Z" fill="${hue}" opacity="0.55"/>
      <path d="M0 520 L480 520 L480 640 L0 640 Z" fill="#101736"/>
    `),
  );
}

/** 인물층: 실루엣 캐릭터. depth 0.55. */
function characterLayer(accent: string, x: number): string {
  return svgDataUrl(
    wrap(`
      <g transform="translate(${x} 0)">
        <ellipse cx="0" cy="560" rx="90" ry="18" fill="#000" opacity="0.35"/>
        <circle cx="0" cy="300" r="46" fill="${accent}"/>
        <rect x="-34" y="344" width="68" height="150" rx="26" fill="${accent}"/>
        <rect x="-86" y="360" width="30" height="110" rx="15" fill="${accent}" opacity="0.9" transform="rotate(18 -71 415)"/>
        <rect x="56" y="360" width="30" height="110" rx="15" fill="${accent}" opacity="0.9" transform="rotate(-14 71 415)"/>
        <rect x="-26" y="490" width="22" height="70" rx="10" fill="${accent}" opacity="0.9"/>
        <rect x="4" y="490" width="22" height="70" rx="10" fill="${accent}" opacity="0.9"/>
        <path d="M-20 292 q8 8 16 0" stroke="#0b1026" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M4 292 q8 8 16 0" stroke="#0b1026" stroke-width="5" fill="none" stroke-linecap="round" transform="translate(-24 0)"/>
        <path d="M-16 318 q16 14 32 0" stroke="#0b1026" stroke-width="5" fill="none" stroke-linecap="round"/>
      </g>
    `),
  );
}

/** 전경층: 말풍선 + 효과선. depth 1. */
function foregroundLayer(text: string, bx: number): string {
  return svgDataUrl(
    wrap(`
      <g>
        <rect x="${bx}" y="90" width="190" height="86" rx="26" fill="#ffffff" opacity="0.96"/>
        <path d="M${bx + 40} 176 L${bx + 28} 210 L${bx + 70} 176 Z" fill="#ffffff" opacity="0.96"/>
        <text x="${bx + 95}" y="142" text-anchor="middle" font-size="30" font-weight="800" fill="#1e1b4b" font-family="sans-serif">${text}</text>
        <g stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity="0.85">
          <line x1="60" y1="60" x2="110" y2="96"/>
          <line x1="420" y1="70" x2="376" y2="100"/>
        </g>
      </g>
    `),
  );
}

function makeCut(
  id: string,
  title: string,
  sky: [string, string],
  accent: string,
  charX: number,
  bubbleText: string,
  bubbleX: number,
): XrDepthCut {
  const layers: readonly XrDepthLayer[] = [
    { id: `${id}-bg`, depth: 0, imageUrl: bgLayer(sky[0], sky[1]), alt: `${title} 배경` },
    {
      id: `${id}-char`,
      depth: 0.55,
      imageUrl: characterLayer(accent, charX),
      alt: `${title} 인물`,
    },
    {
      id: `${id}-fg`,
      depth: 1,
      imageUrl: foregroundLayer(bubbleText, bubbleX),
      alt: `${title} 말풍선`,
    },
  ];
  return { id, title, layers };
}

/** 샘플 컷 3장. 호스트가 기본값으로 사용한다. */
export const XR_SAMPLE_CUTS: readonly XrDepthCut[] = Object.freeze([
  makeCut("sample-cut-1", "노을 지는 언덕", ["#7c3aed", "#f472b6"], "#8b5cf6", 240, "가자!", 250),
  makeCut("sample-cut-2", "밤바다", ["#0e7490", "#164e63"], "#22d3ee", 170, "저기 봐", 40),
  makeCut("sample-cut-3", "새벽", ["#b45309", "#7c2d12"], "#f472b6", 310, "해 떴다", 250),
]);
