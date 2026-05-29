// 작품 유형: 웹툰 / 웹소설
export type WorkType = "webtoon" | "webnovel";

// 연재 상태
export type SerialStatus = "ongoing" | "completed" | "hiatus";

// 이용가
export type AgeRating = "all" | "12" | "15" | "19";

// 가격 모델
export type Pricing = "free" | "wait-free" | "paid" | "subscription";

export type PlatformId =
  | "naver-webtoon"
  | "naver-series"
  | "kakao-page"
  | "kakao-webtoon"
  | "ridi"
  | "munpia"
  | "joara"
  | "novelpia"
  | "lezhin"
  | "bomtoon"
  | "toptoon"
  | "postype";

export interface Platform {
  id: PlatformId;
  name: string; // 한글 정식 명칭
  short: string; // 짧은 라벨
  type: WorkType | "both";
  color: string; // 브랜드 컬러 (hex)
}

// 어디서 볼 수 있는가 (크로스 플랫폼 가용성)
export interface Availability {
  platformId: PlatformId;
  pricing: Pricing;
  isOriginal?: boolean; // 독점/오리지널 연재
  url?: string;
}

// 외부 미디어 확장 (드라마/영화/애니/게임화)
export interface ExternalAdaptation {
  kind: "drama" | "movie" | "anime" | "game" | "ott";
  name: string;
  year: number;
}

export interface TitleStats {
  views: number; // 누적 조회수
  likes: number; // 좋아요
  bookmarks: number; // 관심 등록
  ratingAvg: number; // 평균 별점 0~5
  ratingCount: number; // 평가 참여 수
  ratingDist: [number, number, number, number, number]; // 1~5점 분포
  rankDelta: number; // 주간 순위 변동 (+상승 / -하락 / 0 유지)
  trendingScore: number; // 급상승 점수 0~100
  completionRate: number; // 정주행 완독률 % (0~100)
  bingeIndex: number; // 정주행 몰입 지수 0~100 (한 번에 몰아보는 정도)
}

export interface Title {
  id: string;
  slug: string;
  type: WorkType;
  title: string;
  altTitles?: string[]; // 별칭/영문/축약 (검색용)
  author: string; // 글
  artist?: string; // 그림 (웹툰)
  genres: string[];
  tags: string[]; // 작품 특성 태그 (#사이다 #회빙환 등)
  synopsis: string; // 1~3문장 소개 (오리지널 요약)
  cover: [string, string]; // 표지 그라디언트 [from, to] hex (이미지 없을 때 폴백)
  coverImage?: string; // 실제 표지 이미지 URL (있으면 우선 사용)
  status: SerialStatus;
  ageRating: AgeRating;
  releaseYear: number;
  totalEpisodes?: number;
  updateDays?: string[]; // 연재요일 (월~일)
  availability: Availability[];
  // 원작-2차창작 그래프
  adaptedFrom?: string; // 원작 작품 id (예: 웹툰의 원작 웹소설)
  externalAdaptations?: ExternalAdaptation[];
  stats: TitleStats;
  featured?: boolean; // 에디터 추천
  editorNote?: string; // 에디터 한줄평
}

// 시드 리뷰 (데모용 샘플)
export interface SeedReview {
  id: string;
  titleId: string;
  author: string; // 닉네임
  avatar: string; // 아바타 그라디언트 시드 컬러 (hex)
  rating: number; // 0.5 ~ 5 (0.5 단위)
  text: string;
  tags: string[]; // 리뷰 태그
  spoiler: boolean;
  likes: number;
  createdAt: string; // ISO 날짜
  progress?: "완독" | "정주행중" | "하차" | "정주행 예정";
}

// 사용자(로컬) 데이터
export type ReadState = "want" | "reading" | "done" | "dropped";

export interface UserReview {
  titleId: string;
  rating: number;
  text: string;
  tags: string[];
  spoiler: boolean;
  createdAt: string;
}
