// 창작 스튜디오 캐릭터 에셋 장르/시대극 팩 (중세 유럽, 한복 전통, 무협, 판타지)
// 라인아트 + 플랫 셀 컬러 + 웹툰 스타일의 고화질 벡터 캐릭터 라이브러리.
import type { CharacterAsset } from "./studio-characters";

const W = 360;
const H = 480;
const INK = "#241b29"; // 외곽선 색상
const LW = 4.5;       // 외곽 두께
const LW2 = 3;        // 내부선 두께

const cx = 180;
const headY = 206;
const headRx = 92;
const headRy = 100;

// ─────────────────────────────────────────────────────────
// 표정 데이터 인터페이스 및 인스턴스 (7개 고정)
// ─────────────────────────────────────────────────────────
interface Expr {
  id: string;
  label: string;
  eye: "open" | "smile" | "wink" | "sad" | "angry" | "wide" | "love";
  brow: "neutral" | "up" | "down" | "worry";
  mouth: "smile" | "grin" | "flat" | "frown" | "open" | "pout" | "tongue";
  blush?: "soft" | "strong";
  tears?: boolean;
  anger?: boolean;
  sparkle?: boolean;
  sweat?: boolean;
}

const EXPRS: Expr[] = [
  { id: "happy", label: "기쁨", eye: "smile", brow: "up", mouth: "smile", blush: "soft" },
  { id: "laugh", label: "웃음", eye: "smile", brow: "up", mouth: "grin", blush: "soft" },
  { id: "neutral", label: "무표정", eye: "open", brow: "neutral", mouth: "flat" },
  { id: "sad", label: "슬픔", eye: "sad", brow: "worry", mouth: "frown", tears: true },
  { id: "angry", label: "분노", eye: "angry", brow: "down", mouth: "pout", anger: true },
  { id: "surprised", label: "놀람", eye: "wide", brow: "up", mouth: "open", sweat: true },
  { id: "love", label: "사랑", eye: "love", brow: "up", mouth: "smile", blush: "strong", sparkle: true },
];

// ─────────────────────────────────────────────────────────
// 캐릭터 스펙 인터페이스
// ─────────────────────────────────────────────────────────
interface CharSpec {
  id: string;
  label: string;
  emoji: string;
  gender: "male" | "female";
  role:
    | "knight"
    | "princess"
    | "wizard"
    | "bard"
    | "hanbok-doryeong"
    | "hanbok-nangja"
    | "hanbok-yangban"
    | "hanbok-king"
    | "hanbok-courtlady"
    | "hanbok-warrior"
    | "wuxia-swordsman"
    | "wuxia-swordswoman"
    | "wuxia-taoist"
    | "wuxia-grandmaster"
    | "elf"
    | "devil";
  hairStyle: "spiky" | "wavy" | "long" | "short" | "braid" | "topknot" | "gache" | "sage";
  skin: string;
  skinSh: string;
  hair: string;
  hairSh: string;
  hairHi: string;
  iris: string;
  irisRim: string;
  outfit: string;
  outfitSh: string;
  accent: string;
  collar: string;
  eyeScale?: number;
}

// ─────────────────────────────────────────────────────────
// 캐릭터 데이터 프리셋 (총 16종)
// ─────────────────────────────────────────────────────────
const CHARS: CharSpec[] = [
  // 1. 중세 유럽풍
  {
    id: "genre-knight",
    label: "기사 아서",
    emoji: "🛡️",
    gender: "male",
    role: "knight",
    hairStyle: "spiky",
    skin: "#ffebee",
    skinSh: "#ffcdd2",
    hair: "#b0bec5",
    hairSh: "#78909c",
    hairHi: "#cfd8dc",
    iris: "#0d47a1",
    irisRim: "#0a2472",
    outfit: "#90a4ae",
    outfitSh: "#546e7a",
    accent: "#ffb300",
    collar: "#cfd8dc",
    eyeScale: 0.92,
  },
  {
    id: "genre-princess",
    label: "공주 엘레나",
    emoji: "👸",
    gender: "female",
    role: "princess",
    hairStyle: "wavy",
    skin: "#fff9c4",
    skinSh: "#ffe082",
    hair: "#ffd54f",
    hairSh: "#ffb300",
    hairHi: "#fff9c4",
    iris: "#00c853",
    irisRim: "#007f30",
    outfit: "#f06292",
    outfitSh: "#c2185b",
    accent: "#ffb300",
    collar: "#ffffff",
    eyeScale: 1.12,
  },
  {
    id: "genre-wizard",
    label: "마법사 멀린",
    emoji: "🧙",
    gender: "male",
    role: "wizard",
    hairStyle: "wavy",
    skin: "#ffe8e8",
    skinSh: "#ffd0d0",
    hair: "#9575cd",
    hairSh: "#5e35b1",
    hairHi: "#d1c4e9",
    iris: "#7e57c2",
    irisRim: "#4527a0",
    outfit: "#3f51b5",
    outfitSh: "#1a237e",
    accent: "#ffca28",
    collar: "#ffffff",
    eyeScale: 1.0,
  },
  {
    id: "genre-bard",
    label: "음유시인 루카",
    emoji: "🪕",
    gender: "female",
    role: "bard",
    hairStyle: "short",
    skin: "#ffe0b2",
    skinSh: "#ffcc80",
    hair: "#a1887f",
    hairSh: "#5d4037",
    hairHi: "#d7ccc8",
    iris: "#8d6e63",
    irisRim: "#4e342e",
    outfit: "#00897b",
    outfitSh: "#004d40",
    accent: "#e53935",
    collar: "#ffffff",
    eyeScale: 1.05,
  },
  // 2. 한복 (전통 한국)
  {
    id: "genre-hanbok-doryeong",
    label: "이도령",
    emoji: "👦",
    gender: "male",
    role: "hanbok-doryeong",
    hairStyle: "topknot",
    skin: "#ffe7d6",
    skinSh: "#f5c6a5",
    hair: "#1a1a1a",
    hairSh: "#0d0d0d",
    hairHi: "#4d4d4d",
    iris: "#3e2723",
    irisRim: "#1b0a05",
    outfit: "#1e88e5",
    outfitSh: "#0d47a1",
    accent: "#b71c1c",
    collar: "#ffffff",
    eyeScale: 0.94,
  },
  {
    id: "genre-hanbok-nangja",
    label: "춘향낭자",
    emoji: "👧",
    gender: "female",
    role: "hanbok-nangja",
    hairStyle: "braid",
    skin: "#fff3e0",
    skinSh: "#ffe0b2",
    hair: "#4e342e",
    hairSh: "#271714",
    hairHi: "#6d4c41",
    iris: "#5d4037",
    irisRim: "#2a1b18",
    outfit: "#ffd54f",
    outfitSh: "#fbc02d",
    accent: "#6a1b9a",
    collar: "#ffffff",
    eyeScale: 1.1,
  },
  {
    id: "genre-hanbok-yangban",
    label: "김대감",
    emoji: "🎩",
    gender: "male",
    role: "hanbok-yangban",
    hairStyle: "topknot",
    skin: "#ffe8d6",
    skinSh: "#f3bd9a",
    hair: "#e0e0e0",
    hairSh: "#9e9e9e",
    hairHi: "#f5f5f5",
    iris: "#212121",
    irisRim: "#050505",
    outfit: "#e0f2f1",
    outfitSh: "#b2dfdb",
    accent: "#37474f",
    collar: "#ffffff",
    eyeScale: 0.94,
  },
  {
    id: "genre-hanbok-king",
    label: "조선 국왕",
    emoji: "🤴",
    gender: "male",
    role: "hanbok-king",
    hairStyle: "topknot",
    skin: "#ffe0b2",
    skinSh: "#ffb74d",
    hair: "#111111",
    hairSh: "#050505",
    hairHi: "#333333",
    iris: "#1a1a1a",
    irisRim: "#010101",
    outfit: "#d32f2f",
    outfitSh: "#7f0000",
    accent: "#ffd700",
    collar: "#ffffff",
    eyeScale: 0.96,
  },
  {
    id: "genre-hanbok-courtlady",
    label: "장희빈",
    emoji: "💄",
    gender: "female",
    role: "hanbok-courtlady",
    hairStyle: "gache",
    skin: "#fff5ee",
    skinSh: "#ffdab9",
    hair: "#111111",
    hairSh: "#050505",
    hairHi: "#333333",
    iris: "#3e2723",
    irisRim: "#1a0f0d",
    outfit: "#004d40",
    outfitSh: "#00251a",
    accent: "#4a148c",
    collar: "#ffffff",
    eyeScale: 1.08,
  },
  {
    id: "genre-hanbok-warrior",
    label: "이무사",
    emoji: "🪖",
    gender: "male",
    role: "hanbok-warrior",
    hairStyle: "topknot",
    skin: "#ffe0b2",
    skinSh: "#db9e76",
    hair: "#212121",
    hairSh: "#0a0a0a",
    hairHi: "#424242",
    iris: "#263238",
    irisRim: "#10171a",
    outfit: "#1a1a1a",
    outfitSh: "#0d0d0d",
    accent: "#0d47a1",
    collar: "#ffffff",
    eyeScale: 0.92,
  },
  // 3. 무협
  {
    id: "genre-wuxia-swordsman",
    label: "검객 무영",
    emoji: "⚔️",
    gender: "male",
    role: "wuxia-swordsman",
    hairStyle: "spiky",
    skin: "#ffebee",
    skinSh: "#ffcdd2",
    hair: "#1c1d21",
    hairSh: "#0a0b0d",
    hairHi: "#3a3c42",
    iris: "#37474f",
    irisRim: "#1e272c",
    outfit: "#263238",
    outfitSh: "#1a237e",
    accent: "#d50000",
    collar: "#ffffff",
    eyeScale: 0.92,
  },
  {
    id: "genre-wuxia-swordswoman",
    label: "여협 소하",
    emoji: "🥋",
    gender: "female",
    role: "wuxia-swordswoman",
    hairStyle: "long",
    skin: "#fff5f5",
    skinSh: "#ffcdd2",
    hair: "#111111",
    hairSh: "#050505",
    hairHi: "#333333",
    iris: "#006064",
    irisRim: "#00363a",
    outfit: "#e0f7fa",
    outfitSh: "#80deea",
    accent: "#00e5ff",
    collar: "#ffffff",
    eyeScale: 1.08,
  },
  {
    id: "genre-wuxia-taoist",
    label: "장삼풍 도사",
    emoji: "☯️",
    gender: "male",
    role: "wuxia-taoist",
    hairStyle: "topknot",
    skin: "#fff9f5",
    skinSh: "#ffd8c0",
    hair: "#1a1a1a",
    hairSh: "#0d0d0d",
    hairHi: "#4d4d4d",
    iris: "#607d8b",
    irisRim: "#37474f",
    outfit: "#fafafa",
    outfitSh: "#e0e0e0",
    accent: "#212121",
    collar: "#ffffff",
    eyeScale: 0.96,
  },
  {
    id: "genre-wuxia-grandmaster",
    label: "백발 고수 천산",
    emoji: "🧓",
    gender: "male",
    role: "wuxia-grandmaster",
    hairStyle: "sage",
    skin: "#ffebee",
    skinSh: "#ffcdd2",
    hair: "#ffffff",
    hairSh: "#cfd8dc",
    hairHi: "#ffffff",
    iris: "#90a4ae",
    irisRim: "#546e7a",
    outfit: "#fff8e1",
    outfitSh: "#ffe082",
    accent: "#ffb300",
    collar: "#ffffff",
    eyeScale: 0.94,
  },
  // 4. 판타지 / 마왕 계열
  {
    id: "genre-fantasy-elf",
    label: "엘프 아리아",
    emoji: "🧝",
    gender: "female",
    role: "elf",
    hairStyle: "wavy",
    skin: "#ffebee",
    skinSh: "#ffcdd2",
    hair: "#f5f5f5",
    hairSh: "#cfd8dc",
    hairHi: "#ffffff",
    iris: "#00e5ff",
    irisRim: "#00838f",
    outfit: "#4caf50",
    outfitSh: "#2e7d32",
    accent: "#ffd700",
    collar: "#ffffff",
    eyeScale: 1.1,
  },
  {
    id: "genre-fantasy-devil",
    label: "마왕 발락",
    emoji: "😈",
    gender: "male",
    role: "devil",
    hairStyle: "spiky",
    skin: "#e8eaf6",
    skinSh: "#c5cae9",
    hair: "#1a237e",
    hairSh: "#000028",
    hairHi: "#3f51b5",
    iris: "#ff1744",
    irisRim: "#880e4f",
    outfit: "#1a237e",
    outfitSh: "#000028",
    accent: "#ffd700",
    collar: "#ffffff",
    eyeScale: 0.96,
  },
];

// ─────────────────────────────────────────────────────────
// 유틸리티 / 라인아트 잉크 스타일 빌더
// ─────────────────────────────────────────────────────────
const ink = (w = LW) =>
  `stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

function getGradients(c: CharSpec, g: string, lid: string, rid: string): string {
  const hairTop = c.hair;
  const hairBottom = c.hairSh;
  const hairHiG = c.hairHi;

  return `
    <linearGradient id="${g}_o" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c.outfit}"/>
      <stop offset="100%" stop-color="${c.outfitSh}"/>
    </linearGradient>
    <radialGradient id="${lid}_i" cx="0.4" cy="0.35" r="0.75">
      <stop offset="0%" stop-color="${c.iris}"/>
      <stop offset="65%" stop-color="${c.iris}"/>
      <stop offset="100%" stop-color="${c.irisRim}"/>
    </radialGradient>
    <radialGradient id="${rid}_i" cx="0.6" cy="0.35" r="0.75">
      <stop offset="0%" stop-color="${c.iris}"/>
      <stop offset="65%" stop-color="${c.iris}"/>
      <stop offset="100%" stop-color="${c.irisRim}"/>
    </radialGradient>
    <linearGradient id="${g}_hG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${hairTop}"/>
      <stop offset="100%" stop-color="${hairBottom}"/>
    </linearGradient>
    <linearGradient id="${g}_hsG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c.hairSh}"/>
      <stop offset="100%" stop-color="#140f17"/>
    </linearGradient>
    <linearGradient id="${g}_hHi" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${hairHiG}" stop-opacity="0.15"/>
      <stop offset="50%" stop-color="${hairHiG}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${hairHiG}" stop-opacity="0.15"/>
    </linearGradient>
    <radialGradient id="${g}_blushG" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#ff8a9c" stop-opacity="0.85"/>
      <stop offset="40%" stop-color="#ff8a9c" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#ff8a9c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${g}_skin" cx="0.5" cy="0.4" r="0.6">
      <stop offset="0%" stop-color="${c.skin}"/>
      <stop offset="85%" stop-color="${c.skin}"/>
      <stop offset="100%" stop-color="${c.skinSh}"/>
    </radialGradient>
    <filter id="${g}_blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3.5" />
    </filter>
    <filter id="${g}_rimGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000000" flood-opacity="0.12"/>
    </filter>
  `;
}

function getFacePath(): string {
  const tx = headRx;
  const top = headY - headRy + 4;
  const browTemple = headY - 18;
  const cheek = headY + 20;
  const jaw = headY + 64;
  const chin = headY + headRy + 12;
  return (
    `M ${cx} ${top} ` +
    `C ${cx + tx * 0.7} ${top} ${cx + tx} ${browTemple - 30} ${cx + tx} ${browTemple} ` +
    `C ${cx + tx} ${cheek} ${cx + tx - 8} ${jaw - 18} ${cx + tx - 26} ${jaw} ` +
    `C ${cx + tx - 44} ${jaw + 26} ${cx + 26} ${chin - 6} ${cx} ${chin} ` +
    `C ${cx - 26} ${chin - 6} ${cx - tx + 44} ${jaw + 26} ${cx - tx + 26} ${jaw} ` +
    `C ${cx - tx + 8} ${jaw - 18} ${cx - tx} ${cheek} ${cx - tx} ${browTemple} ` +
    `C ${cx - tx} ${browTemple - 30} ${cx - tx * 0.7} ${top} ${cx} ${top} Z`
  );
}

function getHairFrontD(style: CharSpec["hairStyle"]): string {
  switch (style) {
    case "spiky":
      return `M ${cx - 100} ${headY - 8} l 16 -64 l 20 44 l 18 -70 l 24 56 l 20 -64 l 22 66 l 20 -50 l 18 60 l 16 -34 l 12 50 q -110 -38 -206 0 z`;
    case "wavy":
      return `M ${cx - 104} ${headY + 8} q -10 -132 104 -132 q 114 0 104 132 q -26 -54 -56 -66 q -8 18 -24 22 q 6 16 -8 22 q -16 -2 -22 -18 q -10 30 -38 36 q -36 6 -64 -18 z`;
    case "long":
      return `M ${cx - 104} ${headY + 8} q -10 -134 104 -134 q 116 0 104 134 q -30 -68 -70 -70 q -14 40 -46 46 q -10 -8 -18 -2 q -38 6 -74 26 z`;
    case "short":
      return `M ${cx - 102} ${headY + 4} q -14 -126 102 -126 q 116 0 102 126 q -30 -60 -68 -66 q -10 42 -38 46 q -8 -36 -30 -32 q -44 4 -68 52 z`;
    case "braid":
      return `M ${cx - 102} ${headY + 6} q -10 -126 102 -126 q 112 0 102 126 q -32 -62 -72 -64 q -12 30 -30 32 q -32 0 -72 32 z`;
    case "topknot":
      return `M ${cx - 96} ${headY + 2} q -12 -118 96 -118 q 108 0 96 118 q -26 -56 -60 -68 q -10 38 -36 42 q -8 -34 -36 -34 q -34 8 -60 60 z`;
    case "gache":
      return `M ${cx - 96} ${headY + 10} q -6 -120 96 -120 q 102 0 96 120 q -48 -60 -96 -60 q -48 0 -96 60 z`;
    case "sage":
      return `M ${cx - 100} ${headY + 10} q -6 -120 96 -120 q 102 0 96 120 q -30 -60 -60 -60 q -30 0 -60 60 q -30 10 -72 30 z`;
    default:
      return `M ${cx - 104} ${headY + 8} q -10 -134 104 -134 q 116 0 104 134 q -30 -68 -70 -70 q -14 40 -46 46 q -10 -8 -18 -2 q -38 6 -74 26 z`;
  }
}

function hairBack(c: CharSpec, g: string): string {
  const fillG = `url(#${g}_hsG)`;
  const st = ink(LW);
  switch (c.hairStyle) {
    case "long":
    case "wavy":
      return `<path d="M ${cx - 106} ${headY - 22} q -22 168 16 244 q 14 26 42 24 q -18 -40 -8 -78 q -16 26 -22 6 q 8 -40 4 -120 m 200 -76 q 22 168 -16 244 q -14 26 -42 24 q 18 -40 8 -78 q 16 26 22 6 q -8 -40 -4 -120 z" fill="${fillG}" ${st}/>`;
    case "short":
    case "spiky":
      return `<path d="M ${cx - 94} ${headY + 20} q -10 60 10 70 m 168 -70 q 10 60 -10 70" fill="none" stroke="${c.hairSh}" stroke-width="${LW2}" stroke-linecap="round"/>`;
    case "braid":
      return `
        <path d="M 180 310 Q 155 385 180 440" fill="none" stroke="${c.hairSh}" stroke-width="22" stroke-linecap="round"/>
        <path d="M 180 310 Q 155 385 180 440" fill="none" stroke="${c.hair}" stroke-width="16" stroke-linecap="round"/>
        <path d="M 180 432 L 165 470 L 180 465 L 195 470 Z" fill="#b71c1c" stroke="${INK}" stroke-width="2"/>
      `;
    case "topknot":
      return `<ellipse cx="${cx}" cy="${headY - 108}" rx="20" ry="24" fill="${fillG}" ${st}/>`;
    case "gache":
      return `<path d="M 100 190 C 80 100 280 100 260 190 C 290 160 290 80 180 80 C 70 80 70 160 100 190 Z" fill="#111111" stroke="${INK}" stroke-width="${LW}"/>`;
    case "sage":
      return `
        <path d="M 90 200 C 65 310 85 450 110 470" fill="none" stroke="${c.hairSh}" stroke-width="16" stroke-linecap="round"/>
        <path d="M 90 200 C 65 310 85 450 110 470" fill="none" stroke="${c.hair}" stroke-width="10" stroke-linecap="round"/>
        <path d="M 270 200 C 295 310 275 450 250 470" fill="none" stroke="${c.hairSh}" stroke-width="16" stroke-linecap="round"/>
        <path d="M 270 200 C 295 310 275 450 250 470" fill="none" stroke="${c.hair}" stroke-width="10" stroke-linecap="round"/>
      `;
    default:
      return "";
  }
}

function hairFront(c: CharSpec, g: string): string {
  const st = `stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round" stroke-linecap="round"`;
  const d = getHairFrontD(c.hairStyle);
  let crown = `<path d="${d}" fill="url(#${g}_hG)" ${st}/>`;

  if (c.hairStyle === "topknot") {
    crown += `<path d="M ${cx} ${headY - 110} q -2 36 0 60" fill="none" stroke="${c.hairSh}" stroke-width="3" opacity="0.5"/>`;
  } else if (c.hairStyle === "sage") {
    crown += `<path d="M ${cx} ${headY - 122} q -6 50 -2 80" fill="none" stroke="${c.hairSh}" stroke-width="3" opacity="0.5"/>`;
  }

  const hi =
    `<path d="M ${cx - 58} ${headY - 92} q 56 -26 116 4" fill="none" stroke="url(#${g}_hHi)" stroke-width="9" stroke-linecap="round" opacity="0.85"/>` +
    `<path d="M ${cx - 44} ${headY - 78} q 44 -16 88 2" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" opacity="0.55"/>`;
  return `${crown}${hi}`;
}

// ─────────────────────────────────────────────────────────
// 눈 그리기 모듈
// ─────────────────────────────────────────────────────────
function eye(e: Expr["eye"], x: number, mir: boolean, c: CharSpec, gid: string): string {
  const s = mir ? -1 : 1;
  const X = (d: number) => x + s * d;
  const y = headY + 10;
  const sc = c.eyeScale ?? 1;

  if (e === "smile") {
    return (
      `<path d="M ${X(-19)} ${y + 5} q 19 -22 38 0" fill="none" ${ink(6)}/>` +
      `<path d="M ${X(-13)} ${y + 9} q 13 7 26 0" fill="none" stroke="${INK}" stroke-width="2.5" opacity="0.5"/>`
    );
  }
  if (e === "wink") {
    return `<path d="M ${X(-19)} ${y + 5} q 19 -22 38 0" fill="none" ${ink(6)}/>`;
  }

  const rx = 15.5 * sc;
  const ry = (e === "wide" ? 23 : e === "angry" ? 15 : e === "sad" ? 17.5 : 20) * sc;
  const irisR = Math.min(rx - 1.5, ry - 2.5);
  const pupR = irisR * 0.42;

  const pupil =
    e === "love"
      ? `<path d="M ${x} ${y + irisR * 0.5} q -${pupR * 1.5} -${pupR * 1.3} -${pupR * 1.5} -${pupR * 0.2} q 0 -${pupR} ${pupR * 1.5} -${pupR * 0.6} q ${pupR * 1.5} -${pupR * 0.4} ${pupR * 1.5} ${pupR * 0.6} q 0 ${pupR * 1.1} -${pupR * 1.5} ${pupR * 1.3} z" fill="#3a0d1a"/>`
      : `<ellipse cx="${x}" cy="${y + 1}" rx="${pupR * 0.92}" ry="${pupR}" fill="#1a1018"/>`;

  const lashW = 5.5;
  const lid =
    e === "angry"
      ? `<path d="M ${X(-rx - 2)} ${y - 9} q ${s * (rx + 1)} -1 ${s * (2 * rx + 3)} 8" fill="none" ${ink(lashW)}/>`
      : e === "sad"
        ? `<path d="M ${X(-rx)} ${y - 7} q ${s * rx} 5 ${s * 2 * rx} -3" fill="none" ${ink(lashW - 1)}/>`
        : `<path d="M ${X(-rx - 1)} ${y - ry + 5} q ${s * (rx + 1)} -8 ${s * (2 * rx + 2)} 1" fill="none" ${ink(lashW)}/>`;

  const doubleEyelid = `<path d="M ${X(-rx * 0.8)} ${y - ry + 1} q ${s * rx * 0.8} -5 ${s * rx * 1.6} 2" fill="none" stroke="${c.skinSh}" stroke-width="2" opacity="0.85"/>`;

  const starHighlight =
    e === "love"
      ? `<path d="M ${X(-irisR * 0.45)} ${y - irisR * 0.45} l 1.5 4.5 l 4.5 1.5 l -4.5 1.5 l -1.5 4.5 l -1.5 -4.5 l -4.5 -1.5 l 4.5 -1.5 z" fill="#ffffff"/>`
      : "";

  const scleraColor = c.role === "devil" ? "#211026" : "#ffffff";

  return `
    <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${scleraColor}" stroke="${INK}" stroke-width="2.5"/>
    <clipPath id="${gid}_c"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/></clipPath>
    <g clip-path="url(#${gid}_c)">
      <path d="M ${x - rx - 2} ${y - ry - 2} h ${rx * 2 + 4} v ${ry * 0.65} q -${rx} ${ry * 0.2} -${rx * 2} 0 z" fill="${INK}" opacity="0.14"/>
      <circle cx="${x}" cy="${y + 1.5}" r="${irisR}" fill="url(#${gid}_i)"/>
      <circle cx="${x}" cy="${y + 1.5}" r="${irisR}" fill="none" stroke="${c.irisRim}" stroke-width="1.6" opacity="0.7"/>
      <ellipse cx="${x}" cy="${y + irisR * 0.45}" rx="${irisR * 0.6}" ry="${irisR * 0.35}" fill="#ffffff" opacity="0.25"/>
      <ellipse cx="${x - s * irisR * 0.2}" cy="${y + irisR * 0.5}" rx="${irisR * 0.4}" ry="${irisR * 0.2}" fill="${c.iris}" opacity="0.4"/>
      ${pupil}
      <circle cx="${X(-irisR * 0.4)}" cy="${y - irisR * 0.45}" r="${irisR * 0.34}" fill="#ffffff"/>
      <circle cx="${X(irisR * 0.45)}" cy="${y + irisR * 0.55}" r="${irisR * 0.16}" fill="#ffffff" opacity="0.85"/>
      <circle cx="${X(-irisR * 0.5)}" cy="${y + irisR * 0.2}" r="${irisR * 0.1}" fill="#ffffff" opacity="0.6"/>
      ${starHighlight}
      <path d="M ${x - rx} ${y + ry - 2} q ${rx} 4 ${2 * rx} 0" fill="none" stroke="${INK}" stroke-width="1.6" opacity="0.35"/>
    </g>
    ${doubleEyelid}
    ${lid}
  `;
}

// ─────────────────────────────────────────────────────────
// 눈썹 모듈
// ─────────────────────────────────────────────────────────
function brow(b: Expr["brow"], x: number, mir: boolean, c: CharSpec): string {
  const s = mir ? -1 : 1;
  const X = (d: number) => x + s * d;
  const y = headY - 28;
  const col = c.hairSh;

  if (c.role === "wuxia-grandmaster") {
    const d =
      b === "up"
        ? `M ${X(-18)} ${y - 4} q 18 -12 36 -6`
        : b === "down"
          ? `M ${X(-18)} ${y - 12} q 18 12 36 6`
          : b === "worry"
            ? `M ${X(-16)} ${y - 2} q 16 0 32 10`
            : `M ${X(-16)} ${y - 6} q 16 -6 32 0`;
    return (
      `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>` +
      `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`
    );
  }

  const d =
    b === "up"
      ? `M ${X(-15)} ${y + 4} q 15 -10 30 -2`
      : b === "down"
        ? `M ${X(-15)} ${y - 5} q 15 8 30 7`
        : b === "worry"
          ? `M ${X(-14)} ${y + 6} q 14 -5 28 5`
          : `M ${X(-14)} ${y + 1} q 14 -6 28 0`;
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round"/>`;
}

// ─────────────────────────────────────────────────────────
// 입 그리기 모듈
// ─────────────────────────────────────────────────────────
function mouth(m: Expr["mouth"], c: CharSpec, g: string): string {
  const y = headY + 58;
  const isFemale =
    c.gender === "female" ||
    ["princess", "hanbok-nangja", "hanbok-courtlady", "wuxia-swordswoman", "elf"].includes(c.role);

  const lipTint = isFemale
    ? `<ellipse cx="${cx}" cy="${y + 1}" rx="14" ry="5.5" fill="#ee6a85" opacity="0.45" filter="url(#${g}_blur)"/>`
    : "";

  const lipGloss = isFemale
    ? `<circle cx="${cx + 3.5}" cy="${y + 3}" r="1.5" fill="#ffffff" opacity="0.85"/>`
    : "";

  switch (m) {
    case "grin":
      return (
        lipTint +
        `<path d="M ${cx - 25} ${y - 3} q 25 34 50 0 q -25 7 -50 0 z" fill="#8a2a3c" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx - 19} ${y - 1} q 19 6 38 0 l 0 5 q -19 4 -38 0 z" fill="#ffffff"/>` +
        `<path d="M ${cx - 9} ${y + 13} q 9 8 18 0 z" fill="#d4596e"/>` +
        lipGloss
      );
    case "smile":
      return (
        lipTint +
        `<path d="M ${cx - 20} ${y} q 20 19 40 0" fill="none" ${ink(5)}/>` +
        `<path d="M ${cx - 13} ${y + 4} q 13 8 26 0 l 0 2 q -13 6 -26 0 z" fill="#ffffff" stroke="${INK}" stroke-width="1.4"/>` +
        lipGloss
      );
    case "frown":
      return `<path d="M ${cx - 17} ${y + 8} q 17 -16 34 0" fill="none" ${ink(5)}/>`;
    case "open":
      return (
        lipTint +
        `<ellipse cx="${cx}" cy="${y + 4}" rx="13" ry="17" fill="#8a2a3c" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx - 7} ${y + 13} q 7 9 14 0 z" fill="#d4596e"/>` +
        `<path d="M ${cx - 9} ${y - 9} q 9 -5 18 0 l 0 3 q -9 4 -18 0 z" fill="#ffffff"/>` +
        lipGloss
      );
    case "pout":
      return lipTint + `<path d="M ${cx - 13} ${y + 3} q 13 -10 26 0" fill="none" ${ink(5)}/>` + lipGloss;
    case "tongue":
      return (
        `<path d="M ${cx - 18} ${y - 2} q 18 24 36 0 q -18 6 -36 0 z" fill="#8a2a3c" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx - 8} ${y + 8} q 8 16 16 0 q -2 -3 -16 0 z" fill="#ee7a90" stroke="${INK}" stroke-width="2"/>`
      );
    default:
      return lipTint + `<path d="M ${cx - 15} ${y + 2} q 15 5 30 0" fill="none" ${ink(4.5)}/>` + lipGloss;
  }
}

// ─────────────────────────────────────────────────────────
// 장르별 의상 드로잉 모듈
// ─────────────────────────────────────────────────────────
function outfit(c: CharSpec, gid: string): string {
  const body = `<path d="M ${cx - 128} ${H} q 8 -120 128 -144 q 120 24 128 144 z" fill="url(#${gid}_o)" stroke="${INK}" stroke-width="${LW}"/>`;
  const shade = `<path d="M ${cx - 110} ${H} q 14 -96 90 -120 q -50 40 -54 120 z" fill="${c.outfitSh}" opacity="0.45"/>`;

  let detail = "";
  switch (c.role) {
    case "knight":
      detail = `
        <path d="M 52 480 Q 75 330 135 340 Q 115 410 95 480 Z" fill="#90a4ae" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 75 480 Q 92 350 125 355" fill="none" stroke="#ffd700" stroke-width="4"/>
        <path d="M 308 480 Q 285 330 225 340 Q 245 410 265 480 Z" fill="#90a4ae" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 285 480 Q 268 350 235 355" fill="none" stroke="#ffd700" stroke-width="4"/>
        <path d="M 130 336 Q 180 375 230 336 Q 180 322 130 336 Z" fill="#cfd8dc" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 180 355 L 180 480" stroke="${INK}" stroke-width="${LW2}"/>
        <circle cx="165" cy="390" r="3" fill="#ffffff" opacity="0.7"/>
        <circle cx="195" cy="390" r="3" fill="#ffffff" opacity="0.7"/>
        <circle cx="165" cy="430" r="3" fill="#ffffff" opacity="0.7"/>
        <circle cx="195" cy="430" r="3" fill="#ffffff" opacity="0.7"/>
        <path d="M 80 310 L 55 240 M 45 275 L 85 260" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
        <path d="M 55 240 L 45 220" stroke="#ffd700" stroke-width="12" stroke-linecap="round"/>
      `;
      break;
    case "princess":
      detail = `
        <path d="M 125 336 Q 180 385 235 336 L 260 480 L 100 480 Z" fill="url(#${gid}_skin)"/>
        <path d="M 125 336 Q 180 385 235 336" fill="none" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 115 355 Q 180 400 245 355 L 260 480 L 100 480 Z" fill="${c.outfit}" stroke="${INK}" stroke-width="${LW2}"/>
        <circle cx="90" cy="385" r="38" fill="${c.outfitSh}" stroke="${INK}" stroke-width="${LW2}"/>
        <circle cx="90" cy="385" r="28" fill="none" stroke="#ffd700" stroke-width="3"/>
        <circle cx="270" cy="385" r="38" fill="${c.outfitSh}" stroke="${INK}" stroke-width="${LW2}"/>
        <circle cx="270" cy="385" r="28" fill="none" stroke="#ffd700" stroke-width="3"/>
        <path d="M 140 325 Q 180 355 220 325" fill="none" stroke="#ffffff" stroke-width="8" stroke-dasharray="1 10" stroke-linecap="round"/>
        <path d="M 140 325 Q 180 355 220 325" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="1 10" stroke-linecap="round"/>
      `;
      break;
    case "wizard":
      detail = `
        <path d="M 115 336 C 90 370 135 400 180 400 C 225 400 270 370 245 336 C 215 355 145 355 115 336 Z" fill="${c.outfitSh}" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 180 365 L 180 385" stroke="${INK}" stroke-width="4"/>
        <circle cx="180" cy="388" r="8" fill="#00e5ff" stroke="${INK}" stroke-width="2"/>
        <path d="M 130 420 l 3 6 l 6 1 l -5 5 l 2 6 l -6 -3 l -6 3 l 2 -6 l -5 -5 l 6 -1 z" fill="#ffd54f"/>
        <path d="M 230 435 l 3 6 l 6 1 l -5 5 l 2 6 l -6 -3 l -6 3 l 2 -6 l -5 -5 l 6 -1 z" fill="#ffd54f"/>
        <path d="M 160 460 l 2 4 l 4 1 l -3 3 l 1 4 l -4 -2 l -4 2 l 1 -4 l -3 -3 l 4 -1 z" fill="#ffd54f"/>
      `;
      break;
    case "bard":
      detail = `
        <path d="M 125 330 C 135 348 145 348 155 330 C 165 348 175 348 185 330 C 195 348 205 348 215 330" fill="none" stroke="#eceff1" stroke-width="10" stroke-linecap="round"/>
        <path d="M 125 330 C 135 348 145 348 155 330 C 165 348 175 348 185 330 C 195 348 205 348 215 330" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <path d="M 85 336 L 275 480" stroke="#5d4037" stroke-width="12" stroke-linecap="round"/>
        <path d="M 85 336 L 275 480" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <path d="M 145 340 L 145 480 M 215 340 L 215 480" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 145 370 L 215 390 M 215 370 L 145 390 M 145 410 L 215 430 M 215 410 L 145 430" stroke="#ffca28" stroke-width="3" stroke-linecap="round"/>
      `;
      break;
    case "hanbok-doryeong":
      detail = `
        <path d="M 125 336 L 195 425 L 195 480 L 125 480 Z" fill="${c.outfit}" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 132 336 L 180 395" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
        <path d="M 132 336 L 180 395" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
        <rect x="172" y="388" width="12" height="12" rx="3" fill="#b71c1c" stroke="${INK}" stroke-width="2"/>
        <path d="M 178 400 Q 165 445 168 480" fill="none" stroke="#b71c1c" stroke-width="8" stroke-linecap="round"/>
        <path d="M 178 400 Q 165 445 168 480" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <path d="M 180 400 Q 192 455 186 480" fill="none" stroke="#b71c1c" stroke-width="6" stroke-linecap="round"/>
        <path d="M 180 400 Q 192 455 186 480" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
      `;
      break;
    case "hanbok-nangja":
      detail = `
        <path d="M 100 375 L 52 480 L 308 480 L 260 375 Z" fill="#d84315" stroke="${INK}" stroke-width="${LW}"/>
        <path d="M 122 336 L 180 375 L 238 336 L 270 380 L 90 380 Z" fill="#ffd54f" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 130 336 L 180 375" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
        <path d="M 130 336 L 180 375" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <rect x="174" y="368" width="11" height="11" rx="2.5" fill="#6a1b9a" stroke="${INK}" stroke-width="2"/>
        <path d="M 179 379 Q 194 435 188 480" fill="none" stroke="#6a1b9a" stroke-width="7" stroke-linecap="round"/>
        <path d="M 179 379 Q 194 435 188 480" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
      `;
      break;
    case "hanbok-yangban":
      detail = `
        <path d="M 125 336 L 195 420 L 195 480 L 125 480 Z" fill="${c.outfit}" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 135 336 L 180 390" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
        <path d="M 135 336 L 180 390" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M 180 390 Q 185 450 182 480" fill="none" stroke="#37474f" stroke-width="9" stroke-linecap="round"/>
        <path d="M 180 390 Q 185 450 182 480" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
      `;
      break;
    case "hanbok-king":
      detail = `
        <path d="M 125 336 L 180 395 M 235 336 L 180 395" fill="none" stroke="#ffd700" stroke-width="6"/>
        <circle cx="180" cy="425" r="30" fill="#ffd700" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 165 425 Q 180 410 195 425 Q 180 440 165 425 M 172 417 Q 180 425 188 417" fill="none" stroke="#b71c1c" stroke-width="2"/>
        <path d="M 100 475 Q 180 470 260 475" fill="none" stroke="#ffd700" stroke-width="6"/>
      `;
      break;
    case "hanbok-courtlady":
      detail = `
        <path d="M 100 375 L 52 480 L 308 480 L 260 375 Z" fill="#c62828" stroke="${INK}" stroke-width="${LW}"/>
        <path d="M 122 336 L 180 375 L 238 336 L 270 380 L 90 380 Z" fill="#004d40" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 130 336 L 180 375" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
        <path d="M 130 336 L 180 375" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <path d="M 75 425 L 90 480 H 60 Z" fill="#ffd54f" stroke="${INK}" stroke-width="2"/>
        <path d="M 285 425 L 270 480 H 300 Z" fill="#ffd54f" stroke="${INK}" stroke-width="2"/>
        <path d="M 180 375 Q 192 450 188 480" fill="none" stroke="#4a148c" stroke-width="8" stroke-linecap="round"/>
        <path d="M 180 375 Q 192 450 188 480" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
      `;
      break;
    case "hanbok-warrior":
      detail = `
        <path d="M 52 480 L 80 360 M 308 480 L 280 360" fill="none" stroke="#c62828" stroke-width="26" stroke-linecap="round"/>
        <rect x="110" y="425" width="140" height="22" fill="#0d47a1" stroke="${INK}" stroke-width="${LW2}"/>
        <rect x="170" y="418" width="20" height="36" rx="3.5" fill="#ffd700" stroke="${INK}" stroke-width="2"/>
        <path d="M 130 336 L 180 395" stroke="#424242" stroke-width="4"/>
      `;
      break;
    case "wuxia-swordsman":
      detail = `
        <path d="M 135 336 Q 180 365 225 336" stroke="${INK}" stroke-width="${LW2}" fill="none"/>
        <path d="M 142 336 L 180 375" stroke="#ffffff" stroke-width="6"/>
        <path d="M 90 336 L 270 480" stroke="#4e342e" stroke-width="16" stroke-linecap="round"/>
        <path d="M 90 336 L 270 480" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <rect x="170" y="395" width="18" height="24" rx="2.5" fill="#b0bec5" stroke="${INK}" stroke-width="2" transform="rotate(38 179 407)"/>
      `;
      break;
    case "wuxia-swordswoman":
      detail = `
        <path d="M 130 336 Q 180 375 230 336" fill="none" stroke="#ffffff" stroke-width="6"/>
        <rect x="120" y="435" width="120" height="18" fill="#f8bbd0" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 170 450 Q 155 478 152 480" stroke="#f8bbd0" stroke-width="10" stroke-linecap="round"/>
        <path d="M 170 450 Q 155 478 152 480" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
      `;
      break;
    case "wuxia-taoist":
      detail = `
        <circle cx="180" cy="405" r="26" fill="#ffffff" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 180 379 A 13 13 0 0 0 180 405 A 13 13 0 0 1 180 431 A 26 26 0 0 0 180 379" fill="#212121"/>
        <circle cx="180" cy="392" r="3.5" fill="#212121"/>
        <circle cx="180" cy="418" r="3.5" fill="#ffffff"/>
        <path d="M 125 336 Q 180 380 235 336" fill="none" stroke="#212121" stroke-width="5"/>
      `;
      break;
    case "wuxia-grandmaster":
      detail = `
        <path d="M 100 336 C 90 410 110 480 130 480" fill="none" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 260 336 C 270 410 250 480 230 480" fill="none" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 130 336 L 180 395 L 230 336" fill="none" stroke="#ffe082" stroke-width="5"/>
      `;
      break;
    case "elf":
      detail = `
        <path d="M 130 336 Q 155 375 180 380 Q 145 360 130 336 Z" fill="#81c784" stroke="${INK}" stroke-width="2"/>
        <path d="M 230 336 Q 205 375 180 380 Q 215 360 230 336 Z" fill="#81c784" stroke="${INK}" stroke-width="2"/>
        <path d="M 125 385 Q 180 425 235 385" fill="none" stroke="#ffd700" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M 125 385 Q 180 425 235 385" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
      `;
      break;
    case "devil":
      detail = `
        <path d="M 115 325 L 95 240 L 145 315 Z" fill="#b71c1c" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 245 325 L 265 240 L 215 315 Z" fill="#b71c1c" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M 65 342 L 50 315 L 75 336 L 62 295 L 85 330" fill="${c.outfitSh}" stroke="${INK}" stroke-width="2"/>
        <path d="M 295 342 L 310 315 L 285 336 L 298 295 L 275 330" fill="${c.outfitSh}" stroke="${INK}" stroke-width="2"/>
        <polygon points="180,380 196,400 180,420 164,400" fill="#ff1744" stroke="${INK}" stroke-width="2.2"/>
        <circle cx="180" cy="400" r="4" fill="#ffffff" opacity="0.8"/>
      `;
      break;
  }

  return `${body}${shade}${detail}`;
}

// ─────────────────────────────────────────────────────────
// 귀/귀밑머리 드로잉 모듈 (엘프 귀 대응)
// ─────────────────────────────────────────────────────────
function drawEars(c: CharSpec, g: string): string {
  if (c.role === "elf") {
    return `
      <path d="M ${cx - headRx + 12} ${headY + 30} Q ${cx - headRx - 45} ${headY - 25} ${cx - headRx + 2} ${headY + 8}" fill="url(#${g}_skin)" stroke="${INK}" stroke-width="${LW2}" stroke-linejoin="round"/>
      <path d="M ${cx - headRx + 5} ${headY + 20} Q ${cx - headRx - 25} ${headY - 5} ${cx - headRx - 2} ${headY + 12}" fill="none" stroke="${c.skinSh}" stroke-width="2.5" opacity="0.6"/>
      <path d="M ${cx + headRx - 12} ${headY + 30} Q ${cx + headRx + 45} ${headY - 25} ${cx + headRx - 2} ${headY + 8}" fill="url(#${g}_skin)" stroke="${INK}" stroke-width="${LW2}" stroke-linejoin="round"/>
      <path d="M ${cx + headRx - 5} ${headY + 20} Q ${cx + headRx + 25} ${headY - 5} ${cx + headRx + 2} ${headY + 12}" fill="none" stroke="${c.skinSh}" stroke-width="2.5" opacity="0.6"/>
    `;
  }
  return `
    <ellipse cx="${cx - headRx + 6}" cy="${headY + 20}" rx="12" ry="17" fill="url(#${g}_skin)" stroke="${INK}" stroke-width="${LW2}"/>
    <ellipse cx="${cx + headRx - 6}" cy="${headY + 20}" rx="12" ry="17" fill="url(#${g}_skin)" stroke="${INK}" stroke-width="${LW2}"/>
    <path d="M ${cx + headRx - 20} ${headY - 16} q 22 50 -2 92 q -8 14 -22 22 q 40 -2 56 -42 q 8 -40 -32 -72 z" fill="${c.skinSh}" opacity="0.3"/>
  `;
}

// ─────────────────────────────────────────────────────────
// 수염/흉터 등 얼굴 장식 모듈
// ─────────────────────────────────────────────────────────
function facialHair(c: CharSpec): string {
  const yMouth = headY + 58;
  if (c.role === "hanbok-yangban") {
    return `
      <path d="M ${cx - 18} ${yMouth - 12} q 18 10 36 0" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M ${cx - 12} ${yMouth + 12} q 12 28 24 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    `;
  }
  if (c.role === "wuxia-grandmaster") {
    return `
      <path d="M ${cx - 24} ${yMouth - 10} q 24 18 48 0" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
      <path d="M ${cx - 24} ${yMouth - 10} q 24 18 48 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M ${cx - 20} ${yMouth + 10} L ${cx} ${yMouth + 100} L ${cx + 20} ${yMouth + 10} Z" fill="#ffffff" stroke="${INK}" stroke-width="${LW2}"/>
      <path d="M ${cx - 10} ${yMouth + 25} L ${cx} ${yMouth + 90} L ${cx + 10} ${yMouth + 25}" fill="none" stroke="#cfd8dc" stroke-width="2"/>
    `;
  }
  return "";
}

// ─────────────────────────────────────────────────────────
// 장르별 머리 장식 모듈
// ─────────────────────────────────────────────────────────
function headAccessory(c: CharSpec): string {
  switch (c.role) {
    case "knight":
      return `
        <path d="M ${cx - 76} ${headY - 60} q 76 -20 152 0" fill="none" stroke="#ffd700" stroke-width="6" stroke-linecap="round"/>
        <polygon points="${cx},${headY - 72} ${cx + 10},${headY - 62} ${cx},${headY - 52} ${cx - 10},${headY - 62}" fill="#ff1744" stroke="${INK}" stroke-width="2"/>
      `;
    case "princess":
      return `
        <path d="M ${cx - 45} ${headY - 80} L ${cx - 25} ${headY - 105} L ${cx} ${headY - 120} L ${cx + 25} ${headY - 105} L ${cx + 45} ${headY - 80} Z" fill="#ffd700" stroke="${INK}" stroke-width="2.5"/>
        <path d="M ${cx - 45} ${headY - 80} Q ${cx} ${headY - 95} ${cx + 45} ${headY - 80}" fill="none" stroke="${INK}" stroke-width="2"/>
        <circle cx="${cx}" cy="${headY - 105}" r="5" fill="#e91e63" stroke="${INK}" stroke-width="1.5"/>
        <circle cx="${cx - 25}" cy="${headY - 95}" r="3.5" fill="#00e5ff" stroke="${INK}" stroke-width="1"/>
        <circle cx="${cx + 25}" cy="${headY - 95}" r="3.5" fill="#00e5ff" stroke="${INK}" stroke-width="1"/>
      `;
    case "wizard":
      return `
        <ellipse cx="${cx}" cy="${headY - 76}" rx="95" ry="18" fill="#3f51b5" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M ${cx - 60} ${headY - 82} Q ${cx - 40} ${headY - 180} ${cx - 10} ${headY - 210} Q ${cx + 50} ${headY - 160} ${cx + 60} ${headY - 82} Z" fill="#1a237e" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M ${cx - 56} ${headY - 88} Q ${cx} ${headY - 80} ${cx + 56} ${headY - 88}" fill="none" stroke="#ffd700" stroke-width="8"/>
        <path d="M ${cx - 15} ${headY - 150} l 3 6 l 6 1 l -5 5 l 2 6 l -6 -3 l -6 3 l 2 -6 l -5 -5 l 6 -1 z" fill="#ffeb3b"/>
        <path d="M ${cx + 20} ${headY - 120} l 2 4 l 4 1 l -3 3 l 1 4 l -4 -2 l -4 2 l 1 -4 l -3 -3 l 4 -1 z" fill="#ffeb3b"/>
      `;
    case "bard":
      return `
        <path d="M ${cx - 55} ${headY - 76} Q ${cx} ${headY - 110} ${cx + 55} ${headY - 76} Z" fill="#00796b" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M ${cx + 20} ${headY - 85} Q ${cx + 55} ${headY - 140} ${cx + 70} ${headY - 150}" fill="none" stroke="#d50000" stroke-width="8" stroke-linecap="round"/>
        <path d="M ${cx + 20} ${headY - 85} Q ${cx + 55} ${headY - 140} ${cx + 70} ${headY - 150}" fill="none" stroke="#ffeb3b" stroke-width="3" stroke-linecap="round"/>
      `;
    case "hanbok-doryeong":
      return `
        <ellipse cx="${cx}" cy="${headY - 66}" rx="108" ry="18" fill="#111111" stroke="${INK}" stroke-width="${LW2}" fill-opacity="0.95"/>
        <path d="M ${cx - 36} ${headY - 72} L ${cx - 28} ${headY - 145} L ${cx + 28} ${headY - 145} L ${cx + 36} ${headY - 72} Z" fill="#050505" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M ${cx - 32} ${headY - 60} Q ${cx} ${headY + 140} ${cx + 32} ${headY - 60}" fill="none" stroke="#e0f7fa" stroke-width="5" stroke-dasharray="1 8" stroke-linecap="round"/>
      `;
    case "hanbok-yangban":
      return `
        <path d="M ${cx - 42} ${headY - 66} L ${cx - 32} ${headY - 130} L ${cx - 15} ${headY - 115} L ${cx} ${headY - 140} L ${cx + 15} ${headY - 115} L ${cx + 32} ${headY - 130} L ${cx + 42} ${headY - 66} Z" fill="#212121" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M ${cx - 25} ${headY - 66} L ${cx - 15} ${headY - 110} L ${cx} ${headY - 95} L ${cx + 15} ${headY - 110} L ${cx + 25} ${headY - 66} Z" fill="#424242" stroke="${INK}" stroke-width="1.8"/>
      `;
    case "hanbok-king":
      return `
        <path d="M ${cx - 38} ${headY - 100} Q ${cx - 55} ${headY - 165} ${cx - 22} ${headY - 160} C ${cx - 12} ${headY - 150} ${cx - 12} ${headY - 115} ${cx - 12} ${headY - 100}" fill="#151515" stroke="${INK}" stroke-width="2"/>
        <path d="M ${cx + 38} ${headY - 100} Q ${cx + 55} ${headY - 165} ${cx + 22} ${headY - 160} C ${cx + 12} ${headY - 150} ${cx + 12} ${headY - 115} ${cx + 12} ${headY - 100}" fill="#151515" stroke="${INK}" stroke-width="2"/>
        <path d="M ${cx - 38} ${headY - 66} A 38 38 0 0 1 ${cx + 38} ${headY - 66} Z" fill="#111111" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M ${cx - 38} ${headY - 72} Q ${cx} ${headY - 78} ${cx + 38} ${headY - 72}" fill="none" stroke="#ffd700" stroke-width="3"/>
        <rect x="${cx - 8}" y="${headY - 90}" width="16" height="12" rx="2" fill="#ffd700" stroke="${INK}" stroke-width="1.5"/>
      `;
    case "hanbok-courtlady":
      return `
        <path d="M ${cx - 85} ${headY - 35} L ${cx - 115} ${headY - 35}" stroke="#ffd700" stroke-width="5" stroke-linecap="round"/>
        <circle cx="${cx - 118}" cy="${headY - 35}" r="5" fill="#d50000" stroke="${INK}" stroke-width="1"/>
        <path d="M ${cx + 85} ${headY - 35} L ${cx + 115} ${headY - 35}" stroke="#ffd700" stroke-width="5" stroke-linecap="round"/>
        <circle cx="${cx + 118}" cy="${headY - 35}" r="5" fill="#d50000" stroke="${INK}" stroke-width="1"/>
      `;
    case "hanbok-warrior":
      return `
        <ellipse cx="${cx}" cy="${headY - 66}" rx="100" ry="16" fill="#212121" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M ${cx - 40} ${headY - 70} C ${cx - 40} ${headY - 120} ${cx + 40} ${headY - 120} ${cx + 40} ${headY - 70} Z" fill="#37474f" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M ${cx} ${headY - 108} Q ${cx + 40} ${headY - 160} ${cx + 65} ${headY - 175}" fill="none" stroke="#00c853" stroke-width="6" stroke-linecap="round"/>
        <circle cx="${cx + 65}" cy="${headY - 175}" r="4" fill="#00e5ff"/>
        <path d="M ${cx} ${headY - 108} Q ${cx - 20} ${headY - 80} ${cx - 30} ${headY - 70}" fill="none" stroke="#d50000" stroke-width="4"/>
      `;
    case "wuxia-swordsman":
      return `
        <path d="M ${cx - 72} ${headY - 60} Q ${cx} ${headY - 70} ${cx + 72} ${headY - 60}" fill="none" stroke="#d50000" stroke-width="8" stroke-linecap="round"/>
      `;
    case "wuxia-swordswoman":
      return `
        <path d="M ${cx - 74} ${headY - 62} Q ${cx} ${headY - 72} ${cx + 74} ${headY - 62}" fill="none" stroke="#00e5ff" stroke-width="8" stroke-linecap="round"/>
      `;
    case "wuxia-taoist":
      return `
        <path d="M ${cx - 35} ${headY - 118} L ${cx + 35} ${headY - 118}" stroke="#8d6e63" stroke-width="5" stroke-linecap="round"/>
        <circle cx="${cx + 38}" cy="${headY - 118}" r="3" fill="#ffeb3b"/>
      `;
    case "elf":
      return `
        <path d="M ${cx - 74} ${headY - 66} Q ${cx} ${headY - 76} ${cx + 74} ${headY - 66}" fill="none" stroke="#cfd8dc" stroke-width="4"/>
        <polygon points="${cx},${headY - 82} ${cx + 6},${headY - 74} ${cx},${headY - 66} ${cx - 6},${headY - 74}" fill="#00e5ff" stroke="${INK}" stroke-width="1.5"/>
      `;
    case "devil":
      return `
        <path d="M ${cx - 50} ${headY - 82} Q ${cx - 95} ${headY - 140} ${cx - 80} ${headY - 170} Q ${cx - 65} ${headY - 130} ${cx - 35} ${headY - 88} Z" fill="#b71c1c" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M ${cx + 50} ${headY - 82} Q ${cx + 95} ${headY - 140} ${cx + 80} ${headY - 170} Q ${cx + 65} ${headY - 130} ${cx + 35} ${headY - 88} Z" fill="#b71c1c" stroke="${INK}" stroke-width="${LW2}"/>
        <path d="M ${cx - 65} ${headY - 115} Q ${cx - 72} ${headY - 145} ${cx - 74} ${headY - 150}" fill="none" stroke="#7f0000" stroke-width="2"/>
        <path d="M ${cx + 65} ${headY - 115} Q ${cx + 72} ${headY - 145} ${cx + 74} ${headY - 150}" fill="none" stroke="#7f0000" stroke-width="2"/>
      `;
    default:
      return "";
  }
}

// ─────────────────────────────────────────────────────────
// 표정 부가물 (홍조/눈물/분노/반짝임/땀방울)
// ─────────────────────────────────────────────────────────
function extras(e: Expr, c: CharSpec, g: string): string {
  let s = "";
  if (e.blush) {
    const op = e.blush === "strong" ? 0.85 : 0.65;
    const w = e.blush === "strong" ? 22 : 18;
    const h = e.blush === "strong" ? 14 : 10;
    s +=
      `<g opacity="${op}">` +
      `<ellipse cx="${cx - 58}" cy="${headY + 32}" rx="${w}" ry="${h}" fill="url(#${g}_blushG)"/>` +
      `<ellipse cx="${cx + 58}" cy="${headY + 32}" rx="${w}" ry="${h}" fill="url(#${g}_blushG)"/>`;
    if (e.blush === "strong") {
      s +=
        `<g stroke="#ff6a80" stroke-width="2" stroke-linecap="round" opacity="0.95">` +
        `<path d="M ${cx - 66} ${headY + 28} l -3 8"/><path d="M ${cx - 58} ${headY + 28} l -3 8"/><path d="M ${cx - 50} ${headY + 28} l -3 8"/>` +
        `<path d="M ${cx + 50} ${headY + 28} l -3 8"/><path d="M ${cx + 58} ${headY + 28} l -3 8"/><path d="M ${cx + 66} ${headY + 28} l -3 8"/></g>`;
    }
    s += `</g>`;
  }
  if (e.tears) {
    s +=
      `<g fill="#9fd8ff" stroke="${INK}" stroke-width="1.6">` +
      `<path d="M ${cx - 64} ${headY + 24} q -6 30 4 46 q 12 -16 6 -46 z"/>` +
      `<path d="M ${cx + 64} ${headY + 24} q 6 30 -4 46 q -12 -16 -6 -46 z"/></g>` +
      `<ellipse cx="${cx - 60}" cy="${headY + 30}" rx="4" ry="6" fill="#dff2ff" opacity="0.9"/>`;
  }
  if (e.anger) {
    s +=
      `<g stroke="#e23b4e" stroke-width="5" stroke-linecap="round">` +
      `<path d="M ${cx + 52} ${headY - 56} h 24"/><path d="M ${cx + 64} ${headY - 68} v 24"/>` +
      `<path d="M ${cx + 56} ${headY - 64} l 16 16"/><path d="M ${cx + 72} ${headY - 64} l -16 16"/></g>`;
  }
  if (e.sweat) {
    s +=
      `<path d="M ${cx + 72} ${headY - 30} q -8 18 0 28 q 14 -6 8 -22 q -3 -6 -8 -6 z" fill="#bfe6ff" stroke="${INK}" stroke-width="2"/>` +
      `<ellipse cx="${cx + 73}" cy="${headY - 16}" rx="2.5" ry="4" fill="#ffffff" opacity="0.85"/>`;
  }
  if (e.sparkle) {
    s +=
      `<g fill="#ffd76a" stroke="${INK}" stroke-width="1.5">` +
      `<path d="M ${cx - 96} ${headY - 66} l 5 12 l 12 5 l -12 5 l -5 12 l -5 -12 l -12 -5 l 12 -5 z"/>` +
      `<path d="M ${cx + 98} ${headY + 6} l 4 10 l 10 4 l -10 4 l -4 10 l -4 -10 l -10 -4 l 10 -4 z"/>` +
      `<circle cx="${cx + 88}" cy="${headY - 50}" r="3"/><circle cx="${cx - 88}" cy="${headY + 24}" r="2.5"/></g>`;
  }
  return s;
}

// ─────────────────────────────────────────────────────────
// 얼굴 외곽 드로잉 모듈
// ─────────────────────────────────────────────────────────
function faceOutline(c: CharSpec, g: string): string {
  const d = getFacePath();
  return `<path d="${d}" fill="url(#${g}_skin)" stroke="${INK}" stroke-width="${LW}"/>`;
}

// ─────────────────────────────────────────────────────────
// 조립 및 빌드
// ─────────────────────────────────────────────────────────
function build(c: CharSpec, e: Expr): string {
  const g = `genre_${c.id.replace(/-/g, "_")}_${e.id}`;
  const lid = `${g}_L`;
  const rid = `${g}_R`;
  const chin = headY + headRy + 12;

  const nose = `
    <path d="M ${cx - 1} ${headY + 14} v 13" fill="none" stroke="${c.skinSh}" stroke-width="2.5" opacity="0.5" filter="url(#${g}_blur)"/>
    <path d="M ${cx - 3.5} ${headY + 26} q 3.5 4.5 7 0" fill="none" stroke="${c.skinSh}" stroke-width="4.5" opacity="0.65" filter="url(#${g}_blur)"/>
    <path d="M ${cx - 2.5} ${headY + 25} q 2.5 3.5 5 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
  `;

  const isFemale =
    c.gender === "female" ||
    ["princess", "hanbok-nangja", "hanbok-courtlady", "wuxia-swordswoman", "elf"].includes(c.role);
  const generalSkinWarmth = isFemale
    ? `<ellipse cx="${cx - 58}" cy="${headY + 34}" rx="14" ry="6" fill="url(#${g}_blushG)" opacity="0.3"/>` +
      `<ellipse cx="${cx + 58}" cy="${headY + 34}" rx="14" ry="6" fill="url(#${g}_blushG)" opacity="0.3"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<defs>
  ${getGradients(c, g, lid, rid)}
  <clipPath id="${g}_face_clip">
    <path d="${getFacePath()}"/>
  </clipPath>
</defs>
<g filter="url(#${g}_rimGlow)">
  ${outfit(c, g)}
  
  <!-- 목 (neck) -->
  <path d="M ${cx - 30} ${chin - 30} h 60 v 26 q -30 18 -60 0 z" fill="url(#${g}_skin)" stroke="${INK}" stroke-width="${LW2}"/>
  <!-- 턱 밑 목 그림자 -->
  <path d="M ${cx - 45} ${chin - 28} q 45 16 90 0 v 14 q -45 12 -90 0 z" fill="${c.skinSh}" opacity="0.75" filter="url(#${g}_blur)"/>
  
  ${hairBack(c, g)}
  ${faceOutline(c, g)}
  
  <!-- 앞머리 그림자 (클립) -->
  <g clip-path="url(#${g}_face_clip)">
    <path d="${getHairFrontD(c.hairStyle)}" fill="${c.hairSh}" opacity="0.32" transform="translate(0, 10)" filter="url(#${g}_blur)"/>
  </g>
  
  ${drawEars(c, g)}
  
  ${generalSkinWarmth}
  ${extras(e, c, g)}
  ${eye(e.eye, cx - 44, false, c, lid)}
  ${eye(e.eye, cx + 44, true, c, rid)}
  ${brow(e.brow, cx - 44, false, c)}
  ${brow(e.brow, cx + 44, true, c)}
  ${nose}
  ${facialHair(c)}
  ${mouth(e.mouth, c, g)}
  ${hairFront(c, g)}
  ${headAccessory(c)}
</g>
</svg>`;
}

// ─────────────────────────────────────────────────────────
// 최종 라이브러리 수출 (GENRE_CHARACTERS)
// ─────────────────────────────────────────────────────────
export const GENRE_CHARACTERS: CharacterAsset[] = CHARS.map((c) => ({
  id: c.id,
  label: c.label,
  emoji: c.emoji,
  width: 360,
  height: 480,
  expressions: EXPRS.map((e) => ({
    id: e.id,
    label: e.label,
    svg: build(c, e),
  })),
}));
