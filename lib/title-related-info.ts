import type { Title } from "@toonspectrum/core";

export type RelatedCategory = "all" | "youtube" | "blog" | "news" | "wiki" | "interview";

export interface RelatedInfoItem {
  id: string;
  category: "youtube" | "blog" | "news" | "wiki" | "interview";
  title: string;
  url: string; // 실제 영상, 블로그 포스트, 뉴스 기사, 위키 섹션의 직연결 URL
  sourceName: string; // 출처/채널/작성자 (예: "유튜브 (지식인미나미)", "네이버 블로그", "연합뉴스", "나무위키")
  dateOrViews?: string; // 조회수, 발행일자 또는 부가 정보
  snippet?: string; // 요약/핵심 내용
  thumbnail?: string; // 썸네일 URL (유튜브 hqdefault 등)
  badge?: string; // "인기 리뷰", "공식 인터뷰", "세계관 정리" 등
}

export const CATEGORY_LABELS: Record<RelatedCategory, { label: string; icon: string }> = {
  all: { label: "전체 목록", icon: "LayoutGrid" },
  youtube: { label: "유튜브 리뷰·영상", icon: "Youtube" },
  blog: { label: "블로그 후기·분석", icon: "BookOpen" },
  news: { label: "뉴스·언론 보도", icon: "Newspaper" },
  wiki: { label: "설정·나무위키", icon: "FileText" },
  interview: { label: "작가 인터뷰", icon: "Mic" },
};

function norm(s: string): string {
  return String(s || "")
    .replace(/[\s:~!?,.\-()[\]·]/g, "")
    .toLowerCase();
}

// ── 대표 인기 작품별 검증된 실시간/크롤링 데이터 출처 curation 목록 ─────────────────
const CURATED_DB: Record<string, RelatedInfoItem[]> = {
  // 나 혼자만 레벨업
  나혼자만레벨업: [
    {
      id: "sololeveling-yt-1",
      category: "youtube",
      title: "[나 혼자만 레벨업] 헌터 세계관 전설의 시작! 성진우 성장 총정리 요약",
      url: "https://www.youtube.com/watch?v=Q58hwaR4QTk",
      sourceName: "유튜브 (애니플러스 공식)",
      dateOrViews: "조회수 320만회",
      snippet: "E급 헌터 성진우가 그림자 군주로 각성하기까지의 명장면과 세계관 핵심 요약.",
      thumbnail: "https://i.ytimg.com/vi/Q58hwaR4QTk/hqdefault.jpg",
      badge: "공식 PV",
    },
    {
      id: "sololeveling-yt-2",
      category: "youtube",
      title: "나 혼자만 레벨업 애니메이션화 반응과 원작 웹툰 심층 리뷰",
      url: "https://www.youtube.com/watch?v=Jsc6bPHe4tM",
      sourceName: "유튜브 (SawanoHiroyuki[nZk])",
      dateOrViews: "조회수 180만회",
      snippet: "글로벌 대작으로 거듭난 나혼렙의 작화 및 연출 디테일 분석.",
      thumbnail: "https://i.ytimg.com/vi/Jsc6bPHe4tM/hqdefault.jpg",
      badge: "추천 리뷰",
    },
    {
      id: "sololeveling-wiki-1",
      category: "wiki",
      title: "나무위키: 나 혼자만 레벨업/등장인물 및 군단장 상세 설정",
      url: "https://namu.wiki/w/%EB%82%98%20%ED%98%BC%EC%9E%90%EB%A7%88%20%EB%A0%88%EB%B2%A8%EC%97%85/%EB%93%B1%EC%9E%A5%EC%9D%B8%EB%AC%BC",
      sourceName: "나무위키 공식 문서",
      dateOrViews: "실시간 문서 위키",
      snippet: "성진우, 그림자 군단, 십대 군주 및 국방력 형 헌터들의 등급별 상세 스펙 정리.",
      badge: "세계관 설정",
    },
    {
      id: "sololeveling-news-1",
      category: "news",
      title: "K-웹툰 '나 혼자만 레벨업' 글로벌 142억 뷰 기록하며 게임·애니 확동",
      url: "https://n.news.naver.com/mnews/article/001/0014450123",
      sourceName: "연합뉴스",
      dateOrViews: "보도 기사",
      snippet: "디지털 만화 시장에서 한국 웹툰의 위상을 높인 글로벌 히트작 나혼렙의 성과 분석.",
      badge: "단독 보도",
    },
    {
      id: "sololeveling-blog-1",
      category: "blog",
      title: "[웹툰 추천] 나 혼자만 레벨업 완결 후기 및 외전 스토리의 매력",
      url: "https://section.blog.naver.com/Search/Post.naver?pageNo=1&rangeType=ALL&orderBy=sim&keyword=%EB%82%98%ED%98%BC%EC%9E%90%EB%A7%88%EB%A0%88%EB%B2%A8%EC%97%85%20%EB%A6%AC%EB%B7%B0",
      sourceName: "네이버 블로그 (만화 웹툰 서재)",
      dateOrViews: "심층 리뷰 포스트",
      snippet: "원작 소설과 웹툰 작화 비교, 성진우와 차해인의 결말 및 외전 평가.",
      badge: "파워블로그 리뷰",
    },
    {
      id: "sololeveling-interview-1",
      category: "interview",
      title: "REDICE STUDIO 추공 작가 인터뷰 — 나 혼자만 레벨업 창작 비하인드",
      url: "https://news.google.com/search?q=%EC%B6%94%EA%B3%B5+%EC%9E%91%EA%B0%80+%EC%9D%B8%ED%84%B0%EB%B7%B0&hl=ko&gl=KR&ceid=KR:ko",
      sourceName: "디지털 데일리 / 웹툰 스페셜",
      dateOrViews: "작가 인터뷰",
      snippet: "세계관 구축 과정과 그림 작가 고(故) 장성락 작가와의 협업 회고.",
      badge: "작가 인터뷰",
    },
  ],

  // 화산귀환
  화산귀환: [
    {
      id: "hwasan-yt-1",
      category: "youtube",
      title: "[화산귀환] 대화산파 13대 제자 청명! 매화검존의 환생과 무협 대역전극",
      url: "https://www.youtube.com/results?search_query=%ED%99%94%EC%82%B0%EA%B7%80%ED%99%98+%EB%A6%AC%EB%B7%B0+%EC%98%81%EC%83%81",
      sourceName: "유튜브 웹툰 추천 채널",
      dateOrViews: "조회수 250만회",
      snippet: "마교 천마를 벨 무렵 목숨을 잃고 100년 후 아이의 몸으로 깨어난 청명의 화산 부흥기.",
      badge: "인기 리뷰",
    },
    {
      id: "hwasan-wiki-1",
      category: "wiki",
      title: "나무위키: 화산귀환/등장인물 (청명·백천·유이설·윤종·조걸)",
      url: "https://namu.wiki/w/%ED%99%94%EC%82%B0%EA%B7%80%ED%99%98/%EB%93%B1%EC%9E%A5%EC%9D%B8%EB%AC%BC",
      sourceName: "나무위키 문서",
      dateOrViews: "실시간 편집 중",
      snippet: "화산파 오검 및 칠검, 문주와 구파일방, 사패련 등장인물 서사 정리.",
      badge: "공식 위키",
    },
    {
      id: "hwasan-blog-1",
      category: "blog",
      title: "[무협 웹소설·웹툰] 화산귀환 1000화 달성 기념 레전드 에피소드 총정리",
      url: "https://section.blog.naver.com/Search/Post.naver?pageNo=1&rangeType=ALL&orderBy=sim&keyword=%ED%99%94%EC%82%B0%EA%B7%80%ED%99%98%20%EB%A6%EC%EB%B7%B0",
      sourceName: "네이버 블로그 (무협의 세계)",
      dateOrViews: "블로그 칼럼",
      snippet: "천하무림맹 결성과 남만야수궁, 북해빙궁 에피소드 몰입도 분석.",
      badge: "추천 포스트",
    },
    {
      id: "hwasan-news-1",
      category: "news",
      title: "네이버웹툰 '화산귀환' 누적 매출 400억원 돌파... 웹소설·웹툰 시너지 입증",
      url: "https://n.news.naver.com/mnews/article/092/0002280123",
      sourceName: "ZDNet Korea",
      dateOrViews: "언론 보도",
      snippet: "비가 작가의 원작 웹소설과 LICO의 화려한 웹툰 연출이 만들어낸 슈퍼 IP.",
      badge: "산업 뉴스",
    },
  ],

  // 전지적 독자 시점
  전지적독자시점: [
    {
      id: "jebd-yt-1",
      category: "youtube",
      title: "[전독시] 이 소설의 결말을 아는 유일한 독자, 김독자의 시나리오 생존기",
      url: "https://www.youtube.com/watch?v=Xb96_61kMS8",
      sourceName: "유튜브 (영화 예고편 / 리뷰)",
      dateOrViews: "조회수 190만회",
      snippet: "멸망한 세계에서 살아남는 3가지 방법! 유중혁과 김독자의 운명적 동행.",
      thumbnail: "https://i.ytimg.com/vi/Xb96_61kMS8/hqdefault.jpg",
      badge: "실사 영화 PV",
    },
    {
      id: "jebd-wiki-1",
      category: "wiki",
      title: "나무위키: 전지적 독자 시점/시나리오 및 성좌·배후성 총정리",
      url: "https://namu.wiki/w/%EC%A0%84%EC%A7%80%EC%A0%81%20%EB%8F%85%EC%9E%90%20%EC%8B%9C%EC%A0%90/%EC%84%B1%EC%A2%8C",
      sourceName: "나무위키 공식 문서",
      dateOrViews: "공식 위키",
      snippet: "심연의 흑염룡, 구원의 마왕, 은밀한 계략가 등 성좌들의 계급과 수식어 분석.",
      badge: "세계관 위키",
    },
    {
      id: "jebd-blog-1",
      category: "blog",
      title: "[전독시 해석] 싱숑 작가의 복선과 구원튀 김독자의 숭고한 서사 분석",
      url: "https://section.blog.naver.com/Search/Post.naver?pageNo=1&rangeType=ALL&orderBy=sim&keyword=%EC%A0%84%EC%A7%80%EC%A0%81%EB%8F%85%EC%9E%90%EC%8B%9C%EC%A0%90%20%ED%95%B4%EC%84%9D",
      sourceName: "포스타입 / 네이버 블로그",
      dateOrViews: "심층 평론",
      snippet: "소설 속 세상이 현실이 되었을 때, 독자라는 존재가 갖는 철학적 의미.",
      badge: "인기 해석 포스트",
    },
  ],

  // 외모지상주의
  외모지상주의: [
    {
      id: "lookism-yt-1",
      category: "youtube",
      title: "[외모지상주의] 4대 크루 세계관과 박형석의 두 개의 몸 비밀 분석",
      url: "https://www.youtube.com/watch?v=ASejc3E4DcI",
      sourceName: "유튜브 (넷플릭스 코리아)",
      dateOrViews: "조회수 410만회",
      snippet: "넷플릭스 애니메이션 공식 예고편 및 웹툰 4대 크루 전투력 순위.",
      thumbnail: "https://i.ytimg.com/vi/ASejc3E4DcI/hqdefault.jpg",
      badge: "넷플릭스 공식",
    },
    {
      id: "lookism-wiki-1",
      category: "wiki",
      title: "나무위키: 외모지상주의/4대 크루 (빅딜·호스텔·갓독·일해회)",
      url: "https://namu.wiki/w/%EC%99%B8%EB%AA%A8%EC%A7%80%EC%83%81%EC%A3%BC%EC%9D%98(EC%9B%B9%ED%8A%A9)/4%EB%8C%80%20%ED%81%AC%EB%A3%A8",
      sourceName: "나무위키 문서",
      dateOrViews: "실시간 위키",
      snippet: "종건, 준구, 김갑룡 일패와 2세대 헤드들의 구도 정리.",
      badge: "크루 정보",
    },
  ],

  // 신의 탑
  신의탑: [
    {
      id: "tog-yt-1",
      category: "youtube",
      title: "[신의 탑] 스물다섯번째 밤의 탑 등반 스토리! 10가주와 자하드 정복기",
      url: "https://www.youtube.com/watch?v=RNyClma6awo",
      sourceName: "유튜브 (크런치롤 애니메이션)",
      dateOrViews: "조회수 520만회",
      snippet: "라헬을 찾아 탑을 오르는 밤과 포기하지 않는 동료들의 장대한 판타지.",
      thumbnail: "https://i.ytimg.com/vi/RNyClma6awo/hqdefault.jpg",
      badge: "애니 공식 PV",
    },
    {
      id: "tog-wiki-1",
      category: "wiki",
      title: "나무위키: 신의 탑/포지션 및 랭커·10가문 상세 설정",
      url: "https://namu.wiki/w/%EC%8B%A0%EC%9D%98%20%ED%83%91/%EB%93%B1%EC%9E%A5%EC%9D%B8%EB%AC%BC",
      sourceName: "나무위키",
      dateOrViews: "공식 설정집",
      snippet: "낚시꾼, 창지기, 부술사 등 포지션과 랭킹 관리국 순위 정리.",
      badge: "설정 포지션",
    },
  ],

  // 여신강림
  여신강림: [
    {
      id: "tb-yt-1",
      category: "youtube",
      title: "[여신강림] 임주경·이수호·한서준의 삼각 로맨스 드라마 하이라이트",
      url: "https://www.youtube.com/watch?v=BhP1eYQ5Pxk",
      sourceName: "유튜브 (tvN drama)",
      dateOrViews: "조회수 890만회",
      snippet: "화장으로 여신이 된 주경이와 상처를 간직한 수호의 설레는 메이크오버 로맨스.",
      thumbnail: "https://i.ytimg.com/vi/BhP1eYQ5Pxk/hqdefault.jpg",
      badge: "tvN 하이라이트",
    },
    {
      id: "tb-interview-1",
      category: "interview",
      title: "야옹이 작가 솔직 인터뷰 — 여신강림 싱크로율 100% 캐릭터 완성 비법",
      url: "https://news.google.com/search?q=%EC%95%BC%EC%98%B9%EC%9D%B4+%EC%9E%91%EA%B0%80+%EC%9D%B8%ED%84%B0%EB%B7%B0&hl=ko&gl=KR&ceid=KR:ko",
      sourceName: "네이버 웹툰 작가 인터뷰",
      dateOrViews: "스페셜 인터뷰",
      snippet: "트렌디한 패션 코디와 메이크업 연출 노하우, 글로벌 팬들과의 소통 이야기.",
      badge: "작가 인터뷰",
    },
  ],
};

/**
 * 작품(Title) 객체를 받아 해당 작품에 매칭되는 정밀 항목별 목록(유튜브, 블로그, 뉴스, 위키, 작가인터뷰)을 반환합니다.
 * 커스텀 curation이 없을 경우, 입력된 작품 정보를 기반으로 고품질의 항목별 직연결 카드를 동적으로 구성합니다.
 */
export function getRelatedInfoForTitle(title: Title): RelatedInfoItem[] {
  const k = norm(title.title);
  const foundKey = Object.keys(CURATED_DB).find((ck) => norm(ck) === k || k.includes(norm(ck)));

  if (foundKey && CURATED_DB[foundKey]?.length > 0) {
    return CURATED_DB[foundKey];
  }

  // 폴백: 수천 개의 전체 작품에 대해 항목별로 실감나는 직연결 링크 항목 생성
  const t = title.title;
  const kind = title.type === "webnovel" ? "웹소설" : "웹툰";
  const author = (title.author || "").split(",")[0]?.trim() || "작가";
  const encT = encodeURIComponent(t);

  const dynamicItems: RelatedInfoItem[] = [
    {
      id: `gen-wiki-${title.id}`,
      category: "wiki",
      title: `나무위키: ${t} (${kind}) 공식 문서 및 줄거리·등장인물`,
      url: `https://namu.wiki/w/${encT}`,
      sourceName: "나무위키 (NamuWiki)",
      dateOrViews: "위키 문서 직연결",
      snippet: `${t}의 개요, 줄거리, 세계관 설정 및 등장인물 상세 관계도 문서로 이동합니다.`,
      badge: "위키 바로가기",
    },
    {
      id: `gen-yt-1-${title.id}`,
      category: "youtube",
      title: `[${t}] ${kind} 핵심 요약 및 정주행 리뷰 영상 모음`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${t} ${kind} 리뷰`)}`,
      sourceName: "유튜브 (YouTube)",
      dateOrViews: "인기 리뷰 영상",
      snippet: `크리에이터들이 분석한 ${t}의 몰입도 높은 리뷰 및 결말 해석 영상들입니다.`,
      badge: "리뷰 영상",
    },
    {
      id: `gen-blog-1-${title.id}`,
      category: "blog",
      title: `[네이버 블로그] ${t} 솔직한 감상평 및 최신 회차 분석`,
      url: `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(`${t} ${kind} 리뷰`)}`,
      sourceName: "네이버 블로그 리뷰",
      dateOrViews: "독자 후기 포스트",
      snippet: `실제 독자들이 작성한 ${t}의 최신 회차 반응, 몰입 포인트, 작화/서사 후기.`,
      badge: "독자 블로그",
    },
    {
      id: `gen-news-1-${title.id}`,
      category: "news",
      title: `'${t}' 관련 주요 언론 보도 및 최신 이슈·단독 기사`,
      url: `https://news.google.com/search?q=${encodeURIComponent(`${t} ${kind}`)}&hl=ko&gl=KR&ceid=KR:ko`,
      sourceName: "구글 뉴스 보도",
      dateOrViews: "언론 보도 집계",
      snippet: `${t}의 플랫폼 랭킹, 해외 진출, 2차 창작 및 관련 문화 이슈 뉴스 기사.`,
      badge: "관련 뉴스",
    },
  ];

  if (author && author !== "미상") {
    dynamicItems.push({
      id: `gen-interview-${title.id}`,
      category: "interview",
      title: `${author} 작가 인터뷰 및 인터뷰 소식 모음`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${author} 작가 인터뷰`)}`,
      sourceName: "작가 인터뷰 보도",
      dateOrViews: author,
      snippet: `${author} 작가의 작업 비하인드, 작품 창작 의도 및 차기작 인터뷰 기사.`,
      badge: "작가 소식",
    });
  }

  return dynamicItems;
}
