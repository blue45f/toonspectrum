/**
 * 협업 UX 직관성 키트 — 순수 로직.
 *
 * 원칙: 사용자가 생각하지 않고도 쓸 수 있게.
 * - 3클릭 원칙: 마법사는 최대 3단계
 * - 빈 상태: 다음 행동을 명시
 * - 온보딩 투어는 한 번만, 건너뛰기 가능
 */

/** 마법사 단계 정의. */
export interface WizardStepDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export type WizardStepState = "done" | "active" | "todo";

/** 현재 단계 인덱스를 0..stepCount-1 범위로 고정한다. */
export function clampWizardIndex(index: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.floor(index)), stepCount - 1);
}

/** 각 단계의 표시 상태(done/active/todo)를 계산한다. */
export function wizardStepStates(stepCount: number, currentIndex: number): readonly WizardStepState[] {
  const current = clampWizardIndex(currentIndex, stepCount);
  return Array.from({ length: Math.max(0, stepCount) }, (_, index): WizardStepState =>
    index < current ? "done" : index === current ? "active" : "todo",
  );
}

/** 다음 단계로 이동할 수 있는지 (마지막 단계에서는 불가). */
export function canGoNextWizardStep(stepCount: number, currentIndex: number): boolean {
  return clampWizardIndex(currentIndex, stepCount) < stepCount - 1;
}

/** 이전 단계로 이동할 수 있는지 (첫 단계에서는 불가). */
export function canGoPrevWizardStep(stepCount: number, currentIndex: number): boolean {
  return clampWizardIndex(currentIndex, stepCount) > 0;
}

/** 진행률 0..100. */
export function wizardProgressPercent(stepCount: number, currentIndex: number): number {
  if (stepCount <= 0) return 0;
  return Math.round(((clampWizardIndex(currentIndex, stepCount) + 1) / stepCount) * 100);
}

/** 온보딩 투어 본 여부 저장 키. */
export const PRODUCTION_TOUR_STORAGE_KEY = "toonstudio.production-hub.tour.v1";

/** 저장된 값 기준으로 투어를 보여줄지 판단. 값이 없거나 "seen"이 아니면 보여준다. */
export function shouldShowProductionTour(storedValue: string | null | undefined): boolean {
  return storedValue !== "seen";
}

/** 투어를 본 것으로 기록할 때 저장할 값. */
export function markProductionTourSeenValue(): string {
  return "seen";
}

/** 투어 단계 정의. */
export interface ProductionTourStep {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

/** 프로덕션 허브 첫 방문 투어 — 3단계. */
export const PRODUCTION_HUB_TOUR_STEPS: readonly ProductionTourStep[] = [
  {
    id: "board",
    title: "작업 보드에서 공정을 따라가세요",
    body: "카드를 드래그해 단계를 옮기세요. 준비 → 제작 중 → 검수 → 승인·완료 순서입니다. 막히면 카드를 '막힘·보류'로 옮기면 팀에 바로 알립니다.",
  },
  {
    id: "review",
    title: "외부 검수는 링크 하나로",
    body: "운영 제어 → 외부 검수에서 링크를 만들면, 검수자는 로그인 없이 댓글·승인을 남길 수 있습니다. 링크는 자동 만료되고 워터마크가 적용됩니다.",
  },
  {
    id: "team",
    title: "팀 초대는 역할부터 정하세요",
    body: "사람·권한 관리에서 이메일로 초대하고, 편집자·검수자·뷰어 중 역할을 고르면 됩니다. 작품별 세분 권한은 작품 설정에서 강제됩니다.",
  },
];

/** 프레즌스(함께 보는 사람) 멤버. */
export interface PresenceMember {
  readonly id: string;
  readonly name: string;
  readonly roleLabel: string;
  /** 실시간 활성(지금 보고 있음) — 피드가 없을 때는 false. */
  readonly active: boolean;
}

/** 아바타 스택에 표시할 멤버와 넘침 개수. */
export function slicePresenceMembers(
  members: readonly PresenceMember[],
  max: number,
): { readonly visible: readonly PresenceMember[]; readonly overflowCount: number } {
  const limit = Math.max(1, Math.floor(max));
  // 활성 멤버를 앞에 정렬해 "지금 보고 있음"을 먼저 보여준다.
  const sorted = [...members].sort((a, b) => Number(b.active) - Number(a.active));
  return {
    visible: sorted.slice(0, limit),
    overflowCount: Math.max(0, sorted.length - limit),
  };
}

/** 이름에서 아바타 이니셜(최대 2자)을 추출한다. */
export function presenceInitial(name: string): string {
  const clean = name.trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return [...clean].slice(0, 2).join("");
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** 아바타 배경색 — id 해시로 8가지 중 하나를 고정 선택한다. */
const PRESENCE_PALETTE = [
  "bg-accent-soft text-accent",
  "bg-good/15 text-good",
  "bg-warn/15 text-warn",
  "bg-bad/15 text-bad",
  "bg-[#7c6cf0]/15 text-[#7c6cf0]",
  "bg-[#0ea5a5]/15 text-[#0ea5a5]",
  "bg-[#e07b39]/15 text-[#e07b39]",
  "bg-[#3b82f6]/15 text-[#3b82f6]",
] as const;

export function presenceAvatarTone(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PRESENCE_PALETTE[hash % PRESENCE_PALETTE.length]!;
}

/** 빈 상태 가이드 — "지금 뭘 해야 하는지"를 한 문장으로. */
export interface EmptyStateGuide {
  readonly title: string;
  readonly guide: string;
  readonly actionLabel: string;
}

/** 자주 쓰는 빈 상태 가이드를 한곳에서 관리한다. */
export const EMPTY_STATE_GUIDES = {
  "board-empty": {
    title: "첫 번째 제작 작업을 시작하세요",
    guide: "공정을 설정하면 회차별 작업이 자동으로 만들어집니다. 급한 작업이 있다면 직접 추가해도 됩니다.",
    actionLabel: "작업 만들기",
  },
  "board-filtered": {
    title: "조건에 맞는 작업이 없습니다",
    guide: "검색어나 필터를 바꾸면 다른 작업을 볼 수 있습니다. 필터를 초기화하면 전체 작업을 확인합니다.",
    actionLabel: "모든 작업 보기",
  },
  "review-empty": {
    title: "활성 외부 검수 링크가 없습니다",
    guide: "검수할 제출본을 고르고 링크를 만들면, 검수자는 로그인 없이 의견을 남길 수 있습니다.",
    actionLabel: "외부 검수 링크 만들기",
  },
  "team-empty": {
    title: "아직 팀원이 없습니다",
    guide: "이메일로 초대 링크를 만들면 상대방이 바로 합류할 수 있습니다. 역할은 초대할 때 정합니다.",
    actionLabel: "팀원 초대하기",
  },
} as const satisfies Record<string, EmptyStateGuide>;

export type EmptyStateGuideId = keyof typeof EMPTY_STATE_GUIDES;
