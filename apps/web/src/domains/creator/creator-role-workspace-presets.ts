import type { StudioDefaultWorkspaceId } from "./studio-workspaces";

import type {
  CreatorRoleId,
  CreatorRoleOperationalLens,
} from "@/shared/lib/creator-role-contract";

export interface CreatorRoleWorkspacePreset {
  readonly workspaceId: StudioDefaultWorkspaceId;
  readonly operationalLens: CreatorRoleOperationalLens;
  readonly reason: string;
}

const ROLE_WORKSPACE_PRESETS: Readonly<
  Record<CreatorRoleId, CreatorRoleWorkspacePreset>
> = {
  creator: {
    workspaceId: "pro-comic",
    operationalLens: "production",
    reason: "기획·작화·검수·게시를 한 흐름으로 이어갑니다.",
  },
  story: {
    workspaceId: "storyboard",
    operationalLens: "story",
    reason: "대본과 컷 흐름을 함께 확인합니다.",
  },
  planner: {
    workspaceId: "storyboard",
    operationalLens: "planning",
    reason: "작품 기준과 장면 구성을 먼저 확인합니다.",
  },
  storyboard: {
    workspaceId: "storyboard",
    operationalLens: "storyboard",
    reason: "컷 구성과 스크롤 흐름에 집중합니다.",
  },
  "line-art": {
    workspaceId: "lineart",
    operationalLens: "drawing",
    reason: "펜·지우개·레이어 동선을 가까이 둡니다.",
  },
  background: {
    workspaceId: "pose-3d",
    operationalLens: "background",
    reason: "장면·카메라·3D 배경 자산을 우선합니다.",
  },
  color: {
    workspaceId: "coloring",
    operationalLens: "color-finishing",
    reason: "팔레트·채우기·후보정 도구를 우선합니다.",
  },
  lettering: {
    workspaceId: "lettering",
    operationalLens: "lettering",
    reason: "말풍선·대사·효과음 편집을 우선합니다.",
  },
  character: {
    workspaceId: "lineart",
    operationalLens: "drawing",
    reason: "캐릭터 연기와 선화 작업에 집중합니다.",
  },
  "three-d": {
    workspaceId: "pose-3d",
    operationalLens: "background",
    reason: "포즈·카메라·공간 구성을 먼저 엽니다.",
  },
  educator: {
    workspaceId: "storyboard",
    operationalLens: "planning",
    reason: "교육용 예제와 제작 단계를 함께 설명하기 좋은 작업공간을 엽니다.",
  },
  assistant: {
    workspaceId: "lineart",
    operationalLens: "drawing",
    reason: "담당 컷과 반복 작업 도구를 빠르게 엽니다.",
  },
  editor: {
    workspaceId: "review",
    operationalLens: "review",
    reason: "검수·수정 요청·버전 비교를 우선합니다.",
  },
  producer: {
    workspaceId: "publish",
    operationalLens: "production",
    reason: "일정·승인·게시 준비 상태를 우선합니다.",
  },
  localization: {
    workspaceId: "lettering",
    operationalLens: "lettering",
    reason: "번역 대사와 말풍선 적합성을 함께 확인합니다.",
  },
  reviewer: {
    workspaceId: "review",
    operationalLens: "review",
    reason: "오류·수정 요청·승인 여부를 우선합니다.",
  }};

export function creatorRoleWorkspacePreset(
  role: CreatorRoleId | null | undefined,
): CreatorRoleWorkspacePreset | null {
  return role ? ROLE_WORKSPACE_PRESETS[role] : null;
}

export function creatorRoleWorkspacePresetId(
  role: CreatorRoleId | null | undefined,
): StudioDefaultWorkspaceId | null {
  return creatorRoleWorkspacePreset(role)?.workspaceId ?? null;
}

export function creatorRoleWorkspacePresetOptions(
  roles: readonly CreatorRoleId[],
): readonly CreatorRoleWorkspacePreset[] {
  const seen = new Set<StudioDefaultWorkspaceId>();
  const result: CreatorRoleWorkspacePreset[] = [];
  for (const role of roles) {
    const preset = ROLE_WORKSPACE_PRESETS[role];
    if (seen.has(preset.workspaceId)) continue;
    seen.add(preset.workspaceId);
    result.push(preset);
  }
  return result;
}
