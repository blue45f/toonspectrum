// 2D 웹툰 캐릭터 라이브러리 — "라인아트 외곽선 + 플랫 셀 컬러 + 큰 애니 눈"의 웹툰 그림체.
// 버스트(상반신) 초상. 순수 SVG path/ellipse + 일관된 잉크 라인으로 "웹툰 컷" 느낌을 낸다.
// (3D 셀툰 포저는 Studio3DPoser.tsx, 이건 2D 「캐릭터」 피커용)
import type { CharacterAsset } from "./studio-characters";

const W = 360;
const H = 480;
const INK = "#2b2330"; // 라인아트 잉크색
const LW = 4; // 외곽선 두께

const cx = 180;
const headY = 210;
const headRx = 95;
const headRy = 102;

interface Expr {
  id: string;
  label: string;
  eye: "open" | "smile" | "wink" | "sad" | "angry" | "wide" | "love";
  brow: "neutral" | "up" | "down" | "worry";
  mouth: "smile" | "grin" | "flat" | "frown" | "open" | "pout";
  blush?: boolean;
  tears?: boolean;
  anger?: boolean;
  sparkle?: boolean;
}

const EXPRS: Expr[] = [
  { id: "happy", label: "기쁨", eye: "smile", brow: "up", mouth: "smile", blush: true },
  { id: "laugh", label: "웃음", eye: "smile", brow: "up", mouth: "grin", blush: true },
  { id: "neutral", label: "무표정", eye: "open", brow: "neutral", mouth: "flat" },
  { id: "sad", label: "슬픔", eye: "sad", brow: "worry", mouth: "frown", tears: true },
  { id: "angry", label: "분노", eye: "angry", brow: "down", mouth: "pout", anger: true },
  { id: "surprised", label: "놀람", eye: "wide", brow: "up", mouth: "open" },
  { id: "love", label: "사랑", eye: "love", brow: "up", mouth: "smile", blush: true, sparkle: true },
];

interface Char {
  id: string;
  label: string;
  emoji: string;
  skin: string;
  skinSh: string;
  hair: string;
  hairSh: string;
  hairHi: string;
  iris: string;
  outfit: string;
  outfitSh: string;
  collar: string;
  style: "bob" | "long" | "short" | "twin" | "ponytail" | "wavy" | "bun" | "spiky";
}

const CHARS: Char[] = [
  { id: "yuna", label: "유나", emoji: "🙆‍♀️", skin: "#ffe1c6", skinSh: "#f3c39e", hair: "#3c2a26", hairSh: "#281a16", hairHi: "#6a4a3e", iris: "#7a4a2c", outfit: "#5b8def", outfitSh: "#3f6fd1", collar: "#ffffff", style: "bob" },
  { id: "haru", label: "하루", emoji: "🧑", skin: "#ffe4cf", skinSh: "#f5c9ad", hair: "#1f1c2b", hairSh: "#12101a", hairHi: "#4a4660", iris: "#3a4a6a", outfit: "#ef6f9b", outfitSh: "#d4517e", collar: "#fff0f5", style: "short" },
  { id: "sora", label: "소라", emoji: "👧", skin: "#ffe7d6", skinSh: "#f7d0b6", hair: "#caa64a", hairSh: "#a9863a", hairHi: "#ecd28a", iris: "#caa24a", outfit: "#36c08f", outfitSh: "#27a077", collar: "#eafff6", style: "twin" },
  { id: "rin", label: "린", emoji: "👩", skin: "#f3d2b3", skinSh: "#e2b690", hair: "#7c4bd0", hairSh: "#5a32a0", hairHi: "#b79bee", iris: "#8a5cf0", outfit: "#8a6df0", outfitSh: "#6f4fd6", collar: "#f1ecff", style: "long" },
  { id: "tae", label: "태오", emoji: "🧑‍🎤", skin: "#e9c19a", skinSh: "#d4a276", hair: "#16130f", hairSh: "#0a0805", hairHi: "#3a342a", iris: "#2a2018", outfit: "#f0a93b", outfitSh: "#d4901f", collar: "#fff6e6", style: "spiky" },
  { id: "mina", label: "미나", emoji: "💁‍♀️", skin: "#ffe1c6", skinSh: "#f3c39e", hair: "#d44a6a", hairSh: "#b0335020", hairHi: "#ff90a8", iris: "#d44a6a", outfit: "#4fb6e0", outfitSh: "#2f97c4", collar: "#eaf9ff", style: "wavy" },
  { id: "yeon", label: "연우", emoji: "🙋‍♀️", skin: "#ffe7d6", skinSh: "#f7d0b6", hair: "#2b3a5a", hairSh: "#1c2740", hairHi: "#5a6f9a", iris: "#3a5a8a", outfit: "#ef5d73", outfitSh: "#d23f57", collar: "#fff", style: "ponytail" },
  { id: "bom", label: "봄", emoji: "👩‍🦰", skin: "#ffe4cf", skinSh: "#f5c9ad", hair: "#b5552a", hairSh: "#8c3f1e", hairHi: "#e0905a", iris: "#a85a2c", outfit: "#7bc043", outfitSh: "#5fa030", collar: "#f3ffe6", style: "bun" },
];

// ── 눈/눈썹/입 (라인아트) ──────────────────────────────
function eye(e: Expr["eye"], x: number, mir: boolean, iris: string): string {
  const s = mir ? -1 : 1;
  const X = (d: number) => x + s * d;
  const y = headY + 8;
  if (e === "smile" || e === "love") {
    if (e === "love")
      return `<path d="M ${X(-17)} ${y} q 17 -24 34 0 q -9 16 -17 16 q -8 0 -17 -16 z" fill="#e8557e"/><circle cx="${X(-4)}" cy="${y - 2}" r="4" fill="#fff" opacity="0.9"/>`;
    return `<path d="M ${X(-17)} ${y + 4} q 17 -20 34 0" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
  }
  // 흰자 + 홍채 + 동공 + 하이라이트 + 윗눈꺼풀 라인
  const ry = e === "wide" ? 21 : e === "angry" ? 14 : e === "sad" ? 17 : 19;
  const rx = 15;
  const lid =
    e === "angry"
      ? `<path d="M ${X(-rx - 1)} ${y - 8} q ${s * (rx + 1)} -2 ${s * (2 * rx + 2)} 6" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`
      : e === "sad"
        ? `<path d="M ${X(-rx)} ${y - 6} q ${s * rx} 4 ${s * 2 * rx} -2" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`
        : `<path d="M ${X(-rx)} ${y - ry + 4} q ${s * rx} -7 ${s * 2 * rx} 0" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
  return `
    <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#ffffff" stroke="${INK}" stroke-width="3"/>
    <circle cx="${x}" cy="${y + 1}" r="${Math.min(rx - 1, ry - 3)}" fill="${iris}"/>
    <circle cx="${x}" cy="${y + 1}" r="6" fill="#1a1018"/>
    <circle cx="${X(-4)}" cy="${y - 5}" r="4.5" fill="#fff"/>
    ${lid}`;
}

function brow(b: Expr["brow"], x: number, mir: boolean): string {
  const s = mir ? -1 : 1;
  const X = (d: number) => x + s * d;
  const y = headY - 26;
  const d =
    b === "up"
      ? `M ${X(-14)} ${y + 3} q 14 -9 28 -2`
      : b === "down"
        ? `M ${X(-14)} ${y - 4} q 14 7 28 6`
        : b === "worry"
          ? `M ${X(-13)} ${y + 5} q 13 -4 27 4`
          : `M ${X(-13)} ${y} q 13 -5 27 0`;
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/>`;
}

function mouth(m: Expr["mouth"]): string {
  const y = headY + 56;
  switch (m) {
    case "grin":
      return `<path d="M ${cx - 24} ${y - 3} q 24 30 48 0 q -24 6 -48 0 z" fill="#9a3346" stroke="${INK}" stroke-width="3"/><path d="M ${cx - 18} ${y - 1} q 18 5 36 0" fill="#fff"/>`;
    case "smile":
      return `<path d="M ${cx - 19} ${y} q 19 18 38 0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
    case "frown":
      return `<path d="M ${cx - 16} ${y + 7} q 16 -15 32 0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
    case "open":
      return `<ellipse cx="${cx}" cy="${y + 3}" rx="12" ry="16" fill="#9a3346" stroke="${INK}" stroke-width="3"/>`;
    case "pout":
      return `<path d="M ${cx - 12} ${y + 2} q 12 -9 24 0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
    default:
      return `<path d="M ${cx - 14} ${y + 2} q 14 4 28 0" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;
  }
}

// ── 헤어 (라인아트 + 하이라이트) ─────────────────────────
function hairBack(c: Char): string {
  const { hair, hairSh, style } = c;
  const st = `stroke="${INK}" stroke-width="${LW}"`;
  switch (style) {
    case "long":
    case "wavy":
      return `<path d="M ${cx - 104} ${headY - 18} q -18 160 18 224 q 14 24 40 22 l 96 0 q 26 2 40 -22 q 36 -64 18 -224 z" fill="${hairSh}" ${st}/>`;
    case "twin":
      return `<g fill="${hairSh}" ${st}><ellipse cx="${cx - 100}" cy="${headY + 78}" rx="32" ry="58"/><ellipse cx="${cx + 100}" cy="${headY + 78}" rx="32" ry="58"/></g>`;
    case "ponytail":
      return `<path d="M ${cx + 70} ${headY - 34} q 92 36 60 168 q -10 42 -48 30 q 30 -86 -18 -176 z" fill="${hairSh}" ${st}/>`;
    case "bun":
      return `<circle cx="${cx}" cy="${headY - 96}" r="30" fill="${hairSh}" ${st}/>`;
    default:
      return "";
  }
}

function hairFront(c: Char): string {
  const { hair, hairHi, style } = c;
  const st = `stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round"`;
  let crown: string;
  switch (style) {
    case "spiky":
      crown = `<path d="M ${cx - 98} ${headY - 18} l 20 -60 l 18 42 l 22 -66 l 22 60 l 22 -54 l 22 64 l 20 -44 l 14 58 q -98 -34 -180 0 z" fill="${hair}" ${st}/>`;
      break;
    case "short":
      crown = `<path d="M ${cx - 100} ${headY + 2} q -12 -120 100 -120 q 112 0 100 120 q -28 -58 -64 -64 q -10 40 -36 44 q -8 -34 -28 -30 q -42 4 -72 50 z" fill="${hair}" ${st}/>`;
      break;
    case "twin":
    case "ponytail":
      crown = `<path d="M ${cx - 100} ${headY - 2} q -10 -126 100 -126 q 110 0 100 126 q -34 -64 -84 -64 q -16 36 -44 40 q -38 0 -72 88 z" fill="${hair}" ${st}/>`;
      break;
    default:
      crown = `<path d="M ${cx - 102} ${headY + 6} q -10 -132 102 -132 q 112 0 102 132 q -30 -66 -70 -68 q -14 40 -46 46 q -10 -8 -18 -2 q -36 6 -70 24 z" fill="${hair}" ${st}/>`;
  }
  // 하이라이트 밴드 + 잔머리 결
  const hi = `<path d="M ${cx - 56} ${headY - 86} q 54 -24 112 4" fill="none" stroke="${hairHi}" stroke-width="9" stroke-linecap="round" opacity="0.85"/>`;
  return `${crown}${hi}`;
}

function extras(e: Expr): string {
  let s = "";
  if (e.blush)
    s += `<ellipse cx="${cx - 58}" cy="${headY + 34}" rx="15" ry="8" fill="#ff9aa6" opacity="0.6"/><ellipse cx="${cx + 58}" cy="${headY + 34}" rx="15" ry="8" fill="#ff9aa6" opacity="0.6"/>`;
  if (e.tears)
    s += `<path d="M ${cx - 62} ${headY + 22} q -5 28 5 42 q 10 -14 6 -42 z" fill="#8fd3ff" stroke="${INK}" stroke-width="2"/>`;
  if (e.anger)
    s += `<g stroke="#e23b4e" stroke-width="5" stroke-linecap="round"><path d="M ${cx + 54} ${headY - 52} h 22"/><path d="M ${cx + 65} ${headY - 63} v 22"/><path d="M ${cx + 58} ${headY - 60} l 14 14"/><path d="M ${cx + 72} ${headY - 60} l -14 14"/></g>`;
  if (e.sparkle)
    s += `<g fill="#ffd76a" stroke="${INK}" stroke-width="1.5"><path d="M ${cx - 92} ${headY - 64} l 5 11 l 11 5 l -11 5 l -5 11 l -5 -11 l -11 -5 l 11 -5 z"/><path d="M ${cx + 96} ${headY + 2} l 4 9 l 9 4 l -9 4 l -4 9 l -4 -9 l -9 -4 l 9 -4 z"/></g>`;
  return s;
}

function build(c: Char, e: Expr): string {
  const g = `g_${c.id}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="${g}_o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.outfit}"/><stop offset="1" stop-color="${c.outfitSh}"/></linearGradient>
</defs>
<path d="M ${cx - 124} ${H} q 10 -116 124 -138 q 114 22 124 138 z" fill="url(#${g}_o)" stroke="${INK}" stroke-width="${LW}"/>
<path d="M ${cx - 40} ${headY + 96} q 40 26 80 0 l 0 26 q -40 22 -80 0 z" fill="${c.collar}" stroke="${INK}" stroke-width="3"/>
<path d="M ${cx - 30} ${headY + 86} h 60 v 22 q -30 16 -60 0 z" fill="${c.skin}" stroke="${INK}" stroke-width="3"/>
${hairBack(c)}
<ellipse cx="${cx - headRx + 4}" cy="${headY + 16}" rx="13" ry="18" fill="${c.skin}" stroke="${INK}" stroke-width="3"/>
<ellipse cx="${cx + headRx - 4}" cy="${headY + 16}" rx="13" ry="18" fill="${c.skin}" stroke="${INK}" stroke-width="3"/>
<ellipse cx="${cx}" cy="${headY}" rx="${headRx}" ry="${headRy}" fill="${c.skin}" stroke="${INK}" stroke-width="${LW}"/>
<path d="M ${cx - headRx + 8} ${headY - 30} q 30 56 ${headRx - 8} 64 q -50 -2 -78 -30 z" fill="${c.skinSh}" opacity="0.35"/>
${extras(e)}
${eye(e.eye, cx - 42, false, c.iris)}
${eye(e.eye, cx + 42, true, c.iris)}
${brow(e.brow, cx - 42, false)}
${brow(e.brow, cx + 42, true)}
<path d="M ${cx - 3} ${headY + 30} q 3 6 6 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
${mouth(e.mouth)}
${hairFront(c)}
</svg>`;
}

export const CHARACTER_LIBRARY: CharacterAsset[] = CHARS.map((c) => ({
  id: c.id,
  label: c.label,
  emoji: c.emoji,
  width: 240,
  height: 320,
  expressions: EXPRS.map((e) => ({ id: e.id, label: e.label, svg: build(c, e) })),
}));
