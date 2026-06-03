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
  | "postype"
  | "mrblue"
  | "comico"
  | "toomics"
  | "bookcube"
  | "onestory"
  | "kyobo"
  | "yes24";

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
  // 플랫폼 실제 인기 순위(네이버 order=user 등, 1=최상위).
  popularityRank?: number;
  // 교차-플랫폼 정규화 인기 백분위(0~100, 100=플랫폼 내 최상위). 카탈로그 로드 시 계산.
  popularityPercentile?: number;
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
  // 원작-2차창작 그래프 (웹툰↔원작소설). 드라마·영화·애니 등 영상화·OST는 lib/title-universe.ts 에서 관리.
  adaptedFrom?: string; // 원작 작품 id (예: 웹툰의 원작 웹소설)
  stats: TitleStats;
  // 조회/관심 등 핵심 지표가 합성(추정)값일 때 true. 네이버가 공개 조회수 집계를 비공개로
  // 전환하면 viewCount가 0으로 내려오므로, 0 노출 방지용으로 보정한 작품을 추정으로 표시한다.
  statsEstimated?: boolean;
  featured?: boolean; // 에디터 추천
  editorNote?: string; // 에디터 한줄평
}

// 리뷰 표시 모델(시드 또는 DB 리뷰 공통 형태)
export interface SeedReview {
  id: string;
  titleId: string;
  userId?: string; // DB 리뷰일 때 작성자 (공개 프로필 링크용). 시드엔 없음.
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

export type FanCafeScope = "title" | "author" | "pencafe";
export type FanCafeScopeFilter = FanCafeScope | "all";
export type FanCafePostKind = "talk" | "theory" | "fanart" | "cheer";

export interface CommunityAuthor {
  id?: string;
  name: string;
  avatar: string;
}

export interface ReviewReply {
  id: string;
  reviewId: string;
  parentId?: string | null;
  author: CommunityAuthor;
  text: string;
  spoiler: boolean;
  createdAt: string;
  children?: ReviewReply[];
}

export interface FanCafeReply {
  id: string;
  postId: string;
  author: CommunityAuthor;
  text: string;
  createdAt: string;
  parentId?: string | null;
  children?: FanCafeReply[];
}

export interface FanCafePost {
  id: string;
  scope: FanCafeScope;
  targetId: string;
  targetLabel: string;
  kind: FanCafePostKind;
  title: string;
  text: string;
  tags: string[];
  author: CommunityAuthor;
  createdAt: string;
  replyCount: number;
  replies?: FanCafeReply[];
}

export interface FanCafeBoard {
  scope: FanCafeScope;
  targetId: string;
  targetLabel: string;
  postCount: number;
  replyCount: number;
  latestPostAt: string;
}

export interface FanCafePostList {
  items: FanCafePost[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── 사이트 Q&A·의견 게시판 ──
export type FeedbackCategory = "question" | "idea" | "bug";
export type FeedbackStatus = "open" | "answered";

export interface FeedbackReply {
  id: string;
  postId: string;
  parentId?: string | null;
  author: CommunityAuthor;
  text: string;
  isOfficial: boolean; // 운영자(admin/operator) 답변
  createdAt: string;
  children?: FeedbackReply[];
}

export interface FeedbackPost {
  id: string;
  category: FeedbackCategory;
  title: string;
  text: string;
  tags: string[];
  status: FeedbackStatus;
  author: CommunityAuthor;
  createdAt: string;
  answeredAt: string | null;
  replyCount: number;
  replies?: FeedbackReply[];
}

export interface FeedbackPostList {
  items: FeedbackPost[];
  nextCursor: string | null;
  hasMore: boolean;
}
