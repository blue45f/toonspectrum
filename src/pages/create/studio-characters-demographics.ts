// 연령대별 다양한 캐릭터 에셋 패키지 (노인, 중년, 성인, 청소년, 어린이, 아기)
// studio-characters.ts 의 CharacterAsset 계약을 준수합니다.
import type { CharacterAsset } from "./studio-characters";

const W = 360;
const H = 480;
const INK = "#241b29"; // 외곽선 색상
const LW = 4.5; // 외곽선 두께
const LW2 = 3; // 내부선 두께
const cx = 180; // 캐릭터 가로 중심선

// ─────────────────────────────────────────────────────────
// 표정 데이터 타입 및 정의
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
// 연령대 및 캐릭터 정보 인터페이스
// ─────────────────────────────────────────────────────────
interface CharSpec {
  id: string;
  label: string;
  emoji: string;
  ageGroup: "baby" | "child" | "teen" | "adult" | "middle" | "elderly";
  gender: "male" | "female";
  skin: string;
  skinSh: string;
  hair: string;
  hairSh: string;
  hairHi: string;
  hairStyle: "short" | "bob" | "long" | "twin" | "spiky" | "elderly-bun" | "balding" | "baby";
  iris: string;
  irisRim: string;
  outfit: string;
  outfitSh: string;
  accent: string;
  collar: string;
  eyeScale?: number;
  hasGlasses?: boolean;
  hasBeard?: "mustache" | "full";
}

const CHAR_SPECS: CharSpec[] = [
  {
    id: "demo-grandpa-mansu",
    label: "할아버지 만수",
    emoji: "👴",
    ageGroup: "elderly",
    gender: "male",
    skin: "#f3ccb5",
    skinSh: "#db9e76",
    hair: "#ececec",
    hairSh: "#c8c8c8",
    hairHi: "#ffffff",
    hairStyle: "balding",
    iris: "#4a3526",
    irisRim: "#1f140c",
    outfit: "#5d4037",
    outfitSh: "#3e2723",
    accent: "#d7ccc8",
    collar: "#f5f5f5",
    hasBeard: "mustache",
    eyeScale: 0.8
  },
  {
    id: "demo-grandma-chunja",
    label: "할머니 춘자",
    emoji: "👵",
    ageGroup: "elderly",
    gender: "female",
    skin: "#ffe9db",
    skinSh: "#f5bf9f",
    hair: "#e0e0e0",
    hairSh: "#bebebe",
    hairHi: "#ffffff",
    hairStyle: "elderly-bun",
    iris: "#3a4a5e",
    irisRim: "#1f2a38",
    outfit: "#4a148c",
    outfitSh: "#311b92",
    accent: "#ffffff",
    collar: "#f3e5f5",
    eyeScale: 0.82
  },
  {
    id: "demo-elderly-glass-youngsu",
    label: "안경 어르신 영수",
    emoji: "👴",
    ageGroup: "elderly",
    gender: "male",
    skin: "#eed2ba",
    skinSh: "#d6ab8c",
    hair: "#e5e5e5",
    hairSh: "#b5b5b5",
    hairHi: "#ffffff",
    hairStyle: "short",
    iris: "#54463a",
    irisRim: "#2d221b",
    outfit: "#1e3a8a",
    outfitSh: "#172554",
    accent: "#ffd76a",
    collar: "#eff6ff",
    hasGlasses: true,
    eyeScale: 0.8
  },
  {
    id: "demo-grandpa-beard-deoksu",
    label: "수염 할아버지 덕수",
    emoji: "👴",
    ageGroup: "elderly",
    gender: "male",
    skin: "#ecc499",
    skinSh: "#d6a674",
    hair: "#eaeaea",
    hairSh: "#bebebe",
    hairHi: "#ffffff",
    hairStyle: "balding",
    iris: "#2e2014",
    irisRim: "#1c0f0a",
    outfit: "#37474f",
    outfitSh: "#263238",
    accent: "#cfd8dc",
    collar: "#eceff1",
    hasBeard: "full",
    eyeScale: 0.78
  },
  {
    id: "demo-middle-man-seongsik",
    label: "중년 남성 성식",
    emoji: "🧔",
    ageGroup: "middle",
    gender: "male",
    skin: "#f0c79c",
    skinSh: "#dba978",
    hair: "#2b2724",
    hairSh: "#14110f",
    hairHi: "#5a5047",
    hairStyle: "short",
    iris: "#4e342e",
    irisRim: "#271714",
    outfit: "#2e7d32",
    outfitSh: "#1b5e20",
    accent: "#a5d6a7",
    collar: "#e8f5e9",
    hasBeard: "mustache",
    eyeScale: 0.86
  },
  {
    id: "demo-middle-woman-mikyeong",
    label: "중년 여성 미경",
    emoji: "👩",
    ageGroup: "middle",
    gender: "female",
    skin: "#ffe8dc",
    skinSh: "#f6c3a5",
    hair: "#3e2723",
    hairSh: "#271714",
    hairHi: "#6d4c41",
    hairStyle: "bob",
    iris: "#5d4037",
    irisRim: "#3e2723",
    outfit: "#c2185b",
    outfitSh: "#880e4f",
    accent: "#f8bbd0",
    collar: "#fce4ec",
    eyeScale: 0.88
  },
  {
    id: "demo-adult-man-minjun",
    label: "성인 남성 민준",
    emoji: "🧑",
    ageGroup: "adult",
    gender: "male",
    skin: "#ffebd6",
    skinSh: "#e4bd9d",
    hair: "#232d3d",
    hairSh: "#141b25",
    hairHi: "#51627c",
    hairStyle: "short",
    iris: "#1e2c41",
    irisRim: "#0d131a",
    outfit: "#2c3e50",
    outfitSh: "#1a252f",
    accent: "#ffffff",
    collar: "#ffffff",
    eyeScale: 0.95
  },
  {
    id: "demo-adult-woman-seohyeon",
    label: "성인 여성 서현",
    emoji: "👩",
    ageGroup: "adult",
    gender: "female",
    skin: "#ffe3ca",
    skinSh: "#f4c6a0",
    hair: "#bc6c46",
    hairSh: "#8e4a2b",
    hairHi: "#e7a17f",
    hairStyle: "long",
    iris: "#caa45a",
    irisRim: "#7a5326",
    outfit: "#f3a6c4",
    outfitSh: "#dd7ea6",
    accent: "#ffffff",
    collar: "#fff4f8",
    eyeScale: 1.05
  },
  {
    id: "demo-teen-boy-junwoo",
    label: "청소년 남 준우",
    emoji: "👦",
    ageGroup: "teen",
    gender: "male",
    skin: "#f1cda7",
    skinSh: "#ddaf83",
    hair: "#1c1c1c",
    hairSh: "#0a0a0a",
    hairHi: "#3d3d3d",
    hairStyle: "spiky",
    iris: "#34495e",
    irisRim: "#1f2d3d",
    outfit: "#2f3a55",
    outfitSh: "#1f293f",
    accent: "#d24a5a",
    collar: "#ffffff",
    eyeScale: 1.0
  },
  {
    id: "demo-teen-girl-jiwoo",
    label: "청소년 여 지우",
    emoji: "👧",
    ageGroup: "teen",
    gender: "female",
    skin: "#ffe7d6",
    skinSh: "#f7d0b6",
    hair: "#23314e",
    hairSh: "#14203a",
    hairHi: "#4f648c",
    hairStyle: "twin",
    iris: "#3a5286",
    irisRim: "#1f3258",
    outfit: "#2f3a55",
    outfitSh: "#1f293f",
    accent: "#d24a5a",
    collar: "#ffffff",
    eyeScale: 1.05
  },
  {
    id: "demo-child-boy-doyun",
    label: "남자아이 도윤",
    emoji: "🧒",
    ageGroup: "child",
    gender: "male",
    skin: "#ffe6cf",
    skinSh: "#f5cbab",
    hair: "#5a4634",
    hairSh: "#2e2014",
    hairHi: "#7c6450",
    hairStyle: "short",
    iris: "#543d2b",
    irisRim: "#2d1f14",
    outfit: "#e0a93b",
    outfitSh: "#c38f22",
    accent: "#ffffff",
    collar: "#fff8ec",
    eyeScale: 1.15
  },
  {
    id: "demo-child-girl-harin",
    label: "여자아이 하린",
    emoji: "🧒",
    ageGroup: "child",
    gender: "female",
    skin: "#fff1e5",
    skinSh: "#ebc5aa",
    hair: "#b06a3e",
    hairSh: "#8a4e2b",
    hairHi: "#e0a06a",
    hairStyle: "bob",
    iris: "#caa45a",
    irisRim: "#7a5326",
    outfit: "#8fd0e6",
    outfitSh: "#69b3cf",
    accent: "#ffffff",
    collar: "#eafaff",
    eyeScale: 1.18
  },
  {
    id: "demo-baby-yejun",
    label: "유아 예준",
    emoji: "👶",
    ageGroup: "baby",
    gender: "male",
    skin: "#fff5eb",
    skinSh: "#fcdbc1",
    hair: "#a88262",
    hairSh: "#826044",
    hairHi: "#caa080",
    hairStyle: "baby",
    iris: "#6b4e3a",
    irisRim: "#3a281c",
    outfit: "#ffe0b2",
    outfitSh: "#ffb74d",
    accent: "#ff8a9c",
    collar: "#fff3e0",
    eyeScale: 1.25
  }
];

// ─────────────────────────────────────────────────────────
// 유틸리티 함수
// ─────────────────────────────────────────────────────────
const ink = (w = LW) => `stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

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

// 얼굴 실루엣 패스 계산 (연령대에 따른 턱선/볼 윤곽 제어)
function getFacePath(rx: number, ry: number, hy: number, ageGroup: string): string {
  const tx = rx;
  const top = hy - ry + 4;
  const browTemple = hy - 18;
  const cheek = hy + 20;

  if (ageGroup === "baby") {
    const jaw = hy + 40;
    const chin = hy + ry + 4;
    return `M ${cx} ${top} ` +
      `C ${cx + tx * 0.7} ${top} ${cx + tx} ${browTemple - 20} ${cx + tx} ${browTemple} ` +
      `C ${cx + tx} ${cheek} ${cx + tx * 0.9} ${jaw - 10} ${cx + tx - 12} ${jaw} ` +
      `C ${cx + tx - 24} ${jaw + 20} ${cx + 20} ${chin} ${cx} ${chin} ` +
      `C ${cx - 20} ${chin} ${cx - tx + 24} ${jaw + 20} ${cx - tx + 12} ${jaw} ` +
      `C ${cx - tx * 0.9} ${jaw - 10} ${cx - tx} ${cheek} ${cx - tx} ${browTemple} ` +
      `C ${cx - tx} ${browTemple - 20} ${cx - tx * 0.7} ${top} ${cx} ${top} Z`;
  }

  if (ageGroup === "child") {
    const jaw = hy + 50;
    const chin = hy + ry + 8;
    return `M ${cx} ${top} ` +
      `C ${cx + tx * 0.7} ${top} ${cx + tx} ${browTemple - 25} ${cx + tx} ${browTemple} ` +
      `C ${cx + tx} ${cheek} ${cx + tx - 4} ${jaw - 15} ${cx + tx - 18} ${jaw} ` +
      `C ${cx + tx - 32} ${jaw + 22} ${cx + 22} ${chin - 2} ${cx} ${chin} ` +
      `C ${cx - 22} ${chin - 2} ${cx - tx + 32} ${jaw + 22} ${cx - tx + 18} ${jaw} ` +
      `C ${cx - tx + 4} ${jaw - 15} ${cx - tx} ${cheek} ${cx - tx} ${browTemple} ` +
      `C ${cx - tx} ${browTemple - 25} ${cx - tx * 0.7} ${top} ${cx} ${top} Z`;
  }

  if (ageGroup === "middle" || ageGroup === "elderly") {
    const jaw = hy + 66;
    const chin = hy + ry + 12;
    return `M ${cx} ${top} ` +
      `C ${cx + tx * 0.7} ${top} ${cx + tx} ${browTemple - 30} ${cx + tx} ${browTemple} ` +
      `C ${cx + tx} ${cheek + 5} ${cx + tx - 4} ${jaw - 15} ${cx + tx - 22} ${jaw} ` +
      `C ${cx + tx - 40} ${jaw + 28} ${cx + 26} ${chin - 6} ${cx} ${chin} ` +
      `C ${cx - 26} ${chin - 6} ${cx - tx + 40} ${jaw + 28} ${cx - tx + 22} ${jaw} ` +
      `C ${cx - tx + 4} ${jaw - 15} ${cx - tx} ${cheek + 5} ${cx - tx} ${browTemple} ` +
      `C ${cx - tx} ${browTemple - 30} ${cx - tx * 0.7} ${top} ${cx} ${top} Z`;
  }

  // 성인 / 청소년
  const jaw = hy + 64;
  const chin = hy + ry + 12;
  return `M ${cx} ${top} ` +
    `C ${cx + tx * 0.7} ${top} ${cx + tx} ${browTemple - 30} ${cx + tx} ${browTemple} ` +
    `C ${cx + tx} ${cheek} ${cx + tx - 8} ${jaw - 18} ${cx + tx - 26} ${jaw} ` +
    `C ${cx + tx - 44} ${jaw + 26} ${cx + 26} ${chin - 6} ${cx} ${chin} ` +
    `C ${cx - 26} ${chin - 6} ${cx - tx + 44} ${jaw + 26} ${cx - tx + 26} ${jaw} ` +
    `C ${cx - tx + 8} ${jaw - 18} ${cx - tx} ${cheek} ${cx - tx} ${browTemple} ` +
    `C ${cx - tx} ${browTemple - 30} ${cx - tx * 0.7} ${top} ${cx} ${top} Z`;
}

// ─────────────────────────────────────────────────────────
// 헤어 앞/뒤 그리기 함수
// ─────────────────────────────────────────────────────────
function getHairFrontD(style: string, hy: number): string {
  switch (style) {
    case "spiky":
      return `M ${cx - 100} ${hy - 8} l 16 -64 l 20 44 l 18 -70 l 24 56 l 20 -64 l 22 66 l 20 -50 l 18 60 l 16 -34 l 12 50 q -110 -38 -206 0 z`;
    case "short":
      return `M ${cx - 102} ${hy + 4} q -14 -126 102 -126 q 116 0 102 126 q -30 -60 -68 -66 q -10 42 -38 46 q -8 -36 -30 -32 q -44 4 -68 52 z`;
    case "twin":
      return `M ${cx - 104} ${hy - 2} q -10 -130 104 -130 q 114 0 104 130 q -36 -66 -88 -66 q -16 38 -46 42 q -6 -8 -14 -2 q -40 0 -64 90 z`;
    case "elderly-bun":
      return `M ${cx - 102} ${hy + 4} q -14 -126 102 -126 q 116 0 102 126 q -30 -50 -50 -60 q -10 20 -20 20 q -10 -20 -32 10 q -34 10 -52 30 z`;
    case "balding":
      return `M ${cx - 96} ${hy + 10} L ${cx - 86} ${hy + 80} L ${cx - 76} ${hy + 80} Z M ${cx + 96} ${hy + 10} L ${cx + 86} ${hy + 80} L ${cx + 76} ${hy + 80} Z`;
    case "baby":
      return "";
    default: // bob / long
      return `M ${cx - 104} ${hy + 8} q -10 -134 104 -134 q 116 0 104 134 q -30 -68 -70 -70 q -14 40 -46 46 q -10 -8 -18 -2 q -38 6 -74 26 z`;
  }
}

function hairBack(c: CharSpec, g: string, hy: number, ry: number): string {
  const st = `stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round" stroke-linecap="round"`;
  const fillG = `url(#${g}_hsG)`;
  switch (c.hairStyle) {
    case "long":
      return `<path d="M ${cx - 106} ${hy - 22} q -22 168 16 244 q 14 26 42 24 q -18 -40 -8 -78 q -16 26 -22 6 q 8 -40 4 -120 m 200 -76 q 22 168 -16 244 q -14 26 -42 24 q 18 -40 8 -78 q 16 26 22 6 q -8 -40 -4 -120 z" fill="${fillG}" ${st}/>`;
    case "twin":
      return `<g fill="${fillG}" ${st}>` +
        `<path d="M ${cx - 96} ${hy + 14} q -34 18 -30 70 q 2 40 26 56 q 12 -10 6 -30 q 18 -6 16 -30 q 8 -20 -4 -40 q 6 -18 -14 -26 z"/>` +
        `<path d="M ${cx + 96} ${hy + 14} q 34 18 30 70 q -2 40 -26 56 q -12 -10 -6 -30 q -18 -6 -16 -30 q -8 -20 4 -40 q -6 -18 14 -26 z"/></g>`;
    case "elderly-bun":
      return `<circle cx="${cx}" cy="${hy - ry - 10}" r="32" fill="${fillG}" ${st}/>`;
    case "balding":
      return `<path d="M ${cx - 92} ${hy + 10} q -30 30 -16 70 q 8 30 20 20 q -10 -30 -4 -90 Z 
                       M ${cx + 92} ${hy + 10} q 25 30 16 70 q -8 30 -20 20 q 10 -30 4 -90 Z" fill="${fillG}" ${st}/>`;
    case "baby":
      return "";
    default:
      return "";
  }
}

function hairFront(c: CharSpec, g: string, hy: number, ry: number): string {
  if (c.hairStyle === "baby") {
    return `
      <path d="M ${cx} ${hy - ry + 4} q 10 -20 20 -14 q 10 6 2 -12 q -10 8 -16 22 Z" fill="${c.hair}" stroke="${INK}" stroke-width="3"/>
      <path d="M ${cx - 15} ${hy - ry + 15} q -10 -15 -25 -10 q 5 15 20 8 Z" fill="${c.hair}" stroke="${INK}" stroke-width="3"/>
    `;
  }

  const st = `stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round" stroke-linecap="round"`;
  const d = getHairFrontD(c.hairStyle, hy);
  let crown = `<path d="${d}" fill="url(#${g}_hG)" ${st}/>`;

  if (c.hairStyle === "balding") {
    crown = `
      <path d="M ${cx - 94} ${hy - 10} q -18 35 -10 75 q 10 20 18 -10 q -8 -40 -8 -65 Z" fill="url(#${g}_hG)" ${st}/>
      <path d="M ${cx + 94} ${hy - 10} q 18 35 10 75 q -10 20 -18 -10 q 8 -40 8 -65 Z" fill="url(#${g}_hG)" ${st}/>
    `;
  }

  let hi = "";
  if (c.hairStyle !== "balding") {
    hi = `<path d="M ${cx - 58} ${hy - ry + 20} q 56 -26 116 4" fill="none" stroke="url(#${g}_hHi)" stroke-width="9" stroke-linecap="round" opacity="0.85"/>` +
         `<path d="M ${cx - 44} ${hy - ry + 34} q 44 -16 88 2" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" opacity="0.55"/>`;
  }
  return `${crown}${hi}`;
}

// ─────────────────────────────────────────────────────────
// 눈 그리기 함수
// ─────────────────────────────────────────────────────────
function eye(e: Expr["eye"], x: number, mir: boolean, c: CharSpec, gid: string, hy: number): string {
  const s = mir ? -1 : 1;
  const X = (d: number) => x + s * d;
  const y = hy + 10;
  
  let sc = c.eyeScale ?? 1.0;
  if (c.ageGroup === "baby") sc *= 1.3;
  else if (c.ageGroup === "child") sc *= 1.15;
  else if (c.ageGroup === "teen") sc *= 1.0;
  else if (c.ageGroup === "middle") sc *= 0.85;
  else if (c.ageGroup === "elderly") sc *= 0.78;

  if (e === "smile") {
    return `<path d="M ${X(-19 * sc)} ${y + 5 * sc} q ${19 * sc * s} ${-22 * sc} ${38 * sc * s} 0" fill="none" ${ink(6 * sc)}/>` +
      `<path d="M ${X(-13 * sc)} ${y + 9 * sc} q ${13 * sc * s} ${7 * sc} ${26 * sc * s} 0" fill="none" stroke="${INK}" stroke-width="${2.5 * sc}" opacity="0.5"/>`;
  }
  if (e === "wink") {
    return `<path d="M ${X(-19 * sc)} ${y + 5 * sc} q ${19 * sc * s} ${-22 * sc} ${38 * sc * s} 0" fill="none" ${ink(6 * sc)}/>`;
  }

  const rx = 15.5 * sc;
  const ry = (e === "wide" ? 23 : e === "angry" ? 15 : e === "sad" ? 17.5 : 20) * sc;
  const irisR = Math.min(rx - 1.5, ry - 2.5);
  const pupR = irisR * 0.42;

  const pupil = e === "love"
    ? `<path d="M ${x} ${y + irisR * 0.5} q -${pupR * 1.5} -${pupR * 1.3} -${pupR * 1.5} -${pupR * 0.2} q 0 -${pupR} ${pupR * 1.5} -${pupR * 0.6} q ${pupR * 1.5} -${pupR * 0.4} ${pupR * 1.5} ${pupR * 0.6} q 0 ${pupR * 1.1} -${pupR * 1.5} ${pupR * 1.3} z" fill="#3a0d1a"/>`
    : `<ellipse cx="${x}" cy="${y + 1}" rx="${pupR * 0.92}" ry="${pupR}" fill="#1a1018"/>`;

  const lashW = c.gender === "female" ? 6.5 : 5.0;
  const lid =
    e === "angry"
      ? `<path d="M ${X(-rx - 2)} ${y - 9} q ${s * (rx + 1)} -1 ${s * (2 * rx + 3)} 8" fill="none" ${ink(lashW)}/>`
      : e === "sad"
        ? `<path d="M ${X(-rx)} ${y - 7} q ${s * rx} 5 ${s * 2 * rx} -3" fill="none" ${ink(lashW - 1)}/>`
        : `<path d="M ${X(-rx - 1)} ${y - ry + 5} q ${s * (rx + 1)} -8 ${s * (2 * rx + 2)} 1" fill="none" ${ink(lashW)}/>`;

  const doubleEyelid = `<path d="M ${X(-rx * 0.8)} ${y - ry + 1} q ${s * rx * 0.8} -5 ${s * rx * 1.6} 2" fill="none" stroke="${c.skinSh}" stroke-width="2" opacity="0.85"/>`;

  const starHighlight = (c.gender === "female" || e === "love") && (c.ageGroup !== "elderly" && c.ageGroup !== "middle")
    ? `<path d="M ${X(-irisR * 0.45)} ${y - irisR * 0.45} l 1.5 4.5 l 4.5 1.5 l -4.5 1.5 l -1.5 4.5 l -1.5 -4.5 l -4.5 -1.5 l 4.5 -1.5 z" fill="#ffffff"/>`
    : "";

  return `
    <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>
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
      ${starHighlight}
      <path d="M ${x - rx} ${y + ry - 2} q ${rx} 4 ${2 * rx} 0" fill="none" stroke="${INK}" stroke-width="1.6" opacity="0.35"/>
    </g>
    ${doubleEyelid}
    ${lid}`;
}

// ─────────────────────────────────────────────────────────
// 눈썹 그리기 함수
// ─────────────────────────────────────────────────────────
function brow(b: Expr["brow"], x: number, mir: boolean, c: CharSpec, hy: number): string {
  const s = mir ? -1 : 1;
  const X = (d: number) => x + s * d;
  const y = hy - 28;
  const col = c.hairSh;
  
  const isElderly = c.ageGroup === "elderly";
  const stoop = isElderly ? 6 : 0;
  const browY = y + stoop;

  let pathD = "";
  if (b === "up") {
    pathD = `M ${X(-15)} ${browY + 4} q ${15 * s} -10 ${30 * s} -2`;
  } else if (b === "down") {
    pathD = `M ${X(-15)} ${browY - 5} q ${15 * s} 8 ${30 * s} 7`;
  } else if (b === "worry") {
    pathD = `M ${X(-14)} ${browY + 6} q ${14 * s} -5 ${28 * s} 5`;
  } else {
    pathD = `M ${X(-14)} ${browY + 1} q ${14 * s} -6 ${28 * s} 0`;
  }

  const isMaleElderly = isElderly && c.gender === "male";
  const strokeW = isMaleElderly ? 7.5 : 5.5;

  return `<path d="${pathD}" fill="none" stroke="${col}" stroke-width="${strokeW}" stroke-linecap="round"/>`;
}

// ─────────────────────────────────────────────────────────
// 입 그리기 함수 (연령별 위치/크기 조정)
// ─────────────────────────────────────────────────────────
function mouth(m: Expr["mouth"], c: CharSpec, g: string, hy: number): string {
  let y = hy + 58;
  let scale = 1.0;
  if (c.ageGroup === "baby") {
    y = hy + 40;
    scale = 0.7;
  } else if (c.ageGroup === "child") {
    y = hy + 48;
    scale = 0.85;
  }

  const isFemale = c.gender === "female";

  const lipTint = isFemale && c.ageGroup !== "elderly"
    ? `<ellipse cx="${cx}" cy="${y + 1}" rx="${14 * scale}" ry="${5.5 * scale}" fill="#ee6a85" opacity="0.45" filter="url(#${g}_blur)"/>`
    : "";

  const lipGloss = isFemale && c.ageGroup !== "elderly"
    ? `<circle cx="${cx + 3.5 * scale}" cy="${y + 3 * scale}" r="${1.5 * scale}" fill="#ffffff" opacity="0.85"/>`
    : "";

  const inkWidth = LW2 * scale;

  switch (m) {
    case "grin":
      return lipTint +
        `<path d="M ${cx - 25 * scale} ${y - 3 * scale} q ${25 * scale} ${34 * scale} ${50 * scale} 0 q ${-25 * scale} ${7 * scale} ${-50 * scale} 0 z" fill="#8a2a3c" stroke="${INK}" stroke-width="${inkWidth}"/>` +
        `<path d="M ${cx - 19 * scale} ${y - 1 * scale} q ${19 * scale} ${6 * scale} ${38 * scale} 0 l 0 ${5 * scale} q ${-19 * scale} ${4 * scale} ${-38 * scale} 0 z" fill="#ffffff"/>` +
        `<path d="M ${cx - 9 * scale} ${y + 13 * scale} q ${9 * scale} ${8 * scale} ${18 * scale} 0 z" fill="#d4596e"/>` +
        lipGloss;
    case "smile":
      return lipTint +
        `<path d="M ${cx - 20 * scale} ${y} q ${20 * scale} ${19 * scale} ${40 * scale} 0" fill="none" stroke="${INK}" stroke-width="${5 * scale}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="M ${cx - 13 * scale} ${y + 4 * scale} q ${13 * scale} ${8 * scale} ${26 * scale} 0 l 0 ${2 * scale} q ${-13 * scale} ${6 * scale} ${-26 * scale} 0 z" fill="#ffffff" stroke="${INK}" stroke-width="${1.4 * scale}"/>` +
        lipGloss;
    case "frown":
      return `<path d="M ${cx - 17 * scale} ${y + 8 * scale} q ${17 * scale} ${-16 * scale} ${34 * scale} 0" fill="none" stroke="${INK}" stroke-width="${5 * scale}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "open":
      return lipTint +
        `<ellipse cx="${cx}" cy="${y + 4 * scale}" rx="${13 * scale}" ry="${17 * scale}" fill="#8a2a3c" stroke="${INK}" stroke-width="${inkWidth}"/>` +
        `<path d="M ${cx - 7 * scale} ${y + 13 * scale} q ${7 * scale} ${9 * scale} ${14 * scale} 0 z" fill="#d4596e"/>` +
        `<path d="M ${cx - 9 * scale} ${y - 9 * scale} q ${9 * scale} ${-5 * scale} ${18 * scale} 0 l 0 ${3 * scale} q ${-9 * scale} ${4 * scale} ${-18 * scale} 0 z" fill="#ffffff"/>` +
        lipGloss;
    case "pout":
      return lipTint + `<path d="M ${cx - 13 * scale} ${y + 3 * scale} q ${13 * scale} ${-10 * scale} ${26 * scale} 0" fill="none" stroke="${INK}" stroke-width="${5 * scale}" stroke-linecap="round" stroke-linejoin="round"/>` + lipGloss;
    case "tongue":
      return `<path d="M ${cx - 18 * scale} ${y - 2 * scale} q ${18 * scale} ${24 * scale} ${36 * scale} 0 q ${-18 * scale} ${6 * scale} ${-36 * scale} 0 z" fill="#8a2a3c" stroke="${INK}" stroke-width="${inkWidth}"/>` +
        `<path d="M ${cx - 8 * scale} ${y + 8 * scale} q ${8 * scale} ${16 * scale} ${16 * scale} 0 q ${-2 * scale} ${-3 * scale} ${-16 * scale} 0 z" fill="#ee7a90" stroke="${INK}" stroke-width="${2 * scale}"/>`;
    default: // flat
      return lipTint + `<path d="M ${cx - 15 * scale} ${y + 2 * scale} q ${15 * scale} ${5 * scale} ${30 * scale} 0" fill="none" stroke="${INK}" stroke-width="${4.5 * scale}" stroke-linecap="round" stroke-linejoin="round"/>` + lipGloss;
  }
}

// ─────────────────────────────────────────────────────────
// 의상 그리기 함수
// ─────────────────────────────────────────────────────────
function outfit(c: CharSpec, gid: string, hy: number): string {
  let shoulderW = 128;
  let shoulderH = 144;
  if (c.ageGroup === "baby") {
    shoulderW = 85;
    shoulderH = 110;
  } else if (c.ageGroup === "child") {
    shoulderW = 105;
    shoulderH = 130;
  } else if (c.ageGroup === "teen") {
    shoulderW = 120;
    shoulderH = 140;
  }

  const body = `<path d="M ${cx - shoulderW} ${H} q 8 -${shoulderH} ${shoulderW} -${shoulderH + 24} q ${shoulderW - 8} 24 ${shoulderW} ${shoulderH} z" fill="url(#${gid}_o)" stroke="${INK}" stroke-width="${LW}"/>`;
  const shade = `<path d="M ${cx - shoulderW + 18} ${H} q 14 -${shoulderH - 30} ${shoulderW - 20} -${shoulderH - 6} q -50 40 -54 120 z" fill="${c.outfitSh}" opacity="0.45"/>`;

  let detail = "";
  if (c.ageGroup === "baby") {
    detail = `<path d="M ${cx - 32} ${hy + 84} q 32 40 64 0 l 12 36 q -44 28 -88 0 Z" fill="#ffebd6" stroke="${INK}" stroke-width="${LW2}"/>` +
             `<path d="M ${cx - 24} ${hy + 86} q 24 32 48 0 l 8 24 q -32 20 -64 0 Z" fill="#ffd76a" stroke="${INK}" stroke-width="2"/>` +
             `<circle cx="${cx}" cy="${hy + 104}" r="5.5" fill="#ff8a9c" stroke="${INK}" stroke-width="1.5"/>`;
  } else if (c.ageGroup === "child") {
    detail = `<path d="M ${cx - 40} ${hy + 90} q 40 25 80 0 l 0 16 q -40 15 -80 0 Z" fill="${c.collar}" stroke="${INK}" stroke-width="${LW2}"/>` +
             `<path d="M ${cx - 24} ${hy + 106} v 60 M ${cx + 24} ${hy + 106} v 60" stroke="${INK}" stroke-width="${LW2}"/>` +
             `<rect x="${cx - 28}" y="${hy + 120}" width="8" height="8" rx="2" fill="${c.accent}" stroke="${INK}" stroke-width="1.5"/>` +
             `<rect x="${cx + 20}" y="${hy + 120}" width="8" height="8" rx="2" fill="${c.accent}" stroke="${INK}" stroke-width="1.5"/>`;
  } else if (c.ageGroup === "teen") {
    const isGirl = c.gender === "female";
    if (isGirl) {
      detail =
        `<path d="M ${cx - 60} ${hy + 100} l 60 26 l 60 -26 l 0 32 l -60 22 l -60 -22 z" fill="${c.collar}" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx - 60} ${hy + 100} l 0 32 l 20 8 l 0 -28 z" fill="${c.accent}" opacity="0.9"/>` +
        `<path d="M ${cx + 60} ${hy + 100} l 0 32 l -20 8 l 0 -28 z" fill="${c.accent}" opacity="0.9"/>` +
        `<path d="M ${cx} ${hy + 122} l 8 12 l -8 12 l -8 -12 z" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>`;
    } else {
      detail =
        `<path d="M ${cx - 60} ${hy + 100} l 60 26 l 60 -26 l 0 32 l -60 22 l -60 -22 z" fill="${c.collar}" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx} ${hy + 122} l 6 12 l -6 24 l -6 -24 z" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>`;
    }
  } else if (c.ageGroup === "middle" || c.ageGroup === "elderly") {
    const isMale = c.gender === "male";
    if (isMale) {
      detail = `<path d="M ${cx - 48} ${hy + 100} q 48 35 96 0 l 0 80 l -96 0 Z" fill="${c.collar}" stroke="${INK}" stroke-width="${LW2}"/>` +
               `<path d="M ${cx} ${hy + 112} V ${H}" fill="none" stroke="${INK}" stroke-width="${LW2}"/>` +
               `<circle cx="${cx}" cy="${hy + 130}" r="5" fill="${c.accent}" stroke="${INK}" stroke-width="1.5"/>` +
               `<circle cx="${cx}" cy="${hy + 155}" r="5" fill="${c.accent}" stroke="${INK}" stroke-width="1.5"/>` +
               `<circle cx="${cx}" cy="${hy + 180}" r="5" fill="${c.accent}" stroke="${INK}" stroke-width="1.5"/>`;
    } else {
      detail = `<path d="M ${cx - 44} ${hy + 100} q 44 26 88 0 l 0 20 q -44 20 -88 0 Z" fill="${c.collar}" stroke="${INK}" stroke-width="${LW2}"/>` +
               `<circle cx="${cx - 14}" cy="${hy + 114}" r="4" fill="${c.accent}" stroke="${INK}" stroke-width="1"/>` +
               `<circle cx="${cx}" cy="${hy + 116}" r="4" fill="${c.accent}" stroke="${INK}" stroke-width="1"/>` +
               `<circle cx="${cx + 14}" cy="${hy + 114}" r="4" fill="${c.accent}" stroke="${INK}" stroke-width="1"/>`;
    }
  } else {
    // 성인 캐주얼/오피스 자켓
    detail =
      `<path d="M ${cx - 64} ${hy + 102} l 64 24 l 64 -24 l 4 28 l -52 20 l 0 90 l -32 0 l 0 -90 l -52 -20 z" fill="${c.collar}" stroke="${INK}" stroke-width="${LW2}"/>` +
      `<path d="M ${cx - 64} ${hy + 102} l 28 12 l -26 64 z" fill="${c.outfitSh}" stroke="${INK}" stroke-width="${LW2}"/>` +
      `<path d="M ${cx + 64} ${hy + 102} l -28 12 l 26 64 z" fill="${c.outfitSh}" stroke="${INK}" stroke-width="${LW2}"/>`;
  }

  return `${body}${shade}${detail}`;
}

// ─────────────────────────────────────────────────────────
// 특수 효과 및 이펙트 (땀, 눈물, 홍조 등)
// ─────────────────────────────────────────────────────────
function extras(e: Expr, c: CharSpec, g: string, hy: number): string {
  let s = "";
  if (e.blush) {
    const op = e.blush === "strong" ? 0.85 : 0.65;
    const w = e.blush === "strong" ? 22 : 18;
    const h = e.blush === "strong" ? 14 : 10;
    s += `<g opacity="${op}">` +
      `<ellipse cx="${cx - 58}" cy="${hy + 32}" rx="${w}" ry="${h}" fill="url(#${g}_blushG)"/>` +
      `<ellipse cx="${cx + 58}" cy="${hy + 32}" rx="${w}" ry="${h}" fill="url(#${g}_blushG)"/>`;
    if (e.blush === "strong") {
      s += `<g stroke="#ff6a80" stroke-width="2" stroke-linecap="round" opacity="0.95">` +
        `<path d="M ${cx - 66} ${hy + 28} l -3 8"/><path d="M ${cx - 58} ${hy + 28} l -3 8"/><path d="M ${cx - 50} ${hy + 28} l -3 8"/>` +
        `<path d="M ${cx + 50} ${hy + 28} l -3 8"/><path d="M ${cx + 58} ${hy + 28} l -3 8"/><path d="M ${cx + 66} ${hy + 28} l -3 8"/></g>`;
    }
    s += `</g>`;
  }
  if (e.tears) {
    s += `<g fill="#9fd8ff" stroke="${INK}" stroke-width="1.6">` +
      `<path d="M ${cx - 64} ${hy + 24} q -6 30 4 46 q 12 -16 6 -46 z"/>` +
      `<path d="M ${cx + 64} ${hy + 24} q 6 30 -4 46 q -12 -16 -6 -46 z"/></g>` +
      `<ellipse cx="${cx - 60}" cy="${hy + 30}" rx="4" ry="6" fill="#dff2ff" opacity="0.9"/>`;
  }
  if (e.anger) {
    s += `<g stroke="#e23b4e" stroke-width="5" stroke-linecap="round">` +
      `<path d="M ${cx + 52} ${hy - 56} h 24"/><path d="M ${cx + 64} ${hy - 68} v 24"/>` +
      `<path d="M ${cx + 56} ${hy - 64} l 16 16"/><path d="M ${cx + 72} ${hy - 64} l -16 16"/></g>`;
  }
  if (e.sweat) {
    s += `<path d="M ${cx + 72} ${hy - 30} q -8 18 0 28 q 14 -6 8 -22 q -3 -6 -8 -6 z" fill="#bfe6ff" stroke="${INK}" stroke-width="2"/>` +
      `<ellipse cx="${cx + 73}" cy="${hy - 16}" rx="2.5" ry="4" fill="#ffffff" opacity="0.85"/>`;
  }
  if (e.sparkle) {
    s += `<g fill="#ffd76a" stroke="${INK}" stroke-width="1.5">` +
      `<path d="M ${cx - 96} ${hy - 66} l 5 12 l 12 5 l -12 5 l -5 12 l -5 -12 l -12 -5 l 12 -5 z"/>` +
      `<path d="M ${cx + 98} ${hy + 6} l 4 10 l 10 4 l -10 4 l -4 10 l -4 -10 l -10 -4 l 10 -4 z"/>` +
      `<circle cx="${cx + 88}" cy="${hy - 50}" r="3"/><circle cx="${cx - 88}" cy="${hy + 24}" r="2.5"/></g>`;
  }
  return s;
}

// ─────────────────────────────────────────────────────────
// 주름 그리기 함수 (어르신, 중년층에 필수 적용)
// ─────────────────────────────────────────────────────────
function getWrinkles(c: CharSpec, hy: number, ry: number, sc: number): string {
  if (c.ageGroup !== "middle" && c.ageGroup !== "elderly") return "";

  const isElderly = c.ageGroup === "elderly";
  let s = "";

  // 1. 이마 주름
  if (isElderly) {
    s += `
      <!-- Forehead Wrinkles -->
      <path d="M ${cx - 35} ${hy - ry + 36} q 35 -5 70 0" fill="none" stroke="${INK}" stroke-width="1.2" opacity="0.25" stroke-linecap="round"/>
      <path d="M ${cx - 30} ${hy - ry + 44} q 30 -4 60 0" fill="none" stroke="${INK}" stroke-width="1.2" opacity="0.25" stroke-linecap="round"/>
      <path d="M ${cx - 25} ${hy - ry + 52} q 25 -3 50 0" fill="none" stroke="${INK}" stroke-width="1.2" opacity="0.2" stroke-linecap="round"/>
    `;
  } else {
    // 중년층 (이마에 옅은 주름 1줄)
    s += `
      <!-- Forehead Wrinkles -->
      <path d="M ${cx - 25} ${hy - ry + 44} q 25 -4 50 0" fill="none" stroke="${INK}" stroke-width="1.0" opacity="0.2" stroke-linecap="round"/>
    `;
  }

  // 2. 눈가 주름 (눈꼬리 잔주름)
  const eyeY = hy + 10;
  const leftOuterX = cx - 44 - 16 * sc;
  const rightOuterX = cx + 44 + 16 * sc;

  if (isElderly) {
    s += `
      <!-- Crows Feet -->
      <path d="M ${leftOuterX} ${eyeY + 4} q -10 -3 -15 1" fill="none" stroke="${INK}" stroke-width="1.2" opacity="0.25" stroke-linecap="round"/>
      <path d="M ${leftOuterX} ${eyeY + 8} q -12 1 -16 6" fill="none" stroke="${INK}" stroke-width="1.2" opacity="0.25" stroke-linecap="round"/>
      <path d="M ${leftOuterX} ${eyeY + 12} q -9 4 -12 9" fill="none" stroke="${INK}" stroke-width="1.0" opacity="0.2" stroke-linecap="round"/>
      
      <path d="M ${rightOuterX} ${eyeY + 4} q 10 -3 15 1" fill="none" stroke="${INK}" stroke-width="1.2" opacity="0.25" stroke-linecap="round"/>
      <path d="M ${rightOuterX} ${eyeY + 8} q 12 1 16 6" fill="none" stroke="${INK}" stroke-width="1.2" opacity="0.25" stroke-linecap="round"/>
      <path d="M ${rightOuterX} ${eyeY + 12} q 9 4 12 9" fill="none" stroke="${INK}" stroke-width="1.0" opacity="0.2" stroke-linecap="round"/>
    `;
  } else {
    // 중년층 (옅은 눈가 주름 2줄)
    s += `
      <!-- Crows Feet -->
      <path d="M ${leftOuterX} ${eyeY + 6} q -8 -2 -12 2" fill="none" stroke="${INK}" stroke-width="1.0" opacity="0.2" stroke-linecap="round"/>
      <path d="M ${leftOuterX} ${eyeY + 10} q -9 1 -12 5" fill="none" stroke="${INK}" stroke-width="1.0" opacity="0.2" stroke-linecap="round"/>
      
      <path d="M ${rightOuterX} ${eyeY + 6} q 8 -2 12 2" fill="none" stroke="${INK}" stroke-width="1.0" opacity="0.2" stroke-linecap="round"/>
      <path d="M ${rightOuterX} ${eyeY + 10} q 9 1 12 5" fill="none" stroke="${INK}" stroke-width="1.0" opacity="0.2" stroke-linecap="round"/>
    `;
  }

  // 3. 눈 밑 지방/그늘 (아이백 - 어르신에게만 적용)
  if (isElderly) {
    s += `
      <!-- Eye Bags -->
      <path d="M ${cx - 44 - 10 * sc} ${eyeY + 20} q 10 5 20 0" fill="none" stroke="${c.skinSh}" stroke-width="2.0" opacity="0.7" stroke-linecap="round"/>
      <path d="M ${cx + 44 - 10 * sc} ${eyeY + 20} q 10 5 20 0" fill="none" stroke="${c.skinSh}" stroke-width="2.0" opacity="0.7" stroke-linecap="round"/>
    `;
  }

  // 4. 팔자주름 (입가 주름)
  if (isElderly) {
    s += `
      <!-- Nasolabial Folds -->
      <path d="M ${cx - 16} ${hy + 32} q -12 12 -6 28" fill="none" stroke="${INK}" stroke-width="1.2" opacity="0.2" stroke-linecap="round"/>
      <path d="M ${cx - 17} ${hy + 32} q -12 12 -6 28" fill="none" stroke="${c.skinSh}" stroke-width="2.5" opacity="0.75" stroke-linecap="round"/>
      <path d="M ${cx + 16} ${hy + 32} q 12 12 6 28" fill="none" stroke="${INK}" stroke-width="1.2" opacity="0.2" stroke-linecap="round"/>
      <path d="M ${cx + 17} ${hy + 32} q 12 12 6 28" fill="none" stroke="${c.skinSh}" stroke-width="2.5" opacity="0.75" stroke-linecap="round"/>
    `;
  } else {
    // 중년층 (음영 팔자주름)
    s += `
      <!-- Nasolabial Folds -->
      <path d="M ${cx - 16} ${hy + 33} q -10 11 -5 24" fill="none" stroke="${c.skinSh}" stroke-width="2.0" opacity="0.6" stroke-linecap="round"/>
      <path d="M ${cx + 16} ${hy + 33} q 10 11 5 24" fill="none" stroke="${c.skinSh}" stroke-width="2.0" opacity="0.6" stroke-linecap="round"/>
    `;
  }

  return s;
}

// ─────────────────────────────────────────────────────────
// 캐릭터 1개 + 표정 1개 SVG 빌드 함수
// ─────────────────────────────────────────────────────────
function build(c: CharSpec, e: Expr): string {
  const g = `demo_${c.id.replace(/-/g, "_")}_${e.id}`;
  const lid = `${g}_L`;
  const rid = `${g}_R`;

  // 연령대 그룹별 얼굴 크기 및 Y 기준 좌표
  let rx = 92;
  let ry = 100;
  let hy = 206;

  if (c.ageGroup === "baby") {
    rx = 96;
    ry = 80;
    hy = 210;
  } else if (c.ageGroup === "child") {
    rx = 94;
    ry = 88;
    hy = 208;
  } else if (c.ageGroup === "teen") {
    rx = 92;
    ry = 96;
    hy = 206;
  } else if (c.ageGroup === "middle") {
    rx = 94;
    ry = 100;
    hy = 206;
  } else if (c.ageGroup === "elderly") {
    rx = 90;
    ry = 100;
    hy = 206;
  }

  const chin = hy + ry + 12;
  const sc = c.eyeScale ?? 1.0;

  // 코 콧날 및 그림자 그리기 (아기/어린이는 작고 둥글게)
  let nose = "";
  if (c.ageGroup === "baby") {
    nose = `
      <path d="M ${cx - 1.5} ${hy + 16} q 1.5 2.5 3 0" fill="none" stroke="${INK}" stroke-width="2.0" stroke-linecap="round"/>
    `;
  } else if (c.ageGroup === "child") {
    nose = `
      <path d="M ${cx - 2} ${hy + 20} q 2 3.5 4 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
    `;
  } else {
    // 청소년/성인/중년/노인
    nose = `
      <path d="M ${cx - 1} ${hy + 14} v 13" fill="none" stroke="${c.skinSh}" stroke-width="2.5" opacity="0.5" filter="url(#${g}_blur)"/>
      <path d="M ${cx - 3.5} ${hy + 26} q 3.5 4.5 7 0" fill="none" stroke="${c.skinSh}" stroke-width="4.5" opacity="0.65" filter="url(#${g}_blur)"/>
      <path d="M ${cx - 2.5} ${hy + 25} q 2.5 3.5 5 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
    `;
  }

  // 기본 눈가 홍조 / 생기 필터
  const isCute = c.gender === "female" || c.ageGroup === "baby" || c.ageGroup === "child";
  const generalSkinWarmth = isCute
    ? `<ellipse cx="${cx - 58}" cy="${hy + 34}" rx="14" ry="6" fill="url(#${g}_blushG)" opacity="0.3"/>` +
      `<ellipse cx="${cx + 58}" cy="${hy + 34}" rx="14" ry="6" fill="url(#${g}_blushG)" opacity="0.3"/>`
    : "";

  const facePathString = getFacePath(rx, ry, hy, c.ageGroup);

  // 수염/콧수염 마크업
  let beardMarkup = "";
  if (c.hasBeard === "mustache") {
    beardMarkup = `
      <!-- Mustache -->
      <path d="M ${cx - 22} ${hy + 46} q 22 -6 44 0 q 8 12 -12 10 q -10 4 -20 -4 q -10 8 -20 -2 q -6 -3 8 -4 Z" 
            fill="${c.hairSh}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    `;
  } else if (c.hasBeard === "full") {
    beardMarkup = `
      <!-- Beard -->
      <path d="M ${cx - rx + 18} ${hy + 30} 
               C ${cx - rx + 8} ${hy + 124} ${cx - 60} ${hy + 175} ${cx} ${hy + 185}
               C ${cx + 60} ${hy + 175} ${cx + rx - 8} ${hy + 124} ${cx + rx - 18} ${hy + 30}
               C ${cx + 40} ${hy + 115} ${cx - 40} ${hy + 115} ${cx - rx + 18} ${hy + 30} Z" 
            fill="${c.hair}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- Mustache -->
      <path d="M ${cx - 28} ${hy + 46} q 28 -8 56 0 q 12 18 -16 14 q -12 6 -24 -6 q -12 12 -24 -2 q -8 -4 8 -6 Z" 
            fill="${c.hairSh}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    `;
  }

  // 안경 마크업
  let glassesMarkup = "";
  if (c.hasGlasses) {
    glassesMarkup = `
      <!-- Glasses -->
      <g stroke="${INK}" stroke-width="4.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
        <rect x="${cx - 44 - 24}" y="${hy + 10 - 20}" width="48" height="40" rx="12" fill="rgba(255,255,255,0.15)"/>
        <rect x="${cx + 44 - 24}" y="${hy + 10 - 20}" width="48" height="40" rx="12" fill="rgba(255,255,255,0.15)"/>
        <path d="M ${cx - 20} ${hy + 8} q 20 -4 40 0"/>
        <path d="M ${cx - 44 - 24} ${hy + 10} L ${cx - rx + 6} ${hy + 14}"/>
        <path d="M ${cx + 44 + 24} ${hy + 10} L ${cx + rx - 6} ${hy + 14}"/>
      </g>
      <path d="M ${cx - 55} ${hy - 2} L ${cx - 35} ${hy + 18}" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
      <path d="M ${cx + 33} ${hy - 2} L ${cx + 53} ${hy + 18}" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
    `;
  }

  const neckW = c.ageGroup === "baby" ? 40 : c.ageGroup === "child" ? 48 : 60;
  const neckY = chin - 30;
  const neckH = 26;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<defs>
  ${getGradients(c, g, lid, rid)}
  <clipPath id="${g}_face_clip">
    <path d="${facePathString}"/>
  </clipPath>
</defs>
<g filter="url(#${g}_rimGlow)">
  ${outfit(c, g, hy)}
  
  <!-- 목 (neck) -->
  <path d="M ${cx - neckW / 2} ${neckY} h ${neckW} v ${neckH} q -${neckW / 2} 18 -${neckW} 0 z" fill="url(#${g}_skin)" stroke="${INK}" stroke-width="${LW2}"/>
  <!-- 턱 밑 목 부드러운 그림자 -->
  <path d="M ${cx - neckW / 2 - 10} ${neckY + 2} q ${neckW / 2 + 10} 16 ${neckW + 20} 0 v 14 q -${neckW / 2 + 10} 12 -${neckW + 20} 0 z" fill="${c.skinSh}" opacity="0.75" filter="url(#${g}_blur)"/>
  
  ${hairBack(c, g, hy, ry)}
  <path d="${facePathString}" fill="url(#${g}_skin)" stroke="${INK}" stroke-width="${LW}"/>
  
  <!-- 이마 앞머리 그림자 (얼굴 영역에 맞게 클립) -->
  <g clip-path="url(#${g}_face_clip)">
    <path d="${getHairFrontD(c.hairStyle, hy)}" fill="${c.hairSh}" opacity="0.32" transform="translate(0, 10)" filter="url(#${g}_blur)"/>
  </g>
  
  <!-- 귀 (ears) -->
  <ellipse cx="${cx - rx + 6}" cy="${hy + 20}" rx="12" ry="17" fill="url(#${g}_skin)" stroke="${INK}" stroke-width="${LW2}"/>
  <ellipse cx="${cx + rx - 6}" cy="${hy + 20}" rx="12" ry="17" fill="url(#${g}_skin)" stroke="${INK}" stroke-width="${LW2}"/>
  <path d="M ${cx + rx - 20} ${hy - 16} q 22 50 -2 92 q -8 14 -22 22 q 40 -2 56 -42 q 8 -40 -32 -72 z" fill="${c.skinSh}" opacity="0.3"/>
  
  ${generalSkinWarmth}
  ${extras(e, c, g, hy)}
  ${eye(e.eye, cx - 44, false, c, lid, hy)}
  ${eye(e.eye, cx + 44, true, c, rid, hy)}
  ${brow(e.brow, cx - 44, false, c, hy)}
  ${brow(e.brow, cx + 44, true, c, hy)}
  ${nose}
  ${beardMarkup}
  ${mouth(e.mouth, c, g, hy)}
  ${getWrinkles(c, hy, ry, sc)}
  ${glassesMarkup}
  ${hairFront(c, g, hy, ry)}
</g>
</svg>`;
}

// ─────────────────────────────────────────────────────────
// 최종 에셋 데이터 내보내기
// ─────────────────────────────────────────────────────────
export const DEMOGRAPHIC_CHARACTERS: CharacterAsset[] = CHAR_SPECS.map((c) => ({
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
