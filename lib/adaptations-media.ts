// 큐레이션 영상화 데이터 — 웹툰·웹소설의 드라마·영화·애니메이션·OTT 2차 창작물.
// 크롤로는 못 얻는 정보라 손으로 검증해 관리한다(과장 금지: 확실한 것만, 연도는 공개 방영/개봉 기준).
// 빌드 시 정규화 제목으로 매칭해 Title.externalAdaptations 를 채운다(adaptation-graph 가 렌더).
import type { ExternalAdaptation, Title } from "./types";

// 제목 정규화 — crawl.mjs 의 norm 과 동일 규칙(공백·문장부호 제거 + 소문자).
function norm(s: string): string {
  return String(s || "")
    .replace(/[\s:~!?,.\-()[\]·]/g, "")
    .toLowerCase();
}

interface MediaEntry {
  titles: string[]; // 매칭할 원작 제목(이형 포함)
  media: ExternalAdaptation[];
}

// kind: drama=방송 드라마 · ott=스트리밍 오리지널 시리즈 · movie=영화 · anime=애니메이션
const DATA: MediaEntry[] = [
  { titles: ["김비서가 왜 그럴까"], media: [{ kind: "drama", name: "김비서가 왜 그럴까", year: 2018 }] },
  { titles: ["이태원 클라쓰"], media: [{ kind: "drama", name: "이태원 클라쓰", year: 2020 }] },
  { titles: ["사내맞선"], media: [{ kind: "drama", name: "사내맞선", year: 2022 }] },
  { titles: ["여신강림"], media: [{ kind: "drama", name: "여신강림", year: 2020 }] },
  { titles: ["무빙"], media: [{ kind: "ott", name: "무빙 (디즈니+)", year: 2023 }] },
  { titles: ["경이로운 소문"], media: [{ kind: "drama", name: "경이로운 소문", year: 2020 }] },
  { titles: ["스위트홈"], media: [{ kind: "ott", name: "스위트홈 (넷플릭스)", year: 2020 }] },
  { titles: ["지옥"], media: [{ kind: "ott", name: "지옥 (넷플릭스)", year: 2021 }] },
  { titles: ["지금 우리 학교는"], media: [{ kind: "ott", name: "지금 우리 학교는 (넷플릭스)", year: 2022 }] },
  { titles: ["재벌집 막내아들"], media: [{ kind: "drama", name: "재벌집 막내아들", year: 2022 }] },
  { titles: ["내 아이디는 강남미인", "내 ID는 강남미인"], media: [{ kind: "drama", name: "내 ID는 강남미인", year: 2018 }] },
  {
    titles: ["치즈인더트랩", "치즈 인 더 트랩"],
    media: [
      { kind: "drama", name: "치즈인더트랩", year: 2016 },
      { kind: "movie", name: "치즈인더트랩", year: 2018 },
    ],
  },
  { titles: ["미생"], media: [{ kind: "drama", name: "미생", year: 2014 }] },
  { titles: ["유미의 세포들"], media: [{ kind: "drama", name: "유미의 세포들", year: 2021 }] },
  { titles: ["알고있지만", "알고있지만,"], media: [{ kind: "drama", name: "알고있지만,", year: 2021 }] },
  { titles: ["나빌레라"], media: [{ kind: "drama", name: "나빌레라", year: 2021 }] },
  { titles: ["디피", "d.p", "개의 날"], media: [{ kind: "ott", name: "D.P. (넷플릭스)", year: 2021 }] },
  { titles: ["안나라수마나라"], media: [{ kind: "ott", name: "안나라수마나라 (넷플릭스)", year: 2022 }] },
  { titles: ["술꾼도시여자들"], media: [{ kind: "ott", name: "술꾼도시여자들 (티빙)", year: 2021 }] },
  { titles: ["금수저"], media: [{ kind: "drama", name: "금수저", year: 2022 }] },
  { titles: ["약한영웅"], media: [{ kind: "ott", name: "약한영웅 Class 1 (웨이브)", year: 2022 }] },
  { titles: ["쌍갑포차"], media: [{ kind: "drama", name: "쌍갑포차", year: 2020 }] },
  { titles: ["쌉니다 천리마마트", "쌉니다 천리마트"], media: [{ kind: "drama", name: "쌉니다 천리마마트", year: 2019 }] },
  { titles: ["어쩌다 발견한 하루", "어쩌다 발견한 7월"], media: [{ kind: "drama", name: "어쩌다 발견한 하루", year: 2019 }] },
  { titles: ["트레이스"], media: [{ kind: "drama", name: "트레이스", year: 2017 }] },
  {
    titles: ["신과함께", "신과 함께"],
    media: [
      { kind: "movie", name: "신과함께: 죄와 벌", year: 2017 },
      { kind: "movie", name: "신과함께: 인과 연", year: 2018 },
    ],
  },
  {
    titles: ["마음의소리", "마음의 소리"],
    media: [
      { kind: "drama", name: "마음의 소리", year: 2016 },
      { kind: "anime", name: "마음의 소리 (애니)", year: 2018 },
    ],
  },
  { titles: ["신의 탑", "신의탑", "tower of god"], media: [{ kind: "anime", name: "신의 탑 (애니)", year: 2020 }] },
  { titles: ["노블레스"], media: [{ kind: "anime", name: "노블레스 (애니)", year: 2020 }] },
  { titles: ["갓 오브 하이스쿨", "the god of high school"], media: [{ kind: "anime", name: "갓 오브 하이스쿨 (애니)", year: 2020 }] },
  { titles: ["나 혼자만 레벨업", "나혼자만레벨업"], media: [{ kind: "anime", name: "나 혼자만 레벨업 (애니)", year: 2024 }] },
  { titles: ["화산귀환"], media: [{ kind: "anime", name: "화산귀환 (애니)", year: 2025 }] },
  { titles: ["전지적 독자 시점", "전지적독자시점"], media: [{ kind: "movie", name: "전지적 독자 시점", year: 2025 }] },
  { titles: ["외모지상주의"], media: [{ kind: "anime", name: "외모지상주의 (넷플릭스 애니)", year: 2022 }] },
  { titles: ["고수"], media: [{ kind: "drama", name: "고수 (무협)", year: 2024 }] },
  { titles: ["청춘블라썸"], media: [{ kind: "drama", name: "청춘블라썸", year: 2022 }] },
  { titles: ["조선왕조실톡"], media: [{ kind: "anime", name: "조선왕조실톡 (애니)", year: 2016 }] },
  { titles: ["연놈"], media: [{ kind: "drama", name: "연놈", year: 2021 }] },
  { titles: ["타인은 지옥이다"], media: [{ kind: "drama", name: "타인은 지옥이다", year: 2019 }] },
  { titles: ["조명가게"], media: [{ kind: "ott", name: "조명가게 (디즈니+)", year: 2024 }] },
  { titles: ["이두나", "이두나!"], media: [{ kind: "ott", name: "이두나! (넷플릭스)", year: 2023 }] },
  { titles: ["김부장"], media: [{ kind: "drama", name: "김부장", year: 2025 }] },
];

// 정규화 제목 → 미디어 목록(빌드 시 1회 구성).
const INDEX = new Map<string, ExternalAdaptation[]>();
for (const e of DATA) {
  for (const t of e.titles) {
    const k = norm(t);
    const cur = INDEX.get(k);
    if (cur) cur.push(...e.media);
    else INDEX.set(k, [...e.media]);
  }
}

// 카탈로그에 영상화 정보를 주입한다. 매칭된 작품 수를 반환.
// 같은 IP의 원작 소설·웹툰이 둘 다 매칭돼도 그래프는 dedup 하므로 안전(둘 다 태깅).
export function enrichExternalAdaptations(titles: Title[]): number {
  let matched = 0;
  for (const t of titles) {
    const media = INDEX.get(norm(t.title));
    if (!media) continue;
    const merged = [...(t.externalAdaptations ?? []), ...media];
    // (kind,name,year) 기준 중복 제거.
    const seen = new Set<string>();
    t.externalAdaptations = merged.filter((m) => {
      const key = `${m.kind}|${m.name}|${m.year}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    matched += 1;
  }
  return matched;
}
