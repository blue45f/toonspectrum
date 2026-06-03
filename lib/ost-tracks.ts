// 큐레이션 OST·주제가·뮤직비디오 데이터 — 웹툰/웹소설의 애니 OP/ED·드라마 OST 대표곡.
// 크롤 불가 정보라 손으로 검증한 '확실한' 곡만 담는다(정직성: 추측 곡·가짜 영상ID 금지).
// videoId 는 웹검색으로 확인한 공식/대표 업로드만 — 임베드 비활성 영상이어도 '유튜브에서 보기'로
// 우아하게 폴백된다. videoId 가 없으면 검색 링크만 제공한다.
import type { Title } from "./types";

function norm(s: string): string {
  return String(s || "")
    .replace(/[\s:~!?,.\-()[\]·]/g, "")
    .toLowerCase();
}

export type OstKind = "op" | "ed" | "ost" | "theme";

export interface OstTrack {
  song: string; // 곡명
  artist: string; // 아티스트
  year: number;
  kind: OstKind;
  context: string; // 어디 OST인지(애니/드라마 등)
  videoId?: string; // 확인된 유튜브 영상ID(있으면 인페이지 재생)
}

export const OST_KIND_LABEL: Record<OstKind, string> = {
  op: "오프닝",
  ed: "엔딩",
  ost: "OST",
  theme: "주제가",
};

interface OstEntry {
  titles: string[];
  tracks: OstTrack[];
}

// 확실한 대표곡만. videoId 는 공식/대표 업로드를 웹검색으로 확인한 값.
const DATA: OstEntry[] = [
  {
    titles: ["외모지상주의"],
    tracks: [
      { song: "Like That", artist: "에이티즈 (ATEEZ)", year: 2022, kind: "op", context: "넷플릭스 애니메이션", videoId: "ZOLoVUWLMkQ" },
    ],
  },
  {
    titles: ["나 혼자만 레벨업", "나혼자만레벨업"],
    tracks: [
      { song: "LEveL", artist: "SawanoHiroyuki[nZk]:TOMORROW X TOGETHER", year: 2024, kind: "op", context: "애니메이션", videoId: "Jsc6bPHe4tM" },
      { song: "request", artist: "히츠지분가쿠 (羊文学)", year: 2024, kind: "ed", context: "애니메이션" },
    ],
  },
  {
    titles: ["신의 탑", "신의탑", "tower of god"],
    tracks: [
      { song: "TOP", artist: "스트레이 키즈 (Stray Kids)", year: 2020, kind: "op", context: "애니메이션", videoId: "PQXLLC9yGAY" },
      { song: "SLUMP", artist: "스트레이 키즈 (Stray Kids)", year: 2020, kind: "ed", context: "애니메이션", videoId: "63-6y8G7uXY" },
    ],
  },
  {
    titles: ["갓 오브 하이스쿨", "the god of high school"],
    tracks: [
      { song: "Contradiction", artist: "KSUKE feat. Tyler Carter", year: 2020, kind: "op", context: "애니메이션", videoId: "pkw_Hl3qXCs" },
    ],
  },
  {
    titles: ["여신강림"],
    tracks: [
      { song: "Love so Fine", artist: "차은우 (ASTRO)", year: 2021, kind: "ost", context: "드라마", videoId: "uDLw2BRk3ww" },
      { song: "오늘부터 시작인걸 (It Starts Today)", artist: "황인엽", year: 2021, kind: "ost", context: "드라마", videoId: "9LjxxZSYw0I" },
    ],
  },
  {
    titles: ["유미의 세포들"],
    tracks: [
      { song: "Nightfalling", artist: "존박 (John Park)", year: 2021, kind: "ost", context: "드라마", videoId: "PMqVlIdklBk" },
      { song: "Like a Star", artist: "도영 (DOYOUNG, NCT)", year: 2021, kind: "ost", context: "드라마", videoId: "atJmeuWm4mo" },
    ],
  },
  // 아래는 검증된 곡이나 현재 카탈로그에 원작이 없을 수 있음(있으면 자동 노출).
  {
    titles: ["이태원 클라쓰"],
    tracks: [
      { song: "시작 (Start)", artist: "가호 (Gaho)", year: 2020, kind: "ost", context: "드라마", videoId: "O0StKlRHVeE" },
      { song: "Sweet Night", artist: "뷔 (V)", year: 2020, kind: "ost", context: "드라마" },
    ],
  },
  {
    titles: ["사내맞선"],
    tracks: [
      { song: "Love, Maybe (사랑인가 봐)", artist: "멜로망스 (MeloMance)", year: 2022, kind: "ost", context: "드라마", videoId: "UoBsiQW23IY" },
    ],
  },
  {
    titles: ["김비서가 왜 그럴까"],
    tracks: [
      { song: "It's You", artist: "정세운", year: 2018, kind: "ost", context: "드라마", videoId: "rBaEVC2aWqQ" },
    ],
  },
];

const INDEX = new Map<string, OstTrack[]>();
for (const e of DATA) {
  for (const t of e.titles) {
    const k = norm(t);
    const cur = INDEX.get(k);
    if (cur) cur.push(...e.tracks);
    else INDEX.set(k, [...e.tracks]);
  }
}

// 작품(또는 그 원작/웹툰 제목)에 매칭되는 OST 트랙 목록. 없으면 빈 배열.
export function ostsForTitle(title: { title: string }): OstTrack[] {
  return INDEX.get(norm(title.title)) ?? [];
}

// 저작권 안전 설계: 음원/영상을 우리 페이지에 임베드·재생·저장하지 않는다.
// 곡명·아티스트는 사실(저작권 대상 아님)이고, 재생은 전부 '공식 플랫폼으로 링크아웃'만 한다.
function trackQuery(track: OstTrack): string {
  return `${track.song} ${track.artist}`;
}

// 유튜브: 공식 영상ID 확인된 곡은 해당 watch, 아니면 검색(둘 다 단순 링크 — 침해 아님).
export function ostWatchUrl(track: OstTrack): string {
  if (track.videoId) return `https://www.youtube.com/watch?v=${track.videoId}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(trackQuery(track))}`;
}
// 멜론(국내 음원) 검색 링크.
export function ostMelonUrl(track: OstTrack): string {
  return `https://www.melon.com/search/total/index.htm?q=${encodeURIComponent(trackQuery(track))}`;
}
// 스포티파이(글로벌 음원) 검색 링크.
export function ostSpotifyUrl(track: OstTrack): string {
  return `https://open.spotify.com/search/${encodeURIComponent(trackQuery(track))}`;
}

export function hasOst(title: Title): boolean {
  return INDEX.has(norm(title.title));
}
