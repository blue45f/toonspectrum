import {
  encodeStudioQuickAccessState,
  normalizeStudioQuickAccessState,
  type StudioQuickAccessCommandMeta,
  type StudioQuickAccessState,
} from "./studio-quick-access";

import type { StudioQuickActionId } from "./studio-quick-actions";

export const STUDIO_QUICK_ACCESS_COMMAND_IDS = [
  "undo",
  "redo",
  "save",
  "pen",
  "eraser",
  "fill",
  "eyedropper",
  "select",
  "transform",
  "fit-canvas",
  "properties",
  "duplicate",
  "delete",
  "bring-front",
  "add-bubble",
  "quick-mask",
  "wet-mix",
  "dodge-burn",
] as const;

export type StudioQuickAccessCommandId =
  (typeof STUDIO_QUICK_ACCESS_COMMAND_IDS)[number];

export type StudioQuickAccessCommandAvailability = Readonly<
  Record<StudioQuickAccessCommandId, boolean>
>;

export type StudioQuickAccessExecutionIntent =
  | Readonly<{
    kind: "quick-action";
    action: StudioQuickActionId;
  }>
  | Readonly<{
    kind: "save-draft";
  }>
  | Readonly<{
    kind: "pixel-transform";
  }>;

export interface StudioQuickAccessStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type StudioQuickAccessSaveStatus =
  | "persisted"
  | "storage-unavailable"
  | "invalid-owner"
  | "write-failed"
  | "verification-failed";

const STORAGE_PREFIX = "toonspectrum-studio-quick-access:v1";
const VALID_OWNER_SCOPE = /^(?:guest|owner-[0-9a-f]{16})$/u;

const COMMAND_CATALOG: readonly Omit<
  StudioQuickAccessCommandMeta,
  "available"
>[] = Object.freeze([
  {
    id: "undo",
    label: "되돌리기",
    description: "마지막 편집을 되돌립니다.",
    category: "편집",
    keywords: ["실행 취소", "undo"],
    shortcut: "⌘Z",
  },
  {
    id: "redo",
    label: "다시 실행",
    description: "되돌린 편집을 다시 적용합니다.",
    category: "편집",
    keywords: ["redo"],
    shortcut: "⇧⌘Z",
  },
  {
    id: "save",
    label: "임시저장",
    description: "현재 원고를 임시저장합니다.",
    category: "파일",
    keywords: ["저장", "save"],
    shortcut: "⌘S",
  },
  {
    id: "pen",
    label: "펜",
    description: "마지막으로 사용한 펜과 굵기로 전환합니다.",
    category: "도구",
    keywords: ["브러시", "그리기", "ink"],
    shortcut: "B",
  },
  {
    id: "eraser",
    label: "지우개",
    description: "지우개로 전환합니다.",
    category: "도구",
    keywords: ["삭제", "erase"],
    shortcut: "E",
  },
  {
    id: "fill",
    label: "채우기",
    description: "현재 레이어의 닫힌 영역을 채웁니다.",
    category: "도구",
    keywords: ["페인트 버킷", "버킷", "fill"],
    shortcut: "G",
  },
  {
    id: "eyedropper",
    label: "스포이드",
    description: "캔버스에서 색을 추출합니다.",
    category: "도구",
    keywords: ["색 추출", "color picker"],
    shortcut: "I",
  },
  {
    id: "select",
    label: "오브젝트 선택",
    description: "요소를 선택하고 이동하는 도구로 전환합니다.",
    category: "도구",
    keywords: ["선택", "이동", "object"],
    shortcut: "V",
  },
  {
    id: "transform",
    label: "픽셀 선택 변형",
    description: "현재 이미지의 픽셀 선택 영역을 변형합니다.",
    category: "편집",
    keywords: ["변형", "크기", "회전", "transform"],
  },
  {
    id: "fit-canvas",
    label: "화면에 맞게",
    description: "현재 원고 폭이 작업 영역에 맞도록 보기를 조정합니다.",
    category: "보기",
    keywords: ["맞춤", "줌", "fit"],
    shortcut: "Home",
  },
  {
    id: "properties",
    label: "도구 속성",
    description: "현재 도구와 선택 항목의 속성 팔레트를 엽니다.",
    category: "팔레트",
    keywords: ["속성", "인스펙터", "property"],
  },
  {
    id: "duplicate",
    label: "선택 복제",
    description: "선택한 요소를 복제합니다.",
    category: "편집",
    keywords: ["복사", "duplicate"],
    shortcut: "⌘D",
  },
  {
    id: "delete",
    label: "선택 삭제",
    description: "선택한 요소를 삭제합니다.",
    category: "편집",
    keywords: ["지우기", "delete"],
    shortcut: "Delete",
  },
  {
    id: "bring-front",
    label: "맨 앞으로",
    description: "선택한 요소를 레이어 맨 앞으로 보냅니다.",
    category: "레이어",
    keywords: ["순서", "앞", "layer"],
  },
  {
    id: "add-bubble",
    label: "말풍선 추가",
    description: "기본 대사 말풍선을 현재 페이지에 추가합니다.",
    category: "삽입",
    keywords: ["대사", "speech bubble"],
  },
  {
    id: "quick-mask",
    label: "퀵 마스크",
    description: "현재 이미지의 퀵 마스크 편집을 켜거나 적용합니다.",
    category: "선택",
    keywords: ["마스크", "선택", "mask"],
    shortcut: "Q",
  },
  {
    id: "wet-mix",
    label: "물감 혼합",
    description: "선택한 이미지에서 물감 혼합 도구를 켭니다.",
    category: "보정",
    keywords: ["블렌드", "혼색", "wet mix"],
  },
  {
    id: "dodge-burn",
    label: "닷지 · 번",
    description: "선택한 이미지에서 밝기 보정 브러시를 켭니다.",
    category: "보정",
    keywords: ["밝게", "어둡게", "dodge", "burn"],
  },
]);

const EXECUTION_INTENTS: Readonly<
  Record<StudioQuickAccessCommandId, StudioQuickAccessExecutionIntent>
> = Object.freeze({
  undo: Object.freeze({ kind: "quick-action", action: "undo" }),
  redo: Object.freeze({ kind: "quick-action", action: "redo" }),
  save: Object.freeze({ kind: "save-draft" }),
  pen: Object.freeze({ kind: "quick-action", action: "pen" }),
  eraser: Object.freeze({ kind: "quick-action", action: "eraser" }),
  fill: Object.freeze({ kind: "quick-action", action: "advanced-fill" }),
  eyedropper: Object.freeze({ kind: "quick-action", action: "eyedropper" }),
  select: Object.freeze({ kind: "quick-action", action: "select" }),
  transform: Object.freeze({ kind: "pixel-transform" }),
  "fit-canvas": Object.freeze({ kind: "quick-action", action: "fit-width" }),
  properties: Object.freeze({ kind: "quick-action", action: "properties" }),
  duplicate: Object.freeze({ kind: "quick-action", action: "duplicate" }),
  delete: Object.freeze({ kind: "quick-action", action: "delete" }),
  "bring-front": Object.freeze({ kind: "quick-action", action: "bring-front" }),
  "add-bubble": Object.freeze({ kind: "quick-action", action: "add-bubble" }),
  "quick-mask": Object.freeze({ kind: "quick-action", action: "quick-mask" }),
  "wet-mix": Object.freeze({ kind: "quick-action", action: "wet-mix" }),
  "dodge-burn": Object.freeze({ kind: "quick-action", action: "dodge-burn" }),
});

function storageKey(ownerScope: string): string | null {
  return VALID_OWNER_SCOPE.test(ownerScope)
    ? `${STORAGE_PREFIX}:${ownerScope}`
    : null;
}

/**
 * Creates inert command metadata from the exact editor registry. Missing availability
 * decisions fail closed instead of accidentally enabling a newly added command.
 */
export function buildStudioQuickAccessCommandCatalog(
  availability: Partial<StudioQuickAccessCommandAvailability>,
): readonly StudioQuickAccessCommandMeta[] {
  return Object.freeze(COMMAND_CATALOG.map((command) => Object.freeze({
    ...command,
    available:
      Object.hasOwn(availability, command.id)
      && availability[command.id as StudioQuickAccessCommandId] === true,
  })));
}

/**
 * Resolves only commands backed by the trusted Studio executor registry.
 * Unknown, inherited, and malformed IDs never reach editor handlers.
 */
export function resolveStudioQuickAccessExecutionIntent(
  commandId: string,
): StudioQuickAccessExecutionIntent | null {
  if (
    typeof commandId !== "string"
    || !Object.hasOwn(EXECUTION_INTENTS, commandId)
  ) {
    return null;
  }
  return EXECUTION_INTENTS[commandId as StudioQuickAccessCommandId] ?? null;
}

export function loadStudioQuickAccessState(
  storage: Pick<StudioQuickAccessStorage, "getItem"> | null | undefined,
  ownerScope: string,
): StudioQuickAccessState {
  const key = storageKey(ownerScope);
  if (!storage || !key) return normalizeStudioQuickAccessState(null);
  try {
    return normalizeStudioQuickAccessState(storage.getItem(key));
  } catch {
    return normalizeStudioQuickAccessState(null);
  }
}

/**
 * Saves and verifies the bounded allowlisted payload locally. No project content,
 * command handler, account identifier, provider setting, or network request is involved.
 */
export function saveStudioQuickAccessState(
  storage: StudioQuickAccessStorage | null | undefined,
  ownerScope: string,
  state: StudioQuickAccessState,
): StudioQuickAccessSaveStatus {
  if (!storage) return "storage-unavailable";
  const key = storageKey(ownerScope);
  if (!key) return "invalid-owner";
  const encoded = encodeStudioQuickAccessState(state);
  try {
    storage.setItem(key, encoded);
  } catch {
    return "write-failed";
  }
  try {
    return storage.getItem(key) === encoded
      ? "persisted"
      : "verification-failed";
  } catch {
    return "verification-failed";
  }
}
