import type { SerialStatus, AgeRating, WorkType } from "./types";

// 통합 장르 (웹툰 + 웹소설 공통 + 웹소설 특화)
export const GENRES = [
  "로맨스",
  "로판", // 로맨스 판타지
  "판타지",
  "현판", // 현대 판타지
  "무협",
  "액션",
  "스릴러",
  "미스터리",
  "드라마",
  "일상",
  "코미디",
  "학원",
  "스포츠",
  "공포",
  "SF",
  "역사",
  "BL",
  "게임판타지",
] as const;

// 작품 특성 태그 (큐레이션용)
export const TAGS = [
  "회빙환", // 회귀·빙의·환생
  "사이다",
  "먼치킨",
  "성장물",
  "힐링",
  "다크",
  "두뇌싸움",
  "복수극",
  "명작",
  "그림체甲",
  "몰입감",
  "반전",
  "절륜연출",
  "정통판타지",
  "악역영애",
  "계약연애",
  "츤데레",
  "헌터물",
  "탑등반",
  "전생",
  "빌런서사",
  "동물원작", // 외전·스핀오프 풍부
  "갓띵작",
  "여주판타지",
] as const;

export const STATUS_LABEL: Record<SerialStatus, string> = {
  ongoing: "연재중",
  completed: "완결",
  hiatus: "휴재",
};

export const AGE_LABEL: Record<AgeRating, string> = {
  all: "전체",
  "12": "12세",
  "15": "15세",
  "19": "19세",
};

export const TYPE_LABEL: Record<WorkType, string> = {
  webtoon: "웹툰",
  webnovel: "웹소설",
};

export const WEEK_DAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
