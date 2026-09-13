/** Original, local-only creative exercises. No inference, catalog or paid API required. */
export type Point = { x: number; y: number };
export type Stroke = { points: Point[]; color: string; size: number; erase?: boolean };
export const PAPER = "#f7f0e3";
export const INK = "#322b28";
export const MAX_STROKES = 160;
export const MAX_POINTS = 12000;
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const hashSeed = (seed: string) => {
  let h = 2166136261;
  for (const c of seed.slice(0, 200)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
export function randomFrom(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const koreaDay = (date = new Date()) => new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const freshSeed = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const safeSeed = (seed: string | null | undefined) => seed && /^[\w.-]{1,100}$/.test(seed) ? seed : "creative";

export const DRAW_PROMPTS = [
  ["비 오는 날의 작은 우체부", "우산보다 큰 편지를 들려 주세요.", "실루엣만 보아도 직업이 느껴지게 그려 보세요."],
  ["새벽 편의점의 마법사", "평범한 물건 하나를 마법 도구로 바꿔 보세요.", "가장 밝은 곳을 한 군데만 정해 보세요."],
  ["구름을 수리하는 정비사", "공구와 구름의 재질을 다르게 표현해 보세요.", "크고 단순한 덩어리부터 시작해 보세요."],
  ["달에서 문을 연 빵집", "중력이 약한 장면을 한 가지 넣어 주세요.", "둥근 형태와 각진 형태를 함께 사용해 보세요."],
  ["출근하는 숲의 수호자", "숲의 물건으로 출근 소품을 만들어 보세요.", "캐릭터의 무게중심을 한쪽으로 옮겨 보세요."],
  ["잃어버린 별을 찾는 탐정", "단서 하나를 화면 앞쪽에 크게 배치해 보세요.", "앞·중간·뒤의 세 덩어리로 공간을 나눠 보세요."],
  ["로봇의 첫 소풍", "처음 보는 자연을 발견한 표정을 담아 보세요.", "눈썹과 어깨만으로 감정을 전달해 보세요."],
  ["바다 위를 달리는 도서관", "파도와 책의 움직임을 연결해 보세요.", "수평선의 위치를 먼저 정해 보세요."],
  ["늦잠 잔 시간 여행자", "시대가 다른 소품 두 개를 배치해 보세요.", "기울어진 대각선으로 급한 마음을 표현해 보세요."],
  ["노을을 배달하는 자전거", "노을을 담는 용기를 상상해 보세요.", "빛과 그림자의 면적을 다르게 해 보세요."],
  ["겁이 많은 용의 면접", "용의 덩치와 소품의 크기를 대비해 보세요.", "강한 외형과 약한 몸짓을 함께 써 보세요."],
  ["유령과 나누는 야식", "맛있는 냄새가 느껴지는 선을 넣어 보세요.", "반복되는 곡선으로 편안한 분위기를 만들어 보세요."],
  ["비밀 정원의 마지막 열쇠", "열쇠의 모양에 정원의 특징을 담아 보세요.", "중요한 물건 주위에 여백을 남겨 보세요."],
  ["우주 정거장의 고양이", "좁은 창밖으로 큰 우주를 보여 주세요.", "동그란 실루엣 하나를 주인공으로 정해 보세요."],
  ["겨울을 모으는 여행 가방", "계절을 나타내는 물건 세 개를 골라 보세요.", "소품을 같은 크기로 나열하지 말아 보세요."],
  ["골목의 소리를 그리는 화가", "소리를 선과 도형으로 표현해 보세요.", "선의 굵기를 세 단계로 제한해 보세요."],
  ["처음 날아 보는 종이 새", "출발점과 도착점이 느껴지게 그려 보세요.", "화면의 시선이 한 방향으로 흐르게 해 보세요."],
  ["잠든 도시를 깨우는 꽃", "작은 꽃과 큰 건물을 대비해 보세요.", "주인공만 밝게 남겨 시선을 모아 보세요."],
  ["꿈을 말리는 빨랫줄", "서로 다른 꿈 세 개를 상징으로 표현해 보세요.", "빈 공간도 구성의 일부로 사용해 보세요."],
  ["기억을 파는 작은 가게", "가격표 대신 감정 하나를 붙여 보세요.", "소품의 반복에 한 가지 예외를 만들어 보세요."],
  ["책장을 넘어온 기사", "책의 글자를 배경 요소로 바꿔 보세요.", "전경을 크게 잘라 깊이를 만들어 보세요."],
  ["구름 위의 버스 정류장", "누군가를 기다리는 몸짓을 담아 보세요.", "수평선과 인물의 비율을 실험해 보세요."],
  ["표정을 잃어버린 가면", "눈과 입 없이 감정을 전달해 보세요.", "몸의 기울기와 손의 위치에 집중해 보세요."],
  ["한밤중의 작은 축제", "세 가지 색만 사용해 보세요.", "반짝임보다 어두운 면을 먼저 정해 보세요."],
] as const;
export const promptFor = (seed: string, offset = 0) => DRAW_PROMPTS[(hashSeed(seed) + offset) % DRAW_PROMPTS.length];

export const STORY_DECKS = [
  { label: "장르", items: ["일상 판타지", "따뜻한 SF", "학원 미스터리", "힐링 모험", "로맨틱 코미디", "도시 판타지", "성장 드라마", "무성 코미디"] },
  { label: "주인공", items: ["거짓말을 못 하는 탐정", "퇴직을 앞둔 로봇", "꿈을 수선하는 학생", "겁이 많은 수호령", "미래의 편지를 받는 우체부", "방향 감각을 잃은 여행자", "소리를 볼 수 있는 요리사", "감정을 숨기는 마법사", "물건의 기억을 읽는 수리공", "작은 소원을 모으는 고양이", "실수로 유명해진 조연", "첫 출근을 한 용"] },
  { label: "무대", items: ["매일 모양이 바뀌는 골목", "바다 아래 오래된 역", "새벽에만 열리는 편의점", "달로 가는 마지막 버스", "아무도 없는 옥상 정원", "시간이 멈춘 도서관", "구름 위 중고 가게", "축제 전날의 작은 마을", "졸업식이 끝난 교실", "비 오는 우주 정거장", "문 하나뿐인 미술관", "밤마다 이동하는 등대"] },
  { label: "사건", items: ["모두가 같은 꿈을 꾸기 시작한다", "가장 소중한 물건이 말을 건다", "내일의 자신에게 경고를 받는다", "주운 열쇠가 예상 밖의 문을 연다", "하루에 한 번 기억이 바뀐다", "사라진 친구의 흔적이 나타난다", "평범한 약속이 세상을 흔든다", "마지막 기회를 모르는 사람에게 양보한다", "배달물이 엉뚱한 시간을 향한다", "익숙한 장소에서 낯선 이름을 발견한다", "작은 실수가 마을의 비밀을 드러낸다", "누군가의 소원이 반대로 이루어진다"] },
  { label: "반전", items: ["적이라고 생각한 존재가 가장 오래된 친구다", "해결의 단서는 첫 장면에 이미 있었다", "잃어버린 것은 물건이 아니라 용기였다", "주인공의 작은 친절이 시간을 돌아온다", "모두를 구하는 방법은 완벽을 포기하는 것이다", "이 여행은 누군가의 첫 번째 기억이다", "범인은 악의가 아닌 서투른 배려였다", "돌아가는 길이 새로운 시작이 된다", "다른 사람도 같은 비밀을 간직하고 있다", "뜻밖의 조연이 마지막 선택을 한다"] },
] as const;
export const storyIndices = (seed: string) => {
  const random = randomFrom(seed);
  return STORY_DECKS.map((deck) => Math.floor(random() * deck.items.length));
};
export function parseStoryCode(code: string | null): number[] | null {
  if (!code || !/^\d{1,2}(\.\d{1,2}){4}$/.test(code)) return null;
  const indices = code.split(".").map(Number);
  return indices.every((n, i) => n >= 0 && n < STORY_DECKS[i].items.length) ? indices : null;
}
export function rerollStory(current: number[], locks: boolean[], seed: string): number[] {
  const random = randomFrom(seed);
  return STORY_DECKS.map((deck, i) => {
    const old = clamp(current[i] ?? 0, 0, deck.items.length - 1);
    return locks[i] ? old : (old + 1 + Math.floor(random() * (deck.items.length - 1))) % deck.items.length;
  });
}
export const storyText = (indices: number[]) => STORY_DECKS.map((deck, i) => `${deck.label}: ${deck.items[indices[i]] ?? deck.items[0]}`).join("\n");

export type Hsl = { h: number; s: number; l: number };
export function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}
export const hslHex = (color: Hsl) => `#${hslToRgb(color).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
/** Practice metric, not a monitor calibration or a perceptual/medical assessment. */
export function colorScore(target: Hsl, guess: Hsl): number {
  const a = hslToRgb(target); const b = hslToRgb(guess);
  const distance = Math.sqrt(a.reduce((sum, n, i) => sum + (n - b[i]) ** 2, 0) / 3) / 255;
  return Math.round(100 * Math.exp(-6 * distance));
}
export const colorTarget = (seed: string): Hsl => {
  const r = randomFrom(seed);
  return { h: Math.floor(r() * 360), s: 35 + Math.floor(r() * 50), l: 30 + Math.floor(r() * 40) };
};
export type Harmony = "analogous" | "complementary" | "triadic" | "mono";
export const HARMONIES: Record<Harmony, string> = { analogous: "유사색", complementary: "보색", triadic: "삼각 배색", mono: "단색 명도" };
export function paletteFor(seed: string, harmony: Harmony): string[] {
  const r = randomFrom(seed); const h = Math.floor(r() * 360); const s = 38 + Math.floor(r() * 30);
  const offsets = { analogous: [-36, -18, 0, 18, 36], complementary: [0, 15, 180, 195, 0], triadic: [0, 120, 240, 120, 0], mono: [0, 0, 0, 0, 0] }[harmony];
  return offsets.map((offset, i) => hslHex({ h: h + offset, s, l: [18, 35, 53, 72, 89][i] }));
}
export const PALETTE_PRESETS = [
  { name: "비 오는 골목", colors: ["#253345", "#4a6672", "#88a7a6", "#d3b79c", "#f2e4cf"] },
  { name: "복숭아빛 하교", colors: ["#463541", "#9b5c62", "#db8f80", "#efbd98", "#f9e7c2"] },
  { name: "숲의 작은 우체국", colors: ["#293e34", "#52664a", "#9da56b", "#d7b580", "#f1e6cb"] },
  { name: "달빛 탐정 사무소", colors: ["#292b40", "#55567b", "#9293b3", "#c6a27f", "#f1dfbc"] },
  { name: "레트로 문방구", colors: ["#3d3633", "#ba5e47", "#dfb45e", "#709592", "#f5ead6"] },
  { name: "바닷가의 여름", colors: ["#274d5a", "#418c98", "#9bcbbf", "#e5bc81", "#f7e6c3"] },
] as const;
export function validStrokes(value: unknown): value is Stroke[] {
  if (!Array.isArray(value) || value.length > MAX_STROKES) return false;
  let count = 0;
  return value.every((stroke: unknown) => {
    if (!stroke || typeof stroke !== "object") return false;
    const s = stroke as Stroke;
    if (typeof s.color !== "string" || !/^#[\da-f]{6}$/i.test(s.color) || !Number.isFinite(s.size) || s.size < 1 || s.size > 40 || (s.erase !== undefined && typeof s.erase !== "boolean") || !Array.isArray(s.points) || !s.points.length) return false;
    count += s.points.length;
    return count <= MAX_POINTS && s.points.every((p: Point) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  });
}
export const escapeXml = (text: string) => text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
export function pointPath(points: Point[], width = 960, height = 600): string {
  if (!points.length) return "";
  const xy = (p: Point) => `${(p.x * width).toFixed(2)} ${(p.y * height).toFixed(2)}`;
  if (points.length < 3) return `M ${xy(points[0])} ${points.slice(1).map((p) => `L ${xy(p)}`).join(" ")}`;
  return `M ${xy(points[0])} ${points.slice(1, -1).map((p, i) => `Q ${xy(p)} ${xy({ x: (p.x + points[i + 2].x) / 2, y: (p.y + points[i + 2].y) / 2 })}`).join(" ")} L ${xy(points[points.length - 1])}`;
}
export function strokeSvg(strokes: Stroke[], width = 960, height = 600): string {
  return strokes.map((s) => {
    const color = s.erase ? PAPER : s.color;
    return s.points.length === 1
      ? `<circle cx="${s.points[0].x * width}" cy="${s.points[0].y * height}" r="${s.size / 2}" fill="${color}"/>`
      : `<path d="${pointPath(s.points, width, height)}" stroke="${color}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  }).join("");
}
export const svgDocument = (body: string, width: number, height: number, title: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escapeXml(title)}</title><rect width="100%" height="100%" fill="${PAPER}"/>${body}</svg>`;
export const drawingSvg = (strokes: Stroke[], title = "ToonStudio 드로잉") => svgDocument(strokeSvg(strokes), 960, 600, title);

const wave = (phase = 0) => Array.from({ length: 81 }, (_, i) => ({ x: .12 + i / 80 * .76, y: .5 + Math.sin(i / 80 * Math.PI * 2 + phase) * .23 }));
export const LINE_GUIDES: { name: string; tip: string; points: Point[] }[] = [
  { name: "긴 호흡의 직선", tip: "시작점보다 도착점을 보면서 한 번에 연결해 보세요.", points: [{ x: .12, y: .75 }, { x: .88, y: .25 }] },
  { name: "리듬 있는 물결", tip: "방향이 바뀌는 지점에서도 손의 속도를 유지해 보세요.", points: wave() },
  { name: "캐릭터의 타원", tip: "세부 묘사보다 큰 덩어리의 흐름을 먼저 잡아 보세요.", points: Array.from({ length: 81 }, (_, i) => ({ x: .5 + Math.cos(i / 80 * Math.PI * 2) * .27, y: .5 + Math.sin(i / 80 * Math.PI * 2) * .34 })) },
  { name: "부드러운 아치", tip: "곡선의 꼭짓점에서 손을 멈추지 않고 이어 보세요.", points: Array.from({ length: 61 }, (_, i) => ({ x: .12 + i / 60 * .76, y: .78 - Math.sin(i / 60 * Math.PI) * .55 })) },
  { name: "각진 실루엣", tip: "모서리에서 방향만 바꾸고 선의 굵기는 유지해 보세요.", points: [{ x: .15, y: .7 }, { x: .32, y: .25 }, { x: .5, y: .7 }, { x: .68, y: .25 }, { x: .85, y: .7 }] },
  { name: "공간을 여는 다이아몬드", tip: "대칭을 의식하며 네 꼭짓점의 거리를 비교해 보세요.", points: [{ x: .5, y: .15 }, { x: .85, y: .5 }, { x: .5, y: .85 }, { x: .15, y: .5 }, { x: .5, y: .15 }] },
];
export function resample(points: Point[], count = 80): Point[] {
  if (points.length < 2) return points;
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, (points[i].y - points[i - 1].y) * .625));
  const total = distances[distances.length - 1];
  if (total === 0) return [points[0]];
  let cursor = 1;
  return Array.from({ length: count }, (_, i) => {
    const d = total * i / (count - 1);
    while (cursor < points.length - 1 && distances[cursor] < d) cursor++;
    const ratio = (d - distances[cursor - 1]) / (distances[cursor] - distances[cursor - 1] || 1);
    return { x: points[cursor - 1].x + (points[cursor].x - points[cursor - 1].x) * ratio, y: points[cursor - 1].y + (points[cursor].y - points[cursor - 1].y) * ratio };
  });
}
export function traceScore(strokes: Stroke[], reference: Point[]): number {
  const ink = strokes.filter((s) => !s.erase);
  const drawn = ink.flatMap((s) => resample(s.points, 80));
  const target = resample(reference, 100);
  if (drawn.length < 2 || target.length < 2) return 0;
  const nearest = (p: Point, points: Point[]) => Math.min(...points.map((q) => Math.hypot(p.x - q.x, (p.y - q.y) * .625)));
  const error = drawn.reduce((sum, p) => sum + nearest(p, target), 0) / drawn.length;
  const coverage = target.filter((p) => nearest(p, drawn) < .035).length / target.length;
  return clamp(Math.round(100 * (.55 * Math.exp(-error * 18) + .45 * coverage)), 0, 100);
}
