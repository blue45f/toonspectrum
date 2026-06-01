export interface AppRouteMeta {
  path: string;
  label: string;
}

export const appRoutes: AppRouteMeta[] = [
  { path: "/", label: "홈" },
  { path: "/ranking", label: "랭킹" },
  { path: "/search", label: "검색" },
  { path: "/recommend", label: "추천" },
  { path: "/explore", label: "탐색" },
  { path: "/calendar", label: "연재" },
  { path: "/reviews", label: "리뷰" },
  { path: "/community", label: "커뮤니티" },
  { path: "/library", label: "내 서재" },
  { path: "/compare", label: "비교" },
  { path: "/insights", label: "인사이트" },
  { path: "/admin", label: "관리자" },
];
