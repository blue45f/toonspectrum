import { useMemo } from "react";

import {
  creatorRoleNotificationSettings,
  DEFAULT_CREATOR_ROLE_WORKSPACE_KEY,
  type CreatorRoleNotificationEvent,
} from "@/shared/lib/creator-role-workspace-contract";
import { useCreatorRoleWorkspace } from "@/shared/lib/use-creator-role-workspace";

import { useSession } from "@/domains/auth/public/session/auth-session-store";

/**
 * 알림 표시 층이 참조할 직군 알림 설정을 기본 워크스페이스 문서에서 도출한다.
 *
 * 개인화 센터는 현재 라우트를 해석한 문서를 편집하는데, 기본 진입 표면(라이브러리)과
 * 알림 센터는 둘 다 기본 키("draft")로 해석되므로 같은 문서를 읽어야 편집이 닿는다.
 * 다음 경우에는 설정을 적용하지 않고 null을 돌려준다(fail-open — 아무것도 숨기지 않음):
 * - 비인증 세션 (문서를 로드하지 않는다)
 * - 문서가 아직 기본값 스냅샷인 동안 (로드 중 알림이 깜빡이며 사라지지 않게)
 * - 직군 미선택(activeRole 없음) — 프리셋 기본값이 조용히 알림을 숨기지 않게
 */
export type RoleNotificationSettingsState =
  | "loading"
  | "signed-out"
  | "no-role"
  | "ready";

export function useRoleNotificationSettings(): {
  readonly settings: Readonly<Record<CreatorRoleNotificationEvent, boolean>> | null;
  readonly state: RoleNotificationSettingsState;
} {
  const { ready, status } = useSession();
  const authenticated = ready && status === "authenticated";
  const workspace = useCreatorRoleWorkspace(
    DEFAULT_CREATOR_ROLE_WORKSPACE_KEY,
    null,
    authenticated,
  );
  const { snapshot } = workspace;
  const settings = useMemo(() => {
    if (!authenticated) return null;
    if (snapshot.source === "default") return null;
    const document = snapshot.document;
    if (!document.activeRole) return null;
    return creatorRoleNotificationSettings(document.activeRole, document);
  }, [authenticated, snapshot]);
  const state: RoleNotificationSettingsState = !ready
    ? "loading"
    : status !== "authenticated"
      ? "signed-out"
      : snapshot.source === "default"
        ? "loading"
        : settings
          ? "ready"
          : "no-role";
  return { settings, state };
}
