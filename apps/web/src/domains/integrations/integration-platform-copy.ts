import type { IntegrationCategory, IntegrationProviderStatus } from "./integration-platform-types";

export const INTEGRATION_CATEGORY_LABELS: Readonly<Record<IntegrationCategory, string>> = {
  storage: "저장소",
  "work-management": "업무 관리",
  communication: "커뮤니케이션",
  creation: "제작",
  publishing: "게시·배포",
  trust: "권리·신뢰",
  data: "데이터",
  commerce: "결제·수익화",
  developer: "개발자",
};

export const INTEGRATION_PROVIDER_STATUS_LABELS: Readonly<Record<IntegrationProviderStatus["status"], string>> = {
  ready: "사용 가능",
  manual: "수동 완주 가능",
  "configuration-required": "운영 설정 필요",
  "approval-required": "공급자 승인 필요",
};
