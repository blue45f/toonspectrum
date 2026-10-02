/**
 * 프로시저럴 패널 아트 생성기.
 *
 * 데모·시드 클립과 이미지 없는 패널을 위해 외부 에셋 없이 SVG 데이터 URL을
 * 만든다. 시드 문자열에서 파생된 팔레트 + 그라데이션 + 기하 도형으로
 * 매번 다른 분위기의 9:16(720x1280) 아트를 생성한다.
 */

/** 시드 문자열을 32비트 해시로 변환 (FNV-1a). */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** 해시 기반 결정적 난수 (mulberry32). */
function seededRandom(hash: number): () => number {
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 분위기별 그라데이션 팔레트. */
const PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ["#1e1b4b", "#6d28d9", "#f0abfc"],
  ["#0c1a2e", "#0e7490", "#67e8f9"],
  ["#2a0a12", "#9f1239", "#fda4af"],
  ["#052e22", "#047857", "#6ee7b7"],
  ["#171717", "#7c2d12", "#fdba74"],
  ["#1c1917", "#57534e", "#e7e5e4"],
  ["#312e81", "#be185d", "#fbcfe8"],
  ["#082f49", "#1d4ed8", "#93c5fd"],
];

function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface PanelArtOptions {
  /** 아트 고유 시드 — 같으면 같은 그림이 나온다. */
  readonly seed: string;
  /** 패널에 크게 새길 짧은 문구 (선택). */
  readonly label?: string;
  readonly width?: number;
  readonly height?: number;
}

/**
 * 9:16 패널 아트를 SVG 데이터 URL로 생성한다.
 * 항상 `data:image/svg+xml` 로 시작하는 URL을 반환한다.
 */
export function buildPanelArt(options: PanelArtOptions): string {
  const { seed, label, width = 720, height = 1280 } = options;
  const random = seededRandom(hashSeed(seed));
  const [deep, mid, accent] = PALETTES[Math.floor(random() * PALETTES.length)];
  const horizon = 0.35 + random() * 0.3;
  const horizonY = Math.round(height * horizon);
  const orbX = Math.round(width * (0.2 + random() * 0.6));
  const orbY = Math.round(height * (0.15 + random() * 0.4));
  const orbR = Math.round(90 + random() * 130);
  const panelX = Math.round(width * 0.08);
  const panelW = Math.round(width * 0.84);
  const panelTilt = (random() - 0.5) * 24;

  // 속도선 — 만화 느낌의 방사형 선
  const rays = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2 + random() * 0.2;
    const x2 = Math.round(orbX + Math.cos(angle) * 560);
    const y2 = Math.round(orbY + Math.sin(angle) * 560);
    const opacity = (0.08 + random() * 0.14).toFixed(2);
    return `<line x1="${orbX}" y1="${orbY}" x2="${x2}" y2="${y2}" stroke="${accent}" stroke-width="3" opacity="${opacity}"/>`;
  }).join("");

  // 전경 실루엣 산/건물
  const ridgePoints = Array.from({ length: 7 }, (_, i) => {
    const x = Math.round((i / 6) * width);
    const y = Math.round(horizonY + random() * height * 0.25);
    return `${x},${y}`;
  }).join(" ");
  const ridge = `<polygon points="0,${height} 0,${horizonY} ${ridgePoints} ${width},${height}" fill="${deep}" opacity="0.85"/>`;

  const labelText = label ? escapeXmlText(label) : "";
  const captionBlock = label
    ? `<text x="${width / 2}" y="${Math.round(height * 0.86)}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="52" fill="#ffffff" opacity="0.92">${labelText}</text>`
    : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/>` +
    `</linearGradient>` +
    `<radialGradient id="orb" cx="0.5" cy="0.5" r="0.5">` +
    `<stop offset="0" stop-color="${accent}" stop-opacity="0.95"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#bg)"/>` +
    `<circle cx="${orbX}" cy="${orbY}" r="${orbR * 2.4}" fill="url(#orb)" opacity="0.55"/>` +
    `<circle cx="${orbX}" cy="${orbY}" r="${orbR}" fill="${accent}" opacity="0.9"/>` +
    rays +
    ridge +
    `<rect x="${panelX}" y="${Math.round(height * 0.52)}" width="${panelW}" height="10" rx="5" fill="${accent}" opacity="0.5" transform="rotate(${panelTilt.toFixed(1)} ${width / 2} ${Math.round(height * 0.52)})"/>` +
    captionBlock +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
