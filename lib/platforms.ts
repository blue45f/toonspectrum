import type { Platform, PlatformId, Pricing } from "./types";

export const PLATFORMS: Record<PlatformId, Platform> = {
  "naver-webtoon": { id: "naver-webtoon", name: "네이버 웹툰", short: "네이버웹툰", type: "webtoon", color: "#00DC64" },
  "naver-series": { id: "naver-series", name: "네이버 시리즈", short: "시리즈", type: "both", color: "#27C46B" },
  "kakao-page": { id: "kakao-page", name: "카카오페이지", short: "카카오페이지", type: "both", color: "#FFCD00" },
  "kakao-webtoon": { id: "kakao-webtoon", name: "카카오웹툰", short: "카카오웹툰", type: "webtoon", color: "#FF3D54" },
  ridi: { id: "ridi", name: "리디", short: "리디", type: "both", color: "#1F8CE6" },
  munpia: { id: "munpia", name: "문피아", short: "문피아", type: "webnovel", color: "#2B59C3" },
  joara: { id: "joara", name: "조아라", short: "조아라", type: "webnovel", color: "#22B8A6" },
  novelpia: { id: "novelpia", name: "노벨피아", short: "노벨피아", type: "webnovel", color: "#7C5CFC" },
  lezhin: { id: "lezhin", name: "레진코믹스", short: "레진", type: "webtoon", color: "#E11D2E" },
  bomtoon: { id: "bomtoon", name: "봄툰", short: "봄툰", type: "webtoon", color: "#FF6B9D" },
  toptoon: { id: "toptoon", name: "탑툰", short: "탑툰", type: "webtoon", color: "#FF5A36" },
  postype: { id: "postype", name: "포스타입", short: "포스타입", type: "both", color: "#1A1A1A" },
  mrblue: { id: "mrblue", name: "미스터블루", short: "미블", type: "both", color: "#2F6BFF" },
  toomics: { id: "toomics", name: "투믹스", short: "투믹스", type: "webtoon", color: "#E60012" },
  bookcube: { id: "bookcube", name: "북큐브", short: "북큐브", type: "webnovel", color: "#2E7DD7" },
  onestory: { id: "onestory", name: "원스토리", short: "원스토리", type: "both", color: "#F04E45" },
  kyobo: { id: "kyobo", name: "교보문고", short: "교보", type: "webnovel", color: "#4F7C2F" },
  yes24: { id: "yes24", name: "예스24", short: "예스24", type: "webnovel", color: "#2B56A3" },
};

export const PLATFORM_LIST = Object.values(PLATFORMS);

export const PRICING_LABEL: Record<Pricing, string> = {
  free: "무료",
  "wait-free": "기다무",
  paid: "유료",
  subscription: "구독",
};

export const PRICING_FULL: Record<Pricing, string> = {
  free: "무료 공개",
  "wait-free": "기다리면 무료",
  paid: "건별 유료",
  subscription: "구독 포함",
};

export function platform(id: PlatformId): Platform {
  return PLATFORMS[id];
}
