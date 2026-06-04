// 캐릭터 라이브러리 — "내(메인) 후보" 파라메트릭 플랫 벡터 캐릭터(버스트 초상).
// Codex 후보(studio-character-library.codex.ts)와 품질 비교 후 더 나은 쪽을 채택한다.
// 이모지 아님 — 순수 SVG path/ellipse/gradient.
import type { CharacterAsset } from "./studio-characters";

const W = 360;
const H = 480;

interface ExprSpec {
  id: string;
  label: string;
  eyes: "open" | "happy" | "sad" | "angry" | "wide" | "love";
  brow: "neutral" | "up" | "down" | "worry";
  mouth: "smile" | "grin" | "frown" | "open" | "flat" | "pout";
  blush?: boolean;
  tears?: boolean;
  sweat?: boolean;
  anger?: boolean;
  sparkle?: boolean;
}

const EXPRESSIONS: ExprSpec[] = [
  { id: "happy", label: "기쁨", eyes: "happy", brow: "up", mouth: "smile", blush: true },
  { id: "laugh", label: "웃음", eyes: "happy", brow: "up", mouth: "grin", blush: true },
  { id: "neutral", label: "무표정", eyes: "open", brow: "neutral", mouth: "flat" },
  { id: "sad", label: "슬픔", eyes: "sad", brow: "worry", mouth: "frown", tears: true },
  { id: "angry", label: "분노", eyes: "angry", brow: "down", mouth: "pout", anger: true },
  { id: "surprised", label: "놀람", eyes: "wide", brow: "up", mouth: "open", sweat: true },
  { id: "love", label: "사랑", eyes: "love", brow: "up", mouth: "smile", blush: true, sparkle: true },
];

interface CharSpec {
  id: string;
  label: string;
  emoji: string;
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  hairStyle: "short" | "bob" | "long" | "ponytail" | "spiky" | "twin";
  outfit: string;
  outfitShade: string;
}

const CHARS: CharSpec[] = [
  { id: "haru", label: "하루", emoji: "🙂", skin: "#ffe0c4", skinShade: "#f6c9a4", hair: "#3a2a24", hairShade: "#271c18", hairStyle: "short", outfit: "#5b8def", outfitShade: "#3f6fd1" },
  { id: "mina", label: "미나", emoji: "🙂", skin: "#ffe3cf", skinShade: "#f7caae", hair: "#7b4a2e", hairShade: "#5d3722", hairStyle: "twin", outfit: "#ef6f9b", outfitShade: "#d4517e", },
  { id: "yuki", label: "유키", emoji: "🙂", skin: "#ffe7d6", skinShade: "#f9d0b8", hair: "#caa64a", hairShade: "#a9863a", hairStyle: "ponytail", outfit: "#36c08f", outfitShade: "#27a077" },
  { id: "rei", label: "레이", emoji: "🙂", skin: "#f3d2b3", skinShade: "#e3b892", hair: "#2b2f3a", hairShade: "#1c1f27", hairStyle: "long", outfit: "#8a6df0", outfitShade: "#6f4fd6" },
  { id: "tao", label: "타오", emoji: "🙂", skin: "#e9c19a", skinShade: "#d6a578", hair: "#1f1a17", hairShade: "#120f0d", hairStyle: "spiky", outfit: "#f0a93b", outfitShade: "#d4901f" },
  { id: "sora", label: "소라", emoji: "🙂", skin: "#ffe0c4", skinShade: "#f6c9a4", hair: "#5b6b8c", hairShade: "#445273", hairStyle: "bob", outfit: "#4fb6e0", outfitShade: "#2f97c4" },
];

const cx = 180;
const headY = 196;
const headRx = 96;
const headRy = 104;

function eyeMarkup(e: ExprSpec["eyes"], x: number, mirror: boolean): string {
  const s = mirror ? -1 : 1;
  const t = (dx: number) => x + s * dx;
  switch (e) {
    case "happy":
    case "love": {
      const eye =
        e === "love"
          ? `<path d="M ${t(-16)} ${headY + 8} q 16 -22 32 0 q -8 14 -16 14 q -8 0 -16 -14 z" fill="#e0567f"/>`
          : `<path d="M ${t(-15)} ${headY + 6} q 15 -18 30 0" fill="none" stroke="#2a2330" stroke-width="6" stroke-linecap="round"/>`;
      return eye;
    }
    case "sad":
      return `<g>
        <ellipse cx="${x}" cy="${headY + 6}" rx="13" ry="15" fill="#fff"/>
        <circle cx="${x}" cy="${headY + 11}" r="8" fill="#3a2c44"/>
        <circle cx="${t(-3)}" cy="${headY + 8}" r="2.6" fill="#fff"/>
        <path d="M ${t(-15)} ${headY - 6} q 15 -6 30 2" fill="none" stroke="#2a2330" stroke-width="5" stroke-linecap="round"/>
      </g>`;
    case "angry":
      return `<g>
        <ellipse cx="${x}" cy="${headY + 7}" rx="13" ry="13" fill="#fff"/>
        <circle cx="${x}" cy="${headY + 8}" r="8" fill="#3a2c44"/>
        <circle cx="${t(3)}" cy="${headY + 5}" r="2.4" fill="#fff"/>
      </g>`;
    case "wide":
      return `<g>
        <ellipse cx="${x}" cy="${headY + 6}" rx="15" ry="17" fill="#fff"/>
        <circle cx="${x}" cy="${headY + 7}" r="7" fill="#3a2c44"/>
        <circle cx="${t(-3)}" cy="${headY + 3}" r="2.6" fill="#fff"/>
      </g>`;
    case "open":
    default:
      return `<g>
        <ellipse cx="${x}" cy="${headY + 6}" rx="13" ry="16" fill="#fff"/>
        <circle cx="${x}" cy="${headY + 8}" r="8.5" fill="#3a2c44"/>
        <circle cx="${x}" cy="${headY + 8}" r="4" fill="#120f1a"/>
        <circle cx="${t(-3.5)}" cy="${headY + 3.5}" r="3" fill="#fff"/>
      </g>`;
  }
}

function browMarkup(b: ExprSpec["brow"], x: number, mirror: boolean): string {
  const s = mirror ? -1 : 1;
  const t = (dx: number) => x + s * dx;
  const y = headY - 26;
  switch (b) {
    case "up":
      return `<path d="M ${t(-14)} ${y + 2} q 14 -8 28 -1" fill="none" stroke="#2a2330" stroke-width="5" stroke-linecap="round"/>`;
    case "down":
      return `<path d="M ${t(-14)} ${y - 3} q 14 6 28 5" fill="none" stroke="#2a2330" stroke-width="6" stroke-linecap="round"/>`;
    case "worry":
      return `<path d="M ${t(-13)} ${y + 4} q 13 -3 27 3" fill="none" stroke="#2a2330" stroke-width="5" stroke-linecap="round"/>`;
    case "neutral":
    default:
      return `<path d="M ${t(-13)} ${y} q 13 -4 27 0" fill="none" stroke="#2a2330" stroke-width="5" stroke-linecap="round"/>`;
  }
}

function mouthMarkup(m: ExprSpec["mouth"]): string {
  const y = headY + 52;
  switch (m) {
    case "grin":
      return `<path d="M ${cx - 26} ${y - 4} q 26 30 52 0 q -26 8 -52 0 z" fill="#7a2f3a"/><path d="M ${cx - 22} ${y - 2} q 22 6 44 0" fill="#fff"/>`;
    case "smile":
      return `<path d="M ${cx - 20} ${y} q 20 20 40 0" fill="none" stroke="#7a2f3a" stroke-width="5" stroke-linecap="round"/>`;
    case "frown":
      return `<path d="M ${cx - 18} ${y + 8} q 18 -16 36 0" fill="none" stroke="#7a2f3a" stroke-width="5" stroke-linecap="round"/>`;
    case "open":
      return `<ellipse cx="${cx}" cy="${y + 4}" rx="14" ry="18" fill="#7a2f3a"/><ellipse cx="${cx}" cy="${y + 10}" rx="8" ry="7" fill="#e2607a"/>`;
    case "pout":
      return `<path d="M ${cx - 14} ${y + 2} q 14 -10 28 0" fill="none" stroke="#7a2f3a" stroke-width="5" stroke-linecap="round"/>`;
    case "flat":
    default:
      return `<path d="M ${cx - 16} ${y + 2} h 32" fill="none" stroke="#7a2f3a" stroke-width="5" stroke-linecap="round"/>`;
  }
}

function hairBack(c: CharSpec): string {
  const { hair, hairShade, hairStyle } = c;
  switch (hairStyle) {
    case "long":
      return `<path d="M ${cx - 110} ${headY - 20} q -14 150 22 210 l 196 0 q 36 -60 22 -210 q -120 -120 -240 0 z" fill="${hairShade}"/>`;
    case "twin":
      return `<g fill="${hairShade}"><ellipse cx="${cx - 96}" cy="${headY + 70}" rx="34" ry="60"/><ellipse cx="${cx + 96}" cy="${headY + 70}" rx="34" ry="60"/></g>`;
    case "ponytail":
      return `<path d="M ${cx + 80} ${headY - 30} q 80 40 50 150 q -10 40 -44 30 q 26 -80 -20 -160 z" fill="${hairShade}"/>`;
    default:
      return "";
  }
}

function hairFront(c: CharSpec): string {
  const { hair, hairShade, hairStyle } = c;
  const sheen = `<path d="M ${cx - 60} ${headY - 78} q 50 -26 110 6 q -40 -8 -110 18 z" fill="#ffffff" opacity="0.18"/>`;
  let crown = "";
  switch (hairStyle) {
    case "spiky":
      crown = `<path d="M ${cx - 100} ${headY - 30} l 18 -56 l 18 40 l 20 -64 l 22 56 l 20 -52 l 22 62 l 22 -44 l 14 60 q -96 -34 -176 0 z" fill="${hair}"/>`;
      break;
    case "bob":
      crown = `<path d="M ${cx - 104} ${headY + 20} q -16 -150 104 -150 q 120 0 104 150 q -30 -70 -104 -64 q -74 -6 -104 64 z" fill="${hair}"/>`;
      break;
    case "short":
      crown = `<path d="M ${cx - 100} ${headY - 8} q -10 -120 100 -120 q 110 0 100 120 q -30 -64 -100 -58 q -70 -6 -100 58 z" fill="${hair}"/>`;
      break;
    default:
      crown = `<path d="M ${cx - 100} ${headY - 6} q -8 -130 100 -130 q 108 0 100 130 q -34 -70 -100 -62 q -66 -8 -100 62 z" fill="${hair}"/>`;
  }
  return `${crown}<path d="M ${cx - 96} ${headY - 40} q 30 -40 96 -34 q -50 6 -78 44 z" fill="${hairShade}" opacity="0.5"/>${sheen}`;
}

function extras(e: ExprSpec): string {
  let s = "";
  if (e.blush)
    s += `<ellipse cx="${cx - 56}" cy="${headY + 30}" rx="16" ry="9" fill="#ff9aa6" opacity="0.55"/><ellipse cx="${cx + 56}" cy="${headY + 30}" rx="16" ry="9" fill="#ff9aa6" opacity="0.55"/>`;
  if (e.tears)
    s += `<path d="M ${cx - 60} ${headY + 18} q -4 26 6 40 q 10 -14 6 -40 z" fill="#8fd3ff" opacity="0.85"/>`;
  if (e.sweat)
    s += `<path d="M ${cx + 78} ${headY - 30} q -14 18 0 30 q 14 -12 0 -30 z" fill="#8fd3ff" opacity="0.9"/>`;
  if (e.anger)
    s += `<g stroke="#e23b4e" stroke-width="5" stroke-linecap="round"><path d="M ${cx + 56} ${headY - 50} h 22"/><path d="M ${cx + 67} ${headY - 61} v 22"/><path d="M ${cx + 60} ${headY - 58} l 14 14"/><path d="M ${cx + 74} ${headY - 58} l -14 14"/></g>`;
  if (e.sparkle)
    s += `<g fill="#ffd76a"><path d="M ${cx - 86} ${headY - 70} l 4 10 l 10 4 l -10 4 l -4 10 l -4 -10 l -10 -4 l 10 -4 z"/><path d="M ${cx + 92} ${headY + 6} l 3 8 l 8 3 l -8 3 l -3 8 l -3 -8 l -8 -3 l 8 -3 z"/></g>`;
  return s;
}

function buildCharacterSvg(c: CharSpec, e: ExprSpec): string {
  const gid = `g_${c.id}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="${gid}_o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.outfit}"/><stop offset="1" stop-color="${c.outfitShade}"/></linearGradient>
  <radialGradient id="${gid}_s" cx="0.5" cy="0.42" r="0.62"><stop offset="0.7" stop-color="${c.skin}"/><stop offset="1" stop-color="${c.skinShade}"/></radialGradient>
</defs>
<path d="M ${cx - 120} ${H} q 12 -110 120 -132 q 108 22 120 132 z" fill="url(#${gid}_o)"/>
<path d="M ${cx - 34} ${headY + 92} h 68 v 30 q -34 18 -68 0 z" fill="url(#${gid}_s)"/>
${hairBack(c)}
<ellipse cx="${cx - headRx}" cy="${headY + 14}" rx="14" ry="20" fill="url(#${gid}_s)"/>
<ellipse cx="${cx + headRx}" cy="${headY + 14}" rx="14" ry="20" fill="url(#${gid}_s)"/>
<ellipse cx="${cx}" cy="${headY}" rx="${headRx}" ry="${headRy}" fill="url(#${gid}_s)"/>
${extras(e)}
${eyeMarkup(e.eyes, cx - 44, false)}
${eyeMarkup(e.eyes, cx + 44, true)}
${browMarkup(e.brow, cx - 44, false)}
${browMarkup(e.brow, cx + 44, true)}
${mouthMarkup(e.mouth)}
${hairFront(c)}
</svg>`;
}

export const CHARACTER_LIBRARY: CharacterAsset[] = CHARS.map((c) => ({
  id: c.id,
  label: c.label,
  emoji: c.emoji,
  width: 240,
  height: 320,
  expressions: EXPRESSIONS.map((e) => ({ id: e.id, label: e.label, svg: buildCharacterSvg(c, e) })),
}));
