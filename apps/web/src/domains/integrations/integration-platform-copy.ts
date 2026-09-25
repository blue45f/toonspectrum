import type { IntegrationCategory } from "./integration-platform-types";

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
