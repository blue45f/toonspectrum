import {
  STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
  type StudioFloatingSurfaceLayout,
} from "../studio-floating-surface";

import type { StudioShellStrokeFocusPhase } from "./studio-shell-stroke-focus";

export const STUDIO_SHELL_FLOATING_VISIBILITY_VERSION = 2 as const;

export const STUDIO_SHELL_FLOATING_VISIBILITY_IDS = [
  "workspace-switcher",
  "document-tools",
  "draft-save-status",
  "drawing-options",
  "drawing-input",
  "offline-readiness",
  "collaboration",
  "workspace-arrangement",
] as const;

export const STUDIO_SHELL_FLOATING_SURFACE_IDS = [
  "workspace-switcher",
  "document-tools",
  "document-tools-panel",
  "draft-save-status",
  "drawing-options",
  "drawing-input",
  "drawing-input-panel",
  "offline-readiness",
  "collaboration",
  "workspace-arrangement",
] as const;

export type StudioShellFloatingVisibilityId =
  (typeof STUDIO_SHELL_FLOATING_VISIBILITY_IDS)[number];
export type StudioShellFloatingSurfaceId =
  (typeof STUDIO_SHELL_FLOATING_SURFACE_IDS)[number];

export type StudioShellFloatingPresetId =
  | "all"
  | "canvas-focus"
  | "production"
  | "collaboration";

export interface StudioShellFloatingVisibilityState {
  readonly version: typeof STUDIO_SHELL_FLOATING_VISIBILITY_VERSION;
  readonly hidden: readonly StudioShellFloatingVisibilityId[];
  readonly autoHideDuringStroke: boolean;
}

export type StudioShellFloatingStrokePresentation = "visible" | "hidden" | "compact";

export interface StudioShellFloatingSurfaceDefinition {
  readonly id: StudioShellFloatingSurfaceId;
  readonly visibilityId: StudioShellFloatingVisibilityId;
  readonly label: string;
  readonly description: string;
  readonly selector: string;
  readonly defaultLayout: StudioFloatingSurfaceLayout;
  readonly positionMinWidth: number;
  readonly insetTop: number;
  readonly insetRight: number;
  readonly insetBottom: number;
  readonly insetLeft: number;
  readonly minWidth: number;
  readonly minHeight: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly zIndexFloor: number;
  readonly resizable: boolean;
  readonly applySize: boolean;
  readonly duringStroke: "hide" | "keep";
  readonly forcedDuringStroke?: "visible" | "compact";
  readonly safetyBehavior?: string;
}

const VISIBILITY_ID_SET = new Set<string>(STUDIO_SHELL_FLOATING_VISIBILITY_IDS);

function layout(
  xRatio: number,
  yRatio: number,
  width: number,
  height: number,
  dock: StudioFloatingSurfaceLayout["dock"],
): StudioFloatingSurfaceLayout {
  return Object.freeze({
    version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
    xRatio,
    yRatio,
    width,
    height,
    dock,
    positionLocked: false,
    sizeLocked: false,
  });
}

/**
 * Persistent, non-modal Studio chrome that sits above the drawing document.
 *
 * Inspector, pages, tool rail, drawing palettes, Navigator and reference panels are deliberately
 * not duplicated here: they already participate in StudioWorkspaceRegion / StudioFloatingSurface.
 * Modal dialogs, toasts, loading and recovery UI remain excluded so users cannot hide a required
 * decision or safety message by accident.
 */
export const STUDIO_SHELL_FLOATING_SURFACES: readonly StudioShellFloatingSurfaceDefinition[] =
  Object.freeze([
    {
      id: "workspace-switcher",
      visibilityId: "workspace-switcher",
      label: "작업공간 · 웹툰/드로잉",
      description: "웹툰, 드로잉, 디자인 등 현재 문서 작업공간을 전환하는 상단 바",
      selector: '[data-studio-document-window-hub-bar="true"]',
      defaultLayout: layout(0.5, 0, 672, 60, "top"),
      positionMinWidth: 768,
      insetTop: 52,
      insetRight: 12,
      insetBottom: 12,
      insetLeft: 12,
      minWidth: 280,
      minHeight: 44,
      maxWidth: 900,
      maxHeight: 120,
      zIndexFloor: 60,
      resizable: false,
      applySize: false,
      duringStroke: "hide",
    },
    {
      id: "document-tools",
      visibilityId: "document-tools",
      label: "문서 도구",
      description: "웹툰 원고 도구, 디자인 검사 등 문서별 보조 도구를 여는 버튼",
      selector: '[data-studio-shell-floating-target="document-tools"]',
      defaultLayout: layout(1, 0, 150, 44, "top"),
      positionMinWidth: 768,
      insetTop: 8,
      insetRight: 12,
      insetBottom: 12,
      insetLeft: 12,
      minWidth: 44,
      minHeight: 44,
      maxWidth: 280,
      maxHeight: 96,
      zIndexFloor: 119,
      resizable: false,
      applySize: false,
      duringStroke: "hide",
    },
    {
      id: "document-tools-panel",
      visibilityId: "document-tools",
      label: "웹툰 원고 도구 · 문서 보조 패널",
      description: "열린 문서 도구의 위치와 크기. 모바일에서는 안전한 전체 시트 배치를 유지합니다.",
      selector: "[data-studio-document-workspace-dock]",
      defaultLayout: layout(1, 0.08, 736, 720, "right"),
      positionMinWidth: 640,
      insetTop: 64,
      insetRight: 12,
      insetBottom: 12,
      insetLeft: 12,
      minWidth: 360,
      minHeight: 320,
      maxWidth: 1_080,
      maxHeight: 1_100,
      zIndexFloor: 118,
      resizable: true,
      applySize: true,
      duringStroke: "hide",
    },
    {
      id: "draft-save-status",
      visibilityId: "draft-save-status",
      label: "저장 상태 · 초안 저장 센터",
      description: "기기 체크포인트, 서버 자동 저장과 revision 상태",
      selector: "[data-studio-draft-save-center]",
      defaultLayout: layout(1, 0.14, 280, 48, "right"),
      positionMinWidth: 768,
      insetTop: 64,
      insetRight: 12,
      insetBottom: 12,
      insetLeft: 12,
      minWidth: 180,
      minHeight: 44,
      maxWidth: 440,
      maxHeight: 760,
      zIndexFloor: 58,
      resizable: false,
      applySize: false,
      duringStroke: "hide",
      forcedDuringStroke: "visible",
      safetyBehavior: "저장 실패나 복구 경고가 있으면 숨김 설정과 관계없이 자동으로 표시됩니다.",
    },
    {
      id: "drawing-options",
      visibilityId: "drawing-options",
      label: "그리기 옵션",
      description: "브러시·지우개·도형·크기·불투명도를 조절하는 하단 옵션 바",
      selector: '[data-studio-draw-options-dock="true"]',
      defaultLayout: layout(0.5, 1, 900, 64, "bottom"),
      positionMinWidth: 1_024,
      insetTop: 64,
      insetRight: 12,
      insetBottom: 12,
      insetLeft: 12,
      minWidth: 320,
      minHeight: 60,
      maxWidth: 1_536,
      maxHeight: 120,
      zIndexFloor: 40,
      resizable: false,
      applySize: true,
      duringStroke: "hide",
    },
    {
      id: "drawing-input",
      visibilityId: "drawing-input",
      label: "펜 입력 센터",
      description: "펜·터치 장치 진단과 작업별 보정 프로필을 여는 버튼",
      selector: '[data-studio-drawing-input-deck-trigger="true"]',
      defaultLayout: layout(1, 0.86, 132, 44, "right"),
      positionMinWidth: 768,
      insetTop: 64,
      insetRight: 12,
      insetBottom: 72,
      insetLeft: 12,
      minWidth: 44,
      minHeight: 44,
      maxWidth: 260,
      maxHeight: 96,
      zIndexFloor: 72,
      resizable: false,
      applySize: false,
      duringStroke: "hide",
    },
    {
      id: "drawing-input-panel",
      visibilityId: "drawing-input",
      label: "펜 입력 센터 · 상세 패널",
      description: "열린 입력 장치 진단·보정 패널의 위치와 크기",
      selector: '[data-studio-drawing-input-deck-panel="true"],[data-studio-drawing-input-deck-pending="true"]',
      defaultLayout: layout(1, 0.32, 400, 560, "right"),
      positionMinWidth: 768,
      insetTop: 64,
      insetRight: 12,
      insetBottom: 72,
      insetLeft: 12,
      minWidth: 340,
      minHeight: 320,
      maxWidth: 620,
      maxHeight: 900,
      zIndexFloor: 73,
      resizable: true,
      applySize: true,
      duringStroke: "hide",
    },
    {
      id: "offline-readiness",
      visibilityId: "offline-readiness",
      label: "오프라인 자동 준비",
      description: "연결 상태, 오프라인 리소스 준비와 로컬 작업 안내",
      selector: '[data-studio-shell-floating-target="offline-readiness"]',
      defaultLayout: layout(1, 0.72, 400, 58, "right"),
      positionMinWidth: 768,
      insetTop: 64,
      insetRight: 12,
      insetBottom: 88,
      insetLeft: 12,
      minWidth: 240,
      minHeight: 44,
      maxWidth: 520,
      maxHeight: 760,
      zIndexFloor: 40,
      resizable: false,
      applySize: false,
      duringStroke: "hide",
      forcedDuringStroke: "visible",
      safetyBehavior: "연결 장애 또는 저장 공간 경고가 있으면 숨김 설정과 관계없이 자동으로 표시됩니다.",
    },
    {
      id: "collaboration",
      visibilityId: "collaboration",
      label: "채팅 · 통화",
      description: "P2P 채팅, 음성·화상 통화와 화면 공유",
      selector: '[data-studio-shell-floating-target="collaboration"]',
      defaultLayout: layout(1, 1, 360, 48, "right"),
      positionMinWidth: 768,
      insetTop: 64,
      insetRight: 12,
      insetBottom: 12,
      insetLeft: 12,
      minWidth: 180,
      minHeight: 44,
      maxWidth: 480,
      maxHeight: 820,
      zIndexFloor: 65,
      resizable: false,
      applySize: false,
      duringStroke: "hide",
      forcedDuringStroke: "compact",
      safetyBehavior: "통화에 참여한 동안에는 종료·음소거 제어를 잃지 않도록 자동으로 표시됩니다.",
    },
    {
      id: "workspace-arrangement",
      visibilityId: "workspace-arrangement",
      label: "배치 편집 도구",
      description: "열린 패널을 정렬하고 현재 배치를 저장·복원하는 데스크톱 도구",
      selector: '[data-studio-shell-floating-target="workspace-arrangement"]',
      defaultLayout: layout(1, 1, 240, 52, "bottom"),
      positionMinWidth: 1_024,
      insetTop: 64,
      insetRight: 12,
      insetBottom: 12,
      insetLeft: 12,
      minWidth: 120,
      minHeight: 44,
      maxWidth: 720,
      maxHeight: 120,
      zIndexFloor: 69,
      resizable: false,
      applySize: false,
      duringStroke: "hide",
      forcedDuringStroke: "visible",
      safetyBehavior: "기존 배치 도구에서 편집 중일 때는 완료·취소 동선을 위해 자동 표시됩니다.",
    },
  ] satisfies readonly StudioShellFloatingSurfaceDefinition[]);

export const DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY: StudioShellFloatingVisibilityState =
  Object.freeze({
    version: STUDIO_SHELL_FLOATING_VISIBILITY_VERSION,
    hidden: Object.freeze([]),
    autoHideDuringStroke: true,
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function freezeVisibility(
  hidden: readonly StudioShellFloatingVisibilityId[],
  autoHideDuringStroke = true,
): StudioShellFloatingVisibilityState {
  return Object.freeze({
    version: STUDIO_SHELL_FLOATING_VISIBILITY_VERSION,
    hidden: Object.freeze([...hidden]),
    autoHideDuringStroke,
  });
}

export function normalizeStudioShellFloatingVisibility(
  raw: unknown,
  fallback: StudioShellFloatingVisibilityState = DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY,
): StudioShellFloatingVisibilityState {
  if (!isRecord(raw)) {
    return freezeVisibility(fallback.hidden, fallback.autoHideDuringStroke);
  }
  if (raw.version !== 1 && raw.version !== STUDIO_SHELL_FLOATING_VISIBILITY_VERSION) {
    return freezeVisibility(fallback.hidden, fallback.autoHideDuringStroke);
  }
  const rawHidden = Array.isArray(raw.hidden) ? raw.hidden : [];
  const hidden = new Set<StudioShellFloatingVisibilityId>();
  for (const candidate of rawHidden) {
    if (typeof candidate === "string" && VISIBILITY_ID_SET.has(candidate)) {
      hidden.add(candidate as StudioShellFloatingVisibilityId);
    }
  }
  const autoHideDuringStroke = raw.version === 1
    ? true
    : typeof raw.autoHideDuringStroke === "boolean"
      ? raw.autoHideDuringStroke
      : fallback.autoHideDuringStroke;
  return freezeVisibility(
    STUDIO_SHELL_FLOATING_VISIBILITY_IDS.filter((id) => hidden.has(id)),
    autoHideDuringStroke,
  );
}

export function encodeStudioShellFloatingVisibility(
  state: StudioShellFloatingVisibilityState,
): string {
  return JSON.stringify(normalizeStudioShellFloatingVisibility(state));
}

export function studioShellFloatingVisibilityEqual(
  left: StudioShellFloatingVisibilityState,
  right: StudioShellFloatingVisibilityState,
): boolean {
  const a = normalizeStudioShellFloatingVisibility(left);
  const b = normalizeStudioShellFloatingVisibility(right);
  return a.autoHideDuringStroke === b.autoHideDuringStroke
    && a.hidden.length === b.hidden.length
    && a.hidden.every((id, index) => id === b.hidden[index]);
}

export function isStudioShellFloatingSurfaceVisible(
  state: StudioShellFloatingVisibilityState,
  id: StudioShellFloatingVisibilityId,
): boolean {
  return !normalizeStudioShellFloatingVisibility(state).hidden.includes(id);
}

export function setStudioShellFloatingSurfaceVisible(
  state: StudioShellFloatingVisibilityState,
  id: StudioShellFloatingVisibilityId,
  visible: boolean,
): StudioShellFloatingVisibilityState {
  const normalized = normalizeStudioShellFloatingVisibility(state);
  const hidden = new Set(normalized.hidden);
  if (visible) hidden.delete(id);
  else hidden.add(id);
  return freezeVisibility(
    STUDIO_SHELL_FLOATING_VISIBILITY_IDS.filter((candidate) => hidden.has(candidate)),
    normalized.autoHideDuringStroke,
  );
}

export function setStudioShellFloatingAutoHideDuringStroke(
  state: StudioShellFloatingVisibilityState,
  autoHideDuringStroke: boolean,
): StudioShellFloatingVisibilityState {
  const normalized = normalizeStudioShellFloatingVisibility(state);
  return freezeVisibility(normalized.hidden, autoHideDuringStroke);
}

export function applyStudioShellFloatingPreset(
  preset: StudioShellFloatingPresetId,
  autoHideDuringStroke = DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY.autoHideDuringStroke,
): StudioShellFloatingVisibilityState {
  switch (preset) {
    case "canvas-focus":
      return freezeVisibility([
        "document-tools",
        "draft-save-status",
        "drawing-options",
        "drawing-input",
        "offline-readiness",
        "collaboration",
        "workspace-arrangement",
      ], autoHideDuringStroke);
    case "production":
      return freezeVisibility(["collaboration"], autoHideDuringStroke);
    case "collaboration":
      return freezeVisibility([
        "drawing-options",
        "drawing-input",
        "offline-readiness",
      ], autoHideDuringStroke);
    case "all":
    default:
      return autoHideDuringStroke
        ? DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY
        : freezeVisibility([], false);
  }
}

export function hideAllStudioShellFloatingSurfaces(
  autoHideDuringStroke = DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY.autoHideDuringStroke,
): StudioShellFloatingVisibilityState {
  return freezeVisibility(STUDIO_SHELL_FLOATING_VISIBILITY_IDS, autoHideDuringStroke);
}

export function resolveStudioShellFloatingStrokePresentation(
  definition: StudioShellFloatingSurfaceDefinition,
  input: {
    readonly phase: StudioShellStrokeFocusPhase;
    readonly autoHideDuringStroke: boolean;
    readonly forceVisible: boolean;
    readonly arranging: boolean;
  },
): StudioShellFloatingStrokePresentation {
  if (!input.autoHideDuringStroke || input.phase === "idle" || input.arranging) {
    return "visible";
  }
  if (input.forceVisible) return definition.forcedDuringStroke ?? "visible";
  return definition.duringStroke === "hide" ? "hidden" : "visible";
}

export function studioShellFloatingSurfaceById(
  id: StudioShellFloatingSurfaceId,
): StudioShellFloatingSurfaceDefinition {
  const definition = STUDIO_SHELL_FLOATING_SURFACES.find((surface) => surface.id === id);
  if (!definition) throw new RangeError(`Unknown Studio shell floating surface: ${id}`);
  return definition;
}
