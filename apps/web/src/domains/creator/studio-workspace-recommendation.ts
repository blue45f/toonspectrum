import { creatorRoleWorkspacePreset } from "./creator-role-workspace-presets";
import type {
  StudioDefaultWorkspace,
  StudioDefaultWorkspaceId,
  StudioWorkspaceId,
} from "./studio-workspaces";

import {
  creatorRoleDefinition,
  creatorText,
  type CreatorRoleId,
} from "@/shared/lib/creator-role-contract";

export const STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION = Object.freeze({
  id: "simple-start-layout",
  workspaceId: "quick-sketch",
  description:
    "처음이라면 가장 단순한 화면으로 시작하세요. 캔버스와 핵심 그리기 동작에 집중하고, 레이어·세부 설정은 필요할 때 다시 열 수 있습니다.",
  detail: "캔버스 우선 · 되돌리기 · 펜 · 지우개 중심",
  actionLabel: "간편 화면으로 시작",
  badgeLabel: "처음이라면 추천",
  notice: "언제든 다른 작업공간으로 바꿀 수 있어요",
} as const);

export const STUDIO_CLIP_WORKSPACE_RECOMMENDATION = Object.freeze({
  id: "clip-studio-layout",
  workspaceId: "csp-migration",
  description:
    "클립 스튜디오에서 익숙했던 레이어 중심 동선을 유지하면서 좌우 도크를 줄여 캔버스 우선 환경으로 바로 시작합니다.",
  detail: "왼쪽 페이지 · 오른쪽 레이어·속성 · 캔버스 우선 배치",
  actionLabel: "이 배치 사용",
  searchAliases: Object.freeze([
    "CSP",
    "Clip Studio",
    "클립스튜디오",    "클립 스튜디오",
    "클튜",
    "이주",
    "전환",
  ]),
} as const);

export interface ResolvedStudioWorkspaceRecommendation {
  readonly id: string;
  readonly workspaceId: StudioDefaultWorkspaceId;
  readonly workspace: StudioDefaultWorkspace;
  readonly description: string;
  readonly detail: string;
  readonly actionLabel: string;
  readonly badgeLabel: string;
  readonly notice: string;
  readonly creatorRole?: CreatorRoleId;
}

/** Search vocabulary stays presentation-only; persisted workspace records remain unchanged. */
export function studioWorkspaceSearchAliases(workspaceId: string): readonly string[] {
  return workspaceId === STUDIO_CLIP_WORKSPACE_RECOMMENDATION.workspaceId
    ? STUDIO_CLIP_WORKSPACE_RECOMMENDATION.searchAliases
    : workspaceId === STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION.workspaceId
      ? ["간편", "간단", "초보", "처음", "스케치", "집중", "simple", "quick"]
      : [];
}

function resolveRoleRecommendation(
  workspaces: readonly StudioDefaultWorkspace[],
  activeWorkspaceId: StudioWorkspaceId,
  role: CreatorRoleId | null | undefined,
): ResolvedStudioWorkspaceRecommendation | null {
  const preset = creatorRoleWorkspacePreset(role);
  if (!preset || preset.workspaceId === activeWorkspaceId || !role) return null;  const workspace = workspaces.find((candidate) => candidate.id === preset.workspaceId);
  const definition = creatorRoleDefinition(role);
  if (!workspace || !definition) return null;
  const roleLabel = creatorText(definition.shortLabel, "ko");
  return {
    id: `creator-role-${role}`,
    workspaceId: preset.workspaceId,
    workspace,
    description: `${roleLabel} 작업에서 자주 쓰는 도구를 먼저 배치합니다. ${preset.reason}`,
    detail: `${roleLabel} 관점 · ${workspace.description}`,
    actionLabel: `${workspace.name} 배치 사용`,
    badgeLabel: "내 직무에 맞춘 추천",
    notice: "추천을 적용해도 저장된 사용자 배치는 덮어쓰지 않습니다",
    creatorRole: role,
  };
}

/**
 * Recommends a role-specific built-in workspace first. Users without a role keep
 * the lowest-complexity first-run recommendation. The recommendation never
 * changes project authorization or silently applies a layout.
 */
export function resolveStudioWorkspaceRecommendation(
  workspaces: readonly StudioDefaultWorkspace[],
  activeWorkspaceId: StudioWorkspaceId,
  role?: CreatorRoleId | null,
): ResolvedStudioWorkspaceRecommendation | null {
  const roleRecommendation = resolveRoleRecommendation(
    workspaces,
    activeWorkspaceId,
    role,
  );
  if (roleRecommendation) return roleRecommendation;
  if (activeWorkspaceId === STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION.workspaceId) return null;
  const workspace = workspaces.find(
    (candidate) => candidate.id === STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION.workspaceId,
  );
  if (!workspace) return null;  return {
    ...STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION,
    workspace,
  };
}
