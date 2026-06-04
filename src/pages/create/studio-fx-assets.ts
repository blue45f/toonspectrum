// 만화 효과(FX) 오버레이 라이브러리 — 패널 위에 "투명 이미지"로 드롭하는 망가식 연출 효과.
// 모두 순수 자체 벡터 SVG(외부 ref/래스터/이모지 아트 없음). 투명 배경, 적절한 곳에 굵은 잉크 라인(#16100c).
// 각 svg는 자체 완결형 standalone 문자열: <svg xmlns ... viewBox="0 0 W H"> ... </svg>

export interface FxOverlay {
  id: string;
  label: string;
  svg: string;
  width: number;
  height: number;
}

export interface ComicVectorSticker {
  id: string;
  label: string;
  svg: string;
  width: number;
  height: number;
}

const INK = "#16100c"; // 굵은 잉크 라인 색

// 내부 유틸: 자체 완결형 svg 문자열 래퍼.
function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

// ──────────────────────────────────────────────────────────────────────────
// 1) 집중선 — 중심으로 모이는 방사형 잉크 쐐기(가운데는 비워 시선 집중).
// ──────────────────────────────────────────────────────────────────────────
function radialFocus(): string {
  const W = 480;
  const H = 480;
  const cx = W / 2;
  const cy = H / 2;
  const rIn = 92; // 가운데 빈 원 반지름
  const rOut = 340;
  const count = 56;
  const wedges: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    // 두께를 살짝 들쭉날쭉하게(손맛).
    const tw = 0.018 + ((i % 3) === 0 ? 0.016 : (i % 2 === 0 ? 0.009 : 0.004));
    const oR = rOut + ((i % 4) - 1.5) * 14;
    const x0 = cx + Math.cos(a - tw) * rIn;
    const y0 = cy + Math.sin(a - tw) * rIn;
    const x1 = cx + Math.cos(a + tw) * rIn;
    const y1 = cy + Math.sin(a + tw) * rIn;
    const x2 = cx + Math.cos(a) * oR;
    const y2 = cy + Math.sin(a) * oR;
    wedges.push(
      `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} L${x1.toFixed(1)} ${y1.toFixed(1)} Z" fill="${INK}"/>`,
    );
  }
  return svg(W, H, wedges.join(""));
}

// ──────────────────────────────────────────────────────────────────────────
// 2) 속도선 — 가로 방향 스피드 라인(좌우로 흐르는 잉크 줄).
// ──────────────────────────────────────────────────────────────────────────
function speedLines(): string {
  const W = 480;
  const H = 200;
  const rows = 22;
  const lines: string[] = [];
  for (let i = 0; i < rows; i++) {
    const y = ((i + 0.5) / rows) * H;
    const thick = 1 + ((i * 7) % 5) * 0.9;
    // 좌측은 가늘게 시작해 우측으로 끝나는, 길이가 다른 줄.
    const x1 = ((i * 53) % 140);
    const x2 = W - ((i * 31) % 90);
    lines.push(
      `<line x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${INK}" stroke-width="${thick.toFixed(1)}" stroke-linecap="round"/>`,
    );
  }
  return svg(W, H, lines.join(""));
}

// ──────────────────────────────────────────────────────────────────────────
// 3) 임팩트 플래시 — 별폭발(starburst) 충격 폭. 뾰족한 다각형 외곽.
// ──────────────────────────────────────────────────────────────────────────
function impactFlash(): string {
  const W = 460;
  const H = 460;
  const cx = W / 2;
  const cy = H / 2;
  const spikes = 18;
  const rOut = 220;
  const rIn = 118;
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    // 뾰족함을 들쭉날쭉하게.
    const r = i % 2 === 0 ? rOut + ((i % 4) - 1.5) * 18 : rIn - ((i % 3) - 1) * 14;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  // 안쪽 작은 별(밝은 중심 강조용 빈 폴리곤).
  const inner: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 96 : 44;
    inner.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return svg(
    W,
    H,
    `<polygon points="${pts.join(" ")}" fill="${INK}"/>` +
      `<polygon points="${inner.join(" ")}" fill="#ffffff"/>`,
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 4) 충격 번개 — 갈라지는 번개 크랙(굵은 지그재그 + 잔가지).
// ──────────────────────────────────────────────────────────────────────────
function lightningCrack(): string {
  const W = 320;
  const H = 460;
  // 메인 줄기(채워진 두꺼운 번개 보디).
  const main =
    `<path d="M168 8 L120 168 L176 168 L96 320 L150 300 L70 452 L208 232 L150 232 L214 96 L162 116 Z" ` +
    `fill="${INK}"/>`;
  // 잔가지(가는 stroke 번개).
  const fork1 = `<path d="M176 168 L236 214 L210 224 L262 268" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>`;
  const fork2 = `<path d="M96 320 L52 352 L78 360 L40 404" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`;
  return svg(W, H, main + fork1 + fork2);
}

// ──────────────────────────────────────────────────────────────────────────
// 5) 스크린톤 도트 — 하프톤 도트 필드(균일 격자 점). 패널 음영/배경 톤.
// ──────────────────────────────────────────────────────────────────────────
function halftoneDots(): string {
  const W = 360;
  const H = 360;
  const step = 22;
  const r = 5.2;
  const dots: string[] = [];
  for (let yy = step / 2; yy < H; yy += step) {
    const odd = Math.round((yy - step / 2) / step) % 2 === 1;
    for (let xx = step / 2 + (odd ? step / 2 : 0); xx < W; xx += step) {
      dots.push(`<circle cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" r="${r}" fill="${INK}"/>`);
    }
  }
  return svg(W, H, dots.join(""));
}

// ──────────────────────────────────────────────────────────────────────────
// 6) 비네팅 — 가장자리만 어두워지는 부드러운 비네트(라디얼 그라디언트 마스크).
// ──────────────────────────────────────────────────────────────────────────
function vignette(): string {
  const W = 480;
  const H = 480;
  // 가운데는 투명, 가장자리로 갈수록 잉크가 진해지는 라디얼.
  const grad =
    `<defs><radialGradient id="vgr" cx="50%" cy="50%" r="62%">` +
    `<stop offset="0%" stop-color="${INK}" stop-opacity="0"/>` +
    `<stop offset="58%" stop-color="${INK}" stop-opacity="0"/>` +
    `<stop offset="84%" stop-color="${INK}" stop-opacity="0.45"/>` +
    `<stop offset="100%" stop-color="${INK}" stop-opacity="0.92"/>` +
    `</radialGradient></defs>`;
  return svg(W, H, `${grad}<rect x="0" y="0" width="${W}" height="${H}" fill="url(#vgr)"/>`);
}

// ──────────────────────────────────────────────────────────────────────────
// 7) 큰 땀방울 — 단일 대형 만화식 땀방울(외곽선 + 하이라이트).
// ──────────────────────────────────────────────────────────────────────────
function bigSweatDrop(): string {
  const W = 240;
  const H = 320;
  // 위는 뾰족, 아래는 둥근 물방울.
  const body =
    `<path d="M120 24 C148 96 206 150 206 214 C206 274 168 308 120 308 ` +
    `C72 308 34 274 34 214 C34 150 92 96 120 24 Z" fill="#bfe9ff" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>`;
  // 하이라이트(왼쪽 위 흰 반점).
  const hi = `<ellipse cx="86" cy="206" rx="20" ry="34" fill="#ffffff" opacity="0.9"/>`;
  return svg(W, H, body + hi);
}

// ──────────────────────────────────────────────────────────────────────────
// 8) 분노 마크 — 💢 모양 벡터(교차하는 핏대 마크).
// ──────────────────────────────────────────────────────────────────────────
function angerMark(): string {
  const W = 260;
  const H = 260;
  const cx = W / 2;
  const cy = H / 2;
  // 4방향으로 뻗는 둥근 모서리 ㄱ자형 핏대 묶음.
  // 각 가지: 안쪽에서 바깥으로 굵게 꺾이는 path.
  const arm = (rot: number) =>
    `<g transform="rotate(${rot} ${cx} ${cy})">` +
    `<path d="M130 70 L130 36 L96 36" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M130 78 L168 40" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>` +
    `</g>`;
  const arms = [0, 90, 180, 270].map(arm).join("");
  // 가운데 작은 핏대 마름모.
  const core = `<path d="M130 104 L156 130 L130 156 L104 130 Z" fill="none" stroke="${INK}" stroke-width="14" stroke-linejoin="round"/>`;
  return svg(W, H, arms + core);
}

// ──────────────────────────────────────────────────────────────────────────
// 9) 하트 뿜뿜 — 크고 작은 하트가 위로 솟는 클러스터.
// ──────────────────────────────────────────────────────────────────────────
function heartBurst(): string {
  const W = 320;
  const H = 360;
  const heart = (x: number, y: number, s: number, fill: string) => {
    // 단위 하트(약 32×30)를 s배 스케일.
    return (
      `<g transform="translate(${x} ${y}) scale(${s})">` +
      `<path d="M16 28 C16 28 0 16 0 8 C0 2 4 0 8 0 C12 0 16 4 16 8 C16 4 20 0 24 0 C28 0 32 2 32 8 C32 16 16 28 16 28 Z" ` +
      `fill="${fill}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/></g>`
    );
  };
  const parts = [
    heart(120, 180, 3.4, "#ff6f91"),
    heart(40, 240, 1.9, "#ff97ad"),
    heart(220, 210, 2.2, "#ff8aa3"),
    heart(70, 90, 1.5, "#ffb3c4"),
    heart(200, 70, 1.8, "#ff7d9c"),
    heart(150, 20, 1.1, "#ffc2d0"),
  ].join("");
  return svg(W, H, parts);
}

// ──────────────────────────────────────────────────────────────────────────
// 10) 물음표 마크 — 말풍선 없는 큰 ? (당황/의문).
// ──────────────────────────────────────────────────────────────────────────
function questionMark(): string {
  const W = 200;
  const H = 280;
  // 곡선 갈고리 + 점. 굵은 잉크 stroke.
  const hook =
    `<path d="M44 78 C44 30 92 18 120 18 C158 18 178 44 178 76 C178 116 122 122 120 162 L120 184" ` +
    `fill="none" stroke="${INK}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>`;
  const dot = `<circle cx="120" cy="244" r="20" fill="${INK}"/>`;
  return svg(W, H, hook + dot);
}

// ──────────────────────────────────────────────────────────────────────────
// 11) 느낌표 마크 — 말풍선 없는 큰 ! (놀람/충격).
// ──────────────────────────────────────────────────────────────────────────
function exclaimMark(): string {
  const W = 140;
  const H = 280;
  const cx = W / 2;
  // 위가 굵고 아래로 가늘어지는 막대 + 점.
  const bar =
    `<path d="M${cx - 22} 24 L${cx + 22} 24 L${cx + 12} 188 L${cx - 12} 188 Z" ` +
    `fill="${INK}"/>`;
  const dot = `<circle cx="${cx}" cy="240" r="22" fill="${INK}"/>`;
  return svg(W, H, bar + dot);
}

// ──────────────────────────────────────────────────────────────────────────
// 12) 반짝임 클러스터 — 4갈래 스파클 별 무리(키라키라).
// ──────────────────────────────────────────────────────────────────────────
function sparkleCluster(): string {
  const W = 360;
  const H = 360;
  // 4갈래 별(오목한 마름모) 단위.
  const star = (x: number, y: number, s: number, fill: string) => {
    const r = 30 * s; // 바깥
    const w = 7 * s; // 오목 폭
    const pts = [
      `${x},${y - r}`,
      `${x + w},${y - w}`,
      `${x + r},${y}`,
      `${x + w},${y + w}`,
      `${x},${y + r}`,
      `${x - w},${y + w}`,
      `${x - r},${y}`,
      `${x - w},${y - w}`,
    ].join(" ");
    return `<polygon points="${pts}" fill="${fill}" stroke="${INK}" stroke-width="${(2 * s).toFixed(1)}" stroke-linejoin="round"/>`;
  };
  const parts = [
    star(180, 150, 1.5, "#fff4b8"),
    star(86, 96, 0.85, "#ffffff"),
    star(268, 110, 1.05, "#ffe680"),
    star(120, 250, 0.7, "#ffffff"),
    star(252, 244, 0.95, "#fff0a0"),
    star(308, 188, 0.5, "#ffffff"),
  ].join("");
  return svg(W, H, parts);
}

// ──────────────────────────────────────────────────────────────────────────
// 13) 우울 세로줄 — 머리 위에서 떨어지는 수직 침울 라인(그림자 톤).
// ──────────────────────────────────────────────────────────────────────────
function gloomLines(): string {
  const W = 320;
  const H = 280;
  const cols = 16;
  const lines: string[] = [];
  for (let i = 0; i < cols; i++) {
    const x = ((i + 0.5) / cols) * W;
    const thick = 2 + ((i * 5) % 4) * 1.1;
    // 위에서 시작, 길이가 들쭉날쭉(끝이 다른).
    const y2 = H - ((i * 37) % 70);
    lines.push(
      `<line x1="${x.toFixed(1)}" y1="6" x2="${x.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-width="${thick.toFixed(1)}" stroke-linecap="round" opacity="0.82"/>`,
    );
  }
  return svg(W, H, lines.join(""));
}

// ──────────────────────────────────────────────────────────────────────────
// 14) 당황 식은땀 — 작은 식은땀 방울 여러 개(머리 옆 흩뿌림).
// ──────────────────────────────────────────────────────────────────────────
function nervousSweat(): string {
  const W = 320;
  const H = 240;
  const drop = (x: number, y: number, s: number) =>
    `<g transform="translate(${x} ${y}) scale(${s})">` +
    `<path d="M0 -26 C9 -8 22 4 22 18 C22 32 12 40 0 40 C-12 40 -22 32 -22 18 C-22 4 -9 -8 0 -26 Z" ` +
    `fill="#cfeeff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
    `<ellipse cx="-7" cy="16" rx="5" ry="8" fill="#ffffff" opacity="0.9"/></g>`;
  const parts = [
    drop(70, 90, 1.5),
    drop(176, 60, 1.1),
    drop(248, 120, 1.3),
    drop(128, 170, 0.85),
    drop(214, 190, 0.7),
  ].join("");
  return svg(W, H, parts);
}

// ──────────────────────────────────────────────────────────────────────────
// 15) 집중 강조선(speed-radial) — 방사형 + 속도감을 섞은, 중심에서 사방으로
//      가늘게 뻗는 강조선(가운데는 살짝 비움). 집중선보다 가볍고 날카로움.
// ──────────────────────────────────────────────────────────────────────────
function speedRadial(): string {
  const W = 480;
  const H = 480;
  const cx = W / 2;
  const cy = H / 2;
  const rIn = 64;
  const rOut = 350;
  const count = 88;
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const oR = rOut + ((i % 5) - 2) * 16;
    const tw = 1.1 + ((i % 3) === 0 ? 2.0 : 0.4); // 가는 라인, 가끔 굵게
    const x1 = cx + Math.cos(a) * rIn;
    const y1 = cy + Math.sin(a) * rIn;
    const x2 = cx + Math.cos(a) * oR;
    const y2 = cy + Math.sin(a) * oR;
    lines.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-width="${tw.toFixed(1)}" stroke-linecap="round"/>`,
    );
  }
  return svg(W, H, lines.join(""));
}

// ──────────────────────────────────────────────────────────────────────────
// 16) 졸음/잠 — zzz 만화 졸음 표식(말풍선 없이 떠오르는 Z 삼총사).
// ──────────────────────────────────────────────────────────────────────────
function sleepyZ(): string {
  const W = 260;
  const H = 280;
  const zChar = (x: number, y: number, s: number) => {
    // Z자 외곽(상단 가로, 대각선, 하단 가로)을 굵은 stroke로.
    const top = `M${x} ${y} L${x + 60 * s} ${y}`;
    const diag = `L${x} ${y + 64 * s}`;
    const bottom = `L${x + 60 * s} ${y + 64 * s}`;
    return `<path d="${top} ${diag} ${bottom}" fill="none" stroke="${INK}" stroke-width="${(11 * s).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  };
  const parts = [zChar(150, 184, 0.7), zChar(96, 100, 1.05), zChar(20, 0, 1.45)].join("");
  return svg(W, H, parts);
}

// ──────────────────────────────────────────────────────────────────────────
// 17) 음표 — 흥얼거림/노래 만화 음표 무리(♪♫).
// ──────────────────────────────────────────────────────────────────────────
function musicNotes(): string {
  const W = 300;
  const H = 280;
  // 8분음표 단위: 머리(타원) + 기둥 + 깃발.
  const eighth = (x: number, y: number, s: number, rot: number) =>
    `<g transform="translate(${x} ${y}) scale(${s}) rotate(${rot})">` +
    `<ellipse cx="0" cy="58" rx="18" ry="13" fill="${INK}" transform="rotate(-20 0 58)"/>` +
    `<path d="M16 56 L16 0" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="M16 0 C42 6 44 28 36 40" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/></g>`;
  // 연음표(두 머리 + 빔).
  const beamed = (x: number, y: number, s: number) =>
    `<g transform="translate(${x} ${y}) scale(${s})">` +
    `<ellipse cx="0" cy="60" rx="17" ry="12" fill="${INK}" transform="rotate(-20 0 60)"/>` +
    `<ellipse cx="64" cy="60" rx="17" ry="12" fill="${INK}" transform="rotate(-20 64 60)"/>` +
    `<path d="M15 58 L15 4" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="M79 58 L79 4" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="M11 4 L83 12" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/></g>`;
  const parts = [eighth(48, 150, 1.25, -8), beamed(150, 40, 1.0), eighth(110, 200, 0.8, 6)].join("");
  return svg(W, H, parts);
}

// ──────────────────────────────────────────────────────────────────────────
// 18) 화염 — 타오르는 불꽃 실루엣(분노/열정 강조).
// ──────────────────────────────────────────────────────────────────────────
function flameBurst(): string {
  const W = 280;
  const H = 360;
  // 바깥 큰 불꽃(채움) + 안쪽 작은 불꽃(밝은 코어).
  const outer =
    `<path d="M140 14 C176 86 214 120 214 200 C214 286 178 340 140 340 ` +
    `C102 340 66 286 66 200 C66 156 92 132 102 96 C118 132 110 168 132 184 ` +
    `C150 156 126 96 140 14 Z" fill="#ff7a2e" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
  const inner =
    `<path d="M140 132 C160 172 178 198 178 240 C178 290 160 318 140 318 ` +
    `C120 318 102 290 102 240 C102 206 122 184 140 132 Z" fill="#ffd24a"/>`;
  return svg(W, H, outer + inner);
}

// ──────────────────────────────────────────────────────────────────────────
// 만화 벡터 스티커 — 작게 붙여 쓰는 아이콘형 감정/상태 스티커.
// ──────────────────────────────────────────────────────────────────────────
function stickerSweatDrops(): string {
  const W = 240;
  const H = 220;
  const drop = (x: number, y: number, s: number, rot: number) =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">` +
    `<path d="M0 -52 C18 -20 42 -2 42 28 C42 58 22 78 0 78 C-22 78 -42 58 -42 28 C-42 -2 -18 -20 0 -52 Z" fill="#9fe4ff" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>` +
    `<ellipse cx="-14" cy="24" rx="8" ry="15" fill="#fff8ef" opacity="0.92"/></g>`;
  return svg(W, H, drop(76, 88, 0.78, -12) + drop(152, 108, 1.0, 10) + drop(105, 156, 0.55, -4));
}

function stickerAngerPop(): string {
  const W = 240;
  const H = 240;
  const arm = (rot: number) =>
    `<g transform="rotate(${rot} 120 120)">` +
    `<path d="M120 70 L120 34 L84 34" fill="none" stroke="${INK}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M120 70 L120 34 L84 34" fill="none" stroke="#ff5147" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M132 78 L170 40" fill="none" stroke="${INK}" stroke-width="18" stroke-linecap="round"/>` +
    `<path d="M132 78 L170 40" fill="none" stroke="#ff5147" stroke-width="10" stroke-linecap="round"/></g>`;
  return svg(W, H, [0, 90, 180, 270].map(arm).join("") + `<path d="M120 94 L146 120 L120 146 L94 120 Z" fill="#fff0a8" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`);
}

function stickerHeart(): string {
  const W = 240;
  const H = 220;
  const heart =
    `<path d="M120 196 C120 196 30 132 30 72 C30 34 54 20 82 20 C104 20 118 36 120 56 C122 36 136 20 158 20 C186 20 210 34 210 72 C210 132 120 196 120 196 Z" fill="#ff6f91" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>`;
  const hi = `<path d="M70 56 C82 42 100 42 108 58" fill="none" stroke="#fff8ef" stroke-width="9" stroke-linecap="round"/>`;
  return svg(W, H, heart + hi);
}

function stickerStar(): string {
  const W = 240;
  const H = 240;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 98 : 43;
    pts.push(`${(120 + Math.cos(a) * r).toFixed(1)},${(122 + Math.sin(a) * r).toFixed(1)}`);
  }
  return svg(
    W,
    H,
    `<polygon points="${pts.join(" ")}" fill="#ffd84d" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>` +
      `<path d="M84 70 L106 92" stroke="#fff8ef" stroke-width="9" stroke-linecap="round"/>`,
  );
}

function stickerMusicNotes(): string {
  const W = 260;
  const H = 240;
  const note = (x: number, y: number, s: number, color: string, rot: number) =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">` +
    `<ellipse cx="0" cy="78" rx="23" ry="16" fill="${color}" stroke="${INK}" stroke-width="7" transform="rotate(-18 0 78)"/>` +
    `<path d="M20 75 L20 0" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>` +
    `<path d="M20 0 C58 8 64 38 48 58" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/></g>`;
  return svg(W, H, note(76, 64, 0.92, "#74d7ff", -8) + note(174, 36, 0.72, "#ff8ac8", 7) + `<path d="M126 84 L186 96" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>`);
}

function stickerIdeaBulb(): string {
  const W = 240;
  const H = 260;
  const rays = [0, 45, 90, 135, 180].map((rot) => `<path d="M120 24 L120 4" transform="rotate(${rot} 120 110)" stroke="#ffd84d" stroke-width="9" stroke-linecap="round"/>`).join("");
  const bulb =
    `<path d="M76 106 C76 64 100 42 120 42 C140 42 164 64 164 106 C164 130 150 144 140 158 L100 158 C90 144 76 130 76 106 Z" fill="#fff2a8" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>` +
    `<path d="M100 160 L140 160 L136 190 L104 190 Z" fill="#b7c1cc" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>` +
    `<path d="M102 174 L138 174" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M108 96 C116 84 126 84 134 96" fill="none" stroke="#fff8ef" stroke-width="8" stroke-linecap="round"/>`;
  return svg(W, H, rays + bulb);
}

function stickerQuestionPop(): string {
  const W = 210;
  const H = 260;
  const hook =
    `<path d="M52 76 C52 34 90 20 118 20 C154 20 176 42 176 74 C176 114 122 116 120 154 L120 174" fill="none" stroke="${INK}" stroke-width="31" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M52 76 C52 34 90 20 118 20 C154 20 176 42 176 74 C176 114 122 116 120 154 L120 174" fill="none" stroke="#7fd8ff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`;
  return svg(W, H, hook + `<circle cx="120" cy="224" r="22" fill="${INK}"/><circle cx="120" cy="224" r="12" fill="#7fd8ff"/>`);
}

function stickerExclaimPop(): string {
  const W = 170;
  const H = 260;
  return svg(
    W,
    H,
    `<path d="M60 22 L112 22 L100 172 L72 172 Z" fill="${INK}"/>` +
      `<path d="M74 34 L99 34 L92 158 L79 158 Z" fill="#ff5d4d"/>` +
      `<circle cx="86" cy="218" r="27" fill="${INK}"/><circle cx="86" cy="218" r="16" fill="#ff5d4d"/>`,
  );
}

function stickerShockLines(): string {
  const W = 280;
  const H = 220;
  const rays = [
    "M28 110 L108 110",
    "M42 42 L116 88",
    "M42 178 L116 132",
    "M252 110 L172 110",
    "M238 42 L164 88",
    "M238 178 L164 132",
  ]
    .map((d) => `<path d="${d}" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>`)
    .join("");
  return svg(W, H, rays + `<path d="M140 60 L166 110 L140 160 L114 110 Z" fill="#fff8ef" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`);
}

function stickerSleepyZzz(): string {
  const W = 260;
  const H = 240;
  const z = (x: number, y: number, s: number) =>
    `<path d="M${x} ${y} L${x + 58 * s} ${y} L${x} ${y + 58 * s} L${x + 58 * s} ${y + 58 * s}" fill="none" stroke="${INK}" stroke-width="${(12 * s).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const bubbles = `<circle cx="58" cy="178" r="13" fill="#d8f4ff" stroke="${INK}" stroke-width="5"/><circle cx="94" cy="202" r="8" fill="#d8f4ff" stroke="${INK}" stroke-width="4"/>`;
  return svg(W, H, bubbles + z(38, 78, 1.35) + z(142, 50, 0.95) + z(188, 122, 0.68));
}

function stickerTwinkle(): string {
  const W = 240;
  const H = 240;
  const star = (x: number, y: number, r: number, color: string) => {
    const w = r * 0.22;
    const pts = `${x},${y - r} ${x + w},${y - w} ${x + r},${y} ${x + w},${y + w} ${x},${y + r} ${x - w},${y + w} ${x - r},${y} ${x - w},${y - w}`;
    return `<polygon points="${pts}" fill="${color}" stroke="${INK}" stroke-width="${Math.max(4, r * 0.11)}" stroke-linejoin="round"/>`;
  };
  return svg(W, H, star(124, 104, 58, "#fff2a8") + star(62, 64, 28, "#fff8ef") + star(184, 64, 34, "#ffd84d") + star(178, 170, 24, "#fff8ef"));
}

function stickerAngryVein(): string {
  const W = 240;
  const H = 220;
  const vein =
    `<path d="M52 126 C86 98 84 64 118 56 C138 52 150 66 142 84 C166 72 190 78 198 100 C206 122 188 138 164 134 C174 158 164 182 140 188 C112 194 104 166 114 144 C88 154 62 150 52 126 Z" fill="#ff6b5d" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>` +
    `<path d="M82 124 C110 118 124 100 120 72 M126 118 C148 100 164 98 188 104 M122 130 C118 154 126 170 142 180" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`;
  return svg(W, H, vein);
}

function stickerEmbarrassedSweat(): string {
  const W = 260;
  const H = 220;
  const marks =
    `<path d="M54 64 L90 46 M42 112 L84 112 M58 158 L94 176" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M150 48 C166 82 196 100 196 134 C196 170 176 194 150 194 C124 194 104 170 104 134 C104 100 134 82 150 48 Z" fill="#aeeaff" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>` +
    `<ellipse cx="132" cy="134" rx="10" ry="17" fill="#fff8ef" opacity="0.9"/>` +
    `<path d="M206 62 L224 42 M216 98 L244 92" stroke="#ff8aa3" stroke-width="8" stroke-linecap="round"/>`;
  return svg(W, H, marks);
}

function stickerFocusMark(): string {
  const W = 260;
  const H = 260;
  const corners = [
    "M70 34 L34 34 L34 70",
    "M190 34 L226 34 L226 70",
    "M34 190 L34 226 L70 226",
    "M226 190 L226 226 L190 226",
  ].map((d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  const rays = [0, 60, 120, 180, 240, 300].map((rot) => `<path d="M130 62 L130 26" transform="rotate(${rot} 130 130)" stroke="#ffcf3d" stroke-width="7" stroke-linecap="round"/>`).join("");
  return svg(W, H, rays + corners + `<circle cx="130" cy="130" r="30" fill="none" stroke="${INK}" stroke-width="8"/><circle cx="130" cy="130" r="7" fill="${INK}"/>`);
}

export const COMIC_VECTOR_STICKERS: ComicVectorSticker[] = [
  { id: "sweat-beads", label: "땀방울", svg: stickerSweatDrops(), width: 240, height: 220 },
  { id: "anger-pop", label: "분노마크", svg: stickerAngerPop(), width: 240, height: 240 },
  { id: "heart-sticker", label: "하트", svg: stickerHeart(), width: 240, height: 220 },
  { id: "star-sticker", label: "별", svg: stickerStar(), width: 240, height: 240 },
  { id: "music-notes-sticker", label: "음표", svg: stickerMusicNotes(), width: 260, height: 240 },
  { id: "idea-bulb", label: "전구", svg: stickerIdeaBulb(), width: 240, height: 260 },
  { id: "question-pop", label: "물음표", svg: stickerQuestionPop(), width: 210, height: 260 },
  { id: "exclaim-pop", label: "느낌표", svg: stickerExclaimPop(), width: 170, height: 260 },
  { id: "shock-lines-sticker", label: "충격선", svg: stickerShockLines(), width: 280, height: 220 },
  { id: "sleepy-zzz-sticker", label: "졸음 zzz", svg: stickerSleepyZzz(), width: 260, height: 240 },
  { id: "twinkle-sticker", label: "반짝", svg: stickerTwinkle(), width: 240, height: 240 },
  { id: "angry-vein", label: "혈관", svg: stickerAngryVein(), width: 240, height: 220 },
  { id: "embarrassed-sweat", label: "당황 식은땀", svg: stickerEmbarrassedSweat(), width: 260, height: 220 },
  { id: "focus-mark", label: "집중", svg: stickerFocusMark(), width: 260, height: 260 },
];

// 공개 목록(>= 14개). 라벨은 한글, id는 영문.
export const FX_OVERLAYS: FxOverlay[] = [
  { id: "radial-focus", label: "집중선", svg: radialFocus(), width: 480, height: 480 },
  { id: "speed-lines", label: "속도선", svg: speedLines(), width: 480, height: 200 },
  { id: "impact-flash", label: "임팩트 플래시", svg: impactFlash(), width: 460, height: 460 },
  { id: "lightning-crack", label: "충격 번개", svg: lightningCrack(), width: 320, height: 460 },
  { id: "halftone-dots", label: "스크린톤 도트", svg: halftoneDots(), width: 360, height: 360 },
  { id: "vignette", label: "비네팅", svg: vignette(), width: 480, height: 480 },
  { id: "sweat-drop", label: "큰 땀방울", svg: bigSweatDrop(), width: 240, height: 320 },
  { id: "anger-mark", label: "분노 마크", svg: angerMark(), width: 260, height: 260 },
  { id: "heart-burst", label: "하트 뿜뿜", svg: heartBurst(), width: 320, height: 360 },
  { id: "question-mark", label: "물음표", svg: questionMark(), width: 200, height: 280 },
  { id: "exclaim-mark", label: "느낌표", svg: exclaimMark(), width: 140, height: 280 },
  { id: "sparkle-cluster", label: "반짝임", svg: sparkleCluster(), width: 360, height: 360 },
  { id: "gloom-lines", label: "우울 세로줄", svg: gloomLines(), width: 320, height: 280 },
  { id: "nervous-sweat", label: "당황 식은땀", svg: nervousSweat(), width: 320, height: 240 },
  { id: "speed-radial", label: "집중 강조선", svg: speedRadial(), width: 480, height: 480 },
  { id: "sleepy-z", label: "졸음 (zzz)", svg: sleepyZ(), width: 260, height: 280 },
  { id: "music-notes", label: "음표", svg: musicNotes(), width: 300, height: 280 },
  { id: "flame-burst", label: "화염", svg: flameBurst(), width: 280, height: 360 },
];
