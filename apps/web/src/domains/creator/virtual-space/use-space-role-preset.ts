import { useEffect, useMemo, useState } from "react";

import { getMyProfile, type MeProfile } from "@/platform/me-client";
import {
  creatorRoleDefinition,
  type CreatorRoleDefinition,
  type CreatorRoleId,
} from "@/shared/lib/creator-role-contract";
import { GLOBAL_CREATOR_ROLE_WORKSPACE_KEY } from "@/shared/lib/creator-role-workspace-contract";
import { useCreatorRoleWorkspace } from "@/shared/lib/use-creator-role-workspace";

import {
  studioVirtualSpaceRolePreset,
  type StudioVirtualSpaceRolePreset,
} from "./studio-virtual-space-role-preset";

export interface SpaceRolePreset {
  /** 프로필 조회를 한 번이라도 시도했는지. 실패(게스트)도 true가 된다. */
  readonly attempted: boolean;
  readonly userId: string | null;
  readonly activeRole: CreatorRoleId | null;
  readonly definition: CreatorRoleDefinition | null;
  /** 사용자가 직접 정한 직군 표시명. 없으면 null이라 정의의 짧은 이름을 쓴다. */
  readonly customRoleLabel: string | null;
  readonly preset: StudioVirtualSpaceRolePreset;
}

/**
 * 가상스튜디오가 읽는 내 직군 상태.
 *
 * 정본은 전역 직군 워크스페이스 문서(`activeRole`)이며, 문서가 비어 있으면
 * 프로필의 활성 직군·주 직군 순으로 채운다 (개인화 센터와 같은 해석 순서).
 * 프로필을 못 읽는 게스트는 attempted만 true가 되고 직군 차별화는 전부 꺼진다.
 * 직군은 표시·추천용 프리셋일 뿐 어떤 공간이나 기능을 막지 않는다.
 */
export function useSpaceRolePreset(personal: boolean): SpaceRolePreset {
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyProfile()
      .then((value) => {
        if (!alive) return;
        setProfile(value);
        setAttempted(true);
      })
      .catch(() => {
        if (alive) setAttempted(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const workspace = useCreatorRoleWorkspace(
    GLOBAL_CREATOR_ROLE_WORKSPACE_KEY,
    profile?.creatorRoleProfile,
    profile !== null,
  );

  return useMemo<SpaceRolePreset>(() => {
    const document = workspace.snapshot.document;
    const activeRole = document.activeRole
      ?? profile?.creatorRoleProfile.activeRole
      ?? profile?.creatorRoleProfile.primaryRole
      ?? null;
    return {
      attempted,
      userId: profile?.id ?? null,
      activeRole,
      definition: creatorRoleDefinition(activeRole),
      customRoleLabel: document.customRoleLabel,
      preset: studioVirtualSpaceRolePreset(activeRole, personal),
    };
  }, [attempted, personal, profile, workspace.snapshot.document]);
}
