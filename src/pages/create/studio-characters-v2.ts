// 2D 웹툰 캐릭터 라이브러리 V2 — 더 높은 완성도의 "라인아트 + 플랫 셀 컬러 + 큰 애니 눈" 그림체.
// studio-character-library.ts 의 대안(고화질) 세트. 같은 CharacterAsset 형태를 만족한다.
//
// V1 대비 개선점:
//  - 타원 머리 → 턱·볼 윤곽이 살아있는 face-path(유려한 V라인) + 볼/턱 그림자
//  - 눈: 흰자 + 라디얼 그라데이션 홍채 + 동공 + 듀얼 하이라이트 + 아래꺼풀 라인 + 윗속눈썹 쐐기
//  - 장르별 의상 실루엣 + 액세서리(무협 머리띠, 판타지 엘프귀·서클릿, 학원 교복깃·넥타이, 직장 블레이저)
//  - 표정 디테일: 이/혀/입속 음영, 땀방울, 하트동공, 멍울 홍조
//  - 헤어: 뒷머리·앞머리 2레이어 + 하이라이트 밴드 + 잔머리 결
// (3D 셀툰 포저는 Studio3DPoser.tsx; 이건 2D 「캐릭터」 피커용)
import type { CharacterAsset } from "./studio-characters";

const W = 360;
const H = 480;
const INK = "#241b29"; // 라인아트 잉크색
const LW = 4.5; // 외곽선 두께
const LW2 = 3; // 내부 라인 두께

const cx = 180;
const headY = 206;
const headRx = 92;
const headRy = 100;

// ─────────────────────────────────────────────────────────
// 표정 모델
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
// 캐릭터 모델 (장르/스타일)
// ─────────────────────────────────────────────────────────
type HairStyle =
  | "bob"
  | "long"
  | "short"
  | "twin"
  | "ponytail"
  | "wavy"
  | "bun"
  | "spiky"
  | "topknot" // 무협 상투
  | "flow"; // 판타지 긴 머리(엘프)

type Genre =
  | "shojo" // 순정 큰눈
  | "shonen" // 소년 액션
  | "slice" // 일상툰
  | "wuxia" // 무협
  | "fantasy" // 판타지
  | "romance" // 로맨스
  | "school" // 학원
  | "office"; // 직장

interface Char {
  id: string;
  label: string;
  emoji: string;
  genre: Genre;
  style: HairStyle;
  skin: string;
  skinSh: string;
  hair: string;
  hairSh: string;
  hairHi: string;
  iris: string; // 홍채 중심색
  irisRim: string; // 홍채 외곽색(라디얼)
  outfit: string;
  outfitSh: string;
  accent: string; // 깃/넥타이/머리띠 등 포인트색
  collar: string; // 목 안쪽/속옷 깃
  eyeScale?: number; // 눈 크기 배율(순정=크게, 소년=작게)
}

const CHARS: Char[] = [
  // 순정만화 큰눈
  { id: "yuna", label: "유나", emoji: "🌸", genre: "shojo", style: "long",
    skin: "#ffe3ca", skinSh: "#f4c6a0", hair: "#b06a3e", hairSh: "#8a4e2b", hairHi: "#e0a06a",
    iris: "#caa45a", irisRim: "#7a5326", outfit: "#f3a6c4", outfitSh: "#dd7ea6", accent: "#ffffff", collar: "#fff4f8", eyeScale: 1.14 },
  // 소년만화 액션
  { id: "kang", label: "강이", emoji: "🔥", genre: "shonen", style: "spiky",
    skin: "#f0c79c", skinSh: "#dba978", hair: "#171310", hairSh: "#0a0805", hairHi: "#403628", iris: "#c2402c", irisRim: "#7a2014",
    outfit: "#e8542f", outfitSh: "#c33a1c", accent: "#ffd24a", collar: "#fff1e0", eyeScale: 0.86 },
  // 일상툰 심플
  { id: "dani", label: "다니", emoji: "☕", genre: "slice", style: "bob",
    skin: "#ffe7d4", skinSh: "#f6d0b4", hair: "#3a2f2a", hairSh: "#241c18", hairHi: "#6a564a",
    iris: "#6b4e3a", irisRim: "#3a281c", outfit: "#7fb88f", outfitSh: "#5d9c6e", accent: "#fff", collar: "#f0fbf3", eyeScale: 0.94 },
  // 무협
  { id: "muyeong", label: "무영", emoji: "⚔️", genre: "wuxia", style: "topknot",
    skin: "#ecc499", skinSh: "#d6a674", hair: "#14110d", hairSh: "#080603", hairHi: "#3a322a",
    iris: "#4a3526", irisRim: "#1f140c", outfit: "#3a5a8f", outfitSh: "#274273", accent: "#b8323c", collar: "#eef2fb", eyeScale: 0.9 },
  // 판타지 (엘프)
  { id: "elen", label: "엘렌", emoji: "🧝", genre: "fantasy", style: "flow",
    skin: "#fbe6d4", skinSh: "#eecbb0", hair: "#cdd6e6", hairSh: "#a3aec4", hairHi: "#f0f4fb",
    iris: "#5fc2c9", irisRim: "#2a8f96", outfit: "#6b8f5a", outfitSh: "#4f7341", accent: "#d8c06a", collar: "#f2f7ec", eyeScale: 1.08 },
  // 로맨스
  { id: "seyeon", label: "세연", emoji: "💞", genre: "romance", style: "wavy",
    skin: "#ffe1c6", skinSh: "#f3c19a", hair: "#5a2d4a", hairSh: "#3e1d33", hairHi: "#9a5286",
    iris: "#a04a78", irisRim: "#5e2848", outfit: "#c75d8a", outfitSh: "#a8436e", accent: "#ffe1ec", collar: "#fff0f6", eyeScale: 1.1 },
  // 학원
  { id: "haeun", label: "하은", emoji: "🎒", genre: "school", style: "twin",
    skin: "#ffe7d6", skinSh: "#f7d0b6", hair: "#23314e", hairSh: "#14203a", hairHi: "#4f648c",
    iris: "#3a5286", irisRim: "#1f3258", outfit: "#2f3a55", outfitSh: "#1f293f", accent: "#d24a5a", collar: "#ffffff", eyeScale: 1.04 },
  // 직장
  { id: "jiwon", label: "지원", emoji: "💼", genre: "office", style: "ponytail",
    skin: "#f6d3b2", skinSh: "#e3b68d", hair: "#2a2420", hairSh: "#171210", hairHi: "#564c44",
    iris: "#5a4634", irisRim: "#2e2014", outfit: "#3b4660", outfitSh: "#28304a", accent: "#8fa6cf", collar: "#ffffff", eyeScale: 0.96 },
  // 순정 (단발 보브, 또다른 룩)
  { id: "narae", label: "나래", emoji: "🩷", genre: "shojo", style: "bun",
    skin: "#ffe6cf", skinSh: "#f5cbab", hair: "#d76a8e", hairSh: "#b24a6e", hairHi: "#ffa6c0",
    iris: "#d76a8e", irisRim: "#9a3a5e", outfit: "#8fd0e6", outfitSh: "#69b3cf", accent: "#fff", collar: "#eafaff", eyeScale: 1.12 },
  // 판타지 (마법사, 짧은 머리)
  { id: "ravi", label: "라비", emoji: "✨", genre: "fantasy", style: "short",
    skin: "#efc9a3", skinSh: "#dbab7e", hair: "#6a4bd0", hairSh: "#4a30a0", hairHi: "#a78ef0",
    iris: "#8a6cf0", irisRim: "#4a30a0", outfit: "#3a2d6a", outfitSh: "#281f4a", accent: "#ffd76a", collar: "#ece6ff", eyeScale: 1.02 },
  // 소년 액션 (포니테일 여전사)
  { id: "tara", label: "타라", emoji: "🏹", genre: "shonen", style: "ponytail",
    skin: "#e9bf92", skinSh: "#d2a172", hair: "#8a3a2a", hairSh: "#5e2418", hairHi: "#c06848",
    iris: "#c85a3a", irisRim: "#7a3220", outfit: "#4a7a5a", outfitSh: "#356043", accent: "#d4a23a", collar: "#f0f7f0", eyeScale: 0.92 },
  // 일상툰 (소년, 스파이키 심플)
  { id: "minho", label: "민호", emoji: "🎧", genre: "slice", style: "short",
    skin: "#f1cda7", skinSh: "#ddaf83", hair: "#2c3a4a", hairSh: "#19232f", hairHi: "#54677a",
    iris: "#3a4a5e", irisRim: "#1f2a38", outfit: "#e0a93b", outfitSh: "#c38f22", accent: "#fff", collar: "#fff8ec", eyeScale: 0.96 },
  // 로판 (북부대공 스타일 백발 적안)
  { id: "baekhan", label: "백한", emoji: "❄️", genre: "fantasy", style: "spiky",
    skin: "#f2f7fc", skinSh: "#d5e2f0", hair: "#ffffff", hairSh: "#d2dbe6", hairHi: "#eef5ff",
    iris: "#4ea3d7", irisRim: "#20679c", outfit: "#202e4d", outfitSh: "#111b30", accent: "#d4af37", collar: "#ffffff", eyeScale: 0.95 },
  // 무협 (흑발 장발 서생/검사 스타일)
  { id: "dowon", label: "도원", emoji: "🌙", genre: "wuxia", style: "flow",
    skin: "#ffece0", skinSh: "#f3ccb5", hair: "#2b2724", hairSh: "#14110f", hairHi: "#5a5047",
    iris: "#54463a", irisRim: "#2d221b", outfit: "#efeff4", outfitSh: "#cfcfda", accent: "#4a3b32", collar: "#3b3630", eyeScale: 0.98 },
];

// ─────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────
const ink = (w = LW) => `stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

// ─────────────────────────────────────────────────────────
// 눈 — 흰자 + 라디얼 홍채 + 동공 + 듀얼 하이라이트 + 윗속눈썹 + 아랫꺼풀
// ─────────────────────────────────────────────────────────
function eye(e: Expr["eye"], x: number, mir: boolean, c: Char, gid: string): string {
  const s = mir ? -1 : 1;
  const X = (d: number) => x + s * d;
  const y = headY + 10;
  const sc = c.eyeScale ?? 1;

  // 감은/웃는 눈
  if (e === "smile") {
    return `<path d="M ${X(-19)} ${y + 5} q 19 -22 38 0" fill="none" ${ink(6)}/>` +
      `<path d="M ${X(-13)} ${y + 9} q 13 7 26 0" fill="none" stroke="${INK}" stroke-width="2.5" opacity="0.5"/>`;
  }
  if (e === "wink") {
    return `<path d="M ${X(-19)} ${y + 5} q 19 -22 38 0" fill="none" ${ink(6)}/>`;
  }

  const rx = 15.5 * sc;
  const ry = (e === "wide" ? 23 : e === "angry" ? 15 : e === "sad" ? 17.5 : 20) * sc;
  const irisR = Math.min(rx - 1.5, ry - 2.5);
  const pupR = irisR * 0.42;

  // 하트 동공(사랑)
  const pupil = e === "love"
    ? `<path d="M ${x} ${y + irisR * 0.5} q -${pupR * 1.5} -${pupR * 1.3} -${pupR * 1.5} -${pupR * 0.2} q 0 -${pupR} ${pupR * 1.5} -${pupR * 0.6} q ${pupR * 1.5} -${pupR * 0.4} ${pupR * 1.5} ${pupR * 0.6} q 0 ${pupR * 1.1} -${pupR * 1.5} ${pupR * 1.3} z" fill="#3a0d1a"/>`
    : `<ellipse cx="${x}" cy="${y + 1}" rx="${pupR * 0.92}" ry="${pupR}" fill="#1a1018"/>`;

  // 윗 눈꺼풀/속눈썹 (장르별 두께)
  const lashW = c.genre === "shojo" || c.genre === "romance" ? 7 : 5.5;
  const lid =
    e === "angry"
      ? `<path d="M ${X(-rx - 2)} ${y - 9} q ${s * (rx + 1)} -1 ${s * (2 * rx + 3)} 8" fill="none" ${ink(lashW)}/>`
      : e === "sad"
        ? `<path d="M ${X(-rx)} ${y - 7} q ${s * rx} 5 ${s * 2 * rx} -3" fill="none" ${ink(lashW - 1)}/>`
        : `<path d="M ${X(-rx - 1)} ${y - ry + 5} q ${s * (rx + 1)} -8 ${s * (2 * rx + 2)} 1" fill="none" ${ink(lashW)}/>`;

  // 바깥쪽 속눈썹 꼬리(순정/로맨스 강조)
  const lashTail = (c.genre === "shojo" || c.genre === "romance")
    ? `<path d="M ${X(rx + 1)} ${y - ry + 6} q ${s * 8} -3 ${s * 13} 4" fill="none" ${ink(4)}/>`
    : "";

  return `
    <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>
    <clipPath id="${gid}_c"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/></clipPath>
    <g clip-path="url(#${gid}_c)">
      <circle cx="${x}" cy="${y + 1.5}" r="${irisR}" fill="url(#${gid}_i)"/>
      <circle cx="${x}" cy="${y + 1.5}" r="${irisR}" fill="none" stroke="${c.irisRim}" stroke-width="1.6" opacity="0.7"/>
      ${pupil}
      <circle cx="${X(-irisR * 0.4)}" cy="${y - irisR * 0.45}" r="${irisR * 0.34}" fill="#ffffff"/>
      <circle cx="${X(irisR * 0.45)}" cy="${y + irisR * 0.55}" r="${irisR * 0.16}" fill="#ffffff" opacity="0.85"/>
      <path d="M ${x - rx} ${y + ry - 2} q ${rx} 4 ${2 * rx} 0" fill="none" stroke="${INK}" stroke-width="1.6" opacity="0.35"/>
    </g>
    ${lid}${lashTail}`;
}

// ─────────────────────────────────────────────────────────
// 눈썹
// ─────────────────────────────────────────────────────────
function brow(b: Expr["brow"], x: number, mir: boolean, c: Char): string {
  const s = mir ? -1 : 1;
  const X = (d: number) => x + s * d;
  const y = headY - 28;
  const col = c.hairSh;
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
// 입 — 이/혀/입속 음영
// ─────────────────────────────────────────────────────────
function mouth(m: Expr["mouth"]): string {
  const y = headY + 58;
  switch (m) {
    case "grin":
      return `<path d="M ${cx - 25} ${y - 3} q 25 34 50 0 q -25 7 -50 0 z" fill="#8a2a3c" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx - 19} ${y - 1} q 19 6 38 0 l 0 5 q -19 4 -38 0 z" fill="#ffffff"/>` +
        `<path d="M ${cx - 9} ${y + 13} q 9 8 18 0 z" fill="#d4596e"/>`;
    case "smile":
      return `<path d="M ${cx - 20} ${y} q 20 19 40 0" fill="none" ${ink(5)}/>` +
        `<path d="M ${cx - 13} ${y + 4} q 13 8 26 0 l 0 2 q -13 6 -26 0 z" fill="#ffffff" stroke="${INK}" stroke-width="1.4"/>`;
    case "frown":
      return `<path d="M ${cx - 17} ${y + 8} q 17 -16 34 0" fill="none" ${ink(5)}/>`;
    case "open":
      return `<ellipse cx="${cx}" cy="${y + 4}" rx="13" ry="17" fill="#8a2a3c" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx - 7} ${y + 13} q 7 9 14 0 z" fill="#d4596e"/>` +
        `<path d="M ${cx - 9} ${y - 9} q 9 -5 18 0 l 0 3 q -9 4 -18 0 z" fill="#ffffff"/>`;
    case "pout":
      return `<path d="M ${cx - 13} ${y + 3} q 13 -10 26 0" fill="none" ${ink(5)}/>`;
    case "tongue":
      return `<path d="M ${cx - 18} ${y - 2} q 18 24 36 0 q -18 6 -36 0 z" fill="#8a2a3c" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx - 8} ${y + 8} q 8 16 16 0 q -2 -3 -16 0 z" fill="#ee7a90" stroke="${INK}" stroke-width="2"/>`;
    default: // flat
      return `<path d="M ${cx - 15} ${y + 2} q 15 5 30 0" fill="none" ${ink(4.5)}/>`;
  }
}

// ─────────────────────────────────────────────────────────
// 헤어 — 뒷머리(back) / 앞머리·정수리(front) 2레이어
// ─────────────────────────────────────────────────────────
function hairBack(c: Char): string {
  const { hairSh, style } = c;
  const st = ink(LW);
  switch (style) {
    case "long":
    case "wavy":
    case "flow":
      return `<path d="M ${cx - 106} ${headY - 22} q -22 168 16 244 q 14 26 42 24 q -18 -40 -8 -78 q -16 26 -22 6 q 8 -40 4 -120 m 200 -76 q 22 168 -16 244 q -14 26 -42 24 q 18 -40 8 -78 q 16 26 22 6 q -8 -40 -4 -120 z" fill="${hairSh}" ${st}/>`;
    case "twin":
      return `<g fill="${hairSh}" ${st}>` +
        `<path d="M ${cx - 96} ${headY + 14} q -34 18 -30 70 q 2 40 26 56 q 12 -10 6 -30 q 18 -6 16 -30 q 8 -20 -4 -40 q 6 -18 -14 -26 z"/>` +
        `<path d="M ${cx + 96} ${headY + 14} q 34 18 30 70 q -2 40 -26 56 q -12 -10 -6 -30 q -18 -6 -16 -30 q -8 -20 4 -40 q -6 -18 14 -26 z"/></g>`;
    case "ponytail":
      return `<path d="M ${cx + 60} ${headY - 40} q 96 30 78 168 q -6 50 -44 54 q -14 4 -22 -10 q 26 -18 22 -56 q 24 -70 -34 -160 z" fill="${hairSh}" ${st}/>`;
    case "bun":
      return `<circle cx="${cx}" cy="${headY - 100}" r="34" fill="${hairSh}" ${st}/>` +
        `<path d="M ${cx - 24} ${headY - 118} q 24 -16 48 0" fill="none" stroke="${c.hairHi}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>`;
    case "topknot":
      return `<ellipse cx="${cx}" cy="${headY - 108}" rx="22" ry="30" fill="${hairSh}" ${st}/>`;
    default:
      return "";
  }
}

function hairFront(c: Char): string {
  const { hair, hairHi, style } = c;
  const st = `stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round" stroke-linecap="round"`;
  let crown: string;
  switch (style) {
    case "spiky":
      crown =
        `<path d="M ${cx - 100} ${headY - 8} l 16 -64 l 20 44 l 18 -70 l 24 56 l 20 -64 l 22 66 l 20 -50 l 18 60 l 16 -34 l 12 50 q -110 -38 -206 0 z" fill="${hair}" ${st}/>`;
      break;
    case "short":
      crown =
        `<path d="M ${cx - 102} ${headY + 4} q -14 -126 102 -126 q 116 0 102 126 q -30 -60 -68 -66 q -10 42 -38 46 q -8 -36 -30 -32 q -44 4 -68 52 z" fill="${hair}" ${st}/>`;
      break;
    case "twin":
      crown =
        `<path d="M ${cx - 104} ${headY - 2} q -10 -130 104 -130 q 114 0 104 130 q -36 -66 -88 -66 q -16 38 -46 42 q -6 -8 -14 -2 q -40 0 -64 90 z" fill="${hair}" ${st}/>`;
      break;
    case "ponytail":
      crown =
        `<path d="M ${cx - 100} ${headY - 4} q -10 -126 100 -126 q 110 0 100 126 q -34 -64 -84 -66 q -14 36 -44 40 q -38 0 -72 90 z" fill="${hair}" ${st}/>`;
      break;
    case "topknot":
      // 무협: 깔끔히 넘긴 정수리 + 가운데 가르마
      crown =
        `<path d="M ${cx - 96} ${headY + 2} q -12 -118 96 -118 q 108 0 96 118 q -26 -56 -60 -68 q -10 38 -36 42 q -8 -34 -36 -34 q -34 8 -60 60 z" fill="${hair}" ${st}/>` +
        `<path d="M ${cx} ${headY - 110} q -2 36 0 60" fill="none" stroke="${c.hairSh}" stroke-width="3" opacity="0.5"/>`;
      break;
    case "flow": // 판타지: 가운데 가르마 + 흐르는 앞머리
      crown =
        `<path d="M ${cx - 104} ${headY + 8} q -8 -130 104 -130 q 112 0 104 130 q -28 -64 -58 -82 q -22 32 -50 40 q -28 -8 -50 40 q -34 8 -54 2 z" fill="${hair}" ${st}/>` +
        `<path d="M ${cx} ${headY - 122} q -6 50 -2 80" fill="none" stroke="${c.hairSh}" stroke-width="3" opacity="0.5"/>`;
      break;
    case "wavy":
      crown =
        `<path d="M ${cx - 104} ${headY + 8} q -10 -132 104 -132 q 114 0 104 132 q -26 -54 -56 -66 q -8 18 -24 22 q 6 16 -8 22 q -16 -2 -22 -18 q -10 30 -38 36 q -36 6 -64 -18 z" fill="${hair}" ${st}/>`;
      break;
    default: // bob / long
      crown =
        `<path d="M ${cx - 104} ${headY + 8} q -10 -134 104 -134 q 116 0 104 134 q -30 -68 -70 -70 q -14 40 -46 46 q -10 -8 -18 -2 q -38 6 -74 26 z" fill="${hair}" ${st}/>`;
  }
  // 하이라이트 밴드 + 잔머리 결
  const hi =
    `<path d="M ${cx - 58} ${headY - 92} q 56 -26 116 4" fill="none" stroke="${hairHi}" stroke-width="9" stroke-linecap="round" opacity="0.8"/>` +
    `<path d="M ${cx - 44} ${headY - 78} q 44 -16 88 2" fill="none" stroke="${hairHi}" stroke-width="4" stroke-linecap="round" opacity="0.5"/>`;
  return `${crown}${hi}`;
}

// ─────────────────────────────────────────────────────────
// 장르별 의상 실루엣 + 깃/포인트
// ─────────────────────────────────────────────────────────
function outfit(c: Char, gid: string): string {
  const body = `<path d="M ${cx - 128} ${H} q 8 -120 128 -144 q 120 24 128 144 z" fill="url(#${gid}_o)" stroke="${INK}" stroke-width="${LW}"/>`;
  // 목 + 어깨 위 셰이딩
  const shade = `<path d="M ${cx - 110} ${H} q 14 -96 90 -120 q -50 40 -54 120 z" fill="${c.outfitSh}" opacity="0.45"/>`;
  let detail = "";
  switch (c.genre) {
    case "school":
      // 세일러/교복 깃 + 넥타이
      detail =
        `<path d="M ${cx - 64} ${headY + 100} l 64 30 l 64 -30 l 0 36 l -64 26 l -64 -26 z" fill="${c.collar}" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx - 64} ${headY + 100} l 0 36 l 22 10 l 0 -32 z" fill="${c.accent}" opacity="0.9"/>` +
        `<path d="M ${cx + 64} ${headY + 100} l 0 36 l -22 10 l 0 -32 z" fill="${c.accent}" opacity="0.9"/>` +
        `<path d="M ${cx} ${headY + 128} l 9 16 l -9 30 l -9 -30 z" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>`;
      break;
    case "office":
      // 블레이저 라펠 + 셔츠 + 넥타이
      detail =
        `<path d="M ${cx - 70} ${headY + 104} l 70 26 l 70 -26 l 6 30 l -56 22 l 0 96 l -40 0 l 0 -96 l -56 -22 z" fill="${c.collar}" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx - 70} ${headY + 104} l 30 14 l -28 70 z" fill="${c.outfitSh}" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx + 70} ${headY + 104} l -30 14 l 28 70 z" fill="${c.outfitSh}" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx} ${headY + 130} l 11 12 l -7 70 l -8 0 l -7 -70 z" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>`;
      break;
    case "wuxia":
      // 한푸/도복 교차 깃
      detail =
        `<path d="M ${cx - 74} ${headY + 110} q 74 50 148 0 l 0 24 q -10 12 -28 6 l -46 36 l -46 -36 q -18 6 -28 -6 z" fill="${c.collar}" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx - 4} ${headY + 120} l 4 60 l 4 -60 q -4 -6 -8 0 z" fill="${c.accent}"/>` +
        `<path d="M ${cx} ${headY + 144} l 30 20 l -2 18 l -28 -22 l -28 22 l -2 -18 z" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>`;
      break;
    case "fantasy":
      // 망토 깃 + 클래스프 보석
      detail =
        `<path d="M ${cx - 80} ${headY + 104} q 80 40 160 0 l -16 40 l -64 18 l -64 -18 z" fill="${c.outfitSh}" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx - 36} ${headY + 100} q 36 26 72 0 l -6 18 q -30 18 -60 0 z" fill="${c.collar}" stroke="${INK}" stroke-width="2"/>` +
        `<circle cx="${cx}" cy="${headY + 126}" r="9" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>` +
        `<circle cx="${cx - 3}" cy="${headY + 123}" r="3" fill="#fff" opacity="0.8"/>`;
      break;
    case "shonen":
      // 지퍼 자켓 + 칼라
      detail =
        `<path d="M ${cx - 70} ${headY + 104} q 70 36 140 0 l 0 24 q -36 22 -70 22 q -34 0 -70 -22 z" fill="${c.outfitSh}" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx} ${headY + 118} l 0 100" fill="none" stroke="${c.accent}" stroke-width="5" stroke-dasharray="3 5"/>` +
        `<circle cx="${cx}" cy="${headY + 120}" r="6" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>`;
      break;
    default: {
      // 순정/일상/로맨스: 라운드 넥 + 안쪽 깃
      detail =
        `<path d="M ${cx - 44} ${headY + 100} q 44 30 88 0 l 0 26 q -44 24 -88 0 z" fill="${c.collar}" stroke="${INK}" stroke-width="${LW2}"/>` +
        (c.genre === "romance"
          ? `<path d="M ${cx - 30} ${headY + 116} q 30 -10 60 0" fill="none" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>`
          : "");
    }
  }
  return `${body}${shade}${detail}`;
}

// ─────────────────────────────────────────────────────────
// 장르별 헤드 액세서리 (머리 위 레이어)
// ─────────────────────────────────────────────────────────
function headAccessory(c: Char): string {
  switch (c.genre) {
    case "wuxia":
      // 머리띠 + 상투 매듭
      return `<path d="M ${cx - 90} ${headY - 60} q 90 -26 180 0 l 0 14 q -90 -22 -180 0 z" fill="${c.accent}" stroke="${INK}" stroke-width="${LW2}"/>` +
        `<path d="M ${cx + 88} ${headY - 56} q 26 6 30 28 q -14 -6 -22 4 q 2 -18 -8 -32 z" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>` +
        `<path d="M ${cx} ${headY - 138} q -10 -8 0 -16 q 10 8 0 16 z" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>`;
    case "fantasy":
      if (c.style === "flow") {
        // 엘프 귀 + 서클릿
        return `<path d="M ${cx - headRx - 2} ${headY - 4} q -22 -10 -24 -34 q 16 6 30 22 z" fill="${c.skin}" stroke="${INK}" stroke-width="${LW2}"/>` +
          `<path d="M ${cx + headRx + 2} ${headY - 4} q 22 -10 24 -34 q -16 6 -30 22 z" fill="${c.skin}" stroke="${INK}" stroke-width="${LW2}"/>` +
          `<path d="M ${cx - 78} ${headY - 70} q 78 -22 156 0" fill="none" stroke="${c.accent}" stroke-width="5" stroke-linecap="round"/>` +
          `<path d="M ${cx} ${headY - 78} l 7 12 l -7 12 l -7 -12 z" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>`;
      }
      // 마법사: 별 장식
      return `<g fill="${c.accent}" stroke="${INK}" stroke-width="1.5"><path d="M ${cx + 64} ${headY - 90} l 5 11 l 11 2 l -8 9 l 2 12 l -10 -6 l -10 6 l 2 -12 l -8 -9 l 11 -2 z"/></g>`;
    case "school":
      // 머리핀
      return `<path d="M ${cx - 70} ${headY - 70} l 26 -6 l 4 12 l -26 6 z" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>`;
    default:
      return "";
  }
}

// ─────────────────────────────────────────────────────────
// 표정 부가물 (홍조/눈물/분노표시/반짝임/땀)
// ─────────────────────────────────────────────────────────
function extras(e: Expr): string {
  let s = "";
  if (e.blush) {
    const op = e.blush === "strong" ? 0.72 : 0.5;
    const w = e.blush === "strong" ? 17 : 15;
    s += `<g opacity="${op}">` +
      `<ellipse cx="${cx - 60}" cy="${headY + 36}" rx="${w}" ry="9" fill="#ff8a9c"/>` +
      `<ellipse cx="${cx + 60}" cy="${headY + 36}" rx="${w}" ry="9" fill="#ff8a9c"/>`;
    if (e.blush === "strong")
      s += `<g stroke="#ff8a9c" stroke-width="2" stroke-linecap="round">` +
        `<path d="M ${cx - 70} ${headY + 30} v 12"/><path d="M ${cx - 60} ${headY + 30} v 12"/><path d="M ${cx - 50} ${headY + 30} v 12"/>` +
        `<path d="M ${cx + 70} ${headY + 30} v 12"/><path d="M ${cx + 60} ${headY + 30} v 12"/><path d="M ${cx + 50} ${headY + 30} v 12"/></g>`;
    s += `</g>`;
  }
  if (e.tears) {
    s += `<g fill="#9fd8ff" stroke="${INK}" stroke-width="1.6">` +
      `<path d="M ${cx - 64} ${headY + 24} q -6 30 4 46 q 12 -16 6 -46 z"/>` +
      `<path d="M ${cx + 64} ${headY + 24} q 6 30 -4 46 q -12 -16 -6 -46 z"/></g>` +
      `<ellipse cx="${cx - 60}" cy="${headY + 30}" rx="4" ry="6" fill="#dff2ff" opacity="0.9"/>`;
  }
  if (e.anger) {
    s += `<g stroke="#e23b4e" stroke-width="5" stroke-linecap="round">` +
      `<path d="M ${cx + 52} ${headY - 56} h 24"/><path d="M ${cx + 64} ${headY - 68} v 24"/>` +
      `<path d="M ${cx + 56} ${headY - 64} l 16 16"/><path d="M ${cx + 72} ${headY - 64} l -16 16"/></g>`;
  }
  if (e.sweat) {
    s += `<path d="M ${cx + 72} ${headY - 30} q -8 18 0 28 q 14 -6 8 -22 q -3 -6 -8 -6 z" fill="#bfe6ff" stroke="${INK}" stroke-width="2"/>` +
      `<ellipse cx="${cx + 73}" cy="${headY - 16}" rx="2.5" ry="4" fill="#ffffff" opacity="0.85"/>`;
  }
  if (e.sparkle) {
    s += `<g fill="#ffd76a" stroke="${INK}" stroke-width="1.5">` +
      `<path d="M ${cx - 96} ${headY - 66} l 5 12 l 12 5 l -12 5 l -5 12 l -5 -12 l -12 -5 l 12 -5 z"/>` +
      `<path d="M ${cx + 98} ${headY + 6} l 4 10 l 10 4 l -10 4 l -4 10 l -4 -10 l -10 -4 l 10 -4 z"/>` +
      `<circle cx="${cx + 88}" cy="${headY - 50}" r="3"/><circle cx="${cx - 88}" cy="${headY + 24}" r="2.5"/></g>`;
  }
  return s;
}

// ─────────────────────────────────────────────────────────
// 얼굴 윤곽 path (턱·볼 V라인) — 타원 대신 유려한 베지에 실루엣
// ─────────────────────────────────────────────────────────
function faceOutline(c: Char): string {
  const tx = headRx;
  const top = headY - headRy + 4;
  const browTemple = headY - 18;
  const cheek = headY + 20;
  const jaw = headY + 64;
  const chin = headY + headRy + 12;
  const d =
    `M ${cx} ${top} ` +
    `C ${cx + tx * 0.7} ${top} ${cx + tx} ${browTemple - 30} ${cx + tx} ${browTemple} ` + // 우 이마→관자
    `C ${cx + tx} ${cheek} ${cx + tx - 8} ${jaw - 18} ${cx + tx - 26} ${jaw} ` + // 우 볼
    `C ${cx + tx - 44} ${jaw + 26} ${cx + 26} ${chin - 6} ${cx} ${chin} ` + // 우 턱→턱끝
    `C ${cx - 26} ${chin - 6} ${cx - tx + 44} ${jaw + 26} ${cx - tx + 26} ${jaw} ` + // 좌 턱
    `C ${cx - tx + 8} ${jaw - 18} ${cx - tx} ${cheek} ${cx - tx} ${browTemple} ` + // 좌 볼
    `C ${cx - tx} ${browTemple - 30} ${cx - tx * 0.7} ${top} ${cx} ${top} Z`;
  return `<path d="${d}" fill="${c.skin}" stroke="${INK}" stroke-width="${LW}"/>`;
}

// ─────────────────────────────────────────────────────────
// 조립
// ─────────────────────────────────────────────────────────
function build(c: Char, e: Expr): string {
  const g = `v2_${c.id}_${e.id}`;
  const lid = `${g}_L`;
  const rid = `${g}_R`;
  const chin = headY + headRy + 12;
  // 코(작은 그림자 점/선) — 표정별 미세
  const nose = `<path d="M ${cx - 2} ${headY + 26} q 4 8 8 1" fill="none" stroke="${c.skinSh}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="${g}_o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.outfit}"/><stop offset="1" stop-color="${c.outfitSh}"/></linearGradient>
  <radialGradient id="${lid}_i" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="${c.iris}"/><stop offset="1" stop-color="${c.irisRim}"/></radialGradient>
  <radialGradient id="${rid}_i" cx="0.6" cy="0.35" r="0.75"><stop offset="0" stop-color="${c.iris}"/><stop offset="1" stop-color="${c.irisRim}"/></radialGradient>
</defs>
${outfit(c, g)}
<path d="M ${cx - 30} ${chin - 30} h 60 v 26 q -30 18 -60 0 z" fill="${c.skin}" stroke="${INK}" stroke-width="${LW2}"/>
<path d="M ${cx - 30} ${chin - 30} h 60 v 8 q -30 12 -60 0 z" fill="${c.skinSh}" opacity="0.4"/>
${hairBack(c)}
${faceOutline(c)}
<ellipse cx="${cx - headRx + 6}" cy="${headY + 20}" rx="12" ry="17" fill="${c.skin}" stroke="${INK}" stroke-width="${LW2}"/>
<ellipse cx="${cx + headRx - 6}" cy="${headY + 20}" rx="12" ry="17" fill="${c.skin}" stroke="${INK}" stroke-width="${LW2}"/>
<path d="M ${cx + headRx - 20} ${headY - 16} q 22 50 -2 92 q -8 14 -22 22 q 40 -2 56 -42 q 8 -40 -32 -72 z" fill="${c.skinSh}" opacity="0.3"/>
${extras(e)}
${eye(e.eye, cx - 44, false, c, lid)}
${eye(e.eye, cx + 44, true, c, rid)}
${brow(e.brow, cx - 44, false, c)}
${brow(e.brow, cx + 44, true, c)}
${nose}
${mouth(e.mouth)}
${hairFront(c)}
${headAccessory(c)}
</svg>`;
}

export const CHARACTER_LIBRARY_V2: CharacterAsset[] = CHARS.map((c) => ({
  id: c.id,
  label: c.label,
  emoji: c.emoji,
  width: 240,
  height: 320,
  expressions: EXPRS.map((e) => ({ id: e.id, label: e.label, svg: build(c, e) })),
}));
