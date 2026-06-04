// 창작 스튜디오 — 장르 전면 배경 씬(풀캔버스 배경 이미지로 삽입).
// 720×1080 세로 캔버스에 맞춘 자체 벡터 SVG 배경. 라이선스 이슈 없는 순수 원본 벡터만 사용
// (외부 아트/이모지/<image>/base64 래스터 없음). 레이어드 linearGradient + 단순 실루엣/도형.

export interface BgScene {
  id: string;
  label: string;
  genre: string;
  svg?: string;
  imgSrc?: string;
}

// 공통 viewBox. 모든 씬은 720×1080 풀캔버스 기준.
const W = 720;
const H = 1080;

// SVG 래퍼: defs/본문을 받아 self-contained 문서 문자열로 묶는다.
function scene(defs: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">` +
    `<defs>${defs}</defs>${body}</svg>`
  );
}

// 세로 2~3색 linearGradient 헬퍼.
function vGrad(id: string, stops: [string, string][]): string {
  const s = stops.map(([off, col]) => `<stop offset="${off}" stop-color="${col}"/>`).join("");
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${s}</linearGradient>`;
}

// 가로 linearGradient 헬퍼.
function hGrad(id: string, stops: [string, string][]): string {
  const s = stops.map(([off, col]) => `<stop offset="${off}" stop-color="${col}"/>`).join("");
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${s}</linearGradient>`;
}

// 방사형 그라디언트(보케/성운/태양광 등).
function rGrad(id: string, cx: number, cy: number, r: number, stops: [string, string, string?][]): string {
  const s = stops
    .map(([off, col, op]) => `<stop offset="${off}" stop-color="${col}"${op ? ` stop-opacity="${op}"` : ""}/>`)
    .join("");
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">${s}</radialGradient>`;
}

const bg = (fill: string) => `<rect x="0" y="0" width="${W}" height="${H}" fill="${fill}"/>`;

// 의사난수(시드 고정) — 별/입자 배치를 결정적으로 생성.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 별점들(작은 원). count·시드·영역·크기 범위·색.
function stars(count: number, seed: number, x0: number, y0: number, x1: number, y1: number, rMin: number, rMax: number, fill: string): string {
  const r = rng(seed);
  let out = "";
  for (let i = 0; i < count; i++) {
    const cx = (x0 + r() * (x1 - x0)).toFixed(1);
    const cy = (y0 + r() * (y1 - y0)).toFixed(1);
    const rad = (rMin + r() * (rMax - rMin)).toFixed(2);
    const op = (0.4 + r() * 0.6).toFixed(2);
    out += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${fill}" opacity="${op}"/>`;
  }
  return out;
}

// 둥근 언덕/구릉 실루엣(베지어).
function hill(yTop: number, amp: number, fill: string, op = "1"): string {
  return (
    `<path d="M0 ${yTop} C ${W * 0.25} ${yTop - amp}, ${W * 0.75} ${yTop + amp}, ${W} ${yTop - amp * 0.4} L ${W} ${H} L 0 ${H} Z" fill="${fill}" opacity="${op}"/>`
  );
}

// 삼각 산맥 실루엣(여러 봉우리).
function ridge(peaks: [number, number][], base: number, fill: string, op = "1"): string {
  let d = `M0 ${base}`;
  for (const [px, py] of peaks) d += ` L ${px} ${py} L ${px + 1} ${py}`;
  d += ` L ${W} ${base} L ${W} ${H} L 0 ${H} Z`;
  return `<path d="${d}" fill="${fill}" opacity="${op}"/>`;
}

// 침엽수(삼각 적층) 실루엣.
function pine(x: number, baseY: number, h: number, w: number, fill: string): string {
  const tiers = 3;
  let out = "";
  const trunkW = Math.max(4, w * 0.12);
  out += `<rect x="${(x - trunkW / 2).toFixed(1)}" y="${(baseY - h * 0.1).toFixed(1)}" width="${trunkW.toFixed(1)}" height="${(h * 0.18).toFixed(1)}" fill="${fill}"/>`;
  for (let t = 0; t < tiers; t++) {
    const top = baseY - h + (h * 0.62 * t) / tiers;
    const tierW = w * (1 - t * 0.18);
    const tierBot = baseY - h * 0.08 - (h * 0.5 * (tiers - 1 - t)) / tiers;
    out += `<path d="M${x} ${top.toFixed(1)} L ${(x - tierW / 2).toFixed(1)} ${tierBot.toFixed(1)} L ${(x + tierW / 2).toFixed(1)} ${tierBot.toFixed(1)} Z" fill="${fill}"/>`;
  }
  return out;
}

// 둥근(활엽) 나무 실루엣.
function tree(x: number, baseY: number, h: number, fill: string): string {
  const r = h * 0.42;
  const trunkW = h * 0.12;
  return (
    `<rect x="${(x - trunkW / 2).toFixed(1)}" y="${(baseY - h * 0.45).toFixed(1)}" width="${trunkW.toFixed(1)}" height="${(h * 0.45).toFixed(1)}" fill="${fill}"/>` +
    `<circle cx="${x}" cy="${(baseY - h * 0.55).toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}"/>` +
    `<circle cx="${(x - r * 0.7).toFixed(1)}" cy="${(baseY - h * 0.4).toFixed(1)}" r="${(r * 0.7).toFixed(1)}" fill="${fill}"/>` +
    `<circle cx="${(x + r * 0.7).toFixed(1)}" cy="${(baseY - h * 0.42).toFixed(1)}" r="${(r * 0.72).toFixed(1)}" fill="${fill}"/>`
  );
}

// 한 그루 대나무 줄기(마디 포함).
function bambooStalk(x: number, w: number, sway: number, fill: string, nodeFill: string): string {
  const segs = 9;
  let out = "";
  for (let i = 0; i < segs; i++) {
    const y = (i / segs) * H;
    const off = Math.sin((i / segs) * Math.PI * 2 + sway) * 10;
    out += `<rect x="${(x + off - w / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(H / segs - 4).toFixed(1)}" fill="${fill}"/>`;
    out += `<rect x="${(x + off - w / 2 - 2).toFixed(1)}" y="${(y + H / segs - 6).toFixed(1)}" width="${(w + 4).toFixed(1)}" height="3" fill="${nodeFill}"/>`;
  }
  return out;
}

// 빌딩 박스 + 창문 격자.
function building(x: number, baseY: number, w: number, h: number, fill: string, win: string): string {
  let out = `<rect x="${x}" y="${(baseY - h).toFixed(1)}" width="${w}" height="${h.toFixed(1)}" fill="${fill}"/>`;
  const cols = Math.max(2, Math.floor(w / 22));
  const rows = Math.max(3, Math.floor(h / 36));
  const padX = 8;
  const padY = 14;
  const cw = (w - padX * 2) / cols;
  const ch = (h - padY * 2) / rows;
  const r = rng(Math.round(x * 7 + h));
  for (let c = 0; c < cols; c++) {
    for (let ro = 0; ro < rows; ro++) {
      if (r() < 0.32) continue;
      const wx = x + padX + c * cw + cw * 0.18;
      const wy = baseY - h + padY + ro * ch + ch * 0.18;
      out += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="${(cw * 0.6).toFixed(1)}" height="${(ch * 0.6).toFixed(1)}" fill="${win}" opacity="${(0.55 + r() * 0.45).toFixed(2)}"/>`;
    }
  }
  return out;
}

// 부드러운 구름(겹친 원 + 흰 칠).
function cloud(x: number, y: number, s: number, fill: string, op = "1"): string {
  return (
    `<g opacity="${op}" fill="${fill}">` +
    `<ellipse cx="${x}" cy="${y}" rx="${(s).toFixed(0)}" ry="${(s * 0.55).toFixed(0)}"/>` +
    `<ellipse cx="${(x - s * 0.7).toFixed(0)}" cy="${(y + s * 0.12).toFixed(0)}" rx="${(s * 0.6).toFixed(0)}" ry="${(s * 0.42).toFixed(0)}"/>` +
    `<ellipse cx="${(x + s * 0.75).toFixed(0)}" cy="${(y + s * 0.1).toFixed(0)}" rx="${(s * 0.66).toFixed(0)}" ry="${(s * 0.46).toFixed(0)}"/>` +
    `<rect x="${(x - s * 1.25).toFixed(0)}" y="${(y).toFixed(0)}" width="${(s * 2.5).toFixed(0)}" height="${(s * 0.6).toFixed(0)}"/>` +
    `</g>`
  );
}

// 보케 원(투명 방사형) 묶음.
function bokeh(count: number, seed: number, fill: string): string {
  const r = rng(seed);
  let out = "";
  for (let i = 0; i < count; i++) {
    const cx = (r() * W).toFixed(0);
    const cy = (r() * H).toFixed(0);
    const rad = (20 + r() * 70).toFixed(0);
    const op = (0.06 + r() * 0.22).toFixed(2);
    out += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${fill}" opacity="${op}"/>`;
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// 1) 판타지 숲
const sFantasyForest = (() => {
  const defs =
    vGrad("ff-sky", [["0", "#7fd6a8"], ["0.55", "#cdeecb"], ["1", "#f3ffe9"]]) +
    rGrad("ff-sun", 540, 250, 320, [["0", "#fff7d6", "0.9"], ["1", "#fff7d6", "0"]]);
  let trees = "";
  for (const [x, h, c] of [[60, 520, "#1f4d3a"], [180, 640, "#16402f"], [320, 560, "#1f4d3a"], [470, 700, "#123626"], [620, 600, "#16402f"]] as [number, number, string][]) {
    trees += pine(x, 1090, h, h * 0.5, c);
  }
  const beams =
    `<g opacity="0.4">` +
    `<path d="M520 120 L380 1080 L520 1080 Z" fill="#fff7d6"/>` +
    `<path d="M560 120 L520 1080 L640 1080 Z" fill="#fff7d6"/>` +
    `</g>`;
  const body =
    `<rect width="${W}" height="${H}" fill="url(#ff-sky)"/>` +
    `<circle cx="540" cy="250" r="320" fill="url(#ff-sun)"/>` +
    hill(700, 60, "#3a7a5a", "0.5") +
    pine(60, 760, 240, 130, "#2f6a4f") + pine(660, 740, 220, 120, "#2f6a4f") +
    beams +
    trees +
    `<path d="M0 1010 C 200 980, 520 1040, 720 1000 L720 1080 L0 1080 Z" fill="#0d2c20"/>`;
  return scene(defs, body);
})();

// 2) 마법 성
const sMagicCastle = (() => {
  const defs =
    vGrad("mc-sky", [["0", "#5b3c8f"], ["0.5", "#9a5fb0"], ["1", "#f0a6b8"]]) +
    rGrad("mc-moon", 540, 230, 160, [["0", "#fff3f8", "1"], ["1", "#fff3f8", "0"]]);
  function tower(x: number, top: number, w: number, fill: string, roof: string): string {
    return (
      `<rect x="${x}" y="${top}" width="${w}" height="${1080 - top}" fill="${fill}"/>` +
      `<path d="M${x - 6} ${top} L ${x + w / 2} ${top - w * 1.3} L ${x + w + 6} ${top} Z" fill="${roof}"/>` +
      `<rect x="${x + w * 0.32}" y="${top + 40}" width="${w * 0.36}" height="${w * 0.6}" rx="${w * 0.18}" fill="#ffd86b" opacity="0.85"/>`
    );
  }
  const body =
    `<rect width="${W}" height="${H}" fill="url(#mc-sky)"/>` +
    `<circle cx="540" cy="230" r="160" fill="url(#mc-moon)"/>` +
    `<circle cx="540" cy="230" r="74" fill="#fff6fb"/>` +
    stars(70, 11, 0, 0, 720, 520, 0.6, 2.0, "#fff") +
    ridge([[120, 720], [300, 640], [520, 700], [680, 650]], 760, "#3a2a55", "0.7") +
    `<rect x="220" y="560" width="280" height="520" fill="#2c2046"/>` +
    tower(180, 480, 90, "#352856", "#c45fa0") +
    tower(330, 380, 110, "#3d2e62", "#d46fb0") +
    tower(500, 500, 90, "#352856", "#c45fa0") +
    `<rect x="330" y="760" width="60" height="320" rx="30" fill="#1a1230"/>` +
    `<rect x="270" y="640" width="40" height="56" rx="6" fill="#ffd86b" opacity="0.85"/>` +
    `<rect x="430" y="640" width="40" height="56" rx="6" fill="#ffd86b" opacity="0.85"/>` +
    `<path d="M0 1010 C 240 970, 480 1040, 720 1000 L720 1080 L0 1080 Z" fill="#160e26"/>`;
  return scene(defs, body);
})();

// 3) 환한 하늘 / 구름
const sBrightSky = (() => {
  const defs = vGrad("bs-sky", [["0", "#3aa6f0"], ["0.6", "#9fd6fb"], ["1", "#eaf8ff"]]);
  const body =
    `<rect width="${W}" height="${H}" fill="url(#bs-sky)"/>` +
    cloud(180, 200, 90, "#ffffff", "0.95") +
    cloud(560, 330, 70, "#ffffff", "0.9") +
    cloud(330, 520, 110, "#ffffff", "0.92") +
    cloud(600, 660, 80, "#ffffff", "0.85") +
    cloud(150, 760, 95, "#ffffff", "0.9") +
    cloud(440, 900, 120, "#ffffff", "0.95") +
    cloud(640, 980, 70, "#ffffff", "0.8");
  return scene(defs, body);
})();

// 4) 밤하늘 별
const sStarryNight = (() => {
  const defs =
    vGrad("sn-sky", [["0", "#0a0e2e"], ["0.55", "#13205a"], ["1", "#2b3f7a"]]) +
    rGrad("sn-glow", 360, 980, 520, [["0", "#3a5aa0", "0.5"], ["1", "#3a5aa0", "0"]]);
  const milky =
    `<path d="M-40 200 C 200 360, 540 440, 760 700" stroke="#bcd0ff" stroke-width="120" fill="none" opacity="0.10"/>` +
    `<path d="M-40 200 C 200 360, 540 440, 760 700" stroke="#e8eeff" stroke-width="50" fill="none" opacity="0.10"/>`;
  const shoot =
    `<g opacity="0.85"><line x1="520" y1="120" x2="640" y2="60" stroke="#fff" stroke-width="3"/><circle cx="640" cy="60" r="4" fill="#fff"/></g>`;
  const body =
    `<rect width="${W}" height="${H}" fill="url(#sn-sky)"/>` +
    milky +
    stars(220, 7, 0, 0, 720, 1000, 0.5, 2.2, "#ffffff") +
    stars(40, 19, 0, 0, 720, 700, 1.4, 3.0, "#bcd0ff") +
    shoot +
    `<rect width="${W}" height="${H}" fill="url(#sn-glow)"/>` +
    ridge([[140, 940], [320, 860], [520, 920], [680, 870]], 1000, "#070a1e") +
    `<rect x="0" y="1000" width="720" height="80" fill="#070a1e"/>`;
  return scene(defs, body);
})();

// 5) 노을 언덕
const sSunsetHill = (() => {
  const defs =
    vGrad("sh-sky", [["0", "#ff7a59"], ["0.45", "#ffb168"], ["1", "#ffe2a8"]]) +
    rGrad("sh-sun", 360, 560, 360, [["0", "#fff3c8", "1"], ["0.5", "#ffd06a", "0.7"], ["1", "#ffd06a", "0"]]);
  const body =
    `<rect width="${W}" height="${H}" fill="url(#sh-sky)"/>` +
    `<circle cx="360" cy="560" r="360" fill="url(#sh-sun)"/>` +
    `<circle cx="360" cy="560" r="120" fill="#fff0c0"/>` +
    cloud(160, 240, 60, "#ff9f7a", "0.7") +
    cloud(580, 320, 70, "#ff9f7a", "0.6") +
    hill(720, 70, "#e08a4a", "0.85") +
    hill(820, 90, "#b96a3a", "0.9") +
    hill(930, 70, "#7e3f24") +
    `<g fill="#5a2c1a">` +
    tree(120, 980, 150, "#5a2c1a") + tree(600, 1000, 130, "#5a2c1a") +
    `</g>`;
  return scene(defs, body);
})();

// 6) 도시 야경
const sCityNight = (() => {
  const defs =
    vGrad("cn-sky", [["0", "#0b1030"], ["0.5", "#1d2a5c"], ["1", "#46407a"]]) +
    rGrad("cn-glow", 360, 760, 480, [["0", "#ff9a7a", "0.30"], ["1", "#ff9a7a", "0"]]);
  let far = "";
  const rf = rng(31);
  for (let x = -10; x < 720; x += 46) {
    far += building(x, 720, 40, 120 + rf() * 200, "#2a2f55", "#6f7bb5");
  }
  let near = "";
  const rn = rng(53);
  for (let x = -20; x < 720; x += 78) {
    near += building(x, 1080, 70, 220 + rn() * 360, "#13183a", "#ffd06a");
  }
  const body =
    `<rect width="${W}" height="${H}" fill="url(#cn-sky)"/>` +
    stars(80, 5, 0, 0, 720, 480, 0.5, 1.6, "#cdd6ff") +
    `<rect width="${W}" height="${H}" fill="url(#cn-glow)"/>` +
    far +
    near +
    `<rect x="0" y="1060" width="720" height="20" fill="#0a0c20"/>`;
  return scene(defs, body);
})();

// 7) 무협 대나무숲
const sBambooGrove = (() => {
  const defs =
    vGrad("bg-sky", [["0", "#cfe8c8"], ["0.6", "#e8f4d8"], ["1", "#f6fbe8"]]) +
    rGrad("bg-light", 360, 200, 520, [["0", "#ffffff", "0.6"], ["1", "#ffffff", "0"]]);
  let far = "";
  const rf = rng(71);
  for (let i = 0; i < 12; i++) {
    far += bambooStalk(40 + i * 58, 10 + rf() * 4, rf() * 6, "#7fae6a", "#5e8c4d");
  }
  let near = "";
  const rn = rng(29);
  for (let i = 0; i < 7; i++) {
    near += bambooStalk(70 + i * 100, 24 + rn() * 8, rn() * 6, "#3f6e34", "#2c5224");
  }
  const leaves =
    `<g fill="#3f6e34" opacity="0.7">` +
    Array.from({ length: 18 }, (_, i) => {
      const r = rng(200 + i);
      const x = (r() * 720).toFixed(0);
      const y = (r() * 400).toFixed(0);
      const rot = (r() * 360).toFixed(0);
      return `<path d="M${x} ${y} q 26 -10 52 0 q -26 14 -52 0 Z" transform="rotate(${rot} ${x} ${y})"/>`;
    }).join("") +
    `</g>`;
  const body =
    `<rect width="${W}" height="${H}" fill="url(#bg-sky)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#bg-light)"/>` +
    `<g opacity="0.55">${far}</g>` +
    near +
    leaves +
    `<rect x="0" y="1040" width="720" height="40" fill="#234017"/>`;
  return scene(defs, body);
})();

// 8) 동양 산수(먹)
const sInkLandscape = (() => {
  const defs =
    vGrad("il-sky", [["0", "#f3efe6"], ["0.7", "#ece7da"], ["1", "#ded6c4"]]) +
    rGrad("il-sun", 510, 250, 130, [["0", "#e8e2d2", "1"], ["1", "#e8e2d2", "0"]]);
  // 먹 산: 부드러운 곡선 + 농담 차이
  const mtn = (yTop: number, amp: number, fill: string, op: string) =>
    `<path d="M0 ${yTop} C 120 ${yTop - amp}, 240 ${yTop + amp * 0.4}, 360 ${yTop - amp * 0.7} S 600 ${yTop - amp}, 720 ${yTop - amp * 0.3} L720 1080 L0 1080 Z" fill="${fill}" opacity="${op}"/>`;
  const mist = (y: number, op: string) => `<rect x="0" y="${y}" width="720" height="60" fill="#f3efe6" opacity="${op}"/>`;
  const body =
    `<rect width="${W}" height="${H}" fill="url(#il-sky)"/>` +
    `<circle cx="510" cy="250" r="130" fill="url(#il-sun)"/>` +
    `<circle cx="510" cy="250" r="56" fill="#b94a3a" opacity="0.85"/>` +
    mtn(560, 110, "#9aa09a", "0.5") +
    mist(600, "0.6") +
    mtn(700, 150, "#5e655e", "0.7") +
    mist(740, "0.5") +
    mtn(850, 120, "#2e332e", "0.92") +
    // 외로운 소나무 실루엣
    `<g stroke="#1c201c" stroke-width="6" fill="none" stroke-linecap="round">` +
    `<path d="M120 1080 L120 880"/><path d="M120 920 q -40 -30 -80 -24"/><path d="M120 900 q 46 -28 86 -16"/><path d="M120 940 q -30 -18 -64 -12"/>` +
    `</g>` +
    `<ellipse cx="60" cy="852" rx="44" ry="16" fill="#1c201c"/>` +
    `<ellipse cx="190" cy="880" rx="40" ry="14" fill="#1c201c"/>`;
  return scene(defs, body);
})();

// 9) 도장 실내
const sDojoInterior = (() => {
  const defs =
    vGrad("dj-wall", [["0", "#e8d3a8"], ["1", "#d8bf8a"]]) +
    vGrad("dj-floor", [["0", "#a06a3a"], ["1", "#7a4f29"]]) +
    rGrad("dj-lamp", 360, 120, 260, [["0", "#fff2cf", "0.7"], ["1", "#fff2cf", "0"]]);
  // 원근 바닥 판자
  let planks = "";
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * 720;
    planks += `<line x1="${x.toFixed(0)}" y1="700" x2="${(360 + (x - 360) * 0.18).toFixed(0)}" y2="1080" stroke="#5e3c1e" stroke-width="2" opacity="0.5"/>`;
  }
  // 장지문(쇼지) 격자
  let shoji = "";
  for (let c = 0; c < 6; c++) {
    const x = 40 + c * 108;
    shoji += `<rect x="${x}" y="120" width="100" height="420" fill="#fff8ea" opacity="0.92" stroke="#8a6a3a" stroke-width="4"/>`;
    for (let gx = 1; gx < 3; gx++) shoji += `<line x1="${x + (100 / 3) * gx}" y1="120" x2="${x + (100 / 3) * gx}" y2="540" stroke="#8a6a3a" stroke-width="2"/>`;
    for (let gy = 1; gy < 4; gy++) shoji += `<line x1="${x}" y1="${120 + (420 / 4) * gy}" x2="${x + 100}" y2="${120 + (420 / 4) * gy}" stroke="#8a6a3a" stroke-width="2"/>`;
  }
  const body =
    `<rect width="${W}" height="${H}" fill="url(#dj-wall)"/>` +
    `<rect x="0" y="700" width="720" height="380" fill="url(#dj-floor)"/>` +
    `<rect width="${W}" height="240" fill="url(#dj-lamp)"/>` +
    shoji +
    `<rect x="0" y="540" width="720" height="40" fill="#5e3c1e"/>` +
    planks +
    // 족자(걸개) — 무(武) 느낌의 붉은 띠
    `<rect x="300" y="130" width="120" height="300" fill="#f4ece0" stroke="#7a4f29" stroke-width="4"/>` +
    `<rect x="346" y="170" width="28" height="220" rx="6" fill="#b23a3a" opacity="0.85"/>`;
  return scene(defs, body);
})();

// 10) 교실
const sClassroom = (() => {
  const defs =
    vGrad("cl-wall", [["0", "#cfe3e6"], ["1", "#aecdd2"]]) +
    vGrad("cl-floor", [["0", "#caa074"], ["1", "#a87f50"]]) +
    rGrad("cl-light", 540, 260, 380, [["0", "#fff7e8", "0.5"], ["1", "#fff7e8", "0"]]);
  // 창문(밝은 하늘)
  let win = "";
  for (let c = 0; c < 2; c++) {
    const x = 60 + c * 150;
    win += `<rect x="${x}" y="120" width="130" height="220" fill="#bfe8ff" stroke="#7a8a90" stroke-width="6"/>`;
    win += `<line x1="${x + 65}" y1="120" x2="${x + 65}" y2="340" stroke="#7a8a90" stroke-width="4"/>`;
    win += `<line x1="${x}" y1="230" x2="${x + 130}" y2="230" stroke="#7a8a90" stroke-width="4"/>`;
  }
  // 칠판
  const board =
    `<rect x="400" y="130" width="280" height="200" rx="6" fill="#2e5e44" stroke="#7a5a34" stroke-width="10"/>` +
    `<rect x="400" y="320" width="280" height="14" fill="#7a5a34"/>` +
    `<line x1="430" y1="180" x2="600" y2="180" stroke="#e8f0e0" stroke-width="3" opacity="0.7"/>` +
    `<line x1="430" y1="220" x2="560" y2="220" stroke="#e8f0e0" stroke-width="3" opacity="0.7"/>` +
    `<line x1="430" y1="260" x2="640" y2="260" stroke="#e8f0e0" stroke-width="3" opacity="0.7"/>`;
  // 책상 줄(원근)
  let desks = "";
  const rows = [[700, 70, 1], [820, 100, 0.9], [960, 140, 0.8]] as [number, number, number][];
  for (const [y, dw, sc] of rows) {
    for (let c = 0; c < 4; c++) {
      const gap = (720 - dw * 4) / 5;
      const x = gap + c * (dw + gap);
      desks += `<rect x="${x.toFixed(0)}" y="${y}" width="${dw}" height="${(14 * sc).toFixed(0)}" rx="4" fill="#d9b98a"/>`;
      desks += `<rect x="${(x + 6).toFixed(0)}" y="${(y + 14 * sc).toFixed(0)}" width="6" height="${(70 * sc).toFixed(0)}" fill="#9a7440"/>`;
      desks += `<rect x="${(x + dw - 12).toFixed(0)}" y="${(y + 14 * sc).toFixed(0)}" width="6" height="${(70 * sc).toFixed(0)}" fill="#9a7440"/>`;
    }
  }
  const body =
    `<rect width="${W}" height="${H}" fill="url(#cl-wall)"/>` +
    `<rect x="0" y="660" width="720" height="420" fill="url(#cl-floor)"/>` +
    `<rect width="${W}" height="380" fill="url(#cl-light)"/>` +
    win +
    board +
    `<rect x="0" y="640" width="720" height="30" fill="#8a98a0"/>` +
    desks;
  return scene(defs, body);
})();

// 11) 우주 성운
const sNebula = (() => {
  const defs =
    vGrad("nb-base", [["0", "#05030f"], ["1", "#0c0820"]]) +
    rGrad("nb-c1", 250, 380, 360, [["0", "#7a3cf0", "0.55"], ["0.5", "#c43c9a", "0.30"], ["1", "#c43c9a", "0"]]) +
    rGrad("nb-c2", 520, 640, 420, [["0", "#3c9af0", "0.5"], ["0.6", "#2c5ad0", "0.20"], ["1", "#2c5ad0", "0"]]) +
    rGrad("nb-c3", 420, 220, 300, [["0", "#f0a23c", "0.35"], ["1", "#f0a23c", "0"]]) +
    rGrad("nb-core", 380, 520, 90, [["0", "#ffffff", "0.95"], ["0.4", "#ffd9f0", "0.5"], ["1", "#ffd9f0", "0"]]);
  const body =
    `<rect width="${W}" height="${H}" fill="url(#nb-base)"/>` +
    stars(180, 13, 0, 0, 720, 1080, 0.4, 1.4, "#cdd6ff") +
    `<rect width="${W}" height="${H}" fill="url(#nb-c3)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#nb-c1)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#nb-c2)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#nb-core)"/>` +
    stars(60, 23, 0, 0, 720, 1080, 1.2, 2.6, "#ffffff") +
    // 큰 별 반짝임(십자)
    `<g stroke="#ffffff" stroke-width="2" opacity="0.85"><line x1="380" y1="480" x2="380" y2="560"/><line x1="340" y1="520" x2="420" y2="520"/></g>`;
  return scene(defs, body);
})();

// 12) 핑크 로맨스 보케
const sRomanceBokeh = (() => {
  const defs =
    vGrad("rb-base", [["0", "#ffd9e6"], ["0.5", "#ffc2d6"], ["1", "#ffe6f0"]]) +
    rGrad("rb-glow", 360, 380, 460, [["0", "#fff4f8", "0.7"], ["1", "#fff4f8", "0"]]);
  // 떨어지는 꽃잎(하트형 단순 path)
  let petals = "";
  const rp = rng(91);
  for (let i = 0; i < 16; i++) {
    const x = (rp() * 720).toFixed(0);
    const y = (rp() * 1080).toFixed(0);
    const s = (0.5 + rp() * 1.1).toFixed(2);
    const rot = (rp() * 360).toFixed(0);
    const op = (0.4 + rp() * 0.4).toFixed(2);
    petals += `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 6 C -10 -6 -22 4 0 18 C 22 4 10 -6 0 6 Z" fill="#ff7aa8" opacity="${op}"/>`;
  }
  const body =
    `<rect width="${W}" height="${H}" fill="url(#rb-base)"/>` +
    bokeh(26, 41, "#ffffff") +
    bokeh(18, 77, "#ff9ec2") +
    `<rect width="${W}" height="${H}" fill="url(#rb-glow)"/>` +
    petals;
  return scene(defs, body);
})();

// 13) 집중선 단색 배경
const sSpeedLines = (() => {
  const defs = rGrad("sl-c", 360, 540, 60, [["0", "#ffffff", "1"], ["1", "#f4f4f4", "1"]]);
  const cx = 360;
  const cy = 540;
  let lines = "";
  const n = 96;
  const r = rng(3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.02;
    const inner = 120 + r() * 80; // 가운데 클리어 존
    const outer = 900;
    const x1 = cx + Math.cos(a) * inner;
    const y1 = cy + Math.sin(a) * inner;
    const x2 = cx + Math.cos(a) * outer;
    const y2 = cy + Math.sin(a) * outer;
    const w = (1.5 + r() * 5).toFixed(1);
    lines += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#161616" stroke-width="${w}"/>`;
  }
  const body =
    bg("#161616") +
    `<g>${lines}</g>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="180" ry="150" fill="url(#sl-c)"/>`;
  return scene(defs, body);
})();

// 14) 노을/석양 도시(보너스 — daily/romance 겸용)
const sGoldenCity = (() => {
  const defs =
    vGrad("gc-sky", [["0", "#ffcaa0"], ["0.5", "#ffb0c4"], ["1", "#ffe4d0"]]) +
    rGrad("gc-sun", 540, 360, 220, [["0", "#fff6d8", "1"], ["1", "#fff6d8", "0"]]);
  let blds = "";
  const r = rng(61);
  for (let x = -10; x < 720; x += 60) {
    blds += building(x, 1080, 54, 160 + r() * 320, "#8a5a66", "#ffe08a");
  }
  const body =
    `<rect width="${W}" height="${H}" fill="url(#gc-sky)"/>` +
    `<circle cx="540" cy="360" r="220" fill="url(#gc-sun)"/>` +
    `<circle cx="540" cy="360" r="96" fill="#fff0c4"/>` +
    cloud(180, 280, 60, "#ffd9b0", "0.7") +
    cloud(330, 200, 50, "#ffd9b0", "0.6") +
    `<g opacity="0.92">${blds}</g>`;
  return scene(defs, body);
})();

export const BG_SCENES: BgScene[] = [
  { id: "webtoon-classroom", label: "웹툰 교실 (일러스트)", genre: "daily", imgSrc: "/assets/studio/backgrounds/webtoon_classroom.png" },
  { id: "webtoon-street", label: "웹툰 노을 거리 (일러스트)", genre: "daily", imgSrc: "/assets/studio/backgrounds/webtoon_street.png" },
  { id: "webtoon-bedroom", label: "웹툰 방 야경 (일러스트)", genre: "daily", imgSrc: "/assets/studio/backgrounds/webtoon_bedroom.png" },
  { id: "webtoon-convenience", label: "웹툰 밤 편의점 (일러스트)", genre: "daily", imgSrc: "/assets/studio/backgrounds/webtoon_convenience.png" },
  { id: "webtoon-corridor", label: "웹툰 저녁 복도 (일러스트)", genre: "daily", imgSrc: "/assets/studio/backgrounds/webtoon_corridor.png" },
  { id: "webtoon-palace", label: "웹툰 판타지 왕실 (일러스트)", genre: "fantasy", imgSrc: "/assets/studio/backgrounds/webtoon_palace.png" },
  { id: "webtoon-cafe", label: "웹툰 예쁜 카페 (일러스트)", genre: "daily", imgSrc: "/assets/studio/backgrounds/webtoon_cafe.png" },
  { id: "fantasy-forest", label: "판타지 숲", genre: "fantasy", svg: sFantasyForest },
  { id: "magic-castle", label: "마법 성", genre: "fantasy", svg: sMagicCastle },
  { id: "bright-sky", label: "환한 하늘", genre: "daily", svg: sBrightSky },
  { id: "starry-night", label: "밤하늘 별", genre: "daily", svg: sStarryNight },
  { id: "sunset-hill", label: "노을 언덕", genre: "romance", svg: sSunsetHill },
  { id: "city-night", label: "도시 야경", genre: "daily", svg: sCityNight },
  { id: "bamboo-grove", label: "무협 대나무숲", genre: "wuxia", svg: sBambooGrove },
  { id: "ink-landscape", label: "동양 산수(먹)", genre: "wuxia", svg: sInkLandscape },
  { id: "dojo-interior", label: "도장 실내", genre: "wuxia", svg: sDojoInterior },
  { id: "classroom", label: "교실", genre: "daily", svg: sClassroom },
  { id: "nebula", label: "우주 성운", genre: "sf", svg: sNebula },
  { id: "romance-bokeh", label: "핑크 로맨스 보케", genre: "romance", svg: sRomanceBokeh },
  { id: "speed-lines", label: "집중선 배경", genre: "daily", svg: sSpeedLines },
  { id: "golden-city", label: "석양 도시", genre: "romance", svg: sGoldenCity },
];
