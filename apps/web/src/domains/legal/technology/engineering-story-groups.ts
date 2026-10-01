import type { LocalizedText } from "./engineering-story-content";

/**
 * 제작 스토리 읽기 순서. 챕터 데이터(order)는 작성 순서라서 주제별로 흩어져 있으므로,
 * 발표 흐름(문제 → 드로잉 → 로컬 → 협업·공간 → 3D → AI → 권리 → 품질·운영)에 맞춰 묶는다.
 * 모든 공개 챕터는 정확히 한 그룹에 속해야 한다(테스트로 확인).
 */

export interface EngineeringStoryGroup {
  readonly id: string;
  readonly title: LocalizedText;
  readonly intro: LocalizedText;
  readonly chapterIds: readonly string[];
}

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export const ENGINEERING_STORY_GROUPS = [
  {
    id: "foundation",
    title: t("제품과 구조", "Product and structure"),
    intro: t("왜 브라우저 제작실인가, 경계를 어떻게 나눴나", "Why a browser studio, and how the boundaries were drawn"),
    chapterIds: ["product-intent", "architecture", "open-source"],
  },
  {
    id: "drawing",
    title: t("드로잉 엔진", "Drawing engine"),
    intro: t("손의 입력이 문서의 획이 되기까지", "From hand input to a document stroke"),
    chapterIds: ["brush-engine", "brush-render-authority"],
  },
  {
    id: "local-first",
    title: t("로컬 우선 실행", "Local-first execution"),
    intro: t("서버 없이도 작업이 남는 구조", "Keeping work alive without a server"),
    chapterIds: ["storage", "browser-local-compute", "worker-architecture", "pwa-continuity"],
  },
  {
    id: "collaboration",
    title: t("협업과 가상 스튜디오", "Collaboration and the virtual studio"),
    intro: t("함께 편집하고, 공간에서 만나기", "Editing together and meeting in space"),
    chapterIds: ["collaborative-crdt-boundary", "webrtc-media-authority", "virtual-studio-world-authority"],
  },
  {
    id: "three-d",
    title: t("3D", "3D"),
    intro: t("그리기 위한 3D와 제작 도구 연결", "3D for drawing, connected to production tools"),
    chapterIds: ["web-3d-engine", "blender-mcp-boundary"],
  },
  {
    id: "ai",
    title: t("AI", "AI"),
    intro: t("제안은 AI, 확정은 사람", "AI proposes, people decide"),
    chapterIds: ["ai-routing", "free-ai-routing", "image-generation", "sound-generation", "ai-assisted-engineering"],
  },
  {
    id: "trust",
    title: t("계정·공유·권리", "Accounts, sharing and rights"),
    intro: t("로그인, 공유, 라이선스와 데이터 출처", "Sign-in, sharing, licenses and data provenance"),
    chapterIds: ["authentication", "social-identity-lifecycle", "share-distribution-boundary", "licenses", "crawling", "open-api-data"],
  },
  {
    id: "quality",
    title: t("품질과 운영", "Quality and operations"),
    intro: t("검증, 성능, 무료 우선 인프라와 장애 기록", "Verification, performance, free-first infrastructure and incidents"),
    chapterIds: ["quality", "performance", "infrastructure", "cost-engineering", "troubleshooting-evidence", "delivery"],
  },
] as const satisfies readonly EngineeringStoryGroup[];
