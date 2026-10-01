/**
 * /about/studio(작업실 둘러보기) 문구와 데이터. 서비스 소개(/about)가 '무엇·누구·왜'를 말한다면,
 * 이 페이지는 실제 작업실 화면을 하나씩 보여 주고 바로 열게 한다(소개 흐름 2/5).
 * 모든 href는 등록된 라우트여야 한다(marketing-destinations.test).
 */
import type { WorkflowVisual } from "@/shared/components/site-experience/workflow-illustration";

import type { ProductTourVisual } from "./product-tour-content";

export type StudioLocale = "ko" | "en";

export type StudioScreenId = "drawing" | "character" | "background" | "board" | "space" | "ai";

export interface StudioScreenCopy {
  readonly tab: string;
  readonly title: string;
  readonly body: string;
  readonly does: readonly [string, string, string];
  readonly action: string;
  readonly secondary: string;
  readonly alt: string;
}

export interface StudioScreen {
  readonly id: StudioScreenId;
  readonly href: string;
  readonly secondaryHref: string;
  readonly image: string;
  readonly width: number;
  readonly height: number;
  /** capture는 실제 제품 화면 캡처, concept는 기능 설명용 그림이다. 화면에 그대로 표기한다. */
  readonly visual: ProductTourVisual;
  /** 캡처 시점. 화면이 바뀔 수 있으므로 날짜를 함께 보여 준다. */
  readonly capturedAt: string;
  readonly ko: StudioScreenCopy;
  readonly en: StudioScreenCopy;
}

const TOUR = "/brand/product-tour";

/**
 * 작업실 화면 여섯 개. 캡처가 없는 화면은 제품 안에서 쓰는 그림을 쓰고 concept로 표기한다.
 * 이미지는 8분 투어 제작 시점의 캡처라 현재 테마 색과 다를 수 있다(capturedAt으로 밝힌다).
 */
export const STUDIO_SCREENS: readonly StudioScreen[] = [
  {
    id: "drawing",
    href: "/studio/canvas",
    secondaryHref: "/studio/comic",
    image: `${TOUR}/03-draw.png`,
    width: 1440,
    height: 1000,
    visual: "capture",
    capturedAt: "tour",
    ko: {
      tab: "드로잉",
      title: "드로잉 캔버스",
      body: "빈 캔버스가 바로 열립니다. 도구와 패널은 캔버스 옆에 두고 복잡한 설정은 필요할 때만 펼칩니다.",
      does: ["브러시·지우개·스포이트로 바로 그리기", "레이어·선택·보정을 캔버스 옆에서", "컷·말풍선·식자로 원고 완성"],
      action: "빈 캔버스에 바로 그리기",
      secondary: "컷툰 편집기",
      alt: "도구 레일, 캔버스, 레이어·페이지 패널이 보이는 드로잉 캔버스 화면",
    },
    en: {
      tab: "Drawing",
      title: "Drawing canvas",
      body: "A blank canvas opens right away. Tools and panels stay beside the canvas, and advanced settings open only when needed.",
      does: ["Draw with brushes, eraser and eyedropper", "Layers, selection and corrections beside the canvas", "Finish pages with panels, balloons and lettering"],
      action: "Draw on a blank canvas",
      secondary: "Comic editor",
      alt: "The drawing canvas with the tool rail, canvas and layer and page panels",
    },
  },
  {
    id: "character",
    href: "/studio/assets/characters/new",
    secondaryHref: "/studio/poser",
    image: "/assets/3d/characters/thumbnails/alicia.png",
    width: 512,
    height: 512,
    visual: "concept",
    capturedAt: "asset",
    ko: {
      tab: "3D 캐릭터",
      title: "3D 캐릭터 셰이퍼",
      body: "프리셋 3D 캐릭터에서 출발해 얼굴·헤어·의상·체형을 고르고, 포즈를 잡아 컷의 구도 참고로 씁니다.",
      does: ["프리셋 캐릭터 고르기", "얼굴·헤어·의상·체형 조정", "포즈를 잡아 구도 참고로 쓰기"],
      action: "3D 캐릭터 만들기",
      secondary: "포즈 스튜디오",
      alt: "3D 캐릭터 프리셋 중 하나의 미리보기 이미지",
    },
    en: {
      tab: "3D character",
      title: "3D character shaper",
      body: "Start from a preset 3D character, choose the face, hair, outfit and body, then pose it as a composition reference.",
      does: ["Pick a preset character", "Adjust face, hair, outfit and body", "Pose it as a composition reference"],
      action: "Create a 3D character",
      secondary: "Pose studio",
      alt: "Preview image of one of the preset 3D characters",
    },
  },
  {
    id: "background",
    href: "/studio/bg3d",
    secondaryHref: "/studio/assets",
    image: `${TOUR}/05-3d.png`,
    width: 1440,
    height: 1000,
    visual: "capture",
    capturedAt: "tour",
    ko: {
      tab: "3D 배경",
      title: "3D 배경 스튜디오",
      body: "3D 공간에 소품과 조명을 두고 카메라 구도를 잡아, 그리기 어려운 배경의 기준을 빠르게 만듭니다.",
      does: ["3D 공간에 소품·조명 배치", "카메라 구도와 화각 잡기", "컷 배경의 기준 이미지 만들기"],
      action: "3D 배경 열기",
      secondary: "소재 라이브러리",
      alt: "3D 공간과 카메라 설정이 보이는 3D 배경 스튜디오 화면",
    },
    en: {
      tab: "3D set",
      title: "3D background studio",
      body: "Place props and lights in 3D and frame the camera to create a reliable reference for hard-to-draw backgrounds.",
      does: ["Place props and lights in 3D", "Frame the camera and lens", "Make a reference for panel backgrounds"],
      action: "Open 3D backgrounds",
      secondary: "Asset library",
      alt: "The 3D background studio with the 3D space and camera settings",
    },
  },
  {
    id: "board",
    href: "/production/projects/sample-project/production",
    secondaryHref: "/production",
    image: `${TOUR}/07-production.png`,
    width: 1440,
    height: 1000,
    visual: "capture",
    capturedAt: "tour",
    ko: {
      tab: "협업 보드",
      title: "팀 공정 보드",
      body: "회차 작업을 공정 단계별 보드에서 보고 담당자·마감·검토 상태를 같은 작품 단위로 관리합니다.",
      does: ["공정 단계별 작업 카드 보기", "담당자·마감·검토 상태 확인", "수정 요청과 승인 흐름 관리"],
      action: "샘플 공정 보드 열기",
      secondary: "제작 관리 홈",
      alt: "제작 진행률, 다음 할 일, 회차 구조가 보이는 제작 관리 화면",
    },
    en: {
      tab: "Team board",
      title: "Team production board",
      body: "Follow episode tasks on a board organised by production stage and manage owners, deadlines and review status per work.",
      does: ["See task cards by production stage", "Check owners, deadlines and review status", "Manage revision requests and approvals"],
      action: "Open the sample board",
      secondary: "Production home",
      alt: "The production screen with progress, next tasks and episode structure",
    },
  },
  {
    id: "space",
    href: "/studio/space",
    secondaryHref: "/collaborate",
    image: "/assets/virtual-studio/cinematic-v9/studio-tour-1024.webp",
    width: 1024,
    height: 576,
    visual: "concept",
    capturedAt: "asset",
    ko: {
      tab: "가상 스튜디오",
      title: "가상 스튜디오",
      body: "내 캐릭터로 공간을 걷고, 가까이 다가가 대화하고, 팀과 같은 작업실에 모여 함께 작업합니다.",
      does: ["내 캐릭터로 공간 걸어 다니기", "가까이 다가가 대화·이모트 나누기", "가구·소품으로 작업실 꾸미기"],
      action: "가상 스튜디오 입장",
      secondary: "함께할 사람 찾기",
      alt: "가상 스튜디오 캠퍼스를 표현한 일러스트",
    },
    en: {
      tab: "Virtual studio",
      title: "Virtual studio",
      body: "Walk the space as your character, talk when you come close, and gather with the team in one shared studio.",
      does: ["Walk the space as your character", "Talk and react when you come close", "Decorate the studio with furniture and props"],
      action: "Enter the virtual studio",
      secondary: "Find collaborators",
      alt: "Illustration of the virtual studio campus",
    },
  },
  {
    id: "ai",
    href: "/studio/ai-lab",
    secondaryHref: "/studio/ai-settings",
    image: `${TOUR}/06-ai.png`,
    width: 1440,
    height: 1000,
    visual: "capture",
    capturedAt: "tour",
    ko: {
      tab: "AI 보조",
      title: "AI 보조",
      body: "내가 연결한 AI 도구로 반복 작업과 아이디어 후보를 만들고, 적용 여부와 최종 판단은 창작자가 정합니다.",
      does: ["내 API 키로 생성 도구 연결", "반복 작업·아이디어 후보 만들기", "적용 여부는 창작자가 결정"],
      action: "AI 도구 보기",
      secondary: "AI 설정",
      alt: "생성 도구와 결과 후보가 보이는 AI 변환실 화면",
    },
    en: {
      tab: "AI assist",
      title: "AI assistance",
      body: "Use the AI tools you connect for repetition and idea candidates, while the creator decides what is applied and final.",
      does: ["Connect generation tools with your API key", "Create repeatable work and idea candidates", "The creator decides what is applied"],
      action: "See AI tools",
      secondary: "AI settings",
      alt: "The AI lab with generation tools and result candidates",
    },
  },
];

/** 이미지 표기 문구. capturedAt 값마다 사실대로 적는다. */
export const STUDIO_SCREEN_NOTES = {
  ko: { tour: "8분 투어 제작 시점의 제품 화면 캡처", asset: "제품 안에서 쓰는 그림 · 화면 캡처 아님", today: "2026-09-30 제품 화면 캡처" },
  en: { tour: "Product capture from when the tour was produced", asset: "Artwork used in the product · not a screen capture", today: "Product capture, 2026-09-30" },
} as const;

export interface StudioFlowStep {
  readonly visual: WorkflowVisual;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly action: string;
  readonly outcome: string;
}

export const STUDIO_INTRO_COPY = {
  ko: {
    primary: "새 작품 시작하기",
    secondary: "8분 제품 투어 보기",
    projects: "내 프로젝트",
    brandFilm: "창작 이야기 보기",
    step: "서비스 소개 2/5 · 작업실 둘러보기",
    trust: ["전문 2D·3D 제작", "자동 저장·버전·복구", "일정·협업·검수·연재"],
    previewAlt: "햇살이 드는 아틀리에에서 연필 스케치가 채색된 웹툰과 입체적인 이야기 세계로 이어지는 브랜드 콘셉트 아트",
    previewCaption: "작은 아이디어가 하나의 세계가 될 때까지.",
    artworkBadge: "AI로 제작한 브랜드 콘셉트 아트",
    floatCards: [
      { tag: "3D 배경", title: "컷에 바로 붙는 3D", body: "포즈·소품·카메라를 현재 컷에 연결" },
      { tag: "자동 저장", title: "작업은 알아서 저장", body: "버전 이력으로 언제든 되돌리기" },
    ],
    jumpLabel: "작업실 소개 섹션",
    jumpStart: "바로 시작",
    jumpScreens: "작업실 화면",
    jumpFlow: "제작 흐름",
    jumpPrinciples: "제품 원칙",
    jumpSupport: "소재·협업·도움",
    screensEyebrow: "실제 작업실 화면",
    screensTitle: "화면을 보고,\n바로 그 작업실로.",
    screensBody: "여섯 작업실을 차례로 골라 보세요. 무엇을 하는 곳인지 확인하고 같은 화면을 바로 열 수 있습니다.",
    screensTabs: "작업실 선택",
    screensDoes: "여기서 하는 일",
    flowEyebrow: "기획부터 연재까지",
    flowTitle: "모든 단계가 다음 작업으로\n자연스럽게 이어집니다.",
    flowIntro: "기능마다 새로운 파일과 페이지를 찾지 않아도 됩니다. 하나의 작품 프로젝트가 현재 위치와 다음 행동을 알려줍니다.",
    flowAlt: "기획, 콘티, 2D·3D 제작, 협업, 검토와 연재가 연결된 ToonStudio 제작 흐름 예시",
    flowCaption: "표시된 수치는 기능 이해를 위한 예시이며 실제 사용자 통계가 아닙니다.",
    flowOutcome: "완성되는 것",
    flowNext: "다음",
    flowLast: "내 작품 관리",
    flow: [
      { visual: "plan", title: "기획·대본", body: "작품 설정, 캐릭터, 시즌, 회차와 대본을 제작 기준으로 정리합니다.", href: "/story-lab", action: "기획 시작", outcome: "작품 설정 · 대본" },
      { visual: "storyboard", title: "콘티·컷 구성", body: "대본을 장면과 컷으로 나누고 스크롤 리듬과 연출을 설계합니다.", href: "/studio/new", action: "콘티 만들기", outcome: "장면 순서 · 컷 구성" },
      { visual: "create", title: "2D·3D 제작", body: "선화·채색·식자와 캐릭터 포즈·배경·카메라를 직접 제작합니다.", href: "/studio", action: "작업실 열기", outcome: "선화 · 채색 · 완성 원고" },
      { visual: "collaborate", title: "일정·협업", body: "역할, 담당자, 선행 작업, 마감과 인수인계를 실제 산출물에 연결합니다.", href: "/production", action: "제작 흐름 보기", outcome: "담당자 · 일정 · 인수인계" },
      { visual: "review", title: "검토·승인", body: "고정된 검수본에 의견을 남기고 수정본과 승인본을 정확히 구분합니다.", href: "/production/projects/sample-project/review", action: "샘플 검토 체험", outcome: "수정 의견 · 검수본" },
      { visual: "publish", title: "연재·배포", body: "규격과 권리를 검사하고 모바일 미리보기와 게시본을 준비합니다.", href: "/studio/publish", action: "연재 준비", outcome: "모바일 미리보기 · 게시본" },
    ] satisfies readonly StudioFlowStep[],
    principlesEyebrow: "창작자를 중심에 둔 제품 원칙",
    principlesTitle: "연결하되 가두지 않고,\n도와주되 대신하지 않습니다.",
    principlesBody: "작품과 결정권은 창작자에게 있고, AI는 보조 도구로 씁니다. 결과물은 언제든 가져오고 내보낼 수 있어야 합니다.",
    principlesAction: "12가지 제품 원칙 보기",
    supportEyebrow: "필요한 모든 재료와 사람",
    supportTitle: "작품 밖으로 나가지 않고,\n찾고 배우고 함께 만드세요.",
    support: [
      { visual: "assets", tag: "소재 마켓", title: "바로 쓸 소재 찾기", body: "브러시·배경·캐릭터·3D·폰트와 사용 권리를 확인하고 프로젝트에 추가합니다.", href: "/market" },
      { visual: "collaborate", tag: "함께 만들기", title: "팀원·외부 작업자 연결", body: "역할, 작업 범위, 마감과 완료 기준을 분명히 한 뒤 안전하게 협업합니다.", href: "/collaborate" },
      { visual: "learn", tag: "배우기", title: "막힌 단계에서 바로 도움받기", body: "현재 화면과 제작 단계에 맞는 쉬운 설명, 예제와 복구 방법을 찾습니다.", href: "/learn" },
    ],
    closingEyebrow: "ToonStudio",
    closingTitle: "작품을 시작하는 순간부터,\n독자에게 공개하는 순간까지.",
    closingBody: "대본·콘티·2D·3D·소재·파일·일정·협업·검토와 연재 준비를 하나의 프로젝트에서 끝까지 이어가세요.",
    closingAction: "새 작품 시작하기",
    closingSecondary: "샘플 제작 흐름 보기",
    pagerLabel: "소개 페이지 이어 읽기",
    pagerPrev: { href: "/about", step: "이전 · 소개 1/5", title: "서비스 소개", body: "무엇을·누구를 위해·왜 만드는지" },
    pagerNext: { href: "/about/workflow", step: "다음 · 소개 3/5", title: "웹툰 제작 과정", body: "기획부터 연재 운영까지 일곱 단계" },
  },
  en: {
    primary: "Start a new work",
    secondary: "Watch the 8-minute product tour",
    projects: "My projects",
    brandFilm: "Explore our creative story",
    step: "About 2 of 5 · Studio tour",
    trust: ["Professional 2D and 3D creation", "Autosave, versions and recovery", "Scheduling, collaboration, review and publishing"],
    previewAlt: "Brand concept art of a sunlit atelier where pencil sketches become painted webtoon panels and a dimensional story world",
    previewCaption: "From a small idea to a world of your own.",
    artworkBadge: "AI-generated brand concept art",
    floatCards: [
      { tag: "3D BACKGROUNDS", title: "3D that snaps to the panel", body: "Pose, props and camera linked to the current panel" },
      { tag: "AUTOSAVE", title: "Work saves itself", body: "Roll back anytime with version history" },
    ],
    jumpLabel: "Studio introduction sections",
    jumpStart: "Start here",
    jumpScreens: "Studio screens",
    jumpFlow: "Workflow",
    jumpPrinciples: "Product principles",
    jumpSupport: "Assets, people and help",
    screensEyebrow: "Real studio screens",
    screensTitle: "See the screen,\nthen open that studio.",
    screensBody: "Pick each of the six studios in turn. See what it is for, then open the same screen directly.",
    screensTabs: "Choose a studio",
    screensDoes: "What you do here",
    flowEyebrow: "From planning to publishing",
    flowTitle: "Every stage leads naturally\nto the next task.",
    flowIntro: "You do not need to hunt through a new page and file for every feature. One project keeps the current context and next action clear.",
    flowAlt: "A ToonStudio workflow connecting planning, storyboards, 2D and 3D creation, collaboration, review and publishing",
    flowCaption: "Displayed figures are examples for explaining the product, not live user statistics.",
    flowOutcome: "You create",
    flowNext: "Next",
    flowLast: "Manage my work",
    flow: [
      { visual: "plan", title: "Plan and script", body: "Shape the world, characters, seasons, episodes and scripts as production-ready source material.", href: "/story-lab", action: "Start planning", outcome: "Story settings · script" },
      { visual: "storyboard", title: "Storyboard and panels", body: "Turn the script into scenes and panels while designing scroll rhythm and direction.", href: "/studio/new", action: "Create a storyboard", outcome: "Scene order · panel layout" },
      { visual: "create", title: "Create in 2D and 3D", body: "Produce line art, color, lettering, character poses, backgrounds and camera compositions.", href: "/studio", action: "Open the studio", outcome: "Line art · color · manuscript" },
      { visual: "collaborate", title: "Schedule and collaborate", body: "Connect roles, owners, dependencies, deadlines and handoffs to real deliverables.", href: "/production", action: "Open production", outcome: "Owners · schedule · handoff" },
      { visual: "review", title: "Review and approve", body: "Comment on a fixed review version and keep revisions, approvals and releases distinct.", href: "/production/projects/sample-project/review", action: "Try sample review", outcome: "Feedback · review version" },
      { visual: "publish", title: "Publish and deliver", body: "Check format and rights, preview mobile reading and prepare a release.", href: "/studio/publish", action: "Prepare to publish", outcome: "Mobile preview · release" },
    ] satisfies readonly StudioFlowStep[],
    principlesEyebrow: "Creator-first product principles",
    principlesTitle: "Connected without lock-in,\nassisted without replacement.",
    principlesBody: "The work and its decisions belong to the creator, and AI remains an assistant. Results should always be importable and exportable.",
    principlesAction: "See all 12 product principles",
    supportEyebrow: "Every asset, person and answer you need",
    supportTitle: "Find, learn and collaborate\nwithout leaving the work.",
    support: [
      { visual: "assets", tag: "Asset market", title: "Find production-ready assets", body: "Check brushes, backgrounds, characters, 3D assets, fonts and usage rights, then add them to the project.", href: "/market" },
      { visual: "collaborate", tag: "Collaborate", title: "Connect teammates and specialists", body: "Collaborate safely with clear roles, scope, deadlines and completion criteria.", href: "/collaborate" },
      { visual: "learn", tag: "Learn", title: "Get help at the blocked step", body: "Find plain-language guidance, examples and recovery steps for the current screen and production stage.", href: "/learn" },
    ],
    closingEyebrow: "ToonStudio",
    closingTitle: "From the moment a work begins\nto the moment readers see it.",
    closingBody: "Connect scripts, storyboards, 2D, 3D, assets, files, schedules, collaboration, review and publishing in one project.",
    closingAction: "Start a new work",
    closingSecondary: "See a sample workflow",
    pagerLabel: "Continue the introduction",
    pagerPrev: { href: "/about", step: "Previous · 1 of 5", title: "About ToonStudio", body: "What it is, who it serves and why" },
    pagerNext: { href: "/about/workflow", step: "Next · 3 of 5", title: "Webtoon workflow", body: "Seven stages from planning to release operations" },
  },
} as const;

export type StudioIntroCopy = (typeof STUDIO_INTRO_COPY)[StudioLocale];
