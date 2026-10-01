import { useCallback, useEffect, useRef, useState } from "react";

import { getMyProfile } from "@/platform/me-client";
import { creatorRoleLens, type CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useApp } from "@/shared/lib/store";

/**
 * 제작 화면의 "내 역할" 관점. 로그인 사용자는 프로필의 현재 창작 역할로 시작하고,
 * 사용자가 직접 바꾸면 이후 프로필 응답이 늦게 도착해도 덮어쓰지 않는다.
 */
export function usePreferredRoleLens(fallback: CreatorRoleLens): readonly [CreatorRoleLens, (next: CreatorRoleLens) => void] {
  const userId = useApp((state) => state.userId);
  const [roleLens, setRoleLens] = useState<CreatorRoleLens>(fallback);
  const manuallyChanged = useRef(false);

  useEffect(() => {
    manuallyChanged.current = false;
    if (!userId) {
      setRoleLens(fallback);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    getMyProfile(controller.signal)
      .then((profile) => {
        if (!alive || manuallyChanged.current) return;
        const role = profile.creatorRoleProfile.activeRole ?? profile.creatorRoleProfile.primaryRole;
        setRoleLens(creatorRoleLens(role));
      })
      .catch(() => {
        // 프로필을 읽지 못해도 기본 관점으로 계속 사용할 수 있다.
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [fallback, userId]);

  const changeRoleLens = useCallback((next: CreatorRoleLens) => {
    manuallyChanged.current = true;
    setRoleLens(next);
  }, []);

  return [roleLens, changeRoleLens];
}

const ROLE_LENS_VALUES: readonly CreatorRoleLens[] = ["story", "art", "producer"];

export function parseRoleLens(value: string): CreatorRoleLens | null {
  return ROLE_LENS_VALUES.find((entry) => entry === value) ?? null;
}
