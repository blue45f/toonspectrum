import { BookOpen, FileOutput, Handshake, Layers3, PackageCheck, PanelsTopLeft, Paintbrush, type LucideIcon } from "lucide-react";

import type { WorkflowVisual } from "@/shared/components/site-experience/workflow-illustration";

import type { StudioRegionId } from "./public/intro-studio-window";

/**
 * 작업실 둘러보기(/about/studio)의 내용.
 * 예시 편집기의 다섯 영역을 번호 순서대로 설명하고, 각 영역에서 바로 열 수 있는 실제 작업공간을 건다.
 * (모든 href는 등록된 라우트여야 한다 — marketing-destinations.test)
 */
export type StudioTourTab = "map" | "start" | "support";

interface StudioRegionCopy {
  /** 번호 버튼에 들어가는 짧은 이름. */
  readonly label: string;
  readonly title: string;
  readonly body: string;
  readonly points: readonly [string, string, string];
  readonly cta: string;
}

export interface StudioRegion {
  readonly id: StudioRegionId;
  readonly icon: LucideIcon;
  readonly href: string;
  readonly ko: StudioRegionCopy;
  readonly en: StudioRegionCopy;
}

export const STUDIO_REGIONS = [
  {
    id: "tools",
    icon: Paintbrush,
    href: "/studio/canvas",
    ko: {
      label: "도구 레일",
      title: "자주 쓰는 도구는 왼쪽 레일에",
      body: "브러시·지우개·선택·텍스트·말풍선을 세로 레일에서 바로 고르고, 크기와 색은 옵션 바에서 조절해요.",
      points: ["브러시·지우개·선택", "텍스트·말풍선(식자)", "크기·색·불투명도는 옵션 바에서"],
      cta: "캔버스 열기",
    },
    en: {
      label: "Tool rail",
      title: "The tools you use most live on the left",
      body: "Pick brushes, eraser, selection, text and balloons from the rail, then adjust size and color in the option bar.",
      points: ["Brush, eraser and selection", "Text and balloons for lettering", "Size, color and opacity in the option bar"],
      cta: "Open the canvas",
    },
  },
  {
    id: "canvas",
    icon: PanelsTopLeft,
    href: "/studio/comic",
    ko: {
      label: "캔버스",
      title: "컷 위에 바로 그리고 말풍선을 붙여요",
      body: "세로 스크롤 원고의 컷을 캔버스에서 직접 다듬고, 3D 구도와 소재를 현재 컷으로 불러와요.",
      points: ["컷 분할과 말풍선을 같은 화면에서", "3D 구도·소재를 현재 컷에 연결", "확대·이동으로 세밀하게 다듬기"],
      cta: "컷툰 편집기 열기",
    },
    en: {
      label: "Canvas",
      title: "Draw on the panel and attach balloons",
      body: "Refine the panels of a vertical-scroll page right on the canvas and bring 3D framing and assets into the current panel.",
      points: ["Panel split and balloons on one screen", "3D framing and assets linked to the panel", "Zoom and pan for fine work"],
      cta: "Open the comic editor",
    },
  },
  {
    id: "layers",
    icon: Layers3,
    href: "/studio/canvas",
    ko: {
      label: "레이어",
      title: "대사·캐릭터·배경을 겹겹이 나눠 두세요",
      body: "레이어를 나누면 말풍선만, 배경만 고치기 쉬워요. 보기·잠금·순서와 불투명도는 오른쪽 패널에서 다뤄요.",
      points: ["레이어별 보기·잠금·순서", "불투명도와 혼합 모드", "이름을 붙여 정리하기"],
      cta: "캔버스 열기",
    },
    en: {
      label: "Layers",
      title: "Keep dialogue, characters and backgrounds apart",
      body: "Separate layers make it easy to fix only the balloons or only the background. Visibility, lock, order and opacity live in the right panel.",
      points: ["Visibility, lock and order per layer", "Opacity and blend modes", "Name layers to stay organised"],
      cta: "Open the canvas",
    },
  },
  {
    id: "pages",
    icon: BookOpen,
    href: "/studio/new",
    ko: {
      label: "페이지 스트립",
      title: "페이지와 컷 순서를 한눈에",
      body: "아래 스트립에서 페이지·컷을 한눈에 보고 골라요. 지금 작업 중인 컷은 보라색 테두리로 표시돼요.",
      points: ["페이지·컷 목록을 한눈에", "지금 위치가 테두리로 표시", "+ 버튼으로 새 페이지·컷 추가"],
      cta: "새 작품에서 해 보기",
    },
    en: {
      label: "Page strip",
      title: "See page and panel order at a glance",
      body: "The strip below shows pages and panels so you can jump between them. The panel you are working on gets a purple outline.",
      points: ["Pages and panels in one list", "Your current spot is outlined", "Add a page or panel with +"],
      cta: "Try it in a new work",
    },
  },
  {
    id: "topbar",
    icon: FileOutput,
    href: "/studio/publish",
    ko: {
      label: "저장·내보내기",
      title: "저장·내보내기·공유는 늘 같은 자리에",
      body: "작업 상태와 저장 여부가 위쪽에 보이고, 내보내기와 검수는 같은 줄에 모여 있어요. 공개는 저장 다음에 고르는 선택이에요.",
      points: ["자동 저장 상태 표시", "내보내기와 규격 검사", "공개보다 저장·내보내기가 먼저"],
      cta: "검수·내보내기 열기",
    },
    en: {
      label: "Save & export",
      title: "Save, export and share always sit in the same place",
      body: "Work and save status stay visible on top, with export and review on the same row. Publishing is a choice you make after saving.",
      points: ["Autosave status", "Export and format checks", "Saving and export come before publishing"],
      cta: "Open review and export",
    },
  },
] as const satisfies readonly StudioRegion[];

/** 번호 핀 순서(도구 → 캔버스 → 레이어 → 페이지 → 저장). */
export const STUDIO_REGION_ORDER: readonly StudioRegionId[] = STUDIO_REGIONS.map((region) => region.id);

interface StudioSupportCopy {
  readonly tag: string;
  readonly title: string;
  readonly body: string;
}

export interface StudioSupportTile {
  readonly id: "market" | "collaborate" | "learn";
  readonly icon: LucideIcon;
  readonly art: WorkflowVisual;
  readonly href: string;
  readonly ko: StudioSupportCopy;
  readonly en: StudioSupportCopy;
}

/** 작품 밖으로 나가지 않고 재료·사람·도움을 찾는 세 입구. */
export const STUDIO_SUPPORT_TILES = [
  {
    id: "market",
    icon: PackageCheck,
    art: "assets",
    href: "/market",
    ko: { tag: "소재 마켓", title: "바로 쓸 소재 찾기", body: "브러시·배경·캐릭터·3D·폰트와 사용 권리를 확인하고 프로젝트에 추가합니다." },
    en: { tag: "Asset market", title: "Find production-ready assets", body: "Check brushes, backgrounds, characters, 3D assets, fonts and usage rights, then add them to the project." },
  },
  {
    id: "collaborate",
    icon: Handshake,
    art: "collaborate",
    href: "/collaborate",
    ko: { tag: "함께 만들기", title: "팀원·외부 작업자 연결", body: "역할, 작업 범위, 마감과 완료 기준을 분명히 한 뒤 안전하게 협업합니다." },
    en: { tag: "Collaborate", title: "Connect teammates and specialists", body: "Collaborate safely with clear roles, scope, deadlines and completion criteria." },
  },
  {
    id: "learn",
    icon: BookOpen,
    art: "learn",
    href: "/learn",
    ko: { tag: "배우기", title: "막힌 단계에서 바로 도움받기", body: "현재 화면과 제작 단계에 맞는 쉬운 설명, 예제와 복구 방법을 찾습니다." },
    en: { tag: "Learn", title: "Get help at the blocked step", body: "Find plain-language guidance, examples and recovery steps for the current screen and production stage." },
  },
] as const satisfies readonly StudioSupportTile[];

/** 더 깊이 알고 싶을 때 이어 읽는 소개 페이지. */
export const STUDIO_DEPTH_LINKS = [
  { href: "/about/workflow", ko: "제작 과정 일곱 단계", en: "The seven production stages" },
  { href: "/about/principles", ko: "제품 원칙 12가지", en: "Twelve product principles" },
  { href: "/product-tour", ko: "8분 제품 투어", en: "8-minute product tour" },
] as const;

/** 예전 섹션 앵커(`#creator-*`) → 탭. 공유된 옛 링크가 막다른 길이 되지 않게 가장 가까운 탭을 연다. */
export const STUDIO_TOUR_ANCHORS: Readonly<Record<string, StudioTourTab>> = {
  "#creator-start": "start",
  "#creator-toolkit-title": "start",
  "#creator-bridge": "map",
  "#creator-bridge-title": "map",
  "#creator-flow": "map",
  "#creator-process-title": "map",
  "#creator-support": "support",
  "#creator-support-title": "support",
};
