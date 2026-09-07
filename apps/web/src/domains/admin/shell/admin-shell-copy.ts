const KO = {
  breadcrumbRoot: "관리자",
  closeCommandPalette: "명령 팔레트 닫기",
  closeNavigation: "관리자 메뉴 닫기",
  collapseSidebar: "사이드바 접기",
  downloadFailed: "다운로드 실패",
  expandSidebar: "사이드바 펼치기",
  exportMembersSuccess: "회원 CSV를 내려받았습니다.",
  exportRevenueSuccess: "정산 CSV를 내려받았습니다.",
  groups: {
    overview: "운영 현황",
    "users-trust": "회원·신뢰",
    monetization: "수익화",
    growth: "성장·소통",
    "platform-security": "플랫폼·보안",
  },
  loading: "관리자 화면을 불러오는 중",
  navigation: "관리자 메뉴",
  openNavigation: "관리자 메뉴 열기",
  openPublicSite: "공개 사이트 열기",
  publicSite: "사이트",
  workspace: "운영 워크스페이스",
} as const;

const EN = {
  breadcrumbRoot: "Admin",
  closeCommandPalette: "Close command palette",
  closeNavigation: "Close admin navigation",
  collapseSidebar: "Collapse sidebar",
  downloadFailed: "Download failed",
  expandSidebar: "Expand sidebar",
  exportMembersSuccess: "Member CSV downloaded.",
  exportRevenueSuccess: "Revenue CSV downloaded.",
  groups: {
    overview: "Operations overview",
    "users-trust": "Users & trust",
    monetization: "Monetization",
    growth: "Growth & engagement",
    "platform-security": "Platform & security",
  },
  loading: "Loading admin workspace",
  navigation: "Admin navigation",
  openNavigation: "Open admin navigation",
  openPublicSite: "Open public site",
  publicSite: "Site",
  workspace: "Operations workspace",
} as const;

export type AdminShellCopy = typeof KO;

export function getAdminShellCopy(locale: string): AdminShellCopy {
  return locale.toLowerCase().startsWith("ko")
    ? KO
    : (EN as unknown as AdminShellCopy);
}
