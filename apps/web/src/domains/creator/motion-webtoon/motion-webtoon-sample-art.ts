/**
 * 모션 웹툰 샘플 컷 아트.
 *
 * 히어로 CTA·맛보기 버튼에서 쓰는 샘플 회차의 컷 이미지.
 * 외부 플레이스홀더(picsum) 대신 SVG 데이터 URI로 내장한다:
 * 오프라인에서도 동작하고, 대사 분위기(고백·긴장·축하)와 어울리는
 * 시네마틱 무드를 제공한다.
 */

/** SVG 문자열 → 이미지 URL(data URI). */
function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const SVG_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">`;

/** 1. 고백 — 석양 하늘, 두 실루엣, 벚꽃잎. */
function romanceScene(): string {
  const petals = Array.from({ length: 14 }, (_, i) => {
    const x = 40 + ((i * 173) % 520);
    const y = 60 + ((i * 281) % 640);
    const r = 6 + (i % 3) * 3;
    const rotate = (i * 47) % 360;
    return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.7}" fill="#f9a8d4" opacity="0.75" transform="rotate(${rotate} ${x} ${y})"/>`;
  }).join("");
  return (
    `${SVG_OPEN}` +
    `<defs>` +
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#2b1a5e"/><stop offset="0.55" stop-color="#9d4edd"/><stop offset="1" stop-color="#ff8fab"/>` +
    `</linearGradient>` +
    `<radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">` +
    `<stop offset="0" stop-color="#ffe8a3"/><stop offset="1" stop-color="#ff8fab" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="600" height="800" fill="url(#sky)"/>` +
    `<circle cx="300" cy="470" r="210" fill="url(#sun)"/>` +
    `<circle cx="300" cy="470" r="110" fill="#fff3c4" opacity="0.95"/>` +
    // 언덕
    `<ellipse cx="300" cy="830" rx="420" ry="150" fill="#1e1b4b"/>` +
    // 두 인물 실루엣
    `<g fill="#141126">` +
    `<circle cx="252" cy="560" r="26"/>` +
    `<path d="M226 590 q26 -14 52 0 l8 120 -68 0 Z"/>` +
    `<circle cx="348" cy="560" r="26"/>` +
    `<path d="M322 590 q26 -14 52 0 l8 120 -68 0 Z"/>` +
    `</g>` +
    // 두 사람 사이 하트
    `<path d="M300 520 c-8 -14 -34 -10 -34 8 c0 14 20 24 34 34 c14 -10 34 -20 34 -34 c0 -18 -26 -22 -34 -8 Z" fill="#ff5d8f"/>` +
    petals +
    `<text x="300" y="740" text-anchor="middle" font-size="30" fill="#ffffff" opacity="0.85" font-family="sans-serif">두근거리는 고백의 순간</text>` +
    `</svg>`
  );
}

/** 2. 긴장 — 밤 거리, 스피드선, 달리는 실루엣. */
function tensionScene(): string {
  const speedLines = Array.from({ length: 18 }, (_, i) => {
    const y = 40 + i * 42;
    const w = 120 + ((i * 97) % 220);
    const left = i % 2 === 0;
    const x = left ? 0 : 600 - w;
    return `<rect x="${x}" y="${y}" width="${w}" height="10" rx="5" fill="#38bdf8" opacity="0.28"/>`;
  }).join("");
  return (
    `${SVG_OPEN}` +
    `<defs>` +
    `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#050310"/><stop offset="0.7" stop-color="#0f1035"/><stop offset="1" stop-color="#1b2a6b"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="600" height="800" fill="url(#night)"/>` +
    // 가로등 불빛
    `<ellipse cx="150" cy="700" rx="180" ry="60" fill="#fbbf24" opacity="0.18"/>` +
    `<ellipse cx="450" cy="700" rx="180" ry="60" fill="#38bdf8" opacity="0.18"/>` +
    speedLines +
    // 달리는 실루엣
    `<g fill="#0a0a14" transform="translate(300 480) rotate(-8)">` +
    `<circle cx="0" cy="-60" r="26"/>` +
    `<path d="M-14 -40 L-38 30 L-20 34 L-6 -20 Z"/>` +
    `<path d="M10 -40 L44 22 L26 30 L-2 -22 Z"/>` +
    `<path d="M-12 -34 L-70 -10 L-64 4 L-8 -18 Z"/>` +
    `<path d="M12 -34 L66 -44 L70 -30 L16 -18 Z"/>` +
    `</g>` +
    // 그림자
    `<ellipse cx="300" cy="640" rx="90" ry="18" fill="#000" opacity="0.5"/>` +
    // 번개
    `<path d="M430 60 L390 200 L420 200 L370 330 L450 170 L415 170 Z" fill="#fef08a" opacity="0.9"/>` +
    `<text x="300" y="740" text-anchor="middle" font-size="30" fill="#fef08a" opacity="0.9" font-family="sans-serif">뒤에 뭔가 있다!</text>` +
    `</svg>`
  );
}

/** 3. 축하 — 아침 하늘, 무지개, 만세 실루엣, 색종이. */
function joyScene(): string {
  const confetti = Array.from({ length: 26 }, (_, i) => {
    const x = 30 + ((i * 211) % 540);
    const y = 40 + ((i * 337) % 560);
    const rotate = (i * 61) % 360;
    const colors = ["#f472b6", "#a78bfa", "#38bdf8", "#fbbf24", "#34d399"];
    const color = colors[i % colors.length];
    return `<rect x="${x}" y="${y}" width="14" height="9" rx="2" fill="${color}" opacity="0.9" transform="rotate(${rotate} ${x} ${y})"/>`;
  }).join("");
  return (
    `${SVG_OPEN}` +
    `<defs>` +
    `<linearGradient id="morning" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#38bdf8"/><stop offset="0.6" stop-color="#a5d8ff"/><stop offset="1" stop-color="#fef9c3"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="600" height="800" fill="url(#morning)"/>` +
    // 태양 광선
    `<g opacity="0.5">` +
    Array.from({ length: 12 }, (_, i) => {
      const angle = (i * 30 * Math.PI) / 180;
      const x2 = 300 + Math.cos(angle) * 320;
      const y2 = 240 + Math.sin(angle) * 320;
      return `<line x1="300" y1="240" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="#fff" stroke-width="10" opacity="0.35"/>`;
    }).join("") +
    `</g>` +
    `<circle cx="300" cy="240" r="80" fill="#fff7d6"/>` +
    `<circle cx="300" cy="240" r="64" fill="#ffdf5d"/>` +
    // 무지개
    `<g fill="none" stroke-width="26" opacity="0.55">` +
    `<path d="M60 620 A240 240 0 0 1 540 620" stroke="#f87171"/>` +
    `<path d="M86 620 A214 214 0 0 1 514 620" stroke="#fb923c"/>` +
    `<path d="M112 620 A188 188 0 0 1 488 620" stroke="#facc15"/>` +
    `<path d="M138 620 A162 162 0 0 1 462 620" stroke="#4ade80"/>` +
    `<path d="M164 620 A136 136 0 0 1 436 620" stroke="#38bdf8"/>` +
    `</g>` +
    // 만세 실루엣 2명
    `<g fill="#172554">` +
    `<circle cx="230" cy="600" r="26"/>` +
    `<path d="M204 628 q26 -12 52 0 l6 100 -64 0 Z"/>` +
    `<path d="M204 636 L160 590" stroke="#172554" stroke-width="16" stroke-linecap="round"/>` +
    `<path d="M256 636 L300 590" stroke="#172554" stroke-width="16" stroke-linecap="round"/>` +
    `<circle cx="380" cy="610" r="24"/>` +
    `<path d="M356 636 q24 -12 48 0 l6 96 -60 0 Z"/>` +
    `<path d="M356 644 L314 600" stroke="#172554" stroke-width="15" stroke-linecap="round"/>` +
    `<path d="M404 644 L446 600" stroke="#172554" stroke-width="15" stroke-linecap="round"/>` +
    `</g>` +
    `<ellipse cx="300" cy="760" rx="400" ry="90" fill="#bbf7d0" opacity="0.7"/>` +
    confetti +
    `<text x="300" y="120" text-anchor="middle" font-size="34" fill="#172554" font-weight="bold" font-family="sans-serif">우리가 해냈어!</text>` +
    `</svg>`
  );
}

/** 샘플 회차의 컷 이미지 3종 — 대사 분위기와 매칭. */
export const SAMPLE_CUT_IMAGE_URIS: readonly string[] = [
  svgDataUri(romanceScene()),
  svgDataUri(tensionScene()),
  svgDataUri(joyScene()),
];

/** 인덱스에 맞는 샘플 컷 이미지 (순환). */
export function sampleCutImageUri(index: number): string {
  const normalized = ((index % SAMPLE_CUT_IMAGE_URIS.length) + SAMPLE_CUT_IMAGE_URIS.length) % SAMPLE_CUT_IMAGE_URIS.length;
  return SAMPLE_CUT_IMAGE_URIS[normalized];
}
