export type ProductPrinciplesLocale = "ko" | "en";

export interface ProductPrincipleCopy {
  readonly title: string;
  readonly body: string;
  readonly practice: string;
}

export interface ProductPrinciple {
  readonly id:
    | "one-studio"
    | "workflow-first"
    | "professional-and-clear"
    | "creator-control"
    | "ai-assistance"
    | "open-portability"
    | "coordination-not-surveillance"
    | "sustainable-production"
    | "platform-neutral"
    | "transparent-revenue"
    | "safe-community"
    | "accessible-by-default";
  readonly ko: ProductPrincipleCopy;
  readonly en: ProductPrincipleCopy;
}

export interface ProductPrincipleGroup {
  readonly id: "creative-flow" | "rights-and-technology" | "collaboration" | "community";
  readonly index: string;
  readonly ko: Readonly<{ eyebrow: string; title: string; body: string }>;
  readonly en: Readonly<{ eyebrow: string; title: string; body: string }>;
  readonly principles: readonly ProductPrinciple[];
}

export const PRODUCT_PRINCIPLE_GROUPS = [
  {
    id: "creative-flow",
    index: "01",
    ko: {
      eyebrow: "CREATIVE FLOW",
      title: "기능보다 창작 흐름을 먼저 봅니다.",
      body: "무엇을 많이 제공하는지보다 사용자가 작품의 다음 단계로 자연스럽게 이동하는지를 제품 판단의 출발점으로 둡니다.",
    },
    en: {
      eyebrow: "CREATIVE FLOW",
      title: "The creative flow comes before the feature list.",
      body: "Product decisions start with whether creators can move naturally to the next stage of the work, not with how many tools exist.",
    },
    principles: [
      {
        id: "one-studio",
        ko: {
          title: "기획부터 연재까지 한 프로젝트로",
          body: "대본, 콘티, 2D·3D 제작, 소재, 파일, 일정, 검수와 내보내기를 같은 작품·회차·컷의 맥락으로 연결합니다.",
          practice: "홈과 프로젝트 화면에서 현재 단계와 다음 작업공간을 함께 보여줍니다.",
        },
        en: {
          title: "One project from planning to publishing",
          body: "Scripts, storyboards, 2D and 3D creation, assets, files, schedules, review and export share the same work, episode and panel context.",
          practice: "Home and project surfaces expose the current stage and the next workspace together.",
        },
      },
      {
        id: "workflow-first",
        ko: {
          title: "메뉴보다 해야 할 일을 먼저",
          body: "기능 이름을 알아야 시작할 수 있는 구조보다 ‘기획하기’, ‘그리기’, ‘검수하기’처럼 실제 작업에서 출발하도록 설계합니다.",
          practice: "작업 목적별 시작점, 단계별 가이드와 문맥형 도움말을 제공합니다.",
        },
        en: {
          title: "Start from the task, not the menu",
          body: "Creators begin from real work such as planning, drawing and reviewing instead of needing to know feature names first.",
          practice: "Task-based entry points, staged guidance and contextual help stay visible.",
        },
      },
      {
        id: "professional-and-clear",
        ko: {
          title: "전문 기능과 쉬운 사용성을 함께",
          body: "고급 기능을 줄여서 단순하게 보이게 하기보다 결과를 먼저 보여주고 필요한 설정을 단계적으로 열어 줍니다.",
          practice: "미리보기, 검색, 패널 숨김·배치, 되돌리기와 복구 경로를 기본 경험으로 둡니다.",
        },
        en: {
          title: "Professional depth with a clear interface",
          body: "Advanced capability remains available, while outcomes appear first and deeper controls open progressively.",
          practice: "Preview, search, configurable panels, undo and recovery are treated as core experience.",
        },
      },
    ],
  },
  {
    id: "rights-and-technology",
    index: "02",
    ko: {
      eyebrow: "RIGHTS & TECHNOLOGY",
      title: "기술보다 창작자의 통제권이 우선입니다.",
      body: "저장 위치, 외부 연결, AI 적용과 내보내기 같은 중요한 선택은 사용자가 이해하고 결정할 수 있어야 합니다.",
    },
    en: {
      eyebrow: "RIGHTS & TECHNOLOGY",
      title: "Creator control comes before technical convenience.",
      body: "Important choices such as storage, external connections, AI application and export must remain understandable and controllable.",
    },
    principles: [
      {
        id: "creator-control",
        ko: {
          title: "작품과 작업 결정권은 창작자에게",
          body: "게시 여부와 관계없이 원고와 프로젝트는 먼저 창작자의 작업물이며, 공개 범위와 연결 권한을 사용자가 선택합니다.",
          practice: "프로젝트별 권한, 로컬 작업, 저장·복구와 공개 전 확인 절차를 분리합니다.",
        },
        en: {
          title: "The creator controls the work",
          body: "Artwork and projects belong to their creator before publication, with visibility and connection permissions chosen by the user.",
          practice: "Project permissions, local work, recovery and pre-publish review remain separate decisions.",
        },
      },
      {
        id: "ai-assistance",
        ko: {
          title: "AI는 대체가 아니라 보조",
          body: "AI는 아이디어, 반복 작업과 검수를 돕되 창작자의 의도와 최종 결정을 대신하지 않습니다.",
          practice: "가능한 기능에서는 전송 범위, 공급자, 비용과 결과 적용 전 확인을 함께 표시합니다.",
        },
        en: {
          title: "AI assists rather than replaces",
          body: "AI may help with ideas, repetitive work and review, but it does not replace creator intent or the final decision.",
          practice: "Where AI is connected, data scope, provider, cost and pre-application review are shown together.",
        },
      },
      {
        id: "open-portability",
        ko: {
          title: "서비스에 가두지 않는 파일과 데이터",
          body: "한곳에서 작업하더라도 사용자는 결과물과 프로젝트를 가져오고 내보낼 수 있어야 합니다.",
          practice: "이미지·PSD·공개 포맷 호환, 로컬 저장과 백업 경로를 지속적으로 확장합니다.",
        },
        en: {
          title: "Portable files and data",
          body: "Working in one place must not prevent creators from importing, exporting and keeping their results elsewhere.",
          practice: "Image, PSD and open-format compatibility, local storage and backup paths continue to expand.",
        },
      },
    ],
  },
  {
    id: "collaboration",
    index: "03",
    ko: {
      eyebrow: "COLLABORATION & DELIVERY",
      title: "협업은 감시가 아니라 완성을 위한 조율입니다.",
      body: "누가 얼마나 오래 접속했는지보다 어떤 산출물이 누구에게 전달되고 무엇이 막혀 있는지를 명확하게 합니다.",
    },
    en: {
      eyebrow: "COLLABORATION & DELIVERY",
      title: "Collaboration coordinates the work; it does not surveil people.",
      body: "The product clarifies deliverables, owners, handoffs and blockers instead of judging people by presence time.",
    },
    principles: [
      {
        id: "coordination-not-surveillance",
        ko: {
          title: "사람의 활동량이 아닌 작업 상태",
          body: "담당자, 선행 작업, 피드백, 승인과 마감 위험을 산출물에 연결하며 단순 접속 시간으로 성과를 판단하지 않습니다.",
          practice: "회차·컷·검수본 단위 상태와 인수인계를 중심으로 제작 화면을 구성합니다.",
        },
        en: {
          title: "Work state, not activity scoring",
          body: "Owners, dependencies, feedback, approvals and deadline risks connect to deliverables rather than presence-based performance scoring.",
          practice: "Production surfaces centre on episodes, panels, review versions and handoffs.",
        },
      },
      {
        id: "sustainable-production",
        ko: {
          title: "마감보다 지속 가능한 제작",
          body: "일정 기능은 압박을 높이는 도구가 아니라 위험을 일찍 발견하고 범위·담당·일정을 조정하기 위한 도구여야 합니다.",
          practice: "마감 위험, 의존 관계, 수정 대기와 버퍼를 구분해 다음 조치가 보이게 합니다.",
        },
        en: {
          title: "Sustainable production over deadline pressure",
          body: "Scheduling should reveal risk early and support scope, ownership and timeline changes instead of simply increasing pressure.",
          practice: "Deadline risk, dependencies, pending revisions and buffers are separated into actionable states.",
        },
      },
      {
        id: "platform-neutral",
        ko: {
          title: "특정 유통 플랫폼에 종속되지 않게",
          body: "플랫폼별 규격을 지원하되 원본 프로젝트와 제작 기록은 독립적으로 유지합니다.",
          practice: "게시 전 규격·권리 검사를 제공하고 외부 플랫폼으로 자동 전송하지 않습니다.",
        },
        en: {
          title: "Independent from any single publishing platform",
          body: "Platform-specific formats are supported while the source project and production record remain independent.",
          practice: "Format and rights preflight happens before publishing, without automatic external submission.",
        },
      },
    ],
  },
  {
    id: "community",
    index: "04",
    ko: {
      eyebrow: "BUSINESS, COMMUNITY & ACCESS",
      title: "성장 방식도 창작자 친화적으로 설계합니다.",
      body: "수익화, 커뮤니티 운영과 접근성은 부가 정책이 아니라 창작자가 오래 활동하기 위한 제품 품질입니다.",
    },
    en: {
      eyebrow: "BUSINESS, COMMUNITY & ACCESS",
      title: "The way the product grows must also serve creators.",
      body: "Pricing, community operations and accessibility are product quality, not afterthoughts, because creators need to work sustainably.",
    },
    principles: [
      {
        id: "transparent-revenue",
        ko: {
          title: "요금과 수수료는 이해하기 쉽게",
          body: "유료화할 때 무료 범위, 사용 한도, 외부 AI·저장 비용과 정산 기준을 숨기지 않고 설명합니다.",
          practice: "기능별 운영 원가와 지불 의향을 확인한 뒤 개인·팀·마켓 요금의 경계를 정합니다.",
        },
        en: {
          title: "Understandable pricing and fees",
          body: "Free limits, usage caps, external AI and storage costs, and settlement rules must be explained before monetisation.",
          practice: "Personal, team and marketplace boundaries follow measured operating cost and willingness to pay.",
        },
      },
      {
        id: "safe-community",
        ko: {
          title: "안전하고 존중받는 창작 공동체",
          body: "도용, 괴롭힘, 혐오와 불법 콘텐츠를 다루되 자동 판단만으로 창작자를 단정하지 않는 운영을 지향합니다.",
          practice: "신고 사유, 숨김·제재 기준과 운영 검토 단계를 구분해 관리합니다.",
        },
        en: {
          title: "A safe and respectful creative community",
          body: "Plagiarism, harassment, hate and illegal content need clear handling without reducing creators to opaque automated decisions.",
          practice: "Report reasons, visibility actions, enforcement criteria and operator review are kept distinct.",
        },
      },
      {
        id: "accessible-by-default",
        ko: {
          title: "접근성은 선택 기능이 아니라 기본 품질",
          body: "키보드, 스크린 리더, 고대비, 모션 감소와 다양한 화면 크기를 제품 설계 단계부터 고려합니다.",
          practice: "작은 화면과 보조 기술에서도 핵심 작업을 완료할 수 있는지를 지속적으로 검사합니다.",
        },
        en: {
          title: "Accessibility is a baseline, not an option",
          body: "Keyboard use, screen readers, high contrast, reduced motion and different screen sizes are considered from product design onward.",
          practice: "Core tasks are continually checked on small screens and with assistive technology.",
        },
      },
    ],
  },
] as const satisfies readonly ProductPrincipleGroup[];

export const PRODUCT_DECISION_CHECKS = {
  ko: [
    "실제 웹툰 제작 과정의 문제를 해결하는가?",
    "사용자가 설명 없이도 다음 행동을 이해할 수 있는가?",
    "창작자의 선택권·원본·작업 이력을 지키는가?",
    "협업의 혼선과 반복 작업을 줄이는가?",
    "다른 도구와 플랫폼으로 안전하게 이동할 수 있는가?",
    "다양한 기기와 보조 기술에서도 핵심 작업을 완료할 수 있는가?",
  ],
  en: [
    "Does this solve a real webtoon-production problem?",
    "Can a user understand the next action without an explanation?",
    "Does it protect creator choice, source files and work history?",
    "Does it reduce collaboration confusion and repeated work?",
    "Can the work move safely to other tools and platforms?",
    "Can core tasks be completed across devices and assistive technology?",
  ],
} as const;
