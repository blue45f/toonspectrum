/**
 * 조용한 구역 마이크 중재 바인딩 (죽은 동선 배선).
 *
 * 소유권 규칙 — 페이지가 유일한 소유자다.
 * - 오피스 존(silent 플래그)·타일 silent 구역·녹음부스 구역을 한 훅으로 묶어
 *   `useStudioVirtualSpaceSilentZone`의 `effectiveMuted`를 실제 근접 미디어
 *   마이크에 적용한다. 녹음부스 패널은 더 이상 마이크를 직접 구동하지 않고
 *   (패널 개폐가 소유권을 바꾸지 않는다), 표시용 뱃지 상태만 내부에서 계산한다.
 * - `userMicMuted`는 사용자가 직접 토글한 의도다. 장치 실측값(자동 음소가 섞인
 *   값)을 넣으면 퇴장 시 복원이 깨지므로 호출자가 의도를 따로 추적한다.
 * - 적용은 토글 방식이라 "목표값과 실측값이 다를 때만" 토글한다. 구역 안에서
 *   사용자가 직접 마이크를 켜면 effectiveMuted가 변하지 않아 재적용되지 않으므로
 *   사용자 오버라이드가 구역 퇴장 전까지 유지된다.
 * - 근접 미디어가 구역 안에서 시작되면(연결 전 → 연결됨 전이) 구역 음소를
 *   그 시점에 한 번 적용한다.
 */

import { useEffect, useRef } from "react";

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioOfficeZone } from "./studio-virtual-space-office-zones";
import type { StudioSilentZone } from "./studio-virtual-space-silent-zone";
import {
  useStudioVirtualSpaceSilentZone,
  type StudioVirtualSpaceSilentZoneBinding,
} from "./use-studio-virtual-space-silent-zone";

export interface UseStudioVirtualSpaceZoneMicInput {
  readonly officeZones: readonly StudioOfficeZone[];
  /** 타일 silent 구역 + 녹음부스 구역 등 StudioSilentZone 형태의 추가 구역. */
  readonly tileZones?: readonly StudioSilentZone[];
  readonly position: StudioVirtualSpacePoint | null;
  /** 사용자가 직접 정한 마이크 음소 의도. 장치 실측값이 아니다. */
  readonly userMicMuted: boolean;
  /** 근접 미디어 마이크 실측 음소값. 연결 전이면 null. */
  readonly micMuted: boolean | null;
  /** 실제 마이크 토글. 목표값과 실측값이 다를 때만 호출된다. */
  readonly onToggleMic: () => void;
}

export function useStudioVirtualSpaceZoneMic(
  input: UseStudioVirtualSpaceZoneMicInput,
): StudioVirtualSpaceSilentZoneBinding {
  const { officeZones, tileZones, position, userMicMuted } = input;
  const silent = useStudioVirtualSpaceSilentZone({ officeZones, tileZones, position, micMutedByUser: userMicMuted });
  const { effectiveMuted, mutedByZone } = silent;

  const micMutedRef = useRef(input.micMuted);
  micMutedRef.current = input.micMuted;
  const toggleRef = useRef(input.onToggleMic);
  toggleRef.current = input.onToggleMic;

  const applyDesired = (muted: boolean) => {
    if (micMutedRef.current !== null && micMutedRef.current !== muted) toggleRef.current();
  };

  // 구역 전이로 목표 음소값이 바뀔 때만 적용한다 (사용자 직접 토글과 경합 방지).
  const lastDesiredRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastDesiredRef.current === effectiveMuted) return;
    lastDesiredRef.current = effectiveMuted;
    applyDesired(effectiveMuted);
  }, [effectiveMuted]);

  // 근접 미디어가 구역 안에서 시작되면 구역 음소를 그 시점에 적용한다.
  const wasLiveRef = useRef(false);
  useEffect(() => {
    const live = input.micMuted !== null;
    if (live && !wasLiveRef.current && mutedByZone) applyDesired(true);
    wasLiveRef.current = live;
  }, [input.micMuted, mutedByZone]);

  return silent;
}
