/**
 * T9. 워크스페이스 레이아웃 저장·전환 — 패널 레이아웃 모델.
 *
 * CSP 벤치마킹: 작업 단계(잉킹/채색/만화)마다 패널 배치를 통째로 저장·전환한다.
 * 기존 StudioCompanionWorkspacePresets(멀티 화면 빠른 배치)와는 다른 축이다:
 * 이쪽은 단일 화면 안의 패널 슬롯 배치 그 자체를 저장한다.
 *
 * 순수 함수만 포함하며 DOM·React에 의존하지 않는다.
 */

/** 패널 슬롯 ID — 고정 4개 슬롯. */
export const WORKSPACE_SLOT_IDS = [
  "left-rail",
  "right-inspector",
  "bottom-dock",
  "floating",
] as const;

export type WorkspaceSlotId = (typeof WORKSPACE_SLOT_IDS)[number];

/** 슬롯 한국어 라벨 (컴포넌트 내 상수 — 기존 i18n 파일 수정 금지 정책 준수). */
export const WORKSPACE_SLOT_LABELS: Record<WorkspaceSlotId, string> = {
  "left-rail": "좌측 레일",
  "right-inspector": "우측 인스펙터",
  "bottom-dock": "하단 독",
  floating: "플로팅",
};

export interface WorkspaceSlotLayout {
  /** 슬롯 안에 배치된 패널 ID 목록 (위에서 아래 순서). */
  panelIds: string[];
  /** 접힘 상태. */
  collapsed: boolean;
  /**
   * 슬롯이 차지하는 비율 (0~1).
   * left-rail/right-inspector는 너비 비율, bottom-dock은 높이 비율.
   * floating 슬롯은 자유 배치이므로 0을 사용한다.
   */
  size: number;
}

export interface WorkspaceLayout {
  id: string;
  name: string;
  slots: Record<WorkspaceSlotId, WorkspaceSlotLayout>;
  /** 마지막 수정 시각 (epoch ms). */
  updatedAt: number;
}

export interface WorkspacePanelInfo {
  id: string;
  label: string;
  description: string;
}

const BUILT_IN_WORKSPACE_PANELS: ReadonlyArray<WorkspacePanelInfo> = [
  { id: "brush", label: "브러시", description: "브러시 선택과 스트로크 옵션" },
  { id: "layers", label: "레이어", description: "레이어 목록과 블렌딩" },
  { id: "color", label: "색상", description: "색상 팔레트와 믹서" },
  { id: "tone", label: "톤", description: "스크린톤과 그라데이션" },
  { id: "navigator", label: "네비게이터", description: "전체 원고 미리보기" },
  { id: "reference", label: "레퍼런스", description: "참고 이미지 고정 창" },
  { id: "materials", label: "소재", description: "만화 소재와 배경 라이브러리" },
  { id: "timeline", label: "타임라인", description: "애니메이션·연출 타임라인" },
  { id: "3d", label: "3D", description: "3D 모델 포즈와 카메라" },
  { id: "annotations", label: "주석", description: "검수 코멘트와 체크리스트" },
];

/**
 * 패널 ID 레지스트리. 문자열 ID 기반이라 새 패널은
 * `extendWorkspacePanelRegistry` 로 합쳐서 확장한다.
 */
export const WORKSPACE_PANEL_REGISTRY: Readonly<Record<string, WorkspacePanelInfo>> =
  Object.fromEntries(BUILT_IN_WORKSPACE_PANELS.map((panel) => [panel.id, panel]));

export function isKnownWorkspacePanel(
  panelId: string,
  registry: Readonly<Record<string, WorkspacePanelInfo>> = WORKSPACE_PANEL_REGISTRY,
): boolean {
  return Object.prototype.hasOwnProperty.call(registry, panelId);
}

/** 레지스트리 확장 — 기존 레지스트리를 변경하지 않고 새 객체를 반환한다. */
export function extendWorkspacePanelRegistry(
  extra: ReadonlyArray<WorkspacePanelInfo>,
  registry: Readonly<Record<string, WorkspacePanelInfo>> = WORKSPACE_PANEL_REGISTRY,
): Record<string, WorkspacePanelInfo> {
  return { ...registry, ...Object.fromEntries(extra.map((panel) => [panel.id, panel])) };
}

/** 빈 슬롯 레이아웃 4종 생성. */
export function createEmptyWorkspaceSlots(): Record<WorkspaceSlotId, WorkspaceSlotLayout> {
  return {
    "left-rail": { panelIds: [], collapsed: false, size: 0.22 },
    "right-inspector": { panelIds: [], collapsed: false, size: 0.28 },
    "bottom-dock": { panelIds: [], collapsed: true, size: 0.25 },
    floating: { panelIds: [], collapsed: false, size: 0 },
  };
}

export function createWorkspaceSlotLayout(
  partial: Partial<WorkspaceSlotLayout> = {},
): WorkspaceSlotLayout {
  return {
    panelIds: partial.panelIds ? [...partial.panelIds] : [],
    collapsed: partial.collapsed ?? false,
    size: partial.size ?? 0.25,
  };
}

function createWorkspaceLayoutId(): string {
  return `layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 새 레이아웃 레코드 생성 (순수 함수). */
export function createWorkspaceLayout(
  name: string,
  slots: Partial<Record<WorkspaceSlotId, Partial<WorkspaceSlotLayout>>> = {},
  options: { id?: string; now?: number } = {},
): WorkspaceLayout {
  const base = createEmptyWorkspaceSlots();
  const merged = { ...base };
  for (const slotId of WORKSPACE_SLOT_IDS) {
    const partial = slots[slotId];
    if (partial) merged[slotId] = createWorkspaceSlotLayout({ ...base[slotId], ...partial });
  }
  return {
    id: options.id ?? createWorkspaceLayoutId(),
    name: name.trim(),
    slots: merged,
    updatedAt: options.now ?? Date.now(),
  };
}

/**
 * 레이아웃 정규화 — size를 0~1로 클램프하고, 슬롯 간 중복 패널을
 * 처음 등장한 슬롯에만 남긴다. 저장 전 정리용.
 */
export function normalizeWorkspaceLayout(layout: WorkspaceLayout): WorkspaceLayout {
  const seen = new Set<string>();
  const slots = { ...layout.slots };
  for (const slotId of WORKSPACE_SLOT_IDS) {
    const slot = slots[slotId];
    const panelIds = slot.panelIds.filter((panelId) => {
      if (seen.has(panelId)) return false;
      seen.add(panelId);
      return true;
    });
    const size = Number.isFinite(slot.size)
      ? Math.min(1, Math.max(0, slot.size))
      : 0.25;
    slots[slotId] = { ...slot, panelIds, size };
  }
  return { ...layout, slots };
}

/**
 * 레이아웃 유효성 검사. 오류 문자열 배열을 반환하며, 빈 배열 = 유효.
 * - 4개 슬롯이 모두 존재해야 한다
 * - 모든 패널 ID가 레지스트리에 존재해야 한다
 * - size는 0~1 범위여야 한다
 * - 같은 패널이 여러 슬롯에 중복 배치되면 안 된다
 */
export function validateWorkspaceLayout(
  layout: WorkspaceLayout,
  registry: Readonly<Record<string, WorkspacePanelInfo>> = WORKSPACE_PANEL_REGISTRY,
): string[] {
  const errors: string[] = [];
  if (!layout || typeof layout !== "object") return ["레이아웃이 올바른 객체가 아닙니다."];
  if (!layout.id || typeof layout.id !== "string") errors.push("레이아웃 id가 없습니다.");
  if (!layout.name || typeof layout.name !== "string" || layout.name.trim().length === 0) {
    errors.push("레이아웃 이름이 비어 있습니다.");
  }
  if (!layout.slots || typeof layout.slots !== "object") {
    errors.push("슬롯 정의가 없습니다.");
    return errors;
  }
  const seen = new Set<string>();
  for (const slotId of WORKSPACE_SLOT_IDS) {
    const slot = layout.slots[slotId];
    if (!slot || typeof slot !== "object") {
      errors.push(`슬롯 "${WORKSPACE_SLOT_LABELS[slotId]}" 정의가 없습니다.`);
      continue;
    }
    if (!Array.isArray(slot.panelIds)) {
      errors.push(`슬롯 "${WORKSPACE_SLOT_LABELS[slotId]}"의 패널 목록이 배열이 아닙니다.`);
      continue;
    }
    for (const panelId of slot.panelIds) {
      if (typeof panelId !== "string" || panelId.length === 0) {
        errors.push(`슬롯 "${WORKSPACE_SLOT_LABELS[slotId]}"에 빈 패널 ID가 있습니다.`);
        continue;
      }
      if (!isKnownWorkspacePanel(panelId, registry)) {
        errors.push(`알 수 없는 패널 ID "${panelId}"가 슬롯 "${WORKSPACE_SLOT_LABELS[slotId]}"에 있습니다.`);
      }
      if (seen.has(panelId)) {
        errors.push(`패널 "${panelId}"가 여러 슬롯에 중복 배치되었습니다.`);
      }
      seen.add(panelId);
    }
    if (typeof slot.size !== "number" || !Number.isFinite(slot.size) || slot.size < 0 || slot.size > 1) {
      errors.push(`슬롯 "${WORKSPACE_SLOT_LABELS[slotId]}"의 크기(size)는 0~1 범위여야 합니다.`);
    }
    if (typeof slot.collapsed !== "boolean") {
      errors.push(`슬롯 "${WORKSPACE_SLOT_LABELS[slotId]}"의 접힘 상태(collapsed)는 불리언이어야 합니다.`);
    }
  }
  return errors;
}

/** 유효한 레이아웃인지 여부 (boolean 판정용). */
export function isValidWorkspaceLayout(
  layout: WorkspaceLayout,
  registry: Readonly<Record<string, WorkspacePanelInfo>> = WORKSPACE_PANEL_REGISTRY,
): boolean {
  return validateWorkspaceLayout(layout, registry).length === 0;
}
