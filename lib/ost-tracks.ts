// 큐레이션 OST·주제가·뮤직비디오 데이터 — 웹툰/웹소설의 애니 OP/ED·드라마 OST 대표곡.
// 크롤 불가 정보라 손으로 검증한 '확실한' 곡만 담는다(정직성: 추측 곡·가짜 영상ID 금지).
// 링크는 특정 영상ID 위조 대신 유튜브 검색 쿼리로 — 항상 정상 동작하고 과장이 없다.
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

// 확실한 대표곡만(애니 OP/ED는 공식 발표곡, 드라마 OST는 대표 타이틀곡).
const DATA: OstEntry[] = [
  {
    titles: ["나 혼자만 레벨업", "나혼자만레벨업"],
    tracks: [
      { song: "LEveL", artist: "SawanoHiroyuki[nZk]", year: 2024, kind: "op", context: "애니메이션" },
      { song: "request", artist: "히츠지분가쿠 (羊文学)", year: 2024, kind: "ed", context: "애니메이션" },
    ],
  },
  {
    titles: ["신의 탑", "신의탑", "tower of god"],
    tracks: [
      { song: "TOP", artist: "스트레이 키즈 (Stray Kids)", year: 2020, kind: "op", context: "애니메이션" },
      { song: "SLUMP", artist: "스트레이 키즈 (Stray Kids)", year: 2020, kind: "ed", context: "애니메이션" },
    ],
  },
  {
    titles: ["갓 오브 하이스쿨", "the god of high school"],
    tracks: [{ song: "Contradiction", artist: "KSUKE feat. Tomomi Mochizuki", year: 2020, kind: "op", context: "애니메이션" }],
  },
  {
    titles: ["노블레스"],
    tracks: [{ song: "Bloody Sweet", artist: "ENOi (이엔오아이)", year: 2020, kind: "op", context: "애니메이션" }],
  },
  {
    titles: ["이태원 클라쓰"],
    tracks: [
      { song: "시작 (Start)", artist: "가호 (Gaho)", year: 2020, kind: "ost", context: "드라마" },
      { song: "Sweet Night", artist: "뷔 (V)", year: 2020, kind: "ost", context: "드라마" },
    ],
  },
  {
    titles: ["사내맞선"],
    tracks: [{ song: "Love, Maybe", artist: "멜로망스 (MeloMance)", year: 2022, kind: "ost", context: "드라마" }],
  },
  {
    titles: ["김비서가 왜 그럴까"],
    tracks: [{ song: "It's You", artist: "정세운", year: 2018, kind: "ost", context: "드라마" }],
  },
  {
    titles: ["스위트홈"],
    tracks: [{ song: "Warning Sign", artist: "이디오테입 (IDIOTAPE)", year: 2020, kind: "theme", context: "넷플릭스" }],
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

// 트랙별 유튜브 검색 링크(특정 영상ID 위조 금지 — 검색 쿼리는 항상 유효).
export function ostSearchUrl(track: OstTrack): string {
  const q = `${track.song} ${track.artist}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

// 빌드 시 카탈로그에 OST 보유 여부를 표시할 때 쓸 수 있는 헬퍼(현재는 클라 직접 조회).
export function hasOst(title: Title): boolean {
  return INDEX.has(norm(title.title));
}
